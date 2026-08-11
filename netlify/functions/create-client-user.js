// Vytvorí klientovi prístup do portálu — auth user + client_users prepojenie.
// Voliteľne pošle magic link.
//
// POST { client_id, email, send_magic_link?: boolean }
//
// Použité v project-detail "Klient prístup" sekcii. Vďaka tomu admin
// rýchlo vytvorí test login pre fake klienta (Adlify / ZámkyExpres / atď.)
// a okamžite vidí ako vyzerá portál keď klient sa prihlási.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin client (service role) na vytváranie auth users
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { client_id, email, send_magic_link } = payload;
  if (!client_id || !email) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing client_id alebo email' }) };
  }

  try {
    // 1. Skontroluj že klient existuje
    const { data: client } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('id', client_id)
      .single();
    if (!client) throw new Error('Klient nenájdený');

    // 2. Skontroluj že user už neexistuje
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let userId;
    let created = false;

    if (existing) {
      userId = existing.id;
      console.log(`[create-client-user] user ${email} už existuje (${userId})`);
    } else {
      // 3. Vytvor auth user
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true, // bez potvrdzovacieho emailu — admin to vytvára pre klienta
        user_metadata: {
          full_name: client.company_name,
          created_via: 'admin_client_setup',
        },
      });
      if (createErr) throw new Error('Auth createUser: ' + createErr.message);
      userId = newUser.user.id;
      created = true;
      console.log(`[create-client-user] vytvorený user ${email} → ${userId}`);
    }

    // 4. Vlož/upsert client_users prepojenie
    const { error: linkErr } = await supabase.from('client_users').upsert({
      user_id: userId,
      client_id,
      role: 'owner',
    }, { onConflict: 'user_id,client_id' });
    if (linkErr) {
      // Try insert s minimal fields ak schéma má rôzne stĺpce
      const { error: insErr } = await supabase.from('client_users').insert({
        user_id: userId,
        client_id,
      });
      if (insErr && !insErr.message.includes('duplicate')) {
        throw new Error('client_users link: ' + insErr.message);
      }
    }

    // 5. Voliteľne magic link
    let magicLinkSent = false;
    if (send_magic_link) {
      try {
        const { error: mailErr } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: (process.env.URL || 'https://adlify.eu') + '/portal/',
          },
        });
        if (!mailErr) magicLinkSent = true;
        else console.warn('[create-client-user] magic link gen error:', mailErr.message);
      } catch (e) {
        console.warn('[create-client-user] magic link failed:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        user_id: userId,
        email,
        created,         // true ak sme práve vytvorili (false ak už existoval)
        linked: true,
        magic_link_sent: magicLinkSent,
        portal_url: (process.env.URL || 'https://adlify.eu') + '/portal/login.html',
      }),
    };
  } catch (err) {
    console.error('[create-client-user] error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
