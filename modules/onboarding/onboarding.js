/**
 * ADLIFY PLATFORM - Onboarding Module v2.0
 * Modern onboarding management with history tracking
 */

const OnboardingModule = {
  id: 'onboarding',
  name: 'Onboarding',
  icon: '📋',
  title: 'Onboarding',
  subtitle: 'Správa onboarding dotazníkov',
  
  menu: { section: 'tools', order: 10 },
  permissions: ['clients', 'view'],
  
  // State
  currentStep: 1,
  totalSteps: 9,
  formData: {},
  clientId: null,
  onboardingId: null,
  isPublic: false,
  isSaving: false,
  currentView: 'list', // 'list', 'detail', 'form'
  
  // Sections definition
  SECTIONS: [
    { id: 1, title: 'Základné informácie', icon: '🏢', key: 'company' },
    { id: 2, title: 'Produkty a služby', icon: '📦', key: 'products' },
    { id: 3, title: 'Cieľová skupina', icon: '🎯', key: 'audience' },
    { id: 4, title: 'Aktuálny marketing', icon: '📊', key: 'marketing' },
    { id: 5, title: 'Ciele a očakávania', icon: '🚀', key: 'goals' },
    { id: 6, title: 'Obsah a kreatíva', icon: '🎨', key: 'creative' },
    { id: 7, title: 'Technické', icon: '⚙️', key: 'technical' },
    { id: 8, title: 'Kontaktné údaje', icon: '👤', key: 'contact' },
    { id: 9, title: 'Dodatočné info', icon: '📝', key: 'additional' }
  ],
  
  // Options for selects
  INDUSTRIES: [
    'E-commerce / Online obchod', 'Gastronómia / Reštaurácie', 'Zdravie a krása', 
    'Fitness a šport', 'Služby pre firmy (B2B)', 'Vzdelávanie', 'Nehnuteľnosti',
    'Automobilový priemysel', 'Cestovný ruch', 'Financie a poistenie',
    'IT a technológie', 'Stavebníctvo', 'Maloobchod', 'Veľkoobchod', 'Iné'
  ],
  
  COMPANY_SIZES: [
    { value: 'solo', label: 'Živnostník (1 osoba)' },
    { value: '2-5', label: 'Malá firma (2-5 ľudí)' },
    { value: '6-20', label: 'Stredná firma (6-20 ľudí)' },
    { value: '21-50', label: 'Väčšia firma (21-50 ľudí)' },
    { value: '50+', label: 'Veľká firma (50+ ľudí)' }
  ],
  
  MARKETING_CHANNELS: [
    { value: 'google_ads', label: 'Google Ads' },
    { value: 'facebook', label: 'Facebook Ads' },
    { value: 'instagram', label: 'Instagram Ads' },
    { value: 'tiktok', label: 'TikTok Ads' },
    { value: 'linkedin', label: 'LinkedIn Ads' },
    { value: 'email', label: 'Email marketing' },
    { value: 'seo', label: 'SEO' },
    { value: 'content', label: 'Content marketing' },
    { value: 'influencer', label: 'Influencer marketing' },
    { value: 'offline', label: 'Offline reklama' },
    { value: 'none', label: 'Žiadny - začíname' }
  ],
  
  GOALS: [
    { value: 'more_sales', label: 'Viac predajov / objednávok' },
    { value: 'leads', label: 'Získať kontakty (leads)' },
    { value: 'awareness', label: 'Zvýšiť povedomie o značke' },
    { value: 'traffic', label: 'Viac návštevníkov na webe' },
    { value: 'local', label: 'Prilákať lokálnych zákazníkov' },
    { value: 'app', label: 'Inštalácie aplikácie' },
    { value: 'engagement', label: 'Vyššia angažovanosť' }
  ],
  
  TONE_OPTIONS: [
    { value: 'professional', label: 'Profesionálny' },
    { value: 'friendly', label: 'Priateľský' },
    { value: 'luxury', label: 'Luxusný / Prémiový' },
    { value: 'playful', label: 'Hravý / Zábavný' },
    { value: 'expert', label: 'Expertný / Odborný' },
    { value: 'casual', label: 'Neformálny' }
  ],

  init() {
    console.log('📋 Onboarding module v2.0 initialized');
  },
  
  /**
   * Main render - shows list of all onboardings
   */
  async render(container, params = {}) {
    this.isPublic = false;
    
    // Check if viewing specific client's onboarding
    if (params.client_id || params.clientId) {
      this.clientId = params.client_id || params.clientId;
      this.currentView = 'form';
      return this.renderOnboardingForm(container);
    }
    
    // Check if viewing onboarding detail
    if (params.id) {
      this.onboardingId = params.id;
      this.currentView = 'detail';
      return this.renderOnboardingDetail(container);
    }
    
    // Default: show list
    this.currentView = 'list';
    return this.renderOnboardingList(container);
  },

  /**
   * Render modern onboarding list
   */
  async renderOnboardingList(container) {
    container.innerHTML = `
      <div class="flex items-center justify-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    `;
    
    try {
      // Load all onboarding responses with client data
      const onboardings = await Database.query(`
        SELECT 
          o.*,
          c.company_name,
          c.email as client_email,
          c.domain,
          c.logo_url,
          c.onboarding_status,
          c.onboarding_sent_at,
          c.onboarding_token
        FROM onboarding_responses o
        LEFT JOIN clients c ON o.client_id = c.id
        ORDER BY o.updated_at DESC
      `);
      
      // Load clients without onboarding (pending)
      const pendingClients = await Database.query(`
        SELECT * FROM clients 
        WHERE onboarding_status IN ('sent', 'pending', NULL)
        AND id NOT IN (SELECT client_id FROM onboarding_responses WHERE client_id IS NOT NULL)
        ORDER BY created_at DESC
      `);
      
      container.innerHTML = this.templateOnboardingList(onboardings || [], pendingClients || []);
      this.setupListEventListeners();
      
    } catch (error) {
      console.error('Error loading onboardings:', error);
      container.innerHTML = `
        <div class="text-center py-12">
          <div class="text-4xl mb-4">❌</div>
          <p class="text-gray-500">Chyba pri načítaní: ${error.message}</p>
        </div>
      `;
    }
  },

  /**
   * Template for onboarding list
   */
  templateOnboardingList(onboardings, pendingClients) {
    const stats = {
      total: onboardings.length + pendingClients.length,
      completed: onboardings.filter(o => o.status === 'submitted').length,
      inProgress: onboardings.filter(o => o.status === 'in_progress' || o.status === 'draft').length,
      pending: pendingClients.length
    };
    
    return `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Onboarding</h1>
            <p class="text-gray-500">Správa onboarding dotazníkov klientov</p>
          </div>
          <div class="flex gap-3">
            <button onclick="OnboardingModule.showNewOnboardingModal()" 
              class="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Nový onboarding
            </button>
          </div>
        </div>
        
        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl p-4 border border-gray-100">
            <div class="text-2xl font-bold text-gray-900">${stats.total}</div>
            <div class="text-sm text-gray-500">Celkom</div>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-100">
            <div class="text-2xl font-bold text-green-600">${stats.completed}</div>
            <div class="text-sm text-gray-500">Dokončených</div>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-100">
            <div class="text-2xl font-bold text-yellow-600">${stats.inProgress}</div>
            <div class="text-sm text-gray-500">Rozpracovaných</div>
          </div>
          <div class="bg-white rounded-xl p-4 border border-gray-100">
            <div class="text-2xl font-bold text-orange-600">${stats.pending}</div>
            <div class="text-sm text-gray-500">Čaká na vyplnenie</div>
          </div>
        </div>
        
        <!-- Tabs -->
        <div class="flex gap-2 border-b border-gray-200">
          <button onclick="OnboardingModule.filterList('all')" 
            class="px-4 py-2 text-sm font-medium border-b-2 border-orange-500 text-orange-600" data-tab="all">
            Všetky
          </button>
          <button onclick="OnboardingModule.filterList('completed')" 
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="completed">
            Dokončené
          </button>
          <button onclick="OnboardingModule.filterList('pending')" 
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="pending">
            Čakajúce
          </button>
        </div>
        
        <!-- List -->
        <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div class="divide-y divide-gray-100" id="onboarding-list">
            ${this.renderOnboardingItems(onboardings, pendingClients)}
          </div>
          
          ${onboardings.length === 0 && pendingClients.length === 0 ? `
            <div class="text-center py-12">
              <div class="text-4xl mb-4">📋</div>
              <p class="text-gray-500">Zatiaľ žiadne onboardingy</p>
              <button onclick="OnboardingModule.showNewOnboardingModal()" 
                class="mt-4 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg font-medium">
                Vytvoriť prvý onboarding
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  /**
   * Render onboarding items
   */
  renderOnboardingItems(onboardings, pendingClients) {
    let html = '';
    
    // Completed and in-progress onboardings
    for (const o of onboardings) {
      const logoUrl = o.logo_url || (o.domain ? `https://www.google.com/s2/favicons?domain=${o.domain}&sz=64` : null);
      const statusInfo = this.getStatusInfo(o.status);
      const updatedAt = o.updated_at ? new Date(o.updated_at).toLocaleDateString('sk-SK') : '-';
      
      html += `
        <div class="p-4 hover:bg-gray-50 transition-colors cursor-pointer onboarding-item" 
          data-status="${o.status || 'pending'}"
          onclick="Router.navigate('onboarding', { id: '${o.id}' })">
          <div class="flex items-center gap-4">
            <!-- Logo -->
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${logoUrl ? `
                <img src="${logoUrl}" alt="" class="w-8 h-8 object-contain" onerror="this.parentElement.innerHTML='<span class=\\'text-xl\\'>${(o.company_name || '?')[0]}</span>'">
              ` : `
                <span class="text-xl font-bold text-gray-400">${(o.company_name || '?')[0]}</span>
              `}
            </div>
            
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-gray-900 truncate">${o.company_name || 'Neznámy'}</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.class}">
                  ${statusInfo.label}
                </span>
              </div>
              <div class="text-sm text-gray-500 truncate">${o.client_email || o.contact_email || '-'}</div>
            </div>
            
            <!-- Progress -->
            <div class="hidden md:block text-right">
              <div class="text-sm font-medium text-gray-900">${this.calculateProgress(o)}%</div>
              <div class="text-xs text-gray-500">dokončené</div>
            </div>
            
            <!-- Date -->
            <div class="hidden md:block text-right">
              <div class="text-sm text-gray-500">${updatedAt}</div>
              <div class="text-xs text-gray-400">naposledy upravené</div>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button onclick="event.stopPropagation(); OnboardingModule.showActions('${o.id}', '${o.client_id}')" 
                class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }
    
    // Pending clients (sent but not started)
    for (const c of pendingClients) {
      const logoUrl = c.logo_url || (c.domain ? `https://www.google.com/s2/favicons?domain=${c.domain}&sz=64` : null);
      const sentAt = c.onboarding_sent_at ? new Date(c.onboarding_sent_at).toLocaleDateString('sk-SK') : '-';
      
      html += `
        <div class="p-4 hover:bg-gray-50 transition-colors cursor-pointer onboarding-item" 
          data-status="pending"
          onclick="OnboardingModule.showClientOnboarding('${c.id}')">
          <div class="flex items-center gap-4">
            <!-- Logo -->
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${logoUrl ? `
                <img src="${logoUrl}" alt="" class="w-8 h-8 object-contain" onerror="this.parentElement.innerHTML='<span class=\\'text-xl\\'>${(c.company_name || '?')[0]}</span>'">
              ` : `
                <span class="text-xl font-bold text-gray-400">${(c.company_name || '?')[0]}</span>
              `}
            </div>
            
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-gray-900 truncate">${c.company_name || 'Neznámy'}</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  ⏳ Čaká na vyplnenie
                </span>
              </div>
              <div class="text-sm text-gray-500 truncate">${c.email || '-'}</div>
            </div>
            
            <!-- Sent date -->
            <div class="hidden md:block text-right">
              <div class="text-sm text-gray-500">${sentAt}</div>
              <div class="text-xs text-gray-400">odoslané</div>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button onclick="event.stopPropagation(); OnboardingModule.resendOnboarding('${c.id}')" 
                class="p-2 hover:bg-orange-100 rounded-lg transition-colors text-orange-600" title="Poslať znova">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </button>
              <button onclick="event.stopPropagation(); OnboardingModule.showActions(null, '${c.id}')" 
                class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }
    
    return html;
  },

  /**
   * Get status info
   */
  getStatusInfo(status) {
    const statuses = {
      'submitted': { label: '✅ Dokončený', class: 'bg-green-100 text-green-700' },
      'completed': { label: '✅ Dokončený', class: 'bg-green-100 text-green-700' },
      'in_progress': { label: '✏️ Rozpracovaný', class: 'bg-yellow-100 text-yellow-700' },
      'draft': { label: '📝 Koncept', class: 'bg-gray-100 text-gray-700' },
      'pending': { label: '⏳ Čaká', class: 'bg-orange-100 text-orange-700' }
    };
    return statuses[status] || statuses['pending'];
  },

  /**
   * Calculate progress percentage
   */
  calculateProgress(onboarding) {
    const fields = [
      'company_name', 'company_website', 'company_industry', 'company_description',
      'products_services', 'target_audience', 'primary_goals', 'monthly_budget_min',
      'contact_person', 'contact_email'
    ];
    
    let filled = 0;
    for (const field of fields) {
      if (onboarding[field] && (Array.isArray(onboarding[field]) ? onboarding[field].length > 0 : true)) {
        filled++;
      }
    }
    
    return Math.round((filled / fields.length) * 100);
  },

  /**
   * Filter list by status
   */
  filterList(filter) {
    // Update tabs
    document.querySelectorAll('[data-tab]').forEach(tab => {
      if (tab.dataset.tab === filter) {
        tab.classList.add('border-orange-500', 'text-orange-600');
        tab.classList.remove('border-transparent', 'text-gray-500');
      } else {
        tab.classList.remove('border-orange-500', 'text-orange-600');
        tab.classList.add('border-transparent', 'text-gray-500');
      }
    });
    
    // Filter items
    document.querySelectorAll('.onboarding-item').forEach(item => {
      const status = item.dataset.status;
      if (filter === 'all') {
        item.style.display = '';
      } else if (filter === 'completed') {
        item.style.display = (status === 'submitted' || status === 'completed') ? '' : 'none';
      } else if (filter === 'pending') {
        item.style.display = (status === 'pending' || status === 'draft' || status === 'in_progress') ? '' : 'none';
      }
    });
  },

  /**
   * Show actions dropdown
   */
  showActions(onboardingId, clientId) {
    const actions = [];
    
    if (onboardingId) {
      actions.push({ label: '👁️ Zobraziť detail', action: () => Router.navigate('onboarding', { id: onboardingId }) });
      actions.push({ label: '✏️ Upraviť', action: () => Router.navigate('onboarding', { client_id: clientId }) });
      actions.push({ label: '📧 Poslať klientovi', action: () => this.resendOnboarding(clientId) });
      actions.push({ label: '🗑️ Zmazať', action: () => this.deleteOnboarding(onboardingId), danger: true });
    } else {
      actions.push({ label: '✏️ Vyplniť za klienta', action: () => Router.navigate('onboarding', { client_id: clientId }) });
      actions.push({ label: '📧 Poslať pripomienku', action: () => this.resendOnboarding(clientId) });
    }
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'fixed inset-0 z-50';
    dropdown.innerHTML = `
      <div class="absolute inset-0" onclick="this.parentElement.remove()"></div>
      <div class="absolute bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-48" 
        style="top: ${event.clientY}px; left: ${Math.min(event.clientX, window.innerWidth - 200)}px;">
        ${actions.map(a => `
          <button onclick="event.stopPropagation(); this.closest('.fixed').remove(); (${a.action.toString()})()" 
            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${a.danger ? 'text-red-600' : 'text-gray-700'}">
            ${a.label}
          </button>
        `).join('')}
      </div>
    `;
    document.body.appendChild(dropdown);
  },

  /**
   * Delete onboarding
   */
  async deleteOnboarding(onboardingId) {
    if (!confirm('Naozaj chcete zmazať tento onboarding? Táto akcia je nevratná.')) return;
    
    try {
      await Database.delete('onboarding_responses', onboardingId);
      Notifications.success('Onboarding bol zmazaný');
      this.render(document.getElementById('main-content'));
    } catch (error) {
      console.error('Delete error:', error);
      Notifications.error('Chyba pri mazaní: ' + error.message);
    }
  },

  /**
   * Resend onboarding email
   */
  async resendOnboarding(clientId) {
    try {
      const client = await Database.select('clients', { filters: { id: clientId }, single: true });
      
      if (!client || !client.email) {
        Notifications.error('Klient nemá email');
        return;
      }
      
      // Generate new token if needed
      let token = client.onboarding_token;
      if (!token) {
        token = 'ob_' + Array.from({length: 24}, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
        await Database.update('clients', clientId, { onboarding_token: token });
      }
      
      const onboardingUrl = `https://adlify-app.netlify.app/onboarding/?t=${token}`;
      
      // Send email via Netlify function
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          subject: `Pripomienka: Dokončite onboarding - ${client.company_name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #f97316, #ec4899); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="margin: 0;">Dokončite onboarding 📋</h1>
              </div>
              <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 10px 10px;">
                <p>Dobrý deň,</p>
                <p>pripomíname Vám vyplnenie onboarding dotazníka pre <strong>${client.company_name}</strong>.</p>
                <p>Dotazník nám pomôže lepšie pochopiť Vaše potreby a pripraviť efektívne marketingové kampane.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${onboardingUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">
                    Vyplniť dotazník →
                  </a>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                <p style="color: #64748b; font-size: 14px;">S pozdravom,<br><strong>Tím Adlify</strong></p>
              </div>
            </div>
          `
        })
      });
      
      if (response.ok) {
        // Update sent timestamp
        await Database.update('clients', clientId, { 
          onboarding_sent_at: new Date().toISOString(),
          onboarding_status: 'sent'
        });
        
        // Log activity
        await this.logActivity(clientId, 'reminder_sent', 'Odoslaná pripomienka na vyplnenie onboardingu');
        
        Notifications.success('Pripomienka bola odoslaná');
      } else {
        throw new Error('Email sa nepodarilo odoslať');
      }
      
    } catch (error) {
      console.error('Resend error:', error);
      Notifications.error('Chyba: ' + error.message);
    }
  },

  /**
   * Log activity for history
   */
  async logActivity(clientId, action, description) {
    try {
      await Database.insert('activities', {
        entity_type: 'onboarding',
        entity_id: clientId,
        action: action,
        description: description,
        created_by: Auth.user?.id
      });
    } catch (e) {
      console.warn('Could not log activity:', e);
    }
  },

  /**
   * Show client's onboarding (navigate to form)
   */
  showClientOnboarding(clientId) {
    Router.navigate('onboarding', { client_id: clientId });
  },

  /**
   * Show modal for new onboarding
   */
  async showNewOnboardingModal() {
    // Load clients without onboarding
    const clients = await Database.select('clients', {
      order: { column: 'company_name', ascending: true }
    });
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50" onclick="this.parentElement.remove()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <div class="p-6 border-b border-gray-100">
          <h2 class="text-xl font-bold">Nový onboarding</h2>
          <p class="text-gray-500 text-sm">Vyberte klienta alebo vytvorte nového</p>
        </div>
        <div class="p-6 max-h-96 overflow-y-auto">
          <div class="space-y-2">
            ${clients.map(c => `
              <button onclick="this.closest('.fixed').remove(); Router.navigate('onboarding', { client_id: '${c.id}' })" 
                class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left transition-colors">
                <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-400">
                  ${(c.company_name || '?')[0]}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">${c.company_name}</div>
                  <div class="text-sm text-gray-500 truncate">${c.email || '-'}</div>
                </div>
                <span class="px-2 py-1 rounded-full text-xs ${
                  c.onboarding_status === 'completed' ? 'bg-green-100 text-green-700' :
                  c.onboarding_status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }">
                  ${c.onboarding_status === 'completed' ? '✅' : c.onboarding_status === 'in_progress' ? '✏️' : '⏳'}
                </span>
              </button>
            `).join('')}
          </div>
          
          ${clients.length === 0 ? `
            <div class="text-center py-8">
              <p class="text-gray-500 mb-4">Zatiaľ nemáte žiadnych klientov</p>
              <button onclick="this.closest('.fixed').remove(); Router.navigate('clients')" 
                class="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg font-medium">
                Pridať klienta
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * Setup event listeners for list
   */
  setupListEventListeners() {
    // Could add search, etc.
  },

  // ==========================================
  // RENDER FOR PUBLIC ACCESS (via token)
  // ==========================================
  
  async renderPublic(container, token) {
    this.isPublic = true;
    
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      const client = await Database.select('clients', {
        filters: { onboarding_token: token },
        single: true
      });
      
      if (!client) {
        container.innerHTML = this.renderInvalidToken();
        return;
      }
      
      this.clientId = client.id;
      await this.loadOnboardingData();
      container.innerHTML = this.templatePublic();
      this.setupEventListeners();
      
    } catch (error) {
      console.error('Public onboarding error:', error);
      container.innerHTML = this.renderError(error.message);
    }
  },

  renderInvalidToken() {
    return `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">🔗</div>
          <h1 class="text-2xl font-bold">Neplatný odkaz</h1>
          <p class="text-gray-500 mt-2">Tento odkaz je neplatný alebo expiroval.</p>
          <a href="https://adlify.eu" class="mt-6 inline-block px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl">
            Navštíviť adlify.eu
          </a>
        </div>
      </div>
    `;
  },

  renderError(message) {
    return `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">❌</div>
          <h1 class="text-2xl font-bold">Chyba</h1>
          <p class="text-gray-500 mt-2">${message}</p>
        </div>
      </div>
    `;
  },

  // Keep all existing form rendering and data handling methods...
  // (I'll add the rest in the next message)
