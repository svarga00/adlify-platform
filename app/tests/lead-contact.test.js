// ============================================================================
// DANUBRA — kontakt s firmou (danubra-lead-contact): zápis, ďalší krok, AI
// Spustenie:  node app/tests/lead-contact.test.js
// ============================================================================
// Bez siete: Supabase je v pamäti (fake-supabase.js), model je podvrhnutý
// (fetch). Stráži sa:
//   * len člen s Marketingom,
//   * návrh ďalšieho kroku nič nezapisuje; bez AI z pravidiel; AI dostane
//     dnešný dátum a pravidlá a jej dátum sa overí (víkend → pondelok),
//   * záznam kontaktu + úloha v Úlohách (pri firme, termín, pre toho, kto
//     sa bavil) + kategória a ďalší krok pri firme,
//   * „Nemá záujem" zastaví pripomínanie e-mailom a uzavrie úlohy,
//   * nový ďalší krok nahradí starší, oprava je nový záznam,
//   * bez migrácie 081 povie, čo chýba, a úloha nezostane visieť.
// ============================================================================
const Module = require('module');
const path = require('path');
const F = require('./fake-supabase.js');
const FU = require('../lib/marketing/followup.js');

delete process.env.ANTHROPIC_API_KEY;

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const holder = { sb: null };
const proxy = { from: (...a) => holder.sb.from(...a), rpc: (...a) => holder.sb.rpc(...a), auth: { getUser: (...a) => holder.sb.auth.getUser(...a) } };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => proxy };
  return origLoad.apply(this, arguments);
};
const FN = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-lead-contact.js');
const fn = require(FN);

function base(over = {}) {
  return {
    danubra_members: [
      { id: 'm1', user_id: 'u-admin', role: 'admin', active: true, full_name: 'Štefan Varga', email: 'stefan@punds.eu' },
      { id: 'm2', user_id: 'u-rec', role: 'recruiter', active: true, full_name: 'Nábor', email: 'nabor@punds.eu' },
      { id: 'm3', user_id: 'u-mkt', role: 'recruiter', active: true, modules: ['marketing'], full_name: 'Jana Kováčová', email: 'jana@punds.eu' }],
    danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', phone: null, contact_person: null, status: 'contacted', archived_at: null }],
    danubra_lead_contacts: [], danubra_tasks: [], danubra_outreach: [{ id: 'o1', lead_id: 'l1', status: 'sent', next_followup_at: '2026-11-04T09:00:00Z' }],
    ...over,
  };
}
function reset(db, opts = {}) {
  holder.sb = F.create(db, { users: { admin: { id: 'u-admin', email: 'stefan@punds.eu' }, rec: { id: 'u-rec' }, mkt: { id: 'u-mkt' } }, ...opts });
  return holder.sb;
}
const call = async (body, jwt = 'admin') => {
  const r = await fn.handler({ httpMethod: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });
  return { code: r.statusCode, ...JSON.parse(r.body) };
};
const later = (days) => FU.workday(FU.addDays(FU.today(), days));

