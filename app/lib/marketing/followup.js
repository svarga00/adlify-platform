// ============================================================================
// DANUBRA — kedy sa firme znova ozvať (z toho, čo povedala do telefónu)
// ============================================================================
// „…aby sme nezabudli na ďalší krok — keď niekto povie, že sa máme ozvať
// o 2–3 týždne alebo mesiace, aby sme sa naozaj ozvali."
//
// Tu je pravidlový čitateľ dátumu z poznámky po slovensky aj po nemecky.
// Ide vždy ako prvý; AI na serveri (danubra-lead-contact) dostane jeho
// výsledok ako pomôcku a keď AI nie je, platí on. Návrh človek vždy vidí
// a potvrdí — sám nič neuloží.
//
// Pravidlá (zámerne radšej skôr ako neskoro):
//   * rozsah „2–3 týždne", „zwei bis drei Monate" → SKORŠÍ koniec (2 týždne)
//     — keď sa ozveme o pár dní skôr, nič sa nestane; keď neskoro, firma už
//     má ľudí od niekoho iného,
//   * „za / o / in N dní · týždňov · mesiacov · rokov", „pol roka", „pár dní",
//   * budúci týždeň → pondelok budúceho týždňa, budúci mesiac → 1. deň,
//   * mesiac („v marci", „im März") → 1. deň mesiaca, „začiatkom" = 1.,
//     „v polovici / Mitte" = 15., „koncom / Ende" = 20. (aby sme stihli),
//     mesiac, ktorý už bol, = budúci rok; ten istý mesiac = o týždeň,
//   * „po Novom roku", „nach Neujahr", „po Vianociach" → 8. januára
//     (6. 1. je sviatok na Slovensku aj v Bavorsku a Bádensku),
//   * „po Veľkej noci", „nach Ostern" → utorok po Veľkonočnom pondelku,
//   * „na jar / im Frühjahr" → 1. marca, „v lete" → 1. júna, „na jeseň" →
//     1. septembra, „po sezóne / nach der Saison" → 2. novembra (stavebná
//     sezóna končí s mrazom), „pred sezónou" → 1. februára,
//   * presný dátum „15. 3.", „15.03.2027", „15. marca", „KW 12",
//   * deň v týždni „v pondelok", „am Freitag" → najbližší taký deň,
//   * sobota a nedeľa → pondelok. Výsledok je vždy najskôr zajtra.
//
// Dátumy sú v pásme Europe/Bratislava ako text „YYYY-MM-DD".
// Testy: node app/lib/marketing/followup.test.js
// ============================================================================
(function () {
  const TZ = 'Europe/Bratislava';
  const DAY = 86400e3;

  /** Malé písmená bez diakritiky — „Týždne", „März" → „tyzdne", „marz". */
  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[–—]/g, '-');
  }

  // ── Dátumy ako počet dní ────────────────────────────────────────────────
  const toMs = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const mk = (y, m, d) => ymd(Date.UTC(y, m - 1, d));
  const parts = (s) => String(s).split('-').map(Number);
  const addDays = (s, n) => ymd(toMs(s) + Math.round(n) * DAY);
  const weekday = (s) => new Date(toMs(s)).getUTCDay(); // 0 = nedeľa
  function addMonths(s, n) {
    const [y, m, d] = parts(s);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return mk(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, last));
  }
  /** Sobota a nedeľa → pondelok. */
  function workday(s) {
    const w = weekday(s);
    return w === 6 ? addDays(s, 2) : w === 0 ? addDays(s, 1) : s;
  }
  /** Dnešný deň v pásme (nie v UTC — o polnoci by to bol včerajšok). */
  function today(now = new Date(), tz = TZ) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
    } catch (e) { return ymd(new Date(now).getTime()); }
  }
  /** Veľkonočná nedeľa (gregoriánsky kalendár, Gaussov/Anonymný algoritmus). */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return mk(y, month, day);
  }
  /** Pondelok ISO týždňa `w` v roku `y`. */
  function isoWeekMonday(y, w) {
    const jan4 = Date.UTC(y, 0, 4);
    const dow = (new Date(jan4).getUTCDay() + 6) % 7;
    return ymd(jan4 - dow * DAY + (w - 1) * 7 * DAY);
  }
  const mondayOfWeek = (s) => addDays(s, -((weekday(s) + 6) % 7));

  // ── Slovník ─────────────────────────────────────────────────────────────
  const NUM = {
    jeden: 1, jedna: 1, jednu: 1, jedno: 1, jedneho: 1, dva: 2, dve: 2, dvoch: 2, tri: 3, troch: 3, styri: 4, styroch: 4,
    pat: 5, piatich: 5, sest: 6, sedem: 7, osem: 8, devat: 9, desat: 10, par: 3, zopar: 3, niekolko: 3, pol: 0.5,
    ein: 1, eine: 1, einem: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8,
    neun: 9, zehn: 10, elf: 11, zwolf: 12, paar: 3, halben: 0.5, halbes: 0.5, halb: 0.5,
  };
  const UNIT = [
    ['d', /^(den|dni|dna|dnoch|dnu|tag|tage|tagen|tagn)$/],
    ['w', /^(tyzden|tyzdne|tyzdnov|tyzdnoch|tyzdna|tyzdnami|woche|wochen)$/],
    ['m', /^(mesiac|mesiace|mesiacov|mesiacoch|mesiaca|mesiacmi|monat|monate|monaten|monats)$/],
    ['y', /^(rok|roky|rokov|roka|rokoch|jahr|jahre|jahren|jahres)$/],
  ];
  const UNIT_RE = 'den|dni|dna|dnoch|dnu|tagen|tage|tag|tyzdnami|tyzdnoch|tyzdnov|tyzdne|tyzdna|tyzden|wochen|woche|'
    + 'mesiacmi|mesiacoch|mesiacov|mesiace|mesiaca|mesiac|monaten|monate|monats|monat|rokoch|rokov|roky|roka|rok|jahren|jahres|jahre|jahr';
  const NUM_RE = `\\d{1,3}(?:[.,]5)?|${Object.keys(NUM).sort((a, b) => b.length - a.length).join('|')}`;
  const unitOf = (w) => (UNIT.find(([, re]) => re.test(w)) || [])[0] || null;
  const numOf = (w) => { const n = Number(String(w).replace(',', '.')); return Number.isFinite(n) ? n : NUM[w]; };

  const MONTHS = [
    /^(januar|januari|januara|janner)$/, /^(februar|februari|februara)$/, /^(marec|marci|marca|marz)$/,
    /^(april|aprili|aprila)$/, /^(maj|maji|maja|mai)$/, /^(jun|juni|juna)$/, /^(jul|juli|jula)$/,
    /^(august|auguste|augusta)$/, /^(september|septembri|septembra)$/, /^(oktober|oktobri|oktobra)$/,
    /^(november|novembri|novembra)$/, /^(december|decembri|decembra|dezember)$/,
  ];
  const MONTH_RE = 'januara|januari|januar|janner|februara|februari|februar|marec|marci|marca|marz|aprila|aprili|april|'
    + 'maja|maji|maj|mai|juna|juni|jun|jula|juli|jul|augusta|auguste|august|septembra|septembri|september|'
    + 'oktobra|oktobri|oktober|novembra|novembri|november|decembra|decembri|december|dezember';
  const monthOf = (w) => MONTHS.findIndex((re) => re.test(w)) + 1;

  const WD = [
    [1, /^(pondelok|pondelka|pondelku|montag)$/], [2, /^(utorok|utorka|utorku|dienstag)$/],
    [3, /^(streda|stredu|stredy|strede|mittwoch)$/], [4, /^(stvrtok|stvrtka|stvrtku|donnerstag)$/],
    [5, /^(piatok|piatka|piatku|freitag)$/],
  ];
  const WD_RE = 'pondelok|pondelka|pondelku|montag|utorok|utorka|utorku|dienstag|streda|stredu|stredy|strede|mittwoch|'
    + 'stvrtok|stvrtka|stvrtku|donnerstag|piatok|piatka|piatku|freitag';

  /** Slová, ktoré hovoria „ozvite sa / ozveme sa / melden Sie sich". */
  const INTENT = /\b(ozv\w*|zavola\w*|volat\w*|kontaktova\w*|napis\w*|poslat|posl\w*|pripomen\w*|neskor\w*|znova|znovu|opat|zase|vratit|callback|rozhodn\w*|melden|meldet|melde|anrufen|anruf|ruckruf|zuruck\w*|spater|nochmal|nochmals|erneut|wieder|schreiben|kontakt\w*|terminieren|entscheid\w*)\b/g;

  // ── Pravidlá ────────────────────────────────────────────────────────────
  // Každé vráti zoznam { at, end, date, rule, conf, note, raw }.
  function rules(t, base) {
    const out = [];
    const [Y, M] = parts(base);
    const push = (m, date, rule, conf, note) => { if (date) out.push({ at: m.index, end: m.index + m[0].length, date, rule, conf, note: note || '', raw: m[0] }); };
    const nextOccurrence = (mo, day) => {
      // Mesiac, ktorý už bol (alebo deň v ňom), = budúci rok.
      let y = Y;
      let d = mk(y, mo, day);
      if (d <= base) { y += 1; d = mk(y, mo, day); }
      return d;
    };

    // 1. Relatívne: „za 2-3 týždne", „o pol roka", „in zwei bis drei Monaten", „nach 10 Tagen"
    const rel = new RegExp(`(?:\\b(za|o|in|nach|cez|behom|binnen|innerhalb|von)\\s+)?(?:(?:cca\\.?|asi|priblizne|zhruba|ca\\.?|etwa|ungefahr|rund|so)\\s+)?`
      + `\\b(${NUM_RE})(?:\\s*(?:-|az|alebo|ci|bis|oder|/)\\s*(${NUM_RE}))?\\s+(${UNIT_RE})\\b`, 'g');
    for (const m of t.matchAll(rel)) {
      const n1 = numOf(m[2]);
      const n2 = m[3] != null ? numOf(m[3]) : null;
      const unit = unitOf(m[4]);
      if (!unit || !Number.isFinite(n1) || n1 <= 0) continue;
      // „za 2 týždne" bez predložky môže byť aj „pred 2 týždňami" — keď predložka chýba, overí sa, či nejde o minulosť.
      const pred = t.slice(Math.max(0, m.index - 8), m.index);
      if (!m[1] && /(pred|vor|uz|seit)\s*$/.test(pred)) continue;
      const n = n2 != null && Number.isFinite(n2) ? Math.min(n1, n2) : n1;
      if (n > 36 && unit !== 'd') continue;
      let date;
      if (unit === 'd') date = addDays(base, n);
      else if (unit === 'w') date = addDays(base, n * 7);
      else if (unit === 'm') date = n === 0.5 ? addDays(base, 14) : addMonths(base, Math.round(n));
      else date = addMonths(base, Math.round(n * 12));
      const note = n2 != null && n2 !== n1 ? `rozsah ${m[2]}–${m[3]} → berieme skorší termín` : '';
      push(m, date, 'relative', m[1] || n2 != null ? 'high' : 'medium', note);
    }
    // „o týždeň", „za mesiac", „in einer Woche" bez čísla, „o rok"
    for (const m of t.matchAll(/\b(za|o|in|nach)\s+(tyzden|mesiac|rok|woche|monat|jahr)\b/g)) {
      const u = unitOf(m[2]);
      push(m, u === 'w' ? addDays(base, 7) : u === 'm' ? addMonths(base, 1) : addMonths(base, 12), 'relative', 'high');
    }

    // 2. Zajtra, budúci týždeň / mesiac / rok
    for (const m of t.matchAll(/\b(pozajtra|ubermorgen)\b/g)) push(m, addDays(base, 2), 'relative', 'high');
    for (const m of t.matchAll(/\b(zajtra|(?<!guten\s)morgen)\b(?!s)/g)) push(m, addDays(base, 1), 'relative', 'high');
    for (const m of t.matchAll(/\b(buduci|buduceho|dalsi|nasledujuci|nachste|nachsten|kommende|kommenden)\s+(tyzden|tyzdna|woche)\b/g)) {
      push(m, addDays(mondayOfWeek(base), 7), 'next_week', 'high');
    }
    for (const m of t.matchAll(/\b(ubernachste|ubernachsten)\s+woche\b/g)) push(m, addDays(mondayOfWeek(base), 14), 'next_week', 'high');
    for (const m of t.matchAll(/\b(koncom|konci|ende)\s+(tohto\s+|der\s+|dieser\s+)?(tyzdna|woche)\b/g)) {
      const fri = addDays(mondayOfWeek(base), 4);
      push(m, fri > base ? fri : addDays(fri, 7), 'week_end', 'medium');
    }
    for (const m of t.matchAll(/\b(buduci|buduceho|dalsi|nasledujuci|nachsten|nachster|kommenden)\s+(mesiac|mesiaca|monat)\b/g)) {
      push(m, mk(...parts(addMonths(mk(Y, M, 1), 1)).slice(0, 2), 1), 'next_month', 'high');
    }

    // 3. Presný dátum: 15. 3. / 15.03.2027 / 2027-03-15
    for (const m of t.matchAll(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2})\b)?/g)) {
      const d = Number(m[1]), mo = Number(m[2]);
      if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) continue;
      let date;
      if (m[3]) {
        const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        date = mk(y, mo, d);
      } else {
        date = mk(Y, mo, d);
        // Dátum bez roka, ktorý bol nedávno (napr. „volal som 28.10."), je odkaz na minulosť, nie termín.
        const ago = (toMs(base) - toMs(date)) / DAY;
        if (ago >= 0 && ago <= 45) continue;
        if (date <= base) date = mk(Y + 1, mo, d);
      }
      push(m, date, 'date', 'high');
    }
    for (const m of t.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) push(m, mk(+m[1], +m[2], +m[3]), 'date', 'high');
    // „15. marca", „am 15. März", „do 20. apríla"
    for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_RE})\\b(?:\\s+(20\\d{2}))?`, 'g'))) {
      const d = Number(m[1]), mo = monthOf(m[2]);
      if (!(d >= 1 && d <= 31) || !mo) continue;
      push(m, m[3] ? mk(+m[3], mo, d) : nextOccurrence(mo, d), 'date', 'high');
    }
    // KW 12 / Kalenderwoche 12 / 12. týždeň
    for (const m of t.matchAll(/\b(?:kw|kalenderwoche)\s*(\d{1,2})\b|\b(\d{1,2})\.\s*(?:tyzden|tyzdni|kalenderwoche)\b/g)) {
      const w = Number(m[1] || m[2]);
      if (!(w >= 1 && w <= 53)) continue;
      let d = isoWeekMonday(Y, w);
      if (d <= base) d = isoWeekMonday(Y + 1, w);
      push(m, d, 'week', 'high');
    }

    // 4. Mesiac: „v marci", „začiatkom marca", „Mitte März", „koncom apríla 2027"
    const monRe = new RegExp(`\\b(?:(zaciatkom|zaciatok|zaciatku|anfang|polovici|polovica|polovicou|stred|mitte|koncom|koniec|konci|ende)\\s+)?`
      + `(?:(?:v|vo|na|do|od|im|ab|bis|in|um|cez)\\s+)?(${MONTH_RE})\\b(?:\\s+(20\\d{2}))?`, 'g');
    for (const m of t.matchAll(monRe)) {
      // „15. marca" už vyššie — ten istý výskyt sa neráta znova.
      if (/\d\.?\s+$/.test(t.slice(Math.max(0, m.index - 4), m.index))) continue;
      const mo = monthOf(m[2]);
      if (!mo) continue;
      const mod = m[1] || '';
      const day = /^(polovic|stred|mitte)/.test(mod) ? 15 : /^(konc|koniec|konci|ende)/.test(mod) ? 20 : 1;
      let date;
      if (m[3]) date = mk(+m[3], mo, day);
      else if (mo === M && !m[3]) {
        // Ten istý mesiac („ešte v októbri"): keď ešte nebol ten deň, platí; inak o týždeň.
        const d0 = mk(Y, mo, day);
        date = d0 > base ? d0 : addDays(base, 7);
      } else date = nextOccurrence(mo, day);
      push(m, date, 'month', 'medium', day === 20 ? 'koniec mesiaca → 20. deň, aby sme stihli' : '');
    }

    // 5. Deň v týždni: „v pondelok", „am Freitag", „buduci utorok"
    for (const m of t.matchAll(new RegExp(`\\b(?:(v|vo|na|am|bis|do|buduci|buducu|nachsten|nachste|kommenden)\\s+)?(${WD_RE})\\b`, 'g'))) {
      const w = (WD.find(([, re]) => re.test(m[2])) || [])[0];
      if (!w) continue;
      if (!m[1] && /\b(minuly|minulu|letzten|vergangenen)\s*$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
      let d = addDays(base, ((w - weekday(base) + 7) % 7) || 7);
      if (/^(buduc|nachst|kommend)/.test(m[1] || '') && toMs(d) - toMs(base) < 7 * DAY && mondayOfWeek(d) === mondayOfWeek(base)) d = addDays(d, 7);
      push(m, d, 'weekday', 'high');
    }

    // 6. Obdobia a sviatky
    const nextJan8 = () => { const d = mk(Y, 1, 8); return d > base ? d : mk(Y + 1, 1, 8); };
    const SEASONS = [
      [/\b(po\s+novom\s+roku|novy\s+rok|novym\s+rokom|nach\s+neujahr|im\s+neuen\s+jahr|nach\s+dem\s+jahreswechsel|nach\s+jahreswechsel|anfang\s+(des\s+)?(nachsten\s+|neuen\s+)?jahres|zaciatkom\s+(buduceho\s+|noveho\s+)?roka|buduci\s+rok|buduceho\s+roka|nachstes\s+jahr|nachsten\s+jahr|im\s+nachsten\s+jahr)\b/g,
        nextJan8, 'new_year', 'medium', 'po Novom roku → 8. januára (6. 1. je sviatok)'],
      [/\b(po\s+vianociach|po\s+sviatkoch|nach\s+weihnachten|nach\s+den\s+feiertagen)\b/g, nextJan8, 'new_year', 'medium', 'po sviatkoch → 8. januára'],
      [/\b(pred\s+vianocami|vor\s+weihnachten)\b/g, () => { const d = mk(Y, 12, 1); return d > base ? d : addDays(base, 7); }, 'holiday', 'medium'],
      [/\b(po\s+velkej\s+noci|po\s+velkonocnych\s+sviatkoch|nach\s+ostern|nach\s+den\s+osterferien)\b/g,
        () => { let d = addDays(easter(Y), 2); if (d <= base) d = addDays(easter(Y + 1), 2); return d; }, 'easter', 'medium', 'po Veľkej noci → utorok po Veľkonočnom pondelku'],
      [/\b(pred\s+velkou\s+nocou|vor\s+ostern)\b/g, () => { let d = addDays(easter(Y), -14); if (d <= base) d = addDays(easter(Y + 1), -14); return d; }, 'easter', 'low'],
      [/\b(po\s+zime|nach\s+dem\s+winter)\b/g, () => nextOccurrence(3, 1), 'season', 'medium'],
      [/\b(na\s+jar|na\s+jari|v\s+jari|zaciatkom\s+jari|im\s+fruhjahr|im\s+fruhling|fruhjahr|fruhling)\b/g, () => (M >= 3 && M <= 5 ? addDays(base, 14) : nextOccurrence(3, 1)), 'season', 'medium', 'na jar → 1. marca'],
      [/\b(v\s+lete|cez\s+leto|na\s+leto|im\s+sommer)\b/g, () => (M >= 6 && M <= 8 ? addDays(base, 14) : nextOccurrence(6, 1)), 'season', 'low', 'v lete → 1. júna'],
      [/\b(po\s+lete|po\s+prazdninach|po\s+letnych\s+prazdninach|nach\s+dem\s+sommer|nach\s+den\s+sommerferien|nach\s+den\s+ferien)\b/g, () => nextOccurrence(9, 1), 'season', 'medium', 'po prázdninách → 1. septembra'],
      [/\b(na\s+jesen|v\s+jeseni|na\s+jeseni|im\s+herbst)\b/g, () => (M >= 9 && M <= 11 ? addDays(base, 14) : nextOccurrence(9, 1)), 'season', 'low', 'na jeseň → 1. septembra'],
      [/\b(v\s+zime|cez\s+zimu|im\s+winter)\b/g, () => (M === 12 || M <= 2 ? addDays(base, 14) : nextOccurrence(12, 1)), 'season', 'low'],
      [/\b(po\s+sezone|nach\s+der\s+saison|nach\s+saisonende|ende\s+der\s+saison|koncom\s+sezony)\b/g, () => nextOccurrence(11, 2), 'season', 'low', 'po sezóne → 2. novembra (stavebná sezóna končí s mrazom)'],
      [/\b(pred\s+sezonou|vor\s+der\s+saison|na\s+(novu\s+)?sezonu|zaciatkom\s+sezony|zur\s+neuen\s+saison|saisonstart|vor\s+saisonbeginn)\b/g, () => nextOccurrence(2, 1), 'season', 'low', 'pred sezónou → 1. februára'],
      [/\b(po\s+dovolenke|nach\s+dem\s+urlaub|nach\s+meinem\s+urlaub)\b/g, () => addDays(base, 21), 'vacation', 'low', 'po dovolenke → o 3 týždne (odhad)'],
    ];
    for (const [re, f, rule, conf, note] of SEASONS) for (const m of t.matchAll(re)) push(m, f(), rule, conf, note);

    return out;
  }

  /**
   * Nájde termín ďalšieho kroku v texte.
   * @param {string} text   poznámka z hovoru (SK alebo DE)
   * @param {Object} o      { now, tz }
   * @returns {null | { date, text, rule, confidence, note, shifted, intent }}
   */
  function parse(text, { now = new Date(), tz = TZ } = {}) {
    const t = fold(text);
    if (!t.trim()) return null;
    const base = today(now, tz);
    const tomorrow = addDays(base, 1);
    const found = rules(t, base).filter(c => c.date >= tomorrow && c.date <= addMonths(base, 36));
    if (!found.length) return null;
    // Prekrývajúce sa nálezy: dlhší (konkrétnejší) vyhrá — „15. marca" pred „marca".
    const kept = found.filter(c => !found.some(o => o !== c && o.at <= c.at && o.end >= c.end && (o.end - o.at) > (c.end - c.at)));
    const intents = [...t.matchAll(INTENT)].map(m => m.index);
    const dist = (c) => (intents.length ? Math.min(...intents.map(i => (c.at >= i ? c.at - i : (i - c.end) * 1.5))) : c.at);
    kept.sort((a, b) => dist(a) - dist(b) || a.date.localeCompare(b.date));
    const best = kept[0];
    const date = workday(best.date);
    return {
      date, text: String(text).slice(best.at, best.end).trim() || best.raw, rule: best.rule, confidence: best.conf,
      note: [best.note, date !== best.date ? 'víkend → pondelok' : ''].filter(Boolean).join('; '),
      shifted: date !== best.date, intent: intents.length > 0,
    };
  }

  /** Hovorí text niečo o ďalšom kroku (termín alebo „ozvite sa")? Server podľa toho volá AI. */
  function hasIntent(text, o) {
    const t = fold(text);
    INTENT.lastIndex = 0;
    return INTENT.test(t) || !!parse(text, o);
  }

  /** Dátum je platný deň „YYYY-MM-DD"? */
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const [y, m, d] = parts(s);
    const x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
  }

  /** Človek prečíta „o 2 týždne (pondelok 16. 11.)". */
  const WDN = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
  function label(date, now = new Date(), tz = TZ) {
    if (!validDate(date)) return '';
    const base = today(now, tz);
    const n = Math.round((toMs(date) - toMs(base)) / DAY);
    const [y, m, d] = parts(date);
    const kedy = n === 0 ? 'dnes' : n === 1 ? 'zajtra' : n < 0 ? `pred ${-n} ${-n === 1 ? 'dňom' : 'dňami'}`
      : n < 14 ? `o ${n} ${n >= 2 && n <= 4 ? 'dni' : 'dní'}` : n < 60 ? `o ${Math.round(n / 7)} ${Math.round(n / 7) <= 4 ? 'týždne' : 'týždňov'}`
        : `o ${Math.round(n / 30)} ${Math.round(n / 30) <= 4 ? 'mesiace' : 'mesiacov'}`;
    return `${kedy} (${WDN[weekday(date)]} ${d}. ${m}.${y !== parts(base)[0] ? ` ${y}` : ''})`;
  }

  const API = { TZ, fold, today, addDays, addMonths, workday, weekday, easter, isoWeekMonday, parse, hasIntent, validDate, label };
  if (typeof window !== 'undefined') window.DanubraFollowup = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
