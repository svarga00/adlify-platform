// ============================================================================
// DANUBRA — reťazec zákazky: päť krokov od dohody po peniaze
// ============================================================================
// Profil zákazky má deväť sekcií: compliance, mapa, ľudia, obdobia, checklisty,
// ubytovanie, ekonomika. Všetko tam potrebné je — ale nikde nie je napísané,
// **čo treba spraviť teraz**. Kto zákazky nerobil, musí si to z deviatich
// sekcií zložiť sám.
//
// Reťazec je pritom vždy ten istý:
//
//   dohodnuté → smie sa začať → ľudia na stavbe → hodiny → peniaze
//
// Táto knižnica z dát spočíta, v ktorom kroku to stojí, a vráti **jednu vec**,
// ktorá sa má spraviť teraz. Je to tá istá myšlienka ako pri nábore
// (`recruiting/process.js`) — a zámerne tie isté slová: krok povie, čo to je
// (`lead`), prečo existuje (`why`) a čo konkrétne chýba (`todo`).
//
// Čisté funkcie, bez `window`. Compliance sa **nepočíta tu** — berie sa hotový
// výsledok z `staffing/compliance.js`, aby existovala jedna pravda o tom, čo
// je blokátor.
//
// Testy: node app/lib/staffing/site.test.js
// ============================================================================
(function () {
  const STEPS = [
    {
      key: 'deal', n: 1, title: 'Dohodnuté',
      lead: 'Odberateľ, sadzba, termín a čo presne je dielo.',
      why: 'Zákazka bez napísaného diela je pri kontrole prenájom pracovnej sily, '
        + 'nie Werkvertrag. A sadzba, ktorá nie je nikde, sa dohaduje až pri faktúre.',
    },
    {
      key: 'green', n: 2, title: 'Smie sa začať',
      lead: 'Papiere, bez ktorých sa na nemeckú stavbu nesmie.',
      why: 'A1, hlásenie Zoll, USt-IdNr odberateľa. Keď toto chýba, nepokutujú '
        + 'živnostníka — pokutujú nás ako firmu, ktorá ho tam poslala.',
    },
    {
      key: 'people', n: 3, title: 'Ľudia na stavbe',
      lead: 'Kto tam je, s platnými dokladmi a so zapísaným ubytovaním.',
      why: 'Zákazka bez ľudí nezarába a stavba nepočká. A človek, ktorému chýba '
        + 'doklad, je riziko celej zákazky, nie jeho vlastný problém.',
    },
    {
      key: 'hours', n: 4, title: 'Hodiny',
      lead: 'Zapísané a schválené — z nich je faktúra.',
      why: 'Hodiny, ktoré nikto nezapísal, sa nevyfakturujú. Neschválené hodiny '
        + 'sú peniaze, ktoré ležia na stole: do podkladu sa nedostanú.',
    },
    {
      key: 'money', n: 5, title: 'Peniaze',
      lead: 'Obdobie uzavrieť, vystaviť faktúru, dostať zaplatené.',
      why: 'Toto je jediný krok, po ktorom na účte naozaj niečo pribudne. '
        + 'Uzavreté obdobie bez faktúry je hotová práca, za ktorú nikto nezaplatil.',
    },
  ];

  const ZIVE_NASADENIE = ['active', 'planned'];
  const ZAVRETA = ['completed', 'lost', 'cancelled'];

  function num(x) { return Number(x) || 0; }
  function den(x) { return x ? String(x).slice(0, 10) : null; }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  /**
   * Stav všetkých piatich krokov zákazky.
   *
   * @param {Object} o
   *   subcontract  zákazka
   *   partner      odberateľ (kvôli USt-IdNr vo vete, nie na blokovanie)
   *   check        výsledok `compliance.checkSubcontract` — hotový, nepočíta sa tu
   *   assignments  nasadenia na túto zákazku
   *   missingDocs  { workerId: početChýbajúcich } — z `checks.build`
   *   housed       koľko nasadených ľudí má zapísané, kde býva
   *   timesheets   výkazy zákazky
   *   periods      obdobia zákazky
   *   invoices     vydané faktúry zákazky
   * @returns {Array} [{ ...krok, done, state, detail, todo, action }]
   */
  function state(o = {}) {
    const sc = o.subcontract || {};
    const check = o.check || { ok: true, blockers: [], warnings: [] };
    const asg = (o.assignments || []).filter(a => a && a.status !== 'cancelled');
    const zive = asg.filter(a => ZIVE_NASADENIE.includes(a.status));
    const ts = o.timesheets || [];
    const periods = o.periods || [];
    const invoices = (o.invoices || []).filter(i => i && i.status !== 'cancelled');
    const missing = o.missingDocs || {};

    // ── 1. Dohodnuté ────────────────────────────────────────────────────────
    const chyba = [];
    if (!sc.partner_id) chyba.push('odberateľ');
    if (!sc.scope) chyba.push('čo je dielo');
    if (sc.billing_model !== 'fixed' && !num(sc.charge_rate)) chyba.push('sadzba');
    if (!sc.date_from) chyba.push('termín');
    const deal = {
      done: chyba.length === 0,
      detail: chyba.length
        ? `Chýba: ${chyba.join(', ')}.`
        : `${o.partner && o.partner.name ? o.partner.name : 'Odberateľ'}`
          + (num(sc.charge_rate) ? `, ${sc.charge_rate} €/h` : '')
          + (sc.date_from ? `, od ${den(sc.date_from)}` : ''),
      todo: chyba.length ? `Doplň ${chyba.join(', ')} — bez toho sa nedá fakturovať.` : null,
    };

    // ── 2. Smie sa začať ────────────────────────────────────────────────────
    const green = {
      done: !!check.ok,
      detail: check.ok
        ? (check.warnings || []).length
          ? `Podmienky splnené, ${(check.warnings || []).length} ${plural((check.warnings || []).length, 'upozornenie', 'upozornenia', 'upozornení')}.`
          : 'Podmienky vyslania sú splnené.'
        : `${check.blockers.length} ${plural(check.blockers.length, 'blokátor', 'blokátory', 'blokátorov')}: `
          + check.blockers.slice(0, 2).map(b => b.label).join(' · '),
      todo: check.ok ? null
        : (check.blockers[0] && (check.blockers[0].fix || check.blockers[0].label)) || null,
      hot: !check.ok && zive.length > 0,   // ľudia už tam sú a papiere nie sú
    };

    // ── 3. Ľudia na stavbe ──────────────────────────────────────────────────
    const bezDokladov = asg.filter(a => num(missing[a.worker_id]) > 0).length;
    const housed = o.housed == null ? null : num(o.housed);
    const bezBytu = housed == null ? 0 : Math.max(0, asg.length - housed);
    const people = {
      done: asg.length > 0 && bezDokladov === 0,
      detail: !asg.length ? 'Zatiaľ nikto nenasadený.'
        : `${asg.length} ${plural(asg.length, 'človek', 'ľudia', 'ľudí')}`
          + (bezDokladov ? `, ${bezDokladov} bez dokladu` : '')
          + (bezBytu ? `, ${bezBytu} bez zapísaného ubytovania` : ''),
      todo: !asg.length ? 'Nasaď na zákazku ľudí — inak nezarába.'
        : bezDokladov ? `${bezDokladov} ${plural(bezDokladov, 'človeku chýba doklad', 'ľuďom chýbajú doklady', 'ľuďom chýbajú doklady')}. Dobehni ich, alebo zapíš výnimku.`
          : bezBytu ? `${bezBytu} ${plural(bezBytu, 'človek nemá', 'ľudia nemajú', 'ľudí nemá')} zapísané, kde býva.` : null,
      hot: asg.length > 0 && bezDokladov > 0,
    };

    // ── 4. Hodiny ───────────────────────────────────────────────────────────
    // Zaujímajú len hodiny, ktoré ešte nie sú v uzavretom období — tie staré
    // sú vyriešené a do „čo teraz" nepatria.
    const nezuctovane = ts.filter(t => t && !t.period_id);
    const neschvalene = nezuctovane.filter(t => !t.approved);
    const hodinSpolu = nezuctovane.reduce((s, t) => s + num(t.hours), 0);
    const hodinNeschv = neschvalene.reduce((s, t) => s + num(t.hours), 0);
    const hours = {
      // Hotové znamená „hodiny sú zapísané a nič z nich nevisí na schválení" —
      // nie „sú nezúčtované". Zákazka, ktorej sú všetky hodiny už vo faktúre,
      // má tento krok hotový, inak by sa po vyfakturovaní vrátila o krok späť.
      done: ts.length > 0 && neschvalene.length === 0,
      detail: !nezuctovane.length
        ? (ts.length ? 'Všetky hodiny sú zúčtované.' : 'Zatiaľ žiadne hodiny.')
        : `${hodinSpolu} ${plural(hodinSpolu, 'hodina', 'hodiny', 'hodín')} nezúčtovaných`
          + (neschvalene.length ? `, z toho ${hodinNeschv} neschválených` : ''),
      todo: neschvalene.length
        ? `Schváľ ${neschvalene.length} ${plural(neschvalene.length, 'výkaz', 'výkazy', 'výkazov')} — neschválené hodiny do podkladu nejdú.`
        : (!nezuctovane.length && zive.length && !ZAVRETA.includes(sc.status)
          ? 'Zapíš odpracované hodiny — z nich je faktúra.' : null),
      hot: neschvalene.length > 0,
    };

    // ── 5. Peniaze ──────────────────────────────────────────────────────────
    const otvorene = periods.filter(p => p && p.status === 'open');
    const uzavrete = periods.filter(p => p && p.status === 'closed');
    const fakturovane = new Set(invoices.map(i => i.period_id).filter(Boolean));
    const bezFaktury = uzavrete.filter(p => !fakturovane.has(p.id));
    const nezaplatene = invoices.filter(i => i.status !== 'paid');
    const poSplatnosti = invoices.filter(i => i.status === 'overdue');
    const naSchvalenie = invoices.filter(i => i.status === 'pending_approval');

    let moneyTodo = null, moneyHot = false;
    if (bezFaktury.length) {
      moneyTodo = `${bezFaktury.length} ${plural(bezFaktury.length, 'uzavreté obdobie nie je', 'uzavreté obdobia nie sú', 'uzavretých období nie je')} vyfakturované.`;
    } else if (naSchvalenie.length) {
      moneyTodo = `${naSchvalenie.length} ${plural(naSchvalenie.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na schválenie. Bez schválenia sa neodošle.`;
    } else if (poSplatnosti.length) {
      moneyTodo = `${poSplatnosti.length} ${plural(poSplatnosti.length, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti. Zavolaj odberateľovi.`;
      moneyHot = true;
    } else if (!periods.length && hodinSpolu > 0) {
      moneyTodo = 'Uzavri obdobie — z podkladu vznikne faktúra.';
    } else if (otvorene.length && hodinSpolu > 0) {
      moneyTodo = 'Obdobie je otvorené a hodiny v ňom sú. Uzavri ho a fakturuj.';
    }

    const money = {
      done: invoices.length > 0 && nezaplatene.length === 0 && !bezFaktury.length,
      detail: !invoices.length
        ? (uzavrete.length ? 'Uzavreté obdobie bez faktúry.' : 'Zatiaľ sa nefakturovalo.')
        : `${invoices.length} ${plural(invoices.length, 'faktúra', 'faktúry', 'faktúr')}`
          + (nezaplatene.length ? `, ${nezaplatene.length} nezaplatených` : ', všetky zaplatené'),
      todo: moneyTodo,
      hot: moneyHot,
    };

    const by = { deal, green, people, hours, money };
    return STEPS.map(s => {
      const r = by[s.key];
      return {
        ...s, ...r,
        state: r.done ? 'ok' : r.hot ? 'bad' : 'todo',
      };
    });
  }

  /**
   * Jedna vec, ktorá sa má spraviť teraz.
   *
   * Nie je to prvý nehotový krok — je to ten, ktorý **najviac horí**. Ľudia na
   * stavbe bez papierov sú drahší problém než nedoplnený termín, a faktúra po
   * splatnosti je drahšia než nezapísané hodiny.
   *
   * Zákazka, ktorá je ukončená alebo prehratá, nemá čo riešiť — zoznam krokov
   * na nej zostáva ako záznam, ale appka od nikoho nič nechce.
   */
  const NALIEHAVOST = ['green', 'people', 'money', 'hours', 'deal'];

  function next(steps, subcontract) {
    const sc = subcontract || {};
    if (ZAVRETA.includes(sc.status)) {
      return { key: 'closed', title: 'Zákazka je uzavretá', what: 'Nič netreba.' };
    }
    const s = steps || [];
    for (const key of NALIEHAVOST) {
      const x = s.find(y => y.key === key && y.state === 'bad' && y.todo);
      if (x) return { ...x, what: x.todo };
    }
    const prvy = s.find(x => !x.done && x.todo);
    if (prvy) return { ...prvy, what: prvy.todo };
    // `[].every(…)` je `true` — bez tejto podmienky by prázdny vstup tvrdil,
    // že je všetko hotové.
    const vsetko = s.length > 0 && s.every(x => x.done);
    return vsetko
      ? { key: 'done', title: 'Beží a je zaplatené', what: 'Nič nečaká.' }
      : { key: 'wait', title: 'Beží', what: 'Nič, čo by sa dalo spraviť teraz.' };
  }

  /** Koľko z piatich krokov je hotových — na pruh postupu. */
  function progress(steps) {
    const s = steps || [];
    const done = s.filter(x => x.done).length;
    return { done, total: s.length, pct: s.length ? Math.round((done / s.length) * 100) : 0 };
  }

  /**
   * Jedna veta o zákazke do zoznamu. V karte nie je miesto na päť krokov, ale
   * „v ktorom kroku to stojí" sa tam zmestí.
   */
  function line(steps, subcontract) {
    const n = next(steps, subcontract);
    if (n.key === 'closed' || n.key === 'done' || n.key === 'wait') return n.title;
    return `${n.n}/5 · ${n.title}`;
  }

  const API = { STEPS, NALIEHAVOST, state, next, progress, line, plural };
  if (typeof window !== 'undefined') window.DanubraSite = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
