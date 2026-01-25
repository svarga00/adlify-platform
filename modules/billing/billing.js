// =====================================================
// ADLIFY - Billing Module (Fakturácia)
// =====================================================

const BillingModule = {
    id: 'billing',
    name: 'Fakturácia',
    icon: Icons.documents,
    title: 'Fakturácia',
    menu: { section: 'main', order: 40 },
    permissions: [],
    
    // Aktuálny sub-tab
    currentTab: 'invoices',
    
    // Cache dát
    invoices: [],
    quotes: [],
    orders: [],
    clients: [],
    services: [],
    settings: null,
    leads: [],
    currentDocType: 'invoice',

    async init() {
        console.log('BillingModule initialized');
    },

    // Modal pre výber typu nového dokladu
    showNewDocumentModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="document-type-modal">
                <div class="dtm-header">
                    <h2>Nový doklad</h2>
                    <p>Vyberte typ dokladu, ktorý chcete vytvoriť</p>
                </div>
                <div class="dtm-options">
                    <button class="dtm-option" onclick="BillingModule.createInvoice(); this.closest('.modal-overlay').remove();">
                        <div class="dtm-icon" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                        </div>
                        <div class="dtm-text">
                            <span class="dtm-title">Faktúra</span>
                            <span class="dtm-desc">Štandardná faktúra za služby</span>
                        </div>
                    </button>
                    
                    <button class="dtm-option" onclick="BillingModule.createProforma(); this.closest('.modal-overlay').remove();">
                        <div class="dtm-icon" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                        </div>
                        <div class="dtm-text">
                            <span class="dtm-title">Zálohová faktúra</span>
                            <span class="dtm-desc">Predfaktúra pre platbu vopred</span>
                        </div>
                    </button>
                    
                    <button class="dtm-option" onclick="BillingModule.createQuote(); this.closest('.modal-overlay').remove();">
                        <div class="dtm-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                        </div>
                        <div class="dtm-text">
                            <span class="dtm-title">Cenová ponuka</span>
                            <span class="dtm-desc">Ponuka pre potenciálneho klienta</span>
                        </div>
                    </button>
                    
                    <button class="dtm-option" onclick="BillingModule.createOrder(); this.closest('.modal-overlay').remove();">
                        <div class="dtm-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                                <circle cx="9" cy="21" r="1"></circle>
                                <circle cx="20" cy="21" r="1"></circle>
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            </svg>
                        </div>
                        <div class="dtm-text">
                            <span class="dtm-title">Objednávka</span>
                            <span class="dtm-desc">Potvrdená objednávka od klienta</span>
                        </div>
                    </button>
                </div>
                <div class="dtm-footer">
                    <button class="dtm-cancel" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Zavrieť kliknutím mimo
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async render(container, params = {}) {
        // Načítanie dát
        await this.loadData();
        
        const invoices = this.invoices.filter(i => i.invoice_type === 'invoice');
        const proformas = this.invoices.filter(i => i.invoice_type === 'proforma');
        
        container.innerHTML = `
            <div class="billing-module-new">
                <!-- Header s gradientom -->
                <div class="billing-header">
                    <div class="header-content">
                        <div class="header-title">
                            <h1>Fakturácia</h1>
                            <p class="header-subtitle">Správa faktúr, ponúk a objednávok</p>
                        </div>
                        <div class="header-actions">
                            <button class="btn-new-document" onclick="BillingModule.showNewDocumentModal()">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Nový doklad
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Štatistiky -->
                <div class="billing-stats-grid">
                    ${this.renderStats()}
                </div>
                
                <!-- Taby -->
                <div class="billing-tabs-container">
                    <div class="billing-tabs-new">
                        <button class="tab-btn-new ${this.currentTab === 'invoices' ? 'active' : ''}" 
                                onclick="BillingModule.switchTab('invoices')">
                            <span class="tab-icon">${Icons.documents}</span>
                            <span class="tab-label">Faktúry</span>
                            <span class="tab-count">${invoices.length}</span>
                        </button>
                        <button class="tab-btn-new ${this.currentTab === 'proformas' ? 'active' : ''}" 
                                onclick="BillingModule.switchTab('proformas')">
                            <span class="tab-icon">${Icons.clipboard}</span>
                            <span class="tab-label">Zálohové</span>
                            <span class="tab-count">${proformas.length}</span>
                        </button>
                        <button class="tab-btn-new ${this.currentTab === 'quotes' ? 'active' : ''}" 
                                onclick="BillingModule.switchTab('quotes')">
                            <span class="tab-icon">${Icons.edit}</span>
                            <span class="tab-label">Ponuky</span>
                            <span class="tab-count">${this.quotes.length}</span>
                        </button>
                        <button class="tab-btn-new ${this.currentTab === 'orders' ? 'active' : ''}" 
                                onclick="BillingModule.switchTab('orders')">
                            <span class="tab-icon">${Icons.shoppingCart}</span>
                            <span class="tab-label">Objednávky</span>
                            <span class="tab-count">${this.orders.length}</span>
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="billing-content-area" id="billing-content">
                    ${this.renderTabContent()}
                </div>
            </div>
            
            ${this.renderStyles()}
        `;
        
        // Inicializácia dropdown
        this.initDropdowns();
    },

    async loadData() {
        try {
            // Paralelné načítanie s error handling pre každú query
            const results = await Promise.allSettled([
                Database.client.from('invoices_overview').select('*').order('created_at', { ascending: false }),
                Database.client.from('quotes_overview').select('*').order('created_at', { ascending: false }),
                Database.client.from('orders_overview').select('*').order('created_at', { ascending: false }),
                Database.client.from('clients').select('id, company_name, email, phone, address, city, zip, ico, dic, ic_dph'),
                Database.client.from('services').select('id, name, base_price, category, unit'),
                Database.client.from('billing_settings').select('*').single(),
                Database.client.from('leads').select('*').order('company_name')
            ]);
            
            this.invoices = results[0].status === 'fulfilled' ? (results[0].value.data || []) : [];
            this.quotes = results[1].status === 'fulfilled' ? (results[1].value.data || []) : [];
            this.orders = results[2].status === 'fulfilled' ? (results[2].value.data || []) : [];
            this.clients = results[3].status === 'fulfilled' ? (results[3].value.data || []) : [];
            this.services = results[4].status === 'fulfilled' ? (results[4].value.data || []) : [];
            this.settings = results[5].status === 'fulfilled' ? (results[5].value.data || {}) : {};
            
            // Leads s extra debugom
            if (results[6].status === 'fulfilled') {
                this.leads = results[6].value.data || [];
                if (results[6].value.error) {
                    console.warn('Leads query error:', results[6].value.error);
                }
            } else {
                console.warn('Leads query failed:', results[6].reason);
                this.leads = [];
            }
            
            console.log('Billing data loaded:', {
                invoices: this.invoices.length,
                quotes: this.quotes.length,
                orders: this.orders.length,
                clients: this.clients.length,
                services: this.services.length,
                leads: this.leads.length,
                leadsData: this.leads.slice(0, 3) // Ukáže prvé 3 leady
            });
            
        } catch (error) {
            console.error('Error loading billing data:', error);
        }
    },

    renderStats() {
        const invoices = this.invoices.filter(i => i.invoice_type === 'invoice');
        const unpaid = invoices.filter(i => ['issued', 'sent', 'overdue', 'partially_paid'].includes(i.status));
        const overdue = invoices.filter(i => i.computed_status === 'overdue');
        const thisMonth = invoices.filter(i => {
            const date = new Date(i.issue_date);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        });
        
        const totalUnpaid = unpaid.reduce((sum, i) => sum + parseFloat(i.remaining_amount || i.total || 0), 0);
        const totalOverdue = overdue.reduce((sum, i) => sum + parseFloat(i.remaining_amount || i.total || 0), 0);
        const totalThisMonth = thisMonth.reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
        const paidThisMonth = thisMonth.filter(i => i.status === 'paid').reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
        
        return `
            <div class="stat-card-new">
                <div class="stat-card-icon orange">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <div class="stat-card-content">
                    <span class="stat-card-value">${this.formatMoney(totalUnpaid)}</span>
                    <span class="stat-card-label">Neuhradené</span>
                </div>
                <div class="stat-card-badge">${unpaid.length}</div>
            </div>
            
            <div class="stat-card-new ${overdue.length > 0 ? 'warning' : ''}">
                <div class="stat-card-icon red">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                </div>
                <div class="stat-card-content">
                    <span class="stat-card-value">${this.formatMoney(totalOverdue)}</span>
                    <span class="stat-card-label">Po splatnosti</span>
                </div>
                <div class="stat-card-badge red">${overdue.length}</div>
            </div>
            
            <div class="stat-card-new">
                <div class="stat-card-icon blue">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                </div>
                <div class="stat-card-content">
                    <span class="stat-card-value">${this.formatMoney(totalThisMonth)}</span>
                    <span class="stat-card-label">Tento mesiac</span>
                </div>
                <div class="stat-card-badge">${thisMonth.length}</div>
            </div>
            
            <div class="stat-card-new success">
                <div class="stat-card-icon green">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="stat-card-content">
                    <span class="stat-card-value">${this.formatMoney(paidThisMonth)}</span>
                    <span class="stat-card-label">Uhradené tento mesiac</span>
                </div>
            </div>
        `;
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab-btn-new').forEach(btn => btn.classList.remove('active'));
        const tabs = ['invoices', 'proformas', 'quotes', 'orders'];
        const index = tabs.indexOf(tab);
        if (index >= 0) {
            document.querySelectorAll('.tab-btn-new')[index]?.classList.add('active');
        }
        document.getElementById('billing-content').innerHTML = this.renderTabContent();
    },

    renderTabContent() {
        switch (this.currentTab) {
            case 'invoices':
                return this.renderInvoicesTable('invoice');
            case 'proformas':
                return this.renderInvoicesTable('proforma');
            case 'quotes':
                return this.renderQuotesTable();
            case 'orders':
                return this.renderOrdersTable();
            default:
                return '';
        }
    },

    renderInvoicesTable(type) {
        const invoices = this.invoices.filter(i => i.invoice_type === type);
        const typeLabel = type === 'invoice' ? 'faktúr' : 'zálohových faktúr';
        
        if (invoices.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">${type === 'invoice' ? '' : ''}</div>
                    <h3>Žiadne ${typeLabel}</h3>
                    <p>Vytvorte prvú ${type === 'invoice' ? 'faktúru' : 'zálohovú faktúru'}</p>
                    <button class="btn btn-primary" onclick="BillingModule.${type === 'invoice' ? 'createInvoice' : 'createProforma'}()">
                        + Nový doklad
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="table-filters">
                <input type="text" class="filter-search" placeholder="Hľadať..." 
                       onkeyup="BillingModule.filterTable(this.value, 'invoices-table')">
                <select class="filter-select" onchange="BillingModule.filterByStatus(this.value, 'invoice')">
                    <option value="">Všetky stavy</option>
                    <option value="draft">Koncept</option>
                    <option value="issued">Vystavená</option>
                    <option value="sent">Odoslaná</option>
                    <option value="paid">Uhradená</option>
                    <option value="partially_paid">Čiastočne uhradená</option>
                    <option value="overdue">Po splatnosti</option>
                    <option value="cancelled">Stornovaná</option>
                </select>
            </div>
            
            <div class="table-container">
                <table class="data-table" id="invoices-table">
                    <thead>
                        <tr>
                            <th>Číslo</th>
                            <th>Klient</th>
                            <th>Dátum vystavenia</th>
                            <th>Splatnosť</th>
                            <th>Suma</th>
                            <th>Uhradené</th>
                            <th>Stav</th>
                            <th>Akcie</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(inv => `
                            <tr class="${inv.computed_status === 'overdue' ? 'row-warning' : ''}" data-status="${inv.status}">
                                <td>
                                    <a href="#" onclick="BillingModule.showInvoiceDetail('${inv.id}'); return false;">
                                        <strong>${inv.invoice_number}</strong>
                                    </a>
                                </td>
                                <td>
                                    <div class="client-cell">
                                        <span class="client-name">${inv.client_company || inv.client_name || '-'}</span>
                                    </div>
                                </td>
                                <td>${this.formatDate(inv.issue_date)}</td>
                                <td>
                                    ${this.formatDate(inv.due_date)}
                                    ${inv.days_until_due < 0 ? `<span class="overdue-badge">${Math.abs(inv.days_until_due)} dní</span>` : ''}
                                </td>
                                <td><strong>${this.formatMoney(inv.total)}</strong></td>
                                <td>${this.formatMoney(inv.paid_amount || 0)}</td>
                                <td>${this.renderInvoiceStatus(inv.computed_status || inv.status)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon" title="Detail" onclick="BillingModule.showInvoiceDetail('${inv.id}')">${Icons.eye}</button>
                                        <button class="btn-icon" title="PDF" onclick="BillingModule.downloadPDF('${inv.id}')">${Icons.inbox}</button>
                                        ${inv.status !== 'paid' && inv.status !== 'cancelled' ? `
                                            <button class="btn-icon" title="Pridať platbu" onclick="BillingModule.addPayment('${inv.id}')">💳</button>
                                        ` : ''}
                                        <button class="btn-icon" title="Viac" onclick="BillingModule.showInvoiceMenu('${inv.id}', event)">⋮</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderQuotesTable() {
        if (this.quotes.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">${Icons.edit}</div>
                    <h3>Žiadne ponuky</h3>
                    <p>Vytvorte prvú cenovú ponuku</p>
                    <button class="btn btn-primary" onclick="BillingModule.createQuote()">
                        + Nová ponuka
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="table-filters">
                <input type="text" class="filter-search" placeholder="Hľadať..." 
                       onkeyup="BillingModule.filterTable(this.value, 'quotes-table')">
                <select class="filter-select" onchange="BillingModule.filterByStatus(this.value, 'quote')">
                    <option value="">Všetky stavy</option>
                    <option value="draft">Koncept</option>
                    <option value="sent">Odoslaná</option>
                    <option value="viewed">Zobrazená</option>
                    <option value="accepted">Akceptovaná</option>
                    <option value="rejected">Odmietnutá</option>
                    <option value="expired">Expirovaná</option>
                </select>
            </div>
            
            <div class="table-container">
                <table class="data-table" id="quotes-table">
                    <thead>
                        <tr>
                            <th>Číslo</th>
                            <th>Klient / Lead</th>
                            <th>Názov</th>
                            <th>Dátum</th>
                            <th>Platnosť do</th>
                            <th>Suma</th>
                            <th>Stav</th>
                            <th>Akcie</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.quotes.map(q => `
                            <tr data-status="${q.status}">
                                <td>
                                    <a href="#" onclick="BillingModule.showQuoteDetail('${q.id}'); return false;">
                                        <strong>${q.quote_number}</strong>
                                    </a>
                                </td>
                                <td>
                                    <div class="client-cell">
                                        <span class="client-name">${q.client_name || q.lead_name || '-'}</span>
                                    </div>
                                </td>
                                <td>${q.title || '-'}</td>
                                <td>${this.formatDate(q.issue_date)}</td>
                                <td>${q.valid_until ? this.formatDate(q.valid_until) : '-'}</td>
                                <td><strong>${this.formatMoney(q.total)}</strong></td>
                                <td>${this.renderQuoteStatus(q.status)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon" title="Detail" onclick="BillingModule.showQuoteDetail('${q.id}')">${Icons.eye}</button>
                                        ${q.status === 'sent' || q.status === 'accepted' ? `
                                            <button class="btn-icon" title="Vytvoriť objednávku" onclick="BillingModule.createOrderFromQuote('${q.id}')">${Icons.shoppingCart}</button>
                                        ` : ''}
                                        ${q.status === 'accepted' ? `
                                            <button class="btn-icon" title="Vytvoriť faktúru" onclick="BillingModule.createInvoiceFromQuote('${q.id}')">${Icons.documents}</button>
                                        ` : ''}
                                        <button class="btn-icon" title="Viac" onclick="BillingModule.showQuoteMenu('${q.id}', event)">⋮</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderOrdersTable() {
        if (this.orders.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">${Icons.shoppingCart}</div>
                    <h3>Žiadne objednávky</h3>
                    <p>Vytvorte novú objednávku alebo ju vytvorte z ponuky</p>
                    <button class="btn btn-primary" onclick="BillingModule.createOrder()">
                        + Nová objednávka
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="table-filters">
                <input type="text" class="filter-search" placeholder="Hľadať..." 
                       onkeyup="BillingModule.filterTable(this.value, 'orders-table')">
                <select class="filter-select" onchange="BillingModule.filterByStatus(this.value, 'order')">
                    <option value="">Všetky stavy</option>
                    <option value="new">Nová</option>
                    <option value="confirmed">Potvrdená</option>
                    <option value="in_progress">V realizácii</option>
                    <option value="completed">Dokončená</option>
                    <option value="cancelled">Zrušená</option>
                </select>
            </div>
            
            <div class="table-container">
                <table class="data-table" id="orders-table">
                    <thead>
                        <tr>
                            <th>Číslo</th>
                            <th>Klient</th>
                            <th>Z ponuky</th>
                            <th>Dátum</th>
                            <th>Suma</th>
                            <th>Stav</th>
                            <th>Akcie</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.orders.map(o => `
                            <tr data-status="${o.status}">
                                <td>
                                    <a href="#" onclick="BillingModule.showOrderDetail('${o.id}'); return false;">
                                        <strong>${o.order_number || '-'}</strong>
                                    </a>
                                </td>
                                <td>${o.client_name || '-'}</td>
                                <td>${o.quote_number ? `<span class="badge badge-sm">${o.quote_number}</span>` : '-'}</td>
                                <td>${this.formatDate(o.order_date || o.created_at)}</td>
                                <td><strong>${this.formatMoney(o.total)}</strong></td>
                                <td>${this.renderOrderStatus(o.status)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon" title="Vytvoriť zálohovku" onclick="BillingModule.createProformaFromOrder('${o.id}')">${Icons.clipboard}</button>
                                        <button class="btn-icon" title="Vytvoriť faktúru" onclick="BillingModule.createInvoiceFromOrder('${o.id}')">${Icons.documents}</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderPaymentsTab() {
        return `
            <div class="payments-overview">
                <h3>${Icons.billing} Prehľad platieb</h3>
                <p>Tu bude zoznam všetkých prijatých platieb...</p>
                
                <div class="coming-soon">
                    <span>🚧</span>
                    <p>Táto sekcia je vo vývoji</p>
                </div>
            </div>
        `;
    },

    // Status badges
    renderInvoiceStatus(status) {
        const statusMap = {
            draft: { label: 'Koncept', class: 'status-gray' },
            issued: { label: 'Vystavená', class: 'status-blue' },
            sent: { label: 'Odoslaná', class: 'status-blue' },
            paid: { label: 'Uhradená', class: 'status-green' },
            partially_paid: { label: 'Čiastočne', class: 'status-orange' },
            overdue: { label: 'Po splatnosti', class: 'status-red' },
            cancelled: { label: 'Stornovaná', class: 'status-gray' }
        };
        const s = statusMap[status] || { label: status, class: 'status-gray' };
        return `<span class="status-badge ${s.class}">${s.label}</span>`;
    },

    renderQuoteStatus(status) {
        const statusMap = {
            draft: { label: 'Koncept', class: 'status-gray' },
            sent: { label: 'Odoslaná', class: 'status-blue' },
            viewed: { label: 'Zobrazená', class: 'status-purple' },
            accepted: { label: 'Akceptovaná', class: 'status-green' },
            rejected: { label: 'Odmietnutá', class: 'status-red' },
            expired: { label: 'Expirovaná', class: 'status-gray' }
        };
        const s = statusMap[status] || { label: status, class: 'status-gray' };
        return `<span class="status-badge ${s.class}">${s.label}</span>`;
    },

    renderOrderStatus(status) {
        const statusMap = {
            pending: { label: 'Čaká', class: 'status-orange' },
            confirmed: { label: 'Potvrdená', class: 'status-blue' },
            in_progress: { label: 'Rozpracovaná', class: 'status-purple' },
            completed: { label: 'Dokončená', class: 'status-green' },
            cancelled: { label: 'Zrušená', class: 'status-gray' }
        };
        const s = statusMap[status] || { label: status, class: 'status-gray' };
        return `<span class="status-badge ${s.class}">${s.label}</span>`;
    },

    // === CRUD operácie ===

    async createInvoice(fromOrder = null, fromQuote = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="invoice-modal">
                <!-- Header -->
                <div class="invoice-modal-header">
                    <div class="header-left">
                        <span class="header-icon">${Icons.documents}</span>
                        <div>
                            <h2>Nová faktúra</h2>
                            <p class="header-subtitle">Vytvorte novú faktúru pre klienta</p>
                        </div>
                    </div>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <!-- Body -->
                <div class="invoice-modal-body">
                    <form id="invoice-form">
                        <div class="form-grid">
                            <!-- Ľavá strana - Klient a položky -->
                            <div class="form-main">
                                <!-- Klient karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.user}</span>
                                        <h3>Odberateľ</h3>
                                    </div>
                                    <div class="card-body">
                                        ${this.renderRecipientSelector()}
                                    </div>
                                </div>
                                
                                <!-- Položky karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.package}</span>
                                        <h3>Položky faktúry</h3>
                                    </div>
                                    <div class="card-body">
                                        <!-- Hlavička tabuľky -->
                                        <div class="items-table-header">
                                            <div class="col-desc">Popis</div>
                                            <div class="col-qty">Množstvo</div>
                                            <div class="col-unit">Jedn.</div>
                                            <div class="col-price">Cena/jedn.</div>
                                            <div class="col-total">Spolu</div>
                                            <div class="col-action"></div>
                                        </div>
                                        
                                        <!-- Položky -->
                                        <div id="invoice-items" class="items-container">
                                            ${this.renderItemRowNew(0)}
                                        </div>
                                        
                                        <!-- Pridať položku -->
                                        <div class="add-item-section">
                                            <button type="button" class="add-item-btn" onclick="BillingModule.addItemRow()">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                Pridať položku
                                            </button>
                                            
                                            <div class="service-dropdown">
                                                <select id="quick-service" onchange="BillingModule.addServiceItem(this.value)">
                                                    <option value="">${Icons.package} Pridať zo služieb...</option>
                                                    ${this.services.map(s => `
                                                        <option value="${s.id}">${s.name} — ${this.formatMoney(s.base_price)}</option>
                                                    `).join('')}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Poznámka -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.edit}</span>
                                        <h3>Poznámka</h3>
                                    </div>
                                    <div class="card-body">
                                        <textarea name="notes" rows="3" placeholder="Interná poznámka alebo text pre klienta..." class="note-textarea">${this.settings?.invoice_footer || ''}</textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Pravá strana - Dátumy a súhrn -->
                            <div class="form-sidebar">
                                <!-- Dátumy karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.calendar}</span>
                                        <h3>Dátumy</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="date-field">
                                            <label>Dátum vystavenia</label>
                                            <input type="date" name="issue_date" value="${new Date().toISOString().split('T')[0]}">
                                        </div>
                                        <div class="date-field">
                                            <label>Dátum dodania</label>
                                            <input type="date" name="delivery_date" value="${new Date().toISOString().split('T')[0]}">
                                        </div>
                                        <div class="date-field">
                                            <label>Dátum splatnosti</label>
                                            <input type="date" name="due_date" value="${this.addDays(new Date(), this.settings?.default_due_days || 14).toISOString().split('T')[0]}">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Platba karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">💳</span>
                                        <h3>Platba</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="date-field">
                                            <label>Forma úhrady</label>
                                            <select name="payment_method" class="payment-select">
                                                <option value="bank_transfer">🏦 Bankový prevod</option>
                                                <option value="cash">💵 Hotovosť</option>
                                                <option value="card">💳 Platobná karta</option>
                                                <option value="cod">${Icons.package} Dobierka</option>
                                                <option value="paypal">🅿️ PayPal</option>
                                                <option value="crypto">₿ Kryptomeny</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Súhrn karta -->
                                <div class="form-card summary-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.billing}</span>
                                        <h3>Súhrn</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="summary-row">
                                            <span class="summary-label">Medzisúčet</span>
                                            <span class="summary-value" id="subtotal">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-row with-input">
                                            <div class="summary-label-with-input">
                                                <span>Zľava</span>
                                                <div class="input-with-suffix">
                                                    <input type="number" name="discount_percent" value="0" min="0" max="100" 
                                                           onchange="BillingModule.recalculateTotals()">
                                                    <span class="suffix">%</span>
                                                </div>
                                            </div>
                                            <span class="summary-value discount" id="discount-amount">-0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-row with-input">
                                            <div class="summary-label-with-input">
                                                <span>DPH</span>
                                                <div class="input-with-suffix">
                                                    <input type="number" name="vat_rate" value="${this.settings?.default_vat_rate || 20}" 
                                                           onchange="BillingModule.recalculateTotals()">
                                                    <span class="suffix">%</span>
                                                </div>
                                            </div>
                                            <span class="summary-value" id="vat-amount">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-divider"></div>
                                        
                                        <div class="summary-row total">
                                            <span class="summary-label">Celkom</span>
                                            <span class="summary-value" id="total">0,00 €</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <!-- Footer -->
                <div class="invoice-modal-footer">
                    <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">
                        Zrušiť
                    </button>
                    <div class="footer-actions">
                        <button class="btn-draft" onclick="BillingModule.saveInvoice('draft')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            Uložiť koncept
                        </button>
                        <button class="btn-primary-action" onclick="BillingModule.saveInvoice('issued')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Vystaviť faktúru
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.itemRowIndex = 0;
    },

    async createProforma() {
        // Podobné ako createInvoice, len s typom 'proforma'
        await this.createInvoice();
        // Zmeniť titulok a farbu
        const header = document.querySelector('.invoice-modal-header');
        if (header) {
            header.style.background = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
            header.querySelector('h2').textContent = 'Nová zálohová faktúra';
            header.querySelector('.header-subtitle').textContent = 'Vytvorte zálohovú faktúru pre klienta';
            header.querySelector('.header-icon').textContent = '';
        }
        // Zmeniť uloženie na proforma typ
        const saveBtn = document.querySelector('.btn-primary-action');
        if (saveBtn) {
            saveBtn.onclick = () => BillingModule.saveProforma('issued');
            saveBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Vystaviť zálohovku
            `;
            saveBtn.style.background = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
        }
        const draftBtn = document.querySelector('.btn-draft');
        if (draftBtn) {
            draftBtn.onclick = () => BillingModule.saveProforma('draft');
        }
    },
    
    async saveProforma(status) {
        // Rovnaká logika ako saveInvoice, len s invoice_type = 'proforma'
        const form = document.getElementById('invoice-form');
        const formData = new FormData(form);
        
        let clientId = formData.get('client_id') || null;
        const leadId = formData.get('lead_id') || null;
        const newCompanyName = formData.get('new_company_name');
        
        try {
            // Ak je nový klient
            if (newCompanyName && !clientId) {
                const { data: newClient, error: clientError } = await Database.client
                    .from('clients')
                    .insert({
                        company_name: newCompanyName,
                        ico: formData.get('new_ico') || null,
                        dic: formData.get('new_dic') || null,
                        email: formData.get('new_email') || null,
                        address: formData.get('new_address') || null,
                        status: 'active'
                    })
                    .select()
                    .single();
                
                if (clientError) throw clientError;
                clientId = newClient.id;
            }
            
            // Ak je vybraný lead
            if (leadId && !clientId) {
                const lead = this.leads.find(l => l.id === leadId);
                if (lead) {
                    const { data: newClient, error: clientError } = await Database.client
                        .from('clients')
                        .insert({
                            company_name: lead.company_name,
                            ico: lead.ico || null,
                            dic: lead.dic || null,
                            email: lead.email || null,
                            phone: lead.phone || null,
                            address: lead.address || null,
                            status: 'active'
                        })
                        .select()
                        .single();
                    
                    if (clientError) throw clientError;
                    clientId = newClient.id;
                }
            }
            
            if (!clientId) {
                alert('Vyberte klienta alebo vytvorte nového');
                return;
            }
        
            // Zozbierať položky
            const items = [];
            document.querySelectorAll('#invoice-items .item-row, #invoice-items .item-row-new').forEach(row => {
                const desc = row.querySelector('input[name*="[description]"]')?.value;
                const qty = parseFloat(row.querySelector('input[name*="[quantity]"]')?.value) || 0;
                const unit = row.querySelector('select[name*="[unit]"]')?.value || 'ks';
                const price = parseFloat(row.querySelector('input[name*="[unit_price]"]')?.value) || 0;
                
                if (desc && qty > 0 && price > 0) {
                    items.push({ description: desc, quantity: qty, unit: unit, unit_price: price, total: qty * price });
                }
            });
            
            if (items.length === 0) {
                alert('Pridajte aspoň jednu položku');
                return;
            }
            
            const subtotal = items.reduce((sum, i) => sum + i.total, 0);
            const discountPercent = parseFloat(formData.get('discount_percent')) || 0;
            const discountAmount = subtotal * (discountPercent / 100);
            const afterDiscount = subtotal - discountAmount;
            const vatRate = parseFloat(formData.get('vat_rate')) || 20;
            const vatAmount = afterDiscount * (vatRate / 100);
            const total = afterDiscount + vatAmount;
        
            const { data: numberData, error: numberError } = await Database.client
                .rpc('get_next_number', { p_sequence_type: 'proforma' });
            
            if (numberError) throw numberError;
            
            const { data: invoice, error: invoiceError } = await Database.client
                .from('invoices')
                .insert({
                    invoice_number: numberData,
                    client_id: clientId,
                    invoice_type: 'proforma',
                    issue_date: formData.get('issue_date'),
                    delivery_date: formData.get('delivery_date'),
                    due_date: formData.get('due_date'),
                    payment_method: formData.get('payment_method') || 'bank_transfer',
                    status: status,
                    subtotal, discount_percent: discountPercent, discount_amount: discountAmount,
                    vat_rate: vatRate, vat_amount: vatAmount, total, remaining_amount: total,
                    variable_symbol: numberData.replace(/\D/g, ''),
                    notes: formData.get('notes')
                })
                .select()
                .single();
            
            if (invoiceError) throw invoiceError;
            
            // Pridať položky
            const invoiceItems = items.map((item, idx) => ({
                invoice_id: invoice.id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                vat_rate: vatRate,
                total: item.total,
                sort_order: idx
            }));
            
            await Database.client.from('invoice_items').insert(invoiceItems);
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            this.currentTab = 'proformas';
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            alert(`Zálohová faktúra ${numberData} bola vytvorená!`);
            
        } catch (error) {
            console.error('Error saving proforma:', error);
            alert('Chyba pri ukladaní zálohovky: ' + error.message);
        }
    },

    async createQuote(fromLead = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="invoice-modal">
                <!-- Header -->
                <div class="invoice-modal-header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
                    <div class="header-left">
                        <span class="header-icon">${Icons.edit}</span>
                        <div>
                            <h2>Nová ponuka</h2>
                            <p class="header-subtitle">Vytvorte cenovú ponuku pre klienta</p>
                        </div>
                    </div>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <!-- Body -->
                <div class="invoice-modal-body">
                    <form id="quote-form">
                        <div class="form-grid">
                            <!-- Ľavá strana -->
                            <div class="form-main">
                                <!-- Príjemca karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.user}</span>
                                        <h3>Príjemca</h3>
                                    </div>
                                    <div class="card-body">
                                        ${this.renderRecipientSelector(fromLead)}
                                    </div>
                                </div>
                                
                                <!-- Detaily ponuky -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.clipboard}</span>
                                        <h3>Detaily ponuky</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="date-field">
                                            <label>Názov ponuky</label>
                                            <input type="text" name="title" placeholder="Napr. Marketingová stratégia 2025" class="full-input">
                                        </div>
                                        <div class="date-field">
                                            <label>Úvodný text</label>
                                            <textarea name="introduction" rows="2" placeholder="Ďakujeme za Váš záujem..." class="note-textarea"></textarea>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Položky karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.package}</span>
                                        <h3>Položky ponuky</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="items-table-header">
                                            <div class="col-desc">Popis</div>
                                            <div class="col-qty">Množstvo</div>
                                            <div class="col-unit">Jedn.</div>
                                            <div class="col-price">Cena/jedn.</div>
                                            <div class="col-total">Spolu</div>
                                            <div class="col-action"></div>
                                        </div>
                                        
                                        <div id="quote-items" class="items-container">
                                            ${this.renderItemRowNew(0)}
                                        </div>
                                        
                                        <div class="add-item-section">
                                            <button type="button" class="add-item-btn" onclick="BillingModule.addItemRow('quote')">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                Pridať položku
                                            </button>
                                            
                                            <div class="service-dropdown">
                                                <select id="quick-service-quote" onchange="BillingModule.addServiceItemQuote(this.value)">
                                                    <option value="">${Icons.package} Pridať zo služieb...</option>
                                                    ${this.services.map(s => `
                                                        <option value="${s.id}">${s.name} — ${this.formatMoney(s.base_price)}</option>
                                                    `).join('')}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Podmienky -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">📜</span>
                                        <h3>Podmienky</h3>
                                    </div>
                                    <div class="card-body">
                                        <textarea name="terms" rows="3" placeholder="Platobné podmienky, dodacie lehoty..." class="note-textarea"></textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Pravá strana -->
                            <div class="form-sidebar">
                                <!-- Platnosť -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.calendar}</span>
                                        <h3>Platnosť</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="date-field">
                                            <label>Dátum vystavenia</label>
                                            <input type="date" name="issue_date" value="${new Date().toISOString().split('T')[0]}">
                                        </div>
                                        <div class="date-field">
                                            <label>Platná do</label>
                                            <input type="date" name="valid_until" value="${this.addDays(new Date(), 30).toISOString().split('T')[0]}">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Súhrn karta -->
                                <div class="form-card summary-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.billing}</span>
                                        <h3>Súhrn</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="summary-row">
                                            <span class="summary-label">Medzisúčet</span>
                                            <span class="summary-value" id="subtotal">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-row with-input">
                                            <div class="summary-label-with-input">
                                                <span>Zľava</span>
                                                <div class="input-with-suffix">
                                                    <input type="number" name="discount_percent" value="0" min="0" max="100" 
                                                           onchange="BillingModule.recalculateTotals()">
                                                    <span class="suffix">%</span>
                                                </div>
                                            </div>
                                            <span class="summary-value discount" id="discount-amount">-0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-row with-input">
                                            <div class="summary-label-with-input">
                                                <span>DPH</span>
                                                <div class="input-with-suffix">
                                                    <input type="number" name="vat_rate" value="${this.settings?.default_vat_rate || 20}" 
                                                           onchange="BillingModule.recalculateTotals()">
                                                    <span class="suffix">%</span>
                                                </div>
                                            </div>
                                            <span class="summary-value" id="vat-amount">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-divider"></div>
                                        
                                        <div class="summary-row total">
                                            <span class="summary-label">Celkom</span>
                                            <span class="summary-value" id="total">0,00 €</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <!-- Footer -->
                <div class="invoice-modal-footer">
                    <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">
                        Zrušiť
                    </button>
                    <div class="footer-actions">
                        <button class="btn-draft" onclick="BillingModule.saveQuote('draft')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            </svg>
                            Uložiť koncept
                        </button>
                        <button class="btn-primary-action" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);" onclick="BillingModule.saveQuote('sent')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                            Odoslať ponuku
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.itemRowIndex = 0;
        this.currentDocType = 'quote';
    },

    async createOrder(fromQuote = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="invoice-modal">
                <!-- Header -->
                <div class="invoice-modal-header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    <div class="header-left">
                        <span class="header-icon">${Icons.shoppingCart}</span>
                        <div>
                            <h2>Nová objednávka</h2>
                            <p class="header-subtitle">${fromQuote ? 'Vytvorené z ponuky' : 'Vytvorte novú objednávku'}</p>
                        </div>
                    </div>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <!-- Body -->
                <div class="invoice-modal-body">
                    <form id="order-form">
                        <div class="form-grid">
                            <!-- Ľavá strana -->
                            <div class="form-main">
                                <!-- Odberateľ karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.user}</span>
                                        <h3>Odberateľ</h3>
                                    </div>
                                    <div class="card-body">
                                        ${this.renderRecipientSelector(null, fromQuote?.client_id)}
                                    </div>
                                </div>
                                
                                <!-- Položky karta -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.package}</span>
                                        <h3>Položky objednávky</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="items-table-header">
                                            <div class="col-desc">Popis</div>
                                            <div class="col-qty">Množstvo</div>
                                            <div class="col-unit">Jedn.</div>
                                            <div class="col-price">Cena/jedn.</div>
                                            <div class="col-total">Spolu</div>
                                            <div class="col-action"></div>
                                        </div>
                                        
                                        <div id="order-items" class="items-container">
                                            ${this.renderItemRowNew(0)}
                                        </div>
                                        
                                        <div class="add-item-section">
                                            <button type="button" class="add-item-btn" onclick="BillingModule.addItemRow('order')">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                Pridať položku
                                            </button>
                                            
                                            <div class="service-dropdown">
                                                <select id="quick-service-order" onchange="BillingModule.addServiceItemOrder(this.value)">
                                                    <option value="">${Icons.package} Pridať zo služieb...</option>
                                                    ${this.services.map(s => `
                                                        <option value="${s.id}">${s.name} — ${this.formatMoney(s.base_price)}</option>
                                                    `).join('')}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Poznámka -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.edit}</span>
                                        <h3>Poznámka</h3>
                                    </div>
                                    <div class="card-body">
                                        <textarea name="notes" rows="3" placeholder="Interná poznámka k objednávke..." class="note-textarea"></textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Pravá strana -->
                            <div class="form-sidebar">
                                <!-- Dátumy -->
                                <div class="form-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.calendar}</span>
                                        <h3>Dátumy</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="date-field">
                                            <label>Dátum objednávky</label>
                                            <input type="date" name="order_date" value="${new Date().toISOString().split('T')[0]}">
                                        </div>
                                        <div class="date-field">
                                            <label>Požadovaný termín</label>
                                            <input type="date" name="requested_date" value="${this.addDays(new Date(), 14).toISOString().split('T')[0]}">
                                        </div>
                                    </div>
                                </div>
                                
                                ${fromQuote ? `<input type="hidden" name="quote_id" value="${fromQuote.id}">` : ''}
                                
                                <!-- Súhrn karta -->
                                <div class="form-card summary-card">
                                    <div class="card-header">
                                        <span class="card-icon">${Icons.billing}</span>
                                        <h3>Súhrn</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="summary-row">
                                            <span class="summary-label">Medzisúčet</span>
                                            <span class="summary-value" id="subtotal">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-row with-input">
                                            <div class="summary-label-with-input">
                                                <span>DPH</span>
                                                <div class="input-with-suffix">
                                                    <input type="number" name="vat_rate" value="${this.settings?.default_vat_rate || 20}" 
                                                           onchange="BillingModule.recalculateTotals()">
                                                    <span class="suffix">%</span>
                                                </div>
                                            </div>
                                            <span class="summary-value" id="vat-amount">0,00 €</span>
                                        </div>
                                        
                                        <div class="summary-divider"></div>
                                        
                                        <div class="summary-row total">
                                            <span class="summary-label">Celkom</span>
                                            <span class="summary-value" id="total">0,00 €</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <!-- Footer -->
                <div class="invoice-modal-footer">
                    <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">
                        Zrušiť
                    </button>
                    <div class="footer-actions">
                        <button class="btn-draft" onclick="BillingModule.saveOrder('new')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            </svg>
                            Uložiť
                        </button>
                        <button class="btn-primary-action" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);" onclick="BillingModule.saveOrder('confirmed')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Potvrdiť objednávku
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.itemRowIndex = 0;
        this.currentDocType = 'order';
    },

    // Recipient selector s možnosťou výberu klienta, leadu alebo pridania nového
    renderRecipientSelector(fromLead = null, preselectedClientId = null) {
        return `
            <div class="recipient-tabs">
                <button type="button" class="recipient-tab active" onclick="BillingModule.switchRecipientTab('client', this)">
                    ${Icons.building} Klient
                </button>
                <button type="button" class="recipient-tab" onclick="BillingModule.switchRecipientTab('lead', this)">
                    ${Icons.target} Lead
                </button>
                <button type="button" class="recipient-tab" onclick="BillingModule.switchRecipientTab('new', this)">
                    ➕ Nový
                </button>
            </div>
            
            <!-- Klient select -->
            <div id="recipient-client" class="recipient-content">
                <div class="client-select-wrapper">
                    <label>Vybrať klienta</label>
                    <select name="client_id" class="client-select" onchange="BillingModule.onRecipientSelect('client', this.value)">
                        <option value="">Vyhľadať alebo vybrať...</option>
                        ${this.clients.map(c => `
                            <option value="${c.id}" ${preselectedClientId === c.id ? 'selected' : ''}>${c.company_name}${c.ico ? ' • IČO: ' + c.ico : ''}</option>
                        `).join('')}
                    </select>
                </div>
                <div id="recipient-preview-client" class="client-preview-card" style="display: none;"></div>
            </div>
            
            <!-- Lead select -->
            <div id="recipient-lead" class="recipient-content" style="display: none;">
                <div class="client-select-wrapper">
                    <label>Vybrať lead</label>
                    ${(this.leads || []).length > 0 ? `
                        <select name="lead_id" class="client-select" onchange="BillingModule.onRecipientSelect('lead', this.value)">
                            <option value="">Vyhľadať alebo vybrať...</option>
                            ${this.leads.map(l => `
                                <option value="${l.id}" ${fromLead?.id === l.id ? 'selected' : ''}>${l.company_name}${l.email ? ' • ' + l.email : ''}</option>
                            `).join('')}
                        </select>
                    ` : `
                        <div class="empty-leads-msg">
                            <p>Žiadne dostupné leady</p>
                            <small>Leady môžete pridať v module Leady</small>
                        </div>
                    `}
                </div>
                <div id="recipient-preview-lead" class="client-preview-card" style="display: none;"></div>
            </div>
            
            <!-- Nový klient form -->
            <div id="recipient-new" class="recipient-content" style="display: none;">
                <div class="new-client-form">
                    <div class="date-field">
                        <label>Názov firmy <span class="required">*</span></label>
                        <input type="text" name="new_company_name" placeholder="ABC s.r.o." class="full-input">
                    </div>
                    <div class="form-row-2">
                        <div class="date-field">
                            <label>IČO</label>
                            <input type="text" name="new_ico" placeholder="12345678" class="full-input">
                        </div>
                        <div class="date-field">
                            <label>DIČ</label>
                            <input type="text" name="new_dic" placeholder="1234567890" class="full-input">
                        </div>
                    </div>
                    <div class="date-field">
                        <label>Email</label>
                        <input type="email" name="new_email" placeholder="info@firma.sk" class="full-input">
                    </div>
                    <div class="date-field">
                        <label>Adresa</label>
                        <input type="text" name="new_address" placeholder="Ulica 123, 12345 Mesto" class="full-input">
                    </div>
                </div>
            </div>
        `;
    },

    switchRecipientTab(type, btn) {
        // Prepnúť aktívny tab
        document.querySelectorAll('.recipient-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        
        // Zobraziť správny content
        document.querySelectorAll('.recipient-content').forEach(c => c.style.display = 'none');
        document.getElementById(`recipient-${type}`).style.display = 'block';
    },

    onRecipientSelect(type, id) {
        if (!id) {
            document.getElementById(`recipient-preview-${type}`).style.display = 'none';
            return;
        }
        
        let data;
        if (type === 'client') {
            data = this.clients.find(c => c.id === id);
        } else if (type === 'lead') {
            data = (this.leads || []).find(l => l.id === id);
        }
        
        if (data) {
            const preview = document.getElementById(`recipient-preview-${type}`);
            preview.innerHTML = `
                <div class="client-card-preview">
                    <div class="client-name">${data.company_name}</div>
                    <div class="client-address">
                        ${data.address || ''}
                        ${data.city ? '<br>' + (data.zip || '') + ' ' + data.city : ''}
                    </div>
                    <div class="client-ids">
                        ${data.ico ? '<span>IČO: ' + data.ico + '</span>' : ''}
                        ${data.dic ? '<span>DIČ: ' + data.dic + '</span>' : ''}
                        ${data.email ? '<span>${Icons.mail} ' + data.email + '</span>' : ''}
                    </div>
                </div>
            `;
            preview.style.display = 'block';
        }
    },

    addServiceItemQuote(serviceId) {
        if (!serviceId) return;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;
        
        this.addItemRow('quote');
        const container = document.getElementById('quote-items');
        const lastRow = container.querySelector('.item-row-new:last-of-type');
        
        if (lastRow) {
            lastRow.querySelector('input[name*="[description]"]').value = service.name;
            lastRow.querySelector('input[name*="[unit_price]"]').value = service.base_price;
            lastRow.querySelector('select[name*="[unit]"]').value = service.unit || 'mes';
            this.recalculateRow(this.itemRowIndex);
        }
        
        document.getElementById('quick-service-quote').value = '';
    },

    addServiceItemOrder(serviceId) {
        if (!serviceId) return;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;
        
        this.addItemRow('order');
        const container = document.getElementById('order-items');
        const lastRow = container.querySelector('.item-row-new:last-of-type');
        
        if (lastRow) {
            lastRow.querySelector('input[name*="[description]"]').value = service.name;
            lastRow.querySelector('input[name*="[unit_price]"]').value = service.base_price;
            lastRow.querySelector('select[name*="[unit]"]').value = service.unit || 'mes';
            this.recalculateRow(this.itemRowIndex);
        }
        
        document.getElementById('quick-service-order').value = '';
    },

    // Položky faktúry/ponuky
    itemRowIndex: 0,

    renderItemRow(index, type = 'invoice') {
        return `
            <div class="item-row" data-index="${index}">
                <div class="item-fields">
                    <div class="form-group flex-3">
                        <input type="text" name="items[${index}][description]" placeholder="Popis položky" 
                               required onchange="BillingModule.recalculateTotals()">
                    </div>
                    <div class="form-group">
                        <input type="number" name="items[${index}][quantity]" value="1" min="0.01" step="0.01"
                               onchange="BillingModule.recalculateRow(${index})">
                    </div>
                    <div class="form-group">
                        <select name="items[${index}][unit]">
                            <option value="ks">ks</option>
                            <option value="hod">hod</option>
                            <option value="mes">mes</option>
                            <option value="rok">rok</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <input type="number" name="items[${index}][unit_price]" placeholder="Cena" min="0" step="0.01"
                               onchange="BillingModule.recalculateRow(${index})">
                    </div>
                    <div class="form-group item-total">
                        <span id="item-total-${index}">0,00 €</span>
                    </div>
                    <button type="button" class="btn-icon btn-remove" onclick="BillingModule.removeItemRow(${index})">${Icons.trash}</button>
                </div>
            </div>
        `;
    },

    renderItemRowNew(index) {
        return `
            <div class="item-row-new" data-index="${index}">
                <div class="col-desc">
                    <input type="text" name="items[${index}][description]" placeholder="Názov služby alebo produktu..." 
                           onchange="BillingModule.recalculateTotals()">
                </div>
                <div class="col-qty">
                    <input type="number" name="items[${index}][quantity]" value="1" min="0.01" step="0.01"
                           onchange="BillingModule.recalculateRow(${index})">
                </div>
                <div class="col-unit">
                    <select name="items[${index}][unit]">
                        <option value="ks">ks</option>
                        <option value="hod">hod</option>
                        <option value="mes">mes</option>
                        <option value="rok">rok</option>
                    </select>
                </div>
                <div class="col-price">
                    <input type="number" name="items[${index}][unit_price]" placeholder="0.00" min="0" step="0.01"
                           onchange="BillingModule.recalculateRow(${index})">
                </div>
                <div class="col-total">
                    <span id="item-total-${index}">0,00 €</span>
                </div>
                <div class="col-action">
                    <button type="button" class="remove-item-btn" onclick="BillingModule.removeItemRow(${index})" title="Odstrániť">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    },

    addItemRow(type = 'invoice') {
        this.itemRowIndex++;
        const containerId = type === 'invoice' ? 'invoice-items' : (type === 'quote' ? 'quote-items' : 'order-items');
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const div = document.createElement('div');
        // Použiť nový štýl pre moderné modaly
        if (document.querySelector('.invoice-modal')) {
            div.innerHTML = this.renderItemRowNew(this.itemRowIndex);
        } else {
            div.innerHTML = this.renderItemRow(this.itemRowIndex, type);
        }
        container.appendChild(div.firstElementChild);
    },

    removeItemRow(index) {
        const row = document.querySelector(`.item-row[data-index="${index}"], .item-row-new[data-index="${index}"]`);
        const allRows = document.querySelectorAll('.item-row, .item-row-new');
        if (row && allRows.length > 1) {
            row.remove();
            this.recalculateTotals();
        }
    },

    addServiceItem(serviceId) {
        if (!serviceId) return;
        
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;
        
        // Skúsiť nájsť prázdny riadok
        let targetRow = null;
        const allRows = document.querySelectorAll('.item-row-new, .item-row');
        
        for (const row of allRows) {
            const descInput = row.querySelector('input[name*="[description]"]');
            if (descInput && !descInput.value.trim()) {
                targetRow = row;
                break;
            }
        }
        
        // Ak nie je prázdny riadok, pridať nový
        if (!targetRow) {
            this.addItemRow('invoice');
            targetRow = document.querySelector('.item-row-new:last-of-type') || document.querySelector('.item-row:last-child');
        }
        
        if (targetRow) {
            const descInput = targetRow.querySelector('input[name*="[description]"]');
            const priceInput = targetRow.querySelector('input[name*="[unit_price]"]');
            const unitSelect = targetRow.querySelector('select[name*="[unit]"]');
            const index = targetRow.dataset.index;
            
            if (descInput) descInput.value = service.name;
            if (priceInput) priceInput.value = service.base_price;
            if (unitSelect) unitSelect.value = service.unit || 'mes';
            
            this.recalculateRow(index);
        }
        
        // Reset select
        document.getElementById('quick-service').value = '';
    },

    recalculateRow(index) {
        const row = document.querySelector(`.item-row[data-index="${index}"], .item-row-new[data-index="${index}"]`);
        if (!row) return;
        
        const qty = parseFloat(row.querySelector('input[name*="[quantity]"]').value) || 0;
        const price = parseFloat(row.querySelector('input[name*="[unit_price]"]').value) || 0;
        const total = qty * price;
        
        document.getElementById(`item-total-${index}`).textContent = this.formatMoney(total);
        this.recalculateTotals();
    },

    recalculateTotals() {
        let subtotal = 0;
        
        document.querySelectorAll('.item-row, .item-row-new').forEach(row => {
            const qty = parseFloat(row.querySelector('input[name*="[quantity]"]')?.value) || 0;
            const price = parseFloat(row.querySelector('input[name*="[unit_price]"]')?.value) || 0;
            subtotal += qty * price;
        });
        
        const discountPercent = parseFloat(document.querySelector('input[name="discount_percent"]')?.value) || 0;
        const vatRate = parseFloat(document.querySelector('input[name="vat_rate"]')?.value) || 20;
        
        const discountAmount = subtotal * (discountPercent / 100);
        const afterDiscount = subtotal - discountAmount;
        const vatAmount = afterDiscount * (vatRate / 100);
        const total = afterDiscount + vatAmount;
        
        document.getElementById('subtotal').textContent = this.formatMoney(subtotal);
        if (document.getElementById('discount-amount')) {
            document.getElementById('discount-amount').textContent = '-' + this.formatMoney(discountAmount);
        }
        document.getElementById('vat-amount').textContent = this.formatMoney(vatAmount);
        document.getElementById('total').textContent = this.formatMoney(total);
    },

    onClientSelect(clientId) {
        // Kompatibilita s novým recipient selectorom
        this.onRecipientSelect('client', clientId);
    },

    async saveInvoice(status) {
        const form = document.getElementById('invoice-form');
        const formData = new FormData(form);
        
        // Získať client_id - buď z existujúceho klienta, leadu alebo vytvoriť nového
        let clientId = formData.get('client_id') || null;
        const leadId = formData.get('lead_id') || null;
        const newCompanyName = formData.get('new_company_name');
        
        try {
            // Ak je nový klient
            if (newCompanyName && !clientId) {
                const { data: newClient, error: clientError } = await Database.client
                    .from('clients')
                    .insert({
                        company_name: newCompanyName,
                        ico: formData.get('new_ico') || null,
                        dic: formData.get('new_dic') || null,
                        email: formData.get('new_email') || null,
                        address: formData.get('new_address') || null,
                        status: 'active'
                    })
                    .select()
                    .single();
                
                if (clientError) throw clientError;
                clientId = newClient.id;
            }
            
            // Ak je vybraný lead, vytvoríme z neho klienta
            if (leadId && !clientId) {
                const lead = this.leads.find(l => l.id === leadId);
                if (lead) {
                    const { data: newClient, error: clientError } = await Database.client
                        .from('clients')
                        .insert({
                            company_name: lead.company_name,
                            ico: lead.ico || null,
                            dic: lead.dic || null,
                            email: lead.email || null,
                            phone: lead.phone || null,
                            address: lead.address || null,
                            city: lead.city || null,
                            zip: lead.zip || null,
                            status: 'active'
                        })
                        .select()
                        .single();
                    
                    if (clientError) throw clientError;
                    clientId = newClient.id;
                    
                    // Aktualizovať lead na converted
                    await Database.client
                        .from('leads')
                        .update({ status: 'converted', client_id: clientId })
                        .eq('id', leadId);
                }
            }
            
            if (!clientId) {
                alert('Vyberte klienta alebo vytvorte nového');
                return;
            }
        
            // Zozbierať položky
            const items = [];
            document.querySelectorAll('#invoice-items .item-row, #invoice-items .item-row-new').forEach(row => {
                const desc = row.querySelector('input[name*="[description]"]')?.value;
                const qty = parseFloat(row.querySelector('input[name*="[quantity]"]')?.value) || 0;
                const unit = row.querySelector('select[name*="[unit]"]')?.value || 'ks';
                const price = parseFloat(row.querySelector('input[name*="[unit_price]"]')?.value) || 0;
                
                if (desc && qty > 0 && price > 0) {
                    items.push({
                        description: desc,
                        quantity: qty,
                        unit: unit,
                        unit_price: price,
                        total: qty * price
                    });
                }
            });
            
            if (items.length === 0) {
                alert('Pridajte aspoň jednu položku');
                return;
            }
            
            // Výpočet súm
            const subtotal = items.reduce((sum, i) => sum + i.total, 0);
            const discountPercent = parseFloat(formData.get('discount_percent')) || 0;
            const discountAmount = subtotal * (discountPercent / 100);
            const afterDiscount = subtotal - discountAmount;
            const vatRate = parseFloat(formData.get('vat_rate')) || 20;
            const vatAmount = afterDiscount * (vatRate / 100);
            const total = afterDiscount + vatAmount;
        
            // Získať číslo faktúry
            const { data: numberData, error: numberError } = await Database.client
                .rpc('get_next_number', { p_sequence_type: 'invoice' });
            
            if (numberError) throw numberError;
            
            // Vytvoriť faktúru
            const { data: invoice, error: invoiceError } = await Database.client
                .from('invoices')
                .insert({
                    invoice_number: numberData,
                    client_id: clientId,
                    invoice_type: 'invoice',
                    issue_date: formData.get('issue_date'),
                    delivery_date: formData.get('delivery_date'),
                    due_date: formData.get('due_date'),
                    payment_method: formData.get('payment_method') || 'bank_transfer',
                    status: status,
                    subtotal: subtotal,
                    discount_percent: discountPercent,
                    discount_amount: discountAmount,
                    vat_rate: vatRate,
                    vat_amount: vatAmount,
                    total: total,
                    remaining_amount: total,
                    variable_symbol: numberData.replace(/\D/g, ''),
                    notes: formData.get('notes')
                })
                .select()
                .single();
            
            if (invoiceError) throw invoiceError;
            
            // Pridať položky
            const invoiceItems = items.map((item, idx) => ({
                invoice_id: invoice.id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                vat_rate: vatRate,
                total: item.total,
                sort_order: idx
            }));
            
            const { error: itemsError } = await Database.client
                .from('invoice_items')
                .insert(invoiceItems);
            
            if (itemsError) throw itemsError;
            
            // Zavrieť modal a obnoviť dáta
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            alert(`Faktúra ${numberData} bola vytvorená!`);
            
        } catch (error) {
            console.error('Error saving invoice:', error);
            alert('Chyba pri ukladaní faktúry: ' + error.message);
        }
    },

    async saveQuote(status) {
        const form = document.getElementById('quote-form');
        const formData = new FormData(form);
        
        // Zozbierať položky
        const items = [];
        document.querySelectorAll('#quote-items .item-row, #quote-items .item-row-new').forEach(row => {
            const desc = row.querySelector('input[name*="[description]"]')?.value;
            const qty = parseFloat(row.querySelector('input[name*="[quantity]"]')?.value) || 0;
            const unit = row.querySelector('select[name*="[unit]"]')?.value || 'ks';
            const price = parseFloat(row.querySelector('input[name*="[unit_price]"]')?.value) || 0;
            
            if (desc && qty > 0 && price > 0) {
                items.push({
                    description: desc,
                    quantity: qty,
                    unit: unit,
                    unit_price: price,
                    total: qty * price
                });
            }
        });
        
        if (items.length === 0) {
            alert('Pridajte aspoň jednu položku');
            return;
        }
        
        // Výpočty
        const subtotal = items.reduce((sum, i) => sum + i.total, 0);
        const discountPercent = parseFloat(formData.get('discount_percent')) || 0;
        const discountAmount = subtotal * (discountPercent / 100);
        const afterDiscount = subtotal - discountAmount;
        const vatRate = parseFloat(formData.get('vat_rate')) || 20;
        const vatAmount = afterDiscount * (vatRate / 100);
        const total = afterDiscount + vatAmount;
        
        try {
            // Ak je nový klient, najprv ho vytvoríme
            let clientId = formData.get('client_id') || null;
            let leadId = formData.get('lead_id') || null;
            
            const newCompanyName = formData.get('new_company_name');
            if (newCompanyName && !clientId) {
                const { data: newClient, error: clientError } = await Database.client
                    .from('clients')
                    .insert({
                        company_name: newCompanyName,
                        ico: formData.get('new_ico') || null,
                        dic: formData.get('new_dic') || null,
                        email: formData.get('new_email') || null,
                        address: formData.get('new_address') || null,
                        status: 'active'
                    })
                    .select()
                    .single();
                
                if (clientError) throw clientError;
                clientId = newClient.id;
            }
            
            // Získať číslo ponuky
            const { data: numberData } = await Database.client
                .rpc('get_next_number', { p_sequence_type: 'quote' });
            
            // Vytvoriť ponuku
            const { data: quote, error } = await Database.client
                .from('quotes')
                .insert({
                    quote_number: numberData,
                    client_id: clientId,
                    lead_id: leadId,
                    title: formData.get('title') || null,
                    introduction: formData.get('introduction') || null,
                    terms: formData.get('terms') || null,
                    issue_date: formData.get('issue_date'),
                    valid_until: formData.get('valid_until'),
                    status: status,
                    subtotal: subtotal,
                    discount_percent: discountPercent,
                    discount_amount: discountAmount,
                    vat_rate: vatRate,
                    vat_amount: vatAmount,
                    total: total
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Pridať položky
            const quoteItems = items.map((item, idx) => ({
                quote_id: quote.id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                total: item.total,
                sort_order: idx
            }));
            
            await Database.client.from('quote_items').insert(quoteItems);
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            this.currentTab = 'quotes';
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            alert(`Ponuka ${numberData} bola vytvorená!`);
            
        } catch (error) {
            console.error('Error saving quote:', error);
            alert('Chyba pri ukladaní ponuky: ' + error.message);
        }
    },

    async saveOrder(status) {
        const form = document.getElementById('order-form');
        const formData = new FormData(form);
        
        // Zozbierať položky
        const items = [];
        document.querySelectorAll('#order-items .item-row, #order-items .item-row-new').forEach(row => {
            const desc = row.querySelector('input[name*="[description]"]')?.value;
            const qty = parseFloat(row.querySelector('input[name*="[quantity]"]')?.value) || 0;
            const unit = row.querySelector('select[name*="[unit]"]')?.value || 'ks';
            const price = parseFloat(row.querySelector('input[name*="[unit_price]"]')?.value) || 0;
            
            if (desc && qty > 0 && price > 0) {
                items.push({
                    description: desc,
                    quantity: qty,
                    unit: unit,
                    unit_price: price,
                    total: qty * price
                });
            }
        });
        
        if (items.length === 0) {
            alert('Pridajte aspoň jednu položku');
            return;
        }
        
        // Výpočty
        const subtotal = items.reduce((sum, i) => sum + i.total, 0);
        const vatRate = parseFloat(formData.get('vat_rate')) || 20;
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;
        
        try {
            // Ak je nový klient
            let clientId = formData.get('client_id') || null;
            
            const newCompanyName = formData.get('new_company_name');
            if (newCompanyName && !clientId) {
                const { data: newClient, error: clientError } = await Database.client
                    .from('clients')
                    .insert({
                        company_name: newCompanyName,
                        ico: formData.get('new_ico') || null,
                        dic: formData.get('new_dic') || null,
                        email: formData.get('new_email') || null,
                        address: formData.get('new_address') || null,
                        status: 'active'
                    })
                    .select()
                    .single();
                
                if (clientError) throw clientError;
                clientId = newClient.id;
            }
            
            // Získať číslo objednávky
            const { data: numberData } = await Database.client
                .rpc('get_next_number', { p_sequence_type: 'order' });
            
            // Vytvoriť objednávku
            const { data: order, error } = await Database.client
                .from('orders')
                .insert({
                    order_number: numberData,
                    client_id: clientId,
                    quote_id: formData.get('quote_id') || null,
                    order_date: formData.get('order_date'),
                    requested_date: formData.get('requested_date') || null,
                    status: status,
                    subtotal: subtotal,
                    vat_rate: vatRate,
                    vat_amount: vatAmount,
                    total: total,
                    notes: formData.get('notes') || null
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Pridať položky
            const orderItems = items.map((item, idx) => ({
                order_id: order.id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                total: item.total,
                sort_order: idx
            }));
            
            await Database.client.from('order_items').insert(orderItems);
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            this.currentTab = 'orders';
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            alert(`Objednávka ${numberData} bola vytvorená!`);
            
        } catch (error) {
            console.error('Error saving order:', error);
            alert('Chyba pri ukladaní objednávky: ' + error.message);
        }
    },

    async showInvoiceDetail(invoiceId) {
        const invoice = this.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        // Načítať položky
        const { data: items } = await Database.client
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('sort_order');
        
        // Načítať platby
        const { data: payments } = await Database.client
            .from('payments')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('payment_date', { ascending: false });
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>${Icons.documents} Faktúra ${invoice.invoice_number}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <!-- Status bar -->
                    <div class="invoice-status-bar">
                        ${this.renderInvoiceStatus(invoice.computed_status || invoice.status)}
                        ${invoice.computed_status === 'overdue' ? 
                            `<span class="overdue-info">${Icons.alertTriangle} ${Math.abs(invoice.days_until_due)} dní po splatnosti</span>` : ''}
                    </div>
                    
                    <!-- Hlavička -->
                    <div class="invoice-header-detail">
                        <div class="invoice-dates">
                            <p><strong>Vystavená:</strong> ${this.formatDate(invoice.issue_date)}</p>
                            <p><strong>Dodanie:</strong> ${this.formatDate(invoice.delivery_date)}</p>
                            <p><strong>Splatnosť:</strong> ${this.formatDate(invoice.due_date)}</p>
                            <p><strong>Var. symbol:</strong> ${invoice.variable_symbol || invoice.invoice_number}</p>
                        </div>
                        <div class="invoice-client">
                            <h4>Odberateľ</h4>
                            <p><strong>${invoice.client_company || invoice.client_name}</strong></p>
                            <p>${invoice.client_email || ''}</p>
                        </div>
                    </div>
                    
                    <!-- Položky -->
                    <table class="invoice-items-table">
                        <thead>
                            <tr>
                                <th>Popis</th>
                                <th>Množstvo</th>
                                <th>Cena/j.</th>
                                <th>Celkom</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(items || []).map(item => `
                                <tr>
                                    <td>${item.description}</td>
                                    <td>${item.quantity} ${item.unit}</td>
                                    <td>${this.formatMoney(item.unit_price)}</td>
                                    <td>${this.formatMoney(item.total)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <!-- Súhrn -->
                    <div class="invoice-totals">
                        <div class="total-row">
                            <span>Základ:</span>
                            <span>${this.formatMoney(invoice.subtotal)}</span>
                        </div>
                        ${invoice.discount_amount > 0 ? `
                            <div class="total-row">
                                <span>Zľava (${invoice.discount_percent}%):</span>
                                <span>-${this.formatMoney(invoice.discount_amount)}</span>
                            </div>
                        ` : ''}
                        <div class="total-row">
                            <span>DPH (${invoice.vat_rate}%):</span>
                            <span>${this.formatMoney(invoice.vat_amount)}</span>
                        </div>
                        <div class="total-row total-final">
                            <span>Celkom k úhrade:</span>
                            <span>${this.formatMoney(invoice.total)}</span>
                        </div>
                        ${invoice.paid_amount > 0 ? `
                            <div class="total-row paid">
                                <span>Uhradené:</span>
                                <span>${this.formatMoney(invoice.paid_amount)}</span>
                            </div>
                            <div class="total-row remaining">
                                <span>Zostáva:</span>
                                <span>${this.formatMoney(invoice.remaining_amount)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Platby -->
                    ${payments && payments.length > 0 ? `
                        <div class="invoice-payments">
                            <h4>${Icons.billing} Prijaté platby</h4>
                            <table class="payments-table">
                                <thead>
                                    <tr>
                                        <th>Dátum</th>
                                        <th>Typ</th>
                                        <th>Suma</th>
                                        <th>Poznámka</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${payments.map(p => `
                                        <tr>
                                            <td>${this.formatDate(p.payment_date)}</td>
                                            <td>${p.payment_type}</td>
                                            <td>${this.formatMoney(p.amount)}</td>
                                            <td>${p.notes || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                    
                    ${invoice.notes ? `
                        <div class="invoice-notes">
                            <h4>Poznámka</h4>
                            <p>${invoice.notes}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                    <button class="btn btn-secondary" onclick="BillingModule.downloadPDF('${invoiceId}')">${Icons.inbox} Stiahnuť PDF</button>
                    ${invoice.status !== 'paid' && invoice.status !== 'cancelled' ? `
                        <button class="btn btn-primary" onclick="BillingModule.addPayment('${invoiceId}')">💳 Pridať platbu</button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async showQuoteDetail(quoteId) {
        const quote = this.quotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        const { data: items } = await Database.client
            .from('quote_items')
            .select('*')
            .eq('quote_id', quoteId)
            .order('sort_order');
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>${Icons.edit} Ponuka ${quote.quote_number}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="invoice-status-bar">
                        ${this.renderQuoteStatus(quote.status)}
                    </div>
                    
                    <div class="quote-info">
                        <h3>${quote.title || 'Cenová ponuka'}</h3>
                        <p><strong>Klient:</strong> ${quote.company_name || quote.contact_name || '-'}</p>
                        <p><strong>Vystavená:</strong> ${this.formatDate(quote.issue_date)}</p>
                        <p><strong>Platná do:</strong> ${quote.valid_until ? this.formatDate(quote.valid_until) : '-'}</p>
                    </div>
                    
                    ${quote.introduction ? `<div class="quote-intro"><p>${quote.introduction}</p></div>` : ''}
                    
                    <table class="invoice-items-table">
                        <thead>
                            <tr>
                                <th>Popis</th>
                                <th>Množstvo</th>
                                <th>Cena/j.</th>
                                <th>Celkom</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(items || []).map(item => `
                                <tr>
                                    <td>${item.description}</td>
                                    <td>${item.quantity} ${item.unit}</td>
                                    <td>${this.formatMoney(item.unit_price)}</td>
                                    <td>${this.formatMoney(item.total)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="invoice-totals">
                        <div class="total-row">
                            <span>Základ:</span>
                            <span>${this.formatMoney(quote.subtotal)}</span>
                        </div>
                        <div class="total-row">
                            <span>DPH (${quote.vat_rate}%):</span>
                            <span>${this.formatMoney(quote.vat_amount)}</span>
                        </div>
                        <div class="total-row total-final">
                            <span>Celkom:</span>
                            <span>${this.formatMoney(quote.total)}</span>
                        </div>
                    </div>
                    
                    ${quote.terms ? `<div class="quote-terms"><h4>Podmienky</h4><p>${quote.terms}</p></div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                    ${quote.status === 'sent' || quote.status === 'viewed' ? `
                        <button class="btn btn-danger" onclick="BillingModule.updateQuoteStatus('${quoteId}', 'rejected')">${Icons.xCircle} Odmietnutá</button>
                        <button class="btn btn-success" onclick="BillingModule.updateQuoteStatus('${quoteId}', 'accepted')">${Icons.checkCircle} Akceptovaná</button>
                    ` : ''}
                    ${quote.status === 'accepted' ? `
                        <button class="btn btn-primary" onclick="BillingModule.createInvoiceFromQuote('${quoteId}')">${Icons.documents} Vytvoriť faktúru</button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async addPayment(invoiceId) {
        const invoice = this.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        const remaining = parseFloat(invoice.remaining_amount) || parseFloat(invoice.total) || 0;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>💳 Pridať platbu</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p>Faktúra: <strong>${invoice.invoice_number}</strong></p>
                    <p>Zostáva uhradiť: <strong>${this.formatMoney(remaining)}</strong></p>
                    
                    <form id="payment-form">
                        <input type="hidden" name="invoice_id" value="${invoiceId}">
                        
                        <div class="form-group">
                            <label>Suma *</label>
                            <input type="number" name="amount" value="${remaining}" min="0.01" step="0.01" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Dátum platby</label>
                            <input type="date" name="payment_date" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        
                        <div class="form-group">
                            <label>Typ platby</label>
                            <select name="payment_type">
                                <option value="bank_transfer">Bankový prevod</option>
                                <option value="cash">Hotovosť</option>
                                <option value="card">Karta</option>
                                <option value="online">Online platba</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Poznámka</label>
                            <input type="text" name="notes" placeholder="Napr. číslo transakcie">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn btn-primary" onclick="BillingModule.savePayment()">Pridať platbu</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async savePayment() {
        const form = document.getElementById('payment-form');
        const formData = new FormData(form);
        
        const amount = parseFloat(formData.get('amount'));
        if (!amount || amount <= 0) {
            alert('Zadajte platnú sumu');
            return;
        }
        
        try {
            const { error } = await Database.client
                .from('payments')
                .insert({
                    invoice_id: formData.get('invoice_id'),
                    amount: amount,
                    payment_date: formData.get('payment_date'),
                    payment_type: formData.get('payment_type'),
                    notes: formData.get('notes')
                });
            
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            // Aktualizovať stats
            document.querySelector('.billing-stats').innerHTML = this.renderStats();
            
            alert('Platba bola pridaná!');
            
        } catch (error) {
            console.error('Error saving payment:', error);
            alert('Chyba pri ukladaní platby: ' + error.message);
        }
    },

    async updateQuoteStatus(quoteId, status) {
        try {
            const updateData = { status };
            if (status === 'accepted') updateData.accepted_at = new Date().toISOString();
            if (status === 'rejected') updateData.rejected_at = new Date().toISOString();
            
            const { error } = await Database.client
                .from('quotes')
                .update(updateData)
                .eq('id', quoteId);
            
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
        } catch (error) {
            console.error('Error updating quote:', error);
            alert('Chyba: ' + error.message);
        }
    },

    // ==========================================
    // WORKFLOW FUNKCIE - Prevody medzi dokladmi
    // ==========================================
    
    async createOrderFromQuote(quoteId) {
        const quote = this.quotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        // Načítať položky ponuky
        const { data: items } = await Database.client
            .from('quote_items')
            .select('*')
            .eq('quote_id', quoteId)
            .order('sort_order');
        
        // Otvoriť modal objednávky s prefill
        this.createOrder(quote);
        
        // Po otvorení modalu vyplniť položky
        setTimeout(() => {
            const clientSelect = document.querySelector('select[name="client_id"]');
            if (clientSelect && quote.client_id) {
                clientSelect.value = quote.client_id;
                this.onRecipientSelect('client', quote.client_id);
            }
            
            // Pridať položky
            if (items && items.length > 0) {
                items.forEach((item, idx) => {
                    if (idx > 0) this.addItemRow('order');
                    
                    const rows = document.querySelectorAll('#order-items .item-row-new');
                    const row = rows[idx];
                    if (row) {
                        row.querySelector('input[name*="[description]"]').value = item.description;
                        row.querySelector('input[name*="[quantity]"]').value = item.quantity;
                        row.querySelector('input[name*="[unit_price]"]').value = item.unit_price;
                        row.querySelector('select[name*="[unit]"]').value = item.unit || 'ks';
                    }
                });
                this.recalculateTotals();
            }
        }, 100);
    },

    async createProformaFromOrder(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        // Načítať položky objednávky
        const { data: items } = await Database.client
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('sort_order');
        
        // Vytvoriť zálohovú faktúru
        this.createProformaWithData(order, items);
    },
    
    async createProformaWithData(order, items) {
        try {
            const { data: numberData } = await Database.client
                .rpc('get_next_number', { p_sequence_type: 'proforma' });
            
            const subtotal = items.reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
            const vatRate = this.settings?.default_vat_rate || 20;
            const vatAmount = subtotal * (vatRate / 100);
            const total = subtotal + vatAmount;
            
            const { data: invoice, error } = await Database.client
                .from('invoices')
                .insert({
                    invoice_number: numberData,
                    invoice_type: 'proforma',
                    client_id: order.client_id,
                    issue_date: new Date().toISOString().split('T')[0],
                    due_date: this.addDays(new Date(), 14).toISOString().split('T')[0],
                    status: 'issued',
                    subtotal,
                    vat_rate: vatRate,
                    vat_amount: vatAmount,
                    total,
                    remaining_amount: total,
                    variable_symbol: numberData.replace(/\D/g, ''),
                    notes: `Záloha k objednávke ${order.order_number}`
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Pridať položky
            const invoiceItems = items.map((item, idx) => ({
                invoice_id: invoice.id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                vat_rate: vatRate,
                total: item.total,
                sort_order: idx
            }));
            
            await Database.client.from('invoice_items').insert(invoiceItems);
            
            await this.loadData();
            this.currentTab = 'proformas';
            document.getElementById('billing-content').innerHTML = this.renderTabContent();
            
            alert(`Zálohovka ${numberData} bola vytvorená!`);
            
        } catch (error) {
            console.error('Error creating proforma:', error);
            alert('Chyba pri vytváraní zálohovky: ' + error.message);
        }
    },

    async createInvoiceFromOrder(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        // Načítať položky objednávky
        const { data: items } = await Database.client
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('sort_order');
        
        // Vytvoriť faktúru s prefill
        await this.createInvoice();
        
        setTimeout(() => {
            const clientSelect = document.querySelector('select[name="client_id"]');
            if (clientSelect && order.client_id) {
                clientSelect.value = order.client_id;
                this.onClientSelect(order.client_id);
            }
            
            // Pridať položky
            if (items && items.length > 0) {
                items.forEach((item, idx) => {
                    if (idx > 0) this.addItemRow('invoice');
                    
                    const rows = document.querySelectorAll('#invoice-items .item-row-new');
                    const row = rows[idx];
                    if (row) {
                        row.querySelector('input[name*="[description]"]').value = item.description;
                        row.querySelector('input[name*="[quantity]"]').value = item.quantity;
                        row.querySelector('input[name*="[unit_price]"]').value = item.unit_price;
                        row.querySelector('select[name*="[unit]"]').value = item.unit || 'ks';
                    }
                });
                this.recalculateTotals();
            }
        }, 100);
    },
    
    async createInvoiceFromQuote(quoteId) {
        const quote = this.quotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        // Načítať položky ponuky
        const { data: items } = await Database.client
            .from('quote_items')
            .select('*')
            .eq('quote_id', quoteId)
            .order('sort_order');
        
        // Vytvoriť faktúru s prefill
        await this.createInvoice();
        
        setTimeout(() => {
            const clientSelect = document.querySelector('select[name="client_id"]');
            if (clientSelect && quote.client_id) {
                clientSelect.value = quote.client_id;
                this.onClientSelect(quote.client_id);
            }
            
            // Pridať položky
            if (items && items.length > 0) {
                items.forEach((item, idx) => {
                    if (idx > 0) this.addItemRow('invoice');
                    
                    const rows = document.querySelectorAll('#invoice-items .item-row-new');
                    const row = rows[idx];
                    if (row) {
                        row.querySelector('input[name*="[description]"]').value = item.description;
                        row.querySelector('input[name*="[quantity]"]').value = item.quantity;
                        row.querySelector('input[name*="[unit_price]"]').value = item.unit_price;
                        row.querySelector('select[name*="[unit]"]').value = item.unit || 'ks';
                    }
                });
                this.recalculateTotals();
            }
        }, 100);
    },
    
    // Detail objednávky
    async showOrderDetail(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        const { data: items } = await Database.client
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('sort_order');
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>${Icons.shoppingCart} Objednávka ${order.order_number}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="invoice-detail-grid">
                        <div class="detail-section">
                            <h4>Odberateľ</h4>
                            <p><strong>${order.client_name || '-'}</strong></p>
                        </div>
                        <div class="detail-section">
                            <h4>Dátumy</h4>
                            <p>Objednané: ${this.formatDate(order.order_date)}</p>
                            ${order.requested_date ? `<p>Požadovaný termín: ${this.formatDate(order.requested_date)}</p>` : ''}
                        </div>
                    </div>
                    
                    <h4>Položky</h4>
                    <table class="invoice-items-table">
                        <thead>
                            <tr>
                                <th>Popis</th>
                                <th>Množstvo</th>
                                <th>Cena</th>
                                <th>Spolu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(items || []).map(item => `
                                <tr>
                                    <td>${item.description}</td>
                                    <td>${item.quantity} ${item.unit}</td>
                                    <td>${this.formatMoney(item.unit_price)}</td>
                                    <td>${this.formatMoney(item.total)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3"><strong>Celkom</strong></td>
                                <td><strong>${this.formatMoney(order.total)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    ${order.notes ? `<div class="detail-notes"><h4>Poznámka</h4><p>${order.notes}</p></div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                    <button class="btn btn-secondary" onclick="BillingModule.createProformaFromOrder('${orderId}')">${Icons.clipboard} Zálohovka</button>
                    <button class="btn btn-primary" onclick="BillingModule.createInvoiceFromOrder('${orderId}')">${Icons.documents} Faktúra</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async showSettings() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>${Icons.settings} Nastavenia fakturácie</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="settings-form">
                        <div class="form-section">
                            <h3>Firemné údaje</h3>
                            <div class="form-row">
                                <div class="form-group flex-2">
                                    <label>Názov firmy</label>
                                    <input type="text" name="company_name" value="${this.settings?.company_name || ''}">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group flex-2">
                                    <label>Adresa</label>
                                    <input type="text" name="company_address" value="${this.settings?.company_address || ''}">
                                </div>
                                <div class="form-group">
                                    <label>PSČ</label>
                                    <input type="text" name="company_zip" value="${this.settings?.company_zip || ''}">
                                </div>
                                <div class="form-group">
                                    <label>Mesto</label>
                                    <input type="text" name="company_city" value="${this.settings?.company_city || ''}">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>IČO</label>
                                    <input type="text" name="ico" value="${this.settings?.ico || ''}">
                                </div>
                                <div class="form-group">
                                    <label>DIČ</label>
                                    <input type="text" name="dic" value="${this.settings?.dic || ''}">
                                </div>
                                <div class="form-group">
                                    <label>IČ DPH</label>
                                    <input type="text" name="ic_dph" value="${this.settings?.ic_dph || ''}">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h3>Bankové údaje</h3>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Názov banky</label>
                                    <input type="text" name="bank_name" value="${this.settings?.bank_name || ''}">
                                </div>
                                <div class="form-group">
                                    <label>Číslo účtu</label>
                                    <input type="text" name="bank_account" value="${this.settings?.bank_account || ''}">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group flex-2">
                                    <label>IBAN</label>
                                    <input type="text" name="iban" value="${this.settings?.iban || ''}">
                                </div>
                                <div class="form-group">
                                    <label>SWIFT/BIC</label>
                                    <input type="text" name="swift" value="${this.settings?.swift || ''}">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h3>Predvolené hodnoty</h3>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>DPH (%)</label>
                                    <input type="number" name="default_vat_rate" value="${this.settings?.default_vat_rate || 20}">
                                </div>
                                <div class="form-group">
                                    <label>Splatnosť (dní)</label>
                                    <input type="number" name="default_due_days" value="${this.settings?.default_due_days || 14}">
                                </div>
                                <div class="form-group">
                                    <label>Mena</label>
                                    <select name="default_currency">
                                        <option value="EUR" ${this.settings?.default_currency === 'EUR' ? 'selected' : ''}>EUR</option>
                                        <option value="CZK" ${this.settings?.default_currency === 'CZK' ? 'selected' : ''}>CZK</option>
                                        <option value="HUF" ${this.settings?.default_currency === 'HUF' ? 'selected' : ''}>HUF</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-section">
                            <h3>Texty na faktúrach</h3>
                            <div class="form-group">
                                <label>Päta faktúry</label>
                                <textarea name="invoice_footer" rows="2">${this.settings?.invoice_footer || ''}</textarea>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn btn-primary" onclick="BillingModule.saveSettings()">Uložiť</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveSettings() {
        const form = document.getElementById('settings-form');
        const formData = new FormData(form);
        
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });
        data.updated_at = new Date().toISOString();
        
        try {
            if (this.settings?.id) {
                await Database.client
                    .from('billing_settings')
                    .update(data)
                    .eq('id', this.settings.id);
            } else {
                await Database.client
                    .from('billing_settings')
                    .insert(data);
            }
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            alert('Nastavenia boli uložené!');
            
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Chyba: ' + error.message);
        }
    },

    async downloadPDF(invoiceId) {
        try {
            // Načítať faktúru s klientom
            const { data: invoice, error } = await Database.client
                .from('invoices')
                .select('*, client:clients(*)')
                .eq('id', invoiceId)
                .single();
            
            if (error) throw error;
            
            // Načítať položky
            const { data: items } = await Database.client
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', invoiceId)
                .order('sort_order');
            
            invoice.items = items || [];
            
            // Generovať PDF
            if (typeof PDFGenerator !== 'undefined') {
                await PDFGenerator.generateInvoicePDF(invoice);
            } else {
                console.error('PDFGenerator not loaded');
                Utils.showNotification('PDF generátor nie je dostupný', 'error');
            }
        } catch (error) {
            console.error('Download PDF error:', error);
            Utils.showNotification('Chyba pri generovaní PDF', 'error');
        }
    },

    // Pomocné funkcie
    formatMoney(amount) {
        return new Intl.NumberFormat('sk-SK', { 
            style: 'currency', 
            currency: 'EUR' 
        }).format(amount || 0);
    },

    formatDate(date) {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('sk-SK');
    },

    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    },

    filterTable(query, tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        const lowerQuery = query.toLowerCase();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(lowerQuery) ? '' : 'none';
        });
    },

    filterByStatus(status, type) {
        const rows = document.querySelectorAll(`#${type === 'invoice' ? 'invoices' : 'quotes'}-table tbody tr`);
        rows.forEach(row => {
            if (!status || row.dataset.status === status) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },

    initDropdowns() {
        document.querySelectorAll('.dropdown-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.nextElementSibling;
                menu.classList.toggle('show');
            });
        });
        
        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        });
    },

    toggleRecipientType(type) {
        // Pre prepínanie medzi klientom a leadom v ponuke
        const select = document.getElementById('recipient-select');
        // Tu by sa načítali leady ak type === 'lead'
    },

    showInvoiceMenu(invoiceId, event) {
        event.stopPropagation();
        // Kontextové menu pre faktúru
    },

    showQuoteMenu(quoteId, event) {
        event.stopPropagation();
        // Kontextové menu pre ponuku
    },

    renderStyles() {
        return `
            <style>
                /* =====================================================
                   BILLING MODULE - MODERNÝ DIZAJN
                   ===================================================== */
                
                .billing-module-new {
                    padding: 0;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                
                /* Header */
                .billing-header {
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%);
                    border-radius: 16px;
                    padding: 2rem;
                    margin-bottom: 1.5rem;
                    color: white;
                }
                
                .header-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .header-title h1 {
                    margin: 0;
                    font-size: 1.75rem;
                    font-weight: 700;
                }
                
                .header-subtitle {
                    margin: 0.25rem 0 0;
                    opacity: 0.9;
                    font-size: 0.95rem;
                }
                
                .btn-new-document {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: rgba(255,255,255,0.2);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    font-size: 0.95rem;
                    font-weight: 600;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-new-document:hover {
                    background: rgba(255,255,255,0.3);
                    transform: translateY(-1px);
                }
                
                .billing-header .dropdown-menu {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    padding: 0.5rem;
                    min-width: 200px;
                }
                
                .billing-header .dropdown-menu a {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    color: #334155;
                    text-decoration: none;
                    border-radius: 8px;
                    transition: background 0.15s;
                }
                
                .billing-header .dropdown-menu a:hover {
                    background: #f1f5f9;
                }
                
                .menu-icon {
                    font-size: 1.1rem;
                }
                
                /* Stats Grid */
                .billing-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                @media (max-width: 1200px) {
                    .billing-stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                
                @media (max-width: 600px) {
                    .billing-stats-grid {
                        grid-template-columns: 1fr;
                    }
                }
                
                .stat-card-new {
                    background: white;
                    border-radius: 16px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                    position: relative;
                    transition: all 0.2s;
                }
                
                .stat-card-new:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    transform: translateY(-2px);
                }
                
                .stat-card-new.warning {
                    border-color: #fecaca;
                    background: linear-gradient(135deg, #fff 0%, #fef2f2 100%);
                }
                
                .stat-card-new.success {
                    border-color: #bbf7d0;
                    background: linear-gradient(135deg, #fff 0%, #f0fdf4 100%);
                }
                
                .stat-card-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                
                .stat-card-icon.orange { background: #fff7ed; color: #ea580c; }
                .stat-card-icon.red { background: #fef2f2; color: #dc2626; }
                .stat-card-icon.blue { background: #eff6ff; color: #2563eb; }
                .stat-card-icon.green { background: #f0fdf4; color: #16a34a; }
                
                .stat-card-content {
                    flex: 1;
                    min-width: 0;
                }
                
                .stat-card-value {
                    display: block;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #0f172a;
                    line-height: 1.2;
                }
                
                .stat-card-label {
                    display: block;
                    font-size: 0.85rem;
                    color: #64748b;
                    margin-top: 0.25rem;
                }
                
                .stat-card-badge {
                    position: absolute;
                    top: 0.75rem;
                    right: 0.75rem;
                    background: #f1f5f9;
                    color: #475569;
                    padding: 0.25rem 0.625rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                
                .stat-card-badge.red {
                    background: #fecaca;
                    color: #dc2626;
                }
                
                /* Tabs */
                .billing-tabs-container {
                    background: white;
                    border-radius: 16px;
                    padding: 0.5rem;
                    margin-bottom: 1rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                }
                
                .billing-tabs-new {
                    display: flex;
                    gap: 0.5rem;
                }
                
                .tab-btn-new {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.875rem 1.25rem;
                    border: none;
                    background: transparent;
                    border-radius: 12px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #64748b;
                    transition: all 0.2s;
                }
                
                .tab-btn-new:hover {
                    background: #f8fafc;
                    color: #334155;
                }
                
                .tab-btn-new.active {
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    color: white;
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
                }
                
                .tab-icon {
                    font-size: 1.1rem;
                }
                
                .tab-label {
                    font-weight: 500;
                }
                
                .tab-count {
                    background: rgba(255,255,255,0.2);
                    padding: 0.15rem 0.5rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                
                .tab-btn-new:not(.active) .tab-count {
                    background: #f1f5f9;
                    color: #64748b;
                }
                
                /* Content Area */
                .billing-content-area {
                    background: white;
                    border-radius: 16px;
                    padding: 1.5rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                }
                
                /* Table Filters */
                .table-filters {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                .filter-search {
                    flex: 1;
                    max-width: 300px;
                    padding: 0.75rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }
                
                .filter-search:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                .filter-select {
                    padding: 0.75rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    background: white;
                    cursor: pointer;
                }
                
                /* Data Table */
                .data-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }
                
                .data-table thead th {
                    background: #f8fafc;
                    padding: 1rem;
                    text-align: left;
                    font-weight: 600;
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748b;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .data-table thead th:first-child {
                    border-radius: 10px 0 0 0;
                }
                
                .data-table thead th:last-child {
                    border-radius: 0 10px 0 0;
                }
                
                .data-table tbody tr {
                    transition: background 0.15s;
                }
                
                .data-table tbody tr:hover {
                    background: #f8fafc;
                }
                
                .data-table tbody td {
                    padding: 1rem;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 0.9rem;
                    color: #334155;
                }
                
                .data-table tbody td a {
                    color: #0f172a;
                    text-decoration: none;
                    font-weight: 600;
                }
                
                .data-table tbody td a:hover {
                    color: #f97316;
                }
                
                /* Status Badges */
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 0.35rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                
                .status-gray { background: #f1f5f9; color: #64748b; }
                .status-blue { background: #dbeafe; color: #1d4ed8; }
                .status-green { background: #dcfce7; color: #15803d; }
                .status-orange { background: #ffedd5; color: #c2410c; }
                .status-red { background: #fee2e2; color: #dc2626; }
                .status-purple { background: #f3e8ff; color: #7c3aed; }
                
                /* Action Buttons */
                .action-buttons {
                    display: flex;
                    gap: 0.25rem;
                }
                
                .btn-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1rem;
                    transition: all 0.15s;
                }
                
                .btn-icon:hover {
                    background: #f1f5f9;
                }
                
                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                }
                
                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    opacity: 0.5;
                }
                
                .empty-state h3 {
                    margin: 0 0 0.5rem;
                    color: #334155;
                }
                
                .empty-state p {
                    color: #64748b;
                    margin-bottom: 1.5rem;
                }
                
                .empty-state .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .empty-state .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
                }
                
                /* Badge Small */
                .badge-sm {
                    padding: 0.2rem 0.5rem;
                    background: #f1f5f9;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    color: #64748b;
                }

                /* =====================================================
                   INVOICE MODAL STYLES (zachované z predtým)
                   ===================================================== */
                
                .invoice-modal {
                    width: 95%;
                    max-width: 1100px;
                    max-height: 95vh;
                    background: #f8fafc;
                    border-radius: 16px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                .invoice-modal-header {
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    color: white;
                    padding: 1.5rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .header-icon {
                    font-size: 2rem;
                }
                
                .invoice-modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                    font-weight: 600;
                }
                
                .header-subtitle {
                    margin: 0.25rem 0 0;
                    opacity: 0.9;
                    font-size: 0.9rem;
                }
                
                .close-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }
                
                .close-btn:hover {
                    background: rgba(255,255,255,0.3);
                }
                
                .invoice-modal-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem 2rem;
                }
                
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 340px;
                    gap: 1.5rem;
                }
                
                @media (max-width: 900px) {
                    .form-grid {
                        grid-template-columns: 1fr;
                    }
                }
                
                .form-card {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                    margin-bottom: 1rem;
                }
                
                .card-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 1rem 1.25rem;
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .card-icon {
                    font-size: 1.25rem;
                }
                
                .card-header h3 {
                    margin: 0;
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: #334155;
                }
                
                .card-body {
                    padding: 1.25rem;
                }
                
                .client-select-wrapper label {
                    display: block;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #475569;
                    margin-bottom: 0.5rem;
                }
                
                .client-select {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    background: white;
                    cursor: pointer;
                }
                
                .client-select:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                .client-preview-card {
                    margin-top: 1rem;
                }
                
                .client-card-preview {
                    background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
                    border: 1px solid #fde047;
                    border-radius: 10px;
                    padding: 1rem;
                }
                
                .client-name {
                    font-weight: 600;
                    color: #854d0e;
                    margin-bottom: 0.5rem;
                }
                
                .client-address {
                    font-size: 0.85rem;
                    color: #a16207;
                    line-height: 1.5;
                }
                
                .client-ids {
                    margin-top: 0.75rem;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                
                .client-ids span {
                    background: rgba(255,255,255,0.6);
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    color: #92400e;
                }
                
                .items-table-header {
                    display: grid;
                    grid-template-columns: 1fr 80px 70px 100px 100px 40px;
                    gap: 0.5rem;
                    padding: 0.75rem 0.5rem;
                    background: #f8fafc;
                    border-radius: 8px;
                    margin-bottom: 0.5rem;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #64748b;
                }
                
                .items-container {
                    margin-bottom: 1rem;
                }
                
                .item-row-new {
                    display: grid;
                    grid-template-columns: 1fr 80px 70px 100px 100px 40px;
                    gap: 0.5rem;
                    padding: 0.5rem;
                    border-bottom: 1px solid #f1f5f9;
                    align-items: center;
                }
                
                .item-row-new:hover {
                    background: #fafafa;
                }
                
                .item-row-new input,
                .item-row-new select {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }
                
                .item-row-new input:focus,
                .item-row-new select:focus {
                    outline: none;
                    border-color: #f97316;
                }
                
                .col-total {
                    font-weight: 600;
                    color: #334155;
                    text-align: right;
                    padding-right: 0.5rem;
                }
                
                .remove-item-btn {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #94a3b8;
                    transition: all 0.15s;
                }
                
                .remove-item-btn:hover {
                    background: #fee2e2;
                    color: #dc2626;
                }
                
                .add-item-section {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                    margin-top: 0.5rem;
                }
                
                .add-item-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.625rem 1rem;
                    background: transparent;
                    border: 2px dashed #e2e8f0;
                    border-radius: 8px;
                    color: #64748b;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                
                .add-item-btn:hover {
                    border-color: #f97316;
                    color: #f97316;
                    background: #fff7ed;
                }
                
                .service-dropdown select {
                    padding: 0.625rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    background: white;
                    cursor: pointer;
                }
                
                .date-field {
                    margin-bottom: 1rem;
                }
                
                .date-field:last-child {
                    margin-bottom: 0;
                }
                
                .date-field label {
                    display: block;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #475569;
                    margin-bottom: 0.5rem;
                }
                
                .date-field input,
                .date-field select {
                    width: 100%;
                    padding: 0.625rem 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                }
                
                .date-field input:focus,
                .date-field select:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                .note-textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    resize: vertical;
                    min-height: 80px;
                }
                
                .note-textarea:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                .payment-select {
                    width: 100%;
                    padding: 0.625rem 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    background: white;
                    cursor: pointer;
                }
                
                .payment-select:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                /* Recipient tabs */
                .recipient-tabs {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                
                .recipient-tab {
                    flex: 1;
                    padding: 0.625rem 1rem;
                    border: 2px solid #e2e8f0;
                    background: white;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .recipient-tab:hover {
                    border-color: #cbd5e1;
                    color: #475569;
                }
                
                .recipient-tab.active {
                    border-color: #f97316;
                    background: #fff7ed;
                    color: #ea580c;
                }
                
                .recipient-content {
                    animation: fadeIn 0.2s ease;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .new-client-form {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .form-row-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                }
                
                .full-input {
                    width: 100%;
                    padding: 0.625rem 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                }
                
                .full-input:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
                
                .empty-leads-msg {
                    padding: 1rem;
                    background: #f8fafc;
                    border: 1px dashed #e2e8f0;
                    border-radius: 0.5rem;
                    text-align: center;
                    color: #64748b;
                }
                
                .empty-leads-msg p {
                    margin: 0 0 0.25rem 0;
                    font-weight: 500;
                }
                
                .empty-leads-msg small {
                    font-size: 0.75rem;
                }
                
                /* Summary card */
                .summary-card .card-body {
                    padding: 1rem 1.25rem;
                }
                
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.625rem 0;
                }
                
                .summary-label {
                    color: #64748b;
                    font-size: 0.875rem;
                }
                
                .summary-value {
                    font-weight: 600;
                    color: #334155;
                }
                
                .summary-value.discount {
                    color: #dc2626;
                }
                
                .summary-row.with-input {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 0.5rem;
                }
                
                .summary-label-with-input {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .input-with-suffix {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                
                .input-with-suffix input {
                    width: 60px;
                    padding: 0.375rem 0.5rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    text-align: right;
                    font-size: 0.875rem;
                }
                
                .input-with-suffix input:focus {
                    outline: none;
                    border-color: #f97316;
                }
                
                .input-with-suffix .suffix {
                    color: #94a3b8;
                    font-size: 0.875rem;
                }
                
                .summary-divider {
                    height: 1px;
                    background: #e2e8f0;
                    margin: 0.75rem 0;
                }
                
                .summary-row.total .summary-label {
                    font-size: 1rem;
                    font-weight: 600;
                    color: #0f172a;
                }
                
                .summary-row.total .summary-value {
                    font-size: 1.5rem;
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                
                /* Modal Footer */
                .invoice-modal-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.25rem 2rem;
                    background: white;
                    border-top: 1px solid #e2e8f0;
                }
                
                .footer-actions {
                    display: flex;
                    gap: 0.75rem;
                }
                
                .btn-cancel {
                    padding: 0.75rem 1.5rem;
                    background: transparent;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    font-size: 0.875rem;
                    font-weight: 500;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-cancel:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                }
                
                .btn-draft {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    color: #475569;
                    font-size: 0.875rem;
                    font-weight: 500;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-draft:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                }
                
                .btn-primary-action {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    border: none;
                    color: white;
                    font-size: 0.875rem;
                    font-weight: 600;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 14px 0 rgba(249, 115, 22, 0.39);
                }
                
                .btn-primary-action:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px 0 rgba(249, 115, 22, 0.5);
                }
                
                /* Dropdown */
                .dropdown {
                    position: relative;
                }
                
                .dropdown-menu {
                    display: none;
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 0.5rem;
                    z-index: 1000;
                }
                
                .dropdown.active .dropdown-menu {
                    display: block;
                }
                
                /* Modal Overlay */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    padding: 1rem;
                }
                
                /* Document Type Modal */
                .document-type-modal {
                    background: white;
                    border-radius: 20px;
                    width: 100%;
                    max-width: 500px;
                    overflow: hidden;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    animation: modalSlideIn 0.3s ease;
                }
                
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                
                .dtm-header {
                    padding: 1.5rem 2rem;
                    text-align: center;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .dtm-header h2 {
                    margin: 0 0 0.25rem;
                    font-size: 1.25rem;
                    color: #0f172a;
                }
                
                .dtm-header p {
                    margin: 0;
                    color: #64748b;
                    font-size: 0.9rem;
                }
                
                .dtm-options {
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .dtm-option {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border: 2px solid transparent;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }
                
                .dtm-option:hover {
                    background: white;
                    border-color: #f97316;
                    transform: translateX(4px);
                }
                
                .dtm-icon {
                    width: 56px;
                    height: 56px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                
                .dtm-text {
                    flex: 1;
                }
                
                .dtm-title {
                    display: block;
                    font-weight: 600;
                    font-size: 1rem;
                    color: #0f172a;
                    margin-bottom: 0.25rem;
                }
                
                .dtm-desc {
                    display: block;
                    font-size: 0.85rem;
                    color: #64748b;
                }
                
                .dtm-footer {
                    padding: 1rem 2rem 1.5rem;
                    text-align: center;
                }
                
                .dtm-cancel {
                    padding: 0.625rem 1.5rem;
                    background: transparent;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    font-size: 0.9rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                
                .dtm-cancel:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                }
                
                /* Standard Modal */
                .modal {
                    background: white;
                    border-radius: 16px;
                    width: 95%;
                    max-width: 700px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }
                
                .modal-large {
                    max-width: 900px;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .modal-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: #0f172a;
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
                    font-size: 1.25rem;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                
                .modal-close:hover {
                    background: #e2e8f0;
                    color: #334155;
                }
                
                .modal-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem;
                }
                
                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    background: #f8fafc;
                }
                
                .btn {
                    padding: 0.625rem 1.25rem;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                
                .btn-secondary {
                    background: white;
                    border: 1px solid #e2e8f0;
                    color: #475569;
                }
                
                .btn-secondary:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
                    border: none;
                    color: white;
                }
                
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
                }
            </style>
        `;
    }
};

// Export pre globálny prístup
window.BillingModule = BillingModule;
