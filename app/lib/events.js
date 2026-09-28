// ============================================================================
// DANUBRA — udalosti (zvonček)
// ============================================================================
// Čo sa stalo a čo sa chystá stať. Nie ďalší zoznam úloh — úlohy majú
// vlastnú obrazovku. Toto je to, čo by človeku niekto povedal, keby prišiel
// do kancelárie: „prepadlo A1, prišla faktúra, banka nesedí".
//
// Dve veci, na ktorých sa zvončeky bežne kazia:
//
//   * **Hlási sa aj to, čo už dávno vieš.** Preto má každá udalosť dátum
//     a to, čo je staršie než posledná návšteva, je prečítané. Prečítané
//     nezmizne — len prestane svietiť.
//   * **Hlási sa všetko naraz.** Preto je udalostí najviac toľko, koľko sa
//     dá prečítať, zoradených podľa naliehavosti a času. Zvyšok je na
//     obrazovkách, kam vedú odkazy.
//
// Udalosti sa počítajú z dát, ktoré appka aj tak má — žiadna ďalšia tabuľka
// a žiadny cron, ktorý by sa musel trafiť.
//
// Testy: node app/lib/events.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  /** Naliehavosť. Nižšie číslo je vyššie v zozname. */
  const RANK = { bad: 0, warn: 1, info: 2 };

  function addDays(d, n) {
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }

  /**
   * Zostaví udalosti.
   *
   * @param {Object} o  dáta tak, ako ich má prehľad
   *   today, docs, invoices, bills, periods, tasks, candidates, transactions,
   *   workerName, partnerName, siteName
   * @returns {Array} [{ id, tone, icon, title, detail, date, type, entityId }]
   */
  function build(o = {}) {
    const t = o.today || today0();
    const out = [];
    const push = (e) => { if (e && e.title) out.push(e); };

    // ── Doklady ─────────────────────────────────────────────────────────
    for (const d of (o.docs || [])) {
      if (!d) continue;
      if (d.validity === 'expired') {
        push({
          id: `doc-exp-${d.id}`, tone: 'bad', icon: 'alert',
          title: `${d.worker_name || 'Živnostníkovi'} prepadol doklad`,
          detail: d.valid_to ? `platnosť skončila ${fmt(d.valid_to)}` : 'bez platnosti',
          date: day(d.valid_to) || t, type: 'worker', entityId: d.worker_id,
        });
      } else if (d.validity === 'expiring') {
        push({
          id: `doc-soon-${d.id}`, tone: 'warn', icon: 'clock',
          title: `${d.worker_name || 'Živnostníkovi'} čoskoro skončí doklad`,
          detail: d.days_left != null ? `ešte ${d.days_left} dní` : 'blíži sa koniec',
          date: t, type: 'worker', entityId: d.worker_id,
        });
      }
    }

    // ── Vydané faktúry ──────────────────────────────────────────────────
    for (const i of (o.invoices || [])) {
      if (!i) continue;
      const open = !['paid', 'cancelled', 'draft'].includes(i.status);
      if (open && day(i.due_date) && day(i.due_date) < t) {
        push({
          id: `inv-late-${i.id}`, tone: 'bad', icon: 'invoices',
          title: `Faktúra ${i.invoice_number || ''} je po splatnosti`.trim(),
          detail: [o.partnerName && o.partnerName(i.partner_id),
            `splatnosť bola ${fmt(i.due_date)}`].filter(Boolean).join(' · '),
          date: day(i.due_date), type: 'invoice', entityId: i.id,
        });
      }
      if (i.status === 'pending_approval') {
        push({
          id: `inv-appr-${i.id}`, tone: 'warn', icon: 'invoices',
          title: `Faktúra ${i.invoice_number || ''} čaká na schválenie`.trim(),
          detail: 'bez schválenia sa nevystaví ani neodošle',
          date: day(i.issue_date) || t, type: 'invoice', entityId: i.id,
        });
      }
      if (i.status === 'paid' && day(i.paid_at)) {
        push({
          id: `inv-paid-${i.id}`, tone: 'info', icon: 'check',
          title: `Faktúra ${i.invoice_number || ''} je uhradená`.trim(),
          detail: o.partnerName ? o.partnerName(i.partner_id) : '',
          date: day(i.paid_at), type: 'invoice', entityId: i.id,
        });
      }
    }

    // ── Prijaté faktúry ─────────────────────────────────────────────────
    for (const b of (o.bills || [])) {
      if (!b) continue;
      const who = o.workerName ? o.workerName(b.worker_id) : null;
      // Meno sa pripája pomlčkou, nie predložkou: „od Peter Kováč" je zle
      // a skloňovať meno v kóde sa spoľahlivo nedá.
      if (b.status === 'disputed') {
        push({
          id: `bill-disp-${b.id}`, tone: 'bad', icon: 'receipt',
          title: `Sporná faktúra${who ? ` — ${who}` : ''}`,
          detail: b.note || 'nesedí s odpracovanými hodinami',
          date: day(b.issue_date) || t, type: 'bill', entityId: b.id,
        });
      } else if (b.status === 'received') {
        push({
          id: `bill-new-${b.id}`, tone: 'info', icon: 'receipt',
          title: `Prišla faktúra${who ? ` — ${who}` : ''}`,
          detail: 'čaká na kontrolu oproti hodinám',
          date: day(b.issue_date) || t, type: 'bill', entityId: b.id,
        });
      }
    }

    // ── Obdobia ─────────────────────────────────────────────────────────
    for (const p of (o.periods || [])) {
      if (!p || p.status !== 'open') continue;
      if (day(p.period_to) && day(p.period_to) < t) {
        push({
          id: `per-${p.id}`, tone: 'warn', icon: 'clock',
          title: 'Obdobie čaká na uzavretie',
          detail: [o.siteName && o.siteName(p.subcontract_id),
            `skončilo ${fmt(p.period_to)}`].filter(Boolean).join(' · '),
          date: day(p.period_to), type: 'subcontract', entityId: p.subcontract_id,
        });
      }
    }

    // ── Kandidáti ───────────────────────────────────────────────────────
    for (const c of (o.candidates || [])) {
      if (!c || c.status !== 'new' || c.first_contact_at) continue;
      push({
        id: `cand-${c.id}`, tone: 'warn', icon: 'user',
        title: `${c.full_name || 'Kandidát'} čaká na prvý telefonát`,
        detail: 'cieľ je do desiatich minút',
        date: day(c.created_at) || t, type: 'candidate', entityId: c.id,
      });
    }

    // ── Banka ───────────────────────────────────────────────────────────
    const unmatched = (o.transactions || []).filter(x => x && x.match_status === 'unmatched');
    if (unmatched.length) {
      const newest = unmatched.map(x => day(x.booked_at)).filter(Boolean).sort().pop();
      push({
        id: 'bank-unmatched', tone: 'warn', icon: 'invoices',
        title: `${unmatched.length} ${plural(unmatched.length, 'pohyb na účte nie je spárovaný',
          'pohyby na účte nie sú spárované', 'pohybov na účte nie je spárovaných')}`,
        detail: 'kým sa nespárujú, výhľad nesedí',
        date: newest || t, type: null, route: 'bank',
      });
    }

    // ── Úlohy z pravidiel ───────────────────────────────────────────────
    for (const task of (o.tasks || [])) {
      if (!task) continue;
      const due = day(task.due_date);
      if (!due || due > addDays(t, 7)) continue;        // ďaleká budúcnosť nie je udalosť
      push({
        id: `task-${task.id}`, tone: due < t ? 'bad' : 'warn', icon: 'tasks',
        title: task.title || 'Úloha',
        detail: due < t ? `malo byť hotové ${fmt(due)}` : `termín ${fmt(due)}`,
        date: due, type: task.entity_type, entityId: task.entity_id, route: 'tasks',
      });
    }

    // Najprv to, čo horí; v rámci naliehavosti najnovšie.
    out.sort((a, b) =>
      (RANK[a.tone] ?? 2) - (RANK[b.tone] ?? 2)
      || String(b.date || '').localeCompare(String(a.date || '')));

    return out.slice(0, Number(o.limit) || 30);
  }

  /** Koľko z nich je nových od poslednej návštevy. */
  function unseen(events, lastSeen) {
    if (!lastSeen) return (events || []).length;
    const cut = String(lastSeen).slice(0, 10);
    return (events || []).filter(e => String(e.date || '') > cut).length;
  }

  function fmt(d) {
    const s = day(d);
    if (!s) return '';
    const [y, m, dd] = s.split('-');
    return `${Number(dd)}. ${Number(m)}. ${y}`;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = { build, unseen, RANK, plural };
  if (typeof window !== 'undefined') window.DanubraEvents = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
