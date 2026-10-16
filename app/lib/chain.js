// ============================================================================
// DANUBRA — ako to celé ide
// ============================================================================
// Appka vie veľa vecí, ale poradie práce z nej nebolo vidieť: že ponuka je pred
// zmluvou, zmluva pred stavbou a že bez uzavretého obdobia nevznikne faktúra.
// V `docs/FLOW.md` to napísané je — lenže to je dokument, nie obrazovka, a kto
// má appku používať, ten ho nečíta.
//
// Táto knižnica je ten istý reťazec ako **dáta**: sedem krokov tak, ako ich
// povedal majiteľ, a pri každom kroku odpoveď na dve otázky:
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

  // ── Sedem krokov ─────────────────────────────────────────────────────────
  // Toto nie je mapa databázy. Je to **to, čo sa vo firme naozaj robí**,
  // povedané tak, ako to povedal majiteľ:
  //
  //   1. máme dopyt na zákazku
  //   2. treba spraviť inzeráty a osloviť záujemcov
  //   3. objednávka a zmluva s Nemcom
  //   4. súhlas GDPR od živnostníka
  //   5. zmluva so živnostníkom, zvyčajne do konca roka
  //   6. objednávka živnostníkovi a papiere v poriadku
  //   7. ubytovanie, hodiny a faktúry
  //
  // Dovtedy ich tu bolo **štrnásť v štyroch dráhach** — rozpísané podľa toho,
  // čo je v databáze (ponuka, zmluva, zákazka, nasadenie, obdobie, faktúra,
  // úhrada). Všetko to v appke stále je; len sa to už netvári, že je to sedem
  // ďalších vecí na učenie. Krok otvorí obrazovku, kde sa to rieši.
  //
  // `have`  — koľko je toho v systéme (informácia, nie úloha)
  // `todo`  — { n, text, state } čo čaká na teba. `n: 0` znamená „tu je čisto".
  const STEPS = [
    {
      n: 1, key: 'dopyt', ico: 'offers', route: 'opportunities',
      title: 'Dopyt na zákazku',
      lead: 'Niekto sa ozve, že potrebuje ľudí. Zapíše to ten, kto to prijal — '
        + 'aj keď o tom vie málo.',
      next: 'Keď to dáva zmysel, ide von ponuka.',
      have: (x) => arr(x.opportunities).filter(o => !['won', 'lost'].includes(o.status)).length
        + arr(x.quotes).filter(q => q.status === 'sent').length,
      haveText: (n) => `${n} ${plural(n, 'otvorený dopyt', 'otvorené dopyty', 'otvorených dopytov')}`,
      todo(x) {
        // Odberateľ, ktorý hľadá ľudí, volá viacerým. Rozhoduje, kto sa ozve
        // prvý — nie kto má lepšiu cenu.
        const nove = arr(x.opportunities).filter(o => o.status === 'new');
        if (nove.length) {
          return { n: nove.length, state: BAD,
            text: `${nove.length} ${plural(nove.length, 'dopyt čaká', 'dopyty čakajú', 'dopytov čaká')} na prvú odpoveď` };
        }
        const prepadnute = arr(x.quotes).filter(q => q.status === 'sent'
          && q.valid_until && day(q.valid_until) < x.today);
        if (prepadnute.length) {
          return { n: prepadnute.length, state: BAD,
            text: `${prepadnute.length} ${plural(prepadnute.length, 'ponuke prepadla', 'ponukám prepadla', 'ponukám prepadla')} platnosť bez odpovede` };
        }
        const visia = arr(x.quotes).filter(q => q.status === 'sent');
        if (visia.length) {
          return { n: visia.length, state: WATCH,
            text: `${visia.length} ${plural(visia.length, 'ponuka čaká', 'ponuky čakajú', 'ponúk čaká')} na odpoveď` };
        }
        return { n: 0, state: CALM, text: 'Nič nečaká na odpoveď.' };
      },
    },
    {
      n: 2, key: 'nabor', ico: 'marketing', route: 'hiring',
      title: 'Inzeráty a záujemcovia',
      lead: 'Zo zadania vzniknú texty na web, Bazoš a Facebook. Kto sa ozve, '
        + 'tomu sa treba ozvať späť do desiatich minút.',
      next: 'Zo záujemcu, ktorý prejde, bude živnostník.',
      have: (x) => arr(x.ads).filter(a => a.active !== false).length,
      haveText: (n) => `${n} ${plural(n, 'bežiaci inzerát', 'bežiace inzeráty', 'bežiacich inzerátov')}`,
      todo(x) {
        // Nábor bez inzerátu je najtichšia chyba v celom reťazci: nič nehorí,
        // len sa nikto neozýva — a nikoho nenapadne, že je to preto, že sa
        // nemá kde ozvať.
        const bezia = arr(x.ads).filter(a => a.active !== false).length;
        const nabory = arr(x.plans).filter(p => p.status === 'active').length;
        if (nabory && !bezia) {
          return { n: nabory, state: BAD,
            text: `${nabory} ${plural(nabory, 'nábor beží', 'nábory bežia', 'náborov beží')} bez jediného inzerátu — nemá sa kto ozvať` };
        }
        const cakaju = arr(x.candidates).filter(c => !c.first_contact_at
          && !['rejected', 'hired', 'converted'].includes(c.status));
        if (cakaju.length) {
          return { n: cakaju.length, state: BAD,
            text: `${cakaju.length} ${plural(cakaju.length, 'človek čaká', 'ľudia čakajú', 'ľudí čaká')} na prvý telefonát` };
        }
        const visia = arr(x.candidates).filter(c => c.first_contact_at
          && !c.converted_worker_id
          && !['rejected', 'hired', 'converted'].includes(c.status));
        if (visia.length) {
          return { n: visia.length, state: WATCH,
            text: `${visia.length} ${plural(visia.length, 'záujemca čaká', 'záujemcovia čakajú', 'záujemcov čaká')} na rozhodnutie` };
        }
        return { n: 0, state: CALM, text: bezia ? 'Inzeráty bežia a nikto nečaká.' : 'Žiadny nábor nebeží.' };
      },
    },
    {
      n: 3, key: 'nemec', ico: 'note', route: 'contracts',
      title: 'Objednávka a zmluva s Nemcom',
      lead: 'Dvojjazyčne: on podpisuje po nemecky, my čítame po slovensky. '
        + 'Je to dielo, nie hodiny — inak hrozí Arbeitnehmerüberlassung.',
      next: 'Z dohodnutej zmluvy vznikne konkrétna stavba.',
      have: (x) => arr(x.contracts).length,
      haveText: (n) => `${n} ${plural(n, 'zmluva', 'zmluvy', 'zmlúv')}`,
      todo(x) {
        const bezZmluvy = arr(x.subcontracts).filter(s => s.status === 'active' && !s.contract_id);
        if (bezZmluvy.length) {
          return { n: bezZmluvy.length, state: BAD,
            text: `${bezZmluvy.length} ${plural(bezZmluvy.length, 'stavba beží', 'stavby bežia', 'stavieb beží')} bez zmluvy` };
        }
        const nepodpisane = arr(x.contracts).filter(c =>
          !c.signed_at && !['cancelled', 'rejected'].includes(c.status));
        if (nepodpisane.length) {
          return { n: nepodpisane.length, state: WATCH,
            text: `${nepodpisane.length} ${plural(nepodpisane.length, 'zmluva nie je', 'zmluvy nie sú', 'zmlúv nie je')} podpísaná` };
        }
        // Bez USt-IdNr sa nedá fakturovať v reverse charge podľa §13b —
        // a na to sa príde až vo chvíli, keď má faktúra odísť.
        const bez = arr(x.partners).filter(p => p.country && p.country !== 'SK' && !p.ust_idnr);
        if (bez.length) {
          return { n: bez.length, state: WATCH,
            text: `${bez.length} ${plural(bez.length, 'odberateľ nemá', 'odberatelia nemajú', 'odberateľov nemá')} USt-IdNr — faktúra im neodíde` };
        }
        return { n: 0, state: CALM, text: 'Zmluvy sú podpísané.' };
      },
    },
    {
      n: 4, key: 'gdpr', ico: 'shield', route: 'workers',
      title: 'Súhlas GDPR od živnostníka',
      lead: 'Držíme jeho meno, doklady a telefón. Bez jeho súhlasu na to nemáme právo.',
      next: 'So súhlasom sa s ním dá spísať zmluva.',
      have: (x) => poctyDokladov(x, 'gdpr').maju,
      haveText: (n) => `${n} ${plural(n, 'súhlas', 'súhlasy', 'súhlasov')}`,
      todo(x) {
        const { chybaNasadenym, chyba } = poctyDokladov(x, 'gdpr');
        if (chybaNasadenym) {
          return { n: chybaNasadenym, state: BAD,
            text: `${chybaNasadenym} ${plural(chybaNasadenym, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe bez podpísaného súhlasu` };
        }
        if (chyba) {
          return { n: chyba, state: WATCH,
            text: `${chyba} ${plural(chyba, 'živnostník nepodpísal', 'živnostníci nepodpísali', 'živnostníkov nepodpísalo')} súhlas` };
        }
        return { n: 0, state: CALM, text: 'Súhlasy sú podpísané.' };
      },
    },
    {
      n: 5, key: 'zmluva', ico: 'doc', route: 'workers',
      title: 'Zmluva so živnostníkom',
      lead: 'Rámcová zmluva o dielo, zvyčajne do konca kalendárneho roka. '
        + 'Bez nej je to zamestnávanie, nie subdodávka.',
      next: 'Na zmluvu sa viaže konkrétna objednávka.',
      have: (x) => poctyDokladov(x, 'contract').maju,
      haveText: (n) => `${n} ${plural(n, 'zmluva', 'zmluvy', 'zmlúv')}`,
      todo(x) {
        const { chybaNasadenym, chyba, koncia } = poctyDokladov(x, 'contract');
        if (chybaNasadenym) {
          return { n: chybaNasadenym, state: BAD,
            text: `${chybaNasadenym} ${plural(chybaNasadenym, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe bez zmluvy` };
        }
        if (koncia) {
          return { n: koncia, state: WATCH,
            text: `${koncia} ${plural(koncia, 'zmluve sa končí', 'zmluvám sa končí', 'zmluvám sa končí')} platnosť` };
        }
        if (chyba) {
          return { n: chyba, state: WATCH,
            text: `${chyba} ${plural(chyba, 'živnostník nemá', 'živnostníci nemajú', 'živnostníkov nemá')} zmluvu` };
        }
        return { n: 0, state: CALM, text: 'Zmluvy platia.' };
      },
    },
    {
      n: 6, key: 'objednavka', ico: 'orders', route: 'subcontracts',
      title: 'Objednávka a papiere v poriadku',
      lead: 'Konkrétna objednávka na konkrétnu stavbu — a k nej A1, hlásenie Zoll '
        + 'a ostatné papiere, bez ktorých sa tam nesmie.',
      next: 'S papiermi v poriadku môže nastúpiť.',
      have: (x) => {
        const bezia = new Set(arr(x.subcontracts).filter(s => s.status === 'active').map(s => s.id));
        return arr(x.assignments).filter(a => a.status === 'active' && bezia.has(a.subcontract_id)).length;
      },
      haveText: (n) => `${n} ${plural(n, 'človek na stavbách', 'ľudia na stavbách', 'ľudí na stavbách')}`,
      todo(x) {
        const zle = arr(x.documents).filter(d => d.validity === 'expired');
        if (zle.length) {
          const ludi = new Set(zle.map(d => d.worker_id)).size;
          return { n: ludi, state: BAD,
            text: `${ludi} ${plural(ludi, 'človek nemá', 'ľudia nemajú', 'ľudí nemá')} platné doklady — nasadiť sa nedá` };
        }
        const bezia = arr(x.subcontracts).filter(s => s.status === 'active');
        const obsadene = new Set(arr(x.assignments)
          .filter(a => a.status === 'active').map(a => a.subcontract_id));
        const prazdne = bezia.filter(s => !obsadene.has(s.id));
        if (prazdne.length) {
          return { n: prazdne.length, state: BAD,
            text: `${prazdne.length} ${plural(prazdne.length, 'stavba beží', 'stavby bežia', 'stavieb beží')} a nie je na nej nikto` };
        }
        const konci = arr(x.documents).filter(d => d.validity === 'expiring').length;
        if (konci) {
          return { n: konci, state: WATCH,
            text: `${konci} ${plural(konci, 'dokladu sa končí', 'dokladom sa končí', 'dokladom sa končí')} platnosť` };
        }
        return { n: 0, state: CALM, text: 'Papiere sú v poriadku.' };
      },
    },
    {
      n: 7, key: 'stavba', ico: 'clock', route: 'timesheets',
      title: 'Ubytovanie, hodiny a faktúry',
      lead: 'Človek je na stavbe: má kde spať, hodiny sa zapisujú a z nich vzniká '
        + 'faktúra odberateľovi aj kontrola faktúry od neho.',
      next: 'Úhradou na účet sa to uzavrie.',
      have: (x) => arr(x.invoices).filter(i => i.status === 'paid').length,
      haveText: (n) => `${n} ${plural(n, 'zaplatená faktúra', 'zaplatené faktúry', 'zaplatených faktúr')}`,
      todo(x) {
        const dnes = x.today;
        const po = arr(x.invoices).filter(i =>
          !['paid', 'cancelled', 'draft'].includes(i.status)
          && i.due_date && day(i.due_date) < dnes);
        if (po.length) {
          return { n: po.length, state: BAD,
            text: `${po.length} ${plural(po.length, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti` };
        }
        const zrele = arr(x.periods).filter(p => p.status === 'open'
          && p.period_to && day(p.period_to) < dnes);
        if (zrele.length) {
          return { n: zrele.length, state: BAD,
            text: `${zrele.length} ${plural(zrele.length, 'obdobie čaká', 'obdobia čakajú', 'období čaká')} na uzavretie — bez toho faktúra nevznikne` };
        }
        const sporne = arr(x.bills).filter(b => b.status === 'disputed');
        if (sporne.length) {
          return { n: sporne.length, state: BAD,
            text: `${sporne.length} ${plural(sporne.length, 'prijatá faktúra je', 'prijaté faktúry sú', 'prijatých faktúr je')} sporná` };
        }
        const caka = arr(x.invoices).filter(i => i.status === 'pending_approval');
        if (caka.length) {
          return { n: caka.length, state: WATCH,
            text: `${caka.length} ${plural(caka.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na tvoje schválenie` };
        }
        // Hodiny staršie než dva týždne sa už ťažko vysvetľujú obom stranám.
        const stare = arr(x.timesheets).filter(t => !t.period_id && t.work_date
          && dni(dnes, day(t.work_date)) >= 14);
        if (stare.length) {
          return { n: stare.length, state: WATCH,
            text: `${stare.length} ${plural(stare.length, 'zápis hodín je', 'zápisy hodín sú', 'zápisov hodín je')} starší než dva týždne` };
        }
        return { n: 0, state: CALM, text: 'Hodiny aj faktúry sú vybavené.' };
      },
    },
  ];

  /**
   * Koľkí živnostníci majú daný papier — a koľkým chýba.
   *
   * `nasadeny` je tu to podstatné: chýbajúci súhlas u človeka, ktorý nikam
   * nejde, je úloha na budúci týždeň; u človeka, ktorý už stojí na stavbe,
   * je to problém dnes.
   */
  function poctyDokladov(x, kind) {
    const doklady = arr(x.documents).filter(d => d.kind === kind);
    const platne = new Set(doklady.filter(d => d.validity !== 'expired').map(d => d.worker_id));
    const koncia = new Set(doklady.filter(d => d.validity === 'expiring').map(d => d.worker_id));
    const vsetci = arr(x.workers).filter(w => w && !['inactive', 'blacklist'].includes(w.status));
    const nasadeni = new Set(arr(x.assignments)
      .filter(a => a.status === 'active').map(a => a.worker_id).filter(Boolean));
    const chybaju = vsetci.filter(w => !platne.has(w.id));
    return {
      maju: platne.size,
      chyba: chybaju.length,
      chybaNasadenym: chybaju.filter(w => nasadeni.has(w.id)).length,
      koncia: koncia.size,
    };
  }

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
    // šesť krokov je stále užitočných.
    try { have = s.have(data) || 0; } catch { have = 0; }
    try { todo = s.todo(data) || todo; } catch { todo = { n: 0, state: CALM, text: '' }; }
    return {
      n: s.n, key: s.key, ico: s.ico, route: s.route,
      title: s.title, lead: s.lead, next: s.next,
      have, haveText: s.haveText(have),
      todo: todo.n || 0, todoText: todo.text || '', state: todo.state || CALM,
    };
  }

  /** Všetky kroky v poradí, v akom sa robia. */
  function all(x) { return STEPS.map(s => step(s.key, x)); }

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
    STEPS, CALM, WATCH, BAD,
    step, all, headline, summary, plural, dni, poctyDokladov,
  };
  if (typeof window !== 'undefined') window.DanubraChain = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
