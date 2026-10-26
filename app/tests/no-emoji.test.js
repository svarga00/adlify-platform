// ============================================================================
// Strážca: v appke nesmú byť emoji ani obrázkové znaky — len ikony (Icon()).
// „Nikde, opakujem nikde nechcem vidieť emoji, len ikony."
//   node app/tests/no-emoji.test.js
// Kontroluje zdrojáky, ktoré kreslia rozhranie (bez testov a knižníc tretích
// strán). Šípka → v texte je typografický znak, nie emoji — tá smie zostať.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BAD = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}]/u;
const SKIP = new Set(['vendor', 'node_modules', 'tests']);

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|html|css|webmanifest)$/.test(f.name) && !/\.test\.js$/.test(f.name)) files.push(p);
  }
})(ROOT);

const hits = [];
for (const p of files) {
  fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(BAD);
    if (m) hits.push(`${path.relative(ROOT, p)}:${i + 1}  „${m[0]}"`);
  });
}

if (hits.length) {
  console.log(`  ✗ emoji alebo obrázkové znaky v appke (${hits.length}):\n    ${hits.slice(0, 20).join('\n    ')}`);
  console.log('\n0 prešlo, 1 zlyhalo');
  process.exit(1);
}
console.log(`  ✓ ${files.length} súborov bez emoji`);
console.log('\n1 prešlo, 0 zlyhalo');
