// ============================================================================
// DANUBRA — kontakty s firmou: rýchle akcie, záznam hovoru, ďalší krok, os
// ============================================================================
// „Treba tam rýchle tlačidlá (kým nemáme VoIP číslo) a možnosť zaznamenať,
// o čom sme sa bavili, s kým a kto presne od nás… a hlavne nezabudnúť na
// ďalší krok."
//
// Samostatný komponent — vloží sa do detailu firmy jedným volaním:
//
//   LeadContacts.mount(el, lead, { onChange(lead) {…} })
//
//   hlavička     kategória firmy (zmena jedným výberom) a dohodnutý ďalší krok
//   rýchle akcie Zavolať (tel:), Kopírovať číslo, E-mail, WhatsApp (len
//                mobil), Otvoriť web, Google Mapy
//   Idem volať   panel pred hovorom (lib/marketing/callsheet.js): koho pýtať,
//                čo povedať po nemecky (úvod, hák, ponuka, otázka, záver),
//                časté námietky, bežiace stopky; „Hovor skončil" zastaví
//                stopky a otvorí záznam s dĺžkou hovoru. Nič sa nenahráva —
//                panel to aj pripomína (bez súhlasu je to v SR a DE trestné).
//   po hovore    Nedvíha · Obsadené · Zavolať neskôr · Má záujem · Nemá
//                záujem · Poslať ponuku · Stretnutie dohodnuté · Zlé číslo →
//                krátky formulár: s kým, kto od nás, o čom, ďalší krok
//   dotazník     „Čo sme sa dozvedeli" v zázname hovoru — klikaním (správna
//                osoba, subdodávatelia, remeslá, koľko ľudí a odkedy, stavby,
//                dosť ľudí, záujem 1–5, čo poslať, kedy sa ozvať). Odpovede
//                sa skladajú do súhrnu v bodoch a navrhnú výsledok hovoru;
//                uložia sa aj štruktúrovane (ai_extracted.answers). Kto
//                radšej píše, dotazník skryje a napíše text.
//   AI návrh     po napísaní textu server (danubra-lead-contact) navrhne
//                termín a text ďalšieho kroku — ukáže sa ako ponuka, ktorú
//                treba prijať; AI nič neuloží sama
//   časová os    kontakty a e-maily oslovenia (odoslané, otvoril, klikol,
//                odpovedal, nedoručené), najnovšie hore; oprava záznamu je
//                nový záznam pod pôvodným
//   export       LeadContacts.exportLeads(leads) a exportContacts() — CSV
//                pre Excel (bodkočiarka, BOM), rovnako ako zoznamy
//
// Zapisuje len server (kontakt, úloha, kategória firmy) — v prehliadači
// nie je kľúč k AI ani nič, čo by obišlo práva.
// ============================================================================
(function () {
  const C = () => window.DanubraContacts;
  const F = () => window.DanubraFollowup;
  const CS = () => window.DanubraCallsheet;
  const FN = '/.netlify/functions/danubra-lead-contact';
  const esc = (s) => (window.UI ? UI.esc(s) : String(s == null ? '' : s));
  const ico = (n, s = 14) => (window.Icon ? Icon(n, s) : '');
  const instances = new Map();
  let seq = 0;

  async function call(body) {
    const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) { data = { error: 'Server neodpovedal.' }; }
    if (!res.ok || data.error) { const e = new Error(data.error || `Chyba ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  // ── Štýly (raz, pri prvom vložení) ─────────────────────────────────────
  const CSS = `
.lc{display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--ink);}
.lc-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}
.lc-stage{display:inline-flex;align-items:center;gap:6px;}
.lc-stage select{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);color:var(--ink);}
.lc-next{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:var(--radius);background:var(--amber-50);color:var(--amber);font-weight:600;font-size:12.5px;}
.lc-next.is-due{background:var(--red-50);color:var(--red);}
.lc-quick{display:flex;flex-wrap:wrap;gap:6px;}
.lc-quick .link-chip{cursor:pointer;}
.lc-quick button.link-chip{font:inherit;font-size:12.5px;}
.lc-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-sub);margin:2px 0 -4px;}
.lc-outs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}
.lc-oc{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;min-height:38px;}
.lc-oc:hover{border-color:var(--brand);background:var(--brand-50);}
.lc-oc.is-on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);background:var(--brand-50);}
.lc-oc .ico{flex:none;}
.lc-oc.t-green .ico{color:var(--green);} .lc-oc.t-red .ico{color:var(--red);} .lc-oc.t-amber .ico{color:var(--amber);} .lc-oc.t-blue .ico{color:var(--blue);} .lc-oc.t-gray .ico{color:var(--ink-mute);}
.lc-more{display:flex;flex-wrap:wrap;gap:6px;}
.lc-form{border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px;background:var(--bg);display:flex;flex-direction:column;gap:10px;}
.lc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;}
.lc-grid .fld{margin:0;} .lc-full{grid-column:1/-1;}
.lc-sug{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border:1px dashed var(--brand);border-radius:var(--radius);background:var(--brand-50);font-size:12.5px;}
.lc-sug b{color:var(--ink);} .lc-sug small{color:var(--ink-sub);flex-basis:100%;}
.lc-sug .ico{color:var(--brand);}
.lc-sug.is-wait{border-style:dotted;background:var(--card);color:var(--ink-sub);}
.lc-acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
.lc-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
.lc-it{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:9px 0;border-top:1px solid var(--border-soft);}
.lc-it:first-child{border-top:0;}
.lc-dot{width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink-sub);}
.lc-dot.t-green{background:var(--green-50);color:var(--green);} .lc-dot.t-red{background:var(--red-50);color:var(--red);}
.lc-dot.t-amber{background:var(--amber-50);color:var(--amber);} .lc-dot.t-blue{background:var(--blue-50);color:var(--blue);}
.lc-t1{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;}
.lc-t1 b{font-size:13px;} .lc-t1 time{font-size:11.5px;color:var(--ink-mute);margin-left:auto;white-space:nowrap;}
.lc-sub{font-size:12px;color:var(--ink-sub);margin-top:1px;}
.lc-txt{margin-top:4px;white-space:pre-wrap;line-height:1.5;}
.lc-fix{margin-top:6px;padding:6px 8px;border-left:2px solid var(--amber);background:var(--amber-50);font-size:12.5px;white-space:pre-wrap;}
.lc-fix small{display:block;color:var(--ink-sub);}
.lc-nx{display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:12px;font-weight:600;color:var(--amber);}
.lc-lnk{background:none;border:0;padding:0;font:inherit;font-size:11.5px;color:var(--ink-sub);text-decoration:underline;cursor:pointer;}
.lc-lnk:hover{color:var(--brand);}
.lc-empty{color:var(--ink-sub);font-size:12.5px;padding:6px 0;}
.lc-call{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}
.lc-call .btn-primary{font-size:13.5px;padding:9px 16px;}
.lc-call small{color:var(--ink-sub);font-size:12px;}
.lc-sheet{border:1px solid var(--brand);border-radius:var(--radius-lg);padding:12px 14px;background:var(--card);display:flex;flex-direction:column;gap:10px;}
.lc-sheet-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 16px;align-items:start;}
.lc-ask{display:flex;flex-direction:column;gap:4px;font-size:13px;}
.lc-ask b{font-size:14px;} .lc-ask small{color:var(--ink-sub);font-size:12px;}
.lc-ask .lc-quick{margin-top:2px;}
.lc-timerbox{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.lc-timer{font-variant-numeric:tabular-nums;font-size:26px;font-weight:700;letter-spacing:.02em;color:var(--ink);line-height:1;}
.lc-timer.is-done{color:var(--ink-sub);}
.lc-timerbox .btn{white-space:nowrap;}
.lc-warn{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius);background:var(--amber-50);color:var(--amber);font-size:12.5px;font-weight:600;}
.lc-script{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;counter-reset:lc;}
.lc-script li{position:relative;padding:8px 10px 8px 34px;border:1px solid var(--border-soft);border-radius:var(--radius);background:var(--bg);counter-increment:lc;}
.lc-script li::before{content:counter(lc);position:absolute;left:10px;top:9px;width:18px;height:18px;border-radius:9px;background:var(--brand);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.lc-script li:last-child:nth-child(odd){grid-column:1/-1;}
.lc-sc-t{display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-sub);}
.lc-sc-de{margin:3px 0 2px;font-size:13.5px;line-height:1.45;color:var(--ink);}
.lc-sc-sk{display:block;font-size:11.5px;color:var(--ink-sub);line-height:1.4;}
.lc-obj{border:1px solid var(--border-soft);border-radius:var(--radius);background:var(--bg);padding:0 10px;}
.lc-obj summary{cursor:pointer;padding:8px 0;font-weight:600;font-size:12.5px;color:var(--ink);}
.lc-obj dl{margin:0 0 8px;display:flex;flex-direction:column;gap:8px;}
.lc-obj dt{font-weight:600;font-size:13px;color:var(--red);}
.lc-obj dd{margin:2px 0 0;font-size:13px;line-height:1.45;} .lc-obj dd small{display:block;color:var(--ink-sub);font-size:11.5px;}
.lc-obj ul{margin:0 0 8px;padding-left:18px;font-size:12.5px;line-height:1.6;}
.lc-quiz{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;padding:10px;border:1px dashed var(--border);border-radius:var(--radius);background:var(--card);}
.lc-q{display:flex;flex-direction:column;gap:5px;min-width:0;} .lc-q.lc-full{grid-column:1/-1;}
.lc-q-l{font-size:12px;font-weight:600;color:var(--ink);} .lc-q-l small{font-weight:400;color:var(--ink-sub);}
.lc-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center;}
.lc-chip{font:inherit;font-size:12.5px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;background:var(--field);color:var(--ink);cursor:pointer;line-height:1.3;}
.lc-chip:hover{border-color:var(--brand);} .lc-chip.is-on{border-color:var(--brand);background:var(--brand-50);color:var(--brand-dark);font-weight:600;box-shadow:inset 0 0 0 1px var(--brand);}
.lc-chip.is-scale{min-width:34px;text-align:center;padding:4px 0;}
.lc-q input,.lc-q textarea{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);color:var(--ink);width:100%;box-sizing:border-box;}
.lc-q input.lc-num{width:76px;} .lc-q input.lc-free{flex:1 1 140px;min-width:0;width:auto;}
.lc-sub{min-width:0;}
.lc-q-sub{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.lc-quizhead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;grid-column:1/-1;}
.lc-quizhead b{font-size:12.5px;}
.lc-autoout{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12.5px;color:var(--ink-sub);grid-column:1/-1;}
.lc-autoout b{color:var(--ink);}
@media (max-width:560px){.lc-outs{grid-template-columns:repeat(2,minmax(0,1fr));}.lc-grid{grid-template-columns:1fr;}.lc-t1 time{margin-left:0;flex-basis:100%;}
  .lc-sheet-top{grid-template-columns:1fr;}.lc-timerbox{flex-direction:row;align-items:center;justify-content:space-between;}.lc-script{grid-template-columns:1fr;}.lc-script li:last-child:nth-child(odd){grid-column:auto;}
  .lc-quiz{grid-template-columns:1fr;}.lc-q-sub{grid-template-columns:1fr;}}
