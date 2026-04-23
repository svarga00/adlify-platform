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

  menu: { section: 'main', order: 15 },
  permissions: ['leads', 'view'],

  prospects: [],
  selectedIds: new Set(),
  drafts: new Map(),
  currentView: 'overview',   // 'overview' | 'compose' | 'templates' | 'import'
  filters: { stage: 'pending', segment: 'all', search: '' },

  templates: [],
  templatesLoaded: false,
  editingTemplate: null,
  editorMode: 'plain',
  previewViewport: 'desktop',
  importRows: [],
  importMap: null,
  selectedTemplateSlug: 'cold_outreach_audit',
  composePreviewViewport: 'desktop',
  page: 1,
  pageSize: 50,
  campaigns: [],
  campaignsLoaded: false,
  editingCampaign: null,
  smartLists: [],
  smartListsLoaded: false,
  activeSmartListId: null,

  init() {
    console.log('📮 Outreach module initialized');
    this.refreshBadge().catch(() => {});
    // auto-refresh badge každé 2 minúty
    if (!this._badgeInterval) {
      this._badgeInterval = setInterval(() => this.refreshBadge().catch(() => {}), 120000);
    }
  },

  /**
   * Spočíta „nové akcie" — prospektov ktorí urobili niečo po poslednom
   * pohľade ownerа. Zobrazí počet v sidebar badge.
   */
  async refreshBadge() {
    if (!window.Database?.client) return;
    try {
      const lastSeen = localStorage.getItem('outreach_last_seen_activity_at') || '1970-01-01T00:00:00Z';
      const { count, error } = await Database.client
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .or(`audit_requested_at.gt.${lastSeen},audit_viewed_at.gt.${lastSeen},outreach_email_replied_at.gt.${lastSeen}`);
      if (error) return;
      const el = document.getElementById('badge-outreach');
      if (!el) return;
      if (count && count > 0) {
        el.textContent = String(count);
        el.style.display = 'inline-flex';
      } else {
        el.style.display = 'none';
      }
    } catch { /* no-op */ }
  },

  markActivitySeen() {
    localStorage.setItem('outreach_last_seen_activity_at', new Date().toISOString());
    this.refreshBadge().catch(() => {});
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
      this.markActivitySeen();
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
    else if (this.currentView === 'campaigns') body = this.renderCampaigns();
    else if (this.currentView === 'analytics') body = this.renderAnalytics();
    else if (this.currentView === 'senders') body = this.renderSenders();
    else if (this.currentView === 'calendar') body = this.renderCalendar();
    else if (this.currentView === 'automations') body = this.renderAutomations();
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
    const ic = (svg) => `<span style="display:inline-flex;align-items:center;width:16px;height:16px;flex-shrink:0;">${svg}</span>`;
    const icons = {
      back:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
      chart:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16v-5"/><path d="M17 16V6"/></svg>',
      bolt:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
      send:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
      mail:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
      search:  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
      upload:  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
      plus:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
      download:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
      play:    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    };
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 4px;color:#14120E;">Outreach</h1>
          <p style="color:#6F6758;font-size:14px;margin:0;">Personalizované oslovovanie firiem · Audit-first flow</p>
        </div>
        <div class="adl-toolbar">
          ${isSecondary ? `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.setView('overview')">${ic(icons.back)} Späť</button>
          ` : `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openAnalytics()">${ic(icons.chart)} Analytika</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openAutomations()">${ic(icons.bolt)} Automatizácie</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openCampaigns()">${ic(icons.refresh)} Kampane</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openSenders()">${ic(icons.send)} Odosielatelia</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openTemplates()">${ic(icons.mail)} Šablóny</button>
            <span class="adl-toolbar-divider"></span>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openFindProspects()">${ic(icons.search)} Nájsť prospekty</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openImport()">${ic(icons.upload)} Import CSV</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openNewProspect()">${ic(icons.plus)} Nový prospect</button>
            <button class="adl-btn adl-btn-ghost" onclick="OutreachModule.exportCsv()">${ic(icons.download)} Export</button>
            <span class="adl-toolbar-divider"></span>
            <button class="adl-btn adl-btn-primary adl-btn-lg" onclick="OutreachModule.startCompose()" ${this.selectedIds.size === 0 ? 'disabled' : ''}>${ic(icons.play)} Poslať kampaň (${this.selectedIds.size})</button>
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
    const total = filtered.length;
    const pageSize = this.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (this.page > totalPages) this.page = totalPages;
    const from = (this.page - 1) * pageSize;
    const to = Math.min(from + pageSize, total);
    const pageRows = filtered.slice(from, to);

    // Smart lists chipy
    if (!this.smartListsLoaded) this.loadSmartLists();

    return `
      ${this._renderSmartListsBar()}

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
        <select onchange="OutreachModule.setPageSize(this.value)"
          style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;" title="Počet na stránku">
          <option value="25" ${pageSize===25?'selected':''}>25 / strana</option>
          <option value="50" ${pageSize===50?'selected':''}>50 / strana</option>
          <option value="100" ${pageSize===100?'selected':''}>100 / strana</option>
          <option value="200" ${pageSize===200?'selected':''}>200 / strana</option>
          <option value="500" ${pageSize===500?'selected':''}>500 / strana</option>
        </select>
      </div>

      ${selCount > 0 ? `
        <div style="background:#FFF7ED;border:1.5px solid #F97316;border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <strong style="color:#14120E;">Označených: ${selCount}</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.clearSelection()">Zrušiť výber</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.bulkAssign()">👤 Priradiť</button>
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
                  <input type="checkbox" ${this._allPageChecked(pageRows) ? 'checked' : ''} onchange="OutreachModule.toggleAllProspects(this.checked)">
                </th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Firma</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Kontakt</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Fáza a aktivita</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Skóre</th>
              </tr>
            </thead>
            <tbody>
              ${pageRows.length === 0 ? `
                <tr><td colspan="5" style="padding:40px;text-align:center;color:#6F6758;">${total === 0 ? 'Žiadni prospekti podľa filtra.' : 'Na tejto stránke nie sú záznamy.'}</td></tr>
              ` : pageRows.map(p => this.renderRow(p)).join('')}
            </tbody>
          </table>
        </div>
        ${total > 0 ? `
          <div style="padding:12px 16px;border-top:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:#6F6758;">
            <div>Zobrazené <strong>${from + 1}–${to}</strong> z <strong>${total}</strong></div>
            ${totalPages > 1 ? `
              <div style="display:inline-flex;gap:6px;align-items:center;">
                <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.goToPage(1)" ${this.page === 1 ? 'disabled' : ''} title="Prvá">«</button>
                <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.goToPage(${this.page - 1})" ${this.page === 1 ? 'disabled' : ''}>← Predošlá</button>
                <span style="padding:0 10px;font-weight:600;">Strana ${this.page} / ${totalPages}</span>
                <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.goToPage(${this.page + 1})" ${this.page === totalPages ? 'disabled' : ''}>Ďalšia →</button>
                <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.goToPage(${totalPages})" ${this.page === totalPages ? 'disabled' : ''} title="Posledná">»</button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  },

  _allPageChecked(pageRows) {
    if (!pageRows.length) return false;
    return pageRows.every(p => this.selectedIds.has(p.id));
  },

  goToPage(n) {
    this.page = Math.max(1, parseInt(n) || 1);
    this.rerender();
  },

  setPageSize(n) {
    const v = Math.max(10, parseInt(n) || 50);
    this.pageSize = v;
    this.page = 1;
    this.rerender();
  },

  renderRow(prospect) {
    const stage = this.stageBadge(prospect);
    const company = prospect.company_name || prospect.domain;
    const contact = prospect.contact_person
      ? `${prospect.contact_person}${prospect.email ? ' · ' + prospect.email : ''}`
      : (prospect.email || '—');
    const isConverted = prospect.outreach_stage === 'converted';
    const checked = this.selectedIds.has(prospect.id);
    const activity = this._activityChips(prospect);

    return `
      <tr data-id="${prospect.id}" onclick="OutreachModule._onRowClick(event, '${prospect.id}')"
          style="border-top:1px solid #EAE6DE;cursor:pointer;${isConverted ? 'opacity:.6;' : ''}"
          onmouseenter="this.style.background='#FAF8F4'" onmouseleave="this.style.background=''">
        <td style="padding:14px 16px;" onclick="event.stopPropagation()">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="OutreachModule.toggleSelect('${prospect.id}')">
        </td>
        <td style="padding:14px 16px;">
          <div style="font-weight:600;color:#14120E;">${this.esc(company)}</div>
          <div style="font-size:12px;color:#948B7C;">${this.esc(prospect.domain || '')}${prospect.industry ? ' · ' + this.esc(prospect.industry) : ''}</div>
        </td>
        <td style="padding:14px 16px;color:#6F6758;">${this.esc(contact)}</td>
        <td style="padding:14px 16px;">
          ${stage}
          ${activity ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">${activity}</div>` : ''}
        </td>
        <td style="padding:14px 16px;"><strong>${prospect.score || 0}</strong></td>
      </tr>
    `;
  },

  _onRowClick(event, prospectId) {
    // defenzívne — klik na tag typu button/a/input nech neotvára modal
    const tag = (event.target?.tagName || '').toLowerCase();
    if (['button','a','input','select','textarea','label'].includes(tag)) return;
    this.openProspectDetail(prospectId);
  },

  _activityChips(p) {
    const chips = [];
    const fmt = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      const now = Date.now();
      const diff = Math.max(0, now - d.getTime());
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'teraz';
      if (mins < 60) return `pred ${mins} min`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `pred ${hrs} h`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `pred ${days} d`;
      return d.toLocaleDateString('sk-SK');
    };
    const chip = (label, ts, color, bg, title) => {
      if (!ts) return '';
      return `<span title="${title || ''}${ts ? ' · ' + new Date(ts).toLocaleString('sk-SK') : ''}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:${bg};color:${color};font-size:11px;font-weight:600;">${label} ${fmt(ts)}</span>`;
    };
    chips.push(chip('✉ odoslané', p.outreach_email_sent_at, '#3B82F6', '#DBEAFE', 'Email odoslaný'));
    if (p.outreach_email_open_count > 0) {
      chips.push(chip(`👁 otvorené${p.outreach_email_open_count > 1 ? ' ×' + p.outreach_email_open_count : ''}`, p.outreach_email_opened_at, '#8B5CF6', '#EDE9FE', 'Email otvorený'));
    }
    chips.push(chip('🎯 audit request', p.audit_requested_at, '#F97316', '#FFEDD5', 'Klikol „Chcem audit"'));
    chips.push(chip('📄 audit hotový', p.audit_delivered_at, '#0EA5E9', '#E0F2FE', 'Audit vygenerovaný'));
    chips.push(chip('📖 audit videl', p.audit_viewed_at, '#16A34A', '#DCFCE7', 'Audit zobrazený'));
    return chips.filter(Boolean).join('');
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

    const outreachTpls = (this.templates || []).filter(t => t.category === 'outreach' && t.is_active !== false);
    const currentTpl = outreachTpls.find(t => t.slug === this.selectedTemplateSlug) || outreachTpls[0];
    if (currentTpl && currentTpl.slug !== this.selectedTemplateSlug) {
      this.selectedTemplateSlug = currentTpl.slug;
    }

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:flex-start;">
        <!-- LEFT: setup + recipients -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:24px;">
          <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#14120E;">Poslať kampaň</h2>
          <p style="color:#6F6758;font-size:14px;margin:0 0 16px;">${ready.length} príjemcov · personalizované (meno, firma, odvetvie, mesto).</p>
          ${noEmail.length ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;font-size:13px;color:#92400E;margin-bottom:16px;">${noEmail.length} firiem nemá email → bude preskočených.</div>` : ''}

          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin:0;">Šablóna ${this._templatesLoadMeta ? `<span style="color:#948B7C;font-weight:500;text-transform:none;letter-spacing:0;">(DB: ${this._templatesLoadMeta.totalReturned ?? 0} záznamov, ${this._templatesLoadMeta.outreach ?? 0} outreach${this._templatesLoadMeta.error ? ', chyba: ' + this._templatesLoadMeta.error : ''})</span>` : ''}</label>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.reloadComposeTemplates()" title="Znovu načítať">↻</button>
            </div>
            ${!this.templatesLoaded ? `
              <div style="padding:14px;border:1px dashed #EAE6DE;border-radius:10px;color:#948B7C;font-size:13px;">Načítavam šablóny…</div>
            ` : outreachTpls.length === 0 ? `
              <div style="padding:14px;border:1px dashed #F97316;background:#FFF7ED;border-radius:10px;color:#92400E;font-size:13px;line-height:1.5;">
                <strong>Žiadne outreach šablóny neboli načítané.</strong><br>
                V DB je: ${this._templatesLoadMeta?.totalReturned ?? '?'} záznamov. Skontroluj konzolu (F12) pre detaily.<br>
                Prípadne klikni <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.reloadComposeTemplates()" style="margin:6px 0 0;">↻ Znovu načítať</button>
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;">
                ${outreachTpls.map(t => {
                  const active = t.slug === this.selectedTemplateSlug;
                  return `
                    <button type="button" onclick="OutreachModule.selectComposeTemplate('${t.slug}')"
                      style="text-align:left;padding:12px 14px;border:1.5px solid ${active ? '#F97316' : '#EAE6DE'};background:${active ? '#FFF7ED' : '#fff'};border-radius:10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;">
                      <div style="min-width:0;">
                        <div style="font-weight:600;font-size:13px;color:#14120E;margin-bottom:2px;">${this.esc(t.name)}</div>
                        <div style="font-size:11px;color:#948B7C;">${this.esc(t.subject)}</div>
                      </div>
                      ${active ? `<span style="font-size:11px;color:#F97316;font-weight:700;flex-shrink:0;">✓ aktívna</span>` : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          ${(this._composeSenders && this._composeSenders.length > 0) ? `
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Odosielateľ</label>
              <select onchange="OutreachModule._composeSenderId=this.value;OutreachModule._renderComposePreview();"
                style="width:100%;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
                <option value="auto" ${this._composeSenderId === 'auto' ? 'selected' : ''}>Auto rotácia (round-robin, rešpektuje denný limit)</option>
                ${this._composeSenders.map(s => `<option value="${s.id}" ${this._composeSenderId === s.id ? 'selected' : ''}>${this.esc(s.name)} &lt;${this.esc(s.email)}&gt; (${s.sent_today || 0}/${s.warmup_current || s.daily_limit || 40})</option>`).join('')}
              </select>
            </div>
          ` : ''}

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.setView('templates')">✏ Upraviť šablóny</button>
            <button class="adl-btn adl-btn-primary" onclick="OutreachModule.sendCampaign()" ${ready.length === 0 || !currentTpl ? 'disabled' : ''}>
              ▶ Odoslať ${ready.length} emailov
            </button>
          </div>

          <div style="border-top:1px solid #EAE6DE;padding-top:14px;">
            <div style="font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Príjemcovia (${ready.length})</div>
            <div style="max-height:260px;overflow-y:auto;border:1px solid #EAE6DE;border-radius:10px;">
              ${ready.map((p, i) => `
                <div style="padding:10px 14px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:10px;${i === 0 ? 'background:#FFF7ED;' : ''}">
                  <div style="min-width:0;">
                    <div style="font-weight:600;font-size:13px;color:#14120E;">${this.esc(p.company_name || p.domain)}${i === 0 ? ' <span style=font-size:10px;color:#F97316;>(náhľad)</span>' : ''}</div>
                    <div style="font-size:11px;color:#948B7C;">${this.esc(p.contact_person || '')} · ${this.esc(p.email)}</div>
                  </div>
                  <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewForProspect('${p.id}')" title="Náhľad pre túto firmu">👁</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- RIGHT: live preview -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px;position:sticky;top:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-size:11px;font-weight:700;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;">Náhľad emailu</div>
              <div id="compose-preview-subject" style="font-weight:700;font-size:15px;color:#14120E;margin-top:2px;">—</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="adl-btn adl-btn-sm ${this.composePreviewViewport==='desktop'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setComposeViewport('desktop')">🖥</button>
              <button class="adl-btn adl-btn-sm ${this.composePreviewViewport==='mobile'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setComposeViewport('mobile')">📱</button>
            </div>
          </div>
          <div style="background:#F7F5F1;border:1px solid #EAE6DE;border-radius:12px;padding:12px;display:flex;justify-content:center;">
            <iframe id="compose-preview-iframe" style="width:${this.composePreviewViewport==='mobile'?'375px':'100%'};max-width:100%;height:640px;border:1px solid #EAE6DE;border-radius:10px;background:#fff;"></iframe>
          </div>
        </div>
      </div>

      <div id="outreach-progress" style="display:none;margin-top:16px;"></div>
    `;
  },

  selectComposeTemplate(slug) {
    this.selectedTemplateSlug = slug;
    this.rerender();
    this._renderComposePreview();
  },

  async reloadComposeTemplates() {
    this.templatesLoaded = false;
    this.templates = [];
    this.rerender();
    await this.ensureOutreachTemplatesLoaded(true);
    this.rerender();
    this._renderComposePreview();
    if (this.templates.filter(t => t.category === 'outreach').length > 0) {
      Utils.toast(`Načítaných ${this.templates.filter(t => t.category === 'outreach').length} outreach šablón`, 'success');
    }
  },

  setComposeViewport(vp) {
    this.composePreviewViewport = vp;
    this.rerender();
    this._renderComposePreview();
  },

  async previewForProspect(id) {
    this._previewProspectId = id;
    await this._renderComposePreview();
  },

  async _renderComposePreview() {
    if (this.currentView !== 'compose') return;
    const selected = Array.from(this.selectedIds).map(id => this.prospects.find(p => p.id === id)).filter(p => p && p.email);
    const prospect = this.prospects.find(p => p.id === this._previewProspectId) || selected[0];
    if (!prospect) return;
    const email = await this.buildEmail(prospect);
    if (!email) return;
    const subjEl = document.getElementById('compose-preview-subject');
    if (subjEl) subjEl.textContent = email.subject;
    const iframe = document.getElementById('compose-preview-iframe');
    if (!iframe) return;
    iframe.onload = () => { try { iframe.contentDocument.open(); iframe.contentDocument.write(email.html); iframe.contentDocument.close(); } catch(e) {} };
    iframe.src = 'about:blank';
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
    this.page = 1;
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

  async startCompose() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Najprv označ prospektov checkboxami (alebo stlač „Označiť všetkých" v hlavičke tabuľky).', 'warning');
    }
    const selected = Array.from(this.selectedIds)
      .map(id => this.prospects.find(p => p.id === id))
      .filter(p => p && p.email);
    if (selected.length === 0) return Utils.toast('Žiadny z označených prospektov nemá email', 'warning');
    this.drafts.clear();
    this._previewProspectId = null;
    // Vždy force-reload pred otvorením kampane (nech máme najčerstvejšie šablóny)
    await this.ensureOutreachTemplatesLoaded(true);
    // Load senders pre selector
    try {
      const { data } = await Database.client.from('outreach_senders').select('id, name, email, is_active, sent_today, warmup_current, daily_limit').eq('is_active', true);
      this._composeSenders = data || [];
      if (!this._composeSenderId && this._composeSenders[0]) this._composeSenderId = 'auto';
    } catch { this._composeSenders = []; }
    console.log('[Outreach] compose start — templates:', this.templates.map(t => ({ slug: t.slug, category: t.category, is_active: t.is_active })));
    this.currentView = 'compose';
    this.rerender();
    this._renderComposePreview();
  },

  async ensureOutreachTemplatesLoaded(force = false) {
    if (!force && this.templatesLoaded && this.templates.length) return;
    try {
      const { data, error } = await Database.client
        .from('email_templates')
        .select('id, slug, name, description, category, subject, plain_text, body_text, html_content, body_html, variables, is_active, is_system, updated_at')
        .in('category', ['outreach', 'transactional'])
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      const all = data || [];
      this.templates = all.filter(t => t.is_active !== false);
      this.templatesLoaded = true;
      this._templatesLoadMeta = {
        totalReturned: all.length,
        outreach: this.templates.filter(t => t.category === 'outreach').length,
        transactional: this.templates.filter(t => t.category === 'transactional').length,
      };
      console.log('[Outreach] templates loaded:', this._templatesLoadMeta);
    } catch (e) {
      console.error('[Outreach] loadTemplates failed:', e);
      Utils.toast('Chyba pri načítaní šablón: ' + (e.message || e), 'danger');
      this.templatesLoaded = true;
      this._templatesLoadMeta = { error: e.message || String(e) };
    }
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
    const slug = this.selectedTemplateSlug || 'cold_outreach_audit';
    const vars = OutreachTemplates.buildColdOutreachVars({
      contactName: prospect.contact_person || '',
      companyName: prospect.company_name || prospect.domain,
      domain: prospect.domain,
      industry: prospect.industry || '',
      city: prospect.city || '',
      auditToken: prospect.audit_token,
    });
    const trackPixel = prospect.audit_token
      ? `${OutreachTemplates.baseUrl()}/.netlify/functions/track-open?audit=${prospect.audit_token}`
      : null;
    const fromDb = await OutreachTemplates.render(slug, vars, { trackPixelUrl: trackPixel });
    if (fromDb) return fromDb;
    // fallback ak šablóna v DB chýba — pre cold_outreach_audit máme hardcoded
    if (slug === 'cold_outreach_audit') {
      return await OutreachTemplates.coldOutreachAuditAsync({
        contactName: prospect.contact_person || '',
        companyName: prospect.company_name || prospect.domain,
        domain: prospect.domain,
        industry: prospect.industry || '',
        city: prospect.city || '',
        auditToken: prospect.audit_token,
      });
    }
    return null;
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
    const confirmOk = await Utils.confirm(`Odoslať ${selected.length} emailov? Táto akcia je nezvratná.`, {
      type: 'warning', confirmText: `Odoslať ${selected.length}`, cancelText: 'Zrušiť'
    });
    if (!confirmOk) return;

    // Sender selection
    const senders = this._composeSenders || [];
    const mode = this._composeSenderId || 'auto';
    const explicit = mode !== 'auto' ? senders.find(s => s.id === mode) : null;
    const rrPool = [...senders]; // round-robin order mutable

    const progressBox = document.getElementById('outreach-progress');
    progressBox.style.display = 'block';
    progressBox.innerHTML = `<div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:20px;">
      <div id="outreach-status" style="font-weight:600;margin-bottom:12px;">Odosielam 0/${selected.length}...</div>
      <div style="background:#F7F5F1;border-radius:8px;height:10px;overflow:hidden;"><div id="outreach-bar" style="height:100%;background:#F97316;width:0%;transition:width .3s;"></div></div>
      <div id="outreach-log" style="margin-top:12px;font-size:12px;font-family:monospace;color:#6F6758;max-height:200px;overflow-y:auto;"></div>
    </div>`;

    let ok = 0, fail = 0;
    const senderBumps = new Map(); // id → count
    for (let i = 0; i < selected.length; i++) {
      const prospect = selected[i];
      // pick sender
      let sender = explicit;
      if (!sender && rrPool.length) {
        // round-robin: vezmi z pool, posuň na koniec
        sender = rrPool.shift();
        rrPool.push(sender);
      }
      try {
        const email = await this.buildEmail(prospect);
        const payload = {
          to: prospect.email,
          subject: email.subject,
          htmlBody: email.html,
          textBody: email.text,
          prospectId: prospect.id,
        };
        if (sender) {
          payload.fromEmail = sender.email;
          payload.fromName = sender.name;
        }
        const r = await fetch('/.netlify/functions/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          ok++;
          await Database.client.from('prospects').update({
            outreach_email_sent_at: new Date().toISOString(),
            outreach_last_contacted_at: new Date().toISOString(),
            outreach_stage: 'email_sent',
          }).eq('id', prospect.id);
          if (sender) senderBumps.set(sender.id, (senderBumps.get(sender.id) || 0) + 1);
          this.appendLog(`✓ ${prospect.company_name || prospect.domain}${sender ? ` (via ${sender.email})` : ''}`, 'ok');
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
      await new Promise(r => setTimeout(r, 250));
    }

    // Update sender counters atomicky per sender
    for (const [senderId, count] of senderBumps.entries()) {
      const s = senders.find(x => x.id === senderId);
      if (!s) continue;
      await Database.client.from('outreach_senders').update({
        sent_today: (s.sent_today || 0) + count,
        total_sent: (s.total_sent || 0) + count,
        last_sent_at: new Date().toISOString(),
      }).eq('id', senderId);
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
    const groups = { outreach: [], transactional: [], custom: [] };
    rows.forEach(t => {
      const cat = t.category === 'transactional' ? 'transactional' : (t.is_system ? 'outreach' : 'custom');
      (groups[cat] || groups.outreach).push(t);
    });
    const groupLabel = { outreach: 'Cold outreach', transactional: 'Transakčné', custom: 'Vlastné' };

    const renderGroup = (key) => {
      const items = groups[key] || [];
      if (!items.length) return '';
      return `
        <div style="padding:14px 24px 6px;font-size:12px;font-weight:700;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;background:#FAF8F4;border-top:1px solid #EAE6DE;">${groupLabel[key]} (${items.length})</div>
        ${items.map(t => `
          <div style="padding:16px 24px;border-top:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:16px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                <strong style="font-size:15px;color:#14120E;">${this.esc(t.name)}</strong>
                ${t.is_system ? `<span style="font-size:11px;background:#F7F5F1;color:#6F6758;padding:2px 8px;border-radius:999px;">systémová</span>` : `<span style="font-size:11px;background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:999px;">vlastná</span>`}
                ${!t.is_active ? `<span style="font-size:11px;background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:999px;">neaktívna</span>` : ''}
              </div>
              <div style="font-size:13px;color:#6F6758;margin-bottom:4px;">${this.esc(t.description || '')}</div>
              <div style="font-size:12px;color:#948B7C;font-family:ui-monospace,monospace;">${this.esc(t.slug)} · ${this.esc(t.subject)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
              <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editTemplate('${t.id}')">Upraviť</button>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewTemplate('${t.id}')">Náhľad</button>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.duplicateTemplate('${t.id}')" title="Duplikovať">⎘</button>
              ${!t.is_system ? `<button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteTemplate('${t.id}')" title="Zmazať">✕</button>` : ''}
            </div>
          </div>
        `).join('')}
      `;
    };

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#14120E;">Šablóny emailov</h2>
            <p style="font-size:13px;color:#6F6758;margin:0;">Uprav predmet/text. Premenné <code style="background:#F7F5F1;padding:1px 4px;border-radius:3px;">{{company}}</code>. CTA tlačidlo <code style="background:#F7F5F1;padding:1px 4px;border-radius:3px;">[[Text|url]]</code>.</p>
          </div>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.newTemplate()">+ Nová šablóna</button>
        </div>
        ${!this.templatesLoaded ? `<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam šablóny…</div>`
          : rows.length === 0 ? `<div style="padding:40px;text-align:center;color:#6F6758;">Žiadne šablóny.</div>`
          : renderGroup('outreach') + renderGroup('custom') + renderGroup('transactional')}
      </div>
    `;
  },

  _renderTemplateEditor() {
    const t = this.editingTemplate;
    const vars = Array.isArray(t.variables) ? t.variables : [];
    const mode = this.editorMode;
    const hasHtml = !!(t.html_content || t.body_html);
    return `
      <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;">
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <h2 style="font-size:18px;font-weight:700;margin:0;">${this.esc(t.name)}</h2>
            <div style="display:flex;gap:6px;">
              <button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.openAiGenerator()" title="Nechaj AI napísať za teba">✨ AI napíš za mňa</button>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.cancelEdit()">← Späť na zoznam</button>
            </div>
          </div>

          <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Predmet</label>
          <input id="tpl-subject" type="text" value="${this.esc(t.subject || '')}"
            style="width:100%;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;margin-bottom:16px;">

          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button class="adl-btn adl-btn-sm ${mode==='plain'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setEditorMode('plain')">Plain text${hasHtml?'':' (odporúčané)'}</button>
            <button class="adl-btn adl-btn-sm ${mode==='html'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setEditorMode('html')">HTML</button>
          </div>

          ${mode === 'plain' ? `
            <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Telo emailu</label>
            <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;padding:6px;background:#F7F5F1;border:1.5px solid #EAE6DE;border-bottom:0;border-radius:10px 10px 0 0;">
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('cta')" title="Vložiť CTA tlačidlo">▶ Tlačidlo</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('link')" title="Vložiť link">🔗 Link</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('greeting')" title="{{greeting}}">👋 {{greeting}}</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('company')" title="{{company}}">🏢 {{company}}</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('audit')" title="Audit request CTA">🧾 Audit CTA</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('signature')" title="Podpis">✍ Podpis</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.insertSnippet('ps')" title="P.S. riadok">P.S.</button>
            </div>
            <textarea id="tpl-text" rows="18" style="width:100%;padding:12px 14px;border:1.5px solid #EAE6DE;border-top:0;border-radius:0 0 10px 10px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6;resize:vertical;">${this.esc(t.plain_text || t.body_text || '')}</textarea>
          ` : `
            <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">HTML obsah (rich editor, prepíše brand wrapper)</label>
            <div id="tpl-html-editor" style="background:#fff;border:1.5px solid #EAE6DE;border-radius:10px;min-height:360px;"></div>
            <textarea id="tpl-html" style="display:none;">${this.esc(t.html_content || t.body_html || '')}</textarea>
            <p style="font-size:12px;color:#948B7C;margin:6px 0 0;">Nechaj prázdne pre auto-generovanie HTML z plain textu s brandom. Pre CTA tlačidlo vlož link na samostatný riadok a pred/za neho <code style="background:#F7F5F1;padding:1px 4px;border-radius:3px;">[[Text|url]]</code>.</p>
          `}

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
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
            ${vars.map(v => `
              <button onclick="OutreachModule.copyVar('${v}')"
                style="text-align:left;padding:8px 10px;border:1px solid #EAE6DE;background:#F7F5F1;border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;color:#3A352B;cursor:pointer;">
                {{${v}}}
              </button>
            `).join('')}
          </div>
          <h3 style="font-size:13px;font-weight:700;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">CTA tlačidlo</h3>
          <p style="font-size:12px;color:#948B7C;margin:0 0 8px;line-height:1.5;">Do textu na samostatný riadok napíš:</p>
          <code style="display:block;padding:8px 10px;background:#F7F5F1;border:1px solid #EAE6DE;border-radius:8px;font-size:12px;color:#3A352B;word-break:break-all;">[[Chcem audit|{{audit_request_url}}]]</code>
          <p style="font-size:11px;color:#948B7C;margin:6px 0 0;">V emaili sa zobrazí ako veľké oranžové tlačidlo.</p>
        </aside>
      </div>
    `;
  },

  setEditorMode(mode) {
    const subj = document.getElementById('tpl-subject')?.value;
    const plain = document.getElementById('tpl-text')?.value;
    const html = this._readQuillHtml() ?? document.getElementById('tpl-html')?.value;
    if (this.editingTemplate) {
      if (subj != null) this.editingTemplate.subject = subj;
      if (plain != null) { this.editingTemplate.plain_text = plain; this.editingTemplate.body_text = plain; }
      if (html != null) { this.editingTemplate.html_content = html; this.editingTemplate.body_html = html; }
    }
    this._quillEditor = null;
    this.editorMode = mode;
    this.rerender();
    // Po renderi inicializuj Quill pre HTML mode
    if (mode === 'html') {
      setTimeout(() => this._initQuillEditor(), 30);
    }
  },

  _initQuillEditor() {
    const host = document.getElementById('tpl-html-editor');
    if (!host || !window.Quill) return;
    if (this._quillEditor) return;
    const initial = document.getElementById('tpl-html')?.value || '';
    this._quillEditor = new Quill(host, {
      theme: 'snow',
      placeholder: 'Začni písať HTML šablónu… alebo vlož celý <!DOCTYPE html> blok',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['link', 'image', 'blockquote', 'code-block'],
          ['clean'],
        ],
      },
    });
    if (initial) {
      // Ak obsahuje <html> alebo <!DOCTYPE> — nastavujeme ako innerHTML, inak pasteHTML
      if (/<html|<!DOCTYPE/i.test(initial)) {
        this._quillEditor.root.innerHTML = initial;
      } else {
        this._quillEditor.clipboard.dangerouslyPasteHTML(initial);
      }
    }
  },

  _readQuillHtml() {
    if (!this._quillEditor) return null;
    return this._quillEditor.root.innerHTML;
  },

  editTemplate(id) {
    const t = this.templates.find(x => x.id === id);
    if (!t) return;
    this.editingTemplate = { ...t };
    this._quillEditor = null;
    this.rerender();
    if (this.editorMode === 'html') {
      setTimeout(() => this._initQuillEditor(), 30);
    }
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

  async previewEditing() {
    const subject = document.getElementById('tpl-subject')?.value || '';
    const text = document.getElementById('tpl-text')?.value || '';
    const customHtml = this._readQuillHtml() ?? document.getElementById('tpl-html')?.value ?? '';
    const sampleVars = this._sampleVars();
    const subj = OutreachTemplates.substitute(subject, sampleVars);
    const brand = await OutreachTemplates.loadBrand();
    let html;
    if (this.editorMode === 'html' && customHtml.trim()) {
      html = OutreachTemplates.substitute(customHtml, sampleVars);
    } else {
      const txt = OutreachTemplates.substitute(text, sampleVars);
      // skipLinkRewrite: preview ukazuje pôvodné linky (netrackované)
      html = OutreachTemplates.wrapTextInBrand(subj, txt, { brand, unsubscribeUrl: brand.unsubscribeUrl });
    }
    const box = document.getElementById('tpl-preview');
    if (!box) return;
    this._previewHtml = html;
    this._previewSubject = subj;
    box.style.display = 'block';
    this._renderPreviewBox();
  },

  _renderPreviewBox() {
    const box = document.getElementById('tpl-preview');
    if (!box) return;
    const vp = this.previewViewport;
    const iframeWidth = vp === 'mobile' ? '375px' : '100%';
    const iframeMaxWidth = vp === 'mobile' ? '375px' : '100%';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px;">
        <strong style="font-size:14px;">Náhľad: ${this.esc(this._previewSubject || '')}</strong>
        <div style="display:flex;gap:6px;">
          <button class="adl-btn adl-btn-sm ${vp==='desktop'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setPreviewViewport('desktop')">🖥 Desktop</button>
          <button class="adl-btn adl-btn-sm ${vp==='mobile'?'adl-btn-ink':'adl-btn-outline'}" onclick="OutreachModule.setPreviewViewport('mobile')">📱 Mobile</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="document.getElementById('tpl-preview').style.display='none'">✕</button>
        </div>
      </div>
      <div style="background:#F7F5F1;border:1px solid #EAE6DE;border-radius:12px;padding:14px;display:flex;justify-content:center;">
        <iframe id="tpl-preview-iframe" style="width:${iframeWidth};max-width:${iframeMaxWidth};height:640px;border:1px solid #EAE6DE;border-radius:10px;background:#fff;"></iframe>
      </div>
    `;
    const iframe = document.getElementById('tpl-preview-iframe');
    const html = this._previewHtml || '';
    iframe.onload = () => { try { iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close(); } catch(e) {} };
    iframe.src = 'about:blank';
  },

  setPreviewViewport(vp) {
    this.previewViewport = vp;
    this._renderPreviewBox();
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
    const text = document.getElementById('tpl-text')?.value ?? t.plain_text ?? t.body_text ?? '';
    const html = this._readQuillHtml() ?? document.getElementById('tpl-html')?.value ?? t.html_content ?? t.body_html ?? '';
    if (!subject) return Utils.toast('Predmet je povinný', 'warning');
    if (!text && !html) return Utils.toast('Vyplň aspoň plain text alebo HTML', 'warning');
    const update = { subject, plain_text: text, body_text: text };
    // HTML sa ukladá len keď má hodnotu — prázdny reťazec uloží NULL aby sa použil brand wrapper
    update.html_content = html.trim() || null;
    update.body_html = html.trim() || null;
    const { error } = await Database.client
      .from('email_templates')
      .update(update)
      .eq('id', t.id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    OutreachTemplates.clearCache();
    Utils.toast('Uložené', 'success');
    const idx = this.templates.findIndex(x => x.id === t.id);
    if (idx >= 0) this.templates[idx] = { ...this.templates[idx], ...update, updated_at: new Date().toISOString() };
    this.editingTemplate = null;
    this.editorMode = 'plain';
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

  // ========== SMART LISTS ==========

  async loadSmartLists() {
    this.smartListsLoaded = true;
    try {
      const { data } = await Database.client
        .from('outreach_smart_lists')
        .select('id, name, description, filters, color, created_at')
        .order('created_at', { ascending: false });
      this.smartLists = data || [];
      this.rerender();
    } catch {
      this.smartLists = [];
    }
  },

  _renderSmartListsBar() {
    const lists = this.smartLists || [];
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
        <span style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Segmenty:</span>
        <button onclick="OutreachModule.clearSmartList()"
          style="padding:5px 12px;border:1px solid ${!this.activeSmartListId ? '#F97316' : '#E5E0D7'};background:${!this.activeSmartListId ? '#FFF7ED' : '#fff'};border-radius:999px;font-size:12px;font-weight:600;color:${!this.activeSmartListId ? '#F97316' : '#6F6758'};cursor:pointer;">
          Všetci (${this.prospects.length})
        </button>
        ${lists.map(l => {
          const active = this.activeSmartListId === l.id;
          return `
            <button onclick="OutreachModule.applySmartList('${l.id}')"
              style="padding:5px 12px;border:1px solid ${active ? (l.color || '#F97316') : '#E5E0D7'};background:${active ? (l.color || '#F97316') + '14' : '#fff'};border-radius:999px;font-size:12px;font-weight:600;color:${active ? (l.color || '#F97316') : '#3A352B'};cursor:pointer;display:inline-flex;align-items:center;gap:6px;"
              title="${this.esc(l.description || '')}">
              <span>${this.esc(l.name)}</span>
              <span onclick="event.stopPropagation();OutreachModule.deleteSmartList('${l.id}')" style="opacity:.5;font-size:10px;" title="Zmazať segment">✕</span>
            </button>
          `;
        }).join('')}
        <button onclick="OutreachModule.saveSmartList()" title="Uložiť aktuálne filtre ako segment"
          style="padding:5px 12px;border:1px dashed #CFC7B9;background:transparent;border-radius:999px;font-size:12px;font-weight:600;color:#6F6758;cursor:pointer;">
          + Uložiť filter
        </button>
      </div>
    `;
  },

  async applySmartList(id) {
    const list = (this.smartLists || []).find(x => x.id === id);
    if (!list) return;
    this.activeSmartListId = id;
    this.filters = { ...this.filters, ...(list.filters || {}) };
    this.page = 1;
    this.rerender();
  },

  clearSmartList() {
    this.activeSmartListId = null;
    this.filters = { stage: 'pending', segment: 'all', search: '' };
    this.page = 1;
    this.rerender();
  },

  async saveSmartList() {
    const name = await Utils.prompt({
      title: '+ Uložiť segment',
      message: 'Aktuálne filtre sa uložia ako segment.',
      placeholder: 'napr. Zubári BA pending',
      confirmText: 'Uložiť',
    });
    if (!name) return;
    const payload = {
      name,
      filters: { ...this.filters },
    };
    const { data, error } = await Database.client.from('outreach_smart_lists').insert(payload).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.smartLists = [data, ...this.smartLists];
    this.activeSmartListId = data.id;
    this.rerender();
    Utils.toast('Segment uložený', 'success');
  },

  async deleteSmartList(id) {
    const ok = await Utils.confirm('Zmazať segment?', { type: 'danger', confirmText: 'Zmazať' });
    if (!ok) return;
    await Database.client.from('outreach_smart_lists').delete().eq('id', id);
    this.smartLists = this.smartLists.filter(x => x.id !== id);
    if (this.activeSmartListId === id) this.activeSmartListId = null;
    this.rerender();
  },

  // ========== ANALYTICS ==========

  _analyticsData: null,

  async openAnalytics() {
    this.currentView = 'analytics';
    this._analyticsData = null;
    this.rerender();
    try {
      // 1. Prospects agregované
      const { data: prospectsData } = await Database.client
        .from('prospects')
        .select('id, outreach_stage, outreach_email_sent_at, outreach_email_human_open, outreach_email_open_count, audit_requested_at, audit_viewed_at, converted_to_lead_id, outreach_email_replied_at, source');

      // 2. Events agregované
      const { data: eventsData } = await Database.client
        .from('prospect_events')
        .select('event_type, is_bot, occurred_at, geo_country, link_url')
        .gte('occurred_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(5000);

      // 3. Campaigns
      const { data: campaignsData } = await Database.client
        .from('outreach_campaigns')
        .select('id, name, status, outreach_campaign_enrollments(status)');

      this._analyticsData = {
        prospects: prospectsData || [],
        events: eventsData || [],
        campaigns: campaignsData || [],
      };
      this.rerender();
    } catch (e) {
      console.error(e);
      Utils.toast('Chyba: ' + e.message, 'danger');
    }
  },

  renderAnalytics() {
    const d = this._analyticsData;
    if (!d) return `<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam analytiku…</div>`;

    const p = d.prospects;
    const sent = p.filter(x => x.outreach_email_sent_at).length;
    const opened = p.filter(x => x.outreach_email_human_open).length;
    const multiOpen = p.filter(x => (x.outreach_email_open_count || 0) >= 2).length;
    const auditReq = p.filter(x => x.audit_requested_at).length;
    const auditViewed = p.filter(x => x.audit_viewed_at).length;
    const replied = p.filter(x => x.outreach_email_replied_at).length;
    const converted = p.filter(x => x.converted_to_lead_id).length;
    const unsubscribed = p.filter(x => x.outreach_stage === 'unsubscribed').length;
    const bounced = p.filter(x => x.outreach_stage === 'bounced').length;

    const rate = (n, total) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
    const openRate = rate(opened, sent);
    const auditRate = rate(auditReq, sent);
    const viewRate = rate(auditViewed, auditReq);
    const convRate = rate(converted, sent);
    const replyRate = rate(replied, sent);

    // Events by day (30 dní)
    const ev = d.events;
    const humanOpens = ev.filter(e => e.event_type === 'email_open' && !e.is_bot).length;
    const botOpens = ev.filter(e => e.event_type === 'email_open' && e.is_bot).length;
    const clicks = ev.filter(e => e.event_type === 'email_click' && !e.is_bot).length;
    const countries = [...new Set(ev.filter(e => !e.is_bot && e.geo_country).map(e => e.geo_country))];

    // Sources
    const sourceMap = {};
    p.forEach(x => { const s = x.source || 'unknown'; sourceMap[s] = (sourceMap[s] || 0) + 1; });
    const topSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Campaigns overview
    const campStats = d.campaigns.map(c => {
      const enrollments = c.outreach_campaign_enrollments || [];
      return {
        name: c.name, status: c.status,
        total: enrollments.length,
        active: enrollments.filter(e => e.status === 'active').length,
        completed: enrollments.filter(e => e.status === 'completed').length,
      };
    });

    // Daily trend (30 dní)
    const buckets = {};
    for (let i = 29; i >= 0; i--) {
      const d2 = new Date(Date.now() - i * 86400000);
      const key = d2.toISOString().slice(0, 10);
      buckets[key] = { opens: 0, clicks: 0 };
    }
    ev.forEach(e => {
      if (e.is_bot) return;
      const key = String(e.occurred_at || '').slice(0, 10);
      if (!buckets[key]) return;
      if (e.event_type === 'email_open') buckets[key].opens++;
      else if (e.event_type === 'email_click') buckets[key].clicks++;
    });
    const maxDaily = Math.max(1, ...Object.values(buckets).map(b => b.opens + b.clicks));

    return `
      <div style="display:grid;gap:16px;">
        <!-- Funnel -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <h2 style="font-size:18px;font-weight:700;margin:0 0 14px;">Konverzný lievik (všetky prospecti)</h2>
          <div style="display:grid;gap:8px;">
            ${this._funnelRow('✉ Odoslané',       sent,        sent)}
            ${this._funnelRow('👁 Otvorené',       opened,      sent, openRate + '%')}
            ${this._funnelRow('👁×2 Viackrát',    multiOpen,   sent)}
            ${this._funnelRow('🎯 Požiadali o audit', auditReq, sent, auditRate + '%')}
            ${this._funnelRow('📖 Audit videli',   auditViewed, sent, viewRate + '%')}
            ${this._funnelRow('💬 Odpovedali',    replied,     sent, replyRate + '%')}
            ${this._funnelRow('🎉 Konvertovaní (lead)', converted, sent, convRate + '%')}
          </div>
          <div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;">
            <div style="font-size:12px;color:#6F6758;">Unsubscribed: <strong>${unsubscribed}</strong></div>
            <div style="font-size:12px;color:#6F6758;">Bounced: <strong>${bounced}</strong></div>
          </div>
        </div>

        <!-- Stats + trend -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
            <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;">Aktivita (30 dní)</h3>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
              ${this._stat('👁 Human opens', humanOpens, '#8B5CF6', '#EDE9FE')}
              ${this._stat('🖱 Clicks', clicks, '#F97316', '#FFEDD5')}
              ${this._stat('🤖 Bot opens', botOpens, '#6F6758', '#F7F5F1')}
              ${this._stat('📍 Krajín', countries.length, '#3B82F6', '#DBEAFE')}
            </div>
          </div>
          <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
            <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;">Zdroje prospektov</h3>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${topSources.length === 0 ? '<div style="color:#948B7C;">—</div>' : topSources.map(([src, count]) => {
                const pct = Math.round((count / p.length) * 100);
                return `
                  <div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px;"><span>${this.esc(src)}</span><strong>${count}</strong></div>
                    <div style="height:6px;background:#EAE6DE;border-radius:999px;overflow:hidden;"><div style="height:100%;background:#F97316;width:${pct}%;"></div></div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Daily trend chart -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;">Opens + clicks denne (posledných 30 dní)</h3>
          <div style="display:flex;align-items:flex-end;gap:3px;height:140px;border-bottom:1px solid #EAE6DE;padding-bottom:4px;">
            ${Object.entries(buckets).map(([key, b]) => {
              const total = b.opens + b.clicks;
              const h = Math.round((total / maxDaily) * 100);
              const openH = total > 0 ? Math.round((b.opens / total) * h) : 0;
              return `
                <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;position:relative;" title="${key}: ${b.opens} opens, ${b.clicks} clicks">
                  <div style="background:#F97316;height:${h - openH}%;"></div>
                  <div style="background:#8B5CF6;height:${openH}%;"></div>
                </div>
              `;
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#948B7C;">
            <span>${Object.keys(buckets)[0]}</span>
            <span>${Object.keys(buckets).slice(-1)[0]}</span>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#6F6758;">
            <span style="display:inline-block;width:10px;height:10px;background:#8B5CF6;border-radius:2px;margin-right:4px;"></span> Opens (human) ·
            <span style="display:inline-block;width:10px;height:10px;background:#F97316;border-radius:2px;margin:0 4px 0 6px;"></span> Clicks
          </div>
        </div>

        <!-- Campaigns overview -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;">Kampane (${campStats.length})</h3>
          ${campStats.length === 0 ? '<div style="color:#948B7C;">Žiadne kampane.</div>' : `
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${campStats.map(c => `
                <div style="padding:10px 14px;border:1px solid #EAE6DE;border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                  <div>
                    <strong>${this.esc(c.name)}</strong>
                    <span style="font-size:11px;margin-left:6px;color:#6F6758;">${this.esc(c.status)}</span>
                  </div>
                  <div style="font-size:12px;color:#6F6758;">
                    ${c.total} enrolled · ${c.active} aktívnych · ${c.completed} dokončených
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  _funnelRow(label, count, total, rate) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
          <span style="color:#14120E;font-weight:500;">${label}</span>
          <span style="color:#6F6758;"><strong>${count}</strong>${rate ? ` · ${rate}` : ''}</span>
        </div>
        <div style="height:8px;background:#F7F5F1;border-radius:999px;overflow:hidden;">
          <div style="height:100%;background:linear-gradient(90deg,#F97316,#EA580C);width:${pct}%;transition:width .4s;"></div>
        </div>
      </div>
    `;
  },

  // ========== LEAD FINDER (AI) ==========

  _findResults: null,
  _findSelection: new Set(),

  _findSource: 'ai',

  openFindProspects() {
    this._findResults = null;
    this._findSelection = new Set();
    this._findSource = this._findSource || 'ai';
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:720px;width:min(94vw,720px);">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">🔍 Nájsť prospektov</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>

        <!-- Source picker -->
        <div style="padding:14px 24px 0;display:flex;gap:6px;flex-wrap:wrap;">
          ${[
            { k: 'ai',      label: '🤖 AI návrh',          hint: 'Claude' },
            { k: 'places',  label: '📍 Google Maps',        hint: 'reálne firmy' },
            { k: 'finstat', label: '📋 FinStat',            hint: 'SK register' },
          ].map(s => `
            <button type="button" onclick="OutreachModule._setFindSource('${s.k}')"
              style="padding:8px 14px;border:1.5px solid ${this._findSource === s.k ? '#F97316' : '#E5E0D7'};background:${this._findSource === s.k ? '#FFF7ED' : '#fff'};border-radius:10px;font-size:13px;font-weight:600;color:${this._findSource === s.k ? '#F97316' : '#3A352B'};cursor:pointer;">
              ${s.label}
              <span style="font-size:10px;opacity:.7;display:block;font-weight:500;">${s.hint}</span>
            </button>
          `).join('')}
        </div>

        <form id="find-form" onsubmit="event.preventDefault();OutreachModule.runFindProspects();" style="padding:14px 24px 12px;display:grid;gap:12px;">
          ${this._findSource === 'ai' ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${this._field('segment', 'Segment / odvetvie *', 'text', true)}
              ${this._field('city', 'Mesto / región', 'text')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">
              ${this._field('hints', 'Doplňujúce kritériá', 'text')}
              <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
                Počet
                <input type="number" name="count" min="1" max="50" value="10"
                  style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
              </label>
            </div>
            <p style="font-size:11px;color:#948B7C;margin:0;line-height:1.5;">AI návrhy na overenie. Bez kontaktov. Vyžaduje <code>ANTHROPIC_API_KEY</code>.</p>
          ` : this._findSource === 'places' ? `
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
              ${this._field('query', 'Hľadaj (kaderníctva, zubári, fitness) *', 'text', true)}
              ${this._field('city', 'Mesto', 'text')}
            </div>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
              Počet výsledkov (max 20 per request)
              <input type="number" name="maxResults" min="1" max="20" value="20"
                style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
            </label>
            <p style="font-size:11px;color:#948B7C;margin:0;line-height:1.5;">Reálne Google Maps firmy vrátane telefónu + webu. Vyžaduje <code>GOOGLE_MAPS_API_KEY</code>.</p>
          ` : `
            <div style="display:grid;grid-template-columns:1fr;gap:12px;">
              ${this._field('query', 'Názov firmy alebo IČO *', 'text', true)}
            </div>
            <p style="font-size:11px;color:#948B7C;margin:0;line-height:1.5;">Slovenský register FinStat. Vyžaduje <code>FINSTAT_API_KEY</code>.</p>
          `}
          <div id="find-status" style="display:none;font-size:13px;color:#6F6758;padding:10px 14px;background:#F7F5F1;border-radius:10px;"></div>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">🔍 Hľadať</button>
          </div>
        </form>
        <div id="find-results" style="padding:0 24px 24px;"></div>
      </div>
    `;
    this._openModal(modal);
    setTimeout(() => modal.querySelector('form input')?.focus(), 30);
  },

  _setFindSource(k) {
    this._findSource = k;
    this.openFindProspects();
  },

  async runFindProspects() {
    const form = document.getElementById('find-form');
    if (!form) return;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const status = document.getElementById('find-status');
    const btn = form.querySelector('button[type=submit]');
    const src = this._findSource || 'ai';
    const endpoint = src === 'ai' ? 'find-prospects' : src === 'places' ? 'lead-finder-places' : 'lead-finder-finstat';

    status.style.display = 'block';
    status.style.background = '#F7F5F1';
    status.style.color = '#6F6758';
    status.textContent = `⏳ Hľadám cez ${src === 'ai' ? 'AI (15-30s)' : src === 'places' ? 'Google Maps' : 'FinStat'}…`;
    btn.disabled = true;
    try {
      const r = await fetch(`/.netlify/functions/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      this._findResults = data.prospects || [];
      this._findSelection = new Set(this._findResults.map((_, i) => i));
      status.style.display = 'none';
      this._renderFindResults();
    } catch (e) {
      status.style.background = '#FEE2E2';
      status.style.color = '#991B1B';
      status.textContent = '✕ ' + e.message;
    } finally {
      btn.disabled = false;
    }
  },

  _renderFindResults() {
    const box = document.getElementById('find-results');
    if (!box || !this._findResults) return;
    const rows = this._findResults;
    if (rows.length === 0) {
      box.innerHTML = '<div style="color:#948B7C;padding:16px;text-align:center;">Žiadne výsledky.</div>';
      return;
    }
    const sel = this._findSelection;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;color:#6F6758;">${rows.length} kandidátov · označených ${sel.size}</div>
        <div style="display:flex;gap:6px;">
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule._toggleAllFind(true)">Všetkých</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule._toggleAllFind(false)">Žiadnych</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow-y:auto;border:1px solid #EAE6DE;border-radius:10px;">
        ${rows.map((p, i) => `
          <label style="display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid #F7F5F1;cursor:pointer;align-items:flex-start;${sel.has(i) ? 'background:#FFF7ED;' : ''}">
            <input type="checkbox" ${sel.has(i) ? 'checked' : ''} onchange="OutreachModule._toggleFindItem(${i})">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:#14120E;">${this.esc(p.company_name)}${p.ico ? ` <span style="font-size:11px;color:#948B7C;font-weight:500;">· IČO ${this.esc(p.ico)}</span>` : ''}</div>
              <div style="font-size:12px;color:#6F6758;margin:2px 0;">
                ${p.domain ? `<a href="https://${this.esc(p.domain)}" target="_blank" onclick="event.stopPropagation()" style="color:#F97316;text-decoration:none;">${this.esc(p.domain)} ↗</a>` : '<span style="color:#948B7C;">bez domény</span>'}
                ${p.city ? ` · ${this.esc(p.city)}` : ''}
                ${p.industry ? ` · ${this.esc(p.industry)}` : ''}
              </div>
              ${(p.email || p.phone) ? `<div style="font-size:12px;color:#3A352B;margin-top:2px;">${p.email ? `📧 ${this.esc(p.email)}` : ''}${p.email && p.phone ? ' · ' : ''}${p.phone ? `📞 ${this.esc(p.phone)}` : ''}</div>` : ''}
              ${p.reason ? `<div style="font-size:12px;color:#3A352B;font-style:italic;margin-top:3px;">${this.esc(p.reason)}</div>` : ''}
              ${p.metadata?.address ? `<div style="font-size:11px;color:#948B7C;margin-top:2px;">${this.esc(p.metadata.address)}</div>` : ''}
            </div>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px;">
        <button class="adl-btn adl-btn-primary" onclick="OutreachModule._addFoundProspects()" ${sel.size === 0 ? 'disabled' : ''}>
          + Pridať ${sel.size} prospektov
        </button>
      </div>
    `;
  },

  _toggleFindItem(i) {
    if (this._findSelection.has(i)) this._findSelection.delete(i);
    else this._findSelection.add(i);
    this._renderFindResults();
  },

  _toggleAllFind(on) {
    if (on) this._findSelection = new Set(this._findResults.map((_, i) => i));
    else this._findSelection = new Set();
    this._renderFindResults();
  },

  async _addFoundProspects() {
    const rows = (this._findResults || []).filter((_, i) => this._findSelection.has(i));
    if (rows.length === 0) return;

    // Dedup na domain
    const { data: existing } = await Database.client.from('prospects').select('domain');
    const existingDomains = new Set((existing || []).map(x => (x.domain || '').toLowerCase()).filter(Boolean));

    const toInsert = rows
      .filter(p => !p.domain || !existingDomains.has(p.domain.toLowerCase()))
      .map(p => ({
        company_name: p.company_name,
        domain: p.domain || null,
        industry: p.industry || null,
        city: p.city || null,
        email: p.email || null,
        phone: p.phone || null,
        ico: p.ico || null,
        source: p.source || this._findSource + '_finder',
        notes: p.reason || p.metadata?.address || null,
        outreach_stage: 'pending',
        score: 50,
      }));

    const skipped = rows.length - toInsert.length;
    if (toInsert.length === 0) {
      Utils.toast(`Všetkých ${rows.length} duplicitných`, 'warning');
      return;
    }
    const { error } = await Database.client.from('prospects').insert(toInsert);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast(`Pridaných ${toInsert.length}${skipped ? ` (preskočených ${skipped} duplicitných)` : ''}`, 'success');
    this.closeModal();
    // reload
    this.render(this._getContainer());
  },

  // ========== AUTOMATIONS (if-this-then-that) ==========

  _automations: null,
  _automationEditing: null,

  async openAutomations() {
    this.currentView = 'automations';
    this._automations = null;
    this._automationEditing = null;
    this.rerender();
    try {
      const { data } = await Database.client.from('automation_rules')
        .select('*').order('created_at', { ascending: false });
      this._automations = data || [];
      this.rerender();
    } catch (e) {
      this._automations = [];
      Utils.toast('Chyba: ' + e.message, 'danger');
      this.rerender();
    }
  },

  renderAutomations() {
    if (this._automationEditing) return this._renderAutomationEditor();
    const rows = this._automations;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;">⚡ Automatizácie</h2>
            <p style="font-size:13px;color:#6F6758;margin:0;">Ak prospekt urobí niečo → automaticky vykonaj akcie. Napr. <em>„Ak audit_requested AND skóre ≥ 70 → vytvor HIGH priority task + pošli notifikáciu"</em>.</p>
          </div>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.newAutomation()">+ Nové pravidlo</button>
        </div>
        ${rows == null ? '<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam…</div>'
          : rows.length === 0 ? '<div style="padding:40px;text-align:center;color:#6F6758;">Žiadne pravidlá. Vytvor prvé tlačidlom „+ Nové pravidlo".</div>'
          : rows.map(r => this._renderAutomationRow(r)).join('')}
      </div>
    `;
  },

  _renderAutomationRow(r) {
    return `
      <div style="padding:16px 24px;border-top:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <strong style="font-size:15px;color:#14120E;">${this.esc(r.name)}</strong>
            ${r.is_active ? '<span style="font-size:11px;background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:999px;font-weight:600;">Aktívne</span>' : '<span style="font-size:11px;background:#F7F5F1;color:#6F6758;padding:2px 8px;border-radius:999px;font-weight:600;">Vypnuté</span>'}
          </div>
          <div style="font-size:13px;color:#6F6758;">
            Trigger: <code style="background:#F7F5F1;padding:1px 6px;border-radius:3px;">${this.esc(r.trigger_event)}</code>
            · ${(r.actions || []).length} akcií · ${r.run_count || 0}× spustené
          </div>
          ${r.description ? `<div style="font-size:12px;color:#948B7C;margin-top:4px;">${this.esc(r.description)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editAutomation('${r.id}')">Upraviť</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.toggleAutomation('${r.id}')">${r.is_active ? '⏸' : '▶'}</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteAutomation('${r.id}')">✕</button>
        </div>
      </div>
    `;
  },

  async newAutomation() {
    const name = await Utils.prompt({ title: '+ Nové pravidlo', placeholder: 'napr. Vysoké skóre → priradiť mne', confirmText: 'Vytvoriť' });
    if (!name) return;
    const { data, error } = await Database.client.from('automation_rules').insert({
      name, trigger_event: 'audit_requested', is_active: true, conditions: {}, actions: [],
    }).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this._automations = [data, ...(this._automations || [])];
    this._automationEditing = { ...data };
    this.rerender();
  },

  editAutomation(id) {
    const r = (this._automations || []).find(x => x.id === id);
    if (!r) return;
    this._automationEditing = JSON.parse(JSON.stringify(r));
    this.rerender();
  },

  cancelAutomationEdit() {
    this._automationEditing = null;
    this.rerender();
  },

  _renderAutomationEditor() {
    const r = this._automationEditing;
    const triggerOpts = [
      ['audit_requested', 'Prospekt požiadal o audit'],
      ['call_booked', 'Prospekt rezervoval hovor'],
      ['email_replied', 'Prospekt odpovedal'],
      ['email_opened_n', 'Prospekt viackrát otvoril'],
      ['stage_changed', 'Zmena fázy'],
      ['score_above', 'Skóre prešlo prah'],
    ];
    const tplOpts = (this.templates || []).filter(t => t.category === 'outreach')
      .map(t => `<option value="${t.slug}">${this.esc(t.name)}</option>`).join('');
    const cond = r.conditions || {};

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <h2 style="font-size:18px;font-weight:700;margin:0;">${this.esc(r.name)}</h2>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.cancelAutomationEdit()">← Späť</button>
        </div>

        <div style="display:grid;gap:14px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;">
            Názov
            <input id="aut-name" type="text" value="${this.esc(r.name || '')}"
              style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;">
            Popis
            <input id="aut-desc" type="text" value="${this.esc(r.description || '')}"
              style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
          </label>

          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px 16px;">
            <h3 style="font-size:13px;font-weight:700;color:#92400E;margin:0 0 10px;">KEĎ (Trigger)</h3>
            <select id="aut-trigger" onchange="OutreachModule._automationEditing.trigger_event=this.value;"
              style="width:100%;padding:10px 14px;border:1.5px solid #FED7AA;border-radius:10px;font-size:14px;background:#fff;">
              ${triggerOpts.map(([v, l]) => `<option value="${v}" ${r.trigger_event === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>

          <div style="background:#F7F5F1;border:1px solid #EAE6DE;border-radius:12px;padding:14px 16px;">
            <h3 style="font-size:13px;font-weight:700;color:#6F6758;margin:0 0 10px;">A KEĎ (Podmienky — všetky musia platiť)</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:#6F6758;">
                Odvetvie obsahuje
                <input id="aut-cond-industry" type="text" value="${this.esc(cond.industry || '')}" placeholder="napr. gastro"
                  style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
              </label>
              <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:#6F6758;">
                Mesto obsahuje
                <input id="aut-cond-city" type="text" value="${this.esc(cond.city || '')}" placeholder="napr. Bratislava"
                  style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
              </label>
              <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:#6F6758;">
                Skóre min
                <input id="aut-cond-score-min" type="number" min="0" max="100" value="${cond.score_min ?? ''}"
                  style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
              </label>
              <label style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:#6F6758;">
                Skóre max
                <input id="aut-cond-score-max" type="number" min="0" max="100" value="${cond.score_max ?? ''}"
                  style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
              </label>
            </div>
          </div>

          <div style="background:#DCFCE7;border:1px solid #BBF7D0;border-radius:12px;padding:14px 16px;">
            <h3 style="font-size:13px;font-weight:700;color:#166534;margin:0 0 10px;">POTOM VYKONAJ (${(r.actions || []).length} akcie)</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
              ${(r.actions || []).map((a, i) => this._renderActionCard(a, i, tplOpts)).join('')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('create_task')">+ Úloha</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('notify_email')">+ Email notif</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('set_stage')">+ Zmena fázy</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('add_tag')">+ Pridať tag</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('add_note')">+ Poznámka</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('promote_to_lead')">+ Promote lead</button>
              <button type="button" class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule._addAction('send_template')">+ Pošli šablónu</button>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.cancelAutomationEdit()">Zrušiť</button>
            <button class="adl-btn adl-btn-primary" onclick="OutreachModule.saveAutomation()">Uložiť</button>
          </div>
        </div>
      </div>
    `;
  },

  _renderActionCard(a, i, tplOpts) {
    const stages = ['pending','email_sent','email_opened','email_clicked','audit_requested','audit_delivered','audit_viewed','call_booked','converted','lost','unsubscribed','bounced'];
    let body = '';
    if (a.type === 'create_task') {
      body = `
        <input type="text" value="${this.esc(a.title || '')}" placeholder="Názov úlohy (podporuje {{company}}, {{domain}})"
          onchange="OutreachModule._automationEditing.actions[${i}].title=this.value"
          style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;margin-bottom:6px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <select onchange="OutreachModule._automationEditing.actions[${i}].priority=this.value"
            style="padding:6px 8px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:12px;background:#fff;">
            <option value="normal" ${a.priority==='normal'?'selected':''}>Priorita: normal</option>
            <option value="high" ${a.priority==='high'?'selected':''}>Priorita: high</option>
            <option value="urgent" ${a.priority==='urgent'?'selected':''}>Priorita: urgent</option>
            <option value="low" ${a.priority==='low'?'selected':''}>Priorita: low</option>
          </select>
          <input type="number" value="${a.due_days ?? 1}" min="0" max="30" placeholder="Termín (dni)"
            onchange="OutreachModule._automationEditing.actions[${i}].due_days=parseInt(this.value)||0"
            style="padding:6px 8px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:12px;">
        </div>
      `;
    } else if (a.type === 'notify_email') {
      body = `<input type="text" value="${this.esc(a.body || '')}" placeholder="Text notifikácie (voliteľné)"
        onchange="OutreachModule._automationEditing.actions[${i}].body=this.value"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;">`;
    } else if (a.type === 'set_stage') {
      body = `<select onchange="OutreachModule._automationEditing.actions[${i}].stage=this.value"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;background:#fff;">
        ${stages.map(s => `<option value="${s}" ${a.stage===s?'selected':''}>${s}</option>`).join('')}
      </select>`;
    } else if (a.type === 'add_tag') {
      body = `<input type="text" value="${this.esc(a.tag || '')}" placeholder="napr. hot-lead"
        onchange="OutreachModule._automationEditing.actions[${i}].tag=this.value"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;">`;
    } else if (a.type === 'add_note') {
      body = `<textarea rows="2" onchange="OutreachModule._automationEditing.actions[${i}].body=this.value" placeholder="Text poznámky (podporuje {{vars}})"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;font-family:inherit;">${this.esc(a.body || '')}</textarea>`;
    } else if (a.type === 'promote_to_lead') {
      body = `<input type="text" value="${this.esc(a.reason || '')}" placeholder="Dôvod konverzie (voliteľné)"
        onchange="OutreachModule._automationEditing.actions[${i}].reason=this.value"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;">`;
    } else if (a.type === 'send_template') {
      body = `<select onchange="OutreachModule._automationEditing.actions[${i}].template_slug=this.value"
        style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:6px;font-size:13px;background:#fff;">
        ${tplOpts.replace(`value="${a.template_slug}"`, `value="${a.template_slug}" selected`)}
      </select>`;
    } else {
      body = `<div style="color:#6F6758;font-size:12px;">Neznámy typ akcie: ${a.type}</div>`;
    }
    const labels = {
      create_task: '📋 Vytvor úlohu',
      notify_email: '📧 Pošli notifikáciu',
      set_stage: '🔄 Zmeň fázu',
      add_tag: '🏷 Pridaj tag',
      add_note: '📝 Pridaj poznámku',
      promote_to_lead: '⬆ Promote na lead',
      send_template: '✉ Pošli šablónu',
    };
    return `
      <div style="background:#fff;border:1px solid #BBF7D0;border-radius:10px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:12px;color:#166534;">${labels[a.type] || a.type}</strong>
          <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule._removeAction(${i})">✕</button>
        </div>
        ${body}
      </div>
    `;
  },

  _addAction(type) {
    const r = this._automationEditing;
    if (!r) return;
    const defaults = {
      create_task: { type, title: 'Ozvať sa: {{company}}', priority: 'high', due_days: 1 },
      notify_email: { type, body: '' },
      set_stage: { type, stage: 'pending' },
      add_tag: { type, tag: '' },
      add_note: { type, body: '' },
      promote_to_lead: { type, reason: 'automation_rule' },
      send_template: { type, template_slug: (this.templates?.[0]?.slug || 'cold_outreach_audit') },
    };
    r.actions = [...(r.actions || []), defaults[type]];
    this.rerender();
  },

  _removeAction(i) {
    const r = this._automationEditing;
    if (!r?.actions) return;
    r.actions.splice(i, 1);
    this.rerender();
  },

  async saveAutomation() {
    const r = this._automationEditing;
    if (!r) return;
    const name = document.getElementById('aut-name')?.value?.trim() || r.name;
    const desc = document.getElementById('aut-desc')?.value?.trim() || null;
    const trigger = document.getElementById('aut-trigger')?.value || r.trigger_event;
    const cond = {
      industry: document.getElementById('aut-cond-industry')?.value?.trim() || undefined,
      city: document.getElementById('aut-cond-city')?.value?.trim() || undefined,
      score_min: parseInt(document.getElementById('aut-cond-score-min')?.value) || undefined,
      score_max: parseInt(document.getElementById('aut-cond-score-max')?.value) || undefined,
    };
    Object.keys(cond).forEach(k => cond[k] == null && delete cond[k]);

    const { error } = await Database.client.from('automation_rules').update({
      name, description: desc, trigger_event: trigger,
      conditions: cond,
      actions: r.actions || [],
    }).eq('id', r.id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast('Pravidlo uložené', 'success');
    this._automationEditing = null;
    await this.openAutomations();
  },

  async toggleAutomation(id) {
    const r = (this._automations || []).find(x => x.id === id);
    if (!r) return;
    await Database.client.from('automation_rules').update({ is_active: !r.is_active }).eq('id', id);
    r.is_active = !r.is_active;
    this.rerender();
  },

  async deleteAutomation(id) {
    const ok = await Utils.confirm('Zmazať pravidlo?', { type: 'danger', confirmText: 'Zmazať' });
    if (!ok) return;
    await Database.client.from('automation_rules').delete().eq('id', id);
    this._automations = this._automations.filter(x => x.id !== id);
    this.rerender();
  },

  // ========== CALENDAR (call bookings + working hours) ==========

  _bookings: null,
  _workingHours: null,
  _calendarWeekStart: null,

  async openCalendar() {
    this.currentView = 'calendar';
    this._bookings = null;
    this._workingHours = null;
    const monday = this._mondayOf(new Date());
    this._calendarWeekStart = monday;
    this.rerender();
    await Promise.all([
      this._loadWorkingHours(),
      this._loadBookings(),
    ]);
    this.rerender();
  },

  _mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  },

  async _loadWorkingHours() {
    try {
      const { data } = await Database.client.from('working_hours')
        .select('*').is('user_id', null).order('day_of_week', { ascending: true });
      this._workingHours = data || [];
    } catch { this._workingHours = []; }
  },

  async _loadBookings() {
    const start = this._calendarWeekStart;
    const end = new Date(start); end.setDate(end.getDate() + 7);
    try {
      const { data } = await Database.client.from('call_bookings')
        .select('id, scheduled_at, duration_minutes, status, contact_name, contact_email, contact_phone, topic, notes, lead_id, prospect_id')
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString())
        .order('scheduled_at', { ascending: true });
      this._bookings = data || [];
    } catch { this._bookings = []; }
  },

  navigateWeek(delta) {
    const d = new Date(this._calendarWeekStart);
    d.setDate(d.getDate() + delta * 7);
    this._calendarWeekStart = d;
    this._loadBookings().then(() => this.rerender());
  },

  jumpWeek() {
    this._calendarWeekStart = this._mondayOf(new Date());
    this._loadBookings().then(() => this.rerender());
  },

  renderCalendar() {
    const ws = this._calendarWeekStart || this._mondayOf(new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws); d.setDate(d.getDate() + i); return d;
    });
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    const bookings = this._bookings;
    const wh = this._workingHours;

    return `
      <div style="display:grid;gap:16px;">
        <!-- header -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:18px;font-weight:700;margin:0 0 2px;">📅 ${days[0].toLocaleDateString('sk-SK',{day:'numeric',month:'long'})} – ${days[6].toLocaleDateString('sk-SK',{day:'numeric',month:'long',year:'numeric'})}</h2>
            <div style="font-size:12px;color:#6F6758;">Týždenný prehľad bookingov z /book-call.html</div>
          </div>
          <div class="adl-toolbar">
            <button class="adl-btn adl-btn-ghost" onclick="OutreachModule.navigateWeek(-1)">← Predošlý</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.jumpWeek()">Dnes</button>
            <button class="adl-btn adl-btn-ghost" onclick="OutreachModule.navigateWeek(1)">Nasledujúci →</button>
            <span class="adl-toolbar-divider"></span>
            <button class="adl-btn adl-btn-primary" onclick="OutreachModule.openWorkingHoursModal()">⚙ Pracovné hodiny</button>
          </div>
        </div>

        <!-- week grid -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);">
            ${days.map((d, i) => {
              const today = d.toDateString() === new Date().toDateString();
              const dayBookings = (bookings || []).filter(b => new Date(b.scheduled_at).toDateString() === d.toDateString());
              const dayWh = (wh || []).find(w => w.day_of_week === d.getDay());
              return `
                <div style="border-right:${i < 6 ? '1px solid #EAE6DE' : '0'};padding:12px;min-height:220px;${today ? 'background:#FFF7ED;' : ''}">
                  <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${dayNames[i]}</div>
                  <div style="font-size:20px;font-weight:800;color:${today ? '#F97316' : '#14120E'};letter-spacing:-0.5px;">${d.getDate()}</div>
                  <div style="font-size:11px;color:#948B7C;margin-top:2px;">
                    ${dayWh ? `${this._minToHHMM(dayWh.start_minute)}–${this._minToHHMM(dayWh.end_minute)}` : 'voľno'}
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px;margin-top:10px;">
                    ${dayBookings.length === 0 ? `<div style="font-size:11px;color:#C9C0B0;">—</div>` : dayBookings.map(b => {
                      const t = new Date(b.scheduled_at);
                      const time = t.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
                      const cancelled = b.status === 'cancelled';
                      return `
                        <button onclick="OutreachModule.openBookingDetail('${b.id}')"
                          style="text-align:left;border:0;background:${cancelled ? '#F7F5F1' : '#FED7AA'};border-radius:8px;padding:6px 8px;cursor:pointer;${cancelled ? 'opacity:.5;text-decoration:line-through;' : ''}">
                          <div style="font-size:11px;font-weight:700;color:#92400E;">${time} · ${b.duration_minutes || 15}min</div>
                          <div style="font-size:12px;color:#14120E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(b.contact_name || b.contact_email || '—')}</div>
                          ${b.topic ? `<div style="font-size:10px;color:#6F6758;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(b.topic)}</div>` : ''}
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- list all bookings of week -->
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
          <div style="padding:14px 20px;border-bottom:1px solid #EAE6DE;font-size:14px;font-weight:700;">Všetky bookingy týždňa (${(bookings || []).length})</div>
          ${!bookings ? '<div style="padding:24px;text-align:center;color:#948B7C;">Načítavam…</div>'
            : bookings.length === 0 ? '<div style="padding:24px;text-align:center;color:#948B7C;">Žiadne.</div>'
            : bookings.map(b => this._renderBookingRow(b)).join('')}
        </div>
      </div>
    `;
  },

  _minToHHMM(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  },

  _renderBookingRow(b) {
    const t = new Date(b.scheduled_at);
    const when = t.toLocaleString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const statusMap = {
      scheduled: { label: 'Potvrdené', bg: '#DCFCE7', color: '#166534' },
      completed: { label: 'Hotovo',    bg: '#DBEAFE', color: '#1E3A8A' },
      cancelled: { label: 'Zrušené',   bg: '#FEE2E2', color: '#991B1B' },
      no_show:   { label: 'Nedostavil sa', bg: '#F7F5F1', color: '#6F6758' },
    };
    const s = statusMap[b.status] || statusMap.scheduled;
    return `
      <div style="padding:14px 20px;border-top:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;cursor:pointer;" onclick="OutreachModule.openBookingDetail('${b.id}')">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:14px;color:#14120E;">${this.esc(b.contact_name || b.contact_email || '—')}</strong>
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.color};">${s.label}</span>
          </div>
          <div style="font-size:12px;color:#6F6758;margin-top:2px;">${when} · ${b.duration_minutes || 15}min ${b.topic ? '· ' + this.esc(b.topic) : ''}</div>
          <div style="font-size:11px;color:#948B7C;margin-top:2px;">${this.esc(b.contact_email || '')}${b.contact_phone ? ' · ' + this.esc(b.contact_phone) : ''}</div>
        </div>
      </div>
    `;
  },

  async openBookingDetail(id) {
    const b = (this._bookings || []).find(x => x.id === id);
    if (!b) return;
    const t = new Date(b.scheduled_at).toLocaleString('sk-SK');
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:520px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">📞 Booking detail</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <div style="padding:20px 24px;">
          <div style="font-size:22px;font-weight:700;color:#F97316;margin-bottom:8px;">${t}</div>
          <div style="font-size:14px;color:#3A352B;margin-bottom:14px;">Trvanie: ${b.duration_minutes || 15} minút · Status: ${b.status}</div>
          <div style="background:#F7F5F1;border-radius:10px;padding:12px 14px;margin-bottom:10px;">
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;margin-bottom:2px;">Kontakt</div>
            <div style="font-size:14px;font-weight:600;">${this.esc(b.contact_name || '—')}</div>
            ${b.contact_email ? `<div style="font-size:13px;"><a href="mailto:${this.esc(b.contact_email)}" style="color:#F97316;">${this.esc(b.contact_email)}</a></div>` : ''}
            ${b.contact_phone ? `<div style="font-size:13px;"><a href="tel:${this.esc(b.contact_phone)}" style="color:#F97316;">${this.esc(b.contact_phone)}</a></div>` : ''}
          </div>
          ${b.topic ? `<div style="font-size:13px;color:#6F6758;margin-bottom:6px;"><strong>Téma:</strong> ${this.esc(b.topic)}</div>` : ''}
          ${b.notes ? `<div style="background:#FFF7ED;border-left:3px solid #F97316;padding:10px 12px;border-radius:6px;font-size:13px;white-space:pre-wrap;">${this.esc(b.notes)}</div>` : ''}
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            ${b.status !== 'completed' ? `<button class="adl-btn adl-btn-outline" onclick="OutreachModule.markBookingDone('${b.id}')">✓ Dokončené</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="adl-btn adl-btn-danger" onclick="OutreachModule.cancelBooking('${b.id}')">✕ Zrušiť</button>` : ''}
          </div>
        </div>
      </div>
    `;
    this._openModal(modal);
  },

  async markBookingDone(id) {
    await Database.client.from('call_bookings').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    this.closeModal();
    await this._loadBookings(); this.rerender();
  },

  async cancelBooking(id) {
    const ok = await Utils.confirm('Zrušiť tento booking?', { type: 'danger', confirmText: 'Zrušiť booking' });
    if (!ok) return;
    await Database.client.from('call_bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
    this.closeModal();
    await this._loadBookings(); this.rerender();
  },

  openWorkingHoursModal() {
    const days = ['Nedeľa','Pondelok','Utorok','Streda','Štvrtok','Piatok','Sobota'];
    const wh = this._workingHours || [];
    const byDay = Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, wh.find(w => w.day_of_week === d)]));

    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:560px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">⚙ Pracovné hodiny</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <form id="wh-form" onsubmit="event.preventDefault();OutreachModule.saveWorkingHours();" style="padding:20px 24px;display:flex;flex-direction:column;gap:10px;">
          ${[1,2,3,4,5,6,0].map(d => {
            const w = byDay[d];
            const active = !!w && w.is_active !== false;
            const startHH = w ? this._minToHHMM(w.start_minute) : '09:00';
            const endHH   = w ? this._minToHHMM(w.end_minute) : '17:00';
            return `
              <div style="display:grid;grid-template-columns:30px 100px 1fr 1fr 100px;gap:10px;align-items:center;">
                <input type="checkbox" data-day="${d}" name="active_${d}" ${active ? 'checked' : ''}>
                <span style="font-weight:600;color:#14120E;font-size:13px;">${days[d]}</span>
                <input type="time" name="start_${d}" value="${startHH}" style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
                <input type="time" name="end_${d}" value="${endHH}" style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
                <input type="number" min="5" max="120" step="5" name="slot_${d}" value="${w?.slot_duration_minutes || 15}" title="Dĺžka slotu (min)" style="padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
              </div>
            `;
          }).join('')}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">Uložiť</button>
          </div>
        </form>
      </div>
    `;
    this._openModal(modal);
  },

  async saveWorkingHours() {
    const form = document.getElementById('wh-form');
    if (!form) return;
    const rows = [];
    for (let d = 0; d <= 6; d++) {
      const active = form.querySelector(`[name=active_${d}]`)?.checked;
      if (!active) continue;
      const [sh, sm] = (form.querySelector(`[name=start_${d}]`)?.value || '09:00').split(':').map(Number);
      const [eh, em] = (form.querySelector(`[name=end_${d}]`)?.value || '17:00').split(':').map(Number);
      const slot = parseInt(form.querySelector(`[name=slot_${d}]`)?.value) || 15;
      rows.push({
        day_of_week: d,
        start_minute: sh * 60 + sm,
        end_minute: eh * 60 + em,
        slot_duration_minutes: slot,
        is_active: true,
      });
    }
    // Replace: delete + insert (jednoduchšie než upsert bez unique constraint)
    await Database.client.from('working_hours').delete().is('user_id', null);
    if (rows.length) {
      const { error } = await Database.client.from('working_hours').insert(rows);
      if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    }
    Utils.toast('Pracovné hodiny uložené', 'success');
    this.closeModal();
    await this._loadWorkingHours(); this.rerender();
  },

  // ========== SENDERS (rotation + warm-up) ==========

  senders: [],
  sendersLoaded: false,

  async openSenders() {
    this.currentView = 'senders';
    this.senders = [];
    this.sendersLoaded = false;
    this.rerender();
    try {
      const { data, error } = await Database.client
        .from('outreach_senders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.senders = data || [];
      this.sendersLoaded = true;
      this.rerender();
    } catch (e) {
      this.sendersLoaded = true;
      this.rerender();
      Utils.toast('Chyba: ' + e.message, 'danger');
    }
  },

  renderSenders() {
    const rows = this.senders;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;">Odosielatelia a warm-up</h2>
            <p style="font-size:13px;color:#6F6758;margin:0;">Scheduler striedá odosielateľov, dodržiava daily limit a throttle medzi mailmi — prevencia voči spamu.</p>
          </div>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.newSender()">+ Pridať odosielateľa</button>
        </div>

        ${!this.sendersLoaded ? `<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam…</div>`
          : rows.length === 0 ? `
            <div style="padding:40px;text-align:center;color:#6F6758;">
              <div style="font-size:14px;margin-bottom:8px;">Žiadni odosielatelia.</div>
              <div style="font-size:12px;">Bez odosielateľov scheduler použije default <code style="background:#F7F5F1;padding:1px 4px;border-radius:3px;">RESEND_FROM</code> env var.</div>
            </div>`
          : rows.map(s => this._renderSenderRow(s)).join('')}
      </div>
    `;
  },

  _renderSenderRow(s) {
    const limit = s.warmup_current || s.daily_limit || 40;
    const sentPct = Math.min(100, Math.round(((s.sent_today || 0) / limit) * 100));
    return `
      <div style="padding:16px 24px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <strong style="font-size:15px;color:#14120E;">${this.esc(s.name)}</strong>
            <span style="font-size:12px;color:#6F6758;">&lt;${this.esc(s.email)}&gt;</span>
            ${!s.is_active ? `<span style="font-size:11px;background:#F7F5F1;color:#6F6758;padding:2px 8px;border-radius:999px;font-weight:600;">disabled</span>` : ''}
          </div>
          <div style="font-size:12px;color:#948B7C;margin-bottom:6px;">
            Dnes: <strong>${s.sent_today || 0}</strong> / ${limit} · celkovo ${s.total_sent || 0} · throttle ${s.throttle_seconds || 60}s
          </div>
          <div style="height:6px;background:#F7F5F1;border-radius:999px;overflow:hidden;max-width:280px;">
            <div style="height:100%;background:${sentPct >= 95 ? '#DC2626' : '#F97316'};width:${sentPct}%;transition:width .3s;"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editSender('${s.id}')">Upraviť</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.toggleSender('${s.id}')">${s.is_active ? '⏸ Vypnúť' : '▶ Zapnúť'}</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteSender('${s.id}')">✕</button>
        </div>
      </div>
    `;
  },

  newSender() { this._senderModal({ is_active: true, daily_limit: 40, warmup_current: 40, throttle_seconds: 60 }); },
  editSender(id) {
    const s = this.senders.find(x => x.id === id);
    if (s) this._senderModal(s);
  },

  _senderModal(s) {
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:520px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">${s.id ? 'Upraviť odosielateľa' : '+ Nový odosielateľ'}</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <form id="sender-form" onsubmit="event.preventDefault();OutreachModule.saveSender('${s.id || ''}');" style="padding:20px 24px;display:grid;gap:12px;">
          ${this._field('name', 'Meno *', 'text', true)}
          ${this._field('email', 'Email *', 'email', true)}
          ${this._field('reply_to', 'Reply-to (voliteľné)', 'email')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
              Denný limit (warm-up current)
              <input type="number" name="warmup_current" min="1" max="500" value="${s.warmup_current || 40}" required
                style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
              Throttle (s)
              <input type="number" name="throttle_seconds" min="10" max="3600" value="${s.throttle_seconds || 60}"
                style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
            </label>
          </div>
          ${this._field('notes', 'Poznámka', 'textarea')}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">Uložiť</button>
          </div>
        </form>
      </div>
    `;
    this._openModal(modal);
    const form = modal.querySelector('#sender-form');
    if (form && s.id) {
      ['name','email','reply_to','notes'].forEach(k => {
        const el = form.querySelector(`[name=${k}]`);
        if (el && s[k] != null) el.value = s[k];
      });
    }
    setTimeout(() => modal.querySelector('[name=name]')?.focus(), 30);
  },

  async saveSender(id) {
    const form = document.getElementById('sender-form');
    if (!form) return;
    const fd = new FormData(form);
    const row = Object.fromEntries(fd.entries());
    if (!row.name || !row.email) return Utils.toast('Meno a email sú povinné', 'warning');
    const payload = {
      name: row.name.trim(),
      email: row.email.trim().toLowerCase(),
      reply_to: row.reply_to?.trim() || null,
      warmup_current: parseInt(row.warmup_current) || 40,
      daily_limit: parseInt(row.warmup_current) || 40,
      throttle_seconds: parseInt(row.throttle_seconds) || 60,
      notes: row.notes?.trim() || null,
    };
    let err;
    if (id) {
      ({ error: err } = await Database.client.from('outreach_senders').update(payload).eq('id', id));
    } else {
      payload.is_active = true;
      ({ error: err } = await Database.client.from('outreach_senders').insert(payload));
    }
    if (err) return Utils.toast('Chyba: ' + err.message, 'danger');
    this.closeModal();
    Utils.toast('Uložené', 'success');
    await this.openSenders();
  },

  async toggleSender(id) {
    const s = this.senders.find(x => x.id === id);
    if (!s) return;
    await Database.client.from('outreach_senders').update({ is_active: !s.is_active }).eq('id', id);
    await this.openSenders();
  },

  async deleteSender(id) {
    const ok = await Utils.confirm('Zmazať odosielateľa?', { type: 'danger', confirmText: 'Zmazať' });
    if (!ok) return;
    await Database.client.from('outreach_senders').delete().eq('id', id);
    await this.openSenders();
  },

  // ========== CAMPAIGNS (sekvencie) ==========

  async openCampaigns() {
    this.currentView = 'campaigns';
    this.editingCampaign = null;
    this.viewingCampaignId = null;
    this.campaigns = [];
    this.campaignsLoaded = false;
    this.rerender();
    await this.ensureOutreachTemplatesLoaded();
    try {
      const { data, error } = await Database.client
        .from('outreach_campaigns')
        .select('id, name, description, status, segment_filter, stop_on_reply, stop_on_audit_request, sender_name, sender_email, created_at, updated_at, outreach_campaign_steps(id, step_order, delay_days, template_slug, template_variants, send_if_stage_in, note), enrollments:outreach_campaign_enrollments(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.campaigns = (data || []).map(c => ({
        ...c,
        steps: (c.outreach_campaign_steps || []).sort((a, b) => a.step_order - b.step_order),
        enrollment_count: c.enrollments?.[0]?.count ?? 0,
      }));
      this.campaignsLoaded = true;
      this.rerender();
    } catch (e) {
      this.campaignsLoaded = true;
      this.rerender();
      Utils.toast('Chyba pri načítaní kampaní: ' + e.message, 'danger');
    }
  },

  renderCampaigns() {
    if (this.editingCampaign) return this._renderCampaignEditor();
    if (this.viewingCampaignId) return this._renderCampaignDetail();
    const rows = this.campaigns;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 4px;color:#14120E;">Kampane / sekvencie</h2>
            <p style="font-size:13px;color:#6F6758;margin:0;">Viac-krokové cold outreach sekvencie. Scheduler odošle ďalší krok keď nastane <code style="background:#F7F5F1;padding:1px 4px;border-radius:3px;">next_send_at</code>.</p>
          </div>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.newCampaign()">+ Nová kampaň</button>
        </div>
        ${!this.campaignsLoaded ? `<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam…</div>`
          : rows.length === 0 ? `<div style="padding:40px;text-align:center;color:#6F6758;">Žiadne kampane. Vytvor prvú tlačidlom „+ Nová kampaň".</div>`
          : rows.map(c => this._renderCampaignRow(c)).join('')}
      </div>
    `;
  },

  _renderCampaignRow(c) {
    const statusMap = {
      draft:      { label: 'Návrh',    bg: '#F7F5F1', color: '#6F6758' },
      active:     { label: 'Aktívna',  bg: '#DCFCE7', color: '#166534' },
      paused:     { label: 'Pauza',    bg: '#FEF3C7', color: '#92400E' },
      completed:  { label: 'Dokončená',bg: '#DBEAFE', color: '#1E3A8A' },
      archived:   { label: 'Archív',   bg: '#F7F5F1', color: '#948B7C' },
    };
    const s = statusMap[c.status] || statusMap.draft;
    return `
      <div style="padding:16px 24px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <strong style="font-size:15px;color:#14120E;">${this.esc(c.name)}</strong>
            <span style="font-size:11px;background:${s.bg};color:${s.color};padding:2px 8px;border-radius:999px;font-weight:600;">${s.label}</span>
          </div>
          <div style="font-size:13px;color:#6F6758;margin-bottom:4px;">${this.esc(c.description || '')}</div>
          <div style="font-size:12px;color:#948B7C;">${(c.steps || []).length} krokov · ${c.enrollment_count || 0} prospektov enrolled</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.viewCampaign('${c.id}')">📊 Detail</button>
          ${c.status === 'active' ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.setCampaignStatus('${c.id}','paused')">⏸ Pauza</button>` : ''}
          ${c.status === 'paused' || c.status === 'draft' ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.setCampaignStatus('${c.id}','active')">▶ Aktivovať</button>` : ''}
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.editCampaign('${c.id}')">Upraviť</button>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteCampaign('${c.id}')" title="Zmazať">✕</button>
        </div>
      </div>
    `;
  },

  editCampaign(id) {
    const c = this.campaigns.find(x => x.id === id);
    if (!c) return;
    this.editingCampaign = JSON.parse(JSON.stringify(c));
    this.rerender();
  },

  async viewCampaign(id) {
    this.viewingCampaignId = id;
    this._campaignDetailData = null;
    this.rerender();
    try {
      const { data: enrollments } = await Database.client
        .from('outreach_campaign_enrollments')
        .select('id, prospect_id, current_step, status, next_send_at, last_sent_at, completed_at, stop_reason, enrolled_at, prospect:prospects(company_name, domain, email, contact_person, outreach_stage, outreach_email_opened_at, outreach_email_open_count, audit_requested_at)')
        .eq('campaign_id', id)
        .order('enrolled_at', { ascending: false })
        .limit(500);
      this._campaignDetailData = enrollments || [];
      this.rerender();
    } catch (e) {
      this._campaignDetailData = [];
      Utils.toast('Chyba: ' + e.message, 'danger');
      this.rerender();
    }
  },

  backToCampaigns() {
    this.viewingCampaignId = null;
    this._campaignDetailData = null;
    this.rerender();
  },

  _renderCampaignDetail() {
    const c = this.campaigns.find(x => x.id === this.viewingCampaignId);
    if (!c) return `<div style="padding:40px;text-align:center;color:#6F6758;">Kampaň neexistuje. <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.backToCampaigns()">← Späť</button></div>`;
    const enrollments = this._campaignDetailData;
    const steps = c.steps || [];

    // Stats per-step
    const stepStats = steps.map(s => {
      const reached = (enrollments || []).filter(e => e.current_step >= s.step_order).length;
      return { ...s, reached };
    });
    const total = enrollments?.length || 0;
    const active = (enrollments || []).filter(e => e.status === 'active').length;
    const completed = (enrollments || []).filter(e => e.status === 'completed').length;
    const stopped = (enrollments || []).filter(e => e.status === 'stopped' || e.status === 'bounced').length;

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Kampaň</div>
            <h2 style="margin:2px 0 4px;font-size:20px;font-weight:700;">${this.esc(c.name)}</h2>
            <div style="font-size:13px;color:#6F6758;">${this.esc(c.description || '')}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.backToCampaigns()">← Zoznam</button>
            <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editCampaign('${c.id}')">Upraviť</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
          ${this._stat('✉ Enrolled', total, '#3B82F6', '#DBEAFE')}
          ${this._stat('▶ Aktívni', active, '#F97316', '#FFEDD5')}
          ${this._stat('✓ Dokončení', completed, '#16A34A', '#DCFCE7')}
          ${this._stat('⏸ Stopped', stopped, '#6F6758', '#F7F5F1')}
        </div>

        <h3 style="font-size:14px;font-weight:700;color:#14120E;margin:8px 0 10px;">Priebeh krokov</h3>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          ${stepStats.length === 0 ? '<div style="color:#948B7C;">Žiadne kroky — uprav kampaň.</div>' : stepStats.map(s => {
            const pct = total ? Math.round((s.reached / total) * 100) : 0;
            return `
              <div style="background:#FAFAF7;border:1px solid #EAE6DE;border-radius:10px;padding:10px 14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
                  <div style="font-size:13px;color:#14120E;"><strong>Krok #${s.step_order}</strong> · ${this.esc(s.template_slug)} · +${s.delay_days} dní</div>
                  <div style="font-size:12px;color:#6F6758;"><strong>${s.reached}</strong> / ${total} (${pct}%)</div>
                </div>
                <div style="height:6px;background:#EAE6DE;border-radius:999px;overflow:hidden;">
                  <div style="height:100%;background:#F97316;width:${pct}%;transition:width .3s;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid #EAE6DE;font-size:14px;font-weight:700;">Enrolled prospekti (${total})</div>
        ${enrollments == null ? `<div style="padding:40px;text-align:center;color:#948B7C;">Načítavam…</div>`
          : total === 0 ? `<div style="padding:40px;text-align:center;color:#948B7C;">Žiadni enrollovaní. <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.backToCampaigns()">← Späť</button> → označ prospektov a spusti enroll z editora.</div>`
          : `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead style="background:#F7F5F1;">
                <tr>
                  <th style="padding:10px 14px;text-align:left;font-weight:600;color:#6F6758;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Firma</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:600;color:#6F6758;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Krok</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:600;color:#6F6758;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:600;color:#6F6758;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Ďalšie odoslanie</th>
                  <th style="padding:10px 14px;text-align:left;font-weight:600;color:#6F6758;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Akcie</th>
                </tr>
              </thead>
              <tbody>
                ${enrollments.map(e => this._renderEnrollmentRow(e, steps.length)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  _renderEnrollmentRow(e, totalSteps) {
    const company = e.prospect?.company_name || e.prospect?.domain || '—';
    const next = e.next_send_at ? new Date(e.next_send_at) : null;
    const nextStr = next ? next.toLocaleString('sk-SK') : '—';
    const statusMap = {
      active:    { label: 'Aktívny',   bg: '#FFEDD5', color: '#92400E' },
      paused:    { label: 'Pauza',     bg: '#FEF3C7', color: '#92400E' },
      completed: { label: 'Dokončený', bg: '#DCFCE7', color: '#166534' },
      stopped:   { label: 'Stopped',   bg: '#F7F5F1', color: '#6F6758' },
      bounced:   { label: 'Bounced',   bg: '#FEE2E2', color: '#991B1B' },
    };
    const s = statusMap[e.status] || statusMap.active;
    return `
      <tr style="border-top:1px solid #EAE6DE;">
        <td style="padding:10px 14px;cursor:pointer;" onclick="OutreachModule.openProspectDetail('${e.prospect_id}')">
          <div style="font-weight:600;color:#14120E;">${this.esc(company)}</div>
          <div style="font-size:11px;color:#948B7C;">${this.esc(e.prospect?.email || '')}</div>
        </td>
        <td style="padding:10px 14px;"><strong>${e.current_step}</strong><span style="color:#948B7C;"> / ${totalSteps}</span></td>
        <td style="padding:10px 14px;">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.color};">${s.label}</span>
          ${e.stop_reason ? `<div style="font-size:10px;color:#948B7C;margin-top:2px;">${this.esc(e.stop_reason)}</div>` : ''}
        </td>
        <td style="padding:10px 14px;color:#6F6758;font-size:12px;">${e.status === 'active' ? nextStr : '—'}</td>
        <td style="padding:10px 14px;">
          ${e.status === 'active' ? `<button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.stopEnrollment('${e.id}')" title="Zastaviť v kampani">⏸</button>` : ''}
          ${e.status === 'stopped' || e.status === 'paused' ? `<button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.resumeEnrollment('${e.id}')" title="Obnoviť">▶</button>` : ''}
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.removeEnrollment('${e.id}')" title="Vyradiť z kampane">✕</button>
        </td>
      </tr>
    `;
  },

  async stopEnrollment(id) {
    const { error } = await Database.client.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: 'manual',
    }).eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    await this.viewCampaign(this.viewingCampaignId);
  },

  async resumeEnrollment(id) {
    const { error } = await Database.client.from('outreach_campaign_enrollments').update({
      status: 'active', stop_reason: null, next_send_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    await this.viewCampaign(this.viewingCampaignId);
  },

  async removeEnrollment(id) {
    const ok = await Utils.confirm('Vyradiť z kampane?', { type: 'danger', confirmText: 'Vyradiť' });
    if (!ok) return;
    const { error } = await Database.client.from('outreach_campaign_enrollments').delete().eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast('Vyradené', 'success');
    await this.viewCampaign(this.viewingCampaignId);
  },

  cancelEditCampaign() {
    this.editingCampaign = null;
    this.rerender();
  },

  async newCampaign() {
    const name = await Utils.prompt({
      title: '+ Nová kampaň',
      placeholder: 'napr. Cold outreach zubári BA apríl',
      confirmText: 'Vytvoriť',
    });
    if (!name) return;
    const { data, error } = await Database.client.from('outreach_campaigns').insert({
      name, status: 'draft', stop_on_reply: true, stop_on_audit_request: true,
    }).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.campaigns.unshift({ ...data, steps: [], enrollment_count: 0 });
    this.editingCampaign = { ...data, steps: [], enrollment_count: 0 };
    this.rerender();
    Utils.toast('Kampaň vytvorená — pridaj kroky.', 'success');
  },

  _renderCampaignEditor() {
    const c = this.editingCampaign;
    const tplOptions = (this.templates || []).filter(t => t.category === 'outreach').map(t =>
      `<option value="${t.slug}">${this.esc(t.name)} (${this.esc(t.slug)})</option>`
    ).join('');
    return `
      <div style="display:grid;grid-template-columns:1fr;gap:16px;">
        <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:20px 24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <div>
              <h2 style="font-size:18px;font-weight:700;margin:0 0 2px;">${this.esc(c.name)}</h2>
              <div style="font-size:12px;color:#948B7C;">${this.esc(c.description || '')}</div>
            </div>
            <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.cancelEditCampaign()">← Späť</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;">
              Názov
              <input id="cmp-name" type="text" value="${this.esc(c.name || '')}"
                style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;">
              Popis
              <input id="cmp-desc" type="text" value="${this.esc(c.description || '')}"
                style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;">
            </label>
          </div>

          <div style="display:flex;gap:20px;margin-bottom:18px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#3A352B;">
              <input id="cmp-stop-reply" type="checkbox" ${c.stop_on_reply ? 'checked' : ''}> Zastaviť pri odpovedi
            </label>
            <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#3A352B;">
              <input id="cmp-stop-audit" type="checkbox" ${c.stop_on_audit_request ? 'checked' : ''}> Zastaviť pri audit request
            </label>
          </div>

          <h3 style="font-size:14px;font-weight:700;color:#14120E;margin:16px 0 8px;">Kroky (${(c.steps || []).length})</h3>
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">
            ${(c.steps || []).map((s, i) => this._renderStepCard(s, i, tplOptions)).join('')}
          </div>
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule._addStep()">+ Pridať krok</button>

          <div style="border-top:1px solid #EAE6DE;margin-top:20px;padding-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="font-size:13px;color:#6F6758;">${c.enrollment_count || 0} prospektov enrolled</div>
            <div style="display:flex;gap:8px;">
              <button class="adl-btn adl-btn-outline" onclick="OutreachModule._enrollFromCampaign()">+ Enroll prospektov</button>
              <button class="adl-btn adl-btn-primary" onclick="OutreachModule.saveCampaign()">Uložiť</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _addStep() {
    const c = this.editingCampaign;
    if (!c) return;
    const next = (c.steps?.length || 0) + 1;
    const firstTpl = (this.templates || []).find(t => t.category === 'outreach');
    c.steps = [...(c.steps || []), {
      step_order: next,
      delay_days: next === 1 ? 0 : 3,
      template_slug: firstTpl?.slug || 'cold_outreach_audit',
      template_variants: null,
      send_if_stage_in: null,
    }];
    this.rerender();
  },

  _renderStepCard(s, i, tplOptions) {
    const variants = Array.isArray(s.template_variants) && s.template_variants.length ? s.template_variants : null;
    return `
      <div style="background:#FAFAF7;border:1px solid #EAE6DE;border-radius:10px;padding:12px 14px;">
        <div style="display:grid;grid-template-columns:60px 140px 1fr auto;gap:12px;align-items:center;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;">Krok</div>
            <div style="font-size:20px;font-weight:800;color:#F97316;">#${s.step_order}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;margin-bottom:2px;">Odstup</div>
            <input type="number" step="0.5" min="0" value="${s.delay_days || 0}" onchange="OutreachModule._updateStepDelay(${i}, this.value)"
              style="width:100%;padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;">
            <div style="font-size:11px;color:#948B7C;margin-top:2px;">dní po predošlom</div>
          </div>
          <div>
            ${!variants ? `
              <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;margin-bottom:2px;display:flex;justify-content:space-between;">
                <span>Šablóna</span>
                <button type="button" onclick="OutreachModule._enableVariants(${i})" style="background:none;border:0;color:#F97316;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:0.3px;">+ A/B testovať</button>
              </div>
              <select onchange="OutreachModule._updateStepTemplate(${i}, this.value)"
                style="width:100%;padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;background:#fff;">
                ${tplOptions.replace(`value="${s.template_slug}"`, `value="${s.template_slug}" selected`)}
              </select>
            ` : `
              <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;margin-bottom:6px;display:flex;justify-content:space-between;">
                <span>A/B Varianty (${variants.length})</span>
                <button type="button" onclick="OutreachModule._disableVariants(${i})" style="background:none;border:0;color:#6F6758;cursor:pointer;font-size:11px;font-weight:700;">← jeden</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${variants.map((v, vi) => `
                  <div style="display:grid;grid-template-columns:1fr 80px auto;gap:6px;align-items:center;">
                    <select onchange="OutreachModule._updateVariantSlug(${i}, ${vi}, this.value)"
                      style="padding:7px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:12px;background:#fff;">
                      ${tplOptions.replace(`value="${v.slug}"`, `value="${v.slug}" selected`)}
                    </select>
                    <input type="number" min="1" max="100" value="${v.weight || 50}" onchange="OutreachModule._updateVariantWeight(${i}, ${vi}, this.value)"
                      title="Váha — % rozdelenie"
                      style="padding:7px 8px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:12px;text-align:right;">
                    <button type="button" class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;padding:0 8px;" onclick="OutreachModule._removeVariant(${i}, ${vi})" ${variants.length === 1 ? 'disabled' : ''}>✕</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" onclick="OutreachModule._addVariant(${i})" style="background:none;border:0;color:#F97316;cursor:pointer;font-size:11px;font-weight:700;margin-top:6px;">+ Pridať variant</button>
            `}
          </div>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule._removeStep(${i})">✕</button>
        </div>
      </div>
    `;
  },

  _enableVariants(idx) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]) return;
    const cur = c.steps[idx].template_slug || 'cold_outreach_audit';
    // začnú 2 varianty: current 50%, druhá z outreach 50%
    const alt = (this.templates || []).filter(t => t.category === 'outreach' && t.slug !== cur)[0];
    c.steps[idx].template_variants = [
      { slug: cur, weight: 50 },
      { slug: alt?.slug || cur, weight: 50 },
    ];
    this.rerender();
  },

  _disableVariants(idx) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]) return;
    const first = c.steps[idx].template_variants?.[0]?.slug;
    c.steps[idx].template_slug = first || c.steps[idx].template_slug;
    c.steps[idx].template_variants = null;
    this.rerender();
  },

  _addVariant(idx) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]) return;
    const existing = new Set((c.steps[idx].template_variants || []).map(v => v.slug));
    const alt = (this.templates || []).filter(t => t.category === 'outreach' && !existing.has(t.slug))[0];
    if (!alt) return Utils.toast('Všetky outreach šablóny sú už vo variantoch.', 'warning');
    c.steps[idx].template_variants = [...(c.steps[idx].template_variants || []), { slug: alt.slug, weight: 25 }];
    this.rerender();
  },

  _removeVariant(idx, vi) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]?.template_variants) return;
    c.steps[idx].template_variants.splice(vi, 1);
    this.rerender();
  },

  _updateVariantSlug(idx, vi, value) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]?.template_variants?.[vi]) return;
    c.steps[idx].template_variants[vi].slug = value;
  },

  _updateVariantWeight(idx, vi, value) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]?.template_variants?.[vi]) return;
    c.steps[idx].template_variants[vi].weight = parseInt(value) || 1;
  },

  _removeStep(idx) {
    const c = this.editingCampaign;
    if (!c) return;
    c.steps.splice(idx, 1);
    c.steps.forEach((s, i) => s.step_order = i + 1);
    this.rerender();
  },

  _updateStepDelay(idx, value) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]) return;
    c.steps[idx].delay_days = parseFloat(value) || 0;
  },

  _updateStepTemplate(idx, value) {
    const c = this.editingCampaign;
    if (!c?.steps?.[idx]) return;
    c.steps[idx].template_slug = value;
  },

  async saveCampaign() {
    const c = this.editingCampaign;
    if (!c) return;
    const name = document.getElementById('cmp-name')?.value?.trim() || c.name;
    const desc = document.getElementById('cmp-desc')?.value?.trim() || null;
    const stopReply = document.getElementById('cmp-stop-reply')?.checked ?? c.stop_on_reply;
    const stopAudit = document.getElementById('cmp-stop-audit')?.checked ?? c.stop_on_audit_request;
    if (!name) return Utils.toast('Názov je povinný', 'warning');

    try {
      // 1. Update campaign
      const { error: upErr } = await Database.client.from('outreach_campaigns').update({
        name, description: desc, stop_on_reply: stopReply, stop_on_audit_request: stopAudit,
      }).eq('id', c.id);
      if (upErr) throw upErr;

      // 2. Replace steps (delete all + insert new)
      await Database.client.from('outreach_campaign_steps').delete().eq('campaign_id', c.id);
      if (c.steps?.length) {
        const { error: stErr } = await Database.client.from('outreach_campaign_steps').insert(
          c.steps.map(s => {
            const hasVariants = Array.isArray(s.template_variants) && s.template_variants.length > 0;
            return {
              campaign_id: c.id,
              step_order: s.step_order,
              delay_days: s.delay_days || 0,
              // pre backward compat uložíme prvý slug do template_slug; variants do JSONB
              template_slug: hasVariants ? s.template_variants[0].slug : s.template_slug,
              template_variants: hasVariants ? s.template_variants : null,
              send_if_stage_in: s.send_if_stage_in || null,
              note: s.note || null,
            };
          })
        );
        if (stErr) throw stErr;
      }
      Utils.toast('Kampaň uložená', 'success');
      this.editingCampaign = null;
      await this.openCampaigns();
    } catch (e) {
      Utils.toast('Chyba: ' + e.message, 'danger');
    }
  },

  async setCampaignStatus(id, status) {
    const patch = { status };
    if (status === 'active') patch.started_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    const { error } = await Database.client.from('outreach_campaigns').update(patch).eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    const c = this.campaigns.find(x => x.id === id);
    if (c) c.status = status;
    this.rerender();
    Utils.toast(`Status: ${status}`, 'success');
  },

  async deleteCampaign(id) {
    const c = this.campaigns.find(x => x.id === id);
    const ok = await Utils.confirm(`Zmazať kampaň „${c?.name}"? Zmažú sa aj všetky kroky a enrollments.`, {
      type: 'danger', confirmText: 'Zmazať', cancelText: 'Zrušiť'
    });
    if (!ok) return;
    const { error } = await Database.client.from('outreach_campaigns').delete().eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.campaigns = this.campaigns.filter(x => x.id !== id);
    this.rerender();
    Utils.toast('Zmazané', 'success');
  },

  async _enrollFromCampaign() {
    const c = this.editingCampaign;
    if (!c) return;
    if (!c.steps?.length) return Utils.toast('Najprv pridaj aspoň 1 krok a ulož.', 'warning');

    const ids = Array.from(this.selectedIds);
    if (ids.length === 0) {
      return Utils.toast('Najprv označ prospektov v zozname (späť na Outreach a checkboxami).', 'warning');
    }
    const ok = await Utils.confirm(`Enroll ${ids.length} prospektov do kampane „${c.name}"? Prvý krok sa odošle pri najbližšom scheduler runu.`, {
      type: 'warning', confirmText: 'Enroll', cancelText: 'Zrušiť'
    });
    if (!ok) return;

    const firstStep = (c.steps || []).sort((a, b) => a.step_order - b.step_order)[0];
    const delayMs = (firstStep.delay_days || 0) * 24 * 60 * 60 * 1000;
    const nextSend = new Date(Date.now() + delayMs).toISOString();

    const rows = ids.map(pid => ({
      campaign_id: c.id,
      prospect_id: pid,
      current_step: 0,
      next_send_at: nextSend,
      status: 'active',
    }));
    const { error } = await Database.client.from('outreach_campaign_enrollments').upsert(rows, {
      onConflict: 'campaign_id,prospect_id',
    });
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast(`Enrolled ${ids.length} prospektov`, 'success');
    this.selectedIds.clear();
    await this.openCampaigns();
  },

  // ========== PROSPECT DETAIL MODAL ==========

  detailTab: 'overview',  // overview | activity | audit
  _detailProspectId: null,

  async openProspectDetail(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p) return;
    this._detailProspectId = prospectId;
    this.detailTab = 'overview';
    this._detailEvents = null;
    this._detailTasksList = null;
    this._detailNotesList = null;
    if (!this._teamMembers) await this._loadTeamMembers();
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = this._renderDetailModal(p);
    this._openModalWide(modal);
    this._loadDetailEvents(prospectId);
  },

  async _loadTeamMembers() {
    try {
      const { data } = await Database.client
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('role', ['owner','admin','manager','employee']);
      this._teamMembers = data || [];
    } catch { this._teamMembers = []; }
  },

  async _loadDetailEvents(prospectId) {
    try {
      const { data } = await Database.client
        .from('prospect_events')
        .select('event_type, occurred_at, is_bot, bot_vendor, user_agent, geo_country, geo_city, geo_region, geo_isp, link_url')
        .eq('prospect_id', prospectId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      this._detailEvents = data || [];
      this._refreshDetailBody();
    } catch (e) {
      this._detailEvents = [];
      this._refreshDetailBody();
    }
  },

  setDetailTab(tab) {
    this.detailTab = tab;
    this._refreshDetailHeader();
    this._refreshDetailBody();
  },

  _refreshDetailHeader() {
    const el = document.getElementById('prospect-detail-tabs');
    if (!el) return;
    el.innerHTML = this._detailTabs();
  },

  _refreshDetailBody() {
    const el = document.getElementById('prospect-detail-body');
    const p = this.prospects.find(x => x.id === this._detailProspectId);
    if (!el || !p) return;
    el.innerHTML = this._detailBody(p);
  },

  _renderDetailModal(p) {
    const company = p.company_name || p.domain || '—';
    const initial = (company.trim().charAt(0) || '?').toUpperCase();
    const stage = this.stageBadge(p);
    const isConverted = p.outreach_stage === 'converted';
    const canSend = !p.outreach_email_sent_at && p.email && !isConverted;

    return `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:780px;width:min(92vw,780px);">
        <div class="adl-modal-head" style="align-items:center;">
          <div style="display:flex;align-items:center;gap:14px;min-width:0;">
            <div style="flex-shrink:0;width:48px;height:48px;border-radius:12px;background:#FFF7ED;color:#F97316;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">${this.esc(initial)}</div>
            <div style="min-width:0;">
              <h3 style="margin:0;font-size:18px;font-weight:700;color:#14120E;">${this.esc(company)}</h3>
              <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">
                ${p.domain ? `<a href="https://${this.esc(p.domain)}" target="_blank" onclick="event.stopPropagation()" style="font-size:13px;color:#6F6758;text-decoration:none;">${this.esc(p.domain)} ↗</a>` : ''}
                ${stage}
              </div>
            </div>
          </div>
          <button class="adl-btn adl-btn-icon" onclick="OutreachModule.closeModal()" title="Zavrieť">✕</button>
        </div>

        <div id="prospect-detail-tabs" style="padding:0 24px;border-bottom:1px solid #EAE6DE;">
          ${this._detailTabs()}
        </div>

        <div id="prospect-detail-body" style="padding:20px 24px;max-height:60vh;overflow-y:auto;">
          ${this._detailBody(p)}
        </div>

        <div style="padding:16px 24px;border-top:1px solid #EAE6DE;background:#FAFAF7;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-danger" onclick="OutreachModule.deleteProspectFromDetail()">✕ Zmazať</button>
          <div class="adl-toolbar">
            ${!isConverted ? `<button class="adl-btn adl-btn-outline" onclick="OutreachModule.promoteFromDetail()">→ Lead</button>` : ''}
            ${isConverted && p.converted_to_lead_id ? `<a class="adl-btn adl-btn-soft" href="#/leads?id=${p.converted_to_lead_id}">Otvoriť lead ↗</a>` : ''}
            ${canSend ? `<button class="adl-btn adl-btn-primary" onclick="OutreachModule.composeFromDetail()">✉ Poslať email</button>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  _detailTabs() {
    const tabs = [
      { key: 'overview', label: 'Prehľad' },
      { key: 'messages', label: 'Správy' },
      { key: 'activity', label: 'Aktivita' },
      { key: 'notes',    label: 'Poznámky' },
      { key: 'tasks',    label: 'Úlohy' },
      { key: 'audit',    label: 'Audit' },
    ];
    return `<div style="display:flex;gap:4px;">
      ${tabs.map(t => `
        <button onclick="OutreachModule.setDetailTab('${t.key}')"
          style="padding:12px 16px;border:0;background:transparent;cursor:pointer;font-size:14px;font-weight:600;color:${this.detailTab === t.key ? '#14120E' : '#948B7C'};border-bottom:2px solid ${this.detailTab === t.key ? '#F97316' : 'transparent'};transition:color .15s;">
          ${t.label}
        </button>
      `).join('')}
    </div>`;
  },

  _detailBody(p) {
    if (this.detailTab === 'activity') return this._detailActivity(p);
    if (this.detailTab === 'audit')    return this._detailAudit(p);
    if (this.detailTab === 'tasks')    return this._detailTasks(p);
    if (this.detailTab === 'messages') return this._detailMessages(p);
    if (this.detailTab === 'notes')    return this._detailNotes(p);
    return this._detailOverview(p);
  },

  _detailNotes(p) {
    const notes = this._detailNotesList;
    if (notes == null) {
      this._loadDetailNotes(p.id);
      return `<div style="color:#948B7C;padding:12px;">Načítavam poznámky…</div>`;
    }
    return `
      <form onsubmit="event.preventDefault();OutreachModule.addNote('${p.id}');" style="background:#FAFAF7;border:1px solid #EAE6DE;border-radius:12px;padding:12px;margin-bottom:14px;">
        <textarea id="note-input" rows="3" placeholder="Napíš internú poznámku… (Ctrl+Enter odoslať)"
          onkeydown="if(event.ctrlKey && event.key==='Enter') this.form.requestSubmit();"
          style="width:100%;padding:10px 12px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;background:#fff;"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button type="submit" class="adl-btn adl-btn-sm adl-btn-primary">+ Pridať poznámku</button>
        </div>
      </form>
      ${notes.length === 0 ? `<div style="color:#948B7C;padding:24px;text-align:center;background:#F7F5F1;border-radius:10px;">Zatiaľ žiadne poznámky.</div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${notes.map(n => this._renderNote(n)).join('')}
        </div>
      `}
    `;
  },

  _renderNote(n) {
    const time = new Date(n.created_at).toLocaleString('sk-SK');
    const author = n.author?.full_name || n.author?.email || 'Autor';
    const initial = (author[0] || '?').toUpperCase();
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:10px;padding:12px 14px;${n.is_pinned ? 'border-color:#F97316;background:#FFF7ED;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <div style="flex-shrink:0;width:28px;height:28px;border-radius:7px;background:#F97316;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${this.esc(initial)}</div>
            <div style="font-size:12px;color:#3A352B;font-weight:600;">${this.esc(author)}${n.is_pinned ? ' · 📌' : ''}</div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <span style="font-size:11px;color:#948B7C;">${time}</span>
            <button class="adl-btn adl-btn-sm adl-btn-ghost" style="padding:0 6px;" onclick="OutreachModule.togglePinNote('${n.id}')" title="${n.is_pinned ? 'Odpnúť' : 'Pripnúť'}">${n.is_pinned ? '📌' : '📍'}</button>
            <button class="adl-btn adl-btn-sm adl-btn-ghost" style="padding:0 6px;color:#DC2626;" onclick="OutreachModule.deleteNote('${n.id}')" title="Zmazať">✕</button>
          </div>
        </div>
        <div style="font-size:14px;color:#14120E;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${this.esc(n.body)}</div>
      </div>
    `;
  },

  async _loadDetailNotes(prospectId) {
    this._detailNotesList = null;
    try {
      const { data, error } = await Database.client
        .from('prospect_notes')
        .select('id, body, is_pinned, created_at, updated_at, author:user_profiles!author_id(full_name, email)')
        .eq('prospect_id', prospectId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      this._detailNotesList = data || [];
    } catch (e) {
      console.warn('loadDetailNotes error:', e);
      this._detailNotesList = [];
    }
    this._refreshDetailBody();
  },

  async addNote(prospectId) {
    const ta = document.getElementById('note-input');
    if (!ta) return;
    const body = ta.value.trim();
    if (!body) return;
    const author_id = window.Auth?.user?.id || null;
    const { error } = await Database.client.from('prospect_notes').insert({
      prospect_id: prospectId, body, author_id,
    });
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    ta.value = '';
    await this._loadDetailNotes(prospectId);
    Utils.toast('Poznámka pridaná', 'success');
  },

  async togglePinNote(id) {
    const n = (this._detailNotesList || []).find(x => x.id === id);
    if (!n) return;
    await Database.client.from('prospect_notes').update({ is_pinned: !n.is_pinned }).eq('id', id);
    await this._loadDetailNotes(this._detailProspectId);
  },

  async deleteNote(id) {
    const ok = await Utils.confirm('Zmazať poznámku?', { type: 'danger', confirmText: 'Zmazať' });
    if (!ok) return;
    await Database.client.from('prospect_notes').delete().eq('id', id);
    await this._loadDetailNotes(this._detailProspectId);
  },

  _detailMessages(p) {
    const events = this._detailEvents;
    if (events == null) return `<div style="color:#948B7C;padding:12px;">Načítavam správy…</div>`;
    const msgs = events.filter(e =>
      ['email_sent','email_replied','email_delivered','email_bounced','email_complained'].includes(e.event_type)
    ).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

    const canReply = !!p.email;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap;">
        <div style="font-size:13px;color:#6F6758;">${msgs.length} záznamov · emailové komunikácie</div>
        ${canReply ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.composeReplyToProspect('${p.id}')">✉ Napísať</button>` : ''}
      </div>
      ${msgs.length === 0 ? `<div style="color:#948B7C;padding:24px;text-align:center;background:#F7F5F1;border-radius:10px;">Zatiaľ žiadna emailová komunikácia.</div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${msgs.map(m => this._renderMessage(m, p)).join('')}
        </div>
      `}
    `;
  },

  _renderMessage(m, p) {
    const time = new Date(m.occurred_at).toLocaleString('sk-SK');
    const meta = m.meta || {};
    if (m.event_type === 'email_sent') {
      const subject = meta.subject || meta.variant_slug || '—';
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="flex-shrink:0;margin-top:2px;width:30px;height:30px;border-radius:8px;background:#DBEAFE;color:#1E3A8A;display:flex;align-items:center;justify-content:center;font-size:14px;">✉</div>
          <div style="flex:1;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px 12px 12px 0;padding:12px 14px;min-width:0;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#92400E;margin-bottom:4px;font-weight:600;">
              <span>→ ${this.esc(p.email || 'prospect')}</span>
              <span>${time}</span>
            </div>
            <div style="font-size:13px;color:#14120E;word-break:break-word;">
              ${meta.variant_slug ? `Šablóna: <code style="background:#fff;padding:1px 6px;border-radius:3px;">${this.esc(meta.variant_slug)}</code>` : 'Odoslaný email'}
              ${meta.step_order ? ` · Krok #${meta.step_order}` : ''}
              ${meta.sender_email ? ` · Odosielateľ: ${this.esc(meta.sender_email)}` : ''}
            </div>
          </div>
        </div>
      `;
    }
    if (m.event_type === 'email_replied') {
      const text = meta.text || meta.html?.replace(/<[^>]+>/g, '') || meta.body || '';
      const subject = meta.subject || 'Odpoveď';
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse;">
          <div style="flex-shrink:0;margin-top:2px;width:30px;height:30px;border-radius:8px;background:#DCFCE7;color:#166534;display:flex;align-items:center;justify-content:center;font-size:14px;">💬</div>
          <div style="flex:1;background:#fff;border:1px solid #BBF7D0;border-radius:12px 12px 0 12px;padding:12px 14px;min-width:0;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#166534;margin-bottom:4px;font-weight:600;">
              <span>← ${this.esc(p.email || 'prospect')}</span>
              <span>${time}</span>
            </div>
            <div style="font-weight:700;font-size:14px;color:#14120E;margin-bottom:6px;">${this.esc(subject)}</div>
            ${text ? `<div style="font-size:13px;color:#3A352B;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${this.esc(text.slice(0, 1500))}${text.length > 1500 ? '…' : ''}</div>` : '<div style="font-size:12px;color:#948B7C;font-style:italic;">(text odpovede nie je dostupný — pozri Resend dashboard)</div>'}
          </div>
        </div>
      `;
    }
    const meta2 = { email_delivered: { icon:'✓', color:'#16A34A', bg:'#DCFCE7', label:'Doručené' },
                    email_bounced:   { icon:'⚠', color:'#DC2626', bg:'#FEE2E2', label:'Bounced' },
                    email_complained:{ icon:'🚫', color:'#DC2626', bg:'#FEE2E2', label:'Spam' } };
    const t = meta2[m.event_type] || { icon:'•', color:'#6F6758', bg:'#F7F5F1', label:m.event_type };
    return `
      <div style="display:flex;gap:10px;align-items:center;padding:8px 14px;background:${t.bg};border-radius:10px;">
        <div style="color:${t.color};font-size:14px;">${t.icon}</div>
        <div style="flex:1;font-size:13px;color:${t.color};font-weight:600;">${t.label}</div>
        <div style="font-size:11px;color:#948B7C;">${time}</div>
      </div>
    `;
  },

  async assignProspect(prospectId, userId) {
    const { error } = await Database.client.from('prospects')
      .update({ assigned_to: userId || null })
      .eq('id', prospectId);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    // update local cache
    const p = this.prospects.find(x => x.id === prospectId);
    if (p) p.assigned_to = userId || null;
    Utils.toast(userId ? 'Priradené' : 'Priradenie zrušené', 'success');
  },

  composeReplyToProspect(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p?.email) return Utils.toast('Prospect nemá email', 'warning');
    // Jednoducho: otvor mailto so subjektom
    const subj = `Re: ${p.company_name || p.domain || 'Adlify'}`;
    window.location.href = `mailto:${p.email}?subject=${encodeURIComponent(subj)}`;
  },

  _detailTasks(p) {
    const tasks = this._detailTasksList;
    if (tasks == null) {
      this._loadDetailTasks(p.id);
      return `<div style="color:#948B7C;padding:12px;">Načítavam úlohy…</div>`;
    }
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;">
        <div style="font-size:13px;color:#6F6758;">${tasks.length} úloh · súvisiace s týmto prospectom</div>
        <div style="display:flex;gap:6px;">
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule._loadDetailTasks('${p.id}')">↻ Obnoviť</button>
          <button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.createTaskForProspect('${p.id}')">+ Pridať úlohu</button>
        </div>
      </div>
      ${tasks.length === 0 ? `<div style="color:#948B7C;padding:24px;text-align:center;background:#F7F5F1;border-radius:10px;">Zatiaľ žiadne úlohy.</div>` : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${tasks.map(t => this._renderTask(t)).join('')}
        </div>
      `}
    `;
  },

  _renderTask(t) {
    const statusMap = {
      pending:     { label: 'Čaká',     bg: '#FEF3C7', color: '#92400E' },
      in_progress: { label: 'Robím',    bg: '#DBEAFE', color: '#1E3A8A' },
      done:        { label: 'Hotovo',   bg: '#DCFCE7', color: '#166534' },
      completed:   { label: 'Hotovo',   bg: '#DCFCE7', color: '#166534' },
      cancelled:   { label: 'Zrušené',  bg: '#F7F5F1', color: '#6F6758' },
    };
    const s = statusMap[t.status] || { label: t.status || 'Čaká', bg: '#FEF3C7', color: '#92400E' };
    const prioMap = {
      high:   '🔴',
      urgent: '🔴',
      normal: '🟠',
      low:    '⚪',
    };
    const isDone = t.status === 'done' || t.status === 'completed';
    const due = t.due_date ? new Date(t.due_date) : null;
    const overdue = due && !isDone && due.getTime() < Date.now();
    return `
      <div style="background:#fff;border:1px solid ${overdue ? '#FCA5A5' : '#EAE6DE'};border-radius:10px;padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
              <span style="font-size:13px;">${prioMap[t.priority] || '🟠'}</span>
              <strong style="font-size:14px;color:${isDone ? '#948B7C' : '#14120E'};text-decoration:${isDone ? 'line-through' : 'none'};">${this.esc(t.title)}</strong>
              <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.color};">${s.label}</span>
              ${overdue ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#FEE2E2;color:#991B1B;">po termíne</span>` : ''}
            </div>
            ${t.description ? `<div style="font-size:12px;color:#6F6758;line-height:1.5;white-space:pre-wrap;margin-top:4px;">${this.esc(t.description)}</div>` : ''}
            <div style="font-size:11px;color:#948B7C;margin-top:4px;">
              ${due ? `Termín: ${due.toLocaleString('sk-SK')}` : ''}${due && t.category ? ' · ' : ''}${t.category ? this.esc(t.category) : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            ${!isDone ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.markTaskDone('${t.id}')">✓ Hotovo</button>` : ''}
            <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule.deleteTask('${t.id}')" title="Zmazať">✕</button>
          </div>
        </div>
      </div>
    `;
  },

  async _loadDetailTasks(prospectId) {
    this._detailTasksList = null;
    try {
      const { data, error } = await Database.client
        .from('tasks')
        .select('id, title, description, status, priority, due_date, category, created_at, completed_at')
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      this._detailTasksList = data || [];
    } catch (e) {
      console.warn('loadDetailTasks error:', e);
      this._detailTasksList = [];
    }
    this._refreshDetailBody();
  },

  async createTaskForProspect(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    const company = p?.company_name || p?.domain || 'prospect';
    const title = await Utils.prompt({
      title: `+ Úloha pre ${company}`,
      placeholder: 'napr. Zavolať v piatok 15:00',
      confirmText: 'Vytvoriť',
    });
    if (!title) return;
    const { error } = await Database.client.from('tasks').insert({
      title, status: 'pending', priority: 'normal', prospect_id: prospectId,
      category: 'outreach_manual',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    Utils.toast('Úloha vytvorená', 'success');
    this._loadDetailTasks(prospectId);
  },

  async markTaskDone(taskId) {
    const { error } = await Database.client.from('tasks').update({
      status: 'done',
      completed_at: new Date().toISOString(),
    }).eq('id', taskId);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    if (Array.isArray(this._detailTasksList)) {
      this._detailTasksList = this._detailTasksList.map(t => t.id === taskId
        ? { ...t, status: 'done', completed_at: new Date().toISOString() }
        : t);
    }
    this._refreshDetailBody();
    Utils.toast('Označené ako hotovo', 'success');
  },

  async deleteTask(taskId) {
    const ok = await Utils.confirm('Zmazať úlohu?', { type: 'danger', confirmText: 'Zmazať', cancelText: 'Zrušiť' });
    if (!ok) return;
    const { error } = await Database.client.from('tasks').delete().eq('id', taskId);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    if (Array.isArray(this._detailTasksList)) {
      this._detailTasksList = this._detailTasksList.filter(t => t.id !== taskId);
    }
    this._refreshDetailBody();
    Utils.toast('Zmazané', 'success');
  },

  _detailOverview(p) {
    const assignee = (this._teamMembers || []).find(u => u.id === p.assigned_to);
    const assigneeLabel = assignee ? (assignee.full_name || assignee.email) : 'Nepriradený';
    const assignSelect = `
      <select onchange="OutreachModule.assignProspect('${p.id}', this.value)"
        style="padding:6px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;background:#fff;">
        <option value="">— Nepriradený —</option>
        ${(this._teamMembers || []).map(u => `<option value="${u.id}" ${u.id === p.assigned_to ? 'selected' : ''}>${this.esc(u.full_name || u.email)} (${u.role})</option>`).join('')}
      </select>
    `;
    const fields = [
      ['Kontaktná osoba', p.contact_person],
      ['Email', p.email ? `<a href="mailto:${this.esc(p.email)}" style="color:#F97316;">${this.esc(p.email)}</a>` : null],
      ['Telefón', p.phone ? `<a href="tel:${this.esc(p.phone.replace(/\s/g,''))}" style="color:#F97316;">${this.esc(p.phone)}</a>` : null],
      ['LinkedIn', p.linkedin_url ? `<a href="${this.esc(p.linkedin_url)}" target="_blank" style="color:#0A66C2;">Otvoriť profil ↗</a>` : null],
      ['IČO', p.ico],
      ['Priradený', assignSelect],
      ['Odvetvie', p.industry],
      ['Mesto', p.city],
      ['Segment', p.segment],
      ['Skóre', `<strong>${p.score || 0}</strong>`],
      ['Zdroj', p.source],
      ['Pridané', p.created_at ? new Date(p.created_at).toLocaleString('sk-SK') : null],
    ].filter(([, v]) => v != null && v !== '');

    const hasLinkedIn = !!p.linkedin_url;
    const linkedInActions = hasLinkedIn ? `
      <div style="margin-top:20px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:32px;height:32px;border-radius:8px;background:#0A66C2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">in</div>
          <div>
            <div style="font-weight:600;font-size:13px;color:#1E3A8A;">LinkedIn outreach</div>
            <div style="font-size:11px;color:#6F6758;">AI vygeneruje personalizovanú DM správu</div>
          </div>
        </div>
        <button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.generateLinkedInDM('${p.id}')">✨ Vygenerovať LinkedIn DM</button>
      </div>
    ` : `
      <div style="margin-top:20px;background:#F7F5F1;border:1px dashed #D9D2C4;border-radius:12px;padding:14px 16px;text-align:center;">
        <div style="font-size:12px;color:#6F6758;margin-bottom:6px;">Bez LinkedIn URL nemôžeme generovať DM</div>
        <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.setLinkedInUrl('${p.id}')">+ Pridať LinkedIn URL</button>
      </div>
    `;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;">
        ${fields.map(([k, v]) => `
          <div>
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:3px;">${k}</div>
            <div style="font-size:14px;color:#14120E;word-break:break-word;">${typeof v === 'string' && v.startsWith('<') ? v : this.esc(v)}</div>
          </div>
        `).join('')}
      </div>
      ${p.notes ? `
        <div style="margin-top:20px;">
          <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Poznámka</div>
          <div style="font-size:14px;color:#3A352B;line-height:1.6;white-space:pre-wrap;background:#F7F5F1;padding:12px 14px;border-radius:10px;">${this.esc(p.notes)}</div>
        </div>
      ` : ''}
      ${linkedInActions}
    `;
  },

  async setLinkedInUrl(prospectId) {
    const url = await Utils.prompt({
      title: '+ LinkedIn URL',
      placeholder: 'https://www.linkedin.com/in/meno-priezvisko/',
      confirmText: 'Uložiť',
    });
    if (!url) return;
    if (!/linkedin\.com\//i.test(url)) return Utils.toast('Neplatná LinkedIn URL', 'warning');
    const { error } = await Database.client.from('prospects').update({ linkedin_url: url }).eq('id', prospectId);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    const p = this.prospects.find(x => x.id === prospectId);
    if (p) p.linkedin_url = url;
    Utils.toast('LinkedIn URL uložený', 'success');
    // refresh detail view
    if (this._detailProspectId === prospectId) this._refreshDetailBody();
  },

  async generateLinkedInDM(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p?.linkedin_url) return Utils.toast('Chýba LinkedIn URL', 'warning');

    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:560px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">in LinkedIn DM pre ${this.esc(p.company_name || p.domain || 'prospekta')}</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <div style="padding:20px 24px;">
          <label style="display:block;font-size:12px;color:#6F6758;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Angle / hook</label>
          <input id="li-angle" type="text" placeholder="napr. bezplatný audit, konkurencia v Google Ads..." value="bezplatný marketingový audit"
            style="width:100%;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;margin-bottom:12px;">
          <button id="li-gen-btn" class="adl-btn adl-btn-primary" style="width:100%;" onclick="OutreachModule._runLinkedInDM('${prospectId}')">✨ Vygenerovať</button>
          <div id="li-result" style="margin-top:16px;display:none;"></div>
        </div>
      </div>
    `;
    this._openModal(modal);
  },

  async _runLinkedInDM(prospectId) {
    const btn = document.getElementById('li-gen-btn');
    const resultBox = document.getElementById('li-result');
    const angle = document.getElementById('li-angle')?.value?.trim() || '';
    btn.disabled = true;
    btn.textContent = '⏳ Generujem (10-20 s)…';
    try {
      const r = await fetch('/.netlify/functions/linkedin-generate-dm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId, angle }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const safeMsg = this.esc(d.message).replace(/\n/g, '<br>');
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="background:#F7F5F1;border:1px solid #EAE6DE;border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;">Návrh správy (${d.characters}/280 znakov)</div>
          <div id="li-msg-text" style="font-size:14px;color:#14120E;line-height:1.6;white-space:pre-wrap;">${safeMsg}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule._copyLinkedInMsg()">📋 Skopírovať</button>
          ${d.messageUrl ? `<a class="adl-btn adl-btn-primary" href="${d.messageUrl}" target="_blank" onclick="OutreachModule.closeModal()">↗ Otvoriť LinkedIn</a>` : ''}
          <button class="adl-btn adl-btn-ghost" onclick="OutreachModule._runLinkedInDM('${prospectId}')">↻ Prerobiť</button>
        </div>
        <p style="font-size:11px;color:#948B7C;margin:12px 0 0;line-height:1.5;">Po odoslaní môžeš manuálne pridať poznámku do prospektu.</p>
      `;
      this._lastLinkedInMsg = d.message;
    } catch (e) {
      resultBox.style.display = 'block';
      resultBox.innerHTML = `<div style="background:#FEE2E2;color:#991B1B;border-radius:10px;padding:12px 14px;">✕ ${this.esc(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Vygenerovať';
    }
  },

  _copyLinkedInMsg() {
    const text = this._lastLinkedInMsg || '';
    navigator.clipboard?.writeText(text);
    Utils.toast('Správa skopírovaná', 'info');
  },

  _detailActivity(p) {
    const events = this._detailEvents;
    if (events == null) return `<div style="color:#948B7C;padding:12px;">Načítavam aktivitu…</div>`;

    const humanOpens = events.filter(e => e.event_type === 'email_open' && !e.is_bot).length;
    const botOpens = events.filter(e => e.event_type === 'email_open' && e.is_bot).length;
    const clicks = events.filter(e => e.event_type === 'email_click' && !e.is_bot).length;
    const countries = [...new Set(events.filter(e => !e.is_bot && e.geo_country).map(e => e.geo_country))];

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;">
        <div style="font-size:13px;color:#6F6758;">Timeline všetkých udalostí · ${events.length} záznamov</div>
        <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule._loadDetailEvents('${p.id}')">↻ Obnoviť</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
        ${this._stat('👁 Otvorení', humanOpens, '#8B5CF6', '#EDE9FE')}
        ${this._stat('🖱 Kliky', clicks, '#F97316', '#FFEDD5')}
        ${this._stat('🤖 Botov', botOpens, '#6F6758', '#F7F5F1')}
        ${this._stat('📍 Krajín', countries.length, '#3B82F6', '#DBEAFE')}
      </div>
      ${events.length === 0 ? `<div style="color:#948B7C;padding:24px;text-align:center;background:#F7F5F1;border-radius:10px;">Žiadna aktivita zatiaľ.</div>` : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${events.map(e => this._renderEvent(e)).join('')}
        </div>
      `}
    `;
  },

  _detailAudit(p) {
    const items = [
      ['Požiadal o audit', p.audit_requested_at],
      ['Audit vygenerovaný', p.audit_generated_at || p.audit_delivered_at],
      ['Audit doručený', p.audit_delivered_at],
      ['Audit videl', p.audit_viewed_at],
    ];
    const hasAny = items.some(([, v]) => v);
    const auditUrl = p.audit_token ? `/audit.html?t=${p.audit_token}` : null;
    const requestUrl = p.audit_token ? `/audit-request.html?t=${p.audit_token}` : null;

    return `
      ${!hasAny ? `<div style="color:#948B7C;padding:12px;background:#F7F5F1;border-radius:10px;margin-bottom:14px;">Audit flow ešte nezačal.</div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
          ${items.map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #EAE6DE;border-radius:10px;background:#fff;">
              <span style="color:${v ? '#14120E' : '#948B7C'};font-weight:${v ? '600' : '400'};">${k}</span>
              <span style="color:#6F6758;font-size:13px;">${v ? new Date(v).toLocaleString('sk-SK') : '—'}</span>
            </div>
          `).join('')}
        </div>
      `}
      ${p.audit_view_count ? `<div style="margin-bottom:16px;font-size:13px;color:#6F6758;">Audit bol zobrazený <strong>${p.audit_view_count}×</strong>.</div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${auditUrl ? `<a class="adl-btn adl-btn-outline" href="${auditUrl}" target="_blank" onclick="event.stopPropagation()">📄 Otvoriť audit stránku ↗</a>` : ''}
        ${requestUrl ? `<a class="adl-btn adl-btn-ghost" href="${requestUrl}" target="_blank" onclick="event.stopPropagation()">📋 Otvoriť request form ↗</a>` : ''}
      </div>
    `;
  },

  // Modal actions — prebrané z detailu
  composeFromDetail() {
    const id = this._detailProspectId;
    this.closeModal();
    this.composeSingle(id);
  },
  promoteFromDetail() {
    const id = this._detailProspectId;
    this.closeModal();
    this.promoteToLead(id);
  },
  async deleteProspectFromDetail() {
    const id = this._detailProspectId;
    this.closeModal();
    await this.deleteProspect(id);
  },

  _openModalWide(el) {
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;';
    el.querySelector('.adl-modal-backdrop').style.cssText = 'position:absolute;inset:0;background:rgba(20,18,14,0.55);';
    el.querySelector('.adl-modal-card').style.cssText += 'position:relative;background:#fff;border-radius:16px;max-height:92vh;overflow:hidden;box-shadow:0 24px 64px -12px rgba(20,18,14,0.4);display:flex;flex-direction:column;';
    const head = el.querySelector('.adl-modal-head');
    if (head) head.style.cssText = 'padding:20px 24px;border-bottom:1px solid #EAE6DE;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-shrink:0;';
  },

  // ========== ACTIVITY TIMELINE ==========

  async openActivity(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    const label = p?.company_name || p?.domain || 'prospect';
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:720px;">
        <div class="adl-modal-head">
          <div>
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Aktivita</div>
            <h3 style="margin:2px 0 0;font-size:18px;font-weight:700;">${this.esc(label)}</h3>
          </div>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <div id="activity-body" style="padding:18px 24px 24px;">
          <div style="color:#948B7C;font-size:14px;">Načítavam…</div>
        </div>
      </div>
    `;
    this._openModal(modal);

    try {
      const { data: events, error } = await Database.client
        .from('prospect_events')
        .select('event_type, occurred_at, is_bot, bot_vendor, user_agent, geo_country, geo_city, geo_region, geo_isp, link_url, meta')
        .eq('prospect_id', prospectId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const humanOpens = events.filter(e => e.event_type === 'email_open' && !e.is_bot).length;
      const botOpens = events.filter(e => e.event_type === 'email_open' && e.is_bot).length;
      const clicks = events.filter(e => e.event_type === 'email_click' && !e.is_bot).length;
      const countries = [...new Set(events.filter(e => !e.is_bot && e.geo_country).map(e => e.geo_country))];

      const body = document.getElementById('activity-body');
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
          ${this._stat('👁 Otvorení', humanOpens, '#8B5CF6', '#EDE9FE')}
          ${this._stat('🖱 Kliky', clicks, '#F97316', '#FFEDD5')}
          ${this._stat('🤖 Botov', botOpens, '#6F6758', '#F7F5F1')}
          ${this._stat('📍 Krajín', countries.length, '#3B82F6', '#DBEAFE')}
        </div>
        ${events.length === 0 ? `<div style="color:#948B7C;padding:24px;text-align:center;">Žiadna aktivita zatiaľ.</div>` : `
          <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto;">
            ${events.map(e => this._renderEvent(e)).join('')}
          </div>
        `}
      `;
    } catch (e) {
      const body = document.getElementById('activity-body');
      if (body) body.innerHTML = `<div style="color:#DC2626;padding:12px;background:#FEE2E2;border-radius:10px;">Chyba: ${this.esc(e.message)}</div>`;
    }
  },

  _stat(label, value, color, bg) {
    return `<div style="background:${bg};border-radius:10px;padding:12px 14px;">
      <div style="font-size:11px;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">${label}</div>
      <div style="font-size:22px;font-weight:800;color:${color};letter-spacing:-0.5px;">${value}</div>
    </div>`;
  },

  _renderEvent(e) {
    const fmt = new Date(e.occurred_at).toLocaleString('sk-SK');
    const typeMap = {
      email_open:       { icon: '👁', label: 'Email otvorený',  color: '#8B5CF6', bg: '#EDE9FE' },
      email_click:      { icon: '🖱', label: 'Klik na link',     color: '#F97316', bg: '#FFEDD5' },
      audit_requested:  { icon: '🎯', label: 'Request auditu',   color: '#EA580C', bg: '#FED7AA' },
      audit_viewed:     { icon: '📖', label: 'Audit videl',      color: '#16A34A', bg: '#DCFCE7' },
      email_sent:       { icon: '✉',  label: 'Email odoslaný',   color: '#3B82F6', bg: '#DBEAFE' },
    };
    const t = typeMap[e.event_type] || { icon: '•', label: e.event_type, color: '#6F6758', bg: '#F7F5F1' };
    const geo = [e.geo_city, e.geo_region, e.geo_country].filter(Boolean).join(', ');
    const hasRich = !!(e.user_agent || geo || e.geo_isp);
    const botTag = e.is_bot ? ` <span style="font-size:11px;color:#948B7C;font-weight:500;">(bot: ${this.esc(e.bot_vendor || 'unknown')})</span>` : '';

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:10px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;">
        <div style="flex-shrink:0;width:36px;height:36px;border-radius:9px;background:${t.bg};color:${t.color};display:flex;align-items:center;justify-content:center;font-size:16px;">${t.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:13px;color:#14120E;">${t.label}${botTag}</strong>
            <span style="font-size:12px;color:#948B7C;">${fmt}</span>
          </div>
          ${e.link_url ? `<div style="font-size:12px;color:#6F6758;margin-top:3px;word-break:break-all;">→ ${this.esc(e.link_url)}</div>` : ''}
          ${hasRich ? `
            <div style="font-size:11px;color:#948B7C;margin-top:3px;">
              ${geo ? `📍 ${this.esc(geo)}` : ''}${geo && e.geo_isp ? ' · ' : ''}${e.geo_isp ? this.esc(e.geo_isp) : ''}${(geo || e.geo_isp) && e.user_agent ? ' · ' : ''}${e.user_agent ? `<span title="${this.esc(e.user_agent)}">${this.esc(this._shortUa(e.user_agent))}</span>` : ''}
            </div>
          ` : `<div style="font-size:11px;color:#948B7C;margin-top:3px;font-style:italic;">Staršie dáta (pred upgrade trackingu — UA/geo sa neukladalo)</div>`}
        </div>
      </div>
    `;
  },

  _shortUa(ua) {
    if (!ua) return '';
    const s = String(ua);
    if (/GoogleImageProxy/i.test(s)) return 'Gmail proxy';
    if (/iPhone/i.test(s)) return 'iPhone';
    if (/Android/i.test(s)) return 'Android';
    if (/Macintosh/i.test(s)) return 'macOS';
    if (/Windows/i.test(s)) return 'Windows';
    return s.slice(0, 40) + (s.length > 40 ? '…' : '');
  },

  // ========== AI GENERATOR ==========

  openAiGenerator() {
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:560px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">✨ AI napíš šablónu za mňa</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <form id="ai-gen-form" onsubmit="event.preventDefault();OutreachModule.runAiGenerator();" style="padding:20px 24px 24px;display:grid;gap:14px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            Cieľ emailu
            <input name="goal" type="text" placeholder="napr. získať audit request, pozvať na 15-min call..." value="získať audit request"
              style="padding:10px 14px;border:1.5px solid #E5E0D7;border-radius:10px;font-size:14px;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            Segment / odvetvie
            <input name="segment" type="text" placeholder="napr. zubári v Bratislave, e-shopy s doplnkami, fitness centrá..."
              style="padding:10px 14px;border:1.5px solid #E5E0D7;border-radius:10px;font-size:14px;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            Hlavný hook / uhol
            <textarea name="keyHook" rows="3" placeholder="napr. väčšina zubárov má web z roku 2015 — vysoká bounce rate, zlé Google reviews, nepoužívajú Google Ads..."
              style="padding:10px 14px;border:1.5px solid #E5E0D7;border-radius:10px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            Tón
            <select name="tone" style="padding:10px 14px;border:1.5px solid #E5E0D7;border-radius:10px;font-size:14px;background:#fff;">
              <option value="priamy">Priamy / biznis</option>
              <option value="priateľský">Priateľský / osobný</option>
              <option value="profesionálny">Profesionálny / formálny</option>
              <option value="s humorom">S humorom / odľahčený</option>
              <option value="naliehavý">Naliehavý / FOMO</option>
            </select>
          </label>
          <div id="ai-gen-status" style="display:none;font-size:13px;color:#6F6758;padding:10px 14px;background:#F7F5F1;border-radius:10px;"></div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">✨ Vygenerovať</button>
          </div>
          <p style="font-size:11px;color:#948B7C;margin:0;line-height:1.5;">
            AI vygeneruje subject + plain text s premennými a CTA. Môžeš ho potom editovať ako chceš.
            Vyžaduje nastavený <code>ANTHROPIC_API_KEY</code> v Netlify env.
          </p>
        </form>
      </div>
    `;
    this._openModal(modal);
    setTimeout(() => modal.querySelector('[name=segment]')?.focus(), 30);
  },

  async runAiGenerator() {
    const form = document.getElementById('ai-gen-form');
    if (!form) return;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const status = document.getElementById('ai-gen-status');
    const btn = form.querySelector('button[type=submit]');
    if (status) { status.style.display = 'block'; status.textContent = '⏳ AI generuje (10–20 s)…'; }
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/.netlify/functions/generate-email-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      this._applyAiResult(data);
      this.closeModal();
      Utils.toast('✨ Šablóna vygenerovaná — môžeš ju upraviť a uložiť.', 'success');
    } catch (e) {
      if (status) {
        status.style.background = '#FEE2E2';
        status.style.color = '#991B1B';
        status.textContent = '✕ ' + (e.message || 'Chyba pri generovaní');
      }
      if (btn) btn.disabled = false;
    }
  },

  _applyAiResult(data) {
    const t = this.editingTemplate;
    if (!t) return;
    // Zapíš do editing template + aktualizuj formuláre
    t.subject = data.subject;
    t.plain_text = data.plainText;
    t.body_text = data.plainText;
    // Keď nemal meno (custom), aktualizuj z návrhu
    if (!t.is_system && /^(Vlastná cold šablóna|Vlastná|Nová)/i.test(t.name)) {
      t.name = data.suggestedName || t.name;
    }
    const subjectEl = document.getElementById('tpl-subject');
    const textEl = document.getElementById('tpl-text');
    if (subjectEl) subjectEl.value = data.subject;
    if (textEl) textEl.value = data.plainText;
    // Force prepočet (updated name zobrazíme pri rerenderi po uložení)
  },

  // ========== EDITOR TOOLBAR + TEMPLATE CRUD ==========

  insertSnippet(kind) {
    const ta = document.getElementById('tpl-text');
    if (!ta) return;
    const snippets = {
      cta: '\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n',
      link: '[[Klikni tu|https://]]',
      greeting: '{{greeting}}',
      company: '{{company}}',
      audit: '\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n\n',
      signature: '\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}',
      ps: '\n\nP.S. ',
    };
    const text = snippets[kind];
    if (!text) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + text + after;
    const caret = start + text.length;
    ta.focus();
    ta.setSelectionRange(caret, caret);
  },

  async newTemplate() {
    const name = await Utils.prompt({
      title: '+ Nová šablóna',
      message: 'Zadaj názov novej šablóny. Prázdnu ti otvorím v editore, alebo môžeš použiť „✨ AI napíš za mňa".',
      placeholder: 'napr. Cold – letná kampaň',
      defaultValue: 'Vlastná cold šablóna',
      confirmText: 'Vytvoriť',
    });
    if (!name) return;
    const baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'custom';
    const slug = `${baseSlug}_${Date.now().toString(36)}`;
    const payload = {
      org_id: '00000000-0000-0000-0000-000000000001',
      slug,
      name: name.trim(),
      description: 'Vlastná šablóna',
      category: 'outreach',
      subject: '{{company}} — ',
      plain_text: `{{greeting}},\n\n\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}`,
      body_text: `{{greeting}},\n\n\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}`,
      variables: ['greeting','contact_name','company','domain','industry','industry_hook','city','audit_request_url','sender_name','sender_title'],
      is_system: false,
      is_active: true,
    };
    const { data, error } = await Database.client.from('email_templates').insert(payload).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.templates.unshift(data);
    OutreachTemplates.clearCache();
    this.editingTemplate = { ...data };
    this.editorMode = 'plain';
    this.rerender();
    Utils.toast('Šablóna vytvorená', 'success');
  },

  async duplicateTemplate(id) {
    const src = this.templates.find(x => x.id === id);
    if (!src) return;
    const payload = {
      org_id: '00000000-0000-0000-0000-000000000001',
      slug: `${src.slug}_copy_${Date.now().toString(36)}`,
      name: `${src.name} (kópia)`,
      description: src.description,
      category: src.category,
      subject: src.subject,
      plain_text: src.plain_text || src.body_text || '',
      body_text: src.plain_text || src.body_text || '',
      html_content: src.html_content || src.body_html || null,
      body_html: src.html_content || src.body_html || null,
      variables: src.variables || [],
      is_system: false,
      is_active: true,
    };
    const { data, error } = await Database.client.from('email_templates').insert(payload).select().single();
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.templates.unshift(data);
    OutreachTemplates.clearCache();
    Utils.toast('Šablóna duplikovaná', 'success');
    this.rerender();
  },

  async deleteTemplate(id) {
    const t = this.templates.find(x => x.id === id);
    if (!t) return;
    if (t.is_system) return Utils.toast('Systémovú šablónu nemôžeš zmazať (použi Duplikovať a uprav kópiu).', 'warning');
    const ok = typeof Utils?.confirm === 'function'
      ? await Utils.confirm(`Zmazať šablónu „${t.name}"?`, { title: 'Zmazať šablónu', type: 'danger', confirmText: 'Zmazať', cancelText: 'Zrušiť' })
      : confirm(`Zmazať „${t.name}"?`);
    if (!ok) return;
    const { error } = await Database.client.from('email_templates').delete().eq('id', id);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    this.templates = this.templates.filter(x => x.id !== id);
    OutreachTemplates.clearCache();
    Utils.toast('Zmazané', 'success');
    this.rerender();
  },

  // ========== SELECTION + DELETE ==========

  toggleSelect(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.rerender();
  },

  toggleAllProspects(checked) {
    const filtered = this.applyFilters();
    const from = (this.page - 1) * this.pageSize;
    const to = Math.min(from + this.pageSize, filtered.length);
    const pageRows = filtered.slice(from, to);
    if (checked) pageRows.forEach(p => this.selectedIds.add(p.id));
    else pageRows.forEach(p => this.selectedIds.delete(p.id));
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

  async bulkAssign() {
    if (!this._teamMembers) await this._loadTeamMembers();
    const members = this._teamMembers || [];
    if (!members.length) return Utils.toast('Žiadni členovia tímu', 'warning');

    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = `
      <div class="adl-modal-backdrop" onclick="OutreachModule.closeModal()"></div>
      <div class="adl-modal-card" style="max-width:460px;">
        <div class="adl-modal-head">
          <h3 style="margin:0;font-size:18px;font-weight:700;">Priradiť ${this.selectedIds.size} prospektov</h3>
          <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.closeModal()">✕</button>
        </div>
        <form id="assign-form" onsubmit="event.preventDefault();OutreachModule._runBulkAssign();" style="padding:20px 24px;display:grid;gap:12px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#6F6758;font-weight:600;">
            Priradiť na
            <select name="assignee" style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
              <option value="">— Nikoho (zrušiť priradenie) —</option>
              ${members.map(u => `<option value="${u.id}">${this.esc(u.full_name || u.email)} (${u.role})</option>`).join('')}
            </select>
          </label>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="adl-btn adl-btn-outline" onclick="OutreachModule.closeModal()">Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">Priradiť</button>
          </div>
        </form>
      </div>
    `;
    this._openModal(modal);
  },

  async _runBulkAssign() {
    const form = document.getElementById('assign-form');
    const assignee = form?.querySelector('[name=assignee]')?.value || null;
    const ids = Array.from(this.selectedIds);
    if (!ids.length) return;
    const { error } = await Database.client.from('prospects')
      .update({ assigned_to: assignee || null })
      .in('id', ids);
    if (error) return Utils.toast('Chyba: ' + error.message, 'danger');
    // update local
    this.prospects.forEach(p => { if (this.selectedIds.has(p.id)) p.assigned_to = assignee || null; });
    Utils.toast(`Priradených ${ids.length}`, 'success');
    this.selectedIds.clear();
    this.closeModal();
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
