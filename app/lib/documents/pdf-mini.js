// ============================================================================
// DANUBRA — malý zapisovač PDF (len server, bez cudzej knižnice)
// ============================================================================
// Prezentácia k e-mailu oslovenia vzniká na serveri v chvíli odoslania.
// Appka doteraz robila PDF v prehliadači (html2pdf — obrázok strany, ~1 MB
// knižnica, len v okne dokumentu). Na serveri nič také nemáme a ťahať kvôli
// štyrom stranám knižnicu (pdfkit, pdf-lib — stovky kB a ich závislosti) by
// bolo proti pravidlu „bez cudzích závislostí".
//
// Toto vie len to, čo prezentácia potrebuje — a robí to poriadne:
//   * vektorový text (dá sa označiť, vyhľadať, je ostrý pri tlači),
//   * písmo Helvetica zo štandardných 14 písem PDF (nevkladá sa → súbor má
//     ~20 kB) s nemeckými aj slovenskými znakmi (ä ö ü ß, č š ž ľ ť ň …
//     cez vlastné kódovanie /Differences),
//   * šírky znakov podľa metrík Helvetica (zalamovanie riadkov sedí),
//   * obdĺžniky aj zaoblené, kruhy, čiary, znak punds ako krivky,
//   * priehľadnosť (vodoznak), klikateľné odkazy, metadáta, jazyk dokumentu,
//   * obsah strán skomprimovaný (zlib, je v Node).
//
// Súradnice sú v bodoch (1 pt = 1/72 palca) s počiatkom VĽAVO HORE — ako
// v HTML; prevod na súradnice PDF (zdola) robí knižnica.
//
// Testy: node app/lib/documents/pdf-mini.test.js
// ============================================================================
'use strict';

let zlib = null;
try { zlib = require('zlib'); } catch (e) { zlib = null; }

const A4_LANDSCAPE = { w: 841.89, h: 595.28 };
const A4 = { w: 595.28, h: 841.89 };

// ── Metriky Helvetica (Adobe AFM) ─────────────────────────────────────────
const rep = (v, n) => Array(n).fill(v);
const ASCII_R = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...rep(556, 10), 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556,
  500, 722, 500, 500, 500, 334, 260, 334, 584];
const ASCII_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...rep(556, 10), 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611,
  556, 778, 556, 556, 500, 389, 280, 389, 584];
const LATIN_R = [278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333,
  365, 556, 834, 834, 834, 611, ...rep(667, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4), 722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667,
  667, 611, ...rep(556, 6), 889, 500, ...rep(556, 4), ...rep(278, 4), 556, 556, ...rep(556, 5), 584, 611, ...rep(556, 4), 500, 556, 500];
const LATIN_B = [278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333,
  365, 556, 834, 834, 834, 611, ...rep(722, 6), 1000, 722, ...rep(667, 4), ...rep(278, 4), 722, 722, ...rep(778, 5), 584, 778, ...rep(722, 4), 667,
  667, 611, ...rep(556, 6), 889, 556, ...rep(556, 4), ...rep(278, 4), 611, 611, ...rep(611, 5), 584, 611, ...rep(611, 4), 556, 611, 556];
/** Znaky mimo Latin-1 na kódoch 128–159: [znak, meno glyfu, šírka R, šírka B]. */
const EXTRA = [['Č', 'Ccaron', 722, 722], ['č', 'ccaron', 500, 556], ['Ď', 'Dcaron', 722, 722], ['ď', 'dcaron', 643, 743],
  ['Ě', 'Ecaron', 667, 667], ['ě', 'ecaron', 556, 556], ['Ľ', 'Lcaron', 556, 611], ['ľ', 'lcaron', 299, 400], ['Ĺ', 'Lacute', 556, 611],
  ['ĺ', 'lacute', 222, 278], ['Ň', 'Ncaron', 722, 722], ['ň', 'ncaron', 556, 611], ['Ŕ', 'Racute', 722, 722], ['ŕ', 'racute', 333, 389],
  ['Ř', 'Rcaron', 722, 722], ['ř', 'rcaron', 333, 389], ['Š', 'Scaron', 667, 667], ['š', 'scaron', 500, 556], ['Ť', 'Tcaron', 611, 611],
  ['ť', 'tcaron', 316, 389], ['Ž', 'Zcaron', 611, 611], ['ž', 'zcaron', 500, 500], ['Ů', 'Uring', 722, 722], ['ů', 'uring', 556, 611],
  ['–', 'endash', 556, 556], ['—', 'emdash', 1000, 1000], ['„', 'quotedblbase', 333, 500], ['“', 'quotedblleft', 333, 500],
  ['”', 'quotedblright', 333, 500], ['‘', 'quoteleft', 222, 278], ['’', 'quoteright', 222, 278], ['•', 'bullet', 350, 350]];
