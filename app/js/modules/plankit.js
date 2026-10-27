// ============================================================================
// DANUBRA — podklady k náboru: zadanie, zhrnutie zákazky, texty po kanáloch
// ============================================================================
// Ku každému náboru vzniká jeden dokument: čo o zákazke vieme, a potom texty na
// priame vloženie — web, Bazoš CZ, Bazoš SK, Facebook CZ, Facebook SK, platená
// reklama, voiceover a prompty na obrázky. Doteraz to žilo mimo appky, takže pri
// ďalšej zákazke sa hľadalo, čo sa minule písalo a kam sa to dávalo.
//
// Tvar dokumentu je v `lib/recruiting/kit.js`, texty v databáze. Tu je len
// obrazovka — a tri veci, na ktorých stojí, aby sa dala naozaj používať:
//
//   * **jeden blok = jedno tlačidlo Kopírovať.** Tak sa to aj vkladá: titulok
//     do titulku, text do textu. Kopírovať celý dokument naraz je nanič.
//   * **`[XX]` je vidieť.** Je to dohodnutá značka pre to, čo sa ešte nevie.
//     Kanál s nedoplnenou sadzbou sa neoznačí za hotový — inzerát, na ktorý
//     ľudia zavolajú a nikto im nevie povedať sadzbu, je horší než žiadny.
//   * **nič sa nemaže.** Nová verzia textu starú archivuje; to, čo odišlo na
//     Bazoš, musí byť čitateľné aj o pol roka, keď sa niekto ozve na starý
//     inzerát.
// ============================================================================
(function () {
  const K = window.DanubraKit;

  const Kit = {
    planId: null, assets: [], ads: [], loaded: false, open: null,

    async load(planId) {
      this.planId = planId;
      const [a, ads] = await Promise.all([
        DB.list('plan_assets', { filters: { plan_id: planId },
          order: { column: 'created_at', ascending: true }, limit: 500 }),
        DB.list('ads', { filters: { plan_id: planId }, limit: 200 }),
      ]);
      this.assets = (a.data || []).filter(x => !x.archived_at);
      this.ads = ads.data || [];
      this.loaded = true;
    },

    rowsFor() { return this.assets; },
    assetOf(channel, block) {
      return this.assets.find(x => x.channel === channel && x.block === block) || null;
    },

    // ── Celá sekcia podkladov ─────────────────────────────────────────────
    html(plan) {
      const st = K.state(this.rowsFor());
      const sum = K.summary(this.rowsFor());
      const ch = K.checklist(plan, this.rowsFor());
      const nehotove = ch.filter(x => !x.done);

      return `
        ${this.briefHtml(plan)}
        ${this.factsHtml(plan)}
        ${this.extrasHtml(plan)}

        <div class="form-section" id="plan-kanaly">Podklady po kanáloch
          ${Help.btn('card.kit.channels', { size: 13 })}</div>
        <div class="kit-sum kit-${sum.tone}">${UI.esc(sum.text)}</div>
        ${st.map(c => this.channelHtml(c)).join('')}

        <div class="form-section">Kde sme inzerovali
          ${Help.btn('card.kit.where', { size: 13 })}</div>
        ${this.adsHtml(plan)}

        <div class="form-section">Pred zverejnením${UI.tip('Kontrolný zoznam pred vložením inzerátov: zelená bodka = hotové, oranžová = ešte chýba. Appka ho počíta sama z náboru a textov.')}</div>
        ${nehotove.length ? '' : `<div class="regimebox">${Icon('check', 14)}
          Všetko hotové — podklady sú pripravené na vloženie.</div>`}
        ${ch.map(x => `
          <div class="list-row" style="align-items:flex-start;">
            <span class="dot ${x.done ? 'green' : 'amber'}" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;">
              ${UI.esc(x.text)}
              ${x.why ? `<span style="display:block;font-size:12px;color:var(--ink-mute);">
                ${UI.esc(x.why)}</span>` : ''}
            </span>
          </div>`).join('')}`;
    },

    /** Posun na zadanie. Z vety „čo spraviť" sa musí dať ísť tam, kde sa píše. */
    focusBrief() {
      const el = document.getElementById('plan-brief');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    },

    // ── Zadanie ───────────────────────────────────────────────────────────
    /**
     * Čo o zákazke vieme, voľným textom. Píše to ten, kto zákazku priniesol —
     * a nemusí pri tom myslieť na to, čo z toho appka potrebuje.
     */
    briefHtml(plan) {
      const brief = plan.brief || '';
      // Podklady už sú (zanalyzované alebo aspoň texty) → tlačidlo pregeneruje.
      const maPodklady = !!plan.analyzed_at || (this.assets || []).some(a => !a.archived_at);
      const a = plan.analysis || {};
      // Zadanie sa zmenilo od poslednej prípravy — podklady sú podľa starého.
      const zmeneneZadanie = maPodklady && typeof a._brief === 'string'
        && a._brief.trim() !== String(brief).trim();
      // Zhrnutie upravené od poslednej prípravy — texty o tom ešte nevedia.
      const zmeneneZhrnutie = maPodklady && a._dirty === true;
      const zmenene = zmeneneZadanie || zmeneneZhrnutie;
      return `
        <div class="form-section">Zadanie — čo o zákazke vieme
          ${Help.btn('card.kit.brief', { size: 13 })}</div>
        <div class="kit-brief">
          <textarea id="plan-brief" rows="${brief ? 8 : 5}"
            placeholder="Vložte všetko, čo o zákazke viete — aj neučesané. Čo sa stavia, kde, koľko ľudí, aké remeslo, čo je podmienka, aká sadzba, odkedy. Pokojne aj e-mail od odberateľa.">${UI.esc(brief)}</textarea>
          <div class="kit-brief-acts">
            <button class="btn btn-outline btn-sm" onclick="Kit.saveBrief('${plan.id}')">
              ${Icon('check', 14)} Uložiť zadanie</button>
            ${maPodklady
              ? `<button class="btn btn-primary btn-sm" onclick="Kit.analyze('${plan.id}', { regen: true })">
                  ${Icon('repeat', 14)} Pregenerovať podklady</button>`
              : `<button class="btn btn-primary btn-sm" onclick="Kit.analyze('${plan.id}')">
                  ${Icon('zap', 14)} Pripraviť podklady (texty a otázky)</button>`}
            <span class="kit-note">${maPodklady
              ? `${plan.analyzed_at ? `Pripravené ${UI.date(plan.analyzed_at)}. ` : ''}`
                + 'Pregenerovanie vezme zadanie, ako je teraz. Prepíše len to, čo napísala '
                + 'appka — čo ste upravili alebo schválili, ostane.'
              : 'Vyplní zhrnutie aj texty po kanáloch. Všetko sa dá prepísať.'}</span>
          </div>
          ${zmenene ? `<div class="warnbox" style="margin-top:8px;">${Icon('alert', 14)}
            ${zmeneneZadanie && zmeneneZhrnutie ? 'Zadanie aj zhrnutie ste od poslednej prípravy zmenili'
              : zmeneneZadanie ? 'Zadanie ste od poslednej prípravy zmenili'
                : 'Zhrnutie alebo doplnky ste od poslednej prípravy zmenili'} — texty sú ešte podľa starého.
            <button class="link-inline" onclick="Kit.analyze('${plan.id}', { regen: true })">
              Pregenerovať</button></div>` : ''}
        </div>`;
    },

    async saveBrief(planId) {
      const el = document.getElementById('plan-brief');
      if (!el) return;
      const { error } = await DB.update('recruitment_plans', planId, { brief: el.value });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const p = Hire.plans.find(x => x.id === planId); if (p) p.brief = el.value;
      UI.toast('Zadanie uložené', 'ok');
    },

    // ── Zhrnutie zákazky ──────────────────────────────────────────────────
    factsHtml(plan) {
      const facts = K.factsState(plan.analysis || {});
      const chyba = facts.filter(f => f.must && !f.filled).length;
      const gaps = facts.reduce((s, f) => s + f.gaps, 0);
      return `
        <div class="form-section">Zhrnutie zákazky
          ${Help.btn('card.kit.facts', { size: 13 })}</div>
        ${chyba || gaps ? `<div class="warnbox kit-missing" style="margin-bottom:10px;">
          ${Icon('alert', 14)}
          <div>
            <b>Appka nenašla v zadaní: ${UI.esc(facts.filter(f => (f.must && !f.filled) || f.gaps)
              .map(f => f.title.toLowerCase()).join(', '))}.</b>
            <span>Doplňte to priamo tu do poľa (prepíšte ${K.CHYBA}) a kliknite na Pregenerovať —
              údaj sa dostane do všetkých textov naraz.</span>
          </div>
          ${plan.analyzed_at ? `<button class="btn btn-primary btn-sm"
            onclick="Kit.analyze('${plan.id}', { regen: true })">${Icon('repeat', 14)} Pregenerovať</button>` : ''}
        </div>` : ''}
        <div class="kit-facts">
          ${facts.map(f => this.factField(plan, f)).join('')}
        </div>`;
    },

    // ── Doplnky od nás ────────────────────────────────────────────────────
    // Veci, ktoré v zadaní od Nemca nikdy nebudú, lebo sú naše: ako nám
    // živnostník fakturuje, čo k tomu dostane navyše a čokoľvek ďalšie.
    // Nepovinné — ale keď sú, appka ich pri príprave aj pregenerovaní
    // zapracuje do textov (`analysis._extra`).
    EXTRAS: [
      ['billing', 'Fakturácia pre živnostníka',
        (dni) => `napr. faktúra raz za mesiac so súpisom prác, splatnosť ${dni} dní, záloha po prvom týždni`,
        (dni) => ['faktúra raz za mesiac', 'faktúra každé 2 týždne', `splatnosť ${dni} dní`,
          'splatnosť 7 dní', 'faktúra so súpisom prác a montážnym denníkom',
          'záloha po prvom týždni', 'prvá faktúra so skoršou úhradou']],
      ['benefits', 'Benefity a výhody',
        () => 'napr. preplatená doprava, záloha pred prvou výplatou, dlhodobá spolupráca, pracovné oblečenie',
        () => ['ubytovanie hradíme', 'doprava hradená', 'záloha pred prvou výplatou',
          'pravidelné platby načas', 'dlhodobá spolupráca', 'pomôžeme s A1 a papiermi',
          'pracovné oblečenie', 'partia môže ísť spolu']],
      ['more', 'Ďalšie podklady a poznámky',
        () => 'čokoľvek, čo má byť v textoch alebo čo treba vedieť — vlastnými slovami',
        () => ['nástup ihneď', 'nemčina nie je podmienka', 'vodičský preukaz výhodou',
          'vlastné auto výhodou', 'práca aj v sobotu', 'vhodné aj pre partiu']],
    ],

    extrasHtml(plan) {
      const x = (plan.analysis && plan.analysis._extra) || {};
      const dni = Number((Danubra.cfg('subcontract') || {}).splatnost_dni) || 14;
      return `
        <div class="form-section">Doplnky od nás — nepovinné${UI.tip('Naše podmienky, ktoré v e-maile od nemeckého odberateľa nebudú: ako nám živnostník fakturuje, čo dostane navyše. Klik na štítok ho pridá alebo odoberie; dá sa aj písať vlastnými slovami.')}</div>
        <p class="kit-note" style="margin:-4px 0 10px;">Čo tu napíšete, appka zapracuje do textov
          pri príprave aj pri pregenerovaní. Nemusíte vyplniť nič.</p>
        <div class="kit-extras">
          ${this.EXTRAS.map(([k, label, ph, moznosti]) => `
            <div class="kit-fact">
              <span>${UI.esc(label)}</span>
              <div class="kx-chips">${moznosti(dni).map(m => `
                <button type="button" class="kx-chip${K.hasItem(x[k], m) ? ' on' : ''}"
                  onclick="Kit.toggleExtra('${plan.id}','${k}',this.dataset.v)"
                  data-v="${UI.esc(m)}">${K.hasItem(x[k], m) ? Icon('check', 12) : Icon('plus', 12)}
                  ${UI.esc(m)}</button>`).join('')}</div>
              <textarea rows="2" placeholder="${UI.esc(ph(dni))}"
                onchange="Kit.saveExtra('${plan.id}','${k}',this.value)">${UI.esc(x[k] || '')}</textarea>
            </div>`).join('')}
        </div>`;
    },

    /** Klik na štítok: pridá ho do poľa, alebo ho odoberie. */
    toggleExtra(planId, key, phrase) {
      const p = Hire.plans.find(x => x.id === planId);
      const teraz = (((p && p.analysis) || {})._extra || {})[key] || '';
      return this.saveExtra(planId, key, K.toggleItem(teraz, phrase), true);
    },

    async saveExtra(planId, key, value, ticho) {
      const p = Hire.plans.find(x => x.id === planId);
      const prev = (p && p.analysis) || {};
      const next = { ...prev, _extra: { ...(prev._extra || {}), [key]: value }, _dirty: true };
      const { error } = await DB.update('recruitment_plans', planId, { analysis: next });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (p) p.analysis = next;
      if (!ticho) UI.toast('Uložené — pri pregenerovaní sa to zapracuje do textov', 'ok');
      Danubra.renderRoute();
    },

    /**
     * Jedno pole zhrnutia. Nástup je kalendár, trvanie počet týždňov alebo
     * „dlhodobá" — nie voľný text, do ktorého sa zmestil dátum, čas aj dĺžka
     * naraz a nič z toho sa nedalo použiť.
     */
    factField(plan, f) {
      const zahlavie = `<span>${UI.esc(f.title)}${f.must ? ' *' : ''}</span>`;
      const chyba = f.gaps || (f.must && !f.filled);
      if (f.type === 'date') {
        const iso = K.isoDatum(f.body);
        // Starý text, z ktorého sa dátum nedal prečítať — aby sa nestratil.
        const povodne = f.body && !iso && !f.body.includes(K.CHYBA) ? f.body : '';
        return `<label class="kit-fact${!iso ? ' has-gap' : ''}">${zahlavie}
          <input type="date" data-fact="${f.key}" value="${iso}"
            onchange="Kit.saveStart('${plan.id}',this.value)">
          ${povodne ? `<em class="kit-was">bolo: ${UI.esc(povodne)}</em>` : ''}
        </label>`;
      }
      if (f.type === 'duration') {
        const t = K.trvanie(f.body);
        return `<div class="kit-fact${!t.weeks && !t.longTerm ? ' has-gap' : ''}">${zahlavie}
          <div class="kit-dur">
            <input type="number" min="1" max="104" inputmode="numeric" placeholder="počet"
              value="${t.weeks || ''}" ${t.longTerm ? 'disabled' : ''}
              onchange="Kit.saveDuration('${plan.id}',this.value,false)">
            <span>týždňov</span>
            <label class="kit-dur-long"><input type="checkbox" ${t.longTerm ? 'checked' : ''}
              onchange="Kit.saveDuration('${plan.id}','',this.checked)"> dlhodobá</label>
            ${UI.tip('Koľko týždňov práca na stavbe potrvá. Ak koniec nie je určený (práca na mesiace), zaškrtnite „dlhodobá".')}
          </div>
        </div>`;
      }
      return `<label class="kit-fact${chyba && f.gaps ? ' has-gap' : ''}">${zahlavie}
        <input data-fact="${f.key}" value="${UI.esc(f.body)}"
          placeholder="${UI.esc(f.hint || '')}"
          onchange="Kit.saveFact('${plan.id}','${f.key}',this.value)">
      </label>`;
    },

    /** Nástup do zhrnutia aj do náboru — inak by karta náboru ukazovala iný dátum. */
    async saveStart(planId, iso) {
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const { error } = await DB.update('recruitment_plans', planId, { start_date: iso });
        if (error) return UI.toast('Chyba: ' + error.message, 'err');
        const p = Hire.plans.find(x => x.id === planId); if (p) p.start_date = iso;
      }
      return this.saveFact(planId, 'start', iso || '');
    },

    saveDuration(planId, weeks, longTerm) {
      return this.saveFact(planId, 'duration', K.trvanieText({ weeks, longTerm }));
    },

    async saveFact(planId, key, value) {
      const p = Hire.plans.find(x => x.id === planId);
      const prev = (p && p.analysis) || {};
      // Čo človek v zhrnutí prepísal, pregenerovanie nechá na pokoji.
      const next = { ...prev, [key]: value, _human: { ...(prev._human || {}), [key]: true },
        _dirty: true };
      const { error } = await DB.update('recruitment_plans', planId, { analysis: next });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (p) p.analysis = next;
      Danubra.renderRoute();
    },

    // ── Jeden kanál ───────────────────────────────────────────────────────
    channelHtml(c) {
      const isOpen = this.open === c.key;
      const TONE = { hotove: 'green', doplnit: 'amber', rozrobene: 'blue', prazdne: 'gray' };
      const LABEL = { hotove: 'hotové', doplnit: `treba doplniť ${c.gaps}`,
        rozrobene: `${c.done} z ${c.total}`, prazdne: 'prázdne' };
      return `
        <div class="acc${c.ready ? ' acc-done' : ''}">
          <button type="button" class="acc-head" onclick="Kit.toggle('${c.key}')">
            <span class="acc-mark ${c.ready ? 'done' : ''}">${c.ready ? Icon('check', 13) : ''}</span>
            <span style="flex:1;text-align:left;">
              <strong>${UI.esc(c.title)}</strong>
              <span style="display:block;font-size:12px;color:var(--ink-mute);">${UI.esc(c.lead)}</span>
            </span>
            ${UI.badge(LABEL[c.state], TONE[c.state])}
            <span style="color:var(--ink-mute);display:flex;transform:rotate(${isOpen ? '90' : '0'}deg);">
              ${Icon('chevron', 15)}</span>
          </button>
          ${isOpen ? `<div class="acc-body">
            ${c.key === 'images' ? this.filesHtml() : ''}
            ${c.blocks.map(b => this.blockHtml(c, b)).join('')}
          </div>` : ''}
        </div>`;
    },

    toggle(key) { this.open = this.open === key ? null : key; Danubra.renderRoute(); },

    /**
     * Jeden blok textu. Má vlastné tlačidlo Kopírovať, pretože presne tak sa
     * aj vkladá — titulok do titulku, text do textu.
     */
    blockHtml(c, b) {
      const id = `kit-${c.key}-${b.key}`;
      const navrh = b.row && b.row.source === 'ai' && !b.row.approved_at;
      return `
        <div class="kit-block${b.gaps ? ' has-gap' : ''}">
          <div class="kit-block-head">
            <b>${UI.esc(b.title)}${b.must ? ' *' : ''}</b>
            ${navrh ? UI.badge('návrh', 'blue') + UI.tip('Text napísala appka a nikto ho ešte neuložil. Keď ho skontrolujete a uložíte (fajka vpravo), berie sa ako schválený a pregenerovanie ho už neprepíše.') : ''}
            ${b.gaps ? UI.badge(`${b.gaps}× ${K.CHYBA}`, 'amber') + UI.tip(`${K.CHYBA} je značka pre údaj, ktorý appka v zadaní nenašla (napr. sadzba). Prepíšte ho skutočnou hodnotou — kým tam je, kanál nie je hotový.`) : ''}
            <span style="margin-left:auto;display:flex;gap:6px;">
              ${b.filled ? `<button class="btn btn-ghost btn-sm" title="Skopírovať"
                onclick="Kit.copy('${id}')">${Icon('copy', 14)}</button>` : ''}
              <button class="btn btn-ghost btn-sm" title="Uložiť"
                onclick="Kit.saveBlock('${c.key}','${b.key}')">${Icon('check', 14)}</button>
              <span style="align-self:center;display:inline-flex;">${UI.tip('Dve tlačidlá: kópia = skopíruje tento text do schránky na vloženie do inzerátu. Fajka = uloží Vašu úpravu. Predchádzajúca verzia sa nemaže, odloží sa do archívu.')}</span>
            </span>
          </div>
          ${b.hint ? `<div class="kit-hint">${UI.esc(b.hint)}</div>` : ''}
          <textarea id="${id}" rows="${b.body.split('\n').length > 3 ? 8 : 3}"
            placeholder="${UI.esc(b.hint || 'Text na priame vloženie')}">${UI.esc(b.body)}</textarea>
          ${b.row && b.row.updated_at ? `<div class="kit-note">
            Zmenené ${UI.date(b.row.updated_at)}${navrh ? ' · návrh od appky, prečítajte a upravte' : ''}</div>` : ''}
        </div>`;
    },

    copy(id) {
      const el = document.getElementById(id);
      const text = el ? el.value : '';
      if (!text.trim()) return UI.toast('Nie je čo kopírovať', 'err');
      navigator.clipboard?.writeText(text).then(
        () => UI.toast('Skopírované — vložte to do kanála', 'ok'),
        () => UI.toast('Nepodarilo sa skopírovať', 'err'));
    },

    /**
     * Uloží blok. Nová verzia starú **archivuje**, nie prepíše: to, čo odišlo
     * na Bazoš, musí byť čitateľné aj o pol roka.
     */
    async saveBlock(channel, block) {
      const el = document.getElementById(`kit-${channel}-${block}`);
      if (!el) return;
      const body = el.value;
      const old = this.assetOf(channel, block);
      if (old && String(old.body || '') === body) return UI.toast('Bez zmeny', 'ok');

      if (old) {
        const { error } = await DB.update('plan_assets', old.id,
          { archived_at: new Date().toISOString() });
        if (error) return UI.toast('Chyba: ' + error.message, 'err');
      }
      const def = K.blockDef(channel, block);
      const { data, error } = await DB.insert('plan_assets', {
        plan_id: this.planId, channel, block,
        title: def ? def.title : block,
        body, source: 'human',
        approved_at: new Date().toISOString(),
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.assets = this.assets.filter(x => !(x.channel === channel && x.block === block));
      if (data) this.assets.push(data);
      UI.toast('Uložené', 'ok');
      Danubra.renderRoute();
    },

    // ── Obrázky ───────────────────────────────────────────────────────────
    filesHtml() {
      const files = this.assets.filter(x => x.channel === 'images' && x.file_path);
      return `
        <div class="kit-files">
          ${files.map(f => `
            <div class="list-row">
              <span class="dot green"></span>
              <span style="flex:1;font-size:13px;">
                <strong>${UI.esc(f.file_name || 'obrázok')}</strong>
                <span style="display:block;font-size:12px;color:var(--ink-mute);">
                  ${UI.esc(f.title || '')} · ${UI.date(f.created_at)}</span>
              </span>
              <button class="btn btn-ghost btn-sm" onclick="Kit.openFile('${f.id}')"
                title="Otvoriť">${Icon('doc', 15)}</button>
            </div>`).join('') || `<div style="font-size:13px;color:var(--ink-mute);">
              Zatiaľ žiadne obrázky. Nahrajte hotové, aby sa pri ďalšej zákazke dalo z čoho vyjsť.</div>`}
          <label class="btn btn-outline btn-sm" style="margin-top:8px;">
            ${Icon('plus', 14)} Nahrať obrázok
            <input type="file" accept="image/*" hidden onchange="Kit.upload(this)">
          </label>
        </div>`;
    },

    async upload(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      input.value = '';
      UI.toast('Nahrávam…', 'ok');
      const { path, error } = await DB.uploadDoc(file,
        { folder: 'nabor', entityId: this.planId });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const { data, error: e2 } = await DB.insert('plan_assets', {
        plan_id: this.planId, channel: 'images', block: `file_${Date.now()}`,
        title: 'Hotový obrázok', file_path: path, file_name: file.name,
        file_type: file.type, source: 'human',
        approved_at: new Date().toISOString(),
        created_by: Danubra.user?.id || null,
      });
      if (e2) return UI.toast('Chyba: ' + e2.message, 'err');
      if (data) this.assets.push(data);
      UI.toast('Obrázok nahraný', 'ok');
      Danubra.renderRoute();
    },

    async openFile(id) {
      const f = this.assets.find(x => x.id === id);
      if (!f || !f.file_path) return;
      const { url, error } = await DB.signedDocUrl(f.file_path, 300);
      if (error || !url) return UI.toast('Odkaz sa nepodarilo vytvoriť', 'err');
      window.open(url, '_blank', 'noopener');
    },

    // ── Kde sme inzerovali ────────────────────────────────────────────────
    /**
     * Zoznam inzerátov tohto náboru. Nie je to druhá evidencia — sú to tie
     * isté inzeráty ako na obrazovke Inzeráty, len tu pri podkladoch, z ktorých
     * vznikli.
     */
    adsHtml(plan) {
      if (!this.ads.length) {
        return `<div style="font-size:13px;color:var(--ink-mute);">
          Zatiaľ nikde. Keď texty vložíte, zapíšte sem odkaz — inak sa o mesiac nedá
          povedať, ktorý kanál ľudí priniesol.
          <div style="margin-top:8px;">
            <button class="btn btn-outline btn-sm"
              onclick="Danubra.quickCreate('ad')">${Icon('plus', 14)} Zapísať inzerát</button>
          </div></div>`;
      }
      const kand = (adId) => (Hire.candidates || []).filter(c => c.ad_id === adId).length;
      return `
        ${this.ads.map(a => `
          <div class="list-row" role="button" tabindex="0" onclick="Danubra.go('ads')">
            <span class="dot ${a.active === false ? '' : 'green'}"></span>
            <span style="flex:1;font-size:13px;min-width:0;">
              <strong>${UI.esc(a.title)}</strong>
              <span style="display:block;font-size:12px;color:var(--ink-mute);">
                ${UI.esc(DanubraAds.channelLabel(a.channel))}
                ${a.channel_detail ? ` · ${UI.esc(a.channel_detail)}` : ''}
                ${a.starts_on ? ` · od ${UI.date(a.starts_on)}` : ''}
                ${a.active === false ? ' · nebeží' : ''}</span>
            </span>
            ${UI.badge(`${kand(a.id)} ${Shell.plural(kand(a.id), 'ozval sa', 'ozvali sa', 'ozvalo sa')}`,
              kand(a.id) ? 'green' : 'gray')}
          </div>`).join('')}
        <div style="margin-top:8px;">
          <button class="btn btn-outline btn-sm"
            onclick="Danubra.quickCreate('ad')">${Icon('plus', 14)} Zapísať ďalší</button>
        </div>`;
    },

    // ── Analýza ───────────────────────────────────────────────────────────
    /**
     * Pošle zadanie na server, ten z neho spraví zhrnutie a texty. Volá sa
     * zo servera, nie z prehliadača — kľúč k modelu je v premenných prostredia
     * a do appky sa nikdy nedostane.
     */
    /**
     * Spustí analýzu na pozadí a počká na výsledok.
     *
     * Texty do šiestich kanálov sa píšu minútu aj dve. Bežná funkcia na
     * Netlify skončí skôr (504) a podklady by sa nepripravili. Funkcia na
     * pozadí hneď odpovie „prijaté" a výsledok zapíše do náboru — tu sa
     * každé štyri sekundy pozrieme, či je hotovo.
     *
     * Vráti to isté, čo predtým vracala funkcia: `{ blocks, questions, plan,
     * skipped }`. Pri chybe hodí výnimku s vetou, ktorá sa dá ukázať.
     */
    async runAnalysis(planId, { onTick, timeoutMs = 6 * 60 * 1000, regen = false } = {}) {
      const job = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      let res;
      try {
        res = await fetch('/.netlify/functions/danubra-analyze-brief-background', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, job, regen }),
        });
      } catch (e) {
        throw new Error('server neodpovedal');
      }
      if (!res.ok && res.status !== 202) throw new Error(`server odpovedal ${res.status}`);

      const zaciatok = Date.now();
      while (Date.now() - zaciatok < timeoutMs) {
        await new Promise(r => setTimeout(r, 4000));
        if (onTick) onTick(Math.round((Date.now() - zaciatok) / 1000));
        const { data } = await DB.list('recruitment_plans',
          { select: 'id,analysis', filters: { id: planId }, limit: 1 });
        const j = data && data[0] && data[0].analysis && data[0].analysis._job;
        if (!j || j.id !== job) continue;
        if (j.status === 'done') return j;
        if (j.status === 'error') throw new Error(j.error || 'analýza zlyhala');
      }
      throw new Error('trvá to dlhšie než šesť minút — podklady sa možno ešte dopíšu, '
        + 'pozrite nábor o chvíľu');
    },

    async analyze(planId, { regen = false, potvrdene = false } = {}) {
      const el = document.getElementById('plan-brief');
      const brief = el ? el.value : '';
      if (!brief.trim()) {
        return UI.toast('Najprv napíšte do zadania, čo o zákazke vieme', 'err');
      }
      if (regen && !potvrdene) {
        const vlastne = (this.assets || []).filter(a => !a.archived_at
          && (a.source !== 'ai' || a.approved_at)).length;
        return UI.modal('Pregenerovať podklady?', `
          <p class="modal-lead">Appka vezme zadanie, ako je teraz,
            a napíše texty a zhrnutie znova.</p>
          <ul class="clean" style="font-size:13.5px;line-height:1.7;margin:0 0 6px;">
            <li>${Icon('repeat', 13)} Prepíše sa, čo napísala appka a nikto to neupravil.</li>
            <li>${Icon('check', 13)} Čo ste upravili alebo schválili, ostane${
              vlastne ? ` (${vlastne} ${Shell.plural(vlastne, 'text', 'texty', 'textov')})` : ''}.</li>
            <li>${Icon('lock', 13)} Staré texty sa nemažú — odložia sa do archívu.</li>
          </ul>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button class="btn btn-primary"
              onclick="UI.closeModal();Kit.analyze('${planId}', { regen: true, potvrdene: true })">
              ${Icon('repeat')} Pregenerovať</button>
          </div>`);
      }
      // Zadanie sa uloží aj tak — keby analýza spadla, text sa nestratí.
      await this.saveBrief(planId);

      // Okno počas písania. Dá sa zavrieť — podklady sa na serveri dopíšu
      // aj tak a pri ďalšom otvorení náboru tu budú.
      const okno = (sek) => UI.modal(regen ? 'Pregenerúvam podklady…' : 'Pripravujem podklady…', `
        <div class="prep-row prep-run">
          <span class="prep-ico">${Icon('clock', 16)}</span>
          <span class="prep-txt">
            <b>Píšem texty inzerátov a otázky do telefonátu</b>
            <em>Trvá to zvyčajne 1–2 minúty${sek ? ` · ${sek} s` : ''}. Okno môžete zavrieť —
              podklady sa uložia aj tak a uvidíte ich v nábore.</em>
          </span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
        </div>`);
      okno(0);
      let out;
      try {
        out = await this.runAnalysis(planId, { regen,
          onTick: (sek) => { if (document.getElementById('ui-modal')) okno(sek); } });
      } catch (e) {
        UI.closeModal();
        return UI.modal('Podklady sa nepripravili', `
          <div class="warnbox">${Icon('alert', 14)} ${UI.esc(e.message)}</div>
          <p class="muted">Zadanie ostalo uložené.
            Skúste to znova — keď to nepôjde ani druhýkrát, pošlite mi túto hlášku.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
            <button class="btn btn-primary"
              onclick="UI.closeModal();Kit.analyze('${planId}', { regen: ${regen}, potvrdene: true })">
              ${Icon('repeat')} Skúsiť znova</button>
          </div>`);
      }
      UI.closeModal();
      if (out.skipped) {
        return UI.modal('Analýza nie je nastavená', `
          <div class="warnbox">${Icon('alert', 14)}
            Na serveri chýba kľúč k modelu (<code>ANTHROPIC_API_KEY</code>), takže
            appka texty vyrobiť nevie.</div>
          <p class="muted">Podklady sa dajú písať aj
            ručne — zhrnutie aj každý kanál sa ukladá rovnako. Kľúč sa dopĺňa
            v premenných prostredia na Netlify.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          </div>`);
      }
      await Hire.load();
      await this.load(planId);

      // Čo analýza spravila. Nestačí povedať „hotovo": človek musí vedieť,
      // čo mu pribudlo do náboru a čo ešte musí potvrdiť.
      const polia = (out.plan || []).length;
      const casti = [
        `${out.blocks || 0} ${Shell.plural(out.blocks || 0, 'text', 'texty', 'textov')}`,
        polia ? `${polia} ${Shell.plural(polia, 'pole', 'polia', 'polí')} náboru` : null,
        out.questions ? `${out.questions} ${Shell.plural(out.questions,
          'otázka', 'otázky', 'otázok')} do hovoru` : null,
      ].filter(Boolean);
      if (out.regen && out.kept) {
        casti.push(`${out.kept} ${Shell.plural(out.kept, 'Váš text ostal', 'Vaše texty ostali', 'Vašich textov ostalo')}`);
      }
      UI.toast(`${out.regen ? 'Pregenerované' : 'Hotovo'} — ${casti.join(' · ')}`, 'ok');

      if (out.questions) {
        UI.modal('Pribudli otázky do hovoru', `
          <div class="regimebox">${Icon('check', 14)}
            ${out.questions} ${Shell.plural(out.questions, 'otázka', 'otázky', 'otázok')}
            pre remeselníka ${Shell.plural(out.questions, 'je', 'sú', 'je')} pripravených
            ako <strong>návrh</strong>.</div>
          ${out.newTrade ? `<div class="regimebox">${Icon('plus', 14)} Pribudlo remeslo
            <strong>${UI.esc(out.newTrade)}</strong> — v zozname nebolo. Sadzby a príručku
            k nemu doplníte v Remeslách a otázkach.</div>` : ''}
          <p class="muted">Zoznam otázok je to, podľa čoho
            sa rozhoduje o ľuďoch, takže doň nič nepribudne samo. Sú v nábore pod
            „Otázky do telefonátu" — prečítajte ich a pustite do hovoru jedným klikom.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
            <button class="btn btn-primary"
              onclick="UI.closeModal();setTimeout(()=>{const e=document.getElementById('plan-questions');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},200)">
              ${Icon('phone', 15)} Prečítať otázky</button>
          </div>`);
      }
      Danubra.renderRoute();
    },
  };

  window.Kit = Kit;
})();
