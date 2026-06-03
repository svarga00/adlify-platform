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

  // Inline SVG ikony špecifické pre Dashboard (bez emoji)
  _dashIcons() {
    const wrap = (inner, size = 14, color = 'currentColor') =>
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;">${inner}</svg>`;
    return {
      mail:        (s, c) => wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', s, c),
      flame:       (s, c) => wrap('<path d="M12 2c1 4 4 5 4 9a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 2 3 2 5z"/><path d="M14 13a2 2 0 1 1-4 0c0-1 1-2 2-3 0 1 2 2 2 3z"/>', s, c),
      activity:    (s, c) => wrap('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', s, c),
      mapPin:      (s, c) => wrap('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>', s, c),
      mouseClick:  (s, c) => wrap('<path d="M9 9l3 12 2-5 5-2L9 9z"/><path d="M9 4v2M4 9h2M5.5 5.5l1.5 1.5"/>', s, c),
      reply:       (s, c) => wrap('<path d="M9 17l-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v2"/>', s, c),
      eye:         (s, c) => wrap('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>', s, c),
      target:      (s, c) => wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', s, c),
    };
  },

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
      const [leads, clients, tasksResult, hotProspectsResult, recentEventsResult, clientMessagesResult, portalClientsResult] = await Promise.all([
        Database.select('leads', { columns: 'id, status, score, created_at' }),
        Database.select('clients', { columns: 'id, status, monthly_fee, company_name' }),
        Database.client.from('tasks').select('id, status, due_date, assigned_to'),
        Database.client.from('prospects').select('id, company_name, domain, email, score, outreach_stage, audit_requested_at, audit_viewed_at, outreach_email_opened_at, outreach_email_open_count, outreach_email_replied_at').order('score', { ascending: false, nullsLast: true }).limit(8),
        Database.client.from('prospect_events').select('prospect_id, event_type, occurred_at, is_bot, geo_city, geo_country, link_url, prospect:prospects(company_name, domain)').eq('is_bot', false).order('occurred_at', { ascending: false }).limit(10),
        // Klientske správy z portálu (sender_type='client') — admin notifikácia
        Database.client.from('messages').select('id, client_id, content, created_at, is_read, from_email, from_name').eq('sender_type', 'client').order('created_at', { ascending: false }).limit(10),
        // Klienti v portáli (client_users + clients) — kto má prístup
        Database.client.from('client_users').select('user_id, client_id, role, created_at, clients(id, company_name, email, status)').order('created_at', { ascending: false }),
      ]);
      
      // Filter tasks for current user
      const tasks = (tasksResult.data || []).filter(t => 
        t.assigned_to === Auth.teamMember?.id || !t.assigned_to
      );
      
      // Calculate stats
      const stats = this.calculateStats(leads, clients, tasks);
      
      const hotProspects = (hotProspectsResult?.data || []).filter(p => (p.score || 0) > 50);
      const recentEvents = recentEventsResult?.data || [];
      const clientMessages = clientMessagesResult?.data || [];
      const portalClients = portalClientsResult?.data || [];
      // Mapuj client_id → company_name pre rýchle zobrazenie
      const clientsData = (clients || []).reduce((acc, c) => { acc[c.id] = c.company_name; return acc; }, {});
      // Spočítaj správy per client_id (z všetkých messages aj sender_type='team' aj 'client')
      const msgCountByClient = clientMessages.reduce((acc, m) => {
        acc[m.client_id] = (acc[m.client_id] || 0) + 1;
        return acc;
      }, {});
      const lastMsgByClient = clientMessages.reduce((acc, m) => {
        if (!acc[m.client_id] || new Date(m.created_at) > new Date(acc[m.client_id])) {
          acc[m.client_id] = m.created_at;
        }
        return acc;
      }, {});

      // Render
      container.innerHTML = this.template(stats, leads, clients, hotProspects, recentEvents, clientMessages, clientsData, portalClients, msgCountByClient, lastMsgByClient);
      
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
  template(stats, leads, clients, hotProspects = [], recentEvents = [], clientMessages = [], clientsData = {}, portalClients = [], msgCountByClient = {}, lastMsgByClient = {}) {
    const recentLeads = leads
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    const unreadClientMsgs = clientMessages.filter(m => !m.is_read).length;
    const clientMessagesWidget = this._renderClientMessagesWidget(clientMessages, clientsData, unreadClientMsgs);
    const portalClientsWidget = this._renderPortalClientsWidget(portalClients, msgCountByClient, lastMsgByClient);

    const DI = this._dashIcons();
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

        <!-- OUTREACH WIDGETS -->
        <div class="adl-card" style="grid-column:1 / -1;">
          <div class="adl-card-header">
            <div class="adl-card-title" style="display:flex;align-items:center;gap:8px;">${DI.mail(16, 'var(--brand-600)')} Outreach aktivita</div>
            <a href="#outreach" class="adl-btn adl-btn-ghost adl-btn-sm">Otvoriť Outreach ${I.ArrowRight({size:12})}</a>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
            <!-- Hot prospects -->
            <div style="border-right:1px solid var(--border);padding:6px 0;">
              <div style="padding:8px 18px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--ink-mute);font-weight:600;display:flex;align-items:center;gap:6px;">${DI.flame(13, 'var(--brand-600)')} Najteplejší prospecti</div>
              ${hotProspects.length === 0 ? `<div style="padding:16px 18px;color:var(--ink-mute);font-size:13px;">Zatiaľ žiadni horúci prospecti.</div>` : hotProspects.slice(0, 5).map(p => {
                const name = p.company_name || p.domain || '—';
                const badges = [];
                if (p.audit_requested_at) badges.push('<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;background:#FFEDD5;color:#92400E;padding:1px 6px;border-radius:999px;font-weight:600;">' + DI.target(10) + ' audit</span>');
                if (p.outreach_email_replied_at) badges.push('<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;background:#DBEAFE;color:#1E3A8A;padding:1px 6px;border-radius:999px;font-weight:600;">' + DI.reply(10) + ' odpoveď</span>');
                if ((p.outreach_email_open_count || 0) >= 2) badges.push('<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;background:#EDE9FE;color:#5B21B6;padding:1px 6px;border-radius:999px;font-weight:600;">' + DI.eye(10) + ' ×' + p.outreach_email_open_count + '</span>');
                return `
                  <a href="#outreach" style="display:flex;align-items:center;gap:10px;padding:8px 18px;text-decoration:none;color:inherit;border-top:1px solid var(--border);">
                    <div style="width:28px;height:28px;border-radius:7px;background:#FFF7ED;color:#F97316;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${(name[0] || '?').toUpperCase()}</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
                      <div style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap;">${badges.join('')}</div>
                    </div>
                    <div style="font-size:12px;font-weight:700;color:#F97316;">${p.score || 0}</div>
                  </a>
                `;
              }).join('')}
            </div>
            <!-- Recent events -->
            <div style="padding:6px 0;">
              <div style="padding:8px 18px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--ink-mute);font-weight:600;display:flex;align-items:center;gap:6px;">${DI.activity(13, 'var(--ink-mute)')} Nedávna aktivita</div>
              ${recentEvents.length === 0 ? `<div style="padding:16px 18px;color:var(--ink-mute);font-size:13px;">Zatiaľ žiadna aktivita.</div>` : recentEvents.slice(0, 5).map(e => {
                const name = e.prospect?.company_name || e.prospect?.domain || '—';
                const time = (() => {
                  const diff = Date.now() - new Date(e.occurred_at).getTime();
                  const m = Math.floor(diff / 60000);
                  if (m < 1) return 'teraz';
                  if (m < 60) return `${m} min`;
                  const h = Math.floor(m / 60);
                  if (h < 24) return `${h} h`;
                  return `${Math.floor(h / 24)} d`;
                })();
                const icons = {
                  email_open:      { svg: DI.eye(14),        c: '#8B5CF6', bg: '#EDE9FE', label: 'otvoril email' },
                  email_click:     { svg: DI.mouseClick(14), c: '#F97316', bg: '#FFEDD5', label: 'klikol' },
                  audit_requested: { svg: DI.target(14),     c: '#EA580C', bg: '#FED7AA', label: 'požiadal o audit' },
                  email_replied:   { svg: DI.reply(14),      c: '#3B82F6', bg: '#DBEAFE', label: 'odpovedal' },
                };
                const t = icons[e.event_type] || { svg: '•', c: '#6F6758', bg: '#F7F5F1', label: e.event_type };
                return `
                  <a href="#outreach" style="display:flex;align-items:center;gap:10px;padding:8px 18px;text-decoration:none;color:inherit;border-top:1px solid var(--border);">
                    <div style="width:28px;height:28px;border-radius:7px;background:${t.bg};color:${t.c};display:flex;align-items:center;justify-content:center;">${t.svg}</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>${name}</strong> ${t.label}</div>
                      ${e.geo_city || e.geo_country ? `<div style="font-size:11px;color:var(--ink-mute);display:flex;align-items:center;gap:4px;">${DI.mapPin(11)} ${[e.geo_city, e.geo_country].filter(Boolean).join(', ')}</div>` : ''}
                    </div>
                    <div style="font-size:11px;color:var(--ink-mute);font-weight:500;">${time}</div>
                  </a>
                `;
              }).join('')}
            </div>
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

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:24px;" class="adl-dashboard-portal-row">
        ${clientMessagesWidget}
        ${portalClientsWidget}
      </div>
      <style>
        @media (max-width: 1100px) {
          .adl-dashboard-portal-row { grid-template-columns: 1fr !important; }
        }
      </style>
    </div>
    `;
  },

  // Widget: Klienti v portáli — kto má prístup + aktivita
  _renderPortalClientsWidget(portalClients, msgCountByClient, lastMsgByClient) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const formatDate = (d) => {
      if (!d) return 'žiadna';
      const dt = new Date(d);
      const now = new Date();
      const diff = (now - dt) / 1000;
      if (diff < 60) return 'pred chvíľou';
      if (diff < 3600) return 'pred ' + Math.floor(diff / 60) + ' min';
      if (diff < 86400) return 'pred ' + Math.floor(diff / 3600) + ' h';
      if (diff < 86400 * 7) return 'pred ' + Math.floor(diff / 86400) + ' dňami';
      return dt.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
    };

    // Dedupli — viacero client_users môže byť per client (team). Zachová posledný.
    const uniqueByClient = {};
    for (const cu of portalClients) {
      if (!cu.clients) continue;
      const cid = cu.client_id;
      if (!uniqueByClient[cid] || new Date(cu.created_at) > new Date(uniqueByClient[cid].created_at)) {
        uniqueByClient[cid] = cu;
      }
    }
    const items = Object.values(uniqueByClient);
    items.sort((a, b) => {
      // Najnovšia aktivita prv
      const aLast = lastMsgByClient[a.client_id] || a.created_at;
      const bLast = lastMsgByClient[b.client_id] || b.created_at;
      return new Date(bLast) - new Date(aLast);
    });

    const totalCount = items.length;

    return `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border); background:linear-gradient(135deg, rgba(16,185,129,0.05), rgba(20,184,166,0.05));">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #10b981, #14b8a6); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">${totalCount}</div>
          <div>
            <div style="font-size:14px; font-weight:700; color:var(--ink);">Klienti v portáli</div>
            <div style="font-size:11px; color:var(--ink-mute);">${totalCount === 0 ? 'Zatiaľ žiadni registrovaní' : totalCount + ' ' + (totalCount === 1 ? 'klient s prístupom' : 'klientov s prístupom')}</div>
          </div>
        </div>
      </div>
      ${items.length === 0 ? `
        <div style="padding:32px 20px; text-align:center; color:var(--ink-mute); font-size:13px;">
          Klient sa zatiaľ neregistroval do portálu. Po konverzii lead → klient mu pošlete onboarding link.
        </div>
      ` : items.slice(0, 8).map(cu => {
        const c = cu.clients;
        const name = c.company_name || c.email || 'Klient';
        const msgs = msgCountByClient[cu.client_id] || 0;
        const lastActivity = lastMsgByClient[cu.client_id];
        return `
        <a href="#clients?id=${cu.client_id}" style="display:flex; align-items:center; gap:12px; padding:12px 20px; text-decoration:none; color:inherit; border-top:1px solid var(--n-100); transition:background .12s;" onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background='transparent'">
          <div style="width:34px; height:34px; border-radius:99px; background:linear-gradient(135deg, #10b981, #14b8a6); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0;">${(name[0] || '?').toUpperCase()}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</div>
            <div style="font-size:11px; color:var(--ink-mute); margin-top:2px;">
              ${msgs > 0 ? `<span style="color:#7c3aed; font-weight:600;">${msgs} ${msgs === 1 ? 'správa' : msgs < 5 ? 'správy' : 'správ'}</span> · ` : ''}
              posledná aktivita ${formatDate(lastActivity || cu.created_at)}
            </div>
          </div>
          <span style="font-size:10px; padding:2px 8px; border-radius:99px; background:${c.status === 'active' ? '#dcfce7' : '#fef3c7'}; color:${c.status === 'active' ? '#166534' : '#92400e'}; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${esc(c.status || 'pending')}</span>
        </a>
        `;
      }).join('')}
    </div>
    `;
  },

  // Widget: Klientske správy z portálu (sender_type='client')
  _renderClientMessagesWidget(messages, clientsData, unreadCount) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const formatDate = (d) => {
      const dt = new Date(d);
      const now = new Date();
      const diff = (now - dt) / 1000;
      if (diff < 60) return 'teraz';
      if (diff < 3600) return Math.floor(diff / 60) + ' min';
      if (diff < 86400) return Math.floor(diff / 3600) + ' h';
      return dt.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
    };

    return `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border); background:linear-gradient(135deg, rgba(124,58,237,0.04), rgba(236,72,153,0.04));">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #7c3aed, #ec4899); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">${unreadCount}</div>
          <div>
            <div style="font-size:14px; font-weight:700; color:var(--ink);">Klientske správy z portálu</div>
            <div style="font-size:11px; color:var(--ink-mute);">${unreadCount === 0 ? 'Žiadne neprečítané' : unreadCount + ' neprečítaných · ' + messages.length + ' celkom'}</div>
          </div>
        </div>
      </div>
      ${messages.length === 0 ? `
        <div style="padding:32px 20px; text-align:center; color:var(--ink-mute); font-size:13px;">
          Klienti zatiaľ neposlali žiadne správy z portálu.
        </div>
      ` : messages.slice(0, 6).map(m => {
        const companyName = clientsData[m.client_id] || m.from_name || m.from_email || 'Klient';
        const preview = (m.content || '').slice(0, 100) + ((m.content || '').length > 100 ? '…' : '');
        return `
        <a href="#clients?id=${m.client_id}" style="display:flex; align-items:flex-start; gap:12px; padding:12px 20px; text-decoration:none; color:inherit; border-top:1px solid var(--n-100); transition:background .12s; ${!m.is_read ? 'background:rgba(124,58,237,0.04);' : ''}" onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background='${!m.is_read ? 'rgba(124,58,237,0.04)' : 'transparent'}'">
          <div style="width:34px; height:34px; border-radius:99px; background:${m.is_read ? 'var(--n-100)' : 'linear-gradient(135deg, #7c3aed, #ec4899)'}; color:${m.is_read ? 'var(--ink-sub)' : '#fff'}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0;">${(companyName[0] || '?').toUpperCase()}</div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
              <strong style="font-size:13px; font-weight:${m.is_read ? '500' : '700'}; color:var(--ink);">${esc(companyName)}</strong>
              ${!m.is_read ? '<span style="display:inline-block; width:6px; height:6px; border-radius:99px; background:#ec4899;"></span>' : ''}
              <span style="margin-left:auto; font-size:11px; color:var(--ink-mute);">${formatDate(m.created_at)}</span>
            </div>
            <div style="font-size:12px; color:var(--ink-sub); line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(preview)}</div>
          </div>
        </a>
        `;
      }).join('')}
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
