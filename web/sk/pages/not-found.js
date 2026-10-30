// ============================================================================
// punds.sk — stránka nenájdená (404)
// ============================================================================
'use strict';

const { esc } = require('../../shared/h');
const { ghost } = require('./contact');

const T = {
  sk: { title: 'Stránka sa nenašla | punds', desc: 'Táto stránka neexistuje alebo bola presunutá.', h1: 'Túto stránku sme nenašli', p: 'Možno bola ponuka medzitým obsadená alebo sa adresa zmenila. Skúste aktuálne ponuky alebo sa vráťte na úvod.', jobs: 'Pozrieť ponuky', home: 'Na úvod', more: 'Mohlo by Vás zaujímať' },
  cz: { title: 'Stránka nenalezena | punds', desc: 'Tato stránka neexistuje nebo byla přesunuta.', h1: 'Tuto stránku jsme nenašli', p: 'Možná byla nabídka mezitím obsazena nebo se adresa změnila. Zkuste aktuální nabídky nebo se vraťte na úvod.', jobs: 'Zobrazit nabídky', home: 'Na úvod', more: 'Mohlo by Vás zajímat' },
  hu: { title: 'Az oldal nem található | punds', desc: 'Ez az oldal nem létezik, vagy áthelyeztük.', h1: 'Ezt az oldalt nem találjuk', p: 'Lehet, hogy az állást időközben betöltötték, vagy megváltozott a cím. Nézze meg az aktuális állásokat, vagy térjen vissza a kezdőlapra.', jobs: 'Állások megtekintése', home: 'Kezdőlap', more: 'Ez is érdekelheti' },
  de: { title: 'Seite nicht gefunden | punds', desc: 'Diese Seite existiert nicht oder wurde verschoben.', h1: 'Diese Seite haben wir nicht gefunden', p: 'Vielleicht ist der Job inzwischen besetzt oder die Adresse hat sich geändert. Sehen Sie sich die aktuellen Jobs an oder kehren Sie zur Startseite zurück.', jobs: 'Jobs ansehen', home: 'Zur Startseite', more: 'Das könnte Sie interessieren' },
  en: { title: 'Page not found | punds', desc: 'This page doesn’t exist or has been moved.', h1: 'We couldn’t find this page', p: 'The job may have been filled in the meantime, or the address has changed. Have a look at the current openings or head back to the home page.', jobs: 'See jobs', home: 'Home page', more: 'You might be interested in' },
  ro: { title: 'Pagina nu a fost găsită | punds', desc: 'Această pagină nu există sau a fost mutată.', h1: 'Nu am găsit această pagină', p: 'Poate că postul a fost ocupat între timp sau adresa s-a schimbat. Încercați ofertele actuale sau reveniți la pagina principală.', jobs: 'Vezi ofertele', home: 'Pagina principală', more: 'V-ar putea interesa' },
  pl: { title: 'Strona nie została znaleziona | punds', desc: 'Ta strona nie istnieje lub została przeniesiona.', h1: 'Nie znaleźliśmy tej strony', p: 'Być może oferta została w międzyczasie obsadzona albo zmienił się adres. Prosimy sprawdzić aktualne oferty lub wrócić na stronę główną.', jobs: 'Zobacz oferty', home: 'Strona główna', more: 'Może Państwa zainteresować' },
  bg: { title: 'Страницата не е намерена | punds', desc: 'Тази страница не съществува или е преместена.', h1: 'Не намерихме тази страница', p: 'Може би обявата междувременно е заета или адресът е променен. Вижте актуалните обяви или се върнете към началната страница.', jobs: 'Вижте обявите', home: 'Начало', more: 'Може да Ви заинтересува' },
};

async function render(ctx) {
  const t = T[ctx.lang] || T.sk;
  const c = ctx.t;
  const body = `
<section class="wrap sec sec-last nf">
  <div class="nf-card rv-in">
    <span class="nf-mark">${ghost(260, '#0E1626')}</span>
    <span class="nf-code" aria-hidden="true">404</span>
    <h1 class="h2 nf-h1">${esc(t.h1)}</h1>
    <p class="lead">${esc(t.p)}</p>
    <div class="hm-ctas"><a class="btn btn-primary" href="${esc(ctx.url('jobs'))}">${esc(t.jobs)} →</a><a class="btn btn-ghost" href="${esc(ctx.url('home'))}">${esc(t.home)}</a></div>
    <nav class="nf-links" aria-label="${esc(t.more)}"><span class="eyebrow">${esc(t.more)}</span>
      <a href="${esc(ctx.url('professions'))}">${esc(c.nav.professions)}</a><a href="${esc(ctx.url('how'))}">${esc(c.nav.how)}</a><a href="${esc(ctx.url('about'))}">${esc(c.nav.about)}</a><a href="${esc(ctx.url('contact'))}">${esc(c.nav.contact)}</a></nav>
  </div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-404', noindex: true, status: 404 };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
