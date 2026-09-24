// ============================================================================
// DANUBRA — súradnice a vzdialenosti
// ============================================================================
// Appka sama nikam nevolá. Žiadne geokódovanie, žiadna služba, ktorá by
// potrebovala kľúč a raz prestala fungovať — súradnice sa vytiahnu z toho,
// čo človek vloží: odkaz z Google Máp, z OpenStreetMap alebo rovno dvojica
// čísel. Presne to, čo sa aj tak posiela vodičovi do správy.
//
// Vzdialenosť ubytovania od stavby nie je ozdoba: cesta tam a späť je denný
// náklad a v praxi rozhoduje, či sa to ubytovanie oplatí. Počíta sa
// vzdušnou čiarou — po ceste to bude vždy viac, a tak to aj treba čítať.
//
// Testy: node danubra/lib/geo.test.js
// ============================================================================
(function () {
  /** Je to platná zemepisná poloha? Nula-nula je skoro vždy omyl. */
  function valid(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      && !(lat === 0 && lng === 0);
  }

  const num = (s) => Number(String(s).replace(',', '.'));

  /**
   * Vytiahne súradnice z vloženého textu.
   *
   * Rozumie:
   *   48.1486, 17.1077           — dvojica čísel
   *   48,1486 17,1077            — s desatinnou čiarkou, oddelené medzerou
   *   .../maps/@48.1486,17.1077,15z
   *   .../maps/place/Meno/@48.1486,17.1077,17z/...!3d48.1486!4d17.1077
   *   .../maps?q=48.1486,17.1077
   *   .../?mlat=48.1486&mlon=17.1077   (OpenStreetMap)
   *   .../#map=15/48.1486/17.1077      (OpenStreetMap)
   *   geo:48.1486,17.1077
   *
   * @returns {{lat:number, lng:number}|null}
   */
  function parseCoords(input) {
    const text = String(input == null ? '' : input).trim();
    if (!text) return null;

    // Najpresnejší zápis v odkazoch z Google Máp: !3d<lat>!4d<lng>.
    // Je to poloha samotného miesta, nie stred výrezu, tak má prednosť.
    const bang = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bang) {
      const lat = Number(bang[1]), lng = Number(bang[2]);
      if (valid(lat, lng)) return { lat, lng };
    }

    // OpenStreetMap: značka v adrese.
    const mlat = text.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/);
    const mlon = text.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/);
    if (mlat && mlon) {
      const lat = Number(mlat[1]), lng = Number(mlon[1]);
      if (valid(lat, lng)) return { lat, lng };
    }

    // OpenStreetMap: #map=zoom/lat/lng
    const osm = text.match(/#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
    if (osm) {
      const lat = Number(osm[1]), lng = Number(osm[2]);
      if (valid(lat, lng)) return { lat, lng };
    }

    // Google Maps: @lat,lng[,zoom]
    const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      const lat = Number(at[1]), lng = Number(at[2]);
      if (valid(lat, lng)) return { lat, lng };
    }

    // ?q=lat,lng  /  ?query=lat,lng  /  ?ll=lat,lng  /  geo:lat,lng
    // `query` je tvar, ktorý vyrába `mapsUrl()` nižšie — čo appka zapíše,
    // musí vedieť aj prečítať. Chýbalo to a odhalil to až test.
    const q = text.match(/(?:[?&](?:q|query|ll|daddr|saddr)=|geo:)(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (q) {
      const lat = Number(q[1]), lng = Number(q[2]);
      if (valid(lat, lng)) return { lat, lng };
    }

    // Holá dvojica čísel. Berie sa len vtedy, keď v texte **nie sú iné
    // čísla** — inak by skrátený odkaz alebo adresa s číslom domu dali
    // náhodnú polohu.
    if (!/https?:\/\//i.test(text)) {
      const pair = text.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
      if (pair) {
        const lat = num(pair[1]), lng = num(pair[2]);
        if (valid(lat, lng)) return { lat, lng };
      }
    }
    return null;
  }

  /** Vzdušná vzdialenosť v kilometroch (haversine). */
  function distanceKm(a, b) {
    if (!a || !b) return null;
    const la1 = Number(a.lat), ln1 = Number(a.lng);
    const la2 = Number(b.lat), ln2 = Number(b.lng);
    if (!valid(la1, ln1) || !valid(la2, ln2)) return null;

    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (la2 - la1) * rad;
    const dLng = (ln2 - ln1) * rad;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
  }

  /** Po ľudsky. Pod kilometer sa hovorí v metroch. */
  function distanceText(km) {
    if (km == null) return null;
    if (km < 1) return `${Math.round(km * 1000)} m vzdušnou čiarou`;
    return `${String(km).replace('.', ',')} km vzdušnou čiarou`;
  }

  /** Obdĺžnik, do ktorého sa zmestia všetky body. */
  function bounds(points) {
    const ok = (points || []).filter(p => p && valid(Number(p.lat), Number(p.lng)));
    if (!ok.length) return null;
    const lats = ok.map(p => Number(p.lat)), lngs = ok.map(p => Number(p.lng));
    return {
      south: Math.min(...lats), north: Math.max(...lats),
      west: Math.min(...lngs), east: Math.max(...lngs),
      count: ok.length,
    };
  }

  /** Stred množiny bodov — kam vycentrovať mapu. */
  function center(points) {
    const b = bounds(points);
    if (!b) return null;
    return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
  }

  function format(lat, lng) {
    if (!valid(Number(lat), Number(lng))) return '';
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }

  /** Odkaz na mapu, ktorý sa dá poslať vodičovi. */
  function mapsUrl(lat, lng) {
    if (!valid(Number(lat), Number(lng))) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const API = {
    valid, parseCoords, distanceKm, distanceText, bounds, center, format, mapsUrl,
  };
  if (typeof window !== 'undefined') window.DanubraGeo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
