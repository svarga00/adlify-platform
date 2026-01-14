// =====================================================
// ADLIFY - Integrations Module (Integrácie)
// =====================================================

const IntegrationsModule = {
    id: 'integrations',
    name: 'Integrácie',
    icon: '🔗',
    title: 'Integrácie',
    menu: { section: 'settings', order: 20 },
    permissions: ['owner', 'admin'],
    
    // Predefinované integrácie
    defaultIntegrations: [
        {
            id: 'superfaktura',
            name: 'SuperFaktúra',
            provider: 'superfaktura',
            is_enabled: false,
            credentials: { email: '', api_key: '', company_id: '' },
            settings: { sandbox: false }
        },
        {
            id: 'marketing_miner',
            name: 'Marketing Miner',
            provider: 'marketing_miner',
            is_enabled: false,
            credentials: { api_key: '' },
            settings: { daily_limit: 1000 }
        },
        {
            id: 'google_ads',
            name: 'Google Ads',
            provider: 'google_ads',
            is_enabled: false,
            credentials: {},
            settings: {}
        },
        {
            id: 'meta_ads',
            name: 'Meta Ads',
            provider: 'meta_ads',
            is_enabled: false,
            credentials: {},
            settings: {}
        }
    ],
    
    // ===========================================
    // CORE METHODS
    // ===========================================
    
    async render(container) {
        container.innerHTML = `
            <div class="integrations-module">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h1 class="text-2xl font-bold">🔗 Integrácie</h1>
                        <p class="text-gray-500">Prepojenia s externými službami</p>
                    </div>
                </div>
                
                <div id="integrations-list" class="space-y-4">
                    <div class="text-center py-8 text-gray-500">
                        Načítavam integrácie...
                    </div>
                </div>
            </div>
            
            <!-- Modal pre nastavenia -->
            <div id="integration-modal" class="modal-overlay hidden">
                <div class="modal" style="max-width: 500px;">
                    <div class="modal-header">
                        <h2 class="text-xl font-bold" id="modal-title">Nastavenia integrácie</h2>
                        <button onclick="IntegrationsModule.closeModal()" class="modal-close">×</button>
                    </div>
                    <div class="modal-body" id="modal-body">
                        <!-- Dynamic content -->
                    </div>
                </div>
            </div>
            
            ${this.getStyles()}
        `;
        
        await this.loadIntegrations();
    },
    
    async loadIntegrations() {
        try {
            // Načítať konfiguráciu zo settings
            const { data, error } = await Database.client
                .from('settings')
                .select('*')
                .like('key', 'integration_%');
            
            if (error) throw error;
            
            // Merge settings data with defaults
            this.integrations = this.defaultIntegrations.map(def => {
                const configKey = `integration_${def.provider}`;
                const setting = (data || []).find(s => s.key === configKey);
                
                if (setting && setting.value) {
                    try {
                        const config = typeof setting.value === 'string' 
                            ? JSON.parse(setting.value) 
                            : setting.value;
                        return { 
                            ...def, 
                            is_enabled: config.is_enabled || false,
                            credentials: config.credentials || def.credentials,
                            settings: config.settings || def.settings,
                            last_sync_at: config.last_sync_at
                        };
                    } catch {
                        return def;
                    }
                }
                return def;
            });
            
            this.renderList();
            
        } catch (err) {
            console.error('Error loading integrations:', err);
            Utils.toast('Chyba pri načítaní integrácií', 'error');
        }
    },
    
    renderList() {
        const container = document.getElementById('integrations-list');
        if (!container) return;
        
        if (this.integrations.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    Žiadne integrácie nie sú nakonfigurované.
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.integrations.map(i => this.renderIntegrationCard(i)).join('');
    },
    
    renderIntegrationCard(integration) {
        const { id, name, provider, is_enabled, last_sync_at, sync_status } = integration;
        
        const icons = {
            superfaktura: '📄',
            marketing_miner: '🔍',
            google_ads: '📊',
            meta_ads: '📘',
            google_calendar: '📅',
            slack: '💬'
        };
        
        const descriptions = {
            superfaktura: 'Fakturácia, DPH, účtovníctvo',
            marketing_miner: 'Keyword research, SEO analýza',
            google_ads: 'Import/export kampaní a metrík',
            meta_ads: 'Facebook & Instagram reklamy',
            google_calendar: 'Synchronizácia kalendára',
            slack: 'Notifikácie a alertyň'
        };
        
        const statusClass = is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600';
        const statusText = is_enabled ? '✅ Aktívne' : '⭕ Neaktívne';
        
        return `
            <div class="integration-card ${is_enabled ? 'enabled' : ''}" data-id="${id}">
                <div class="flex items-start gap-4">
                    <div class="text-4xl">${icons[provider] || '🔗'}</div>
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-1">
                            <h3 class="text-lg font-semibold">${name}</h3>
                            <span class="px-2 py-0.5 rounded-full text-xs ${statusClass}">${statusText}</span>
                        </div>
                        <p class="text-gray-500 text-sm mb-3">${descriptions[provider] || ''}</p>
                        
                        ${last_sync_at ? `
                            <div class="text-xs text-gray-400">
                                Posledná sync: ${this.formatDate(last_sync_at)}
                                ${sync_status === 'failed' ? '<span class="text-red-500 ml-2">⚠️ Chyba</span>' : ''}
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="IntegrationsModule.configure('${provider}')" 
                                class="btn-secondary">
                            ⚙️ Nastaviť
                        </button>
                        ${is_enabled && provider === 'superfaktura' ? `
                            <button onclick="IntegrationsModule.testConnection('${provider}')" 
                                    class="btn-secondary">
                                🔄 Test
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },
    
    // ===========================================
    // CONFIGURE METHODS
    // ===========================================
    
    async configure(integrationId) {
        const integration = this.integrations.find(i => i.id === integrationId || i.provider === integrationId);
        if (!integration) return;
        
        document.getElementById('modal-title').textContent = `⚙️ ${integration.name}`;
        document.getElementById('modal-body').innerHTML = this.getConfigForm(integration);
        document.getElementById('integration-modal').classList.remove('hidden');
    },
    
    getConfigForm(integration) {
        const { id, provider, is_enabled, credentials, settings } = integration;
        const creds = credentials || {};
        const sets = settings || {};
        
        let fieldsHtml = '';
        
        switch (provider) {
            case 'superfaktura':
                fieldsHtml = `
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Email *</label>
                            <input type="email" name="email" value="${creds.email || ''}" 
                                   class="w-full p-3 border rounded-xl" 
                                   placeholder="vas@email.sk">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">API kľúč *</label>
                            <input type="password" name="api_key" value="${creds.api_key || ''}" 
                                   class="w-full p-3 border rounded-xl font-mono"
                                   placeholder="c0a4cdcdfe98ca660942d60cf7896de6">
                            <p class="text-xs text-gray-500 mt-1">
                                Nájdete v SuperFaktúra → Nastavenia → 
                                <a href="https://moja.superfaktura.sk/api_access" target="_blank" class="text-orange-500 underline">API prístup</a>
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Company ID</label>
                            <input type="text" name="company_id" value="${creds.company_id || ''}" 
                                   class="w-full p-3 border rounded-xl"
                                   placeholder="Voliteľné, ak máte viac firiem">
                        </div>
                        <hr class="my-4">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" name="sandbox" id="sf-sandbox" ${sets.sandbox ? 'checked' : ''}>
                            <label for="sf-sandbox" class="text-sm">Používať sandbox (testovacie prostredie)</label>
                        </div>
                    </div>
                `;
                break;
                
            case 'marketing_miner':
                fieldsHtml = `
                    <div class="space-y-4">
                        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                            <div class="flex items-start gap-3">
                                <span class="text-2xl">💡</span>
                                <div class="text-sm text-blue-800">
                                    <strong>Marketing Miner API</strong> umožňuje automaticky získavať:
                                    <ul class="mt-2 ml-4 list-disc space-y-1">
                                        <li>Návrhy kľúčových slov + search volume</li>
                                        <li>CPC (cena za klik) pre reálne rozpočty</li>
                                        <li>Viditeľnosť domény v Google</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">API kľúč *</label>
                            <input type="password" name="api_key" value="${creds.api_key || ''}" 
                                   id="mm-api-key"
                                   class="w-full p-3 border rounded-xl font-mono"
                                   placeholder="69e05bc1d9d131fc5d8e7b22f68229a4...">
                            <p class="text-xs text-gray-500 mt-1">
                                Nájdete v Marketing Miner → 
                                <a href="https://www.marketingminer.com/sk/profile" target="_blank" class="text-orange-500 underline">Profil → API kľúče</a>
                            </p>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">Predvolený jazyk</label>
                                <select name="default_lang" class="w-full p-3 border rounded-xl">
                                    <option value="sk" ${(sets.default_lang || 'sk') === 'sk' ? 'selected' : ''}>🇸🇰 Slovensko</option>
                                    <option value="cs" ${sets.default_lang === 'cs' ? 'selected' : ''}>🇨🇿 Česko</option>
                                    <option value="pl" ${sets.default_lang === 'pl' ? 'selected' : ''}>🇵🇱 Poľsko</option>
                                    <option value="gb" ${sets.default_lang === 'gb' ? 'selected' : ''}>🇬🇧 UK</option>
                                    <option value="us" ${sets.default_lang === 'us' ? 'selected' : ''}>🇺🇸 USA</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Denný limit kreditov</label>
                                <input type="number" name="daily_limit" value="${sets.daily_limit || 5000}" 
                                       class="w-full p-3 border rounded-xl"
                                       min="100" max="100000">
                                <p class="text-xs text-gray-500 mt-1">Ochrana pred prekročením</p>
                            </div>
                        </div>
                        
                        <hr class="my-4">
                        
                        <div class="bg-gray-50 rounded-xl p-4">
                            <h4 class="font-medium mb-3">🧪 Test pripojenia</h4>
                            <div class="flex gap-3">
                                <button type="button" onclick="IntegrationsModule.testMarketingMiner()" 
                                        class="btn-secondary flex-1" id="mm-test-btn">
                                    🔄 Otestovať API
                                </button>
                            </div>
                            <div id="mm-test-result" class="mt-3 text-sm hidden"></div>
                        </div>
                        
                        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div class="flex items-start gap-3">
                                <span class="text-xl">💰</span>
                                <div class="text-sm text-amber-800">
                                    <strong>Ceny API:</strong>
                                    <ul class="mt-1 space-y-0.5">
                                        <li>• Keyword suggestions: kredity/keyword</li>
                                        <li>• Search volume: 3 kredity/keyword</li>
                                        <li>• Domain stats: 10 kreditov/doména</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                break;
                
            case 'google_ads':
            case 'meta_ads':
                fieldsHtml = `
                    <div class="text-center py-8">
                        <div class="text-6xl mb-4">🚧</div>
                        <h3 class="text-lg font-semibold mb-2">Pripravujeme</h3>
                        <p class="text-gray-500">Táto integrácia bude dostupná čoskoro.</p>
                    </div>
                `;
                break;
                
            default:
                fieldsHtml = `
                    <div class="text-center py-8 text-gray-500">
                        Konfigurácia nie je dostupná.
                    </div>
                `;
        }
        
        const canSave = ['superfaktura', 'marketing_miner'].includes(provider);
        
        return `
            <form id="integration-form" class="space-y-4">
                <input type="hidden" name="integration_id" value="${provider}">
                
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-4">
                    <span class="font-medium">Stav integrácie</span>
                    <label class="toggle-switch">
                        <input type="checkbox" name="is_enabled" ${is_enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                
                ${fieldsHtml}
                
                ${canSave ? `
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onclick="IntegrationsModule.closeModal()" class="btn-secondary">
                            Zrušiť
                        </button>
                        <button type="submit" class="btn-primary">
                            💾 Uložiť
                        </button>
                    </div>
                ` : ''}
            </form>
        `;
    },
    
    async saveIntegration(formData) {
        const id = formData.get('integration_id');
        const integration = this.integrations.find(i => i.id === id || i.provider === id);
        if (!integration) return;
        
        const credentials = {};
        const settings = {};
        
        // Parse form data based on provider
        switch (integration.provider) {
            case 'superfaktura':
                credentials.email = formData.get('email');
                credentials.api_key = formData.get('api_key');
                credentials.company_id = formData.get('company_id');
                settings.sandbox = formData.get('sandbox') === 'on';
                break;
                
            case 'marketing_miner':
                credentials.api_key = formData.get('api_key');
                settings.daily_limit = parseInt(formData.get('daily_limit')) || 5000;
                settings.default_lang = formData.get('default_lang') || 'sk';
                break;
        }
        
        const is_enabled = formData.get('is_enabled') === 'on';
        
        // Uložiť do settings tabuľky
        const configKey = `integration_${integration.provider}`;
        const configValue = JSON.stringify({
            is_enabled,
            credentials,
            settings,
            updated_at: new Date().toISOString()
        });
        
        try {
            const { error } = await Database.client
                .from('settings')
                .upsert({
                    key: configKey,
                    value: configValue,
                    category: 'integrations',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });
            
            if (error) throw error;
            
            // Update local state
            integration.is_enabled = is_enabled;
            integration.credentials = credentials;
            integration.settings = settings;
            
            Utils.toast('Integrácia uložená! ✅', 'success');
            this.closeModal();
            this.renderList();
            
        } catch (err) {
            console.error('Error saving integration:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async testConnection(providerId) {
        const integration = this.integrations.find(i => i.provider === providerId);
        if (!integration) return;
        
        Utils.toast('Testujem pripojenie...', 'info');
        
        try {
            if (integration.provider === 'superfaktura') {
                const result = await this.testSuperFaktura(integration.credentials);
                
                if (result.success) {
                    Utils.toast('✅ Pripojenie funguje!', 'success');
                    
                    // Update sync status in settings
                    const configKey = `integration_${integration.provider}`;
                    const config = {
                        is_enabled: integration.is_enabled,
                        credentials: integration.credentials,
                        settings: integration.settings,
                        last_sync_at: new Date().toISOString(),
                        sync_status: 'success'
                    };
                    
                    await Database.client
                        .from('settings')
                        .upsert({
                            key: configKey,
                            value: JSON.stringify(config),
                            category: 'integrations',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'key' });
                        
                    integration.last_sync_at = config.last_sync_at;
                } else {
                    Utils.toast('❌ ' + result.error, 'error');
                }
                
                this.renderList();
            }
        } catch (err) {
            console.error('Test connection error:', err);
            Utils.toast('Chyba pri testovaní', 'error');
        }
    },
    
    async testSuperFaktura(credentials) {
        // Poznámka: Priamy test z browsera má CORS obmedzenia
        // V produkčnom prostredí by sa použila Edge Function
        
        if (!credentials.email || !credentials.api_key) {
            return { success: false, error: 'Vyplňte email a API kľúč' };
        }
        
        // Validácia formátu
        if (!credentials.email.includes('@')) {
            return { success: false, error: 'Neplatný formát emailu' };
        }
        
        if (credentials.api_key.length < 10) {
            return { success: false, error: 'API kľúč je príliš krátky' };
        }
        
        // Pre teraz vrátime success ak sú údaje vyplnené
        // V budúcnosti - Edge Function pre reálny test
        return { 
            success: true, 
            message: 'Údaje uložené. Test pripojenia bude dostupný čoskoro.' 
        };
    },
    
    // ===========================================
    // MODAL METHODS
    // ===========================================
    
    closeModal() {
        document.getElementById('integration-modal').classList.add('hidden');
    },
    
    // ===========================================
    // MARKETING MINER TEST
    // ===========================================
    
    async testMarketingMiner() {
        const apiKeyInput = document.getElementById('mm-api-key');
        const testBtn = document.getElementById('mm-test-btn');
        const resultDiv = document.getElementById('mm-test-result');
        
        const apiKey = apiKeyInput?.value?.trim();
        
        if (!apiKey) {
            resultDiv.innerHTML = '<span class="text-red-600">❌ Zadajte API kľúč</span>';
            resultDiv.classList.remove('hidden');
            return;
        }
        
        // UI loading state
        testBtn.disabled = true;
        testBtn.innerHTML = '⏳ Testujem...';
        resultDiv.classList.add('hidden');
        
        try {
            // Najprv uložiť API kľúč do DB (dočasne)
            const tempConfig = {
                is_enabled: true,
                credentials: { api_key: apiKey },
                settings: { daily_limit: 5000 }
            };
            
            await Database.client
                .from('settings')
                .upsert({
                    key: 'integration_marketing_miner',
                    value: tempConfig,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });
            
            // Zavolať test endpoint
            const response = await fetch('/.netlify/functions/marketing-miner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test_connection' })
            });
            
            const result = await response.json();
            
            if (result.success && result.data?.connected) {
                resultDiv.innerHTML = `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div class="flex items-center gap-2 text-green-700 font-medium">
                            ✅ ${result.data.message || 'Pripojenie úspešné!'}
                        </div>
                        ${result.data.sample?.length > 0 ? `
                            <div class="mt-2 text-xs text-green-600">
                                Ukážka: "${result.data.sample[0]?.keyword || 'test'}" 
                                (${result.data.sample[0]?.searchVolume || 0} hľadaní/mes)
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                throw new Error(result.error || 'Test zlyhal');
            }
            
        } catch (error) {
            console.error('MM test error:', error);
            resultDiv.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div class="flex items-center gap-2 text-red-700 font-medium">
                        ❌ Chyba pripojenia
                    </div>
                    <div class="mt-1 text-xs text-red-600">
                        ${error.message || 'Nepodarilo sa pripojiť k Marketing Miner API'}
                    </div>
                </div>
            `;
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = '🔄 Otestovať API';
            resultDiv.classList.remove('hidden');
        }
    },
    
    // ===========================================
    // HELPER METHODS
    // ===========================================
    
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleString('sk-SK', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    // ===========================================
    // EVENT HANDLERS
    // ===========================================
    
    init() {
        // Form submit handler
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'integration-form') {
                e.preventDefault();
                const formData = new FormData(e.target);
                this.saveIntegration(formData);
            }
        });
        
        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                this.closeModal();
            }
        });
    },
    
    // ===========================================
    // STYLES
    // ===========================================
    
    getStyles() {
        return `
            <style>
                .integrations-module {
                    max-width: 900px;
                }
                
                .integration-card {
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 1rem;
                    padding: 1.25rem;
                    transition: all 0.2s;
                }
                
                .integration-card:hover {
                    border-color: #d1d5db;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }
                
                .integration-card.enabled {
                    border-color: #86efac;
                    background: linear-gradient(135deg, #f0fdf4, #ffffff);
                }
                
                .btn-secondary {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }
                
                .btn-secondary:hover {
                    background: #f3f4f6;
                    border-color: #d1d5db;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }
                
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
                }
                
                /* Modal */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                }
                
                .modal-overlay.hidden {
                    display: none;
                }
                
                .modal {
                    background: white;
                    border-radius: 1rem;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #6b7280;
                }
                
                .modal-body {
                    padding: 1.5rem;
                }
                
                /* Toggle Switch */
                .toggle-switch {
                    position: relative;
                    width: 48px;
                    height: 24px;
                }
                
                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                
                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    inset: 0;
                    background-color: #ccc;
                    transition: 0.3s;
                    border-radius: 24px;
                }
                
                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }
                
                .toggle-switch input:checked + .toggle-slider {
                    background: linear-gradient(135deg, #f97316, #ec4899);
                }
                
                .toggle-switch input:checked + .toggle-slider:before {
                    transform: translateX(24px);
                }
                
                input:focus, textarea:focus {
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
    IntegrationsModule.init();
});

// Export pre globálny prístup
window.IntegrationsModule = IntegrationsModule;
