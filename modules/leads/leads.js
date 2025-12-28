/**
 * ADLIFY PLATFORM - Leads Module
 * @version 1.0.0
 */

const LeadsModule = {
  id: 'leads',
  name: 'Leady',
  icon: '👥',
  title: 'Leady',
  subtitle: 'Správa potenciálnych klientov',
  
  menu: {
    section: 'main',
    order: 20
  },
  
  permissions: ['leads', 'view'],
  
  // State
  leads: [],
  selectedIds: new Set(),
  filters: {
    status: '',
    search: '',
    minScore: ''
  },
  
  /**
   * Initialize module
   */
  init() {
    console.log('👥 Leads module initialized');
  },
  
  /**
   * Render leads page
   */
  async render(container, params = {}) {
    // Apply URL params to filters
    if (params.status) this.filters.status = params.status;
    
    // Show loading
    container.innerHTML = this.templateLoading();
    
    try {
      // Fetch leads
      await this.loadLeads();
      
      // Render
      container.innerHTML = this.template();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Handle special actions from URL
      if (params.action === 'analyze-all') {
        this.analyzeAllNew();
      }
      
    } catch (error) {
      console.error('Leads error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  /**
   * Load leads from database
   */
  async loadLeads() {
    const filters = {};
    if (this.filters.status) filters.status = this.filters.status;
    
    this.leads = await Database.getLeads(filters);
    
    // Apply search filter (client-side)
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      this.leads = this.leads.filter(l => 
        (l.company_name || '').toLowerCase().includes(search) ||
        (l.domain || '').toLowerCase().includes(search)
      );
    }
    
    // Apply score filter
    if (this.filters.minScore) {
      this.leads = this.leads.filter(l => (l.score || 0) >= parseInt(this.filters.minScore));
    }
  },
  
  /**
   * Main template
   */
  template() {
    return `
      <!-- Tabs -->
      <div class="flex gap-2 mb-6">
        <button onclick="LeadsModule.showTab('list')" class="tab-btn active" data-tab="list">📋 Zoznam</button>
        <button onclick="LeadsModule.showTab('import')" class="tab-btn" data-tab="import">📥 Import</button>
        <button onclick="LeadsModule.showTab('add')" class="tab-btn" data-tab="add">✏️ Pridať</button>
      </div>
      
      <!-- List Tab -->
      <div id="tab-list" class="tab-content">
        <!-- Filters -->
        <div class="card p-4 mb-4 flex flex-wrap gap-4 items-center">
          <input type="text" id="filter-search" placeholder="🔍 Hľadať..." value="${this.filters.search}"
            class="flex-1 min-w-[200px] p-2 border rounded-lg" onkeyup="LeadsModule.onSearchChange(this.value)">
          
          <select id="filter-status" class="p-2 border rounded-lg" onchange="LeadsModule.onStatusChange(this.value)">
            <option value="">Všetky stavy</option>
            <option value="new" ${this.filters.status === 'new' ? 'selected' : ''}>🆕 Nové</option>
            <option value="ready" ${this.filters.status === 'ready' ? 'selected' : ''}>✨ Ready</option>
            <option value="contacted" ${this.filters.status === 'contacted' ? 'selected' : ''}>📧 Kontaktované</option>
            <option value="converted" ${this.filters.status === 'converted' ? 'selected' : ''}>✅ Klienti</option>
          </select>
          
          <select id="filter-score" class="p-2 border rounded-lg" onchange="LeadsModule.onScoreChange(this.value)">
            <option value="">Akékoľvek skóre</option>
            <option value="80">⭐ 80+</option>
            <option value="60">👍 60+</option>
          </select>
          
          <div class="flex gap-2">
            <button onclick="LeadsModule.selectAll()" class="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">☑️ Všetky</button>
            <button onclick="LeadsModule.analyzeSelected()" class="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">🤖 Analyzovať</button>
            <button onclick="LeadsModule.deleteSelected()" class="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">🗑️</button>
          </div>
        </div>
        
        <!-- Leads List -->
        <div class="card overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span class="font-medium">Leady (<span id="leads-count">${this.leads.length}</span>)</span>
          </div>
          <div id="leads-list" class="divide-y max-h-[60vh] overflow-y-auto">
            ${this.renderLeadsList()}
          </div>
        </div>
      </div>
      
      <!-- Import Tab -->
      <div id="tab-import" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">📥 Import domén</h2>
          <div class="grid md:grid-cols-4 gap-4">
            <div class="md:col-span-3">
              <textarea id="import-domains" rows="8" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk" 
                class="w-full p-3 border rounded-xl font-mono text-sm"></textarea>
            </div>
            <div class="space-y-4">
              <button onclick="LeadsModule.handleImport()" class="w-full gradient-bg text-white font-semibold py-3 rounded-xl">
                📥 Importovať
              </button>
              <div class="text-sm text-gray-500">
                <p class="font-medium mb-1">Formát:</p>
                <p>Jedna doména na riadok</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Add Tab -->
      <div id="tab-add" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">✏️ Pridať lead manuálne</h2>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Názov firmy *</label>
              <input type="text" id="add-name" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Doména</label>
              <input type="text" id="add-domain" placeholder="firma.sk" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Odvetvie *</label>
              <input type="text" id="add-industry" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Mesto *</label>
              <input type="text" id="add-city" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Email</label>
              <input type="email" id="add-email" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Telefón</label>
              <input type="tel" id="add-phone" class="w-full p-3 border rounded-xl">
            </div>
          </div>
          <div class="mt-6">
            <button onclick="LeadsModule.handleAdd()" class="gradient-bg text-white font-semibold px-8 py-3 rounded-xl">
              ➕ Pridať lead
            </button>
          </div>
        </div>
      </div>
      
      <style>
        .tab-btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; }
        .tab-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .tab-content.hidden { display: none; }
      </style>
    `;
  },
  
  /**
   * Render leads list
   */
  renderLeadsList() {
    if (this.leads.length === 0) {
      return '<div class="p-8 text-center text-gray-400">Žiadne leady</div>';
    }
    
    return this.leads.map(lead => {
      const a = lead.analysis || {};
      return `
        <div class="px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
          <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} 
            onchange="LeadsModule.toggleSelect('${lead.id}')" class="w-4 h-4 rounded">
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-0.5">
              <strong class="truncate">${lead.company_name || lead.domain || 'Neznámy'}</strong>
              ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="text-xs text-primary hover:underline">${lead.domain}</a>` : ''}
              ${Utils.statusBadge(lead.status, 'lead')}
            </div>
            <div class="text-xs text-gray-500">
              ${a.city ? '📍' + a.city : ''} ${a.industry ? '· ' + a.industry : ''}
            </div>
          </div>
          
          ${Utils.scoreBadge(lead.score)}
          
          <div class="flex gap-1">
            <button onclick="LeadsModule.analyze('${lead.id}')" class="p-2 hover:bg-gray-100 rounded-lg text-sm" title="Analyzovať">🤖</button>
            <button onclick="LeadsModule.showActions('${lead.id}')" class="p-2 hover:bg-gray-100 rounded-lg text-sm" title="Akcie">⚙️</button>
          </div>
        </div>
      `;
    }).join('');
  },
  
  templateLoading() {
    return '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
  },
  
  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  
  setupEventListeners() {
    // Debounced search
    let searchTimeout;
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.onSearchChange(e.target.value), 300);
      });
    }
  },
  
  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  },
  
  async onSearchChange(value) {
    this.filters.search = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  async onStatusChange(value) {
    this.filters.status = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  async onScoreChange(value) {
    this.filters.minScore = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  },
  
  selectAll() {
    this.leads.forEach(l => this.selectedIds.add(l.id));
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },
  
  // ==========================================
  // ACTIONS
  // ==========================================
  
  async handleImport() {
    const textarea = document.getElementById('import-domains');
    const text = textarea.value.trim();
    if (!text) return Utils.toast('Zadaj domény', 'warning');
    
    const domains = text.split('\n')
      .map(d => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
      .filter(d => d.includes('.'));
    
    let added = 0, skipped = 0;
    
    for (const domain of domains) {
      try {
        const existing = await Database.select('leads', { filters: { domain }, limit: 1 });
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }
        
        await Database.insert('leads', {
          domain,
          company_name: domain.split('.')[0],
          status: 'new',
          score: 50
        });
        added++;
      } catch (e) {
        console.error('Import error:', e);
      }
    }
    
    Utils.toast(`Pridaných: ${added}, Preskočených: ${skipped}`, 'success');
    textarea.value = '';
    
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  async handleAdd() {
    const name = document.getElementById('add-name').value.trim();
    const industry = document.getElementById('add-industry').value.trim();
    const city = document.getElementById('add-city').value.trim();
    
    if (!name || !industry || !city) {
      return Utils.toast('Vyplň povinné polia', 'warning');
    }
    
    const domain = document.getElementById('add-domain').value.trim();
    const email = document.getElementById('add-email').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    
    const analysis = { industry, city, company_name: name };
    if (email) analysis.email = email;
    if (phone) analysis.phone = phone;
    
    try {
      await Database.insert('leads', {
        domain: domain || `${Utils.slugify(name)}.local`,
        company_name: name,
        status: 'new',
        score: 60,
        analysis
      });
      
      Utils.toast('Lead pridaný!', 'success');
      
      // Clear form
      ['add-name', 'add-domain', 'add-industry', 'add-city', 'add-email', 'add-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      
      await this.loadLeads();
      this.showTab('list');
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      document.getElementById('leads-count').textContent = this.leads.length;
      
    } catch (e) {
      Utils.toast('Chyba: ' + e.message, 'error');
    }
  },
  
  async analyze(id) {
    Utils.toast('Analýza zatiaľ nie je implementovaná', 'info');
    // TODO: Implement AI analysis
  },
  
  async analyzeSelected() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Označ leady', 'warning');
    }
    Utils.toast(`Analýza ${this.selectedIds.size} leadov...`, 'info');
    // TODO: Implement
  },
  
  async analyzeAllNew() {
    const newLeads = this.leads.filter(l => l.status === 'new');
    if (newLeads.length === 0) {
      return Utils.toast('Žiadne nové leady', 'info');
    }
    Utils.toast(`Analýza ${newLeads.length} nových leadov...`, 'info');
    // TODO: Implement
  },
  
  async deleteSelected() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Označ leady', 'warning');
    }
    
    const confirmed = await Utils.confirm(`Vymazať ${this.selectedIds.size} leadov?`);
    if (!confirmed) return;
    
    for (const id of this.selectedIds) {
      await Database.delete('leads', id);
    }
    
    this.selectedIds.clear();
    Utils.toast('Leady vymazané', 'success');
    
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  showActions(id) {
    Utils.toast('Akcie - TODO', 'info');
    // TODO: Show actions modal
  }
};

// Export
window.LeadsModule = LeadsModule;
