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
// Čítanie odpovede modelu je na jednom mieste — pozri app/lib/ai.js.
const AI = require('../../app/lib/ai.js');

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
  ads_cz: ['primary1', 'primary2', 'headlines', 'description', 'setup'],
  ads_sk: ['primary1', 'primary2', 'headlines', 'description', 'setup'],
  voice_cz: ['script'],
  voice_sk: ['script'],
  images: ['p_1x1', 'p_4x5', 'p_9x16', 'pt_1x1', 'pt_4x5', 'pt_9x16', 'canva'],
};

const FACTS = ['position', 'place', 'project', 'form', 'condition', 'housing', 'rate', 'start', 'duration', 'contact'];
// Čo ktoré pole zhrnutia znamená — modelu, aby nástup nebol veta s časom.
const FACT_POPIS = {
  start: 'Dátum nástupu, len dátum v tvare RRRR-MM-DD. Čas začiatku práce sem nepatrí '
    + '(ten patrí do condition). Keď dátum nie je, ' + CHYBA + '.',
  duration: 'Trvanie zákazky: „N týždňov" alebo „dlhodobá". Keď nie je známe, ' + CHYBA + '.',
  condition: 'Podmienky práce — aj čas začiatku práce, sobota, náradie, jazyk.',
  rate: 'Sadzba pre živnostníka €/h — nie sadzba odberateľa.',
};

// Polia samotného náboru. Vyplnia sa len tie, ktoré sú v zadaní — sadzba,
// ktorú si model domyslí, by sa dostala do marže aj do inzerátu.
const PLAN_FIELDS = ['trade_key', 'headcount', 'city', 'country', 'start_date',
  'offer_rate', 'client_rate', 'legal_form', 'skill_level'];

// Kde sa dá inzerovať. Musí sedieť s `CHANNELS` v `app/js/modules/hiring.js`.
const KANALY = ['referral', 'meta_ads', 'facebook', 'profesia', 'tiktok', 'web'];

const SCHEMA = {
  name: 'podklady_k_naboru',
  description: 'Zhrnutie ponúkanej zákazky a texty na jednotlivé kanály, pripravené na vloženie.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'object',
        description: 'Zhrnutie zákazky. Čo v zadaní nie je, nechaj ako ' + CHYBA + '.',
        properties: Object.fromEntries(FACTS.map(k => [k,
          FACT_POPIS[k] ? { type: 'string', description: FACT_POPIS[k] } : { type: 'string' }])),
        required: FACTS,
      },
      plan: {
        type: 'object',
        description: 'Polia samotného náboru. Vynechaj všetko, čo v zadaní nie je — '
          + 'nič nedopĺňaj z hlavy. Sadzby len vtedy, keď sú v zadaní číslom.',
        properties: {
          trade_key: { type: 'string', description: 'Presný kľúč remesla zo zoznamu, inak vynechaj.' },
          headcount: { type: 'integer', description: 'Koľko ľudí sa hľadá dokopy.' },
          city: { type: 'string' },
          country: { type: 'string', description: 'Dvojpísmenový kód, napríklad DE.' },
          start_date: { type: 'string', description: 'RRRR-MM-DD. Keď je nástup „dohodou", vynechaj.' },
          offer_rate: { type: 'number', description: 'Čo ponúkame živnostníkovi, €/h.' },
          client_rate: { type: 'number', description: 'Čo fakturujeme odberateľovi, €/h.' },
          legal_form: { type: 'string', enum: ['szco', 'employee'] },
          skill_level: { type: 'string', enum: ['werker', 'fachwerker'] },
          channels: { type: 'array', items: { type: 'string', enum: KANALY },
            description: 'Kde má zmysel inzerovať.' },
        },
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
      questions: {
        type: 'array',
        description: 'Otázky pre remeselníka do telefonátu — odborné, na toto remeslo '
          + 'a túto prácu. Nie všeobecné („máte prax?"), ale také, na ktorých sa pozná, '
          + 'či to naozaj robil. Najviac osem. Prázdne pole je správna odpoveď, keď '
          + 'zadanie o remesle nič konkrétne nehovorí.',
        items: {
          type: 'object',
          properties: {
            question_sk: { type: 'string', description: 'Otázka po slovensky.' },
            question_de: { type: 'string', description: 'Tá istá otázka po nemecky, ak sa dá.' },
            good_answer: { type: 'string', description: 'Čo má zaznieť, aby to bolo v poriadku.' },
            red_flag_answer: { type: 'string', description: 'Odpoveď, pri ktorej treba zbystriť.' },
            weight: { type: 'integer', description: '1 bežná, 3 kľúčová — na tú sa treba spýtať.' },
          },
          required: ['question_sk', 'good_answer'],
        },
      },
      risks: {
        type: 'array',
        description: 'Čo môže zákazku zhodiť alebo čo treba doveriť u odberateľa. '
          + 'Krátke vety po slovensky, najviac päť. Prázdne pole je správna odpoveď, keď nič nevidíš.',
        items: { type: 'string' },
      },
      ask: {
        type: 'array',
        description: 'Konkrétne otázky, ktoré treba položiť odberateľovi, aby sa doplnilo '
          + CHYBA + '. Najviac päť, krátko.',
        items: { type: 'string' },
      },
    required: ['facts', 'blocks'],
  },
};

