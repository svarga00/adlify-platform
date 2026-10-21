// ============================================================================
// DANUBRA — banka: výpis v XML (camt.053) a príkazy na úhradu (pain.001)
// ============================================================================
// „Primárne máme Tatra banku — dá sa spraviť nejaké napojenie?"
//
// Kým nie je zmluva na Premium API, ide to cez súbory, ktoré vie každá
// slovenská banka (aj Tatra banka v Business Bankingu):
//
//   • VÝPIS  — camt.053 (XML). Presnejší než CSV: IBAN protistrany, VS/SS/KS
//              aj správa sú v pevných poliach, nič sa nehádže podľa hlavičky.
//   • PLATBY — pain.001.001.03 (SEPA XML). Appka pripraví jeden súbor so
//              schválenými faktúrami, v banke sa nahrá a podpíše naraz.
//              Appka sama nič neodošle — podpisuje človek v banke.
//
// Kódovanie súboru (UTF-8 alebo Windows-1250, v ktorom exportujú staršie
// slovenské systémy) rozpozná `decode`.
//
// Čisté funkcie, bez siete. Testy: node app/lib/bank/sepa.test.js
// ============================================================================
(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const X = isNode ? require('../billing/extract.js') : window.DanubraExtract;
  const B = isNode ? require('../bank.js') : window.DanubraBank;
  const M = isNode ? require('../money') : window.Money;

  // ── Kódovanie ─────────────────────────────────────────────────────────────
  /**
   * Bajty súboru → text. Skúsi UTF-8 prísne; keď to nie je UTF-8, je to
   * takmer isto Windows-1250 (slovenské a české exporty).
   */
  function decode(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''), encoding: 'utf-8' };
    } catch {
      try { return { text: new TextDecoder('windows-1250').decode(u8), encoding: 'windows-1250' }; }
      catch { return { text: new TextDecoder('utf-8').decode(u8), encoding: 'utf-8?' }; }
    }
  }

  /** Je to výpis camt.053? (podľa koreňa a prvku so stavom účtu) */
  function isCamt(text) {
    return /<(\w+:)?BkToCstmrStmt\b/.test(String(text || '').slice(0, 5000))
      || /<(\w+:)?Document[^>]*camt\.05[234]/.test(String(text || '').slice(0, 2000));
  }

  // ── Výpis (camt.053) ──────────────────────────────────────────────────────
  const kid = (el, n) => (el && el.children.find(c => c.name === n)) || null;
  const kids = (el, n) => (el ? el.children.filter(c => c.name === n) : []);
  const at = (el, path) => path.split('/').reduce((e, n) => kid(e, n), el);
  const txt = (el, path) => { const e = path ? at(el, path) : el; return e ? e.text.trim() : ''; };

  /** „/VS1234/SS56/KS0308" (aj v správe) → { vs, ss, ks } */
  function symbols(...texts) {
    const out = { vs: null, ss: null, ks: null };
    for (const t of texts) {
      const s = String(t || '');
      for (const k of ['vs', 'ss', 'ks']) {
        if (out[k]) continue;
        const m = s.match(new RegExp(`(?:^|[/\\s,;])${k}[:\\s]*0*(\\d{1,10})(?=\\D|$)`, 'i'));
        if (m) out[k] = m[1];
      }
    }
    return out;
  }

  /** Meno a IBAN z bloku strany (camt.053.001.02 aj .08: Nm alebo Pty/Nm). */
  function strana(rp, kto) {
    const p = kid(rp, kto);
    const name = txt(p, 'Nm') || txt(p, 'Pty/Nm');
    const iban = txt(rp, `${kto}Acct/Id/IBAN`);
    const ine = txt(rp, `${kto}Acct/Id/Othr/Id`);
    return { name: name || null, iban: X.ibanClean(iban || ine) || null };
  }

  /**
   * camt.053 → pohyby v tvare ako `DanubraBank.parseCsv` (suma v centoch,
   * kladná príjem, záporná výdaj) + konečný zostatok, ak je vo výpise.
   */
  function parseCamt(xml) {
    const root = X.xmlTree(xml);
    const doc = root.children.find(c => c.name === 'Document') || root;
    const stmts = kids(kid(doc, 'BkToCstmrStmt'), 'Stmt');
    if (!stmts.length) {
      return { rows: [], skipped: [], error: 'V súbore nie je výpis (camt.053). Stiahnite z banky výpis vo formáte XML.' };
    }
    const rows = [], skipped = [];
    let closing = null, account = null;

    for (const st of stmts) {
      account = account || X.ibanClean(txt(st, 'Acct/Id/IBAN')) || null;
      for (const bal of kids(st, 'Bal')) {
        const typ = txt(bal, 'Tp/CdOrPrtry/Cd');
        if (typ === 'CLBD') {
          const c = M.toCents(X.money(txt(bal, 'Amt')));
          closing = { cents: txt(bal, 'CdtDbtInd') === 'DBIT' ? -c : c,
            date: X.date(txt(bal, 'Dt/Dt') || txt(bal, 'Dt/DtTm')) };
        }
      }
      kids(st, 'Ntry').forEach((n, i) => {
        const sts = txt(n, 'Sts') || txt(n, 'Sts/Cd');
        if (sts && sts !== 'BOOK') { skipped.push({ line: i + 1, why: 'pohyb ešte nie je zaúčtovaný' }); return; }
        const booked = X.date(txt(n, 'BookgDt/Dt') || txt(n, 'BookgDt/DtTm') || txt(n, 'ValDt/Dt'));
        const debet = txt(n, 'CdtDbtInd') === 'DBIT';
        const amtEl = kid(n, 'Amt');
        const entryCents = M.toCents(X.money(txt(n, 'Amt')));
        const details = kids(kid(n, 'NtryDtls'), 'TxDtls');
        const list = details.length ? details : [null];
        for (const d of list) {
          let cents = entryCents;
          if (d && details.length > 1) {
            const a = txt(d, 'Amt') || txt(d, 'AmtDtls/TxAmt/Amt') || txt(d, 'AmtDtls/InstdAmt/Amt');
            if (a) cents = M.toCents(X.money(a));
          }
          if (!booked || !cents) {
            skipped.push({ line: i + 1, why: !booked ? 'nečitateľný dátum' : 'nulová suma' });
            continue;
          }
          const rp = d && kid(d, 'RltdPties');
          const p = strana(rp, debet ? 'Cdtr' : 'Dbtr');
          const e2e = d ? txt(d, 'Refs/EndToEndId') : '';
          const ref = d ? txt(d, 'RmtInf/Strd/CdtrRefInf/Ref') : '';
          const ustrd = d ? kids(kid(d, 'RmtInf'), 'Ustrd').map(u => u.text.trim()).filter(Boolean).join(' ') : '';
          const info = txt(n, 'AddtlNtryInf') || (d ? txt(d, 'AddtlTxInf') : '');
          const sym = symbols(e2e, ref, ustrd);
          // EndToEndId, ktoré je celé len číslo, je v SR variabilný symbol.
          if (!sym.vs && /^\d{1,10}$/.test(e2e)) sym.vs = e2e.replace(/^0+/, '') || '0';
          const tx = {
            booked_at: booked,
            amount: debet ? -cents : cents,
            currency: ((amtEl && amtEl.attrs.Ccy) || 'EUR').toUpperCase(),
            counterparty_name: p.name,
            counterparty_iban: p.iban,
            variable_symbol: sym.vs, constant_symbol: sym.ks, specific_symbol: sym.ss,
            message: [ustrd, info].filter(Boolean).join(' · ') || null,
          };
          tx.import_hash = B.hashRow(tx);
          rows.push(tx);
        }
      });
    }

    const seen = new Set(), unique = [];
    for (const r of rows) {
      if (seen.has(r.import_hash)) { skipped.push({ line: null, why: 'duplicita v súbore' }); continue; }
      seen.add(r.import_hash); unique.push(r);
    }
    return { rows: unique, skipped, closing, account };
  }

  // ── Príkazy na úhradu (pain.001.001.03) ───────────────────────────────────
  // BIC podľa kódu banky v slovenskom IBAN-e. Keď ho nepoznáme, ide
  // NOTPROVIDED — pri SEPA platbe v eurách ho banka nepotrebuje.
  const BIC_SK = { '1100': 'TATRSKBX', '0900': 'GIBASKBX', '0200': 'SUBASKBX', '7500': 'CEKOSKBX',
    '1111': 'UNCRSKBX', '5600': 'KOMASK2X', '6500': 'POBNSKBA', '8360': 'BREXSKBX', '3100': 'LUBASKBX',
    '5200': 'OTPVSKBX', '0720': 'NBSBSKBX', '8330': 'FIOZSKBA' };
  function bicOf(iban) {
    const s = X.ibanClean(iban);
    return s.startsWith('SK') ? BIC_SK[s.slice(4, 8)] || null : null;
  }

  // SEPA pripúšťa len základnú latinku. Diakritiku banky väčšinou zoberú,
  // ale nie všetky — bez nej sa platba neodmietne nikde.
  const latin = (s) => String(s || '').replace(/[\u2012-\u2015]/g, '-').replace(/[\u201E\u201C\u201D]/g, "'")
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const eur = (cents) => (cents / 100).toFixed(2);

  /** „/VS1234/SS/KS0308" — slovenský zápis symbolov v EndToEndId (max 35 znakov). */
  function endToEnd({ vs, ss, ks } = {}) {
    const d = (v) => String(v || '').replace(/\D/g, '').slice(0, 10);
    if (!d(vs) && !d(ss) && !d(ks)) return 'NOTPROVIDED';
    return `/VS${d(vs)}/SS${d(ss)}/KS${d(ks)}`.slice(0, 35);
  }

  /** Čo bráni tomu, aby platba prešla — po slovensky, po jednej vete. */
  function checkPayment(p) {
    const out = [];
    if (!p || !(p.cents > 0)) out.push('nemá sumu');
    if (!p || !String(p.name || '').trim()) out.push('nemá meno príjemcu');
    if (!p || !p.iban) out.push('nemá IBAN');
    else if (!X.ibanValid(p.iban)) out.push('IBAN má zlý kontrolný súčet');
    return out;
  }

  /**
   * Súbor s príkazmi na úhradu.
   * @param {Object} o
   *   debtor: { name, iban, bic? }   — náš účet
   *   payments: [{ id, name, iban, cents, vs, ss, ks, message }]
   *   date: RRRR-MM-DD (dátum splatnosti príkazu), now: ISO (pre test)
   * @returns {{ xml:string|null, errors:string[], skipped:Array, count, cents }}
   */
  function pain001(o = {}) {
    const errors = [];
    const debtor = o.debtor || {};
    const dIban = X.ibanClean(debtor.iban);
    if (!String(debtor.name || '').trim()) errors.push('Chýba názov našej firmy (Nastavenia → Fakturačné údaje).');
    if (!dIban) errors.push('Chýba IBAN našej firmy (Nastavenia → Fakturačné údaje).');
    else if (!X.ibanValid(dIban)) errors.push('IBAN našej firmy v Nastaveniach má zlý kontrolný súčet.');

    const ok = [], skipped = [];
    for (const p of (o.payments || [])) {
      const q = { ...p, iban: X.ibanClean(p.iban) };
      const why = checkPayment(q);
      if (why.length) skipped.push({ ...q, why }); else ok.push(q);
    }
    if (!ok.length) errors.push('Nie je čo zaplatiť — žiadna platba nemá všetko, čo treba.');
    const cents = ok.reduce((s, p) => s + p.cents, 0);
    if (errors.length) return { xml: null, errors, skipped, count: ok.length, cents };

    const now = o.now || new Date().toISOString();
    const date = X.date(o.date) || now.slice(0, 10);
    const msgId = (o.msgId || `PLATBY-${now.replace(/\D/g, '').slice(0, 14)}`).slice(0, 35);
    const dBic = debtor.bic || bicOf(dIban);
    const agent = (bic) => (bic ? `<FinInstnId><BIC>${esc(bic)}</BIC></FinInstnId>`
      : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>');

    const tx = ok.map((p, i) => `
      <CdtTrfTxInf>
        <PmtId><InstrId>${esc(`${msgId}-${i + 1}`.slice(0, 35))}</InstrId><EndToEndId>${esc(endToEnd(p))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${eur(p.cents)}</InstdAmt></Amt>
        ${bicOf(p.iban) ? `<CdtrAgt>${agent(bicOf(p.iban))}</CdtrAgt>` : ''}
        <Cdtr><Nm>${esc(latin(p.name).slice(0, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(p.iban)}</IBAN></Id></CdtrAcct>
        ${p.message ? `<RmtInf><Ustrd>${esc(latin(p.message).slice(0, 140))}</Ustrd></RmtInf>` : ''}
      </CdtTrfTxInf>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${esc(now.slice(0, 19))}</CreDtTm>
      <NbOfTxs>${ok.length}</NbOfTxs>
      <CtrlSum>${eur(cents)}</CtrlSum>
      <InitgPty><Nm>${esc(latin(debtor.name).slice(0, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(`${msgId}-1`.slice(0, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${ok.length}</NbOfTxs>
      <CtrlSum>${eur(cents)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${esc(date)}</ReqdExctnDt>
      <Dbtr><Nm>${esc(latin(debtor.name).slice(0, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(dIban)}</IBAN></Id><Ccy>EUR</Ccy></DbtrAcct>
      <DbtrAgt>${agent(dBic)}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
    return { xml, errors: [], skipped, count: ok.length, cents };
  }

  /**
   * Schválené prijaté faktúry → platby. IBAN z faktúry, inak zo živnostníka.
   * Keď sa IBAN na faktúre líši od toho, čo má živnostník v appke, platba
   * sa ponúkne, ale s upozornením — o tom rozhoduje človek, nie appka.
   */
  function billPayments(bills = [], workers = []) {
    const w = new Map((workers || []).map(x => [x.id, x]));
    return (bills || []).filter(b => b && b.status === 'approved').map(b => {
      const wk = b.worker_id ? w.get(b.worker_id) : null;
      const ibanBill = X.ibanClean(b.supplier_iban), ibanW = X.ibanClean(wk && wk.bank_iban);
      const vs = String(b.variable_symbol || '').replace(/\D/g, '')
        || (String(b.bill_number || '').replace(/\D/g, '').slice(-10));
      const p = {
        id: b.id, name: (wk && (wk.company_name || wk.full_name)) || b.supplier_name || '',
        iban: ibanBill || ibanW || '', cents: M.toCents(b.amount), vs,
        message: `Faktura ${b.bill_number || ''}`.trim(), due: b.due_date || null,
        ibanDiffers: !!(ibanBill && ibanW && ibanBill !== ibanW),
      };
      p.problems = checkPayment(p);
      return p;
    });
  }

  const API = { decode, isCamt, symbols, parseCamt, bicOf, endToEnd, checkPayment, pain001, billPayments };
  if (typeof window !== 'undefined') window.DanubraSepa = API;
  if (isNode) module.exports = API;
})();
