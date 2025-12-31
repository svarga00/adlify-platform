/**
 * ADLIFY PLATFORM - Dashboard Module
 * @version 1.0.0
 */

const DashboardModule = {
  id: 'dashboard',
  name: 'Dashboard',
  icon: '📊',
  title: 'Dashboard',
  subtitle: 'Prehľad vašej aktivity',
  
  menu: {
    section: 'main',
    order: 10
  },
  
  // Charts instances
  chartPipeline: null,
  chartActivity: null,
  
  /**
   * Initialize module
   */
  init() {
    console.log('📊 Dashboard module initialized');
  },
  
  /**
   * Render dashboard
   */
  async render(container) {
    // Show loading
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      // Fetch data
      const [leads, clients, tasksResult] = await Promise.all([
        Database.select('leads', { columns: 'id, status, score, created_at' }),
        Database.select('clients', { columns: 'id, status, monthly_fee' }),
        Database.client.from('tasks').select('id, status, due_date, assigned_to')
      ]);
      
      // Filter tasks for current user
      const tasks = (tasksResult.data || []).filter(t => 
        t.assigned_to === Auth.teamMember?.id || !t.assigned_to
      );
      
      // Calculate stats
      const stats = this.calculateStats(leads, clients, tasks);
      
      // Render
      container.innerHTML = this.template(stats, leads, clients);
      
      // Initialize charts
      this.initCharts(stats);
      
    } catch (error) {
      console.error('Dashboard error:', error);
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64">
          <div class="text-4xl mb-4">❌</div>
          <p class="text-gray-500">${error.message}</p>
        </div>
      `;
    }
  },
  
  /**
   * Calculate dashboard stats
   */
  calculateStats(leads, clients, tasks) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Lead stats
    const leadsByStatus = {
      new: leads.filter(l => l.status === 'new').length,
      ready: leads.filter(l => l.status === 'ready').length,
      contacted: leads.filter(l => l.status === 'contacted').length,
      converted: leads.filter(l => l.status === 'converted').length
    };
    
    // Client stats
    const activeClients = clients.filter(c => c.status === 'active');
    const mrr = activeClients.reduce((sum, c) => sum + (parseFloat(c.monthly_fee) || 0), 0);
    
    // Task stats
    const pendingTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress').length;
    const overdueTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length;
    
    // Weekly leads
    const weeklyLeads = leads.filter(l => new Date(l.created_at) > weekAgo).length;
    
    // Conversion rate
    const conversionRate = leads.length > 0 
      ? ((leadsByStatus.converted / leads.length) * 100).toFixed(1) 
      : 0;
    
    // Average score
    const scores = leads.filter(l => l.score).map(l => l.score);
    const avgScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
      : 0;
    
    return {
      leads: {
        total: leads.length,
        ...leadsByStatus,
        weekly: weeklyLeads
      },
      clients: {
        total: clients.length,
        active: activeClients.length,
        mrr
      },
      tasks: {
        pending: pendingTasks,
        overdue: overdueTasks
      },
      metrics: {
        conversionRate,
        avgScore
      }
    };
  },
  
  /**
   * Dashboard template
   */
  template(stats, leads, clients) {
    const recentLeads = leads
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    
    return `
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <a href="#leads" class="card p-5 hover:ring-2 hover:ring-blue-300 transition cursor-pointer">
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">👥</span>
            <span class="text-xs text-gray-400">Celkom</span>
          </div>
          <div class="text-3xl font-bold">${stats.leads.total}</div>
          <div class="text-sm text-gray-500">Leadov</div>
        </a>
        
        <a href="#leads?status=new" class="card p-5 hover:ring-2 hover:ring-blue-300 transition cursor-pointer">
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">🆕</span>
            <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Nové</span>
          </div>
          <div class="text-3xl font-bold text-blue-600">${stats.leads.new}</div>
          <div class="text-sm text-gray-500">Na analýzu</div>
        </a>
        
        <a href="#leads?status=ready" class="card p-5 hover:ring-2 hover:ring-purple-300 transition cursor-pointer">
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">✨</span>
            <span class="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Ready</span>
          </div>
          <div class="text-3xl font-bold text-purple-600">${stats.leads.ready}</div>
          <div class="text-sm text-gray-500">Na kontakt</div>
        </a>
        
        <a href="#clients" class="card p-5 hover:ring-2 hover:ring-green-300 transition cursor-pointer">
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">🏢</span>
            <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Aktívni</span>
          </div>
          <div class="text-3xl font-bold text-green-600">${stats.clients.active}</div>
          <div class="text-sm text-gray-500">Klienti</div>
        </a>
        
        <div class="card p-5 bg-gradient-to-br from-orange-500 to-pink-500 text-white">
          <div class="flex items-center justify-between mb-2">
            <span class="text-2xl">💰</span>
            <span class="text-xs bg-white/20 px-2 py-0.5 rounded-full">MRR</span>
          </div>
          <div class="text-3xl font-bold">${Utils.formatCurrency(stats.clients.mrr)}</div>
          <div class="text-sm text-white/80">Mesačný príjem</div>
        </div>
      </div>
      
      <!-- Charts Row -->
      <div class="grid lg:grid-cols-2 gap-6 mb-6">
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📊 Pipeline</h3>
          <div class="h-64">
            <canvas id="chart-pipeline"></canvas>
          </div>
        </div>
        
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📈 Aktivita (7 dní)</h3>
          <div class="h-64">
            <canvas id="chart-activity"></canvas>
          </div>
        </div>
      </div>
      
      <!-- Bottom Row -->
      <div class="grid lg:grid-cols-3 gap-6">
        <!-- Quick Actions -->
        <div class="card p-6">
          <h3 class="font-semibold mb-4">⚡ Rýchle akcie</h3>
          <div class="space-y-3">
            <a href="#leads?tab=import" class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer">
              <span class="text-xl">📥</span>
              <div>
                <div class="font-medium">Import leadov</div>
                <div class="text-xs text-gray-400">Hromadný import domén</div>
              </div>
            </a>
            <a href="#leads?action=analyze-all" class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl hover:bg-purple-100 cursor-pointer">
              <span class="text-xl">🤖</span>
              <div>
                <div class="font-medium text-purple-700">Analyzovať všetky nové</div>
                <div class="text-xs text-purple-400">AI + Marketing Miner</div>
              </div>
            </a>
            <a href="#clients?action=new" class="flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 cursor-pointer">
              <span class="text-xl">➕</span>
              <div>
                <div class="font-medium text-green-700">Nový klient</div>
                <div class="text-xs text-green-400">Pridať manuálne</div>
              </div>
            </a>
          </div>
        </div>
        
        <!-- Recent Leads -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">🕐 Posledné leady</h3>
            <a href="#leads" class="text-sm text-primary hover:underline">Všetky →</a>
          </div>
          <div class="space-y-3">
            ${recentLeads.length > 0 ? recentLeads.map(lead => `
              <a href="#leads?id=${lead.id}" class="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer">
                <div class="flex items-center gap-3">
                  ${Utils.statusBadge(lead.status, 'lead')}
                  <span class="font-medium truncate max-w-[150px]">${lead.company_name || lead.domain || 'Neznámy'}</span>
                </div>
                <span class="text-xs text-gray-400">${Utils.timeAgo(lead.created_at)}</span>
              </a>
            `).join('') : '<div class="text-center text-gray-400 py-4">Žiadne leady</div>'}
          </div>
        </div>
        
        <!-- Performance Metrics -->
        <div class="card p-6">
          <h3 class="font-semibold mb-4">📊 Metriky</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-gray-600">Konverzný pomer</span>
              <span class="font-bold text-green-600">${stats.metrics.conversionRate}%</span>
            </div>
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-gray-600">Priemerné skóre</span>
              <span class="font-bold">${stats.metrics.avgScore}</span>
            </div>
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-gray-600">Nové tento týždeň</span>
              <span class="font-bold text-blue-600">${stats.leads.weekly}</span>
            </div>
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span class="text-gray-600">Čakajúce úlohy</span>
              <span class="font-bold ${stats.tasks.overdue > 0 ? 'text-red-600' : ''}">${stats.tasks.pending}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  /**
   * Initialize charts
   */
  initCharts(stats) {
    // Pipeline Chart
    const pipelineCtx = document.getElementById('chart-pipeline')?.getContext('2d');
    if (pipelineCtx) {
      if (this.chartPipeline) this.chartPipeline.destroy();
      this.chartPipeline = new Chart(pipelineCtx, {
        type: 'doughnut',
        data: {
          labels: ['Nové', 'Ready', 'Kontaktované', 'Klienti'],
          datasets: [{
            data: [stats.leads.new, stats.leads.ready, stats.leads.contacted, stats.leads.converted],
            backgroundColor: ['#3b82f6', '#a855f7', '#f97316', '#22c55e'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
    
    // Activity Chart (mock data - would come from activities table)
    const activityCtx = document.getElementById('chart-activity')?.getContext('2d');
    if (activityCtx) {
      const days = [];
      const counts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString('sk-SK', { weekday: 'short' }));
        counts.push(Math.floor(Math.random() * 10)); // TODO: Real data
      }
      
      if (this.chartActivity) this.chartActivity.destroy();
      this.chartActivity = new Chart(activityCtx, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Aktivity',
            data: counts,
            backgroundColor: 'rgba(255, 107, 53, 0.8)',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }
};

// Export
window.DashboardModule = DashboardModule;
