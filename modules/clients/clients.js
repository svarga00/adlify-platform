/**
 * ADLIFY PLATFORM - Clients Module v2.0
 * Full CRUD, Onboarding & Project Integration
 */

const ClientsModule = {
  id: 'clients',
  name: 'Klienti',
  icon: '🏢',
  title: 'Klienti',
  subtitle: 'Správa klientov a služieb',
  
  menu: { section: 'main', order: 30 },
  permissions: ['clients', 'view'],
  
  // State
  clients: [],
  currentClient: null,
  filters: { status: '', search: '' },
  
  // Packages definition
  PACKAGES: {
    starter: { name: 'Starter', price: 149, icon: '🚀' },
    pro: { name: 'Pro', price: 249, icon: '⭐' },
    enterprise: { name: 'Enterprise', price: 399, icon: '💎' },
    premium: { name: 'Premium', price: 799, icon: '🏆' }
  },
  
  // Status definitions
  STATUSES: {
    active: { label: 'Aktívny', color: 'green' },
    onboarding: { label: 'Onboarding', color: 'blue' },
    paused: { label: 'Pozastavený', color: 'yellow' },
    churned: { label: 'Odišiel', color: 'red' }
  },
  
  // Onboarding statuses
  ONBOARDING_STATUSES: {
    pending: { label: 'Čaká', color: 'gray', icon: '⏳' },
    sent: { label: 'Odoslaný', color: 'blue', icon: '📧' },
    in_progress: { label: 'Vypĺňa', color: 'yellow', icon: '✏️' },
    completed: { label: 'Dokončený', color: 'green', icon: '✅' }
  },

  init() {
    console.log('🏢 Clients module v2.0 initialized');
  },
  
  async render(container, params = {}) {
    if (params.id) {
      await this.renderClientDetail(container, params.id);
      return;
    }
    
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      await this.loadClients();
      container.innerHTML = this.template();
      this.setupEventListeners();
    } catch (error) {
      console.error('Clients error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  async loadClients() {
    try {
      // Použijem Database.select helper
      const filters = {};
      if (this.filters.status) {
        filters.status = this.filters.status;
      }
      
      this.clients = await Database.select('clients', {
        filters,
        order: { column: 'company_name', ascending: true }
      });
      
      // Apply search filter locally
      if (this.filters.search) {
        const search = this.filters.search.toLowerCase();
        this.clients = this.clients.filter(c => 
          c.company_name?.toLowerCase().includes(search) ||
          c.contact_person?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search)
        );
      }
    } catch (error) {
      console.error('Load clients error:', error);
      this.clients = [];
    }
  },
  
  template() {
    const activeClients = this.clients.filter(c => c.status === 'active');
    const totalMRR = activeClients.reduce((sum, c) => sum + (parseFloat(c.monthly_fee) || 0), 0);
    const onboardingCount = this.clients.filter(c => c.onboarding_status === 'in_progress' || c.onboarding_status === 'sent').length;
    
    return `
      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center">
          <div class="text-3xl font-bold text-gray-800">${this.clients.length}</div>
          <div class="text-sm text-gray-500">Celkom klientov</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-3xl font-bold text-green-600">${activeClients.length}</div>
          <div class="text-sm text-gray-500">Aktívnych</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-3xl font-bold text-blue-600">${onboardingCount}</div>
          <div class="text-sm text-gray-500">V onboardingu</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-3xl font-bold text-purple-600">${totalMRR.toFixed(0)}€</div>
          <div class="text-sm text-gray-500">MRR</div>
        </div>
      </div>
      
      <!-- Filters & Actions -->
      <div class="card p-4 mb-6">
        <div class="flex flex-wrap gap-4 items-center justify-between">
          <div class="flex gap-4 items-center flex-1">
            <input type="text" id="filter-search" placeholder="🔍 Hľadať klienta..." 
              value="${this.filters.search}" class="p-2 border rounded-lg w-64">
            <select id="filter-status" class="p-2 border rounded-lg" onchange="ClientsModule.onStatusFilter(this.value)">
              <option value="">Všetky stavy</option>
              ${Object.entries(this.STATUSES).map(([key, val]) => 
                `<option value="${key}" ${this.filters.status === key ? 'selected' : ''}>${val.label}</option>`
              ).join('')}
            </select>
          </div>
          <button onclick="ClientsModule.showAddModal()" class="gradient-bg text-white px-4 py-2 rounded-xl font-medium">
            ➕ Nový klient
          </button>
        </div>
      </div>
      
      <!-- Clients Grid -->
      <div id="clients-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${this.renderClientsGrid()}
      </div>
      
      <!-- Add/Edit Modal -->
      <div id="client-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 id="modal-title" class="text-xl font-bold">Nový klient</h2>
            <button onclick="ClientsModule.closeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="modal-content" class="p-6 overflow-y-auto flex-1"></div>
        </div>
      </div>
    `;
  },
  
  renderClientsGrid() {
    if (this.clients.length === 0) {
      return `
        <div class="col-span-full text-center py-16 text-gray-400">
          <div class="text-6xl mb-4">🏢</div>
          <h3 class="text-xl font-semibold mb-2">Žiadni klienti</h3>
          <p>Pridajte prvého klienta</p>
        </div>
      `;
    }
    
    return this.clients.map(client => this.renderClientCard(client)).join('');
  },
  
  renderClientCard(client) {
    const status = this.STATUSES[client.status] || this.STATUSES.active;
    const pkg = this.PACKAGES[client.package];
    const onboarding = this.ONBOARDING_STATUSES[client.onboarding_status] || this.ONBOARDING_STATUSES.pending;
    
    return `
      <div class="card p-5 hover:shadow-lg transition-shadow cursor-pointer" onclick="Router.navigate('clients', {id: '${client.id}'})">
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-lg truncate">${client.company_name}</h3>
            <p class="text-sm text-gray-500 truncate">${client.contact_person || client.email || 'Bez kontaktu'}</p>
          </div>
          <span class="px-2 py-1 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-700">
            ${status.label}
          </span>
        </div>
        
        <!-- Info -->
        <div class="space-y-2 mb-4 text-sm">
          ${pkg ? `
            <div class="flex justify-between">
              <span class="text-gray-500">Balík</span>
              <span class="font-medium">${pkg.icon} ${pkg.name}</span>
            </div>
          ` : ''}
          <div class="flex justify-between">
            <span class="text-gray-500">MRR</span>
            <span class="font-semibold">${client.monthly_fee || 0}€</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Onboarding</span>
            <span class="text-${onboarding.color}-600">${onboarding.icon} ${onboarding.label}</span>
          </div>
        </div>
        
        <!-- Contact icons -->
        <div class="flex gap-2 pt-3 border-t">
          ${client.email ? `
            <a href="mailto:${client.email}" onclick="event.stopPropagation()" 
              class="p-2 hover:bg-gray-100 rounded-lg" title="${client.email}">📧</a>
          ` : ''}
          ${client.phone ? `
            <a href="tel:${client.phone}" onclick="event.stopPropagation()" 
              class="p-2 hover:bg-gray-100 rounded-lg" title="${client.phone}">📞</a>
          ` : ''}
          ${client.website ? `
            <a href="${client.website.startsWith('http') ? client.website : 'https://' + client.website}" 
              target="_blank" onclick="event.stopPropagation()" 
              class="p-2 hover:bg-gray-100 rounded-lg" title="${client.website}">🌐</a>
          ` : ''}
          <div class="flex-1"></div>
          <button onclick="event.stopPropagation(); ClientsModule.editClient('${client.id}')" 
            class="p-2 hover:bg-blue-100 rounded-lg" title="Upraviť">✏️</button>
          <button onclick="event.stopPropagation(); ClientsModule.deleteClient('${client.id}')" 
            class="p-2 hover:bg-red-100 rounded-lg" title="Zmazať">🗑️</button>
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
        timeout = setTimeout(() => this.onSearchFilter(e.target.value), 300);
      });
    }
  },
  
  async onSearchFilter(value) {
    this.filters.search = value;
    await this.loadClients();
    document.getElementById('clients-grid').innerHTML = this.renderClientsGrid();
  },
  
  async onStatusFilter(status) {
    this.filters.status = status;
    await this.loadClients();
    document.getElementById('clients-grid').innerHTML = this.renderClientsGrid();
  },
  
  // ==========================================
  // MODAL
  // ==========================================
  
  showAddModal() {
    this.currentClient = null;
    document.getElementById('modal-title').textContent = 'Nový klient';
    document.getElementById('modal-content').innerHTML = this.renderForm();
    
    const modal = document.getElementById('client-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },
  
  editClient(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;
    
    this.currentClient = client;
    document.getElementById('modal-title').textContent = 'Upraviť klienta';
    document.getElementById('modal-content').innerHTML = this.renderForm(client);
    
    const modal = document.getElementById('client-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },
  
  closeModal() {
    const modal = document.getElementById('client-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    this.currentClient = null;
  },
  
  renderForm(client = {}) {
    return `
      <form id="client-form" class="space-y-6" onsubmit="event.preventDefault(); ClientsModule.saveClient(); return false;">
        <!-- Základné info -->
        <div>
          <h3 class="font-semibold mb-3 text-gray-700">🏢 Základné informácie</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="block text-sm font-medium mb-1">Názov firmy *</label>
              <input type="text" name="company_name" value="${client.company_name || ''}" 
                required class="w-full p-3 border rounded-xl" placeholder="Názov spoločnosti">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Kontaktná osoba</label>
              <input type="text" name="contact_person" value="${client.contact_person || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="Meno a priezvisko">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Odvetvie</label>
              <input type="text" name="industry" value="${client.industry || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="napr. E-commerce, Gastro...">
            </div>
          </div>
        </div>
        
        <!-- Kontakt -->
        <div>
          <h3 class="font-semibold mb-3 text-gray-700">📞 Kontaktné údaje</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Email *</label>
              <input type="email" name="email" value="${client.email || ''}" 
                required class="w-full p-3 border rounded-xl" placeholder="email@firma.sk">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Telefón</label>
              <input type="tel" name="phone" value="${client.phone || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="+421 9XX XXX XXX">
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium mb-1">Web</label>
              <input type="text" name="website" value="${client.website || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="www.firma.sk">
            </div>
          </div>
        </div>
        
        <!-- Adresa -->
        <div>
          <h3 class="font-semibold mb-3 text-gray-700">📍 Adresa</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="block text-sm font-medium mb-1">Ulica</label>
              <input type="text" name="street" value="${client.street || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="Ulica a číslo">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Mesto</label>
              <input type="text" name="city" value="${client.city || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="Mesto">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">PSČ</label>
              <input type="text" name="zip" value="${client.zip || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="XXX XX">
            </div>
          </div>
        </div>
        
        <!-- Fakturačné údaje -->
        <div>
          <h3 class="font-semibold mb-3 text-gray-700">🧾 Fakturačné údaje</h3>
          <div class="grid md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">IČO</label>
              <input type="text" name="ico" value="${client.ico || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="12345678">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">DIČ</label>
              <input type="text" name="dic" value="${client.dic || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="1234567890">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">IČ DPH</label>
              <input type="text" name="ic_dph" value="${client.ic_dph || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="SK1234567890">
            </div>
            <div class="md:col-span-3">
              <label class="block text-sm font-medium mb-1">Fakturačný email</label>
              <input type="email" name="billing_email" value="${client.billing_email || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="fakturacia@firma.sk">
            </div>
          </div>
        </div>
        
        <!-- Služby -->
        <div>
          <h3 class="font-semibold mb-3 text-gray-700">💼 Služby a platby</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Balík</label>
              <select name="package" class="w-full p-3 border rounded-xl">
                <option value="">Bez balíka</option>
                ${Object.entries(this.PACKAGES).map(([key, pkg]) => 
                  `<option value="${key}" ${client.package === key ? 'selected' : ''}>${pkg.icon} ${pkg.name} (${pkg.price}€)</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Mesačný poplatok (€)</label>
              <input type="number" name="monthly_fee" value="${client.monthly_fee || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="249">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Stav</label>
              <select name="status" class="w-full p-3 border rounded-xl">
                ${Object.entries(this.STATUSES).map(([key, val]) => 
                  `<option value="${key}" ${(client.status || 'active') === key ? 'selected' : ''}>${val.label}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Začiatok spolupráce</label>
              <input type="date" name="contract_start" value="${client.contract_start || ''}" 
                class="w-full p-3 border rounded-xl">
            </div>
          </div>
        </div>
        
        <!-- Poznámky -->
        <div>
          <label class="block text-sm font-medium mb-1">📝 Poznámky</label>
          <textarea name="notes" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Interné poznámky o klientovi...">${client.notes || ''}</textarea>
        </div>
        
        <!-- Actions -->
        <div class="flex gap-3 pt-4 border-t">
          <button type="button" onclick="ClientsModule.closeModal()" 
            class="flex-1 px-4 py-3 bg-gray-200 rounded-xl hover:bg-gray-300">
            Zrušiť
          </button>
          <button type="submit" class="flex-1 px-4 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
            ${client.id ? '💾 Uložiť zmeny' : '➕ Vytvoriť klienta'}
          </button>
        </div>
      </form>
    `;
  },
  
  // ==========================================
  // CRUD OPERATIONS
  // ==========================================
  
  async saveClient() {
    const form = document.getElementById('client-form');
    const formData = new FormData(form);
    
    const data = {
      company_name: formData.get('company_name'),
      contact_person: formData.get('contact_person') || null,
      industry: formData.get('industry') || null,
      email: formData.get('email'),
      phone: formData.get('phone') || null,
      website: formData.get('website') || null,
      street: formData.get('street') || null,
      city: formData.get('city') || null,
      zip: formData.get('zip') || null,
      ico: formData.get('ico') || null,
      dic: formData.get('dic') || null,
      ic_dph: formData.get('ic_dph') || null,
      billing_email: formData.get('billing_email') || null,
      package: formData.get('package') || null,
      monthly_fee: parseFloat(formData.get('monthly_fee')) || null,
      status: formData.get('status') || 'active',
      contract_start: formData.get('contract_start') || null,
      notes: formData.get('notes') || null
    };
    
    // Validate
    if (!data.company_name || !data.email) {
      Utils.toast('Vyplň názov firmy a email', 'warning');
      return;
    }
    
    try {
      if (this.currentClient?.id) {
        // Update
        await Database.update('clients', this.currentClient.id, data);
        Utils.toast('Klient aktualizovaný!', 'success');
      } else {
        // Create
        data.onboarding_status = 'pending';
        data.onboarding_token = this.generateToken();
        
        await Database.insert('clients', data);
        Utils.toast('Klient vytvorený!', 'success');
      }
      
      this.closeModal();
      
      // Refresh - naviguj na clients list
      Router.navigate('clients');
      
    } catch (error) {
      console.error('Save error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteClient(clientId) {
    if (!confirm('Naozaj chcete zmazať tohto klienta?')) return;
    
    try {
      await Database.delete('clients', clientId);
      
      Utils.toast('Klient zmazaný', 'success');
      await this.loadClients();
      
      const grid = document.getElementById('clients-grid');
      if (grid) {
        grid.innerHTML = this.renderClientsGrid();
      } else {
        Router.navigate('clients');
      }
      
    } catch (error) {
      console.error('Delete error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  generateToken() {
    return 'ob_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  },
  
  // ==========================================
  // CLIENT DETAIL
  // ==========================================
  
  async renderClientDetail(container, clientId) {
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      // Get client
      const client = await Database.select('clients', {
        filters: { id: clientId },
        single: true
      });
      
      if (!client) {
        Utils.showEmpty(container, 'Klient nenájdený', '🔍');
        return;
      }
      
      this.currentClient = client;
      
      // Load projects for this client
      try {
        const projects = await Database.select('campaign_projects', {
          filters: { client_id: clientId },
          order: { column: 'created_at', ascending: false }
        });
        this.currentClient.projects = projects || [];
      } catch (e) {
        this.currentClient.projects = [];
      }
      
      container.innerHTML = this.templateDetail();
      
    } catch (error) {
      console.error('Client detail error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  templateDetail() {
    const c = this.currentClient;
    const status = this.STATUSES[c.status] || this.STATUSES.active;
    const pkg = this.PACKAGES[c.package];
    const onboarding = this.ONBOARDING_STATUSES[c.onboarding_status] || this.ONBOARDING_STATUSES.pending;
    
    return `
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <a href="#clients" class="p-2 hover:bg-gray-100 rounded-lg text-xl">←</a>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">${c.company_name}</h1>
              <span class="px-2 py-1 rounded-full text-sm font-medium bg-${status.color}-100 text-${status.color}-700">
                ${status.label}
              </span>
            </div>
            <p class="text-gray-500">${c.industry || ''} ${c.city ? '• ' + c.city : ''}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="ClientsModule.editClient('${c.id}')" class="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200">
            ✏️ Upraviť
          </button>
          <button onclick="ClientsModule.sendOnboarding('${c.id}')" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200">
            📋 Onboarding
          </button>
          <button onclick="ClientsModule.createProject('${c.id}')" class="gradient-bg text-white px-4 py-2 rounded-xl">
            ➕ Nový projekt
          </button>
        </div>
      </div>
      
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 border-l-4 border-purple-500">
          <div class="text-sm text-gray-500">Balík</div>
          <div class="text-lg font-bold">${pkg ? pkg.icon + ' ' + pkg.name : '-'}</div>
        </div>
        <div class="card p-4 border-l-4 border-green-500">
          <div class="text-sm text-gray-500">MRR</div>
          <div class="text-lg font-bold">${c.monthly_fee || 0}€</div>
        </div>
        <div class="card p-4 border-l-4 border-blue-500">
          <div class="text-sm text-gray-500">Onboarding</div>
          <div class="text-lg font-bold text-${onboarding.color}-600">${onboarding.icon} ${onboarding.label}</div>
        </div>
        <div class="card p-4 border-l-4 border-orange-500">
          <div class="text-sm text-gray-500">Projekty</div>
          <div class="text-lg font-bold">${c.projects?.length || 0}</div>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="flex gap-2 mb-6 flex-wrap">
        <button onclick="ClientsModule.showTab('info')" class="tab-btn active" data-tab="info">📋 Info</button>
        <button onclick="ClientsModule.showTab('projects')" class="tab-btn" data-tab="projects">📁 Projekty</button>
        <button onclick="ClientsModule.showTab('onboarding')" class="tab-btn" data-tab="onboarding">📝 Onboarding</button>
        <button onclick="ClientsModule.showTab('invoices')" class="tab-btn" data-tab="invoices">💰 Faktúry</button>
      </div>
      
      <!-- Tab Content -->
      <div id="tab-info" class="tab-content">${this.templateTabInfo()}</div>
      <div id="tab-projects" class="tab-content hidden">${this.templateTabProjects()}</div>
      <div id="tab-onboarding" class="tab-content hidden">${this.templateTabOnboarding()}</div>
      <div id="tab-invoices" class="tab-content hidden">${this.templateTabInvoices()}</div>
      
      <!-- Add/Edit Modal -->
      <div id="client-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 id="modal-title" class="text-xl font-bold">Upraviť klienta</h2>
            <button onclick="ClientsModule.closeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="modal-content" class="p-6 overflow-y-auto flex-1"></div>
        </div>
      </div>
      
      <style>
        .tab-btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; }
        .tab-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .tab-content.hidden { display: none; }
      </style>
    `;
  },
  
  templateTabInfo() {
    const c = this.currentClient;
    return `
      <div class="grid md:grid-cols-2 gap-6">
        <div class="card p-6">
          <h3 class="font-semibold mb-4">🏢 Firemné údaje</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">IČO</span><span>${c.ico || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">DIČ</span><span>${c.dic || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">IČ DPH</span><span>${c.ic_dph || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Web</span>
              ${c.website ? `<a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" class="text-primary hover:underline">${c.website}</a>` : '-'}
            </div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">👤 Kontakt</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">Kontaktná osoba</span><span>${c.contact_person || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Email</span>
              ${c.email ? `<a href="mailto:${c.email}" class="text-primary hover:underline">${c.email}</a>` : '-'}
            </div>
            <div class="flex justify-between"><span class="text-gray-500">Telefón</span>
              ${c.phone ? `<a href="tel:${c.phone}" class="text-primary hover:underline">${c.phone}</a>` : '-'}
            </div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📍 Adresa</h3>
          <div class="text-sm space-y-1">
            <div>${c.street || '-'}</div>
            <div>${c.zip || ''} ${c.city || ''}</div>
            <div>${c.country || 'Slovensko'}</div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📝 Poznámky</h3>
          <p class="text-sm text-gray-600">${c.notes || 'Žiadne poznámky'}</p>
        </div>
      </div>
    `;
  },
  
  templateTabProjects() {
    const projects = this.currentClient.projects || [];
    
    const STATUSES = {
      draft: { label: 'Rozpracované', color: 'gray' },
      generating: { label: 'Generuje AI', color: 'purple' },
      internal_review: { label: 'Interná kontrola', color: 'yellow' },
      client_review: { label: 'Čaká na klienta', color: 'blue' },
      approved: { label: 'Schválené', color: 'green' },
      active: { label: 'Aktívne', color: 'emerald' }
    };
    
    return `
      <div class="card overflow-hidden">
        <div class="p-4 border-b flex justify-between items-center">
          <h3 class="font-semibold">📁 Projekty (${projects.length})</h3>
          <button onclick="ClientsModule.createProject('${this.currentClient.id}')" 
            class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200">
            ➕ Nový projekt
          </button>
        </div>
        ${projects.length > 0 ? `
          <div class="divide-y">
            ${projects.map(p => {
              const status = STATUSES[p.status] || STATUSES.draft;
              return `
                <div class="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer" 
                  onclick="Router.navigate('projects'); setTimeout(() => CampaignProjectsModule.showDetail('${p.id}'), 100)">
                  <div>
                    <div class="font-medium">${p.name}</div>
                    <div class="text-sm text-gray-500">
                      ${p.total_monthly_budget ? p.total_monthly_budget + '€/mes' : ''} 
                      • Vytvorené ${new Date(p.created_at).toLocaleDateString('sk')}
                    </div>
                  </div>
                  <span class="px-2 py-1 rounded-full text-xs bg-${status.color}-100 text-${status.color}-700">
                    ${status.label}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="p-8 text-center text-gray-400">
            <div class="text-4xl mb-2">📁</div>
            <p>Žiadne projekty</p>
            <button onclick="ClientsModule.createProject('${this.currentClient.id}')" 
              class="mt-4 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm">
              Vytvoriť prvý projekt
            </button>
          </div>
        `}
      </div>
    `;
  },
  
  templateTabOnboarding() {
    const c = this.currentClient;
    const onboarding = this.ONBOARDING_STATUSES[c.onboarding_status] || this.ONBOARDING_STATUSES.pending;
    const onboardingUrl = c.onboarding_token ? `${window.location.origin}/onboarding/${c.onboarding_token}` : null;
    
    return `
      <div class="card p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-semibold">📝 Onboarding formulár</h3>
          <span class="px-3 py-1 rounded-full text-sm bg-${onboarding.color}-100 text-${onboarding.color}-700">
            ${onboarding.icon} ${onboarding.label}
          </span>
        </div>
        
        ${onboardingUrl ? `
          <div class="bg-gray-50 rounded-xl p-4 mb-6">
            <label class="block text-sm font-medium mb-2">Link pre klienta</label>
            <div class="flex gap-2">
              <input type="text" readonly value="${onboardingUrl}" 
                class="flex-1 p-2 border rounded-lg bg-white text-sm" id="onboarding-url">
              <button onclick="ClientsModule.copyOnboardingUrl()" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                📋 Kopírovať
              </button>
            </div>
          </div>
        ` : ''}
        
        <div class="flex gap-3">
          <button onclick="ClientsModule.sendOnboarding('${c.id}')" 
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200">
            📧 Odoslať link emailom
          </button>
          <button onclick="ClientsModule.fillOnboarding('${c.id}')" 
            class="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200">
            ✏️ Vyplniť za klienta
          </button>
          ${c.onboarding_status === 'completed' ? `
            <button onclick="ClientsModule.viewOnboarding('${c.id}')" 
              class="px-4 py-2 bg-green-100 text-green-700 rounded-xl hover:bg-green-200">
              👁️ Zobraziť odpovede
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  templateTabInvoices() {
    return `
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">💰 Faktúry</h3>
          <button class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">➕ Nová faktúra</button>
        </div>
        <div class="text-center py-8 text-gray-400">
          <div class="text-4xl mb-2">💰</div>
          <p>Modul faktúr - pripravuje sa</p>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // TAB SWITCHING
  // ==========================================
  
  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  },
  
  // ==========================================
  // ACTIONS
  // ==========================================
  
  async createProject(clientId) {
    // Navigate to projects and open create modal
    Router.navigate('projects');
    setTimeout(() => {
      if (window.CampaignProjectsModule) {
        CampaignProjectsModule.showCreateModal();
        // Pre-select client
        setTimeout(() => {
          const clientSelect = document.getElementById('create-client');
          if (clientSelect) clientSelect.value = clientId;
        }, 100);
      }
    }, 200);
  },
  
  copyOnboardingUrl() {
    const input = document.getElementById('onboarding-url');
    if (input) {
      input.select();
      document.execCommand('copy');
      Utils.toast('Link skopírovaný!', 'success');
    }
  },
  
  async sendOnboarding(clientId) {
    Utils.toast('Odosielanie onboarding emailu - pripravuje sa', 'info');
  },
  
  fillOnboarding(clientId) {
    Utils.toast('Vyplnenie onboardingu - pripravuje sa', 'info');
  },
  
  viewOnboarding(clientId) {
    Utils.toast('Zobrazenie odpovedí - pripravuje sa', 'info');
  }
};

window.ClientsModule = ClientsModule;
