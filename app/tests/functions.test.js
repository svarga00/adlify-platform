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
  }
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
