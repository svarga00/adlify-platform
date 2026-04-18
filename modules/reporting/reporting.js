/**
 * ADLIFY - Reporting Module
 * Štatistiky, prehľady a exporty
 */

const ReportingModule = {
    id: 'reporting',
    name: 'Reporty',
    icon: '📊',
    title: 'Reporty',
    menu: { section: 'tools', order: 55 },
    permissions: ['reporting', 'view'],

    // Data
    dateRange: '30days',
    data: null,

    async init() {
        console.log('📊 Reporting module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="adl reporting-module">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Reporty</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">Štatistiky a prehľady</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <select class="adl-input" onchange="ReportingModule.setDateRange(this.value)" style="width:auto;">
                            <option value="7days">Posledných 7 dní</option>
                            <option value="30days" selected>Posledných 30 dní</option>
                            <option value="90days">Posledných 90 dní</option>
                            <option value="year">Tento rok</option>
                            <option value="all">Celkovo</option>
                        </select>
                        <button class="adl-btn adl-btn-outline adl-btn-sm" onclick="ReportingModule.exportReport()">${I.Download({size:14})} Exportovať</button>
                    </div>
                </div>

                <div id="report-content">
                    <div style="text-align:center; padding:40px; color:var(--ink-mute);">Načítavam dáta…</div>
                </div>
            </div>

            ${this.getStyles()}
        `;

        await this.loadData();
        this.renderContent();
    },

    async loadData() {
        try {
            const dateFilter = this.getDateFilter();

            // Parallel fetch all data
            const [leads, clients, invoices, tasks, tickets] = await Promise.all([
                Database.client.from('leads').select('*').gte('created_at', dateFilter),
                Database.client.from('clients').select('*'),
                Database.client.from('invoices').select('*').gte('created_at', dateFilter),
                Database.client.from('tasks').select('*').gte('created_at', dateFilter),
                Database.client.from('tickets').select('*').gte('created_at', dateFilter)
            ]);

            this.data = {
                leads: leads.data || [],
                clients: clients.data || [],
                invoices: invoices.data || [],
                tasks: tasks.data || [],
                tickets: tickets.data || []
            };

        } catch (error) {
            console.error('Load report data error:', error);
            this.data = { leads: [], clients: [], invoices: [], tasks: [], tickets: [] };
        }
    },

    getDateFilter() {
        const now = new Date();
        switch (this.dateRange) {
            case '7days':
                return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
            case '30days':
                return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
            case '90days':
                return new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
            case 'year':
                return new Date(now.getFullYear(), 0, 1).toISOString();
            default:
                return '2020-01-01';
        }
    },

    renderContent() {
        const container = document.getElementById('report-content');
        if (!container || !this.data) return;

        const stats = this.calculateStats();

        container.innerHTML = `
            <!-- Summary -->
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:16px;" class="adl-report-summary">
                <div class="adl-stat">
                    <div class="adl-stat-head"><div class="adl-stat-label">Noví leady</div><span class="adl-chip adl-chip-sky adl-chip-sm">${stats.leads.converted} konv.</span></div>
                    <div class="adl-stat-value">${stats.leads.total}</div>
                </div>
                <div class="adl-stat">
                    <div class="adl-stat-head"><div class="adl-stat-label">Aktívni klienti</div><span class="adl-chip adl-chip-mint adl-chip-sm">${stats.clients.total} total</span></div>
                    <div class="adl-stat-value">${stats.clients.active}</div>
                </div>
                <div class="adl-stat">
                    <div class="adl-stat-head"><div class="adl-stat-label">Tržby</div><span class="adl-chip adl-chip-brand adl-chip-sm">${stats.revenue.paid} zaplatených</span></div>
                    <div class="adl-stat-value">${this.formatCurrency(stats.revenue.total)}</div>
                </div>
                <div class="adl-stat">
                    <div class="adl-stat-head"><div class="adl-stat-label">Dokončené úlohy</div><span class="adl-chip adl-chip-sm">${stats.tasks.total} total</span></div>
                    <div class="adl-stat-value">${stats.tasks.completed}</div>
                </div>
            </div>

            <!-- Charts Row -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;" class="adl-report-charts">
                <div class="adl-card">
                    <div class="adl-card-header"><div class="adl-card-title">Leady podľa statusu</div></div>
                    <div class="adl-card-body" style="height:260px; position:relative;">
                        <canvas id="leads-chart"></canvas>
                    </div>
                </div>
                <div class="adl-card">
                    <div class="adl-card-header"><div class="adl-card-title">Tržby podľa mesiaca</div></div>
                    <div class="adl-card-body" style="height:260px; position:relative;">
                        <canvas id="revenue-chart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Details Row -->
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;" class="adl-report-details">
                <div class="adl-card">
                    <div class="adl-card-header"><div class="adl-card-title">Top leady</div></div>
                    <div style="padding:0;">${this.renderTopLeads()}</div>
                </div>
                <div class="adl-card">
                    <div class="adl-card-header"><div class="adl-card-title">Tickety podľa statusu</div></div>
                    <div class="adl-card-body">${this.renderTicketStats(stats.tickets)}</div>
                </div>
                <div class="adl-card">
                    <div class="adl-card-header"><div class="adl-card-title">Produktivita tímu</div></div>
                    <div class="adl-card-body" style="padding:2px 18px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border);">
                            <span style="font-size:13px; color:var(--ink-sub);">Priemerný čas na ticket</span>
                            <span class="mono" style="font-size:13px; font-weight:600;">${stats.tickets.avgResponseTime}</span>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border);">
                            <span style="font-size:13px; color:var(--ink-sub);">Úlohy na člena/týždeň</span>
                            <span class="mono" style="font-size:13px; font-weight:600;">${stats.tasks.perMemberWeek}</span>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0;">
                            <span style="font-size:13px; color:var(--ink-sub);">Konverzný pomer leadov</span>
                            <span class="mono" style="font-size:13px; font-weight:600; color:var(--ok);">${stats.leads.conversionRate}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                @media (max-width: 1100px) {
                    .adl-report-summary { grid-template-columns: repeat(2, 1fr) !important; }
                    .adl-report-charts { grid-template-columns: 1fr !important; }
                    .adl-report-details { grid-template-columns: 1fr !important; }
                }
            </style>
        `;

        this.initCharts(stats);
    },

    calculateStats() {
        const { leads, clients, invoices, tasks, tickets } = this.data;

        // Leads stats
        const leadsConverted = leads.filter(l => l.status === 'client').length;
        const conversionRate = leads.length > 0 ? Math.round((leadsConverted / leads.length) * 100) : 0;

        // Clients stats
        const activeClients = clients.filter(c => c.status === 'active').length;

        // Revenue stats
        const paidInvoices = invoices.filter(i => i.status === 'paid');
        const totalRevenue = paidInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

        // Tasks stats
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const tasksPerWeek = Math.round(tasks.length / 4); // rough estimate

        // Tickets stats
        const ticketsByStatus = {
            open: tickets.filter(t => t.status === 'open').length,
            in_progress: tickets.filter(t => t.status === 'in_progress').length,
            resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length
        };

        return {
            leads: {
                total: leads.length,
                converted: leadsConverted,
                conversionRate,
                byStatus: this.groupByStatus(leads)
            },
            clients: {
                total: clients.length,
                active: activeClients
            },
            revenue: {
                total: totalRevenue,
                paid: paidInvoices.length,
                byMonth: this.groupRevenueByMonth(paidInvoices)
            },
            tasks: {
                total: tasks.length,
                completed: completedTasks,
                perMemberWeek: tasksPerWeek
            },
            tickets: {
                ...ticketsByStatus,
                total: tickets.length,
                avgResponseTime: '~2h' // placeholder
            }
        };
    },

    groupByStatus(items) {
        const groups = {};
        items.forEach(item => {
            const status = item.status || 'unknown';
            groups[status] = (groups[status] || 0) + 1;
        });
        return groups;
    },

    groupRevenueByMonth(invoices) {
        const months = {};
        invoices.forEach(inv => {
            const date = new Date(inv.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months[key] = (months[key] || 0) + (parseFloat(inv.total) || 0);
        });
        return months;
    },

    renderTopLeads() {
        const topLeads = this.data.leads
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5);

        if (topLeads.length === 0) {
            return '<div style="padding:28px; text-align:center; color:var(--ink-mute); font-size:13px;">Žiadne leady</div>';
        }

        const statusTone = { new: 'sky', analyzed: 'lav', contacted: 'brand', proposal_sent: 'amber', won: 'mint', lost: 'err', client: 'mint' };

        return `
            <div>
                ${topLeads.map((lead, i) => {
                    const score = lead.score || 0;
                    const scoreColor = score >= 70 ? 'var(--ok)' : score >= 40 ? 'var(--warn)' : 'var(--ink-mute)';
                    return `
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 18px; ${i > 0 ? 'border-top:1px solid var(--border);' : ''}">
                        <span style="flex:1; font-size:13px; font-weight:500; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${lead.company_name || 'Neznámy'}</span>
                        <span class="mono" style="display:inline-flex; align-items:center; justify-content:center; min-width:30px; height:22px; padding:0 6px; border-radius:6px; background:color-mix(in oklab, ${scoreColor} 14%, transparent); color:${scoreColor}; font-weight:600; font-size:11px;">${score}</span>
                        <span class="adl-chip adl-chip-${statusTone[lead.status] || 'n'} adl-chip-sm">${lead.status}</span>
                    </div>
                `;}).join('')}
            </div>
        `;
    },

    renderTicketStats(tickets) {
        return `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--acc-sky); border-radius:10px; color:var(--acc-sky-ink);">
                    <span style="font-size:12px; font-weight:500;">Otvorené</span>
                    <span class="mono" style="font-size:18px; font-weight:700;">${tickets.open}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--acc-amber); border-radius:10px; color:var(--acc-amber-ink);">
                    <span style="font-size:12px; font-weight:500;">V riešení</span>
                    <span class="mono" style="font-size:18px; font-weight:700;">${tickets.in_progress}</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--acc-mint); border-radius:10px; color:var(--acc-mint-ink);">
                    <span style="font-size:12px; font-weight:500;">Vyriešené</span>
                    <span class="mono" style="font-size:18px; font-weight:700;">${tickets.resolved}</span>
                </div>
            </div>
        `;
    },

    initCharts(stats) {
        // Leads by status chart
        const leadsCtx = document.getElementById('leads-chart');
        if (leadsCtx && window.Chart) {
            new Chart(leadsCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(stats.leads.byStatus),
                    datasets: [{
                        data: Object.values(stats.leads.byStatus),
                        backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        // Revenue by month chart
        const revenueCtx = document.getElementById('revenue-chart');
        if (revenueCtx && window.Chart) {
            const months = Object.keys(stats.revenue.byMonth).sort();
            new Chart(revenueCtx, {
                type: 'bar',
                data: {
                    labels: months.map(m => {
                        const [y, mo] = m.split('-');
                        return `${mo}/${y.slice(2)}`;
                    }),
                    datasets: [{
                        label: 'Tržby €',
                        data: months.map(m => stats.revenue.byMonth[m]),
                        backgroundColor: 'rgba(249, 115, 22, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }
    },

    async setDateRange(range) {
        this.dateRange = range;
        document.getElementById('report-content').innerHTML = '<div style="text-align:center; padding:40px; color:var(--ink-mute);">Načítavam dáta…</div>';
        await this.loadData();
        this.renderContent();
    },

    exportReport() {
        if (!this.data) return;

        const stats = this.calculateStats();
        const report = `
