// ============================================================================
// DANUBRA — nájsť nemecké firmy podobné našim odberateľom (na pozadí)
// ============================================================================
// Appka založí hľadanie (`danubra_lead_searches`, stav pending) a zavolá
// túto funkciu. Tá:
//
//   1. overí, kto volá (prihlásený používateľ appky),
//   2. vezme vybraných odberateľov (meno, mesto, čo pre nich robíme),
//   3. požiada Claude s vyhľadávaním na webe o podobné firmy — s webom,
//      e-mailom z ich vlastnej stránky (Impressum/Kontakt) a telefónom,
//   4. vyčistí ich (`lib/marketing/leads.js`), vyhodí tie, ktoré už máme,
//      a uloží ako nové firmy so stavom „Nová".
//
// Beží na pozadí: hľadanie na webe trvá minúty. Stav a počty sú v riadku
// hľadania — appka sa naň pozerá.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
//      CLAUDE_MODEL_LEADS (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const AI = require('../../app/lib/ai.js');
const L = require('../../app/lib/marketing/leads.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const MODEL = process.env.CLAUDE_MODEL_LEADS || 'claude-opus-5-5';

const REPORT = {
  name: 'report_leads',
  description: 'Odovzdaj nájdené firmy. Zavolaj raz, na konci, so všetkými firmami.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['leads'],
    properties: {
      leads: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name', 'city', 'postal_code', 'website', 'email', 'phone', 'trade', 'why', 'source_url', 'similar_to'],
          properties: {
            name: { type: 'string', description: 'Presný názov firmy vrátane právnej formy' },
            city: { type: ['string', 'null'] },
            postal_code: { type: ['string', 'null'] },
            website: { type: ['string', 'null'] },
            email: { type: ['string', 'null'], description: 'Len e-mail uverejnený na stránke firmy (Impressum/Kontakt). Nevymýšľaj.' },
            phone: { type: ['string', 'null'] },
            trade: { type: ['string', 'null'], description: 'Čím sa firma zaoberá, po slovensky, krátko' },
            why: { type: ['string', 'null'], description: 'Jedna veta po slovensky: prečo je podobná našim odberateľom' },
            source_url: { type: ['string', 'null'], description: 'Stránka, kde si údaje overil' },
            similar_to: { type: ['string', 'null'], description: 'Meno nášho odberateľa, ktorému sa najviac podobá' },
          },
        },
      },
    },
  },
};

function prompt({ refs, region, count, exclude, note }) {
  return [
    'Sme slovenská firma, ktorá posiela slovenských živnostníkov (remeselníkov) na stavby v Nemecku ako subdodávateľ',
    '(Werkvertrag, fakturácia po hodinách). Hľadáme nových nemeckých odberateľov.',
    '',
    'Toto sú firmy, s ktorými už spolupracujeme:',
    JSON.stringify(refs, null, 1),
    '',
    `Nájdi na webe ${count} nemeckých firiem, ktoré sa im podobajú (druh prác, veľkosť, región) a ktoré pravdepodobne`,
    'zamestnávajú subdodávateľov na stavbách — stavebné firmy, generálni dodávatelia, väčšie remeselné firmy.',
    region ? `Región: ${region}.` : 'Región: okolie miest našich odberateľov.',
    note ? `Poznámka od nás: ${note}` : '',
    '',
    'Pravidlá:',
    '- Každú firmu over na jej vlastnej stránke. E-mail a telefón uveď LEN ak sú uverejnené na stránke firmy',
    '  (Impressum alebo Kontakt). Ak si nie si istý, daj null. Nič si nevymýšľaj.',
    '- Nevracaj firmy z tohto zoznamu (už ich máme):', JSON.stringify(exclude.slice(0, 200)),
    '- Nevracaj personálne agentúry ani sprostredkovateľov práce.',
    `Na konci zavolaj nástroj ${REPORT.name} so všetkými firmami naraz.`,
  ].filter(x => x !== '').join('\n');
}

