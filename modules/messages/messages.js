// =====================================================
// ADLIFY - Messages Module v3.0
// Moderný dizajn s modálmi, brand farbami, rozšíreným editorom
// =====================================================

const MessagesModule = {
    id: 'messages',
    name: 'Správy',
    icon: '📧',
    title: 'Správy',
    menu: { section: 'main', order: 3 },
    permissions: ['owner', 'admin', 'user'],
    
    // State
    emails: [],
    accounts: [],
    signatures: [],
    brandSettings: {},
    selectedAccountId: null,
    selectedFolder: 'INBOX',
    selectedEmail: null,
    isLoading: false,
    isSyncing: false,
    searchQuery: '',
    
    // Modals
    composeModalOpen: false,
    detailModalOpen: false,
    quillEditor: null,
    usedEmails: [],
    pendingBodyContent: '',
    
    // Pagination
    page: 1,
    perPage: 20,
    totalCount: 0,
    
    // Folders
    folders: [
        { id: 'INBOX', name: 'Doručené', icon: '📥', color: '#3b82f6' },
        { id: 'Sent', name: 'Odoslané', icon: '📤', color: '#10b981' },
        { id: 'Drafts', name: 'Koncepty', icon: '📝', color: '#f59e0b' },
        { id: 'Trash', name: 'Kôš', icon: '🗑️', color: '#ef4444' }
    ],
    
    // ===========================================
    // LIFECYCLE
    // ===========================================
    
    // Auto-refresh
    _refreshTimer: null,
    _refreshInterval: 60000, // 60s
    
    async render(container) {
        this.container = container;
        
        // Obnoviť stav z localStorage
        this._restoreState();
        
        // Load brand settings first
        await this.loadBrandSettings();
        
        container.innerHTML = `
            <div class="messages-module" id="messages-module">
                ${this.renderLayout()}
            </div>
            <div id="compose-modal-container"></div>
            <div id="detail-modal-container"></div>
            <div id="link-modal-container"></div>
            ${this.getStyles()}
        `;
        
        await this.loadQuillEditor();
        await this.loadData();
        
        // Spustiť auto-refresh
        this._startAutoRefresh();
    },
    
    destroy() {
        this._stopAutoRefresh();
    },
    
    _startAutoRefresh() {
        this._stopAutoRefresh();
        this._refreshTimer = setInterval(() => this._silentRefresh(), this._refreshInterval);
    },
    
    _stopAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    },
    
    async _silentRefresh() {
        // Tichý refresh — bez toastov, len aktualizuj zoznam a badges
        if (this.isSyncing || this.detailModalOpen || this.composeModalOpen) return;
        
        try {
            await this.loadEmails();
        } catch(e) {
            // Ticho ignoruj chyby pri auto-refresh
        }
    },
    
    _saveState() {
        try {
            localStorage.setItem('adlify_msg_account', this.selectedAccountId || '');
            localStorage.setItem('adlify_msg_folder', this.selectedFolder || 'INBOX');
            localStorage.setItem('adlify_msg_page', String(this.page || 1));
        } catch(e) {}
    },
    
    _restoreState() {
        try {
            const acc = localStorage.getItem('adlify_msg_account');
            const folder = localStorage.getItem('adlify_msg_folder');
            const page = localStorage.getItem('adlify_msg_page');
            
            if (acc) this.selectedAccountId = acc;
            const validFolders = this.folders.map(f => f.id);
            if (folder && validFolders.includes(folder)) this.selectedFolder = folder;
            if (page) this.page = parseInt(page) || 1;
        } catch(e) {}
    },
    
    async loadBrandSettings() {
        try {
            const { data } = await Database.client
                .from('settings')
                .select('key, value')
                .in('key', ['brand_primary_color', 'brand_secondary_color', 'brand_gradient', 'brand_logo_url', 'brand_company_name']);
            
            if (data) {
                data.forEach(s => {
                    this.brandSettings[s.key] = s.value;
                });
            }
            
            // Defaults
            this.brandSettings.brand_primary_color = this.brandSettings.brand_primary_color || '#f97316';
            this.brandSettings.brand_secondary_color = this.brandSettings.brand_secondary_color || '#ea580c';
            this.brandSettings.brand_gradient = this.brandSettings.brand_gradient || 'linear-gradient(135deg, #f97316, #ea580c)';
            
        } catch (err) {
            console.error('Error loading brand settings:', err);
            this.brandSettings = {
                brand_primary_color: '#f97316',
                brand_secondary_color: '#ea580c',
                brand_gradient: 'linear-gradient(135deg, #f97316, #ea580c)'
            };
        }
    },
    
    async loadQuillEditor() {
        if (window.Quill) return;
        
        // CSS
        if (!document.querySelector('link[href*="quill"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
            document.head.appendChild(link);
        }
        
        // JS
        return new Promise(resolve => {
            const script = document.createElement('script');
            script.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    },
    
    async loadData() {
        this.isLoading = true;
        
        await Promise.all([
            this.loadAccounts(),
            this.loadSignatures()
        ]);
        
        this.renderSidebar();
        await this.loadEmails();
    },
    
    // ===========================================
    // DATA LOADING
    // ===========================================
    
    async loadAccounts() {
        try {
            const { data, error } = await Database.client
                .from('email_accounts')
                .select('*')
                .eq('is_active', true)
                .order('is_default', { ascending: false })
                .order('name');
            
            if (error) throw error;
            this.accounts = data || [];
            
            // Validuj uložený account - ak neexistuje, vyber default
            if (this.selectedAccountId && !this.accounts.find(a => a.id === this.selectedAccountId)) {
                this.selectedAccountId = null;
            }
            
            if (!this.selectedAccountId && this.accounts.length > 0) {
                const defaultAcc = this.accounts.find(a => a.is_default);
                this.selectedAccountId = defaultAcc?.id || this.accounts[0].id;
                this._saveState();
            }
            
        } catch (err) {
            console.error('Error loading accounts:', err);
        }
    },
    
    async loadSignatures() {
        try {
            const { data: { user } } = await Database.client.auth.getUser();
            if (!user) return;
            
            const { data, error } = await Database.client
                .from('email_signatures')
                .select('*')
                .eq('user_id', user.id)
                .order('is_default', { ascending: false });
            
            if (error) throw error;
            this.signatures = data || [];
            
        } catch (err) {
            console.error('Error loading signatures:', err);
        }
    },
    
    async loadEmails() {
        const listEl = document.getElementById('messages-list');
        if (listEl) {
            listEl.innerHTML = this.renderLoadingState();
        }
        
        try {
            let query = Database.client
                .from('emails')
                .select('*', { count: 'exact' })
                .eq('folder', this.selectedFolder)
                .eq('is_deleted', false)
                .order('date', { ascending: false })
                .range((this.page - 1) * this.perPage, this.page * this.perPage - 1);
            
            if (this.selectedAccountId) {
                query = query.eq('account_id', this.selectedAccountId);
            } else if (this.accounts.length > 0) {
                query = query.in('account_id', this.accounts.map(a => a.id));
            }
            
            if (this.searchQuery) {
                query = query.or(`subject.ilike.%${this.searchQuery}%,from_address.ilike.%${this.searchQuery}%,from_name.ilike.%${this.searchQuery}%`);
            }
            
            const { data, error, count } = await query;
            
            if (error) throw error;
            
            this.emails = data || [];
            this.totalCount = count || 0;
            
            this.renderEmailList();
            this.updateUnreadBadges();
            
        } catch (err) {
            console.error('Error loading emails:', err);
            if (listEl) {
                listEl.innerHTML = this.renderErrorState(err.message);
            }
        }
        
        this.isLoading = false;
    },
    
    async updateUnreadBadges() {
        try {
            for (const folder of this.folders) {
                let unreadQuery = Database.client
                    .from('emails')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_read', false)
                    .eq('is_deleted', false)
                    .eq('folder', folder.id);
                
                let totalQuery = Database.client
                    .from('emails')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_deleted', false)
                    .eq('folder', folder.id);
                
                if (this.selectedAccountId) {
                    unreadQuery = unreadQuery.eq('account_id', this.selectedAccountId);
                    totalQuery = totalQuery.eq('account_id', this.selectedAccountId);
                }
                
                const [unreadResult, totalResult] = await Promise.all([unreadQuery, totalQuery]);
                
                const unreadCount = unreadResult.count || 0;
                const totalCount = totalResult.count || 0;
                
                const badge = document.getElementById(`badge-${folder.id}`);
                const totalBadge = document.getElementById(`total-${folder.id}`);
                
                if (badge) {
                    badge.textContent = unreadCount || '';
                    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
                }
                
                if (totalBadge) {
                    totalBadge.textContent = totalCount;
                }
            }
        } catch (err) {
            console.error('Error updating badges:', err);
        }
    },
    
    // ===========================================
    // SYNC
    // ===========================================
    
    async syncEmails() {
        if (this.isSyncing) return;
        
        this.isSyncing = true;
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = `<span class="btn-spinner"></span>`;
        }
        
        try {
            const accountsToSync = this.selectedAccountId
                ? [this.accounts.find(a => a.id === this.selectedAccountId)]
                : this.accounts;
            
            for (const account of accountsToSync) {
                if (!account) continue;
                
                Utils.toast(`Synchronizujem ${account.email}...`, 'info');
                
                const response = await fetch('/.netlify/functions/email-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: account.id,
                        folder: 'ALL',
                        limit: 100
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    Utils.toast(`${account.email}: ${data.new || 0} nových správ`, 'success');
                } else {
                    Utils.toast(`${account.email}: ${data.error || 'Chyba'}`, 'error');
                }
            }
            
            await this.loadEmails();
            await this.loadAccounts();
            this.renderSidebar();
            
        } catch (err) {
            console.error('Sync failed:', err);
            Utils.toast('Synchronizácia zlyhala', 'error');
        } finally {
            this.isSyncing = false;
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
            }
        }
    },
    
    // ===========================================
    // RENDER LAYOUT
    // ===========================================
    
    renderLayout() {
        return `
            <div class="msg-container">
                <div class="msg-sidebar" id="messages-sidebar">
                    ${this.renderSidebarSkeleton()}
                </div>
                <div class="msg-main">
                    <div class="msg-header">
                        ${this.renderHeader()}
                    </div>
                    <div class="msg-list" id="messages-list">
                        ${this.renderLoadingState()}
                    </div>
                </div>
            </div>
        `;
    },
    
    renderHeader() {
        return `
            <div class="msg-header-left">
                <div class="msg-search">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" id="email-search" placeholder="Hľadať v správach..." 
                           onkeyup="MessagesModule.handleSearch(event)" value="${this.searchQuery}">
                </div>
            </div>
            <div class="msg-header-right">
                <button id="sync-btn" onclick="MessagesModule.syncEmails()" class="btn-icon" title="Synchronizovať">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                    </svg>
                </button>
                <button onclick="MessagesModule.openComposeModal()" class="btn-primary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>Nový email</span>
                </button>
            </div>
        `;
    },
    
    renderSidebarSkeleton() {
        return `<div class="sidebar-loading"><div class="skeleton-item"></div><div class="skeleton-item"></div><div class="skeleton-item"></div></div>`;
    },
    
    renderSidebar() {
        const sidebarEl = document.getElementById('messages-sidebar');
        if (!sidebarEl) return;
        
        sidebarEl.innerHTML = `
            <div class="sidebar-header">
                <h2>📧 Správy</h2>
            </div>
            
            <div class="sidebar-folders">
                ${this.folders.map(f => `
                    <button class="folder-btn ${this.selectedFolder === f.id ? 'active' : ''}"
                            onclick="MessagesModule.selectFolder('${f.id}')"
                            style="--folder-color: ${f.color}">
                        <span class="folder-icon">${f.icon}</span>
                        <span class="folder-name">${f.name}</span>
                        <span class="folder-total" id="total-${f.id}">0</span>
                        <span class="folder-badge" id="badge-${f.id}"></span>
                    </button>
                `).join('')}
            </div>
            
            <div class="sidebar-divider"></div>
            
            <div class="sidebar-section">
                <div class="section-header">
                    <span>Schránky</span>
                    <button onclick="Router.navigate('settings')" class="btn-tiny" title="Nastavenia">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                        </svg>
                    </button>
                </div>
                <div class="accounts-list">
                    ${this.accounts.map(acc => `
                        <div class="account-item ${this.selectedAccountId === acc.id ? 'active' : ''}"
                             onclick="MessagesModule.selectAccount('${acc.id}')">
                            <div class="account-avatar" style="background: ${this.brandSettings.brand_gradient}">
                                ${(acc.name || acc.email)[0].toUpperCase()}
                            </div>
                            <div class="account-info">
                                <div class="account-name">${acc.name}</div>
                                <div class="account-email">${acc.email}</div>
                            </div>
                            <span class="sync-dot ${acc.sync_status || 'never'}"></span>
                        </div>
                    `).join('')}
                    ${this.accounts.length === 0 ? `
                        <div class="no-accounts">
                            <p>Žiadne schránky</p>
                            <button onclick="Router.navigate('settings')" class="btn-link">Pridať schránku</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        this.updateUnreadBadges();
    },
    
    renderLoadingState() {
        return `
            <div class="msg-loading">
                <div class="spinner"></div>
                <p>Načítavam správy...</p>
            </div>
        `;
    },
    
    renderErrorState(message) {
        return `
            <div class="msg-empty">
                <div class="empty-icon">❌</div>
                <h3>Chyba</h3>
                <p>${message}</p>
                <button onclick="MessagesModule.loadEmails()" class="btn-secondary">Skúsiť znova</button>
            </div>
        `;
    },
    
    renderEmailList() {
        const listEl = document.getElementById('messages-list');
        if (!listEl) return;
        
        if (this.emails.length === 0) {
            listEl.innerHTML = `
                <div class="msg-empty">
                    <div class="empty-icon">📭</div>
                    <h3>Žiadne správy</h3>
                    <p>${this.searchQuery ? 'Žiadne výsledky' : 'Táto zložka je prázdna'}</p>
                    ${!this.searchQuery ? `<button onclick="MessagesModule.syncEmails()" class="btn-secondary">Synchronizovať</button>` : ''}
                </div>
            `;
            return;
        }
        
        const totalPages = Math.ceil(this.totalCount / this.perPage);
        const startItem = (this.page - 1) * this.perPage + 1;
        const endItem = Math.min(this.page * this.perPage, this.totalCount);
        
        listEl.innerHTML = `
            <div class="email-toolbar">
                <label class="checkbox-wrap">
                    <input type="checkbox" id="select-all" onchange="MessagesModule.toggleSelectAll(this.checked)">
                    <span>Vybrať</span>
                </label>
                <div class="bulk-actions">
                    <button onclick="MessagesModule.markSelectedAsRead(true)" class="btn-ghost" title="Prečítané">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </button>
                    <button onclick="MessagesModule.markSelectedAsRead(false)" class="btn-ghost" title="Neprečítané">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                    </button>
                    <button onclick="MessagesModule.moveSelectedToTrash()" class="btn-ghost danger" title="Vymazať">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div class="toolbar-right">
                    <span class="page-info">${startItem}-${endItem} z ${this.totalCount}</span>
                    <select class="per-page-select" onchange="MessagesModule.changePerPage(this.value)">
                        <option value="20" ${this.perPage === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${this.perPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${this.perPage === 100 ? 'selected' : ''}>100</option>
                    </select>
                    <div class="page-nav">
                        <button onclick="MessagesModule.goToPage(${this.page - 1})" ${this.page <= 1 ? 'disabled' : ''} class="nav-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button onclick="MessagesModule.goToPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled' : ''} class="nav-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="emails-container" style="display:flex !important; flex-direction:column !important;">
                ${this.emails.map(email => this.renderEmailRow(email)).join('')}
            </div>
        `;
    },
    
    // Helper pre escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    renderEmailRow(email) {
        const date = new Date(email.date);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isThisYear = date.getFullYear() === now.getFullYear();
        
        let dateStr;
        if (isToday) {
            dateStr = date.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' });
        } else if (isThisYear) {
            dateStr = date.toLocaleDateString('sk', { day: 'numeric', month: 'short' });
        } else {
            dateStr = date.toLocaleDateString('sk', { day: 'numeric', month: 'short', year: '2-digit' });
        }
        
        // Escape HTML v snippet a subject
        const safeSnippet = this.escapeHtml(email.snippet || '');
        const safeSubject = this.escapeHtml(email.subject || '(Bez predmetu)');
        const safeSender = this.escapeHtml(email.from_name || email.from_address?.split('@')[0] || 'Neznámy');
        
        return `
            <div class="email-row ${!email.is_read ? 'unread' : ''}" onclick="MessagesModule.openDetailModal('${email.id}')">
                <div class="email-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" class="email-cb" data-id="${email.id}">
                </div>
                <div class="email-star" onclick="event.stopPropagation(); MessagesModule.toggleStar('${email.id}')">
                    ${email.is_starred ? '★' : '☆'}
                </div>
                <div class="email-avatar" style="background: ${this.brandSettings.brand_gradient}">
                    ${(email.from_name || email.from_address || '?')[0].toUpperCase()}
                </div>
                <div class="email-content">
                    <div class="email-top">
                        <span class="email-sender">${safeSender}</span>
                        <span class="email-date">${dateStr}</span>
                    </div>
                    <div class="email-subject">${safeSubject}</div>
                    <div class="email-preview">${safeSnippet}</div>
                </div>
                ${email.has_attachments ? '<div class="email-attachment">📎</div>' : ''}
            </div>
        `;
    },
    
    renderPagination() {
        const totalPages = Math.ceil(this.totalCount / this.perPage);
        const startItem = (this.page - 1) * this.perPage + 1;
        const endItem = Math.min(this.page * this.perPage, this.totalCount);
        
        // Generuj čísla stránok
        let pages = [];
        if (totalPages <= 7) {
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            if (this.page <= 3) {
                pages = [1, 2, 3, 4, '...', totalPages];
            } else if (this.page >= totalPages - 2) {
                pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, '...', this.page - 1, this.page, this.page + 1, '...', totalPages];
            }
        }
        
        return `
            <div class="pagination-container">
                <div class="pagination-left">
                    <span class="pagination-info">
                        Zobrazujem <strong>${startItem}-${endItem}</strong> z <strong>${this.totalCount}</strong>
                    </span>
                    <select class="per-page-select" onchange="MessagesModule.changePerPage(this.value)">
                        <option value="20" ${this.perPage === 20 ? 'selected' : ''}>20 na stránku</option>
                        <option value="50" ${this.perPage === 50 ? 'selected' : ''}>50 na stránku</option>
                        <option value="100" ${this.perPage === 100 ? 'selected' : ''}>100 na stránku</option>
                    </select>
                </div>
                ${totalPages > 1 ? `
                <div class="pagination-controls">
                    <button onclick="MessagesModule.goToPage(${this.page - 1})" ${this.page <= 1 ? 'disabled' : ''} class="pagination-btn pagination-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="pagination-pages">
                        ${pages.map(p => p === '...' 
                            ? '<span class="pagination-dots">...</span>'
                            : `<button onclick="MessagesModule.goToPage(${p})" class="pagination-btn ${p === this.page ? 'active' : ''}">${p}</button>`
                        ).join('')}
                    </div>
                    <button onclick="MessagesModule.goToPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled' : ''} class="pagination-btn pagination-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    },
    
    changePerPage(value) {
        this.perPage = parseInt(value);
        this.page = 1;
        this.loadEmails();
    },
    
    // ===========================================
    // DETAIL MODAL
    // ===========================================
    
    async openDetailModal(id) {
        const email = this.emails.find(e => e.id === id);
        if (!email) return;
        
        this.selectedEmail = email;
        this.detailModalOpen = true;
        
        // Mark as read
        if (!email.is_read) {
            await Database.client
                .from('emails')
                .update({ is_read: true })
                .eq('id', id);
            email.is_read = true;
            this.renderEmailList();
            this.updateUnreadBadges();
        }
        
        const container = document.getElementById('detail-modal-container');
        container.innerHTML = this.renderDetailModal(email);
        
        // Animate in
        requestAnimationFrame(() => {
            container.querySelector('.modal-overlay').classList.add('open');
        });
        
        // Načítaj prepojenia async
        this._loadEmailLinks(id);
    },
    
    renderDetailModal(email) {
        const date = new Date(email.date).toLocaleString('sk', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const toAddresses = email.to_addresses || [];
        const ccAddresses = email.cc_addresses || [];
        const attachments = email.attachments || [];
        
        return `
            <div class="modal-overlay" onclick="MessagesModule.closeDetailModal(event)">
                <div class="modal-content detail-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${email.subject || '(Bez predmetu)'}</h2>
                        <button onclick="MessagesModule.closeDetailModal()" class="modal-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="email-meta">
                            <div class="email-from-section">
                                <div class="email-avatar-lg" style="background: ${this.brandSettings.brand_gradient}">
                                    ${(email.from_name || email.from_address || '?')[0].toUpperCase()}
                                </div>
                                <div class="from-details">
                                    <div class="from-name">${email.from_name || email.from_address}</div>
                                    <div class="from-email">&lt;${email.from_address}&gt;</div>
                                    <div class="email-date-full">${date}</div>
                                </div>
                            </div>
                            
                            <div class="email-recipients">
                                <div class="recipient-row">
                                    <span class="label">Komu:</span>
                                    <span class="value">${toAddresses.map(t => t.name || t.email).join(', ') || '-'}</span>
                                </div>
                                ${ccAddresses.length > 0 ? `
                                    <div class="recipient-row">
                                        <span class="label">Kópia:</span>
                                        <span class="value">${ccAddresses.map(c => c.name || c.email).join(', ')}</span>
                                    </div>
                                ` : ''}
                            </div>
                            
                            ${attachments.length > 0 ? `
                                <div class="email-attachments">
                                    <span class="label">📎 Prílohy:</span>
                                    <div class="attachment-chips">
                                        ${attachments.map(a => `<span class="chip">${a.filename}</span>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="email-body-content">
                            ${email.body_html || (email.body_text || '').replace(/\n/g, '<br>') || '<em>Prázdna správa</em>'}
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button onclick="MessagesModule.replyToEmail('${email.id}')" class="btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                            Odpovedať
                        </button>
                        <button onclick="MessagesModule.forwardEmail('${email.id}')" class="btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                            Preposlať
                        </button>
                        <button onclick="MessagesModule.showLinkMenu('${email.id}')" class="btn-secondary" title="Prepojiť alebo vytvoriť">
                            🔗 Prepojiť
                        </button>
                        <div class="spacer"></div>
                        <button onclick="MessagesModule.moveToTrash('${email.id}')" class="btn-danger">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            Vymazať
                        </button>
                    </div>
                    
                    <div id="email-links-section"></div>
                </div>
            </div>
        `;
    },
    
    closeDetailModal(event) {
        if (event && event.target !== event.currentTarget) return;
        
        const overlay = document.querySelector('#detail-modal-container .modal-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            setTimeout(() => {
                document.getElementById('detail-modal-container').innerHTML = '';
            }, 200);
        }
        
        this.detailModalOpen = false;
        this.selectedEmail = null;
    },
    
    // ===========================================
    // EMAIL LINKS (Prepojenia)
    // ===========================================
    
    async _loadEmailLinks(emailId) {
        const section = document.getElementById('email-links-section');
        if (!section) return;
        
        try {
            const { data: links } = await Database.client
                .from('email_links')
                .select('*')
                .eq('email_id', emailId)
                .order('created_at', { ascending: false });
            
            if (!links || links.length === 0) {
                section.innerHTML = '';
                return;
            }
            
            // Načítaj detaily pre každý link
            const enriched = [];
            for (const link of links) {
                let name = '';
                let icon = '🔗';
                try {
                    if (link.entity_type === 'client') {
                        const { data } = await Database.client.from('clients').select('company_name').eq('id', link.entity_id).maybeSingle();
                        name = data?.company_name || 'Klient';
                        icon = '🏢';
                    } else if (link.entity_type === 'lead') {
                        const { data } = await Database.client.from('leads').select('company_name,domain').eq('id', link.entity_id).maybeSingle();
                        name = data?.company_name || data?.domain || 'Lead';
                        icon = '🎯';
                    } else if (link.entity_type === 'ticket') {
                        const { data } = await Database.client.from('tickets').select('title').eq('id', link.entity_id).maybeSingle();
                        name = data?.title || 'Ticket';
                        icon = '🎫';
                    } else if (link.entity_type === 'task') {
                        const { data } = await Database.client.from('tasks').select('title').eq('id', link.entity_id).maybeSingle();
                        name = data?.title || 'Úloha';
                        icon = '✅';
                    }
                } catch(e) {}
                enriched.push({ ...link, name, icon });
            }
            
            section.innerHTML = `
                <div style="padding:12px 24px 16px;border-top:1px solid #eee;background:#fafafa;">
                    <div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">🔗 PREPOJENIA</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;">
                        ${enriched.map(l => `
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                                ${l.icon} ${l.name}
                                <button onclick="MessagesModule.removeLink('${l.id}','${emailId}')" style="background:none;border:none;cursor:pointer;color:#ccc;font-size:14px;" title="Odstrániť">×</button>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch(e) {
            console.warn('Error loading email links:', e);
        }
    },
    
    showLinkMenu(emailId) {
        document.getElementById('link-menu-popup')?.remove();
        
        const popup = document.createElement('div');
        popup.id = 'link-menu-popup';
        popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10001;';
        popup.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);" onclick="event.stopPropagation()">
                <h3 style="margin:0 0 16px;font-size:16px;">🔗 Prepojiť email</h3>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                    <button onclick="MessagesModule.linkToEntity('${emailId}','client')" style="padding:16px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;text-align:center;font-size:14px;transition:all 0.15s;" onmouseover="this.style.borderColor='#FF6B35';this.style.background='#fff7f0'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
                        🏢<br><span style="font-weight:600;">Klient</span>
                    </button>
                    <button onclick="MessagesModule.linkToEntity('${emailId}','lead')" style="padding:16px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;text-align:center;font-size:14px;transition:all 0.15s;" onmouseover="this.style.borderColor='#FF6B35';this.style.background='#fff7f0'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
                        🎯<br><span style="font-weight:600;">Lead</span>
                    </button>
                    <button onclick="MessagesModule.linkToEntity('${emailId}','ticket')" style="padding:16px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;text-align:center;font-size:14px;transition:all 0.15s;" onmouseover="this.style.borderColor='#FF6B35';this.style.background='#fff7f0'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
                        🎫<br><span style="font-weight:600;">Ticket</span>
                    </button>
                    <button onclick="MessagesModule.linkToEntity('${emailId}','task')" style="padding:16px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;text-align:center;font-size:14px;transition:all 0.15s;" onmouseover="this.style.borderColor='#FF6B35';this.style.background='#fff7f0'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
                        ✅<br><span style="font-weight:600;">Úloha</span>
                    </button>
                </div>
                
                <div style="border-top:1px solid #eee;padding-top:16px;margin-bottom:8px;">
                    <p style="font-size:12px;color:#888;margin:0 0 10px;font-weight:600;">VYTVORIŤ Z EMAILU</p>
                    <div style="display:flex;gap:8px;">
                        <button onclick="MessagesModule.createFromEmail('${emailId}','ticket')" style="flex:1;padding:10px;border:1px dashed #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">🎫 Nový ticket</button>
                        <button onclick="MessagesModule.createFromEmail('${emailId}','task')" style="flex:1;padding:10px;border:1px dashed #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">✅ Nová úloha</button>
                    </div>
                </div>
                
                <div style="text-align:right;margin-top:16px;">
                    <button onclick="document.getElementById('link-menu-popup').remove()" style="padding:8px 16px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">Zavrieť</button>
                </div>
            </div>
        `;
        popup.addEventListener('click', (e) => { if (e.target === popup) popup.remove(); });
        document.body.appendChild(popup);
    },
    
    async linkToEntity(emailId, entityType) {
        document.getElementById('link-menu-popup')?.remove();
        
        // Načítaj zoznam entít
        let items = [];
        let title = '';
        
        try {
            if (entityType === 'client') {
                title = 'Vyber klienta';
                const { data } = await Database.client.from('clients').select('id, company_name').order('company_name');
                items = (data || []).map(c => ({ id: c.id, name: c.company_name }));
            } else if (entityType === 'lead') {
                title = 'Vyber lead';
                const { data } = await Database.client.from('leads').select('id, company_name, domain').order('created_at', { ascending: false }).limit(50);
                items = (data || []).map(l => ({ id: l.id, name: l.company_name || l.domain }));
            } else if (entityType === 'ticket') {
                title = 'Vyber ticket';
                const { data } = await Database.client.from('tickets').select('id, title').order('created_at', { ascending: false }).limit(50);
                items = (data || []).map(t => ({ id: t.id, name: t.title }));
            } else if (entityType === 'task') {
                title = 'Vyber úlohu';
                const { data } = await Database.client.from('tasks').select('id, title').order('created_at', { ascending: false }).limit(50);
                items = (data || []).map(t => ({ id: t.id, name: t.title }));
            }
        } catch(e) {
            Utils.toast('Chyba pri načítaní', 'error');
            return;
        }
        
        if (items.length === 0) {
            Utils.toast('Žiadne záznamy na prepojenie', 'info');
            return;
        }
        
        const icons = { client: '🏢', lead: '🎯', ticket: '🎫', task: '✅' };
        
        const popup = document.createElement('div');
        popup.id = 'link-menu-popup';
        popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10001;';
        popup.innerHTML = `
            <div style="background:#fff;border-radius:12px;max-width:420px;width:90%;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.2);" onclick="event.stopPropagation()">
                <div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:15px;">${icons[entityType]} ${title}</h3>
                    <button onclick="document.getElementById('link-menu-popup').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#999;">✕</button>
                </div>
                <div style="padding:12px 20px 8px;">
                    <input type="text" id="link-search-input" placeholder="Hľadať..." style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;" oninput="MessagesModule._filterLinkItems(this.value)">
                </div>
                <div id="link-items-list" style="overflow-y:auto;padding:8px 12px 16px;max-height:400px;">
                    ${items.map(item => `
                        <button class="link-item-btn" data-name="${(item.name || '').toLowerCase()}" onclick="MessagesModule._saveLink('${emailId}','${entityType}','${item.id}')" 
                                style="display:block;width:100%;text-align:left;padding:10px 12px;border:none;background:#fff;cursor:pointer;font-size:14px;border-radius:6px;margin-bottom:2px;transition:background 0.1s;"
                                onmouseover="this.style.background='#f7f7f7'" onmouseout="this.style.background='#fff'">
                            ${item.name || '(bez názvu)'}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        popup.addEventListener('click', (e) => { if (e.target === popup) popup.remove(); });
        document.body.appendChild(popup);
        document.getElementById('link-search-input')?.focus();
    },
    
    _filterLinkItems(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.link-item-btn').forEach(btn => {
            const name = btn.dataset.name || '';
            btn.style.display = name.includes(q) ? 'block' : 'none';
        });
    },
    
    async _saveLink(emailId, entityType, entityId) {
        document.getElementById('link-menu-popup')?.remove();
        
        try {
            const { data: { user } } = await Database.client.auth.getUser();
            
            // Check duplicates
            const { data: existing } = await Database.client
                .from('email_links')
                .select('id')
                .eq('email_id', emailId)
                .eq('entity_type', entityType)
                .eq('entity_id', entityId)
                .maybeSingle();
            
            if (existing) {
                Utils.toast('Toto prepojenie už existuje', 'info');
                return;
            }
            
            await Database.client.from('email_links').insert({
                email_id: emailId,
                entity_type: entityType,
                entity_id: entityId,
                created_by: user?.id
            });
            
            Utils.toast('Prepojenie vytvorené ✅', 'success');
            this._loadEmailLinks(emailId);
            
        } catch(e) {
            console.error('Link error:', e);
            Utils.toast('Chyba pri prepájaní', 'error');
        }
    },
    
    async removeLink(linkId, emailId) {
        try {
            await Database.client.from('email_links').delete().eq('id', linkId);
            Utils.toast('Prepojenie odstránené', 'success');
            this._loadEmailLinks(emailId);
        } catch(e) {
            Utils.toast('Chyba', 'error');
        }
    },
    
    async createFromEmail(emailId, type) {
        document.getElementById('link-menu-popup')?.remove();
        
        const email = this.emails.find(e => e.id === emailId) || this.selectedEmail;
        if (!email) return;
        
        try {
            const { data: { user } } = await Database.client.auth.getUser();
            
            if (type === 'ticket') {
                const { data, error } = await Database.client.from('tickets').insert({
                    subject: email.subject || 'Ticket z emailu',
                    description: (email.from_name ? 'Od: ' + email.from_name + ' <' + email.from_address + '>\n\n' : '') + (email.snippet || email.body_text?.substring(0, 500) || ''),
                    status: 'open',
                    priority: 'medium',
                    category: 'email',
                    created_by_team: (await Database.client.from('team_members').select('id').eq('user_id', user?.id).maybeSingle())?.data?.id || null
                }).select().single();
                
                if (error) throw error;
                
                // Prepoj email s ticketom
                await Database.client.from('email_links').insert({
                    email_id: emailId,
                    entity_type: 'ticket',
                    entity_id: data.id,
                    created_by: user?.id
                });
                
                Utils.toast('Ticket vytvorený a prepojený ✅', 'success');
                this._loadEmailLinks(emailId);
                
            } else if (type === 'task') {
                const teamMemberId = (await Database.client.from('team_members').select('id').eq('user_id', user?.id).maybeSingle())?.data?.id || null;
                
                const { data, error } = await Database.client.from('tasks').insert({
                    title: email.subject || 'Úloha z emailu',
                    description: (email.from_name ? 'Od: ' + email.from_name + ' <' + email.from_address + '>\n\n' : '') + (email.snippet || email.body_text?.substring(0, 500) || ''),
                    status: 'todo',
                    priority: 'medium',
                    created_by: teamMemberId
                }).select().single();
                
                if (error) throw error;
                
                await Database.client.from('email_links').insert({
                    email_id: emailId,
                    entity_type: 'task',
                    entity_id: data.id,
                    created_by: user?.id
                });
                
                Utils.toast('Úloha vytvorená a prepojená ✅', 'success');
                this._loadEmailLinks(emailId);
            }
            
        } catch(e) {
            console.error('Create from email error:', e);
            Utils.toast('Chyba pri vytváraní: ' + (e.message || ''), 'error');
        }
    },
    
    // ===========================================
    // COMPOSE MODAL
    // ===========================================
    
    async replyToEmail(emailId) {
        console.log('=== replyToEmail called ===', emailId);
        this.closeDetailModal();
        setTimeout(async () => {
            console.log('Opening compose modal for reply...');
            await this.openComposeModal(emailId, 'reply');
        }, 250);
    },
    
    async forwardEmail(emailId) {
        console.log('=== forwardEmail called ===', emailId);
        this.closeDetailModal();
        setTimeout(async () => {
            console.log('Opening compose modal for forward...');
            await this.openComposeModal(emailId, 'forward');
        }, 250);
    },
    
    async openComposeModal(emailId = null, mode = null) {
        console.log('=== openComposeModal START ===', { emailId, mode });
        this.composeModalOpen = true;
        
        let to = '';
        let subject = '';
        let bodyContent = '';
        let replyToId = null;
        let attachments = [];
        
        // Ak je reply/forward, načítame email z DB
        if (emailId && mode) {
            try {
                console.log('Loading email from DB...');
                const { data: email, error } = await Database.client
                    .from('emails')
                    .select('*')
                    .eq('id', emailId)
                    .single();
                
                console.log('DB response - email:', email ? 'loaded' : 'null');
                console.log('DB response - error:', error);
                
                if (email) {
                    // Použiť body_html, alebo body_text, alebo snippet ako fallback
                    let originalBody = '';
                    
                    console.log('body_html:', email.body_html, 'length:', email.body_html?.length);
                    console.log('body_text:', email.body_text?.substring(0, 100), 'length:', email.body_text?.length);
                    
                    if (email.body_html && email.body_html.length > 10) {
                        originalBody = email.body_html;
                        console.log('Using body_html');
                    } else if (email.body_text && email.body_text.length > 0) {
                        originalBody = email.body_text.replace(/\n/g, '<br>');
                        console.log('Using body_text, converted length:', originalBody.length);
                    } else if (email.snippet) {
                        originalBody = `<p>${email.snippet}</p>`;
                        console.log('Using snippet');
                    } else {
                        originalBody = '<p><em>(Pôvodná správa nemá obsah)</em></p>';
                        console.log('No content found');
                    }
                    
                    console.log('originalBody final length:', originalBody.length);
                    
                    const dateStr = new Date(email.date).toLocaleString('sk', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    if (mode === 'reply') {
                        to = email.from_address;
                        subject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`;
                        bodyContent = `<br><br><div style="border-left: 3px solid #e2e8f0; padding-left: 12px; margin-left: 0; color: #64748b;"><p style="margin: 0 0 8px 0;">Dňa ${dateStr} napísal/a <strong>${email.from_name || email.from_address}</strong>:</p>${originalBody}</div>`;
                        replyToId = email.id;
                    } else if (mode === 'forward') {
                        subject = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`;
                        
                        // Prílohy info
                        if (email.attachments && email.attachments.length > 0) {
                            attachments = email.attachments;
                        }
                        
                        bodyContent = `<br><br><div style="border-top: 1px solid #e2e8f0; padding-top: 12px;"><p style="color: #64748b; margin: 0;">---------- Preposlaná správa ----------</p><p style="margin: 8px 0;"><strong>Od:</strong> ${email.from_name || ''} &lt;${email.from_address}&gt;<br><strong>Dátum:</strong> ${dateStr}<br><strong>Predmet:</strong> ${email.subject || '(Bez predmetu)'}<br><strong>Komu:</strong> ${(email.to_addresses || []).map(t => t.email || t).join(', ')}</p><br>${originalBody}</div>`;
                    }
                    
                    console.log('bodyContent length:', bodyContent.length);
                }
            } catch (err) {
                console.error('Error loading email for compose:', err);
            }
        }
        
        // Add default signature pre nový email
        const defaultSig = this.signatures.find(s => s.is_default);
        if (defaultSig && !emailId) {
            bodyContent = `<br><br><div class="signature">${defaultSig.html_content}</div>`;
        }
        
        // Načítať použité emailové adresy pre autocomplete
        await this.loadUsedEmails();
        
        // Uložiť bodyContent pre Quill
        this.pendingBodyContent = bodyContent;
        console.log('Saved pendingBodyContent, length:', bodyContent.length);
        
        const container = document.getElementById('compose-modal-container');
        container.innerHTML = this.renderComposeModal(to, subject, bodyContent, replyToId, attachments);
        
        // Animate in
        requestAnimationFrame(() => {
            container.querySelector('.modal-overlay').classList.add('open');
        });
        
        // Init Quill s uloženým obsahom
        setTimeout(() => {
            console.log('Calling initQuillEditor with pendingBodyContent length:', this.pendingBodyContent?.length);
            this.initQuillEditor(this.pendingBodyContent);
        }, 200);
    },
    
    // Načítanie použitých email adries
    async loadUsedEmails() {
        try {
            // Načítať unikátne from_address a to_addresses
            const { data: emails } = await Database.client
                .from('emails')
                .select('from_address, from_name, to_addresses')
                .limit(200);
            
            const emailSet = new Map();
            
            if (emails) {
                emails.forEach(e => {
                    if (e.from_address) {
                        emailSet.set(e.from_address, e.from_name || e.from_address);
                    }
                    if (e.to_addresses && Array.isArray(e.to_addresses)) {
                        e.to_addresses.forEach(t => {
                            const addr = t.email || t.address || t;
                            if (typeof addr === 'string' && addr.includes('@')) {
                                emailSet.set(addr, t.name || addr);
                            }
                        });
                    }
                });
            }
            
            this.usedEmails = Array.from(emailSet.entries()).map(([email, name]) => ({
                email,
                name,
                display: name !== email ? `${name} <${email}>` : email
            }));
            
            console.log('Loaded used emails:', this.usedEmails.length);
        } catch (err) {
            console.error('Error loading used emails:', err);
        }
    },
    
    renderComposeModal(to, subject, bodyContent, replyToId, attachments = []) {
        const isForward = subject?.startsWith('Fwd:');
        
        return `
            <div class="modal-overlay" onclick="MessagesModule.closeComposeModal(event)">
                <div class="modal-content compose-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${replyToId ? 'Odpovedať' : isForward ? 'Preposlať' : 'Nový email'}</h2>
                        <button onclick="MessagesModule.closeComposeModal()" class="modal-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    
                    <form id="compose-form" onsubmit="MessagesModule.sendEmail(event)" class="compose-form">
                        <input type="hidden" name="replyToId" value="${replyToId || ''}">
                        
                        <div class="form-row">
                            <label>Od</label>
                            <select name="accountId" required>
                                ${this.accounts.map(a => `
                                    <option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.display_name || a.name} &lt;${a.email}&gt;</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-row">
                            <label>Komu</label>
                            <input type="email" name="to" value="${to}" required placeholder="email@example.com" 
                                   list="email-suggestions" autocomplete="off">
                            <datalist id="email-suggestions">
                                ${this.usedEmails.map(e => `<option value="${e.email}">${e.display}</option>`).join('')}
                            </datalist>
                        </div>
                        
                        <div class="form-row">
                            <label>Kópia</label>
                            <input type="text" name="cc" placeholder="Voliteľné" list="email-suggestions-cc" autocomplete="off">
                            <datalist id="email-suggestions-cc">
                                ${this.usedEmails.map(e => `<option value="${e.email}">${e.display}</option>`).join('')}
                            </datalist>
                        </div>
                        
                        <div class="form-row">
                            <label>Predmet</label>
                            <input type="text" name="subject" value="${subject}" required placeholder="Predmet správy">
                        </div>
                        
                        ${attachments.length > 0 ? `
                            <div class="form-row attachments-row">
                                <label>Prílohy</label>
                                <div class="forwarded-attachments">
                                    ${attachments.map(a => `
                                        <span class="attachment-chip">
                                            📎 ${a.filename}
                                            <small>(${Math.round((a.size || 0) / 1024)}KB)</small>
                                        </span>
                                    `).join('')}
                                    <span class="attachment-note">(prílohy budú preposlané)</span>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="editor-container">
                            <div id="compose-editor"></div>
                        </div>
                        
                        <div class="modal-footer">
                            <select name="signature" onchange="MessagesModule.insertSignature(this.value)" class="signature-select">
                                <option value="">Vložiť podpis...</option>
                                ${this.signatures.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                            <div class="spacer"></div>
                            <button type="button" onclick="MessagesModule.closeComposeModal()" class="btn-secondary">Zrušiť</button>
                            <button type="submit" class="btn-primary" id="send-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                Odoslať
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },
    
    initQuillEditor(content) {
        console.log('=== initQuillEditor START ===');
        console.log('Content length:', content?.length || 0);
        console.log('Content preview:', content?.substring(0, 300));
        
        if (!window.Quill) {
            console.error('Quill not loaded!');
            return;
        }
        
        const editorEl = document.getElementById('compose-editor');
        if (!editorEl) {
            console.error('Editor element not found!');
            return;
        }
        
        this.quillEditor = new Quill('#compose-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'align': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'indent': '-1' }, { 'indent': '+1' }],
                    ['blockquote', 'code-block'],
                    ['link', 'image'],
                    ['clean']
                ]
            },
            placeholder: 'Napíšte správu...'
        });
        
        console.log('Quill initialized');
        
        if (content && content.length > 0) {
            try {
                // Skúsiť clipboard API
                const delta = this.quillEditor.clipboard.convert(content);
                this.quillEditor.setContents(delta, 'silent');
                console.log('Content set via clipboard');
            } catch (err) {
                console.error('Clipboard failed, using innerHTML:', err);
                // Fallback na innerHTML
                this.quillEditor.root.innerHTML = content;
            }
            console.log('Final editor innerHTML length:', this.quillEditor.root.innerHTML.length);
        } else {
            console.log('No content to set');
        }
        
        console.log('=== initQuillEditor END ===');
    },
    
    insertSignature(sigId) {
        if (!sigId || !this.quillEditor) return;
        
        const sig = this.signatures.find(s => s.id === sigId);
        if (!sig?.html_content) return;
        
        const current = this.quillEditor.root.innerHTML;
        this.quillEditor.root.innerHTML = current + '<br><br>' + sig.html_content;
        
        document.querySelector('select[name="signature"]').value = '';
    },
    
    closeComposeModal(event) {
        if (event && event.target !== event.currentTarget) return;
        
        const overlay = document.querySelector('#compose-modal-container .modal-overlay');
        if (overlay) {
            overlay.classList.remove('open');
            setTimeout(() => {
                document.getElementById('compose-modal-container').innerHTML = '';
            }, 200);
        }
        
        this.composeModalOpen = false;
        this.quillEditor = null;
    },
    
    // ===========================================
    // SEND EMAIL
    // ===========================================
    
    async sendEmail(e) {
        e.preventDefault();
        
        const form = e.target;
        const sendBtn = document.getElementById('send-btn');
        
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="btn-spinner"></span> Odosielam...';
        
        try {
            const formData = new FormData(form);
            const htmlBody = this.quillEditor?.root.innerHTML || '';
            const textBody = this.quillEditor?.getText() || '';
            
            const response = await fetch('/.netlify/functions/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: formData.get('accountId'),
                    to: formData.get('to'),
                    cc: formData.get('cc') || undefined,
                    subject: formData.get('subject'),
                    htmlBody: htmlBody,
                    textBody: textBody,
                    inReplyToId: formData.get('replyToId') || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                Utils.toast('Email odoslaný! ✅', 'success');
                this.closeComposeModal();
                
                if (this.selectedFolder === 'Sent') {
                    await this.loadEmails();
                }
            } else {
                throw new Error(data.error || 'Odoslanie zlyhalo');
            }
            
        } catch (err) {
            console.error('Send error:', err);
            Utils.toast('Chyba: ' + err.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Odoslať`;
        }
    },
    
    // ===========================================
    // ACTIONS
    // ===========================================
    
    selectFolder(folder) {
        this.selectedFolder = folder;
        this.page = 1;
        this.searchQuery = '';
        this._saveState();
        const searchInput = document.getElementById('email-search');
        if (searchInput) searchInput.value = '';
        
        document.querySelectorAll('.folder-btn').forEach(el => el.classList.remove('active'));
        document.querySelector(`.folder-btn[onclick*="'${folder}'"]`)?.classList.add('active');
        
        this.loadEmails();
    },
    
    selectAccount(accountId) {
        this.selectedAccountId = accountId;
        this.page = 1;
        this._saveState();
        
        document.querySelectorAll('.account-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.account-item[onclick*="'${accountId}'"]`)?.classList.add('active');
        
        this.loadEmails();
    },
    
    handleSearch(event) {
        if (event.key === 'Enter') {
            this.searchQuery = event.target.value.trim();
            this.page = 1;
            this.loadEmails();
        }
    },
    
    goToPage(page) {
        if (page < 1 || page > Math.ceil(this.totalCount / this.perPage)) return;
        this.page = page;
        this._saveState();
        this.loadEmails();
    },
    
    toggleSelectAll(checked) {
        document.querySelectorAll('.email-cb').forEach(cb => cb.checked = checked);
    },
    
    getSelectedIds() {
        return Array.from(document.querySelectorAll('.email-cb:checked')).map(cb => cb.dataset.id);
    },
    
    async toggleStar(id) {
        const email = this.emails.find(e => e.id === id);
        if (!email) return;
        
        email.is_starred = !email.is_starred;
        
        await Database.client
            .from('emails')
            .update({ is_starred: email.is_starred })
            .eq('id', id);
        
        this.renderEmailList();
    },
    
    async markSelectedAsRead(isRead) {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Utils.toast('Vyberte správy', 'warning');
            return;
        }
        
        await Database.client
            .from('emails')
            .update({ is_read: isRead })
            .in('id', ids);
        
        ids.forEach(id => {
            const email = this.emails.find(e => e.id === id);
            if (email) email.is_read = isRead;
        });
        
        this.renderEmailList();
        this.updateUnreadBadges();
        Utils.toast(`${ids.length} správ označených`, 'success');
    },
    
    async moveSelectedToTrash() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Utils.toast('Vyberte správy', 'warning');
            return;
        }
        
        if (!await Utils.confirm(`Vymazať ${ids.length} správ?`, { title: 'Hromadné mazanie', type: 'danger', confirmText: 'Vymazať', cancelText: 'Ponechať' })) return;
        
        await Database.client
            .from('emails')
            .update({ folder: 'Trash', is_deleted: true })
            .in('id', ids);
        
        this.emails = this.emails.filter(e => !ids.includes(e.id));
        this.renderEmailList();
        Utils.toast(`${ids.length} správ vymazaných`, 'success');
    },
    
    async moveToTrash(id) {
        await Database.client
            .from('emails')
            .update({ folder: 'Trash', is_deleted: true })
            .eq('id', id);
        
        this.closeDetailModal();
        this.emails = this.emails.filter(e => e.id !== id);
        this.renderEmailList();
        Utils.toast('Správa vymazaná', 'success');
    },
    
    // ===========================================
    // STYLES
    // ===========================================
    
    getStyles() {
        const primary = this.brandSettings.brand_primary_color;
        const secondary = this.brandSettings.brand_secondary_color;
        const gradient = this.brandSettings.brand_gradient;
        
        return `<style>
        :root {
            --msg-primary: ${primary};
            --msg-secondary: ${secondary};
            --msg-gradient: ${gradient};
        }
        
        .messages-module { height: calc(100vh - 60px); background: #f8fafc; overflow: hidden; }
        
        /* Container */
        .msg-container { display: grid; grid-template-columns: 280px 1fr; height: 100%; overflow: hidden; }
        
        /* Sidebar */
        .msg-sidebar { background: white; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow-y: auto; min-height: 0; }
        
        .sidebar-header { padding: 20px; border-bottom: 1px solid #f1f5f9; }
        .sidebar-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
        
        .sidebar-folders { padding: 12px; }
        .folder-btn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: none; background: transparent; border-radius: 12px; cursor: pointer; font-size: 14px; color: #475569; transition: all 0.2s; text-align: left; }
        .folder-btn:hover { background: #f1f5f9; }
        .folder-btn.active { background: linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.1)); color: var(--msg-primary); font-weight: 600; }
        .folder-icon { font-size: 18px; }
        .folder-name { flex: 1; }
        .folder-total { font-size: 12px; color: #94a3b8; margin-right: 4px; }
        .folder-badge { background: #ef4444; color: white; font-size: 11px; font-weight: 600; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: none; align-items: center; justify-content: center; }
        
        /* Attachment chips */
        .attachments-row { align-items: flex-start !important; }
        .forwarded-attachments { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 0; }
        .attachment-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #f1f5f9; border-radius: 16px; font-size: 12px; color: #475569; }
        .attachment-chip small { color: #94a3b8; }
        .attachment-note { font-size: 11px; color: #94a3b8; font-style: italic; }
        
        .sidebar-divider { height: 1px; background: #e2e8f0; margin: 8px 16px; }
        
        .sidebar-section { padding: 12px; flex: 1; overflow-y: auto; }
        .section-header { display: flex; justify-content: space-between; align-items: center; padding: 8px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .btn-tiny { padding: 4px; border: none; background: transparent; cursor: pointer; color: #94a3b8; border-radius: 4px; }
        .btn-tiny:hover { background: #f1f5f9; color: #64748b; }
        
        .accounts-list { display: flex; flex-direction: column; gap: 4px; }
        .account-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: all 0.2s; }
        .account-item:hover { background: #f8fafc; }
        .account-item.active { background: linear-gradient(135deg, rgba(249,115,22,0.08), rgba(234,88,12,0.08)); }
        .account-avatar { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0; }
        .account-info { flex: 1; min-width: 0; }
        .account-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .account-email { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sync-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .sync-dot.success { background: #22c55e; }
        .sync-dot.error { background: #ef4444; }
        .sync-dot.never { background: #cbd5e1; }
        
        .no-accounts { text-align: center; padding: 20px; color: #94a3b8; }
        .btn-link { color: var(--msg-primary); text-decoration: none; font-size: 13px; }
        
        /* Main */
        .msg-main { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
        
        .msg-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: white; border-bottom: 1px solid #e2e8f0; gap: 16px; flex-wrap: wrap; flex-shrink: 0; }
        .msg-header-left { flex: 1; }
        .msg-header-right { display: flex; align-items: center; gap: 12px; }
        
        .msg-search { position: relative; max-width: 400px; }
        .msg-search input { width: 100%; padding: 10px 16px 10px 44px; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 14px; background: #f8fafc; transition: all 0.2s; }
        .msg-search input:focus { outline: none; border-color: var(--msg-primary); background: white; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .msg-search .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        
        .btn-icon { width: 40px; height: 40px; border: 1px solid #e2e8f0; background: white; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; transition: all 0.2s; }
        .btn-icon:hover { background: #f8fafc; border-color: #cbd5e1; }
        .btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .btn-primary { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--msg-gradient); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(249,115,22,0.3); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        
        .btn-secondary { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .btn-secondary:hover { background: #e2e8f0; }
        
        .btn-danger { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #fef2f2; color: #dc2626; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .btn-danger:hover { background: #fee2e2; }
        
        .btn-ghost { padding: 8px; border: none; background: transparent; cursor: pointer; color: #64748b; border-radius: 8px; transition: all 0.2s; }
        .btn-ghost:hover { background: #f1f5f9; }
        .btn-ghost.danger:hover { background: #fef2f2; color: #dc2626; }
        
        .btn-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        /* Email List */
        .msg-list { flex: 1; background: white; display: flex; flex-direction: column; overflow: hidden; }
        
        .email-toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fafafa; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
        .checkbox-wrap { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; cursor: pointer; }
        .bulk-actions { display: flex; gap: 2px; }
        .toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
        .page-info { font-size: 13px; color: #64748b; }
        .per-page-select { padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; background: white; cursor: pointer; }
        .page-nav { display: flex; gap: 4px; }
        .nav-btn { width: 28px; height: 28px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; }
        .nav-btn:hover:not(:disabled) { background: #f1f5f9; border-color: var(--msg-primary); color: var(--msg-primary); }
        .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        
        .emails-container { flex: 1; overflow-y: auto; display: flex !important; flex-direction: column !important; }
        
        .email-row { display: flex !important; flex-direction: row !important; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s; width: 100% !important; box-sizing: border-box !important; float: none !important; flex-shrink: 0 !important; }
        .email-row:hover { background: #f8fafc; }
        .email-row.unread { background: #fffbeb; }
        .email-row.unread:hover { background: #fef3c7; }
        .email-row.unread .email-sender { font-weight: 600; }
        .email-row.unread .email-subject { font-weight: 600; }
        
        .email-checkbox { flex-shrink: 0; }
        .email-star { flex-shrink: 0; font-size: 18px; color: #cbd5e1; cursor: pointer; transition: all 0.15s; }
        .email-row.unread .email-star, .email-star:hover { color: #fbbf24; }
        
        .email-avatar { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0; }
        
        .email-content { flex: 1; min-width: 0; }
        .email-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .email-sender { font-size: 14px; color: #1e293b; }
        .email-date { font-size: 12px; color: #94a3b8; flex-shrink: 0; }
        .email-subject { font-size: 14px; color: #334155; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .email-preview { font-size: 13px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .email-attachment { flex-shrink: 0; color: #94a3b8; }
        
        /* Loading/Empty States */
        .msg-loading, .msg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; color: #64748b; }
        .msg-empty .empty-icon { font-size: 48px; margin-bottom: 16px; }
        .msg-empty h3 { font-size: 18px; color: #1e293b; margin-bottom: 8px; }
        
        .spinner { width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: var(--msg-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
        
        /* Pagination */
        .pagination-container { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid #e2e8f0; background: white; flex-shrink: 0; gap: 12px; }
        .pagination-left { display: flex; align-items: center; gap: 16px; }
        .pagination-info { font-size: 13px; color: #64748b; }
        .pagination-info strong { color: #1e293b; font-weight: 600; }
        .per-page-select { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #475569; background: white; cursor: pointer; }
        .per-page-select:hover { border-color: #cbd5e1; }
        .pagination-controls { display: flex; align-items: center; gap: 4px; }
        .pagination-pages { display: flex; align-items: center; gap: 4px; }
        .pagination-btn { min-width: 36px; height: 36px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569; font-size: 14px; font-weight: 500; transition: all 0.15s; }
        .pagination-btn:hover:not(:disabled) { background: #f8fafc; border-color: var(--msg-primary); color: var(--msg-primary); }
        .pagination-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pagination-btn.active { background: var(--msg-gradient); color: white; border-color: transparent; }
        .pagination-arrow { padding: 0; }
        .pagination-dots { padding: 0 8px; color: #94a3b8; font-size: 14px; }
        
        /* Modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; opacity: 0; transition: opacity 0.2s; padding: 20px; }
        .modal-overlay.open { opacity: 1; }
        
        .modal-content { background: white; border-radius: 16px; max-width: 800px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: translateY(20px); transition: transform 0.2s; }
        .modal-overlay.open .modal-content { transform: translateY(0); }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
        .modal-header h2 { font-size: 18px; font-weight: 600; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .modal-close { padding: 8px; border: none; background: transparent; cursor: pointer; color: #64748b; border-radius: 8px; transition: all 0.2s; }
        .modal-close:hover { background: #f1f5f9; }
        
        .modal-body { flex: 1; overflow-y: auto; padding: 24px; }
        
        .modal-footer { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #fafafa; border-radius: 0 0 16px 16px; flex-wrap: wrap; }
        .modal-footer .spacer { flex: 1; }
        
        /* Detail Modal */
        .detail-modal { max-width: 900px; }
        
        .email-meta { margin-bottom: 24px; }
        .email-from-section { display: flex; gap: 16px; margin-bottom: 16px; }
        .email-avatar-lg { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 22px; flex-shrink: 0; }
        .from-details { }
        .from-name { font-size: 16px; font-weight: 600; color: #1e293b; }
        .from-email { font-size: 13px; color: #64748b; }
        .email-date-full { font-size: 13px; color: #94a3b8; margin-top: 4px; }
        
        .email-recipients { background: #f8fafc; padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
        .recipient-row { display: flex; gap: 8px; font-size: 13px; margin-bottom: 4px; }
        .recipient-row:last-child { margin-bottom: 0; }
        .recipient-row .label { color: #64748b; width: 50px; flex-shrink: 0; }
        .recipient-row .value { color: #1e293b; }
        
        .email-attachments { margin-bottom: 16px; }
        .email-attachments .label { font-size: 13px; color: #64748b; margin-bottom: 8px; display: block; }
        .attachment-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { display: inline-block; padding: 6px 12px; background: #f1f5f9; border-radius: 20px; font-size: 12px; color: #475569; }
        
        .email-body-content { font-size: 14px; line-height: 1.7; color: #334155; }
        .email-body-content img { max-width: 100%; height: auto; }
        .email-body-content blockquote { border-left: 3px solid #e2e8f0; padding-left: 16px; margin: 16px 0; color: #64748b; }
        
        /* Compose Modal */
        .compose-modal { max-width: 800px; height: 80vh; }
        
        .compose-form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        
        .form-row { display: flex; align-items: center; padding: 12px 24px; border-bottom: 1px solid #f1f5f9; }
        .form-row label { width: 70px; font-size: 13px; color: #64748b; flex-shrink: 0; }
        .form-row input, .form-row select { flex: 1; border: none; outline: none; font-size: 14px; padding: 8px 0; background: transparent; }
        .form-row select { cursor: pointer; }
        
        .editor-container { flex: 1; display: flex; flex-direction: column; min-height: 0; border-bottom: 1px solid #e2e8f0; }
        #compose-editor { flex: 1; overflow-y: auto; }
        #compose-editor .ql-container { border: none; font-size: 14px; }
        #compose-editor .ql-editor { min-height: 200px; padding: 20px 24px; }
        #compose-editor .ql-toolbar { border: none; border-bottom: 1px solid #e2e8f0; padding: 12px; background: #fafafa; }
        
        .signature-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; background: white; cursor: pointer; }
        
        /* Skeleton */
        .sidebar-loading { padding: 20px; }
        .skeleton-item { height: 48px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 12px; margin-bottom: 8px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        
        /* Mobile */
        @media (max-width: 768px) {
            .msg-container { grid-template-columns: 1fr; }
            .msg-sidebar { display: none; }
            .modal-content { max-height: 100vh; border-radius: 0; }
            .compose-modal { height: 100vh; }
            .pagination-container { flex-wrap: wrap; justify-content: center; }
            .pagination-left { width: 100%; justify-content: space-between; }
            .pagination-pages { display: none; }
        }
        </style>`;
    }
};

// Register
if (typeof App !== 'undefined') {
    App.register(MessagesModule);
}
