// ============================================================================
// DANUBRA — z zadania zákazky urob zhrnutie a texty na kanály
// ============================================================================
// Kolega napíše voľným textom, čo o ponúkanej zákazke vie — pokojne aj
// skopírovaný e-mail od odberateľa. Táto funkcia z toho spraví:
//
//   1. **zhrnutie zákazky** — deväť údajov, ktoré sa vypisujú do každého kanála
//      (pozícia, miesto, projekt, forma, podmienka, ubytovanie, sadzba, nástup,
//      kontakt), plus riziká a čo treba doveriť u odberateľa,
//   2. **texty po kanáloch** — web, Bazoš CZ, Bazoš SK, Facebook CZ a SK,
//      platená reklama, voiceover a prompty na obrázky.
//
// Tri pravidlá, ktoré sú tu zámerne tvrdé:
//
//   * **Nič sa nevymýšľa.** Čo v zadaní nie je, zostane ako `[XX]`. Sadzba,
//     ktorú si model domyslí, je horšia než prázdne miesto: ľudia na ňu
//     zavolajú a nikto im nevie povedať, za koľko.
//   * **Nič sa nezverejňuje samo.** Výstup sa uloží ako **návrh** (`source:
//     'ai'`, bez schválenia) a appka ho označí. Zverejnenie je vloženie textu
//     do kanála, čo robí človek rukou.
//   * **Nič sa neprepíše.** Text, ktorý už niekto napísal alebo schválil,
//     zostáva; návrh sa doplní len tam, kde nič nie je.
//
// Kľúč k modelu je v premenných prostredia a do prehliadača sa nikdy nedostane.
//
// Premenné prostredia:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY      — bez neho funkcia len povie, že nie je nastavená
//   CLAUDE_MODEL_TEXT      — voliteľné, predvolene claude-sonnet-5-5
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Na dlhé texty do šiestich kanálov treba model, ktorý píše — nie najmenší.
const MODEL = process.env.CLAUDE_MODEL_TEXT || 'claude-sonnet-5-5';

// Značka pre údaj, ktorý sa ešte nevie. Musí sedieť s `lib/recruiting/kit.js`.
const CHYBA = '[XX]';

// Kanály a bloky — musia sedieť s `lib/recruiting/kit.js`. Keď sa tam niečo
// pridá, model o tom nevie, kým sa to nedopíše aj sem; preto je zoznam krátky
// a jednoznačný.
const BLOCKS = {
  web: ['title', 'slug', 'meta', 'perex', 'badges', 'about', 'requirements', 'offer', 'facts', 'faq', 'form'],
  bazos_cz: ['title', 'meta', 'body', 'keywords'],
  bazos_sk: ['title', 'meta', 'body', 'keywords'],
  fb_cz: ['short', 'long', 'urgent'],
  fb_sk: ['short', 'long', 'urgent'],
  ads: ['primary1', 'primary2', 'headlines', 'description', 'setup'],
  images: ['p_1x1', 'p_4x5', 'p_9x16', 'pt_1x1', 'pt_4x5', 'pt_9x16', 'canva'],
  voice: ['script'],
};

const FACTS = ['position', 'place', 'project', 'form', 'condition', 'housing', 'rate', 'start', 'contact'];

const SCHEMA = {
  name: 'podklady_k_naboru',
  description: 'Zhrnutie ponúkanej zákazky a texty na jednotlivé kanály, pripravené na vloženie.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'object',
        description: 'Zhrnutie zákazky. Čo v zadaní nie je, nechaj ako ' + CHYBA + '.',
        properties: Object.fromEntries(FACTS.map(k => [k, { type: 'string' }])),
        required: FACTS,
      },
      risks: {
        type: 'array',
        description: 'Čo môže zákazku zhodiť alebo čo treba doveriť u odberateľa. '
          + 'Krátke vety po slovensky. Prázdne pole je správna odpoveď, keď nič nevidíš.',
        items: { type: 'string' },
      },
      ask: {
        type: 'array',
        description: 'Konkrétne otázky, ktoré treba položiť odberateľovi, aby sa doplnilo ' + CHYBA + '.',
        items: { type: 'string' },
      },
      blocks: {
        type: 'array',
        description: 'Texty na kanály. Iba kanály a bloky zo zadaného zoznamu.',
        items: {
          type: 'object',
          properties: {
            channel: { type: 'string', enum: Object.keys(BLOCKS) },
            block: { type: 'string' },
            body: { type: 'string', description: 'Text na priame vloženie. Bez emoji.' },
          },
          required: ['channel', 'block', 'body'],
        },
      },
    },
    required: ['facts', 'blocks'],
  },
};