const POKYNY = `Si asistent slovenskej firmy, ktorá posiela slovenských a českých
živnostníkov na stavby v Nemecku. Z toho, čo kolega napísal o ponúkanej zákazke,
priprav podklady na nábor.

ČO JE NAJDÔLEŽITEJŠIE
- Nástup je dátum, trvanie je počet týždňov alebo „dlhodobá" — dve rôzne veci.
  Čas začiatku práce (napríklad 6:30) patrí do podmienok, nie k nástupu.
- Nevymýšľaj si. Sadzbu, dátum nástupu, dĺžku práce ani nič iné, čo v zadaní
  nie je, nedoplňuj — napíš presne ${CHYBA}. Radšej päť ${CHYBA} než jedno
  vymyslené číslo.
- Konkrétna stavba predáva, „niekde v Nemecku" nie. Vypichni, čo sa stavia, čo
  už stojí a čo je na rade.
- Žiadne emoji. Žiadne superlatívy. Toto čítajú remeselníci, nie marketéri.

JAZYKY
- web, bazos_sk, fb_sk, ads_sk, voice_sk: slovensky
- bazos_cz, fb_cz, ads_cz, voice_cz: česky
- images: prompty po anglicky (sú pre generátor obrázkov)
- voiceover: krátke vety; značky ako [confident] sú pokyny pre nástroj, nie
  text na prečítanie

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
ads_cz/ads_sk: primary1, primary2 (primárne texty), headlines (tri, každý na
  vlastnom riadku), description (jeden riadok), setup (cielenie, denný
  rozpočet, formáty, tlačidlo — a pripomienka priznať kategóriu Zamestnanie)
images: p_1x1, p_4x5, p_9x16 (fotorealistické prompty bez textu v obrázku),
  pt_1x1, pt_4x5, pt_9x16 (to isté, ale s nápisom v obrázku — tmavomodrá
  #0E2A47 a oranžová #EF771D, bez loga a bez názvu firmy), canva (texty, ktoré
  sa dopĺňajú v Canve: nadpis, podnadpis, pruh, pilulka so sumou a telefónom)
voice_cz/voice_sk: script

POLIA NÁBORU (plan)
Vyplň len to, čo je v zadaní. Kľúč remesla musí byť presne jeden z kľúčov,
ktoré dostaneš v zozname remesiel — keď ani jeden nesedí, vynechaj ho. Sadzby
vyplň len vtedy, keď sú v zadaní číslom; „dohodou" alebo [XX] znamená
vynechať. Dátum nástupu je dátum, nie slovo.

OTÁZKY PRE REMESELNÍKA (questions)
Také, na ktorých sa pozná, či prácu naozaj robil — nie „máte prax?". Pri
potrubí sa pýtaj na rozsahy, polohy zvárania, úpravu hrán, spády; pri
sadrokartóne na rozteče a dvojité opláštenie. Ku každej napíš, čo má zaznieť,
a keď to má zmysel, aj odpoveď, pri ktorej treba zbystriť. Váhu 3 dávaj len
otázkam, na ktoré sa treba spýtať. Nemecké znenie pridaj, keď sa dá —
živnostník to bude slýchať na stavbe.

PRAVIDLÁ, KTORÉ PLATIA V TOMTO BIZNISE
- Je to zmluva o dielo (Werkvertrag), nie prenájom ľudí. Píš o diele a jeho
  rozsahu, nikdy o „pridelení pracovníkov" ani o „práci pod vedením zákazníka".
- Nesľubuj nič o zamestnaní, poistení ani mzde zo strany nemeckej firmy.
- Ubytovanie sa nehradí, ak to v zadaní nie je — zvyčajne sa odráta z fakturácie.
- Pri regulovaných remeslách (napríklad elektrikár) a pri zváraní spomeň v
  rizikách, čo treba vopred: oznámenie Handwerkskammer podľa §9 HwO, A1,
  certifikát EN ISO 9606-1.`;