async function callClaude(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY — hľadanie cez AI nie je zapnuté.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      // Keď model žiadosť odmietne, server ju sám zopakuje na inom modeli.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 32000, stream: true,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 15,
          user_location: { type: 'approximate', country: 'DE' } },
        REPORT,
      ],
      messages,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(AI.errorText(data, res.status, 'Hľadanie firiem'));
  }
  const msg = await AI.readStream(res.body);
  if (msg.error) throw new Error(msg.error.message || 'Model hlásil chybu.');
  return msg;
}

async function fail(id, e) {
  await supabase.from('danubra_lead_searches').update({ status: 'error', error: String((e && e.message) || e).slice(0, 500),
    finished_at: new Date().toISOString() }).eq('id', id);
}

exports.handler = async (event) => {
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return; }
  const { search_id: id } = body;
  if (!id) return;

  // Kto volá — len prihlásený človek z appky (jeho prístupový kľúč).
  // Len člen appky — samotné prihlásenie nestačí (Supabase je spoločný s Adlify).
  const g = await require('../../app/lib/server-guard.js')(supabase).check(event);
  if (!g.ok) return;

  const { data: s } = await supabase.from('danubra_lead_searches').select('*').eq('id', id).maybeSingle();
  if (!s || s.status !== 'pending') return;
  await supabase.from('danubra_lead_searches').update({ status: 'running' }).eq('id', id);

  try {
    const p = s.params || {};
    const ids = Array.isArray(p.partner_ids) ? p.partner_ids.slice(0, 15) : [];
    const [{ data: partners }, { data: subs }, { data: leads }, { data: allP }] = await Promise.all([
      // Service role obchádza RLS — archivované riadky (migrácia 066) sa vynechajú ručne.
      ids.length ? supabase.from('danubra_partners').select('id,name,city,country').in('id', ids).is('archived_at', null)
        : supabase.from('danubra_partners').select('id,name,city,country').is('archived_at', null).limit(15),
      supabase.from('danubra_subcontracts').select('partner_id,trade,title').is('archived_at', null).limit(1000),
      supabase.from('danubra_leads').select('name').limit(5000),
      // Zámerne aj s archivovanými: firmu, ktorú sme už mali, nenavrhovať ako novú.
      supabase.from('danubra_partners').select('name').limit(2000),
    ]);
    const refs = L.aiContext(partners || [], subs || []);
    if (!refs.length) throw new Error('Nie sú vybraní žiadni odberatelia, podľa ktorých hľadať.');
    const exclude = [...(allP || []), ...(leads || [])].map(x => x.name);
    const count = Math.min(Math.max(Number(p.count) || 15, 5), 30);

    const messages = [{ role: 'user', content: prompt({ refs, region: p.region, count, exclude, note: p.note }) }];
    let msg = null;
    // Dlhé hľadanie môže server prerušiť (pause_turn) — pokračuje sa tým istým rozhovorom.
    for (let kolo = 0; kolo < 5; kolo++) {
      msg = await callClaude(messages);
      if (msg.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: msg.content });
    }
    if (msg.stop_reason === 'refusal') throw new Error('Model hľadanie odmietol. Skúste iný región alebo menej firiem.');
    const out = AI.pickTool(msg, REPORT.name);
    const list = (out && Array.isArray(out.leads)) ? out.leads : [];
    const byName = new Map((partners || []).map(x => [L.normName(x.name), x.id]));
    const rows = list.map(x => L.fromAi(x, { similarTo: byName.get(L.normName(x.similar_to)) || null })).filter(r => r.name);
    const { fresh } = L.dedupe(rows, { leads: leads || [], partners: allP || [] });

    let added = 0;
    for (const r of fresh) {
      const { error } = await supabase.from('danubra_leads').insert(r);
      if (!error) added++;
    }
    await supabase.from('danubra_lead_searches').update({ status: 'done', found: list.length, added,
      finished_at: new Date().toISOString(), error: null }).eq('id', id);
  } catch (e) {
    await fail(id, e);
  }
};
