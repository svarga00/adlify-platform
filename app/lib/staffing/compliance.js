// ============================================================================
// DANUBRA — Compliance pre vysielanie do Nemecka (Fáza 2)
// ============================================================================
// Kontroluje, či sa smie vyslať a fakturovať. Podľa biznis plánu je toto
// najrizikovejšia oblasť — skrytá Arbeitnehmerüberlassung, chýbajúca §48b
// alebo neohlásený Zoll dokážu položiť inak zdravú zákazku.
//
// Čistá logika, žiadny DB prístup. Vstupy sa injektujú.
// ============================================================================
(function () {
  const num = (v, d = 0) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

  const SEVERITY = { blocker: 3, warning: 2, info: 1 };

  // ── Požiadavky podľa typu prác ────────────────────────────────────────────
  // Dielenské/kovoobrábacie práce majú výrazne nižšiu reguláciu než stavba —
  // preto ich plán odporúča ako vstupný segment.
  const REQUIRED = {
    construction: [
      { kind: 'a1', scope: 'worker', label: 'A1 pre každého vyslaného', severity: 'blocker' },
      { kind: 'zoll_meldung', scope: 'subcontract', label: 'Hlásenie Zoll pred začiatkom prác', severity: 'blocker' },
      { kind: 'freistellung_48b', scope: 'company', label: 'Freistellungsbescheinigung §48b', severity: 'warning' },
      { kind: 'soka_registration', scope: 'company', label: 'Registrácia SOKA-BAU', severity: 'blocker' },
      { kind: 'ust_idnr', scope: 'company', label: 'USt-IdNr pre reverse charge §13b', severity: 'blocker' },
      { kind: 'insurance', scope: 'company', label: 'Betriebshaftpflicht', severity: 'warning' },
    ],
    workshop: [
      { kind: 'a1', scope: 'worker', label: 'A1 pre každého vyslaného', severity: 'blocker' },
      { kind: 'ust_idnr', scope: 'company', label: 'USt-IdNr pre reverse charge §13b', severity: 'blocker' },
      { kind: 'insurance', scope: 'company', label: 'Betriebshaftpflicht', severity: 'warning' },
    ],
  };

  /** Stav platnosti dokladu voči dátumu. */
  function docState(doc, today, horizonDays = 30) {
    if (!doc) return 'missing';
    const to = day(doc.valid_to);
    const from = day(doc.valid_from);
    if (from && from > today) return 'not_yet';
    if (!to) return 'valid';                       // bez konca platnosti
    if (to < today) return 'expired';
    if (daysBetween(today, to) <= horizonDays) return 'expiring';
    return 'valid';
  }

  /**
   * Máme platnú Freistellungsbescheinigung §48b? Firemná položka v registri.
   * Kým je „pending" (žiadosť podaná, nevydaná) alebo je po platnosti, nemáme.
   * S platnou sa **zrážková stavebná daň (15 %) neuplatňuje** — odberateľ
   * zaplatí celú sumu.
   * @returns {{ ok:boolean, state:string, doc:Object|null }}
   */
  function freistellung(companyItems = [], today) {
    const t = day(today) || new Date().toISOString().slice(0, 10);
    const docs = (companyItems || []).filter(c => c && c.kind === 'freistellung_48b'
      && (!c.scope || c.scope === 'company'));
    const doc = docs.sort((a, b) => String(b.valid_to || '9999').localeCompare(String(a.valid_to || '9999')))[0] || null;
    if (!doc) return { ok: false, state: 'missing', doc: null };
    if (['pending', 'expired', 'not_required'].includes(doc.status)) {
      return { ok: false, state: doc.status, doc };
    }
    const st = docState(doc, t);
    return { ok: st === 'valid' || st === 'expiring', state: st, doc };
  }

  // ── Čo spraviť teraz v compliance ─────────────────────────────────────────

  /**
   * Jedna vec, ktorú treba vybaviť. Compliance bola zoznam pravidiel so
   * štyrmi číslami — a z toho sa nedalo povedať, čo zastaví stavbu najskôr.
   *
   * Poradie je podľa toho, čo sa stane, keď sa tomu nikto nevenuje:
   *
   *   1. **A1 človeku, ktorý už je na stavbe** — pri kontrole to padne na nás
   *      ako na firmu, nie na neho. A vystavenie trvá až 45 dní, takže to
   *      nemá ako dobehnúť.
   *   2. **neplatné firemné povolenie** — bez USt-IdNr sa nedá fakturovať
   *      v reverse charge, bez §48b odberateľ zrazí 15 %, bez SOKA a bez
   *      §9 HwO sa nesmie pracovať.
   *   3. **A1, ktoré sa končí** — 45 dní je presne tá doba, ktorú vybavenie
   *      trvá, takže „končí za mesiac" znamená „podaj to dnes".
   *   4. **firemné povolenie, ktoré sa končí.**
   *
   * Lehoty sú v dňoch a sú to tie, ktoré platia v skutočnosti, nie okrúhle
   * čísla: A1 45 dní, Freistellung §48b 4–8 týždňov.
   */
  const A1_LEHOTA = 45;
  const BLOKUJUCE = ['ust_idnr', 'soka_registration', 'handwerksrolle', 'freistellung_48b'];

  function nowNext(o = {}) {
    const today = day(o.today) || new Date().toISOString().slice(0, 10);
    const items = (o.items || []).filter(i => i && i.scope === 'company');
    const workers = (o.workers || []).filter(w => w && ['ready', 'deployed'].includes(w.status));
    const docs = o.workerDocs || [];

    // Najnovšie A1 na človeka. Starší doklad neprekryje novší.
    const a1 = new Map();
    for (const d of docs) {
      if (!d || d.kind !== 'a1') continue;
      const cur = a1.get(d.worker_id);
      if (!cur || String(d.valid_to || '') > String(cur.valid_to || '')) a1.set(d.worker_id, d);
    }
    const sA1 = workers.map(w => ({
      worker: w, doc: a1.get(w.id) || null,
      state: docState(a1.get(w.id), today, A1_LEHOTA),
    }));
    const naStavbe = (x) => x.worker.status === 'deployed';
    const a1Zle = sA1.filter(x => ['missing', 'expired'].includes(x.state));
    const a1Konci = sA1.filter(x => x.state === 'expiring');

    const sItems = items.map(i => ({ item: i, state: docState(i, today, A1_LEHOTA) }));
    const chybaUplne = BLOKUJUCE
      .filter(k => !items.some(i => i.kind === k))
      .map(k => ({ item: { kind: k }, state: 'missing' }));
    const zle = [...sItems.filter(x => x.state === 'expired'), ...chybaUplne];
    const konci = sItems.filter(x => x.state === 'expiring');

    const kto = (list) => list.map(x => x.worker.full_name).filter(Boolean).join(', ');

    if (a1Zle.length) {
      const naStavbach = a1Zle.filter(naStavbe);
      const prvy = (naStavbach[0] || a1Zle[0]);
      return {
        key: 'a1', title: naStavbach.length ? 'Človek na stavbe bez platného A1' : 'Doplniť A1',
        what: `${a1Zle.length} ${plural(a1Zle.length, 'človek', 'ľudia', 'ľudí')}: ${kto(a1Zle)}`,
        why: naStavbach.length
          ? 'Pri kontrole to padne na nás ako na firmu, nie na neho. A vystavenie trvá '
            + 'až 45 dní, takže to nemá ako dobehnúť — podať sa to musí dnes.'
          : 'Bez A1 sa nasadiť nedá. Vybavenie trvá až 45 dní, takže to nie je vec na '
            + 'poslednú chvíľu.',
        hot: naStavbach.length > 0, count: a1Zle.length, worker: prvy.worker,
      };
    }
    if (zle.length) {
      const prvy = zle[0];
      return {
        key: 'company', title: 'Vybaviť firemné povolenie',
        what: `${zle.length} ${plural(zle.length, 'položka', 'položky', 'položiek')} `
          + `je neplatná alebo chýba: ${zle.map(x => KIND_LABEL[x.item.kind] || x.item.kind).join(', ')}`,
        why: 'Bez USt-IdNr sa nedá fakturovať v reverse charge, bez Freistellung §48b '
          + 'odberateľ zrazí 15 % z faktúry, bez SOKA-BAU a bez oznámenia §9 HwO sa '
          + 'nesmie pracovať.',
        hot: true, count: zle.length, kind: prvy.item.kind,
      };
    }
    if (a1Konci.length) {
      return {
        key: 'a1soon', title: 'Podať A1 na ďalšie obdobie',
        what: `${a1Konci.length} ${plural(a1Konci.length, 'A1 sa končí', 'A1 sa končia', 'A1 sa končí')} `
          + `do ${A1_LEHOTA} dní: ${kto(a1Konci)}`,
        why: `Vybavenie trvá až ${A1_LEHOTA} dní — „končí za mesiac" teda znamená `
          + '„podaj to dnes".',
        hot: false, count: a1Konci.length, worker: a1Konci[0].worker,
      };
    }
    if (konci.length) {
      return {
        key: 'companysoon', title: 'Obnoviť firemné povolenie',
        what: `${konci.length} ${plural(konci.length, 'položke sa končí', 'položkám sa končí', 'položkám sa končí')} `
          + `platnosť: ${konci.map(x => KIND_LABEL[x.item.kind] || x.item.kind).join(', ')}`,
        why: 'Freistellungsbescheinigung §48b sa vybavuje 4–8 týždňov cez ELSTER. '
          + 'Keď sa to nechá na koniec, 15 % z faktúry si odberateľ zrazí.',
        hot: false, count: konci.length, kind: konci[0].item.kind,
      };
    }
    return {
      key: 'ok', title: 'Všetko platné',
      what: `${items.length} ${plural(items.length, 'firemná položka', 'firemné položky', 'firemných položiek')}`
        + `, ${workers.length} ${plural(workers.length, 'človek', 'ľudia', 'ľudí')} s platným A1`,
      why: 'Keď sa niečomu bude blížiť koniec platnosti, bude to tu napísané ako prvé.',
      hot: false, count: 0,
    };
  }

  function plural(n, one, few, many) {
    const x = Math.abs(n);
    if (x === 1) return one;
    if (x >= 2 && x <= 4) return few;
    return many;
  }

  // Názvy, ktoré sa píšu vo vete. Musia sedieť s `KINDS` v obrazovke
  // compliance — človek nemá vidieť raz „ust_idnr" a raz „USt-IdNr".
  const KIND_LABEL = {
    freistellung_48b: 'Freistellungsbescheinigung §48b',
    ust_idnr: 'USt-IdNr',
    soka_registration: 'Registrácia SOKA-BAU',
    handwerksrolle: 'Oznámenie §9 HwO',
    insurance: 'Betriebshaftpflicht',
  };

  /**
   * Skontroluje pripravenosť zákazky a jej nasadení.
   *
   * @param {Object} ctx {
   *   subcontract, assignments:[], workers:[], workerDocs:[], companyItems:[], today
   * }
   * @returns {{ ok:boolean, blockers:[], warnings:[], infos:[], items:[] }}
   */
  function checkSubcontract(ctx = {}) {
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const sc = ctx.subcontract || {};
    const isConstruction = sc.work_type === 'construction';
    const required = REQUIRED[isConstruction ? 'construction' : 'workshop'];
    const items = [];

    const add = (severity, label, detail, fix) =>
      items.push({ severity, label, detail: detail || '', fix: fix || '' });

    // ── Firemné položky ─────────────────────────────────────────────────────
    for (const req of required.filter(r => r.scope === 'company')) {
      const found = (ctx.companyItems || []).find(c => c.kind === req.kind);
      const st = docState(found, today);
      if (st === 'missing') {
        add(req.severity, `Chýba: ${req.label}`, '', 'Doplniť do registra compliance');
      } else if (st === 'expired') {
        add('blocker', `Neplatné: ${req.label}`, `platnosť skončila ${day(found.valid_to)}`, 'Požiadať o obnovenie');
      } else if (st === 'expiring') {
        add('warning', `Čoskoro vyprší: ${req.label}`,
          `platí do ${day(found.valid_to)} (${daysBetween(today, day(found.valid_to))} dní)`,
          'Požiadať o predĺženie s predstihom');
      }
    }

    // Zvláštny prípad §48b — bez nej sa zrazí 15 % z faktúry (nie je to zákaz,
    // ale priamy zásah do marže), preto vlastná hláška.
    if (isConstruction) {
      if (!freistellung(ctx.companyItems, today).ok && !sc.freistellung_verified) {
        add('warning', 'Bez §48b zrazí odberateľ 15 % z faktúry',
          'Bauabzugsteuer podľa §48b EStG', 'Žiadať cez ELSTER — vybavenie 4–8 týždňov');
      }
    }

    // ── Hlásenie Zoll pre túto zákazku ──────────────────────────────────────
    if (isConstruction && !sc.zoll_reported_at) {
      add('blocker', 'Zákazka nie je ohlásená na Zoll',
        'Hlásenie sa podáva pred začiatkom prác pre každé pracovisko',
        'meldeportal-mindestlohn.de → uložiť Meldungs-ID');
    }

    // ── Nasadení pracovníci ─────────────────────────────────────────────────
    const workerById = new Map((ctx.workers || []).map(w => [w.id, w]));
    const docsByWorker = new Map();
    for (const d of (ctx.workerDocs || [])) {
      if (!docsByWorker.has(d.worker_id)) docsByWorker.set(d.worker_id, []);
      docsByWorker.get(d.worker_id).push(d);
    }

    for (const asg of (ctx.assignments || [])) {
      if (asg.status === 'cancelled') continue;
      const w = workerById.get(asg.worker_id);
      const name = w?.full_name || 'Pracovník';
      const docs = docsByWorker.get(asg.worker_id) || [];
      // Položky o tomto človeku sa označia jeho id — zákazka v siedmich
      // krokoch ich ukazuje pri ňom, nie medzi firemnými podmienkami.
      const od = items.length;
      const oznac = () => { for (let i = od; i < items.length; i++) items[i].worker_id = asg.worker_id; };

      // A1 — bez neho sa nesmie vyslať
      const a1 = docs.filter(d => d.kind === 'a1')
        .sort((x, y) => String(y.valid_to || '').localeCompare(String(x.valid_to || '')))[0];
      const a1st = docState(a1, today);
      if (a1st === 'missing') {
        add('blocker', `${name}: chýba A1`, '',
          'Požiadať Sociálnu poisťovňu — vystavenie do 45 dní');
      } else if (a1st === 'expired') {
        add('blocker', `${name}: A1 neplatné`, `skončilo ${day(a1.valid_to)}`, 'Požiadať o nové A1');
      } else if (a1st === 'expiring') {
        add('warning', `${name}: A1 čoskoro vyprší`,
          `platí do ${day(a1.valid_to)} (${daysBetween(today, day(a1.valid_to))} dní)`,
          'Požiadať o nové A1 — vystavenie trvá až 45 dní');
      } else if (a1 && a1.valid_to && asg.date_to && day(a1.valid_to) < day(asg.date_to)) {
        add('warning', `${name}: A1 nepokrýva celé nasadenie`,
          `A1 do ${day(a1.valid_to)}, nasadenie do ${day(asg.date_to)}`, 'Predĺžiť A1');
      }

      // Regulované remeslo → oznámenie Handwerkskammer (§9 HwO)
      if (w?.regulated_trade) {
        const hwk = (ctx.companyItems || []).find(c => c.kind === 'handwerksrolle');
        if (docState(hwk, today) !== 'valid') {
          add('blocker', `${name}: regulované remeslo bez oznámenia Handwerkskammer`,
            'Pri zápisových remeslách treba pred prvým výkonom podať Dienstleistungsanzeige §9 HwO',
            'Podať oznámenie na príslušnej HWK — poplatok okolo 100 €');
        }
      }

      // Maximálna dĺžka vyslania 24 mesiacov
      if (asg.date_from && asg.date_to) {
        const months = daysBetween(day(asg.date_from), day(asg.date_to)) / 30.44;
        if (months > 24) {
          add('blocker', `${name}: vyslanie presahuje 24 mesiacov`,
            `${Math.round(months)} mesiacov`, 'Rozdeliť vyslanie alebo riešiť výnimku');
        }
      }

      // Minimálna mzda
      if (window.DanubraMargin || typeof require !== 'undefined') {
        const M = (typeof window !== 'undefined' && window.DanubraMargin) || null;
        if (M && asg.gross_monthly) {
          const chk = M.minWageCheck({
            grossMonthly: asg.gross_monthly, hours: num(ctx.monthlyHours, 160),
            workType: sc.work_type, skillLevel: w?.skill_level,
            legalForm: w?.legal_form,
          }, ctx.settings);
          if (!chk.ok) {
            add('blocker', `${name}: mzda pod ${chk.basis}`,
              `${chk.effective} €/h oproti požadovaným ${chk.required} €/h`,
              `Zvýšiť hrubú mzdu — inak hrozí doplatok a pokuta (Phantomlohn)`);
          }
        }
      }
      oznac();
    }

    // ── Vlastné vedenie prác (dôkaz proti skrytej ANÜ) ───────────────────────
    const hasLead = (ctx.assignments || []).some(a => a.role === 'predak' && a.status !== 'cancelled');
    if ((ctx.assignments || []).length > 0 && !hasLead) {
      add('warning', 'Na zákazke nie je určený predák',
        'Bez vlastného vedenia prác hrozí prekvalifikovanie na Arbeitnehmerüberlassung',
        'Určiť jedného z nasadených ako predáka');
    }

    // ── Definícia diela ─────────────────────────────────────────────────────
    if (!sc.scope || String(sc.scope).trim().length < 20) {
      add('warning', 'Dielo nie je dostatočne opísané',
        'Werkvertrag musí definovať výsledok (m², kus, dokončená konštrukcia), nie hodiny',
        'Doplniť konkrétny rozsah diela do zmluvy');
    }
    if (sc.billing_model === 'hourly') {
      add('info', 'Fakturácia po hodinách',
        'Hodinová odmena sama o sebe nie je zakázaná, ale v spore je slabším dôkazom Werkvertrag',
        'Doplniť merateľný výsledok diela do zmluvy');
    }

    const blockers = items.filter(i => i.severity === 'blocker');
    const warnings = items.filter(i => i.severity === 'warning');
    const infos = items.filter(i => i.severity === 'info');
    return { ok: blockers.length === 0, blockers, warnings, infos, items };
  }

  /**
   * Signály skrytej Arbeitnehmerüberlassung — checklist na pravidelné prehodnotenie.
   * Vstup je objekt odpovedí (true = signál je prítomný).
   */
  const ANU_SIGNALS = [
    ['gu_gives_orders', 'Pokyny dáva priamo generálny dodávateľ, nie náš predák'],
    ['gu_tools_only', 'Pracujeme výhradne s náradím a materiálom odberateľa'],
    ['gu_schedules', 'Dovolenky a choroby sa hlásia odberateľovi'],
    ['gu_badge', 'Naši ľudia nosia menovky odberateľa'],
    ['gu_email', 'Používajú e-mail odberateľa bez označenia externý'],
    ['gu_org_chart', 'Sú zaradení v organizačnej štruktúre odberateľa'],
    ['no_own_lead', 'Na mieste nie je náš vlastný koordinátor'],
    ['hours_only', 'Odmena je čisto za hodiny bez definovaného diela'],
    ['mixed_teams', 'Naši ľudia pracujú zmiešane v tímoch odberateľa'],
  ];

  function anuRisk(answers = {}) {
    const hits = ANU_SIGNALS.filter(([k]) => answers[k] === true);
    const score = hits.length;
    let level = 'nizke';
    if (score >= 5) level = 'kriticke';
    else if (score >= 3) level = 'vysoke';
    else if (score >= 1) level = 'zvysene';
    return {
      score, level, total: ANU_SIGNALS.length,
      hits: hits.map(([k, label]) => ({ key: k, label })),
      advice: score === 0
        ? 'Žiadny signál — nastavenie zodpovedá Werkvertrag.'
        : score >= 3
          ? 'Upraviť reálny výkon prác okamžite — hrozí prekvalifikovanie, doplatky odvodov a pokuty.'
          : 'Odstrániť uvedené signály, aby zmluva obstála pri kontrole.',
    };
  }

  /**
   * Cash-flow: sledovanie splatností a prahu pre škálovanie.
   * Podľa plánu je likvidita najpravdepodobnejší dôvod zlyhania.
   */
  function cashflowCheck({ invoices = [], monthlyPayroll = 0, factoring = false, today, alertDays = 45 } = {}) {
    const t = today || new Date().toISOString().slice(0, 10);
    const open = invoices.filter(i => ['issued', 'overdue'].includes(i.status));
    const outstanding = open.reduce((s, i) => s + num(i.total), 0);
    const overdue = open.filter(i => i.due_date && day(i.due_date) < t);
    const overdueSum = overdue.reduce((s, i) => s + num(i.total), 0);

    // priemerná doba inkasa z uhradených faktúr
    const paid = invoices.filter(i => i.status === 'paid' && i.paid_at && i.issue_date);
    const dso = paid.length
      ? paid.reduce((s, i) => s + daysBetween(day(i.issue_date), day(i.paid_at)), 0) / paid.length
      : null;

    const warnings = [];
    if (dso != null && dso > alertDays && !factoring) {
      warnings.push({
        severity: 'blocker',
        label: `Priemerná doba inkasa je ${Math.round(dso)} dní`,
        detail: `Nad prahom ${alertDays} dní bez faktoringu`,
        fix: 'Nezvyšovať počet ľudí vonku, kým nie je dohodnutý faktoring alebo týždenná fakturácia',
      });
    }
    if (overdueSum > 0) {
      warnings.push({
        severity: 'warning',
        label: `Po splatnosti ${Math.round(overdueSum)} €`,
        detail: `${overdue.length} faktúr`, fix: 'Urgovať odberateľov',
      });
    }
    // preklenutie: mzdy sa platia mesačne, faktúry chodia s odstupom
    const bridge = monthlyPayroll * ((dso != null ? dso : 30) / 30);
    if (monthlyPayroll > 0) {
      warnings.push({
        severity: 'info',
        label: `Potrebný pracovný kapitál ≈ ${Math.round(bridge)} €`,
        detail: `mesačné mzdy ${Math.round(monthlyPayroll)} € × doba inkasa`,
        fix: factoring ? 'Faktoring je zapnutý' : 'Zvážiť faktoring alebo zálohy',
      });
    }

    return {
      outstanding: Math.round(outstanding * 100) / 100,
      overdueSum: Math.round(overdueSum * 100) / 100,
      overdueCount: overdue.length,
      dso: dso != null ? Math.round(dso * 10) / 10 : null,
      workingCapitalNeeded: Math.round(bridge * 100) / 100,
      warnings,
      scaleSafe: !(dso != null && dso > alertDays && !factoring),
    };
  }

  const API = { checkSubcontract, anuRisk, cashflowCheck, docState, freistellung, nowNext,
    REQUIRED, ANU_SIGNALS, SEVERITY, KIND_LABEL, A1_LEHOTA };
  if (typeof window !== 'undefined') window.DanubraCompliance = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
