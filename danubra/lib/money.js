// ============================================================================
// DANUBRA — peniaze v celých centoch
// ============================================================================
// Rozhodnutie R2 (docs/v2/DECISIONS.md): v databáze `numeric`, v JS celé centy.
// decimal.js by bez bundlera znamenalo závislosť na cudzom CDN, appka dnes
// žiadnu nemá.
//
// Pravidlá, ktoré tento súbor drží:
//   • všetka aritmetika beží na celých číslach (centy), nikdy na 0.01 + 0.02,
//   • medzivýsledky násobenia idú cez BigInt, takže hodiny × sadzba nepreteče,
//   • zaokrúhľuje sa obchodne (0,5 vždy nahor v absolútnej hodnote),
//   • delenie sumy medzi viac položiek nikdy nestratí ani nepridá cent,
//   • do databázy sa zapisuje cez `toNumeric`, nie cez `fromCents`, aby
//     sa nikdy neposielal float.
//
// Súčty nad mnohými riadkami radšej počítaj v SQL (`sum(...)` nad `numeric`);
// tento modul je na výpočty v prehliadači a v serverových funkciách.
//
// Testy: node danubra/lib/money.test.js
// ============================================================================
(function () {
  const SCALE = 1000000n;   // násobiteľ pre desatinné množstvá a percentá

  // ── Zaokrúhľovanie ────────────────────────────────────────────────────────

  /**
   * Podiel dvoch BigIntov zaokrúhlený obchodne: polovica vždy smerom od nuly.
   * Math.round by −0,5 poslal na −0, čo pri zrážkach a zľavách robí rozdiel.
   */
  function divRound(num, den) {
    if (den === 0n) throw new RangeError('delenie nulou');
    const neg = (num < 0n) !== (den < 0n);
    const a = num < 0n ? -num : num;
    const b = den < 0n ? -den : den;
    const q = (2n * a + b) / (2n * b);
    return neg ? -q : q;
  }

  /** Desatinné množstvo (hodiny, m²) na celé číslo v mikro-jednotkách. */
  function scaleQty(qty) {
    const n = Number(qty);
    if (!Number.isFinite(n)) throw new TypeError(`množstvo nie je číslo: ${qty}`);
    return BigInt(Math.round(n * 1e6));
  }

  // ── Vstup a výstup ────────────────────────────────────────────────────────

  /**
   * Čokoľvek, čo môže prijať formulár, na celé centy.
   * Zvládne slovenský aj anglický zápis: „1 234,56", „1.234,56", „1234.56".
   * Prázdna hodnota je nula; nezmysel je chyba, nie tichá nula — inak by sa
   * preklep vo faktúre prejavil ako suma 0 €.
   */
  function toCents(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`suma nie je číslo: ${value}`);
      return Number(divRound(BigInt(Math.round(value * 1e6)), 10000n));
    }
    let s = String(value).trim().replace(/\s| |€|EUR/gi, '');
    if (s === '' || s === '-') return 0;
    // Ktorý znak je desatinná čiarka: ten, čo je v reťazci posledný.
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!/^-?\d*(\.\d*)?$/.test(s)) throw new TypeError(`neplatná suma: ${value}`);
    const n = Number(s);
    if (!Number.isFinite(n)) throw new TypeError(`neplatná suma: ${value}`);
    return Number(divRound(BigInt(Math.round(n * 1e6)), 10000n));
  }

  /** Centy na eurá ako číslo. Len na zobrazenie a na výpočty mimo peňazí. */
  function fromCents(cents) {
    return int(cents) / 100;
  }

  /** Centy na reťazec pre `numeric` v databáze. Nikdy neposielaj float. */
  function toNumeric(cents) {
    const c = int(cents);
    const neg = c < 0;
    const a = Math.abs(c);
    return `${neg ? '-' : ''}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
  }

  /** Slovenský formát so nezlomiteľnou medzerou v tisícoch. */
  function format(cents, { currency = '€', sign = false } = {}) {
    const c = int(cents);
    const a = Math.abs(c);
    const whole = String(Math.trunc(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const frac = String(a % 100).padStart(2, '0');
    const prefix = c < 0 ? '−' : (sign && c > 0 ? '+' : '');
    return `${prefix}${whole},${frac}${currency ? ' ' + currency : ''}`;
  }

  function int(cents) {
    if (typeof cents !== 'number' || !Number.isInteger(cents)) {
      throw new TypeError(`očakávam celé centy, dostal som: ${cents}`);
    }
    return cents;
  }

  // ── Aritmetika ────────────────────────────────────────────────────────────

  function add(...values) { return values.reduce((s, v) => s + int(v), 0); }
  function sub(a, b) { return int(a) - int(b); }
  function neg(a) { return -int(a); }
  function sum(list) { return (list || []).reduce((s, v) => s + int(v), 0); }

  /** Sadzba × množstvo. Množstvo môže byť desatinné (312,5 hodiny). */
  function mul(cents, qty) {
    return Number(divRound(BigInt(int(cents)) * scaleQty(qty), SCALE));
  }

  /** Percento zo sumy. `pct(873600, 15)` = zrážka §48b z 8 736 €. */
  function pct(cents, percent) {
    return Number(divRound(BigInt(int(cents)) * scaleQty(percent), SCALE * 100n));
  }

  /** Suma zvýšená o percento — základ + DPH. */
  function addPct(cents, percent) { return int(cents) + pct(cents, percent); }

  /**
   * Rozdelenie sumy na `n` častí tak, aby ich súčet presne sedel.
   * Zvyškové centy sa prilepia na prvé časti, nie na poslednú — pri delení
   * paušálu medzi ľudí v partii je spravodlivejšie, keď rozdiel nesie ten,
   * kto je v zozname vyššie, než keď sa všetok nahromadí na konci.
   */
  function split(cents, n) {
    const total = int(cents);
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`neplatný počet častí: ${n}`);
    const base = Math.trunc(total / n);
    let rest = total - base * n;                 // znamienko drží so `total`
    const step = rest < 0 ? -1 : 1;
    return Array.from({ length: n }, () => {
      if (rest !== 0) { rest -= step; return base + step; }
      return base;
    });
  }

  /**
   * Rozdelenie v pomere zadaných váh (napríklad náklad na ubytovanie podľa
   * odrobených hodín). Súčet výsledku je vždy presne `cents`.
   * Najväčší zvyšok dostane cent prvý — metóda najväčších zvyškov.
   */
  function allocate(cents, weights) {
    const total = int(cents);
    const w = (weights || []).map(x => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0) throw new RangeError(`neplatná váha: ${x}`);
      return n;
    });
    const wsum = w.reduce((s, x) => s + x, 0);
    if (w.length === 0) return [];
    if (wsum === 0) return split(total, w.length);
    const raw = w.map(x => (total * x) / wsum);
    const parts = raw.map(x => Math.trunc(x));
    let rest = total - parts.reduce((s, x) => s + x, 0);
    const step = rest < 0 ? -1 : 1;
    const order = raw
      .map((x, i) => ({ i, frac: Math.abs(x - Math.trunc(x)) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; rest !== 0; k++) {
      parts[order[k % order.length].i] += step;
      rest -= step;
    }
    return parts;
  }

  // ── Porovnávanie ──────────────────────────────────────────────────────────

  function cmp(a, b) { const d = int(a) - int(b); return d === 0 ? 0 : (d > 0 ? 1 : -1); }
  function isZero(a) { return int(a) === 0; }
  function max(...v) { return v.reduce((m, x) => (int(x) > m ? x : m), int(v[0])); }
  function min(...v) { return v.reduce((m, x) => (int(x) < m ? x : m), int(v[0])); }

  const API = {
    toCents, fromCents, toNumeric, format,
    add, sub, neg, sum, mul, pct, addPct,
    split, allocate,
    cmp, isZero, max, min,
    divRound,
  };
  window.Money = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