const CODE = new Map(EXTRA.map((e, i) => [e[0], 128 + i]));
/** Čo sa nedá zakódovať, nahradí sa — nikdy prázdny štvorček. */
const SUBST = { '…': '...', '€': 'EUR', '→': '->', ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '‑': '-' };

function widthsOf(bold) {
  const w = [];
  for (let c = 32; c <= 255; c++) {
    if (c <= 126) w.push((bold ? ASCII_B : ASCII_R)[c - 32]);
    else if (c >= 128 && c <= 159) w.push(EXTRA[c - 128] ? EXTRA[c - 128][bold ? 3 : 2] : 0);
    else if (c >= 160) w.push((bold ? LATIN_B : LATIN_R)[c - 160]);
    else w.push(0);
  }
  return w;
}
const W = { R: widthsOf(false), B: widthsOf(true) };

/** Text → bajty v našom kódovaní. */
function encode(str) {
  const out = [];
  for (const ch0 of String(str == null ? '' : str).normalize('NFC')) {
    const sub = SUBST[ch0];
    for (const ch of sub != null ? sub : ch0) {
      const cp = ch.codePointAt(0);
      if (cp >= 32 && cp <= 126) out.push(cp);
      else if (cp >= 160 && cp <= 255) out.push(cp);
      else if (CODE.has(ch)) out.push(CODE.get(ch));
      else {
        // Diakritika, ktorú nepoznáme (napr. ő), bez mäkčeňa; inak otáznik.
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const b = base.codePointAt(0);
        out.push(base && b >= 32 && b <= 126 ? b : 63);
      }
    }
  }
  return out;
}

function measure(str, size, font = 'R', cs = 0) {
  const codes = encode(str);
  const w = W[font === 'B' ? 'B' : 'R'];
  return codes.reduce((a, c) => a + (w[c - 32] || 0), 0) * size / 1000 + cs * codes.length;
}

