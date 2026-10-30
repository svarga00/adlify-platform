// ============================================================================
// DANUBRA — kontakt s firmou: zápis, ďalší krok (AI) a kategória firmy
// ============================================================================
// „…zaznamenať, o čom sme sa bavili, s kým a kto presne od nás. Využiť AI,
// aby keď niekto povie, že sa máme ozvať o 2–3 týždne alebo mesiace, sme
// nezabudli a naozaj sa ozvali."
//
//   POST { action: 'suggest', lead_id, summary, outcome }
//     → { suggestion: { next_step_at, next_step_text, confidence, stage_suggestion,
//          source: 'ai'|'rules'|'default', matched, note } | null, ai_error }
//     Nič nezapisuje — návrh sa ukáže v okne ako ponuka, človek ho prijme,
//     upraví alebo zahodí. AI nikdy nič neurobí sama.
//
//   POST { action: 'save', lead_id, kind, direction, outcome, contact_name, contact_role,
//          contact_phone, contact_email, our_member_id, summary, happened_at, duration_min,
//          next_step_at, next_step_text, stage, ai_extracted, create_task }
//     → { ok, contact, task, lead }
//     * záznam do danubra_lead_contacts (po uložení sa nemení),
//     * ďalší krok → úloha v Úlohách (pri firme, termín, pre toho, kto sa
//       s firmou bavil; kľúč lead_contact:<id>) — staršie úlohy z kontaktov
//       tej istej firmy sa uzavrú, nový krok ich nahrádza,
//     * firma: kategória, posledný kontakt, ďalší krok, chýbajúca kontaktná
//       osoba a telefón,
//     * pripomínanie e-mailom sa zastaví, keď firma nemá záujem, je ďalej
//       v procese alebo je dohodnutý ďalší krok (pripomenie ho úloha),
//     * „Zavolať neskôr" bez termínu sa neuloží.
//
//   POST { action: 'stage', lead_id, stage }        zmena kategórie (história sa zapíše sama, 081)
//   POST { action: 'correct', contact_id, summary } oprava = nový záznam s corrects_id
//
// Prečítať smie a zapisovať smie člen s Marketingom (server-guard).
// Env: ANTHROPIC_API_KEY (voliteľné), CLAUDE_MODEL_LEAD_CONTACT (voliteľné,
//      predvolene claude-opus-5-5), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const AI = require('../../app/lib/ai.js');
const F = require('../../app/lib/marketing/followup.js');
const C = require('../../app/lib/marketing/contacts.js');
const OS = require('../../app/lib/marketing/outreach-server.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const guard = require('../../app/lib/server-guard.js')(supabase);

const MODEL = process.env.CLAUDE_MODEL_LEAD_CONTACT || 'claude-opus-5-5';
const AI_WAIT_MS = 8000;
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });
const MISSING = 'Kontakty s firmami ešte nie sú pripravené v databáze (migrácia 081).';
const WDN = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];

const TOOL = {
  name: 'dalsi_krok',
  description: 'Ďalší krok s firmou podľa poznámky z hovoru alebo e-mailu.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      has_next_step: { type: 'boolean', description: 'Je v poznámke dohodnutý alebo zrejmý ďalší krok s termínom?' },
      next_step_at: { type: 'string', description: 'Termín vo formáte YYYY-MM-DD, alebo prázdny reťazec.' },
      next_step_text: { type: 'string', description: 'Čo urobiť, po slovensky, rozkazovacím spôsobom, najviac 100 znakov.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      stage_suggestion: { type: 'string', enum: ['', ...C.STAGE_KEYS] },
      reason: { type: 'string', description: 'Krátko po slovensky, z čoho termín vyplýva (citát z poznámky).' },
    },
    required: ['has_next_step', 'next_step_at', 'next_step_text', 'confidence', 'stage_suggestion', 'reason'],
  },
};

