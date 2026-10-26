// ============================================================================
// DANUBRA — hodiny zo Stundennachweisu (zápis alebo fotka)
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

    assignmentFor(workerId, date) {
      const st = this.st;
      return (Sub.assignments || []).find(a => a.subcontract_id === st.subId && a.worker_id === workerId
        && (!a.date_from || a.date_from <= date) && (!a.date_to || a.date_to >= date)) || null;
    },

    async open(o = {}) {
      if (!window.Sub) return UI.toast('Zákazky nie sú dostupné', 'err');
      if (!Sub.loaded) await Sub.load();
      const active = Sub.items.filter(s => ['active', 'won'].includes(s.status));
      const subId = o.subcontractId || (active[0] || Sub.items[0] || {}).id;
      if (!subId) return UI.toast('Najprv založte zákazku', 'warn');
      // Predvolený je minulý týždeň — list prichádza po skončení týždňa.
      const now = HSL().isoWeek(new Date());
      const prev = HSL().shiftWeek(now.year, now.week, -1);
      this.st = {
        subId, year: o.year || prev.year, week: o.week || prev.week,
        rows: [], extra: [], days: {}, signed: false, signer: '', paperTotal: '',
        scan: null, warnings: [], sunday: false,
      };
      await this.loadWeek();
      this.render();
    },

    async loadWeek() {
      const st = this.st;
      const days = HSL().weekDates(st.year, st.week);
      st.dates = days;
      const people = this.peopleOf(st.subId, days);
      const ids = [...new Set([...people.map(w => w.id), ...st.extra])];
      // Čo je už zapísané v tomto týždni (aby sa nič nezapísalo dvakrát).
      let ts = [];
      try {
        const { data } = await DB.from('timesheets')
          .select('id,worker_id,assignment_id,work_date,hours,time_from,time_to,period_id')
          .gte('work_date', days[0].date).lte('work_date', days[days.length - 1].date).limit(2000);
        ts = data || [];
      } catch (e) { ts = []; }
      const asgIds = new Set((Sub.assignments || []).filter(a => a.subcontract_id === st.subId).map(a => a.id));
      st.existing = ts.filter(t => asgIds.has(t.assignment_id));
      st.rows = ids.map(id => {
        const w = Sub.workerOf(id) || { id, full_name: '?' };
        const cells = {};
        for (const d of days) {
          const t = st.existing.find(x => x.worker_id === id && x.work_date === d.date);
          cells[d.date] = t ? Math.round(Number(t.hours) * 60) : 0;
        }
        return { worker_id: id, name: w.full_name, cells };
      });
    },

    render() {
      const st = this.st;
      const sc = Sub.items.find(s => s.id === st.subId) || {};
      const days = st.dates;
      const kw = `KW ${st.week} · ${UI.date(days[0].date)} – ${UI.date(days[days.length - 1].date)}`;
      const rowTotal = (r) => Object.values(r.cells).reduce((n, m) => n + (Number(m) || 0), 0);
      const grand = st.rows.reduce((n, r) => n + rowTotal(r), 0);
      const others = (Sub.workers || []).filter(w => !st.rows.some(r => r.worker_id === w.id));
      const day = (d) => st.days[d.date] || {};

      UI.modal('Hodiny zo Stundennachweisu', `
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
            <label class="btn btn-primary">${Icon('upload', 15)} Nahrať fotku alebo PDF
              <input type="file" accept="image/*,application/pdf" hidden onchange="HourEntry.scan(this.files[0])"></label>
            <span class="muted" id="he-scan-st">${st.scan ? `Nahraté: ${UI.esc(st.scan.name)}` : 'Fotka z mobilu stačí — aj otočená.'}</span>
            ${UI.tip('Appka z fotky prečíta dátumy, časy, mená a hodiny a vyplní ich do tabuľky. Skontrolujte to — rukopis sa dá prečítať zle. Fotka sa uloží k výkazu ako doklad.')}
          </div>
          ${st.warnings.length ? `<div class="warnbox br-warn">${st.warnings.map(w => `<div>${Icon('alert', 13)} ${UI.esc(w)}</div>`).join('')}</div>` : ''}

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
          </div>

          <div class="form-section">Podpis</div>
          <div class="form-grid">
            ${UI.field('signed', 'Podpísal majster (Kunde)', { type: 'checkbox', value: st.signed,
              tip: 'Zaškrtnite len keď je na liste podpis majstra. Podpísané hodiny sa rovno schvália a dajú sa fakturovať.' })}
            ${UI.field('signer', 'Meno majstra (paličkovým písmom na liste)', { value: st.signer })}
            ${UI.field('paper_total', 'Spolu na papieri', { value: st.paperTotal, placeholder: 'napr. 193',
              tip: 'Číslo „Total" z listu. Appka ho porovná so súčtom v tabuľke — keď nesedí, niekde je chyba.' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Uložiť hodiny</button>
          </div>
        </form>`, { wide: true });
      const card = document.querySelector('#ui-modal .modal-card');
      if (card) card.classList.add('modal-xl');
    },

    // ── Úpravy v tabuľke ─────────────────────────────────────────────────
    keepForm() {
      const f = document.getElementById('he-form');
      if (!f) return;
      const d = UI.formData(f);
      this.st.signed = !!d.signed; this.st.signer = d.signer || ''; this.st.paperTotal = d.paper_total || '';
    },
    async setSub(id) { this.keepForm(); this.st.subId = id; this.st.extra = []; await this.loadWeek(); this.render(); },
    async shift(n) {
      this.keepForm();
      const w = HSL().shiftWeek(this.st.year, this.st.week, n);
      this.st.year = w.year; this.st.week = w.week;
      await this.loadWeek(); this.render();
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
      if (file.size > 8 * 1024 * 1024) return UI.toast('Súbor je väčší ako 8 MB — odfoťte ho v menšom rozlíšení.', 'err');
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
            workers: (Sub.workers || []).map(w => w.full_name), week_hint: { year: st.year, week: st.week } }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.sheet) throw new Error(out.error || 'Fotku sa nepodarilo prečítať.');
        await this.applySheet(out.sheet);
        UI.toast('Hodiny sú prečítané — skontrolujte ich', 'ok');
      } catch (e) {
        say(`Nahraté: ${file.name}`);
        UI.toast(e.message || 'Fotku sa nepodarilo prečítať — natukajte hodiny ručne.', 'err');
      }
    },

    /** Prečítaný list → týždeň, časy, riadky. Nepriradené mená ostanú na výber. */
    async applySheet(sheet) {
      const st = this.st;
      const S = SCAN();
      if (sheet.kw_from) {
        const w = HSL().isoWeek(new Date(`${sheet.kw_from}T12:00:00Z`));
        if (w.week !== st.week || w.year !== st.year) { st.year = w.year; st.week = w.week; await this.loadWeek(); }
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
        for (const c of r.per_day || []) { const date = c.date || byWd[c.weekday]; if (date) cells[date] = Number(c.minutes) || 0; }
        if (!r.worker_id) { st.unmatched.push({ name_raw: r.name_raw, cells }); continue; }
        const row = st.rows.find(x => x.worker_id === r.worker_id);
        if (row) { row.cells = { ...row.cells, ...cells }; row.raw = r.name_raw; }
        else st.rows.push({ worker_id: r.worker_id, name: (Sub.workerOf(r.worker_id) || {}).full_name || r.name_raw, raw: r.name_raw, cells });
      }
      st.signed = !!sheet.signed;
      if (sheet.signer_name) st.signer = sheet.signer_name;
      if (sheet.total_minutes) st.paperTotal = fmtMin(sheet.total_minutes);
      st.warnings = [];
      try { if (S && S.check) st.warnings = (S.check(sheet) || []).map(w => (typeof w === 'string' ? w : w.text || w.message)).filter(Boolean); } catch (e) { /* bez kontroly */ }
      if (sheet.confidence === 'low') st.warnings.unshift('Fotka sa čítala ťažko — skontrolujte každé číslo.');
      this.render();
    },

    // ── Uloženie ─────────────────────────────────────────────────────────
    async save() {
      this.keepForm();
      const st = this.st;
      const grand = st.rows.reduce((n, r) => n + Object.values(r.cells).reduce((a, m) => a + (Number(m) || 0), 0), 0);
      if (!grand) return UI.toast('Tabuľka je prázdna — nie je čo uložiť', 'err');
      if (st.paperTotal) {
        const p = this.parse(st.paperTotal);
        if (p && p !== grand && !await UI.confirm(`Súčet v tabuľke (${sumText(grand)}) nesedí so súčtom na papieri (${sumText(p)}). Uložiť aj tak?`,
          { ok: 'Uložiť aj tak', danger: false })) return;
      }
      const missing = [];
      const locked = [];
      const writes = [];
      for (const r of st.rows) {
        for (const d of st.dates) {
          const min = Number(r.cells[d.date]) || 0;
          const prev = st.existing.find(t => t.worker_id === r.worker_id && t.work_date === d.date);
          if (!min && !prev) continue;
          // Uzavreté obdobie sa nemení — z neho už vznikla faktúra.
          if (prev && prev.period_id) {
            if (Math.round(Number(prev.hours) * 60) !== min) locked.push(`${r.name} ${UI.date(d.date)}`);
            continue;
          }
          const a = this.assignmentFor(r.worker_id, d.date);
          if (!a) { if (min) missing.push(`${r.name} ${UI.date(d.date)}`); continue; }
          const span = (st.days[d.date] || {}).span || '';
          const m = span.match(/(\d{1,2})[:.]?(\d{2})?\s*[–-]\s*(\d{1,2})[:.]?(\d{2})?/);
          const row = {
            hours: (min / 60).toFixed(2), approved: !!st.signed,
            approved_at: st.signed ? new Date().toISOString() : null,
            time_from: m ? `${pad(m[1])}:${m[2] || '00'}` : null,
            time_to: m ? `${pad(m[3])}:${m[4] || '00'}` : null,
            source: 'stundennachweis',
          };
          writes.push(prev ? { id: prev.id, patch: row, del: !min }
            : { insert: { ...row, worker_id: r.worker_id, assignment_id: a.id, work_date: d.date,
              activity_type: (Sub.items.find(s => s.id === st.subId) || {}).work_type === 'workshop' ? 'workshop' : 'construction' } });
        }
      }
      if (locked.length) UI.toast(`Obdobie je už uzavreté, tieto hodiny sa nezmenia: ${locked.slice(0, 4).join(', ')}${locked.length > 4 ? '…' : ''}`, 'warn');
      if (missing.length && !await UI.confirm(`Niektoré hodiny nemajú nasadenie na tejto zákazke a neuložia sa: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}. Pokračovať?`,
        { ok: 'Uložiť ostatné', danger: false })) return;

      let err = null;
      for (const w of writes) {
        let r;
        if (w.insert) r = await DB.insert('timesheets', w.insert);
        else if (w.del) r = await DB.update('timesheets', w.id, { hours: 0, approved: false });
        else r = await DB.update('timesheets', w.id, w.patch);
        if (r && r.error) { err = r.error; break; }
      }
      if (err) return UI.toast('Chyba pri ukladaní: ' + err.message, 'err');

      // Výkaz (Stundennachweis) k zákazke a týždňu — podpis a sken.
      try {
        const { data: ex } = await DB.list('hour_sheets', { filters: { subcontract_id: st.subId, iso_year: st.year, iso_week: st.week }, limit: 1 });
        const snapshot = { rows: st.rows.map(r => ({ worker_id: r.worker_id, name: r.name, cells: r.cells })), days: st.days, source: st.scan ? 'scan' : 'manual' };
        const patch = { snapshot, total_hours: (grand / 60).toFixed(2), signed_at: st.signed ? new Date().toISOString() : null,
          signed_by_name: st.signer || null, storage_path: st.scan ? st.scan.path : undefined };
        if (patch.storage_path === undefined) delete patch.storage_path;
        if (ex && ex[0]) await DB.update('hour_sheets', ex[0].id, patch);
        else await DB.insert('hour_sheets', { subcontract_id: st.subId, iso_year: st.year, iso_week: st.week, ...patch });
      } catch (e) { console.warn('[danubra] výkaz', e); }

      if (window.Tms) Tms.loaded = false;
      Sub.loaded = false;
      this.done(grand);
    },

    done(grand) {
      const st = this.st;
      const people = st.rows.filter(r => Object.values(r.cells).some(m => m > 0)).length;
      UI.modal('Hodiny sú uložené', `
        <p class="modal-lead"><b>${UI.esc(sumText(grand))}</b> za KW ${st.week} pre ${people}
          ${people === 1 ? 'človeka' : 'ľudí'}${st.signed ? ' — podpísané a schválené.' : ' — zatiaľ bez podpisu majstra.'}</p>
        <div class="pick-list">
          <button type="button" class="pick-tile" onclick="UI.closeModal();Danubra.go('timesheets')">
            <span class="bdl-ico">${Icon('clock', 18)}</span><span class="bdl-txt"><b>Pozrieť hodiny</b><em>Odpracované hodiny podľa ľudí a dní</em></span></button>
          ${Danubra.routeAvailable('invoices') ? `<button type="button" class="pick-tile" onclick="UI.closeModal();Danubra.go('invoices');setTimeout(()=>Inv.newInvoice&&Inv.newInvoice(),400)">
            <span class="bdl-ico">${Icon('invoices', 18)}</span><span class="bdl-txt"><b>Fakturovať odberateľovi</b><em>Zo zákazky — z odpracovaných hodín, alebo celý mesiac naraz</em></span></button>` : ''}
          <button type="button" class="pick-tile" onclick="HourEntry.open({ subcontractId: '${st.subId}' })">
            <span class="bdl-ico">${Icon('plus', 18)}</span><span class="bdl-txt"><b>Zapísať ďalší list</b><em>Iný týždeň alebo iná zákazka</em></span></button>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal();Danubra.renderRoute()">Zavrieť</button></div>`, { wide: true });
    },
  };

  window.HourEntry = HourEntry;
})();
