/**
 * ADLIFY - Keyword Research Module
 * SEO/PPC keyword analýza s Marketing Miner
 */

const KeywordResearchModule = {
    id: 'keywords',
    name: 'Keywords',
    icon: '🔍',
    title: 'Keyword Research',
    menu: { section: 'tools', order: 59 },
    permissions: ['keywords', 'view'],

    // Data
    searches: [],
    currentSearch: null,
    clients: [],

    async init() {
        console.log('🔍 Keyword Research module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="adl keywords-module">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap;">
                    <div>
                        <h1 style="font-size:22px; font-weight:700; letter-spacing:-0.4px; margin:0 0 2px;">Keyword Research</h1>
                        <div style="font-size:13px; color:var(--ink-sub);">SEO a PPC analýza kľúčových slov</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="adl-btn adl-btn-primary adl-btn-sm" onclick="KeywordResearchModule.showNewSearch()">${I.Search({size:14})} Nový výskum</button>
                    </div>
                </div>

                <!-- Quick Search -->
                <div class="adl-card" style="margin-bottom:16px;">
                    <div class="adl-card-body" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                        <div class="adl-input" style="flex:1; min-width:240px;">
                            <span style="color:var(--ink-mute); display:flex;">${I.Search({size:15})}</span>
                            <input type="text" id="quick-keyword" placeholder="Zadaj kľúčové slovo…" onkeypress="if(event.key==='Enter') KeywordResearchModule.quickSearch()" style="flex:1; border:0; outline:none; background:transparent; font:inherit; color:inherit;">
                        </div>
                        <select class="adl-input" id="quick-country" style="width:auto;">
                            <option value="sk">Slovensko</option>
                            <option value="cz">Česko</option>
                            <option value="hu">Maďarsko</option>
                            <option value="at">Rakúsko</option>
                            <option value="de">Nemecko</option>
                        </select>
                        <button class="adl-btn adl-btn-primary" onclick="KeywordResearchModule.quickSearch()">Hľadať</button>
                    </div>
                </div>

                <!-- Results -->
                <div id="keywords-content">
                    <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                        <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Key({size:22})}</div>
                        <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Začnite výskum kľúčových slov</h3>
                        <p style="font-size:13px; color:var(--ink-sub); margin:0 0 14px;">Zadajte seed keyword a získajte návrhy s objemom vyhľadávania, CPC a konkurenciou</p>
                        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                            <span class="adl-chip adl-chip-sky">${I.Chart({size:12})} Search Volume</span>
                            <span class="adl-chip adl-chip-brand">${I.Money({size:12})} CPC odhad</span>
                            <span class="adl-chip adl-chip-amber">${I.Target({size:12})} Konkurencia</span>
                            <span class="adl-chip adl-chip-lav">${I.Sparkle({size:12})} Návrhy</span>
                        </div>
                    </div>
                </div>

                <!-- History -->
                <div class="adl-card" id="search-history" style="margin-top:16px;">
                    <div class="adl-card-header"><div class="adl-card-title">Posledné výskumy</div></div>
                    <div id="history-list" class="adl-card-body" style="padding:8px;"></div>
                </div>
            </div>
        `;

        await this.loadHistory();
        await this.loadClients();
    },

    async loadClients() {
        const { data } = await Database.client
            .from('clients')
            .select('id, company_name')
            .eq('status', 'active');
        this.clients = data || [];
    },

    async loadHistory() {
        try {
            const { data, error } = await Database.client
                .from('keyword_searches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            this.searches = data || [];
            this.renderHistory();
        } catch (error) {
            console.error('Load history error:', error);
        }
    },

    renderHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;

        if (this.searches.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--ink-mute); font-size:13px;">Zatiaľ žiadne výskumy</div>';
            return;
        }

        const countryLabel = { sk: 'SK', cz: 'CZ', hu: 'HU', at: 'AT', de: 'DE' };

        container.innerHTML = this.searches.map((s, i) => `
            <div onclick="KeywordResearchModule.loadSearch('${s.id}')" style="display:flex; align-items:center; gap:12px; padding:10px 14px; ${i > 0 ? 'border-top:1px solid var(--border);' : ''} cursor:pointer; transition: background .12s;" onmouseover="this.style.background='var(--n-50)'" onmouseout="this.style.background='transparent'">
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.seed_keyword}</div>
                    <div style="display:flex; align-items:center; gap:10px; font-size:11px; color:var(--ink-mute); margin-top:2px;">
                        <span class="adl-chip adl-chip-sm">${countryLabel[s.country] || s.country}</span>
                        <span>${s.results_count || 0} výsledkov</span>
                        <span>${this.formatDate(s.created_at)}</span>
                    </div>
                </div>
                <span style="color:var(--ink-mute); display:inline-flex;">${I.Chevron({size:14})}</span>
            </div>
        `).join('');
    },

    async quickSearch() {
        const keyword = document.getElementById('quick-keyword').value.trim();
        const country = document.getElementById('quick-country').value;

        if (!keyword) {
            Utils.showNotification('Zadaj kľúčové slovo', 'error');
            return;
        }

        await this.performSearch(keyword, country);
    },

    showNewSearch() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal keyword-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">🔍</span>
                        <h2>Nový keyword výskum</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="keyword-form">
                        <div class="form-group">
                            <label>Seed keyword *</label>
                            <input type="text" name="keyword" required placeholder="Napr. marketing agency">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Krajina</label>
                                <select name="country">
                                    <option value="sk">🇸🇰 Slovensko</option>
                                    <option value="cz">🇨🇿 Česko</option>
                                    <option value="hu">🇭🇺 Maďarsko</option>
                                    <option value="at">🇦🇹 Rakúsko</option>
                                    <option value="de">🇩🇪 Nemecko</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Typ výskumu</label>
                                <select name="type">
                                    <option value="suggestions">Návrhy keywords</option>
                                    <option value="related">Súvisiace</option>
                                    <option value="questions">Otázky</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Pre klienta (voliteľné)</label>
                            <select name="client_id">
                                <option value="">-- Interný výskum --</option>
                                ${this.clients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
                            </select>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="KeywordResearchModule.startSearch()">
                        🔍 Spustiť výskum
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async startSearch() {
        const form = document.getElementById('keyword-form');
        const formData = new FormData(form);
        
        const keyword = formData.get('keyword');
        const country = formData.get('country');
        
        document.querySelector('.modal-overlay').remove();
        await this.performSearch(keyword, country, formData.get('client_id'));
    },

    async performSearch(keyword, country, clientId = null) {
        const content = document.getElementById('keywords-content');
        content.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Analyzujem "${keyword}"...</p>
                <p class="loading-sub">Získavam dáta z Marketing Miner</p>
            </div>
        `;

        try {
            // Volanie Marketing Miner API (cez Make.com webhook alebo priamo)
            const results = await this.callMarketingMiner(keyword, country);
            
            // Uložiť do DB
            const { data: search, error } = await Database.client
                .from('keyword_searches')
                .insert([{
                    seed_keyword: keyword,
                    country: country,
                    client_id: clientId || null,
                    results: results,
                    results_count: results.length,
                    created_by: Auth.teamMember?.id
                }])
                .select()
                .single();

            if (error) throw error;

            this.currentSearch = search;
            this.renderResults(results, keyword);
            await this.loadHistory();

        } catch (error) {
            console.error('Search error:', error);
            content.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Chyba pri vyhľadávaní</h3>
                    <p>${error.message || 'Skúste to znova neskôr'}</p>
                    <button class="btn-secondary" onclick="KeywordResearchModule.render(document.getElementById('module-content'))">
                        Skúsiť znova
                    </button>
                </div>
            `;
        }
    },

    async callMarketingMiner(keyword, country) {
        // V produkcii by tu bolo volanie Marketing Miner API
        // Pre demo vrátime mock dáta
        
        // Simulácia API delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock výsledky
        const mockResults = this.generateMockResults(keyword, country);
        return mockResults;
    },

    generateMockResults(seedKeyword, country) {
        const suffixes = [
            '', ' cena', ' recenzie', ' najlepšie', ' lacné', ' online',
            ' služby', ' firma', ' agentúra', ' kvalitné', ' profesionálne'
        ];
        
        const prefixes = ['', 'najlepšie ', 'lacné ', 'kvalitné ', 'profesionálne '];
        
        const results = [];
        
        // Generuj variácie
        suffixes.forEach((suffix, i) => {
            prefixes.slice(0, 3).forEach((prefix, j) => {
                const kw = (prefix + seedKeyword + suffix).trim();
                if (kw && !results.find(r => r.keyword === kw)) {
                    results.push({
                        keyword: kw,
                        search_volume: Math.floor(Math.random() * 5000) + 100,
                        cpc: (Math.random() * 2 + 0.1).toFixed(2),
                        competition: Math.random().toFixed(2),
                        trend: Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable'
                    });
                }
            });
        });
        
        // Zoradiť podľa search volume
        return results.sort((a, b) => b.search_volume - a.search_volume).slice(0, 30);
    },

    renderResults(results, keyword) {
        const content = document.getElementById('keywords-content');

        if (!results || results.length === 0) {
            content.innerHTML = `
                <div style="padding:48px 24px; text-align:center; color:var(--ink-sub); background:var(--surface); border:1px solid var(--border); border-radius:14px;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--n-75); color:var(--ink-mute); margin-bottom:12px;">${I.Search({size:22})}</div>
                    <h3 style="font-size:15px; font-weight:600; color:var(--ink); margin:0 0 4px;">Žiadne výsledky</h3>
                    <p style="font-size:13px; color:var(--ink-sub); margin:0;">Pre „${keyword}" sme nenašli žiadne návrhy</p>
                </div>
            `;
            return;
        }

        const maxVol = Math.max(1, ...results.map(r => r.search_volume || 0));

        content.innerHTML = `
            <div class="adl-card">
                <div class="adl-card-header" style="flex-wrap:wrap; gap:10px;">
                    <div>
                        <div class="adl-card-title">Výsledky pre „${keyword}"</div>
                        <div style="font-size:11px; color:var(--ink-mute); margin-top:2px;">${results.length} kľúčových slov</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="adl-btn adl-btn-soft adl-btn-sm" onclick="KeywordResearchModule.exportResults()">${I.Download({size:14})} Export CSV</button>
                        <button class="adl-btn adl-btn-soft adl-btn-sm" onclick="KeywordResearchModule.saveToProject()">${I.Folder({size:14})} Uložiť do projektu</button>
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="adl-table">
                        <thead>
                            <tr>
                                <th style="width:32px;"><input type="checkbox" onchange="KeywordResearchModule.selectAll(this)"></th>
                                <th>Kľúčové slovo</th>
                                <th style="text-align:right;">Hľadanosť/mes</th>
                                <th style="text-align:right;">CPC</th>
                                <th>Konkurencia</th>
                                <th style="width:48px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.map((r, i) => {
                                const widthPct = Math.round(((r.search_volume || 0) / maxVol) * 100);
                                const compPct = Math.round((r.competition || 0) * 100);
                                const compTone = compPct >= 70 ? 'err' : compPct >= 40 ? 'amber' : 'mint';
                                return `
                                <tr>
                                    <td><input type="checkbox" class="kw-checkbox" data-index="${i}"></td>
                                    <td><strong style="font-size:13px;">${r.keyword}</strong></td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; align-items:center; gap:6px;">
                                            <span style="display:inline-block; height:6px; background:linear-gradient(90deg, var(--brand-500), var(--brand-700)); border-radius:3px; width:${Math.max(10, widthPct * 0.8)}px;"></span>
                                            <span class="mono">${this.formatNumber(r.search_volume || 0)}</span>
                                        </div>
                                    </td>
                                    <td style="text-align:right;" class="mono">${(r.cpc || 0).toFixed(2)}&nbsp;€</td>
                                    <td>
                                        <div style="display:inline-flex; align-items:center; gap:6px;">
                                            <div style="width:60px; height:4px; background:var(--n-100); border-radius:99px; overflow:hidden;">
                                                <div style="width:${compPct}%; height:100%; background:var(--${compTone === 'err' ? 'err' : compTone === 'amber' ? 'warn' : 'ok'});"></div>
                                            </div>
                                            <span style="font-size:11px; color:var(--ink-sub);">${compPct}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button class="adl-btn adl-btn-ghost adl-btn-sm" onclick="KeywordResearchModule.copyKeyword('${r.keyword}')" title="Kopírovať" style="padding:0 8px;">${I.Copy({size:12})}</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async loadSearch(searchId) {
        const search = this.searches.find(s => s.id === searchId);
        if (search && search.results) {
            this.currentSearch = search;
            this.renderResults(search.results, search.seed_keyword);
        }
    },

    selectAll(checkbox) {
        document.querySelectorAll('.kw-checkbox').forEach(cb => {
            cb.checked = checkbox.checked;
        });
    },

    copyKeyword(keyword) {
        navigator.clipboard.writeText(keyword);
        Utils.showNotification('Skopírované', 'success');
    },

    exportResults() {
        if (!this.currentSearch?.results) return;
        
        const csv = [
            ['Keyword', 'Search Volume', 'CPC', 'Competition', 'Trend'].join(','),
            ...this.currentSearch.results.map(r => 
                [r.keyword, r.search_volume, r.cpc, r.competition, r.trend].join(',')
            )
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keywords-${this.currentSearch.seed_keyword}-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        Utils.showNotification('CSV exportovaný', 'success');
    },

    saveToProject() {
        Utils.showNotification('Funkcia bude dostupná čoskoro', 'info');
    },

    getTrendIcon(trend) {
        const icons = {
            up: '<span class="trend-up">📈</span>',
            down: '<span class="trend-down">📉</span>',
            stable: '<span class="trend-stable">➡️</span>'
        };
        return icons[trend] || icons.stable;
    },

    getCountryFlag(country) {
        const flags = {
            sk: '🇸🇰',
            cz: '🇨🇿',
            hu: '🇭🇺',
            at: '🇦🇹',
            de: '🇩🇪'
        };
        return flags[country] || '🌍';
    },

    formatNumber(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('sk-SK');
    },

    getStyles() {
        return `
            <style>
                .keywords-module {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .module-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2rem;
                }

                .header-left h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    margin: 0;
                }

                .subtitle {
                    color: #64748b;
                    margin-top: 0.25rem;
                }

                .btn-primary {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                }

                /* Quick Search */
                .quick-search-card {
                    background: white;
                    border-radius: 16px;
                    padding: 1.5rem;
                    margin-bottom: 2rem;
                    border: 1px solid #e2e8f0;
                }

                .search-input-wrapper {
                    display: flex;
                    gap: 0.75rem;
                }

                .search-input-wrapper input {
                    flex: 1;
                    padding: 0.875rem 1rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 1rem;
                }

                .search-input-wrapper input:focus {
                    outline: none;
                    border-color: #6366f1;
                }

                .search-input-wrapper select {
                    padding: 0.875rem 1rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 10px;
                    background: white;
                    min-width: 150px;
                }

                .btn-search {
                    padding: 0.875rem 2rem;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .btn-search:hover {
                    background: #4f46e5;
                }

                /* Placeholder */
                .keywords-placeholder {
                    text-align: center;
                    padding: 4rem 2rem;
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                }

                .placeholder-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .keywords-placeholder h3 {
                    font-size: 1.25rem;
                    margin: 0 0 0.5rem 0;
                }

                .keywords-placeholder p {
                    color: #64748b;
                    margin: 0;
                }

                .features-grid {
                    display: flex;
                    justify-content: center;
                    gap: 2rem;
                    margin-top: 2rem;
                }

                .feature {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                }

                .feature-icon {
                    font-size: 1.5rem;
                }

                .feature span:last-child {
                    font-size: 0.875rem;
                    color: #64748b;
                }

                /* Loading */
                .loading-state {
                    text-align: center;
                    padding: 4rem;
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                }

                .loading-spinner {
                    width: 48px;
                    height: 48px;
                    border: 3px solid #e2e8f0;
                    border-top-color: #6366f1;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .loading-sub {
                    color: #94a3b8;
                    font-size: 0.875rem;
                }

                /* Results */
                .results-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .results-info h3 {
                    margin: 0;
                    font-size: 1.125rem;
                }

                .results-count {
                    color: #64748b;
                    font-size: 0.875rem;
                }

                .results-actions {
                    display: flex;
                    gap: 0.5rem;
                }

                .btn-secondary {
                    padding: 0.5rem 1rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    cursor: pointer;
                }

                .results-table-wrapper {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                }

                .results-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .results-table th {
                    background: #f8fafc;
                    padding: 0.75rem 1rem;
                    text-align: left;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #64748b;
                    text-transform: uppercase;
                    border-bottom: 1px solid #e2e8f0;
                }

                .results-table td {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #f1f5f9;
                }

                .results-table tr:hover {
                    background: #f8fafc;
                }

                .text-right {
                    text-align: right;
                }

                .keyword-cell {
                    font-weight: 500;
                }

                .volume-badge {
                    background: #dbeafe;
                    color: #1d4ed8;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .competition-bar {
                    width: 60px;
                    height: 6px;
                    background: #e2e8f0;
                    border-radius: 3px;
                    overflow: hidden;
                    display: inline-block;
                }

                .competition-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444);
                    border-radius: 3px;
                }

                .trend-up { color: #10b981; }
                .trend-down { color: #ef4444; }
                .trend-stable { color: #64748b; }

                .btn-icon-small {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    border-radius: 4px;
                }

                .btn-icon-small:hover {
                    background: #f1f5f9;
                }

                /* History */
                .search-history {
                    margin-top: 2rem;
                }

                .search-history h3 {
                    font-size: 1rem;
                    margin: 0 0 1rem 0;
                    color: #64748b;
                }

                .history-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 0.75rem;
                }

                .history-item {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .history-item:hover {
                    border-color: #6366f1;
                }

                .history-keyword {
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }

                .history-meta {
                    display: flex;
                    gap: 0.75rem;
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .no-history {
                    color: #94a3b8;
                    font-style: italic;
                }

                /* Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                }

                .keyword-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 500px;
                    overflow: hidden;
                }

                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }

                .modal-icon {
                    font-size: 1.5rem;
                }

                .modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 8px;
                    font-size: 1.25rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 1.5rem;
                }

                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                }

                .form-group {
                    margin-bottom: 1rem;
                }

                .form-group label {
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }

                .form-group input,
                .form-group select {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                /* Error state */
                .error-state {
                    text-align: center;
                    padding: 4rem;
                    background: white;
                    border-radius: 16px;
                }

                .error-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                }
            </style>
        `;
    }
};

// Export
window.KeywordResearchModule = KeywordResearchModule;
