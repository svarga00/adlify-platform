// ============================================================================
// DANUBRA — návrh e-mailu oslovenia pre jednu firmu (AI, inak šablóna)
// ============================================================================
//   POST { lead_id, step, lang: 'de'|'en', template_key, attach_presentation }
//   → { subject, body, source: 'ai'|'template', template_key, missing, ai_error }
//
// Od 081 je e-mail v dizajne punds (outreach-email.js): nadpis, tri body
// podľa remesla a regiónu, výzvu, podpis a pätičku pridá appka. AI preto
// píše LEN text (oslovenie, 2–3 krátke odseky, výzva, pozdrav) — nie
// rozloženie, nie zoznam bodov, ktoré sú už pod textom.
//
// Čo robí dobrý studený e-mail nemeckej remeselnej firme (083): prvá veta
// o NICH (remeslo po nemecky, mesto, niečo konkrétne z ich webu alebo
// profilu), nie o nás; predmet konkrétny a miestny, bez otáznika; jedna
// konkrétna ponuka; výzva s dvoma možnosťami (telefonát utorok/štvrtok
// dopoludnia, alebo odpoveď „Profile"). AI dostane nemecké označenie
// remesla z pitch.js — nikdy `lead.trade`, čo je slovenský text z hľadania.
// „In Ihrer Region sind wir bereits tätig" smie napísať len vtedy, keď
// máme bežiacu zákazku do ~80 km (danubra_subcontracts so súradnicami) —
// a ani vtedy nemenuje odberateľa ani stavbu.
//
// Návrh nič neposiela ani nezapisuje — e-mail si človek prečíta, upraví
// a odošle sám (danubra-outreach-send). Interné poznámky (prečo sme firmu
// vybrali, poznámka k hľadaniu) sú v prompte označené ako interné a model
// ich necituje. Meno nášho odberateľa, na ktorého sa firma podobá, do
// e-mailu nedá — s kým robíme, je obchodné tajomstvo.
//
// Bez ANTHROPIC_API_KEY, pri chybe, dlhom čakaní alebo slovenských slovách
// v nemeckom texte sa vráti šablóna s doplnenými premennými ({firma},
// {mesto}, {konatel}, {remeslo}, {team}, {priloha}…). Pri pripomenutí
// (krok 2+) je predmet vždy „Re: <pôvodný predmet>" — ide v tom istom vlákne.
//
// Env: ANTHROPIC_API_KEY (voliteľné), CLAUDE_MODEL_OUTREACH (voliteľné,
//      predvolene claude-opus-5-5), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
// Čítanie odpovede modelu je na jednom mieste — pozri app/lib/ai.js.
const AI = require('../../app/lib/ai.js');
const O = require('../../app/lib/marketing/outreach.js');
const Pack = require('../../app/lib/marketing/outreach-pack.js');
const LV = require('../../app/lib/marketing/leadview.js');

/** Bežiaca zákazka najbližšie k firme (vzdušnou čiarou), keď je do `maxKm`. */
const NEAR_KM = 80;
function nearestSite(lead, sites, maxKm = NEAR_KM) {
  if (!lead || lead.lat == null || lead.lng == null) return null;
  let best = null;
  for (const s of sites || []) {
    const d = LV.km(lead, s);
    if (d != null && d <= maxKm && (!best || d < best.km)) best = { km: Math.round(d), city: String(s.site_city || '').trim() };
  }
  return best;
}
/** Slovenské písmená, ktoré nemčina nemá — v nemeckom e-maile nemajú čo robiť. */
const SLOVAK = /[čďľňŕšťžĺ]/i;

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
      subject: { type: 'string', description: 'Predmet e-mailu: konkrétny a miestny, bez otáznika, najviac 60 znakov.' },
      body: { type: 'string', description: 'Text e-mailu bez podpisu a bez pätičky (obyčajný text). Začína oslovením, končí pozdravom.' },
    },
    required: ['subject', 'body'],
  },
};

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Prompt pre model. Všetko o firme je rozdelené na to, čo smie do e-mailu
 * (nemecké remeslo, mesto, web, kategórie, popis webu) a čo je INTERNÉ
 * (prečo sme ju vybrali, poznámka k hľadaniu) — to model použije len na
 * pochopenie, nikdy necituje.
 * @param {Object} o { lead, v, step, lang, template, prev, pitch, search, near: { km, city } | null, attach }
 */
