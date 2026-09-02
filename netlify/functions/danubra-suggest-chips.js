// ============================================================================
// DANUBRA — návrh nových zaškrtávacích polí z poznámok z hovoru
// ============================================================================
// Po hovore prejde Claude to, čo si zapísal vlastnými slovami, a navrhne
// z toho krátke polia. Návrhy sa ukladajú ako neaktívne (active = false) —
// objavia sa v Príručke remesiel a používať sa začnú, až keď ich potvrdíš.
//
// Nič sa nepridáva samo. Zoznam polí je to, podľa čoho sa rozhoduje o ľuďoch,
// takže doň nesmie pribudnúť nič, čo si nevidel.
//
// Premenné prostredia:
//   ANTHROPIC_API_KEY   — bez neho funkcia len ticho skončí
//   CLAUDE_MODEL        — voliteľné, predvolene claude-haiku-4-5-20251001
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const SEGMENTS = ['intro', 'trade', 'verify', 'legal', 'logistics', 'money'];

const SCHEMA = {
  name: 'navrhy_poli',
  description: 'Krátke zaškrtávacie polia odvodené z poznámok z náborového hovoru.',
  input_schema: {
    type: 'object',
    properties: {
      chips: {
        type: 'array',
        description: 'Najviac päť návrhov. Iba to, čo sa bude opakovať aj pri ďalších ľuďoch.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string',
              description: 'Tvrdenie v dvoch až šiestich slovách, po slovensky, bez diagnóz a bez mena.' },
            segment: { type: 'string', enum: SEGMENTS,
              description: 'Kam v hovore patrí: intro, trade, verify, legal, logistics, money.' },
            polarity: { type: 'string', enum: ['plus', 'minus', 'flag', 'neutral'],
              description: 'plus dobré znamenie, minus zlé, flag varovanie, neutral informácia.' },
            trade_specific: { type: 'boolean',
              description: 'true, ak dáva zmysel len pri tomto remesle.' },
            from_note: { type: 'string', description: 'Úryvok poznámky, z ktorej návrh vznikol.' },
          },
          required: ['label', 'segment', 'polarity'],
        },
      },
    },
    required: ['chips'],
  },
};

async function suggest(notes, tradeName, existing) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      tools: [SCHEMA],
      tool_choice: { type: 'tool', name: 'navrhy_poli' },
      messages: [{
        role: 'user',
        content: `Náborár si počas telefonátu s remeselníkom (${tradeName}) zapísal poznámky. `
          + `Aplikácia mu pri ďalších hovoroch ponúka zaškrtávacie polia — krátke tvrdenia, `
          + `ktoré len klepne. Navrhni polia, ktoré mu chýbali.\n\n`
          + `Pravidlá:\n`
          + `- Iba to, čo sa bude opakovať aj pri iných ľuďoch. Nič, čo platí len pre tohto človeka.\n`
          + `- Bez mien, bez telefónnych čísel, bez zdravotných diagnóz.\n`
          + `- Dve až šesť slov. Nie otázka, ale tvrdenie: „vie rozteč 625", nie „vie rozteč?".\n`
          + `- Ak sa to už nachádza medzi existujúcimi poľami, nenavrhuj to znova.\n`
          + `- Radšej nič než vata. Prázdny zoznam je správna odpoveď, keď v poznámkach nič nové nie je.\n\n`
          + `EXISTUJÚCE POLIA:\n${existing.join('\n') || '(žiadne)'}\n\n`
          + `POZNÁMKY Z HOVOROV:\n${notes}`,
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Návrh zlyhal (${res.status})`);
  const toolUse = (data.content || []).find(c => c.type === 'tool_use');
  return toolUse?.input?.chips || [];
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

  try {
    const { candidateId, tradeKey } = JSON.parse(event.body || '{}');
    if (!candidateId) throw new Error('Chýba candidateId');
    if (!process.env.ANTHROPIC_API_KEY) {
      // bez kľúča to nie je chyba, len sa nič nenavrhne
      return { statusCode: 200, headers: cors, body: JSON.stringify({ created: 0, skipped: 'no_api_key' }) };
    }

    const { data: notes } = await supabase
      .from('danubra_candidate_notes')
      .select('step_key, body')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true })
      .limit(50);

    const text = (notes || []).map(n => `[${n.step_key}] ${n.body}`).join('\n');
    if (text.trim().length < 40) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ created: 0, skipped: 'too_short' }) };
    }

    const [{ data: trade }, { data: existing }] = await Promise.all([
      supabase.from('danubra_trades').select('name_sk').eq('key', tradeKey || '').maybeSingle(),
      supabase.from('danubra_call_chips').select('label, segment, trade_key')
        .or(`trade_key.is.null,trade_key.eq.${tradeKey || 'x'}`).limit(400),
    ]);

    const existingLabels = (existing || []).map(c => `${c.segment}: ${c.label}`);
    const chips = await suggest(text, trade?.name_sk || tradeKey || 'remeselník', existingLabels);

    // Duplicity odfiltruj ešte pred zápisom — porovnaj bez diakritiky a veľkosti písmen.
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const have = new Set((existing || []).map(c => `${c.segment}|${norm(c.label)}`));

    const rows = [];
    for (const c of chips) {
      if (!c.label || !SEGMENTS.includes(c.segment)) continue;
      const keyStr = `${c.segment}|${norm(c.label)}`;
      if (have.has(keyStr)) continue;
      have.add(keyStr);
      rows.push({
        trade_key: c.trade_specific && tradeKey ? tradeKey : null,
        segment: c.segment,
        label: c.label.trim(),
        polarity: c.polarity || 'neutral',
        weight: c.polarity === 'flag' ? 2 : 1,
        source: 'ai',
        suggested_from: (c.from_note || '').slice(0, 300) || null,
        active: false,          // kým to človek nepotvrdí, nepoužíva sa
      });
    }

    if (rows.length) {
      // Unikátny index je funkčný (coalesce + lower), takže onConflict sa naň
      // odvolať nedá — duplicity sú odfiltrované vyššie a prípadnú kolíziu
      // zahodíme po jednej, nech jeden zlý návrh nezhodí celú dávku.
      let ok = 0;
      for (const row of rows) {
        const { error } = await supabase.from('danubra_call_chips').insert(row);
        if (!error) ok++;
      }
      console.log('[danubra-suggest-chips]', candidateId, 'návrhov:', ok);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ created: ok }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ created: 0 }) };
  } catch (err) {
    console.error('[danubra-suggest-chips]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
