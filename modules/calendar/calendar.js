/**
 * ADLIFY - Calendar Module
 * Prehľad termínov, deadlines a udalostí
 */

const CalendarModule = {
    id: 'calendar',
    name: 'Kalendár',
    icon: '📅',
    title: 'Kalendár',
    menu: { section: 'tools', order: 56 },
    permissions: ['calendar', 'view'],

    // Data
    currentDate: new Date(),
    events: [],
    view: 'month', // month, week, list

    async init() {
        console.log('📅 Calendar module initialized');
    },

    async render(container) {
        const view = this.view || 'month';
        container.innerHTML = `
            <div class="adl calendar-module">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Kalendár</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">Termíny a udalosti</div>
                    </div>
                    <div style="display:inline-flex; background:var(--n-75); border-radius:9px; padding:3px;">
                        <button onclick="CalendarModule.setView('month')" class="adl-btn adl-btn-sm ${view==='month'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Mesiac</button>
                        <button onclick="CalendarModule.setView('week')" class="adl-btn adl-btn-sm ${view==='week'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Týždeň</button>
                        <button onclick="CalendarModule.setView('list')" class="adl-btn adl-btn-sm ${view==='list'?'adl-btn-ink':'adl-btn-ghost'}" style="border-radius:7px; padding:0 12px;">Zoznam</button>
                    </div>
                </div>

                <!-- Navigation -->
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                    <button class="adl-btn adl-btn-icon adl-btn-sm" onclick="CalendarModule.prevPeriod()">${I.ChevronLeft({size:14})}</button>
                    <h2 id="current-period" style="font-size:16px; font-weight:600; margin:0;">${this.formatPeriod()}</h2>
                    <button class="adl-btn adl-btn-icon adl-btn-sm" onclick="CalendarModule.nextPeriod()">${I.Chevron({size:14})}</button>
                    <button class="adl-btn adl-btn-soft adl-btn-sm" onclick="CalendarModule.goToday()">Dnes</button>
                </div>

                <div id="calendar-content">
                    <div style="text-align:center; padding:40px; color:var(--ink-mute);">Načítavam…</div>
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
        const startDay = firstDay.getDay() || 7;
        const daysInMonth = lastDay.getDate();

        const days = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
        const today = new Date();
        const priorityDot = { low: 'var(--ok)', medium: 'var(--warn)', high: 'var(--brand-500)', urgent: 'var(--err)' };

        let html = `
            <div class="adl-card">
                <div style="display:grid; grid-template-columns:repeat(7, 1fr); background:var(--n-50); border-bottom:1px solid var(--border);">
                    ${days.map(d => `<div style="padding:10px 6px; text-align:center; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:var(--ink-sub);">${d}</div>`).join('')}
                </div>
                <div style="display:grid; grid-template-columns:repeat(7, 1fr);">
        `;

        for (let i = 1; i < startDay; i++) {
            html += '<div style="aspect-ratio:1; background:var(--n-25); border-right:1px solid var(--border); border-bottom:1px solid var(--border);"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === today.toDateString();
            const dayEvents = this.getEventsForDate(date);
            const isWeekend = [0, 6].includes(date.getDay());

            html += `
                <div onclick="CalendarModule.showDayDetail('${date.toISOString()}')" style="aspect-ratio:1; padding:8px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); cursor:pointer; transition: background .12s; background:${isToday ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))' : isWeekend ? 'var(--n-25)' : 'var(--surface)'}; display:flex; flex-direction:column; gap:4px;" onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background='${isToday ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))' : isWeekend ? 'var(--n-25)' : 'var(--surface)'}'">
                    <span style="font-size:13px; font-weight:${isToday ? '700' : '500'}; color:${isToday ? 'var(--brand-600)' : 'var(--ink)'};">${day}</span>
                    ${dayEvents.length > 0 ? `
                        <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                            ${dayEvents.slice(0, 3).map(e => `<div style="font-size:10px; padding:2px 5px; background:color-mix(in oklab, ${priorityDot[e.priority] || 'var(--ink-mute)'} 15%, var(--surface)); color:${priorityDot[e.priority] || 'var(--ink)'}; border-radius:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${e.title}</div>`).join('')}
                            ${dayEvents.length > 3 ? `<span style="font-size:10px; color:var(--ink-mute);">+${dayEvents.length - 3} ďalších</span>` : ''}
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
        const priorityTone = { low: 'mint', medium: 'amber', high: 'brand', urgent: 'err' };

        let html = '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:10px;" class="adl-calendar-week">';

        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(date.getDate() + i);
            const isToday = date.toDateString() === today.toDateString();
            const dayEvents = this.getEventsForDate(date);

            html += `
                <div style="background:var(--surface); border:1px solid ${isToday ? 'var(--brand-400)' : 'var(--border)'}; border-radius:12px; overflow:hidden; min-height:240px;">
                    <div style="padding:10px 12px; background:${isToday ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))' : 'var(--n-50)'}; border-bottom:1px solid var(--border);">
                        <div style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:var(--ink-sub);">${days[i].slice(0, 3)}</div>
                        <div style="font-size:18px; font-weight:700; letter-spacing:-0.4px; color:${isToday ? 'var(--brand-600)' : 'var(--ink)'};">${date.getDate()}.${date.getMonth() + 1}.</div>
                    </div>
                    <div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
                        ${dayEvents.length > 0 ? dayEvents.map(e => `
                            <div onclick="CalendarModule.openEvent('${e.type}', '${e.id}')" style="padding:8px 10px; background:var(--n-50); border-radius:8px; cursor:pointer; border-left:3px solid ${priorityTone[e.priority] === 'err' ? 'var(--err)' : priorityTone[e.priority] === 'brand' ? 'var(--brand-500)' : priorityTone[e.priority] === 'amber' ? 'var(--warn)' : 'var(--ok)'};">
                                <div style="font-size:11px; color:var(--ink-mute); margin-bottom:2px;">${e.type === 'task' ? 'Úloha' : 'Ticket'}</div>
                                <div style="font-size:12px; font-weight:500; color:var(--ink); line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${e.title}</div>
                            </div>
                        `).join('') : '<div style="padding:20px 8px; text-align:center; color:var(--ink-mute); font-size:11px;">Žiadne udalosti</div>'}
                    </div>
                </div>
            `;
        }

        html += '</div><style>@media (max-width: 900px) { .adl-calendar-week { grid-template-columns: 1fr !important; } .adl-calendar-week > div { min-height: 0 !important; } }</style>';
        container.innerHTML = html;
    },

    renderListView(container) {
        const upcomingEvents = this.events
            .filter(e => e.date >= new Date())
            .sort((a, b) => a.date - b.date)
            .slice(0, 20);

        if (upcomingEvents.length === 0) {
            container.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Calendar({size:22})}</div>
                    <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne nadchádzajúce udalosti</h3>
                    <p style="font-size:13px; color:var(--ink-sub); margin:0;">Všetky úlohy a tickety s termínom sa zobrazia tu</p>
                </div>
            `;
            return;
        }

        const grouped = {};
        upcomingEvents.forEach(e => {
            const key = e.date.toDateString();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
        });

        const priorityTone = { low: 'mint', medium: 'amber', high: 'brand', urgent: 'err' };

        let html = '<div style="display:flex; flex-direction:column; gap:14px;">';

        for (const [dateStr, events] of Object.entries(grouped)) {
            const date = new Date(dateStr);
            const isToday = date.toDateString() === new Date().toDateString();
            const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString();

            let dateLabel = date.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
            if (isToday) dateLabel = 'Dnes — ' + dateLabel;
            if (isTomorrow) dateLabel = 'Zajtra — ' + dateLabel;

            html += `
                <div>
                    <h3 style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:${isToday ? 'var(--brand-600)' : 'var(--ink-sub)'}; margin:0 0 8px;">${dateLabel}</h3>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${events.map(e => `
                            <div onclick="CalendarModule.openEvent('${e.type}', '${e.id}')" style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:10px; cursor:pointer; transition: border-color .12s;" onmouseover="this.style.borderColor='var(--border-strong)'" onmouseout="this.style.borderColor='var(--border)'">
                                <div style="color:${e.type === 'task' ? 'var(--acc-mint-ink)' : 'var(--acc-lavender-ink)'}; display:inline-flex; flex-shrink:0;">${e.type === 'task' ? I.Tasks({size:16}) : I.Ticket({size:16})}</div>
                                <div style="flex:1; min-width:0;">
                                    <div style="font-size:13px; font-weight:500; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${e.title}</div>
                                    <div style="font-size:11px; color:var(--ink-mute);">${e.type === 'task' ? 'Úloha' : 'Ticket'} · ${e.status}</div>
                                </div>
                                <span class="adl-chip adl-chip-${priorityTone[e.priority] || 'n'} adl-chip-sm">${this.getPriorityLabel(e.priority)}</span>
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
                                <span class="event-icon">${e.type === 'task' ? '✅' : '🎫'}</span>
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
