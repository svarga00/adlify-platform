// ============================================================================
// DANUBRA — ako to celé ide
// ============================================================================
// V appke je dvadsaťpäť položiek menu zoradených podľa toho, čo je v databáze.
// Kto to nepostavil, z toho poradie práce neprečíta: že ponuka je pred zmluvou,
// zmluva pred zákazkou a že bez uzavretého obdobia nevznikne faktúra.
// V `docs/FLOW.md` to napísané je — lenže to je dokument, nie obrazovka, a kto
// má appku používať, ten ho nečíta.
//
// Táto knižnica je ten istý reťazec ako **dáta**: štyri dráhy, štrnásť krokov,
// a pri každom kroku odpoveď na dve otázky:
//
//   „koľko toho tu je"      — aby bolo vidieť, že krok existuje a žije
//   „koľko čaká na teba"    — aby bolo vidieť, kde sa to práve zastavilo
//
// Druhá otázka je tá podstatná. Reťazec bez nej je obrázok; s ňou je to
// zoznam práce zoradený tak, ako práca ide.
//
// Nič sa tu nenačítava — dostane hotové polia a vráti kroky. Dá sa to teda
// celé otestovať bez prehliadača aj bez databázy.
//
// Testy: node app/lib/chain.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const arr = (v) => (Array.isArray(v) ? v : []);

  /** Stavy sú tri, rovnaké ako na dlaždiciach prehľadu. */
  const CALM = 'calm', WATCH = 'watch', BAD = 'bad';

  function plural(n, one, few, many) {
    const k = Math.abs(Number(n) || 0);
    if (k === 1) return one;
    if (k >= 2 && k <= 4) return few;
    return many;
  }

  // ── Dráhy ────────────────────────────────────────────────────────────────
  // Ľudia a zákazky idú vedľa seba a nič o sebe nevedia, kým sa nestretnú
  // v nasadení. Práve toto je vec, ktorú si nový človek musí uvedomiť ako
  // prvú — inak hľadá, „kde sa zadáva, že Novák ide na Feuerbach", a nenájde,
  // lebo to nie je ani v jednom z tých dvoch zoznamov.
  const LANES = [
    { key: 'ludia', label: 'Ľudia',
      lead: 'Odkiaľ prídu a kedy smú na nemeckú stavbu.' },
    { key: 'zakazky', label: 'Zákazky',
      lead: 'Odkiaľ príde práca a za koľko je dohodnutá.' },
    { key: 'spolu', label: 'Tu sa stretnú',
      lead: 'Človek z ľavej dráhy ide na stavbu z pravej. Odtiaľto je to už jedna cesta.' },
    { key: 'peniaze', label: 'Peniaze',
      lead: 'Z odrobených hodín na účet — a späť živnostníkovi.' },
  ];

  // ── Kroky ────────────────────────────────────────────────────────────────
  // `have`  — koľko je toho v systéme (informácia, nie úloha)
  // `todo`  — { n, text, state } čo čaká na teba. `n: 0` znamená „tu je čisto".
  //
  // Text v `todo` je vždy veta v rozkazovacom alebo oznamovacom tvare, nie
  // názov stavu. „3 ľudia čakajú na prvý telefonát" sa dá spraviť; „status =
  // new" sa spraviť nedá.
  const STEPS = [
    // ── Ľudia ──────────────────────────────────────────────────────────────
    {
      n: 1, key: 'ads', lane: 'ludia', ico: 'marketing', route: 'ads',
      title: 'Inzerát',
      lead: 'Kde sa ľudia dozvedia, že hľadáme — a čo presne sme im sľúbili.',
      next: 'Keď niekto na inzerát zavolá, zdvihneš telefón.',
      have: (x) => arr(x.ads).filter(a => a.active !== false).length,
      haveText: (n) => `${n} ${plural(n, 'bežiaci inzerát', 'bežiace inzeráty', 'bežiacich inzerátov')}`,
      todo(x) {
        const bezia = arr(x.ads).filter(a => a.active !== false).length;
        const nabory = arr(x.plans).filter(p => p.status === 'active').length;
        // Nábor bez inzerátu je najtichšia chyba v celom reťazci: nič nehorí,
        // len sa nikto neozýva — a nikoho nenapadne, že je to preto, že sa
        // nemá kde ozvať.
        if (nabory && !bezia) {
          return { n: nabory, state: BAD,
            text: `${nabory} ${plural(nabory, 'nábor beží', 'nábory bežia', 'náborov beží')} bez jediného inzerátu — nemá sa kto ozvať` };
        }
        return { n: 0, state: CALM,
          text: bezia ? 'Inzeráty bežia.' : 'Žiadny inzerát nebeží — ani netreba.' };
      },
    },
    {
      n: 2, key: 'call', lane: 'ludia', ico: 'phone', route: 'candidates',
      title: 'Telefonát',
      lead: 'Prvý hovor s človekom, ktorý sa ozval. Zapíše sa, čo zaznelo — nenahráva sa.',
      next: 'Z hovoru vznikne kandidát a vie sa, či má zmysel pokračovať.',
      have: (x) => arr(x.candidates).length,
      haveText: (n) => `${n} ${plural(n, 'kandidát', 'kandidáti', 'kandidátov')} celkom`,
      todo(x) {
        const cakaju = arr(x.candidates).filter(c => !c.first_contact_at
          && !['rejected', 'hired', 'converted'].includes(c.status));
        if (!cakaju.length) return { n: 0, state: CALM, text: 'Všetkým sme sa ozvali.' };
        // Desať minút nie je ozdoba: po nich berie prácu inde.
        return { n: cakaju.length, state: BAD,
          text: `${cakaju.length} ${plural(cakaju.length, 'človek čaká', 'ľudia čakajú', 'ľudí čaká')} na prvý telefonát` };
      },
    },
    {
      n: 3, key: 'screening', lane: 'ludia', ico: 'check', route: 'candidates',
      title: 'Preverenie',
      lead: 'Overí sa remeslo, doklady a či naozaj pôjde. Potom padne rozhodnutie.',
      next: 'Kto prejde, zapíše sa do kartotéky ako živnostník.',
      have: (x) => arr(x.candidates).filter(c => c.first_contact_at).length,
      haveText: (n) => `${n} ${plural(n, 'preverený', 'preverení', 'preverených')}`,
      todo(x) {
        const visia = arr(x.candidates).filter(c => c.first_contact_at
          && !c.converted_worker_id
          && !['rejected', 'hired', 'converted'].includes(c.status));
        if (!visia.length) return { n: 0, state: CALM, text: 'Nikto nevisí v rozhodovaní.' };
        return { n: visia.length, state: WATCH,
          text: `${visia.length} ${plural(visia.length, 'kandidát čaká', 'kandidáti čakajú', 'kandidátov čaká')} na rozhodnutie` };
      },
    },
    {
      n: 4, key: 'workers', lane: 'ludia', ico: 'workers', route: 'workers',
      title: 'Živnostník',
      lead: 'Karta človeka: doklady s platnosťou, sadzby, fakturačné údaje, účet.',
      next: 'S platnými dokladmi sa dá nasadiť na zákazku.',
      have: (x) => arr(x.workers).length,
      haveText: (n) => `${n} ${plural(n, 'živnostník', 'živnostníci', 'živnostníkov')} v kartotéke`,
      todo(x) {
        const zle = arr(x.documents).filter(d => d.validity === 'expired');
        if (!zle.length) return { n: 0, state: CALM, text: 'Doklady platia.' };
        const ludi = new Set(zle.map(d => d.worker_id)).size;
        return { n: ludi, state: BAD,
          text: `${ludi} ${plural(ludi, 'človek nemá', 'ľudia nemajú', 'ľudí nemá')} platné doklady — nasadiť sa nedá` };
      },
    },

    // ── Zákazky ────────────────────────────────────────────────────────────
    {
      n: 5, key: 'partners', lane: 'zakazky', ico: 'clients', route: 'partners',
      title: 'Odberateľ',
      lead: 'Nemecká firma, ktorá si prácu objednáva. Jej USt-IdNr rozhoduje o DPH.',
      next: 'Odberateľovi sa pošle ponuka.',
      have: (x) => arr(x.partners).length,
      haveText: (n) => `${n} ${plural(n, 'odberateľ', 'odberatelia', 'odberateľov')}`,
      todo(x) {
        // Bez USt-IdNr sa nedá vystaviť faktúra v režime reverse charge —
        // a na to sa príde až vo chvíli, keď má faktúra odísť.
        const bez = arr(x.partners).filter(p => p.country && p.country !== 'SK' && !p.ust_idnr);
        if (!bez.length) return { n: 0, state: CALM, text: 'Fakturačné údaje sú kompletné.' };
        return { n: bez.length, state: WATCH,
          text: `${bez.length} ${plural(bez.length, 'odberateľ nemá', 'odberatelia nemajú', 'odberateľov nemá')} USt-IdNr — faktúra im neodíde` };
      },
    },
    {
      n: 6, key: 'quotes', lane: 'zakazky', ico: 'offers', route: 'quotes',
      title: 'Ponuka',
      lead: 'Koľko ľudí, za akú sadzbu a s akou maržou. Marža je vidieť skôr, než ponuka odíde.',
      next: 'Keď ju odberateľ prijme, spíše sa zmluva o dielo.',
      have: (x) => arr(x.quotes).length,
      haveText: (n) => `${n} ${plural(n, 'ponuka', 'ponuky', 'ponúk')}`,
      todo(x) {
        const dnes = x.today;
        const visia = arr(x.quotes).filter(q => q.status === 'sent');
        const prepadnute = visia.filter(q => q.valid_until && day(q.valid_until) < dnes);
        if (prepadnute.length) {
          return { n: prepadnute.length, state: BAD,
            text: `${prepadnute.length} ${plural(prepadnute.length, 'ponuke prepadla', 'ponukám prepadla', 'ponukám prepadla')} platnosť bez odpovede` };
        }
        if (!visia.length) return { n: 0, state: CALM, text: 'Žiadna ponuka nečaká na odpoveď.' };
        return { n: visia.length, state: WATCH,
          text: `${visia.length} ${plural(visia.length, 'ponuka čaká', 'ponuky čakajú', 'ponúk čaká')} na odpoveď` };
      },
    },
    {
      n: 7, key: 'contracts', lane: 'zakazky', ico: 'note', route: 'contracts',
      title: 'Zmluva',
      lead: 'Werkvertrag — dielo, nie hodiny. Dohodnuté podmienky sa už neprepisujú, mení ich dodatok.',
      next: 'Zo zmluvy vznikne zákazka — konkrétna stavba s termínom.',
      have: (x) => arr(x.contracts).length,
      haveText: (n) => `${n} ${plural(n, 'zmluva', 'zmluvy', 'zmlúv')}`,
      todo(x) {
        const nepodpisane = arr(x.contracts).filter(c =>
          !c.signed_at && !['cancelled', 'rejected'].includes(c.status));
        if (!nepodpisane.length) return { n: 0, state: CALM, text: 'Zmluvy sú podpísané.' };
        return { n: nepodpisane.length, state: WATCH,
          text: `${nepodpisane.length} ${plural(nepodpisane.length, 'zmluva nie je', 'zmluvy nie sú', 'zmlúv nie je')} podpísaná` };
      },
    },
    {
      n: 8, key: 'subcontracts', lane: 'zakazky', ico: 'site', route: 'subcontracts',
      title: 'Zákazka',
      lead: 'Konkrétna stavba: mesto, termín, sadzba, kto na nej je a čo sa z nej fakturuje.',
      next: 'Na zákazku sa nasadia ľudia.',
      have: (x) => arr(x.subcontracts).filter(s => s.status === 'active').length,
      haveText: (n) => `${n} ${plural(n, 'bežiaca zákazka', 'bežiace zákazky', 'bežiacich zákaziek')}`,
      todo(x) {
        // Zákazka bez zmluvy je práca bez dohodnutej ceny. Nie je to zákaz —
        // je to vec, na ktorú treba prísť teraz, nie pri fakturácii.
        const bezZmluvy = arr(x.subcontracts).filter(s => s.status === 'active' && !s.contract_id);
        if (!bezZmluvy.length) return { n: 0, state: CALM, text: 'Každá bežiaca zákazka má zmluvu.' };
        return { n: bezZmluvy.length, state: WATCH,
          text: `${bezZmluvy.length} ${plural(bezZmluvy.length, 'zákazka beží', 'zákazky bežia', 'zákaziek beží')} bez zmluvy` };
      },
    },

    // ── Stretnutie ─────────────────────────────────────────────────────────
    {
      n: 9, key: 'assignments', lane: 'spolu', ico: 'zap', route: 'subcontracts',
      title: 'Nasadenie',
      lead: 'Tu sa človek z ľavej dráhy spojí so stavbou z pravej. Databáza pritom skontroluje doklady — k prvému dňu nástupu, nie k dnešku.',
      next: 'Nasadený človek začne zapisovať hodiny.',
      have: (x) => {
        const bezia = new Set(arr(x.subcontracts).filter(s => s.status === 'active').map(s => s.id));
        return arr(x.assignments).filter(a => a.status === 'active' && bezia.has(a.subcontract_id)).length;
      },
      haveText: (n) => `${n} ${plural(n, 'človek na stavbách', 'ľudia na stavbách', 'ľudí na stavbách')}`,
      todo(x) {
        const bezia = arr(x.subcontracts).filter(s => s.status === 'active');
        const obsadene = new Set(arr(x.assignments)
          .filter(a => a.status === 'active').map(a => a.subcontract_id));
        const prazdne = bezia.filter(s => !obsadene.has(s.id));
        if (!prazdne.length) return { n: 0, state: CALM, text: 'Na každej bežiacej zákazke niekto je.' };
        return { n: prazdne.length, state: BAD,
          text: `${prazdne.length} ${plural(prazdne.length, 'zákazka beží', 'zákazky bežia', 'zákaziek beží')} a nie je na nej nikto` };
      },
    },

    // ── Peniaze ────────────────────────────────────────────────────────────
    {
      n: 10, key: 'timesheets', lane: 'peniaze', ico: 'clock', route: 'timesheets',
      title: 'Hodiny',
      lead: 'Čo sa kedy odrobilo. Z toho istého zápisu vzniká faktúra odberateľovi aj kontrola faktúry od živnostníka.',
      next: 'Hodiny sa na konci mesiaca uzavrú do obdobia.',
      have: (x) => Math.round(arr(x.timesheets)
        .filter(t => !t.period_id).reduce((s, t) => s + num(t.hours), 0)),
      haveText: (n) => `${n} h mimo obdobia`,
      todo(x) {
        const dnes = x.today;
        // Hodiny staršie než dva týždne sa už ťažko vysvetľujú obom stranám.
        const stare = arr(x.timesheets).filter(t => !t.period_id && t.work_date
          && dni(dnes, day(t.work_date)) >= 14);
        if (!stare.length) return { n: 0, state: CALM, text: 'Hodiny sú čerstvé.' };
        return { n: stare.length, state: WATCH,
          text: `${stare.length} ${plural(stare.length, 'zápis je', 'zápisy sú', 'zápisov je')} starší než dva týždne` };
      },
    },
    {
      n: 11, key: 'periods', lane: 'peniaze', ico: 'calendar', route: 'subcontracts',
      title: 'Obdobie',
      lead: 'Uzavretím sa hodiny zmrazia. Odberateľ podpisuje výkaz za celé obdobie, nie za jednotlivé dni.',
      next: 'Z uzavretého obdobia vznikne podklad na faktúru.',
      have: (x) => arr(x.periods).length,
      haveText: (n) => `${n} ${plural(n, 'obdobie', 'obdobia', 'období')}`,
      todo(x) {
        const dnes = x.today;
        const zrele = arr(x.periods).filter(p => p.status === 'open'
          && p.period_to && day(p.period_to) < dnes);
        if (!zrele.length) return { n: 0, state: CALM, text: 'Nič nečaká na uzavretie.' };
        return { n: zrele.length, state: BAD,
          text: `${zrele.length} ${plural(zrele.length, 'obdobie čaká', 'obdobia čakajú', 'období čaká')} na uzavretie — bez toho faktúra nevznikne` };
      },
    },
    {
      n: 12, key: 'invoices', lane: 'peniaze', ico: 'invoices', route: 'invoices',
      title: 'Vydaná faktúra',
      lead: 'Faktúra odberateľovi. Bez schválenia človekom sa nevystaví ani neodošle — nikdy, ani automaticky.',
      next: 'Po odoslaní sa čaká na úhradu.',
      have: (x) => arr(x.invoices).length,
      haveText: (n) => `${n} ${plural(n, 'faktúra', 'faktúry', 'faktúr')}`,
      todo(x) {
        const caka = arr(x.invoices).filter(i => i.status === 'pending_approval');
        if (!caka.length) return { n: 0, state: CALM, text: 'Nič nečaká na schválenie.' };
        return { n: caka.length, state: WATCH,
          text: `${caka.length} ${plural(caka.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na tvoje schválenie` };
      },
    },
    {
      n: 13, key: 'bills', lane: 'peniaze', ico: 'receipt', route: 'costs',
      title: 'Faktúra od živnostníka',
      lead: 'Čo nám vyfakturoval on. Porovná sa s hodinami, ktoré má zapísané — rozdiel sa rieši, nie prepláca.',
      next: 'Schválená faktúra sa uhradí a odpočíta sa z nej záloha.',
      have: (x) => arr(x.bills).length,
      haveText: (n) => `${n} ${plural(n, 'prijatá faktúra', 'prijaté faktúry', 'prijatých faktúr')}`,
      todo(x) {
        const sporne = arr(x.bills).filter(b => b.status === 'disputed');
        if (sporne.length) {
          return { n: sporne.length, state: BAD,
            text: `${sporne.length} ${plural(sporne.length, 'faktúra je', 'faktúry sú', 'faktúr je')} sporná — treba dohodnúť` };
        }
        const naKontrolu = arr(x.bills).filter(b => ['received', 'checked'].includes(b.status));
        if (!naKontrolu.length) return { n: 0, state: CALM, text: 'Nič nečaká na kontrolu.' };
        return { n: naKontrolu.length, state: WATCH,
          text: `${naKontrolu.length} ${plural(naKontrolu.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na porovnanie s hodinami` };
      },
    },
    {
      n: 14, key: 'bank', lane: 'peniaze', ico: 'wallet', route: 'bank',
      title: 'Úhrada',
      lead: 'Výpis z účtu sa páruje s faktúrami. Odtiaľ sa vie, čo je naozaj zaplatené.',
      next: 'Tým sa reťazec uzavrel.',
      have: (x) => arr(x.invoices).filter(i => i.status === 'paid').length,
      haveText: (n) => `${n} ${plural(n, 'zaplatená faktúra', 'zaplatené faktúry', 'zaplatených faktúr')}`,
      todo(x) {
        const dnes = x.today;
        const po = arr(x.invoices).filter(i =>
          !['paid', 'cancelled', 'draft'].includes(i.status)
          && i.due_date && day(i.due_date) < dnes);
        if (!po.length) return { n: 0, state: CALM, text: 'Nič nemešká.' };
        return { n: po.length, state: BAD,
          text: `${po.length} ${plural(po.length, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti` };
      },
    },
  ];

  /** Počet dní medzi dvoma dňami. Kladné = `a` je po `b`. */
  function dni(a, b) {
    if (!a || !b) return null;
    const t = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
    const x = t(a), y = t(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return Math.round((x - y) / 86400000);
  }

  const BY_KEY = new Map(STEPS.map(s => [s.key, s]));

  /** Jeden krok aj s tým, čo v ňom práve stojí. */
  function step(key, x) {
    const s = BY_KEY.get(key);
    if (!s) return null;
    const data = x || {};
    let have = 0, todo = { n: 0, state: CALM, text: '' };
    // Rozbité dáta z jedného dotazu nesmú zhodiť celú mapu — zvyšných
    // trinásť krokov je stále užitočných.
    try { have = s.have(data) || 0; } catch { have = 0; }
    try { todo = s.todo(data) || todo; } catch { todo = { n: 0, state: CALM, text: '' }; }
    return {
      n: s.n, key: s.key, lane: s.lane, ico: s.ico, route: s.route,
      title: s.title, lead: s.lead, next: s.next,
      have, haveText: s.haveText(have),
      todo: todo.n || 0, todoText: todo.text || '', state: todo.state || CALM,
    };
  }

  /** Všetky kroky v poradí, v akom sa robia. */
  function all(x) { return STEPS.map(s => step(s.key, x)); }

  /** Kroky rozdelené do dráh — tak sa to aj kreslí. */
  function lanes(x) {
    const steps = all(x);
    return LANES.map(l => ({ ...l, steps: steps.filter(s => s.lane === l.key) }));
  }

  /**
   * Prvá veta na obrazovke. Nie „všetko v poriadku", ale **kde sa to stojí**
   * — a vždy ten najskorší krok v reťazci, lebo ten drží zvyšok.
   */
  function headline(steps) {
    const s = steps || [];
    const zle = s.filter(x => x.state === BAD);
    const sledovat = s.filter(x => x.state === WATCH);
    if (!s.length) return { tone: CALM, text: '', step: null };
    if (zle.length) {
      const prvy = zle[0];
      return {
        tone: BAD, step: prvy,
        text: zle.length === 1
          ? `Zastavilo sa to na kroku ${prvy.n} — ${prvy.title.toLowerCase()}.`
          : `Zastavilo sa to na ${zle.length} miestach. Najskôr na kroku ${prvy.n} — ${prvy.title.toLowerCase()}.`,
      };
    }
    if (sledovat.length) {
      const prvy = sledovat[0];
      return {
        tone: WATCH, step: prvy,
        text: `Nič nehorí. Najbližšie na rade je krok ${prvy.n} — ${prvy.title.toLowerCase()}.`,
      };
    }
    return { tone: CALM, step: null,
      text: 'Celý reťazec je priechodný — nikde nič nestojí.' };
  }

  /** Súhrn pre pruh nad mapou. */
  function summary(steps) {
    const s = steps || [];
    return {
      total: s.length,
      blocked: s.filter(x => x.state === BAD).length,
      watch: s.filter(x => x.state === WATCH).length,
      clear: s.filter(x => x.state === CALM).length,
      // Koľko jednotlivých vecí čaká dokopy. Nie počet krokov — počet vecí.
      items: s.reduce((a, x) => a + (x.todo || 0), 0),
    };
  }

  const API = {
    LANES, STEPS, CALM, WATCH, BAD,
    step, all, lanes, headline, summary, plural, dni,
  };
  if (typeof window !== 'undefined') window.DanubraChain = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
