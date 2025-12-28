/**
 * ADLIFY PLATFORM - Leads Module
 * @version 1.1.0
 */

const LeadsModule = {
  id: 'leads',
  name: 'Leady',
  icon: '👥',
  title: 'Leady',
  subtitle: 'Správa potenciálnych klientov',
  
  menu: {
    section: 'main',
    order: 20
  },
  
  permissions: ['leads', 'view'],
  
  // State
  leads: [],
  selectedIds: new Set(),
  filters: {
    status: '',
    search: '',
    minScore: ''
  },
  
  // Edge Function URL
  ANALYZE_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/analyze-lead',
  
  /**
   * Initialize module
   */
  init() {
    console.log('👥 Leads module initialized');
  },
  
  /**
   * Render leads page
   */
  async render(container, params = {}) {
    if (params.status) this.filters.status = params.status;
    
    container.innerHTML = this.templateLoading();
    
    try {
      await this.loadLeads();
      container.innerHTML = this.template();
      this.setupEventListeners();
      
      if (params.action === 'analyze-all') {
        this.analyzeAllNew();
      }
      
    } catch (error) {
      console.error('Leads error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  /**
   * Load leads from database
   */
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
  
  /**
   * Main template
   */
  template() {
    return `
      <div class="flex gap-2 mb-6">
        <button onclick="LeadsModule.showTab('list')" class="tab-btn active" data-tab="list">📋 Zoznam</button>
        <button onclick="LeadsModule.showTab('import')" class="tab-btn" data-tab="import">📥 Import</button>
        <button onclick="LeadsModule.showTab('add')" class="tab-btn" data-tab="add">✏️ Pridať</button>
      </div>
      
      <div id="tab-list" class="tab-content">
        <div class="card p-4 mb-4 flex flex-wrap gap-4 items-center">
          <input type="text" id="filter-search" placeholder="🔍 Hľadať..." value="${this.filters.search}"
            class="flex-1 min-w-[200px] p-2 border rounded-lg" onkeyup="LeadsModule.onSearchChange(this.value)">
          
          <select id="filter-status" class="p-2 border rounded-lg" onchange="LeadsModule.onStatusChange(this.value)">
            <option value="">Všetky stavy</option>
            <option value="new" ${this.filters.status === 'new' ? 'selected' : ''}>🆕 Nové</option>
            <option value="analyzed" ${this.filters.status === 'analyzed' ? 'selected' : ''}>🤖 Analyzované</option>
            <option value="contacted" ${this.filters.status === 'contacted' ? 'selected' : ''}>📧 Kontaktované</option>
            <option value="converted" ${this.filters.status === 'converted' ? 'selected' : ''}>✅ Klienti</option>
          </select>
          
          <select id="filter-score" class="p-2 border rounded-lg" onchange="LeadsModule.onScoreChange(this.value)">
            <option value="">Akékoľvek skóre</option>
            <option value="80">⭐ 80+</option>
            <option value="60">👍 60+</option>
          </select>
          
          <div class="flex gap-2">
            <button onclick="LeadsModule.selectAll()" class="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">☑️ Všetky</button>
            <button onclick="LeadsModule.analyzeSelected()" class="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">🤖 Analyzovať</button>
            <button onclick="LeadsModule.deleteSelected()" class="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">🗑️</button>
          </div>
        </div>
        
        <div class="card overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span class="font-medium">Leady (<span id="leads-count">${this.leads.length}</span>)</span>
          </div>
          <div id="leads-list" class="divide-y max-h-[60vh] overflow-y-auto">
            ${this.renderLeadsList()}
          </div>
        </div>
      </div>
      
      <div id="tab-import" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">📥 Import domén</h2>
          <div class="grid md:grid-cols-4 gap-4">
            <div class="md:col-span-3">
              <textarea id="import-domains" rows="8" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk" 
                class="w-full p-3 border rounded-xl font-mono text-sm"></textarea>
            </div>
            <div class="space-y-4">
              <button onclick="LeadsModule.handleImport()" class="w-full gradient-bg text-white font-semibold py-3 rounded-xl">
                📥 Importovať
              </button>
              <div class="text-sm text-gray-500">
                <p class="font-medium mb-1">Formát:</p>
                <p>Jedna doména na riadok</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div id="tab-add" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">✏️ Pridať lead manuálne</h2>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Názov firmy *</label>
              <input type="text" id="add-name" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Doména</label>
              <input type="text" id="add-domain" placeholder="firma.sk" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Odvetvie *</label>
              <input type="text" id="add-industry" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Mesto *</label>
              <input type="text" id="add-city" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Email</label>
              <input type="email" id="add-email" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Telefón</label>
              <input type="tel" id="add-phone" class="w-full p-3 border rounded-xl">
            </div>
          </div>
          <div class="mt-6">
            <button onclick="LeadsModule.handleAdd()" class="gradient-bg text-white font-semibold px-8 py-3 rounded-xl">
              ➕ Pridať lead
            </button>
          </div>
        </div>
      </div>
      
      <!-- Analysis Modal -->
      <div id="analysis-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between">
            <h2 class="text-xl font-bold">🤖 AI Analýza</h2>
            <button onclick="LeadsModule.closeModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div id="analysis-content" class="p-6 overflow-y-auto flex-1">
            <!-- Content will be loaded here -->
          </div>
          <div class="p-4 border-t flex gap-3 justify-end">
            <button onclick="LeadsModule.closeModal()" class="px-4 py-2 bg-gray-100 rounded-lg">Zavrieť</button>
            <button onclick="LeadsModule.generateProposal()" class="px-4 py-2 gradient-bg text-white rounded-lg">📄 Generovať ponuku</button>
          </div>
        </div>
      </div>
      
      <style>
        .tab-btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; background: #f3f4f6; }
        .tab-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .tab-content.hidden { display: none; }
      </style>
    `;
  },
  
  renderLeadsList() {
    if (this.leads.length === 0) {
      return '<div class="p-8 text-center text-gray-400">Žiadne leady</div>';
    }
    
    return this.leads.map(lead => {
      const a = lead.analysis || {};
      const hasAnalysis = a.company || a.strategy;
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
              ${a.city || a.company?.location ? '📍' + (a.city || a.company?.location) : ''} 
              ${a.industry || a.company?.services?.[0] ? '· ' + (a.industry || a.company?.services?.[0]) : ''}
            </div>
          </div>
          
          ${Utils.scoreBadge(lead.score)}
          
          <div class="flex gap-1">
            <button onclick="LeadsModule.analyze('${lead.id}')" class="p-2 hover:bg-purple-100 rounded-lg text-sm" title="Analyzovať">🤖</button>
            ${hasAnalysis ? `<button onclick="LeadsModule.showAnalysis('${lead.id}')" class="p-2 hover:bg-blue-100 rounded-lg text-sm" title="Zobraziť analýzu">📊</button>` : ''}
            ${hasAnalysis ? `<button onclick="LeadsModule.generateProposalFor('${lead.id}')" class="p-2 hover:bg-green-100 rounded-lg text-sm" title="Generovať ponuku">📄</button>` : ''}
            <button onclick="LeadsModule.showActions('${lead.id}')" class="p-2 hover:bg-gray-100 rounded-lg text-sm" title="Akcie">⚙️</button>
          </div>
        </div>
      `;
    }).join('');
  },
  
  templateLoading() {
    return '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
  },
  
  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  
  setupEventListeners() {
    let searchTimeout;
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.onSearchChange(e.target.value), 300);
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
  
  async onScoreChange(value) {
    this.filters.minScore = value;
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  },
  
  selectAll() {
    this.leads.forEach(l => this.selectedIds.add(l.id));
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },
  
  // ==========================================
  // ANALYSIS FUNCTIONS
  // ==========================================
  
  currentLeadId: null,
  currentAnalysis: null,
  
  async analyze(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    
    this.currentLeadId = id;
    
    // Show modal with loading
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    content.innerHTML = `
      <div class="text-center py-12">
        <div class="animate-spin text-5xl mb-4">🤖</div>
        <h3 class="text-xl font-bold mb-2">Analyzujem ${lead.company_name || lead.domain}...</h3>
        <p class="text-gray-500">Sťahujem web a vytváram AI analýzu</p>
      </div>
    `;
    
    try {
      // Call Edge Function
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      const response = await fetch(this.ANALYZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          websiteUrl: lead.domain ? `https://${lead.domain}` : null,
          companyName: lead.company_name,
          leadId: lead.id
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Analýza zlyhala');
      }
      
      this.currentAnalysis = result.analysis;
      
      // Save to database
      await Database.update('leads', id, {
        analysis: result.analysis,
        status: 'analyzed',
        score: this.calculateScore(result.analysis),
        analyzed_at: new Date().toISOString()
      });
      
      // Show results
      this.renderAnalysisResults(lead, result.analysis);
      
      // Refresh list
      await this.loadLeads();
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      
      Utils.toast('Analýza dokončená!', 'success');
      
    } catch (error) {
      console.error('Analysis error:', error);
      content.innerHTML = `
        <div class="text-center py-12">
          <div class="text-5xl mb-4">❌</div>
          <h3 class="text-xl font-bold mb-2">Chyba pri analýze</h3>
          <p class="text-gray-500">${error.message}</p>
          <button onclick="LeadsModule.analyze('${id}')" class="mt-4 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg">Skúsiť znova</button>
        </div>
      `;
    }
  },
  
  calculateScore(analysis) {
    let score = 50;
    if (analysis.company?.services?.length > 2) score += 10;
    if (analysis.company?.location) score += 10;
    if (analysis.keywords?.length > 5) score += 10;
    if (analysis.strategy?.recommended_platforms?.length > 1) score += 10;
    if (analysis.roi_projection) score += 10;
    return Math.min(score, 100);
  },
  
  renderAnalysisResults(lead, analysis) {
    const content = document.getElementById('analysis-content');
    const c = analysis.company || {};
    const s = analysis.strategy || {};
    
    content.innerHTML = `
      <div class="space-y-6">
        <!-- Company Info -->
        <div class="bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl p-6">
          <h3 class="text-2xl font-bold mb-2">${c.name || lead.company_name || 'Firma'}</h3>
          <p class="opacity-90">${c.description || 'Marketingová analýza'}</p>
          ${c.location ? `<p class="mt-2 opacity-75">📍 ${c.location}</p>` : ''}
        </div>
        
        <!-- Services -->
        ${c.services?.length ? `
        <div class="bg-gray-50 rounded-xl p-4">
          <h4 class="font-bold mb-3">🛠️ Služby</h4>
          <div class="flex flex-wrap gap-2">
            ${c.services.map(s => `<span class="px-3 py-1 bg-white rounded-full text-sm">${s}</span>`).join('')}
          </div>
        </div>
        ` : ''}
        
        <!-- Strengths & Weaknesses -->
        <div class="grid md:grid-cols-2 gap-4">
          ${c.strengths?.length ? `
          <div class="bg-green-50 rounded-xl p-4">
            <h4 class="font-bold mb-3 text-green-700">✅ Silné stránky</h4>
            <ul class="space-y-2">
              ${c.strengths.map(s => `<li class="text-sm">• ${s}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
          ${c.weaknesses?.length ? `
          <div class="bg-orange-50 rounded-xl p-4">
            <h4 class="font-bold mb-3 text-orange-700">⚠️ Oblasti na zlepšenie</h4>
            <ul class="space-y-2">
              ${c.weaknesses.map(w => `<li class="text-sm">• ${w}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
        </div>
        
        <!-- Strategy -->
        ${s.recommended_platforms?.length ? `
        <div class="bg-purple-50 rounded-xl p-4">
          <h4 class="font-bold mb-3 text-purple-700">🎯 Odporúčaná stratégia</h4>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm font-medium mb-2">Platformy:</p>
              <div class="flex flex-wrap gap-2">
                ${s.recommended_platforms.map(p => `<span class="px-3 py-1 bg-purple-100 rounded-full text-sm">${p}</span>`).join('')}
              </div>
            </div>
            <div>
              <p class="text-sm font-medium mb-2">Cieľová skupina:</p>
              <p class="text-sm">${s.target_audience || 'N/A'}</p>
            </div>
          </div>
          ${s.main_message ? `<p class="mt-4 p-3 bg-white rounded-lg text-sm italic">"${s.main_message}"</p>` : ''}
        </div>
        ` : ''}
        
        <!-- Keywords -->
        ${analysis.keywords?.length ? `
        <div class="bg-gray-900 text-white rounded-xl p-4">
          <h4 class="font-bold mb-3">🔍 Kľúčové slová</h4>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left py-2">Kľúčové slovo</th>
                <th class="text-center py-2">Hľadanosť</th>
                <th class="text-center py-2">Konkurencia</th>
                <th class="text-right py-2">CPC</th>
              </tr>
            </thead>
            <tbody>
              ${analysis.keywords.slice(0, 10).map(k => `
                <tr class="border-b border-gray-800">
                  <td class="py-2">${k.keyword}</td>
                  <td class="text-center">${k.search_volume}</td>
                  <td class="text-center">${k.competition}</td>
                  <td class="text-right">${k.cpc_estimate}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
        
        <!-- Budget -->
        ${analysis.budget_recommendation ? `
        <div class="bg-orange-50 rounded-xl p-4">
          <h4 class="font-bold mb-3 text-orange-700">💰 Odporúčaný rozpočet</h4>
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-white rounded-xl p-4 text-center">
              <p class="text-2xl font-bold">${analysis.budget_recommendation.starter?.monthly || 250}€</p>
              <p class="text-xs text-gray-500">Štart</p>
              <p class="text-xs mt-1">~${analysis.budget_recommendation.starter?.expected_clicks || 500} klikov</p>
            </div>
            <div class="bg-white rounded-xl p-4 text-center border-2 border-orange-400">
              <p class="text-xs text-orange-500 font-bold mb-1">Odporúčame</p>
              <p class="text-2xl font-bold">${analysis.budget_recommendation.recommended?.monthly || 450}€</p>
              <p class="text-xs text-gray-500">Optimum</p>
              <p class="text-xs mt-1">~${analysis.budget_recommendation.recommended?.expected_clicks || 1000} klikov</p>
            </div>
            <div class="bg-white rounded-xl p-4 text-center">
              <p class="text-2xl font-bold">${analysis.budget_recommendation.aggressive?.monthly || 700}€</p>
              <p class="text-xs text-gray-500">Agresívny</p>
              <p class="text-xs mt-1">~${analysis.budget_recommendation.aggressive?.expected_clicks || 1800} klikov</p>
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- ROI -->
        ${analysis.roi_projection ? `
        <div class="bg-green-50 rounded-xl p-4">
          <h4 class="font-bold mb-3 text-green-700">📈 Predpokladaná návratnosť</h4>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <p class="text-2xl font-bold text-green-600">${analysis.roi_projection.expected_conversions}</p>
              <p class="text-xs text-gray-500">Očakávané konverzie</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-green-600">${analysis.roi_projection.conversion_rate}</p>
              <p class="text-xs text-gray-500">Konverzný pomer</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-green-600">${analysis.roi_projection.estimated_revenue || 'N/A'}</p>
              <p class="text-xs text-gray-500">Odhadovaný výnos</p>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  },
  
  showAnalysis(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.analysis) return;
    
    this.currentLeadId = id;
    this.currentAnalysis = lead.analysis;
    
    const modal = document.getElementById('analysis-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    this.renderAnalysisResults(lead, lead.analysis);
  },
  
  closeModal() {
    const modal = document.getElementById('analysis-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  },
  
  async generateProposal() {
    if (!this.currentLeadId || !this.currentAnalysis) {
      return Utils.toast('Najprv spusti analýzu', 'warning');
    }
    this.generateProposalFor(this.currentLeadId);
  },
  
  async generateProposalFor(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.analysis) {
      return Utils.toast('Lead nemá analýzu', 'warning');
    }
    
    Utils.toast('Generujem ponuku...', 'info');
    
    // TODO: Generate HTML proposal based on template
    // For now, open in new tab with basic template
    const proposal = this.generateProposalHTML(lead, lead.analysis);
    const blob = new Blob([proposal], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },
  
  generateProposalHTML(lead, analysis) {
    const c = analysis.company || {};
    const s = analysis.strategy || {};
    const b = analysis.budget_recommendation || {};
    
    return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Návrh marketingovej stratégie - ${c.name || lead.company_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    :root { --orange: #FF6B35; --pink: #E91E63; --purple: #9C27B0; --dark: #1a1a2e; --gradient: linear-gradient(135deg, #FF6B35 0%, #E91E63 50%, #9C27B0 100%); }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Poppins', sans-serif; background: #f8f9fa; color: var(--dark); line-height: 1.6; }
    .slide { max-width: 1000px; margin: 40px auto; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow: hidden; }
    .slide-title { min-height: 400px; background: var(--gradient); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 60px; color: white; }
    .slide-title h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 15px; }
    .slide-title .subtitle { font-size: 1.2rem; opacity: 0.9; }
    .slide-content { padding: 50px; }
    .section-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid var(--orange); }
    .card { background: #f8f9fa; border-radius: 16px; padding: 25px; margin-bottom: 20px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .packages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
    .package { background: white; border: 2px solid #eee; border-radius: 16px; padding: 25px; text-align: center; }
    .package.recommended { border-color: var(--orange); }
    .package h3 { margin-bottom: 10px; }
    .package .price { font-size: 2rem; font-weight: 700; color: var(--orange); }
    .adlify-footer { text-align: center; padding: 30px; color: #999; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="slide-title">
      <h1>Návrh online marketingovej stratégie</h1>
      <p class="subtitle">${c.name || lead.company_name || lead.domain}</p>
    </div>
  </div>
  
  <div class="slide">
    <div class="slide-content">
      <h2 class="section-title">O firme</h2>
      <p>${c.description || 'Marketingová analýza vašej firmy.'}</p>
      ${c.services?.length ? `<div class="card"><strong>Služby:</strong> ${c.services.join(', ')}</div>` : ''}
      ${c.location ? `<div class="card"><strong>Lokalita:</strong> ${c.location}</div>` : ''}
    </div>
  </div>
  
  <div class="slide">
    <div class="slide-content">
      <h2 class="section-title">Odporúčaná stratégia</h2>
      <div class="grid-2">
        <div class="card">
          <h4>🎯 Platformy</h4>
          <p>${s.recommended_platforms?.join(', ') || 'Google Ads, Facebook/Instagram'}</p>
        </div>
        <div class="card">
          <h4>👥 Cieľová skupina</h4>
          <p>${s.target_audience || 'Potenciálni zákazníci vo vašom regióne'}</p>
        </div>
      </div>
    </div>
  </div>
  
  <div class="slide">
    <div class="slide-content">
      <h2 class="section-title">Cenové balíčky</h2>
      <div class="packages">
        <div class="package">
          <h3>🚀 Starter</h3>
          <div class="price">149€</div>
          <p>/mesiac</p>
        </div>
        <div class="package recommended">
          <h3>⭐ Pro</h3>
          <div class="price">249€</div>
          <p>/mesiac</p>
          <small>Odporúčame</small>
        </div>
        <div class="package">
          <h3>💎 Enterprise</h3>
          <div class="price">399€</div>
          <p>/mesiac</p>
        </div>
      </div>
      <div class="card">
        <h4>💰 Odporúčaný reklamný rozpočet</h4>
        <p>Štart: ${b.starter?.monthly || 250}€ | Optimum: ${b.recommended?.monthly || 450}€ | Agresívny: ${b.aggressive?.monthly || 700}€</p>
      </div>
    </div>
  </div>
  
  <div class="slide">
    <div class="slide-content">
      <h2 class="section-title">Začnime spoluprácu</h2>
      <p>Kontaktujte nás pre nezáväznú konzultáciu.</p>
      <div class="card" style="margin-top: 30px;">
        <p><strong>📧 Email:</strong> info@adlify.eu</p>
        <p><strong>🌐 Web:</strong> www.adlify.eu</p>
      </div>
    </div>
  </div>
  
  <div class="adlify-footer">
    <p>Vytvorené pomocou ADLIFY | www.adlify.eu</p>
  </div>
</body>
</html>`;
  },
  
  // ==========================================
  // OTHER ACTIONS
  // ==========================================
  
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
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }
        
        await Database.insert('leads', {
          domain,
          company_name: domain.split('.')[0],
          status: 'new',
          score: 50
        });
        added++;
      } catch (e) {
        console.error('Import error:', e);
      }
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
    const industry = document.getElementById('add-industry').value.trim();
    const city = document.getElementById('add-city').value.trim();
    
    if (!name || !industry || !city) {
      return Utils.toast('Vyplň povinné polia', 'warning');
    }
    
    const domain = document.getElementById('add-domain').value.trim();
    const email = document.getElementById('add-email').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    
    const analysis = { industry, city, company_name: name };
    if (email) analysis.email = email;
    if (phone) analysis.phone = phone;
    
    try {
      await Database.insert('leads', {
        domain: domain || `${Utils.slugify(name)}.local`,
        company_name: name,
        status: 'new',
        score: 60,
        analysis
      });
      
      Utils.toast('Lead pridaný!', 'success');
      
      ['add-name', 'add-domain', 'add-industry', 'add-city', 'add-email', 'add-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      
      await this.loadLeads();
      this.showTab('list');
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      document.getElementById('leads-count').textContent = this.leads.length;
      
    } catch (e) {
      Utils.toast('Chyba: ' + e.message, 'error');
    }
  },
  
  async analyzeSelected() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Označ leady', 'warning');
    }
    
    Utils.toast(`Analyzujem ${this.selectedIds.size} leadov...`, 'info');
    
    for (const id of this.selectedIds) {
      await this.analyze(id);
    }
    
    this.selectedIds.clear();
    Utils.toast('Analýza dokončená!', 'success');
  },
  
  async analyzeAllNew() {
    const newLeads = this.leads.filter(l => l.status === 'new');
    if (newLeads.length === 0) {
      return Utils.toast('Žiadne nové leady', 'info');
    }
    
    Utils.toast(`Analyzujem ${newLeads.length} nových leadov...`, 'info');
    
    for (const lead of newLeads) {
      await this.analyze(lead.id);
    }
    
    Utils.toast('Všetky analýzy dokončené!', 'success');
  },
  
  async deleteSelected() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Označ leady', 'warning');
    }
    
    const confirmed = await Utils.confirm(`Vymazať ${this.selectedIds.size} leadov?`);
    if (!confirmed) return;
    
    for (const id of this.selectedIds) {
      await Database.delete('leads', id);
    }
    
    this.selectedIds.clear();
    Utils.toast('Leady vymazané', 'success');
    
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  
  showActions(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    
    const actions = [
      { label: '🤖 Analyzovať', action: () => this.analyze(id) },
      { label: '📄 Generovať ponuku', action: () => this.generateProposalFor(id) },
      { label: '✅ Previesť na klienta', action: () => this.convertToClient(id) },
      { label: '🗑️ Vymazať', action: () => this.deleteLead(id), danger: true }
    ];
    
    // Simple dropdown - TODO: better UI
    const action = prompt('Akcie:\n1 - Analyzovať\n2 - Ponuka\n3 - Previesť na klienta\n4 - Vymazať\n\nZadaj číslo:');
    if (action === '1') this.analyze(id);
    if (action === '2') this.generateProposalFor(id);
    if (action === '3') this.convertToClient(id);
    if (action === '4') this.deleteLead(id);
  },
  
  async convertToClient(id) {
    Utils.toast('Prevod na klienta - TODO', 'info');
  },
  
  async deleteLead(id) {
    const confirmed = await Utils.confirm('Vymazať tento lead?');
    if (!confirmed) return;
    
    await Database.delete('leads', id);
    Utils.toast('Lead vymazaný', 'success');
    
    await this.loadLeads();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  }
};

// Export
window.LeadsModule = LeadsModule;
