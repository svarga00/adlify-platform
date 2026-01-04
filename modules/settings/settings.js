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
                        <button class="tab-btn ${this.currentTab === 'onboarding' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('onboarding')">
                            📋 Onboarding
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
            case 'onboarding':
                content.innerHTML = this.renderOnboardingSettings();
                this.loadOnboardingData();
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
    // ONBOARDING SETTINGS
    // ===========================================
    
    onboardingData: {
        platforms: [],
        packages: [],
        recommendations: {}
    },
    
    async loadOnboardingData() {
        try {
            // Load packages with limits
            const { data: packages } = await Database.client
                .from('packages')
                .select('*')
                .order('sort_order');
            this.onboardingData.packages = packages || [];
            
            // Load platforms (if table exists)
            try {
                const { data: platforms } = await Database.client
                    .from('onboarding_platforms')
                    .select('*')
                    .order('sort_order');
                this.onboardingData.platforms = platforms || this.getDefaultPlatforms();
            } catch (e) {
                this.onboardingData.platforms = this.getDefaultPlatforms();
            }
            
            // Re-render with data
            const content = document.getElementById('settings-content');
            if (content && this.currentTab === 'onboarding') {
                content.innerHTML = this.renderOnboardingSettings();
            }
        } catch (err) {
            console.error('Error loading onboarding data:', err);
        }
    },
    
    getDefaultPlatforms() {
        return [
            { id: 'google_ads', name: 'Google Ads', short_desc: 'Search, Display, YouTube', color: '#4285F4', enabled: true, sort_order: 1 },
            { id: 'meta_ads', name: 'Meta Ads', subtitle: 'Facebook + Instagram', short_desc: 'Feed, Stories, Reels', color: '#0081FB', enabled: true, sort_order: 2 },
            { id: 'linkedin_ads', name: 'LinkedIn Ads', short_desc: 'B2B reklamy', color: '#0A66C2', enabled: true, sort_order: 3 },
            { id: 'tiktok_ads', name: 'TikTok Ads', short_desc: 'Video reklamy', color: '#000000', enabled: true, sort_order: 4 }
        ];
    },
    
    renderOnboardingSettings() {
        const packages = this.onboardingData.packages;
        const platforms = this.onboardingData.platforms;
        
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">📋 Nastavenia onboardingu</h2>
                <p class="text-sm text-gray-500 mb-6">Nastavte limity pre balíky a spravujte reklamné platformy.</p>
                
                <!-- Package Limits -->
                <div class="mb-8">
                    <h3 class="font-medium mb-4 flex items-center gap-2">
                        💎 Limity balíkov
                        <span class="text-xs text-gray-400">(prázdne = neobmedzené)</span>
                    </h3>
                    
                    ${packages.length === 0 ? `
                        <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                            <p class="text-sm text-amber-700">Žiadne balíky. Vytvorte ich v sekcii "Služby & Balíčky".</p>
                        </div>
                    ` : `
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2 text-left font-medium text-gray-600">Balík</th>
                                        <th class="px-4 py-2 text-center font-medium text-gray-600">Max. platforiem</th>
                                        <th class="px-4 py-2 text-center font-medium text-gray-600">Max. kampaní</th>
                                        <th class="px-4 py-2 text-center font-medium text-gray-600">Max. vizuálov</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y">
                                    ${packages.map(pkg => `
                                        <tr data-package-id="${pkg.id}">
                                            <td class="px-4 py-3">
                                                <div class="flex items-center gap-2">
                                                    <span class="text-xl">${pkg.icon || '📦'}</span>
                                                    <span class="font-medium">${pkg.name}</span>
                                                    <span class="text-gray-400">${pkg.price}€</span>
                                                </div>
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <input type="number" class="w-20 px-2 py-1 border rounded text-center pkg-limit" 
                                                    data-field="max_platforms" value="${pkg.max_platforms || ''}" placeholder="∞" min="0">
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <input type="number" class="w-20 px-2 py-1 border rounded text-center pkg-limit"
                                                    data-field="max_campaigns" value="${pkg.max_campaigns || ''}" placeholder="∞" min="0">
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <input type="number" class="w-20 px-2 py-1 border rounded text-center pkg-limit"
                                                    data-field="max_visuals" value="${pkg.max_visuals || ''}" placeholder="∞" min="0">
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="flex justify-end mt-4">
                            <button onclick="SettingsModule.savePackageLimits()" class="btn-primary">
                                💾 Uložiť limity
                            </button>
                        </div>
                    `}
                </div>
                
                <hr class="my-6">
                
                <!-- Platforms -->
                <div>
                    <h3 class="font-medium mb-4">📱 Reklamné platformy</h3>
                    <p class="text-sm text-gray-500 mb-4">Platformy zobrazené v onboarding dotazníku.</p>
                    
                    <div class="space-y-2">
                        ${platforms.map(p => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: ${p.color}20">
                                        <div class="w-4 h-4 rounded" style="background: ${p.color}"></div>
                                    </div>
                                    <div>
                                        <p class="font-medium">${p.name}</p>
                                        <p class="text-xs text-gray-500">${p.short_desc || ''}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="${p.enabled ? 'text-green-600' : 'text-gray-400'} text-sm">
                                        ${p.enabled ? '● Aktívna' : '○ Neaktívna'}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <p class="text-sm text-blue-800">
                            <strong>💡 Tip:</strong> Pre pridanie nových platforiem spustite SQL migráciu 
                            <code class="bg-blue-100 px-1 rounded">020_onboarding_settings.sql</code>
                        </p>
                    </div>
                </div>
            </div>
        `;
    },
    
    async savePackageLimits() {
        const rows = document.querySelectorAll('[data-package-id]');
        
        try {
            for (const row of rows) {
                const id = row.dataset.packageId;
                const data = {};
                
                row.querySelectorAll('.pkg-limit').forEach(input => {
                    const field = input.dataset.field;
                    const value = input.value.trim();
                    data[field] = value === '' ? null : parseInt(value);
                });
                
                const { error } = await Database.client
                    .from('packages')
                    .update(data)
                    .eq('id', id);
                
                if (error) throw error;
            }
            
            Utils.toast('Limity balíkov uložené! ✅', 'success');
            await this.loadOnboardingData();
            
        } catch (err) {
            console.error('Error saving limits:', err);
            Utils.toast('Chyba pri ukladaní: ' + err.message, 'error');
        }
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
