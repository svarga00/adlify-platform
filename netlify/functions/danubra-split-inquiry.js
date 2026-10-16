// ============================================================================
// DANUBRA — z jedného e-mailu od odberateľa viac stavieb
// ============================================================================
// Nemecká firma nenapíše „potrebujeme štyroch ľudí". Napíše e-mail, v ktorom
// sú tri projekty naraz:
//
//   Hammelburg   5 Trockenbauer, ab Montag,  34 €/Std, 7/10 mit 2% Sconto
//   Gengenbach   4 Trockenbauer, ab 20.10.
//   Friesenheim  4 Trockenbauer, ab 19.10.
//
// Dovtedy sa taký e-mail zapísal ako **jedna** možnosť a všetko ostatné
// zostalo vo voľnom texte. Z toho sa nedá spraviť ani nábor, ani ponuka: tri
// stavby majú tri termíny, tri mestá a tri nábory.
//
// Funkcia **nič nezapisuje**. Vráti, čo v e-maile našla, appka to ukáže
// a zakladá to človek jedným kliknutím. Dôvod je ten istý ako pri analýze
// zadania: zápis do databázy je rozhodnutie, nie výsledok modelu.
//
// Dve pravidlá sú tu zámerne tvrdé:
//
//   * **Nič sa nevymýšľa.** Čo v e-maile nie je, sa vynechá. Vymyslený dátum
//     nástupu je horší než prázdne miesto — podľa neho sa plánuje.
//   * **Jeden projekt = jedna stavba.** Keď je v e-maile jedna stavba, vráti
//     sa jeden projekt; rozdeľovať sa nemá to, čo rozdelené nie je.
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

const MODEL = process.env.CLAUDE_MODEL_TEXT || 'claude-sonnet-5-5';

// Najdlhší e-mail, aký má zmysel posielať modelu. Dlhšie býva zreťazená
// konverzácia, z ktorej je podstatná len posledná správa.
const MAX_ZNAKOV = 20000;

const SCHEMA = {
  name: 'stavby_z_dopytu',
  description: 'Stavby nájdené v dopyte od odberateľa, každá zvlášť.',
  input_schema: {
    type: 'object',
    properties: {
      client: {
        type: 'object',
        description: 'Firma, ktorá dopyt poslala. Vynechaj, čo v e-maile nie je.',
        properties: {
          company_name: { type: 'string' },
          contact_name: { type: 'string' },
          contact_phone: { type: 'string' },
          contact_email: { type: 'string' },
          company_vat: { type: 'string', description: 'USt-IdNr, len ak je v e-maile.' },
          address: { type: 'string', description: 'Sídlo firmy, nie adresa stavby.' },
        },
      },
      payment: {
        type: 'string',
        description: 'Platobné podmienky presne tak, ako sú napísané — napríklad '
          + '„7/10 mit 2% Sconto". Neprepočítavaj ich, nevysvetľuj.',
      },
      projects: {
        type: 'array',
        description: 'Jedna položka = jedna stavba. Keď je v e-maile jedna stavba, '
          + 'vráť jednu. Nerozdeľuj to, čo rozdelené nie je.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string',
              description: 'Krátky názov po slovensky, podľa ktorého to kolega spozná. '
                + 'Napríklad „Hammelburg — podhľady v škole".' },
            city: { type: 'string', description: 'Mesto stavby.' },
            country: { type: 'string', description: 'Dvojpísmenový kód, napríklad DE.' },
            address: { type: 'string', description: 'Adresa stavby, ak je uvedená.' },
            trade_key: { type: 'string',
              description: 'Presný kľúč remesla zo zoznamu nižšie. Keď žiadny nesedí, vynechaj.' },
            headcount: { type: 'integer', description: 'Koľko ľudí na túto stavbu.' },
            rate_client: { type: 'number',
              description: 'Čo platí odberateľ, €/h. Len ak je v e-maile číslom.' },
            start_date: { type: 'string',
              description: 'RRRR-MM-DD. Keď je napísané len „ab Montag" a dátum sa '
                + 'nedá spoľahlivo určiť, vynechaj — vymyslený dátum je horší než žiadny.' },
            hours_week: { type: 'string', description: 'Napríklad „50–60 h/týždeň".' },
            duration: { type: 'string', description: 'Ako dlho to má trvať.' },
            requirements: {
              type: 'array', items: { type: 'string' },
              description: 'Požiadavky na ľudí, po slovensky, krátke vety. '
                + 'Napríklad „aspoň jeden v partii hovorí po nemecky", „vlastný '
                + 'šeststupňový rebrík".',
            },
            brief: { type: 'string',
              description: 'Čo sa na stavbe robí — po slovensky, zrozumiteľne pre '
                + 'remeselníka. Je to podklad na nábor, nie preklad e-mailu.' },
          },
          required: ['title', 'city', 'headcount'],
        },
      },
      risks: {
        type: 'array', items: { type: 'string' },
        description: 'Čo na tom dopyte nesedí alebo čo treba doveriť. Krátke vety '
          + 'po slovensky. Prázdne pole je správna odpoveď, keď nič nevidíš.',
      },
    },
    required: ['projects'],
  },
};

