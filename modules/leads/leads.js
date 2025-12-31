// =====================================================
// ADLIFY - Leads Module v3.0 (Billing Style)
// =====================================================

const LeadsModule = {
    id: 'leads',
    name: 'Leady',
    icon: '👥',
    title: 'Leady',
    menu: { section: 'main', order: 20 },
    permissions: ['leads', 'view'],
    
    // State
    currentTab: 'list',
    leads: [],
    selectedIds: new Set(),
    filters: {
        status: '',
        search: '',
        minScore: ''
    },
    currentLead: null,
    
    // API URL pre analýzu
    ANALYZE_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/analyze-lead',
    
    // Status definície
    STATUSES: {
        new: { label: 'Nový', color: 'blue', icon: '🆕' },
        contacted: { label: 'Kontaktovaný', color: 'yellow', icon: '📞' },
        proposal_sent: { label: 'Ponuka odoslaná', color: 'purple', icon: '📧' },
        negotiation: { label: 'Vyjednávanie', color: 'orange', icon: '🤝' },
        won: { label: 'Vyhraný', color: 'green', icon: '🎉' },
        lost: { label: 'Prehraný', color: 'red', icon: '❌' }
    },

    async init() {
        console.log('👥 Leads module v3.0 initialized');
    },

    async render(container, params = {}) {
        await this.loadData();
        
        const stats = this.calculateStats();
        
        container.innerHTML = `
            <div class="leads-module">
                <!-- Header -->
                <div class="module-header">
                    <div class="header-content">
                        <div class="header-title">
                            <h1>Leady</h1>
                            <p class="header-subtitle">Správa potenciálnych klientov</p>
                        </div>
                        <div class="header-actions">
                            <button class="btn-secondary" onclick="LeadsModule.showImportModal()">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                Import
                            </button>
                            <button class="btn-primary" onclick="LeadsModule.showAddModal()">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Nový lead
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon blue">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <div class="stat-content">
                            <span class="stat-value">${stats.total}</span>
                            <span class="stat-label">Celkom leadov</span>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon green">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                                <line x1="8" y1="12" x2="16" y2="12"></line>
                            </svg>
                        </div>
                        <div class="stat-content">
                            <span class="stat-value">${stats.new}</span>
                            <span class="stat-label">Nové</span>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon purple">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <div class="stat-content">
                            <span class="stat-value">${stats.analyzed}</span>
                            <span class="stat-label">Analyzované</span>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon orange">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                            </svg>
                        </div>
                        <div class="stat-content">
                            <span class="stat-value">${stats.won}</span>
                            <span class="stat-label">Konvertované</span>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs & Filters -->
                <div class="tabs-container">
                    <div class="tabs">
                        <button class="tab ${this.currentTab === 'list' ? 'active' : ''}" onclick="LeadsModule.switchTab('list')">
                            <span class="tab-icon">📋</span>
                            <span>Zoznam</span>
                        </button>
                        <button class="tab ${this.currentTab === 'kanban' ? 'active' : ''}" onclick="LeadsModule.switchTab('kanban')">
                            <span class="tab-icon">📊</span>
                            <span>Kanban</span>
                        </button>
                    </div>
                    
                    <div class="filters">
                        <div class="search-box">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <input type="text" placeholder="Hľadať..." id="search-input" 
                                   value="${this.filters.search}" onkeyup="LeadsModule.onSearch(this.value)">
                        </div>
                        
                        <select class="filter-select" onchange="LeadsModule.onFilterStatus(this.value)">
                            <option value="">Všetky stavy</option>
                            ${Object.entries(this.STATUSES).map(([key, val]) => 
                                `<option value="${key}" ${this.filters.status === key ? 'selected' : ''}>${val.icon} ${val.label}</option>`
                            ).join('')}
                        </select>
                        
                        ${this.selectedIds.size > 0 ? `
                            <div class="bulk-actions">
                                <span class="selected-count">${this.selectedIds.size} označených</span>
                                <button class="btn-bulk" onclick="LeadsModule.analyzeSelected()">🤖 Analyzovať</button>
                                <button class="btn-bulk danger" onclick="LeadsModule.deleteSelected()">🗑️ Zmazať</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Content -->
                <div class="content-area" id="leads-content">
                    ${this.renderContent()}
                </div>
            </div>
            
            ${this.renderStyles()}
        `;
    },

    async loadData() {
        try {
            const { data, error } = await Database.client
                .from('leads')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.leads = data || [];
        } catch (error) {
            console.error('Load leads error:', error);
            this.leads = [];
        }
    },

    calculateStats() {
        return {
            total: this.leads.length,
            new: this.leads.filter(l => l.status === 'new').length,
            analyzed: this.leads.filter(l => l.analysis).length,
            won: this.leads.filter(l => l.status === 'won').length
        };
    },

    renderContent() {
        if (this.currentTab === 'kanban') {
            return this.renderKanban();
        }
        return this.renderTable();
    },

    renderTable() {
        const filtered = this.getFilteredLeads();
        
        if (filtered.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>Žiadne leady</h3>
                    <p>Pridajte prvý lead alebo importujte z CSV</p>
                    <button class="btn-primary" onclick="LeadsModule.showAddModal()">+ Pridať lead</button>
                </div>
            `;
        }
        
        return `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="col-checkbox">
                                <input type="checkbox" onchange="LeadsModule.toggleAll(this.checked)">
                            </th>
                            <th>Firma</th>
                            <th>Kontakt</th>
                            <th>Status</th>
                            <th>Skóre</th>
                            <th>Analýza</th>
                            <th>Akcie</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(lead => this.renderTableRow(lead)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderTableRow(lead) {
        const status = this.STATUSES[lead.status] || this.STATUSES.new;
        const hasAnalysis = lead.analysis?.company || lead.analysis?.analysis;
        const score = lead.score || 0;
        
        return `
            <tr class="table-row" onclick="LeadsModule.showDetail('${lead.id}')">
                <td class="col-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} 
                           onchange="LeadsModule.toggleSelect('${lead.id}')">
                </td>
                <td>
                    <div class="lead-company">
                        <span class="company-name">${lead.company_name || lead.domain || 'Neznámy'}</span>
                        ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="company-domain" onclick="event.stopPropagation()">${lead.domain}</a>` : ''}
                    </div>
                </td>
                <td>
                    <div class="lead-contact">
                        ${lead.email ? `<span class="contact-email">${lead.email}</span>` : ''}
                        ${lead.phone ? `<span class="contact-phone">${lead.phone}</span>` : ''}
                        ${!lead.email && !lead.phone ? '<span class="no-contact">-</span>' : ''}
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${status.color}">${status.icon} ${status.label}</span>
                </td>
                <td>
                    <div class="score-badge score-${this.getScoreLevel(score)}">${score}</div>
                </td>
                <td>
                    ${hasAnalysis ? '<span class="analysis-badge">✓ Analyzované</span>' : '<span class="no-analysis">-</span>'}
                </td>
                <td class="col-actions" onclick="event.stopPropagation()">
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="LeadsModule.analyze('${lead.id}')" title="Analyzovať">🤖</button>
                        ${hasAnalysis ? `<button class="btn-icon" onclick="LeadsModule.showProposal('${lead.id}')" title="Ponuka">📄</button>` : ''}
                        <button class="btn-icon" onclick="LeadsModule.convertToClient('${lead.id}')" title="Konvertovať">🎯</button>
                        <button class="btn-icon danger" onclick="LeadsModule.deleteLead('${lead.id}')" title="Zmazať">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    },

    renderKanban() {
        const columns = ['new', 'contacted', 'proposal_sent', 'negotiation', 'won', 'lost'];
        
        return `
            <div class="kanban-board">
                ${columns.map(status => {
                    const config = this.STATUSES[status];
                    const leads = this.leads.filter(l => (l.status || 'new') === status);
                    
                    return `
                        <div class="kanban-column" data-status="${status}">
                            <div class="kanban-header">
                                <span class="kanban-title">${config.icon} ${config.label}</span>
                                <span class="kanban-count">${leads.length}</span>
                            </div>
                            <div class="kanban-cards">
                                ${leads.map(lead => `
                                    <div class="kanban-card" onclick="LeadsModule.showDetail('${lead.id}')">
                                        <div class="card-header">
                                            <span class="card-company">${lead.company_name || lead.domain || 'Neznámy'}</span>
                                            ${lead.score ? `<span class="card-score">${lead.score}</span>` : ''}
                                        </div>
                                        ${lead.domain ? `<span class="card-domain">${lead.domain}</span>` : ''}
                                        ${lead.email ? `<span class="card-email">${lead.email}</span>` : ''}
                                        <div class="card-actions">
                                            ${lead.analysis ? '<span class="card-tag analyzed">✓ Analyzované</span>' : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    // ==========================================
    // MODALS
    // ==========================================

    showAddModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>Nový lead</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="lead-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Názov firmy *</label>
                                <input type="text" name="company_name" required placeholder="Zadajte názov firmy">
                            </div>
                            <div class="form-group">
                                <label>Doména</label>
                                <input type="text" name="domain" placeholder="firma.sk">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" name="email" placeholder="kontakt@firma.sk">
                            </div>
                            <div class="form-group">
                                <label>Telefón</label>
                                <input type="tel" name="phone" placeholder="+421...">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Odvetvie</label>
                                <input type="text" name="industry" placeholder="napr. E-commerce">
                            </div>
                            <div class="form-group">
                                <label>Mesto</label>
                                <input type="text" name="city" placeholder="napr. Bratislava">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Poznámky</label>
                            <textarea name="notes" rows="3" placeholder="Voliteľné poznámky..."></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="LeadsModule.saveLead()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Uložiť lead
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('input[name="company_name"]').focus();
    },

    async showDetail(leadId) {
        const lead = this.leads.find(l => l.id === leadId);
        if (!lead) return;
        
        this.currentLead = lead;
        const status = this.STATUSES[lead.status] || this.STATUSES.new;
        const analysis = lead.analysis || {};
        const company = analysis.company || {};
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <div class="modal-title-group">
                        <h2>${lead.company_name || lead.domain || 'Detail leadu'}</h2>
                        <span class="status-badge status-${status.color}">${status.icon} ${status.label}</span>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <!-- Základné info -->
                        <div class="detail-section">
                            <h3>📋 Základné informácie</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Firma</span>
                                    <span class="info-value">${lead.company_name || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Doména</span>
                                    <span class="info-value">${lead.domain ? `<a href="https://${lead.domain}" target="_blank">${lead.domain}</a>` : '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Email</span>
                                    <span class="info-value">${lead.email ? `<a href="mailto:${lead.email}">${lead.email}</a>` : '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Telefón</span>
                                    <span class="info-value">${lead.phone ? `<a href="tel:${lead.phone}">${lead.phone}</a>` : '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Odvetvie</span>
                                    <span class="info-value">${lead.industry || company.industry || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Mesto</span>
                                    <span class="info-value">${lead.city || company.location || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Skóre</span>
                                    <span class="info-value"><span class="score-badge score-${this.getScoreLevel(lead.score || 0)}">${lead.score || 0}</span></span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Vytvorený</span>
                                    <span class="info-value">${this.formatDate(lead.created_at)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- AI Analýza -->
                        <div class="detail-section">
                            <h3>🤖 AI Analýza</h3>
                            ${analysis.analysis ? `
                                <div class="analysis-content">
                                    ${analysis.analysis.business_overview ? `
                                        <div class="analysis-block">
                                            <h4>Prehľad podnikania</h4>
                                            <p>${analysis.analysis.business_overview}</p>
                                        </div>
                                    ` : ''}
                                    ${analysis.analysis.marketing_assessment ? `
                                        <div class="analysis-block">
                                            <h4>Marketingové hodnotenie</h4>
                                            <p>${analysis.analysis.marketing_assessment}</p>
                                        </div>
                                    ` : ''}
                                    ${analysis.analysis.recommendation ? `
                                        <div class="analysis-block highlight">
                                            <h4>💡 Odporúčanie</h4>
                                            <p>${analysis.analysis.recommendation}</p>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : `
                                <div class="no-analysis-box">
                                    <p>Lead ešte nebol analyzovaný</p>
                                    <button class="btn-primary" onclick="LeadsModule.analyze('${lead.id}'); this.closest('.modal-overlay').remove();">
                                        🤖 Spustiť analýzu
                                    </button>
                                </div>
                            `}
                        </div>
                    </div>
                    
                    <!-- Zmena statusu -->
                    <div class="status-change-section">
                        <label>Zmeniť status:</label>
                        <div class="status-buttons">
                            ${Object.entries(this.STATUSES).map(([key, val]) => `
                                <button class="status-btn ${lead.status === key ? 'active' : ''}" 
                                        onclick="LeadsModule.changeStatus('${lead.id}', '${key}')">
                                    ${val.icon} ${val.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                    <button class="btn-secondary" onclick="LeadsModule.editLead('${lead.id}')">✏️ Upraviť</button>
                    ${analysis.analysis ? `<button class="btn-primary" onclick="LeadsModule.showProposal('${lead.id}')">📄 Ponuka</button>` : ''}
                    <button class="btn-success" onclick="LeadsModule.convertToClient('${lead.id}'); this.closest('.modal-overlay').remove();">🎯 Konvertovať na klienta</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    showImportModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>Import leadov</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="import-options">
                        <div class="import-option" onclick="LeadsModule.importCSV()">
                            <div class="import-icon">📄</div>
                            <div class="import-text">
                                <strong>CSV súbor</strong>
                                <span>Nahraj CSV s leadmi</span>
                            </div>
                        </div>
                        <div class="import-option" onclick="LeadsModule.importFromMiner()">
                            <div class="import-icon">⛏️</div>
                            <div class="import-text">
                                <strong>Marketing Miner</strong>
                                <span>Import z SERP analýzy</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="import-paste">
                        <label>Alebo vlož domény (jedna na riadok):</label>
                        <textarea id="import-domains" rows="6" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="LeadsModule.importDomains()">Importovať</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // ==========================================
    // ACTIONS
    // ==========================================

    async saveLead() {
        const form = document.getElementById('lead-form');
        const formData = new FormData(form);
        
        const leadData = {
            company_name: formData.get('company_name'),
            domain: formData.get('domain')?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            email: formData.get('email'),
            phone: formData.get('phone'),
            industry: formData.get('industry'),
            city: formData.get('city'),
            notes: formData.get('notes'),
            status: 'new',
            score: 0
        };
        
        try {
            const { error } = await Database.client.from('leads').insert([leadData]);
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            Utils.toast('Lead pridaný!', 'success');
            await this.loadData();
            this.refreshContent();
        } catch (error) {
            console.error('Save lead error:', error);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },

    async deleteLead(leadId) {
        if (!await Utils.confirm('Naozaj chcete zmazať tento lead?')) return;
        
        try {
            const { error } = await Database.client.from('leads').delete().eq('id', leadId);
            if (error) throw error;
            
            Utils.toast('Lead zmazaný', 'success');
            await this.loadData();
            this.refreshContent();
        } catch (error) {
            console.error('Delete lead error:', error);
            Utils.toast('Chyba pri mazaní', 'error');
        }
    },

    async changeStatus(leadId, newStatus) {
        try {
            const { error } = await Database.client
                .from('leads')
                .update({ status: newStatus })
                .eq('id', leadId);
            
            if (error) throw error;
            
            // Update local
            const lead = this.leads.find(l => l.id === leadId);
            if (lead) lead.status = newStatus;
            
            Utils.toast('Status zmenený', 'success');
            
            // Refresh modal
            document.querySelector('.modal-overlay')?.remove();
            this.showDetail(leadId);
            this.refreshContent();
        } catch (error) {
            console.error('Change status error:', error);
            Utils.toast('Chyba', 'error');
        }
    },

    async analyze(leadId) {
        const lead = this.leads.find(l => l.id === leadId);
        if (!lead) return;
        
        // Zavrieť existujúci modal ak je
        document.querySelector('.modal-overlay')?.remove();
        
        // Zobraziť loading
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal-overlay';
        loadingModal.innerHTML = `
            <div class="modal modal-small">
                <div class="modal-body" style="text-align: center; padding: 3rem;">
                    <div class="loading-spinner"></div>
                    <h3 style="margin-top: 1rem;">Analyzujem...</h3>
                    <p style="color: #64748b;">${lead.company_name || lead.domain}</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        
        try {
            const response = await fetch(this.ANALYZE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    leadId: lead.id,
                    domain: lead.domain,
                    company_name: lead.company_name
                })
            });
            
            if (!response.ok) throw new Error('Analysis failed');
            
            const result = await response.json();
            
            // Update local
            lead.analysis = result.analysis;
            lead.score = result.score;
            
            loadingModal.remove();
            Utils.toast('Analýza dokončená!', 'success');
            this.showDetail(leadId);
            this.refreshContent();
            
        } catch (error) {
            console.error('Analyze error:', error);
            loadingModal.remove();
            Utils.toast('Chyba pri analýze', 'error');
        }
    },

    async convertToClient(leadId) {
        const lead = this.leads.find(l => l.id === leadId);
        if (!lead) return Utils.toast('Lead nenájdený', 'error');
        
        if (!await Utils.confirm(`Konvertovať "${lead.company_name || lead.domain}" na klienta?`)) return;
        
        const analysis = lead.analysis || {};
        const company = analysis.company || {};
        
        try {
            const clientData = {
                company_name: lead.company_name || company.name || lead.domain,
                contact_person: lead.contact_person || '',
                email: lead.email || '',
                phone: lead.phone || '',
                website: lead.domain ? `https://${lead.domain}` : '',
                city: lead.city || company.location || '',
                industry: lead.industry || company.industry || '',
                source_lead_id: lead.id,
                status: 'active',
                onboarding_status: 'pending',
                notes: lead.notes || '',
                portal_token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
            };
            
            const { data: newClient, error } = await Database.client
                .from('clients')
                .insert([clientData])
                .select()
                .single();
            
            if (error) throw error;
            
            await Database.client
                .from('leads')
                .update({ 
                    status: 'won',
                    proposal_status: 'converted',
                    converted_client_id: newClient.id,
                    converted_at: new Date().toISOString()
                })
                .eq('id', leadId);
            
            Utils.toast(`🎉 Klient "${newClient.company_name}" vytvorený!`, 'success');
            
            await this.loadData();
            this.refreshContent();
            
            if (await Utils.confirm('Chceš ísť na detail klienta?')) {
                Router.navigate('clients', { id: newClient.id });
            }
            
        } catch (error) {
            console.error('Convert error:', error);
            Utils.toast('Chyba: ' + error.message, 'error');
        }
    },

    async importDomains() {
        const textarea = document.getElementById('import-domains');
        const domains = textarea.value.split('\n').map(d => d.trim()).filter(d => d);
        
        if (domains.length === 0) {
            Utils.toast('Zadajte aspoň jednu doménu', 'warning');
            return;
        }
        
        const leads = domains.map(domain => ({
            domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            company_name: domain.replace(/^https?:\/\//, '').replace(/\/$/, '').split('.')[0],
            status: 'new',
            score: 0
        }));
        
        try {
            const { error } = await Database.client.from('leads').insert(leads);
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            Utils.toast(`${leads.length} leadov importovaných!`, 'success');
            await this.loadData();
            this.refreshContent();
        } catch (error) {
            console.error('Import error:', error);
            Utils.toast('Chyba pri importe', 'error');
        }
    },

    // ==========================================
    // HELPERS
    // ==========================================

    switchTab(tab) {
        this.currentTab = tab;
        this.refreshContent();
    },

    refreshContent() {
        const container = document.getElementById('leads-content');
        if (container) {
            container.innerHTML = this.renderContent();
        }
        // Update stats
        const statsContainer = document.querySelector('.stats-grid');
        if (statsContainer) {
            const stats = this.calculateStats();
            statsContainer.querySelector('.stat-card:nth-child(1) .stat-value').textContent = stats.total;
            statsContainer.querySelector('.stat-card:nth-child(2) .stat-value').textContent = stats.new;
            statsContainer.querySelector('.stat-card:nth-child(3) .stat-value').textContent = stats.analyzed;
            statsContainer.querySelector('.stat-card:nth-child(4) .stat-value').textContent = stats.won;
        }
    },

    getFilteredLeads() {
        let filtered = [...this.leads];
        
        if (this.filters.status) {
            filtered = filtered.filter(l => l.status === this.filters.status);
        }
        
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(l => 
                (l.company_name || '').toLowerCase().includes(search) ||
                (l.domain || '').toLowerCase().includes(search) ||
                (l.email || '').toLowerCase().includes(search)
            );
        }
        
        return filtered;
    },

    onSearch(value) {
        this.filters.search = value;
        this.refreshContent();
    },

    onFilterStatus(value) {
        this.filters.status = value;
        this.refreshContent();
    },

    toggleSelect(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this.render(document.getElementById('module-content'));
    },

    toggleAll(checked) {
        if (checked) {
            this.getFilteredLeads().forEach(l => this.selectedIds.add(l.id));
        } else {
            this.selectedIds.clear();
        }
        this.refreshContent();
    },

    async analyzeSelected() {
        if (this.selectedIds.size === 0) return;
        for (const id of this.selectedIds) {
            await this.analyze(id);
        }
        this.selectedIds.clear();
    },

    async deleteSelected() {
        if (this.selectedIds.size === 0) return;
        if (!await Utils.confirm(`Zmazať ${this.selectedIds.size} leadov?`)) return;
        
        for (const id of this.selectedIds) {
            await Database.client.from('leads').delete().eq('id', id);
        }
        
        this.selectedIds.clear();
        Utils.toast('Leady zmazané', 'success');
        await this.loadData();
        this.refreshContent();
    },

    getScoreLevel(score) {
        if (score >= 80) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('sk-SK');
    },

    showProposal(leadId) {
        // TODO: Implement proposal modal
        Utils.toast('Funkcia ponuky - pripravuje sa', 'info');
    },

    editLead(leadId) {
        // TODO: Implement edit modal
        Utils.toast('Úprava - pripravuje sa', 'info');
    },

    importCSV() {
        Utils.toast('CSV import - pripravuje sa', 'info');
    },

    importFromMiner() {
        Utils.toast('Marketing Miner import - pripravuje sa', 'info');
    },

    // ==========================================
    // STYLES
    // ==========================================

    renderStyles() {
        return `
            <style>
                .leads-module {
                    padding: 0;
                    background: #f8fafc;
                    min-height: 100vh;
                }

                /* Header */
                .module-header {
                    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                    padding: 2rem;
                    margin: -1.5rem -1.5rem 0 -1.5rem;
                }

                .header-content {
                    max-width: 1400px;
                    margin: 0 auto;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .header-title h1 {
                    color: white;
                    font-size: 1.75rem;
                    font-weight: 700;
                    margin: 0;
                }

                .header-subtitle {
                    color: #94a3b8;
                    margin-top: 0.25rem;
                }

                .header-actions {
                    display: flex;
                    gap: 0.75rem;
                }

                /* Buttons */
                .btn-primary {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
                }

                .btn-secondary {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    font-weight: 500;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .btn-success {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                }

                /* Stats Grid */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    padding: 1.5rem 2rem;
                    margin-top: -2rem;
                    position: relative;
                    z-index: 10;
                    max-width: 1400px;
                    margin-left: auto;
                    margin-right: auto;
                }

                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }

                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .stat-icon.blue { background: #dbeafe; color: #2563eb; }
                .stat-icon.green { background: #d1fae5; color: #059669; }
                .stat-icon.purple { background: #ede9fe; color: #7c3aed; }
                .stat-icon.orange { background: #ffedd5; color: #ea580c; }

                .stat-content {
                    display: flex;
                    flex-direction: column;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #1e293b;
                }

                .stat-label {
                    font-size: 0.85rem;
                    color: #64748b;
                }

                /* Tabs */
                .tabs-container {
                    background: white;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 0 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .tabs {
                    display: flex;
                    gap: 0.5rem;
                }

                .tab {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 1rem 1.25rem;
                    background: transparent;
                    border: none;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: #64748b;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }

                .tab:hover {
                    color: #1e293b;
                }

                .tab.active {
                    color: #f97316;
                    border-bottom-color: #f97316;
                }

                .tab-icon {
                    font-size: 1.1rem;
                }

                /* Filters */
                .filters {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.75rem 0;
                }

                .search-box {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    background: #f1f5f9;
                    border-radius: 8px;
                    border: 1px solid transparent;
                }

                .search-box:focus-within {
                    background: white;
                    border-color: #f97316;
                }

                .search-box input {
                    border: none;
                    background: transparent;
                    outline: none;
                    font-size: 0.9rem;
                    width: 200px;
                }

                .search-box svg {
                    color: #94a3b8;
                }

                .filter-select {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    background: white;
                    cursor: pointer;
                }

                .bulk-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding-left: 1rem;
                    border-left: 1px solid #e2e8f0;
                }

                .selected-count {
                    font-size: 0.85rem;
                    color: #64748b;
                }

                .btn-bulk {
                    padding: 0.4rem 0.75rem;
                    background: #f1f5f9;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.8rem;
                    cursor: pointer;
                }

                .btn-bulk.danger:hover {
                    background: #fee2e2;
                    color: #dc2626;
                }

                /* Content */
                .content-area {
                    padding: 1.5rem 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                /* Table */
                .table-container {
                    background: white;
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .data-table th {
                    background: #f8fafc;
                    padding: 0.875rem 1rem;
                    text-align: left;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748b;
                    border-bottom: 1px solid #e2e8f0;
                }

                .data-table td {
                    padding: 1rem;
                    border-bottom: 1px solid #f1f5f9;
                }

                .table-row {
                    cursor: pointer;
                    transition: background 0.15s;
                }

                .table-row:hover {
                    background: #f8fafc;
                }

                .col-checkbox {
                    width: 40px;
                }

                .col-actions {
                    width: 180px;
                }

                .lead-company {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }

                .company-name {
                    font-weight: 600;
                    color: #1e293b;
                }

                .company-domain {
                    font-size: 0.8rem;
                    color: #f97316;
                    text-decoration: none;
                }

                .company-domain:hover {
                    text-decoration: underline;
                }

                .lead-contact {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                    font-size: 0.85rem;
                }

                .contact-email { color: #2563eb; }
                .contact-phone { color: #059669; }
                .no-contact { color: #94a3b8; }

                /* Status Badge */
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.35rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }

                .status-blue { background: #dbeafe; color: #1d4ed8; }
                .status-yellow { background: #fef3c7; color: #b45309; }
                .status-purple { background: #ede9fe; color: #7c3aed; }
                .status-orange { background: #ffedd5; color: #c2410c; }
                .status-green { background: #d1fae5; color: #047857; }
                .status-red { background: #fee2e2; color: #dc2626; }

                /* Score Badge */
                .score-badge {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 0.9rem;
                }

                .score-high { background: #d1fae5; color: #047857; }
                .score-medium { background: #fef3c7; color: #b45309; }
                .score-low { background: #f1f5f9; color: #64748b; }

                /* Analysis Badge */
                .analysis-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.25rem 0.5rem;
                    background: #d1fae5;
                    color: #047857;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .no-analysis {
                    color: #94a3b8;
                }

                /* Action Buttons */
                .action-buttons {
                    display: flex;
                    gap: 0.25rem;
                }

                .btn-icon {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f1f5f9;
                    border: none;
                    border-radius: 8px;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .btn-icon:hover {
                    background: #e2e8f0;
                }

                .btn-icon.danger:hover {
                    background: #fee2e2;
                }

                /* Kanban */
                .kanban-board {
                    display: grid;
                    grid-template-columns: repeat(6, 1fr);
                    gap: 1rem;
                    overflow-x: auto;
                    padding-bottom: 1rem;
                }

                .kanban-column {
                    background: #f1f5f9;
                    border-radius: 12px;
                    min-width: 250px;
                }

                .kanban-header {
                    padding: 1rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #e2e8f0;
                }

                .kanban-title {
                    font-weight: 600;
                    font-size: 0.9rem;
                }

                .kanban-count {
                    background: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .kanban-cards {
                    padding: 0.75rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    min-height: 200px;
                }

                .kanban-card {
                    background: white;
                    border-radius: 8px;
                    padding: 0.875rem;
                    cursor: pointer;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
                    transition: all 0.15s;
                }

                .kanban-card:hover {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    transform: translateY(-1px);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.5rem;
                }

                .card-company {
                    font-weight: 600;
                    font-size: 0.9rem;
                }

                .card-score {
                    background: #f1f5f9;
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .card-domain, .card-email {
                    display: block;
                    font-size: 0.8rem;
                    color: #64748b;
                }

                .card-actions {
                    margin-top: 0.5rem;
                }

                .card-tag {
                    font-size: 0.7rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                }

                .card-tag.analyzed {
                    background: #d1fae5;
                    color: #047857;
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

                .modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 540px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }

                .modal-large {
                    max-width: 800px;
                }

                .modal-small {
                    max-width: 400px;
                }

                .modal-header {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-header h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0;
                }

                .modal-title-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .modal-close {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f1f5f9;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    color: #64748b;
                }

                .modal-close:hover {
                    background: #e2e8f0;
                    color: #1e293b;
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
                    justify-content: flex-end;
                    gap: 0.75rem;
                    background: #f8fafc;
                }

                /* Form */
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .form-group {
                    margin-bottom: 1rem;
                }

                .form-group label {
                    display: block;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #475569;
                    margin-bottom: 0.5rem;
                }

                .form-group input,
                .form-group textarea,
                .form-group select {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    transition: all 0.15s;
                }

                .form-group input:focus,
                .form-group textarea:focus,
                .form-group select:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }

                /* Detail */
                .detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                }

                .detail-section {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 1.25rem;
                }

                .detail-section h3 {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin: 0 0 1rem 0;
                    color: #475569;
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                }

                .info-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }

                .info-label {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .info-value {
                    font-size: 0.9rem;
                    color: #1e293b;
                }

                .info-value a {
                    color: #f97316;
                    text-decoration: none;
                }

                .info-value a:hover {
                    text-decoration: underline;
                }

                /* Analysis Content */
                .analysis-content {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .analysis-block {
                    background: white;
                    border-radius: 8px;
                    padding: 1rem;
                }

                .analysis-block h4 {
                    font-size: 0.85rem;
                    font-weight: 600;
                    margin: 0 0 0.5rem 0;
                    color: #475569;
                }

                .analysis-block p {
                    font-size: 0.9rem;
                    color: #64748b;
                    margin: 0;
                    line-height: 1.5;
                }

                .analysis-block.highlight {
                    background: #fff7ed;
                    border: 1px solid #fed7aa;
                }

                .no-analysis-box {
                    text-align: center;
                    padding: 2rem;
                }

                .no-analysis-box p {
                    color: #64748b;
                    margin-bottom: 1rem;
                }

                /* Status Change */
                .status-change-section {
                    margin-top: 1.5rem;
                    padding-top: 1.5rem;
                    border-top: 1px solid #e2e8f0;
                }

                .status-change-section label {
                    display: block;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #64748b;
                    margin-bottom: 0.75rem;
                }

                .status-buttons {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }

                .status-btn {
                    padding: 0.5rem 0.875rem;
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .status-btn:hover {
                    background: #e2e8f0;
                }

                .status-btn.active {
                    background: #f97316;
                    color: white;
                    border-color: #f97316;
                }

                /* Import */
                .import-options {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }

                .import-option {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .import-option:hover {
                    border-color: #f97316;
                    background: #fff7ed;
                }

                .import-icon {
                    font-size: 2rem;
                }

                .import-text {
                    display: flex;
                    flex-direction: column;
                }

                .import-text strong {
                    font-size: 0.9rem;
                }

                .import-text span {
                    font-size: 0.8rem;
                    color: #64748b;
                }

                .import-paste {
                    margin-top: 1rem;
                }

                .import-paste label {
                    display: block;
                    font-size: 0.85rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: #475569;
                }

                .import-paste textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-family: monospace;
                    resize: vertical;
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    background: white;
                    border-radius: 16px;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .empty-state h3 {
                    font-size: 1.25rem;
                    margin: 0 0 0.5rem 0;
                }

                .empty-state p {
                    color: #64748b;
                    margin: 0 0 1.5rem 0;
                }

                /* Loading */
                .loading-spinner {
                    width: 48px;
                    height: 48px;
                    border: 3px solid #e2e8f0;
                    border-top-color: #f97316;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                /* Responsive */
                @media (max-width: 1024px) {
                    .stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    
                    .kanban-board {
                        grid-template-columns: repeat(3, 1fr);
                    }
                    
                    .detail-grid {
                        grid-template-columns: 1fr;
                    }
                }

                @media (max-width: 768px) {
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .tabs-container {
                        flex-direction: column;
                        gap: 1rem;
                        padding: 1rem;
                    }
                    
                    .filters {
                        flex-wrap: wrap;
                    }
                    
                    .form-row {
                        grid-template-columns: 1fr;
                    }
                    
                    .kanban-board {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
    }
};

// Export
window.LeadsModule = LeadsModule;
