// ============================================================================
// DANUBRA — návrh e-mailu oslovenia pre jednu firmu (AI, inak šablóna)
// ============================================================================
//   POST { lead_id, step, lang: 'de'|'en', template_key }
//   → { subject, body, source: 'ai'|'template', template_key, missing, ai_error }
//
// Návrh nič neposiela ani nezapisuje — e-mail si človek prečíta, upraví
// a odošle sám (danubra-outreach-send). AI dostane profil firmy (názov,
// mesto, remeslo, prečo ju navrhla AI pri hľadaní), naše portfólio
// z Nastavení oslovovania a zvolenú šablónu ako vzor; píše po nemecky
// v Sie-forme (alebo po anglicky), krátko a bez vymyslených faktov.
// Meno nášho odberateľa, na ktorého sa firma podobá, do e-mailu nedá —
// s kým robíme, je obchodné tajomstvo.
//
// Bez ANTHROPIC_API_KEY, pri chybe alebo dlhom čakaní sa vráti šablóna
// s doplnenými premennými ({firma}, {mesto}, {konatel}, {remeslo}, {podobna}…).
// Pri pripomenutí (krok 2+) je predmet vždy „Re: <pôvodný predmet>" — ide
// v tom istom vlákne.
//
// Env: ANTHROPIC_API_KEY (voliteľné), CLAUDE_MODEL_OUTREACH (voliteľné,
//      predvolene claude-opus-5-5), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
// Čítanie odpovede modelu je na jednom mieste — pozri app/lib/ai.js.
const AI = require('../../app/lib/ai.js');
const O = require('../../app/lib/marketing/outreach.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const guard = require('../../app/lib/server-guard.js')(supabase);

const MODEL = process.env.CLAUDE_MODEL_OUTREACH || 'claude-opus-5-5';
const AI_WAIT_MS = 9000;
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

const TOOL = {
  name: 'navrh_emailu',
  description: 'Návrh krátkeho osobného e-mailu firme.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Predmet e-mailu, najviac 80 znakov.' },
      body: { type: 'string', description: 'Text e-mailu bez podpisu a bez pätičky. Začína oslovením, končí pozdravom.' },
    },
    required: ['subject', 'body'],
  },
};

