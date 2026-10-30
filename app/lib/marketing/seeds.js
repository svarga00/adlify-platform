// ============================================================================
// DANUBRA — marketing: nové firmy podľa webov zadaných firiem
// ============================================================================
// „Zadám 3-5-10 URL adries firiem a nájdeš mi podobné, uložíme ich do
// databázy a budeme ich po jednom oslovovať e-mailom…"
//
// Hľadá server (`danubra-leads-from-urls-background`). Tu sú čisté pravidlá,
// ktoré sa dajú otestovať bez siete:
//
//   adresy       zadané adresy → URL a doména, duplicity, 3 až 10 adries
//   SSRF         server sťahuje cudzie stránky — nesmie sa dať nasmerovať
//                na localhost, súkromnú sieť ani metadáta cloudu
//   stránka      HTML → text, odkazy na Impressum/Kontakt
//   Impressum    e-mail (aj „info [at] firma [dot] de"), telefón, USt-IdNr,
//                Geschäftsführer, adresa a PSČ — regexom, nie odhadom AI
//   e-mail       len z webu firmy; firemný (info@, kontakt@, büro@) pred
//                osobným; e-mail cudzej domény (webdizajnér v Impressum) nie
//   duplicity    podľa domény a mena + mesta, odhlásené adresy von
//   skóre        0–100, zoradenie
//
// Testy: node app/lib/marketing/seeds.test.js
// ============================================================================
(function () {
  const MIN_SEEDS = 3;
  const MAX_SEEDS = 10;
  const COUNTS = [10, 20, 30, 50];

  const clean = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

  // ── Domény ──────────────────────────────────────────────────────────────
  /** Prípony, pri ktorých je „doména firmy" o úroveň dlhšia (firma.co.at). */
  const SECOND_LEVEL = new Set(['co.uk', 'org.uk', 'ac.uk', 'co.at', 'or.at', 'gv.at', 'com.pl', 'com.tr',
    'co.jp', 'com.au', 'co.nz', 'com.br', 'co.za', 'com.cn', 'com.hr', 'com.ua']);

  /** Bezplatné schránky — malý remeselník často píše z t-online.de. */
  const FREEMAIL = new Set(['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'web.de', 't-online.de', 'gmail.com',
    'googlemail.com', 'yahoo.de', 'yahoo.com', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de',
    'live.de', 'live.com', 'freenet.de', 'arcor.de', 'online.de', 'aol.com', 'aol.de', 'icloud.com',
    'me.com', 'posteo.de', 'mail.de', 'email.de', 'kabelmail.de', 'vodafone.de', 'ewetel.net', 'mailbox.org']);

  /** Host bez „www." (www2., m. nie — to už býva iný web). */
  function hostOf(x) {
    let s = clean(x).toLowerCase();
    if (!s) return '';
    if (s.includes('@') && !s.includes('://')) s = s.slice(s.lastIndexOf('@') + 1);
    else {
      try { s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `https://${s.replace(/^\/\//, '')}`).hostname; }
      catch (e) { return ''; }
    }
    s = s.replace(/\.$/, '').replace(/^www\d?\./, '');
    return /^[a-z0-9.-]+$/.test(s) && s.includes('.') ? s : '';
  }

  /** Doména firmy: „shop.mueller-bau.de" → „mueller-bau.de". Na porovnanie. */
  function baseDomain(x) {
    const h = hostOf(x);
    if (!h || isIp(h)) return h;
    const p = h.split('.');
    const n = p.length >= 3 && SECOND_LEVEL.has(p.slice(-2).join('.')) ? 3 : 2;
    return p.slice(-n).join('.');
  }

  const isFreemail = (domain) => FREEMAIL.has(baseDomain(domain));

  // ── SSRF: kam server nesmie ─────────────────────────────────────────────
  /**
   * IPv4 aj v podobách, ktoré prehliadač a `inet_aton` prijmú:
   * „2130706433", „0x7f.1", „0177.0.0.1" — všetko je 127.0.0.1.
   * @returns {number|null} 32-bitové číslo
   */
  function parseIPv4(s) {
    const str = String(s || '');
    if (!/^[0-9a-fx.]+$/i.test(str) || !/\d/.test(str)) return null;
    const parts = str.split('.');
    if (parts.length > 4 || parts.some(p => p === '')) return null;
    const nums = [];
    for (const p of parts) {
      let n;
      if (/^0x[0-9a-f]*$/i.test(p)) n = p.length > 2 ? parseInt(p.slice(2), 16) : 0;
      else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
      else if (/^(0|[1-9]\d*)$/.test(p)) n = parseInt(p, 10);
      else return null;
      if (!Number.isFinite(n)) return null;
      nums.push(n);
    }
    const last = nums.pop();
    if (nums.some(n => n > 255) || last >= 2 ** (8 * (4 - nums.length))) return null;
    let v = 0;
    nums.forEach((n, i) => { v += n * 2 ** (8 * (3 - i)); });
    return v + last;
  }

  /** IPv6 → 8 čísel (16 bitov), alebo null. */
  function parseIPv6(s) {
    let str = String(s || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
    if (!str.includes(':') || !/^[0-9a-f:.]+$/.test(str)) return null;
    let tail = [];
    const m = str.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (m) {
      const v4 = parseIPv4(m[2]);
      if (v4 == null || m[2].split('.').length !== 4) return null;
      tail = [Math.floor(v4 / 65536), v4 % 65536];
      str = m[1].endsWith('::') ? m[1] : m[1].slice(0, -1);
    }
    const halves = str.split('::');
    if (halves.length > 2) return null;
    const conv = (h) => (h ? h.split(':') : []).map(x => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
    const a = conv(halves[0]), b = halves.length === 2 ? conv(halves[1]) : [];
    if ([...a, ...b].some(Number.isNaN)) return null;
    const fill = 8 - a.length - b.length - tail.length;
    if (halves.length === 1 ? fill !== 0 : fill < 0) return null;
    return [...a, ...Array(halves.length === 2 ? fill : 0).fill(0), ...b, ...tail];
  }

  const isIp = (h) => parseIPv6(h) != null || (/^[0-9a-fx.]+$/i.test(h) && parseIPv4(h) != null);

  function privateV4(n) {
    const a = Math.floor(n / 16777216), b = Math.floor(n / 65536) % 256, c = Math.floor(n / 256) % 256;
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)          // CGNAT
      || (a === 169 && b === 254)                    // link-local, metadáta cloudu
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }

  /** Súkromná, lokálna alebo inak nedovolená adresa (IPv4 aj IPv6). */
  function isPrivateIp(ip) {
    const s = String(ip || '').trim();
    const v6 = parseIPv6(s);
    if (v6) {
      if (v6.every(x => x === 0)) return true;                                   // ::
      if (v6.slice(0, 7).every(x => x === 0) && v6[7] === 1) return true;        // ::1
      const embedded = (v6.slice(0, 5).every(x => x === 0) && (v6[5] === 0xffff || v6[5] === 0))  // ::ffff:a.b.c.d, ::a.b.c.d
        || (v6[0] === 0x64 && v6[1] === 0xff9b && v6.slice(2, 6).every(x => x === 0));         // NAT64
      if (embedded) return privateV4(v6[6] * 65536 + v6[7]);
      if ((v6[0] & 0xfe00) === 0xfc00) return true;   // fc00::/7
      if ((v6[0] & 0xffc0) === 0xfe80) return true;   // fe80::/10
      if ((v6[0] & 0xffc0) === 0xfec0) return true;   // fec0::/10 (starý site-local)
      if ((v6[0] & 0xff00) === 0xff00) return true;   // multicast
      if (v6[0] === 0x2001 && v6[1] === 0x0db8) return true;  // dokumentácia
      return false;
    }
    const v4 = parseIPv4(s);
    return v4 == null ? true : privateV4(v4);
  }

  const BAD_SUFFIX = ['.localhost', '.local', '.internal', '.lan', '.home', '.intranet', '.corp', '.home.arpa', '.localdomain', '.test', '.invalid', '.example'];

  /**
   * Smie server stiahnuť túto adresu? Kontroluje sa pred každým stiahnutím
   * aj pred každým presmerovaním. (Na serveri sa navyše kontroluje IP, na
   * ktorú sa meno preloží — `isPrivateIp` pri DNS.)
   * @returns {{ ok: boolean, reason?: string, url?: string, host?: string }}
   */
  function checkUrl(input) {
    let u;
    try { u = new URL(String(input || '')); } catch (e) { return { ok: false, reason: 'Neplatná adresa.' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'Len adresy http:// alebo https://.' };
    if (u.username || u.password) return { ok: false, reason: 'Adresa s menom a heslom sa nesťahuje.' };
    if (u.port && !['80', '443'].includes(u.port)) return { ok: false, reason: 'Len bežný port webu (80/443).' };
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return { ok: false, reason: 'Adresa bez domény.' };
    if (isIp(host)) {
      return isPrivateIp(host) ? { ok: false, reason: 'Lokálna alebo súkromná adresa.' }
        : { ok: false, reason: 'Zadajte doménu firmy, nie IP adresu.' };
    }
    if (host === 'localhost' || BAD_SUFFIX.some(x => host.endsWith(x))) return { ok: false, reason: 'Lokálna alebo súkromná adresa.' };
    const labels = host.split('.');
    if (labels.length < 2 || labels.some(l => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l) || /^-|-$/.test(l))) {
      return { ok: false, reason: 'Neplatná doména.' };
    }
    if (!/^([a-z]{2,24}|xn--[a-z0-9-]{2,20})$/.test(labels[labels.length - 1])) return { ok: false, reason: 'Neplatná doména.' };
    return { ok: true, url: u.href, host };
  }

  // ── Zadané adresy ───────────────────────────────────────────────────────
  /**
   * Jedna zadaná adresa → URL. „mueller-bau.de", „www.mueller-bau.de/",
   * „https://mueller-bau.de/leistungen#x" sú tá istá firma.
   * @returns {{ ok: true, url, domain, input } | { ok: false, input, error }}
   */
  function normUrl(input) {
    const raw = clean(input).replace(/^[<("'„“]+|[>)"'“”.,;:!?]+$/g, '');
    if (!raw) return { ok: false, input, error: 'Prázdna adresa.' };
    let s = raw;
    if (/^\/\//.test(s)) s = `https:${s}`;
    else if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return { ok: false, input: raw, error: 'Len adresy http:// alebo https://.' };
      s = `https://${s}`;
    }
    const c = checkUrl(s);
    if (!c.ok) return { ok: false, input: raw, error: c.reason };
    const u = new URL(c.url);
    u.hash = ''; u.search = '';
    const path = u.pathname.replace(/\/+$/, '');
    return { ok: true, input: raw, url: `${u.protocol}//${u.host}${path || '/'}`, domain: hostOf(u.hostname) };
  }

  /**
   * Text z poľa „jedna adresa na riadok" → zadané firmy.
   * Slová bez bodky (napr. „Trockenbau" za adresou) sa ticho preskočia.
   * @returns {{ ok: boolean, seeds: Array<{url, domain, input}>, invalid: Array<{input, error}>,
   *             duplicates: string[], error: string|null }}
   */
  function parseSeeds(text, { min = MIN_SEEDS, max = MAX_SEEDS } = {}) {
    const tokens = String(text || '').split(/[\s,;|]+/).map(t => t.trim()).filter(Boolean)
      .filter(t => t.includes('.') || t.includes('://') || t.includes(':'));
    const seeds = [], invalid = [], duplicates = [];
    const seen = new Set();
    for (const t of tokens) {
      const r = normUrl(t);
      if (!r.ok) { invalid.push({ input: r.input || t, error: r.error }); continue; }
      const key = baseDomain(r.domain);
      if (seen.has(key)) { duplicates.push(r.input); continue; }
      seen.add(key);
      seeds.push({ url: r.url, domain: r.domain, input: r.input });
    }
    let error = null;
    if (seeds.length < min) error = `Zadajte aspoň ${min} rôzne weby firiem (teraz ${seeds.length}).`;
    else if (seeds.length > max) error = `Najviac ${max} webov naraz (zadaných ${seeds.length}).`;
    return { ok: !error, seeds, invalid, duplicates, error };
  }

  /** Počet hľadaných firiem: 10 až 50, predvolene 20. */
  function clampCount(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v) || v <= 0) return 20;
    return Math.min(Math.max(v, 10), 50);
  }

  // ── HTML → text ─────────────────────────────────────────────────────────
  const ENT = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü',
    Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', aacute: 'á', copy: '©',
    reg: '®', ndash: '–', mdash: '—', bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚', lsquo: '‘',
    rsquo: '’', hellip: '…', middot: '·', bull: '•', euro: '€', sect: '§', shy: '', zwnj: '', zwj: '',
    commat: '@', period: '.', lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', colon: ':', sol: '/', vert: '|',
  };
  function decodeEntities(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return e in ENT ? ENT[e] : (e.toLowerCase() in ENT ? ENT[e.toLowerCase()] : m);
    });
  }

  /**
   * HTML → čitateľný text po riadkoch. Odkazy „mailto:" a „tel:" sa
   * vypíšu ako text — v Impressum býva e-mail často len v odkaze.
   */
  function htmlToText(html, { max = 60000 } = {}) {
    let s = String(html || '');
    s = s.replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head|select|canvas)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<a\b[^>]*?href\s*=\s*["']?\s*mailto:([^"'\s>?]+)[^>]*>/gi, (m, a) => {
        let e = a; try { e = decodeURIComponent(a); } catch (x) { /* nechá sa, ako je */ }
        return ` ${decodeEntities(e)} `;
      })
      .replace(/<a\b[^>]*?href\s*=\s*["']?\s*tel:([^"'>]+)[^>]*>/gi, (m, t) => `\nTel: ${decodeEntities(t)}\n`)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|ul|ol|tr|table|h[1-6]|section|article|footer|header|address|main|aside|nav|dl|dt|dd|blockquote|form|fieldset|figure|figcaption)\b[^>]*>/gi, '\n')
      .replace(/<\/(td|th)\s*>/gi, ' \n')
      .replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s).replace(/\r/g, '\n').replace(/[   \t]/g, ' ').replace(/[​-‍﻿­]/g, '');
    const lines = s.split('\n').map(l => l.replace(/ {2,}/g, ' ').trim()).filter(Boolean);
    const out = lines.join('\n');
    return out.length > max ? out.slice(0, max) : out;
  }

  /** Odkazy zo stránky: [{ url, text }] — len http/https, absolútne. */
  function links(html, base) {
    const out = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
    let m;
    while ((m = re.exec(String(html || ''))) && out.length < 2000) {
      const h = m[1].match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!h) continue;
      const href = decodeEntities((h[1] ?? h[2] ?? h[3] ?? '').trim());
      if (!href || /^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) continue;
      let u;
      try { u = new URL(href, base); } catch (e) { continue; }
      if (!['http:', 'https:'].includes(u.protocol)) continue;
      u.hash = '';
      const title = (m[1].match(/(?:title|aria-label)\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
      out.push({ url: u.href, text: clean(`${htmlToText(m[2], { max: 200 })} ${decodeEntities(title)}`) });
    }
    return out;
  }

  /**
   * Odkazy na Impressum / Kontakt / Über uns z úvodnej stránky, len na tom
   * istom webe, od najsľubnejšieho. Najviac `limit`.
   */
  function impressumLinks(html, base, { limit = 3 } = {}) {
    const dom = baseDomain(base);
    const rank = (l) => {
      const t = `${l.text} ${decodeURIComponent(l.url)}`.toLowerCase();
      if (/impressum|imprint|legal[-\s]?notice|anbieterkennzeichnung/.test(t)) return 3;
      if (/kontakt|contact/.test(t)) return 2;
      if (/über[-\s]?uns|ueber[-\s]?uns|uber[-\s]?uns|about|unternehmen|wir[-\s]über[-\s]uns/.test(t)) return 1;
      return 0;
    };
    const seen = new Set();
    return links(html, base)
      .filter(l => baseDomain(l.url) === dom)
      .map(l => ({ ...l, rank: rank(l) }))
      .filter(l => l.rank > 0 && !/\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(new URL(l.url).pathname))
      .sort((a, b) => b.rank - a.rank)
      .filter(l => { const k = l.url.replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, limit)
      .map(({ url, text, rank }) => ({ url, text, kind: rank === 3 ? 'impressum' : rank === 2 ? 'kontakt' : 'about' }));
  }

  /** Bežné adresy Impressum, keď na úvodnej stránke odkaz nie je. */
  function guessPages(url) {
    let o;
    try { o = new URL(url).origin; } catch (e) { return []; }
    return [`${o}/impressum`, `${o}/kontakt`];
  }

  /** Vyzerá text ako Impressum (alebo aspoň kontakt s údajmi o firme)? */
  function looksLikeImpressum(text) {
    return /impressum|angaben gem(ä|ae)(ß|ss)|§\s?5\s?(tmg|ddg)|handelsregister|registergericht|ust\.?-?\s?id|umsatzsteuer|gesch(ä|ae)ftsf(ü|ue)hr|inhaber|vertreten durch/i.test(String(text || ''));
  }

  // ── E-maily ─────────────────────────────────────────────────────────────
  /**
   * „info [at] firma [dot] de", „info(at)firma.de", „info at firma dot de",
   * „info{ät}firma[punkt]de" → „info@firma.de".
   */
  function deobfuscate(text) {
    return String(text || '')
      .replace(/\s*[[({<]\s*(?:at|ät|aet|@|klammeraffe)\s*[\])}>]\s*/gi, '@')
      .replace(/\s*[[({<]\s*(?:dot|punkt|pkt|\.)\s*[\])}>]\s*/gi, '.')
      .split('\n').map((line) => {
        // Bez zátvoriek („info at firma dot de") len na riadku s „Mail" alebo
        // „Kontakt" — inak by z vety „wir sind at home dot com" vznikla adresa.
        if (!/mail|kontakt|contact/i.test(line)) return line;
        return line
          .replace(/\b([a-z0-9._%+-]+)\s+(?:at|ät)\s+((?:[a-z0-9-]+\s+(?:dot|punkt)\s+)+[a-z]{2,24})\b/gi,
            (m, user, rest) => `${user}@${rest.replace(/\s+(?:dot|punkt)\s+/gi, '.')}`)
          .replace(/(@[a-z0-9.-]*[a-z0-9])\s+(?:dot|punkt)\s+(de|com|net|org|eu|info|at|ch|biz)\b/gi, '$1.$2');
      }).join('\n');
  }

  const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}/gi;
  const FAKE_DOMAIN = /(^|\.)(example\.(com|de|org|net)|domain\.(de|com)|ihre-?domain\.de|beispiel\.de|musterfirma\.de|mustermann\.de|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com|test\.de)$/;
  const FILE_TLD = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|css|js|json|pdf|woff2?|ttf|eot|mp4|webm)$/i;
  const FAKE_LOCAL = /^(name|vorname\.?nachname|max\.?mustermann|mustermann|ihr\.?name|email|e-?mail|user|your\.?name)$/i;

  /** Všetky e-maily v texte (po odstránení zahmlenia), malými, bez opakovania. */
  function extractEmails(text) {
    const out = [];
    for (const m of deobfuscate(text).matchAll(EMAIL_RE)) {
      const e = m[0].toLowerCase().replace(/\.+$/, '');
      const [local, dom] = e.split('@');
      if (!dom || FILE_TLD.test(e) || FAKE_DOMAIN.test(dom) || FAKE_LOCAL.test(local) || /\.\./.test(e)) continue;
      if (/^[0-9a-f]{16,}$/.test(local)) continue;   // sentry a podobné kľúče
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }

  /** Firemné schránky — tie sa oslovujú prednostne. */
  const GENERIC = /^(info|infos|kontakt|contact|office|buero|buro|bureau|büro|mail|email|e-mail|post|postfach|zentrale|anfrage|anfragen|service|verwaltung|team|hallo|hello|empfang|sekretariat|vertrieb|auftrag|auftraege|angebot|angebote|bau|baubuero|technik|planung|projekt|projekte|einkauf|kundenservice|disposition|dispo|firma|kanzlei|geschaeftsleitung|gl|admin)([._-]?[a-z]{0,12}\d{0,3})?$/;
  /** Schránky, kam ponuka nepatrí. */
  const NEVER = /^(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|hostmaster|abuse|webmaster|datenschutz|privacy|dsb|datenschutzbeauftragter|bewerbung|bewerbungen|jobs?|karriere|career|careers|ausbildung|presse|press|newsletter|unsubscribe|abmelden|rechnung|rechnungen|buchhaltung|invoice|billing)([._-].*)?$/;

  /** Druh adresy: „generic" (info@), „personal" (h.mueller@), „never". */
  function emailKind(e) {
    const local = String(e || '').split('@')[0].toLowerCase();
    if (NEVER.test(local)) return 'never';
    return GENERIC.test(local) ? 'generic' : 'personal';
  }

  /**
   * Ktorý e-mail firmy osloviť. Pravidlá:
   *   * nikdy noreply, datenschutz, bewerbung, buchhaltung…,
   *   * keď poznáme web firmy, len jej doména alebo bezplatná schránka
   *     (cudzia doména v Impressum je webdizajnér alebo materská firma),
   *   * osobná adresa len keď je uvedená v Impressum/Kontakte (`trusted`),
   *   * firemná pred osobnou, vlastná doména pred bezplatnou.
   * @param {string[]} emails
   * @param {{ website?: string, trusted?: string[] }} o
   * @returns {{ email, kind, domain_match } | null}
   */
  function pickEmail(emails, { website = '', trusted = [] } = {}) {
    const dom = baseDomain(website);
    const tr = new Set((trusted || []).map(x => String(x).toLowerCase()));
    const list = [];
    for (const raw of emails || []) {
      const e = String(raw || '').trim().toLowerCase();
      if (!emailOk(e)) continue;
      const kind = emailKind(e);
      if (kind === 'never') continue;
      const ed = baseDomain(e);
      const match = !!dom && ed === dom;
      if (dom && !match && !isFreemail(ed)) continue;
      if (kind === 'personal' && !tr.has(e)) continue;
      const rank = (kind === 'generic' ? 0 : 2) + (match || !dom ? 0 : 1);
      list.push({ email: e, kind, domain_match: match, rank });
    }
    list.sort((a, b) => a.rank - b.rank);
    if (!list.length) return null;
    const { email, kind, domain_match } = list[0];
    return { email, kind, domain_match };
  }

  function emailOk(e) {
    return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(e || '').trim());
  }

  // ── Telefón ─────────────────────────────────────────────────────────────
  const NOT_PHONE_LINE = /(ust|umsatzsteuer|steuer|hrb|hra|handelsregister|register|amtsgericht|iban|bic|swift|konto|blz|vat|st\.?-?nr|w-?idnr)/i;
  const PHONE_LABEL = /\b(tel|telefon|fon|phone|mobil|mobile|handy|zentrale|t)\b\.?\s*[:.]?/i;

  /**
   * Nemecké telefóny: „+49 (0) 731 / 123 45-6", „0049 89 123456",
   * „(0731) 12345", „Fon: 07 31 - 12 34 5". Fax sa vynechá.
   * @returns {string[]} v tvare „+49 731 123456"
   */
  function extractPhones(text) {
    const labeled = [], other = [];
    for (const line of String(text || '').split('\n')) {
      // „Tel: 0731 1 | Fax: 0731 2" — časť od „Fax" ďalej sa zahodí.
      for (const seg of line.split(/(?=\b(?:fax|telefax|fax-nr)\b)/i)) {
        if (/^\s*(fax|telefax|fax-nr)\b/i.test(seg)) continue;
        if (NOT_PHONE_LINE.test(seg) && !PHONE_LABEL.test(seg)) continue;
        const re = /(?:\+|00)\s?49[\s\d()/.\-–]{6,24}\d|\(?0\d{1,5}\)?[\s\d()/.\-–]{4,20}\d/g;
        let m;
        while ((m = re.exec(seg))) {
          const raw = m[0];
          const before = seg.slice(Math.max(0, m.index - 3), m.index);
          if (/DE\s?$/i.test(before)) continue;                         // USt-IdNr DE0…
          if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(raw.trim())) continue;   // dátum
          const p = normPhone(raw);
          if (!p) continue;
          (PHONE_LABEL.test(seg.slice(0, m.index)) ? labeled : other).push(p);
        }
      }
    }
    return [...new Set([...labeled, ...other])];
  }

  function normPhone(raw) {
    let s = String(raw || '').replace(/–/g, '-').trim();
    let nat;
    if (/^(\+|00)\s?49/.test(s)) nat = s.replace(/^(\+|00)\s?49/, '').replace(/^\s*\(\s*0\s*\)/, '');
    else if (/^\(?0/.test(s)) nat = s.replace(/^\(?0/, '');
    else return null;
    nat = nat.replace(/^\s*0(?=\d)/, '');
    const digits = nat.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 12 || /^0/.test(digits)) return null;
    const groups = nat.replace(/[()]/g, ' ').split(/[^\d]+/).filter(Boolean);
    if (groups.length > 1 && groups[0].length >= 2 && groups[0].length <= 5) {
      return `+49 ${groups[0]} ${groups.slice(1).join('')}`;
    }
    return `+49 ${digits}`;
  }

  // ── USt-IdNr ────────────────────────────────────────────────────────────
  /** „USt-IdNr.: DE 123 456 789" → „DE123456789". */
  function extractVat(text) {
    const s = String(text || '');
    const lab = s.match(/(?:ust\.?\s?-?\s?id(?:ent)?\.?\s?-?\s?(?:nr|nummer)?|umsatzsteuer-?\s?(?:identifikations)?-?\s?(?:nummer|nr|id)|vat(?:\s?(?:id|no|number|reg))?)\.?[^\n]{0,40}?\bDE\s?-?\s?((?:\d\s?){9})(?!\d)/i);
    if (lab) return `DE${lab[1].replace(/\s/g, '')}`;
    for (const line of s.split('\n')) {
      if (/iban|konto|bic/i.test(line)) continue;
      const m = line.match(/\bDE\s?(\d{3})\s?(\d{3})\s?(\d{3})(?![\d])/);
      if (m) return `DE${m[1]}${m[2]}${m[3]}`;
    }
    return null;
  }

  // ── Konateľ ─────────────────────────────────────────────────────────────
  const MANAGER_LABEL = /(gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in|innen)?|gesch(?:ä|ae)ftsf(?:ü|ue)hrung|gesch(?:ä|ae)ftsleitung|inhaber(?:in)?|vertretungsberechtigte[rn]?(?:\s+gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in)?)?|vertreten\s+durch(?:\s+(?:den|die)\s+gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in)?)?|vorstand|pers(?:ö|oe)nlich\s+haftende[r]?\s+gesellschafter(?:in)?)\b\s*(?:\([^)]*\))?\s*[:\-–]?\s*/i;
  const STOP_WORDS = /\b(registergericht|register|amtsgericht|handelsregister|hrb|hra|ust|umsatzsteuer|steuer|sitz|telefon|tel|fax|e-?mail|mail|internet|web|www|verantwortlich|inhaltlich|anschrift|adresse)\b/i;
  const NOT_NAME = /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|verwaltungs|beteiligungs|holding|gesellschaft|firma|unternehmen|komplementär|komplementärin|diese|dieser|deren|den|die|der|und)\b/i;
  const TITLES = /^(herr|frau|hr\.|fr\.)\s+/i;

  /** Meno vyzerá ako meno človeka: 2–5 slov s veľkým písmenom (aj „Dipl.-Ing."). */
  function isPersonName(n) {
    const s = clean(n);
    if (s.length < 4 || s.length > 70 || NOT_NAME.test(s) || /\d|@|\//.test(s)) return false;
    const words = s.split(' ');
    if (words.length < 2 || words.length > 5) return false;
    return words.every(w => /^(dr\.|prof\.|dipl\.-[\p{L}]+\.?|ing\.|mag\.|von|van|zu|de|del|la|[\p{Lu}][\p{L}'’.-]*)$/iu.test(w))
      && words.filter(w => /^[\p{Lu}]/u.test(w)).length >= 2;
  }

  /**
   * Konateľ z Impressum: „Geschäftsführer: Hans Müller, Peter Schmidt",
   * „Inhaber: Dipl.-Ing. Karl Huber", „Vertreten durch: …".
   * @returns {string|null} najviac 3 mená oddelené čiarkou
   */
  function extractManager(text) {
    const lines = String(text || '').split('\n');
    const names = [];
    for (let i = 0; i < lines.length && names.length < 3; i++) {
      const m = lines[i].match(MANAGER_LABEL);
      if (!m) continue;
      let rest = lines[i].slice(m.index + m[0].length);
      if (!clean(rest) && lines[i + 1]) {
        // „Vertreten durch:" a na ďalšom riadku „Geschäftsführer: Hans Müller".
        rest = lines[i + 1];
        const m2 = rest.match(MANAGER_LABEL);
        if (m2 && !clean(rest.slice(0, m2.index))) { rest = rest.slice(m2.index + m2[0].length); i++; }
      }
      const stop = rest.search(STOP_WORDS);
      if (stop >= 0) rest = rest.slice(0, stop);
      // „vertreten durch die X Verwaltungs GmbH, diese vertreten durch Hans Müller"
      const inner = rest.match(/vertreten\s+durch(?:\s+(?:den|die)\s+gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in)?)?\s*[:\-–]?\s*(.*)$/i);
      if (inner) rest = inner[1];
      for (let part of rest.split(/\s*(?:,|;|\bund\b|&|\s\/\s|\|)\s*/i)) {
        part = clean(part.replace(TITLES, '').replace(/[.:]+$/, ''));
        if (isPersonName(part) && !names.includes(part)) names.push(part);
        if (names.length >= 3) break;
      }
    }
    return names.length ? names.join(', ').slice(0, 160) : null;
  }

  // ── Adresa ──────────────────────────────────────────────────────────────
  const STREET = /([\p{L}][\p{L}.'’\- ]{1,60}?\s+\d{1,4}\s?[a-zA-Z]?(?:\s?[-–/]\s?\d{1,4}[a-zA-Z]?)?)\s*$/u;
  const PLZ_CITY = /(?:^|[\s,|·•–-])(?:D\s?-\s?)?(\d{5})\s+([\p{Lu}][\p{L}.'’\- /()]{1,48}?)\s*(?=$|[,|·•;]|\s{2,}|\s+(?:Tel|Telefon|Fon|Fax|E-?Mail|Deutschland|Germany|DE)\b)/u;

  /**
   * Adresa z Impressum: ulica s číslom a PSČ + mesto na tom istom alebo
   * na nasledujúcom riadku. PSČ v Nemecku je päť číslic (01001–99998).
   * @returns {{ address, postal_code, city } | null}
   */
  function extractAddress(text) {
    const lines = String(text || '').split('\n').map(clean).filter(Boolean);
    let fallback = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (NOT_PHONE_LINE.test(line) && !/stra(ß|ss)e|str\.|weg|platz/i.test(line)) continue;
      const m = line.match(PLZ_CITY);
      if (!m) continue;
      const plz = m[1];
      const n = Number(plz);
      if (n < 1001 || n > 99998) continue;
      const city = clean(m[2].replace(/\s*\((?:[^)]*)\)\s*$/, '').replace(/[-–,]+$/, ''));
      if (!city || /^(Tel|Fax|HRB|Amtsgericht)\b/i.test(city)) continue;
      const head = line.slice(0, m.index + (m[0].match(/^[\s,|·•–-]/) ? 1 : 0)).replace(/[\s,|·•–-]+$/, '');
      const sameLine = head.split(/\s*[,|·•]\s*/).map(clean).filter(Boolean).pop() || '';
      let street = STREET.test(sameLine) ? sameLine.match(STREET)[1] : '';
      if (!street && i > 0) {
        const prev = lines[i - 1].split(/\s*[,|·•]\s*/).map(clean).filter(Boolean).pop() || '';
        if (STREET.test(prev) && !NOT_PHONE_LINE.test(prev) && !/^(tel|fax|fon)/i.test(prev)) street = prev.match(STREET)[1];
      }
      street = clean(street);
      const found = { address: street || null, postal_code: plz, city: city.slice(0, 120) };
      if (street) return found;
      if (!fallback) fallback = found;
    }
    return fallback;
  }

  /** Názov firmy z Impressum: prvý riadok s právnou formou. */
  function extractCompany(text) {
    for (const raw of String(text || '').split('\n').slice(0, 80)) {
      const l = clean(raw.replace(/^(impressum|angaben gem(ä|ae)(ß|ss)\s*§\s*5\s*(tmg|ddg)|anbieter)\s*:?\s*/i, ''));
      if (l.length < 4 || l.length > 90) continue;
      if (/^(sitz|register|amtsgericht|©|copyright|ust|geschäftsführ|inhaber|vertreten|tel|fax|e-?mail)/i.test(l)) continue;
      if (/\b(GmbH|AG|KG|OHG|UG|GbR|e\.\s?K\.|e\.\s?Kfm\.|mbH|SE|PartG)\b/.test(l) && !/\b(registergericht|amtsgericht|haftungsbeschränkt\)?\s*$)/i.test(l.slice(0, 3))) {
        return l.replace(/[,;:]+$/, '');
      }
    }
    return null;
  }

  /**
   * Všetko, čo sa dá z Impressum vytiahnuť bez AI.
   * @param {string} text  text stránky (htmlToText)
   * @param {{ website?: string }} o
   */
  function parseImpressum(text, { website = '' } = {}) {
    const emails = extractEmails(text);
    const pick = pickEmail(emails, { website, trusted: emails });
    const phones = extractPhones(text);
    const adr = extractAddress(text);
    return {
      company: extractCompany(text),
      emails,
      email: pick ? pick.email : null,
      email_kind: pick ? pick.kind : null,
      email_domain_match: pick ? pick.domain_match : null,
      phone: phones[0] || null,
      phones,
      vat_id: extractVat(text),
      contact_person: extractManager(text),
      address: adr ? adr.address : null,
      postal_code: adr ? adr.postal_code : null,
      city: adr ? adr.city : null,
    };
  }

  // ── Mená ────────────────────────────────────────────────────────────────
  /** To isté pravidlo ako `DanubraLeads.normName` (bez právnej formy a interpunkcie). */
  function normName(n) {
    return clean(n).toLowerCase()
      .replace(/\b(gmbh|ug|ag|kg|ohg|gbr|e\.?\s?k\.?|mbh|co\.?|& ?co|haftungsbeschränkt|inh\.?)\b/g, ' ')
      .replace(/[^a-z0-9äöüß]+/g, '');
  }

  // ── Zlúčenie: AI + Impressum ────────────────────────────────────────────
  /**
   * Firma od AI + to, čo sa našlo na jej webe. Údaje z Impressum majú
   * prednosť; AI len dopĺňa. E-mail od AI ostane len keď je na stiahnutom
   * webe (`pageText`), alebo keď sa web stiahnuť nedal a e-mail je z domény
   * firmy — vtedy so značkou „ai" (neoverený).
   * @returns {Object} firma s `email_source`: impressum | web | ai | null
   */
  function merge(ai = {}, imp = null, { pageText = '', fetched = false } = {}) {
    const website = ai.website || '';
    const out = { ...ai, email: null, email_source: null, email_kind: null };
    if (imp && imp.email) {
      Object.assign(out, { email: imp.email, email_source: 'impressum', email_kind: imp.email_kind });
    } else if (ai.email && emailOk(ai.email)) {
      const e = String(ai.email).trim().toLowerCase();
      const onPage = extractEmails(pageText).includes(e);
      const p = pickEmail([e], { website, trusted: onPage ? [e] : [] });
      if (p && onPage) Object.assign(out, { email: e, email_source: 'web', email_kind: p.kind });
      else if (!fetched && p && p.domain_match) Object.assign(out, { email: e, email_source: 'ai', email_kind: p.kind });
    }
    if (imp) {
      for (const k of ['phone', 'vat_id', 'contact_person']) if (imp[k]) out[k] = imp[k];
      if (imp.postal_code) Object.assign(out, { postal_code: imp.postal_code, city: imp.city || out.city, address: imp.address || out.address });
      if (imp.company && ai.name) {
        const a = normName(ai.name), b = normName(imp.company);
        if (b && a && (b.includes(a) || a.includes(b)) && b.length >= a.length) out.name = imp.company;
      }
      if (imp.company && !ai.name) out.name = imp.company;
    }
    return out;
  }

  // ── Skóre ───────────────────────────────────────────────────────────────
  /** 0–100, celé číslo; nezmysel → null. */
  function score(v) {
    if (v === '' || v == null) return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  }

  /** Zoradenie: skóre, potom firmy s e-mailom, potom meno. */
  function rank(rows) {
    return [...(rows || [])].sort((a, b) => ((score(b.score) ?? -1) - (score(a.score) ?? -1))
      || (!!b.email - !!a.email) || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  }

  // ── Duplicity ───────────────────────────────────────────────────────────
  const domainsOf = (r) => [r.website, r.email && !isFreemail(String(r.email).split('@')[1] || '') ? r.email : '']
    .map(baseDomain).filter(Boolean);

  /**
   * Odstráni firmy, ktoré už máme (nové firmy, odberatelia — aj archivovaní),
   * zadané firmy samotné, odhlásené adresy a duplicity v tom istom výsledku.
   * Zhoda: doména webu alebo e-mailu, alebo meno + mesto (meno bez mesta
   * na jednej strane stačí).
   * @returns {{ fresh: Array, known: Array<{ row, why }> }}
   */
  function dedupe(found, { leads = [], partners = [], optouts = [], seeds = [] } = {}) {
    const doms = new Map();
    const names = new Map();
    const addKnown = (r, why) => {
      for (const d of domainsOf(r)) if (!doms.has(d)) doms.set(d, why);
      const n = normName(r.name);
      if (n) {
        if (!names.has(n)) names.set(n, new Map());
        const c = clean(r.city).toLowerCase();
        if (!names.get(n).has(c)) names.get(n).set(c, why);
      }
    };
    leads.forEach(r => addKnown(r, 'už je medzi novými firmami'));
    partners.forEach(r => addKnown(r, 'už je odberateľ'));
    const seedDoms = new Set((seeds || []).map(s => baseDomain(s.url || s.domain || s)).filter(Boolean));
    const outMails = new Set(), outDoms = new Set();
    for (const o of optouts || []) {
      const e = String((o && o.email) || o || '').trim().toLowerCase();
      if (!e) continue;
      outMails.add(e);
      const d = baseDomain(e);
      if (d && !isFreemail(d)) outDoms.add(d);
    }
    const nameHit = (r) => {
      const n = normName(r.name);
      const m = n && names.get(n);
      if (!m) return null;
      const c = clean(r.city).toLowerCase();
      if (!c) return [...m.values()][0];
      return m.get(c) || m.get('') || null;
    };
    const fresh = [], known = [];
    for (const r of found || []) {
      const ds = domainsOf(r);
      const mail = String(r.email || '').toLowerCase();
      let why = null;
      if (!clean(r.name)) why = 'bez mena';
      else if (ds.some(d => seedDoms.has(d))) why = 'je to zadaná firma';
      else if ((mail && outMails.has(mail)) || ds.some(d => outDoms.has(d))) why = 'odhlásila sa';
      else why = ds.map(d => doms.get(d)).find(Boolean) || nameHit(r);
      if (why) { known.push({ row: r, why }); continue; }
      fresh.push(r);
      addKnown(r, 'dvakrát v tom istom výsledku');
    }
    return { fresh, known };
  }

  // ── Riadok do databázy ──────────────────────────────────────────────────
  const cut = (v, n) => clean(v).slice(0, n) || null;

  /** Web firmy → „https://firma.de" (alebo null, keď je adresa nedovolená). */
  function siteUrl(v) {
    const r = normUrl(v);
    if (!r.ok) return null;
    try { return new URL(r.url).origin; } catch (e) { return null; }
  }

  /**
   * Firma (AI + Impressum) → riadok `danubra_leads`. Cudzí vstup: všetko sa
   * oreže a overí. `similar_to_url` sa berie len keď je to jedna zo zadaných.
   */
  function toLead(x = {}, { searchId = null, seeds = [] } = {}) {
    const sim = (() => {
      const d = baseDomain(x.similar_to_url);
      const s = d && (seeds || []).find(z => baseDomain(z.url || z.domain) === d);
      return s ? (s.url || null) : null;
    })();
    const email = clean(x.email).toLowerCase();
    return {
      name: cut(x.name, 200), city: cut(x.city, 120), postal_code: cut(x.postal_code, 12),
      address: cut(x.address, 200), country: 'DE', website: siteUrl(x.website),
      email: emailOk(email) ? email : null, phone: cut(x.phone, 40),
      trade: cut(x.trade, 80), why: cut(x.why, 400),
      source: 'urls', source_ref: cut(x.impressum_url || x.source_url, 300), status: 'new',
      score: score(x.score), seed_search_id: searchId || null,
      contact_person: cut(x.contact_person, 160), impressum_url: cut(x.impressum_url, 300),
      employees: cut(x.employees, 40), region: cut(x.region, 80),
      vat_id: /^DE\d{9}$/.test(String(x.vat_id || '').replace(/\s/g, '')) ? String(x.vat_id).replace(/\s/g, '') : null,
      profile: {
        summary: cut(x.summary, 600), similar_to_url: sim,
        email_source: emailOk(email) ? (x.email_source || null) : null,
        email_kind: emailOk(email) ? (x.email_kind || emailKind(email)) : null,
      },
    };
  }

  /** Krátky popis hľadania do zoznamu: „30. 10. · mueller-bau.de, huber.de +2". */
  function searchLabel(s) {
    if (!s) return 'Hľadanie';
    const seeds = (Array.isArray(s.seeds) && s.seeds.length ? s.seeds : (s.params && s.params.urls) || [])
      .map(x => (typeof x === 'string' ? hostOf(x) : x.domain || hostOf(x.url))).filter(Boolean);
    const d = s.created_at ? new Date(s.created_at) : null;
    const day = d && !Number.isNaN(d.getTime()) ? `${d.getDate()}. ${d.getMonth() + 1}.` : '';
    const what = seeds.length ? `${seeds.slice(0, 2).join(', ')}${seeds.length > 2 ? ` +${seeds.length - 2}` : ''}`
      : s.kind === 'ai' ? 'podľa odberateľov' : 'hľadanie';
    return [day, what].filter(Boolean).join(' · ');
  }

  const API = {
    MIN_SEEDS, MAX_SEEDS, COUNTS, FREEMAIL,
    hostOf, baseDomain, isFreemail, parseIPv4, parseIPv6, isPrivateIp, checkUrl,
    normUrl, parseSeeds, clampCount,
    decodeEntities, htmlToText, links, impressumLinks, guessPages, looksLikeImpressum,
    deobfuscate, extractEmails, emailKind, pickEmail, emailOk,
    extractPhones, normPhone, extractVat, extractManager, isPersonName, extractAddress, extractCompany, parseImpressum,
    normName, merge, score, rank, dedupe, siteUrl, toLead, searchLabel,
  };
  if (typeof window !== 'undefined') window.DanubraSeeds = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