/** Zalomí text do šírky; \n je nový riadok. Príliš dlhé slovo sa rozdelí. */
function wrap(str, size, font, width, cs = 0) {
  const lines = [];
  for (const para of String(str == null ? '' : str).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const t = line ? `${line} ${word}` : word;
      if (measure(t, size, font, cs) <= width || !line) {
        if (!line && measure(word, size, font, cs) > width) {
          let part = '';
          for (const ch of word) {
            if (measure(part + ch, size, font, cs) > width && part) { lines.push(part); part = ch; } else part += ch;
          }
          line = part;
        } else line = t;
      } else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

// ── Farby a čísla ─────────────────────────────────────────────────────────
const n = (v) => (Math.round(v * 100) / 100).toString();
function rgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map(i => n(parseInt(f.slice(i, i + 2), 16) / 255)).join(' ');
}
const pdfStr = (s) => `(${String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;
/** Text do metadát (Info) — UTF-16BE s BOM, aby ostala diakritika. */
function pdfText(s) {
  const str = String(s == null ? '' : s);
  const b = Buffer.alloc(2 + str.length * 2);
  b.writeUInt16BE(0xfeff, 0);
  for (let i = 0; i < str.length; i++) b.writeUInt16BE(str.charCodeAt(i), 2 + i * 2);
  return `<${b.toString('hex')}>`;
}
const K = 0.5523;   // kontrolný bod Bézierovej krivky pre štvrťkruh

class Page {
  constructor(doc) { this.doc = doc; this.ops = []; this.links = []; this.usesAlpha = new Set(); }
  get H() { return this.doc.h; }
  _y(y) { return n(this.H - y); }

  /** Obdĺžnik; r = zaoblenie rohov. */
  rect(x, y, w, h, { fill = null, stroke = null, lw = 1, r = 0, alpha = 1 } = {}) {
    this._style(fill, stroke, lw, alpha);
    if (r > 0) {
      const rr = Math.min(r, w / 2, h / 2), k = rr * K;
      const X = x, Y = y;
      this._m(X + rr, Y); this._l(X + w - rr, Y); this._c(X + w - rr + k, Y, X + w, Y + rr - k, X + w, Y + rr);
      this._l(X + w, Y + h - rr); this._c(X + w, Y + h - rr + k, X + w - rr + k, Y + h, X + w - rr, Y + h);
      this._l(X + rr, Y + h); this._c(X + rr - k, Y + h, X, Y + h - rr + k, X, Y + h - rr);
      this._l(X, Y + rr); this._c(X, Y + rr - k, X + rr - k, Y, X + rr, Y);
      this.ops.push('h');
    } else this.ops.push(`${n(x)} ${n(this.H - y - h)} ${n(w)} ${n(h)} re`);
    this._paint(fill, stroke);
    return this;
  }

  circle(cx, cy, r, { fill = null, stroke = null, lw = 1, alpha = 1 } = {}) {
    this._style(fill, stroke, lw, alpha);
    const k = r * K;
    this._m(cx + r, cy); this._c(cx + r, cy + k, cx + k, cy + r, cx, cy + r); this._c(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    this._c(cx - r, cy - k, cx - k, cy - r, cx, cy - r); this._c(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    this.ops.push('h');
    this._paint(fill, stroke);
    return this;
  }

  line(x1, y1, x2, y2, { stroke = '#000', lw = 1, cap = 0, alpha = 1 } = {}) {
    this._style(null, stroke, lw, alpha);
    this.ops.push(`${cap} J`);
    this._m(x1, y1); this._l(x2, y2); this.ops.push('S', 'Q');
    return this;
  }

  /**
   * Znak punds (∩∪) — rovnaké krivky ako logo na webe (web/shared/brand.js),
   * viewBox 2.25 7.25 43.5 33.5. @param w šírka v bodoch
   */
  mark(x, y, w, { a = '#0E1626', b = '#F07F1A', alpha = 1 } = {}) {
    const s = w / 43.5;
    const P = (px, py) => [x + (px - 2.25) * s, y + (py - 7.25) * s];
    const k = 9 * K;
    const stroke = (col, pts) => {
      this._style(null, col, 7.5 * s, alpha);
      this.ops.push('1 J', '1 j');
      const [first, ...rest] = pts;
      this._m(...P(...first));
      for (const seg of rest) {
        if (seg.length === 2) this._l(...P(...seg));
        else this._c(...P(seg[0], seg[1]), ...P(seg[2], seg[3]), ...P(seg[4], seg[5]));
      }
      this.ops.push('S', 'Q');
    };
    const up = [[6, 34], [6, 20], [6, 20 - k, 15 - k, 11, 15, 11], [15 + k, 11, 24, 20 - k, 24, 20], [24, 28]];
    const down = [[24, 28 + k, 33 - k, 37, 33, 37], [33 + k, 37, 42, 28 + k, 42, 28], [42, 14]];
    // Jednofarebný (vodoznak): jedna súvislá čiara — pri priehľadnosti by sa
    // prekrytie dvoch čiar v strede ukázalo ako tmavší bod.
    if (a === b) stroke(a, [...up, ...down]);
    else { stroke(a, up); stroke(b, [[24, 28], ...down]); }
    return this;
  }

  /** Jeden riadok textu; y = účiara. align: left | right | center (k x). */
  text(str, x, y, { size = 11, font = 'R', color = '#000', cs = 0, align = 'left', alpha = 1 } = {}) {
    const s = String(str == null ? '' : str);
    if (!s) return 0;
    const w = measure(s, size, font, cs);
    const X = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const hex = Buffer.from(encode(s)).toString('hex');
    this.ops.push('q');
    if (alpha < 1) this.ops.push(`/${this.doc._alpha(alpha, this)} gs`);
    this.ops.push(`BT /${font === 'B' ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(color)} rg ${cs ? `${n(cs)} Tc ` : ''}${n(X)} ${this._y(y)} Td <${hex}> Tj ET`, 'Q');
    return w;
  }

  /**
   * Odsek zalomený do šírky. y = horný okraj prvého riadku.
   * @returns {number} y pod posledným riadkom
   */
  para(str, x, y, w, { size = 11, lead = 1.45, font = 'R', color = '#000', cs = 0, maxLines = 0, align = 'left' } = {}) {
    let lines = wrap(str, size, font, w, cs);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last && measure(`${last}...`, size, font, cs) > w) last = last.replace(/\s*\S+$/, '');
      lines[maxLines - 1] = `${last}...`;
    }
    const lh = size * lead;
    lines.forEach((l, i) => this.text(l, align === 'right' ? x + w : align === 'center' ? x + w / 2 : x, y + size * 0.93 + i * lh, { size, font, color, cs, align }));
    return y + lines.length * lh;
  }

  /** Klikateľná plocha s adresou (len http(s) a mailto/tel). */
  link(x, y, w, h, url) {
    if (/^(https?:\/\/|mailto:|tel:)/i.test(String(url || ''))) this.links.push({ x, y, w, h, url: String(url).slice(0, 500) });
    return this;
  }

  _m(x, y) { this.ops.push(`${n(x)} ${this._y(y)} m`); }
  _l(x, y) { this.ops.push(`${n(x)} ${this._y(y)} l`); }
  _c(x1, y1, x2, y2, x3, y3) { this.ops.push(`${n(x1)} ${this._y(y1)} ${n(x2)} ${this._y(y2)} ${n(x3)} ${this._y(y3)} c`); }
  _style(fill, stroke, lw, alpha) {
    this.ops.push('q');
    if (alpha < 1) this.ops.push(`/${this.doc._alpha(alpha, this)} gs`);
    if (fill) this.ops.push(`${rgb(fill)} rg`);
    if (stroke) this.ops.push(`${rgb(stroke)} RG`, `${n(lw)} w`);
  }
  _paint(fill, stroke) { this.ops.push(fill && stroke ? 'B' : fill ? 'f' : stroke ? 'S' : 'n', 'Q'); }
}

class Doc {
  constructor({ size = A4_LANDSCAPE, info = {}, lang = 'de-DE', compress = true } = {}) {
    this.w = size.w; this.h = size.h; this.info = info; this.lang = lang; this.pages = []; this.alphas = new Map();
    this.compress = compress && !!zlib;
  }
  page() { const p = new Page(this); this.pages.push(p); return p; }
  measure(s, size, font, cs) { return measure(s, size, font, cs); }
  wrap(s, size, font, w, cs) { return wrap(s, size, font, w, cs); }
  _alpha(a, page) {
    const key = n(a);
    if (!this.alphas.has(key)) this.alphas.set(key, `GA${this.alphas.size + 1}`);
    page.usesAlpha.add(key);
    return this.alphas.get(key);
  }

  /** @returns {Buffer} hotové PDF */
  toBuffer() {
    const objs = [];                      // [číslo] = Buffer obsahu objektu
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pages = add(null);
    const enc = `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${EXTRA.map(e => `/${e[1]}`).join(' ')}] >>`;
    const font = (name, w) => add(Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /FirstChar 32 /LastChar 255 /Widths [${w.join(' ')}] /Encoding ${enc} >>`));
    const f1 = font('Helvetica', W.R), f2 = font('Helvetica-Bold', W.B);
    const gs = [...this.alphas.entries()].map(([a, name]) => [name, add(Buffer.from(`<< /Type /ExtGState /ca ${a} /CA ${a} >>`))]);
    const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${gs.length ? ` /ExtGState << ${gs.map(([nm, id]) => `/${nm} ${id} 0 R`).join(' ')} >>` : ''} >>`;
    const kids = [];
    for (const p of this.pages) {
      const raw = Buffer.from(p.ops.join('\n'), 'latin1');
      const data = this.compress ? zlib.deflateSync(raw, { level: 9 }) : raw;
      const content = add(Buffer.concat([Buffer.from(`<< /Length ${data.length}${this.compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), data, Buffer.from('\nendstream')]));
      const annots = p.links.map(l => add(Buffer.from(`<< /Type /Annot /Subtype /Link /Border [0 0 0] /Rect [${n(l.x)} ${n(this.h - l.y - l.h)} ${n(l.x + l.w)} ${n(this.h - l.y)}] /A << /S /URI /URI ${pdfStr(l.url)} >> >>`)));
      kids.push(add(Buffer.from(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources ${res} /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map(a => `${a} 0 R`).join(' ')}]` : ''} >>`)));
    }
    objs[pages - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
    objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pages} 0 R /Lang ${pdfStr(this.lang)} /ViewerPreferences << /DisplayDocTitle true >> >>`);
    const d = new Date(this.info.date || Date.now());
    const p2 = (x) => String(x).padStart(2, '0');
    const when = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
    const info = add(Buffer.from(`<< ${['Title', 'Author', 'Subject', 'Keywords'].filter(k => this.info[k.toLowerCase()]).map(k => `/${k} ${pdfText(this.info[k.toLowerCase()])}`).join(' ')} /Creator (DANUBRA Hub) /Producer (DANUBRA pdf-mini) /CreationDate (${when}) >>`));

    const parts = [Buffer.from('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let pos = parts[0].length;
    const offsets = [];
    objs.forEach((body, i) => {
      offsets.push(pos);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
      parts.push(chunk); pos += chunk.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
      + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(xref));
    return Buffer.concat(parts);
  }
}

module.exports = { Doc, Page, A4, A4_LANDSCAPE, measure, wrap, encode, rgb, EXTRA };