const POKYNY = `Si asistent slovenskej firmy, ktorá posiela slovenských a českých
živnostníkov na stavby v Nemecku. Z toho, čo kolega napísal o ponúkanej zákazke,
priprav podklady na nábor.

ČO JE NAJDÔLEŽITEJŠIE
- Nevymýšľaj si. Sadzbu, dátum nástupu, dĺžku práce ani nič iné, čo v zadaní
  nie je, nedoplňuj — napíš presne ${CHYBA}. Radšej päť ${CHYBA} než jedno
  vymyslené číslo.
- Konkrétna stavba predáva, „niekde v Nemecku" nie. Vypichni, čo sa stavia, čo
  už stojí a čo je na rade.
- Žiadne emoji. Žiadne superlatívy. Toto čítajú remeselníci, nie marketéri.

JAZYKY
- web, bazos_sk, fb_sk: slovensky
- bazos_cz, fb_cz, ads: česky
- images: prompty po anglicky (sú pre generátor obrázkov)
- voice: podľa krajiny, krátke vety; značky ako [confident] sú pokyny pre
  nástroj, nie text na prečítanie

ČO PATRÍ DO KTORÉHO BLOKU
web: title (pozícia + krajina + mesto), slug (bez diakritiky, spojovníky),
  meta (1–2 vety do Googlu), perex (do karty v zozname), badges (5 krátkych
  riadkov), about (čo sa stavia a náplň práce po profesiách), requirements,
  offer, facts (počet ľudí, nástup, ubytovanie, náradie, krajina, sadzba),
  faq (otázky, ktoré prídu tak či tak, s odpoveďami), form (nadpis a podtext
  k formuláru)
bazos_cz/bazos_sk: title (s cenou), meta (rubrika, lokalita, mzda), body
  (celý inzerát, odrážky bez emoji, kontakt na konci), keywords (kľúčové slová
  s diakritikou aj bez, oddelené čiarkou)
fb_cz/fb_sk: short (do skupín, 5 riadkov), long (na firemnú stránku),
  urgent (keď treba obsadiť hneď)
ads: primary1, primary2 (primárne texty), headlines (tri, každý na vlastnom
  riadku), description (jeden riadok), setup (cielenie, denný rozpočet,
  formáty, tlačidlo — a pripomienka priznať kategóriu Zamestnanie)
images: p_1x1, p_4x5, p_9x16 (fotorealistické prompty bez textu v obrázku),
  pt_1x1, pt_4x5, pt_9x16 (to isté, ale s nápisom v obrázku — tmavomodrá
  #0E2A47 a oranžová #EF771D, bez loga a bez názvu firmy), canva (texty, ktoré
  sa dopĺňajú v Canve: nadpis, podnadpis, pruh, pilulka so sumou a telefónom)
voice: script

PRAVIDLÁ, KTORÉ PLATIA V TOMTO BIZNISE
- Je to zmluva o dielo (Werkvertrag), nie prenájom ľudí. Píš o diele a jeho
  rozsahu, nikdy o „pridelení pracovníkov" ani o „práci pod vedením zákazníka".
- Nesľubuj nič o zamestnaní, poistení ani mzde zo strany nemeckej firmy.
- Ubytovanie sa nehradí, ak to v zadaní nie je — zvyčajne sa odráta z fakturácie.
- Pri regulovaných remeslách (napríklad elektrikár) a pri zváraní spomeň v
  rizikách, čo treba vopred: oznámenie Handwerkskammer podľa §9 HwO, A1,
  certifikát EN ISO 9606-1.`;

