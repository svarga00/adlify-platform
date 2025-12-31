/**
 * ADLIFY - Campaigns Module
 * Správa Google Ads a Meta Ads kampaní
 */

const CampaignsModule = {
    id: 'campaigns',
    name: 'Kampane',
    icon: '📢',
    title: 'Kampane',
    menu: { section: 'main', order: 35 },
    permissions: ['campaigns', 'view'],

    // Data
    campaigns: [],
    clients: [],
    currentFilter: 'all',
    currentPlatform: 'all',

    async init() {
        console.log('📢 Campaigns module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="campaigns-module">
                <div class="module-header">
                    <div class="header-left">
                        <h1>Kampane</h1>
                        <p class="subtitle">Správa Google Ads a Meta Ads kampaní</p>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" onclick="CampaignsModule.showCreateModal()">
                            <span>+</span> Nová kampaň
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="campaigns-stats">
                    <div class="stat-card">
                        <div class="stat-icon active">🚀</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-active">-</span>
                            <span class="stat-label">Aktívne</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon paused">⏸️</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-paused">-</span>
                            <span class="stat-label">Pozastavené</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon budget">💰</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-budget">-</span>
                            <span class="stat-label">Celkový budget</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon clients">👥</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-clients">-</span>
                            <span class="stat-label">Klientov s kampaňami</span>
                        </div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-bar">
                    <div class="filter-group">
                        <div class="platform-filter">
                            <button class="platform-btn ${this.currentPlatform === 'all' ? 'active' : ''}" onclick="CampaignsModule.setPlatform('all')">
                                Všetky
                            </button>
                            <button class="platform-btn google ${this.currentPlatform === 'google' ? 'active' : ''}" onclick="CampaignsModule.setPlatform('google')">
                                🔍 Google
                            </button>
                            <button class="platform-btn meta ${this.currentPlatform === 'meta' ? 'active' : ''}" onclick="CampaignsModule.setPlatform('meta')">
                                📱 Meta
                            </button>
                        </div>
                        <div class="status-filter">
                            <select onchange="CampaignsModule.setFilter(this.value)">
                                <option value="all">Všetky statusy</option>
                                <option value="active">🚀 Aktívne</option>
                                <option value="paused">⏸️ Pozastavené</option>
                                <option value="draft">📝 Návrhy</option>
                                <option value="ended">✅ Ukončené</option>
                            </select>
                        </div>
                    </div>
                    <div class="search-box">
                        <input type="text" id="campaign-search" placeholder="Hľadať kampane..." oninput="CampaignsModule.handleSearch()">
                    </div>
                </div>

                <!-- Content -->
                <div class="campaigns-content" id="campaigns-content">
                    <div class="loading">Načítavam kampane...</div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        await this.loadData();
        this.renderCampaigns();
    },

    async loadData() {
        try {
            // Load campaigns with client info
            const { data: campaigns, error } = await Database.client
                .from('campaigns')
                .select('*, client:clients(id, company_name)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.campaigns = campaigns || [];

            // Load clients
            const { data: clients } = await Database.client
                .from('clients')
                .select('id, company_name')
                .eq('status', 'active');
            this.clients = clients || [];

            this.updateStats();

        } catch (error) {
            console.error('Load campaigns error:', error);
            this.campaigns = [];
        }
    },

    updateStats() {
        const active = this.campaigns.filter(c => c.status === 'active').length;
        const paused = this.campaigns.filter(c => c.status === 'paused').length;
        const totalBudget = this.campaigns.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
        const uniqueClients = new Set(this.campaigns.map(c => c.client_id)).size;

        document.getElementById('stat-active').textContent = active;
        document.getElementById('stat-paused').textContent = paused;
        document.getElementById('stat-budget').textContent = this.formatCurrency(totalBudget) + '/mes';
        document.getElementById('stat-clients').textContent = uniqueClients;
    },

    renderCampaigns() {
        const container = document.getElementById('campaigns-content');
        if (!container) return;

        const filtered = this.getFilteredCampaigns();

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📢</div>
                    <h3>Žiadne kampane</h3>
                    <p>Vytvor prvú kampaň pre klienta</p>
                    <button class="btn-primary" onclick="CampaignsModule.showCreateModal()" style="margin-top: 1rem;">
                        + Nová kampaň
                    </button>
                </div>
            `;
            return;
        }

        // Group by client
        const byClient = {};
        filtered.forEach(c => {
            const clientName = c.client?.company_name || 'Bez klienta';
            if (!byClient[clientName]) byClient[clientName] = [];
            byClient[clientName].push(c);
        });

        let html = '';
        for (const [clientName, campaigns] of Object.entries(byClient)) {
            html += `
                <div class="client-group">
                    <div class="client-header">
                        <span class="client-name">👤 ${clientName}</span>
                        <span class="client-count">${campaigns.length} kampaní</span>
                    </div>
                    <div class="campaigns-grid">
                        ${campaigns.map(c => this.renderCampaignCard(c)).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    renderCampaignCard(campaign) {
        const platformConfig = {
            google: { icon: '🔍', label: 'Google Ads', class: 'google' },
            meta: { icon: '📱', label: 'Meta Ads', class: 'meta' },
            both: { icon: '🌐', label: 'Multi-platform', class: 'both' }
        };

        const statusConfig = {
            draft: { icon: '📝', label: 'Návrh', class: 'draft' },
            pending: { icon: '⏳', label: 'Čaká', class: 'pending' },
            active: { icon: '🚀', label: 'Aktívna', class: 'active' },
            paused: { icon: '⏸️', label: 'Pozastavená', class: 'paused' },
            ended: { icon: '✅', label: 'Ukončená', class: 'ended' },
            rejected: { icon: '❌', label: 'Zamietnutá', class: 'rejected' }
        };

        const platform = platformConfig[campaign.platform] || platformConfig.google;
        const status = statusConfig[campaign.status] || statusConfig.draft;
        const metrics = campaign.metrics || {};

        return `
            <div class="campaign-card" onclick="CampaignsModule.openCampaign('${campaign.id}')">
                <div class="campaign-header">
                    <div class="platform-badge ${platform.class}">
                        ${platform.icon} ${platform.label}
                    </div>
                    <div class="status-badge ${status.class}">
                        ${status.icon} ${status.label}
                    </div>
                </div>
                
                <h3 class="campaign-name">${campaign.name}</h3>
                
                <div class="campaign-type">${campaign.campaign_type || 'Search'}</div>
                
                <div class="campaign-budget">
                    <span class="budget-label">Budget:</span>
                    <span class="budget-value">${this.formatCurrency(campaign.budget || 0)}/${campaign.budget_type === 'daily' ? 'deň' : 'mesiac'}</span>
                </div>
                
                ${Object.keys(metrics).length > 0 ? `
                    <div class="campaign-metrics">
                        <div class="metric">
                            <span class="metric-value">${metrics.impressions?.toLocaleString() || 0}</span>
                            <span class="metric-label">Zobrazení</span>
                        </div>
                        <div class="metric">
                            <span class="metric-value">${metrics.clicks?.toLocaleString() || 0}</span>
                            <span class="metric-label">Klikov</span>
                        </div>
                        <div class="metric">
                            <span class="metric-value">${metrics.ctr ? metrics.ctr.toFixed(1) + '%' : '-'}</span>
                            <span class="metric-label">CTR</span>
                        </div>
                    </div>
                ` : ''}
                
                <div class="campaign-footer">
                    <span class="campaign-date">${this.formatDate(campaign.created_at)}</span>
                    <div class="campaign-actions">
                        ${campaign.status === 'active' ? `
                            <button class="btn-icon" onclick="event.stopPropagation(); CampaignsModule.pauseCampaign('${campaign.id}')" title="Pozastaviť">⏸️</button>
                        ` : campaign.status === 'paused' ? `
                            <button class="btn-icon" onclick="event.stopPropagation(); CampaignsModule.activateCampaign('${campaign.id}')" title="Aktivovať">▶️</button>
                        ` : ''}
                        <button class="btn-icon" onclick="event.stopPropagation(); CampaignsModule.editCampaign('${campaign.id}')" title="Upraviť">✏️</button>
                    </div>
                </div>
            </div>
        `;
    },

    getFilteredCampaigns() {
        let filtered = [...this.campaigns];

        // Platform filter
        if (this.currentPlatform !== 'all') {
            filtered = filtered.filter(c => c.platform === this.currentPlatform);
        }

        // Status filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(c => c.status === this.currentFilter);
        }

        // Search
        const query = document.getElementById('campaign-search')?.value?.toLowerCase();
        if (query) {
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.client?.company_name?.toLowerCase().includes(query)
            );
        }

        return filtered;
    },

    setPlatform(platform) {
        this.currentPlatform = platform;
        document.querySelectorAll('.platform-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        this.renderCampaigns();
    },

    setFilter(filter) {
        this.currentFilter = filter;
        this.renderCampaigns();
    },

    handleSearch() {
        this.renderCampaigns();
    },

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal campaign-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">📢</span>
                        <h2>Nová kampaň</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="campaign-form">
                        <div class="form-group">
                            <label>Názov kampane *</label>
                            <input type="text" name="name" required placeholder="Napr. Brand awareness - Leto 2025">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Klient *</label>
                                <select name="client_id" required>
                                    <option value="">-- Vyber klienta --</option>
                                    ${this.clients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Platforma *</label>
                                <select name="platform" required>
                                    <option value="google">🔍 Google Ads</option>
                                    <option value="meta">📱 Meta Ads</option>
                                    <option value="both">🌐 Oboje</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Typ kampane</label>
                                <select name="campaign_type">
                                    <option value="search">Search</option>
                                    <option value="display">Display</option>
                                    <option value="shopping">Shopping</option>
                                    <option value="video">Video</option>
                                    <option value="performance_max">Performance Max</option>
                                    <option value="awareness">Brand Awareness</option>
                                    <option value="traffic">Traffic</option>
                                    <option value="conversions">Conversions</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select name="status">
                                    <option value="draft">📝 Návrh</option>
                                    <option value="active">🚀 Aktívna</option>
                                    <option value="paused">⏸️ Pozastavená</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Budget (€)</label>
                                <input type="number" name="budget" step="0.01" placeholder="500">
                            </div>
                            <div class="form-group">
                                <label>Typ budgetu</label>
                                <select name="budget_type">
                                    <option value="daily">Denný</option>
                                    <option value="monthly">Mesačný</option>
                                    <option value="total">Celkový</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Začiatok</label>
                                <input type="date" name="start_date">
                            </div>
                            <div class="form-group">
                                <label>Koniec</label>
                                <input type="date" name="end_date">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Popis</label>
                            <textarea name="description" rows="3" placeholder="Interné poznámky ku kampani..."></textarea>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="CampaignsModule.saveCampaign()">
                        Vytvoriť kampaň
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveCampaign() {
        const form = document.getElementById('campaign-form');
        const formData = new FormData(form);

        const campaignData = {
            name: formData.get('name'),
            client_id: formData.get('client_id'),
            platform: formData.get('platform'),
            campaign_type: formData.get('campaign_type'),
            status: formData.get('status'),
            budget: parseFloat(formData.get('budget')) || null,
            budget_type: formData.get('budget_type'),
            start_date: formData.get('start_date') || null,
            end_date: formData.get('end_date') || null,
            description: formData.get('description') || null,
            created_by: Auth.teamMember?.id
        };

        try {
            const { data, error } = await Database.client
                .from('campaigns')
                .insert([campaignData])
                .select('*, client:clients(id, company_name)')
                .single();

            if (error) throw error;

            this.campaigns.unshift(data);
            document.querySelector('.modal-overlay').remove();
            this.updateStats();
            this.renderCampaigns();
            Utils.showNotification('Kampaň vytvorená', 'success');

        } catch (error) {
            console.error('Save campaign error:', error);
            Utils.showNotification('Chyba pri vytváraní kampane', 'error');
        }
    },

    async openCampaign(id) {
        const campaign = this.campaigns.find(c => c.id === id);
        if (!campaign) return;

        // Load ad groups and ads
        const { data: adGroups } = await Database.client
            .from('ad_groups')
            .select('*, ads(*)')
            .eq('campaign_id', id);

        const platform = { google: '🔍 Google', meta: '📱 Meta', both: '🌐 Multi' }[campaign.platform];
        const status = {
            draft: '📝 Návrh',
            pending: '⏳ Čaká',
            active: '🚀 Aktívna',
            paused: '⏸️ Pozastavená',
            ended: '✅ Ukončená'
        }[campaign.status] || campaign.status;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal campaign-modal campaign-detail-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">📢</span>
                        <h2>${campaign.name}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="campaign-detail-grid">
                        <!-- Main Content -->
                        <div class="detail-main">
                            <!-- Info -->
                            <div class="detail-section">
                                <h4>Informácie</h4>
                                <div class="info-grid">
                                    <div class="info-item">
                                        <span class="info-label">Platforma</span>
                                        <span class="info-value">${platform}</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Typ</span>
                                        <span class="info-value">${campaign.campaign_type || 'Search'}</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Budget</span>
                                        <span class="info-value">${this.formatCurrency(campaign.budget || 0)}/${campaign.budget_type === 'daily' ? 'deň' : 'mesiac'}</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Status</span>
                                        <span class="info-value">${status}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Ad Groups -->
                            <div class="detail-section">
                                <div class="section-header">
                                    <h4>Reklamné skupiny (${adGroups?.length || 0})</h4>
                                    <button class="btn-small" onclick="CampaignsModule.addAdGroup('${campaign.id}')">+ Pridať</button>
                                </div>
                                
                                ${adGroups && adGroups.length > 0 ? `
                                    <div class="ad-groups-list">
                                        ${adGroups.map(ag => `
                                            <div class="ad-group-item">
                                                <div class="ag-header">
                                                    <span class="ag-name">${ag.name}</span>
                                                    <span class="ag-status">${ag.status}</span>
                                                </div>
                                                ${ag.keywords?.length ? `
                                                    <div class="ag-keywords">
                                                        ${ag.keywords.slice(0, 5).map(k => `<span class="keyword-tag">${k}</span>`).join('')}
                                                        ${ag.keywords.length > 5 ? `<span class="more">+${ag.keywords.length - 5}</span>` : ''}
                                                    </div>
                                                ` : ''}
                                                <div class="ag-ads">
                                                    ${ag.ads?.length || 0} reklám
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="empty-section">
                                        Zatiaľ žiadne reklamné skupiny
                                    </div>
                                `}
                            </div>
                            
                            ${campaign.description ? `
                                <div class="detail-section">
                                    <h4>Popis</h4>
                                    <p>${campaign.description}</p>
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Sidebar -->
                        <div class="detail-sidebar">
                            <div class="sidebar-section">
                                <h4>Klient</h4>
                                <p>${campaign.client?.company_name || '-'}</p>
                            </div>
                            
                            <div class="sidebar-section">
                                <h4>Dátumy</h4>
                                <p>Začiatok: ${campaign.start_date ? this.formatDate(campaign.start_date) : 'Neurčený'}</p>
                                <p>Koniec: ${campaign.end_date ? this.formatDate(campaign.end_date) : 'Neurčený'}</p>
                            </div>
                            
                            ${campaign.external_id ? `
                                <div class="sidebar-section">
                                    <h4>Externé ID</h4>
                                    <code>${campaign.external_id}</code>
                                </div>
                            ` : ''}
                            
                            <div class="sidebar-section">
                                <h4>Vytvorené</h4>
                                <p>${this.formatDate(campaign.created_at)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-danger" onclick="CampaignsModule.deleteCampaign('${campaign.id}')">🗑️ Zmazať</button>
                    <div class="footer-right">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                        <button class="btn-primary" onclick="CampaignsModule.editCampaign('${campaign.id}')">✏️ Upraviť</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async pauseCampaign(id) {
        await this.updateCampaignStatus(id, 'paused');
    },

    async activateCampaign(id) {
        await this.updateCampaignStatus(id, 'active');
    },

    async updateCampaignStatus(id, status) {
        try {
            const { error } = await Database.client
                .from('campaigns')
                .update({ status })
                .eq('id', id);

            if (error) throw error;

            const campaign = this.campaigns.find(c => c.id === id);
            if (campaign) campaign.status = status;
            
            this.updateStats();
            this.renderCampaigns();
            Utils.showNotification(`Kampaň ${status === 'active' ? 'aktivovaná' : 'pozastavená'}`, 'success');

        } catch (error) {
            console.error('Update status error:', error);
            Utils.showNotification('Chyba pri zmene statusu', 'error');
        }
    },

    editCampaign(id) {
        // Pre-fill form with campaign data and show modal
        const campaign = this.campaigns.find(c => c.id === id);
        if (!campaign) return;
        
        // TODO: Implement edit modal
        Utils.showNotification('Editácia kampane - čoskoro', 'info');
    },

    async deleteCampaign(id) {
        if (!confirm('Naozaj chceš zmazať túto kampaň?')) return;

        try {
            const { error } = await Database.client
                .from('campaigns')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.campaigns = this.campaigns.filter(c => c.id !== id);
            document.querySelector('.modal-overlay')?.remove();
            this.updateStats();
            this.renderCampaigns();
            Utils.showNotification('Kampaň zmazaná', 'success');

        } catch (error) {
            console.error('Delete campaign error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    async addAdGroup(campaignId) {
        const name = prompt('Názov reklamnej skupiny:');
        if (!name) return;

        try {
            const { error } = await Database.client
                .from('ad_groups')
                .insert([{
                    campaign_id: campaignId,
                    name: name,
                    status: 'active'
                }]);

            if (error) throw error;

            Utils.showNotification('Reklamná skupina pridaná', 'success');
            // Refresh modal
            document.querySelector('.modal-overlay')?.remove();
            this.openCampaign(campaignId);

        } catch (error) {
            console.error('Add ad group error:', error);
            Utils.showNotification('Chyba pri pridávaní', 'error');
        }
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('sk-SK', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('sk-SK');
    },

    getStyles() {
        return `
            <style>
                .campaigns-module {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .module-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2rem;
                }

                .header-left h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                }

                .subtitle {
                    color: #64748b;
                    margin-top: 0.25rem;
                }

                .btn-primary {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                }

                /* Stats */
                .campaigns-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .stat-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    border: 1px solid #e2e8f0;
                }

                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                }

                .stat-icon.active { background: #d1fae5; }
                .stat-icon.paused { background: #fef3c7; }
                .stat-icon.budget { background: #dbeafe; }
                .stat-icon.clients { background: #e0e7ff; }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                }

                .stat-label {
                    font-size: 0.875rem;
                    color: #64748b;
                }

                /* Filters */
                .filters-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    flex-wrap: wrap;
                    gap: 1rem;
                }

                .filter-group {
                    display: flex;
                    gap: 1rem;
                }

                .platform-filter {
                    display: flex;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 4px;
                }

                .platform-btn {
                    padding: 0.5rem 1rem;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.875rem;
                }

                .platform-btn.active {
                    background: white;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .status-filter select {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: white;
                }

                .search-box input {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    width: 250px;
                }

                /* Client Groups */
                .client-group {
                    margin-bottom: 2rem;
                }

                .client-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .client-name {
                    font-weight: 600;
                    font-size: 1rem;
                }

                .client-count {
                    font-size: 0.8rem;
                    color: #64748b;
                }

                /* Campaign Cards */
                .campaigns-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 1rem;
                }

                .campaign-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .campaign-card:hover {
                    border-color: #6366f1;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
                }

                .campaign-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 0.75rem;
                }

                .platform-badge {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                }

                .platform-badge.google { background: #fef3c7; color: #d97706; }
                .platform-badge.meta { background: #dbeafe; color: #1d4ed8; }
                .platform-badge.both { background: #e0e7ff; color: #4f46e5; }

                .status-badge {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                }

                .status-badge.draft { background: #f1f5f9; color: #64748b; }
                .status-badge.active { background: #d1fae5; color: #059669; }
                .status-badge.paused { background: #fef3c7; color: #d97706; }
                .status-badge.ended { background: #e0e7ff; color: #4f46e5; }

                .campaign-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 0.25rem 0;
                }

                .campaign-type {
                    font-size: 0.8rem;
                    color: #64748b;
                    margin-bottom: 0.75rem;
                }

                .campaign-budget {
                    font-size: 0.875rem;
                    margin-bottom: 0.75rem;
                }

                .budget-label {
                    color: #64748b;
                }

                .budget-value {
                    font-weight: 600;
                }

                .campaign-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.5rem;
                    padding: 0.75rem;
                    background: #f8fafc;
                    border-radius: 8px;
                    margin-bottom: 0.75rem;
                }

                .metric {
                    text-align: center;
                }

                .metric-value {
                    font-weight: 600;
                    font-size: 0.9rem;
                    display: block;
                }

                .metric-label {
                    font-size: 0.65rem;
                    color: #94a3b8;
                }

                .campaign-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 0.75rem;
                    border-top: 1px solid #f1f5f9;
                }

                .campaign-date {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .campaign-actions {
                    display: flex;
                    gap: 0.25rem;
                }

                .btn-icon {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 6px;
                    cursor: pointer;
                }

                .btn-icon:hover {
                    background: #e2e8f0;
                }

                /* Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                }

                .campaign-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .campaign-detail-modal {
                    max-width: 900px;
                }

                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }

                .modal-icon {
                    font-size: 1.5rem;
                }

                .modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 8px;
                    font-size: 1.25rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 1.5rem;
                    overflow-y: auto;
                    flex: 1;
                }

                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                }

                .footer-right {
                    display: flex;
                    gap: 0.75rem;
                }

                /* Form */
                .form-group {
                    margin-bottom: 1rem;
                }

                .form-group label {
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }

                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 0.875rem;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                /* Detail Modal */
                .campaign-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 280px;
                    gap: 2rem;
                }

                .detail-section {
                    margin-bottom: 1.5rem;
                }

                .detail-section h4 {
                    font-size: 0.875rem;
                    color: #64748b;
                    margin: 0 0 0.75rem 0;
                    text-transform: uppercase;
                }

                .section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }

                .btn-small {
                    padding: 0.25rem 0.75rem;
                    font-size: 0.75rem;
                    background: #f1f5f9;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }

                .info-item {
                    background: #f8fafc;
                    padding: 0.75rem;
                    border-radius: 8px;
                }

                .info-label {
                    display: block;
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .info-value {
                    font-weight: 600;
                }

                .ad-groups-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .ad-group-item {
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 8px;
                }

                .ag-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                }

                .ag-name {
                    font-weight: 600;
                }

                .ag-status {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .ag-keywords {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25rem;
                    margin-bottom: 0.5rem;
                }

                .keyword-tag {
                    font-size: 0.7rem;
                    padding: 0.125rem 0.5rem;
                    background: #dbeafe;
                    color: #1d4ed8;
                    border-radius: 4px;
                }

                .ag-ads {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .detail-sidebar {
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: 12px;
                }

                .sidebar-section {
                    margin-bottom: 1rem;
                }

                .sidebar-section h4 {
                    font-size: 0.75rem;
                    color: #64748b;
                    margin: 0 0 0.25rem 0;
                }

                .sidebar-section p {
                    margin: 0;
                    font-size: 0.875rem;
                }

                .btn-secondary {
                    padding: 0.75rem 1.25rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    cursor: pointer;
                }

                .btn-danger {
                    padding: 0.75rem 1.25rem;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    color: #dc2626;
                    cursor: pointer;
                }

                .empty-state {
                    text-align: center;
                    padding: 4rem;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .empty-section {
                    text-align: center;
                    padding: 2rem;
                    color: #94a3b8;
                }

                .loading {
                    text-align: center;
                    padding: 3rem;
                    color: #64748b;
                }

                @media (max-width: 768px) {
                    .campaigns-stats {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .campaign-detail-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
    }
};

// Export
window.CampaignsModule = CampaignsModule;
