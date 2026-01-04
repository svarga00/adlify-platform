/**
 * Adlify - Package Calculator Component v2.0
 * Aktualizované podľa reálnych Adlify cenníkov
 */

const PackageCalculator = {
    // Definícia balíkov podľa Adlify cenníka
    packages: {
        starter: {
            id: 'starter',
            name: 'Starter',
            tagline: 'Pre začiatok',
            price: 149,
            price6m: Math.round(149 * 0.9), // -10%
            price12m: Math.round(149 * 0.8), // -20%
            color: '#3B82F6', // blue
            icon: '🚀',
            description: 'Ideálne pre živnostníkov, ktorí chcú vyskúšať online reklamu',
            limits: {
                platforms: 1,
                campaigns: 1,
                visuals: 2,
                abTesting: false,
                remarketing: false,
                optimization: 'monthly',
                accountManager: false,
                support: 'email'
            },
            features: [
                '1 reklamná platforma',
                '1 kampaň',
                '2 reklamné vizuály',
                'Reklamné texty (copy)',
                'Základná optimalizácia',
                'Mesačný report',
                'Email podpora'
            ]
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            tagline: 'Najobľúbenejšie',
            price: 249,
            price6m: Math.round(249 * 0.9),
            price12m: Math.round(249 * 0.8),
            color: '#F97316', // orange (gradient start)
            colorEnd: '#EC4899', // pink (gradient end)
            icon: '⭐',
            popular: true,
            description: 'Pre firmy, ktoré chcú rásť na viacerých platformách',
            limits: {
                platforms: 2,
                campaigns: 3,
                visuals: 4,
                abTesting: true,
                remarketing: false,
                optimization: 'biweekly',
                accountManager: false,
                support: 'email_phone'
            },
            features: [
                '2 platformy (FB/IG + Google)',
                'Až 3 kampane súčasne',
                '4 reklamné vizuály',
                'A/B testovanie',
                'Optimalizácia každé 2 týždne',
                'Detailný report',
                'Email + telefón podpora'
            ]
        },
        enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            tagline: 'Pre firmy',
            price: 399,
            price6m: Math.round(399 * 0.9),
            price12m: Math.round(399 * 0.8),
            color: '#8B5CF6', // purple
            icon: '💎',
            description: 'Pre e-shopy a firmy s vyšším rozpočtom na reklamu',
            limits: {
                platforms: Infinity,
                campaigns: 5,
                visuals: 8,
                abTesting: 'advanced',
                remarketing: true,
                optimization: 'weekly',
                accountManager: false,
                support: 'priority_whatsapp'
            },
            features: [
                'Všetky platformy + remarketing',
                'Až 5 kampaní súčasne',
                '8 reklamných vizuálov',
                'Pokročilé A/B testovanie',
                'Týždenná optimalizácia',
                'Strategické konzultácie',
                'Prioritná podpora + WhatsApp'
            ]
        },
        premium: {
            id: 'premium',
            name: 'Premium',
            tagline: 'VIP',
            price: 799,
            priceFrom: true, // "od 799€"
            price6m: Math.round(799 * 0.9),
            price12m: Math.round(799 * 0.8),
            color: '#F59E0B', // amber/gold
            icon: '👑',
            description: 'Individuálna cena podľa rozsahu a potrieb vášho projektu',
            limits: {
                platforms: Infinity,
                campaigns: Infinity,
                visuals: Infinity,
                abTesting: 'advanced',
                remarketing: true,
                optimization: 'daily',
                accountManager: true,
                support: 'vip_24_7'
            },
            features: [
                'Všetky platformy + remarketing',
                'Neobmedzený počet kampaní',
                'Neobmedzené vizuály',
                'Dedikovaný account manager',
                'Denná optimalizácia',
                'Mesačné strategické stretnutia',
                '24/7 VIP podpora'
            ]
        }
    },

    // Billing cycles
    billingCycles: {
        monthly: { id: 'monthly', label: 'Mesačne', discount: 0, badge: null },
        '6months': { id: '6months', label: '6 mesiacov', discount: 10, badge: '-10%' },
        '12months': { id: '12months', label: '12 mesiacov', discount: 20, badge: '-20%' }
    },

    // Porovnávacia tabuľka
    comparisonFeatures: [
        { key: 'platforms', label: 'Platformy', format: v => v === Infinity ? 'Všetky' : v },
        { key: 'campaigns', label: 'Počet kampaní', format: v => v === Infinity ? 'Neobmedzene' : v },
        { key: 'visuals', label: 'Reklamné vizuály', format: v => v === Infinity ? 'Neobmedzene' : v },
        { key: 'abTesting', label: 'A/B testovanie', format: v => v === 'advanced' ? '✓ Pokročilé' : (v ? '✓' : '—') },
        { key: 'remarketing', label: 'Remarketing', format: v => v ? '✓' : '—' },
        { key: 'optimization', label: 'Frekvencia optimalizácie', format: v => ({
            'monthly': 'Mesačne',
            'biweekly': 'Každé 2 týždne',
            'weekly': 'Týždenne',
            'daily': 'Denne'
        }[v] || v) },
        { key: 'accountManager', label: 'Account manager', format: v => v ? '✓ Dedikovaný' : '—' },
        { key: 'support', label: 'Podpora', format: v => ({
            'email': 'Email',
            'email_phone': 'Email + Telefón',
            'priority_whatsapp': 'Prioritná + WhatsApp',
            'vip_24_7': '24/7 VIP'
        }[v] || v) }
    ],

    // Stav
    state: {
        selectedPackage: null,
        billingCycle: 'monthly',
        selectedPlatforms: []
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
            showContactForPremium: options.showContactForPremium !== false,
            ...options
        };

        if (options.onPackageChange) this.callbacks.onPackageChange = options.onPackageChange;
        if (options.onUpgrade) this.callbacks.onUpgrade = options.onUpgrade;

        this.state.selectedPlatforms = this.options.platforms;
        
        // Auto-select recommended package
        if (!this.state.selectedPackage) {
            this.state.selectedPackage = this.options.defaultPackage || 'pro';
        }
        
        this.render();
        this.attachEventListeners();
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
     * Hlavný render
     */
    render() {
        const html = `
            <div class="package-calculator">
                <div class="package-calculator__header">
                    <h2 class="package-calculator__title">
                        <span class="package-calculator__icon">💎</span>
                        Vyberte si balík
                    </h2>
                    <p class="package-calculator__subtitle">
                        Vyberte balík, ktorý najlepšie vyhovuje vašim potrebám
                    </p>
                </div>

                <!-- Billing Toggle -->
                <div class="package-calculator__toggle">
                    ${Object.values(this.billingCycles).map(cycle => `
                        <button class="package-toggle__btn ${this.state.billingCycle === cycle.id ? 'package-toggle__btn--active' : ''}" 
                                data-action="set-billing" data-cycle="${cycle.id}">
                            ${cycle.label}
                            ${cycle.badge ? `<span class="package-toggle__badge">${cycle.badge}</span>` : ''}
                        </button>
                    `).join('')}
                </div>

                <!-- Package Cards -->
                <div class="package-calculator__grid">
                    ${Object.values(this.packages).map(pkg => this.renderPackageCard(pkg)).join('')}
                </div>

                ${this.options.showComparison ? this.renderComparisonTable() : ''}
                
                <p class="package-calculator__note">
                    * Ceny sú bez DPH. Reklamný rozpočet (budget na reklamy) nie je zahrnutý.
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
        
        // Check if current selection fits
        const platformCount = this.state.selectedPlatforms.length;
        const fits = platformCount <= pkg.limits.platforms;

        return `
            <div class="package-card ${isSelected ? 'package-card--selected' : ''} 
                        ${pkg.popular ? 'package-card--popular' : ''}
                        ${pkg.id === 'premium' ? 'package-card--premium' : ''}"
                 data-package="${pkg.id}"
                 style="--package-color: ${pkg.color}; ${pkg.colorEnd ? `--package-color-end: ${pkg.colorEnd}` : ''}">
                
                ${pkg.tagline ? `<div class="package-card__badge ${pkg.popular ? '' : 'package-card__badge--subtle'}">${pkg.tagline}</div>` : ''}
                
                <div class="package-card__header">
                    <span class="package-card__icon">${pkg.icon}</span>
                    <h3 class="package-card__name">${pkg.name}</h3>
                </div>
                
                <div class="package-card__price">
                    ${pkg.priceFrom ? '<span class="package-card__price-from">od </span>' : ''}
                    <span class="package-card__amount">${price}€</span>
                    <span class="package-card__period">/mes</span>
                </div>
                
                ${hasDiscount && !pkg.priceFrom ? `
                    <div class="package-card__original-price">
                        <s>${originalPrice}€/mes</s>
                    </div>
                ` : ''}
                
                <p class="package-card__description">${pkg.description}</p>
                
                <ul class="package-card__features">
                    ${pkg.features.map(f => `
                        <li class="package-card__feature">
                            <span class="package-card__feature-check">✓</span>
                            ${f}
                        </li>
                    `).join('')}
                </ul>
                
                <button class="package-card__btn ${isSelected ? 'package-card__btn--selected' : ''}"
                        data-action="${pkg.id === 'premium' && this.options.showContactForPremium ? 'contact-premium' : 'select-package'}"
                        data-package="${pkg.id}">
                    ${pkg.id === 'premium' && this.options.showContactForPremium 
                        ? 'Kontaktujte nás' 
                        : (isSelected ? '✓ Vybraný' : `Vybrať ${pkg.name}`)}
                </button>
            </div>
        `;
    },

    /**
     * Render porovnávacej tabuľky
     */
    renderComparisonTable() {
        return `
            <div class="package-comparison">
                <h3 class="package-comparison__title">Čo obsahuje každý balík</h3>
                <div class="package-comparison__table-wrap">
                    <table class="package-comparison__table">
                        <thead>
                            <tr>
                                <th class="package-comparison__feature-header">Funkcia</th>
                                ${Object.values(this.packages).map(p => `
                                    <th class="package-comparison__pkg-header" style="--pkg-color: ${p.color}">
                                        ${p.name}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${this.comparisonFeatures.map(f => `
                                <tr>
                                    <td class="package-comparison__feature-name">${f.label}</td>
                                    ${Object.values(this.packages).map(p => `
                                        <td class="package-comparison__feature-value">
                                            ${f.format(p.limits[f.key])}
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                            <tr class="package-comparison__price-row">
                                <td class="package-comparison__feature-name"><strong>Cena</strong></td>
                                ${Object.values(this.packages).map(p => `
                                    <td class="package-comparison__price-cell">
                                        <strong>${p.priceFrom ? 'od ' : ''}${this.getPrice(p, this.state.billingCycle)}€/mes</strong>
                                    </td>
                                `).join('')}
                            </tr>
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
                    const packageId = e.target.closest('[data-package]')?.dataset.package;
                    this.selectPackage(packageId);
                    break;
                case 'set-billing':
                    const cycle = e.target.dataset.cycle;
                    this.setBillingCycle(cycle);
                    break;
                case 'contact-premium':
                    this.contactForPremium();
                    break;
            }
        });
    },

    /**
     * Výber balíka
     */
    selectPackage(packageId) {
        if (!this.packages[packageId]) return;
        
        this.state.selectedPackage = packageId;
        this.render();
        this.attachEventListeners();
        
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
        this.attachEventListeners();
    },

    /**
     * Kontakt pre Premium
     */
    contactForPremium() {
        // Môžeš prispôsobiť podľa potreby
        if (typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast('Pre Premium balík nás kontaktujte na info@adlify.eu', 'info');
        } else {
            alert('Pre Premium balík nás kontaktujte na info@adlify.eu');
        }
    },

    /**
     * Update platforiem z vonku
     */
    updatePlatforms(platforms) {
        this.state.selectedPlatforms = platforms;
        this.render();
        this.attachEventListeners();
    },

    /**
     * Získanie aktuálneho balíka
     */
    getSelectedPackage() {
        return this.packages[this.state.selectedPackage];
    },

    /**
     * Získanie limitu platforiem pre aktuálny balík
     */
    getPlatformLimit() {
        const pkg = this.getSelectedPackage();
        return pkg ? pkg.limits.platforms : 1;
    },

    /**
     * Zobrazenie upgrade modalu
     */
    showUpgradeModal(currentPackageId = null) {
        const current = this.packages[currentPackageId || this.state.selectedPackage];
        const next = this.getNextPackage(currentPackageId || this.state.selectedPackage);
        
        if (!next) {
            if (typeof Utils !== 'undefined') {
                Utils.toast('Už máte najvyšší balík', 'info');
            }
            return;
        }

        const modalHtml = `
            <div class="upgrade-modal" id="upgradeModal">
                <div class="upgrade-modal__backdrop" data-action="close-upgrade"></div>
                <div class="upgrade-modal__content">
                    <button class="upgrade-modal__close" data-action="close-upgrade">×</button>
                    
                    <div class="upgrade-modal__header">
                        <span class="upgrade-modal__icon">🚀</span>
                        <h2>Upgrade pre viac možností</h2>
                    </div>
                    
                    <div class="upgrade-modal__body">
                        <p class="upgrade-modal__reason">
                            Váš aktuálny balík <strong>${current.name}</strong> má limit 
                            ${current.limits.platforms === Infinity ? 'neobmedzených' : current.limits.platforms} 
                            platfor${current.limits.platforms === 1 ? 'mu' : 'iem'}.
                        </p>
                        
                        <div class="upgrade-modal__comparison">
                            <div class="upgrade-modal__package upgrade-modal__package--current">
                                <span class="upgrade-modal__package-label">Aktuálne</span>
                                <h3>${current.icon} ${current.name}</h3>
                                <p class="upgrade-modal__package-price">${current.price}€/mes</p>
                            </div>
                            
                            <div class="upgrade-modal__arrow">→</div>
                            
                            <div class="upgrade-modal__package upgrade-modal__package--new">
                                <span class="upgrade-modal__package-label">Odporúčané</span>
                                <h3>${next.icon} ${next.name}</h3>
                                <p class="upgrade-modal__package-price">${next.price}€/mes</p>
                            </div>
                        </div>
                        
                        <div class="upgrade-modal__benefits">
                            <h4>Čo získate navyše:</h4>
                            <ul>
                                ${this.getUpgradeBenefits(current, next).map(b => `
                                    <li>✓ ${b}</li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                    
                    <div class="upgrade-modal__footer">
                        <button class="upgrade-modal__btn upgrade-modal__btn--secondary" 
                                data-action="close-upgrade">
                            Zostať na ${current.name}
                        </button>
                        <button class="upgrade-modal__btn upgrade-modal__btn--primary"
                                data-action="confirm-upgrade"
                                data-package="${next.id}">
                            Prejsť na ${next.name}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';

        const modal = document.getElementById('upgradeModal');
        
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
    getNextPackage(currentId) {
        const order = ['starter', 'pro', 'enterprise', 'premium'];
        const currentIndex = order.indexOf(currentId);
        if (currentIndex < order.length - 1) {
            return this.packages[order[currentIndex + 1]];
        }
        return null;
    },

    /**
     * Benefity upgrade
     */
    getUpgradeBenefits(currentPkg, nextPkg) {
        const benefits = [];
        
        if (nextPkg.limits.platforms > currentPkg.limits.platforms) {
            const diff = nextPkg.limits.platforms === Infinity 
                ? 'Všetky platformy' 
                : `${nextPkg.limits.platforms} platformy`;
            benefits.push(diff);
        }
        
        if (nextPkg.limits.campaigns > currentPkg.limits.campaigns) {
            const diff = nextPkg.limits.campaigns === Infinity 
                ? 'Neobmedzené kampane' 
                : `${nextPkg.limits.campaigns} kampaní`;
            benefits.push(diff);
        }
        
        if (nextPkg.limits.visuals > currentPkg.limits.visuals) {
            const diff = nextPkg.limits.visuals === Infinity 
                ? 'Neobmedzené vizuály' 
                : `${nextPkg.limits.visuals} vizuálov`;
            benefits.push(diff);
        }
        
        if (nextPkg.limits.remarketing && !currentPkg.limits.remarketing) {
            benefits.push('Remarketing');
        }
        
        if (nextPkg.limits.accountManager && !currentPkg.limits.accountManager) {
            benefits.push('Dedikovaný account manager');
        }

        return benefits;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PackageCalculator;
} else {
    window.PackageCalculator = PackageCalculator;
}
