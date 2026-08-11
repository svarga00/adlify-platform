// ============================================================================
// DANUBRA — spracovanie nahrávky hovoru: prepis → extrakcia dohôd
// ============================================================================
// Reťazec: nahrávka v Supabase Storage → Whisper (prepis) → Claude (extrakcia
// štruktúrovaných dohôd) → zápis do danubra_promises.
//
// KRITICKÉ: bez potvrdeného súhlasu sa nahrávka NESPRACUJE. Nahrávanie bez
// súhlasu je v SR aj DE trestné (§377 TZ, §201 StGB), takže kontrola je tvrdá
// a nedá sa obísť parametrom.
//
// Premenné prostredia:
//   OPENAI_API_KEY      — prepis cez Whisper
//   ANTHROPIC_API_KEY   — extrakcia cez Claude
//   CLAUDE_MODEL        — voliteľné, predvolene claude-haiku-4-5-20251001
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

const EXTRACTION_SCHEMA = {
  name: 'zaznam_dohod',
  description: 'Štruktúrovaný zápis toho, na čom sa strany v hovore dohodli.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Zhrnutie hovoru v troch až piatich vetách po slovensky.' },
      promises: {
        type: 'array',
        description: 'Konkrétne sľuby a dohody. Iba to, čo v hovore skutočne zaznelo — nič nedomýšľaj.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string',
              enum: ['wage', 'accommodation', 'start_date', 'transport', 'per_diem', 'working_hours', 'equipment', 'other'],
              description: 'Čoho sa sľub týka.' },
            statement: { type: 'string', description: 'Čo presne bolo sľúbené, v jednej vete.' },
            value_text: { type: 'string', description: 'Hodnota tak, ako zaznela (napr. „2000 € hrubého").' },
            value_number: { type: ['number', 'null'], description: 'Číselná hodnota, ak sa dá vyčísliť.' },
            value_date: { type: ['string', 'null'], description: 'Dátum vo formáte RRRR-MM-DD, ak ide o termín.' },
            confidence: { type: 'number', description: 'Istota 0 až 1, nakoľko jednoznačne to v hovore zaznelo.' },
          },
          required: ['kind', 'statement', 'confidence'],
        },
      },
      open_questions: {
        type: 'array', items: { type: 'string' },
        description: 'Čo zostalo nedohodnuté alebo nejasné a treba to doriešiť.',
      },
    },
    required: ['summary', 'promises'],
  },
};

async function transcribe(audioUrl, language) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Chýba OPENAI_API_KEY pre prepis');

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Nahrávku sa nepodarilo stiahnuť (${audioRes.status})`);
  const buf = Buffer.from(await audioRes.arrayBuffer());

  const form = new FormData();
  form.append('file', new Blob([buf]), 'call.m4a');
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Prepis zlyhal (${res.status})`);
  return data.text;
}

async function extract(transcript, context) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY pre extrakciu');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      tools: [EXTRACTION_SCHEMA],
      tool_choice: { type: 'tool', name: 'zaznam_dohod' },
      messages: [{
        role: 'user',
        content: `Toto je prepis náborového telefonátu${context ? ` s osobou: ${context}` : ''}. `
          + `Zapíš, na čom sa strany dohodli — najmä mzda, ubytovanie, termín nástupu, diéty, `
          + `doprava a pracovný čas.\n\nDôležité: zapisuj iba to, čo v hovore skutočne zaznelo. `
          + `Nič nedomýšľaj ani nedopĺňaj. Ak niečo zaznelo nejasne alebo len ako možnosť, `
          + `zníž istotu a uveď to medzi otvorenými otázkami.\n\n`
          + `PREPIS:\n${transcript}`,
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Extrakcia zlyhala (${res.status})`);
  const toolUse = (data.content || []).find(c => c.type === 'tool_use');
  if (!toolUse) throw new Error('Model nevrátil štruktúrovaný výstup');
  return toolUse.input;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let recordingId;
  try {
    ({ recordingId } = JSON.parse(event.body || '{}'));
    if (!recordingId) throw new Error('Chýba recordingId');

    const { data: rec, error } = await supabase
      .from('danubra_call_recordings').select('*').eq('id', recordingId).maybeSingle();
    if (error || !rec) throw new Error('Nahrávka sa nenašla');

    // ── Tvrdá kontrola súhlasu — nedá sa obísť ────────────────────────────
    if (!rec.consent_confirmed) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({
        error: 'Nahrávka nemá potvrdený súhlas — spracovanie je zakázané. '
          + 'Nahrávanie bez súhlasu je v SR aj v Nemecku trestné.' }) };
    }
    if (rec.consent_id) {
      const { data: consent } = await supabase
        .from('danubra_consents').select('granted, revoked_at').eq('id', rec.consent_id).maybeSingle();
      if (!consent?.granted) {
        return { statusCode: 403, headers: cors,
          body: JSON.stringify({ error: 'Súhlas nie je udelený' }) };
      }
      if (consent.revoked_at) {
        return { statusCode: 403, headers: cors,
          body: JSON.stringify({ error: 'Súhlas bol odvolaný — nahrávku treba zmazať, nie spracovať' }) };
      }
    }
    if (!rec.audio_url) throw new Error('Nahrávka nemá zvukový súbor');

    // ── Prepis ────────────────────────────────────────────────────────────
    await supabase.from('danubra_call_recordings')
      .update({ status: 'transcribing', error: null }).eq('id', recordingId);
    const transcript = await transcribe(rec.audio_url, rec.language || 'sk');

    await supabase.from('danubra_call_recordings').update({
      status: 'extracting', transcript, transcript_provider: 'whisper',
    }).eq('id', recordingId);

    // ── Extrakcia dohôd ───────────────────────────────────────────────────
    const result = await extract(transcript, rec.subject_name);

    await supabase.from('danubra_call_recordings').update({
      status: 'done', summary: result.summary, extraction: result,
      processed_at: new Date().toISOString(),
    }).eq('id', recordingId);

    // ── Zápis sľubov ──────────────────────────────────────────────────────
    const rows = (result.promises || []).map(p => ({
      recording_id: recordingId,
      subject_type: rec.subject_type || 'worker',
      subject_id: rec.subject_id || null,
      kind: p.kind, statement: p.statement,
      value_text: p.value_text || null,
      value_number: p.value_number ?? null,
      value_date: p.value_date || null,
      confidence: p.confidence ?? null,
      status: 'open',
    }));
    if (rows.length) await supabase.from('danubra_promises').insert(rows);

    if (rec.subject_id) {
      await supabase.from('danubra_activities').insert({
        entity_type: rec.subject_type || 'worker', entity_id: rec.subject_id,
        type: 'call', direction: 'out',
        body: result.summary,
        source: 'ai',
        channel_meta: { recording_id: recordingId, promises: rows.length },
      }).catch(() => {});
    }

    console.log('[danubra-process-call]', recordingId, 'dohôd:', rows.length);
    return { statusCode: 200, headers: cors, body: JSON.stringify({
      success: true, promises: rows.length,
      summary: result.summary, open_questions: result.open_questions || [] }) };
  } catch (err) {
    console.error('[danubra-process-call]', err);
    if (recordingId) {
      await supabase.from('danubra_call_recordings')
        .update({ status: 'failed', error: err.message }).eq('id', recordingId).catch(() => {});
    }
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
