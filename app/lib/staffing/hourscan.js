// ============================================================================
// DANUBRA — Stundennachweis z fotky: čo sa prečíta a čo s tým
// ============================================================================
// „Toto im musíme posielať prázdne aj s infolistami… píšu si hodiny a majster
// ich podpíše… na základe toho fakturujeme. Toto je 99 % prípadov. Môžu
// posielať skupiny aj jednotlivci."
//
// Ľudia dostanú prázdny týždenný list (DanubraPapers.stundennachweis), píšu
// doň hodiny rukou, Polier ho podpíše a pošlú nám fotku. Fotku prečíta model
// (netlify/functions/danubra-read-hours.js) cez nástroj `TOOL`; tu je všetko
// ostatné:
//
//   normalize     hodiny v celých minútach, dátumy doplnené z KW, Po–Ne
//   matchWorkers  „Mynárik P." → Peter Mynárik; pod prahom sa nepriradí nič
//   check         čo si treba overiť skôr, než sa z toho fakturuje
//   toTimesheets  riadky do danubra_timesheets (hodiny ako '10.25')
//
// Hodiny nie sú peniaze, ale platí to isté pravidlo: vnútri sa počíta
// v celých minútach (nikdy nesčítavame desatinné hodiny), na hodiny
// s dvomi desatinnými sa prevádza až pri zápise.
//
// Model sa nemýli často, ale mýli sa — a rukopis na stavbe je horší než
// tlačená faktúra. Nič odtiaľto sa preto neuloží samo; človek to v appke
// odklikne.
//
// Čisté funkcie, bez siete. Testy: node app/lib/staffing/hourscan.test.js
// ============================================================================
(function () {
  // Pondelok = 1 … nedeľa = 7 (ISO). Na papieri je Po–So; nedeľa len keď na
  // nej niekto naozaj robil.
  const WD = [
    null,
    { key: 'mon', short: 'Mo', de: 'Montag', sk: 'Po' },
    { key: 'tue', short: 'Di', de: 'Dienstag', sk: 'Ut' },
    { key: 'wed', short: 'Mi', de: 'Mittwoch', sk: 'St' },
    { key: 'thu', short: 'Do', de: 'Donnerstag', sk: 'Št' },
    { key: 'fri', short: 'Fr', de: 'Freitag', sk: 'Pi' },
    { key: 'sat', short: 'Sa', de: 'Samstag', sk: 'So' },
    { key: 'sun', short: 'So', de: 'Sonntag', sk: 'Ne' },
  ];

  /** Pod týmto skóre sa meno nepriradí samo — vyberie človek. */
  const MATCH_MIN = 0.8;
  /** O toľko musí byť najlepší kandidát lepší než druhý, inak je to nejasné. */
  const MATCH_GAP = 0.1;
  const MAX_DAY = 12 * 60;

  // ── Čo sa od modelu pýta ──────────────────────────────────────────────────
  const strOrNull = (description) => ({ type: ['string', 'null'], description });
  const intOrNull = (description) => ({ type: ['integer', 'null'], description });

  const TOOL = {
    name: 'stundennachweis',
    description: 'Zapíše hodiny prečítané z ručne vyplneného týždenného výkazu (Stundennachweis).',
    input_schema: {
      type: 'object',
      properties: {
        kw_from: strOrNull('Pondelok týždňa ako RRRR-MM-DD, ak sa dá určiť z dátumov alebo z KW; inak null'),
        kw: intOrNull('Číslo týždňa (KW), ak je na papieri napísané'),
        project: { type: 'string', description: 'Pole „Projekt", ak je vyplnené' },
        site: { type: 'string', description: 'Pole „Baustelle", ak je vyplnené' },
        customer: { type: 'string', description: 'Pole „Kunde", ak je vyplnené' },
        days: {
          type: 'array',
          description: 'Stĺpce dní (Montag … Samstag, prípadne Sonntag) — riadky Datum, Stunden (von–bis), Pause',
          items: {
            type: 'object',
            properties: {
              weekday: { type: 'integer', minimum: 1, maximum: 7, description: '1 = Montag … 6 = Samstag, 7 = Sonntag — podľa stĺpca' },
              date: strOrNull('Dátum ako RRRR-MM-DD (rok doplň zo zadania, ak chýba); null, ak nie je napísaný'),
              date_text: { type: 'string', description: 'Dátum tak, ako je napísaný (napr. „19.10.")' },
              from: strOrNull('Začiatok z riadku „von–bis", HH:MM; null, ak nie je'),
              to: strOrNull('Koniec z riadku „von–bis", HH:MM; null, ak nie je'),
              pause_min: intOrNull('Prestávka v minútach („/" = 0, prázdne = null)'),
              pause_text: { type: 'string', description: 'Prestávka tak, ako je napísaná' },
            },
            required: ['weekday'],
          },
        },
        rows: {
          type: 'array',
          description: 'Riadky s menami, zhora nadol; prázdne riadky bez mena vynechaj',
          items: {
            type: 'object',
            properties: {
              name_raw: { type: 'string', description: 'Meno tak, ako je napísané (napr. „Mynárik P.")' },
              per_day: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    weekday: { type: 'integer', minimum: 1, maximum: 7 },
                    hours_text: { type: 'string', description: 'Políčko presne tak, ako je napísané („10", „10 STD/15 min", „/")' },
                    minutes: intOrNull('Odrobený čas v celých minútach (10 STD/15 min = 615, „/" alebo prázdne = 0); null, ak je nečitateľné'),
                  },
                  required: ['weekday', 'hours_text'],
                },
              },
              total_text: { type: 'string', description: 'Súčet v stĺpci „Insgesamt" tak, ako je napísaný' },
              total_minutes: intOrNull('Ten istý súčet v minútach; null, ak nie je napísaný'),
            },
            required: ['name_raw', 'per_day'],
          },
        },
        total_text: { type: 'string', description: 'Celkový súčet (Total / Gesamt) tak, ako je napísaný' },
        total_minutes: intOrNull('Celkový súčet v minútach; null, ak nie je napísaný'),
        signed: { type: 'boolean', description: 'true, len ak je v poli „Unterschrift" naozaj podpis' },
        signer_name: strOrNull('Meno v poli „Name in Druckbuchstaben", ak je čitateľné'),
        notes: { type: 'string', description: 'Krátko po slovensky, čo je ešte dôležité (poznámky na papieri, viac listov na fotke…)' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Ako dobre sa list čítal' },
        unclear: { type: 'array', items: { type: 'string' },
          description: 'Každé nejasné políčko po slovensky, napr. „Mynárik P., Di: 7 alebo 1"' },
      },
      required: ['days', 'rows', 'signed', 'confidence'],
    },
  };

  /**
   * Zadanie pre model.
   * @param {Object} o  { year, workers: [mená], site }
   */
  function instructions({ year, workers = [], site = '' } = {}) {
    const y = Number(year) || new Date().getUTCFullYear();
    const mena = (workers || []).map((w) => String((w && w.full_name) || w || '').trim()).filter(Boolean);
    return [
      'Prečítaj priložený týždenný výkaz hodín (Stundennachweis) a zapíš ho cez nástroj stundennachweis.',
      '',
      'O čo ide: firma Partner und Service s. r. o. posiela živnostníkov zo Slovenska a Maďarska na stavby',
      'v Nemecku. Každý týždeň si na tento papier rukou píšu hodiny a nemecký majster (Kunde, Polier) ho',
      'podpíše. Z neho sa fakturuje — každá hodina je peniaz, preto presnosť je dôležitejšia než úplnosť.',
      'List môže byť za celú partiu (viac mien) alebo za jedného človeka.',
      '',
      'AKO LIST VYZERÁ',
      '- Hore polia Projekt, Baustelle, Kunde, KW; vpravo „Name in Druckbuchstaben" a „Unterschrift von dem Kunde".',
      '- Stĺpce Montag … Samstag (niekedy aj Sonntag) a „Insgesamt" (súčet za týždeň).',
      '- Riadky: Datum; Stunden (von–bis) — čas od–do, spoločný pre všetkých na liste; Pause; potom riadky s menami',
      '  a hodinami po dňoch; dole Total (celkový súčet).',
      '',
      'PRAVIDLÁ',
      '- Prepisuj presne, nič si nevymýšľaj a nič nedopočítavaj. Čo na papieri nie je, nechaj prázdne alebo null.',
      '- Políčko s „/", „-", „—", „x" alebo prázdne znamená, že v ten deň nerobil: minutes = 0.',
      '- „STD", „Std.", „St." aj „h" znamená Stunden (hodiny). minutes sú vždy celé minúty:',
      '  „10" = 600, „10,5" = 630, „9½" = 570, „10:15" = 615, „10 STD/15 min" = 615 (10 h 15 min), „6 STD" = 360.',
      '- hours_text prepíš presne tak, ako je napísané — aj s „STD" a lomkami. Podľa neho sa minúty ešte overia.',
      '- Riadok „Stunden (von–bis)" zapíš do days (from, to ako HH:MM, napr. 6:00 → 06:00).',
      '  Hodiny človeka z neho NEdopočítavaj: keď je riadok s menom v ten deň prázdny, minutes = 0 a uveď to v unclear.',
      '- Pause v minútach: „45 min" = 45, „0:30" = 30, „1 h" = 60, „/" = 0; prázdne = null.',
      `- Dátumy býva bez roka („19.10.") — doplň rok ${y}. Pri prelome rokov patrí december do skoršieho a január`,
      '  do neskoršieho roka. weekday je podľa stĺpca (1 = Montag … 6 = Samstag, 7 = Sonntag), nie podľa výpočtu.',
      '- kw_from = pondelok toho týždňa (RRRR-MM-DD), ak sa dá určiť z dátumov alebo z KW (ISO týždeň). kw = číslo',
      '  týždňa, ak je napísané.',
      '- name_raw je meno tak, ako je napísané (napr. „Mynárik P.", „Ákos P."). Nepridávaj krstné meno ani',
      '  priezvisko, ktoré na papieri nie je. Riadky bez mena a bez hodín vynechaj.',
      mena.length ? `- Ľudia na tejto stavbe (pomôže pri nečitateľnom písme, keď je zrejmé, ktoré meno to je — vtedy použi jeho pravopis): ${mena.join(', ')}.` : '',
      site ? `- Stavba podľa appky: ${String(site).trim()}.` : '',
      '- total_text / total_minutes pri riadku aj celkový súčet prepíš tak, ako sú napísané, aj keď nesedia',
      '  s tvojím súčtom. Neopravuj ich — nesúlad je presne to, čo potrebujeme vidieť.',
      '- signed = true, len ak je v poli pre podpis naozaj podpis (nie prázdna čiara). signer_name = meno',
      '  v „Name in Druckbuchstaben", ak je čitateľné.',
      '- unclear: každé políčko, ktoré je rozmazané, prepisované, prečiarknuté alebo si ním nie si istý, po slovensky',
      '  a s menom a dňom, napr. „Mynárik P., Di: 7 alebo 1". Radšej viac než menej.',
      '- confidence: high = všetko jasne čitateľné; medium = pár nejasných políčok; low = veľká časť sa nedá prečítať.',
      '- notes: krátko po slovensky, len ak je niečo dôležité (poznámka na papieri, viac listov na fotke — vtedy',
      '  prečítaj len prvý a napíš to sem).',
    ].filter(Boolean).join('\n');
  }

  // ── Pomôcky ───────────────────────────────────────────────────────────────
  const str = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
  const intOf = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const utc = (s) => new Date(`${s}T00:00:00Z`);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const weekdayOf = (s) => ((utc(s).getUTCDay() + 6) % 7) + 1;
  const mondayOfDate = (s) => addDays(s, 1 - weekdayOf(s));
  const validYmd = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const s = `${y}-${pad(m)}-${pad(d)}`;
    return ymd(utc(s)) === s ? s : null;
  };

  function isoWeek(s) {
    const thu = addDays(s, 4 - weekdayOf(s));
    const year = Number(thu.slice(0, 4));
    const week = Math.floor((utc(thu) - utc(`${year}-01-01`)) / 86400000 / 7) + 1;
    return { year, week };
  }
  function mondayOfWeek(year, week) {
    const jan4 = `${year}-01-04`;
    return addDays(mondayOfDate(jan4), (week - 1) * 7);
  }

  /**
   * Dátum z papiera. Plný („19.10.2026", „2026-10-19") sa prevezme; bez roka
   * („19.10.") dostane rok podľa dňa v týždni: 19. 10. je pondelok len
   * v niektorých rokoch, takže stĺpec Montag rozhodne aj na prelome rokov.
   */
  function parseDate(v, { year, weekday } = {}) {
    const s = str(v);
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return validYmd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]?\s*(\d{2,4})?\.?$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2];
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return validYmd(y, mo, d);
    }
    const y0 = Number(year) || new Date().getUTCFullYear();
    const cands = [y0, y0 + 1, y0 - 1].map((y) => validYmd(y, mo, d)).filter(Boolean);
    if (!cands.length) return null;
    if (weekday >= 1 && weekday <= 7) {
      const hit = cands.find((c) => weekdayOf(c) === weekday);
      if (hit) return hit;
    }
    return cands[0];
  }

  /** „6:00", „6.00", „6", „06:00 Uhr", „7⁰⁰" → „06:00"; inak null. */
  function parseTime(v) {
    const s = str(v).toLowerCase().replace(/uhr|h$/g, '').replace(/[⁰]/g, '0').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})(?:\s*[:.,h]\s*(\d{2}))?$/);
    if (!m) return null;
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h > 24 || mi > 59 || (h === 24 && mi)) return null;
    return `${pad(h)}:${pad(mi)}`;
  }
  const clock = (t) => { const x = parseTime(t); return x ? (+x.slice(0, 2)) * 60 + (+x.slice(3)) : null; };

  /**
   * Odrobený čas z „od–do" mínus prestávka, v minútach. Nočná zmena (koniec
   * skôr než začiatok) ide cez polnoc. Chýba začiatok alebo koniec → null.
   */
  function minutesFrom(from, to, pauseMin) {
    const a = clock(from), b = clock(to);
    if (a == null || b == null) return null;
    let span = b - a;
    if (span <= 0) span += 24 * 60;
    const p = intOf(pauseMin);
    return Math.max(0, span - (p && p > 0 ? p : 0));
  }

  const EMPTY = /^[\s\/\\\-–—_x×.,:0]*$/i;

  /**
   * Políčko s hodinami → minúty. „/", „-", prázdne aj „0" = 0; nezmysel = null.
   *   „10" 600 · „10,5" 630 · „9½" 570 · „10:15" 615 · „10 STD/15 min" 615
   *   „8 h 30" 510 · „45 min" 45 · „10 1/4" 615
   */
  function parseHours(text) {
    if (text == null) return 0;
    if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? Math.round(text * 60) : null;
    let s = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
    if (EMPTY.test(s)) return 0;
    s = s.replace(/(\d)\s*½/g, '$1.5').replace(/½/g, '0.5')
      .replace(/(\d)\s*¼/g, '$1.25').replace(/¼/g, '0.25')
      .replace(/(\d)\s*¾/g, '$1.75').replace(/¾/g, '0.75')
      .replace(/(\d+)\s+1\/2\b/g, '$1.5').replace(/(\d+)\s+1\/4\b/g, '$1.25').replace(/(\d+)\s+3\/4\b/g, '$1.75');
    const U = '(?:stunden|stunde|std\\.?|st\\.?|h)';
    const M = '(?:minuten|min\\.?|m)';
    let m;
    // 10:15 (aj „10:15 h")
    if ((m = s.match(new RegExp(`^(\\d{1,3})\\s*:\\s*(\\d{2})\\s*${U}?$`)))) {
      return +m[2] < 60 ? (+m[1]) * 60 + (+m[2]) : null;
    }
    // 10 STD/15 min · 10h 15min · 10 h 15 · 10 std + 15 min
    if ((m = s.match(new RegExp(`^(\\d{1,3})\\s*${U}\\s*(?:[\\/+,;]|und|u\\.)?\\s*(\\d{1,2})\\s*${M}?$`)))
      || (m = s.match(new RegExp(`^(\\d{1,3})\\s*(?:[\\/+;]|und|u\\.)\\s*(\\d{1,2})\\s*${M}$`)))) {
      return +m[2] < 60 ? (+m[1]) * 60 + (+m[2]) : null;
    }
    // len minúty
    if ((m = s.match(new RegExp(`^(\\d{1,4})\\s*${M}$`)))) return +m[1];
    // 10 · 10,5 · 10.25 STD
    if ((m = s.match(new RegExp(`^(\\d{1,3})(?:[.,](\\d{1,2}))?\\s*${U}?\\.?$`)))) {
      const frac = m[2] ? Math.round(Number(`0.${m[2]}`) * 60) : 0;
      return (+m[1]) * 60 + frac;
    }
    return null;
  }

  /** Prestávka: číslo v minútach; „45 min", „0:30", „1 h", „/" ; holé „1" alebo „0,5" sú hodiny. */
  function parsePause(v, text) {
    if (isInt(v) && v >= 0) return v;
    const s = str(text != null && text !== '' ? text : v);
    if (!s) return null;
    if (EMPTY.test(s)) return 0;
    const bare = s.match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
    if (bare) {
      const n = Number(`${bare[1]}.${bare[2] || 0}`);
      return n <= 3 ? Math.round(n * 60) : Math.round(n);
    }
    return parseHours(s);
  }

  /** Minúty → hodiny pre databázu: 615 → '10.25', 610 → '10.17'. Bez desatinných čísel v súčtoch. */
  function hoursDecimal(min) {
    const c = Math.round((Math.max(0, intOf(min) || 0) * 5) / 3);   // stotiny hodiny
    return `${Math.floor(c / 100)}.${pad(c % 100)}`;
  }
  /** Minúty → „10:15" (na obrazovku). 0 → ''. */
  function hm(min) {
    const v = intOf(min) || 0;
    if (!v) return '';
    return `${Math.floor(v / 60)}:${pad(v % 60)}`;
  }
  /** Minúty → nemecké hodiny na doklad: 600 → „10", 615 → „10,25". 0 → ''. */
  function hoursDe(min) {
    const v = intOf(min) || 0;
    if (!v) return '';
    const d = hoursDecimal(v).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return d.replace('.', ',');
  }

  const nameClean = (s) => str(s).replace(/^[\d.)\s]+(?=\p{L})/u, '');

  // ── Čistenie ──────────────────────────────────────────────────────────────
  /**
   * Výstup modelu → čistý list. Tvar zostáva ako pri nástroji (kw_from, days,
   * rows[].per_day), len je všetko overené a dopočítané:
   *
   *   kw_from        pondelok týždňa alebo null; year, week = ISO týždeň
   *   days[]         Po–So vždy, nedeľa len keď je vyplnená;
   *                  { weekday, key, de, short, date, date_text, from, to,
   *                    pause_min, span_minutes }
   *   rows[]         { name_raw, name, per_day[] (rovnaké dni ako days:
   *                    { weekday, date, hours_text, minutes }), sum_minutes,
   *                    total_text, total_minutes }
   *                  minutes: celé minúty; 0 = nerobil; null = nečitateľné
   *   total_text, total_minutes   súčet napísaný na papieri (null = nie je)
   *   sum_minutes    súčet všetkých políčok
   *   signed, signer_name, notes, confidence, unclear[], project, site, customer
   *   issues[]       { code, … } — z nich robí check() vety
   *
   * @param {Object} raw  vstup nástroja `stundennachweis`
   * @param {Object} o    { year } — rok pre dátumy bez roka
   */
  function normalize(raw, { year } = {}) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const y0 = Number(year) || new Date().getUTCFullYear();
    const issues = [];
    const wdOf = (v) => { const n = intOf(v); return n >= 1 && n <= 7 ? n : null; };

    // Dni zo zápisu modelu (po stĺpcoch).
    const readDays = new Map();
    for (const d of Array.isArray(r.days) ? r.days : []) {
      const wd = wdOf(d && d.weekday);
      if (!wd || readDays.has(wd)) continue;
      readDays.set(wd, d);
    }
    const parsedDate = new Map();
    for (const [wd, d] of readDays) {
      const p = parseDate(d.date, { year: y0, weekday: wd }) || parseDate(d.date_text, { year: y0, weekday: wd });
      if (p) parsedDate.set(wd, p);
    }

    // Pondelok: z kw_from, inak z dátumov (väčšina), inak z čísla KW.
    let monday = null;
    const kwFrom = parseDate(r.kw_from, { year: y0, weekday: 1 });
    if (kwFrom) monday = mondayOfDate(kwFrom);
    const votes = new Map();
    for (const [wd, p] of parsedDate) {
      const mo = addDays(p, 1 - wd);
      votes.set(mo, (votes.get(mo) || 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!monday && best) monday = best[0];
    else if (monday && best && best[0] !== monday && best[1] >= 2) {
      issues.push({ code: 'kw_conflict', kw_from: monday, dates_monday: best[0] });
      monday = best[0];                    // dátumy pri dňoch sú istejšie než prepočet KW
    }
    const kwNum = intOf(r.kw);
    if (!monday && kwNum >= 1 && kwNum <= 53) monday = mondayOfWeek(y0, kwNum);
    if (!monday) issues.push({ code: 'no_week' });

    const rowsIn = (Array.isArray(r.rows) ? r.rows : []).filter((x) => x && typeof x === 'object');

    // Nedeľa sa ukáže, len keď je na nej niečo zapísané.
    const sundayUsed = readDays.has(7) && (() => {
      const d = readDays.get(7);
      return !!(parseTime(d.from) || parseTime(d.to));
    })() || rowsIn.some((x) => (x.per_day || []).some((c) => wdOf(c && c.weekday) === 7
      && ((intOf(c.minutes) || 0) > 0 || (parseHours(c.hours_text) || 0) > 0)));
    const wds = sundayUsed ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];

    const days = wds.map((wd) => {
      const d = readDays.get(wd) || {};
      const date = monday ? addDays(monday, wd - 1) : (parsedDate.get(wd) || null);
      const read = parsedDate.get(wd) || null;
      if (read && date && read !== date) issues.push({ code: 'date_conflict', weekday: wd, read, date });
      const from = parseTime(d.from), to = parseTime(d.to);
      const pause = parsePause(d.pause_min, d.pause_text);
      return {
        weekday: wd, key: WD[wd].key, de: WD[wd].de, short: WD[wd].short,
        date, date_text: str(d.date_text) || null,
        from, to, pause_min: pause,
        span_minutes: minutesFrom(from, to, pause),
      };
    });

    const rows = rowsIn.map((x, index) => {
      const cells = new Map();
      for (const c of Array.isArray(x.per_day) ? x.per_day : []) {
        const wd = wdOf(c && c.weekday);
        if (wd && !cells.has(wd)) cells.set(wd, c);
      }
      const name_raw = str(x.name_raw);
      const per_day = days.map((d) => {
        const c = cells.get(d.weekday) || {};
        const text = str(c.hours_text);
        const model = intOf(c.minutes);
        const parsed = text ? parseHours(text) : null;
        let minutes;
        if (parsed != null) {
          minutes = parsed;
          if (model != null && model !== parsed) {
            issues.push({ code: 'cell_disagree', row: index, name: name_raw, weekday: d.weekday, text, model, parsed });
          }
        } else if (text) {
          minutes = model != null && model >= 0 ? model : null;
          if (minutes == null) issues.push({ code: 'unreadable', row: index, name: name_raw, weekday: d.weekday, text });
        } else {
          minutes = model != null && model >= 0 ? model : 0;
        }
        return { weekday: d.weekday, date: d.date, hours_text: text, minutes };
      });
      const total_text = str(x.total_text);
      const tParsed = total_text ? parseHours(total_text) : null;
      const total_minutes = tParsed != null && total_text && !EMPTY.test(total_text)
        ? tParsed : (intOf(x.total_minutes) != null && intOf(x.total_minutes) > 0 ? intOf(x.total_minutes) : null);
      const sum_minutes = per_day.reduce((n, c) => n + (c.minutes || 0), 0);
      return { name_raw, name: nameClean(name_raw), per_day, sum_minutes, total_text, total_minutes };
    }).filter((x) => x.name_raw || x.sum_minutes);

    const total_text = str(r.total_text);
    const gParsed = total_text && !EMPTY.test(total_text) ? parseHours(total_text) : null;
    const total_minutes = gParsed != null ? gParsed
      : (intOf(r.total_minutes) > 0 ? intOf(r.total_minutes) : null);
    const sum_minutes = rows.reduce((n, x) => n + x.sum_minutes, 0);
    const wk = monday ? isoWeek(monday) : null;

    return {
      kw_from: monday, year: wk ? wk.year : null, week: wk ? wk.week : null,
      kw: kwNum >= 1 && kwNum <= 53 ? kwNum : null,
      project: str(r.project), site: str(r.site), customer: str(r.customer),
      days, rows, total_text, total_minutes, sum_minutes,
      signed: r.signed === true,
      signer_name: str(r.signer_name) || null,
      notes: str(r.notes),
      confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'low',
      unclear: (Array.isArray(r.unclear) ? r.unclear : []).map(str).filter(Boolean),
      issues,
    };
  }

  // ── Priradenie mien ───────────────────────────────────────────────────────
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/ß/g, 'ss').toLowerCase();
  const tokens = (s) => fold(s).replace(/[^a-z\s.-]/g, ' ').split(/[\s.-]+/).filter(Boolean);

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

  /**
   * Ako veľmi sa meno z papiera podobá na človeka. 1 = celé meno sedí,
   * ~0.95 = priezvisko a začiatočné písmeno („Mynárik P." ↔ „Peter Mynárik"),
   * 0.85 = len jedno slovo. Začiatočné písmeno, ktoré nesedí, ťahá dole.
   */
  function nameScore(raw, fullName) {
    const rt = tokens(raw), wt = tokens(fullName);
    if (!rt.length || !wt.length) return 0;
    const words = rt.filter((t) => t.length >= 2);
    const initials = rt.filter((t) => t.length === 1);
    if (!words.length) return 0;
    const used = new Set();
    let total = 0;
    for (const w of words) {
      let bi = -1, bs = 0;
      wt.forEach((t, i) => {
        if (used.has(i)) return;
        const s = sim(w, t);
        if (s > bs) { bs = s; bi = i; }
      });
      if (bi >= 0 && bs >= 0.5) used.add(bi);
      total += bi >= 0 && bs >= 0.5 ? bs : 0;
    }
    let score = total / words.length;
    const rest = wt.filter((_, i) => !used.has(i));
    if (words.length === 1 && wt.length > 1) score *= 0.85;   // len priezvisko alebo len krstné meno
    for (const ini of initials) {
      if (rest.some((t) => t[0] === ini)) score += 0.1;
      else score -= 0.15;
    }
    if (words.length >= 2 && rest.length && !initials.length) score -= 0.05 * rest.length;
    return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  }

  /**
   * Riadky listu → ku každému { worker_id, score, candidates[] }.
   * Priradí sa len nad prahom (MATCH_MIN) a keď druhý kandidát nie je
   * takmer rovnako dobrý — dvaja bratia Mynárikovci sa nesmú zameniť.
   * Ten istý človek sa nepriradí dvom riadkom; vyhrá lepšia zhoda.
   *
   * @param {Array} rows     sheet.rows (name_raw)
   * @param {Array} workers  [{ id, full_name }]
   */
  function matchWorkers(rows, workers) {
    const ws = (workers || []).filter((w) => w && w.id && w.full_name);
    const out = (rows || []).map((row) => {
      const scored = ws.map((w) => ({ worker_id: w.id, full_name: w.full_name, score: nameScore(row && row.name_raw, w.full_name) }))
        .filter((c) => c.score >= 0.4)
        .sort((a, b) => b.score - a.score);
      const top = scored[0], second = scored[1];
      const sure = top && top.score >= MATCH_MIN && (!second || top.score - second.score >= MATCH_GAP);
      return { ...row, worker_id: sure ? top.worker_id : null, score: top ? top.score : 0, candidates: scored.slice(0, 3) };
    });
    const byWorker = new Map();
    out.forEach((r, i) => {
      if (!r.worker_id) return;
      const j = byWorker.get(r.worker_id);
      if (j == null) { byWorker.set(r.worker_id, i); return; }
      const loser = out[j].score >= r.score ? i : j;
      if (loser === j) byWorker.set(r.worker_id, i);
      out[loser] = { ...out[loser], worker_id: null, duplicate: true };
    });
    return out;
  }

  // ── Kontrola ──────────────────────────────────────────────────────────────
  const dayName = (wd) => (WD[wd] ? WD[wd].sk : '?');
  const sumText = (m) => {
    const v = intOf(m) || 0;
    return v % 60 ? `${Math.floor(v / 60)} h ${v % 60} min` : `${v / 60} h`;
  };
  const who = (row, i) => (row && (row.name || row.name_raw)) || `riadok ${i + 1}`;

  /**
   * Čo si treba overiť, kým sa z listu fakturuje. Každé upozornenie je
   * { code, level: 'error' | 'warn' | 'info', text } — text po slovensky.
   * Nepriradené mená sa hlásia len pri riadkoch z matchWorkers (majú kľúč
   * `worker_id`); list rovno z normalize() sa kontroluje bez nich.
   */
  function check(sheet) {
    const s = sheet || {};
    const out = [];
    const add = (code, level, text, extra) => out.push({ code, level, text, ...(extra || {}) });
    const days = s.days || [];
    const dayBy = new Map(days.map((d) => [d.weekday, d]));
    const rows = s.rows || [];

    for (const is of s.issues || []) {
      if (is.code === 'no_week') add('no_week', 'error', 'Nedá sa určiť týždeň — na liste nie sú dátumy ani KW. Vyberte týždeň ručne.');
      if (is.code === 'kw_conflict') add('kw_conflict', 'warn', `KW na liste nesedí s dátumami pri dňoch — použili sa dátumy (týždeň od ${is.dates_monday}).`);
      if (is.code === 'date_conflict') add('date_conflict', 'warn', `${dayName(is.weekday)}: dátum na liste (${is.read}) nesedí s týždňom (${is.date}).`, { weekday: is.weekday });
      if (is.code === 'unreadable') add('unreadable', 'error', `${is.name || 'Riadok'}, ${dayName(is.weekday)}: „${is.text}" sa nedá prečítať ako hodiny.`, { row: is.row, weekday: is.weekday });
      if (is.code === 'cell_disagree') add('cell_disagree', 'warn', `${is.name || 'Riadok'}, ${dayName(is.weekday)}: „${is.text}" je ${sumText(is.parsed)}, model čítal ${sumText(is.model)} — overte.`, { row: is.row, weekday: is.weekday });
    }

    rows.forEach((row, i) => {
      const cells = row.per_day || [];
      const sum = cells.reduce((n, c) => n + (c.minutes || 0), 0);
      if (row.total_minutes != null && row.total_minutes !== sum) {
        add('row_total', 'error', `${who(row, i)}: súčet dní je ${sumText(sum)}, na liste je napísané ${sumText(row.total_minutes)}.`, { row: i });
      }
      for (const c of cells) {
        const m = c.minutes || 0;
        if (!m) continue;
        const d = dayBy.get(c.weekday);
        if (d && d.span_minutes != null && m > d.span_minutes) {
          add('over_span', 'warn', `${who(row, i)}, ${dayName(c.weekday)}: ${sumText(m)}, ale od–do mínus pauza je len ${sumText(d.span_minutes)}.`, { row: i, weekday: c.weekday });
        }
        if (m > MAX_DAY) add('over_12h', 'warn', `${who(row, i)}, ${dayName(c.weekday)}: ${sumText(m)} za deň — viac než 12 hodín.`, { row: i, weekday: c.weekday });
        if (c.weekday === 7) add('sunday', 'warn', `${who(row, i)}: práca v nedeľu (${sumText(m)}) — v Nemecku len výnimočne, overte so stavbou.`, { row: i, weekday: 7 });
        if (/^\d{1,2}[.,](\d{2})$/.test(c.hours_text || '') && !/[.,](00|25|50|75)$/.test(c.hours_text)) {
          add('ambiguous', 'warn', `${who(row, i)}, ${dayName(c.weekday)}: „${c.hours_text}" — desatinné hodiny, alebo hodiny a minúty? Počíta sa ${sumText(m)}.`, { row: i, weekday: c.weekday });
        }
      }
      // Len pri riadkoch, ktoré už prešli matchWorkers — inak by každý
      // riadok čerstvo prečítaného listu kričal, že je nepriradený.
      if ('worker_id' in row && !row.worker_id) {
        const c = (row.candidates || [])[0];
        add('unmatched', 'error', `„${row.name_raw || who(row, i)}" sa nedá jednoznačne priradiť${c ? ` (najbližšie: ${c.full_name})` : ''} — vyberte človeka.`, { row: i });
      }
    });

    const sum = rows.reduce((n, r) => n + (r.per_day || []).reduce((a, c) => a + (c.minutes || 0), 0), 0);
    if (s.total_minutes != null && s.total_minutes !== sum) {
      const written = rows.every((r) => r.total_minutes != null)
        ? rows.reduce((n, r) => n + r.total_minutes, 0) : null;
      add('grand_total', 'error', `Súčet všetkých dní je ${sumText(sum)}, celkový súčet na liste je ${sumText(s.total_minutes)}`
        + (written === s.total_minutes ? ' (sedí so súčtami riadkov — chyba je v niektorom riadku).' : '.'));
    }
    if (!s.signed) add('unsigned', 'error', 'List nie je podpísaný odberateľom — bez podpisu nie je podkladom k faktúre.');
    if (s.confidence === 'low') add('low_confidence', 'warn', 'List sa čítal ťažko — skontrolujte každé číslo podľa fotky.');
    for (const u of s.unclear || []) add('unclear', 'info', `Nejasné: ${u}`);
    return out;
  }

  // ── Zápis do evidencie hodín ──────────────────────────────────────────────
  /**
   * List → riadky pre danubra_timesheets. Prázdne dni sa vynechajú.
   * Čas od–do sa zapíše len vtedy, keď presne sedí s hodinami toho človeka
   * (od–do mínus pauza = jeho hodiny) — inak by na zázname bol čas, ktorý
   * nerobil.
   *
   * @param {Object} sheet  normalize() + matchWorkers() (rows[].worker_id)
   * @param {Object} o      { assignmentFor(workerId, date) → nasadenie | id | null }
   * @returns {{ rows: Object[], missing: Object[] }}
   *   missing: { row, name, worker_id, date, weekday, minutes, reason: 'no_worker' | 'no_assignment' | 'unreadable' | 'no_date' }
   */
  function toTimesheets(sheet, { assignmentFor } = {}) {
    const s = sheet || {};
    const dayBy = new Map((s.days || []).map((d) => [d.weekday, d]));
    const rows = [], missing = [];
    (s.rows || []).forEach((row, i) => {
      for (const c of row.per_day || []) {
        const d = dayBy.get(c.weekday) || {};
        const date = c.date || d.date || null;
        const base = { row: i, name: row.name || row.name_raw, worker_id: row.worker_id || null, date, weekday: c.weekday, minutes: c.minutes };
        if (c.minutes == null) { if (c.hours_text) missing.push({ ...base, reason: 'unreadable' }); continue; }
        if (!c.minutes) continue;
        if (!date) { missing.push({ ...base, reason: 'no_date' }); continue; }
        if (!row.worker_id) { missing.push({ ...base, reason: 'no_worker' }); continue; }
        const a = typeof assignmentFor === 'function' ? assignmentFor(row.worker_id, date) : null;
        const assignment_id = a && typeof a === 'object' ? a.id : a;
        if (!assignment_id) { missing.push({ ...base, reason: 'no_assignment' }); continue; }
        const exact = d.span_minutes != null && d.span_minutes === c.minutes;
        rows.push({
          worker_id: row.worker_id, assignment_id, work_date: date,
          hours: hoursDecimal(c.minutes),
          time_from: exact ? d.from : null, time_to: exact ? d.to : null,
          activity_type: 'construction', source: 'stundennachweis',
          approved: s.signed === true,
        });
      }
    });
    return { rows, missing };
  }

  const API = {
    TOOL, instructions, normalize, matchWorkers, check, toTimesheets,
    minutesFrom, parseHours, parsePause, parseTime, parseDate, nameScore,
    hoursDecimal, hoursDe, hm, isoWeek, mondayOfWeek, WD, MATCH_MIN, MATCH_GAP,
  };
  if (typeof window !== 'undefined') window.DanubraHourScan = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
