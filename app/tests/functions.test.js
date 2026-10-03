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

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
