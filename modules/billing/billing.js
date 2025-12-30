// =====================================================
// ADLIFY - Billing Module (Fakturácia)
// =====================================================

const BillingModule = {
    id: 'billing',
    name: 'Fakturácia',
    icon: '📄',
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

    async init() {
        console.log('BillingModule initialized');
    },

    async render(container, params = {}) {
        // Načítanie dát
        await this.loadData();
        
        container.innerHTML = `
            <div class="billing-module">
                <div class="module-header">
                    <h1>📄 Fakturácia</h1>
                    <div class="header-actions">
                        <button class="btn btn-secondary" onclick="BillingModule.showSettings()">
                            ⚙️ Nastavenia
                        </button>
                        <div class="dropdown">
                            <button class="btn btn-primary dropdown-toggle">
                                + Nový doklad
                            </button>
                            <div class="dropdown-menu">
                                <a href="#" onclick="BillingModule.createInvoice(); return false;">📄 Faktúra</a>
                                <a href="#" onclick="BillingModule.createProforma(); return false;">📋 Zálohová faktúra</a>
                                <a href="#" onclick="BillingModule.createQuote(); return false;">📝 Ponuka</a>
                                <a href="#" onclick="BillingModule.createOrder(); return false;">🛒 Objednávka</a>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="billing-tabs">
                    <button class="tab-btn ${this.currentTab === 'invoices' ? 'active' : ''}" 
                            onclick="BillingModule.switchTab('invoices')">
                        📄 Faktúry <span class="badge">${this.invoices.filter(i => i.invoice_type === 'invoice').length}</span>
                    </button>
                    <button class="tab-btn ${this.currentTab === 'proforma' ? 'active' : ''}" 
                            onclick="BillingModule.switchTab('proforma')">
                        📋 Zálohové <span class="badge">${this.invoices.filter(i => i.invoice_type === 'proforma').length}</span>
                    </button>
                    <button class="tab-btn ${this.currentTab === 'quotes' ? 'active' : ''}" 
                            onclick="BillingModule.switchTab('quotes')">
                        📝 Ponuky <span class="badge">${this.quotes.length}</span>
                    </button>
                    <button class="tab-btn ${this.currentTab === 'orders' ? 'active' : ''}" 
                            onclick="BillingModule.switchTab('orders')">
                        🛒 Objednávky <span class="badge">${this.orders.length}</span>
                    </button>
                    <button class="tab-btn ${this.currentTab === 'payments' ? 'active' : ''}" 
                            onclick="BillingModule.switchTab('payments')">
                        💰 Platby
                    </button>
                </div>
                
                <!-- Stats -->
                <div class="billing-stats">
                    ${this.renderStats()}
                </div>
                
                <!-- Content -->
                <div class="billing-content" id="billing-content">
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
            // Paralelné načítanie
            const [invoicesRes, quotesRes, ordersRes, clientsRes, servicesRes, settingsRes] = await Promise.all([
                Database.client.from('invoices_overview').select('*').order('created_at', { ascending: false }),
                Database.client.from('quotes_overview').select('*').order('created_at', { ascending: false }),
                Database.client.from('orders').select('*, clients(company_name)').order('created_at', { ascending: false }),
                Database.client.from('clients').select('id, company_name, email, phone, address, city, zip, ico, dic, ic_dph'),
                Database.client.from('services').select('id, name, base_price, category'),
                Database.client.from('billing_settings').select('*').single()
            ]);
            
            this.invoices = invoicesRes.data || [];
            this.quotes = quotesRes.data || [];
            this.orders = ordersRes.data || [];
            this.clients = clientsRes.data || [];
            this.services = servicesRes.data || [];
            this.settings = settingsRes.data || {};
            
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
            <div class="stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-info">
                    <div class="stat-value">${this.formatMoney(totalUnpaid)}</div>
                    <div class="stat-label">Neuhradené (${unpaid.length})</div>
                </div>
            </div>
            <div class="stat-card ${overdue.length > 0 ? 'stat-warning' : ''}">
                <div class="stat-icon">⚠️</div>
                <div class="stat-info">
                    <div class="stat-value">${this.formatMoney(totalOverdue)}</div>
                    <div class="stat-label">Po splatnosti (${overdue.length})</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📅</div>
                <div class="stat-info">
                    <div class="stat-value">${this.formatMoney(totalThisMonth)}</div>
                    <div class="stat-label">Tento mesiac (${thisMonth.length})</div>
                </div>
            </div>
            <div class="stat-card stat-success">
                <div class="stat-icon">✅</div>
                <div class="stat-info">
                    <div class="stat-value">${this.formatMoney(paidThisMonth)}</div>
                    <div class="stat-label">Uhradené tento mesiac</div>
                </div>
            </div>
        `;
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.billing-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.billing-tabs .tab-btn:nth-child(${
            tab === 'invoices' ? 1 : tab === 'proforma' ? 2 : tab === 'quotes' ? 3 : tab === 'orders' ? 4 : 5
        })`).classList.add('active');
        document.getElementById('billing-content').innerHTML = this.renderTabContent();
    },

    renderTabContent() {
        switch (this.currentTab) {
            case 'invoices':
                return this.renderInvoicesTable('invoice');
            case 'proforma':
                return this.renderInvoicesTable('proforma');
            case 'quotes':
                return this.renderQuotesTable();
            case 'orders':
                return this.renderOrdersTable();
            case 'payments':
                return this.renderPaymentsTab();
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
                    <div class="empty-icon">${type === 'invoice' ? '📄' : '📋'}</div>
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
                                        <button class="btn-icon" title="Detail" onclick="BillingModule.showInvoiceDetail('${inv.id}')">👁️</button>
                                        <button class="btn-icon" title="PDF" onclick="BillingModule.downloadPDF('${inv.id}')">📥</button>
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
                    <div class="empty-icon">📝</div>
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
                                        <span class="client-name">${q.company_name || q.contact_name || '-'}</span>
                                    </div>
                                </td>
                                <td>${q.title || '-'}</td>
                                <td>${this.formatDate(q.issue_date)}</td>
                                <td>${q.valid_until ? this.formatDate(q.valid_until) : '-'}</td>
                                <td><strong>${this.formatMoney(q.total)}</strong></td>
                                <td>${this.renderQuoteStatus(q.status)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon" title="Detail" onclick="BillingModule.showQuoteDetail('${q.id}')">👁️</button>
                                        <button class="btn-icon" title="PDF" onclick="BillingModule.downloadQuotePDF('${q.id}')">📥</button>
                                        ${q.status === 'accepted' ? `
                                            <button class="btn-icon" title="Vytvoriť faktúru" onclick="BillingModule.createInvoiceFromQuote('${q.id}')">📄</button>
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
                    <div class="empty-icon">🛒</div>
                    <h3>Žiadne objednávky</h3>
                    <p>Objednávky sa vytvárajú z akceptovaných ponúk</p>
                </div>
            `;
        }
        
        return `
            <div class="table-container">
                <table class="data-table" id="orders-table">
                    <thead>
                        <tr>
                            <th>Číslo</th>
                            <th>Klient</th>
                            <th>Dátum</th>
                            <th>Suma</th>
                            <th>Stav</th>
                            <th>Akcie</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.orders.map(o => `
                            <tr data-status="${o.status}">
                                <td><strong>${o.order_number}</strong></td>
                                <td>${o.clients?.company_name || '-'}</td>
                                <td>${this.formatDate(o.order_date)}</td>
                                <td><strong>${this.formatMoney(o.total)}</strong></td>
                                <td>${this.renderOrderStatus(o.status)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-icon" title="Vytvoriť faktúru" onclick="BillingModule.createInvoiceFromOrder('${o.id}')">📄</button>
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
                <h3>💰 Prehľad platieb</h3>
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
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>📄 Nová faktúra</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="invoice-form">
                        <!-- Klient -->
                        <div class="form-section">
                            <h3>Klient</h3>
                            <div class="form-row">
                                <div class="form-group flex-2">
                                    <label>Vybrať klienta *</label>
                                    <select name="client_id" required onchange="BillingModule.onClientSelect(this.value)">
                                        <option value="">-- Vyberte klienta --</option>
                                        ${this.clients.map(c => `
                                            <option value="${c.id}">${c.company_name} ${c.ico ? `(IČO: ${c.ico})` : ''}</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                            <div id="client-details" class="client-preview" style="display: none;"></div>
                        </div>
                        
                        <!-- Dátumy -->
                        <div class="form-section">
                            <h3>Dátumy</h3>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Dátum vystavenia</label>
                                    <input type="date" name="issue_date" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="form-group">
                                    <label>Dátum dodania</label>
                                    <input type="date" name="delivery_date" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="form-group">
                                    <label>Splatnosť</label>
                                    <input type="date" name="due_date" value="${this.addDays(new Date(), this.settings?.default_due_days || 14).toISOString().split('T')[0]}">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Položky -->
                        <div class="form-section">
                            <h3>Položky</h3>
                            <div id="invoice-items">
                                ${this.renderItemRow(0)}
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="BillingModule.addItemRow()">
                                + Pridať položku
                            </button>
                            
                            <!-- Rýchle pridanie služby -->
                            <div class="quick-add-service">
                                <select id="quick-service" onchange="BillingModule.addServiceItem(this.value)">
                                    <option value="">+ Pridať službu z katalógu</option>
                                    ${this.services.map(s => `
                                        <option value="${s.id}">${s.name} - ${this.formatMoney(s.base_price)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <!-- Súhrn -->
                        <div class="form-section">
                            <div class="invoice-summary">
                                <div class="summary-row">
                                    <span>Medzisúčet:</span>
                                    <span id="subtotal">0,00 €</span>
                                </div>
                                <div class="summary-row">
                                    <span>
                                        Zľava: 
                                        <input type="number" name="discount_percent" value="0" min="0" max="100" 
                                               style="width: 60px;" onchange="BillingModule.recalculateTotals()"> %
                                    </span>
                                    <span id="discount-amount">0,00 €</span>
                                </div>
                                <div class="summary-row">
                                    <span>
                                        DPH:
                                        <input type="number" name="vat_rate" value="${this.settings?.default_vat_rate || 20}" 
                                               style="width: 60px;" onchange="BillingModule.recalculateTotals()"> %
                                    </span>
                                    <span id="vat-amount">0,00 €</span>
                                </div>
                                <div class="summary-row summary-total">
                                    <span>Celkom:</span>
                                    <span id="total">0,00 €</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Poznámky -->
                        <div class="form-section">
                            <div class="form-group">
                                <label>Poznámka na faktúru</label>
                                <textarea name="notes" rows="2" placeholder="Poznámka pre klienta...">${this.settings?.invoice_footer || ''}</textarea>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn btn-secondary" onclick="BillingModule.saveInvoice('draft')">Uložiť ako koncept</button>
                    <button class="btn btn-primary" onclick="BillingModule.saveInvoice('issued')">Vystaviť faktúru</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.itemRowIndex = 0;
    },

    async createProforma() {
        // Podobné ako createInvoice, len s typom 'proforma'
        await this.createInvoice();
        // Zmeniť titulok
        document.querySelector('.modal h2').textContent = '📋 Nová zálohová faktúra';
    },

    async createQuote() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>📝 Nová ponuka</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="quote-form">
                        <!-- Klient alebo Lead -->
                        <div class="form-section">
                            <h3>Príjemca</h3>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Typ</label>
                                    <select name="recipient_type" onchange="BillingModule.toggleRecipientType(this.value)">
                                        <option value="client">Existujúci klient</option>
                                        <option value="lead">Lead</option>
                                    </select>
                                </div>
                                <div class="form-group flex-2" id="recipient-select">
                                    <label>Klient</label>
                                    <select name="client_id">
                                        <option value="">-- Vyberte --</option>
                                        ${this.clients.map(c => `
                                            <option value="${c.id}">${c.company_name}</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Detaily ponuky -->
                        <div class="form-section">
                            <h3>Detaily ponuky</h3>
                            <div class="form-row">
                                <div class="form-group flex-2">
                                    <label>Názov ponuky</label>
                                    <input type="text" name="title" placeholder="Napr. Marketingová stratégia 2025">
                                </div>
                                <div class="form-group">
                                    <label>Platnosť do</label>
                                    <input type="date" name="valid_until" value="${this.addDays(new Date(), 30).toISOString().split('T')[0]}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Úvodný text</label>
                                <textarea name="introduction" rows="3" placeholder="Ďakujeme za Váš záujem..."></textarea>
                            </div>
                        </div>
                        
                        <!-- Položky -->
                        <div class="form-section">
                            <h3>Položky</h3>
                            <div id="quote-items">
                                ${this.renderItemRow(0, 'quote')}
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="BillingModule.addItemRow('quote')">
                                + Pridať položku
                            </button>
                        </div>
                        
                        <!-- Súhrn -->
                        <div class="form-section">
                            <div class="invoice-summary">
                                <div class="summary-row">
                                    <span>Medzisúčet:</span>
                                    <span id="subtotal">0,00 €</span>
                                </div>
                                <div class="summary-row">
                                    <span>DPH (${this.settings?.default_vat_rate || 20}%):</span>
                                    <span id="vat-amount">0,00 €</span>
                                </div>
                                <div class="summary-row summary-total">
                                    <span>Celkom:</span>
                                    <span id="total">0,00 €</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Podmienky -->
                        <div class="form-section">
                            <div class="form-group">
                                <label>Obchodné podmienky</label>
                                <textarea name="terms" rows="3" placeholder="Platobné podmienky, dodacie lehoty..."></textarea>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn btn-secondary" onclick="BillingModule.saveQuote('draft')">Uložiť koncept</button>
                    <button class="btn btn-primary" onclick="BillingModule.saveQuote('sent')">Odoslať ponuku</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.itemRowIndex = 0;
    },

    async createOrder() {
        alert('Objednávky sa väčšinou vytvárajú automaticky z akceptovaných ponúk.');
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
                    <button type="button" class="btn-icon btn-remove" onclick="BillingModule.removeItemRow(${index})">🗑️</button>
                </div>
            </div>
        `;
    },

    addItemRow(type = 'invoice') {
        this.itemRowIndex++;
        const container = document.getElementById(type === 'invoice' ? 'invoice-items' : 'quote-items');
        const div = document.createElement('div');
        div.innerHTML = this.renderItemRow(this.itemRowIndex, type);
        container.appendChild(div.firstElementChild);
    },

    removeItemRow(index) {
        const row = document.querySelector(`.item-row[data-index="${index}"]`);
        if (row && document.querySelectorAll('.item-row').length > 1) {
            row.remove();
            this.recalculateTotals();
        }
    },

    addServiceItem(serviceId) {
        if (!serviceId) return;
        
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;
        
        this.addItemRow('invoice');
        
        const lastRow = document.querySelector('.item-row:last-child');
        lastRow.querySelector('input[name*="[description]"]').value = service.name;
        lastRow.querySelector('input[name*="[unit_price]"]').value = service.base_price;
        lastRow.querySelector('select[name*="[unit]"]').value = 'mes';
        
        this.recalculateRow(this.itemRowIndex);
        
        // Reset select
        document.getElementById('quick-service').value = '';
    },

    recalculateRow(index) {
        const row = document.querySelector(`.item-row[data-index="${index}"]`);
        if (!row) return;
        
        const qty = parseFloat(row.querySelector('input[name*="[quantity]"]').value) || 0;
        const price = parseFloat(row.querySelector('input[name*="[unit_price]"]').value) || 0;
        const total = qty * price;
        
        document.getElementById(`item-total-${index}`).textContent = this.formatMoney(total);
        this.recalculateTotals();
    },

    recalculateTotals() {
        let subtotal = 0;
        
        document.querySelectorAll('.item-row').forEach(row => {
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
        const client = this.clients.find(c => c.id === clientId);
        const detailsDiv = document.getElementById('client-details');
        
        if (client) {
            detailsDiv.innerHTML = `
                <div class="client-info-preview">
                    <strong>${client.company_name}</strong><br>
                    ${client.address ? client.address + '<br>' : ''}
                    ${client.zip ? client.zip + ' ' : ''}${client.city || ''}<br>
                    ${client.ico ? 'IČO: ' + client.ico + '<br>' : ''}
                    ${client.dic ? 'DIČ: ' + client.dic + '<br>' : ''}
                    ${client.ic_dph ? 'IČ DPH: ' + client.ic_dph : ''}
                </div>
            `;
            detailsDiv.style.display = 'block';
        } else {
            detailsDiv.style.display = 'none';
        }
    },

    async saveInvoice(status) {
        const form = document.getElementById('invoice-form');
        const formData = new FormData(form);
        
        const clientId = formData.get('client_id');
        if (!clientId) {
            alert('Vyberte klienta');
            return;
        }
        
        // Zozbierať položky
        const items = [];
        document.querySelectorAll('.item-row').forEach(row => {
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
        
        try {
            // Získať číslo faktúry
            const { data: numberData, error: numberError } = await supabase
                .rpc('get_next_number', { p_sequence_type: 'invoice' });
            
            if (numberError) throw numberError;
            
            // Vytvoriť faktúru
            const { data: invoice, error: invoiceError } = await supabase
                .from('invoices')
                .insert({
                    invoice_number: numberData,
                    client_id: clientId,
                    invoice_type: 'invoice',
                    issue_date: formData.get('issue_date'),
                    delivery_date: formData.get('delivery_date'),
                    due_date: formData.get('due_date'),
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
            
            const { error: itemsError } = await supabase
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
        document.querySelectorAll('.item-row').forEach(row => {
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
        
        const subtotal = items.reduce((sum, i) => sum + i.total, 0);
        const vatRate = this.settings?.default_vat_rate || 20;
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;
        
        try {
            // Získať číslo ponuky
            const { data: numberData } = await supabase
                .rpc('get_next_number', { p_sequence_type: 'quote' });
            
            // Vytvoriť ponuku
            const { data: quote, error } = await supabase
                .from('quotes')
                .insert({
                    quote_number: numberData,
                    client_id: formData.get('client_id') || null,
                    title: formData.get('title'),
                    introduction: formData.get('introduction'),
                    terms: formData.get('terms'),
                    valid_until: formData.get('valid_until'),
                    status: status,
                    subtotal: subtotal,
                    vat_rate: vatRate,
                    vat_amount: vatAmount,
                    total: total,
                    sent_at: status === 'sent' ? new Date().toISOString() : null
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

    async showInvoiceDetail(invoiceId) {
        const invoice = this.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        // Načítať položky
        const { data: items } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('sort_order');
        
        // Načítať platby
        const { data: payments } = await supabase
            .from('payments')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('payment_date', { ascending: false });
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>📄 Faktúra ${invoice.invoice_number}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <!-- Status bar -->
                    <div class="invoice-status-bar">
                        ${this.renderInvoiceStatus(invoice.computed_status || invoice.status)}
                        ${invoice.computed_status === 'overdue' ? 
                            `<span class="overdue-info">⚠️ ${Math.abs(invoice.days_until_due)} dní po splatnosti</span>` : ''}
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
                            <h4>💰 Prijaté platby</h4>
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
                    <button class="btn btn-secondary" onclick="BillingModule.downloadPDF('${invoiceId}')">📥 Stiahnuť PDF</button>
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
        
        const { data: items } = await supabase
            .from('quote_items')
            .select('*')
            .eq('quote_id', quoteId)
            .order('sort_order');
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>📝 Ponuka ${quote.quote_number}</h2>
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
                        <button class="btn btn-danger" onclick="BillingModule.updateQuoteStatus('${quoteId}', 'rejected')">❌ Odmietnutá</button>
                        <button class="btn btn-success" onclick="BillingModule.updateQuoteStatus('${quoteId}', 'accepted')">✅ Akceptovaná</button>
                    ` : ''}
                    ${quote.status === 'accepted' ? `
                        <button class="btn btn-primary" onclick="BillingModule.createInvoiceFromQuote('${quoteId}')">📄 Vytvoriť faktúru</button>
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
            const { error } = await supabase
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
            
            const { error } = await supabase
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

    async createInvoiceFromQuote(quoteId) {
        alert('Táto funkcia bude čoskoro implementovaná - vytvorí faktúru s položkami z ponuky.');
    },

    async showSettings() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-large">
                <div class="modal-header">
                    <h2>⚙️ Nastavenia fakturácie</h2>
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
                await supabase
                    .from('billing_settings')
                    .update(data)
                    .eq('id', this.settings.id);
            } else {
                await supabase
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
        alert('PDF generovanie bude implementované - zatiaľ nie je k dispozícii.');
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
                .billing-module { padding: 0; }
                
                .billing-tabs {
                    display: flex;
                    gap: 0;
                    border-bottom: 2px solid var(--border-color);
                    margin-bottom: 1.5rem;
                }
                
                .billing-tabs .tab-btn {
                    padding: 0.75rem 1.5rem;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 0.95rem;
                    color: var(--text-secondary);
                    border-bottom: 2px solid transparent;
                    margin-bottom: -2px;
                    transition: all 0.2s;
                }
                
                .billing-tabs .tab-btn:hover {
                    color: var(--text-primary);
                    background: rgba(0,0,0,0.02);
                }
                
                .billing-tabs .tab-btn.active {
                    color: var(--primary-color);
                    border-bottom-color: var(--primary-color);
                }
                
                .billing-tabs .badge {
                    background: var(--bg-secondary);
                    padding: 0.1rem 0.5rem;
                    border-radius: 10px;
                    font-size: 0.8rem;
                    margin-left: 0.5rem;
                }
                
                .billing-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                .stat-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1rem 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                }
                
                .stat-card.stat-warning { border-left: 4px solid #f59e0b; }
                .stat-card.stat-success { border-left: 4px solid #10b981; }
                
                .stat-icon { font-size: 1.5rem; }
                .stat-value { font-size: 1.25rem; font-weight: 600; }
                .stat-label { color: var(--text-secondary); font-size: 0.85rem; }
                
                .table-filters {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                
                .filter-search, .filter-select {
                    padding: 0.5rem 1rem;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    font-size: 0.9rem;
                }
                
                .filter-search { flex: 1; max-width: 300px; }
                
                .row-warning { background: #fef3c7 !important; }
                .overdue-badge {
                    background: #fee2e2;
                    color: #dc2626;
                    padding: 0.1rem 0.4rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    margin-left: 0.5rem;
                }
                
                .status-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                
                .status-gray { background: #f3f4f6; color: #6b7280; }
                .status-blue { background: #dbeafe; color: #2563eb; }
                .status-green { background: #d1fae5; color: #059669; }
                .status-orange { background: #fed7aa; color: #c2410c; }
                .status-red { background: #fee2e2; color: #dc2626; }
                .status-purple { background: #ede9fe; color: #7c3aed; }
                
                .action-buttons {
                    display: flex;
                    gap: 0.25rem;
                }
                
                .btn-icon {
                    padding: 0.3rem;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-radius: 4px;
                }
                
                .btn-icon:hover { background: var(--bg-secondary); }
                
                .dropdown { position: relative; }
                .dropdown-menu {
                    display: none;
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    min-width: 180px;
                    z-index: 100;
                    padding: 0.5rem 0;
                }
                .dropdown-menu.show { display: block; }
                .dropdown-menu a {
                    display: block;
                    padding: 0.5rem 1rem;
                    color: var(--text-primary);
                    text-decoration: none;
                }
                .dropdown-menu a:hover { background: var(--bg-secondary); }
                
                .empty-state {
                    text-align: center;
                    padding: 3rem;
                    color: var(--text-secondary);
                }
                .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
                
                /* Modal form styles */
                .form-section {
                    margin-bottom: 1.5rem;
                    padding-bottom: 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                }
                
                .form-section:last-child { border-bottom: none; }
                .form-section h3 { margin-bottom: 1rem; font-size: 1rem; }
                
                .form-row {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 0.75rem;
                }
                
                .form-group { flex: 1; }
                .form-group.flex-2 { flex: 2; }
                .form-group.flex-3 { flex: 3; }
                
                .form-group label {
                    display: block;
                    margin-bottom: 0.25rem;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                
                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    font-size: 0.9rem;
                }
                
                .item-row {
                    background: var(--bg-secondary);
                    padding: 0.75rem;
                    border-radius: 8px;
                    margin-bottom: 0.5rem;
                }
                
                .item-fields {
                    display: flex;
                    gap: 0.5rem;
                    align-items: center;
                }
                
                .item-fields .form-group { margin-bottom: 0; }
                .item-total { 
                    min-width: 100px; 
                    text-align: right; 
                    font-weight: 600;
                }
                
                .btn-remove {
                    color: #dc2626;
                }
                
                .quick-add-service {
                    margin-top: 1rem;
                }
                
                .quick-add-service select {
                    padding: 0.5rem;
                    border: 1px dashed var(--border-color);
                    border-radius: 6px;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                }
                
                .invoice-summary {
                    background: var(--bg-secondary);
                    padding: 1rem;
                    border-radius: 8px;
                    max-width: 300px;
                    margin-left: auto;
                }
                
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                }
                
                .summary-total {
                    border-top: 2px solid var(--border-color);
                    margin-top: 0.5rem;
                    padding-top: 0.75rem;
                    font-size: 1.1rem;
                    font-weight: 600;
                }
                
                .client-preview {
                    background: var(--bg-secondary);
                    padding: 1rem;
                    border-radius: 8px;
                    margin-top: 0.75rem;
                }
                
                /* Invoice detail */
                .invoice-status-bar {
                    margin-bottom: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .overdue-info {
                    color: #dc2626;
                    font-weight: 500;
                }
                
                .invoice-header-detail {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 2rem;
                    margin-bottom: 1.5rem;
                }
                
                .invoice-items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 1.5rem;
                }
                
                .invoice-items-table th,
                .invoice-items-table td {
                    padding: 0.75rem;
                    text-align: left;
                    border-bottom: 1px solid var(--border-color);
                }
                
                .invoice-items-table th {
                    background: var(--bg-secondary);
                    font-weight: 500;
                }
                
                .invoice-totals {
                    max-width: 300px;
                    margin-left: auto;
                }
                
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                }
                
                .total-final {
                    font-size: 1.2rem;
                    font-weight: 600;
                    border-top: 2px solid var(--text-primary);
                    margin-top: 0.5rem;
                    padding-top: 0.75rem;
                }
                
                .total-row.paid { color: #059669; }
                .total-row.remaining { color: #dc2626; font-weight: 500; }
                
                .invoice-payments {
                    margin-top: 2rem;
                    padding-top: 1.5rem;
                    border-top: 1px solid var(--border-color);
                }
                
                .payments-table {
                    width: 100%;
                    font-size: 0.9rem;
                }
                
                .payments-table th,
                .payments-table td {
                    padding: 0.5rem;
                    text-align: left;
                }
                
                .invoice-notes {
                    margin-top: 1.5rem;
                    padding: 1rem;
                    background: #fef3c7;
                    border-radius: 8px;
                }
                
                .coming-soon {
                    text-align: center;
                    padding: 3rem;
                    color: var(--text-secondary);
                }
                
                .coming-soon span { font-size: 2rem; }
                
                .modal-large {
                    max-width: 900px;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                
                .btn-sm { 
                    padding: 0.35rem 0.75rem; 
                    font-size: 0.85rem; 
                }
            </style>
        `;
    }
};

// Export pre globálny prístup
window.BillingModule = BillingModule;
