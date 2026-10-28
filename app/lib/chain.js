// ============================================================================
// DANUBRA — ako to celé ide
// ============================================================================
// Appka vie veľa vecí, ale poradie práce z nej nebolo vidieť: že ponuka je pred
// zmluvou, zmluva pred stavbou a že bez uzavretého obdobia nevznikne faktúra.
// V `docs/FLOW.md` to napísané je — lenže to je dokument, nie obrazovka, a kto
// má appku používať, ten ho nečíta.
//
// Táto knižnica je ten istý reťazec ako **dáta**: tých istých sedem krokov
// ako na zákazke (`staffing/job.js` — jedno poradie, jedny čísla a názvy
// v celej appke) a pri každom kroku odpoveď na dve otázky:
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
  // Toto nie je mapa databázy. Je to **to, čo sa vo firme naozaj robí** —
  // a je to **to isté poradie ako na zákazke** (`staffing/job.js`):
  //
  //   1. dopyt a ponuka
  //   2. ľudia na stavbu (inzeráty, záujemcovia, nasadenie)
  //   3. zmluva s Nemcom (zmluva o dielo a jeho objednávka)
  //   4. papiere ľudí (súhlas GDPR, A1, živnosť, hlásenie Zoll)
  //   5. zmluvy a objednávky živnostníkom (rámcová zmluva, objednávka)
  //   6. ubytovanie a doprava
  //   7. hodiny a faktúra
  //
  // Dovtedy tu boli kroky po svojom („objednávka živnostníkovi" krok 6, na
  // zákazke 5; ubytovanie 7, na zákazke 6) a človek, ktorý prešiel zo „Dnes"
  // na zákazku, sa v číslach stratil. Kľúč, číslo, názov a ikona sa preto
  // berú zo `staffing/job.js` — tu sa k nim dopĺňa len to, čo sa počíta za
  // celú firmu. Krok otvorí obrazovku, kde sa to rieši.
  //
  // `have`  — koľko je toho v systéme (informácia, nie úloha)
  // `todo`  — { n, text, state, focus } čo čaká na Vás. `n: 0` = „tu je čisto".
  //           `focus` je filter na Živnostníkoch (nogdpr / nocontract / noorder).
  const JOB = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./staffing/job.js')
    : (typeof window !== 'undefined' ? window.DanubraJob : null);
  const BASE = (JOB && JOB.STEPS) || [];

  /** Ľudia s bežiacim nasadením na bežiacej zákazke. */
  function naStavbe(x) {
    const bezia = new Set(arr(x.subcontracts).filter(s => s.status === 'active').map(s => s.id));
    return arr(x.assignments).filter(a => a && a.status === 'active' && bezia.has(a.subcontract_id));
  }

  const FIRM = {
    dopyt: {
      route: 'opportunities',
      hint: 'Zapíšte, kto potrebuje ľudí — koľko, kam, od kedy a za koľko.',
      cta: ['Odpovedať na dopyty', 'Vložiť dopyt'],
      lead: 'Niekto sa ozve, že potrebuje ľudí. Zapíše to ten, kto to prijal — '
        + 'aj keď o tom vie málo. Keď to dáva zmysel, ide von ponuka.',
      next: 'Z prijatej ponuky vznikne zákazka a hľadajú sa ľudia.',
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
    ludia: {
      route: 'hiring',
      hint: 'Spustite inzeráty, ozvite sa záujemcom do desiatich minút a nasaďte ich.',
      cta: ['Ozvať sa ľuďom', 'Otvoriť nábor'],
      lead: 'Zo zadania vzniknú inzeráty na web, Bazoš a Facebook. Kto sa ozve, '
        + 'tomu sa treba ozvať späť do desiatich minút — a kto prejde, ide na stavbu.',
      next: 'Keď je jasné, kto pôjde, podpisuje sa zmluva s Nemcom.',
      have: (x) => naStavbe(x).length,
      haveText: (n) => `${n} ${plural(n, 'človek na stavbách', 'ľudia na stavbách', 'ľudí na stavbách')}`,
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
        const obsadene = new Set(naStavbe(x).map(a => a.subcontract_id));
        const prazdne = arr(x.subcontracts).filter(s => s.status === 'active' && !obsadene.has(s.id));
        if (prazdne.length) {
          return { n: prazdne.length, state: BAD,
            text: `${prazdne.length} ${plural(prazdne.length, 'stavba beží', 'stavby bežia', 'stavieb beží')} a nie je na nej nikto` };
        }
        const visia = arr(x.candidates).filter(c => c.first_contact_at
          && !c.converted_worker_id
          && !['rejected', 'hired', 'converted'].includes(c.status));
        if (visia.length) {
          return { n: visia.length, state: WATCH,
            text: `${visia.length} ${plural(visia.length, 'záujemca čaká', 'záujemcovia čakajú', 'záujemcov čaká')} na rozhodnutie` };
        }
        return { n: 0, state: CALM, text: bezia ? 'Inzeráty bežia a nikto nečaká.' : 'Nikto nečaká a žiadny nábor nebeží.' };
      },
    },
    nemec: {
      route: 'contracts',
      hint: 'Zmluva o dielo a objednávka s nemeckou firmou — po slovensky aj po nemecky.',
      cta: ['Doriešiť zmluvy', 'Zmluvy s odberateľmi'],
      lead: 'Dvojjazyčne: on podpisuje po nemecky, my čítame po slovensky. '
        + 'Je to dielo, nie hodiny — inak hrozí Arbeitnehmerüberlassung.',
      next: 'S podpísanou zmluvou sa chystajú papiere ľudí.',
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
    papiere: {
      route: 'workers',
      hint: 'Súhlas GDPR a platné doklady (A1, živnosť) u každého, kto ide na stavbu.',
      cta: ['Doplniť papiere', 'Otvoriť živnostníkov'],
      lead: 'Držíme meno, doklady a telefón človeka — bez súhlasu GDPR na to nemáme '
        + 'právo. Bez platného A1 a hlásenia Zoll sa na stavbu nesmie.',
      next: 'S papiermi v poriadku sa so živnostníkom spíše zmluva a objednávka.',
      have: (x) => poctyDokladov(x, 'gdpr').maju,
      haveText: (n) => `${n} ${plural(n, 'súhlas GDPR', 'súhlasy GDPR', 'súhlasov GDPR')}`,
      todo(x) {
        const { chybaNasadenym, chyba } = poctyDokladov(x, 'gdpr');
        if (chybaNasadenym) {
          return { n: chybaNasadenym, state: BAD, focus: 'nogdpr',
            text: `${chybaNasadenym} ${plural(chybaNasadenym, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe bez podpísaného súhlasu GDPR` };
        }
        // Zmluva o dielo je doklad tiež, ale patrí do kroku 5.
        const doklady = arr(x.documents).filter(d => d.kind !== 'contract');
        const zle = doklady.filter(d => d.validity === 'expired');
        if (zle.length) {
          const ludi = new Set(zle.map(d => d.worker_id)).size;
          return { n: ludi, state: BAD,
            text: `${ludi} ${plural(ludi, 'človek nemá', 'ľudia nemajú', 'ľudí nemá')} platné doklady — nasadiť sa nedá` };
        }
        // Migrácia 067: doklad sa ráta, až keď je nahratý. Zapísaný bez
        // fotky či PDF je pri nasadení to isté ako chýbajúci.
        const bezSkenu = doklady.filter(d => ['valid', 'expiring'].includes(d.validity) && !nahraty(d));
        if (bezSkenu.length) {
          const ludi = new Set(bezSkenu.map(d => d.worker_id)).size;
          return { n: ludi, state: BAD, focus: 'noscan',
            text: `${ludi} ${plural(ludi, 'človek má', 'ľudia majú', 'ľudí má')} doklad zapísaný, ale nenahratý — nasadiť sa nedá` };
        }
        if (chyba) {
          return { n: chyba, state: WATCH, focus: 'nogdpr',
            text: `${chyba} ${plural(chyba, 'živnostník nepodpísal', 'živnostníci nepodpísali', 'živnostníkov nepodpísalo')} súhlas GDPR` };
        }
        const konci = doklady.filter(d => d.validity === 'expiring').length;
        if (konci) {
          return { n: konci, state: WATCH,
            text: `${konci} ${plural(konci, 'dokladu sa končí', 'dokladom sa končí', 'dokladom sa končí')} platnosť` };
        }
        return { n: 0, state: CALM, text: 'Súhlasy aj doklady sú v poriadku.' };
      },
    },
    zivnostnici: {
      route: 'workers',
      hint: 'Rámcová zmluva o dielo (zvyčajne do 31. 12.) a objednávka na každú stavbu.',
      cta: ['Doplniť zmluvy a objednávky', 'Otvoriť živnostníkov'],
      lead: 'Rámcová zmluva o dielo sa podpíše raz, zvyčajne do konca roka; na každú '
        + 'stavbu k nej ide objednávka. Bez nich je to zamestnávanie, nie subdodávka.',
      next: 'S objednávkou v ruke treba ľuďom zariadiť bývanie a dopravu.',
      have: (x) => poctyDokladov(x, 'contract').maju,
      haveText: (n) => `${n} ${plural(n, 'rámcová zmluva', 'rámcové zmluvy', 'rámcových zmlúv')}`,
      todo(x) {
        const { chybaNasadenym, chyba, koncia } = poctyDokladov(x, 'contract');
        if (chybaNasadenym) {
          return { n: chybaNasadenym, state: BAD, focus: 'nocontract',
            text: `${chybaNasadenym} ${plural(chybaNasadenym, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe bez rámcovej zmluvy` };
        }
        // Objednávky sa kontrolujú len vtedy, keď ich niekto načítal —
        // chýbajúci zoznam nie je „nikto nemá objednávku".
        if (Array.isArray(x.orders)) {
          const maju = new Set(x.orders.filter(o => o && o.kind === 'worker' && o.status !== 'cancelled')
            .map(o => o.assignment_id));
          const bez = naStavbe(x).filter(a => !maju.has(a.id));
          if (bez.length) {
            const ludi = new Set(bez.map(a => a.worker_id)).size;
            return { n: ludi, state: WATCH, focus: 'noorder',
              text: `${ludi} ${plural(ludi, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe bez objednávky` };
          }
        }
        if (koncia) {
          return { n: koncia, state: WATCH, focus: 'nocontract',
            text: `${koncia} ${plural(koncia, 'zmluve sa končí', 'zmluvám sa končí', 'zmluvám sa končí')} platnosť` };
        }
        if (chyba) {
          return { n: chyba, state: WATCH, focus: 'nocontract',
            text: `${chyba} ${plural(chyba, 'živnostník nemá', 'živnostníci nemajú', 'živnostníkov nemá')} rámcovú zmluvu` };
        }
        return { n: 0, state: CALM, text: 'Zmluvy platia a objednávky sú vystavené.' };
      },
    },
    ubytovanie: {
      route: 'accommodations',
      hint: 'Kde ľudia na stavbe spia a kto ich tam vezie.',
      cta: ['Zapísať ubytovanie', 'Otvoriť ubytovania'],
      lead: 'Každý, kto je na stavbe, má mať zapísané, kde býva. Ubytovanie je náklad '
        + 'zákazky — a človek bez strechy nad hlavou zo stavby odíde.',
      next: 'Keď ľudia robia, zapisujú sa hodiny zo Stundennachweisu.',
      have: (x) => naStavbe(x).filter(a => byva(x, a)).length,
      haveText: (n) => `${n} ${plural(n, 'človek má', 'ľudia majú', 'ľudí má')} kde bývať`,
      todo(x) {
        // Pobyty sa kontrolujú len vtedy, keď ich niekto načítal.
        if (!Array.isArray(x.stays)) return { n: 0, state: CALM, text: 'Nikto nečaká na ubytovanie.' };
        const bez = naStavbe(x).filter(a => !byva(x, a));
        if (bez.length) {
          const ludi = new Set(bez.map(a => a.worker_id)).size;
          return { n: ludi, state: WATCH,
            text: `${ludi} ${plural(ludi, 'človek na stavbe nemá', 'ľudia na stavbe nemajú', 'ľudí na stavbe nemá')} zapísané ubytovanie` };
        }
        return { n: 0, state: CALM, text: 'Ubytovanie je zapísané.' };
      },
    },
    peniaze: {
      route: 'timesheets',
      hint: 'Hodiny zo Stundennachweisu, faktúra Nemcovi a úhrada — každý týždeň.',
      cta: ['Vybaviť hodiny a faktúry', 'Zapísať hodiny'],
      lead: 'Majster podpíše Stundennachweis, hodiny sa zapíšu a z nich vzniká '
        + 'faktúra odberateľovi aj kontrola faktúry od živnostníka.',
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
            text: `${caka.length} ${plural(caka.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na Vaše schválenie` };
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
  };

  /** Spoločný krok (číslo, názov, ikona) + to, čo sa počíta za firmu. */
  const STEPS = BASE.map(b => ({ ...b, ...(FIRM[b.key] || {}) }));

  /** Býva človek z tohto nasadenia niekde pri tejto zákazke? */
  function byva(x, a) {
    return arr(x.stays).some(s => s && s.worker_id === a.worker_id && s.is_current !== false
      && (!s.subcontract_id || s.subcontract_id === a.subcontract_id));
  }

  /**
   * Koľkí živnostníci majú daný papier — a koľkým chýba.
   *
   * `nasadeny` je tu to podstatné: chýbajúci súhlas u človeka, ktorý nikam
   * nejde, je úloha na budúci týždeň; u človeka, ktorý už stojí na stavbe,
   * je to problém dnes.
   */
  /**
   * Je doklad nahratý (fotka alebo PDF)? Riadok bez stĺpcov `storage_path`
   * a `file_url` (výber bez nich) sa za nenahratý nepovažuje — neznáme nie
   * je chýbajúce. Rovnaké pravidlo ako `DanubraDocs.hasScan`.
   */
  function nahraty(d) {
    if (!d) return false;
    if (!('storage_path' in d) && !('file_url' in d)) return true;
    return !!(String(d.storage_path || '').trim() || String(d.file_url || '').trim());
  }

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
      title: s.title, lead: s.lead, next: s.next, hint: s.hint || s.lead,
      // Tlačidlo hovorí, čo sa ide robiť — iné, keď niečo čaká, a iné, keď je čisto.
      cta: (todo.n ? (s.cta || [])[0] : (s.cta || [])[1]) || 'Otvoriť',
      have, haveText: s.haveText(have),
      todo: todo.n || 0, todoText: todo.text || '', state: todo.state || CALM,
      focus: (todo.n && todo.focus) || '',
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

  // ── Kde v reťazci práve som ──────────────────────────────────────────────
  // Obrazovka v menu je miesto v appke. Človek, ktorý ju otvorí, sa ale pýta
  // niečo iné: **ktorý krok práce je toto a čo príde potom.** Bez toho je
  // „Živnostníci" len zoznam mien — a nikoho nenapadne, že práve tu sa robí
  // súhlas GDPR aj zmluva.
  //
  // Obrazovka, ktorá do reťazca nepatrí (Úlohy, Nastavenia), tu nie je
  // a pruh sa na nej nekreslí.
  const ROUTE_STEPS = {
    opportunities: [1], quotes: [1],
    hiring: [2], candidates: [2], ads: [2], marketing: [2], recruiting: [2], trades: [2],
    // Partia je skupina ľudí, ktorá ide na stavbu spolu.
    crews: [2],
    contracts: [3], partners: [3],
    // Papiere aj zmluva sa robia na karte toho istého človeka.
    workers: [4, 5], compliance: [4],
    // Objednávka živnostníkovi sa vystavuje zo zákazky.
    subcontracts: [5], orders: [5],
    accommodations: [6],
    timesheets: [7], hoursheet: [7],
    money: [7], invoices: [7], costs: [7], bank: [7],
  };

  /**
   * Na ktorom kroku je obrazovka a ktorý ide po ňom.
   * `{ from, to, steps, next }` alebo `null`, keď obrazovka v reťazci nie je.
   */
  function stepOfRoute(route) {
    const n = ROUTE_STEPS[route];
    if (!n) return null;
    const from = n[0], to = n[n.length - 1];
    const steps = STEPS.filter(s => s.n >= from && s.n <= to)
      .map(s => ({ n: s.n, key: s.key, title: s.title, route: s.route }));
    const po = STEPS.find(s => s.n === to + 1);
    return { from, to, steps,
      next: po ? { n: po.n, key: po.key, title: po.title, route: po.route } : null };
  }

  // ── Čo ešte treba pri jednom človeku ─────────────────────────────────────
  // Kroky 4 a 5 sa nerobia „pre firmu", ale pre konkrétneho živnostníka:
  // jeho súhlas, jeho zmluva, jeho objednávka. Reťazec povie, že trom ľuďom
  // chýba zmluva; karta človeka má povedať, **čo ešte chýba práve jemu** —
  // a v akom poradí.
  //
  // Doklady sú tu riadky z `worker_documents` (bez stĺpca `validity`), preto
  // sa platnosť počíta z `valid_to`.
  const KONCI_DNI = 30;
  function personSteps(input) {
    const x = input || {};
    const w = x.worker || {};
    const today = day(x.today) || day(new Date().toISOString());
    // „Vyžiadaný" alebo „chýba" je záznam o tom, že papier **nemáme**.
    const docs = arr(x.docs).filter(d => d && d.worker_id === w.id
      && !['requested', 'missing'].includes(d.status));
    const asg = arr(x.assignments).filter(a => a && a.worker_id === w.id
      && ['planned', 'active'].includes(a.status));
    const ord = arr(x.orders).filter(o => o && o.kind === 'worker' && o.status !== 'cancelled');

    // Nahratý papier má prednosť pred zapísaným bez skenu (migrácia 067).
    const gdprs = docs.filter(d => d.kind === 'gdpr');
    const gdpr = gdprs.find(nahraty) || gdprs[0];
    const gSken = nahraty(gdpr);
    const zmluvy = docs.filter(d => d.kind === 'contract')
      .sort((a, b) => String(b.valid_to || '9999').localeCompare(String(a.valid_to || '9999')));
    const plati = (z) => { const t = day(z.valid_to); return !t || t >= today; };
    const zmluva = zmluvy.find(z => plati(z) && nahraty(z)) || zmluvy[0];
    const zDo = zmluva && day(zmluva.valid_to);
    const zPlati = !!zmluva && (!zDo || zDo >= today);
    const zSken = nahraty(zmluva);
    const zKonci = zPlati && zDo && dni(zDo, today) <= KONCI_DNI;

    const bezObj = asg.filter(a => !ord.some(o => o.assignment_id === a.id));

    const items = [
      {
        key: 'gdpr', n: 4, title: 'Súhlas GDPR',
        done: !!gdpr && gSken,
        // Zapísaný bez skenu: netreba ho zapisovať znova, stačí nahrať papier.
        needs: gdpr && !gSken ? 'scan' : null, docId: gdpr && !gSken ? (gdpr.id || null) : null,
        text: gdpr && !gSken ? 'Zapísaný, ale nie je nahratý — nahrajte sken podpísaného súhlasu.'
          : gdpr ? `Podpísaný ${denSk(gdpr.valid_from)}.`.replace(' .', '.')
          : 'Vytlačte súhlas, nechajte ho podpísať a zapíšte to.',
      },
      {
        key: 'zmluva', n: 5, title: 'Rámcová zmluva o dielo',
        done: zPlati && zSken, warn: !!zKonci,
        needs: zPlati && !zSken ? 'scan' : null, docId: zPlati && !zSken ? (zmluva.id || null) : null,
        text: zPlati && !zSken ? 'Zapísaná, ale nie je nahratá — nahrajte sken podpísanej zmluvy.'
          : zPlati
          ? (zDo ? `${zKonci ? 'Končí' : 'Platí do'} ${denSk(zDo)}${zKonci ? ' — pripravte novú.' : '.'}`
            : 'Platí bez obmedzenia.')
          : (zmluva ? `Skončila ${denSk(zDo)} — treba novú.`
            : 'Vytlačte zmluvu, nechajte ju podpísať a zapíšte to.'),
      },
      {
        key: 'objednavka', n: 5, title: 'Stavba a objednávka',
        done: asg.length > 0 && bezObj.length === 0,
        needs: !asg.length ? 'assign' : (bezObj.length ? 'order' : null),
        assignmentId: bezObj.length ? bezObj[0].id : null,
        text: !asg.length ? 'Ešte nie je na žiadnej stavbe. Vyberte mu stavbu.'
          : (bezObj.length ? 'Je na stavbe, ale nemá objednávku. Bez nej to nie je dielo.'
            : 'Má stavbu aj objednávku.'),
      },
    ];
    const next = items.find(i => !i.done) || null;
    return { items, next, done: !next, left: items.filter(i => !i.done).length };
  }

  function denSk(s) {
    const d = day(s);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return `${dd}. ${m}. ${y}`;
  }

  const API = {
    STEPS, CALM, WATCH, BAD, ROUTE_STEPS,
    step, all, headline, summary, plural, dni, poctyDokladov, nahraty,
    stepOfRoute, personSteps,
  };
  if (typeof window !== 'undefined') window.DanubraChain = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
