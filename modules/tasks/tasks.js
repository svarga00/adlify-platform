/**
 * ADLIFY - Tasks Module
 * Správa úloh a priradenie členom tímu
 */

const TasksModule = {
    id: 'tasks',
    name: 'Úlohy',
    icon: '✅',
    title: 'Úlohy',
    menu: { section: 'main', order: 45 },
    permissions: ['tasks', 'view'],

    // Data
    tasks: [],
    teamMembers: [],
    currentFilter: 'all',
    currentView: 'list', // 'list' alebo 'kanban'
    selectedTask: null,

    async init() {
        console.log('✅ Tasks module initialized');
    },

    async render(container) {
        const view = this.currentView || 'list';
        const filter = this.currentFilter || 'all';
        container.innerHTML = `
            <div class="adl tasks-module">
                <!-- Header -->
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Úlohy</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">Správa úloh a priradenie členom tímu</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <div style="display:inline-flex; background:var(--n-75); border-radius:9px; padding:3px;">
                            <button onclick="TasksModule.setView('list')" class="adl-btn adl-btn-sm ${view==='list'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Zoznam</button>
                            <button onclick="TasksModule.setView('kanban')" class="adl-btn adl-btn-sm ${view==='kanban'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Kanban</button>
                        </div>
                        <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="TasksModule.showCreateModal()">${I.Plus({size:14})} Nová úloha</button>
                    </div>
                </div>

                <!-- Filters -->
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap;" class="adl-tasks-filters">
                    <div style="display:inline-flex; background:var(--n-75); border-radius:9px; padding:3px; flex-wrap:wrap;">
                        ${[
                            ['all', 'Všetky'],
                            ['my', 'Moje'],
                            ['todo', 'To Do'],
                            ['in_progress', 'In Progress'],
                            ['done', 'Hotové']
                        ].map(([k,l]) => `<button onclick="TasksModule.setFilter('${k}')" class="adl-btn adl-btn-sm ${filter===k?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">${l}</button>`).join('')}
                    </div>
                    <div class="adl-input" style="flex:1; min-width:200px; max-width:340px; margin-left:auto;">
                        <span style="color:var(--ink-mute); display:flex;">${I.Search({size:15})}</span>
                        <input type="text" id="task-search" placeholder="Hľadať úlohy…" oninput="TasksModule.handleSearch(this.value)" style="flex:1; border:0; outline:none; background:transparent; font:inherit; color:inherit;">
                    </div>
                </div>

                <!-- Content -->
                <div id="tasks-content">
                    <div style="text-align:center; padding:40px; color:var(--ink-mute);">Načítavam úlohy…</div>
                </div>
            </div>
        `;

        await this.loadData();
        this.renderContent();
    },

    async loadData() {
        try {
            // Load tasks
            const { data: tasks, error: tasksError } = await Database.client
                .from('tasks')
                .select('*, assigned:team_members!assigned_to(*), creator:team_members!created_by(*)')
                .order('created_at', { ascending: false });

            if (tasksError) throw tasksError;
            this.tasks = tasks || [];

            // Load team members
            const { data: members, error: membersError } = await Database.client
                .from('team_members')
                .select('*')
                .eq('status', 'active');

            if (membersError) throw membersError;
            this.teamMembers = members || [];

        } catch (error) {
            console.error('Load tasks error:', error);
            Utils.showNotification('Chyba pri načítaní úloh', 'error');
        }
    },

    renderContent() {
        const container = document.getElementById('tasks-content');
        if (!container) return;

        if (this.currentView === 'kanban') {
            this.renderKanban(container);
        } else {
            this.renderList(container);
        }
    },

    renderList(container) {
        const filteredTasks = this.getFilteredTasks();

        if (filteredTasks.length === 0) {
            container.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Tasks({size:22})}</div>
                    <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne úlohy</h3>
                    <p style="font-size:13px; color:var(--ink-sub); margin:0 0 12px;">Vytvorte prvú úlohu kliknutím na tlačidlo „Nová úloha"</p>
                    <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="TasksModule.showCreateModal()">${I.Plus({size:14})} Nová úloha</button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${filteredTasks.map(task => this.renderTaskCard(task)).join('')}
            </div>
        `;
    },

    renderKanban(container) {
        const columns = [
            { id: 'todo',        name: 'To Do',        color: 'var(--acc-lavender-ink)' },
            { id: 'in_progress', name: 'In Progress',  color: 'var(--warn)' },
            { id: 'review',      name: 'Review',       color: 'var(--acc-lavender-ink)' },
            { id: 'done',        name: 'Hotové',       color: 'var(--ok)' }
        ];

        container.innerHTML = `
            <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; min-height:400px;" class="adl-kanban">
                ${columns.map(col => {
                    const tasks = this.tasks.filter(t => t.status === col.id);
                    return `
                        <div data-status="${col.id}" style="flex:0 0 280px; min-width:260px; display:flex; flex-direction:column;">
                            <div style="display:flex; align-items:center; gap:8px; padding:0 6px 10px;">
                                <span style="width:8px; height:8px; border-radius:99px; background:${col.color};"></span>
                                <span style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px;">${col.name}</span>
                                <span style="font-size:11px; color:var(--ink-mute); background:var(--n-75); padding:1px 7px; border-radius:99px;">${tasks.length}</span>
                            </div>
                            <div style="flex:1; background:var(--n-75); border-radius:12px; padding:8px; display:flex; flex-direction:column; gap:8px; min-height:200px;" ondragover="TasksModule.handleDragOver(event)" ondrop="TasksModule.handleDrop(event, '${col.id}')">
                                ${tasks.map(task => this.renderKanbanCard(task)).join('')}
                                ${tasks.length === 0 ? `<div style="padding:20px 8px; text-align:center; color:var(--ink-mute); font-size:12px;">Žiadne úlohy</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    _priorityTone(p) {
        return ({ low: 'mint', medium: 'amber', high: 'brand', urgent: 'err' })[p] || 'n';
    },
    _priorityLabel(p) {
        return ({ low: 'Nízka', medium: 'Stredná', high: 'Vysoká', urgent: 'Urgentná' })[p] || '—';
    },
    _statusTone(s) {
        return ({ todo: 'lav', in_progress: 'amber', review: 'sky', done: 'ok', cancelled: 'n' })[s] || 'n';
    },
    _statusLabel(s) {
        return ({ todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Hotové', cancelled: 'Zrušené' })[s] || s;
    },

    renderTaskCard(task) {
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
        const assignedName = task.assigned ? `${task.assigned.first_name} ${task.assigned.last_name}` : 'Nepriradené';
        const assignedInitials = task.assigned ? `${task.assigned.first_name[0]}${task.assigned.last_name[0]}` : '?';

        return `
            <div onclick="TasksModule.openTask('${task.id}')" style="background:var(--surface); border:1px solid ${isOverdue ? 'var(--err)' : 'var(--border)'}; border-radius:12px; padding:14px 16px; box-shadow:var(--sh-xs); cursor:pointer; transition: border-color .12s, box-shadow .12s; ${task.status === 'done' ? 'opacity:0.7;' : ''}" onmouseover="this.style.boxShadow='var(--sh-sm)'" onmouseout="this.style.boxShadow='var(--sh-xs)'">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                    <span class="adl-chip adl-chip-${this._priorityTone(task.priority)} adl-chip-sm">${this._priorityLabel(task.priority)}</span>
                    <span class="adl-chip adl-chip-${this._statusTone(task.status)} adl-chip-sm"><span class="dot"></span>${this._statusLabel(task.status)}</span>
                    ${isOverdue ? `<span class="adl-chip adl-chip-err adl-chip-sm">${I.Warning({size:11})} Po termíne</span>` : ''}
                </div>

                <div style="font-size:14px; font-weight:600; letter-spacing:-0.1px; line-height:1.3; ${task.status === 'done' ? 'text-decoration:line-through;' : ''}">${task.title}</div>

                ${task.description ? `<p style="font-size:12px; color:var(--ink-sub); margin:6px 0 0; line-height:1.4;">${task.description.substring(0, 120)}${task.description.length > 120 ? '…' : ''}</p>` : ''}

                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <div class="adl-avatar adl-avatar-sm" title="${assignedName}">${assignedInitials}</div>
                        <span style="font-size:11px; color:var(--ink-sub);">${assignedName}</span>
                    </div>
                    ${task.due_date ? `<span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${isOverdue ? 'var(--err)' : 'var(--ink-mute)'};">${I.Clock({size:11})} ${this.formatDate(task.due_date)}</span>` : ''}
                </div>

                ${task.tags && task.tags.length > 0 ? `
                    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                        ${task.tags.slice(0, 3).map(tag => `<span class="adl-chip adl-chip-sm">${tag}</span>`).join('')}
                        ${task.tags.length > 3 ? `<span class="adl-chip adl-chip-sm">+${task.tags.length - 3}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    },

    renderKanbanCard(task) {
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
        const assignedInitials = task.assigned ? `${task.assigned.first_name[0]}${task.assigned.last_name[0]}` : '?';
        const priorityBar = ({ low: 'var(--ok)', medium: 'var(--warn)', high: 'var(--brand-500)', urgent: 'var(--err)' })[task.priority] || 'var(--n-300)';

        return `
            <div draggable="true" ondragstart="TasksModule.handleDragStart(event, '${task.id}')" onclick="TasksModule.openTask('${task.id}')" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px; box-shadow:var(--sh-xs); cursor:pointer; position:relative; ${isOverdue ? 'border-color:var(--err);' : ''}">
                <div style="position:absolute; left:0; top:8px; bottom:8px; width:3px; background:${priorityBar}; border-radius:99px;"></div>
                <div style="padding-left:10px;">
                    <div style="font-size:13px; font-weight:500; letter-spacing:-0.1px; line-height:1.3; margin-bottom:8px;">${task.title}</div>
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div class="adl-avatar adl-avatar-sm">${assignedInitials}</div>
                        ${task.due_date ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; color:${isOverdue ? 'var(--err)' : 'var(--ink-mute)'};">${I.Clock({size:10})} ${this.formatDate(task.due_date)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    getFilteredTasks() {
        let filtered = [...this.tasks];

        // Filter by status/type
        if (this.currentFilter === 'my') {
            const myId = Auth.teamMember?.id;
            filtered = filtered.filter(t => t.assigned_to === myId);
        } else if (this.currentFilter !== 'all') {
            filtered = filtered.filter(t => t.status === this.currentFilter);
        }

        // Search
        const searchQuery = document.getElementById('task-search')?.value?.toLowerCase();
        if (searchQuery) {
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(searchQuery) ||
                t.description?.toLowerCase().includes(searchQuery)
            );
        }

        return filtered;
    },

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.toggle('active', tab.textContent.toLowerCase().includes(filter) || 
                (filter === 'all' && tab.textContent.includes('Všetky')) ||
                (filter === 'my' && tab.textContent.includes('Moje')));
        });
        this.renderContent();
    },

    setView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.closest('.view-btn').classList.add('active');
        this.renderContent();
    },

    handleSearch(query) {
        this.renderContent();
    },

    // Drag & Drop pre Kanban
    handleDragStart(event, taskId) {
        event.dataTransfer.setData('taskId', taskId);
        event.target.classList.add('dragging');
    },

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    },

    async handleDrop(event, newStatus) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const taskId = event.dataTransfer.getData('taskId');
        const task = this.tasks.find(t => t.id === taskId);
        
        if (!task || task.status === newStatus) return;

        try {
            const updateData = { status: newStatus };
            if (newStatus === 'done') {
                updateData.completed_at = new Date().toISOString();
            }

            const { error } = await Database.client
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) throw error;

            task.status = newStatus;
            this.renderContent();
            Utils.showNotification('Status aktualizovaný', 'success');

        } catch (error) {
            console.error('Update status error:', error);
            Utils.showNotification('Chyba pri aktualizácii', 'error');
        }
    },

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal task-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">✅</span>
                        <h2>Nová úloha</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="task-form">
                        <div class="form-group">
                            <label>Názov úlohy *</label>
                            <input type="text" name="title" required placeholder="Čo treba spraviť?">
                        </div>
                        
                        <div class="form-group">
                            <label>Popis</label>
                            <textarea name="description" rows="3" placeholder="Detailnejší popis úlohy..."></textarea>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Priorita</label>
                                <select name="priority">
                                    <option value="low">🟢 Nízka</option>
                                    <option value="medium" selected>🟡 Stredná</option>
                                    <option value="high">🟠 Vysoká</option>
                                    <option value="urgent">🔴 Urgentná</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select name="status">
                                    <option value="todo" selected>📋 To Do</option>
                                    <option value="in_progress">🔄 In Progress</option>
                                    <option value="review">👁️ Review</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Priradené</label>
                                <select name="assigned_to">
                                    <option value="">-- Nepriradené --</option>
                                    ${this.teamMembers.map(m => `
                                        <option value="${m.id}">${m.first_name} ${m.last_name}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Termín</label>
                                <input type="datetime-local" name="due_date">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Kategória</label>
                            <select name="category">
                                <option value="">-- Bez kategórie --</option>
                                <option value="sales">Sales</option>
                                <option value="marketing">Marketing</option>
                                <option value="billing">Fakturácia</option>
                                <option value="support">Podpora</option>
                                <option value="campaigns">Kampane</option>
                                <option value="onboarding">Onboarding</option>
                                <option value="other">Iné</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Tagy (oddelené čiarkou)</label>
                            <input type="text" name="tags" placeholder="tag1, tag2, tag3">
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="TasksModule.saveTask()">
                        Vytvoriť úlohu
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveTask() {
        const form = document.getElementById('task-form');
        const formData = new FormData(form);

        const tags = formData.get('tags')
            ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
            : [];

        const taskData = {
            title: formData.get('title'),
            description: formData.get('description') || null,
            priority: formData.get('priority'),
            status: formData.get('status'),
            assigned_to: formData.get('assigned_to') || null,
            due_date: formData.get('due_date') || null,
            category: formData.get('category') || null,
            tags: tags,
            created_by: Auth.teamMember?.id || null
        };

        try {
            const { data, error } = await Database.client
                .from('tasks')
                .insert([taskData])
                .select('*, assigned:team_members!assigned_to(*), creator:team_members!created_by(*)')
                .single();

            if (error) throw error;

            this.tasks.unshift(data);
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            Utils.showNotification('Úloha vytvorená', 'success');

        } catch (error) {
            console.error('Save task error:', error);
            Utils.showNotification('Chyba pri vytváraní úlohy', 'error');
        }
    },

    async openTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.selectedTask = task;

        const priorityColors = {
            low: '#10b981',
            medium: '#f59e0b',
            high: '#f97316',
            urgent: '#ef4444'
        };
        const priorityNames = {
            low: 'Nízka',
            medium: 'Stredná',
            high: 'Vysoká',
            urgent: 'Urgentná'
        };
        const statusNames = {
            todo: 'To Do',
            in_progress: 'In Progress',
            review: 'Review',
            done: 'Hotové',
            cancelled: 'Zrušené'
        };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal task-modal task-detail-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <div class="task-priority-badge" style="background: ${priorityColors[task.priority]}15; color: ${priorityColors[task.priority]}">
                            ${priorityNames[task.priority]}
                        </div>
                        <h2>${task.title}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="task-detail-grid">
                        <div class="task-main">
                            ${task.description ? `
                                <div class="detail-section">
                                    <h4>Popis</h4>
                                    <p style="white-space:pre-line;line-height:1.6;">${task.description}</p>
                                </div>
                            ` : ''}
                            
                            ${task.tags && task.tags.length > 0 ? `
                                <div class="detail-section">
                                    <h4>Tagy</h4>
                                    <div class="task-tags">
                                        ${task.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="detail-section">
                                <h4>Komentáre</h4>
                                <div id="task-comments">
                                    <div class="loading-small">Načítavam...</div>
                                </div>
                                <div class="comment-form">
                                    <textarea id="new-comment" placeholder="Napíš komentár..." rows="2"></textarea>
                                    <button class="btn-primary btn-sm" onclick="TasksModule.addComment()">Pridať</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="task-sidebar">
                            <div class="sidebar-item">
                                <label>Status</label>
                                <select id="task-status" onchange="TasksModule.updateTaskField('status', this.value)">
                                    <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>📋 To Do</option>
                                    <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>🔄 In Progress</option>
                                    <option value="review" ${task.status === 'review' ? 'selected' : ''}>👁️ Review</option>
                                    <option value="done" ${task.status === 'done' ? 'selected' : ''}>✅ Hotové</option>
                                    <option value="cancelled" ${task.status === 'cancelled' ? 'selected' : ''}>❌ Zrušené</option>
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Priradené</label>
                                <select id="task-assignee" onchange="TasksModule.updateTaskField('assigned_to', this.value)">
                                    <option value="">-- Nepriradené --</option>
                                    ${this.teamMembers.map(m => `
                                        <option value="${m.id}" ${task.assigned_to === m.id ? 'selected' : ''}>
                                            ${m.first_name} ${m.last_name}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Priorita</label>
                                <select id="task-priority" onchange="TasksModule.updateTaskField('priority', this.value)">
                                    <option value="low" ${task.priority === 'low' ? 'selected' : ''}>🟢 Nízka</option>
                                    <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>🟡 Stredná</option>
                                    <option value="high" ${task.priority === 'high' ? 'selected' : ''}>🟠 Vysoká</option>
                                    <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>🔴 Urgentná</option>
                                </select>
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Termín</label>
                                <input type="datetime-local" id="task-due" value="${task.due_date ? task.due_date.slice(0, 16) : ''}" 
                                    onchange="TasksModule.updateTaskField('due_date', this.value)">
                            </div>
                            
                            <div class="sidebar-item">
                                <label>Vytvorené</label>
                                <span class="sidebar-value">${this.formatDateTime(task.created_at)}</span>
                            </div>
                            
                            ${task.creator ? `
                                <div class="sidebar-item">
                                    <label>Vytvoril</label>
                                    <span class="sidebar-value">${task.creator.first_name} ${task.creator.last_name}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-danger" onclick="TasksModule.deleteTask('${task.id}')">
                        Zmazať úlohu
                    </button>
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Load comments
        this.loadComments(taskId);
    },

    async updateTaskField(field, value) {
        if (!this.selectedTask) return;

        const updateData = { [field]: value || null };
        if (field === 'status' && value === 'done') {
            updateData.completed_at = new Date().toISOString();
        }

        try {
            const { error } = await Database.client
                .from('tasks')
                .update(updateData)
                .eq('id', this.selectedTask.id);

            if (error) throw error;

            // Update local data
            this.selectedTask[field] = value;
            const taskIndex = this.tasks.findIndex(t => t.id === this.selectedTask.id);
            if (taskIndex >= 0) {
                this.tasks[taskIndex][field] = value;
            }

            Utils.showNotification('Uložené', 'success');

        } catch (error) {
            console.error('Update task error:', error);
            Utils.showNotification('Chyba pri ukladaní', 'error');
        }
    },

    async loadComments(taskId) {
        try {
            const { data, error } = await Database.client
                .from('task_comments')
                .select('*, author:team_members!author_id(*)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const container = document.getElementById('task-comments');
            if (!container) return;

            if (data.length === 0) {
                container.innerHTML = '<p class="no-comments">Zatiaľ žiadne komentáre</p>';
                return;
            }

            container.innerHTML = data.map(comment => `
                <div class="comment">
                    <div class="comment-avatar">${comment.author ? comment.author.first_name[0] + comment.author.last_name[0] : '?'}</div>
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-author">${comment.author ? comment.author.first_name + ' ' + comment.author.last_name : 'Neznámy'}</span>
                            <span class="comment-date">${this.formatDateTime(comment.created_at)}</span>
                        </div>
                        <p class="comment-text">${comment.content}</p>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Load comments error:', error);
        }
    },

    async addComment() {
        if (!this.selectedTask) return;

        const textarea = document.getElementById('new-comment');
        const content = textarea.value.trim();
        if (!content) return;

        try {
            const { error } = await Database.client
                .from('task_comments')
                .insert([{
                    task_id: this.selectedTask.id,
                    author_id: Auth.teamMember?.id,
                    content: content
                }]);

            if (error) throw error;

            textarea.value = '';
            this.loadComments(this.selectedTask.id);
            Utils.showNotification('Komentár pridaný', 'success');

        } catch (error) {
            console.error('Add comment error:', error);
            Utils.showNotification('Chyba pri pridávaní komentára', 'error');
        }
    },

    async deleteTask(taskId) {
        if (!await Utils.confirm('Zmazať túto úlohu?', { title: 'Zmazať úlohu', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;

        try {
            const { error } = await Database.client
                .from('tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;

            this.tasks = this.tasks.filter(t => t.id !== taskId);
            document.querySelector('.modal-overlay')?.remove();
            this.renderContent();
            Utils.showNotification('Úloha zmazaná', 'success');

        } catch (error) {
            console.error('Delete task error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) return 'Dnes';
        if (date.toDateString() === tomorrow.toDateString()) return 'Zajtra';

        return date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
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
                .tasks-module {
                    padding: 2rem;
                    max-width: 1600px;
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

                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .view-toggle {
                    display: flex;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 4px;
                }

                .view-btn {
                    padding: 8px 12px;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #64748b;
                    transition: all 0.2s;
                }

                .view-btn:hover {
                    color: #1e293b;
                }

                .view-btn.active {
                    background: white;
                    color: #6366f1;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
                    font-size: 0.875rem;
                }

                .filter-search input:focus {
                    outline: none;
                    border-color: #6366f1;
                }

                /* List View */
                .tasks-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 1rem;
                }

                .task-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .task-card:hover {
                    border-color: #6366f1;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
                }

                .task-card.completed {
                    opacity: 0.7;
                }

                .task-card.overdue {
                    border-color: #fecaca;
                    background: #fef2f2;
                }

                .task-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }

                .task-priority {
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 0.25rem 0.75rem;
                    border-radius: 20px;
                }

                .task-status {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .task-title {
                    font-size: 1rem;
                    font-weight: 600;
                    color: #1e293b;
                    margin: 0 0 0.5rem 0;
                }

                .task-description {
                    font-size: 0.875rem;
                    color: #64748b;
                    margin: 0 0 1rem 0;
                    line-height: 1.5;
                }

                .task-meta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }

                .task-assignee {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .assignee-avatar {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.7rem;
                    font-weight: 600;
                }

                .assignee-name {
                    font-size: 0.875rem;
                    color: #475569;
                }

                .task-due {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.8rem;
                    color: #64748b;
                }

                .task-due.overdue {
                    color: #ef4444;
                }

                .task-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.375rem;
                }

                .tag {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.5rem;
                    background: #f1f5f9;
                    color: #64748b;
                    border-radius: 4px;
                }

                .tag.more {
                    background: #e2e8f0;
                }

                /* Kanban View */
                .kanban-board {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    min-height: 500px;
                }

                @media (max-width: 1200px) {
                    .kanban-board {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .kanban-board {
                        grid-template-columns: 1fr;
                    }
                }

                .kanban-column {
                    background: #f8fafc;
                    border-radius: 12px;
                    overflow: hidden;
                }

                .column-header {
                    padding: 1rem;
                    background: white;
                    border-top: 3px solid;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 600;
                }

                .column-count {
                    margin-left: auto;
                    background: #e2e8f0;
                    padding: 0.125rem 0.5rem;
                    border-radius: 10px;
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .column-content {
                    padding: 1rem;
                    min-height: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .column-content.drag-over {
                    background: #e0e7ff;
                }

                .empty-column {
                    text-align: center;
                    color: #94a3b8;
                    padding: 2rem;
                    font-size: 0.875rem;
                }

                .kanban-card {
                    background: white;
                    border-radius: 8px;
                    padding: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                    border: 1px solid #e2e8f0;
                }

                .kanban-card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .kanban-card.dragging {
                    opacity: 0.5;
                }

                .kanban-card.overdue {
                    border-color: #fecaca;
                }

                .kanban-card-priority {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 4px;
                    height: 100%;
                    border-radius: 8px 0 0 8px;
                }

                .kanban-card-title {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: #1e293b;
                    margin: 0 0 0.75rem 0;
                    padding-left: 0.5rem;
                }

                .kanban-card-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-left: 0.5rem;
                }

                .kanban-assignee {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.65rem;
                    font-weight: 600;
                }

                .kanban-due {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .kanban-due.overdue {
                    color: #ef4444;
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: #64748b;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .empty-state h3 {
                    color: #1e293b;
                    margin-bottom: 0.5rem;
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

                .task-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .task-detail-modal {
                    max-width: 900px;
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

                .modal-close:hover {
                    background: #e2e8f0;
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

                .task-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 280px;
                    gap: 2rem;
                }

                @media (max-width: 768px) {
                    .task-detail-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .detail-section {
                    margin-bottom: 1.5rem;
                }

                .detail-section h4 {
                    font-size: 0.875rem;
                    color: #64748b;
                    margin: 0 0 0.75rem 0;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .task-sidebar {
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

                .sidebar-item select,
                .sidebar-item input {
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

                /* Comments */
                .comment {
                    display: flex;
                    gap: 0.75rem;
                    margin-bottom: 1rem;
                }

                .comment-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.7rem;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .comment-content {
                    flex: 1;
                }

                .comment-header {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.25rem;
                }

                .comment-author {
                    font-weight: 600;
                    font-size: 0.875rem;
                }

                .comment-date {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .comment-text {
                    font-size: 0.875rem;
                    color: #475569;
                    margin: 0;
                    line-height: 1.5;
                }

                .no-comments {
                    color: #94a3b8;
                    font-size: 0.875rem;
                    text-align: center;
                    padding: 1rem;
                }

                .comment-form {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: 1rem;
                }

                .comment-form textarea {
                    flex: 1;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    resize: none;
                    font-size: 0.875rem;
                }

                .btn-sm {
                    padding: 0.5rem 1rem;
                    font-size: 0.875rem;
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

                .form-group input:focus,
                .form-group select:focus,
                .form-group textarea:focus {
                    outline: none;
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
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

                .btn-secondary:hover {
                    background: #f8fafc;
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

                .btn-danger:hover {
                    background: #fee2e2;
                }

                .task-priority-badge {
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 0.25rem 0.75rem;
                    border-radius: 20px;
                }

                .loading {
                    text-align: center;
                    padding: 3rem;
                    color: #64748b;
                }

                .loading-small {
                    text-align: center;
                    padding: 1rem;
                    color: #94a3b8;
                    font-size: 0.875rem;
                }
            </style>
        `;
    }
};

// Export
window.TasksModule = TasksModule;
