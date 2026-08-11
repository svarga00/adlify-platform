// DANUBRA — Supabase klient + tenké data helpery.
(function () {
  const cfg = window.DANUBRA_CONFIG;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  window.DB = {
    client,

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
      let q = client.from(table).select(select);
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
      return client.from(table).select(select).eq('id', id).maybeSingle();
    },

    async insert(table, payload) {
      return client.from(table).insert(payload).select().single();
    },

    async update(table, id, payload) {
      return client.from(table).update(payload).eq('id', id).select().single();
    },

    async remove(table, id) {
      return client.from(table).delete().eq('id', id);
    },

    async count(table, filters = {}) {
      let q = client.from(table).select('id', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(filters)) if (v != null) q = q.eq(k, v);
      const { count } = await q;
      return count || 0;
    },
  };
})();
