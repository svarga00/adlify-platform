// ============================================================================
// DANUBRA — prihlásenie kolegov: pozvať do appky, nový odkaz na heslo, stav
// ============================================================================
// Kolegovia sa nevedeli prihlásiť: v Nastaveniach → Používatelia boli
// zapísaní (danubra_members), ale účet v Supabase Auth nemali a „založte ho
// v Supabase → Authentication" nemal kto urobiť. Túto prácu robí funkcia.
//
//   POST { action: 'status' }
//     → { members: [{ member_id, has_account, linked, state: 'none'|'invited'|'active',
//          last_sign_in_at, invited_at, password_set_at, pending, external }], app_url }
//     auth.users appka z prehliadača nevidí — stav prihlásenia povie server.
//
//   POST { action: 'invite', member_id }
//     * účet s tým e-mailom už je → len sa prepojí (danubra_members.user_id),
//     * nie je → založí sa bez hesla (e-mail potvrdený) a prepojí sa,
//     * vráti jednorazový odkaz na nastavenie hesla { link, email, expires_hint }.
//     Odkaz sa nikam neposiela sám — admin ho skopíruje, pošle cez WhatsApp
//     alebo e-mailom (akcia `send`).
//
//   POST { action: 'reset', member_id }   nový odkaz na heslo pre prepojený účet
//   POST { action: 'send', member_id, link, mailbox_id? }
//     pošle odkaz e-mailom zo schránky firmy (app/lib/mail/server.js →
//     sendAndStore). Do appky (Správy) sa uloží text **bez** odkazu.
//
// Bezpečnosť:
//   * smie len prihlásený **aktívny administrátor** (server-guard + rola),
//   * Supabase projekt je spoločný s Adlify: účtu, ktorý nezaložila appka
//     (napr. z Adlify), sa odkaz na heslo nevydá — inak by admin DANUBRA
//     vedel prevziať cudzí účet. Prepojí sa a človek si heslo obnoví sám
//     („Zabudli ste heslo?" na prihlasovacej stránke, odkaz príde jemu),
//   * odkaz vedie do appky s kódom za # (app/lib/prihlasenie.js) — náhľad
//     odkazu vo WhatsAppe ho nespotrebuje; kód sa overí až po kliknutí,
//   * nevracia heslá, kódy ani metadáta účtu; service-role kľúč ostáva tu,
//   * ľahký limit: najviac 20 odkazov za 10 minút na admina a nový odkaz
//     pre toho istého človeka najskôr po 10 sekundách.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL alebo URL (Netlify)
// Testy: node app/tests/member-invite.test.js
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const P = require('../../app/lib/prihlasenie.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const guard = require('../../app/lib/server-guard.js')(supabase);

const APP = process.env.APP_URL || process.env.URL || 'https://adlify-app.netlify.app';
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });
const lower = (s) => String(s || '').trim().toLowerCase();
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// ── Ľahký limit (v pamäti funkcie; stačí proti omylu a dvojkliku) ─────────
const WINDOW_MS = 10 * 60 * 1000;
const MAX_LINKS = 20;
const SAME_MEMBER_MS = 10 * 1000;
const hits = new Map();
function limited(adminId) {
  const now = Date.now();
  const list = (hits.get(adminId) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_LINKS) { hits.set(adminId, list); return true; }
  list.push(now); hits.set(adminId, list);
  return false;
}

// ── Účty v Supabase Auth ─────────────────────────────────────────────────
// Admin API nemá hľadanie podľa e-mailu, takže sa prechádza zoznam po
// stránkach (projekt je spoločný s Adlify — účtov môže byť viac).
async function allUsers() {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message || 'listUsers');
    const batch = (data && data.users) || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}
async function findByEmail(email) {
  const e = lower(email);
  return (await allUsers()).find(u => lower(u.email) === e) || null;
}
async function userById(id) {
  if (!id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data) return null;
  return data.user || null;
}
const ours = (u) => !!(u && u.app_metadata && u.app_metadata.danubra_invited);

async function memberOf(id) {
  if (!id) return null;
  const { data } = await supabase.from('danubra_members')
    .select('id,user_id,email,full_name,active,role').eq('id', id).maybeSingle();
  return data || null;
}

