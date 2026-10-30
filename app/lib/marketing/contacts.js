// ============================================================================
// DANUBRA — kontakty s firmami: hovory, stretnutia, poznámky a ďalší krok
// ============================================================================
// „…zaznamenať, o čom sme sa bavili, s kým a kto presne od nás. Kontaktované
// firmy treba kategorizovať a hlavne nezabudnúť na ďalší krok."
//
//   STAGES     kategória firmy (stĺpec danubra_leads.status, rozšírený v 081):
//              Nová → Oslovená → Odpísala → Má záujem → Stretnutie → Ponuka →
//              Je odberateľ; vedľa toho Ozvať sa neskôr, Nemá záujem,
//              Nedostupná, Odhlásená
//   OUTCOMES   rýchle tlačidlá po hovore (Nedvíha, Obsadené, Zavolať neskôr…)
//              a aký stav firmy z nich navrhnúť
//   validate   očistí záznam pred zápisom (server aj okno)
//   timeline   kontakty + e-maily oslovenia v jednej časovej osi
//   export     CSV firiem (stav, posledný kontakt, ďalší krok, e-maily)
//              a CSV všetkých kontaktov
//   task       úloha „Ozvať sa firme X" z ďalšieho kroku
//
// Záznam o kontakte sa po uložení nemení (ako poznámky pri kandidátovi):
// oprava je nový riadok s `corrects_id`, časová os ukáže oboje.
//
// Testy: node app/lib/marketing/contacts.test.js
// ============================================================================
(function () {
  const F = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./followup.js') : (typeof window !== 'undefined' ? window.DanubraFollowup : null);

  /** [kľúč, názov, farba, poradie v procese] — kľúče sú hodnoty danubra_leads.status. */
  const STAGES = [
    ['new', 'Nová', 'gray', 0], ['contacted', 'Oslovená', 'blue', 1], ['replied', 'Odpísala', 'amber', 2],
    ['interested', 'Má záujem', 'green', 3], ['meeting', 'Stretnutie', 'green', 4], ['offer', 'Ponuka', 'blue', 5],
    ['won', 'Je odberateľ', 'green', 6], ['later', 'Ozvať sa neskôr', 'amber', 2],
    ['rejected', 'Nemá záujem', 'red', 9], ['unreachable', 'Nedostupná', 'gray', 1], ['unsubscribed', 'Odhlásená', 'red', 9],
  ];
  const STAGE_KEYS = STAGES.map(s => s[0]);
  const stageOf = (k) => STAGES.find(s => s[0] === k) || STAGES[0];
  /** Firma, ktorej už e-maily oslovenia nepripomíname (ďalej v procese, nechce, alebo sme sa dohodli inak). */
  const NO_SEQUENCE = ['replied', 'interested', 'meeting', 'offer', 'won', 'later', 'rejected', 'unsubscribed'];

  const KINDS = [
    ['call', 'Hovor', 'phone'], ['email', 'E-mail', 'mail'], ['meeting', 'Stretnutie', 'handshake'],
    ['linkedin', 'LinkedIn', 'briefcase'], ['note', 'Poznámka', 'note'], ['other', 'Iné', 'chat'],
  ];
  const kindOf = (k) => KINDS.find(x => x[0] === k) || KINDS[KINDS.length - 1];

  /**
   * Výsledok kontaktu: [kľúč, tlačidlo, ikona, farba, navrhnutý stav, potrebuje termín, predvolený ďalší krok]
   * Predvolený krok je len návrh do formulára — človek ho vidí a môže zmeniť.
   */
  const OUTCOMES = [
    ['no_answer', 'Nedvíha', 'phone-missed', 'gray', null, false, { days: 2, text: 'Skúsiť zavolať znova' }],
    ['busy', 'Obsadené', 'phone-missed', 'gray', null, false, { days: 1, text: 'Skúsiť zavolať znova' }],
    ['callback', 'Zavolať neskôr', 'clock', 'amber', 'later', true, { days: 7, text: 'Zavolať znova, ako sme sa dohodli' }],
    ['interested', 'Má záujem', 'check', 'green', 'interested', false, { days: 2, text: 'Poslať podklady a dohodnúť ďalší krok' }],
    ['not_interested', 'Nemá záujem', 'x', 'red', 'rejected', false, null],
    ['send_offer', 'Poslať ponuku', 'doc', 'blue', 'offer', false, { days: 1, text: 'Poslať ponuku' }],
    ['meeting_set', 'Stretnutie dohodnuté', 'calendar', 'green', 'meeting', false, { days: 7, text: 'Stretnutie' }],
    ['wrong_number', 'Zlé číslo', 'alert', 'red', 'unreachable', false, { days: 1, text: 'Nájsť správne číslo (web, Impressum)' }],
    ['other', 'Iné', 'note', 'gray', null, false, null],
  ];
  const outcomeOf = (k) => OUTCOMES.find(o => o[0] === k) || null;

  const clean = (v, n = 4000) => String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, n);
  const one = (v, n = 200) => clean(v, n).replace(/\s+/g, ' ');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * Aký stav firmy navrhnúť po kontakte. Nikdy nejde späť z ďalšieho kroku
   * (Má záujem po „Nedvíha" ostáva Má záujem), Nová po prvom pokuse = Oslovená.
   */
  function suggestStage(outcome, current = 'new') {
    const o = outcomeOf(outcome);
    const want = o && o[4];
    const cur = STAGE_KEYS.includes(current) ? current : 'new';
    if (!want) return cur === 'new' ? 'contacted' : cur;
    if (['won', 'unsubscribed'].includes(cur)) return cur;
    if (want === 'rejected' || want === 'later') return want;
    // Nedostupná len vtedy, keď sme sa s firmou ešte nebavili.
    if (want === 'unreachable') return ['new', 'contacted', 'unreachable'].includes(cur) ? 'unreachable' : cur;
    return stageOf(want)[3] >= stageOf(cur)[3] || ['later', 'rejected', 'unreachable'].includes(cur) ? want : cur;
  }

  /** Predvolený ďalší krok k výsledku (dátum v pracovný deň a text). */
  function defaultNext(outcome, now = new Date()) {
    const o = outcomeOf(outcome);
    if (!o || !o[6] || !F) return null;
    return { date: F.workday(F.addDays(F.today(now), o[6].days)), text: o[6].text };
  }

  /**
   * Očistí záznam o kontakte. Bez súhrnu aj bez výsledku nemá zmysel;
   * „Zavolať neskôr" musí mať termín; termín nesmie byť v minulosti.
   * @returns {{ ok, errors: string[], row }}
   */
  function validate(x = {}, { now = new Date() } = {}) {
    const errors = [];
    const kind = KINDS.some(k => k[0] === x.kind) ? x.kind : 'call';
    const outcome = x.outcome && outcomeOf(x.outcome) ? x.outcome : null;
    const summary = clean(x.summary, 4000);
    const next = x.next_step_at ? String(x.next_step_at).slice(0, 10) : null;
    const today = F ? F.today(now) : new Date(now).toISOString().slice(0, 10);
    if (!summary && !outcome) errors.push('Napíšte, o čom ste sa bavili, alebo vyberte výsledok.');
    if (outcome === 'callback' && !next) errors.push('Pri „Zavolať neskôr" vyplňte, kedy sa máme ozvať.');
    if (next && F && !F.validDate(next)) errors.push('Termín ďalšieho kroku nie je platný dátum.');
    else if (next && next < today) errors.push('Termín ďalšieho kroku je v minulosti.');
    const happened = x.happened_at && !isNaN(Date.parse(x.happened_at)) ? new Date(x.happened_at).toISOString() : new Date(now).toISOString();
    if (Date.parse(happened) > new Date(now).getTime() + 10 * 60e3) errors.push('Kontakt nemôže byť v budúcnosti.');
    const dur = x.duration_min === '' || x.duration_min == null ? null : Math.round(Number(x.duration_min));
    if (dur != null && !(dur >= 0 && dur <= 600)) errors.push('Dĺžka hovoru má byť 0 až 600 minút.');
    const stage = x.stage && STAGE_KEYS.includes(x.stage) ? x.stage : null;
    if (x.stage && !stage) errors.push('Neznámy stav firmy.');
    const email = one(x.contact_email, 200).toLowerCase();
    return {
      ok: !errors.length, errors,
      row: {
        kind, direction: x.direction === 'in' ? 'in' : 'out', outcome,
        contact_name: one(x.contact_name, 160) || null, contact_role: one(x.contact_role, 120) || null,
        contact_phone: one(x.contact_phone, 60) || null, contact_email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null,
        summary: summary || null, happened_at: happened, duration_min: dur != null && Number.isFinite(dur) ? dur : null,
        next_step_at: next, next_step_text: next ? (one(x.next_step_text, 300) || null) : null, stage,
      },
    };
  }

  // ── Úloha z ďalšieho kroku ─────────────────────────────────────────────
  /** Úloha do danubra_tasks: pri firme, termín = ďalší krok, pre toho, kto sa s firmou bavil. */
  function task(contact = {}, lead = {}, member = null) {
    if (!contact.next_step_at) return null;
    const who = contact.contact_name ? ` (${contact.contact_name}${contact.contact_role ? `, ${contact.contact_role}` : ''})` : '';
    const what = one(contact.next_step_text, 160) || 'Ozvať sa, ako sme sa dohodli';
    const kde = lead.city ? ` · ${lead.city}` : '';
    return {
      title: `${what} — ${lead.name || 'firma'}`.slice(0, 200),
      description: [`Firma: ${lead.name || ''}${kde}${who}.`,
        contact.summary ? `Z kontaktu ${String(contact.happened_at || '').slice(0, 10)}: ${clean(contact.summary, 900)}` : '',
        lead.phone ? `Telefón: ${lead.phone}` : '', lead.email ? `E-mail: ${lead.email}` : '']
        .filter(Boolean).join('\n'),
      entity_type: 'lead', entity_id: lead.id || contact.lead_id || null, entity_label: lead.name || null,
      priority: 'normal', status: 'open', due_date: contact.next_step_at,
      assigned_to: member ? member.user_id || null : null,
      assigned_name: member ? String(member.full_name || member.email || '').trim() || null : (contact.our_member_name || null),
      source: 'lead_contact', level: 'manual', source_field: 'danubra_lead_contacts.next_step_at',
      source_key: contact.id ? `lead_contact:${contact.id}` : null,
    };
  }

  // ── Časová os ──────────────────────────────────────────────────────────
  const EV = {
    open: ['eye', 'green', 'Otvoril e-mail'], click: ['link', 'green', 'Klikol na odkaz'], reply: ['back', 'green', 'Odpovedal na e-mail'],
    bounce: ['alert', 'red', 'E-mail sa nedoručil'], unsubscribe: ['x', 'red', 'Odhlásil sa z e-mailov'],
  };

  /**
   * Kontakty a e-maily oslovenia v jednej osi, najnovšie hore. Opravy sa
   * pripnú k pôvodnému záznamu (corrections), nie ako samostatný riadok.
   * @returns {Array<{ at, type, icon, tone, title, sub, text, who, row, corrections }>}
   */
  function timeline({ contacts = [], outreach = [], events = [], members = [] } = {}) {
    const nameOf = (uid) => { const m = (members || []).find(x => x.user_id === uid || x.id === uid); return m ? (m.full_name || m.email || '') : ''; };
    const live = (contacts || []).filter(c => c && !c.archived_at);
    const fixes = new Map();
    for (const c of live.filter(c => c.corrects_id)) {
      if (!fixes.has(c.corrects_id)) fixes.set(c.corrects_id, []);
      fixes.get(c.corrects_id).push(c);
    }
    const out = [];
    for (const c of live.filter(c => !c.corrects_id)) {
      const k = kindOf(c.kind), o = outcomeOf(c.outcome);
      const s = c.stage_after && c.stage_after !== c.stage_before ? `stav: ${stageOf(c.stage_after)[1]}` : '';
      out.push({
        at: c.happened_at || c.created_at, type: 'contact', icon: o ? o[2] : k[2], tone: o ? o[3] : 'blue',
        title: `${k[1]}${c.direction === 'in' ? ' (ozvali sa oni)' : ''}${o ? ` · ${o[1]}` : ''}`,
        sub: [c.contact_name && `s ${c.contact_name}${c.contact_role ? ` (${c.contact_role})` : ''}`,
          c.our_member_name && `od nás ${c.our_member_name}`, c.duration_min ? `${c.duration_min} min` : '', s].filter(Boolean).join(' · '),
        text: c.summary || '', who: c.our_member_name || nameOf(c.created_by), row: c,
        next: c.next_step_at ? { date: c.next_step_at, text: c.next_step_text || '' } : null,
        corrections: (fixes.get(c.id) || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
      });
    }
    for (const o of (outreach || []).filter(r => r && !r.archived_at && ['sent', 'bounced', 'failed'].includes(r.status))) {
      const krok = Number(o.step) > 1 ? `Pripomenutie ${o.step - 1}` : 'Prvý e-mail';
      const pr = Array.isArray(o.attachments) && o.attachments.length ? ` · príloha: ${o.attachments.map(a => a.name).join(', ')}` : '';
      out.push({
        at: o.sent_at || o.created_at, type: 'mail', icon: o.status === 'failed' ? 'alert' : 'upload', tone: o.status === 'failed' ? 'red' : 'blue',
        title: `${o.status === 'failed' ? 'Neodišlo' : 'Odoslaný e-mail'} · ${krok}`, sub: `${o.to_email || ''}${pr}`,
        text: o.subject || '', who: nameOf(o.sent_by), row: o, next: null, corrections: [],
      });
    }
    // Udalosti: otvorenia a kliky po skupinách (inak by 12 otvorení zaplnilo os), odpoveď, nedoručené.
    const seen = new Set();
    for (const e of (events || []).filter(x => x && !x.archived_at && EV[x.type])) {
      const key = ['open', 'click'].includes(e.type) ? `${e.outreach_id}:${e.type}:${e.automated ? 1 : 0}` : e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const same = ['open', 'click'].includes(e.type)
        ? (events || []).filter(x => x.outreach_id === e.outreach_id && x.type === e.type && !!x.automated === !!e.automated) : [e];
      const first = same.reduce((a, b) => (String(b.at) < String(a.at) ? b : a), e);
      const [icon, tone, label] = EV[e.type];
      out.push({
        at: first.at, type: 'event', icon, tone: e.automated ? 'gray' : tone,
        title: `${e.automated ? `${label} (možno automaticky)` : label}${same.length > 1 ? ` · ${same.length}×` : ''}`,
        sub: e.type === 'click' && e.url ? hostPath(e.url) : (e.automated && e.auto_reason ? e.auto_reason : ''), text: '', who: '', row: e, next: null, corrections: [],
      });
    }
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }
  function hostPath(u) {
    try { const x = new URL(u); return `${x.hostname}${x.pathname !== '/' ? x.pathname : ''}`; } catch (e) { return String(u || ''); }
  }

  /** „pred 3 dňami", „dnes 14:05", „o 2 dni" — pre časovú os. */
  function relTime(iso, now = new Date()) {
    if (!iso) return '';
    const t = new Date(iso), n = new Date(now);
    if (isNaN(t)) return '';
    const day = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
    const dd = Math.round((day(t) - day(n)) / 86400e3);
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    if (dd === 0) {
      const min = Math.round((n - t) / 60e3);
      if (min >= 0 && min < 60) return min < 2 ? 'práve teraz' : `pred ${min} min`;
      return `dnes ${hm}`;
    }
    if (dd === -1) return `včera ${hm}`;
    if (dd === 1) return 'zajtra';
    if (dd < 0 && dd > -7) return `pred ${-dd} ${-dd === 1 ? 'dňom' : 'dňami'}`;
    if (dd > 0 && dd < 14) return `o ${dd} ${dd <= 4 ? 'dni' : 'dní'}`;
    return `${t.getDate()}. ${t.getMonth() + 1}. ${t.getFullYear()}`;
  }

  // ── Súhrn pre zoznam a export ──────────────────────────────────────────
  /** Posledný kontakt a najbližší otvorený ďalší krok firmy. */
  function leadSummary(lead = {}, contacts = []) {
    const list = (contacts || []).filter(c => c && c.lead_id === lead.id && !c.archived_at && !c.corrects_id)
      .sort((a, b) => String(b.happened_at || '').localeCompare(String(a.happened_at || '')));
    const last = list[0] || null;
    const next = lead.next_step_at ? { date: lead.next_step_at, text: lead.next_step_text || '' }
      : (last && last.next_step_at ? { date: last.next_step_at, text: last.next_step_text || '' } : null);
    return { count: list.length, last, next, calls: list.filter(c => c.kind === 'call').length };
  }

  /**
   * CSV firiem: kategória, posledný kontakt, ďalší krok, e-maily oslovenia.
   * @param {Object} o { leads, contacts, outreachSummary: (leadId) => summary z outreach.js, searches }
   */
  function exportLeads({ leads = [], contacts = [], outreachSummary = null, searches = [] } = {}) {
    const S = new Map((searches || []).map(s => [s.id, s]));
    const head = ['Firma', 'Mesto', 'PSČ', 'Región', 'Remeslo', 'Kategória', 'Kontaktná osoba', 'Telefón', 'E-mail', 'Web',
      'Kontaktov', 'Posledný kontakt', 'Druh', 'Výsledok', 'S kým', 'Kto od nás', 'O čom', 'Ďalší krok (dátum)', 'Ďalší krok',
      'E-mailov odoslaných', 'Otvoril', 'Klikol', 'Odpovedal', 'Nedoručené', 'Odhlásený', 'Hľadanie', 'Skóre', 'Zdroj'];
    const rows = [head];
    for (const l of leads || []) {
      if (!l || l.archived_at) continue;
      const s = leadSummary(l, contacts), c = s.last;
      const o = outreachSummary ? outreachSummary(l.id) || {} : {};
      const src = l.seed_search_id && S.get(l.seed_search_id);
      rows.push([l.name, l.city, l.postal_code, l.region, l.trade, stageOf(l.status)[1], l.contact_person, l.phone, l.email, l.website,
        s.count, c ? String(c.happened_at || '').slice(0, 16).replace('T', ' ') : (l.last_contact_at ? String(l.last_contact_at).slice(0, 16).replace('T', ' ') : ''),
        c ? kindOf(c.kind)[1] : '', c && outcomeOf(c.outcome) ? outcomeOf(c.outcome)[1] : '', c ? c.contact_name : '', c ? c.our_member_name : '',
        c ? c.summary : '', s.next ? s.next.date : '', s.next ? s.next.text : '',
        o.count || 0, o.opened ? 'áno' : '', o.clicked ? 'áno' : '', o.replied ? 'áno' : '', o.bounced ? 'áno' : '', o.unsubscribed ? 'áno' : '',
        src ? (src.params && src.params.region ? `${src.params.region} · ` : '') + (String(src.created_at || '').slice(0, 10)) : '', l.score, l.source]);
    }
    return rows;
  }

  /** CSV všetkých kontaktov (aj opráv — pri nich je, čo opravujú). */
  function exportContacts({ contacts = [], leads = [] } = {}) {
    const L = new Map((leads || []).map(l => [l.id, l]));
    const rows = [['Kedy', 'Firma', 'Mesto', 'Druh', 'Smer', 'Výsledok', 'S kým', 'Funkcia', 'Telefón', 'E-mail', 'Kto od nás',
      'O čom', 'Minút', 'Ďalší krok (dátum)', 'Ďalší krok', 'Stav pred', 'Stav po', 'Oprava záznamu z', 'Návrh AI', 'Zapísané']];
    const list = (contacts || []).filter(c => c && !c.archived_at)
      .sort((a, b) => String(b.happened_at || '').localeCompare(String(a.happened_at || '')));
    const byId = new Map(list.map(c => [c.id, c]));
    for (const c of list) {
      const l = L.get(c.lead_id) || {};
      const orig = c.corrects_id ? byId.get(c.corrects_id) : null;
      const ai = c.ai_extracted && c.ai_extracted.source ? `${c.ai_extracted.source}${c.ai_extracted.accepted === false ? ' (zmenené)' : ''}` : '';
      rows.push([String(c.happened_at || '').slice(0, 16).replace('T', ' '), l.name || '', l.city || '', kindOf(c.kind)[1], c.direction === 'in' ? 'prichádzajúci' : 'odchádzajúci',
        outcomeOf(c.outcome) ? outcomeOf(c.outcome)[1] : '', c.contact_name, c.contact_role, c.contact_phone, c.contact_email, c.our_member_name,
        c.summary, c.duration_min, c.next_step_at, c.next_step_text, c.stage_before ? stageOf(c.stage_before)[1] : '', c.stage_after ? stageOf(c.stage_after)[1] : '',
        orig ? String(orig.happened_at || '').slice(0, 16).replace('T', ' ') : '', ai, String(c.created_at || '').slice(0, 16).replace('T', ' ')]);
    }
    return rows;
  }

  // ── Rýchle akcie ───────────────────────────────────────────────────────
  /** Telefón na tel: (bez medzier), WhatsApp len pre mobil (DE 015x/016x/017x, SK 09xx). */
  function phoneLinks(phone) {
    const raw = String(phone || '').trim();
    if (!raw) return null;
    let d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('00')) d = `+${d.slice(2)}`;
    if (/^0[1-9]/.test(d)) d = `+49${d.slice(1)}`;      // nemecké číslo bez predvoľby
    const digits = d.replace(/\D/g, '');
    const mobile = /^49(15|16|17)\d{7,9}$/.test(digits) || /^4219\d{8}$/.test(digits) || /^43(6[5-9])\d{6,10}$/.test(digits);
    return { tel: `tel:${d}`, display: raw, digits, wa: mobile ? `https://wa.me/${digits}` : null, mobile };
  }

  function webUrl(w) {
    const s = String(w || '').trim();
    if (!s) return '';
    const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : ''; } catch (e) { return ''; }
  }

  function mapsUrl(lead = {}) {
    const ds = lead.data_source || {};
    if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\//i.test(ds.maps_url || '')) return ds.maps_url;
    const q = [lead.name, lead.address, lead.postal_code, lead.city].filter(Boolean).join(', ');
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
  }

  const API = { STAGES, STAGE_KEYS, NO_SEQUENCE, KINDS, OUTCOMES, stageOf, kindOf, outcomeOf, suggestStage, defaultNext, validate,
    task, timeline, relTime, leadSummary, exportLeads, exportContacts, phoneLinks, webUrl, mapsUrl, esc };
  if (typeof window !== 'undefined') window.DanubraContacts = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
