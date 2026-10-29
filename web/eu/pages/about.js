// ============================================================================
// punds.eu — Über uns (návrh 3a)
// ============================================================================
// Mená a fotky tímu zatiaľ nemáme — karty ukazujú len rolu a jazyky, bez
// vymyslených osôb. Na skúšobnej adrese je pri nich upozornenie.
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const PROF = require('../../shared/professions');
const { IMG } = require('../../shared/jobs');

const T = {
  de: {
    title: 'Über uns – Partner und Service s. r. o. | punds',
    desc: 'Partner und Service s. r. o. aus Nové Zámky vermittelt erfahrene Handwerker und Teams aus der Slowakei an Bau- und Industrieunternehmen in Deutschland und Österreich.',
    home: 'Startseite', crumb: 'Über uns', h1: 'Ihr Partner für Fachkräfte aus der Slowakei.',
    sub: 'Partner und Service ist ein slowakisches Unternehmen mit Sitz in Nové Zámky. Wir vermitteln erfahrene Handwerker und eingespielte Teams an Bau- und Industrieunternehmen in Deutschland und Österreich, mit vollständigen Unterlagen und einem festen Ansprechpartner.',
    photos: ['Fachkräfte bei der Montage', 'Schweißer bei der Arbeit'],
    whyK: 'Warum punds', whyH: 'Wir kennen jeden Handwerker persönlich.',
    whyP: ['Wir sind keine anonyme Plattform. Jede Fachkraft, die wir vermitteln, haben wir vorher persönlich geprüft: Qualifikation, Erfahrung und Zuverlässigkeit.',
      'Unterlagen, Unterkunft und Anreise organisieren wir vollständig. Sie erhalten einsatzbereite Fachkräfte und einen deutschsprachigen Ansprechpartner, der sich um den gesamten Einsatz kümmert.'],
    valH: 'Unsere Grundsätze',
    vals: [['Geprüfte Qualität', 'Nur Fachkräfte mit nachgewiesener Erfahrung und gültigen Zertifikaten.'], ['Rechtssicherheit', 'A1, Gewerbe, Steuernummer und Freistellung liegen vor Projektstart vor.'],
      ['Ein Ansprechpartner', 'Deutschsprachige Koordination von Einsatz, Ersatz und Abrechnung.'], ['Verlässlichkeit', 'Wir halten Termine ein und stellen bei Ausfall schnell Ersatz.']],
    tradesK: 'Unsere Gewerke', tradesH: 'Schwerpunkt Bau und Metall',
    langK: 'Sprachen', langH: 'Wir sprechen Ihre Sprache',
    langP: 'Koordination auf Deutsch, auf der Baustelle Slowakisch, Tschechisch und Ungarisch. Keine Missverständnisse zwischen Bauleitung und Team.',
    flags: [['de', 'Deutsch'], ['sk', 'Slowakisch'], ['cz', 'Tschechisch'], ['hu', 'Ungarisch']],
    teamH: 'Ihre Ansprechpartner', teamP: 'Ein festes Team in Nové Zámky begleitet Ihr Projekt von der Anfrage bis zur Abrechnung.',
    team: [['Geschäftsführung', 'DE · SK'], ['Projektkoordination DACH', 'DE · SK · CZ'], ['Abrechnung', 'DE · SK · HU']], langs: 'Sprachen',
    warn: 'Platzhalter – echte Namen/Fotos folgen.',
    ctaH: 'Sprechen wir über Ihr Projekt.', ctaP: 'Gewerk, Ort, Zeitraum und Anzahl: Wir melden uns innerhalb eines Werktages.', cta: 'Anfrage senden',
  },
  en: {
    title: 'About us – Partner und Service s. r. o. | punds',
    desc: 'Partner und Service s. r. o. from Nové Zámky, Slovakia, places experienced tradespeople and crews with construction and industrial companies in Germany and Austria.',
    home: 'Home', crumb: 'About us', h1: 'Your partner for skilled tradespeople from Slovakia.',
    sub: 'Partner und Service is a Slovak company based in Nové Zámky. We place experienced tradespeople and well-rehearsed crews with construction and industrial companies in Germany and Austria – fully documented, with one fixed point of contact.',
    photos: ['Tradespeople during installation', 'Welder at work'],
    whyK: 'Why punds', whyH: 'We know every tradesperson personally.',
    whyP: ['We are not an anonymous platform. Every specialist we place has been checked by us in person beforehand: qualifications, experience and reliability.',
      'We take care of paperwork, accommodation and travel. You receive tradespeople ready to start, plus a German-speaking contact who looks after the entire deployment.'],
    valH: 'Our principles',
    vals: [['Proven quality', 'Only tradespeople with proven experience and valid certificates.'], ['Legal certainty', 'A1, trade licence, tax number and Freistellung are in place before the project starts.'],
      ['One point of contact', 'German-speaking coordination of deployment, replacements and billing.'], ['Reliability', 'We keep to deadlines and provide replacements quickly if someone drops out.']],
    tradesK: 'Our trades', tradesH: 'Focus on construction and metal',
    langK: 'Languages', langH: 'We speak your language',
    langP: 'Coordination in German and English; on site in Slovak, Czech and Hungarian. No misunderstandings between site management and crew.',
    flags: [['de', 'German'], ['sk', 'Slovak'], ['cz', 'Czech'], ['hu', 'Hungarian']],
    teamH: 'Your contacts', teamP: 'A permanent team in Nové Zámky supports your project from enquiry to invoicing.',
    team: [['Management', 'DE · SK'], ['Project coordination DACH', 'DE · SK · CZ'], ['Billing', 'DE · SK · HU']], langs: 'Languages',
    warn: 'Placeholder – real names/photos to follow.',
    ctaH: 'Let’s talk about your project.', ctaP: 'Trade, location, timeframe and headcount: we’ll get back to you within one working day.', cta: 'Send enquiry',
  },
};