async function analyze(brief, plan, supplier) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY');

  const kontext = [
    plan.title ? `Názov náboru: ${plan.title}` : null,
    plan.headcount ? `Počet ľudí v nábore: ${plan.headcount}` : null,
    plan.city ? `Mesto: ${plan.city}` : null,
    plan.start_date ? `Nástup podľa náboru: ${plan.start_date}` : null,
    plan.offer_rate ? `Ponúkaná sadzba: ${plan.offer_rate} €/h` : null,
    supplier.name ? `Naša firma: ${supplier.name}` : null,
    supplier.phone ? `Telefón: ${supplier.phone}` : null,
    supplier.email ? `E-mail: ${supplier.email}` : null,
  ].filter(Boolean).join('\n');

  const bloky = Object.entries(BLOCKS)
    .map(([ch, list]) => `${ch}: ${list.join(', ')}`).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      tools: [SCHEMA],
      tool_choice: { type: 'tool', name: 'podklady_k_naboru' },
      messages: [{
        role: 'user',
        content: `${POKYNY}\n\nZOZNAM KANÁLOV A BLOKOV (iné nepoužívaj):\n${bloky}\n\n`
          + `ČO O NÁBORE VIEME Z APPKY:\n${kontext || '(nič)'}\n\n`
          + `ZADANIE OD KOLEGU:\n${brief}`,
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Analýza zlyhala (${res.status})`);
  const use = (data.content || []).find(c => c.type === 'tool_use');
  if (!use || !use.input) throw new Error('Model nevrátil podklady');
  return use.input;
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
    const { planId } = JSON.parse(event.body || '{}');
    if (!planId) throw new Error('Chýba planId');

    if (!process.env.ANTHROPIC_API_KEY) {
      // Bez kľúča to nie je chyba — appka to povie a podklady sa dajú písať
      // ručne. Tiché zlyhanie by vyzeralo ako pokazená funkcia.
      return { statusCode: 200, headers: cors,
        body: JSON.stringify({ skipped: 'no_api_key', blocks: 0 }) };
    }

    const { data: plan, error: ep } = await supabase
      .from('danubra_recruitment_plans').select('*').eq('id', planId).maybeSingle();
    if (ep) throw new Error(ep.message);
    if (!plan) throw new Error('Nábor sa nenašiel');
    if (!plan.brief || !plan.brief.trim()) throw new Error('Nábor nemá zadanie');

    const { data: cfg } = await supabase
      .from('danubra_settings').select('supplier').limit(1).maybeSingle();
    const supplier = (cfg && cfg.supplier) || {};

    const out = await analyze(plan.brief, plan, supplier);

    // ── Zhrnutie zákazky ────────────────────────────────────────────────
    // Údaj, ktorý už človek vyplnil, sa neprepíše — model dopĺňa, neprepisuje.
    const facts = { ...(plan.analysis || {}) };
    for (const k of FACTS) {
      const nove = String((out.facts || {})[k] || '').trim();
      const stare = String(facts[k] || '').trim();
      if (!stare && nove) facts[k] = nove;
    }
    if (Array.isArray(out.risks) && out.risks.length) facts._risks = out.risks;
    if (Array.isArray(out.ask) && out.ask.length) facts._ask = out.ask;

    await supabase.from('danubra_recruitment_plans').update({
      analysis: facts,
      analyzed_at: new Date().toISOString(),
    }).eq('id', planId);

    // ── Texty po kanáloch ───────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('danubra_plan_assets')
      .select('id,channel,block,body,source,approved_at')
      .eq('plan_id', planId).is('archived_at', null);
    const mam = new Set((existing || []).map(a => `${a.channel}:${a.block}`));

    const rows = [];
    for (const b of (out.blocks || [])) {
      const channel = String(b.channel || '');
      const block = String(b.block || '');
      const body = String(b.body || '').trim();
      if (!body) continue;
      if (!BLOCKS[channel] || !BLOCKS[channel].includes(block)) continue;
      // Čo už niekto napísal, sa nechá na pokoji.
      if (mam.has(`${channel}:${block}`)) continue;
      rows.push({
        plan_id: planId, channel, block, body,
        source: 'ai',              // návrh — appka ho označí a človek ho prečíta
        approved_at: null,
      });
    }

    if (rows.length) {
      const { error: ei } = await supabase.from('danubra_plan_assets').insert(rows);
      if (ei) throw new Error(ei.message);
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      blocks: rows.length,
      facts: FACTS.filter(k => facts[k]).length,
      risks: (out.risks || []).length,
      ask: (out.ask || []).length,
      model: MODEL,
    }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
