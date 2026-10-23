// ============================================================================
// DANUBRA — upomienky (Zahlungserinnerung, Mahnung)
// ============================================================================
// „Upomienky" — faktúra po splatnosti dostane po nemecky najprv priateľskú
// pripomienku, potom 1. a 2. upomienku. Každá sa zapíše
// (`danubra_invoice_reminders`), takže je vidieť, kedy čo odišlo, a ďalší
// stupeň sa ponúkne až po dvoch týždňoch.
//
// Čisté funkcie. Dokument je v `documents/templates.js` (`reminder`).
// Testy: node app/lib/billing/dunning.test.js
// ============================================================================
(function () {
  const LEVELS = [
    { level: 1, key: 'erinnerung', de: 'Zahlungserinnerung', sk: 'Pripomienka platby', days: 7,
      tone: 'priateľská — „možno ste ju prehliadli"' },
    { level: 2, key: 'mahnung1', de: '1. Mahnung', sk: '1. upomienka', days: 7,
      tone: 'vecná — nová lehota 7 dní' },
    { level: 3, key: 'mahnung2', de: '2. Mahnung', sk: '2. upomienka (posledná)', days: 5,
      tone: 'posledná — s výhradou úrokov z omeškania a paušálu 40 € (§ 288 BGB)' },
  ];
  /** Odstup medzi stupňami. Kratší by bol voči odberateľovi neférový. */
  const GAP_DAYS = 14;
  const PLATENA = ['paid', 'cancelled', 'draft', 'pending_approval', 'approved'];

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  function diff(a, b) {   // dni od b do a
    return Math.round((Date.parse(`${day(a)}T00:00:00Z`) - Date.parse(`${day(b)}T00:00:00Z`)) / 86400000);
  }
  function addDays(d, n) {
    const t = new Date(`${day(d)}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  const meta = (level) => LEVELS.find(l => l.level === level) || null;

  /**
   * Čo s faktúrou v upomínaní: ktorý stupeň je na rade, alebo kedy.
   * @returns {{ due:boolean, level:number|null, meta, overdueDays, wait:string|null, last }}
   */
  function next(invoice = {}, reminders = [], today) {
    const dnes = day(today) || new Date().toISOString().slice(0, 10);
    const inv = invoice || {};
    const mine = (reminders || []).filter(r => r && r.invoice_id === inv.id)
      .sort((a, b) => String(a.sent_at || '').localeCompare(String(b.sent_at || '')));
    const last = mine[mine.length - 1] || null;
    const overdueDays = inv.due_date ? diff(dnes, inv.due_date) : 0;
    const base = { overdueDays, last, count: mine.length };
    if (PLATENA.includes(inv.status) || !inv.due_date || overdueDays < 1) {
      return { ...base, due: false, level: null, meta: null, wait: null, reason: 'not_overdue' };
    }
    if (!last) return { ...base, due: true, level: 1, meta: meta(1), wait: null };
    if (last.level >= 3) return { ...base, due: false, level: null, meta: null, wait: null, reason: 'done' };
    const po = diff(dnes, last.sent_at);
    if (po >= GAP_DAYS) return { ...base, due: true, level: last.level + 1, meta: meta(last.level + 1), wait: null };
    return { ...base, due: false, level: last.level + 1, meta: meta(last.level + 1),
      wait: addDays(day(last.sent_at), GAP_DAYS), reason: 'wait' };
  }

  /** Nová lehota na úhradu uvedená v upomienke. */
  function deadline(level, today) {
    const m = meta(level) || LEVELS[0];
    return addDays(day(today) || new Date().toISOString().slice(0, 10), m.days);
  }

  /** Faktúry, ktorým treba poslať upomienku — najstaršie navrchu. */
  function queue(invoices = [], reminders = [], today) {
    return (invoices || []).map(inv => ({ invoice: inv, ...next(inv, reminders, today) }))
      .filter(x => x.due)
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }

  /** Nemecký text upomienky — telo listu podľa stupňa. */
  function text(level, { number, issueDate, dueDate, amount, newDeadline } = {}) {
    const d = (x) => { const m = String(x || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
    const nr = number ? `Nr. ${number}` : '';
    const vom = issueDate ? ` vom ${d(issueDate)}` : '';
    if (level === 1) {
      return [
        'Sehr geehrte Damen und Herren,',
        `bei der Durchsicht unserer Buchhaltung haben wir festgestellt, dass unsere Rechnung ${nr}${vom} über ${amount} mit Fälligkeit am ${d(dueDate)} noch offen ist.`,
        'Sicher handelt es sich nur um ein Versehen. Wir bitten Sie, den Betrag bis zum '
          + `${d(newDeadline)} auf das unten genannte Konto zu überweisen.`,
        'Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
      ];
    }
    if (level === 2) {
      return [
        'Sehr geehrte Damen und Herren,',
        `trotz unserer Zahlungserinnerung ist unsere Rechnung ${nr}${vom} über ${amount}, fällig am ${d(dueDate)}, bisher nicht beglichen.`,
        `Wir bitten Sie dringend, den offenen Betrag bis spätestens ${d(newDeadline)} zu überweisen.`,
        'Sollten Sie Einwände gegen die Rechnung haben, setzen Sie sich bitte umgehend mit uns in Verbindung.',
      ];
    }
    return [
      'Sehr geehrte Damen und Herren,',
      `unsere Rechnung ${nr}${vom} über ${amount}, fällig am ${d(dueDate)}, ist trotz Erinnerung und Mahnung weiterhin offen.`,
      `Wir fordern Sie letztmalig auf, den Betrag bis spätestens ${d(newDeadline)} zu begleichen.`,
      'Nach Ablauf dieser Frist behalten wir uns vor, Verzugszinsen und die Verzugspauschale von 40 € '
        + 'gemäß § 288 BGB geltend zu machen und weitere Schritte einzuleiten.',
    ];
  }

  const API = { LEVELS, GAP_DAYS, next, deadline, queue, text, meta };
  if (typeof window !== 'undefined') window.DanubraDunning = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
