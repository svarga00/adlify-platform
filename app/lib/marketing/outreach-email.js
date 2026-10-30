// ============================================================================
// DANUBRA — e-mail oslovenia v dizajne punds (HTML + textová podoba)
// ============================================================================
// „Potrebujem, aby oslovenie bol pekný e-mail…"
//
// Rozloženie je tabuľkové s inline štýlmi — tak ho vykreslí Outlook, Gmail
// aj mobil (rovnako ako potvrdenia z webu, web/emails.js). Tmavý režim:
// hlavička je tmavá v oboch režimoch (biele logo), zvyšok má pre Apple Mail
// a Outlook.com vlastné tmavé farby, aby text nezmizol na tmavom pozadí.
//
//   hlavička     logo punds, vpravo „Fachkräfte für <remeslo>"
//   nadpis       z pitch.js („Trockenbauer für Ihre Baustellen in Bayern")
//   text         to, čo napísal človek alebo AI (oslovenie, 2–3 odseky,
//                otázka) — AI píše len text, nikdy rozloženie
//   tri body     z pitch.js (remeslo, doklady, jeden kontakt) — vecné,
//                prevzaté z webu, bez cien a sľubov
//   výzva        jedno tlačidlo (odkaz na punds.eu, sleduje sa klik)
//                a „Antworten Sie einfach auf diese E-Mail"
//   podpis       podpis schránky zo Správ (vizitka alebo text)
//   pätička      Impressum, prečo píšeme a odhlásenie (povinné)
//
// Textová podoba sa skladá vždy (spamové filtre a programy bez HTML).
// Všetko, čo prišlo zvonku (meno firmy, text, podpis), sa escapuje.
//
// Testy: node app/lib/marketing/outreach-email.test.js
// ============================================================================
(function () {
  const O = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./outreach.js') : (typeof window !== 'undefined' ? window.DanubraOutreach : null);

  const INK = '#0E1626', OR = '#F07F1A', T2 = '#4A5570', T3 = '#6F7A92', CHALK = '#F4F4F1', LINE = '#E6E8EC', PAGE = '#E9EAEC';
  const FONT = "'Hanken Grotesk',Arial,Helvetica,sans-serif", HEAD = "'Outfit',Arial,Helvetica,sans-serif";
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clean = (v) => String(v == null ? '' : v).replace(/\r\n/g, '\n');
  const htmlToText = (h) => String(h || '').replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();

  /** Pozdrav na konci textu — v rozložení ide až za výzvu, nad podpis. */
  const GREETING = /^(mit freundlichen gr(ü|ue)(ß|ss)en|freundliche gr(ü|ue)(ß|ss)e|beste gr(ü|ue)(ß|ss)e|viele gr(ü|ue)(ß|ss)e|herzliche gr(ü|ue)(ß|ss)e|kind regards|best regards|regards)[,.!]?$/i;

  /** Text → odseky; pozdrav na konci sa oddelí. */
  function split(text) {
    const lines = clean(text).replace(/\s+$/, '').split('\n');
    let greeting = '';
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      if (GREETING.test(lines[i].trim())) { greeting = lines[i].trim(); lines.splice(i); break; }
      if (lines[i].trim()) break;
    }
    const paras = lines.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return { paras, greeting };
  }

  /** Odsek do HTML: escapovaný text, klikateľné http(s) odkazy, zalomenia riadkov. */
  function paraHtml(p) {
    return esc(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color:${INK};font-weight:600;" class="tx">$1</a>`).replace(/\n/g, '<br>');
  }

  /** Tlačidlo, ktoré vykreslí aj Outlook (pozadie na bunke, nie na odkaze). */
  function button(url, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${OR}" style="background:${OR};border-radius:999px;padding:13px 24px;mso-padding-alt:13px 24px;">
<a href="${esc(url)}" style="font:600 15px/1.2 ${FONT};color:#ffffff;text-decoration:none;display:inline-block;">${esc(label)} &rarr;</a></td></tr></table>`;
  }

  /**
   * E-mail oslovenia.
   * @param {Object} o {
   *   lang, subject, body (text bez podpisu), pitch (pitch.js), supplier (Impressum),
   *   signature: { html, text, greeting (podpis má vlastný pozdrav) }, replyTo,
   *   unsubscribeUrl, assets (adresa web/public), attachment: { name } | null, step }
   * @returns {{ html, text }}
   */
  function build({ lang = 'de', subject = '', body = '', pitch = null, supplier = {}, signature = {}, replyTo = '',
    unsubscribeUrl = '', assets = '', attachment = null, step = 1 } = {}) {
    const de = lang !== 'en';
    const P = pitch || { headline: '', points: [], cta: null, trade: null, preheader: '' };
    const follow = Number(step) > 1;
    const looks = O && O.looksHtml ? O.looksHtml(body) : false;
    const { paras, greeting } = looks ? { paras: [], greeting: '' } : split(body);
    const bodyHtml = looks ? O.sanitizeHtml(body)
      : paras.map(p => `<p style="margin:0 0 14px;font:400 15.5px/1.65 ${FONT};color:${INK};" class="tx">${paraHtml(p)}</p>`).join('');
    const bodyText = looks ? htmlToText(body) : paras.join('\n\n');
    const greetText = greeting || (de ? 'Mit freundlichen Grüßen' : 'Kind regards');
    // Vizitka zo Správ má pozdrav v sebe — v HTML sa nezopakuje.
    const greet = signature.greeting ? '' : greetText;
    const trade = P.trade && P.trade.key !== 'bau' ? P.trade.team : '';
    const ref = de ? (trade ? `Fachkräfte für ${P.trade.label}` : 'Fachkräfte aus der Slowakei') : 'Skilled trades from Slovakia';
    // Pripomenutie je krátke: bez bodov a bez veľkého nadpisu — pôsobilo by ako nová reklama.
    const points = follow ? [] : (P.points || []).slice(0, 3);
    const cta = P.cta && P.cta.url ? P.cta : null;
    const why = de && trade ? `Wir schreiben Ihnen, weil Ihr Unternehmen im Bereich ${P.trade.label} tätig ist.` : '';
    const foot = O ? O.footerLines(supplier, lang) : [];
    const f = O ? O.FOOT[de ? 'de' : 'en'] : { unsub: '', link: '' };

    const pointsHtml = points.length ? `<tr><td class="px" style="padding:4px 32px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" bgcolor="${CHALK}" style="background:${CHALK};border-radius:16px;">
${points.map((p, i) => `<tr><td valign="top" style="padding:${i ? '4' : '16'}px 0 ${i === points.length - 1 ? '16' : '8'}px 18px;width:30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" bgcolor="${OR}" style="width:26px;height:26px;border-radius:13px;background:${OR};font:700 13px/26px ${HEAD};color:#ffffff;">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:${i ? '4' : '16'}px 18px ${i === points.length - 1 ? '16' : '8'}px 12px;font:400 14.5px/1.55 ${FONT};color:${T2};" class="tx2"><b style="color:${INK};font-weight:700;" class="tx">${esc(p.title)}</b><br>${esc(p.text)}</td></tr>`).join('')}
</table></td></tr>` : '';

    const ctaHtml = cta && !follow ? `<tr><td class="px" style="padding:18px 32px 4px;">${button(cta.url, cta.label)}
<p style="margin:12px 0 0;font:400 13.5px/1.5 ${FONT};color:${T3};" class="tx2">${esc(cta.reply || '')}${cta.reply ? '.' : ''}${replyTo ? ` <a href="mailto:${esc(replyTo)}" style="color:${T3};" class="tx2">${esc(replyTo)}</a>` : ''}</p></td></tr>` : '';

    const attachHtml = attachment && attachment.name ? `<tr><td class="px" style="padding:10px 32px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;"><tr>
<td width="34" align="center" valign="middle" style="padding:10px 0 10px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="28" align="center" valign="middle" bgcolor="${INK}" style="width:22px;height:28px;border-radius:3px;background:${INK};font:700 7px/28px Arial,sans-serif;color:#ffffff;">PDF</td></tr></table></td>
<td valign="middle" style="padding:10px 14px 10px 10px;font:400 13px/1.45 ${FONT};color:${T2};" class="tx2"><b style="color:${INK};" class="tx">${esc(attachment.name)}</b><br>${esc(de ? 'Kurze Übersicht im Anhang' : 'Short overview attached')}${attachment.pages ? ` · ${attachment.pages} ${de ? 'Seiten' : 'pages'}` : ''}</td></tr></table></td></tr>` : '';

    const html = `<!DOCTYPE html>
<html lang="${de ? 'de' : 'en'}" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject || 'punds')}</title>
<!--[if mso]><style>table,td,p,a,b{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
a{text-decoration:underline;}
@media (max-width:620px){.px{padding-left:20px !important;padding-right:20px !important;}.h1{font-size:24px !important;}.wrap{border-radius:0 !important;}}
@media (prefers-color-scheme:dark){.page{background:#0B111C !important;}.wrap{background:#141C2B !important;}.tx{color:#E8ECF3 !important;}.tx2{color:#B7C0D1 !important;}.box{background:#1C2638 !important;}.foot{background:#101725 !important;color:#9AA4B8 !important;}.sigbox{background:#ffffff !important;}}
[data-ogsc] .tx{color:#E8ECF3 !important;}[data-ogsc] .tx2{color:#B7C0D1 !important;}[data-ogsb] .wrap{background:#141C2B !important;}[data-ogsb] .box{background:#1C2638 !important;}[data-ogsb] .foot{background:#101725 !important;}[data-ogsb] .sigbox{background:#ffffff !important;}
</style></head>
<body class="page" style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE};">${esc(follow ? '' : P.preheader || '')}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" bgcolor="${PAGE}" style="background:${PAGE};"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="wrap" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
<tr><td bgcolor="${INK}" style="background:${INK};padding:20px 32px;" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${esc(assets)}/img/email/punds-mark-white.png" width="34" height="26" alt="" style="display:block;border:0;outline:none;"></td>
<td valign="middle"><div style="font:700 22px/1 ${HEAD};letter-spacing:-1px;color:#ffffff;">punds</div><div style="font:500 6px/1 ${FONT};letter-spacing:1.6px;color:#8C97AD;padding-top:5px;">PARTNER UND SERVICE</div></td>
</tr></table></td>
<td align="right" valign="middle" style="font:500 12px/1.3 ${FONT};color:#8C97AD;">${esc(ref)}</td>
</tr></table></td></tr>
${!follow && P.headline ? `<tr><td class="px" style="padding:30px 32px 6px;"><div style="width:34px;height:4px;border-radius:2px;background:${OR};font-size:0;line-height:0;">&nbsp;</div>
<h1 class="h1 tx" style="margin:14px 0 0;font:700 27px/1.15 ${HEAD};letter-spacing:-0.6px;color:${INK};">${esc(P.headline)}</h1></td></tr>` : ''}
<tr><td class="px" style="padding:${!follow && P.headline ? '18' : '30'}px 32px 4px;">${bodyHtml}</td></tr>
${pointsHtml}
${ctaHtml}
${attachHtml}
<tr><td class="px" style="padding:22px 32px 26px;">
${greet ? `<p style="margin:0 0 6px;font:400 15px/1.6 ${FONT};color:${INK};" class="tx">${esc(greet)}</p>` : ''}
${signature.html ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td class="sigbox" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:4px 18px 14px;">${signature.html}</td></tr></table>` : (signature.text ? `<p style="margin:0;font:400 14px/1.6 ${FONT};color:${T2};" class="tx2">${esc(signature.text).replace(/\n/g, '<br>')}</p>` : '')}
</td></tr>
<tr><td class="foot px" bgcolor="${CHALK}" style="background:${CHALK};padding:18px 32px;font:400 11.5px/1.6 ${FONT};color:${T3};">
${why ? `${esc(why)}<br>` : ''}${foot.map(esc).join('<br>')}${unsubscribeUrl ? `<br>${esc(f.unsub)} <a href="${esc(unsubscribeUrl)}" style="color:${T3};">${esc(f.link)}</a>` : ''}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

    const t = [];
    if (!follow && P.headline) t.push(P.headline, '');
    t.push(bodyText);
    if (points.length) t.push('', ...points.map(p => `- ${p.title}: ${p.text}`));
    if (cta && !follow) t.push('', `${cta.label}: ${cta.url}`, cta.reply ? `${cta.reply}.` : '');
    if (attachment && attachment.name) t.push('', `${de ? 'Anhang' : 'Attachment'}: ${attachment.name}`);
    t.push('', greetText, signature.text ? `-- \n${signature.text}` : '');
    const text = `${t.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n${why ? `\n${why}` : ''}${O ? O.footerText(supplier, unsubscribeUrl, lang) : ''}`;
    return { html, text };
  }

  /**
   * Podpis schránky pre e-mail oslovenia. Vizitka sa vždy ukáže po nemecky
   * (pozdrav, web punds.eu) a bez vlastnej výzvy — výzvu má rozloženie.
   * @param {Object} mb     schránka (signature, signature_card, email)
   * @param {Object} M      mail.js (sigHtml, cardText)
   * @param {string} sigText podpis, ktorý prišiel s textom (za „-- ")
   */
  function signatureOf(mb = {}, M = null, sigText = '', assets = '') {
    const card = mb && mb.signature_card && mb.signature_card.enabled && mb.signature_card.name;
    if (card && M && M.sigHtml) {
      const box = { ...mb, signature_card: { ...mb.signature_card, lang: 'de', cta: false } };
      return { html: M.sigHtml(box, assets), text: M.cardText(box).replace(/^(Mit freundlichen Grüßen|S pozdravom)\n+/, ''), greeting: true };
    }
    return { html: '', text: String(sigText || mb.signature || '').trim(), greeting: false };
  }

  /** Telo z okna „Osloviť" = text + „\n\n-- \n" + podpis schránky. Rozdelí ich. */
  function splitSignature(body) {
    const s = clean(body);
    const at = s.lastIndexOf('\n-- \n');
    return at < 0 ? { text: s.trim(), signature: '' } : { text: s.slice(0, at).trim(), signature: s.slice(at + 5).trim() };
  }

  const API = { build, split, splitSignature, signatureOf, button, GREETING };
  if (typeof window !== 'undefined') window.DanubraOutreachEmail = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