function prompt({ lead, v, step, lang, template, prev, pitch = null, search = null, near = null, attach = false }) {
  const en = lang === 'en';
  const jazyk = en ? 'po anglicky' : 'po nemecky, vykaním (Sie-Form)';
  const pozdrav = en ? 'Kind regards' : 'Mit freundlichen Grüßen';
  const w = (pitch && pitch.words) || {};
  const remeslo = w.remeslo || v.remeslo;
  const team = w.team || v.team;
  const label = w.label || (pitch && pitch.trade && pitch.trade.label) || remeslo;
  const kategorie = Array.isArray(lead.categories) ? lead.categories.map(x => clip(x, 60)).filter(Boolean).slice(0, 6) : [];
  const profil = lead.profile && typeof lead.profile === 'object' ? lead.profile : {};
  const region = (w.region || (pitch && pitch.region && pitch.region.name) || '');
  const seeds = search && Array.isArray(search.seeds) ? search.seeds : [];
  const seedText = seeds.map(s => [s.trade, ...(Array.isArray(s.keywords) ? s.keywords : [])].filter(Boolean).map(x => clip(x, 60)).join(', ')).filter(Boolean).slice(0, 4);
  const poznamka = search ? clip((search.params && search.params.note) || search.note, 300) : '';

  const oFirme = [
    `Firma: ${v.firma}`,
    v.mesto && `Mesto: ${v.mesto}`, region && `Región: ${region}`,
    `Remeslo (${en ? 'anglicky' : 'nemecky'}, použi toto označenie): ${remeslo}${label && label !== remeslo ? ` — ${label}` : ''}`,
    `Koho jej ponúkame: ${team}`,
    kategorie.length && `Kategórie z Google Máp: ${kategorie.join(', ')}`,
    lead.website && `Web: ${clip(lead.website, 120)}`,
    lead.site_title && `Titulok webu: ${clip(lead.site_title, 200)}`,
    lead.site_description && `Popis webu (ich slová o sebe — odtiaľ vezmi jeden konkrétny detail): ${clip(lead.site_description, 400)}`,
    v.konatel && `Kontaktná osoba: ${v.konatel}`,
  ].filter(Boolean).join('\n');
  const interne = [
    lead.why && `Prečo sme ju vybrali: ${clip(lead.why, 400)}`,
    profil.summary && `Profil firmy od AI pri hľadaní: ${clip(profil.summary, 400)}`,
    seedText.length && `Čo sme hľadali (remeslá a kľúčové slová zadaných webov): ${seedText.join(' | ')}`,
    poznamka && `Poznámka k hľadaniu: ${poznamka}`,
    near ? `Bežiaca zákazka do ${near.km} km od firmy${near.city ? ` (${near.city})` : ''} — smieš napísať, že v ich regióne už pracujeme; stavbu ani odberateľa nemenuj.`
      : 'V okolí firmy (do 80 km) nemáme bežiacu zákazku — nepíš, že v ich regióne už pracujeme.',
  ].filter(Boolean);

  const spolocne = `Píšeš e-mail ${jazyk} za firmu „${v.nasa_firma}" (slovenský subdodávateľ remeselníkov pre nemecké stavby: `
    + 'Werkvertrag, Abrechnung nach Stunden, A1-Bescheinigung a Freistellung nach § 48b EStG, nemecky hovoriaci koordinátor). '
    + 'Nemecké remeselné firmy oslovujeme po jednom, osobne a s rešpektom — e-mail má byť taký, na ktorý majiteľ malej firmy odpíše.\n\n'
    + `O FIRME (smie do e-mailu):\n${oFirme}\n\n`
    + `INTERNÉ (len pre tvoje pochopenie — nikdy necituj, neprekladaj do e-mailu, nespomínaj, že sme firmu „vybrali" alebo „hľadali"):\n${interne.map(x => `- ${x}`).join('\n')}\n\n`
    + (v.portfolio ? `Čo ponúkame (z našich nastavení — jediný zdroj dostupnosti a kapacít, môžeš použiť doslova):\n${v.portfolio}\n\n` : '')
    + `Vzor (štýl, štruktúra a dĺžka — nekopíruj doslova, napíš osobne pre túto firmu):\nPredmet: ${O.fillTemplate(template.subject, v)}\n${O.fillTemplate(template.body, v)}\n\n`
    + (pitch ? `Pod tvojím textom appka sama ukáže nadpis „${pitch.headline}", tieto tri body a tlačidlo:\n`
      + pitch.points.map((x, i) => `${i + 1}. ${x.title}: ${x.text}`).join('\n') + '\n'
      + 'Tieto body v texte neopakuj ani nevypisuj ako zoznam — text ich má len uviesť jednou vetou.\n\n' : '')
    + (attach ? 'K e-mailu ide príloha: krátka prezentácia PDF (prehľad remesiel, dokladov a postupu). Spomeň ju jednou vetou.\n\n'
      : 'K e-mailu nejde žiadna príloha — prílohu nespomínaj.\n\n')
    + 'PRAVIDLÁ:\n'
    + `- Začni presne oslovením „${v.oslovenie}" a skonči pozdravom „${pozdrav}". Podpis ani pätičku nepíš — pridajú sa samy.\n`
    + `- Prvá veta je o NICH: ich remeslo (${remeslo}), ich mesto alebo región a jeden konkrétny detail z ich webu alebo kategórií. Nie o nás. Žiadne „Wir sind Firma X, ein Nachunternehmer…".\n`
    + `- Jedna konkrétna ponuka: ${team} aus der Slowakei, einzeln oder als eingespieltes Team, Werkvertrag, Abrechnung nach Stunden, A1 und § 48b-Freistellung liegen vor.\n`
    + '- Výzva s dvoma konkrétnymi možnosťami: krátky telefonát v utorok alebo vo štvrtok dopoludnia, ALEBO odpoveď jedným slovom „Profile" (EN: „Profiles") — potom pošleme dva vhodné profily tímu.\n'
    + '- Nič si nevymýšľaj: žiadne ceny, počty ľudí, termíny, dostupnosť, referencie ani mená zákazníkov, ktoré nie sú v „Čo ponúkame".\n'
    + '- Nikdy nespomeň, s ktorými firmami spolupracujeme, ani interné dôvody výberu.\n'
    + (en ? '- Píš prirodzenou obchodnou angličtinou. Žiadne slovenské ani nemecké slová.\n'
      : '- Píš prirodzenou nemčinou, ako píše nemecký obchodník nemeckému remeselníkovi. Vykanie (Sie). Žiadne slovenské slová ani slovenské názvy remesiel — remeslo pomenuj len tak, ako je uvedené vyššie.\n')
    + '- Žiadne odkazy okrem tých, ktoré sú v „Čo ponúkame". Žiadne emoji, žiadny nátlak, žiadne „exkluzívne", „len dnes", „kostenlos", „unverbindlich".\n';
  if (step > 1) {
    return `${spolocne}- Toto je krátke pripomenutie (50–70 slov) k e-mailu „${prev ? prev.subject : ''}"`
      + `${prev && prev.sent_at ? ` z ${v.datum}` : ''}, na ktorý firma neodpísala. Odkáž na ten dátum, pridaj jeden nový užitočný fakt `
      + '(z „Čo ponúkame", inak: termín nástupu dohodneme záväzne po dopyte, doklady sú kompletné). Zdvorilo, bez výčitiek, rovnaká výzva s dvoma možnosťami.\n'
      + `- Predmet nechaj „${O.replySubject(prev ? prev.subject : template.subject)}".`;
  }
  return `${spolocne}- Píšeš len text e-mailu (obyčajný text, žiadne HTML, žiadne odrážky, žiadny nadpis) — rozloženie, body, tlačidlo, podpis a pätičku pridá appka.\n`
    + '- Najviac 110 slov, 3 krátke odseky (o nich; ponuka; výzva).\n'
    + `- Predmet: konkrétny a miestny, bez otáznika a bez lákania, najviac 60 znakov, napr. „${team} für Ihre Baustellen in ${v.mesto || 'Ihrer Region'}" alebo „${team} für ${v.mesto || region || 'Ihre Region'}: ${en ? 'available on short notice' : 'kurzfristig verfügbar'}" (to druhé len ak „Čo ponúkame" dostupnosť potvrdzuje).`;
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
    // Slovenské písmená v nemeckom alebo anglickom e-maile = slovenské slovo prekĺzlo (napr. názov remesla).
    if (SLOVAK.test(`${subject}\n${body}`)) return { error: 'Model použil slovenské slová — ostala šablóna.' };
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
  const [cfgQ, tplQ, histQ, simQ, siteQ] = await Promise.all([
    supabase.from('danubra_settings').select('supplier,marketing').order('created_at').limit(1),
    supabase.from('danubra_message_templates').select('key,language,channel,subject,body,active').eq('channel', 'outreach').limit(50),
    supabase.from('danubra_outreach').select('id,step,status,subject,sent_at,message_id').eq('lead_id', lead.id).is('archived_at', null),
    lead.similar_to ? supabase.from('danubra_partners').select('name').eq('id', lead.similar_to).maybeSingle() : { data: null },
    // Bežiace zákazky so súradnicami — „in Ihrer Region sind wir bereits tätig" len keď je nejaká do 80 km.
    lead.lat != null && lead.lng != null
      ? supabase.from('danubra_subcontracts').select('id,site_city,lat,lng').eq('status', 'active').not('lat', 'is', null).limit(200)
      : { data: [] },
  ]);
  const row0 = (cfgQ.data && cfgQ.data[0]) || {};
  const cfg = O.settings(row0.marketing);
  let search = null, pitch = null;
  try { const ctx = await Pack.context(supabase, lead); search = ctx.search; pitch = Pack.pitchFor({ lead, search, marketing: row0.marketing, lang }); } catch (e) { pitch = null; }
  const attach = Pack.wantsAttachment(b.attach_presentation, step, row0.marketing);
  const near = nearestSite(lead, (siteQ && siteQ.data) || []);
  const prev = step > 1 ? O.lastSent(histQ.data || []) : null;
  // Remeslo a mesto v jazyku e-mailu (pitch.js) — nie slovenský lead.trade.
  const v = O.vars(lead, { supplier: row0.supplier || {}, similarName: simQ.data && simQ.data.name, lang, portfolio: cfg.portfolio, prev,
    search, marketing: row0.marketing, attach });
  const template = O.pickTemplate(tplQ.data || [], { step, lang, key: b.template_key || '' });
  const fallback = {
    subject: step > 1 && prev ? O.replySubject(prev.subject) : O.fillTemplate(template.subject, v),
    body: O.fillTemplate(template.body, v),
  };
  const missing = O.missingVars(`${template.subject}\n${template.body}`, v);

  const ai = await askAi(prompt({ lead, v, step, lang, template, prev, pitch, search, near, attach }));
  if (ai.error) {
    return out(200, { ...fallback, source: 'template', template_key: template.key, missing,
      ai_error: ai.error === 'no_api_key' ? 'AI nie je zapnutá (chýba ANTHROPIC_API_KEY) — použila sa šablóna.' : ai.error,
      trade: pitch ? pitch.trade.key : null, headline: pitch ? pitch.headline : null });
  }
  return out(200, {
    subject: step > 1 && prev ? O.replySubject(prev.subject) : ai.subject,
    body: ai.body, source: 'ai', template_key: template.key, missing: [],
    trade: pitch ? pitch.trade.key : null, headline: pitch ? pitch.headline : null,
  });
};

exports._test = { prompt, askAi, TOOL, nearestSite, SLOVAK };
