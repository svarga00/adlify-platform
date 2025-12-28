/**
 * ADLIFY PLATFORM - Clients Module
 * @version 1.0.0
 */

const ClientsModule = {
  id: 'clients',
  name: 'Klienti',
  icon: '🏢',
  title: 'Klienti',
  subtitle: 'Správa klientov a služieb',
  
  menu: {
    section: 'main',
    order: 30
  },
  
  permissions: ['clients', 'view'],
  
  // State
  clients: [],
  currentClient: null,
  
  /**
   * Initialize module
   */
  init() {
    console.log('🏢 Clients module initialized');
  },
  
  /**
   * Render clients page
   */
  async render(container, params = {}) {
    // Check if viewing specific client
    if (params.id) {
      await this.renderClientDetail(container, params.id);
      return;
    }
    
    // Show loading
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      // Fetch clients
      this.clients = await Database.getClients();
      
      // Render list
      container.innerHTML = this.templateList();
      
    } catch (error) {
      console.error('Clients error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  /**
   * Client list template
   */
  templateList() {
    const activeClients = this.clients.filter(c => c.status === 'active');
    const totalMRR = activeClients.reduce((sum, c) => sum + (parseFloat(c.monthly_fee) || 0), 0);
    
    return `
      <!-- Stats -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="card p-4">
          <div class="text-sm text-gray-500">Celkom klientov</div>
          <div class="text-2xl font-bold">${this.clients.length}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-500">Aktívnych</div>
          <div class="text-2xl font-bold text-green-600">${activeClients.length}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-500">MRR</div>
          <div class="text-2xl font-bold">${Utils.formatCurrency(totalMRR)}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-500">Priem. hodnota</div>
          <div class="text-2xl font-bold">${Utils.formatCurrency(activeClients.length > 0 ? totalMRR / activeClients.length : 0)}</div>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="flex justify-between items-center mb-4">
        <input type="text" placeholder="🔍 Hľadať klienta..." 
          class="p-2 border rounded-lg w-64" onkeyup="ClientsModule.filter(this.value)">
        <button onclick="ClientsModule.showAddModal()" class="gradient-bg text-white px-4 py-2 rounded-xl font-medium">
          ➕ Nový klient
        </button>
      </div>
      
      <!-- Clients List -->
      <div class="card overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="text-left p-4 font-medium">Klient</th>
              <th class="text-left p-4 font-medium">Balík</th>
              <th class="text-left p-4 font-medium">MRR</th>
              <th class="text-left p-4 font-medium">Služby</th>
              <th class="text-left p-4 font-medium">Stav</th>
              <th class="text-left p-4 font-medium">Akcie</th>
            </tr>
          </thead>
          <tbody class="divide-y" id="clients-list">
            ${this.renderClientRows()}
          </tbody>
        </table>
      </div>
    `;
  },
  
  /**
   * Render client rows
   */
  renderClientRows() {
    if (this.clients.length === 0) {
      return '<tr><td colspan="6" class="p-8 text-center text-gray-400">Žiadni klienti</td></tr>';
    }
    
    return this.clients.map(client => {
      const packages = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
      const servicesCount = client.services?.length || 0;
      
      return `
        <tr class="hover:bg-gray-50 cursor-pointer" onclick="Router.navigate('clients', {id: '${client.id}'})">
          <td class="p-4">
            <div class="font-medium">${client.company_name}</div>
            <div class="text-sm text-gray-500">${client.contact_person || ''}</div>
          </td>
          <td class="p-4">
            <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
              ${packages[client.package] || client.package || '-'}
            </span>
          </td>
          <td class="p-4 font-medium">${Utils.formatCurrency(client.monthly_fee)}</td>
          <td class="p-4">
            <span class="text-sm">${servicesCount} služieb</span>
          </td>
          <td class="p-4">
            ${Utils.statusBadge(client.status, 'client')}
          </td>
          <td class="p-4">
            <button onclick="event.stopPropagation(); ClientsModule.showActions('${client.id}')" 
              class="p-2 hover:bg-gray-100 rounded-lg">⚙️</button>
          </td>
        </tr>
      `;
    }).join('');
  },
  
  /**
   * Render client detail page
   */
  async renderClientDetail(container, clientId) {
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      this.currentClient = await Database.getClient(clientId);
      
      if (!this.currentClient) {
        Utils.showEmpty(container, 'Klient nenájdený', '🔍');
        return;
      }
      
      container.innerHTML = this.templateDetail();
      
    } catch (error) {
      console.error('Client detail error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  /**
   * Client detail template
   */
  templateDetail() {
    const c = this.currentClient;
    const packages = { starter: 'Starter (149€)', pro: 'Pro (249€)', enterprise: 'Enterprise (399€)' };
    
    return `
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-4">
          <a href="#clients" class="p-2 hover:bg-gray-100 rounded-lg">←</a>
          <div>
            <h1 class="text-2xl font-bold">${c.company_name}</h1>
            <p class="text-gray-500">${c.industry || ''} ${c.city ? '· ' + c.city : ''}</p>
          </div>
          ${Utils.statusBadge(c.status, 'client')}
        </div>
        <div class="flex gap-2">
          <button onclick="ClientsModule.edit('${c.id}')" class="px-4 py-2 bg-gray-100 rounded-xl">✏️ Upraviť</button>
          <button class="gradient-bg text-white px-4 py-2 rounded-xl">📧 Kontaktovať</button>
        </div>
      </div>
      
      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="card p-4 border-l-4 border-purple-500">
          <div class="text-sm text-gray-500">Balík</div>
          <div class="text-lg font-bold">${packages[c.package] || '-'}</div>
        </div>
        <div class="card p-4 border-l-4 border-green-500">
          <div class="text-sm text-gray-500">MRR</div>
          <div class="text-lg font-bold">${Utils.formatCurrency(c.monthly_fee)}</div>
        </div>
        <div class="card p-4 border-l-4 border-blue-500">
          <div class="text-sm text-gray-500">Aktívne služby</div>
          <div class="text-lg font-bold">${c.services?.filter(s => s.status === 'active').length || 0}</div>
        </div>
        <div class="card p-4 border-l-4 border-orange-500">
          <div class="text-sm text-gray-500">Spolupráca od</div>
          <div class="text-lg font-bold">${c.contract_start ? Utils.formatDate(c.contract_start, 'medium') : '-'}</div>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="flex gap-2 mb-6">
        <button onclick="ClientsModule.showDetailTab('info')" class="tab-btn active" data-tab="info">📋 Info</button>
        <button onclick="ClientsModule.showDetailTab('services')" class="tab-btn" data-tab="services">💼 Služby</button>
        <button onclick="ClientsModule.showDetailTab('campaigns')" class="tab-btn" data-tab="campaigns">📊 Kampane</button>
        <button onclick="ClientsModule.showDetailTab('invoices')" class="tab-btn" data-tab="invoices">💰 Faktúry</button>
        <button onclick="ClientsModule.showDetailTab('timeline')" class="tab-btn" data-tab="timeline">📜 História</button>
      </div>
      
      <!-- Tab Content -->
      <div id="detail-tab-info" class="detail-tab-content">
        ${this.templateDetailInfo()}
      </div>
      
      <div id="detail-tab-services" class="detail-tab-content hidden">
        ${this.templateDetailServices()}
      </div>
      
      <div id="detail-tab-campaigns" class="detail-tab-content hidden">
        ${this.templateDetailCampaigns()}
      </div>
      
      <div id="detail-tab-invoices" class="detail-tab-content hidden">
        ${this.templateDetailInvoices()}
      </div>
      
      <div id="detail-tab-timeline" class="detail-tab-content hidden">
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📜 História aktivít</h3>
          <div class="text-center text-gray-400 py-8">
            Zatiaľ žiadne aktivity
          </div>
        </div>
      </div>
      
      <style>
        .tab-btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; }
        .tab-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .detail-tab-content.hidden { display: none; }
      </style>
    `;
  },
  
  templateDetailInfo() {
    const c = this.currentClient;
    return `
      <div class="grid md:grid-cols-2 gap-6">
        <div class="card p-6">
          <h3 class="font-semibold mb-4">🏢 Firemné údaje</h3>
          <div class="space-y-3">
            <div class="flex justify-between"><span class="text-gray-500">IČO</span><span>${c.ico || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">DIČ</span><span>${c.dic || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">IČ DPH</span><span>${c.ic_dph || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Web</span>
              ${c.website ? `<a href="${c.website}" target="_blank" class="text-primary hover:underline">${c.website}</a>` : '-'}
            </div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">👤 Kontakt</h3>
          <div class="space-y-3">
            <div class="flex justify-between"><span class="text-gray-500">Kontaktná osoba</span><span>${c.contact_person || '-'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Email</span>
              ${c.email ? `<a href="mailto:${c.email}" class="text-primary hover:underline">${c.email}</a>` : '-'}
            </div>
            <div class="flex justify-between"><span class="text-gray-500">Telefón</span>
              ${c.phone ? `<a href="tel:${c.phone}" class="text-primary hover:underline">${Utils.formatPhone(c.phone)}</a>` : '-'}
            </div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📍 Adresa</h3>
          <div class="space-y-1">
            <div>${c.street || '-'}</div>
            <div>${c.zip || ''} ${c.city || ''}</div>
            <div>${c.country || 'Slovensko'}</div>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📝 Poznámky</h3>
          <p class="text-gray-600">${c.notes || 'Žiadne poznámky'}</p>
        </div>
      </div>
    `;
  },
  
  templateDetailServices() {
    const services = this.currentClient.services || [];
    const serviceTypes = {
      google_ads: { name: 'Google Ads', icon: '🔍' },
      meta_ads: { name: 'Meta Ads', icon: '📘' },
      seo: { name: 'SEO', icon: '📈' },
      content: { name: 'Content', icon: '✏️' },
      web: { name: 'Web', icon: '🌐' }
    };
    
    return `
      <div class="card overflow-hidden">
        <div class="p-4 border-b flex justify-between items-center">
          <h3 class="font-semibold">💼 Služby (${services.length})</h3>
          <button onclick="ClientsModule.addService('${this.currentClient.id}')" 
            class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">➕ Pridať</button>
        </div>
        <div class="divide-y">
          ${services.length > 0 ? services.map(s => {
            const type = serviceTypes[s.service_type] || { name: s.service_type, icon: '📋' };
            return `
              <div class="p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">${type.icon}</span>
                  <div>
                    <div class="font-medium">${s.name || type.name}</div>
                    <div class="text-sm text-gray-500">${Utils.formatCurrency(s.monthly_fee)}/mes + ${Utils.formatCurrency(s.ad_budget_monthly)} rozpočet</div>
                  </div>
                </div>
                ${Utils.statusBadge(s.status, 'campaign')}
              </div>
            `;
          }).join('') : '<div class="p-8 text-center text-gray-400">Žiadne služby</div>'}
        </div>
      </div>
    `;
  },
  
  templateDetailCampaigns() {
    const campaigns = this.currentClient.campaigns || [];
    return `
      <div class="card overflow-hidden">
        <div class="p-4 border-b">
          <h3 class="font-semibold">📊 Kampane (${campaigns.length})</h3>
        </div>
        <div class="divide-y">
          ${campaigns.length > 0 ? campaigns.map(c => `
            <div class="p-4 flex items-center justify-between">
              <div>
                <div class="font-medium">${c.name}</div>
                <div class="text-sm text-gray-500">${c.platform} · ${c.type || '-'}</div>
              </div>
              ${Utils.statusBadge(c.status, 'campaign')}
            </div>
          `).join('') : '<div class="p-8 text-center text-gray-400">Žiadne kampane</div>'}
        </div>
      </div>
    `;
  },
  
  templateDetailInvoices() {
    const invoices = this.currentClient.invoices || [];
    return `
      <div class="card overflow-hidden">
        <div class="p-4 border-b flex justify-between items-center">
          <h3 class="font-semibold">💰 Faktúry (${invoices.length})</h3>
          <button class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">➕ Nová faktúra</button>
        </div>
        <div class="divide-y">
          ${invoices.length > 0 ? invoices.map(i => `
            <div class="p-4 flex items-center justify-between">
              <div>
                <div class="font-medium">${i.invoice_number}</div>
                <div class="text-sm text-gray-500">Splatnosť: ${Utils.formatDate(i.due_date, 'medium')}</div>
              </div>
              <div class="text-right">
                <div class="font-bold">${Utils.formatCurrency(i.total)}</div>
                ${Utils.statusBadge(i.status, 'invoice')}
              </div>
            </div>
          `).join('') : '<div class="p-8 text-center text-gray-400">Žiadne faktúry</div>'}
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // ACTIONS
  // ==========================================
  
  showDetailTab(tab) {
    document.querySelectorAll('.detail-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('detail-tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  },
  
  filter(value) {
    const rows = document.querySelectorAll('#clients-list tr');
    const search = value.toLowerCase();
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(search) ? '' : 'none';
    });
  },
  
  showAddModal() {
    Utils.toast('Pridanie klienta - TODO', 'info');
  },
  
  showActions(id) {
    Utils.toast('Akcie - TODO', 'info');
  },
  
  edit(id) {
    Utils.toast('Úprava klienta - TODO', 'info');
  },
  
  addService(clientId) {
    Utils.toast('Pridanie služby - TODO', 'info');
  }
};

// Export
window.ClientsModule = ClientsModule;
