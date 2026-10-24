// Testy: šifrovanie hesiel schránok — node app/lib/mail/secret.test.js
const S = require('./secret.js');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.log(`  ✗ ${m}`); } };
console.log('\nHESLÁ SCHRÁNOK');
const enc = S.encrypt('Tajné-heslo 123', 'kluc-A');
ok(/^v1:/.test(enc) && !enc.includes('Tajné'), 'uložené heslo nie je čitateľné');
ok(S.decrypt(enc, 'kluc-A') === 'Tajné-heslo 123', 'server ho rozšifruje');
ok(S.encrypt('x', 'kluc-A') !== S.encrypt('x', 'kluc-A'), 'to isté heslo dáva zakaždým iný záznam');
let chyba = '';
try { S.decrypt(enc, 'iny-kluc'); } catch (e) { chyba = e.message; }
ok(/zadajte ho znova/.test(chyba), 'iným kľúčom sa nerozšifruje a povie, čo robiť');
const t = S.cronToken(new Date('2026-10-24T10:20:00Z'), 'k');
ok(S.cronOk(t, new Date('2026-10-24T10:59:00Z'), 'k') && S.cronOk(t, new Date('2026-10-24T11:10:00Z'), 'k'), 'kľúč pre automat platí túto aj ďalšiu hodinu');
ok(!S.cronOk(t, new Date('2026-10-24T13:00:00Z'), 'k') && !S.cronOk('zly', new Date(), 'k'), 'starý alebo vymyslený nie');
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
