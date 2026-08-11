// ============================================================================
// DANUBRA — QR kodér (byte mode) + SEPA platobný reťazec
// ============================================================================
// Bez závislostí. Implementované podľa ISO/IEC 18004:
//   GF(256) s primitívnym polynómom 0x11D, Reed-Solomon, blokové prekladanie,
//   8 masiek s vyhodnotením pokút, BCH formátové informácie.
// Overené testami (lib/qr.test.js) proti publikovaným vektorom.
// ============================================================================
(function () {
  // ── GF(256) ───────────────────────────────────────────────────────────────
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /** Generátorový polynóm stupňa `deg`. */
  function rsGenerator(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                      // násobenie x
        next[j + 1] ^= gmul(poly[j], EXP[i]);    // násobenie α^i
      }
      poly = next;
    }
    return poly;
  }

  /** Reed-Solomon: vráti `ecLen` opravných kódových slov pre `data`. */
  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const byte of data) {
      const factor = byte ^ res[0];
      res.shift(); res.push(0);
      if (factor !== 0) for (let i = 0; i < gen.length - 1; i++) res[i] ^= gmul(gen[i + 1], factor);
    }
    return res;
  }

  // ── Kapacitné tabuľky (verzie 1–20, úrovne L/M/Q/H) ───────────────────────
  // [celkovo kódových slov, EC slov na blok, počet blokov skupiny1, počet blokov skupiny2]
  const EC_TABLE = {
    L: [[26,7,1,0],[44,10,1,0],[70,15,1,0],[100,20,1,0],[134,26,1,0],[172,18,2,0],[196,20,2,0],[242,24,2,0],[292,30,2,0],[346,18,2,2],
        [404,20,4,0],[466,24,2,2],[532,26,4,0],[581,30,3,1],[655,22,5,1],[733,24,5,1],[815,28,1,5],[901,30,5,1],[991,28,3,4],[1085,28,3,5]],
    M: [[26,10,1,0],[44,16,1,0],[70,26,1,0],[100,18,2,0],[134,24,2,0],[172,16,4,0],[196,18,4,0],[242,22,2,2],[292,22,3,2],[346,26,4,1],
        [404,30,1,4],[466,22,6,2],[532,22,8,1],[581,24,4,5],[655,24,5,5],[733,28,7,3],[815,28,10,1],[901,26,9,4],[991,26,3,11],[1085,26,3,13]],
    Q: [[26,13,1,0],[44,22,1,0],[70,18,2,0],[100,26,2,0],[134,18,2,2],[172,24,4,0],[196,18,2,4],[242,22,4,2],[292,20,4,4],[346,24,6,2],
        [404,28,4,4],[466,26,4,6],[532,24,8,4],[581,20,11,5],[655,30,5,7],[733,24,15,2],[815,28,1,15],[901,28,17,1],[991,26,17,4],[1085,30,15,5]],
    H: [[26,17,1,0],[44,28,1,0],[70,22,2,0],[100,16,4,0],[134,22,2,2],[172,28,4,0],[196,26,4,1],[242,26,4,2],[292,24,4,4],[346,28,6,2],
        [404,24,3,8],[466,28,7,4],[532,22,12,4],[581,24,11,5],[655,24,11,7],[733,30,3,13],[815,28,2,17],[901,28,2,19],[991,26,9,16],[1085,28,15,10]],
  };
  const ALIGN = [[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
    [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90]];

  const size = (v) => v * 4 + 17;

  /** Počet dátových kódových slov pre verziu a úroveň. */
  function dataCapacity(v, ec) {
    const [total, ecPerBlock, g1, g2] = EC_TABLE[ec][v - 1];
    return total - ecPerBlock * (g1 + g2);
  }

  /** Najmenšia verzia, do ktorej sa zmestí `len` bajtov v byte mode. */
  function pickVersion(len, ec) {
    for (let v = 1; v <= 20; v++) {
      const bits = 4 + (v < 10 ? 8 : 16) + len * 8;
      if (bits <= dataCapacity(v, ec) * 8) return v;
    }
    throw new Error('Reťazec je príliš dlhý pre QR do verzie 20');
  }

  // ── Kódovanie dát ─────────────────────────────────────────────────────────
  function encodeData(bytes, v, ec) {
    const cap = dataCapacity(v, ec);
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);                       // byte mode
    push(bytes.length, v < 10 ? 8 : 16);   // dĺžka
    for (const b of bytes) push(b, 8);
    // ukončovač + zarovnanie na bajt
    for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    // výplňové bajty
    const pad = [0xEC, 0x11];
    let pi = 0;
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0; for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      out.push(byte);
    }
    while (out.length < cap) out.push(pad[pi++ % 2]);
    return out;
  }

  /** Rozdelenie do blokov, RS a prekladanie. */
  function interleave(dataCw, v, ec) {
    const [, ecPerBlock, g1, g2] = EC_TABLE[ec][v - 1];
    const nBlocks = g1 + g2;
    const shortLen = Math.floor(dataCw.length / nBlocks);
    const blocks = [], eccs = [];
    let pos = 0;
    for (let i = 0; i < nBlocks; i++) {
      const len = i < g1 ? shortLen : shortLen + 1;
      const blk = dataCw.slice(pos, pos + len); pos += len;
      blocks.push(blk); eccs.push(rsEncode(blk, ecPerBlock));
    }
    const out = [];
    const maxLen = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecPerBlock; i++) for (const e of eccs) out.push(e[i]);
    return out;
  }

  // ── Matica ────────────────────────────────────────────────────────────────
  function buildMatrix(v) {
    const n = size(v);
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    const res = Array.from({ length: n }, () => new Array(n).fill(false)); // rezervované
    const setF = (r, c, val) => { if (r >= 0 && r < n && c >= 0 && c < n) { m[r][c] = val; res[r][c] = true; } };

    // vyhľadávacie vzory + oddeľovače
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const on = inner && ((r === 0 || r === 6 || c === 0 || c === 6) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setF(r0 + r, c0 + c, !!on);
      }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

    // časovacie vzory
    for (let i = 8; i < n - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }

    // zarovnávacie vzory
    const centers = ALIGN[v];
    for (const r of centers) for (const c of centers) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }

    // tmavý modul + rezervácia pre formátové info
    setF(n - 8, 8, true);
    for (let i = 0; i < 9; i++) { if (m[8][i] === null) setF(8, i, false); if (m[i][8] === null) setF(i, 8, false); }
    for (let i = 0; i < 8; i++) { if (m[8][n - 1 - i] === null) setF(8, n - 1 - i, false); if (m[n - 1 - i][8] === null) setF(n - 1 - i, 8, false); }

    // rezervácia pre verziu (v >= 7)
    if (v >= 7) {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
        setF(n - 11 + j, i, false); setF(i, n - 11 + j, false);
      }
    }
    return { m, res, n };
  }

  function placeData(m, res, n, codewords) {
    let bitIdx = 0;
    const total = codewords.length * 8;
    const bitAt = (i) => i < total ? (codewords[i >> 3] >> (7 - (i & 7))) & 1 : 0;
    let up = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--; // preskoč časovací stĺpec
      for (let k = 0; k < n; k++) {
        const row = up ? n - 1 - k : k;
        for (const c of [col, col - 1]) {
          if (res[row][c]) continue;
          m[row][c] = bitAt(bitIdx++) === 1;
        }
      }
      up = !up;
    }
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  /** Formátové info (BCH 15,5) pre úroveň a masku. */
  function formatBits(ec, mask) {
    const ECI = { L: 1, M: 0, Q: 3, H: 2 };
    let data = (ECI[ec] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) ? 0x537 : 0);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /** Informácia o verzii (BCH 18,6) pre v >= 7. */
  function versionBits(v) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >> 11) & 1) ? 0x1F25 : 0);
    return (v << 12) | rem;
  }

  function applyFormat(m, n, ec, mask) {
    const bits = formatBits(ec, mask);
    const bit = (i) => ((bits >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
    m[8][7] = bit(6); m[8][8] = bit(7); m[7][8] = bit(8);
    for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
    for (let i = 0; i <= 7; i++) m[n - 1 - i][8] = bit(i);
    for (let i = 8; i <= 14; i++) m[8][n - 15 + i] = bit(i);
    m[n - 8][8] = true;
  }

  function applyVersion(m, n, v) {
    if (v < 7) return;
    const bits = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >> i) & 1) === 1;
      const r = Math.floor(i / 3), c = i % 3;
      m[n - 11 + c][r] = on; m[r][n - 11 + c] = on;
    }
  }

  /** Pokuta za vzory (ISO 18004, 4 pravidlá). */
  function penalty(m, n) {
    let p = 0;
    // 1) sekvencie rovnakej farby
    for (let i = 0; i < n; i++) {
      for (const line of [m[i], m.map(r => r[i])]) {
        let run = 1;
        for (let j = 1; j < n; j++) {
          if (line[j] === line[j - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
      }
    }
    // 2) bloky 2×2
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const a = m[r][c];
      if (a === m[r][c + 1] && a === m[r + 1][c] && a === m[r + 1][c + 1]) p += 3;
    }
    // 3) vzor 1:1:3:1:1
    const PAT = [true, false, true, true, true, false, true];
    const hasPat = (line, i) => {
      for (let k = 0; k < 7; k++) if (line[i + k] !== PAT[k]) return false;
      const before = line.slice(Math.max(0, i - 4), i);
      const after = line.slice(i + 7, i + 11);
      const quiet = (arr) => arr.length === 0 || arr.every(x => x === false);
      return quiet(before) || quiet(after);
    };
    for (let i = 0; i < n; i++) {
      const row = m[i], col = m.map(r => r[i]);
      for (let j = 0; j + 7 <= n; j++) { if (hasPat(row, j)) p += 40; if (hasPat(col, j)) p += 40; }
    }
    // 4) pomer tmavých modulov
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
    const pct = (dark * 100) / (n * n);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  /**
   * Vytvorí QR maticu pre text.
   * @returns {{ modules: boolean[][], size: number, version: number }}
   */
  function encode(text, ec = 'M') {
    const bytes = Array.from(new TextEncoder().encode(text));
    const v = pickVersion(bytes.length, ec);
    const dataCw = encodeData(bytes, v, ec);
    const all = interleave(dataCw, v, ec);

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const { m, res, n } = buildMatrix(v);
      placeData(m, res, n, all);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!res[r][c] && MASKS[mask](r, c)) m[r][c] = !m[r][c];
      }
      applyFormat(m, n, ec, mask);
      applyVersion(m, n, v);
      const p = penalty(m, n);
      if (!best || p < best.p) best = { p, m, n };
    }
    return { modules: best.m.map(r => r.map(x => !!x)), size: best.n, version: v };
  }

  /** Vykreslí QR ako SVG. */
  function svg(text, { ec = 'M', px = 128, quiet = 4 } = {}) {
    const { modules, size: n } = encode(text, ec);
    const total = n + quiet * 2;
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (modules[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">
<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#0A1B3D"/></svg>`;
  }

  /**
   * SEPA Credit Transfer (EPC069-12) — reťazec pre QR platbu.
   * Podporujú ho slovenské aj nemecké bankové aplikácie.
   */
  function sepaPayload({ name, iban, amount, currency = 'EUR', reference, note, bic }) {
    const amt = `${currency}${Number(amount || 0).toFixed(2)}`;
    return [
      'BCD', '002', '1', 'SCT',
      bic || '',
      String(name || '').slice(0, 70),
      String(iban || '').replace(/\s/g, ''),
      amt,
      '',                                  // účel (nepovinné)
      String(reference || '').slice(0, 35), // štruktúrovaná referencia
      String(note || '').slice(0, 140),     // nešktrukturovaná poznámka
      '',
    ].join('\n');
  }

  const API = { encode, svg, sepaPayload, rsEncode, rsGenerator, formatBits, versionBits, pickVersion, dataCapacity };
  window.DanubraQR = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
