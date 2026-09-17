// ============================================================================
// DANUBRA — import bankového výpisu a cash-flow
// ============================================================================
// Podľa biznis plánu je likvidita najpravdepodobnejší dôvod zlyhania — nie
// nedostatok dopytu. Odberateľ platí za 30–60 dní, živnostníkom sa platí do
// 14. Rozdiel treba vidieť dopredu, nie v deň, keď nie je na výplaty.
//
// Import je zámerne tolerantný. Každá slovenská banka exportuje CSV inak:
// iný oddeľovač, iné názvy stĺpcov, iný zápis čísla, niekedy BOM na začiatku.
// Parser hľadá stĺpce podľa významu, nie podľa poradia — aby sa nemusel
// prepisovať pri každej zmene formátu.
//
// Odtlačok riadku (`import_hash`) sa počíta tu a databáza ho má unikátny,
// takže ten istý výpis sa nenaimportuje dvakrát.
//
// Peniaze v celých centoch (lib/money.js). Čistá logika.
//
// Testy: node danubra/lib/bank.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./money.js') : window.Money;

  // ── Rozpoznávanie stĺpcov ─────────────────────────────────────────────────
  // Kľúč je náš názov, hodnoty sú kúsky, ktoré sa hľadajú v hlavičke.
  // Poradie v poli rozhoduje — prvá zhoda vyhráva.
  const COLUMNS = {
    booked_at: ['datum zauctovania', 'datum splatnosti', 'datum transakcie',
      'datum', 'buchungstag', 'date', 'valuta'],
    amount: ['suma', 'ciastka', 'castka', 'betrag', 'amount', 'obrat'],
    currency: ['mena', 'currency', 'waehrung'],
    counterparty_name: ['nazov protiuctu', 'protistrana', 'nazov prijemcu',
      'partner', 'nazov', 'name', 'beguenstigter'],
    counterparty_iban: ['iban protiuctu', 'protiucet', 'iban', 'cislo uctu'],
    variable_symbol: ['vs', 'variabilny symbol', 'variabilny'],
    constant_symbol: ['ks', 'konstantny symbol'],
    specific_symbol: ['ss', 'specificky symbol'],
    message: ['sprava pre prijemcu', 'popis', 'poznamka', 'ucel platby',
      'verwendungszweck', 'message', 'detail'],
  };

  /** Bez diakritiky a malými písmenami — hlavičky sú zakaždým inak. */
  function norm(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/["']/g, '').trim();
  }

  /** Ktorý oddeľovač banka použila. Rozhodne prvý riadok. */
  function detectDelimiter(line) {
    const counts = [[';', 0], [',', 0], ['\t', 0], ['|', 0]];
    let inQuotes = false;
    for (const ch of String(line)) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (inQuotes) continue;
      const c = counts.find(x => x[0] === ch);
      if (c) c[1]++;
    }
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }

  /** Jeden riadok CSV na polia. Rešpektuje úvodzovky a zdvojené "". */
  function splitLine(line, delim) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur); cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  /** Priradí stĺpce podľa hlavičky. Vráti { nasNazov: index }. */
  function mapColumns(header) {
    const cols = header.map(norm);
    const map = {};
    for (const [key, needles] of Object.entries(COLUMNS)) {
      for (const needle of needles) {
        const idx = cols.findIndex(c => c === needle);
        if (idx >= 0 && !Object.values(map).includes(idx)) { map[key] = idx; break; }
      }
      if (map[key] != null) continue;
      // Presná zhoda nič nenašla — skús obsahovú.
      for (const needle of needles) {
        const idx = cols.findIndex(c => c.includes(needle));
        if (idx >= 0 && !Object.values(map).includes(idx)) { map[key] = idx; break; }
      }
    }
    return map;
  }

  /** Dátum v akomkoľvek bežnom zápise na ISO. */
  function parseDate(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    return null;
  }

  /**
   * Suma na celé centy. Znamienko zostáva — kladné príjem, záporné výdaj.
   * Zvládne „1 234,56", „-1.234,56", „1234.56" aj „1 234,56 EUR".
   */
  function parseAmount(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    try { return M.toCents(v); } catch { return null; }
  }

  function cleanIban(v) {
    return String(v ?? '').replace(/\s/g, '').toUpperCase() || null;
  }

  /**
   * Odtlačok pohybu. Musí byť stabilný — ten istý riadok z toho istého výpisu
   * musí dať vždy to isté, inak by sa duplicita nezachytila.
   *
   * Nie je to kryptografia, len rozlíšenie riadkov. Preto stačí jednoduchý
   * hash, ktorý funguje rovnako v prehliadači aj v Node.
   */
  function hashRow(tx) {
    const parts = [
      tx.booked_at || '', String(tx.amount ?? ''), tx.currency || 'EUR',
      cleanIban(tx.counterparty_iban) || '', norm(tx.counterparty_name),
      String(tx.variable_symbol || ''), norm(tx.message),
    ].join('|');
    // FNV-1a, 32-bit, v hexa — krátke a bez závislostí.
    let h = 0x811c9dc5;
    for (let i = 0; i < parts.length; i++) {
      h ^= parts.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${h.toString(16).padStart(8, '0')}-${parts.length.toString(16)}`;
  }

  /**
   * Prevedie CSV výpis na pohyby.
   * @returns {{ rows:Array, skipped:Array, columns:Object, delimiter:string }}
   *   `skipped` sú riadky, ktoré sa nepodarilo prečítať — nezahadzujú sa
   *   ticho, aby bolo vidieť, že sa niečo stratilo.
   */
  function parseCsv(text, o = {}) {
    const clean = String(text || '').replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return { rows: [], skipped: [], columns: {}, delimiter: ';' };

    const delimiter = o.delimiter || detectDelimiter(lines[0]);
    const header = splitLine(lines[0], delimiter);
    const columns = mapColumns(header);

    if (columns.booked_at == null || columns.amount == null) {
      return {
        rows: [], skipped: [], columns, delimiter,
        error: 'Vo výpise sa nenašiel stĺpec s dátumom alebo so sumou. '
          + 'Skontroluj, či je to export pohybov a nie zostatkov.',
      };
    }

    const rows = [], skipped = [];
    const at = (cells, key) => (columns[key] == null ? null : cells[columns[key]]);

    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i], delimiter);
      const booked = parseDate(at(cells, 'booked_at'));
      const amount = parseAmount(at(cells, 'amount'));

      if (!booked || amount === null || amount === 0) {
        skipped.push({ line: i + 1, raw: lines[i],
          why: !booked ? 'nečitateľný dátum'
            : amount === null ? 'nečitateľná suma' : 'nulová suma' });
        continue;
      }

      const tx = {
        booked_at: booked,
        amount,                                   // v centoch
        currency: (at(cells, 'currency') || 'EUR').toUpperCase().slice(0, 3),
        counterparty_name: at(cells, 'counterparty_name') || null,
        counterparty_iban: cleanIban(at(cells, 'counterparty_iban')),
        variable_symbol: (at(cells, 'variable_symbol') || '').trim() || null,
        constant_symbol: (at(cells, 'constant_symbol') || '').trim() || null,
        specific_symbol: (at(cells, 'specific_symbol') || '').trim() || null,
        message: at(cells, 'message') || null,
      };
      tx.import_hash = hashRow(tx);
      rows.push(tx);
    }

    // Duplicity v rámci jedného súboru — banka občas exportuje prekrývajúce
    // sa obdobia do jedného CSV.
    const seen = new Set();
    const unique = [];
    for (const r of rows) {
      if (seen.has(r.import_hash)) {
        skipped.push({ line: null, raw: r.import_hash, why: 'duplicita v súbore' });
        continue;
      }
      seen.add(r.import_hash);
      unique.push(r);
    }

    return { rows: unique, skipped, columns, delimiter };
  }

  /** Súhrn importu na potvrdenie pred uložením. */
  function summary(rows) {
    const income = rows.filter(r => r.amount > 0);
    const expense = rows.filter(r => r.amount < 0);
    const dates = rows.map(r => r.booked_at).sort();
    return {
      count: rows.length,
      income: M.sum(income.map(r => r.amount)),
      expense: M.sum(expense.map(r => r.amount)),   // záporné
      net: M.sum(rows.map(r => r.amount)),
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
    };
  }

  // ── Cash-flow ─────────────────────────────────────────────────────────────

  /**
   * Výhľad po týždňoch. Odpovedá na otázku, ktorá sa v tomto biznise pýta
   * každý mesiac: **bude na výplaty?**
   *
   * @param {Object} o
   *   balance   dnešný zostatok v centoch
   *   items     [{ direction, expected_on, amount, label, counterparty, overdue }]
   *             `amount` je v eurách tak, ako to vracia pohľad; prevedie sa
   *   weeks     koľko týždňov dopredu
   *   today
   */
  function forecast(o = {}) {
    const today = o.today || new Date().toISOString().slice(0, 10);
    const weeks = o.weeks || 8;
    let balance = o.balance || 0;

    const buckets = [];
    for (let i = 0; i < weeks; i++) {
      const from = addDays(today, i * 7);
      const to = addDays(today, (i + 1) * 7 - 1);
      buckets.push({ from, to, in: 0, out: 0, items: [] });
    }
    // Po splatnosti a všetko staršie spadne do prvého týždňa — sú to peniaze,
    // ktoré mali byť dávno vybavené, nie budúcnosť.
    const overdue = { in: 0, out: 0, items: [] };

    for (const it of (o.items || [])) {
      if (!it) continue;
      const cents = M.toCents(it.amount);
      const when = String(it.expected_on || '').slice(0, 10);
      const target = when && when < today
        ? overdue
        : buckets.find(b => when >= b.from && when <= b.to);
      if (!target) continue;                    // mimo výhľadu
      if (cents >= 0) target.in += cents; else target.out += cents;
      target.items.push(it);
    }

    // Priebežný zostatok. Po splatnosti sa započíta hneď na začiatku.
    balance += overdue.in + overdue.out;
    let running = balance;
    let lowest = { balance: running, week: 0, from: today };
    for (let i = 0; i < buckets.length; i++) {
      running += buckets[i].in + buckets[i].out;
      buckets[i].balance = running;
      if (running < lowest.balance) {
        lowest = { balance: running, week: i + 1, from: buckets[i].from };
      }
    }

    return {
      today, overdue, buckets,
      startBalance: o.balance || 0,
      afterOverdue: balance,
      endBalance: running,
      lowest,
      // Toto je tá otázka: kedy (ak vôbec) spadneme pod nulu.
      negativeFrom: buckets.find(b => b.balance < 0) || null,
    };
  }

  /**
   * Smie sa škálovať? Prah je v Nastaveniach → Cenník a pravidlá.
   * Podľa biznis plánu je toto rozhodnutie, ktoré sa najčastejšie robí
   * podľa pocitu a najviac to bolí.
   */
  function scaleCheck(f, s = {}) {
    const reasons = [], warnings = [];
    const buffer = M.toCents(s.cash_buffer_min ?? 5000);
    const dsoLimit = Number(s.dso_alert_days) || 45;

    if (f.negativeFrom) {
      reasons.push({
        rule: 'cash_negative',
        label: `Podľa výhľadu spadne účet do mínusu ${f.negativeFrom.from}`,
        detail: `Najnižší bod je ${M.format(f.lowest.balance)}. Ďalších ľudí `
          + 'neber, kým to nesedí — výplaty sa odložiť nedajú.',
        severity: 'block',
      });
    } else if (f.lowest.balance < buffer) {
      warnings.push({
        rule: 'cash_thin',
        label: `Najnižší zostatok vo výhľade je ${M.format(f.lowest.balance)}`,
        detail: `Rezerva má byť aspoň ${M.format(buffer)}. Jeden odberateľ, `
          + 'ktorý zaplatí neskoro, a je to tesné.',
        severity: 'warn',
      });
    }

    const overdueIn = f.overdue.in;
    if (overdueIn > 0) {
      warnings.push({
        rule: 'cash_overdue',
        label: `Po splatnosti čaká ${M.format(overdueIn)}`,
        detail: 'Kým to nepríde, výhľad je optimistickejší, než je pravda.',
        severity: 'warn',
      });
    }

    return {
      ok: reasons.length === 0, reasons, warnings,
      buffer, dsoLimit,
    };
  }

  function addDays(d, n) {
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }

  const API = {
    COLUMNS, norm, detectDelimiter, splitLine, mapColumns,
    parseDate, parseAmount, cleanIban, hashRow,
    parseCsv, summary,
    forecast, scaleCheck, addDays,
  };
  window.DanubraBank = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