async function analyze(brief, plan, supplier, trades) {
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

  // Zhrnutie zákazky, ako je teraz. Čo v ňom človek doplnil (napríklad
  // sadzbu pre živnostníka, ktorá v zadaní nebola), musí ísť do textov —
  // inak by pregenerovanie znova napísalo [XX] tam, kde už údaj je.
  const NAZOV = { position: 'Pozícia', place: 'Miesto', project: 'Projekt',
    form: 'Forma spolupráce', condition: 'Podmienka', housing: 'Ubytovanie',
    rate: 'Sadzba pre živnostníka', start: 'Nástup (dátum)', duration: 'Trvanie zákazky',
    contact: 'Kontakt' };
  const a = plan.analysis || {};
  const ludske = a._human || {};
  const zhrnutie = FACTS.map((k) => {
    const v = String(a[k] || '').trim();
    if (!v || v.includes(CHYBA)) return null;
    return `${NAZOV[k] || k}: ${v}${ludske[k] ? ' (potvrdil človek)' : ''}`;
  }).filter(Boolean).join('\n');

  // Doplnky od nás — fakturácia, benefity, poznámky. V zadaní od Nemca nie
  // sú nikdy, sú naše; keď ich niekto napísal, patria do textov.
  const ex = a._extra || {};
  const doplnky = [['billing', 'Fakturácia pre živnostníka'], ['benefits', 'Benefity a výhody'],
    ['more', 'Ďalšie podklady a poznámky']]
    .map(([k, l]) => (String(ex[k] || '').trim() ? `${l}: ${String(ex[k]).trim()}` : null))
    .filter(Boolean).join('\n');

  const bloky = Object.entries(BLOCKS)
    .map(([ch, list]) => `${ch}: ${list.join(', ')}`).join('\n');
  // Zoznam remesiel ide modelu preto, aby `trade_key` sedel s databázou.
  // Vymyslený kľúč by v appke svietil ako „zvaraci-potrubia" namiesto názvu.
  const remesla = (trades || []).map(t => `${t.key} = ${t.name_sk}`).join('\n') || '(žiadne)';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(AI.body({
      model: MODEL, tool: SCHEMA, maxTokens: 24000,
      prompt: `${POKYNY}\n\nZOZNAM KANÁLOV A BLOKOV (iné nepoužívaj):\n${bloky}\n\n`
        + `REMESLÁ V DATABÁZE (kľúč = názov; iný kľúč nepoužívaj):\n${remesla}\n\n`
        + `KDE SA DÁ INZEROVAŤ (iné nepoužívaj): ${KANALY.join(', ')}\n\n`
        + `ČO O NÁBORE VIEME Z APPKY:\n${kontext || '(nič)'}\n\n`
        + (zhrnutie ? 'ZHRNUTIE ZÁKAZKY Z MINULEJ PRÍPRAVY. Údaje „potvrdil človek" platia vždy '
          + 'a použi ich v textoch aj v zhrnutí. Ostatné sú z minulej prípravy — keď zadanie '
          + `hovorí inak, platí zadanie.\n${zhrnutie}\n\n` : '')
        + (doplnky ? 'DOPLNKY OD NÁS — platia. Zapracuj ich do textov tam, kde sa hodia; '
          + `nič k nim nepridávaj a nič nezveličuj.\n${doplnky}\n\n` : '')
        + `ZADANIE OD KOLEGU:\n${brief}`,
    })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(AI.errorText(data, res.status, 'Analýza'));
  // Odpoveď sa nezmestila do limitu — je nedokončená. Polovičné podklady
  // sa nezapíšu; radšej nič, než texty, ktoré končia v polovici vety.
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Odpoveď bola príliš dlhá a nedokončila sa. Nič som nezmenil — '
      + 'skús to znova; ak to zlyhá aj druhýkrát, skráť zadanie.');
  }
  const out = AI.pickTool(data, SCHEMA.name);
  if (!out) throw new Error('Model nevrátil podklady');
  return out;
}

