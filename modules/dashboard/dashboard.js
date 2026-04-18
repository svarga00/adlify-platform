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

    const mrrFormatted = Utils.formatCurrency(stats.clients.mrr);
    const avgPerClient = stats.clients.active > 0 ? Math.round(stats.clients.mrr / stats.clients.active) : 0;

    const pipeline = [
      { label: 'Nové',         value: stats.leads.new,       color: 'var(--brand-500)' },
      { label: 'Ready',        value: stats.leads.ready,     color: 'var(--acc-lavender-ink)' },
      { label: 'Kontaktované', value: stats.leads.contacted, color: 'var(--acc-sky-ink)' },
      { label: 'Klienti',      value: stats.leads.converted, color: 'var(--acc-mint-ink)' }
    ];
    const pipelineTotal = pipeline.reduce((s, p) => s + p.value, 0) || 1;

    const leadStatusChips = {
      new:       { tone: 'sky',   label: 'Nový' },
      ready:     { tone: 'lav',   label: 'Ready' },
      contacted: { tone: 'brand', label: 'Kontaktovaný' },
      converted: { tone: 'mint',  label: 'Klient' }
    };

    const quickActions = [
      { icon: 'Upload',    title: 'Import leadov',       sub: 'Hromadný import domén', href: '#leads?tab=import',   tone: 'sky' },
      { icon: 'Sparkle',   title: 'Analyzovať všetky nové', sub: 'Marketing Miner + AI', href: '#leads?action=analyze-all', tone: 'lav', highlight: true },
      { icon: 'Plus',      title: 'Nový klient',         sub: 'Pridať manuálne',       href: '#clients?action=new', tone: 'mint' },
      { icon: 'Megaphone', title: 'Spustiť kampaň',      sub: 'FB / Google',           href: '#campaigns',          tone: 'amber' }
    ];

    return `
    <div class="adl">
      <!-- HERO ROW: MRR + 2 Stats -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px; margin-bottom:16px;" class="adl-dashboard-hero">
        <div style="background:linear-gradient(135deg, var(--brand-500), var(--brand-700)); color:#fff; border-radius:16px; padding:24px 28px; position:relative; overflow:hidden;">
          <div style="position:absolute; right:-40px; top:-40px; width:240px; height:240px; background:radial-gradient(circle, rgba(255,255,255,.18), transparent 70%);"></div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; opacity:.8; font-weight:600;">Mesačný príjem · MRR</div>
          <div style="font-size:56px; font-weight:700; letter-spacing:-2px; line-height:1.05; margin-top:6px;">
            ${mrrFormatted}
          </div>
          <div style="display:flex; gap:16px; margin-top:10px; align-items:center; flex-wrap:wrap;">
            <div class="mono" style="font-size:12px; background:rgba(255,255,255,.18); padding:3px 8px; border-radius:999px;">${stats.clients.active} aktívnych klientov</div>
            ${avgPerClient > 0 ? `<div style="font-size:12px; opacity:.85;">priemer ${Utils.formatCurrency(avgPerClient)}/klient</div>` : ''}
          </div>
          <div style="margin-top:18px; height:54px; position:relative;">
            <canvas id="chart-mrr-line"></canvas>
          </div>
        </div>
        <div style="display:grid; grid-template-rows: 1fr 1fr; gap:12px;">
          <a href="#leads" class="adl-stat" style="text-decoration:none;">
            <div class="adl-stat-head">
              <div class="adl-stat-label">Leady celkom</div>
              <span class="adl-chip adl-chip-brand adl-chip-sm">+${stats.leads.weekly} tento týždeň</span>
            </div>
            <div class="adl-stat-value">${stats.leads.total}</div>
          </a>
          <a href="#clients" class="adl-stat" style="text-decoration:none;">
            <div class="adl-stat-head">
              <div class="adl-stat-label">Aktívni klienti</div>
              <span class="adl-chip adl-chip-mint adl-chip-sm">${stats.clients.total - stats.clients.active > 0 ? `${stats.clients.total - stats.clients.active} neaktívni` : 'všetci aktívni'}</span>
            </div>
            <div class="adl-stat-value">${stats.clients.active}</div>
          </a>
        </div>
      </div>

      <!-- CHARTS ROW -->
      <div style="display:grid; grid-template-columns: 1.1fr 1fr; gap:16px; margin-bottom:16px;" class="adl-dashboard-charts">
        <div class="adl-card">
          <div class="adl-card-header">
            <div class="adl-card-title">Pipeline</div>
            <a href="#leads" class="adl-btn adl-btn-ghost adl-btn-sm">Detail ${I.Chevron({size:12})}</a>
          </div>
          <div class="adl-card-body" style="display:flex; gap:24px; align-items:center;">
            <div style="position:relative; flex-shrink:0;">
              <div style="width:180px; height:180px;"><canvas id="chart-pipeline"></canvas></div>
              <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none;">
                <div style="font-size:24px; font-weight:600; letter-spacing:-0.6px;">${stats.leads.total}</div>
                <div style="font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:0.8px;">leadov</div>
              </div>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
              ${pipeline.map(d => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--n-50); border-radius:8px;">
                  <span style="width:8px; height:8px; border-radius:99px; background:${d.color};"></span>
                  <span style="flex:1; font-size:13px; font-weight:500;">${d.label}</span>
                  <span class="mono" style="font-size:13px; font-weight:600;">${d.value}</span>
                  <span style="font-size:11px; color:var(--ink-mute); width:40px; text-align:right;">${Math.round(d.value/pipelineTotal*100)}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="adl-card">
          <div class="adl-card-header">
            <div class="adl-card-title">Aktivita (7 dní)</div>
            <span class="adl-chip adl-chip-mint adl-chip-sm">Posledný týždeň</span>
          </div>
          <div class="adl-card-body">
            <div style="height:140px; position:relative;">
              <canvas id="chart-activity"></canvas>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:11px; color:var(--ink-mute);">
              <span>Nových leadov: <strong style="color:var(--ink);">${stats.leads.weekly}</strong></span>
              <span>Aktívne úlohy: <strong style="color:var(--ink);">${stats.tasks.pending}</strong></span>
              <span>Konverzný pomer: <strong style="color:var(--ink);">${stats.metrics.conversionRate}%</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- BOTTOM ROW: Quick actions + Recent leads + Metrics -->
      <div style="display:grid; grid-template-columns: 1fr 1.2fr 1fr; gap:16px;" class="adl-dashboard-bottom">
        <!-- Quick actions -->
        <div class="adl-card">
          <div class="adl-card-header">
            <div class="adl-card-title">Rýchle akcie</div>
          </div>
          <div class="adl-card-body" style="padding:12px;">
            ${quickActions.map(a => `
              <a href="${a.href}" style="display:flex; gap:12px; padding:10px; border-radius:10px; text-decoration:none; color:inherit; cursor:pointer; margin-bottom:4px; background:${a.highlight ? 'var(--acc-lavender)' : 'transparent'}; transition: background .12s;" onmouseover="this.style.background='${a.highlight ? 'var(--acc-lavender)' : 'var(--n-50)'}'" onmouseout="this.style.background='${a.highlight ? 'var(--acc-lavender)' : 'transparent'}'">
                <div style="width:36px; height:36px; border-radius:9px; background:var(--acc-${a.tone==='lav'?'lavender':a.tone}); color:var(--acc-${a.tone==='lav'?'lavender':a.tone}-ink); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  ${I[a.icon]({ size: 16 })}
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:600;">${a.title}</div>
                  <div style="font-size:11px; color:var(--ink-sub);">${a.sub}</div>
                </div>
                <span style="display:flex; align-items:center; color:var(--ink-mute);">${I.Chevron({size:14})}</span>
              </a>
            `).join('')}
          </div>
        </div>

        <!-- Recent leads -->
        <div class="adl-card">
          <div class="adl-card-header">
            <div class="adl-card-title">Posledné leady</div>
            <a href="#leads" class="adl-btn adl-btn-ghost adl-btn-sm">Všetky ${I.ArrowRight({size:12})}</a>
          </div>
          <div>
            ${recentLeads.length > 0 ? recentLeads.map((lead, i) => {
              const name = lead.company_name || lead.domain || 'Neznámy';
              const firstChar = (name[0] || '?').toUpperCase();
              const chipCfg = leadStatusChips[lead.status] || leadStatusChips.new;
              return `
              <a href="#leads?id=${lead.id}" style="display:flex; align-items:center; gap:12px; padding:12px 18px; border-top:${i?'1px solid var(--border)':'none'}; text-decoration:none; color:inherit;">
                <div style="width:32px; height:32px; border-radius:8px; background:var(--n-75); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:var(--ink-sub);">${firstChar}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:500; letter-spacing:-0.1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</div>
                  <div style="font-size:11px; color:var(--ink-mute);">
                    ${lead.score ? `skóre ${lead.score} · ` : ''}${Utils.timeAgo ? Utils.timeAgo(lead.created_at) : new Date(lead.created_at).toLocaleDateString('sk')}
                  </div>
                </div>
                <span class="adl-chip adl-chip-${chipCfg.tone} adl-chip-sm"><span class="dot"></span>${chipCfg.label}</span>
              </a>`;
            }).join('') : `
              <div style="padding:32px; text-align:center; color:var(--ink-mute); font-size:13px;">Žiadne leady zatiaľ</div>
            `}
          </div>
        </div>

        <!-- Metrics -->
        <div class="adl-card">
          <div class="adl-card-header">
            <div class="adl-card-title">Metriky</div>
          </div>
          <div class="adl-card-body" style="padding:2px 18px;">
            ${[
              ['Konverzný pomer',        `${stats.metrics.conversionRate}%`, stats.metrics.conversionRate >= 5 ? 'ok' : 'n'],
              ['Priemerné skóre',        `${stats.metrics.avgScore}`,        stats.metrics.avgScore >= 70 ? 'ok' : 'n'],
              ['Nové tento týždeň',      `${stats.leads.weekly}`,            'n'],
              ['Čakajúce úlohy',         `${stats.tasks.pending}`,           stats.tasks.overdue > 0 ? 'err' : 'n'],
              ['Celkový rozpočet klientov', `${Utils.formatCurrency(stats.clients.mrr)}`, 'n']
            ].map((m, i) => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-top:${i?'1px solid var(--border)':'none'};">
                <span style="font-size:13px; color:var(--ink-sub);">${m[0]}</span>
                <span class="mono" style="font-size:13px; font-weight:600;">${m[1]}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <style>
        @media (max-width: 900px) {
          .adl-dashboard-hero,
          .adl-dashboard-charts,
          .adl-dashboard-bottom { grid-template-columns: 1fr !important; }
        }
      </style>
    </div>
    `;
  },
  
  /**
   * Initialize charts — používajú design tokens, žiadne chart legendy (používame custom legendy v HTML)
   */
  initCharts(stats) {
    // Pipeline Donut
    const pipelineCtx = document.getElementById('chart-pipeline')?.getContext('2d');
    if (pipelineCtx) {
      if (this.chartPipeline) this.chartPipeline.destroy();
      this.chartPipeline = new Chart(pipelineCtx, {
        type: 'doughnut',
        data: {
          labels: ['Nové', 'Ready', 'Kontaktované', 'Klienti'],
          datasets: [{
            data: [stats.leads.new, stats.leads.ready, stats.leads.contacted, stats.leads.converted],
            backgroundColor: ['#F97316', '#4C3E8A', '#1C4A84', '#1F6E3D'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: true } }
        }
      });
    }

    // Activity bar chart (mock data — TODO: pripojiť na activities table)
    const activityCtx = document.getElementById('chart-activity')?.getContext('2d');
    if (activityCtx) {
      const days = [];
      const counts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString('sk-SK', { weekday: 'short' }));
        counts.push(Math.floor(Math.random() * 10)); // TODO: Real data z activities table
      }

      if (this.chartActivity) this.chartActivity.destroy();
      this.chartActivity = new Chart(activityCtx, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Aktivity',
            data: counts,
            backgroundColor: '#F97316',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 32
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            y: { beginAtZero: true, display: false },
            x: {
              grid: { display: false },
              ticks: { color: '#948B7C', font: { family: 'JetBrains Mono', size: 10 } }
            }
          }
        }
      });
    }

    // MRR line chart — trend klientov (zatiaľ mock, neskôr z subscriptions/payments history)
    const mrrCtx = document.getElementById('chart-mrr-line')?.getContext('2d');
    if (mrrCtx) {
      if (this.chartMrr) this.chartMrr.destroy();
      // Mock historicka data (posledných 9 mesiacov), posledný bod = actual MRR
      const mrrHistory = [
        Math.round(stats.clients.mrr * 0.55),
        Math.round(stats.clients.mrr * 0.62),
        Math.round(stats.clients.mrr * 0.68),
        Math.round(stats.clients.mrr * 0.74),
        Math.round(stats.clients.mrr * 0.80),
        Math.round(stats.clients.mrr * 0.86),
        Math.round(stats.clients.mrr * 0.91),
        Math.round(stats.clients.mrr * 0.96),
        stats.clients.mrr
      ];
      this.chartMrr = new Chart(mrrCtx, {
        type: 'line',
        data: {
          labels: mrrHistory.map((_, i) => `M${i + 1}`),
          datasets: [{
            data: mrrHistory,
            borderColor: '#ffffff',
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: true,
            tension: 0.35
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
          elements: { line: { borderJoinStyle: 'round' } }
        }
      });
    }
  }
};

// Export
window.DashboardModule = DashboardModule;
