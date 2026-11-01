// ============================================================================
// DANUBRA — logo firmy všade rovnako (čisté funkcie)
// ============================================================================
// „Logo alebo favicon musí byť všade." Tá istá firma má v celej appke ten
// istý štvorček: v Nových firmách, v Oslovovaní, pri odberateľovi, na
// faktúre, v úlohe, v pošte aj vo vyhľadávaní.
//
// Poradie zdrojov:
//   1. uložené logo firmy (`logo_url`, len https — z jej webu, 082, alebo
//      ručne nahraté logo odberateľa ako podpísaná adresa)
//   2. ikona webu cez službu Google (s2/favicons, 64 px) — služba dostane
//      **len doménu**, nič iné; Google pri neznámej doméne vráti 16 px
//      glóbus a ten sa v prehliadači nahradí iniciálami
//   3. iniciály na farbe podľa mena (vždy pod obrázkom, takže rozbitý
//      obrázok nikdy nevidno)
//
// Doména sa berie z webu (website / web / url / domain) a až potom
// z e-mailu firmy — ale nikdy z bezplatnej schránky (gmail.com, gmx.de,
// web.de, t-online.de …): ikona Gmailu by nebola logo firmy.
// Bez domény sa nikam nevolá — len iniciály.
//
// Kreslí to js/components/company-logo.js (CompanyLogo.html).
// Testy: node app/lib/logo.test.js
// ============================================================================
(function () {
  const LEGAL = /\b(gmbh|mbh|co|kg|ag|ug|ohg|gbr|e\s?\.?\s?k|e\s?\.?\s?v|haftungsbeschränkt|inh|inhaber|und|&|s\s?\.?\s?r\s?\.?\s?o|a\s?\.?\s?s|spol)\b\.?/gi;

  /** Bezplatné schránky — doména e-mailu nie je doména firmy. */
  const FREE_MAIL = new Set([
    'gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com', 'web.de', 't-online.de',
    'freenet.de', 'arcor.de', 'online.de', 'posteo.de', 'mail.de', 'email.de', 'kabelmail.de', 'vodafone.de',
    'ewetel.net', 'mailbox.org', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'pm.me',
    'protonmail.ch', 'tutanota.com', 'tuta.io', 'yandex.com', 'yandex.ru', 'mail.ru', 'zoho.com', 'gmx.sk',
    'seznam.cz', 'email.cz', 'centrum.cz', 'centrum.sk', 'azet.sk', 'zoznam.sk', 'post.sk', 'atlas.sk',
    'pobox.sk', 'stonline.sk', 'chello.sk', 'orangemail.sk', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl',
    'aon.at', 'chello.at', 'bluewin.ch', 'libero.it', 'orange.fr', 'free.fr', 'laposte.net', 'abv.bg',
  ]);
  /** Profil na sieti alebo v katalógu nie je web firmy — ikona Facebooku by nebola jej logo. */
  const NOT_COMPANY = /(^|\.)(facebook|fb|instagram|linkedin|xing|twitter|x|youtube|tiktok|google|goo|maps\.app\.goo|wa|whatsapp|t|gelbeseiten|dasoertliche|11880|yelp|kununu|northdata|firmenwissen)\.[a-z.]+$/;
  /** Tí istí poskytovatelia na rôznych koncovkách (yahoo.de, outlook.sk, hotmail.co.uk …). */
  const FREE_MAIL_ANY = /^(yahoo|ymail|outlook|hotmail|live|msn|aol|gmx|icloud|protonmail|yandex)\.[a-z.]+$/;

  /** „Maier Innenausbau GmbH" → „MI", „Trockenbau Huber & Söhne" → „TH". */
  function initials(name) {
    const words = String(name || '').replace(LEGAL, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
    if (!words.length) return '?';
    const a = words[0][0] || '';
    const b = words.length > 1 ? words[1][0] : (words[0][1] || '');
    return `${a}${b}`.toUpperCase();
  }

  /** Farba (odtieň 0–359) podľa mena — tá istá firma má vždy tú istú. */
  function hue(name) {
    let h = 0;
    for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

  /** Doména webu bez www.: „https://www.maier-ausbau.de/kontakt" → „maier-ausbau.de". */
  function domainOf(website) {
    const w = String(website || '').trim();
    if (!w || /\s/.test(w)) return '';
    try {
      const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w.replace(/^\/\//, '')}`);
      const h = u.hostname.replace(/^www\d?\./i, '').replace(/\.$/, '').toLowerCase();
      return DOMAIN.test(h) ? h : '';
    } catch (e) { return ''; }
  }

  /** Doména e-mailu: „Hans <hans@Mueller-Bau.de>" → „mueller-bau.de". */
  function emailDomain(email) {
    const m = String(email || '').trim().toLowerCase().match(/@([a-z0-9.-]+)>?\s*$/);
    if (!m) return '';
    const d = m[1].replace(/\.$/, '');
    return DOMAIN.test(d) ? d : '';
  }

  /** Je to bezplatná schránka (aj subdoména, napr. mail.gmx.net)? */
  function isFreeMail(domain) {
    const d = String(domain || '').toLowerCase().replace(/^www\./, '');
    if (!d) return false;
    if (FREE_MAIL.has(d) || FREE_MAIL_ANY.test(d)) return true;
    const p = d.split('.');
    for (let i = 1; i < p.length - 1; i++) if (FREE_MAIL.has(p.slice(i).join('.'))) return true;
    return false;
  }

  /** Doména firmy z čohokoľvek, čo o nej vieme. Prázdne = nevieme (len iniciály). */
  function companyDomain(e) {
    const x = e || {};
    const okWeb = (d) => d && !isFreeMail(d) && !NOT_COMPANY.test(d);
    for (const v of [x.website, x.web, x.url, x.site, x.homepage, x.domain]) {
      const d = domainOf(v);
      if (okWeb(d)) return d;
    }
    for (const v of [x.email, x.from_email, x.owner_email, x.contact_email]) {
      const d = emailDomain(v);
      if (d && !isFreeMail(d)) return d;
    }
    return '';
  }

  /** Meno firmy na iniciály a farbu. */
  function nameOf(e) {
    const x = e || {};
    return String(x.name || x.company_name || x.from_name || x.supplier_name || x.title || '').trim()
      || companyDomain(x) || String(x.email || x.from_email || '').split('@')[0];
  }

  /** Ikona webu cez Google (bez kľúča, len doména). */
  function faviconUrl(domain, size = 64) {
    const d = String(domain || '').trim().toLowerCase();
    if (!DOMAIN.test(d)) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=${size}`;
  }

  /** Uložené logo (len https) → favicon služby → iniciály. */
  function sources(e) {
    const x = e || {};
    const domain = companyDomain(x);
    const fav = faviconUrl(domain);
    const own = /^https:\/\/[^\s"'<>]+$/i.test(String(x.logo_url || '')) ? String(x.logo_url) : '';
    const name = nameOf(x);
    return { src: own || fav, fallback: own && fav && own !== fav ? fav : '', initials: initials(name), hue: hue(name), domain };
  }

  /** Je to tá zástupná ikona Googlu (16 px glóbus pri neznámej doméne)? */
  function isPlaceholder(src, naturalWidth) {
    return /google\.com\/s2\/favicons/.test(String(src || '')) && naturalWidth > 0 && naturalWidth <= 16;
  }

  const SIZES = [16, 20, 24, 28, 30, 32, 40, 44, 48];
  /** Povolené veľkosti (pevný rozmer = žiadne poskakovanie riadkov). */
  function size(n) {
    const v = Number(n) || 24;
    return SIZES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), SIZES[0]);
  }

  const API = { FREE_MAIL, SIZES, initials, hue, domainOf, emailDomain, isFreeMail, companyDomain, nameOf, faviconUrl, sources, isPlaceholder, size };
  if (typeof window !== 'undefined') window.DanubraLogo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
