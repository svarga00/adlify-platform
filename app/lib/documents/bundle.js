// ============================================================================
// DANUBRA — balík papierov na nástup: jedna správa namiesto piatich
// ============================================================================
// „…a vedieť to zlúčiť, aby nedostal 5 mailov zvlášť o ubytovaní, stavbe,
// infolist, vzor faktúry atď."
//
// Balík = všetky papiere na nástup v jednej správe:
//   * e-mail: jedna správa, všetky PDF ako prílohy,
//   * WhatsApp a SMS: jedna správa s jedným krátkym odkazom {web}/b/<token>,
//     za ktorým sú všetky PDF naraz (netlify/functions/punds-bundle.js).
//
// Správa nie je len „v prílohe posielame". Človek ju číta v telefóne v nedeľu
// večer, takže v nej je to podstatné aj bez otvorenia PDF: kedy a kam, kde sa
// hlásiť, kde bude bývať, komu na stavbe zavolať a nám.
//
// Vykáme. Žiadne emoji (app/tests/no-emoji.test.js). Čisté funkcie — nič sa
// tu nenačítava ani neposiela; to robí js/components/bundle.js.
// Testy: node app/lib/documents/bundle.test.js
// ============================================================================
(function () {
  /**
   * Čo môže byť v balíku a v akom poradí. `kind` je druh v archíve
   * (lib/documents/archive.js KINDS) — podľa neho sa zoradia aj prílohy.
   */
  const ITEMS = [
    { key: 'infolist',     title: 'Infolist na stavbu',    kind: 'infolist' },
    { key: 'ubytovanie',   title: 'Infolist k ubytovaniu', kind: 'infolist_lodging' },
    { key: 'objednavka',   title: 'Objednávka',            kind: 'objednavka' },
    { key: 'vzor_faktury', title: 'Vzor faktúry',          kind: 'invoice_guide' },
    { key: 'zmluva',       title: 'Rámcová zmluva',        kind: 'ramcova' },
    { key: 'gdpr',         title: 'Súhlas GDPR',           kind: 'gdpr' },
  ];

  const txt = (v) => {
    const s = v == null ? '' : String(v).trim();
    return s && s !== '—' && s !== '-' ? s : '';
  };
  const day = (v) => (v ? String(v).slice(0, 10) : '');
  const DNI = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];

  /** '2026-10-12' → { full: 'pondelok 12. 10. 2026', short: '12. 10.' }. Bez posunu časovým pásmom. */
  function kedy(v) {
    const m = day(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    return { full: `${DNI[dow]} ${d}. ${mo}. ${y}`, short: `${d}. ${mo}.` };
  }

  /** Definícia podľa kľúča (infolist) alebo druhu v archíve (infolist_lodging). */
  function itemOf(k) {
    return ITEMS.find(x => x.key === k) || ITEMS.find(x => x.kind === k) || null;
  }

  /** Papiere v poradí ITEMS; neznáme na koniec, v tom poradí, ako prišli. */
  function order(items) {
    const idx = (it) => {
      const d = itemOf((it && (it.key || it.kind)) || '');
      return d ? ITEMS.indexOf(d) : ITEMS.length;
    };
    return (items || []).filter(Boolean).map((it, i) => ({ it, i }))
      .sort((a, b) => (idx(a.it) - idx(b.it)) || (a.i - b.i)).map(x => x.it);
  }

  /**
   * Token do odkazu {web}/b/<token>: 24 znakov z [A-Za-z0-9_-] (144 bitov).
   * 256 je deliteľné 64, takže `bajt & 63` je rovnomerné — žiadny znak
   * nie je častejší.
   */
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function token() {
    let bytes;
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (c && typeof c.getRandomValues === 'function') {
      bytes = c.getRandomValues(new Uint8Array(24));
    } else {
      bytes = require('crypto').randomBytes(24);
    }
    let out = '';
    for (let i = 0; i < 24; i++) out += ABC[bytes[i] & 63];
    return out;
  }

  /**
   * Texty jednej správy pre všetky cesty.
   *
   * @param {Object} o
   *   worker, subcontract, assignment, lodging   záznamy z DB
   *   colleagues  výsledok DanubraSiteSheet.colleagues()
   *   items       [{ title, kind, key? }] — čo je v balíku
   *   link        odkaz na stránku balíka
   *   supplier    naša firma z Nastavení (phone, name, brand)
   *   start       deň nástupu (inak z nasadenia / zákazky)
   * @returns {{ subject:string, email:string, whatsapp:string, sms:string }}
   */
  function texts({ worker, subcontract, assignment, lodging, colleagues, items, link,
    supplier, start } = {}) {
    const w = worker || {}, sc = subcontract || {}, a = assignment || {}, s = supplier || {};
    const kol = colleagues || {};
    const meno = txt(w.full_name).split(/\s+/)[0] || '';
    const k = kedy(start || a.date_from || sc.date_from);
    const cas = txt(sc.work_start);
    const mesto = txt(sc.site_city);
    const stavba = [txt(sc.title), txt(sc.site_address), mesto].filter(Boolean).join(', ');
    const hlasit = txt(sc.meeting_point);
    const zaKym = [txt(sc.site_contact_name), txt(sc.site_contact_phone)].filter(Boolean).join(', ');
    const byt = lodging ? [txt(lodging.name), txt(lodging.address), txt(lodging.city)]
      .filter(Boolean).join(', ') : '';
    const tel = txt(s.phone);
    const firma = txt(s.brand) || txt(s.name);
    const odkaz = txt(link);
    const papiere = order(items).map(it => txt(it.title) || (itemOf(it.key || it.kind) || {}).title)
      .filter(Boolean);
    const nastup = k ? `${k.full}${cas ? ` o ${cas}` : ''}` : (cas ? `začiatok o ${cas}` : '');

    // Kolegovia: partia (predák prvý), alebo kontaktná osoba.
    const clovek = (p) => `${p.name}${p.role ? ` (${p.role})` : ''}${p.phone ? `, tel. ${p.phone}` : ''}`;
    const people = kol.people || [];
    const partia = kol.crew ? `${kol.crew.name}${people.length ? `: ${people.map(clovek).join('; ')}` : ''}` : '';
    const kontakt = kol.contact
      ? `${kol.contact.name}${kol.contact.phone ? `, tel. ${kol.contact.phone}` : ''}${kol.contact.note ? ` (${kol.contact.note})` : ''}`
      : '';
    const kratky = kol.contact ? kol.contact : (people.find(p => p.leader) || people[0] || null);

    const subject = `Papiere na nástup${txt(sc.title) || mesto ? ` — ${txt(sc.title) || mesto}` : ''}`
      + `${k ? `, od ${k.short}` : ''}`;

    // ── E-mail ──
    const riadky = (pary) => pary.filter(p => p[1]).map(p => `${p[0]}: ${p[1]}`);
    const email = [
      meno ? `Dobrý deň, ${meno},` : 'Dobrý deň,',
      '',
      `posielame Vám všetky papiere na nástup naraz${papiere.length ? ' — sú v prílohe tohto e-mailu' : ''}.`,
      '',
      ...riadky([['Nástup', nastup], ['Stavba', stavba], ['Kde sa hlásiť', hlasit],
        ['Za kým ísť', zaKym], ['Ubytovanie', byt], ['Vaša partia', partia],
        ['Kontaktná osoba na stavbe', kontakt]]),
      ...(papiere.length ? ['', 'V prílohe:', ...papiere.map(p => `• ${p}`)] : []),
      ...(odkaz ? ['', `Ak sa Vám prílohy neotvoria, všetky papiere nájdete aj tu: ${odkaz}`] : []),
      '',
      `Keď niečo nesedí alebo neviete, zavolajte nám${tel ? `: ${tel}` : '.'}`,
      'Lepšie hneď, než na stavbe.',
      '',
      'S pozdravom',
    ].join('\n');

    // ── WhatsApp: tučné popisky, zalomenia, jeden odkaz ──
    const wa = (pary) => pary.filter(p => p[1]).map(p => `*${p[0]}:* ${p[1]}`);
    const whatsapp = [
      meno ? `Dobrý deň, ${meno},` : 'Dobrý deň,',
      'tu sú všetky papiere na nástup v jednej správe.',
      '',
      ...wa([['Nástup', nastup], ['Stavba', stavba], ['Kde sa hlásiť', hlasit],
        ['Za kým ísť', zaKym], ['Ubytovanie', byt], ['Vaša partia', partia],
        ['Kontakt na stavbe', kontakt]]),
      ...(odkaz ? ['', `*Všetky papiere (${papiere.length || 'PDF'}):*`, odkaz] : []),
      ...(papiere.length ? [papiere.join(', ')] : []),
      '',
      `Keď niečo nesedí, zavolajte nám${tel ? `: ${tel}` : '.'}`,
      ...(firma ? ['', `S pozdravom`, firma] : []),
    ].join('\n');

    // ── SMS: najviac 300 znakov. Odkaz zostane vždy; ostatné sa uberá od
    //    najmenej dôležitého, kým sa to nezmestí. ──
    const casti = [
      { t: meno ? `Dobrý deň, ${meno}.` : 'Dobrý deň.', p: 3 },
      { t: k || cas ? `Nástup ${k ? k.short : ''}${cas ? `${k ? ' ' : ''}o ${cas}` : ''}${mesto ? `, ${mesto}` : ''}.` : '', p: 5 },
      { t: odkaz ? `Všetky papiere: ${odkaz}` : 'Papiere na nástup sme Vám poslali e-mailom.', p: 9 },
      { t: kratky ? `Na stavbe: ${kratky.name}${kratky.phone ? ` ${kratky.phone}` : ''}.` : '', p: 2 },
      { t: tel ? `Otázky: ${tel}` : '', p: 4 },
      { t: firma, p: 1 },
    ].filter(c => c.t);
    const zloz = (xs) => xs.map(c => c.t).join(' ');
    let sms = zloz(casti);
    const zostava = [...casti];
    while (sms.length > 300 && zostava.length > 1) {
      const naj = zostava.reduce((m, c) => (c.p < m.p ? c : m));
      if (naj.p >= 9) break;
      zostava.splice(zostava.indexOf(naj), 1);
      sms = zloz(zostava);
    }
    if (sms.length > 300) sms = sms.slice(0, 300);

    return { subject, email, whatsapp, sms };
  }

  const API = { ITEMS, itemOf, order, token, texts };
  if (typeof window !== 'undefined') window.DanubraBundle = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
