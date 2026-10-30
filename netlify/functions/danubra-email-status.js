// ============================================================================
// DANUBRA — je nastavené posielanie e-mailov? (bez tajomstiev)
// ============================================================================
// Appka sa pred rozoslaním opýta, či sú v Netlify doplnené údaje schránky.
// Vracia len áno/nie a adresu odosielateľa — heslo ani server nikdy.
// Rovnako pre hľadanie firiem: či je zapnutý Outscraper (len áno/nie a strop
// záznamov na hľadanie, nikdy kľúč).
// ============================================================================
const Outscraper = require('../../app/lib/marketing/outscraper.js');

exports.handler = async () => {
  const ready = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ smtp: ready, from: ready ? process.env.SMTP_FROM : null,
      ai: !!process.env.ANTHROPIC_API_KEY,
      outscraper: !!String(process.env.OUTSCRAPER_API_KEY || '').trim(),
      outscraper_max: Outscraper.maxRecords(process.env.OUTSCRAPER_MAX_RECORDS) }),
  };
};
