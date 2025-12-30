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
    
    // Cache dát
    integrations: [],
    
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
            <div id="integration-modal" class="modal hidden">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="text-xl font-bold" id="modal-title">Nastavenia integrácie</h2>
                        <button onclick="IntegrationsModule.closeModal()" class="text-gray-400 hover:text-gray-600">✕</button>
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
            const { data, error } = await Database.client
                .from('integrations')
                .select('*')
                .order('name');
            
            if (error) throw error;
            
            this.integrations = data || [];
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
                        <button onclick="IntegrationsModule.configure('${id}')" 
                                class="btn-secondary">
                            ⚙️ Nastaviť
                        </button>
                        ${is_enabled && provider === 'superfaktura' ? `
                            <button onclick="IntegrationsModule.testConnection('${id}')" 
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
        const integration = this.integrations.find(i => i.id === integrationId);
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
                        <div>
                            <label class="block text-sm font-medium mb-1">API kľúč *</label>
                            <input type="password" name="api_key" value="${creds.api_key || ''}" 
                                   class="w-full p-3 border rounded-xl font-mono">
                            <p class="text-xs text-gray-500 mt-1">
                                Nájdete v Marketing Miner → Nastavenia → API
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Denný limit požiadaviek</label>
                            <input type="number" name="daily_limit" value="${sets.daily_limit || 1000}" 
                                   class="w-full p-3 border rounded-xl">
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
                <input type="hidden" name="integration_id" value="${id}">
                
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
        const integration = this.integrations.find(i => i.id === id);
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
                settings.daily_limit = parseInt(formData.get('daily_limit')) || 1000;
                break;
        }
        
        const is_enabled = formData.get('is_enabled') === 'on';
        
        try {
            const { error } = await Database.client
                .from('integrations')
                .update({
                    is_enabled,
                    credentials,
                    settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            
            Utils.toast('Integrácia uložená! ✅', 'success');
            this.closeModal();
            await this.loadIntegrations();
            
        } catch (err) {
            console.error('Error saving integration:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async testConnection(integrationId) {
        const integration = this.integrations.find(i => i.id === integrationId);
        if (!integration) return;
        
        Utils.toast('Testujem pripojenie...', 'info');
        
        try {
            if (integration.provider === 'superfaktura') {
                const result = await this.testSuperFaktura(integration.credentials);
                
                if (result.success) {
                    Utils.toast('✅ Pripojenie funguje!', 'success');
                    
                    // Update sync status
                    await Database.client
                        .from('integrations')
                        .update({
                            last_sync_at: new Date().toISOString(),
                            sync_status: 'success'
                        })
                        .eq('id', integrationId);
                } else {
                    Utils.toast('❌ ' + result.error, 'error');
                    
                    await Database.client
                        .from('integrations')
                        .update({
                            sync_status: 'failed',
                            sync_error: result.error
                        })
                        .eq('id', integrationId);
                }
                
                await this.loadIntegrations();
            }
        } catch (err) {
            console.error('Test connection error:', err);
            Utils.toast('Chyba pri testovaní', 'error');
        }
    },
    
    async testSuperFaktura(credentials) {
        // Zavoláme SuperFaktúra API cez Edge Function
        try {
            const baseUrl = credentials.sandbox 
                ? 'https://sandbox.superfaktura.sk'
                : 'https://moja.superfaktura.sk';
            
            // Test endpoint - get user info
            const response = await fetch(`${baseUrl}/users/company_data`, {
                headers: {
                    'Authorization': `SFAPI email=${credentials.email}&apikey=${credentials.api_key}${credentials.company_id ? '&company_id=' + credentials.company_id : ''}`
                }
            });
            
            if (!response.ok) {
                return { success: false, error: 'Neplatné prihlasovacie údaje' };
            }
            
            const data = await response.json();
            
            if (data.error) {
                return { success: false, error: data.error_message || 'API chyba' };
            }
            
            return { success: true, data };
            
        } catch (err) {
            return { success: false, error: 'Nedá sa pripojiť k SuperFaktúra' };
        }
    },
    
    // ===========================================
    // MODAL METHODS
    // ===========================================
    
    closeModal() {
        document.getElementById('integration-modal').classList.add('hidden');
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
                .modal {
                    position: fixed;
                    inset: 0;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .modal.hidden {
                    display: none;
                }
                
                .modal-backdrop {
                    position: absolute;
                    inset: 0;
                    background: rgba(0,0,0,0.5);
                }
                
                .modal-content {
                    position: relative;
                    background: white;
                    border-radius: 1rem;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #e5e7eb;
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
