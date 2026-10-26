// ============================================================================
// punds.eu — hlavná stránka pre nemecké firmy (návrh 1b)
// ============================================================================
// Kotvy pre hlavičku: #gewerke, #modelle, #ablauf (+ #anfrage = formulár).
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const PROF = require('../../shared/professions');
const { IMG } = require('../../shared/jobs');
const { PHONE, MAIL, tel, T: C } = require('../common');
const { enquiryForm, phoneIco } = require('./contact');

const T = {
  de: {
    title: 'Fachkräfte aus der Slowakei für Ihre Baustelle | punds',
    desc: 'Erfahrene Handwerker und eingespielte Teams aus der Slowakei für Bau- und Industrieprojekte in Deutschland – im Werkvertrag, mit vollständigen Unterlagen und festem Ansprechpartner.',
    eyebrow: 'Handwerker-Teams aus der Slowakei',
    h1: 'Zuverlässige Fachkräfte für Ihre Baustelle.',
    sub: 'Wir stellen erfahrene Handwerker und eingespielte Teams für Bau- und Industrieprojekte in ganz Deutschland – mit vollständigen Unterlagen und festem Ansprechpartner.',
    cta: 'Anfrage senden', ctaSec: 'Gewerke ansehen',
    photos: ['Schweißer bei der Arbeit', 'Montage auf der Baustelle', 'Malerarbeiten im Innenausbau'],
    tradesH: 'Unsere Gewerke', tradesP: 'Einzelne Fachkräfte oder eingespielte Teams. Wählen Sie ein Gewerk für Details und eine direkte Anfrage.',
    modelsH: 'Zwei Wege der Zusammenarbeit',
    aueg: 'Arbeitnehmerüberlassung nur mit gültiger Erlaubnis nach AÜG – wir klären das vor Projektbeginn mit Ihnen.',
    whyH: 'Was Sie erwarten können',
    why: [['Vollständige Unterlagen', 'A1, Gewerbe, Steuernummer und Freistellung liegen vor Projektstart vor.'], ['Unterkunft & Anreise', 'Wir organisieren Wohnen und Transport.'],
      ['Deutschsprachiger Ansprechpartner', 'Eine Person koordiniert Einsatz, Ersatz und Abrechnung.'], ['Flexible Teamgröße', 'Vom einzelnen Fachmann bis zur kompletten Kolonne.']],
    conH: 'Fachkräfte anfragen', conSub: 'Wir melden uns innerhalb eines Werktages.',
    proc: [['Anfrage', 'Gewerk, Ort, Zeitraum, Anzahl.'], ['Angebot', 'Passende Profile und Konditionen.'], ['Einsatz', 'Anreise, Unterkunft, Start auf der Baustelle.']],
    direct: 'Lieber direkt?', msgPh: 'Weitere Angaben zum Projekt (optional)',
  },
  en: {
    title: 'Skilled tradespeople from Slovakia for your construction site | punds',
    desc: 'Experienced tradespeople and well-rehearsed crews from Slovakia for construction and industrial projects in Germany – fully documented, with one point of contact.',
    eyebrow: 'Skilled trade crews from Slovakia',
    h1: 'Reliable tradespeople for your construction site.',
    sub: 'We supply experienced tradespeople and well-rehearsed crews for construction and industrial projects across Germany – fully documented, with one point of contact.',
    cta: 'Send enquiry', ctaSec: 'See trades',
    photos: ['Welder at work', 'Installation on site', 'Interior painting work'],
    tradesH: 'Our trades', tradesP: 'Individual specialists or well-rehearsed crews. Choose a trade for details and a direct enquiry.',
    modelsH: 'Two ways to work together',
    aueg: 'Temporary staffing (Arbeitnehmerüberlassung) only with a valid licence under the German AÜG – we clarify this with you before the project starts.',
    whyH: 'What you can expect',
    why: [['Complete documentation', 'A1, trade licence, tax number and Freistellung in place before day one.'], ['Housing & travel', 'We organise accommodation and transport.'],
      ['German-speaking contact', 'One person coordinates deployment, replacements and billing.'], ['Flexible team size', 'From a single specialist to a full crew.']],
    conH: 'Request tradespeople', conSub: 'We’ll get back to you within one working day.',
    proc: [['Enquiry', 'Trade, location, timeframe, headcount.'], ['Proposal', 'Matching profiles and terms.'], ['Deployment', 'Travel, housing, start on site.']],
    direct: 'Prefer to talk?', msgPh: 'Further project details (optional)',
  },
};

