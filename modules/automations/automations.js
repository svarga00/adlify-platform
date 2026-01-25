/**
 * ADLIFY - Automations Module
 * Trigger → Action workflow automatizácie
 */

const AutomationsModule = {
    id: 'automations',
    name: 'Automatizácie',
    icon: Icons.zap,
    title: 'Automatizácie',
    menu: { section: 'tools', order: 60 },
    permissions: ['automations', 'view'],

    // Data
    automations: [],

    // Definície triggerov
    triggers: {
        lead_created: { label: 'Lead vytvorený', icon: Icons.user, entity: 'lead' },
        lead_status_changed: { label: 'Lead zmenil status', icon: Icons.sync, entity: 'lead' },
        lead_no_activity: { label: 'Lead bez aktivity X dní', icon: Icons.clock, entity: 'lead' },
        client_created: { label: 'Klient vytvorený', icon: Icons.building, entity: 'client' },
        invoice_created: { label: 'Faktúra vytvorená', icon: Icons.documents, entity: 'invoice' },
        invoice_overdue: { label: 'Faktúra po splatnosti', icon: Icons.alertTriangle, entity: 'invoice' },
        invoice_paid: { label: 'Faktúra uhradená', icon: Icons.checkCircle, entity: 'invoice' },
        task_assigned: { label: 'Úloha priradená', icon: Icons.clipboard, entity: 'task' },
        task_due: { label: 'Úloha pred termínom', icon: Icons.bell, entity: 'task' },
        scheduled: { label: 'Naplánované (cron)', icon: Icons.calendar, entity: null }
    },

    // Definície akcií
    actions: {
        send_email: { label: 'Poslať email', icon: Icons.mail },
        create_task: { label: 'Vytvoriť úlohu', icon: Icons.checkCircle },
        create_notification: { label: 'Notifikácia', icon: Icons.bell },
        update_status: { label: 'Zmeniť status', icon: Icons.sync },
        add_tag: { label: 'Pridať tag', icon: Icons.tag },
        webhook: { label: 'Zavolať webhook', icon: Icons.link },
        slack_message: { label: 'Slack správa', icon: Icons.messageCircle }
    },

    async init() {
        console.log('Automations module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="automations-module">
                <div class="module-header">
                    <div class="header-left">
                        <h1>Automatizácie</h1>
                        <p class="subtitle">Automatické workflow a notifikácie</p>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" onclick="AutomationsModule.showCreateModal()">
                            <span>+</span> Nová automatizácia
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="auto-stats">
                    <div class="stat-card">
                        <span class="stat-icon">${Icons.zap}</span>
                        <span class="stat-value" id="stat-active">0</span>
                        <span class="stat-label">Aktívne</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">${Icons.pause}</span>
                        <span class="stat-value" id="stat-paused">0</span>
                        <span class="stat-label">Pozastavené</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-icon">${Icons.sync}</span>
                        <span class="stat-value" id="stat-runs">0</span>
                        <span class="stat-label">Spustení (30d)</span>
                    </div>
                </div>

                <!-- Automations List -->
                <div class="automations-content" id="automations-content">
                    <div class="loading">Načítavam automatizácie...</div>
                </div>

                <!-- Templates -->
                <div class="templates-section">
                    <h3>${Icons.package} Šablóny automatizácií</h3>
                    <div class="templates-grid">
                        ${this.renderTemplates()}
                    </div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        await this.loadAutomations();
    },

    async loadAutomations() {
        try {
            const { data, error } = await Database.client
                .from('automations')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.automations = data || [];
            this.updateStats();
            this.renderAutomations();

        } catch (error) {
            console.error('Load automations error:', error);
            this.automations = [];
            this.renderAutomations();
        }
    },

    updateStats() {
        const active = this.automations.filter(a => a.is_active).length;
        const paused = this.automations.filter(a => !a.is_active).length;
        const runs = this.automations.reduce((sum, a) => sum + (a.run_count || 0), 0);

        document.getElementById('stat-active').textContent = active;
        document.getElementById('stat-paused').textContent = paused;
        document.getElementById('stat-runs').textContent = runs;
    },

    renderAutomations() {
        const container = document.getElementById('automations-content');
        if (!container) return;

        if (this.automations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${Icons.zap}</div>
                    <h3>Žiadne automatizácie</h3>
                    <p>Vytvor prvú automatizáciu alebo použi šablónu nižšie</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="automations-list">
                ${this.automations.map(a => this.renderAutomationCard(a)).join('')}
            </div>
        `;
    },

    renderAutomationCard(automation) {
        const trigger = this.triggers[automation.trigger_type] || { label: automation.trigger_type, icon: Icons.settings };
        const action = this.actions[automation.action_type] || { label: automation.action_type, icon: Icons.play };

        return `
            <div class="automation-card ${automation.is_active ? 'active' : 'paused'}">
                <div class="auto-header">
                    <div class="auto-toggle">
                        <label class="toggle">
                            <input type="checkbox" ${automation.is_active ? 'checked' : ''} 
                                   onchange="AutomationsModule.toggleAutomation('${automation.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="auto-info">
                        <h4 class="auto-name">${automation.name}</h4>
                        ${automation.description ? `<p class="auto-desc">${automation.description}</p>` : ''}
                    </div>
                    <div class="auto-actions">
                        <button class="btn-icon" onclick="AutomationsModule.editAutomation('${automation.id}')" title="Upraviť">${Icons.edit}</button>
                        <button class="btn-icon" onclick="AutomationsModule.deleteAutomation('${automation.id}')" title="Zmazať">${Icons.trash}</button>
                    </div>
                </div>
                
                <div class="auto-flow">
                    <div class="flow-trigger">
                        <span class="flow-icon">${trigger.icon}</span>
                        <span class="flow-label">${trigger.label}</span>
                        ${automation.trigger_config?.status ? `<span class="flow-detail">→ ${automation.trigger_config.status}</span>` : ''}
                        ${automation.trigger_config?.days ? `<span class="flow-detail">${automation.trigger_config.days} dní</span>` : ''}
                    </div>
                    <div class="flow-arrow">→</div>
                    <div class="flow-action">
                        <span class="flow-icon">${action.icon}</span>
                        <span class="flow-label">${action.label}</span>
                    </div>
                </div>
                
                <div class="auto-footer">
                    <span class="auto-runs">${Icons.sync} ${automation.run_count || 0} spustení</span>
                    ${automation.last_run_at ? `<span class="auto-last">Posledné: ${this.formatDate(automation.last_run_at)}</span>` : ''}
                </div>
            </div>
        `;
    },

    renderTemplates() {
        const templates = [
            {
                name: 'Follow-up po 3 dňoch',
                trigger: 'lead_status_changed',
                action: 'send_email',
                description: 'Automatický follow-up keď lead dostane ponuku'
            },
            {
                name: 'Upomienka faktúry',
                trigger: 'invoice_overdue',
                action: 'send_email',
                description: 'Email keď je faktúra po splatnosti'
            },
            {
                name: 'Notifikácia pri novom leade',
                trigger: 'lead_created',
                action: 'create_notification',
                description: 'Upozornenie keď príde nový lead'
            },
            {
                name: 'Úloha po schválení',
                trigger: 'lead_status_changed',
                action: 'create_task',
                description: 'Vytvoriť úlohu keď klient schváli ponuku'
            }
        ];

        return templates.map(t => `
            <div class="template-card" onclick="AutomationsModule.useTemplate('${t.name}')">
                <div class="template-icons">
                    <span>${this.triggers[t.trigger]?.icon || ''}</span>
                    <span class="template-arrow">→</span>
                    <span>${this.actions[t.action]?.icon || ''}</span>
                </div>
                <h4>${t.name}</h4>
                <p>${t.description}</p>
            </div>
        `).join('');
    },

    showCreateModal(prefill = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal automation-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">${Icons.zap}</span>
                        <h2>${prefill ? 'Použiť šablónu' : 'Nová automatizácia'}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="automation-form">
                        <div class="form-group">
                            <label>Názov automatizácie *</label>
                            <input type="text" name="name" required value="${prefill?.name || ''}" placeholder="Napr. Follow-up email">
                        </div>
                        
                        <div class="form-group">
                            <label>Popis</label>
                            <input type="text" name="description" value="${prefill?.description || ''}" placeholder="Čo táto automatizácia robí">
                        </div>
                        
                        <!-- Trigger -->
                        <div class="form-section">
                            <h4>${Icons.target} Keď (Trigger)</h4>
                            <div class="form-group">
                                <label>Spustiť keď...</label>
                                <select name="trigger_type" onchange="AutomationsModule.updateTriggerOptions(this.value)">
                                    ${Object.entries(this.triggers).map(([key, val]) => 
                                        `<option value="${key}" ${prefill?.trigger === key ? 'selected' : ''}>${val.icon} ${val.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div id="trigger-options" class="trigger-options">
                                <!-- Dynamické možnosti -->
                            </div>
                        </div>
                        
                        <!-- Action -->
                        <div class="form-section">
                            <h4>${Icons.play} Potom (Akcia)</h4>
                            <div class="form-group">
                                <label>Vykonať...</label>
                                <select name="action_type" onchange="AutomationsModule.updateActionOptions(this.value)">
                                    ${Object.entries(this.actions).map(([key, val]) => 
                                        `<option value="${key}" ${prefill?.action === key ? 'selected' : ''}>${val.icon} ${val.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div id="action-options" class="action-options">
                                <!-- Dynamické možnosti -->
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="is_active" checked>
                                <span>Aktivovať ihneď</span>
                            </label>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="AutomationsModule.saveAutomation()">
                        ${Icons.zap} Vytvoriť automatizáciu
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Inicializovať options
        this.updateTriggerOptions(prefill?.trigger || 'lead_created');
        this.updateActionOptions(prefill?.action || 'send_email');
    },

    updateTriggerOptions(triggerType) {
        const container = document.getElementById('trigger-options');
        if (!container) return;

        let html = '';

        switch(triggerType) {
            case 'lead_status_changed':
                html = `
                    <div class="form-group">
                        <label>Na status</label>
                        <select name="trigger_status">
                            <option value="new">Nový</option>
                            <option value="contacted">Kontaktovaný</option>
                            <option value="proposal_sent">Ponuka odoslaná</option>
                            <option value="negotiation">Vyjednávanie</option>
                            <option value="won">Vyhraný</option>
                            <option value="lost">Prehraný</option>
                        </select>
                    </div>
                `;
                break;
                
            case 'lead_no_activity':
            case 'task_due':
                html = `
                    <div class="form-group">
                        <label>Počet dní</label>
                        <input type="number" name="trigger_days" value="3" min="1" max="365">
                    </div>
                `;
                break;
                
            case 'invoice_overdue':
                html = `
                    <div class="form-group">
                        <label>Dní po splatnosti</label>
                        <input type="number" name="trigger_days" value="7" min="1" max="90">
                    </div>
                `;
                break;
                
            case 'scheduled':
                html = `
                    <div class="form-group">
                        <label>Opakovanie</label>
                        <select name="trigger_schedule">
                            <option value="daily">Každý deň</option>
                            <option value="weekly">Každý týždeň</option>
                            <option value="monthly">Každý mesiac</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Čas</label>
                        <input type="time" name="trigger_time" value="09:00">
                    </div>
                `;
                break;
        }

        container.innerHTML = html;
    },

    updateActionOptions(actionType) {
        const container = document.getElementById('action-options');
        if (!container) return;

        let html = '';

        switch(actionType) {
            case 'send_email':
                html = `
                    <div class="form-group">
                        <label>Email šablóna</label>
                        <select name="action_template">
                            <option value="">-- Vyber šablónu --</option>
                            <option value="follow_up">Follow-up</option>
                            <option value="reminder">Upomienka</option>
                            <option value="welcome">Welcome email</option>
                        </select>
                    </div>
                `;
                break;
                
            case 'create_task':
                html = `
                    <div class="form-group">
                        <label>Názov úlohy</label>
                        <input type="text" name="action_task_name" placeholder="Napr. Zavolať klientovi">
                    </div>
                    <div class="form-group">
                        <label>Termín (dní od triggeru)</label>
                        <input type="number" name="action_task_days" value="1" min="0">
                    </div>
                `;
                break;
                
            case 'update_status':
                html = `
                    <div class="form-group">
                        <label>Nový status</label>
                        <select name="action_new_status">
                            <option value="contacted">Kontaktovaný</option>
                            <option value="qualified">Kvalifikovaný</option>
                            <option value="proposal_sent">Ponuka odoslaná</option>
                        </select>
                    </div>
                `;
                break;
                
            case 'webhook':
                html = `
                    <div class="form-group">
                        <label>Webhook URL</label>
                        <input type="url" name="action_webhook_url" placeholder="https://...">
                    </div>
                `;
                break;
                
            case 'slack_message':
                html = `
                    <div class="form-group">
                        <label>Slack kanál</label>
                        <input type="text" name="action_slack_channel" placeholder="#general">
                    </div>
                    <div class="form-group">
                        <label>Správa</label>
                        <textarea name="action_slack_message" rows="2" placeholder="Použite {lead_name}, {company}..."></textarea>
                    </div>
                `;
                break;
        }

        container.innerHTML = html;
    },

    async saveAutomation() {
        const form = document.getElementById('automation-form');
        const formData = new FormData(form);

        // Zozbierať trigger config
        const triggerConfig = {};
        if (formData.get('trigger_status')) triggerConfig.status = formData.get('trigger_status');
        if (formData.get('trigger_days')) triggerConfig.days = parseInt(formData.get('trigger_days'));
        if (formData.get('trigger_schedule')) triggerConfig.schedule = formData.get('trigger_schedule');
        if (formData.get('trigger_time')) triggerConfig.time = formData.get('trigger_time');

        // Zozbierať action config
        const actionConfig = {};
        if (formData.get('action_template')) actionConfig.template = formData.get('action_template');
        if (formData.get('action_task_name')) actionConfig.task_name = formData.get('action_task_name');
        if (formData.get('action_task_days')) actionConfig.task_days = parseInt(formData.get('action_task_days'));
        if (formData.get('action_new_status')) actionConfig.new_status = formData.get('action_new_status');
        if (formData.get('action_webhook_url')) actionConfig.webhook_url = formData.get('action_webhook_url');
        if (formData.get('action_slack_channel')) actionConfig.slack_channel = formData.get('action_slack_channel');
        if (formData.get('action_slack_message')) actionConfig.slack_message = formData.get('action_slack_message');

        const automationData = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            trigger_type: formData.get('trigger_type'),
            trigger_config: triggerConfig,
            action_type: formData.get('action_type'),
            action_config: actionConfig,
            is_active: formData.get('is_active') === 'on',
            created_by: Auth.teamMember?.id
        };

        try {
            const { error } = await Database.client
                .from('automations')
                .insert([automationData]);

            if (error) throw error;

            document.querySelector('.modal-overlay').remove();
            await this.loadAutomations();
            Utils.showNotification('Automatizácia vytvorená', 'success');

        } catch (error) {
            console.error('Save automation error:', error);
            Utils.showNotification('Chyba pri ukladaní', 'error');
        }
    },

    async toggleAutomation(id, isActive) {
        try {
            const { error } = await Database.client
                .from('automations')
                .update({ is_active: isActive })
                .eq('id', id);

            if (error) throw error;

            const automation = this.automations.find(a => a.id === id);
            if (automation) automation.is_active = isActive;
            this.updateStats();
            
            Utils.showNotification(isActive ? 'Automatizácia aktivovaná' : 'Automatizácia pozastavená', 'success');

        } catch (error) {
            console.error('Toggle error:', error);
            Utils.showNotification('Chyba', 'error');
        }
    },

    editAutomation(id) {
        Utils.showNotification('Editácia - čoskoro', 'info');
    },

    async deleteAutomation(id) {
        if (!confirm('Naozaj chceš zmazať túto automatizáciu?')) return;

        try {
            const { error } = await Database.client
                .from('automations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.automations = this.automations.filter(a => a.id !== id);
            this.updateStats();
            this.renderAutomations();
            Utils.showNotification('Automatizácia zmazaná', 'success');

        } catch (error) {
            console.error('Delete error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    useTemplate(templateName) {
        const templates = {
            'Follow-up po 3 dňoch': {
                name: 'Follow-up po 3 dňoch',
                description: 'Automatický follow-up email keď lead dostane ponuku',
                trigger: 'lead_status_changed',
                action: 'send_email'
            },
            'Upomienka faktúry': {
                name: 'Upomienka faktúry',
                description: 'Email upomienka keď je faktúra po splatnosti',
                trigger: 'invoice_overdue',
                action: 'send_email'
            },
            'Notifikácia pri novom leade': {
                name: 'Notifikácia - nový lead',
                description: 'Upozornenie keď príde nový lead',
                trigger: 'lead_created',
                action: 'create_notification'
            },
            'Úloha po schválení': {
                name: 'Úloha po schválení',
                description: 'Vytvoriť úlohu keď klient schváli ponuku',
                trigger: 'lead_status_changed',
                action: 'create_task'
            }
        };

        const template = templates[templateName];
        if (template) {
            this.showCreateModal(template);
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('sk-SK');
    },

    getStyles() {
        return `
            <style>
                .automations-module {
                    padding: 2rem;
                    max-width: 1200px;
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
                    margin: 0;
                }

                .subtitle { color: #64748b; margin-top: 0.25rem; }

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
                .auto-stats {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .stat-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    border: 1px solid #e2e8f0;
                }

                .stat-icon { font-size: 1.5rem; }
                .stat-value { font-size: 1.5rem; font-weight: 700; }
                .stat-label { color: #64748b; font-size: 0.875rem; }

                /* Automations List */
                .automations-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .automation-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    border: 1px solid #e2e8f0;
                }

                .automation-card.paused {
                    opacity: 0.7;
                }

                .auto-header {
                    display: flex;
                    align-items: flex-start;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .auto-info { flex: 1; }

                .auto-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .auto-desc {
                    font-size: 0.8rem;
                    color: #64748b;
                    margin: 0.25rem 0 0;
                }

                .auto-actions {
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

                /* Toggle */
                .toggle {
                    position: relative;
                    display: inline-block;
                    width: 44px;
                    height: 24px;
                }

                .toggle input { opacity: 0; width: 0; height: 0; }

                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    inset: 0;
                    background: #cbd5e1;
                    border-radius: 24px;
                    transition: 0.3s;
                }

                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 3px;
                    bottom: 3px;
                    background: white;
                    border-radius: 50%;
                    transition: 0.3s;
                }

                input:checked + .toggle-slider {
                    background: linear-gradient(135deg, #f97316, #ec4899);
                }

                input:checked + .toggle-slider:before {
                    transform: translateX(20px);
                }

                /* Flow */
                .auto-flow {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 8px;
                }

                .flow-trigger, .flow-action {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .flow-icon { font-size: 1.25rem; }
                .flow-label { font-weight: 500; }
                .flow-detail { font-size: 0.75rem; color: #64748b; }
                .flow-arrow { color: #94a3b8; font-size: 1.25rem; }

                .auto-footer {
                    display: flex;
                    gap: 1rem;
                    margin-top: 1rem;
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                /* Templates */
                .templates-section {
                    margin-top: 2rem;
                }

                .templates-section h3 {
                    font-size: 1rem;
                    color: #64748b;
                    margin: 0 0 1rem;
                }

                .templates-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 1rem;
                }

                .template-card {
                    background: white;
                    border: 1px dashed #d1d5db;
                    border-radius: 12px;
                    padding: 1.25rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .template-card:hover {
                    border-color: #6366f1;
                    border-style: solid;
                }

                .template-icons {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 1.25rem;
                    margin-bottom: 0.75rem;
                }

                .template-arrow { color: #94a3b8; }

                .template-card h4 {
                    margin: 0 0 0.25rem;
                    font-size: 0.9rem;
                }

                .template-card p {
                    margin: 0;
                    font-size: 0.75rem;
                    color: #64748b;
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

                .automation-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 550px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-title { display: flex; align-items: center; gap: 0.75rem; }
                .modal-title h2 { margin: 0; font-size: 1.25rem; }
                .modal-icon { font-size: 1.5rem; }

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
                    justify-content: flex-end;
                    gap: 0.75rem;
                }

                .form-group { margin-bottom: 1rem; }
                .form-group label { display: block; font-weight: 500; margin-bottom: 0.5rem; }
                .form-group input, .form-group select, .form-group textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 0.875rem;
                }

                .form-section {
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                }

                .form-section h4 {
                    margin: 0 0 0.75rem;
                    font-size: 0.875rem;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }

                .btn-secondary {
                    padding: 0.75rem 1.25rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    cursor: pointer;
                }

                .empty-state {
                    text-align: center;
                    padding: 3rem;
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                }

                .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
            </style>
        `;
    }
};

// Export
window.AutomationsModule = AutomationsModule;