function prompt({ lead, summary, outcome, rule, today }) {
  const o = C.outcomeOf(outcome);
  return 'Si asistent obchodníka firmy punds (slovenskí remeselníci na nemecké stavby). Z poznámky po hovore alebo e-maile '
    + 's nemeckou stavebnou firmou zisti ďalší krok a kedy ho urobiť. Poznámka môže byť po slovensky aj po nemecky.\n\n'
    + `Dnes je ${WDN[F.weekday(today)]} ${today} (Europe/Bratislava).\n`
    + `Firma: ${lead.name || ''}${lead.city ? `, ${lead.city}` : ''}. Súčasná kategória: ${C.stageOf(lead.status)[1]}.\n`
    + (o ? `Výsledok kontaktu (vybral človek): ${o[1]}.\n` : '')
    + `Poznámka:\n"""\n${summary}\n"""\n\n`
    + (rule ? `Pravidlá appky v poznámke našli termín ${rule.date} („${rule.text}"${rule.note ? `; ${rule.note}` : ''}). Ber to ako pomôcku, nie ako povinnosť.\n\n` : '')
    + 'Pravidlá:\n'
    + '- Rozsah („o 2–3 týždne", „in zwei bis drei Monaten") = skorší koniec rozsahu. Radšej skôr ako neskoro.\n'
    + '- Mesiac bez dňa = 1. deň mesiaca; „koncom" = 20. deň; „v polovici / Mitte" = 15. Mesiac, ktorý už bol, = budúci rok.\n'
    + '- „po Novom roku / nach Neujahr" = 8. januára; „po Veľkej noci / nach Ostern" = utorok po Veľkonočnom pondelku; „na jar" = 1. marca; „po sezóne" = 2. novembra.\n'
    + '- Termín je najskôr zajtra a nikdy nie sobota ani nedeľa (posuň na pondelok).\n'
    + '- Keď poznámka nehovorí o žiadnom ďalšom kroku ani termíne, has_next_step = false a next_step_at = "". Nič si nevymýšľaj.\n'
    + '- next_step_text: konkrétne, s menom človeka, ak zaznelo (napr. „Zavolať p. Müllerovi — Trockenbau od marca").\n'
    + `- stage_suggestion: jedna z ${C.STAGE_KEYS.join(', ')} alebo "" (bez zmeny). „Nemá záujem" = rejected, „ozvať sa neskôr" = later.`;
}

/** Odpoveď modelu → overený návrh, alebo chyba. */
function fromAi(r, today) {
  if (!r || typeof r !== 'object') return { error: 'Model nevrátil použiteľný návrh.' };
  const text = String(r.next_step_text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const stage = C.STAGE_KEYS.includes(r.stage_suggestion) ? r.stage_suggestion : null;
  if (!r.has_next_step || !r.next_step_at) return { none: true, stage, reason: String(r.reason || '').slice(0, 300) };
  if (!F.validDate(r.next_step_at)) return { error: 'Model vrátil neplatný dátum.' };
  let date = F.workday(r.next_step_at);
  if (date <= today) date = F.workday(F.addDays(today, 1));
  if (date > F.addMonths(today, 36)) return { error: 'Model vrátil termín ďalej ako tri roky.' };
  return { date, text, stage, confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'medium', reason: String(r.reason || '').slice(0, 300) };
}

async function askAi(p) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'no_api_key' };
  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), AI_WAIT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
        // Keď model žiadosť odmietne, server ju sám zopakuje na inom modeli.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({ ...AI.body({ model: MODEL, tool: TOOL, prompt: p, maxTokens: 1500 }), output_config: { effort: 'low' }, fallbacks: 'default' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: AI.errorText(data, res.status, 'Návrh ďalšieho kroku') };
    if (data.stop_reason === 'refusal') return { error: 'Model návrh odmietol.' };
    return { input: AI.pickTool(data, TOOL.name) };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'Model neodpovedal včas.' : String((e && e.message) || e).slice(0, 200) };
  } finally { clearTimeout(stop); }
}

