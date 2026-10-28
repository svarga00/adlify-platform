// ============================================================================
// DANUBRA — Odberatelia v Nemecku (Generalunternehmer / Auftraggeber)
// ============================================================================
// Oddelené od ubytovacích klientov — iný biznis, iné polia (USt-IdNr,
// splatnosť, spoľahlivosť platieb). Sledujeme reálnu dobu inkasa, lebo
// podľa biznis plánu je likvidita najpravdepodobnejší dôvod zlyhania.
// ============================================================================
(function () {
  const RATING = [['a', 'A — platí spoľahlivo', 'green'], ['b', 'B — priemer', 'amber'], ['c', 'C — problémový', 'red']];

  // Otázniky pri údajoch v detaile odberateľa (kľúč = názov riadku).
  const TIPS = {
    'USt-IdNr': 'USt-IdNr = nemecké IČ DPH firmy (napr. DE123456789). Bez platného čísla nemôžeme fakturovať bez nemeckej DPH (prenesenie daňovej povinnosti, §13b) a daň by sme zaplatili my.',
    'Typ prác': 'Stavebné = robíme na stavbe a platí SOKA-BAU, zrážka §48b a stavebná minimálna mzda. Dielenské = výroba mimo stavby, menej pravidiel.',
    'Splatnosť': 'Dohodnutý počet dní na zaplatenie faktúry. Koľko naozaj platí, je nižšie v Platobnej disciplíne.',
    'Faktoring': 'Či môžeme jeho faktúry predať faktoringovej spoločnosti a dostať peniaze hneď (za poplatok).',
  };

  const Prt = {
    items: [], subcontracts: [], invoices: [], logos: new Map(), loaded: false,
    filters: { q: '', is_construction: '' },

    async load() {
      const [p, s, i] = await Promise.all([
        DB.list('partners', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('subcontracts', { select: 'id,partner_id,title,status,charge_rate', limit: 500 }),
        DB.list('invoices', { select: 'id,partner_id,client_id,total,status,issue_date,due_date,paid_at,type', limit: 1000 }),
      ]);
      this.items = p.data || []; this.subcontracts = s.data || []; this.invoices = i.data || [];
      // Ručne nahraté logo má prednosť pred faviconom z webu.
      this.logos = await DB.signedDocUrls(this.items.map(x => x.logo_path));
      this.loaded = true;
    },

    subsOf(id) { return this.subcontracts.filter(s => s.partner_id === id); },
    ratingBadge(r) { const m = RATING.find(x => x[0] === r); return m ? UI.badge(m[1], m[2]) : ''; },

    filtered() {
      const f = this.filters;
      return this.items.filter(p => {
        if (f.is_construction !== '' && String(!!p.is_construction) !== f.is_construction) return false;
        if (f.q) {
          const hay = `${p.name} ${p.city || ''} ${p.contact_person || ''} ${p.ust_idnr || ''}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    /**
     * Jedna veta, čo spraviť s odberateľmi. Všetko sa to točí okolo
     * USt-IdNr: bez neho sa nedá fakturovať v reverse charge podľa §13b
     * a daň by sme zaplatili my.
     *
     * Predtým tu bol červený pruh „nemá USt-IdNr" a tým to skončilo —
     * či je číslo **platné**, nikto nikdy nezistil. Overenie v registri
     * (VIES) je teraz jedno kliknutie a jeho výsledok sa pamätá s dátumom.
     */
    nowHtml() {
      const n = DanubraNow.clients(this.items);
      const AKCIA = {
        invalid: { label: 'Otvoriť odberateľa', ico: 'alert' },
        vat: { label: 'Doplniť USt-IdNr', ico: 'edit' },
        verify: { label: 'Otvoriť a preveriť', ico: 'shield' },
        ok: { label: 'Pridať odberateľa', onclick: 'Prt.form()', ico: 'plus' },
      };
      const a = AKCIA[n.key];
      return Shell.now(n, {
        help: 'card.prt.now',
        action: a && (a.onclick ? a : (n.id
          ? { ...a, onclick: `Prt.detail('${n.id}')` } : null)),
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Prt.form()">${Icon('plus')} Pridať odberateľa</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();

      el.innerHTML = Danubra.header('Odberatelia v Nemecku',
        `${this.items.length} celkom · ${this.items.filter(p => p.is_construction).length} stavebných`) +
        this.nowHtml() + `
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať názov, mesto, kontakt, USt-IdNr…" value="${UI.esc(this.filters.q)}"
            oninput="Prt.setF('q',this.value)">
          <select onchange="Prt.setF('is_construction',this.value)">
            <option value="">Všetky typy prác</option>
            <option value="true" ${this.filters.is_construction === 'true' ? 'selected' : ''}>Stavebné</option>
            <option value="false" ${this.filters.is_construction === 'false' ? 'selected' : ''}>Dielenské</option>
          </select>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('clients', 'Žiadni odberatelia', 'Pridajte prvého nemeckého odberateľa.',
              `<button class="btn btn-primary" onclick="Prt.form()">${Icon('plus')} Pridať odberateľa</button>`)
          : `<div class="cards">${rows.map(p => this.card(p)).join('')}</div>`}`;
    },

    // ── Logo firmy ────────────────────────────────────────────────────────
    // Ťahá sa z **jej vlastného webu**, nie z cudzej služby: príliš veľa
    // takých služieb raz prestane fungovať alebo si začne pýtať kľúč,
    // a zbytočne by vedeli, ktoré firmy si pozeráme.
    //
    // Keď sa favicon nenačíta, `onerror` obrázok odstráni a zostanú
    // iniciály. Nikdy prázdny štvorec.
    domainOf(p) {
      const raw = String((p && p.website) || '').trim();
      if (!raw) return null;
      try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return u.hostname.replace(/^www\./i, '') || null;
      } catch { return null; }
    },

    logoUrl(p) {
      if (p && p.logo_path && this.logos.get(p.logo_path)) return this.logos.get(p.logo_path);
      const d = this.domainOf(p);
      return d ? `https://${d}/favicon.ico` : null;
    },

    initials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    },

    logo(p, size) {
      const url = this.logoUrl(p);
      const px = size || 36;
      return `<span class="p-logo" style="width:${px}px;height:${px}px;">
        ${UI.esc(this.initials(p.name))}
        ${url ? `<img src="${UI.esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      </span>`;
    },

    card(p) {
      const subs = this.subsOf(p.id);
      return `
        <div class="acc-card card" role="button" tabindex="0" onclick="Prt.detail('${p.id}')">
          <div class="acc-card-head">
            <div class="w-head" style="min-width:0;">
              ${this.logo(p)}
              <div style="min-width:0;">
                <div class="acc-name">${UI.esc(p.name)}</div>
                <div class="acc-loc">${UI.esc(p.city || '')}${p.country ? `, ${UI.esc(p.country)}` : ''}${p.contact_person ? ` · ${UI.esc(p.contact_person)}` : ''}</div>
              </div>
            </div>
            ${this.ratingBadge(p.rating) || UI.badge(p.is_construction ? 'Stavba' : 'Dielňa', p.is_construction ? 'amber' : 'blue')}
          </div>
          <div class="acc-meta">
            ${p.ust_idnr ? `<span>${Icon('receipt', 14)} ${UI.esc(p.ust_idnr)}</span>`
              : `<span style="color:var(--red);font-weight:700;">${Icon('alert', 14)} bez USt-IdNr${UI.tip('USt-IdNr = nemecké IČ DPH firmy (napr. DE123456789). Bez platného čísla nemôžeme fakturovať bez nemeckej DPH (prenesenie daňovej povinnosti, §13b) a daň by sme zaplatili my.')}</span>`}
            <span>${Icon('clock', 14)} splatnosť ${p.payment_terms_days || 30} dní</span>
            ${subs.length ? `<span>${Icon('site', 14)} ${subs.length} ${subs.length === 1 ? 'zákazka' : 'zákaziek'}</span>` : ''}
            ${p.factoring_eligible ? `<span style="color:var(--green);">${Icon('check', 14)} faktoring${UI.tip('Faktoring = faktúru tohto odberateľa môžeme predať faktoringovej spoločnosti a peniaze dostať hneď, nie až keď on zaplatí (za poplatok).')}</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    /**
     * Rámcová zmluva s nemeckým odberateľom — dvojjazyčne.
     *
     * On podpisuje po nemecky, my čítame po slovensky. Lehoty a sumy sa berú
     * z Nastavení, takže zmena splatnosti nie je zásah do kódu.
     */
    rahmen(id) {
      const p = this.items.find(x => x.id === id);
      if (!p) return UI.toast('Nenájdené', 'err');
      if (!Danubra.supplierReady('Rámcová zmluva o dielo')) return;

      const supplier = Danubra.supplier();
      const client = {
        name: p.name, address: [p.address, p.postal_code, p.city, p.country]
          .filter(Boolean).join(', '),
        registration_no: p.registration_no, ust_idnr: p.ust_idnr,
        phone: p.phone, email: p.email, contact_person: p.contact_person,
      };
      const zmluva = DanubraFrameworkDe.build({
        supplier, client, rules: Danubra.cfg('framework_de'),
      });
      const chyba = DanubraFrameworkDe.missing({ supplier, client });

      const html = DanubraPapers.rahmenvertrag({ zmluva, chyba });
      Docs.show(window.open('', '_blank'), html, { kind: 'rahmen', title: 'Rahmenvertrag',
        number: zmluva && zmluva.number, who: p.name, lang: 'de', partner_id: p.id });

      if (chyba.length) {
        UI.toast(`Pred podpisom doplňte: ${chyba.map(c => c.title).join(', ')}`, 'warn');
      }
    },

    async detail(id) {
      const p = this.items.find(x => x.id === id);
      if (!p) return UI.toast('Nenájdené', 'err');
      const subs = this.subsOf(id);
      // Faktúry sa viažu cez `partner_id`. Do F3 sa tu filtrovalo cez
      // `client_id`, ktorý ukazuje na klientov z agendy ubytovania — takže
      // tento panel nikdy nemal čo zobraziť a ticho ukazoval nulu.
      const inv = this.invoices.filter(i => i.partner_id === id);
      const disc = DanubraPayment.discipline(inv);
      const suggested = DanubraPayment.suggestRating(disc, { termsDays: p.payment_terms_days });

      const rows = [
        ['USt-IdNr', p.ust_idnr], ['Kontakt', p.contact_person],
        ['Telefón', p.phone], ['E-mail', p.email],
        ['Adresa', [p.address, p.postal_code, p.city].filter(Boolean).join(', ')],
        ['Typ prác', p.is_construction ? 'Stavebné (SOKA, §48b, Bau-Mindestlohn)' : 'Dielenské (nižšia regulácia)'],
        ['Splatnosť', `${p.payment_terms_days || 30} dní`],
        ['Faktoring', p.factoring_eligible ? 'Áno' : 'Nie'],
        ['Zdroj', p.source],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">
          ${this.ratingBadge(p.rating)}
          ${UI.badge(p.is_construction ? 'Stavba' : 'Dielňa', p.is_construction ? 'amber' : 'blue')}
        </div>
        ${!p.ust_idnr ? `<div class="warnbox">${Icon('alert', 14)}
          Bez USt-IdNr sa nedá fakturovať v režime reverse charge §13b.${UI.tip('Reverse charge (§13b) = fakturujeme bez nemeckej DPH a daň za nás odvedie odberateľ. Funguje to len vtedy, keď má platné nemecké IČ DPH (USt-IdNr). Doplňte ho cez Upraviť.')}</div>` : ''}
        ${this.verifyHtml(p)}
        ${CommPanel.render({ contact: { phone: p.phone, email: p.email, name: p.name }, entity: { type: 'partner', id: p.id } })}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}${TIPS[r[0]] ? UI.tip(TIPS[r[0]]) : ''}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${p.notes ? `<div class="notebox">${UI.esc(p.notes)}</div>` : ''}

        <div class="form-section">Platobná disciplína${UI.tip('Ako odberateľ reálne platí — počíta sa z jeho faktúr v appke. Podľa toho sa dá odhadnúť, kedy prídu peniaze, a navrhnúť hodnotenie A/B/C.')}</div>
        ${disc.total ? `
          <div class="kv">
            <div><span>Priemerne platí za${UI.tip('Priemerný počet dní od vystavenia faktúry po úhradu, len z uhradených faktúr.')}</span><strong>${
              disc.avgDaysToPay != null
                ? `${disc.avgDaysToPay} ${DanubraPayment.plural(disc.avgDaysToPay, 'deň', 'dni', 'dní')}`
                : '—'}</strong></div>
            <div><span>Do splatnosti${UI.tip('Koľko percent uhradených faktúr zaplatil včas, teda najneskôr v deň splatnosti.')}</span><strong>${
              disc.onTimePct != null ? UI.pct(disc.onTimePct) : '—'}</strong></div>
            <div><span>Faktúr</span><strong>${disc.paid} z ${disc.total} uhradených</strong></div>
            ${disc.overdue ? `<div><span>Po splatnosti</span><strong class="tx-bad">${
              disc.overdue} · najdlhšie ${disc.oldestOverdueDays} ${
              DanubraPayment.plural(disc.oldestOverdueDays, 'deň', 'dni', 'dní')}</strong></div>` : ''}
          </div>
          ${Shell.sums({ lines: DanubraPayment.sumLines(disc), totalLabel: 'Visí u odberateľa' })}
          ${suggested.rating && suggested.rating !== p.rating ? `
            <div class="regimebox">
              Z faktúr vychádza hodnotenie <strong>${suggested.rating.toUpperCase()}</strong>,
              uložené je ${p.rating ? `<strong>${String(p.rating).toUpperCase()}</strong>` : 'prázdne'}.
              ${UI.esc(suggested.reason)}
              ${suggested.confident ? '' : ' (zatiaľ málo faktúr na istý záver)'}
              <div class="btn-row"><button class="btn btn-outline btn-sm"
                onclick="Prt.applyRating('${p.id}','${suggested.rating}')">Prepísať na ${suggested.rating.toUpperCase()}</button>${UI.tip('Hodnotenie sa nemení samo — je to Vaše rozhodnutie. Po kliknutí sa uložené hodnotenie zmení na to, ktoré vychádza z faktúr.')}</div>
            </div>` : ''}
        ` : `<div class="js-empty">
            Zatiaľ žiadna faktúra tomuto odberateľovi — nie je z čoho počítať.</div>`}

        <div class="form-section">Zákazky (${subs.length})</div>
        ${subs.map(s => `<button class="list-row" onclick="UI.closeModal();Danubra.go('subcontracts');setTimeout(()=>Sub.detail('${s.id}'),300)">
          <span class="lr-main"><strong>${UI.esc(s.title)}</strong>
            <span class="lr-sub">${UI.esc(window.Sub && Sub.statusLabel ? Sub.statusLabel(s.status) : s.status)}${s.charge_rate ? ` · ${UI.money(s.charge_rate)}/h` : ''}</span></span>
          <span class="lr-go">${Icon('chevron', 15)}</span></button>`).join('')
          || '<div class="js-empty">Zatiaľ žiadne zákazky.</div>'}

        <div class="form-section">Dokumenty</div>
        ${window.Docs ? Docs.slot('partner', p.id, { empty: 'Zatiaľ žiadne. Rámcová zmluva, Werkvertrag, ponuka či faktúra sa sem uložia, keď z nich spravíte PDF.' }) : ''}

        <div class="form-section">E-maily</div>
        ${window.Mail ? Mail.slot('partner', p.id, p.email) : ''}

        <div class="modal-actions">
          <button class="btn btn-danger" onclick="Prt.del('${p.id}')">${Icon('archive', 14)} Archivovať</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip('Rámcová zmluva = spoločné podmienky spolupráce s týmto odberateľom (splatnosť, záruky…), dvojjazyčne slovensky a nemecky. Otvorí sa na tlač; ak niečo chýba, appka povie čo.')}</span>
          <button class="btn btn-outline" onclick="Prt.rahmen('${p.id}')">
            ${Icon('doc', 14)} Rámcová zmluva SK/DE</button>
          <button class="btn btn-primary" onclick="Prt.form('${p.id}')">Upraviť</button>
        </div>`;
      UI.modal(p.name, body, { wide: true });
      if (window.Docs) Docs.fill(document.getElementById('ui-modal'));
      if (window.Mail) Mail.fill(document.getElementById('ui-modal'));
    },

    // ── Overenie USt-IdNr v registri (VIES) ───────────────────────────────
    // Do teraz sa dalo overiť len pri dopyte. Z prehľadu „Otvoriť a preveriť"
    // tak viedlo na kartu, na ktorej sa preveriť nedalo nič.
    verifyHtml(p) {
      const v = DanubraOpp.verification({ verify_result: p.vies_result, company_vat: p.ust_idnr });
      return `<div class="form-section">Overenie firmy${UI.tip('Appka sa spýta oficiálneho registra EÚ (VIES), či nemecké IČ DPH odberateľa (USt-IdNr) naozaj platí a na koho je vedené. Bez platného čísla nemôžeme fakturovať v reverse charge (§13b) — daň by sme zaplatili my. Keď register neodpovie, neznamená to, že je číslo zlé; skúste to neskôr. Výsledok sa zapíše s dátumom.')}</div>`
        + Shell.now({
          title: v.label, what: v.detail, hot: v.state === 'invalid',
          why: p.vies_checked_at ? `Pýtali sme sa ${UI.date(p.vies_checked_at)}. Staré overenie `
            + 'nie je overenie — pri dlhej zákazke alebo zmene firmy ho zopakujte.' : '',
        }, {
          label: 'USt-IdNr v registri EÚ', help: 'card.opp.verify',
          action: p.ust_idnr ? { ico: 'shield', onclick: `Prt.verify('${p.id}')`,
            label: p.vies_result ? 'Preveriť znova' : 'Preveriť USt-IdNr v registri' }
            : { ico: 'edit', onclick: `Prt.form('${p.id}')`, label: 'Doplniť USt-IdNr' },
        });
    },

    /**
     * Pýta sa registra cez server (`danubra-verify-company`), ktorý výsledok
     * zapíše k odberateľovi aj s dátumom. „Register neodpovedal" sa ukáže
     * ako neodpoveď, nie ako neplatné číslo.
     */
    async verify(id) {
      const p = this.items.find(x => x.id === id);
      if (!p || !p.ust_idnr) return UI.toast('Najprv doplňte USt-IdNr', 'err');
      UI.toast('Pýtam sa registra…', 'ok');
      let res;
      try {
        res = await fetch('/.netlify/functions/danubra-verify-company', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vat: p.ust_idnr, partnerId: id }),
        });
      } catch (e) {
        return UI.toast('Server neodpovedal: ' + (e.message || e), 'err');
      }
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return UI.toast(`Overenie sa nepodarilo: ${out.error || res.status}`, 'err');

      p.vies_result = out;
      p.vies_checked_at = new Date().toISOString();
      const v = DanubraOpp.verification({ verify_result: out, company_vat: p.ust_idnr });
      UI.toast(v.label, v.state === 'valid' ? 'ok' : v.state === 'unavailable' ? 'warn' : 'err');
      // Názov z registra je presnejší než ručne zapísaný — ale prepíše sa len
      // so súhlasom.
      if (out.valid && out.name && out.name !== p.name
          && await UI.confirm(`Register firmu pozná ako „${out.name}". Prepísať názov?`, { danger: false })) {
        const { error } = await DB.update('partners', id, { name: out.name });
        if (error) UI.toast('Chyba: ' + error.message, 'err'); else p.name = out.name;
      }
      this.detail(id);
      Danubra.renderRoute();
    },

    form(id) {
      const p = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="prt-form" onsubmit="event.preventDefault();Prt.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov firmy', { value: p.name, required: true })}
            ${UI.field('ust_idnr', 'USt-IdNr', { value: p.ust_idnr, placeholder: 'DE123456789', tip: 'USt-IdNr = nemecké IČ DPH firmy (napr. DE123456789). Bez platného čísla nemôžeme fakturovať bez nemeckej DPH (prenesenie daňovej povinnosti, §13b) a daň by sme zaplatili my.' })}
            ${UI.field('contact_person', 'Kontaktná osoba', { value: p.contact_person })}
            ${UI.field('phone', 'Telefón', { value: p.phone })}
            ${UI.field('email', 'E-mail', { type: 'email', value: p.email })}
            ${UI.field('city', 'Mesto', { value: p.city })}
            ${UI.field('website', 'Web', { value: p.website,
              placeholder: 'vogel-bau.de', tip: 'Adresa webu firmy. Appka si z neho vezme malé logo (ikonku), aby sa firma dala v zozname rýchlo spoznať.' })}
            ${UI.field('address', 'Adresa', { value: p.address })}
            ${UI.field('postal_code', 'PSČ', { value: p.postal_code })}
            ${UI.field('country', 'Krajina', { value: p.country || 'DE' })}
            ${UI.field('payment_terms_days', 'Splatnosť (dní)', { type: 'number',
              value: p.payment_terms_days ?? 30,
              hint: 'Dohodnutá splatnosť. Koľko dní odberateľ naozaj platí, počíta '
                + 'appka z úhrad — a práve to ide do výhľadu cash-flow.' })}
            ${UI.field('rating', 'Spoľahlivosť platieb', { value: p.rating, options: [['', '—'], ...RATING.map(r => [r[0], r[1]])],
              tip: 'Vaše hodnotenie, ako odberateľ platí: A = spoľahlivo, B = priemer, C = problémový. V detaile appka navrhne hodnotenie podľa faktúr.' })}
            ${UI.field('source', 'Zdroj', { value: p.source, placeholder: 'Auftragsbank, referral…',
              tip: 'Odkiaľ sme firmu získali, napr. Auftragsbank (nemecká burza zákaziek) alebo odporúčanie.' })}
          </div>
          <div class="chk-row">
            ${UI.field('is_construction', '', { type: 'checkbox', value: p.is_construction !== false, placeholder: 'Stavebné práce (SOKA, §48b, Bau-Mindestlohn)',
              tip: 'Zaškrtnite, ak pre neho robíme na stavbe. Vtedy platí SOKA-BAU (stavebná pokladnica), §48b (odberateľ môže z faktúry strhnúť 15 % daň, ak nemáme oslobodenie) a stavebná minimálna mzda.' })}
            ${UI.field('factoring_eligible', '', { type: 'checkbox', value: p.factoring_eligible, placeholder: 'Vhodný na faktoring',
              tip: 'Faktoring = faktúru predáme faktoringovej spoločnosti a peniaze dostaneme hneď (za poplatok). Zaškrtnite, ak je odberateľ na to dosť spoľahlivý.' })}
          </div>
          <div class="regimebox">Pri dielenských prácach odpadá SOKA-BAU aj Bau-Mindestlohn —
          podľa plánu je to bezpečnejší vstupný segment s rýchlejším cash-flow.</div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: p.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť odberateľa' : 'Nový odberateľ', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('prt-form'));
      if (!d.name) return UI.toast('Názov je povinný', 'err');
      const payload = { ...d };
      payload.payment_terms_days = d.payment_terms_days === '' ? 30 : Number(d.payment_terms_days);
      if (payload.rating === '') payload.rating = null;
      const res = id ? await DB.update('partners', id, payload) : await DB.insert('partners', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    /**
     * Prepíše hodnotenie na to, čo vychádza z faktúr. Robí sa to na kliknutie,
     * nie automaticky — hodnotenie je obchodné rozhodnutie a niekedy vieš
     * o odberateľovi viac než jeho platobný kalendár.
     */
    async applyRating(id, rating) {
      const { error } = await DB.update('partners', id, { rating });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const p = this.items.find(x => x.id === id); if (p) p.rating = rating;
      UI.toast('Hodnotenie prepísané', 'ok');
      this.detail(id);
    },

    async del(id) {
      if (!await UI.confirmArchive('Presunúť tohto odberateľa do archívu?')) return;
      const { error } = await DB.archive('partners', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast(UI.ARCHIVED, 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },
  };

  window.Prt = Prt;
  Danubra.views.partners = function (el) { return Prt.view(el); };
})();
