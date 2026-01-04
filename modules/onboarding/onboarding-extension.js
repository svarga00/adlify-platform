/**
 * ADLIFY PLATFORM - Onboarding Extension v2.3
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
    
    console.log('🔌 Onboarding Extension v2.3 loading...');
    
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
    // SVG LOGÁ PLATFORIEM
    // ==========================================
    
    OnboardingModule.PLATFORM_LOGOS = {
        google_ads: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" fill="#4285F4"/>
            <path d="M5.277 14.268l-.835 3.118-3.054.065A11.946 11.946 0 010 12c0-1.89.436-3.68 1.213-5.27l2.721.499.946 2.146A7.13 7.13 0 004.5 12c0 .815.137 1.598.39 2.327l.387-.06z" fill="#FBBC05"/>
            <path d="M12.24 4.8c1.77 0 3.36.608 4.61 1.802l3.46-3.462C18.19 1.186 15.48 0 12.24 0 7.463 0 3.303 2.69 1.213 6.73l3.666 2.843C5.826 6.708 8.76 4.8 12.24 4.8z" fill="#EA4335"/>
            <path d="M12.24 19.2c-3.48 0-6.414-1.908-7.361-4.773l-3.666 2.843C3.303 21.31 7.463 24 12.24 24c3.103 0 5.94-1.073 8.04-3.066l-3.487-2.702c-.948.645-2.2 1.088-3.553 1.088v-.12z" fill="#34A853"/>
        </svg>`,
        
        meta_ads: `<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="meta-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#0081FB"/>
                    <stop offset="100%" style="stop-color:#0064E0"/>
                </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="16" fill="url(#meta-gradient)"/>
            <path d="M21.214 20.238c-.397.67-1.17 1.012-1.923 1.012-.673 0-1.276-.318-1.835-.93-.56-.613-1.058-1.51-1.456-2.626-.398-1.115-.597-2.307-.597-3.576 0-1.046.143-1.998.43-2.854.286-.857.676-1.526 1.17-2.008.493-.482 1.042-.724 1.647-.724.75 0 1.414.356 1.992 1.067.578.71 1.034 1.707 1.367 2.99.334 1.282.5 2.747.5 4.394 0 1.206-.166 2.266-.5 3.178-.333.913-.795 1.407-1.385 1.48a1.58 1.58 0 01-.41.597zm-10.428 0c-.397.67-1.17 1.012-1.923 1.012-.673 0-1.276-.318-1.835-.93-.56-.613-1.058-1.51-1.456-2.626-.398-1.115-.597-2.307-.597-3.576 0-1.046.143-1.998.43-2.854.286-.857.676-1.526 1.17-2.008.493-.482 1.042-.724 1.647-.724.75 0 1.414.356 1.992 1.067.578.71 1.034 1.707 1.367 2.99.334 1.282.5 2.747.5 4.394 0 1.206-.166 2.266-.5 3.178-.333.913-.795 1.407-1.385 1.48a1.58 1.58 0 01-.41.597z" fill="#fff"/>
        </svg>`,
        
        linkedin_ads: `<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="4" fill="#0A66C2"/>
            <path d="M10.526 24.088H7.088V13.174h3.438v10.914zM8.807 11.73a1.992 1.992 0 110-3.984 1.992 1.992 0 010 3.984zm15.28 12.358h-3.433v-5.31c0-1.266-.025-2.895-1.765-2.895-1.766 0-2.037 1.38-2.037 2.805v5.4h-3.43V13.174h3.294v1.49h.046c.458-.87 1.58-1.786 3.25-1.786 3.478 0 4.12 2.29 4.12 5.267v5.943h-.045z" fill="#fff"/>
        </svg>`,
        
        tiktok_ads: `<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="4" fill="#000"/>
            <path d="M22.465 13.028a5.147 5.147 0 01-3.102-1.036v7.49a5.518 5.518 0 11-4.755-5.466v2.795a2.785 2.785 0 101.96 2.67V7h2.795a5.142 5.142 0 003.102 4.277v1.751z" fill="#fff"/>
            <path d="M22.465 13.028a5.147 5.147 0 01-3.102-1.036v7.49a5.518 5.518 0 01-5.518 5.518 5.474 5.474 0 01-3.236-1.052 5.518 5.518 0 008.754-4.466v-7.49a5.147 5.147 0 003.102 1.036v-1.751a5.12 5.12 0 01-3.102-1.036v1.751a5.142 5.142 0 003.102 1.036z" fill="#69C9D0"/>
            <path d="M9.609 20.962a2.785 2.785 0 014.75-1.968v-2.796a5.576 5.576 0 00-.763-.052 5.518 5.518 0 00-3.987 9.36 5.518 5.518 0 010-4.544z" fill="#EE1D52"/>
        </svg>`,
        
        pinterest_ads: `<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#E60023"/>
            <path d="M16 6.4c-5.302 0-9.6 4.298-9.6 9.6 0 4.07 2.532 7.544 6.112 8.944-.085-.762-.162-1.932.034-2.766.177-.752 1.142-4.842 1.142-4.842s-.291-.582-.291-1.444c0-1.352.784-2.362 1.76-2.362.83 0 1.232.624 1.232 1.372 0 .836-.532 2.086-.806 3.246-.23.97.486 1.76 1.442 1.76 1.73 0 3.06-1.824 3.06-4.458 0-2.33-1.674-3.96-4.066-3.96-2.77 0-4.394 2.076-4.394 4.222 0 .836.322 1.732.724 2.22.08.096.092.18.068.278-.074.306-.238.97-.27 1.106-.042.178-.14.216-.324.13-1.21-.564-1.966-2.334-1.966-3.756 0-3.058 2.222-5.866 6.41-5.866 3.366 0 5.982 2.398 5.982 5.602 0 3.344-2.108 6.036-5.034 6.036-1.108 0-2.148-.576-2.506-1.256l-.682 2.6c-.246.952-.914 2.144-1.362 2.872.976.302 2.01.466 3.084.466 5.302 0 9.6-4.298 9.6-9.6S21.302 6.4 16 6.4z" fill="#fff"/>
        </svg>`,
        
        microsoft_ads: `<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="4" fill="#00A4EF"/>
            <path d="M7 7h8v8H7V7z" fill="#F25022"/>
            <path d="M17 7h8v8h-8V7z" fill="#7FBA00"/>
            <path d="M7 17h8v8H7v-8z" fill="#00A4EF"/>
            <path d="M17 17h8v8h-8v-8z" fill="#FFB900"/>
        </svg>`
    };
    
    // ==========================================
    // DEFINÍCIA PLATFORIEM S DETAILMI
    // ==========================================
    
    OnboardingModule.PLATFORMS = {
        google_ads: {
            id: 'google_ads',
            name: 'Google Ads',
            color: '#4285F4',
            description: 'Najväčšia reklamná sieť na svete',
            longDescription: 'Google Ads vám umožní osloviť zákazníkov presne vtedy, keď hľadajú vaše produkty alebo služby. Reklamy sa zobrazujú vo vyhľadávaní Google, na YouTube, v Gmaile a na miliónoch partnerských webov.',
            features: [
                { name: 'Search', desc: 'Textové reklamy vo vyhľadávaní' },
                { name: 'Display', desc: 'Bannerové reklamy na weboch' },
                { name: 'YouTube', desc: 'Video reklamy pred/počas videí' },
                { name: 'Shopping', desc: 'Produktové reklamy pre e-shopy' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'B2B', 'Všetky odvetvia'],
            minBudget: 5,
            setupDifficulty: 'Stredná',
            recommended: ['local_business', 'ecommerce', 'b2b']
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            color: '#0081FB',
            description: 'Facebook a Instagram reklamy',
            longDescription: 'Meta Ads (Facebook & Instagram) ponúkajú najpresnejšie cielenie na základe záujmov, správania a demografických údajov. Ideálne pre budovanie značky a remarketing.',
            features: [
                { name: 'Feed', desc: 'Reklamy v hlavnom feede' },
                { name: 'Stories', desc: 'Fullscreen stories formát' },
                { name: 'Reels', desc: 'Krátke video reklamy' },
                { name: 'Messenger', desc: 'Reklamy v Messengeri' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'Gastro', 'Beauty'],
            minBudget: 3,
            setupDifficulty: 'Nízka',
            recommended: ['local_business', 'ecommerce', 'startup']
        },
        linkedin_ads: {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            color: '#0A66C2',
            description: 'B2B reklamy pre profesionálov',
            longDescription: 'LinkedIn je najlepšia platforma pre B2B marketing. Cieľte podľa pracovnej pozície, odvetvia, veľkosti firmy alebo konkrétnych spoločností.',
            features: [
                { name: 'Sponsored Content', desc: 'Natívne reklamy vo feede' },
                { name: 'InMail', desc: 'Priame správy do schránky' },
                { name: 'Text Ads', desc: 'Textové reklamy v sidebar' },
                { name: 'Lead Gen Forms', desc: 'Formuláre priamo v reklame' }
            ],
            bestFor: ['B2B služby', 'IT firmy', 'Recruiteri', 'SaaS'],
            minBudget: 10,
            setupDifficulty: 'Stredná',
            recommended: ['b2b']
        },
        tiktok_ads: {
            id: 'tiktok_ads',
            name: 'TikTok Ads',
            color: '#000000',
            description: 'Video reklamy pre Gen Z a Millennials',
            longDescription: 'TikTok je najrýchlejšie rastúca sociálna sieť. Ak je vaša cieľovka do 35 rokov, TikTok ponúka najvyššiu organickú dosažiteľnosť a engagement.',
            features: [
                { name: 'In-Feed', desc: 'Video v hlavnom feede' },
                { name: 'TopView', desc: 'Premium umiestnenie' },
                { name: 'Spark Ads', desc: 'Boost organického obsahu' },
                { name: 'Effects', desc: 'Brandované efekty a filtre' }
            ],
            bestFor: ['Móda', 'Kozmetika', 'F&B', 'Entertainment'],
            minBudget: 5,
            setupDifficulty: 'Nízka',
            recommended: ['ecommerce', 'startup']
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
    // SEKCIA: PLATFORMY S LOGAMI A VYSVETLIVKAMI
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
                <div class="space-y-4">
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
                        <div class="mt-3 flex flex-wrap gap-2">
                            ${selected.map(id => {
                                const p = this.PLATFORMS[id];
                                return p ? `
                                    <span class="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg text-sm font-medium shadow-sm border">
                                        <span class="w-5 h-5">${this.PLATFORM_LOGOS[id]}</span>
                                        ${p.name}
                                    </span>
                                ` : '';
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
            <div class="platform-card relative border-2 rounded-2xl transition-all overflow-hidden
                ${isSelected ? 'border-orange-500 bg-orange-50 shadow-lg' : 'border-gray-200 hover:border-gray-300 hover:shadow'}
                ${isDisabled ? 'opacity-50' : 'cursor-pointer'}"
                onclick="${isDisabled ? '' : `OnboardingModule.togglePlatform('${platform.id}')`}"
                style="--platform-color: ${platform.color}">
                
                <div class="p-5">
                    <div class="flex items-start gap-4">
                        <!-- Checkbox -->
                        <div class="flex-shrink-0 mt-1">
                            <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                                ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}">
                                ${isSelected ? '<span class="text-white text-sm font-bold">✓</span>' : ''}
                            </div>
                        </div>
                        
                        <!-- Logo & Header -->
                        <div class="flex-1">
                            <div class="flex items-center gap-4 mb-3">
                                <div class="w-12 h-12 flex items-center justify-center">
                                    ${this.PLATFORM_LOGOS[platform.id]}
                                </div>
                                <div>
                                    <h4 class="font-bold text-lg text-gray-800">${platform.name}</h4>
                                    <p class="text-sm text-gray-500">${platform.description}</p>
                                </div>
                            </div>
                            
                            <!-- Dlhý popis -->
                            <p class="text-sm text-gray-600 mb-4 leading-relaxed">
                                ${platform.longDescription}
                            </p>
                            
                            <!-- Features grid -->
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                ${platform.features.map(f => `
                                    <div class="p-3 bg-white rounded-lg border ${isSelected ? 'border-orange-200' : 'border-gray-100'}">
                                        <p class="font-semibold text-sm text-gray-800">${f.name}</p>
                                        <p class="text-xs text-gray-500 mt-1">${f.desc}</p>
                                    </div>
                                `).join('')}
                            </div>
                            
                            <!-- Best for & Info -->
                            <div class="flex flex-wrap items-center gap-4 text-sm">
                                <div class="flex items-center gap-2">
                                    <span class="text-gray-500">Ideálne pre:</span>
                                    <div class="flex flex-wrap gap-1">
                                        ${platform.bestFor.map(b => `
                                            <span class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">${b}</span>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 text-gray-500">
                                    <span>Min. rozpočet:</span>
                                    <span class="font-semibold text-gray-700">${platform.minBudget}€/deň</span>
                                </div>
                                <div class="flex items-center gap-2 text-gray-500">
                                    <span>Náročnosť:</span>
                                    <span class="font-semibold text-gray-700">${platform.setupDifficulty}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Selected indicator -->
                ${isSelected ? `
                    <div class="h-1 bg-gradient-to-r from-orange-500 to-pink-500"></div>
                ` : ''}
                
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
            platforms.splice(index, 1);
        } else {
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
            
            .platforms-section .platform-card svg {
                flex-shrink: 0;
            }
            
            .package-section .package-calculator {
                margin: 0 -24px;
            }
            
            @media (max-width: 768px) {
                .package-section .package-calculator {
                    margin: 0 -16px;
                }
                
                .platforms-section .platform-card .grid {
                    grid-template-columns: repeat(2, 1fr);
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
        console.log('📋 Onboarding module v2.3 (extended) initialized');
    };
    
    console.log('✅ Onboarding Extension v2.3 loaded!');
    console.log('📊 Sections:', OnboardingModule.SECTIONS.length);
    
})();
