// ============================================================================
// Serverové funkcie sa musia dať načítať
// Spustenie:  node app/tests/functions.test.js
// ============================================================================
// Toto chýbalo a stálo to tri funkcie.
//
// Keď sa priečinok `danubra/` premenoval na `app/`, zostali v troch funkciách
// cesty `require('../../danubra/lib/...')`. V prehliadači sa to neprejavilo —
// appka tie súbory načítava `<script>` tagom. Testy to nechytili — tie si
// knižnice vyžadujú priamo. A Netlify build prešiel, lebo funkcia sa
// nebundluje za behu buildu.
//
// Prasklo by to až pri volaní: `danubra-webhook-forms` (dopyty z webu),
// `danubra-sms-send` a `danubra-cron-monthly` (mesačná fakturácia priebežnej
// služby, beží 28.–31. o 20:00). Teda: dopyty z webu by ticho padali a
// mesačná fakturácia by sa nespustila — a nikto by sa to nedozvedel, lebo
// cron, ktorý spadne na načítaní modulu, nemá komu povedať.
//
// Test preto prejde všetky funkcie a overí, že každá relatívna cesta
// v `require` existuje.
// ============================================================================
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'netlify', 'functions');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Serverové funkcie');

const subory = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => f.endsWith('.js')) : [];
ok(subory.length > 0, `funkcie sa našli (${subory.length})`);

const zle = [];
for (const f of subory) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const ref = m[1];
    const base = path.resolve(DIR, ref);
    const existuje = ['', '.js', '.json', '/index.js']
      .some(prip => fs.existsSync(base + prip));
    if (!existuje) zle.push(`${f}: ${ref}`);
  }
}
ok(zle.length === 0, 'každá funkcia má svoje knižnice tam, kde si ich pýta',
  zle.join('\n    '));

