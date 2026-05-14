/**
 * ADLIFY PLATFORM - Services & Packages Module v1.0
 * Správa služieb, balíčkov a predplatného klientov
 */

const ServicesModule = {
  id: 'services',
  name: 'Služby & Balíčky',
  icon: '📦',
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
    { value: 'ads', label: 'Reklamné platformy', icon: '📢' },
    { value: 'creative', label: 'Kreatíva', icon: '🎨' },
    { value: 'seo', label: 'SEO', icon: '🔍' },
    { value: 'support', label: 'Podpora & Reporty', icon: '📊' },
    { value: 'other', label: 'Ostatné', icon: '📋' }
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
    console.log('📦 Services module v1.0 initialized');
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
    const tab = this.activeTab || 'packages';
    container.innerHTML = `
      <div class="adl">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">${this.title}</h1>
            <div style="font-size:13px; color:var(--ink-sub);">${this.subtitle}</div>
          </div>
          <div style="display:flex; gap:8px;">
            ${tab === 'services'
              ? `<button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ServicesModule.showServiceModal()">${I.Plus({size:14})} Nová služba</button>`
              : `<button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ServicesModule.showPackageModal()">${I.Plus({size:14})} Nový balíček</button>`
            }
          </div>
        </div>

        <!-- Tabs -->
        <div style="display:flex; gap:2px; background:var(--n-75); border-radius:10px; padding:4px; margin-bottom:16px; width:fit-content;">
          <button onclick="ServicesModule.switchTab('packages')" class="adl-btn adl-btn-sm ${tab==='packages'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">
            Balíčky <span class="adl-chip adl-chip-sm" style="margin-left:4px;">${this.packages.length}</span>
          </button>
          <button onclick="ServicesModule.switchTab('services')" class="adl-btn adl-btn-sm ${tab==='services'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">
            Služby <span class="adl-chip adl-chip-sm" style="margin-left:4px;">${this.services.length}</span>
          </button>
        </div>

        <!-- Content -->
        <div id="services-content">
          ${tab === 'packages' ? this.renderPackages() : this.renderServices()}
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
        <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Package({size:22})}</div>
          <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne balíčky</h3>
          <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Vytvorte svoj prvý cenový balíček</p>
          <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ServicesModule.showPackageModal()">${I.Plus({size:14})} Vytvoriť balíček</button>
        </div>
      `;
    }

    return `
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:14px;" class="adl-packages-grid">
        ${this.packages.map(pkg => this.renderPackageCard(pkg)).join('')}
      </div>
      <style>
        @media (max-width: 1200px) { .adl-packages-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 640px)  { .adl-packages-grid { grid-template-columns: 1fr !important; } }
      </style>
    `;
  },

  renderPackageCard(pkg) {
    const badgeColor = this.BADGE_COLORS.find(b => b.value === pkg.badge_color) || this.BADGE_COLORS[0];
    const includedServices = pkg.package_services || [];
    const accentBorder = pkg.is_featured ? 'var(--brand-500)' : 'var(--border)';
    const accentBg = pkg.is_featured ? 'linear-gradient(135deg, color-mix(in oklab, var(--brand-500) 6%, var(--surface)), var(--surface))' : 'var(--surface)';

    return `
      <div style="background:${accentBg}; border:1px solid ${accentBorder}; border-radius:14px; overflow:hidden; position:relative; box-shadow:${pkg.is_featured ? 'var(--sh-md)' : 'var(--sh-sm)'}; display:flex; flex-direction:column;">
        ${pkg.badge ? `<div style="position:absolute; top:14px; right:14px;"><span class="adl-chip adl-chip-brand adl-chip-sm">${pkg.badge}</span></div>` : ''}

        <div style="padding:20px; flex:1;">
          <div style="color:${pkg.is_featured ? 'var(--brand-600)' : 'var(--ink-sub)'}; margin-bottom:6px; display:inline-flex;">${I.Package({size:20})}</div>
          <h3 style="font-size:18px; font-weight:700; letter-spacing:-0.3px; color:${pkg.is_featured ? 'var(--brand-700)' : 'var(--ink)'};">${pkg.name}</h3>

          <div style="margin-top:14px;">
            <span style="font-size:28px; font-weight:700; letter-spacing:-0.8px;">${pkg.price_type === 'from' ? 'od ' : ''}${pkg.price}&nbsp;€</span>
            <span style="color:var(--ink-sub); font-size:13px;">/mes</span>
          </div>

          ${pkg.description ? `<p style="font-size:12px; color:var(--ink-sub); margin:10px 0 14px; line-height:1.5;">${pkg.description}</p>` : '<div style="height:14px;"></div>'}

          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:18px;">
            ${includedServices.slice(0, 6).map(ps => `
              <div style="display:flex; align-items:start; gap:8px; font-size:12px; color:var(--ink);">
                <span style="color:var(--ok); margin-top:2px; display:inline-flex;">${I.Check({size:12})}</span>
                <span>
                  ${ps.limit_value ? `<strong>${ps.limit_value === 'unlimited' ? 'Neobmedzené' : ps.limit_value}</strong> ` : ''}
                  ${ps.services?.name || ''}
                  ${ps.notes ? `<span style="color:var(--ink-mute);"> (${ps.notes})</span>` : ''}
                </span>
              </div>
            `).join('')}
            ${includedServices.length > 6 ? `<div style="font-size:12px; color:var(--ink-mute); padding-left:20px;">+ ${includedServices.length - 6} ďalších…</div>` : ''}
          </div>

          <div style="display:flex; gap:6px;">
            <button class="adl-btn adl-btn-soft adl-btn-sm" onclick="ServicesModule.editPackage('${pkg.id}')" style="flex:1; justify-content:center;">${I.Edit({size:14})} Upraviť</button>
            <button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="ServicesModule.deletePackage('${pkg.id}')" style="color:var(--err); padding:0 10px;" title="Zmazať">${I.Trash({size:14})}</button>
          </div>
        </div>

        <div style="padding:10px 20px; background:var(--n-50); border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; font-size:11px;">
          <span class="adl-chip adl-chip-sm ${pkg.is_active ? 'adl-chip-ok' : ''}"><span class="dot"></span>${pkg.is_active ? 'Aktívny' : 'Neaktívny'}</span>
          <span style="color:var(--ink-mute);">Poradie ${pkg.sort_order}</span>
        </div>
      </div>
    `;
  },

  renderServices() {
    if (this.services.length === 0) {
      return `
        <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Folder({size:22})}</div>
          <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne služby</h3>
          <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Vytvorte svoju prvú službu</p>
          <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="ServicesModule.showServiceModal()">${I.Plus({size:14})} Vytvoriť službu</button>
        </div>
      `;
    }

    const grouped = {};
    this.SERVICE_CATEGORIES.forEach(cat => {
      grouped[cat.value] = this.services.filter(s => s.category === cat.value);
    });

    return `
      <div style="display:flex; flex-direction:column; gap:14px;">
        ${this.SERVICE_CATEGORIES.map(cat => {
          const services = grouped[cat.value] || [];
          if (services.length === 0) return '';

          return `
            <div class="adl-card">
              <div class="adl-card-header">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="adl-card-title">${cat.label}</div>
                  <span class="adl-chip adl-chip-sm">${services.length}</span>
                </div>
              </div>
              <div style="display:flex; flex-direction:column;">
                ${services.map((svc, i) => `
                  <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; ${i > 0 ? 'border-top:1px solid var(--border);' : ''} transition: background .12s;" onmouseover="this.style.background='var(--n-25)'" onmouseout="this.style.background='transparent'">
                    <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                      <div style="width:32px; height:32px; border-radius:8px; background:var(--n-75); color:var(--ink-sub); display:inline-flex; align-items:center; justify-content:center;">${I.Folder({size:16})}</div>
                      <div style="min-width:0;">
                        <div style="font-size:13px; font-weight:600; color:var(--ink);">${svc.name}</div>
                        ${svc.description ? `<div style="font-size:11px; color:var(--ink-sub); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px;">${svc.description}</div>` : ''}
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
                      <span class="mono" style="font-size:13px; font-weight:600;">${svc.base_price}&nbsp;€<span style="color:var(--ink-mute); font-weight:500;">/${svc.unit || 'ks'}</span></span>
                      <button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="ServicesModule.editService('${svc.id}')" style="padding:0 8px;" title="Upraviť">${I.Edit({size:14})}</button>
                      <button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="ServicesModule.deleteService('${svc.id}')" style="color:var(--err); padding:0 8px;" title="Zmazať">${I.Trash({size:14})}</button>
                    </div>
                  </div>
                `).join('')}
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
          <span class="text-2xl">${service.icon || '📋'}</span>
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
              ✏️
            </button>
            <button onclick="ServicesModule.deleteService('${service.id}')" 
              class="p-2 hover:bg-red-100 rounded-lg text-red-500" title="Zmazať">
              🗑️
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
            <h2 class="text-xl font-bold">${service ? '✏️ Upraviť službu' : '➕ Nová služba'}</h2>
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
                  class="w-full p-3 border rounded-xl" placeholder="📢">
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
        Utils.toast('Služba upravená! ✅', 'success');
      } else {
        const { error } = await Database.client
          .from('services')
          .insert(data);
        if (error) throw error;
        Utils.toast('Služba vytvorená! ✅', 'success');
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
            <h2 class="text-xl font-bold">${pkg ? '✏️ Upraviť balíček' : '➕ Nový balíček'}</h2>
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
                  class="w-full p-3 border rounded-xl" placeholder="⭐">
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
                    <span class="text-xl">${svc.icon || '📋'}</span>
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
      
      Utils.toast(this.editingPackage ? 'Balíček upravený! ✅' : 'Balíček vytvorený! ✅', 'success');
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
