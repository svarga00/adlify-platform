// ============================================================================
// DANUBRA — Zapísať hodiny (Stundennachweis: ručne alebo z fotky)
// ============================================================================
// „Píšu si hodiny a majster ich podpíše… na základe toho fakturujeme,
// potrebujem to mať jednoduché, toto je 99 % prípadov." Jedno okno:
//
//   1. zákazka a týždeň (KW),
//   2. tabuľka ľudia × dni — ľudia zo stavby sú v nej sami (partia aj
//      jednotlivci); hodiny sa natukajú, alebo sa nahrá fotka/PDF listu
//      a appka ich prečíta (netlify/functions/danubra-read-hours.js),
//   3. „Podpísal majster" + meno, sken sa uloží k výkazu,
//   4. Uložiť → hodiny idú do Odpracovaných hodín k nasadeniu (z nich
//      vzniká obdobie a faktúra odberateľovi).
//
// **Toto je jediný vstup na hodiny.** Každé tlačidlo „Zapísať hodiny"
// v appke (Hodiny, zákazka, Dnes, Výkaz, Papiere) otvára toto okno
// s predvyplnenou zákazkou a týždňom. Výkaz pre odberateľa
// (modules/hoursheet.js) je len papier na tlač — hodiny ani podpis sa tam
// nepíšu, podpis číta odtiaľto (`hour_sheets` podľa zákazky a týždňa,
// výber riadku robí `DanubraHourScan.pickSheet`, aj so starými riadkami
// partie). Výnimka „Jeden deň" (cesta, dielňa, popis) je voľba v tomto okne.
//
// Výpočty (minúty, kontrola súčtov, priradenie mien) sú v
// lib/staffing/hourscan.js, týždne v lib/staffing/hoursheet.js.
// ============================================================================
(function () {
  const HSL = () => window.DanubraHourSheet;
  const SCAN = () => window.DanubraHourScan;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtMin = (m) => {
    const v = Math.round(Number(m) || 0);
    if (!v) return '';
    return v % 60 ? `${Math.floor(v / 60)}:${pad(v % 60)}` : String(v / 60);
  };
  const sumText = (m) => {
    const v = Math.round(Number(m) || 0);
    return v % 60 ? `${Math.floor(v / 60)} h ${v % 60} min` : `${v / 60} h`;
  };

  const HourEntry = {
    st: null,

    /** Ľudia, ktorí boli na zákazke v danom týždni (nasadenie sa s ním prekrýva). */
    peopleOf(subId, days) {
      const from = days[0].date, to = days[days.length - 1].date;
      const asg = (Sub.assignments || []).filter(a => a.subcontract_id === subId
        && (!a.date_from || a.date_from <= to) && (!a.date_to || a.date_to >= from)
        && a.status !== 'cancelled');
      const ids = [...new Set(asg.map(a => a.worker_id))];
      return ids.map(id => Sub.workerOf(id)).filter(Boolean)
        .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'sk'));
    },

    // Zrušené nasadenie nikoho na stavbu neposlalo — hodiny k nemu nepatria.
    // Doteraz sa vzalo prvé nasadenie v dátume, aj zrušené, a hodiny sa
    // potom fakturovali sadzbou nasadenia, ktoré neplatí.
    assignmentFor(workerId, date) {
      const st = this.st;
      return (Sub.assignments || []).find(a => a.subcontract_id === st.subId && a.worker_id === workerId
        && a.status !== 'cancelled'
        && (!a.date_from || a.date_from <= date) && (!a.date_to || a.date_to >= date)) || null;
    },

    /**
     * Dni v tabuľke: Po–So, nedeľa len keď na nej niekto robil (je zapísaná
     * alebo je na fotke listu). Doteraz sa nedeľa z fotky prečítala, zarátala
     * do súčtu „uložené", ale nezapísala sa — hodiny sa stratili.
     */
    weekDays() {
      const st = this.st;
      const days = HSL().weekDates(st.year, st.week);
      if (!st.sunday) return days;
      const sat = new Date(`${days[days.length - 1].date}T00:00:00Z`);
      sat.setUTCDate(sat.getUTCDate() + 1);
      return [...days, { key: 'sun', de: 'Sonntag', sk: 'Nedeľa', date: sat.toISOString().slice(0, 10) }];
    },

    /** Spadá deň do uzavretého alebo vyfakturovaného obdobia tejto zákazky? */
    closedOn(date) {
      const st = this.st;
      return (Sub.periods || []).some(p => p.subcontract_id === st.subId
        && ['closed', 'invoiced'].includes(p.status)
        && String(p.period_from).slice(0, 10) <= date && String(p.period_to).slice(0, 10) >= date);
    },

    /** Naposledy použitá zákazka — ďalší list je najčastejšie z tej istej. */
    lastSub: null,

    /**
     * Otvorí okno. `o`: { subcontractId, year, week, sign } — všetko nepovinné.
     * Zákazka bez `subcontractId` je naposledy použitá alebo prvá bežiaca;
     * v okne je vidieť a dá sa zmeniť.
     */
    async open(o = {}) {
      if (!window.Sub) return UI.toast('Zákazky nie sú dostupné', 'err');
      if (!Sub.loaded) await Sub.load();
      const active = Sub.items.filter(s => ['active', 'won'].includes(s.status));
      const known = (id) => id && Sub.items.some(s => s.id === id);
      const subId = (known(o.subcontractId) && o.subcontractId) || (known(this.lastSub) && this.lastSub)
        || (active[0] || Sub.items[0] || {}).id;
      if (!subId) return UI.toast('Najprv založte zákazku', 'warn');
      // Predvolený je minulý týždeň — list prichádza po skončení týždňa.
      // Dnešok podľa miestneho času, nie UTC: v pondelok pred druhou ráno
      // (UTC+2) by UTC ešte bola nedeľa a okno by ponúklo o týždeň starší list.
      const dnes = (window.Danubra && Danubra._dayISO) ? Danubra._dayISO() : new Date().toISOString().slice(0, 10);
      const now = HSL().isoWeek(dnes);
      const prev = HSL().shiftWeek(now.year, now.week, -1);
      this.st = {
        subId, year: Number(o.year) || prev.year, week: Number(o.week) || prev.week,
        rows: [], extra: [], days: {}, signed: false, signer: '', paperTotal: '',
        signedOn: dnes,
        scan: null, warnings: [], sunday: false, sheet: null, sheetSigned: false,
      };
      await this.loadWeek();
      // „Podpísané" z Výkazu: okno sa otvorí s fajkou, meno sa doplní.
      if (o.sign && !this.st.sheetSigned) this.st.signed = true;
      this.render();
    },

    async loadWeek() {
      const st = this.st;
      const base = HSL().weekDates(st.year, st.week);
      const people = this.peopleOf(st.subId, base);
      const ids = [...new Set([...people.map(w => w.id), ...st.extra])];
      // Čo je už zapísané v tomto týždni (aby sa nič nezapísalo dvakrát).
      // Keď sa to nenačíta, okno nesmie tváriť, že je týždeň prázdny —
      // uloženie by potom všetko zapísalo druhýkrát.
      const S = SCAN();
      const asgIds = (Sub.assignments || []).filter(a => a.subcontract_id === st.subId).map(a => a.id);
      const sun = new Date(`${base[base.length - 1].date}T00:00:00Z`);
      sun.setUTCDate(sun.getUTCDate() + 1);
      const sunday = sun.toISOString().slice(0, 10);
      let ts = [];
      st.loadError = null;
      if (asgIds.length) {
        try {
          const { data, error } = await DB.from('timesheets')
            .select('id,worker_id,assignment_id,work_date,hours,time_from,time_to,period_id,approved,activity_type,source')
            .in('assignment_id', asgIds)
            .gte('work_date', base[0].date).lte('work_date', sunday).limit(5000);
          if (error) throw error;
          ts = data || [];
        } catch (e) {
          st.loadError = (e && e.message) || String(e);
          ts = [];
        }
      }
      const mine = new Set(asgIds);
      st.existing = ts.filter(t => mine.has(t.assignment_id));
      if (st.existing.some(t => String(t.work_date).slice(0, 10) === sunday && (!S || S.isGridRow(t)))) st.sunday = true;
      const days = this.weekDays();
      st.dates = days;
      st.rows = ids.map(id => {
        const w = Sub.workerOf(id) || { id, full_name: '?' };
        const cells = {};
        for (const d of days) {
          cells[d.date] = S && S.cellMinutes ? S.cellMinutes(st.existing, id, d.date) : 0;
        }
        return { worker_id: id, name: w.full_name, cells };
      });
      await this.loadSheet();
    },

    // ── Výkaz (podpis majstra, sken) ─────────────────────────────────────
    // Jeden riadok `hour_sheets` na zákazku a týždeň. Staré riadky z Výkazu
    // (partia + týždeň, bez zákazky) sa čítajú tiež, aby sa podpis nestratil;
    // pri ďalšom uložení sa k nim zákazka doplní.

    /** Partie ľudí z tabuľky (kvôli starým riadkom výkazu bez zákazky). */
    async crewIdsOf(workerIds) {
      if (!this._members) {
        try {
          const { data } = await DB.list('crew_members', { select: 'crew_id,worker_id,left_at', limit: 3000 });
          this._members = data || [];
        } catch (e) { this._members = []; }
      }
      const from = this.st.dates[0].date;
      const ids = new Set(workerIds);
      return [...new Set(this._members
        .filter(m => ids.has(m.worker_id) && (!m.left_at || String(m.left_at).slice(0, 10) >= from))
        .map(m => m.crew_id))];
    },

    async loadSheet() {
      const st = this.st;
      let rows = [];
      try {
        const { data } = await DB.list('hour_sheets', { filters: { iso_year: st.year, iso_week: st.week }, limit: 200 });
        rows = data || [];
      } catch (e) { rows = []; }
      st.crewIds = await this.crewIdsOf(st.rows.map(r => r.worker_id));
      const sheet = SCAN() && SCAN().pickSheet
        ? SCAN().pickSheet(rows, { subcontractId: st.subId, crewIds: st.crewIds, year: st.year, week: st.week })
        : null;
      st.sheet = sheet;
      st.sheetSigned = !!(sheet && sheet.signed_at);
      st.signed = st.sheetSigned;
      st.signer = (sheet && sheet.signed_by_name) || '';
      if (sheet && sheet.signed_at) st.signedOn = String(sheet.signed_at).slice(0, 10);
      if (sheet && sheet.storage_path && !st.scan) st.scan = { path: sheet.storage_path, name: 'sken z minula', saved: true };
    },

    render() {
      const st = this.st;
      const sc = Sub.items.find(s => s.id === st.subId) || {};
      const days = st.dates;
      const kw = `KW ${st.week} · ${UI.date(days[0].date)} – ${UI.date(days[days.length - 1].date)}`;
      // Súčet len z dní, ktoré sú v tabuľke — to isté sa potom uloží.
      const rowTotal = (r) => days.reduce((n, d) => n + (Number(r.cells[d.date]) || 0), 0);
      const grand = st.rows.reduce((n, r) => n + rowTotal(r), 0);
      const others = (Sub.workers || []).filter(w => !st.rows.some(r => r.worker_id === w.id));
      const day = (d) => st.days[d.date] || {};

      UI.modal('Zapísať hodiny', `
        <form id="he-form" onsubmit="event.preventDefault();HourEntry.save()">
          <p class="modal-lead">Natukajte hodiny z listu, ktorý podpísal majster — alebo nahrajte jeho fotku
            a appka ich prečíta sama. ${UI.tip('Hodiny sa uložia k nasadeniu každého človeka na tejto zákazke. Z nich sa potom uzavrie obdobie a vystaví faktúra odberateľovi. Čo už v týždni bolo zapísané, sa prepíše tým, čo je tu.')}</p>
          <div class="form-grid">
            ${UI.field('sub', 'Zákazka', { value: st.subId,
              options: Sub.items.filter(s => !['lost', 'cancelled'].includes(s.status))
                .map(s => [s.id, `${s.title}${s.site_city ? ` · ${s.site_city}` : ''}`]),
              onchange: 'HourEntry.setSub(this.value)' })}
            <div class="fld"><span>Týždeň ${UI.tip('KW = Kalenderwoche, číslo týždňa na liste. Podľa neho sa doplnia dátumy.')}</span>
              <div class="he-week">
                <button type="button" class="btn btn-outline btn-sm" onclick="HourEntry.shift(-1)" aria-label="Predošlý týždeň">${Icon('back', 14)}</button>
                <b>${UI.esc(kw)}</b>
                <button type="button" class="btn btn-outline btn-sm" onclick="HourEntry.shift(1)" aria-label="Ďalší týždeň">${Icon('chevron', 14)}</button>
              </div>
            </div>
          </div>

          <div class="he-upload">
            <button type="button" class="btn btn-outline" onclick="HourEntry.blank()">${Icon('print', 15)} Prázdny list na tlač</button>
            <label class="btn btn-primary">${Icon('upload', 15)} Nahrať fotku alebo PDF
              <input type="file" accept="image/*,application/pdf" hidden onchange="HourEntry.scan(this.files[0])"></label>
            <span class="muted" id="he-scan-st">${st.scan ? `Nahraté: ${UI.esc(st.scan.name)}` : 'Fotka z mobilu stačí — aj otočená.'}</span>
            ${UI.tip('Appka z fotky prečíta dátumy, časy, mená a hodiny a vyplní ich do tabuľky. Skontrolujte to — rukopis sa dá prečítať zle. Fotka sa uloží k výkazu ako doklad.')}
          </div>
          ${st.warnings.length ? `<div class="warnbox br-warn">${st.warnings.map(w => `<div>${Icon('alert', 13)} ${UI.esc(w)}</div>`).join('')}</div>` : ''}
          ${st.loadError ? `<div class="warnbox br-warn">${Icon('alert', 13)} Zapísané hodiny tohto týždňa sa nenačítali (${UI.esc(st.loadError)}). Kým sa nenačítajú, uložiť sa nedá — inak by sa zapísali druhýkrát. Skúste týždeň otvoriť znova.</div>` : ''}

          <div class="he-wrap"><table class="he-grid">
            <thead>
              <tr><th class="he-name">Meno</th>${days.map(d => `<th><b>${UI.esc(d.sk || d.de)}</b><em>${UI.esc(UI.date(d.date).slice(0, 6))}</em></th>`).join('')}<th>Spolu</th></tr>
              <tr class="he-meta"><td class="he-name muted-sm">Od – do ${UI.tip('Nepovinné. Ak sú časy na liste, zapíšte ich — pri kontrole Zoll sa môžu hodiť.')}</td>${days.map(d => `
                <td><input type="text" inputmode="numeric" placeholder="od–do" value="${UI.esc(day(d).span || '')}"
                  onchange="HourEntry.setDay('${d.date}','span',this.value)" aria-label="Od do ${UI.esc(d.date)}"></td>`).join('')}<td></td></tr>
              <tr class="he-meta"><td class="he-name muted-sm">Prestávka</td>${days.map(d => `
                <td><input type="text" inputmode="numeric" placeholder="min" value="${UI.esc(day(d).pause || '')}"
                  onchange="HourEntry.setDay('${d.date}','pause',this.value)" aria-label="Prestávka ${UI.esc(d.date)}"></td>`).join('')}<td></td></tr>
            </thead>
            <tbody>
              ${st.rows.map((r, i) => `<tr>
                <td class="he-name"><b>${UI.esc(r.name)}</b>${r.raw ? `<em>na liste: ${UI.esc(r.raw)}</em>` : ''}</td>
                ${days.map(d => `<td><input type="text" inputmode="decimal" value="${UI.esc(fmtMin(r.cells[d.date]))}"
                  onchange="HourEntry.setCell(${i},'${d.date}',this.value)" aria-label="${UI.esc(r.name)} ${UI.esc(d.date)}"></td>`).join('')}
                <td class="he-sum">${UI.esc(sumText(rowTotal(r)))}</td>
              </tr>`).join('') || `<tr><td colspan="${days.length + 2}" class="js-empty">Na tejto zákazke v tomto týždni nikto nie je nasadený. Pridajte človeka nižšie.</td></tr>`}
              ${(st.unmatched || []).map((u, i) => `<tr class="he-unk">
                <td class="he-name"><b>Na liste: ${UI.esc(u.name_raw)}</b>
                  <select onchange="HourEntry.assignUnknown(${i}, this.value)">
                    <option value="">— kto je to? —</option>
                    ${(Sub.workers || []).map(w => `<option value="${w.id}">${UI.esc(w.full_name)}</option>`).join('')}
                  </select></td>
                ${days.map(d => `<td class="muted-sm">${UI.esc(fmtMin((u.cells || {})[d.date]))}</td>`).join('')}
                <td class="he-sum">${UI.esc(sumText(Object.values(u.cells || {}).reduce((n, m) => n + m, 0)))}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr><td class="he-name">Spolu</td>${days.map(d => `<td class="he-sum">${UI.esc(fmtMin(st.rows.reduce((n, r) => n + (Number(r.cells[d.date]) || 0), 0)))}</td>`).join('')}
              <td class="he-sum he-total">${UI.esc(sumText(grand))}</td></tr></tfoot>
          </table></div>

          <div class="btn-row">
            ${others.length ? `<select id="he-add" class="he-add" aria-label="Pridať človeka">
              <option value="">+ Pridať človeka…</option>
              ${others.map(w => `<option value="${w.id}">${UI.esc(w.full_name)}</option>`).join('')}</select>
              <button type="button" class="btn btn-outline btn-sm" onclick="HourEntry.addPerson()">${Icon('plus', 14)} Pridať</button>` : ''}
            ${st.rows.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" onclick="HourEntry.copyFirst()">Všetkým ako prvý riadok</button>
              ${UI.tip('Keď celá partia robila rovnako, vyplňte prvý riadok a týmto ho skopírujete všetkým.')}` : ''}
            ${window.Tms ? `<button type="button" class="btn btn-ghost btn-sm" onclick="HourEntry.oneDay()">${Icon('plus', 14)} Jeden deň inej práce</button>
              ${UI.tip('Len na výnimky: jeden deň jedného človeka, keď to nebola práca na stavbe (cesta, dielňa) alebo treba popis práce. Bežné hodiny zo stavby píšte do tabuľky vyššie.')}` : ''}
          </div>

          <div class="form-section">Podpis majstra ${UI.tip('Podpis sa ukladá k výkazu tejto zákazky a týždňa. Ten istý podpis vidí aj Výkaz pre odberateľa — zapisuje sa len tu.')}</div>
          ${st.sheetSigned ? `<div class="regimebox">${Icon('check', 14)} Podpísané ${UI.esc(UI.date(st.sheet.signed_at))}${
              st.sheet.signed_by_name ? ` — ${UI.esc(st.sheet.signed_by_name)}` : ''}.
              Čo bolo na papieri, sa už nemení. Hodiny sa opraviť dajú, ale výkaz zostáva taký, aký ho majster podpísal.</div>
            <div class="form-grid">
              ${UI.field('paper_total', 'Spolu na papieri', { value: st.paperTotal, placeholder: 'napr. 193',
                tip: 'Číslo „Total" z listu. Appka ho porovná so súčtom v tabuľke — keď nesedí, niekde je chyba.' })}
            </div>`
          : `<div class="form-grid">
            ${UI.field('signed', 'Podpísal majster (Kunde)', { type: 'checkbox', value: st.signed,
              tip: 'Zaškrtnite len keď je na liste podpis majstra. Podpísané hodiny sa rovno schvália a dajú sa fakturovať.' })}
            ${UI.field('signer', 'Meno majstra (paličkovým písmom na liste)', { value: st.signer })}
            ${UI.field('signed_on', 'Kedy podpísal', { type: 'date', value: st.signedOn })}
            ${UI.field('paper_total', 'Spolu na papieri', { value: st.paperTotal, placeholder: 'napr. 193',
              tip: 'Číslo „Total" z listu. Appka ho porovná so súčtom v tabuľke — keď nesedí, niekde je chyba.' })}
          </div>`}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Uložiť hodiny</button>
          </div>
        </form>`, { wide: true });
      const card = document.querySelector('#ui-modal .modal-card');
      if (card) card.classList.add('modal-xl');
    },

    /** Prázdny Stundennachweis pre túto zákazku a týždeň (s menami zo stavby). */
    blank() {
      this.keepForm();
      const st = this.st;
      const sc = Sub.items.find(s => s.id === st.subId) || {};
      const partner = (Sub.partners || []).find(p => p.id === sc.partner_id) || null;
      if (!Danubra.supplierReady('Stundennachweis')) return;
      const html = DanubraPapers.stundennachweis({ supplier: Danubra.supplier(), subcontract: sc, partner,
        week: { year: st.year, week: st.week }, workers: st.rows.map(r => ({ full_name: r.name })),
        rows: Math.max(6, st.rows.length) });
      Docs.show(window.open('', '_blank'), html, { kind: 'stundennachweis', title: 'Stundennachweis',
        who: sc.title, lang: 'de', subcontract_id: sc.id, partner_id: sc.partner_id || null });
    },

    // ── Úpravy v tabuľke ─────────────────────────────────────────────────
    keepForm() {
      const f = document.getElementById('he-form');
      if (!f) return;
      const d = UI.formData(f);
      this.st.paperTotal = d.paper_total || '';
      // Podpísaný výkaz sa v okne nemení — jeho polia tam ani nie sú.
      if (this.st.sheetSigned) return;
      this.st.signed = !!d.signed; this.st.signer = d.signer || '';
      if (d.signed_on) this.st.signedOn = d.signed_on;
    },
    async setSub(id) {
      this.keepForm();
      Object.assign(this.st, { subId: id, extra: [], scan: null, unmatched: [], warnings: [], sunday: false });
      await this.loadWeek(); this.render();
    },
    async shift(n) {
      this.keepForm();
      const w = HSL().shiftWeek(this.st.year, this.st.week, n);
      Object.assign(this.st, { year: w.year, week: w.week, scan: null, unmatched: [], warnings: [], days: {}, sunday: false });
      await this.loadWeek(); this.render();
    },

    /**
     * „Jeden deň" — výnimka v tom istom okne: jeden človek, jeden deň, iný
     * druh práce (cesta, dielňa) alebo s popisom. Otvorí krátky formulár
     * z Odpracovaných hodín, obmedzený na túto zákazku.
     */
    async oneDay() {
      this.keepForm();
      if (!window.Tms) return;
      if (!Tms.loaded) await Tms.load();
      const st = this.st;
      UI.closeModal();
      Tms.form({ subcontractId: st.subId, date: st.dates[0].date });
    },
    parse(v) {
      const s = SCAN();
      if (s && s.parseHours) { const m = s.parseHours(v); return m == null ? 0 : m; }
      const t = String(v || '').trim();
      const hm = t.match(/^(\d{1,2})[:.h ]\s*(\d{1,2})\s*(min)?$/i);
      if (hm && t.includes(':')) return Number(hm[1]) * 60 + Number(hm[2]);
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? Math.round(n * 60) : 0;
    },
    setCell(i, date, v) { this.keepForm(); this.st.rows[i].cells[date] = this.parse(v); this.render(); },
    setDay(date, key, v) {
      this.st.days[date] = { ...(this.st.days[date] || {}), [key]: v };
    },
    addPerson() {
      const sel = document.getElementById('he-add');
      if (!sel || !sel.value) return;
      this.keepForm();
      const w = Sub.workerOf(sel.value);
      const cells = {}; for (const d of this.st.dates) cells[d.date] = 0;
      this.st.rows.push({ worker_id: sel.value, name: (w || {}).full_name || '?', cells });
      this.render();
    },
    copyFirst() {
      this.keepForm();
      const first = this.st.rows[0];
      for (const r of this.st.rows.slice(1)) r.cells = { ...first.cells };
      this.render();
    },
    assignUnknown(i, workerId) {
      if (!workerId) return;
      this.keepForm();
      const u = this.st.unmatched.splice(i, 1)[0];
      const w = Sub.workerOf(workerId);
      const row = this.st.rows.find(r => r.worker_id === workerId);
      if (row) row.cells = { ...row.cells, ...u.cells };
      else this.st.rows.push({ worker_id: workerId, name: (w || {}).full_name || '?', raw: u.name_raw, cells: { ...u.cells } });
      this.render();
    },

    // ── Fotka → hodiny ───────────────────────────────────────────────────
    async scan(file) {
      if (!file) return;
      this.keepForm();
      const st = this.st;
      const say = (t) => { const el = document.getElementById('he-scan-st'); if (el) el.textContent = t; };
      say('Pripravujem fotku…');
      // Fotka z mobilu má aj 10 MB. Na prečítanie stačí 2000 px — menšia
      // sa rýchlejšie nahrá aj prečíta (funkcia má časový limit).
      if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
        try { file = await this.shrink(file, 2000); } catch (e) { /* pošle sa pôvodná */ }
      }
      if (file.size > 6 * 1024 * 1024) { say(''); return UI.toast('Súbor je väčší ako 6 MB — odfoťte ho v menšom rozlíšení.', 'err'); }
      say('Nahrávam…');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `hours/${st.subId}/${st.year}-W${pad(st.week)}-${Date.now()}.${ext}`;
      const up = await DB.client.storage.from(DB.DOCS_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (up.error) { say(''); return UI.toast('Nahratie zlyhalo: ' + up.error.message, 'err'); }
      st.scan = { path, name: file.name };
      say('Čítam hodiny z fotky… (asi 20 sekúnd)');
      try {
        const sc = Sub.items.find(s => s.id === st.subId) || {};
        const { data: s } = await DB.client.auth.getSession();
        const res = await fetch('/.netlify/functions/danubra-read-hours', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(s && s.session && s.session.access_token) || ''}` },
          body: JSON.stringify({ storage_path: path, year: st.year, site: [sc.title, sc.site_city].filter(Boolean).join(', '),
            // Funkcia čaká číslo KW (rok ide v `year`) — objekt zahodila a model
            // nedostal žiadnu nápovedu, o ktorý týždeň ide.
            workers: (Sub.workers || []).map(w => w.full_name), week_hint: st.week }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.sheet) throw new Error(out.error || 'Fotku sa nepodarilo prečítať.');
        await this.applySheet(out.sheet);
        UI.toast('Hodiny sú prečítané — skontrolujte ich', 'ok');
      } catch (e) {
        say(`Nahraté: ${file.name}`);
        UI.toast(e.message || 'Fotku sa nepodarilo prečítať — natukajte hodiny ručne.', 'err');
      }
    },

    /** Zmenší fotku na najviac `max` px na dlhšej strane (JPEG). Spoločné s doklady ľudí. */
    shrink(file, max) { return UI.shrinkImage(file, max); },

    /** Prečítaný list → týždeň, časy, riadky. Nepriradené mená ostanú na výber. */
    async applySheet(sheet) {
      const st = this.st;
      const S = SCAN();
      if (sheet.kw_from) {
        const w = HSL().isoWeek(new Date(`${sheet.kw_from}T12:00:00Z`));
        if (w.week !== st.week || w.year !== st.year) { st.year = w.year; st.week = w.week; st.sunday = false; await this.loadWeek(); }
      }
      // Nedeľa z listu: stĺpec sa pridá, inak by sa jej hodiny zarátali do
      // súčtu, ale neuložili.
      const sundayOnSheet = (sheet.days || []).some(d => Number(d.weekday) === 7)
        || (sheet.rows || []).some(r => (r.per_day || []).some(c => Number(c.weekday) === 7 && Number(c.minutes) > 0));
      if (sundayOnSheet && !st.sunday) {
        st.sunday = true;
        st.dates = this.weekDays();
        const sun = st.dates[st.dates.length - 1].date;
        for (const r of st.rows) if (!(sun in r.cells)) r.cells[sun] = 0;
      }
      const byWd = {};
      for (const d of st.dates) byWd[((new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1] = d.date;
      for (const d of sheet.days || []) {
        const date = d.date || byWd[d.weekday];
        if (!date) continue;
        st.days[date] = { span: d.from && d.to ? `${d.from}–${d.to}` : '', pause: d.pause_min != null ? String(d.pause_min) : '' };
      }
      const matched = S && S.matchWorkers ? S.matchWorkers(sheet.rows || [], Sub.workers || []) : (sheet.rows || []).map(r => ({ ...r, worker_id: null }));
      st.unmatched = [];
      for (const r of matched) {
        const cells = {};
        // Len dni, ktoré v tabuľke sú — inak by súčet ukazoval hodiny, ktoré sa neuložia.
        for (const c of r.per_day || []) {
          const date = c.date || byWd[c.weekday];
          if (date && st.dates.some(d => d.date === date)) cells[date] = Number(c.minutes) || 0;
        }
        if (!r.worker_id) { st.unmatched.push({ name_raw: r.name_raw, cells }); continue; }
        const row = st.rows.find(x => x.worker_id === r.worker_id);
        if (row) { row.cells = { ...row.cells, ...cells }; row.raw = r.name_raw; }
        else st.rows.push({ worker_id: r.worker_id, name: (Sub.workerOf(r.worker_id) || {}).full_name || r.name_raw, raw: r.name_raw, cells });
      }
      // Už podpísaný výkaz fotka neprepíše — podpis je zapísaný.
      if (!st.sheetSigned) {
        st.signed = !!sheet.signed;
        if (sheet.signer_name) st.signer = sheet.signer_name;
      }
      if (sheet.total_minutes) st.paperTotal = fmtMin(sheet.total_minutes);
      st.warnings = [];
      try { if (S && S.check) st.warnings = (S.check(sheet) || []).map(w => (typeof w === 'string' ? w : w.text || w.message)).filter(Boolean); } catch (e) { /* bez kontroly */ }
      if (sheet.confidence === 'low') st.warnings.unshift('Fotka sa čítala ťažko — skontrolujte každé číslo.');
      this.render();
    },

    // ── Uloženie ─────────────────────────────────────────────────────────
    /**
     * Uloží týždeň. Dvojklik na „Uložiť" spustil dve uloženia naraz a obe
     * zapísali tie isté hodiny — deň sa zarátal dvakrát. Kým beží jedno,
     * druhé sa nespustí.
     */
    async save() {
      if (this._saving) return;
      this._saving = true;
      try { await this._save(); } finally { this._saving = false; }
    },

    async _save() {
      this.keepForm();
      const st = this.st;
      if (st.loadError) {
        return UI.toast('Zapísané hodiny tohto týždňa sa nenačítali — uložiť sa nedá, inak by sa zapísali druhýkrát. Otvorte týždeň znova.', 'err');
      }
      const grand = st.rows.reduce((n, r) => n + st.dates.reduce((a, d) => a + (Number(r.cells[d.date]) || 0), 0), 0);
      if (!grand) return UI.toast('Tabuľka je prázdna — nie je čo uložiť', 'err');
      if (st.paperTotal) {
        const p = this.parse(st.paperTotal);
        if (p && p !== grand && !await UI.confirm(`Súčet v tabuľke (${sumText(grand)}) nesedí so súčtom na papieri (${sumText(p)}). Uložiť aj tak?`,
          { ok: 'Uložiť aj tak', danger: false })) return;
      }
      const signed = !!(st.signed || st.sheetSigned);
      const sc = Sub.items.find(s => s.id === st.subId) || {};
      const plan = SCAN().planWeek({
        dates: st.dates, rows: st.rows, existing: st.existing, signed, days: st.days,
        assignmentFor: (w, d) => this.assignmentFor(w, d),
        closedOn: (d) => this.closedOn(d),
        activity: sc.work_type === 'workshop' ? 'workshop' : 'construction',
      });
      const label = (x) => `${x.name} ${UI.date(x.date)}`;
      const locked = plan.locked.map(label);
      const missing = plan.missing.map(label);
      if (locked.length) UI.toast(`Obdobie je už uzavreté, tieto hodiny sa nezmenia: ${locked.slice(0, 4).join(', ')}${locked.length > 4 ? '…' : ''}`, 'warn');
      if (missing.length && !await UI.confirm(`Niektoré hodiny nemajú nasadenie na tejto zákazke a neuložia sa: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}. Pokračovať?`,
        { ok: 'Uložiť ostatné', danger: false })) return;

      let err = null;
      for (const w of plan.writes) {
        let r;
        // Nula = riadok sa archivuje (nič sa fyzicky nemaže) — nezostane
        // v zozname ako neschválený výkaz za 0 hodín.
        if (w.insert) r = await DB.insert('timesheets', w.insert);
        else if (w.archive) r = await DB.archive('timesheets', w.id);
        else r = await DB.update('timesheets', w.id, w.patch);
        if (r && r.error) { err = r.error; break; }
      }
      if (err) {
        // Časť sa mohla zapísať — načítať týždeň znova, nech ďalšie uloženie
        // nezapíše to isté druhýkrát.
        // Čo je v tabuľke natukané, zostáva.
        const keep = { rows: st.rows, signed: st.signed, signer: st.signer };
        try { await this.loadWeek(); } catch (e) { /* ukáže sa v okne */ }
        Object.assign(st, keep);
        this.render();
        return UI.toast('Chyba pri ukladaní: ' + err.message, 'err');
      }

      // Výkaz (Stundennachweis) k zákazke a týždňu — podpis a sken.
      let sheetErr = null;
      try { sheetErr = await this.saveSheet(grand); } catch (e) { sheetErr = e.message || String(e); }
      if (sheetErr) UI.toast(`Hodiny sú uložené, ale podpis a sken k výkazu nie: ${sheetErr}`, 'warn');

      this.lastSub = st.subId;
      if (window.Tms) Tms.loaded = false;
      if (window.HS) HS.loaded = false;
      Sub.loaded = false;
      this.done(grand);
    },

    /**
     * Uloží výkaz zákazky a týždňa do `hour_sheets` — jediné miesto, kam sa
     * podpis majstra zapisuje. Vráti text chyby alebo `null`.
     *
     * Podpísaný výkaz je zmrazený (trigger `danubra_hour_sheet_frozen`):
     * mení sa na ňom už len sken a doplní sa zákazka, ak ju starý riadok
     * partie nemal. Obsah papiera zostáva taký, aký majster podpísal.
     */
    async saveSheet(grand) {
      const st = this.st;
      const ex = st.sheet;
      const scanPath = st.scan && st.scan.path && !st.scan.saved ? st.scan.path : null;
      if (ex && ex.signed_at) {
        const patch = {};
        if (!ex.subcontract_id) patch.subcontract_id = st.subId;
        if (scanPath && scanPath !== ex.storage_path) patch.storage_path = scanPath;
        if (!Object.keys(patch).length) return null;
        const { error } = await DB.update('hour_sheets', ex.id, patch);
        return error ? error.message : null;
      }
      const sc = Sub.items.find(s => s.id === st.subId) || {};
      const partner = (Sub.partners || []).find(p => p.id === sc.partner_id) || null;
      const S = SCAN();
      const snapshot = S && S.sheetSnapshot ? S.sheetSnapshot({
        dates: st.dates, rows: st.rows, days: st.days, source: st.scan ? 'scan' : 'manual',
        project: sc.contract_number || sc.title || '', customer: partner ? partner.name : '',
        site: [sc.site_name, sc.site_city].filter(Boolean).join(', '),
      }) : { rows: st.rows, days: st.days };
      const patch = {
        snapshot,
        total_hours: S && S.hoursDecimal ? S.hoursDecimal(grand) : (grand / 60).toFixed(2),
        signed_at: st.signed ? new Date(`${st.signedOn || new Date().toISOString().slice(0, 10)}T12:00:00Z`).toISOString() : null,
        signed_by_name: st.signed ? (st.signer || null) : null,
      };
      if (scanPath) patch.storage_path = scanPath;
      if (ex) {
        if (!ex.subcontract_id) patch.subcontract_id = st.subId;
        const { error } = await DB.update('hour_sheets', ex.id, patch);
        return error ? error.message : null;
      }
      const row = { subcontract_id: st.subId, iso_year: st.year, iso_week: st.week, ...patch };
      let { error } = await DB.insert('hour_sheets', { ...row, crew_id: null });
      // Kým nie je v databáze migrácia 065, partia je v `hour_sheets` povinná.
      // Keď sú všetci z tabuľky z jednej partie, výkaz sa priradí jej.
      if (error && (st.crewIds || []).length === 1) {
        ({ error } = await DB.insert('hour_sheets', { ...row, crew_id: st.crewIds[0] }));
      }
      // Nepodpísaný list bez skenu nemá čo stratiť — hodiny sú uložené.
      if (error && !st.signed && !scanPath) return null;
      return error ? error.message : null;
    },

    done(grand) {
      const st = this.st;
      const people = st.rows.filter(r => Object.values(r.cells).some(m => m > 0)).length;
      UI.modal('Hodiny sú uložené', `
        <p class="modal-lead"><b>${UI.esc(sumText(grand))}</b> za KW ${st.week} pre ${people}
          ${people === 1 ? 'človeka' : 'ľudí'}${st.signed || st.sheetSigned ? ' — podpísané a schválené.' : ' — zatiaľ bez podpisu majstra.'}</p>
        <div class="pick-list">
          <button type="button" class="pick-tile" onclick="UI.closeModal();Danubra.go('timesheets')">
            <span class="bdl-ico">${Icon('clock', 18)}</span><span class="bdl-txt"><b>Pozrieť hodiny</b><em>Odpracované hodiny podľa ľudí a dní</em></span></button>
          ${Danubra.routeAvailable('invoices') ? `<button type="button" class="pick-tile" onclick="UI.closeModal();Danubra.go('invoices');setTimeout(()=>Inv.newInvoice&&Inv.newInvoice(),400)">
            <span class="bdl-ico">${Icon('invoices', 18)}</span><span class="bdl-txt"><b>Fakturovať odberateľovi</b><em>Zo zákazky — z odpracovaných hodín, alebo celý mesiac naraz</em></span></button>` : ''}
          ${Danubra.routeAvailable('hoursheet') && window.HS ? `<button type="button" class="pick-tile" onclick="UI.closeModal();HS.openFor({ subcontractId: '${st.subId}', year: ${st.year}, week: ${st.week} })">
            <span class="bdl-ico">${Icon('print', 18)}</span><span class="bdl-txt"><b>Výkaz pre odberateľa</b><em>Ten istý týždeň na tlač, po nemecky</em></span></button>` : ''}
          <button type="button" class="pick-tile" onclick="HourEntry.open({ subcontractId: '${st.subId}' })">
            <span class="bdl-ico">${Icon('plus', 18)}</span><span class="bdl-txt"><b>Zapísať ďalší list</b><em>Iný týždeň alebo iná zákazka</em></span></button>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal();Danubra.renderRoute()">Zavrieť</button></div>`, { wide: true });
    },
  };

  window.HourEntry = HourEntry;
})();
