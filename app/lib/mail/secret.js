// ============================================================================
// DANUBRA — šifrovanie hesiel schránok (len server)
// ============================================================================
// Heslo schránky sa ukladá do databázy zašifrované (AES-256-GCM). Kľúč je
// len na serveri: MAIL_SECRET z Netlify, a keď nie je nastavený, odvodí sa
// zo SUPABASE_SERVICE_ROLE_KEY. Prehliadač kľúč nemá a stĺpec so zašifrovaným
// heslom ani nevidí (práva na stĺpce, migrácia 058).
//
// Pozor: keď sa MAIL_SECRET (alebo service-role kľúč, ak MAIL_SECRET nie je)
// zmení, uložené heslá sa už nedajú rozšifrovať — treba ich zadať znova.
//
// Načítava sa len vo funkciách (Node), nikdy v appke.
// Testy: node app/lib/mail/secret.test.js
// ============================================================================
const crypto = require('crypto');

function key(raw) {
  const base = raw || process.env.MAIL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!base) throw new Error('Chýba kľúč na šifrovanie hesiel (MAIL_SECRET).');
  return crypto.createHash('sha256').update(`danubra-mail:${base}`).digest();
}

/** Heslo → „v1:iv:tag:dáta" (base64). */
function encrypt(plain, raw) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(raw), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(enc, raw) {
  const [v, iv, tag, data] = String(enc || '').split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Heslo schránky nie je uložené — zadajte ho v Nastaveniach.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(raw), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  try {
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    throw new Error('Heslo schránky sa nedá rozšifrovať (zmenil sa kľúč) — zadajte ho znova v Nastaveniach.');
  }
}

/** Podpísaný kľúč pre automatické spúšťanie (cron → synchronizácia), platí 2 hodiny. */
function cronToken(date = new Date(), raw) {
  const h = new Date(date).toISOString().slice(0, 13);
  return crypto.createHmac('sha256', key(raw)).update(`cron:${h}`).digest('hex');
}
function cronOk(token, now = new Date(), raw) {
  const t = String(token || '');
  return [0, -1].some((d) => {
    const x = cronToken(new Date(new Date(now).getTime() + d * 3600e3), raw);
    return t.length === x.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(x));
  });
}

module.exports = { encrypt, decrypt, cronToken, cronOk };