async function render(ctx) {
  const t = T[ctx.lang];
  const team = (ctx.content && ctx.content.team) || [];
  const body = `
<section class="eu-ahero">
  <div class="eu-hero-mark eu-ahero-mark" aria-hidden="true">${mark({ w: 620, light: true })}</div>
  <div class="wrap eu-ahero-in">
    <div class="eu-ahero-txt rv-in">
      <nav class="crumbs eu-crumbs-dark" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(t.crumb)}</span></nav>
      <h1 class="eu-h1 eu-h1-64">${esc(t.h1)}</h1>
      <p class="eu-hero-sub">${esc(t.sub)}</p>
    </div>
    <div class="eu-ahero-ph rv-in d1"><img src="${esc(IMG.mont)}" alt="${esc(t.photos[0])}" width="960" height="680" decoding="async"><img src="${esc(IMG.weld)}" alt="${esc(t.photos[1])}" width="960" height="680" decoding="async"></div>
  </div>
</section>

<section class="wrap sec eu-why2">
  <div class="rv"><span class="eu-kick">${esc(t.whyK)}</span><h2 class="h2 eu-h2-40">${esc(t.whyH)}</h2></div>
  <div class="eu-why2-p rv">${each(t.whyP, (p) => `<p>${esc(p)}</p>`)}</div>
</section>

<section class="wrap sec">
  <h2 class="h2 eu-h2-40 eu-sec-h rv">${esc(t.valH)}</h2>
  <div class="eu-vals">${each(t.vals, ([h, p], i) => `<div class="eu-val lift rv"><span class="eu-n">${String(i + 1).padStart(2, '0')}</span><strong>${esc(h)}</strong><span>${esc(p)}</span></div>`)}</div>
</section>

<section class="wrap sec eu-duo">
  <div class="eu-duo-c rv">
    <span class="eu-kick">${esc(t.tradesK)}</span><strong class="eu-duo-h">${esc(t.tradesH)}</strong>
    <div class="eu-tags">${each(PROF.euTrades(), (p) => `<a href="${esc(ctx.url('trade', { slug: p.eu.slug[ctx.lang] }))}">${esc(p.eu.name[ctx.lang])}</a>`)}</div>
  </div>
  <div class="eu-duo-c eu-duo-or rv">
    <span class="eu-kick">${esc(t.langK)}</span><strong class="eu-duo-h">${esc(t.langH)}</strong><p>${esc(t.langP)}</p>
    <div class="eu-flags">${each(t.flags, ([f, n]) => `<img src="${esc(ctx.asset(`flags/${f}.svg`))}" alt="${esc(n)}" title="${esc(n)}" width="36" height="26">`)}</div>
  </div>
</section>

<section class="wrap sec">
  <div class="eu-team-h rv"><h2 class="h2 eu-h2-40">${esc(t.teamH)}</h2><p class="eu-p">${esc(t.teamP)}</p></div>
  ${team.length || ctx.prod ? '' : `<p class="warn eu-warn">${esc(t.warn)}</p>`}
  <div class="eu-team">${team.length
    // Tím z appky (Marketing → Weby → Tím): meno, funkcia v jazyku stránky, jazyky, fotka.
    ? each(team, (m) => `<div class="eu-member rv"><div class="eu-member-ph"${m.photo ? '' : ' aria-hidden="true"'}>${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">` : mark({ w: 150 })}</div><div class="eu-member-t"><strong>${esc(m.name)}</strong>${(m.role && (m.role[ctx.lang] || m.role.de || m.role.sk)) ? `<span>${esc(m.role[ctx.lang] || m.role.de || m.role.sk)}</span>` : ''}${m.langs ? `<span>${esc(t.langs)}: ${esc(m.langs)}</span>` : ''}</div></div>`)
    : each(t.team, ([role, l]) => `<div class="eu-member rv"><div class="eu-member-ph" aria-hidden="true">${mark({ w: 150 })}</div><div class="eu-member-t"><strong>${esc(role)}</strong><span>${esc(t.langs)}: ${esc(l)}</span></div></div>`)}</div>
</section>

<section class="wrap sec sec-last">
  <div class="eu-band rv">
    <div class="eu-band-mark" aria-hidden="true">${mark({ w: 360, light: true })}</div>
    <div class="eu-band-t"><strong>${esc(t.ctaH)}</strong><span>${esc(t.ctaP)}</span></div>
    <a class="btn btn-primary" href="${esc(ctx.url('contact'))}#form">${esc(t.cta)} →</a>
  </div>
</section>`;
  return { title: t.title, description: t.desc, body, nav: 'about', css: ['css/eu-pages.css'], image: IMG.mont };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
