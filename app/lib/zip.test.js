// Testy: ZIP bez knižnice — node app/lib/zip.test.js
global.window = global;
const Z = require('./zip.js');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }

console.log('\nZIP');
eq(Z.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926', 'CRC32 podľa normy');
const z = Z.zip([{ name: 'vydane.csv', data: 'Číslo;Suma\r\n2026091;12400,00\r\n' },
  { name: 'prijate/001 faktura.pdf', data: new Uint8Array([37, 80, 68, 70, 45]) }]);
eq([z[0], z[1], z[2], z[3]], [0x50, 0x4b, 0x03, 0x04], 'začína hlavičkou ZIP');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
const f = path.join(dir, 'a.zip');
fs.writeFileSync(f, z);
let list = '';
try { list = execFileSync('unzip', ['-l', f], { encoding: 'utf8' }); } catch (e) { list = 'unzip-chyba ' + e.message; }
eq(/vydane\.csv/.test(list) && /prijate\/001 faktura\.pdf/.test(list), true, 'bežný unzip ho otvorí a vidí oba súbory');
let obsah = '';
try { obsah = execFileSync('unzip', ['-p', f, 'vydane.csv'], { encoding: 'utf8' }); } catch (e) { obsah = ''; }
eq(obsah.includes('Číslo;Suma'), true, 'a obsah s diakritikou sedí');
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