/** Návrh ďalšieho kroku: AI (keď text o kroku hovorí), inak pravidlá, inak predvolený k výsledku. */
async function suggest({ lead, summary, outcome, now = new Date() }) {
  const today = F.today(now);
  const text = String(summary || '').slice(0, 4000);
  const rule = F.parse(text, { now });
  const def = C.defaultNext(outcome, now);
  const stageRule = outcome ? C.suggestStage(outcome, lead.status) : null;
  const fromRule = rule ? { next_step_at: rule.date, next_step_text: (def && def.text) || 'Ozvať sa, ako sme sa dohodli', confidence: rule.confidence,
    stage_suggestion: stageRule || (lead.status === 'new' ? 'contacted' : null), source: 'rules', matched: rule.text, note: rule.note } : null;
  const fromDefault = def ? { next_step_at: def.date, next_step_text: def.text, confidence: 'low', stage_suggestion: stageRule, source: 'default', matched: '', note: 'predvolené k výsledku' } : null;
  const worth = text.trim().length >= 12 && (F.hasIntent(text, { now }) || ['callback', 'interested', 'send_offer', 'meeting_set'].includes(outcome));
  if (!worth) return { suggestion: fromRule || fromDefault, ai_error: null };
  const ai = await askAi(prompt({ lead, summary: text, outcome, rule, today }));
  if (ai.error) return { suggestion: fromRule || fromDefault, ai_error: ai.error === 'no_api_key' ? 'AI nie je zapnutá — návrh je z pravidiel appky.' : ai.error };
  const r = fromAi(ai.input, today);
  if (r.error) return { suggestion: fromRule || fromDefault, ai_error: r.error };
  // Do kategórie AI nesmie zasiahnuť späť: Je odberateľ / Odhlásená zostávajú.
  const stage = ['won', 'unsubscribed'].includes(lead.status) ? null : (r.stage || stageRule);
  if (r.none) return { suggestion: fromRule ? { ...fromRule, stage_suggestion: stage } : (stage ? { next_step_at: null, next_step_text: '', confidence: 'low', stage_suggestion: stage, source: 'ai', matched: '', note: r.reason } : null), ai_error: null };
  return { suggestion: { next_step_at: r.date, next_step_text: r.text || (def && def.text) || 'Ozvať sa, ako sme sa dohodli', confidence: r.confidence,
    stage_suggestion: stage, source: 'ai', matched: rule ? rule.text : '', note: r.reason }, ai_error: null };
}

async function members() {
  const { data } = await supabase.from('danubra_members').select('id,user_id,full_name,email,active').limit(500);
  return (data || []).filter(m => m.active !== false);
}

/** Pripomínanie e-mailom sa zastaví a úlohy „Pripomenúť sa" (outreach:…) sa uzavrú. */
async function stopSequence(leadId, at) {
  await supabase.from('danubra_outreach').update({ next_followup_at: null }).eq('lead_id', leadId);
  return OS.closeTasks(supabase, leadId, at);
}

/** Staršie úlohy z kontaktov tej istej firmy (nový krok ich nahrádza). */
async function closeContactTasks(leadId, at, exceptId) {
  const { data } = await supabase.from('danubra_tasks').select('id,source_key,status')
    .eq('entity_type', 'lead').eq('entity_id', leadId).in('status', ['open', 'in_progress']);
  const ids = (data || []).filter(t => String(t.source_key || '').startsWith('lead_contact:') && t.id !== exceptId).map(t => t.id);
  for (const id of ids) await supabase.from('danubra_tasks').update({ status: 'done', done_at: at }).eq('id', id);
  return ids.length;
}

/** Návrh AI, ktorý sa uloží pri kontakte — len známe kľúče, krátko. */
function aiMeta(x, row) {
  if (!x || typeof x !== 'object') return null;
  const s = (v, n) => (v == null ? null : String(v).slice(0, n));
  const m = { source: ['ai', 'rules', 'default'].includes(x.source) ? x.source : null, next_step_at: F.validDate(x.next_step_at) ? x.next_step_at : null,
    next_step_text: s(x.next_step_text, 200), confidence: s(x.confidence, 10), stage_suggestion: C.STAGE_KEYS.includes(x.stage_suggestion) ? x.stage_suggestion : null,
    matched: s(x.matched, 200), note: s(x.note, 300) };
  if (!m.source) return null;
  m.accepted = !!(m.next_step_at && m.next_step_at === row.next_step_at && (m.next_step_text || '') === (row.next_step_text || ''));
  return m;
}