`;
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('lc-css')) return;
    const st = document.createElement('style');
    st.id = 'lc-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── Pomocné ────────────────────────────────────────────────────────────
  const members = () => ((window.Danubra && Danubra.members) || []).filter(m => m && m.active !== false && (m.full_name || m.email));
  const meOf = () => (window.Danubra && Danubra.me) || null;
  const nowLocal = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const dateLabel = (d) => (F() ? F().label(d) : d);

  class Inst {
    constructor(el, lead, opts) {
      this.id = `lc${++seq}`; this.el = el; this.lead = lead || {}; this.opts = opts || {};
      this.contacts = []; this.outreach = []; this.events = []; this.missing = false;
      this.form = null; this.sug = null; this.sugState = ''; this._t = null; this._sugFor = '';
      // „Idem volať": { startedAt, sec, done } a stopky; dotazník po hovore: odpovede.
      this.sheet = null; this._tick = null; this.answers = null; this._manual = false;
      el.dataset.lc = this.id;
      // Pri opätovnom vložení do toho istého prvku reaguje len posledný komponent.
      const mine = (f) => (e) => { if (el.dataset.lc === this.id) f(e); };
      el.addEventListener('click', mine((e) => this.onClick(e)));
      el.addEventListener('change', mine((e) => this.onChange(e)));
      el.addEventListener('input', mine((e) => this.onInput(e)));
      el.addEventListener('focusout', mine((e) => { if (e.target && e.target.name === 'summary') this.askSuggest(true); }));
    }

    async load() {
      const id = this.lead.id;
      const O = window.Outreach;
      const [c, o, e] = await Promise.all([
        DB.list('lead_contacts', { filters: { lead_id: id }, order: { column: 'happened_at', ascending: false }, limit: 500 }),
        O && O.loaded ? { data: O.ofLead(id) } : DB.list('outreach', { filters: { lead_id: id }, limit: 100 }),
        O && O.loaded ? { data: (O.events || []).filter(x => x.lead_id === id) } : DB.list('outreach_events', { filters: { lead_id: id }, limit: 1000 }),
      ]);
      // Bez migrácie 081 tabuľka nie je — rýchle akcie a e-maily fungujú ďalej.
      this.missing = !!(c && c.error);
      this.contacts = (c && c.data) || [];
      this.outreach = (o && o.data) || [];
      this.events = (e && e.data) || [];
    }

    // ── Vykreslenie ─────────────────────────────────────────────────────
    render() {
      const l = this.lead;
      const ph = C().phoneLinks(l.phone);
      const web = C().webUrl(l.website);
      const maps = C().mapsUrl(l);
      const st = C().stageOf(l.status);
      const today = F() ? F().today() : '';
      const next = l.next_step_at ? `<span class="lc-next${String(l.next_step_at) <= today ? ' is-due' : ''}" title="${esc(l.next_step_text || '')}">${ico('flag', 13)} Ďalší krok ${esc(dateLabel(String(l.next_step_at).slice(0, 10)))}${l.next_step_text ? ` · ${esc(l.next_step_text)}` : ''}</span>` : '';
      const chip = (href, icon, label, attrs = '') => `<a class="link-chip" href="${esc(href)}"${attrs}>${ico(icon, 13)}<span>${esc(label)}</span></a>`;
      const quick = [
        ph ? chip(ph.tel, 'phone', 'Zavolať', ` data-lc-a="call" title="${esc(ph.display)}"`) : '',
        ph ? `<button type="button" class="link-chip" data-lc-a="copy">${ico('copy', 13)}<span>Kopírovať číslo</span></button>` : '',
        l.email ? chip(`mailto:${l.email}`, 'mail', 'E-mail') : '',
        ph && ph.wa ? chip(ph.wa, 'whatsapp', 'WhatsApp', ' target="_blank" rel="noopener"') : '',
        web ? chip(web, 'site', 'Otvoriť web', ' target="_blank" rel="noopener"') : '',
        maps ? chip(maps, 'pin', 'Google Mapy', ' target="_blank" rel="noopener"') : '',
      ].filter(Boolean).join('');
      const tip = (t) => (window.UI ? UI.tip(t) : '');
      this.el.innerHTML = `<div class="lc">
        <div class="lc-head">
          <label class="lc-stage">${UI.badge(st[1], st[2])}<select data-lc-a="stage" aria-label="Kategória firmy">
            ${C().STAGES.map(([k, lbl]) => `<option value="${k}"${k === (l.status || 'new') ? ' selected' : ''}>${esc(lbl)}</option>`).join('')}
          </select></label>${tip('Kategória firmy — kde s ňou sme. Zmena sa zapíše do histórie. Nemá záujem a Ozvať sa neskôr zastavia pripomínanie e-mailom.')}
          ${next}
        </div>
        ${quick ? `<div class="lc-quick">${quick}</div>` : '<div class="lc-empty">Firma nemá telefón, e-mail ani web.</div>'}
        <div class="lc-callwrap">${this.callHtml()}</div>
        ${this.missing ? `<div class="notebox">${ico('alert', 14)} Záznamy kontaktov ešte nie sú pripravené v databáze (migrácia 081). Rýchle akcie a e-maily fungujú.</div>` : `
        <div class="lc-sec">Po hovore${tip('Kliknite, ako hovor dopadol — otvorí sa krátky záznam s výsledkom a dotazníkom „Čo sme sa dozvedeli". Ďalší krok sa zapíše ako úloha v Úlohách, aby sa naň nezabudlo.')}</div>
        <div class="lc-outs">${C().OUTCOMES.filter(o => o[0] !== 'other').map(o => `<button type="button" class="lc-oc t-${o[3]}${this.form && this.form.outcome === o[0] ? ' is-on' : ''}" data-lc-a="out" data-v="${o[0]}">${ico(o[2], 15)}<span>${esc(o[1])}</span></button>`).join('')}</div>
        <div class="lc-more">${C().KINDS.filter(k => k[0] !== 'call').map(k => `<button type="button" class="btn btn-ghost btn-sm" data-lc-a="kind" data-v="${k[0]}">${ico(k[2], 13)} ${esc(k[1])}</button>`).join('')}</div>
        <div class="lc-formwrap">${this.form ? this.formHtml() : ''}</div>`}
        <div class="lc-sec">História${tip('Kontakty s firmou a e-maily oslovenia, najnovšie hore. Záznam sa po uložení nemení — opravu pridáte ako nový záznam.')}</div>
        ${this.timelineHtml()}
      </div>`;
    }

    // ── „Idem volať" ────────────────────────────────────────────────────
    /** Ťahák k hovoru z lib/marketing/callsheet.js (remeslo a región firmy, texty z Nastavení). */
    sheetData() {
      if (!CS()) return null;
      const L = window.Lead;
      const search = L && Array.isArray(L.searches) ? L.searches.find(s => s.id === this.lead.seed_search_id) || null : null;
      const cfg = (s) => (window.Danubra && Danubra.cfg ? Danubra.cfg(s) : null);
      const me = meOf();
      return CS().callsheet(this.lead, { search, marketing: cfg('marketing'), supplier: cfg('supplier'), contacts: this.contacts,
        caller: me ? (me.full_name || '') : '' });
    }
    mmss(sec) { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    elapsed() { return this.sheet ? (this.sheet.done ? this.sheet.sec : (Date.now() - this.sheet.startedAt) / 1000) : 0; }

    callHtml() {
      const tip = (t) => (window.UI ? UI.tip(t) : '');
      if (!this.sheet) {
        return `<div class="lc-call"><button type="button" class="btn btn-primary" data-lc-a="sheet">${ico('phone', 15)} Idem volať</button>
          <small>Koho pýtať, čo povedať po nemecky, stopky a po hovore krátky dotazník.</small>${tip('Otvorí ťahák k hovoru: koho si pýtať, čo povedať (nemecké vety na prečítanie), časté námietky a stopky. Po „Hovor skončil" sa otvorí záznam s dĺžkou hovoru a dotazníkom „Čo sme sa dozvedeli". Hovor sa nenahráva.')}</div>`;
      }
      const d = this.sheetData();
      const a = d ? d.askFor : { hint: 'Pýtajte si Bauleiter alebo Inhaber.', phone: null, last: null, name: '' };
      const tm = `<span class="lc-timer${this.sheet.done ? ' is-done' : ''}" data-lc-timer aria-live="off">${this.mmss(this.elapsed())}</span>`;
      const btns = this.sheet.done
        ? `<small>Hovor trval ${this.mmss(this.sheet.sec)} — dĺžka je v zázname nižšie.</small><button type="button" class="btn btn-ghost btn-sm" data-lc-a="sheet">${ico('phone', 13)} Volám znova</button>`
        : `<button type="button" class="btn btn-primary btn-sm" data-lc-a="callend">${ico('stop', 13)} Hovor skončil</button><button type="button" class="lc-lnk" data-lc-a="sheetclose">Zavrieť bez záznamu</button>`;
      const who = a.name ? `<b>${esc(a.name)}</b><small>${esc(a.hint)}</small>` : `<b>Bauleiter alebo Inhaber</b><small>${esc(a.hint)}</small>`;
      const last = a.last ? `<small>Naposledy ste hovorili s ${esc(a.last.name)}${a.last.role ? ` (${esc(a.last.role)})` : ''} · ${esc(C().relTime(a.last.at))}</small>` : '';
      const phone = a.phone ? `<div class="lc-quick"><a class="link-chip" href="${esc(a.phone.tel)}" data-lc-a="call">${ico('phone', 13)}<span>${esc(a.phone.display)}</span></a>
          <button type="button" class="link-chip" data-lc-a="copy">${ico('copy', 13)}<span>Kopírovať</span></button></div>` : '<small>Firma nemá telefón — nájdite ho na webe (Impressum).</small>';
      const script = d ? `<ol class="lc-script">${d.script.map(s => `<li><span class="lc-sc-t">${esc(s.title)}</span><p class="lc-sc-de" lang="de">${esc(s.de)}</p><small class="lc-sc-sk">${esc(s.sk)}</small></li>`).join('')}</ol>` : '';
      const obj = d ? `<details class="lc-obj"><summary>Časté námietky a odpovede (${d.objections.length})</summary><dl>${d.objections.map(o => `<dt lang="de">„${esc(o.q)}"</dt><dd lang="de">${esc(o.a)}${o.sk ? `<small lang="sk">${esc(o.sk)}</small>` : ''}</dd>`).join('')}</dl></details>` : '';
      const ask = d ? `<details class="lc-obj"><summary>Čo zistiť (dotazník po hovore)</summary><ul>${d.questions.filter(q => q.key !== 'note').map(q => `<li>${esc(q.label)}</li>`).join('')}</ul></details>` : '';
      return `<div class="lc-sheet" data-lc-sheet="1">
        <div class="lc-sheet-top">
          <div class="lc-ask"><span class="lc-sec">Koho pýtať</span>${who}${last}${phone}</div>
          <div class="lc-timerbox">${tm}${btns}</div>
        </div>
        <div class="lc-warn">${ico('alert', 14)} Hovor nenahrávajte bez súhlasu druhej strany.</div>
        <div class="lc-sec">Čo povedať${tip('Nemecké vety sú na prečítanie (vykanie), slovenský riadok pod nimi je pokyn pre Vás. Texty vychádzajú z toho, čo firme píšeme v e-maile a prezentácii, a z Nastavení oslovovania — ceny ani počty ľudí sa do telefónu nevymýšľajú.')}</div>
        ${script}${obj}${ask}
      </div>`;
    }
    rerenderCall() { const w = this.el.querySelector('.lc-callwrap'); if (w) w.innerHTML = this.callHtml(); }

    openSheet() {
      if (this.sheet && !this.sheet.done) return;
      this.sheet = { startedAt: Date.now(), sec: 0, done: false };
      this.stopTimer();
      this._tick = setInterval(() => {
        const t = this.el.querySelector('[data-lc-timer]');
        if (!t || !document.body.contains(this.el) || this.el.dataset.lc !== this.id) return this.stopTimer();
        t.textContent = this.mmss(this.elapsed());
      }, 1000);
      this.rerenderCall();
    }
    stopTimer() { if (this._tick) { clearInterval(this._tick); this._tick = null; } }
    closeSheet() { this.stopTimer(); this.sheet = null; this.rerenderCall(); }
    /** „Hovor skončil": stopky stoja, otvorí sa záznam hovoru s dĺžkou a dotazníkom. */
    callEnd() {
      if (!this.sheet) return;
      const sec = this.elapsed();
      this.stopTimer();
      this.sheet = { ...this.sheet, sec, done: true };
      this.rerenderCall();
      if (this.missing) return;
      this.open('call', null);
      this.form.duration_min = Math.max(1, Math.round(sec / 60));
      const inp = this.el.querySelector('[name=duration_min]');
      if (inp) inp.value = this.form.duration_min;
    }

    // ── Dotazník po hovore ──────────────────────────────────────────────
    quizHtml() {
      const f = this.form, a = this.answers || {};
      const Q = CS() ? CS().QUESTIONS : [];
      const on = (k, v) => (Array.isArray(a[k]) ? a[k].includes(v) : a[k] != null && String(a[k]) === String(v));
      const chip = (q, [v, lbl], extra = '') => `<button type="button" class="lc-chip${extra}${on(q.key, v) ? ' is-on' : ''}" data-lc-a="q" data-k="${esc(q.key)}" data-t="${esc(q.type)}" data-v="${esc(v)}">${esc(lbl)}</button>`;
      const inp = (k, ph, cls = '', val = a[k]) => `<input type="text" data-lc-q="${esc(k)}" class="${cls}" value="${esc(val == null ? '' : val)}" placeholder="${esc(ph)}" autocomplete="off">`;
      const rows = Q.map(q => {
        let body = '';
        if (q.type === 'one' || q.type === 'scale') {
          body = `<div class="lc-chips">${q.options.map(o => chip(q, o, q.type === 'scale' ? ' is-scale' : '')).join('')}${q.free ? inp(q.key, q.placeholder, 'lc-free') : ''}</div>`;
          if (q.sub) body += `<div class="lc-q-sub" data-lc-sub="${esc(q.key)}:${esc(q.sub.when)}"${a[q.key] === q.sub.when ? '' : ' hidden'}>${q.sub.fields.map(([k, ph]) => inp(k, ph)).join('')}</div>`;
        } else if (q.type === 'many') {
          body = `<div class="lc-chips">${q.options.map(o => chip(q, o)).join('')}${q.other ? inp(q.other, 'iné', 'lc-free') : ''}</div>`;
        } else if (q.type === 'number') {
          body = `<div class="lc-chips"><input type="number" data-lc-q="${esc(q.key)}" class="lc-num" min="${q.min}" max="${q.max}" value="${esc(a[q.key] == null ? '' : a[q.key])}" placeholder="${esc(q.placeholder)}">${q.with ? q.with.options.map(o => chip({ key: q.with.key, type: 'one' }, o)).join('') : ''}</div>`;
        } else if (q.type === 'textarea') {
          body = `<textarea data-lc-q="${esc(q.key)}" rows="2" placeholder="${esc(q.placeholder)}">${esc(a[q.key] || '')}</textarea>`;
        } else body = inp(q.key, q.placeholder);
        const full = ['trades', 'send', 'callback_when', 'note'].includes(q.key);
        return `<div class="lc-q${full ? ' lc-full' : ''}"><span class="lc-q-l">${esc(q.label)}${q.hint ? ` <small>${esc(q.hint)}</small>` : ''}</span>${body}</div>`;
      }).join('');
      return `<div class="lc-quiz" data-lc-quiz="1">
        <div class="lc-quizhead"><b>${ico('note', 13)} Čo sme sa dozvedeli</b><button type="button" class="lc-lnk" data-lc-a="quiz" data-v="off">Radšej napíšem text</button></div>
        ${rows}
        <div class="lc-autoout">${this.autoOutHtml()}</div>
      </div>`;
    }
    /** „Z odpovedí vychádza: Má záujem" — a keď človek vybral iný výsledok, ponuka prepnúť. */
    autoOutHtml() {
      const f = this.form;
      if (!f || !f.quiz) return '';
      const o = C().outcomeFromAnswers(this.answers);
      if (!o) return '<span>Výsledok hovoru vyplynie z odpovedí (záujem, čo poslať, kedy sa ozvať) — alebo ho vyberte tlačidlom hore.</span>';
      const lbl = C().outcomeOf(o)[1];
      if (f.outcome === o) return `<span>Z odpovedí vychádza výsledok <b>${esc(lbl)}</b>.</span>`;
      return `<span>Z odpovedí vychádza <b>${esc(lbl)}</b>${f.outcome ? `, vybrali ste ${esc(C().outcomeOf(f.outcome)[1])}` : ''}.</span>
        <button type="button" class="btn btn-outline btn-sm" data-lc-a="useout" data-v="${esc(o)}">${ico('check', 13)} Použiť ${esc(lbl)}</button>`;
    }

    /** Zmena odpovede: súhrn v bodoch do textu (kým ho človek sám neprepísal), výsledok, návrh ďalšieho kroku. */
    answer(k, v) {
      if (!this.form) return;
      if (!this.answers) this.answers = {};
      this.answers[k] = v;
      const sub = this.el.querySelector(`[data-lc-sub^="${k}:"]`);
      if (sub) sub.hidden = String(v) !== sub.dataset.lcSub.split(':')[1];
      this.syncQuiz();
    }
    syncQuiz() {
      const f = this.form;
      if (!f || !f.quiz) return;
      this.readForm();
      const text = this.composed();
      const ta = this.el.querySelector('[name=summary]');
      if (ta && !this._manual) { ta.value = text; f.summary = text; ta.rows = Math.min(12, Math.max(3, text.split("\n").length)); }
      // Výsledok z odpovedí — kým človek nevybral vlastný tlačidlom.
      const o = C().outcomeFromAnswers(this.answers);
      if (!f.outcomeByUser && o !== f.outcome) this.setOutcome(o, false);
      const w = this.el.querySelector('.lc-autoout');
      if (w) w.innerHTML = this.autoOutHtml();
      // „Nesprávna osoba, rozhoduje X" → ďalší krok smeruje na X.
      const a = this.answers || {};
      if (a.right_person === 'no' && a.decider_name && this.sug && this.sug.source === 'default') {
        this.sug.next_step_text = `Zavolať: ${a.decider_name}${a.decider_role ? ` (${a.decider_role})` : ''}`; this.rerenderSug();
      }
      clearTimeout(this._t);
      this._t = setTimeout(() => this.askSuggest(false), 900);
    }
    /** Výsledok hovoru vo formulári (z tlačidla alebo z odpovedí) + predvolený ďalší krok k nemu. */
    setOutcome(outcome, byUser) {
      const f = this.form;
      if (!f) return;
      f.outcome = outcome || null;
      if (byUser) f.outcomeByUser = true;
      this.el.querySelectorAll('.lc-oc').forEach(b => b.classList.toggle('is-on', !!(f.outcome && f.outcome === b.dataset.v)));
      const o = f.outcome ? C().outcomeOf(f.outcome) : null, k = C().kindOf(f.kind);
      const h = this.el.querySelector('[data-lc-form] > b');
      if (h) h.innerHTML = `${ico(o ? o[2] : k[2], 14)} ${esc(k[1])}${o ? ` · ${esc(o[1])}` : ''}`;
      const ao = this.el.querySelector('.lc-autoout');
      if (ao) ao.innerHTML = this.autoOutHtml();
      const st = this.el.querySelector('[name=stage]');
      if (st && !f.stageByUser) st.value = f.outcome ? C().suggestStage(f.outcome, this.lead.status) : (this.lead.status === 'new' ? 'contacted' : this.lead.status || 'new');
      if (!this.sug || this.sug.source === 'default') {
        const d = f.outcome ? C().defaultNext(f.outcome) : null;
        this.sug = d ? { next_step_at: d.date, next_step_text: d.text, source: 'default', stage_suggestion: C().suggestStage(f.outcome, this.lead.status), note: 'predvolené k výsledku' } : null;
        this.sugState = this.sug ? 'ok' : '';
        this._sugFor = '';
        this.rerenderSug();
      }
    }

    formHtml() {
      const f = this.form, l = this.lead;
      const ms = members();
      const me = meOf();
      const who = f.our_member_id || (me && me.id) || (ms[0] && ms[0].id) || '';
      const opts = ms.length ? ms.map(m => [m.id, m.full_name || m.email]) : [['', (me && (me.full_name || me.email)) || 'Ja']];
      const o = f.outcome ? C().outcomeOf(f.outcome) : null;
      const k = C().kindOf(f.kind);
      const stage = f.stage || (f.outcome ? C().suggestStage(f.outcome, l.status) : (l.status === 'new' ? 'contacted' : l.status || 'new'));
      const quizOn = f.kind === 'call' && !!CS();
      return `<form class="lc-form" data-lc-form="1" onsubmit="event.preventDefault()">
        <b>${ico(o ? o[2] : k[2], 14)} ${esc(k[1])}${o ? ` · ${esc(o[1])}` : ''}</b>
        ${quizOn ? (f.quiz ? this.quizHtml() : `<div class="lc-quizhead"><span></span><button type="button" class="lc-lnk" data-lc-a="quiz" data-v="on">Vyplniť dotazník klikaním</button></div>`) : ''}
        <div class="lc-grid">
          ${UI.field('contact_name', 'S kým', { value: f.contact_name, placeholder: 'meno' })}
          ${UI.field('contact_role', 'Funkcia', { value: f.contact_role, placeholder: 'napr. Bauleiter, Inhaber' })}
          ${UI.field('our_member_id', 'Kto od nás', { value: who, options: opts, tip: 'Kto sa s firmou bavil. Úloha s ďalším krokom bude jeho.' })}
          ${UI.field('happened_at', 'Kedy', { type: 'datetime-local', value: f.happened_at })}
          ${f.kind === 'call' ? '' : UI.field('direction', 'Kto koho', { value: f.direction || 'out', options: [['out', 'My sme kontaktovali firmu'], ['in', 'Firma sa ozvala nám']] })}
          ${f.kind === 'call' ? UI.field('duration_min', 'Dĺžka (min)', { type: 'number', value: f.duration_min || '', placeholder: 'nepovinné' }) : ''}
          <div class="lc-full">${UI.field('summary', 'O čom sme sa bavili', { type: 'textarea', rows: 3, value: f.summary,
            placeholder: 'napr. Bauleiter Müller: teraz nič, ozvite sa o 2–3 týždne, plánujú Trockenbau v Augsburgu od marca',
            tip: 'Píšte po slovensky alebo po nemecky. Keď spomeniete termín („o 2 týždne", „v marci", „nach Ostern"), appka navrhne ďalší krok.' })}</div>
          <div class="lc-full lc-sugwrap">${this.sugHtml()}</div>
          ${UI.field('next_step_at', `Ďalší krok — kedy${o && o[5] ? ' *' : ''}`, { type: 'date', value: f.next_step_at || '', tip: 'Termín ďalšieho kroku. Vznikne úloha v Úlohách na tento deň.' })}
          ${UI.field('next_step_text', 'Ďalší krok — čo', { value: f.next_step_text || '', placeholder: 'napr. Zavolať p. Müllerovi' })}
          ${UI.field('stage', 'Kategória firmy', { value: stage, options: C().STAGES.map(s => [s[0], s[1]]) })}
          ${UI.field('create_task', 'Vytvoriť úlohu v Úlohách', { type: 'checkbox', value: f.create_task !== false })}
        </div>
        <div class="lc-acts">
          <button type="button" class="btn btn-ghost btn-sm" data-lc-a="cancel">Zrušiť</button>
          <button type="button" class="btn btn-primary btn-sm" data-lc-a="save">${ico('check', 14)} Uložiť záznam</button>
        </div>
      </form>`;
    }

    sugHtml() {
      if (this.sugState === 'wait') return `<div class="lc-sug is-wait">${ico('spark', 14)} Hľadám v texte ďalší krok…</div>`;
      const s = this.sug;
      if (!s || (!s.next_step_at && !s.stage_suggestion)) return this.sugState === 'none' ? '<div class="lc-sug is-wait">V texte nie je termín ďalšieho kroku — vyplňte ho sami, ak je dohodnutý.</div>' : '';
      const src = s.source === 'ai' ? 'Návrh AI' : s.source === 'rules' ? 'Návrh appky' : 'Predvolené';
      const why = [s.matched ? `podľa „${s.matched}"` : '', s.note || ''].filter(Boolean).join(' · ');
      const stage = s.stage_suggestion ? ` · kategória ${C().stageOf(s.stage_suggestion)[1]}` : '';
      return `<div class="lc-sug">${ico('spark', 14)} <span>${esc(src)}: <b>${s.next_step_at ? esc(dateLabel(s.next_step_at)) : 'bez termínu'}</b>${s.next_step_text ? ` — ${esc(s.next_step_text)}` : ''}${esc(stage)}</span>
        <button type="button" class="btn btn-outline btn-sm" data-lc-a="accept">${ico('check', 13)} Použiť</button>
        <button type="button" class="lc-lnk" data-lc-a="dismiss">Zahodiť</button>
        ${why || this.aiError ? `<small>${esc([why, this.aiError].filter(Boolean).join(' · '))}</small>` : ''}</div>`;
    }

    timelineHtml() {
      const items = C().timeline({ contacts: this.contacts, outreach: this.outreach, events: this.events, members: members() });
      if (!items.length) return '<div class="lc-empty">Zatiaľ žiadny kontakt ani e-mail.</div>';
      const tm = (iso) => `<time datetime="${esc(iso || '')}" title="${esc(iso ? new Date(iso).toLocaleString('sk-SK') : '')}">${esc(C().relTime(iso))}</time>`;
      return `<ul class="lc-tl">${items.map(it => `<li class="lc-it"><span class="lc-dot t-${it.tone}">${ico(it.icon, 13)}</span><div>
        <div class="lc-t1"><b>${esc(it.title)}</b>${tm(it.at)}</div>
        ${it.sub ? `<div class="lc-sub">${esc(it.sub)}</div>` : ''}
        ${it.text ? `<div class="lc-txt">${esc(it.text)}</div>` : ''}
        ${(it.corrections || []).map(c => `<div class="lc-fix"><small>Oprava ${esc(C().relTime(c.created_at))}${c.our_member_name ? ` · ${esc(c.our_member_name)}` : ''}</small>${esc(c.summary || '')}</div>`).join('')}
        ${it.next ? `<div class="lc-nx">${ico('flag', 12)} ${esc(dateLabel(it.next.date))}${it.next.text ? ` — ${esc(it.next.text)}` : ''}</div>` : ''}
        ${it.type === 'contact' && !this.missing ? `<div><button type="button" class="lc-lnk" data-lc-a="fix" data-v="${esc(it.row.id)}">Opraviť záznam</button></div>` : ''}
      </div></li>`).join('')}</ul>`;
    }

    rerenderForm() {
      const w = this.el.querySelector('.lc-formwrap');
      if (w) w.innerHTML = this.form ? this.formHtml() : '';
      this.el.querySelectorAll('.lc-oc').forEach(b => b.classList.toggle('is-on', !!(this.form && this.form.outcome === b.dataset.v)));
      const s = this.form && this.el.querySelector('[name=summary]');
      if (s) s.focus();
    }
    rerenderSug() { const w = this.el.querySelector('.lc-sugwrap'); if (w) w.innerHTML = this.sugHtml(); }

    // ── Udalosti ────────────────────────────────────────────────────────
    readForm() {
      const f = this.el.querySelector('[data-lc-form]');
      if (!f || !this.form) return;
      Object.assign(this.form, UI.formData(f));
    }

    open(kind, outcome) {
      const l = this.lead;
      const osoba = String(l.contact_person || '').split(/\s*(?:,|;|\bund\b|&)\s*/)[0].replace(/^(herrn?|frau|hr\.|fr\.)\s+/i, '').trim();
      // Dotazník je predvolene zapnutý pri hovore, s ktorým sa dalo hovoriť (nie Nedvíha / Obsadené / Zlé číslo).
      const quiz = kind === 'call' && !!CS() && !['no_answer', 'busy', 'wrong_number'].includes(outcome);
      this.form = { kind, outcome: outcome || null, outcomeByUser: !!outcome, contact_name: osoba, contact_role: '', happened_at: nowLocal(), summary: '', create_task: true, quiz };
      if (kind === 'call' && this.sheet && this.sheet.done) this.form.duration_min = Math.max(1, Math.round(this.sheet.sec / 60));
      const kde = [l.city, l.region && l.region !== l.city ? l.region : ''].filter(Boolean).join(', ');
      this.answers = { sites: kde ? `${kde} a okolie` : '' };
      this._prefill = this.answers.sites; this._manual = false;
      this.sug = null; this.sugState = ''; this.aiError = ''; this._sugFor = '';
      // Výsledok s predvoleným ďalším krokom (Nedvíha → skúsiť o 2 dni) sa ukáže ako ponuka, nevyplní sa sám.
      const d = outcome ? C().defaultNext(outcome) : null;
      if (d) this.sug = { next_step_at: d.date, next_step_text: d.text, source: 'default', stage_suggestion: C().suggestStage(outcome, l.status), note: 'predvolené k výsledku' };
      this.rerenderForm();
    }

    onClick(e) {
      const b = e.target.closest && e.target.closest('[data-lc-a]');
      if (!b || !this.el.contains(b)) return;
      const a = b.dataset.lcA;
      if (a === 'call') return this.callStarted();
      if (a === 'copy') { e.preventDefault(); return this.copy(); }
      if (a === 'sheet') return this.openSheet();
      if (a === 'sheetclose') return this.closeSheet();
      if (a === 'callend') return this.callEnd();
      if (a === 'out') {
        // Otvorený záznam hovoru (s dotazníkom) sa pri zmene výsledku nezahodí.
        if (this.form && this.form.kind === 'call') { this.readForm(); return this.setOutcome(b.dataset.v, true); }
        return this.open('call', b.dataset.v);
      }
      if (a === 'useout') { this.readForm(); return this.setOutcome(b.dataset.v, true); }
      if (a === 'q') return this.chipClick(b);
      if (a === 'quiz') { this.readForm(); this.form.quiz = b.dataset.v === 'on'; if (this.form.quiz) this._manual = !!String(this.form.summary || '').trim(); this.rerenderForm(); return; }
      if (a === 'kind') return this.open(b.dataset.v, null);
      if (a === 'cancel') { this.form = null; this.answers = null; return this.rerenderForm(); }
      if (a === 'save') return this.save();
      if (a === 'accept') return this.accept();
      if (a === 'dismiss') { this.sug = null; this.sugState = ''; return this.rerenderSug(); }
      if (a === 'fix') return this.fix(b.dataset.v);
    }
    onChange(e) {
      const t = e.target;
      if (t && t.dataset && t.dataset.lcA === 'stage') return this.setStage(t.value, t);
      if (t && t.name === 'stage' && this.form) this.form.stageByUser = true;
    }
    onInput(e) {
      const t = e.target;
      if (t && t.dataset && t.dataset.lcQ) {
        const k = t.dataset.lcQ;
        if (k === 'sites') this._prefill = '';
        return this.answer(k, t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value);
      }
      if (!t || t.name !== 'summary') return;
      // Kto do súhrnu píše sám, tomu ho dotazník už neprepíše (prázdny text = znova z dotazníka).
      this._manual = !!String(t.value || '').trim();
      clearTimeout(this._t);
      this._t = setTimeout(() => this.askSuggest(false), 1100);
    }

    /** Čip v dotazníku: jedna odpoveď (opätovný klik zruší), viac odpovedí („nič" vylúči ostatné). */
    chipClick(b) {
      const k = b.dataset.k, t = b.dataset.t;
      let v = b.dataset.v;
      if (t === 'scale') v = Number(v);
      const a = this.answers || {};
      let nv;
      if (t === 'many') {
        const cur = Array.isArray(a[k]) ? a[k].slice() : [];
        nv = cur.includes(v) ? cur.filter(x => x !== v) : (v === 'none' ? ['none'] : [...cur.filter(x => x !== 'none'), v]);
      } else nv = a[k] != null && String(a[k]) === String(v) ? null : v;
      this.el.querySelectorAll(`[data-lc-a="q"][data-k="${k}"]`).forEach(x => {
        const xv = t === 'scale' ? Number(x.dataset.v) : x.dataset.v;
        x.classList.toggle('is-on', Array.isArray(nv) ? nv.includes(xv) : nv != null && String(nv) === String(xv));
      });
      // „Kedy sa ozvať" má aj voľný text — čip ho vyplní.
      const free = k === 'callback_when' && this.el.querySelector('[data-lc-q="callback_when"]');
      if (free) free.value = nv || '';
      this.answer(k, nv);
    }
    /** Dotazník má odpoveď okrem predvyplneného miesta stavby? */
    quizFilled() {
      const a = { ...(this.answers || {}) };
      if (this._prefill && a.sites === this._prefill) delete a.sites;
      return !!C().cleanAnswers(a);
    }
    composed() {
      const f = this.form;
      return this.quizFilled() ? C().composeSummary(this.answers, { contactName: f.contact_name, contactRole: f.contact_role }) : '';
    }

    /** Klik na Zavolať: po chvíli sa otvorí záznam (hovor je na telefóne, nie v appke). Pri otvorenom „Idem volať" nie — ešte sa volá. */
    callStarted() {
      if (this.sheet && !this.sheet.done) return;
      if (!this.form && !this.missing) setTimeout(() => { if (!this.form) this.open('call', null); }, 400);
    }
    async copy() {
      const ph = C().phoneLinks(this.lead.phone);
      if (!ph) return;
      try { await navigator.clipboard.writeText(ph.tel.replace(/^tel:/, '')); UI.toast('Číslo je skopírované', 'ok'); }
      catch (err) { UI.toast(`Číslo: ${ph.display}`, ''); }
    }

    async askSuggest(force) {
      if (!this.form) return;
      this.readForm();
      const text = String(this.form.summary || '').trim();
      const key = `${this.form.outcome || ''}|${text}`;
      if (text.length < 12 || key === this._sugFor) return;
      if (!force && !(F() && F().hasIntent(text)) && !['callback', 'interested', 'send_offer', 'meeting_set'].includes(this.form.outcome)) return;
      this._sugFor = key;
      this.sugState = 'wait'; this.rerenderSug();
      try {
        const r = await call({ action: 'suggest', lead_id: this.lead.id, summary: text, outcome: this.form.outcome });
        if (!this.form || this._sugFor !== key) return;
        this.sug = r.suggestion || null; this.aiError = r.ai_error || '';
        this.sugState = this.sug ? 'ok' : 'none';
      } catch (err) {
        // Server nedostupný — aspoň pravidlá appky priamo v prehliadači.
        const p = F() && F().parse(text);
        this.sug = p ? { next_step_at: p.date, next_step_text: 'Ozvať sa, ako sme sa dohodli', source: 'rules', matched: p.text, note: p.note } : null;
        this.aiError = err.message; this.sugState = this.sug ? 'ok' : 'none';
      }
      this.rerenderSug();
    }

    accept() {
      if (!this.form || !this.sug) return;
      const f = this.el.querySelector('[data-lc-form]');
      if (this.sug.next_step_at) f.querySelector('[name=next_step_at]').value = this.sug.next_step_at;
      if (this.sug.next_step_text) f.querySelector('[name=next_step_text]').value = this.sug.next_step_text;
      if (this.sug.stage_suggestion) f.querySelector('[name=stage]').value = this.sug.stage_suggestion;
      this.form.accepted = { ...this.sug };
      UI.toast('Návrh je vo formulári — skontrolujte ho a uložte', 'ok');
    }

    async save() {
      this.readForm();
      const f = this.form;
      if (!f) return;
      const v = C().validate({ ...f, happened_at: f.happened_at ? new Date(f.happened_at).toISOString() : null });
      if (!v.ok) return UI.toast(v.errors[0], 'err');
      const btn = this.el.querySelector('[data-lc-a="save"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Ukladám…'; }
      try {
        const answers = f.kind === 'call' && f.quiz && this.quizFilled() ? C().cleanAnswers(this.answers) : null;
        const r = await call({ action: 'save', lead_id: this.lead.id, ...v.row, stage: f.stage || null, our_member_id: f.our_member_id || null,
          create_task: !!f.create_task, ai_extracted: f.accepted || this.sug || null, answers });
        Object.assign(this.lead, r.lead || {});
        if (r.contact) this.contacts.unshift(r.contact);
        this.form = null; this.sug = null; this.answers = null;
        if (this.sheet && this.sheet.done) this.sheet = null;
        this.render();
        UI.toast(r.task ? `Uložené. Úloha na ${UI.date(r.task.due_date)} je v Úlohách.` : r.warn || 'Uložené', r.warn ? '' : 'ok');
        if (typeof this.opts.onChange === 'function') this.opts.onChange(this.lead, r);
      } catch (err) {
        if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = `${ico('check', 14)} Uložiť záznam`; }
        UI.toast(err.message, 'err');
      }
    }

    async setStage(stage, sel) {
      const prev = this.lead.status || 'new';
      try {
        await call({ action: 'stage', lead_id: this.lead.id, stage });
        this.lead.status = stage;
        if (stage === 'rejected') { this.lead.next_step_at = null; this.lead.next_step_text = null; }
        this.render();
        UI.toast(`Kategória: ${C().stageOf(stage)[1]}`, 'ok');
        if (typeof this.opts.onChange === 'function') this.opts.onChange(this.lead, { stage });
      } catch (err) {
        if (sel) sel.value = prev;
        UI.toast(err.message, 'err');
      }
    }

    async fix(id) {
      const c = this.contacts.find(x => x.id === id);
      if (!c) return;
      const text = await UI.ask('Oprava záznamu', { multiline: true, rows: 4, value: c.summary || '', ok: 'Pridať opravu',
        hint: 'Pôvodný záznam sa nemení — oprava sa zobrazí pod ním s dátumom a menom.' });
      if (text == null || !String(text).trim()) return;
      try {
        const r = await call({ action: 'correct', contact_id: id, summary: text });
        this.contacts.unshift(r.contact);
        this.render();
        UI.toast('Oprava je pridaná', 'ok');
      } catch (err) { UI.toast(err.message, 'err'); }
    }
  }

  // ── Export (CSV pre Excel, ako DataList) ───────────────────────────────
  async function loadAllContacts() {
    const { data, error } = await DB.list('lead_contacts', { order: { column: 'happened_at', ascending: false }, limit: 20000 });
    return error ? [] : (data || []);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  /** CSV firiem s kategóriou, posledným kontaktom, ďalším krokom a e-mailmi. */
  async function exportLeads(leads, { searches = [] } = {}) {
    const contacts = await loadAllContacts();
    const O = window.Outreach;
    if (O && O.ensure) await O.ensure();
    const rows = C().exportLeads({ leads: leads || [], contacts, searches, outreachSummary: O && O.sum ? (id) => O.sum(id) : null });
    return DanubraExport.download(rows, ['firmy-kontakty', stamp()]);
  }
  /** CSV všetkých kontaktov (aj opráv). */
  async function exportContacts(leads) {
    const contacts = await loadAllContacts();
    return DanubraExport.download(C().exportContacts({ contacts, leads: leads || (window.Lead && Lead.rows) || [] }), ['kontakty-s-firmami', stamp()]);
  }

  /**
   * Vloží komponent do prvku.
   * @param {HTMLElement} el
   * @param {Object} lead   riadok danubra_leads (komponent ho po zmene aktualizuje na mieste)
   * @param {Object} opts   { onChange(lead, result) }
   * @returns {Promise<{ refresh, destroy, el }>}
   */
  async function mount(el, lead, opts = {}) {
    if (!el || !lead) return null;
    injectCss();
    const old = instances.get(el.dataset.lc);
    if (old) { old.stopTimer(); instances.delete(old.id); }
    const inst = new Inst(el, lead, opts);
    instances.set(inst.id, inst);
    el.innerHTML = window.UI ? UI.loading() : '';
    await inst.load();
    inst.render();
    return {
      el, lead,
      refresh: async () => { await inst.load(); inst.render(); },
      destroy: () => { inst.stopTimer(); instances.delete(inst.id); el.innerHTML = ''; },
      /** „Posledný hovor: pred 3 dňami · Má záujem · Štefan" — pre hlavičku detailu firmy. */
      lastCall: () => C().lastCallText(inst.contacts),
      _inst: inst,
    };
  }

  window.LeadContacts = { mount, exportLeads, exportContacts, _instances: instances };
})();