/** Jednorazový odkaz na heslo (vlastný, s kódom za #). */
async function makeLink(user) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery', email: user.email, options: { redirectTo: P.redirectTo(APP) },
  });
  const props = data && data.properties;
  if (error || !props || !props.hashed_token) {
    const e = new Error(error && /rate|seconds|frequen/i.test(error.message || '')
      ? 'Supabase dovolí ďalší odkaz až o chvíľu (zvyčajne o 60 sekúnd). Skúste to znova.'
      : 'Odkaz na heslo sa nepodarilo vytvoriť. Skúste to o chvíľu.');
    e.status = error && Number(error.status) === 429 ? 429 : 502;
    throw e;
  }
  // Kedy dostal posledný odkaz — podľa toho stĺpec „Prihlásenie" ukáže
  // „čaká na heslo". app_metadata sa zlúči, nič iné sa neprepíše.
  await supabase.auth.admin.updateUserById(user.id, { app_metadata: { danubra_link_at: new Date().toISOString() } });
  return P.setLink(APP, props.hashed_token);
}

function tooSoon(user) {
  const at = user && user.app_metadata && user.app_metadata.danubra_link_at;
  return !!at && Date.now() - new Date(at).getTime() < SAME_MEMBER_MS;
}

const linkReply = (link, email, extra = {}) => ({
  ok: true, link, email, expires_hint: P.MSG.note, app_url: P.appAddress(APP), ...extra,
});
const EXTERNAL = 'Tento e-mail už má účet, ktorý nezaložila appka (napríklad z Adlify). '
  + 'Prepojili sme ho — človek sa prihlási svojím doterajším heslom. Ak ho nepozná, '
  + 'nech na prihlasovacej stránke klikne na „Zabudli ste heslo?" a odkaz príde priamo jemu.';

async function invite(member, admin) {
  if (!member) return out(404, { error: 'Človek sa v zozname nenašiel.' });
  if (member.active === false) return out(400, { error: 'Človek má vypnutý prístup — najprv ho zapnite a uložte.' });
  if (!emailOk(member.email)) return out(400, { error: 'Doplňte človeku e-mail — tým sa bude prihlasovať.' });

  let user = await userById(member.user_id);
  if (!user) user = await findByEmail(member.email);
  let created = false;
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: String(member.email).trim(), email_confirm: true,
      user_metadata: { full_name: member.full_name || '' },
      app_metadata: { danubra_invited: true },
    });
    if (error) {
      // Súbeh: medzitým ho niekto založil — vezmi ten.
      user = /exist|registered|already/i.test(error.message || '') ? await findByEmail(member.email) : null;
      if (!user) return out(502, { error: 'Účet sa nepodarilo založiť. Skúste to o chvíľu.' });
    } else {
      user = data && data.user; created = true;
    }
  }

  if (member.user_id !== user.id) {
    const { data: other } = await supabase.from('danubra_members').select('id,full_name').eq('user_id', user.id).limit(5);
    const taken = (other || []).find(o => o.id !== member.id);
    if (taken) return out(409, { error: `Tento účet už má v zozname iný človek (${taken.full_name || 'bez mena'}).` });
    const { error } = await supabase.from('danubra_members').update({ user_id: user.id }).eq('id', member.id);
    if (error) return out(502, { error: 'Účet sa nepodarilo prepojiť s človekom. Skúste to o chvíľu.' });
  }

  if (!created && !ours(user)) return out(200, { ok: true, link: null, linked: true, existing: true, email: user.email, message: EXTERNAL });
  if (!created && tooSoon(user)) return out(429, { error: 'Odkaz ste práve vytvorili — počkajte pár sekúnd.' });
  if (limited(admin)) return out(429, { error: 'Veľa odkazov naraz. Skúste to o niekoľko minút.' });
  const link = await makeLink(user);
  return out(200, linkReply(link, user.email, { created, linked: true }));
}

async function reset(member, admin) {
  if (!member) return out(404, { error: 'Človek sa v zozname nenašiel.' });
  if (member.active === false) return out(400, { error: 'Človek má vypnutý prístup — najprv ho zapnite a uložte.' });
  if (!member.user_id) return out(400, { error: 'Človek ešte nemá účet — použite „Pozvať do appky".' });
  const user = await userById(member.user_id);
  if (!user) return out(404, { error: 'Účet sa nenašiel — pozvite človeka znova („Pozvať do appky").' });
  if (!ours(user)) {
    return out(409, { error: 'Účet nezaložila appka (napríklad je z Adlify), preto odkaz na heslo z bezpečnosti nevydáme. '
      + 'Nech si človek na prihlasovacej stránke klikne na „Zabudli ste heslo?" — odkaz príde priamo jemu.' });
  }
  if (tooSoon(user)) return out(429, { error: 'Odkaz ste práve vytvorili — počkajte pár sekúnd.' });
  if (limited(admin)) return out(429, { error: 'Veľa odkazov naraz. Skúste to o niekoľko minút.' });
  const link = await makeLink(user);
  return out(200, linkReply(link, user.email, { linked: true }));
}

