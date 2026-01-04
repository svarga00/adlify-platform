/**
 * Adlify - Platform Selector Component
 * Umožňuje klientom vybrať reklamné platformy pre ich kampane
 */

const PlatformSelector = {
    // Konfigurácia dostupných platforiem
    platforms: [
        {
            id: 'google_ads',
            name: 'Google Ads',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>`,
            color: '#4285F4',
            description: 'Reklamy vo vyhľadávaní Google, YouTube a Display sieti',
            minBudget: 5,
            rating: 5,
            suitableFor: ['Lokálne služby', 'E-shopy', 'B2B firmy'],
            features: [
                'Search reklamy - oslovte ľudí, ktorí aktívne hľadajú',
                'YouTube video reklamy',
                'Display bannerová sieť',
                'Shopping kampane pre e-shopy',
                'Remarketing'
            ],
            setupDifficulty: 'medium',
            requiredAccounts: ['google_ads', 'google_analytics', 'gtm']
        },
        {
            id: 'meta_ads',
            name: 'Meta Ads',
            subtitle: 'Facebook & Instagram',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
            color: '#1877F2',
            description: 'Reklamy na Facebooku a Instagrame',
            minBudget: 3,
            rating: 5,
            suitableFor: ['E-commerce', 'Lokálne biznisy', 'B2C značky'],
            features: [
                'Feed reklamy na FB a IG',
                'Stories a Reels formáty',
                'Messenger reklamy',
                'Pokročilé cielenie podľa záujmov',
                'Lookalike audiences'
            ],
            setupDifficulty: 'medium',
            requiredAccounts: ['meta_business', 'meta_pixel']
        },
        {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
            color: '#0A66C2',
            description: 'B2B reklamy zamerané na profesionálov',
            minBudget: 10,
            rating: 4,
            suitableFor: ['B2B služby', 'SaaS', 'Recruitment', 'Vzdelávanie'],
            features: [
                'Cielenie podľa pozície a firmy',
                'Sponsored Content',
                'Message Ads (InMail)',
                'Lead Gen Forms',
                'Account-based marketing'
            ],
            setupDifficulty: 'easy',
            requiredAccounts: ['linkedin_ads']
        },
        {
            id: 'tiktok_ads',
            name: 'TikTok Ads',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
            color: '#000000',
            description: 'Video reklamy pre mladšiu generáciu',
            minBudget: 5,
            rating: 4,
            suitableFor: ['E-commerce', 'Móda', 'Zábava', 'Food & Beverage'],
            features: [
                'In-Feed video reklamy',
                'Spark Ads (boost organického obsahu)',
                'TopView reklamy',
                'Branded Hashtag Challenges',
                'Cielenie na Gen Z a Mileniálov'
            ],
            setupDifficulty: 'easy',
            requiredAccounts: ['tiktok_ads']
        },
        {
            id: 'pinterest_ads',
            name: 'Pinterest Ads',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>`,
            color: '#E60023',
            description: 'Vizuálne reklamy pre inšpiráciu a nákupy',
            minBudget: 3,
            rating: 3,
            suitableFor: ['Móda', 'Interiér', 'DIY', 'Recepty', 'Svadby'],
            features: [
                'Promoted Pins',
                'Shopping Ads',
                'Video Pins',
                'Carousel Ads',
                'Vysoký purchase intent'
            ],
            setupDifficulty: 'easy',
            requiredAccounts: ['pinterest_ads']
        },
        {
            id: 'microsoft_ads',
            name: 'Microsoft Ads',
            subtitle: 'Bing & Partner Sites',
            icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0v11.408l4.523 1.548V3.684l7.2 2.594v12.06l-4.52-1.548-2.68-.005V24l11.06-3.882V8.31z"/></svg>`,
            color: '#00A4EF',
            description: 'Search reklamy na Bing a partnerských stránkach',
            minBudget: 5,
            rating: 3,
            suitableFor: ['B2B', 'Staršia demografika', 'US/UK trhy'],
            features: [
                'Bing Search reklamy',
                'Microsoft Audience Network',
                'LinkedIn Profile Targeting',
                'Import z Google Ads',
                'Nižšia konkurencia = nižšie CPC'
            ],
            setupDifficulty: 'easy',
            requiredAccounts: ['microsoft_ads']
        }
    ],

    // Stav komponentu
    state: {
        selectedPlatforms: [],
        expandedInfo: null
    },

    // Event callbacks
    callbacks: {
        onChange: null,
        onLimitExceeded: null
    },

    /**
     * Inicializácia komponentu
     */
    init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('PlatformSelector: Container not found');
            return;
        }

        // Nastavenie options
        this.options = {
            maxPlatforms: options.maxPlatforms || 2,
            preselected: options.preselected || [],
            showRecommendations: options.showRecommendations !== false,
            clientType: options.clientType || 'local_business',
            ...options
        };

        // Nastavenie callbacks
        if (options.onChange) this.callbacks.onChange = options.onChange;
        if (options.onLimitExceeded) this.callbacks.onLimitExceeded = options.onLimitExceeded;

        // Predvybrané platformy
        this.state.selectedPlatforms = [...this.options.preselected];

        this.render();
        this.attachEventListeners();
    },

    /**
     * Render hlavného UI
     */
    render() {
        const html = `
            <div class="platform-selector">
                <div class="platform-selector__header">
                    <h2 class="platform-selector__title">
                        <span class="platform-selector__icon">🎯</span>
                        Kde chcete propagovať váš biznis?
                    </h2>
                    <p class="platform-selector__subtitle">
                        Vyberte platformy, na ktorých chcete spustiť reklamnú kampaň
                    </p>
                </div>

                ${this.options.showRecommendations ? this.renderRecommendation() : ''}

                <div class="platform-selector__grid">
                    ${this.platforms.map(p => this.renderPlatformCard(p)).join('')}
                </div>

                <div class="platform-selector__summary" id="platformSummary">
                    ${this.renderSummary()}
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    /**
     * Render odporúčania podľa typu klienta
     */
    renderRecommendation() {
        const recommendations = {
            local_business: {
                text: 'Pre lokálne služby odporúčame',
                platforms: ['google_ads', 'meta_ads']
            },
            ecommerce: {
                text: 'Pre e-shopy odporúčame',
                platforms: ['google_ads', 'meta_ads', 'pinterest_ads']
            },
            b2b: {
                text: 'Pre B2B firmy odporúčame',
                platforms: ['google_ads', 'linkedin_ads']
            },
            startup: {
                text: 'Pre startupy odporúčame',
                platforms: ['meta_ads', 'tiktok_ads']
            }
        };

        const rec = recommendations[this.options.clientType] || recommendations.local_business;
        const platformNames = rec.platforms
            .map(id => this.platforms.find(p => p.id === id)?.name)
            .filter(Boolean)
            .join(' + ');

        return `
            <div class="platform-selector__recommendation">
                <span class="platform-selector__recommendation-icon">💡</span>
                <span class="platform-selector__recommendation-text">
                    ${rec.text} <strong>${platformNames}</strong>
                </span>
                <button class="platform-selector__recommendation-btn" data-action="apply-recommendation" data-platforms='${JSON.stringify(rec.platforms)}'>
                    Použiť odporúčanie
                </button>
            </div>
        `;
    },

    /**
     * Render karty platformy
     */
    renderPlatformCard(platform) {
        const isSelected = this.state.selectedPlatforms.includes(platform.id);
        const stars = '★'.repeat(platform.rating) + '☆'.repeat(5 - platform.rating);

        return `
            <div class="platform-card ${isSelected ? 'platform-card--selected' : ''}" 
                 data-platform-id="${platform.id}">
                <div class="platform-card__header">
                    <div class="platform-card__checkbox">
                        <input type="checkbox" 
                               id="platform_${platform.id}" 
                               ${isSelected ? 'checked' : ''}
                               data-action="toggle-platform"
                               data-platform="${platform.id}">
                        <label for="platform_${platform.id}"></label>
                    </div>
                    <div class="platform-card__icon" style="color: ${platform.color}">
                        ${platform.icon}
                    </div>
                    <div class="platform-card__title-wrap">
                        <h3 class="platform-card__title">${platform.name}</h3>
                        ${platform.subtitle ? `<span class="platform-card__subtitle">${platform.subtitle}</span>` : ''}
                    </div>
                    <button class="platform-card__info-btn" 
                            data-action="show-info" 
                            data-platform="${platform.id}"
                            aria-label="Viac informácií o ${platform.name}">
                        <span>ⓘ</span>
                    </button>
                </div>
                
                <div class="platform-card__body">
                    <p class="platform-card__description">${platform.description}</p>
                    
                    <div class="platform-card__meta">
                        <div class="platform-card__rating" title="Odporúčanie">
                            <span class="platform-card__stars">${stars}</span>
                        </div>
                        <div class="platform-card__budget">
                            Od <strong>€${platform.minBudget}</strong>/deň
                        </div>
                    </div>
                    
                    <div class="platform-card__tags">
                        ${platform.suitableFor.slice(0, 3).map(tag => 
                            `<span class="platform-card__tag">${tag}</span>`
                        ).join('')}
                    </div>
                </div>
                
                <!-- Mobile: Expandable info -->
                <div class="platform-card__mobile-info" id="mobileInfo_${platform.id}">
                    <button class="platform-card__expand-btn" 
                            data-action="toggle-mobile-info"
                            data-platform="${platform.id}">
                        Viac info <span class="platform-card__expand-arrow">▼</span>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render súhrnu výberu
     */
    renderSummary() {
        const count = this.state.selectedPlatforms.length;
        const limit = this.options.maxPlatforms;
        const isOverLimit = count > limit;

        if (count === 0) {
            return `
                <div class="platform-summary platform-summary--empty">
                    <span class="platform-summary__icon">📋</span>
                    <span class="platform-summary__text">Zatiaľ ste nevybrali žiadnu platformu</span>
                </div>
            `;
        }

        const selectedNames = this.state.selectedPlatforms
            .map(id => this.platforms.find(p => p.id === id)?.name)
            .filter(Boolean);

        const totalMinBudget = this.state.selectedPlatforms
            .map(id => this.platforms.find(p => p.id === id)?.minBudget || 0)
            .reduce((a, b) => a + b, 0);

        return `
            <div class="platform-summary ${isOverLimit ? 'platform-summary--warning' : 'platform-summary--active'}">
                <div class="platform-summary__content">
                    <div class="platform-summary__selected">
                        <span class="platform-summary__icon">${isOverLimit ? '⚠️' : '✅'}</span>
                        <span class="platform-summary__label">Vybrané:</span>
                        <strong class="platform-summary__names">${selectedNames.join(', ')}</strong>
                    </div>
                    <div class="platform-summary__stats">
                        <span class="platform-summary__count ${isOverLimit ? 'platform-summary__count--over' : ''}">
                            ${count}/${limit} platforiem
                        </span>
                        <span class="platform-summary__budget">
                            Min. budget: €${totalMinBudget}/deň
                        </span>
                    </div>
                </div>
                ${isOverLimit ? `
                    <div class="platform-summary__warning">
                        <p>Prekročili ste limit vášho balíka. 
                           <button class="platform-summary__upgrade-btn" data-action="show-upgrade">
                               Prejsť na vyšší balík →
                           </button>
                        </p>
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Pripojenie event listenerov
     */
    attachEventListeners() {
        this.container.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            const platform = e.target.closest('[data-platform]')?.dataset.platform;

            switch (action) {
                case 'toggle-platform':
                    this.togglePlatform(platform);
                    break;
                case 'show-info':
                    this.showPlatformInfo(platform);
                    break;
                case 'toggle-mobile-info':
                    this.toggleMobileInfo(platform);
                    break;
                case 'apply-recommendation':
                    const platforms = JSON.parse(e.target.dataset.platforms);
                    this.applyRecommendation(platforms);
                    break;
                case 'show-upgrade':
                    this.showUpgradeModal();
                    break;
            }
        });

        // Checkbox change handler
        this.container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.dataset.action === 'toggle-platform') {
                this.togglePlatform(e.target.dataset.platform);
            }
        });
    },

    /**
     * Toggle výberu platformy
     */
    togglePlatform(platformId) {
        const index = this.state.selectedPlatforms.indexOf(platformId);
        
        if (index > -1) {
            // Odstránenie
            this.state.selectedPlatforms.splice(index, 1);
        } else {
            // Pridanie
            this.state.selectedPlatforms.push(platformId);
        }

        // Update UI
        this.updateCardState(platformId);
        this.updateSummary();

        // Callback
        if (this.callbacks.onChange) {
            this.callbacks.onChange(this.state.selectedPlatforms);
        }

        // Check limit
        if (this.state.selectedPlatforms.length > this.options.maxPlatforms) {
            if (this.callbacks.onLimitExceeded) {
                this.callbacks.onLimitExceeded(this.state.selectedPlatforms, this.options.maxPlatforms);
            }
        }
    },

    /**
     * Update stavu karty
     */
    updateCardState(platformId) {
        const card = this.container.querySelector(`[data-platform-id="${platformId}"]`);
        const isSelected = this.state.selectedPlatforms.includes(platformId);
        
        if (card) {
            card.classList.toggle('platform-card--selected', isSelected);
            const checkbox = card.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = isSelected;
        }
    },

    /**
     * Update súhrnu
     */
    updateSummary() {
        const summaryEl = document.getElementById('platformSummary');
        if (summaryEl) {
            summaryEl.innerHTML = this.renderSummary();
        }
    },

    /**
     * Zobrazenie info o platforme (modal/bottom sheet)
     */
    showPlatformInfo(platformId) {
        const platform = this.platforms.find(p => p.id === platformId);
        if (!platform) return;

        // Detekcia mobile
        const isMobile = window.innerWidth < 768;

        if (isMobile) {
            this.showBottomSheet(platform);
        } else {
            this.showModal(platform);
        }
    },

    /**
     * Modal pre desktop
     */
    showModal(platform) {
        const stars = '★'.repeat(platform.rating) + '☆'.repeat(5 - platform.rating);
        
        const modalHtml = `
            <div class="platform-modal" id="platformModal">
                <div class="platform-modal__backdrop" data-action="close-modal"></div>
                <div class="platform-modal__content">
                    <button class="platform-modal__close" data-action="close-modal">×</button>
                    
                    <div class="platform-modal__header" style="border-color: ${platform.color}">
                        <div class="platform-modal__icon" style="color: ${platform.color}">
                            ${platform.icon}
                        </div>
                        <div>
                            <h2 class="platform-modal__title">${platform.name}</h2>
                            ${platform.subtitle ? `<span class="platform-modal__subtitle">${platform.subtitle}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="platform-modal__body">
                        <div class="platform-modal__section">
                            <h3>📍 Čo je ${platform.name}?</h3>
                            <p>${platform.description}</p>
                        </div>
                        
                        <div class="platform-modal__section">
                            <h3>✅ Funkcie a možnosti</h3>
                            <ul class="platform-modal__features">
                                ${platform.features.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                        
                        <div class="platform-modal__section">
                            <h3>👥 Vhodné pre</h3>
                            <div class="platform-modal__tags">
                                ${platform.suitableFor.map(tag => 
                                    `<span class="platform-modal__tag">${tag}</span>`
                                ).join('')}
                            </div>
                        </div>
                        
                        <div class="platform-modal__stats">
                            <div class="platform-modal__stat">
                                <span class="platform-modal__stat-label">Hodnotenie</span>
                                <span class="platform-modal__stat-value">${stars}</span>
                            </div>
                            <div class="platform-modal__stat">
                                <span class="platform-modal__stat-label">Min. budget</span>
                                <span class="platform-modal__stat-value">€${platform.minBudget}/deň</span>
                            </div>
                            <div class="platform-modal__stat">
                                <span class="platform-modal__stat-label">Náročnosť</span>
                                <span class="platform-modal__stat-value">${this.getDifficultyLabel(platform.setupDifficulty)}</span>
                            </div>
                        </div>
                        
                        <div class="platform-modal__cta">
                            <a href="#" class="platform-modal__video-btn" target="_blank">
                                📹 Pozrieť video návod (2 min)
                            </a>
                        </div>
                    </div>
                    
                    <div class="platform-modal__footer">
                        <button class="platform-modal__btn platform-modal__btn--secondary" data-action="close-modal">
                            Zavrieť
                        </button>
                        <button class="platform-modal__btn platform-modal__btn--primary" 
                                data-action="select-and-close"
                                data-platform="${platform.id}">
                            ${this.state.selectedPlatforms.includes(platform.id) ? 'Odstrániť z výberu' : 'Pridať do výberu'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';

        // Event listeners
        const modal = document.getElementById('platformModal');
        modal.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'close-modal') {
                this.closeModal();
            } else if (action === 'select-and-close') {
                this.togglePlatform(e.target.dataset.platform);
                this.closeModal();
            }
        });

        // ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Animácia
        requestAnimationFrame(() => {
            modal.classList.add('platform-modal--visible');
        });
    },

    /**
     * Bottom sheet pre mobile
     */
    showBottomSheet(platform) {
        const stars = '★'.repeat(platform.rating) + '☆'.repeat(5 - platform.rating);
        
        const sheetHtml = `
            <div class="platform-sheet" id="platformSheet">
                <div class="platform-sheet__backdrop" data-action="close-sheet"></div>
                <div class="platform-sheet__content">
                    <div class="platform-sheet__handle"></div>
                    
                    <div class="platform-sheet__header" style="border-color: ${platform.color}">
                        <div class="platform-sheet__icon" style="color: ${platform.color}">
                            ${platform.icon}
                        </div>
                        <div>
                            <h2 class="platform-sheet__title">${platform.name}</h2>
                            <span class="platform-sheet__rating">${stars}</span>
                        </div>
                    </div>
                    
                    <div class="platform-sheet__body">
                        <p class="platform-sheet__description">${platform.description}</p>
                        
                        <div class="platform-sheet__section">
                            <h4>Funkcie</h4>
                            <ul>
                                ${platform.features.slice(0, 4).map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        </div>
                        
                        <div class="platform-sheet__meta">
                            <span>Min. €${platform.minBudget}/deň</span>
                            <span>${this.getDifficultyLabel(platform.setupDifficulty)}</span>
                        </div>
                    </div>
                    
                    <div class="platform-sheet__footer">
                        <button class="platform-sheet__btn" 
                                data-action="select-and-close-sheet"
                                data-platform="${platform.id}">
                            ${this.state.selectedPlatforms.includes(platform.id) ? 'Odstrániť' : 'Pridať'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', sheetHtml);
        document.body.style.overflow = 'hidden';

        const sheet = document.getElementById('platformSheet');
        sheet.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'close-sheet') {
                this.closeBottomSheet();
            } else if (action === 'select-and-close-sheet') {
                this.togglePlatform(e.target.dataset.platform);
                this.closeBottomSheet();
            }
        });

        // Animácia
        requestAnimationFrame(() => {
            sheet.classList.add('platform-sheet--visible');
        });
    },

    /**
     * Zatvorenie modalu
     */
    closeModal() {
        const modal = document.getElementById('platformModal');
        if (modal) {
            modal.classList.remove('platform-modal--visible');
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        }
    },

    /**
     * Zatvorenie bottom sheetu
     */
    closeBottomSheet() {
        const sheet = document.getElementById('platformSheet');
        if (sheet) {
            sheet.classList.remove('platform-sheet--visible');
            setTimeout(() => {
                sheet.remove();
                document.body.style.overflow = '';
            }, 300);
        }
    },

    /**
     * Aplikácia odporúčania
     */
    applyRecommendation(platforms) {
        this.state.selectedPlatforms = [...platforms];
        
        // Update všetkých kariet
        this.platforms.forEach(p => {
            this.updateCardState(p.id);
        });
        
        this.updateSummary();

        if (this.callbacks.onChange) {
            this.callbacks.onChange(this.state.selectedPlatforms);
        }
    },

    /**
     * Toggle mobile info
     */
    toggleMobileInfo(platformId) {
        const card = this.container.querySelector(`[data-platform-id="${platformId}"]`);
        if (card) {
            card.classList.toggle('platform-card--expanded');
        }
    },

    /**
     * Zobrazenie upgrade modalu
     */
    showUpgradeModal() {
        // Delegované na PackageCalculator
        if (window.PackageCalculator) {
            window.PackageCalculator.showUpgradeModal(this.state.selectedPlatforms);
        } else {
            console.log('PackageCalculator not loaded');
        }
    },

    /**
     * Pomocná funkcia pre label náročnosti
     */
    getDifficultyLabel(difficulty) {
        const labels = {
            easy: '🟢 Jednoduchá',
            medium: '🟡 Stredná',
            hard: '🔴 Pokročilá'
        };
        return labels[difficulty] || difficulty;
    },

    /**
     * Získanie vybraných platforiem
     */
    getSelected() {
        return this.state.selectedPlatforms;
    },

    /**
     * Získanie detailov vybraných platforiem
     */
    getSelectedDetails() {
        return this.state.selectedPlatforms
            .map(id => this.platforms.find(p => p.id === id))
            .filter(Boolean);
    },

    /**
     * Nastavenie limitu platforiem
     */
    setMaxPlatforms(limit) {
        this.options.maxPlatforms = limit;
        this.updateSummary();
    }
};

// Export pre použitie v iných moduloch
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatformSelector;
} else {
    window.PlatformSelector = PlatformSelector;
}
