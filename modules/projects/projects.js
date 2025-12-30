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
    
    // Load onboarding data
    const { data: onboarding } = await Database.client
      .from('onboarding_responses')
      .select('*')
      .eq('client_id', project.client_id)
      .single();
    
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
        
        <!-- Client Portal Link (if exists) -->
        ${project.client_portal_token ? `
        <div class="card p-4 bg-blue-50 border border-blue-200">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-blue-800">🔗 Odkaz pre klienta</h4>
              <p class="text-sm text-blue-600 truncate max-w-md">${window.location.origin}/client-portal.html?token=${project.client_portal_token}</p>
            </div>
            <button onclick="CampaignProjectsModule.copyClientLink('${project.id}')" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              📋 Kopírovať
            </button>
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
        
        ${project.strategy_summary ? `
        <div class="card p-4 bg-purple-50">
          <h4 class="font-semibold mb-2 text-purple-800">🎯 Stratégia</h4>
          <p class="text-purple-700">${project.strategy_summary}</p>
        </div>
        ` : ''}
        
        <!-- Onboarding Data -->
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
        
        <!-- Actions -->
        <div class="flex flex-wrap gap-3 pt-4 border-t">
          ${this.renderDetailActions(project)}
        </div>
      </div>
    `;
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
    if (!confirm('Naozaj chcete zmazať túto kampaň? Zmažú sa aj všetky reklamné skupiny a reklamy.')) return;
    
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
          <button onclick="CampaignProjectsModule.previewAsClient('${project.id}')" 
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            ${!project.client_portal_token ? 'disabled title="Najprv vygenerujte odkaz"' : ''}>
            👁️ Náhľad portálu
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
  
  previewAsClient(projectId) {
    // Open client portal in new tab
    const project = this.projects.find(p => p.id === projectId);
    if (project?.client_portal_token) {
      window.open(`/client-portal.html?token=${project.client_portal_token}`, '_blank');
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
      
      const url = `${window.location.origin}/client-portal.html?token=${token}`;
      
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
    
    const url = `${window.location.origin}/client-portal.html?token=${project.client_portal_token}`;
    await navigator.clipboard.writeText(url);
    Utils.toast('Odkaz skopírovaný do schránky! 📋', 'success');
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
    if (!confirm('Naozaj chcete zmazať túto reklamu?')) return;
    
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
    if (!confirm('Naozaj chcete zmazať túto reklamnú skupinu? Zmažú sa aj všetky reklamy v nej.')) return;
    
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
    if (!confirm('Naozaj chcete zmazať túto reklamu?')) return;
    
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
