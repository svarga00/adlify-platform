// ============================================================================
// DANUBRA — obdobia na filtrovanie
// ============================================================================
// „Zarábame na tom?" bez obdobia je otázka bez odpovede. Za celý čas to
// vyzerá inak než za tento mesiac a rozhodnutie sa robí podľa toho druhého.
//
// Obdobia sú kalendárne, nie „posledných 30 dní" — účtovníctvo, faktúry aj
// mzdy idú po mesiacoch a štvrťrokoch, takže porovnávať sa dá len to, čo
// sedí s nimi.
//
// Testy: node danubra/lib/period.test.js
// ============================================================================
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const day = (s) => (s ? String(s).slice(0, 10) : null);

  /** Posledný deň mesiaca — február aj priestupný rok. */
  function lastDay(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Ponuka období. Poradie je zámerné: to, čo sa pýta najčastejšie, je hore.
   * `all` je posledné — bez ohraničenia sa dá pozerať vždy, ale ako
   * východisko klame.
   */
  const OPTIONS = [
    ['month', 'Tento mesiac'],
    ['prev_month', 'Minulý mesiac'],
    ['quarter', 'Tento štvrťrok'],
    ['year', 'Tento rok'],
    ['all', 'Za celý čas'],
  ];

  /**
   * Rozsah obdobia.
   * @returns {{ key, label, from: string|null, to: string|null }}
   *          `null` znamená bez ohraničenia.
   */
  function range(key, today) {
    const t = day(today) || new Date().toISOString().slice(0, 10);
    const [y, m] = t.split('-').map(Number);
    const label = (OPTIONS.find(o => o[0] === key) || OPTIONS[0])[1];

    switch (key) {
      case 'prev_month': {
        const py = m === 1 ? y - 1 : y;
        const pm = m === 1 ? 12 : m - 1;
        return { key, label, from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) };
      }
      case 'quarter': {
        const q = Math.floor((m - 1) / 3);
        const from = q * 3 + 1, to = from + 2;
        return { key, label, from: ymd(y, from, 1), to: ymd(y, to, lastDay(y, to)) };
      }
      case 'year':
        return { key, label, from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
      case 'all':
        return { key, label, from: null, to: null };
      case 'month':
      default:
        return { key: 'month', label: OPTIONS[0][1],
          from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
    }
  }

  /** Patrí dátum do obdobia? Záznam bez dátumu sa do obdobia nepočíta. */
  function covers(r, date) {
    const d = day(date);
    if (!r || (!r.from && !r.to)) return true;       // bez ohraničenia
    if (!d) return false;
    if (r.from && d < r.from) return false;
    if (r.to && d > r.to) return false;
    return true;
  }

  /**
   * Prefiltruje riadky podľa dátumového stĺpca.
   * `dateField` môže byť aj funkcia, keď je dátum poskladaný.
   */
  function filter(rows, r, dateField) {
    if (!r || (!r.from && !r.to)) return (rows || []).slice();
    const get = typeof dateField === 'function' ? dateField : (x) => x && x[dateField];
    return (rows || []).filter(x => covers(r, get(x)));
  }

  /** Veta pod číslo: „za tento mesiac (1. – 30. 9.)". */
  function text(r) {
    if (!r || !r.from) return 'za celý čas';
    const fmt = (s) => {
      const [, mm, dd] = s.split('-');
      return `${Number(dd)}. ${Number(mm)}.`;
    };
    return `${r.label.toLowerCase()} (${fmt(r.from)} – ${fmt(r.to)})`;
  }

  const API = { OPTIONS, range, covers, filter, text, lastDay };
  if (typeof window !== 'undefined') window.DanubraPeriod = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
