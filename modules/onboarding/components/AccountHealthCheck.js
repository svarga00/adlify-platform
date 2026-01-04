/**
 * Adlify - Account Health Check Component
 * Kontrola a monitorovanie stavu prepojených účtov
 */

const AccountHealthCheck = {
    // Definícia účtov na sledovanie
    accountTypes: {
        google_ads: {
            id: 'google_ads',
            name: 'Google Ads',
            icon: '🔍',
            color: '#4285F4',
            checkEndpoint: '/api/health/google-ads',
            setupUrl: '/onboarding/google-ads',
            requiredPermissions: ['campaigns.read', 'campaigns.write', 'reports.read'],
            healthChecks: [
                { id: 'access', name: 'Prístup k účtu', critical: true },
                { id: 'billing', name: 'Fakturačné údaje', critical: true },
                { id: 'conversion_tracking', name: 'Sledovanie konverzií', critical: false }
            ]
        },
        google_analytics: {
            id: 'google_analytics',
            name: 'Google Analytics 4',
            icon: '📊',
            color: '#E37400',
            checkEndpoint: '/api/health/google-analytics',
            setupUrl: '/onboarding/google-analytics',
            requiredPermissions: ['analytics.read'],
            healthChecks: [
                { id: 'access', name: 'Prístup k property', critical: true },
                { id: 'data_flow', name: 'Tok dát', critical: true },
                { id: 'goals', name: 'Nastavené ciele', critical: false }
            ]
        },
        gtm: {
            id: 'gtm',
            name: 'Google Tag Manager',
            icon: '🏷️',
            color: '#4285F4',
            checkEndpoint: '/api/health/gtm',
            setupUrl: '/onboarding/gtm',
            requiredPermissions: ['containers.write', 'containers.publish'],
            healthChecks: [
                { id: 'access', name: 'Prístup ku kontajneru', critical: true },
                { id: 'publish', name: 'Publikačné práva', critical: true },
                { id: 'tags_active', name: 'Aktívne tagy', critical: false }
            ]
        },
        meta_ads: {
            id: 'meta_ads',
            name: 'Meta Ads',
            icon: '📘',
            color: '#1877F2',
            checkEndpoint: '/api/health/meta-ads',
            setupUrl: '/onboarding/meta-ads',
            requiredPermissions: ['ads_management', 'ads_read'],
            healthChecks: [
                { id: 'access', name: 'Prístup k Ad Account', critical: true },
                { id: 'billing', name: 'Platobná metóda', critical: true },
                { id: 'pixel', name: 'Meta Pixel', critical: false }
            ]
        },
        meta_pixel: {
            id: 'meta_pixel',
            name: 'Meta Pixel',
            icon: '📍',
            color: '#1877F2',
            checkEndpoint: '/api/health/meta-pixel',
            setupUrl: '/onboarding/meta-pixel',
            requiredPermissions: ['pixel.read'],
            healthChecks: [
                { id: 'installed', name: 'Pixel nainštalovaný', critical: true },
                { id: 'events_firing', name: 'Udalosti sa odosielajú', critical: true },
                { id: 'capi', name: 'Conversions API', critical: false }
            ]
        },
        linkedin_ads: {
            id: 'linkedin_ads',
            name: 'LinkedIn Ads',
            icon: '💼',
            color: '#0A66C2',
            checkEndpoint: '/api/health/linkedin-ads',
            setupUrl: '/onboarding/linkedin-ads',
            requiredPermissions: ['rw_ads'],
            healthChecks: [
                { id: 'access', name: 'Prístup k účtu', critical: true },
                { id: 'billing', name: 'Fakturačné údaje', critical: true }
            ]
        },
        tiktok_ads: {
            id: 'tiktok_ads',
            name: 'TikTok Ads',
            icon: '🎵',
            color: '#000000',
            checkEndpoint: '/api/health/tiktok-ads',
            setupUrl: '/onboarding/tiktok-ads',
            requiredPermissions: ['ad.read', 'ad.write'],
            healthChecks: [
                { id: 'access', name: 'Prístup k účtu', critical: true },
                { id: 'pixel', name: 'TikTok Pixel', critical: false }
            ]
        }
    },

    // Stav
    state: {
        accounts: {},
        loading: false,
        lastCheck: null
    },

    // Callbacks
    callbacks: {
        onStatusChange: null,
        onCriticalIssue: null
    },

    /**
     * Inicializácia
     */
    init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('AccountHealthCheck: Container not found');
            return;
        }

        this.options = {
            accounts: options.accounts || [], // Zoznam účtov na kontrolu
            autoCheck: options.autoCheck !== false,
            checkInterval: options.checkInterval || 300000, // 5 minút
            showDetails: options.showDetails !== false,
            ...options
        };

        if (options.onStatusChange) this.callbacks.onStatusChange = options.onStatusChange;
        if (options.onCriticalIssue) this.callbacks.onCriticalIssue = options.onCriticalIssue;

        // Inicializácia stavu účtov
        this.options.accounts.forEach(accId => {
            this.state.accounts[accId] = {
                status: 'checking',
                checks: {},
                lastCheck: null,
                error: null
            };
        });

        this.render();
        
        if (this.options.autoCheck) {
            this.checkAll();
            // Periodická kontrola
            setInterval(() => this.checkAll(), this.options.checkInterval);
        }
    },

    /**
     * Hlavný render
     */
    render() {
        const html = `
            <div class="health-check">
                <div class="health-check__header">
                    <div class="health-check__title-wrap">
                        <h3 class="health-check__title">
                            <span class="health-check__icon">🔔</span>
                            Stav prepojení
                        </h3>
                        ${this.state.lastCheck ? `
                            <span class="health-check__last-check">
                                Posledná kontrola: ${this.formatTime(this.state.lastCheck)}
                            </span>
                        ` : ''}
                    </div>
                    <button class="health-check__refresh" data-action="refresh" ${this.state.loading ? 'disabled' : ''}>
                        <span class="health-check__refresh-icon ${this.state.loading ? 'health-check__refresh-icon--spinning' : ''}">↻</span>
                        ${this.state.loading ? 'Kontrolujem...' : 'Skontrolovať'}
                    </button>
                </div>
                
                <div class="health-check__list">
                    ${this.options.accounts.map(accId => this.renderAccountStatus(accId)).join('')}
                </div>
                
                ${this.renderSummary()}
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    },

    /**
     * Render stavu účtu
     */
    renderAccountStatus(accountId) {
        const accountType = this.accountTypes[accountId];
        const accountState = this.state.accounts[accountId];
        
        if (!accountType) return '';

        const status = accountState?.status || 'unknown';
        const statusInfo = this.getStatusInfo(status);

        return `
            <div class="health-account ${this.options.showDetails ? 'health-account--expandable' : ''}" 
                 data-account="${accountId}">
                <div class="health-account__main" data-action="toggle-details" data-account="${accountId}">
                    <div class="health-account__icon" style="background: ${accountType.color}20; color: ${accountType.color}">
                        ${accountType.icon}
                    </div>
                    <div class="health-account__info">
                        <span class="health-account__name">${accountType.name}</span>
                        <span class="health-account__status health-account__status--${status}">
                            ${statusInfo.icon} ${statusInfo.label}
                        </span>
                    </div>
                    <div class="health-account__actions">
                        ${status === 'error' || status === 'warning' || status === 'disconnected' ? `
                            <button class="health-account__fix-btn" data-action="fix" data-account="${accountId}">
                                Opraviť
                            </button>
                        ` : ''}
                        ${this.options.showDetails ? `
                            <span class="health-account__expand-icon">▼</span>
                        ` : ''}
                    </div>
                </div>
                
                ${this.options.showDetails ? `
                    <div class="health-account__details" id="details_${accountId}">
                        ${this.renderAccountDetails(accountId)}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render detailov účtu
     */
    renderAccountDetails(accountId) {
        const accountType = this.accountTypes[accountId];
        const accountState = this.state.accounts[accountId];
        
        if (!accountType || !accountState) return '';

        return `
            <div class="health-details">
                <div class="health-details__checks">
                    <h4>Kontroly</h4>
                    ${accountType.healthChecks.map(check => {
                        const checkStatus = accountState.checks[check.id] || 'pending';
                        const checkInfo = this.getCheckStatusInfo(checkStatus);
                        return `
                            <div class="health-check-item">
                                <span class="health-check-item__icon">${checkInfo.icon}</span>
                                <span class="health-check-item__name">${check.name}</span>
                                ${check.critical ? '<span class="health-check-item__critical">Kritické</span>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
                
                ${accountState.error ? `
                    <div class="health-details__error">
                        <strong>Chyba:</strong> ${accountState.error}
                    </div>
                ` : ''}
                
                <div class="health-details__actions">
                    <a href="${accountType.setupUrl}" class="health-details__link">
                        📖 Návod na nastavenie
                    </a>
                    <button class="health-details__check-btn" data-action="check-single" data-account="${accountId}">
                        🔄 Skontrolovať znova
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Render súhrnu
     */
    renderSummary() {
        const accounts = Object.entries(this.state.accounts);
        const connected = accounts.filter(([_, acc]) => acc.status === 'connected').length;
        const warnings = accounts.filter(([_, acc]) => acc.status === 'warning').length;
        const errors = accounts.filter(([_, acc]) => acc.status === 'error' || acc.status === 'disconnected').length;

        if (accounts.length === 0) return '';

        let summaryClass = 'health-summary--ok';
        let summaryIcon = '✅';
        let summaryText = 'Všetky účty sú správne prepojené';

        if (errors > 0) {
            summaryClass = 'health-summary--error';
            summaryIcon = '🚨';
            summaryText = `${errors} účet${errors > 1 ? 'y' : ''} vyžaduj${errors > 1 ? 'ú' : 'e'} pozornosť`;
        } else if (warnings > 0) {
            summaryClass = 'health-summary--warning';
            summaryIcon = '⚠️';
            summaryText = `${warnings} upozorneni${warnings > 1 ? 'a' : 'e'}`;
        }

        return `
            <div class="health-summary ${summaryClass}">
                <span class="health-summary__icon">${summaryIcon}</span>
                <span class="health-summary__text">${summaryText}</span>
                <div class="health-summary__stats">
                    <span class="health-summary__stat health-summary__stat--connected">${connected} OK</span>
                    ${warnings > 0 ? `<span class="health-summary__stat health-summary__stat--warning">${warnings} ⚠️</span>` : ''}
                    ${errors > 0 ? `<span class="health-summary__stat health-summary__stat--error">${errors} ❌</span>` : ''}
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
            const account = e.target.closest('[data-account]')?.dataset.account;

            switch (action) {
                case 'refresh':
                    this.checkAll();
                    break;
                case 'toggle-details':
                    this.toggleDetails(account);
                    break;
                case 'fix':
                    this.openFixFlow(account);
                    break;
                case 'check-single':
                    this.checkAccount(account);
                    break;
            }
        });
    },

    /**
     * Toggle detaily účtu
     */
    toggleDetails(accountId) {
        const accountEl = this.container.querySelector(`[data-account="${accountId}"]`);
        if (accountEl) {
            accountEl.classList.toggle('health-account--expanded');
        }
    },

    /**
     * Kontrola všetkých účtov
     */
    async checkAll() {
        this.state.loading = true;
        this.render();

        const checks = this.options.accounts.map(accId => this.checkAccount(accId));
        await Promise.all(checks);

        this.state.loading = false;
        this.state.lastCheck = new Date();
        this.render();

        // Callback pre kritické problémy
        const criticalIssues = this.getCriticalIssues();
        if (criticalIssues.length > 0 && this.callbacks.onCriticalIssue) {
            this.callbacks.onCriticalIssue(criticalIssues);
        }
    },

    /**
     * Kontrola jedného účtu
     */
    async checkAccount(accountId) {
        const accountType = this.accountTypes[accountId];
        if (!accountType) return;

        this.state.accounts[accountId] = {
            ...this.state.accounts[accountId],
            status: 'checking'
        };

        try {
            // Simulácia API volania (nahradiť skutočným)
            const result = await this.mockHealthCheck(accountId);
            
            this.state.accounts[accountId] = {
                status: result.status,
                checks: result.checks,
                lastCheck: new Date(),
                error: result.error || null
            };

        } catch (error) {
            this.state.accounts[accountId] = {
                status: 'error',
                checks: {},
                lastCheck: new Date(),
                error: error.message
            };
        }

        // Callback
        if (this.callbacks.onStatusChange) {
            this.callbacks.onStatusChange(accountId, this.state.accounts[accountId]);
        }

        this.render();
    },

    /**
     * Mock health check (nahradiť skutočným API)
     */
    async mockHealthCheck(accountId) {
        // Simulácia delay
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

        // Simulácia rôznych stavov
        const random = Math.random();
        const accountType = this.accountTypes[accountId];
        
        const checks = {};
        accountType.healthChecks.forEach(check => {
            const checkRandom = Math.random();
            checks[check.id] = checkRandom > 0.2 ? 'passed' : (checkRandom > 0.1 ? 'warning' : 'failed');
        });

        // Určenie celkového stavu
        const hasFailedCritical = accountType.healthChecks.some(
            check => check.critical && checks[check.id] === 'failed'
        );
        const hasWarning = Object.values(checks).some(c => c === 'warning');
        const hasFailed = Object.values(checks).some(c => c === 'failed');

        let status = 'connected';
        if (hasFailedCritical) {
            status = 'disconnected';
        } else if (hasFailed) {
            status = 'error';
        } else if (hasWarning) {
            status = 'warning';
        }

        return {
            status,
            checks,
            error: status === 'disconnected' ? 'Kritická kontrola zlyhala' : null
        };
    },

    /**
     * Otvorenie flow na opravu
     */
    openFixFlow(accountId) {
        const accountType = this.accountTypes[accountId];
        if (accountType?.setupUrl) {
            window.location.href = accountType.setupUrl;
        }
    },

    /**
     * Získanie kritických problémov
     */
    getCriticalIssues() {
        const issues = [];
        
        Object.entries(this.state.accounts).forEach(([accId, accState]) => {
            if (accState.status === 'disconnected' || accState.status === 'error') {
                const accountType = this.accountTypes[accId];
                issues.push({
                    accountId: accId,
                    accountName: accountType?.name,
                    status: accState.status,
                    error: accState.error
                });
            }
        });

        return issues;
    },

    /**
     * Pomocné funkcie
     */
    getStatusInfo(status) {
        const statuses = {
            connected: { icon: '✅', label: 'Prepojené', class: 'connected' },
            checking: { icon: '🔄', label: 'Kontrolujem...', class: 'checking' },
            warning: { icon: '⚠️', label: 'Upozornenie', class: 'warning' },
            error: { icon: '❌', label: 'Chyba', class: 'error' },
            disconnected: { icon: '🔌', label: 'Odpojené', class: 'disconnected' },
            unknown: { icon: '❓', label: 'Neznáme', class: 'unknown' }
        };
        return statuses[status] || statuses.unknown;
    },

    getCheckStatusInfo(status) {
        const statuses = {
            passed: { icon: '✅' },
            warning: { icon: '⚠️' },
            failed: { icon: '❌' },
            pending: { icon: '⏳' }
        };
        return statuses[status] || statuses.pending;
    },

    formatTime(date) {
        if (!date) return '';
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'práve teraz';
        if (diff < 3600000) return `pred ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `pred ${Math.floor(diff / 3600000)} hod`;
        return date.toLocaleDateString('sk-SK');
    },

    /**
     * Public API
     */
    getStatus(accountId) {
        return this.state.accounts[accountId];
    },

    getAllStatuses() {
        return this.state.accounts;
    },

    isHealthy() {
        return Object.values(this.state.accounts).every(
            acc => acc.status === 'connected' || acc.status === 'warning'
        );
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccountHealthCheck;
} else {
    window.AccountHealthCheck = AccountHealthCheck;
}
