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
    const pausedCount = this.clients.filter(c => c.status === 'paused').length;

    return `
      <div class="adl">
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Klienti</h1>
            <div style="font-size:13px; color:var(--ink-sub);">
              ${activeClients.length} aktívnych · ${onboardingCount} v onboardingu · ${pausedCount} pauza
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ClientsModule.showAddModal()">
              ${I.Plus({size:14})} Nový klient
            </button>
          </div>
        </div>

        <!-- Stats -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:18px;" class="adl-clients-stats">
          <div class="adl-stat">
            <div class="adl-stat-head">
              <div class="adl-stat-label">Aktívni</div>
              ${activeClients.length ? `<span class="adl-chip adl-chip-mint adl-chip-sm">${Math.round(activeClients.length / Math.max(this.clients.length, 1) * 100)}%</span>` : ''}
            </div>
            <div class="adl-stat-value">${activeClients.length}</div>
          </div>
          <div class="adl-stat">
            <div class="adl-stat-head">
              <div class="adl-stat-label">MRR</div>
              <span class="adl-chip adl-chip-brand adl-chip-sm">priemer</span>
            </div>
            <div class="adl-stat-value">${totalMRR.toFixed(0)} €</div>
          </div>
          <div class="adl-stat">
            <div class="adl-stat-head">
              <div class="adl-stat-label">V onboardingu</div>
              <span class="adl-chip adl-chip-sky adl-chip-sm">rozpracované</span>
            </div>
            <div class="adl-stat-value">${onboardingCount}</div>
          </div>
          <div class="adl-stat">
            <div class="adl-stat-head">
              <div class="adl-stat-label">Celkom</div>
              <span class="adl-chip adl-chip-sm">všetci</span>
            </div>
            <div class="adl-stat-value">${this.clients.length}</div>
          </div>
        </div>

        <!-- Filters -->
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap;" class="adl-clients-filters">
          <div class="adl-input" style="flex:1; min-width:240px; max-width:340px;">
            <span style="color:var(--ink-mute); display:flex;">${I.Search({size:15})}</span>
            <input type="text" id="filter-search" placeholder="Hľadať klienta…" value="${this.filters.search}" style="flex:1; border:0; outline:none; background:transparent; font:inherit; color:inherit;">
          </div>
          <select class="adl-input" id="filter-status" onchange="ClientsModule.onStatusFilter(this.value)" style="width:auto;">
            <option value="">Všetky stavy</option>
            ${Object.entries(this.STATUSES).map(([key, val]) =>
              `<option value="${key}" ${this.filters.status === key ? 'selected' : ''}>${val.label}</option>`
            ).join('')}
          </select>
        </div>

        <!-- Clients Grid -->
        <div id="clients-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;" class="adl-clients-grid">
          ${this.renderClientsGrid()}
        </div>

        <!-- Add/Edit Modal -->
        <div id="client-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4" style="background:rgba(20,18,14,0.5);">
          <div style="background:var(--surface); border-radius:14px; max-width:720px; width:100%; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--sh-lg);">
            <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
              <h2 id="modal-title" style="font-size:16px; font-weight:600; margin:0;">Nový klient</h2>
              <button onclick="ClientsModule.closeModal()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:6px; width:32px; height:32px; justify-content:center;">${I.X({size:14})}</button>
            </div>
            <div id="modal-content" style="padding:20px; overflow-y:auto; flex:1;"></div>
          </div>
        </div>

        <style>
          @media (max-width: 1200px) { .adl-clients-grid { grid-template-columns: repeat(2, 1fr) !important; } .adl-clients-stats { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 700px)  { .adl-clients-grid { grid-template-columns: 1fr !important; } }
        </style>
      </div>
    `;
  },
  
  renderClientsGrid() {
    if (this.clients.length === 0) {
      return `
        <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--ink-sub); background: var(--surface); border: 1px solid var(--border); border-radius: 14px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Building({size:22})}</div>
          <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadni klienti</h3>
          <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Pridajte prvého klienta alebo dokončite onboarding existujúceho leadu</p>
          <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ClientsModule.showAddModal()">${I.Plus({size:14})} Nový klient</button>
        </div>
      `;
    }

    return this.clients.map(client => this.renderClientCard(client)).join('');
  },

  _statusTone(statusKey) {
    const map = {
      active: 'mint', inactive: 'n', paused: 'amber',
      trial: 'sky', lead: 'lav', churned: 'err'
    };
    return map[statusKey] || 'n';
  },

  renderClientCard(client) {
    const status = this.STATUSES[client.status] || this.STATUSES.active;
    const pkg = this.PACKAGES[client.package];
    const statusTone = this._statusTone(client.status);

    const logoChar = (client.company_name || '?')[0].toUpperCase();

    return `
      <div onclick="Router.navigate('clients', {id: '${client.id}'})" style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; box-shadow:var(--sh-sm); display:flex; flex-direction:column; gap:12px; cursor:pointer; transition: box-shadow .15s, border-color .15s;" onmouseover="this.style.borderColor='var(--border-strong)'; this.style.boxShadow='var(--sh-md)'" onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='var(--sh-sm)'">
        <!-- Header row -->
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:10px; background:var(--brand-50); color:var(--brand-700); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0;">${logoChar}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:600; letter-spacing:-0.2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${client.company_name}</div>
            <div style="font-size:11px; color:var(--ink-sub); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${client.contact_person || client.email || 'Bez kontaktu'}</div>
          </div>
          <span class="adl-chip adl-chip-${statusTone} adl-chip-sm"><span class="dot"></span>${status.label}</span>
        </div>

        <!-- Quick info grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 12px; background:var(--n-50); border-radius:8px;">
          <div>
            <div style="font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:0.8px;">Balík</div>
            <div style="font-size:13px; font-weight:600;">${pkg ? pkg.name : '—'}</div>
          </div>
          <div>
            <div style="font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:0.8px;">MRR</div>
            <div class="mono" style="font-size:13px; font-weight:600;">${client.monthly_fee || 0} €</div>
          </div>
        </div>

        <!-- Footer: contacts + actions -->
        <div style="display:flex; align-items:center; gap:6px; padding-top:6px; border-top:1px solid var(--border);">
          ${client.email ? `<a href="mailto:${client.email}" onclick="event.stopPropagation()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:0 8px;" title="${client.email}">${I.Mail({size:14})}</a>` : ''}
          ${client.phone ? `<a href="tel:${client.phone}" onclick="event.stopPropagation()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:0 8px;" title="${client.phone}">${I.Phone({size:14})}</a>` : ''}
          ${client.website ? `<a href="${client.website.startsWith('http') ? client.website : 'https://' + client.website}" target="_blank" onclick="event.stopPropagation()" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:0 8px;" title="${client.website}">${I.Globe({size:14})}</a>` : ''}
          <div style="flex:1;"></div>
          <button onclick="event.stopPropagation(); ClientsModule.editClient('${client.id}')" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:0 8px;" title="Upraviť">${I.Edit({size:14})}</button>
          <button onclick="event.stopPropagation(); ClientsModule.deleteClient('${client.id}')" class="adl-btn adl-btn-ghost adl-btn-sm" style="padding:0 8px; color:var(--err);" title="Zmazať">${I.Trash({size:14})}</button>
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
  
  async copyPortalLink(clientId) {
    try {
      // Načítať klienta s portal_token
      const { data: client, error } = await Database.client
        .from('clients')
        .select('id, portal_token, company_name')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      
      // Ak nemá token, vygeneruj ho
      let token = client.portal_token;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await Database.client
          .from('clients')
          .update({ portal_token: token })
          .eq('id', clientId);
      }
      
      // Vytvor link
      const baseUrl = window.location.origin;
      const portalLink = `${baseUrl}/portal/?token=${token}`;
      
      // Kopíruj do schránky
      await navigator.clipboard.writeText(portalLink);
      
      Utils.toast(`Portál link pre ${client.company_name} skopírovaný!`, 'success');
      
    } catch (error) {
      console.error('Copy portal link error:', error);
      Utils.toast('Chyba pri kopírovaní linku', 'error');
    }
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
    if (!await Utils.confirm('Zmazať tohto klienta vrátane všetkých jeho dát?', { title: 'Zmazať klienta', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
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
      
      // Load subscription for this client
      try {
        const { data: subscriptions } = await Database.client
          .from('client_subscriptions')
          .select(`
            *,
            packages (id, name, icon, slug)
          `)
          .eq('client_id', clientId)
          .eq('status', 'active')
          .limit(1);
        
        if (subscriptions && subscriptions.length > 0) {
          const sub = subscriptions[0];
          this.currentClient.subscription = {
            ...sub,
            package_name: sub.packages?.name,
            package_icon: sub.packages?.icon
          };
        } else {
          this.currentClient.subscription = null;
        }
      } catch (e) {
        console.error('Load subscription error:', e);
        this.currentClient.subscription = null;
      }
      
      // Load extra services for this client
      try {
        const { data: services } = await Database.client
          .from('client_services')
          .select(`
            *,
            services (id, name, icon, category)
          `)
          .eq('client_id', clientId)
          .eq('status', 'active');
        
        this.currentClient.services = (services || []).map(s => ({
          ...s,
          name: s.services?.name,
          icon: s.services?.icon
        }));
      } catch (e) {
        console.error('Load client services error:', e);
        this.currentClient.services = [];
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
          <button onclick="ClientsModule.copyPortalLink('${c.id}')" class="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200" title="Kopírovať link na klientský portál">
            🔗 Portál
          </button>
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
        <button onclick="ClientsModule.showTab('subscription')" class="tab-btn" data-tab="subscription">📦 Predplatné</button>
        <button onclick="ClientsModule.showTab('projects')" class="tab-btn" data-tab="projects">📁 Projekty</button>
        <button onclick="ClientsModule.showTab('onboarding')" class="tab-btn" data-tab="onboarding">📝 Onboarding</button>
        <button onclick="ClientsModule.showTab('invoices')" class="tab-btn" data-tab="invoices">💰 Faktúry</button>
      </div>
      
      <!-- Tab Content -->
      <div id="tab-info" class="tab-content">${this.templateTabInfo()}</div>
      <div id="tab-subscription" class="tab-content hidden">${this.templateTabSubscription()}</div>
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
  
  templateTabSubscription() {
    const c = this.currentClient;
    const subscription = c.subscription || null;
    
    return `
      <div class="space-y-6">
        <!-- Current Subscription -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">📦 Aktuálne predplatné</h3>
            <button onclick="ClientsModule.showSubscriptionModal()" 
              class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm">
              ${subscription ? '✏️ Upraviť' : '➕ Priradiť balíček'}
            </button>
          </div>
          
          ${subscription ? `
            <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6">
              <div class="flex items-start justify-between">
                <div>
                  <div class="text-3xl mb-2">${subscription.package_icon || '📦'}</div>
                  <h4 class="text-xl font-bold">${subscription.package_name || 'Vlastný balíček'}</h4>
                  <p class="text-gray-500">${subscription.custom_name || ''}</p>
                </div>
                <div class="text-right">
                  <div class="text-3xl font-bold text-purple-600">${subscription.monthly_price}€</div>
                  <div class="text-gray-500">/mesiac</div>
                </div>
              </div>
              
              <div class="grid md:grid-cols-3 gap-4 mt-6 pt-4 border-t border-purple-200">
                <div>
                  <div class="text-xs text-gray-500">Status</div>
                  <div class="font-medium ${subscription.status === 'active' ? 'text-green-600' : 'text-gray-600'}">
                    ${subscription.status === 'active' ? '● Aktívne' : '○ ' + subscription.status}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-gray-500">Od</div>
                  <div class="font-medium">${subscription.start_date ? new Date(subscription.start_date).toLocaleDateString('sk-SK') : '-'}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500">Fakturačný deň</div>
                  <div class="font-medium">${subscription.billing_day || 1}. v mesiaci</div>
                </div>
              </div>
            </div>
          ` : `
            <div class="text-center py-8 bg-gray-50 rounded-xl">
              <div class="text-4xl mb-4">📦</div>
              <h4 class="text-lg font-medium text-gray-600">Žiadne predplatné</h4>
              <p class="text-gray-500 mb-4">Klient nemá priradený žiadny balíček</p>
              <button onclick="ClientsModule.showSubscriptionModal()" 
                class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                ➕ Priradiť balíček
              </button>
            </div>
          `}
        </div>
        
        <!-- Client Services -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">🔧 Extra služby</h3>
            <button onclick="ClientsModule.showAddServiceModal()" 
              class="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">
              ➕ Pridať službu
            </button>
          </div>
          
          <div id="client-services-list">
            ${this.renderClientServices()}
          </div>
        </div>
      </div>
    `;
  },
  
  renderClientServices() {
    const services = this.currentClient.services || [];
    
    if (services.length === 0) {
      return `
        <div class="text-center py-6 text-gray-500 text-sm">
          Žiadne extra služby
        </div>
      `;
    }
    
    return `
      <div class="divide-y">
        ${services.map(svc => `
          <div class="py-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-xl">${svc.icon || '📋'}</span>
              <div>
                <div class="font-medium">${svc.name}</div>
                <div class="text-xs text-gray-500">${svc.is_extra ? 'Extra k balíčku' : 'À la carte'}</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-medium">${svc.price || 0}€</span>
              <button onclick="ClientsModule.removeClientService('${svc.id}')" 
                class="p-1 hover:bg-red-100 rounded text-red-500">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },
  
  async showAddServiceModal() {
    // Načítaj dostupné služby z DB
    let services = [];
    try {
      const { data } = await Database.client.from('services').select('*').eq('is_active', true).order('sort_order');
      services = data || [];
    } catch (e) {
      console.error('Load services error:', e);
    }
    
    // Filtruj už priradené
    const existingIds = (this.currentClient.services || []).map(s => s.service_id);
    const available = services.filter(s => !existingIds.includes(s.id));
    
    if (available.length === 0 && services.length > 0) {
      Utils.toast('Všetky služby sú už priradené', 'info');
      return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'add-service-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9998;padding:1rem;';
    
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
        <div style="padding:1.25rem 1.5rem;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <h2 style="font-size:1.125rem;font-weight:600;margin:0;">🔧 Pridať extra službu</h2>
          <button onclick="document.getElementById('add-service-modal').remove()" style="background:#f1f5f9;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:1.25rem;">✕</button>
        </div>
        <div style="padding:1.5rem;">
          ${available.length > 0 ? `
            <div style="margin-bottom:1rem;">
              <label style="display:block;font-size:0.875rem;font-weight:500;margin-bottom:0.5rem;">Služba</label>
              <select id="add-service-select" style="width:100%;padding:0.75rem;border:1px solid #e2e8f0;border-radius:10px;">
                ${available.map(s => `<option value="${s.id}" data-price="${s.price || 0}" data-name="${s.name}">${s.icon || '📋'} ${s.name} ${s.price ? '(' + s.price + '€)' : ''}</option>`).join('')}
              </select>
            </div>
            <div style="margin-bottom:1rem;">
              <label style="display:block;font-size:0.875rem;font-weight:500;margin-bottom:0.5rem;">Cena (€/mesiac)</label>
              <input type="number" id="add-service-price" value="${available[0]?.price || 0}" style="width:100%;padding:0.75rem;border:1px solid #e2e8f0;border-radius:10px;" />
            </div>
            <div style="display:flex;gap:0.75rem;">
              <button onclick="document.getElementById('add-service-modal').remove()" style="flex:1;padding:0.625rem;border-radius:10px;border:1px solid #e2e8f0;background:white;cursor:pointer;">Zrušiť</button>
              <button onclick="ClientsModule.addClientService()" style="flex:1;padding:0.625rem;border-radius:10px;border:none;background:#8b5cf6;color:white;cursor:pointer;font-weight:600;">Pridať</button>
            </div>
          ` : `
            <div style="text-align:center;padding:2rem;color:#64748b;">
              <div style="font-size:2rem;margin-bottom:0.5rem;">📋</div>
              <p>Žiadne dostupné služby. Najprv ich vytvorte v module Služby.</p>
            </div>
          `}
        </div>
      </div>
    `;
    
    // Update ceny pri zmene výberu
    const select = modal.querySelector('#add-service-select');
    if (select) {
      select.addEventListener('change', () => {
        const opt = select.selectedOptions[0];
        const priceInput = document.getElementById('add-service-price');
        if (priceInput && opt) priceInput.value = opt.dataset.price || 0;
      });
    }
    
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  },
  
  async addClientService() {
    const select = document.getElementById('add-service-select');
    const priceInput = document.getElementById('add-service-price');
    if (!select) return;
    
    const opt = select.selectedOptions[0];
    const serviceId = select.value;
    const price = parseFloat(priceInput?.value) || 0;
    const serviceName = opt?.dataset.name || '';
    
    try {
      const { error } = await Database.client.from('client_services').insert({
        client_id: this.currentClient.id,
        service_id: serviceId,
        service_type: 'other',
        name: serviceName,
        monthly_fee: price,
        price: price,
        is_extra: true,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      });
      
      if (error) throw error;
      
      document.getElementById('add-service-modal')?.remove();
      Utils.toast('Služba pridaná!', 'success');
      
      // Refresh detail
      await this.renderClientDetail(document.getElementById('main-content'), this.currentClient.id);
      this.showTab('subscription');
      
    } catch (error) {
      console.error('Add service error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async removeClientService(serviceId) {
    if (!await Utils.confirm('Odstrániť túto službu od klienta?', { title: 'Odstrániť službu', type: 'warning', confirmText: 'Odstrániť', cancelText: 'Ponechať' })) return;
    
    try {
      const { error } = await Database.client.from('client_services').delete().eq('id', serviceId);
      if (error) throw error;
      
      Utils.toast('Služba odstránená', 'success');
      await this.renderClientDetail(document.getElementById('main-content'), this.currentClient.id);
      this.showTab('subscription');
      
    } catch (error) {
      console.error('Remove service error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },

  async showSubscriptionModal() {
    // Load packages from DB
    let packages = [];
    try {
      const { data } = await Database.client
        .from('packages')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      packages = data || [];
    } catch (e) {
      console.error('Load packages error:', e);
    }
    
    const subscription = this.currentClient.subscription || {};
    
    const modalHtml = `
      <div id="subscription-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-xl font-bold">📦 Predplatné klienta</h2>
            <button onclick="ClientsModule.closeSubscriptionModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">Balíček</label>
              <select id="sub-package" class="w-full p-3 border rounded-xl" onchange="ClientsModule.onPackageChange()">
                <option value="">-- Vlastný (bez balíčka) --</option>
                ${packages.map(p => `
                  <option value="${p.id}" data-price="${p.price}" ${subscription.package_id === p.id ? 'selected' : ''}>
                    ${p.icon || '📦'} ${p.name} (${p.price}€/mes)
                  </option>
                `).join('')}
              </select>
            </div>
            
            <div id="custom-name-wrapper" class="${subscription.package_id ? 'hidden' : ''}">
              <label class="block text-sm font-medium mb-1">Vlastný názov</label>
              <input type="text" id="sub-custom-name" value="${subscription.custom_name || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="napr. Špeciálny balíček">
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Mesačná cena (€)</label>
                <input type="number" id="sub-price" value="${subscription.monthly_price || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="249">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Fakturačný deň</label>
                <input type="number" id="sub-billing-day" value="${subscription.billing_day || 1}" min="1" max="28"
                  class="w-full p-3 border rounded-xl">
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Dátum začiatku</label>
                <input type="date" id="sub-start-date" value="${subscription.start_date || new Date().toISOString().split('T')[0]}" 
                  class="w-full p-3 border rounded-xl">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Status</label>
                <select id="sub-status" class="w-full p-3 border rounded-xl">
                  <option value="active" ${subscription.status === 'active' ? 'selected' : ''}>Aktívne</option>
                  <option value="pending" ${subscription.status === 'pending' ? 'selected' : ''}>Čaká</option>
                  <option value="paused" ${subscription.status === 'paused' ? 'selected' : ''}>Pozastavené</option>
                  <option value="cancelled" ${subscription.status === 'cancelled' ? 'selected' : ''}>Zrušené</option>
                </select>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">Poznámky</label>
              <textarea id="sub-notes" rows="2" class="w-full p-3 border rounded-xl" 
                placeholder="Interné poznámky...">${subscription.notes || ''}</textarea>
            </div>
          </div>
          
          <div class="p-6 border-t flex justify-between gap-3 bg-gray-50">
            ${subscription.id ? `
              <button onclick="ClientsModule.deleteSubscription('${subscription.id}')" 
                class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl">
                🗑️ Zmazať
              </button>
            ` : '<div></div>'}
            <div class="flex gap-3">
              <button onclick="ClientsModule.closeSubscriptionModal()" class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
                Zrušiť
              </button>
              <button onclick="ClientsModule.saveSubscription()" class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                💾 Uložiť
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },
  
  onPackageChange() {
    const select = document.getElementById('sub-package');
    const customNameWrapper = document.getElementById('custom-name-wrapper');
    const priceInput = document.getElementById('sub-price');
    
    if (select.value) {
      customNameWrapper.classList.add('hidden');
      const selectedOption = select.options[select.selectedIndex];
      priceInput.value = selectedOption.dataset.price || '';
    } else {
      customNameWrapper.classList.remove('hidden');
    }
  },
  
  closeSubscriptionModal() {
    const modal = document.getElementById('subscription-modal');
    if (modal) modal.remove();
  },
  
  async saveSubscription() {
    const data = {
      client_id: this.currentClient.id,
      package_id: document.getElementById('sub-package').value || null,
      custom_name: document.getElementById('sub-custom-name').value.trim() || null,
      monthly_price: parseFloat(document.getElementById('sub-price').value) || 0,
      billing_day: parseInt(document.getElementById('sub-billing-day').value) || 1,
      start_date: document.getElementById('sub-start-date').value,
      status: document.getElementById('sub-status').value,
      notes: document.getElementById('sub-notes').value.trim() || null
    };
    
    if (!data.monthly_price) {
      Utils.toast('Zadajte mesačnú cenu', 'warning');
      return;
    }
    
    try {
      const existingSubscription = this.currentClient.subscription;
      
      if (existingSubscription?.id) {
        // Update
        const { error } = await Database.client
          .from('client_subscriptions')
          .update(data)
          .eq('id', existingSubscription.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await Database.client
          .from('client_subscriptions')
          .insert(data);
        if (error) throw error;
      }
      
      // Update monthly_fee in clients table
      await Database.client
        .from('clients')
        .update({ monthly_fee: data.monthly_price })
        .eq('id', this.currentClient.id);
      
      Utils.toast('Predplatné uložené! ✅', 'success');
      this.closeSubscriptionModal();
      
      // Reload client detail
      await this.renderClientDetail(document.getElementById('main-content'), this.currentClient.id);
      
    } catch (error) {
      console.error('Save subscription error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteSubscription(subscriptionId) {
    if (!await Utils.confirm('Naozaj chcete zmazať toto predplatné?', { title: 'Zmazať predplatné', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      const { error } = await Database.client
        .from('client_subscriptions')
        .delete()
        .eq('id', subscriptionId);
      
      if (error) throw error;
      
      Utils.toast('Predplatné zmazané', 'success');
      this.closeSubscriptionModal();
      await this.renderClientDetail(document.getElementById('main-content'), this.currentClient.id);
      
    } catch (error) {
      console.error('Delete subscription error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
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
    const onboardingUrl = c.onboarding_token ? `${window.location.origin}/portal/onboarding.html?t=${c.onboarding_token}` : null;
    
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
    const c = this.currentClient;
    return `
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">💰 Faktúry</h3>
          <div class="flex gap-2">
            <button onclick="ClientsModule.openBillingInvoice()" class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200">➕ Nová faktúra</button>
            <button onclick="Router.navigate('billing')" class="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">📊 Fakturácia</button>
          </div>
        </div>
        <div id="invoices-list">
          <div class="text-center py-4 text-gray-400 text-sm">Načítavam...</div>
        </div>
      </div>
    `;
  },

  async loadInvoices() {
    const container = document.getElementById('invoices-list');
    if (!container) return;
    
    try {
      // Používame invoices_overview pre konzistenciu s billing modulom
      let invoices;
      try {
        const { data, error } = await Database.client
          .from('invoices_overview')
          .select('*')
          .eq('client_id', this.currentClient.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        invoices = data;
      } catch (e) {
        // Fallback na priamu tabuľku ak view neexistuje
        const { data, error } = await Database.client
          .from('invoices')
          .select('*')
          .eq('client_id', this.currentClient.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        invoices = data;
      }
      
      if (!invoices || invoices.length === 0) {
        container.innerHTML = `
          <div class="text-center py-8 text-gray-400">
            <div class="text-4xl mb-2">💰</div>
            <p>Žiadne faktúry</p>
            <button onclick="ClientsModule.openBillingInvoice()" class="mt-3 px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200">➕ Vystaviť prvú faktúru</button>
          </div>
        `;
        return;
      }
      
      const statusColors = { draft: 'gray', issued: 'blue', sent: 'blue', paid: 'green', partially_paid: 'yellow', overdue: 'red', cancelled: 'gray', credited: 'gray' };
      const statusLabels = { draft: 'Koncept', issued: 'Vystavená', sent: 'Odoslaná', paid: 'Zaplatená', partially_paid: 'Čiast. uhradená', overdue: 'Po splatnosti', cancelled: 'Zrušená', credited: 'Dobropisovaná' };
      
      container.innerHTML = `
        <div class="divide-y">
          ${invoices.map(inv => {
            const status = inv.computed_status || inv.status;
            const color = statusColors[status] || 'gray';
            return `
            <div class="py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div>
                  <div class="font-medium">${inv.invoice_number}</div>
                  <div class="text-xs text-gray-500">
                    ${inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('sk-SK') : ''} 
                    ${inv.due_date ? '• Splatnosť: ' + new Date(inv.due_date).toLocaleDateString('sk-SK') : ''}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-2 py-0.5 rounded-full text-xs bg-${color}-100 text-${color}-700">${statusLabels[status] || status}</span>
                <span class="font-bold">${parseFloat(inv.total || 0).toFixed(2)}€</span>
                <div class="flex gap-1">
                  <button onclick="ClientsModule.openInvoiceDetail('${inv.id}')" class="p-1 hover:bg-blue-100 rounded text-blue-600 text-sm" title="Detail">👁️</button>
                  ${['issued', 'sent', 'overdue', 'partially_paid'].includes(status) ? `<button onclick="ClientsModule.markInvoicePaid('${inv.id}')" class="p-1 hover:bg-green-100 rounded text-green-600 text-sm" title="Označiť ako zaplatenú">✅</button>` : ''}
                  <button onclick="ClientsModule.deleteInvoice('${inv.id}')" class="p-1 hover:bg-red-100 rounded text-red-500 text-sm" title="Zmazať">🗑️</button>
                </div>
              </div>
            </div>
          `}).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Load invoices error:', error);
      container.innerHTML = '<div class="text-center py-4 text-red-500">Chyba pri načítaní faktúr</div>';
    }
  },

  openBillingInvoice() {
    if (!window.BillingModule) {
      Utils.toast('Modul Fakturácia nie je načítaný', 'error');
      return;
    }
    
    const doCreate = async () => {
      // Načítaj dáta ak treba
      if (!BillingModule.clients || BillingModule.clients.length === 0) {
        await BillingModule.loadData();
      }
      
      // Injektuj billing CSS ak ešte nie je na stránke
      if (!document.getElementById('billing-styles')) {
        const styleTag = document.createElement('div');
        styleTag.id = 'billing-styles';
        styleTag.innerHTML = BillingModule.renderStyles();
        document.body.appendChild(styleTag);
      }
      
      // Otvor modal
      await BillingModule.createInvoice();
      
      // Predvyplň klienta
      setTimeout(() => {
        const clientSelect = document.querySelector('select[name="client_id"]');
        if (clientSelect && this.currentClient?.id) {
          clientSelect.value = this.currentClient.id;
          BillingModule.onRecipientSelect('client', this.currentClient.id);
        }
      }, 150);
    };
    doCreate();
  },

  openInvoiceDetail(invoiceId) {
    if (window.BillingModule) {
      if (!document.getElementById('billing-styles')) {
        const styleTag = document.createElement('div');
        styleTag.id = 'billing-styles';
        styleTag.innerHTML = BillingModule.renderStyles();
        document.body.appendChild(styleTag);
      }
      BillingModule.showInvoiceDetail(invoiceId);
    } else {
      Utils.toast('Modul Fakturácia nie je načítaný', 'error');
    }
  },

  async markInvoicePaid(invoiceId) {
    if (!await Utils.confirm('Označiť faktúru ako zaplatenú?', { title: 'Platba prijatá', type: 'success', confirmText: 'Označiť', cancelText: 'Zrušiť' })) return;
    
    try {
      const { error } = await Database.client.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), remaining_amount: 0 }).eq('id', invoiceId);
      if (error) throw error;
      Utils.toast('Faktúra označená ako zaplatená', 'success');
      this.loadInvoices();
    } catch (error) {
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },

  async deleteInvoice(invoiceId) {
    if (!await Utils.confirm('Zmazať túto faktúru?', { title: 'Zmazať faktúru', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
    
    try {
      // Zmaž aj položky
      await Database.client.from('invoice_items').delete().eq('invoice_id', invoiceId);
      const { error } = await Database.client.from('invoices').delete().eq('id', invoiceId);
      if (error) throw error;
      Utils.toast('Faktúra zmazaná', 'success');
      this.loadInvoices();
    } catch (error) {
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // TAB SWITCHING
  // ==========================================
  
  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    
    // Lazy-load faktúr
    if (tab === 'invoices') this.loadInvoices();
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
      navigator.clipboard.writeText(input.value).then(() => {
        Utils.toast('Link skopírovaný!', 'success');
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        Utils.toast('Link skopírovaný!', 'success');
      });
    }
  },
  
  async sendOnboarding(clientId) {
    try {
      // Get client
      const client = this.clients.find(c => c.id === clientId);
      if (!client) {
        Utils.toast('Klient nebol nájdený', 'error');
        return;
      }

      // Check email
      if (!client.email) {
        Utils.toast('Klient nemá zadaný email', 'error');
        return;
      }

      // Confirm
      const confirmed = await Utils.confirm(
        `Pošle sa email na ${client.email} s odkazom na vyplnenie onboarding dotazníka.${client.onboarding_status === 'completed' ? '\n\n⚠️ Tento klient už má onboarding dokončený. Pokračovaním sa resetuje.' : ''}`,
        { title: 'Poslať onboarding?', type: client.onboarding_status === 'completed' ? 'warning' : 'info', confirmText: 'Odoslať', cancelText: 'Zrušiť' }
      );
      
      if (!confirmed) return;

      Utils.toast('Odosielam...', 'info');

      // Generate new token
      const newToken = this.generateToken();

      // Update client in DB
      const { error: updateError } = await Database.client
        .from('clients')
        .update({
          onboarding_token: newToken,
          onboarding_status: 'sent',
          onboarding_sent_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (updateError) {
        console.error('Update error:', updateError);
        Utils.toast('Chyba pri aktualizácii klienta', 'error');
        return;
      }

      // Build onboarding URL
      const onboardingUrl = `${window.location.origin}/portal/onboarding.html?t=${newToken}`;

      // Send email
      if (window.EmailTemplates) await EmailTemplates.ensureSettings();
      const onboardingHtml = window.EmailTemplates
        ? EmailTemplates.onboarding({ contactName: client.contact_person, companyName: client.company_name, onboardingUrl })
        : '<p>Vyplňte dotazník: <a href="' + onboardingUrl + '">' + onboardingUrl + '</a></p>';
      
      const emailResponse = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          subject: `Onboarding dotazník - ${client.company_name || 'Adlify'}`,
          htmlBody: onboardingHtml
        })
      });

      const emailResult = await emailResponse.json();

      if (emailResult.success) {
        Utils.toast('Onboarding email bol odoslaný!', 'success');
        
        // Update local data
        client.onboarding_token = newToken;
        client.onboarding_status = 'sent';
        
        // Refresh view
        await this.loadClients();
        if (this.currentClient?.id === clientId) {
          this.renderClientDetail(document.getElementById('main-content'), clientId);
        }
      } else {
        console.error('Email error:', emailResult);
        Utils.toast('Chyba pri odosielaní emailu: ' + (emailResult.error || 'Neznáma chyba'), 'error');
      }

    } catch (error) {
      console.error('sendOnboarding error:', error);
      Utils.toast('Nastala chyba', 'error');
    }
  },
  
  fillOnboarding(clientId) {
    const client = this.clients.find(c => c.id === clientId) || this.currentClient;
    if (!client) return;
    
    // Ak nemá token, vygeneruj
    if (!client.onboarding_token) {
      const token = this.generateToken();
      Database.client.from('clients').update({ onboarding_token: token, onboarding_status: 'sent' }).eq('id', clientId).then(() => {
        client.onboarding_token = token;
        const url = `${window.location.origin}/portal/onboarding.html?t=${token}`;
        window.open(url, '_blank');
        Utils.toast('Onboarding formulár otvorený v novom okne', 'info');
      });
    } else {
      const url = `${window.location.origin}/portal/onboarding.html?t=${client.onboarding_token}`;
      window.open(url, '_blank');
      Utils.toast('Onboarding formulár otvorený v novom okne', 'info');
    }
  },
  
  async viewOnboarding(clientId) {
    const client = this.clients.find(c => c.id === clientId) || this.currentClient;
    if (!client) return;
    
    // Načítaj aktuálne dáta z DB
    try {
      const { data } = await Database.client.from('clients').select('onboarding_data').eq('id', clientId).single();
      const od = data?.onboarding_data || {};
      
      if (!od || Object.keys(od).length === 0) {
        Utils.toast('Onboarding ešte nebol vyplnený', 'warning');
        return;
      }
      
      // Zobraz modal s odpoveďami
      const modal = document.createElement('div');
      modal.id = 'onboarding-view-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9998;padding:1rem;';
      
      const formatValue = (val) => {
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'object' && val !== null) return JSON.stringify(val, null, 2);
        return val || '-';
      };
      
      const sections = [];
      for (const [key, value] of Object.entries(od)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          let rows = '';
          for (const [k, v] of Object.entries(value)) {
            rows += `<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:0.875rem;">${k}</span><span style="font-weight:500;max-width:60%;text-align:right;">${formatValue(v)}</span></div>`;
          }
          sections.push(`<div style="margin-bottom:1rem;"><h4 style="font-weight:600;margin-bottom:0.5rem;text-transform:capitalize;">${key.replace(/_/g, ' ')}</h4>${rows}</div>`);
        } else {
          sections.push(`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">${key.replace(/_/g, ' ')}</span><span style="font-weight:500;">${formatValue(value)}</span></div>`);
        }
      }
      
      modal.innerHTML = `
        <div style="background:white;border-radius:16px;width:100%;max-width:600px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="padding:1.25rem 1.5rem;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#f97316,#ec4899);color:white;">
            <h2 style="font-size:1.25rem;font-weight:600;margin:0;">📋 Onboarding odpovede</h2>
            <button onclick="document.getElementById('onboarding-view-modal').remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;color:white;font-size:1.25rem;">✕</button>
          </div>
          <div style="padding:1.5rem;overflow-y:auto;flex:1;">
            ${sections.join('')}
          </div>
        </div>
      `;
      
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
      
    } catch (error) {
      console.error('viewOnboarding error:', error);
      Utils.toast('Chyba pri načítaní onboardingu', 'error');
    }
  }
};

window.ClientsModule = ClientsModule;
