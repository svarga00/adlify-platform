/**
 * ADLIFY V2 - Engagements Module
 * Aktívne spolupráce s klientmi
 */

const EngagementsModule = {
    name: 'engagements',
    title: 'Klienti',
    icon: '🤝',
    
    engagements: [],
    
    async render(container) {
        container.innerHTML = `
        <div style="max-width:1400px;margin:0 auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;min-width:250px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="engagements-search" placeholder="Hľadať klienta..." style="border:none;outline:none;flex:1;font-size:14px;">
                    </div>
                    <select id="engagements-status" onchange="EngagementsModule.filterByStatus(this.value)" style="padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                        <option value="">Všetky stavy</option>
                        <option value="onboarding">Onboarding</option>
                        <option value="active">Aktívni</option>
                        <option value="paused">Pozastavení</option>
                        <option value="cancelled">Ukončení</option>
                    </select>
                </div>
                <button onclick="EngagementsModule.showAddEngagement()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nová spolupráca
                </button>
            </div>
            
            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;">
                <div class="card" style="padding:16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;color:#22c55e;display:flex;align-items:center;justify-content:center;font-size:18px;">✓</div>
                        <div>
                            <div id="stat-active" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                            <div style="font-size:12px;color:#64748b;">Aktívnych</div>
                        </div>
                    </div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:#eff6ff;color:#3b82f6;display:flex;align-items:center;justify-content:center;font-size:18px;">📋</div>
                        <div>
                            <div id="stat-onboarding" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                            <div style="font-size:12px;color:#64748b;">Onboarding</div>
                        </div>
                    </div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;color:#22c55e;display:flex;align-items:center;justify-content:center;font-size:18px;">€</div>
                        <div>
                            <div id="stat-mrr" style="font-size:24px;font-weight:700;color:#22c55e;">€0</div>
                            <div style="font-size:12px;color:#64748b;">MRR</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="engagements-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;"></div>
        </div>
        
        <div id="engagement-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;padding:20px;">
            <div style="background:white;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #e2e8f0;">
                    <h3 id="engagement-modal-title" style="font-size:18px;font-weight:600;">Detail klienta</h3>
                    <button onclick="EngagementsModule.closeModal()" style="width:32px;height:32px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div id="engagement-modal-body" style="padding:20px;"></div>
            </div>
        </div>
        `;
        
        await this.loadEngagements();
        this.bindEvents();
    },
    
    async loadEngagements() {
        const grid = document.getElementById('engagements-grid');
        
        try {
            // Try engagements first
            let { data, error } = await Database.query('engagements')
                .select('*, companies(name, domain)')
                .order('created_at', { ascending: false });
            
            if (error?.code === '42P01') {
                // Fallback to clients
                const { data: clients } = await Database.query('clients')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                data = (clients || []).map(c => ({
                    id: c.id,
                    name: c.company_name + ' - Spolupráca',
                    company_name: c.company_name,
                    domain: c.website,
                    package: c.package,
                    monthly_fee: c.monthly_fee,
                    status: c.status === 'trial' ? 'onboarding' : c.status,
                    start_date: c.contract_start,
                    end_date: c.contract_end,
                    billing_day: c.billing_day,
                    assigned_to: c.assigned_to,
                    created_at: c.created_at
                }));
            } else {
                // Add company name to engagements
                data = (data || []).map(e => ({
                    ...e,
                    company_name: e.companies?.name,
                    domain: e.companies?.domain
                }));
            }
            
            this.engagements = data || [];
            this.renderGrid();
            this.updateStats();
        } catch (e) {
            console.error('Load engagements error:', e);
            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;">Chyba pri načítaní</div>';
        }
    },
    
    renderGrid(filter = null) {
        const grid = document.getElementById('engagements-grid');
        let items = this.engagements;
        
        if (filter) {
            items = items.filter(e => e.status === filter);
        }
        
        if (!items.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#64748b;">Žiadni klienti</div>';
            return;
        }
        
        const statusColors = {
            onboarding: { bg: '#eff6ff', color: '#3b82f6', label: 'Onboarding' },
            active: { bg: '#f0fdf4', color: '#22c55e', label: 'Aktívny' },
            paused: { bg: '#fffbeb', color: '#f59e0b', label: 'Pozastavený' },
            cancelled: { bg: '#fef2f2', color: '#ef4444', label: 'Ukončený' }
        };
        
        const packageLabels = {
            starter: 'Starter',
            growth: 'Growth',
            professional: 'Professional',
            enterprise: 'Enterprise',
            custom: 'Custom'
        };
        
        grid.innerHTML = items.map(e => {
            const status = statusColors[e.status] || statusColors.active;
            const initial = (e.company_name || e.name || 'K')[0].toUpperCase();
            
            return `
            <div class="card" style="padding:0;overflow:hidden;cursor:pointer;transition:all 0.15s;" onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseleave="this.style.boxShadow=''" onclick="EngagementsModule.showEngagementDetail('${e.id}')">
                <div style="padding:20px;">
                    <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;">
                        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#f97316,#ec4899);color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;">${initial}</div>
                        <div style="flex:1;min-width:0;">
                            <h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:4px;">${this.escapeHtml(e.company_name || e.name)}</h3>
                            <span style="padding:3px 8px;background:${status.bg};color:${status.color};border-radius:4px;font-size:12px;font-weight:500;">${status.label}</span>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:18px;font-weight:700;color:#22c55e;">${this.formatCurrency(e.monthly_fee)}</div>
                            <div style="font-size:11px;color:#94a3b8;">/ mesiac</div>
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:16px;font-size:13px;color:#64748b;">
                        <div>
                            <span style="color:#94a3b8;">Balík:</span> ${packageLabels[e.package] || e.package || '—'}
                        </div>
                        <div>
                            <span style="color:#94a3b8;">Od:</span> ${e.start_date ? new Date(e.start_date).toLocaleDateString('sk-SK') : '—'}
                        </div>
                    </div>
                </div>
                
                <div style="display:flex;border-top:1px solid #f1f5f9;">
                    <button onclick="event.stopPropagation();Router.navigate('chat?engagement=${e.id}')" style="flex:1;padding:12px;background:none;border:none;font-size:13px;color:#3b82f6;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        Chat
                    </button>
                    <button onclick="event.stopPropagation();Router.navigate('campaigns?engagement=${e.id}')" style="flex:1;padding:12px;background:none;border:none;border-left:1px solid #f1f5f9;font-size:13px;color:#f97316;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                        Kampane
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },
    
    updateStats() {
        const active = this.engagements.filter(e => e.status === 'active').length;
        const onboarding = this.engagements.filter(e => e.status === 'onboarding').length;
        const mrr = this.engagements
            .filter(e => e.status === 'active')
            .reduce((sum, e) => sum + (parseFloat(e.monthly_fee) || 0), 0);
        
        document.getElementById('stat-active').textContent = active;
        document.getElementById('stat-onboarding').textContent = onboarding;
        document.getElementById('stat-mrr').textContent = this.formatCurrency(mrr);
    },
    
    filterByStatus(status) {
        this.renderGrid(status || null);
    },
    
    showAddEngagement() {
        Utils.toast('Nová spolupráca - použite Pipeline pre konverziu dealov', 'info');
    },
    
    showEngagementDetail(id) {
        const engagement = this.engagements.find(e => e.id === id);
        if (!engagement) return;
        
        document.getElementById('engagement-modal-title').textContent = engagement.company_name || engagement.name;
        document.getElementById('engagement-modal-body').innerHTML = this.getEngagementDetail(engagement);
        document.getElementById('engagement-modal').style.display = 'flex';
    },
    
    closeModal() {
        document.getElementById('engagement-modal').style.display = 'none';
    },
    
    getEngagementDetail(e) {
        const statusColors = {
            onboarding: { bg: '#eff6ff', color: '#3b82f6', label: 'Onboarding' },
            active: { bg: '#f0fdf4', color: '#22c55e', label: 'Aktívny' },
            paused: { bg: '#fffbeb', color: '#f59e0b', label: 'Pozastavený' },
            cancelled: { bg: '#fef2f2', color: '#ef4444', label: 'Ukončený' }
        };
        const status = statusColors[e.status] || statusColors.active;
        
        return `
        <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
                <div>
                    <span style="padding:4px 10px;background:${status.bg};color:${status.color};border-radius:6px;font-size:13px;font-weight:500;">${status.label}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:28px;font-weight:700;color:#22c55e;">${this.formatCurrency(e.monthly_fee)}</div>
                    <div style="font-size:13px;color:#64748b;">mesačne</div>
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
                <div class="card" style="padding:16px;">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Balík</div>
                    <div style="font-size:16px;font-weight:600;color:#0f172a;">${e.package || '—'}</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Začiatok</div>
                    <div style="font-size:16px;font-weight:600;color:#0f172a;">${e.start_date ? new Date(e.start_date).toLocaleDateString('sk-SK') : '—'}</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Deň fakturácie</div>
                    <div style="font-size:16px;font-weight:600;color:#0f172a;">${e.billing_day || 1}. deň</div>
                </div>
                <div class="card" style="padding:16px;">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Platformy</div>
                    <div style="font-size:16px;font-weight:600;color:#0f172a;">${(e.platforms || []).join(', ') || '—'}</div>
                </div>
            </div>
            
            <div style="display:flex;gap:12px;">
                <button onclick="Router.navigate('chat?engagement=${e.id}');EngagementsModule.closeModal();" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Chat</button>
                <button onclick="Router.navigate('campaigns?engagement=${e.id}');EngagementsModule.closeModal();" style="flex:1;padding:12px;background:#f97316;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Kampane</button>
            </div>
            
            <div style="margin-top:20px;padding-top:20px;border-top:1px solid #e2e8f0;">
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:8px;">Zmeniť stav</label>
                <select onchange="EngagementsModule.changeStatus('${e.id}', this.value)" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                    <option value="onboarding" ${e.status === 'onboarding' ? 'selected' : ''}>Onboarding</option>
                    <option value="active" ${e.status === 'active' ? 'selected' : ''}>Aktívny</option>
                    <option value="paused" ${e.status === 'paused' ? 'selected' : ''}>Pozastavený</option>
                    <option value="cancelled" ${e.status === 'cancelled' ? 'selected' : ''}>Ukončený</option>
                </select>
            </div>
        </div>
        `;
    },
    
    async changeStatus(id, status) {
        try {
            await Database.query('engagements')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id);
            
            Utils.toast('Stav aktualizovaný', 'success');
            this.closeModal();
            await this.loadEngagements();
        } catch (e) {
            // Try clients table
            try {
                const clientStatus = status === 'onboarding' ? 'trial' : status;
                await Database.query('clients')
                    .update({ status: clientStatus, updated_at: new Date().toISOString() })
                    .eq('id', id);
                
                Utils.toast('Stav aktualizovaný', 'success');
                this.closeModal();
                await this.loadEngagements();
            } catch (e2) {
                Utils.toast('Chyba pri aktualizácii', 'error');
            }
        }
    },
    
    bindEvents() {
        document.getElementById('engagements-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#engagements-grid > div').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeModal();
        });
        
        document.getElementById('engagement-modal')?.addEventListener('click', e => {
            if (e.target.id === 'engagement-modal') this.closeModal();
        });
    },
    
    formatCurrency(n) {
        return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n || 0);
    },
    
    escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};

window.EngagementsModule = EngagementsModule;
