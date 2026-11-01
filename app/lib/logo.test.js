// ============================================================================
// Testy: logo firmy všade rovnako (lib/logo.js)
// Spustenie:  node app/lib/logo.test.js
// ============================================================================
const L = require('./logo.js');
const V = require('./marketing/leadview.js');

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

console.log('Doména firmy');
{
  eq(L.domainOf('https://www.Maier-Ausbau.de/kontakt?x=1'), 'maier-ausbau.de', 'z webu bez www., cesty a parametrov');
  eq(L.domainOf('fliesen-bauer.de'), 'fliesen-bauer.de', 'holá doména');
  eq(L.domainOf('//gu-ulm.de/'), 'gu-ulm.de', 'adresa bez schémy');
  eq(L.domainOf(''), '', 'bez webu nič');
  eq(L.domainOf('http://'), '', 'nezmysel nespadne');
  eq(L.domainOf('localhost'), '', 'bez bodky to nie je doména');
  eq(L.domainOf('nie je web'), '', 'text s medzerami nie je web');
  eq(L.emailDomain('Hans Müller <hans@Mueller-Bau.de>'), 'mueller-bau.de', 'doména z e-mailu aj s menom');
  eq(L.emailDomain('info@'), '', 'neúplný e-mail nič');
  eq(L.companyDomain({ website: 'https://maier.de', email: 'info@iny.de' }), 'maier.de', 'web má prednosť pred e-mailom');
  eq(L.companyDomain({ web: 'weber-bau.de' }), 'weber-bau.de', 'aj pole „web"');
  eq(L.companyDomain({ url: 'https://www.huber.de/x' }), 'huber.de', 'aj pole „url"');
  eq(L.companyDomain({ domain: 'schmidt.de' }), 'schmidt.de', 'aj pole „domain"');
  eq(L.companyDomain({ email: 'buero@elektro-huber.de' }), 'elektro-huber.de', 'bez webu doména firemného e-mailu');
  eq(L.companyDomain({ from_email: 'bau@gu-ulm.de' }), 'gu-ulm.de', 'odosielateľ e-mailu');
  eq(L.companyDomain({ owner_email: 'info@pension-alpen.de' }), 'pension-alpen.de', 'ubytovateľ');
}

console.log('\nBezplatné schránky nedajú logo');
{
  for (const d of ['gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'yahoo.de', 'yahoo.com', 'outlook.com', 'outlook.de',
    'hotmail.com', 'hotmail.co.uk', 'seznam.cz', 'azet.sk', 'centrum.sk', 'centrum.cz', 'zoznam.sk', 'icloud.com', 'freenet.de', 'aol.com', 'protonmail.com', 'proton.me']) {
    ok(L.isFreeMail(d), `${d} je bezplatná schránka`);
  }
  ok(L.isFreeMail('mail.gmx.net'), 'aj subdoména bezplatnej schránky');
  ok(!L.isFreeMail('mueller-bau.de') && !L.isFreeMail('web-design.de') && !L.isFreeMail('gmxbau.de'), 'firemné domény nie (ani podobné mená)');
  eq(L.companyDomain({ name: 'Huber Bau', email: 'huber.bau@gmail.com' }), '', 'gmail firmy nie je jej doména');
  eq(L.companyDomain({ name: 'Weber', email: 'weber@t-online.de', website: '' }), '', 't-online.de tiež nie');
  eq(L.companyDomain({ website: 'https://www.facebook.com/huber', email: 'info@huber.de' }), 'huber.de', 'profil na Facebooku nie je web firmy — radšej doména e-mailu');
  eq(L.companyDomain({ url: 'https://linkedin.com/company/schmidt' }), '', 'ani LinkedIn (ikona siete by nebola logo firmy)');
  eq(L.companyDomain({ website: 'https://www.google.com/maps/place/x' }), '', 'ani odkaz na Mapy');
  eq(L.sources({ name: 'Huber Bau', email: 'huber.bau@gmail.com' }).src, '', 'gmail → žiadny obrázok, len iniciály');
}

