// ============================================================================
// DANUBRA — mapa stavieb a ubytovaní
// ============================================================================
// Tenký obal nad Leafletom. Zvyšok appky o Leaflete nevie nič — vidí len
// `DanubraMap.render(el, body)`.
//
// Tri veci, ktoré tu nie sú náhodou:
//
//   * **Značky sú kreslené cez CSS** (`divIcon`), nie cez obrázky. Leaflet
//     má predvolené ikony ako PNG s relatívnou cestou; bola by to ďalšia
//     vec, ktorá sa dá rozbiť presunutím súboru.
//   * **Dlaždice sú jediná vec zvonku** a adresa sa dá prepísať
//     v Nastaveniach. Keď sa nenačítajú, mapa zostane sivá, ale značky
//     aj vzdialenosti fungujú ďalej — počítajú sa u nás.
//   * **Bez Leafletu sa nič nerozpadne.** Keď sa knižnica nenačíta, na
//     mieste mapy je zoznam bodov s odkazmi. Obrazovka musí fungovať aj
//     vtedy; bielu plochu sme už raz mali.
// ============================================================================
(function () {
  const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '© <a href="https://www.openstreetmap.org/copyright" '
    + 'target="_blank" rel="noopener">OpenStreetMap</a>';

  /** Adresa dlaždíc z nastavení, inak OpenStreetMap. */
  function tileUrl() {
    try {
      const s = window.Cfg && Cfg.j && Cfg.j('staffing');
      if (s && s.tile_url) return String(s.tile_url);
    } catch { /* nastavenia nemusia byť načítané */ }
    return OSM;
  }

  function icon(kind, label) {
    const cls = `map-pin map-pin-${kind}`;
    return L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
      html: `<span class="${cls}" title="${UI.esc(label || '')}"></span>`,
    });
  }

  /**
   * Vykreslí mapu do prvku.
   *
   * @param {HTMLElement|string} target  prvok alebo jeho id
   * @param {Array} points  [{ lat, lng, kind, label, sub, onClick }]
   *                        kind: 'site' | 'lodging'
   * @returns {Object|null} inštancia mapy, alebo null keď sa nedala vykresliť
   */
  function render(target, points = []) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return null;

    const ok = (points || []).filter(p => p && DanubraGeo.valid(Number(p.lat), Number(p.lng)));
    if (!ok.length) {
      el.innerHTML = `<div class="map-empty">${Icon('site', 20)}
        <span>Zatiaľ bez polohy. Vlož odkaz z máp pri stavbe alebo ubytovaní
        a objaví sa tu.</span></div>`;
      return null;
    }

    // Bez knižnice sa obrazovka nesmie rozpadnúť — namiesto mapy zoznam.
    if (typeof L === 'undefined') {
      el.innerHTML = `<div class="map-empty">${Icon('alert', 20)}
        <span>Mapa sa nenačítala. Body sú aj tak dostupné:</span>
        <span class="link-row" style="margin-top:8px;">
          ${ok.map(p => `<a class="link-chip" target="_blank" rel="noopener"
            href="${DanubraGeo.mapsUrl(p.lat, p.lng)}">${Icon(p.kind === 'lodging' ? 'bed' : 'site', 13)}
            <span>${UI.esc(p.label || '')}</span></a>`).join('')}
        </span></div>`;
      return null;
    }

    // Opakované vykreslenie do toho istého prvku — Leaflet by inak spadol.
    if (el._danubraMap) { el._danubraMap.remove(); el._danubraMap = null; }
    el.innerHTML = '';

    const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(tileUrl(), { attribution: ATTR, maxZoom: 19 }).addTo(map);

    for (const p of ok) {
      const m = L.marker([Number(p.lat), Number(p.lng)], {
        icon: icon(p.kind === 'lodging' ? 'lodging' : 'site', p.label),
        title: p.label || '',
      }).addTo(map);

      const link = DanubraGeo.mapsUrl(p.lat, p.lng);
      m.bindPopup(`<b>${UI.esc(p.label || '')}</b>
        ${p.sub ? `<br><span style="color:#6F7C95;">${UI.esc(p.sub)}</span>` : ''}
        <br><a href="${link}" target="_blank" rel="noopener">Otvoriť v mapách</a>`);
      // `onClick` je funkcia, nie reťazec — reťazec by znamenal `eval`.
      if (typeof p.onClick === 'function') {
        m.on('click', () => { try { p.onClick(p); } catch (e) { console.error(e); } });
      }
    }

    const b = DanubraGeo.bounds(ok);
    if (ok.length === 1) map.setView([b.south, b.west], 14);
    else map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [30, 30] });

    // Mapa vykreslená v skrytom alebo práve vymenenom prvku si zle spočíta
    // veľkosť a zostane z nej pásik. Po prekreslení sa musí premerať.
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60);

    el._danubraMap = map;
    return map;
  }

  window.DanubraMap = { render, tileUrl, OSM };
})();
