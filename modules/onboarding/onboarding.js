/**
 * ADLIFY PLATFORM - Onboarding Module v1.0
 * Multi-step onboarding form for clients
 */

const OnboardingModule = {
  id: 'onboarding',
  name: 'Onboarding',
  icon: Icons.clipboard,
  title: 'Onboarding',
  subtitle: 'Dotazník pre klientov',
  
  menu: { section: 'tools', order: 10 },
  permissions: ['clients', 'view'],
  
  // State
  currentStep: 1,
  totalSteps: 9,
  formData: {},
  clientId: null,
  onboardingId: null,
  isPublic: false, // true ak je prístupné cez token bez prihlásenia
  isSaving: false,
  
  // Sections definition
  SECTIONS: [
    { id: 1, title: 'Základné informácie', icon: Icons.building, key: 'company' },
    { id: 2, title: 'Produkty a služby', icon: Icons.package, key: 'products' },
    { id: 3, title: 'Cieľová skupina', icon: Icons.target, key: 'audience' },
    { id: 4, title: 'Aktuálny marketing', icon: Icons.dashboard, key: 'marketing' },
    { id: 5, title: 'Ciele a očakávania', icon: Icons.rocket, key: 'goals' },
    { id: 6, title: 'Obsah a kreatíva', icon: Icons.palette, key: 'creative' },
    { id: 7, title: 'Technické', icon: Icons.settings, key: 'technical' },
    { id: 8, title: 'Kontaktné údaje', icon: Icons.user, key: 'contact' },
    { id: 9, title: 'Dodatočné info', icon: Icons.edit, key: 'additional' }
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
    console.log('Onboarding module v1.0 initialized');
  },
  
  /**
   * Render - admin view (pre konkrétneho klienta)
   */
  async render(container, params = {}) {
    this.isPublic = false;
    this.clientId = params.client_id || params.clientId;
    
    if (!this.clientId) {
      // Zobraz zoznam klientov na výber
      container.innerHTML = await this.renderClientSelector();
      return;
    }
    
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">${Icons.hourglass}</div></div>';
    
    try {
      await this.loadOnboardingData();
      container.innerHTML = this.template();
      this.setupEventListeners();
    } catch (error) {
      console.error('Onboarding error:', error);
      Utils.showEmpty(container, error.message, '');
    }
  },
  
  /**
   * Render for public access (via token)
   */
  async renderPublic(container, token) {
    this.isPublic = true;
    
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">${Icons.hourglass}</div></div>';
    
    try {
      // Find client by token
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
  
  /**
   * Load existing onboarding data
   */
  async loadOnboardingData() {
    // Check for existing onboarding response
    try {
      const existing = await Database.select('onboarding_responses', {
        filters: { client_id: this.clientId },
        single: true
      });
      
      if (existing) {
        this.onboardingId = existing.id;
        this.formData = this.parseExistingData(existing);
        
        // Find last completed step
        this.currentStep = this.findLastCompletedStep() + 1;
        if (this.currentStep > this.totalSteps) this.currentStep = this.totalSteps;
      } else {
        // Load client data as defaults
        const client = await Database.select('clients', {
          filters: { id: this.clientId },
          single: true
        });
        
        if (client) {
          this.formData = {
            company_name: client.company_name,
            company_website: client.website,
            contact_person: client.contact_person,
            contact_email: client.email,
            contact_phone: client.phone
          };
        }
      }
    } catch (e) {
      console.log('No existing onboarding data');
    }
  },
  
  parseExistingData(data) {
    return {
      // Section 1
      company_name: data.company_name,
      company_website: data.company_website,
      company_industry: data.company_industry,
      company_description: data.company_description,
      company_founded_year: data.company_founded_year,
      company_size: data.company_size,
      company_location: data.company_location,
      // Section 2
      products_services: data.products_services || [],
      unique_selling_points: data.unique_selling_points || [],
      competitive_advantages: data.competitive_advantages,
      // Section 3
      target_audience: data.target_audience || {},
      ideal_customer_description: data.ideal_customer_description,
      customer_lifetime_value: data.customer_lifetime_value,
      average_order_value: data.average_order_value,
      // Section 4
      current_marketing_channels: data.current_marketing_channels || [],
      previous_ad_experience: data.previous_ad_experience,
      previous_monthly_budget: data.previous_monthly_budget,
      what_worked: data.what_worked,
      what_didnt_work: data.what_didnt_work,
      // Section 5
      primary_goals: data.primary_goals || [],
      secondary_goals: data.secondary_goals || [],
      monthly_budget_min: data.monthly_budget_min,
      monthly_budget_max: data.monthly_budget_max,
      expected_cpa: data.expected_cpa,
      expected_roas: data.expected_roas,
      timeline_urgency: data.timeline_urgency,
      // Section 6
      has_brand_guidelines: data.has_brand_guidelines,
      brand_tone_of_voice: data.brand_tone_of_voice,
      existing_assets: data.existing_assets || {},
      preferred_ad_style: data.preferred_ad_style,
      competitors: data.competitors || [],
      // Section 7
      has_google_analytics: data.has_google_analytics,
      has_facebook_pixel: data.has_facebook_pixel,
      has_google_ads_account: data.has_google_ads_account,
      has_meta_business: data.has_meta_business,
      google_ads_account_id: data.google_ads_account_id,
      meta_business_id: data.meta_business_id,
      website_platform: data.website_platform,
      can_add_tracking_codes: data.can_add_tracking_codes,
      // Section 8
      contact_person: data.contact_person,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      preferred_contact_method: data.preferred_contact_method,
      best_contact_time: data.best_contact_time,
      // Section 9
      seasonal_business: data.seasonal_business,
      peak_seasons: data.peak_seasons || [],
      special_requirements: data.special_requirements,
      questions_for_us: data.questions_for_us,
      how_did_you_find_us: data.how_did_you_find_us
    };
  },
  
  findLastCompletedStep() {
    // Simple check - find first empty required field per section
    const checks = [
      () => this.formData.company_name && this.formData.company_industry,
      () => this.formData.products_services?.length > 0,
      () => this.formData.target_audience?.b2b !== undefined || this.formData.target_audience?.b2c !== undefined,
      () => this.formData.current_marketing_channels?.length > 0,
      () => this.formData.primary_goals?.length > 0,
      () => this.formData.brand_tone_of_voice,
      () => this.formData.has_google_analytics !== undefined,
      () => this.formData.contact_email,
      () => true // Last section is optional
    ];
    
    for (let i = 0; i < checks.length; i++) {
      if (!checks[i]()) return i;
    }
    return this.totalSteps;
  },
  
  // ==========================================
  // TEMPLATES
  // ==========================================
  
  template() {
    return `
      <div class="max-w-4xl mx-auto">
        <!-- Progress -->
        ${this.renderProgress()}
        
        <!-- Form Container -->
        <div class="card p-6">
          <form id="onboarding-form" class="space-y-6">
            ${this.renderCurrentSection()}
          </form>
          
          <!-- Navigation -->
          <div class="flex justify-between mt-8 pt-6 border-t">
            <button type="button" onclick="OnboardingModule.prevStep()" 
              class="px-6 py-3 bg-gray-200 rounded-xl hover:bg-gray-300 ${this.currentStep === 1 ? 'invisible' : ''}" >
              ← Späť
            </button>
            
            <div class="flex gap-3">
              <button type="button" onclick="OnboardingModule.saveDraft()" 
                class="px-6 py-3 bg-gray-100 rounded-xl hover:bg-gray-200">
                💾 Uložiť draft
              </button>
              
              ${this.currentStep < this.totalSteps ? `
                <button type="button" onclick="OnboardingModule.nextStep()" 
                  class="px-6 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
                  Ďalej →
                </button>
              ` : `
                <button type="button" onclick="OnboardingModule.submitForm()" 
                  class="px-8 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
                  ${Icons.checkCircle} Odoslať dotazník
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  templatePublic() {
    return `
      <div class="min-h-screen bg-gradient-to-br from-orange-50 to-pink-50 py-8 px-4">
        <div class="max-w-3xl mx-auto">
          <!-- Header -->
          <div class="text-center mb-8">
            <div class="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">A</div>
            <h1 class="text-3xl font-bold text-gray-800">Onboarding dotazník</h1>
            <p class="text-gray-500 mt-2">Pomôžte nám lepšie pochopiť váš biznis</p>
          </div>
          
          <!-- Progress -->
          ${this.renderProgress()}
          
          <!-- Form -->
          <div class="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <form id="onboarding-form" class="space-y-6">
              ${this.renderCurrentSection()}
            </form>
            
            <!-- Navigation -->
            <div class="flex justify-between mt-8 pt-6 border-t">
              <button type="button" onclick="OnboardingModule.prevStep()" 
                class="px-6 py-3 bg-gray-200 rounded-xl hover:bg-gray-300 ${this.currentStep === 1 ? 'invisible' : ''}">
                ← Späť
              </button>
              
              <div class="flex gap-3">
                <button type="button" onclick="OnboardingModule.saveDraft()" 
                  class="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm">
                  Uložiť a pokračovať neskôr
                </button>
                
                ${this.currentStep < this.totalSteps ? `
                  <button type="button" onclick="OnboardingModule.nextStep()" 
                    class="px-6 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
                    Ďalej →
                  </button>
                ` : `
                  <button type="button" onclick="OnboardingModule.submitForm()" 
                    class="px-8 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90">
                    ${Icons.checkCircle} Odoslať
                  </button>
                `}
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="text-center mt-8 text-sm text-gray-400">
            <p>Vaše údaje sú v bezpečí a budú použité len na prípravu vašej marketingovej stratégie.</p>
            <p class="mt-2">© ${new Date().getFullYear()} Adlify • <a href="https://adlify.eu" class="hover:underline">adlify.eu</a></p>
          </div>
        </div>
      </div>
      
      <style>
        body { background: linear-gradient(135deg, #FFF5F0 0%, #FFF0F5 100%); }
      </style>
    `;
  },
  
  renderProgress() {
    return `
      <div class="mb-8">
        <!-- Step indicators -->
        <div class="flex items-center justify-between mb-4">
          ${this.SECTIONS.map((section, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === this.currentStep;
            const isCompleted = stepNum < this.currentStep;
            
            return `
              <div class="flex flex-col items-center cursor-pointer" onclick="OnboardingModule.goToStep(${stepNum})">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                  ${isActive ? 'gradient-bg text-white shadow-lg scale-110' : 
                    isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}">
                  ${isCompleted ? '✓' : section.icon}
                </div>
                <span class="text-xs mt-1 hidden md:block ${isActive ? 'text-orange-600 font-medium' : 'text-gray-400'}">
                  ${section.title}
                </span>
              </div>
              ${index < this.totalSteps - 1 ? `
                <div class="flex-1 h-1 mx-2 rounded ${stepNum < this.currentStep ? 'bg-green-500' : 'bg-gray-200'}"></div>
              ` : ''}
            `;
          }).join('')}
        </div>
        
        <!-- Current section title -->
        <div class="text-center">
          <h2 class="text-2xl font-bold text-gray-800">
            ${this.SECTIONS[this.currentStep - 1].icon} ${this.SECTIONS[this.currentStep - 1].title}
          </h2>
          <p class="text-gray-500">Krok ${this.currentStep} z ${this.totalSteps}</p>
        </div>
      </div>
    `;
  },
  
  renderCurrentSection() {
    switch (this.currentStep) {
      case 1: return this.renderSection1();
      case 2: return this.renderSection2();
      case 3: return this.renderSection3();
      case 4: return this.renderSection4();
      case 5: return this.renderSection5();
      case 6: return this.renderSection6();
      case 7: return this.renderSection7();
      case 8: return this.renderSection8();
      case 9: return this.renderSection9();
      default: return '';
    }
  },
  
  // ==========================================
  // SECTION 1: Základné informácie
  // ==========================================
  renderSection1() {
    return `
      <div class="space-y-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-2">Názov firmy *</label>
            <input type="text" name="company_name" value="${this.formData.company_name || ''}" 
              required class="w-full p-3 border rounded-xl" placeholder="Názov vašej spoločnosti">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Webová stránka</label>
            <input type="url" name="company_website" value="${this.formData.company_website || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="https://www.example.sk">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Odvetvie *</label>
            <select name="company_industry" required class="w-full p-3 border rounded-xl">
              <option value="">Vyberte odvetvie...</option>
              ${this.INDUSTRIES.map(ind => 
                `<option value="${ind}" ${this.formData.company_industry === ind ? 'selected' : ''}>${ind}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Popis firmy *</label>
          <textarea name="company_description" rows="4" required class="w-full p-3 border rounded-xl" 
            placeholder="Stručne opíšte čím sa vaša firma zaoberá, aké produkty/služby ponúkate...">${this.formData.company_description || ''}</textarea>
          <p class="text-xs text-gray-400 mt-1">Čím detailnejšie, tým lepšie dokážeme pripraviť stratégiu</p>
        </div>
        
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Rok založenia</label>
            <input type="number" name="company_founded_year" value="${this.formData.company_founded_year || ''}" 
              min="1900" max="${new Date().getFullYear()}" class="w-full p-3 border rounded-xl" placeholder="${new Date().getFullYear() - 5}">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Veľkosť firmy *</label>
            <select name="company_size" required class="w-full p-3 border rounded-xl">
              <option value="">Vyberte...</option>
              ${this.COMPANY_SIZES.map(size => 
                `<option value="${size.value}" ${this.formData.company_size === size.value ? 'selected' : ''}>${size.label}</option>`
              ).join('')}
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Lokalita / Mesto</label>
            <input type="text" name="company_location" value="${this.formData.company_location || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="Bratislava">
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 2: Produkty a služby
  // ==========================================
  renderSection2() {
    const products = this.formData.products_services || [];
    const usps = this.formData.unique_selling_points || [];
    const suggestedKeywords = this.formData.suggested_keywords || [];
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Hlavné produkty/služby *</label>
          <p class="text-xs text-gray-500 mb-3">Pridajte vaše hlavné produkty alebo služby, ktoré chcete propagovať</p>
          
          <div id="products-list" class="space-y-3">
            ${products.length > 0 ? products.map((p, i) => this.renderProductItem(p, i)).join('') : this.renderProductItem({}, 0)}
          </div>
          
          <button type="button" onclick="OnboardingModule.addProduct()" 
            class="mt-3 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            ➕ Pridať ďalší produkt/službu
          </button>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Unikátne predajné argumenty (USP) *</label>
          <p class="text-xs text-gray-500 mb-3">Čím ste lepší ako konkurencia? Prečo by mal zákazník kúpiť práve od vás?</p>
          
          <div id="usp-list" class="space-y-2">
            ${usps.length > 0 ? usps.map((usp, i) => `
              <div class="flex gap-2">
                <input type="text" name="usp_${i}" value="${usp}" class="flex-1 p-3 border rounded-xl" placeholder="napr. Bezplatná doprava nad 50€">
                <button type="button" onclick="OnboardingModule.removeUsp(${i})" class="p-3 hover:bg-red-100 rounded-xl text-red-500">✕</button>
              </div>
            `).join('') : `
              <div class="flex gap-2">
                <input type="text" name="usp_0" value="" class="flex-1 p-3 border rounded-xl" placeholder="napr. Bezplatná doprava nad 50€">
              </div>
            `}
          </div>
          
          <button type="button" onclick="OnboardingModule.addUsp()" 
            class="mt-2 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            ➕ Pridať USP
          </button>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Konkurenčné výhody</label>
          <textarea name="competitive_advantages" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Opíšte čo vás odlišuje od konkurencie - kvalita, cena, servis, tradícia...">${this.formData.competitive_advantages || ''}</textarea>
        </div>
        
        <!-- Keyword Suggestions Section -->
        <div class="border-t pt-6">
          <div class="flex items-center justify-between mb-3">
            <div>
              <label class="block text-sm font-medium">Návrhy kľúčových slov</label>
              <p class="text-xs text-gray-500">AI navrhne kľúčové slová na základe vašich produktov</p>
            </div>
            <button type="button" onclick="OnboardingModule.generateKeywordSuggestions()" 
              id="keyword-suggest-btn"
              class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-2">
              ✨ Navrhnúť kľúčové slová
            </button>
          </div>
          
          <div id="keyword-suggestions-container">
            ${suggestedKeywords.length > 0 ? this.renderKeywordSuggestions(suggestedKeywords) : `
              <div class="bg-gray-50 rounded-xl p-4 text-center text-gray-500 text-sm">
                Najprv pridajte produkty a kliknite na "Navrhnúť kľúčové slová"
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },
  
  renderKeywordSuggestions(keywords) {
    if (!keywords || keywords.length === 0) {
      return `<div class="bg-gray-50 rounded-xl p-4 text-center text-gray-500 text-sm">Žiadne návrhy</div>`;
    }
    
    return `
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium">${keywords.length} návrhov</span>
          <button type="button" onclick="OnboardingModule.selectAllKeywords()" 
            class="text-xs text-purple-600 hover:underline">Vybrať všetky</button>
        </div>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          ${keywords.map((kw, i) => `
            <label class="flex items-center gap-2 p-2 bg-white rounded-lg border hover:border-purple-300 cursor-pointer text-sm">
              <input type="checkbox" name="selected_keyword_${i}" value="${kw.keyword}" 
                ${this.formData.selected_keywords?.includes(kw.keyword) ? 'checked' : ''} 
                class="keyword-checkbox rounded text-purple-600">
              <div class="flex-1 min-w-0">
                <div class="truncate">${kw.keyword}</div>
                <div class="text-xs text-gray-500">
                  ${kw.search_volume > 0 ? `${kw.search_volume.toLocaleString()}/mes` : '-'}
                  ${kw.cpc > 0 ? ` • ${kw.cpc.toFixed(2)}€` : ''}
                </div>
              </div>
            </label>
          `).join('')}
        </div>
        <div class="mt-3 pt-3 border-t text-xs text-gray-500">
          Vybrané kľúčové slová sa použijú pre generovanie kampaní
        </div>
      </div>
    `;
  },
  
  async generateKeywordSuggestions() {
    // Collect product names from form
    this.collectFormData();
    const products = this.formData.products_services || [];
    
    if (products.length === 0 || !products[0]?.name) {
      Utils.toast('Najprv pridajte aspoň jeden produkt', 'warning');
      return;
    }
    
    const btn = document.getElementById('keyword-suggest-btn');
    btn.disabled = true;
    btn.innerHTML = 'Generujem...';
    
    try {
      // Get product names as seed keywords
      const seedKeywords = products
        .map(p => p.name)
        .filter(Boolean)
        .slice(0, 5);
      
      // Add company name if available
      if (this.formData.company_name) {
        seedKeywords.unshift(this.formData.company_name);
      }
      
      // Call Marketing Miner API
      const { data: { session } } = await Database.client.auth.getSession();
      const response = await fetch(
        'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/keyword-research',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || Config.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            keywords: seedKeywords,
            lang: 'sk',
            action: 'suggestions'
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success && result.data?.length > 0) {
        this.formData.suggested_keywords = result.data;
        
        // Update UI
        const container = document.getElementById('keyword-suggestions-container');
        if (container) {
          container.innerHTML = this.renderKeywordSuggestions(result.data);
        }
        
        Utils.toast(`Nájdených ${result.data.length} kľúčových slov! ✨`, 'success');
      } else {
        throw new Error(result.error || 'Žiadne návrhy');
      }
      
    } catch (error) {
      console.error('Keyword suggestions error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '✨ Navrhnúť kľúčové slová';
  },
  
  selectAllKeywords() {
    const checkboxes = document.querySelectorAll('.keyword-checkbox');
    const allChecked = [...checkboxes].every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
  },
  
  renderProductItem(product = {}, index) {
    return `
      <div class="p-4 bg-gray-50 rounded-xl space-y-3" data-product-index="${index}">
        <div class="flex justify-between items-center">
          <span class="font-medium text-sm">Produkt/Služba ${index + 1}</span>
          ${index > 0 ? `<button type="button" onclick="OnboardingModule.removeProduct(${index})" class="text-red-500 hover:text-red-700">✕</button>` : ''}
        </div>
        <div class="grid md:grid-cols-2 gap-3">
          <input type="text" name="product_name_${index}" value="${product.name || ''}" 
            class="p-3 border rounded-xl" placeholder="Názov produktu/služby">
          <input type="text" name="product_price_${index}" value="${product.price_range || ''}" 
            class="p-3 border rounded-xl" placeholder="Cenové rozpätie (napr. 50-100€)">
        </div>
        <textarea name="product_desc_${index}" rows="2" class="w-full p-3 border rounded-xl" 
          placeholder="Krátky popis...">${product.description || ''}</textarea>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="product_main_${index}" ${product.is_main ? 'checked' : ''} class="rounded">
          Toto je náš hlavný produkt/služba
        </label>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 3: Cieľová skupina
  // ==========================================
  renderSection3() {
    const audience = this.formData.target_audience || {};
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-3">Typ zákazníkov *</label>
          <div class="flex gap-4">
            <label class="flex-1 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 ${audience.b2c ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
              <input type="checkbox" name="audience_b2c" ${audience.b2c ? 'checked' : ''} class="mr-2" onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
              <span class="font-medium">B2C</span>
              <p class="text-sm text-gray-500 mt-1">Predávate koncovým zákazníkom</p>
            </label>
            <label class="flex-1 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 ${audience.b2b ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
              <input type="checkbox" name="audience_b2b" ${audience.b2b ? 'checked' : ''} class="mr-2" onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
              <span class="font-medium">B2B</span>
              <p class="text-sm text-gray-500 mt-1">Predávate firmám</p>
            </label>
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium mb-2">Vek cieľovej skupiny</label>
            <div class="flex gap-2 items-center">
              <input type="number" name="audience_age_from" value="${audience.demographics?.age_from || ''}" 
                class="w-24 p-3 border rounded-xl" placeholder="Od" min="13" max="100">
              <span>-</span>
              <input type="number" name="audience_age_to" value="${audience.demographics?.age_to || ''}" 
                class="w-24 p-3 border rounded-xl" placeholder="Do" min="13" max="100">
              <span class="text-gray-500">rokov</span>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Pohlavie</label>
            <select name="audience_gender" class="w-full p-3 border rounded-xl">
              <option value="all" ${(audience.demographics?.gender || 'all') === 'all' ? 'selected' : ''}>Všetci</option>
              <option value="male" ${audience.demographics?.gender === 'male' ? 'selected' : ''}>Prevažne muži</option>
              <option value="female" ${audience.demographics?.gender === 'female' ? 'selected' : ''}>Prevažne ženy</option>
            </select>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Geografické zameranie *</label>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-gray-500">Krajiny</label>
              <input type="text" name="audience_countries" value="${audience.geographic?.countries?.join(', ') || 'Slovensko'}" 
                class="w-full p-3 border rounded-xl" placeholder="Slovensko, Česko">
            </div>
            <div>
              <label class="text-xs text-gray-500">Mestá / Regióny (voliteľné)</label>
              <input type="text" name="audience_regions" value="${audience.geographic?.regions?.join(', ') || ''}" 
                class="w-full p-3 border rounded-xl" placeholder="Bratislava, Košice...">
            </div>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Popis ideálneho zákazníka *</label>
          <textarea name="ideal_customer_description" rows="4" required class="w-full p-3 border rounded-xl" 
            placeholder="Opíšte vášho typického/ideálneho zákazníka - kto je, aké má záujmy, problémy, čo hľadá...">${this.formData.ideal_customer_description || ''}</textarea>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Priemerná hodnota objednávky (€)</label>
            <input type="number" name="average_order_value" value="${this.formData.average_order_value || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="50">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Životná hodnota zákazníka (€)</label>
            <input type="number" name="customer_lifetime_value" value="${this.formData.customer_lifetime_value || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="500">
            <p class="text-xs text-gray-400 mt-1">Koľko v priemere utratí zákazník za celú dobu</p>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 4: Aktuálny marketing
  // ==========================================
  renderSection4() {
    const channels = this.formData.current_marketing_channels || [];
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-3">Aké marketingové kanály aktuálne používate? *</label>
          <div class="grid md:grid-cols-3 gap-3">
            ${this.MARKETING_CHANNELS.map(ch => `
              <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 ${channels.includes(ch.value) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="channel_${ch.value}" ${channels.includes(ch.value) ? 'checked' : ''} 
                  onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
                <span>${ch.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Predchádzajúce skúsenosti s online reklamou</label>
          <textarea name="previous_ad_experience" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Opíšte vaše doterajšie skúsenosti - robili ste reklamy sami, cez agentúru, aké výsledky ste mali...">${this.formData.previous_ad_experience || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Predchádzajúci mesačný rozpočet na reklamu (€)</label>
          <input type="number" name="previous_monthly_budget" value="${this.formData.previous_monthly_budget || ''}" 
            class="w-full p-3 border rounded-xl" placeholder="0 ak ste reklamu nerobili">
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Čo fungovalo?</label>
            <textarea name="what_worked" rows="3" class="w-full p-3 border rounded-xl" 
              placeholder="Aké kampane/kanály vám prinášali najlepšie výsledky?">${this.formData.what_worked || ''}</textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Čo nefungovalo?</label>
            <textarea name="what_didnt_work" rows="3" class="w-full p-3 border rounded-xl" 
              placeholder="S čím ste mali problémy alebo zlé skúsenosti?">${this.formData.what_didnt_work || ''}</textarea>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 5: Ciele a očakávania
  // ==========================================
  renderSection5() {
    const primaryGoals = this.formData.primary_goals || [];
    const secondaryGoals = this.formData.secondary_goals || [];
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-3">Hlavné ciele kampane *</label>
          <p class="text-xs text-gray-500 mb-3">Vyberte 1-2 hlavné ciele, na ktoré sa chcete zamerať</p>
          <div class="grid md:grid-cols-2 gap-3">
            ${this.GOALS.map(g => `
              <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 ${primaryGoals.includes(g.value) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="goal_primary_${g.value}" ${primaryGoals.includes(g.value) ? 'checked' : ''} 
                  onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
                <span>${g.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Mesačný rozpočet na reklamu *</label>
            <div class="flex gap-2 items-center">
              <input type="number" name="monthly_budget_min" value="${this.formData.monthly_budget_min || ''}" 
                required class="w-full p-3 border rounded-xl" placeholder="Od (€)">
              <span>-</span>
              <input type="number" name="monthly_budget_max" value="${this.formData.monthly_budget_max || ''}" 
                required class="w-full p-3 border rounded-xl" placeholder="Do (€)">
            </div>
            <p class="text-xs text-gray-400 mt-1">Len rozpočet na reklamu, bez poplatku za správu</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Časový rámec</label>
            <select name="timeline_urgency" class="w-full p-3 border rounded-xl">
              <option value="">Vyberte...</option>
              <option value="asap" ${this.formData.timeline_urgency === 'asap' ? 'selected' : ''}>Čo najskôr</option>
              <option value="this_month" ${this.formData.timeline_urgency === 'this_month' ? 'selected' : ''}>Tento mesiac</option>
              <option value="next_month" ${this.formData.timeline_urgency === 'next_month' ? 'selected' : ''}>Budúci mesiac</option>
              <option value="planning" ${this.formData.timeline_urgency === 'planning' ? 'selected' : ''}>Len plánujem</option>
            </select>
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Očakávaná cena za konverziu (CPA)</label>
            <input type="number" name="expected_cpa" value="${this.formData.expected_cpa || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="€ za objednávku/lead">
            <p class="text-xs text-gray-400 mt-1">Koľko ste ochotní zaplatiť za jednu objednávku/lead?</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Očakávaná návratnosť (ROAS)</label>
            <input type="number" step="0.1" name="expected_roas" value="${this.formData.expected_roas || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="napr. 3.0">
            <p class="text-xs text-gray-400 mt-1">Koľkonásobne chcete zarobiť? (3.0 = 3€ tržby za 1€ reklamy)</p>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 6: Obsah a kreatíva
  // ==========================================
  renderSection6() {
    const assets = this.formData.existing_assets || {};
    const competitors = this.formData.competitors || [];
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Máte brand manuál / vizuálnu identitu?</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="radio" name="has_brand_guidelines" value="true" ${this.formData.has_brand_guidelines === true ? 'checked' : ''}>
              <span>Áno, máme</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="radio" name="has_brand_guidelines" value="false" ${this.formData.has_brand_guidelines === false ? 'checked' : ''}>
              <span>Nie, nemáme</span>
            </label>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Tón komunikácie značky *</label>
          <select name="brand_tone_of_voice" required class="w-full p-3 border rounded-xl">
            <option value="">Vyberte štýl komunikácie...</option>
            ${this.TONE_OPTIONS.map(t => 
              `<option value="${t.value}" ${this.formData.brand_tone_of_voice === t.value ? 'selected' : ''}>${t.label}</option>`
            ).join('')}
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-3">Existujúce materiály</label>
          <div class="grid md:grid-cols-3 gap-3">
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="assets_photos" ${assets.has_photos ? 'checked' : ''}>
              <span>📷 Kvalitné fotky produktov</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="assets_videos" ${assets.has_videos ? 'checked' : ''}>
              <span>${Icons.video} Videá</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="assets_logo" ${assets.has_logo ? 'checked' : ''}>
              <span>${Icons.palette} Logo vo vysokom rozlíšení</span>
            </label>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Preferovaný štýl reklám</label>
          <textarea name="preferred_ad_style" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Opíšte aký štýl reklám preferujete - minimalistické, farebné, s ľuďmi, produktové...">${this.formData.preferred_ad_style || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Konkurencia</label>
          <p class="text-xs text-gray-500 mb-3">Uveďte 2-3 konkurentov, ktorých reklamy sa vám páčia alebo ktorí sú pre vás inšpiráciou</p>
          
          <div id="competitors-list" class="space-y-3">
            ${competitors.length > 0 ? competitors.map((c, i) => `
              <div class="grid md:grid-cols-2 gap-3">
                <input type="text" name="competitor_name_${i}" value="${c.name || ''}" class="p-3 border rounded-xl" placeholder="Názov konkurenta">
                <input type="text" name="competitor_web_${i}" value="${c.website || ''}" class="p-3 border rounded-xl" placeholder="Web konkurenta">
              </div>
            `).join('') : `
              <div class="grid md:grid-cols-2 gap-3">
                <input type="text" name="competitor_name_0" value="" class="p-3 border rounded-xl" placeholder="Názov konkurenta">
                <input type="text" name="competitor_web_0" value="" class="p-3 border rounded-xl" placeholder="Web konkurenta">
              </div>
            `}
          </div>
          
          <button type="button" onclick="OnboardingModule.addCompetitor()" 
            class="mt-2 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            ➕ Pridať konkurenta
          </button>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 7: Technické
  // ==========================================
  renderSection7() {
    return `
      <div class="space-y-6">
        <p class="text-gray-500">Tieto informácie nám pomôžu správne nastaviť tracking a integrácie.</p>
        
        <div class="grid md:grid-cols-2 gap-6">
          <div class="space-y-4">
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="has_google_analytics" ${this.formData.has_google_analytics ? 'checked' : ''} class="w-5 h-5 rounded">
              <div>
                <span class="font-medium">Google Analytics</span>
                <p class="text-sm text-gray-500">Máte nainštalovaný GA na webe?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="has_facebook_pixel" ${this.formData.has_facebook_pixel ? 'checked' : ''} class="w-5 h-5 rounded">
              <div>
                <span class="font-medium">Meta Pixel (Facebook)</span>
                <p class="text-sm text-gray-500">Máte nainštalovaný Facebook Pixel?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="can_add_tracking_codes" ${this.formData.can_add_tracking_codes ? 'checked' : ''} class="w-5 h-5 rounded">
              <div>
                <span class="font-medium">Môžem pridávať kódy na web</span>
                <p class="text-sm text-gray-500">Máte prístup k úprave webu?</p>
              </div>
            </label>
          </div>
          
          <div class="space-y-4">
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="has_google_ads_account" ${this.formData.has_google_ads_account ? 'checked' : ''} class="w-5 h-5 rounded">
              <div>
                <span class="font-medium">Google Ads účet</span>
                <p class="text-sm text-gray-500">Máte existujúci Google Ads účet?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="checkbox" name="has_meta_business" ${this.formData.has_meta_business ? 'checked' : ''} class="w-5 h-5 rounded">
              <div>
                <span class="font-medium">Meta Business Manager</span>
                <p class="text-sm text-gray-500">Máte firemný Facebook/Instagram účet?</p>
              </div>
            </label>
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Google Ads Account ID</label>
            <input type="text" name="google_ads_account_id" value="${this.formData.google_ads_account_id || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="XXX-XXX-XXXX (ak máte)">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Meta Business ID</label>
            <input type="text" name="meta_business_id" value="${this.formData.meta_business_id || ''}" 
              class="w-full p-3 border rounded-xl" placeholder="(ak máte)">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Platforma webu</label>
          <select name="website_platform" class="w-full p-3 border rounded-xl">
            <option value="">Vyberte...</option>
            <option value="wordpress" ${this.formData.website_platform === 'wordpress' ? 'selected' : ''}>WordPress</option>
            <option value="shopify" ${this.formData.website_platform === 'shopify' ? 'selected' : ''}>Shopify</option>
            <option value="woocommerce" ${this.formData.website_platform === 'woocommerce' ? 'selected' : ''}>WooCommerce</option>
            <option value="prestashop" ${this.formData.website_platform === 'prestashop' ? 'selected' : ''}>PrestaShop</option>
            <option value="wix" ${this.formData.website_platform === 'wix' ? 'selected' : ''}>Wix</option>
            <option value="squarespace" ${this.formData.website_platform === 'squarespace' ? 'selected' : ''}>Squarespace</option>
            <option value="custom" ${this.formData.website_platform === 'custom' ? 'selected' : ''}>Vlastný systém</option>
            <option value="other" ${this.formData.website_platform === 'other' ? 'selected' : ''}>Iné</option>
            <option value="none" ${this.formData.website_platform === 'none' ? 'selected' : ''}>Nemám web</option>
          </select>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 8: Kontaktné údaje
  // ==========================================
  renderSection8() {
    return `
      <div class="space-y-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Kontaktná osoba *</label>
            <input type="text" name="contact_person" value="${this.formData.contact_person || ''}" 
              required class="w-full p-3 border rounded-xl" placeholder="Meno a priezvisko">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Email *</label>
            <input type="email" name="contact_email" value="${this.formData.contact_email || ''}" 
              required class="w-full p-3 border rounded-xl" placeholder="vas@email.sk">
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Telefón *</label>
            <input type="tel" name="contact_phone" value="${this.formData.contact_phone || ''}" 
              required class="w-full p-3 border rounded-xl" placeholder="+421 9XX XXX XXX">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Preferovaný spôsob kontaktu</label>
            <select name="preferred_contact_method" class="w-full p-3 border rounded-xl">
              <option value="email" ${this.formData.preferred_contact_method === 'email' ? 'selected' : ''}>Email</option>
              <option value="phone" ${this.formData.preferred_contact_method === 'phone' ? 'selected' : ''}>Telefón</option>
              <option value="whatsapp" ${this.formData.preferred_contact_method === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Najlepší čas na kontaktovanie</label>
          <input type="text" name="best_contact_time" value="${this.formData.best_contact_time || ''}" 
            class="w-full p-3 border rounded-xl" placeholder="napr. Pracovné dni 9:00-17:00">
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // SECTION 9: Dodatočné informácie
  // ==========================================
  renderSection9() {
    const peakSeasons = this.formData.peak_seasons || [];
    const months = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Je váš biznis sezónny?</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="radio" name="seasonal_business" value="true" ${this.formData.seasonal_business === true ? 'checked' : ''} 
                onchange="document.getElementById('seasons-section').classList.remove('hidden')">
              <span>Áno</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
              <input type="radio" name="seasonal_business" value="false" ${this.formData.seasonal_business === false ? 'checked' : ''} 
                onchange="document.getElementById('seasons-section').classList.add('hidden')">
              <span>Nie</span>
            </label>
          </div>
        </div>
        
        <div id="seasons-section" class="${this.formData.seasonal_business ? '' : 'hidden'}">
          <label class="block text-sm font-medium mb-2">Kedy máte sezónu? (najsilnejšie mesiace)</label>
          <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
            ${months.map((m, i) => `
              <label class="flex items-center gap-1 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 text-sm ${peakSeasons.includes(m.toLowerCase()) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="peak_${m.toLowerCase()}" ${peakSeasons.includes(m.toLowerCase()) ? 'checked' : ''} class="hidden"
                  onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
                <span>${m}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Špeciálne požiadavky alebo obmedzenia</label>
          <textarea name="special_requirements" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Máte nejaké špecifické požiadavky na kampane, obmedzenia, pravidlá...">${this.formData.special_requirements || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Máte na nás nejaké otázky?</label>
          <textarea name="questions_for_us" rows="3" class="w-full p-3 border rounded-xl" 
            placeholder="Čokoľvek, čo by ste chceli vedieť...">${this.formData.questions_for_us || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Ako ste sa o nás dozvedeli?</label>
          <select name="how_did_you_find_us" class="w-full p-3 border rounded-xl">
            <option value="">Vyberte...</option>
            <option value="google" ${this.formData.how_did_you_find_us === 'google' ? 'selected' : ''}>Google vyhľadávanie</option>
            <option value="facebook" ${this.formData.how_did_you_find_us === 'facebook' ? 'selected' : ''}>Facebook/Instagram</option>
            <option value="recommendation" ${this.formData.how_did_you_find_us === 'recommendation' ? 'selected' : ''}>Odporúčanie</option>
            <option value="linkedin" ${this.formData.how_did_you_find_us === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
            <option value="other" ${this.formData.how_did_you_find_us === 'other' ? 'selected' : ''}>Iné</option>
          </select>
        </div>
        
        <div class="bg-green-50 rounded-xl p-4 border border-green-200">
          <h4 class="font-semibold text-green-800 mb-2">${Icons.partyPopper} Ste na konci!</h4>
          <p class="text-sm text-green-700">Ďakujeme za vyplnenie dotazníka. Po odoslaní vám pripravíme návrh marketingovej stratégie na mieru.</p>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // HELPER TEMPLATES
  // ==========================================
  
  async renderClientSelector() {
    const clients = await Database.select('clients', {
      order: { column: 'company_name', ascending: true }
    });
    
    return `
      <div class="max-w-2xl mx-auto">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">${Icons.clipboard} Vyplniť onboarding za klienta</h2>
          <p class="text-gray-500 mb-6">Vyberte klienta, pre ktorého chcete vyplniť onboarding dotazník</p>
          
          <div class="space-y-2">
            ${clients.map(c => `
              <a href="#onboarding?client_id=${c.id}" 
                class="flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50">
                <div>
                  <div class="font-medium">${c.company_name}</div>
                  <div class="text-sm text-gray-500">${c.email || ''}</div>
                </div>
                <span class="px-2 py-1 rounded-full text-xs ${
                  c.onboarding_status === 'completed' ? 'bg-green-100 text-green-700' :
                  c.onboarding_status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }">
                  ${c.onboarding_status === 'completed' ? 'Dokončený' :
                    c.onboarding_status === 'in_progress' ? 'Rozpracovaný' : 
                    'Čaká'}
                </span>
              </a>
            `).join('')}
          </div>
          
          ${clients.length === 0 ? `
            <div class="text-center py-8 text-gray-400">
              <p>Najprv pridajte klienta</p>
              <a href="#clients" class="mt-4 inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-lg">
                Pridať klienta
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  renderInvalidToken() {
    return `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">${Icons.link}</div>
          <h1 class="text-2xl font-bold">Neplatný odkaz</h1>
          <p class="text-gray-500 mt-2">Tento odkaz je neplatný alebo expiroval. Kontaktujte nás pre nový odkaz.</p>
          <a href="https://adlify.eu" class="mt-6 inline-block px-6 py-3 gradient-bg text-white rounded-xl">
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
          <div class="text-6xl mb-4">${Icons.xCircle}</div>
          <h1 class="text-2xl font-bold">Chyba</h1>
          <p class="text-gray-500 mt-2">${message}</p>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // EVENT HANDLERS & NAVIGATION
  // ==========================================
  
  setupEventListeners() {
    // Auto-save on input change
    const form = document.getElementById('onboarding-form');
    if (form) {
      form.addEventListener('change', () => this.collectFormData());
    }
  },
  
  collectFormData() {
    const form = document.getElementById('onboarding-form');
    if (!form) return;
    
    const formData = new FormData(form);
    
    // Collect all form data based on current section
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('product_') || key.startsWith('usp_') || key.startsWith('competitor_') || 
          key.startsWith('channel_') || key.startsWith('goal_') || key.startsWith('peak_') ||
          key.startsWith('assets_') || key.startsWith('audience_')) {
        continue; // Handle these separately
      }
      this.formData[key] = value;
    }
    
    // Handle products
    if (this.currentStep === 2) {
      this.collectProducts(formData);
      this.collectUsps(formData);
      this.collectSelectedKeywords(formData);
    }
    
    // Handle channels
    if (this.currentStep === 4) {
      this.collectChannels(formData);
    }
    
    // Handle goals
    if (this.currentStep === 5) {
      this.collectGoals(formData);
    }
    
    // Handle assets & competitors
    if (this.currentStep === 6) {
      this.collectAssets(formData);
      this.collectCompetitors(formData);
    }
    
    // Handle audience
    if (this.currentStep === 3) {
      this.collectAudience(formData);
    }
    
    // Handle seasons
    if (this.currentStep === 9) {
      this.collectSeasons(formData);
    }
  },
  
  collectProducts(formData) {
    const products = [];
    let i = 0;
    while (formData.has(`product_name_${i}`)) {
      const name = formData.get(`product_name_${i}`);
      if (name) {
        products.push({
          name: name,
          description: formData.get(`product_desc_${i}`),
          price_range: formData.get(`product_price_${i}`),
          is_main: formData.has(`product_main_${i}`)
        });
      }
      i++;
    }
    this.formData.products_services = products;
  },
  
  collectUsps(formData) {
    const usps = [];
    let i = 0;
    while (formData.has(`usp_${i}`)) {
      const usp = formData.get(`usp_${i}`);
      if (usp) usps.push(usp);
      i++;
    }
    this.formData.unique_selling_points = usps;
  },
  
  collectSelectedKeywords(formData) {
    const selectedKeywords = [];
    let i = 0;
    while (formData.has(`selected_keyword_${i}`)) {
      selectedKeywords.push(formData.get(`selected_keyword_${i}`));
      i++;
    }
    // Also check checkboxes that are checked
    const checkboxes = document.querySelectorAll('.keyword-checkbox:checked');
    checkboxes.forEach(cb => {
      if (!selectedKeywords.includes(cb.value)) {
        selectedKeywords.push(cb.value);
      }
    });
    this.formData.selected_keywords = selectedKeywords;
  },
  
  collectChannels(formData) {
    const channels = [];
    this.MARKETING_CHANNELS.forEach(ch => {
      if (formData.has(`channel_${ch.value}`)) {
        channels.push(ch.value);
      }
    });
    this.formData.current_marketing_channels = channels;
  },
  
  collectGoals(formData) {
    const goals = [];
    this.GOALS.forEach(g => {
      if (formData.has(`goal_primary_${g.value}`)) {
        goals.push(g.value);
      }
    });
    this.formData.primary_goals = goals;
  },
  
  collectAssets(formData) {
    this.formData.existing_assets = {
      has_photos: formData.has('assets_photos'),
      has_videos: formData.has('assets_videos'),
      has_logo: formData.has('assets_logo')
    };
  },
  
  collectCompetitors(formData) {
    const competitors = [];
    let i = 0;
    while (formData.has(`competitor_name_${i}`)) {
      const name = formData.get(`competitor_name_${i}`);
      if (name) {
        competitors.push({
          name: name,
          website: formData.get(`competitor_web_${i}`)
        });
      }
      i++;
    }
    this.formData.competitors = competitors;
  },
  
  collectAudience(formData) {
    this.formData.target_audience = {
      b2c: formData.has('audience_b2c'),
      b2b: formData.has('audience_b2b'),
      demographics: {
        age_from: formData.get('audience_age_from'),
        age_to: formData.get('audience_age_to'),
        gender: formData.get('audience_gender')
      },
      geographic: {
        countries: formData.get('audience_countries')?.split(',').map(s => s.trim()).filter(Boolean),
        regions: formData.get('audience_regions')?.split(',').map(s => s.trim()).filter(Boolean)
      }
    };
  },
  
  collectSeasons(formData) {
    const months = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];
    const peaks = [];
    months.forEach(m => {
      if (formData.has(`peak_${m}`)) {
        peaks.push(m);
      }
    });
    this.formData.peak_seasons = peaks;
    this.formData.seasonal_business = formData.get('seasonal_business') === 'true';
  },
  
  goToStep(step) {
    this.collectFormData();
    this.currentStep = step;
    this.rerender();
  },
  
  prevStep() {
    this.collectFormData();
    if (this.currentStep > 1) {
      this.currentStep--;
      this.rerender();
    }
  },
  
  nextStep() {
    this.collectFormData();
    
    // Validate current step
    if (!this.validateCurrentStep()) return;
    
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.rerender();
    }
  },
  
  validateCurrentStep() {
    // Basic validation per step
    const validations = {
      1: () => this.formData.company_name && this.formData.company_industry && this.formData.company_description && this.formData.company_size,
      2: () => this.formData.products_services?.length > 0,
      3: () => (this.formData.target_audience?.b2b || this.formData.target_audience?.b2c) && this.formData.ideal_customer_description,
      4: () => this.formData.current_marketing_channels?.length > 0,
      5: () => this.formData.primary_goals?.length > 0 && this.formData.monthly_budget_min && this.formData.monthly_budget_max,
      6: () => this.formData.brand_tone_of_voice,
      7: () => true, // Optional
      8: () => this.formData.contact_person && this.formData.contact_email && this.formData.contact_phone,
      9: () => true // Optional
    };
    
    const isValid = validations[this.currentStep]?.() ?? true;
    
    if (!isValid) {
      Utils.toast('Vyplňte všetky povinné polia', 'warning');
      return false;
    }
    
    return true;
  },
  
  rerender() {
    const container = this.isPublic ? document.getElementById('app') : document.getElementById('main-content');
    if (container) {
      container.innerHTML = this.isPublic ? this.templatePublic() : this.template();
      this.setupEventListeners();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },
  
  // ==========================================
  // DYNAMIC FIELDS
  // ==========================================
  
  addProduct() {
    const list = document.getElementById('products-list');
    const count = list.querySelectorAll('[data-product-index]').length;
    list.insertAdjacentHTML('beforeend', this.renderProductItem({}, count));
  },
  
  removeProduct(index) {
    document.querySelector(`[data-product-index="${index}"]`)?.remove();
  },
  
  addUsp() {
    const list = document.getElementById('usp-list');
    const count = list.querySelectorAll('input').length;
    list.insertAdjacentHTML('beforeend', `
      <div class="flex gap-2">
        <input type="text" name="usp_${count}" value="" class="flex-1 p-3 border rounded-xl" placeholder="Ďalší USP">
        <button type="button" onclick="this.closest('.flex').remove()" class="p-3 hover:bg-red-100 rounded-xl text-red-500">✕</button>
      </div>
    `);
  },
  
  removeUsp(index) {
    // Handle in DOM
  },
  
  addCompetitor() {
    const list = document.getElementById('competitors-list');
    const count = list.querySelectorAll('.grid').length;
    list.insertAdjacentHTML('beforeend', `
      <div class="grid md:grid-cols-2 gap-3">
        <input type="text" name="competitor_name_${count}" value="" class="p-3 border rounded-xl" placeholder="Názov konkurenta">
        <input type="text" name="competitor_web_${count}" value="" class="p-3 border rounded-xl" placeholder="Web konkurenta">
      </div>
    `);
  },
  
  // ==========================================
  // SAVE & SUBMIT
  // ==========================================
  
  async saveDraft() {
    this.collectFormData();
    await this.saveToDatabase('draft');
    Utils.toast('Draft uložený!', 'success');
  },
  
  async submitForm() {
    this.collectFormData();
    
    if (!this.validateCurrentStep()) return;
    
    await this.saveToDatabase('submitted');
    
    // Update client onboarding status
    await Database.update('clients', this.clientId, {
      onboarding_status: 'completed',
      onboarding_completed_at: new Date().toISOString()
    });
    
    // Automaticky vytvor projekt a spusti AI generovanie
    const projectId = await this.createProjectAndGenerate();
    
    if (this.isPublic) {
      // Show thank you page
      const container = document.getElementById('app');
      container.innerHTML = this.renderThankYou();
    } else {
      Utils.toast('Onboarding dokončený!', 'success');
      Router.navigate('clients', { id: this.clientId });
    }
  },
  
  /**
   * Vytvorí projekt a spustí AI generovanie kampaní
   */
  async createProjectAndGenerate() {
    try {
      // 1. Načítaj klienta
      const client = await Database.select('clients', {
        filters: { id: this.clientId },
        single: true
      });
      
      if (!client) {
        console.error('Client not found');
        return null;
      }
      
      // 2. Vypočítaj rozpočet
      const adBudget = this.formData.monthly_budget_max || this.formData.monthly_budget_min || 300;
      const managementFee = this.formData.package_price || 249;
      
      // 3. Vytvor projekt
      const projectData = {
        client_id: this.clientId,
        onboarding_id: this.onboardingId,
        name: `Kampaň - ${client.company_name}`,
        description: `Automaticky vytvorený projekt z onboardingu`,
        status: 'generating',
        ad_spend_budget: adBudget,
        management_fee: managementFee,
        total_monthly_budget: adBudget + managementFee,
        created_at: new Date().toISOString()
      };
      
      const { data: project, error: projectError } = await Database.client
        .from('campaign_projects')
        .insert(projectData)
        .select()
        .single();
      
      if (projectError) {
        console.error('Project creation error:', projectError);
        return null;
      }
      
      console.log('Project created:', project.id);
      
      // 3. Vytvor notifikáciu pre admina
      await this.createNotification({
        type: 'onboarding_completed',
        title: 'Nový onboarding dokončený',
        message: `${client.company_name} dokončil onboarding. AI generuje návrh kampaní.`,
        link: `#projects?id=${project.id}`,
        project_id: project.id
      });
      
      // 4. Spusti AI generovanie (async - nečakáme na výsledok)
      this.triggerAIGeneration(project.id, this.onboardingId);
      
      return project.id;
      
    } catch (error) {
      console.error('Create project error:', error);
      return null;
    }
  },
  
  /**
   * Spustí AI generovanie kampaní
   */
  async triggerAIGeneration(projectId, onboardingId) {
    try {
      // Mapuj platformy z onboardingu na formát pre Edge Function
      const platformMap = {
        'google_ads': 'google_search',
        'meta_ads': 'meta_facebook',
        'linkedin_ads': 'linkedin',
        'tiktok_ads': 'tiktok'
      };
      
      const platforms = (this.formData.selected_platforms || ['google_ads', 'meta_ads'])
        .map(p => platformMap[p] || p);
      
      const { data: { session } } = await Database.client.auth.getSession();
      const token = session?.access_token || Config?.SUPABASE_ANON_KEY;
      
      const response = await fetch(
        `${Config?.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co'}/functions/v1/generate-campaigns`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            project_id: projectId,
            onboarding_id: onboardingId,
            platforms: platforms
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`${Icons.checkCircle} AI vygenerovalo ${result.campaigns_generated} kampaní`);
        
        // Vytvor notifikáciu o dokončení generovania
        await this.createNotification({
          type: 'campaigns_generated',
          title: 'Kampane vygenerované',
          message: `AI vytvorilo ${result.campaigns_generated} kampaní. Skontrolujte a schváľte návrh.`,
          link: `/admin/index.html#projects?id=${projectId}`,
          project_id: projectId
        });
      } else {
        console.error('AI generation failed:', result.error);
        
        // Update project status na error
        await Database.client
          .from('campaign_projects')
          .update({ status: 'draft', notes: `AI error: ${result.error}` })
          .eq('id', projectId);
      }
      
    } catch (error) {
      console.error('AI generation trigger error:', error);
    }
  },
  
  /**
   * Vytvorí notifikáciu
   */
  async createNotification(data) {
    try {
      await Database.client
        .from('notifications')
        .insert({
          type: data.type || 'info',
          title: data.title,
          message: data.message,
          action_url: data.link || null,
          entity_type: data.client_id ? 'client' : (data.project_id ? 'project' : null),
          entity_id: data.project_id || data.client_id || null,
          is_read: false,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Create notification error:', error);
    }
  },
  
  async saveToDatabase(status) {
    if (this.isSaving) return;
    this.isSaving = true;
    
    // Clean data - convert empty strings to null for numeric fields
    const numericFields = ['company_founded_year', 'monthly_budget_min', 'monthly_budget_max', 
      'expected_cpa', 'expected_roas', 'previous_monthly_budget', 'average_order_value', 'customer_lifetime_value'];
    
    const cleanData = {...this.formData};
    numericFields.forEach(field => {
      if (cleanData[field] === '' || cleanData[field] === undefined) {
        cleanData[field] = null;
      }
    });
    
    const data = {
      client_id: this.clientId,
      status: status,
      ...cleanData,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    
    try {
      if (this.onboardingId) {
        await Database.update('onboarding_responses', this.onboardingId, data);
      } else {
        data.access_token = 'obr_' + Math.random().toString(36).substring(2, 15);
        const result = await Database.insert('onboarding_responses', data);
        this.onboardingId = result[0]?.id;
      }
      
      // Update client status
      await Database.update('clients', this.clientId, {
        onboarding_status: status === 'submitted' ? 'completed' : 'in_progress'
      });
      
    } catch (error) {
      console.error('Save error:', error);
      Utils.toast('Chyba pri ukladaní: ' + error.message, 'error');
    }
    
    this.isSaving = false;
  },
  
  renderThankYou() {
    return `
      <div class="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">${Icons.partyPopper}</div>
          <h1 class="text-3xl font-bold text-gray-800">Ďakujeme!</h1>
          <p class="text-gray-500 mt-4">
            Váš dotazník bol úspešne odoslaný. Na základe vašich odpovedí vám pripravíme návrh marketingovej stratégie.
          </p>
          <p class="text-gray-500 mt-2">
            Ozveme sa vám v priebehu 24-48 hodín.
          </p>
          <a href="https://adlify.eu" class="mt-6 inline-block px-6 py-3 gradient-bg text-white rounded-xl">
            Navštíviť adlify.eu
          </a>
        </div>
      </div>
    `;
  }
};

window.OnboardingModule = OnboardingModule;
