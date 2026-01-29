/**
 * ADLIFY V2 - Companies Module
 * Správa firiem
 */

const CompaniesModule = {
    name: 'companies',
    title: 'Firmy',
    icon: '🏢',
    
    companies: [],
    
    async render(container) {
        container.innerHTML = `
        <div style="max-width:1400px;margin:0 auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;min-width:300px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="companies-search" placeholder="Hľadať firmu..." style="border:none;outline:none;flex:1;font-size:14px;">
                </div>
                <button onclick="CompaniesModule.showAddCompany()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nová firma
                </button>
            </div>
            
            <div id="companies-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;"></div>
        </div>
        
        <div id="company-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;padding:20px;">
            <div style="background:white;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #e2e8f0;">
                    <h3 id="company-modal-title" style="font-size:18px;font-weight:600;">Nová firma</h3>
                    <button onclick="CompaniesModule.closeModal()" style="width:32px;height:32px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div id="company-modal-body" style="padding:20px;"></div>
            </div>
        </div>
        `;
        
        await this.loadCompanies();
        this.bindEvents();
    },
    
    async loadCompanies() {
        const grid = document.getElementById('companies-grid');
        
        try {
            // Try companies table first
            let { data, error } = await Database.query('companies')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error?.code === '42P01') {
                // Fallback to clients
                const { data: clients } = await Database.query('clients')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                data = (clients || []).map(c => ({
                    id: c.id,
                    name: c.company_name,
                    domain: c.website,
                    ico: c.ico,
                    dic: c.dic,
                    ic_dph: c.ic_dph,
                    street: c.street,
                    city: c.city,
                    zip: c.zip,
                    country: c.country,
                    industry: c.industry,
                    notes: c.notes,
                    tags: c.tags,
                    created_at: c.created_at
                }));
            }
            
            this.companies = data || [];
            this.renderGrid();
        } catch (e) {
            console.error('Load companies error:', e);
            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;">Chyba pri načítaní firiem</div>';
        }
    },
    
    renderGrid() {
        const grid = document.getElementById('companies-grid');
        
        if (!this.companies.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:#64748b;">Žiadne firmy</div>';
            return;
        }
        
        grid.innerHTML = this.companies.map(c => {
            const initial = (c.name || 'F')[0].toUpperCase();
            
            return `
            <div class="card" style="padding:20px;cursor:pointer;transition:all 0.15s;" onmouseenter="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseleave="this.style.boxShadow=''" onclick="CompaniesModule.showCompanyDetail('${c.id}')">
                <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;">
                    <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;">${initial}</div>
                    <div style="flex:1;min-width:0;">
                        <h3 style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(c.name)}</h3>
                        ${c.domain ? `<a href="https://${c.domain}" target="_blank" onclick="event.stopPropagation()" style="font-size:13px;color:#3b82f6;text-decoration:none;">${c.domain}</a>` : '<span style="font-size:13px;color:#94a3b8;">Bez domény</span>'}
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div>
                        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:2px;">IČO</div>
                        <div style="font-size:14px;color:#475569;">${c.ico || '—'}</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:2px;">Odvetvie</div>
                        <div style="font-size:14px;color:#475569;">${c.industry || '—'}</div>
                    </div>
                </div>
                
                <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #f1f5f9;">
                    <div style="font-size:12px;color:#94a3b8;">${c.city || 'Bez mesta'}</div>
                    <div style="display:flex;gap:4px;">
                        ${(c.tags || []).slice(0, 2).map(t => `<span style="padding:2px 8px;background:#dbeafe;color:#2563eb;border-radius:4px;font-size:11px;">${t}</span>`).join('')}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },
    
    showAddCompany() {
        document.getElementById('company-modal-title').textContent = 'Nová firma';
        document.getElementById('company-modal-body').innerHTML = this.getCompanyForm();
        document.getElementById('company-modal').style.display = 'flex';
    },
    
    showCompanyDetail(id) {
        const company = this.companies.find(c => c.id === id);
        if (!company) return;
        
        document.getElementById('company-modal-title').textContent = company.name;
        document.getElementById('company-modal-body').innerHTML = this.getCompanyForm(company);
        document.getElementById('company-modal').style.display = 'flex';
    },
    
    closeModal() {
        document.getElementById('company-modal').style.display = 'none';
    },
    
    getCompanyForm(company = {}) {
        return `
        <form onsubmit="CompaniesModule.saveCompany(event, '${company.id || ''}')" style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Názov firmy *</label>
                    <input type="text" name="name" value="${this.escapeHtml(company.name || '')}" required style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Doména</label>
                    <input type="text" name="domain" value="${company.domain || ''}" placeholder="example.sk" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">IČO</label>
                    <input type="text" name="ico" value="${company.ico || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">DIČ</label>
                    <input type="text" name="dic" value="${company.dic || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">IČ DPH</label>
                    <input type="text" name="ic_dph" value="${company.ic_dph || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
            </div>
            
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Ulica</label>
                <input type="text" name="street" value="${this.escapeHtml(company.street || '')}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Mesto</label>
                    <input type="text" name="city" value="${this.escapeHtml(company.city || '')}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">PSČ</label>
                    <input type="text" name="zip" value="${company.zip || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Krajina</label>
                    <select name="country" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                        <option value="SK" ${company.country === 'SK' ? 'selected' : ''}>Slovensko</option>
                        <option value="CZ" ${company.country === 'CZ' ? 'selected' : ''}>Česko</option>
                        <option value="HU" ${company.country === 'HU' ? 'selected' : ''}>Maďarsko</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Odvetvie</label>
                <input type="text" name="industry" value="${this.escapeHtml(company.industry || '')}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Poznámky</label>
                <textarea name="notes" rows="3" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:vertical;">${this.escapeHtml(company.notes || '')}</textarea>
            </div>
            
            <div style="display:flex;justify-content:flex-end;gap:12px;padding-top:16px;border-top:1px solid #e2e8f0;">
                ${company.id ? `<button type="button" onclick="CompaniesModule.deleteCompany('${company.id}')" style="padding:10px 20px;background:#fef2f2;color:#ef4444;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-right:auto;">Zmazať</button>` : ''}
                <button type="button" onclick="CompaniesModule.closeModal()" style="padding:10px 20px;background:#f1f5f9;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Zrušiť</button>
                <button type="submit" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">${company.id ? 'Uložiť' : 'Vytvoriť'}</button>
            </div>
        </form>
        `;
    },
    
    async saveCompany(event, companyId) {
        event.preventDefault();
        const form = event.target;
        const data = {
            name: form.name.value,
            domain: form.domain.value,
            ico: form.ico.value,
            dic: form.dic.value,
            ic_dph: form.ic_dph.value,
            street: form.street.value,
            city: form.city.value,
            zip: form.zip.value,
            country: form.country.value,
            industry: form.industry.value,
            notes: form.notes.value,
            updated_at: new Date().toISOString()
        };
        
        try {
            if (companyId) {
                await Database.query('companies').update(data).eq('id', companyId);
                Utils.toast('Firma aktualizovaná', 'success');
            } else {
                data.created_at = new Date().toISOString();
                data.org_id = '00000000-0000-0000-0000-000000000001';
                await Database.query('companies').insert(data);
                Utils.toast('Firma vytvorená', 'success');
            }
            
            this.closeModal();
            await this.loadCompanies();
        } catch (e) {
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async deleteCompany(id) {
        if (!confirm('Naozaj chcete zmazať túto firmu?')) return;
        
        try {
            await Database.query('companies').delete().eq('id', id);
            Utils.toast('Firma zmazaná', 'success');
            this.closeModal();
            await this.loadCompanies();
        } catch (e) {
            Utils.toast('Chyba pri mazaní', 'error');
        }
    },
    
    bindEvents() {
        document.getElementById('companies-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#companies-grid > div').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeModal();
        });
        
        document.getElementById('company-modal')?.addEventListener('click', e => {
            if (e.target.id === 'company-modal') this.closeModal();
        });
    },
    
    escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};

window.CompaniesModule = CompaniesModule;
