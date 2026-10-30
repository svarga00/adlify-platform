// ============================================================================
// Testy: logo a náhľad webu firmy z úvodnej stránky (sitemeta.js)
// Spustenie:  node app/lib/marketing/sitemeta.test.js
// ============================================================================
const M = require('./sitemeta.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

// ── Typické weby nemeckých firiem ────────────────────────────────────────────
const WORDPRESS = `<!DOCTYPE html><html lang="de-DE"><head>
<meta charset="UTF-8">
<title>Maier Innenausbau GmbH &#8211; Trockenbau &amp; Akustik in Augsburg</title>
<meta name="description" content="Ihr Partner f&uuml;r Trockenbau, Akustikdecken und Innenausbau in Augsburg und Umgebung. Seit 1987 &ndash; &uuml;ber 40 Mitarbeiter.">
<meta property="og:locale" content="de_DE" />
<meta property="og:title" content="Maier Innenausbau – Trockenbau in Augsburg" />
<meta property="og:image" content="/wp-content/uploads/2024/03/baustelle-team.jpg" />
<link rel="icon" href="/wp-content/uploads/2023/01/cropped-logo-32x32.png" sizes="32x32" />
<link rel="icon" href="/wp-content/uploads/2023/01/cropped-logo-192x192.png" sizes="192x192" />
<link rel="apple-touch-icon" href="/wp-content/uploads/2023/01/cropped-logo-180x180.png" />
<link rel="mask-icon" href="/safari.svg" color="#000">
</head><body><img src="/partner/fremd-logo.png"><link rel="icon" href="https://evil.example/x.png" sizes="999x999"></body></html>`;

const JIMDO = `<html><head><title>  Fliesen   Bauer
 GmbH | Startseite </title>
<link rel='shortcut icon' href='//assets.jimstatic.com/fav.ico'>
<meta name="twitter:image" content="http://fliesen-bauer.de/bilder/bad.jpg">
<META NAME="Description" CONTENT='Fliesenleger in Friedberg &amp; Augsburg'>
</head><body>…</body></html>`;

const BAD = `<head><title><script>alert(1)</script>Hack</title>
<link rel="icon" href="data:image/png;base64,AAAA">
<link rel="apple-touch-icon" href="javascript:alert(1)">
<meta property="og:image" content="ftp://x.de/a.jpg">
<meta property="og:description" content="${'Sehr lange Beschreibung. '.repeat(40)}">
</head>`;

console.log('Logo a náhľad webu');
{
  const x = M.extract(WORDPRESS, 'https://www.maier-innenausbau.de/', {});
  eq(x.logo_url, 'https://www.maier-innenausbau.de/wp-content/uploads/2023/01/cropped-logo-192x192.png', 'najväčšia ikona z <head>, absolútna adresa');
  eq(x.og_image, 'https://www.maier-innenausbau.de/wp-content/uploads/2024/03/baustelle-team.jpg', 'og:image relatívny → absolútny');
  eq(x.site_title, 'Maier Innenausbau – Trockenbau in Augsburg', 'og:title má prednosť pred <title>');
  eq(x.site_description, 'Ihr Partner für Trockenbau, Akustikdecken und Innenausbau in Augsburg und Umgebung. Seit 1987 – über 40 Mitarbeiter.',
    'popis s rozbalenými entitami (ü, –)');
  eq(x.site_embeddable, true, 'bez X-Frame-Options a CSP sa dá vložiť');
  ok(!M.icons(WORDPRESS, 'https://www.maier-innenausbau.de/').some(i => /evil|safari/.test(i.url)), 'ikony z tela a maska Safari sa neberú');
}
{
  const x = M.extract(JIMDO, 'http://fliesen-bauer.de/start');
  eq(x.logo_url, 'https://assets.jimstatic.com/fav.ico', 'adresa bez schémy (//) → https');
  eq(x.og_image, 'https://fliesen-bauer.de/bilder/bad.jpg', 'twitter:image, http → https');
  eq(x.site_title, 'Fliesen Bauer GmbH | Startseite', '<title> bez nadbytočných medzier');
  eq(x.site_description, 'Fliesenleger in Friedberg & Augsburg', 'meta description aj veľkými písmenami a v apostrofoch');
  eq(x.site_embeddable, null, 'bez hlavičiek nevieme, či sa dá vložiť');
}
{
  const x = M.extract(BAD, 'https://hack.example/');
  eq(x.logo_url, null, 'data: a javascript: ikony sa odmietnu');
  eq(x.og_image, null, 'ftp: obrázok sa odmietne');
  ok(!/[<>]/.test(x.site_title), 'titulok bez HTML', x.site_title);
  ok(x.site_description.length <= M.DESC_MAX && x.site_description.endsWith('…'), `dlhý popis skrátený na ${M.DESC_MAX} znakov`);
  eq(M.extract('', 'https://x.de/'), { logo_url: null, og_image: null, site_title: null, site_description: null, site_embeddable: null }, 'prázdna stránka = nič');
}

console.log('\nAdresy');
{
  eq(M.absUrl('/logo.png', 'https://a.de/x/y'), 'https://a.de/logo.png', 'koreňová cesta');
  eq(M.absUrl('img/logo.png', 'https://a.de/x/y'), 'https://a.de/x/img/logo.png', 'relatívna cesta');
  eq(M.absUrl('https://user:pw@a.de/l.png'), null, 'adresa s menom a heslom nie');
  eq(M.absUrl(`https://a.de/${'x'.repeat(600)}.png`), null, 'priveľmi dlhá adresa nie');
  eq(M.absUrl('  '), null, 'prázdna nie');
  eq(M.absUrl('&#106;avascript:alert(1)', 'https://a.de/'), null, 'ani zakódované javascript:');
}

console.log('\nSmie sa web ukázať v okne (iframe)?');
{
  eq(M.embeddable({ 'X-Frame-Options': 'SAMEORIGIN' }), false, 'X-Frame-Options SAMEORIGIN = nie');
  eq(M.embeddable({ 'x-frame-options': 'DENY' }), false, 'DENY = nie');
  eq(M.embeddable({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self' https://partner.de" }), false, "CSP frame-ancestors 'self' = nie");
  eq(M.embeddable({ 'content-security-policy': 'frame-ancestors *' }), true, 'frame-ancestors * = áno');
  eq(M.embeddable({ 'content-security-policy': "default-src 'self'" }), true, 'CSP bez frame-ancestors = áno');
  eq(M.embeddable({ 'x-frame-options': ['SAMEORIGIN'] }), false, 'hlavička ako pole (Node)');
  eq(M.embeddable({ get: (n) => (n === 'x-frame-options' ? 'deny' : null) }), false, 'fetch Headers');
  eq(M.embeddable(null), null, 'bez odpovede nevieme');
}

console.log('\nZápis do databázy (082)');
{
  const now = new Date('2026-10-30T10:00:00Z');
  const p = M.leadPatch(M.extract(WORDPRESS, 'https://www.maier-innenausbau.de/', {}), now);
  eq(Object.keys(p).sort(), [...M.COLUMNS].sort(), 'zapíšu sa presne stĺpce z 082');
  eq(p.site_checked_at, '2026-10-30T10:00:00.000Z', 'čas kontroly');
  eq(M.leadPatch(null, now), { site_checked_at: '2026-10-30T10:00:00.000Z' }, 'nedostupný web = len čas pokusu (staré údaje ostanú)');
  eq(M.without082({ name: 'A', logo_url: 'x', site_checked_at: 'y' }), { name: 'A' }, 'riadok bez 082');
  ok(M.missing082({ message: 'column danubra_leads.logo_url does not exist' }), 'chýbajúci stĺpec 082 sa rozpozná');
  ok(M.missing082({ message: "Could not find the 'site_checked_at' column of 'danubra_leads' in the schema cache" }), 'aj z PostgREST');
  ok(!M.missing082({ message: 'duplicate key value violates unique constraint' }), 'iná chyba nie');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
