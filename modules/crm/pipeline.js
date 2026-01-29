/**
 * ADLIFY V2 - Pipeline Module
 * Kanban board pre obchodné príležitosti
 */

const PipelineModule = {
    name: 'pipeline',
    title: 'Pipeline',
    icon: '🎯',
    
    stages: [
        { id: 'new', label: 'Nový', color: '#6366f1' },
        { id: 'qualified', label: 'Kvalifikovaný', color: '#8b5cf6' },
        { id: 'proposal', label: 'Ponuka', color: '#f97316' },
        { id: 'negotiation', label: 'Vyjednávanie', color: '#eab308' },
        { id: 'won', label: 'Vyhratý', color: '#22c55e' },
        { id: 'lost', label: 'Prehratý', color: '#ef4444' }
    ],
    
    deals: [],
    draggedDeal: null,
    
    async render(container) {
        container.innerHTML = `
        <div class="pipeline-wrap">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;min-width:250px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="pipeline-search" placeholder="Hľadať deal..." style="border:none;outline:none;flex:1;font-size:14px;">
                    </div>
                    <select id="pipeline-filter" style="padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;cursor:pointer;">
                        <option value="">Všetky zdroje</option>
                        <option value="marketing_miner">Marketing Miner</option>
                        <option value="website">Web</option>
                        <option value="referral">Odporúčanie</option>
                    </select>
                </div>
                <button onclick="PipelineModule.showAddDeal()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nový deal
                </button>
            </div>
            
            <!-- Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
                <div class="card" style="padding:16px;text-align:center;">
                    <div id="stat-total" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                    <div style="font-size:12px;color:#64748b;">Aktívnych</div>
                </div>
                <div class="card" style="padding:16px;text-align:center;">
                    <div id="stat-value" style="font-size:24px;font-weight:700;color:#22c55e;">€0</div>
                    <div style="font-size:12px;color:#64748b;">Hodnota</div>
                </div>
                <div class="card" style="padding:16px;text-align:center;">
                    <div id="stat-won" style="font-size:24px;font-weight:700;color:#0f172a;">0</div>
                    <div style="font-size:12px;color:#64748b;">Vyhratých</div>
                </div>
                <div class="card" style="padding:16px;text-align:center;">
                    <div id="stat-rate" style="font-size:24px;font-weight:700;color:#0f172a;">0%</div>
                    <div style="font-size:12px;color:#64748b;">Win rate</div>
                </div>
            </div>
            
            <!-- Kanban -->
            <div id="kanban" style="display:flex;gap:16px;overflow-x:auto;padding-bottom:16px;"></div>
        </div>
        
        <!-- Modal -->
        <div id="deal-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;padding:20px;">
            <div style="background:white;border-radius:16px;width:100%;max-width:500px;max-height:90vh;overflow:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #e2e8f0;">
                    <h3 id="modal-title" style="font-size:18px;font-weight:600;">Nový deal</h3>
                    <button onclick="PipelineModule.closeModal()" style="width:32px;height:32px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div id="modal-body" style="padding:20px;"></div>
            </div>
        </div>
        `;
        
        await this.loadDeals();
        this.bindEvents();
    },
    
    async loadDeals() {
        try {
            let data = [];
            const { data: deals, error } = await Database.query('deals')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error?.code === '42P01') {
                // Fallback to leads
                const { data: leads } = await Database.query('leads')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                const map = { 'new': 'new', 'analyzing': 'new', 'ready': 'qualified', 'contacted': 'qualified', 'negotiating': 'negotiation', 'converted': 'won', 'lost': 'lost' };
                data = (leads || []).map(l => ({
                    id: l.id,
                    title: l.company_name || l.domain || 'Lead',
                    company_name: l.company_name,
                    domain: l.domain,
                    stage: map[l.status] || 'new',
                    value: l.analysis?.estimated_value || null,
                    probability: l.score || 50,
                    priority: l.score > 70 ? 'high' : l.score > 40 ? 'medium' : 'low',
                    source: l.source,
                    notes: l.notes,
                    created_at: l.created_at
                }));
            } else {
                data = deals || [];
            }
            
            this.deals = data;
            this.renderKanban();
            this.updateStats();
        } catch (e) {
            console.error('Load deals error:', e);
        }
    },
    
    renderKanban() {
        const kanban = document.getElementById('kanban');
        
        kanban.innerHTML = this.stages.map(stage => {
            const stageDeals = this.deals.filter(d => d.stage === stage.id);
            const stageValue = stageDeals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);
            
            return `
            <div style="min-width:280px;max-width:280px;background:#f8fafc;border-radius:12px;display:flex;flex-direction:column;">
                <div style="padding:16px;background:white;border-top:3px solid ${stage.color};border-radius:12px 12px 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="width:8px;height:8px;border-radius:50%;background:${stage.color};"></span>
                            <span style="font-weight:600;font-size:14px;">${stage.label}</span>
                            <span style="background:#e2e8f0;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#475569;">${stageDeals.length}</span>
                        </div>
                        <span style="font-size:13px;color:#64748b;font-weight:600;">${this.formatCurrency(stageValue)}</span>
                    </div>
                </div>
                <div class="kanban-column" data-stage="${stage.id}" style="flex:1;padding:12px;min-height:200px;overflow-y:auto;">
                    ${stageDeals.length === 0 ? `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:#94a3b8;text-align:center;">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:8px;opacity:0.5;"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                            <span style="font-size:13px;">Žiadne dealy</span>
                        </div>
                    ` : stageDeals.map(d => this.renderDealCard(d)).join('')}
                </div>
            </div>
            `;
        }).join('');
        
        // Add drag events
        document.querySelectorAll('.kanban-column').forEach(col => {
            col.addEventListener('dragover', e => {
                e.preventDefault();
                col.style.background = 'rgba(249,115,22,0.1)';
            });
            col.addEventListener('dragleave', () => {
                col.style.background = '';
            });
            col.addEventListener('drop', e => {
                e.preventDefault();
                col.style.background = '';
                const stage = col.dataset.stage;
                if (this.draggedDeal && this.draggedDeal.stage !== stage) {
                    this.moveDeal(this.draggedDeal.id, stage);
                }
            });
        });
    },
    
    renderDealCard(deal) {
        const priority = deal.priority || 'medium';
        const priorityColors = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
        const priorityText = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
        
        return `
        <div class="deal-card" draggable="true" data-id="${deal.id}"
             style="background:white;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);cursor:grab;border:1px solid transparent;transition:all 0.15s;"
             onmouseenter="this.style.borderColor='#f97316'"
             onmouseleave="this.style.borderColor='transparent'"
             onclick="PipelineModule.showDealDetail('${deal.id}')">
            <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <div style="font-weight:600;font-size:14px;color:#0f172a;line-height:1.3;">${this.escapeHtml(deal.title)}</div>
                ${deal.value ? `<div style="font-weight:700;font-size:14px;color:#22c55e;white-space:nowrap;">${this.formatCurrency(deal.value)}</div>` : ''}
            </div>
            ${deal.company_name || deal.domain ? `<div style="font-size:13px;color:#64748b;margin-bottom:8px;">${this.escapeHtml(deal.company_name || deal.domain)}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;color:#94a3b8;">${deal.source || '—'}</span>
                <span style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:${priorityColors[priority]};color:${priorityText[priority]};">${priority === 'high' ? 'Vysoká' : priority === 'medium' ? 'Stredná' : 'Nízka'}</span>
            </div>
        </div>
        `;
    },
    
    updateStats() {
        const active = this.deals.filter(d => !['won', 'lost'].includes(d.stage));
        const won = this.deals.filter(d => d.stage === 'won');
        const lost = this.deals.filter(d => d.stage === 'lost');
        const totalClosed = won.length + lost.length;
        
        document.getElementById('stat-total').textContent = active.length;
        document.getElementById('stat-value').textContent = this.formatCurrency(active.reduce((s, d) => s + (parseFloat(d.value) || 0), 0));
        document.getElementById('stat-won').textContent = won.length;
        document.getElementById('stat-rate').textContent = totalClosed > 0 ? Math.round((won.length / totalClosed) * 100) + '%' : '0%';
    },
    
    async moveDeal(dealId, newStage) {
        const deal = this.deals.find(d => d.id === dealId);
        if (!deal) return;
        
        const oldStage = deal.stage;
        deal.stage = newStage;
        this.renderKanban();
        this.updateStats();
        
        try {
            const { error } = await Database.query('deals')
                .update({ stage: newStage, stage_changed_at: new Date().toISOString() })
                .eq('id', dealId);
            
            if (error?.code === '42P01') {
                // Fallback to leads
                const map = { 'new': 'new', 'qualified': 'contacted', 'proposal': 'contacted', 'negotiation': 'negotiating', 'won': 'converted', 'lost': 'lost' };
                await Database.query('leads')
                    .update({ status: map[newStage] || 'new' })
                    .eq('id', dealId);
            }
            
            Utils.toast(`Deal presunutý do "${this.stages.find(s => s.id === newStage)?.label}"`, 'success');
        } catch (e) {
            deal.stage = oldStage;
            this.renderKanban();
            this.updateStats();
            Utils.toast('Chyba pri presúvaní', 'error');
        }
    },
    
    showAddDeal() {
        document.getElementById('modal-title').textContent = 'Nový deal';
        document.getElementById('modal-body').innerHTML = this.getDealForm();
        document.getElementById('deal-modal').style.display = 'flex';
    },
    
    showDealDetail(dealId) {
        const deal = this.deals.find(d => d.id === dealId);
        if (!deal) return;
        
        document.getElementById('modal-title').textContent = deal.title;
        document.getElementById('modal-body').innerHTML = this.getDealForm(deal);
        document.getElementById('deal-modal').style.display = 'flex';
    },
    
    closeModal() {
        document.getElementById('deal-modal').style.display = 'none';
    },
    
    getDealForm(deal = {}) {
        return `
        <form onsubmit="PipelineModule.saveDeal(event, '${deal.id || ''}')" style="display:flex;flex-direction:column;gap:16px;">
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Názov *</label>
                <input type="text" name="title" value="${this.escapeHtml(deal.title || '')}" required style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Hodnota (€)</label>
                    <input type="number" name="value" value="${deal.value || ''}" step="0.01" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Fáza</label>
                    <select name="stage" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                        ${this.stages.map(s => `<option value="${s.id}" ${deal.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Firma</label>
                    <input type="text" name="company_name" value="${this.escapeHtml(deal.company_name || '')}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Priorita</label>
                    <select name="priority" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                        <option value="low" ${deal.priority === 'low' ? 'selected' : ''}>Nízka</option>
                        <option value="medium" ${deal.priority === 'medium' ? 'selected' : ''}>Stredná</option>
                        <option value="high" ${deal.priority === 'high' ? 'selected' : ''}>Vysoká</option>
                    </select>
                </div>
            </div>
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Poznámky</label>
                <textarea name="notes" rows="3" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:vertical;">${this.escapeHtml(deal.notes || '')}</textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:12px;padding-top:16px;border-top:1px solid #e2e8f0;">
                <button type="button" onclick="PipelineModule.closeModal()" style="padding:10px 20px;background:#f1f5f9;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Zrušiť</button>
                <button type="submit" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">${deal.id ? 'Uložiť' : 'Vytvoriť'}</button>
            </div>
        </form>
        `;
    },
    
    async saveDeal(event, dealId) {
        event.preventDefault();
        const form = event.target;
        const data = {
            title: form.title.value,
            value: form.value.value ? parseFloat(form.value.value) : null,
            stage: form.stage.value,
            company_name: form.company_name.value,
            priority: form.priority.value,
            notes: form.notes.value,
            updated_at: new Date().toISOString()
        };
        
        try {
            if (dealId) {
                await Database.query('deals').update(data).eq('id', dealId);
                Utils.toast('Deal aktualizovaný', 'success');
            } else {
                data.created_at = new Date().toISOString();
                data.org_id = '00000000-0000-0000-0000-000000000001';
                await Database.query('deals').insert(data);
                Utils.toast('Deal vytvorený', 'success');
            }
            
            this.closeModal();
            await this.loadDeals();
        } catch (e) {
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    bindEvents() {
        // Search
        document.getElementById('pipeline-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.deal-card').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        
        // Drag
        document.addEventListener('dragstart', e => {
            if (e.target.classList?.contains('deal-card')) {
                this.draggedDeal = this.deals.find(d => d.id === e.target.dataset.id);
                e.target.style.opacity = '0.5';
            }
        });
        
        document.addEventListener('dragend', e => {
            if (e.target.classList?.contains('deal-card')) {
                e.target.style.opacity = '1';
                this.draggedDeal = null;
            }
        });
        
        // Close modal on ESC
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeModal();
        });
        
        // Close modal on overlay click
        document.getElementById('deal-modal')?.addEventListener('click', e => {
            if (e.target.id === 'deal-modal') this.closeModal();
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

window.PipelineModule = PipelineModule;
