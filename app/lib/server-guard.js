// ============================================================================
// DANUBRA — kto smie volať serverovú funkciu (len Node, netlify/functions)
// ============================================================================
// Funkcie pracujú so service-role kľúčom, takže RLS ich nechráni. Prihlásenie
// samo nestačí: Supabase projekt je spoločný s Adlify, a teda platný prístupový
// kľúč (JWT) má aj človek, ktorý do DANUBRA nikdy pozvaný nebol. Preto:
//
//   1. JWT z hlavičky Authorization → používateľ (supabase.auth.getUser),
//   2. musí byť aktívny člen danubra_members (rovnaké pravidlo ako
//      danubra_can() v databáze: kým nie je založený nikto, smie každý
//      prihlásený — inak by sa prvý človek zamkol von),
//   3. voliteľne právo na obrazovku/právomoc (perm.js) alebo admin.
//
//   const guard = require('../../app/lib/server-guard.js')(supabase);
//   const g = await guard.check(event, { key: 'invoices' });
//   if (!g.ok) return { statusCode: g.status, body: JSON.stringify({ error: g.error }) };
//
// Testy: node app/lib/server-guard.test.js
// ============================================================================
const Perm = require('./perm.js');

const MSG = {
  login: 'Neprihlásený používateľ. Prihláste sa znova.',
  member: 'Do appky DANUBRA nemáte prístup. Požiadajte administrátora o pozvanie.',
  key: 'Na túto akciu nemáte oprávnenie.',
  admin: 'Túto akciu smie urobiť len administrátor.',
};

function tokenFrom(event) {
  const h = (event && event.headers) || {};
  return String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
}

module.exports = function guard(supabase) {
  async function user(event) {
    const jwt = tokenFrom(event);
    if (!jwt) return null;
    try {
      const { data } = await supabase.auth.getUser(jwt);
      return (data && data.user) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {Object} event  Netlify event
   * @param {{ key?: string, admin?: boolean }} [opts]
   * @returns {Promise<{ ok: true, user, member } | { ok: false, status: number, error: string }>}
   */
  async function check(event, opts = {}) {
    const u = await user(event);
    if (!u) return { ok: false, status: 401, error: MSG.login };
    const { data, error } = await supabase.from('danubra_members')
      .select('user_id,role,modules,active').limit(1000);
    // Keď sa členovia nedajú prečítať, radšej nepustiť (nie „prázdna appka").
    if (error || !Array.isArray(data)) return { ok: false, status: 503, error: 'Overenie prístupu teraz nefunguje. Skúste to o chvíľu.' };
    const members = data;
    const me = members.find(m => m.user_id === u.id && m.active !== false) || null;
    if (!Perm.bootstrap(members) && !me) return { ok: false, status: 403, error: MSG.member };
    if (opts.admin && !Perm.isAdmin(me, members)) return { ok: false, status: 403, error: MSG.admin };
    if (opts.key && !Perm.can(me, opts.key, members)) return { ok: false, status: 403, error: MSG.key };
    return { ok: true, user: u, member: me };
  }

  /** Len člen appky (bez ďalších práv) — vráti používateľa alebo null. */
  async function memberUser(event) {
    const g = await check(event);
    return g.ok ? g.user : null;
  }

  return { check, memberUser, user };
};
module.exports.MSG = MSG;
module.exports.tokenFrom = tokenFrom;
