// ============================================================================
// DANUBRA — o čom firme písať: remeslo, región a oslovenie (DE, „Sie")
// ============================================================================
// „…pekný e-mail, prípadne s prezentáciou, prispôsobený konkrétnemu
// hľadaniu."
//
// Z firmy (remeslo, kategórie z Google Máp, profil od AI, región, konateľ)
// a z hľadania, z ktorého prišla (profily zadaných webov, poznámka, región)
// sa vyberie remeslo a z neho:
//   * nadpis e-mailu a prezentácie („Trockenbauer für Ihre Baustellen in Bayern"),
//   * tri krátke body (čo robíme v tom remesle, doklady, jeden kontakt),
//   * oslovenie „Sehr geehrter Herr Müller," / „Sehr geehrte Damen und Herren,".
//
// Texty sú vecné a prevzaté z webu punds.eu (web/eu/pages/*.js) — test
// stráži, aby sa od webu nerozišli. Remeslá, ktoré na webe ešte nie sú
// (obklady, elektro, debnenie, armovanie, murári), majú opis práce, nie
// sľuby; dajú sa prepísať v Nastaveniach (marketing.presentation.trades).
// Ceny, referencie a počty ľudí sa nikde nevymýšľajú — len keď sú
// v Nastaveniach.
//
// Testy: node app/lib/marketing/pitch.test.js
// ============================================================================
(function () {
  const fold = (s) => String(s == null ? '' : s).toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clean = (v, n = 400) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

  /**
   * Remeslá, ktoré firmám ponúkame. `web` = kľúč v web/eu/pages/trade.js
   * (texty úloh sú odtiaľ), `app` = kľúče danubra_trades.
   */
  const TRADES = [
    { key: 'trockenbau', label: 'Trockenbau', team: 'Trockenbauer', web: 'sadrokarton', slug: 'trockenbau', app: ['trockenbau'],
      kw: /trockenbau|akustikbau|innenausbau|gipskarton|rigips|standerwerk|abgehangte decke|abhangdecke|unterdecke|sadrokarton|drywall/,
      tasks: ['Ständerwerk stellen (CW-/UW-Profile) und ausrichten', 'Beplanken mit Gipsplatten, ein- oder zweilagig', 'Einbau von Dämmung in Wände und Decken', 'Abgehängte Decken und Unterdecken', 'Spachteln und Schleifen bis Q3/Q4, Einbau von Revisionsöffnungen'] },
    { key: 'fliesen', label: 'Fliesenarbeiten', team: 'Fliesenleger', web: null, slug: null, app: ['obkladac'],
      kw: /fliese|plattenleger|naturstein|keramik|obklad|tiling/,
      tasks: ['Untergrundvorbereitung und Abdichtung nach Vorgabe', 'Verlegen von Wand- und Bodenfliesen', 'Verfugen und elastische Anschlussfugen', 'Fliesenarbeiten in Bädern, Küchen und Treppenhäusern'] },
    { key: 'maler', label: 'Maler- und Lackierarbeiten', team: 'Maler', web: 'maliar', slug: 'maler', app: ['maliar'],
      kw: /maler|anstrich|lackier|tapezier|maliar|painter/,
      tasks: ['Untergrundvorbereitung: Abkleben, Schleifen, Grundieren', 'Spachteln von Wand- und Deckenflächen', 'Streichen und Rollen, auch im Airless-Spritzverfahren', 'Tapezieren mit Vlies-, Raufaser- und Glasgewebetapeten', 'Lackierarbeiten sowie Fassadenanstriche'] },
    { key: 'wdvs', label: 'WDVS und Fassade', team: 'WDVS-Monteure', web: 'zateplovac', slug: 'wdvs', app: ['omietkar'],
      kw: /wdvs|warmedammverbund|fassadendamm|fassade|stuckateur|verputz|putzarbeit|zateplen|omiet/,
      tasks: ['Prüfen und Vorbereiten des Untergrunds', 'Setzen von Sockel- und Anschlussprofilen', 'Kleben und Dübeln der Dämmplatten', 'Armierungsschicht mit Gewebe, Laibungen und Fensteranschlüsse', 'Brandriegel nach Vorgabe, Ober- bzw. Edelputz und Anstrich'] },
    { key: 'elektro', label: 'Elektroinstallation', team: 'Elektriker', web: null, slug: null, app: ['elektrikar'],
      kw: /elektro|elektriker|elektrotechnik|elektrikar|electric/,
      tasks: ['Kabelzug und Verlegen von Leitungen und Kabeltrassen', 'Setzen von Dosen, Schaltern und Steckdosen', 'Montage von Unterverteilungen nach Plan', 'Zuarbeit unter Aufsicht Ihrer verantwortlichen Elektrofachkraft'] },
    { key: 'schalung', label: 'Schalungsbau', team: 'Schalungsbauer', web: null, slug: null, app: ['betonar', 'tesar'],
      kw: /schalung|stahlbetonbau|betonbau|rohbau|hochbau|betonar|debnen|formwork/,
      tasks: ['Ein- und Ausschalen von Wänden, Stützen und Decken', 'Arbeiten mit System- und konventioneller Schalung', 'Vorbereiten und Reinigen der Schalelemente', 'Mithilfe beim Betonieren'] },
    { key: 'bewehrung', label: 'Bewehrungsarbeiten', team: 'Eisenflechter', web: null, slug: null, app: ['betonar'],
      kw: /bewehrung|eisenflecht|betonstahl|biegeplatz|armovan|rebar/,
      tasks: ['Verlegen und Binden der Bewehrung nach Bewehrungsplan', 'Einbau von Abstandhaltern und Anschlussbewehrung', 'Bewehrung von Fundamenten, Decken, Wänden und Stützen'] },
    { key: 'maurer', label: 'Maurerarbeiten', team: 'Maurer', web: null, slug: null, app: ['murar'],
      kw: /maurer|mauerwerk|murar|bricklay/,
      tasks: ['Mauerwerk aus Ziegel, Kalksandstein und Porenbeton', 'Setzen von Stürzen und Ausmauern von Öffnungen', 'Putz- und Ausbesserungsarbeiten', 'Mithilfe im Rohbau'] },
    { key: 'schweissen', label: 'Schweißarbeiten', team: 'Schweißer', web: 'zvarac', slug: 'schweissen', app: ['zvarac'],
      kw: /schweiss|zvar|welding|welder/,
      tasks: ['Heften und Schweißen von Stahlkonstruktionen nach Zeichnung und WPS', 'Kehl- und Stumpfnähte in den geprüften Positionen', 'WIG-Schweißen von Edelstahl- und Rohrleitungen', 'Montage- und Reparaturschweißungen vor Ort', 'Nahtvorbereitung, Schleifen und Sichtprüfung der eigenen Nähte'] },
    { key: 'metallbau', label: 'Metallbau und Schlosserei', team: 'Schlosser und Metallbauer', web: 'zamocnik', slug: 'metallbau', app: ['zamocnik'],
      kw: /metallbau|schlosser|stahlbau|zamoc|metalwork/,
      tasks: ['Fertigen von Bauteilen nach Werkstattzeichnung', 'Montage von Stahlkonstruktionen, Treppen, Geländern und Bühnen', 'Anpassen, Bohren und Verschrauben vor Ort nach Vorgabe', 'Heften und Schweißen einfacher Verbindungen (MAG)', 'Arbeiten mit Hubarbeitsbühne nach Einweisung'] },
    { key: 'fenster', label: 'Fenster- und Türmontage', team: 'Fenster- und Türmonteure', web: 'okna', slug: 'fenster-tueren', app: ['montaznik'],
      kw: /fensterbau|fenstermontage|fenster|turenmontage|turmontage|okna|window/,
      tasks: ['Ausbau und Entsorgungsvorbereitung von Altfenstern und -türen', 'Einbau, Ausrichten und Befestigen der Elemente', 'Abdichten der Anschlussfuge mit Bändern und Folien', 'Einstellen der Beschläge und Funktionsprüfung', 'Montage von Innentüren, Zargen und Fensterbänken'] },
  ];
  /** Keď sa remeslo nedá určiť — všeobecne, bez sľubov. */
  const GENERIC = { key: 'bau', label: 'Bau und Ausbau', team: 'Handwerker-Teams', web: null, slug: null, app: [],
    tasks: ['Einzelne Fachkräfte oder eingespielte Teams', 'Hoch- und Ausbau, Fassade und Montage', 'Zuarbeit für Ihre Bauleitung nach Ihren Vorgaben'] };

  /**
   * Vecné texty o nás (DE). Prevzaté z punds.eu (o nás, remeslá, Impressum);
   * Nastavenia (marketing.presentation) môžu ktorýkoľvek prepísať.
   */
  const TEXT = {
    about: 'Partner und Service ist ein slowakisches Unternehmen mit Sitz in Nové Zámky. Wir vermitteln erfahrene Handwerker und eingespielte Teams an Bau- und Industrieunternehmen in Deutschland und Österreich, mit vollständigen Unterlagen und einem festen Ansprechpartner.',
    whyH: 'Wir kennen jeden Handwerker persönlich.',
    why: 'Jede Fachkraft haben wir vorher persönlich geprüft: Qualifikation, Erfahrung und Zuverlässigkeit.',
    values: [['Geprüfte Qualität', 'Nur Fachkräfte mit nachgewiesener Erfahrung und gültigen Zertifikaten.'],
      ['Rechtssicherheit', 'A1, Gewerbe, Steuernummer und Freistellung liegen vor Projektstart vor.'],
      ['Ein Ansprechpartner', 'Deutschsprachige Koordination von Einsatz, Ersatz und Abrechnung.'],
      ['Verlässlichkeit', 'Wir halten Termine ein und stellen bei Ausfall schnell Ersatz.']],
    languages: 'Koordination auf Deutsch, auf der Baustelle Slowakisch, Tschechisch und Ungarisch.',
    steps: [['Anfrage', 'Gewerk, Ort, Zeitraum und Anzahl der Personen.'], ['Profile & Angebot', 'Passende {team} mit Nachweisen und Konditionen.'],
      ['Unterlagen', 'A1, Gewerbe, Freistellung – vor Projektstart komplett.'], ['Einsatz', 'Anreise, Unterkunft und Betreuung vor Ort.']],
    conditions: [
      ['Werkvertrag, Abrechnung nach Stunden', 'Selbstständige Handwerker und Teams als Nachunternehmer, abgerechnet nach geleisteten Stunden mit Stundennachweis.'],
      ['Unterlagen vor Projektstart', 'A1-Bescheinigung, Gewerbe, Steuernummer und Freistellungsbescheinigung nach § 48b EStG.'],
      ['Unterkunft und Anreise', 'Organisieren wir für das Team.'],
      ['Material und Werkzeug', 'In der Regel stellen Sie Material und Großgeräte, unsere Fachkräfte bringen Handwerkzeug und persönliche Schutzausrüstung mit. Die genaue Aufteilung halten wir im Angebot fest.'],
      ['Starttermin', 'Nach Ihrer Anfrage nennen wir einen realistischen Starttermin – verbindlich, sobald die Profile feststehen.'],
    ],
    prices: 'Konditionen nennen wir Ihnen im Angebot – passend zu Gewerk, Teamgröße und Einsatzort.',
    references: '',
    cta_url: 'https://punds.eu',
    cta_label: 'Mehr auf punds.eu',
    reply_label: 'Antworten Sie einfach auf diese E-Mail',
  };

  // ── Remeslo ─────────────────────────────────────────────────────────────
  /**
   * Remeslá firmy podľa toho, čo o nej vieme (firma váži 3×, hľadanie 1×).
   * @returns {Array<{ trade, score }>}  zoradené, najviac 3
   */
  function detect(lead = {}, search = null, { offered = null } = {}) {
    const own = [lead.trade, ...(Array.isArray(lead.categories) ? lead.categories : []), lead.profile && lead.profile.summary, lead.why, lead.name].map(fold).join(' | ');
    const seeds = search ? [...(Array.isArray(search.seeds) ? search.seeds : []).flatMap(s => [s.trade, ...(s.keywords || []), ...(s.typical_jobs || []), s.summary]),
      search.params && search.params.note, search.note].map(fold).join(' | ') : '';
    const list = TRADES.filter(t => !offered || !offered.length || offered.includes(t.key));
    const hits = (txt, re) => (txt.match(new RegExp(re.source, 'g')) || []).length;
    return list.map(t => ({ trade: t, score: 3 * hits(own, t.kw) + hits(seeds, t.kw) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  // ── Región ──────────────────────────────────────────────────────────────
  const SK_DE = [[/^bavorsk/, 'Bayern'], [/^badensko|^bade?n.?wurt/, 'Baden-Württemberg'], [/^sasko.?anhalt/, 'Sachsen-Anhalt'],
    [/^dolne sasko/, 'Niedersachsen'], [/^sasko/, 'Sachsen'], [/^durinsk/, 'Thüringen'], [/^hesensk/, 'Hessen'],
    [/^severne poryn|^nordrhein/, 'Nordrhein-Westfalen'], [/^poryni|^rheinland/, 'Rheinland-Pfalz'], [/^sarsk/, 'Saarland'],
    [/^brandenbursk/, 'Brandenburg'], [/^meklenbursk/, 'Mecklenburg-Vorpommern'], [/^slezvick|^schleswig/, 'Schleswig-Holstein'],
    [/^berlin/, 'Berlin'], [/^hamburg/, 'Hamburg'], [/^bremy|^bremen/, 'Bremen'], [/^mnichov/, 'München'], [/^viede/, 'Wien'],
    [/^rakusk/, 'Österreich'], [/^nemeck/, 'Deutschland'], [/^stuttgart/, 'Stuttgart'], [/^norimberg/, 'Nürnberg'], [/^koln|^kolin nad/, 'Köln']];
  /** Región do nemeckej vety — slovenský názov sa preloží, iný slovenský text sa nepoužije. */
  function germanPlace(s) {
    const raw = clean(s, 80);
    const v = raw.replace(/^(okolie|oblast|oblasť|region|v|vo|in|um)\s+/i, '');
    if (!v) return '';
    const hit = SK_DE.find(([re]) => re.test(fold(v)));
    if (hit) return hit[1];
    // Iný slovenský text („okolie Žiliny", „celé Nemecko") do nemeckej vety nepatrí.
    if (/[čďľňŕťĺôýšž]/i.test(raw) || /^(okolie|oblast|mesto|kraj|cele|nemecko)\b/.test(fold(raw))) return '';
    return v;
  }
  /** „in Bayern" / „in Ulm und Umgebung" / '' */
  function region(lead = {}, search = null) {
    const r = germanPlace(lead.region);
    if (r) return { name: r, phrase: `in ${r}` };
    const c = clean(lead.city, 60);
    if (c) return { name: c, phrase: `in ${c} und Umgebung` };
    const s = search && germanPlace((search.params && search.params.region) || search.region);
    return s ? { name: s, phrase: `in ${s}` } : { name: '', phrase: '' };
  }

  // ── Oslovenie ──────────────────────────────────────────────────────────
  const MALE = new Set('hans peter michael thomas andreas stefan stephan christian markus marcus martin frank jurgen juergen klaus wolfgang uwe bernd ralf matthias alexander daniel tobias florian sebastian jan jens dirk sven oliver holger rainer manfred gunter guenter gunther josef joseph johann johannes georg werner karl heinz helmut horst dieter joachim maximilian max lukas felix simon patrick marco mario tim kai marcel benjamin david robert roland norbert harald gerhard rudolf walter erich friedrich ludwig anton franz alois konrad dominik philipp julian niklas fabian christoph armin volker lars timo bastian ingo carsten karsten torsten thorsten detlef achim hubert reinhard siegfried ulrich wilhelm otto emil paul benedikt andre rene mehmet mustafa ahmet ali erik eric hermann jakob jonas leon luca moritz nico noah elias kevin dennis mike tom ralph rolf willi bruno egon gustav hartmut lothar meinhard waldemar heiko jochen marko sascha steffen till'.split(' '));
  const FEMALE = new Set('anna maria petra sabine susanne andrea claudia nicole stefanie stephanie julia katharina christina christine monika birgit karin ute heike silke sandra melanie kerstin anja martina gabriele renate ursula brigitte elke ingrid barbara eva laura lisa sarah sara lena jana tanja katrin kathrin simone nadine daniela manuela jessica sonja angelika doris helga marion bettina carina sophie sophia johanna franziska verena miriam theresa tamara vanessa jennifer marina natalie nina sabrina svenja tina yvonne beate cornelia dagmar edith erika gisela hannelore irene jutta margit regina rita roswitha sigrid ulrike waltraud anke antje britta dorothea elena emma hanna hannah ines isabel jasmin kristina lea luisa maja marie michaela mia nora olga pia ramona rebecca ruth tatjana viktoria'.split(' '));
  const TITLE = /^(dr\.?|prof\.?|dipl\.?-?[a-z.]*|ing\.?|mag\.?|m\.?\s?sc\.?|b\.?\s?sc\.?|mba|b\.?\s?eng\.?|m\.?\s?eng\.?)$/i;
  const PARTICLE = /^(von|van|vom|zu|zur|de|del|der|den|di|da)$/i;

  /** Rozbor mena z Impressum: „Herr Dipl.-Ing. Hans von Berg" → { gender: 'm', last: 'von Berg', dr: false, full }. */
  function person(raw) {
    let s = clean(raw, 160).split(/\s*(?:,|;|\bund\b|&|\/)\s*/)[0] || '';
    s = s.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || /\b(gmbh|ag|kg|ug|mbh|team|verwaltung|geschaftsfuhrung|geschaeftsfuehrung)\b/i.test(fold(s))) return null;
    let gender = null;
    const g = s.match(/^(herrn?|hr\.|frau|fr\.)\s+/i);
    if (g) { gender = /^f/i.test(g[1]) ? 'f' : 'm'; s = s.slice(g[0].length); }
    const words = s.split(' ').filter(Boolean);
    const dr = words.some(w => /^dr\.?$/i.test(w));
    const names = words.filter(w => !TITLE.test(w));
    if (!names.length) return null;
    let i = names.length - 1;
    while (i > 0 && PARTICLE.test(names[i - 1])) i--;
    const last = names.slice(i).join(' ');
    const first = i > 0 ? names[0] : '';
    if (!gender && first) {
      const f = fold(first.split('-')[0]);
      gender = MALE.has(f) ? 'm' : FEMALE.has(f) ? 'f' : null;
    }
    if (!/^[\p{L}][\p{L}' .-]+$/u.test(last)) return null;
    return { gender, last, first, dr, full: names.join(' ') };
  }

  /** „Sehr geehrter Herr Dr. Müller," / „Guten Tag Alex Müller," / „Sehr geehrte Damen und Herren," */
  function salutation(contactPerson, lang = 'de') {
    const p = person(contactPerson);
    if (lang === 'en') {
      if (p && p.gender) return `Dear ${p.gender === 'f' ? 'Ms' : 'Mr'} ${p.dr ? 'Dr ' : ''}${p.last},`;
      return p ? `Dear ${p.full},` : 'Dear Sir or Madam,';
    }
    if (p && p.gender === 'm') return `Sehr geehrter Herr ${p.dr ? 'Dr. ' : ''}${p.last},`;
    if (p && p.gender === 'f') return `Sehr geehrte Frau ${p.dr ? 'Dr. ' : ''}${p.last},`;
    return p ? `Guten Tag ${p.full},` : 'Sehr geehrte Damen und Herren,';
  }

  // ── Celé posolstvo ─────────────────────────────────────────────────────
  /** Texty o nás z predvolených a z Nastavení (marketing.presentation). */
  function texts(marketing) {
    const o = marketing && typeof marketing === 'object' && marketing.presentation && typeof marketing.presentation === 'object' ? marketing.presentation : {};
    const out = { ...TEXT };
    for (const k of ['about', 'whyH', 'why', 'languages', 'prices', 'references', 'cta_url', 'cta_label', 'reply_label', 'contact_name', 'contact_phone', 'contact_email', 'contact_role']) {
      if (typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim().slice(0, 1200);
    }
    if (!/^https:\/\//i.test(out.cta_url)) out.cta_url = TEXT.cta_url;
    out.trades = o.trades && typeof o.trades === 'object' ? o.trades : {};
    out.offered = Array.isArray(o.offered) ? o.offered.filter(k => TRADES.some(t => t.key === k)) : null;
    out.attach_default = o.attach_default !== false;
    return out;
  }

  const tradeByKey = (k) => TRADES.find(t => t.key === k) || null;
  function withOverride(t, T) {
    const o = (T.trades && T.trades[t.key]) || {};
    const tasks = Array.isArray(o.tasks) && o.tasks.length ? o.tasks.map(x => clean(x, 160)).filter(Boolean).slice(0, 6) : t.tasks;
    return { ...t, label: clean(o.label, 60) || t.label, team: clean(o.team, 60) || t.team, tasks };
  }

  /**
   * Čo firme napísať a ukázať.
   * @param {Object} o { lead, search, marketing (danubra_settings.marketing), lang, trade (vynútené) }
   */
  function pitch({ lead = {}, search = null, marketing = null, lang = 'de', trade = null } = {}) {
    const T = texts(marketing);
    const found = detect(lead, search, { offered: T.offered });
    const main = withOverride((trade && tradeByKey(trade)) || (found[0] && found[0].trade) || GENERIC, T);
    const also = found.map(x => x.trade).filter(t => t.key !== main.key).slice(0, 2).map(t => withOverride(t, T));
    const reg = region(lead, search);
    const headline = `${main.team} für Ihre Baustellen${reg.phrase ? ` ${reg.phrase}` : ''}`;
    const tasks = main.tasks.slice(0, 3);
    const points = [
      { title: main.key === 'bau' ? 'Fachkräfte für Ihr Bauvorhaben' : `Erfahrene ${main.team} – einzeln oder als Team`,
        text: `${tasks.join('; ')}${also.length ? `. Auf Wunsch auch ${also.map(t => t.team).join(' und ')}` : ''}.` },
      { title: 'Vollständige Unterlagen vor Projektstart', text: 'A1-Bescheinigung, Gewerbe, Steuernummer und Freistellungsbescheinigung nach § 48b EStG.' },
      { title: 'Ein deutschsprachiger Ansprechpartner', text: `Koordination von Einsatz, Ersatz und Abrechnung nach Stunden. Unterkunft und Anreise${reg.phrase ? ` für Ihre Baustellen ${reg.phrase}` : ''} organisieren wir.` },
    ];
    const preheader = `${main.team} aus der Slowakei${reg.name ? ` für ${reg.name}` : ''} – mit vollständigen Unterlagen und einem festen Ansprechpartner.`;
    return {
      lang, trade: main, also, trades: [main, ...also], region: reg, headline, preheader, points, texts: T,
      title: `punds – Ihr Partner für ${main.label}${reg.name ? ` in ${reg.name}` : ''}`,
      salutation: salutation(lead.contact_person, lang),
      cta: { url: T.cta_url, label: T.cta_label, reply: T.reply_label },
      fileName: `punds-${main.key}${reg.name ? `-${fold(reg.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''}.pdf`,
    };
  }

  const API = { TRADES, GENERIC, TEXT, fold, detect, region, germanPlace, person, salutation, texts, tradeByKey, pitch };
  if (typeof window !== 'undefined') window.DanubraPitch = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
