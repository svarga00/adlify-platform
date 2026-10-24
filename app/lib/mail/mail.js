// ============================================================================
// DANUBRA — Pošta: čisté funkcie
// ============================================================================
// „Správy som myslel ako plnohodnotný mailový klient s viacerými schránkami,
// podpisom atď."
//
// Tu je všetko, čo sa dá spočítať bez siete: nastavenia známych hostingov,
// rozbor adries, náhľad textu, odpoveď a preposlanie (s citáciou a podpisom),
// priradenie e-mailu k živnostníkovi, odberateľovi alebo novej firme podľa
// adresy a prevod rozobranej správy (mailparser) na riadok do databázy.
//
// Čítanie (IMAP) a posielanie (SMTP) je na serveri, heslá sú zašifrované
// (`lib/mail/secret.js`) — v prehliadači nikdy nie sú.
//
// Testy: node app/lib/mail/mail.test.js
// ============================================================================
(function () {
  /** Známe hostingy — server a porty sa doplnia samy. */
  const PRESETS = {
    websupport: { label: 'Websupport', imap_host: 'imap.websupport.sk', imap_port: 993, imap_secure: true,
      smtp_host: 'smtp.websupport.sk', smtp_port: 465, smtp_secure: true },
    forpsi: { label: 'Forpsi', imap_host: 'imap.forpsi.com', imap_port: 993, imap_secure: true,
      smtp_host: 'smtp.forpsi.com', smtp_port: 465, smtp_secure: true },
    gmail: { label: 'Gmail / Google Workspace', imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true,
      smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true },
    custom: { label: 'Iný (vyplním ručne)' },
  };

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const lower = (s) => clean(s).toLowerCase();

  /** „Ján Novák <jan@x.sk>, b@y.de" → [{ name, address }]. */
  function parseAddresses(input) {
    if (Array.isArray(input)) return input.flatMap(parseAddresses);
    if (input && typeof input === 'object') {
      const a = lower(input.address || input.email);
      return a ? [{ name: clean(input.name), address: a }] : [];
    }
    const out = [];
    // Meno v úvodzovkách smie mať čiarku („Bau, GmbH" <info@bau.de>).
    const re = /(?:"([^"]*)"\s*|([^"<>,;]*?)\s*)<([^<>\s,;]+@[^<>\s,;]+)>|([^\s<>,;"]+@[^\s<>,;"]+)/g;
    let m;
    while ((m = re.exec(String(input || '')))) {
      const address = lower(m[3] || m[4]);
      if (address) out.push({ name: clean(m[1] != null ? m[1] : (m[2] || '')), address });
    }
    return out;
  }
  const emailOk = (e) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(e || '').trim());
  function fmtAddress(a) { return a.name ? `${a.name} <${a.address}>` : a.address; }

  /** Predmet bez „Re:", „AW:", „Fwd:", „WG:" — na skladanie vlákien. */
  function normSubject(s) {
    let t = clean(s);
    for (let i = 0; i < 6; i++) {
      const n = t.replace(/^(re|aw|odp|fw|fwd|wg|tr|sv)\s*(\[\d+\])?\s*:\s*/i, '');
      if (n === t) break;
      t = n;
    }
    return t;
  }

  /** Kľúč vlákna: prvá správa v reťazi odkazov, inak predmet. */
  function threadKey({ references, inReplyTo, messageId, subject } = {}) {
    const refs = Array.isArray(references) ? references : String(references || '').split(/\s+/).filter(Boolean);
    const first = refs[0] || inReplyTo || null;
    if (first) return String(first).toLowerCase();
    const s = normSubject(subject).toLowerCase();
    return s ? `subj:${s}` : (messageId ? String(messageId).toLowerCase() : null);
  }

  function snippet(text, n = 180) {
    return clean(String(text || '').replace(/^>.*$/gm, '').replace(/[-_=*]{4,}/g, ' ')).slice(0, n);
  }

  /** HTML → čistý text (náhľad, odpoveď na HTML e-mail). */
  function htmlToText(html) {
    return String(html || '')
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /** Text → jednoduché HTML (odkazy klikateľné, riadky zachované). */
  function textToHtml(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  }

  /** Podpis na koniec (pred citáciou), oddelený štandardne „-- ". */
  function withSignature(body, signature) {
    const sig = String(signature || '').trim();
    if (!sig) return body || '';
    const b = String(body || '');
    const at = b.search(/\n\n(Dňa|Am|On) .{0,200}(napísal|schrieb|wrote)/);
    const pred = at >= 0 ? b.slice(0, at) : b;
    const za = at >= 0 ? b.slice(at) : '';
    return `${pred.replace(/\s+$/, '')}\n\n-- \n${sig}${za}`;
  }

  function fmtDate(d) {
    const x = new Date(d);
    if (isNaN(x)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()} o ${p(x.getHours())}:${p(x.getMinutes())}`;
  }

  /**
   * Odpoveď: komu, kópia, predmet, citácia. Pri „všetkým" sa pridajú ostatní
   * adresáti — bez vlastnej adresy a bez duplicít.
   */
  function replyDraft(msg = {}, { mailbox = {}, all = false } = {}) {
    const ja = lower(mailbox.email);
    const from = parseAddresses(msg.from_email ? [{ address: msg.from_email, name: msg.from_name }] : []);
    const prijemca = msg.direction === 'out' ? parseAddresses(msg.to_list || []) : from;
    const to = prijemca.filter(a => a.address !== ja);
    let cc = [];
    if (all) {
      const vsetci = [...parseAddresses(msg.to_list || []), ...parseAddresses(msg.cc_list || [])];
      const videne = new Set([ja, ...to.map(a => a.address)]);
      cc = vsetci.filter(a => !videne.has(a.address) && (videne.add(a.address), true));
    }
    const s = normSubject(msg.subject);
    const text = msg.text_body || htmlToText(msg.html_body);
    const kto = msg.from_name ? `${msg.from_name} <${msg.from_email}>` : (msg.from_email || '');
    const cit = text.split('\n').map(l => `> ${l}`).join('\n');
    return {
      mailbox_id: mailbox.id || msg.mailbox_id, to, cc,
      subject: `Re: ${s}`.trim(),
      in_reply_to: msg.message_id || null,
      references: [msg.refs, msg.message_id].filter(Boolean).join(' ').trim() || null,
      body: withSignature(`\n\nDňa ${fmtDate(msg.sent_at)} ${kto} napísal(a):\n${cit}`, mailbox.signature),
    };
  }

  function forwardDraft(msg = {}, { mailbox = {} } = {}) {
    const text = msg.text_body || htmlToText(msg.html_body);
    const hlav = [
      '---------- Preposlaná správa ----------',
      `Od: ${msg.from_name ? `${msg.from_name} <${msg.from_email}>` : (msg.from_email || '')}`,
      `Dátum: ${fmtDate(msg.sent_at)}`,
      `Predmet: ${msg.subject || ''}`,
      `Komu: ${parseAddresses(msg.to_list || []).map(fmtAddress).join(', ')}`,
    ].join('\n');
    return {
      mailbox_id: mailbox.id || msg.mailbox_id, to: [], cc: [],
      subject: `Fwd: ${normSubject(msg.subject)}`.trim(),
      body: withSignature(`\n\n${hlav}\n\n${text}`, mailbox.signature),
      attachments: (msg.attachments || []).filter(a => a && a.storage_path),
    };
  }

  /**
   * Komu e-mail patrí: živnostník, odberateľ, nová firma — podľa adresy.
   * Berie sa protistrana (pri prijatom odosielateľ, pri odoslanom adresáti).
   */
  function matchEntities(addresses, { workers = [], partners = [], leads = [] } = {}) {
    const mail = new Set(parseAddresses(addresses).map(a => a.address));
    const find = (list) => (list.find(x => x && x.email && mail.has(lower(x.email))) || {}).id || null;
    // Odberateľ sa dá spoznať aj podľa domény (bau@firma.de a info@firma.de).
    const domeny = new Set([...mail].map(a => a.split('@')[1]));
    const verejne = /^(gmail|googlemail|yahoo|outlook|hotmail|live|gmx|web|t-online|azet|centrum|post|zoznam|seznam|icloud|me)\./i;
    const pDom = partners.find(p => p && p.email && domeny.has(lower(p.email).split('@')[1]) && !verejne.test(lower(p.email).split('@')[1]));
    return { worker_id: find(workers), partner_id: find(partners) || (pDom ? pDom.id : null), lead_id: find(leads) };
  }

  /**
   * Rozobraná správa (mailparser `simpleParser`) → riadok do databázy.
   * Prílohy sa ukladajú zvlášť; tu sú len ich popisy.
   */
  function fromParsed(p = {}, { mailbox_id, folder, uid, direction = 'in', seen = false } = {}) {
    const val = (x) => (x && Array.isArray(x.value) ? x.value : Array.isArray(x) ? x.flatMap(y => y.value || []) : []);
    const from = val(p.from)[0] || {};
    const refs = Array.isArray(p.references) ? p.references.join(' ') : (p.references || null);
    const text = p.text || htmlToText(p.html || '');
    return {
      mailbox_id, folder, uid: uid == null ? null : Number(uid), direction, seen: !!seen,
      message_id: p.messageId || null, in_reply_to: p.inReplyTo || null, refs,
      thread_key: threadKey({ references: p.references, inReplyTo: p.inReplyTo, messageId: p.messageId, subject: p.subject }),
      from_email: lower(from.address) || null, from_name: clean(from.name) || null,
      to_list: parseAddresses(val(p.to)), cc_list: parseAddresses(val(p.cc)),
      subject: clean(p.subject).slice(0, 500) || '(bez predmetu)',
      sent_at: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
      snippet: snippet(text),
      text_body: String(text || '').slice(0, 200000),
      html_body: p.html ? String(p.html).slice(0, 500000) : null,
      // Obrázky vložené do textu (cid:) premení mailparser na data: URL v HTML —
      // medzi prílohy nepatria.
      attachments: (p.attachments || []).filter(a => a && !a.related)
        .map(a => ({ name: a.filename || 'príloha', type: a.contentType || 'application/octet-stream', size: a.size || (a.content ? a.content.length : 0) })),
    };
  }

  /** HTML e-mailu na zobrazenie v izolovanom okne: bez skriptov, obrázky z webu len na požiadanie. */
  function viewerDoc(msg = {}, { images = false } = {}) {
    const csp = images
      ? "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:"
      : "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
    const telo = msg.html_body ? String(msg.html_body)
      .replace(/<(script|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|iframe|object|embed|form|meta|base|link)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      : `<div style="white-space:pre-wrap">${textToHtml(msg.text_body || '')}</div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">`
      + '<base target="_blank"><style>body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.55;'
      + 'color:#0A1B3D;margin:0;padding:4px 2px;overflow-wrap:anywhere}img{max-width:100%;height:auto}'
      + 'blockquote{border-left:3px solid #E3EAF7;margin:8px 0;padding-left:10px;color:#44506B}table{max-width:100%}</style></head>'
      + `<body>${telo}</body></html>`;
  }

  /** Má e-mail obrázky z webu (sledovacie pixely, logá)? Vtedy sa ponúkne „Zobraziť obrázky". */
  function hasRemoteImages(msg = {}) {
    return /<img[^>]+src=["']?https?:/i.test(String(msg.html_body || ''));
  }

  const API = { PRESETS, parseAddresses, emailOk, fmtAddress, normSubject, threadKey, snippet, htmlToText,
    textToHtml, withSignature, replyDraft, forwardDraft, matchEntities, fromParsed, viewerDoc, hasRemoteImages, fmtDate };
  if (typeof window !== 'undefined') window.DanubraMail = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
