/**
 * ADLIFY - Reporting Module
 * Štatistiky, prehľady a exporty
 */

const ReportingModule = {
    id: 'reporting',
    name: 'Reporty',
    icon: Icons.dashboard,
    title: 'Reporty',
    menu: { section: 'tools', order: 55 },
    permissions: ['reporting', 'view'],

    // Data
    dateRange: '30days',
    data: null,

    async init() {
        console.log('Reporting module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="reporting-module">
                <!-- Header -->
                <div class="module-header">
                    <div class="header-left">
                        <h1>Reporty</h1>
                        <p class="subtitle">Štatistiky a prehľady</p>
                    </div>
                    <div class="header-right">
                        <select class="date-range-select" onchange="ReportingModule.setDateRange(this.value)">
                            <option value="7days">Posledných 7 dní</option>
                            <option value="30days" selected>Posledných 30 dní</option>
                            <option value="90days">Posledných 90 dní</option>
                            <option value="year">Tento rok</option>
                            <option value="all">Celkovo</option>
                        </select>
                        <button class="btn-secondary" onclick="ReportingModule.exportReport()">
                            ${Icons.inbox} Exportovať
                        </button>
                    </div>
                </div>

                <!-- Loading -->
                <div class="report-content" id="report-content">
                    <div class="loading">Načítavam dáta...</div>
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
            <!-- Summary Cards -->
            <div class="summary-cards">
                <div class="summary-card">
                    <div class="card-icon leads">${Icons.target}</div>
                    <div class="card-content">
                        <span class="card-value">${stats.leads.total}</span>
                        <span class="card-label">Nových leadov</span>
                        <span class="card-change ${stats.leads.converted > 0 ? 'positive' : ''}">${stats.leads.converted} konvertovaných</span>
                    </div>
                </div>
                
                <div class="summary-card">
                    <div class="card-icon clients">${Icons.users}</div>
                    <div class="card-content">
                        <span class="card-value">${stats.clients.active}</span>
                        <span class="card-label">Aktívnych klientov</span>
                        <span class="card-change">${stats.clients.total} celkovo</span>
                    </div>
                </div>
                
                <div class="summary-card">
                    <div class="card-icon revenue">${Icons.billing}</div>
                    <div class="card-content">
                        <span class="card-value">${this.formatCurrency(stats.revenue.total)}</span>
                        <span class="card-label">Tržby</span>
                        <span class="card-change">${stats.revenue.paid} zaplatených faktúr</span>
                    </div>
                </div>
                
                <div class="summary-card">
                    <div class="card-icon tasks">${Icons.checkCircle}</div>
                    <div class="card-content">
                        <span class="card-value">${stats.tasks.completed}</span>
                        <span class="card-label">Dokončených úloh</span>
                        <span class="card-change">${stats.tasks.total} celkovo</span>
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="charts-row">
                <div class="chart-card">
                    <h3>📈 Leady podľa statusu</h3>
                    <div class="chart-container">
                        <canvas id="leads-chart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card">
                    <h3>💵 Tržby podľa mesiaca</h3>
                    <div class="chart-container">
                        <canvas id="revenue-chart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Details Tables -->
            <div class="details-row">
                <div class="detail-card">
                    <h3>${Icons.target} Top leady</h3>
                    <div class="detail-table">
                        ${this.renderTopLeads()}
                    </div>
                </div>
                
                <div class="detail-card">
                    <h3>${Icons.tickets} Tickety podľa statusu</h3>
                    <div class="tickets-stats">
                        ${this.renderTicketStats(stats.tickets)}
                    </div>
                </div>
                
                <div class="detail-card">
                    <h3>⏱️ Produktivita tímu</h3>
                    <div class="productivity-stats">
                        <div class="prod-item">
                            <span class="prod-label">Priemerný čas na ticket</span>
                            <span class="prod-value">${stats.tickets.avgResponseTime}</span>
                        </div>
                        <div class="prod-item">
                            <span class="prod-label">Úlohy na člena/týždeň</span>
                            <span class="prod-value">${stats.tasks.perMemberWeek}</span>
                        </div>
                        <div class="prod-item">
                            <span class="prod-label">Konverzný pomer leadov</span>
                            <span class="prod-value">${stats.leads.conversionRate}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Init charts
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
            return '<p class="no-data">Žiadne leady</p>';
        }

        return `
            <table>
                <thead>
                    <tr>
                        <th>Firma</th>
                        <th>Skóre</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${topLeads.map(lead => `
                        <tr>
                            <td>${lead.company_name || 'Neznámy'}</td>
                            <td><span class="score-badge">${lead.score || 0}</span></td>
                            <td><span class="status-badge status-${lead.status}">${lead.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    renderTicketStats(tickets) {
        return `
            <div class="ticket-stat open">
                <span class="stat-count">${tickets.open}</span>
                <span class="stat-label">Otvorené</span>
            </div>
            <div class="ticket-stat progress">
                <span class="stat-count">${tickets.in_progress}</span>
                <span class="stat-label">V riešení</span>
            </div>
            <div class="ticket-stat resolved">
                <span class="stat-count">${tickets.resolved}</span>
                <span class="stat-label">Vyriešené</span>
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
        document.getElementById('report-content').innerHTML = '<div class="loading">Načítavam dáta...</div>';
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
