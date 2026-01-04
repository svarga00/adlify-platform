/**
 * ADLIFY PLATFORM - Onboarding Extension v2.4
 * 
 * Rozšírenie existujúceho OnboardingModule o:
 * - Výber balíka - KROK 4
 * - Výber reklamných platforiem (s modalom) - KROK 5
 * - Technické možnosti - KROK 9
 */

(function() {
    'use strict';
    
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v2.4 loading...');
    
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
    // DEFINÍCIA PLATFORIEM
    // ==========================================
    
    OnboardingModule.PLATFORMS = {
        google_ads: {
            id: 'google_ads',
            name: 'Google Ads',
            color: '#4285F4',
            shortDesc: 'Search, Display, YouTube, Shopping',
            description: 'Najväčšia reklamná sieť na svete. Oslovte zákazníkov presne vtedy, keď hľadajú vaše produkty alebo služby.',
            features: [
                { name: 'Search', desc: 'Textové reklamy vo výsledkoch vyhľadávania Google' },
                { name: 'Display', desc: 'Bannerové reklamy na miliónoch partnerských webov' },
                { name: 'YouTube', desc: 'Video reklamy pred a počas videí' },
                { name: 'Shopping', desc: 'Produktové reklamy s obrázkom a cenou' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'B2B'],
            recommended: ['local_business', 'ecommerce', 'b2b']
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            color: '#0081FB',
            shortDesc: 'Facebook, Instagram - Feed, Stories, Reels',
            description: 'Facebook a Instagram reklamy s najpresnejším cielením podľa záujmov a správania. Ideálne pre budovanie značky.',
            features: [
                { name: 'Feed', desc: 'Reklamy priamo v hlavnom feede používateľov' },
                { name: 'Stories', desc: 'Fullscreen formát pre Stories na FB aj IG' },
                { name: 'Reels', desc: 'Krátke video reklamy v populárnom formáte' },
                { name: 'Messenger', desc: 'Reklamy a chatboty v Messengeri' }
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
                { name: 'Sponsored Content', desc: 'Natívne príspevky priamo vo feede' },
                { name: 'InMail', desc: 'Priame správy do LinkedIn schránky' },
                { name: 'Lead Gen Forms', desc: 'Predvyplnené formuláre pre zber kontaktov' },
                { name: 'Text Ads', desc: 'Textové reklamy v pravom paneli' }
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
                { name: 'In-Feed', desc: 'Video reklamy v hlavnom feede For You' },
                { name: 'TopView', desc: 'Premium umiestnenie pri otvorení apky' },
                { name: 'Spark Ads', desc: 'Propagácia organického obsahu' },
                { name: 'Branded Effects', desc: 'Vlastné filtre a efekty pre značku' }
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
    // SEKCIA: VÝBER BALÍKA
    // ==========================================
    
    OnboardingModule.renderPackageSection = function() {
        return `
            <div class="package-section">
                <div class="mb-6">
                    <p class="text-gray-600">
                        Vyberte balík služieb, ktorý najlepšie vyhovuje vašim potrebám.
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
            { id: 'starter', name: 'Starter', price: 149, platforms: 1, icon: '🚀', color: '#3B82F6', features: ['1 platforma', '1 kampaň', '2 vizuály', 'Mesačný report'] },
            { id: 'pro', name: 'Pro', price: 249, platforms: 2, icon: '⭐', color: '#F97316', popular: true, features: ['2 platformy', '3 kampane', '4 vizuály', 'A/B testovanie'] },
            { id: 'enterprise', name: 'Enterprise', price: 399, platforms: 'Všetky', icon: '💎', color: '#8B5CF6', features: ['Všetky platformy', '5 kampaní', '8 vizuálov', 'Remarketing'] },
            { id: 'premium', name: 'Premium', price: 799, platforms: 'Všetky', icon: '👑', color: '#F59E0B', priceFrom: true, features: ['Všetky platformy', 'Neobmedzené', 'Dedikovaný manager', '24/7 podpora'] }
        ];
        
        const selected = this.extensionState.selectedPackage || 'pro';
        
        return `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                ${packages.map(pkg => `
                    <div class="relative p-4 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-lg
                        ${selected === pkg.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                        ${pkg.popular ? 'bg-gray-900 text-white border-gray-900' : ''}"
                        onclick="OnboardingModule.selectPackageFallback('${pkg.id}')">
                        ${pkg.popular ? '<div class="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-bold rounded-full whitespace-nowrap">Najobľúbenejšie</div>' : ''}
                        <div class="text-center mb-3">
                            <span class="text-2xl">${pkg.icon}</span>
                            <h3 class="text-base font-bold mt-1" style="color: ${pkg.popular ? '#F97316' : pkg.color}">${pkg.name}</h3>
                            <p class="text-xl font-bold mt-1 ${pkg.popular ? 'text-white' : 'text-gray-800'}">
                                ${pkg.priceFrom ? 'od ' : ''}${pkg.price}€<span class="text-xs font-normal ${pkg.popular ? 'text-gray-400' : 'text-gray-500'}">/mes</span>
                            </p>
                        </div>
                        <ul class="space-y-1 mb-3 text-xs">
                            ${pkg.features.map(f => `
                                <li class="flex items-center gap-1 ${pkg.popular ? 'text-gray-300' : 'text-gray-600'}">
                                    <span class="${pkg.popular ? 'text-orange-400' : 'text-green-500'}">✓</span> ${f}
                                </li>
                            `).join('')}
                        </ul>
                        <div class="w-full py-1.5 text-center rounded-lg text-sm font-semibold
                            ${selected === pkg.id ? 'bg-orange-500 text-white' : (pkg.popular ? 'bg-white/10 text-white' : 'bg-gray-100')}">
                            ${selected === pkg.id ? '✓ Vybraný' : 'Vybrať'}
                        </div>
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
    // SEKCIA: PLATFORMY S MODALOM
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
                <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p class="text-blue-800 text-sm flex items-center gap-2">
                        <span>💡</span>
                        <span>Váš balík <strong>${selectedPkg.charAt(0).toUpperCase() + selectedPkg.slice(1)}</strong> 
                        umožňuje <strong>${platformLimitText}</strong> 
                        ${platformLimit === 1 ? 'platformu' : (platformLimit === Infinity ? 'platforiem' : 'platformy')}.</span>
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
                            class="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">
                            Použiť
                        </button>
                    </div>
                </div>
                
                <!-- Grid platforiem - kompaktné karty -->
                <div class="grid grid-cols-2 gap-3 mb-5">
                    ${Object.values(this.PLATFORMS).map(platform => this.renderPlatformCardCompact(platform, selected, platformLimit)).join('')}
                </div>
                
                <!-- Vybrané platformy -->
                ${selected.length > 0 ? `
                    <div class="p-4 bg-gray-50 rounded-xl border">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-sm font-medium text-gray-600">Vybrané platformy</span>
                            <span class="text-sm font-bold ${selected.length > platformLimit && platformLimit !== Infinity ? 'text-red-600' : 'text-gray-800'}">
                                ${selected.length}/${platformLimit === Infinity ? '∞' : platformLimit}
                            </span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${selected.map(id => {
                                const p = this.PLATFORMS[id];
                                return p ? `
                                    <div class="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-orange-200 shadow-sm">
                                        <div class="w-6 h-6">${this.PLATFORM_LOGOS[id]}</div>
                                        <span class="text-sm font-medium text-gray-800">${p.name}</span>
                                        <button type="button" onclick="event.stopPropagation(); OnboardingModule.togglePlatform('${id}')" 
                                            class="ml-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                            ✕
                                        </button>
                                    </div>
                                ` : '';
                            }).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="p-4 bg-gray-50 rounded-xl border text-center">
                        <p class="text-sm text-gray-500">Zatiaľ nemáte vybrané žiadne platformy</p>
                    </div>
                `}
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformCardCompact = function(platform, selected, limit) {
        const isSelected = selected.includes(platform.id);
        const isDisabled = !isSelected && selected.length >= limit && limit !== Infinity;
        
        return `
            <div class="platform-card-compact relative border-2 rounded-xl transition-all overflow-hidden
                ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                ${isDisabled ? 'opacity-50' : 'cursor-pointer'}"
                onclick="${isDisabled ? '' : `OnboardingModule.togglePlatform('${platform.id}')`}">
                
                <div class="p-4">
                    <div class="flex items-center gap-3">
                        <!-- Checkbox -->
                        <div class="flex-shrink-0">
                            <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                                ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}">
                                ${isSelected ? '<span class="text-white text-xs font-bold">✓</span>' : ''}
                            </div>
                        </div>
                        
                        <!-- Logo -->
                        <div class="w-10 h-10 flex-shrink-0">
                            ${this.PLATFORM_LOGOS[platform.id]}
                        </div>
                        
                        <!-- Text -->
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm">${platform.name}</h4>
                            <p class="text-xs text-gray-500 truncate">${platform.shortDesc}</p>
                        </div>
                        
                        <!-- Info button -->
                        <button type="button" 
                            onclick="event.stopPropagation(); OnboardingModule.showPlatformModal('${platform.id}')"
                            class="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                ${isSelected ? '<div class="h-1 bg-gradient-to-r from-orange-500 to-pink-500"></div>' : ''}
            </div>
        `;
    };
    
    // ==========================================
    // MODAL PRE DETAIL PLATFORMY
    // ==========================================
    
    OnboardingModule.showPlatformModal = function(platformId) {
        const platform = this.PLATFORMS[platformId];
        if (!platform) return;
        
        const isSelected = (this.extensionState.selectedPlatforms || []).includes(platformId);
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
        const canSelect = isSelected || (this.extensionState.selectedPlatforms || []).length < limit || limit === Infinity;
        
        const modalHtml = `
            <div class="platform-modal-overlay" id="platformModal" onclick="OnboardingModule.closePlatformModal(event)">
                <div class="platform-modal" onclick="event.stopPropagation()">
                    <!-- Header -->
                    <div class="platform-modal__header" style="background: ${platform.color}">
                        <button class="platform-modal__close" onclick="OnboardingModule.closePlatformModal()">✕</button>
                        <div class="platform-modal__logo">
                            ${this.PLATFORM_LOGOS[platformId]}
                        </div>
                        <h2 class="platform-modal__title">${platform.name}</h2>
                        <p class="platform-modal__subtitle">${platform.shortDesc}</p>
                    </div>
                    
                    <!-- Body -->
                    <div class="platform-modal__body">
                        <p class="platform-modal__description">${platform.description}</p>
                        
                        <h3 class="platform-modal__section-title">Typy reklám</h3>
                        <div class="platform-modal__features">
                            ${platform.features.map(f => `
                                <div class="platform-modal__feature">
                                    <strong>${f.name}</strong>
                                    <span>${f.desc}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <h3 class="platform-modal__section-title">Ideálne pre</h3>
                        <div class="platform-modal__tags">
                            ${platform.bestFor.map(b => `<span class="platform-modal__tag">${b}</span>`).join('')}
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div class="platform-modal__footer">
                        ${canSelect ? `
                            <button class="platform-modal__btn ${isSelected ? 'platform-modal__btn--selected' : 'platform-modal__btn--primary'}"
                                onclick="OnboardingModule.togglePlatform('${platformId}'); OnboardingModule.closePlatformModal()">
                                ${isSelected ? '✓ Vybraná platforma' : 'Vybrať túto platformu'}
                            </button>
                        ` : `
                            <p class="platform-modal__limit-msg">Dosiahli ste limit platforiem pre váš balík</p>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            document.getElementById('platformModal')?.classList.add('platform-modal-overlay--visible');
        });
    };
    
    OnboardingModule.closePlatformModal = function(event) {
        if (event && event.target !== event.currentTarget) return;
        
        const modal = document.getElementById('platformModal');
        if (modal) {
            modal.classList.remove('platform-modal-overlay--visible');
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 200);
        }
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
                    Utils.toast(`Váš balík umožňuje max. ${limit} ${limit === 1 ? 'platformu' : 'platformy'}.`, 'warning');
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
        if (industry.includes('E-commerce') || industry.includes('Maloobchod')) return 'ecommerce';
        if (industry.includes('B2B') || industry.includes('IT')) return 'b2b';
        if (industry.includes('Startup')) return 'startup';
        return 'local_business';
    };
    
    // ==========================================
    // SEKCIA: TECHNICKÉ MOŽNOSTI
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
                
                <!-- Otázka 1 -->
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
                
                <!-- Otázka 2 -->
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
                
                <!-- Otázka 3 -->
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
    
    // ==========================================
    // OVERRIDES & INIT
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
    
    OnboardingModule.validateCurrentStep = function() {
        const section = this.SECTIONS[this.currentStep - 1];
        if (section?.isNew) {
            if (section.key === 'package' && !this.extensionState.selectedPackage) {
                Utils?.toast?.('Vyberte balík služieb', 'warning');
                return false;
            }
            if (section.key === 'platforms') {
                if (!this.extensionState.selectedPlatforms?.length) {
                    Utils?.toast?.('Vyberte aspoň jednu platformu', 'warning');
                    return false;
                }
            }
        }
        return originalValidateCurrentStep ? originalValidateCurrentStep.call(this) : true;
    };
    
    // ==========================================
    // CSS PRE MODAL
    // ==========================================
    
    OnboardingModule.injectExtensionStyles = function() {
        if (document.getElementById('onboarding-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboarding-extension-styles';
        style.textContent = `
            /* Platform Modal Overlay */
            .platform-modal-overlay {
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
            .platform-modal-overlay--visible {
                opacity: 1;
                visibility: visible;
            }
            
            /* Platform Modal */
            .platform-modal {
                background: white;
                border-radius: 20px;
                width: 100%;
                max-width: 440px;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                transform: scale(0.95) translateY(20px);
                transition: all 0.2s ease;
            }
            .platform-modal-overlay--visible .platform-modal {
                transform: scale(1) translateY(0);
            }
            
            /* Modal Header */
            .platform-modal__header {
                padding: 24px;
                color: white;
                text-align: center;
                position: relative;
            }
            .platform-modal__close {
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
                transition: background 0.2s;
            }
            .platform-modal__close:hover {
                background: rgba(255,255,255,0.3);
            }
            .platform-modal__logo {
                width: 64px;
                height: 64px;
                margin: 0 auto 12px;
                background: white;
                border-radius: 16px;
                padding: 12px;
            }
            .platform-modal__logo svg {
                width: 100%;
                height: 100%;
            }
            .platform-modal__title {
                font-size: 24px;
                font-weight: 700;
                margin: 0 0 4px;
            }
            .platform-modal__subtitle {
                font-size: 14px;
                opacity: 0.9;
                margin: 0;
            }
            
            /* Modal Body */
            .platform-modal__body {
                padding: 20px 24px;
                overflow-y: auto;
                flex: 1;
            }
            .platform-modal__description {
                font-size: 14px;
                color: #4b5563;
                line-height: 1.6;
                margin: 0 0 20px;
            }
            .platform-modal__section-title {
                font-size: 13px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin: 0 0 12px;
            }
            .platform-modal__features {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 20px;
            }
            .platform-modal__feature {
                padding: 12px;
                background: #f9fafb;
                border-radius: 10px;
            }
            .platform-modal__feature strong {
                display: block;
                font-size: 13px;
                color: #1f2937;
                margin-bottom: 2px;
            }
            .platform-modal__feature span {
                font-size: 12px;
                color: #6b7280;
            }
            .platform-modal__tags {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .platform-modal__tag {
                padding: 6px 12px;
                background: #f3f4f6;
                border-radius: 20px;
                font-size: 13px;
                color: #374151;
            }
            
            /* Modal Footer */
            .platform-modal__footer {
                padding: 16px 24px;
                border-top: 1px solid #e5e7eb;
                background: #f9fafb;
            }
            .platform-modal__btn {
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .platform-modal__btn--primary {
                background: linear-gradient(135deg, #f97316, #ec4899);
                color: white;
            }
            .platform-modal__btn--primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
            }
            .platform-modal__btn--selected {
                background: #10b981;
                color: white;
            }
            .platform-modal__limit-msg {
                text-align: center;
                color: #9ca3af;
                font-size: 14px;
                margin: 0;
            }
            
            /* Responsive */
            @media (max-width: 480px) {
                .platform-modal {
                    max-height: 85vh;
                    border-radius: 16px;
                }
                .platform-modal__features {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    };
    
    OnboardingModule.injectExtensionStyles();
    
    const originalInit = OnboardingModule.init;
    OnboardingModule.init = function() {
        if (originalInit) originalInit.call(this);
        console.log('📋 Onboarding module v2.4 initialized');
    };
    
    console.log('✅ Onboarding Extension v2.4 loaded!');
})();
