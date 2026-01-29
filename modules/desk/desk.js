/**
 * ADLIFY V2 - Desk Module
 * Dashboard zameraný na výnimky a akcie
 */

const DeskModule = {
    name: 'desk',
    title: 'Desk',
    icon: '📊',
    
    async render(container) {
        const now = new Date();
        const greeting = now.getHours() < 12 ? 'Dobré ráno' : now.getHours() < 18 ? 'Dobrý deň' : 'Dobrý večer';
        const userName = Auth.user?.full_name?.split(' ')[0] || 'tam';
        
        container.innerHTML = `
        <div class="desk" style="max-width:1200px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <h1 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:4px;">${greeting}, ${userName}!</h1>
                <p style="font-size:14px;color:#64748b;">${this.formatDate(now)}</p>
            </div>
            
            <!-- Alerts -->
            <div class="card" style="padding:20px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;">
                        <span style="width:28px;height:28px;border-radius:8px;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;font-weight:700;">!</span>
                        Vyžaduje pozornosť
                    </h2>
                    <span id="alerts-count" style="background:#f1f5f9;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:600;color:#64748b;">0</span>
                </div>
                <div id="alerts-list"></div>
            </div>
            
            <!-- AI Drafts -->
            <div class="card" style="padding:20px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;">
                        <span style="width:28px;height:28px;border-radius:8px;background:#fffbeb;color:#f59e0b;display:flex;align-items:center;justify-content:center;">✨</span>
                        Na review
                    </h2>
                    <span id="drafts-count" style="background:#f1f5f9;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:600;color:#64748b;">0</span>
                </div>
                <div id="drafts-list"></div>
            </div>
            
            <!-- Pipeline -->
            <div class="card" style="padding:20px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;">
                        <span style="width:28px;height:28px;border-radius:8px;background:#eff6ff;color:#3b82f6;display:flex;align-items:center;justify-content:center;">📈</span>
                        Pipeline
                    </h2>
                    <a href="#pipeline" style="font-size:13px;color:#f97316;text-decoration:none;font-weight:500;">Otvoriť →</a>
                </div>
                <div id="pipeline-bar" style="display:flex;height:48px;border-radius:8px;overflow:hidden;background:#f1f5f9;">
                    <div style="display:flex;align-items:center;justify-content:center;width:100%;color:#64748b;font-size:13px;">Načítavam...</div>
                </div>
            </div>
            
            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
                <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;border-radius:12px;background:#f0fdf4;color:#22c55e;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;">€</div>
                    <div>
                        <div id="stat-revenue" style="font-size:24px;font-weight:700;color:#0f172a;">€0</div>
                        <div style="font-size:13px;color:#64748b;">MRR</div>
                    </div>
                </div>
                <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;border-radius:12px;background:#eff6ff;color:#3b82f6;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;">+</div>
                    <div>
                        <div id="stat-new" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                        <div style="font-size:13px;color:#64748b;">Nových tento mesiac</div>
                    </div>
                </div>
                <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;border-radius:12px;background:#fff7ed;color:#f97316;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;">↗</div>
                    <div>
                        <div id="stat-active" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                        <div style="font-size:13px;color:#64748b;">Aktívnych klientov</div>
                    </div>
                </div>
                <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;">
                    <div style="width:48px;height:48px;border-radius:12px;background:#faf5ff;color:#a855f7;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;">💬</div>
                    <div>
                        <div id="stat-unread" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                        <div style="font-size:13px;color:#64748b;">Neprečítaných</div>
                    </div>
                </div>
            </div>
            
            <!-- Activity -->
            <div class="card" style="padding:20px;">
                <h2 style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;margin-bottom:16px;">
                    <span style="width:28px;height:28px;border-radius:8px;background:#f8fafc;color:#64748b;display:flex;align-items:center;justify-content:center;">🕐</span>
                    Posledná aktivita
                </h2>
                <div id="activity-list"></div>
            </div>
        </div>
        `;
        
        await this.loadData();
    },
    
    async loadData() {
        await Promise.all([
            this.loadPipeline(),
            this.loadAlerts(),
            this.loadStats(),
            this.loadActivity()
        ]);
    },
    
    async loadPipeline() {
        const stages = [
            { id: 'new', label: 'Nový', color: '#6366f1' },
            { id: 'qualified', label: 'Kvalif.', color: '#8b5cf6' },
            { id: 'proposal', label: 'Ponuka', color: '#f97316' },
            { id: 'negotiation', label: 'Vyjedn.', color: '#eab308' },
        ];
        
        try {
            let data = [];
            const { data: deals, error } = await Database.query('deals')
                .select('stage')
                .not('stage', 'in', '("won","lost")');
            
            if (error?.code === '42P01') {
                // Fallback to leads
                const { data: leads } = await Database.query('leads')
                    .select('status')
                    .not('status', 'in', '("converted","lost")');
                
                const map = { 'new': 'new', 'analyzing': 'new', 'ready': 'qualified', 'contacted': 'qualified', 'negotiating': 'negotiation' };
                data = (leads || []).map(l => ({ stage: map[l.status] || 'new' }));
            } else {
                data = deals || [];
            }
            
            const counts = {};
            stages.forEach(s => counts[s.id] = 0);
            data.forEach(d => { if (counts[d.stage] !== undefined) counts[d.stage]++; });
            
            const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
            
            document.getElementById('pipeline-bar').innerHTML = stages.map(s => {
                const count = counts[s.id];
                const width = Math.max((count / total) * 100, 15);
                return `
                    <div onclick="Router.navigate('pipeline')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 16px;background:${s.color};color:white;width:${width}%;min-width:80px;cursor:pointer;">
                        <div style="font-size:18px;font-weight:700;">${count}</div>
                        <div style="font-size:11px;opacity:0.9;">${s.label}</div>
                    </div>
                `;
            }).join('');
            
            // Update badge
            const badge = document.getElementById('badge-crm');
            if (badge && total > 0) {
                badge.textContent = total;
                badge.style.display = '';
            }
        } catch (e) {
            console.error('Pipeline error:', e);
        }
    },
    
    async loadAlerts() {
        const list = document.getElementById('alerts-list');
        const count = document.getElementById('alerts-count');
        const alerts = [];
        
        try {
            // Overdue invoices
            const { data: invoices } = await Database.query('invoices')
                .select('*')
                .eq('status', 'sent')
                .lt('due_date', new Date().toISOString().split('T')[0]);
            
            (invoices || []).forEach(inv => {
                alerts.push({
                    icon: '💰',
                    title: `Faktúra ${inv.invoice_number} po splatnosti`,
                    desc: this.formatCurrency(inv.total),
                    type: 'critical'
                });
            });
        } catch (e) {}
        
        count.textContent = alerts.length;
        
        if (!alerts.length) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:14px;">Všetko je v poriadku 👍</div>';
        } else {
            list.innerHTML = alerts.map(a => `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:${a.type === 'critical' ? '#fef2f2' : '#fffbeb'};border-radius:8px;margin-bottom:8px;cursor:pointer;">
                    <div style="width:36px;height:36px;border-radius:8px;background:${a.type === 'critical' ? '#ef4444' : '#f59e0b'};color:white;display:flex;align-items:center;justify-content:center;font-size:16px;">${a.icon}</div>
                    <div style="flex:1;">
                        <div style="font-size:14px;font-weight:600;color:#0f172a;">${a.title}</div>
                        <div style="font-size:13px;color:#64748b;">${a.desc}</div>
                    </div>
                </div>
            `).join('');
            
            const badge = document.getElementById('badge-desk');
            if (badge) {
                badge.textContent = alerts.length;
                badge.style.display = '';
            }
        }
    },
    
    async loadStats() {
        try {
            // Try engagements first, fallback to clients
            let activeData = [];
            const { data: engagements, error } = await Database.query('engagements')
                .select('monthly_fee, created_at')
                .eq('status', 'active');
            
            if (error?.code === '42P01') {
                const { data: clients } = await Database.query('clients')
                    .select('monthly_fee, created_at')
                    .eq('status', 'active');
                activeData = clients || [];
            } else {
                activeData = engagements || [];
            }
            
            const mrr = activeData.reduce((sum, e) => sum + (parseFloat(e.monthly_fee) || 0), 0);
            document.getElementById('stat-revenue').textContent = this.formatCurrency(mrr);
            document.getElementById('stat-active').textContent = activeData.length;
            
            // New this month
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const newCount = activeData.filter(e => new Date(e.created_at) >= startOfMonth).length;
            document.getElementById('stat-new').textContent = newCount;
            
            // Unread
            try {
                const { data: convos } = await Database.query('conversations')
                    .select('unread_count')
                    .gt('unread_count', 0);
                const unread = (convos || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
                document.getElementById('stat-unread').textContent = unread;
                
                const badge = document.getElementById('badge-chat');
                if (badge && unread > 0) {
                    badge.textContent = unread;
                    badge.style.display = '';
                }
            } catch (e) {
                document.getElementById('stat-unread').textContent = '0';
            }
        } catch (e) {
            console.error('Stats error:', e);
        }
    },
    
    async loadActivity() {
        const list = document.getElementById('activity-list');
        
        try {
            const { data: activities } = await Database.query('activities')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(8);
            
            if (!activities?.length) {
                list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:14px;">Žiadna aktivita</div>';
                return;
            }
            
            list.innerHTML = activities.map(a => `
                <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>
                    <div style="flex:1;font-size:14px;color:#475569;">${a.title}</div>
                    <div style="font-size:12px;color:#94a3b8;">${this.timeAgo(a.created_at)}</div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:14px;">Žiadna aktivita</div>';
        }
    },
    
    formatDate(d) {
        return d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    },
    
    formatCurrency(n) {
        return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0);
    },
    
    timeAgo(date) {
        const s = Math.floor((new Date() - new Date(date)) / 1000);
        if (s < 60) return 'práve teraz';
        if (s < 3600) return `pred ${Math.floor(s / 60)} min`;
        if (s < 86400) return `pred ${Math.floor(s / 3600)} hod`;
        return `pred ${Math.floor(s / 86400)} dňami`;
    }
};

window.DeskModule = DeskModule;