function prompt({ lead, v, step, lang, template, prev }) {
  const jazyk = lang === 'en' ? 'po anglicky' : 'po nemecky, vykaním (Sie-Form)';
  const pozdrav = lang === 'en' ? 'Kind regards' : 'Mit freundlichen Grüßen';
  const fakty = [
    `Firma: ${v.firma}`, v.mesto && `Mesto: ${v.mesto}`, v.remeslo && `Čím sa zaoberá: ${v.remeslo}`,
    lead.website && `Web: ${lead.website}`, lead.why && `Prečo sme ju vybrali (interné): ${lead.why}`,
    v.konatel && `Kontaktná osoba: ${v.konatel}`,
  ].filter(Boolean).join('\n');
  const spolocne = `Píšeš e-mail ${jazyk} za firmu „${v.nasa_firma}" (slovenský subdodávateľ remeselníkov na nemecké stavby, `
    + 'Werkvertrag, A1, Freistellungsbescheinigung § 48b). Nemecké firmy oslovujeme po jednom, osobne a s rešpektom.\n\n'
    + `O firme, ktorej píšeš:\n${fakty}\n\n`
    + (v.portfolio ? `Čo ponúkame (z našich nastavení, môžeš použiť):\n${v.portfolio}\n\n` : '')
    + `Vzor (štýl a dĺžka, nemusíš ho kopírovať):\nPredmet: ${template.subject}\n${template.body}\n\n`
    + 'Pravidlá:\n'
    + `- Začni presne oslovením „${v.oslovenie}" a skonči pozdravom „${pozdrav}". Podpis ani pätičku nepíš — pridajú sa samy.\n`
    + '- Nič si nevymýšľaj: žiadne ceny, počty ľudí, termíny, referencie ani mená zákazníkov, ktoré tu nie sú.\n'
    + '- Nikdy nespomeň, s ktorými firmami spolupracujeme, ani interný dôvod výberu doslova.\n'
    + '- Žiadne odkazy okrem tých, ktoré sú v portfóliu. Žiadne emoji, žiadny nátlak, žiadne „exkluzívne" ani „len dnes".\n'
    + '- Konkrétne k tomu, čo firma robí (remeslo, mesto), ak to vieme. Jedna jasná otázka na konci (krátky telefonát alebo referencie).\n';
  if (step > 1) {
    return `${spolocne}- Toto je krátke pripomenutie (najviac 70 slov) k e-mailu „${prev ? prev.subject : ''}" `
      + `${prev && prev.sent_at ? `z ${v.datum}` : ''}, na ktorý firma neodpísala. Zdvorilo, bez výčitiek, nič nové nesľubuj.\n`
      + `- Predmet nechaj „${O.replySubject(prev ? prev.subject : template.subject)}".`;
  }
  return `${spolocne}- Najviac 130 slov, krátke odseky. Predmet najviac 80 znakov, vecný, bez veľkých písmen a výkričníkov.`;
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
      body: JSON.stringify({
        ...AI.body({ model: MODEL, tool: TOOL, prompt: p, maxTokens: 2000 }),
        output_config: { effort: 'low' }, fallbacks: 'default',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: AI.errorText(data, res.status, 'Návrh e-mailu') };
    if (data.stop_reason === 'refusal') return { error: 'Model návrh odmietol.' };
    const r = AI.pickTool(data, TOOL.name);
    const body = r && typeof r.body === 'string' ? r.body.trim() : '';
    const subject = r && typeof r.subject === 'string' ? r.subject.replace(/\s+/g, ' ').trim() : '';
    if (body.length < 40 || body.length > 4000 || !subject) return { error: 'Model nevrátil použiteľný návrh.' };
    return { subject: subject.slice(0, 150), body };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'Model neodpovedal včas.' : String((e && e.message) || e).slice(0, 200) };
  } finally { clearTimeout(stop); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const g = await guard.check(event, { key: 'marketing' });
  if (!g.ok) return out(g.status, { error: g.error });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const step = Math.max(1, Math.min(10, parseInt(b.step, 10) || 1));
  const lang = b.lang === 'en' ? 'en' : 'de';

  const { data: lead } = await supabase.from('danubra_leads').select('*').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
  if (!lead) return out(404, { error: 'Firma sa nenašla.' });
  const [cfgQ, tplQ, histQ, simQ] = await Promise.all([
    supabase.from('danubra_settings').select('supplier,marketing').order('created_at').limit(1),
    supabase.from('danubra_message_templates').select('key,language,channel,subject,body,active').eq('channel', 'outreach').limit(50),
    supabase.from('danubra_outreach').select('id,step,status,subject,sent_at,message_id').eq('lead_id', lead.id).is('archived_at', null),
    lead.similar_to ? supabase.from('danubra_partners').select('name').eq('id', lead.similar_to).maybeSingle() : { data: null },
  ]);
  const row0 = (cfgQ.data && cfgQ.data[0]) || {};
  const cfg = O.settings(row0.marketing);
  const prev = step > 1 ? O.lastSent(histQ.data || []) : null;
  const v = O.vars(lead, { supplier: row0.supplier || {}, similarName: simQ.data && simQ.data.name, lang, portfolio: cfg.portfolio, prev });
  const template = O.pickTemplate(tplQ.data || [], { step, lang, key: b.template_key || '' });
  const fallback = {
    subject: step > 1 && prev ? O.replySubject(prev.subject) : O.fillTemplate(template.subject, v),
    body: O.fillTemplate(template.body, v),
  };
  const missing = O.missingVars(`${template.subject}\n${template.body}`, v);

  const ai = await askAi(prompt({ lead, v, step, lang, template, prev }));
  if (ai.error) {
    return out(200, { ...fallback, source: 'template', template_key: template.key, missing,
      ai_error: ai.error === 'no_api_key' ? 'AI nie je zapnutá (chýba ANTHROPIC_API_KEY) — použila sa šablóna.' : ai.error });
  }
  return out(200, {
    subject: step > 1 && prev ? O.replySubject(prev.subject) : ai.subject,
    body: ai.body, source: 'ai', template_key: template.key, missing: [],
  });
};

exports._test = { prompt, askAi, TOOL };
