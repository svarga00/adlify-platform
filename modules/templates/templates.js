/**
 * ADLIFY - Templates Module
 * Šablóny emailov, textov a dokumentov
 */

const TemplatesModule = {
    id: 'templates',
    name: 'Šablóny',
    icon: Icons.edit,
    title: 'Šablóny',
    menu: { section: 'tools', order: 57 },
    permissions: ['templates', 'view'],

    // Data
    templates: [],
    currentType: 'all',

    // Dostupné premenné
    variables: {
        contact: ['contact_name', 'contact_email', 'contact_phone'],
        company: ['company_name', 'website', 'industry'],
        package: ['package_name', 'package_price'],
        invoice: ['invoice_number', 'invoice_amount', 'due_date'],
        my: ['my_name', 'my_email', 'my_phone'],
        ad: ['headline_1', 'headline_2', 'headline_3', 'description_1', 'description_2', 'display_url']
    },

    async init() {
        console.log('Templates module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="templates-module">
                <div class="module-header">
                    <div class="header-left">
                        <h1>Šablóny</h1>
                        <p class="subtitle">Email šablóny, texty kampaní a dokumenty</p>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" onclick="TemplatesModule.showCreateModal()">
                            <span>+</span> Nová šablóna
                        </button>
                    </div>
                </div>

                <!-- Type Filter -->
                <div class="type-filter">
                    <button class="type-btn ${this.currentType === 'all' ? 'active' : ''}" onclick="TemplatesModule.setType('all')">
                        Všetky
                    </button>
                    <button class="type-btn ${this.currentType === 'email' ? 'active' : ''}" onclick="TemplatesModule.setType('email')">
                        ${Icons.mail} Emaily
                    </button>
                    <button class="type-btn ${this.currentType === 'ad_text' ? 'active' : ''}" onclick="TemplatesModule.setType('ad_text')">
                        ${Icons.campaigns} Reklamy
                    </button>
                    <button class="type-btn ${this.currentType === 'proposal' ? 'active' : ''}" onclick="TemplatesModule.setType('proposal')">
                        ${Icons.documents} Ponuky
                    </button>
                    <button class="type-btn ${this.currentType === 'other' ? 'active' : ''}" onclick="TemplatesModule.setType('other')">
                        ${Icons.clipboard} Ostatné
                    </button>
                </div>

                <div class="templates-content" id="templates-content">
                    <div class="loading">Načítavam šablóny...</div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        await this.loadTemplates();
        this.renderTemplates();
    },

    async loadTemplates() {
        try {
            const { data, error } = await Database.client
                .from('templates')
                .select('*')
                .eq('is_active', true)
                .order('usage_count', { ascending: false });

            if (error) throw error;
            this.templates = data || [];
        } catch (error) {
            console.error('Load templates error:', error);
            this.templates = [];
        }
    },

    renderTemplates() {
        const container = document.getElementById('templates-content');
        if (!container) return;

        const filtered = this.currentType === 'all' 
            ? this.templates 
            : this.templates.filter(t => t.type === this.currentType);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${Icons.edit}</div>
                    <h3>Žiadne šablóny</h3>
                    <p>Vytvor prvú šablónu pre rýchlejšiu prácu</p>
                </div>
            `;
            return;
        }

        // Group by category
        const grouped = {};
        filtered.forEach(t => {
            const cat = t.category || 'Bez kategórie';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(t);
        });

        let html = '';
        for (const [category, templates] of Object.entries(grouped)) {
            html += `
                <div class="template-group">
                    <h3 class="group-title">${this.getCategoryName(category)}</h3>
                    <div class="templates-grid">
                        ${templates.map(t => this.renderTemplateCard(t)).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    renderTemplateCard(template) {
        const typeIcons = {
            email: '',
            sms: '',
            ad_text: '',
            report: '',
            proposal: '',
            other: ''
        };

        return `
            <div class="template-card" onclick="TemplatesModule.openTemplate('${template.id}')">
                <div class="template-header">
                    <span class="template-icon">${typeIcons[template.type] || ''}</span>
                    <span class="template-type">${this.getTypeName(template.type)}</span>
                    ${template.is_default ? '<span class="default-badge">Default</span>' : ''}
                </div>
                <h4 class="template-name">${template.name}</h4>
                ${template.description ? `<p class="template-desc">${template.description}</p>` : ''}
                ${template.subject ? `<p class="template-subject">Predmet: ${template.subject}</p>` : ''}
                <div class="template-footer">
                    <span class="usage-count">Použité ${template.usage_count}×</span>
                    <div class="template-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); TemplatesModule.useTemplate('${template.id}')" title="Použiť">
                            ${Icons.play}
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); TemplatesModule.duplicateTemplate('${template.id}')" title="Duplikovať">
                            ${Icons.clipboard}
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    setType(type) {
        this.currentType = type;
        document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        this.renderTemplates();
    },

    showCreateModal(template = null) {
        const isEdit = !!template;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal template-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">${Icons.edit}</span>
                        <h2>${isEdit ? 'Upraviť šablónu' : 'Nová šablóna'}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="template-form">
                        ${isEdit ? `<input type="hidden" name="id" value="${template.id}">` : ''}
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Názov šablóny *</label>
                                <input type="text" name="name" required value="${template?.name || ''}" placeholder="Napr. Úvodná ponuka">
                            </div>
                            <div class="form-group">
                                <label>Typ *</label>
                                <select name="type" required onchange="TemplatesModule.toggleSubject(this.value)">
                                    <option value="email" ${template?.type === 'email' ? 'selected' : ''}>${Icons.mail} Email</option>
                                    <option value="ad_text" ${template?.type === 'ad_text' ? 'selected' : ''}>${Icons.campaigns} Text reklamy</option>
                                    <option value="proposal" ${template?.type === 'proposal' ? 'selected' : ''}>${Icons.documents} Ponuka</option>
                                    <option value="sms" ${template?.type === 'sms' ? 'selected' : ''}>${Icons.messageCircle} SMS</option>
                                    <option value="other" ${template?.type === 'other' ? 'selected' : ''}>${Icons.clipboard} Iné</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Kategória</label>
                                <select name="category">
                                    <option value="">-- Bez kategórie --</option>
                                    <option value="sales" ${template?.category === 'sales' ? 'selected' : ''}>Sales</option>
                                    <option value="onboarding" ${template?.category === 'onboarding' ? 'selected' : ''}>Onboarding</option>
                                    <option value="billing" ${template?.category === 'billing' ? 'selected' : ''}>Fakturácia</option>
                                    <option value="support" ${template?.category === 'support' ? 'selected' : ''}>Support</option>
                                    <option value="google_ads" ${template?.category === 'google_ads' ? 'selected' : ''}>Google Ads</option>
                                    <option value="meta_ads" ${template?.category === 'meta_ads' ? 'selected' : ''}>Meta Ads</option>
                                </select>
                            </div>
                            <div class="form-group" id="subject-group" style="${template?.type !== 'email' && !template ? 'display:none' : ''}">
                                <label>Predmet emailu</label>
                                <input type="text" name="subject" value="${template?.subject || ''}" placeholder="Predmet správy">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Popis (interný)</label>
                            <input type="text" name="description" value="${template?.description || ''}" placeholder="Kedy použiť túto šablónu">
                        </div>
                        
                        <div class="form-group">
                            <label>Obsah šablóny *</label>
                            <div class="variables-help">
                                <span>Dostupné premenné:</span>
                                <div class="variables-list">
                                    ${this.renderVariableButtons()}
                                </div>
                            </div>
                            <textarea name="content" required rows="12" id="template-content" placeholder="Obsah šablóny... Použite {premenna} pre dynamické hodnoty">${template?.content || ''}</textarea>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    ${isEdit ? `<button class="btn-danger" onclick="TemplatesModule.deleteTemplate('${template.id}')">Zmazať</button>` : '<div></div>'}
                    <div class="footer-right">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                        <button class="btn-primary" onclick="TemplatesModule.saveTemplate()">
                            ${isEdit ? 'Uložiť zmeny' : 'Vytvoriť šablónu'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    renderVariableButtons() {
        const allVars = [
            ...this.variables.contact,
            ...this.variables.company,
            ...this.variables.package,
            ...this.variables.invoice,
            ...this.variables.my
        ];

        return allVars.map(v => 
            `<button type="button" class="var-btn" onclick="TemplatesModule.insertVariable('${v}')">{${v}}</button>`
        ).join('');
    },

    insertVariable(variable) {
        const textarea = document.getElementById('template-content');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const varText = `{${variable}}`;

        textarea.value = text.substring(0, start) + varText + text.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + varText.length;
        textarea.focus();
    },

    toggleSubject(type) {
        const subjectGroup = document.getElementById('subject-group');
        if (subjectGroup) {
            subjectGroup.style.display = type === 'email' ? 'block' : 'none';
        }
    },

    async saveTemplate() {
        const form = document.getElementById('template-form');
        const formData = new FormData(form);
        const id = formData.get('id');

        // Extract variables from content
        const content = formData.get('content');
        const matches = content.match(/\{(\w+)\}/g) || [];
        const variables = [...new Set(matches.map(m => m.slice(1, -1)))];

        const templateData = {
            name: formData.get('name'),
            type: formData.get('type'),
            category: formData.get('category') || null,
            subject: formData.get('subject') || null,
            description: formData.get('description') || null,
            content: content,
            variables: variables
        };

        try {
            if (id) {
                const { error } = await Database.client
                    .from('templates')
                    .update(templateData)
                    .eq('id', id);
                if (error) throw error;
            } else {
                templateData.created_by = Auth.teamMember?.id;
                const { error } = await Database.client
                    .from('templates')
                    .insert([templateData]);
                if (error) throw error;
            }

            document.querySelector('.modal-overlay').remove();
            await this.loadTemplates();
            this.renderTemplates();
            Utils.showNotification(id ? 'Šablóna aktualizovaná' : 'Šablóna vytvorená', 'success');

        } catch (error) {
            console.error('Save template error:', error);
            Utils.showNotification('Chyba pri ukladaní', 'error');
        }
    },

    async openTemplate(id) {
        const template = this.templates.find(t => t.id === id);
        if (!template) return;
        this.showCreateModal(template);
    },

    async useTemplate(id) {
        const template = this.templates.find(t => t.id === id);
        if (!template) return;

        // Increment usage count
        await Database.client
            .from('templates')
            .update({ usage_count: (template.usage_count || 0) + 1 })
            .eq('id', id);

        // Show preview with variable inputs
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal template-modal use-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">${Icons.play}</span>
                        <h2>Použiť šablónu</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <h3>${template.name}</h3>
                    
                    ${template.variables && template.variables.length > 0 ? `
                        <div class="variables-inputs">
                            <h4>Vyplň premenné:</h4>
                            ${template.variables.map(v => `
                                <div class="var-input">
                                    <label>{${v}}</label>
                                    <input type="text" id="var-${v}" placeholder="${this.getVariablePlaceholder(v)}">
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="preview-section">
                        <h4>Náhľad:</h4>
                        ${template.subject ? `<div class="preview-subject"><strong>Predmet:</strong> <span id="preview-subject">${template.subject}</span></div>` : ''}
                        <div class="preview-content" id="preview-content">${template.content.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                    <button class="btn-secondary" onclick="TemplatesModule.updatePreview('${id}')">Aktualizovať náhľad</button>
                    <button class="btn-primary" onclick="TemplatesModule.copyToClipboard()">${Icons.clipboard} Kopírovať</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Auto-fill from settings if available
        this.autoFillVariables();
    },

    autoFillVariables() {
        // Try to fill "my_" variables from settings or team member
        const myName = Auth.teamMember ? `${Auth.teamMember.first_name} ${Auth.teamMember.last_name}` : '';
        const myEmail = Auth.teamMember?.email || '';
        const myPhone = Auth.teamMember?.phone || '';

        const inputs = {
            'var-my_name': myName,
            'var-my_email': myEmail,
            'var-my_phone': myPhone
        };

        for (const [id, value] of Object.entries(inputs)) {
            const input = document.getElementById(id);
            if (input && value) input.value = value;
        }
    },

    updatePreview(id) {
        const template = this.templates.find(t => t.id === id);
        if (!template) return;

        let content = template.content;
        let subject = template.subject || '';

        // Replace variables
        if (template.variables) {
            template.variables.forEach(v => {
                const input = document.getElementById(`var-${v}`);
                const value = input?.value || `{${v}}`;
                content = content.replace(new RegExp(`\\{${v}\\}`, 'g'), value);
                subject = subject.replace(new RegExp(`\\{${v}\\}`, 'g'), value);
            });
        }

        document.getElementById('preview-content').innerHTML = content.replace(/\n/g, '<br>');
        const subjectEl = document.getElementById('preview-subject');
        if (subjectEl) subjectEl.textContent = subject;
    },

    copyToClipboard() {
        const content = document.getElementById('preview-content').innerText;
        navigator.clipboard.writeText(content).then(() => {
            Utils.showNotification('Skopírované do schránky', 'success');
        });
    },

    async duplicateTemplate(id) {
        const template = this.templates.find(t => t.id === id);
        if (!template) return;

        const newTemplate = {
            name: template.name + ' (kópia)',
            type: template.type,
            category: template.category,
            subject: template.subject,
            description: template.description,
            content: template.content,
            variables: template.variables,
            created_by: Auth.teamMember?.id
        };

        try {
            const { error } = await Database.client
                .from('templates')
                .insert([newTemplate]);

            if (error) throw error;

            await this.loadTemplates();
            this.renderTemplates();
            Utils.showNotification('Šablóna duplikovaná', 'success');

        } catch (error) {
            console.error('Duplicate error:', error);
            Utils.showNotification('Chyba pri duplikovaní', 'error');
        }
    },

    async deleteTemplate(id) {
        if (!confirm('Naozaj chceš zmazať túto šablónu?')) return;

        try {
            const { error } = await Database.client
                .from('templates')
                .delete()
                .eq('id', id);

            if (error) throw error;

            document.querySelector('.modal-overlay').remove();
            await this.loadTemplates();
            this.renderTemplates();
            Utils.showNotification('Šablóna zmazaná', 'success');

        } catch (error) {
            console.error('Delete error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    getTypeName(type) {
        const names = {
            email: 'Email',
            sms: 'SMS',
            ad_text: 'Reklama',
            report: 'Report',
            proposal: 'Ponuka',
            other: 'Iné'
        };
        return names[type] || type;
    },

    getCategoryName(category) {
        const names = {
            sales: 'Sales',
            onboarding: 'Onboarding',
            billing: 'Fakturácia',
            support: 'Support',
            google_ads: 'Google Ads',
            meta_ads: 'Meta Ads',
            'Bez kategórie': 'Bez kategórie'
        };
        return names[category] || category;
    },

    getVariablePlaceholder(variable) {
        const placeholders = {
            contact_name: 'Ján Novák',
            contact_email: 'jan@firma.sk',
            contact_phone: '+421 900 123 456',
            company_name: 'Firma s.r.o.',
            website: 'www.firma.sk',
            industry: 'E-commerce',
            package_name: 'Pro',
            package_price: '249',
            invoice_number: '2024001',
            invoice_amount: '299',
            due_date: '15.1.2025',
            my_name: 'Tvoje meno',
            my_email: 'ty@adlify.eu',
            my_phone: '+421 900 000 000'
        };
        return placeholders[variable] || '';
    },

    // API pre použitie v iných moduloch
    async getTemplate(id) {
        const template = this.templates.find(t => t.id === id);
        if (!template) {
            const { data } = await Database.client
                .from('templates')
                .select('*')
                .eq('id', id)
                .single();
            return data;
        }
        return template;
    },

    fillTemplate(template, data) {
        let content = template.content;
        let subject = template.subject || '';

        for (const [key, value] of Object.entries(data)) {
            content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
            subject = subject.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
        }

        return { subject, content };
    },

    getStyles() {
        return `
            <style>
                .templates-module {
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

                .type-filter {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 2rem;
                    flex-wrap: wrap;
                }

                .type-btn {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }

                .type-btn:hover {
                    border-color: #6366f1;
                }

                .type-btn.active {
                    background: #6366f1;
                    color: white;
                    border-color: #6366f1;
                }

                .template-group {
                    margin-bottom: 2rem;
                }

                .group-title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 1rem 0;
                    color: #64748b;
                }

                .templates-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 1rem;
                }

                .template-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .template-card:hover {
                    border-color: #6366f1;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
                }

                .template-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }

                .template-icon {
                    font-size: 1.25rem;
                }

                .template-type {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .default-badge {
                    margin-left: auto;
                    font-size: 0.65rem;
                    background: #dbeafe;
                    color: #1d4ed8;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                }

                .template-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 0.5rem 0;
                    color: #1e293b;
                }

                .template-desc {
                    font-size: 0.8rem;
                    color: #64748b;
                    margin: 0 0 0.5rem 0;
                }

                .template-subject {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    margin: 0;
                    font-style: italic;
                }

                .template-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 1rem;
                    padding-top: 0.75rem;
                    border-top: 1px solid #f1f5f9;
                }

                .usage-count {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .template-actions {
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
                    font-size: 0.875rem;
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

                .template-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 700px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .use-modal {
                    max-width: 800px;
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

                .modal-body h3 {
                    margin: 0 0 1rem 0;
                }

                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
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
                    color: #374151;
                }

                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-family: inherit;
                }

                .form-group textarea {
                    resize: vertical;
                    min-height: 200px;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                .variables-help {
                    margin-bottom: 0.5rem;
                    font-size: 0.8rem;
                    color: #64748b;
                }

                .variables-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25rem;
                    margin-top: 0.5rem;
                }

                .var-btn {
                    padding: 0.25rem 0.5rem;
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    cursor: pointer;
                    font-family: monospace;
                }

                .var-btn:hover {
                    background: #e2e8f0;
                }

                /* Use modal */
                .variables-inputs {
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                }

                .variables-inputs h4 {
                    margin: 0 0 0.75rem 0;
                    font-size: 0.875rem;
                }

                .var-input {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 0.5rem;
                }

                .var-input label {
                    width: 120px;
                    font-size: 0.8rem;
                    font-family: monospace;
                    color: #6366f1;
                }

                .var-input input {
                    flex: 1;
                    padding: 0.5rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .preview-section {
                    margin-top: 1rem;
                }

                .preview-section h4 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.875rem;
                }

                .preview-subject {
                    background: #f8fafc;
                    padding: 0.75rem;
                    border-radius: 6px;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                }

                .preview-content {
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 1rem;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    line-height: 1.6;
                    max-height: 300px;
                    overflow-y: auto;
                }

                .btn-secondary {
                    padding: 0.75rem 1.25rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    color: #64748b;
                    font-weight: 500;
                    cursor: pointer;
                }

                .btn-danger {
                    padding: 0.75rem 1.25rem;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    color: #dc2626;
                    font-weight: 500;
                    cursor: pointer;
                }

                .empty-state {
                    text-align: center;
                    padding: 4rem;
                    color: #64748b;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .loading {
                    text-align: center;
                    padding: 3rem;
                    color: #64748b;
                }
            </style>
        `;
    }
};

// Export
window.TemplatesModule = TemplatesModule;