async function save(b, g, now = new Date()) {
  const v = C.validate(b, { now });
  if (!v.ok) return out(400, { error: v.errors[0], errors: v.errors });
  const row = v.row;
  const { data: lead } = await supabase.from('danubra_leads').select('*').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
  if (!lead) return out(404, { error: 'Firma sa nenašla.' });
  const list = await members();
  const me = list.find(m => m.user_id === g.user.id) || null;
  const our = (b.our_member_id && list.find(m => m.id === b.our_member_id || m.user_id === b.our_member_id)) || me;
  const ourName = our ? String(our.full_name || our.email || '').trim() : String(g.user.email || '').trim();
  const at = new Date(now).toISOString();

  const before = lead.status || 'new';
  let after = row.stage || (row.outcome ? C.suggestStage(row.outcome, before) : (before === 'new' ? 'contacted' : before));
  if (row.outcome === 'not_interested') after = 'rejected';
  if (before === 'unsubscribed' && after !== 'rejected') after = 'unsubscribed';   // odhlásenie z e-mailov sa neprepíše

  const id = crypto.randomUUID();
  const contact = {
    id, lead_id: lead.id, ...row, stage: undefined, our_member_id: our ? our.id || null : null, our_user_id: our ? our.user_id || null : g.user.id,
    our_member_name: ourName || null, stage_before: before, stage_after: after, ai_extracted: aiMeta(b.ai_extracted, row), created_by: g.user.id,
  };
  delete contact.stage;

  // Úloha najprv — kontakt potom nesie jej id (záznam sa po uložení nemení).
  let task = null, taskWarn = null;
  if (row.next_step_at && b.create_task !== false && after !== 'rejected') {
    const t = C.task({ ...contact }, lead, our ? { user_id: our.user_id, full_name: ourName } : null);
    const { data, error } = await supabase.from('danubra_tasks').insert({ ...t, created_by: g.user.id }).select('id,title,due_date,assigned_name').single();
    if (error || !data) taskWarn = 'Úloha sa nevytvorila — termín je pri firme, pripomeňte si ho ručne.';
    else { task = data; contact.next_step_task_id = data.id; }
  }
  const { data: saved, error: e1 } = await supabase.from('danubra_lead_contacts').insert(contact).select('*').single();
  if (e1 || !saved) {
    // Úloha bez kontaktu nedáva zmysel — zruší sa (nemaže sa).
    if (task) await supabase.from('danubra_tasks').update({ status: 'cancelled' }).eq('id', task.id);
    return out(/relation|does not exist|schema cache/i.test(String(e1 && e1.message)) ? 503 : 500, { error: e1 && /relation|does not exist|schema cache/i.test(String(e1.message)) ? MISSING : 'Kontakt sa nepodarilo zapísať.' });
  }

  // Firma: kategória, posledný kontakt, ďalší krok, chýbajúce údaje.
  const patch = {};
  if (!lead.last_contact_at || String(lead.last_contact_at) < row.happened_at) patch.last_contact_at = row.happened_at;
  if (after !== before) { patch.status = after; patch.status_changed_by = g.user.id; }
  if (row.next_step_at && after !== 'rejected') { patch.next_step_at = row.next_step_at; patch.next_step_text = row.next_step_text; }
  else if (after === 'rejected') { patch.next_step_at = null; patch.next_step_text = null; }
  if (!lead.contact_person && row.contact_name) patch.contact_person = row.contact_name;
  if (!lead.phone && row.contact_phone) patch.phone = row.contact_phone;
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('danubra_leads').update(patch).eq('id', lead.id);
    // Bez 081 stĺpce ďalšieho kroku nie sú — aspoň kategória a kontakt.
    if (error) {
      const basic = { ...patch }; delete basic.next_step_at; delete basic.next_step_text; delete basic.status_changed_by;
      if (Object.keys(basic).length) await supabase.from('danubra_leads').update(basic).eq('id', lead.id);
    }
  }
  let closed = 0;
  if (row.next_step_at || after === 'rejected') closed += await closeContactTasks(lead.id, at, task && task.id);
  if (row.next_step_at || C.NO_SEQUENCE.includes(after)) closed += await stopSequence(lead.id, at);
  return out(200, { ok: true, contact: saved, task, lead: { id: lead.id, ...patch, status: after }, closed_tasks: closed, warn: taskWarn });
}

