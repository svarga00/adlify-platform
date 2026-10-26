// ============================================================================
// punds web — preklad ponuky do ďalších jazykov webu (Claude)
// ============================================================================
// Inzerát sa píše po slovensky. Pred zverejnením na punds.sk sa jedným
// tlačidlom preloží do češtiny, maďarčiny, nemčiny a angličtiny — výsledok
// sa uloží k inzerátu (danubra_ads.i18n) a dá sa ešte ručne opraviť.
//
//   POST { ad: { web_title, web_body, duration, duties[], requirements[],
//                benefits[], faq[{q,a}] }, langs: ['cz','hu','de','en'] }
//   → { i18n: { cz: {title, body, duration, duties, requirements, benefits, faq}, … } }
//
// Len pre prihláseného používateľa appky.
// Env: ANTHROPIC_API_KEY, CLAUDE_TRANSLATE_MODEL (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const AI = require('../../app/lib/ai.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const srv = require('../../app/lib/mail/server.js')(supabase);
const MODEL = process.env.CLAUDE_TRANSLATE_MODEL || 'claude-sonnet-5-5';
const NAMES = { cz: 'čeština', hu: 'maďarčina', de: 'nemčina', en: 'angličtina' };
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

const item = {
  type: 'object',
  properties: {
    title: { type: 'string' }, body: { type: 'string' }, duration: { type: 'string' },
    duties: { type: 'array', items: { type: 'string' } },
    requirements: { type: 'array', items: { type: 'string' } },
    benefits: { type: 'array', items: { type: 'string' } },
    faq: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } },
  },
  required: ['title'],
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const user = await srv.userFrom(event);
  if (!user) return out(401, { error: 'Neprihlásený používateľ.' });
  if (!process.env.ANTHROPIC_API_KEY) return out(400, { error: 'Preklad nie je zapnutý (chýba ANTHROPIC_API_KEY v Netlify).' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const ad = b.ad || {};
  const langs = (b.langs || Object.keys(NAMES)).filter((l) => NAMES[l]);
  if (!ad.web_title) return out(400, { error: 'Najprv vyplňte verejný názov pozície.' });

  const tool = {
    name: 'preklady',
    description: 'Preklady ponuky práce do jazykov webu punds.sk.',
    input_schema: { type: 'object', properties: Object.fromEntries(langs.map((l) => [l, item])), required: langs },
  };
  const src = {
    title: ad.web_title, body: ad.web_body || '', duration: ad.duration || '',
    duties: ad.duties || [], requirements: ad.requirements || [], benefits: ad.benefits || [], faq: ad.faq || [],
  };
  const prompt = `Prelož ponuku práce z webu punds.sk (nábor slovenských, českých a maďarských remeselníkov `
    + `— živnostníkov — na stavby v Nemecku a Rakúsku) do jazykov: ${langs.map((l) => `${l} = ${NAMES[l]}`).join(', ')}.\n\n`
    + `Pravidlá:\n`
    + `- Prirodzený jazyk, ako by to napísal rodený hovoriaci personalista. Nie doslovný preklad.\n`
    + `- Oslovenie vykaním (cz „Vy", hu „Ön", de „Sie"); v angličtine neutrálne.\n`
    + `- Nemecké odborné výrazy (A1, Steuernummer, Freistellung, WDVS, Trockenbau, MIG/MAG, ISO 9606-1) ponechaj.\n`
    + `- Čísla, sumy, mestá a skratky nemeň. Zachovaj počet a poradie položiek v zoznamoch.\n`
    + `- Nič nepridávaj ani nevynechávaj.\n\n`
    + `PÔVODNÝ TEXT (slovensky, JSON):\n${JSON.stringify(src, null, 1)}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(AI.body({ model: MODEL, tool, prompt, maxTokens: 8000 })),
    });
    const data = await res.json();
    if (!res.ok) return out(502, { error: AI.errorText(data, res.status, 'Preklad') });
    const t = AI.pickTool(data, tool.name);
    if (!t) return out(502, { error: 'Preklad sa nepodaril — skúste znova.' });
    const i18n = {};
    for (const l of langs) {
      const x = t[l] || {};
      i18n[l] = {
        title: String(x.title || '').slice(0, 200), body: String(x.body || '').slice(0, 6000), duration: String(x.duration || '').slice(0, 100),
        duties: (x.duties || []).map(String).slice(0, 30), requirements: (x.requirements || []).map(String).slice(0, 30),
        benefits: (x.benefits || []).map(String).slice(0, 30),
        faq: (x.faq || []).filter((f) => f && f.q && f.a).map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 2000) })).slice(0, 20),
      };
    }
    return out(200, { i18n });
  } catch (e) {
    return out(500, { error: String(e.message || e).slice(0, 200) });
  }
};