const pad = (i) => String(i + 1).padStart(2, '0');

async function render(ctx) {
  const t = T[ctx.lang];
  const c = C[ctx.lang];
  const trades = PROF.euTrades();
  const photos = [IMG.weld, IMG.mont, IMG.paint];
  const body = `
<section class="eu-hero">
  <div class="eu-hero-mark" aria-hidden="true">${mark({ w: 640, light: true })}</div>
  <div class="wrap eu-hero-in rv-in">
    <span class="eu-pill"><span class="eu-dot" aria-hidden="true"></span>${esc(t.eyebrow)}</span>
    <h1 class="eu-h1">${esc(t.h1)}</h1>
    <p class="eu-hero-sub">${esc(t.sub)}</p>
    <div class="eu-ctas"><a class="btn btn-primary" href="${esc(ctx.url('contact'))}#form">${esc(t.cta)} →</a><a class="btn eu-btn-line" href="#gewerke">${esc(t.ctaSec)}</a></div>
  </div>
  <div class="wrap eu-hero-photos">${each(photos, (src, i) => `<img class="eu-ph-${i + 1}" src="${esc(src)}" alt="${esc(t.photos[i])}" width="960" height="680"${i ? ' loading="lazy"' : ''} decoding="async">`)}</div>
</section>

<section class="wrap sec eu-trades" id="gewerke">
  <div class="eu-trades-h rv"><h2 class="h2">${esc(t.tradesH)}</h2><p class="eu-p">${esc(t.tradesP)}</p></div>
  <div class="eu-tlist">${each(trades, (p, i) => `<a class="eu-trade rv" href="${esc(ctx.url('trade', { slug: p.eu.slug[ctx.lang] }))}"><strong>${esc(p.eu.name[ctx.lang])}</strong><span>${pad(i)}</span></a>`)}</div>
</section>

<section class="wrap sec eu-models" id="modelle">
  <h2 class="h2 rv">${esc(t.modelsH)}</h2>
  <div class="eu-mgrid">${each(c.models, ([h, p], i) => `<div class="eu-model lift rv"><span class="eu-num">${pad(i)}</span><strong>${esc(h)}</strong><p>${esc(p)}</p>${i === 1 ? `<p class="eu-note">${esc(t.aueg)}</p>` : ''}</div>`)}</div>
</section>

<section class="wrap sec">
  <div class="eu-why rv">
    <h2 class="h2">${esc(t.whyH)}</h2>
    <div class="eu-why-g">${each(t.why, ([h, p]) => `<div><strong>${esc(h)}</strong><span>${esc(p)}</span></div>`)}</div>
  </div>
</section>

<section class="wrap sec sec-last eu-enq" id="ablauf">
  <div class="eu-enq-l rv">
    <h2 class="h2">${esc(t.conH)}</h2>
    <p class="eu-p">${esc(t.conSub)}</p>
    <ol class="eu-proc">${each(t.proc, ([h, p], i) => `<li><span>${i + 1}</span><div><strong>${esc(h)}</strong><span>${esc(p)}</span></div></li>`)}</ol>
    <div class="eu-direct"><strong>${esc(t.direct)}</strong><a href="${tel(PHONE)}">${esc(PHONE)}</a><a class="or" href="mailto:${MAIL}">${esc(MAIL)}</a></div>
  </div>
  <div class="eu-enq-f rv" id="anfrage">${enquiryForm(ctx, { variant: 'compact', id: 'h', messagePh: t.msgPh })}</div>
</section>
<div class="mcta"><a class="btn btn-primary" href="#anfrage">${esc(t.cta)} →</a><a class="btn btn-dark btn-call" href="${tel(PHONE)}" aria-label="${esc(c.call)}">${phoneIco}</a></div>`;
  return { title: t.title, description: t.desc, body, css: ['css/eu-pages.css'], bodyClass: 'has-mcta', image: IMG.weld };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
