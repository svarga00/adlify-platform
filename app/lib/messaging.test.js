// ============================================================================
// Testy správ
// Spustenie:  node app/lib/messaging.test.js
// ============================================================================
// Dve veci, na ktorých sa komunikácia kazí najčastejšie:
//
//   * **Odišla veta s dierou.** „Ponúkame  €/h" — zástupné miesto sa
//     nevyplnilo a nikto si to nevšimol, lebo prázdne miesto nie je vidieť.
//   * **Appka povedala „odoslané", keď sa neodoslalo.** To je horšie, než
//     keby sa o to ani nepokúsila: človek na to spoľahne a nedovolá sa.
//
// Preto sa tu testuje hlavne to, že nevyplnené miesto zostane vidieť a že
// odoslanie bez kľúča povie dôvod.
// ============================================================================
global.window = global;
const M = require('./messaging');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Správy');

// ── Dopĺňanie textu ─────────────────────────────────────────────────────────
{
  const r = M.fill('Dobrý deň {{meno}}, sadzba je {{sadzba}} €/h.',
    { meno: 'Ján Novák', sadzba: '18,50' });
  eq(r.text, 'Dobrý deň Ján Novák, sadzba je 18,50 €/h.', 'doplní sa, čo je zadané');
  eq(r.missing, [], 'a nič nechýba');

  // Toto je to hlavné: nevyplnené nesmie zmiznúť.
  const diera = M.fill('Ponúkame {{sadzba}} €/h v {{mesto}}.', { mesto: 'Stuttgart' });
  ok(diera.text.includes('{{sadzba}}'), 'nevyplnené zostane v texte označené');
  eq(diera.missing, ['sadzba'], 'a povie sa, čo chýba');
  ok(!diera.text.includes('Ponúkame  €'), 'nevznikne veta s dierou');

  eq(M.fill('{{meno}}', { meno: '' }).missing, ['meno'], 'prázdny reťazec je tiež chýbajúci');
  eq(M.fill('{{meno}}', { meno: 0 }).text, '0', 'ale nula je hodnota, nie prázdno');
  eq(M.fill('{{ meno }}', { meno: 'A' }).text, 'A', 'medzery vnútri zátvoriek nevadia');
  eq(M.fill('{{meno}} a {{meno}}', {}).missing, ['meno'], 'to isté miesto sa hlási raz');
  eq(M.fill(null).text, '', 'bez textu prázdno, nie pád');
  eq(M.fill('bez zástupných miest', {}).missing, [], 'text bez miest je v poriadku');

  eq(M.usedIn('{{a}} {{b}} {{a}}'), ['a', 'b'], 'vie sa povedať, čo text používa');
  eq(M.usedIn(''), [], 'a z prázdneho nič');
}

// ── Náhľad šablóny ──────────────────────────────────────────────────────────
{
  const t = { subject: 'Práca — {{mesto}}', body: 'Dobrý deň {{meno}}, {{mesto}}.' };
  const p = M.preview(t, { meno: 'Ján', mesto: 'Mníchov' });
  eq(p.subject, 'Práca — Mníchov', 'predmet sa doplní');
  eq(p.body, 'Dobrý deň Ján, Mníchov.', 'aj telo');
  eq(p.missing, [], 'nič nechýba');
  eq(M.preview(t, { meno: 'Ján' }).missing, ['mesto'],
    'chýbajúce z predmetu aj z tela sa zlúči do jedného zoznamu');
  eq(M.preview(null).body, '', 'bez šablóny prázdno');
}

// ── Ktorá šablóna sa hodí ───────────────────────────────────────────────────
{
  const tpl = [
    { key: 'a', title: 'A', audience: 'worker', channel: 'email', sort_order: 2 },
    { key: 'b', title: 'B', audience: 'partner', channel: 'email', sort_order: 1 },
    { key: 'c', title: 'C', channel: 'email', sort_order: 3 },
    { key: 'd', title: 'D', audience: 'worker', channel: 'sms', sort_order: 0 },
    { key: 'e', title: 'E', audience: 'worker', channel: 'email', active: false },
  ];
  eq(M.templatesFor(tpl, { audience: 'worker' }).map(t => t.key), ['a', 'c'],
    'univerzálna šablóna platí pre každého, cudzia sa nezobrazí');
  eq(M.templatesFor(tpl, { audience: 'worker', channel: 'sms' }).map(t => t.key), ['d'],
    'kanál sa berie do úvahy');
  ok(!M.templatesFor(tpl, { audience: 'worker' }).find(t => t.key === 'e'),
    'vypnutá šablóna sa neponúka');
  // Predvolený kanál je e-mail, takže SMS šablóna sa bez zúženia neponúkne.
  eq(M.templatesFor(tpl, {}).map(t => t.key), ['b', 'a', 'c'],
    'bez zúženia sú všetky e-mailové, zoradené podľa poradia');
  eq(M.templatesFor(null, {}), [], 'bez šablón prázdno');
}

