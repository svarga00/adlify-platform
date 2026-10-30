// ============================================================================
// punds web — preklad ponuky do ďalších jazykov webu (Claude)
// ============================================================================
// Inzerát sa píše po slovensky. Pred zverejnením na punds.sk sa jedným
// tlačidlom preloží do češtiny, maďarčiny, nemčiny, angličtiny, rumunčiny,
// poľštiny a bulharčiny — výsledok sa uloží k inzerátu (danubra_ads.i18n)
// a dá sa ešte ručne opraviť. Kým preklad nie je, web ukáže slovenský text
// (pri ro/pl/bg najprv anglický — web/shared/jobs.js → FALLBACK).
//
//   POST { ad: { web_title, web_body, duration, duties[], requirements[],
//                benefits[], faq[{q,a}] }, langs: ['cz','hu','de','en','ro','pl','bg'] }
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
// Preklad inzerátov a textov webu ide cez platený model — len člen appky
// s právom na Inzeráty alebo Marketing (samotné prihlásenie nestačí:
// Supabase je spoločný s Adlify).
const guard = require('../../app/lib/server-guard.js')(supabase);
const MODEL = process.env.CLAUDE_TRANSLATE_MODEL || 'claude-sonnet-5-5';
// Jazyky webu punds.sk okrem slovenčiny (poradie = poradie v appke). Pri
// zmene upraviť aj app/lib/recruiting/web-ad.js → LANGS a web/shared/sites.js.
const NAMES = { cz: 'čeština', hu: 'maďarčina', de: 'nemčina', en: 'angličtina', ro: 'rumunčina', pl: 'poľština', bg: 'bulharčina (cyrilika)' };
// Ako sa v jednotlivých jazykoch vyká — pre prompt.
const FORMAL = 'cz „Vy", hu „Ön", de „Sie", ro „dumneavoastră / Dvs.", pl „Pan/Pani / Państwo", bg „Вие"; v angličtine neutrálne';
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
  const g = await guard.check(event, { key: ['ads', 'marketing'] });
  if (!g.ok) return out(g.status, { error: g.error });
  if (!process.env.ANTHROPIC_API_KEY) return out(400, { error: 'Preklad nie je zapnutý (chýba ANTHROPIC_API_KEY v Netlify).' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  // Režim „texty stránky": { texts: { cesta: text }, from: 'sk'|'de', langs: [...] } → { texts: { jazyk: { cesta: text } } }
  if (b.texts && typeof b.texts === 'object') return translateTexts(b);
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
  const prompt = adPrompt(src, langs);
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

/** Zadanie prekladu ponuky — rodená kvalita, vykanie, zachované formátovanie. */
function adPrompt(src, langs) {
  return `Prelož ponuku práce z webu punds.sk (nábor remeselníkov — živnostníkov — zo Slovenska, Česka, Maďarska, `
    + `Rumunska, Poľska a Bulharska na stavby v Nemecku a Rakúsku) do jazykov: ${langs.map((l) => `${l} = ${NAMES[l]}`).join(', ')}.\n\n`
    + `Pravidlá:\n`
    + `- Kvalita rodeného hovoriaceho: prirodzený, správny jazyk, ako by ponuku napísal personalista v danej krajine pre stavebných remeselníkov. Nie doslovný preklad.\n`
    + `- Správna diakritika a pravopis (ro: ă â î ș ț, nie ş ţ; pl: ą ć ę ł ń ó ś ź ż; bg: cyrilika).\n`
    + `- Oslovenie vykaním (${FORMAL}). Register formálny, ale priateľský.\n`
    + `- Nemecké odborné výrazy (A1, Steuernummer, Freistellung, WDVS, Trockenbau, MIG/MAG, ISO 9606-1) ponechaj.\n`
    + `- Čísla, sumy, mestá a skratky nemeň. Zachovaj formátovanie: odseky a riadky v popise (prázdny riadok = nový odsek), `
    + `počet a poradie položiek v zoznamoch, dvojicu otázka–odpoveď pri každej otázke.\n`
    + `- Nič nepridávaj ani nevynechávaj.\n\n`
    + `PÔVODNÝ TEXT (slovensky, JSON):\n${JSON.stringify(src, null, 1)}`;
}

const LANG_NAMES = { sk: 'slovenčina', ...NAMES };

/** Preklad zmenených textov stránky webu do ďalších jazykov. */
async function translateTexts(b) {
  const from = LANG_NAMES[b.from] ? b.from : 'sk';
  const langs = (b.langs || []).filter((l) => LANG_NAMES[l] && l !== from).slice(0, 8);
  const entries = Object.entries(b.texts).filter(([k, v]) => k && typeof v === 'string' && v.trim()).slice(0, 120);
  if (!langs.length || !entries.length) return out(400, { error: 'Nie je čo prekladať.' });
  const arr = { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, text: { type: 'string' } }, required: ['path', 'text'] } };
  const tool = { name: 'preklady_textov', description: 'Preklady textov webovej stránky.',
    input_schema: { type: 'object', properties: Object.fromEntries(langs.map((l) => [l, arr])), required: langs } };
  const prompt = `Prelož texty webovej stránky punds (nábor remeselníkov na stavby v Nemecku / ponuka remeselníkov nemeckým firmám) `
    + `z jazyka ${LANG_NAMES[from]} do: ${langs.map((l) => `${l} = ${LANG_NAMES[l]}`).join(', ')}.\n\n`
    + `Pravidlá:\n- Kvalita rodeného hovoriaceho, prirodzený jazyk webu, nie doslovný preklad. Správna diakritika (ro: ș ț, pl: ą ę ł ś ż…, bg: cyrilika). Vykanie (${FORMAL}).\n`
    + `- HTML značky (<b>, <a …>, <br>), nové riadky a zástupné znaky ako {PHONE} a {MAIL} ponechaj presne tak.\n`
    + `- Nemecké odborné výrazy (A1, Steuernummer, Freistellung, WDVS, AÜG, Werkvertrag) a čísla nemeň.\n`
    + `- Vráť každú položku s rovnakou „path".\n\nTEXTY (JSON):\n${JSON.stringify(entries.map(([path, text]) => ({ path, text })))}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(AI.body({ model: MODEL, tool, prompt, maxTokens: 12000 })),
    });
    const data = await res.json();
    if (!res.ok) return out(502, { error: AI.errorText(data, res.status, 'Preklad') });
    const t = AI.pickTool(data, tool.name);
    if (!t) return out(502, { error: 'Preklad sa nepodaril — skúste znova.' });
    const known = new Set(entries.map(([k]) => k));
    const texts = {};
    for (const l of langs) {
      texts[l] = {};
      for (const x of (t[l] || [])) if (x && known.has(x.path) && typeof x.text === 'string') texts[l][x.path] = x.text.slice(0, 6000);
    }
    return out(200, { texts });
  } catch (e) {
    return out(500, { error: String(e.message || e).slice(0, 200) });
  }
}

exports.NAMES = NAMES;
exports.LANG_NAMES = LANG_NAMES;
exports.adPrompt = adPrompt;
