/**
 * ADLIFY PLATFORM - Onboarding Extension v2.0
 * 
 * Rozšírenie existujúceho OnboardingModule o:
 * - Výber balíka (PackageCalculator) - KROK 4
 * - Výber reklamných platforiem (PlatformSelector) - KROK 5
 * - Kontrolu stavu účtov (AccountHealthCheck) - KROK 10
 * 
 * POUŽITIE:
 * 1. Načítaj tento súbor PO onboarding.js
 * 2. Komponenty sa automaticky integrujú
 */

(function() {
    'use strict';
    
    // Počkaj kým sa načíta základný OnboardingModule
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v2.0 loading...');
    
    // Uložíme pôvodné metódy
    const originalRenderCurrentSection = OnboardingModule.renderCurrentSection;
    const originalRenderProgress = OnboardingModule.renderProgress;
    const originalCollectFormData = OnboardingModule.collectFormData;
    const originalValidateCurrentStep = OnboardingModule.validateCurrentStep;
    
    // ==========================================
    // STAV PRE NOVÉ KOMPONENTY
    // ==========================================
    
    OnboardingModule.extensionState = {
        selectedPackage: 'pro', // default
        selectedPeriod: 'monthly', // monthly, 6m, 12m
        selectedPlatforms: [],
        accountStatuses: {},
        componentsInitialized: false
    };
    
    // ==========================================
    // ROZŠÍRENÉ SEKCIE - Nové poradie
    // Balík (krok 4) je PRED platformami (krok 5)
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
        { id: 9, title: 'Prepojenie účtov', icon: '🔗', key: 'connections', isNew: true },
        { id: 10, title: 'Kontaktné údaje', icon: '👤', key: 'contact' },
        { id: 11, title: 'Dodatočné info', icon: '📝', key: 'additional' }
    ];
    
    // Prepísanie SECTIONS
    OnboardingModule.SECTIONS = OnboardingModule.EXTENDED_SECTIONS;
    OnboardingModule.totalSteps = OnboardingModule.EXTENDED_SECTIONS.length;
    
    // ==========================================
    // MAPOVANIE BALÍKOV NA LIMITY PLATFORIEM
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
        
        // Ak je to nová sekcia, použijeme nové renderovanie
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    return this.renderPackageSection();
                case 'platforms':
                    return this.renderPlatformsSection();
                case 'connections':
                    return this.renderConnectionsSection();
            }
        }
        
        // Inak použijeme pôvodné sekcie s upraveným mapovaním
        const originalStepMapping = {
            1: 1,   // Základné info
            2: 2,   // Produkty
            3: 3,   // Cieľová skupina
            6: 4,   // Aktuálny marketing (pôvodne 4)
            7: 5,   // Ciele (pôvodne 5)
            8: 6,   // Obsah (pôvodne 6)
            10: 8,  // Kontakt (pôvodne 8)
            11: 9   // Dodatočné (pôvodne 9)
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
    // SEKCIA: VÝBER BALÍKA (KROK 4)
    // ==========================================
    
    OnboardingModule.renderPackageSection = function() {
        const selected = this.extensionState.selectedPackage || 'pro';
        const period = this.extensionState.selectedPeriod || 'monthly';
        
        return `
            <div class="package-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Vyberte balík služieb, ktorý najlepšie vyhovuje vašim potrebám. 
                        Pri dlhšom období získate zľavu.
                    </p>
                </div>
                
                <!-- Prepínač obdobia -->
                <div class="flex justify-center mb-8">
                    <div class="inline-flex bg-gray-100 rounded-full p-1">
                        <button type="button" onclick="OnboardingModule.selectPeriod('monthly')"
                            class="px-5 py-2 rounded-full text-sm font-medium transition-all ${period === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            Mesačne
                        </button>
                        <button type="button" onclick="OnboardingModule.selectPeriod('6m')"
                            class="px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${period === '6m' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            6 mesiacov <span class="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">-10%</span>
                        </button>
                        <button type="button" onclick="OnboardingModule.selectPeriod('12m')"
                            class="px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${period === '12m' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            12 mesiacov <span class="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">-20%</span>
                        </button>
                    </div>
                </div>
                
                <!-- Balíky -->
                <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${this.renderPackageCards(selected, period)}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.PACKAGES_DATA = {
        starter: {
            id: 'starter',
            name: 'Starter',
            badge: 'Pre začiatok',
            badgeColor: 'orange',
            icon: '🚀',
            price: { monthly: 149, '6m': 134, '12m': 119 },
            description: 'Ideálne pre živnostníkov, ktorí chcú vyskúšať online reklamu',
            features: [
                '1 reklamná platforma',
                '1 kampaň',
                '2 reklamné vizuály',
                'Reklamné texty (copy)',
                'Základná optimalizácia',
                'Mesačný report',
                'Email podpora'
            ],
            platforms: 1
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            badge: 'Najobľúbenejšie',
            badgeColor: 'gradient',
            icon: '⭐',
            popular: true,
            price: { monthly: 249, '6m': 224, '12m': 199 },
            description: 'Pre firmy, ktoré chcú rásť na viacerých platformách',
            features: [
                '2 platformy (FB/IG + Google)',
                'Až 3 kampane súčasne',
                '4 reklamné vizuály',
                'A/B testovanie',
                'Optimalizácia každé 2 týždne',
                'Detailný report',
                'Email + telefón podpora'
            ],
            platforms: 2
        },
        enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            badge: 'Pre firmy',
            badgeColor: 'gray',
            icon: '💎',
            price: { monthly: 399, '6m': 359, '12m': 319 },
            description: 'Pre e-shopy a firmy s vyšším rozpočtom na reklamu',
            features: [
                'Všetky platformy + remarketing',
                'Až 5 kampaní súčasne',
                '8 reklamných vizuálov',
                'Pokročilé A/B testovanie',
                'Týždenná optimalizácia',
                'Strategické konzultácie',
                'Prioritná podpora + WhatsApp'
            ],
            platforms: Infinity
        },
        premium: {
            id: 'premium',
            name: 'Premium',
            badge: 'VIP',
            badgeColor: 'gold',
            icon: '👑',
            isPremium: true,
            priceFrom: true,
            price: { monthly: 799, '6m': 719, '12m': 639 },
            description: 'Individuálna cena podľa rozsahu a potrieb vášho projektu',
            features: [
                'Všetky platformy + remarketing',
                'Neobmedzený počet kampaní',
                'Neobmedzené vizuály',
                'Dedikovaný account manager',
                'Denná optimalizácia',
                'Mesačné strategické stretnutia',
                '24/7 VIP podpora'
            ],
            platforms: Infinity
        }
    };
    
    OnboardingModule.renderPackageCards = function(selected, period) {
        return Object.values(this.PACKAGES_DATA).map(pkg => {
            const isSelected = selected === pkg.id;
            const price = pkg.price[period];
            
            // Štýly podľa typu balíka
            let cardClass = 'bg-white border-2 border-gray-200';
            let textColor = 'text-gray-800';
            let nameColor = pkg.id === 'starter' ? 'text-gray-800' : (pkg.id === 'enterprise' ? 'text-gray-800' : '');
            let featureTextColor = 'text-gray-600';
            let checkColor = 'text-green-500';
            let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
            
            if (pkg.popular) {
                cardClass = 'bg-gray-900 border-2 border-gray-900';
                textColor = 'text-white';
                nameColor = 'text-orange-500';
                featureTextColor = 'text-gray-300';
                checkColor = 'text-green-400';
                btnClass = isSelected ? 'bg-orange-500 text-white' : 'bg-white/10 text-white border border-orange-500 hover:bg-orange-500 hover:text-white';
            }
            
            if (pkg.isPremium) {
                cardClass = 'bg-gradient-to-br from-orange-500 to-amber-500 border-2 border-orange-400';
                textColor = 'text-white';
                nameColor = 'text-amber-200';
                featureTextColor = 'text-white/90';
                checkColor = 'text-amber-200';
                btnClass = isSelected ? 'bg-white text-orange-600' : 'bg-white/20 text-white border border-white/50 hover:bg-white hover:text-orange-600';
            }
            
            if (isSelected && !pkg.popular && !pkg.isPremium) {
                cardClass = 'bg-orange-50 border-2 border-orange-500';
            }
            
            // Badge štýly
            let badgeClass = 'bg-gray-100 text-gray-600';
            if (pkg.badgeColor === 'gradient') badgeClass = 'bg-gradient-to-r from-orange-500 to-pink-500 text-white';
            if (pkg.badgeColor === 'gold') badgeClass = 'bg-amber-100 text-amber-700';
            if (pkg.badgeColor === 'orange') badgeClass = 'bg-orange-100 text-orange-600';
            
            return `
                <div class="relative rounded-2xl p-5 transition-all hover:shadow-lg cursor-pointer ${cardClass}"
                    onclick="OnboardingModule.selectPackage('${pkg.id}')">
                    
                    <!-- Badge -->
                    <div class="absolute -top-3 ${pkg.popular || pkg.isPremium ? 'left-1/2 -translate-x-1/2' : 'left-4'}">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full ${badgeClass}">
                            ${pkg.badge}
                        </span>
                    </div>
                    
                    <!-- Icon & Name -->
                    <div class="mt-3 mb-4">
                        <span class="text-3xl">${pkg.icon}</span>
                        <h3 class="text-xl font-bold mt-2 ${nameColor}">${pkg.name}</h3>
                    </div>
                    
                    <!-- Price -->
                    <div class="mb-3">
                        <span class="text-3xl font-bold ${textColor}">
                            ${pkg.priceFrom ? 'od ' : ''}${price}€
                        </span>
                        <span class="${pkg.popular || pkg.isPremium ? 'text-white/70' : 'text-gray-500'}">/mes</span>
                        ${period !== 'monthly' ? `
                            <p class="text-xs ${pkg.popular || pkg.isPremium ? 'text-white/60' : 'text-gray-400'} mt-1">
                                Pri platbe na ${period === '6m' ? '6' : '12'} mesiacov
                            </p>
                        ` : ''}
                    </div>
                    
                    <!-- Description -->
                    <p class="text-sm ${pkg.popular || pkg.isPremium ? 'text-white/80' : 'text-gray-500'} mb-4">
                        ${pkg.description}
                    </p>
                    
                    <!-- Features -->
                    <ul class="space-y-2 mb-5">
                        ${pkg.features.map(f => `
                            <li class="flex items-start gap-2 text-sm ${featureTextColor}">
                                <span class="${checkColor} mt-0.5">✓</span>
                                <span>${f}</span>
                            </li>
                        `).join('')}
                    </ul>
                    
                    <!-- Button -->
                    <button type="button" class="w-full py-3 rounded-xl font-semibold transition-all ${btnClass}">
                        ${pkg.isPremium ? 'Kontaktujte nás' : (isSelected ? '✓ Vybraný' : 'Vybrať ' + pkg.name)}
                    </button>
                    
                    <input type="radio" name="selected_package" value="${pkg.id}" 
                        ${isSelected ? 'checked' : ''} class="sr-only">
                </div>
            `;
        }).join('');
    };
    
    OnboardingModule.selectPeriod = function(period) {
        this.extensionState.selectedPeriod = period;
        this.formData.billing_period = period;
        this.rerender();
    };
    
    OnboardingModule.selectPackage = function(packageId) {
        this.extensionState.selectedPackage = packageId;
        this.formData.selected_package = packageId;
        
        // Ulož aj cenu
        const period = this.extensionState.selectedPeriod || 'monthly';
        const pkg = this.PACKAGES_DATA[packageId];
        if (pkg) {
            this.formData.package_price = pkg.price[period];
        }
        
        // Update platform limit
        const limit = this.PACKAGE_PLATFORM_LIMITS[packageId] || 1;
        
        // Ak má viac platforiem ako nový limit, orezať
        if (this.extensionState.selectedPlatforms.length > limit && limit !== Infinity) {
            this.extensionState.selectedPlatforms = this.extensionState.selectedPlatforms.slice(0, limit);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
        }
        
        this.rerender();
    };
    
    // Fallback pre kompatibilitu
    OnboardingModule.selectPackageFallback = function(packageId) {
        this.selectPackage(packageId);
    };
    
    OnboardingModule.renderPackageCardsFallback = function() {
        const selected = this.extensionState.selectedPackage || 'pro';
        const period = this.extensionState.selectedPeriod || 'monthly';
        return this.renderPackageCards(selected, period);
    };
    
    // ==========================================
    // SEKCIA: PLATFORMY (KROK 5)
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
                
                <!-- Container pre PlatformSelector -->
                <div id="onboarding-platform-selector"></div>
                
                <!-- Fallback ak komponenty nie sú načítané -->
                <div id="platforms-fallback" class="hidden">
                    ${this.renderPlatformsFallback()}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformsFallback = function() {
        const platforms = [
            { id: 'google_ads', name: 'Google Ads', icon: '🔍', desc: 'Search, Display, YouTube' },
            { id: 'facebook', name: 'Meta (Facebook/IG)', icon: '📘', desc: 'Feed, Stories, Reels' },
            { id: 'linkedin', name: 'LinkedIn Ads', icon: '💼', desc: 'B2B reklamy' },
            { id: 'tiktok', name: 'TikTok Ads', icon: '🎵', desc: 'Video reklamy' }
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
                Vybrané: ${selected.length}/${limit === Infinity ? '∞' : limit}
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
                } else {
                    alert(`Váš balík umožňuje max. ${limit} platformy`);
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
    // SEKCIA: PREPOJENIE ÚČTOV (KROK 9)
    // ==========================================
    
    OnboardingModule.renderConnectionsSection = function() {
        const platforms = this.extensionState.selectedPlatforms || [];
        const accountsNeeded = this.getRequiredAccounts(platforms);
        
        return `
            <div class="connections-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Pre správne fungovanie kampaní potrebujeme prístup k vašim účtom.
                        Ak účty ešte nemáte, pomôžeme vám ich vytvoriť.
                    </p>
                </div>
                
                <!-- Container pre AccountHealthCheck -->
                <div id="onboarding-health-check"></div>
                
                <!-- Fallback -->
                <div id="connections-fallback" class="hidden">
                    <div class="space-y-4">
                        ${accountsNeeded.length > 0 
                            ? accountsNeeded.map(acc => this.renderAccountConnectionCard(acc)).join('') 
                            : '<p class="text-gray-500 text-center py-4">Najprv vyberte platformy v predchádzajúcom kroku.</p>'
                        }
                    </div>
                    
                    ${accountsNeeded.length > 0 ? `
                        <div class="mt-6 p-4 bg-blue-50 rounded-xl">
                            <p class="text-sm text-blue-800">
                                💡 <strong>Tip:</strong> Ak potrebujete pomoc s nastavením účtov, 
                                náš tím vám rád pomôže po dokončení onboardingu.
                            </p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.getRequiredAccounts = function(platforms) {
        const accountMap = {
            google_ads: [
                { id: 'google_ads', name: 'Google Ads', icon: '🔍' },
                { id: 'google_analytics', name: 'Google Analytics 4', icon: '📊' },
                { id: 'gtm', name: 'Google Tag Manager', icon: '🏷️' }
            ],
            facebook: [
                { id: 'meta_business', name: 'Meta Business Manager', icon: '📘' },
                { id: 'meta_pixel', name: 'Meta Pixel', icon: '📍' }
            ],
            instagram: [
                { id: 'meta_business', name: 'Meta Business Manager', icon: '📘' }
            ],
            linkedin: [
                { id: 'linkedin_ads', name: 'LinkedIn Ads', icon: '💼' }
            ],
            tiktok: [
                { id: 'tiktok_ads', name: 'TikTok Ads Manager', icon: '🎵' }
            ]
        };
        
        const accounts = new Map();
        platforms.forEach(p => {
            (accountMap[p] || []).forEach(acc => {
                if (!accounts.has(acc.id)) {
                    accounts.set(acc.id, acc);
                }
            });
        });
        
        return Array.from(accounts.values());
    };
    
    OnboardingModule.renderAccountConnectionCard = function(account) {
        const status = this.formData[`has_${account.id}`] || 'unknown';
        const statusLabels = {
            'yes': { icon: '✅', label: 'Mám účet', class: 'bg-green-100 text-green-800' },
            'no': { icon: '❌', label: 'Nemám účet', class: 'bg-red-100 text-red-800' },
            'unknown': { icon: '❓', label: 'Neviem', class: 'bg-gray-100 text-gray-800' }
        };
        
        const s = statusLabels[status] || statusLabels.unknown;
        
        return `
            <div class="p-4 border rounded-xl">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${account.icon}</span>
                        <div>
                            <h4 class="font-medium">${account.name}</h4>
                            <span class="text-xs px-2 py-1 rounded-full ${s.class}">${s.icon} ${s.label}</span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" onclick="OnboardingModule.setAccountStatus('${account.id}', 'yes')"
                            class="px-3 py-1 text-sm rounded-lg ${status === 'yes' ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}">
                            Mám
                        </button>
                        <button type="button" onclick="OnboardingModule.setAccountStatus('${account.id}', 'no')"
                            class="px-3 py-1 text-sm rounded-lg ${status === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}">
                            Nemám
                        </button>
                    </div>
                </div>
                
                ${status === 'yes' ? `
                    <div class="mt-3 pt-3 border-t">
                        <label class="block text-sm text-gray-600 mb-1">ID účtu (voliteľné):</label>
                        <input type="text" name="${account.id}_account_id" 
                            value="${this.formData[`${account.id}_account_id`] || ''}"
                            class="w-full p-2 text-sm border rounded-lg"
                            placeholder="Napr. 123-456-7890">
                    </div>
                ` : ''}
                
                ${status === 'no' ? `
                    <div class="mt-3 pt-3 border-t">
                        <a href="#" class="text-sm text-orange-600 hover:underline" 
                            onclick="OnboardingModule.showSetupGuide('${account.id}'); return false;">
                            📖 Zobraziť návod na vytvorenie účtu
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    };
    
    OnboardingModule.setAccountStatus = function(accountId, status) {
        this.formData[`has_${accountId}`] = status;
        this.rerender();
    };
    
    OnboardingModule.showSetupGuide = function(accountId) {
        const guides = {
            google_ads: 'https://support.google.com/google-ads/answer/6366720',
            google_analytics: 'https://support.google.com/analytics/answer/9304153',
            gtm: 'https://support.google.com/tagmanager/answer/6103696',
            meta_business: 'https://www.facebook.com/business/help/1710077379203657',
            meta_pixel: 'https://www.facebook.com/business/help/952192354843755',
            linkedin_ads: 'https://www.linkedin.com/help/lms/answer/a426102',
            tiktok_ads: 'https://ads.tiktok.com/help/article?aid=9678'
        };
        
        const url = guides[accountId];
        if (url) {
            window.open(url, '_blank');
        } else {
            if (typeof Utils !== 'undefined') {
                Utils.toast('Návod bude čoskoro dostupný', 'info');
            }
        }
    };
    
    // ==========================================
    // INICIALIZÁCIA KOMPONENTOV
    // ==========================================
    
    OnboardingModule.initExtensionComponents = function() {
        const hasPlatformSelector = typeof window.PlatformSelector !== 'undefined';
        const hasPackageCalculator = typeof window.PackageCalculator !== 'undefined';
        const hasHealthCheck = typeof window.AccountHealthCheck !== 'undefined';
        
        console.log('📦 Extension components:', {
            PlatformSelector: hasPlatformSelector,
            PackageCalculator: hasPackageCalculator,
            AccountHealthCheck: hasHealthCheck
        });
        
        // Inicializuj PackageCalculator
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
                    
                    // Update platform limit v PlatformSelector
                    if (hasPlatformSelector && PlatformSelector.container) {
                        PlatformSelector.setMaxPlatforms(pkg.limits.platforms);
                    }
                }
            });
        } else if (document.getElementById('package-fallback')) {
            document.getElementById('package-fallback')?.classList.remove('hidden');
        }
        
        // Inicializuj PlatformSelector
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
                    } else if (typeof Utils !== 'undefined') {
                        Utils.toast(`Váš balík podporuje max. ${limit} platformy. Zvážte upgrade.`, 'warning');
                    }
                }
            });
        } else if (document.getElementById('platforms-fallback')) {
            document.getElementById('platforms-fallback')?.classList.remove('hidden');
        }
        
        // Inicializuj AccountHealthCheck
        if (hasHealthCheck && document.getElementById('onboarding-health-check')) {
            document.getElementById('connections-fallback')?.classList.add('hidden');
            
            const requiredAccounts = this.getRequiredAccounts(this.extensionState.selectedPlatforms || []);
            
            if (requiredAccounts.length > 0) {
                AccountHealthCheck.init('onboarding-health-check', {
                    accounts: requiredAccounts.map(a => a.id),
                    showDetails: true,
                    autoCheck: false,
                    onStatusChange: (accId, status) => {
                        this.extensionState.accountStatuses[accId] = status;
                    }
                });
            }
        } else if (document.getElementById('connections-fallback')) {
            document.getElementById('connections-fallback')?.classList.remove('hidden');
        }
        
        this.extensionState.componentsInitialized = true;
    };
    
    OnboardingModule.detectClientType = function() {
        const industry = this.formData.company_industry || '';
        
        if (industry.includes('E-commerce') || industry.includes('Maloobchod')) {
            return 'ecommerce';
        }
        if (industry.includes('B2B') || industry.includes('IT')) {
            return 'b2b';
        }
        return 'local_business';
    };
    
    // ==========================================
    // OVERRIDE RERENDER
    // ==========================================
    
    const originalRerender = OnboardingModule.rerender;
    
    OnboardingModule.rerender = function() {
        originalRerender.call(this);
        
        setTimeout(() => {
            this.initExtensionComponents();
        }, 100);
    };
    
    // ==========================================
    // OVERRIDE COLLECT FORM DATA
    // ==========================================
    
    OnboardingModule.collectFormData = function() {
        if (originalCollectFormData) {
            originalCollectFormData.call(this);
        }
        
        // Pridaj dáta z nových komponentov
        this.formData.selected_package = this.extensionState.selectedPackage || 'pro';
        this.formData.selected_platforms = this.extensionState.selectedPlatforms || [];
        
        // Zozbieraj údaje z formulárov
        const form = document.getElementById('onboarding-form');
        if (form) {
            const formData = new FormData(form);
            
            // Balík (fallback)
            if (formData.get('selected_package')) {
                this.formData.selected_package = formData.get('selected_package');
                this.extensionState.selectedPackage = formData.get('selected_package');
            }
            
            // Platformy (fallback)
            if (!this.formData.selected_platforms.length) {
                const platforms = [];
                ['google_ads', 'facebook', 'instagram', 'linkedin', 'tiktok'].forEach(p => {
                    if (formData.has(`platform_${p}`)) {
                        platforms.push(p);
                    }
                });
                if (platforms.length > 0) {
                    this.formData.selected_platforms = platforms;
                    this.extensionState.selectedPlatforms = platforms;
                }
            }
            
            // Účty
            ['google_ads', 'google_analytics', 'gtm', 'meta_business', 'meta_pixel', 'linkedin_ads', 'tiktok_ads'].forEach(acc => {
                const accountId = formData.get(`${acc}_account_id`);
                if (accountId) {
                    this.formData[`${acc}_account_id`] = accountId;
                }
            });
        }
    };
    
    // ==========================================
    // OVERRIDE VALIDATE
    // ==========================================
    
    OnboardingModule.validateCurrentStep = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        // Validácia pre nové sekcie
        if (section?.isNew) {
            switch (section.key) {
                case 'package':
                    if (!this.extensionState.selectedPackage) {
                        if (typeof Utils !== 'undefined') {
                            Utils.toast('Vyberte balík služieb', 'warning');
                        }
                        return false;
                    }
                    return true;
                    
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms?.length) {
                        if (typeof Utils !== 'undefined') {
                            Utils.toast('Vyberte aspoň jednu platformu', 'warning');
                        }
                        return false;
                    }
                    
                    // Skontroluj limit
                    const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage];
                    if (this.extensionState.selectedPlatforms.length > limit && limit !== Infinity) {
                        if (typeof Utils !== 'undefined') {
                            Utils.toast(`Váš balík umožňuje max. ${limit} platformy`, 'warning');
                        }
                        return false;
                    }
                    return true;
                    
                case 'connections':
                    // Voliteľné
                    return true;
            }
        }
        
        return originalValidateCurrentStep ? originalValidateCurrentStep.call(this) : true;
    };
    
    // ==========================================
    // CSS INJECTION
    // ==========================================
    
    OnboardingModule.injectExtensionStyles = function() {
        if (document.getElementById('onboarding-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboarding-extension-styles';
        style.textContent = `
            /* Platform Selector Integration */
            .platforms-section .platform-selector {
                margin: 0 -24px;
            }
            
            /* Package Calculator Integration */
            .package-section .package-calculator {
                margin: 0 -24px;
            }
            
            /* Health Check Integration */
            .connections-section .health-check {
                margin: 0 -24px;
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .platforms-section .platform-selector,
                .package-section .package-calculator,
                .connections-section .health-check {
                    margin: 0 -16px;
                }
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
        console.log('📋 Onboarding module v2.0 (extended) initialized');
    };
    
    console.log('✅ Onboarding Extension v2.0 loaded successfully!');
    console.log('📊 Extended sections:', OnboardingModule.SECTIONS.length);
    
})();
