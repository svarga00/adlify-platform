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
    draft: { label: 'Rozpracované', color: 'gray', icon: '📝' },
    generating: { label: 'Generuje AI', color: 'purple', icon: '🤖' },
    internal_review: { label: 'Interná kontrola', color: 'yellow', icon: '👁️' },
    client_review: { label: 'Čaká na klienta', color: 'blue', icon: '👤' },
    revision: { label: 'Revízia', color: 'orange', icon: '✏️' },
    approved: { label: 'Schválené', color: 'green', icon: '✅' },
    deploying: { label: 'Nasadzovanie', color: 'indigo', icon: '🚀' },
    active: { label: 'Aktívne', color: 'emerald', icon: '▶️' },
    paused: { label: 'Pozastavené', color: 'gray', icon: '⏸️' },
    ended: { label: 'Ukončené', color: 'slate', icon: '⏹️' }
  },
  
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
    return `
      <!-- Header s akciami -->
      <div class="flex flex-wrap gap-4 justify-between items-center mb-6">
        <div class="flex gap-2">
          ${this.renderStatusTabs()}
        </div>
        <button onclick="CampaignProjectsModule.showCreateModal()" class="px-4 py-2 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
          ➕ Nový projekt
        </button>
      </div>
      
      <!-- Filtre -->
      <div class="card p-4 mb-6">
        <div class="flex flex-wrap gap-4 items-center">
          <input type="text" id="filter-search" placeholder="🔍 Hľadať projekt..." 
            value="${this.filters.search}" 
            class="flex-1 min-w-[200px] p-2 border rounded-lg">
          <select id="filter-client" class="p-2 border rounded-lg min-w-[200px]" onchange="CampaignProjectsModule.onClientChange(this.value)">
            <option value="">Všetci klienti</option>
            ${this.clients.map(c => `
              <option value="${c.id}" ${this.filters.client === c.id ? 'selected' : ''}>${c.company_name}</option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <!-- Stats Overview -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${this.renderStats()}
      </div>
      
      <!-- Projekty Grid -->
      <div id="projects-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${this.renderProjectsGrid()}
      </div>
      
      <!-- Create Modal -->
      <div id="create-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 class="text-xl font-bold">➕ Nový projekt</h2>
            <button onclick="CampaignProjectsModule.closeCreateModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="create-content" class="p-6 overflow-y-auto flex-1">
            ${this.renderCreateForm()}
          </div>
        </div>
      </div>
      
      <!-- Project Detail Modal -->
      <div id="detail-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 id="detail-title" class="text-xl font-bold">Detail projektu</h2>
            <button onclick="CampaignProjectsModule.closeDetailModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="detail-content" class="p-6 overflow-y-auto flex-1"></div>
        </div>
      </div>
      
      <style>
        .status-tab { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; font-size: 0.875rem; }
        .status-tab.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .project-card { transition: all 0.2s; }
        .project-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
        .workflow-step { position: relative; }
        .workflow-step::after { content: ''; position: absolute; right: -1rem; top: 50%; width: 0.75rem; height: 2px; background: #e5e7eb; }
        .workflow-step:last-child::after { display: none; }
        .workflow-step.active::after { background: #22c55e; }
        .workflow-step.completed { background: #dcfce7; color: #166534; }
        .workflow-step.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
      </style>
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
    
    return `
      <div class="card p-4 text-center">
        <div class="text-3xl font-bold text-gray-800">${total}</div>
        <div class="text-sm text-gray-500">Celkom projektov</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-3xl font-bold text-emerald-600">${active}</div>
        <div class="text-sm text-gray-500">Aktívnych</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-3xl font-bold text-yellow-600">${pending}</div>
        <div class="text-sm text-gray-500">Čaká na schválenie</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-3xl font-bold text-purple-600">${Utils.formatPrice ? Utils.formatPrice(totalBudget) : totalBudget + '€'}</div>
        <div class="text-sm text-gray-500">Mesačný rozpočet</div>
      </div>
    `;
  },
  
  renderProjectsGrid() {
    if (this.projects.length === 0) {
      return `
        <div class="col-span-full text-center py-16 text-gray-400">
          <div class="text-6xl mb-4">📁</div>
          <h3 class="text-xl font-semibold mb-2">Žiadne projekty</h3>
          <p>Vytvorte prvý kampaňový projekt</p>
        </div>
      `;
    }
    
    return this.projects.map(project => this.renderProjectCard(project)).join('');
  },
  
  renderProjectCard(project) {
    const status = this.STATUSES[project.status] || this.STATUSES.draft;
    const campaigns = project.campaigns_count || 0;
    
    return `
      <div class="card project-card p-5 cursor-pointer" onclick="CampaignProjectsModule.showDetail('${project.id}')">
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-lg truncate">${project.name}</h3>
            <p class="text-sm text-gray-500">${project.client_name}</p>
          </div>
          <span class="px-2 py-1 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-700">
            ${status.icon} ${status.label}
          </span>
        </div>
        
        <!-- Info -->
        <div class="space-y-2 mb-4">
          ${project.total_monthly_budget ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Rozpočet</span>
              <span class="font-semibold">${project.total_monthly_budget}€/mes</span>
            </div>
          ` : ''}
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">Kampane</span>
            <span class="font-semibold">${campaigns}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">Vytvorené</span>
            <span>${Utils.formatDate ? Utils.formatDate(project.created_at) : new Date(project.created_at).toLocaleDateString('sk')}</span>
          </div>
        </div>
        
        <!-- Workflow Mini -->
        <div class="flex gap-1 mb-4">
          ${this.renderWorkflowMini(project.status)}
        </div>
        
        <!-- Actions -->
        <div class="flex gap-2 pt-3 border-t">
          <button onclick="event.stopPropagation(); CampaignProjectsModule.showDetail('${project.id}')" 
            class="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            👁️ Detail
          </button>
          ${project.status === 'draft' ? `
            <button onclick="event.stopPropagation(); CampaignProjectsModule.startGeneration('${project.id}')" 
              class="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">
              🤖 Generovať
            </button>
          ` : ''}
          ${project.status === 'internal_review' ? `
            <button onclick="event.stopPropagation(); CampaignProjectsModule.approveInternal('${project.id}')" 
              class="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200">
              ✅ Schváliť
            </button>
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
      let classes = 'w-2 h-2 rounded-full ';
      
      if (index < currentIndex) {
        classes += 'bg-green-500';
      } else if (index === currentIndex) {
        classes += 'bg-orange-500';
      } else {
        classes += 'bg-gray-200';
      }
      
      return `<div class="${classes}" title="${status.label}"></div>`;
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
  
  async onSearchChange(value) {
    this.filters.search = value;
    await this.loadData();
    document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
  },
  
  async onStatusChange(status) {
    this.filters.status = status;
    await this.loadData();
    // Re-render whole template to update tabs
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.template();
      this.setupEventListeners();
    }
  },
  
  async onClientChange(clientId) {
    this.filters.client = clientId;
    await this.loadData();
    document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
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
    
    const status = this.STATUSES[project.status] || this.STATUSES.draft;
    
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
        
        ${project.strategy_summary ? `
        <div class="card p-4 bg-purple-50">
          <h4 class="font-semibold mb-2 text-purple-800">🎯 Stratégia</h4>
          <p class="text-purple-700">${project.strategy_summary}</p>
        </div>
        ` : ''}
        
        <!-- Kampane -->
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
          
          ${campaigns && campaigns.length > 0 ? `
          <div class="space-y-3">
            ${campaigns.map(c => this.renderCampaignItem(c)).join('')}
          </div>
          ` : `
          <div class="text-center py-8 text-gray-400">
            <div class="text-4xl mb-2">📣</div>
            <p>Zatiaľ žiadne kampane</p>
            ${project.status === 'draft' ? '<p class="text-sm mt-2">Spustite AI generovanie pre vytvorenie kampaní</p>' : ''}
          </div>
          `}
        </div>
        
        <!-- Actions -->
        <div class="flex flex-wrap gap-3 pt-4 border-t">
          ${this.renderDetailActions(project)}
        </div>
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
  
  renderCampaignItem(campaign) {
    const platform = this.PLATFORMS[campaign.platform] || { name: campaign.platform, icon: '📣' };
    const status = this.STATUSES[campaign.status] || this.STATUSES.draft;
    
    return `
      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
        <div class="text-2xl">${platform.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${campaign.name}</div>
          <div class="text-xs text-gray-500">${platform.name} • ${campaign.campaign_type || 'Kampaň'}</div>
        </div>
        <span class="px-2 py-1 rounded text-xs bg-${status.color}-100 text-${status.color}-700">
          ${status.label}
        </span>
        <button onclick="CampaignProjectsModule.editCampaign('${campaign.id}')" 
          class="p-2 hover:bg-white rounded-lg" title="Upraviť">
          ✏️
        </button>
      </div>
    `;
  },
  
  renderDetailActions(project) {
    const actions = [];
    
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
          <button onclick="CampaignProjectsModule.previewAsClient('${project.id}')" 
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
            👁️ Náhľad ako klient
          </button>
          <button onclick="CampaignProjectsModule.simulateClientApproval('${project.id}')" 
            class="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
            ✅ Simulovať schválenie klientom
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
    if (!await Utils.confirm('Naozaj chcete zmazať tento projekt? Táto akcia je nevratná.')) {
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
    Utils.toast('Spúšťam AI generovanie...', 'info');
    
    // Update status to generating
    if (await this.updateStatus(projectId, 'generating')) {
      // TODO: Call AI generation Edge Function
      // For now, simulate and move to internal_review
      setTimeout(async () => {
        await this.updateStatus(projectId, 'internal_review');
        Utils.toast('AI generovanie dokončené!', 'success');
        await this.loadData();
        document.getElementById('projects-grid').innerHTML = this.renderProjectsGrid();
        
        if (this.selectedProject?.id === projectId) {
          const project = this.projects.find(p => p.id === projectId);
          if (project) {
            document.getElementById('detail-content').innerHTML = await this.renderDetailContent(project);
          }
        }
      }, 2000);
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
  
  editCampaign(campaignId) {
    Utils.toast('Editácia kampane - pripravuje sa', 'info');
  },
  
  previewAsClient(projectId) {
    Utils.toast('Náhľad ako klient - pripravuje sa', 'info');
  },
  
  viewReport(projectId) {
    Utils.toast('Report - pripravuje sa', 'info');
  }
};

window.CampaignProjectsModule = CampaignProjectsModule;
