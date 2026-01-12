/**
 * Adlify - Platform Selector Component v3.0
 * Dynamické načítavanie platforiem z databázy
 */

const PlatformSelector = {
    // Platformy sa načítajú z DB
    platforms: [],
    
    // SVG ikony pre platformy
    icons: {
        google_ads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>`,
        meta_ads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
        linkedin_ads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
        tiktok_ads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
        seo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
        default: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>`
    },

    // Predvolené farby
    colors: {
        google_ads: '#4285F4',
        meta_ads: '#1877F2',
        linkedin_ads: '#0A66C2',
        tiktok_ads: '#000000',
        seo: '#10B981',
        email: '#F43F5E',
        default: '#6366F1'
    },

    // Stav
    state: {
        selectedPlatforms: [],
        maxPlatforms: 1,
        loading: true,
        showModal: false,
        modalPlatform: null
    },

    // Callbacks
    callbacks: {
        onChange: null
    },

    /**
     * Načítanie platforiem z databázy
     */
    async loadPlatformsFromDB() {
        try {
            if (typeof Database === 'undefined' || !Database.client) {
                console.warn('PlatformSelector: Database not available, using fallback');
                return false;
            }

            const { data, error } = await Database.client
                .from('services')
                .select('*')
                .eq('is_active', true)
                .eq('is_platform', true)
                .order('sort_order');

            if (error) {
                console.error('PlatformSelector: DB error', error);
                return false;
            }

            if (data && data.length > 0) {
                this.platforms = data.map(svc => {
                    let features = [];
                    try {
                        features = typeof svc.features === 'string' ? JSON.parse(svc.features) : (svc.features || []);
                    } catch (e) { features = []; }

                    return {
                        id: svc.slug || svc.id,
                        dbId: svc.id,
                        name: svc.name.replace(' správa', ''),
                        description: svc.description || '',
                        detailedDescription: svc.detailed_description || svc.description || '',
                        bestFor: svc.best_for || '',
                        features: features,
                        icon: svc.icon_svg || null,
                        iconKey: svc.slug || 'default',
                        color: svc.color || this.colors[svc.slug] || this.colors.default,
                        minBudget: parseFloat(svc.min_budget) || 5,
                        price: parseFloat(svc.base_price) || 0
                    };
                });
                console.log('PlatformSelector: Loaded', this.platforms.length, 'platforms from DB');
                return true;
            }
            return false;
        } catch (e) {
            console.error('PlatformSelector: Error loading from DB', e);
            return false;
        }
    },

    /**
     * Fallback platformy
     */
    loadFallbackPlatforms() {
        this.platforms = [
            {
                id: 'google_ads',
                name: 'Google Ads',
                description: 'Reklamy vo vyhľadávaní Google, YouTube a Display sieti',
                detailedDescription: 'Google Ads je najväčšia PPC platforma. Zahrňuje Search reklamy, Display bannery, YouTube video reklamy a Shopping kampane.',
                bestFor: 'E-shopy, lokálne služby, B2B',
                features: ['Search reklamy', 'YouTube video', 'Display bannery', 'Shopping', 'Remarketing'],
                iconKey: 'google_ads',
                color: '#4285F4',
                minBudget: 5
            },
            {
                id: 'meta_ads',
                name: 'Meta Ads',
                description: 'Reklamy na Facebooku a Instagrame',
                detailedDescription: 'Meta Ads umožňuje cieliť na používateľov Facebooku a Instagramu podľa záujmov a správania.',
                bestFor: 'B2C produkty, móda, gastro',
                features: ['Feed reklamy', 'Stories', 'Reels', 'Messenger', 'Lookalike audiences'],
                iconKey: 'meta_ads',
                color: '#1877F2',
                minBudget: 3
            },
            {
                id: 'linkedin_ads',
                name: 'LinkedIn Ads',
                description: 'B2B reklamy zamerané na profesionálov',
                detailedDescription: 'LinkedIn Ads je najlepšia platforma pre B2B marketing. Umožňuje cieliť podľa pozície a firmy.',
                bestFor: 'B2B služby, SaaS, recruitment',
                features: ['Sponsored Content', 'Message Ads', 'Lead Gen Forms'],
                iconKey: 'linkedin_ads',
                color: '#0A66C2',
                minBudget: 10
            },
            {
                id: 'tiktok_ads',
                name: 'TikTok Ads',
                description: 'Video reklamy pre mladšiu generáciu',
                detailedDescription: 'TikTok má obrovský dosah medzi mladými používateľmi (16-35 rokov).',
                bestFor: 'Mladá cieľovka, e-commerce, trendy produkty',
                features: ['In-Feed video', 'Spark Ads', 'TopView', 'Branded Challenges'],
                iconKey: 'tiktok_ads',
                color: '#000000',
                minBudget: 5
            }
        ];
    },

    /**
     * Inicializácia
     */
    async init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('PlatformSelector: Container not found');
            return;
        }

        this.options = {
            maxPlatforms: options.maxPlatforms || 1,
            selectedPlatforms: options.selectedPlatforms || [],
            onChange: options.onChange || null,
            packageName: options.packageName || 'Váš balík',
            ...options
        };

        this.state.maxPlatforms = this.options.maxPlatforms;
        this.state.selectedPlatforms = [...this.options.selectedPlatforms];
        this.callbacks.onChange = this.options.onChange;

        this.state.loading = true;
        this.renderLoading();

        // Načítaj platformy z DB
        const loaded = await this.loadPlatformsFromDB();
        if (!loaded) {
            this.loadFallbackPlatforms();
        }

        this.state.loading = false;
        this.render();
        this.attachEventListeners();
    },

    /**
     * Render loading
     */
    renderLoading() {
        this.container.innerHTML = `
            <div class="flex items-center justify-center py-8">
                <div class="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                <span class="ml-3 text-gray-500">Načítavam platformy...</span>
            </div>
        `;
    },

    /**
     * Získať ikonu
     */
    getIcon(platform) {
        if (platform.icon) return platform.icon;
        return this.icons[platform.iconKey] || this.icons.default;
    },

    /**
     * Hlavný render
     */
    render() {
        const selectedCount = this.state.selectedPlatforms.length;
        const maxPlatforms = this.state.maxPlatforms;
        const canSelectMore = selectedCount < maxPlatforms;

        const html = `
            <div class="platform-selector">
                <!-- Info banner -->
                <div class="mb-6 p-4 bg-gradient-to-r from-orange-50 to-pink-50 rounded-xl border border-orange-100">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <span class="text-sm font-medium text-gray-700">
                            ${this.options.packageName} umožňuje <strong>${maxPlatforms === 99 ? 'neobmedzene' : maxPlatforms}</strong> ${maxPlatforms === 1 ? 'platformu' : 'platformy'}.
                        </span>
                    </div>
                </div>

                <!-- Platform grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${this.platforms.map(platform => this.renderPlatformCard(platform, canSelectMore)).join('')}
                </div>

                <!-- Selected summary -->
                ${selectedCount > 0 ? `
                    <div class="mt-6 p-4 bg-gray-50 rounded-xl">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-gray-700">Vybrané platformy</span>
                            <span class="text-sm text-gray-500">${selectedCount}/${maxPlatforms === 99 ? '∞' : maxPlatforms}</span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${this.state.selectedPlatforms.map(id => {
                                const p = this.platforms.find(x => x.id === id);
                                if (!p) return '';
                                return `
                                    <span class="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border shadow-sm">
                                        <span class="w-4 h-4" style="color: ${p.color}">${this.getIcon(p)}</span>
                                        <span class="text-sm font-medium">${p.name}</span>
                                        <button class="text-gray-400 hover:text-red-500 transition-colors" 
                                                data-action="remove-platform" data-platform="${p.id}">
                                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                            </svg>
                                        </button>
                                    </span>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Detail Modal -->
            <div id="platform-modal" class="fixed inset-0 z-50 ${this.state.showModal ? '' : 'hidden'}">
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" data-action="close-modal"></div>
                <div class="absolute inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                    ${this.state.modalPlatform ? this.renderModal(this.state.modalPlatform) : ''}
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    /**
     * Render platform card
     */
    renderPlatformCard(platform, canSelectMore) {
        const isSelected = this.state.selectedPlatforms.includes(platform.id);
        const isDisabled = !isSelected && !canSelectMore;

        return `
            <div class="relative bg-white rounded-xl border-2 transition-all ${
                isSelected 
                    ? 'border-orange-500 ring-2 ring-orange-200' 
                    : isDisabled 
                        ? 'border-gray-100 opacity-50' 
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
            } ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}"
                 data-platform="${platform.id}"
                 data-action="${isDisabled ? '' : 'toggle-platform'}">
                
                <!-- Checkbox -->
                <div class="absolute top-4 right-4">
                    <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                        isSelected 
                            ? 'bg-orange-500 border-orange-500 text-white' 
                            : 'border-gray-300'
                    }">
                        ${isSelected ? `
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                            </svg>
                        ` : ''}
                    </div>
                </div>

                <div class="p-5">
                    <!-- Header -->
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center" 
                             style="background: ${platform.color}15; color: ${platform.color}">
                            ${this.getIcon(platform)}
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${platform.name}</h3>
                            <p class="text-xs text-gray-500">od ${platform.minBudget}€/deň</p>
                        </div>
                    </div>

                    <!-- Description -->
                    <p class="text-sm text-gray-600 mb-3 line-clamp-2">${platform.description}</p>

                    <!-- Info button -->
                    <button class="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                            data-action="show-detail" data-platform="${platform.id}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Viac informácií
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render modal
     */
    renderModal(platform) {
        const isSelected = this.state.selectedPlatforms.includes(platform.id);
        const canSelect = isSelected || this.state.selectedPlatforms.length < this.state.maxPlatforms;

        return `
            <div class="flex flex-col h-full max-h-[80vh]">
                <!-- Header -->
                <div class="p-6 border-b" style="background: linear-gradient(135deg, ${platform.color}10, ${platform.color}05)">
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg"
                                 style="background: ${platform.color}">
                                ${this.getIcon(platform)}
                            </div>
                            <div>
                                <h2 class="text-2xl font-bold text-gray-900">${platform.name}</h2>
                                <p class="text-sm text-gray-500">od ${platform.minBudget}€/deň</p>
                            </div>
                        </div>
                        <button class="p-2 hover:bg-gray-100 rounded-lg transition-colors" data-action="close-modal">
                            <svg class="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6">
                    <p class="text-gray-700 mb-6">${platform.detailedDescription}</p>

                    ${platform.bestFor ? `
                        <div class="mb-6">
                            <h3 class="text-sm font-semibold text-gray-900 mb-2">Pre koho je vhodná</h3>
                            <p class="text-sm text-gray-600">${platform.bestFor}</p>
                        </div>
                    ` : ''}

                    ${platform.features && platform.features.length > 0 ? `
                        <div class="mb-6">
                            <h3 class="text-sm font-semibold text-gray-900 mb-3">Čo zahŕňa</h3>
                            <ul class="space-y-2">
                                ${platform.features.map(f => `
                                    <li class="flex items-center gap-2 text-sm text-gray-700">
                                        <svg class="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                        </svg>
                                        ${f}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>

                <!-- Footer -->
                <div class="p-6 border-t bg-gray-50">
                    <button class="w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                        isSelected 
                            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                            : canSelect
                                ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:shadow-lg'
                                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }" data-action="${canSelect ? 'toggle-platform-modal' : ''}" data-platform="${platform.id}">
                        ${isSelected ? 'Odstrániť platformu' : canSelect ? 'Pridať platformu' : 'Limit dosiahnutý'}
                    </button>
                </div>
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
            const platformId = action.dataset.platform;

            if (actionType === 'toggle-platform' && platformId) {
                e.stopPropagation();
                this.togglePlatform(platformId);
            }

            if (actionType === 'remove-platform' && platformId) {
                e.stopPropagation();
                this.removePlatform(platformId);
            }

            if (actionType === 'show-detail' && platformId) {
                e.stopPropagation();
                this.showModal(platformId);
            }

            if (actionType === 'close-modal') {
                this.hideModal();
            }

            if (actionType === 'toggle-platform-modal' && platformId) {
                this.togglePlatform(platformId);
                this.hideModal();
            }
        });
    },

    /**
     * Toggle platform
     */
    togglePlatform(platformId) {
        const index = this.state.selectedPlatforms.indexOf(platformId);
        
        if (index > -1) {
            this.state.selectedPlatforms.splice(index, 1);
        } else if (this.state.selectedPlatforms.length < this.state.maxPlatforms) {
            this.state.selectedPlatforms.push(platformId);
        }

        this.render();
        this.attachEventListeners();

        if (this.callbacks.onChange) {
            this.callbacks.onChange(this.state.selectedPlatforms);
        }
    },

    /**
     * Remove platform
     */
    removePlatform(platformId) {
        const index = this.state.selectedPlatforms.indexOf(platformId);
        if (index > -1) {
            this.state.selectedPlatforms.splice(index, 1);
            this.render();
            this.attachEventListeners();

            if (this.callbacks.onChange) {
                this.callbacks.onChange(this.state.selectedPlatforms);
            }
        }
    },

    /**
     * Show modal
     */
    showModal(platformId) {
        const platform = this.platforms.find(p => p.id === platformId);
        if (platform) {
            this.state.showModal = true;
            this.state.modalPlatform = platform;
            this.render();
            this.attachEventListeners();
        }
    },

    /**
     * Hide modal
     */
    hideModal() {
        this.state.showModal = false;
        this.state.modalPlatform = null;
        this.render();
        this.attachEventListeners();
    },

    /**
     * Getters
     */
    getSelectedPlatforms() {
        return this.state.selectedPlatforms;
    },

    getSelectedPlatformObjects() {
        return this.state.selectedPlatforms.map(id => 
            this.platforms.find(p => p.id === id)
        ).filter(Boolean);
    },

    /**
     * Setters
     */
    setMaxPlatforms(max) {
        this.state.maxPlatforms = max;
        // Ak máme viac vybraných ako nový limit, orež
        if (this.state.selectedPlatforms.length > max) {
            this.state.selectedPlatforms = this.state.selectedPlatforms.slice(0, max);
        }
        this.render();
        this.attachEventListeners();
    },

    setSelectedPlatforms(platforms) {
        this.state.selectedPlatforms = platforms.slice(0, this.state.maxPlatforms);
        this.render();
        this.attachEventListeners();
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatformSelector;
}
