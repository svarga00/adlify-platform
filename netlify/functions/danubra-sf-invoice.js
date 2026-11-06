// ============================================================================
// DANUBRA — SuperFaktúra: vystavenie, PDF, odoslanie, úhrada, synchronizácia
// ============================================================================
// Frontend volá túto funkciu, nie SuperFaktúru. API kľúč nikdy neopustí
// server — ani v odpovedi, ani v histórii faktúry.
//
// Dve veci, na ktorých táto funkcia stojí:
//
//   1. **Stav sa overuje v databáze, nie podľa toho, čo poslal prehliadač.**
//      Keby stačilo poslať `{action:'issue'}`, dalo by sa schvaľovanie obísť
//      jedným requestom z konzoly.
//   2. **Nikdy sa nesmie stať, že doklad vznikol v SuperFaktúre a appka
//      o tom nevie.** `sf_invoice_id` sa zapisuje hneď po odpovedi a pri
//      akejkoľvek neistote sa doklad najprv hľadá — nevystaví sa druhýkrát.
//
// Akcie (POST { action, invoice_id?, … }):
//   status      stav pripojenia (bez kľúčov)            člen s Vydanými faktúrami
//   ping        overí prihlásenie, vráti názov firmy     admin
//   issue       vystaví schválenú faktúru / dobropis     admin + schválenie v DB
//   send        odošle e-mailom cez SuperFaktúru         admin
//   mark_sent   zapíše „odoslaná" po odoslaní z našej schránky   admin
//   cancel      pripraví dobropis (čaká na schválenie)   admin, dôvod povinný
//   pdf         PDF zo SuperFaktúry do Dokumentov        člen s Vydanými faktúrami
//   pay         zapíše úhradu (aj do SuperFaktúry)       člen s Vydanými faktúrami
//   sync        stav úhrady zo SuperFaktúry (invoice_id alebo všetky)
//
// Premenné prostredia:
//   SF_EMAIL      e-mail účtu v SuperFaktúre
//   SF_API_KEY    API token  — bez neho funkcia povie, čo chýba, a skončí
//   SF_COMPANY_ID voliteľné, keď je pod účtom viac firiem
//   SF_ENV        sandbox | production   (predvolene sandbox; ostrý účet len
//                 pri presnom „production" a až po odsúhlasení majiteľom)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const { createService } = require('../../app/lib/billing/sf-service.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
// Všetko smie len člen s právom na Vydané faktúry. Bez toho by stačilo poznať
// id faktúry a poslať požiadavku z hocikade.
const guard = require('../../app/lib/server-guard.js')(supabase);

const ACTIONS = ['status', 'ping', 'issue', 'send', 'mark_sent', 'cancel', 'pdf', 'pay', 'sync'];
// Doklad vzniká, odchádza alebo sa ruší — to smie len administrátor.
const ADMIN = ['ping', 'issue', 'send', 'mark_sent', 'cancel'];
const NEEDS_INVOICE = ['issue', 'send', 'mark_sent', 'cancel', 'pdf', 'pay'];

const reply = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Len POST.' });
  }
  const g = await guard.check(event, { key: 'invoices' });
  if (!g.ok) return reply(g.status, { error: g.error });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Neplatné telo požiadavky.' }); }

  const action = body.action;
  if (!ACTIONS.includes(action)) {
    return reply(400, { error: `Neznáma akcia. Povolené: ${ACTIONS.join(', ')}.` });
  }
  if (ADMIN.includes(action)) {
    const a = await guard.check(event, { key: 'invoices', admin: true });
    if (!a.ok) return reply(a.status, { error: a.error });
  }

  // Služba sa skladá pri každej požiadavke — SF_ENV a kľúče sa čítajú vždy čerstvé.
  const sf = createService({ supabase, env: process.env });
  if (action === 'status') return reply(200, { ok: true, ...sf.config() });

  if (!process.env.SF_API_KEY || !process.env.SF_EMAIL) {
    // Bez kľúča sa nič nerozbije — funkcia povie, čo chýba, a skončí.
    return reply(200, {
      skipped: true,
      reason: 'no_sf_credentials',
      environment: sf.env,
      message: 'SF_EMAIL a SF_API_KEY nie sú nastavené. Faktúra zostala '
        + 'v stave „schválená" a dá sa vystaviť, keď kľúče pribudnú.',
      hint: 'Administrátor ich nastaví v Netlify → Site configuration → Environment variables a stránku nasadí znova.',
    });
  }

  const id = body.invoice_id;
  if (NEEDS_INVOICE.includes(action) && !id) return reply(400, { error: 'Chýba invoice_id.' });
  const actor = g.user && g.user.id;

  try {
    let r;
    if (action === 'ping') r = await sf.ping();
    else if (action === 'issue') r = await sf.issue(id, { actor });
    else if (action === 'send') r = await sf.send(id, { cc: body.cc, actor });
    else if (action === 'mark_sent') r = await sf.markSent(id, { to: body.to, actor });
    else if (action === 'cancel') r = await sf.cancel(id, { reason: body.reason, actor });
    else if (action === 'pdf') r = await sf.pdf(id, { force: !!body.force, actor });
    else if (action === 'pay') r = await sf.pay(id, { actor });
    else if (action === 'sync') r = id ? await sf.sync(id, { actor }) : await sf.syncAll({ actor });
    return reply(r.status, r.body);
  } catch (e) {
    // Chyba sa zapíše k faktúre celá. Stav sa nemení — faktúra zostane
    // schválená a dá sa skúsiť znova.
    if (id) {
      await supabase.from('danubra_invoices')
        .update({ sf_error: String(e.message).slice(0, 2000) })
        .eq('id', id);
    }
    return reply(502, { error: String(e.message), code: e.code || undefined,
      hint: e.hint || 'Skúste to znova. Ak to trvá, pozrite históriu faktúry.' });
  }
};