// Druhá poistka: v celom repozitári už nesmie zostať cesta na starý priečinok.
// Premenovanie z `danubra/` na `app/` je hotové; čo na to ešte ukazuje, je
// pozostatok, ktorý nikde nefunguje.
const stare = [];
for (const f of subory) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (/['"]\.\.\/\.\.\/danubra\//.test(src)) stare.push(f);
}
ok(stare.length === 0, 'nikde nezostala cesta na starý priečinok `danubra/`',
  stare.join(', '));

// ── Vynútený nástroj zhodí každé volanie ───────────────────────────────────
// `tool_choice: { type: 'tool' }` tento model neprijme:
//   „tool_choice: type "tool" and "any" are not supported for this model"
// Bolo to vo **všetkých štyroch** funkciách, ktoré sa pýtajú modelu, a ani
// jedna preto nikdy nefungovala. Testy sa k modelu nedostanú, takže toto je
// jediné miesto, kde sa to dá zachytiť.
{
  const sTool = [];
  const bezAi = [];
  for (const f of subory) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (!/api\.anthropic\.com/.test(src)) continue;
    if (/tool_choice/.test(src)) sTool.push(f);
    // Čítanie odpovede má byť na jednom mieste — inak sa to o pol roka
    // opraví na troch súboroch a štvrtý zostane.
    if (!/require\(['"]\.\.\/\.\.\/app\/lib\/ai\.js['"]\)/.test(src)) bezAi.push(f);
  }
  ok(sTool.length === 0, 'žiadna funkcia si nevynucuje nástroj cez tool_choice',
    sTool.join(', '));
  ok(bezAi.length === 0, 'a každá číta odpoveď modelu cez app/lib/ai.js',
    bezAi.join(', '));
}

// ── Rozdelenie dopytu: povinné polia musia sedieť s knižnicou ───────────────
// Model vracia stavby podľa schémy vo funkcii; appka ich prijíma podľa
// pravidiel v `lib/inquiry.js`. Keď sa tie dva zoznamy rozídu, model vráti
// stavbu bez mesta, appka ju odmietne a nikto nevie prečo.
{
  global.window = global;
  const I = require('../lib/inquiry.js');
  const src = fs.readFileSync(path.join(DIR, 'danubra-split-inquiry.js'), 'utf8');

  const m = src.match(/required:\s*\['title',\s*'city',\s*'headcount'\]/);
  ok(!!m, 'funkcia pýta od modelu názov, mesto a počet ľudí');
  const vApp = I.POVINNE.map(x => x.key);
  ok(JSON.stringify(vApp) === JSON.stringify(['title', 'city', 'headcount']),
    'a appka vyžaduje presne tie isté', vApp.join(', '));

  // Funkcia nesmie nič zapisovať — zápis je rozhodnutie človeka. Toto je to
  // pravidlo, ktoré sa najľahšie poruší pri „však to rovno ulož".
  ok(!/\.insert\(|\.upsert\(|\.update\(/.test(src),
    'rozdelenie dopytu do databázy nič nezapisuje');
  ok(/ANTHROPIC_API_KEY/.test(src) && /no_api_key/.test(src),
    'a bez kľúča to povie, nie spadne');
}

// ── Kanály a bloky musia sedieť s appkou ────────────────────────────────────
// Funkcia `danubra-analyze-brief` vracia texty po kanáloch a appka ich
// zobrazuje podľa `lib/recruiting/kit.js`. Sú to dva zoznamy na dvoch
// miestach: keď sa rozídu, model vyrobí text, ktorý appka nikde neukáže —
// a nikto to nezistí, lebo nič nespadne.
{
  const fnPath = path.join(DIR, 'danubra-analyze-brief.js');
  if (!fs.existsSync(fnPath)) {
    ok(false, 'funkcia na analýzu zadania existuje');
  } else {
    global.window = global;
    const K = require('../lib/recruiting/kit.js');
    const src = fs.readFileSync(fnPath, 'utf8');

    // Zoznam v funkcii je obyčajný objekt — prečíta sa priamo z kódu, aby test
    // nezávisel od toho, či sa funkcia dá na tomto stroji načítať (má
    // závislosti z npm, ktoré v repozitári nie sú).
    const blok = src.slice(src.indexOf('const BLOCKS = {'), src.indexOf('};', src.indexOf('const BLOCKS = {')) + 2);
    const fnBlocks = {};
    for (const m of blok.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      fnBlocks[m[1]] = m[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    }
    ok(Object.keys(fnBlocks).length > 0, `zoznam kanálov sa z funkcie prečítal (${Object.keys(fnBlocks).length})`);

    const vApp = K.CHANNELS.map(c => c.key).sort();
    const vFn = Object.keys(fnBlocks).sort();
    ok(JSON.stringify(vApp) === JSON.stringify(vFn),
      'funkcia pozná presne tie kanály, ktoré appka zobrazuje',
      `appka: ${vApp.join(', ')}\n    funkcia: ${vFn.join(', ')}`);

    const rozdiely = [];
    for (const ch of vApp) {
      const app = K.blocks(ch).map(b => b.key).sort();
      const fn = (fnBlocks[ch] || []).slice().sort();
      if (JSON.stringify(app) !== JSON.stringify(fn)) {
        rozdiely.push(`${ch}: appka [${app.join(', ')}] vs funkcia [${fn.join(', ')}]`);
      }
    }
    ok(rozdiely.length === 0, 'a v každom kanáli tie isté bloky',
      rozdiely.join('\n    '));

    // Značka pre nedoplnený údaj musí byť tá istá na oboch stranách, inak
    // appka nespočíta to, čo model nechal nedoplnené.
    ok(src.includes(`const CHYBA = '${K.CHYBA}'`),
      `značka pre nedoplnený údaj je rovnaká (${K.CHYBA})`);

    // Zhrnutie zákazky: tie isté polia.
    const fakty = (src.match(/const FACTS = \[([^\]]*)\]/) || [, ''])[1]
      .split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    ok(JSON.stringify(fakty) === JSON.stringify(K.FACTS.map(f => f.key).sort()),
      'zhrnutie zákazky má na oboch stranách tie isté polia',
      `appka: ${K.FACTS.map(f => f.key).join(', ')}\n    funkcia: ${fakty.join(', ')}`);

    // Návrh sa nesmie uložiť ako schválený — človek ho musí prečítať.
    ok(/source: 'ai'/.test(src) && /approved_at: null/.test(src),
      'texty od modelu sa ukladajú ako návrh, nie ako schválené');
    // A nesmie prepísať to, čo už niekto napísal.
    ok(/mam\.has\(/.test(src), 'a neprepíšu text, ktorý už niekto napísal');
    // Bez kľúča to nie je chyba, ale ani ticho.
    ok(/skipped: 'no_api_key'/.test(src),
      'bez kľúča k modelu funkcia povie, že nie je nastavená');

    // ── Zo zadania má vzniknúť celý nábor, nie len texty ──────────────────
    // Polia náboru musia sedieť so stĺpcami tabuľky; vymyslené pole by sa
    // tichom zahodilo a nikto by nevedel, že analýza ich mala vyplniť.
    const planFields = (src.match(/const PLAN_FIELDS = \[([^\]]*)\]/) || [, ''])[1]
      .split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    ok(planFields.length >= 7, `analýza vypĺňa polia náboru (${planFields.length})`,
      planFields.join(', '));
    const planSchema = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations',
      '009_recruiting_playbook.sql'), 'utf8')
      + fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations',
        '001_schema.sql'), 'utf8');
    const nezname = planFields.filter(f => !new RegExp(`\\b${f}\\b`).test(planSchema));
    ok(nezname.length === 0, 'a každé z nich je skutočný stĺpec náboru',
      `neznáme: ${nezname.join(', ')}`);

    // Kanály musia sedieť s tými, ktoré ponúka obrazovka náboru.
    const fnKanaly = (src.match(/const KANALY = \[([^\]]*)\]/) || [, ''])[1]
      .split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean).sort();
    const hiring = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'hiring.js'), 'utf8');
    // Pozor na hranicu zoznamu: prvá `]` je koniec prvej dvojice, nie celého
    // poľa. Hľadá sa preto `];`.
    const zacatok = hiring.indexOf('const CHANNELS = [');
    const uiKanaly = [...hiring.slice(zacatok, hiring.indexOf('];', zacatok))
      .matchAll(/\['(\w+)',/g)].map(m => m[1]).sort();
    ok(JSON.stringify(fnKanaly) === JSON.stringify(uiKanaly),
      'kanály náboru sedia s tými, ktoré ponúka obrazovka',
      `funkcia: ${fnKanaly.join(', ')}\n    appka: ${uiKanaly.join(', ')}`);

    // Nič sa nesmie prepísať a nič vymyslieť.
    ok(/if \(stare !== null && stare !== undefined && stare !== ''\) continue;/.test(src),
      'pole, ktoré už niekto vyplnil, sa neprepíše');
    ok(/platneRemeslo\(nove\)/.test(src),
      'a kľúč remesla sa overí proti databáze — vymyslený by svietil ako kľúč');
    ok(/offer_rate' \|\| k === 'client_rate'\) && !\(Number\(nove\) > 0\)/.test(src),
      'sadzba sa zapíše len ako číslo väčšie od nuly');

    // Otázky pre remeselníka pribudnú ako návrh, nie ako hotové.
    ok(/active: false/.test(src), 'otázky do hovoru pribudnú ako návrh, nie aktívne');
    ok(/znama\.has\(/.test(src), 'a otázka, ktorá už v databáze je, sa nepridá druhýkrát');
    ok(/kind: 'knowledge'/.test(src),
      'druh otázky je ten, ktorý v databáze existuje');
  }
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
