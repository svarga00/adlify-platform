/**
 * ADLIFY PLATFORM - Onboarding Settings Module v2.0
 * 
 * Admin modul pre správu nastavení onboardingu
 * - Platformy (z DB: onboarding_platforms)
 * - Balíky (z DB: packages - existujúca tabuľka)
 * - Odporúčania (z DB: onboarding_recommendations)
 */

const OnboardingSettingsModule = {
    id: 'onboarding-settings',
    name: 'Nastavenia onboardingu',
    icon: Icons.settings,
    title: 'Nastavenia onboardingu',
    subtitle: 'Platformy, balíky a kroky dotazníka',
    
    menu: { section: 'settings', order: 20 },
    permissions: ['admin'],
    
    // State
    state: {
        platforms: [],
        packages: [],
        recommendations: {},
        isLoading: false,
        activeTab: 'platforms'
    },
    
    init() {
        console.log('Onboarding Settings Module v2.0 initialized');
    },
    
    // ==========================================
    // NAČÍTANIE DÁT
    // ==========================================
    
    async loadData() {
        this.state.isLoading = true;
        
        try {
            await Promise.all([
                this.loadPlatforms(),
                this.loadPackages(),
                this.loadRecommendations()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            Utils?.toast?.('Chyba pri načítaní dát', 'error');
        }
        
        this.state.isLoading = false;
    },
    
    async loadPlatforms() {
        try {
            const { data, error } = await Database.client
                .from('onboarding_platforms')
                .select('*')
                .order('sort_order');
            
            if (error) {
                // Tabuľka možno neexistuje
                console.warn('onboarding_platforms table not found:', error.message);
                this.state.platforms = this.getDefaultPlatforms();
                return;
            }
            
            this.state.platforms = data || [];
        } catch (e) {
            this.state.platforms = this.getDefaultPlatforms();
        }
    },
    
    async loadPackages() {
        try {
            const { data, error } = await Database.client
                .from('packages')
                .select('*')
                .order('sort_order');
            
            if (error) throw error;
            this.state.packages = data || [];
        } catch (e) {
            console.error('Error loading packages:', e);
            this.state.packages = [];
        }
    },
    
    async loadRecommendations() {
        try {
            const { data, error } = await Database.client
                .from('onboarding_recommendations')
                .select('*');
            
            if (error) {
                this.state.recommendations = this.getDefaultRecommendations();
                return;
            }
            
            const recs = {};
            (data || []).forEach(r => {
                recs[r.id] = { platforms: r.platforms || [], message: r.message, name: r.name, icon: r.icon };
            });
            this.state.recommendations = recs;
        } catch (e) {
            this.state.recommendations = this.getDefaultRecommendations();
        }
    },
    
    getDefaultPlatforms() {
        return [
            { id: 'google_ads', name: 'Google Ads', short_desc: 'Search, Display, YouTube, Shopping', color: '#4285F4', enabled: true, sort_order: 1 },
            { id: 'meta_ads', name: 'Meta Ads', subtitle: 'Facebook + Instagram', short_desc: 'Feed, Stories, Reels', color: '#0081FB', enabled: true, sort_order: 2 },
            { id: 'linkedin_ads', name: 'LinkedIn Ads', short_desc: 'B2B reklamy', color: '#0A66C2', enabled: true, sort_order: 3 },
            { id: 'tiktok_ads', name: 'TikTok Ads', short_desc: 'Video reklamy', color: '#000000', enabled: true, sort_order: 4 }
        ];
    },
    
    getDefaultRecommendations() {
        return {
            local_business: { platforms: ['google_ads', 'meta_ads'], message: 'Pre lokálne služby odporúčame Google Ads + Meta Ads', name: 'Lokálne služby', icon: Icons.store },
            ecommerce: { platforms: ['google_ads', 'meta_ads'], message: 'Pre e-shop odporúčame Google Ads + Meta Ads', name: 'E-commerce', icon: Icons.shoppingCart },
            b2b: { platforms: ['google_ads', 'linkedin_ads'], message: 'Pre B2B odporúčame Google Ads + LinkedIn Ads', name: 'B2B', icon: Icons.building },
            startup: { platforms: ['meta_ads', 'tiktok_ads'], message: 'Pre startup odporúčame Meta Ads + TikTok Ads', name: 'Startup', icon: Icons.rocket }
        };
    },
    
    // ==========================================
    // RENDER
    // ==========================================
    
    async render(container) {
        await this.loadData();
        
        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl font-bold">${this.title}</h1>
                        <p class="text-gray-500">${this.subtitle}</p>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="flex gap-2 border-b">
                    ${this.renderTabs()}
                </div>
                
                <!-- Content -->
                <div id="onboarding-settings-content">
                    ${this.state.isLoading ? this.renderLoading() : this.renderActiveTab()}
                </div>
            </div>
        `;
    },
    
    renderTabs() {
        const tabs = [
            { id: 'platforms', label: 'Platformy', icon: Icons.smartphone, count: this.state.platforms.length },
            { id: 'packages', label: 'Limity balíkov', icon: Icons.diamond, count: this.state.packages.length },
            { id: 'recommendations', label: 'Odporúčania', icon: Icons.target }
        ];
        
        return tabs.map(tab => `
            <button onclick="OnboardingSettingsModule.setActiveTab('${tab.id}')"
                class="px-6 py-3 font-medium ${this.state.activeTab === tab.id 
                    ? 'text-purple-600 border-b-2 border-purple-600' 
                    : 'text-gray-500 hover:text-gray-700'}">
                ${tab.icon} ${tab.label} ${tab.count !== undefined ? `(${tab.count})` : ''}
            </button>
        `).join('');
    },
    
    renderActiveTab() {
        switch (this.state.activeTab) {
            case 'platforms': return this.renderPlatformsTab();
            case 'packages': return this.renderPackagesTab();
            case 'recommendations': return this.renderRecommendationsTab();
            default: return '';
        }
    },
    
    renderLoading() {
        return `
            <div class="flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                <span class="ml-3 text-gray-500">Načítavam...</span>
            </div>
        `;
    },
    
    setActiveTab(tabId) {
        this.state.activeTab = tabId;
        document.getElementById('onboarding-settings-content').innerHTML = this.renderActiveTab();
    },
    
    // ==========================================
    // TAB: PLATFORMY
    // ==========================================
    
    renderPlatformsTab() {
        return `
            <div class="py-6">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-lg font-semibold">Reklamné platformy</h2>
                        <p class="text-sm text-gray-500">Platformy zobrazené v onboarding dotazníku</p>
                    </div>
                    <button onclick="OnboardingSettingsModule.showPlatformModal()"
                        class="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                        ➕ Pridať platformu
                    </button>
                </div>
                
                <div class="bg-white rounded-xl border overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platforma</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Popis</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Poradie</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stav</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Akcie</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y">
                            ${this.state.platforms.map(p => this.renderPlatformRow(p)).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p class="text-sm text-blue-800">
                        <strong>💡 Tip:</strong> Ak tabuľka <code>onboarding_platforms</code> neexistuje, 
                        spustite SQL migráciu z <code>migration-onboarding-settings.sql</code>
                    </p>
                </div>
            </div>
        `;
    },
    
    renderPlatformRow(platform) {
        return `
            <tr class="hover:bg-gray-50 ${!platform.enabled ? 'opacity-50' : ''}">
                <td class="px-4 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: ${platform.color}20">
                            <div class="w-6 h-6 rounded" style="background: ${platform.color}"></div>
                        </div>
                        <div>
                            <p class="font-medium">${platform.name}</p>
                            ${platform.subtitle ? `<p class="text-xs text-gray-500">${platform.subtitle}</p>` : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4 text-sm text-gray-600">${platform.short_desc || '-'}</td>
                <td class="px-4 py-4 text-center text-sm text-gray-500">${platform.sort_order}</td>
                <td class="px-4 py-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" ${platform.enabled ? 'checked' : ''}
                            onchange="OnboardingSettingsModule.togglePlatform('${platform.id}', this.checked)">
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full 
                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                            after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </td>
                <td class="px-4 py-4 text-right">
                    <button onclick="OnboardingSettingsModule.showPlatformModal('${platform.id}')"
                        class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg">${Icons.edit}</button>
                    <button onclick="OnboardingSettingsModule.deletePlatform('${platform.id}')"
                        class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">${Icons.trash}</button>
                </td>
            </tr>
        `;
    },
    
    // ==========================================
    // TAB: BALÍKY (LIMITY)
    // ==========================================
    
    renderPackagesTab() {
        return `
            <div class="py-6">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-lg font-semibold">Limity balíkov</h2>
                        <p class="text-sm text-gray-500">Nastavte limity platforiem, kampaní a vizuálov pre každý balík</p>
                    </div>
                    <a href="#" onclick="Router?.navigate?.('services')" 
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">
                        ${Icons.package} Spravovať balíky →
                    </a>
                </div>
                
                ${this.state.packages.length === 0 ? `
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                        <span class="text-3xl mb-3 block">${Icons.package}</span>
                        <h3 class="font-semibold text-amber-800 mb-2">Žiadne balíky</h3>
                        <p class="text-sm text-amber-700">Vytvorte balíky v sekcii "Služby & Balíčky"</p>
                    </div>
                ` : `
                    <div class="bg-white rounded-xl border overflow-hidden">
                        <table class="w-full">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balík</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cena</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. platforiem</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. kampaní</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. vizuálov</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y">
                                ${this.state.packages.map(pkg => this.renderPackageLimitRow(pkg)).join('')}
                            </tbody>
                        </table>
                        <div class="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                            <span class="text-xs text-gray-500">Prázdne = neobmedzené</span>
                            <button onclick="OnboardingSettingsModule.savePackageLimits()"
                                class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                💾 Uložiť limity
                            </button>
                        </div>
                    </div>
                `}
            </div>
        `;
    },
    
    renderPackageLimitRow(pkg) {
        return `
            <tr class="hover:bg-gray-50" data-package-id="${pkg.id}">
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${pkg.icon || ''}</span>
                        <div>
                            <p class="font-medium">${pkg.name}</p>
                            ${pkg.is_featured ? '<span class="text-xs text-orange-600">${Icons.star} Zvýraznený</span>' : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-center font-medium">${pkg.price}€/mes</td>
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
        `;
    },
    
    async savePackageLimits() {
        const rows = document.querySelectorAll('[data-package-id]');
        const updates = [];
        
        rows.forEach(row => {
            const id = row.dataset.packageId;
            const inputs = row.querySelectorAll('.pkg-limit');
            const data = { id };
            
            inputs.forEach(input => {
                const field = input.dataset.field;
                const value = input.value.trim();
                data[field] = value === '' ? null : parseInt(value);
            });
            
            updates.push(data);
        });
        
        try {
            for (const update of updates) {
                const { id, ...data } = update;
                const { error } = await Database.client
                    .from('packages')
                    .update(data)
                    .eq('id', id);
                
                if (error) throw error;
            }
            
            Utils?.toast?.('Limity uložené!', 'success');
            await this.loadPackages();
        } catch (error) {
            console.error('Error saving limits:', error);
            Utils?.toast?.('Chyba pri ukladaní: ' + error.message, 'error');
        }
    },
    
    // ==========================================
    // TAB: ODPORÚČANIA
    // ==========================================
    
    renderRecommendationsTab() {
        const clientTypes = [
            { id: 'local_business', name: 'Lokálne služby', icon: Icons.store },
            { id: 'ecommerce', name: 'E-commerce', icon: Icons.shoppingCart },
            { id: 'b2b', name: 'B2B', icon: Icons.building },
            { id: 'startup', name: 'Startup', icon: Icons.rocket }
        ];
        
        return `
            <div class="py-6">
                <div class="mb-6">
                    <h2 class="text-lg font-semibold">Odporúčania platforiem</h2>
                    <p class="text-sm text-gray-500">Nastavte aké platformy odporúčať podľa typu klienta</p>
                </div>
                
                <div class="space-y-4">
                    ${clientTypes.map(type => {
                        const rec = this.state.recommendations[type.id] || { platforms: [], message: '' };
                        return `
                            <div class="bg-white rounded-xl border p-5" data-rec-id="${type.id}">
                                <div class="flex items-center gap-3 mb-4">
                                    <span class="text-2xl">${type.icon}</span>
                                    <div>
                                        <h3 class="font-semibold">${type.name}</h3>
                                        <p class="text-sm text-gray-500">${type.id}</p>
                                    </div>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Odporúčané platformy</label>
                                    <div class="flex flex-wrap gap-2">
                                        ${this.state.platforms.filter(p => p.enabled).map(platform => `
                                            <label class="inline-flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50
                                                ${rec.platforms?.includes(platform.id) ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}">
                                                <input type="checkbox" class="sr-only rec-platform" data-platform="${platform.id}"
                                                    ${rec.platforms?.includes(platform.id) ? 'checked' : ''}>
                                                <span class="text-sm font-medium">${platform.name}</span>
                                                ${rec.platforms?.includes(platform.id) ? '<span class="text-purple-500">✓</span>' : ''}
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Správa pre klienta</label>
                                    <input type="text" class="w-full px-3 py-2 border rounded-lg rec-message"
                                        value="${rec.message || ''}"
                                        placeholder="Napr. Pre e-shop odporúčame...">
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div class="mt-6 text-right">
                    <button onclick="OnboardingSettingsModule.saveRecommendations()"
                        class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
                        💾 Uložiť odporúčania
                    </button>
                </div>
            </div>
        `;
    },
    
    async saveRecommendations() {
        const cards = document.querySelectorAll('[data-rec-id]');
        const updates = [];
        
        cards.forEach(card => {
            const id = card.dataset.recId;
            const platforms = [];
            card.querySelectorAll('.rec-platform:checked').forEach(cb => {
                platforms.push(cb.dataset.platform);
            });
            const message = card.querySelector('.rec-message').value.trim();
            
            updates.push({ id, platforms, message });
        });
        
        try {
            for (const rec of updates) {
                const { error } = await Database.client
                    .from('onboarding_recommendations')
                    .upsert({
                        id: rec.id,
                        platforms: rec.platforms,
                        message: rec.message
                    });
                
                if (error) throw error;
            }
            
            Utils?.toast?.('Odporúčania uložené!', 'success');
            await this.loadRecommendations();
        } catch (error) {
            console.error('Error saving recommendations:', error);
            Utils?.toast?.('Chyba: ' + error.message, 'error');
        }
    },
    
    // ==========================================
    // PLATFORM MODAL
    // ==========================================
    
    showPlatformModal(platformId = null) {
        const platform = platformId ? this.state.platforms.find(p => p.id === platformId) : null;
        const isEdit = !!platform;
        
        const modalHtml = `
            <div id="platform-settings-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                    <div class="p-6 border-b flex items-center justify-between">
                        <h2 class="text-xl font-bold">${isEdit ? 'Upraviť platformu' : '➕ Nová platforma'}</h2>
                        <button onclick="OnboardingSettingsModule.closePlatformModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
                    </div>
                    
                    <form id="platform-settings-form" class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">ID (jedinečný)</label>
                            <input type="text" name="id" value="${platform?.id || ''}" 
                                class="w-full p-3 border rounded-xl ${isEdit ? 'bg-gray-100' : ''}"
                                ${isEdit ? 'readonly' : 'required'} placeholder="napr. google_ads">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Názov</label>
                            <input type="text" name="name" value="${platform?.name || ''}" 
                                class="w-full p-3 border rounded-xl" required placeholder="napr. Google Ads">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Podnázov (voliteľné)</label>
                            <input type="text" name="subtitle" value="${platform?.subtitle || ''}" 
                                class="w-full p-3 border rounded-xl" placeholder="napr. Facebook + Instagram">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Krátky popis</label>
                            <input type="text" name="short_desc" value="${platform?.short_desc || ''}" 
                                class="w-full p-3 border rounded-xl" placeholder="napr. Search, Display, YouTube">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Popis</label>
                            <textarea name="description" rows="2" class="w-full p-3 border rounded-xl"
                                placeholder="Detailný popis platformy...">${platform?.description || ''}</textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">Farba</label>
                                <input type="color" name="color" value="${platform?.color || '#F97316'}" 
                                    class="w-full h-12 border rounded-xl cursor-pointer">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Poradie</label>
                                <input type="number" name="sort_order" value="${platform?.sort_order || this.state.platforms.length + 1}" 
                                    class="w-full p-3 border rounded-xl">
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <input type="checkbox" name="enabled" id="plat_enabled" ${platform?.enabled !== false ? 'checked' : ''} class="rounded">
                            <label for="plat_enabled" class="text-sm">Platforma je aktívna</label>
                        </div>
                    </form>
                    
                    <div class="p-6 border-t flex justify-end gap-3 bg-gray-50">
                        <button onclick="OnboardingSettingsModule.closePlatformModal()" 
                            class="px-6 py-2 bg-gray-200 rounded-xl hover:bg-gray-300">Zrušiť</button>
                        <button onclick="OnboardingSettingsModule.savePlatformFromModal()"
                            class="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700">💾 Uložiť</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    closePlatformModal() {
        document.getElementById('platform-settings-modal')?.remove();
    },
    
    async savePlatformFromModal() {
        const form = document.getElementById('platform-settings-form');
        const formData = new FormData(form);
        
        const data = {
            id: formData.get('id'),
            name: formData.get('name'),
            subtitle: formData.get('subtitle') || null,
            short_desc: formData.get('short_desc'),
            description: formData.get('description') || null,
            color: formData.get('color'),
            sort_order: parseInt(formData.get('sort_order')) || 0,
            enabled: form.querySelector('[name="enabled"]').checked
        };
        
        if (!data.id || !data.name) {
            Utils?.toast?.('Vyplňte povinné polia', 'warning');
            return;
        }
        
        try {
            const { error } = await Database.client
                .from('onboarding_platforms')
                .upsert(data);
            
            if (error) throw error;
            
            Utils?.toast?.('Platforma uložená!', 'success');
            this.closePlatformModal();
            await this.loadPlatforms();
            this.setActiveTab('platforms');
        } catch (error) {
            console.error('Error saving platform:', error);
            Utils?.toast?.('Chyba: ' + error.message, 'error');
        }
    },
    
    async togglePlatform(platformId, enabled) {
        try {
            const { error } = await Database.client
                .from('onboarding_platforms')
                .update({ enabled })
                .eq('id', platformId);
            
            if (error) throw error;
            
            await this.loadPlatforms();
            this.setActiveTab('platforms');
        } catch (error) {
            Utils?.toast?.('Chyba: ' + error.message, 'error');
        }
    },
    
    async deletePlatform(platformId) {
        if (!confirm('Naozaj chcete odstrániť túto platformu?')) return;
        
        try {
            const { error } = await Database.client
                .from('onboarding_platforms')
                .delete()
                .eq('id', platformId);
            
            if (error) throw error;
            
            Utils?.toast?.('Platforma odstránená', 'success');
            await this.loadPlatforms();
            this.setActiveTab('platforms');
        } catch (error) {
            Utils?.toast?.('Chyba: ' + error.message, 'error');
        }
    }
};

// Register
if (typeof ModuleLoader !== 'undefined') {
    ModuleLoader.register(OnboardingSettingsModule);
}

window.OnboardingSettingsModule = OnboardingSettingsModule;