async function stage(b, g) {
  const st = String(b.stage || '');
  if (!C.STAGE_KEYS.includes(st)) return out(400, { error: 'Neznáma kategória firmy.' });
  const { data: lead } = await supabase.from('danubra_leads').select('id,status').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
  if (!lead) return out(404, { error: 'Firma sa nenašla.' });
  if (lead.status === st) return out(200, { ok: true, lead });
  const at = new Date().toISOString();
  const patch = { status: st, status_changed_by: g.user.id, ...(st === 'rejected' ? { next_step_at: null, next_step_text: null } : {}) };
  let { error } = await supabase.from('danubra_leads').update(patch).eq('id', lead.id);
  if (error) ({ error } = await supabase.from('danubra_leads').update({ status: st }).eq('id', lead.id));
  if (error) return out(/check/i.test(error.message) ? 503 : 500, { error: /check/i.test(error.message) ? MISSING : 'Kategória sa nezmenila.' });
  if (C.NO_SEQUENCE.includes(st)) await stopSequence(lead.id, at);
  if (st === 'rejected') await closeContactTasks(lead.id, at, null);
  return out(200, { ok: true, lead: { id: lead.id, status: st } });
}

async function correct(b, g) {
  const summary = String(b.summary || '').trim().slice(0, 4000);
  if (summary.length < 3) return out(400, { error: 'Napíšte opravený text.' });
  const { data: orig } = await supabase.from('danubra_lead_contacts').select('*').eq('id', b.contact_id).is('archived_at', null).maybeSingle();
  if (!orig) return out(404, { error: 'Záznam sa nenašiel.' });
  const root = orig.corrects_id || orig.id;
  const list = await members();
  const me = list.find(m => m.user_id === g.user.id) || null;
  const row = { id: crypto.randomUUID(), lead_id: orig.lead_id, kind: orig.kind, direction: orig.direction, outcome: null, summary,
    happened_at: orig.happened_at, corrects_id: root, our_member_id: me ? me.id : null, our_user_id: g.user.id,
    our_member_name: me ? (me.full_name || me.email) : (g.user.email || null), created_by: g.user.id };
  const { data, error } = await supabase.from('danubra_lead_contacts').insert(row).select('*').single();
  if (error || !data) return out(500, { error: 'Opravu sa nepodarilo zapísať.' });
  return out(200, { ok: true, contact: data });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const g = await guard.check(event, { key: 'marketing' });
  if (!g.ok) return out(g.status, { error: g.error });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const action = String(b.action || 'save');
  if (action === 'stage') return stage(b, g);
  if (action === 'correct') return correct(b, g);
  if (!b.lead_id) return out(400, { error: 'Chýba firma.' });
  if (action === 'suggest') {
    const { data: lead } = await supabase.from('danubra_leads').select('id,name,city,status,contact_person').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
    if (!lead) return out(404, { error: 'Firma sa nenašla.' });
    const r = await suggest({ lead, summary: b.summary, outcome: b.outcome });
    return out(200, r);
  }
  if (action === 'save') return save(b, g);
  return out(400, { error: 'Neznáma akcia.' });
};

exports._test = { prompt, fromAi, suggest, TOOL };
