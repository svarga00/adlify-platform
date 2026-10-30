// ============================================================================
// DANUBRA — prezentácia punds pre firmu (PDF, 4 strany A4 na šírku, DE)
// ============================================================================
// „…prípadne s prezentáciou v prílohe, prispôsobenou konkrétnemu hľadaniu."
//
//   1  Titul       „Ihr Partner für Trockenbau in Bayern", pre koho, kontakt
//   2  Wer wir sind  o nás, štyri zásady, Vaše remeslo (typické práce),
//                  jazyky
//   3  Ablauf      štyri kroky od dopytu po nasadenie, čo dostanete
//   4  Konditionen podmienky (Werkvertrag, hodinová fakturácia, doklady,
//                  ubytovanie, materiál), ceny len z Nastavení, kontakt,
//                  Impressum
//
// Prečo A4 na šírku a nie 16:9: číta sa na obrazovke ako snímky (pomer
// 1,41 je blízko 16:9), ale stavbyvedúci si ju vytlačí na bežnú A4 bez
// zmenšovania a bez okrajov navyše.
//
// Texty sú z pitch.js (prevzaté z punds.eu) a z Nastavení
// (marketing.presentation). Nič sa nevymýšľa: ceny, referencie, počty ľudí
// sa ukážu len vtedy, keď sú v Nastaveniach. Súbor má ~20 kB (vektor,
// písmo sa nevkladá) — príloha nezaťaží schránku ani spamový filter.
//
// Testy: node app/lib/marketing/presentation.test.js
// ============================================================================
'use strict';

const { Doc, A4_LANDSCAPE } = require('../documents/pdf-mini.js');
const Pitch = require('./pitch.js');

const INK = '#0E1626', OR = '#F07F1A', STEEL = '#8C97AD', T2 = '#4A5570', T3 = '#6F7A92', CHALK = '#F4F4F1', LINE = '#E6E8EC', WHITE = '#FFFFFF';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const EU_PHONE = '+421 910 523 958', EU_MAIL = 'info@punds.eu', EU_WEB = 'punds.eu';

const clean = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** Logo: znak + slovo „punds" + „PARTNER UND SERVICE". */
function logo(p, x, y, { dark = false, size = 1 } = {}) {
  p.mark(x, y, 34 * size, { a: dark ? WHITE : INK, b: OR });
  p.text('punds', x + 42 * size, y + 20 * size, { size: 24 * size, font: 'B', color: dark ? WHITE : INK, cs: -0.9 * size });
  p.text('PARTNER UND SERVICE', x + 43 * size, y + 30 * size, { size: 5.6 * size, color: dark ? STEEL : T3, cs: 1.4 * size });
}

/** Spoločná hlavička a päta strán 2–4. */
function frame(p, doc, { title, kicker, page, total }) {
  const { w, h } = doc;
  logo(p, 48, 34, { size: 0.72 });
  p.text(kicker.toUpperCase(), w - 48, 48, { size: 8, font: 'B', color: OR, cs: 1.4, align: 'right' });
  p.line(48, 70, w - 48, 70, { stroke: LINE, lw: 0.8 });
  p.para(title, 48, 88, 560, { size: 26, font: 'B', color: INK, lead: 1.12, cs: -0.4 });
  p.line(48, h - 40, w - 48, h - 40, { stroke: LINE, lw: 0.8 });
  p.text('punds · Partner und Service s. r. o.', 48, h - 24, { size: 8, color: T3 });
  p.text(`Seite ${page} / ${total}`, w - 48, h - 24, { size: 8, color: T3, align: 'right' });
}

/** Malý oranžový štvorček ako odrážka (žiadne obrázkové znaky). */
const bullet = (p, x, y, c = OR) => p.rect(x, y - 5.5, 5, 5, { fill: c, r: 1 });

/**
 * Prezentácia ako PDF.
 * @param {Object} o {
 *   pitch     výsledok pitch.pitch() (remeslo, región, texty z Nastavení),
 *   lead      firma (meno do titulu),
 *   supplier  fakturačné údaje z Nastavení (Impressum),
 *   contact   { name, role, phone, email } — kto firmu oslovuje,
 *   date      dátum (mesiac v titule) }
 * @returns {{ buffer: Buffer, pages: number, fileName: string, size: number, title: string }}
 */
