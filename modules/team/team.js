// =====================================================
// ADLIFY - Team Module (Používatelia a role)
// =====================================================

const TeamModule = {
    id: 'team',
    name: 'Tím',
    icon: '👥',
    title: 'Tím',
    menu: { section: 'settings', order: 20 },
    permissions: [],
    
    // Cache dát
    members: [],
    permissions: [],
    activityLog: [],
    currentTab: 'members',

    async init() {
        console.log('TeamModule initialized');
    },

    async render(container, params = {}) {
        await this.loadData();
        const tab = this.currentTab || 'members';

        container.innerHTML = `
            <div class="adl team-module">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Tím</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">Správa členov tímu a oprávnení</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="TeamModule.showInviteModal()">${I.Plus({size:14})} Pozvať člena</button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="team-stats-grid">
                    ${this.renderStats()}
                </div>

                <!-- Tabs -->
                <div style="display:flex; gap:2px; background:var(--n-75); border-radius:10px; padding:4px; margin:16px 0;">
                    <button onclick="TeamModule.switchTab('members')" class="adl-btn adl-btn-sm ${tab==='members'?'adl-btn-ink':'adl-btn-ghost'} tab-btn ${tab==='members'?'active':''}" style="border-radius:7px; padding:0 12px;">Členovia <span class="adl-chip adl-chip-sm" style="margin-left:4px;">${this.members.length}</span></button>
                    <button onclick="TeamModule.switchTab('roles')" class="adl-btn adl-btn-sm ${tab==='roles'?'adl-btn-ink':'adl-btn-ghost'} tab-btn ${tab==='roles'?'active':''}" style="border-radius:7px; padding:0 12px;">Role a oprávnenia</button>
                    <button onclick="TeamModule.switchTab('activity')" class="adl-btn adl-btn-sm ${tab==='activity'?'adl-btn-ink':'adl-btn-ghost'} tab-btn ${tab==='activity'?'active':''}" style="border-radius:7px; padding:0 12px;">Aktivita</button>
                </div>

                <div id="team-content">
                    ${this.renderTabContent()}
                </div>
            </div>

            ${this.renderStyles()}
        `;
    },

    async loadData() {
        try {
            const [membersRes, permissionsRes, activityRes] = await Promise.all([
                Database.client.from('team_members').select('*').order('created_at', { ascending: false }),
                Database.client.from('permissions').select('*'),
                Database.client.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50)
            ]);
            
            this.members = membersRes.data || [];
            this.permissions = permissionsRes.data || [];
            this.activityLog = activityRes.data || [];
            
            console.log('Team data loaded:', {
                members: this.members.length,
                permissions: this.permissions.length,
                activity: this.activityLog.length
            });
        } catch (error) {
            console.error('Error loading team data:', error);
        }
    },

    renderStats() {
        const active = this.members.filter(m => m.status === 'active').length;
        const invited = this.members.filter(m => m.status === 'invited').length;
        const owners = this.members.filter(m => m.role === 'owner').length;
        const admins = this.members.filter(m => m.role === 'admin').length;

        return `
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px;" class="adl-team-stats">
                <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Aktívni členovia</div><span class="adl-chip adl-chip-ok adl-chip-sm">online</span></div><div class="adl-stat-value">${active}</div></div>
                <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Čakajúce pozvánky</div><span class="adl-chip adl-chip-amber adl-chip-sm">pending</span></div><div class="adl-stat-value">${invited}</div></div>
                <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Administrátori</div><span class="adl-chip adl-chip-lav adl-chip-sm">privileged</span></div><div class="adl-stat-value">${owners + admins}</div></div>
                <div class="adl-stat"><div class="adl-stat-head"><div class="adl-stat-label">Definované role</div><span class="adl-chip adl-chip-sm">roles</span></div><div class="adl-stat-value">5</div></div>
            </div>
            <style>
                @media (max-width: 900px) { .adl-team-stats { grid-template-columns: repeat(2, 1fr) !important; } }
            </style>
        `;
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.team-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        const tabs = ['members', 'roles', 'activity'];
        const index = tabs.indexOf(tab);
        if (index >= 0) {
            document.querySelectorAll('.team-tabs .tab-btn')[index]?.classList.add('active');
        }
        document.getElementById('team-content').innerHTML = this.renderTabContent();
    },

    renderTabContent() {
        switch (this.currentTab) {
            case 'members':
                return this.renderMembersTab();
            case 'roles':
                return this.renderRolesTab();
            case 'activity':
                return this.renderActivityTab();
            default:
                return '';
        }
    },

    renderMembersTab() {
        if (this.members.length === 0) {
            return `
                <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Users({size:22})}</div>
                    <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadni členovia tímu</h3>
                    <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Začnite pozvaním prvého člena do vášho tímu</p>
                    <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="TeamModule.showInviteModal()">${I.Plus({size:14})} Pozvať člena</button>
                </div>
            `;
        }

        return `
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;" class="adl-members-grid">
                ${this.members.map(member => this.renderMemberCard(member)).join('')}
            </div>
            <style>
                @media (max-width: 1100px) { .adl-members-grid { grid-template-columns: repeat(2, 1fr) !important; } }
                @media (max-width: 640px)  { .adl-members-grid { grid-template-columns: 1fr !important; } }
            </style>
        `;
    },

    renderMemberCard(member) {
        const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase() || '?';
        const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Bez mena';
        const roleToneMap = { owner: 'brand', admin: 'lav', manager: 'sky', specialist: 'mint', viewer: 'n' };
        const statusToneMap = { active: 'ok', invited: 'amber', inactive: 'n' };
        const statusLabel = { active: 'Aktívny', invited: 'Pozvaný', inactive: 'Neaktívny' };
        const roleLabelMap = { owner: 'Vlastník', admin: 'Administrátor', manager: 'Manažér', specialist: 'Špecialista', viewer: 'Pozorovateľ' };

        return `
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px; box-shadow:var(--sh-sm);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="adl-avatar adl-avatar-lg">
                        ${member.avatar_url ? `<img src="${member.avatar_url}" alt="${fullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : initials}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:14px; font-weight:600; letter-spacing:-0.2px; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${fullName}</div>
                        <div style="font-size:12px; color:var(--ink-sub); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${member.position || member.email}</div>
                    </div>
                    <span class="adl-chip adl-chip-${statusToneMap[member.status] || 'n'} adl-chip-sm"><span class="dot"></span>${statusLabel[member.status] || member.status}</span>
                </div>

                <div>
                    <span class="adl-chip adl-chip-${roleToneMap[member.role] || 'n'} adl-chip-sm">${roleLabelMap[member.role] || member.role}</span>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; padding-top:10px; border-top:1px solid var(--border); font-size:11px; color:var(--ink-mute);">
                    ${member.last_login_at
                        ? `<span style="display:inline-flex; align-items:center; gap:4px;" title="Posledné prihlásenie">${I.Clock({size:11})} ${this.formatDate(member.last_login_at)}</span>`
                        : member.status === 'invited'
                            ? `<span>Čaká na prijatie</span>`
                            : `<span>Ešte sa neprihlásil</span>`
                    }
                    <div style="display:flex; gap:4px;">
                        ${member.status === 'invited' ? `<button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="TeamModule.resendInvite('${member.id}')" title="Znovu odoslať" style="padding:0 8px;">${I.Send({size:12})}</button>` : ''}
                        <button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="TeamModule.editMember('${member.id}')" title="Upraviť" style="padding:0 8px;">${I.Edit({size:12})}</button>
                        ${member.role !== 'owner' ? `<button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="TeamModule.editPermissions('${member.id}')" title="Oprávnenia" style="padding:0 8px;">${I.Lock({size:12})}</button>` : ''}
                        ${member.role !== 'owner' ? `<button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="TeamModule.deleteMember('${member.id}')" title="Odstrániť" style="color:var(--err); padding:0 8px;">${I.Trash({size:12})}</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderRolesTab() {
        const roles = [
            {
                id: 'owner',
                name: 'Owner',
                label: 'Vlastník',
                icon: '👑',
                color: '#f59e0b',
                bg: '#fef3c7',
                description: 'Plný prístup ku všetkému, vrátane billing a správy účtu'
            },
            {
                id: 'admin',
                name: 'Admin',
                label: 'Administrátor',
                icon: '⚙️',
                color: '#8b5cf6',
                bg: '#f3e8ff',
                description: 'Plný prístup okrem billing účtu a mazania owner'
            },
            {
                id: 'manager',
                name: 'Manager',
                label: 'Manažér',
                icon: '📊',
                color: '#3b82f6',
                bg: '#dbeafe',
                description: 'Správa klientov, projektov a tímu'
            },
            {
                id: 'sales',
                name: 'Sales',
                label: 'Obchodník',
                icon: '💼',
                color: '#10b981',
                bg: '#d1fae5',
                description: 'Práca s leadmi a predaj'
            },
            {
                id: 'support',
                name: 'Support',
                label: 'Podpora',
                icon: '🎧',
                color: '#6366f1',
                bg: '#e0e7ff',
                description: 'Zákaznícka podpora a komunikácia'
            }
        ];

        const modules = ['dashboard', 'leads', 'clients', 'projects', 'tasks', 'messages', 'billing', 'team', 'settings', 'integrations'];
        
        return `
            <div class="roles-section">
                <div class="roles-cards">
                    ${roles.map(role => {
                        const count = this.members.filter(m => m.role === role.id).length;
                        return `
                            <div class="role-card">
                                <div class="role-header">
                                    <div class="role-icon" style="background: ${role.bg}; color: ${role.color}">
                                        ${role.icon}
                                    </div>
                                    <div class="role-info">
                                        <h3>${role.label}</h3>
                                        <p>${role.description}</p>
                                    </div>
                                    <div class="role-count">${count}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div class="permissions-matrix">
                    <h3>Matica oprávnení</h3>
                    <div class="matrix-table-wrapper">
                        <table class="matrix-table">
                            <thead>
                                <tr>
                                    <th>Modul</th>
                                    ${roles.map(r => `<th><span style="color: ${r.color}">${r.icon}</span> ${r.label}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${modules.map(module => `
                                    <tr>
                                        <td class="module-name">${this.getModuleName(module)}</td>
                                        ${roles.map(role => {
                                            const perm = this.permissions.find(p => p.role === role.id && p.module === module);
                                            return `<td>${this.renderPermissionBadge(perm)}</td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    renderPermissionBadge(perm) {
        if (!perm) return '<span class="perm-badge none">—</span>';
        
        const all = perm.can_view && perm.can_create && perm.can_edit && perm.can_delete;
        const partial = perm.can_view && (perm.can_create || perm.can_edit);
        const viewOnly = perm.can_view && !perm.can_create && !perm.can_edit && !perm.can_delete;
        
        if (all) return '<span class="perm-badge full">Plný</span>';
        if (partial) return '<span class="perm-badge partial">Čiastočný</span>';
        if (viewOnly) return '<span class="perm-badge view">Zobrazenie</span>';
        return '<span class="perm-badge none">—</span>';
    },

    getModuleName(module) {
        const names = {
            dashboard: '📊 Dashboard',
            leads: '🎯 Leady',
            clients: '🏢 Klienti',
            projects: '📁 Projekty',
            tasks: '✅ Úlohy',
            messages: '📧 Správy',
            billing: '📄 Fakturácia',
            team: '👥 Tím',
            settings: '⚙️ Nastavenia',
            integrations: '🔗 Integrácie'
        };
        return names[module] || module;
    },

    renderActivityTab() {
        if (this.activityLog.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <h3>Žiadna aktivita</h3>
                    <p>História aktivít sa zobrazí tu</p>
                </div>
            `;
        }
        
        return `
            <div class="activity-list">
                ${this.activityLog.map(log => `
                    <div class="activity-item">
                        <div class="activity-icon ${this.getActionClass(log.action)}">
                            ${this.getActionIcon(log.action)}
                        </div>
                        <div class="activity-content">
                            <p class="activity-text">
                                <strong>${log.user_name || 'Systém'}</strong>
                                ${this.getActionText(log)}
                            </p>
                            <span class="activity-time">${this.formatDateTime(log.created_at)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    getActionIcon(action) {
        const icons = {
            create: '➕',
            update: '✏️',
            delete: '🗑️',
            login: '🔑',
            export: '📤',
            send: '📧'
        };
        return icons[action] || '📌';
    },

    getActionClass(action) {
        const classes = {
            create: 'action-create',
            update: 'action-update',
            delete: 'action-delete',
            login: 'action-login'
        };
        return classes[action] || '';
    },

    getActionText(log) {
        const actions = {
            create: `vytvoril/a ${log.entity_type || 'záznam'}`,
            update: `upravil/a ${log.entity_type || 'záznam'}`,
            delete: `zmazal/a ${log.entity_type || 'záznam'}`,
            login: 'sa prihlásil/a',
            export: `exportoval/a ${log.entity_type || 'dáta'}`,
            send: `odoslal/a ${log.entity_type || 'správu'}`
        };
        return actions[log.action] || log.description || log.action;
    },

    getRoleInfo(role) {
        const roles = {
            owner: { label: 'Vlastník', icon: '👑', color: '#b45309', bg: '#fef3c7', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
            admin: { label: 'Admin', icon: '⚙️', color: '#7c3aed', bg: '#f3e8ff', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
            manager: { label: 'Manažér', icon: '📊', color: '#2563eb', bg: '#dbeafe', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
            sales: { label: 'Obchodník', icon: '💼', color: '#059669', bg: '#d1fae5', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
            support: { label: 'Podpora', icon: '🎧', color: '#4f46e5', bg: '#e0e7ff', gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }
        };
        return roles[role] || { label: role, icon: '👤', color: '#64748b', bg: '#f1f5f9', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)' };
    },

    getStatusInfo(status) {
        const statuses = {
            active: { label: 'Aktívny', class: 'status-active' },
            invited: { label: 'Pozvaný', class: 'status-invited' },
            inactive: { label: 'Neaktívny', class: 'status-inactive' }
        };
        return statuses[status] || { label: status, class: '' };
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('sk-SK');
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Práve teraz';
        if (diff < 3600000) return `Pred ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `Pred ${Math.floor(diff / 3600000)} hod`;
        
        return date.toLocaleDateString('sk-SK') + ' ' + date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    },

    // === MODÁLY ===

    showInviteModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal team-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">✉️</span>
                        <div>
                            <h2>Pozvať člena tímu</h2>
                            <p class="modal-subtitle">Pošlite pozvánku novému členovi</p>
                        </div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="invite-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Meno <span class="required">*</span></label>
                                <input type="text" name="first_name" required placeholder="Ján">
                            </div>
                            <div class="form-group">
                                <label>Priezvisko <span class="required">*</span></label>
                                <input type="text" name="last_name" required placeholder="Novák">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Email <span class="required">*</span></label>
                            <input type="email" name="email" required placeholder="jan.novak@firma.sk">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Telefón</label>
                                <input type="tel" name="phone" placeholder="+421 900 123 456">
                            </div>
                            <div class="form-group">
                                <label>Pozícia</label>
                                <input type="text" name="position" placeholder="Marketing Manager">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Rola <span class="required">*</span></label>
                            <div class="role-selector">
                                <label class="role-option">
                                    <input type="radio" name="role" value="admin">
                                    <div class="role-box">
                                        <span class="role-icon">⚙️</span>
                                        <span class="role-name">Admin</span>
                                        <span class="role-desc">Plný prístup</span>
                                    </div>
                                </label>
                                <label class="role-option">
                                    <input type="radio" name="role" value="manager">
                                    <div class="role-box">
                                        <span class="role-icon">📊</span>
                                        <span class="role-name">Manažér</span>
                                        <span class="role-desc">Klienti & Projekty</span>
                                    </div>
                                </label>
                                <label class="role-option">
                                    <input type="radio" name="role" value="sales" checked>
                                    <div class="role-box">
                                        <span class="role-icon">💼</span>
                                        <span class="role-name">Obchodník</span>
                                        <span class="role-desc">Leady & Predaj</span>
                                    </div>
                                </label>
                                <label class="role-option">
                                    <input type="radio" name="role" value="support">
                                    <div class="role-box">
                                        <span class="role-icon">🎧</span>
                                        <span class="role-name">Podpora</span>
                                        <span class="role-desc">Komunikácia</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="TeamModule.sendInvite()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Odoslať pozvánku
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    // URL pre Edge Function - berie z configu
    getSendEmailUrl() {
        const supabaseUrl = Config.get('supabase_url');
        return `${supabaseUrl}/functions/v1/send-email`;
    },
    
    // Base URL pre pozvánky - TODO: zmeniť na ostrú doménu
    getBaseUrl() {
        // Ak sme na localhost, použijeme produkčnú URL
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'https://adlify-platform.vercel.app';
        }
        return window.location.origin;
    },
    
    // Generovať náhodný token
    generateToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    async sendInvite() {
        const form = document.getElementById('invite-form');
        const formData = new FormData(form);
        
        const firstName = formData.get('first_name');
        const lastName = formData.get('last_name');
        const email = formData.get('email');
        const role = formData.get('role');
        
        if (!firstName || !lastName || !email || !role) {
            Utils.toast('Vyplňte všetky povinné polia', 'warning');
            return;
        }
        
        Utils.toast('Odosielam pozvánku...', 'info');
        
        try {
            // 1. Vytvoriť člena tímu
            const { data: member, error } = await Database.client
                .from('team_members')
                .insert({
                    first_name: firstName,
                    last_name: lastName,
                    email: email,
                    phone: formData.get('phone') || null,
                    position: formData.get('position') || null,
                    role: role,
                    status: 'invited',
                    invited_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // 2. Generovať invitation token
            const token = this.generateToken();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 dní platnosť
            
            const { error: tokenError } = await Database.client
                .from('invitation_tokens')
                .insert({
                    team_member_id: member.id,
                    token: token,
                    expires_at: expiresAt.toISOString()
                });
            
            if (tokenError) throw tokenError;
            
            // 3. Odoslať email
            const inviteUrl = `${this.getBaseUrl()}/invite.html?token=${token}`;
            const roleInfo = this.getRoleInfo(role);
            
            let emailSent = false;
            try {
                await this.sendInviteEmail({
                    to: email,
                    toName: `${firstName} ${lastName}`,
                    firstName,
                    role: roleInfo.label,
                    inviteUrl,
                    expiresAt
                });
                emailSent = true;
            } catch (emailError) {
                console.error('Email error:', emailError);
                // Email zlyhalo, ale člen bol vytvorený - ukážeme link
            }
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            document.getElementById('team-content').innerHTML = this.renderTabContent();
            
            if (emailSent) {
                Utils.toast(`Pozvánka odoslaná na ${email}! ✉️`, 'success');
            } else {
                // Ukáž modal s linkom
                this.showInviteLinkModal(inviteUrl, email);
            }
            
        } catch (error) {
            console.error('Error sending invite:', error);
            Utils.toast('Chyba: ' + error.message, 'error');
        }
    },
    
    showInviteLinkModal(inviteUrl, email) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">⚠️</span>
                        <div>
                            <h2>Email sa nepodarilo odoslať</h2>
                            <p class="modal-subtitle">Člen bol vytvorený, pošlite link manuálne</p>
                        </div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Skopírujte tento link a pošlite ho na <strong>${email}</strong>:</p>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="invite-link-input" value="${inviteUrl}" readonly 
                               style="flex: 1; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem;">
                        <button onclick="navigator.clipboard.writeText('${inviteUrl}'); Utils.toast('Link skopírovaný!', 'success');" 
                                class="btn-primary" style="white-space: nowrap;">
                            📋 Kopírovať
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async sendInviteEmail({ to, toName, firstName, role, inviteUrl, expiresAt }) {
        if (window.EmailTemplates) await EmailTemplates.ensureSettings();
        const htmlBody = window.EmailTemplates 
            ? EmailTemplates.teamInvite({ firstName, role, inviteUrl, expiresAt })
            : '<p>Ahoj ' + firstName + ', bol/a si pozvaný/á do tímu Adlify. <a href="' + inviteUrl + '">Prijať pozvánku</a></p>';
        
        const session = await Database.client.auth.getSession();
        const token = session?.data?.session?.access_token || '';
        
        const emailUrl = this.getSendEmailUrl();
        console.log('Sending invite email to:', to, 'via:', emailUrl);
        
        try {
            const response = await fetch(emailUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    to,
                    toName,
                    subject: 'Pozvánka do tímu Adlify',
                    htmlBody,
                    textBody: `Ahoj ${firstName}, bol/a si pozvaný/á do tímu Adlify s rolou ${role}. Prijmi pozvánku tu: ${inviteUrl}`
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Email API error:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('Email result:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'Nepodarilo sa odoslať email');
            }
        } catch (fetchError) {
            console.error('Fetch error:', fetchError);
            // Ak zlyhá email, aspoň informujeme že člen bol vytvorený
            throw new Error(`Email sa nepodarilo odoslať: ${fetchError.message}. Člen bol vytvorený, môžete skopírovať link manuálne.`);
        }
    },

    async resendInvite(memberId) {
        const member = this.members.find(m => m.id === memberId);
        if (!member || member.status !== 'invited') return;
        
        Utils.toast('Odosielam pozvánku...', 'info');
        
        try {
            // Zmazať starý token
            await Database.client
                .from('invitation_tokens')
                .delete()
                .eq('team_member_id', memberId);
            
            // Generovať nový token
            const token = this.generateToken();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            
            const { error: tokenError } = await Database.client
                .from('invitation_tokens')
                .insert({
                    team_member_id: memberId,
                    token: token,
                    expires_at: expiresAt.toISOString()
                });
            
            if (tokenError) throw tokenError;
            
            // Odoslať email
            const inviteUrl = `${this.getBaseUrl()}/invite.html?token=${token}`;
            const roleInfo = this.getRoleInfo(member.role);
            
            await this.sendInviteEmail({
                to: member.email,
                toName: `${member.first_name} ${member.last_name}`,
                firstName: member.first_name,
                role: roleInfo.label,
                inviteUrl,
                expiresAt
            });
            
            // Aktualizovať invited_at
            await Database.client
                .from('team_members')
                .update({ invited_at: new Date().toISOString() })
                .eq('id', memberId);
            
            await this.loadData();
            document.getElementById('team-content').innerHTML = this.renderTabContent();
            
            Utils.toast(`Pozvánka znovu odoslaná! ✉️`, 'success');
            
        } catch (error) {
            console.error('Error resending invite:', error);
            Utils.toast('Chyba: ' + error.message, 'error');
        }
    },

    async editMember(memberId) {
        const member = this.members.find(m => m.id === memberId);
        if (!member) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal team-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">✏️</span>
                        <div>
                            <h2>Upraviť člena</h2>
                            <p class="modal-subtitle">${member.first_name} ${member.last_name}</p>
                        </div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="edit-form">
                        <input type="hidden" name="id" value="${member.id}">
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Meno</label>
                                <input type="text" name="first_name" value="${member.first_name || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Priezvisko</label>
                                <input type="text" name="last_name" value="${member.last_name || ''}" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" value="${member.email}" required>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Telefón</label>
                                <input type="tel" name="phone" value="${member.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label>Pozícia</label>
                                <input type="text" name="position" value="${member.position || ''}">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Rola</label>
                                <select name="role" ${member.role === 'owner' ? 'disabled' : ''}>
                                    <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manažér</option>
                                    <option value="sales" ${member.role === 'sales' ? 'selected' : ''}>Obchodník</option>
                                    <option value="support" ${member.role === 'support' ? 'selected' : ''}>Podpora</option>
                                    ${member.role === 'owner' ? '<option value="owner" selected>Vlastník</option>' : ''}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select name="status">
                                    <option value="active" ${member.status === 'active' ? 'selected' : ''}>Aktívny</option>
                                    <option value="inactive" ${member.status === 'inactive' ? 'selected' : ''}>Neaktívny</option>
                                    <option value="invited" ${member.status === 'invited' ? 'selected' : ''}>Pozvaný</option>
                                </select>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="TeamModule.saveMember()">
                        Uložiť zmeny
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async saveMember() {
        const form = document.getElementById('edit-form');
        const formData = new FormData(form);
        const id = formData.get('id');
        
        try {
            const { error } = await Database.client
                .from('team_members')
                .update({
                    first_name: formData.get('first_name'),
                    last_name: formData.get('last_name'),
                    email: formData.get('email'),
                    phone: formData.get('phone') || null,
                    position: formData.get('position') || null,
                    role: formData.get('role'),
                    status: formData.get('status')
                })
                .eq('id', id);
            
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            document.getElementById('team-content').innerHTML = this.renderTabContent();
            
        } catch (error) {
            console.error('Error saving member:', error);
            alert('Chyba pri ukladaní: ' + error.message);
        }
    },

    async deleteMember(memberId) {
        const member = this.members.find(m => m.id === memberId);
        if (!member) return;
        
        if (member.role === 'owner') {
            alert('Vlastníka nie je možné odstrániť');
            return;
        }
        
        if (!await Utils.confirm(`Odstrániť ${member.first_name} ${member.last_name} z tímu?`, { title: 'Odstrániť člena', type: 'danger', confirmText: 'Odstrániť', cancelText: 'Ponechať' })) {
            return;
        }
        
        try {
            const { error } = await Database.client
                .from('team_members')
                .delete()
                .eq('id', memberId);
            
            if (error) throw error;
            
            await this.loadData();
            document.getElementById('team-content').innerHTML = this.renderTabContent();
            
        } catch (error) {
            console.error('Error deleting member:', error);
            alert('Chyba pri mazaní: ' + error.message);
        }
    },

    renderStyles() {
        return `
            <style>
                .team-module {
                    max-width: 1400px;
                    margin: 0 auto;
                }
                
                /* Header */
                .team-header {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
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
                }
                
                .btn-invite {
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
                
                .btn-invite:hover {
                    background: rgba(255,255,255,0.3);
                    transform: translateY(-1px);
                }
                
                /* Stats */
                .team-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                @media (max-width: 1000px) {
                    .team-stats-grid { grid-template-columns: repeat(2, 1fr); }
                }
                
                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                }
                
                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .stat-icon.green { background: #dcfce7; color: #16a34a; }
                .stat-icon.orange { background: #ffedd5; color: #ea580c; }
                .stat-icon.purple { background: #f3e8ff; color: #9333ea; }
                .stat-icon.blue { background: #dbeafe; color: #2563eb; }
                
                .stat-value {
                    display: block;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #0f172a;
                }
                
                .stat-label {
                    display: block;
                    font-size: 0.85rem;
                    color: #64748b;
                }
                
                /* Tabs */
                .team-tabs-container {
                    background: white;
                    border-radius: 16px;
                    padding: 0.5rem;
                    margin-bottom: 1rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                }
                
                .team-tabs {
                    display: flex;
                    gap: 0.5rem;
                }
                
                .team-tabs .tab-btn {
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
                
                .team-tabs .tab-btn:hover {
                    background: #f8fafc;
                    color: #334155;
                }
                
                .team-tabs .tab-btn.active {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }
                
                .tab-count {
                    background: rgba(255,255,255,0.2);
                    padding: 0.15rem 0.5rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                }
                
                .tab-btn:not(.active) .tab-count {
                    background: #f1f5f9;
                }
                
                /* Content */
                .team-content {
                    background: white;
                    border-radius: 16px;
                    padding: 1.5rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    border: 1px solid #f1f5f9;
                }
                
                /* Members Grid */
                .members-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 1rem;
                }
                
                .member-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    overflow: hidden;
                    transition: all 0.2s;
                }
                
                .member-card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    transform: translateY(-2px);
                }
                
                .member-header {
                    position: relative;
                    padding: 1.5rem;
                    display: flex;
                    justify-content: center;
                }
                
                .member-avatar {
                    width: 72px;
                    height: 72px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: white;
                    border: 3px solid white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                
                .member-avatar img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                }
                
                .member-status {
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 2px solid white;
                }
                
                .member-status.status-active { background: #22c55e; }
                .member-status.status-invited { background: #f59e0b; }
                .member-status.status-inactive { background: #94a3b8; }
                
                .member-body {
                    padding: 0 1.5rem 1rem;
                    text-align: center;
                }
                
                .member-name {
                    margin: 0 0 0.25rem;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #0f172a;
                }
                
                .member-position {
                    margin: 0 0 0.75rem;
                    font-size: 0.85rem;
                    color: #64748b;
                }
                
                .member-role-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.35rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                
                .member-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    background: white;
                    border-top: 1px solid #e2e8f0;
                }
                
                .member-meta {
                    font-size: 0.8rem;
                    color: #94a3b8;
                }
                
                .member-actions {
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
                    color: #64748b;
                    transition: all 0.15s;
                }
                
                .btn-icon:hover {
                    background: #e2e8f0;
                    color: #334155;
                }
                
                .btn-icon.btn-danger:hover {
                    background: #fee2e2;
                    color: #dc2626;
                }
                
                .btn-icon.btn-resend {
                    color: #f59e0b;
                }
                
                .btn-icon.btn-resend:hover {
                    background: #fef3c7;
                    color: #d97706;
                }
                
                .btn-icon.btn-permissions {
                    color: #6366f1;
                }
                
                .btn-icon.btn-permissions:hover {
                    background: #eef2ff;
                    color: #4f46e5;
                }
                
                /* Roles Tab */
                .roles-section {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                }
                
                .roles-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 1rem;
                }
                
                .role-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 1rem;
                }
                
                .role-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .role-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                }
                
                .role-info {
                    flex: 1;
                }
                
                .role-info h3 {
                    margin: 0 0 0.25rem;
                    font-size: 1rem;
                }
                
                .role-info p {
                    margin: 0;
                    font-size: 0.8rem;
                    color: #64748b;
                }
                
                .role-count {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: white;
                    border-radius: 50%;
                    font-weight: 600;
                    font-size: 0.9rem;
                    color: #6366f1;
                }
                
                /* Permissions Matrix */
                .permissions-matrix h3 {
                    margin: 0 0 1rem;
                    font-size: 1.1rem;
                }
                
                .matrix-table-wrapper {
                    overflow-x: auto;
                }
                
                .matrix-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                .matrix-table th,
                .matrix-table td {
                    padding: 0.75rem;
                    text-align: center;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .matrix-table th {
                    background: #f8fafc;
                    font-weight: 600;
                    font-size: 0.85rem;
                }
                
                .matrix-table .module-name {
                    text-align: left;
                    font-weight: 500;
                }
                
                .perm-badge {
                    display: inline-block;
                    padding: 0.25rem 0.5rem;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                
                .perm-badge.full { background: #dcfce7; color: #16a34a; }
                .perm-badge.partial { background: #fef3c7; color: #b45309; }
                .perm-badge.view { background: #dbeafe; color: #2563eb; }
                .perm-badge.none { color: #cbd5e1; }
                
                /* Activity Tab */
                .activity-list {
                    display: flex;
                    flex-direction: column;
                }
                
                .activity-item {
                    display: flex;
                    gap: 1rem;
                    padding: 1rem 0;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .activity-item:last-child {
                    border-bottom: none;
                }
                
                .activity-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1rem;
                    flex-shrink: 0;
                }
                
                .activity-icon.action-create { background: #dcfce7; }
                .activity-icon.action-update { background: #dbeafe; }
                .activity-icon.action-delete { background: #fee2e2; }
                .activity-icon.action-login { background: #f3e8ff; }
                
                .activity-content {
                    flex: 1;
                }
                
                .activity-text {
                    margin: 0 0 0.25rem;
                    font-size: 0.9rem;
                }
                
                .activity-time {
                    font-size: 0.8rem;
                    color: #94a3b8;
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
                }
                
                .empty-state p {
                    color: #64748b;
                    margin-bottom: 1.5rem;
                }
                
                /* Modal */
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
                
                .modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    animation: modalSlideIn 0.3s ease;
                }
                
                @keyframes modalSlideIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .modal-title {
                    display: flex;
                    align-items: flex-start;
                    gap: 1rem;
                }
                
                .modal-icon {
                    font-size: 2rem;
                }
                
                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }
                
                .modal-subtitle {
                    margin: 0.25rem 0 0;
                    color: #64748b;
                    font-size: 0.9rem;
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
                    font-size: 1.5rem;
                    color: #64748b;
                    cursor: pointer;
                }
                
                .modal-close:hover {
                    background: #e2e8f0;
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
                
                /* Form */
                .form-group {
                    margin-bottom: 1rem;
                }
                
                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    font-size: 0.9rem;
                    color: #334155;
                }
                
                .form-group input,
                .form-group select {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.9rem;
                }
                
                .form-group input:focus,
                .form-group select:focus {
                    outline: none;
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }
                
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
                
                .required { color: #ef4444; }
                
                /* Role Selector */
                .role-selector {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 0.75rem;
                }
                
                .role-option {
                    cursor: pointer;
                }
                
                .role-option input {
                    display: none;
                }
                
                .role-box {
                    padding: 1rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    text-align: center;
                    transition: all 0.2s;
                }
                
                .role-option input:checked + .role-box {
                    border-color: #6366f1;
                    background: #f5f3ff;
                }
                
                .role-box:hover {
                    border-color: #a5b4fc;
                }
                
                .role-box .role-icon {
                    display: block;
                    font-size: 1.5rem;
                    margin-bottom: 0.25rem;
                }
                
                .role-box .role-name {
                    display: block;
                    font-weight: 600;
                    color: #0f172a;
                }
                
                .role-box .role-desc {
                    display: block;
                    font-size: 0.75rem;
                    color: #64748b;
                }
                
                /* Buttons */
                .btn-primary {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.5rem;
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }
                
                .btn-secondary {
                    padding: 0.75rem 1.5rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    border-radius: 8px;
                    font-weight: 500;
                    cursor: pointer;
                }
                
                .btn-secondary:hover {
                    background: #f8fafc;
                }
            </style>
        `;
    },

    // ===================================================
    // CUSTOM PERMISSIONS
    // ===================================================
    
    async editPermissions(memberId) {
        const member = this.members.find(m => m.id === memberId);
        if (!member) return;
        
        // Definícia modulov a akcií
        const modules = [
            { id: 'dashboard', name: 'Dashboard', icon: '📊' },
            { id: 'leads', name: 'Leady', icon: '🎯' },
            { id: 'clients', name: 'Klienti', icon: '👥' },
            { id: 'projects', name: 'Projekty', icon: '📁' },
            { id: 'messages', name: 'Správy', icon: '💬' },
            { id: 'billing', name: 'Fakturácia', icon: '💰' },
            { id: 'tasks', name: 'Úlohy', icon: '✅' },
            { id: 'team', name: 'Tím', icon: '👤' },
            { id: 'settings', name: 'Nastavenia', icon: '⚙️' },
            { id: 'integrations', name: 'Integrácie', icon: '🔌' }
        ];
        
        const actions = [
            { id: 'view', name: 'Zobraziť' },
            { id: 'create', name: 'Vytvoriť' },
            { id: 'edit', name: 'Upraviť' },
            { id: 'delete', name: 'Zmazať' }
        ];
        
        // Aktuálne custom permissions alebo prázdne
        const customPerms = member.custom_permissions || {};
        
        // Defaultné permissions podľa role
        const roleDefaults = this.getRoleDefaults(member.role);
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal permissions-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">🔐</span>
                        <div>
                            <h2>Oprávnenia</h2>
                            <p class="modal-subtitle">${member.first_name} ${member.last_name} (${this.getRoleName(member.role)})</p>
                        </div>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="permissions-info">
                        <span class="info-icon">ℹ️</span>
                        <span>Zaškrtnuté = povolené. Nezaškrtnuté = zakázané. Šedé = podľa role.</span>
                    </div>
                    
                    <div class="permissions-toggle">
                        <label class="toggle-label">
                            <input type="checkbox" id="use-custom-perms" ${Object.keys(customPerms).length > 0 ? 'checked' : ''} onchange="TeamModule.toggleCustomPermissions()">
                            <span>Použiť vlastné oprávnenia (inak platia podľa role)</span>
                        </label>
                    </div>
                    
                    <input type="hidden" id="perm-member-id" value="${member.id}">
                    
                    <div class="permissions-table-wrapper" id="permissions-wrapper" style="${Object.keys(customPerms).length > 0 ? '' : 'opacity: 0.5; pointer-events: none;'}">
                        <table class="permissions-table">
                            <thead>
                                <tr>
                                    <th>Modul</th>
                                    ${actions.map(a => `<th>${a.name}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${modules.map(mod => `
                                    <tr>
                                        <td class="module-cell">
                                            <span class="module-icon">${mod.icon}</span>
                                            <span>${mod.name}</span>
                                        </td>
                                        ${actions.map(act => {
                                            const customVal = customPerms[mod.id]?.[act.id];
                                            const defaultVal = roleDefaults[mod.id]?.[act.id] || false;
                                            const isChecked = customVal !== undefined ? customVal : defaultVal;
                                            return `
                                                <td class="action-cell">
                                                    <input type="checkbox" 
                                                        class="perm-checkbox"
                                                        data-module="${mod.id}" 
                                                        data-action="${act.id}"
                                                        ${isChecked ? 'checked' : ''}>
                                                </td>
                                            `;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="TeamModule.resetToRoleDefaults('${member.id}')">
                        Resetovať na defaultné
                    </button>
                    <div class="footer-right">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                        <button class="btn-primary" onclick="TeamModule.savePermissions()">
                            Uložiť oprávnenia
                        </button>
                    </div>
                </div>
            </div>
            
            <style>
                .permissions-modal {
                    max-width: 800px;
                    width: 95%;
                }
                
                .permissions-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: #f0f9ff;
                    border-radius: 8px;
                    color: #0369a1;
                    font-size: 14px;
                    margin-bottom: 16px;
                }
                
                .permissions-toggle {
                    margin-bottom: 20px;
                }
                
                .toggle-label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    font-weight: 500;
                }
                
                .toggle-label input {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                
                .permissions-table-wrapper {
                    overflow-x: auto;
                    transition: opacity 0.3s;
                }
                
                .permissions-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }
                
                .permissions-table th {
                    text-align: center;
                    padding: 12px 8px;
                    background: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                    font-weight: 600;
                    color: #475569;
                }
                
                .permissions-table th:first-child {
                    text-align: left;
                    padding-left: 16px;
                }
                
                .permissions-table td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .module-cell {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding-left: 16px !important;
                    font-weight: 500;
                }
                
                .module-icon {
                    font-size: 18px;
                }
                
                .action-cell {
                    text-align: center;
                }
                
                .perm-checkbox {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    accent-color: #6366f1;
                }
                
                .permissions-table tr:hover {
                    background: #fafafa;
                }
                
                .modal-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .footer-right {
                    display: flex;
                    gap: 12px;
                }
            </style>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },
    
    toggleCustomPermissions() {
        const checkbox = document.getElementById('use-custom-perms');
        const wrapper = document.getElementById('permissions-wrapper');
        
        if (checkbox.checked) {
            wrapper.style.opacity = '1';
            wrapper.style.pointerEvents = 'auto';
        } else {
            wrapper.style.opacity = '0.5';
            wrapper.style.pointerEvents = 'none';
        }
    },
    
    getRoleDefaults(role) {
        const defaults = {
            admin: {
                dashboard: { view: true, create: true, edit: true, delete: true },
                leads: { view: true, create: true, edit: true, delete: true },
                clients: { view: true, create: true, edit: true, delete: true },
                projects: { view: true, create: true, edit: true, delete: true },
                messages: { view: true, create: true, edit: true, delete: true },
                billing: { view: true, create: true, edit: true, delete: true },
                tasks: { view: true, create: true, edit: true, delete: true },
                team: { view: true, create: true, edit: true, delete: false },
                settings: { view: true, create: true, edit: true, delete: false },
                integrations: { view: true, create: true, edit: true, delete: true }
            },
            manager: {
                dashboard: { view: true, create: false, edit: false, delete: false },
                leads: { view: true, create: true, edit: true, delete: true },
                clients: { view: true, create: true, edit: true, delete: false },
                projects: { view: true, create: true, edit: true, delete: false },
                messages: { view: true, create: true, edit: true, delete: true },
                billing: { view: true, create: false, edit: false, delete: false },
                tasks: { view: true, create: true, edit: true, delete: true },
                team: { view: true, create: false, edit: false, delete: false },
                settings: { view: false, create: false, edit: false, delete: false },
                integrations: { view: false, create: false, edit: false, delete: false }
            },
            sales: {
                dashboard: { view: true, create: false, edit: false, delete: false },
                leads: { view: true, create: true, edit: true, delete: false },
                clients: { view: true, create: false, edit: false, delete: false },
                projects: { view: true, create: false, edit: false, delete: false },
                messages: { view: true, create: true, edit: true, delete: false },
                billing: { view: true, create: false, edit: false, delete: false },
                tasks: { view: true, create: true, edit: true, delete: false },
                team: { view: true, create: false, edit: false, delete: false },
                settings: { view: false, create: false, edit: false, delete: false },
                integrations: { view: false, create: false, edit: false, delete: false }
            },
            support: {
                dashboard: { view: true, create: false, edit: false, delete: false },
                leads: { view: true, create: false, edit: false, delete: false },
                clients: { view: true, create: false, edit: false, delete: false },
                projects: { view: true, create: false, edit: false, delete: false },
                messages: { view: true, create: true, edit: true, delete: false },
                billing: { view: false, create: false, edit: false, delete: false },
                tasks: { view: true, create: true, edit: true, delete: false },
                team: { view: true, create: false, edit: false, delete: false },
                settings: { view: false, create: false, edit: false, delete: false },
                integrations: { view: false, create: false, edit: false, delete: false }
            }
        };
        
        return defaults[role] || defaults.support;
    },
    
    getRoleName(role) {
        const names = {
            owner: 'Vlastník',
            admin: 'Admin',
            manager: 'Manažér',
            sales: 'Obchodník',
            support: 'Podpora'
        };
        return names[role] || role;
    },
    
    async savePermissions() {
        const memberId = document.getElementById('perm-member-id').value;
        const useCustom = document.getElementById('use-custom-perms').checked;
        
        let customPermissions = null;
        
        if (useCustom) {
            customPermissions = {};
            const checkboxes = document.querySelectorAll('.perm-checkbox');
            
            checkboxes.forEach(cb => {
                const module = cb.dataset.module;
                const action = cb.dataset.action;
                
                if (!customPermissions[module]) {
                    customPermissions[module] = {};
                }
                customPermissions[module][action] = cb.checked;
            });
        }
        
        try {
            const { error } = await Database.client
                .from('team_members')
                .update({ custom_permissions: customPermissions })
                .eq('id', memberId);
            
            if (error) throw error;
            
            // Zavrieť modal
            document.querySelector('.modal-overlay').remove();
            
            // Reload members
            await this.loadMembers();
            this.renderMembersTab();
            
            Utils.showNotification('Oprávnenia boli uložené', 'success');
            
        } catch (error) {
            console.error('Save permissions error:', error);
            Utils.showNotification('Chyba pri ukladaní oprávnení', 'error');
        }
    },
    
    async resetToRoleDefaults(memberId) {
        if (!await Utils.confirm('Oprávnenia sa nastavia na predvolené hodnoty podľa role.', { title: 'Resetovať oprávnenia', type: 'warning', confirmText: 'Resetovať', cancelText: 'Zrušiť' })) return;
        
        try {
            const { error } = await Database.client
                .from('team_members')
                .update({ custom_permissions: null })
                .eq('id', memberId);
            
            if (error) throw error;
            
            document.querySelector('.modal-overlay').remove();
            await this.loadMembers();
            this.renderMembersTab();
            
            Utils.showNotification('Oprávnenia resetované', 'success');
            
        } catch (error) {
            console.error('Reset permissions error:', error);
            Utils.showNotification('Chyba pri resetovaní', 'error');
        }
    }
};

// Export pre globálny prístup
window.TeamModule = TeamModule;
