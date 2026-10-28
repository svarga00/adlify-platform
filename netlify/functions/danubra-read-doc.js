// ============================================================================
// DANUBRA — prečítanie dokladu živnostníka z fotky alebo PDF
// ============================================================================
// „Doklady k živnostníkom by bolo dobré, keby sa reálne nahrávali, a to by
// bola kontrola." Pri zápise dokladu (A1, občiansky, pas, živnostenský list,
// zmluva…) appka doklad nahrá, pošle sem a dostane späť druh, číslo,
// platnosť a meno — ako NÁVRH. Nič sa tu nezapisuje; údaje porovná so
// skenom kolega a až on doklad uloží.
//
//   POST (Authorization: Bearer <JWT prihláseného používateľa appky>)
//   {
//     storage_path: 'worker/<id>/2026-…-a1.jpg',  // súbor v privátnom 'danubra-docs'
//       ALEBO
//     base64: '…', media_type: 'image/jpeg',       // priamo (≤ 6 MB base64)
//
//     worker_name: 'Ján Novák',                    // na porovnanie mena
//     expected_kind: 'a1'                          // čo kolega vo formulári vybral
//   }
//   → 200 { read: docscan.normalize(toolInput), warnings: docscan.check(…), model, usage }
//   → 4xx/5xx { error: 'veta po slovensky' }
//
// Synchrónna funkcia — formulár čaká na odpoveď. Jeden doklad sa prečíta
// zvyčajne za 5–15 s. Volanie modelu má vlastnú poistku (READ_DOC_TIMEOUT_MS,
// predvolene 24 s), aby appka dostala vetu, nie holú 502 po limite Netlify.
// Keď čítanie nevyjde, formulár funguje ďalej ručne.
//
// Model sa volá len odtiaľto (kľúč je v env premenných, nikdy v prehliadači).
// Env: ANTHROPIC_API_KEY, CLAUDE_MODEL_VISION / CLAUDE_MODEL_TEXT (voliteľné),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, READ_DOC_TIMEOUT_MS (voliteľné)
// Testy: node app/tests/read-doc.test.js
// ============================================================================
const AI = require('../../app/lib/ai.js');

const BUCKET = 'danubra-docs';
// Doklady ľudí ležia v `worker/<id>/…` (DB.uploadDoc s folder 'worker').
// Iné priečinky (faktúry, hodiny) táto funkcia čítať nemá.
const FOLDERS = ['worker/'];
const MAX_B64 = 6 * 1024 * 1024;        // limit vstupu (Netlify berie telo do 6 MB)
const MAX_FILE = 10 * 1024 * 1024;      // stiahnutý súbor (PDF zo skenera býva väčšie)
const MAX_IMAGE = 5 * 1024 * 1024;      // model prijme fotku najviac 5 MB
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

const MSG = {
  noKey: 'Čítanie dokladov z fotky nie je zapnuté — chýba ANTHROPIC_API_KEY v Netlify. Údaje vyplňte ručne.',
  type: 'Tento typ súboru neviem prečítať. Nahrajte fotku vo formáte JPG či PNG alebo PDF.',
  big: 'Súbor je na prečítanie príliš veľký (najviac 10 MB). Doklad sa uloží aj tak — údaje vyplňte ručne.',
  bigB64: 'Súbor je na prečítanie príliš veľký (najviac 6 MB).',
  bigImage: 'Fotka je na prečítanie príliš veľká (najviac 5 MB). Odfoťte doklad v menšom rozlíšení.',
  noFile: 'Pošlite fotku alebo PDF dokladu (storage_path alebo base64).',
  path: 'Neplatná cesta k súboru.',
  download: 'Súbor sa nedal stiahnuť z úložiska.',
  empty: 'Z dokladu sa nepodarilo nič prečítať. Údaje vyplňte ručne podľa skenu.',
  truncated: 'Odpoveď na doklad bola neúplná. Skúste to znova alebo vyplňte údaje ručne.',
  timeout: 'Čítanie dokladu trvalo príliš dlho. Skúste to znova alebo vyplňte údaje ručne.',
  noLib: 'Čítanie dokladov ešte nie je nasadené (chýba app/lib/staffing/docscan.js).',
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
  user: (event) => require('../../app/lib/server-guard.js')(supabase()).memberUser(event),
  /** → { buf: Buffer, type: string } */
  async download(path) {
    const { data: blob, error } = await supabase().storage.from(BUCKET).download(path);
    if (error || !blob) throw new Error(MSG.download);
    return { buf: Buffer.from(await blob.arrayBuffer()), type: String(blob.type || '') };
  },
  /** → { ok, status, data } */
  async callModel(body) {
    const ms = Number(process.env.READ_DOC_TIMEOUT_MS) || 24000;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  },
  today: () => new Date().toISOString().slice(0, 10),
};
// Knižnica s nástrojom a zadaním — načíta sa až pri volaní.
const loadDs = () => require('../../app/lib/staffing/docscan.js');