function build({ pitch, lead = {}, supplier = {}, contact = {}, date = new Date() } = {}) {
  const P = pitch || Pitch.pitch({ lead });
  const T = P.texts || Pitch.texts(null);
  const tr = P.trade;
  const reg = P.region || { name: '', phrase: '' };
  const total = 4;
  const doc = new Doc({ size: A4_LANDSCAPE, lang: 'de-DE', info: {
    title: P.title, author: clean(supplier.name) || 'Partner und Service s. r. o.', date,
    subject: `${tr.team} aus der Slowakei${reg.name ? ` für ${reg.name}` : ''}`, keywords: ['punds', tr.label, reg.name].filter(Boolean).join(', '),
  } });
  const { w, h } = doc;
  const who = {
    name: clean(contact.name) || clean(T.contact_name) || '',
    role: clean(contact.role) || clean(T.contact_role) || '',
    phone: clean(contact.phone) || clean(T.contact_phone) || clean(supplier.phone) || EU_PHONE,
    email: clean(contact.email) || clean(T.contact_email) || clean(supplier.email) || EU_MAIL,
  };
  const d = new Date(date);
  const month = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  // ── 1. Titul ────────────────────────────────────────────────────────────
  {
    const p = doc.page();
    p.rect(0, 0, w, h, { fill: INK });
    p.mark(w - 430, h - 320, 520, { a: WHITE, b: WHITE, alpha: 0.06 });
    p.rect(w - 14, 0, 14, h, { fill: OR });
    logo(p, 56, 50, { dark: true, size: 1.1 });
    // Pilulka nad nadpisom (ako na punds.eu)
    const eyebrow = 'Handwerker-Teams aus der Slowakei';
    const ew = doc.measure(eyebrow, 9.5, 'B', 0.3) + 34;
    p.rect(56, 160, ew, 24, { fill: '#1B2638', r: 12 });
    p.circle(70, 172, 3.5, { fill: OR });
    p.text(eyebrow, 82, 175.5, { size: 9.5, font: 'B', color: WHITE, cs: 0.3 });
    let y = 200;
    y = p.para('Ihr Partner für', 56, y, 600, { size: 40, font: 'B', color: WHITE, lead: 1.08, cs: -1 });
    y = p.para(tr.label, 56, y, 640, { size: 40, font: 'B', color: OR, lead: 1.08, cs: -1 });
    if (reg.name) y = p.para(`in ${reg.name}`, 56, y, 640, { size: 40, font: 'B', color: WHITE, lead: 1.08, cs: -1 });
    p.para('Erfahrene Handwerker und eingespielte Teams für Ihre Baustellen – mit vollständigen Unterlagen und einem festen, deutschsprachigen Ansprechpartner.',
      56, y + 18, 470, { size: 13, color: STEEL, lead: 1.5 });
    if (clean(lead.name)) {
      p.text('VORBEREITET FÜR', 56, h - 96, { size: 7.5, font: 'B', color: STEEL, cs: 1.4 });
      p.text(`${clean(lead.name, 80)} · ${month}`, 56, h - 78, { size: 12, font: 'B', color: WHITE });
    }
    const line = [EU_WEB, who.phone, who.email].filter(Boolean).join('   ·   ');
    p.text(line, 56, h - 44, { size: 10, color: STEEL });
    p.link(56, h - 56, doc.measure(EU_WEB, 10), 16, `https://${EU_WEB}`);
  }

  // ── 2. Wer wir sind + Gewerk ────────────────────────────────────────────
  {
    const p = doc.page();
    frame(p, doc, { title: T.whyH, kicker: 'Über uns', page: 2, total });
    let y = p.para(T.about, 48, 130, 360, { size: 11, color: T2, lead: 1.55 });
    y = p.para(T.why, 48, y + 8, 360, { size: 11, color: T2, lead: 1.55 });
    // Zásady 2 × 2
    const bw = 174, bh = 92, gx = 12;
    T.values.slice(0, 4).forEach(([title, text], i) => {
      const x = 48 + (i % 2) * (bw + gx), yy = Math.max(y + 18, 262) + Math.floor(i / 2) * (bh + 12);
      p.rect(x, yy, bw, bh, { fill: CHALK, r: 10 });
      p.text(String(i + 1).padStart(2, '0'), x + 14, yy + 22, { size: 10, font: 'B', color: OR });
      p.text(title, x + 36, yy + 22, { size: 10.5, font: 'B', color: INK });
      p.para(text, x + 14, yy + 32, bw - 28, { size: 9, color: T2, lead: 1.45, maxLines: 4 });
    });
    p.para(T.languages, 48, h - 74, 360, { size: 9, color: T3, lead: 1.4 });
    // Vaše remeslo
    const cx = 440, cw = w - 48 - cx;
    p.rect(cx, 124, cw, 400, { fill: INK, r: 14 });
    p.mark(cx + cw - 120, 124 + 400 - 100, 130, { a: WHITE, b: WHITE, alpha: 0.06 });
    p.text('IHR GEWERK', cx + 26, 152, { size: 8, font: 'B', color: OR, cs: 1.4 });
    let yy = p.para(tr.label, cx + 26, 162, cw - 52, { size: 20, font: 'B', color: WHITE, lead: 1.15, cs: -0.3 });
    yy = p.para(`${tr.team} – als einzelne Fachkraft oder eingespieltes Team${reg.name ? `, für Ihre Baustellen ${reg.phrase}` : ''}.`,
      cx + 26, yy + 6, cw - 52, { size: 10, color: STEEL, lead: 1.45 });
    yy += 14;
    for (const t of tr.tasks.slice(0, 5)) {
      bullet(p, cx + 26, yy + 10);
      yy = p.para(t, cx + 40, yy, cw - 72, { size: 10.5, color: WHITE, lead: 1.4 }) + 7;
    }
    if (P.also && P.also.length) {
      p.line(cx + 26, yy + 6, cx + cw - 26, yy + 6, { stroke: '#26324A', lw: 0.8 });
      p.para(`Auf Wunsch auch: ${P.also.map(t => t.team).join(', ')}.`, cx + 26, yy + 16, cw - 52, { size: 9.5, color: STEEL, lead: 1.4 });
    }
  }

  // ── 3. Ablauf ───────────────────────────────────────────────────────────
  {
    const p = doc.page();
    frame(p, doc, { title: 'So läuft ein Einsatz ab', kicker: 'Ablauf', page: 3, total });
    p.para('Von der Anfrage bis zum ersten Arbeitstag – ein fester Ansprechpartner koordiniert alles.', 48, 126, 600, { size: 11.5, color: T2 });
    const steps = T.steps.map(([a, b]) => [a, b.replace('{team}', tr.team)]);
    const gap = 14, sw = (w - 96 - gap * 3) / 4;
    steps.forEach(([title, text], i) => {
      const x = 48 + i * (sw + gap), y = 166;
      p.rect(x, y, sw, 150, { fill: CHALK, r: 12 });
      p.circle(x + 30, y + 32, 15, { fill: OR });
      p.text(String(i + 1), x + 30, y + 37, { size: 13, font: 'B', color: WHITE, align: 'center' });
      if (i < 3) p.rect(x + sw + 3, y + 31, gap - 6, 2, { fill: OR });
      p.text(title, x + 18, y + 72, { size: 12.5, font: 'B', color: INK });
      p.para(text, x + 18, y + 82, sw - 36, { size: 10, color: T2, lead: 1.45, maxLines: 4 });
    });
    p.text('WAS SIE VON UNS ERHALTEN', 48, 352, { size: 8, font: 'B', color: OR, cs: 1.4 });
    const incl = ['Profile mit Qualifikation und Nachweisen vor Einsatzbeginn', 'Vollständige Unterlagen – A1, Gewerbe, Freistellung – vor Projektstart',
      'Unterkunft und Anreise organisiert', 'Ein deutschsprachiger Ansprechpartner für Einsatz, Ersatz und Abrechnung',
      'Abrechnung nach Stunden mit Stundennachweis', 'Ersatz bei Ausfall – schnell und ohne Umwege'];
    const colW = (w - 96 - 30) / 2;
    let ry = 370;
    for (let i = 0; i < incl.length; i += 2) {
      let bottom = ry + 22;
      incl.slice(i, i + 2).forEach((t, j) => {
        const x = 48 + j * (colW + 30);
        p.rect(x, ry, 20, 20, { fill: CHALK, r: 10 });
        p.rect(x + 7, ry + 7, 6, 6, { fill: OR, r: 1 });
        bottom = Math.max(bottom, p.para(t, x + 30, ry + 3, colW - 30, { size: 10.5, color: INK, lead: 1.35, maxLines: 2 }));
      });
      ry = bottom + 14;
    }
  }

  // ── 4. Konditionen + Kontakt ────────────────────────────────────────────
  {
    const p = doc.page();
    frame(p, doc, { title: 'Konditionen und Kontakt', kicker: 'Zusammenarbeit', page: 4, total });
    let y = 130;
    for (const [title, text] of T.conditions) {
      bullet(p, 48, y + 10);
      p.text(title, 62, y + 10, { size: 11, font: 'B', color: INK });
      y = p.para(text, 62, y + 15, 400, { size: 9.8, color: T2, lead: 1.45, maxLines: 3 }) + 10;
    }
    p.rect(48, y + 2, 414, 0, {});
    const priceBox = (label, text, yy) => {
      const lines = doc.wrap(text, 10, 'R', 380);
      const bh = 30 + lines.length * 14.5;
      p.rect(48, yy, 414, bh, { fill: CHALK, r: 10 });
      p.text(label, 64, yy + 20, { size: 8, font: 'B', color: OR, cs: 1.2 });
      p.para(text, 64, yy + 26, 380, { size: 10, color: INK, lead: 1.45 });
      return yy + bh + 10;
    };
    y = priceBox('PREISE', T.prices, y + 4);
    if (clean(T.references)) y = priceBox('REFERENZEN', clean(T.references, 400), y);
    // Kontakt
    const cx = 492, cw = w - 48 - cx;
    p.rect(cx, 124, cw, 300, { fill: INK, r: 14 });
    p.text('IHR ANSPRECHPARTNER', cx + 26, 152, { size: 8, font: 'B', color: OR, cs: 1.4 });
    let cy = p.para(who.name || 'Team punds', cx + 26, 162, cw - 52, { size: 20, font: 'B', color: WHITE, lead: 1.15 });
    if (who.role) cy = p.para(who.role, cx + 26, cy + 2, cw - 52, { size: 10.5, color: STEEL });
    cy += 18;
    const row = (label, value, url) => {
      if (!value) return;
      p.text(label, cx + 26, cy + 10, { size: 8, font: 'B', color: STEEL, cs: 1 });
      p.text(value, cx + 92, cy + 10, { size: 11, font: 'B', color: WHITE });
      if (url) p.link(cx + 92, cy - 2, doc.measure(value, 11, 'B'), 16, url);
      cy += 24;
    };
    row('TELEFON', who.phone, `tel:${who.phone.replace(/[^\d+]/g, '')}`);
    row('E-MAIL', who.email, `mailto:${who.email}`);
    row('WEB', EU_WEB, `https://${EU_WEB}`);
    p.para('Antworten Sie einfach auf unsere E-Mail oder rufen Sie an: Gewerk, Ort, Zeitraum und Anzahl genügen. Wir melden uns innerhalb eines Werktages.',
      cx + 26, cy + 10, cw - 52, { size: 10, color: STEEL, lead: 1.5 });
    p.rect(cx, 436, cw, 60, { fill: OR, r: 14 });
    p.para(reg.name ? `${tr.team} für ${reg.name} anfragen` : `${tr.team} anfragen`, cx + 26, 452, cw - 52, { size: 13, font: 'B', color: WHITE, maxLines: 2 });
    p.link(cx, 436, cw, 60, `mailto:${who.email}?subject=${encodeURIComponent(`Anfrage ${tr.label}`)}`);
    // Impressum
    const imp = [clean(supplier.name) || 'Partner und Service s. r. o.', clean(supplier.address),
      supplier.vat_id ? `USt-IdNr.: ${clean(supplier.vat_id)}` : '', supplier.company_id ? `Reg.-Nr.: ${clean(supplier.company_id)}` : '',
      clean(supplier.register)].filter(Boolean).join(' · ');
    p.para(imp, 48, h - 70, w - 96, { size: 7.5, color: T3, lead: 1.4, maxLines: 2 });
  }

  const buffer = doc.toBuffer();
  return { buffer, pages: total, fileName: P.fileName || 'punds.pdf', size: buffer.length, title: P.title };
}

module.exports = { build };