/**
 * Celá analýza jedného náboru: zadanie → zhrnutie, polia náboru, texty po
 * kanáloch a návrhy otázok. Zapisuje rovno do databázy a vráti, čo pribudlo.
 *
 * Volá ju aj `danubra-analyze-brief-background` — texty do šiestich kanálov
 * sa píšu minútu aj dve a bežná funkcia na Netlify skončí skôr (504). Na
 * pozadí môže bežať až pätnásť minút.
 */
async function run(planId, { regen = false } = {}) {
  if (!planId) throw new Error('Chýba planId');
  if (!process.env.ANTHROPIC_API_KEY) {
    // Bez kľúča to nie je chyba — appka to povie a podklady sa dajú písať
    // ručne. Tiché zlyhanie by vyzeralo ako pokazená funkcia.
    return { skipped: 'no_api_key', blocks: 0 };
  }

  const { data: plan, error: ep } = await supabase
    .from('danubra_recruitment_plans').select('*').eq('id', planId).maybeSingle();
  if (ep) throw new Error(ep.message);
  if (!plan) throw new Error('Nábor sa nenašiel');
  if (!plan.brief || !plan.brief.trim()) throw new Error('Nábor nemá zadanie');

  const { data: cfg } = await supabase
    .from('danubra_settings').select('supplier').limit(1).maybeSingle();
  const supplier = (cfg && cfg.supplier) || {};

  // Remeslá z databázy, aby kľúč sedel. Vymyslený kľúč by v appke svietil
  // ako „zvaraci-potrubia" namiesto názvu remesla.
  const { data: trades } = await supabase
    .from('danubra_trades').select('key,name_sk').eq('active', true).limit(100);

  const out = await analyze(plan.brief, plan, supplier, trades || []);

  // Texty, ktoré sa dajú použiť. Keď model nevrátil ani jeden, nezapíše sa
  // nič — ani zhrnutie. Inak by nábor vyzeral pripravený a texty by chýbali.
  const nove = new Map();
  for (const b of (out.blocks || [])) {
    const channel = String((b && b.channel) || '');
    const block = String((b && b.block) || '');
    const body = String((b && b.body) || '').trim();
    if (!body || !BLOCKS[channel] || !BLOCKS[channel].includes(block)) continue;
    nove.set(`${channel}:${block}`, { channel, block, body });
  }
  if (!nove.size) {
    throw new Error('Model nevrátil žiadne texty. Nič som nezmenil — skús to o chvíľu znova.');
  }

  // ── Zhrnutie zákazky ────────────────────────────────────────────────
  // Údaj, ktorý už človek vyplnil, sa neprepíše — model dopĺňa, neprepisuje.
  //
  // **Pregenerovanie** (`regen`): človek dopísal do zadania, čo chýbalo, a
  // chce podklady podľa nového zadania. Vtedy sa prepíše to, čo napísala
  // appka — ale nie to, čo človek v zhrnutí sám upravil (`_human`). Stará
  // hodnota sa odloží do `_predtym`, nič sa nestratí.
  const facts = { ...(plan.analysis || {}) };
  const human = facts._human || {};
  const predtym = {};
  // Nástup je dátum. Keď ho model napíše po slovensky („26.10.2026"),
  // prepíše sa na RRRR-MM-DD, aby ho appka vedela dať do kalendára.
  const iso = (v) => {
    const t = String(v || '').trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return t;
    m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
  };
  for (const k of FACTS) {
    let nove = String((out.facts || {})[k] || '').trim();
    if (k === 'start') nove = iso(nove);
    const stare = String(facts[k] || '').trim();
    if (!nove) continue;
    if (!stare) facts[k] = nove;
    else if (regen && !human[k] && stare !== nove) { predtym[k] = stare; facts[k] = nove; }
  }
  if (Object.keys(predtym).length) facts._predtym = { ...(facts._predtym || {}), ...predtym };
  // Zadanie, z ktorého podklady vznikli — appka podľa neho pozná, že sa
  // odvtedy zmenilo a podklady treba pregenerovať.
  facts._brief = plan.brief;
  // Zhrnutie je od tejto chvíle v súlade s textami.
  facts._dirty = false;
  if (Array.isArray(out.risks) && out.risks.length) facts._risks = out.risks;
  if (Array.isArray(out.ask) && out.ask.length) facts._ask = out.ask;

  // ── Polia samotného náboru ──────────────────────────────────────────
  // Vyplní sa **len to, čo je prázdne**. Čo človek napísal, zostáva — model
  // dopĺňa, neprepisuje. A čo nie je v zadaní, zostane prázdne: sadzba,
  // ktorú si model domyslí, by sa dostala do marže aj do inzerátu.
  const planPatch = {};
  const navrh = out.plan || {};
  // Čo do polí náboru vyplnila appka minule. Pri pregenerovaní sa smie
  // prepísať len hodnota, ktorá je stále tá od appky — človekom zmenená nie.
  const odAppky = facts._ai_plan || {};
  const platneRemeslo = (k) => (trades || []).some(t => t.key === k);
  for (const k of PLAN_FIELDS) {
    const nove = navrh[k];
    if (nove === undefined || nove === null || nove === '') continue;
    const stare = plan[k];
    const prazdne = stare === null || stare === undefined || stare === '';
    const zAppky = regen && odAppky[k] !== undefined && String(odAppky[k]) === String(stare);
    if (!prazdne && !zAppky) continue;
    if (k === 'trade_key' && !platneRemeslo(nove)) continue;
    if ((k === 'offer_rate' || k === 'client_rate') && !(Number(nove) > 0)) continue;
    if (k === 'headcount' && !(Number(nove) > 0)) continue;
    if (k === 'start_date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(nove))) continue;
    planPatch[k] = nove;
  }
  // Kanály sa dopĺňajú, nie prepisujú — človek si mohol niektoré vypnúť.
  const kanaly = (navrh.channels || []).filter(c => KANALY.includes(c));
  if (kanaly.length) {
    const uz = Array.isArray(plan.channels) ? plan.channels : [];
    const spolu = [...new Set([...uz, ...kanaly])];
    if (spolu.length !== uz.length) planPatch.channels = spolu;
  }

  // ── Texty po kanáloch ───────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('danubra_plan_assets')
    .select('id,channel,block,body,source,approved_at')
    .eq('plan_id', planId).is('archived_at', null);
  // Pri pregenerovaní sa nahrádza **text po texte**: starý návrh od appky
  // ide do archívu len vtedy, keď za neho prišiel nový. Predtým sa najprv
  // odložili všetky staré a potom sa zapísali nové — a keď model nové
  // nevrátil, nábor zostal bez textov (Lixenried, 21. 10.). Čo človek
  // upravil (`source: 'human'`) alebo schválil, sa nenahrádza nikdy.
  const lenNavrh = (a) => a.source === 'ai' && !a.approved_at;
  const nahradim = regen
    ? (existing || []).filter(a => lenNavrh(a) && nove.has(`${a.channel}:${a.block}`)) : [];
  const nahradeneId = new Set(nahradim.map(a => a.id));
  const ostava = (existing || []).filter(a => !nahradeneId.has(a.id));
  const mam = new Set(ostava.map(a => `${a.channel}:${a.block}`));

  const rows = [];
  for (const [kluc, b] of nove) {
    // Čo už niekto napísal, sa nechá na pokoji.
    if (mam.has(kluc)) continue;
    rows.push({
      plan_id: planId, channel: b.channel, block: b.block, body: b.body,
      source: 'ai',              // návrh — appka ho označí a človek ho prečíta
      approved_at: null,
    });
  }

  // Na jedno miesto (kanál + blok) smie byť v databáze len jeden živý text
  // (index `danubra_plan_assets_live`). Preto najprv starý do archívu, potom
  // nový — a keby zápis nového zlyhal, starý sa hneď vráti späť. Nábor tak
  // nikdy neostane bez textov.
  let zaloha = 0;
  if (nahradim.length) {
    const { error: ea } = await supabase.from('danubra_plan_assets')
      .update({ archived_at: new Date().toISOString() }).in('id', nahradim.map(a => a.id));
    if (ea) throw new Error(ea.message);
    zaloha = nahradim.length;
  }
  if (rows.length) {
    const { error: ei } = await supabase.from('danubra_plan_assets').insert(rows);
    if (ei) {
      if (nahradim.length) {
        await supabase.from('danubra_plan_assets')
          .update({ archived_at: null }).in('id', nahradim.map(a => a.id));
      }
      throw new Error(`Texty sa nezapísali (${ei.message}). Staré ostali, nič sa nezmenilo.`);
    }
  }

  // Zhrnutie a polia náboru až teraz — keď sú texty zapísané. Inak by
  // nábor hlásil „pripravené" a texty by boli staré.
  facts._ai_plan = { ...odAppky, ...planPatch };
  await supabase.from('danubra_recruitment_plans').update({
    ...planPatch,
    analysis: facts,
    analyzed_at: new Date().toISOString(),
  }).eq('id', planId);


  // ── Otázky pre remeselníka ──────────────────────────────────────────
  // Pribudnú ako **návrh**: `active = false`. Zoznam otázok je to, podľa
  // čoho sa rozhoduje o ľuďoch, takže doň nesmie pribudnúť nič, čo človek
  // nevidel. Potvrdia sa v Remeslách a otázkach.
  let otazky = 0;
  const tradeKey = planPatch.trade_key || plan.trade_key || null;
  if (Array.isArray(out.questions) && out.questions.length) {
    // Čo už v databáze je, sa nepridáva druhýkrát — ani ako návrh.
    const { data: maju } = await supabase
      .from('danubra_screening_questions').select('question_sk').limit(1000);
    const znama = new Set((maju || []).map(q => String(q.question_sk || '').trim().toLowerCase()));

    const qrows = [];
    for (const q of out.questions.slice(0, 8)) {
      const text = String((q && q.question_sk) || '').trim();
      if (!text || znama.has(text.toLowerCase())) continue;
      qrows.push({
        code: null,
        trade_key: tradeKey,
        phase: 'phone',
        // `knowledge` je druh, ktorý v databáze už existuje pre odborné
        // otázky. Vymyslený druh by sa v Remeslách nikde nezobrazil.
        kind: 'knowledge',
        question_sk: text,
        question_de: String(q.question_de || '') || null,
        good_answer: String(q.good_answer || '') || null,
        red_flag_answer: String(q.red_flag_answer || '') || null,
        weight: [1, 2, 3].includes(Number(q.weight)) ? Number(q.weight) : 1,
        segment: 'trade',
        active: false,
      });
    }
    if (qrows.length) {
      const { error: eq } = await supabase
        .from('danubra_screening_questions').insert(qrows);
      if (!eq) otazky = qrows.length;
    }
  }

  return {
    blocks: rows.length,
    replaced: zaloha,
    kept: regen ? ostava.length : 0,
    regen,
    plan: Object.keys(planPatch),
    questions: otazky,
    facts: FACTS.filter(k => facts[k]).length,
    risks: (out.risks || []).length,
    ask: (out.ask || []).length,
    model: MODEL,
  };
}

/**
 * Stav behu na pozadí. Zapisuje sa do náboru (`analysis._job`), lebo funkcia
 * na pozadí prehliadaču nič nevráti — appka sa každých pár sekúnd pozrie,
 * či je hotovo. `id` je značka z prehliadača, aby sa starý výsledok
 * nepomýlil s novým.
 */
async function setJob(planId, job) {
  const { data } = await supabase.from('danubra_recruitment_plans')
    .select('analysis').eq('id', planId).maybeSingle();
  const analysis = { ...((data && data.analysis) || {}), _job: job };
  await supabase.from('danubra_recruitment_plans').update({ analysis }).eq('id', planId);
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
    const { planId, regen } = JSON.parse(event.body || '{}');
    return { statusCode: 200, headers: cors, body: JSON.stringify(await run(planId, { regen: !!regen })) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

exports.run = run;
exports.setJob = setJob;
