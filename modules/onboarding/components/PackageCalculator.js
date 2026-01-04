/**
 * Adlify - Package Calculator Component
 * Automatický výpočet balíka na základe výberu platforiem + Upsell logika
 */

const PackageCalculator = {
    // Definícia balíkov
    packages: {
        starter: {
            id: 'starter',
            name: 'STARTER',
            price: 149,
            priceYearly: 1490, // 2 mesiace zadarmo
            color: '#10b981',
            icon: '🚀',
            limits: {
                platforms: 2,
                campaigns: 5,
                adSpend: 500,
                keywords: 100,
                reports: 'basic',
                support: 'email',
                aiAnalysis: false,
                dedicatedManager: false
            },
            features: [
                'Až 2 reklamné platformy',
                '5 aktívnych kampaní',
                'Max. €500/mesiac ad spend',
                'Základné reporty (týždenné)',
                'Email podpora',
                'Automatické optimalizácie'
            ]
        },
        professional: {
            id: 'professional',
            name: 'PROFESSIONAL',
            price: 329,
            priceYearly: 3290,
            color: '#6366f1',
            icon: '⭐',
            popular: true,
            limits: {
                platforms: 4,
                campaigns: 15,
                adSpend: 2000,
                keywords: 500,
                reports: 'advanced',
                support: 'priority',
                aiAnalysis: true,
                dedicatedManager: false
            },
            features: [
                'Až 4 reklamné platformy',
                '15 aktívnych kampaní',
                'Max. €2,000/mesiac ad spend',
                'Pokročilé reporty (denné)',
                'Prioritná podpora',
                'AI analýza a odporúčania',
                'A/B testovanie kampaní',
                'Konkurenčná analýza'
            ]
        },
        premium: {
            id: 'premium',
            name: 'PREMIUM',
            price: 929,
            priceYearly: 9290,
            color: '#f59e0b',
            icon: '👑',
            limits: {
                platforms: Infinity,
                campaigns: Infinity,
                adSpend: 10000,
                keywords: Infinity,
                reports: 'custom',
                support: 'dedicated',
                aiAnalysis: true,
                dedicatedManager: true
            },
            features: [
                'Neobmedzené platformy',
                'Neobmedzené kampane',
                'Max. €10,000/mesiac ad spend',
                'Custom reporty (real-time)',
                'Dedikovaný account manager',
                'AI stratégia a predikcie',
                'Multi-brand management',
                'API prístup',
                'White-label reporty'
            ]
        }
    },

    // Upsell triggery
    upsellTriggers: {
        platformLimit: {
            threshold: 1, // Keď prekročí limit
            message: 'Vybrali ste viac platforiem, než váš balík podporuje',
            priority: 'high'
        },
        campaignLimit: {
            threshold: 0.8, // 80% kapacity
            message: 'Blížite sa k limitu kampaní',
            priority: 'medium'
        },
        adSpendLimit: {
            threshold: 0.8,
            message: 'Váš reklamný rozpočet presahuje limit balíka',
            priority: 'high'
        },
        featureRequest: {
            features: ['aiAnalysis', 'dedicatedManager'],
            message: 'Táto funkcia je dostupná vo vyššom balíku',
            priority: 'low'
        }
    },

    // Stav
    state: {
        selectedPackage: null,
        selectedPlatforms: [],
        estimatedAdSpend: 0,
        billingCycle: 'monthly'
    },

    // Callbacks
    callbacks: {
        onPackageChange: null,
        onUpgrade: null
    },

    /**
     * Inicializácia
     */
    init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('PackageCalculator: Container not found');
            return;
        }

        this.options = {
            showComparison: options.showComparison !== false,
            defaultPackage: options.defaultPackage || null,
            platforms: options.platforms || [],
            ...options
        };

        if (options.onPackageChange) this.callbacks.onPackageChange = options.onPackageChange;
        if (options.onUpgrade) this.callbacks.onUpgrade = options.onUpgrade;

        this.state.selectedPlatforms = this.options.platforms;
        this.calculateRecommendedPackage();
        this.render();
        this.attachEventListeners();
    },

    /**
     * Výpočet odporúčaného balíka
     */
    calculateRecommendedPackage() {
        const platformCount = this.state.selectedPlatforms.length;
        const adSpend = this.state.estimatedAdSpend;

        // Logika výberu balíka
        if (platformCount <= 2 && adSpend <= 500) {
            this.state.selectedPackage = 'starter';
        } else if (platformCount <= 4 && adSpend <= 2000) {
            this.state.selectedPackage = 'professional';
        } else {
            this.state.selectedPackage = 'premium';
        }

        return this.state.selectedPackage;
    },

    /**
     * Kontrola upsell triggerov
     */
    checkUpsellTriggers() {
        const triggers = [];
        const currentPackage = this.packages[this.state.selectedPackage];
        
        if (!currentPackage) return triggers;

        // Platform limit
        if (this.state.selectedPlatforms.length > currentPackage.limits.platforms) {
            triggers.push({
                type: 'platformLimit',
                current: this.state.selectedPlatforms.length,
                limit: currentPackage.limits.platforms,
                ...this.upsellTriggers.platformLimit
            });
        }

        // Ad spend limit
        if (this.state.estimatedAdSpend > currentPackage.limits.adSpend) {
            triggers.push({
                type: 'adSpendLimit',
                current: this.state.estimatedAdSpend,
                limit: currentPackage.limits.adSpend,
                ...this.upsellTriggers.adSpendLimit
            });
        }

        return triggers;
    },

    /**
     * Hlavný render
     */
    render() {
        const triggers = this.checkUpsellTriggers();
        const hasWarnings = triggers.length > 0;

        const html = `
            <div class="package-calculator">
                <div class="package-calculator__header">
                    <h2 class="package-calculator__title">
                        <span class="package-calculator__icon">📦</span>
                        Vyberte si balík
                    </h2>
                    <p class="package-calculator__subtitle">
                        Na základe vášho výberu vám odporúčame balík 
                        <strong>${this.packages[this.state.selectedPackage]?.name}</strong>
                    </p>
                </div>

                ${hasWarnings ? this.renderWarnings(triggers) : ''}

                <div class="package-calculator__toggle">
                    <button class="package-toggle__btn ${this.state.billingCycle === 'monthly' ? 'package-toggle__btn--active' : ''}" 
                            data-action="set-billing" data-cycle="monthly">
                        Mesačne
                    </button>
                    <button class="package-toggle__btn ${this.state.billingCycle === 'yearly' ? 'package-toggle__btn--active' : ''}" 
                            data-action="set-billing" data-cycle="yearly">
                        Ročne <span class="package-toggle__badge">-17%</span>
                    </button>
                </div>

                <div class="package-calculator__grid">
                    ${Object.values(this.packages).map(pkg => this.renderPackageCard(pkg)).join('')}
                </div>

                ${this.options.showComparison ? this.renderComparisonTable() : ''}
            </div>
        `;

        this.container.innerHTML = html;
    },

    /**
     * Render varovanie o prekročení limitov
     */
    renderWarnings(triggers) {
        return `
            <div class="package-warnings">
                ${triggers.map(t => `
                    <div class="package-warning package-warning--${t.priority}">
                        <span class="package-warning__icon">⚠️</span>
                        <div class="package-warning__content">
                            <strong>${t.message}</strong>
                            <p>Aktuálne: ${t.current} / Limit: ${t.limit === Infinity ? 'Neobmedzené' : t.limit}</p>
                        </div>
                        <button class="package-warning__btn" data-action="show-upgrade">
                            Upgradovať →
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render karty balíka
     */
    renderPackageCard(pkg) {
        const isSelected = this.state.selectedPackage === pkg.id;
        const isRecommended = this.calculateRecommendedPackage() === pkg.id;
        const price = this.state.billingCycle === 'yearly' 
            ? Math.round(pkg.priceYearly / 12) 
            : pkg.price;
        const limits = pkg.limits;

        // Check if package fits current needs
        const fits = this.state.selectedPlatforms.length <= limits.platforms &&
                     this.state.estimatedAdSpend <= limits.adSpend;

        return `
            <div class="package-card ${isSelected ? 'package-card--selected' : ''} 
                        ${pkg.popular ? 'package-card--popular' : ''}
                        ${!fits ? 'package-card--insufficient' : ''}"
                 data-package="${pkg.id}"
                 style="--package-color: ${pkg.color}">
                
                ${pkg.popular ? '<div class="package-card__badge">Najpopulárnejší</div>' : ''}
                ${isRecommended && !pkg.popular ? '<div class="package-card__badge package-card__badge--recommended">Odporúčame</div>' : ''}
                
                <div class="package-card__header">
                    <span class="package-card__icon">${pkg.icon}</span>
                    <h3 class="package-card__name">${pkg.name}</h3>
                </div>
                
                <div class="package-card__price">
                    <span class="package-card__currency">€</span>
                    <span class="package-card__amount">${price}</span>
                    <span class="package-card__period">/mes</span>
                </div>
                
                ${this.state.billingCycle === 'yearly' ? `
                    <div class="package-card__yearly">
                        €${pkg.priceYearly}/rok (ušetríte €${pkg.price * 12 - pkg.priceYearly})
                    </div>
                ` : ''}
                
                <div class="package-card__limits">
                    <div class="package-card__limit ${this.state.selectedPlatforms.length > limits.platforms ? 'package-card__limit--exceeded' : ''}">
                        <span class="package-card__limit-icon">📱</span>
                        <span>${limits.platforms === Infinity ? 'Neobmedzené' : limits.platforms} platformy</span>
                    </div>
                    <div class="package-card__limit">
                        <span class="package-card__limit-icon">📊</span>
                        <span>${limits.campaigns === Infinity ? 'Neobmedzené' : limits.campaigns} kampaní</span>
                    </div>
                    <div class="package-card__limit ${this.state.estimatedAdSpend > limits.adSpend ? 'package-card__limit--exceeded' : ''}">
                        <span class="package-card__limit-icon">💰</span>
                        <span>€${limits.adSpend.toLocaleString()}/mes ad spend</span>
                    </div>
                </div>
                
                <ul class="package-card__features">
                    ${pkg.features.slice(0, 5).map(f => `
                        <li class="package-card__feature">
                            <span class="package-card__feature-check">✓</span>
                            ${f}
                        </li>
                    `).join('')}
                    ${pkg.features.length > 5 ? `
                        <li class="package-card__feature package-card__feature--more">
                            +${pkg.features.length - 5} ďalších funkcií
                        </li>
                    ` : ''}
                </ul>
                
                <button class="package-card__btn ${isSelected ? 'package-card__btn--selected' : ''}"
                        data-action="select-package"
                        data-package="${pkg.id}">
                    ${isSelected ? '✓ Vybraný' : 'Vybrať balík'}
                </button>
            </div>
        `;
    },

    /**
     * Render porovnávacej tabuľky
     */
    renderComparisonTable() {
        const features = [
            { name: 'Reklamné platformy', key: 'platforms', format: v => v === Infinity ? 'Neobmedzené' : v },
            { name: 'Aktívne kampane', key: 'campaigns', format: v => v === Infinity ? 'Neobmedzené' : v },
            { name: 'Mesačný ad spend', key: 'adSpend', format: v => `€${v.toLocaleString()}` },
            { name: 'Reporty', key: 'reports', format: v => ({ basic: 'Základné', advanced: 'Pokročilé', custom: 'Custom' }[v]) },
            { name: 'Podpora', key: 'support', format: v => ({ email: 'Email', priority: 'Prioritná', dedicated: 'Dedikovaná' }[v]) },
            { name: 'AI analýza', key: 'aiAnalysis', format: v => v ? '✓' : '—' },
            { name: 'Dedikovaný manager', key: 'dedicatedManager', format: v => v ? '✓' : '—' }
        ];

        return `
            <div class="package-comparison">
                <h3 class="package-comparison__title">Porovnanie balíkov</h3>
                <div class="package-comparison__table-wrap">
                    <table class="package-comparison__table">
                        <thead>
                            <tr>
                                <th>Funkcia</th>
                                ${Object.values(this.packages).map(p => `
                                    <th style="color: ${p.color}">${p.icon} ${p.name}</th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${features.map(f => `
                                <tr>
                                    <td>${f.name}</td>
                                    ${Object.values(this.packages).map(p => `
                                        <td>${f.format(p.limits[f.key])}</td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /**
     * Event listeners
     */
    attachEventListeners() {
        this.container.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            
            switch (action) {
                case 'select-package':
                    const packageId = e.target.dataset.package;
                    this.selectPackage(packageId);
                    break;
                case 'set-billing':
                    const cycle = e.target.dataset.cycle;
                    this.setBillingCycle(cycle);
                    break;
                case 'show-upgrade':
                    this.showUpgradeModal();
                    break;
            }
        });
    },

    /**
     * Výber balíka
     */
    selectPackage(packageId) {
        this.state.selectedPackage = packageId;
        this.render();
        
        if (this.callbacks.onPackageChange) {
            this.callbacks.onPackageChange(this.packages[packageId]);
        }
    },

    /**
     * Nastavenie fakturačného cyklu
     */
    setBillingCycle(cycle) {
        this.state.billingCycle = cycle;
        this.render();
    },

    /**
     * Update platforiem z vonku
     */
    updatePlatforms(platforms) {
        this.state.selectedPlatforms = platforms;
        this.calculateRecommendedPackage();
        this.render();
    },

    /**
     * Update ad spend
     */
    updateAdSpend(amount) {
        this.state.estimatedAdSpend = amount;
        this.calculateRecommendedPackage();
        this.render();
    },

    /**
     * Zobrazenie upgrade modalu
     */
    showUpgradeModal(suggestedPackage = null) {
        const currentPkg = this.packages[this.state.selectedPackage];
        const nextPkg = suggestedPackage 
            ? this.packages[suggestedPackage]
            : this.getNextPackage();

        if (!nextPkg) {
            console.log('Already on highest package');
            return;
        }

        const modalHtml = `
            <div class="upgrade-modal" id="upgradeModal">
                <div class="upgrade-modal__backdrop" data-action="close-upgrade"></div>
                <div class="upgrade-modal__content">
                    <button class="upgrade-modal__close" data-action="close-upgrade">×</button>
                    
                    <div class="upgrade-modal__header">
                        <span class="upgrade-modal__icon">🚀</span>
                        <h2>Upgrade pre lepšie výsledky</h2>
                    </div>
                    
                    <div class="upgrade-modal__body">
                        <p class="upgrade-modal__reason">
                            ${this.getUpgradeReason()}
                        </p>
                        
                        <div class="upgrade-modal__comparison">
                            <div class="upgrade-modal__package upgrade-modal__package--current">
                                <span class="upgrade-modal__package-label">Aktuálne</span>
                                <h3>${currentPkg.icon} ${currentPkg.name}</h3>
                                <p class="upgrade-modal__package-price">€${currentPkg.price}/mes</p>
                                <ul>
                                    <li>${currentPkg.limits.platforms} platformy</li>
                                    <li>${currentPkg.limits.campaigns} kampaní</li>
                                    <li>€${currentPkg.limits.adSpend.toLocaleString()} ad spend</li>
                                </ul>
                            </div>
                            
                            <div class="upgrade-modal__arrow">→</div>
                            
                            <div class="upgrade-modal__package upgrade-modal__package--new">
                                <span class="upgrade-modal__package-label">Odporúčané</span>
                                <h3>${nextPkg.icon} ${nextPkg.name}</h3>
                                <p class="upgrade-modal__package-price">€${nextPkg.price}/mes</p>
                                <ul>
                                    <li>${nextPkg.limits.platforms === Infinity ? 'Neobmedzené' : nextPkg.limits.platforms} platformy</li>
                                    <li>${nextPkg.limits.campaigns === Infinity ? 'Neobmedzené' : nextPkg.limits.campaigns} kampaní</li>
                                    <li>€${nextPkg.limits.adSpend.toLocaleString()} ad spend</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div class="upgrade-modal__benefits">
                            <h4>Čo získate navyše:</h4>
                            <ul>
                                ${this.getUpgradeBenefits(currentPkg, nextPkg).map(b => `
                                    <li>✓ ${b}</li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                    
                    <div class="upgrade-modal__footer">
                        <button class="upgrade-modal__btn upgrade-modal__btn--secondary" 
                                data-action="close-upgrade">
                            Zostať na ${currentPkg.name}
                        </button>
                        <button class="upgrade-modal__btn upgrade-modal__btn--primary"
                                data-action="confirm-upgrade"
                                data-package="${nextPkg.id}">
                            Prejsť na ${nextPkg.name}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';

        const modal = document.getElementById('upgradeModal');
        
        // Event listeners
        modal.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'close-upgrade') {
                this.closeUpgradeModal();
            } else if (action === 'confirm-upgrade') {
                const newPackage = e.target.dataset.package;
                this.selectPackage(newPackage);
                this.closeUpgradeModal();
                if (this.callbacks.onUpgrade) {
                    this.callbacks.onUpgrade(this.packages[newPackage]);
                }
            }
        });

        // Animácia
        requestAnimationFrame(() => {
            modal.classList.add('upgrade-modal--visible');
        });
    },

    /**
     * Zatvorenie upgrade modalu
     */
    closeUpgradeModal() {
        const modal = document.getElementById('upgradeModal');
        if (modal) {
            modal.classList.remove('upgrade-modal--visible');
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        }
    },

    /**
     * Získanie nasledujúceho balíka
     */
    getNextPackage() {
        const order = ['starter', 'professional', 'premium'];
        const currentIndex = order.indexOf(this.state.selectedPackage);
        if (currentIndex < order.length - 1) {
            return this.packages[order[currentIndex + 1]];
        }
        return null;
    },

    /**
     * Dôvod pre upgrade
     */
    getUpgradeReason() {
        const triggers = this.checkUpsellTriggers();
        if (triggers.length > 0) {
            return triggers[0].message;
        }
        return 'Prejdite na vyšší balík pre viac funkcií a vyšší výkon.';
    },

    /**
     * Benefity upgrade
     */
    getUpgradeBenefits(currentPkg, nextPkg) {
        const benefits = [];
        
        if (nextPkg.limits.platforms > currentPkg.limits.platforms) {
            const diff = nextPkg.limits.platforms === Infinity 
                ? 'Neobmedzené' 
                : `+${nextPkg.limits.platforms - currentPkg.limits.platforms}`;
            benefits.push(`${diff} platformy`);
        }
        
        if (nextPkg.limits.campaigns > currentPkg.limits.campaigns) {
            const diff = nextPkg.limits.campaigns === Infinity 
                ? 'Neobmedzené' 
                : `+${nextPkg.limits.campaigns - currentPkg.limits.campaigns}`;
            benefits.push(`${diff} kampaní`);
        }
        
        if (nextPkg.limits.adSpend > currentPkg.limits.adSpend) {
            benefits.push(`+€${(nextPkg.limits.adSpend - currentPkg.limits.adSpend).toLocaleString()} ad spend`);
        }
        
        if (nextPkg.limits.aiAnalysis && !currentPkg.limits.aiAnalysis) {
            benefits.push('AI analýza a odporúčania');
        }
        
        if (nextPkg.limits.dedicatedManager && !currentPkg.limits.dedicatedManager) {
            benefits.push('Dedikovaný account manager');
        }

        return benefits;
    },

    /**
     * Získanie aktuálneho balíka
     */
    getSelectedPackage() {
        return this.packages[this.state.selectedPackage];
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PackageCalculator;
} else {
    window.PackageCalculator = PackageCalculator;
}
