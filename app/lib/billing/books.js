// ============================================================================
// DANUBRA — prehľad pre účtovníčku
// ============================================================================
// „Prehľad pre účtovníčku" — za mesiac alebo rok: vydané faktúry, prijaté
// faktúry a ostatné náklady, súčty, tabuľky (CSV) a balík súborov (ZIP).
// Účtovníčka dostane jeden súbor, nie dvadsať e-mailov.
//
// Čisté funkcie. ZIP skladá `lib/zip.js`.
// Testy: node app/lib/billing/books.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : '');
  const inRange = (d, from, to) => { const x = day(d); return !!x && x >= from && x <= to; };

  /** Obdobie z „2026-10" (mesiac) alebo „2026" (rok). */
  function range(key) {
    const k = String(key || '');
    if (/^\d{4}$/.test(k)) return { from: `${k}-01-01`, to: `${k}-12-31`, label: `rok ${k}`, slug: k };
    const m = k.match(/^(\d{4})-(\d{2})/) || new Date().toISOString().match(/^(\d{4})-(\d{2})/);
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`,
      label: `${Number(m[2])}/${m[1]}`, slug: `${m[1]}-${m[2]}` };
  }

  /**
   * @param {Object} o { invoices, bills, costs, partners, workers, key }
   * Vydané podľa dátumu vystavenia, prijaté podľa dátumu vystavenia (inak prijatia),
   * náklady podľa dátumu nákladu. Návrhy a zahodené sa nerátajú.
   */
  function build(o = {}) {
    const r = range(o.key);
    const pn = new Map((o.partners || []).map(p => [p.id, p.name]));
    const wn = new Map((o.workers || []).map(w => [w.id, w.full_name]));
    const NIE = ['draft', 'pending_approval', 'draft_pending_approval', 'cancelled'];
    const issued = (o.invoices || []).filter(i => i && !NIE.includes(i.status) && inRange(i.issue_date, r.from, r.to))
      .map(i => ({ ...i, who: pn.get(i.partner_id) || '' }))
      .sort((a, b) => String(a.invoice_number || '').localeCompare(String(b.invoice_number || '')));
    const received = (o.bills || []).filter(b => b && !['discarded', 'review', 'self_draft'].includes(b.status)
      && inRange(b.issue_date || b.received_at || b.created_at, r.from, r.to))
      .map(b => ({ ...b, who: b.supplier_name || wn.get(b.worker_id) || '' }))
      .sort((a, b) => day(a.issue_date || a.received_at).localeCompare(day(b.issue_date || b.received_at)));
    const costs = (o.costs || []).filter(c => c && inRange(c.cost_date, r.from, r.to))
      .sort((a, b) => day(a.cost_date).localeCompare(day(b.cost_date)));
    const sum = (list, f) => M.sum(list.map(x => M.toCents(f(x))));
    return {
      ...r, issued, received, costs,
      totals: {
        issued: sum(issued, x => x.total), issuedNet: sum(issued, x => x.amount_net != null ? x.amount_net : x.total),
        received: sum(received, x => x.amount), costs: sum(costs, x => x.amount),
      },
      missingFiles: received.filter(b => !b.storage_path).map(b => b.bill_number || b.who || b.id),
    };
  }

  /** CSV so stredníkom — tak, ako ho otvorí Excel v slovenskom nastavení. */
  function csv(rows, cols) {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n) => (n == null || n === '' ? '' : String(Number(n).toFixed(2)).replace('.', ','));
    const head = cols.map(c => esc(c[0])).join(';');
    const body = rows.map(r => cols.map(([, f, t]) => esc(t === 'num' ? num(f(r)) : f(r))).join(';'));
    return '﻿' + [head, ...body].join('\r\n') + '\r\n';
  }

  const COLS = {
    issued: [['Číslo', r => r.invoice_number], ['Vystavená', r => day(r.issue_date)], ['Splatnosť', r => day(r.due_date)],
      ['Odberateľ', r => r.who], ['Režim DPH', r => r.vat_regime === 'reverse_charge' ? 'reverse charge §13b' : (r.vat_regime || '')],
      ['Suma', r => r.total, 'num'], ['Zrážka §48b', r => r.withholding_amount, 'num'], ['Na úhradu', r => r.amount_net, 'num'],
      ['Stav', r => r.status], ['Uhradená', r => day(r.paid_at)]],
    received: [['Dodávateľ', r => r.who], ['Ich číslo', r => r.bill_number], ['VS', r => r.variable_symbol],
      ['Vystavená', r => day(r.issue_date)], ['Splatnosť', r => day(r.due_date)], ['Druh', r => r.category],
      ['Suma', r => r.amount, 'num'], ['Stav', r => r.status], ['Súbor', r => (r.storage_path ? 'áno' : 'chýba')]],
    costs: [['Dátum', r => day(r.cost_date)], ['Kategória', r => r.category], ['Popis', r => r.description],
      ['Dodávateľ', r => r.supplier], ['Suma', r => r.amount, 'num']],
  };

  /** Bezpečný názov súboru v ZIP (bez lomiek a diakritiky v ceste). */
  function fileIn(prefix, name, i) {
    const s = String(name || `subor-${i + 1}`).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._ -]+/g, '-').trim().slice(0, 100) || `subor-${i + 1}`;
    return `${prefix}/${String(i + 1).padStart(3, '0')} ${s}`;
  }

  const API = { range, build, csv, COLS, fileIn };
  if (typeof window !== 'undefined') window.DanubraBooks = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
