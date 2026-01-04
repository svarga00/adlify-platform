/**
 * ADLIFY PLATFORM - Onboarding Extension v2.2
 * 
 * Rozšírenie existujúceho OnboardingModule o:
 * - Výber balíka - KROK 4
 * - Výber reklamných platforiem - KROK 5
 * - Technické možnosti - KROK 9
 */

(function() {
    'use strict';
    
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v2.2 loading...');
    
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
    // DEFINÍCIA PLATFORIEM
    // ==========================================
    
    OnboardingModule.PLATFORMS = {
        google_ads: {
            id: 'google_ads',
            name: 'Google Ads',
            icon: '🔍',
            color: '#4285F4',
            description: 'Search, Display, YouTube, Shopping',
            features: ['Vyhľadávanie', 'Display reklamy', 'YouTube video', 'Shopping'],
            recommended: ['local_business', 'ecommerce', 'b2b'],
            minBudget: 5
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            icon: '📘',
            color: '#1877F2',
            description: 'Facebook, Instagram - Feed, Stories, Reels',
            features: ['Facebook Feed', 'Instagram', 'Stories', 'Reels'],
            recommended: ['local_business', 'ecommerce', 'startup'],
            minBudget: 3
        },
        linkedin_ads: {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            icon: '💼',
            color: '#0A66C2',
            description: 'B2B reklamy, profesionálne cielenie',
            features: ['Sponsored Content', 'InMail', 'B2B targeting'],
            recommended: ['b2b'],
            minBudget: 10
        },
        tiktok_ads: {
            id: 'tiktok_ads',
            name: 'TikTok Ads',
            icon: '🎵',
            color: '#000000',
            description: 'Video reklamy pre mladšiu cieľovku',
            features: ['In-Feed Video', 'TopView', 'Spark Ads'],
            recommended: ['ecommerce', 'startup'],
            minBudget: 5
        }
    };
    
    // ==========================================
    // ODPORÚČANIA PODĽA TYPU KLIENTA
    // ==========================================
    
    OnboardingModule.PLATFORM_RECOMMENDATIONS = {
        local_business: {
            platforms: ['google_ads', 'meta_ads'],
            message: 'Pre lokálne služby odporúčame Google Ads + Meta Ads'
        },
        ecommerce: {
            platforms: ['google_ads', 'meta_ads'],
            message: 'Pre e-shop odporúčame Google Ads + Meta Ads'
        },
        b2b: {
            platforms: ['google_ads', 'linkedin_ads'],
            message: 'Pre B2B odporúčame Google Ads + LinkedIn Ads'
        },
        startup: {
            platforms: ['meta_ads', 'tiktok_ads'],
            message: 'Pre startup odporúčame Meta Ads + TikTok Ads'
        }
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
                
                <div id="package-fallback">
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
                    <div class="relative p-5 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-lg
                        ${selected === pkg.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                        ${pkg.popular ? 'bg-gray-900 text-white border-gray-900' : ''}"
                        onclick="OnboardingModule.selectPackageFallback('${pkg.id}')">
                        ${pkg.popular ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full whitespace-nowrap">Najobľúbenejšie</div>' : ''}
                        <div class="text-center mb-4">
                            <span class="text-3xl block mb-2">${pkg.icon}</span>
                            <h3 class="text-lg font-bold" style="color: ${pkg.popular ? '#F97316' : pkg.color}">${pkg.name}</h3>
                            <p class="text-2xl font-bold mt-2 ${pkg.popular ? 'text-white' : 'text-gray-800'}">
                                ${pkg.priceFrom ? 'od ' : ''}${pkg.price}€<span class="text-sm font-normal ${pkg.popular ? 'text-gray-400' : 'text-gray-500'}">/mes</span>
                            </p>
                            <p class="text-sm ${pkg.popular ? 'text-gray-400' : 'text-gray-500'} mt-1">
                                ${typeof pkg.platforms === 'number' ? pkg.platforms + ' platforma' : pkg.platforms}
                            </p>
                        </div>
                        <ul class="space-y-2 mb-4">
                            ${pkg.features.map(f => `
                                <li class="flex items-center gap-2 text-sm ${pkg.popular ? 'text-gray-300' : 'text-gray-600'}">
                                    <span class="${pkg.popular ? 'text-orange-400' : 'text-green-500'}">✓</span> ${f}
                                </li>
                            `).join('')}
                        </ul>
                        <div class="w-full py-2 text-center rounded-xl text-sm font-semibold transition-all
                            ${selected === pkg.id 
                                ? 'bg-orange-500 text-white' 
                                : (pkg.popular ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200')}">
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
    // SEKCIA: PLATFORMY (OPRAVENÁ)
    // ==========================================
    
    OnboardingModule.renderPlatformsSection = function() {
        const selectedPkg = this.extensionState.selectedPackage || 'pro';
        const platformLimit = this.PACKAGE_PLATFORM_LIMITS[selectedPkg];
        const platformLimitText = platformLimit === Infinity ? 'neobmedzený počet' : platformLimit;
        const clientType = this.detectClientType();
        const recommendation = this.PLATFORM_RECOMMENDATIONS[clientType] || this.PLATFORM_RECOMMENDATIONS.local_business;
        
        const selected = this.extensionState.selectedPlatforms || [];
        
        return `
            <div class="platforms-section">
                <!-- Info o limite -->
                <div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p class="text-blue-800 flex items-center gap-2">
                        <span class="text-xl">💡</span>
                        <span>Váš balík <strong>${selectedPkg.charAt(0).toUpperCase() + selectedPkg.slice(1)}</strong> 
                        umožňuje <strong>${platformLimitText}</strong> 
                        ${platformLimit === 1 ? 'platformu' : (platformLimit === Infinity ? 'platforiem' : 'platformy')}.</span>
                    </p>
                </div>
                
                <!-- Odporúčanie -->
                <div class="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div class="flex items-center justify-between flex-wrap gap-3">
                        <p class="text-green-800 flex items-center gap-2">
                            <span class="text-xl">🎯</span>
                            <span>${recommendation.message}</span>
                        </p>
                        <button type="button" 
                            onclick="OnboardingModule.applyRecommendation()"
                            class="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
                            Použiť odporúčanie
                        </button>
                    </div>
                </div>
                
                <!-- Grid platforiem -->
                <div class="grid md:grid-cols-2 gap-4">
                    ${Object.values(this.PLATFORMS).map(platform => this.renderPlatformCard(platform, selected, platformLimit)).join('')}
                </div>
                
                <!-- Súhrn -->
                <div class="mt-6 p-4 bg-gray-100 rounded-xl">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-600">Vybrané platformy:</span>
                        <span class="font-bold text-lg ${selected.length > platformLimit && platformLimit !== Infinity ? 'text-red-600' : 'text-gray-800'}">
                            ${selected.length} / ${platformLimit === Infinity ? '∞' : platformLimit}
                        </span>
                    </div>
                    ${selected.length > 0 ? `
                        <div class="mt-2 flex flex-wrap gap-2">
                            ${selected.map(id => {
                                const p = this.PLATFORMS[id];
                                return p ? `<span class="inline-flex items-center gap-1 px-3 py-1 bg-white rounded-full text-sm font-medium shadow-sm">${p.icon} ${p.name}</span>` : '';
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformCard = function(platform, selected, limit) {
        const isSelected = selected.includes(platform.id);
        const isDisabled = !isSelected && selected.length >= limit && limit !== Infinity;
        
        return `
            <div class="platform-card relative p-5 border-2 rounded-2xl transition-all cursor-pointer
                ${isSelected ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow'}
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
                onclick="${isDisabled ? '' : `OnboardingModule.togglePlatform('${platform.id}')`}"
                style="--platform-color: ${platform.color}">
                
                <div class="flex items-start gap-4">
                    <!-- Checkbox -->
                    <div class="flex-shrink-0 mt-1">
                        <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                            ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}">
                            ${isSelected ? '<span class="text-white text-sm">✓</span>' : ''}
                        </div>
                    </div>
                    
                    <!-- Icon & Content -->
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="text-3xl">${platform.icon}</span>
                            <div>
                                <h4 class="font-bold text-gray-800">${platform.name}</h4>
                                <p class="text-sm text-gray-500">${platform.description}</p>
                            </div>
                        </div>
                        
                        <!-- Features -->
                        <div class="flex flex-wrap gap-2 mt-3">
                            ${platform.features.map(f => `
                                <span class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">${f}</span>
                            `).join('')}
                        </div>
                        
                        <!-- Min budget -->
                        <p class="text-xs text-gray-400 mt-2">Min. denný rozpočet: ${platform.minBudget}€</p>
                    </div>
                </div>
                
                <!-- Hidden input -->
                <input type="checkbox" name="platform_${platform.id}" value="${platform.id}" 
                    ${isSelected ? 'checked' : ''} class="sr-only">
            </div>
        `;
    };
    
    OnboardingModule.togglePlatform = function(platformId) {
        const platforms = this.extensionState.selectedPlatforms || [];
        const index = platforms.indexOf(platformId);
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
        
        if (index > -1) {
            // Odobrať
            platforms.splice(index, 1);
        } else {
            // Pridať - skontroluj limit
            if (platforms.length >= limit && limit !== Infinity) {
                if (typeof Utils !== 'undefined' && Utils.toast) {
                    Utils.toast(`Váš balík umožňuje max. ${limit} ${limit === 1 ? 'platformu' : 'platformy'}. Pre viac platforiem zvoľte vyšší balík.`, 'warning');
                }
                return;
            }
            platforms.push(platformId);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
        this.rerender();
    };
    
    OnboardingModule.applyRecommendation = function() {
        const clientType = this.detectClientType();
        const recommendation = this.PLATFORM_RECOMMENDATIONS[clientType] || this.PLATFORM_RECOMMENDATIONS.local_business;
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
        
        // Vyber len toľko platforiem, koľko dovoľuje balík
        let platforms = [...recommendation.platforms];
        if (limit !== Infinity && platforms.length > limit) {
            platforms = platforms.slice(0, limit);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
        this.rerender();
        
        if (typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast('Odporúčanie bolo aplikované', 'success');
        }
    };
    
    OnboardingModule.detectClientType = function() {
        const industry = this.formData.company_industry || '';
        const target = this.formData.target_audience || {};
        
        if (industry.includes('E-commerce') || industry.includes('Maloobchod') || industry.includes('Online obchod')) {
            return 'ecommerce';
        }
        if (industry.includes('B2B') || industry.includes('IT') || industry.includes('Služby pre firmy') || target.b2b) {
            return 'b2b';
        }
        if (industry.includes('Startup') || industry.includes('Technológie')) {
            return 'startup';
        }
        return 'local_business';
    };
    
    // ==========================================
    // SEKCIA: TECHNICKÉ MOŽNOSTI
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
                        ? 'bg-orange-500 text-white shadow-md' 
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
        const hasPackageCalculator = typeof window.PackageCalculator !== 'undefined';
        
        // PackageCalculator - ak existuje, použijeme ho a skryjeme fallback
        if (hasPackageCalculator && document.getElementById('onboarding-package-calculator')) {
            const fallback = document.getElementById('package-fallback');
            if (fallback) fallback.style.display = 'none';
            
            PackageCalculator.init('onboarding-package-calculator', {
                defaultPackage: this.extensionState.selectedPackage || 'pro',
                showComparison: true,
                showContactForPremium: true,
                onPackageChange: (pkg) => {
                    this.extensionState.selectedPackage = pkg.id;
                    this.formData.selected_package = pkg.id;
                    this.formData.package_price = pkg.price;
                }
            });
        }
        
        this.extensionState.componentsInitialized = true;
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
    };
    
    OnboardingModule.validateCurrentStep = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    if (!this.extensionState.selectedPackage) {
                        if (typeof Utils !== 'undefined' && Utils.toast) {
                            Utils.toast('Vyberte balík služieb', 'warning');
                        }
                        return false;
                    }
                    return true;
                    
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms?.length) {
                        if (typeof Utils !== 'undefined' && Utils.toast) {
                            Utils.toast('Vyberte aspoň jednu platformu', 'warning');
                        }
                        return false;
                    }
                    const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage];
                    if (this.extensionState.selectedPlatforms.length > limit && limit !== Infinity) {
                        if (typeof Utils !== 'undefined' && Utils.toast) {
                            Utils.toast(`Váš balík umožňuje max. ${limit} platformy`, 'warning');
                        }
                        return false;
                    }
                    return true;
                    
                case 'technical_simple':
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
            .platforms-section .platform-card {
                transition: all 0.2s ease;
            }
            
            .platforms-section .platform-card:hover:not(.opacity-50) {
                transform: translateY(-2px);
            }
            
            .package-section .package-calculator {
                margin: 0 -24px;
            }
            
            @media (max-width: 768px) {
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
        console.log('📋 Onboarding module v2.2 (extended) initialized');
    };
    
    console.log('✅ Onboarding Extension v2.2 loaded!');
    console.log('📊 Sections:', OnboardingModule.SECTIONS.length);
    
})();
