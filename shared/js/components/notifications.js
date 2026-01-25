/**
 * ADLIFY - Notifications Component
 * Bell ikona v headeri s dropdown
 */

const Notifications = {
    notifications: [],
    unreadCount: 0,
    isOpen: false,

    async init() {
        console.log('🔔 Notifications initialized');
        await this.load();
        this.render();
        
        // Refresh every 30 seconds
        setInterval(() => this.load(), 30000);
    },

    async load() {
        try {
            const teamMemberId = Auth.teamMember?.id;
            if (!teamMemberId) return;

            // Načítaj osobné + systémové notifikácie (user_id = null)
            const { data, error } = await Database.client
                .from('notifications')
                .select('*')
                .or(`user_id.eq.${teamMemberId},user_id.is.null`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            this.notifications = data || [];
            this.unreadCount = this.notifications.filter(n => !n.is_read).length;
            this.updateBadge();

        } catch (error) {
            console.error('Load notifications error:', error);
        }
    },

    render() {
        // Nájdi header-right
        const header = document.getElementById('header-right');
        if (!header) return;

        // Ak už existuje, odstráň
        const existing = document.getElementById('notifications-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'notifications-container';
        container.innerHTML = `
            <div class="notifications-wrapper">
                <button class="notifications-bell" onclick="Notifications.toggle()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span class="notifications-badge ${this.unreadCount > 0 ? 'show' : ''}" id="notifications-badge">
                        ${this.unreadCount > 9 ? '9+' : this.unreadCount}
                    </span>
                </button>
                
                <div class="notifications-dropdown ${this.isOpen ? 'open' : ''}" id="notifications-dropdown">
                    <div class="notifications-header">
                        <h3>Notifikácie</h3>
                        ${this.unreadCount > 0 ? `
                            <button class="mark-all-read" onclick="Notifications.markAllRead()">
                                Označiť všetky ako prečítané
                            </button>
                        ` : ''}
                    </div>
                    <div class="notifications-list" id="notifications-list">
                        ${this.renderList()}
                    </div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        // Pridaj na koniec (pravá strana)
        header.appendChild(container);

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#notifications-container') && this.isOpen) {
                this.close();
            }
        });
    },

    renderList() {
        if (this.notifications.length === 0) {
            return `
                <div class="notifications-empty">
                    <span class="empty-icon">🔔</span>
                    <p>Žiadne notifikácie</p>
                </div>
            `;
        }

        return this.notifications.map(n => this.renderItem(n)).join('');
    },

    renderItem(notification) {
        const icons = {
            new_lead: '🎯',
            task_assigned: '✅',
            ticket_reply: '💬',
            payment_received: '💰',
            invoice_overdue: '⚠️',
            client_message: '📧',
            conversion: '🎉',
            question: '❓',
            rejection: '🚫',
            system: '⚙️',
            default: '📌'
        };

        const icon = icons[notification.type] || icons.default;
        const timeAgo = this.timeAgo(notification.created_at);

        return `
            <div class="notification-item ${notification.is_read ? 'read' : 'unread'}" 
                 onclick="Notifications.handleClick('${notification.id}', '${notification.action_url || ''}')">
                <div class="notification-icon">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${notification.title}</div>
                    ${notification.message ? `<div class="notification-message">${notification.message}</div>` : ''}
                    <div class="notification-time">${timeAgo}</div>
                </div>
                ${!notification.is_read ? '<div class="notification-dot"></div>' : ''}
            </div>
        `;
    },

    updateBadge() {
        const badge = document.getElementById('notifications-badge');
        if (badge) {
            badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
            badge.classList.toggle('show', this.unreadCount > 0);
        }
    },

    toggle() {
        this.isOpen = !this.isOpen;
        const dropdown = document.getElementById('notifications-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('open', this.isOpen);
        }
    },

    close() {
        this.isOpen = false;
        const dropdown = document.getElementById('notifications-dropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
        }
    },

    async handleClick(id, actionUrl) {
        // Mark as read
        await this.markAsRead(id);

        // Navigate if URL provided
        if (actionUrl) {
            if (actionUrl.startsWith('#')) {
                Router.navigate(actionUrl.substring(1));
            } else {
                window.location.href = actionUrl;
            }
        }

        this.close();
    },

    async markAsRead(id) {
        try {
            const { error } = await Database.client
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            const notification = this.notifications.find(n => n.id === id);
            if (notification && !notification.is_read) {
                notification.is_read = true;
                this.unreadCount--;
                this.updateBadge();
                
                // Update UI
                const item = document.querySelector(`.notification-item[onclick*="${id}"]`);
                if (item) {
                    item.classList.remove('unread');
                    item.classList.add('read');
                    item.querySelector('.notification-dot')?.remove();
                }
            }

        } catch (error) {
            console.error('Mark as read error:', error);
        }
    },

    async markAllRead() {
        try {
            const teamMemberId = Auth.teamMember?.id;
            if (!teamMemberId) return;

            const { error } = await Database.client
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('user_id', teamMemberId)
                .eq('is_read', false);

            if (error) throw error;

            this.notifications.forEach(n => n.is_read = true);
            this.unreadCount = 0;
            this.updateBadge();

            // Refresh list
            document.getElementById('notifications-list').innerHTML = this.renderList();

            Utils.showNotification('Všetky notifikácie označené ako prečítané', 'success');

        } catch (error) {
            console.error('Mark all read error:', error);
        }
    },

    // Helper: Vytvoriť notifikáciu
    async create(userId, type, title, message = null, entityType = null, entityId = null, actionUrl = null) {
        try {
            const { error } = await Database.client
                .from('notifications')
                .insert([{
                    user_id: userId,
                    type,
                    title,
                    message,
                    entity_type: entityType,
                    entity_id: entityId,
                    action_url: actionUrl
                }]);

            if (error) throw error;

            // Ak je to pre aktuálneho používateľa, reload
            if (userId === Auth.teamMember?.id) {
                await this.load();
                this.updateBadge();
            }

        } catch (error) {
            console.error('Create notification error:', error);
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

    getStyles() {
        return `
            <style>
                .notifications-wrapper {
                    position: relative;
                }

                .notifications-bell {
                    position: relative;
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    transition: all 0.2s;
                }

                .notifications-bell:hover {
                    background: #e2e8f0;
                    color: #1e293b;
                }

                .notifications-badge {
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    min-width: 18px;
                    height: 18px;
                    background: #ef4444;
                    color: white;
                    font-size: 0.7rem;
                    font-weight: 600;
                    border-radius: 9px;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px;
                }

                .notifications-badge.show {
                    display: flex;
                }

                .notifications-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    width: 360px;
                    max-height: 480px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    border: 1px solid #e2e8f0;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.2s;
                    z-index: 1000;
                    overflow: hidden;
                }

                .notifications-dropdown.open {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .notifications-header {
                    padding: 1rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .notifications-header h3 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 600;
                }

                .mark-all-read {
                    background: none;
                    border: none;
                    color: #6366f1;
                    font-size: 0.8rem;
                    cursor: pointer;
                }

                .mark-all-read:hover {
                    text-decoration: underline;
                }

                .notifications-list {
                    max-height: 400px;
                    overflow-y: auto;
                }

                .notifications-empty {
                    padding: 3rem 1rem;
                    text-align: center;
                    color: #94a3b8;
                }

                .notifications-empty .empty-icon {
                    font-size: 2.5rem;
                    display: block;
                    margin-bottom: 0.5rem;
                }

                .notification-item {
                    display: flex;
                    gap: 0.75rem;
                    padding: 1rem;
                    cursor: pointer;
                    transition: background 0.2s;
                    position: relative;
                    border-bottom: 1px solid #f1f5f9;
                }

                .notification-item:hover {
                    background: #f8fafc;
                }

                .notification-item.unread {
                    background: #f0f9ff;
                }

                .notification-item.unread:hover {
                    background: #e0f2fe;
                }

                .notification-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1rem;
                    flex-shrink: 0;
                }

                .notification-content {
                    flex: 1;
                    min-width: 0;
                }

                .notification-title {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #1e293b;
                    margin-bottom: 0.125rem;
                }

                .notification-message {
                    font-size: 0.8rem;
                    color: #64748b;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .notification-time {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    margin-top: 0.25rem;
                }

                .notification-dot {
                    width: 8px;
                    height: 8px;
                    background: #6366f1;
                    border-radius: 50%;
                    flex-shrink: 0;
                    margin-top: 4px;
                }
            </style>
        `;
    }
};

// Export
window.Notifications = Notifications;
