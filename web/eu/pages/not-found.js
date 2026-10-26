// ============================================================================
// punds.eu — stránka nenájdená (404)
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const PROF = require('../../shared/professions');

const T = {
  de: {
    title: 'Seite nicht gefunden | punds', desc: 'Die gesuchte Seite gibt es auf punds.eu nicht (mehr).',
    k: 'Fehler 404', h1: 'Diese Seite gibt es leider nicht.', p: 'Vielleicht wurde sie verschoben oder die Adresse ist nicht ganz richtig. Hier geht es weiter:',
    home: 'Zur Startseite', contact: 'Kontakt & Anfrage', trades: 'Unsere Gewerke',
  },
  en: {
    title: 'Page not found | punds', desc: 'The page you are looking for does not exist (any more) on punds.eu.',
    k: 'Error 404', h1: 'Sorry, this page doesn’t exist.', p: 'It may have been moved, or the address isn’t quite right. Here is where to go next:',
    home: 'Go to the home page', contact: 'Contact & enquiry', trades: 'Our trades',
  },
};

async function render(ctx) {
  const t = T[ctx.lang] || T.de;
  const body = `
<section class="eu-hero eu-404">
  <div class="eu-hero-mark" aria-hidden="true">${mark({ w: 640, light: true })}</div>
  <div class="wrap eu-hero-in rv-in">
    <span class="eu-pill"><span class="eu-dot" aria-hidden="true"></span>${esc(t.k)}</span>
    <h1 class="eu-h1 eu-h1-64">${esc(t.h1)}</h1>
    <p class="eu-hero-sub">${esc(t.p)}</p>
    <div class="eu-ctas"><a class="btn btn-primary" href="${esc(ctx.url('home'))}">${esc(t.home)} →</a><a class="btn eu-btn-line" href="${esc(ctx.url('contact'))}">${esc(t.contact)}</a></div>
  </div>
</section>
<section class="wrap sec sec-last">
  <h2 class="h3 eu-404-h">${esc(t.trades)}</h2>
  <div class="eu-tlist eu-tlist-4">${each(PROF.euTrades(), (p) => `<a class="eu-trade" href="${esc(ctx.url('trade', { slug: p.eu.slug[ctx.lang] }))}"><strong>${esc(p.eu.name[ctx.lang])}</strong><span aria-hidden="true">→</span></a>`)}</div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/eu-pages.css'], status: 404, noindex: true, alternates: false };
}

module.exports = render;
