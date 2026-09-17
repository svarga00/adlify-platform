// ============================================================================
// DANUBRA — spustí všetky testy naraz
// Spustenie:  npm test        alebo    node danubra/tests/run-all.js
// ============================================================================
// Dovtedy sa testy spúšťali po jednom a bolo ľahké na nejaký zabudnúť.
// Zoznam sa nevypisuje ručne — hľadá sa `*.test.js` pod `danubra/`, takže
// nový testovací súbor sa zapojí sám.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function findTests(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findTests(p));
    else if (e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

const suites = [...findTests(root).sort(), path.join(__dirname, 'smoke.js')];

let failed = 0;
const summary = [];

for (const file of suites) {
  const rel = path.relative(path.join(root, '..'), file);
  let out = '';
  let ok = true;
  try {
    out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    ok = false;
    out = (e.stdout || '') + (e.stderr || '');
  }
  if (!ok) failed++;

  // Z výstupu si vezmeme len poslednú vetu so súčtom; pri páde celý výpis.
  const lines = out.trim().split('\n');
  const tail = lines.filter(l => l.trim()).slice(-1)[0] || '(bez výstupu)';
  summary.push(`${ok ? '  ✓' : '  ✗'} ${rel} — ${tail.trim()}`);
  if (!ok) {
    console.log(`\n── ${rel} ─────────────────────────────────`);
    console.log(out.split('\n').filter(l => l.includes('✗') || l.includes('!') || l.includes('Error')).join('\n') || out);
  }
}

console.log(`\n${suites.length} sád testov\n`);
summary.forEach(s => console.log(s));
console.log(failed ? `\n${failed} sád zlyhalo\n` : '\nvšetko prešlo\n');
process.exit(failed ? 1 : 0);
