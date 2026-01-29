/**
 * ADLIFY V2 - Contacts Module
 * Správa kontaktných osôb
 */

const ContactsModule = {
    name: 'contacts',
    title: 'Kontakty',
    icon: '👤',
    
    contacts: [],
    
    async render(container) {
        container.innerHTML = `
        <div style="max-width:1400px;margin:0 auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border:1px solid #e2e8f0;border-radius:8px;min-width:300px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="contacts-search" placeholder="Hľadať kontakt..." style="border:none;outline:none;flex:1;font-size:14px;">
                </div>
                <button onclick="ContactsModule.showAddContact()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nový kontakt
                </button>
            </div>
            
            <div class="card" style="overflow:hidden;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Meno</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Email</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Telefón</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Firmy</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Tagy</th>
                            <th style="padding:12px 16px;text-align:right;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Akcie</th>
                        </tr>
                    </thead>
                    <tbody id="contacts-table"></tbody>
                </table>
            </div>
        </div>
        
        <div id="contact-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;padding:20px;">
            <div style="background:white;border-radius:16px;width:100%;max-width:500px;max-height:90vh;overflow:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #e2e8f0;">
                    <h3 id="contact-modal-title" style="font-size:18px;font-weight:600;">Nový kontakt</h3>
                    <button onclick="ContactsModule.closeModal()" style="width:32px;height:32px;border:none;background:#f1f5f9;border-radius:8px;font-size:20px;cursor:pointer;">×</button>
                </div>
                <div id="contact-modal-body" style="padding:20px;"></div>
            </div>
        </div>
        `;
        
        await this.loadContacts();
        this.bindEvents();
    },
    
    async loadContacts() {
        const tbody = document.getElementById('contacts-table');
        
        try {
            const { data, error } = await Database.query('contacts')
                .select('*, contact_company_links(company_id, companies(name))')
                .order('created_at', { ascending: false });
            
            if (error?.code === '42P01') {
                tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#64748b;">Tabuľka contacts ešte neexistuje. Spustite migráciu.</td></tr>';
                return;
            }
            
            this.contacts = data || [];
            this.renderTable();
        } catch (e) {
            console.error('Load contacts error:', e);
            tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#64748b;">Chyba pri načítaní kontaktov</td></tr>';
        }
    },
    
    renderTable() {
        const tbody = document.getElementById('contacts-table');
        
        if (!this.contacts.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#64748b;">Žiadne kontakty</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.contacts.map(c => {
            const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Bez mena';
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const companies = (c.contact_company_links || []).map(l => l.companies?.name).filter(Boolean);
            
            return `
            <tr style="border-bottom:1px solid #f1f5f9;cursor:pointer;" onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background=''" onclick="ContactsModule.showContactDetail('${c.id}')">
                <td style="padding:12px 16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">${initials}</div>
                        <span style="font-weight:500;color:#0f172a;">${this.escapeHtml(name)}</span>
                    </div>
                </td>
                <td style="padding:12px 16px;color:#64748b;font-size:14px;">${c.email || '—'}</td>
                <td style="padding:12px 16px;color:#64748b;font-size:14px;">${c.phone || '—'}</td>
                <td style="padding:12px 16px;">
                    ${companies.length ? companies.map(co => `<span style="display:inline-block;padding:2px 8px;background:#f1f5f9;border-radius:4px;font-size:12px;margin-right:4px;">${this.escapeHtml(co)}</span>`).join('') : '<span style="color:#94a3b8;">—</span>'}
                </td>
                <td style="padding:12px 16px;">
                    ${(c.tags || []).map(t => `<span style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#2563eb;border-radius:4px;font-size:11px;margin-right:4px;">${t}</span>`).join('') || '<span style="color:#94a3b8;">—</span>'}
                </td>
                <td style="padding:12px 16px;text-align:right;">
                    <button onclick="event.stopPropagation();ContactsModule.deleteContact('${c.id}')" style="padding:6px 10px;background:#fef2f2;color:#ef4444;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Zmazať</button>
                </td>
            </tr>
            `;
        }).join('');
    },
    
    showAddContact() {
        document.getElementById('contact-modal-title').textContent = 'Nový kontakt';
        document.getElementById('contact-modal-body').innerHTML = this.getContactForm();
        document.getElementById('contact-modal').style.display = 'flex';
    },
    
    showContactDetail(id) {
        const contact = this.contacts.find(c => c.id === id);
        if (!contact) return;
        
        document.getElementById('contact-modal-title').textContent = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Kontakt';
        document.getElementById('contact-modal-body').innerHTML = this.getContactForm(contact);
        document.getElementById('contact-modal').style.display = 'flex';
    },
    
    closeModal() {
        document.getElementById('contact-modal').style.display = 'none';
    },
    
    getContactForm(contact = {}) {
        return `
        <form onsubmit="ContactsModule.saveContact(event, '${contact.id || ''}')" style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Meno *</label>
                    <input type="text" name="first_name" value="${this.escapeHtml(contact.first_name || '')}" required style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Priezvisko</label>
                    <input type="text" name="last_name" value="${this.escapeHtml(contact.last_name || '')}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
                </div>
            </div>
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Email</label>
                <input type="email" name="email" value="${contact.email || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Telefón</label>
                <input type="text" name="phone" value="${contact.phone || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">LinkedIn</label>
                <input type="url" name="linkedin_url" value="${contact.linkedin_url || ''}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;">
            </div>
            <div>
                <label style="display:block;font-size:13px;font-weight:500;color:#475569;margin-bottom:6px;">Poznámky</label>
                <textarea name="notes" rows="3" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:vertical;">${this.escapeHtml(contact.notes || '')}</textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:12px;padding-top:16px;border-top:1px solid #e2e8f0;">
                <button type="button" onclick="ContactsModule.closeModal()" style="padding:10px 20px;background:#f1f5f9;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Zrušiť</button>
                <button type="submit" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">${contact.id ? 'Uložiť' : 'Vytvoriť'}</button>
            </div>
        </form>
        `;
    },
    
    async saveContact(event, contactId) {
        event.preventDefault();
        const form = event.target;
        const data = {
            first_name: form.first_name.value,
            last_name: form.last_name.value,
            email: form.email.value,
            phone: form.phone.value,
            linkedin_url: form.linkedin_url.value,
            notes: form.notes.value,
            updated_at: new Date().toISOString()
        };
        
        try {
            if (contactId) {
                await Database.query('contacts').update(data).eq('id', contactId);
                Utils.toast('Kontakt aktualizovaný', 'success');
            } else {
                data.created_at = new Date().toISOString();
                data.org_id = '00000000-0000-0000-0000-000000000001';
                await Database.query('contacts').insert(data);
                Utils.toast('Kontakt vytvorený', 'success');
            }
            
            this.closeModal();
            await this.loadContacts();
        } catch (e) {
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async deleteContact(id) {
        if (!confirm('Naozaj chcete zmazať tento kontakt?')) return;
        
        try {
            await Database.query('contacts').delete().eq('id', id);
            Utils.toast('Kontakt zmazaný', 'success');
            await this.loadContacts();
        } catch (e) {
            Utils.toast('Chyba pri mazaní', 'error');
        }
    },
    
    bindEvents() {
        document.getElementById('contacts-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#contacts-table tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeModal();
        });
        
        document.getElementById('contact-modal')?.addEventListener('click', e => {
            if (e.target.id === 'contact-modal') this.closeModal();
        });
    },
    
    escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};

window.ContactsModule = ContactsModule;
