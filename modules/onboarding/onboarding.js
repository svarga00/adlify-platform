/**
 * ADLIFY PLATFORM - Onboarding Module v2.1
 * Multi-step onboarding form for clients
 * Modern design with SVG icons
 */

const OnboardingModule = {
  id: 'onboarding',
  name: 'Onboarding',
  icon: 'clipboard',
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
  isPublic: false,
  isSaving: false,
  
  // Icons
  ICONS: {
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.85M19 21V10.85"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>',
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  },
  
  // Sections definition
  SECTIONS: [
    { id: 1, title: 'Základné informácie', icon: 'building', key: 'company' },
    { id: 2, title: 'Produkty a služby', icon: 'package', key: 'products' },
    { id: 3, title: 'Cieľová skupina', icon: 'target', key: 'audience' },
    { id: 4, title: 'Aktuálny marketing', icon: 'chart', key: 'marketing' },
    { id: 5, title: 'Ciele a očakávania', icon: 'rocket', key: 'goals' },
    { id: 6, title: 'Obsah a kreatíva', icon: 'palette', key: 'creative' },
    { id: 7, title: 'Technické', icon: 'settings', key: 'technical' },
    { id: 8, title: 'Kontaktné údaje', icon: 'user', key: 'contact' },
    { id: 9, title: 'Dodatočné info', icon: 'fileText', key: 'additional' }
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

  // Helper to get icon
  icon(name, className = 'w-5 h-5') {
    return `<span class="inline-flex ${className}">${this.ICONS[name] || ''}</span>`;
  },

  init() {
    console.log('Onboarding module v2.1 initialized');
  },
  
  /**
   * Render - admin view (pre konkrétneho klienta)
   */
  async render(container, params = {}) {
    this.isPublic = false;
    this.clientId = params.client_id || params.clientId;
    
    if (!this.clientId) {
      container.innerHTML = await this.renderClientSelector();
      return;
    }
    
    container.innerHTML = `<div class="flex items-center justify-center h-64"><div class="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"></div></div>`;
    
    try {
      await this.loadOnboardingData();
      container.innerHTML = this.template();
      this.setupEventListeners();
      
      // Log activity
      this.logActivity('onboarding_opened', { step: this.currentStep });
    } catch (error) {
      console.error('Onboarding error:', error);
      Utils.showEmpty(container, error.message, 'x');
    }
  },
  
  /**
   * Render for public access (via token)
   */
  async renderPublic(container, token) {
    this.isPublic = true;
    
    container.innerHTML = `<div class="flex items-center justify-center h-64"><div class="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"></div></div>`;
    
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
      
      // Log activity (public)
      this.logActivity('onboarding_opened', { step: this.currentStep, source: 'public' });
      
    } catch (error) {
      console.error('Public onboarding error:', error);
      container.innerHTML = this.renderError(error.message);
    }
  },
  
  /**
   * Load existing onboarding data
   */
  async loadOnboardingData() {
    try {
      const existing = await Database.select('onboarding_responses', {
        filters: { client_id: this.clientId },
        single: true
      });
      
      if (existing) {
        this.onboardingId = existing.id;
        this.formData = this.parseExistingData(existing);
        this.currentStep = this.findLastCompletedStep() + 1;
        if (this.currentStep > this.totalSteps) this.currentStep = this.totalSteps;
      } else {
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
      company_name: data.company_name,
      company_website: data.company_website,
      company_industry: data.company_industry,
      company_description: data.company_description,
      company_founded_year: data.company_founded_year,
      company_size: data.company_size,
      company_location: data.company_location,
      products_services: data.products_services || [],
      unique_selling_points: data.unique_selling_points || [],
      competitive_advantages: data.competitive_advantages,
      target_audience: data.target_audience || {},
      ideal_customer_description: data.ideal_customer_description,
      customer_lifetime_value: data.customer_lifetime_value,
      average_order_value: data.average_order_value,
      current_marketing_channels: data.current_marketing_channels || [],
      previous_ad_experience: data.previous_ad_experience,
      previous_monthly_budget: data.previous_monthly_budget,
      what_worked: data.what_worked,
      what_didnt_work: data.what_didnt_work,
      primary_goals: data.primary_goals || [],
      secondary_goals: data.secondary_goals || [],
      monthly_budget_min: data.monthly_budget_min,
      monthly_budget_max: data.monthly_budget_max,
      expected_cpa: data.expected_cpa,
      expected_roas: data.expected_roas,
      timeline_urgency: data.timeline_urgency,
      has_brand_guidelines: data.has_brand_guidelines,
      brand_tone_of_voice: data.brand_tone_of_voice,
      existing_assets: data.existing_assets || {},
      preferred_ad_style: data.preferred_ad_style,
      competitors: data.competitors || [],
      has_google_analytics: data.has_google_analytics,
      has_facebook_pixel: data.has_facebook_pixel,
      has_google_ads_account: data.has_google_ads_account,
      has_meta_business: data.has_meta_business,
      google_ads_account_id: data.google_ads_account_id,
      meta_business_id: data.meta_business_id,
      website_platform: data.website_platform,
      can_add_tracking_codes: data.can_add_tracking_codes,
      contact_person: data.contact_person,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      preferred_contact_method: data.preferred_contact_method,
      best_contact_time: data.best_contact_time,
      seasonal_business: data.seasonal_business,
      peak_seasons: data.peak_seasons || [],
      special_requirements: data.special_requirements,
      questions_for_us: data.questions_for_us,
      how_did_you_find_us: data.how_did_you_find_us
    };
  },
  
  findLastCompletedStep() {
    const checks = [
      () => this.formData.company_name && this.formData.company_industry,
      () => this.formData.products_services?.length > 0,
      () => this.formData.target_audience?.b2b !== undefined || this.formData.target_audience?.b2c !== undefined,
      () => this.formData.current_marketing_channels?.length > 0,
      () => this.formData.primary_goals?.length > 0,
      () => this.formData.brand_tone_of_voice,
      () => this.formData.has_google_analytics !== undefined,
      () => this.formData.contact_email,
      () => true
    ];
    
    for (let i = 0; i < checks.length; i++) {
      if (!checks[i]()) return i;
    }
    return this.totalSteps;
  },
  
  // ==========================================
  // CLIENT SELECTOR (LIST VIEW)
  // ==========================================
  
  async renderClientSelector() {
    const clients = await Database.select('clients', {
      order: { column: 'created_at', ascending: false }
    });
    
    const { data: onboardings } = await Database.client
      .from('onboarding_responses')
      .select('client_id, status, updated_at, submitted_at, created_at');
    
    const onboardingMap = {};
    onboardings?.forEach(o => { onboardingMap[o.client_id] = o; });
    
    const stats = {
      total: clients.length,
      completed: clients.filter(c => c.onboarding_status === 'completed').length,
      inProgress: clients.filter(c => c.onboarding_status === 'in_progress').length,
      pending: clients.filter(c => !c.onboarding_status || c.onboarding_status === 'pending').length
    };
    
    return `
      <div class="max-w-5xl mx-auto">
        <!-- Stats Cards -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-xl p-4 border">
            <div class="flex items-center justify-between">
              <div class="text-2xl font-bold">${stats.total}</div>
              <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                ${this.icon('users', 'w-5 h-5')}
              </div>
            </div>
            <div class="text-sm text-gray-500 mt-1">Celkom klientov</div>
          </div>
          <div class="bg-white rounded-xl p-4 border">
            <div class="flex items-center justify-between">
              <div class="text-2xl font-bold text-green-600">${stats.completed}</div>
              <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                ${this.icon('checkCircle', 'w-5 h-5')}
              </div>
            </div>
            <div class="text-sm text-gray-500 mt-1">Dokončených</div>
          </div>
          <div class="bg-white rounded-xl p-4 border">
            <div class="flex items-center justify-between">
              <div class="text-2xl font-bold text-yellow-600">${stats.inProgress}</div>
              <div class="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-600">
                ${this.icon('edit', 'w-5 h-5')}
              </div>
            </div>
            <div class="text-sm text-gray-500 mt-1">Rozpracovaných</div>
          </div>
          <div class="bg-white rounded-xl p-4 border">
            <div class="flex items-center justify-between">
              <div class="text-2xl font-bold text-gray-400">${stats.pending}</div>
              <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                ${this.icon('clock', 'w-5 h-5')}
              </div>
            </div>
            <div class="text-sm text-gray-500 mt-1">Čaká na vyplnenie</div>
          </div>
        </div>
        
        <!-- Client List -->
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="p-4 border-b bg-gray-50 flex items-center justify-between">
            <span class="font-medium">Klienti</span>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                ${this.icon('search', 'w-4 h-4')}
              </span>
              <input type="text" placeholder="Hľadať..." 
                onkeyup="OnboardingModule.filterList(this.value)"
                class="pl-9 pr-4 py-1.5 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
            </div>
          </div>
          
          <div id="onboarding-list" class="divide-y max-h-[calc(100vh-320px)] overflow-y-auto">
            ${clients.length > 0 ? clients.map(c => this.renderClientRow(c, onboardingMap[c.id])).join('') : `
              <div class="p-8 text-center text-gray-400">
                <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  ${this.icon('users', 'w-8 h-8')}
                </div>
                <p>Žiadni klienti</p>
                <a href="#clients" class="mt-2 inline-block text-orange-600 hover:underline">Pridať klienta</a>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },
  
  renderClientRow(client, onboarding) {
    const status = client.onboarding_status || 'pending';
    const statusConfig = {
      completed: { bg: 'bg-green-100', text: 'text-green-700', icon: 'checkCircle', label: 'Dokončený' },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'edit', label: 'Rozpracovaný' },
      pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: 'clock', label: 'Čaká' },
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'mail', label: 'Odoslaný' }
    };
    const s = statusConfig[status] || statusConfig.pending;
    
    // Favicon z domény
    let faviconUrl = null;
    try {
      if (client.website) {
        const domain = new URL(client.website.startsWith('http') ? client.website : 'https://' + client.website).hostname;
        faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      }
    } catch (e) {}
    
    // Dátumy
    const createdAt = client.created_at ? new Date(client.created_at).toLocaleDateString('sk-SK') : '-';
    const updatedAt = onboarding?.updated_at ? new Date(onboarding.updated_at).toLocaleDateString('sk-SK') : null;
    
    return `
      <div class="flex items-center p-4 hover:bg-gray-50 group cursor-pointer" 
           data-client-name="${client.company_name?.toLowerCase() || ''}"
           onclick="OnboardingModule.viewOnboarding('${client.id}')">
        <!-- Logo/Favicon -->
        <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden mr-4 flex-shrink-0">
          ${faviconUrl ? 
            `<img src="${faviconUrl}" alt="" class="w-8 h-8" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
             <span class="w-full h-full items-center justify-center text-lg font-semibold text-gray-400 hidden">${client.company_name?.charAt(0)?.toUpperCase() || '?'}</span>` :
            `<span class="text-lg font-semibold text-gray-400">${client.company_name?.charAt(0)?.toUpperCase() || '?'}</span>`
          }
        </div>
        
        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${client.company_name || 'Bez názvu'}</div>
          <div class="text-sm text-gray-500 truncate">${client.email || client.website || '-'}</div>
        </div>
        
        <!-- Status -->
        <div class="mx-4 flex-shrink-0">
          <span class="px-3 py-1.5 rounded-full text-xs font-medium ${s.bg} ${s.text} inline-flex items-center gap-1.5">
            ${this.icon(s.icon, 'w-3.5 h-3.5')}
            ${s.label}
          </span>
        </div>
        
        <!-- Dates -->
        <div class="text-sm text-right flex-shrink-0 w-28 mr-2">
          <div class="text-gray-600">${createdAt}</div>
          ${updatedAt && updatedAt !== createdAt ? `<div class="text-xs text-gray-400">Upravené: ${updatedAt}</div>` : ''}
        </div>
        
        <!-- Actions -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="event.stopPropagation(); OnboardingModule.viewOnboarding('${client.id}')" 
            class="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Zobraziť/Vyplniť">
            ${this.icon('edit', 'w-4 h-4 text-gray-600')}
          </button>
          <button onclick="event.stopPropagation(); OnboardingModule.showHistory('${client.id}')" 
            class="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="História">
            ${this.icon('history', 'w-4 h-4 text-gray-600')}
          </button>
          <button onclick="event.stopPropagation(); OnboardingModule.confirmResendEmail('${client.id}')" 
            class="p-2 hover:bg-blue-100 rounded-lg transition-colors" title="Poslať email">
            ${this.icon('mail', 'w-4 h-4 text-blue-600')}
          </button>
          <button onclick="event.stopPropagation(); OnboardingModule.confirmDelete('${client.id}')" 
            class="p-2 hover:bg-red-100 rounded-lg transition-colors" title="Zmazať">
            ${this.icon('trash', 'w-4 h-4 text-red-500')}
          </button>
        </div>
      </div>
    `;
  },
  
  filterList(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#onboarding-list > div[data-client-name]').forEach(row => {
      const name = row.dataset.clientName || '';
      row.style.display = name.includes(q) ? '' : 'none';
    });
  },
  
  viewOnboarding(clientId) {
    Router.navigate('onboarding', { client_id: clientId });
  },
  
  // ==========================================
  // MODALS
  // ==========================================
  
  async showHistory(clientId) {
    const { data: logs } = await Database.client
      .from('activity_log')
      .select('*')
      .eq('entity_type', 'onboarding')
      .eq('entity_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);
    
    const client = await Database.select('clients', { filters: { id: clientId }, single: true });
    
    const actorIcons = {
      client: 'user',
      admin: 'admin',
      system: 'bot',
      anonymous: 'user'
    };
    
    const content = logs?.length > 0 ? `
      <div class="space-y-1 max-h-96 overflow-y-auto">
        ${logs.map(log => `
          <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50">
            <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              ${this.icon(actorIcons[log.actor_type] || 'user', 'w-4 h-4 text-gray-500')}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm">${this.getActionLabel(log.action)}</div>
              <div class="text-xs text-gray-500">${log.actor_name || log.actor_type}</div>
            </div>
            <div class="text-xs text-gray-400 flex-shrink-0">
              ${new Date(log.created_at).toLocaleString('sk-SK')}
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="p-8 text-center text-gray-400">
        <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
          ${this.icon('history', 'w-6 h-6')}
        </div>
        <p>Žiadna história</p>
      </div>
    `;
    
    this.showModal({
      title: `História - ${client?.company_name || 'Klient'}`,
      content: content,
      size: 'md',
      showCancel: false,
      confirmText: 'Zavrieť'
    });
  },
  
  getActionLabel(action) {
    const labels = {
      'onboarding_email_sent': 'Odoslaný onboarding email',
      'onboarding_opened': 'Otvorený onboarding formulár',
      'onboarding_step_completed': 'Dokončený krok',
      'onboarding_saved_draft': 'Uložený draft',
      'onboarding_submitted': 'Onboarding odoslaný',
      'onboarding_reminder_sent': 'Odoslaná pripomienka',
      'onboarding_deleted': 'Onboarding zmazaný'
    };
    return labels[action] || action;
  },
  
  confirmResendEmail(clientId) {
    this.showModal({
      title: 'Poslať onboarding email',
      content: `
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            ${this.icon('mail', 'w-6 h-6 text-blue-600')}
          </div>
          <div>
            <p class="text-gray-700">Naozaj chcete poslať onboarding email znova?</p>
            <p class="text-sm text-gray-500 mt-2">Klient dostane email s odkazom na vyplnenie onboarding dotazníka.</p>
          </div>
        </div>
      `,
      confirmText: 'Poslať email',
      confirmClass: 'bg-blue-600 hover:bg-blue-700',
      onConfirm: () => this.resendEmail(clientId)
    });
  },
  
  async resendEmail(clientId) {
    try {
      const client = await Database.select('clients', { filters: { id: clientId }, single: true });
      if (!client) throw new Error('Klient nenájdený');
      
      let token = client.onboarding_token;
      if (!token) {
        token = 'onb_' + Math.random().toString(36).substring(2, 15);
        await Database.update('clients', clientId, { onboarding_token: token });
      }
      
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'onboarding',
          to: client.email,
          data: {
            company_name: client.company_name,
            onboarding_url: `${window.location.origin}/onboarding/?token=${token}`
          }
        })
      });
      
      if (!response.ok) throw new Error('Email sa nepodarilo odoslať');
      
      await this.logActivity('onboarding_email_sent', { email: client.email }, clientId);
      
      Utils.toast('Email odoslaný!', 'success');
    } catch (error) {
      console.error('Resend email error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  confirmDelete(clientId) {
    this.showModal({
      title: 'Zmazať onboarding',
      content: `
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            ${this.icon('alertTriangle', 'w-6 h-6 text-red-600')}
          </div>
          <div>
            <p class="text-gray-700 font-medium">Naozaj chcete zmazať onboarding?</p>
            <p class="text-sm text-gray-500 mt-2">Všetky vyplnené údaje budú stratené. Táto akcia sa nedá vrátiť späť.</p>
          </div>
        </div>
      `,
      confirmText: 'Zmazať',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: () => this.deleteOnboarding(clientId)
    });
  },
  
  async deleteOnboarding(clientId) {
    try {
      await Database.client
        .from('onboarding_responses')
        .delete()
        .eq('client_id', clientId);
      
      await Database.update('clients', clientId, {
        onboarding_status: 'pending',
        onboarding_completed_at: null
      });
      
      await this.logActivity('onboarding_deleted', {}, clientId);
      
      Utils.toast('Onboarding zmazaný', 'success');
      Router.navigate('onboarding');
    } catch (error) {
      console.error('Delete error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  /**
   * Universal modal helper
   */
  showModal(options) {
    const {
      title = '',
      content = '',
      confirmText = 'Potvrdiť',
      cancelText = 'Zrušiť',
      confirmClass = 'gradient-bg',
      showCancel = true,
      onConfirm = null,
      onCancel = null
    } = options;
    
    // Remove existing modal
    document.getElementById('onboarding-modal')?.remove();
    
    const modal = document.createElement('div');
    modal.id = 'onboarding-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50" onclick="OnboardingModule.closeModal()"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div class="p-6">
          ${title ? `<h3 class="text-lg font-bold mb-4">${title}</h3>` : ''}
          <div>${content}</div>
        </div>
        <div class="flex gap-3 p-4 border-t bg-gray-50 rounded-b-2xl">
          ${showCancel ? `
            <button onclick="OnboardingModule.closeModal()" class="flex-1 px-4 py-2.5 bg-gray-200 rounded-xl hover:bg-gray-300 font-medium transition-colors">
              ${cancelText}
            </button>
          ` : ''}
          <button id="modal-confirm-btn" class="flex-1 px-4 py-2.5 ${confirmClass} text-white rounded-xl font-medium transition-colors">
            ${confirmText}
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add confirm handler
    document.getElementById('modal-confirm-btn').onclick = () => {
      this.closeModal();
      if (onConfirm) onConfirm();
    };
    
    // Focus trap & escape key
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        if (onCancel) onCancel();
      }
    });
  },
  
  closeModal() {
    document.getElementById('onboarding-modal')?.remove();
  },
  
  exportData() {
    Utils.toast('Export - coming soon', 'info');
  },
  
  // ==========================================
  // ACTIVITY LOG
  // ==========================================
  
  async logActivity(action, details = {}, entityId = null) {
    try {
      await Database.client.from('activity_log').insert({
        org_id: Auth.teamMember?.org_id || null,
        actor_type: this.isPublic ? 'client' : 'admin',
        actor_id: this.isPublic ? this.clientId : Auth.user?.id,
        actor_name: this.isPublic ? this.formData.contact_person : (Auth.profile?.full_name || Auth.user?.email),
        action: action,
        entity_type: 'onboarding',
        entity_id: entityId || this.clientId,
        details: details
      });
    } catch (error) {
      console.error('Log activity error:', error);
    }
  },
  
  // ==========================================
  // FORM TEMPLATES
  // ==========================================
  
  template() {
    return `
      <div class="max-w-4xl mx-auto">
        ${this.renderProgress()}
        
        <div class="card p-6">
          <form id="onboarding-form" class="space-y-6">
            ${this.renderCurrentSection()}
          </form>
          
          <div class="flex justify-between mt-8 pt-6 border-t">
            <button type="button" onclick="OnboardingModule.prevStep()" 
              class="px-6 py-3 bg-gray-200 rounded-xl hover:bg-gray-300 flex items-center gap-2 ${this.currentStep === 1 ? 'invisible' : ''}">
              ${this.icon('arrowLeft', 'w-4 h-4')}
              Späť
            </button>
            
            <div class="flex gap-3">
              <button type="button" onclick="OnboardingModule.saveDraft()" 
                class="px-6 py-3 bg-gray-100 rounded-xl hover:bg-gray-200 flex items-center gap-2">
                ${this.icon('save', 'w-4 h-4')}
                Uložiť draft
              </button>
              
              ${this.currentStep < this.totalSteps ? `
                <button type="button" onclick="OnboardingModule.nextStep()" 
                  class="px-6 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90 flex items-center gap-2">
                  Ďalej
                  ${this.icon('arrowRight', 'w-4 h-4')}
                </button>
              ` : `
                <button type="button" onclick="OnboardingModule.submitForm()" 
                  class="px-8 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90 flex items-center gap-2">
                  ${this.icon('check', 'w-4 h-4')}
                  Odoslať dotazník
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
          <div class="text-center mb-8">
            <div class="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">A</div>
            <h1 class="text-3xl font-bold text-gray-800">Onboarding dotazník</h1>
            <p class="text-gray-500 mt-2">Pomôžte nám lepšie pochopiť váš biznis</p>
          </div>
          
          ${this.renderProgress()}
          
          <div class="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <form id="onboarding-form" class="space-y-6">
              ${this.renderCurrentSection()}
            </form>
            
            <div class="flex justify-between mt-8 pt-6 border-t">
              <button type="button" onclick="OnboardingModule.prevStep()" 
                class="px-6 py-3 bg-gray-200 rounded-xl hover:bg-gray-300 flex items-center gap-2 ${this.currentStep === 1 ? 'invisible' : ''}">
                ${this.icon('arrowLeft', 'w-4 h-4')}
                Späť
              </button>
              
              <div class="flex gap-3">
                <button type="button" onclick="OnboardingModule.saveDraft()" 
                  class="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm">
                  Uložiť a pokračovať neskôr
                </button>
                
                ${this.currentStep < this.totalSteps ? `
                  <button type="button" onclick="OnboardingModule.nextStep()" 
                    class="px-6 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90 flex items-center gap-2">
                    Ďalej
                    ${this.icon('arrowRight', 'w-4 h-4')}
                  </button>
                ` : `
                  <button type="button" onclick="OnboardingModule.submitForm()" 
                    class="px-8 py-3 gradient-bg text-white rounded-xl font-semibold hover:opacity-90 flex items-center gap-2">
                    ${this.icon('check', 'w-4 h-4')}
                    Odoslať
                  </button>
                `}
              </div>
            </div>
          </div>
          
          <div class="text-center mt-8 text-sm text-gray-400">
            <p>Vaše údaje sú v bezpečí a budú použité len na prípravu vašej marketingovej stratégie.</p>
            <p class="mt-2">© ${new Date().getFullYear()} Adlify</p>
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
                  ${isCompleted ? this.icon('check', 'w-5 h-5') : this.icon(section.icon, 'w-5 h-5')}
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
        
        <div class="text-center">
          <h2 class="text-2xl font-bold text-gray-800 flex items-center justify-center gap-3">
            ${this.icon(this.SECTIONS[this.currentStep - 1].icon, 'w-6 h-6 text-orange-500')}
            ${this.SECTIONS[this.currentStep - 1].title}
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
              required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Názov vašej spoločnosti">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Webová stránka</label>
            <input type="url" name="company_website" value="${this.formData.company_website || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="https://www.example.sk">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Odvetvie *</label>
            <select name="company_industry" required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
              <option value="">Vyberte odvetvie...</option>
              ${this.INDUSTRIES.map(ind => 
                `<option value="${ind}" ${this.formData.company_industry === ind ? 'selected' : ''}>${ind}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Popis firmy *</label>
          <textarea name="company_description" rows="4" required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Stručne opíšte čím sa vaša firma zaoberá, aké produkty/služby ponúkate...">${this.formData.company_description || ''}</textarea>
          <p class="text-xs text-gray-400 mt-1">Čím detailnejšie, tým lepšie dokážeme pripraviť stratégiu</p>
        </div>
        
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Rok založenia</label>
            <input type="number" name="company_founded_year" value="${this.formData.company_founded_year || ''}" 
              min="1900" max="${new Date().getFullYear()}" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="${new Date().getFullYear() - 5}">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Veľkosť firmy *</label>
            <select name="company_size" required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
              <option value="">Vyberte...</option>
              ${this.COMPANY_SIZES.map(size => 
                `<option value="${size.value}" ${this.formData.company_size === size.value ? 'selected' : ''}>${size.label}</option>`
              ).join('')}
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Lokalita / Mesto</label>
            <input type="text" name="company_location" value="${this.formData.company_location || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Bratislava">
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
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Hlavné produkty/služby *</label>
          <p class="text-xs text-gray-500 mb-3">Pridajte vaše hlavné produkty alebo služby, ktoré chcete propagovať</p>
          
          <div id="products-list" class="space-y-3">
            ${products.length > 0 ? products.map((p, i) => this.renderProductItem(p, i)).join('') : this.renderProductItem({}, 0)}
          </div>
          
          <button type="button" onclick="OnboardingModule.addProduct()" 
            class="mt-3 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-2">
            ${this.icon('plus', 'w-4 h-4')}
            Pridať ďalší produkt/službu
          </button>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Unikátne predajné argumenty (USP) *</label>
          <p class="text-xs text-gray-500 mb-3">Čím ste lepší ako konkurencia? Prečo by mal zákazník kúpiť práve od vás?</p>
          
          <div id="usp-list" class="space-y-2">
            ${usps.length > 0 ? usps.map((usp, i) => `
              <div class="flex gap-2">
                <input type="text" name="usp_${i}" value="${usp}" class="flex-1 p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="napr. Bezplatná doprava nad 50€">
                <button type="button" onclick="OnboardingModule.removeUsp(${i})" class="p-3 hover:bg-red-100 rounded-xl text-red-500">${this.icon('x', 'w-4 h-4')}</button>
              </div>
            `).join('') : `
              <div class="flex gap-2">
                <input type="text" name="usp_0" value="" class="flex-1 p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="napr. Bezplatná doprava nad 50€">
              </div>
            `}
          </div>
          
          <button type="button" onclick="OnboardingModule.addUsp()" 
            class="mt-2 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-2">
            ${this.icon('plus', 'w-4 h-4')}
            Pridať USP
          </button>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Konkurenčné výhody</label>
          <textarea name="competitive_advantages" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Opíšte čo vás odlišuje od konkurencie - kvalita, cena, servis, tradícia...">${this.formData.competitive_advantages || ''}</textarea>
        </div>
      </div>
    `;
  },
  
  renderProductItem(product = {}, index) {
    return `
      <div class="p-4 bg-gray-50 rounded-xl space-y-3" data-product-index="${index}">
        <div class="flex justify-between items-center">
          <span class="font-medium text-sm">Produkt/Služba ${index + 1}</span>
          ${index > 0 ? `<button type="button" onclick="OnboardingModule.removeProduct(${index})" class="text-red-500 hover:text-red-700">${this.icon('x', 'w-4 h-4')}</button>` : ''}
        </div>
        <div class="grid md:grid-cols-2 gap-3">
          <input type="text" name="product_name_${index}" value="${product.name || ''}" 
            class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Názov produktu/služby">
          <input type="text" name="product_price_${index}" value="${product.price_range || ''}" 
            class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Cenové rozpätie (napr. 50-100€)">
        </div>
        <textarea name="product_desc_${index}" rows="2" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
          placeholder="Krátky popis...">${product.description || ''}</textarea>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="product_main_${index}" ${product.is_main ? 'checked' : ''} class="rounded text-orange-500 focus:ring-orange-500">
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
            <label class="flex-1 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${audience.b2c ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
              <input type="checkbox" name="audience_b2c" ${audience.b2c ? 'checked' : ''} class="mr-2" onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
              <span class="font-medium">B2C</span>
              <p class="text-sm text-gray-500 mt-1">Predávate koncovým zákazníkom</p>
            </label>
            <label class="flex-1 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${audience.b2b ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
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
                class="w-24 p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Od" min="13" max="100">
              <span>-</span>
              <input type="number" name="audience_age_to" value="${audience.demographics?.age_to || ''}" 
                class="w-24 p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Do" min="13" max="100">
              <span class="text-gray-500">rokov</span>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Pohlavie</label>
            <select name="audience_gender" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
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
                class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Slovensko, Česko">
            </div>
            <div>
              <label class="text-xs text-gray-500">Mestá / Regióny (voliteľné)</label>
              <input type="text" name="audience_regions" value="${audience.geographic?.regions?.join(', ') || ''}" 
                class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Bratislava, Košice...">
            </div>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Popis ideálneho zákazníka *</label>
          <textarea name="ideal_customer_description" rows="4" required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Opíšte vášho typického/ideálneho zákazníka - kto je, aké má záujmy, problémy, čo hľadá...">${this.formData.ideal_customer_description || ''}</textarea>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Priemerná hodnota objednávky (€)</label>
            <input type="number" name="average_order_value" value="${this.formData.average_order_value || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="50">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Životná hodnota zákazníka (€)</label>
            <input type="number" name="customer_lifetime_value" value="${this.formData.customer_lifetime_value || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="500">
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
              <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${channels.includes(ch.value) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="channel_${ch.value}" ${channels.includes(ch.value) ? 'checked' : ''} 
                  class="rounded text-orange-500 focus:ring-orange-500"
                  onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
                <span>${ch.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Predchádzajúce skúsenosti s online reklamou</label>
          <textarea name="previous_ad_experience" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Opíšte vaše doterajšie skúsenosti - robili ste reklamy sami, cez agentúru, aké výsledky ste mali...">${this.formData.previous_ad_experience || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Predchádzajúci mesačný rozpočet na reklamu (€)</label>
          <input type="number" name="previous_monthly_budget" value="${this.formData.previous_monthly_budget || ''}" 
            class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="0 ak ste reklamu nerobili">
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Čo fungovalo?</label>
            <textarea name="what_worked" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
              placeholder="Aké kampane/kanály vám prinášali najlepšie výsledky?">${this.formData.what_worked || ''}</textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Čo nefungovalo?</label>
            <textarea name="what_didnt_work" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
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
    
    return `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-3">Hlavné ciele kampane *</label>
          <p class="text-xs text-gray-500 mb-3">Vyberte 1-2 hlavné ciele, na ktoré sa chcete zamerať</p>
          <div class="grid md:grid-cols-2 gap-3">
            ${this.GOALS.map(g => `
              <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${primaryGoals.includes(g.value) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="goal_primary_${g.value}" ${primaryGoals.includes(g.value) ? 'checked' : ''} 
                  class="rounded text-orange-500 focus:ring-orange-500"
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
                required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Od (€)">
              <span>-</span>
              <input type="number" name="monthly_budget_max" value="${this.formData.monthly_budget_max || ''}" 
                required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Do (€)">
            </div>
            <p class="text-xs text-gray-400 mt-1">Len rozpočet na reklamu, bez poplatku za správu</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Časový rámec</label>
            <select name="timeline_urgency" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
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
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="€ za objednávku/lead">
            <p class="text-xs text-gray-400 mt-1">Koľko ste ochotní zaplatiť za jednu objednávku/lead?</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Očakávaná návratnosť (ROAS)</label>
            <input type="number" step="0.1" name="expected_roas" value="${this.formData.expected_roas || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="napr. 3.0">
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
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="has_brand_guidelines" value="true" ${this.formData.has_brand_guidelines === true ? 'checked' : ''} class="text-orange-500 focus:ring-orange-500">
              <span>Áno, máme</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="has_brand_guidelines" value="false" ${this.formData.has_brand_guidelines === false ? 'checked' : ''} class="text-orange-500 focus:ring-orange-500">
              <span>Nie, nemáme</span>
            </label>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Tón komunikácie značky *</label>
          <select name="brand_tone_of_voice" required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
            <option value="">Vyberte štýl komunikácie...</option>
            ${this.TONE_OPTIONS.map(t => 
              `<option value="${t.value}" ${this.formData.brand_tone_of_voice === t.value ? 'selected' : ''}>${t.label}</option>`
            ).join('')}
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-3">Existujúce materiály</label>
          <div class="grid md:grid-cols-3 gap-3">
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="assets_photos" ${assets.has_photos ? 'checked' : ''} class="rounded text-orange-500 focus:ring-orange-500">
              <span>Kvalitné fotky produktov</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="assets_videos" ${assets.has_videos ? 'checked' : ''} class="rounded text-orange-500 focus:ring-orange-500">
              <span>Videá</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="assets_logo" ${assets.has_logo ? 'checked' : ''} class="rounded text-orange-500 focus:ring-orange-500">
              <span>Logo vo vysokom rozlíšení</span>
            </label>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Preferovaný štýl reklám</label>
          <textarea name="preferred_ad_style" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Opíšte aký štýl reklám preferujete - minimalistické, farebné, s ľuďmi, produktové...">${this.formData.preferred_ad_style || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Konkurencia</label>
          <p class="text-xs text-gray-500 mb-3">Uveďte 2-3 konkurentov, ktorých reklamy sa vám páčia alebo ktorí sú pre vás inšpiráciou</p>
          
          <div id="competitors-list" class="space-y-3">
            ${competitors.length > 0 ? competitors.map((c, i) => `
              <div class="grid md:grid-cols-2 gap-3">
                <input type="text" name="competitor_name_${i}" value="${c.name || ''}" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Názov konkurenta">
                <input type="text" name="competitor_web_${i}" value="${c.website || ''}" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Web konkurenta">
              </div>
            `).join('') : `
              <div class="grid md:grid-cols-2 gap-3">
                <input type="text" name="competitor_name_0" value="" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Názov konkurenta">
                <input type="text" name="competitor_web_0" value="" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Web konkurenta">
              </div>
            `}
          </div>
          
          <button type="button" onclick="OnboardingModule.addCompetitor()" 
            class="mt-2 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-2">
            ${this.icon('plus', 'w-4 h-4')}
            Pridať konkurenta
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
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="has_google_analytics" ${this.formData.has_google_analytics ? 'checked' : ''} class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500">
              <div>
                <span class="font-medium">Google Analytics</span>
                <p class="text-sm text-gray-500">Máte nainštalovaný GA na webe?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="has_facebook_pixel" ${this.formData.has_facebook_pixel ? 'checked' : ''} class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500">
              <div>
                <span class="font-medium">Meta Pixel (Facebook)</span>
                <p class="text-sm text-gray-500">Máte nainštalovaný Facebook Pixel?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="can_add_tracking_codes" ${this.formData.can_add_tracking_codes ? 'checked' : ''} class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500">
              <div>
                <span class="font-medium">Môžem pridávať kódy na web</span>
                <p class="text-sm text-gray-500">Máte prístup k úprave webu?</p>
              </div>
            </label>
          </div>
          
          <div class="space-y-4">
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="has_google_ads_account" ${this.formData.has_google_ads_account ? 'checked' : ''} class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500">
              <div>
                <span class="font-medium">Google Ads účet</span>
                <p class="text-sm text-gray-500">Máte existujúci Google Ads účet?</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" name="has_meta_business" ${this.formData.has_meta_business ? 'checked' : ''} class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500">
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
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="XXX-XXX-XXXX (ak máte)">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Meta Business ID</label>
            <input type="text" name="meta_business_id" value="${this.formData.meta_business_id || ''}" 
              class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="(ak máte)">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Platforma webu</label>
          <select name="website_platform" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
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
              required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Meno a priezvisko">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Email *</label>
            <input type="email" name="contact_email" value="${this.formData.contact_email || ''}" 
              required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="vas@email.sk">
          </div>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Telefón *</label>
            <input type="tel" name="contact_phone" value="${this.formData.contact_phone || ''}" 
              required class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="+421 9XX XXX XXX">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Preferovaný spôsob kontaktu</label>
            <select name="preferred_contact_method" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
              <option value="email" ${this.formData.preferred_contact_method === 'email' ? 'selected' : ''}>Email</option>
              <option value="phone" ${this.formData.preferred_contact_method === 'phone' ? 'selected' : ''}>Telefón</option>
              <option value="whatsapp" ${this.formData.preferred_contact_method === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Najlepší čas na kontaktovanie</label>
          <input type="text" name="best_contact_time" value="${this.formData.best_contact_time || ''}" 
            class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="napr. Pracovné dni 9:00-17:00">
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
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="seasonal_business" value="true" ${this.formData.seasonal_business === true ? 'checked' : ''} 
                class="text-orange-500 focus:ring-orange-500"
                onchange="document.getElementById('seasons-section').classList.remove('hidden')">
              <span>Áno</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="seasonal_business" value="false" ${this.formData.seasonal_business === false ? 'checked' : ''} 
                class="text-orange-500 focus:ring-orange-500"
                onchange="document.getElementById('seasons-section').classList.add('hidden')">
              <span>Nie</span>
            </label>
          </div>
        </div>
        
        <div id="seasons-section" class="${this.formData.seasonal_business ? '' : 'hidden'}">
          <label class="block text-sm font-medium mb-2">Kedy máte sezónu? (najsilnejšie mesiace)</label>
          <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
            ${months.map((m, i) => `
              <label class="flex items-center justify-center gap-1 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 text-sm transition-colors ${peakSeasons.includes(m.toLowerCase()) ? 'ring-2 ring-orange-500 bg-orange-50' : ''}">
                <input type="checkbox" name="peak_${m.toLowerCase()}" ${peakSeasons.includes(m.toLowerCase()) ? 'checked' : ''} class="hidden"
                  onchange="this.closest('label').classList.toggle('ring-2'); this.closest('label').classList.toggle('ring-orange-500'); this.closest('label').classList.toggle('bg-orange-50')">
                <span>${m}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Špeciálne požiadavky alebo obmedzenia</label>
          <textarea name="special_requirements" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Máte nejaké špecifické požiadavky na kampane, obmedzenia, pravidlá...">${this.formData.special_requirements || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Máte na nás nejaké otázky?</label>
          <textarea name="questions_for_us" rows="3" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" 
            placeholder="Čokoľvek, čo by ste chceli vedieť...">${this.formData.questions_for_us || ''}</textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Ako ste sa o nás dozvedeli?</label>
          <select name="how_did_you_find_us" class="w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
            <option value="">Vyberte...</option>
            <option value="google" ${this.formData.how_did_you_find_us === 'google' ? 'selected' : ''}>Google vyhľadávanie</option>
            <option value="facebook" ${this.formData.how_did_you_find_us === 'facebook' ? 'selected' : ''}>Facebook/Instagram</option>
            <option value="recommendation" ${this.formData.how_did_you_find_us === 'recommendation' ? 'selected' : ''}>Odporúčanie</option>
            <option value="linkedin" ${this.formData.how_did_you_find_us === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
            <option value="other" ${this.formData.how_did_you_find_us === 'other' ? 'selected' : ''}>Iné</option>
          </select>
        </div>
        
        <div class="bg-green-50 rounded-xl p-4 border border-green-200">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
              ${this.icon('checkCircle', 'w-5 h-5')}
            </div>
            <div>
              <h4 class="font-semibold text-green-800">Ste na konci!</h4>
              <p class="text-sm text-green-700 mt-1">Ďakujeme za vyplnenie dotazníka. Po odoslaní vám pripravíme návrh marketingovej stratégie na mieru.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // HELPER TEMPLATES
  // ==========================================
  
  renderInvalidToken() {
    return `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 text-red-500">
            ${this.icon('x', 'w-8 h-8')}
          </div>
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
          <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 text-red-500">
            ${this.icon('x', 'w-8 h-8')}
          </div>
          <h1 class="text-2xl font-bold">Chyba</h1>
          <p class="text-gray-500 mt-2">${message}</p>
        </div>
      </div>
    `;
  },
  
  renderThankYou() {
    return `
      <div class="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 text-green-500">
            ${this.icon('checkCircle', 'w-10 h-10')}
          </div>
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
  },
  
  // ==========================================
  // EVENT HANDLERS & NAVIGATION
  // ==========================================
  
  setupEventListeners() {
    const form = document.getElementById('onboarding-form');
    if (form) {
      form.addEventListener('change', () => this.collectFormData());
    }
  },
  
  collectFormData() {
    const form = document.getElementById('onboarding-form');
    if (!form) return;
    
    const formData = new FormData(form);
    
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('product_') || key.startsWith('usp_') || key.startsWith('competitor_') || 
          key.startsWith('channel_') || key.startsWith('goal_') || key.startsWith('peak_') ||
          key.startsWith('assets_') || key.startsWith('audience_')) {
        continue;
      }
      this.formData[key] = value;
    }
    
    if (this.currentStep === 2) {
      this.collectProducts(formData);
      this.collectUsps(formData);
    }
    
    if (this.currentStep === 4) {
      this.collectChannels(formData);
    }
    
    if (this.currentStep === 5) {
      this.collectGoals(formData);
    }
    
    if (this.currentStep === 6) {
      this.collectAssets(formData);
      this.collectCompetitors(formData);
    }
    
    if (this.currentStep === 3) {
      this.collectAudience(formData);
    }
    
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
    
    if (!this.validateCurrentStep()) return;
    
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.rerender();
      
      // Log activity
      this.logActivity('onboarding_step_completed', { step: this.currentStep - 1 });
    }
  },
  
  validateCurrentStep() {
    const validations = {
      1: () => this.formData.company_name && this.formData.company_industry && this.formData.company_description && this.formData.company_size,
      2: () => this.formData.products_services?.length > 0,
      3: () => (this.formData.target_audience?.b2b || this.formData.target_audience?.b2c) && this.formData.ideal_customer_description,
      4: () => this.formData.current_marketing_channels?.length > 0,
      5: () => this.formData.primary_goals?.length > 0 && this.formData.monthly_budget_min && this.formData.monthly_budget_max,
      6: () => this.formData.brand_tone_of_voice,
      7: () => true,
      8: () => this.formData.contact_person && this.formData.contact_email && this.formData.contact_phone,
      9: () => true
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
        <input type="text" name="usp_${count}" value="" class="flex-1 p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Ďalší USP">
        <button type="button" onclick="this.closest('.flex').remove()" class="p-3 hover:bg-red-100 rounded-xl text-red-500">${this.icon('x', 'w-4 h-4')}</button>
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
        <input type="text" name="competitor_name_${count}" value="" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Názov konkurenta">
        <input type="text" name="competitor_web_${count}" value="" class="p-3 border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" placeholder="Web konkurenta">
      </div>
    `);
  },
  
  // ==========================================
  // SAVE & SUBMIT
  // ==========================================
  
  async saveDraft() {
    this.collectFormData();
    await this.saveToDatabase('draft');
    
    // Log activity
    this.logActivity('onboarding_saved_draft', { step: this.currentStep });
    
    Utils.toast('Draft uložený!', 'success');
  },
  
  async submitForm() {
    this.collectFormData();
    
    if (!this.validateCurrentStep()) return;
    
    await this.saveToDatabase('submitted');
    
    await Database.update('clients', this.clientId, {
      onboarding_status: 'completed',
      onboarding_completed_at: new Date().toISOString()
    });
    
    // Log activity
    this.logActivity('onboarding_submitted', {});
    
    const projectId = await this.createProjectAndGenerate();
    
    if (this.isPublic) {
      const container = document.getElementById('app');
      container.innerHTML = this.renderThankYou();
    } else {
      Utils.toast('Onboarding dokončený!', 'success');
      Router.navigate('clients', { id: this.clientId });
    }
  },
  
  async createProjectAndGenerate() {
    try {
      const client = await Database.select('clients', {
        filters: { id: this.clientId },
        single: true
      });
      
      if (!client) {
        console.error('Client not found');
        return null;
      }
      
      const adBudget = this.formData.monthly_budget_max || this.formData.monthly_budget_min || 300;
      const managementFee = this.formData.package_price || 249;
      
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
      
      await this.createNotification({
        type: 'onboarding_completed',
        title: 'Nový onboarding dokončený',
        message: `${client.company_name} dokončil onboarding. AI generuje návrh kampaní.`,
        link: `#projects?id=${project.id}`,
        project_id: project.id
      });
      
      this.triggerAIGeneration(project.id, this.onboardingId);
      
      return project.id;
      
    } catch (error) {
      console.error('Create project error:', error);
      return null;
    }
  },
  
  async triggerAIGeneration(projectId, onboardingId) {
    try {
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
        console.log(`AI generated ${result.campaigns_generated} campaigns`);
        
        await this.createNotification({
          type: 'campaigns_generated',
          title: 'Kampane vygenerované',
          message: `AI vytvorilo ${result.campaigns_generated} kampaní. Skontrolujte a schváľte návrh.`,
          link: `/admin/index.html#projects?id=${projectId}`,
          project_id: projectId
        });
      } else {
        console.error('AI generation failed:', result.error);
        
        await Database.client
          .from('campaign_projects')
          .update({ status: 'draft', notes: `AI error: ${result.error}` })
          .eq('id', projectId);
      }
      
    } catch (error) {
      console.error('AI generation trigger error:', error);
    }
  },
  
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
      
      await Database.update('clients', this.clientId, {
        onboarding_status: status === 'submitted' ? 'completed' : 'in_progress'
      });
      
    } catch (error) {
      console.error('Save error:', error);
      Utils.toast('Chyba pri ukladaní: ' + error.message, 'error');
    }
    
    this.isSaving = false;
  }
};

window.OnboardingModule = OnboardingModule;
