/**
 * ADLIFY PLATFORM - Services & Packages Module v1.0
 * Správa služieb, balíčkov a predplatného klientov
 */

const ServicesModule = {
  id: 'services',
  name: 'Služby & Balíčky',
  icon: Icons.package,
  title: 'Služby & Balíčky',
  subtitle: 'Správa produktov a cenníka',
  
  menu: { section: 'main', order: 35 },
  permissions: [],
  
  // State
  services: [],
  packages: [],
  activeTab: 'packages', // 'packages', 'services'
  editingService: null,
  editingPackage: null,
  
  // Categories
  SERVICE_CATEGORIES: [
    { value: 'ads', label: 'Reklamné platformy', icon: Icons.campaigns },
    { value: 'creative', label: 'Kreatíva', icon: Icons.palette },
    { value: 'seo', label: 'SEO', icon: Icons.search },
    { value: 'support', label: 'Podpora & Reporty', icon: Icons.dashboard },
    { value: 'other', label: 'Ostatné', icon: Icons.clipboard }
  ],
  
  // Badge colors
  BADGE_COLORS: [
    { value: 'gray', label: 'Šedá', class: 'bg-gray-100 text-gray-700' },
    { value: 'orange', label: 'Oranžová', class: 'bg-orange-100 text-orange-700' },
    { value: 'blue', label: 'Modrá', class: 'bg-blue-100 text-blue-700' },
    { value: 'gold', label: 'Zlatá', class: 'bg-yellow-100 text-yellow-700' },
    { value: 'green', label: 'Zelená', class: 'bg-green-100 text-green-700' },
    { value: 'purple', label: 'Fialová', class: 'bg-purple-100 text-purple-700' }
  ],
  
  init() {
    console.log('Services module v1.0 initialized');
  },
  
  async loadData() {
    try {
      // Load services
      const { data: services, error: servicesError } = await Database.client
        .from('services')
        .select('*')
        .order('sort_order');
      
      if (servicesError) throw servicesError;
      this.services = services || [];
      
      // Load packages with their services
      const { data: packages, error: packagesError } = await Database.client
        .from('packages')
        .select(`
          *,
          package_services (
            id,
            service_id,
            limit_value,
            limit_unit,
            notes,
            services (id, name, icon, category)
          )
        `)
        .order('sort_order');
      
      if (packagesError) throw packagesError;
      this.packages = packages || [];
      
    } catch (error) {
      console.error('Load services error:', error);
      Utils.toast('Chyba pri načítaní dát', 'error');
    }
  },
  
  async render(container, params = {}) {
    await this.loadData();
    container.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold">${this.title}</h1>
            <p class="text-gray-500">${this.subtitle}</p>
          </div>
          <div class="flex gap-2">
            ${this.activeTab === 'services' ? `
              <button onclick="ServicesModule.showServiceModal()" class="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                ➕ Nová služba
              </button>
            ` : `
              <button onclick="ServicesModule.showPackageModal()" class="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                ➕ Nový balíček
              </button>
            `}
          </div>
        </div>
        
        <!-- Tabs -->
        <div class="flex gap-2 border-b">
          <button onclick="ServicesModule.switchTab('packages')" 
            class="px-6 py-3 font-medium ${this.activeTab === 'packages' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}">
            ${Icons.clipboard} Balíčky (${this.packages.length})
          </button>
          <button onclick="ServicesModule.switchTab('services')" 
            class="px-6 py-3 font-medium ${this.activeTab === 'services' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}">
            🔧 Služby (${this.services.length})
          </button>
        </div>
        
        <!-- Content -->
        <div id="services-content">
          ${this.activeTab === 'packages' ? this.renderPackages() : this.renderServices()}
        </div>
      </div>
    `;
  },
  
  switchTab(tab) {
    this.activeTab = tab;
    const container = document.getElementById('main-content');
    this.render(container);
  },
  
  // ==========================================
  // PACKAGES
  // ==========================================
  
  renderPackages() {
    if (this.packages.length === 0) {
      return `
        <div class="text-center py-12 bg-gray-50 rounded-xl">
          <div class="text-4xl mb-4">${Icons.package}</div>
          <h3 class="text-lg font-medium text-gray-600">Žiadne balíčky</h3>
          <p class="text-gray-500 mb-4">Vytvorte svoj prvý cenový balíček</p>
          <button onclick="ServicesModule.showPackageModal()" class="px-6 py-2 bg-purple-600 text-white rounded-xl">
            ➕ Vytvoriť balíček
          </button>
        </div>
      `;
    }
    
    return `
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${this.packages.map(pkg => this.renderPackageCard(pkg)).join('')}
      </div>
    `;
  },
  
  renderPackageCard(pkg) {
    const badgeColor = this.BADGE_COLORS.find(b => b.value === pkg.badge_color) || this.BADGE_COLORS[0];
    const includedServices = pkg.package_services || [];
    
    return `
      <div class="bg-white rounded-2xl border-2 ${pkg.is_featured ? 'border-orange-400 shadow-lg' : 'border-gray-200'} overflow-hidden relative">
        ${pkg.badge ? `
          <div class="absolute top-4 right-4">
            <span class="px-3 py-1 rounded-full text-xs font-medium ${badgeColor.class}">${pkg.badge}</span>
          </div>
        ` : ''}
        
        <div class="p-6">
          <!-- Header -->
          <div class="text-3xl mb-2">${pkg.icon || ''}</div>
          <h3 class="text-xl font-bold ${pkg.is_featured ? 'text-orange-600' : ''}">${pkg.name}</h3>
          
          <!-- Price -->
          <div class="mt-4">
            <span class="text-3xl font-bold">${pkg.price_type === 'from' ? 'od ' : ''}${pkg.price}€</span>
            <span class="text-gray-500">/mes</span>
          </div>
          
          <!-- Description -->
          <p class="text-sm text-gray-500 mt-2 mb-4">${pkg.description || ''}</p>
          
          <!-- Features -->
          <div class="space-y-2 mb-6">
            ${includedServices.slice(0, 6).map(ps => `
              <div class="flex items-start gap-2 text-sm">
                <span class="text-green-500 mt-0.5">✓</span>
                <span>
                  ${ps.limit_value ? `${ps.limit_value === 'unlimited' ? 'Neobmedzené' : ps.limit_value} ` : ''}
                  ${ps.services?.name || ''}
                  ${ps.notes ? `<span class="text-gray-400">(${ps.notes})</span>` : ''}
                </span>
              </div>
            `).join('')}
            ${includedServices.length > 6 ? `
              <div class="text-sm text-gray-400">+ ${includedServices.length - 6} ďalších...</div>
            ` : ''}
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2">
            <button onclick="ServicesModule.editPackage('${pkg.id}')" 
              class="flex-1 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">
              ${Icons.edit} Upraviť
            </button>
            <button onclick="ServicesModule.deletePackage('${pkg.id}')" 
              class="px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm">
              ${Icons.trash}
            </button>
          </div>
        </div>
        
        <!-- Status -->
        <div class="px-6 py-3 bg-gray-50 border-t flex items-center justify-between text-xs">
          <span class="${pkg.is_active ? 'text-green-600' : 'text-gray-400'}">
            ${pkg.is_active ? '● Aktívny' : '○ Neaktívny'}
          </span>
          <span class="text-gray-400">Poradie: ${pkg.sort_order}</span>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SERVICES
  // ==========================================
  
  renderServices() {
    if (this.services.length === 0) {
      return `
        <div class="text-center py-12 bg-gray-50 rounded-xl">
          <div class="text-4xl mb-4">🔧</div>
          <h3 class="text-lg font-medium text-gray-600">Žiadne služby</h3>
          <p class="text-gray-500 mb-4">Vytvorte svoju prvú službu</p>
          <button onclick="ServicesModule.showServiceModal()" class="px-6 py-2 bg-purple-600 text-white rounded-xl">
            ➕ Vytvoriť službu
          </button>
        </div>
      `;
    }
    
    // Group by category
    const grouped = {};
    this.SERVICE_CATEGORIES.forEach(cat => {
      grouped[cat.value] = this.services.filter(s => s.category === cat.value);
    });
    
    return `
      <div class="space-y-6">
        ${this.SERVICE_CATEGORIES.map(cat => {
          const services = grouped[cat.value] || [];
          if (services.length === 0) return '';
          
          return `
            <div class="bg-white rounded-xl border overflow-hidden">
              <div class="px-6 py-4 bg-gray-50 border-b flex items-center gap-3">
                <span class="text-2xl">${cat.icon}</span>
                <div>
                  <h3 class="font-semibold">${cat.label}</h3>
                  <p class="text-sm text-gray-500">${services.length} služieb</p>
                </div>
              </div>
              <div class="divide-y">
                ${services.map(svc => this.renderServiceRow(svc)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },
  
  renderServiceRow(service) {
    return `
      <div class="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
        <div class="flex items-center gap-4">
          <span class="text-2xl">${service.icon || ''}</span>
          <div>
            <h4 class="font-medium">${service.name}</h4>
            <p class="text-sm text-gray-500">${service.description || 'Bez popisu'}</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          ${service.base_price > 0 ? `
            <span class="font-semibold">${service.base_price}€<span class="text-gray-400 font-normal">/${service.unit === 'month' ? 'mes' : service.unit}</span></span>
          ` : `
            <span class="text-gray-400">V cene balíčka</span>
          `}
          <div class="flex gap-1">
            <button onclick="ServicesModule.editService('${service.id}')" 
              class="p-2 hover:bg-gray-200 rounded-lg" title="Upraviť">
              ${Icons.edit}
            </button>
            <button onclick="ServicesModule.deleteService('${service.id}')" 
              class="p-2 hover:bg-red-100 rounded-lg text-red-500" title="Zmazať">
              ${Icons.trash}
            </button>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SERVICE MODAL
  // ==========================================
  
  showServiceModal(service = null) {
    this.editingService = service;
    
    const modalHtml = `
      <div id="service-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-xl font-bold">${service ? 'Upraviť službu' : '➕ Nová služba'}</h2>
            <button onclick="ServicesModule.closeServiceModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          
          <form id="service-form" class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Názov služby *</label>
              <input type="text" name="name" value="${service?.name || ''}" required
                class="w-full p-3 border rounded-xl" placeholder="napr. Google Ads správa">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">Popis</label>
              <textarea name="description" rows="2" class="w-full p-3 border rounded-xl" 
                placeholder="Krátky popis služby...">${service?.description || ''}</textarea>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Kategória</label>
                <select name="category" class="w-full p-3 border rounded-xl">
                  ${this.SERVICE_CATEGORIES.map(cat => `
                    <option value="${cat.value}" ${service?.category === cat.value ? 'selected' : ''}>
                      ${cat.icon} ${cat.label}
                    </option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Ikona (emoji)</label>
                <input type="text" name="icon" value="${service?.icon || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="${Icons.campaigns}">
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Základná cena (€)</label>
                <input type="number" name="base_price" value="${service?.base_price || '0'}" step="0.01"
                  class="w-full p-3 border rounded-xl" placeholder="0 = v cene balíčka">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Jednotka</label>
                <select name="unit" class="w-full p-3 border rounded-xl">
                  <option value="month" ${service?.unit === 'month' ? 'selected' : ''}>Mesačne</option>
                  <option value="one-time" ${service?.unit === 'one-time' ? 'selected' : ''}>Jednorazovo</option>
                  <option value="hour" ${service?.unit === 'hour' ? 'selected' : ''}>Za hodinu</option>
                </select>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Poradie</label>
                <input type="number" name="sort_order" value="${service?.sort_order || '0'}" 
                  class="w-full p-3 border rounded-xl">
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 p-3">
                  <input type="checkbox" name="is_active" ${service?.is_active !== false ? 'checked' : ''} class="rounded">
                  Aktívna služba
                </label>
              </div>
            </div>
          </form>
          
          <div class="p-6 border-t flex justify-end gap-3 bg-gray-50">
            <button onclick="ServicesModule.closeServiceModal()" class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
              Zrušiť
            </button>
            <button onclick="ServicesModule.saveService()" class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
              💾 Uložiť
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },
  
  closeServiceModal() {
    const modal = document.getElementById('service-modal');
    if (modal) modal.remove();
    this.editingService = null;
  },
  
  async saveService() {
    const form = document.getElementById('service-form');
    const formData = new FormData(form);
    
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      icon: formData.get('icon'),
      base_price: parseFloat(formData.get('base_price')) || 0,
      unit: formData.get('unit'),
      sort_order: parseInt(formData.get('sort_order')) || 0,
      is_active: formData.has('is_active')
    };
    
    if (!data.name) {
      Utils.toast('Názov je povinný', 'warning');
      return;
    }
    
    try {
      if (this.editingService) {
        const { error } = await Database.client
          .from('services')
          .update(data)
          .eq('id', this.editingService.id);
        if (error) throw error;
        Utils.toast('Služba upravená!', 'success');
      } else {
        const { error } = await Database.client
          .from('services')
          .insert(data);
        if (error) throw error;
        Utils.toast('Služba vytvorená!', 'success');
      }
      
      this.closeServiceModal();
      await this.loadData();
      this.render(document.getElementById('main-content'));
      
    } catch (error) {
      console.error('Save service error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async editService(id) {
    const service = this.services.find(s => s.id === id);
    if (service) {
      this.showServiceModal(service);
    }
  },
  
  async deleteService(id) {
    if (!confirm('Naozaj chcete zmazať túto službu?')) return;
    
    try {
      const { error } = await Database.client
        .from('services')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      Utils.toast('Služba zmazaná', 'success');
      await this.loadData();
      this.render(document.getElementById('main-content'));
      
    } catch (error) {
      console.error('Delete service error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // ==========================================
  // PACKAGE MODAL
  // ==========================================
  
  showPackageModal(pkg = null) {
    this.editingPackage = pkg;
    const includedServiceIds = pkg?.package_services?.map(ps => ps.service_id) || [];
    
    const modalHtml = `
      <div id="package-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-6 border-b flex items-center justify-between">
            <h2 class="text-xl font-bold">${pkg ? 'Upraviť balíček' : '➕ Nový balíček'}</h2>
            <button onclick="ServicesModule.closePackageModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          
          <div class="p-6 overflow-y-auto flex-1 space-y-4">
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Názov balíčka *</label>
                <input type="text" id="pkg-name" value="${pkg?.name || ''}" required
                  class="w-full p-3 border rounded-xl" placeholder="napr. Pro">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Slug (URL)</label>
                <input type="text" id="pkg-slug" value="${pkg?.slug || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="napr. pro">
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">Popis</label>
              <textarea id="pkg-description" rows="2" class="w-full p-3 border rounded-xl" 
                placeholder="Pre koho je balíček určený...">${pkg?.description || ''}</textarea>
            </div>
            
            <div class="grid md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Cena (€) *</label>
                <input type="number" id="pkg-price" value="${pkg?.price || ''}" required
                  class="w-full p-3 border rounded-xl" placeholder="249">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Typ ceny</label>
                <select id="pkg-price-type" class="w-full p-3 border rounded-xl">
                  <option value="fixed" ${pkg?.price_type === 'fixed' ? 'selected' : ''}>Fixná</option>
                  <option value="from" ${pkg?.price_type === 'from' ? 'selected' : ''}>Od (od X€)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Ikona (emoji)</label>
                <input type="text" id="pkg-icon" value="${pkg?.icon || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="${Icons.star}">
              </div>
            </div>
            
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Badge text</label>
                <input type="text" id="pkg-badge" value="${pkg?.badge || ''}" 
                  class="w-full p-3 border rounded-xl" placeholder="napr. Najobľúbenejšie">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Badge farba</label>
                <select id="pkg-badge-color" class="w-full p-3 border rounded-xl">
                  ${this.BADGE_COLORS.map(c => `
                    <option value="${c.value}" ${pkg?.badge_color === c.value ? 'selected' : ''}>${c.label}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            
            <div class="grid md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Poradie</label>
                <input type="number" id="pkg-sort" value="${pkg?.sort_order || '0'}" 
                  class="w-full p-3 border rounded-xl">
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 p-3">
                  <input type="checkbox" id="pkg-featured" ${pkg?.is_featured ? 'checked' : ''} class="rounded">
                  Zvýraznený
                </label>
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 p-3">
                  <input type="checkbox" id="pkg-active" ${pkg?.is_active !== false ? 'checked' : ''} class="rounded">
                  Aktívny
                </label>
              </div>
            </div>
            
            <!-- Services Selection -->
            <div class="border-t pt-4">
              <label class="block text-sm font-medium mb-3">Služby v balíčku</label>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                ${this.services.map(svc => `
                  <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer">
                    <input type="checkbox" name="service_${svc.id}" value="${svc.id}" 
                      ${includedServiceIds.includes(svc.id) ? 'checked' : ''} 
                      class="package-service-checkbox rounded">
                    <span class="text-xl">${svc.icon || ''}</span>
                    <div class="flex-1">
                      <div class="font-medium">${svc.name}</div>
                      <div class="text-xs text-gray-500">${svc.category}</div>
                    </div>
                    <input type="text" name="limit_${svc.id}" placeholder="Limit (napr. 3, unlimited)" 
                      value="${pkg?.package_services?.find(ps => ps.service_id === svc.id)?.limit_value || ''}"
                      class="w-24 p-2 border rounded-lg text-sm">
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
          
          <div class="p-6 border-t flex justify-end gap-3 bg-gray-50">
            <button onclick="ServicesModule.closePackageModal()" class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">
              Zrušiť
            </button>
            <button onclick="ServicesModule.savePackage()" class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
              💾 Uložiť
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },
  
  closePackageModal() {
    const modal = document.getElementById('package-modal');
    if (modal) modal.remove();
    this.editingPackage = null;
  },
  
  async savePackage() {
    const data = {
      name: document.getElementById('pkg-name').value.trim(),
      slug: document.getElementById('pkg-slug').value.trim() || null,
      description: document.getElementById('pkg-description').value.trim(),
      price: parseFloat(document.getElementById('pkg-price').value) || 0,
      price_type: document.getElementById('pkg-price-type').value,
      icon: document.getElementById('pkg-icon').value.trim(),
      badge: document.getElementById('pkg-badge').value.trim() || null,
      badge_color: document.getElementById('pkg-badge-color').value,
      sort_order: parseInt(document.getElementById('pkg-sort').value) || 0,
      is_featured: document.getElementById('pkg-featured').checked,
      is_active: document.getElementById('pkg-active').checked
    };
    
    if (!data.name || !data.price) {
      Utils.toast('Názov a cena sú povinné', 'warning');
      return;
    }
    
    // Collect selected services
    const selectedServices = [];
    document.querySelectorAll('.package-service-checkbox:checked').forEach(cb => {
      const serviceId = cb.value;
      const limitInput = document.querySelector(`input[name="limit_${serviceId}"]`);
      selectedServices.push({
        service_id: serviceId,
        limit_value: limitInput?.value.trim() || null
      });
    });
    
    try {
      let packageId = this.editingPackage?.id;
      
      if (this.editingPackage) {
        // Update package
        const { error } = await Database.client
          .from('packages')
          .update(data)
          .eq('id', packageId);
        if (error) throw error;
        
        // Delete old services
        await Database.client
          .from('package_services')
          .delete()
          .eq('package_id', packageId);
          
      } else {
        // Create package
        const { data: newPkg, error } = await Database.client
          .from('packages')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        packageId = newPkg.id;
      }
      
      // Insert services
      if (selectedServices.length > 0) {
        const { error: servicesError } = await Database.client
          .from('package_services')
          .insert(selectedServices.map(s => ({
            package_id: packageId,
            service_id: s.service_id,
            limit_value: s.limit_value
          })));
        if (servicesError) throw servicesError;
      }
      
      Utils.toast(this.editingPackage ? 'Balíček upravený!' : 'Balíček vytvorený! ${Icons.checkCircle}', 'success');
      this.closePackageModal();
      await this.loadData();
      this.render(document.getElementById('main-content'));
      
    } catch (error) {
      console.error('Save package error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async editPackage(id) {
    const pkg = this.packages.find(p => p.id === id);
    if (pkg) {
      this.showPackageModal(pkg);
    }
  },
  
  async deletePackage(id) {
    if (!confirm('Naozaj chcete zmazať tento balíček?')) return;
    
    try {
      const { error } = await Database.client
        .from('packages')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      Utils.toast('Balíček zmazaný', 'success');
      await this.loadData();
      this.render(document.getElementById('main-content'));
      
    } catch (error) {
      console.error('Delete package error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  }
};

// Register module
if (typeof ModuleLoader !== 'undefined') {
  ModuleLoader.register(ServicesModule);
}
