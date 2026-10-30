// ============================================================================
// DANUBRA — oslovovanie firiem po jednom a sledovanie, čo sa s e-mailom stalo
// ============================================================================
// „…budeme ich po jednom oslovovať e-mailom a budeme evidovať komu čo išlo,
// kto sa oslovil, či reagoval, či to videl, otvoril atď."
//
// Jeden riadok `danubra_outreach` = jeden e-mail jednej firme (krok 1 = prvý
// e-mail, 2+ = pripomenutie v tom istom vlákne). Pod ním udalosti
// `danubra_outreach_events`: otvorenie, klik, odpoveď, nedoručenie, odhlásenie.
//
// Tu sú len čisté funkcie (bez siete a databázy), ktoré používa server
// (danubra-outreach-send, danubra-track, synchronizácia pošty, nočná kontrola)
// aj appka (okno „Osloviť", časová os, prehľad Oslovovanie):
//
//   šablóna         {firma} {mesto} {konatel} {remeslo} {podobna} … a náhrada,
//                   keď údaj chýba: {mesto|Ihrer Region}
//   sledovanie      pixel, prepis odkazov na podpísané presmerovanie (HMAC —
//                   aby sa adresa nedala zneužiť ako otvorené presmerovanie)
//   automaty        Apple Mail Privacy, Google Image Proxy, bezpečnostné skenery
//                   — otvorenie „možno automaticky", nie človek
//   nedoručenie     správa od mailer-daemon / multipart/report → bounce
//   pripomenutie    kedy, a komu už nie (odpísal, odhlásil sa, nedoručené)
//   pravidlá        odhlásený sa znova neosloví, denný limit, Impressum
//
// Sledovanie otvorenia nie je nikdy 100 %: Apple Mail a Gmail obrázky
// predčítajú (otvorenie bez človeka), iné programy obrázky blokujú (človek
// bez otvorenia). Preto sa „možno automaticky" počíta zvlášť.
//
// Testy: node app/lib/marketing/outreach.test.js
// ============================================================================
(function () {
  // Kryptografia len na serveri (Node). V prehliadači sa nepodpisuje nič.
  const nodeCrypto = (() => {
    try { return (typeof require === 'function') ? require('crypto') : null; } catch (e) { return null; }
  })();

  const DEFAULTS = Object.freeze({
    track_opens: true,      // sledovací pixel
    track_clicks: true,     // odkazy cez presmerovanie
    daily_limit: 30,        // najviac e-mailov oslovenia za deň (všetci spolu)
    followup_days: 5,       // o koľko dní pripomenúť, keď firma neodpíše
    max_steps: 3,           // prvý e-mail + najviac 2 pripomenutia
    portfolio: '',          // čo ponúkame — veta do e-mailu (DE), {portfolio}
  });

  /**
   * Lead, ktorý už neoslovujeme (ďalej v procese alebo nechce). Od 081 aj
   * Stretnutie, Ponuka a Ozvať sa neskôr — tam ďalší krok riadi kontakt
   * s firmou (úloha s termínom), nie automatické pripomenutie e-mailom.
   */
  const STOP = ['replied', 'interested', 'meeting', 'offer', 'won', 'later', 'rejected', 'unsubscribed'];

  // Oslovenie „Sehr geehrter Herr Müller," je v pitch.js (rozbor mena z Impressum).
  const pitchLib = () => {
    try { if (typeof require === 'function' && typeof module !== 'undefined') return require('./pitch.js'); } catch (e) { /* bez neho */ }
    return typeof window !== 'undefined' ? window.DanubraPitch || null : null;
  };

  const clean = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const lower = (v) => clean(v).toLowerCase();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const num = (v, min, max, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
  };
  const bool = (v, def) => (v === undefined || v === null || v === '' ? def : !(v === false || v === 'false' || v === 0 || v === '0'));

  function emailOk(e) {
    return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(e || '').trim());
  }

  /** Nastavenia oslovovania z `danubra_settings.marketing.outreach` (s rozumnými hranicami). */
  function settings(marketing) {
    const o = (marketing && typeof marketing === 'object' && marketing.outreach && typeof marketing.outreach === 'object')
      ? marketing.outreach : {};
    return {
      track_opens: bool(o.track_opens, DEFAULTS.track_opens),
      track_clicks: bool(o.track_clicks, DEFAULTS.track_clicks),
      daily_limit: num(o.daily_limit, 1, 200, DEFAULTS.daily_limit),
      followup_days: num(o.followup_days, 1, 60, DEFAULTS.followup_days),
      max_steps: num(o.max_steps, 1, 5, DEFAULTS.max_steps),
      portfolio: String(o.portfolio || '').slice(0, 2000),
    };
  }

  // ── Šablóna ───────────────────────────────────────────────────────────────
  const VARS = ['firma', 'mesto', 'konatel', 'remeslo', 'podobna', 'oslovenie', 'nasa_firma', 'podpis',
    'web', 'telefon', 'email', 'portfolio', 'datum', 'predmet'];

  const fmtDe = (d) => {
    const x = new Date(d);
    if (isNaN(x)) return '';
    return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}`;
  };

  /**
   * Premenné pre šablónu z firmy a nastavení.
   * @param {Object} lead       riadok danubra_leads
   * @param {Object} ctx        { supplier, similarName, lang, portfolio, prev: { sent_at, subject } }
   */
  function vars(lead = {}, ctx = {}) {
    const s = ctx.supplier || {};
    const lang = ctx.lang === 'en' ? 'en' : 'de';
    const konatel = clean(lead.contact_person || lead.contact_name || lead.konatel || '');
    const PI = pitchLib();
    const oslovenie = PI ? PI.salutation(konatel, lang) : lang === 'en'
      ? (konatel ? `Dear ${konatel},` : 'Dear Sir or Madam,')
      : (konatel ? `Guten Tag ${konatel},` : 'Sehr geehrte Damen und Herren,');
    return {
      firma: clean(lead.name), mesto: clean(lead.city), konatel, remeslo: clean(lead.trade),
      podobna: clean(ctx.similarName), oslovenie,
      nasa_firma: clean(s.name), podpis: clean(s.signature || s.name), web: clean(s.web),
      telefon: clean(s.phone), email: clean(s.email), portfolio: String(ctx.portfolio || '').trim(),
      datum: ctx.prev && ctx.prev.sent_at ? fmtDe(ctx.prev.sent_at) : '',
      predmet: ctx.prev ? clean(ctx.prev.subject) : '',
    };
  }

  /**
   * Doplní premenné. `{mesto|Ihrer Region}` = keď mesto chýba, napíše sa
   * náhrada. Neznáma premenná zostane, ako je (aby ju bolo vidieť v náhľade).
   * Prázdne riadky po chýbajúcom odseku (napr. {portfolio}) sa zlúčia.
   */
  function fillTemplate(text, v = {}) {
    return String(text || '')
      .replace(/\{([a-z_]+)(?:\|([^{}]*))?\}/g, (m, k, alt) => {
        if (!VARS.includes(k)) return m;
        const val = k === 'portfolio' ? String(v.portfolio || '').trim() : clean(v[k]);
        return val || (alt != null ? alt : '');
      })
      .replace(/[ \t]+([,.!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Premenné použité v texte bez hodnoty a bez náhrady — appka na ne upozorní. */
  function missingVars(text, v = {}) {
    const out = new Set();
    for (const m of String(text || '').matchAll(/\{([a-z_]+)(\|[^{}]*)?\}/g)) {
      if (VARS.includes(m[1]) && !m[2] && !clean(v[m[1]]) && m[1] !== 'portfolio') out.add(m[1]);
    }
    return [...out];
  }

  /** Predvolené šablóny (keď v databáze nie sú). Sie-forma, krátko, bez sľubov. */
  const TEMPLATES = {
    de: {
      intro: {
        subject: 'Zusätzliche Fachkräfte für {firma}?',
        body: [
          '{oslovenie}',
          '',
          'wir sind {nasa_firma}, ein Nachunternehmer aus der Slowakei. Wir stellen erfahrene Handwerker '
            + 'für Baustellen in Deutschland – im Werkvertrag, mit A1-Bescheinigung und Freistellungsbescheinigung nach § 48b EStG.',
          '',
          '{portfolio}',
          '',
          'Falls Sie in {mesto|Ihrer Region} in den nächsten Monaten zusätzliche Leute für {remeslo|Ihre Projekte} brauchen: '
            + 'Darf ich Sie kurz anrufen oder Ihnen unsere Referenzen schicken?',
          '',
          'Mit freundlichen Grüßen',
        ].join('\n'),
      },
      followup: {
        subject: 'Re: {predmet}',
        body: [
          '{oslovenie}',
          '',
          'ich wollte kurz nachfragen, ob meine Nachricht vom {datum|letzter Woche} bei Ihnen angekommen ist. '
            + 'Wenn Sie aktuell oder demnächst Unterstützung für {remeslo|Ihre Baustellen} brauchen, genügt eine kurze Antwort – '
            + 'ich melde mich dann mit einem konkreten Vorschlag.',
          '',
          'Mit freundlichen Grüßen',
        ].join('\n'),
      },
    },
    en: {
      intro: {
        subject: 'Additional skilled workers for {firma}?',
        body: [
          '{oslovenie}',
          '',
          'we are {nasa_firma}, a subcontractor from Slovakia. We provide experienced tradespeople for construction sites '
            + 'in Germany – under a contract for work, with A1 certificates and an exemption certificate under § 48b EStG.',
          '',
          '{portfolio}',
          '',
          'If you need additional people for {remeslo|your projects} in {mesto|your region} in the coming months, '
            + 'may I give you a short call or send you our references?',
          '',
          'Kind regards',
        ].join('\n'),
      },
      followup: {
        subject: 'Re: {predmet}',
        body: [
          '{oslovenie}',
          '',
          'I just wanted to check whether my message from {datum|last week} reached you. If you need support for '
            + '{remeslo|your sites} now or soon, a short reply is enough – I will then get back to you with a concrete proposal.',
          '',
          'Kind regards',
        ].join('\n'),
      },
    },
  };

  /** Šablóna pre krok a jazyk: z databázy (kanál „outreach"), inak predvolená. */
  function pickTemplate(templates, { step = 1, lang = 'de', key = '' } = {}) {
    const kind = Number(step) > 1 ? 'followup' : 'intro';
    const list = (templates || []).filter(t => t && t.active !== false && t.channel === 'outreach');
    const byKey = key ? list.find(t => t.key === key && (t.language || 'de') === lang) || list.find(t => t.key === key) : null;
    const db = byKey || list.find(t => t.key === `outreach_${kind}` && (t.language || 'de') === lang);
    if (db && db.body) return { key: db.key, subject: db.subject || TEMPLATES[lang === 'en' ? 'en' : 'de'][kind].subject, body: db.body, source: 'db' };
    const t = TEMPLATES[lang === 'en' ? 'en' : 'de'][kind];
    return { key: `outreach_${kind}`, subject: t.subject, body: t.body, source: 'default' };
  }

  /** „Re: …" bez „Re: Re: Re:". */
  function replySubject(s) {
    const z = clean(s).replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/i, '');
    return `Re: ${z}`.trim();
  }

  // ── Impressum a pätička ───────────────────────────────────────────────────
  /** Čo chýba v Impressum (bez toho e-mail neodíde). */
  function impressumMissing(s = {}) {
    const out = [];
    if (!clean(s.name)) out.push('názov firmy');
    if (!clean(s.address)) out.push('adresa');
    if (!clean(s.vat_id) && !clean(s.company_id)) out.push('IČ DPH alebo IČO');
    return out;
  }

  const FOOT = {
    de: { unsub: 'Sie möchten keine weiteren E-Mails von uns erhalten?', link: 'Hier abmelden',
      vat: 'USt-IdNr.', reg: 'Reg.-Nr.' },
    en: { unsub: 'You do not want to receive further e-mails from us?', link: 'Unsubscribe here',
      vat: 'VAT ID', reg: 'Reg. no.' },
  };

  function footerLines(s = {}, lang = 'de') {
    const f = FOOT[lang === 'en' ? 'en' : 'de'];
    return [
      [clean(s.name), clean(s.address)].filter(Boolean).join(' · '),
      [s.vat_id ? `${f.vat}: ${clean(s.vat_id)}` : '', s.company_id ? `${f.reg}: ${clean(s.company_id)}` : '', clean(s.register)]
        .filter(Boolean).join(' · '),
      [clean(s.phone), clean(s.email), clean(s.web)].filter(Boolean).join(' · '),
    ].filter(Boolean);
  }

  /** Pätička ako text (do textovej časti e-mailu). */
  function footerText(s = {}, unsubUrl = '', lang = 'de') {
    const f = FOOT[lang === 'en' ? 'en' : 'de'];
    const lines = ['', '—', ...footerLines(s, lang)];
    if (unsubUrl) lines.push(`${f.unsub} ${f.link}: ${unsubUrl}`);
    return lines.join('\n');
  }

  /** Pätička ako HTML (malým sivým písmom, s odkazom na odhlásenie). */
  function footerHtml(s = {}, unsubUrl = '', lang = 'de') {
    const f = FOOT[lang === 'en' ? 'en' : 'de'];
    const lines = footerLines(s, lang).map(esc);
    if (unsubUrl) lines.push(`${esc(f.unsub)} <a href="${esc(unsubUrl)}" style="color:#5B6782">${esc(f.link)}</a>`);
    return `<div style="margin-top:22px;padding-top:10px;border-top:1px solid #E3EAF7;font-family:Arial,sans-serif;`
      + `font-size:11px;line-height:1.5;color:#5B6782">${lines.join('<br>')}</div>`;
  }

  // ── Podpis a overenie (len server) ───────────────────────────────────────
  /** Tajomstvo na podpis odkazov a odtlačok IP — rovnaké poradie ako web/api.js. */
  function secretOf(env) {
    const e = env || (typeof process !== 'undefined' ? process.env : {}) || {};
    return [e.TRACK_SECRET, e.IP_HASH_SECRET, e.MAIL_SECRET, e.SUPABASE_SERVICE_ROLE_KEY, e.SUPABASE_SERVICE_KEY]
      .map(x => String(x || '').trim()).find(Boolean) || null;
  }

  function hmac(secret, msg) {
    if (!nodeCrypto || !secret) return null;
    return nodeCrypto.createHmac('sha256', String(secret)).update(String(msg)).digest('hex');
  }

  /** Podpis cieľovej adresy kliku (viazaný na kľúč e-mailu). */
  function sign(token, url, secret) {
    const h = hmac(secret, `danubra-track:click:${token}:${url}`);
    return h ? h.slice(0, 32) : null;
  }

  function verify(token, url, sig, secret) {
    const want = sign(token, url, secret);
    const got = String(sig || '');
    if (!want || got.length !== want.length || !nodeCrypto) return false;
    return nodeCrypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }

  /** Odtlačok IP (HMAC, nie čistý hash — IPv4 sa dá prejsť celá). */
  function ipHash(ip, secret) {
    const a = String(ip || '').split(',')[0].trim();
    const h = a && secret ? hmac(secret, `danubra-track:ip:${a}`) : null;
    return h ? h.slice(0, 32) : null;
  }

  /** Nový kľúč e-mailu — 32 hexadecimálnych znakov (sedí aj s odhlásením). */
  function newToken() {
    if (nodeCrypto) return nodeCrypto.randomBytes(16).toString('hex');
    const a = new Uint8Array(16);
    (globalThis.crypto || window.crypto).getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const tokenOk = (t) => /^[a-f0-9]{32}$/.test(String(t || ''));

  /** Verejná adresa appky pre odkazy v e-mailoch (produkčná, nie náhľad nasadenia). */
  function siteUrl(env) {
    const e = env || (typeof process !== 'undefined' ? process.env : {}) || {};
    return String(e.HUB_PUBLIC_URL || e.URL || 'https://adlify-app.netlify.app').replace(/\/+$/, '');
  }

  const TRACK = '/.netlify/functions/danubra-track';

  function pixelUrl(site, token) { return `${site}${TRACK}?t=${token}&k=o`; }

  function clickUrl(site, token, url, secret) {
    const s = sign(token, url, secret);
    if (!s) return null;
    return `${site}${TRACK}?t=${token}&k=c&u=${encodeURIComponent(url)}&s=${s}`;
  }

  function unsubscribeUrl(site, token) {
    return `${site}/.netlify/functions/danubra-unsubscribe?t=${encodeURIComponent(token)}`;
  }

  /** Smie sa na adresu presmerovať? Len http/https, bez prihlasovacích údajov v adrese. */
  function safeTarget(url) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u) || u.length > 2000) return null;
    try {
      const p = new URL(u);
      if (!['http:', 'https:'].includes(p.protocol) || p.username || p.password || !p.hostname) return null;
      return p.toString();
    } catch (e) { return null; }
  }

  /**
   * Prepíše odkazy v HTML na sledovacie presmerovanie. Mení sa len http/https
   * (mailto:, tel:, # zostanú), odhlásenie a sledovacie odkazy sa nemenia.
   * @returns {{ html: string, links: string[] }}
   */
  function rewriteLinks(html, { site, token, secret, skip = [] } = {}) {
    const links = [];
    const out = String(html || '').replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, href) => {
      const raw = unesc(href).trim();
      const target = safeTarget(raw);
      if (!target || raw.includes(TRACK) || raw.includes('danubra-unsubscribe') || skip.some(s => s && raw.startsWith(s))) return m;
      const t = clickUrl(site, token, target, secret);
      if (!t) return m;
      links.push(target);
      return `${pre}${q}${esc(t)}${q}`;
    });
    return { html: out, links };
  }

  /** Neviditeľný obrázok 1×1 na koniec e-mailu. */
  function pixelHtml(site, token) {
    return `<img src="${esc(pixelUrl(site, token))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;overflow:hidden">`;
  }

  /** Telo z editora mohlo byť HTML — bez skriptov, rámov, udalostí a javascript: odkazov. */
  function sanitizeHtml(html) {
    return String(html || '')
      .replace(/<(script|style|iframe|object|embed|form|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|iframe|object|embed|form|meta|base|link|input|button)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data):[^"']*\2/gi, '$1=$2#$2');
  }

  const looksHtml = (s) => /<(p|div|br|a|b|strong|em|i|ul|ol|li|table|span|h\d)\b[^>]*>/i.test(String(s || ''));

  /**
   * Celé telo e-mailu na odoslanie a kópia bez sledovania (do Odoslaných a do appky).
   * @param {Object} o { html (telo bez pätičky), text, supplier, lang, site, token, secret, cfg,
   *                     framed: true = html je celý e-mail z outreach-email.js (s pätičkou
   *                     a odhlásením) — nepridáva sa pätička, obrázok ide pred </body> }
   * @returns {{ html, text, copyHtml, unsubscribe, links, tracked: { opens, clicks } }}
   */
  function compose({ html, text, supplier = {}, lang = 'de', site, token, secret, cfg = DEFAULTS, framed = false } = {}) {
    const unsubscribe = unsubscribeUrl(site, token);
    if (framed) {
      // Rozloženie skladá appka sama a cudzí text v ňom je escapovaný — očista
      // by zmazala <head> so štýlmi pre tmavý režim a mobil.
      const clicks = !!(cfg.track_clicks && secret);
      const r = clicks ? rewriteLinks(html, { site, token, secret }) : { html: String(html || ''), links: [] };
      const opens = !!cfg.track_opens;
      const px = opens ? pixelHtml(site, token) : '';
      const withPx = /<\/body>/i.test(r.html) ? r.html.replace(/<\/body>/i, `${px}</body>`) : `${r.html}${px}`;
      return { html: withPx, copyHtml: String(html || ''), text: String(text || ''), unsubscribe, links: r.links, tracked: { opens, clicks } };
    }
    const base = sanitizeHtml(html);
    const foot = footerHtml(supplier, unsubscribe, lang);
    const clicks = !!(cfg.track_clicks && secret);
    const r = clicks ? rewriteLinks(base, { site, token, secret }) : { html: base, links: [] };
    const opens = !!cfg.track_opens;
    return {
      html: `${r.html}${foot}${opens ? pixelHtml(site, token) : ''}`,
      copyHtml: `${base}${foot}`,
      text: `${String(text || '').replace(/\s+$/, '')}\n${footerText(supplier, unsubscribe, lang)}`,
      unsubscribe, links: r.links, tracked: { opens, clicks },
    };
  }

  // ── Automaty (predčítanie obrázkov, skenery odkazov) ─────────────────────
  const BOTS = [
    [/GoogleImageProxy|ggpht\.com/i, 'Gmail načítal obrázky cez Google'],
    [/YahooMailProxy/i, 'Yahoo načítal obrázky'],
    [/Barracuda|Mimecast|Proofpoint|MessageLabs|Symantec|TrendMicro|Forcepoint|IronPort|Sophos|Fortinet|Cisco|SafeLinks|ZScaler|Trustwave|Cloudmark/i,
      'bezpečnostný skener e-mailov'],
    [/bot\b|bot\/|spider|crawl|slurp|preview|scanner|linkcheck|headless|phantomjs|python-|curl\/|wget|go-http-client|java\/|okhttp|libwww|httpclient|axios|node-fetch|undici/i,
      'automat (program, nie človek)'],
  ];

  /**
   * Je otvorenie / klik pravdepodobne automat?
   * @param {Object} o { ua, kind: 'open'|'click', sentAt, at }
   * @returns {{ auto: boolean, reason: string|null }}
   */
  function automated({ ua, kind = 'open', sentAt, at } = {}) {
    const u = String(ua || '').trim();
    if (!u) return { auto: true, reason: 'bez identifikácie programu' };
    // Apple Mail Privacy Protection sťahuje obrázky cez proxy s holým „Mozilla/5.0".
    if (u === 'Mozilla/5.0') return { auto: true, reason: 'Apple Mail (ochrana súkromia) predčítal obrázky' };
    for (const [re, reason] of BOTS) if (re.test(u)) return { auto: true, reason };
    const sec = (Date.parse(at || new Date()) - Date.parse(sentAt || 0)) / 1000;
    if (sentAt && Number.isFinite(sec) && sec >= 0 && sec < (kind === 'click' ? 30 : 5)) {
      return { auto: true, reason: 'hneď po odoslaní — tak rýchlo človek nereaguje' };
    }
    return { auto: false, reason: null };
  }

  const shortUa = (ua) => String(ua || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);

  // ── Odpovede a nedoručenia ───────────────────────────────────────────────
  /** Všetky Message-ID v texte (aj z citovanej pôvodnej správy v nedoručenke). */
  function messageIds(...texts) {
    const out = new Set();
    for (const t of texts) {
      for (const m of String(t || '').matchAll(/<[^<>\s@]{1,200}@[^<>\s]{1,200}>/g)) out.add(m[0]);
    }
    return [...out];
  }

  /** Message-ID, na ktoré e-mail odpovedá (In-Reply-To + References). */
  function replyIds(msg = {}) {
    return messageIds(msg.in_reply_to, msg.refs || msg.references);
  }

  /** Nedoručenka (DSN)? Odosielateľ, typ obsahu alebo predmet. Oneskorenie nie je nedoručenie. */
  function isDsn({ from, subject, contentType } = {}) {
    const f = lower(from), s = clean(subject);
    if (/\(delay\)|delayed|verzögert|zpožděn|oneskoren/i.test(s)) return false;
    if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon|mail\.delivery|maildelivery)[@+]/i.test(f) || /mailer-daemon@/i.test(f)) return true;
    if (/multipart\/report/i.test(String(contentType || ''))) return true;
    return /undeliver|unzustellbar|nicht zustellbar|delivery status notification|mail delivery failed|delivery has failed|returned mail|failure notice|non.?delivery|nedoručiteľn|nedoručen|nedoručiteln/i.test(s);
  }

  /** Automatická odpoveď (dovolenka, mimo kancelárie) — nie je to odpoveď človeka. */
  function isAutoReply({ subject, headers = {} } = {}) {
    const h = (k) => String(headers[k] || headers[k.toLowerCase()] || '');
    if (/auto-(replied|generated|notified)/i.test(h('auto-submitted'))) return true;
    if (h('x-autoreply') || h('x-autorespond') || /auto_reply|bulk/i.test(h('x-auto-response-suppress') + h('precedence'))) return true;
    return /abwesen|out of office|automatische antwort|auto-?reply|automatic reply|nicht im büro|außer haus|urlaub|autoresponder|neprítomn/i.test(clean(subject));
  }

  /** Oslovenie, ktorého sa správa týka (podľa Message-ID). */
  function matchOutreach(ids, rows) {
    const set = new Set((ids || []).map(x => String(x).trim()));
    return (rows || []).filter(r => r && r.message_id && set.has(String(r.message_id).trim()));
  }

  // ── Pripomenutie a denný limit ───────────────────────────────────────────
  /** Kedy pripomenúť: o `days` dní, sobota a nedeľa sa posunú na pondelok. */
  function nextFollowup(sentAt, days = DEFAULTS.followup_days) {
    const d = new Date(sentAt || Date.now());
    if (isNaN(d)) return null;
    d.setUTCDate(d.getUTCDate() + Math.max(1, Number(days) || DEFAULTS.followup_days));
    const wd = d.getUTCDay();
    if (wd === 6) d.setUTCDate(d.getUTCDate() + 2);
    if (wd === 0) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  }

  /** Začiatok dnešného dňa v danom pásme (ISO v UTC). */
  function dayStart(now = new Date(), tz = 'Europe/Bratislava') {
    const n = new Date(now);
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(n);
    const g = (t) => Number(p.find(x => x.type === t).value);
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    const offset = local - Math.floor(n.getTime() / 1000) * 1000;
    return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset).toISOString();
  }

  /** Koľko e-mailov oslovenia dnes odišlo (všetkým). */
  function sentToday(rows, now = new Date(), tz) {
    const from = Date.parse(dayStart(now, tz));
    return (rows || []).filter(r => r && r.sent_at && ['sent', 'bounced'].includes(r.status)
      && Date.parse(r.sent_at) >= from).length;
  }

  /** Riadky jednej firmy zoradené od prvého po posledný. */
  function ofLead(rows, leadId) {
    return (rows || []).filter(r => r && r.lead_id === leadId && !r.archived_at)
      .sort((a, b) => (Number(a.step) || 1) - (Number(b.step) || 1)
        || String(a.sent_at || a.created_at || '').localeCompare(String(b.sent_at || b.created_at || '')));
  }

  /** Posledný odoslaný e-mail firme. */
  function lastSent(rows) {
    const s = (rows || []).filter(r => r && ['sent', 'bounced'].includes(r.status) && r.sent_at);
    return s.length ? s.reduce((a, b) => (String(b.sent_at) > String(a.sent_at) ? b : a)) : null;
  }

  /**
   * Komu treba pripomenúť: posledný e-mail firme, bez odpovede, nedoručenia
   * a odhlásenia, termín prišiel, krokov je menej ako najviac, firma nie je
   * ďalej v procese.
   * @returns {Array<{ outreach, lead }>}
   */
  function followupsDue(rows, leads, now = new Date(), cfg = DEFAULTS) {
    const byLead = new Map();
    for (const r of rows || []) {
      if (!r || r.archived_at || !r.lead_id) continue;
      if (!byLead.has(r.lead_id)) byLead.set(r.lead_id, []);
      byLead.get(r.lead_id).push(r);
    }
    const L = new Map((leads || []).map(l => [l.id, l]));
    const t = new Date(now).getTime();
    const out = [];
    for (const [leadId, list] of byLead) {
      const last = lastSent(list);
      const lead = L.get(leadId);
      if (!last || !lead || lead.archived_at) continue;
      if (list.some(x => x.replied_at || x.unsubscribed_at)) continue;
      if (last.status !== 'sent' || last.bounced_at || !last.next_followup_at) continue;
      if (Date.parse(last.next_followup_at) > t) continue;
      if ((Number(last.step) || 1) >= (cfg.max_steps || DEFAULTS.max_steps)) continue;
      if (STOP.includes(lead.status)) continue;
      // Dohodnutý ďalší krok (kontakt s firmou, 081): pripomenutie e-mailom až po ňom.
      if (lead.next_step_at && String(lead.next_step_at).slice(0, 10) > new Date(t).toISOString().slice(0, 10)) continue;
      out.push({ outreach: last, lead });
    }
    return out.sort((a, b) => String(a.outreach.next_followup_at).localeCompare(String(b.outreach.next_followup_at)));
  }

  /**
   * Smie sa firme poslať e-mail oslovenia? Dôvody v slovenčine, aby človek
   * vedel, čo chýba — nielen šedé tlačidlo.
   * @returns {{ ok: boolean, blocks: Array<{code,text}>, warns: Array<{code,text}> }}
   */
  function canSend({ lead = {}, email, optouts = [], sentToday: dnes = 0, cfg = DEFAULTS, step = 1, history = [] } = {}) {
    const blocks = [], warns = [];
    const e = lower(email != null ? email : lead.email);
    const von = optouts instanceof Set ? optouts : new Set((optouts || []).map(o => lower(o && o.email != null ? o.email : o)));
    const limit = cfg.daily_limit || DEFAULTS.daily_limit;
    const max = cfg.max_steps || DEFAULTS.max_steps;
    const sent = (history || []).filter(r => ['sent', 'bounced'].includes(r.status));
    const last = lastSent(history);
    if (!emailOk(e)) blocks.push({ code: 'no_email', text: 'Firma nemá platný e-mail. Doplňte ho, alebo ju oslovte telefonicky.' });
    if ((e && von.has(e)) || lead.status === 'unsubscribed' || sent.some(r => r.unsubscribed_at)) {
      blocks.push({ code: 'optout', text: 'Firma sa odhlásila z e-mailov — znova ju už neoslovíme.' });
    }
    if (lead.status === 'rejected') blocks.push({ code: 'rejected', text: 'Firma nemá záujem — e-mail jej už nepošleme.' });
    // 079: overenie na Google Mapách zistilo, že firma natrvalo zatvorila.
    if (lead.closed_at) blocks.push({ code: 'closed', text: 'Firma je podľa Google Máp natrvalo zatvorená — e-mail jej nepošleme. Ak to nesedí, kliknite pri firme „Overiť znova".' });
    if (lead.email_mx_ok === false && lower(lead.email) === e) {
      warns.push({ code: 'mx', text: 'Doména e-mailu nemá poštový server (MX) — e-mail sa pravdepodobne nedoručí. Overte adresu na webe firmy.' });
    }
    if (dnes >= limit) blocks.push({ code: 'limit', text: `Dnes už odišlo ${dnes} z ${limit} e-mailov (denný limit). Ďalšie pošlite zajtra.` });
    if (Number(step) <= 1 && sent.length) blocks.push({ code: 'dup', text: 'Firme už prvý e-mail odišiel. Použite „Pripomenúť sa".' });
    if (Number(step) > 1 && !last) blocks.push({ code: 'no_prev', text: 'Firme ešte neodišiel prvý e-mail.' });
    if (Number(step) > max) blocks.push({ code: 'max', text: `Firme už odišlo ${max} e-mailov bez odpovede. Ďalší by bol nátlak — skúste radšej telefón.` });
    if (sent.some(r => r.replied_at)) blocks.push({ code: 'replied', text: 'Firma už odpísala — odpovedzte jej v Správach.' });
    if (last && (last.bounced_at || last.status === 'bounced') && lower(last.to_email) === e) {
      blocks.push({ code: 'bounced', text: 'Posledný e-mail na túto adresu sa nedoručil. Overte adresu a opravte ju pri firme.' });
    }
    if (STOP.includes(lead.status) && !['unsubscribed', 'rejected'].includes(lead.status)) {
      warns.push({ code: 'status', text: 'Firma je už ďalej (odpísala, má záujem alebo je odberateľ) — zvážte, či ju oslovovať znova.' });
    }
    if (lead.next_step_at && String(lead.next_step_at).slice(0, 10) > new Date().toISOString().slice(0, 10)) {
      warns.push({ code: 'next_step', text: `S firmou je dohodnutý ďalší krok na ${fmtDe(lead.next_step_at)}${lead.next_step_text ? ` („${clean(lead.next_step_text)}")` : ''} — zvážte, či písať skôr.` });
    }
    if (dnes < limit && dnes >= limit - 3) warns.push({ code: 'near', text: `Dnes odišlo ${dnes} z ${limit} e-mailov — blížite sa k dennému limitu.` });
    return { ok: !blocks.length, blocks, warns };
  }

  // ── Prehľad pre appku ────────────────────────────────────────────────────
  /**
   * Zhrnutie oslovenia jednej firmy (pre stĺpec v zozname a filtre).
   * state: none | failed | sent | auto | opened | clicked | replied | bounced | unsubscribed
   */
  function summary(rows, now = new Date()) {
    const list = (rows || []).filter(r => r && !r.archived_at);
    const sent = list.filter(r => ['sent', 'bounced'].includes(r.status) && r.sent_at);
    const last = lastSent(list);
    const any = (k) => sent.some(r => r[k]);
    const sum = (k) => sent.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const s = {
      count: sent.length, step: last ? Number(last.step) || 1 : 0, lastAt: last ? last.sent_at : null,
      last, failed: list.some(r => r.status === 'failed') && !sent.length,
      opened: any('opened_at'), opens: sum('open_count'), autoOpened: any('auto_opened_at'), autoOpens: sum('auto_open_count'),
      clicked: any('clicked_at'), clicks: sum('click_count'),
      replied: any('replied_at'), bounced: !!(last && (last.bounced_at || last.status === 'bounced')),
      unsubscribed: any('unsubscribed_at'),
      nextFollowupAt: last && last.status === 'sent' && !any('replied_at') && !any('unsubscribed_at') ? last.next_followup_at || null : null,
    };
    s.waiting = !!(s.nextFollowupAt && Date.parse(s.nextFollowupAt) <= new Date(now).getTime());
    s.state = s.unsubscribed ? 'unsubscribed' : s.bounced ? 'bounced' : s.replied ? 'replied' : s.clicked ? 'clicked'
      : s.opened ? 'opened' : s.autoOpened ? 'auto' : s.count ? 'sent' : s.failed ? 'failed' : 'none';
    return s;
  }

  const STATES = {
    none: ['Neoslovená', 'gray'], failed: ['Neodišlo', 'red'], sent: ['Odoslané', 'blue'],
    auto: ['Otvorenie (možno automaticky)', 'gray'], opened: ['Otvoril', 'green'], clicked: ['Klikol', 'green'],
    replied: ['Odpovedal', 'green'], bounced: ['Nedoručené', 'red'], unsubscribed: ['Odhlásený', 'red'],
  };

  /** Značky pre filtre v zozname firiem. */
  function flags(s) {
    const f = [];
    f.push(s.count ? 'sent' : 'not_sent');
    if (s.opened || s.autoOpened) f.push('opened');
    if (s.clicked) f.push('clicked');
    if (s.replied) f.push('replied');
    if (s.bounced) f.push('bounced');
    if (s.waiting) f.push('waiting');
    return f;
  }

  /** Čísla za posledných `days` dní. Percentá z odoslaných. */
  function stats(rows, days = 30, now = new Date()) {
    const from = new Date(now).getTime() - days * 86400e3;
    const s = (rows || []).filter(r => r && !r.archived_at && ['sent', 'bounced'].includes(r.status)
      && r.sent_at && Date.parse(r.sent_at) >= from);
    const n = (f) => s.filter(f).length;
    const pct = (x) => (s.length ? Math.round((x / s.length) * 100) : 0);
    const opened = n(r => r.opened_at), autoOnly = n(r => !r.opened_at && r.auto_opened_at);
    const clicked = n(r => r.clicked_at), replied = n(r => r.replied_at), bounced = n(r => r.bounced_at || r.status === 'bounced');
    return { days, sent: s.length, opened, openedPct: pct(opened), autoOnly, autoPct: pct(autoOnly),
      clicked, clickedPct: pct(clicked), replied, repliedPct: pct(replied), bounced, bouncedPct: pct(bounced),
      unsubscribed: n(r => r.unsubscribed_at) };
  }

  /** Nové firmy s e-mailom, ktorým ešte nič neodišlo a smú sa osloviť. */
  function freshLeads(leads, rows, optouts = []) {
    const von = new Set((optouts || []).map(o => lower(o && o.email != null ? o.email : o)));
    const mame = new Set((rows || []).filter(r => r && !r.archived_at && ['sent', 'bounced'].includes(r.status)).map(r => r.lead_id));
    return (leads || []).filter(l => l && !l.archived_at && l.status === 'new' && emailOk(l.email)
      && !von.has(lower(l.email)) && !mame.has(l.id));
  }

  /** Popis udalosti na časovej osi. */
  function eventLabel(ev = {}) {
    const auto = ev.automated;
    switch (ev.type) {
      case 'open': return auto ? 'Otvorenie (možno automaticky)' : 'Otvoril e-mail';
      case 'click': return auto ? 'Klik (možno automaticky)' : 'Klikol na odkaz';
      case 'reply': return auto ? 'Automatická odpoveď (napr. dovolenka)' : 'Odpovedal';
      case 'bounce': return 'Nedoručené';
      case 'unsubscribe': return 'Odhlásil sa';
      default: return String(ev.type || '');
    }
  }

  /** „o 3 dni", „dnes", „pred 2 dňami" — pre pripomenutie. */
  function relDays(iso, now = new Date()) {
    if (!iso) return '';
    const d = (x) => { const t = new Date(x); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()); };
    const n = Math.round((d(iso) - d(now)) / 86400e3);
    if (n === 0) return 'dnes';
    if (n === 1) return 'zajtra';
    if (n === -1) return 'včera';
    const w = (k) => (k === 1 ? 'deň' : k >= 2 && k <= 4 ? 'dni' : 'dní');
    return n > 0 ? `o ${n} ${w(n)}` : `pred ${-n} ${-n === 1 ? 'dňom' : 'dňami'}`;
  }

  const API = {
    DEFAULTS, STOP, VARS, TEMPLATES, STATES, TRACK,
    emailOk, settings, vars, fillTemplate, missingVars, pickTemplate, replySubject,
    impressumMissing, FOOT, footerLines, footerText, footerHtml,
    secretOf, sign, verify, ipHash, newToken, tokenOk, siteUrl, pixelUrl, clickUrl, unsubscribeUrl, safeTarget,
    rewriteLinks, pixelHtml, sanitizeHtml, looksHtml, compose,
    automated, shortUa, messageIds, replyIds, isDsn, isAutoReply, matchOutreach,
    nextFollowup, dayStart, sentToday, ofLead, lastSent, followupsDue, canSend,
    summary, flags, stats, freshLeads, eventLabel, relDays,
  };
  if (typeof window !== 'undefined') window.DanubraOutreach = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
