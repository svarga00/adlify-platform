/**
 * ADLIFY PLATFORM — Outreach Module v2.0
 *
 * Pracuje s tabuľkou `prospects` (cold outreach targets).
 * Prospect sa premení na lead buď:
 *   - automaticky podľa pravidiel v outreach_settings (audit click, call booked, ...)
 *   - manuálne cez tlačidlo "Presunúť do leadov"
 *
 * Flow:
 *   1. Vyber prospectov (filter: stage, segment, search)
 *   2. Preview generovaneho emailu (OutreachTemplates.coldOutreachAudit)
 *   3. Poslanie cez /.netlify/functions/send-email (Resend)
 *   4. Update prospects.outreach_email_sent_at + outreach_stage='email_sent'
 */

const OutreachModule = {
  id: 'outreach',
  name: 'Outreach',
  icon: '📮',
  title: 'Outreach',
  subtitle: 'Personalizované oslovovanie firiem',

  menu: { section: 'main', order: 25 },
  permissions: ['leads', 'view'],

  prospects: [],
  selectedIds: new Set(),
  drafts: new Map(),
  currentView: 'overview',   // 'overview' | 'compose' | 'templates' | 'import'
  filters: { stage: 'pending', segment: 'all', search: '' },

  templates: [],
  templatesLoaded: false,
  editingTemplate: null,
  importRows: [],
  importMap: null,

  init() {
    console.log('📮 Outreach module initialized');
  },

  async render(container) {
    this._container = container;
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam...</div>';
    try {
      const { data, error } = await Database.client
        .from('prospects')
        .select('id, company_name, domain, contact_person, email, phone, industry, city, segment, status:outreach_stage, score, source, audit_token, outreach_stage, outreach_email_sent_at, outreach_email_opened_at, outreach_email_open_count, outreach_email_replied_at, audit_requested_at, audit_delivered_at, audit_viewed_at, converted_to_lead_id, converted_at, conversion_reason, created_at, notes')
        .order('score', { ascending: false, nullsLast: true })
        .limit(500);
      if (error) throw error;
      this.prospects = data || [];
      container.innerHTML = this.template();
      this.bindEvents();
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626;">Chyba: ${e.message}</div>`;
    }
  },

  template() {
    const stats = this.computeStats();
    let body = '';
    if (this.currentView === 'compose') body = this.renderCompose();
    else if (this.currentView === 'templates') body = this.renderTemplates();
    else if (this.currentView === 'import') body = this.renderImport();
    else body = this.renderOverview(stats);
    const showFunnel = this.currentView === 'overview' || this.currentView === 'compose';
    return `
      <div class="adl">
        ${this.renderHeader(stats)}
        ${showFunnel ? this.renderFunnel(stats) : ''}
        ${body}
      </div>
    `;
  },

  computeStats() {
    const p = this.prospects;
    return {
      total: p.length,
      pending: p.filter(x => !x.outreach_stage || x.outreach_stage === 'pending').length,
      email_sent: p.filter(x => x.outreach_stage === 'email_sent').length,
      email_opened: p.filter(x => x.outreach_email_opened_at).length,
      audit_requested: p.filter(x => x.audit_requested_at).length,
      audit_viewed: p.filter(x => x.audit_viewed_at).length,
      converted: p.filter(x => x.outreach_stage === 'converted').length,
    };
  },

  renderHeader(stats) {
    const isSecondary = this.currentView !== 'overview';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 4px;color:#14120E;">Outreach</h1>
          <p style="color:#6F6758;font-size:14px;margin:0;">Personalizované oslovovanie firiem · Audit-first flow</p>
        </div>
        <div class="adl-toolbar">
          ${isSecondary ? `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.setView('overview')">← Späť</button>
          ` : `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openTemplates()">✉ Šablóny</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openImport()">⬆ Import CSV</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openNewProspect()">＋ Nový prospect</button>
            <button class="adl-btn adl-btn-ghost" onclick="OutreachModule.exportCsv()">⬇ Export CSV</button>
            <span class="adl-toolbar-divider"></span>
            <button class="adl-btn adl-btn-primary adl-btn-lg" onclick="OutreachModule.startCompose()" ${stats.pending === 0 ? 'disabled' : ''}>▶ Nová kampaň (${stats.pending})</button>
          `}
        </div>
      </div>
    `;
  },

  renderFunnel(stats) {
    const steps = [
      { label: 'Voľní prospekti', value: stats.pending, color: '#6F6758' },
      { label: 'Email odoslaný', value: stats.email_sent, color: '#3B82F6' },
      { label: 'Email otvorený', value: stats.email_opened, color: '#8B5CF6' },
      { label: 'Klikol na audit', value: stats.audit_requested, color: '#F59E0B' },
      { label: 'Audit videl', value: stats.audit_viewed, color: '#EA580C' },
      { label: 'Lead', value: stats.converted, color: '#16A34A' },
    ];
    return `
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:24px;">
        ${steps.map(s => `
          <div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:16px;">
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;">${s.label}</div>
            <div style="font-size:24px;font-weight:800;color:${s.color};letter-spacing:-0.5px;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderOverview(stats) {
    const f = this.filters;
    const filtered = this.applyFilters();
    const selCount = this.selectedIds.size;

    return `
      <!-- Filters -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <input type="text" placeholder="Hľadať firmu, doménu..." value="${f.search}" oninput="OutreachModule.setFilter('search', this.value)"
          style="flex:1;min-width:220px;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
        <select onchange="OutreachModule.setFilter('stage', this.value)"
          style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
          <option value="all" ${f.stage==='all'?'selected':''}>Všetky fázy</option>
          <option value="pending" ${f.stage==='pending'?'selected':''}>Voľní (neodoslané)</option>
          <option value="email_sent" ${f.stage==='email_sent'?'selected':''}>Email odoslaný</option>
          <option value="email_opened" ${f.stage==='email_opened'?'selected':''}>Email otvorený</option>
          <option value="audit_requested" ${f.stage==='audit_requested'?'selected':''}>Klikli na audit</option>
          <option value="audit_viewed" ${f.stage==='audit_viewed'?'selected':''}>Audit videli</option>
          <option value="converted" ${f.stage==='converted'?'selected':''}>Premenení na lead</option>
          <option value="lost" ${f.stage==='lost'?'selected':''}>Stratení</option>
        </select>
      </div>

      ${selCount > 0 ? `
        <div style="background:#FFF7ED;border:1.5px solid #F97316;border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <strong style="color:#14120E;">Označených: ${selCount}</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.clearSelection()">Zrušiť výber</button>
            <button class="adl-btn adl-btn-primary" onclick="OutreachModule.composeFromSelected()">▶ Poslať kampaň (${selCount})</button>
            <button class="adl-btn adl-btn-danger" onclick="OutreachModule.deleteSelected()">✕ Zmazať (${selCount})</button>
          </div>
        </div>
      ` : ''}

      <!-- Table -->
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead style="background:#F7F5F1;">
              <tr>
                <th style="padding:12px 16px;text-align:left;width:40px;">
                  <input type="checkbox" ${this._allFilteredChecked(filtered) ? 'checked' : ''} onchange="OutreachModule.toggleAllProspects(this.checked)">
                </th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Firma</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Kontakt</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Fáza</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Skóre</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Akcie</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="6" style="padding:40px;text-align:center;color:#6F6758;">Žiadni prospekti podľa filtra.</td></tr>
              ` : filtered.slice(0, 100).map(p => this.renderRow(p)).join('')}
            </tbody>
          </table>
        </div>
        ${filtered.length > 100 ? `<div style="padding:12px;text-align:center;color:#948B7C;font-size:13px;border-top:1px solid #EAE6DE;">Zobrazených 100 z ${filtered.length}</div>` : ''}
      </div>
    `;
  },

  renderRow(prospect) {
    const stage = this.stageBadge(prospect);
    const company = prospect.company_name || prospect.domain;
    const contact = prospect.contact_person ? `${prospect.contact_person}${prospect.email ? ' · ' + prospect.email : ''}` : (prospect.email || '—');
    const canSend = !prospect.outreach_email_sent_at && prospect.email && prospect.outreach_stage !== 'converted';
    const isConverted = prospect.outreach_stage === 'converted';
    const checked = this.selectedIds.has(prospect.id);

    return `
      <tr style="border-top:1px solid #EAE6DE;${isConverted ? 'opacity:.6;' : ''}">
        <td style="padding:14px 16px;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="OutreachModule.toggleSelect('${prospect.id}')">
        </td>
        <td style="padding:14px 16px;">
          <div style="font-weight:600;color:#14120E;">${this.esc(company)}</div>
          <div style="font-size:12px;color:#948B7C;">${this.esc(prospect.domain || '')}${prospect.industry ? ' · ' + this.esc(prospect.industry) : ''}</div>
        </td>
        <td style="padding:14px 16px;color:#6F6758;">${this.esc(contact)}</td>
        <td style="padding:14px 16px;">${stage}</td>
        <td style="padding:14px 16px;"><strong>${prospect.score || 0}</strong></td>
        <td style="padding:14px 16px;display:flex;gap:6px;flex-wrap:wrap;">
          ${canSend ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.composeSingle('${prospect.id}')">Poslať email</button>` : ''}
          ${prospect.audit_token ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="window.open('/audit.html?t=${prospect.audit_token}', '_blank')" title="Pozrieť audit">Audit</button>` : ''}
          ${!isConverted ? `<button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.promoteToLead('${prospect.id}')" title="Manuálne presunúť do leadov">→ Lead</button>` : ''}
          ${isConverted && prospect.converted_to_lead_id ? `<a class="adl-btn adl-btn-sm adl-btn-soft" href="#/leads?id=${prospect.converted_to_lead_id}">Otvoriť lead</a>` : ''}
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteProspect('${prospect.id}')" title="Zmazať">✕</button>
        </td>
      </tr>
    `;
  },

  stageBadge(prospect) {
    const s = prospect.outreach_stage || 'pending';
    const map = {
      pending: { label: 'Voľný', color: '#6F6758', bg: '#F7F5F1' },
      email_sent: { label: 'Email odoslaný', color: '#3B82F6', bg: '#DBEAFE' },
      email_opened: { label: 'Otvorený', color: '#8B5CF6', bg: '#EDE9FE' },
      email_clicked: { label: 'Klikol', color: '#F59E0B', bg: '#FEF3C7' },
      bounced: { label: 'Bounced', color: '#DC2626', bg: '#FEE2E2' },
      unsubscribed: { label: 'Opt-out', color: '#6F6758', bg: '#F7F5F1' },
      converted: { label: 'Lead', color: '#16A34A', bg: '#DCFCE7' },
      lost: { label: 'Stratený', color: '#6F6758', bg: '#F7F5F1' },
    };
    const info = map[s] || map.pending;
    return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${info.bg};color:${info.color};font-size:12px;font-weight:600;">${info.label}</span>`;
  },

  renderCompose() {
    const selected = Array.from(this.selectedIds).map(id => this.prospects.find(p => p.id === id)).filter(Boolean);
    const ready = selected.filter(p => p.email);
    const noEmail = selected.filter(p => !p.email);

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:24px;margin-bottom:16px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#14120E;">Odoslať kampaň (${ready.length} firiem)</h2>
        <p style="color:#6F6758;font-size:14px;margin:0 0 16px;">Každý email je personalizovaný na firmu (meno, odvetvie, mesto). Odosielateľ: <strong>Štefan Varga · Adlify</strong>.</p>
        ${noEmail.length ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;font-size:13px;color:#92400E;margin-bottom:16px;">${noEmail.length} firiem nemá email a bude preskočených.</div>` : ''}

        <div style="display:flex;gap:10px;margin-bottom:16px;">
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule.previewFirst()">Náhľad 1. emailu</button>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.sendCampaign()" ${ready.length === 0 ? 'disabled' : ''}>
            Odoslať ${ready.length} emailov
          </button>
        </div>

        <div id="outreach-preview" style="display:none;margin-top:16px;border-top:1px solid #EAE6DE;padding-top:16px;"></div>

        <div style="max-height:360px;overflow-y:auto;margin-top:16px;border:1px solid #EAE6DE;border-radius:10px;">
          ${ready.map(p => `
            <div style="padding:12px 14px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:600;">${this.esc(p.company_name || p.domain)}</div>
                <div style="font-size:12px;color:#948B7C;">${this.esc(p.contact_person || '')} · ${this.esc(p.email)}</div>
              </div>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewSingle('${p.id}')">Náhľad</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div id="outreach-progress" style="display:none;"></div>
    `;
  },

  applyFilters() {
    let out = this.prospects;
    const { stage, search } = this.filters;
    if (stage && stage !== 'all') {
      if (stage === 'pending') out = out.filter(p => !p.outreach_stage || p.outreach_stage === 'pending');
      else if (stage === 'audit_requested') out = out.filter(p => p.audit_requested_at && !p.audit_viewed_at);
      else if (stage === 'audit_viewed') out = out.filter(p => p.audit_viewed_at);
      else out = out.filter(p => p.outreach_stage === stage);
    }
    if (search) {
      const s = search.toLowerCase();
      out = out.filter(p =>
        (p.company_name || '').toLowerCase().includes(s) ||
        (p.domain || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s) ||
        (p.industry || '').toLowerCase().includes(s)
      );
    }
    return out;
  },

  setFilter(k, v) {
    this.filters[k] = v;
    this.rerender();
  },

  setView(v) {
    this.currentView = v;
    this.rerender();
  },

  rerender() {
    const container = this._container
      || document.getElementById('main-content')
      || document.getElementById('module-content')
      || document.querySelector('[data-module-container]');
    if (container) container.innerHTML = this.template();
  },

  _getContainer() {
    return this._container
      || document.getElementById('main-content')
      || document.getElementById('module-content')
      || document.querySelector('[data-module-container]');
  },

  startCompose() {
    const candidates = this.prospects.filter(p => (!p.outreach_stage || p.outreach_stage === 'pending') && p.email);
    if (candidates.length === 0) return Utils.toast('Žiadni voľní prospekti s emailom', 'warning');
    this.selectedIds = new Set(candidates.slice(0, 30).map(p => p.id));
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  composeSingle(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p?.email) return Utils.toast('Prospect nemá email', 'warning');
    this.selectedIds = new Set([prospectId]);
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  async promoteToLead(prospectId) {
    if (!window.Prospects) return Utils.toast('Prospects helper nie je načítaný', 'danger');
    const p = this.prospects.find(x => x.id === prospectId);
    const label = p?.company_name || p?.domain || 'prospect';
    if (!confirm(`Presunúť "${label}" do leadov?`)) return;

    const { lead, error } = await window.Prospects.promoteToLead(prospectId, 'manual');
    if (error) {
      Utils.toast('Chyba: ' + error.message, 'danger');
      return;
    }
    Utils.toast(`Presunutý do leadov (id ${lead.id.slice(0, 8)}…)`, 'success');
    // reload
    this.render(this._getContainer());
  },

  async buildEmail(prospect) {
    if (!window.OutreachTemplates) {
      console.error('OutreachTemplates missing — include shared/js/utils/outreach-templates.js');
      return null;
    }
    return await OutreachTemplates.coldOutreachAuditAsync({
      contactName: prospect.contact_person || '',
      companyName: prospect.company_name || prospect.domain,
      domain: prospect.domain,
      industry: prospect.industry || '',
      city: prospect.city || '',
      auditToken: prospect.audit_token,
    });
  },

  previewFirst() {
    const firstId = Array.from(this.selectedIds).find(id => this.prospects.find(p => p.id === id)?.email);
    if (firstId) this.previewSingle(firstId);
  },

  async previewSingle(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p) return;
    const email = await this.buildEmail(p);
    if (!email) return Utils.toast('Chyba pri generovaní emailu', 'danger');

    const box = document.getElementById('outreach-preview');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Náhľad pre: ${this.esc(p.company_name || p.domain)}</div>
          <div style="font-weight:700;font-size:16px;">${this.esc(email.subject)}</div>
        </div>
        <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="document.getElementById('outreach-preview').style.display='none'">Zavrieť</button>
      </div>
      <div style="border:1px solid #EAE6DE;border-radius:12px;overflow:hidden;background:#F7F5F1;padding:12px;">
        <iframe id="outreach-iframe" style="width:100%;height:560px;border:0;background:#fff;border-radius:8px;"></iframe>
      </div>
    `;
    const iframe = document.getElementById('outreach-iframe');
    iframe.onload = () => {
      try { iframe.contentDocument.body.innerHTML = ''; iframe.contentDocument.open(); iframe.contentDocument.write(email.html); iframe.contentDocument.close(); } catch(e) {}
    };
    iframe.src = 'about:blank';
  },

  async sendCampaign() {
    const selected = Array.from(this.selectedIds)
      .map(id => this.prospects.find(p => p.id === id))
      .filter(p => p && p.email);

    if (selected.length === 0) return Utils.toast('Žiadni prospekti', 'warning');
    if (!confirm(`Odoslať ${selected.length} emailov?\n\nTáto akcia je nezvratná.`)) return;

    const progressBox = document.getElementById('outreach-progress');
    progressBox.style.display = 'block';
    progressBox.innerHTML = `<div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:20px;">
      <div id="outreach-status" style="font-weight:600;margin-bottom:12px;">Odosielam 0/${selected.length}...</div>
      <div style="background:#F7F5F1;border-radius:8px;height:10px;overflow:hidden;"><div id="outreach-bar" style="height:100%;background:#F97316;width:0%;transition:width .3s;"></div></div>
      <div id="outreach-log" style="margin-top:12px;font-size:12px;font-family:monospace;color:#6F6758;max-height:200px;overflow-y:auto;"></div>
    </div>`;

    let ok = 0, fail = 0;
    for (let i = 0; i < selected.length; i++) {
      const prospect = selected[i];
      try {
        const email = await this.buildEmail(prospect);
        const r = await fetch('/.netlify/functions/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: prospect.email,
            subject: email.subject,
            htmlBody: email.html,
            textBody: email.text,
            prospectId: prospect.id,
          }),
        });
        if (r.ok) {
          ok++;
          await Database.client.from('prospects').update({
            outreach_email_sent_at: new Date().toISOString(),
            outreach_last_contacted_at: new Date().toISOString(),
            outreach_stage: 'email_sent',
          }).eq('id', prospect.id);
          this.appendLog(`✓ ${prospect.company_name || prospect.domain} (${prospect.email})`, 'ok');
        } else {
          fail++;
          this.appendLog(`✗ ${prospect.company_name || prospect.domain}: ${r.status}`, 'err');
        }
      } catch (e) {
        fail++;
        this.appendLog(`✗ ${prospect.company_name || prospect.domain}: ${e.message}`, 'err');
      }
      const pct = Math.round(((i + 1) / selected.length) * 100);
      document.getElementById('outreach-bar').style.width = pct + '%';
      document.getElementById('outreach-status').textContent = `Odosielam ${i + 1}/${selected.length}...`;
      await new Promise(r => setTimeout(r, 250)); // anti-spam delay
    }

    document.getElementById('outreach-status').textContent = `Hotovo: ${ok} odoslaných, ${fail} neúspešných.`;
    Utils.toast(`Kampaň dokončená: ${ok}/${selected.length}`, fail === 0 ? 'success' : 'warning');

    setTimeout(() => { this.currentView = 'overview'; this.render(this._getContainer()); }, 2000);
  },

  appendLog(msg, type) {
    const el = document.getElementById('outreach-log');
    if (!el) return;
    const color = type === 'err' ? '#DC2626' : '#16A34A';
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  exportCsv() {
    const rows = [['Firma', 'Doména', 'Email', 'Kontakt', 'Odvetvie', 'Segment', 'Fáza', 'Skóre', 'Audit link']];
    this.prospects.forEach(p => {
      rows.push([
        p.company_name || '',
        p.domain || '',
        p.email || '',
        p.contact_person || '',
        p.industry || '',
        p.segment || '',
        p.outreach_stage || 'pending',
        p.score || 0,
        p.audit_token ? `${location.origin}/audit.html?t=${p.audit_token}` : '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `adlify-outreach-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // ========== NEW PROSPECT (modal) ==========

  openNewProspect() {
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:520px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">+ Nový prospect</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <form id="outreach-new-form" onsubmit="event.preventDefault();OutreachModule.saveNewProspect();" style="padding:20px 24px 24px;display:grid;gap:12px;">
          ${this._field('company_name', 'Názov firmy *', 'text', true)}
          ${this._field('domain', 'Doména (napr. firma.sk)', 'text')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${this._field('contact_person', 'Kontaktná osoba', 'text')}
            ${this._field('email', 'Email *', 'email', true)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${this._field('phone', 'Telefón', 'text')}
            ${this._field('city', 'Mesto', 'text')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${this._field('industry', 'Odvetvie', 'text')}
            ${this._field('source', 'Zdroj', 'text')}
          </div>
          ${this._field('notes', 'Poznámka', 'textarea')}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">Pridať prospect</button>
          </div>
        </form>
      </div>
    `;
    this._openModal(modal);
    setTimeout(() => modal.querySelector('[name=company_name]')?.focus(), 30);
  },

  async saveNewProspect() {
    const form = document.getElementById('outreach-new-form');
    if (!form) return;
    const fd = new FormData(form);
    const row = Object.fromEntries(fd.entries());
    if (!row.company_name || !row.email) return Utils.toast('Názov a email sú povinné', 'warning');
    const payload = {
      company_name: row.company_name.trim(),
      domain: this._normalizeDomain(row.domain),
      contact_person: row.contact_person?.trim() || null,
      email: row.email.trim().toLowerCase(),
      phone: row.phone?.trim() || null,
      city: row.city?.trim() || null,
      industry: row.industry?.trim() || null,
      source: row.source?.trim() || 'manual',
      notes: row.notes?.trim() || null,
      outreach_stage: 'pending',
      score: 50,
    };
    const { data, error } = await Database.client.from('prospects').insert(payload).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast('Prospect pridaný', 'success');
    this.closeModal();
    this.prospects.unshift(data);
    this.rerender();
  },

  // ========== IMPORT CSV ==========

  openImport() {
    this.importRows = [];
    this.importMap = null;
    this.currentView = 'import';
    this.rerender();
  },

  renderImport() {
    const hasRows = this.importRows.length > 0;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:24px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#14120E;">Import CSV</h2>
        <p style="color:#6F6758;font-size:14px;margin:0 0 16px;">Nahraj CSV s prospektmi. Stĺpce môžu byť v akomkoľvek poradí — priradíš ich v kroku 2.</p>

        ${!hasRows ? `
          <div style="border:2px dashed #EAE6DE;border-radius:12px;padding:32px;text-align:center;">
            <input type="file" id="outreach-csv-file" accept=".csv" style="display:none" onchange="OutreachModule.parseCsv(event)">
            <button class="adl-btn adl-btn-primary" onclick="document.getElementById('outreach-csv-file').click()">Vybrať CSV súbor</button>
            <p style="margin:12px 0 0;font-size:13px;color:#948B7C;">
              Očakávané stĺpce: company_name, domain, email, contact_person, phone, city, industry<br>
              Dedup: rovnaká doména alebo email sa preskočí.
            </p>
          </div>
        ` : `
          ${this._renderImportMapper()}
        `}
      </div>
    `;
  },

  _renderImportMapper() {
    const fields = [
      ['company_name', 'Názov firmy *'],
      ['domain', 'Doména'],
      ['email', 'Email'],
      ['contact_person', 'Kontaktná osoba'],
      ['phone', 'Telefón'],
      ['city', 'Mesto'],
      ['industry', 'Odvetvie'],
      ['source', 'Zdroj'],
      ['notes', 'Poznámka'],
    ];
    const headers = this.importRows[0] ? Object.keys(this.importRows[0]) : [];
    const guess = (target) => headers.find(h => h.toLowerCase().replace(/[_\s-]/g, '').includes(target.replace(/_/g, ''))) || '';
    if (!this.importMap) {
      this.importMap = Object.fromEntries(fields.map(([k]) => [k, guess(k)]));
    }
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        ${fields.map(([key, label]) => `
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            ${label}
            <select onchange="OutreachModule.setImportMap('${key}', this.value)"
              style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;background:#fff;font-size:14px;">
              <option value="">— nepoužívať —</option>
              ${headers.map(h => `<option value="${this.esc(h)}" ${this.importMap[key]===h?'selected':''}>${this.esc(h)}</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>

      <div style="background:#F7F5F1;border-radius:10px;padding:12px 16px;font-size:13px;color:#6F6758;margin-bottom:14px;">
        Nájdených <strong>${this.importRows.length}</strong> riadkov. Po importe sa zduplikované záznamy (podľa domény alebo emailu) preskočia.
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="adl-btn adl-btn-outline" onclick="OutreachModule.resetImport()">Zrušiť</button>
        <button class="adl-btn adl-btn-primary" onclick="OutreachModule.runImport()">Importovať ${this.importRows.length} riadkov</button>
      </div>

      <div id="outreach-import-log" style="margin-top:16px;"></div>
    `;
  },

  setImportMap(key, value) {
    if (!this.importMap) this.importMap = {};
    this.importMap[key] = value;
  },

  resetImport() {
    this.importRows = [];
    this.importMap = null;
    this.rerender();
  },

  parseCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target.result || '').replace(/^﻿/, '');
        const rows = this._csvParse(text);
        if (!rows.length) return Utils.toast('Prázdne CSV', 'warning');
        this.importRows = rows;
        this.importMap = null;
        this.rerender();
      } catch (err) {
        Utils.toast('Chyba pri čítaní CSV: ' + err.message, 'danger');
      }
    };
    reader.readAsText(file);
  },

  _csvParse(text) {
    // minimalistický parser s podporou quoted polí
    const lines = [];
    let cur = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',' || c === ';') { row.push(cur); cur = ''; }
        else if (c === '\r') {}
        else if (c === '\n') { row.push(cur); lines.push(row); row = []; cur = ''; }
        else cur += c;
      }
    }
    if (cur || row.length) { row.push(cur); lines.push(row); }
    if (lines.length < 2) return [];
    const headers = lines[0].map(h => h.trim());
    return lines.slice(1)
      .filter(r => r.some(c => String(c).trim()))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  },

  async runImport() {
    if (!this.importRows.length || !this.importMap) return;
    const log = document.getElementById('outreach-import-log');
    log.innerHTML = `<div style="background:#F7F5F1;border-radius:10px;padding:12px 16px;font-size:13px;">Načítavam existujúce prospecty pre dedup...</div>`;

    const { data: existing } = await Database.client.from('prospects').select('domain, email');
    const existingDomains = new Set((existing || []).map(x => (x.domain || '').toLowerCase()).filter(Boolean));
    const existingEmails = new Set((existing || []).map(x => (x.email || '').toLowerCase()).filter(Boolean));

    const mapped = [];
    let skipped = 0;
    for (const r of this.importRows) {
      const get = (k) => {
        const col = this.importMap[k];
        return col ? String(r[col] || '').trim() : '';
      };
      const email = get('email').toLowerCase();
      const domain = this._normalizeDomain(get('domain'));
      const company = get('company_name');
      if (!company && !domain && !email) { skipped++; continue; }
      if (domain && existingDomains.has(domain)) { skipped++; continue; }
      if (email && existingEmails.has(email)) { skipped++; continue; }
      mapped.push({
        company_name: company || domain || email,
        domain: domain || null,
        email: email || null,
        contact_person: get('contact_person') || null,
        phone: get('phone') || null,
        city: get('city') || null,
        industry: get('industry') || null,
        source: get('source') || 'csv_import',
        notes: get('notes') || null,
        outreach_stage: 'pending',
        score: 50,
      });
      if (domain) existingDomains.add(domain);
      if (email) existingEmails.add(email);
    }

    if (!mapped.length) {
      log.innerHTML = `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;color:#92400E;">Nič na import (všetko duplicitné alebo prázdne). Preskočených: ${skipped}</div>`;
      return;
    }

    // bulk insert po 200
    let inserted = 0, failed = 0;
    for (let i = 0; i < mapped.length; i += 200) {
      const chunk = mapped.slice(i, i + 200);
      const { error, count } = await Database.client.from('prospects').insert(chunk, { count: 'exact' });
      if (error) { failed += chunk.length; console.error(error); }
      else inserted += (count || chunk.length);
    }

    log.innerHTML = `<div style="background:#DCFCE7;border:1px solid #BBF7D0;border-radius:10px;padding:12px 16px;color:#166534;">
      Import hotový: <strong>${inserted}</strong> pridaných · ${skipped} preskočených (duplicita) ${failed ? `· ${failed} chýb` : ''}
    </div>`;
    Utils.toast(`Importovaných ${inserted} prospektov`, 'success');
    setTimeout(() => {
      this.currentView = 'overview';
      this.render(this._getContainer());
    }, 1500);
  },

  // ========== TEMPLATES ==========

  async openTemplates() {
    this.currentView = 'templates';
    this.editingTemplate = null;
    this.templatesLoaded = false;
    this.templates = [];
    this.rerender();
    try {
      const { data, error } = await Database.client
        .from('email_templates')
        .select('id, slug, name, description, category, subject, plain_text, body_text, html_content, body_html, variables, is_active, is_system, updated_at')
        .in('category', ['outreach', 'transactional'])
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      this.templates = data || [];
      this.templatesLoaded = true;
      this.rerender();
    } catch (e) {
      this.templatesLoaded = true;
      this.rerender();
      Utils.toast('Chyba pri načítaní šablón: ' + e.message, 'danger');
    }
  },

  renderTemplates() {
    if (this.editingTemplate) return this._renderTemplateEditor();

    const rows = this.templates;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#14120E;">Šablóny emailov</h2>
            <p style="font-size:13px;color:#6F6758;margin:0;">Uprav predmet a text. Premenné sú v tvare <code>{{company}}</code>, <code>{{greeting}}</code> atď.</p>
          </div>
        </div>
        <div>
          ${!this.templatesLoaded ? `<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam šablóny…</div>` : rows.length === 0 ? `<div style="padding:40px;text-align:center;color:#6F6758;">Žiadne šablóny. Ak by mali existovať, skontroluj RLS alebo kategóriu (outreach/transactional).</div>` : rows.map(t => `
            <div style="padding:16px 24px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:16px;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <strong style="font-size:15px;color:#14120E;">${this.esc(t.name)}</strong>
                  ${t.is_system ? `<span style="font-size:11px;background:#F7F5F1;color:#6F6758;padding:2px 8px;border-radius:999px;">systémová</span>` : ''}
                  <span style="font-size:11px;background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:999px;">${this.esc(t.category)}</span>
                </div>
                <div style="font-size:13px;color:#6F6758;margin-bottom:4px;">${this.esc(t.description || '')}</div>
                <div style="font-size:12px;color:#948B7C;font-family:monospace;">${this.esc(t.slug)} · ${this.esc(t.subject)}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editTemplate('${t.id}')">Upraviť</button>
                <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewTemplate('${t.id}')">Náhľad</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  _renderTemplateEditor() {
    const t = this.editingTemplate;
    const vars = Array.isArray(t.variables) ? t.variables : [];
    return `
      <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;">
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h2 style="font-size:18px;font-weight:700;margin:0;">${this.esc(t.name)}</h2>
            <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.cancelEdit()">← Späť na zoznam</button>
          </div>

          <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Predmet</label>
          <input id="tpl-subject" type="text" value="${this.esc(t.subject || '')}"
            style="width:100%;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;margin-bottom:16px;">

          <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Telo emailu (plain text)</label>
          <textarea id="tpl-text" rows="18" style="width:100%;padding:12px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5;resize:vertical;">${this.esc(t.plain_text || t.body_text || '')}</textarea>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;color:#948B7C;">Posledná zmena: ${t.updated_at ? new Date(t.updated_at).toLocaleString('sk-SK') : '—'}</span>
            <div style="display:flex;gap:8px;">
              <button class="adl-btn adl-btn-outline" onclick="OutreachModule.previewEditing()">Náhľad</button>
              <button class="adl-btn adl-btn-primary" onclick="OutreachModule.saveTemplate()">Uložiť</button>
            </div>
          </div>

          <div id="tpl-preview" style="display:none;margin-top:18px;border-top:1px solid #EAE6DE;padding-top:16px;"></div>
        </div>

        <aside style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:18px 20px;align-self:flex-start;">
          <h3 style="font-size:13px;font-weight:700;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Dostupné premenné</h3>
          <p style="font-size:12px;color:#948B7C;margin:0 0 10px;">Klikni na premennú pre skopírovanie.</p>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${vars.map(v => `
              <button onclick="OutreachModule.copyVar('${v}')"
                style="text-align:left;padding:8px 10px;border:1px solid #EAE6DE;background:#F7F5F1;border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;color:#3A352B;cursor:pointer;">
                {{${v}}}
              </button>
            `).join('')}
          </div>
        </aside>
      </div>
    `;
  },

  editTemplate(id) {
    const t = this.templates.find(x => x.id === id);
    if (!t) return;
    this.editingTemplate = { ...t };
    this.rerender();
  },

  cancelEdit() {
    this.editingTemplate = null;
    this.rerender();
  },

  copyVar(name) {
    const token = `{{${name}}}`;
    navigator.clipboard?.writeText(token);
    Utils.toast(`Skopírované: ${token}`, 'info');
  },

  async previewTemplate(id) {
    const t = this.templates.find(x => x.id === id);
    if (!t) return;
    this.editingTemplate = { ...t };
    this.rerender();
    setTimeout(() => this.previewEditing(), 50);
  },

  previewEditing() {
    const subject = document.getElementById('tpl-subject')?.value || '';
    const text = document.getElementById('tpl-text')?.value || '';
    const sampleVars = this._sampleVars();
    const subj = OutreachTemplates.substitute(subject, sampleVars);
    const txt = OutreachTemplates.substitute(text, sampleVars);
    const html = OutreachTemplates.wrapTextInBrand(subj, txt, null);
    const box = document.getElementById('tpl-preview');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:14px;">Náhľad: ${this.esc(subj)}</strong>
        <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="document.getElementById('tpl-preview').style.display='none'">Zavrieť</button>
      </div>
      <iframe id="tpl-preview-iframe" style="width:100%;height:560px;border:1px solid #EAE6DE;border-radius:12px;background:#fff;"></iframe>
    `;
    const iframe = document.getElementById('tpl-preview-iframe');
    iframe.onload = () => { try { iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close(); } catch(e) {} };
    iframe.src = 'about:blank';
  },

  _sampleVars() {
    return {
      greeting: 'Pán Novák',
      contact_name: 'Peter Novák',
      company: 'Ukážková firma s.r.o.',
      domain: 'ukazka.sk',
      industry: 'gastro',
      industry_hook: ' — gastronomická prevádzka v meste Bratislava',
      city: 'Bratislava',
      audit_request_url: `${location.origin}/audit-request.html?t=demo-token`,
      audit_url: `${location.origin}/audit.html?t=demo-token`,
      sender_name: 'Štefan Varga',
      sender_title: 'Adlify',
      scheduled_at_formatted: 'pondelok 28. apríla 2026, 10:00',
      duration_minutes: '15',
      topic: 'audit + stratégia',
      topic_line: 'Téma: audit + stratégia',
    };
  },

  async saveTemplate() {
    const t = this.editingTemplate;
    if (!t) return;
    const subject = document.getElementById('tpl-subject')?.value?.trim();
    const text = document.getElementById('tpl-text')?.value;
    if (!subject || !text) return Utils.toast('Predmet aj telo sú povinné', 'warning');
    const { error } = await Database.client
      .from('email_templates')
      .update({ subject, plain_text: text, body_text: text })
      .eq('id', t.id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    OutreachTemplates.clearCache();
    Utils.toast('Uložené', 'success');
    const idx = this.templates.findIndex(x => x.id === t.id);
    if (idx >= 0) this.templates[idx] = { ...this.templates[idx], subject, plain_text: text, body_text: text, updated_at: new Date().toISOString() };
    this.editingTemplate = null;
    this.rerender();
  },

  // ========== modal helpers ==========

  _ensureModal(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'adl-modal';
      document.body.appendChild(el);
    }
    return el;
  },

  _openModal(el) {
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;';
    el.querySelector('.adl-modal-backdrop').style.cssText = 'position:absolute;inset:0;background:rgba(20,18,14,0.55);';
    el.querySelector('.adl-modal-card').style.cssText += 'position:relative;background:#fff;border-radius:16px;width:min(92vw,520px);max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25);';
    const head = el.querySelector('.adl-modal-head');
    if (head) head.style.cssText = 'padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;';
  },

  closeModal() {
    const el = document.getElementById('outreach-modal');
    if (el) el.remove();
  },

  _field(name, label, type = 'text', required = false) {
    if (type === 'textarea') {
      return `<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
        ${label}
        <textarea name="${name}" rows="3" style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;resize:vertical;font-family:inherit;"></textarea>
      </label>`;
    }
    return `<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
      ${label}
      <input type="${type}" name="${name}" ${required ? 'required' : ''}
        style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
    </label>`;
  },

  _normalizeDomain(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    return s || null;
  },

  // ========== SELECTION + DELETE ==========

  toggleSelect(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.rerender();
  },

  _allFilteredChecked(filtered) {
    if (!filtered.length) return false;
    return filtered.every(p => this.selectedIds.has(p.id));
  },

  toggleAllProspects(checked) {
    const filtered = this.applyFilters().slice(0, 100);
    if (checked) filtered.forEach(p => this.selectedIds.add(p.id));
    else filtered.forEach(p => this.selectedIds.delete(p.id));
    this.rerender();
  },

  clearSelection() {
    this.selectedIds.clear();
    this.rerender();
  },

  composeFromSelected() {
    const hasEmail = Array.from(this.selectedIds)
      .map(id => this.prospects.find(p => p.id === id))
      .filter(p => p && p.email);
    if (hasEmail.length === 0) return Utils.toast('Žiadny z vybraných nemá email', 'warning');
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  async deleteProspect(id) {
    const p = this.prospects.find(x => x.id === id);
    const label = p?.company_name || p?.domain || 'prospect';
    const ok = typeof Utils?.confirm === 'function'
      ? await Utils.confirm(`Zmazať „${label}"? Táto akcia je nevratná.`, { title: 'Zmazať prospect', type: 'danger', confirmText: 'Zmazať', cancelText: 'Zrušiť' })
      : confirm(`Zmazať „${label}"?`);
    if (!ok) return;
    const { error } = await Database.client.from('prospects').delete().eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.prospects = this.prospects.filter(x => x.id !== id);
    this.selectedIds.delete(id);
    Utils.toast('Zmazané', 'success');
    this.rerender();
  },

  async deleteSelected() {
    const n = this.selectedIds.size;
    if (n === 0) return;
    const ok = typeof Utils?.confirm === 'function'
      ? await Utils.confirm(`Zmazať ${n} prospektov? Táto akcia je nevratná.`, { title: 'Hromadné mazanie', type: 'danger', confirmText: `Zmazať ${n}`, cancelText: 'Zrušiť' })
      : confirm(`Zmazať ${n} prospektov?`);
    if (!ok) return;
    const ids = Array.from(this.selectedIds);
    const { error } = await Database.client.from('prospects').delete().in('id', ids);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.prospects = this.prospects.filter(p => !this.selectedIds.has(p.id));
    this.selectedIds.clear();
    Utils.toast(`Zmazaných ${n} prospektov`, 'success');
    this.rerender();
  },

  bindEvents() {
    // placeholder pre buduce listenery
  },

  esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
};

if (typeof window !== 'undefined') {
  window.OutreachModule = OutreachModule;
  if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register(OutreachModule);
  }
}
