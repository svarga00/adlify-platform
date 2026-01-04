/**
 * ADLIFY PLATFORM - Onboarding Extension v2.0
 * 
 * Rozšírenie existujúceho OnboardingModule o:
 * - Výber reklamných platforiem (PlatformSelector)
 * - Kalkuláciu balíka s upsell (PackageCalculator)
 * - Kontrolu stavu účtov (AccountHealthCheck)
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
    
    // ==========================================
    // ROZŠÍRENIE SEKCIÍ
    // ==========================================
    
    // Nové sekcie na pridanie (vložíme ich medzi existujúce)
    const NEW_SECTIONS = [
        { id: 'platforms', title: 'Reklamné platformy', icon: '📱', key: 'platforms', position: 4 },
        { id: 'package', title: 'Výber balíka', icon: '📦', key: 'package', position: 5 },
        { id: 'connections', title: 'Prepojenie účtov', icon: '🔗', key: 'connections', position: 10 }
    ];
    
    // Uložíme pôvodnú metódu
    const originalRenderCurrentSection = OnboardingModule.renderCurrentSection;
    const originalRenderProgress = OnboardingModule.renderProgress;
    const originalCollectFormData = OnboardingModule.collectFormData;
    const originalValidateCurrentStep = OnboardingModule.validateCurrentStep;
    
    // ==========================================
    // STAV PRE NOVÉ KOMPONENTY
    // ==========================================
    
    OnboardingModule.extensionState = {
        selectedPlatforms: [],
        selectedPackage: null,
        accountStatuses: {},
        componentsInitialized: false
    };
    
    // ==========================================
    // EXTENDED SECTIONS
    // ==========================================
    
    // Rozšírené SECTIONS (pridáme nové sekcie)
    OnboardingModule.EXTENDED_SECTIONS = [
        { id: 1, title: 'Základné informácie', icon: '🏢', key: 'company' },
        { id: 2, title: 'Produkty a služby', icon: '📦', key: 'products' },
        { id: 3, title: 'Cieľová skupina', icon: '🎯', key: 'audience' },
        { id: 4, title: 'Reklamné platformy', icon: '📱', key: 'platforms', isNew: true },
        { id: 5, title: 'Výber balíka', icon: '💎', key: 'package', isNew: true },
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
    // OVERRIDE RENDER CURRENT SECTION
    // ==========================================
    
    OnboardingModule.renderCurrentSection = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        
        // Ak je to nová sekcia, použijeme nové renderovanie
        if (section?.isNew) {
            switch (section.key) {
                case 'platforms':
                    return this.renderPlatformsSection();
                case 'package':
                    return this.renderPackageSection();
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
            // Dočasne nastavíme pôvodný krok
            const currentBackup = this.currentStep;
            this.currentStep = originalStep;
            const result = originalRenderCurrentSection.call(this);
            this.currentStep = currentBackup;
            return result;
        }
        
        return '<div class="text-center py-8 text-gray-500">Sekcia sa načítava...</div>';
    };
    
    // ==========================================
    // NOVÁ SEKCIA: PLATFORMY
    // ==========================================
    
    OnboardingModule.renderPlatformsSection = function() {
        return `
            <div class="platforms-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Vyberte platformy, na ktorých chcete propagovať váš biznis. 
                        Pomôže nám to pripraviť optimálnu stratégiu.
                    </p>
                </div>
                
                <!-- Container pre PlatformSelector -->
                <div id="onboarding-platform-selector"></div>
                
                <!-- Fallback ak komponenty nie sú načítané -->
                <div id="platforms-fallback" class="hidden">
                    <p class="text-sm text-gray-500 mb-4">Ktoré platformy chcete využívať?</p>
                    <div class="grid md:grid-cols-2 gap-3">
                        ${this.MARKETING_CHANNELS.filter(ch => 
                            ['google_ads', 'facebook', 'instagram', 'linkedin', 'tiktok'].includes(ch.value)
                        ).map(ch => `
                            <label class="flex items-center p-4 border rounded-xl cursor-pointer hover:bg-gray-50 
                                ${(this.extensionState.selectedPlatforms || []).includes(ch.value) ? 'border-orange-500 bg-orange-50' : ''}">
                                <input type="checkbox" name="platform_${ch.value}" value="${ch.value}" 
                                    ${(this.extensionState.selectedPlatforms || []).includes(ch.value) ? 'checked' : ''}
                                    class="w-5 h-5 mr-3 accent-orange-500"
                                    onchange="OnboardingModule.togglePlatformFallback('${ch.value}')">
                                <span class="font-medium">${ch.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    };
    
    // Fallback toggle pre platformy
    OnboardingModule.togglePlatformFallback = function(platformId) {
        const platforms = this.extensionState.selectedPlatforms || [];
        const index = platforms.indexOf(platformId);
        
        if (index > -1) {
            platforms.splice(index, 1);
        } else {
            platforms.push(platformId);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
    };
    
    // ==========================================
    // NOVÁ SEKCIA: BALÍKY
    // ==========================================
    
    OnboardingModule.renderPackageSection = function() {
        const platforms = this.extensionState.selectedPlatforms || [];
        
        return `
            <div class="package-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Na základe vášho výberu vám odporúčame vhodný balík služieb.
                    </p>
                    ${platforms.length > 0 ? `
                        <p class="text-sm text-gray-500 mt-2">
                            Vybrané platformy: <strong>${platforms.join(', ')}</strong>
                        </p>
                    ` : ''}
                </div>
                
                <!-- Container pre PackageCalculator -->
                <div id="onboarding-package-calculator"></div>
                
                <!-- Fallback -->
                <div id="package-fallback" class="hidden">
                    <div class="grid md:grid-cols-3 gap-4">
                        ${this.renderPackageCards()}
                    </div>
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPackageCards = function() {
        const packages = [
            { id: 'starter', name: 'STARTER', price: 149, platforms: 2, icon: '🚀', color: '#10b981' },
            { id: 'professional', name: 'PROFESSIONAL', price: 329, platforms: 4, icon: '⭐', color: '#6366f1', popular: true },
            { id: 'premium', name: 'PREMIUM', price: 929, platforms: 'Neobmedzené', icon: '👑', color: '#f59e0b' }
        ];
        
        const selected = this.extensionState.selectedPackage || 'starter';
        
        return packages.map(pkg => `
            <div class="relative p-6 border-2 rounded-2xl cursor-pointer transition-all
                ${selected === pkg.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                ${pkg.popular ? 'ring-2 ring-orange-500 ring-offset-2' : ''}"
                onclick="OnboardingModule.selectPackageFallback('${pkg.id}')">
                ${pkg.popular ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">Najpopulárnejší</div>' : ''}
                <div class="text-center">
                    <span class="text-3xl">${pkg.icon}</span>
                    <h3 class="text-xl font-bold mt-2" style="color: ${pkg.color}">${pkg.name}</h3>
                    <p class="text-3xl font-bold mt-2">€${pkg.price}<span class="text-sm font-normal text-gray-500">/mes</span></p>
                    <p class="text-sm text-gray-500 mt-2">${pkg.platforms} platformy</p>
                </div>
                <div class="mt-4 pt-4 border-t">
                    <input type="radio" name="selected_package" value="${pkg.id}" 
                        ${selected === pkg.id ? 'checked' : ''} class="sr-only">
                    <div class="w-full py-2 text-center rounded-xl ${selected === pkg.id ? 'bg-orange-500 text-white' : 'bg-gray-100'}">
                        ${selected === pkg.id ? '✓ Vybraný' : 'Vybrať'}
                    </div>
                </div>
            </div>
        `).join('');
    };
    
    OnboardingModule.selectPackageFallback = function(packageId) {
        this.extensionState.selectedPackage = packageId;
        this.formData.selected_package = packageId;
        this.rerender();
    };
    
    // ==========================================
    // NOVÁ SEKCIA: PREPOJENIE ÚČTOV
    // ==========================================
    
    OnboardingModule.renderConnectionsSection = function() {
        const platforms = this.extensionState.selectedPlatforms || [];
        
        // Mapovanie platforiem na potrebné účty
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
                        ${accountsNeeded.map(acc => this.renderAccountConnectionCard(acc)).join('')}
                    </div>
                    
                    <div class="mt-6 p-4 bg-blue-50 rounded-xl">
                        <p class="text-sm text-blue-800">
                            💡 <strong>Tip:</strong> Ak potrebujete pomoc s nastavením účtov, 
                            náš tím vám rád pomôže po dokončení onboardingu.
                        </p>
                    </div>
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
            Utils.toast('Návod bude čoskoro dostupný', 'info');
        }
    };
    
    // ==========================================
    // INICIALIZÁCIA KOMPONENTOV
    // ==========================================
    
    OnboardingModule.initExtensionComponents = function() {
        // Skontroluj či sú komponenty načítané
        const hasPlatformSelector = typeof window.PlatformSelector !== 'undefined';
        const hasPackageCalculator = typeof window.PackageCalculator !== 'undefined';
        const hasHealthCheck = typeof window.AccountHealthCheck !== 'undefined';
        
        console.log('📦 Extension components:', {
            PlatformSelector: hasPlatformSelector,
            PackageCalculator: hasPackageCalculator,
            AccountHealthCheck: hasHealthCheck
        });
        
        // Inicializuj PlatformSelector
        if (hasPlatformSelector && document.getElementById('onboarding-platform-selector')) {
            document.getElementById('platforms-fallback')?.classList.add('hidden');
            
            PlatformSelector.init('onboarding-platform-selector', {
                maxPlatforms: this.getPackageLimit(),
                clientType: this.detectClientType(),
                preselected: this.extensionState.selectedPlatforms || [],
                onChange: (platforms) => {
                    this.extensionState.selectedPlatforms = platforms;
                    this.formData.selected_platforms = platforms;
                    
                    // Update PackageCalculator ak existuje
                    if (hasPackageCalculator && PackageCalculator.container) {
                        PackageCalculator.updatePlatforms(platforms);
                    }
                },
                onLimitExceeded: (platforms, limit) => {
                    // Trigger upsell
                    if (hasPackageCalculator) {
                        PackageCalculator.showUpgradeModal();
                    } else {
                        Utils.toast(`Váš balík podporuje max. ${limit} platformy. Zvážte upgrade.`, 'warning');
                    }
                }
            });
        } else if (document.getElementById('platforms-fallback')) {
            document.getElementById('platforms-fallback')?.classList.remove('hidden');
        }
        
        // Inicializuj PackageCalculator
        if (hasPackageCalculator && document.getElementById('onboarding-package-calculator')) {
            document.getElementById('package-fallback')?.classList.add('hidden');
            
            PackageCalculator.init('onboarding-package-calculator', {
                platforms: this.extensionState.selectedPlatforms || [],
                showComparison: true,
                onPackageChange: (pkg) => {
                    this.extensionState.selectedPackage = pkg.id;
                    this.formData.selected_package = pkg.id;
                    this.formData.package_price = pkg.price;
                    
                    // Update platform limit
                    if (hasPlatformSelector && PlatformSelector.container) {
                        PlatformSelector.setMaxPlatforms(pkg.limits.platforms);
                    }
                },
                onUpgrade: (pkg) => {
                    Utils.toast(`Balík zmenený na ${pkg.name}`, 'success');
                }
            });
        } else if (document.getElementById('package-fallback')) {
            document.getElementById('package-fallback')?.classList.remove('hidden');
        }
        
        // Inicializuj AccountHealthCheck
        if (hasHealthCheck && document.getElementById('onboarding-health-check')) {
            document.getElementById('connections-fallback')?.classList.add('hidden');
            
            const requiredAccounts = this.getRequiredAccounts(this.extensionState.selectedPlatforms || []);
            
            AccountHealthCheck.init('onboarding-health-check', {
                accounts: requiredAccounts.map(a => a.id),
                showDetails: true,
                autoCheck: false, // Manuálna kontrola v onboardingu
                onStatusChange: (accId, status) => {
                    this.extensionState.accountStatuses[accId] = status;
                }
            });
        } else if (document.getElementById('connections-fallback')) {
            document.getElementById('connections-fallback')?.classList.remove('hidden');
        }
        
        this.extensionState.componentsInitialized = true;
    };
    
    OnboardingModule.getPackageLimit = function() {
        const pkg = this.extensionState.selectedPackage || 'starter';
        const limits = { starter: 2, professional: 4, premium: Infinity };
        return limits[pkg] || 2;
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
        
        // Po rerenderovaní inicializuj komponenty
        setTimeout(() => {
            this.initExtensionComponents();
        }, 100);
    };
    
    // ==========================================
    // OVERRIDE COLLECT FORM DATA
    // ==========================================
    
    OnboardingModule.collectFormData = function() {
        // Zavolaj pôvodnú metódu
        if (originalCollectFormData) {
            originalCollectFormData.call(this);
        }
        
        // Pridaj dáta z nových komponentov
        this.formData.selected_platforms = this.extensionState.selectedPlatforms || [];
        this.formData.selected_package = this.extensionState.selectedPackage || 'starter';
        
        // Zozbieraj údaje z formulárov
        const form = document.getElementById('onboarding-form');
        if (form) {
            const formData = new FormData(form);
            
            // Platformy (fallback)
            if (!this.formData.selected_platforms.length) {
                const platforms = [];
                ['google_ads', 'facebook', 'instagram', 'linkedin', 'tiktok'].forEach(p => {
                    if (formData.has(`platform_${p}`)) {
                        platforms.push(p);
                    }
                });
                this.formData.selected_platforms = platforms;
                this.extensionState.selectedPlatforms = platforms;
            }
            
            // Balík (fallback)
            if (formData.get('selected_package')) {
                this.formData.selected_package = formData.get('selected_package');
                this.extensionState.selectedPackage = formData.get('selected_package');
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
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms?.length) {
                        Utils.toast('Vyberte aspoň jednu platformu', 'warning');
                        return false;
                    }
                    return true;
                    
                case 'package':
                    if (!this.extensionState.selectedPackage) {
                        Utils.toast('Vyberte balík služieb', 'warning');
                        return false;
                    }
                    return true;
                    
                case 'connections':
                    // Voliteľné - môže pokračovať aj bez
                    return true;
            }
        }
        
        // Pôvodná validácia s upraveným mapovaním
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
            
            /* New section badges */
            .section-badge-new {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                background: linear-gradient(135deg, #f97316, #ec4899);
                color: white;
                font-size: 10px;
                font-weight: 700;
                border-radius: 9999px;
                margin-left: 8px;
            }
        `;
        
        document.head.appendChild(style);
    };
    
    // ==========================================
    // INIT
    // ==========================================
    
    // Injektuj štýly
    OnboardingModule.injectExtensionStyles();
    
    // Override original init ak je potrebné
    const originalInit = OnboardingModule.init;
    OnboardingModule.init = function() {
        if (originalInit) originalInit.call(this);
        console.log('📋 Onboarding module v2.0 (extended) initialized');
    };
    
    console.log('✅ Onboarding Extension v2.0 loaded successfully!');
    console.log('📊 Extended sections:', OnboardingModule.SECTIONS.length);
    
})();
