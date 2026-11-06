// ============================================================================
// DANUBRA — SuperFaktúra v rozhraní: nastavenia, stav dokladu, akcie
// ============================================================================
// Prehliadač SuperFaktúru nikdy nevolá priamo. Všetko ide cez serverovú
// funkciu `danubra-sf-invoice` (kľúče sú len tam) a tá si stav faktúry overí
// v databáze — tlačidlo tu je len pohodlie, nie ochrana.
//
//   Nastavenia → SuperFaktúra: stav pripojenia (SANDBOX / PRODUKCIA),
//     „Otestovať spojenie", jazyk, bankový účet, číselný rad, reverse charge.
//   Vydané faktúry → detail: „V SuperFaktúre: vystavená / odoslaná /
//     uhradená", PDF zo SuperFaktúry, synchronizácia, dobropis, história.
//   Vydané faktúry → hore: „Vystaviť schválené v SuperFaktúre" (každá
//     zvlášť schválená adminom) a „Synchronizovať so SuperFaktúrou".
//   Denný limit požiadaviek (093): „Dnes použité: 123 z 1000 (synchronizácia
//     80 z 300)" v Nastaveniach, zostatok v tooltipe pásu nad faktúrami.
//     Keď sa minie rozpočet synchronizácie, tlačidlá synchronizácie sú vypnuté
//     s vysvetlením — vystavovanie a odosielanie majú vyhradenú rezervu.
// ============================================================================
(function () {
  const S = () => window.DanubraSF;
  const FN = '/.netlify/functions/danubra-sf-invoice';

  const SFUI = {
    status: null,
    _statusP: null,
    _busy: {},

    /** Volanie serverovej funkcie. Prihlásenie pridá DB (db.js) samo. */
    async call(action, payload = {}) {
      let res, json = null;
      try {
        res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload }) });
        try { json = await res.json(); } catch (e) { json = null; }
      } catch (e) {
        return { ok: false, json: { error: 'Server neodpovedal.', hint: 'Skontrolujte pripojenie na internet a skúste to znova.' } };
      }
      if (json && json.skipped) return { ok: false, skipped: true, json };
      return { ok: !!(res && res.ok && json && !json.error), status: res && res.status, json: json || { error: 'Nečakaná odpoveď servera.' } };
    },

    /** Chyba po slovensky aj s tým, čo spraviť. */
    errText(json) {
      const j = json || {};
      return [j.error || j.message || 'Nepodarilo sa.', j.hint].filter(Boolean).join(' ');
    },
    /** Chyba ako hláška; rada „čo spraviť" je za tlačidlom, aby sa dala dočítať. */
    toastErr(json) {
      const j = json || {};
      const msg = j.error || j.message || 'Nepodarilo sa.';
      if (!j.hint) return UI.toast(msg, 'err');
      UI.toast(msg, 'err', { action: 'Čo spraviť', run: () => UI.modal('SuperFaktúra', `
        <div class="warnbox">${Icon('alert', 14)} ${UI.esc(msg)}</div>
        <div class="regimebox">${UI.esc(j.hint)}</div>
        <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button></div>`) });
    },

    /** Stav pripojenia — raz za návštevu, bez kľúčov (akcia `status`). */
    async ensureStatus(force) {
      // Práve sa načítava (napr. po akcii) → počká sa na čerstvý stav, nie na starý.
      if (this._statusP && !force) return this._statusP;
      if (this.status && !force) return this.status;
      // Jedna požiadavka naraz (force = nová, napr. po akcii, ktorá minula požiadavky).
      // Platí len odpoveď na poslednú — staršia neskôr doručená stav neprepíše.
      const seq = (this._statusSeq = (this._statusSeq || 0) + 1);
      const p = this.call('status')
        .then(r => { if (seq === this._statusSeq) this.status = r.ok ? r.json : { error: true }; return this.status; })
        .catch(() => { if (seq === this._statusSeq) this.status = { error: true }; return this.status; })
        .finally(() => { if (this._statusP === p) this._statusP = null; });
      this._statusP = p;
      return p;
    },

    /** Dnešné počítadlo požiadaviek zo stavu (akcia `status`), alebo null. */
    usage(st = this.status) { return (st && !st.error && st.usage) || null; },
    /** Synchronizácia je na dnes vyčerpaná → tlačidlá synchronizácie sú vypnuté. */
    syncBlocked(st = this.status) { return !!(S() && S().syncExhausted(this.usage(st))); },
    syncBlockedText(st = this.status) {
      const u = this.usage(st) || {};
      return `Synchronizácia je na dnes vyčerpaná (${u.sync_used != null ? u.sync_used : '?'} z ${u.sync_budget || '?'} požiadaviek). `
        + 'Pokračuje zajtra ráno sama. Vystavovanie a odosielanie faktúr má vyhradenú rezervu'
        + `${u.remaining != null ? ` (dnes ešte ${u.remaining})` : ''}.`;
    },

    /** Počítadlo v Nastaveniach: text a pásik. */
    usageHtml(st = this.status) {
      const u = this.usage(st);
      if (!u) return '';
      if (u.available === false) {
        return `<div class="sf-usage is-red">${Icon('alert', 13)} Počítadlo požiadaviek na SuperFaktúru nie je dostupné — v databáze chýba
          migrácia 093. Kým sa nespustí, appka do SuperFaktúry nevolá, aby neprekročila denný limit.</div>`;
      }
      const pct = S().usagePct(u);
      const cap = u.limit ? Math.round((u.hard_cap || u.limit) * 100 / u.limit) : 100;
      const tone = u.remaining <= 0 || u.blocked ? ' is-red' : (this.syncBlocked(st) || pct >= 70 ? ' is-amber' : '');
      return `<div class="sf-usage${tone}" id="sf-usage">
          <div class="sf-usage-t"><span>${UI.esc(S().usageText(u))}</span>${UI.tip(`SuperFaktúra povoľuje ${u.limit} požiadaviek denne. `
            + `Appka ich nikdy nepošle viac než ${u.hard_cap}; synchronizácia a PDF smú najviac ${u.sync_budget}, zvyšok je rezerva `
            + 'na vystavovanie a odosielanie. Rátajú sa aj opakované pokusy. Počítadlo sa vynuluje o polnoci (slovenský čas).')}</div>
          <div class="sf-usage-bar" role="progressbar" aria-label="Požiadavky na SuperFaktúru dnes" aria-valuemin="0"
            aria-valuemax="${u.limit}" aria-valuenow="${u.used}"><span style="width:${pct}%"></span><i style="left:${cap}%"></i></div>
          ${u.blocked ? '<div class="muted-sm tx-red">SuperFaktúra hlási vyčerpaný limit — do polnoci appka do nej nič nepošle.</div>'
            : this.syncBlocked(st) ? `<div class="muted-sm">${UI.esc(this.syncBlockedText(st))}</div>` : ''}
        </div>`;
    },

    /** Malý ukazovateľ v páse nad faktúrami — zostatok je v tooltipe. */
    usageMini(st = this.status) {
      const u = this.usage(st);
      if (!u || u.available === false) return '';
      const tip = `Dnes zostáva ${u.remaining} z ${u.limit} požiadaviek na SuperFaktúru (synchronizácia ${u.sync_remaining} z ${u.sync_budget}). `
        + 'Vystavovanie a odosielanie má vyhradenú rezervu; počítadlo sa vynuluje o polnoci.';
      const tone = u.remaining <= 0 ? ' is-red' : this.syncBlocked(st) ? ' is-amber' : ' is-gray';
      return `<span class="sf-chip sf-req${tone}" data-tip="${UI.esc(tip)}" aria-label="${UI.esc(tip)}">dnes ${u.used}/${u.limit}</span>`;
    },

    /** Pás nad faktúrami po načítaní stavu: odznak, zostatok, vypnutá synchronizácia. */
    paintBar(el, items) {
      const bar = el && el.querySelector('.sf-bar');
      if (!bar) return;
      const html = this.barHtml(items);
      if (html) bar.outerHTML = html;
    },

    isProd(st = this.status) { return !!(st && st.environment === 'production'); },

    /** Odznak prostredia. Kým nie je produkcia, svieti SANDBOX. */
    envBadge(st = this.status) {
      if (!st) return '<span class="sf-env is-unknown">SuperFaktúra</span>';
      if (st.error) return `<span class="sf-env is-unknown" data-tip="Stav SuperFaktúry sa nepodarilo zistiť — server neodpovedal.">SuperFaktúra ?</span>`;
      if (st.environment === 'production') {
        return `<span class="sf-env is-prod" data-tip="Appka je pripojená na ostrý účet SuperFaktúry. Doklady sú ostré.">PRODUKCIA</span>`;
      }
      return `<span class="sf-env is-sandbox" data-tip="Appka je pripojená na skúšobný účet SuperFaktúry (sandbox). Doklady nie sú ostré. Na ostrý účet sa prepína premennou SF_ENV=production v Netlify — až po odsúhlasení majiteľom.">SANDBOX</span>`;
    },

    /** Čipy „V SuperFaktúre: …" pri faktúre. */
    chipsHtml(x) {
      const list = S() ? S().chips(x) : [];
      if (!list.length) return '';
      return `<span class="sf-chips"><span class="sf-chips-l">V SuperFaktúre:</span>${list.map(c => (c.key === 'sandbox'
        ? `<span class="sf-env is-sandbox is-sm" data-tip="${UI.esc(c.tip)}">SANDBOX</span>`
        : `<span class="sf-chip is-${c.tone}" data-tip="${UI.esc(c.tip)}">${UI.esc(c.label)}</span>`)).join('')}</span>`;
    },

    /** Malá značka v zozname faktúr pod stavom. */
    listMark(x) {
      if (!x || !x.sf_invoice_id) return '';
      const bad = x.sf_check === 'mismatch';
      const sand = S() && S().envOf(x.sf_environment) !== 'production';
      return `<small class="sf-mini${bad ? ' is-red' : ''}" title="${bad ? 'Nesúhlasí so SuperFaktúrou' : 'Doklad je v SuperFaktúre'}${sand ? ' (sandbox)' : ''}">SF${bad ? ' · nesúhlasí' : sand ? ' · sandbox' : ''}</small>`;
    },

    /**
     * Pás nad zoznamom faktúr: prostredie, hromadné vystavenie schválených
     * (len admin) a synchronizácia. Prázdny, kým SuperFaktúra nemá čo robiť.
     */
    barHtml(items) {
      const ready = this.approvedQueue().length;
      const inSf = (items || []).filter(x => x.sf_invoice_id).length;
      if (!ready && !inSf) return '';
      const admin = Danubra.isAdmin();
      const bad = (items || []).filter(x => x.sf_check === 'mismatch').length;
      return `<div class="sf-bar card">
        <span class="sf-bar-t"><b>SuperFaktúra</b>${window.Help ? Help.btn('card.inv.sfbar', { size: 13 }) : ''}<span class="sf-env-slot">${this.envBadge()}</span>${this.usageMini()}
          <span class="muted-sm">${inSf} ${Shell.plural(inSf, 'doklad', 'doklady', 'dokladov')} v SuperFaktúre${
            ready ? ` · ${ready} ${Shell.plural(ready, 'schválená čaká', 'schválené čakajú', 'schválených čaká')} na vystavenie` : ''}${
            bad ? ` · <b class="tx-red">${bad} nesúhlasí</b>` : ''}</span></span>
        <span class="sf-bar-a">
          ${admin && ready ? `<button class="btn btn-outline btn-sm" onclick="SFUI.bulkIssue()">${Icon('invoices', 14)} Vystaviť schválené v SuperFaktúre (${ready})</button>${
            UI.tip('Schválené faktúry (každú schválil admin) vystaví v SuperFaktúre naraz. Server pri každej overí schválenie '
              + 'v databáze. Odberateľom zatiaľ nič neodíde.')}` : ''}
          ${inSf ? (this.syncBlocked()
            ? `<button class="btn btn-outline btn-sm sf-sync-btn" disabled aria-disabled="true">${Icon('repeat', 14)} Synchronizovať so SuperFaktúrou</button>${
              UI.tip(this.syncBlockedText())}`
            : `<button class="btn btn-outline btn-sm sf-sync-btn" onclick="SFUI.sync()">${Icon('repeat', 14)} Synchronizovať so SuperFaktúrou</button>${
              UI.tip('Načíta zo SuperFaktúry stav úhrad vystavených faktúr — zoznamom, 100 dokladov na jednu požiadavku. Faktúry '
                + 'synchronizované za posledných 20 hodín preskočí. Plnú úhradu (ak ju Banka ešte nespárovala) zapíše ako zaplatenú, '
                + 'ostatné rozdiely len do histórie faktúry. To isté robí appka každé ráno sama.')}`) : ''}
        </span>
      </div>`;
    },

    // ── Nastavenia → SuperFaktúra ─────────────────────────────────────────
    settingsCard(cfg) {
      if (!Danubra.isAdmin()) return '';
      const v = (cfg && cfg.j('superfaktura')) || {};
      const sup = (cfg && cfg.j('supplier')) || {};
      const zle = cfg && cfg.failed && cfg.failed.key === 'superfaktura' ? cfg.failed : null;
      const val = (k, d) => (v[k] === undefined || v[k] === null ? d : v[k]);
      const f = (name, label, o = {}) => UI.field(name, label, { value: val(name, o.def ?? ''), ...o });
      return `
        <div class="card card-pad sf-card" id="sf-card" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">SuperFaktúra${UI.tip('Fakturačný program, cez ktorý vydané faktúry '
            + 'vznikajú ako doklady, odchádzajú odberateľom a kde sa zapisujú úhrady. Appka ho volá cez server — '
            + 'API kľúč nikdy nie je v prehliadači.')}${window.Help ? Help.btn('card.settings.sf', { size: 13 }) : ''}</div>
            <span id="sf-env-slot">${this.envBadge()}</span></div>
          <div id="sf-status" class="sf-status">${this.statusHtml()}</div>
          <div class="btn-row">
            <button type="button" class="btn btn-outline btn-sm" id="sf-ping" onclick="SFUI.ping()">${Icon('link', 14)} Otestovať spojenie</button>${
              UI.tip('Server sa prihlási do SuperFaktúry kľúčom z Netlify a vráti názov firmy v účte. Nič nevystaví, nič nepošle.')}
          </div>
          <div id="sf-ping-out" class="sf-ping-out" aria-live="polite"></div>
          ${zle ? `<div class="warnbox" style="margin:12px 0;">${Icon('alert', 14)} <strong>Neuložilo sa to.</strong> ${UI.esc(zle.message)}</div>` : ''}
          ${this.myDataNote(v, sup)}
          <div class="form-section">Ako appka vystavuje doklady${UI.tip('Tieto nastavenia sa použijú pri každom ďalšom vystavení. '
            + 'Už vystavené doklady sa nemenia.')}</div>
          <form id="cfg-superfaktura" onsubmit="event.preventDefault();Cfg.saveSection('superfaktura','cfg-superfaktura')">
            <div class="form-grid">
              ${f('default_language', 'Jazyk dokladu', { def: 'deu', options: S().LANGS,
                tip: 'Keď odberateľ nemá jazyk na karte. Nemeckým firmám ide doklad po nemecky (deu).' })}
              ${f('payment_type', 'Spôsob úhrady', { def: 'transfer', options: [['transfer', 'Prevodom na účet'], ['cash', 'V hotovosti'], ['card', 'Kartou']] })}
              ${f('iban', 'IBAN na doklade', { placeholder: sup.iban || 'SK00 0000 0000 0000 0000 0000',
                tip: 'Účet, na ktorý má odberateľ platiť. Prázdne = IBAN z Fakturačných údajov.' })}
              ${f('swift', 'BIC / SWIFT', { placeholder: sup.bic || 'napr. TATRSKBX' })}
              ${f('bank_account_id', 'Id bankového účtu v SuperFaktúre', { type: 'number',
                tip: 'Nepovinné. Keď je vyplnené, SuperFaktúra dá na doklad tento svoj účet a IBAN vyššie sa nepoužije. '
                  + 'Id nájdete v SuperFaktúre v Nastavenia → Bankové účty.' })}
              ${f('sequence_id', 'Id číselného radu v SuperFaktúre', { type: 'number',
                tip: 'Nepovinné. Číslo dokladu aj tak určuje appka (zákonné číslo z Číselných radov) — rad v SuperFaktúre '
                  + 'len zaradí doklad. Prázdne = predvolený rad.' })}
              ${f('due_days', 'Splatnosť, keď ju faktúra nemá (dní)', { type: 'number', def: 30,
                tip: 'Bežne sa splatnosť berie z faktúry (z karty odberateľa). Toto je len poistka.' })}
              ${f('cc', 'Kópia e-mailu s faktúrou', { type: 'email', placeholder: sup.email || 'napr. uctovnictvo@firma.sk',
                tip: 'Pri odoslaní cez SuperFaktúru príde kópia aj na túto adresu.' })}
              ${f('send_mode', 'Predvolené odoslanie', { def: 'sf', options: [['sf', 'Cez SuperFaktúru'], ['mail', 'Z našej schránky (Správy)']],
                tip: 'Pri odoslaní sa dá vybrať vždy. Toto je len to, čo je ponúknuté ako prvé.' })}
              <div class="fld-full">${f('reverse_charge_note', 'Veta k reverse charge na doklade', { placeholder: S().RC_DE,
                tip: 'Prázdne = nemecká veta „Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)." pre nemeckých '
                  + 'odberateľov a článok 196 smernice pre ostatných z EÚ. Doklad má sadzbu 0 % a v SuperFaktúre '
                  + 'označené prenesenie daňovej povinnosti.' })}</div>
              ${UI.field('use_own_number', 'Číslo dokladu z appky', { type: 'checkbox', value: val('use_own_number', true),
                placeholder: 'Do SuperFaktúry posielať naše číslo faktúry',
                tip: 'Zapnuté: doklad v SuperFaktúre dostane presne číslo z appky (zákonné číslo). Vypnuté: číslo pridelí '
                  + 'SuperFaktúra a appka ho len zapíše — potom sa čísla v appke a v SuperFaktúre rozídu.' })}
              ${UI.field('send_my_data', 'Údaje dodávateľa posielať z appky', { type: 'checkbox', value: val('send_my_data', true),
                placeholder: 'Údaje dodávateľa posielať z appky (z Fakturačných údajov)',
                tip: 'Zapnuté: názov, adresa, IČO, DIČ, IČ DPH a zápis v registri idú na doklad z Nastavenia → Fakturačné údaje, '
                  + 'bez ohľadu na profil účtu v SuperFaktúre. Vypnuté: SuperFaktúra ich vezme zo svojho Nastavenia → Moja firma.' })}
              ${UI.field('sync_daily', 'Denná synchronizácia', { type: 'checkbox', value: val('sync_daily', true),
                placeholder: 'Každé ráno načítať úhrady zo SuperFaktúry',
                tip: 'Ráno appka pozrie vystavené faktúry v SuperFaktúre. Plne uhradenú (a v Banke ešte nespárovanú) '
                  + 'označí ako zaplatenú, ostatné rozdiely len zapíše do histórie faktúry.' })}
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:12px;">
              <button type="submit" class="btn btn-primary btn-sm">${Icon('check')} Uložiť</button>
            </div>
          </form>
        </div>`;
    },

    /**
     * Odkiaľ sa berie dodávateľ na doklade. Sandbox má profil firmy vygenerovaný
     * náhodne — na skúšobnej faktúre preto stál v bloku „Lieferant" nezmysel.
     */
    myDataNote(v = {}, sup = {}) {
      const on = v.send_my_data !== false;
      if (!on) {
        return `<div class="warnbox sf-mydata">${Icon('alert', 14)} V SuperFaktúre skontrolujte Nastavenia → Moja firma — údaje dodávateľa na faktúre sa berú odtiaľ.</div>`;
      }
      const chyba = !String(sup.name || '').trim();
      return `<div class="${chyba ? 'warnbox' : 'regimebox'} sf-mydata">${chyba ? Icon('alert', 14) + ' ' : ''}Dodávateľ na doklade
        (názov, adresa, IČO, DIČ, IČ DPH, zápis v registri) ide z Fakturačných údajov appky${chyba
          ? ' — tie však nemajú názov firmy, takže SuperFaktúra zatiaľ použije svoj profil' : ''}.
        Logo, telefón, e-mail a web berie SuperFaktúra z Nastavenia → Moja firma — skontrolujte ich tam
        (v sandboxe aj na ostrom účte).</div>`;
    },

    statusHtml(st = this.status) {
      if (!st) return '<span class="muted-sm">Zisťujem stav pripojenia…</span>';
      if (st.error) return '<span class="tx-warn">Stav sa nepodarilo zistiť — server neodpovedal.</span>';
      const row = (k, v) => `<div><span>${k}</span><strong>${v}</strong></div>`;
      // <em>, nie <span>: `.kv span` je popis poľa (veľké písmená).
      const yes = (b) => (b ? `<em class="dl-ok sf-val">${Icon('check', 13)} nastavené</em>` : '<em class="tx-warn sf-val">chýba</em>');
      return `<div class="kv sf-kv">
          ${row('Prostredie', st.environment === 'production' ? 'Ostrý účet (production)' : 'Skúšobný účet (sandbox)')}
          ${row('Adresa', UI.esc(st.base || ''))}
          ${row('E-mail účtu (SF_EMAIL)', yes(st.email_set) + (st.account ? ` <em class="muted-sm sf-val">${UI.esc(st.account)}</em>` : ''))}
          ${row('API kľúč', yes(st.key_set))}
          ${row('Id firmy (SF_COMPANY_ID)', st.company_set ? yes(true) : '<em class="muted-sm sf-val">nepovinné, nenastavené</em>')}
        </div>
        ${this.usageHtml(st)}
        ${st.configured ? '' : `<div class="regimebox">Kľúče sa nastavujú v Netlify (Site configuration → Environment variables),
          nie tu — do prehliadača sa nikdy nedostanú. Bez nich faktúry zostanú schválené a vystavia sa, keď kľúče pribudnú.</div>`}`;
    },

    async paintStatus(force) {
      const st = await this.ensureStatus(force);
      const box = document.getElementById('sf-status');
      if (box) box.innerHTML = this.statusHtml(st);
      const slot = document.getElementById('sf-env-slot');
      if (slot) slot.innerHTML = this.envBadge(st);
      return st;
    },

    async ping() {
      const out = document.getElementById('sf-ping-out');
      const btn = document.getElementById('sf-ping');
      if (btn) btn.disabled = true;
      if (out) out.innerHTML = '<span class="muted-sm">Prihlasujem sa do SuperFaktúry…</span>';
      const r = await this.call('ping');
      if (btn) btn.disabled = false;
      // Test spojenia je jedna požiadavka z denného limitu — počítadlo sa obnoví.
      this.paintStatus(true).catch(() => {});
      if (!out) return r;
      if (r.ok) {
        const j = r.json;
        out.innerHTML = `<div class="sf-ok">${Icon('check', 14)} Spojenie funguje — ${j.environment === 'production' ? 'ostrý účet' : 'sandbox'}${
          j.company ? `, firma <b>${UI.esc(j.company)}</b>` : ''}${j.account ? ` (${UI.esc(j.account)})` : ''}.</div>`;
      } else {
        out.innerHTML = `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(this.errText(r.json))}</div>`;
      }
      return r;
    },

    // ── Detail faktúry ────────────────────────────────────────────────────
    /** Oddiel „SuperFaktúra" v detaile vydanej faktúry. */
    panelHtml(x) {
      const admin = Danubra.isAdmin();
      const credit = x.kind === 'credit_note';
      const has = !!x.sf_invoice_id;
      const btn = (label, ico, fn, tip, cls = 'btn-outline') =>
        `<button type="button" class="btn ${cls} btn-sm" onclick="${fn}">${Icon(ico, 14)} ${label}</button>${tip ? UI.tip(tip) : ''}`;
      const buttons = [];
      if (has) {
        buttons.push(btn('Stiahnuť PDF zo SuperFaktúry', 'download', `SFUI.pdf('${x.id}')`,
          'Stiahne doklad presne tak, ako je v SuperFaktúre, a uloží ho do Dokumentov k odberateľovi.'));
        if (this.syncBlocked()) {
          buttons.push(`<button type="button" class="btn btn-outline btn-sm sf-sync-btn" disabled aria-disabled="true">${Icon('repeat', 14)} Synchronizovať</button>${
            UI.tip(this.syncBlockedText())}`);
        } else {
          buttons.push(btn('Synchronizovať', 'repeat', `SFUI.sync('${x.id}')`,
            'Načíta zo SuperFaktúry (1 požiadavka), či a koľko je uhradené. Plnú úhradu (ak ju Banka ešte nespárovala) zapíše ako zaplatenú; '
              + 'ostatné rozdiely len zapíše do histórie.'));
        }
        if (x.status === 'paid' && !x.sf_paid_at && !credit) {
          buttons.push(btn('Zapísať úhradu do SuperFaktúry', 'check', `Inv.sfAction('${x.id}','pay')`,
            'V appke je faktúra zaplatená, v SuperFaktúre nie. Zapíše tam zostávajúcu sumu — nič nezapíše dvakrát.'));
        }
        if (!credit && ['issued', 'sent', 'overdue', 'paid'].includes(x.status) && admin) {
          buttons.push(btn('Stornovať dobropisom', 'undo', `SFUI.cancelForm('${x.id}')`,
            'Pripraví dobropis na celú sumu. Dobropis musí admin schváliť ako každú faktúru — až potom vznikne v SuperFaktúre '
              + 'a pôvodná faktúra sa stornuje. Nič sa nemaže.', 'btn-ghost'));
        }
      }
      const note = has ? '' : (x.status === 'approved'
        ? `<p class="muted-sm">Faktúra je schválená a čaká na vystavenie v SuperFaktúre${admin ? '' : ' — vystavuje administrátor'}.</p>`
        : '<p class="muted-sm">Doklad v SuperFaktúre vznikne až po schválení adminom a kliknutí „Vystaviť v SuperFaktúre".</p>');
      const kv = has ? `<div class="kv sf-kv">
          <div><span>Číslo v SuperFaktúre</span><strong class="mono">${UI.esc(x.sf_number || x.invoice_number || '—')}</strong></div>
          <div><span>Id dokladu</span><strong class="mono">${UI.esc(String(x.sf_invoice_id))}</strong></div>
          ${x.sf_total != null ? `<div><span>Suma v SuperFaktúre</span><strong>${UI.money(x.sf_total, x.currency)}</strong></div>` : ''}
          ${x.sf_paid_amount != null ? `<div><span>Uhradené v SuperFaktúre</span><strong>${UI.money(x.sf_paid_amount, x.currency)}</strong></div>` : ''}
          ${x.sf_synced_at ? `<div><span>Naposledy synchronizované</span><strong>${new Date(x.sf_synced_at).toLocaleString('sk-SK')}</strong></div>` : ''}
        </div>` : '';
      return `<div class="form-section">SuperFaktúra${UI.tip('Stav dokladu v SuperFaktúre. Zákonné číslo faktúry je to z appky — '
          + 'v SuperFaktúre musí byť rovnaké. SANDBOX = skúšobný účet, doklad nie je ostrý.')}</div>
        <div class="sf-panel">
          ${has ? this.chipsHtml(x) : ''}
          ${x.sf_check === 'mismatch' ? `<div class="warnbox sf-bad">${Icon('alert', 14)} Nesúhlasí so SuperFaktúrou: ${UI.esc(x.sf_check_note || '')}
            Faktúra sa neodošle, kým to niekto neskontroluje v SuperFaktúre.</div>` : ''}
          ${kv}${note}
          ${buttons.length ? `<div class="btn-row">${buttons.join('')}</div>` : ''}
          <div id="sf-hist-${x.id}" class="sf-hist"></div>
        </div>`;
    },

    /** História faktúry zo SuperFaktúry (danubra_activities). */
    async loadHistory(id) {
      const box = document.getElementById(`sf-hist-${id}`);
      if (!box) return;
      let rows = [];
      try {
        const { data } = await DB.list('activities', { filters: { entity_type: 'invoice', entity_id: id },
          order: { column: 'created_at', ascending: false }, limit: 30 });
        rows = (data || []).filter(a => ['superfaktura', 'alert'].includes(a.type));
      } catch (e) { rows = []; }
      if (!rows.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<details class="more-block"${rows.some(r => r.type === 'alert') ? ' open' : ''}><summary>História v SuperFaktúre (${rows.length})</summary>
        ${rows.map(a => `<div class="list-row is-static is-top"><span class="dot ${a.type === 'alert' ? 'red' : (a.channel_meta && a.channel_meta.ok === false ? 'amber' : '')}"></span>
          <span class="lr-main">${UI.esc(a.body || '')}<span class="lr-sub">${a.created_at ? new Date(a.created_at).toLocaleString('sk-SK') : ''}</span></span></div>`).join('')}
      </details>`;
    },

    // ── Akcie ─────────────────────────────────────────────────────────────
    async guarded(id, fn) {
      if (this._busy[id]) return UI.toast('Už sa na tom pracuje — počkajte prosím', 'warn');
      this._busy[id] = true;
      try { return await fn(); } finally { delete this._busy[id]; }
    },

    async refresh(id) {
      Inv.loaded = false; await Inv.load();
      if (id && document.getElementById('ui-modal')) Inv.detail(id);
      Danubra.renderRoute();
    },

    async pdf(id) {
      return this.guarded(id, async () => {
        // Okno sa otvára hneď pri kliknutí — inak ho prehliadač zablokuje.
        const w = window.open('', '_blank');
        UI.toast('Sťahujem PDF zo SuperFaktúry…');
        const r = await this.call('pdf', { invoice_id: id });
        if (!r.ok) { if (w) w.close(); return this.toastErr(r.json); }
        if (w) w.location.href = r.json.url; else window.location.href = r.json.url;
        UI.toast(r.json.cached ? 'PDF z Dokumentov' : 'PDF uložené do Dokumentov', 'ok');
        if (window.Docs) Docs.loaded = false;
        this.loadHistory(id);
      });
    },

    async sync(id) {
      return this.guarded(id || 'all', async () => {
        UI.toast(id ? 'Synchronizujem so SuperFaktúrou…' : 'Synchronizujem všetky faktúry so SuperFaktúrou…');
        const r = await this.call('sync', id ? { invoice_id: id } : {});
        // Synchronizácia minula požiadavky z denného limitu — počítadlo sa načíta znova.
        await this.ensureStatus(true).catch(() => {});
        if (!r.ok) { this.toastErr(r.json); if (r.json && r.json.code === 'budget') Danubra.renderRoute(); return; }
        const j = r.json;
        if (id) {
          const ch = (j.result && j.result.changes) || [];
          UI.toast(ch.includes('paid') ? 'Zaplatená podľa SuperFaktúry' : ch.length ? 'Rozdiely sú zapísané v histórii faktúry' : 'Bez zmeny', ch.includes('mismatch') ? 'err' : 'ok');
        } else {
          const req = j.requests != null ? ` · požiadavky na SuperFaktúru: ${j.requests}` : '';
          UI.toast(`Skontrolované ${j.checked || 0} · zaplatené ${j.paid || 0} · čiastočne ${j.partial || 0}${j.mismatch ? ` · nesúhlasí ${j.mismatch}` : ''}`
            + ((j.errors || []).length ? ` · chyby ${j.errors.length}` : '')
            + (j.skipped_recent ? ` · ${j.skipped_recent} synchronizovaných za posledných 20 h preskočených` : '')
            + (j.budget_stopped ? ` · ${j.pending || 0} počká na zajtra (denný limit)` : '') + req,
          (j.errors || []).length || j.mismatch || j.budget_stopped ? 'warn' : 'ok');
        }
        await this.refresh(id);
      });
    },

    /** Dobropis: dôvod je povinný, potom ho schváli admin. */
    cancelForm(id) {
      const x = Inv.items.find(i => i.id === id);
      if (!x) return;
      UI.modal(`Stornovať faktúru ${x.invoice_number || ''} dobropisom`, `
        <div class="regimebox">Vznikne <b>dobropis na celú sumu</b> (${UI.money(-Number(x.total || 0), x.currency)}). Najprv ako
          návrh, ktorý musí <b>schváliť administrátor</b> — až potom sa vystaví v SuperFaktúre ako doklad k faktúre
          ${UI.esc(x.invoice_number || '')} a pôvodná faktúra sa stornuje. Nič sa nemaže.${x.status === 'paid'
            ? ' <b>Faktúra je zaplatená</b> — peniaze bude treba odberateľovi vrátiť samostatnou platbou.' : ''}</div>
        <form id="sf-cancel" onsubmit="event.preventDefault();SFUI.cancel('${x.id}')">
          ${UI.field('reason', 'Dôvod dobropisu', { type: 'textarea', rows: 3, required: true,
            placeholder: 'napr. Faktúra bola vystavená na nesprávnu zákazku — opravená faktúra pôjde zvlášť.',
            hint: 'Aspoň 10 znakov. Dôvod ide na doklad aj do histórie.' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Inv.detail('${x.id}')">Späť</button>
            <button type="submit" class="btn btn-primary">${Icon('undo', 14)} Pripraviť dobropis</button>
          </div>
        </form>`, { wide: true });
    },

    async cancel(id) {
      const f = document.getElementById('sf-cancel');
      const reason = f ? String(f.querySelector('[name=reason]').value || '').trim() : '';
      if (reason.length < 10) return UI.toast('Napíšte dôvod dobropisu — aspoň 10 znakov', 'err');
      return this.guarded(id, async () => {
        const r = await this.call('cancel', { invoice_id: id, reason });
        if (!r.ok) return this.toastErr(r.json);
        UI.toast(`Dobropis ${r.json.invoice_number} čaká na schválenie`, 'ok');
        Inv.loaded = false; await Inv.load(); Danubra.renderRoute();
        setTimeout(() => Inv.detail(r.json.credit_note_id), 200);
      });
    },

    /** Odoslanie: cez SuperFaktúru, alebo z našej schránky s PDF zo SuperFaktúry. */
    async sendChoice(id) {
      const x = Inv.items.find(i => i.id === id);
      if (!x) return;
      const p = (Inv.v2.partners || []).find(z => z.id === x.partner_id) || Inv.partnerOf(x.partner_id) || {};
      const mode = ((Danubra.cfgRow && Danubra.cfgRow.superfaktura) || {}).send_mode || 'sf';
      const tile = (key, ico, title, sub, action) => `<button type="button" class="pick-tile${mode === key ? ' is-first' : ''}" onclick="${action}">
          <span class="pick-ico">${Icon(ico, 20)}</span><span class="pick-txt"><b>${title}</b><em>${sub}</em></span>
          <span class="pick-go">${Icon('chevron', 16)}</span></button>`;
      const tiles = [
        tile('sf', 'invoices', 'Cez SuperFaktúru', `E-mail so SuperFaktúry na ${UI.esc(p.email || 'e-mail odberateľa')}, po nemecky, s PDF dokladu.`,
          `SFUI.sendSf('${x.id}')`),
        tile('mail', 'mail', 'Z našej schránky', 'Otvorí sa e-mail v Správach s PDF zo SuperFaktúry v prílohe. Text si môžete upraviť.',
          `SFUI.sendMail('${x.id}')`),
      ];
      if (mode === 'mail') tiles.reverse();
      UI.modal(`Odoslať faktúru ${x.invoice_number || ''}`, `
        <div class="pick-list">${tiles.join('')}</div>
        <form id="sf-send" onsubmit="event.preventDefault()">
          ${UI.field('cc', 'Kópia (nepovinné, len cez SuperFaktúru)', { type: 'text', placeholder: 'napr. bauleiter@firma.de',
            tip: 'Ďalšie adresy oddelené čiarkou. Kópia z Nastavení → SuperFaktúra sa pridá sama.' })}
        </form>
        <div class="regimebox">Poslaný e-mail sa nedá vziať späť.</div>
        <div class="modal-actions"><button class="btn btn-ghost" onclick="Inv.detail('${x.id}')">Späť</button></div>`, { wide: true });
    },

    async sendSf(id) {
      const cc = (document.querySelector('#sf-send [name=cc]') || {}).value || '';
      return Inv.sfAction(id, 'send', { cc });
    },

    async sendMail(id) {
      if (!window.Mail) return UI.toast('Správy nie sú k dispozícii', 'err');
      return this.guarded(id, async () => {
        const x = Inv.items.find(i => i.id === id);
        const p = (Inv.v2.partners || []).find(z => z.id === x.partner_id) || {};
        UI.toast('Pripravujem PDF zo SuperFaktúry…');
        // PDF na odoslanie ide z rezervy na odosielanie, nie z rozpočtu synchronizácie.
        const r = await this.call('pdf', { invoice_id: id, purpose: 'send' });
        if (!r.ok) return this.toastErr(r.json);
        const t = S().txt(S().sfLang(p.invoice_language, 'deu'));
        const credit = x.kind === 'credit_note';
        await Mail.compose({
          to: p.email || '', sign: true, links: { partner_id: x.partner_id || null },
          subject: credit ? t.subjectCn(x.invoice_number) : t.subject(x.invoice_number),
          body: credit ? t.messageCn : t.message,
          attachments: [{ storage_path: r.json.storage_path || null, archive_id: r.json.archive_id, name: r.json.file_name, type: 'application/pdf' }]
            .filter(a => a.storage_path),
          // Keď e-mail naozaj odíde, faktúra sa označí ako odoslaná.
          onSent: async (to) => {
            const m = await this.call('mark_sent', { invoice_id: id, to: (to && to[0] && to[0].address) || p.email || '' });
            if (!m.ok) this.toastErr(m.json); else UI.toast('Faktúra je označená ako odoslaná', 'ok');
            Inv.loaded = false; await Inv.load(); Danubra.renderRoute();
          },
        });
      });
    },

    // ── Hromadne: schválené → SuperFaktúra ────────────────────────────────
    /** Schválené faktúry bez dokladu v SuperFaktúre. Každá je schválená zvlášť. */
    approvedQueue() {
      return (Inv.items || []).filter(x => x.status === 'approved' && !x.sf_invoice_id && x.approved_at && x.partner_id);
    },

    bulkIssue() {
      if (!Danubra.isAdmin()) return UI.toast('Vystavuje len administrátor', 'err');
      const list = this.approvedQueue();
      if (!list.length) return UI.toast('Žiadna schválená faktúra nečaká na vystavenie', 'ok');
      const who = (x) => { const c = Inv.counterparty(x); return c ? c.name : ''; };
      const sum = Money.sum(list.map(x => Money.toCents(x.total || 0)));
      UI.modal('Vystaviť schválené v SuperFaktúre', `
        <div class="regimebox">Každá z týchto faktúr je <b>schválená administrátorom</b>. Server to pri každej overí znova
          v databáze — neschválená by sa nevystavila, ani keby tu bola. Odberateľom zatiaľ nič neodíde.
          ${this.envBadge()}</div>
        <div class="mf-list">${list.map(x => `<label class="mf-row"><input type="checkbox" data-id="${x.id}" checked>
          <span class="mf-main"><b>${UI.esc(x.invoice_number || '')}${x.kind === 'credit_note' ? ' · dobropis' : ''}</b><em>${UI.esc(who(x))}</em></span>
          <span class="mf-sum">${UI.money(x.total, x.currency)}</span></label>`).join('')}</div>
        <div id="sf-bulk-log" class="muted-sm" aria-live="polite"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" id="sf-bulk-go" onclick="SFUI.runBulk()">${Icon('check', 14)} Vystaviť ${list.length} · ${Money.format(sum)}</button>
        </div>`, { wide: true });
    },

    async runBulk() {
      const ids = [...document.querySelectorAll('#ui-modal .mf-row input:checked')].map(c => c.dataset.id);
      const go = document.getElementById('sf-bulk-go');
      const log = document.getElementById('sf-bulk-log');
      if (go) go.disabled = true;
      const out = [];
      for (const id of ids) {
        const x = Inv.items.find(i => i.id === id) || {};
        if (log) log.textContent = `Vystavujem ${x.invoice_number || ''}…`;
        const r = await this.call('issue', { invoice_id: id });
        out.push({ x, ok: r.ok, json: r.json });
        // Pri zlom kľúči alebo limite by ďalšie dopadli rovnako.
        if (!r.ok && r.json && ['auth', 'rate_limit', 'budget'].includes(r.json.code)) break;
        if (r.skipped) break;
      }
      Inv.loaded = false; await Inv.load(); Danubra.renderRoute();
      const good = out.filter(o => o.ok);
      const bad = out.filter(o => !o.ok);
      const warn = good.filter(o => o.json.check === 'mismatch');
      UI.modal('Vystaviť schválené v SuperFaktúre', `
        <div class="${bad.length || warn.length ? 'warnbox' : 'regimebox'}">Vystavené ${good.length} z ${ids.length}.${
          warn.length ? ` ${warn.length} nesúhlasí so SuperFaktúrou — tie sa neodošlú, kým to niekto neskontroluje.` : ''}</div>
        ${out.map(o => `<div class="list-row is-static is-top"><span class="dot ${o.ok ? (o.json.check === 'mismatch' ? 'red' : 'green') : 'amber'}"></span>
          <span class="lr-main"><b>${UI.esc(o.x.invoice_number || '')}</b><span class="lr-sub">${o.ok
            ? (o.json.check === 'mismatch' ? UI.esc(o.json.check_note || 'nesúhlasí') : `vystavená (id ${UI.esc(String(o.json.sf_invoice_id))})`)
            : UI.esc(this.errText(o.json))}</span></span></div>`).join('')}
        <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal()">Hotovo</button></div>`, { wide: true });
    },
  };

  window.SFUI = SFUI;
})();
