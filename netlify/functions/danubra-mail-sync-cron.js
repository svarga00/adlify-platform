// ============================================================================
// DANUBRA — Pošta: každých 10 minút stiahnuť nové e-maily
// ============================================================================
// Naplánovaná funkcia smie bežať len pár sekúnd, preto len spustí
// synchronizáciu na pozadí (danubra-mail-sync-background) s podpísaným
// kľúčom, ktorý platí dve hodiny (lib/mail/secret.js → cronToken).
// ============================================================================
const S = require('../../app/lib/mail/secret.js');

exports.handler = async () => {
  const site = process.env.URL || 'https://adlify-app.netlify.app';
  try {
    await fetch(`${site}/.netlify/functions/danubra-mail-sync-background`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-danubra-cron': S.cronToken() }, body: '{}',
    });
  } catch (e) { /* ďalší pokus o 10 minút */ }
  return { statusCode: 200, body: 'ok' };
};
