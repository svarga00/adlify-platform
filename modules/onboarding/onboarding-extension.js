/**
 * ADLIFY PLATFORM - Onboarding Extension v3.0
 * 
 * - Balíky s prepínačom obdobia a zobrazením úspory
 * - Platformy s SVG logami a detailnými modalmi
 * - Technické možnosti
 */

(function() {
    'use strict';
    
    if (!window.OnboardingModule) {
        console.error('❌ OnboardingExtension: OnboardingModule nie je načítaný!');
        return;
    }
    
    console.log('🔌 Onboarding Extension v3.0 loading...');
    
    // Uložíme pôvodné metódy
    const originalRenderCurrentSection = OnboardingModule.renderCurrentSection;
    const originalCollectFormData = OnboardingModule.collectFormData;
    const originalValidateCurrentStep = OnboardingModule.validateCurrentStep;
    
    // ==========================================
    // STAV
    // ==========================================
    
    OnboardingModule.extensionState = {
        selectedPackage: 'pro',
        selectedPeriod: 'monthly',
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
    // BALÍKY DATA
    // ==========================================
    
    OnboardingModule.PACKAGES = {
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
    
    // ==========================================
    // PLATFORMY DATA
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
            bestFor: ['E-shopy', 'Lokálne služby', 'B2B']
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            subtitle: 'Facebook + Instagram',
            color: '#0081FB',
            shortDesc: 'Facebook, Instagram - Feed, Stories, Reels',
            description: 'Facebook a Instagram reklamy s najpresnejším cielením podľa záujmov a správania.',
            features: [
                { name: 'Facebook Feed', desc: 'Reklamy v hlavnom feede' },
                { name: 'Instagram Feed', desc: 'Reklamy vo feede Instagramu' },
                { name: 'Stories', desc: 'Fullscreen formát pre FB aj IG' },
                { name: 'Reels', desc: 'Krátke video reklamy' }
            ],
            bestFor: ['E-shopy', 'Lokálne služby', 'Gastro', 'Beauty']
        },
        linkedin_ads: {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            color: '#0A66C2',
            shortDesc: 'B2B reklamy pre profesionálov',
            description: 'Najlepšia platforma pre B2B marketing. Cieľte podľa pracovnej pozície alebo firmy.',
            features: [
                { name: 'Sponsored Content', desc: 'Natívne príspevky vo feede' },
                { name: 'InMail', desc: 'Priame správy do LinkedIn schránky' },
                { name: 'Lead Gen Forms', desc: 'Predvyplnené formuláre' },
                { name: 'Text Ads', desc: 'Textové reklamy v sidebar' }
            ],
            bestFor: ['B2B služby', 'IT firmy', 'SaaS', 'Recruiting']
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
            bestFor: ['Móda', 'Kozmetika', 'F&B', 'Entertainment']
        }
    };
    
    // ==========================================
    // PACKAGE PLATFORM LIMITS
    // ==========================================
    
    OnboardingModule.PACKAGE_PLATFORM_LIMITS = {
        starter: 1,
        pro: 2,
        enterprise: Infinity,
        premium: Infinity
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
        const period = this.extensionState.selectedPeriod || 'monthly';
        
        return `
            <div class="package-section">
                <div class="mb-6">
                    <p class="text-gray-600 text-sm">
                        Vyberte balík služieb podľa vašich potrieb. Pri dlhšom období získate zľavu.
                    </p>
                </div>
                
                <!-- Prepínač obdobia -->
                <div class="flex justify-center mb-6">
                    <div class="inline-flex bg-gray-100 rounded-full p-1">
                        <button type="button" onclick="OnboardingModule.selectPeriod('monthly')"
                            class="px-4 py-2 rounded-full text-sm font-medium transition-all ${period === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            Mesačne
                        </button>
                        <button type="button" onclick="OnboardingModule.selectPeriod('6m')"
                            class="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${period === '6m' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            6 mes. <span class="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded-full">-10%</span>
                        </button>
                        <button type="button" onclick="OnboardingModule.selectPeriod('12m')"
                            class="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${period === '12m' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
                            12 mes. <span class="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded-full">-20%</span>
                        </button>
                    </div>
                </div>
                
                <!-- Balíky -->
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    ${Object.values(this.PACKAGES).map(pkg => this.renderPackageCard(pkg, selected, period)).join('')}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.renderPackageCard = function(pkg, selected, period) {
        const isSelected = selected === pkg.id;
        const price = pkg.price[period];
        const monthlyPrice = pkg.price.monthly;
        const savings = period !== 'monthly' ? (monthlyPrice - price) * (period === '6m' ? 6 : 12) : 0;
        const months = period === '6m' ? 6 : (period === '12m' ? 12 : 1);
        const totalPrice = price * months;
        
        // Štýly
        let cardClass = 'bg-white border-2 border-gray-200 hover:border-gray-300';
        let headerBg = '';
        let nameColor = 'text-gray-800';
        let priceColor = 'text-gray-900';
        let descColor = 'text-gray-500';
        let featureColor = 'text-gray-600';
        let checkColor = 'text-green-500';
        let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
        let badgeClass = 'bg-orange-100 text-orange-600';
        
        if (pkg.popular) {
            cardClass = 'bg-gray-900 border-2 border-gray-800';
            nameColor = 'text-orange-400';
            priceColor = 'text-white';
            descColor = 'text-gray-400';
            featureColor = 'text-gray-300';
            checkColor = 'text-green-400';
            btnClass = isSelected ? 'bg-orange-500 text-white' : 'bg-transparent text-orange-400 border-2 border-orange-400 hover:bg-orange-500 hover:text-white hover:border-orange-500';
            badgeClass = 'bg-gradient-to-r from-orange-500 to-pink-500 text-white';
        }
        
        if (pkg.isPremium) {
            cardClass = 'bg-gradient-to-br from-orange-400 to-amber-500 border-2 border-orange-300';
            nameColor = 'text-white';
            priceColor = 'text-white';
            descColor = 'text-orange-100';
            featureColor = 'text-white';
            checkColor = 'text-amber-200';
            btnClass = isSelected ? 'bg-white text-orange-600' : 'bg-white/20 text-white border-2 border-white/50 hover:bg-white hover:text-orange-600';
            badgeClass = 'bg-white/30 text-white';
        }
        
        if (isSelected && !pkg.popular && !pkg.isPremium) {
            cardClass = 'bg-orange-50 border-2 border-orange-500';
        }
        
        return `
            <div class="relative rounded-2xl overflow-hidden transition-all hover:shadow-lg cursor-pointer flex flex-col ${cardClass}"
                onclick="OnboardingModule.selectPackage('${pkg.id}')" style="min-height: 480px;">
                
                <!-- Badge -->
                <div class="absolute top-3 ${pkg.popular || pkg.isPremium ? 'left-1/2 -translate-x-1/2' : 'left-3'} z-10">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}">
                        ${pkg.badge}
                    </span>
                </div>
                
                <!-- Content -->
                <div class="p-4 pt-10 flex flex-col flex-1">
                    <!-- Icon & Name -->
                    <div class="mb-3">
                        <span class="text-2xl">${pkg.icon}</span>
                        <h3 class="text-lg font-bold mt-1 ${nameColor}">${pkg.name}</h3>
                    </div>
                    
                    <!-- Price -->
                    <div class="mb-2">
                        <span class="text-2xl font-bold ${priceColor}">
                            ${pkg.priceFrom ? 'od ' : ''}${price}€
                        </span>
                        <span class="${pkg.popular || pkg.isPremium ? 'text-white/60' : 'text-gray-400'} text-sm">/mes</span>
                    </div>
                    
                    <!-- Savings info -->
                    ${period !== 'monthly' && !pkg.isPremium ? `
                        <div class="mb-3 text-xs ${pkg.popular ? 'text-green-400' : 'text-green-600'}">
                            <span class="font-semibold">Ušetríte ${savings}€</span>
                            <span class="${pkg.popular ? 'text-gray-500' : 'text-gray-400'}"> • Spolu ${totalPrice}€</span>
                        </div>
                    ` : '<div class="mb-3 h-4"></div>'}
                    
                    <!-- Description -->
                    <p class="text-xs ${descColor} mb-3 leading-relaxed">
                        ${pkg.description}
                    </p>
                    
                    <!-- Features -->
                    <ul class="space-y-1.5 mb-4 flex-1">
                        ${pkg.features.map(f => `
                            <li class="flex items-start gap-2 text-xs ${featureColor}">
                                <span class="${checkColor} mt-0.5 flex-shrink-0">✓</span>
                                <span>${f}</span>
                            </li>
                        `).join('')}
                    </ul>
                    
                    <!-- Button -->
                    <button type="button" class="w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${btnClass}">
                        ${pkg.isPremium ? 'Kontaktujte nás' : (isSelected ? '✓ Vybraný' : 'Vybrať ' + pkg.name)}
                    </button>
                </div>
                
                <input type="radio" name="selected_package" value="${pkg.id}" ${isSelected ? 'checked' : ''} class="sr-only">
            </div>
        `;
    };
    
    OnboardingModule.selectPeriod = function(period) {
        this.extensionState.selectedPeriod = period;
        this.formData.billing_period = period;
        this.rerender();
    };
    
    OnboardingModule.selectPackage = function(packageId) {
        this.extensionState.selectedPackage = packageId;
        this.formData.selected_package = packageId;
        
        const period = this.extensionState.selectedPeriod || 'monthly';
        const pkg = this.PACKAGES[packageId];
        if (pkg) {
            this.formData.package_price = pkg.price[period];
        }
        
        // Reset platformy ak prekračujú nový limit
        const newLimit = this.PACKAGE_PLATFORM_LIMITS[packageId] || 1;
        if (this.extensionState.selectedPlatforms.length > newLimit && newLimit !== Infinity) {
            this.extensionState.selectedPlatforms = this.extensionState.selectedPlatforms.slice(0, newLimit);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
        }
        
        this.rerender();
    };
    
    // ==========================================
    // SEKCIA: PLATFORMY
    // ==========================================
    
    OnboardingModule.renderPlatformsSection = function() {
        const selectedPkg = this.extensionState.selectedPackage || 'pro';
        const pkg = this.PACKAGES[selectedPkg];
        const platformLimit = this.PACKAGE_PLATFORM_LIMITS[selectedPkg] || 1;
        const platformLimitText = platformLimit === Infinity ? 'neobmedzený počet' : platformLimit;
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
                
                <!-- Grid platforiem -->
                <div class="grid grid-cols-2 gap-3 mb-4">
                    ${Object.values(this.PLATFORMS).map(platform => this.renderPlatformCard(platform, selected, platformLimit)).join('')}
                </div>
                
                <!-- Vybrané platformy -->
                ${this.renderSelectedPlatforms(selected, platformLimit)}
            </div>
        `;
    };
    
    OnboardingModule.renderPlatformCard = function(platform, selected, limit) {
        const isSelected = selected.includes(platform.id);
        const isAtLimit = selected.length >= limit && limit !== Infinity && !isSelected;
        
        return `
            <div class="platform-card relative border-2 rounded-xl transition-all overflow-hidden
                ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}
                ${isAtLimit ? 'opacity-50' : 'cursor-pointer'}"
                onclick="${isAtLimit ? '' : `OnboardingModule.togglePlatform('${platform.id}')`}">
                
                <div class="p-3">
                    <div class="flex items-center gap-3">
                        <!-- Checkbox -->
                        <div class="flex-shrink-0">
                            <div class="w-5 h-5 rounded border-2 flex items-center justify-center
                                ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}">
                                ${isSelected ? '<span class="text-white text-xs font-bold">✓</span>' : ''}
                            </div>
                        </div>
                        
                        <!-- Logo -->
                        <div class="w-10 h-10 flex-shrink-0">${this.PLATFORM_LOGOS[platform.id]}</div>
                        
                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm">${platform.name}</h4>
                            ${platform.subtitle ? `<p class="text-xs text-blue-600">${platform.subtitle}</p>` : ''}
                            <p class="text-xs text-gray-500 truncate">${platform.shortDesc}</p>
                        </div>
                        
                        <!-- Info button -->
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
            return `<div class="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
                <p class="text-sm text-gray-500">Zatiaľ nemáte vybrané žiadne platformy</p>
            </div>`;
        }
        
        return `
            <div class="p-3 bg-gray-50 rounded-xl border">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-600">Vybrané platformy</span>
                    <span class="text-sm font-bold ${selected.length > limit && limit !== Infinity ? 'text-red-600' : 'text-green-600'}">
                        ${selected.length}/${limit === Infinity ? '∞' : limit}
                    </span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${selected.map(id => {
                        const p = this.PLATFORMS[id];
                        return p ? `
                            <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-orange-200 shadow-sm">
                                <div class="w-5 h-5">${this.PLATFORM_LOGOS[id]}</div>
                                <span class="text-sm font-medium text-gray-800">${p.name}</span>
                                <button type="button" onclick="event.stopPropagation(); OnboardingModule.removePlatform('${id}')" 
                                    class="ml-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full text-xs">✕</button>
                            </div>
                        ` : '';
                    }).join('')}
                </div>
            </div>
        `;
    };
    
    OnboardingModule.togglePlatform = function(platformId) {
        const platforms = this.extensionState.selectedPlatforms || [];
        const index = platforms.indexOf(platformId);
        
        if (index > -1) {
            platforms.splice(index, 1);
        } else {
            const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
            if (platforms.length >= limit && limit !== Infinity) {
                this.showUpgradeModal(platformId);
                return;
            }
            platforms.push(platformId);
        }
        
        this.extensionState.selectedPlatforms = platforms;
        this.formData.selected_platforms = platforms;
        this.rerender();
    };
    
    OnboardingModule.removePlatform = function(platformId) {
        const index = this.extensionState.selectedPlatforms.indexOf(platformId);
        if (index > -1) {
            this.extensionState.selectedPlatforms.splice(index, 1);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
            this.rerender();
        }
    };
    
    // ==========================================
    // MODAL: DETAIL PLATFORMY
    // ==========================================
    
    OnboardingModule.showPlatformModal = function(platformId) {
        const platform = this.PLATFORMS[platformId];
        if (!platform) return;
        
        const isSelected = this.extensionState.selectedPlatforms.includes(platformId);
        const limit = this.PACKAGE_PLATFORM_LIMITS[this.extensionState.selectedPackage] || 1;
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
                                onclick="OnboardingModule.togglePlatform('${platformId}'); OnboardingModule.closePlatformModal()">
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
    // MODAL: UPGRADE
    // ==========================================
    
    OnboardingModule.showUpgradeModal = function(wantedPlatformId) {
        const currentPkg = this.PACKAGES[this.extensionState.selectedPackage];
        const wantedPlatform = this.PLATFORMS[wantedPlatformId];
        const currentLimit = currentPkg?.platforms || 1;
        
        const packageOrder = ['starter', 'pro', 'enterprise', 'premium'];
        const currentIndex = packageOrder.indexOf(this.extensionState.selectedPackage);
        const nextPackages = packageOrder.slice(currentIndex + 1).map(id => this.PACKAGES[id]).filter(p => p);
        
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
                                                    ${pkg.platforms === Infinity ? 'Všetky platformy' : pkg.platforms + ' platformy'}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <p class="font-bold text-lg text-gray-800">${pkg.priceFrom ? 'od ' : ''}${pkg.price.monthly}€</p>
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
            this.extensionState.selectedPlatforms.push(platformId);
            this.formData.selected_platforms = this.extensionState.selectedPlatforms;
        }
        this.closeUpgradeModal();
        this.rerender();
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
                        <strong>💡 Tip:</strong> Po vyplnení dotazníka vám pošleme email s návodmi.
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
    // OVERRIDES
    // ==========================================
    
    OnboardingModule.collectFormData = function() {
        if (originalCollectFormData) originalCollectFormData.call(this);
        this.formData.selected_package = this.extensionState.selectedPackage;
        this.formData.billing_period = this.extensionState.selectedPeriod;
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
                    return true;
                case 'platforms':
                    if (!this.extensionState.selectedPlatforms || this.extensionState.selectedPlatforms.length === 0) {
                        Utils?.toast?.('Vyberte aspoň jednu platformu', 'warning');
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
    // CSS ŠTÝLY
    // ==========================================
    
    OnboardingModule.injectExtensionStyles = function() {
        if (document.getElementById('onboarding-extension-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboarding-extension-styles';
        style.textContent = `
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
            @media (max-width: 480px) {
                .adlify-modal {
                    max-height: 90vh;
                    border-radius: 16px;
                }
            }
        `;
        document.head.appendChild(style);
    };
    
    OnboardingModule.injectExtensionStyles();
    
    console.log('✅ Onboarding Extension v3.0 loaded!');
})();
