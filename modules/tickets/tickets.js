/**
 * ADLIFY - Tickets Module
 * Helpdesk a požiadavky od klientov
 */

const TicketsModule = {
    id: 'tickets',
    name: 'Tickety',
    icon: '🎫',
    title: 'Tickety',
    menu: { section: 'main', order: 47 },
    permissions: ['tickets', 'view'],

    // Data
    tickets: [],
    teamMembers: [],
    clients: [],
    currentFilter: 'open',
    selectedTicket: null,

    async init() {
        console.log('🎫 Tickets module initialized');
        this._injectStyles();
    },

    _injectStyles() {
        if (document.getElementById('tickets-module-styles')) return;
        const style = document.createElement('style');
        style.id = 'tickets-module-styles';
        style.innerHTML = this.getStyles()
            .replace(/^[\s\S]*?<style>/, '')
            .replace(/<\/style>[\s\S]*$/, '');
        document.head.appendChild(style);
    },

    async render(container) {
        this._injectStyles();
        const filter = this.currentFilter || 'open';
        container.innerHTML = `
            <div class="adl tickets-module">
                <!-- Header -->
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Tickety</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">Požiadavky a helpdesk</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="TicketsModule.showCreateModal()">${I.Plus({size:14})} Nový ticket</button>
                    </div>
                </div>

                <!-- Stats -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:16px;" class="adl-tickets-stats">
                    <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Otvorené</div><span class="adl-chip adl-chip-sky adl-chip-sm">nové</span></div><div class="adl-stat-value" id="stat-open">—</div></div>
                    <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">V riešení</div><span class="adl-chip adl-chip-amber adl-chip-sm">aktívne</span></div><div class="adl-stat-value" id="stat-progress">—</div></div>
                    <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Čaká na odpoveď</div><span class="adl-chip adl-chip-lav adl-chip-sm">pending</span></div><div class="adl-stat-value" id="stat-waiting">—</div></div>
                    <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Vyriešené</div><span class="adl-chip adl-chip-ok adl-chip-sm">done</span></div><div class="adl-stat-value" id="stat-resolved">—</div></div>
                </div>

                <!-- Filters -->
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap;" class="adl-tickets-filters">
                    <div style="display:inline-flex; background:var(--n-75); border-radius:9px; padding:3px; flex-wrap:wrap;">
                        ${[
                            ['open', 'Otvorené'],
                            ['in_progress', 'V riešení'],
                            ['waiting', 'Čakajúce'],
                            ['all', 'Všetky'],
                            ['my', 'Moje']
                        ].map(([k,l]) => `<button onclick="TicketsModule.setFilter('${k}')" class="adl-btn adl-btn-sm ${filter===k?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">${l}</button>`).join('')}
                    </div>
                    <div class="adl-input" style="flex:1; min-width:200px; max-width:340px; margin-left:auto;">
                        <span style="color:var(--ink-mute); display:flex;">${I.Search({size:15})}</span>
                        <input type="text" id="ticket-search" placeholder="Hľadať tickety…" oninput="TicketsModule.handleSearch()" style="flex:1; border:0; outline:none; background:transparent; font:inherit; color:inherit;">
                    </div>
                </div>

                <!-- Content -->
                <div id="tickets-content">
                    <div style="text-align:center; padding:40px; color:var(--ink-mute);">Načítavam tickety…</div>
                </div>

                <style>
                  @media (max-width: 900px) { .adl-tickets-stats { grid-template-columns: repeat(2, 1fr) !important; } }
                </style>
            </div>
        `;

        await this.loadData();
        this.renderContent();
    },

    async loadData() {
        try {
            // Load tickets
            const { data: tickets, error: ticketsError } = await Database.client
                .from('tickets')
                .select('*, assigned:team_members!assigned_to(*)')
                .order('created_at', { ascending: false });

            if (ticketsError) throw ticketsError;
            this.tickets = tickets || [];

            // Load team members
            const { data: members } = await Database.client
                .from('team_members')
                .select('*')
                .eq('status', 'active');
            this.teamMembers = members || [];

            // Load clients
            const { data: clients } = await Database.client
                .from('clients')
                .select('id, company_name');
            this.clients = clients || [];

            // Update stats
            this.updateStats();

        } catch (error) {
            console.error('Load tickets error:', error);
            Utils.showNotification('Chyba pri načítaní ticketov', 'error');
        }
    },

    updateStats() {
        const stats = {
            open: this.tickets.filter(t => t.status === 'open').length,
            progress: this.tickets.filter(t => t.status === 'in_progress').length,
            waiting: this.tickets.filter(t => t.status === 'waiting').length,
            resolved: this.tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length
        };

        document.getElementById('stat-open').textContent = stats.open;
        document.getElementById('stat-progress').textContent = stats.progress;
        document.getElementById('stat-waiting').textContent = stats.waiting;
        document.getElementById('stat-resolved').textContent = stats.resolved;
    },

    renderContent() {
        const container = document.getElementById('tickets-content');
        if (!container) return;

        const filtered = this.getFilteredTickets();

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Ticket({size:22})}</div>
                    <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne tickety</h3>
                    <p style="font-size:13px; color:var(--ink-sub); margin:0;">Zatiaľ nemáte žiadne tickety v tejto kategórii</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${filtered.map(ticket => this.renderTicketRow(ticket)).join('')}
            </div>
        `;
    },

    renderTicketRow(ticket) {
        const statusMap = {
            open:        { label: 'Otvorený',   tone: 'sky' },
            in_progress: { label: 'V riešení',  tone: 'amber' },
            waiting:     { label: 'Čaká',       tone: 'lav' },
            resolved:    { label: 'Vyriešený',  tone: 'ok' },
            closed:      { label: 'Uzavretý',   tone: 'n' }
        };
        const priorityMap = {
            low: { label: 'Nízka', tone: 'mint' },
            medium: { label: 'Stredná', tone: 'amber' },
            high: { label: 'Vysoká', tone: 'brand' },
            urgent: { label: 'Urgentná', tone: 'err' }
        };
        const categoryLabel = ({
            general: 'Všeobecné', billing: 'Fakturácia', technical: 'Technické',
            campaign: 'Kampane', feature: 'Nová funkcia', bug: 'Chyba', other: 'Iné'
        })[ticket.category] || ticket.category;

        const status = statusMap[ticket.status] || statusMap.open;
        const priority = priorityMap[ticket.priority] || priorityMap.medium;
        const assignedName = ticket.assigned ? `${ticket.assigned.first_name} ${ticket.assigned.last_name}` : 'Nepriradené';
        const assignedInitials = ticket.assigned ? `${ticket.assigned.first_name[0]}${ticket.assigned.last_name[0]}` : '?';
        const timeAgo = this.timeAgo(ticket.created_at);

        return `
            <div onclick="TicketsModule.openTicket('${ticket.id}')" style="display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; transition: border-color .12s, box-shadow .12s;" onmouseover="this.style.borderColor='var(--border-strong)'; this.style.boxShadow='var(--sh-sm)'" onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='none'">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                        <span class="mono" style="font-size:11px; color:var(--ink-mute);">#${ticket.id.slice(0, 8)}</span>
                        <span class="adl-chip adl-chip-sm">${categoryLabel}</span>
                        <span class="adl-chip adl-chip-${priority.tone} adl-chip-sm">${priority.label}</span>
                        <span class="adl-chip adl-chip-${status.tone} adl-chip-sm"><span class="dot"></span>${status.label}</span>
                    </div>
                    <div style="font-size:14px; font-weight:600; letter-spacing:-0.1px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ticket.subject}</div>
                    ${ticket.description ? `<div style="font-size:12px; color:var(--ink-sub); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ticket.description.substring(0, 140)}${ticket.description.length > 140 ? '…' : ''}</div>` : ''}
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
                    <div class="adl-avatar adl-avatar-sm" title="${assignedName}">${assignedInitials}</div>
                    <div style="font-size:10px; color:var(--ink-mute);">${timeAgo}</div>
                </div>
            </div>
        `;
    },

    getFilteredTickets() {
        let filtered = [...this.tickets];

        // Filter by status
        if (this.currentFilter === 'my') {
            const myId = Auth.teamMember?.id;
            filtered = filtered.filter(t => t.assigned_to === myId);
        } else if (this.currentFilter !== 'all') {
            filtered = filtered.filter(t => t.status === this.currentFilter);
        }

        // Search
        const searchQuery = document.getElementById('ticket-search')?.value?.toLowerCase();
        if (searchQuery) {
            filtered = filtered.filter(t => 
                t.subject.toLowerCase().includes(searchQuery) ||
                t.description?.toLowerCase().includes(searchQuery) ||
                t.id.includes(searchQuery)
            );
        }

        return filtered;
    },

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
        event.target.classList.add('active');
        this.renderContent();
    },

    handleSearch() {
        this.renderContent();
    },

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal ticket-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">🎫</span>
                        <h2>Nový ticket</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="ticket-form">
                        <div class="form-group">
                            <label>Predmet *</label>
                            <input type="text" name="subject" required placeholder="Stručný popis problému">
                        </div>
                        
                        <div class="form-group">
                            <label>Popis</label>
                            <textarea name="description" rows="4" placeholder="Detailný popis požiadavky..."></textarea>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Kategória</label>
                                <select name="category">
                                    <option value="general">Všeobecné</option>
                                    <option value="billing">Fakturácia</option>
                                    <option value="technical">Technické</option>
                                    <option value="campaign">Kampane</option>
                                    <option value="feature">Nová funkcia</option>
                                    <option value="bug">Chyba</option>
                                    <option value="other">Iné</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Priorita</label>
                                <select name="priority">
                                    <option value="low">🟢 Nízka</option>
                                    <option value="medium" selected>🟡 Stredná</option>
                                    <option value="high">🟠 Vysoká</option>
                                    <option value="urgent">🔴 Urgentná</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Priradiť</label>
                                <select name="assigned_to">
                                    <option value="">-- Nepriradené --</option>
                                    ${this.teamMembers.map(m => `
                                        <option value="${m.id}">${m.first_name} ${m.last_name}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Klient</label>
                                <select name="client_id">
                                    <option value="">-- Bez klienta --</option>
                                    ${this.clients.map(c => `
                                        <option value="${c.id}">${c.company_name}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="TicketsModule.saveTicket()">
                        Vytvoriť ticket
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveTicket() {
        const form = document.getElementById('ticket-form');
        const formData = new FormData(form);

        const ticketData = {
            subject: formData.get('subject'),
            description: formData.get('description') || null,
            category: formData.get('category'),
            priority: formData.get('priority'),
            assigned_to: formData.get('assigned_to') || null,
            client_id: formData.get('client_id') || null,
            created_by_team: Auth.teamMember?.id,
            status: 'open'
        };

        try {
            const { data, error } = await Database.client
                .from('tickets')
                .insert([ticketData])
                .select('*, assigned:team_members!assigned_to(*)')
                .single();

            if (error) throw error;

            this.tickets.unshift(data);
            document.querySelector('.modal-overlay').remove();
            this.updateStats();
            this.renderContent();
            Utils.showNotification('Ticket vytvorený', 'success');

        } catch (error) {
            console.error('Save ticket error:', error);
            Utils.showNotification('Chyba pri vytváraní ticketu', 'error');
        }
    },

    async openTicket(ticketId) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        this.selectedTicket = ticket;

        // Load replies
        const { data: replies } = await Database.client
            .from('ticket_replies')
            .select('*, author:team_members!author_team_id(*)')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        const statusConfig = {
            open: { icon: '📬', label: 'Otvorený' },
            in_progress: { icon: '🔄', label: 'V riešení' },
            waiting: { icon: '⏳', label: 'Čaká na odpoveď' },
            resolved: { icon: '✅', label: 'Vyriešený' },
            closed: { icon: '🔒', label: 'Uzavretý' }
        };

        const categoryConfig = {
            general: 'Všeobecné',
            billing: 'Fakturácia',
            technical: 'Technické',
            campaign: 'Kampane',
            feature: 'Nová funkcia',
            bug: 'Chyba',
            other: 'Iné'
        };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal ticket-modal ticket-detail-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="ticket-id-badge">#${ticket.id.slice(0, 8)}</span>
                        <h2>${ticket.subject}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="ticket-detail-grid">
                        <div class="ticket-main-content">
                            <!-- Popis -->
                            ${ticket.description ? `
                                <div class="ticket-description">
                                    <h4>Popis</h4>
                                    <p style="white-space:pre-line;line-height:1.6;">${ticket.description}</p>
                                </div>
                            ` : ''}
                            
                            <!-- Konverzácia -->
                            <div class="ticket-conversation">
                                <h4>Konverzácia</h4>
                                <div class="replies-list" id="replies-list">
                                    ${replies && replies.length > 0 ? replies.map(reply => `
                                        <div class="reply ${reply.is_internal ? 'internal' : ''}">
                                            <div class="reply-avatar">
                                                ${reply.author ? reply.author.first_name[0] + reply.author.last_name[0] : '?'}
                                            </div>
                                            <div class="reply-content">
                                                <div class="reply-header">
                                                    <span class="reply-author">${reply.author ? reply.author.first_name + ' ' + reply.author.last_name : reply.author_name || 'Neznámy'}</span>
                                                    ${reply.is_internal ? '<span class="internal-badge">Interná poznámka</span>' : ''}
                                                    <span class="reply-time">${this.formatDateTime(reply.created_at)}</span>
                                                </div>
                                                <div class="reply-text">${reply.content}</div>
                                            </div>
                                        </div>
                                    `).join('') : '<p class="no-replies">Zatiaľ žiadne odpovede</p>'}
                                </div>
                                
                                <!-- Reply form -->
                                <div class="reply-form">
                                    <textarea id="reply-content" placeholder="Napíš odpoveď..." rows="3"></textarea>
                                    <div class="reply-actions">
                                        <label class="internal-checkbox">
                                            <input type="checkbox" id="reply-internal">
                                            <span>Interná poznámka (klient neuvidí)</span>
                                        </label>
                                        <button class="btn-primary" onclick="TicketsModule.addReply()">Odpovedať</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="ticket-sidebar">
                            <div class="sidebar-item">
                                <label>Status</label>
                                <select id="ticket-status" onchange="TicketsModule.updateTicketField('status', this.value)">
                                    <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>📬 Otvorený</option>
                                    <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>🔄 V riešení</option>
                                    <option value="waiting" ${ticket.status === 'waiting' ? 'selected' : ''}>⏳ Čaká na odpoveď</option>
                                    <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>✅ Vyriešený</option>
                                    <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>🔒 Uzavretý</option>
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Priorita</label>
                                <select id="ticket-priority" onchange="TicketsModule.updateTicketField('priority', this.value)">
                                    <option value="low" ${ticket.priority === 'low' ? 'selected' : ''}>🟢 Nízka</option>
                                    <option value="medium" ${ticket.priority === 'medium' ? 'selected' : ''}>🟡 Stredná</option>
                                    <option value="high" ${ticket.priority === 'high' ? 'selected' : ''}>🟠 Vysoká</option>
                                    <option value="urgent" ${ticket.priority === 'urgent' ? 'selected' : ''}>🔴 Urgentná</option>
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Priradené</label>
                                <select id="ticket-assignee" onchange="TicketsModule.updateTicketField('assigned_to', this.value)">
                                    <option value="">-- Nepriradené --</option>
                                    ${this.teamMembers.map(m => `
                                        <option value="${m.id}" ${ticket.assigned_to === m.id ? 'selected' : ''}>
                                            ${m.first_name} ${m.last_name}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Kategória</label>
                                <span class="sidebar-value">${categoryConfig[ticket.category] || ticket.category}</span>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Vytvorené</label>
                                <span class="sidebar-value">${this.formatDateTime(ticket.created_at)}</span>
                            </div>
                            
                            ${ticket.resolved_at ? `
                                <div class="sidebar-item">
                                    <label>Vyriešené</label>
                                    <span class="sidebar-value">${this.formatDateTime(ticket.resolved_at)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-danger" onclick="TicketsModule.deleteTicket('${ticket.id}')">
                        Zmazať ticket
                    </button>
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async updateTicketField(field, value) {
        if (!this.selectedTicket) return;

        const updateData = { [field]: value || null };
        
        // Ak sa mení status na resolved, pridáme timestamp
        if (field === 'status' && value === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }
        if (field === 'status' && value === 'closed') {
            updateData.closed_at = new Date().toISOString();
        }

        try {
            const { error } = await Database.client
                .from('tickets')
                .update(updateData)
                .eq('id', this.selectedTicket.id);

            if (error) throw error;

            this.selectedTicket[field] = value;
            const idx = this.tickets.findIndex(t => t.id === this.selectedTicket.id);
            if (idx >= 0) this.tickets[idx][field] = value;
            
            this.updateStats();
            Utils.showNotification('Uložené', 'success');

        } catch (error) {
            console.error('Update ticket error:', error);
            Utils.showNotification('Chyba pri ukladaní', 'error');
        }
    },

    async addReply() {
        if (!this.selectedTicket) return;

        const content = document.getElementById('reply-content').value.trim();
        if (!content) return;

        const isInternal = document.getElementById('reply-internal').checked;

        try {
            const { data, error } = await Database.client
                .from('ticket_replies')
                .insert([{
                    ticket_id: this.selectedTicket.id,
                    author_team_id: Auth.teamMember?.id,
                    author_name: `${Auth.teamMember?.first_name} ${Auth.teamMember?.last_name}`,
                    content: content,
                    is_internal: isInternal
                }])
                .select('*, author:team_members!author_team_id(*)')
                .single();

            if (error) throw error;

            // Update first_response_at ak je to prvá odpoveď
            if (!this.selectedTicket.first_response_at) {
                await Database.client
                    .from('tickets')
                    .update({ first_response_at: new Date().toISOString() })
                    .eq('id', this.selectedTicket.id);
            }

            // Add reply to UI
            const repliesList = document.getElementById('replies-list');
            const noReplies = repliesList.querySelector('.no-replies');
            if (noReplies) noReplies.remove();

            repliesList.insertAdjacentHTML('beforeend', `
                <div class="reply ${data.is_internal ? 'internal' : ''}">
                    <div class="reply-avatar">
                        ${data.author ? data.author.first_name[0] + data.author.last_name[0] : '?'}
                    </div>
                    <div class="reply-content">
                        <div class="reply-header">
                            <span class="reply-author">${data.author ? data.author.first_name + ' ' + data.author.last_name : 'Ty'}</span>
                            ${data.is_internal ? '<span class="internal-badge">Interná poznámka</span>' : ''}
                            <span class="reply-time">Teraz</span>
                        </div>
                        <div class="reply-text">${data.content}</div>
                    </div>
                </div>
            `);

            // Clear form
            document.getElementById('reply-content').value = '';
            document.getElementById('reply-internal').checked = false;

            Utils.showNotification('Odpoveď odoslaná', 'success');

        } catch (error) {
            console.error('Add reply error:', error);
            Utils.showNotification('Chyba pri odosielaní', 'error');
        }
    },

    async deleteTicket(ticketId) {
        if (!await Utils.confirm('Zmazať tento ticket?', { title: 'Zmazať ticket', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;

        try {
            const { error } = await Database.client
                .from('tickets')
                .delete()
                .eq('id', ticketId);

            if (error) throw error;

            this.tickets = this.tickets.filter(t => t.id !== ticketId);
            document.querySelector('.modal-overlay')?.remove();
            this.updateStats();
            this.renderContent();
            Utils.showNotification('Ticket zmazaný', 'success');

        } catch (error) {
            console.error('Delete ticket error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    timeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'Práve teraz';
        if (diff < 3600) return `pred ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `pred ${Math.floor(diff / 3600)} hod`;
        if (diff < 604800) return `pred ${Math.floor(diff / 86400)} dňami`;
        return date.toLocaleDateString('sk-SK');
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString('sk-SK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    getStyles() {
        return `
            <style>
                .tickets-module {
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
                    transition: all 0.2s;
                }

                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
                }

                /* Stats */
                .tickets-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                @media (max-width: 768px) {
                    .tickets-stats {
                        grid-template-columns: repeat(2, 1fr);
                    }
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

                .stat-icon.open { background: #dbeafe; }
                .stat-icon.progress { background: #fef3c7; }
                .stat-icon.waiting { background: #fce7f3; }
                .stat-icon.resolved { background: #d1fae5; }

                .stat-info {
                    display: flex;
                    flex-direction: column;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #1e293b;
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

                .filter-tabs {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }

                .filter-tab {
                    padding: 0.5rem 1rem;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #64748b;
                }

                .filter-tab:hover {
                    background: #e2e8f0;
                }

                .filter-tab.active {
                    background: #6366f1;
                    color: white;
                }

                .filter-search input {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    width: 250px;
                }

                /* Tickets List */
                .tickets-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .ticket-row {
                    background: white;
                    border-radius: 12px;
                    padding: 1rem 1.25rem;
                    border: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .ticket-row:hover {
                    border-color: #6366f1;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
                }

                .ticket-status {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    flex-shrink: 0;
                }

                .ticket-status.status-open { background: #dbeafe; }
                .ticket-status.status-progress { background: #fef3c7; }
                .ticket-status.status-waiting { background: #fce7f3; }
                .ticket-status.status-resolved { background: #d1fae5; }
                .ticket-status.status-closed { background: #f1f5f9; }

                .ticket-main {
                    flex: 1;
                    min-width: 0;
                }

                .ticket-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 0.25rem;
                }

                .ticket-id {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    font-family: monospace;
                }

                .ticket-category {
                    font-size: 0.75rem;
                    color: #64748b;
                    background: #f1f5f9;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                }

                .ticket-priority {
                    font-size: 0.7rem;
                    font-weight: 600;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                }

                .priority-low { background: #d1fae5; color: #059669; }
                .priority-medium { background: #fef3c7; color: #d97706; }
                .priority-high { background: #fed7aa; color: #ea580c; }
                .priority-urgent { background: #fecaca; color: #dc2626; }

                .ticket-subject {
                    font-size: 1rem;
                    font-weight: 600;
                    color: #1e293b;
                    margin: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .ticket-preview {
                    font-size: 0.875rem;
                    color: #64748b;
                    margin: 0.25rem 0 0 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .ticket-meta {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-shrink: 0;
                }

                .ticket-assignee {
                    width: 32px;
                    height: 32px;
                }

                .assignee-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .ticket-time {
                    font-size: 0.8rem;
                    color: #94a3b8;
                    white-space: nowrap;
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .empty-state h3 {
                    color: #1e293b;
                    margin-bottom: 0.5rem;
                }

                .empty-state p {
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

                .ticket-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .ticket-detail-modal {
                    max-width: 1000px;
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
                    gap: 1rem;
                }

                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }

                .modal-icon {
                    font-size: 1.5rem;
                }

                .ticket-id-badge {
                    font-size: 0.875rem;
                    font-family: monospace;
                    background: #f1f5f9;
                    padding: 0.25rem 0.75rem;
                    border-radius: 6px;
                    color: #64748b;
                }

                .modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 8px;
                    font-size: 1.25rem;
                    cursor: pointer;
                    color: #64748b;
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
                    gap: 0.75rem;
                }

                .ticket-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 280px;
                    gap: 2rem;
                }

                @media (max-width: 768px) {
                    .ticket-detail-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .ticket-description {
                    margin-bottom: 2rem;
                }

                .ticket-description h4,
                .ticket-conversation h4 {
                    font-size: 0.875rem;
                    color: #64748b;
                    margin: 0 0 0.75rem 0;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .ticket-description p {
                    color: #1e293b;
                    line-height: 1.6;
                }

                /* Replies */
                .replies-list {
                    max-height: 400px;
                    overflow-y: auto;
                    margin-bottom: 1rem;
                }

                .reply {
                    display: flex;
                    gap: 0.75rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 8px;
                    margin-bottom: 0.75rem;
                }

                .reply.internal {
                    background: #fef3c7;
                    border: 1px dashed #fbbf24;
                }

                .reply-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .reply-content {
                    flex: 1;
                }

                .reply-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.25rem;
                    flex-wrap: wrap;
                }

                .reply-author {
                    font-weight: 600;
                    font-size: 0.875rem;
                }

                .reply-time {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .internal-badge {
                    font-size: 0.7rem;
                    background: #fbbf24;
                    color: #78350f;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                }

                .reply-text {
                    font-size: 0.875rem;
                    color: #475569;
                    line-height: 1.5;
                }

                .no-replies {
                    text-align: center;
                    color: #94a3b8;
                    padding: 2rem;
                }

                .reply-form textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    resize: none;
                    font-size: 0.875rem;
                    margin-bottom: 0.75rem;
                }

                .reply-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .internal-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    color: #64748b;
                    cursor: pointer;
                }

                /* Sidebar */
                .ticket-sidebar {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 1rem;
                }

                .sidebar-item {
                    margin-bottom: 1rem;
                }

                .sidebar-item label {
                    display: block;
                    font-size: 0.75rem;
                    color: #64748b;
                    margin-bottom: 0.375rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .sidebar-item select {
                    width: 100%;
                    padding: 0.5rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .sidebar-value {
                    font-size: 0.875rem;
                    color: #1e293b;
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
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
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
window.TicketsModule = TicketsModule;