// ── Odosielanie ─────────────────────────────────────────────────────────────
// Kým nie je kľúč, appka to musí povedať — nie sa tváriť, že odoslala.
{
  const bez = M.canSend({});
  ok(!bez.ok, 'bez poskytovateľa sa neodosiela');
  ok(bez.reason.includes('fronte') || bez.reason.includes('frontu'),
    'a povie sa, že správa počká vo fronte');
  ok(!M.canSend({ provider: 'resend' }).ok, 'bez adresy odosielateľa tiež nie');
  ok(M.canSend({ provider: 'resend', from: 'praca@firma.sk' }).ok,
    's kľúčom aj adresou sa odosielať dá');
}

// ── Kontrola pred odoslaním ─────────────────────────────────────────────────
{
  const dobra = { channel: 'email', to_email: 'jan@example.sk', subject: 'Vec', body: 'Text' };
  eq(M.validate(dobra).problems, [], 'úplná správa prejde');

  ok(!M.validate({ ...dobra, body: '   ' }).ok, 'prázdna správa neprejde');
  ok(!M.validate({ ...dobra, to_email: '' }).ok, 'ani bez adresy');
  ok(!M.validate({ ...dobra, to_email: 'toto nie je mail' }).ok, 'ani s nezmyslom v adrese');
  ok(!M.validate({ ...dobra, subject: '' }).ok, 'e-mail bez predmetu neprejde');

  // Toto je tá chyba, ktorá sa v praxi stane: šablóna sa nedoplnila.
  const diera = M.validate({ ...dobra, body: 'Sadzba {{sadzba}} €/h' });
  ok(!diera.ok, 'správa s nevyplneným miestom neodíde');
  ok(diera.problems.join(' ').includes('{{sadzba}}'), 'a povie sa, ktoré to je');

  // SMS má iné požiadavky než mail.
  ok(M.validate({ channel: 'sms', to_phone: '+421900000000', body: 'Text' }).ok,
    'SMS nepotrebuje predmet');
  ok(!M.validate({ channel: 'sms', body: 'Text' }).ok, 'ale potrebuje číslo');
  ok(M.validate({ channel: 'internal', body: 'Poznámka pre kolegov' }).ok,
    'interná poznámka nepotrebuje ani jedno — nikam nejde');
}

// ── Stavy ───────────────────────────────────────────────────────────────────
{
  eq(M.statusLabel('queued'), 'Čaká na odoslanie', 'stav má slovenský názov');
  eq(M.statusKind('failed'), 'red', 'a farbu');
  eq(M.statusLabel('nieco'), 'nieco', 'neznámy stav vráti sám seba');
  eq(M.queueCounts([{ status: 'queued' }, { status: 'queued' }, { status: 'failed' },
    { status: 'sent' }]), { queued: 2, failed: 1 }, 'front sa dá spočítať');
  eq(M.queueCounts(null), { queued: 0, failed: 0 }, 'aj keď niet čo počítať');
}

// ── Vlákna ──────────────────────────────────────────────────────────────────
{
  const threads = [
    { id: 't1', subject: 'Staršie', last_at: '2026-09-01T10:00:00Z' },
    { id: 't2', subject: 'Novšie', last_at: '2026-09-20T10:00:00Z' },
    { id: 't3', subject: 'Prázdne', last_at: '2026-08-01T10:00:00Z' },
  ];
  const msgs = [
    { id: 'm1', thread_id: 't1', body: 'prvá', created_at: '2026-09-01T09:00:00Z', status: 'sent' },
    { id: 'm2', thread_id: 't1', body: 'posledná v t1', created_at: '2026-09-01T10:00:00Z', status: 'queued' },
    { id: 'm3', thread_id: 't2', body: 'jediná', created_at: '2026-09-20T10:00:00Z', status: 'sent' },
  ];
  const out = M.threadList(threads, msgs);
  eq(out.map(t => t.id), ['t2', 't1', 't3'], 'najnovšie vlákno je hore');
  eq(out.find(t => t.id === 't1').count, 2, 'počet správ sedí');
  eq(out.find(t => t.id === 't1').last.body, 'posledná v t1', 'posledná správa je posledná');
  ok(out.find(t => t.id === 't1').waiting, 'vlákno vie, že v ňom niečo čaká');
  ok(!out.find(t => t.id === 't2').waiting, 'a že inde nie');
  eq(out.find(t => t.id === 't3').count, 0, 'vlákno bez správ sa nestratí');
  eq(out.find(t => t.id === 't3').preview, '', 'len nemá čo ukázať');
  eq(M.threadList(null, null), [], 'bez vlákien prázdno');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
