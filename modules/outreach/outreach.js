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
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openCampaigns()">🔁 Kampane</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openTemplates()">✉ Šablóny</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openImport()">⬆ Import CSV</button>
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openNewProspect()">＋ Nový prospect</button>
            <button class="adl-btn adl-btn-ghost" onclick="OutreachModule.exportCsv()">⬇ Export CSV</button>
            <span class="adl-toolbar-divider"></span>
            <button class="adl-btn adl-btn-primary adl-btn-lg" onclick="OutreachModule.startCompose()" ${this.selectedIds.size === 0 ? 'disabled' : ''}>▶ Poslať kampaň (${this.selectedIds.size})</button>
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
            <label style="display:block;font-size:12px;font-weight:600;color:#6F6758;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">HTML obsah (úplný HTML, prepíše brand wrapper)</label>
            <textarea id="tpl-html" rows="22" placeholder="<!DOCTYPE html>&#10;<html>&#10;  ..." style="width:100%;padding:12px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5;resize:vertical;">${this.esc(t.html_content || t.body_html || '')}</textarea>
            <p style="font-size:12px;color:#948B7C;margin:6px 0 0;">Nechaj prázdne pre auto-generovanie HTML z plain textu s brandom.</p>
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
    // zachovaj súčasné hodnoty pred prepnutím
    const subj = document.getElementById('tpl-subject')?.value;
    const plain = document.getElementById('tpl-text')?.value;
    const html = document.getElementById('tpl-html')?.value;
    if (this.editingTemplate) {
      if (subj != null) this.editingTemplate.subject = subj;
      if (plain != null) { this.editingTemplate.plain_text = plain; this.editingTemplate.body_text = plain; }
      if (html != null) { this.editingTemplate.html_content = html; this.editingTemplate.body_html = html; }
    }
    this.editorMode = mode;
    this.rerender();
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

  async previewEditing() {
    const subject = document.getElementById('tpl-subject')?.value || '';
    const text = document.getElementById('tpl-text')?.value || '';
    const customHtml = document.getElementById('tpl-html')?.value || '';
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
    const html = document.getElementById('tpl-html')?.value ?? t.html_content ?? t.body_html ?? '';
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

  // ========== CAMPAIGNS (sekvencie) ==========

  async openCampaigns() {
    this.currentView = 'campaigns';
    this.editingCampaign = null;
    this.campaigns = [];
    this.campaignsLoaded = false;
    this.rerender();
    await this.ensureOutreachTemplatesLoaded();
    try {
      const { data, error } = await Database.client
        .from('outreach_campaigns')
        .select('id, name, description, status, segment_filter, stop_on_reply, stop_on_audit_request, sender_name, sender_email, created_at, updated_at, outreach_campaign_steps(id, step_order, delay_days, template_slug, send_if_stage_in, note), enrollments:outreach_campaign_enrollments(count)')
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
          ${c.status === 'active' ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.setCampaignStatus('${c.id}','paused')">⏸ Pauza</button>` : ''}
          ${c.status === 'paused' || c.status === 'draft' ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.setCampaignStatus('${c.id}','active')">▶ Aktivovať</button>` : ''}
          <button class="adl-btn adl-btn-sm adl-btn-outline" onclick="OutreachModule.editCampaign('${c.id}')">Upraviť</button>
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
            ${(c.steps || []).map((s, i) => `
              <div style="background:#FAFAF7;border:1px solid #EAE6DE;border-radius:10px;padding:12px 14px;display:grid;grid-template-columns:60px 120px 1fr auto;gap:12px;align-items:center;">
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
                  <div style="font-size:11px;color:#948B7C;text-transform:uppercase;font-weight:600;margin-bottom:2px;">Šablóna</div>
                  <select onchange="OutreachModule._updateStepTemplate(${i}, this.value)"
                    style="width:100%;padding:8px 10px;border:1.5px solid #EAE6DE;border-radius:8px;font-size:13px;background:#fff;">
                    ${tplOptions.replace(`value="${s.template_slug}"`, `value="${s.template_slug}" selected`)}
                  </select>
                </div>
                <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="OutreachModule._removeStep(${i})">✕</button>
              </div>
            `).join('')}
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
      send_if_stage_in: null,
    }];
    this.rerender();
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
          c.steps.map(s => ({
            campaign_id: c.id,
            step_order: s.step_order,
            delay_days: s.delay_days || 0,
            template_slug: s.template_slug,
            send_if_stage_in: s.send_if_stage_in || null,
            note: s.note || null,
          }))
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
    const modal = this._ensureModal('outreach-modal');
    modal.innerHTML = this._renderDetailModal(p);
    this._openModalWide(modal);
    this._loadDetailEvents(prospectId);
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
      { key: 'activity', label: 'Aktivita' },
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
    return this._detailOverview(p);
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
    const fields = [
      ['Kontaktná osoba', p.contact_person],
      ['Email', p.email ? `<a href="mailto:${this.esc(p.email)}" style="color:#F97316;">${this.esc(p.email)}</a>` : null],
      ['Telefón', p.phone ? `<a href="tel:${this.esc(p.phone.replace(/\s/g,''))}" style="color:#F97316;">${this.esc(p.phone)}</a>` : null],
      ['Odvetvie', p.industry],
      ['Mesto', p.city],
      ['Segment', p.segment],
      ['Skóre', `<strong>${p.score || 0}</strong>`],
      ['Zdroj', p.source],
      ['Pridané', p.created_at ? new Date(p.created_at).toLocaleString('sk-SK') : null],
    ].filter(([, v]) => v != null && v !== '');

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
    `;
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