async function status() {
  const { data: members, error } = await supabase.from('danubra_members')
    .select('id,user_id,email,active').limit(1000);
  if (error || !Array.isArray(members)) return out(503, { error: 'Zoznam ľudí sa teraz nedá načítať.' });
  const users = await allUsers();
  const byId = new Map(users.map(u => [u.id, u]));
  const byEmail = new Map(users.filter(u => u.email).map(u => [lower(u.email), u]));
  const rows = members.map(m => {
    const u = (m.user_id && byId.get(m.user_id)) || (m.email && byEmail.get(lower(m.email))) || null;
    const st = P.stateOf(u);
    // Len vybrané polia — nič z účtu navyše (žiadne kódy, metadáta, telefón).
    return {
      member_id: m.id, has_account: st.has_account, linked: !!(u && m.user_id === u.id), state: st.state,
      last_sign_in_at: st.last_sign_in_at, invited_at: st.invited_at, password_set_at: st.password_set_at,
      pending: st.pending, external: st.has_account ? st.external : false,
    };
  });
  return out(200, { ok: true, members: rows, app_url: P.appAddress(APP) });
}

async function send(member, b, g) {
  if (!member || !emailOk(member.email)) return out(400, { error: 'Človek nemá e-mail.' });
  // Odkaz príde z okna appky — pošle sa len náš tvar odkazu, nič iné.
  const link = String(b.link || '');
  const prefix = `${P.redirectTo(APP)}#k=`;
  if (!link.startsWith(prefix) || !/^[A-Za-z0-9_-]{16,256}$/.test(link.slice(prefix.length))) {
    return out(400, { error: 'Neplatný odkaz. Vytvorte nový.' });
  }
  if (limited(g.user.id)) return out(429, { error: 'Veľa odkazov naraz. Skúste to o niekoľko minút.' });
  let mb = null;
  if (b.mailbox_id) {
    const { data } = await supabase.from('danubra_mailboxes').select('*').eq('id', b.mailbox_id).maybeSingle();
    mb = data && data.active !== false ? data : null;
  } else {
    const { data } = await supabase.from('danubra_mailboxes').select('*').eq('active', true).order('created_at').limit(1);
    mb = (data && data[0]) || null;
  }
  if (!mb) return out(400, { error: 'Nie je pripojená žiadna schránka. Pošlite odkaz cez Kopírovať alebo WhatsApp.' });
  const srv = require('../../app/lib/mail/server.js')(supabase);
  const from = (g.member && g.member.full_name) || mb.display_name || mb.name || '';
  const { data: cfg } = await supabase.from('danubra_settings').select('supplier').limit(1);
  const company = (cfg && cfg[0] && cfg[0].supplier && cfg[0].supplier.name) || '';
  const args = { name: member.full_name, email: member.email, appUrl: APP, from, company };
  try {
    await srv.sendAndStore(mb, {
      user: g.user, to: [{ address: String(member.email).trim(), name: member.full_name || '' }],
      subject: P.mailSubject(company), text: P.mailText({ ...args, link }),
      // V Správach zostane e-mail bez odkazu — odkaz je ako heslo.
      store: { text_body: P.mailText({ ...args, link: null }) },
    });
  } catch (e) {
    return out(502, { error: srv.smtpError(e) });
  }
  return out(200, { ok: true, sent_to: member.email, mailbox: mb.email });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const g = await guard.check(event, { admin: true });
  if (!g.ok) return out(g.status, { error: g.error });
  // Prázdna appka (nikto nie je založený) robí z prihláseného admina —
  // tu nie: pozývať smie len skutočný aktívny administrátor zo zoznamu.
  if (!g.member || g.member.role !== 'admin' || g.member.active === false) {
    return out(403, { error: guard.MSG ? guard.MSG.admin : 'Túto akciu smie urobiť len administrátor.' });
  }
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  try {
    if (b.action === 'status') return await status();
    if (!['invite', 'reset', 'send'].includes(b.action)) return out(400, { error: 'Neznáma akcia.' });
    const member = await memberOf(b.member_id);
    if (b.action === 'invite') return await invite(member, g.user.id);
    if (b.action === 'reset') return await reset(member, g.user.id);
    return await send(member, b, g);
  } catch (e) {
    return out(e.status || 502, { error: e.status ? e.message : 'Účty sa teraz nedajú načítať. Skúste to o chvíľu.' });
  }
};
