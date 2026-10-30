// ============================================================================
// Falošná Supabase pre testy serverových funkcií (bez siete a databázy)
// ============================================================================
// Tabuľky sú polia v pamäti. Podporuje to, čo funkcie oslovovania používajú:
// select (aj count/head), insert/update/upsert (aj .select().single()),
// eq/neq/is/in/gte/lte/not('x','is',null), order, limit, maybeSingle/single
// a rpc. Každý zápis sa zaznamená do `log`, aby test videl, čo sa stalo.
//
//   const F = require('./fake-supabase.js');
//   const sb = F.create({ danubra_leads: [...] }, { users: { jwt: { id: 'u1' } }, rpc: { … } });
//
// Nie je to test (*.test.js) — run-all ho nespúšťa.
// ============================================================================
let seq = 0;
const nid = () => `id-${++seq}`;
const val = (r, c) => (r[c] === undefined ? null : r[c]);

function create(db = {}, opts = {}) {
  const log = [];
  const tab = (t) => (db[t] = db[t] || []);

  function from(table) {
    const st = { op: 'select', payload: null, filters: [], ret: false, head: false, count: null, limit: null, single: null, upsert: null };
    const api = {
      select(cols, o = {}) { if (st.op !== 'select') st.ret = true; if (o.head) st.head = true; if (o.count) st.count = o.count; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.upsert = o; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(c, v) { st.filters.push(r => val(r, c) === v); return api; },
      neq(c, v) { st.filters.push(r => val(r, c) !== v); return api; },
      is(c, v) { st.filters.push(r => val(r, c) === v); return api; },
      in(c, vs) { st.filters.push(r => (vs || []).includes(val(r, c))); return api; },
      gte(c, v) { st.filters.push(r => val(r, c) != null && String(val(r, c)) >= String(v)); return api; },
      lte(c, v) { st.filters.push(r => val(r, c) != null && String(val(r, c)) <= String(v)); return api; },
      lt(c, v) { st.filters.push(r => val(r, c) != null && String(val(r, c)) < String(v)); return api; },
      gt(c, v) { st.filters.push(r => val(r, c) != null && String(val(r, c)) > String(v)); return api; },
      // Zvyšok filtrov funkcie pri týchto testoch nepotrebujú presne — prepustia všetko.
      ilike() { return api; }, or() { return api; }, contains() { return api; }, range() { return api; },
      not(c, op, v) { if (op === 'is') st.filters.push(r => val(r, c) !== v); return api; },
      order() { return api; },
      limit(n) { st.limit = n; return api; },
      maybeSingle() { st.single = 'maybe'; return run(); },
      single() { st.single = 'one'; return run(); },
      then(ok, err) { return run().then(ok, err); },
    };
    const match = () => tab(table).filter(r => st.filters.every(f => f(r)));
    const shape = (rows) => {
      if (st.single) return { data: rows[0] ? { ...rows[0] } : null, error: st.single === 'one' && !rows[0] ? { message: 'no rows' } : null };
      return { data: rows.map(r => ({ ...r })), error: null };
    };
    async function run() {
      const err = opts.errors && opts.errors[`${table}:${st.op}`];
      if (err) return { data: null, error: { message: err }, count: null };
      if (st.op === 'select') {
        let rows = match();
        if (st.head) return { data: null, count: rows.length, error: null };
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return { ...shape(rows), count: st.count ? rows.length : null };
      }
      if (st.op === 'insert') {
        const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(p => ({ id: nid(), ...p }));
        tab(table).push(...list);
        log.push({ table, op: 'insert', rows: list });
        return st.ret ? shape(list) : { data: null, error: null };
      }
      if (st.op === 'update') {
        const rows = match();
        rows.forEach(r => Object.assign(r, st.payload));
        log.push({ table, op: 'update', patch: st.payload, ids: rows.map(r => r.id) });
        return st.ret ? shape(rows) : { data: null, error: null };
      }
      if (st.op === 'upsert') {
        const key = (st.upsert && st.upsert.onConflict) || 'id';
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const p of list) {
          const ex = tab(table).find(r => r[key] === p[key]);
          if (ex && !st.upsert.ignoreDuplicates) Object.assign(ex, p);
          else if (!ex) tab(table).push({ id: nid(), ...p });
        }
        log.push({ table, op: 'upsert', rows: list });
        return { data: null, error: null };
      }
      log.push({ table, op: 'delete' });
      return { data: null, error: null };
    }
    return api;
  }

  return {
    db, log,
    from,
    auth: { getUser: async (jwt) => ({ data: { user: (opts.users || {})[jwt] || null } }) },
    rpc: async (name, args) => {
      log.push({ rpc: name, args });
      const fn = opts.rpc && opts.rpc[name];
      return fn ? fn(args, db) : { data: null, error: { message: `rpc ${name} neexistuje` } };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: { message: 'nie' } }) }) },
    writes: (table, op) => log.filter(l => l.table === table && (!op || l.op === op)),
  };
}

module.exports = { create };
