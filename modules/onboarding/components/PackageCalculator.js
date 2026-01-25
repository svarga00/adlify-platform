/**
 * Adlify - Package Calculator Component v3.0
 * Dynamické načítavanie balíkov z databázy
 */

const PackageCalculator = {
    // Balíky sa načítajú z DB, toto je fallback
    packages: {},
    
    // Ikony pre balíky (Lucide SVG)
    icons: {
        rocket: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
        star: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        crown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
        gem: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>`,
        trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`
    },

    // Billing cycles
    billingCycles: {
        monthly: { id: 'monthly', label: 'Mesačne', discount: 0, badge: null },
        '6months': { id: '6months', label: '6 mesiacov', discount: 10, badge: '-10%' },
        '12months': { id: '12months', label: '12 mesiacov', discount: 20, badge: '-20%' }
    },

    // Stav
    state: {
        selectedPackage: null,
        billingCycle: 'monthly',
        selectedPlatforms: [],
        loading: true
    },

    // Callbacks
    callbacks: {
        onPackageChange: null,
        onUpgrade: null
    },

    /**
     * Načítanie balíkov z databázy
     */
    async loadPackagesFromDB() {
        try {
            if (typeof Database === 'undefined' || !Database.client) {
                console.warn('PackageCalculator: Database not available, using fallback');
                return false;
            }

            const { data, error } = await Database.client
                .from('packages')
                .select('*')
                .eq('is_active', true)
                .order('sort_order');

            if (error) {
                console.error('PackageCalculator: DB error', error);
                return false;
            }

            if (data && data.length > 0) {
                this.packages = {};
                data.forEach(pkg => {
                    // Parse JSON fields
                    let features = [];
                    let limits = {};
                    
                    try {
                        features = typeof pkg.features === 'string' ? JSON.parse(pkg.features) : (pkg.features || []);
                    } catch (e) { features = []; }
                    
                    try {
                        limits = typeof pkg.limits === 'string' ? JSON.parse(pkg.limits) : (pkg.limits || {});
                    } catch (e) { limits = {}; }

                    this.packages[pkg.slug] = {
                        id: pkg.slug,
                        dbId: pkg.id,
                        name: pkg.name,
                        tagline: pkg.tagline || pkg.badge || '',
                        price: parseFloat(pkg.price) || 0,
                        price6m: Math.round(parseFloat(pkg.price) * 0.9),
                        price12m: Math.round(parseFloat(pkg.price) * 0.8),
                        color: pkg.color || '#6366f1',
                        icon: pkg.icon || 'star',
                        description: pkg.description || '',
                        popular: pkg.is_featured || false,
                        priceFrom: pkg.price_type === 'from',
                        limits: {
                            platforms: pkg.max_platforms || limits.platforms || 1,
                            campaigns: pkg.max_campaigns || limits.campaigns || 1,
                            visuals: pkg.max_visuals || limits.visuals || 2,
                            ...limits
                        },
                        features: features
                    };
                });
                console.log('PackageCalculator: Loaded', Object.keys(this.packages).length, 'packages from DB');
                return true;
            }
            return false;
        } catch (e) {
            console.error('PackageCalculator: Error loading from DB', e);
            return false;
        }
    },

    /**
     * Fallback balíky ak DB nie je dostupná
     */
    loadFallbackPackages() {
        this.packages = {
            starter: {
                id: 'starter',
                name: 'Starter',
                tagline: 'Pre začiatok',
                price: 149,
                price6m: 134,
                price12m: 119,
                color: '#3B82F6',
                icon: 'rocket',
                description: 'Ideálne pre živnostníkov, ktorí chcú vyskúšať online reklamu',
                limits: { platforms: 1, campaigns: 1, visuals: 2 },
                features: ['1 reklamná platforma', '1 kampaň', '2 reklamné vizuály', 'Mesačný report', 'Email podpora']
            },
            pro: {
                id: 'pro',
                name: 'Pro',
                tagline: 'Najobľúbenejšie',
                price: 249,
                price6m: 224,
                price12m: 199,
                color: '#F97316',
                icon: 'star',
                popular: true,
                description: 'Pre firmy, ktoré chcú rásť na viacerých platformách',
                limits: { platforms: 2, campaigns: 3, visuals: 4, abTesting: true },
                features: ['2 platformy', '3 kampane', '4 vizuály', 'A/B testovanie', 'Detailný report']
            },
            enterprise: {
                id: 'enterprise',
                name: 'Enterprise',
                tagline: 'Pre firmy',
                price: 399,
                price6m: 359,
                price12m: 319,
                color: '#8B5CF6',
                icon: 'crown',
                description: 'Pre e-shopy a firmy s vyšším rozpočtom',
                limits: { platforms: 99, campaigns: 5, visuals: 8, abTesting: true, remarketing: true },
                features: ['Všetky platformy', '5 kampaní', '8 vizuálov', 'Remarketing', 'WhatsApp podpora']
            }
        };
    },

    /**
     * Inicializácia
     */
    async init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('PackageCalculator: Container not found');
            return;
        }

        this.options = {
            showComparison: options.showComparison !== false,
            defaultPackage: options.defaultPackage || null,
            platforms: options.platforms || [],
            showContactForPremium: options.showContactForPremium !== false,
            ...options
        };

        if (options.onPackageChange) this.callbacks.onPackageChange = options.onPackageChange;
        if (options.onUpgrade) this.callbacks.onUpgrade = options.onUpgrade;

        this.state.selectedPlatforms = this.options.platforms;
        this.state.loading = true;
        
        // Zobraz loading
        this.renderLoading();
        
        // Načítaj balíky z DB
        const loaded = await this.loadPackagesFromDB();
        if (!loaded) {
            this.loadFallbackPackages();
        }
        
        this.state.loading = false;
        
        // Auto-select recommended package
        if (!this.state.selectedPackage) {
            // Preferuj 'pro' alebo prvý dostupný
            this.state.selectedPackage = this.options.defaultPackage || 
                (this.packages.pro ? 'pro' : Object.keys(this.packages)[0]);
        }
        
        this.render();
        this.attachEventListeners();
    },

    /**
     * Render loading state
     */
    renderLoading() {
        this.container.innerHTML = `
            <div class="flex items-center justify-center py-12">
                <div class="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                <span class="ml-3 text-gray-500">Načítavam balíky...</span>
            </div>
        `;
    },

    /**
     * Získanie ceny podľa billing cycle
     */
    getPrice(pkg, cycle = 'monthly') {
        if (cycle === '6months') return pkg.price6m;
        if (cycle === '12months') return pkg.price12m;
        return pkg.price;
    },

    /**
     * Získanie ikony
     */
    getIcon(iconName) {
        return this.icons[iconName] || this.icons.star;
    },

    /**
     * Hlavný render
     */
    render() {
        if (Object.keys(this.packages).length === 0) {
            this.container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>Žiadne balíky nie sú dostupné.</p>
                </div>
            `;
            return;
        }

        const html = `
            <div class="package-calculator">
                <!-- Billing Toggle -->
                <div class="flex justify-center mb-8">
                    <div class="inline-flex bg-gray-100 rounded-xl p-1">
                        ${Object.values(this.billingCycles).map(cycle => `
                            <button class="px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                this.state.billingCycle === cycle.id 
                                    ? 'bg-white shadow text-gray-900' 
                                    : 'text-gray-600 hover:text-gray-900'
                            }" data-action="set-billing" data-cycle="${cycle.id}">
                                ${cycle.label}
                                ${cycle.badge ? `<span class="ml-1 text-xs text-green-600 font-semibold">${cycle.badge}</span>` : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Package Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(Object.keys(this.packages).length, 4)} gap-6">
                    ${Object.values(this.packages).map(pkg => this.renderPackageCard(pkg)).join('')}
                </div>
                
                <p class="text-center text-sm text-gray-500 mt-6">
                    * Ceny sú bez DPH. Reklamný rozpočet nie je zahrnutý.
                </p>
            </div>
        `;

        this.container.innerHTML = html;
    },

    /**
     * Render karty balíka
     */
    renderPackageCard(pkg) {
        const isSelected = this.state.selectedPackage === pkg.id;
        const price = this.getPrice(pkg, this.state.billingCycle);
        const originalPrice = pkg.price;
        const hasDiscount = this.state.billingCycle !== 'monthly';
        
        const borderClass = isSelected 
            ? 'ring-2 ring-orange-500 border-orange-500' 
            : 'border-gray-200 hover:border-gray-300';
        
        const popularBadge = pkg.popular 
            ? `<div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-semibold rounded-full shadow">Najobľúbenejší</div>`
            : '';

        return `
            <div class="relative bg-white rounded-2xl border-2 ${borderClass} p-6 transition-all cursor-pointer hover:shadow-lg"
                 data-package="${pkg.id}" data-action="select-package">
                
                ${popularBadge}
                
                <!-- Header -->
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white" 
                         style="background: ${pkg.color}">
                        ${this.getIcon(pkg.icon)}
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${pkg.name}</h3>
                        ${pkg.tagline ? `<span class="text-xs text-gray-500">${pkg.tagline}</span>` : ''}
                    </div>
                </div>
                
                <!-- Price -->
                <div class="mb-4">
                    <div class="flex items-baseline gap-1">
                        ${pkg.priceFrom ? '<span class="text-sm text-gray-500">od </span>' : ''}
                        <span class="text-3xl font-bold text-gray-900">${price}€</span>
                        <span class="text-gray-500">/mes</span>
                    </div>
                    ${hasDiscount && !pkg.priceFrom ? `
                        <div class="text-sm text-gray-400 line-through">${originalPrice}€/mes</div>
                    ` : ''}
                </div>
                
                <!-- Description -->
                <p class="text-sm text-gray-600 mb-4">${pkg.description}</p>
                
                <!-- Features -->
                <ul class="space-y-2 mb-6">
                    ${pkg.features.map(f => `
                        <li class="flex items-start gap-2 text-sm">
                            <svg class="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                            <span class="text-gray-700">${f}</span>
                        </li>
                    `).join('')}
                </ul>
                
                <!-- Button -->
                <button class="w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                    isSelected 
                        ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }" data-action="select-package" data-package="${pkg.id}">
                    ${isSelected ? '✓ Vybraný' : `Vybrať ${pkg.name}`}
                </button>
            </div>
        `;
    },

    /**
     * Event listeners
     */
    attachEventListeners() {
        this.container.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]');
            if (!action) return;

            const actionType = action.dataset.action;

            if (actionType === 'set-billing') {
                this.state.billingCycle = action.dataset.cycle;
                this.render();
                this.attachEventListeners();
            }

            if (actionType === 'select-package') {
                const pkgId = action.dataset.package;
                if (pkgId && this.packages[pkgId]) {
                    this.state.selectedPackage = pkgId;
                    this.render();
                    this.attachEventListeners();
                    
                    if (this.callbacks.onPackageChange) {
                        this.callbacks.onPackageChange(this.packages[pkgId]);
                    }
                }
            }
        });
    },

    /**
     * Getters
     */
    getSelectedPackage() {
        return this.packages[this.state.selectedPackage] || null;
    },

    getSelectedPackageId() {
        const pkg = this.getSelectedPackage();
        return pkg?.dbId || pkg?.id || null;
    },

    getPlatformLimit() {
        const pkg = this.getSelectedPackage();
        return pkg?.limits?.platforms || 1;
    },

    /**
     * Setters
     */
    setSelectedPackage(pkgId) {
        if (this.packages[pkgId]) {
            this.state.selectedPackage = pkgId;
            this.render();
            this.attachEventListeners();
        }
    }
};

// Export pre použitie ako modul
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PackageCalculator;
}
