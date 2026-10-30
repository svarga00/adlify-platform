// ============================================================================
// DANUBRA — marketing: nové firmy a e-maily
// ============================================================================
// „Hľadanie nových firiem podľa firiem, s ktorými už spolupracujeme" a
// „rozosielanie e-mailov". Dva zdroje firiem:
//
//   OpenStreetMap   stavebné firmy a remeselníci v okolí miest, kde máme
//                   odberateľov — zadarmo, ale často bez e-mailu,
//   AI (web)        Claude podľa našich odberateľov nájde podobné firmy aj
//                   s webom a e-mailom (server, `danubra-find-leads-background`).
//
// Tu sú čisté funkcie: dotaz na mapu, prečítanie výsledku, porovnanie mien
// (aby sa tá istá firma neuložila dvakrát), text e-mailu s doplnenými
// údajmi a výber, komu sa smie poslať.
//
// Testy: node app/lib/marketing/leads.test.js
// ============================================================================
(function () {
  /** Remeslá na mape (OSM `craft=*`) → ako ich voláme. */
  const CRAFTS = {
    builder: 'Stavebná firma', carpenter: 'Tesár / stolár', electrician: 'Elektro',
    plumber: 'Inštalatér', hvac: 'Kúrenie / klimatizácia', roofer: 'Pokrývač',
    tiler: 'Obkladač', painter: 'Maliar', plasterer: 'Omietky / sadrokartón',
    metal_construction: 'Kovovýroba / zámočník', scaffolder: 'Lešenie', insulation: 'Izolácie',
    window_construction: 'Okná', stonemason: 'Kamenár', floorer: 'Podlahár', welder: 'Zvárač',
  };

  const OVERPASS = ['https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

  /** Dotaz: remeselné a stavebné firmy v okruhu okolo zadaných miest. */
  function overpassQuery({ points = [], radiusKm = 40, crafts = Object.keys(CRAFTS), limit = 300, timeout = 25 } = {}) {
    const r = Math.round(Math.min(Math.max(Number(radiusKm) || 40, 5), 100) * 1000);
    const re = crafts.filter(c => /^[a-z_]+$/.test(c)).join('|') || 'builder';
    const parts = points.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
      .slice(0, 8).map((p) => {
        const at = `${r},${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
        return `nwr["craft"~"^(${re})$"]["name"](around:${at});nwr["office"="construction_company"]["name"](around:${at});`;
      }).join('');
    return `[out:json][timeout:${timeout}];(${parts});out center tags ${Math.max(1, Math.min(1000, limit))};`;
  }

  const clean = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

  /**
   * Meno firmy na porovnanie: bez právnej formy a interpunkcie.
   * „Müller Bau GmbH & Co. KG" a „Müller-Bau GmbH" je tá istá firma.
   */
  function normName(n) {
    return clean(n).toLowerCase()
      .replace(/\b(gmbh|ug|ag|kg|ohg|gbr|e\.?\s?k\.?|mbh|co\.?|& ?co|haftungsbeschränkt|inh\.?)\b/g, ' ')
      .replace(/[^a-z0-9äöüß]+/g, '').replace(/bau$/, 'bau');
  }

  /** Výsledok Overpassu → firmy na uloženie (bez duplicít). */
  function parse(json) {
    const els = (json && Array.isArray(json.elements)) ? json.elements : [];
    const out = [], videne = new Set();
    for (const e of els) {
      const t = e.tags || {};
      const name = clean(t.name);
      if (!name) continue;
      const city = clean(t['addr:city']) || null;
      const key = `${normName(name)}|${(city || '').toLowerCase()}`;
      if (videne.has(key)) continue;
      videne.add(key);
      const street = [clean(t['addr:street']), clean(t['addr:housenumber'])].filter(Boolean).join(' ');
      out.push({
        name, city, postal_code: clean(t['addr:postcode']) || null, address: street || null, country: 'DE',
        website: clean(t.website || t['contact:website'] || t.url) || null,
        email: clean(t.email || t['contact:email']).toLowerCase() || null,
        phone: clean(t.phone || t['contact:phone']) || null,
        trade: CRAFTS[t.craft] || (t.office === 'construction_company' ? 'Stavebná firma' : clean(t.craft) || null),
        source: 'osm', source_ref: `${e.type}/${e.id}`,
        lat: Number(e.lat != null ? e.lat : e.center && e.center.lat) || null,
        lng: Number(e.lon != null ? e.lon : e.center && e.center.lon) || null,
      });
    }
    // Firmy s e-mailom a webom navrch — tie sa dajú osloviť hneď.
    return out.sort((a, b) => (!!b.email - !!a.email) || (!!b.website - !!a.website) || a.name.localeCompare(b.name, 'de'));
  }

  /**
   * Odstráni firmy, ktoré už máme — medzi odberateľmi alebo uložené.
   * @returns {{ fresh: Array, known: Array }}
   */
  function dedupe(found, { leads = [], partners = [] } = {}) {
    const mame = new Set([...leads.map(l => l.name), ...partners.map(p => p.name)].map(normName).filter(Boolean));
    const fresh = [], known = [];
    for (const f of found || []) (mame.has(normName(f.name)) ? known : fresh).push(f);
    return { fresh, known };
  }

  /** Firma od AI → riadok do databázy. Cudzí vstup: všetko sa očistí. */
  function fromAi(x = {}, { similarTo = null } = {}) {
    const email = clean(x.email).toLowerCase();
    const web = clean(x.website);
    return {
      name: clean(x.name).slice(0, 200), city: clean(x.city).slice(0, 120) || null,
      postal_code: clean(x.postal_code).slice(0, 12) || null, address: clean(x.address).slice(0, 200) || null,
      country: 'DE', website: /^https?:\/\//i.test(web) ? web.slice(0, 300) : (web ? `https://${web}`.slice(0, 300) : null),
      email: emailOk(email) ? email : null, phone: clean(x.phone).slice(0, 40) || null,
      trade: clean(x.trade).slice(0, 80) || null, why: clean(x.why).slice(0, 400) || null,
      source: 'ai', source_ref: clean(x.source_url).slice(0, 300) || null, similar_to: similarTo,
    };
  }

  function emailOk(e) {
    return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(e || '').trim());
  }

  /**
   * Komu sa smie poslať: má platný e-mail, neodhlásil sa, nie je odmietnutý,
   * nie je natrvalo zatvorený (Google Mapy, 079) a nikto nie je dvakrát (tá istá adresa pri dvoch firmách).
   */
  function recipients(list, optouts = []) {
    const von = new Set((optouts || []).map(o => String(o.email || o).toLowerCase()));
    const videne = new Set();
    const ok = [], skip = [];
    for (const r of list || []) {
      const e = String(r.email || '').trim().toLowerCase();
      const why = !emailOk(e) ? 'bez e-mailu' : von.has(e) ? 'odhlásil sa'
        : ['rejected', 'unsubscribed'].includes(r.status) ? 'nechce' : r.closed_at ? 'firma je zatvorená'
        : videne.has(e) ? 'rovnaký e-mail dvakrát' : null;
      if (why) { skip.push({ ...r, why }); continue; }
      videne.add(e);
      ok.push({ ...r, email: e });
    }
    return { ok, skip };
  }

  /** Doplní údaje do textu: {firma}, {mesto}, {nasa_firma}, {podpis}, {odhlasit}. */
  function fill(text, r = {}, s = {}) {
    const map = {
      firma: r.name || '', mesto: r.city || '', remeslo: r.trade || '',
      nasa_firma: s.name || '', podpis: s.signature || s.name || '', odhlasit: r.unsubscribe || '',
      telefon: s.phone || '', email: s.email || '', web: s.web || '',
    };
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  }

  /**
   * Pätička každého e-mailu: kto ho posiela (Impressum) a ako sa odhlásiť.
   * V Nemecku je obchodný e-mail bez odosielateľa a bez odhlásenia
   * protizákonný — preto sa pridáva vždy, nie podľa šablóny.
   */
  function footer(s = {}, unsubscribe = '') {
    return [
      '', '—', [s.name, s.address].filter(Boolean).join(', '),
      [s.company_id ? `IČO/Reg.-Nr.: ${s.company_id}` : '', s.vat_id ? `USt-IdNr.: ${s.vat_id}` : '', s.register || ''].filter(Boolean).join(' · '),
      [s.phone, s.email].filter(Boolean).join(' · '),
      unsubscribe ? `Keine weiteren E-Mails erhalten: ${unsubscribe}` : '',
    ].filter(x => x !== null && x !== undefined && x !== '').join('\n');
  }

  /** Úvodný e-mail nemeckej firme — východisko, dá sa prepísať. */
  const TEMPLATE_DE = {
    subject: 'Fachkräfte aus der Slowakei für {firma}',
    body: [
      'Sehr geehrte Damen und Herren,',
      '',
      'wir sind {nasa_firma}, ein Nachunternehmer aus der Slowakei. Wir stellen erfahrene Handwerker-Teams '
        + '(u. a. Trockenbau, Maurer, Schweißer, Elektro) für Bauprojekte in Deutschland — als Werkvertrag, '
        + 'mit A1-Bescheinigung, SOKA-BAU und Freistellungsbescheinigung nach § 48b EStG.',
      '',
      'Abgerechnet wird nach Stunden auf Basis von Stundennachweisen, die Ihr Bauleiter unterschreibt.',
      '',
      'Haben Sie aktuell oder in den nächsten Monaten Bedarf an zusätzlichen Fachkräften in {mesto} oder Umgebung? '
        + 'Ich rufe Sie gern an oder schicke Ihnen unsere Referenzen.',
      '',
      'Mit freundlichen Grüßen',
      '{podpis}',
    ].join('\n'),
  };

  /** Vstup pre AI: naši odberatelia stručne (bez interných čísel). */
  function aiContext(partners = [], subcontracts = []) {
    return partners.slice(0, 15).map((p) => {
      const z = subcontracts.filter(s => s.partner_id === p.id);
      return {
        name: p.name, city: p.city || null, country: p.country || 'DE',
        what: [...new Set(z.map(s => s.trade || s.title).filter(Boolean))].slice(0, 4).join(', ') || null,
      };
    });
  }

  // Kategória firmy (081 pridala Stretnutie, Ponuka, Ozvať sa neskôr a
  // Nedostupná). Ten istý zoznam v tom istom poradí je v contacts.js → STAGES
  // (test to stráži) — kontakty s firmou z neho navrhujú ďalší stav.
  const STATUS = [
    ['new', 'Nová', 'gray'], ['contacted', 'Oslovená', 'blue'], ['replied', 'Odpísala', 'amber'],
    ['interested', 'Má záujem', 'green'], ['meeting', 'Stretnutie', 'green'], ['offer', 'Ponuka', 'blue'],
    ['won', 'Je odberateľ', 'green'], ['later', 'Ozvať sa neskôr', 'amber'], ['rejected', 'Nemá záujem', 'red'],
    ['unreachable', 'Nedostupná', 'gray'], ['unsubscribed', 'Odhlásená', 'red'],
  ];

  const API = { CRAFTS, OVERPASS, STATUS, TEMPLATE_DE, overpassQuery, normName, parse, dedupe, fromAi,
    emailOk, recipients, fill, footer, aiContext };
  if (typeof window !== 'undefined') window.DanubraLeads = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