const POKYNY = `Si asistent slovenskej firmy, ktorá posiela slovenských a českých
živnostníkov ako subdodávateľov na stavby v Nemecku. Prišiel dopyt od nemeckej
firmy. Rozdeľ ho na jednotlivé stavby.

AKO TO ROBIŤ
1. Nájdi, koľko rôznych stavieb v e-maile je. Býva to tak, že sú očíslované
   alebo oddelené mestom a termínom. Jedna stavba = jedna položka.
2. Podmienky, ktoré sú napísané raz a platia na všetky stavby (sadzba, platobné
   podmienky, počet hodín týždenne), dopíš ku každej stavbe, ktorej sa týkajú.
3. Požiadavky na ľudí prelož do krátkych slovenských viet. Nie doslova —
   tak, aby tomu rozumel remeselník, ktorý po nemecky nevie.
4. Do poľa brief napíš po slovensky, čo sa na tej stavbe robí. Je to podklad
   na nábor, podľa ktorého sa budú písať inzeráty.

ČO NEROBIŤ
- Nevymýšľaj dátum. „Ab Montag" bez konkrétneho dňa znamená vynechať nástup.
- Nevymýšľaj sadzbu ani počet ľudí. Keď tam nie sú, pole vynechaj.
- Neprepočítavaj platobné podmienky. „7/10 mit 2% Sconto" zapíš presne tak.
- Nerozdeľuj jednu stavbu na viac položiek podľa druhov prác. Montáž podhľadov
  a špárovanie na tej istej stavbe je jedna stavba.

NA ČO SI DAŤ POZOR A NAPÍSAŤ TO DO RIZÍK
- Sadzba odberateľa bez toho, aby bolo jasné, čo je v nej zahrnuté (doprava,
  ubytovanie, náradie).
- Požiadavka na nemčinu — tá zužuje výber ľudí najviac zo všetkých.
- Vlastné náradie alebo rebrík: je to náklad živnostníka a treba mu to povedať
  vopred, nie na stavbe.
- Nástup „od pondelka" pri väčšom počte ľudí.
- Hodiny nad 48 týždenne: pri zmluve o dielo to nie je pracovný čas, ale
  v inzeráte sa to nesmie sľubovať ako nárok.`;

/** Remeslá z databázy — aby `trade_key` sedel a nevznikol vymyslený kľúč. */
async function trades() {
  const { data } = await supabase.from('danubra_trades')
    .select('key,name_sk').order('sort_order');
  return data || [];
}

async function split(text, list) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY');

  const remesla = (list || []).map(t => `${t.key} = ${t.name_sk}`).join('\n') || '(žiadne)';
  const dnes = new Date().toISOString().slice(0, 10);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(AI.body({
      model: MODEL, tool: SCHEMA, maxTokens: 8000,
      prompt: `${POKYNY}\n\nREMESLÁ V DATABÁZE (kľúč = názov; iný kľúč nepoužívaj):\n`
        + `${remesla}\n\nDNES JE ${dnes}. Dátumy bez roka patria do najbližšej budúcnosti.\n\n`
        + `DOPYT:\n${String(text).slice(0, MAX_ZNAKOV)}`,
    })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(AI.errorText(data, res.status, 'Rozdelenie dopytu'));
  const out = AI.pickTool(data, SCHEMA.name);
  if (!out) throw new Error('Model nevrátil stavby');
  return out;
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
    const { text } = JSON.parse(event.body || '{}');
    if (!text || String(text).trim().length < 40) {
      throw new Error('Dopyt je prikrátky — vlož celý e-mail.');
    }

    // Bez kľúča sa nemá tváriť, že to nejde kvôli e-mailu.
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: 'no_api_key',
          message: 'Rozdelenie dopytu nie je nastavené — chýba kľúč k modelu.' }),
      };
    }

    const out = await split(text, await trades());
    const projects = Array.isArray(out.projects) ? out.projects : [];

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: out.client || {},
        payment: out.payment || '',
        risks: Array.isArray(out.risks) ? out.risks : [],
        projects,
        found: projects.length,
      }),
    };
  } catch (e) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
