// ============================================================================
// DANUBRA — logo a náhľad webu firmy z jej úvodnej stránky (čistá logika)
// ============================================================================
// „Nevidím favicony ani logá, nič. Obnovte prosím aj staré dáta."
//
// Pri každom stiahnutí úvodnej stránky firmy (hľadanie podľa webov,
// „Obnoviť logá a náhľady") sa z <head> vytiahne:
//   logo_url          <link rel="apple-touch-icon" | "icon" …> — najväčšia
//                     ikona (apple-touch-icon bez `sizes` = 180 px)
//   og_image          og:image / og:image:secure_url / twitter:image
//   site_title        og:title, inak og:site_name, inak <title>
//   site_description  og:description, inak <meta name="description">
//   site_embeddable   smie sa web ukázať v <iframe>? Rozhodujú hlavičky
//                     X-Frame-Options a Content-Security-Policy
//                     (frame-ancestors) — v prehliadači sa to spoľahlivo
//                     zistiť nedá, preto to zistí server.
//
// Adresy: vždy absolútne a len https (http:// sa prepíše na https://,
// inak by ich prehliadač v appke na https zablokoval), žiadne data:,
// javascript: ani iné schémy, najviac 500 znakov. Texty bez HTML, najviac
// 200 (titulok) a 400 (popis) znakov.
//
// Nič sa tu nesťahuje — stiahnutie robí server (danubra-leads-sitemeta-
// background, danubra-leads-from-urls-background) s ochranou proti SSRF.
//
// Testy: node app/lib/marketing/sitemeta.test.js
// ============================================================================
(function () {
  const URL_MAX = 500, TITLE_MAX = 200, DESC_MAX = 400;
  /** Stĺpce z migrácie 082 (danubra_leads). */
  const COLUMNS = ['logo_url', 'og_image', 'site_title', 'site_description', 'site_embeddable', 'site_checked_at'];

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', copy: '©', reg: '®', laquo: '«', raquo: '»',
    bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•', trade: '™' };
  function decode(s) {
    return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
    });
  }
  /** Text bez značiek a nadbytočných medzier, skrátený na `max` znakov (po slovách). */
  function cleanText(s, max) {
    let t = decode(String(s == null ? '' : s).replace(/<[^>]*>/g, ' ')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > max) {
      t = t.slice(0, max - 1);
      const sp = t.lastIndexOf(' ');
      t = `${(sp > max * 0.6 ? t.slice(0, sp) : t).replace(/[\s,.;:–-]+$/, '')}…`;
    }
    return t;
  }

  /**
   * Absolútna https adresa z `href` (relatívnej k `base`), alebo null.
   * data:, javascript:, mailto:, ftp: a pod. sa odmietnu.
   */
  function absUrl(href, base) {
    const h = decode(String(href == null ? '' : href)).trim();
    if (!h || h.length > 2000 || /^(data|javascript|vbscript|blob|file|mailto|tel|about):/i.test(h)) return null;
    let u;
    try { u = base ? new URL(h, base) : new URL(h); } catch (e) { return null; }
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    const out = u.href;
    return out.length > URL_MAX ? null : out;
  }

  /** Atribúty jednej značky: { name: value } (malými písmenami). */
  function attrs(tag) {
    const out = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(tag))) {
      const k = m[1].toLowerCase();
      if (!(k in out)) out[k] = m[3] != null ? m[3] : m[4] != null ? m[4] : m[5];
    }
    return out;
  }

  /** Len <head> (alebo prvých 300 kB) — v tele by mohli byť ikony cudzích firiem. */
  function headOf(html) {
    const s = String(html || '').slice(0, 300000);
    const i = s.search(/<\/head\s*>/i);
    return i > 0 ? s.slice(0, i) : s;
  }

  /** Veľkosť ikony v px z `sizes` ("32x32 64x64" → 64, "any" → 512). */
  function iconSize(a) {
    const s = String(a.sizes || '').toLowerCase();
    const rel = String(a.rel || '').toLowerCase();
    if (s === 'any') return 512;
    const n = Math.max(0, ...[...s.matchAll(/(\d+)\s*x\s*(\d+)/g)].map(m => Math.min(Number(m[1]), Number(m[2]))));
    if (n) return n;
    if (/apple-touch-icon/.test(rel)) return 180;
    if (/svg/i.test(a.type || '') || /\.svg(\?|$)/i.test(a.href || '')) return 256;
    return 16;
  }

  /** Ikony z <link rel=…icon…>, najväčšia prvá. Maska Safari (jednofarebná) sa neberie. */
  function icons(html, base) {
    const out = [];
    for (const m of headOf(html).matchAll(/<link\b[^>]*>/gi)) {
      const a = attrs(m[0]);
      const rel = String(a.rel || '').toLowerCase();
      if (!/(^|\s)(icon|shortcut|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel) || /mask-icon/.test(rel)) continue;
      const url = absUrl(a.href, base);
      if (!url) continue;
      out.push({ url, size: iconSize(a), apple: /apple-touch-icon/.test(rel) });
    }
    return out.sort((x, y) => y.size - x.size || (y.apple ? 1 : 0) - (x.apple ? 1 : 0));
  }

  /** Hodnoty <meta> podľa property / name (malými písmenami). */
  function metas(html) {
    const out = {};
    for (const m of headOf(html).matchAll(/<meta\b[^>]*>/gi)) {
      const a = attrs(m[0]);
      const k = String(a.property || a.name || a.itemprop || '').toLowerCase().trim();
      if (!k || a.content == null || k in out) continue;
      out[k] = a.content;
    }
    return out;
  }

  function titleOf(html) {
    const m = headOf(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1] : '';
  }

  /** Hlavička ako reťazec (fetch Headers, objekt Node, pole pri viacerých). */
  function header(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return String(headers.get(name) || '');
    const k = Object.keys(headers).find(x => x.toLowerCase() === name.toLowerCase());
    const v = k ? headers[k] : '';
    return Array.isArray(v) ? v.join(', ') : String(v || '');
  }

  /**
   * Smie sa stránka ukázať v <iframe> appky? X-Frame-Options (DENY,
   * SAMEORIGIN, ALLOW-FROM) = nie. CSP frame-ancestors bez `*` = nie.
   * Bez hlavičiek = áno. Bez odpovede (null) = nevieme.
   */
  function embeddable(headers) {
    if (headers == null) return null;
    const xfo = header(headers, 'x-frame-options').trim().toLowerCase();
    if (xfo && /deny|sameorigin|allow-from/.test(xfo)) return false;
    const csp = header(headers, 'content-security-policy');
    for (const part of csp.split(/[;,]/)) {
      const p = part.trim().toLowerCase();
      if (!p.startsWith('frame-ancestors')) continue;
      const src = p.slice('frame-ancestors'.length).trim().split(/\s+/).filter(Boolean);
      if (!src.some(x => x === '*' || x === 'https:' || x === 'https://*')) return false;
    }
    return true;
  }

  /**
   * Všetko naraz z úvodnej stránky.
   * @param {string} html
   * @param {string} baseUrl  konečná adresa stránky (po presmerovaní)
   * @param {object} [headers] hlavičky odpovede (na site_embeddable)
   */
  function extract(html, baseUrl, headers) {
    const m = metas(html);
    const ic = icons(html, baseUrl);
    const og = absUrl(m['og:image:secure_url'] || m['og:image'] || m['og:image:url'] || m['twitter:image'] || m['twitter:image:src'], baseUrl);
    const title = cleanText(m['og:title'] || m['og:site_name'] || titleOf(html), TITLE_MAX);
    const desc = cleanText(m['og:description'] || m.description || m['twitter:description'], DESC_MAX);
    return {
      logo_url: ic.length ? ic[0].url : null,
      og_image: og,
      site_title: title || null,
      site_description: desc || null,
      site_embeddable: headers === undefined ? null : embeddable(headers),
    };
  }

  /** Riadok do danubra_leads (082). Bez stránky sa zapíše aspoň čas pokusu. */
  function leadPatch(meta, now = new Date()) {
    const at = (now instanceof Date ? now : new Date(now)).toISOString();
    if (!meta) return { site_checked_at: at };
    const p = { site_checked_at: at };
    for (const k of ['logo_url', 'og_image', 'site_title', 'site_description', 'site_embeddable']) p[k] = meta[k] == null ? null : meta[k];
    return p;
  }

  /** Riadok bez stĺpcov 082 (databáza bez migrácie). */
  function without082(row) {
    const r = { ...(row || {}) };
    for (const k of COLUMNS) delete r[k];
    return r;
  }
  /** Chyba databázy = chýba niektorý stĺpec z 082? */
  function missing082(error) {
    const t = String((error && (error.message || error.details || error.hint)) || error || '');
    return /column|schema cache/i.test(t) && COLUMNS.some(c => t.includes(c));
  }

  const API = { COLUMNS, URL_MAX, TITLE_MAX, DESC_MAX, decode, cleanText, absUrl, attrs, icons, metas, titleOf, header,
    embeddable, extract, leadPatch, without082, missing082 };
  if (typeof window !== 'undefined') window.DanubraSiteMeta = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
