// ============================================================================
// DANUBRA — je nastavené posielanie e-mailov? (bez tajomstiev)
// ============================================================================
// Appka sa pred rozoslaním opýta, či sú v Netlify doplnené údaje schránky.
// Vracia len áno/nie a adresu odosielateľa — heslo ani server nikdy.
// ============================================================================
exports.handler = async () => {
  const ready = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ smtp: ready, from: ready ? process.env.SMTP_FROM : null,
      ai: !!process.env.ANTHROPIC_API_KEY }),
  };
};
