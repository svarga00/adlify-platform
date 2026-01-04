/**
 * ADLIFY PLATFORM - Onboarding Extension v2.5
 * 
 * - Výber balíka s podrobným modalom
 * - Výber platforiem s upgrade ponukou
 * - Technické možnosti
 */

(function() {
    'use strict';
    
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v2.5 loading...');
    
    // Uložíme pôvodné metódy
    const originalRenderCurrentSection = OnboardingModule.renderCurrentSection;
    const originalCollectFormData = OnboardingModule.collectFormData;
    const originalValidateCurrentStep = OnboardingModule.validateCurrentStep;
    
    // ==========================================
    // STAV
    // ==========================================
    
    OnboardingModule.extensionState = {
        selectedPackage: 'pro',
        selectedPlatforms: [],
        technicalInfo: {
            hasExistingAccounts: null,
            canAddTrackingCodes: null,
            websiteManager: null
        },
        componentsInitialized: false
    };
    
    // ==========================================
    // BALÍKY - PODROBNÁ DEFINÍCIA
    // ==========================================
    
    OnboardingModule.PACKAGES = {
        starter: {
            id: 'starter',
            name: 'Starter',
            tagline: 'Pre začiatok',
            price: 149,
            price6m: 134,
            price12m: 119,
            icon: '🚀',
            color: '#3B82F6',
            description: 'Ideálne pre živnostníkov, ktorí chcú vyskúšať online reklamu',
            limits: {
                platforms: 1,
                campaigns: 1,
                visuals: 2
            },
            features: [
                { name: '1 reklamná platforma', included: true },
                { name: '1 aktívna kampaň', included: true },
                { name: '2 reklamné vizuály', included: true },
                { name: 'Reklamné texty (copy)', included: true },
                { name: 'Základná optimalizácia', included: true },
                { name: 'Mesačný report', included: true },
                { name: 'Email podpora', included: true },
                { name: 'A/B testovanie', included: false },
                { name: 'Remarketing', included: false },
                { name: 'Dedikovaný manager', included: false }
            ],
            support: 'Email',
            optimization: 'Mesačne',
            reporting: 'Mesačný report'
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            tagline: 'Najobľúbenejšie',
            popular: true,
            price: 249,
            price6m: 224,
            price12m: 199,
            icon: '⭐',
            color: '#F97316',
            colorGradient: 'linear-gradient(135deg, #F97316, #EC4899)',
            description: 'Pre firmy, ktoré chcú rásť na viacerých platformách',
            limits: {
                platforms: 2,
                campaigns: 3,
                visuals: 4
            },
            features: [
                { name: '2 reklamné platformy', included: true },
                { name: 'Až 3 aktívne kampane', included: true },
                { name: '4 reklamné vizuály', included: true },
                { name: 'Reklamné texty (copy)', included: true },
                { name: 'A/B testovanie', included: true },
                { name: 'Optimalizácia každé 2 týždne', included: true },
                { name: 'Detailný report', included: true },
                { name: 'Email + telefón podpora', included: true },
                { name: 'Remarketing', included: false },
                { name: 'Dedikovaný manager', included: false }
            ],
            support: 'Email + Telefón',
            optimization: 'Každé 2 týždne',
            reporting: 'Detailný report'
        },
        enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            tagline: 'Pre firmy',
            price: 399,
            price6m: 359,
            price12m: 319,
            icon: '💎',
            color: '#8B5CF6',
            description: 'Pre e-shopy a firmy s vyšším rozpočtom na reklamu',
            limits: {
                platforms: Infinity,
                campaigns: 5,
                visuals: 8
            },
            features: [
                { name: 'Všetky reklamné platformy', included: true },
                { name: 'Až 5 aktívnych kampaní', included: true },
                { name: '8 reklamných vizuálov', included: true },
                { name: 'Pokročilé A/B testovanie', included: true },
                { name: 'Remarketing kampane', included: true },
                { name: 'Týždenná optimalizácia', included: true },
                { name: 'Strategické konzultácie', included: true },
                { name: 'Prioritná podpora + WhatsApp', included: true },
                { name: 'Dedikovaný manager', included: false },
                { name: '24/7 VIP podpora', included: false }
            ],
            support: 'Prioritná + WhatsApp',
            optimization: 'Týždenne',
            reporting: 'Týždenný report + konzultácie'
        },
        premium: {
            id: 'premium',
            name: 'Premium',
            tagline: 'VIP',
            priceFrom: true,
            price: 799,
            price6m: 719,
            price12m: 639,
            icon: '👑',
            color: '#F59E0B',
            colorGradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
            description: 'Individuálna cena podľa rozsahu a potrieb vášho projektu',
            limits: {
                platforms: Infinity,
                campaigns: Infinity,
                visuals: Infinity
            },
            features: [
                { name: 'Všetky reklamné platformy', included: true },
                { name: 'Neobmedzený počet kampaní', included: true },
                { name: 'Neobmedzené vizuály', included: true },
                { name: 'Pokročilé A/B testovanie', included: true },
                { name: 'Remarketing kampane', included: true },
                { name: 'Denná optimalizácia', included: true },
                { name: 'Mesačné strategické stretnutia', included: true },
                { name: 'Dedikovaný account manager', included: true },
                { name: '24/7 VIP podpora', included: true },
                { name: 'Custom reporty a dashboardy', included: true }
            ],
            support: '24/7 VIP',
            optimization: 'Denne',
            reporting: 'Custom dashboardy'
        }
    };
    
    // ==========================================
    // SVG LOGÁ
    // ==========================================
    
    OnboardingModule.PLATFORM_LOGOS = {
        google_ads: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>`,
        
        meta_ads: `<svg viewBox="0 0 36 36" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="meta-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0081FB"/><stop offset="100%" stop-color="#0064E0"/></linearGradient></defs>
            <circle cx="18" cy="18" r="18" fill="url(#meta-grad)"/>
            <path d="M25.2 14.5c0-1.4-.5-2.5-1.3-3.3-.8-.8-1.9-1.2-3.2-1.2-1.1 0-2.1.3-2.9.9-.5.4-.9.8-1.2 1.3-.3-.5-.7-.9-1.2-1.3-.8-.6-1.8-.9-2.9-.9-1.3 0-2.4.4-3.2 1.2-.8.8-1.3 1.9-1.3 3.3 0 .7.1 1.4.4 2.1.5 1.4 1.5 2.8 2.8 4.2 1.8 1.9 4.1 3.7 5.4 4.7.2.1.4.1.6 0 1.3-1 3.6-2.8 5.4-4.7 1.3-1.4 2.3-2.8 2.8-4.2.3-.7.4-1.4.4-2.1z" fill="#fff"/>
        </svg>`,
        
        linkedin_ads: `<svg viewBox="0 0 36 36" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="4" fill="#0A66C2"/>
            <path d="M12.15 27.1H8.08V15.2h4.07v11.9zM10.12 13.5c-1.3 0-2.36-1.06-2.36-2.36 0-1.3 1.06-2.36 2.36-2.36 1.3 0 2.36 1.06 2.36 2.36 0 1.3-1.06 2.36-2.36 2.36zm17.12 13.6h-4.06v-5.79c0-1.38-.03-3.16-1.93-3.16-1.93 0-2.22 1.5-2.22 3.06v5.89h-4.06V15.2h3.9v1.62h.05c.54-1.03 1.87-2.12 3.85-2.12 4.12 0 4.88 2.71 4.88 6.24v6.16h-.41z" fill="#fff"/>
        </svg>`,
        
        tiktok_ads: `<svg viewBox="0 0 36 36" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="4" fill="#000"/>
            <path d="M26.4 15.1c-1.7 0-3.3-.6-4.5-1.6v7.3c0 3.6-2.9 6.5-6.5 6.5s-6.5-2.9-6.5-6.5 2.9-6.5 6.5-6.5c.3 0 .7 0 1 .1v3.3c-.3-.1-.6-.1-1-.1-1.8 0-3.2 1.4-3.2 3.2s1.4 3.2 3.2 3.2 3.2-1.4 3.2-3.2V8h3.3c0 .3.1.6.1.9.3 1.5 1.2 2.8 2.5 3.5.8.5 1.7.7 2.6.7v2h-.7z" fill="#fff"/>
            <path d="M26.4 15.1v-2c-.9 0-1.8-.3-2.6-.7-1.3-.8-2.2-2-2.5-3.5 0-.3-.1-.6-.1-.9h-3.3v14.8c0 1.8-1.4 3.2-3.2 3.2-1 0-1.8-.4-2.4-1.1-.9-.9-1.2-2.3-.6-3.5.5-1.2 1.7-1.9 3-1.9.3 0 .7 0 1 .1v-3.3c-.3 0-.7-.1-1-.1-3.6 0-6.5 2.9-6.5 6.5s2.9 6.5 6.5 6.5 6.5-2.9 6.5-6.5v-7.3c1.2 1 2.8 1.6 4.5 1.6h.7z" fill="#25F4EE"/>
            <path d="M14.7 20.5c-1.3 0-2.5.8-3 1.9-.5 1.2-.3 2.6.6 3.5.6.7 1.5 1.1 2.4 1.1 1.8 0 3.2-1.4 3.2-3.2v-2.4c-.8-.6-1.4-1.5-1.6-2.5-.5.3-1 .4-1.6.4v3.2z" fill="#FE2C55"/>
        </svg>`
    };
    
    // ==========================================
    // PLATFORMY
    // ==========================================
    
    OnboardingModule.PLATFORMS = {
        google_ads: {
            id: 'google_ads',
            name: 'Google Ads',
            color: '#4285F4',
            shortDesc: 'Search, Display, YouTube, Shopping',
            description: 'Najväčšia reklamná sieť na svete. Oslovte zákazníkov presne vtedy, keď hľadajú vaše produkty alebo služby.',
            features: [
                { name: 'Search', desc: 'Textové reklamy vo výsledkoch vyhľadávania' },
                { name: 'Display', desc: 'Bannerové reklamy na partnerských weboch' },
                { name: 'YouTube', desc: 'Video reklamy pred a počas videí' },
                { name: 'Shopping', desc: 'Produktové reklamy s obrázkom a cenou' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'B2B'],
            recommended: ['local_business', 'ecommerce', 'b2b']
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            subtitle: 'Facebook + Instagram',
            color: '#0081FB',
            shortDesc: 'Facebook, Instagram - Feed, Stories, Reels',
            description: 'Facebook a Instagram reklamy s najpresnejším cielením podľa záujmov a správania. Ideálne pre budovanie značky.',
            features: [
                { name: 'Facebook Feed', desc: 'Reklamy v hlavnom feede Facebooku' },
                { name: 'Instagram Feed', desc: 'Reklamy vo feede Instagramu' },
                { name: 'Stories', desc: 'Fullscreen formát pre FB aj IG Stories' },
                { name: 'Reels', desc: 'Krátke video reklamy v populárnom formáte' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'Gastro', 'Beauty'],
            recommended: ['local_business', 'ecommerce', 'startup']
        },
        linkedin_ads: {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            color: '#0A66C2',
            shortDesc: 'B2B reklamy pre profesionálov',
            description: 'Najlepšia platforma pre B2B marketing. Cieľte podľa pracovnej pozície, odvetvia alebo konkrétnych firiem.',
            features: [
                { name: 'Sponsored Content', desc: 'Natívne príspevky vo feede' },
                { name: 'InMail', desc: 'Priame správy do LinkedIn schránky' },
                { name: 'Lead Gen Forms', desc: 'Predvyplnené formuláre' },
                { name: 'Text Ads', desc: 'Textové reklamy v sidebar' }
            ],
            bestFor: ['B2B služby', 'IT firmy', 'SaaS', 'Recruiting'],
            recommended: ['b2b']
        },
        tiktok_ads: {
            id: 'tiktok_ads',
            name: 'TikTok Ads',
            color: '#000000',
            shortDesc: 'Video reklamy pre mladšiu cieľovku',
            description: 'Najrýchlejšie rastúca sociálna sieť. Ak je vaša cieľovka do 35 rokov, TikTok ponúka najvyšší engagement.',
            features: [
                { name: 'In-Feed', desc: 'Video reklamy v hlavnom feede' },
                { name: 'TopView', desc: 'Premium umiestnenie pri otvorení' },
                { name: 'Spark Ads', desc: 'Propagácia organického obsahu' },
                { name: 'Branded Effects', desc: 'Vlastné filtre a efekty' }
            ],
            bestFor: ['Móda', 'Kozmetika', 'F&B', 'Entertainment'],
            recommended: ['ecommerce', 'startup']
        }
    };
    
    // ==========================================
    // ODPORÚČANIA
    // ==========================================
    
    OnboardingModule.PLATFORM_RECOMMENDATIONS = {
        local_business: { platforms: ['google_ads', 'meta_ads'], message: 'Pre lokálne služby odporúčame Google Ads + Meta Ads' },
        ecommerce: { platforms: ['google_ads', 'meta_ads'], message: 'Pre e-shop odporúčame Google Ads + Meta Ads' },
        b2b: { platforms: ['google_ads', 'linkedin_ads'], message: 'Pre B2B odporúčame Google Ads + LinkedIn Ads' },
        startup: { platforms: ['meta_ads', 'tiktok_ads'], message: 'Pre startup odporúčame Meta Ads + TikTok Ads' }
    };
    
    // ==========================================
    // SEKCIE
    // ==========================================
    
    OnboardingModule.EXTENDED_SECTIONS = [
        { id: 1, title: 'Základné informácie', icon: '🏢', key: 'company' },
        { id: 2, title: 'Produkty a služby', icon: '📦', key: 'products' },
        { id: 3, title: 'Cieľová skupina', icon: '🎯', key: 'audience' },
        { id: 4, title: 'Výber balíka', icon: '💎', key: 'package', isNew: true },
        { id: 5, title: 'Reklamné platformy', icon: '📱', key: 'platforms', isNew: true },
        { id: 6, title: 'Aktuálny marketing', icon: '📊', key: 'marketing' },
        { id: 7, title: 'Ciele a očakávania', icon: '🚀', key: 'goals' },
        { id: 8, title: 'Obsah a kreatíva', icon: '🎨', key: 'creative' },
        { id: 9, title: 'Technické možnosti', icon: '⚙️', key: 'technical_simple', isNew: true },
        { id: 10, title: 'Kontaktné údaje', icon: '👤', key: 'contact' },
        { id: 11, title: 'Dodatočné info', icon: '📝', key: 'additional' }
    ];
    
    OnboardingModule.SECTIONS = OnboardingModule.EXTENDED_SECTIONS;
    OnboardingModule.totalSteps = OnboardingModule.EXTENDED_SECTIONS.length;
    
    // ==========================================
    // OVERRIDE RENDER
    // ==========================================
    
    OnboardingModule.renderCurrentSection = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        if (section?.isNew) {
            switch (section.key) {
                case 'package': return this.renderPackageSection();
                case 'platforms': return this.renderPlatformsSection();
                case 'technical_simple': return this.renderTechnicalSimpleSection();
            }
        }
        
        const originalStepMapping = { 1: 1, 2: 2, 3: 3, 6: 4, 7: 5, 8: 6, 10: 8, 11: 9 };
        const originalStep = originalStepMapping[this.currentStep];
        if (originalStep) {
            const currentBackup = this.currentStep;
            this.currentStep = originalStep;
            const result = originalRenderCurrentSection.call(this);
            this.currentStep = currentBackup;
            return result;
        }
        
        return '<div class="text-center py-8 text-gray-500">Sekcia sa načítava...</div>';
    };
    
    // ==========================================
    // SEKCIA: BALÍKY
    // ==========================================
    
    OnboardingModule.renderPackageSection = function() {
        const selected = this.extensionState.selectedPackage || 'pro';
        
        return `
            <div class="package-section">
                <div class="mb-5">
                    <p class="text-gray-600 text-sm">
                        Vyberte balík služieb podľa vašich potrieb. Kliknutím na balík zobrazíte detaily.
                    </p>
                </div>
                
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    ${Object.values(this.PACKAGES).map(pkg => this.renderPackageCard(pkg, selected)).join('')}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPackageCard = function(pkg, selected) {
        const isSelected = selected === pkg.id;
        
        return `
            <div class="relative p-4 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-lg
                ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                ${pkg.popular ? 'bg-gray-900 text-white border-gray-900' : ''}"
                onclick="OnboardingModule.selectPackage('${pkg.id}')">
                
                ${pkg.popular ? '<div class="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full whitespace-nowrap">Najobľúbenejšie</div>' : ''}
                
                <div class="text-center mb-3">
                    <span class="text-2xl">${pkg.icon}</span>
                    <h3 class="text-base font-bold mt-1" style="color: ${pkg.popular ? '#F97316' : pkg.color}">${pkg.name}</h3>
                    <p class="text-xl font-bold mt-1 ${pkg.popular ? 'text-white' : 'text-gray-800'}">
                        ${pkg.priceFrom ? 'od ' : ''}${pkg.price}€<span class="text-xs font-normal ${pkg.popular ? 'text-gray-400' : 'text-gray-500'}">/mes</span>
                    </p>
                    <p class="text-xs ${pkg.popular ? 'text-gray-400' : 'text-gray-500'} mt-1">
                        ${pkg.limits.platforms === Infinity ? 'Všetky platformy' : pkg.limits.platforms + ' platforma'}
                    </p>
                </div>
                
                <div class="flex items-center justify-between">
                    <button type="button" 
                        onclick="event.stopPropagation(); OnboardingModule.showPackageModal('${pkg.id}')"
                        class="text-xs ${pkg.popular ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-700'} underline">
                        Zobraziť detaily
                    </button>
                    
                    <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${isSelected ? 'bg-orange-500 border-orange-500' : (pkg.popular ? 'border-gray-500' : 'border-gray-300')}">
                        ${isSelected ? '<span class="text-white text-xs">✓</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    };
    
    OnboardingModule.selectPackage = function(packageId) {
        this.extensionState.selectedPackage = packageId;
        this.formData.selected_package = packageId;
        
        // Reset platformy ak prekračujú nový limit
        const newLimit = this.PACKAGES[packageId]?.limits.platforms || 1;
        if (this.extensionState.selectedPlatforms.length > newLimit && newLimit !== Infinity) {
            this.extensionState.selectedPlatforms = this.extensionState.selectedPlatforms.slice(0, newLimit);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
        }
        
        this.rerender();
    };
    
    // ==========================================
    // MODAL: DETAIL BALÍKA
    // ==========================================
    
    OnboardingModule.showPackageModal = function(packageId) {
        const pkg = this.PACKAGES[packageId];
        if (!pkg) return;
        
        const isSelected = this.extensionState.selectedPackage === packageId;
        const bgColor = pkg.colorGradient || pkg.color;
        
        const modalHtml = `
            <div class="adlify-modal-overlay" id="packageModal" onclick="OnboardingModule.closePackageModal(event)">
                <div class="adlify-modal adlify-modal--lg" onclick="event.stopPropagation()">
                    <!-- Header -->
                    <div class="adlify-modal__header" style="background: ${bgColor}">
                        <button class="adlify-modal__close" onclick="OnboardingModule.closePackageModal()">✕</button>
                        <div class="text-center py-4">
                            <span class="text-5xl mb-2 block">${pkg.icon}</span>
                            <h2 class="text-2xl font-bold text-white">${pkg.name}</h2>
                            <p class="text-white/80 text-sm mt-1">${pkg.tagline}</p>
                            <div class="mt-4">
                                <span class="text-4xl font-bold text-white">${pkg.priceFrom ? 'od ' : ''}${pkg.price}€</span>
                                <span class="text-white/70">/mesačne</span>
                            </div>
                            ${pkg.price6m ? `
                                <p class="text-white/60 text-sm mt-2">
                                    6 mes: ${pkg.price6m}€/mes (${pkg.price6m * 6}€) | 12 mes: ${pkg.price12m}€/mes (${pkg.price12m * 12}€)
                                </p>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Body -->
                    <div class="adlify-modal__body">
                        <p class="text-gray-600 mb-6">${pkg.description}</p>
                        
                        <!-- Limity -->
                        <div class="grid grid-cols-3 gap-3 mb-6">
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${pkg.limits.platforms === Infinity ? '∞' : pkg.limits.platforms}</p>
                                <p class="text-xs text-gray-500">Platformy</p>
                            </div>
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${pkg.limits.campaigns === Infinity ? '∞' : pkg.limits.campaigns}</p>
                                <p class="text-xs text-gray-500">Kampane</p>
                            </div>
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${pkg.limits.visuals === Infinity ? '∞' : pkg.limits.visuals}</p>
                                <p class="text-xs text-gray-500">Vizuály</p>
                            </div>
                        </div>
                        
                        <!-- Features -->
                        <h4 class="font-semibold text-gray-800 mb-3">Čo je zahrnuté</h4>
                        <div class="space-y-2 mb-6">
                            ${pkg.features.map(f => `
                                <div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                                    <span class="${f.included ? 'text-green-500' : 'text-gray-300'}">${f.included ? '✓' : '✕'}</span>
                                    <span class="${f.included ? 'text-gray-700' : 'text-gray-400'}">${f.name}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <!-- Podpora info -->
                        <div class="grid grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl">
                            <div>
                                <p class="text-xs text-gray-500">Podpora</p>
                                <p class="text-sm font-medium text-gray-800">${pkg.support}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-500">Optimalizácia</p>
                                <p class="text-sm font-medium text-gray-800">${pkg.optimization}</p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-500">Reporting</p>
                                <p class="text-sm font-medium text-gray-800">${pkg.reporting}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div class="adlify-modal__footer">
                        <button class="adlify-btn ${isSelected ? 'adlify-btn--success' : 'adlify-btn--primary'} w-full"
                            onclick="OnboardingModule.selectPackage('${pkg.id}'); OnboardingModule.closePackageModal()">
                            ${isSelected ? '✓ Vybraný balík' : 'Vybrať tento balík'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            document.getElementById('packageModal')?.classList.add('adlify-modal-overlay--visible');
        });
    };
    
    OnboardingModule.closePackageModal = function(event) {
        if (event && event.target !== event.currentTarget) return;
        const modal = document.getElementById('packageModal');
        if (modal) {
            modal.classList.remove('adlify-modal-overlay--visible');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 200);
        }
    };
    
    // ==========================================
    // SEKCIA: PLATFORMY
    // ==========================================
    
    OnboardingModule.renderPlatformsSection = function() {
        const selectedPkg = this.extensionState.selectedPackage || 'pro';
        const pkg = this.PACKAGES[selectedPkg];
        const platformLimit = pkg?.limits.platforms || 1;
        const platformLimitText = platformLimit === Infinity ? 'neobmedzený počet' : platformLimit;
        const clientType = this.detectClientType();
        const recommendation = this.PLATFORM_RECOMMENDATIONS[clientType] || this.PLATFORM_RECOMMENDATIONS.local_business;
        const selected = this.extensionState.selectedPlatforms || [];
        
        return `
            <div class="platforms-section">
                <!-- Info -->
                <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p class="text-blue-800 text-sm flex items-center gap-2">
                        <span>💡</span>
                        <span>Váš balík <strong>${pkg?.name || selectedPkg}</strong> 
                        umožňuje <strong>${platformLimitText}</strong> 
                        ${platformLimit === 1 ? 'platformu' : 'platforiem'}.</span>
                    </p>
                </div>
                
                <!-- Odporúčanie -->
                <div class="mb-5 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <p class="text-green-800 text-sm flex items-center gap-2">
                            <span>🎯</span>
                            <span>${recommendation.message}</span>
                        </p>
                        <button type="button" onclick="OnboardingModule.applyRecommendation()"
                            class="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">
                            Použiť
                        </button>
                    </div>
                </div>
                
                <!-- Grid -->
                <div class="grid grid-cols-2 gap-3 mb-5">
                    ${Object.values(this.PLATFORMS).map(platform => this.renderPlatformCard(platform, selected, platformLimit)).join('')}
                </div>
                
                <!-- Vybrané -->
                ${this.renderSelectedPlatforms(selected, platformLimit)}
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformCard = function(platform, selected, limit) {
        const isSelected = selected.includes(platform.id);
        const isAtLimit = selected.length >= limit && limit !== Infinity;
        
        return `
            <div class="platform-card relative border-2 rounded-xl transition-all overflow-hidden
                ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                cursor-pointer"
                onclick="OnboardingModule.handlePlatformClick('${platform.id}', ${isSelected}, ${isAtLimit})">
                
                <div class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="flex-shrink-0">
                            <div class="w-5 h-5 rounded border-2 flex items-center justify-center
                                ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}">
                                ${isSelected ? '<span class="text-white text-xs font-bold">✓</span>' : ''}
                            </div>
                        </div>
                        <div class="w-10 h-10 flex-shrink-0">${this.PLATFORM_LOGOS[platform.id]}</div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm">${platform.name}</h4>
                            ${platform.subtitle ? `<p class="text-xs text-blue-600">${platform.subtitle}</p>` : ''}
                            <p class="text-xs text-gray-500 truncate">${platform.shortDesc}</p>
                        </div>
                        <button type="button" 
                            onclick="event.stopPropagation(); OnboardingModule.showPlatformModal('${platform.id}')"
                            class="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                            </svg>
                        </button>
                    </div>
                </div>
                ${isSelected ? '<div class="h-1 bg-gradient-to-r from-orange-500 to-pink-500"></div>' : ''}
            </div>
        `;
    };
    
    OnboardingModule.renderSelectedPlatforms = function(selected, limit) {
        if (selected.length === 0) {
            return `<div class="p-4 bg-gray-50 rounded-xl border text-center">
                <p class="text-sm text-gray-500">Zatiaľ nemáte vybrané žiadne platformy</p>
            </div>`;
        }
        
        return `
            <div class="p-4 bg-gray-50 rounded-xl border">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-medium text-gray-600">Vybrané platformy</span>
                    <span class="text-sm font-bold ${selected.length > limit && limit !== Infinity ? 'text-red-600' : 'text-gray-800'}">
                        ${selected.length}/${limit === Infinity ? '∞' : limit}
                    </span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${selected.map(id => {
                        const p = this.PLATFORMS[id];
                        return p ? `
                            <div class="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-orange-200 shadow-sm">
                                <div class="w-5 h-5">${this.PLATFORM_LOGOS[id]}</div>
                                <span class="text-sm font-medium text-gray-800">${p.name}</span>
                                <button type="button" onclick="event.stopPropagation(); OnboardingModule.removePlatform('${id}')" 
                                    class="ml-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">✕</button>
                            </div>
                        ` : '';
                    }).join('')}
                </div>
            </div>
        `;
    };
    
    // ==========================================
    // LOGIKA PLATFORIEM + UPGRADE MODAL
    // ==========================================
    
    OnboardingModule.handlePlatformClick = function(platformId, isSelected, isAtLimit) {
        if (isSelected) {
            // Odstrániť
            this.removePlatform(platformId);
        } else if (isAtLimit) {
            // Ukázať upgrade modal
            this.showUpgradeModal(platformId);
        } else {
            // Pridať
            this.addPlatform(platformId);
        }
    };
    
    OnboardingModule.addPlatform = function(platformId) {
        if (!this.extensionState.selectedPlatforms.includes(platformId)) {
            this.extensionState.selectedPlatforms.push(platformId);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
            this.rerender();
        }
    };
    
    OnboardingModule.removePlatform = function(platformId) {
        const index = this.extensionState.selectedPlatforms.indexOf(platformId);
        if (index > -1) {
            this.extensionState.selectedPlatforms.splice(index, 1);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
            this.rerender();
        }
    };
    
    OnboardingModule.applyRecommendation = function() {
        const clientType = this.detectClientType();
        const recommendation = this.PLATFORM_RECOMMENDATIONS[clientType] || this.PLATFORM_RECOMMENDATIONS.local_business;
        const limit = this.PACKAGES[this.extensionState.selectedPackage]?.limits.platforms || 1;
        
        let platforms = [...recommendation.platforms];
        if (limit !== Infinity && platforms.length > limit) {
            platforms = platforms.slice(0, limit);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
        this.rerender();
        
        Utils?.toast?.('Odporúčanie bolo aplikované', 'success');
    };
    
    // ==========================================
    // MODAL: UPGRADE BALÍKA
    // ==========================================
    
    OnboardingModule.showUpgradeModal = function(wantedPlatformId) {
        const currentPkg = this.PACKAGES[this.extensionState.selectedPackage];
        const wantedPlatform = this.PLATFORMS[wantedPlatformId];
        const currentLimit = currentPkg?.limits.platforms || 1;
        
        // Nájdi vyšší balík
        const packageOrder = ['starter', 'pro', 'enterprise', 'premium'];
        const currentIndex = packageOrder.indexOf(this.extensionState.selectedPackage);
        const nextPackages = packageOrder.slice(currentIndex + 1).map(id => this.PACKAGES[id]);
        
        const modalHtml = `
            <div class="adlify-modal-overlay" id="upgradeModal" onclick="OnboardingModule.closeUpgradeModal(event)">
                <div class="adlify-modal" onclick="event.stopPropagation()">
                    <div class="adlify-modal__header" style="background: linear-gradient(135deg, #F97316, #EC4899)">
                        <button class="adlify-modal__close" onclick="OnboardingModule.closeUpgradeModal()">✕</button>
                        <div class="text-center py-4">
                            <span class="text-4xl mb-2 block">🚀</span>
                            <h2 class="text-xl font-bold text-white">Navýšte si balík</h2>
                        </div>
                    </div>
                    
                    <div class="adlify-modal__body">
                        <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                            <p class="text-amber-800 text-sm">
                                Váš aktuálny balík <strong>${currentPkg?.name}</strong> umožňuje iba 
                                <strong>${currentLimit} ${currentLimit === 1 ? 'platformu' : 'platformy'}</strong>.
                            </p>
                            ${wantedPlatform ? `
                                <p class="text-amber-700 text-sm mt-2">
                                    Pre pridanie <strong>${wantedPlatform.name}</strong> potrebujete vyšší balík.
                                </p>
                            ` : ''}
                        </div>
                        
                        <h4 class="font-semibold text-gray-800 mb-3">Vyberte si vyšší balík:</h4>
                        
                        <div class="space-y-3">
                            ${nextPackages.map(pkg => `
                                <div class="p-4 border-2 rounded-xl cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-all"
                                    onclick="OnboardingModule.upgradeToPackage('${pkg.id}', '${wantedPlatformId}')">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <span class="text-2xl">${pkg.icon}</span>
                                            <div>
                                                <h5 class="font-bold text-gray-800">${pkg.name}</h5>
                                                <p class="text-sm text-gray-500">
                                                    ${pkg.limits.platforms === Infinity ? 'Všetky platformy' : pkg.limits.platforms + ' platformy'}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <p class="font-bold text-lg text-gray-800">${pkg.priceFrom ? 'od ' : ''}${pkg.price}€</p>
                                            <p class="text-xs text-gray-500">/mesačne</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="adlify-modal__footer">
                        <button class="adlify-btn adlify-btn--secondary w-full" onclick="OnboardingModule.closeUpgradeModal()">
                            Zostať na ${currentPkg?.name}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            document.getElementById('upgradeModal')?.classList.add('adlify-modal-overlay--visible');
        });
    };
    
    OnboardingModule.upgradeToPackage = function(packageId, platformId) {
        this.selectPackage(packageId);
        if (platformId) {
            this.addPlatform(platformId);
        }
        this.closeUpgradeModal();
        Utils?.toast?.(`Balík zmenený na ${this.PACKAGES[packageId]?.name}`, 'success');
    };
    
    OnboardingModule.closeUpgradeModal = function(event) {
        if (event && event.target !== event.currentTarget) return;
        const modal = document.getElementById('upgradeModal');
        if (modal) {
            modal.classList.remove('adlify-modal-overlay--visible');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 200);
        }
    };
    
    // ==========================================
    // MODAL: DETAIL PLATFORMY
    // ==========================================
    
    OnboardingModule.showPlatformModal = function(platformId) {
        const platform = this.PLATFORMS[platformId];
        if (!platform) return;
        
        const isSelected = this.extensionState.selectedPlatforms.includes(platformId);
        const limit = this.PACKAGES[this.extensionState.selectedPackage]?.limits.platforms || 1;
        const canSelect = isSelected || this.extensionState.selectedPlatforms.length < limit || limit === Infinity;
        
        const modalHtml = `
            <div class="adlify-modal-overlay" id="platformModal" onclick="OnboardingModule.closePlatformModal(event)">
                <div class="adlify-modal" onclick="event.stopPropagation()">
                    <div class="adlify-modal__header" style="background: ${platform.color}">
                        <button class="adlify-modal__close" onclick="OnboardingModule.closePlatformModal()">✕</button>
                        <div class="adlify-modal__logo">${this.PLATFORM_LOGOS[platformId]}</div>
                        <h2 class="adlify-modal__title">${platform.name}</h2>
                        ${platform.subtitle ? `<p class="text-white/80 text-sm">${platform.subtitle}</p>` : ''}
                        <p class="adlify-modal__subtitle">${platform.shortDesc}</p>
                    </div>
                    
                    <div class="adlify-modal__body">
                        <p class="text-gray-600 mb-5">${platform.description}</p>
                        
                        <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Typy reklám</h4>
                        <div class="grid grid-cols-2 gap-2 mb-5">
                            ${platform.features.map(f => `
                                <div class="p-3 bg-gray-50 rounded-lg">
                                    <p class="font-semibold text-sm text-gray-800">${f.name}</p>
                                    <p class="text-xs text-gray-500">${f.desc}</p>
                                </div>
                            `).join('')}
                        </div>
                        
                        <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ideálne pre</h4>
                        <div class="flex flex-wrap gap-2">
                            ${platform.bestFor.map(b => `<span class="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700">${b}</span>`).join('')}
                        </div>
                    </div>
                    
                    <div class="adlify-modal__footer">
                        ${canSelect ? `
                            <button class="adlify-btn ${isSelected ? 'adlify-btn--success' : 'adlify-btn--primary'} w-full"
                                onclick="OnboardingModule.handlePlatformClick('${platformId}', ${isSelected}, false); OnboardingModule.closePlatformModal()">
                                ${isSelected ? '✓ Vybraná platforma' : 'Vybrať túto platformu'}
                            </button>
                        ` : `
                            <button class="adlify-btn adlify-btn--primary w-full"
                                onclick="OnboardingModule.closePlatformModal(); OnboardingModule.showUpgradeModal('${platformId}')">
                                Navýšiť balík a vybrať
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            document.getElementById('platformModal')?.classList.add('adlify-modal-overlay--visible');
        });
    };
    
    OnboardingModule.closePlatformModal = function(event) {
        if (event && event.target !== event.currentTarget) return;
        const modal = document.getElementById('platformModal');
        if (modal) {
            modal.classList.remove('adlify-modal-overlay--visible');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 200);
        }
    };
    
    // ==========================================
    // SEKCIA: TECHNICKÉ
    // ==========================================
    
    OnboardingModule.renderTechnicalSimpleSection = function() {
        const tech = this.extensionState.technicalInfo || {};
        const platforms = this.extensionState.selectedPlatforms || [];
        
        return `
            <div class="technical-section space-y-5">
                <p class="text-gray-600 text-sm">
                    Tieto informácie nám pomôžu pripraviť sa na spoluprácu. 
                    <strong>Nemusíte teraz nič nastavovať</strong> - všetko vyriešime spoločne.
                </p>
                
                <div class="p-4 bg-white border rounded-xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                        <span class="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        Máte už vytvorené reklamné účty?
                    </h3>
                    <p class="text-xs text-gray-500 mb-3">${this.getTechnicalAccountsHint(platforms)}</p>
                    <div class="flex flex-wrap gap-2">
                        ${this.renderTechOption('hasExistingAccounts', 'yes', 'Áno, mám', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'some', 'Niektoré', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'no', 'Nie', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'unknown', 'Neviem', tech.hasExistingAccounts)}
                    </div>
                </div>
                
                <div class="p-4 bg-white border rounded-xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                        <span class="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        Viete pridať sledovacie kódy na web?
                    </h3>
                    <div class="flex flex-wrap gap-2">
                        ${this.renderTechOption('canAddTrackingCodes', 'yes', 'Áno', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'gtm', 'Mám GTM', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'help', 'Potrebujem pomoc', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'no', 'Nie', tech.canAddTrackingCodes)}
                    </div>
                </div>
                
                <div class="p-4 bg-white border rounded-xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                        <span class="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        Kto spravuje váš web?
                    </h3>
                    <div class="flex flex-wrap gap-2">
                        ${this.renderTechOption('websiteManager', 'self', 'Ja', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'internal', 'Náš tím', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'agency', 'Agentúra', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'platform', 'Platforma', tech.websiteManager)}
                    </div>
                </div>
                
                <div class="p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p class="text-sm text-green-800">
                        <strong>💡 Tip:</strong> Po vyplnení dotazníka vám pošleme email s návodmi a pomôžeme so všetkým.
                    </p>
                </div>
            </div>
        `;
    };
    
    OnboardingModule.getTechnicalAccountsHint = function(platforms) {
        const hints = { google_ads: 'Google Ads', meta_ads: 'Meta Business Manager', linkedin_ads: 'LinkedIn Campaign Manager', tiktok_ads: 'TikTok Ads Manager' };
        if (platforms.length === 0) return 'Napr. Google Ads, Meta Business Manager...';
        return `Pre: <strong>${platforms.map(p => hints[p] || p).join(', ')}</strong>`;
    };
    
    OnboardingModule.renderTechOption = function(field, value, label, currentValue) {
        const isSelected = currentValue === value;
        return `
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                ${isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                onclick="OnboardingModule.setTechnicalOption('${field}', '${value}')">
                ${isSelected ? '✓ ' : ''}${label}
            </button>
        `;
    };
    
    OnboardingModule.setTechnicalOption = function(field, value) {
        this.extensionState.technicalInfo[field] = value;
        this.formData[field] = value;
        this.rerender();
    };
    
    OnboardingModule.detectClientType = function() {
        const industry = this.formData.company_industry || '';
        if (industry.includes('E-commerce') || industry.includes('Maloobchod')) return 'ecommerce';
        if (industry.includes('B2B') || industry.includes('IT')) return 'b2b';
        if (industry.includes('Startup')) return 'startup';
        return 'local_business';
    };
    
    // ==========================================
    // OVERRIDES - VALIDÁCIA OPRAVENÁ
    // ==========================================
    
    OnboardingModule.initExtensionComponents = function() {
        if (typeof window.PackageCalculator !== 'undefined' && document.getElementById('onboarding-package-calculator')) {
            document.getElementById('package-fallback')?.style.setProperty('display', 'none');
            PackageCalculator.init('onboarding-package-calculator', {
                defaultPackage: this.extensionState.selectedPackage || 'pro',
                showComparison: true,
                showContactForPremium: true,
                onPackageChange: (pkg) => {
                    this.extensionState.selectedPackage = pkg.id;
                    this.formData.selected_package = pkg.id;
                }
            });
        }
        this.extensionState.componentsInitialized = true;
    };
    
    const originalRerender = OnboardingModule.rerender;
    OnboardingModule.rerender = function() {
        originalRerender.call(this);
        setTimeout(() => this.initExtensionComponents(), 100);
    };
    
    OnboardingModule.collectFormData = function() {
        if (originalCollectFormData) originalCollectFormData.call(this);
        this.formData.selected_package = this.extensionState.selectedPackage || 'pro';
        this.formData.selected_platforms = this.extensionState.selectedPlatforms || [];
        this.formData.has_existing_accounts = this.extensionState.technicalInfo.hasExistingAccounts;
        this.formData.can_add_tracking_codes = this.extensionState.technicalInfo.canAddTrackingCodes;
        this.formData.website_manager = this.extensionState.technicalInfo.websiteManager;
    };
    
    // OPRAVENÁ VALIDÁCIA
    OnboardingModule.validateCurrentStep = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        // Pre nové sekcie - vlastná validácia
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    // Balík je vždy vybraný (default pro)
                    return true;
                    
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms || this.extensionState.selectedPlatforms.length === 0) {
                        Utils?.toast?.('Vyberte aspoň jednu platformu', 'warning');
                        return false;
                    }
                    return true;
                    
                case 'technical_simple':
                    // Technický krok je voliteľný
                    return true;
            }
        }
        
        // Pre pôvodné sekcie použijeme pôvodnú validáciu
        if (originalValidateCurrentStep) {
            return originalValidateCurrentStep.call(this);
        }
        
        return true;
    };
    
    // ==========================================
    // CSS
    // ==========================================
    
    OnboardingModule.injectExtensionStyles = function() {
        if (document.getElementById('onboarding-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboarding-extension-styles';
        style.textContent = `
            /* Modal Base */
            .adlify-modal-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease;
            }
            .adlify-modal-overlay--visible {
                opacity: 1;
                visibility: visible;
            }
            .adlify-modal {
                background: white;
                border-radius: 20px;
                width: 100%;
                max-width: 420px;
                max-height: 85vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                transform: scale(0.95) translateY(20px);
                transition: all 0.2s ease;
            }
            .adlify-modal--lg {
                max-width: 520px;
            }
            .adlify-modal-overlay--visible .adlify-modal {
                transform: scale(1) translateY(0);
            }
            .adlify-modal__header {
                padding: 20px;
                color: white;
                text-align: center;
                position: relative;
            }
            .adlify-modal__close {
                position: absolute;
                top: 12px;
                right: 12px;
                width: 32px;
                height: 32px;
                border: none;
                background: rgba(255,255,255,0.2);
                color: white;
                border-radius: 50%;
                font-size: 16px;
                cursor: pointer;
            }
            .adlify-modal__logo {
                width: 56px;
                height: 56px;
                margin: 0 auto 10px;
                background: white;
                border-radius: 14px;
                padding: 10px;
            }
            .adlify-modal__title {
                font-size: 22px;
                font-weight: 700;
                margin: 0;
            }
            .adlify-modal__subtitle {
                font-size: 13px;
                opacity: 0.85;
                margin: 4px 0 0;
            }
            .adlify-modal__body {
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            }
            .adlify-modal__footer {
                padding: 16px 20px;
                border-top: 1px solid #e5e7eb;
                background: #f9fafb;
            }
            
            /* Buttons */
            .adlify-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 12px 20px;
                border: none;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .adlify-btn--primary {
                background: linear-gradient(135deg, #f97316, #ec4899);
                color: white;
            }
            .adlify-btn--primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
            }
            .adlify-btn--success {
                background: #10b981;
                color: white;
            }
            .adlify-btn--secondary {
                background: white;
                color: #6b7280;
                border: 1px solid #e5e7eb;
            }
            
            /* Responsive */
            @media (max-width: 480px) {
                .adlify-modal {
                    max-height: 90vh;
                    border-radius: 16px;
                }
                .adlify-modal__body {
                    padding: 16px;
                }
            }
        `;
        document.head.appendChild(style);
    };
    
    OnboardingModule.injectExtensionStyles();
    
    const originalInit = OnboardingModule.init;
    OnboardingModule.init = function() {
        if (originalInit) originalInit.call(this);
        console.log('📋 Onboarding module v2.5 initialized');
    };
    
    console.log('✅ Onboarding Extension v2.5 loaded!');
})();
