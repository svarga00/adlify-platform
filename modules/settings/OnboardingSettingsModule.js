/**
 * ADLIFY PLATFORM - Onboarding Settings Module
 * 
 * Admin modul pre správu nastavení onboardingu:
 * - Platformy (pridávanie/odoberanie/editácia)
 * - Prepojenie na balíky z DB
 * - Kroky onboardingu
 * - Texty a popisky
 */

const OnboardingSettingsModule = {
    
    // ==========================================
    // STAV MODULU
    // ==========================================
    
    state: {
        platforms: [],
        packages: [],        // Načítané z DB
        sections: [],        // Kroky onboardingu
        recommendations: {}, // Odporúčania podľa typu klienta
        isLoading: false,
        activeTab: 'platforms'
    },
    
    // ==========================================
    // INICIALIZÁCIA
    // ==========================================
    
    async init() {
        console.log('⚙️ Initializing Onboarding Settings Module...');
        
        this.state.isLoading = true;
        this.render();
        
        try {
            // Načítaj dáta paralelne
            await Promise.all([
                this.loadPlatforms(),
                this.loadPackages(),
                this.loadSections(),
                this.loadRecommendations()
            ]);
            
            console.log('✅ Onboarding Settings loaded');
        } catch (error) {
            console.error('❌ Error loading settings:', error);
            Utils?.toast?.('Chyba pri načítaní nastavení', 'error');
        }
        
        this.state.isLoading = false;
        this.render();
    },
    
    // ==========================================
    // NAČÍTANIE DÁT
    // ==========================================
    
    async loadPlatforms() {
        // TODO: Načítať z Supabase
        // const { data, error } = await supabase.from('onboarding_platforms').select('*').order('sort_order');
        
        // Zatiaľ hardcoded - nahradí sa DB
        this.state.platforms = [
            {
                id: 'google_ads',
                name: 'Google Ads',
                short_desc: 'Search, Display, YouTube, Shopping',
                color: '#4285F4',
                icon_svg: 'google_ads',
                enabled: true,
                sort_order: 1
            },
            {
                id: 'meta_ads',
                name: 'Meta Ads',
                subtitle: 'Facebook + Instagram',
                short_desc: 'Facebook, Instagram - Feed, Stories, Reels',
                color: '#0081FB',
                icon_svg: 'meta_ads',
                enabled: true,
                sort_order: 2
            },
            {
                id: 'linkedin_ads',
                name: 'LinkedIn Ads',
                short_desc: 'B2B reklamy pre profesionálov',
                color: '#0A66C2',
                icon_svg: 'linkedin_ads',
                enabled: true,
                sort_order: 3
            },
            {
                id: 'tiktok_ads',
                name: 'TikTok Ads',
                short_desc: 'Video reklamy pre mladšiu cieľovku',
                color: '#000000',
                icon_svg: 'tiktok_ads',
                enabled: true,
                sort_order: 4
            }
        ];
    },
    
    async loadPackages() {
        // TODO: Načítať z existujúcej tabuľky balíkov
        // const { data, error } = await supabase.from('packages').select('*').order('sort_order');
        
        // Placeholder - nahradí sa skutočným dopytom
        this.state.packages = [];
        
        // Ak máš API endpoint:
        // const response = await fetch('/api/packages');
        // this.state.packages = await response.json();
    },
    
    async loadSections() {
        // TODO: Načítať z DB alebo config
        this.state.sections = [
            { id: 1, key: 'company', title: 'Základné informácie', icon: '🏢', enabled: true, required: true },
            { id: 2, key: 'products', title: 'Produkty a služby', icon: '📦', enabled: true, required: true },
            { id: 3, key: 'audience', title: 'Cieľová skupina', icon: '🎯', enabled: true, required: true },
            { id: 4, key: 'package', title: 'Výber balíka', icon: '💎', enabled: true, required: true, isNew: true },
            { id: 5, key: 'platforms', title: 'Reklamné platformy', icon: '📱', enabled: true, required: true, isNew: true },
            { id: 6, key: 'marketing', title: 'Aktuálny marketing', icon: '📊', enabled: true, required: false },
            { id: 7, key: 'goals', title: 'Ciele a očakávania', icon: '🚀', enabled: true, required: true },
            { id: 8, key: 'creative', title: 'Obsah a kreatíva', icon: '🎨', enabled: true, required: false },
            { id: 9, key: 'technical', title: 'Technické možnosti', icon: '⚙️', enabled: true, required: false, isNew: true },
            { id: 10, key: 'contact', title: 'Kontaktné údaje', icon: '👤', enabled: true, required: true },
            { id: 11, key: 'additional', title: 'Dodatočné info', icon: '📝', enabled: true, required: false }
        ];
    },
    
    async loadRecommendations() {
        this.state.recommendations = {
            local_business: { platforms: ['google_ads', 'meta_ads'], message: 'Pre lokálne služby odporúčame Google Ads + Meta Ads' },
            ecommerce: { platforms: ['google_ads', 'meta_ads'], message: 'Pre e-shop odporúčame Google Ads + Meta Ads' },
            b2b: { platforms: ['google_ads', 'linkedin_ads'], message: 'Pre B2B odporúčame Google Ads + LinkedIn Ads' },
            startup: { platforms: ['meta_ads', 'tiktok_ads'], message: 'Pre startup odporúčame Meta Ads + TikTok Ads' }
        };
    },
    
    // ==========================================
    // UKLADANIE
    // ==========================================
    
    async savePlatform(platform) {
        try {
            // TODO: Uložiť do Supabase
            // const { data, error } = await supabase.from('onboarding_platforms').upsert(platform);
            
            Utils?.toast?.('Platforma uložená', 'success');
            await this.loadPlatforms();
            this.render();
        } catch (error) {
            console.error('Error saving platform:', error);
            Utils?.toast?.('Chyba pri ukladaní', 'error');
        }
    },
    
    async deletePlatform(platformId) {
        if (!confirm('Naozaj chcete odstrániť túto platformu?')) return;
        
        try {
            // TODO: Odstrániť z Supabase
            // const { error } = await supabase.from('onboarding_platforms').delete().eq('id', platformId);
            
            Utils?.toast?.('Platforma odstránená', 'success');
            await this.loadPlatforms();
            this.render();
        } catch (error) {
            console.error('Error deleting platform:', error);
            Utils?.toast?.('Chyba pri odstraňovaní', 'error');
        }
    },
    
    async togglePlatform(platformId, enabled) {
        const platform = this.state.platforms.find(p => p.id === platformId);
        if (platform) {
            platform.enabled = enabled;
            await this.savePlatform(platform);
        }
    },
    
    async saveSection(section) {
        try {
            // TODO: Uložiť do DB
            Utils?.toast?.('Sekcia uložená', 'success');
            this.render();
        } catch (error) {
            Utils?.toast?.('Chyba pri ukladaní', 'error');
        }
    },
    
    async toggleSection(sectionId, enabled) {
        const section = this.state.sections.find(s => s.id === sectionId);
        if (section && !section.required) {
            section.enabled = enabled;
            await this.saveSection(section);
        }
    },
    
    // ==========================================
    // HLAVNÝ RENDER
    // ==========================================
    
    render() {
        const container = document.getElementById('settings-content') || document.getElementById('main-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="onboarding-settings">
                <div class="onboarding-settings__header">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-800">Nastavenia onboardingu</h1>
                        <p class="text-gray-500 mt-1">Spravujte platformy, kroky a nastavenia onboarding dotazníka</p>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="onboarding-settings__tabs">
                    ${this.renderTabs()}
                </div>
                
                <!-- Content -->
                <div class="onboarding-settings__content">
                    ${this.state.isLoading ? this.renderLoading() : this.renderActiveTab()}
                </div>
            </div>
        `;
        
        this.attachEventListeners();
    },
    
    renderTabs() {
        const tabs = [
            { id: 'platforms', label: 'Platformy', icon: '📱' },
            { id: 'packages', label: 'Balíky', icon: '💎' },
            { id: 'sections', label: 'Kroky', icon: '📋' },
            { id: 'recommendations', label: 'Odporúčania', icon: '🎯' }
        ];
        
        return `
            <div class="flex gap-2 border-b border-gray-200 pb-0">
                ${tabs.map(tab => `
                    <button class="px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px
                        ${this.state.activeTab === tab.id 
                            ? 'text-orange-600 border-orange-500' 
                            : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'}"
                        onclick="OnboardingSettingsModule.setActiveTab('${tab.id}')">
                        <span class="mr-2">${tab.icon}</span>
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
        `;
    },
    
    renderActiveTab() {
        switch (this.state.activeTab) {
            case 'platforms': return this.renderPlatformsTab();
            case 'packages': return this.renderPackagesTab();
            case 'sections': return this.renderSectionsTab();
            case 'recommendations': return this.renderRecommendationsTab();
            default: return '';
        }
    },
    
    renderLoading() {
        return `
            <div class="flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                <span class="ml-3 text-gray-500">Načítavam...</span>
            </div>
        `;
    },
    
    setActiveTab(tabId) {
        this.state.activeTab = tabId;
        this.render();
    },
    
    // ==========================================
    // TAB: PLATFORMY
    // ==========================================
    
    renderPlatformsTab() {
        return `
            <div class="py-6">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-lg font-semibold text-gray-800">Reklamné platformy</h2>
                        <p class="text-sm text-gray-500">Spravujte platformy, ktoré sa zobrazujú v onboarding dotazníku</p>
                    </div>
                    <button class="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                        onclick="OnboardingSettingsModule.showPlatformModal()">
                        + Pridať platformu
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
                        <tbody class="divide-y divide-gray-100">
                            ${this.state.platforms.map(platform => this.renderPlatformRow(platform)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },
    
    renderPlatformRow(platform) {
        return `
            <tr class="hover:bg-gray-50 ${!platform.enabled ? 'opacity-50' : ''}">
                <td class="px-4 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center" 
                             style="background: ${platform.color}20">
                            <div class="w-6 h-6 rounded" style="background: ${platform.color}"></div>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${platform.name}</p>
                            ${platform.subtitle ? `<p class="text-xs text-gray-500">${platform.subtitle}</p>` : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4">
                    <p class="text-sm text-gray-600">${platform.short_desc}</p>
                </td>
                <td class="px-4 py-4 text-center">
                    <span class="text-sm text-gray-500">${platform.sort_order}</span>
                </td>
                <td class="px-4 py-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer" 
                               ${platform.enabled ? 'checked' : ''}
                               onchange="OnboardingSettingsModule.togglePlatform('${platform.id}', this.checked)">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer 
                                    peer-checked:after:translate-x-full peer-checked:after:border-white 
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                    after:bg-white after:border-gray-300 after:border after:rounded-full 
                                    after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                </td>
                <td class="px-4 py-4 text-right">
                    <button class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                            onclick="OnboardingSettingsModule.showPlatformModal('${platform.id}')">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            onclick="OnboardingSettingsModule.deletePlatform('${platform.id}')">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    },
    
    // ==========================================
    // TAB: BALÍKY (z DB)
    // ==========================================
    
    renderPackagesTab() {
        return `
            <div class="py-6">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-lg font-semibold text-gray-800">Balíky služieb</h2>
                        <p class="text-sm text-gray-500">Balíky sa načítavajú z hlavnej sekcie "Balíky"</p>
                    </div>
                    <a href="#packages" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                        Spravovať balíky →
                    </a>
                </div>
                
                ${this.state.packages.length === 0 ? `
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                        <span class="text-3xl mb-3 block">📦</span>
                        <h3 class="font-semibold text-amber-800 mb-2">Balíky nie sú načítané</h3>
                        <p class="text-sm text-amber-700 mb-4">
                            Skontrolujte pripojenie k databáze alebo vytvorte balíky v sekcii "Balíky".
                        </p>
                        <button class="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600"
                                onclick="OnboardingSettingsModule.loadPackages().then(() => OnboardingSettingsModule.render())">
                            Obnoviť
                        </button>
                    </div>
                ` : `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        ${this.state.packages.map(pkg => this.renderPackageCard(pkg)).join('')}
                    </div>
                `}
                
                <!-- Mapovanie platforiem na balíky -->
                <div class="mt-8">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">Limit platforiem podľa balíka</h3>
                    <p class="text-sm text-gray-500 mb-4">Nastavte koľko platforiem môže zákazník vybrať v každom balíku</p>
                    
                    <div class="bg-white rounded-xl border overflow-hidden">
                        <table class="w-full">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balík</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. platforiem</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. kampaní</th>
                                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max. vizuálov</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                <tr>
                                    <td class="px-4 py-3 font-medium">Starter</td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="1"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="1"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="2"></td>
                                </tr>
                                <tr>
                                    <td class="px-4 py-3 font-medium">Pro</td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="2"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="3"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="4"></td>
                                </tr>
                                <tr>
                                    <td class="px-4 py-3 font-medium">Enterprise</td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="0" placeholder="∞"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="5"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="8"></td>
                                </tr>
                                <tr>
                                    <td class="px-4 py-3 font-medium">Premium</td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="0" placeholder="∞"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="0" placeholder="∞"></td>
                                    <td class="px-4 py-3 text-center"><input type="number" class="w-20 px-2 py-1 border rounded text-center" value="0" placeholder="∞"></td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="px-4 py-3 bg-gray-50 border-t text-right">
                            <span class="text-xs text-gray-500 mr-4">0 = neobmedzené</span>
                            <button class="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600">
                                Uložiť limity
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderPackageCard(pkg) {
        return `
            <div class="bg-white rounded-xl border p-4">
                <div class="flex items-center gap-3 mb-3">
                    <span class="text-2xl">${pkg.icon || '📦'}</span>
                    <div>
                        <h4 class="font-semibold text-gray-800">${pkg.name}</h4>
                        <p class="text-lg font-bold text-gray-900">${pkg.price}€/mes</p>
                    </div>
                </div>
                <p class="text-sm text-gray-500">${pkg.description || ''}</p>
            </div>
        `;
    },
    
    // ==========================================
    // TAB: KROKY (SEKCIE)
    // ==========================================
    
    renderSectionsTab() {
        return `
            <div class="py-6">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-lg font-semibold text-gray-800">Kroky onboardingu</h2>
                        <p class="text-sm text-gray-500">Zapnite/vypnite sekcie a zmeňte ich poradie</p>
                    </div>
                </div>
                
                <div class="bg-white rounded-xl border overflow-hidden">
                    <div class="divide-y divide-gray-100" id="sections-sortable">
                        ${this.state.sections.map(section => this.renderSectionRow(section)).join('')}
                    </div>
                </div>
                
                <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p class="text-sm text-blue-800">
                        <strong>💡 Tip:</strong> Povinné sekcie (označené 🔒) nie je možné vypnúť. 
                        Drag & drop pre zmenu poradia bude dostupný v ďalšej verzii.
                    </p>
                </div>
            </div>
        `;
    },
    
    renderSectionRow(section) {
        return `
            <div class="flex items-center gap-4 p-4 hover:bg-gray-50 ${!section.enabled ? 'opacity-50' : ''}">
                <div class="flex-shrink-0 cursor-move text-gray-300">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                    </svg>
                </div>
                
                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                    ${section.icon}
                </div>
                
                <div class="flex-1">
                    <p class="font-medium text-gray-800">
                        ${section.title}
                        ${section.required ? '<span class="ml-2 text-amber-500" title="Povinná sekcia">🔒</span>' : ''}
                        ${section.isNew ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Nové</span>' : ''}
                    </p>
                    <p class="text-sm text-gray-500">Krok ${section.id} • ${section.key}</p>
                </div>
                
                <div class="flex items-center gap-4">
                    <label class="relative inline-flex items-center cursor-pointer ${section.required ? 'opacity-50 pointer-events-none' : ''}">
                        <input type="checkbox" class="sr-only peer" 
                               ${section.enabled ? 'checked' : ''}
                               ${section.required ? 'disabled' : ''}
                               onchange="OnboardingSettingsModule.toggleSection(${section.id}, this.checked)">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer 
                                    peer-checked:after:translate-x-full peer-checked:after:border-white 
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                    after:bg-white after:border-gray-300 after:border after:rounded-full 
                                    after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                    
                    <button class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                            onclick="OnboardingSettingsModule.showSectionModal(${section.id})">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    },
    
    // ==========================================
    // TAB: ODPORÚČANIA
    // ==========================================
    
    renderRecommendationsTab() {
        const clientTypes = [
            { id: 'local_business', name: 'Lokálne služby', icon: '🏪' },
            { id: 'ecommerce', name: 'E-commerce', icon: '🛒' },
            { id: 'b2b', name: 'B2B', icon: '🏢' },
            { id: 'startup', name: 'Startup', icon: '🚀' }
        ];
        
        return `
            <div class="py-6">
                <div class="mb-6">
                    <h2 class="text-lg font-semibold text-gray-800">Odporúčania platforiem</h2>
                    <p class="text-sm text-gray-500">Nastavte aké platformy odporúčať podľa typu klienta</p>
                </div>
                
                <div class="space-y-4">
                    ${clientTypes.map(type => {
                        const rec = this.state.recommendations[type.id] || { platforms: [], message: '' };
                        return `
                            <div class="bg-white rounded-xl border p-5">
                                <div class="flex items-center gap-3 mb-4">
                                    <span class="text-2xl">${type.icon}</span>
                                    <div>
                                        <h3 class="font-semibold text-gray-800">${type.name}</h3>
                                        <p class="text-sm text-gray-500">${type.id}</p>
                                    </div>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Odporúčané platformy</label>
                                    <div class="flex flex-wrap gap-2">
                                        ${this.state.platforms.filter(p => p.enabled).map(platform => `
                                            <label class="inline-flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50
                                                ${rec.platforms.includes(platform.id) ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}">
                                                <input type="checkbox" class="sr-only"
                                                    ${rec.platforms.includes(platform.id) ? 'checked' : ''}
                                                    onchange="OnboardingSettingsModule.toggleRecommendation('${type.id}', '${platform.id}', this.checked)">
                                                <span class="text-sm font-medium">${platform.name}</span>
                                                ${rec.platforms.includes(platform.id) ? '<span class="text-orange-500">✓</span>' : ''}
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Správa pre klienta</label>
                                    <input type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg"
                                        value="${rec.message}"
                                        onchange="OnboardingSettingsModule.updateRecommendationMessage('${type.id}', this.value)"
                                        placeholder="Napr. Pre e-shop odporúčame Google Ads + Meta Ads">
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div class="mt-6 text-right">
                    <button class="px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
                            onclick="OnboardingSettingsModule.saveRecommendations()">
                        Uložiť odporúčania
                    </button>
                </div>
            </div>
        `;
    },
    
    toggleRecommendation(clientType, platformId, checked) {
        if (!this.state.recommendations[clientType]) {
            this.state.recommendations[clientType] = { platforms: [], message: '' };
        }
        
        const platforms = this.state.recommendations[clientType].platforms;
        if (checked && !platforms.includes(platformId)) {
            platforms.push(platformId);
        } else if (!checked) {
            const index = platforms.indexOf(platformId);
            if (index > -1) platforms.splice(index, 1);
        }
        
        this.render();
    },
    
    updateRecommendationMessage(clientType, message) {
        if (!this.state.recommendations[clientType]) {
            this.state.recommendations[clientType] = { platforms: [], message: '' };
        }
        this.state.recommendations[clientType].message = message;
    },
    
    async saveRecommendations() {
        try {
            // TODO: Uložiť do DB
            console.log('Saving recommendations:', this.state.recommendations);
            Utils?.toast?.('Odporúčania uložené', 'success');
        } catch (error) {
            Utils?.toast?.('Chyba pri ukladaní', 'error');
        }
    },
    
    // ==========================================
    // MODAL: PLATFORMA
    // ==========================================
    
    showPlatformModal(platformId = null) {
        const platform = platformId ? this.state.platforms.find(p => p.id === platformId) : null;
        const isEdit = !!platform;
        
        const modalHtml = `
            <div class="adlify-modal-overlay" id="platformSettingsModal" onclick="OnboardingSettingsModule.closePlatformModal(event)">
                <div class="adlify-modal adlify-modal--lg" onclick="event.stopPropagation()">
                    <div class="adlify-modal__header" style="background: ${platform?.color || '#F97316'}">
                        <button class="adlify-modal__close" onclick="OnboardingSettingsModule.closePlatformModal()">✕</button>
                        <h2 class="text-xl font-bold text-white">${isEdit ? 'Upraviť platformu' : 'Nová platforma'}</h2>
                    </div>
                    
                    <div class="adlify-modal__body">
                        <form id="platformForm" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">ID (jedinečný identifikátor)</label>
                                <input type="text" name="id" value="${platform?.id || ''}" 
                                    class="w-full px-3 py-2 border rounded-lg ${isEdit ? 'bg-gray-100' : ''}"
                                    ${isEdit ? 'readonly' : 'required'}
                                    placeholder="napr. google_ads">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Názov</label>
                                <input type="text" name="name" value="${platform?.name || ''}" 
                                    class="w-full px-3 py-2 border rounded-lg" required
                                    placeholder="napr. Google Ads">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Podnázov (voliteľné)</label>
                                <input type="text" name="subtitle" value="${platform?.subtitle || ''}" 
                                    class="w-full px-3 py-2 border rounded-lg"
                                    placeholder="napr. Facebook + Instagram">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Krátky popis</label>
                                <input type="text" name="short_desc" value="${platform?.short_desc || ''}" 
                                    class="w-full px-3 py-2 border rounded-lg" required
                                    placeholder="napr. Search, Display, YouTube, Shopping">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Farba</label>
                                <div class="flex gap-2">
                                    <input type="color" name="color" value="${platform?.color || '#F97316'}" 
                                        class="w-12 h-10 border rounded-lg cursor-pointer">
                                    <input type="text" value="${platform?.color || '#F97316'}" 
                                        class="flex-1 px-3 py-2 border rounded-lg"
                                        onchange="this.previousElementSibling.value = this.value">
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Poradie</label>
                                <input type="number" name="sort_order" value="${platform?.sort_order || this.state.platforms.length + 1}" 
                                    class="w-full px-3 py-2 border rounded-lg" min="1">
                            </div>
                            
                            <div class="flex items-center gap-2">
                                <input type="checkbox" name="enabled" id="platform_enabled" 
                                    ${platform?.enabled !== false ? 'checked' : ''}>
                                <label for="platform_enabled" class="text-sm text-gray-700">Platforma je aktívna</label>
                            </div>
                        </form>
                    </div>
                    
                    <div class="adlify-modal__footer flex gap-3">
                        <button class="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                                onclick="OnboardingSettingsModule.closePlatformModal()">
                            Zrušiť
                        </button>
                        <button class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
                                onclick="OnboardingSettingsModule.savePlatformFromModal()">
                            ${isEdit ? 'Uložiť zmeny' : 'Pridať platformu'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            document.getElementById('platformSettingsModal')?.classList.add('adlify-modal-overlay--visible');
        });
    },
    
    closePlatformModal(event) {
        if (event && event.target !== event.currentTarget) return;
        const modal = document.getElementById('platformSettingsModal');
        if (modal) {
            modal.classList.remove('adlify-modal-overlay--visible');
            setTimeout(() => { modal.remove(); document.body.style.overflow = ''; }, 200);
        }
    },
    
    savePlatformFromModal() {
        const form = document.getElementById('platformForm');
        const formData = new FormData(form);
        
        const platform = {
            id: formData.get('id'),
            name: formData.get('name'),
            subtitle: formData.get('subtitle') || null,
            short_desc: formData.get('short_desc'),
            color: formData.get('color'),
            sort_order: parseInt(formData.get('sort_order')),
            enabled: form.querySelector('[name="enabled"]').checked
        };
        
        if (!platform.id || !platform.name) {
            Utils?.toast?.('Vyplňte povinné polia', 'warning');
            return;
        }
        
        this.savePlatform(platform);
        this.closePlatformModal();
    },
    
    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    
    attachEventListeners() {
        // Tu môžu byť ďalšie event listenery
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnboardingSettingsModule;
} else {
    window.OnboardingSettingsModule = OnboardingSettingsModule;
}
