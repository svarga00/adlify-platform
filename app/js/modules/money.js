// ============================================================================
// DANUBRA — Kde sú peniaze
// ============================================================================
// Prehľad vie povedať „čakáme na účet 7 854 €". Na rozhodnutie to nestačí,
// lebo to číslo je zlepené zo štádií, ktoré sa riešia úplne inak: niečo
// stojí na nás (uzavrieť obdobie, vystaviť faktúru, schváliť), niečo na
// odberateľovi (čaká sa) a niečo sa nevráti tento mesiac vôbec (§48b).
//
// Táto obrazovka odpovedá na dve otázky, ktoré sa pýtajú spolu:
//
//   1. **Kde čakajú naše peniaze** — po štádiách, od toho, čo sa dá pohnúť
//      vlastnou rukou, po to, na čo sa len čaká.
//   2. **Koľko sa dá minúť a dokedy** — po týždňoch, s najnižším bodom.
//
// Počíta to `lib/money/position.js` a má testy. Tu sa to len kreslí.
// ============================================================================
(function () {
  const Mon = {
    loaded: false,
    subcontracts: [], assignments: [], timesheets: [], periods: [],
    invoices: [], costs: [], partners: [], cashflow: [], balance: 0,
    open: {},          // ktoré štádium je rozbalené
    weeks: 8,

    async load() {
      const [sc, a, ts, per, inv, c, prt, cf, tx] = await Promise.all([
        DB.list('subcontracts', { select: 'id,title,contract_number,status,charge_rate', limit: 300 }),
        DB.list('assignments', { select: 'id,subcontract_id,worker_id,status,charge_rate', limit: 2000 }),
        DB.list('timesheets', { select: 'id,assignment_id,hours,work_date,period_id', limit: 5000 }),
        DB.list('periods', { select: 'id,subcontract_id,status,period_from,period_to,amount_charged', limit: 500 }),
        DB.list('invoices', {
          select: 'id,invoice_number,status,total,amount_net,withholding_amount,due_date,partner_id,period_id',
          limit: 1000 }),
        DB.list('costs', {
          select: 'id,description,category,amount,cost_date,rebillable,rebilled_invoice_id,subcontract_id',
          limit: 1000 }),
        DB.list('partners', { select: 'id,name', limit: 300 }),
        DB.list('v_cashflow', { limit: 1000 }),
        DB.list('bank_transactions', { select: 'amount', limit: 2000 }),
      ]);
      this.subcontracts = sc.data || []; this.assignments = a.data || [];
      this.timesheets = ts.data || []; this.periods = per.data || [];
      this.invoices = inv.data || []; this.costs = c.data || [];
      this.partners = prt.data || []; this.cashflow = cf.data || [];
      this.balance = Money.sum((tx.data || []).map(t => Money.toCents(t.amount)));
      if (window.Cfg && !Cfg.loaded) { try { await Cfg.load(); } catch {} }
      this.loaded = true;
    },

    today() { return new Date().toISOString().slice(0, 10); },
    reserve() {
      const s = window.Cfg ? Cfg.j('staffing') : {};
      return Money.toCents(s.cash_buffer_min ?? 5000);
    },

    data() {
      const prt = new Map(this.partners.map(p => [p.id, p.name]));
      const sc = new Map(this.subcontracts.map(s => [s.id, s.title || s.contract_number]));
      return {
        today: this.today(),
        subcontracts: this.subcontracts, assignments: this.assignments,
        timesheets: this.timesheets, periods: this.periods,
        invoices: this.invoices, costs: this.costs,
        partnerName: (id) => prt.get(id) || null,
        siteName: (id) => sc.get(id) || null,
      };
    },

    setWeeks(n) { this.weeks = Number(n) || 8; Danubra.renderRoute(); },
    toggle(key) { this.open = { ...this.open, [key]: !this.open[key] }; Danubra.renderRoute(); },

    // ── Kde čakajú peniaze ────────────────────────────────────────────────
    stagesHtml(stages, sum) {
      const max = Math.max(1, ...stages.map(s => s.cents));
      const row = (s) => {
        const otvorene = !!this.open[s.key];
        const pct = Math.round((s.cents / max) * 100);
        return `<div class="ms ms-${s.state}${s.cents ? '' : ' is-empty'}">
          <button class="ms-head" onclick="Mon.toggle('${s.key}')"
            aria-expanded="${otvorene}">
            <span class="ms-bar"><span style="width:${pct}%"></span></span>
            <span class="ms-label">${UI.esc(s.label)}
              ${s.count ? `<em>${s.count}</em>` : ''}</span>
            <span class="ms-sum">${Money.format(s.cents)}</span>
            <span class="ms-caret">${Icon('chevron', 14)}</span>
          </button>
          <p class="ms-lead">${UI.esc(s.lead)}
            ${s.todo ? `<strong>${UI.esc(s.todo)}</strong>` : ''}</p>
          ${otvorene ? this.rowsHtml(s) : ''}
        </div>`;
      };
      return `<div class="card card-pad">
        ${Danubra._cardHead('euro', 'Kde čakajú naše peniaze', '', '', '', 'card.money.stages')}
        <div class="ms-top">
          <div><span>Stojí na nás</span><strong>${Money.format(sum.ours)}</strong>
            <em>${sum.oursCount} ${Shell.plural(sum.oursCount, 'krok', 'kroky', 'krokov')}</em></div>
          <div><span>Čaká sa na odberateľa</span><strong>${Money.format(sum.theirs)}</strong></div>
          <div><span>Spolu</span><strong>${Money.format(sum.total)}</strong></div>
        </div>
        <p class="card-note">Hore je to, čo sa dá pohnúť vlastnou rukou — bez toho,
          aby niekto iný čokoľvek spravil. Dole to, na čo sa len čaká.</p>
        <div class="ms-list">${stages.map(row).join('')}</div>
      </div>`;
    },

    rowsHtml(s) {
      if (!s.rows.length) {
        return `<div class="ms-rows"><p class="ms-none">Nič tu nestojí.</p></div>`;
      }
      return `<div class="ms-rows"><table class="kpi-table"><tbody>
        ${s.rows.map((r) => {
          const can = r.open && Danubra.canOpen(r.open.type, r.open.id);
          return `<tr class="${r.tone ? `tone-${r.tone}` : ''}${can ? ' is-open' : ''}"
            ${can ? `onclick="Danubra.open('${r.open.type}','${r.open.id}')"
              tabindex="0" role="button"` : ''}>
            <td data-l="Čo">${r.tone ? `<span class="kpi-dot kpi-dot-${r.tone}"></span>` : ''}
              ${UI.esc(r.title)}
              ${r.sub ? `<span class="kpi-why">${UI.esc(r.sub)}</span>` : ''}</td>
            <td class="ta-r" data-l="Dátum">${r.date ? UI.esc(UI.date(r.date))
              : '<span class="dim">bez termínu</span>'}</td>
            <td class="ta-r" data-l="Suma"><strong>${Money.format(r.cents)}</strong></td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
    },

    // ── Koľko sa dá minúť ─────────────────────────────────────────────────
    spendHtml(sp, v) {
      const r = (x) => `<tr class="${sp.worst && x.week === sp.worst.week ? 'is-worst' : ''}">
        <td data-l="Týždeň">${x.week}.
          <span class="kpi-why">${UI.esc(UI.date(x.from))} – ${UI.esc(UI.date(x.to))}</span></td>
        <td class="ta-r" data-l="Príde">${x.in ? Money.format(x.in) : '<span class="dim">—</span>'}
          ${x.unreliable ? `<span class="kpi-why">+ ${UI.esc(Money.format(x.unreliable))} po splatnosti</span>` : ''}</td>
        <td class="ta-r" data-l="Odíde">${x.out ? Money.format(x.out) : '<span class="dim">—</span>'}</td>
        <td class="ta-r" data-l="Zostatok"><strong${x.balance < 0 ? ' style="color:var(--red)"' : ''}
          >${Money.format(x.balance)}</strong></td>
        <td class="ta-r" data-l="Voľné"${x.free < 0 ? ' style="color:var(--red)"' : ''}
          >${Money.format(x.free)}</td>
      </tr>`;
      return `<div class="card card-pad">
        ${Danubra._cardHead('wallet', 'Koľko sa dá minúť a dokedy',
          `<div class="pillbar pillbar-xs no-print">
            ${[4, 8, 12].map(n => `<button class="pill${this.weeks === n ? ' active' : ''}"
              onclick="Mon.setWeeks(${n})">${n} týždňov</button>`).join('')}
          </div>`, '', '', 'card.money.spend')}
        <div class="headline headline-${v.tone === 'bad' ? 'bad' : v.tone === 'watch' ? 'warn' : 'ok'}">
          ${Icon(v.tone === 'bad' ? 'alert' : v.tone === 'watch' ? 'clock' : 'check', 18)}
          <span>${UI.esc(v.text)}</span>
        </div>
        <div class="ms-top">
          <div><span>Na účte dnes</span><strong>${Money.format(sp.start)}</strong></div>
          <div><span>Rezerva z Nastavení</span><strong>${Money.format(sp.reserve)}</strong></div>
          <div><span>Voľné</span><strong${sp.free < 0 ? ' style="color:var(--red)"' : ''}
            >${Money.format(sp.free)}</strong></div>
        </div>
        <div class="kpi-table-wrap"><table class="kpi-table">
          <thead><tr><th>Týždeň</th><th class="ta-r">Príde</th><th class="ta-r">Odíde</th>
            <th class="ta-r">Zostatok</th><th class="ta-r">Voľné</th></tr></thead>
          <tbody>${sp.rows.map(r).join('')}</tbody>
        </table></div>
        <p class="card-note">„Voľné" je zostatok mínus rezerva. Rozhoduje
          <strong>najnižší bod</strong>, nie koniec — peniaze sa minú dnes, ale záväzok
          dobehne o tri týždne.${sp.unreliable
            ? ` Faktúry po splatnosti (${UI.esc(Money.format(sp.unreliable))}) sa sem nerátajú.` : ''}</p>
      </div>`;
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions('');

      const x = this.data();
      const stages = DanubraPosition.stages(x);
      const sum = DanubraPosition.summary(stages);
      const sp = DanubraPosition.spendable({
        today: x.today, balance: this.balance, items: this.cashflow,
        weeks: this.weeks, reserve: this.reserve(),
      });
      const v = DanubraPosition.verdict(sp);

      el.innerHTML = Danubra.header('Kde sú peniaze',
        `${Money.format(sum.total)} čaká · ${Money.format(sp.free)} sa dá minúť`)
        + `<p class="fl-intro">Dve otázky na jednom mieste: <strong>kde stoja naše
            peniaze</strong> a <strong>koľko sa z nich dá minúť a dokedy</strong>.
            Prvá sa rieši po štádiách — niečo stojí na nás, niečo na odberateľovi.
            Druhá je týždenný výhľad, v ktorom rozhoduje najnižší bod.</p>`
        + this.spendHtml(sp, v)
        + `<div style="height:14px"></div>`
        + this.stagesHtml(stages, sum);
    },
  };

  window.Mon = Mon;
  Danubra.views.money = function (el) { return Mon.view(el); };
})();
