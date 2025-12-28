/**
 * ADLIFY PLATFORM - Leads Module v2.1
 * Professional AI Analysis & Proposal Generation - Light Theme
 */

const LeadsModule = {
  id: 'leads',
  name: 'Leady',
  icon: '👥',
  title: 'Leady',
  subtitle: 'Správa potenciálnych klientov',
  
  menu: { section: 'main', order: 20 },
  permissions: ['leads', 'view'],
  
  leads: [],
  selectedIds: new Set(),
  filters: { status: '', search: '', minScore: '' },
  currentLeadId: null,
  currentAnalysis: null,
  editedAnalysis: null,
  
  ANALYZE_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/analyze-lead',
  
  CONTACT: {
    phone: '+421 944 184 045',
    email: 'info@adlify.eu',
    web: 'www.adlify.eu'
  },
  
  packages: {
    starter: { name: 'Starter', price: 149, description: 'Ideálne pre živnostníkov', features: ['1 reklamná platforma', '1 kampaň', '2 reklamné vizuály', 'Reklamné texty', 'Základná optimalizácia', 'Mesačný report', 'Email podpora'] },
    pro: { name: 'Pro', price: 249, description: 'Pre firmy na viacerých platformách', features: ['2 platformy (FB/IG + Google)', 'Až 3 kampane', '4 reklamné vizuály', 'A/B testovanie', 'Optimalizácia každé 2 týždne', 'Detailný report', 'Email + telefón podpora'] },
    enterprise: { name: 'Enterprise', price: 399, description: 'Pre e-shopy a väčšie firmy', features: ['Všetky platformy + remarketing', 'Až 5 kampaní', '8 vizuálov', 'Pokročilé A/B testovanie', 'Týždenná optimalizácia', 'Strategické konzultácie', 'Prioritná podpora'] },
    premium: { name: 'Premium', price: 799, description: 'VIP riešenie', features: ['Všetky platformy', 'Neobmedzené kampane', 'Neobmedzené vizuály', 'Dedikovaný account manager', 'Denná optimalizácia', 'Mesačné stretnutia', '24/7 VIP podpora'] }
  },

  init() { console.log('👥 Leads module v2.1 initialized'); },
  
  async render(container, params = {}) {
    if (params.status) this.filters.status = params.status;
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
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
      this.leads = this.leads.filter(l => (l.company_name || '').toLowerCase().includes(search) || (l.domain || '').toLowerCase().includes(search));
    }
    if (this.filters.minScore) this.leads = this.leads.filter(l => (l.score || 0) >= parseInt(this.filters.minScore));
  },

  template() {
    return `
      <div class="flex gap-2 mb-6">
        <button onclick="LeadsModule.showTab('list')" class="tab-btn active" data-tab="list">📋 Zoznam</button>
        <button onclick="LeadsModule.showTab('import')" class="tab-btn" data-tab="import">📥 Import</button>
        <button onclick="LeadsModule.showTab('add')" class="tab-btn" data-tab="add">✏️ Pridať</button>
      </div>
      <div id="tab-list" class="tab-content">
        <div class="card p-4 mb-4 flex flex-wrap gap-4 items-center">
          <input type="text" id="filter-search" placeholder="🔍 Hľadať..." value="${this.filters.search}" class="flex-1 min-w-[200px] p-2 border rounded-lg">
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
          <div class="px-4 py-3 bg-gray-50 border-b"><span class="font-medium">Leady (<span id="leads-count">${this.leads.length}</span>)</span></div>
          <div id="leads-list" class="divide-y max-h-[60vh] overflow-y-auto">${this.renderLeadsList()}</div>
        </div>
      </div>
      <div id="tab-import" class="tab-content hidden">
        <div class="card p-6">
          <h2 class="text-xl font-bold mb-4">📥 Import domén</h2>
          <div class="grid md:grid-cols-4 gap-4">
            <div class="md:col-span-3"><textarea id="import-domains" rows="8" placeholder="firma1.sk&#10;firma2.sk" class="w-full p-3 border rounded-xl font-mono text-sm"></textarea></div>
            <div class="space-y-4"><button onclick="LeadsModule.handleImport()" class="w-full gradient-bg text-white font-semibold py-3 rounded-xl">📥 Importovať</button><p class="text-sm text-gray-500">Jedna doména na riadok</p></div>
          </div>
        </div>
      </div>
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
      <div id="analysis-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 class="text-xl font-bold">🤖 AI Analýza</h2>
            <button onclick="LeadsModule.closeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="analysis-content" class="p-6 overflow-y-auto flex-1"></div>
          <div class="p-4 border-t flex gap-3 justify-between bg-gray-50">
            <button onclick="LeadsModule.closeModal()" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Zavrieť</button>
            <div class="flex gap-3">
              <button onclick="LeadsModule.editAnalysis()" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">✏️ Upraviť</button>
              <button onclick="LeadsModule.generateProposal()" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold">📄 Generovať ponuku</button>
            </div>
          </div>
        </div>
      </div>
      <div id="edit-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between"><h2 class="text-xl font-bold">✏️ Upraviť analýzu</h2><button onclick="LeadsModule.closeEditModal()" class="p-2 hover:bg-gray-100 rounded-lg">✕</button></div>
          <div id="edit-content" class="p-6 overflow-y-auto flex-1"></div>
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
        .stat-card { background: white; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-card .value { font-size: 1.5rem; font-weight: 700; color: #FF6B35; }
        .stat-card .label { font-size: 0.8rem; color: #6b7280; }
      </style>
    `;
  },

  renderLeadsList() {
    if (this.leads.length === 0) return '<div class="p-8 text-center text-gray-400">Žiadne leady</div>';
    return this.leads.map(lead => {
      const a = lead.analysis || {};
      const hasAnalysis = a.company || a.analysis;
      return `
        <div class="px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
          <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} onchange="LeadsModule.toggleSelect('${lead.id}')" class="w-4 h-4 rounded">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-0.5">
              <strong class="truncate">${lead.company_name || lead.domain || 'Neznámy'}</strong>
              ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="text-xs text-primary hover:underline">${lead.domain}</a>` : ''}
              ${Utils.statusBadge(lead.status, 'lead')}
              ${hasAnalysis ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Analyzované</span>' : ''}
            </div>
            <div class="text-xs text-gray-500">${a.company?.location ? '📍 ' + a.company.location : ''} ${a.company?.industry ? '• ' + a.company.industry : ''}</div>
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

  setupEventListeners() {
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', (e) => { clearTimeout(timeout); timeout = setTimeout(() => this.onSearchChange(e.target.value), 300); });
    }
  },

  showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  },

  async onSearchChange(value) { this.filters.search = value; await this.loadLeads(); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); document.getElementById('leads-count').textContent = this.leads.length; },
  async onStatusChange(value) { this.filters.status = value; await this.loadLeads(); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); document.getElementById('leads-count').textContent = this.leads.length; },
  toggleSelect(id) { if (this.selectedIds.has(id)) this.selectedIds.delete(id); else this.selectedIds.add(id); },
  selectAll() { this.leads.forEach(l => this.selectedIds.add(l.id)); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); },

  async analyze(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    this.currentLeadId = id;
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `<div class="text-center py-16"><div class="animate-spin text-6xl mb-6">🤖</div><h3 class="text-2xl font-bold mb-2">Analyzujem ${lead.company_name || lead.domain}...</h3><p class="text-gray-500">Sťahujem web, analyzujem konkurenciu a pripravujem stratégiu</p><p class="text-sm text-gray-400 mt-4">Toto môže trvať 15-30 sekúnd</p></div>`;
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      const response = await fetch(this.ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ websiteUrl: lead.domain ? `https://${lead.domain}` : null, companyName: lead.company_name, leadId: lead.id })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Analýza zlyhala');
      this.currentAnalysis = result.analysis;
      this.editedAnalysis = JSON.parse(JSON.stringify(result.analysis));
      await Database.update('leads', id, { analysis: result.analysis, status: 'analyzed', score: this.calculateScore(result.analysis), analyzed_at: new Date().toISOString() });
      this.renderAnalysisResults(lead, result.analysis);
      await this.loadLeads();
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      Utils.toast('Analýza dokončená!', 'success');
    } catch (error) {
      console.error('Analysis error:', error);
      content.innerHTML = `<div class="text-center py-16"><div class="text-6xl mb-6">❌</div><h3 class="text-xl font-bold mb-2">Chyba pri analýze</h3><p class="text-gray-500 mb-4">${error.message}</p><button onclick="LeadsModule.analyze('${id}')" class="px-6 py-2 bg-purple-100 text-purple-700 rounded-lg">Skúsiť znova</button></div>`;
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
    const b = analysis.budget || {};
    const r = analysis.roi || {};
    
    content.innerHTML = `
      <div class="bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl p-6 mb-6">
        <h2 class="text-3xl font-bold mb-2">${c.name || lead.company_name || 'Firma'}</h2>
        <p class="opacity-90 text-lg">${c.description || ''}</p>
        ${c.location ? `<p class="mt-3 opacity-75">📍 ${c.location}</p>` : ''}
      </div>
      ${a.humanWrittenIntro ? `<div class="analysis-section border-l-4 border-orange-500"><h3>💡 Naše zistenia</h3><p class="text-gray-700 leading-relaxed">${a.humanWrittenIntro}</p></div>` : ''}
      ${c.services?.length ? `<div class="analysis-section"><h3>🛠️ Služby</h3><div class="flex flex-wrap gap-2">${c.services.map(s => `<span class="tag tag-blue">${s}</span>`).join('')}</div></div>` : ''}
      ${o.summary ? `<div class="analysis-section"><h3>🌐 Online prítomnosť</h3><p class="text-gray-600 mb-4">${o.summary}</p><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><div class="stat-card"><div class="value">${o.website?.exists ? '✅' : '❌'}</div><div class="label">Web</div></div><div class="stat-card"><div class="value">${o.socialMedia?.facebook?.exists ? '✅' : '❌'}</div><div class="label">Facebook</div></div><div class="stat-card"><div class="value">${o.socialMedia?.instagram?.exists ? '✅' : '❌'}</div><div class="label">Instagram</div></div><div class="stat-card"><div class="value">${o.paidAds?.detected ? '✅' : '❌'}</div><div class="label">Reklama</div></div></div></div>` : ''}
      ${a.swot ? `<div class="analysis-section"><h3>📊 SWOT Analýza</h3><div class="grid md:grid-cols-2 gap-4"><div class="bg-green-50 rounded-lg p-4"><h4 class="font-semibold text-green-700 mb-2">💪 Silné stránky</h4><ul class="text-sm space-y-1">${a.swot.strengths?.map(s => `<li>• ${s}</li>`).join('') || ''}</ul></div><div class="bg-orange-50 rounded-lg p-4"><h4 class="font-semibold text-orange-700 mb-2">⚠️ Slabé stránky</h4><ul class="text-sm space-y-1">${a.swot.weaknesses?.map(w => `<li>• ${w}</li>`).join('') || ''}</ul></div><div class="bg-blue-50 rounded-lg p-4"><h4 class="font-semibold text-blue-700 mb-2">🚀 Príležitosti</h4><ul class="text-sm space-y-1">${a.swot.opportunities?.map(o => `<li>• ${o}</li>`).join('') || ''}</ul></div><div class="bg-red-50 rounded-lg p-4"><h4 class="font-semibold text-red-700 mb-2">⚡ Hrozby</h4><ul class="text-sm space-y-1">${a.swot.threats?.map(t => `<li>• ${t}</li>`).join('') || ''}</ul></div></div></div>` : ''}
      ${k.topKeywords?.length ? `<div class="analysis-section"><h3>🔍 Kľúčové slová</h3><p class="text-sm text-gray-500 mb-3">${k.summary || ''}</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-100"><tr><th class="text-left p-2 rounded-l-lg">Kľúčové slovo</th><th class="text-center p-2">Hľadanosť</th><th class="text-center p-2">Konkurencia</th><th class="text-right p-2 rounded-r-lg">CPC</th></tr></thead><tbody>${k.topKeywords.slice(0, 10).map(kw => `<tr class="border-b"><td class="p-2 font-medium">${kw.keyword}</td><td class="text-center p-2">${kw.searchVolume}</td><td class="text-center p-2"><span class="tag ${kw.competition === 'nízka' ? 'tag-green' : kw.competition === 'vysoká' ? 'tag-orange' : 'tag-blue'}">${kw.competition}</span></td><td class="text-right p-2">${kw.cpc}</td></tr>`).join('')}</tbody></table></div><p class="text-xs text-gray-400 mt-3">📌 Kompletný zoznam ${k.totalFound || 'všetkých'} kľúčových slov dostanete po objednaní služby</p></div>` : ''}
      ${b.recommendations ? `<div class="analysis-section"><h3>💰 Odporúčaný rozpočet</h3><p class="text-sm text-gray-600 mb-4">${b.analysis || ''}</p><div class="grid md:grid-cols-3 gap-4"><div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center"><p class="text-sm text-gray-500 mb-1">Štart</p><p class="text-3xl font-bold text-gray-700">${b.recommendations.starter?.adSpend || 300}€</p><p class="text-xs text-gray-400">mesačne na reklamu</p><div class="mt-3 pt-3 border-t text-sm"><p>~${b.recommendations.starter?.expectedClicks || 400} klikov</p><p>~${b.recommendations.starter?.expectedConversions || '15-25'} dopytov</p></div></div><div class="bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl p-5 text-center text-white transform scale-105"><p class="text-sm opacity-80 mb-1">⭐ Odporúčame</p><p class="text-3xl font-bold">${b.recommendations.recommended?.adSpend || 500}€</p><p class="text-xs opacity-80">mesačne na reklamu</p><div class="mt-3 pt-3 border-t border-white/30 text-sm"><p>~${b.recommendations.recommended?.expectedClicks || 700} klikov</p><p>~${b.recommendations.recommended?.expectedConversions || '30-45'} dopytov</p></div></div><div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center"><p class="text-sm text-gray-500 mb-1">Agresívny</p><p class="text-3xl font-bold text-gray-700">${b.recommendations.aggressive?.adSpend || 800}€</p><p class="text-xs text-gray-400">mesačne na reklamu</p><div class="mt-3 pt-3 border-t text-sm"><p>~${b.recommendations.aggressive?.expectedClicks || 1200} klikov</p><p>~${b.recommendations.aggressive?.expectedConversions || '50-70'} dopytov</p></div></div></div></div>` : ''}
      ${r.projection ? `<div class="analysis-section bg-green-50"><h3>📈 Predpokladaná návratnosť (ROI)</h3><p class="text-sm text-gray-600 mb-4">${r.explanation || ''}</p><div class="grid grid-cols-3 gap-4 text-center"><div><p class="text-2xl font-bold text-green-600">${r.projection.monthlyLeads}</p><p class="text-xs text-gray-500">Mesačných dopytov</p></div><div><p class="text-2xl font-bold text-green-600">${r.projection.monthlyRevenue}</p><p class="text-xs text-gray-500">Potenciálny obrat</p></div><div><p class="text-2xl font-bold text-green-600">${r.projection.roi}</p><p class="text-xs text-gray-500">ROI</p></div></div></div>` : ''}
      ${analysis.customNote ? `<div class="analysis-section border-l-4 border-purple-500 bg-purple-50"><h3>💬 Osobná poznámka</h3><p class="text-gray-700 italic">${analysis.customNote}</p></div>` : ''}
      <div class="analysis-section bg-gradient-to-r from-orange-100 to-pink-100"><h3>🎯 Odporúčaný balíček: ${analysis.recommendedPackage || 'Pro'}</h3><p class="text-gray-600">Na základe analýzy odporúčame balíček <strong>${analysis.recommendedPackage || 'Pro'}</strong> pre optimálny pomer ceny a výkonu.</p></div>
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

  closeModal() { document.getElementById('analysis-modal').classList.add('hidden'); document.getElementById('analysis-modal').classList.remove('flex'); },

  editAnalysis() {
    if (!this.editedAnalysis) return;
    const modal = document.getElementById('edit-modal');
    const content = document.getElementById('edit-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const a = this.editedAnalysis;
    content.innerHTML = `<div class="space-y-6"><div><label class="block text-sm font-medium mb-2">Názov firmy</label><input type="text" id="edit-company-name" value="${a.company?.name || ''}" class="w-full p-3 border rounded-xl"></div><div><label class="block text-sm font-medium mb-2">Popis firmy</label><textarea id="edit-company-desc" rows="3" class="w-full p-3 border rounded-xl">${a.company?.description || ''}</textarea></div><div><label class="block text-sm font-medium mb-2">Naše zistenia (úvodný text)</label><textarea id="edit-intro" rows="4" class="w-full p-3 border rounded-xl">${a.analysis?.humanWrittenIntro || ''}</textarea></div><div><label class="block text-sm font-medium mb-2">Osobná poznámka pre klienta</label><textarea id="edit-custom-note" rows="3" class="w-full p-3 border rounded-xl">${a.customNote || ''}</textarea></div><div><label class="block text-sm font-medium mb-2">Odporúčaný balíček</label><select id="edit-package" class="w-full p-3 border rounded-xl"><option value="Starter" ${a.recommendedPackage === 'Starter' ? 'selected' : ''}>Starter (149€)</option><option value="Pro" ${a.recommendedPackage === 'Pro' ? 'selected' : ''}>Pro (249€)</option><option value="Enterprise" ${a.recommendedPackage === 'Enterprise' ? 'selected' : ''}>Enterprise (399€)</option><option value="Premium" ${a.recommendedPackage === 'Premium' ? 'selected' : ''}>Premium (799€)</option></select></div></div>`;
  },

  closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); document.getElementById('edit-modal').classList.remove('flex'); },

  async saveAnalysisEdits() {
    if (!this.editedAnalysis || !this.currentLeadId) return;
    this.editedAnalysis.company = this.editedAnalysis.company || {};
    this.editedAnalysis.company.name = document.getElementById('edit-company-name').value;
    this.editedAnalysis.company.description = document.getElementById('edit-company-desc').value;
    this.editedAnalysis.analysis = this.editedAnalysis.analysis || {};
    this.editedAnalysis.analysis.humanWrittenIntro = document.getElementById('edit-intro').value;
    this.editedAnalysis.customNote = document.getElementById('edit-custom-note').value;
    this.editedAnalysis.recommendedPackage = document.getElementById('edit-package').value;
    await Database.update('leads', this.currentLeadId, { analysis: this.editedAnalysis });
    this.currentAnalysis = this.editedAnalysis;
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (lead) lead.analysis = this.editedAnalysis;
    this.renderAnalysisResults(lead, this.editedAnalysis);
    this.closeEditModal();
    Utils.toast('Zmeny uložené!', 'success');
  },

  async generateProposal() { if (!this.currentLeadId || !this.currentAnalysis) return Utils.toast('Najprv spusti analýzu', 'warning'); this.generateProposalFor(this.currentLeadId); },

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
    const recPkg = (analysis.recommendedPackage || 'pro').toLowerCase();
    const clientLogo = lead.domain ? `https://logo.clearbit.com/${lead.domain}` : null;
    const adlifyLogo = 'https://adlify.eu/wp-content/uploads/2025/05/logo_na_sirku.png';

    return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marketingová stratégia - ${c.name || lead.company_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Poppins', sans-serif; background: #fff; color: #1a1a2e; line-height: 1.7; }
.header { position: fixed; top: 0; left: 0; right: 0; background: white; padding: 15px 60px; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
.header-logo { height: 32px; }
.header-client { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #64748b; font-size: 0.9rem; }
.header-client img { height: 28px; border-radius: 6px; }
.page { min-height: 100vh; padding: 120px 60px 80px; }
.page-content { max-width: 1000px; margin: 0 auto; }
.page-white { background: #fff; }
.page-gray { background: #f8fafc; }
.gradient-text { background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.section-badge { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 50%; font-weight: 700; font-size: 0.9rem; margin-right: 12px; }
.section-title { font-size: 2rem; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; }
.section-subtitle { font-size: 1.05rem; color: #64748b; margin-bottom: 35px; }
.section-divider { width: 80px; height: 4px; background: linear-gradient(135deg, #FF6B35, #E91E63); border-radius: 2px; margin-bottom: 30px; }
.card { background: white; border-radius: 16px; padding: 28px; box-shadow: 0 4px 25px rgba(0,0,0,0.06); margin-bottom: 20px; border: 1px solid #e2e8f0; }
.card-highlight { border-left: 4px solid #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.stat-box { text-align: center; padding: 24px; background: white; border-radius: 16px; box-shadow: 0 2px 15px rgba(0,0,0,0.05); }
.stat-icon { font-size: 2.5rem; margin-bottom: 10px; }
.stat-value { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.stat-label { font-size: 0.85rem; color: #64748b; margin-top: 5px; }
.tag { display: inline-block; padding: 8px 18px; border-radius: 25px; font-size: 0.85rem; font-weight: 500; margin: 4px; }
.tag-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
.tag-light { background: #f1f5f9; color: #475569; }
.tag-success { background: #dcfce7; color: #166534; }
.tag-warning { background: #fef3c7; color: #92400e; }
.swot-box { padding: 24px; border-radius: 14px; }
.swot-box h4 { font-size: 1rem; font-weight: 600; margin-bottom: 12px; }
.swot-box ul { list-style: none; }
.swot-box li { padding: 6px 0; font-size: 0.9rem; }
.swot-strengths { background: #f0fdf4; }
.swot-strengths h4 { color: #166534; }
.swot-weaknesses { background: #fef3c7; }
.swot-weaknesses h4 { color: #92400e; }
.swot-opportunities { background: #dbeafe; }
.swot-opportunities h4 { color: #1e40af; }
.swot-threats { background: #fee2e2; }
.swot-threats h4 { color: #991b1b; }
table { width: 100%; border-collapse: collapse; }
th { background: #f8fafc; padding: 14px; text-align: left; font-weight: 600; color: #475569; font-size: 0.85rem; }
td { padding: 14px; border-bottom: 1px solid #e2e8f0; }
tr:hover { background: #f8fafc; }
.package-card { background: white; border: 2px solid #e2e8f0; border-radius: 20px; padding: 35px 28px; text-align: center; transition: all 0.3s; position: relative; }
.package-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.1); }
.package-card.featured { border-color: #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }
.package-card.featured::before { content: "Odporúčame"; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 5px 20px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.package-icon { font-size: 2.5rem; margin-bottom: 15px; }
.package-name { font-size: 1.4rem; font-weight: 700; margin-bottom: 5px; }
.package-price { font-size: 2.8rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.package-period { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
.package-features { list-style: none; text-align: left; margin-bottom: 25px; }
.package-features li { padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
.package-features li::before { content: "✓ "; color: #22c55e; font-weight: bold; }
.package-btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-weight: 600; text-decoration: none; transition: all 0.3s; }
.package-btn-outline { border: 2px solid #e2e8f0; color: #475569; background: white; }
.package-btn-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border: none; }
.timeline { position: relative; padding-left: 30px; }
.timeline::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 3px; background: linear-gradient(180deg, #FF6B35, #E91E63, #9C27B0); border-radius: 3px; }
.timeline-item { position: relative; margin-bottom: 30px; }
.timeline-item::before { content: ''; position: absolute; left: -26px; top: 5px; width: 14px; height: 14px; background: white; border: 3px solid #FF6B35; border-radius: 50%; }
.timeline-title { font-weight: 600; color: #1a1a2e; margin-bottom: 5px; }
.timeline-desc { color: #64748b; font-size: 0.9rem; }
.benefit-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
.benefit-icon { width: 50px; height: 50px; background: linear-gradient(135deg, #fff7ed, #fef2f2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 15px; }
.benefit-title { font-weight: 600; margin-bottom: 8px; }
.benefit-desc { color: #64748b; font-size: 0.9rem; }
.cta-section { background: linear-gradient(135deg, #FF6B35 0%, #E91E63 100%); border-radius: 24px; padding: 60px; text-align: center; color: white; margin-top: 40px; }
.cta-title { font-size: 2.2rem; font-weight: 700; margin-bottom: 15px; }
.cta-subtitle { font-size: 1.1rem; opacity: 0.9; margin-bottom: 35px; max-width: 500px; margin-left: auto; margin-right: auto; }
.cta-buttons { display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 30px; }
.cta-btn { padding: 16px 35px; border-radius: 12px; font-weight: 600; text-decoration: none; font-size: 1rem; transition: all 0.3s; }
.cta-btn-white { background: white; color: #FF6B35; }
.cta-btn-outline { background: transparent; color: white; border: 2px solid white; }
.cta-contact { margin-top: 20px; font-size: 0.95rem; opacity: 0.9; }
.cta-contact a { color: white; text-decoration: none; }
.footer { text-align: center; padding: 40px; background: #f8fafc; color: #64748b; font-size: 0.85rem; }
.footer-logo { height: 30px; margin-bottom: 15px; opacity: 0.7; }
.hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 60px; }
.hero-content { max-width: 800px; }
.hero-logo { height: 50px; margin-bottom: 40px; }
.hero-badge { display: inline-block; padding: 8px 20px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 25px; font-size: 0.85rem; font-weight: 500; margin-bottom: 25px; }
.hero-title { font-size: 3rem; font-weight: 800; margin-bottom: 20px; color: #1a1a2e; }
.hero-subtitle { font-size: 1.2rem; color: #64748b; margin-bottom: 40px; }
.hero-client { display: inline-flex; align-items: center; gap: 15px; padding: 20px 40px; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
.hero-client img { height: 40px; border-radius: 8px; }
.hero-client-name { font-size: 1.4rem; font-weight: 700; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero-info { margin-top: 50px; color: #94a3b8; font-size: 0.9rem; }
@media (max-width: 768px) { .page { padding: 100px 25px 60px; } .header { padding: 12px 20px; } .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; } .hero-title { font-size: 2rem; } .section-title { font-size: 1.5rem; } .cta-section { padding: 40px 25px; } }
</style>
</head>
<body>
<div class="header"><img src="${adlifyLogo}" alt="Adlify" class="header-logo"><div class="header-client">${clientLogo ? `<img src="${clientLogo}" alt="${c.name}" onerror="this.style.display='none'">` : ''}<span>Pripravené pre ${c.name || lead.company_name}</span></div></div>
<div class="hero"><div class="hero-content"><img src="${adlifyLogo}" alt="Adlify" class="hero-logo"><div class="hero-badge">📊 Personalizovaná analýza</div><h1 class="hero-title">Návrh <span class="gradient-text">marketingovej stratégie</span></h1><p class="hero-subtitle">Komplexná analýza vašej online prítomnosti a konkrétne odporúčania pre rast</p><div class="hero-client">${clientLogo ? `<img src="${clientLogo}" alt="${c.name}" onerror="this.style.display='none'">` : '<span style="font-size:2rem">🏢</span>'}<span class="hero-client-name">${c.name || lead.company_name || lead.domain}</span></div><p class="hero-info">V tejto prezentácii nájdete analýzu vášho podnikania a konkrétny plán ako získať viac zákazníkov online.</p></div></div>
<div class="page page-white"><div class="page-content"><div class="section-title"><span class="section-badge">1</span> O vašej firme</div><div class="section-divider"></div><div class="card card-highlight"><p style="font-size: 1.15rem; line-height: 1.9;">${c.description || 'Popis firmy'}</p></div>${c.services?.length ? `<h3 style="margin: 35px 0 20px; font-size: 1.2rem; font-weight: 600;">🛠️ Vaše služby</h3><div style="display: flex; flex-wrap: wrap; gap: 10px;">${c.services.map(s => `<span class="tag tag-gradient">${s}</span>`).join('')}</div>` : ''}</div></div>
${a.humanWrittenIntro ? `<div class="page page-gray"><div class="page-content"><div class="section-title"><span class="section-badge">2</span> Čo sme zistili</div><div class="section-divider"></div><div class="card card-highlight"><p style="font-size: 1.1rem; line-height: 1.9;">${a.humanWrittenIntro}</p></div></div></div>` : ''}
<div class="page page-white"><div class="page-content"><div class="section-title"><span class="section-badge">3</span> Online prítomnosť</div><div class="section-divider"></div><p class="section-subtitle">${o.summary || ''}</p><div class="grid-4"><div class="stat-box"><div class="stat-icon">${o.website?.exists ? '✅' : '❌'}</div><div style="font-weight: 600;">Webstránka</div></div><div class="stat-box"><div class="stat-icon">${o.socialMedia?.facebook?.exists ? '✅' : '❌'}</div><div style="font-weight: 600;">Facebook</div></div><div class="stat-box"><div class="stat-icon">${o.socialMedia?.instagram?.exists ? '✅' : '❌'}</div><div style="font-weight: 600;">Instagram</div></div><div class="stat-box"><div class="stat-icon">${o.paidAds?.detected ? '✅' : '❌'}</div><div style="font-weight: 600;">Reklama</div></div></div></div></div>
${a.swot ? `<div class="page page-gray"><div class="page-content"><div class="section-title"><span class="section-badge">4</span> SWOT Analýza</div><div class="section-divider"></div><div class="grid-2"><div class="swot-box swot-strengths"><h4>💪 Silné stránky</h4><ul>${a.swot.strengths?.map(s => `<li>• ${s}</li>`).join('') || ''}</ul></div><div class="swot-box swot-weaknesses"><h4>⚠️ Slabé stránky</h4><ul>${a.swot.weaknesses?.map(w => `<li>• ${w}</li>`).join('') || ''}</ul></div><div class="swot-box swot-opportunities"><h4>🚀 Príležitosti</h4><ul>${a.swot.opportunities?.map(o => `<li>• ${o}</li>`).join('') || ''}</ul></div><div class="swot-box swot-threats"><h4>⚡ Hrozby</h4><ul>${a.swot.threats?.map(t => `<li>• ${t}</li>`).join('') || ''}</ul></div></div></div></div>` : ''}
${k.topKeywords?.length ? `<div class="page page-white"><div class="page-content"><div class="section-title"><span class="section-badge">5</span> Kľúčové slová</div><div class="section-divider"></div><p class="section-subtitle">${k.summary || ''}</p><div class="card" style="overflow: hidden; padding: 0;"><table><thead><tr><th>Kľúčové slovo</th><th style="text-align: center;">Hľadanosť</th><th style="text-align: center;">Konkurencia</th><th style="text-align: right;">CPC</th></tr></thead><tbody>${k.topKeywords.slice(0, 10).map(kw => `<tr><td><strong>${kw.keyword}</strong></td><td style="text-align: center;">${kw.searchVolume}</td><td style="text-align: center;"><span class="tag ${kw.competition === 'nízka' ? 'tag-success' : kw.competition === 'vysoká' ? 'tag-warning' : 'tag-light'}">${kw.competition}</span></td><td style="text-align: right; font-weight: 600;">${kw.cpc}</td></tr>`).join('')}</tbody></table></div><p style="margin-top: 20px; font-size: 0.85rem; color: #94a3b8; text-align: center;">📌 Máme pripravených ďalších ${(k.totalFound || 45) - 10}+ kľúčových slov</p></div></div>` : ''}
<div class="page page-gray"><div class="page-content"><div class="section-title"><span class="section-badge">6</span> Odporúčaný rozpočet</div><div class="section-divider"></div><p class="section-subtitle">${b.analysis || ''}</p><div class="grid-3"><div class="card" style="text-align: center;"><p style="color: #94a3b8; margin-bottom: 5px;">Štart</p><p style="font-size: 2.5rem; font-weight: 800; color: #64748b;">${b.recommendations?.starter?.adSpend || 300}€</p><p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 20px;">mesačne</p><div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: left;"><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Kliky</span><strong>~${b.recommendations?.starter?.expectedClicks || 400}</strong></p><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Dopyty</span><strong>~${b.recommendations?.starter?.expectedConversions || '15-25'}</strong></p></div></div><div class="card" style="text-align: center; border: 2px solid #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); transform: scale(1.05); position: relative;"><div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 5px 20px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">⭐ Odporúčame</div><p style="color: #FF6B35; margin-bottom: 5px; margin-top: 10px;">Optimum</p><p style="font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${b.recommendations?.recommended?.adSpend || 500}€</p><p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 20px;">mesačne</p><div style="border-top: 1px solid #fed7aa; padding-top: 15px; text-align: left;"><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Kliky</span><strong>~${b.recommendations?.recommended?.expectedClicks || 700}</strong></p><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Dopyty</span><strong>~${b.recommendations?.recommended?.expectedConversions || '30-45'}</strong></p></div></div><div class="card" style="text-align: center;"><p style="color: #94a3b8; margin-bottom: 5px;">Agresívny</p><p style="font-size: 2.5rem; font-weight: 800; color: #64748b;">${b.recommendations?.aggressive?.adSpend || 800}€</p><p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 20px;">mesačne</p><div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: left;"><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Kliky</span><strong>~${b.recommendations?.aggressive?.expectedClicks || 1200}</strong></p><p style="display: flex; justify-content: space-between; padding: 8px 0;"><span style="color: #64748b;">Dopyty</span><strong>~${b.recommendations?.aggressive?.expectedConversions || '50-70'}</strong></p></div></div></div><p style="margin-top: 25px; font-size: 0.9rem; color: #64748b; text-align: center; background: #e2e8f0; padding: 15px; border-radius: 10px;">💡 <strong>Dôležité:</strong> Reklamný rozpočet platíte priamo Google/Facebook. Nie je súčasťou ceny za správu.</p></div></div>
${r.projection ? `<div class="page page-white"><div class="page-content"><div class="section-title"><span class="section-badge">7</span> Predpokladaná návratnosť</div><div class="section-divider"></div><p class="section-subtitle">${r.explanation || ''}</p><div class="grid-3"><div class="stat-box"><div class="stat-value">${r.projection.monthlyLeads}</div><div class="stat-label">Mesačných dopytov</div></div><div class="stat-box"><div class="stat-value">${r.projection.monthlyRevenue}</div><div class="stat-label">Potenciálny obrat</div></div><div class="stat-box"><div class="stat-value">${r.projection.roi}</div><div class="stat-label">ROI</div></div></div></div></div>` : ''}
<div class="page page-gray"><div class="page-content"><div class="section-title"><span class="section-badge">8</span> Časový plán</div><div class="section-divider"></div><div class="timeline"><div class="timeline-item"><div class="timeline-title">Týždeň 1</div><div class="timeline-desc">${timeline.week1 || 'Audit, nastavenie účtov, tracking kódy'}</div></div><div class="timeline-item"><div class="timeline-title">Týždeň 2</div><div class="timeline-desc">${timeline.week2 || 'Spustenie prvých kampaní'}</div></div><div class="timeline-item"><div class="timeline-title">Týždeň 3-4</div><div class="timeline-desc">${timeline.week3_4 || 'A/B testovanie, optimalizácia'}</div></div><div class="timeline-item"><div class="timeline-title">Mesiac 2</div><div class="timeline-desc">${timeline.month2 || 'Remarketing, rozšírenie'}</div></div><div class="timeline-item"><div class="timeline-title">Mesiac 3+</div><div class="timeline-desc">${timeline.month3 || 'Škálovanie'}</div></div></div></div></div>
<div class="page page-white"><div class="page-content"><div class="section-title"><span class="section-badge">9</span> Benefity spolupráce</div><div class="section-divider"></div><div class="grid-2"><div class="benefit-card"><div class="benefit-icon">🎯</div><div class="benefit-title">Zákazníci s potrebou</div><div class="benefit-desc">Oslovíte ľudí hľadajúcich vaše služby PRÁVE TERAZ.</div></div><div class="benefit-card"><div class="benefit-icon">📊</div><div class="benefit-title">Merateľné výsledky</div><div class="benefit-desc">Presne viete koľko ľudí videlo reklamu a kliklo.</div></div><div class="benefit-card"><div class="benefit-icon">🏆</div><div class="benefit-title">Konkurenčná výhoda</div><div class="benefit-desc">Aktívne oslovujete zákazníkov.</div></div><div class="benefit-card"><div class="benefit-icon">📈</div><div class="benefit-title">Sezónne kampane</div><div class="benefit-desc">Navýšime rozpočet pred sezónou.</div></div></div></div></div>
<div class="page page-gray"><div class="page-content"><div class="section-title"><span class="section-badge">10</span> Naše balíčky</div><div class="section-divider"></div><p class="section-subtitle">Odporúčame balíček <strong style="color: #FF6B35;">${analysis.recommendedPackage || 'Pro'}</strong></p><div class="grid-4"><div class="package-card ${recPkg === 'starter' ? 'featured' : ''}"><div class="package-icon">🚀</div><div class="package-name">Starter</div><div class="package-price">149€</div><div class="package-period">/mesiac</div><ul class="package-features">${this.packages.starter.features.slice(0, 5).map(f => `<li>${f}</li>`).join('')}</ul><a href="mailto:${this.CONTACT.email}?subject=Záujem o Starter - ${c.name || lead.company_name}" class="package-btn package-btn-outline">Vybrať Starter</a></div><div class="package-card ${recPkg === 'pro' ? 'featured' : ''}"><div class="package-icon">⭐</div><div class="package-name">Pro</div><div class="package-price">249€</div><div class="package-period">/mesiac</div><ul class="package-features">${this.packages.pro.features.slice(0, 5).map(f => `<li>${f}</li>`).join('')}</ul><a href="mailto:${this.CONTACT.email}?subject=Záujem o Pro - ${c.name || lead.company_name}" class="package-btn ${recPkg === 'pro' ? 'package-btn-gradient' : 'package-btn-outline'}">Vybrať Pro</a></div><div class="package-card ${recPkg === 'enterprise' ? 'featured' : ''}"><div class="package-icon">💎</div><div class="package-name">Enterprise</div><div class="package-price">399€</div><div class="package-period">/mesiac</div><ul class="package-features">${this.packages.enterprise.features.slice(0, 5).map(f => `<li>${f}</li>`).join('')}</ul><a href="mailto:${this.CONTACT.email}?subject=Záujem o Enterprise - ${c.name || lead.company_name}" class="package-btn package-btn-outline">Vybrať Enterprise</a></div><div class="package-card ${recPkg === 'premium' ? 'featured' : ''}"><div class="package-icon">🏆</div><div class="package-name" style="color: #FF6B35;">Premium</div><div class="package-price">799€</div><div class="package-period">/mesiac</div><ul class="package-features">${this.packages.premium.features.slice(0, 5).map(f => `<li>${f}</li>`).join('')}</ul><a href="mailto:${this.CONTACT.email}?subject=Záujem o Premium - ${c.name || lead.company_name}" class="package-btn package-btn-outline">Kontaktujte nás</a></div></div></div></div>
<div class="page page-white"><div class="page-content"><div class="cta-section"><h2 class="cta-title">Začnime spoluprácu</h2><p class="cta-subtitle">Dohodnite si nezáväznú konzultáciu a preberieme, ako vám vieme pomôcť.</p><div class="cta-buttons"><a href="mailto:${this.CONTACT.email}?subject=Mám záujem - ${c.name || lead.company_name}" class="cta-btn cta-btn-white">✓ Mám záujem</a><a href="mailto:${this.CONTACT.email}?subject=Otázky - ${c.name || lead.company_name}" class="cta-btn cta-btn-outline">Mám otázky</a></div><div class="cta-contact"><p>📧 <a href="mailto:${this.CONTACT.email}">${this.CONTACT.email}</a></p><p style="margin-top: 8px;">📞 <a href="tel:${this.CONTACT.phone.replace(/\\s/g, '')}">${this.CONTACT.phone}</a></p><p style="margin-top: 8px;">🌐 <a href="https://${this.CONTACT.web}" target="_blank">${this.CONTACT.web}</a></p></div></div>${analysis.customNote ? `<div class="card card-highlight" style="margin-top: 40px;"><h4 style="margin-bottom: 10px; font-weight: 600;">💬 Osobná poznámka</h4><p style="color: #64748b; font-style: italic;">${analysis.customNote}</p></div>` : ''}</div></div>
<div class="footer"><img src="${adlifyLogo}" alt="Adlify" class="footer-logo"><p>© ${new Date().getFullYear()} Adlify.eu | Vytvorené s ❤️ pre ${c.name || lead.company_name}</p><p style="margin-top: 8px;">Táto prezentácia je dôverná a určená výhradne pre ${c.name || lead.company_name}</p></div>
</body></html>`;
  },

  async handleImport() {
    const textarea = document.getElementById('import-domains');
    const text = textarea.value.trim();
    if (!text) return Utils.toast('Zadaj domény', 'warning');
    const domains = text.split('\n').map(d => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(d => d.includes('.'));
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
    await Database.insert('leads', { domain: domain || `${name.toLowerCase().replace(/\s+/g, '-')}.local`, company_name: name, status: 'new', score: 50, analysis: { company: { industry, location: city } } });
    Utils.toast('Lead pridaný!', 'success');
    ['add-name', 'add-domain', 'add-industry', 'add-city'].forEach(id => document.getElementById(id).value = '');
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },

  async analyzeSelected() { if (this.selectedIds.size === 0) return Utils.toast('Označ leady', 'warning'); for (const id of this.selectedIds) await this.analyze(id); this.selectedIds.clear(); },

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
