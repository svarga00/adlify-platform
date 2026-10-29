// ============================================================================
// DANUBRA — lehota uchovania záznamov z formulárov webov (migrácia 073)
// Spustenie:  node app/tests/web-retention.test.js
// ============================================================================
// Databázu test nemá — kontroluje, že migrácia a cron k sebe sedia:
// funkcie existujú, nesmie ich volať anonym, anonymizácia nič nemaže
// a denný cron ju naozaj volá.
// ============================================================================
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(c, msg) { if (c) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}`); } }

const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '073_ochrana_udajov_z_formularov.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
const cron = fs.readFileSync(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-cron-daily.js'), 'utf8');

console.log('Záznamy z formulárov webov — lehota');
ok(/create or replace function danubra_web_submissions_anonymize\(\)/.test(code)
  && /create or replace function danubra_web_submissions_forget\(p_email text default null, p_phone text default null\)/.test(code),
'migrácia má anonymizáciu po lehote aj na žiadosť');
ok((code.match(/if not danubra_is_admin\(\) then/g) || []).length === 2, 'obe funkcie pustia len admina (alebo service role)');
ok(/revoke execute on function danubra_web_submissions_anonymize\(\) from public, anon/.test(code)
  && /revoke execute on function danubra_web_submissions_forget\(text, text\) from public, anon/.test(code), 'anonym ich volať nesmie');
ok(!/\bdelete\s+from\b|\bdrop\s+(table|column)\b|\btruncate\b/i.test(code), 'nič sa nemaže — len prepis osobných údajov');
ok(/ip_hash = null/.test(code) && /user_agent = null/.test(code) && /danubra_web_payload_scrub/.test(code), 'zahodí sa odtlačok IP, prehliadač aj osobné polia');
const keep = (code.match(/e\.key in \(([^)]*)\)/) || [])[1] || '';
ok(keep && !/'(name|email|phone|note|company|location)'/.test(keep), 'v payloade neostane meno, e-mail, telefón, správa, firma ani miesto');
ok(/,\s*\n?\s*90\)\)\)/.test(code) && /greatest\(30, least\(365/.test(code), 'lehota 90 dní, nastaviteľná v rozsahu 30–365');
ok(/rpc\('danubra_web_submissions_anonymize'/.test(cron), 'denný cron anonymizáciu spúšťa');

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
