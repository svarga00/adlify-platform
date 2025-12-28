/**
 * ADLIFY PLATFORM - Leads Module v2.0
 * Professional AI Analysis & Proposal Generation
 */

const LeadsModule = {
  id: 'leads',
  name: 'Leady',
  icon: '👥',
  title: 'Leady',
  subtitle: 'Správa potenciálnych klientov',
  
  menu: { section: 'main', order: 20 },
  permissions: ['leads', 'view'],
  
  // State
  leads: [],
  selectedIds: new Set(),
  filters: { status: '', search: '', minScore: '' },
  currentLeadId: null,
  currentAnalysis: null,
  editedAnalysis: null,
  
  // Edge Function URL
  ANALYZE_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/analyze-lead',
  
  // Adlify packages
  packages: {
    starter: { name: 'Starter', price: 149, features: ['1 reklamná platforma', '1 kampaň', '2 reklamné vizuály', 'Mesačný report'] },
    pro: { name: 'Pro', price: 249, features: ['2 platformy (FB/IG + Google)', 'Až 3 kampane', '4 reklamné vizuály', 'A/B testovanie', 'Optimalizácia každé 2 týždne'] },
    enterprise: { name: 'Enterprise', price: 399, features: ['Všetky platformy + remarketing', 'Až 5 kampaní', '8 reklamných vizuálov', 'Týždenná optimalizácia', 'Strategické konzultácie'] },
    premium: { name: 'Premium', price: 799, features: ['Neobmedzený počet kampaní', 'Dedikovaný account manager', 'Denná optimalizácia', '24/7 VIP podpora'] }
  },

  init() {
    console.log('👥 Leads module v2.0 initialized');
  },
  
  async render(container, params = {}) {
    if (params.status) this.filters.status = params.status;
    container.innerHTML = this.templateLoading();
    
    try {
      await this.loadLeads();
      container.innerHTML = this.template();
      this.setupEventListeners();
    } catch (error) {
      console.error('Leads error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  async loadLeads() {
    const filters = {};
    if (this.filters.status) filters.status = this.filters.status;
    this.leads = await Database.getLeads(filters);
    
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      this.leads = this.leads.filter(l => 
        (l.company_name || '').toLowerCase().includes(search) ||
        (l.domain || '').toLowerCase().includes(search)
      );
    }
    if (this.filters.minScore) {
      this.leads = this.leads.filter(l => (l.score || 0) >= parseInt(this.filters.minScore));
    }
  },

  template() {
    return `
      <div class="flex gap-2 mb-6">
        <button onclick="LeadsModule.showTab('list')" class="tab-btn active" data-tab="list">📋 Zoznam</button>
        <button onclick="LeadsModule.showTab('import')" class="tab-btn" data-tab="import">📥 Import</button>
        <button onclick="LeadsModule.showTab('add')" class="tab-btn" data-tab="add">✏️ Pridať</button>
      </div>
      
      <!-- List Tab -->
      <div id="tab-list" class="tab-content">
        <div class="card p-4 mb-4 flex flex-wrap gap-4 items-center">
          <input type="text" id="filter-search" placeholder="🔍 Hľadať..." value="${this.filters.search}"
            class="flex-1 min-w-[200px] p-2 border rounded-lg">
          <select id="filter-status" class="p-2 border rounded-lg" onchange="LeadsModule.onStatusChange(this.value)">
            <option value="">Všetky stavy</option>
            <option value="new" ${this.filters.status === 'new' ? 'selected' : ''}>🆕 Nové</option>
            <option value="analyzed" ${this.filters.status === 'analyzed' ? 'selected' : ''}>🤖 Analyzované</option>
            <option value="contacted" ${this.filters.status === 'contacted' ? 'selected' : ''}>📧 Kontaktované</option>
            <option value="converted" ${this.filters.status === 'converted' ? 'selected' : ''}>✅ Klienti</option>
          </select>
          <div class="flex gap-2">
            <button onclick="LeadsModule.selectAll()" class="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">☑️ Všetky</button>
            <button onclick="LeadsModule.analyzeSelected()" class="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">🤖 Analyzovať</button>
            <button onclick="LeadsModule.deleteSelected()" class="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">🗑️</button>
          </div>
        </div>
        
        <div class="card overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b">
            <span class="font-medium">Leady (<span id="leads-count">${this.leads.length}</span>)</span>
          </div>
          <div id="leads-list" class="divide-y max-h-[60vh] overflow-y-auto">
            ${this.renderLeadsList()}
          </div>
        </div>
      </div>
      
      <!-- Import Tab -->
      <div id="tab-import" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">📥 Import domén</h2>
          <div class="grid md:grid-cols-4 gap-4">
            <div class="md:col-span-3">
              <textarea id="import-domains" rows="8" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk" 
                class="w-full p-3 border rounded-xl font-mono text-sm"></textarea>
            </div>
            <div class="space-y-4">
              <button onclick="LeadsModule.handleImport()" class="w-full gradient-bg text-white font-semibold py-3 rounded-xl">📥 Importovať</button>
              <p class="text-sm text-gray-500">Jedna doména na riadok</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Add Tab -->
      <div id="tab-add" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">✏️ Pridať lead</h2>
          <div class="grid md:grid-cols-2 gap-4">
            <input type="text" id="add-name" placeholder="Názov firmy *" class="p-3 border rounded-xl">
            <input type="text" id="add-domain" placeholder="domena.sk" class="p-3 border rounded-xl">
            <input type="text" id="add-industry" placeholder="Odvetvie" class="p-3 border rounded-xl">
            <input type="text" id="add-city" placeholder="Mesto" class="p-3 border rounded-xl">
          </div>
          <button onclick="LeadsModule.handleAdd()" class="mt-4 gradient-bg text-white font-semibold px-8 py-3 rounded-xl">➕ Pridať</button>
        </div>
      </div>
      
      <!-- Analysis Modal -->
      <div id="analysis-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 class="text-xl font-bold">🤖 AI Analýza</h2>
            <button onclick="LeadsModule.closeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="analysis-content" class="p-6 overflow-y-auto flex-1">
            <!-- Content loaded dynamically -->
          </div>
          <div class="p-4 border-t flex gap-3 justify-between bg-gray-50">
            <button onclick="LeadsModule.closeModal()" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Zavrieť</button>
            <div class="flex gap-3">
              <button onclick="LeadsModule.editAnalysis()" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">✏️ Upraviť</button>
              <button onclick="LeadsModule.generateProposal()" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold">📄 Generovať ponuku</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Edit Modal -->
      <div id="edit-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between">
            <h2 class="text-xl font-bold">✏️ Upraviť analýzu</h2>
            <button onclick="LeadsModule.closeEditModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div id="edit-content" class="p-6 overflow-y-auto flex-1">
            <!-- Edit form loaded dynamically -->
          </div>
          <div class="p-4 border-t flex gap-3 justify-end bg-gray-50">
            <button onclick="LeadsModule.closeEditModal()" class="px-4 py-2 bg-gray-200 rounded-lg">Zrušiť</button>
            <button onclick="LeadsModule.saveAnalysisEdits()" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold">💾 Uložiť zmeny</button>
          </div>
        </div>
      </div>
      
      <style>
        .tab-btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; }
        .tab-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .tab-content.hidden { display: none; }
        .analysis-section { background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
        .analysis-section h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .tag { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; margin: 2px; }
        .tag-green { background: #dcfce7; color: #166534; }
        .tag-orange { background: #ffedd5; color: #9a3412; }
        .tag-blue { background: #dbeafe; color: #1e40af; }
        .tag-purple { background: #f3e8ff; color: #7c3aed; }
        .stat-card { background: white; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-card .value { font-size: 1.5rem; font-weight: 700; color: #FF6B35; }
        .stat-card .label { font-size: 0.8rem; color: #6b7280; }
      </style>
    `;
  },

  renderLeadsList() {
    if (this.leads.length === 0) {
      return '<div class="p-8 text-center text-gray-400">Žiadne leady</div>';
    }
    
    return this.leads.map(lead => {
      const a = lead.analysis || {};
      const hasAnalysis = a.company || a.analysis;
      return `
        <div class="px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
          <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} 
            onchange="LeadsModule.toggleSelect('${lead.id}')" class="w-4 h-4 rounded">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-0.5">
              <strong class="truncate">${lead.company_name || lead.domain || 'Neznámy'}</strong>
              ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="text-xs text-primary hover:underline">${lead.domain}</a>` : ''}
              ${Utils.statusBadge(lead.status, 'lead')}
              ${hasAnalysis ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Analyzované</span>' : ''}
            </div>
            <div class="text-xs text-gray-500">
              ${a.company?.location ? '📍 ' + a.company.location : ''} 
              ${a.company?.industry ? '• ' + a.company.industry : ''}
            </div>
          </div>
          ${Utils.scoreBadge(lead.score)}
          <div class="flex gap-1">
            <button onclick="LeadsModule.analyze('${lead.id}')" class="p-2 hover:bg-purple-100 rounded-lg" title="Analyzovať">🤖</button>
            ${hasAnalysis ? `<button onclick="LeadsModule.showAnalysis('${lead.id}')" class="p-2 hover:bg-blue-100 rounded-lg" title="Zobraziť">📊</button>` : ''}
            ${hasAnalysis ? `<button onclick="LeadsModule.generateProposalFor('${lead.id}')" class="p-2 hover:bg-green-100 rounded-lg" title="Ponuka">📄</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  templateLoading() {
    return '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
  },

  // Event handlers
  setupEventListeners() {
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.onSearchChange(e.target.value), 300);
      });
    }
  },

  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  },

  async onSearchChange(value) {
    this.filters.search = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },

  async onStatusChange(value) {
    this.filters.status = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },

  toggleSelect(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  },

  selectAll() {
    this.leads.forEach(l => this.selectedIds.add(l.id));
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },

  // Analysis functions
  async analyze(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    
    this.currentLeadId = id;
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    content.innerHTML = `
      <div class="text-center py-16">
        <div class="animate-spin text-6xl mb-6">🤖</div>
        <h3 class="text-2xl font-bold mb-2">Analyzujem ${lead.company_name || lead.domain}...</h3>
        <p class="text-gray-500">Sťahujem web, analyzujem konkurenciu a pripravujem stratégiu</p>
        <p class="text-sm text-gray-400 mt-4">Toto môže trvať 15-30 sekúnd</p>
      </div>
    `;
    
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      const response = await fetch(this.ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          websiteUrl: lead.domain ? `https://${lead.domain}` : null,
          companyName: lead.company_name,
          leadId: lead.id
        })
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Analýza zlyhala');
      
      this.currentAnalysis = result.analysis;
      this.editedAnalysis = JSON.parse(JSON.stringify(result.analysis));
      
      await Database.update('leads', id, {
        analysis: result.analysis,
        status: 'analyzed',
        score: this.calculateScore(result.analysis),
        analyzed_at: new Date().toISOString()
      });
      
      this.renderAnalysisResults(lead, result.analysis);
      await this.loadLeads();
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      Utils.toast('Analýza dokončená!', 'success');
      
    } catch (error) {
      console.error('Analysis error:', error);
      content.innerHTML = `
        <div class="text-center py-16">
          <div class="text-6xl mb-6">❌</div>
          <h3 class="text-xl font-bold mb-2">Chyba pri analýze</h3>
          <p class="text-gray-500 mb-4">${error.message}</p>
          <button onclick="LeadsModule.analyze('${id}')" class="px-6 py-2 bg-purple-100 text-purple-700 rounded-lg">Skúsiť znova</button>
        </div>
      `;
    }
  },

  calculateScore(analysis) {
    let score = 50;
    if (analysis.company?.services?.length > 2) score += 10;
    if (analysis.company?.location) score += 5;
    if (analysis.keywords?.topKeywords?.length > 5) score += 10;
    if (analysis.strategy?.recommendedPlatforms?.length > 1) score += 10;
    if (analysis.roi) score += 10;
    if (analysis.onlinePresence?.website?.exists) score += 5;
    return Math.min(score, 100);
  },

  renderAnalysisResults(lead, analysis) {
    const content = document.getElementById('analysis-content');
    const c = analysis.company || {};
    const o = analysis.onlinePresence || {};
    const a = analysis.analysis || {};
    const k = analysis.keywords || {};
    const s = analysis.strategy || {};
    const b = analysis.budget || {};
    const r = analysis.roi || {};
    const camp = analysis.proposedCampaigns || {};
    
    content.innerHTML = `
      <!-- Header -->
      <div class="bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl p-6 mb-6">
        <h2 class="text-3xl font-bold mb-2">${c.name || lead.company_name || 'Firma'}</h2>
        <p class="opacity-90 text-lg">${c.description || ''}</p>
        ${c.location ? `<p class="mt-3 opacity-75">📍 ${c.location}</p>` : ''}
      </div>
      
      <!-- Human Intro -->
      ${a.humanWrittenIntro ? `
      <div class="analysis-section border-l-4 border-orange-500">
        <h3>💡 Naše zistenia</h3>
        <p class="text-gray-700 leading-relaxed">${a.humanWrittenIntro}</p>
      </div>
      ` : ''}
      
      <!-- Services -->
      ${c.services?.length ? `
      <div class="analysis-section">
        <h3>🛠️ Služby</h3>
        <div class="flex flex-wrap gap-2">
          ${c.services.map(s => `<span class="tag tag-blue">${s}</span>`).join('')}
        </div>
      </div>
      ` : ''}
      
      <!-- Online Presence -->
      ${o.summary ? `
      <div class="analysis-section">
        <h3>🌐 Online prítomnosť</h3>
        <p class="text-gray-600 mb-4">${o.summary}</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="stat-card">
            <div class="value">${o.website?.exists ? '✅' : '❌'}</div>
            <div class="label">Web</div>
          </div>
          <div class="stat-card">
            <div class="value">${o.socialMedia?.facebook?.exists ? '✅' : '❌'}</div>
            <div class="label">Facebook</div>
          </div>
          <div class="stat-card">
            <div class="value">${o.socialMedia?.instagram?.exists ? '✅' : '❌'}</div>
            <div class="label">Instagram</div>
          </div>
          <div class="stat-card">
            <div class="value">${o.paidAds?.detected ? '✅' : '❌'}</div>
            <div class="label">Platená reklama</div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- SWOT -->
      ${a.swot ? `
      <div class="analysis-section">
        <h3>📊 SWOT Analýza</h3>
        <div class="grid md:grid-cols-2 gap-4">
          <div class="bg-green-50 rounded-lg p-4">
            <h4 class="font-semibold text-green-700 mb-2">💪 Silné stránky</h4>
            <ul class="text-sm space-y-1">${a.swot.strengths?.map(s => `<li>• ${s}</li>`).join('') || ''}</ul>
          </div>
          <div class="bg-orange-50 rounded-lg p-4">
            <h4 class="font-semibold text-orange-700 mb-2">⚠️ Slabé stránky</h4>
            <ul class="text-sm space-y-1">${a.swot.weaknesses?.map(w => `<li>• ${w}</li>`).join('') || ''}</ul>
          </div>
          <div class="bg-blue-50 rounded-lg p-4">
            <h4 class="font-semibold text-blue-700 mb-2">🚀 Príležitosti</h4>
            <ul class="text-sm space-y-1">${a.swot.opportunities?.map(o => `<li>• ${o}</li>`).join('') || ''}</ul>
          </div>
          <div class="bg-red-50 rounded-lg p-4">
            <h4 class="font-semibold text-red-700 mb-2">⚡ Hrozby</h4>
            <ul class="text-sm space-y-1">${a.swot.threats?.map(t => `<li>• ${t}</li>`).join('') || ''}</ul>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Keywords -->
      ${k.topKeywords?.length ? `
      <div class="analysis-section">
        <h3>🔍 Kľúčové slová</h3>
        <p class="text-sm text-gray-500 mb-3">${k.summary || `Identifikovali sme ${k.totalFound || k.topKeywords.length} relevantných kľúčových slov`}</p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="text-left p-2 rounded-l-lg">Kľúčové slovo</th>
                <th class="text-center p-2">Hľadanosť</th>
                <th class="text-center p-2">Konkurencia</th>
                <th class="text-right p-2 rounded-r-lg">CPC</th>
              </tr>
            </thead>
            <tbody>
              ${k.topKeywords.slice(0, 10).map(kw => `
                <tr class="border-b">
                  <td class="p-2 font-medium">${kw.keyword}</td>
                  <td class="text-center p-2">${kw.searchVolume}</td>
                  <td class="text-center p-2"><span class="tag ${kw.competition === 'nízka' ? 'tag-green' : kw.competition === 'vysoká' ? 'tag-orange' : 'tag-blue'}">${kw.competition}</span></td>
                  <td class="text-right p-2">${kw.cpc}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-3">📌 Kompletný zoznam ${k.totalFound || 'všetkých'} kľúčových slov dostanete po objednaní služby</p>
      </div>
      ` : ''}
      
      <!-- Budget Recommendations -->
      ${b.recommendations ? `
      <div class="analysis-section">
        <h3>💰 Odporúčaný rozpočet</h3>
        <p class="text-sm text-gray-600 mb-4">${b.analysis || ''}</p>
        <div class="grid md:grid-cols-3 gap-4">
          <div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center">
            <p class="text-sm text-gray-500 mb-1">Štart</p>
            <p class="text-3xl font-bold text-gray-700">${b.recommendations.starter?.adSpend || 300}€</p>
            <p class="text-xs text-gray-400">mesačne na reklamu</p>
            <div class="mt-3 pt-3 border-t text-sm">
              <p>~${b.recommendations.starter?.expectedClicks || 400} klikov</p>
              <p>~${b.recommendations.starter?.expectedConversions || '15-25'} dopytov</p>
            </div>
          </div>
          <div class="bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl p-5 text-center text-white transform scale-105">
            <p class="text-sm opacity-80 mb-1">⭐ Odporúčame</p>
            <p class="text-3xl font-bold">${b.recommendations.recommended?.adSpend || 500}€</p>
            <p class="text-xs opacity-80">mesačne na reklamu</p>
            <div class="mt-3 pt-3 border-t border-white/30 text-sm">
              <p>~${b.recommendations.recommended?.expectedClicks || 700} klikov</p>
              <p>~${b.recommendations.recommended?.expectedConversions || '30-45'} dopytov</p>
            </div>
          </div>
          <div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center">
            <p class="text-sm text-gray-500 mb-1">Agresívny</p>
            <p class="text-3xl font-bold text-gray-700">${b.recommendations.aggressive?.adSpend || 800}€</p>
            <p class="text-xs text-gray-400">mesačne na reklamu</p>
            <div class="mt-3 pt-3 border-t text-sm">
              <p>~${b.recommendations.aggressive?.expectedClicks || 1200} klikov</p>
              <p>~${b.recommendations.aggressive?.expectedConversions || '50-70'} dopytov</p>
            </div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- ROI -->
      ${r.projection ? `
      <div class="analysis-section bg-green-50">
        <h3>📈 Predpokladaná návratnosť (ROI)</h3>
        <p class="text-sm text-gray-600 mb-4">${r.explanation || ''}</p>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-2xl font-bold text-green-600">${r.projection.monthlyLeads}</p>
            <p class="text-xs text-gray-500">Mesačných dopytov</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-green-600">${r.projection.monthlyRevenue}</p>
            <p class="text-xs text-gray-500">Potenciálny obrat</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-green-600">${r.projection.roi}</p>
            <p class="text-xs text-gray-500">ROI</p>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Custom Note -->
      ${analysis.customNote ? `
      <div class="analysis-section border-l-4 border-purple-500 bg-purple-50">
        <h3>💬 Osobná poznámka</h3>
        <p class="text-gray-700 italic">${analysis.customNote}</p>
      </div>
      ` : ''}
      
      <!-- Recommended Package -->
      <div class="analysis-section bg-gradient-to-r from-orange-100 to-pink-100">
        <h3>🎯 Odporúčaný balíček: ${analysis.recommendedPackage || 'Pro'}</h3>
        <p class="text-gray-600">Na základe analýzy odporúčame balíček <strong>${analysis.recommendedPackage || 'Pro'}</strong> pre optimálny pomer ceny a výkonu.</p>
      </div>
    `;
  },

  showAnalysis(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead?.analysis) return;
    
    this.currentLeadId = id;
    this.currentAnalysis = lead.analysis;
    this.editedAnalysis = JSON.parse(JSON.stringify(lead.analysis));
    
    const modal = document.getElementById('analysis-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    this.renderAnalysisResults(lead, lead.analysis);
  },

  closeModal() {
    document.getElementById('analysis-modal').classList.add('hidden');
    document.getElementById('analysis-modal').classList.remove('flex');
  },

  // Edit functionality
  editAnalysis() {
    if (!this.editedAnalysis) return;
    
    const modal = document.getElementById('edit-modal');
    const content = document.getElementById('edit-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    const a = this.editedAnalysis;
    content.innerHTML = `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Názov firmy</label>
          <input type="text" id="edit-company-name" value="${a.company?.name || ''}" class="w-full p-3 border rounded-xl">
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Popis firmy</label>
          <textarea id="edit-company-desc" rows="3" class="w-full p-3 border rounded-xl">${a.company?.description || ''}</textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Naše zistenia (úvodný text)</label>
          <textarea id="edit-intro" rows="4" class="w-full p-3 border rounded-xl">${a.analysis?.humanWrittenIntro || ''}</textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Osobná poznámka pre klienta</label>
          <textarea id="edit-custom-note" rows="3" class="w-full p-3 border rounded-xl">${a.customNote || ''}</textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Odporúčaný balíček</label>
          <select id="edit-package" class="w-full p-3 border rounded-xl">
            <option value="Starter" ${a.recommendedPackage === 'Starter' ? 'selected' : ''}>Starter (149€)</option>
            <option value="Pro" ${a.recommendedPackage === 'Pro' ? 'selected' : ''}>Pro (249€)</option>
            <option value="Enterprise" ${a.recommendedPackage === 'Enterprise' ? 'selected' : ''}>Enterprise (399€)</option>
            <option value="Premium" ${a.recommendedPackage === 'Premium' ? 'selected' : ''}>Premium (799€)</option>
          </select>
        </div>
      </div>
    `;
  },

  closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
  },

  async saveAnalysisEdits() {
    if (!this.editedAnalysis || !this.currentLeadId) return;
    
    // Update from form
    this.editedAnalysis.company = this.editedAnalysis.company || {};
    this.editedAnalysis.company.name = document.getElementById('edit-company-name').value;
    this.editedAnalysis.company.description = document.getElementById('edit-company-desc').value;
    this.editedAnalysis.analysis = this.editedAnalysis.analysis || {};
    this.editedAnalysis.analysis.humanWrittenIntro = document.getElementById('edit-intro').value;
    this.editedAnalysis.customNote = document.getElementById('edit-custom-note').value;
    this.editedAnalysis.recommendedPackage = document.getElementById('edit-package').value;
    
    // Save to database
    await Database.update('leads', this.currentLeadId, { analysis: this.editedAnalysis });
    
    // Update current
    this.currentAnalysis = this.editedAnalysis;
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (lead) lead.analysis = this.editedAnalysis;
    
    // Re-render
    this.renderAnalysisResults(lead, this.editedAnalysis);
    this.closeEditModal();
    Utils.toast('Zmeny uložené!', 'success');
  },

  // Proposal generation
  async generateProposal() {
    if (!this.currentLeadId || !this.currentAnalysis) {
      return Utils.toast('Najprv spusti analýzu', 'warning');
    }
    this.generateProposalFor(this.currentLeadId);
  },

  async generateProposalFor(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead?.analysis) return Utils.toast('Lead nemá analýzu', 'warning');
    
    Utils.toast('Generujem ponuku...', 'info');
    const html = this.generateProposalHTML(lead, lead.analysis);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  },

  generateProposalHTML(lead, analysis) {
    const c = analysis.company || {};
    const a = analysis.analysis || {};
    const o = analysis.onlinePresence || {};
    const k = analysis.keywords || {};
    const s = analysis.strategy || {};
    const b = analysis.budget || {};
    const r = analysis.roi || {};
    const camp = analysis.proposedCampaigns || {};
    const timeline = analysis.timeline || {};
    const pkg = this.packages[analysis.recommendedPackage?.toLowerCase()] || this.packages.pro;
    
    return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marketingová stratégia - ${c.name || lead.company_name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Poppins', sans-serif; background: #0f0f1a; color: #ffffff; line-height: 1.6; }
    
    .slide { min-height: 100vh; padding: 60px; display: flex; flex-direction: column; justify-content: center; position: relative; }
    .slide-content { max-width: 1200px; margin: 0 auto; width: 100%; }
    
    /* Gradients */
    .gradient-text { background: linear-gradient(135deg, #FF6B35, #E91E63, #9C27B0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .gradient-bg { background: linear-gradient(135deg, #FF6B35, #E91E63); }
    .gradient-border { border: 2px solid transparent; background: linear-gradient(#1a1a2e, #1a1a2e) padding-box, linear-gradient(135deg, #FF6B35, #E91E63) border-box; }
    
    /* Title Slide */
    .title-slide { background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%); text-align: center; }
    .title-slide h1 { font-size: 3.5rem; font-weight: 800; margin-bottom: 20px; }
    .title-slide .subtitle { font-size: 1.5rem; opacity: 0.8; margin-bottom: 40px; }
    .title-slide .company-badge { display: inline-block; padding: 15px 40px; border-radius: 50px; font-size: 1.2rem; font-weight: 600; }
    
    /* Section titles */
    .section-title { font-size: 2.5rem; font-weight: 700; margin-bottom: 40px; }
    .section-subtitle { font-size: 1.1rem; opacity: 0.7; margin-bottom: 30px; }
    
    /* Cards */
    .card { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 30px; margin-bottom: 20px; backdrop-filter: blur(10px); }
    .card-highlight { background: linear-gradient(135deg, rgba(255,107,53,0.2), rgba(233,30,99,0.2)); border: 1px solid rgba(255,107,53,0.3); }
    
    /* Grid */
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 30px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
    
    /* Stats */
    .stat { text-align: center; padding: 20px; }
    .stat-value { font-size: 3rem; font-weight: 800; }
    .stat-label { font-size: 0.9rem; opacity: 0.6; }
    
    /* Tags */
    .tag { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; margin: 4px; background: rgba(255,255,255,0.1); }
    .tag-success { background: rgba(34,197,94,0.2); color: #22c55e; }
    .tag-warning { background: rgba(251,146,60,0.2); color: #fb923c; }
    
    /* Table */
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 15px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
    th { opacity: 0.6; font-weight: 500; }
    
    /* Package cards */
    .package-card { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px 30px; text-align: center; transition: transform 0.3s; }
    .package-card:hover { transform: translateY(-10px); }
    .package-card.featured { background: linear-gradient(135deg, #FF6B35, #E91E63); transform: scale(1.05); }
    .package-card.featured:hover { transform: scale(1.05) translateY(-10px); }
    .package-price { font-size: 3rem; font-weight: 800; }
    .package-name { font-size: 1.5rem; font-weight: 600; margin-bottom: 20px; }
    .package-features { list-style: none; text-align: left; }
    .package-features li { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .package-features li:before { content: "✓ "; color: #22c55e; }
    
    /* SWOT */
    .swot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .swot-box { padding: 25px; border-radius: 15px; }
    .swot-box h4 { font-size: 1.1rem; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
    .swot-box ul { list-style: none; }
    .swot-box li { padding: 8px 0; font-size: 0.95rem; opacity: 0.9; }
    .swot-strengths { background: rgba(34,197,94,0.15); }
    .swot-weaknesses { background: rgba(251,146,60,0.15); }
    .swot-opportunities { background: rgba(59,130,246,0.15); }
    .swot-threats { background: rgba(239,68,68,0.15); }
    
    /* Footer */
    .footer { text-align: center; padding: 40px; opacity: 0.5; font-size: 0.9rem; }
    
    /* Logo */
    .logo { height: 40px; }
    .logo-large { height: 60px; }
    
    /* Decorations */
    .decoration-circle { position: absolute; border-radius: 50%; background: linear-gradient(135deg, rgba(255,107,53,0.3), rgba(233,30,99,0.3)); filter: blur(100px); }
    
    @media (max-width: 768px) {
      .slide { padding: 30px; }
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
      .title-slide h1 { font-size: 2rem; }
      .section-title { font-size: 1.8rem; }
    }
  </style>
</head>
<body>

  <!-- Slide 1: Title -->
  <div class="slide title-slide">
    <div class="decoration-circle" style="width: 500px; height: 500px; top: -200px; right: -200px;"></div>
    <div class="decoration-circle" style="width: 400px; height: 400px; bottom: -150px; left: -150px;"></div>
    <div class="slide-content">
      <img src="https://adlify.eu/wp-content/uploads/2025/05/logo_na_sirku.png" alt="Adlify" class="logo-large" style="margin-bottom: 60px;">
      <h1 class="gradient-text">Návrh marketingovej stratégie</h1>
      <p class="subtitle">Personalizovaná analýza a odporúčania pre váš biznis</p>
      <div class="company-badge gradient-bg">${c.name || lead.company_name || lead.domain}</div>
      <p style="margin-top: 60px; opacity: 0.5; font-size: 0.9rem;">V tejto prezentácii nájdete kompletnú analýzu vašej online prítomnosti,<br>návrh stratégie a konkrétne odporúčania pre rast vášho podnikania.</p>
    </div>
  </div>

  <!-- Slide 2: About Company -->
  <div class="slide" style="background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);">
    <div class="slide-content">
      <h2 class="section-title">🏢 O vašej firme</h2>
      <div class="card card-highlight" style="font-size: 1.2rem; line-height: 1.8;">
        ${c.description || 'Popis firmy'}
      </div>
      ${c.services?.length ? `
      <h3 style="margin: 40px 0 20px; font-size: 1.3rem;">Vaše služby a produkty</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${c.services.map(s => `<span class="tag">${s}</span>`).join('')}
      </div>
      ` : ''}
      ${c.targetCustomers ? `
      <h3 style="margin: 40px 0 20px; font-size: 1.3rem;">Vaši zákazníci</h3>
      <p style="opacity: 0.8;">${c.targetCustomers}</p>
      ` : ''}
    </div>
  </div>

  <!-- Slide 3: Our Findings -->
  <div class="slide" style="background: #0f0f1a;">
    <div class="slide-content">
      <h2 class="section-title">💡 Čo sme zistili</h2>
      <div class="card" style="font-size: 1.15rem; line-height: 1.9; border-left: 4px solid #FF6B35;">
        ${a.humanWrittenIntro || 'Analýza firmy'}
      </div>
      
      ${a.strengths?.length ? `
      <h3 style="margin: 50px 0 25px; font-size: 1.4rem;">✅ Vaše silné stránky</h3>
      <div class="grid-2">
        ${a.strengths.map(s => `
          <div class="card">
            <h4 style="color: #22c55e; margin-bottom: 10px;">${s.title}</h4>
            <p style="opacity: 0.8;">${s.description}</p>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${a.opportunities?.length ? `
      <h3 style="margin: 50px 0 25px; font-size: 1.4rem;">🚀 Príležitosti na zlepšenie</h3>
      <div class="grid-2">
        ${a.opportunities.map(o => `
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 style="color: #fb923c;">${o.title}</h4>
              <span class="tag ${o.priority === 'vysoká' ? 'tag-warning' : ''}">${o.priority}</span>
            </div>
            <p style="opacity: 0.8;">${o.description}</p>
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
  </div>

  <!-- Slide 4: Online Presence -->
  <div class="slide" style="background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%);">
    <div class="slide-content">
      <h2 class="section-title">🌐 Vaša online prítomnosť</h2>
      <p class="section-subtitle">${o.summary || ''}</p>
      
      <div class="grid-4">
        <div class="card" style="text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 10px;">${o.website?.exists ? '✅' : '❌'}</div>
          <h4>Webstránka</h4>
          <p style="font-size: 0.85rem; opacity: 0.6;">${o.website?.quality || 'N/A'}</p>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 10px;">${o.socialMedia?.facebook?.exists ? '✅' : '❌'}</div>
          <h4>Facebook</h4>
          <p style="font-size: 0.85rem; opacity: 0.6;">${o.socialMedia?.facebook?.exists ? 'Aktívny' : 'Chýba'}</p>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 10px;">${o.socialMedia?.instagram?.exists ? '✅' : '❌'}</div>
          <h4>Instagram</h4>
          <p style="font-size: 0.85rem; opacity: 0.6;">${o.socialMedia?.instagram?.exists ? 'Aktívny' : 'Chýba'}</p>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 10px;">${o.paidAds?.detected ? '✅' : '❌'}</div>
          <h4>Platená reklama</h4>
          <p style="font-size: 0.85rem; opacity: 0.6;">${o.paidAds?.detected ? 'Využíva' : 'Nevyužíva'}</p>
        </div>
      </div>
      
      ${o.website?.strengths?.length || o.website?.weaknesses?.length ? `
      <div class="grid-2" style="margin-top: 40px;">
        ${o.website?.strengths?.length ? `
        <div class="card">
          <h4 style="color: #22c55e; margin-bottom: 15px;">💪 Čo funguje dobre</h4>
          <ul style="list-style: none;">
            ${o.website.strengths.map(s => `<li style="padding: 8px 0;">✓ ${s}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        ${o.website?.weaknesses?.length ? `
        <div class="card">
          <h4 style="color: #fb923c; margin-bottom: 15px;">⚠️ Čo treba zlepšiť</h4>
          <ul style="list-style: none;">
            ${o.website.weaknesses.map(w => `<li style="padding: 8px 0;">• ${w}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
      </div>
      ` : ''}
      
      <p style="margin-top: 30px; font-size: 0.85rem; opacity: 0.5; text-align: center;">📌 Kompletnú analýzu webu vrátane technického SEO auditu pripravíme po objednaní služby</p>
    </div>
  </div>

  <!-- Slide 5: SWOT -->
  ${a.swot ? `
  <div class="slide" style="background: #0f0f1a;">
    <div class="slide-content">
      <h2 class="section-title">📊 SWOT Analýza</h2>
      <div class="swot-grid">
        <div class="swot-box swot-strengths">
          <h4>💪 Silné stránky</h4>
          <ul>${a.swot.strengths?.map(s => `<li>• ${s}</li>`).join('') || ''}</ul>
        </div>
        <div class="swot-box swot-weaknesses">
          <h4>⚠️ Slabé stránky</h4>
          <ul>${a.swot.weaknesses?.map(w => `<li>• ${w}</li>`).join('') || ''}</ul>
        </div>
        <div class="swot-box swot-opportunities">
          <h4>🚀 Príležitosti</h4>
          <ul>${a.swot.opportunities?.map(o => `<li>• ${o}</li>`).join('') || ''}</ul>
        </div>
        <div class="swot-box swot-threats">
          <h4>⚡ Hrozby</h4>
          <ul>${a.swot.threats?.map(t => `<li>• ${t}</li>`).join('') || ''}</ul>
        </div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Slide 6: Keywords -->
  ${k.topKeywords?.length ? `
  <div class="slide" style="background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);">
    <div class="slide-content">
      <h2 class="section-title">🔍 Kľúčové slová</h2>
      <p class="section-subtitle">${k.summary || ''}</p>
      
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Kľúčové slovo</th>
              <th style="text-align: center;">Mesačná hľadanosť</th>
              <th style="text-align: center;">Konkurencia</th>
              <th style="text-align: right;">Cena za klik</th>
            </tr>
          </thead>
          <tbody>
            ${k.topKeywords.slice(0, 10).map(kw => `
              <tr>
                <td><strong>${kw.keyword}</strong></td>
                <td style="text-align: center;">${kw.searchVolume}</td>
                <td style="text-align: center;"><span class="tag ${kw.competition === 'nízka' ? 'tag-success' : kw.competition === 'vysoká' ? 'tag-warning' : ''}">${kw.competition}</span></td>
                <td style="text-align: right;">${kw.cpc}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <p style="margin-top: 20px; font-size: 0.85rem; opacity: 0.5; text-align: center;">📌 Máme pripravených ďalších ${(k.totalFound || 45) - 10}+ kľúčových slov vrátane long-tail príležitostí</p>
    </div>
  </div>
  ` : ''}

  <!-- Slide 7: Strategy -->
  <div class="slide" style="background: #1a1a2e;">
    <div class="slide-content">
      <h2 class="section-title">🎯 Navrhovaná stratégia</h2>
      
      <div class="grid-2">
        <div class="card">
          <h4 style="margin-bottom: 20px;">📱 Odporúčané platformy</h4>
          <div style="display: flex; gap: 15px; flex-wrap: wrap;">
            ${(s.recommendedPlatforms || ['Google Ads', 'Facebook/Instagram']).map(p => `
              <span style="padding: 15px 25px; background: linear-gradient(135deg, #FF6B35, #E91E63); border-radius: 10px; font-weight: 600;">${p}</span>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <h4 style="margin-bottom: 20px;">🎯 Hlavný cieľ</h4>
          <p style="font-size: 1.1rem;">${s.primaryGoal || 'Generovanie kvalifikovaných dopytov'}</p>
        </div>
      </div>
      
      ${s.targetAudience ? `
      <div class="card" style="margin-top: 30px;">
        <h4 style="margin-bottom: 20px;">👥 Cieľová skupina</h4>
        <div class="grid-3">
          <div>
            <p style="opacity: 0.6; margin-bottom: 5px;">Demografia</p>
            <p>${s.targetAudience.demographics || 'N/A'}</p>
          </div>
          <div>
            <p style="opacity: 0.6; margin-bottom: 5px;">Záujmy</p>
            <p>${s.targetAudience.interests?.join(', ') || 'N/A'}</p>
          </div>
          <div>
            <p style="opacity: 0.6; margin-bottom: 5px;">Správanie</p>
            <p>${s.targetAudience.behaviors?.join(', ') || 'N/A'}</p>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>

  <!-- Slide 8: Campaign Examples -->
  ${camp.google || camp.meta ? `
  <div class="slide" style="background: #0f0f1a;">
    <div class="slide-content">
      <h2 class="section-title">📝 Návrhy reklám</h2>
      
      <div class="grid-2">
        ${camp.google?.searchCampaign ? `
        <div class="card">
          <h4 style="color: #4285f4; margin-bottom: 20px;">🔍 Google Ads</h4>
          <div style="background: white; color: #1a1a2e; padding: 20px; border-radius: 10px;">
            <p style="color: #1a0dab; font-size: 1.1rem; margin-bottom: 5px;">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.headlines?.[0] || 'Headline'}</p>
            <p style="color: #006621; font-size: 0.85rem; margin-bottom: 5px;">www.${lead.domain || 'example.sk'}</p>
            <p style="color: #545454; font-size: 0.9rem;">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.descriptions?.[0] || 'Description'}</p>
          </div>
          <p style="font-size: 0.85rem; opacity: 0.6; margin-top: 15px;">Keywords: ${camp.google.searchCampaign.adGroups?.[0]?.keywords?.join(', ') || 'N/A'}</p>
        </div>
        ` : ''}
        
        ${camp.meta?.campaign ? `
        <div class="card">
          <h4 style="color: #1877f2; margin-bottom: 20px;">📘 Facebook/Instagram</h4>
          <div style="background: white; color: #1a1a2e; padding: 20px; border-radius: 10px;">
            <p style="font-size: 0.9rem; margin-bottom: 15px;">${camp.meta.campaign.adSets?.[0]?.adCopy?.primaryText || 'Ad copy'}</p>
            <div style="background: #f0f2f5; padding: 15px; border-radius: 8px;">
              <p style="font-weight: 600; margin-bottom: 5px;">${camp.meta.campaign.adSets?.[0]?.adCopy?.headline || 'Headline'}</p>
              <p style="font-size: 0.85rem; opacity: 0.7;">${camp.meta.campaign.adSets?.[0]?.adCopy?.description || 'Description'}</p>
            </div>
            <button style="margin-top: 15px; background: #1877f2; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-weight: 600;">${camp.meta.campaign.adSets?.[0]?.adCopy?.cta || 'Zistiť viac'}</button>
          </div>
        </div>
        ` : ''}
      </div>
      
      <p style="margin-top: 30px; font-size: 0.85rem; opacity: 0.5; text-align: center;">📌 Toto sú ukážkové reklamy. Finálne verzie vytvoríme na základe vašich preferencií a A/B testovania.</p>
    </div>
  </div>
  ` : ''}

  <!-- Slide 9: Budget -->
  <div class="slide" style="background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%);">
    <div class="slide-content">
      <h2 class="section-title">💰 Odporúčaný reklamný rozpočet</h2>
      <p class="section-subtitle">${b.analysis || ''}</p>
      
      <div class="grid-3">
        <div class="card" style="text-align: center;">
          <p style="opacity: 0.6; margin-bottom: 10px;">Štart</p>
          <p class="stat-value" style="color: #94a3b8;">${b.recommendations?.starter?.adSpend || 300}€</p>
          <p style="opacity: 0.5; font-size: 0.85rem;">mesačne</p>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left;">
            <p style="font-size: 0.9rem;">~${b.recommendations?.starter?.expectedClicks || 400} klikov</p>
            <p style="font-size: 0.9rem;">~${b.recommendations?.starter?.expectedConversions || '15-25'} dopytov</p>
            <p style="font-size: 0.9rem; opacity: 0.6;">CPA: ${b.recommendations?.starter?.cpa || '12-17€'}</p>
          </div>
        </div>
        
        <div class="package-card featured">
          <p style="opacity: 0.8; margin-bottom: 10px;">⭐ Odporúčame</p>
          <p class="stat-value">${b.recommendations?.recommended?.adSpend || 500}€</p>
          <p style="opacity: 0.8; font-size: 0.85rem;">mesačne</p>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.3); text-align: left;">
            <p style="font-size: 0.9rem;">~${b.recommendations?.recommended?.expectedClicks || 700} klikov</p>
            <p style="font-size: 0.9rem;">~${b.recommendations?.recommended?.expectedConversions || '30-45'} dopytov</p>
            <p style="font-size: 0.9rem; opacity: 0.8;">CPA: ${b.recommendations?.recommended?.cpa || '11-16€'}</p>
          </div>
        </div>
        
        <div class="card" style="text-align: center;">
          <p style="opacity: 0.6; margin-bottom: 10px;">Agresívny</p>
          <p class="stat-value" style="color: #94a3b8;">${b.recommendations?.aggressive?.adSpend || 800}€</p>
          <p style="opacity: 0.5; font-size: 0.85rem;">mesačne</p>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left;">
            <p style="font-size: 0.9rem;">~${b.recommendations?.aggressive?.expectedClicks || 1200} klikov</p>
            <p style="font-size: 0.9rem;">~${b.recommendations?.aggressive?.expectedConversions || '50-70'} dopytov</p>
            <p style="font-size: 0.9rem; opacity: 0.6;">CPA: ${b.recommendations?.aggressive?.cpa || '10-15€'}</p>
          </div>
        </div>
      </div>
      
      <p style="margin-top: 30px; font-size: 0.9rem; opacity: 0.6; text-align: center;">
        💡 Reklamný rozpočet platíte priamo Google/Facebook. Nie je súčasťou ceny za správu kampaní.
      </p>
    </div>
  </div>

  <!-- Slide 10: ROI -->
  ${r.projection ? `
  <div class="slide" style="background: #0f0f1a;">
    <div class="slide-content">
      <h2 class="section-title">📈 Predpokladaná návratnosť</h2>
      <p class="section-subtitle">${r.explanation || ''}</p>
      
      <div class="grid-3">
        <div class="stat">
          <p class="stat-value gradient-text">${r.projection.monthlyLeads}</p>
          <p class="stat-label">Mesačných dopytov</p>
        </div>
        <div class="stat">
          <p class="stat-value gradient-text">${r.projection.monthlyRevenue}</p>
          <p class="stat-label">Potenciálny mesačný obrat</p>
        </div>
        <div class="stat">
          <p class="stat-value gradient-text">${r.projection.roi}</p>
          <p class="stat-label">Návratnosť investície</p>
        </div>
      </div>
      
      <div class="card" style="margin-top: 40px;">
        <h4 style="margin-bottom: 15px;">📊 Predpoklady výpočtu</h4>
        <div class="grid-3">
          <div>
            <p style="opacity: 0.6;">Priemerná hodnota objednávky</p>
            <p style="font-size: 1.2rem; font-weight: 600;">${r.assumptions?.averageOrderValue || 'N/A'}€</p>
          </div>
          <div>
            <p style="opacity: 0.6;">Konverzný pomer</p>
            <p style="font-size: 1.2rem; font-weight: 600;">${r.assumptions?.conversionRate || 'N/A'}</p>
          </div>
          <div>
            <p style="opacity: 0.6;">Hodnota zákazníka (LTV)</p>
            <p style="font-size: 1.2rem; font-weight: 600;">${r.assumptions?.customerLifetimeValue || 'N/A'}€</p>
          </div>
        </div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Slide 11: Timeline -->
  <div class="slide" style="background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);">
    <div class="slide-content">
      <h2 class="section-title">📅 Časový plán</h2>
      
      <div style="position: relative; padding-left: 40px;">
        <div style="position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, #FF6B35, #E91E63);"></div>
        
        <div style="position: relative; margin-bottom: 30px;">
          <div style="position: absolute; left: -33px; width: 20px; height: 20px; background: #FF6B35; border-radius: 50%;"></div>
          <div class="card">
            <h4 style="color: #FF6B35;">Týždeň 1</h4>
            <p style="opacity: 0.8;">${timeline.week1 || 'Nastavenie účtov a tracking'}</p>
          </div>
        </div>
        
        <div style="position: relative; margin-bottom: 30px;">
          <div style="position: absolute; left: -33px; width: 20px; height: 20px; background: #E91E63; border-radius: 50%;"></div>
          <div class="card">
            <h4 style="color: #E91E63;">Týždeň 2</h4>
            <p style="opacity: 0.8;">${timeline.week2 || 'Spustenie kampaní'}</p>
          </div>
        </div>
        
        <div style="position: relative; margin-bottom: 30px;">
          <div style="position: absolute; left: -33px; width: 20px; height: 20px; background: #9C27B0; border-radius: 50%;"></div>
          <div class="card">
            <h4 style="color: #9C27B0;">Týždeň 3-4</h4>
            <p style="opacity: 0.8;">${timeline.week3_4 || 'Optimalizácia a A/B testovanie'}</p>
          </div>
        </div>
        
        <div style="position: relative; margin-bottom: 30px;">
          <div style="position: absolute; left: -33px; width: 20px; height: 20px; background: #673AB7; border-radius: 50%;"></div>
          <div class="card">
            <h4 style="color: #673AB7;">Mesiac 2</h4>
            <p style="opacity: 0.8;">${timeline.month2 || 'Remarketing a rozšírenie'}</p>
          </div>
        </div>
        
        <div style="position: relative;">
          <div style="position: absolute; left: -33px; width: 20px; height: 20px; background: #3F51B5; border-radius: 50%;"></div>
          <div class="card">
            <h4 style="color: #3F51B5;">Mesiac 3+</h4>
            <p style="opacity: 0.8;">${timeline.month3 || 'Škálovanie a strategické odporúčania'}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Slide 12: Packages -->
  <div class="slide" style="background: #1a1a2e;">
    <div class="slide-content">
      <h2 class="section-title">💼 Naše balíčky</h2>
      <p class="section-subtitle">Na základe analýzy vám odporúčame balíček <strong style="color: #FF6B35;">${analysis.recommendedPackage || 'Pro'}</strong></p>
      
      <div class="grid-4">
        <div class="package-card ${analysis.recommendedPackage === 'Starter' ? 'featured' : ''}">
          <p class="package-name">🚀 Starter</p>
          <p class="package-price">149€</p>
          <p style="opacity: 0.6; margin-bottom: 20px;">/mesiac</p>
          <ul class="package-features">
            ${this.packages.starter.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        
        <div class="package-card ${analysis.recommendedPackage === 'Pro' ? 'featured' : ''}">
          <p class="package-name">⭐ Pro</p>
          <p class="package-price">249€</p>
          <p style="opacity: 0.6; margin-bottom: 20px;">/mesiac</p>
          <ul class="package-features">
            ${this.packages.pro.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        
        <div class="package-card ${analysis.recommendedPackage === 'Enterprise' ? 'featured' : ''}">
          <p class="package-name">💎 Enterprise</p>
          <p class="package-price">399€</p>
          <p style="opacity: 0.6; margin-bottom: 20px;">/mesiac</p>
          <ul class="package-features">
            ${this.packages.enterprise.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        
        <div class="package-card ${analysis.recommendedPackage === 'Premium' ? 'featured' : ''}">
          <p class="package-name">🏆 Premium</p>
          <p class="package-price">799€</p>
          <p style="opacity: 0.6; margin-bottom: 20px;">/mesiac</p>
          <ul class="package-features">
            ${this.packages.premium.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- Slide 13: CTA -->
  <div class="slide title-slide">
    <div class="decoration-circle" style="width: 600px; height: 600px; top: -300px; left: -300px;"></div>
    <div class="slide-content">
      <h2 class="section-title gradient-text" style="font-size: 3rem;">Začnime spoluprácu</h2>
      <p style="font-size: 1.2rem; opacity: 0.8; max-width: 600px; margin: 0 auto 40px;">
        ${analysis.customNote || 'Sme pripravení pomôcť vám rásť online. Kontaktujte nás pre nezáväznú konzultáciu.'}
      </p>
      
      <div class="card card-highlight" style="max-width: 500px; margin: 0 auto;">
        <p style="font-size: 1.1rem; margin-bottom: 20px;">📧 <strong>info@adlify.eu</strong></p>
        <p style="font-size: 1.1rem; margin-bottom: 20px;">📞 <strong>+421 XXX XXX XXX</strong></p>
        <p style="font-size: 1.1rem;">🌐 <strong>www.adlify.eu</strong></p>
      </div>
      
      <img src="https://adlify.eu/wp-content/uploads/2025/05/logo_na_sirku.png" alt="Adlify" class="logo-large" style="margin-top: 60px; opacity: 0.8;">
    </div>
  </div>

  <div class="footer">
    <p>© 2025 Adlify.eu | Vytvorené s ❤️ pre ${c.name || lead.company_name}</p>
    <p style="margin-top: 10px;">Táto prezentácia je dôverná a je určená výhradne pre ${c.name || lead.company_name}</p>
  </div>

</body>
</html>`;
  },

  // Import/Add handlers
  async handleImport() {
    const textarea = document.getElementById('import-domains');
    const text = textarea.value.trim();
    if (!text) return Utils.toast('Zadaj domény', 'warning');
    
    const domains = text.split('\n')
      .map(d => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
      .filter(d => d.includes('.'));
    
    let added = 0, skipped = 0;
    for (const domain of domains) {
      try {
        const existing = await Database.select('leads', { filters: { domain }, limit: 1 });
        if (existing?.length > 0) { skipped++; continue; }
        await Database.insert('leads', { domain, company_name: domain.split('.')[0], status: 'new', score: 50 });
        added++;
      } catch (e) { console.error('Import error:', e); }
    }
    
    Utils.toast(`Pridaných: ${added}, Preskočených: ${skipped}`, 'success');
    textarea.value = '';
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },

  async handleAdd() {
    const name = document.getElementById('add-name').value.trim();
    if (!name) return Utils.toast('Zadaj názov firmy', 'warning');
    
    const domain = document.getElementById('add-domain').value.trim();
    const industry = document.getElementById('add-industry').value.trim();
    const city = document.getElementById('add-city').value.trim();
    
    await Database.insert('leads', {
      domain: domain || `${name.toLowerCase().replace(/\s+/g, '-')}.local`,
      company_name: name,
      status: 'new',
      score: 50,
      analysis: { company: { industry, location: city } }
    });
    
    Utils.toast('Lead pridaný!', 'success');
    ['add-name', 'add-domain', 'add-industry', 'add-city'].forEach(id => document.getElementById(id).value = '');
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },

  async analyzeSelected() {
    if (this.selectedIds.size === 0) return Utils.toast('Označ leady', 'warning');
    for (const id of this.selectedIds) await this.analyze(id);
    this.selectedIds.clear();
  },

  async deleteSelected() {
    if (this.selectedIds.size === 0) return Utils.toast('Označ leady', 'warning');
    if (!await Utils.confirm(`Vymazať ${this.selectedIds.size} leadov?`)) return;
    for (const id of this.selectedIds) await Database.delete('leads', id);
    this.selectedIds.clear();
    Utils.toast('Vymazané', 'success');
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  }
};

window.LeadsModule = LeadsModule;
