// ============================================================================
// DANUBRA — prečítanie ručne písaného Stundennachweisu z fotky alebo PDF
// ============================================================================
// Nemecký Polier podpíše na stavbe týždenný výkaz hodín perom. Appka ho
// odfotí (alebo nahrá PDF), pošle sem a dostane späť hodiny po ľuďoch a
// dňoch — ako NÁVRH. Nič sa tu nezapisuje; potvrdzuje človek v appke.
//
//   POST (Authorization: Bearer <JWT prihláseného používateľa appky>)
//   {
//     storage_path: 'hours/2026/kw43.jpg',     // súbor v privátnom 'danubra-docs'
//       ALEBO
//     base64: '…', media_type: 'image/jpeg',   // priamo (≤ 6 MB base64)
//
//     year: 2026, site: 'Lixenried — Halle 3',
//     workers: ['Ján Novák', 'Peter Horváth'],  // celé mená na tejto stavbe
//     week_hint: 43                             // voliteľné (KW podľa appky)
//   }
//   → 200 { sheet: hourscan.normalize(toolInput, { year }), model, usage }
//   → 4xx/5xx { error: 'veta po slovensky' }
//
// Synchrónna funkcia — appka čaká na odpoveď. Jedna fotka jedného týždňa sa
// prečíta zvyčajne za 10–20 s. Netlify synchrónnu funkciu zastaví po svojom
// limite (podľa plánu ~10 s, po zvýšení ~26 s); repozitár limit v kóde ani
// v netlify.toml nenastavuje. Volanie modelu má preto vlastnú poistku
// (READ_HOURS_TIMEOUT_MS, predvolene 24 s), aby appka dostala vetu, nie
// holú 502. Keby sa čítanie bežne nezmestilo, treba z toho spraviť funkciu
// na pozadí ako pri faktúrach (danubra-read-bill-background.js).
//
// Model sa volá len odtiaľto (kľúč je v env premenných, nikdy v prehliadači).
// Env: ANTHROPIC_API_KEY, CLAUDE_MODEL_VISION / CLAUDE_MODEL_TEXT (voliteľné),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, READ_HOURS_TIMEOUT_MS (voliteľné)
// Testy: node app/tests/read-hours.test.js
// ============================================================================
const AI = require('../../app/lib/ai.js');

const BUCKET = 'danubra-docs';
const MAX_B64 = 6 * 1024 * 1024;        // limit vstupu (Netlify berie telo do 6 MB)
const MAX_FILE = 6 * 1024 * 1024;       // stiahnutý súbor
const MAX_IMAGE = 5 * 1024 * 1024;      // model prijme fotku najviac 5 MB
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

const MSG = {
  noKey: 'Čítanie hodín z fotky nie je zapnuté — chýba ANTHROPIC_API_KEY v Netlify.',
  type: 'Tento typ súboru neviem prečítať. Nahrajte fotku vo formáte JPG či PNG alebo PDF.',
  big: 'Súbor je príliš veľký (najviac 6 MB). Odfoťte výkaz v menšom rozlíšení alebo nahrajte menšie PDF.',
  bigImage: 'Fotka je príliš veľká (najviac 5 MB). Odfoťte výkaz v menšom rozlíšení.',
  noFile: 'Pošlite fotku alebo PDF výkazu (storage_path alebo base64).',
  path: 'Neplatná cesta k súboru.',
  download: 'Súbor sa nedal stiahnuť z úložiska.',
  empty: 'Model nevrátil hodiny z výkazu. Skúste to znova alebo ich zadajte ručne.',
  truncated: 'Výkaz je na jedno prečítanie príliš dlhý. Skúste ho odfotiť po častiach.',
  timeout: 'Čítanie výkazu trvalo príliš dlho. Skúste to znova alebo ho zadajte ručne.',
  noLib: 'Čítanie hodín ešte nie je nasadené (chýba app/lib/staffing/hourscan.js).',
};

const model = () => process.env.CLAUDE_MODEL_VISION || process.env.CLAUDE_MODEL_TEXT || 'claude-sonnet-5-5';

// ── Predvolené závislosti (sieť, úložisko). V testoch sa podstrčia. ─────────
let _supabase = null;
function supabase() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
}

const defaults = {
  // Len člen appky — samotné prihlásenie nestačí (Supabase je spoločný s Adlify).
  user: (event) => require('../../app/lib/server-guard.js')(supabase()).memberUser(event, { key: ['timesheets', 'hoursheet', 'subcontracts'] }),
  /** → { buf: Buffer, type: string } */
  async download(path) {
    const { data: blob, error } = await supabase().storage.from(BUCKET).download(path);
    if (error || !blob) throw new Error(MSG.download);
    return { buf: Buffer.from(await blob.arrayBuffer()), type: String(blob.type || '') };
  },
  /** → { ok, status, data } */
  async callModel(body) {
    const ms = Number(process.env.READ_HOURS_TIMEOUT_MS) || 24000;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  },
};
// Knižnica s nástrojom a zadaním — načíta sa až pri volaní.
const loadHs = () => require('../../app/lib/staffing/hourscan.js');

