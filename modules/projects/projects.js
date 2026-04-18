/**
 * ADLIFY PLATFORM - Campaign Projects Module v1.0
 * Workflow management for campaign projects
 */

const CampaignProjectsModule = {
  id: 'projects',
  name: 'Projekty',
  icon: '📁',
  title: 'Kampaňové projekty',
  subtitle: 'Správa a workflow kampaní',
  
  menu: { section: 'main', order: 25 },
  permissions: ['projects', 'view'],
  
  // Data
  projects: [],
  clients: [],
  selectedProject: null,
  filters: { status: '', client: '', search: '' },
  
  // Workflow statusy
  STATUSES: {
    draft:           { label: 'Rozpracované',       color: 'gray',    icon: '📝', tone: 'n',     cdot: 'var(--n-400)' },
    generating:      { label: 'Spracováva sa',      color: 'purple',  icon: '🤖', tone: 'lav',   cdot: 'var(--acc-lavender-ink)' },
    internal_review: { label: 'Interná kontrola',   color: 'yellow',  icon: '👁️', tone: 'amber', cdot: 'var(--warn)' },
    client_review:   { label: 'Čaká na klienta',    color: 'blue',    icon: '👤', tone: 'sky',   cdot: 'var(--acc-sky-ink)' },
    revision:        { label: 'Revízia',            color: 'orange',  icon: '✏️', tone: 'brand', cdot: 'var(--brand-500)' },
    approved:        { label: 'Schválené',          color: 'green',   icon: '✅', tone: 'mint',  cdot: 'var(--acc-mint-ink)' },
    deploying:       { label: 'Nasadzovanie',       color: 'indigo',  icon: '🚀', tone: 'lav',   cdot: 'var(--acc-lavender-ink)' },
    active:          { label: 'Aktívne',            color: 'emerald', icon: '▶️', tone: 'ok',    cdot: 'var(--ok)' },
    paused:          { label: 'Pozastavené',        color: 'gray',    icon: '⏸️', tone: 'n',     cdot: 'var(--n-400)' },
    ended:           { label: 'Ukončené',           color: 'slate',   icon: '⏹️', tone: 'n',     cdot: 'var(--n-400)' }
  },

  // Default view: 'kanban' | 'grid'
  view: 'kanban',
  
  // Platformy
  PLATFORMS: {
    google_search: { name: 'Google Search', icon: '🔍', color: 'blue' },
    google_display: { name: 'Google Display', icon: '🖼️', color: 'green' },
    google_shopping: { name: 'Google Shopping', icon: '🛒', color: 'yellow' },
    google_pmax: { name: 'Performance Max', icon: '⚡', color: 'purple' },
    meta_facebook: { name: 'Facebook', icon: '📘', color: 'blue' },
    meta_instagram: { name: 'Instagram', icon: '📸', color: 'pink' },
    tiktok: { name: 'TikTok', icon: '🎵', color: 'slate' },
    linkedin: { name: 'LinkedIn', icon: '💼', color: 'blue' }
  },

  init() { 
    console.log('📁 Campaign Projects module v1.0 initialized'); 
  },
  
  async render(container, params = {}) {
    if (params.status) this.filters.status = params.status;
    if (params.client) this.filters.client = params.client;
    
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      await this.loadData();
      container.innerHTML = this.template();
      this.setupEventListeners();
    } catch (error) {
      console.error('Projects error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  async loadData() {
    // Load projects
    let query = Database.client.from('campaign_projects').select('*').order('created_at', { ascending: false });
    
    if (this.filters.status) {
      query = query.eq('status', this.filters.status);
    }
    if (this.filters.client) {
      query = query.eq('client_id', this.filters.client);
    }
    
    const { data: projects, error } = await query;
    if (error) throw error;
    this.projects = projects || [];
    
    // Load clients for dropdown
    const { data: clients } = await Database.client.from('clients').select('id, company_name').order('company_name');
    this.clients = clients || [];
    
    // Filter by search
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      this.projects = this.projects.filter(p => 
        p.name?.toLowerCase().includes(search)
      );
    }
    
    // Get client names for display
    const clientMap = {};
    this.clients.forEach(c => clientMap[c.id] = c.company_name);
    this.projects.forEach(p => p.client_name = clientMap[p.client_id] || 'Bez klienta');
  },
  
  template() {
    const view = this.view || 'kanban';
    return `
      <div class="adl">
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Projekty</h1>
            <div style="font-size:13px; color:var(--ink-sub);">Kampaňové projekty · apríl 2026</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <div style="display:inline-flex; background:var(--n-75); border-radius:9px; padding:3px;">
              <button onclick="CampaignProjectsModule.setView('kanban')" class="adl-btn adl-btn-sm ${view==='kanban'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Kanban</button>
              <button onclick="CampaignProjectsModule.setView('grid')" class="adl-btn adl-btn-sm ${view==='grid'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Zoznam</button>
            </div>
            <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="CampaignProjectsModule.showCreateModal()">${I.Plus({size:14})} Nový projekt</button>
          </div>
        </div>

        <!-- Stats -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:16px;" class="adl-projects-stats">
          ${this.renderStats()}
        </div>

        <!-- Filter bar -->
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap;" class="adl-projects-filters">
          <div class="adl-input" style="flex:1; min-width:220px; max-width:340px;">
            <span style="color:var(--ink-mute); display:flex;">${I.Search({size:15})}</span>
            <input type="text" id="filter-search" placeholder="Hľadať projekt…" value="${this.filters.search}" style="flex:1; border:0; outline:none; background:transparent; font:inherit; color:inherit;">
          </div>
          <select class="adl-input" id="filter-client" onchange="CampaignProjectsModule.onClientChange(this.value)" style="width:auto;">
            <option value="">Všetci klienti</option>
            ${this.clients.map(c => `<option value="${c.id}" ${this.filters.client === c.id ? 'selected' : ''}>${c.company_name}</option>`).join('')}
          </select>
          <select class="adl-input" id="filter-status" onchange="CampaignProjectsModule.onStatusChange(this.value)" style="width:auto;">
            <option value="">Všetky stavy</option>
            ${Object.entries(this.STATUSES).map(([k,v]) => `<option value="${k}" ${this.filters.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>

        <!-- View -->
        <div id="projects-view">
          ${view === 'kanban' ? this.renderKanban() : `<div id="projects-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;" class="adl-projects-grid">${this.renderProjectsGrid()}</div>`}
        </div>

        <!-- Create Modal -->
        <div id="create-modal" class="fixed inset-0 hidden items-center justify-center z-50 p-4" style="background:rgba(20,18,14,0.5);">
          <div style="background:var(--surface); border-radius:14px; max-width:560px; width:100%; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--sh-lg);">
            <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
              <h2 style="font-size:16px; font-weight:600; margin:0;">Nový projekt</h2>
              <button onclick="CampaignProjectsModule.closeCreateModal()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:6px; width:32px; height:32px; justify-content:center;">${I.X({size:14})}</button>
            </div>
            <div id="create-content" style="padding:20px; overflow-y:auto; flex:1;">
              ${this.renderCreateForm()}
            </div>
          </div>
        </div>

        <!-- Project Detail Modal -->
        <div id="detail-modal" class="fixed inset-0 hidden items-center justify-center z-50 p-4" style="background:rgba(20,18,14,0.5);">
          <div style="background:var(--surface); border-radius:14px; max-width:1100px; width:100%; max-height:95vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--sh-lg);">
            <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
              <h2 id="detail-title" style="font-size:16px; font-weight:600; margin:0;">Detail projektu</h2>
              <button onclick="CampaignProjectsModule.closeDetailModal()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:6px; width:32px; height:32px; justify-content:center;">${I.X({size:14})}</button>
            </div>
            <div id="detail-content" style="padding:20px; overflow-y:auto; flex:1;"></div>
          </div>
        </div>

        <style>
          @media (max-width: 1200px) { .adl-projects-grid { grid-template-columns: repeat(2, 1fr) !important; } .adl-projects-stats { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 700px)  { .adl-projects-grid { grid-template-columns: 1fr !important; } }
          .workflow-step { position: relative; }
          .workflow-step::after { content: ''; position: absolute; right: -1rem; top: 50%; width: 0.75rem; height: 2px; background: var(--border); }
          .workflow-step:last-child::after { display: none; }
          .workflow-step.active::after { background: var(--ok); }
          .workflow-step.completed { background: color-mix(in oklab, var(--ok) 15%, transparent); color: var(--ok); }
          .workflow-step.active { background: var(--brand-500); color: white; }
        </style>
      </div>
    `;
  },

  setView(view) {
    this.view = view;
    // Re-render entire template
    const container = document.getElementById('main-content');
    if (container) container.innerHTML = this.template();
    this.setupEventListeners();
  },

  renderKanban() {
    // Stĺpce v logickom workflow poradí
    const columns = [
      { key: 'draft',           label: 'Rozpracované',    statuses: ['draft'] },
      { key: 'generating',      label: 'Spracovanie',     statuses: ['generating', 'internal_review'] },
      { key: 'client_review',   label: 'U klienta',       statuses: ['client_review', 'revision'] },
      { key: 'approved',        label: 'Schválené',       statuses: ['approved', 'deploying'] },
      { key: 'active',          label: 'Aktívne',         statuses: ['active'] },
      { key: 'done',            label: 'Ukončené',        statuses: ['paused', 'ended'] }
    ];

    const colColors = {
      draft: 'var(--n-400)', generating: 'var(--acc-lavender-ink)',
      client_review: 'var(--acc-sky-ink)', approved: 'var(--acc-mint-ink)',
      active: 'var(--ok)', done: 'var(--n-400)'
    };

    const byCol = {};
    columns.forEach(c => byCol[c.key] = []);
    this.projects.forEach(p => {
      const col = columns.find(c => c.statuses.includes(p.status));
      if (col) byCol[col.key].push(p);
      else byCol['draft'].push(p);
    });

    return `
      <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; min-height:400px;" class="adl-kanban">
        ${columns.map(col => {
          const items = byCol[col.key];
          return `
            <div style="flex:0 0 280px; min-width:260px; display:flex; flex-direction:column;">
              <div style="display:flex; align-items:center; gap:8px; padding:0 6px 10px;">
                <span style="width:8px; height:8px; border-radius:99px; background:${colColors[col.key]};"></span>
                <span style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px;">${col.label}</span>
                <span style="font-size:11px; color:var(--ink-mute); background:var(--n-75); padding:1px 7px; border-radius:99px;">${items.length}</span>
                <div style="flex:1;"></div>
              </div>
              <div style="flex:1; background:var(--n-75); border-radius:12px; padding:8px; display:flex; flex-direction:column; gap:8px; min-height:200px;">
                ${items.length === 0 ? `
                  <div style="padding:20px 8px; text-align:center; color:var(--ink-mute); font-size:12px;">Žiadne projekty</div>
                ` : items.map(p => this.renderKanbanCard(p)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderKanbanCard(project) {
    const status = this.STATUSES[project.status] || this.STATUSES.draft;
    const budget = project.total_monthly_budget || 0;
    const created = project.created_at ? new Date(project.created_at).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' }) : '';
    const clientShort = (project.client_name || 'Bez klienta').length > 24
      ? project.client_name.substring(0, 22) + '…'
      : project.client_name;

    return `
      <div onclick="CampaignProjectsModule.showDetail('${project.id}')" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px; box-shadow:var(--sh-xs); cursor:pointer; transition: border-color .12s, box-shadow .12s;" onmouseover="this.style.borderColor='var(--border-strong)'; this.style.boxShadow='var(--sh-sm)'" onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='var(--sh-xs)'">
        <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
          <span class="adl-chip adl-chip-${status.tone} adl-chip-sm">${clientShort}</span>
        </div>
        <div style="font-size:13px; font-weight:500; letter-spacing:-0.1px; line-height:1.3; margin-bottom:10px;">${project.name}</div>
        ${budget > 0 ? `
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
            <span class="mono" style="font-size:12px; font-weight:600; color:var(--ink);">${budget.toLocaleString('sk-SK')} €</span>
            <span style="font-size:10px; color:var(--ink-mute);">/mes</span>
          </div>
        ` : ''}
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--ink-mute);">
          <span style="display:flex; align-items:center; gap:4px;">${I.Clock({size:11})}${created}</span>
          <span class="adl-chip adl-chip-${status.tone} adl-chip-sm"><span class="dot"></span>${status.label}</span>
        </div>
      </div>
    `;
  },
  
  renderStatusTabs() {
    const counts = {};
    this.projects.forEach(p => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    
    const mainStatuses = ['', 'draft', 'internal_review', 'client_review', 'approved', 'active'];
    
    return mainStatuses.map(status => {
      const isActive = this.filters.status === status;
      const label = status ? this.STATUSES[status]?.label : 'Všetky';
      const count = status ? (counts[status] || 0) : this.projects.length;
      
      return `
        <button onclick="CampaignProjectsModule.onStatusChange('${status}')" 
          class="status-tab ${isActive ? 'active' : ''}">
          ${label} <span class="ml-1 opacity-70">(${count})</span>
        </button>
      `;
    }).join('');
  },
  
  renderStats() {
    const total = this.projects.length;
    const active = this.projects.filter(p => p.status === 'active').length;
    const pending = this.projects.filter(p => ['internal_review', 'client_review'].includes(p.status)).length;
    const totalBudget = this.projects.reduce((sum, p) => sum + (p.total_monthly_budget || 0), 0);
    const formattedBudget = (Utils.formatPrice ? Utils.formatPrice(totalBudget) : `${totalBudget.toLocaleString('sk-SK')} €`);

    return `
      <div class="adl-stat">
        <div class="adl-stat-head">
          <div class="adl-stat-label">Celkom</div>
          <span class="adl-chip adl-chip-sm">projekty</span>
        </div>
        <div class="adl-stat-value">${total}</div>
      </div>
      <div class="adl-stat">
        <div class="adl-stat-head">
          <div class="adl-stat-label">Aktívne</div>
          <span class="adl-chip adl-chip-ok adl-chip-sm">beží</span>
        </div>
        <div class="adl-stat-value">${active}</div>
      </div>
      <div class="adl-stat">
        <div class="adl-stat-head">
          <div class="adl-stat-label">Čaká na schválenie</div>
          <span class="adl-chip adl-chip-amber adl-chip-sm">review</span>
        </div>
        <div class="adl-stat-value">${pending}</div>
      </div>
      <div class="adl-stat">
        <div class="adl-stat-head">
          <div class="adl-stat-label">Mesačný rozpočet</div>
          <span class="adl-chip adl-chip-brand adl-chip-sm">total</span>
        </div>
        <div class="adl-stat-value">${formattedBudget}</div>
      </div>
    `;
  },
  
  renderProjectsGrid() {
    if (this.projects.length === 0) {
      return `
        <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--ink-sub); background: var(--surface); border: 1px solid var(--border); border-radius: 14px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Folder({size:22})}</div>
          <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne projekty</h3>
          <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Vytvorte prvý kampaňový projekt — dokončením onboardingu klienta alebo manuálne.</p>
          <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="CampaignProjectsModule.showCreateModal()">${I.Plus({size:14})} Nový projekt</button>
        </div>
      `;
    }

    return this.projects.map(project => this.renderProjectCard(project)).join('');
  },
  
  renderProjectCard(project) {
    const status = this.STATUSES[project.status] || this.STATUSES.draft;
    const campaigns = project.campaigns_count || 0;
    const created = Utils.formatDate ? Utils.formatDate(project.created_at) : new Date(project.created_at).toLocaleDateString('sk');

    return `
      <div onclick="CampaignProjectsModule.showDetail('${project.id}')" style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; box-shadow:var(--sh-sm); cursor:pointer; transition: box-shadow .15s, border-color .15s;" onmouseover="this.style.borderColor='var(--border-strong)'; this.style.boxShadow='var(--sh-md)'" onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='var(--sh-sm)'">
        <!-- Header -->
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:12px;">
          <div style="flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:600; letter-spacing:-0.2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${project.name}</div>
            <div style="font-size:11px; color:var(--ink-sub); margin-top:2px;">${project.client_name}</div>
          </div>
          <span class="adl-chip adl-chip-${status.tone} adl-chip-sm"><span class="dot"></span>${status.label}</span>
        </div>

        <!-- Info -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 12px; background:var(--n-50); border-radius:8px; margin-bottom:12px;">
          <div>
            <div style="font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:0.8px;">Rozpočet</div>
            <div class="mono" style="font-size:13px; font-weight:600;">${project.total_monthly_budget ? `${project.total_monthly_budget.toLocaleString('sk-SK')} €` : '—'}</div>
          </div>
          <div>
            <div style="font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:0.8px;">Kampane</div>
            <div class="mono" style="font-size:13px; font-weight:600;">${campaigns}</div>
          </div>
        </div>

        <!-- Workflow progress dots -->
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
          ${this.renderWorkflowMini(project.status)}
          <span style="flex:1;"></span>
          <span style="font-size:11px; color:var(--ink-mute); display:flex; align-items:center; gap:4px;">${I.Clock({size:11})}${created}</span>
        </div>

        <!-- Actions -->
        <div style="display:flex; gap:6px; padding-top:10px; border-top:1px solid var(--border);">
          <button onclick="event.stopPropagation(); CampaignProjectsModule.showDetail('${project.id}')" class="adl-btn adl-btn-soft adl-btn-sm" style="flex:1; justify-content:center;">${I.Eye({size:14})} Detail</button>
          ${project.status === 'draft' ? `
            <button onclick="event.stopPropagation(); CampaignProjectsModule.startGeneration('${project.id}')" class="adl-btn adl-btn-ink adl-btn-sm" style="flex:1; justify-content:center;">${I.Sparkle({size:14})} Generovať</button>
          ` : ''}
          ${project.status === 'internal_review' ? `
            <button onclick="event.stopPropagation(); CampaignProjectsModule.approveInternal('${project.id}')" class="adl-btn adl-btn-primary adl-btn-sm" style="flex:1; justify-content:center;">${I.Check({size:14})} Schváliť</button>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderWorkflowMini(currentStatus) {
    const steps = ['draft', 'generating', 'internal_review', 'client_review', 'approved', 'active'];
    const currentIndex = steps.indexOf(currentStatus);

    return steps.map((step, index) => {
      const status = this.STATUSES[step];
      let bg;
      if (index < currentIndex) bg = 'var(--ok)';
      else if (index === currentIndex) bg = 'var(--brand-500)';
      else bg = 'var(--n-150)';

      return `<div style="width:8px; height:8px; border-radius:99px; background:${bg};" title="${status.label}"></div>`;
    }).join('');
  },
  
  renderCreateForm() {
    return `
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Klient *</label>
          <select id="create-client" class="w-full p-3 border rounded-xl" required>
            <option value="">Vyber klienta...</option>
            ${this.clients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-1">Názov projektu *</label>
          <input type="text" id="create-name" placeholder="napr. Letná kampaň 2025" 
            class="w-full p-3 border rounded-xl" required>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-1">Popis (voliteľné)</label>
          <textarea id="create-description" rows="3" placeholder="Stručný popis projektu..." 
            class="w-full p-3 border rounded-xl"></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Rozpočet na reklamu</label>
            <div class="relative">
              <input type="number" id="create-ad-budget" placeholder="500" 
                class="w-full p-3 border rounded-xl pr-12">
              <span class="absolute right-3 top-3 text-gray-400">€/mes</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Poplatok za správu</label>
            <div class="relative">
              <input type="number" id="create-fee" placeholder="249" 
                class="w-full p-3 border rounded-xl pr-12">
              <span class="absolute right-3 top-3 text-gray-400">€/mes</span>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Plánovaný štart</label>
            <input type="date" id="create-start-date" class="w-full p-3 border rounded-xl">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Plánovaný koniec</label>
            <input type="date" id="create-end-date" class="w-full p-3 border rounded-xl">
          </div>
        </div>
        
        <div class="bg-blue-50 rounded-xl p-4">
          <h4 class="font-semibold text-blue-800 mb-2">💡 Tip</h4>
          <p class="text-sm text-blue-700">Po vytvorení projektu môžete spustiť AI generovanie, ktoré vytvorí kompletný návrh kampaní na základe údajov z onboardingu klienta.</p>
        </div>
        
        <div class="flex gap-3 pt-4">
          <button onclick="CampaignProjectsModule.closeCreateModal()" 
            class="flex-1 px-4 py-3 bg-gray-200 rounded-xl hover:bg-gray-300">
            Zrušiť
          </button>
          <button onclick="CampaignProjectsModule.createProject()" 
            class="flex-1 px-4 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
            ➕ Vytvoriť projekt
          </button>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  
  setupEventListeners() {
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.onSearchChange(e.target.value), 300);
      });
    }
  },
  
  async _refreshView() {
    const viewEl = document.getElementById('projects-view');
    if (!viewEl) return;
    if (this.view === 'kanban') {
      viewEl.innerHTML = this.renderKanban();
    } else {
      viewEl.innerHTML = `<div id="projects-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;" class="adl-projects-grid">${this.renderProjectsGrid()}</div>`;
    }
  },

  async onSearchChange(value) {
    this.filters.search = value;
    await this.loadData();
    await this._refreshView();
  },

  async onStatusChange(status) {
    this.filters.status = status;
    await this.loadData();
    // Re-render whole template to update counts + filters
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.template();
      this.setupEventListeners();
    }
  },

  async onClientChange(clientId) {
    this.filters.client = clientId;
    await this.loadData();
    await this._refreshView();
  },
  
  // ==========================================
  // MODALS
  // ==========================================
  
  showCreateModal() {
    const modal = document.getElementById('create-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },
  
  closeCreateModal() {
    const modal = document.getElementById('create-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  },
  
  async showDetail(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    
    this.selectedProject = project;
    
    document.getElementById('detail-title').textContent = project.name;
    document.getElementById('detail-content').innerHTML = await this.renderDetailContent(project);
    
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },
  
  closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    this.selectedProject = null;
  },
  
  // ==========================================
  // PROJECT DETAIL
  // ==========================================
  
  async renderDetailContent(project) {
    // Load campaigns for this project
    const { data: campaigns } = await Database.client
      .from('campaigns')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at');

    // Load onboarding data
    const { data: onboarding } = await Database.client
      .from('onboarding_responses')
      .select('*')
      .eq('client_id', project.client_id)
      .single();

    // Load ad groups + ads count
    let totalAds = 0;
    if (campaigns?.length) {
      const campaignIds = campaigns.map(c => c.id);
      const { data: adGroups } = await Database.client
        .from('ad_groups').select('id').in('campaign_id', campaignIds);
      if (adGroups?.length) {
        const { count } = await Database.client
          .from('ads').select('*', { count: 'exact', head: true })
          .in('ad_group_id', adGroups.map(g => g.id));
        totalAds = count || 0;
      }
    }

    const status = this.STATUSES[project.status] || this.STATUSES.draft;
    const totalBudget = (campaigns || []).reduce((s, c) => s + (c.budget_daily || 0) * 30, 0);
    const expected = project.expected_results?.day_90 || project.expected_results?.day_30 || {};

    return `
      <div class="space-y-6">
        <!-- Status & Workflow -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center justify-between mb-4">
            <span class="px-3 py-1 rounded-full text-sm font-medium bg-${status.color}-100 text-${status.color}-700">
              ${status.icon} ${status.label}
            </span>
            <span class="text-sm text-gray-500">Vytvorené: ${Utils.formatDate ? Utils.formatDate(project.created_at) : new Date(project.created_at).toLocaleDateString('sk')}</span>
          </div>

          <!-- Workflow Progress -->
          <div class="flex items-center justify-between">
            ${this.renderWorkflowProgress(project.status)}
          </div>
        </div>

        <!-- Summary metrics -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="bg-white border rounded-xl p-3 text-center">
            <div class="text-xl font-bold">${campaigns?.length || 0}</div>
            <div class="text-xs text-gray-500">Kampaní</div>
          </div>
          <div class="bg-white border rounded-xl p-3 text-center">
            <div class="text-xl font-bold">${totalAds}</div>
            <div class="text-xs text-gray-500">Reklám</div>
          </div>
          <div class="bg-white border rounded-xl p-3 text-center">
            <div class="text-xl font-bold">${totalBudget.toFixed(0)}€</div>
            <div class="text-xs text-gray-500">Rozpočet/mes</div>
          </div>
          <div class="bg-white border rounded-xl p-3 text-center">
            <div class="text-xl font-bold">${expected.conversions != null ? expected.conversions : '—'}</div>
            <div class="text-xs text-gray-500">Konverzie/90d</div>
          </div>
          <div class="bg-white border rounded-xl p-3 text-center">
            <div class="text-xl font-bold">${expected.roas != null ? expected.roas + 'x' : '—'}</div>
            <div class="text-xs text-gray-500">ROAS/90d</div>
          </div>
        </div>

        <!-- Tab navigation -->
        <div class="flex gap-1 border-b overflow-x-auto">
          <button onclick="CampaignProjectsModule.switchTab('overview')" data-tab-btn="overview" class="px-4 py-2 text-sm font-medium border-b-2 border-purple-600 text-purple-700 whitespace-nowrap">📋 Prehľad</button>
          <button onclick="CampaignProjectsModule.switchTab('strategy')" data-tab-btn="strategy" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-600 hover:text-purple-700 whitespace-nowrap">🎯 Stratégia</button>
          <button onclick="CampaignProjectsModule.switchTab('campaigns')" data-tab-btn="campaigns" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-600 hover:text-purple-700 whitespace-nowrap">📢 Kampane</button>
          <button onclick="CampaignProjectsModule.switchTab('onboarding')" data-tab-btn="onboarding" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-600 hover:text-purple-700 whitespace-nowrap">📥 Onboarding</button>
          <button onclick="CampaignProjectsModule.switchTab('deployment')" data-tab-btn="deployment" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-600 hover:text-purple-700 whitespace-nowrap">🚀 Deployment</button>
        </div>

        <!-- Tab content: OVERVIEW -->
        <div data-tab-content="overview" class="space-y-6">

        <!-- Client Portal Link (if exists) -->
        ${project.client_portal_token ? `
        <div class="card p-4 bg-blue-50 border border-blue-200">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-semibold text-blue-800">🔗 Odkaz pre klienta</h4>
              <p class="text-sm text-blue-600 truncate max-w-md">${window.location.origin}/portal/proposal.html?t=${project.client_portal_token}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="CampaignProjectsModule.previewAsClient('${project.id}')"
                class="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                👁️ Preview ako klient
              </button>
              <button onclick="CampaignProjectsModule.copyClientLink('${project.id}')"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                📋 Kopírovať
              </button>
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- Client Feedback (if exists) -->
        ${project.client_feedback ? `
        <div class="card p-4 bg-orange-50 border border-orange-200">
          <h4 class="font-semibold text-orange-800 mb-2">💬 Spätná väzba od klienta</h4>
          <p class="text-orange-700">${project.client_feedback}</p>
        </div>
        ` : ''}
        
        <!-- Info Grid -->
        <div class="grid md:grid-cols-2 gap-4">
          <div class="card p-4">
            <h4 class="font-semibold mb-3">📊 Základné info</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">Klient</span>
                <span class="font-medium">${project.client_name}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Rozpočet na reklamu</span>
                <span class="font-medium">${project.ad_spend_budget || 0}€/mes</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Poplatok za správu</span>
                <span class="font-medium">${project.management_fee || 0}€/mes</span>
              </div>
              <div class="flex justify-between border-t pt-2">
                <span class="text-gray-500">Celkom</span>
                <span class="font-bold text-lg">${project.total_monthly_budget || 0}€/mes</span>
              </div>
            </div>
          </div>
          
          <div class="card p-4">
            <h4 class="font-semibold mb-3">📅 Termíny</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">Plánovaný štart</span>
                <span>${project.planned_start_date || 'Neurčené'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Plánovaný koniec</span>
                <span>${project.planned_end_date || 'Neurčené'}</span>
              </div>
              ${project.actual_start_date ? `
              <div class="flex justify-between">
                <span class="text-gray-500">Skutočný štart</span>
                <span class="text-green-600">${project.actual_start_date}</span>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
        
        ${project.description ? `
        <div class="card p-4">
          <h4 class="font-semibold mb-2">📝 Popis</h4>
          <p class="text-gray-600">${project.description}</p>
        </div>
        ` : ''}
        
        </div><!-- /tab-overview -->

        <!-- Tab content: STRATEGY -->
        <div data-tab-content="strategy" class="space-y-6 hidden">
          ${project.strategy_summary ? `
          <div class="card p-4 bg-purple-50">
            <h4 class="font-semibold mb-2 text-purple-800">🎯 Stratégia</h4>
            <p class="text-purple-700">${project.strategy_summary}</p>
          </div>
          ` : '<div class="text-gray-400 text-sm text-center py-8">Stratégia ešte nebola vygenerovaná</div>'}

          ${project.business_analysis ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">💼 Analýza biznisu</h4>
            ${project.business_analysis.summary ? `<p class="text-sm text-gray-700 mb-3">${project.business_analysis.summary}</p>` : ''}
            <div class="grid md:grid-cols-2 gap-3">
              ${project.business_analysis.key_insights?.length ? `
                <div class="bg-gray-50 rounded-lg p-3">
                  <h5 class="text-xs font-semibold text-gray-600 uppercase mb-2">🔍 Zistenia</h5>
                  <ul class="text-sm space-y-1">${project.business_analysis.key_insights.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>
              ` : ''}
              ${project.business_analysis.opportunities?.length ? `
                <div class="bg-green-50 rounded-lg p-3">
                  <h5 class="text-xs font-semibold text-green-700 uppercase mb-2">🚀 Príležitosti</h5>
                  <ul class="text-sm space-y-1 text-green-800">${project.business_analysis.opportunities.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>
              ` : ''}
              ${project.business_analysis.challenges?.length ? `
                <div class="bg-amber-50 rounded-lg p-3 md:col-span-2">
                  <h5 class="text-xs font-semibold text-amber-700 uppercase mb-2">⚠️ Výzvy</h5>
                  <ul class="text-sm space-y-1 text-amber-900">${project.business_analysis.challenges.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>
              ` : ''}
            </div>
          </div>
          ` : ''}

          ${project.research_data?.insights ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">🔎 Research insights</h4>
            <div class="space-y-3 text-sm">
              ${project.research_data.insights.market_analysis ? `<p><strong>Trh:</strong> ${project.research_data.insights.market_analysis}</p>` : ''}
              ${project.research_data.insights.competitor_analysis ? `<p><strong>Konkurencia:</strong> ${project.research_data.insights.competitor_analysis}</p>` : ''}
              ${project.research_data.insights.keyword_strategy ? `<p><strong>Keyword stratégia:</strong> ${project.research_data.insights.keyword_strategy}</p>` : ''}
              ${project.research_data.insights.recommended_approach ? `<p class="p-3 bg-blue-50 rounded-lg text-blue-900"><strong>Prístup:</strong> ${project.research_data.insights.recommended_approach}</p>` : ''}
            </div>
          </div>
          ` : ''}

          ${project.research_data?.keywords?.length ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">🔑 Top kľúčové slová (${project.research_data.keywords.length})</h4>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-xs text-gray-500 uppercase border-b"><th class="pb-2">Keyword</th><th class="pb-2">Hľadanosť</th><th class="pb-2">CPC</th></tr></thead>
                <tbody>
                  ${project.research_data.keywords.slice(0, 15).map(k => `<tr class="border-b"><td class="py-1.5">${k.keyword}</td><td class="py-1.5">${(k.search_volume || 0).toLocaleString('sk-SK')}</td><td class="py-1.5">${(k.cpc || 0).toFixed(2)}€</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : ''}

          ${project.research_data?.competitors?.length ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">⚔️ Konkurencia (${project.research_data.competitors.length})</h4>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
              ${project.research_data.competitors.map(c => `
                <div class="bg-gray-50 rounded-lg p-2 text-sm">
                  <div class="flex justify-between items-center">
                    <span class="font-medium">${c.domain}</span>
                    ${c.is_paid ? '<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 rounded">PPC</span>' : ''}
                  </div>
                  ${c.titles?.[0] ? `<div class="text-xs text-gray-500 mt-1 truncate">${c.titles[0]}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          ${project.expected_results ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">📈 Očakávané výsledky</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              ${['day_30','day_90','day_180'].map(key => {
                const r = project.expected_results[key]; if (!r) return '';
                const label = { day_30: 'Po 30 dňoch', day_90: 'Po 90 dňoch', day_180: 'Po 180 dňoch' }[key];
                return `<div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <h5 class="text-xs font-semibold text-gray-600 uppercase mb-2">${label}</h5>
                  ${r.impressions != null ? `<div class="flex justify-between py-0.5"><span>Zobrazenia</span><strong>${(r.impressions||0).toLocaleString('sk-SK')}</strong></div>` : ''}
                  ${r.clicks != null ? `<div class="flex justify-between py-0.5"><span>Kliknutia</span><strong>${(r.clicks||0).toLocaleString('sk-SK')}</strong></div>` : ''}
                  ${r.conversions != null ? `<div class="flex justify-between py-0.5"><span>Konverzie</span><strong>${r.conversions}</strong></div>` : ''}
                  ${r.cpa != null ? `<div class="flex justify-between py-0.5"><span>CPA</span><strong>${r.cpa}€</strong></div>` : ''}
                  ${r.roas != null ? `<div class="flex justify-between py-0.5"><span>ROAS</span><strong>${r.roas}x</strong></div>` : ''}
                </div>`;
              }).join('')}
            </div>
            ${project.expected_results.notes ? `<p class="text-xs text-gray-500 mt-3">${project.expected_results.notes}</p>` : ''}
          </div>
          ` : ''}

          ${project.timeline?.phases?.length ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">⏱️ Časový harmonogram</h4>
            <div class="space-y-3">
              ${project.timeline.phases.map(p => `
                <div class="flex gap-3">
                  <div class="flex-shrink-0 w-20 text-xs text-gray-500 pt-0.5">${p.duration_days} dní</div>
                  <div class="flex-1">
                    <div class="font-medium text-sm">${p.name}</div>
                    ${p.activities?.length ? `<ul class="text-xs text-gray-600 mt-1 space-y-0.5">${p.activities.map(a => `<li>• ${a}</li>`).join('')}</ul>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          ${project.next_steps ? `
          <div class="card p-4">
            <h4 class="font-semibold mb-3">📋 Ďalšie kroky</h4>
            <div class="grid md:grid-cols-3 gap-3">
              ${project.next_steps.client_needs_to_provide?.length ? `
                <div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <h5 class="text-xs font-semibold text-gray-600 uppercase mb-2">Potrebujeme od klienta</h5>
                  <ul class="space-y-1">${project.next_steps.client_needs_to_provide.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>` : ''}
              ${project.next_steps.our_next_actions?.length ? `
                <div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <h5 class="text-xs font-semibold text-gray-600 uppercase mb-2">My spravíme</h5>
                  <ul class="space-y-1">${project.next_steps.our_next_actions.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>` : ''}
              ${project.next_steps.launch_readiness?.length ? `
                <div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <h5 class="text-xs font-semibold text-gray-600 uppercase mb-2">Pred spustením</h5>
                  <ul class="space-y-1">${project.next_steps.launch_readiness.map(i => `<li>• ${i}</li>`).join('')}</ul>
                </div>` : ''}
            </div>
          </div>
          ` : ''}
        </div><!-- /tab-strategy -->

        <!-- Tab content: ONBOARDING -->
        <div data-tab-content="onboarding" class="space-y-6 hidden">
        ${onboarding ? `
        <div class="card p-4">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-semibold">📋 Onboarding dáta klienta</h4>
            <button onclick="CampaignProjectsModule.toggleOnboardingDetail()" 
              class="text-sm text-blue-600 hover:underline">
              Zobraziť/Skryť detaily
            </button>
          </div>
          
          <!-- Quick Summary -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <div class="text-lg font-bold text-gray-800">${onboarding.company_industry || '-'}</div>
              <div class="text-xs text-gray-500">Odvetvie</div>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <div class="text-lg font-bold text-gray-800">${onboarding.company_size || '-'}</div>
              <div class="text-xs text-gray-500">Veľkosť</div>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <div class="text-lg font-bold text-gray-800">${onboarding.monthly_budget_min || 0}-${onboarding.monthly_budget_max || 0}€</div>
              <div class="text-xs text-gray-500">Rozpočet</div>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <div class="text-lg font-bold text-gray-800">${onboarding.primary_goals?.length || 0}</div>
              <div class="text-xs text-gray-500">Cieľov</div>
            </div>
          </div>
          
          <!-- Expandable Details -->
          <div id="onboarding-detail" class="hidden space-y-4 pt-4 border-t">
            <!-- Company Info -->
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">🏢 O firme</h5>
              <div class="bg-gray-50 rounded-lg p-3 text-sm">
                <p><strong>Názov:</strong> ${onboarding.company_name || '-'}</p>
                <p><strong>Web:</strong> ${onboarding.company_website ? `<a href="${onboarding.company_website}" target="_blank" class="text-blue-600">${onboarding.company_website}</a>` : '-'}</p>
                <p><strong>Popis:</strong> ${onboarding.company_description || '-'}</p>
                <p><strong>Lokalita:</strong> ${onboarding.company_location || '-'}</p>
              </div>
            </div>
            
            <!-- Products -->
            ${onboarding.products_services?.length ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">📦 Produkty/Služby</h5>
              <div class="space-y-2">
                ${onboarding.products_services.map(p => `
                  <div class="bg-gray-50 rounded-lg p-3 text-sm">
                    <strong>${p.name}</strong> ${p.is_main ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Hlavný</span>' : ''}
                    <p class="text-gray-600">${p.description || ''}</p>
                    ${p.price_range ? `<p class="text-gray-500">Cena: ${p.price_range}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
            
            <!-- USPs -->
            ${onboarding.unique_selling_points?.length ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">⭐ USP (Unikátne predajné argumenty)</h5>
              <div class="flex flex-wrap gap-2">
                ${onboarding.unique_selling_points.map(u => `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">${u}</span>`).join('')}
              </div>
            </div>
            ` : ''}
            
            <!-- Target Audience -->
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">🎯 Cieľová skupina</h5>
              <div class="bg-gray-50 rounded-lg p-3 text-sm">
                <p><strong>Typ:</strong> ${onboarding.target_audience?.b2b ? 'B2B' : ''} ${onboarding.target_audience?.b2c ? 'B2C' : ''}</p>
                <p><strong>Vek:</strong> ${onboarding.target_audience?.demographics?.age_from || 18} - ${onboarding.target_audience?.demographics?.age_to || 65} rokov</p>
                <p><strong>Krajiny:</strong> ${onboarding.target_audience?.geographic?.countries?.join(', ') || 'Slovensko'}</p>
                <p><strong>Ideálny zákazník:</strong> ${onboarding.ideal_customer_description || '-'}</p>
              </div>
            </div>
            
            <!-- Goals -->
            ${onboarding.primary_goals?.length ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">🚀 Hlavné ciele</h5>
              <div class="flex flex-wrap gap-2">
                ${onboarding.primary_goals.map(g => {
                  const goalLabels = {
                    'more_sales': 'Viac predajov',
                    'leads': 'Získať leads',
                    'awareness': 'Povedomie o značke',
                    'traffic': 'Návštevnosť webu',
                    'local': 'Lokálni zákazníci',
                    'app': 'Inštalácie appky',
                    'engagement': 'Angažovanosť'
                  };
                  return `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">${goalLabels[g] || g}</span>`;
                }).join('')}
              </div>
            </div>
            ` : ''}
            
            <!-- Marketing Channels -->
            ${onboarding.current_marketing_channels?.length ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">📊 Aktuálne marketingové kanály</h5>
              <div class="flex flex-wrap gap-2">
                ${onboarding.current_marketing_channels.map(c => `<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">${c}</span>`).join('')}
              </div>
            </div>
            ` : ''}
            
            <!-- Previous Experience -->
            ${onboarding.previous_ad_experience ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">📈 Predchádzajúce skúsenosti</h5>
              <div class="bg-gray-50 rounded-lg p-3 text-sm">
                <p>${onboarding.previous_ad_experience}</p>
                ${onboarding.what_worked ? `<p class="mt-2 text-green-600"><strong>Čo fungovalo:</strong> ${onboarding.what_worked}</p>` : ''}
                ${onboarding.what_didnt_work ? `<p class="text-red-600"><strong>Čo nefungovalo:</strong> ${onboarding.what_didnt_work}</p>` : ''}
              </div>
            </div>
            ` : ''}
            
            <!-- Brand -->
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">🎨 Brand</h5>
              <div class="bg-gray-50 rounded-lg p-3 text-sm">
                <p><strong>Tón komunikácie:</strong> ${onboarding.brand_tone_of_voice || '-'}</p>
                <p><strong>Brand guidelines:</strong> ${onboarding.has_brand_guidelines ? 'Áno' : 'Nie'}</p>
                <p><strong>Materiály:</strong> 
                  ${onboarding.existing_assets?.has_photos ? '📷 Fotky' : ''} 
                  ${onboarding.existing_assets?.has_videos ? '🎬 Videá' : ''} 
                  ${onboarding.existing_assets?.has_logo ? '🎨 Logo' : ''}
                  ${!onboarding.existing_assets?.has_photos && !onboarding.existing_assets?.has_videos && !onboarding.existing_assets?.has_logo ? 'Žiadne' : ''}
                </p>
              </div>
            </div>
            
            <!-- Technical -->
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">⚙️ Technické</h5>
              <div class="flex flex-wrap gap-2">
                ${onboarding.has_google_analytics ? '<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">✅ Google Analytics</span>' : '<span class="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">❌ Google Analytics</span>'}
                ${onboarding.has_facebook_pixel ? '<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">✅ Meta Pixel</span>' : '<span class="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">❌ Meta Pixel</span>'}
                ${onboarding.has_google_ads_account ? '<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">✅ Google Ads účet</span>' : '<span class="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">❌ Google Ads účet</span>'}
                ${onboarding.has_meta_business ? '<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">✅ Meta Business</span>' : '<span class="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">❌ Meta Business</span>'}
              </div>
              <p class="mt-2 text-sm text-gray-500">Platforma webu: ${onboarding.website_platform || 'Neuvedené'}</p>
            </div>
            
            <!-- Special Notes -->
            ${onboarding.special_requirements || onboarding.questions_for_us ? `
            <div>
              <h5 class="font-medium text-sm text-gray-700 mb-2">📝 Poznámky</h5>
              <div class="bg-gray-50 rounded-lg p-3 text-sm">
                ${onboarding.special_requirements ? `<p><strong>Špeciálne požiadavky:</strong> ${onboarding.special_requirements}</p>` : ''}
                ${onboarding.questions_for_us ? `<p><strong>Otázky od klienta:</strong> ${onboarding.questions_for_us}</p>` : ''}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : `
        <div class="card p-4 bg-yellow-50 border border-yellow-200">
          <div class="flex items-center gap-3">
            <span class="text-2xl">⚠️</span>
            <div>
              <h4 class="font-semibold text-yellow-800">Chýba onboarding</h4>
              <p class="text-sm text-yellow-700">Klient ešte nevyplnil onboarding dotazník. <a href="#onboarding?client_id=${project.client_id}" class="underline">Vyplniť teraz</a></p>
            </div>
          </div>
        </div>
        `}
        </div><!-- /tab-onboarding -->

        <!-- Tab content: CAMPAIGNS -->
        <div data-tab-content="campaigns" class="space-y-6 hidden">
        <!-- Kampane - Hierarchické zobrazenie podľa platforiem -->
        <div class="card p-4">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-semibold">📣 Kampane (${campaigns?.length || 0})</h4>
            ${project.status === 'draft' || project.status === 'revision' ? `
            <button onclick="CampaignProjectsModule.addCampaign('${project.id}')"
              class="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">
              ➕ Pridať
            </button>
            ` : ''}
          </div>

          ${campaigns && campaigns.length > 0 ?
            this.renderCampaignsByPlatform(campaigns, project.id)
          : `
          <div class="text-center py-8 text-gray-400">
            <div class="text-4xl mb-2">📣</div>
            <p>Zatiaľ žiadne kampane</p>
            ${project.status === 'draft' ? '<p class="text-sm mt-2">Spustite AI generovanie pre vytvorenie kampaní</p>' : ''}
          </div>
          `}
        </div>
        </div><!-- /tab-campaigns -->

        <!-- Tab content: DEPLOYMENT -->
        <div data-tab-content="deployment" class="space-y-6 hidden">
          ${['approved', 'deploying', 'active'].includes(project.status)
            ? this.renderDeploymentChecklist(project, campaigns)
            : '<div class="text-gray-400 text-sm text-center py-8">Deployment bude dostupný po schválení klientom</div>'}
        </div><!-- /tab-deployment -->

        <!-- Actions -->
        <div class="flex flex-wrap gap-3 pt-4 border-t">
          ${this.renderDetailActions(project)}
        </div>
      </div>
    `;
  },

  switchTab(tabName) {
    document.querySelectorAll('[data-tab-content]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.tabContent !== tabName);
    });
    document.querySelectorAll('[data-tab-btn]').forEach(el => {
      const active = el.dataset.tabBtn === tabName;
      el.classList.toggle('border-purple-600', active);
      el.classList.toggle('text-purple-700', active);
      el.classList.toggle('border-transparent', !active);
      el.classList.toggle('text-gray-600', !active);
    });
  },
  
  // Deployment checklist definition
  DEPLOYMENT_CHECKLIST: {
    google: {
      name: 'Google Ads',
      icon: '🔍',
      items: [
        { id: 'google_access', label: 'Získať prístup ku Google Ads účtu klienta' },
        { id: 'google_billing', label: 'Nastaviť fakturačné údaje' },
        { id: 'google_ga4', label: 'Prepojiť s Google Analytics 4' },
        { id: 'google_tag', label: 'Nainštalovať Google Tag na web' },
        { id: 'google_conversions', label: 'Nastaviť konverzné akcie' },
        { id: 'google_campaign', label: 'Vytvoriť kampaň podľa návrhu' },
        { id: 'google_keywords', label: 'Pridať kľúčové slová + negatívne' },
        { id: 'google_ads', label: 'Vytvoriť responsive search ads' },
        { id: 'google_extensions', label: 'Pridať rozšírenia (sitelinks, callouts)' },
        { id: 'google_launch', label: 'Spustiť kampaň' },
        { id: 'google_id', label: 'Uložiť Campaign ID do Adlify' }
      ]
    },
    meta: {
      name: 'Meta Ads',
      icon: '📘',
      items: [
        { id: 'meta_access', label: 'Získať prístup k Business Manager' },
        { id: 'meta_domain', label: 'Overiť doménu klienta' },
        { id: 'meta_pixel', label: 'Nainštalovať Meta Pixel' },
        { id: 'meta_capi', label: 'Nastaviť Conversions API (voliteľné)' },
        { id: 'meta_audience', label: 'Vytvoriť Custom Audiences' },
        { id: 'meta_campaign', label: 'Vytvoriť kampaň podľa návrhu' },
        { id: 'meta_targeting', label: 'Nastaviť targeting a placements' },
        { id: 'meta_creatives', label: 'Vytvoriť ads (image/video/carousel)' },
        { id: 'meta_utm', label: 'Pridať UTM parametre' },
        { id: 'meta_launch', label: 'Publikovať kampaň' },
        { id: 'meta_id', label: 'Uložiť Campaign ID do Adlify' }
      ]
    },
    linkedin: {
      name: 'LinkedIn Ads',
      icon: '💼',
      items: [
        { id: 'linkedin_access', label: 'Získať prístup ku Campaign Manager' },
        { id: 'linkedin_insight', label: 'Nainštalovať LinkedIn Insight Tag' },
        { id: 'linkedin_campaign', label: 'Vytvoriť kampaň podľa návrhu' },
        { id: 'linkedin_targeting', label: 'Nastaviť B2B targeting' },
        { id: 'linkedin_ads', label: 'Vytvoriť sponsored content' },
        { id: 'linkedin_launch', label: 'Spustiť kampaň' },
        { id: 'linkedin_id', label: 'Uložiť Campaign ID do Adlify' }
      ]
    },
    tiktok: {
      name: 'TikTok Ads',
      icon: '🎵',
      items: [
        { id: 'tiktok_access', label: 'Vytvoriť TikTok Business účet' },
        { id: 'tiktok_pixel', label: 'Nainštalovať TikTok Pixel' },
        { id: 'tiktok_campaign', label: 'Vytvoriť kampaň podľa návrhu' },
        { id: 'tiktok_targeting', label: 'Nastaviť targeting' },
        { id: 'tiktok_creatives', label: 'Vytvoriť video ads' },
        { id: 'tiktok_launch', label: 'Spustiť kampaň' },
        { id: 'tiktok_id', label: 'Uložiť Campaign ID do Adlify' }
      ]
    }
  },
  
  renderDeploymentChecklist(project, campaigns) {
    const checklist = project.deployment_checklist || {};
    
    // Zisti ktoré platformy sú v kampaniach
    const platforms = [...new Set(campaigns.map(c => {
      if (c.platform?.includes('google')) return 'google';
      if (c.platform?.includes('meta')) return 'meta';
      if (c.platform?.includes('linkedin')) return 'linkedin';
      if (c.platform?.includes('tiktok')) return 'tiktok';
      return null;
    }).filter(Boolean))];
    
    if (platforms.length === 0) return '';
    
    // Spočítaj progress
    let totalItems = 0;
    let completedItems = 0;
    platforms.forEach(p => {
      const items = this.DEPLOYMENT_CHECKLIST[p]?.items || [];
      totalItems += items.length;
      completedItems += items.filter(i => checklist[i.id]).length;
    });
    
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    
    return `
      <div class="card p-4 mt-4 border-2 ${progress === 100 ? 'border-green-300 bg-green-50' : 'border-orange-200 bg-orange-50'}">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-semibold flex items-center gap-2">
            📋 Deployment Checklist
            <span class="text-sm font-normal text-gray-500">(${completedItems}/${totalItems})</span>
          </h4>
          <div class="flex items-center gap-3">
            <div class="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full ${progress === 100 ? 'bg-green-500' : 'bg-orange-500'} transition-all" 
                style="width: ${progress}%"></div>
            </div>
            <span class="text-sm font-bold ${progress === 100 ? 'text-green-600' : 'text-orange-600'}">${progress}%</span>
          </div>
        </div>
        
        <div class="space-y-4">
          ${platforms.map(platform => {
            const config = this.DEPLOYMENT_CHECKLIST[platform];
            if (!config) return '';
            
            const platformCompleted = config.items.filter(i => checklist[i.id]).length;
            const platformTotal = config.items.length;
            
            return `
              <div class="bg-white rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                  <h5 class="font-medium flex items-center gap-2">
                    <span class="text-xl">${config.icon}</span>
                    ${config.name}
                  </h5>
                  <span class="text-xs px-2 py-1 rounded-full ${platformCompleted === platformTotal ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                    ${platformCompleted}/${platformTotal}
                  </span>
                </div>
                <div class="space-y-2">
                  ${config.items.map(item => `
                    <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer group">
                      <input type="checkbox" 
                        ${checklist[item.id] ? 'checked' : ''} 
                        onchange="CampaignProjectsModule.toggleChecklistItem('${project.id}', '${item.id}', this.checked)"
                        class="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500">
                      <span class="${checklist[item.id] ? 'line-through text-gray-400' : 'text-gray-700'}">${item.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        ${project.deployment_notes ? `
          <div class="mt-4 p-3 bg-white rounded-lg">
            <h5 class="font-medium text-sm text-gray-600 mb-1">📝 Poznámky</h5>
            <p class="text-gray-700">${project.deployment_notes}</p>
          </div>
        ` : ''}
        
        <div class="mt-4 flex gap-2">
          <button onclick="CampaignProjectsModule.addDeploymentNote('${project.id}')"
            class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            📝 Pridať poznámku
          </button>
          ${progress === 100 ? `
            <button onclick="CampaignProjectsModule.markAsDeployed('${project.id}')"
              class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              ✅ Označiť ako nasadené
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  async toggleChecklistItem(projectId, itemId, checked) {
    try {
      const project = this.projects.find(p => p.id === projectId);
      if (!project) return;
      
      const checklist = { ...project.deployment_checklist } || {};
      checklist[itemId] = checked;
      
      const { error } = await Database.client
        .from('campaign_projects')
        .update({ deployment_checklist: checklist })
        .eq('id', projectId);
      
      if (error) throw error;
      
      // Update local data
      project.deployment_checklist = checklist;
      
      // Refresh checklist display
      if (this.selectedProject?.id === projectId) {
        this.selectedProject.deployment_checklist = checklist;
        const { data: campaigns } = await Database.client
          .from('campaigns')
          .select('*')
          .eq('project_id', projectId);
        
        const checklistContainer = document.querySelector('.card.border-2');
        if (checklistContainer) {
          checklistContainer.outerHTML = this.renderDeploymentChecklist(project, campaigns || []);
        }
      }
      
    } catch (error) {
      console.error('Toggle checklist error:', error);
      Utils.toast('Chyba pri ukladaní', 'error');
    }
  },
  
  async addDeploymentNote(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    const currentNote = project?.deployment_notes || '';
    
    const note = prompt('Poznámka k nasadeniu:', currentNote);
    if (note === null) return;
    
    try {
      const { error } = await Database.client
        .from('campaign_projects')
        .update({ deployment_notes: note })
        .eq('id', projectId);
      
      if (error) throw error;
      
      project.deployment_notes = note;
      if (this.selectedProject?.id === projectId) {
        this.selectedProject.deployment_notes = note;
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(project);
      }
      
      Utils.toast('Poznámka uložená', 'success');
    } catch (error) {
      console.error('Add note error:', error);
      Utils.toast('Chyba pri ukladaní', 'error');
    }
  },
  
  async markAsDeployed(projectId) {
    if (!await Utils.confirm('Projekt bude označený ako nasadený a kampane sa spustia.', { title: 'Nasadiť projekt', type: 'success', confirmText: 'Nasadiť', cancelText: 'Zrušiť' })) return;
    
    try {
      const { error } = await Database.client
        .from('campaign_projects')
        .update({ 
          status: 'active',
          actual_start_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', projectId);
      
      if (error) throw error;
      
      // Update local
      const project = this.projects.find(p => p.id === projectId);
      if (project) {
        project.status = 'active';
      }
      
      Utils.toast('🚀 Projekt nasadený a aktívny!', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
    } catch (error) {
      console.error('Mark deployed error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  toggleOnboardingDetail() {
    const detail = document.getElementById('onboarding-detail');
    if (detail) {
      detail.classList.toggle('hidden');
    }
  },
  
  // ==========================================
  // CAMPAIGN DISPLAY - BY PLATFORM
  // ==========================================
  
  renderCampaignsByPlatform(campaigns, projectId) {
    const platformConfig = {
      'google': { 
        name: 'Google Ads', 
        icon: '🔍', 
        color: 'blue',
        gradient: 'from-blue-500 to-blue-600',
        types: ['Search', 'Display', 'Shopping', 'Performance Max', 'Video']
      },
      'meta': { 
        name: 'Meta Ads', 
        icon: '📘', 
        color: 'indigo',
        gradient: 'from-blue-600 to-purple-600',
        types: ['Traffic', 'Conversions', 'Lead Generation', 'Awareness', 'Engagement']
      },
      'tiktok': { 
        name: 'TikTok Ads', 
        icon: '🎵', 
        color: 'slate',
        gradient: 'from-slate-700 to-slate-900',
        types: ['In-Feed', 'TopView', 'Branded Hashtag']
      },
      'linkedin': { 
        name: 'LinkedIn Ads', 
        icon: '💼', 
        color: 'sky',
        gradient: 'from-sky-600 to-sky-700',
        types: ['Sponsored Content', 'Message Ads', 'Text Ads']
      }
    };
    
    // Group campaigns by platform
    const grouped = {};
    campaigns.forEach(c => {
      const platform = c.platform || 'other';
      if (!grouped[platform]) grouped[platform] = [];
      grouped[platform].push(c);
    });
    
    // Render platforms in order
    const platformOrder = ['google', 'meta', 'tiktok', 'linkedin', 'other'];
    
    return platformOrder
      .filter(p => grouped[p]?.length > 0)
      .map(platform => {
        const config = platformConfig[platform] || { 
          name: 'Ostatné', 
          icon: '📣', 
          color: 'gray',
          gradient: 'from-gray-500 to-gray-600'
        };
        const platformCampaigns = grouped[platform];
        
        return `
          <div class="mb-6 last:mb-0">
            <!-- Platform Header -->
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white text-xl">
                ${config.icon}
              </div>
              <div>
                <h5 class="font-bold text-gray-800">${config.name}</h5>
                <span class="text-xs text-gray-500">${platformCampaigns.length} kampaní</span>
              </div>
            </div>
            
            <!-- Platform Campaigns -->
            <div class="ml-4 border-l-2 border-${config.color}-200 pl-4 space-y-4">
              ${platformCampaigns.map(campaign => this.renderCampaignCard(campaign, config)).join('')}
            </div>
          </div>
        `;
      }).join('');
  },
  
  renderCampaignCard(campaign, platformConfig) {
    const status = this.STATUSES[campaign.status] || this.STATUSES.draft;
    const estimated = campaign.metrics?.estimated || {};
    const targeting = campaign.targeting || {};
    
    return `
      <div class="bg-white border rounded-xl overflow-hidden shadow-sm" id="campaign-card-${campaign.id}">
        <!-- Campaign Header -->
        <div class="p-4 bg-gradient-to-r ${platformConfig.gradient} text-white cursor-pointer"
          onclick="CampaignProjectsModule.toggleCampaignExpand('${campaign.id}')">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-semibold">${campaign.name}</span>
                <span class="px-2 py-0.5 rounded text-xs bg-white/20">${campaign.campaign_type || 'Kampaň'}</span>
              </div>
              <div class="flex items-center gap-4 mt-1 text-sm text-white/80">
                <span>💰 ${campaign.budget_daily || 0}€/deň</span>
                <span>🎯 ${campaign.objective || 'conversions'}</span>
                ${campaign.ai_generated ? '<span>🤖 AI</span>' : ''}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 rounded text-xs bg-white/20">${status.icon} ${status.label}</span>
              <span class="text-xl transition-transform" id="expand-arrow-${campaign.id}">▼</span>
            </div>
          </div>
        </div>
        
        <!-- Campaign Details (expandable) -->
        <div id="campaign-expand-${campaign.id}" class="hidden">
          <!-- Quick Stats -->
          <div class="p-4 bg-gray-50 border-b grid grid-cols-2 md:grid-cols-4 gap-3">
            ${targeting.locations?.length ? `
              <div class="text-center">
                <div class="text-xs text-gray-500">📍 Lokality</div>
                <div class="font-medium text-sm">${targeting.locations.slice(0,2).join(', ')}${targeting.locations.length > 2 ? '...' : ''}</div>
              </div>
            ` : ''}
            ${targeting.age_range ? `
              <div class="text-center">
                <div class="text-xs text-gray-500">👥 Vek</div>
                <div class="font-medium text-sm">${targeting.age_range.min}-${targeting.age_range.max}</div>
              </div>
            ` : ''}
            ${estimated.clicks ? `
              <div class="text-center">
                <div class="text-xs text-gray-500">👆 Kliknutia</div>
                <div class="font-medium text-sm">${estimated.clicks}</div>
              </div>
            ` : ''}
            ${estimated.cpa ? `
              <div class="text-center">
                <div class="text-xs text-gray-500">💵 CPA</div>
                <div class="font-medium text-sm">${estimated.cpa}</div>
              </div>
            ` : ''}
          </div>
          
          <!-- Keywords (if any) -->
          ${targeting.keywords?.length ? `
            <div class="p-4 border-b">
              <div class="text-xs text-gray-500 mb-2">🔑 Kľúčové slová</div>
              <div class="flex flex-wrap gap-1">
                ${targeting.keywords.slice(0, 15).map(k => `
                  <span class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">${k}</span>
                `).join('')}
                ${targeting.keywords.length > 15 ? `<span class="px-2 py-1 text-gray-400 text-xs">+${targeting.keywords.length - 15}</span>` : ''}
              </div>
            </div>
          ` : ''}
          
          <!-- Interests (if any) -->
          ${targeting.interests?.length ? `
            <div class="p-4 border-b">
              <div class="text-xs text-gray-500 mb-2">❤️ Záujmy</div>
              <div class="flex flex-wrap gap-1">
                ${targeting.interests.map(i => `
                  <span class="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">${i}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- Ad Groups & Ads -->
          <div class="p-4" id="adgroups-container-${campaign.id}">
            <div class="text-center py-4 text-gray-400">
              <div class="animate-spin inline-block">⏳</div> Načítavam reklamné skupiny...
            </div>
          </div>
          
          <!-- Campaign Actions -->
          <div class="p-3 bg-gray-50 border-t flex gap-2 flex-wrap">
            <button onclick="event.stopPropagation(); CampaignProjectsModule.editCampaign('${campaign.id}')" 
              class="px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
              ✏️ Upraviť
            </button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.addAdGroup('${campaign.id}')" 
              class="px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
              ➕ Ad Group
            </button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.duplicateCampaign('${campaign.id}')" 
              class="px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
              📋 Duplikovať
            </button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.deleteCampaign('${campaign.id}')" 
              class="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100 flex items-center gap-1 ml-auto">
              🗑️ Zmazať
            </button>
          </div>
        </div>
      </div>
    `;
  },
  
  async toggleCampaignExpand(campaignId) {
    const expandDiv = document.getElementById(`campaign-expand-${campaignId}`);
    const arrow = document.getElementById(`expand-arrow-${campaignId}`);
    
    if (expandDiv.classList.contains('hidden')) {
      expandDiv.classList.remove('hidden');
      arrow.style.transform = 'rotate(180deg)';
      
      // Load ad groups with all ads
      await this.loadAdGroupsWithAds(campaignId);
    } else {
      expandDiv.classList.add('hidden');
      arrow.style.transform = 'rotate(0deg)';
    }
  },
  
  async loadAdGroupsWithAds(campaignId) {
    const container = document.getElementById(`adgroups-container-${campaignId}`);
    
    try {
      // Load ad groups
      const { data: adGroups } = await Database.client
        .from('ad_groups')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at');
      
      if (!adGroups || adGroups.length === 0) {
        container.innerHTML = `
          <div class="text-center py-6 text-gray-400">
            <div class="text-3xl mb-2">📁</div>
            <p class="text-sm">Žiadne reklamné skupiny</p>
            <button onclick="CampaignProjectsModule.addAdGroup('${campaignId}')" 
              class="mt-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">
              ➕ Pridať Ad Group
            </button>
          </div>
        `;
        return;
      }
      
      // Load ALL ads for these ad groups
      const adGroupIds = adGroups.map(ag => ag.id);
      const { data: ads } = await Database.client
        .from('ads')
        .select('*')
        .in('ad_group_id', adGroupIds)
        .order('created_at');
      
      // Group ads by ad_group_id
      const adsByGroup = {};
      (ads || []).forEach(ad => {
        if (!adsByGroup[ad.ad_group_id]) adsByGroup[ad.ad_group_id] = [];
        adsByGroup[ad.ad_group_id].push(ad);
      });
      
      container.innerHTML = `
        <div class="space-y-4">
          ${adGroups.map(ag => this.renderAdGroupWithAds(ag, adsByGroup[ag.id] || [], campaignId)).join('')}
        </div>
      `;
      
    } catch (error) {
      console.error('Load ad groups error:', error);
      container.innerHTML = `
        <div class="text-center py-4 text-red-500">
          <p>❌ Chyba pri načítaní: ${error.message}</p>
        </div>
      `;
    }
  },
  
  renderAdGroupWithAds(adGroup, ads, campaignId) {
    const adTypeIcons = {
      'responsive': '📝',
      'text': '📝',
      'image': '🖼️',
      'video': '🎬',
      'carousel': '🎠'
    };
    
    return `
      <div class="border rounded-lg overflow-hidden">
        <!-- Ad Group Header -->
        <div class="p-3 bg-purple-50 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">📁</span>
            <div>
              <span class="font-medium">${adGroup.name}</span>
              <span class="text-xs text-gray-500 ml-2">${ads.length} reklám</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="event.stopPropagation(); CampaignProjectsModule.editAdGroup('${adGroup.id}')" 
              class="p-1.5 hover:bg-purple-100 rounded" title="Upraviť">✏️</button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.addAd('${adGroup.id}')" 
              class="p-1.5 hover:bg-purple-100 rounded" title="Pridať reklamu">➕</button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.deleteAdGroup('${adGroup.id}')" 
              class="p-1.5 hover:bg-red-100 rounded text-red-500" title="Zmazať">🗑️</button>
          </div>
        </div>
        
        <!-- Keywords -->
        ${adGroup.keywords?.length ? `
          <div class="px-3 py-2 border-b bg-gray-50">
            <div class="flex flex-wrap gap-1">
              ${adGroup.keywords.slice(0, 8).map(k => `
                <span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">${k}</span>
              `).join('')}
              ${adGroup.keywords.length > 8 ? `<span class="text-xs text-gray-400">+${adGroup.keywords.length - 8}</span>` : ''}
            </div>
          </div>
        ` : ''}
        
        <!-- Ads List -->
        <div class="divide-y">
          ${ads.length > 0 ? ads.map(ad => this.renderAdItem(ad)).join('') : `
            <div class="p-4 text-center text-gray-400 text-sm">
              <p>Žiadne reklamy</p>
              <button onclick="CampaignProjectsModule.addAd('${adGroup.id}')" 
                class="mt-1 text-purple-600 hover:underline text-xs">➕ Pridať reklamu</button>
            </div>
          `}
        </div>
      </div>
    `;
  },
  
  renderAdItem(ad) {
    const typeConfig = {
      'responsive': { icon: '📝', label: 'Responsive', color: 'blue' },
      'text': { icon: '📝', label: 'Textová', color: 'gray' },
      'image': { icon: '🖼️', label: 'Obrázková', color: 'green' },
      'video': { icon: '🎬', label: 'Video', color: 'red' },
      'carousel': { icon: '🎠', label: 'Carousel', color: 'purple' }
    };
    
    const config = typeConfig[ad.ad_type] || typeConfig.text;
    const headlines = ad.headlines || [];
    const descriptions = ad.descriptions || [];
    
    return `
      <div class="p-3 hover:bg-gray-50 group">
        <div class="flex items-start gap-3">
          <!-- Type Badge -->
          <div class="w-8 h-8 rounded-lg bg-${config.color}-100 flex items-center justify-center text-sm flex-shrink-0">
            ${config.icon}
          </div>
          
          <!-- Ad Content -->
          <div class="flex-1 min-w-0">
            <!-- Headlines -->
            <div class="font-medium text-blue-600 text-sm">
              ${headlines[0] || 'Bez nadpisu'}
            </div>
            ${headlines.length > 1 ? `
              <div class="text-xs text-gray-400 mt-0.5">
                +${headlines.length - 1} ďalších nadpisov
              </div>
            ` : ''}
            
            <!-- Description -->
            <div class="text-gray-600 text-xs mt-1 line-clamp-2">
              ${descriptions[0] || 'Bez popisu'}
            </div>
            
            <!-- Meta -->
            <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span class="px-1.5 py-0.5 bg-${config.color}-50 text-${config.color}-600 rounded">${config.label}</span>
              ${ad.call_to_action ? `<span>CTA: ${ad.call_to_action}</span>` : ''}
              ${ad.landing_page ? `<span class="truncate max-w-[150px]">🔗 ${new URL(ad.landing_page).hostname}</span>` : ''}
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onclick="event.stopPropagation(); CampaignProjectsModule.editAd('${ad.id}')" 
              class="p-1.5 hover:bg-gray-200 rounded" title="Upraviť">✏️</button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.duplicateAd('${ad.id}')" 
              class="p-1.5 hover:bg-gray-200 rounded" title="Duplikovať">📋</button>
            <button onclick="event.stopPropagation(); CampaignProjectsModule.deleteAd('${ad.id}')" 
              class="p-1.5 hover:bg-red-100 rounded text-red-500" title="Zmazať">🗑️</button>
          </div>
        </div>
        
        <!-- Preview all headlines on hover (optional) -->
        ${headlines.length > 1 ? `
          <div class="mt-2 pt-2 border-t hidden group-hover:block">
            <div class="text-xs text-gray-500 mb-1">Všetky nadpisy:</div>
            <div class="flex flex-wrap gap-1">
              ${headlines.map(h => `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">${h}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },
  
  renderWorkflowProgress(currentStatus) {
    const steps = [
      { key: 'draft', label: 'Návrh' },
      { key: 'generating', label: 'AI' },
      { key: 'internal_review', label: 'Kontrola' },
      { key: 'client_review', label: 'Klient' },
      { key: 'approved', label: 'Schválené' },
      { key: 'active', label: 'Aktívne' }
    ];
    
    const currentIndex = steps.findIndex(s => s.key === currentStatus);
    
    return steps.map((step, index) => {
      let classes = 'flex-1 text-center py-2 px-1 text-xs font-medium rounded workflow-step ';
      
      if (index < currentIndex) {
        classes += 'completed';
      } else if (index === currentIndex) {
        classes += 'active';
      } else {
        classes += 'bg-gray-100 text-gray-400';
      }
      
      return `<div class="${classes}">${step.label}</div>`;
    }).join('');
  },
  
  async duplicateCampaign(campaignId) {
    try {
      // Get original campaign
      const { data: original, error: fetchError } = await Database.client
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Create copy
      const { id, created_at, external_id, ...campaignData } = original;
      const { data: newCampaign, error } = await Database.client
        .from('campaigns')
        .insert({
          ...campaignData,
          name: `${original.name} (kópia)`,
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      Utils.toast('Kampaň duplikovaná! ✅', 'success');
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Duplicate campaign error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteCampaign(campaignId) {
    if (!await Utils.confirm('Zmažú sa aj všetky reklamné skupiny a reklamy v tejto kampani.', { title: 'Zmazať kampaň', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      // Delete all ads in all ad groups of this campaign
      const { data: adGroups } = await Database.client
        .from('ad_groups')
        .select('id')
        .eq('campaign_id', campaignId);
      
      if (adGroups?.length) {
        const adGroupIds = adGroups.map(ag => ag.id);
        await Database.client.from('ads').delete().in('ad_group_id', adGroupIds);
      }
      
      // Delete all ad groups
      await Database.client.from('ad_groups').delete().eq('campaign_id', campaignId);
      
      // Delete campaign
      const { error } = await Database.client.from('campaigns').delete().eq('id', campaignId);
      if (error) throw error;
      
      Utils.toast('Kampaň zmazaná', 'success');
      
      // Refresh detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
    } catch (error) {
      console.error('Delete campaign error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  renderDetailActions(project) {
    const actions = [];
    
    // Status dropdown
    actions.push(`
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-500">Status:</label>
        <select onchange="CampaignProjectsModule.changeStatus('${project.id}', this.value)" 
          class="p-2 border rounded-lg text-sm font-medium">
          ${Object.entries(this.STATUSES).map(([key, val]) => `
            <option value="${key}" ${project.status === key ? 'selected' : ''}>
              ${val.icon} ${val.label}
            </option>
          `).join('')}
        </select>
      </div>
    `);
    
    // Divider
    actions.push('<div class="border-l h-8 mx-2"></div>');
    
    // Always show edit
    actions.push(`
      <button onclick="CampaignProjectsModule.editProject('${project.id}')" 
        class="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
        ✏️ Upraviť
      </button>
    `);
    
    // Status-specific actions
    switch (project.status) {
      case 'draft':
        actions.push(`
          <button onclick="CampaignProjectsModule.startGeneration('${project.id}')" 
            class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
            🤖 Spustiť AI generovanie
          </button>
        `);
        break;
        
      case 'internal_review':
        actions.push(`
          <button onclick="CampaignProjectsModule.requestRevision('${project.id}')" 
            class="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200">
            ✏️ Požiadať o revíziu
          </button>
          <button onclick="CampaignProjectsModule.approveInternal('${project.id}')" 
            class="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
            ✅ Schváliť pre klienta
          </button>
        `);
        break;
        
      case 'client_review':
        actions.push(`
          <button onclick="CampaignProjectsModule.generateClientLink('${project.id}')" 
            class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
            🔗 ${project.client_portal_token ? 'Kopírovať odkaz' : 'Generovať odkaz pre klienta'}
          </button>
          <button onclick="CampaignProjectsModule.sendProposalToClient('${project.id}')" 
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            ${!project.client_portal_token ? 'disabled title="Najprv vygenerujte odkaz"' : ''}>
            📧 Poslať klientovi email
          </button>
          <button onclick="CampaignProjectsModule.previewAsClient('${project.id}')" 
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            ${!project.client_portal_token ? 'disabled title="Najprv vygenerujte odkaz"' : ''}>
            👁️ Náhľad portálu
          </button>
        `);
        break;
        
      case 'approved':
        actions.push(`
          <button onclick="CampaignProjectsModule.deployProject('${project.id}')" 
            class="px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90">
            🚀 Nasadiť kampane
          </button>
        `);
        break;
        
      case 'active':
        actions.push(`
          <button onclick="CampaignProjectsModule.pauseProject('${project.id}')" 
            class="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200">
            ⏸️ Pozastaviť
          </button>
          <button onclick="CampaignProjectsModule.viewReport('${project.id}')" 
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
            📊 Report
          </button>
        `);
        break;
        
      case 'paused':
        actions.push(`
          <button onclick="CampaignProjectsModule.resumeProject('${project.id}')" 
            class="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
            ▶️ Obnoviť
          </button>
        `);
        break;
    }
    
    // Delete always at the end
    actions.push(`
      <button onclick="CampaignProjectsModule.deleteProject('${project.id}')" 
        class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 ml-auto">
        🗑️ Zmazať
      </button>
    `);
    
    return actions.join('');
  },
  
  async changeStatus(projectId, newStatus) {
    if (await this.updateStatus(projectId, newStatus)) {
      Utils.toast(`Status zmenený na: ${this.STATUSES[newStatus]?.label || newStatus}`, 'success');
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
      // Update detail if open
      if (this.selectedProject?.id === projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
          this.selectedProject = project;
          document.getElementById('detail-content').innerHTML = await this.renderDetailContent(project);
        }
      }
    }
  },
  
  async resumeProject(projectId) {
    if (await this.updateStatus(projectId, 'active')) {
      Utils.toast('Projekt obnovený', 'success');
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
      if (this.selectedProject?.id === projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
          this.selectedProject = project;
          document.getElementById('detail-content').innerHTML = await this.renderDetailContent(project);
        }
      }
    }
  },
  
  // ==========================================
  // CRUD OPERATIONS
  // ==========================================
  
  async createProject() {
    const clientId = document.getElementById('create-client').value;
    const name = document.getElementById('create-name').value.trim();
    const description = document.getElementById('create-description').value.trim();
    const adBudget = parseFloat(document.getElementById('create-ad-budget').value) || 0;
    const fee = parseFloat(document.getElementById('create-fee').value) || 0;
    const startDate = document.getElementById('create-start-date').value;
    const endDate = document.getElementById('create-end-date').value;
    
    if (!clientId || !name) {
      Utils.toast('Vyplň klienta a názov projektu', 'warning');
      return;
    }
    
    try {
      const { data, error } = await Database.client.from('campaign_projects').insert({
        client_id: clientId,
        name: name,
        description: description || null,
        ad_spend_budget: adBudget,
        management_fee: fee,
        total_monthly_budget: adBudget + fee,
        planned_start_date: startDate || null,
        planned_end_date: endDate || null,
        status: 'draft'
      }).select().single();
      
      if (error) throw error;
      
      Utils.toast('Projekt vytvorený!', 'success');
      this.closeCreateModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
    } catch (error) {
      console.error('Create error:', error);
      Utils.toast('Chyba pri vytváraní: ' + error.message, 'error');
    }
  },
  
  async deleteProject(projectId) {
    if (!await Utils.confirm('Naozaj chcete zmazať tento projekt? Všetky kampane a dáta budú stratené.', { title: 'Zmazať projekt', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) {
      return;
    }
    
    try {
      const { error } = await Database.client.from('campaign_projects').delete().eq('id', projectId);
      if (error) throw error;
      
      Utils.toast('Projekt zmazaný', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
    } catch (error) {
      console.error('Delete error:', error);
      Utils.toast('Chyba pri mazaní: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // WORKFLOW ACTIONS
  // ==========================================
  
  async updateStatus(projectId, newStatus, additionalData = {}) {
    try {
      const { error } = await Database.client
        .from('campaign_projects')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...additionalData
        })
        .eq('id', projectId);
      
      if (error) throw error;
      
      // Log to approval history
      await Database.client.from('approval_history').insert({
        entity_type: 'project',
        entity_id: projectId,
        action: 'status_change',
        to_status: newStatus,
        performer_type: 'admin'
      });
      
      return true;
    } catch (error) {
      console.error('Status update error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
      return false;
    }
  },
  
  async startGeneration(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    
    // Get onboarding_id for this client
    const { data: onboarding } = await Database.client
      .from('onboarding_responses')
      .select('id')
      .eq('client_id', project.client_id)
      .eq('status', 'submitted')
      .single();
    
    if (!onboarding) {
      Utils.toast('Klient nemá vyplnený onboarding dotazník!', 'warning');
      return;
    }
    
    Utils.toast('Spúšťam AI generovanie... Môže trvať 30-60 sekúnd.', 'info');
    
    // Update UI immediately
    if (await this.updateStatus(projectId, 'generating')) {
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      
      try {
        // Call Edge Function
        const { data: { session } } = await Database.client.auth.getSession();
        const token = session?.access_token || Config.SUPABASE_ANON_KEY;
        
        const response = await fetch(
          'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/generate-campaigns',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              project_id: projectId,
              onboarding_id: onboarding.id,
              platforms: ['google_search', 'meta_facebook']
            })
          }
        );
        
        const result = await response.json();
        
        if (result.success) {
          Utils.toast(`AI vygenerovalo ${result.campaigns_generated} kampaní! 🎉`, 'success');
          
          // Refresh data
          await this.loadData();
          document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
          
          // Update detail modal if open
          if (this.selectedProject?.id === projectId) {
            const updatedProject = this.projects.find(p => p.id === projectId);
            if (updatedProject) {
              document.getElementById('detail-content').innerHTML = await this.renderDetailContent(updatedProject);
            }
          }
        } else {
          throw new Error(result.error || 'Neznáma chyba');
        }
        
      } catch (error) {
        console.error('AI generation error:', error);
        Utils.toast('Chyba pri generovaní: ' + error.message, 'error');
        
        // Revert status
        await this.updateStatus(projectId, 'draft');
        await this.loadData();
        document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      }
    }
  },
  
  async approveInternal(projectId) {
    if (await this.updateStatus(projectId, 'client_review', {
      internal_approved_at: new Date().toISOString()
    })) {
      Utils.toast('Projekt schválený pre klienta', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
    }
  },
  
  async requestRevision(projectId) {
    const reason = prompt('Dôvod revízie:');
    if (!reason) return;
    
    if (await this.updateStatus(projectId, 'revision', {
      internal_notes: reason,
      revision_count: (this.selectedProject?.revision_count || 0) + 1
    })) {
      Utils.toast('Projekt vrátený na revíziu', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
    }
  },
  
  async simulateClientApproval(projectId) {
    if (await this.updateStatus(projectId, 'approved', {
      client_approved_at: new Date().toISOString()
    })) {
      Utils.toast('Klient schválil projekt!', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
    }
  },
  
  async deployProject(projectId) {
    Utils.toast('Nasadzovanie kampaní...', 'info');
    
    if (await this.updateStatus(projectId, 'deploying')) {
      // TODO: Export to Google/Meta APIs
      setTimeout(async () => {
        await this.updateStatus(projectId, 'active', {
          actual_start_date: new Date().toISOString().split('T')[0]
        });
        Utils.toast('Kampane nasadené!', 'success');
        this.closeDetailModal();
        await this.loadData();
        document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
      }, 2000);
    }
  },
  
  async pauseProject(projectId) {
    if (await this.updateStatus(projectId, 'paused')) {
      Utils.toast('Projekt pozastavený', 'success');
      this.closeDetailModal();
      await this.loadData();
      document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
    }
  },
  
  // ==========================================
  // PLACEHOLDER FUNCTIONS
  // ==========================================
  
  editProject(projectId) {
    Utils.toast('Editácia projektu - pripravuje sa', 'info');
  },
  
  addCampaign(projectId) {
    Utils.toast('Pridanie kampane - pripravuje sa', 'info');
  },
  
  previewAsClient(projectId) {
    // Open client portal proposal in new tab
    const project = this.projects.find(p => p.id === projectId);
    if (project?.client_portal_token) {
      window.open(`/portal/proposal.html?t=${project.client_portal_token}`, '_blank');
    } else {
      Utils.toast('Najprv vygenerujte odkaz pre klienta', 'warning');
    }
  },
  
  async generateClientLink(projectId) {
    const token = 'cp_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    try {
      const { error } = await Database.client
        .from('campaign_projects')
        .update({ client_portal_token: token })
        .eq('id', projectId);
      
      if (error) throw error;
      
      const url = `${window.location.origin}/portal/proposal.html?t=${token}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(url);

      Utils.toast('Odkaz skopírovaný do schránky! 📋', 'success');
      
      // Update local data
      const project = this.projects.find(p => p.id === projectId);
      if (project) project.client_portal_token = token;
      
      // Refresh detail if open
      if (this.selectedProject?.id === projectId) {
        this.selectedProject.client_portal_token = token;
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Generate link error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async copyClientLink(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project?.client_portal_token) {
      await this.generateClientLink(projectId);
      return;
    }
    
    const url = `${window.location.origin}/portal/proposal.html?t=${project.client_portal_token}`;
    await navigator.clipboard.writeText(url);
    Utils.toast('Odkaz skopírovaný do schránky! 📋', 'success');
  },
  
  async sendProposalToClient(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    
    // Generuj token ak neexistuje
    if (!project.client_portal_token) {
      await this.generateClientLink(projectId);
    }
    
    // Načítaj klienta
    const { data: client, error: clientError } = await Database.client
      .from('clients')
      .select('*')
      .eq('id', project.client_id)
      .single();
    
    if (clientError || !client) {
      Utils.toast('Klient nenájdený', 'error');
      return;
    }
    
    if (!client.email) {
      Utils.toast('Klient nemá email', 'error');
      return;
    }
    
    const proposalUrl = `${window.location.origin}/portal/proposal.html?t=${project.client_portal_token}`;
    
    // HTML email
    if (window.EmailTemplates) await EmailTemplates.ensureSettings();
    const htmlBody = window.EmailTemplates
      ? EmailTemplates.campaignProposal({ contactName: client.contact_person, companyName: client.company_name, projectName: project.name, proposalUrl })
      : '<p>Pozrite si návrh kampane: <a href="' + proposalUrl + '">' + proposalUrl + '</a></p>';
    
    try {
      // Pošli email cez Netlify function
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          toName: client.contact_person || client.company_name,
          subject: `📊 Návrh kampane pre ${client.company_name} - Adlify`,
          htmlBody: htmlBody
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Ulož dátum odoslania
        await Database.client
          .from('campaign_projects')
          .update({ 
            proposal_sent_at: new Date().toISOString(),
            proposal_sent_to: client.email
          })
          .eq('id', projectId);
        
        Utils.toast(`📧 Email odoslaný na ${client.email}`, 'success');
        
        // Vytvor notifikáciu
        await Database.client.from('notifications').insert({
          type: 'proposal_sent',
          title: '📧 Návrh odoslaný klientovi',
          message: `Návrh pre ${client.company_name} bol odoslaný na ${client.email}`,
          action_url: `#projects?id=${projectId}`,
          entity_type: 'project',
          entity_id: projectId
        });
        
      } else {
        throw new Error(result.error || 'Email sa nepodarilo odoslať');
      }
      
    } catch (error) {
      console.error('Send proposal error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },

  viewReport(projectId) {
    Utils.toast('Report - pripravuje sa', 'info');
  },
  
  // ==========================================
  // CAMPAIGN EDITING
  // ==========================================
  
  async editCampaign(campaignId) {
    // Load campaign data
    const { data: campaign, error } = await Database.client
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    if (error || !campaign) {
      Utils.toast('Chyba pri načítaní kampane', 'error');
      return;
    }
    
    this.showCampaignEditModal(campaign);
  },
  
  showCampaignEditModal(campaign) {
    const platformNames = {
      'google': 'Google Ads',
      'meta': 'Meta Ads',
      'tiktok': 'TikTok',
      'linkedin': 'LinkedIn'
    };
    
    const targeting = campaign.targeting || {};
    const estimated = campaign.metrics?.estimated || {};
    
    const modalHtml = `
      <div id="campaign-edit-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
        <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between gradient-bg text-white">
            <h2 class="text-xl font-bold">✏️ Upraviť kampaň</h2>
            <button onclick="CampaignProjectsModule.closeCampaignEditModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          
          <div class="p-6 overflow-y-auto flex-1 space-y-6">
            <!-- Basic Info -->
            <div>
              <h3 class="font-semibold text-gray-700 mb-3">📊 Základné info</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Názov kampane</label>
                  <input type="text" id="edit-campaign-name" value="${campaign.name || ''}" 
                    class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Platforma</label>
                  <select id="edit-campaign-platform" class="w-full p-3 border rounded-xl">
                    ${Object.entries(platformNames).map(([key, name]) => 
                      `<option value="${key}" ${campaign.platform === key ? 'selected' : ''}>${name}</option>`
                    ).join('')}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Typ kampane</label>
                  <input type="text" id="edit-campaign-type" value="${campaign.campaign_type || ''}" 
                    class="w-full p-3 border rounded-xl">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Cieľ</label>
                  <select id="edit-campaign-objective" class="w-full p-3 border rounded-xl">
                    <option value="conversions" ${campaign.objective === 'conversions' ? 'selected' : ''}>Konverzie</option>
                    <option value="traffic" ${campaign.objective === 'traffic' ? 'selected' : ''}>Návštevnosť</option>
                    <option value="awareness" ${campaign.objective === 'awareness' ? 'selected' : ''}>Povedomie</option>
                    <option value="leads" ${campaign.objective === 'leads' ? 'selected' : ''}>Leads</option>
                    <option value="engagement" ${campaign.objective === 'engagement' ? 'selected' : ''}>Angažovanosť</option>
                  </select>
                </div>
              </div>
            </div>
            
            <!-- Budget -->
            <div>
              <h3 class="font-semibold text-gray-700 mb-3">💰 Rozpočet</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Denný rozpočet (€)</label>
                  <input type="number" id="edit-campaign-budget" value="${campaign.budget_daily || 0}" step="0.01"
                    class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  <select id="edit-campaign-status" class="w-full p-3 border rounded-xl">
                    <option value="draft" ${campaign.status === 'draft' ? 'selected' : ''}>Draft</option>
                    <option value="active" ${campaign.status === 'active' ? 'selected' : ''}>Aktívna</option>
                    <option value="paused" ${campaign.status === 'paused' ? 'selected' : ''}>Pozastavená</option>
                  </select>
                </div>
              </div>
            </div>
            
            <!-- Targeting -->
            <div>
              <h3 class="font-semibold text-gray-700 mb-3">🎯 Cielenie</h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Lokality (oddelené čiarkou)</label>
                  <input type="text" id="edit-campaign-locations" value="${targeting.locations?.join(', ') || ''}" 
                    class="w-full p-3 border rounded-xl" placeholder="Slovensko, Česko">
                </div>
                <div class="grid md:grid-cols-3 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Vek od</label>
                    <input type="number" id="edit-campaign-age-min" value="${targeting.age_range?.min || 18}" 
                      class="w-full p-3 border rounded-xl" min="13" max="65">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Vek do</label>
                    <input type="number" id="edit-campaign-age-max" value="${targeting.age_range?.max || 65}" 
                      class="w-full p-3 border rounded-xl" min="13" max="65">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-600 mb-1">Pohlavie</label>
                    <select id="edit-campaign-gender" class="w-full p-3 border rounded-xl">
                      <option value="all" ${targeting.gender === 'all' ? 'selected' : ''}>Všetci</option>
                      <option value="male" ${targeting.gender === 'male' ? 'selected' : ''}>Muži</option>
                      <option value="female" ${targeting.gender === 'female' ? 'selected' : ''}>Ženy</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Kľúčové slová (oddelené čiarkou)</label>
                  <textarea id="edit-campaign-keywords" rows="2" class="w-full p-3 border rounded-xl"
                    placeholder="práca v nemecku, elektrikár nemecko">${targeting.keywords?.join(', ') || ''}</textarea>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Záujmy (oddelené čiarkou)</label>
                  <textarea id="edit-campaign-interests" rows="2" class="w-full p-3 border rounded-xl"
                    placeholder="Elektrotechnika, Stavebníctvo">${targeting.interests?.join(', ') || ''}</textarea>
                </div>
              </div>
            </div>
            
            <!-- Estimated Results -->
            <div>
              <h3 class="font-semibold text-gray-700 mb-3">📈 Odhadované výsledky</h3>
              <div class="grid md:grid-cols-4 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Zobrazenia</label>
                  <input type="text" id="edit-campaign-impressions" value="${estimated.impressions || ''}" 
                    class="w-full p-3 border rounded-xl" placeholder="1,000 - 2,000">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Kliknutia</label>
                  <input type="text" id="edit-campaign-clicks" value="${estimated.clicks || ''}" 
                    class="w-full p-3 border rounded-xl" placeholder="50 - 100">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">Konverzie</label>
                  <input type="text" id="edit-campaign-conversions" value="${estimated.conversions || ''}" 
                    class="w-full p-3 border rounded-xl" placeholder="5 - 10">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-600 mb-1">CPA</label>
                  <input type="text" id="edit-campaign-cpa" value="${estimated.cpa || ''}" 
                    class="w-full p-3 border rounded-xl" placeholder="10€ - 20€">
                </div>
              </div>
            </div>
          </div>
          
          <div class="p-4 border-t flex justify-end gap-3 bg-gray-50">
            <button onclick="CampaignProjectsModule.closeCampaignEditModal()" 
              class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
              Zrušiť
            </button>
            <button onclick="CampaignProjectsModule.saveCampaign('${campaign.id}')" 
              class="px-6 py-2 gradient-bg text-white rounded-xl hover:opacity-90">
              💾 Uložiť
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },
  
  closeCampaignEditModal() {
    const modal = document.getElementById('campaign-edit-modal');
    if (modal) modal.remove();
  },
  
  async saveCampaign(campaignId) {
    const name = document.getElementById('edit-campaign-name').value.trim();
    const platform = document.getElementById('edit-campaign-platform').value;
    const campaign_type = document.getElementById('edit-campaign-type').value.trim();
    const objective = document.getElementById('edit-campaign-objective').value;
    const budget_daily = parseFloat(document.getElementById('edit-campaign-budget').value) || 0;
    const status = document.getElementById('edit-campaign-status').value;
    
    // Targeting
    const locations = document.getElementById('edit-campaign-locations').value.split(',').map(s => s.trim()).filter(Boolean);
    const age_min = parseInt(document.getElementById('edit-campaign-age-min').value) || 18;
    const age_max = parseInt(document.getElementById('edit-campaign-age-max').value) || 65;
    const gender = document.getElementById('edit-campaign-gender').value;
    const keywords = document.getElementById('edit-campaign-keywords').value.split(',').map(s => s.trim()).filter(Boolean);
    const interests = document.getElementById('edit-campaign-interests').value.split(',').map(s => s.trim()).filter(Boolean);
    
    // Estimated
    const impressions = document.getElementById('edit-campaign-impressions').value.trim();
    const clicks = document.getElementById('edit-campaign-clicks').value.trim();
    const conversions = document.getElementById('edit-campaign-conversions').value.trim();
    const cpa = document.getElementById('edit-campaign-cpa').value.trim();
    
    if (!name) {
      Utils.toast('Názov je povinný', 'warning');
      return;
    }
    
    try {
      const { error } = await Database.client
        .from('campaigns')
        .update({
          name,
          platform,
          campaign_type,
          objective,
          budget_daily,
          status,
          targeting: {
            locations,
            age_range: { min: age_min, max: age_max },
            gender,
            keywords,
            interests
          },
          metrics: {
            estimated: { impressions, clicks, conversions, cpa }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId);
      
      if (error) throw error;
      
      Utils.toast('Kampaň uložená! ✅', 'success');
      this.closeCampaignEditModal();
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Save campaign error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // AD GROUP EDITING
  // ==========================================
  
  async editAdGroup(adGroupId) {
    const { data: adGroup, error } = await Database.client
      .from('ad_groups')
      .select('*')
      .eq('id', adGroupId)
      .single();
    
    if (error || !adGroup) {
      Utils.toast('Chyba pri načítaní ad group', 'error');
      return;
    }
    
    this.showAdGroupEditModal(adGroup);
  },
  
  showAdGroupEditModal(adGroup) {
    const modalHtml = `
      <div id="adgroup-edit-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
            <h2 class="text-xl font-bold">✏️ Upraviť reklamnú skupinu</h2>
            <button onclick="CampaignProjectsModule.closeAdGroupEditModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          
          <div class="p-6 overflow-y-auto flex-1 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Názov</label>
              <input type="text" id="edit-adgroup-name" value="${adGroup.name || ''}" 
                class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Kľúčové slová (oddelené čiarkou)</label>
              <textarea id="edit-adgroup-keywords" rows="3" class="w-full p-3 border rounded-xl"
                placeholder="keyword1, keyword2, keyword3">${adGroup.keywords?.join(', ') || ''}</textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Negatívne kľúčové slová</label>
              <textarea id="edit-adgroup-negative" rows="2" class="w-full p-3 border rounded-xl"
                placeholder="negative1, negative2">${adGroup.negative_keywords?.join(', ') || ''}</textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Audience</label>
              <input type="text" id="edit-adgroup-audience" value="${adGroup.audience || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="Popis cieľovej skupiny">
            </div>
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Bid stratégia</label>
                <select id="edit-adgroup-bidstrategy" class="w-full p-3 border rounded-xl">
                  <option value="" ${!adGroup.bid_strategy ? 'selected' : ''}>Automatická</option>
                  <option value="manual_cpc" ${adGroup.bid_strategy === 'manual_cpc' ? 'selected' : ''}>Manual CPC</option>
                  <option value="maximize_clicks" ${adGroup.bid_strategy === 'maximize_clicks' ? 'selected' : ''}>Maximize Clicks</option>
                  <option value="maximize_conversions" ${adGroup.bid_strategy === 'maximize_conversions' ? 'selected' : ''}>Maximize Conversions</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Max CPC (€)</label>
                <input type="number" id="edit-adgroup-maxcpc" value="${adGroup.max_cpc || ''}" step="0.01"
                  class="w-full p-3 border rounded-xl" placeholder="0.50">
              </div>
            </div>
          </div>
          
          <div class="p-4 border-t flex justify-end gap-3 bg-gray-50">
            <button onclick="CampaignProjectsModule.closeAdGroupEditModal()" 
              class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
              Zrušiť
            </button>
            <button onclick="CampaignProjectsModule.saveAdGroup('${adGroup.id}')" 
              class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
              💾 Uložiť
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },
  
  closeAdGroupEditModal() {
    const modal = document.getElementById('adgroup-edit-modal');
    if (modal) modal.remove();
  },
  
  async saveAdGroup(adGroupId) {
    const name = document.getElementById('edit-adgroup-name').value.trim();
    const keywords = document.getElementById('edit-adgroup-keywords').value.split(',').map(s => s.trim()).filter(Boolean);
    const negative_keywords = document.getElementById('edit-adgroup-negative').value.split(',').map(s => s.trim()).filter(Boolean);
    const audience = document.getElementById('edit-adgroup-audience').value.trim();
    const bid_strategy = document.getElementById('edit-adgroup-bidstrategy').value || null;
    const max_cpc = parseFloat(document.getElementById('edit-adgroup-maxcpc').value) || null;
    
    if (!name) {
      Utils.toast('Názov je povinný', 'warning');
      return;
    }
    
    try {
      const { error } = await Database.client
        .from('ad_groups')
        .update({ name, keywords, negative_keywords, audience, bid_strategy, max_cpc })
        .eq('id', adGroupId);
      
      if (error) throw error;
      
      Utils.toast('Ad group uložená! ✅', 'success');
      this.closeAdGroupEditModal();
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Save ad group error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // AD EDITING
  // ==========================================
  
  async editAd(adId) {
    const { data: ad, error } = await Database.client
      .from('ads')
      .select('*')
      .eq('id', adId)
      .single();
    
    if (error || !ad) {
      Utils.toast('Chyba pri načítaní reklamy', 'error');
      return;
    }
    
    this.showAdEditModal(ad);
  },
  
  showAdEditModal(ad) {
    const headlines = ad.headlines?.length > 0 && ad.headlines[0] !== '' ? ad.headlines : [''];
    const descriptions = ad.descriptions?.length > 0 && ad.descriptions[0] !== '' ? ad.descriptions : [''];
    const isNew = !ad.headlines?.[0] || ad.headlines[0] === '';
    
    const modalHtml = `
      <div id="ad-edit-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-blue-600 text-white">
            <h2 class="text-xl font-bold">${isNew ? '➕ Nová reklama' : '✏️ Upraviť reklamu'}</h2>
            <button onclick="CampaignProjectsModule.closeAdEditModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          
          <div class="p-6 overflow-y-auto flex-1 space-y-4">
            <!-- AI Generate Button -->
            <div class="bg-purple-50 rounded-xl p-4 border border-purple-200">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-semibold text-purple-800">🤖 AI Generovanie</h4>
                  <p class="text-sm text-purple-600">Nechaj AI vygenerovať texty na základe onboardingu</p>
                </div>
                <button onclick="CampaignProjectsModule.generateAdContent('${ad.id}')" 
                  class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  id="ai-generate-btn">
                  ✨ Generovať
                </button>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Typ reklamy</label>
              <select id="edit-ad-type" class="w-full p-3 border rounded-xl">
                <option value="responsive" ${ad.ad_type === 'responsive' ? 'selected' : ''}>Responsive</option>
                <option value="text" ${ad.ad_type === 'text' ? 'selected' : ''}>Textová</option>
                <option value="image" ${ad.ad_type === 'image' ? 'selected' : ''}>Obrázková</option>
                <option value="video" ${ad.ad_type === 'video' ? 'selected' : ''}>Video</option>
                <option value="carousel" ${ad.ad_type === 'carousel' ? 'selected' : ''}>Carousel</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-2">Nadpisy (Headlines) <span class="text-red-500">*</span></label>
              <div class="space-y-2" id="headlines-container">
                ${headlines.map((h, i) => `
                  <input type="text" class="headline-input w-full p-3 border rounded-xl" 
                    value="${this.escapeHtml(h)}" placeholder="Nadpis ${i + 1} (max 30 znakov)" maxlength="30">
                `).join('')}
              </div>
              <button onclick="CampaignProjectsModule.addHeadlineInput()" type="button"
                class="mt-2 text-sm text-blue-600 hover:underline">+ Pridať nadpis</button>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-2">Popisy (Descriptions)</label>
              <div class="space-y-2" id="descriptions-container">
                ${descriptions.map((d, i) => `
                  <textarea class="description-input w-full p-3 border rounded-xl" rows="2"
                    placeholder="Popis ${i + 1} (max 90 znakov)" maxlength="90">${this.escapeHtml(d)}</textarea>
                `).join('')}
              </div>
              <button onclick="CampaignProjectsModule.addDescriptionInput()" type="button"
                class="mt-2 text-sm text-blue-600 hover:underline">+ Pridať popis</button>
            </div>
            
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Call to Action</label>
                <input type="text" id="edit-ad-cta" value="${this.escapeHtml(ad.call_to_action || '')}" 
                  class="w-full p-3 border rounded-xl" placeholder="Zistiť viac">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Landing Page</label>
                <input type="url" id="edit-ad-landing" value="${ad.landing_page || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="https://...">
              </div>
            </div>
            
            <!-- Preview -->
            <div class="bg-gray-50 rounded-xl p-4">
              <h4 class="text-sm font-medium text-gray-500 mb-2">📱 Náhľad Google Ads</h4>
              <div class="bg-white border rounded-lg p-4">
                <div class="text-blue-600 font-medium text-lg" id="preview-headline">${this.escapeHtml(headlines[0]) || 'Nadpis reklamy'}</div>
                <div class="text-green-700 text-sm">${ad.landing_page ? new URL(ad.landing_page).hostname : 'www.example.com'}</div>
                <div class="text-gray-600 text-sm mt-1" id="preview-description">${this.escapeHtml(descriptions[0]) || 'Popis reklamy...'}</div>
              </div>
            </div>
          </div>
          
          <div class="p-4 border-t flex justify-between gap-3 bg-gray-50">
            <button onclick="CampaignProjectsModule.deleteAdAndClose('${ad.id}')" 
              class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl ${isNew ? '' : ''}">
              🗑️ Zmazať
            </button>
            <div class="flex gap-3">
              <button onclick="CampaignProjectsModule.closeAdEditModal()" 
                class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
                Zrušiť
              </button>
              <button onclick="CampaignProjectsModule.saveAd('${ad.id}')" 
                class="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                💾 Uložiť
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Add live preview listeners
    setTimeout(() => {
      document.querySelectorAll('.headline-input').forEach(input => {
        input.addEventListener('input', () => this.updateAdPreview());
      });
      document.querySelectorAll('.description-input').forEach(input => {
        input.addEventListener('input', () => this.updateAdPreview());
      });
    }, 100);
  },
  
  escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  
  async generateAdContent(adId) {
    const btn = document.getElementById('ai-generate-btn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Generujem...';
    
    try {
      // Get ad's ad_group to find campaign and project
      const { data: ad } = await Database.client
        .from('ads')
        .select('ad_group_id')
        .eq('id', adId)
        .single();
      
      const { data: adGroup } = await Database.client
        .from('ad_groups')
        .select('campaign_id, name, keywords')
        .eq('id', ad.ad_group_id)
        .single();
      
      const { data: campaign } = await Database.client
        .from('campaigns')
        .select('project_id, name, platform, targeting')
        .eq('id', adGroup.campaign_id)
        .single();
      
      const { data: project } = await Database.client
        .from('campaign_projects')
        .select('client_id')
        .eq('id', campaign.project_id)
        .single();
      
      const { data: onboarding } = await Database.client
        .from('onboarding_responses')
        .select('*')
        .eq('client_id', project.client_id)
        .single();
      
      if (!onboarding) {
        Utils.toast('Chýba onboarding - nemám z čoho generovať', 'warning');
        btn.disabled = false;
        btn.innerHTML = '✨ Generovať';
        return;
      }
      
      // Call Claude API via Edge Function
      const { data: { session } } = await Database.client.auth.getSession();
      const response = await fetch(
        'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/generate-ad-content',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || Config.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            onboarding,
            campaign_name: campaign.name,
            platform: campaign.platform,
            ad_group_name: adGroup.name,
            keywords: adGroup.keywords || campaign.targeting?.keywords || []
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        // Fill in the form
        const headlinesContainer = document.getElementById('headlines-container');
        const descriptionsContainer = document.getElementById('descriptions-container');
        
        headlinesContainer.innerHTML = result.headlines.map((h, i) => `
          <input type="text" class="headline-input w-full p-3 border rounded-xl" 
            value="${this.escapeHtml(h)}" placeholder="Nadpis ${i + 1}" maxlength="30">
        `).join('');
        
        descriptionsContainer.innerHTML = result.descriptions.map((d, i) => `
          <textarea class="description-input w-full p-3 border rounded-xl" rows="2"
            placeholder="Popis ${i + 1}" maxlength="90">${this.escapeHtml(d)}</textarea>
        `).join('');
        
        document.getElementById('edit-ad-cta').value = result.cta || '';
        
        // Re-add listeners
        document.querySelectorAll('.headline-input').forEach(input => {
          input.addEventListener('input', () => this.updateAdPreview());
        });
        document.querySelectorAll('.description-input').forEach(input => {
          input.addEventListener('input', () => this.updateAdPreview());
        });
        
        this.updateAdPreview();
        Utils.toast('AI vygenerovalo texty! ✨', 'success');
      } else {
        throw new Error(result.error || 'Neznáma chyba');
      }
      
    } catch (error) {
      console.error('Generate ad content error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '✨ Generovať';
  },
  
  async deleteAdAndClose(adId) {
    if (!await Utils.confirm('Zmazať túto reklamu?', { title: 'Zmazať reklamu', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      const { error } = await Database.client.from('ads').delete().eq('id', adId);
      if (error) throw error;
      
      Utils.toast('Reklama zmazaná', 'success');
      this.closeAdEditModal();
      
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
    } catch (error) {
      console.error('Delete ad error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  addHeadlineInput() {
    const container = document.getElementById('headlines-container');
    const count = container.querySelectorAll('input').length;
    if (count >= 15) {
      Utils.toast('Maximum 15 nadpisov', 'warning');
      return;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'headline-input w-full p-3 border rounded-xl';
    input.placeholder = `Nadpis ${count + 1}`;
    input.maxLength = 30;
    input.addEventListener('input', () => this.updateAdPreview());
    container.appendChild(input);
  },
  
  addDescriptionInput() {
    const container = document.getElementById('descriptions-container');
    const count = container.querySelectorAll('textarea').length;
    if (count >= 4) {
      Utils.toast('Maximum 4 popisy', 'warning');
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.className = 'description-input w-full p-3 border rounded-xl';
    textarea.rows = 2;
    textarea.placeholder = `Popis ${count + 1}`;
    textarea.maxLength = 90;
    textarea.addEventListener('input', () => this.updateAdPreview());
    container.appendChild(textarea);
  },
  
  updateAdPreview() {
    const headlines = [...document.querySelectorAll('.headline-input')].map(i => i.value).filter(Boolean);
    const descriptions = [...document.querySelectorAll('.description-input')].map(i => i.value).filter(Boolean);
    
    const previewHeadline = document.getElementById('preview-headline');
    const previewDescription = document.getElementById('preview-description');
    
    if (previewHeadline) previewHeadline.textContent = headlines[0] || 'Nadpis reklamy';
    if (previewDescription) previewDescription.textContent = descriptions[0] || 'Popis reklamy...';
  },
  
  closeAdEditModal() {
    const modal = document.getElementById('ad-edit-modal');
    if (modal) modal.remove();
  },
  
  async saveAd(adId) {
    const type = document.getElementById('edit-ad-type').value;
    const headlines = [...document.querySelectorAll('.headline-input')].map(i => i.value.trim()).filter(Boolean);
    const descriptions = [...document.querySelectorAll('.description-input')].map(i => i.value.trim()).filter(Boolean);
    const call_to_action = document.getElementById('edit-ad-cta').value.trim();
    const landing_page = document.getElementById('edit-ad-landing').value.trim();
    
    if (headlines.length === 0) {
      Utils.toast('Minimálne 1 nadpis je povinný', 'warning');
      return;
    }
    
    try {
      const { error } = await Database.client
        .from('ads')
        .update({ ad_type: type, headlines, descriptions, call_to_action, landing_page })
        .eq('id', adId);
      
      if (error) throw error;
      
      Utils.toast('Reklama uložená! ✅', 'success');
      this.closeAdEditModal();
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Save ad error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // ADD NEW AD GROUP
  // ==========================================
  
  async addAdGroup(campaignId) {
    const name = prompt('Názov novej reklamnej skupiny:');
    if (!name?.trim()) return;
    
    try {
      const { data, error } = await Database.client
        .from('ad_groups')
        .insert({
          campaign_id: campaignId,
          name: name.trim(),
          keywords: [],
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      Utils.toast('Ad Group vytvorená! ✅', 'success');
      
      // Refresh
      await this.loadAdGroupsWithAds(campaignId);
      
    } catch (error) {
      console.error('Add ad group error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteAdGroup(adGroupId) {
    if (!await Utils.confirm('Zmažú sa aj všetky reklamy v tejto skupine.', { title: 'Zmazať reklamnú skupinu', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      // First delete all ads in this ad group
      await Database.client.from('ads').delete().eq('ad_group_id', adGroupId);
      
      // Then delete the ad group
      const { error } = await Database.client.from('ad_groups').delete().eq('id', adGroupId);
      if (error) throw error;
      
      Utils.toast('Ad Group zmazaná', 'success');
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Delete ad group error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // ADD NEW AD
  // ==========================================
  
  async addAd(adGroupId) {
    // Create empty ad and open edit modal
    try {
      const { data: newAd, error } = await Database.client
        .from('ads')
        .insert({
          ad_group_id: adGroupId,
          ad_type: 'responsive',
          headlines: [''],
          descriptions: [''],
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Open edit modal for the new ad
      this.showAdEditModal(newAd);
      
    } catch (error) {
      console.error('Add ad error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteAd(adId) {
    if (!await Utils.confirm('Zmazať túto reklamu?', { title: 'Zmazať reklamu', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      const { error } = await Database.client.from('ads').delete().eq('id', adId);
      if (error) throw error;
      
      Utils.toast('Reklama zmazaná', 'success');
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Delete ad error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async duplicateAd(adId) {
    try {
      // Get original ad
      const { data: original, error: fetchError } = await Database.client
        .from('ads')
        .select('*')
        .eq('id', adId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Create copy
      const { id, created_at, ...adData } = original;
      const { data: newAd, error } = await Database.client
        .from('ads')
        .insert({
          ...adData,
          headlines: [...(original.headlines || [])],
          descriptions: [...(original.descriptions || [])]
        })
        .select()
        .single();
      
      if (error) throw error;
      
      Utils.toast('Reklama duplikovaná! ✅', 'success');
      
      // Refresh project detail
      if (this.selectedProject) {
        document.getElementById('detail-content').innerHTML = await this.renderDetailContent(this.selectedProject);
      }
      
    } catch (error) {
      console.error('Duplicate ad error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  }
};

window.CampaignProjectsModule = CampaignProjectsModule;
