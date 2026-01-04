/**
 * ADLIFY PLATFORM - Onboarding Extension v2.1
 * 
 * Rozšírenie existujúceho OnboardingModule o:
 * - Výber balíka (PackageCalculator) - KROK 4
 * - Výber reklamných platforiem (PlatformSelector) - KROK 5
 * - Technické možnosti (zjednodušený krok) - KROK 9
 * 
 * Prepojenie účtov je riešené separátne v profile klienta.
 */

(function() {
    'use strict';
    
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v2.1 loading...');
    
    // Uložíme pôvodné metódy
    const originalRenderCurrentSection = OnboardingModule.renderCurrentSection;
    const originalCollectFormData = OnboardingModule.collectFormData;
    const originalValidateCurrentStep = OnboardingModule.validateCurrentStep;
    
    // ==========================================
    // STAV PRE NOVÉ KOMPONENTY
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
    // ROZŠÍRENÉ SEKCIE
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
    // MAPOVANIE BALÍKOV NA LIMITY
    // ==========================================
    
    OnboardingModule.PACKAGE_PLATFORM_LIMITS = {
        starter: 1,
        pro: 2,
        enterprise: Infinity,
        premium: Infinity
    };
    
    // ==========================================
    // OVERRIDE RENDER CURRENT SECTION
    // ==========================================
    
    OnboardingModule.renderCurrentSection = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    return this.renderPackageSection();
                case 'platforms':
                    return this.renderPlatformsSection();
                case 'technical_simple':
                    return this.renderTechnicalSimpleSection();
            }
        }
        
        // Mapovanie na pôvodné sekcie
        const originalStepMapping = {
            1: 1, 2: 2, 3: 3,
            6: 4, 7: 5, 8: 6,
            10: 8, 11: 9
        };
        
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
    // SEKCIA: VÝBER BALÍKA
    // ==========================================
    
    OnboardingModule.renderPackageSection = function() {
        return `
            <div class="package-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Vyberte balík služieb, ktorý najlepšie vyhovuje vašim potrebám. 
                        Podľa vybraného balíka budete môcť zvoliť počet reklamných platforiem.
                    </p>
                </div>
                
                <div id="onboarding-package-calculator"></div>
                
                <div id="package-fallback" class="hidden">
                    ${this.renderPackageCardsFallback()}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPackageCardsFallback = function() {
        const packages = [
            { 
                id: 'starter', name: 'Starter', price: 149, platforms: 1, 
                icon: '🚀', color: '#3B82F6',
                features: ['1 platforma', '1 kampaň', '2 vizuály', 'Mesačný report']
            },
            { 
                id: 'pro', name: 'Pro', price: 249, platforms: 2, 
                icon: '⭐', color: '#F97316', popular: true,
                features: ['2 platformy', '3 kampane', '4 vizuály', 'A/B testovanie']
            },
            { 
                id: 'enterprise', name: 'Enterprise', price: 399, platforms: 'Všetky', 
                icon: '💎', color: '#8B5CF6',
                features: ['Všetky platformy', '5 kampaní', '8 vizuálov', 'Remarketing']
            },
            { 
                id: 'premium', name: 'Premium', price: 799, platforms: 'Všetky', 
                icon: '👑', color: '#F59E0B', priceFrom: true,
                features: ['Všetky platformy', 'Neobmedzené', 'Dedikovaný manager', '24/7 podpora']
            }
        ];
        
        const selected = this.extensionState.selectedPackage || 'pro';
        
        return `
            <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${packages.map(pkg => `
                    <div class="relative p-5 border-2 rounded-2xl cursor-pointer transition-all
                        ${selected === pkg.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                        ${pkg.popular ? 'bg-gray-900 text-white border-gray-900' : ''}"
                        onclick="OnboardingModule.selectPackageFallback('${pkg.id}')">
                        ${pkg.popular ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full">Najobľúbenejšie</div>' : ''}
                        <div class="text-center mb-4">
                            <span class="text-3xl">${pkg.icon}</span>
                            <h3 class="text-lg font-bold mt-2" style="color: ${pkg.popular ? '#F97316' : pkg.color}">${pkg.name}</h3>
                            <p class="text-2xl font-bold mt-2 ${pkg.popular ? 'text-white' : ''}">
                                ${pkg.priceFrom ? 'od ' : ''}${pkg.price}€<span class="text-sm font-normal ${pkg.popular ? 'text-gray-400' : 'text-gray-500'}">/mes</span>
                            </p>
                        </div>
                        <ul class="space-y-2 mb-4">
                            ${pkg.features.map(f => `
                                <li class="flex items-center gap-2 text-sm ${pkg.popular ? 'text-gray-300' : 'text-gray-600'}">
                                    <span class="${pkg.popular ? 'text-orange-400' : 'text-green-500'}">✓</span> ${f}
                                </li>
                            `).join('')}
                        </ul>
                        <div class="w-full py-2 text-center rounded-xl text-sm font-semibold
                            ${selected === pkg.id 
                                ? 'bg-orange-500 text-white' 
                                : (pkg.popular ? 'bg-white/10 text-white' : 'bg-gray-100')}">
                            ${selected === pkg.id ? '✓ Vybraný' : 'Vybrať'}
                        </div>
                        <input type="radio" name="selected_package" value="${pkg.id}" 
                            ${selected === pkg.id ? 'checked' : ''} class="sr-only">
                    </div>
                `).join('')}
            </div>
        `;
    };
    
    OnboardingModule.selectPackageFallback = function(packageId) {
        this.extensionState.selectedPackage = packageId;
        this.formData.selected_package = packageId;
        this.rerender();
    };
    
    // ==========================================
    // SEKCIA: PLATFORMY
    // ==========================================
    
    OnboardingModule.renderPlatformsSection = function() {
        const selectedPkg = this.extensionState.selectedPackage || 'pro';
        const platformLimit = this.PACKAGE_PLATFORM_LIMITS[selectedPkg];
        const platformLimitText = platformLimit === Infinity ? 'neobmedzene' : platformLimit;
        
        return `
            <div class="platforms-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Vyberte platformy, na ktorých chcete propagovať váš biznis.
                    </p>
                    <div class="mt-3 p-3 bg-blue-50 rounded-xl">
                        <p class="text-sm text-blue-800">
                            💡 Váš balík <strong>${selectedPkg.charAt(0).toUpperCase() + selectedPkg.slice(1)}</strong> 
                            umožňuje <strong>${platformLimitText}</strong> 
                            platfor${platformLimit === 1 ? 'mu' : (platformLimit === Infinity ? 'iem' : 'my')}.
                        </p>
                    </div>
                </div>
                
                <div id="onboarding-platform-selector"></div>
                
                <div id="platforms-fallback" class="hidden">
                    ${this.renderPlatformsFallback()}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformsFallback = function() {
        const platforms = [
            { id: 'google_ads', name: 'Google Ads', icon: '🔍', desc: 'Search, Display, YouTube' },
            { id: 'meta_ads', name: 'Meta (Facebook/IG)', icon: '📘', desc: 'Feed, Stories, Reels' },
            { id: 'linkedin_ads', name: 'LinkedIn Ads', icon: '💼', desc: 'B2B reklamy' },
            { id: 'tiktok_ads', name: 'TikTok Ads', icon: '🎵', desc: 'Video reklamy' }
        ];
        
        const selected = this.extensionState.selectedPlatforms || [];
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
        
        return `
            <div class="grid md:grid-cols-2 gap-3">
                ${platforms.map(p => `
                    <label class="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all
                        ${selected.includes(p.id) ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}">
                        <input type="checkbox" name="platform_${p.id}" value="${p.id}" 
                            ${selected.includes(p.id) ? 'checked' : ''}
                            class="w-5 h-5 mr-4 accent-orange-500"
                            onchange="OnboardingModule.togglePlatformFallback('${p.id}')">
                        <span class="text-2xl mr-3">${p.icon}</span>
                        <div>
                            <span class="font-semibold block">${p.name}</span>
                            <span class="text-sm text-gray-500">${p.desc}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
            <p class="text-sm text-gray-500 mt-3">
                Vybrané: <strong>${selected.length}</strong> / ${limit === Infinity ? '∞' : limit}
            </p>
        `;
    };
    
    OnboardingModule.togglePlatformFallback = function(platformId) {
        const platforms = this.extensionState.selectedPlatforms || [];
        const index = platforms.indexOf(platformId);
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
        
        if (index > -1) {
            platforms.splice(index, 1);
        } else {
            if (platforms.length >= limit && limit !== Infinity) {
                if (typeof Utils !== 'undefined') {
                    Utils.toast(`Váš balík umožňuje max. ${limit} platformy`, 'warning');
                }
                return;
            }
            platforms.push(platformId);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
        this.rerender();
    };
    
    // ==========================================
    // SEKCIA: TECHNICKÉ MOŽNOSTI (ZJEDNODUŠENÁ)
    // ==========================================
    
    OnboardingModule.renderTechnicalSimpleSection = function() {
        const tech = this.extensionState.technicalInfo || {};
        const platforms = this.extensionState.selectedPlatforms || [];
        
        return `
            <div class="technical-section space-y-6">
                <div class="mb-4">
                    <p class="text-gray-600">
                        Tieto informácie nám pomôžu pripraviť sa na spoluprácu. 
                        <strong>Nemusíte teraz nič nastavovať</strong> - všetko vyriešime spoločne.
                    </p>
                </div>
                
                <!-- Otázka 1: Existujúce účty -->
                <div class="p-5 bg-white border rounded-2xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                        Máte už vytvorené reklamné účty?
                    </h3>
                    <p class="text-sm text-gray-500 mb-4">
                        ${this.getTechnicalAccountsHint(platforms)}
                    </p>
                    <div class="flex flex-wrap gap-3">
                        ${this.renderTechOption('hasExistingAccounts', 'yes', 'Áno, mám účty', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'some', 'Mám niektoré', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'no', 'Nie, nemám', tech.hasExistingAccounts)}
                        ${this.renderTechOption('hasExistingAccounts', 'unknown', 'Neviem / Nie som si istý', tech.hasExistingAccounts)}
                    </div>
                </div>
                
                <!-- Otázka 2: Prístup k webu -->
                <div class="p-5 bg-white border rounded-2xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                        Viete pridať sledovacie kódy na váš web?
                    </h3>
                    <p class="text-sm text-gray-500 mb-4">
                        Pre meranie konverzií potrebujeme pridať kódy (pixely) na vašu stránku.
                    </p>
                    <div class="flex flex-wrap gap-3">
                        ${this.renderTechOption('canAddTrackingCodes', 'yes', 'Áno, viem to spraviť', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'gtm', 'Mám Google Tag Manager', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'help', 'Budem potrebovať pomoc', tech.canAddTrackingCodes)}
                        ${this.renderTechOption('canAddTrackingCodes', 'no', 'Nie, neviem', tech.canAddTrackingCodes)}
                    </div>
                </div>
                
                <!-- Otázka 3: Kto spravuje web -->
                <div class="p-5 bg-white border rounded-2xl">
                    <h3 class="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                        Kto spravuje váš web?
                    </h3>
                    <p class="text-sm text-gray-500 mb-4">
                        Ak nemáte prístup, budeme potrebovať kontakt na správcu.
                    </p>
                    <div class="flex flex-wrap gap-3">
                        ${this.renderTechOption('websiteManager', 'self', 'Ja sám/sama', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'internal', 'Náš tím / IT oddelenie', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'agency', 'Externá agentúra / Freelancer', tech.websiteManager)}
                        ${this.renderTechOption('websiteManager', 'platform', 'Platforma (Shopify, Wix...)', tech.websiteManager)}
                    </div>
                </div>
                
                <!-- Info box -->
                <div class="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div class="flex items-start gap-3">
                        <span class="text-2xl">💡</span>
                        <div>
                            <p class="font-medium text-green-800">Nemusíte sa báť!</p>
                            <p class="text-sm text-green-700 mt-1">
                                Po vyplnení dotazníka vám pošleme email s podrobnými návodmi 
                                a naši špecialisti vám pomôžu so všetkým technickým nastavením.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };
    
    OnboardingModule.getTechnicalAccountsHint = function(platforms) {
        const hints = {
            google_ads: 'Google Ads',
            meta_ads: 'Meta Business Manager',
            linkedin_ads: 'LinkedIn Campaign Manager',
            tiktok_ads: 'TikTok Ads Manager'
        };
        
        if (platforms.length === 0) {
            return 'Napr. Google Ads, Meta Business Manager a pod.';
        }
        
        const names = platforms.map(p => hints[p] || p).filter(Boolean);
        return `Pre vaše platformy: <strong>${names.join(', ')}</strong>`;
    };
    
    OnboardingModule.renderTechOption = function(field, value, label, currentValue) {
        const isSelected = currentValue === value;
        return `
            <button type="button" 
                class="px-4 py-2 rounded-xl text-sm font-medium transition-all
                    ${isSelected 
                        ? 'bg-orange-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
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
    
    // ==========================================
    // INICIALIZÁCIA KOMPONENTOV
    // ==========================================
    
    OnboardingModule.initExtensionComponents = function() {
        const hasPlatformSelector = typeof window.PlatformSelector !== 'undefined';
        const hasPackageCalculator = typeof window.PackageCalculator !== 'undefined';
        
        // PackageCalculator
        if (hasPackageCalculator && document.getElementById('onboarding-package-calculator')) {
            document.getElementById('package-fallback')?.classList.add('hidden');
            
            PackageCalculator.init('onboarding-package-calculator', {
                defaultPackage: this.extensionState.selectedPackage || 'pro',
                showComparison: true,
                showContactForPremium: true,
                onPackageChange: (pkg) => {
                    this.extensionState.selectedPackage = pkg.id;
                    this.formData.selected_package = pkg.id;
                    this.formData.package_price = pkg.price;
                    
                    if (hasPlatformSelector && PlatformSelector.container) {
                        PlatformSelector.setMaxPlatforms(pkg.limits.platforms);
                    }
                }
            });
        } else if (document.getElementById('package-fallback')) {
            document.getElementById('package-fallback')?.classList.remove('hidden');
        }
        
        // PlatformSelector
        if (hasPlatformSelector && document.getElementById('onboarding-platform-selector')) {
            document.getElementById('platforms-fallback')?.classList.add('hidden');
            
            const platformLimit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 2;
            
            PlatformSelector.init('onboarding-platform-selector', {
                maxPlatforms: platformLimit,
                clientType: this.detectClientType(),
                preselected: this.extensionState.selectedPlatforms || [],
                showRecommendations: true,
                onChange: (platforms) => {
                    this.extensionState.selectedPlatforms = platforms;
                    this.formData.selected_platforms = platforms;
                },
                onLimitExceeded: (platforms, limit) => {
                    if (hasPackageCalculator) {
                        PackageCalculator.showUpgradeModal(this.extensionState.selectedPackage);
                    }
                }
            });
        } else if (document.getElementById('platforms-fallback')) {
            document.getElementById('platforms-fallback')?.classList.remove('hidden');
        }
        
        this.extensionState.componentsInitialized = true;
    };
    
    OnboardingModule.detectClientType = function() {
        const industry = this.formData.company_industry || '';
        if (industry.includes('E-commerce') || industry.includes('Maloobchod')) return 'ecommerce';
        if (industry.includes('B2B') || industry.includes('IT')) return 'b2b';
        return 'local_business';
    };
    
    // ==========================================
    // OVERRIDES
    // ==========================================
    
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
        
        const form = document.getElementById('onboarding-form');
        if (form) {
            const formData = new FormData(form);
            
            if (formData.get('selected_package')) {
                this.formData.selected_package = formData.get('selected_package');
                this.extensionState.selectedPackage = formData.get('selected_package');
            }
            
            if (!this.formData.selected_platforms.length) {
                const platforms = [];
                ['google_ads', 'meta_ads', 'linkedin_ads', 'tiktok_ads'].forEach(p => {
                    if (formData.has(`platform_${p}`)) platforms.push(p);
                });
                if (platforms.length > 0) {
                    this.formData.selected_platforms = platforms;
                    this.extensionState.selectedPlatforms = platforms;
                }
            }
        }
    };
    
    OnboardingModule.validateCurrentStep = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    if (!this.extensionState.selectedPackage) {
                        Utils?.toast?.('Vyberte balík služieb', 'warning');
                        return false;
                    }
                    return true;
                    
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms?.length) {
                        Utils?.toast?.('Vyberte aspoň jednu platformu', 'warning');
                        return false;
                    }
                    const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage];
                    if (this.extensionState.selectedPlatforms.length > limit && limit !== Infinity) {
                        Utils?.toast?.(`Váš balík umožňuje max. ${limit} platformy`, 'warning');
                        return false;
                    }
                    return true;
                    
                case 'technical_simple':
                    // Technický krok je voliteľný
                    return true;
            }
        }
        
        return originalValidateCurrentStep ? originalValidateCurrentStep.call(this) : true;
    };
    
    // ==========================================
    // CSS
    // ==========================================
    
    OnboardingModule.injectExtensionStyles = function() {
        if (document.getElementById('onboarding-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboarding-extension-styles';
        style.textContent = `
            .platforms-section .platform-selector,
            .package-section .package-calculator {
                margin: 0 -24px;
            }
            
            @media (max-width: 768px) {
                .platforms-section .platform-selector,
                .package-section .package-calculator {
                    margin: 0 -16px;
                }
            }
            
            .technical-section button:focus {
                outline: none;
                box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.3);
            }
        `;
        document.head.appendChild(style);
    };
    
    // ==========================================
    // INIT
    // ==========================================
    
    OnboardingModule.injectExtensionStyles();
    
    const originalInit = OnboardingModule.init;
    OnboardingModule.init = function() {
        if (originalInit) originalInit.call(this);
        console.log('📋 Onboarding module v2.1 (extended) initialized');
    };
    
    console.log('✅ Onboarding Extension v2.1 loaded!');
    console.log('📊 Sections:', OnboardingModule.SECTIONS.length);
    
})();