/** Typ súboru: z prípony, inak z úložiska. */
function typeOf(path, stored) {
  const ext = (String(path).split('.').pop() || '').toLowerCase();
  const t = String(stored || '').toLowerCase().split(';')[0].trim();
  return MIME[ext] || (t && t !== 'application/octet-stream' ? t : '');
}

/** Kontext pre model — orezaný, nech sa doň nedá napchať čokoľvek. */
function context(b) {
  const y = Number(b.year);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getUTCFullYear();
  const workers = (Array.isArray(b.workers) ? b.workers : [])
    .map((w) => String(w == null ? '' : w).trim().slice(0, 120)).filter(Boolean).slice(0, 200);
  const site = String(b.site || '').trim().slice(0, 200);
  const wk = Number(b.week_hint);
  const week_hint = Number.isInteger(wk) && wk >= 1 && wk <= 53 ? wk : null;
  return { year, workers, site, week_hint };
}

async function handle(event, deps = {}) {
  const d = { ...defaults, ...deps };
  if (!event || event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const user = await d.user(event);
  if (!user) return out(401, { error: 'Neprihlásený používateľ.' });
  if (!process.env.ANTHROPIC_API_KEY) return out(400, { error: MSG.noKey });

  let b;
  try { b = JSON.parse(event.body || '{}') || {}; } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const ctx = context(b);

  try {
    // ── Súbor ───────────────────────────────────────────────────────────────
    let base64, mediaType;
    if (b.storage_path) {
      const p = String(b.storage_path);
      // Len fotky výkazov (hourentry.js nahráva do `hours/<zákazka>/…`). Iné
      // priečinky (doklady ľudí, prílohy e-mailov) táto funkcia čítať nemá.
      if (p.length > 500 || p.startsWith('/') || p.split('/').includes('..') || p.includes('\\')
        || !p.startsWith('hours/')) return out(400, { error: MSG.path });
      mediaType = typeOf(p, null);
      if (mediaType && !AI.attachment('x', mediaType)) return out(415, { error: MSG.type });
      let file;
      try { file = await d.download(p); } catch { return out(404, { error: MSG.download }); }
      if (!file || !file.buf) return out(404, { error: MSG.download });
      const buf = Buffer.isBuffer(file.buf) ? file.buf : Buffer.from(file.buf);
      mediaType = typeOf(p, file.type);
      if (buf.length > MAX_FILE) return out(413, { error: MSG.big });
      if (mediaType.startsWith('image/') && buf.length > MAX_IMAGE) return out(413, { error: MSG.bigImage });
      base64 = buf.toString('base64');
    } else if (b.base64) {
      let s = String(b.base64);
      const m = s.match(/^data:([\w/+.-]+);base64,/);   // data URL z prehliadača
      if (m) s = s.slice(m[0].length);
      mediaType = String(b.media_type || (m && m[1]) || '').toLowerCase();
      if (s.length > MAX_B64) return out(413, { error: MSG.big });
      if (mediaType.startsWith('image/') && Math.floor(s.length * 3 / 4) > MAX_IMAGE) return out(413, { error: MSG.bigImage });
      base64 = s.replace(/\s+/g, '');
    } else {
      return out(400, { error: MSG.noFile });
    }
    const doc = AI.attachment(base64, mediaType);
    if (!doc) return out(415, { error: MSG.type });

    // ── Model ───────────────────────────────────────────────────────────────
    let hs;
    try { hs = d.hs || loadHs(); } catch { return out(500, { error: MSG.noLib }); }
    if (!hs || !hs.TOOL || typeof hs.instructions !== 'function') return out(500, { error: MSG.noLib });

    const prompt = hs.instructions({ year: ctx.year, workers: ctx.workers, site: ctx.site })
      + '\n\nFotka môže byť otočená o 90° (alebo hore nohami) — prečítaj ju v správnej orientácii.'
      + (ctx.week_hint ? `\nPodľa appky ide pravdepodobne o KW ${ctx.week_hint}/${ctx.year}; `
        + 'keď je na papieri iný týždeň, platí papier.' : '');
    const MODEL = model();
    const body = AI.body({ model: MODEL, tool: hs.TOOL, prompt, maxTokens: 4000, docs: [doc] });

    let res;
    try { res = await d.callModel(body); } catch (e) {
      const n = e && (e.name || '');
      if (n === 'TimeoutError' || n === 'AbortError') return out(504, { error: MSG.timeout });
      throw e;
    }
    const data = (res && res.data) || {};
    if (!res || !res.ok) return out(502, { error: AI.errorText(data, res ? res.status : 0, 'Čítanie hodín') });
    if (data.stop_reason === 'max_tokens') return out(502, { error: MSG.truncated });
    const raw = AI.pickTool(data, hs.TOOL.name);
    if (!raw) return out(502, { error: MSG.empty });

    const sheet = hs.normalize(raw, { year: ctx.year });
    return out(200, { sheet, model: data.model || MODEL, usage: data.usage || null });
  } catch (e) {
    return out(500, { error: String((e && e.message) || e).slice(0, 200) });
  }
}

exports.handle = handle;
exports.handler = (event) => handle(event);