console.log('\nIniciály a farba');
{
  eq(L.initials('Maier Innenausbau GmbH'), 'MI', 'dve slová bez GmbH');
  eq(L.initials('Trockenbau Huber & Söhne'), 'TH', 'bez &');
  eq(L.initials('Weber GmbH & Co. KG'), 'WE', 'jedno slovo = prvé dve písmená');
  eq(L.initials('Partner und Service s. r. o.'), 'PS', 'bez „und" a s. r. o.');
  eq(L.initials('Ökobau Süd e.K.'), 'ÖS', 'diakritika ostane');
  eq(L.initials(''), '?', 'bez mena otáznik');
  eq(L.hue('Maier Innenausbau GmbH'), L.hue('Maier Innenausbau GmbH'), 'tá istá firma — tá istá farba');
  ok(L.hue('Maier') !== L.hue('Huber'), 'iná firma — iná farba');
  eq(L.hue('MAIER'), L.hue('maier'), 'farba nezávisí od veľkých písmen');
  ok([...Array(50)].every((_, i) => { const h = L.hue(`Firma ${i}`); return h >= 0 && h < 360 && Number.isInteger(h); }), 'odtieň je celé číslo 0–359');
  eq(L.nameOf({ company_name: 'Müller Bau' }), 'Müller Bau', 'meno aj z company_name');
  eq(L.nameOf({ from_name: 'Hans Müller', from_email: 'h@m.de' }), 'Hans Müller', 'meno odosielateľa');
  eq(L.nameOf({ email: 'info@huber-bau.de' }), 'huber-bau.de', 'bez mena aspoň doména');
}

console.log('\nZdroje obrázka');
{
  eq(L.faviconUrl('maier-ausbau.de'), 'https://www.google.com/s2/favicons?domain=maier-ausbau.de&sz=64', 'favicon cez Google, 64 px, len doména');
  eq(L.faviconUrl('nie je doména'), '', 'neplatná doména = bez faviconu');
  eq(L.faviconUrl('a"><script>.de'), '', 'nič podozrivé sa do adresy nedostane');
  const s = L.sources({ name: 'Maier GmbH', website: 'maier.de', logo_url: 'https://maier.de/logo-192.png' });
  eq([s.src, s.fallback, s.domain], ['https://maier.de/logo-192.png', 'https://www.google.com/s2/favicons?domain=maier.de&sz=64', 'maier.de'], 'uložené logo → favicon');
  eq(L.sources({ name: 'Maier', logo_url: 'http://maier.de/l.png' }).src, '', 'logo bez https sa nepoužije');
  eq(L.sources({ name: 'Maier', logo_url: 'javascript:alert(1)' }).src, '', 'iná schéma nikdy');
  eq(L.sources({ name: 'Maier', logo_url: 'https://x.de/a.png" onerror="alert(1)' }).src, '', 'adresa s úvodzovkami nie');
  const bez = L.sources({ name: 'Maier GmbH', city: 'Augsburg', phone: '+49 821 1' });
  eq([bez.src, bez.fallback, bez.domain, bez.initials], ['', '', '', 'MA'], 'bez domény žiadna externá adresa — len iniciály');
  eq(L.sources(null).initials, '?', 'nič nespadne ani bez firmy');
  ok(L.isPlaceholder('https://www.google.com/s2/favicons?domain=x.de&sz=64', 16) && !L.isPlaceholder('https://www.google.com/s2/favicons?domain=x.de&sz=64', 64)
    && !L.isPlaceholder('https://x.de/logo.png', 16), '16 px glóbus Googlu sa spozná (vlastné malé logo nie)');
  eq([L.size(16), L.size(20), L.size(24), L.size(28), L.size(32), L.size(40), L.size(33), L.size('x'), L.size(1000)], [16, 20, 24, 28, 32, 40, 32, 24, 48], 'len pevné veľkosti');
}

