// ============================================================================
// DANUBRA — dopyt od odberateľa: jeden e-mail, viac stavieb
// ============================================================================
// Nemecká firma nenapíše „potrebujeme štyroch ľudí". Napíše e-mail, v ktorom
// sú **tri projekty naraz** — Hammelburg 5 ľudí od pondelka, Gengenbach 4 od
// 20.10., Friesenheim 4 od 19.10. — a k tomu sadzba, platobné podmienky
// a požiadavky, ktoré platia na všetky.
//
// Dovtedy sa taký e-mail zapísal ako **jedna** možnosť s názvom „B&M Projekte"
// a všetko ostatné zostalo vo voľnom texte. Z toho sa nedá spraviť ani nábor,
// ani ponuka: tri stavby majú tri termíny, tri mestá a tri nábory.
//
// Táto knižnica drží pravidlá, ktoré sa dajú pokaziť ticho:
//
//   * **čo musí mať nájdený projekt**, aby sa z neho dala spraviť možnosť,
//   * **ako sa čítajú nemecké platobné podmienky** („7/10 mit 2% Sconto"),
//   * **či to vôbec stíhame** — pri 2–6 ľuďoch týždenne je trinásť ľudí
//     robota na tri týždne a pondelkový nástup je výmysel.
//
// Samotné rozdelenie e-mailu robí model v serverovej funkcii
// (`danubra-split-inquiry`). Tu sú pravidlá, podľa ktorých sa jeho výstup
// prijme alebo odmietne — aby sa nespoliehalo na to, že model poslúchne.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/inquiry.test.js
// ============================================================================
(function () {
  const req = (typeof require !== 'undefined' && typeof module !== 'undefined');
  const O = req ? require('./opportunities.js') : window.DanubraOpp;
  const plural = (n, a, b, c) => O.plural(n, a, b, c);

  /**
   * Koľko ľudí vieme nabrať za týždeň. Nie je to odhad — je to to, čo povedal
   * majiteľ: „cieľ máme nabrať 2–6 ľudí týždenne, viac ani nevládzeme."
   *
   * Prepíše sa v Nastaveniach; toto je predvolené.
   */
  const KAPACITA = { min: 2, max: 6 };

  const prazdne = (v) => v === null || v === undefined || String(v).trim() === '';
  const text = (v) => (prazdne(v) ? '' : String(v).trim());

  // ── Čo musí mať nájdený projekt ──────────────────────────────────────────
  // Poradie je podľa toho, bez čoho sa nedá pohnúť ďalej: bez mesta sa nedá
  // povedať, kam sa ide, bez počtu sa nedá povedať, či to stíhame.
  const POVINNE = [
    { key: 'title', title: 'názov stavby' },
    { key: 'city', title: 'mesto' },
    { key: 'headcount', title: 'koľko ľudí' },
  ];

  /** Jeden projekt z e-mailu, upratať do tvaru, aký má možnosť v databáze. */
  function normalize(p = {}) {
    const n = (v) => {
      const x = Number(String(v).replace(',', '.'));
      return Number.isFinite(x) && x > 0 ? x : null;
    };
    return {
      title: text(p.title),
      city: text(p.city),
      country: text(p.country).toUpperCase() || 'DE',
      trade_key: text(p.trade_key) || null,
      headcount: Number.isInteger(p.headcount) && p.headcount > 0 ? p.headcount : null,
      rate_client: n(p.rate_client),
      start_date: /^\d{4}-\d{2}-\d{2}$/.test(text(p.start_date)) ? text(p.start_date) : null,
      brief: text(p.brief),
      address: text(p.address),
      requirements: Array.isArray(p.requirements)
        ? p.requirements.map(text).filter(Boolean) : [],
    };
  }

  /** Čo projektu chýba na to, aby sa z neho dala založiť možnosť. */
  function problems(p = {}) {
    return POVINNE.filter(f => prazdne(p[f.key]));
  }

  /** Dá sa z toho založiť možnosť? */
  function usable(p = {}) { return problems(p).length === 0; }

  // ── Nemecké platobné podmienky ───────────────────────────────────────────
  /**
   * „7/10 mit 2% Sconto" znamená: zaplatia do 7 dní so zľavou 2 %, inak
   * celá suma do 10 dní.
   *
   * Je to **zľava za skoré zaplatenie**, nie zľava z ceny — a to je rozdiel
   * za peniaze: pri 34 €/h a štyroch ľuďoch sú tie 2 % niekoľko sto eur
   * mesačne. Keď sa to zapíše ako „sadzba 33,32", zmizne to z dohľadu
   * a nikto už nevie, že sa dalo fakturovať plnú sumu.
   *
   * Príklady, ktoré musia prejsť: „7/10 mit 2% Sconto", „2% Skonto 7 Tage,
   * netto 10", „14 Tage netto".
   */
  function skonto(s) {
    const t = String(s || '').toLowerCase().replace(',', '.');
    if (!t.trim()) return null;

    const pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
    // Tvar „7/10" je najčastejší: dni so zľavou / dni netto.
    const lomka = t.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    const dni = [...t.matchAll(/(\d{1,3})\s*(?:tage?|dní|dni|dn[ií])/g)].map(m => Number(m[1]));

    let discountDays = null, netDays = null;
    if (lomka) {
      discountDays = Number(lomka[1]);
      netDays = Number(lomka[2]);
    } else if (dni.length >= 2) {
      discountDays = Math.min(dni[0], dni[1]);
      netDays = Math.max(dni[0], dni[1]);
    } else if (dni.length === 1) {
      // Jedno číslo bez percent je obyčajná splatnosť.
      if (pct) discountDays = dni[0]; else netDays = dni[0];
    }
    if (discountDays == null && netDays == null && !pct) return null;
    return {
      discountDays, netDays,
      discountPct: pct ? Number(pct[1]) : null,
      // Splatnosť, ktorá sa zapíše odberateľovi. Zľava je možnosť, nie lehota.
      terms: netDays || discountDays || null,
    };
  }

  /** Veta o platobných podmienkach, ktorú pochopí aj ten, kto po nemecky nevie. */
  function skontoText(sk) {
    if (!sk) return '';
    if (sk.discountPct && sk.discountDays && sk.netDays) {
      return `Splatnosť ${sk.netDays} ${plural(sk.netDays, 'deň', 'dni', 'dní')}, `
        + `pri zaplatení do ${sk.discountDays} ${plural(sk.discountDays, 'dňa', 'dní', 'dní')} `
        + `si odrátajú ${sk.discountPct} %.`;
    }
    if (sk.terms) return `Splatnosť ${sk.terms} ${plural(sk.terms, 'deň', 'dni', 'dní')}.`;
    return '';
  }

  // ── Stíhame to? ──────────────────────────────────────────────────────────
  /**
   * Pri 2–6 ľuďoch týždenne je trinásť ľudí robota na tri týždne. Odberateľ
   * to nevie a napíše „ab Montag" — a keď sa to nepovie hneď, zistí sa to
   * až v pondelok, keď tam nikto nepríde.
   *
   * Počíta sa to po projektoch v poradí podľa nástupu: skorší projekt zoberie
   * kapacitu skôr. Nie je to plán, je to **kontrola zdravého rozumu**.
   *
   * @param {Object} o  { projects, perWeek: {min,max}, today }
   */
  function capacity({ projects = [], perWeek = KAPACITA, today } = {}) {
    const dnes = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const max = Math.max(1, Number(perWeek && perWeek.max) || KAPACITA.max);
    const min = Math.max(1, Number(perWeek && perWeek.min) || KAPACITA.min);

    const list = (projects || []).filter(p => p && p.headcount > 0)
      .map(p => ({ ...p }))
      .sort((a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999')));

    const people = list.reduce((s, p) => s + p.headcount, 0);
    if (!people) {
      return { people: 0, weeksBest: 0, weeksWorst: 0, late: [], text: 'Niet koho hľadať.' };
    }

    let cum = 0;
    const late = [];
    for (const p of list) {
      cum += p.headcount;
      // Týždeň, v ktorom je tento projekt obsadený, keď ide všetko najlepšie.
      const tyzden = Math.ceil(cum / max);
      const hotovo = posun(dnes, tyzden * 7);
      if (p.start_date && p.start_date < hotovo) {
        late.push({ ...p, hotovo, meskanie: dni(hotovo, p.start_date) });
      }
    }

    const weeksBest = Math.ceil(people / max);
    const weeksWorst = Math.ceil(people / min);
    return {
      people, weeksBest, weeksWorst, late,
      text: `${people} ${plural(people, 'človek', 'ľudia', 'ľudí')} je pri ${min}–${max} `
        + `týždenne robota na ${weeksBest}${weeksBest === weeksWorst ? '' : `–${weeksWorst}`} `
        + `${plural(weeksWorst, 'týždeň', 'týždne', 'týždňov')}.`,
    };
  }

  // ── Náborový plán po týždňoch ────────────────────────────────────────────
  // „Cieľ máme nabrať 2–6 ľudí týždenne, viac ani nevládzeme."
  //
  // `capacity` povie jednou vetou, či to stíhame. Toto je **plán**: ktorý
  // týždeň koho naberáme. Stavby idú podľa nástupu — kto nastupuje skôr, ten
  // sa naberá skôr — a do týždňa sa dá najviac toľko ľudí, koľko vládzeme
  // (`perWeek.max`). Pri slabšom tempe (`perWeek.min`) sa povie, dokedy by
  // to trvalo, aby to nebolo prekvapenie.
  //
  // Týždeň 1 začína dnes (nie v pondelok): plán sa robí v deň, keď prišiel
  // dopyt, a „tento týždeň" od stredy má len tri dni.
  //
  // projects: [{ key, title, city, headcount, start_date }]
  function schedule({ projects = [], perWeek = KAPACITA, today, limit = 26 } = {}) {
    const dnes = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const max = Math.max(1, Number(perWeek && perWeek.max) || KAPACITA.max);
    const min = Math.max(1, Math.min(max, Number(perWeek && perWeek.min) || KAPACITA.min));

    const list = (projects || []).filter(p => p && Number(p.headcount) > 0)
      .map((p, i) => ({ ...p, key: p.key != null ? p.key : i, headcount: Number(p.headcount) }))
      // Stabilné poradie: podľa nástupu, bez termínu na koniec, inak ako prišli.
      .map((p, i) => ({ p, i }))
      .sort((a, b) => String(a.p.start_date || '9999').localeCompare(String(b.p.start_date || '9999'))
        || a.i - b.i)
      .map(x => x.p);

    // Rozdelí ľudí do týždňov pri danom tempe. Vráti týždne a kedy je ktorá
    // stavba obsadená.
    const rozdel = (tempo) => {
      const zostava = new Map(list.map(p => [p.key, p.headcount]));
      const hotovo = new Map();
      const weeks = [];
      for (let w = 0; w < limit && [...zostava.values()].some(v => v > 0); w++) {
        const from = posun(dnes, w * 7), to = posun(dnes, w * 7 + 6);
        let volne = tempo;
        const items = [];
        for (const p of list) {
          const ost = zostava.get(p.key);
          if (!ost || !volne) continue;
          const vezmem = Math.min(ost, volne);
          zostava.set(p.key, ost - vezmem);
          volne -= vezmem;
          items.push({ key: p.key, title: p.title || p.city || '', city: p.city || '', count: vezmem });
          if (ost - vezmem === 0) hotovo.set(p.key, to);
        }
        weeks.push({ n: w + 1, from, to, items, total: tempo - volne });
      }
      return { weeks, hotovo };
    };

    const best = rozdel(max);
    const worst = rozdel(min);
    const people = list.reduce((s, p) => s + p.headcount, 0);
    const out = list.map((p) => {
      const ready = best.hotovo.get(p.key) || null;
      const readyWorst = worst.hotovo.get(p.key) || null;
      const late = !!(p.start_date && ready && ready > p.start_date);
      return { ...p, ready, readyWorst, late,
        lateDays: late ? dni(ready, p.start_date) : 0,
        weeks: best.weeks.filter(w => w.items.some(x => x.key === p.key))
          .map(w => ({ n: w.n, from: w.from, to: w.to,
            count: w.items.find(x => x.key === p.key).count })) };
    });
    const lateN = out.filter(p => p.late).length;
    return {
      people, max, min,
      weeks: best.weeks,
      weeksBest: best.weeks.length, weeksWorst: worst.weeks.length,
      projects: out,
      late: out.filter(p => p.late),
      text: !people ? 'Niet koho hľadať.'
        : `${people} ${plural(people, 'človek', 'ľudia', 'ľudí')} pri ${max} týždenne = `
          + `${best.weeks.length} ${plural(best.weeks.length, 'týždeň', 'týždne', 'týždňov')}`
          + (worst.weeks.length > best.weeks.length
            ? `, pri slabom tempe (${min} týždenne) ${worst.weeks.length}.` : '.')
          + (lateN ? ` ${lateN} ${plural(lateN, 'stavba nestihne', 'stavby nestihnú', 'stavieb nestihne')} nástup.` : ''),
    };
  }

  /** „20.–26. 10." — týždeň krátko, bez roka. */
  function weekLabel(from, to) {
    const d = (s) => { const [, m, dd] = String(s).split('-').map(Number); return { m, d: dd }; };
    const a = d(from), b = d(to);
    if (!a.m || !b.m) return '';
    return a.m === b.m ? `${a.d}.–${b.d}. ${b.m}.` : `${a.d}. ${a.m}. – ${b.d}. ${b.m}.`;
  }

  /** Text do poznámky náboru: kedy koľko ľudí. */
  function planText(p) {
    if (!p || !p.weeks || !p.weeks.length) return '';
    return 'Náborový plán: ' + p.weeks.map(w =>
      `týždeň ${w.n} (${weekLabel(w.from, w.to)}) ${w.count} ${plural(w.count, 'človek', 'ľudia', 'ľudí')}`)
      .join(', ') + '.';
  }

  function posun(d, o) {
    const t = Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(t)) return d;
    return new Date(t + o * 86400000).toISOString().slice(0, 10);
  }

  function dni(a, b) {
    const x = Date.parse(String(a).slice(0, 10) + 'T00:00:00Z');
    const y = Date.parse(String(b).slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    return Math.round((x - y) / 86400000);
  }

  /** Jedna veta nad nájdenými projektmi — čo z toho e-mailu vlastne vypadlo. */
  function summary(projects = []) {
    const list = (projects || []).filter(Boolean);
    const people = list.reduce((s, p) => s + (p.headcount || 0), 0);
    const sadzby = [...new Set(list.map(p => p.rate_client).filter(Boolean))];
    return {
      count: list.length,
      people,
      rate: sadzby.length === 1 ? sadzby[0] : null,
      text: `${list.length} ${plural(list.length, 'stavba', 'stavby', 'stavieb')}, `
        + `${people} ${plural(people, 'človek', 'ľudia', 'ľudí')}`
        + (sadzby.length === 1 ? `, ${String(sadzby[0]).replace('.', ',')} €/h` : ''),
    };
  }

  const API = {
    KAPACITA, POVINNE,
    normalize, problems, usable, skonto, skontoText, capacity, summary,
    schedule, weekLabel, planText,
  };
  if (typeof window !== 'undefined') window.DanubraInquiry = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
