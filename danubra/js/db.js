// DANUBRA — Supabase klient + tenké data helpery.
// Všetky tabuľky sú na spoločnom Supabase s Adlify → centrálny prefix `danubra_`.
// Moduly volajú logické názvy ('clients'), DB ich prefixne ('danubra_clients').
(function () {
  const cfg = window.DANUBRA_CONFIG;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const PREFIX = 'danubra_';
  const t = (name) => (name.startsWith(PREFIX) ? name : PREFIX + name);

  window.DB = {
    client,
    prefix: PREFIX,

    // Raw query builder na prefixnutú tabuľku (pre hromadné inserty a pod.)
    from(name) { return client.from(t(name)); },

    async currentUser() {
      const { data } = await client.auth.getUser();
      return data?.user || null;
    },

    async signIn(email, password) {
      return client.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      return client.auth.signOut();
    },

    onAuth(cb) {
      client.auth.onAuthStateChange((_ev, session) => cb(session?.user || null));
    },

    // Generický list s filtrami/order — vracia { data, error }
    async list(table, { select = '*', filters = {}, order, limit } = {}) {
      let q = client.from(t(table)).select(select);
      for (const [k, v] of Object.entries(filters)) {
        if (v == null) continue;
        if (Array.isArray(v)) q = q.in(k, v);
        else q = q.eq(k, v);
      }
      if (order) q = q.order(order.column, { ascending: order.ascending !== false });
      if (limit) q = q.limit(limit);
      return q;
    },

    async getById(table, id, select = '*') {
      return client.from(t(table)).select(select).eq('id', id).maybeSingle();
    },

    async insert(table, payload) {
      return client.from(t(table)).insert(payload).select().single();
    },

    async update(table, id, payload) {
      return client.from(t(table)).update(payload).eq('id', id).select().single();
    },

    async remove(table, id) {
      return client.from(t(table)).delete().eq('id', id);
    },

    // ── Úložisko nahrávok ────────────────────────────────────────────────
    // Bucket je privátny — von ide vždy len krátkodobo podpísaný odkaz.
    CALLS_BUCKET: 'danubra-calls',

    async uploadCall(blob, filename) {
      const safe = String(filename || 'hovor')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'hovor';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const path = `${new Date().getFullYear()}/${stamp}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const { data, error } = await client.storage.from(this.CALLS_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'audio/mpeg', upsert: false });
      return { path: data?.path || null, error };
    },

    async signedCallUrl(path, seconds = 600) {
      const { data, error } = await client.storage.from(this.CALLS_BUCKET)
        .createSignedUrl(path, seconds);
      return { url: data?.signedUrl || null, error };
    },

    async removeCall(path) {
      return client.storage.from(this.CALLS_BUCKET).remove([path]);
    },

    async count(table, filters = {}) {
      let q = client.from(t(table)).select('id', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(filters)) if (v != null) q = q.eq(k, v);
      const { count } = await q;
      return count || 0;
    },
  };
})();
