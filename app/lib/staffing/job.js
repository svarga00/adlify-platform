// ============================================================================
// DANUBRA — zákazka ako sedem krokov
// ============================================================================
// „Celé je to také neprehľadné a za mňa stále neintuitívne."
//
// Dovtedy bola práca rozhádzaná po dvadsiatich obrazovkách: dopyt v Dopytoch,
// zmluva s Nemcom v Zmluvách, GDPR a zmluva so živnostníkom v kartotéke,
// objednávka v Objednávkach, hodiny v Hodinách. Kto chcel vedieť, ako je na
// tom jedna stavba, musel prejsť šesť obrazoviek a poskladať si to v hlave.
//
// Teraz je **všetko pri zákazke** — sedem krokov pod sebou, v poradí, v akom
// sa robia, a pri každom jedna veta „čo chýba" a jedno tlačidlo:
//
//   1 Dopyt a dohoda        odberateľ, dielo, sadzba, termín
//   2 Ľudia                 koľko treba a koľko je nasadených
//   3 Zmluva s Nemcom       zmluva o dielo podpísaná, objednávka od neho
//   4 Papiere ľudí          GDPR, doklady (A1, živnosť…), hlásenie Zoll
//   5 Zmluvy a objednávky   rámcová zmluva a objednávka každému živnostníkovi
//   6 Ubytovanie a doprava  kde ľudia bývajú a kto ich vezie
//   7 Hodiny a faktúra      hodiny schválené, faktúra vystavená a zaplatená
//
// Čisté funkcie, bez `window`. Compliance a päťfázový reťazec sa **nepočítajú
// tu** — berú sa hotové (`staffing/compliance.js`, `staffing/site.js`), aby
// bola jedna pravda o tom, čo je podmienka a čo sú nezúčtované hodiny.
//
// Testy: node app/lib/staffing/job.test.js
// ============================================================================
(function () {
  const STEPS = [
    { key: 'dopyt', n: 1, title: 'Dopyt a dohoda', ico: 'offers',
      lead: 'Kto potrebuje ľudí, aké dielo, za akú sadzbu a od kedy.' },
    { key: 'ludia', n: 2, title: 'Ľudia', ico: 'workers',
      lead: 'Koľko ľudí treba a kto pôjde.' },
    { key: 'nemec', n: 3, title: 'Zmluva s Nemcom', ico: 'note',
      lead: 'Zmluva o dielo s odberateľom a jeho objednávka.' },
    { key: 'papiere', n: 4, title: 'Papiere ľudí', ico: 'shield',
      lead: 'Súhlas GDPR, doklady (A1, živnosť, totožnosť) a hlásenie Zoll.' },
    { key: 'zivnostnici', n: 5, title: 'Zmluvy a objednávky živnostníkom', ico: 'doc',
      lead: 'Rámcová zmluva o dielo a objednávka pre každého, kto ide.' },
    { key: 'ubytovanie', n: 6, title: 'Ubytovanie a doprava', ico: 'bed',
      lead: 'Kde budú ľudia bývať a ako sa dostanú na stavbu.' },
    { key: 'peniaze', n: 7, title: 'Hodiny a faktúra', ico: 'wallet',
      lead: 'Hodiny schváliť, vystaviť faktúru a dostať zaplatené.' },
  ];

  const ZAVRETA = ['completed', 'lost', 'cancelled'];
  const PODPISANA = ['signed', 'active', 'completed'];

  const arr = (x) => (Array.isArray(x) ? x : []);
  const num = (x) => Number(x) || 0;
  const day = (s) => (s ? String(s).slice(0, 10) : null);

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }
  const ludi = (n) => `${n} ${plural(n, 'človek', 'ľudia', 'ľudí')}`;
  /** Štvrtý pád: „pre 1 človeka", „pre 3 ľudí". */
  const ludiAkuz = (n) => `${n} ${plural(n, 'človeka', 'ľudí', 'ľudí')}`;

  function denSk(s) {
    const d = day(s);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return `${dd}. ${m}. ${y}`;
  }

  /**
   * Vety z päťfázového reťazca (`site.js`) tykajú — „Doplň", „Schváľ".
   * V siedmich krokoch sa vyká, tak sa tu prepíšu tie slovesá, ktoré tam sú.
   */
  const VYKANIE = [['Doplň', 'Doplňte'], ['Schváľ', 'Schváľte'], ['Zapíš', 'Zapíšte'],
    ['zapíš', 'zapíšte'], ['Uzavri', 'Uzavrite'], ['Zavolaj', 'Zavolajte'], ['Nasaď', 'Nasaďte'],
    ['Dobehni', 'Dobehnite']];
  function vykat(t) {
    if (!t) return t;
    let out = String(t);
    for (const [ty, vy] of VYKANIE) out = out.replace(new RegExp(`(^|[\\s(])${ty}(?=[\\s,.]|$)`, 'gu'), `$1${vy}`);
    return out;
  }

  /** Mená do vety: „Novák, Kováč a ďalší 2". */
  function mena(list, max = 2) {
    const m = list.filter(Boolean);
    if (m.length <= max) return m.join(', ');
    return `${m.slice(0, max).join(', ')} a ${plural(m.length - max, 'ďalší', 'ďalší', 'ďalších')} ${m.length - max}`;
  }

  /**
   * Stav jedného človeka na zákazke: čo mu chýba zo štvrtého a piateho kroku.
   *
   * `missing` sú kľúče pravidiel, ktoré mu **po výnimkách** stále blokujú
   * nástup (z `Shell.evaluate`). Zmluva o dielo sa z nich vyberá — patrí
   * do piateho kroku, nie medzi doklady, inak by ju appka hlásila dvakrát.
   */
  function person(o) {
    const a = o.assignment || {};
    const w = o.worker || {};
    const today = day(o.today) || day(new Date().toISOString());
    const docs = arr(o.docs).filter(d => d && d.worker_id === a.worker_id
      && !['requested', 'missing'].includes(d.status));
    const gdpr = docs.some(d => d.kind === 'gdpr');
    const zmluvy = docs.filter(d => d.kind === 'contract');
    const zmluva = zmluvy.some(d => !day(d.valid_to) || day(d.valid_to) >= today);
    const objednavka = arr(o.orders).some(x => x && x.kind === 'worker'
      && x.status !== 'cancelled' && x.assignment_id === a.id);
    const doklady = arr(o.missing).filter(r => r !== 'missing_contract');
    return {
      assignmentId: a.id, workerId: a.worker_id, name: w.full_name || '—',
      gdpr, zmluva, objednavka, doklady,
      papiereOk: gdpr && doklady.length === 0,
      zmluvyOk: zmluva && objednavka,
    };
  }

  /**
   * Sedem krokov jednej zákazky.
   *
   * @param {Object} o
   *   subcontract   zákazka
   *   partner       odberateľ
   *   opportunity   dopyt, z ktorého zákazka vznikla (kvôli počtu ľudí)
   *   contract      zmluva o dielo s odberateľom (`subcontract.contract_id`)
   *   orders        objednávky (work_orders) tejto zákazky — od odberateľa aj živnostníkom
   *   assignments   nasadenia (zrušené sa vynechajú)
   *   workers, docs kartotéka a doklady
   *   missing       { workerId: [kľúč pravidla, …] } — čo blokuje po výnimkách
   *   check         výsledok `compliance.checkSubcontract`
   *   site          výsledok `site.state` (hodiny a peniaze sa berú odtiaľ)
   *   housed        koľko nasadených má zapísané, kde býva
   *   today
   */
  function steps(o = {}) {
    const sc = o.subcontract || {};
    const check = o.check || { ok: true, blockers: [], warnings: [] };
    const site = arr(o.site);
    const s = (k) => site.find(x => x.key === k) || {};
    const asg = arr(o.assignments).filter(a => a && a.status !== 'cancelled');
    const workers = arr(o.workers);
    const orders = arr(o.orders).filter(x => x && x.status !== 'cancelled');
    const people = asg.map(a => person({
      assignment: a, worker: workers.find(w => w.id === a.worker_id),
      docs: o.docs, orders, missing: (o.missing || {})[a.worker_id], today: o.today,
    }));
    const n = asg.length;
    const zive = asg.some(a => ['active', 'planned'].includes(a.status));
    const r = {};

    // ── 1. Dopyt a dohoda ───────────────────────────────────────────────────
    const deal = s('deal');
    r.dopyt = {
      done: !!deal.done,
      detail: deal.detail || '',
      todo: deal.done ? null : (vykat(deal.todo) || 'Doplňte odberateľa, dielo, sadzbu a termín.'),
    };

    // ── 2. Ľudia ────────────────────────────────────────────────────────────
    const treba = num(o.opportunity && o.opportunity.headcount) || num(sc.headcount);
    const chyba = treba ? Math.max(0, treba - n) : 0;
    r.ludia = {
      done: n > 0 && chyba === 0,
      count: n, need: treba || null,
      detail: !n ? (treba ? `Treba ${ludiAkuz(treba)}, zatiaľ nikto.` : 'Zatiaľ nikto nie je nasadený.')
        : treba ? `${n} z ${treba} ${plural(treba, 'človeka', 'ľudí', 'ľudí')}` : ludi(n),
      todo: !n ? 'Nasaďte ľudí z kartotéky alebo ich nájdite v nábore.'
        : chyba ? `${plural(chyba, 'Chýba', 'Chýbajú', 'Chýba')} ešte ${ludi(chyba)}.` : null,
    };

    // ── 3. Zmluva s Nemcom ──────────────────────────────────────────────────
    const c = o.contract || null;
    const podpisana = !!c && (!!c.signed_at || PODPISANA.includes(c.status));
    const odNemca = orders.filter(x => x.kind === 'customer');
    r.nemec = {
      done: podpisana,
      detail: !c ? 'Zmluva o dielo zatiaľ nie je.'
        : podpisana ? `Zmluva podpísaná${c.signed_at ? ` ${denSk(c.signed_at)}` : ''}`
          + (odNemca.length ? `, objednávka ${odNemca[0].their_ref || odNemca[0].order_number || 'je'}` : '')
          : 'Zmluva je pripravená, čaká na podpis.',
      todo: !c ? 'Pripravte zmluvu o dielo s odberateľom.'
        : podpisana ? null : 'Pošlite zmluvu na podpis a zapíšte, keď príde podpísaná.',
    };

    // ── 4. Papiere ľudí ─────────────────────────────────────────────────────
    const bezGdpr = people.filter(p => !p.gdpr);
    const bezDokl = people.filter(p => p.doklady.length);
    // Podmienky, ktoré nie sú o jednom človeku: hlásenie Zoll, USt-IdNr…
    const firemne = arr(check.blockers).filter(b => !b.worker_id && b.scope !== 'worker');
    const casti = [];
    if (bezGdpr.length) casti.push(`bez GDPR: ${mena(bezGdpr.map(p => p.name))}`);
    if (bezDokl.length) casti.push(`chýba doklad: ${mena(bezDokl.map(p => p.name))}`);
    if (firemne.length) casti.push(firemne.slice(0, 2).map(b => b.label).join(', '));
    r.papiere = {
      done: n > 0 && !bezGdpr.length && !bezDokl.length && !!check.ok,
      detail: !n ? 'Najprv treba nasadiť ľudí.'
        : casti.length ? casti.join(' · ')
          : 'GDPR aj doklady sú v poriadku, podmienky vyslania splnené.',
      todo: !n ? null
        : bezDokl.length ? `${ludi(bezDokl.length)} bez platného dokladu — doplňte ho alebo zapíšte výnimku.`
          : bezGdpr.length ? `Nechajte podpísať súhlas GDPR (${mena(bezGdpr.map(p => p.name))}).`
            : !check.ok ? ((check.blockers[0] && (check.blockers[0].fix || check.blockers[0].label)) || 'Doplňte podmienky vyslania.')
              : null,
      // Ľudia už sú na stavbe a papiere nie sú — za to pokutujú nás.
      hot: zive && (bezDokl.length > 0 || !check.ok),
    };

    // ── 5. Zmluvy a objednávky živnostníkom ────────────────────────────────
    const bezZml = people.filter(p => !p.zmluva);
    const bezObj = people.filter(p => !p.objednavka);
    const z = [];
    if (bezZml.length) z.push(`bez zmluvy: ${mena(bezZml.map(p => p.name))}`);
    if (bezObj.length) z.push(`bez objednávky: ${mena(bezObj.map(p => p.name))}`);
    r.zivnostnici = {
      done: n > 0 && !bezZml.length && !bezObj.length,
      detail: !n ? 'Najprv treba nasadiť ľudí.'
        : z.length ? z.join(' · ') : 'Každý má rámcovú zmluvu aj objednávku.',
      todo: !n ? null
        : bezZml.length ? `Vytlačte rámcovú zmluvu a zapíšte podpísanú (${mena(bezZml.map(p => p.name))}).`
          : bezObj.length ? `Vystavte objednávku (${mena(bezObj.map(p => p.name))}).` : null,
    };

    // ── 6. Ubytovanie a doprava ─────────────────────────────────────────────
    const housed = Math.min(num(o.housed), n);
    const doprava = !!(sc.transport_note || sc.transport_provided);
    const u = [];
    if (n) u.push(`ubytovaní ${housed} z ${n}`);
    u.push(doprava ? 'doprava vyriešená' : 'doprava nezapísaná');
    r.ubytovanie = {
      done: n > 0 && housed >= n && doprava,
      detail: !n ? 'Najprv treba nasadiť ľudí.' : u.join(' · '),
      todo: !n ? null
        : housed < n ? `Nájdite ubytovanie pre ${ludiAkuz(n - housed)}.`
          : !doprava ? 'Zapíšte, kto ľudí vezie na stavbu.' : null,
    };

    // ── 7. Hodiny a faktúra ─────────────────────────────────────────────────
    const h = s('hours'), m = s('money');
    r.peniaze = {
      done: !!h.done && !!m.done,
      detail: [h.detail, m.detail].filter(Boolean).join(' · '),
      todo: vykat(m.hot ? m.todo : (h.todo || m.todo || null)),
      hot: !!m.hot,
    };

    return STEPS.map((st) => {
      const x = r[st.key];
      return { ...st, ...x, state: x.done ? 'ok' : x.hot ? 'bad' : 'todo' };
    });
  }

  /**
   * Krok, ktorý je na rade — ten sa na zákazke otvorí sám.
   * Najprv to, čo horí (ľudia bez papierov, faktúra po splatnosti), potom
   * prvý nehotový krok zhora.
   */
  function next(list, subcontract) {
    const sc = subcontract || {};
    const s = arr(list);
    if (ZAVRETA.includes(sc.status)) return { key: null, closed: true, text: 'Zákazka je uzavretá.' };
    const hori = s.find(x => x.state === 'bad' && x.todo);
    if (hori) return { ...hori, text: hori.todo };
    const prvy = s.find(x => !x.done && x.todo);
    if (prvy) return { ...prvy, text: prvy.todo };
    const vsetko = s.length > 0 && s.every(x => x.done);
    return vsetko ? { key: null, done: true, text: 'Všetko je hotové a zaplatené.' }
      : { key: null, text: 'Teraz netreba nič — zákazka beží.' };
  }

  function progress(list) {
    const s = arr(list);
    return { done: s.filter(x => x.done).length, total: s.length };
  }

  /**
   * Uložené ubytovania zoradené podľa vzdialenosti od stavby.
   * Bez polohy idú na koniec — nedá sa povedať, ako ďaleko sú.
   */
  function nearbySaved(accommodations, site, { maxKm = 60, distance } = {}) {
    const ok = site && Number.isFinite(Number(site.lat)) && Number.isFinite(Number(site.lng))
      && (Number(site.lat) || Number(site.lng));
    const d = distance || haversine;
    return arr(accommodations).map((a) => {
      const ma = Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng)) && (Number(a.lat) || Number(a.lng));
      const km = ok && ma ? d({ lat: Number(site.lat), lng: Number(site.lng) }, { lat: Number(a.lat), lng: Number(a.lng) }) : null;
      return { ...a, km };
    }).filter(a => a.km == null || a.km <= maxKm)
      .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));
  }

  function haversine(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
  }

  const API = { STEPS, steps, next, progress, person, nearbySaved, plural, vykat };
  if (typeof window !== 'undefined') window.DanubraJob = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
