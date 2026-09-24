// ============================================================================
// DANUBRA — Stundennachweis
// ============================================================================
// Týždenný výkaz, ktorý na stavbe podpisuje Kunde. Jeden týždeň, jedna partia.
//
// Hodiny sa zapisujú **sem** a ukladajú do `danubra_timesheets` — tam, kde
// boli vždy. Výkaz nie je druhé miesto, kde sa píšu hodiny; je to pohľad
// na ne v tvare, ktorý očakáva nemecký odberateľ.
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
  const LEGAL = [
    'Mit der Unterschrift auf diesem Stundennachweis bestätigt der Auftraggeber '
    + 'den Erhalt der vereinbarten Arbeiten ohne Mängel.',
    'Mit der Unterschrift auf diesem Stundennachweis bestätigt der Kunde die '
    + 'Richtigkeit der angegebenen geleisteten Stunden und die mängelfreie '
    + 'Ausführung der Arbeiten.',
  ];

  const HS = {
    crews: [], members: [], workers: [], subs: [], partners: [], timesheets: [], sheets: [],
    loaded: false,
    crewId: null, year: null, week: null,

    async load() {
      const [c, m, w, s, p, sh] = await Promise.all([
        DB.list('crews', { select: 'id,name,status,trade_key', limit: 300 }),
        DB.list('crew_members', { limit: 2000 }),
        DB.list('workers', { select: 'id,full_name,profession', limit: 500 }),
        DB.list('subcontracts', {
          select: 'id,title,contract_number,site_name,site_city,partner_id,status', limit: 300 }),
        DB.list('partners', { select: 'id,name', limit: 300 }),
        DB.list('hour_sheets', { limit: 500 }),
      ]);
      this.crews = c.data || []; this.members = m.data || [];
      this.workers = w.data || []; this.subs = s.data || [];
      this.partners = p.data || []; this.sheets = sh.data || [];
      this.loaded = true;
    },

    /** Hodiny sa ťahajú len pre zvolený týždeň — nie je dôvod na viac. */
    async loadWeek() {
      const d = DanubraHourSheet.weekDates(this.year, this.week);
      const { data } = await DB.from('timesheets')
        .select('id,worker_id,assignment_id,work_date,hours,time_from,time_to,activity_type,period_id')
        .gte('work_date', d[0].date)
        .lte('work_date', d[d.length - 1].date)
        .limit(2000);
      this.timesheets = data || [];
    },

    crew() { return this.crews.find(c => c.id === this.crewId) || null; },

    /** Členovia partie, ktorí v danom týždni neboli odhlásení. */
    crewWorkers() {
      const to = DanubraHourSheet.weekDates(this.year, this.week).slice(-1)[0].date;
      const ids = this.members
        .filter(m => m.crew_id === this.crewId
          && (!m.left_at || String(m.left_at).slice(0, 10) >= to))
        .map(m => m.worker_id);
      return ids.map(id => this.workers.find(w => w.id === id)).filter(Boolean);
    },

    /** Zákazka, na ktorej partia v tom týždni robila. */
    siteOf() {
      const ids = new Set(this.crewWorkers().map(w => w.id));
      const t = this.timesheets.find(x => ids.has(x.worker_id) && x.assignment_id);
      const asg = t && Sub.assignments ? Sub.assignments.find(a => a.id === t.assignment_id) : null;
      if (asg) return this.subs.find(s => s.id === asg.subcontract_id) || null;
      // Bez hodín sa vezme bežiaca zákazka partie z nasadení.
      return this.subs.find(s => s.status === 'active') || null;
    },

    sheetOf() {
      return this.sheets.find(s => s.crew_id === this.crewId
        && s.iso_year === this.year && s.iso_week === this.week) || null;
    },

    build() {
      const site = this.siteOf();
      const partner = site ? this.partners.find(p => p.id === site.partner_id) : null;
      const c = this.crew();
      return DanubraHourSheet.build({
        year: this.year, week: this.week,
        workers: this.crewWorkers(),
        timesheets: this.timesheets,
        project: site ? (site.contract_number || site.title) : '',
        site: site ? [site.site_name, site.site_city].filter(Boolean).join(', ') : '',
        customer: partner ? partner.name : '',
        crewName: c ? c.name : '',
      });
    },

    // ── Obrazovka ─────────────────────────────────────────────────────────
    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      if (!this.crews.length) {
        Danubra.setActions('');
        el.innerHTML = Danubra.header(Danubra.labelOf('hoursheet'),
          'Týždenný výkaz pre odberateľa — jeden týždeň, jedna partia')
          + UI.empty('workers', 'Zatiaľ žiadna partia',
            'Výkaz sa robí za partiu. Najprv ju založ.',
            `<button class="btn btn-primary" onclick="Danubra.go('crews')">Partie</button>`);
        return;
      }

      // Predvolene posledná partia a minulý týždeň — výkaz sa podpisuje
      // spätne, nie za týždeň, ktorý ešte beží.
      if (!this.crewId) this.crewId = this.crews[0].id;
      if (!this.year) {
        const now = DanubraHourSheet.isoWeek(new Date());
        const prev = DanubraHourSheet.shiftWeek(now.year, now.week, -1);
        this.year = prev.year; this.week = prev.week;
      }
      await this.loadWeek();

      const s = this.build();
      const sheet = this.sheetOf();
      const signed = !!(sheet && sheet.signed_at);

      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="HS.print()">${Icon('doc', 14)} Tlačiť</button>
        ${signed ? '' : `<button class="btn btn-primary btn-sm" onclick="HS.signForm()">${Icon('check', 14)} Podpísané</button>`}`);

      el.innerHTML = Danubra.header(Danubra.labelOf('hoursheet'),
        `KW ${s.week}/${s.year} · ${UI.date(s.from)} – ${UI.date(s.to)}`) + `
        <div class="filterbar">
          <select onchange="HS.setCrew(this.value)" style="min-width:220px;">
            ${this.crews.map(c => `<option value="${c.id}" ${c.id === this.crewId ? 'selected' : ''}>
              ${UI.esc(c.name)}</option>`).join('')}
          </select>
          <div class="pillbar">
            <button class="pill" onclick="HS.shift(-1)" title="Predošlý týždeň">${Icon('back', 15)}</button>
            <button class="pill active" style="cursor:default;">KW ${s.week} / ${s.year}</button>
            <button class="pill" onclick="HS.shift(1)" title="Ďalší týždeň">${Icon('chevron', 15)}</button>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="HS.thisWeek()">Aktuálny týždeň</button>
        </div>

        ${signed ? `<div class="regimebox" style="margin-bottom:12px;">
          ${Icon('check', 14)} Podpísané ${UI.date(sheet.signed_at)}${
            sheet.signed_by_name ? ` — ${UI.esc(sheet.signed_by_name)}` : ''}.
          Čo bolo na papieri, sa už nemení; hodiny sa ďalej opravovať dajú,
          ale výkaz zostáva taký, aký ho odberateľ podpísal.</div>`
          : s.empty ? `<div class="warnbox" style="margin-bottom:12px;">
              ${Icon('alert', 14)} V tomto týždni nemá partia zapísanú ani hodinu.
              Vypĺňa sa priamo v tabuľke nižšie.</div>` : ''}

        ${this.sheetHtml(s, signed)}

        <p style="margin:14px 0 0;font-size:12.5px;color:var(--ink-mute);">
          Hodiny sa ukladajú do výkazov hodín — je to tá istá evidencia, z ktorej
          vzniká faktúra. Výkaz nie je druhé miesto, kde sa píšu.
        </p>`;
    },

    /**
     * Samotný papier. Po nemecky, lebo ho číta a podpisuje odberateľ.
     * Vyplniteľný priamo v tabuľke — to je na ňom to interaktívne.
     */
    sheetHtml(s, signed) {
      const sup = (window.Cfg && Cfg.j('supplier')) || {};
      const cell = (r, i) => {
        const d = s.days[i];
        return `<td class="hs-h">
          ${signed
            ? DanubraHourSheet.hoursText(r.hours[i])
            : `<input type="number" step="0.25" min="0" max="24" inputmode="decimal"
                 value="${r.hours[i] || ''}"
                 onchange="HS.setHours('${r.worker_id}','${d.date}',this.value)">`}
        </td>`;
      };

      return `<div class="hs-paper" id="hs-paper">
        <div class="hs-head">
          <div>
            <div class="hs-brand">${UI.esc(sup.name || 'Partner und Service')}</div>
            <div class="hs-title">Stundennachweis</div>
          </div>
          <div class="hs-kw">KW<strong>${s.week}</strong><span>${s.year}</span></div>
        </div>

        <div class="hs-meta">
          <div><span>Projekt</span><strong>${UI.esc(s.project || '…')}</strong></div>
          <div><span>Baustelle</span><strong>${UI.esc(s.site || '…')}</strong></div>
          <div><span>Kunde</span><strong>${UI.esc(s.customer || '…')}</strong></div>
          <div><span>Kolonne</span><strong>${UI.esc(s.crewName || '…')}</strong></div>
        </div>

        <table class="hs-table">
          <thead>
            <tr>
              <th class="hs-name"></th>
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
            ${s.rows.map(r => `
              <tr>
                <td class="hs-name">${UI.esc(r.name)}</td>
                ${s.days.map((d, i) => cell(r, i)).join('')}
                <td class="hs-total">${DanubraHourSheet.hoursText(r.total)}</td>
              </tr>`).join('')}
            ${s.rows.length ? '' : `<tr><td class="hs-name" colspan="8"
              style="color:var(--ink-mute);">Partia nemá členov.</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td class="hs-name">Total</td>
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

        <div class="hs-foot">
          <strong>${UI.esc(sup.name || 'Partner und Service')}</strong>
          ${UI.esc(sup.address || 'Podzámska 9468/4A, 940 71 Nové Zámky, Slowakei')}
          ${sup.ico ? ` · IČO ${UI.esc(sup.ico)}` : ''}
          ${sup.tax_number_de
            ? ` · Steuernummer ${UI.esc(sup.tax_number_de)}`
            : ' · Steuernummer: wird nachgereicht'}
        </div>
      </div>`;
    },

    // ── Ovládanie ─────────────────────────────────────────────────────────
    setCrew(id) { this.crewId = id; Danubra.renderRoute(); },
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
     * Zápis hodiny. Ide do `danubra_timesheets` — nie do výkazu.
     * Nula znamená zmazať záznam, aby v evidencii nezostávali prázdne dni.
     */
    async setHours(workerId, date, value) {
      const hours = Number(String(value).replace(',', '.'));
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        return UI.toast('Hodiny zapíš ako číslo od 0 do 24.', 'err');
      }
      const existing = this.timesheets.find(t =>
        t.worker_id === workerId && String(t.work_date).slice(0, 10) === date);

      // Uzavreté obdobie sa nemení — drží to aj databáza, ale povedať to
      // treba skôr, než človek klikne.
      if (existing && existing.period_id) {
        return UI.toast('Tento deň už je v uzavretom období — opraviť sa dá len '
          + 'znovuotvorením obdobia.', 'err');
      }

      let error;
      if (existing && hours === 0) {
        ({ error } = await DB.remove('timesheets', existing.id));
      } else if (existing) {
        ({ error } = await DB.update('timesheets', existing.id, { hours }));
      } else if (hours > 0) {
        const asg = this.assignmentFor(workerId, date);
        if (!asg) {
          return UI.toast('Tento človek nemá na ten deň nasadenie — najprv ho '
            + 'nasaď na zákazku.', 'err');
        }
        ({ error } = await DB.insert('timesheets', {
          worker_id: workerId, assignment_id: asg.id, work_date: date,
          hours, activity_type: 'construction', source: 'manual',
        }));
      } else { return; }

      if (error) return UI.toast(error.message, 'err');
      await this.loadWeek();
      Danubra.renderRoute();
    },

    /** Nasadenie, pod ktoré ten deň patrí. Bez neho hodina nemá zákazku. */
    assignmentFor(workerId, date) {
      const list = (Sub.assignments || []).filter(a => a.worker_id === workerId);
      return list.find(a => a.status === 'active'
        && (!a.date_from || String(a.date_from).slice(0, 10) <= date)
        && (!a.date_to || String(a.date_to).slice(0, 10) >= date))
        || list.find(a => a.status === 'active') || null;
    },

    signForm() {
      const s = this.build();
      if (s.empty && !confirm('Vo výkaze nie je ani hodina. Naozaj ho označiť ako podpísaný?')) return;
      UI.modal('Výkaz podpísaný', `
        <form id="hs-sign" onsubmit="event.preventDefault();HS.sign()">
          ${UI.field('signed_by_name', 'Kto ho podpísal (Name in Druckbuchstaben)',
            { required: true, placeholder: 'napr. Klaus Vogel' })}
          ${UI.field('signed_on', 'Kedy', { type: 'date',
            value: new Date().toISOString().slice(0, 10) })}
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox">Uloží sa aj to, čo bolo na papieri v čase podpisu.
            Neskoršia oprava hodín ho neprepíše — odberateľ podpísal to, čo tam
            vtedy bolo. Sken papiera sa dá doplniť neskôr.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Späť</button>
            <button type="submit" class="btn btn-primary">Označiť ako podpísaný</button>
          </div>
        </form>`);
    },

    async sign() {
      const d = UI.formData(document.getElementById('hs-sign'));
      const s = this.build();
      const site = this.siteOf();
      const payload = {
        crew_id: this.crewId, subcontract_id: site ? site.id : null,
        iso_year: this.year, iso_week: this.week,
        total_hours: s.total,
        snapshot: {
          dni: s.days.map(x => x.date),
          riadky: s.rows.map(r => ({ meno: r.name, hodiny: r.hours, spolu: r.total })),
          po_dnoch: s.perDay, spolu: s.total,
          projekt: s.project, baustelle: s.site, kunde: s.customer, partia: s.crewName,
        },
        signed_at: new Date(`${d.signed_on || new Date().toISOString().slice(0, 10)}T12:00:00Z`).toISOString(),
        signed_by_name: d.signed_by_name || null,
        note: d.note || null,
      };
      const existing = this.sheetOf();
      const { error } = existing
        ? await DB.update('hour_sheets', existing.id, payload)
        : await DB.insert('hour_sheets', payload);
      if (error) return UI.toast(error.message, 'err');
      UI.closeModal();
      UI.toast('Výkaz označený ako podpísaný', 'ok');
      const { data } = await DB.list('hour_sheets', { limit: 500 });
      this.sheets = data || [];
      Danubra.renderRoute();
    },

    /** Tlač len papiera — zvyšok obrazovky na papier nepatrí. */
    print() { window.print(); },
  };

  window.HS = HS;
  Danubra.views.hoursheet = function (el) { return HS.view(el); };
})();
