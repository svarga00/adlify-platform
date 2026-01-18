// =====================================================
// ADLIFY - Messages Module v2.1
// Kompletný Email Client s IMAP/SMTP (Netlify Functions)
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
    selectedAccountId: null,
    selectedFolder: 'INBOX',
    selectedEmail: null,
    isLoading: false,
    isSyncing: false,
    searchQuery: '',
    
    // Compose
    composeMode: false,
    replyToEmail: null,
    forwardEmail: null,
    quillEditor: null,
    
    // Pagination
    page: 1,
    perPage: 50,
    totalCount: 0,
    
    // Folders
    folders: [
        { id: 'INBOX', name: 'Doručené', icon: '📥' },
        { id: 'Sent', name: 'Odoslané', icon: '📤' },
        { id: 'Drafts', name: 'Koncepty', icon: '📝' },
        { id: 'Trash', name: 'Kôš', icon: '🗑️' }
    ],
    
    // ===========================================
    // LIFECYCLE
    // ===========================================
    
    async render(container) {
        this.container = container;
        
        container.innerHTML = `
            <div class="messages-module">
                ${this.renderHeader()}
                <div class="messages-layout" id="messages-layout">
                    <div class="messages-sidebar" id="messages-sidebar">
                        ${this.renderSidebarSkeleton()}
                    </div>
                    <div class="messages-list" id="messages-list">
                        ${this.renderLoadingState()}
                    </div>
                    <div class="messages-detail" id="messages-detail">
                        ${this.renderEmptyDetail()}
                    </div>
                </div>
            </div>
            ${this.getStyles()}
        `;
        
        await this.loadQuillEditor();
        await this.loadData();
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
            
            // Auto-select default
            if (!this.selectedAccountId && this.accounts.length > 0) {
                const defaultAcc = this.accounts.find(a => a.is_default);
                this.selectedAccountId = defaultAcc?.id || this.accounts[0].id;
            }
            
        } catch (err) {
            console.error('Error loading accounts:', err);
            Utils.toast('Chyba pri načítaní schránok', 'error');
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
            
            // Search
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
            let query = Database.client
                .from('emails')
                .select('id', { count: 'exact', head: true })
                .eq('is_read', false)
                .eq('is_deleted', false)
                .eq('folder', 'INBOX');
            
            if (this.selectedAccountId) {
                query = query.eq('account_id', this.selectedAccountId);
            } else if (this.accounts.length > 0) {
                query = query.in('account_id', this.accounts.map(a => a.id));
            }
            
            const { count } = await query;
            
            const badge = document.getElementById('inbox-unread-badge');
            if (badge) {
                badge.textContent = count || '';
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }
            
        } catch (err) {
            console.error('Error updating badges:', err);
        }
    },
    
    // ===========================================
    // SYNC - NETLIFY FUNCTION
    // ===========================================
    
    async syncEmails() {
        if (this.isSyncing) return;
        
        this.isSyncing = true;
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="sync-spinner"></span> Synchronizujem...';
        }
        
        try {
            // Sync all accounts or selected
            const accountsToSync = this.selectedAccountId
                ? [this.accounts.find(a => a.id === this.selectedAccountId)]
                : this.accounts;
            
            for (const account of accountsToSync) {
                if (!account) continue;
                
                Utils.toast(`Synchronizujem ${account.email}...`, 'info');
                
                // Zavolaj Netlify Function
                const response = await fetch('/.netlify/functions/email-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: account.id,
                        folder: this.selectedFolder,
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
            
            // Reload emails
            await this.loadEmails();
            await this.loadAccounts(); // Refresh sync status
            this.renderSidebar();
            
        } catch (err) {
            console.error('Sync failed:', err);
            Utils.toast('Synchronizácia zlyhala: ' + err.message, 'error');
        } finally {
            this.isSyncing = false;
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '🔄 Sync';
            }
        }
    },
    
    // ===========================================
    // RENDER METHODS
    // ===========================================
    
    renderHeader() {
        return `
            <div class="messages-header">
                <div class="messages-header-left">
                    <h1>📧 Správy</h1>
                    <button id="sync-btn" onclick="MessagesModule.syncEmails()" class="btn-icon-text" title="Synchronizovať">
                        🔄 Sync
                    </button>
                </div>
                <div class="messages-header-right">
                    <div class="search-box">
                        <input type="text" id="email-search" placeholder="Hľadať..." 
                               onkeyup="MessagesModule.handleSearch(event)" value="${this.searchQuery}">
                        <span class="search-icon">🔍</span>
                    </div>
                    <select id="account-filter" onchange="MessagesModule.filterByAccount(this.value)" class="account-filter">
                        <option value="">Všetky schránky</option>
                    </select>
                    <button onclick="MessagesModule.openCompose()" class="btn-primary">
                        ✏️ Nový email
                    </button>
                </div>
            </div>
        `;
    },
    
    renderSidebarSkeleton() {
        return `<div class="sidebar-loading"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
    },
    
    renderSidebar() {
        const sidebarEl = document.getElementById('messages-sidebar');
        if (!sidebarEl) return;
        
        sidebarEl.innerHTML = `
            <!-- Folders -->
            <div class="folder-list">
                ${this.folders.map(f => `
                    <button class="folder-item ${this.selectedFolder === f.id ? 'active' : ''}"
                            onclick="MessagesModule.selectFolder('${f.id}')">
                        <span class="folder-icon">${f.icon}</span>
                        <span class="folder-name">${f.name}</span>
                        ${f.id === 'INBOX' ? '<span class="unread-badge" id="inbox-unread-badge"></span>' : ''}
                    </button>
                `).join('')}
            </div>
            
            <div class="sidebar-divider"></div>
            
            <!-- Accounts -->
            <div class="sidebar-section">
                <h4 class="sidebar-title">Schránky</h4>
                <div class="accounts-list">
                    ${this.accounts.map(acc => `
                        <div class="account-item ${this.selectedAccountId === acc.id ? 'active' : ''}"
                             onclick="MessagesModule.selectAccount('${acc.id}')" title="${acc.email}">
                            <span class="account-type-icon">${acc.account_type === 'shared' ? '👥' : '👤'}</span>
                            <div class="account-info">
                                <div class="account-name">${acc.name}</div>
                                <div class="account-email">${acc.email}</div>
                            </div>
                            <span class="sync-indicator ${acc.sync_status || 'never'}" 
                                  title="${acc.last_sync_at ? 'Posledná sync: ' + new Date(acc.last_sync_at).toLocaleString('sk') : 'Nikdy synchronizované'}">
                                ${acc.sync_status === 'success' ? '✓' : acc.sync_status === 'error' ? '!' : '○'}
                            </span>
                        </div>
                    `).join('')}
                    ${this.accounts.length === 0 ? '<p class="no-accounts">Žiadne schránky.<br><a href="#" onclick="Router.navigate(\'settings\')">Nastaviť</a></p>' : ''}
                </div>
            </div>
        `;
        
        // Update account filter
        const filterEl = document.getElementById('account-filter');
        if (filterEl) {
            filterEl.innerHTML = `
                <option value="">Všetky schránky</option>
                ${this.accounts.map(a => `
                    <option value="${a.id}" ${this.selectedAccountId === a.id ? 'selected' : ''}>
                        ${a.name}
                    </option>
                `).join('')}
            `;
        }
    },
    
    renderLoadingState() {
        return `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Načítavam správy...</p>
            </div>
        `;
    },
    
    renderErrorState(message) {
        return `
            <div class="empty-state error">
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
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>Žiadne správy</h3>
                    <p>${this.searchQuery ? 'Žiadne výsledky pre "' + this.searchQuery + '"' : 'Táto zložka je prázdna'}</p>
                    ${!this.searchQuery ? `<button onclick="MessagesModule.syncEmails()" class="btn-secondary">🔄 Synchronizovať</button>` : ''}
                </div>
            `;
            return;
        }
        
        listEl.innerHTML = `
            <div class="email-list-toolbar">
                <label class="select-all">
                    <input type="checkbox" id="select-all-cb" onchange="MessagesModule.toggleSelectAll(this.checked)">
                    <span>Vybrať všetky</span>
                </label>
                <div class="toolbar-actions">
                    <button onclick="MessagesModule.markSelectedAsRead(true)" class="btn-icon" title="Označiť ako prečítané">✓</button>
                    <button onclick="MessagesModule.markSelectedAsRead(false)" class="btn-icon" title="Označiť ako neprečítané">○</button>
                    <button onclick="MessagesModule.moveSelectedToTrash()" class="btn-icon danger" title="Presunúť do koša">🗑️</button>
                </div>
                <span class="email-count">${this.totalCount} správ</span>
            </div>
            
            <div class="email-list-items">
                ${this.emails.map(email => this.renderEmailRow(email)).join('')}
            </div>
            
            ${this.renderPagination()}
        `;
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
        
        const account = this.accounts.find(a => a.id === email.account_id);
        
        return `
            <div class="email-row ${!email.is_read ? 'unread' : ''} ${this.selectedEmail?.id === email.id ? 'selected' : ''}"
                 onclick="MessagesModule.openEmail('${email.id}')" data-id="${email.id}">
                <div class="email-row-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" class="email-cb" data-id="${email.id}">
                </div>
                <div class="email-row-star" onclick="event.stopPropagation(); MessagesModule.toggleStar('${email.id}')">
                    ${email.is_starred ? '⭐' : '☆'}
                </div>
                <div class="email-row-sender" title="${email.from_address}">
                    ${email.from_name || email.from_address?.split('@')[0] || 'Neznámy'}
                </div>
                <div class="email-row-content">
                    <span class="email-subject">${email.subject || '(Bez predmetu)'}</span>
                    <span class="email-snippet"> — ${email.snippet || ''}</span>
                </div>
                <div class="email-row-meta">
                    ${email.has_attachments ? '<span class="attachment-icon">📎</span>' : ''}
                    ${!this.selectedAccountId && account ? `<span class="account-badge" title="${account.email}">${account.name?.charAt(0) || '?'}</span>` : ''}
                    <span class="email-date">${dateStr}</span>
                </div>
            </div>
        `;
    },
    
    renderPagination() {
        const totalPages = Math.ceil(this.totalCount / this.perPage);
        if (totalPages <= 1) return '';
        
        return `
            <div class="pagination">
                <button onclick="MessagesModule.goToPage(${this.page - 1})" ${this.page <= 1 ? 'disabled' : ''} class="btn-secondary">
                    ← Predošlá
                </button>
                <span class="page-info">${this.page} / ${totalPages}</span>
                <button onclick="MessagesModule.goToPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled' : ''} class="btn-secondary">
                    Ďalšia →
                </button>
            </div>
        `;
    },
    
    renderEmptyDetail() {
        return `
            <div class="detail-empty">
                <div class="detail-empty-icon">📬</div>
                <p>Vyberte správu na zobrazenie</p>
            </div>
        `;
    },
    
    // ===========================================
    // EMAIL DETAIL
    // ===========================================
    
    async openEmail(id) {
        const email = this.emails.find(e => e.id === id);
        if (!email) return;
        
        this.selectedEmail = email;
        this.composeMode = false;
        
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
        
        const detailEl = document.getElementById('messages-detail');
        detailEl.innerHTML = this.renderEmailDetail(email);
        
        // Add active class to layout
        document.getElementById('messages-layout')?.classList.add('detail-open');
    },
    
    renderEmailDetail(email) {
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
            <div class="email-detail">
                <div class="email-detail-toolbar">
                    <button onclick="MessagesModule.closeDetail()" class="btn-icon back-btn">←</button>
                    <div class="detail-actions">
                        <button onclick="MessagesModule.replyToEmail('${email.id}')" class="btn-secondary">↩️ Odpovedať</button>
                        <button onclick="MessagesModule.forwardEmail('${email.id}')" class="btn-secondary">↪️ Preposlať</button>
                        <button onclick="MessagesModule.moveToTrash('${email.id}')" class="btn-icon danger">🗑️</button>
                    </div>
                </div>
                
                <div class="email-detail-content">
                    <h2 class="detail-subject">${email.subject || '(Bez predmetu)'}</h2>
                    
                    <div class="detail-header">
                        <div class="detail-from">
                            <div class="avatar">${(email.from_name || email.from_address || '?')[0].toUpperCase()}</div>
                            <div class="from-info">
                                <div class="from-name">${email.from_name || email.from_address}</div>
                                <div class="from-email">&lt;${email.from_address}&gt;</div>
                            </div>
                        </div>
                        <div class="detail-date">${date}</div>
                    </div>
                    
                    <div class="detail-recipients">
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
                        <div class="detail-attachments">
                            <span class="label">📎 Prílohy (${attachments.length}):</span>
                            <div class="attachment-list">
                                ${attachments.map(a => `
                                    <span class="attachment-chip" title="${a.contentType || ''}">${a.filename}</span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="detail-body">
                        ${email.body_html || (email.body_text || '').replace(/\n/g, '<br>') || '<em class="text-gray-400">Prázdna správa</em>'}
                    </div>
                </div>
            </div>
        `;
    },
    
    closeDetail() {
        this.selectedEmail = null;
        this.composeMode = false;
        
        const detailEl = document.getElementById('messages-detail');
        if (detailEl) {
            detailEl.innerHTML = this.renderEmptyDetail();
        }
        
        document.getElementById('messages-layout')?.classList.remove('detail-open');
        this.renderEmailList();
    },
    
    // ===========================================
    // COMPOSE
    // ===========================================
    
    openCompose(replyTo = null, forward = null) {
        this.composeMode = true;
        this.replyToEmail = replyTo;
        this.forwardEmail = forward;
        
        let to = '';
        let subject = '';
        let bodyContent = '';
        let inReplyToId = null;
        
        if (replyTo) {
            const email = this.emails.find(e => e.id === replyTo);
            if (email) {
                to = email.from_address;
                subject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`;
                bodyContent = `<br><br><hr><p>Dňa ${new Date(email.date).toLocaleString('sk')} napísal/a <strong>${email.from_name || email.from_address}</strong>:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin-left:0;color:#666;">${email.body_html || email.body_text || ''}</blockquote>`;
                inReplyToId = email.id;
            }
        }
        
        if (forward) {
            const email = this.emails.find(e => e.id === forward);
            if (email) {
                subject = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`;
                bodyContent = `<br><br><hr><p>---------- Preposlaná správa ----------<br>Od: ${email.from_name || email.from_address}<br>Dátum: ${new Date(email.date).toLocaleString('sk')}<br>Predmet: ${email.subject || ''}</p><br>${email.body_html || email.body_text || ''}`;
            }
        }
        
        // Default signature
        const defaultSig = this.signatures.find(s => s.is_default);
        if (defaultSig && !replyTo && !forward) {
            bodyContent = `<br><br>${defaultSig.html_content}`;
        }
        
        const detailEl = document.getElementById('messages-detail');
        detailEl.innerHTML = `
            <div class="compose-panel">
                <div class="compose-toolbar">
                    <h3>${replyTo ? 'Odpovedať' : forward ? 'Preposlať' : 'Nový email'}</h3>
                    <button onclick="MessagesModule.closeDetail()" class="btn-icon">✕</button>
                </div>
                
                <form id="compose-form" onsubmit="MessagesModule.sendEmail(event)" class="compose-form">
                    <input type="hidden" name="inReplyToId" value="${inReplyToId || ''}">
                    
                    <div class="compose-field">
                        <label>Od:</label>
                        <select name="accountId" class="compose-select" required>
                            ${this.accounts.map(a => `
                                <option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.display_name || a.name} &lt;${a.email}&gt;</option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="compose-field">
                        <label>Komu:</label>
                        <input type="email" name="to" value="${to}" required class="compose-input" placeholder="email@example.com">
                    </div>
                    
                    <div class="compose-field">
                        <label>Kópia:</label>
                        <input type="text" name="cc" class="compose-input" placeholder="email@example.com (voliteľné)">
                    </div>
                    
                    <div class="compose-field">
                        <label>Predmet:</label>
                        <input type="text" name="subject" value="${subject}" required class="compose-input" placeholder="Predmet správy">
                    </div>
                    
                    <div class="compose-editor-container">
                        <div id="compose-editor"></div>
                    </div>
                    
                    <div class="compose-footer">
                        <div class="compose-footer-left">
                            <select name="signature" onchange="MessagesModule.insertSignature(this.value)" class="signature-picker">
                                <option value="">Vložiť podpis...</option>
                                ${this.signatures.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="compose-footer-right">
                            <button type="button" onclick="MessagesModule.closeDetail()" class="btn-secondary">Zrušiť</button>
                            <button type="submit" class="btn-primary" id="send-email-btn">📤 Odoslať</button>
                        </div>
                    </div>
                </form>
            </div>
        `;
        
        document.getElementById('messages-layout')?.classList.add('detail-open');
        
        // Init Quill
        setTimeout(() => {
            if (!window.Quill) return;
            
            this.quillEditor = new Quill('#compose-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'font': [] }, { 'size': ['small', false, 'large'] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'indent': '-1' }, { 'indent': '+1' }],
                        ['link'],
                        ['clean']
                    ]
                },
                placeholder: 'Napíšte správu...'
            });
            
            if (bodyContent) {
                this.quillEditor.root.innerHTML = bodyContent;
            }
        }, 100);
    },
    
    replyToEmail(id) {
        this.openCompose(id, null);
    },
    
    forwardEmail(id) {
        this.openCompose(null, id);
    },
    
    insertSignature(sigId) {
        if (!sigId || !this.quillEditor) return;
        
        const sig = this.signatures.find(s => s.id === sigId);
        if (!sig?.html_content) return;
        
        const current = this.quillEditor.root.innerHTML;
        this.quillEditor.root.innerHTML = current + '<br><br>' + sig.html_content;
        
        // Reset select
        document.querySelector('select[name="signature"]').value = '';
    },
    
    // ===========================================
    // SEND EMAIL - NETLIFY FUNCTION
    // ===========================================
    
    async sendEmail(e) {
        e.preventDefault();
        
        const form = e.target;
        const sendBtn = document.getElementById('send-email-btn');
        
        sendBtn.disabled = true;
        sendBtn.innerHTML = '⏳ Odosielam...';
        
        try {
            const formData = new FormData(form);
            const htmlBody = this.quillEditor?.root.innerHTML || '';
            const textBody = this.quillEditor?.getText() || '';
            
            // Zavolaj Netlify Function
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
                    inReplyToId: formData.get('inReplyToId') || undefined
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                Utils.toast('Email odoslaný! ✅', 'success');
                this.closeDetail();
                
                // Refresh sent folder
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
            sendBtn.innerHTML = '📤 Odoslať';
        }
    },
    
    // ===========================================
    // ACTIONS
    // ===========================================
    
    selectFolder(folder) {
        this.selectedFolder = folder;
        this.page = 1;
        this.searchQuery = '';
        document.getElementById('email-search').value = '';
        
        // Update UI
        document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.folder-item[onclick*="'${folder}'"]`)?.classList.add('active');
        
        this.closeDetail();
        this.loadEmails();
    },
    
    selectAccount(accountId) {
        this.selectedAccountId = accountId;
        this.page = 1;
        
        // Update UI
        document.querySelectorAll('.account-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.account-item[onclick*="'${accountId}'"]`)?.classList.add('active');
        
        // Update filter
        const filterEl = document.getElementById('account-filter');
        if (filterEl) filterEl.value = accountId;
        
        this.closeDetail();
        this.loadEmails();
    },
    
    filterByAccount(accountId) {
        this.selectedAccountId = accountId || null;
        this.page = 1;
        
        // Update sidebar selection
        document.querySelectorAll('.account-item').forEach(el => el.classList.remove('active'));
        if (accountId) {
            document.querySelector(`.account-item[onclick*="'${accountId}'"]`)?.classList.add('active');
        }
        
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
        
        const newValue = !email.is_starred;
        email.is_starred = newValue;
        
        await Database.client
            .from('emails')
            .update({ is_starred: newValue })
            .eq('id', id);
        
        this.renderEmailList();
    },
    
    async markSelectedAsRead(isRead) {
        const ids = this.getSelectedIds();
        if (ids.length === 0) {
            Utils.toast('Nevybrali ste žiadne správy', 'warning');
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
            Utils.toast('Nevybrali ste žiadne správy', 'warning');
            return;
        }
        
        if (!confirm(`Presunúť ${ids.length} správ do koša?`)) return;
        
        await Database.client
            .from('emails')
            .update({ folder: 'Trash', is_deleted: true })
            .in('id', ids);
        
        this.emails = this.emails.filter(e => !ids.includes(e.id));
        this.renderEmailList();
        Utils.toast(`${ids.length} správ presunutých do koša`, 'success');
    },
    
    async moveToTrash(id) {
        if (!confirm('Presunúť správu do koša?')) return;
        
        await Database.client
            .from('emails')
            .update({ folder: 'Trash', is_deleted: true })
            .eq('id', id);
        
        this.closeDetail();
        this.emails = this.emails.filter(e => e.id !== id);
        this.renderEmailList();
        Utils.toast('Správa presunutá do koša', 'success');
    },
    
    // ===========================================
    // STYLES
    // ===========================================
    
    getStyles() {
        return `<style>
        .messages-module { display: flex; flex-direction: column; height: calc(100vh - 80px); background: #f8fafc; }
        
        /* Header */
        .messages-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: white; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 12px; }
        .messages-header h1 { font-size: 24px; font-weight: 700; margin: 0; }
        .messages-header-left, .messages-header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        
        .search-box { position: relative; }
        .search-box input { width: 200px; padding: 8px 12px 8px 36px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
        .search-box .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 14px; }
        
        .account-filter { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: white; }
        
        .btn-icon-text { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer; font-size: 14px; }
        .btn-icon-text:hover { background: #f1f5f9; }
        .btn-icon-text:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .sync-spinner { width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; }
        
        /* Layout */
        .messages-layout { display: grid; grid-template-columns: 220px 1fr 0; flex: 1; min-height: 0; overflow: hidden; }
        .messages-layout.detail-open { grid-template-columns: 220px 1fr 450px; }
        
        /* Sidebar */
        .messages-sidebar { background: white; border-right: 1px solid #e2e8f0; padding: 16px; overflow-y: auto; }
        
        .folder-list { display: flex; flex-direction: column; gap: 4px; }
        .folder-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: none; background: transparent; border-radius: 8px; cursor: pointer; font-size: 14px; text-align: left; width: 100%; transition: all 0.15s; }
        .folder-item:hover { background: #f1f5f9; }
        .folder-item.active { background: #fff7ed; color: #f97316; font-weight: 600; }
        .folder-icon { font-size: 16px; }
        .folder-name { flex: 1; }
        .unread-badge { background: #f97316; color: white; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 10px; min-width: 18px; text-align: center; display: none; }
        .unread-badge:not(:empty) { display: inline-flex; align-items: center; justify-content: center; }
        
        .sidebar-divider { height: 1px; background: #e2e8f0; margin: 16px 0; }
        .sidebar-title { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        
        .accounts-list { display: flex; flex-direction: column; gap: 4px; }
        .account-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
        .account-item:hover { background: #f1f5f9; }
        .account-item.active { background: #fff7ed; }
        .account-type-icon { font-size: 14px; }
        .account-info { flex: 1; min-width: 0; }
        .account-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .account-email { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sync-indicator { font-size: 10px; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .sync-indicator.success { color: #22c55e; }
        .sync-indicator.error { color: #ef4444; background: #fef2f2; }
        .sync-indicator.never { color: #94a3b8; }
        
        .no-accounts { font-size: 13px; color: #94a3b8; text-align: center; padding: 12px; }
        .no-accounts a { color: #f97316; }
        
        /* Email List */
        .messages-list { background: white; overflow-y: auto; display: flex; flex-direction: column; }
        
        .email-list-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #fafafa; flex-wrap: wrap; }
        .select-all { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; cursor: pointer; }
        .toolbar-actions { display: flex; gap: 4px; }
        .email-count { margin-left: auto; font-size: 13px; color: #94a3b8; }
        
        .email-list-items { flex: 1; }
        
        .email-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.1s; }
        .email-row:hover { background: #f8fafc; }
        .email-row.unread { background: #fffbeb; font-weight: 500; }
        .email-row.unread:hover { background: #fef3c7; }
        .email-row.selected { background: #fff7ed; }
        
        .email-row-checkbox { flex-shrink: 0; }
        .email-row-star { flex-shrink: 0; cursor: pointer; font-size: 16px; }
        .email-row-sender { width: 150px; flex-shrink: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .email-row-content { flex: 1; min-width: 0; display: flex; align-items: baseline; overflow: hidden; }
        .email-subject { font-size: 14px; white-space: nowrap; }
        .email-snippet { font-size: 13px; color: #94a3b8; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .email-row-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .attachment-icon { font-size: 14px; }
        .account-badge { width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: 600; }
        .email-date { font-size: 12px; color: #94a3b8; white-space: nowrap; }
        
        /* Detail Panel */
        .messages-detail { background: white; border-left: 1px solid #e2e8f0; overflow-y: auto; display: flex; flex-direction: column; }
        
        .detail-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
        .detail-empty-icon { font-size: 48px; margin-bottom: 12px; }
        
        .email-detail { display: flex; flex-direction: column; height: 100%; }
        .email-detail-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #fafafa; }
        .back-btn { display: none; }
        .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        
        .email-detail-content { flex: 1; padding: 20px; overflow-y: auto; }
        .detail-subject { font-size: 20px; font-weight: 600; margin-bottom: 16px; line-height: 1.3; }
        
        .detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
        .detail-from { display: flex; gap: 12px; }
        .avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #f97316, #ea580c); color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; flex-shrink: 0; }
        .from-info { }
        .from-name { font-weight: 600; font-size: 15px; }
        .from-email { font-size: 13px; color: #64748b; }
        .detail-date { font-size: 13px; color: #64748b; }
        
        .detail-recipients { margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; }
        .recipient-row { display: flex; gap: 8px; font-size: 13px; margin-bottom: 4px; }
        .recipient-row:last-child { margin-bottom: 0; }
        .recipient-row .label { color: #64748b; width: 50px; flex-shrink: 0; }
        .recipient-row .value { color: #334155; }
        
        .detail-attachments { margin-bottom: 16px; }
        .detail-attachments .label { font-size: 13px; color: #64748b; margin-bottom: 8px; display: block; }
        .attachment-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .attachment-chip { display: inline-block; padding: 6px 12px; background: #f1f5f9; border-radius: 16px; font-size: 12px; }
        
        .detail-body { font-size: 14px; line-height: 1.6; color: #334155; word-wrap: break-word; overflow-wrap: break-word; }
        .detail-body img { max-width: 100%; height: auto; }
        .detail-body blockquote { border-left: 3px solid #e2e8f0; padding-left: 12px; margin-left: 0; color: #64748b; }
        
        /* Compose */
        .compose-panel { display: flex; flex-direction: column; height: 100%; }
        .compose-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #fafafa; }
        .compose-toolbar h3 { font-size: 16px; font-weight: 600; margin: 0; }
        
        .compose-form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .compose-field { display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #f1f5f9; }
        .compose-field label { width: 60px; font-size: 13px; color: #64748b; flex-shrink: 0; }
        .compose-input, .compose-select { flex: 1; border: none; outline: none; font-size: 14px; padding: 6px; min-width: 0; }
        .compose-select { background: transparent; }
        
        .compose-editor-container { flex: 1; display: flex; flex-direction: column; min-height: 200px; }
        #compose-editor { flex: 1; }
        #compose-editor .ql-container { border: none; font-size: 14px; }
        #compose-editor .ql-editor { min-height: 150px; }
        #compose-editor .ql-toolbar { border: none; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
        
        .compose-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid #e2e8f0; background: #fafafa; flex-wrap: wrap; gap: 12px; }
        .compose-footer-left, .compose-footer-right { display: flex; gap: 8px; }
        .signature-picker { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
        
        /* States */
        .loading-state, .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center; }
        .empty-state .empty-icon { font-size: 48px; margin-bottom: 16px; }
        .empty-state h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
        .empty-state p { color: #64748b; margin-bottom: 16px; }
        
        .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 16px; border-top: 1px solid #e2e8f0; }
        .page-info { font-size: 14px; color: #64748b; }
        
        /* Buttons */
        .btn-primary { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 10px 20px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { background: #f1f5f9; color: #475569; padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .btn-secondary:hover { background: #e2e8f0; }
        .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-icon { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .btn-icon:hover { background: #f1f5f9; }
        .btn-icon.danger:hover { background: #fef2f2; }
        
        .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #f97316; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .skeleton-line { height: 16px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 12px; }
        .skeleton-line:nth-child(2) { width: 80%; }
        .skeleton-line:nth-child(3) { width: 60%; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        
        /* Mobile */
        @media (max-width: 1024px) {
            .messages-layout { grid-template-columns: 1fr !important; }
            .messages-layout.detail-open .messages-sidebar,
            .messages-layout.detail-open .messages-list { display: none; }
            .messages-sidebar { display: none; }
            .back-btn { display: flex !important; }
            .email-row-sender { width: 120px; }
        }
        
        @media (max-width: 768px) {
            .messages-header { padding: 12px 16px; }
            .messages-header h1 { font-size: 20px; }
            .search-box input { width: 150px; }
            .email-row { padding: 10px 12px; gap: 8px; }
            .email-row-sender { width: 100px; }
            .detail-actions { gap: 4px; }
            .detail-actions .btn-secondary { padding: 6px 10px; font-size: 12px; }
        }
        </style>`;
    }
};

// Register module
if (typeof App !== 'undefined') {
    App.register(MessagesModule);
}
