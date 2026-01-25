/**
 * ADLIFY - Calendar Module
 * Prehľad termínov, deadlines a udalostí
 */

const CalendarModule = {
    id: 'calendar',
    name: 'Kalendár',
    icon: Icons.calendar,
    title: 'Kalendár',
    menu: { section: 'tools', order: 56 },
    permissions: ['calendar', 'view'],

    // Data
    currentDate: new Date(),
    events: [],
    view: 'month', // month, week, list

    async init() {
        console.log('Calendar module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="calendar-module">
                <!-- Header -->
                <div class="module-header">
                    <div class="header-left">
                        <h1>Kalendár</h1>
                        <p class="subtitle">Termíny a udalosti</p>
                    </div>
                    <div class="header-right">
                        <div class="view-toggle">
                            <button class="view-btn ${this.view === 'month' ? 'active' : ''}" onclick="CalendarModule.setView('month')">Mesiac</button>
                            <button class="view-btn ${this.view === 'week' ? 'active' : ''}" onclick="CalendarModule.setView('week')">Týždeň</button>
                            <button class="view-btn ${this.view === 'list' ? 'active' : ''}" onclick="CalendarModule.setView('list')">Zoznam</button>
                        </div>
                    </div>
                </div>

                <!-- Calendar Navigation -->
                <div class="calendar-nav">
                    <button class="nav-btn" onclick="CalendarModule.prevPeriod()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <h2 class="current-period" id="current-period">${this.formatPeriod()}</h2>
                    <button class="nav-btn" onclick="CalendarModule.nextPeriod()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                    <button class="today-btn" onclick="CalendarModule.goToday()">Dnes</button>
                </div>

                <!-- Calendar Content -->
                <div class="calendar-content" id="calendar-content">
                    <div class="loading">Načítavam...</div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        await this.loadEvents();
        this.renderCalendar();
    },

    async loadEvents() {
        try {
            // Load tasks with due dates
            const { data: tasks } = await Database.client
                .from('tasks')
                .select('id, title, due_date, status, priority')
                .not('due_date', 'is', null);

            // Load tickets with due dates
            const { data: tickets } = await Database.client
                .from('tickets')
                .select('id, subject, due_date, status, priority')
                .not('due_date', 'is', null);

            // Convert to events
            this.events = [
                ...(tasks || []).map(t => ({
                    id: t.id,
                    title: t.title,
                    date: new Date(t.due_date),
                    type: 'task',
                    status: t.status,
                    priority: t.priority
                })),
                ...(tickets || []).map(t => ({
                    id: t.id,
                    title: t.subject,
                    date: new Date(t.due_date),
                    type: 'ticket',
                    status: t.status,
                    priority: t.priority
                }))
            ];

        } catch (error) {
            console.error('Load events error:', error);
            this.events = [];
        }
    },

    renderCalendar() {
        const container = document.getElementById('calendar-content');
        if (!container) return;

        if (this.view === 'list') {
            this.renderListView(container);
        } else if (this.view === 'week') {
            this.renderWeekView(container);
        } else {
            this.renderMonthView(container);
        }
    },

    renderMonthView(container) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay() || 7; // Monday = 1
        const daysInMonth = lastDay.getDate();

        const days = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
        const today = new Date();

        let html = `
            <div class="month-grid">
                <div class="weekdays">
                    ${days.map(d => `<div class="weekday">${d}</div>`).join('')}
                </div>
                <div class="days">
        `;

        // Empty cells before first day
        for (let i = 1; i < startDay; i++) {
            html += '<div class="day empty"></div>';
        }

        // Days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === today.toDateString();
            const dayEvents = this.getEventsForDate(date);

            html += `
                <div class="day ${isToday ? 'today' : ''}" onclick="CalendarModule.showDayDetail('${date.toISOString()}')">
                    <span class="day-number">${day}</span>
                    ${dayEvents.length > 0 ? `
                        <div class="day-events">
                            ${dayEvents.slice(0, 3).map(e => `
                                <div class="event-dot ${e.type} ${e.priority}"></div>
                            `).join('')}
                            ${dayEvents.length > 3 ? `<span class="more-events">+${dayEvents.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        html += '</div></div>';
        container.innerHTML = html;
    },

    renderWeekView(container) {
        const startOfWeek = this.getStartOfWeek(this.currentDate);
        const days = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
        const today = new Date();

        let html = '<div class="week-grid">';

        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(date.getDate() + i);
            const isToday = date.toDateString() === today.toDateString();
            const dayEvents = this.getEventsForDate(date);

            html += `
                <div class="week-day ${isToday ? 'today' : ''}">
                    <div class="week-day-header">
                        <span class="week-day-name">${days[i]}</span>
                        <span class="week-day-date">${date.getDate()}.${date.getMonth() + 1}.</span>
                    </div>
                    <div class="week-day-events">
                        ${dayEvents.length > 0 ? dayEvents.map(e => `
                            <div class="week-event ${e.type} ${e.priority}" onclick="CalendarModule.openEvent('${e.type}', '${e.id}')">
                                <span class="event-icon">${e.type === 'task' ? '' : ''}</span>
                                <span class="event-title">${e.title}</span>
                            </div>
                        `).join('') : '<div class="no-events">Žiadne udalosti</div>'}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    },

    renderListView(container) {
        const upcomingEvents = this.events
            .filter(e => e.date >= new Date())
            .sort((a, b) => a.date - b.date)
            .slice(0, 20);

        if (upcomingEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${Icons.calendar}</div>
                    <h3>Žiadne nadchádzajúce udalosti</h3>
                    <p>Všetky úlohy a tickety s termínom sa zobrazia tu</p>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        upcomingEvents.forEach(e => {
            const key = e.date.toDateString();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        let html = '<div class="list-view">';

        for (const [dateStr, events] of Object.entries(grouped)) {
            const date = new Date(dateStr);
            const isToday = date.toDateString() === new Date().toDateString();
            const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString();

            let dateLabel = date.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
            if (isToday) dateLabel = 'Dnes - ' + dateLabel;
            if (isTomorrow) dateLabel = 'Zajtra - ' + dateLabel;

            html += `
                <div class="list-date-group">
                    <h3 class="list-date ${isToday ? 'today' : ''}">${dateLabel}</h3>
                    <div class="list-events">
                        ${events.map(e => `
                            <div class="list-event ${e.priority}" onclick="CalendarModule.openEvent('${e.type}', '${e.id}')">
                                <span class="event-type-icon">${e.type === 'task' ? '' : ''}</span>
                                <div class="event-info">
                                    <span class="event-title">${e.title}</span>
                                    <span class="event-meta">${e.type === 'task' ? 'Úloha' : 'Ticket'} · ${e.status}</span>
                                </div>
                                <span class="event-priority priority-${e.priority}">${this.getPriorityLabel(e.priority)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    },

    getEventsForDate(date) {
        return this.events.filter(e => 
            e.date.toDateString() === date.toDateString()
        );
    },

    getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - day + 1);
        return d;
    },

    formatPeriod() {
        if (this.view === 'week') {
            const start = this.getStartOfWeek(this.currentDate);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return `${start.getDate()}.${start.getMonth() + 1}. - ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
        }
        return this.currentDate.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });
    },

    setView(view) {
        this.view = view;
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById('current-period').textContent = this.formatPeriod();
        this.renderCalendar();
    },

    prevPeriod() {
        if (this.view === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        }
        document.getElementById('current-period').textContent = this.formatPeriod();
        this.renderCalendar();
    },

    nextPeriod() {
        if (this.view === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + 7);
        } else {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        }
        document.getElementById('current-period').textContent = this.formatPeriod();
        this.renderCalendar();
    },

    goToday() {
        this.currentDate = new Date();
        document.getElementById('current-period').textContent = this.formatPeriod();
        this.renderCalendar();
    },

    showDayDetail(dateStr) {
        const date = new Date(dateStr);
        const events = this.getEventsForDate(date);

        if (events.length === 0) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal day-modal">
                <div class="modal-header">
                    <h2>${date.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="day-events-list">
                        ${events.map(e => `
                            <div class="day-event-item ${e.priority}" onclick="CalendarModule.openEvent('${e.type}', '${e.id}'); this.closest('.modal-overlay').remove();">
                                <span class="event-icon">${e.type === 'task' ? '' : ''}</span>
                                <div class="event-details">
                                    <span class="event-title">${e.title}</span>
                                    <span class="event-meta">${e.type === 'task' ? 'Úloha' : 'Ticket'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    },

    openEvent(type, id) {
        if (type === 'task') {
            Router.navigate('tasks');
            setTimeout(() => TasksModule.openTask(id), 100);
        } else {
            Router.navigate('tickets');
            setTimeout(() => TicketsModule.openTicket(id), 100);
        }
    },

    getPriorityLabel(priority) {
        const labels = { low: 'Nízka', medium: 'Stredná', high: 'Vysoká', urgent: 'Urgentná' };
        return labels[priority] || priority;
    },

    getStyles() {
        return `
            <style>
                .calendar-module {
                    padding: 2rem;
                    max-width: 1200px;
                    margin: 0 auto;
                }

                .module-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1.5rem;
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

                .view-toggle {
                    display: flex;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 4px;
                }

                .view-btn {
                    padding: 0.5rem 1rem;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    color: #64748b;
                }

                .view-btn.active {
                    background: white;
                    color: #1e293b;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                /* Calendar Nav */
                .calendar-nav {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }

                .nav-btn {
                    width: 36px;
                    height: 36px;
                    border: 1px solid #e2e8f0;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                }

                .nav-btn:hover {
                    background: #f8fafc;
                }

                .current-period {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0;
                    min-width: 200px;
                    text-align: center;
                }

                .today-btn {
                    padding: 0.5rem 1rem;
                    border: 1px solid #6366f1;
                    background: white;
                    color: #6366f1;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.875rem;
                }

                .today-btn:hover {
                    background: #6366f1;
                    color: white;
                }

                /* Month View */
                .month-grid {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                }

                .weekdays {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }

                .weekday {
                    padding: 0.75rem;
                    text-align: center;
                    font-weight: 600;
                    font-size: 0.875rem;
                    color: #64748b;
                }

                .days {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                }

                .day {
                    min-height: 100px;
                    padding: 0.5rem;
                    border-right: 1px solid #f1f5f9;
                    border-bottom: 1px solid #f1f5f9;
                    cursor: pointer;
                }

                .day:hover {
                    background: #f8fafc;
                }

                .day.empty {
                    background: #fafafa;
                    cursor: default;
                }

                .day.today {
                    background: #eff6ff;
                }

                .day.today .day-number {
                    background: #6366f1;
                    color: white;
                    border-radius: 50%;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .day-number {
                    font-weight: 600;
                    font-size: 0.875rem;
                    color: #1e293b;
                }

                .day-events {
                    display: flex;
                    gap: 4px;
                    margin-top: 0.5rem;
                    flex-wrap: wrap;
                }

                .event-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .event-dot.task { background: #6366f1; }
                .event-dot.ticket { background: #f59e0b; }
                .event-dot.urgent { background: #ef4444; }
                .event-dot.high { background: #f97316; }

                .more-events {
                    font-size: 0.7rem;
                    color: #94a3b8;
                }

                /* Week View */
                .week-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 1rem;
                }

                .week-day {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                }

                .week-day.today {
                    border-color: #6366f1;
                }

                .week-day-header {
                    padding: 0.75rem;
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    text-align: center;
                }

                .week-day.today .week-day-header {
                    background: #6366f1;
                    color: white;
                }

                .week-day-name {
                    display: block;
                    font-weight: 600;
                    font-size: 0.875rem;
                }

                .week-day-date {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .week-day.today .week-day-date {
                    color: rgba(255,255,255,0.8);
                }

                .week-day-events {
                    padding: 0.5rem;
                    min-height: 150px;
                }

                .week-event {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem;
                    background: #f8fafc;
                    border-radius: 6px;
                    margin-bottom: 0.5rem;
                    cursor: pointer;
                    font-size: 0.8rem;
                }

                .week-event:hover {
                    background: #e2e8f0;
                }

                .week-event.urgent,
                .week-event.high {
                    border-left: 3px solid #ef4444;
                }

                .event-title {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .no-events {
                    color: #94a3b8;
                    font-size: 0.8rem;
                    text-align: center;
                    padding: 1rem;
                }

                /* List View */
                .list-view {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .list-date-group {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                }

                .list-date {
                    margin: 0;
                    padding: 1rem;
                    background: #f8fafc;
                    font-size: 1rem;
                    font-weight: 600;
                    border-bottom: 1px solid #e2e8f0;
                }

                .list-date.today {
                    background: #6366f1;
                    color: white;
                }

                .list-events {
                    padding: 0.5rem;
                }

                .list-event {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.75rem;
                    border-radius: 8px;
                    cursor: pointer;
                }

                .list-event:hover {
                    background: #f8fafc;
                }

                .event-type-icon {
                    font-size: 1.25rem;
                }

                .event-info {
                    flex: 1;
                }

                .event-info .event-title {
                    display: block;
                    font-weight: 500;
                }

                .event-meta {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .event-priority {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                }

                .priority-low { background: #d1fae5; color: #059669; }
                .priority-medium { background: #fef3c7; color: #d97706; }
                .priority-high { background: #fed7aa; color: #ea580c; }
                .priority-urgent { background: #fecaca; color: #dc2626; }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem;
                    color: #64748b;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                /* Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }

                .day-modal {
                    background: white;
                    border-radius: 12px;
                    width: 400px;
                    max-width: 90%;
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 1.1rem;
                }

                .modal-close {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 1.25rem;
                }

                .modal-body {
                    padding: 1rem;
                }

                .day-event-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    border-radius: 8px;
                    cursor: pointer;
                }

                .day-event-item:hover {
                    background: #f8fafc;
                }

                .event-details .event-title {
                    display: block;
                    font-weight: 500;
                }

                .loading {
                    text-align: center;
                    padding: 4rem;
                    color: #64748b;
                }

                @media (max-width: 768px) {
                    .week-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
    }
};

// Export
window.CalendarModule = CalendarModule;
