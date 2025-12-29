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
    const platformIcons = {
      'google': '🔍',
      'meta': '📘',
      'tiktok': '🎵',
      'linkedin': '💼',
      'other': '📣'
    };
    const platformNames = {
      'google': 'Google Ads',
      'meta': 'Meta Ads',
      'tiktok': 'TikTok Ads',
      'linkedin': 'LinkedIn Ads'
    };
    
    const icon = platformIcons[campaign.platform] || '📣';
    const platformName = platformNames[campaign.platform] || campaign.platform;
    const status = this.STATUSES[campaign.status] || this.STATUSES.draft;
    const estimated = campaign.metrics?.estimated || {};
    
    return `
      <div class="border rounded-xl overflow-hidden">
        <div class="flex items-center gap-3 p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
          onclick="CampaignProjectsModule.toggleCampaignDetail('${campaign.id}')">
          <div class="text-2xl">${icon}</div>
          <div class="flex-1 min-w-0">
            <div class="font-medium">${campaign.name}</div>
            <div class="text-xs text-gray-500">${platformName} • ${campaign.campaign_type || 'Kampaň'}</div>
          </div>
          <div class="text-right mr-2">
            <div class="font-semibold text-green-600">${campaign.budget_daily || 0}€/deň</div>
            <div class="text-xs text-gray-400">${campaign.ai_generated ? '🤖 AI' : '✋ Manuálne'}</div>
          </div>
          <span class="px-2 py-1 rounded text-xs bg-${status.color}-100 text-${status.color}-700">
            ${status.label}
          </span>
          <span class="text-gray-400 transition-transform" id="arrow-${campaign.id}">▼</span>
        </div>
        
        <!-- Expandable Detail -->
        <div id="campaign-detail-${campaign.id}" class="hidden border-t">
          <div class="p-4 space-y-4">
            <!-- Targeting -->
            ${campaign.targeting ? `
            <div>
              <h5 class="text-sm font-semibold text-gray-700 mb-2">🎯 Cielenie</h5>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                ${campaign.targeting.locations ? `
                <div class="bg-blue-50 rounded-lg p-2">
                  <div class="text-xs text-gray-500">Lokality</div>
                  <div class="font-medium">${campaign.targeting.locations.join(', ')}</div>
                </div>
                ` : ''}
                ${campaign.targeting.age_range ? `
                <div class="bg-purple-50 rounded-lg p-2">
                  <div class="text-xs text-gray-500">Vek</div>
                  <div class="font-medium">${campaign.targeting.age_range.min} - ${campaign.targeting.age_range.max}</div>
                </div>
                ` : ''}
                ${campaign.targeting.gender ? `
                <div class="bg-pink-50 rounded-lg p-2">
                  <div class="text-xs text-gray-500">Pohlavie</div>
                  <div class="font-medium">${campaign.targeting.gender === 'all' ? 'Všetci' : campaign.targeting.gender}</div>
                </div>
                ` : ''}
                ${campaign.targeting.keywords?.length ? `
                <div class="bg-green-50 rounded-lg p-2">
                  <div class="text-xs text-gray-500">Kľúčové slová</div>
                  <div class="font-medium">${campaign.targeting.keywords.length} slov</div>
                </div>
                ` : ''}
              </div>
              ${campaign.targeting.keywords?.length ? `
              <div class="mt-2 flex flex-wrap gap-1">
                ${campaign.targeting.keywords.slice(0, 10).map(k => `<span class="px-2 py-1 bg-gray-100 rounded text-xs">${k}</span>`).join('')}
                ${campaign.targeting.keywords.length > 10 ? `<span class="px-2 py-1 text-gray-400 text-xs">+${campaign.targeting.keywords.length - 10} ďalších</span>` : ''}
              </div>
              ` : ''}
              ${campaign.targeting.interests?.length ? `
              <div class="mt-2 flex flex-wrap gap-1">
                ${campaign.targeting.interests.map(i => `<span class="px-2 py-1 bg-orange-100 rounded text-xs">${i}</span>`).join('')}
              </div>
              ` : ''}
            </div>
            ` : ''}
            
            <!-- Estimated Results -->
            ${Object.keys(estimated).length > 0 ? `
            <div>
              <h5 class="text-sm font-semibold text-gray-700 mb-2">📊 Odhadované výsledky</h5>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                ${estimated.impressions ? `
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">Zobrazenia</div>
                  <div class="font-semibold">${estimated.impressions}</div>
                </div>
                ` : ''}
                ${estimated.clicks ? `
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">Kliknutia</div>
                  <div class="font-semibold">${estimated.clicks}</div>
                </div>
                ` : ''}
                ${estimated.conversions ? `
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">Konverzie</div>
                  <div class="font-semibold">${estimated.conversions}</div>
                </div>
                ` : ''}
                ${estimated.cpa ? `
                <div class="text-center p-2 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">CPA</div>
                  <div class="font-semibold">${estimated.cpa}</div>
                </div>
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            <!-- Ad Groups (loaded on expand) -->
            <div id="ad-groups-${campaign.id}">
              <h5 class="text-sm font-semibold text-gray-700 mb-2">📁 Reklamné skupiny</h5>
              <div class="text-center py-4 text-gray-400 text-sm">Načítavam...</div>
            </div>
            
            <!-- Actions -->
            <div class="flex gap-2 pt-2 border-t">
              <button onclick="CampaignProjectsModule.editCampaign('${campaign.id}')" 
                class="px-3 py-1 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                ✏️ Upraviť
              </button>
              <button onclick="CampaignProjectsModule.duplicateCampaign('${campaign.id}')" 
                class="px-3 py-1 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                📋 Duplikovať
              </button>
              <button onclick="CampaignProjectsModule.deleteCampaign('${campaign.id}')" 
                class="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 ml-auto">
                🗑️ Zmazať
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  async toggleCampaignDetail(campaignId) {
    const detail = document.getElementById(`campaign-detail-${campaignId}`);
    const arrow = document.getElementById(`arrow-${campaignId}`);
    
    if (detail.classList.contains('hidden')) {
      detail.classList.remove('hidden');
      arrow.style.transform = 'rotate(180deg)';
      
      // Load ad groups
      await this.loadAdGroups(campaignId);
    } else {
      detail.classList.add('hidden');
      arrow.style.transform = 'rotate(0deg)';
    }
  },
  
  async loadAdGroups(campaignId) {
    const container = document.getElementById(`ad-groups-${campaignId}`);
    
    try {
      const { data: adGroups } = await Database.client
        .from('ad_groups')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at');
      
      if (!adGroups || adGroups.length === 0) {
        container.innerHTML = `
          <h5 class="text-sm font-semibold text-gray-700 mb-2">📁 Reklamné skupiny</h5>
          <div class="text-center py-4 text-gray-400 text-sm">Žiadne reklamné skupiny</div>
        `;
        return;
      }
      
      // Load ads for each ad group
      const adGroupIds = adGroups.map(ag => ag.id);
      const { data: ads } = await Database.client
        .from('ads')
        .select('*')
        .in('ad_group_id', adGroupIds);
      
      const adsByGroup = {};
      (ads || []).forEach(ad => {
        if (!adsByGroup[ad.ad_group_id]) adsByGroup[ad.ad_group_id] = [];
        adsByGroup[ad.ad_group_id].push(ad);
      });
      
      container.innerHTML = `
        <h5 class="text-sm font-semibold text-gray-700 mb-2">📁 Reklamné skupiny (${adGroups.length})</h5>
        <div class="space-y-2">
          ${adGroups.map(ag => `
            <div class="border rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium">${ag.name}</span>
                <span class="text-xs text-gray-500">${(adsByGroup[ag.id] || []).length} reklám</span>
              </div>
              ${ag.keywords?.length ? `
              <div class="flex flex-wrap gap-1 mb-2">
                ${ag.keywords.slice(0, 5).map(k => `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">${k}</span>`).join('')}
                ${ag.keywords.length > 5 ? `<span class="text-xs text-gray-400">+${ag.keywords.length - 5}</span>` : ''}
              </div>
              ` : ''}
              ${adsByGroup[ag.id]?.length ? `
              <div class="space-y-1">
                ${adsByGroup[ag.id].slice(0, 3).map(ad => `
                  <div class="bg-gray-50 rounded p-2 text-sm">
                    <div class="font-medium text-blue-600">${ad.headlines?.[0] || 'Reklama'}</div>
                    <div class="text-gray-500 text-xs truncate">${ad.descriptions?.[0] || ''}</div>
                  </div>
                `).join('')}
                ${adsByGroup[ag.id].length > 3 ? `<div class="text-xs text-gray-400 text-center">+${adsByGroup[ag.id].length - 3} ďalších reklám</div>` : ''}
              </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Load ad groups error:', error);
      container.innerHTML = `
        <h5 class="text-sm font-semibold text-gray-700 mb-2">📁 Reklamné skupiny</h5>
        <div class="text-center py-4 text-red-400 text-sm">Chyba pri načítaní</div>
      `;
    }
  },
  
  async duplicateCampaign(campaignId) {
    Utils.toast('Duplikovanie kampane - pripravuje sa', 'info');
  },
  
  async deleteCampaign(campaignId) {
    if (!confirm('Naozaj chcete zmazať túto kampaň?')) return;
    
    try {
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
