// ============================================================================
// DANUBRA — kontakty s firmami: kategórie, výsledky, os, export, úloha
// Spustenie:  node app/lib/marketing/contacts.test.js
// ============================================================================
const C = require('./contacts.js');
const L = require('./leads.js');
const X = require('../export.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
const NOW = new Date('2026-10-30T09:00:00Z');

console.log('Kategórie firmy');
ok(JSON.stringify(C.STAGES.map(s => [s[0], s[1], s[2]])) === JSON.stringify(L.STATUS), 'kategórie sú tie isté ako stavy firmy v leads.js (jeden zoznam)');
ok(['meeting', 'offer', 'later', 'unreachable'].every(k => C.STAGE_KEYS.includes(k)), 'pribudli Stretnutie, Ponuka, Ozvať sa neskôr, Nedostupná');
{
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'database', 'migrations', '081a_kontakty_s_firmami.sql'), 'utf8');
  const m = sql.match(/danubra_leads_status_check\s+check \(status in \(([^)]*)\)/);
  const keys = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : [];
  ok(keys.length && keys.sort().join() === [...C.STAGE_KEYS].sort().join(), 'databáza (081) pozná presne tie isté kategórie', keys.join(','));
  const oc = (sql.match(/outcome in \(([\s\S]*?)\)\)/) || [])[1] || '';
  ok([...oc.matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort().join() === C.OUTCOMES.map(o => o[0]).sort().join(), 'a tie isté výsledky kontaktu');
}

console.log('\nNávrh kategórie po kontakte');
ok(C.suggestStage('no_answer', 'new') === 'contacted', 'Nedvíha pri novej firme → Oslovená (pokúsili sme sa)');
ok(C.suggestStage('no_answer', 'interested') === 'interested', 'Nedvíha nevráti Má záujem späť');
ok(C.suggestStage('interested', 'contacted') === 'interested', 'Má záujem');
ok(C.suggestStage('not_interested', 'offer') === 'rejected', 'Nemá záujem vždy');
ok(C.suggestStage('callback', 'contacted') === 'later', 'Zavolať neskôr → Ozvať sa neskôr');
ok(C.suggestStage('send_offer', 'meeting') === 'offer' && C.suggestStage('meeting_set', 'offer') === 'offer', 'ponuka je ďalej ako stretnutie');
ok(C.suggestStage('wrong_number', 'new') === 'unreachable' && C.suggestStage('wrong_number', 'interested') === 'interested', 'Zlé číslo → Nedostupná len keď sme sa ešte nebavili');
ok(C.suggestStage('interested', 'won') === 'won', 'Je odberateľ sa neprepíše');
ok(C.suggestStage('interested', 'later') === 'interested', 'z Ozvať sa neskôr sa dá posunúť ďalej');

console.log('\nZáznam o kontakte');
{
  const v = C.validate({ outcome: 'callback', summary: 'ozvite sa o 2 týždne' }, { now: NOW });
  ok(!v.ok && /kedy sa máme ozvať/.test(v.errors[0]), 'Zavolať neskôr bez termínu sa neuloží', v.errors.join());
  const w = C.validate({ outcome: 'callback', summary: 'x', next_step_at: '2026-11-13', next_step_text: 'Zavolať', duration_min: '4' }, { now: NOW });
  ok(w.ok && w.row.next_step_at === '2026-11-13' && w.row.duration_min === 4 && w.row.kind === 'call', 's termínom áno');
  ok(!C.validate({}, { now: NOW }).ok, 'bez textu aj bez výsledku nie');
  ok(!C.validate({ summary: 'x', next_step_at: '2026-10-01' }, { now: NOW }).ok, 'termín v minulosti nie');
  ok(!C.validate({ summary: 'x', next_step_at: '2026-02-30' }, { now: NOW }).ok, 'neplatný dátum nie');
  ok(!C.validate({ summary: 'x', happened_at: '2027-01-01T00:00:00Z' }, { now: NOW }).ok, 'kontakt v budúcnosti nie');
  ok(C.validate({ summary: 'x', kind: 'hack', contact_email: 'nie-email' }, { now: NOW }).row.kind === 'call'
    && C.validate({ summary: 'x', contact_email: 'nie-email' }, { now: NOW }).row.contact_email === null, 'neznámy druh a zlý e-mail sa očistia');
  ok(C.validate({ summary: 'x', next_step_text: 'bez dátumu' }, { now: NOW }).row.next_step_text === null, 'text kroku bez termínu sa neuloží (nemal by kedy)');
  const d = C.defaultNext('no_answer', NOW);
  ok(d && d.date === '2026-11-02' && /znova/.test(d.text), 'Nedvíha → skúsiť znova o 2 pracovné dni (víkend preskočí)', JSON.stringify(d));
  ok(C.defaultNext('not_interested', NOW) === null, 'Nemá záujem nemá ďalší krok');
}