ADLIFY REPORT
=============
Obdobie: ${this.dateRange}
Vygenerované: ${new Date().toLocaleString('sk-SK')}

LEADY
-----
Celkom: ${stats.leads.total}
Konvertované: ${stats.leads.converted}
Konverzný pomer: ${stats.leads.conversionRate}%

KLIENTI
-------
Aktívni: ${stats.clients.active}
Celkom: ${stats.clients.total}

TRŽBY
-----
Celkom: ${this.formatCurrency(stats.revenue.total)}
Zaplatených faktúr: ${stats.revenue.paid}

ÚLOHY
-----
Dokončené: ${stats.tasks.completed}
Celkom: ${stats.tasks.total}

TICKETY
-------
Otvorené: ${stats.tickets.open}
V riešení: ${stats.tickets.in_progress}
Vyriešené: ${stats.tickets.resolved}
        `;

        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adlify-report-${this.dateRange}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        Utils.showNotification('Report exportovaný', 'success');
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('sk-SK', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    },

    getStyles() {
        return `
            <style>
                .reporting-module {
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

                .header-right {
                    display: flex;
                    gap: 1rem;
                }

                .date-range-select {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    background: white;
                }

                .btn-secondary {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    cursor: pointer;
                }

                .btn-secondary:hover {
                    background: #f8fafc;
                }

                /* Summary Cards */
                .summary-cards {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                @media (max-width: 1024px) {
                    .summary-cards {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                .summary-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    display: flex;
                    gap: 1rem;
                    border: 1px solid #e2e8f0;
                }

                .card-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                }

                .card-icon.leads { background: #dbeafe; }
                .card-icon.clients { background: #d1fae5; }
                .card-icon.revenue { background: #fef3c7; }
                .card-icon.tasks { background: #e0e7ff; }

                .card-content {
                    display: flex;
                    flex-direction: column;
                }

                .card-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #1e293b;
                }

                .card-label {
                    font-size: 0.875rem;
                    color: #64748b;
                }

                .card-change {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    margin-top: 0.25rem;
                }

                .card-change.positive {
                    color: #10b981;
                }

                /* Charts */
                .charts-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }

                @media (max-width: 768px) {
                    .charts-row {
                        grid-template-columns: 1fr;
                    }
                }

                .chart-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.5rem;
                    border: 1px solid #e2e8f0;
                }

                .chart-card h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 1rem 0;
                }

                .chart-container {
                    height: 250px;
                    position: relative;
                }

                /* Details */
                .details-row {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1.5rem;
                }

                @media (max-width: 1024px) {
                    .details-row {
                        grid-template-columns: 1fr;
                    }
                }

                .detail-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.5rem;
                    border: 1px solid #e2e8f0;
                }

                .detail-card h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 1rem 0;
                }

                .detail-table table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .detail-table th,
                .detail-table td {
                    padding: 0.5rem;
                    text-align: left;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 0.875rem;
                }

                .detail-table th {
                    color: #64748b;
                    font-weight: 500;
                }

                .score-badge {
                    background: #e0e7ff;
                    color: #4f46e5;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .status-badge {
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                }

                .status-new { background: #dbeafe; color: #1d4ed8; }
                .status-contacted { background: #fef3c7; color: #d97706; }
                .status-client { background: #d1fae5; color: #059669; }

                .no-data {
                    color: #94a3b8;
                    text-align: center;
                    padding: 1rem;
                }

                /* Tickets stats */
                .tickets-stats {
                    display: flex;
                    gap: 1rem;
                }

                .ticket-stat {
                    flex: 1;
                    text-align: center;
                    padding: 1rem;
                    border-radius: 8px;
                }

                .ticket-stat.open { background: #dbeafe; }
                .ticket-stat.progress { background: #fef3c7; }
                .ticket-stat.resolved { background: #d1fae5; }

                .stat-count {
                    display: block;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #1e293b;
                }

                .stat-label {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                /* Productivity */
                .productivity-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .prod-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.75rem;
                    background: #f8fafc;
                    border-radius: 8px;
                }

                .prod-label {
                    font-size: 0.875rem;
                    color: #64748b;
                }

                .prod-value {
                    font-weight: 600;
                    color: #1e293b;
                }

                .loading {
                    text-align: center;
                    padding: 4rem;
                    color: #64748b;
                }
            </style>
        `;
    }
};

// Export
window.ReportingModule = ReportingModule;
