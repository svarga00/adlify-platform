// ============================================================================
// DANUBRA — Stundennachweis
// ============================================================================
// Týždenný výkaz, ktorý na stavbe podpisuje Kunde. Jeden týždeň, jedna
// zákazka — voliteľne len jedna partia z nej.
//
// **Toto je len papier na tlač pre odberateľa.** Hodiny sa sem nepíšu ani
// podpis: oboje sa zapisuje v jednom okne „Zapísať hodiny"
// (components/hourentry.js), podľa zákazky a týždňa. Výkaz ich odtiaľ číta —
// hodiny z `danubra_timesheets`, podpis z `danubra_hour_sheets` (aj staré
// riadky, ktoré sa písali podľa partie, `DanubraHourScan.pickSheet`).
//
// Zákazka sa **nikdy nehádá**: zistí sa z nasadení a hodín partie v danom
// týždni. Keď je ich viac alebo žiadna, appka sa opýta. Dovtedy sa bez hodín
// vzala prvá bežiaca zákazka celej firmy — a na vytlačenom liste mohol byť
// cudzí projekt.
//
// Rozhranie je po slovensky, **papier po nemecky** — tak, ako to má byť
// (rozhodnutie zo zadania: „UI po slovensky, dokumenty pre partnerov
// po nemecky").
//
// Logika týždňov a súčtov je v lib/staffing/hoursheet.js a má testy.
// ============================================================================
(function () {
  // Text, ktorý ide odberateľovi. Pôvodná predloha mala preklepy
  // („Auftrageber", „Enhalt den vereibarten", „Ausführung die Arbeiten",
  // „Druckstaben"); tu je gramaticky správne znenie. Význam je ten istý.
  //
  // Vety boli pôvodne dve a hovorili to isté — raz „der Auftraggeber", raz
  // „der Kunde". Na papieri, ktorý niekto podpisuje, sú dve znenia toho
  // istého potvrdenia horšie než jedno: čitateľ hľadá, v čom sa líšia, a keď
  // sa raz bude o hodiny sporiť, bude sa dať namietať, čo vlastne podpísal.
  // Zostala tá, ktorá pokrýva oboje — správnosť hodín aj bezchybné dielo.
  const LEGAL = [
    'Mit der Unterschrift auf diesem Stundennachweis bestätigt der Kunde die '
    + 'Richtigkeit der angegebenen geleisteten Stunden und die mängelfreie '
    + 'Ausführung der Arbeiten.',
  ];

  const HS = {
    crews: [], members: [], workers: [], subs: [], partners: [], timesheets: [], sheets: [],
    assignments: [],
    loaded: false,
    // `crewId` '' = celá zákazka (všetci, aj jednotlivci bez partie).
    // `subId` = zákazka, ktorú vybral človek (keď sa nedá zistiť sama).
    crewId: null, subId: null, year: null, week: null,

    async load() {
      const [c, m, w, s, p, sh, a] = await Promise.all([
        DB.list('crews', { select: 'id,name,status,trade_key', limit: 300 }),
        DB.list('crew_members', { limit: 2000 }),
        DB.list('workers', { select: 'id,full_name,profession', limit: 500 }),
        DB.list('subcontracts', {
          select: 'id,title,contract_number,site_name,site_city,partner_id,status', limit: 300 }),
        DB.list('partners', { select: 'id,name', limit: 300 }),
        DB.list('hour_sheets', { limit: 500 }),
        // Z nasadení sa zisťuje, na ktorej zákazke partia v týždni robila.
        DB.list('assignments', {
          select: 'id,worker_id,subcontract_id,status,date_from,date_to', limit: 3000 }),
      ]);
      this.crews = c.data || []; this.members = m.data || [];
      this.workers = w.data || []; this.subs = s.data || [];
      this.partners = p.data || []; this.sheets = sh.data || [];
      this.assignments = a.data || [];
      this.loaded = true;
    },

    /**
     * Hodiny a výkazy sa ťahajú pre zvolený týždeň — výkazy znova, lebo
     * podpis sa medzitým mohol zapísať v okne hodín.
     */
    async loadWeek() {
      const d = DanubraHourSheet.weekDates(this.year, this.week);
      const [{ data }, sh] = await Promise.all([
        DB.from('timesheets')
          .select('id,worker_id,assignment_id,work_date,hours,time_from,time_to,activity_type,period_id')
          .gte('work_date', d[0].date)
          .lte('work_date', d[d.length - 1].date)
          .limit(2000),
        DB.list('hour_sheets', { filters: { iso_year: this.year, iso_week: this.week }, limit: 200 }),
      ]);
      this.timesheets = data || [];
      if (sh && !sh.error && Array.isArray(sh.data)) {
        this.sheets = [...this.sheets.filter(x => !(x.iso_year === this.year && x.iso_week === this.week)), ...sh.data];
      }
    },

    range() {
      const d = DanubraHourSheet.weekDates(this.year, this.week);
      return { from: d[0].date, to: d[d.length - 1].date };
    },

    crew() { return this.crews.find(c => c.id === this.crewId) || null; },

    /** Nasadenie, ktoré sa s týždňom prekrýva (zrušené nie). */
    inWeek(a) {
      const { from, to } = this.range();
      return a && a.status !== 'cancelled'
        && (!a.date_from || String(a.date_from).slice(0, 10) <= to)
        && (!a.date_to || String(a.date_to).slice(0, 10) >= from);
    },

    /** Členovia partie, ktorí v danom týždni v nej boli. */
    crewMembers() {
      const { from, to } = this.range();
      const ids = this.members
        .filter(m => m.crew_id === this.crewId
          && (!m.left_at || String(m.left_at).slice(0, 10) >= from)
          && (!m.joined_at || String(m.joined_at).slice(0, 10) <= to))
        .map(m => m.worker_id);
      return ids.map(id => this.workers.find(w => w.id === id)).filter(Boolean);
    },

    /**
     * Zákazky, na ktorých partia v tom týždni robila — z jej nasadení,
     * z jej hodín a z výkazu, ktorý už má k zákazke uložený.
     */
    sitesOfCrew() {
      const ids = new Set(this.crewMembers().map(w => w.id));
      const subIds = new Set();
      for (const a of this.assignments) {
        if (ids.has(a.worker_id) && this.inWeek(a)) subIds.add(a.subcontract_id);
      }
      for (const t of this.timesheets) {
        if (!ids.has(t.worker_id)) continue;
        const a = this.assignments.find(x => x.id === t.assignment_id);
        if (a) subIds.add(a.subcontract_id);
      }
      for (const sh of this.sheets) {
        if (sh.crew_id === this.crewId && sh.subcontract_id
          && sh.iso_year === this.year && sh.iso_week === this.week) subIds.add(sh.subcontract_id);
      }
      return [...subIds].map(id => this.subs.find(s => s.id === id)).filter(Boolean);
    },

    /**
     * Zákazka výkazu. **Nikdy sa nehádá** — keď sa nedá určiť (partia bola
     * v týždni na viacerých zákazkách alebo na žiadnej), vráti `null`
     * a obrazovka sa opýta.
     */
    siteOf() {
      if (!this.crewId) return this.subs.find(s => s.id === this.subId) || null;
      const c = this.sitesOfCrew();
      if (c.length === 1) return c[0];
      if (this.subId) return (c.length ? c : this.subs).find(s => s.id === this.subId) || null;
      return null;
    },

    /** Z čoho sa vyberá, keď sa zákazka nedá určiť. */
    siteChoices() {
      const c = this.crewId ? this.sitesOfCrew() : [];
      return c.length > 1 ? c
        : this.subs.filter(s => !['lost', 'cancelled'].includes(s.status));
    },

    /** Nasadenia zákazky v týždni. */
    siteAssignments(site) {
      return site ? this.assignments.filter(a => a.subcontract_id === site.id) : [];
    },

    /** Ľudia na výkaze: partia (na tej zákazke), alebo všetci zo zákazky. */
    sheetWorkers(site) {
      const naZakazke = new Set(this.siteAssignments(site).filter(a => this.inWeek(a)).map(a => a.worker_id));
      const asg = new Set(this.siteAssignments(site).map(a => a.id));
      for (const t of this.timesheets) if (asg.has(t.assignment_id)) naZakazke.add(t.worker_id);
      if (!this.crewId) {
        return [...naZakazke].map(id => this.workers.find(w => w.id === id)).filter(Boolean)
          .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'sk'));
      }
      const clenovia = this.crewMembers();
      if (!site) return clenovia;
      const tam = clenovia.filter(w => naZakazke.has(w.id));
      return tam.length ? tam : clenovia;
    },

    /** Hodiny len z tejto zákazky — hodiny z inej stavby na jej papier nepatria. */
    sheetTimesheets(site) {
      if (!site) return this.timesheets;
      const asg = new Set(this.siteAssignments(site).map(a => a.id));
      return this.timesheets.filter(t => asg.has(t.assignment_id));
    },

    /** Podpis: tam, kde ho ukladá okno hodín (zákazka + týždeň), aj starý riadok partie. */
    sheetOf() {
      const site = this.siteOf();
      if (window.DanubraHourScan && DanubraHourScan.pickSheet) {
        return DanubraHourScan.pickSheet(this.sheets, {
          subcontractId: site ? site.id : null, crewId: this.crewId || null,
          crewIds: this.crewId ? [this.crewId] : [], year: this.year, week: this.week });
      }
      return null;
    },

    build() {
      const site = this.siteOf();
      const partner = site ? this.partners.find(p => p.id === site.partner_id) : null;
      const c = this.crew();
      return DanubraHourSheet.build({
        year: this.year, week: this.week,
        workers: this.sheetWorkers(site),
        timesheets: this.sheetTimesheets(site),
        project: site ? (site.contract_number || site.title) : '',
        site: site ? [site.site_name, site.site_city].filter(Boolean).join(', ') : '',
        customer: partner ? partner.name : '',
        crewName: c ? c.name : '',
      });
    },

    // ── Obrazovka ─────────────────────────────────────────────────────────
    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      if (!this.crews.length && !this.subs.length) {
        Danubra.setActions('');
        el.innerHTML = Danubra.header(Danubra.labelOf('hoursheet'),
          'Týždenný výkaz pre odberateľa — jeden týždeň, jedna zákazka')
          + UI.empty('site', 'Zatiaľ žiadna zákazka',
            'Výkaz sa robí za zákazku a týždeň. Najprv ju založte.',
            `<button class="btn btn-primary" onclick="Danubra.go('subcontracts')">Zákazky</button>`);
        return;
      }

      // Predvolene prvá partia (alebo celá zákazka) a minulý týždeň — výkaz
      // sa podpisuje spätne, nie za týždeň, ktorý ešte beží.
      if (this.crewId == null) this.crewId = this.crews.length ? this.crews[0].id : '';
      if (!this.year) {
        const now = DanubraHourSheet.isoWeek(new Date());
        const prev = DanubraHourSheet.shiftWeek(now.year, now.week, -1);
        this.year = prev.year; this.week = prev.week;
      }
      await this.loadWeek();

      const site = this.siteOf();
      const s = this.build();
      const sheet = this.sheetOf();
      const signed = !!(sheet && sheet.signed_at);
      const viac = this.crewId ? this.sitesOfCrew().length : 0;
      const zapis = window.HourEntry
        ? `<button class="btn btn-outline btn-sm" onclick="HS.write()">${Icon('upload', 14)} Zapísať hodiny</button>` : '';

      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="HS.print()">${Icon('print', 14)} Tlačiť</button>
        ${zapis}
        ${signed || !window.HourEntry ? '' : `<button class="btn btn-primary btn-sm" onclick="HS.signForm()">${Icon('check', 14)} Podpísané</button>`}
        ${UI.tip('Tlačiť = vytlačí len samotný výkaz, ktorý sa nesie na stavbu. Zapísať hodiny = okno, kde sa hodiny tohto týždňa a zákazky natukajú alebo načítajú z fotky. Podpísané = keď majster list podpíše, zapíšete to v tom istom okne — výkaz to tu potom ukáže.')}`);

      const pick = (lead) => `<div class="warnbox no-print" style="margin-bottom:12px;">
          ${Icon('alert', 14)} ${lead}
          <select onchange="HS.setSub(this.value)" style="min-width:240px;margin-left:8px;" aria-label="Zákazka výkazu">
            <option value="">— vyberte zákazku —</option>
            ${this.siteChoices().map(x => `<option value="${x.id}" ${site && x.id === site.id ? 'selected' : ''}>
              ${UI.esc(x.title)}${x.site_city ? ` · ${UI.esc(x.site_city)}` : ''}</option>`).join('')}
          </select></div>`;

      el.innerHTML = Danubra.header(Danubra.labelOf('hoursheet'),
        `KW ${s.week}/${s.year} · ${UI.date(s.from)} – ${UI.date(s.to)}${UI.tip('KW (Kalenderwoche) = poradové číslo týždňa v roku, tak ho počítajú Nemci. Výkaz je vždy za jeden týždeň od pondelka do nedele a za jednu zákazku — celú alebo len jednu partiu z nej. Predvolene sa otvorí minulý týždeň.')}`) + `
        ${this.barHtml(s, site, viac)}

        ${!site ? pick(!this.crewId ? 'Vyberte zákazku, za ktorú je výkaz.'
          : viac > 1 ? 'Partia v tomto týždni robila na viacerých zákazkách — každá má svoj výkaz. Vyberte, za ktorú je tento.'
            : 'Nedá sa zistiť, na ktorej zákazke partia v tomto týždni robila (nemá nasadenie ani hodiny). Vyberte zákazku — appka ju nebude hádať.')
          : (this.crewId && viac > 1 ? pick('Partia v tomto týždni robila na viacerých zákazkách. Výkaz je za túto:') : '')}

        ${signed ? `<div class="regimebox" style="margin-bottom:12px;">
          ${Icon('check', 14)} Podpísané ${UI.date(sheet.signed_at)}${
            sheet.signed_by_name ? ` — ${UI.esc(sheet.signed_by_name)}` : ''}.
          Čo bolo na papieri, sa už nemení; hodiny sa ďalej opravovať dajú,
          ale výkaz zostáva taký, aký ho odberateľ podpísal.</div>`
          : site && s.empty ? `<div class="warnbox" style="margin-bottom:12px;">
              ${Icon('alert', 14)} V tomto týždni nie je na tejto zákazke zapísaná ani hodina.
              Zapíšte ich cez „Zapísať hodiny".</div>` : ''}

        ${this.sheetHtml(s, signed)}

        <p style="margin:14px 0 0;font-size:12.5px;color:var(--ink-mute);">
          Výkaz je len papier na tlač. Hodiny aj podpis majstra sa zapisujú
          na jednom mieste — „Zapísať hodiny" — a z tej istej evidencie vzniká faktúra.
        </p>`;
    },

    /**
     * Horná lišta v štýle zoznamov (`DataList`): Partia, Zákazka a týždeň
     * s posunom. Výkaz nie je zoznam — je to jeden papier za jednu zákazku
     * a jeden týždeň —, preto len lišta, bez tabuľky riadkov. Dovtedy tu bol
     * obyčajný výber partie a pilulky týždňa.
     */
    barHtml(s, site, viac) {
      this.bindBar();
      const c = this.crew();
      const tick = Icon('check', 14);
      const opt = (on, onclick, label, sub) => `<button type="button" class="dl-opt${on ? ' on' : ''}" onclick="${onclick}"
          role="menuitemradio" aria-checked="${on}"><i class="dl-tick">${tick}</i><span>${UI.esc(label)}${
          sub ? ` <small class="hs-opt-sub">${UI.esc(sub)}</small>` : ''}</span></button>`;
      const dd = (key, label, value, on, body) => `<details class="dl-dd${on ? ' on' : ''}" data-hs-dd="${key}">
          <summary class="dl-dd-btn" aria-label="${UI.esc(label)}${value ? `: ${UI.esc(value)}` : ''}">
            <span>${UI.esc(label)}</span>${value ? `<em>${UI.esc(value)}</em>` : ''}${Icon('chevron', 12)}</summary>
          <div class="dl-pop" role="group" aria-label="${UI.esc(label)}">${body}</div></details>`;

      const crewDd = dd('crew', 'Partia', c ? c.name : 'Celá zákazka', !!c,
        opt(!this.crewId, "HS.setCrew('')", 'Celá zákazka (všetci ľudia)')
        + this.crews.map(x => opt(x.id === this.crewId, `HS.setCrew('${x.id}')`, x.name)).join(''));

      // Zákazka sa vyberá len tam, kde je z čoho: celá zákazka (bez partie)
      // alebo partia na viacerých zákazkách v týždni. Inak sa zistí sama.
      const canPick = !this.crewId || viac > 1;
      const choices = this.siteChoices();
      const subDd = canPick
        ? dd('sub', 'Zákazka', site ? site.title : '', !!site,
          choices.map(x => opt(site && x.id === site.id, `HS.setSub('${x.id}')`, x.title, x.site_city)).join('')
          + (site && !this.crewId ? `<div class="dl-pop-foot"><button type="button" class="dl-link" onclick="HS.setSub('')">Zrušiť výber</button></div>` : ''))
        : (site ? `<span class="hs-site">${Icon('site', 13)} ${UI.esc(site.title)}${
          UI.tip('Zákazka sa zistila z nasadení a hodín partie v tomto týždni.')}</span>` : '');

      const now = DanubraHourSheet.isoWeek(new Date());
      const isNow = now.year === s.year && now.week === s.week;
      return `<div class="dl-bar card hs-bar no-print" role="search" aria-label="Výber výkazu">
          ${crewDd}${subDd}
          <div class="hs-week" role="group" aria-label="Týždeň">
            <button type="button" class="dl-dd-btn hs-step" onclick="HS.shift(-1)" title="Predošlý týždeň" aria-label="Predošlý týždeň">${Icon('back', 14)}</button>
            <span class="hs-kwbox"><b>KW ${s.week} / ${s.year}</b><small>${UI.esc(DanubraDataList.rangeText(s.from, s.to))}</small></span>
            <button type="button" class="dl-dd-btn hs-step" onclick="HS.shift(1)" title="Ďalší týždeň" aria-label="Ďalší týždeň">${Icon('chevron', 14)}</button>
          </div>
          ${isNow ? '' : `<button type="button" class="dl-link" onclick="HS.thisWeek()">Aktuálny týždeň</button>`}
          <div class="dl-right"><span class="dl-count">${s.rows.length} ${Shell.plural(s.rows.length, 'človek', 'ľudia', 'ľudí')} · <b>${
            UI.esc(DanubraHourSheet.hoursText(s.total) || '0')} h</b></span></div>
        </div>`;
    },

    /** Rozbalené okno v lište sa zavrie klikom mimo neho alebo Esc. */
    bindBar() {
      if (this._barBound || typeof document === 'undefined') return;
      this._barBound = true;
      const close = (except) => document.querySelectorAll('details[data-hs-dd][open]').forEach(d => { if (d !== except) d.open = false; });
      document.addEventListener('click', (e) => { const t = e.target; close(t && t.closest ? t.closest('details[data-hs-dd]') : null); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    },

    /**
     * Samotný papier. Po nemecky, lebo ho číta a podpisuje odberateľ.
     * Vyplniteľný priamo v tabuľke — to je na ňom to interaktívne.
     */
    sheetHtml(s, signed) {
      const sup = Danubra.supplier();
      // Výkaz je len na čítanie a tlač — hodiny sa píšu v okne „Zapísať
      // hodiny". Na papier pre Nemca ide nemecký tvar čísla („8,5").
      const cell = (r, i) => `<td class="hs-h">${UI.esc(DanubraHourSheet.hoursText(r.hours[i]))}</td>`;

      return `<div class="hs-paper" id="hs-paper">
        <!-- Tá istá značka ako na faktúre, ponuke a zmluve. Doklady od jednej
             firmy majú vyzerať ako jedna rodina; výkaz bol doteraz jediný,
             ktorý sa kreslí v appke, a preto jediný bez značky. -->
        <div class="hs-head">
          <div class="hs-brandrow">
            ${window.DanubraPapers ? DanubraPapers.mark() : ''}
            ${(() => {
              const b = window.DanubraPapers ? DanubraPapers.brand(sup) : { brand: '', name: sup.name || '' };
              return b.brand
                ? `<div><div class="hs-brand">${UI.esc(b.brand)}</div>${b.sub ? `<div class="hs-brand-sub">${UI.esc(b.sub)}</div>` : ''}</div>`
                : (b.name ? `<div class="hs-brand is-name">${UI.esc(b.name)}</div>` : '');
            })()}
          </div>
          <div class="hs-titlebox">
            <div class="hs-title">Stundennachweis${UI.tip('Stundennachweis = výkaz odpracovaných hodín po nemecky. Projekt = zákazka, Baustelle = stavba, Kunde = odberateľ, Kolonne = partia, Insgesamt / Gesamt = spolu. Podpisuje ho odberateľ a podľa neho fakturujeme.')}</div>
            <div class="hs-kw">KW <strong>${s.week} / ${s.year}</strong></div>
          </div>
        </div>

        <div class="hs-meta">
          <div><span>Projekt</span><strong>${UI.esc(s.project || '…')}</strong></div>
          <div><span>Baustelle</span><strong>${UI.esc(s.site || '…')}</strong></div>
          <div><span>Kunde</span><strong>${UI.esc(s.customer || '…')}</strong></div>
          ${s.crewName ? `<div><span>Kolonne</span><strong>${UI.esc(s.crewName)}</strong></div>` : ''}
        </div>

        <table class="hs-table">
          <thead>
            <tr>
              <th class="hs-name">${signed ? '' : UI.tip('Hodiny sa sem nepíšu — zapisujú sa cez „Zapísať hodiny" (ručne alebo z fotky listu). Riadky „von – bis" a „Pause" sa dopočítajú z časov od–do, ak sú zapísané.')}</th>
              ${s.days.map(d => `<th>${d.de}<span>${UI.date(d.date)}</span></th>`).join('')}
              <th class="hs-total">Insgesamt</th>
            </tr>
          </thead>
          <tbody>
            <tr class="hs-span">
              <td class="hs-name">Stunden (von – bis)</td>
              ${s.days.map((d, i) => `<td>${UI.esc(DanubraHourSheet.spanText(s.span[i]))}</td>`).join('')}
              <td></td>
            </tr>
            <!-- Pauza. Je na pôvodnom papieri a na stavbe ju na doklade hľadajú.
                 Nemáme ju kde zapísať, ale dá sa dopočítať z času od-do
                 a odrobených hodín. Keď sa dopočítať nedá, riadok zostane
                 prázdny - vymyslená prestávka na doklade, ktorý sa podpisuje,
                 je horšia než prázdne miesto. -->
            <tr class="hs-span">
              <td class="hs-name">Pause</td>
              ${s.days.map((d, i) => `<td>${UI.esc(DanubraHourSheet.pauseText(s.pause[i]))}</td>`).join('')}
              <td></td>
            </tr>
            ${s.rows.map(r => `
              <tr>
                <td class="hs-name">${UI.esc(r.name)}</td>
                ${s.days.map((d, i) => cell(r, i)).join('')}
                <td class="hs-total">${DanubraHourSheet.hoursText(r.total)}</td>
              </tr>`).join('')}
            ${s.rows.length ? '' : `<tr><td class="hs-name" colspan="9"
              style="color:var(--ink-mute);">${this.crewId ? 'Partia nemá členov.' : 'Na zákazke v tomto týždni nikto nie je.'}</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <!-- Nemecký doklad, nemecké slovo. -->
              <td class="hs-name">Gesamt</td>
              ${s.perDay.map(h => `<td class="hs-h">${DanubraHourSheet.hoursText(h)}</td>`).join('')}
              <td class="hs-total">${DanubraHourSheet.hoursText(s.total)}</td>
            </tr>
          </tfoot>
        </table>

        ${s.span.some(x => x.mixed) ? `<p class="hs-note">
          * An diesem Tag haben nicht alle zur gleichen Zeit gearbeitet;
          angegeben sind der früheste Beginn und das späteste Ende.</p>` : ''}

        <div class="hs-sign">
          <div>
            <div class="hs-line"></div>
            <span>Name in Druckbuchstaben</span>
          </div>
          <div>
            <div class="hs-line"></div>
            <span>Unterschrift des Kunden</span>
          </div>
        </div>

        <div class="hs-legal">
          ${LEGAL.map(t => `<p>${UI.esc(t)}</p>`).join('')}
        </div>

        <!-- Pätička berie všetko z Nastavení a nič si nedomýšľa.
             Predtým tu bolo meno firmy aj adresa natvrdo v kóde ako záloha —
             na doklade pre nemeckého odberateľa je vymyslený údaj horší než
             žiadny. A sup.ico sa nikdy nevyplnilo: Nastavenia to pole volajú
             company_id, takže IČO na výkaze nebolo nikdy.
             „Steuernummer: wird nachgereicht" sa netlačí — na doklade, ktorý
             ide odberateľovi, je priznanie, že niečo chýba, horšie než mlčanie;
             a dovtedy to pole nešlo ani nikde vyplniť. -->
        ${window.DanubraPapers ? DanubraPapers.runFoot(sup, 'de') : ''}
      </div>`;
    },

    // ── Ovládanie ─────────────────────────────────────────────────────────
    setCrew(id) { this.crewId = id || ''; this.subId = null; Danubra.renderRoute(); },
    setSub(id) { this.subId = id || null; Danubra.renderRoute(); },
    shift(n) {
      const w = DanubraHourSheet.shiftWeek(this.year, this.week, n);
      this.year = w.year; this.week = w.week;
      Danubra.renderRoute();
    },
    thisWeek() {
      const w = DanubraHourSheet.isoWeek(new Date());
      this.year = w.year; this.week = w.week;
      Danubra.renderRoute();
    },

    /**
     * Otvorí výkaz konkrétnej zákazky a týždňa (zo zákazky, z okna hodín).
     * Bez partie — je to výkaz celej zákazky; partia sa dá vybrať potom.
     */
    openFor(o = {}) {
      this.crewId = o.crewId || '';
      this.subId = o.subcontractId || null;
      if (o.year && o.week) { this.year = Number(o.year); this.week = Number(o.week); }
      Danubra.go('hoursheet');
    },

    /** Hodiny sa píšu v jednom okne — tu sa len otvorí s touto zákazkou a týždňom. */
    write(extra = {}) {
      if (!window.HourEntry) return;
      const site = this.siteOf();
      if (!site && this.crewId && this.sitesOfCrew().length > 1) {
        return UI.toast('Najprv vyberte zákazku — partia bola v tomto týždni na viacerých.', 'warn');
      }
      HourEntry.open({ subcontractId: site ? site.id : undefined, year: this.year, week: this.week, ...extra });
    },

    /**
     * „Podpísané" — podpis sa zapisuje tam, kde ho ukladá okno hodín
     * (zákazka + týždeň), aby ho videli obe obrazovky.
     */
    signForm() {
      if (!this.siteOf()) return UI.toast('Najprv vyberte zákazku, za ktorú je výkaz.', 'warn');
      this.write({ sign: true });
    },

    /**
     * Výkaz ide na stavbu na podpis stavbyvedúcemu. Bez našich údajov je to
     * papier, ktorý nič nedokazuje — nie je na ňom, čia je to firma. A bez
     * zákazky by na ňom mohol byť cudzí projekt.
     */
    print() {
      if (!this.siteOf()) return UI.toast('Najprv vyberte zákazku — na výkaze musí byť správny projekt.', 'warn');
      if (!Danubra.supplierReady('Výkaz pre odberateľa')) return;
      window.print();
    },
  };

  window.HS = HS;
  Danubra.views.hoursheet = function (el) { return HS.view(el); };
})();