console.log('\nKomponent CompanyLogo (js/components/company-logo.js)');
{
  const vm = require('vm');
  const fs = require('fs');
  const path = require('path');
  const win = { DanubraLogo: L };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'company-logo.js'), 'utf8'), win);
  const C = win.CompanyLogo;
  const h = C.html({ name: 'Maier Innenausbau GmbH', website: 'https://www.maier-ausbau.de' }, { size: 28 });
  ok(/class="co-logo co-z28"/.test(h) && /--co-z:28px/.test(h) && /width="28" height="28"/.test(h), 'pevná veľkosť (žiadne poskakovanie)', h);
  ok(/loading="lazy"/.test(h) && /decoding="async"/.test(h) && /referrerpolicy="no-referrer"/.test(h), 'obrázok lenivo, asynchrónne, bez referera');
  ok(/onerror="CompanyLogo\.err\(this\)"/.test(h) && /onload="CompanyLogo\.ok\(this\)"/.test(h), 'pri chybe zostanú iniciály, glóbus Googlu sa nahradí');
  ok(/<span class="co-ini">MI<\/span>/.test(h) && /aria-hidden="true"/.test(h), 'iniciály vždy pod obrázkom, čítačka ich nečíta dvakrát');
  ok(new RegExp(`--co-h:${L.hue('Maier Innenausbau GmbH')};`).test(h), 'farba podľa mena');
  const bez = C.html({ name: 'Huber Bau', email: 'huber@gmail.com', phone: '1' });
  ok(!/<img/.test(bez) && !/https?:/.test(bez), 'bez domény (gmail) žiadny obrázok ani externá adresa', bez);
  const zle = C.html({ name: '<img src=x onerror=alert(1)>"', logo_url: 'https://x.de/a.png' }, { title: '"><script>' });
  ok(!/<img src=x/.test(zle) && !/<script>/.test(zle) && !/onerror=alert/.test(zle), 'meno a titulok sú escapované', zle);
  ok(/data-fb="https:\/\/www\.google\.com/.test(C.html({ name: 'M', website: 'm.de', logo_url: 'https://m.de/l.png' })), 'uložené logo má zálohu vo favicone');
  // Pamäť firiem pre čipy odkazov
  C.remember('partner', [{ id: 'p1', name: 'GU Ulm GmbH', website: 'gu-ulm.de', city: 'Ulm' }], (r) => (r.id === 'p1' ? 'https://cdn.example/p1.png' : null));
  const f = C.find('partner', 'p1');
  eq([f.name, f.website, f.logo_url, f.city], ['GU Ulm GmbH', 'gu-ulm.de', 'https://cdn.example/p1.png', undefined], 'zapamätá si meno, web a nahraté logo (nič iné)');
  C.remember('partner', [{ id: 'p1', name: 'GU Ulm GmbH' }]);
  eq(C.find('partner', 'p1').website, 'gu-ulm.de', 'neskoršie načítanie bez webu web nezmaže');
  ok(/co-chip/.test(C.chip('partner', 'p1')) && /co-z16/.test(C.chip('partner', 'p1')), 'čip odkazu: 16 px logo');
  eq([C.chip('worker', 'w1'), C.chip('partner', 'nepoznám'), C.of('lead', 'x')], ['', '', ''], 'človek alebo neznáma firma — žiadne logo, ostane ikonka');
  win.Lead = { rows: [{ id: 'l1', name: 'Kaya Fliesen', website: 'kaya-fliesen.de', logo_url: 'https://kaya-fliesen.de/i.png' }] };
  ok(/kaya-fliesen\.de\/i\.png/.test(C.of('lead', 'l1')), 'novú firmu nájde aj v načítanom zozname Nových firiem');
  // Glóbus Googlu → iniciály, chyba → záloha → iniciály
  const img = (src, w, fb) => { const a = { src, currentSrc: src, naturalWidth: w, removed: false, attrs: fb ? { 'data-fb': fb } : {}, classList: { add(c) { a.cls = c; } } };
    a.getAttribute = (k) => a.attrs[k] || null; a.removeAttribute = (k) => { delete a.attrs[k]; }; a.remove = () => { a.removed = true; }; return a; };
  const g = img('https://www.google.com/s2/favicons?domain=x.de&sz=64', 16); C.ok(g);
  ok(g.removed && !g.cls, '16 px glóbus sa odstráni (ostanú iniciály)');
  const o = img('https://www.google.com/s2/favicons?domain=x.de&sz=64', 64); C.ok(o);
  ok(o.cls === 'is-ok' && !o.removed, 'skutočná ikona sa ukáže');
  const e = img('https://x.de/l.png', 0, 'https://www.google.com/s2/favicons?domain=x.de&sz=64'); C.err(e);
  ok(e.src.includes('s2/favicons') && !e.removed, 'nenačítané logo → skúsi favicon');
  C.err(e);
  ok(e.removed, 'a keď ani ten, ostanú iniciály');
}

console.log('\nNové firmy používajú tú istú logiku');
{
  const lead = { name: 'Maier GmbH', website: 'maier.de', logo_url: 'https://maier.de/logo.png' };
  const a = L.sources(lead), b = V.logoSources(lead);
  eq([b.src, b.fallback, b.initials, b.hue], [a.src, a.fallback, a.initials, a.hue], 'leadview.logoSources = lib/logo.sources');
  eq(V.initials('Trockenbau Huber & Söhne'), L.initials('Trockenbau Huber & Söhne'), 'tie isté iniciály');
  eq(V.hue('Maier'), L.hue('Maier'), 'tá istá farba');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