console.log('\nÚloha z ďalšieho kroku');
{
  const t = C.task({ id: 'c1', lead_id: 'l1', next_step_at: '2026-11-13', next_step_text: 'Zavolať p. Müllerovi', contact_name: 'Hans Müller', contact_role: 'Bauleiter',
    summary: 'ozvite sa o 2 týždne', happened_at: '2026-10-30T09:00:00Z' }, { id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', phone: '+49 731 1' },
  { user_id: 'u1', full_name: 'Jana Kováčová' });
  ok(t.entity_type === 'lead' && t.entity_id === 'l1' && t.entity_label === 'Müller Bau GmbH', 'úloha pri firme s jej menom');
  ok(t.due_date === '2026-11-13' && t.assigned_to === 'u1' && t.assigned_name === 'Jana Kováčová' && t.priority === 'normal', 'termín a kto sa bavil');
  ok(t.source === 'lead_contact' && t.source_key === 'lead_contact:c1', 'zdroj a jedinečný kľúč');
  ok(/Zavolať p\. Müllerovi — Müller Bau GmbH/.test(t.title) && /Hans Müller, Bauleiter/.test(t.description) && /\+49 731 1/.test(t.description), 'názov a popis s osobou a telefónom', t.title);
  ok(C.task({ lead_id: 'l1' }, { name: 'X' }) === null, 'bez termínu úloha nevznikne');
}

console.log('\nČasová os');
{
  const tl = C.timeline({
    contacts: [
      { id: 'c1', lead_id: 'l1', kind: 'call', outcome: 'callback', summary: 'o 2 týždne', happened_at: '2026-10-29T10:00:00Z', our_member_name: 'Jana', contact_name: 'Hans', next_step_at: '2026-11-13' },
      { id: 'c2', lead_id: 'l1', kind: 'call', summary: 'oprava: o 3 týždne', happened_at: '2026-10-29T10:00:00Z', corrects_id: 'c1', created_at: '2026-10-30T08:00:00Z' },
      { id: 'c3', lead_id: 'l1', kind: 'note', summary: 'archív', happened_at: '2026-10-30T08:00:00Z', archived_at: '2026-10-30T09:00:00Z' },
    ],
    outreach: [{ id: 'o1', lead_id: 'l1', step: 1, status: 'sent', sent_at: '2026-10-20T08:00:00Z', subject: 'Fachkräfte', to_email: 'a@b.de', attachments: [{ name: 'punds-trockenbau.pdf' }] }],
    events: [{ id: 'e1', outreach_id: 'o1', type: 'open', at: '2026-10-20T09:00:00Z' }, { id: 'e2', outreach_id: 'o1', type: 'open', at: '2026-10-21T09:00:00Z' },
      { id: 'e3', outreach_id: 'o1', type: 'open', at: '2026-10-20T08:00:03Z', automated: true, auto_reason: 'Apple' }, { id: 'e4', outreach_id: 'o1', type: 'reply', at: '2026-10-22T09:00:00Z' }],
  });
  ok(tl.length === 5, 'kontakt, e-mail, otvorenie, automatické otvorenie, odpoveď (archív a oprava nie ako riadok)', tl.map(x => x.title).join(' | '));
  ok(tl[0].type === 'contact' && tl[0].corrections.length === 1 && /3 týždne/.test(tl[0].corrections[0].summary), 'najnovšie hore, oprava pod pôvodným');
  ok(/Zavolať neskôr/.test(tl[0].title) && /s Hans/.test(tl[0].sub) && /od nás Jana/.test(tl[0].sub) && tl[0].next.date === '2026-11-13', 'kto, s kým, výsledok a ďalší krok');
  ok(tl.some(x => /Otvoril e-mail · 2×/.test(x.title)) && tl.some(x => /možno automaticky/.test(x.title)), 'otvorenia zoskupené, automat zvlášť');
  ok(tl.some(x => x.type === 'mail' && /punds-trockenbau\.pdf/.test(x.sub)), 'pri e-maile je vidieť prílohu');
  ok(C.relTime('2026-10-30T08:30:00Z', NOW) === 'pred 30 min' && /^včera/.test(C.relTime('2026-10-29T08:00:00Z', NOW)), 'relatívny čas');
}

console.log('\nExport');
{
  const leads = [{ id: 'l1', name: 'Müller; Bau "GmbH"', city: 'Ulm', status: 'later', phone: '+49 1', email: 'a@b.de', next_step_at: '2026-11-13', next_step_text: 'Zavolať' },
    { id: 'l2', name: '=HYPERLINK("x")', status: 'new', archived_at: '2026-01-01' }];
  const contacts = [{ id: 'c1', lead_id: 'l1', kind: 'call', outcome: 'callback', summary: 'ozvite sa\no 2 týždne', happened_at: '2026-10-29T10:00:00Z', our_member_name: 'Jana', contact_name: 'Hans',
    ai_extracted: { source: 'ai', accepted: true } }];
  const rows = C.exportLeads({ leads, contacts, outreachSummary: () => ({ count: 1, opened: true }) });
  ok(rows.length === 2 && rows[0][0] === 'Firma' && rows[1][5] === 'Ozvať sa neskôr', 'firmy: kategória po slovensky, archivovaná nie');
  ok(rows[1].includes('2026-11-13') && rows[1].includes('Jana') && rows[1].includes('Hans') && rows[1].includes('áno'), 'posledný kontakt, ďalší krok a otvorenie e-mailu');
  const csv = '﻿' + X.csv(rows);
  ok(csv.startsWith('﻿') && /"Müller; Bau ""GmbH"""/.test(csv) && /"ozvite sa\no 2 týždne"/.test(csv) && rows[0].length === csv.split('\r\n')[0].split(';').length,
    'CSV pre Excel: BOM, bodkočiarka, úvodzovky a zalomenie v bunke');
  const k = C.exportContacts({ contacts, leads });
  ok(k.length === 2 && k[1][1] === 'Müller; Bau "GmbH"' && k[1][5] === 'Zavolať neskôr' && k[1][18] === 'ai', 'kontakty: firma, výsledok, či návrh bol od AI');
  ok(X.cell('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"`, 'vzorec v bunke sa neuskutoční (spoločný export.js)');
}

console.log('\nRýchle akcie');
{
  const m = C.phoneLinks('0171 2345678');
  ok(m.tel === 'tel:+491712345678' && m.wa === 'https://wa.me/491712345678', 'nemecký mobil: tel aj WhatsApp');
  const f = C.phoneLinks('+49 (731) 123 456');
  ok(f.tel === 'tel:+49731123456' && f.wa === null, 'pevná linka bez WhatsAppu');
  ok(C.phoneLinks('00421 905 123 456').wa === 'https://wa.me/421905123456', 'slovenský mobil');
  ok(C.phoneLinks('') === null, 'bez čísla nič');
  ok(C.webUrl('mueller-bau.de') === 'https://mueller-bau.de/' && C.webUrl('javascript:alert(1)') === '', 'web: doplní https, javascript nie');
  ok(/google\.com\/maps\/search\/\?api=1&query=M%C3%BCller/.test(C.mapsUrl({ name: 'Müller', city: 'Ulm' })), 'Google Mapy podľa mena a mesta');
  ok(C.mapsUrl({ data_source: { maps_url: 'https://www.google.com/maps/place/x' } }) === 'https://www.google.com/maps/place/x', 'alebo presný odkaz z Outscraperu');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
