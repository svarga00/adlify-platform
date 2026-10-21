// ============================================================================
// DANUBRA — prečítanie prijatej faktúry zo súboru (na pozadí)
// ============================================================================
// Appka nahrá súbor do úložiska, založí faktúru v stave „Na kontrolu"
// (extract_status = pending) a zavolá túto funkciu. Tá:
//
//   1. stiahne súbor z privátneho úložiska,
//   2. e-faktúru (XML) prečíta sama, PDF a fotku pošle modelu,
//   3. údaje vyčistí a priradí faktúru k živnostníkovi (lib/billing/extract.js),
//   4. zapíše ich k faktúre — stále „Na kontrolu", potvrdzuje človek.
//
// Model sa volá len odtiaľto (kľúč je v env premenných, nikdy v prehliadači).
// Beží na pozadí, lebo čítanie viacstranového PDF trvá dlhšie, než bežná
// funkcia na Netlify vydrží.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
//      CLAUDE_MODEL_TEXT (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const AI = require('../../app/lib/ai.js');
const X = require('../../app/lib/billing/extract.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const MODEL = process.env.CLAUDE_MODEL_TEXT || 'claude-sonnet-5-5';
const BUCKET = 'danubra-docs';

const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

async function fail(id, msg) {
  await supabase.from('danubra_bills').update({
    extract_status: 'error', extract_error: String(msg).slice(0, 500),
    extracted_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'review');
}

async function readWithModel(buf, mediaType, company) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY — čítanie faktúr nie je zapnuté.');
  const doc = AI.attachment(buf.toString('base64'), mediaType);
  if (!doc) {
    throw new Error('Tento typ súboru neviem prečítať. Nahrajte PDF alebo fotku vo formáte JPG či PNG.');
  }
  const { data: cats } = await supabase.from('danubra_enums').select('key,label_sk')
    .eq('kind', 'cost_category').eq('active', true).order('sort_order');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(AI.body({
      model: MODEL, tool: X.TOOL, maxTokens: 4000, docs: [doc],
      prompt: X.instructions({ company, categories: (cats || []).map(c => [c.key, c.label_sk]) }),
    })),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(AI.errorText(data, res.status, 'Čítanie faktúry'));
  const raw = AI.pickTool(data, X.TOOL.name);
  if (!raw) throw new Error('Model nevrátil údaje z faktúry. Skúste to znova alebo ju zadajte ručne.');
  return raw;
}

exports.handler = async (event) => {
  let billId = null, company = {};
  try { ({ billId, company = {} } = JSON.parse(event.body || '{}')); } catch { return; }
  if (!billId) return;

  const { data: bill } = await supabase.from('danubra_bills').select('*').eq('id', billId).maybeSingle();
  // Číta sa len faktúra, ktorá na to čaká — nič potvrdené sa neprepíše.
  if (!bill || bill.status !== 'review' || bill.extract_status !== 'pending' || !bill.storage_path) return;

  try {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(bill.storage_path);
    if (error || !blob) throw new Error('Súbor sa nedal stiahnuť z úložiska.');
    const buf = Buffer.from(await blob.arrayBuffer());
    const ext = (bill.storage_path.split('.').pop() || '').toLowerCase();

    let raw, how;
    if (bill.source === 'xml' || ext === 'xml') {
      const xml = buf.toString('utf8');
      raw = X.parseUbl(xml);
      if (!raw) throw new Error('Toto XML nie je e-faktúra (UBL). Nahrajte PDF.');
      how = 'ubl';
    } else {
      const type = String(blob.type || '').toLowerCase();
      const mediaType = MIME[ext] || (type && type !== 'application/octet-stream' ? type : 'application/pdf');
      raw = await readWithModel(buf, mediaType, company);
      how = MODEL;
    }

    const f = X.normalize(raw);
    const { data: workers } = await supabase.from('danubra_workers')
      .select('id,full_name,company_name,company_id,bank_iban').limit(1000);
    const m = X.matchWorker(f, workers || []);
    const patch = X.billPatch(f, { worker: m.worker });

    await supabase.from('danubra_bills').update({
      ...patch,
      extracted: { ...f, _match: m.by, _read_by: how, _file: (bill.extracted || {})._file || null },
      extract_status: 'done', extract_error: null,
      extracted_at: new Date().toISOString(),
    }).eq('id', billId).eq('status', 'review');
  } catch (e) {
    await fail(billId, (e && e.message) || e);
  }
};
