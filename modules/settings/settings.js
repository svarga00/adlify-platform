// =====================================================
// ADLIFY - Settings Module (Nastavenia)
// =====================================================

const SettingsModule = {
    id: 'settings',
    name: 'Nastavenia',
    icon: '⚙️',
    title: 'Nastavenia',
    menu: { section: 'settings', order: 10 },
    permissions: ['owner', 'admin'],
    
    // Aktuálny tab
    currentTab: 'company',
    
    // Cache dát
    settings: {},
    
    // ===========================================
    // CORE METHODS
    // ===========================================
    
    async render(container) {
        container.innerHTML = `
            <div class="settings-module">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-2xl font-bold">⚙️ Nastavenia</h1>
                </div>
                
                <!-- Tabs -->
                <div class="tabs-container mb-6">
                    <div class="flex gap-2 border-b">
                        <button class="tab-btn ${this.currentTab === 'company' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('company')">
                            🏢 Firma
                        </button>
                        <button class="tab-btn ${this.currentTab === 'banking' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('banking')">
                            🏦 Bankové údaje
                        </button>
                        <button class="tab-btn ${this.currentTab === 'invoicing' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('invoicing')">
                            📄 Fakturácia
                        </button>
                        <button class="tab-btn ${this.currentTab === 'email' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('email')">
                            📧 Email
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div id="settings-content" class="settings-content">
                    <div class="text-center py-8 text-gray-500">
                        Načítavam nastavenia...
                    </div>
                </div>
            </div>
            
            ${this.getStyles()}
        `;
        
        await this.loadSettings();
        this.renderContent();
    },
    
    async loadSettings() {
        try {
            const { data, error } = await Database.client
                .from('settings')
                .select('*');
            
            if (error) throw error;
            
            // Convert array to object by key
            this.settings = {};
            (data || []).forEach(s => {
                this.settings[s.key] = s.value;
            });
            
        } catch (err) {
            console.error('Error loading settings:', err);
            Utils.toast('Chyba pri načítaní nastavení', 'error');
        }
    },
    
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        this.renderContent();
    },
    
    renderContent() {
        const content = document.getElementById('settings-content');
        if (!content) return;
        
        switch (this.currentTab) {
            case 'company':
                content.innerHTML = this.renderCompanySettings();
                break;
            case 'banking':
                content.innerHTML = this.renderBankingSettings();
                break;
            case 'invoicing':
                content.innerHTML = this.renderInvoicingSettings();
                break;
            case 'email':
                content.innerHTML = this.renderEmailSettings();
                break;
        }
    },
    
    // ===========================================
    // RENDER METHODS
    // ===========================================
    
    renderCompanySettings() {
        const s = this.settings;
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">🏢 Firemné údaje</h2>
                <p class="text-sm text-gray-500 mb-6">Tieto údaje sa použijú na faktúrach a v komunikácii.</p>
                
                <form id="company-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Názov firmy *</label>
                            <input type="text" name="company_name" value="${this.getValue('company_name')}" 
                                   class="w-full p-3 border rounded-xl" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">IČO</label>
                            <input type="text" name="company_ico" value="${this.getValue('company_ico')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="12345678">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">DIČ</label>
                            <input type="text" name="company_dic" value="${this.getValue('company_dic')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="1234567890">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">IČ DPH</label>
                            <input type="text" name="company_ic_dph" value="${this.getValue('company_ic_dph')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="SK1234567890">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Adresa</label>
                        <input type="text" name="company_address" value="${this.getValue('company_address')}" 
                               class="w-full p-3 border rounded-xl" placeholder="Ulica a číslo">
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Mesto</label>
                            <input type="text" name="company_city" value="${this.getValue('company_city')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">PSČ</label>
                            <input type="text" name="company_zip" value="${this.getValue('company_zip')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Krajina</label>
                            <input type="text" name="company_country" value="${this.getValue('company_country', 'Slovensko')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <hr class="my-6">
                    
                    <h3 class="font-medium mb-4">📞 Kontaktné údaje</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Email</label>
                            <input type="email" name="company_email" value="${this.getValue('company_email')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Telefón</label>
                            <input type="text" name="company_phone" value="${this.getValue('company_phone')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Web</label>
                        <input type="url" name="company_website" value="${this.getValue('company_website')}" 
                               class="w-full p-3 border rounded-xl">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">URL loga</label>
                        <input type="url" name="company_logo_url" value="${this.getValue('company_logo_url')}" 
                               class="w-full p-3 border rounded-xl" placeholder="https://...">
                        <p class="text-xs text-gray-500 mt-1">Logo sa zobrazí na faktúrach a ponukách</p>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">
                            💾 Uložiť zmeny
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    renderBankingSettings() {
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">🏦 Bankové údaje</h2>
                <p class="text-sm text-gray-500 mb-6">Údaje pre prijímanie platieb, zobrazia sa na faktúrach.</p>
                
                <form id="banking-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Názov banky</label>
                        <input type="text" name="bank_name" value="${this.getValue('bank_name')}" 
                               class="w-full p-3 border rounded-xl" placeholder="Tatra banka, a.s.">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Číslo účtu</label>
                        <input type="text" name="bank_account" value="${this.getValue('bank_account')}" 
                               class="w-full p-3 border rounded-xl" placeholder="1234567890/1100">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">IBAN</label>
                        <input type="text" name="bank_iban" value="${this.getValue('bank_iban')}" 
                               class="w-full p-3 border rounded-xl" placeholder="SK12 1100 0000 0012 3456 7890">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">SWIFT/BIC</label>
                        <input type="text" name="bank_swift" value="${this.getValue('bank_swift')}" 
                               class="w-full p-3 border rounded-xl" placeholder="TATRSKBX">
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">
                            💾 Uložiť zmeny
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    renderInvoicingSettings() {
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">📄 Nastavenia fakturácie</h2>
                <p class="text-sm text-gray-500 mb-6">Predvolené hodnoty pre nové faktúry.</p>
                
                <form id="invoicing-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Predvolená splatnosť (dni)</label>
                            <input type="number" name="invoice_default_due_days" 
                                   value="${this.getValue('invoice_default_due_days', '14')}" 
                                   class="w-full p-3 border rounded-xl" min="1" max="90">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Predvolená sadzba DPH (%)</label>
                            <input type="number" name="invoice_default_vat_rate" 
                                   value="${this.getValue('invoice_default_vat_rate', '20')}" 
                                   class="w-full p-3 border rounded-xl" min="0" max="100">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Text v päte faktúry</label>
                        <textarea name="invoice_footer_text" rows="3"
                                  class="w-full p-3 border rounded-xl"
                                  placeholder="Ďakujeme za Vašu dôveru.">${this.getValue('invoice_footer_text')}</textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Obchodné podmienky</label>
                        <textarea name="invoice_terms" rows="5"
                                  class="w-full p-3 border rounded-xl"
                                  placeholder="Voliteľné obchodné podmienky...">${this.getValue('invoice_terms')}</textarea>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">
                            💾 Uložiť zmeny
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    renderEmailSettings() {
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">📧 Email nastavenia</h2>
                <p class="text-sm text-gray-500 mb-6">Nastavenia pre odosielanie emailov.</p>
                
                <form id="email-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Meno odosielateľa</label>
                            <input type="text" name="email_from_name" value="${this.getValue('email_from_name', 'Adlify')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Email odosielateľa</label>
                            <input type="email" name="email_from_address" value="${this.getValue('email_from_address')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Email podpis (HTML)</label>
                        <textarea name="email_signature" rows="6"
                                  class="w-full p-3 border rounded-xl font-mono text-sm"
                                  placeholder="<p>S pozdravom,<br>Tím Adlify</p>">${this.getValue('email_signature')}</textarea>
                        <p class="text-xs text-gray-500 mt-1">Podporované HTML tagy: &lt;p&gt;, &lt;br&gt;, &lt;a&gt;, &lt;strong&gt;</p>
                    </div>
                    
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h3 class="font-medium mb-2">📬 SMTP nastavenia</h3>
                        <p class="text-sm text-gray-500 mb-4">SMTP server je nakonfigurovaný v prostredí. Pre zmenu kontaktujte administrátora.</p>
                        <div class="text-sm">
                            <div class="flex justify-between py-1 border-b">
                                <span class="text-gray-500">Server:</span>
                                <span class="font-mono">smtp.webglobe.sk</span>
                            </div>
                            <div class="flex justify-between py-1 border-b">
                                <span class="text-gray-500">Port:</span>
                                <span class="font-mono">465 (SSL)</span>
                            </div>
                            <div class="flex justify-between py-1">
                                <span class="text-gray-500">Status:</span>
                                <span class="text-green-600">✅ Pripojené</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">
                            💾 Uložiť zmeny
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    // ===========================================
    // HELPER METHODS
    // ===========================================
    
    getValue(key, defaultValue = '') {
        const val = this.settings[key];
        if (val === undefined || val === null) return defaultValue;
        // Remove quotes if JSON string
        if (typeof val === 'string') {
            try {
                return JSON.parse(val);
            } catch {
                return val;
            }
        }
        return val;
    },
    
    async saveSettings(formId) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        const formData = new FormData(form);
        const updates = [];
        
        for (const [key, value] of formData.entries()) {
            updates.push({
                key: key,
                value: JSON.stringify(value),
                updated_at: new Date().toISOString()
            });
        }
        
        try {
            for (const update of updates) {
                const { error } = await Database.client
                    .from('settings')
                    .upsert(update, { onConflict: 'key' });
                
                if (error) throw error;
                
                // Update local cache
                this.settings[update.key] = update.value;
            }
            
            Utils.toast('Nastavenia uložené! ✅', 'success');
            
        } catch (err) {
            console.error('Error saving settings:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    // ===========================================
    // EVENT HANDLERS
    // ===========================================
    
    init() {
        // Form submit handlers
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'company-form') {
                e.preventDefault();
                this.saveSettings('company-form');
            }
            if (e.target.id === 'banking-form') {
                e.preventDefault();
                this.saveSettings('banking-form');
            }
            if (e.target.id === 'invoicing-form') {
                e.preventDefault();
                this.saveSettings('invoicing-form');
            }
            if (e.target.id === 'email-form') {
                e.preventDefault();
                this.saveSettings('email-form');
            }
        });
    },
    
    // ===========================================
    // STYLES
    // ===========================================
    
    getStyles() {
        return `
            <style>
                .settings-module {
                    max-width: 800px;
                }
                
                .settings-card {
                    background: white;
                    border-radius: 1rem;
                    padding: 1.5rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .tab-btn {
                    padding: 0.75rem 1rem;
                    font-weight: 500;
                    color: #6b7280;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                
                .tab-btn:hover {
                    color: #374151;
                }
                
                .tab-btn.active {
                    color: #f97316;
                    border-bottom-color: #f97316;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.75rem;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
                }
                
                input, textarea, select {
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                
                input:focus, textarea:focus, select:focus {
                    outline: none;
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
                }
            </style>
        `;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    SettingsModule.init();
});

// Export pre globálny prístup
window.SettingsModule = SettingsModule;