(async () => {
  console.log('Kto smie');
  {
    reset(base());
    ok((await call({ action: 'suggest', lead_id: 'l1', summary: 'x' }, null)).code === 401, 'bez prihlásenia nie');
    ok((await call({ action: 'save', lead_id: 'l1', summary: 'x' }, 'rec')).code === 403, 'náborár bez Marketingu nie');
    ok((await call({ action: 'suggest', lead_id: 'l1', summary: 'ozvite sa o týždeň' }, 'mkt')).code === 200, 's Marketingom áno');
  }

  console.log('\nNávrh ďalšieho kroku (bez AI)');
  {
    const sb = reset(base());
    const text = 'Bauleiter Müller: teraz nič, ozvite sa o 2-3 týždne, plánujú Trockenbau';
    const r = await call({ action: 'suggest', lead_id: 'l1', summary: text, outcome: 'callback' });
    const want = FU.parse(text).date;
    ok(r.code === 200 && r.suggestion && r.suggestion.source === 'rules' && r.suggestion.next_step_at === want, 'z pravidiel appky: skorší koniec rozsahu', JSON.stringify(r));
    ok(r.suggestion.stage_suggestion === 'later' && /AI nie je zapnutá/.test(r.ai_error), 'navrhne kategóriu a povie, že AI nie je zapnutá');
    ok(sb.log.length === 0, 'návrh nič nezapisuje');
    const n = await call({ action: 'suggest', lead_id: 'l1', summary: 'nemá záujem, majú vlastných ľudí', outcome: 'not_interested' });
    ok(n.code === 200 && n.suggestion === null, 'pri „Nemá záujem" bez termínu žiadny návrh');
    const d = await call({ action: 'suggest', lead_id: 'l1', summary: '', outcome: 'no_answer' });
    ok(d.suggestion && d.suggestion.source === 'default' && d.suggestion.next_step_at === later(2), 'Nedvíha → predvolené skúsiť znova o 2 pracovné dni');
  }

  console.log('\nNávrh ďalšieho kroku (AI)');
  {
    reset(base());
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const real = global.fetch;
    const seen = [];
    let answer = null;
    global.fetch = async (url, o) => {
      seen.push({ url, body: JSON.parse(o.body), headers: o.headers });
      return { ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'dalsi_krok', input: answer }] }) };
    };
    // AI vráti sobotu → posunie sa na pondelok.
    const sat = (() => { let d = FU.addDays(FU.today(), 10); while (FU.weekday(d) !== 6) d = FU.addDays(d, 1); return d; })();
    answer = { has_next_step: true, next_step_at: sat, next_step_text: 'Zavolať p. Müllerovi — Trockenbau od marca', confidence: 'high', stage_suggestion: 'later', reason: '„melden Sie sich in zwei Wochen"' };
    const r = await call({ action: 'suggest', lead_id: 'l1', summary: 'Hr. Müller: melden Sie sich in zwei Wochen wieder', outcome: 'callback' });
    ok(r.suggestion && r.suggestion.source === 'ai' && r.suggestion.next_step_at === FU.addDays(sat, 2) && /Müllerovi/.test(r.suggestion.next_step_text),
      'AI navrhne termín a text; sobota → pondelok', JSON.stringify(r.suggestion));
    const b = seen[0].body;
    ok(seen[0].url === 'https://api.anthropic.com/v1/messages' && seen[0].headers['x-api-key'] === 'test-key' && b.model === 'claude-opus-5-5' && !b.tool_choice,
      'volanie na server s kľúčom z prostredia, bez vynúteného nástroja');
    ok(b.tools[0].strict === true && b.fallbacks === 'default' && /Dnes je/.test(b.messages[0].content) && /skorší koniec/.test(b.messages[0].content)
      && /Pravidlá appky v poznámke našli termín/.test(b.messages[0].content), 'prompt: dnešok, pravidlo „skorší koniec" a nález pravidiel');
    answer = { has_next_step: true, next_step_at: '31.12.2026', next_step_text: 'x', confidence: 'high', stage_suggestion: '', reason: '' };
    const z = await call({ action: 'suggest', lead_id: 'l1', summary: 'ozvite sa o mesiac prosím', outcome: 'callback' });
    ok(z.suggestion && z.suggestion.source === 'rules' && /neplatný dátum/.test(z.ai_error), 'neplatný dátum od AI → pravidlá appky', JSON.stringify(z));
    answer = { has_next_step: false, next_step_at: '', next_step_text: '', confidence: 'low', stage_suggestion: 'rejected', reason: 'nemá záujem' };
    const y = await call({ action: 'suggest', lead_id: 'l1', summary: 'už nevolať, nikdy nebudú potrebovať, ďakujeme', outcome: 'interested' });
    ok(y.suggestion && !y.suggestion.next_step_at && y.suggestion.stage_suggestion === 'rejected', 'bez termínu AI nevymyslí dátum', JSON.stringify(y));
    global.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }

  console.log('\nZápis kontaktu');
  {
    const sb = reset(base({ danubra_tasks: [{ id: 't-out', source_key: 'outreach:o1:1', entity_type: 'lead', entity_id: 'l1', status: 'open' }] }));
    const bad = await call({ action: 'save', lead_id: 'l1', outcome: 'callback', summary: 'ozvite sa neskôr' });
    ok(bad.code === 400 && /kedy sa máme ozvať/.test(bad.error) && !sb.writes('danubra_lead_contacts').length, '„Zavolať neskôr" bez termínu sa neuloží');
    const due = later(14);
    const r = await call({ action: 'save', lead_id: 'l1', kind: 'call', outcome: 'callback', contact_name: 'Hans Müller', contact_role: 'Bauleiter', contact_phone: '+49 731 1',
      our_member_id: 'm3', summary: 'ozvite sa o 2-3 týždne', next_step_at: due, next_step_text: 'Zavolať p. Müllerovi', stage: 'later',
      ai_extracted: { source: 'rules', next_step_at: due, next_step_text: 'Zavolať p. Müllerovi', matched: 'o 2-3 týždne' } });
    ok(r.code === 200 && r.ok, 'uložené', JSON.stringify(r));
    const c = sb.db.danubra_lead_contacts[0];
    ok(c && c.lead_id === 'l1' && c.outcome === 'callback' && c.contact_name === 'Hans Müller' && c.our_member_id === 'm3' && c.our_member_name === 'Jana Kováčová',
      's kým a kto od nás (vybraný kolega, nie ten, kto zapisuje)');
    ok(c.stage_before === 'contacted' && c.stage_after === 'later' && c.created_by === 'u-admin', 'kategória pred a po, kto zapísal');
    ok(c.ai_extracted && c.ai_extracted.source === 'rules' && c.ai_extracted.accepted === true, 'uloží sa, že návrh bol prijatý');
    const t = sb.db.danubra_tasks.find(x => String(x.source_key).startsWith('lead_contact:'));
    ok(t && t.entity_type === 'lead' && t.entity_id === 'l1' && t.entity_label === 'Müller Bau GmbH' && t.due_date === due && t.priority === 'normal',
      'úloha v Úlohách pri firme s termínom', JSON.stringify(t));
    ok(t.assigned_to === 'u-mkt' && t.assigned_name === 'Jana Kováčová' && t.source === 'lead_contact' && t.source_key === `lead_contact:${c.id}` && c.next_step_task_id === t.id,
      'pre toho, kto sa bavil; kľúč úlohy = kontakt; kontakt nesie id úlohy');
    const l = sb.db.danubra_leads[0];
    ok(l.status === 'later' && l.status_changed_by === 'u-admin' && l.next_step_at === due && l.next_step_text === 'Zavolať p. Müllerovi' && l.last_contact_at,
      'firma: kategória, ďalší krok, posledný kontakt');
    ok(l.contact_person === 'Hans Müller' && l.phone === '+49 731 1', 'chýbajúca kontaktná osoba a telefón sa doplnia');
    ok(sb.db.danubra_outreach[0].next_followup_at === null && sb.db.danubra_tasks.find(x => x.id === 't-out').status === 'done',
      'pripomínanie e-mailom sa zastaví (úlohu riadi dohodnutý krok)');

    // Druhý kontakt s novým termínom nahradí starú úlohu.
    const due2 = later(30);
    const r2 = await call({ action: 'save', lead_id: 'l1', kind: 'email', direction: 'in', outcome: 'interested', summary: 'odpísal, chce ponuku v marci', next_step_at: due2, next_step_text: 'Poslať ponuku' });
    ok(r2.code === 200 && t.status === 'done' && sb.db.danubra_tasks.filter(x => String(x.source_key).startsWith('lead_contact:') && x.status === 'open').length === 1,
      'nový ďalší krok uzavrie starú úlohu z kontaktu');
    ok(sb.db.danubra_leads[0].status === 'interested' && sb.db.danubra_lead_contacts[1].our_member_name === 'Štefan Varga', 'bez výberu je „kto od nás" ten, kto zapisuje');

    // Nemá záujem
    const r3 = await call({ action: 'save', lead_id: 'l1', outcome: 'not_interested', summary: 'majú vlastných ľudí' });
    ok(r3.code === 200 && sb.db.danubra_leads[0].status === 'rejected' && sb.db.danubra_leads[0].next_step_at === null, 'Nemá záujem → kategória a bez ďalšieho kroku');
    ok(sb.db.danubra_tasks.filter(x => String(x.source_key).startsWith('lead_contact:') && x.status === 'open').length === 0, 'a otvorené úlohy z kontaktov sa uzavrú');
  }

  console.log('\nDotazník po hovore');
  {
    const sb = reset(base());
    const r = await call({ action: 'save', lead_id: 'l1', kind: 'call', outcome: 'interested', summary: '• Záujem: 4/5\n• Poslať: profily partií', duration_min: 6,
      answers: { right_person: 'yes', interest: 4, send: ['profiles', 'hack'], trades: ['Maler'], headcount: 4, when: 'spring', evil: '<script>' } });
    const c = sb.db.danubra_lead_contacts[0];
    ok(r.code === 200 && c.ai_extracted && c.ai_extracted.answers && c.ai_extracted.answers.interest === 4 && c.ai_extracted.answers.when === 'spring',
      'odpovede sa uložia štruktúrovane do ai_extracted.answers', JSON.stringify(c && c.ai_extracted));
    ok(c.ai_extracted.answers.send.join() === 'profiles' && !('evil' in c.ai_extracted.answers) && !c.ai_extracted.source, 'len známe kľúče a hodnoty; bez návrhu AI nič navyše');
    ok(c.summary.startsWith('• Záujem') && c.duration_min === 6, 'súhrn v bodoch a dĺžka hovoru');
    await call({ action: 'save', lead_id: 'l1', kind: 'call', outcome: 'no_answer', summary: '' , answers: {} });
    ok(sb.db.danubra_lead_contacts[1].ai_extracted === null, 'prázdny dotazník = nič');
  }

  console.log('\nKategória a oprava');
  {
    const sb = reset(base({ danubra_lead_contacts: [{ id: 'c1', lead_id: 'l1', kind: 'call', summary: 'pôvodný', happened_at: '2026-10-29T10:00:00Z' }] }));
    ok((await call({ action: 'stage', lead_id: 'l1', stage: 'nonsense' })).code === 400, 'neznáma kategória nie');
    const s = await call({ action: 'stage', lead_id: 'l1', stage: 'meeting' });
    ok(s.code === 200 && sb.db.danubra_leads[0].status === 'meeting' && sb.db.danubra_leads[0].status_changed_by === 'u-admin', 'zmena kategórie (kto ju zmenil)');
    ok(sb.db.danubra_outreach[0].next_followup_at === null, 'Stretnutie zastaví pripomínanie e-mailom');
    const k = await call({ action: 'correct', contact_id: 'c1', summary: 'opravený text' });
    ok(k.code === 200 && sb.db.danubra_lead_contacts.length === 2 && sb.db.danubra_lead_contacts[1].corrects_id === 'c1' && sb.db.danubra_lead_contacts[0].summary === 'pôvodný',
      'oprava je nový záznam, pôvodný sa nemení');
    const k2 = await call({ action: 'correct', contact_id: sb.db.danubra_lead_contacts[1].id, summary: 'druhá oprava' });
    ok(k2.code === 200 && sb.db.danubra_lead_contacts[2].corrects_id === 'c1', 'oprava opravy patrí k pôvodnému');
    ok(!sb.writes('danubra_lead_contacts', 'update').length && !sb.writes('danubra_lead_contacts', 'delete').length, 'nič sa neprepisuje ani nemaže');
  }

  console.log('\nBez migrácie 081');
  {
    const sb = reset(base(), { errors: { 'danubra_lead_contacts:insert': 'relation "danubra_lead_contacts" does not exist' } });
    const r = await call({ action: 'save', lead_id: 'l1', outcome: 'callback', summary: 'o týždeň', next_step_at: later(7) });
    ok(r.code === 503 && /migrácia 081/.test(r.error), 'povie, že chýba migrácia', JSON.stringify(r));
    ok(sb.db.danubra_tasks.length === 1 && sb.db.danubra_tasks[0].status === 'cancelled', 'úloha bez kontaktu sa zruší (nezmaže)');
    ok(sb.db.danubra_leads[0].status === 'contacted', 'firma sa nezmenila');
  }

  console.log('\nPravidlá pre model');
  {
    const { fromAi, prompt } = fn._test;
    const today = '2026-10-30';
    ok(fromAi({ has_next_step: true, next_step_at: '2026-10-29', next_step_text: 'x', confidence: 'high', stage_suggestion: '' }, today).date === '2026-11-02', 'minulosť → najbližší pracovný deň');
    ok(!!fromAi({ has_next_step: true, next_step_at: '2031-01-01', next_step_text: 'x' }, today).error, 'viac ako 3 roky dopredu nie');
    ok(fromAi({ has_next_step: true, next_step_at: '2026-11-10', stage_suggestion: 'hack' }, today).stage === null, 'neznáma kategória sa zahodí');
    const p = prompt({ lead: { name: 'X', status: 'new' }, summary: 's', outcome: 'callback', rule: null, today });
    ok(/Nič si nevymýšľaj/.test(p) && /8\. januára/.test(p) && /nikdy nie sobota ani nedeľa/.test(p), 'prompt: nevymýšľať, sviatky, víkend');
  }

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