/** Typ súboru: z prípony, inak z úložiska. */
function typeOf(path, stored) {
  const ext = (String(path).split('.').pop() || '').toLowerCase();
  const t = String(stored || '').toLowerCase().split(';')[0].trim();
  return MIME[ext] || (t && t !== 'application/octet-stream' ? t : '');
}

/** Kontext pre model — orezaný, nech sa doň nedá napchať čokoľvek. */
function context(b, ds) {
  const workerName = String(b.worker_name == null ? '' : b.worker_name)
    .replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
  const k = String(b.expected_kind || '').trim();
  const expectedKind = ds && Array.isArray(ds.KINDS) && ds.KINDS.includes(k) ? k : '';
  return { workerName, expectedKind };
}

async function handle(event, deps = {}) {
  const d = { ...defaults, ...deps };
  if (!event || event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const user = await d.user(event);
  if (!user) return out(401, { error: 'Neprihlásený používateľ.' });
  if (!process.env.ANTHROPIC_API_KEY) return out(400, { error: MSG.noKey });

  let b;
  try { b = JSON.parse(event.body || '{}') || {}; } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }

  try {
    // ── Súbor ───────────────────────────────────────────────────────────────
    let base64, mediaType;
    if (b.storage_path) {
      const p = String(b.storage_path);
      if (p.length > 500 || p.startsWith('/') || p.split('/').includes('..')
        || !FOLDERS.some(f => p.startsWith(f))) return out(400, { error: MSG.path });
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
      if (s.length > MAX_B64) return out(413, { error: MSG.bigB64 });
      if (mediaType.startsWith('image/') && Math.floor(s.length * 3 / 4) > MAX_IMAGE) return out(413, { error: MSG.bigImage });
      base64 = s.replace(/\s+/g, '');
    } else {
      return out(400, { error: MSG.noFile });
    }
    const att = AI.attachment(base64, mediaType);
    if (!att) return out(415, { error: MSG.type });

    // ── Model ───────────────────────────────────────────────────────────────
    let ds;
    try { ds = d.ds || loadDs(); } catch { return out(500, { error: MSG.noLib }); }
    if (!ds || !ds.TOOL || typeof ds.instructions !== 'function' || typeof ds.normalize !== 'function') {
      return out(500, { error: MSG.noLib });
    }
    const ctx = context(b, ds);
    const today = d.today();

    const prompt = ds.instructions({ workerName: ctx.workerName, expectedKind: ctx.expectedKind, today })
      + '\n\nFotka môže byť otočená o 90° (alebo hore nohami) — prečítaj ju v správnej orientácii.';
    const MODEL = model();
    const body = AI.body({ model: MODEL, tool: ds.TOOL, prompt, maxTokens: 1200, docs: [att] });

    let res;
    try { res = await d.callModel(body); } catch (e) {
      const n = e && (e.name || '');
      if (n === 'TimeoutError' || n === 'AbortError') return out(504, { error: MSG.timeout });
      throw e;
    }
    const data = (res && res.data) || {};
    if (!res || !res.ok) return out(502, { error: AI.errorText(data, res ? res.status : 0, 'Čítanie dokladu') });
    if (data.stop_reason === 'max_tokens') return out(502, { error: MSG.truncated });
    const raw = AI.pickTool(data, ds.TOOL.name);
    if (!raw) return out(502, { error: MSG.empty });

    const read = ds.normalize(raw);
    const warnings = typeof ds.check === 'function'
      ? ds.check(read, { workerName: ctx.workerName, expectedKind: ctx.expectedKind, today }) : [];
    return out(200, { read, warnings, model: data.model || MODEL, usage: data.usage || null });
  } catch (e) {
    return out(500, { error: String((e && e.message) || e).slice(0, 200) });
  }
}

exports.handle = handle;
exports.handler = (event) => handle(event);
