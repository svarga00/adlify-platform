/**
 * ADLIFY PLATFORM - Leads Module v2.3
 * Professional AI Analysis & Proposal Generation
 * Updated: January 2026
 * - Vylepšená buildProposalHTML s 13 sekciami
 * - Moderný responsive dizajn
 * - Dynamické rozpočty z AI analýzy
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
  filters: { status: '', search: '', minScore: '', industry: '', dateRange: '' },
  currentLeadId: null,
  currentAnalysis: null,
  editedAnalysis: null,
  
  ANALYZE_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/analyze-lead',
  
  // Správne logo URL
  LOGO: 'https://adlify.eu/wp/wp-content/uploads/2025/10/ADLIFY-LOGO.webp',
  
  CONTACT: {
    phone: '+421 944 184 045',
    email: 'info@adlify.eu',
    web: 'www.adlify.eu'
  },
  
  packages: {
    starter: { 
      name: 'Starter', 
      price: 149, 
      icon: '🚀',
      badge: 'Pre začiatok',
      description: 'Ideálne pre živnostníkov, ktorí chcú vyskúšať online reklamu',
      features: ['1 reklamná platforma', '1 kampaň', '2 reklamné vizuály', 'Reklamné texty (copy)', 'Základná optimalizácia', 'Mesačný report', 'Email podpora'] 
    },
    pro: { 
      name: 'Pro', 
      price: 249, 
      icon: '⭐',
      badge: 'Najobľúbenejšie',
      description: 'Pre firmy, ktoré chcú rásť na viacerých platformách',
      features: ['2 platformy (FB/IG + Google)', 'Až 3 kampane súčasne', '4 reklamné vizuály', 'A/B testovanie', 'Optimalizácia každé 2 týždne', 'Detailný report', 'Email + telefón podpora'] 
    },
    enterprise: { 
      name: 'Enterprise', 
      price: 399, 
      icon: '💎',
      badge: 'Pre firmy',
      description: 'Pre e-shopy a firmy s vyšším rozpočtom na reklamu',
      features: ['Všetky platformy + remarketing', 'Až 5 kampaní súčasne', '8 reklamných vizuálov', 'Pokročilé A/B testovanie', 'Týždenná optimalizácia', 'Strategické konzultácie', 'Prioritná podpora + WhatsApp'] 
    },
    premium: { 
      name: 'Premium', 
      price: 799, 
      icon: '🏆',
      badge: 'VIP',
      description: 'Individuálna cena podľa rozsahu a potrieb vášho projektu',
      features: ['Všetky platformy + remarketing', 'Neobmedzený počet kampaní', 'Neobmedzené vizuály', 'Dedikovaný account manager', 'Denná optimalizácia', 'Mesačné strategické stretnutia', '24/7 VIP podpora'] 
    }
  },

  init() { console.log('👥 Leads module v2.2 initialized'); },
  
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
    try {
      const filters = {};
      if (this.filters.status) filters.status = this.filters.status;
      console.log('Loading leads with filters:', filters);
      this.leads = await Database.getLeads(filters);
      console.log('Loaded leads:', this.leads.length);
      if (this.filters.search) {
        const search = this.filters.search.toLowerCase();
        this.leads = this.leads.filter(l => (l.company_name || '').toLowerCase().includes(search) || (l.domain || '').toLowerCase().includes(search));
      }
      if (this.filters.minScore) this.leads = this.leads.filter(l => (l.score || 0) >= parseInt(this.filters.minScore));
    } catch (error) {
      console.error('Load leads error:', error);
      Utils.toast('Chyba pri načítaní leadov', 'error');
      this.leads = [];
    }
  },

  template() {
    const stats = {
      total: this.leads.length,
      new: this.leads.filter(l => !l.status || l.status === 'new').length,
      analyzed: this.leads.filter(l => l.analysis?.company || l.analysis?.analysis).length,
      contacted: this.leads.filter(l => l.status === 'contacted' || l.proposal_status === 'sent').length
    };
    
    return `
      <div class="billing-module-new leads-module">
        <!-- Header s gradientom -->
        <div class="billing-header">
          <div class="header-content">
            <div class="header-title">
              <h1>Leady</h1>
              <p class="header-subtitle">Správa potenciálnych klientov</p>
            </div>
            <div class="header-actions">
              <button class="btn-header-secondary" onclick="LeadsModule.showTab('import')">
                📥 Import
              </button>
              <button class="btn-new-document" onclick="LeadsModule.showTab('add')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Nový lead
              </button>
            </div>
          </div>
        </div>
        
        <!-- Štatistiky -->
        <div class="billing-stats-grid">
          <div class="stat-card-new">
            <div class="stat-card-icon blue">👥</div>
            <div class="stat-card-content">
              <span class="stat-card-value">${stats.total}</span>
              <span class="stat-card-label">Celkom</span>
            </div>
          </div>
          <div class="stat-card-new">
            <div class="stat-card-icon green">🆕</div>
            <div class="stat-card-content">
              <span class="stat-card-value">${stats.new}</span>
              <span class="stat-card-label">Nové</span>
            </div>
          </div>
          <div class="stat-card-new">
            <div class="stat-card-icon purple">🤖</div>
            <div class="stat-card-content">
              <span class="stat-card-value">${stats.analyzed}</span>
              <span class="stat-card-label">Analyzované</span>
            </div>
          </div>
          <div class="stat-card-new success">
            <div class="stat-card-icon orange">📧</div>
            <div class="stat-card-content">
              <span class="stat-card-value">${stats.contacted}</span>
              <span class="stat-card-label">Kontaktované</span>
            </div>
          </div>
        </div>
        
        <!-- Taby -->
        <div class="billing-tabs-container">
          <div class="billing-tabs-new">
            <button class="tab-btn-new active" data-tab="list" onclick="LeadsModule.showTab('list')">
              <span class="tab-icon">📋</span>
              Zoznam
              <span class="tab-badge">${stats.total}</span>
            </button>
            <button class="tab-btn-new" data-tab="import" onclick="LeadsModule.showTab('import')">
              <span class="tab-icon">📥</span>
              Import
            </button>
            <button class="tab-btn-new" data-tab="add" onclick="LeadsModule.showTab('add')">
              <span class="tab-icon">✏️</span>
              Pridať
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div id="leads-tab-content">
          ${this.renderListTab()}
        </div>
      </div>
      
      <!-- Analysis Modal -->
      <div id="analysis-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box-new modal-large">
          <div class="modal-header-gradient">
            <h2>Detail leadu</h2>
            <button onclick="LeadsModule.closeModal()" class="modal-close">✕</button>
          </div>
          <div id="analysis-content" class="modal-body"></div>
          <div id="analysis-footer" class="modal-footer"></div>
        </div>
      </div>
      
      <!-- Edit Modal -->
      <div id="edit-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box-new modal-large">
          <div class="modal-header"><h2>✏️ Upraviť analýzu</h2><button onclick="LeadsModule.closeEditModal()" class="modal-close-dark">✕</button></div>
          <div id="edit-content" class="modal-body"></div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeEditModal()" class="btn-secondary">Zrušiť</button>
            <button onclick="LeadsModule.saveAnalysisEdits()" class="btn-primary">💾 Uložiť zmeny</button>
          </div>
        </div>
      </div>
      
      <!-- Proposal Modal -->
      <div id="proposal-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box-new modal-medium">
          <div class="modal-header-gradient">
            <h2>📄 Generovať ponuku</h2>
            <button onclick="LeadsModule.closeProposalModal()" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">Pridajte poznámky a vyberte formát ponuky.</p>
            
            <div class="form-group">
              <label>📝 Poznámky pre ponuku (voliteľné)</label>
              <textarea id="proposal-notes" rows="4" placeholder="Napr.: Zameraj sa na lokálnych zákazníkov, odporúčam Pro balík..."></textarea>
            </div>
            
            <div class="proposal-options">
              <label>Vyberte akciu:</label>
              <div class="proposal-buttons">
                <button onclick="LeadsModule.generateProposalHTML()" class="proposal-option-btn">
                  <span class="option-icon">🌐</span>
                  <span class="option-text">
                    <strong>Otvoriť ako HTML</strong>
                    <small>Náhľad v prehliadači</small>
                  </span>
                </button>
                <button onclick="LeadsModule.generateProposalPDF()" class="proposal-option-btn">
                  <span class="option-icon">📑</span>
                  <span class="option-text">
                    <strong>Stiahnuť PDF</strong>
                    <small>Uložiť na disk</small>
                  </span>
                </button>
                <button onclick="LeadsModule.openEmailModal()" class="proposal-option-btn primary" id="btn-send-email">
                  <span class="option-icon">📧</span>
                  <span class="option-text">
                    <strong>Poslať emailom</strong>
                    <small id="proposal-email-target">-</small>
                  </span>
                </button>
              </div>
            </div>
            
            <div class="tip-box">💡 <strong>Tip:</strong> Pri odoslaní emailom môžeš vybrať zo šablón.</div>
          </div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeProposalModal()" class="btn-secondary">Zavrieť</button>
          </div>
        </div>
      </div>
      
      <!-- Email Modal so šablónami -->
      <div id="email-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box-new modal-large">
          <div class="modal-header-gradient">
            <h2>📧 Odoslať ponuku emailom</h2>
            <button onclick="LeadsModule.closeEmailModal()" class="modal-close">✕</button>
          </div>
          <div class="modal-body" id="email-modal-body">
            <!-- Content loaded dynamically -->
          </div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeEmailModal()" class="btn-secondary">Zrušiť</button>
            <button onclick="LeadsModule.sendEmailFromModal()" class="btn-primary">📤 Odoslať email</button>
          </div>
        </div>
      </div>
      
      <style>
        .modal-medium { max-width: 600px; }
        .modal-large { max-width: 800px; }
        .proposal-options { margin-top: 1.5rem; }
        .proposal-options > label { font-size: 0.85rem; font-weight: 500; color: #475569; display: block; margin-bottom: 0.75rem; }
        .proposal-buttons { display: flex; flex-direction: column; gap: 0.75rem; }
        .proposal-option-btn { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.15s; }
        .proposal-option-btn:hover { border-color: #f97316; background: #fff7ed; }
        .proposal-option-btn.primary { background: linear-gradient(135deg, #f97316, #ea580c); border: none; color: white; }
        .proposal-option-btn.primary:hover { box-shadow: 0 4px 12px rgba(249,115,22,0.4); }
        .proposal-option-btn.primary .option-text small { color: rgba(255,255,255,0.8); }
        .proposal-option-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .option-icon { font-size: 1.75rem; }
        .option-text { flex: 1; }
        .option-text strong { display: block; font-size: 0.95rem; }
        .option-text small { font-size: 0.8rem; color: #64748b; }
        
        /* Email Modal Styles */
        .email-form { display: flex; flex-direction: column; gap: 1rem; }
        .email-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .email-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .email-field label { font-size: 0.85rem; font-weight: 500; color: #475569; }
        .email-field input, .email-field select, .email-field textarea { padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; }
        .email-field input:focus, .email-field select:focus, .email-field textarea:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .email-field textarea { min-height: 200px; resize: vertical; font-family: inherit; line-height: 1.6; }
        .template-selector { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
        .template-btn { padding: 0.5rem 1rem; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 0.85rem; cursor: pointer; transition: all 0.15s; }
        .template-btn:hover { background: #fff7ed; border-color: #f97316; }
        .template-btn.active { background: #f97316; color: white; border-color: #f97316; }
        .email-preview { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-top: 0.5rem; }
        .email-preview-label { font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; }
        .variables-info { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.8rem; color: #9a3412; }
        .variables-info code { background: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-family: monospace; }
        .email-actions { margin-top: 1rem; text-align: right; }
        .btn-link { background: none; border: none; color: #64748b; cursor: pointer; font-size: 0.85rem; }
        .btn-link:hover { color: #f97316; text-decoration: underline; }
      </style>
      
      ${this.getStyles()}
    `;
  },
  
  renderListTab() {
    // Získať unikátne typy/odvetvia z leadov
    const industries = [...new Set(this.leads.map(l => {
      return l.industry || l.analysis?.company?.industry || null;
    }).filter(Boolean))];
    
    return `
      <div class="table-filters">
        <input type="text" class="filter-search" id="filter-search" placeholder="Hľadať..." value="${this.filters.search}">
        <select class="filter-select" id="filter-status" onchange="LeadsModule.onStatusChange(this.value)">
          <option value="">Všetky stavy</option>
          <option value="new" ${this.filters.status === 'new' ? 'selected' : ''}>🆕 Nové</option>
          <option value="contacted" ${this.filters.status === 'contacted' ? 'selected' : ''}>📧 Kontaktované</option>
          <option value="won" ${this.filters.status === 'won' ? 'selected' : ''}>✅ Vyhraní</option>
          <option value="lost" ${this.filters.status === 'lost' ? 'selected' : ''}>❌ Prehraní</option>
        </select>
        <select class="filter-select" id="filter-industry" onchange="LeadsModule.onIndustryChange(this.value)">
          <option value="">Všetky typy</option>
          ${industries.map(i => `<option value="${i}" ${this.filters.industry === i ? 'selected' : ''}>${i}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-date" onchange="LeadsModule.onDateChange(this.value)">
          <option value="">Všetky dátumy</option>
          <option value="today" ${this.filters.dateRange === 'today' ? 'selected' : ''}>📅 Dnes</option>
          <option value="yesterday" ${this.filters.dateRange === 'yesterday' ? 'selected' : ''}>📅 Včera</option>
          <option value="week" ${this.filters.dateRange === 'week' ? 'selected' : ''}>📅 Tento týždeň</option>
          <option value="month" ${this.filters.dateRange === 'month' ? 'selected' : ''}>📅 Tento mesiac</option>
          <option value="older" ${this.filters.dateRange === 'older' ? 'selected' : ''}>📅 Staršie</option>
        </select>
        <div class="filter-actions">
          <button onclick="LeadsModule.selectAll()" class="btn-filter">☑️ Všetky</button>
          <button onclick="LeadsModule.analyzeSelected()" class="btn-filter purple">🤖 Analyzovať</button>
          <button onclick="LeadsModule.sendBulkProposals()" class="btn-filter orange">📧 Ponuky</button>
          <button onclick="LeadsModule.deleteSelected()" class="btn-filter red">🗑️</button>
        </div>
      </div>
      
      <div class="table-container">
        <table class="data-table" id="leads-table">
          <thead>
            <tr>
              <th style="width:40px;"><input type="checkbox" onchange="LeadsModule.toggleAllCheckbox(this.checked)"></th>
              <th>Firma</th>
              <th>Typ</th>
              <th>Kontakt</th>
              <th>Stav</th>
              <th>Dátum</th>
              <th>Skóre</th>
              <th>Akcie</th>
            </tr>
          </thead>
          <tbody id="leads-list">
            ${this.renderLeadsList()}
          </tbody>
        </table>
      </div>
    `;
  },
  
  renderImportTab() {
    return `
      <div class="form-card">
        <h2>📥 Import leadov</h2>
        <p class="form-desc">Nahrajte Excel z Marketing Miner alebo vložte domény manuálne</p>
        
        <!-- Excel Upload -->
        <div id="excel-dropzone" class="dropzone" ondrop="LeadsModule.handleFileDrop(event)" ondragover="event.preventDefault()" ondragenter="this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')">
          <div class="dropzone-content">
            <div class="dropzone-icon">📊</div>
            <p><strong>Pretiahni Excel súbor sem</strong></p>
            <p class="text-sm">alebo klikni pre výber súboru</p>
            <input type="file" id="excel-file" accept=".xlsx,.xls,.csv" onchange="LeadsModule.handleFileSelect(event)" style="display:none;">
          </div>
        </div>
        <button onclick="document.getElementById('excel-file').click()" class="btn-secondary" style="width:100%;margin-top:0.5rem;">📂 Vybrať súbor</button>
        
        <div class="divider"><span>alebo</span></div>
        
        <!-- Manual domains -->
        <label class="form-label">Manuálny import domén</label>
        <textarea id="import-domains" rows="6" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk" class="form-textarea"></textarea>
        
        <div class="form-actions">
          <button onclick="LeadsModule.handleImport()" class="btn-primary">📥 Importovať</button>
          <button onclick="LeadsModule.showTab('list')" class="btn-secondary">← Späť</button>
        </div>
      </div>
      
      <style>
        .dropzone { border: 2px dashed #e2e8f0; border-radius: 12px; padding: 2rem; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 1rem; }
        .dropzone:hover, .dropzone.dragover { border-color: #f97316; background: #fff7ed; }
        .dropzone-icon { font-size: 3rem; margin-bottom: 0.5rem; }
        .dropzone .text-sm { color: #64748b; font-size: 0.85rem; }
        .divider { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; color: #94a3b8; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
        .form-label { display: block; font-size: 0.85rem; font-weight: 500; color: #475569; margin-bottom: 0.5rem; }
      </style>
    `;
  },
  
  renderAddTab() {
    return `
      <div class="form-card">
        <h2>✏️ Pridať nový lead</h2>
        <div class="form-grid">
          <div class="form-group"><label>Názov firmy *</label><input type="text" id="add-name" placeholder="Zadajte názov"></div>
          <div class="form-group"><label>Doména</label><input type="text" id="add-domain" placeholder="firma.sk"></div>
          <div class="form-group"><label>Email</label><input type="email" id="add-email" placeholder="kontakt@firma.sk"></div>
          <div class="form-group"><label>Telefón</label><input type="text" id="add-phone" placeholder="+421..."></div>
          <div class="form-group"><label>Odvetvie</label><input type="text" id="add-industry" placeholder="E-commerce"></div>
          <div class="form-group"><label>Mesto</label><input type="text" id="add-city" placeholder="Bratislava"></div>
        </div>
        <div class="form-actions">
          <button onclick="LeadsModule.handleAdd()" class="btn-primary">➕ Pridať lead</button>
          <button onclick="LeadsModule.showTab('list')" class="btn-secondary">← Späť</button>
        </div>
      </div>
    `;
  },
  
  getStyles() {
    return `<style>
      /* Base */
      .billing-module-new { padding: 0; max-width: 1400px; margin: 0 auto; }
      
      /* Header */
      .billing-header { background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px; padding: 2rem; margin-bottom: 1.5rem; color: white; }
      .header-content { display: flex; justify-content: space-between; align-items: center; }
      .header-title h1 { margin: 0; font-size: 1.75rem; font-weight: 700; }
      .header-subtitle { margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.95rem; }
      .header-actions { display: flex; gap: 0.75rem; }
      
      .btn-new-document { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); color: white; font-size: 0.95rem; font-weight: 600; border-radius: 12px; cursor: pointer; transition: all 0.2s; }
      .btn-new-document:hover { background: rgba(255,255,255,0.3); transform: translateY(-1px); }
      .btn-header-secondary { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: white; font-size: 0.9rem; font-weight: 500; border-radius: 12px; cursor: pointer; transition: all 0.2s; }
      .btn-header-secondary:hover { background: rgba(255,255,255,0.25); }
      
      /* Stats Grid */
      .billing-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
      @media (max-width: 1200px) { .billing-stats-grid { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 600px) { .billing-stats-grid { grid-template-columns: 1fr; } }
      
      .stat-card-new { background: white; border-radius: 16px; padding: 1.25rem; display: flex; align-items: center; gap: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; position: relative; transition: all 0.2s; }
      .stat-card-new:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-2px); }
      .stat-card-new.success { border-color: #bbf7d0; background: linear-gradient(135deg, #fff 0%, #f0fdf4 100%); }
      
      .stat-card-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.5rem; }
      .stat-card-icon.orange { background: #fff7ed; }
      .stat-card-icon.red { background: #fef2f2; }
      .stat-card-icon.blue { background: #eff6ff; }
      .stat-card-icon.green { background: #f0fdf4; }
      .stat-card-icon.purple { background: #f3e8ff; }
      
      .stat-card-content { flex: 1; min-width: 0; }
      .stat-card-value { display: block; font-size: 1.5rem; font-weight: 700; color: #0f172a; line-height: 1.2; }
      .stat-card-label { display: block; font-size: 0.85rem; color: #64748b; margin-top: 0.25rem; }
      
      /* Tabs */
      .billing-tabs-container { background: white; border-radius: 16px; padding: 0.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; }
      .billing-tabs-new { display: flex; gap: 0.5rem; }
      
      .tab-btn-new { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.25rem; border: none; background: transparent; border-radius: 12px; cursor: pointer; font-size: 0.9rem; color: #64748b; transition: all 0.2s; }
      .tab-btn-new:hover { background: #f8fafc; color: #334155; }
      .tab-btn-new.active { background: linear-gradient(135deg, #f97316 0%, #ec4899 100%); color: white; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3); }
      
      .tab-icon { font-size: 1.1rem; }
      .tab-badge { background: rgba(255,255,255,0.2); padding: 0.15rem 0.5rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
      .tab-btn-new:not(.active) .tab-badge { background: #f1f5f9; color: #64748b; }
      
      /* Content Area */
      .billing-content-area { background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; }
      
      /* Table Filters */
      .table-filters { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center; }
      .filter-search { flex: 1; max-width: 300px; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; transition: all 0.2s; }
      .filter-search:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }
      .filter-select { padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; background: white; cursor: pointer; }
      .filter-actions { display: flex; gap: 0.5rem; margin-left: auto; }
      .btn-filter { padding: 0.5rem 0.875rem; background: #f1f5f9; border: none; border-radius: 8px; font-size: 0.85rem; cursor: pointer; transition: all 0.15s; }
      .btn-filter:hover { background: #e2e8f0; }
      .btn-filter.purple:hover { background: #f3e8ff; color: #7c3aed; }
      .btn-filter.red:hover { background: #fee2e2; color: #dc2626; }
      .btn-filter.orange { background: linear-gradient(135deg, #f97316, #ea580c); color: white; }
      .btn-filter.orange:hover { opacity: 0.9; box-shadow: 0 2px 8px rgba(249,115,22,0.3); }
      
      /* Data Table */
      .table-container { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; }
      .data-table { width: 100%; border-collapse: separate; border-spacing: 0; }
      .data-table thead th { background: #f8fafc; padding: 1rem; text-align: left; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
      .data-table thead th:first-child { border-radius: 10px 0 0 0; }
      .data-table thead th:last-child { border-radius: 0 10px 0 0; }
      .data-table tbody tr { transition: background 0.15s; }
      .data-table tbody tr:hover { background: #f8fafc; }
      .data-table tbody td { padding: 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; color: #334155; vertical-align: middle; }
      
      /* Lead cells */
      .lead-company { display: flex; flex-direction: column; gap: 0.125rem; }
      .lead-company strong { color: #1e293b; font-weight: 600; }
      .lead-domain { font-size: 0.8rem; color: #f97316; }
      .lead-contact { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
      .contact-email { color: #2563eb; }
      .contact-phone { color: #059669; }
      
      /* Status Badges */
      .status-badge { display: inline-flex; align-items: center; padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 500; }
      .status-badge.blue { background: #dbeafe; color: #1d4ed8; }
      .status-badge.green { background: #dcfce7; color: #15803d; }
      .status-badge.yellow { background: #fef3c7; color: #b45309; }
      .status-badge.purple { background: #f3e8ff; color: #7c3aed; }
      .status-badge.red { background: #fee2e2; color: #dc2626; }
      
      .analysis-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.5rem; background: #d1fae5; color: #047857; border-radius: 12px; font-size: 0.7rem; font-weight: 600; margin-left: 0.5rem; }
      
      /* Industry Tag */
      .industry-tag { display: inline-block; padding: 0.25rem 0.6rem; background: #f1f5f9; color: #475569; border-radius: 6px; font-size: 0.8rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .text-muted { color: #94a3b8; }
      
      /* Date Cell */
      .date-cell { font-size: 0.85rem; color: #475569; }
      .time-ago { display: block; font-size: 0.75rem; color: #94a3b8; }
      
      /* Score */
      .score-cell { display: flex; align-items: center; justify-content: center; }
      .score-badge { min-width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
      .score-badge.high { background: #d1fae5; color: #047857; }
      .score-badge.medium { background: #fef3c7; color: #b45309; }
      .score-badge.low { background: #f1f5f9; color: #64748b; }
      
      /* Action Buttons */
      .action-buttons { display: flex; gap: 0.25rem; align-items: center; }
      .btn-detail { padding: 0.4rem 0.75rem; background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
      .btn-detail:hover { box-shadow: 0 2px 8px rgba(249,115,22,0.4); transform: translateY(-1px); }
      .btn-icon { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; background: #f1f5f9; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: all 0.15s; }
      .btn-icon:hover { background: #e2e8f0; }
      .btn-icon.green:hover { background: #d1fae5; }
      
      /* Form Card */
      .form-card { background: white; border-radius: 16px; padding: 2rem; max-width: 800px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; }
      .form-card h2 { font-size: 1.25rem; margin: 0 0 0.5rem; font-weight: 600; }
      .form-desc { color: #64748b; margin-bottom: 1.5rem; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
      @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
      .form-group { margin-bottom: 0; }
      .form-group label { display: block; font-size: 0.85rem; font-weight: 500; color: #475569; margin-bottom: 0.5rem; }
      .form-group input, .form-group textarea, .form-group select, .form-textarea { width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; box-sizing: border-box; transition: all 0.2s; }
      .form-group input:focus, .form-group textarea:focus, .form-textarea:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
      .form-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
      
      /* Buttons */
      .btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem; background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
      .btn-primary:hover { box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4); transform: translateY(-1px); }
      .btn-secondary { padding: 0.75rem 1.25rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
      .btn-secondary:hover { background: #e2e8f0; }
      
      /* Modal */
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
      .modal-box-new { background: white; border-radius: 16px; width: 100%; max-width: 540px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
      .modal-box-new.modal-large { max-width: 900px; }
      .modal-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
      .modal-header h2 { font-size: 1.25rem; font-weight: 600; margin: 0; }
      .modal-header-gradient { padding: 1.25rem 1.5rem; background: linear-gradient(135deg, #f97316, #ec4899); color: white; display: flex; justify-content: space-between; align-items: center; }
      .modal-header-gradient h2 { font-size: 1.25rem; font-weight: 600; margin: 0; }
      .modal-close { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.2); border: none; border-radius: 8px; cursor: pointer; color: white; font-size: 1.25rem; }
      .modal-close-dark { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border: none; border-radius: 8px; cursor: pointer; color: #64748b; font-size: 1.25rem; }
      .modal-body { padding: 1.5rem; overflow-y: auto; flex: 1; }
      .modal-desc { color: #64748b; margin-bottom: 1.5rem; }
      .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
      .tip-box { background: #eff6ff; border-radius: 10px; padding: 1rem; font-size: 0.9rem; color: #1e40af; margin-top: 1rem; }
      
      /* Empty State */
      .empty-state { text-align: center; padding: 3rem; }
      .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
      .empty-state h3 { margin: 0 0 0.5rem; color: #1e293b; }
      .empty-state p { color: #64748b; margin: 0 0 1.5rem; }
      
      /* Analysis Section */
      .analysis-section { background: #f8fafc; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
      .analysis-section h3 { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; }
      .tag { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; margin: 2px; }
      .tag-green { background: #dcfce7; color: #166534; }
      .tag-orange { background: #ffedd5; color: #9a3412; }
      .tag-blue { background: #dbeafe; color: #1e40af; }
      
      /* Responsive */
      @media (max-width: 768px) {
        .header-content { flex-direction: column; gap: 1rem; text-align: center; }
        .header-actions { justify-content: center; }
        .table-filters { flex-direction: column; }
        .filter-search { max-width: 100%; }
        .filter-actions { margin-left: 0; width: 100%; justify-content: flex-start; }
      }
      
      /* Social Icons in table */
      .social-icons { display: flex; gap: 0.25rem; margin-top: 0.25rem; }
      .social-icon { width: 20px; height: 20px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; text-decoration: none; color: white; }
      .social-icon.fb { background: #1877f2; }
      .social-icon.ig { background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); font-size: 0.7rem; }
      .social-icon.li { background: #0a66c2; }
      
      /* Lead Detail Modal */
      .lead-detail-modal { }
      .lead-detail-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; margin-bottom: 1rem; }
      .lead-detail-info h2 { margin: 0; font-size: 1.5rem; font-weight: 700; color: #1e293b; }
      .lead-detail-domain { color: #f97316; text-decoration: none; font-size: 0.9rem; }
      .lead-detail-domain:hover { text-decoration: underline; }
      .lead-detail-score { text-align: center; }
      .score-big { width: 64px; height: 64px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 800; }
      .score-big.high { background: #d1fae5; color: #047857; }
      .score-big.medium { background: #fef3c7; color: #b45309; }
      .score-big.low { background: #f1f5f9; color: #64748b; }
      .lead-detail-score span { font-size: 0.75rem; color: #64748b; }
      
      /* Detail Tabs */
      .lead-detail-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }
      .lead-tab { padding: 0.5rem 1rem; background: transparent; border: none; border-radius: 8px; cursor: pointer; font-size: 0.85rem; color: #64748b; transition: all 0.15s; }
      .lead-tab:hover { background: #f1f5f9; color: #1e293b; }
      .lead-tab.active { background: #f97316; color: white; }
      
      /* Detail Cards */
      .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
      @media (max-width: 640px) { .detail-grid { grid-template-columns: 1fr; } }
      .detail-card { background: #f8fafc; border-radius: 12px; overflow: hidden; }
      .detail-card-header { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
      .detail-card-icon { font-size: 1.25rem; }
      .detail-card-header h3 { margin: 0; font-size: 0.9rem; font-weight: 600; }
      .detail-card-body { padding: 1rem; }
      .detail-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #e2e8f0; }
      .detail-row:last-child { border-bottom: none; }
      .detail-label { color: #64748b; font-size: 0.85rem; }
      .detail-value { font-size: 0.85rem; color: #1e293b; }
      .detail-value a { color: #2563eb; text-decoration: none; }
      .detail-value a:hover { text-decoration: underline; }
      .detail-value .empty { color: #94a3b8; font-style: italic; }
      .source-badge { background: #dbeafe; color: #1d4ed8; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
      
      /* Status Buttons */
      .status-buttons { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
      .status-buttons label { font-size: 0.75rem; color: #64748b; display: block; margin-bottom: 0.5rem; }
      .status-btn-group { display: flex; gap: 0.25rem; }
      .status-btn { width: 36px; height: 36px; border: none; border-radius: 8px; background: #e2e8f0; cursor: pointer; font-size: 1rem; transition: all 0.15s; }
      .status-btn:hover { background: #cbd5e1; }
      .status-btn.active { background: #f97316; }
      
      /* CTA Box */
      .detail-cta { display: flex; align-items: center; gap: 1rem; padding: 1.5rem; background: linear-gradient(135deg, #fff7ed, #fef3c7); border: 1px solid #fed7aa; border-radius: 12px; }
      .cta-icon { font-size: 2.5rem; }
      .cta-content { flex: 1; }
      .cta-content h3 { margin: 0 0 0.25rem; font-size: 1rem; font-weight: 600; }
      .cta-content p { margin: 0; font-size: 0.85rem; color: #64748b; }
      
      /* Social Cards */
      .social-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
      @media (max-width: 640px) { .social-grid { grid-template-columns: 1fr; } }
      .social-card { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.15s; }
      .social-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transform: translateY(-1px); }
      .social-card-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
      .social-card.facebook .social-card-icon { background: #e7f3ff; }
      .social-card.instagram .social-card-icon { background: #fce7f3; }
      .social-card.linkedin .social-card-icon { background: #e0f2fe; }
      .social-card.youtube .social-card-icon { background: #fee2e2; }
      .social-card.tiktok .social-card-icon { background: #f3e8ff; }
      .social-card-info { flex: 1; }
      .social-card-info strong { display: block; font-size: 0.9rem; }
      .social-card-info span { font-size: 0.8rem; color: #64748b; }
      .social-card-arrow { color: #94a3b8; font-size: 1.25rem; }
      .contact-page-info { margin-top: 1rem; padding: 1rem; background: #f8fafc; border-radius: 8px; font-size: 0.85rem; }
      .contact-page-info span { color: #64748b; }
      .contact-page-info a { color: #2563eb; margin-left: 0.5rem; }
      
      /* History Timeline */
      .history-timeline { padding-left: 1rem; }
      .history-item { display: flex; gap: 1rem; padding: 1rem 0; position: relative; }
      .history-item:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 2.5rem; bottom: 0; width: 2px; background: #e2e8f0; }
      .history-dot { width: 12px; height: 12px; border-radius: 50%; background: #10b981; margin-top: 0.25rem; flex-shrink: 0; }
      .history-dot.blue { background: #3b82f6; }
      .history-content strong { display: block; font-size: 0.9rem; }
      .history-content span { font-size: 0.8rem; color: #64748b; }
    </style>`;
  },

  renderLeadsList() {
    if (this.leads.length === 0) {
      return `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-icon">👥</div>
              <h3>Žiadne leady</h3>
              <p>Pridajte prvý lead alebo importujte domény</p>
              <button class="btn-primary" onclick="LeadsModule.showTab('add')">+ Nový lead</button>
            </div>
          </td>
        </tr>
      `;
    }
    
    return this.leads.map(lead => {
      const a = lead.analysis || {};
      const md = lead.marketing_data || {};
      const hasAnalysis = a.company || a.analysis;
      const hasSocials = md.socialMedia && Object.keys(md.socialMedia).length > 0;
      const score = lead.score || 0;
      const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
      
      // Typ/Industry - z analysis alebo lead.industry
      const industry = lead.industry || a.company?.industry || a.analysis?.industry || '';
      const industryShort = industry.length > 20 ? industry.substring(0, 18) + '...' : industry;
      
      // Dátum importu
      const createdAt = lead.created_at ? new Date(lead.created_at) : null;
      const dateStr = createdAt ? createdAt.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' }) : '-';
      const timeAgo = createdAt ? this.getTimeAgo(createdAt) : '';
      
      const statusConfig = {
        'new': { label: 'Nový', class: 'blue' },
        'contacted': { label: 'Kontaktovaný', class: 'yellow' },
        'proposal_sent': { label: 'Ponuka', class: 'purple' },
        'won': { label: 'Vyhraný', class: 'green' },
        'lost': { label: 'Prehraný', class: 'red' }
      };
      const status = statusConfig[lead.status] || statusConfig['new'];
      
      // Social icons
      const socials = md.socialMedia || {};
      const socialIcons = [];
      if (socials.facebook) socialIcons.push(`<a href="${socials.facebook}" target="_blank" onclick="event.stopPropagation()" class="social-icon fb" title="Facebook">f</a>`);
      if (socials.instagram) socialIcons.push(`<a href="${socials.instagram}" target="_blank" onclick="event.stopPropagation()" class="social-icon ig" title="Instagram">📷</a>`);
      if (socials.linkedin) socialIcons.push(`<a href="${socials.linkedin}" target="_blank" onclick="event.stopPropagation()" class="social-icon li" title="LinkedIn">in</a>`);
      
      return `
        <tr data-status="${lead.status}" data-industry="${industry}">
          <td>
            <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} onchange="LeadsModule.toggleSelect('${lead.id}')">
          </td>
          <td>
            <div class="lead-company">
              <strong>${lead.company_name || lead.domain || 'Neznámy'}</strong>
              ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="lead-domain">${lead.domain} ↗</a>` : ''}
            </div>
          </td>
          <td>
            ${industry ? `<span class="industry-tag" title="${industry}">${industryShort}</span>` : '<span class="text-muted">-</span>'}
          </td>
          <td>
            <div class="lead-contact">
              ${lead.email ? `<a href="mailto:${lead.email}" class="contact-email">📧 ${lead.email}</a>` : ''}
              ${lead.phone ? `<a href="tel:${lead.phone}" class="contact-phone">📞 ${lead.phone}</a>` : ''}
              ${!lead.email && !lead.phone ? '<span style="color:#94a3b8">-</span>' : ''}
            </div>
            ${socialIcons.length > 0 ? `<div class="social-icons">${socialIcons.join('')}</div>` : ''}
          </td>
          <td>
            <span class="status-badge ${status.class}">${status.label}</span>
            ${hasAnalysis ? '<span class="analysis-badge">✓ AI</span>' : ''}
            ${hasSocials && !hasAnalysis ? '<span class="analysis-badge" style="background:#dbeafe;color:#1d4ed8;">📊 MM</span>' : ''}
          </td>
          <td>
            <span class="date-cell" title="${createdAt ? createdAt.toLocaleString('sk-SK') : ''}">${dateStr}</span>
            ${timeAgo ? `<small class="time-ago">${timeAgo}</small>` : ''}
          </td>
          <td>
            <div class="score-cell">
              <span class="score-badge ${scoreClass}">${score}</span>
            </div>
          </td>
          <td>
            <div class="action-buttons">
              <button class="btn-detail" onclick="LeadsModule.showLeadDetail('${lead.id}')">Detail</button>
              <button class="btn-icon" onclick="LeadsModule.analyze('${lead.id}')" title="AI Analýza">🤖</button>
              ${hasAnalysis ? `<button class="btn-icon" onclick="LeadsModule.showProposalModal('${lead.id}')" title="Ponuka">📄</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },
  
  getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'dnes';
    if (days === 1) return 'včera';
    if (days < 7) return `pred ${days}d`;
    if (days < 30) return `pred ${Math.floor(days / 7)}t`;
    return '';
  },

  toggleAllCheckbox(checked) {
    if (checked) this.leads.forEach(l => this.selectedIds.add(l.id));
    else this.selectedIds.clear();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },
  
  getProposalBadge(status, sentAt) {
    const badges = {
      'not_sent': '',
      'sent': `<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded" title="${sentAt ? 'Odoslané: ' + Utils.formatDate(sentAt) : ''}">📧 Odoslané</span>`,
      'opened': `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">👁️ Otvorené</span>`,
      'responded': `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">💬 Odpovedal</span>`,
      'converted': `<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">🎉 Konvertovaný</span>`
    };
    return badges[status] || '';
  },

  setupEventListeners() {
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', (e) => { clearTimeout(timeout); timeout = setTimeout(() => this.onSearchChange(e.target.value), 300); });
    }
  },

  showTab(tab) {
    // Update tabs
    document.querySelectorAll('.tab-btn-new').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn-new[data-tab="${tab}"]`)?.classList.add('active');
    
    // Render content
    const contentEl = document.getElementById('leads-tab-content');
    if (!contentEl) return;
    
    switch(tab) {
      case 'list':
        contentEl.innerHTML = this.renderListTab();
        this.setupEventListeners();
        break;
      case 'import':
        contentEl.innerHTML = this.renderImportTab();
        break;
      case 'add':
        contentEl.innerHTML = this.renderAddTab();
        break;
    }
  },

  async onSearchChange(value) { this.filters.search = value; await this.loadLeads(); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); document.getElementById('leads-count').textContent = this.leads.length; },
  async onStatusChange(value) { this.filters.status = value; await this.loadLeads(); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); document.getElementById('leads-count').textContent = this.leads.length; },
  async onIndustryChange(value) { 
    this.filters.industry = value; 
    // Filter lokálne (industry nie je v DB)
    if (value) {
      const allLeads = [...this.leads];
      this.leads = allLeads.filter(l => {
        const ind = l.industry || l.analysis?.company?.industry || '';
        return ind.toLowerCase().includes(value.toLowerCase());
      });
    } else {
      await this.loadLeads();
    }
    document.getElementById('leads-list').innerHTML = this.renderLeadsList(); 
    document.getElementById('leads-count').textContent = this.leads.length; 
  },
  
  async onDateChange(value) {
    this.filters.dateRange = value;
    await this.loadLeads(); // Načítať všetky
    
    if (value) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      this.leads = this.leads.filter(l => {
        if (!l.created_at) return value === 'older';
        const created = new Date(l.created_at);
        
        switch (value) {
          case 'today':
            return created >= today;
          case 'yesterday':
            return created >= yesterday && created < today;
          case 'week':
            return created >= weekAgo;
          case 'month':
            return created >= monthAgo;
          case 'older':
            return created < monthAgo;
          default:
            return true;
        }
      });
    }
    
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },
  toggleSelect(id) { if (this.selectedIds.has(id)) this.selectedIds.delete(id); else this.selectedIds.add(id); },
  selectAll() { this.leads.forEach(l => this.selectedIds.add(l.id)); document.getElementById('leads-list').innerHTML = this.renderLeadsList(); },

  async analyze(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    this.currentLeadId = id;
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    modal.style.display = 'flex';
    
    // Vylepšený loading s progress
    content.innerHTML = `
      <div style="text-align:center;padding:4rem;">
        <div style="font-size:4rem;margin-bottom:1.5rem;animation:spin 2s linear infinite;">🤖</div>
        <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem;">Analyzujem ${lead.company_name || lead.domain}...</h3>
        <p style="color:#64748b;" id="analysis-status">Pripravujem analýzu...</p>
        <div style="margin-top:1.5rem;background:#e2e8f0;border-radius:9999px;height:8px;width:300px;margin:1.5rem auto;">
          <div id="analysis-progress" style="background:linear-gradient(135deg,#FF6B35,#E91E63);height:100%;border-radius:9999px;width:10%;transition:width 0.5s;"></div>
        </div>
        <p style="font-size:0.85rem;color:#94a3b8;margin-top:1rem;">Toto môže trvať 20-40 sekúnd</p>
      </div>
      <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
    `;
    this.renderModalFooter(false);
    
    const updateProgress = (percent, status) => {
      const bar = document.getElementById('analysis-progress');
      const text = document.getElementById('analysis-status');
      if (bar) bar.style.width = percent + '%';
      if (text) text.textContent = status;
    };
    
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      // KROK 1: Získať reálne keywords z Marketing Miner (ak je nakonfigurovaný)
      updateProgress(15, '🔍 Získavam reálne dáta o kľúčových slovách...');
      
      let realKeywordsData = null;
      let realDomainStats = null;
      
      // Pripraviť seed keyword z názvu firmy alebo domény
      const seedKeyword = this.extractSeedKeyword(lead);
      console.log('🔑 Seed keyword pre MM API:', seedKeyword);
      
      if (seedKeyword) {
        try {
          // Volanie MM API pre keywords
          console.log('📡 Volám MM API keywords_suggestions...');
          realKeywordsData = await this.getKeywordsSuggestions(seedKeyword, 'sk');
          console.log('✅ MM Keywords result:', realKeywordsData ? `${realKeywordsData.length} keywords` : 'null');
          
          // Volanie MM API pre domain stats
          if (lead.domain) {
            console.log('📡 Volám MM API domain_stats pre:', lead.domain);
            realDomainStats = await this.getDomainStats(lead.domain, 'sk');
            console.log('✅ MM Domain stats result:', realDomainStats);
          }
        } catch (mmError) {
          console.warn('❌ Marketing Miner API error:', mmError);
          // Pokračujeme bez reálnych dát
        }
      } else {
        console.warn('⚠️ Seed keyword je prázdny, MM API sa nepoužije');
      }
      
      // KROK 2: Základná technická analýza webu
      updateProgress(30, '🌐 Analyzujem webstránku...');
      
      let webAnalysis = null;
      if (lead.domain) {
        webAnalysis = await this.analyzeWebsiteTechnical(lead.domain);
      }
      
      // KROK 3: Pripraviť Marketing Miner dáta pre AI
      updateProgress(50, '🧠 AI analyzuje váš biznis...');
      
      const md = lead.marketing_data || {};
      const existingSocials = md.socialMedia || {};
      
      // Pripraviť enriched data pre AI
      const enrichedData = {
        // Základné info
        email: lead.email,
        phone: lead.phone,
        contactPage: md.contactPage,
        socialMedia: existingSocials,
        source: md.source,
        
        // NOVÉ: Reálne keywords z MM
        realKeywords: realKeywordsData ? {
          available: true,
          keywords: realKeywordsData.slice(0, 20),
          avgCpc: this.calculateAvgCpcFromKeywords(realKeywordsData),
          totalSearchVolume: realKeywordsData.reduce((sum, k) => sum + (k.searchVolume || 0), 0)
        } : { available: false },
        
        // NOVÉ: Domain stats z MM  
        domainStats: realDomainStats ? {
          available: true,
          visibility: realDomainStats.visibility,
          estimatedTraffic: realDomainStats.estimatedTraffic,
          topKeywords: realDomainStats.topKeywords
        } : { available: false },
        
        // NOVÉ: Technická analýza webu
        webAnalysis: webAnalysis ? {
          available: true,
          loadTime: webAnalysis.loadTime,
          hasSSL: webAnalysis.hasSSL,
          issues: webAnalysis.issues
        } : { available: false },
        
        // NOVÉ: Kategorization z importu
        categorization: md.categorization || null
      };
      
      // KROK 4: Volať AI analýzu s enriched dátami
      const response = await fetch(this.ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          websiteUrl: lead.domain ? `https://${lead.domain}` : null, 
          companyName: lead.company_name, 
          leadId: lead.id,
          knownData: enrichedData,
          // NOVÉ: Inštrukcie pre AI
          analysisInstructions: {
            useRealKeywords: realKeywordsData !== null,
            personalizeMore: true,
            includeSpecificNumbers: true
          }
        })
      });
      
      updateProgress(80, '📊 Spracovávam výsledky...');
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Analýza zlyhala');
      
      // KROK 5: Obohatiť výsledky o reálne dáta
      updateProgress(90, '✨ Finalizujem analýzu...');
      
      const enrichedAnalysis = this.enrichAnalysisWithRealData(
        result.analysis, 
        realKeywordsData, 
        realDomainStats,
        webAnalysis
      );
      
      // Merge Marketing Miner social media dáta
      if (Object.keys(existingSocials).length > 0) {
        enrichedAnalysis.onlinePresence = enrichedAnalysis.onlinePresence || {};
        enrichedAnalysis.onlinePresence.socialMedia = enrichedAnalysis.onlinePresence.socialMedia || {};
        Object.keys(existingSocials).forEach(key => {
          if (existingSocials[key] && !enrichedAnalysis.onlinePresence.socialMedia[key]?.url) {
            enrichedAnalysis.onlinePresence.socialMedia[key] = {
              exists: true,
              url: existingSocials[key],
              source: 'marketing_miner'
            };
          }
        });
      }
      
      updateProgress(100, '✅ Hotovo!');
      
      this.currentAnalysis = enrichedAnalysis;
      this.editedAnalysis = JSON.parse(JSON.stringify(enrichedAnalysis));
      
      await Database.update('leads', id, { 
        analysis: enrichedAnalysis, 
        status: 'analyzed', 
        score: this.calculateScore(enrichedAnalysis), 
        analyzed_at: new Date().toISOString() 
      });
      
      lead.analysis = enrichedAnalysis;
      lead.status = 'analyzed';
      lead.score = this.calculateScore(enrichedAnalysis);
      
      this.renderAnalysisResults(lead, enrichedAnalysis);
      this.renderModalFooter(true);
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      Utils.toast('Analýza dokončená!', 'success');
      
    } catch (error) {
      console.error('Analysis error:', error);
      content.innerHTML = `
        <div style="text-align:center;padding:4rem;">
          <div style="font-size:4rem;margin-bottom:1.5rem;">❌</div>
          <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem;">Chyba pri analýze</h3>
          <p style="color:#64748b;margin-bottom:1.5rem;">${error.message}</p>
          <button onclick="LeadsModule.analyze('${id}')" class="btn-primary">🔄 Skúsiť znova</button>
        </div>
      `;
      this.renderModalFooter(false);
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
      ${k.topKeywords?.length ? `<div class="analysis-section"><h3>🔍 Kľúčové slová</h3><p class="text-sm text-gray-500 mb-3">${k.summary || ''}</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-100"><tr><th class="text-left p-2 rounded-l-lg">Kľúčové slovo</th><th class="text-center p-2">Hľadanosť</th><th class="text-center p-2">Konkurencia</th><th class="text-right p-2 rounded-r-lg">CPC</th></tr></thead><tbody>${k.topKeywords.slice(0, 10).map(kw => `<tr class="border-b"><td class="p-2 font-medium">${kw.keyword}</td><td class="text-center p-2">${kw.searchVolume}</td><td class="text-center p-2"><span class="tag ${kw.competition === 'nízka' ? 'tag-green' : kw.competition === 'vysoká' ? 'tag-orange' : 'tag-blue'}">${kw.competition}</span></td><td class="text-right p-2">${kw.cpc}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${b.recommendations ? `<div class="analysis-section"><h3>💰 Odporúčaný rozpočet</h3><div class="grid md:grid-cols-3 gap-4"><div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center"><p class="text-sm text-gray-500 mb-1">Štart</p><p class="text-3xl font-bold text-gray-700">${b.recommendations.starter?.adSpend || 300}€</p><p class="text-xs text-gray-400">mesačne</p></div><div class="bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl p-5 text-center text-white transform scale-105"><p class="text-sm opacity-80 mb-1">⭐ Odporúčame</p><p class="text-3xl font-bold">${b.recommendations.recommended?.adSpend || 500}€</p><p class="text-xs opacity-80">mesačne</p></div><div class="bg-white rounded-xl p-5 border-2 border-gray-200 text-center"><p class="text-sm text-gray-500 mb-1">Agresívny</p><p class="text-3xl font-bold text-gray-700">${b.recommendations.aggressive?.adSpend || 800}€</p><p class="text-xs text-gray-400">mesačne</p></div></div></div>` : ''}
      ${r.projection ? `<div class="analysis-section bg-green-50"><h3>📈 Predpokladaná návratnosť</h3><div class="grid grid-cols-3 gap-4 text-center"><div><p class="text-2xl font-bold text-green-600">${r.projection.monthlyLeads}</p><p class="text-xs text-gray-500">Mesačných dopytov</p></div><div><p class="text-2xl font-bold text-green-600">${r.projection.monthlyRevenue}</p><p class="text-xs text-gray-500">Potenciálny obrat</p></div><div><p class="text-2xl font-bold text-green-600">${r.projection.roi}</p><p class="text-xs text-gray-500">ROI</p></div></div></div>` : ''}
      ${analysis.customNote ? `<div class="analysis-section border-l-4 border-purple-500 bg-purple-50"><h3>💬 Osobná poznámka</h3><p class="text-gray-700 italic">${analysis.customNote}</p></div>` : ''}
      <div class="analysis-section bg-gradient-to-r from-orange-100 to-pink-100"><h3>🎯 Odporúčaný balíček: ${analysis.recommendedPackage || 'Pro'}</h3><p class="text-gray-600">Na základe analýzy odporúčame balíček <strong>${analysis.recommendedPackage || 'Pro'}</strong>.</p></div>
    `;
  },

  showAnalysis(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead?.analysis) return;
    this.currentLeadId = id;
    this.currentAnalysis = lead.analysis;
    this.editedAnalysis = JSON.parse(JSON.stringify(lead.analysis));
    const modal = document.getElementById('analysis-modal');
    modal.style.display = 'flex';
    this.renderAnalysisResults(lead, lead.analysis);
    this.renderModalFooter(true);
  },

  renderModalFooter(hasAnalysis) {
    const footer = document.getElementById('analysis-footer');
    if (!footer) return;
    
    if (hasAnalysis) {
      footer.innerHTML = `
        <button onclick="LeadsModule.closeModal()" class="btn-secondary">Zavrieť</button>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="LeadsModule.editAnalysis()" class="btn-secondary">✏️ Upraviť</button>
          <button onclick="LeadsModule.generateProposal()" class="btn-primary">📄 Generovať ponuku</button>
        </div>
      `;
    } else {
      footer.innerHTML = `
        <button onclick="LeadsModule.closeModal()" class="btn-secondary">Zavrieť</button>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="LeadsModule.editLeadBasicInfo('${this.currentLeadId}')" class="btn-secondary">✏️ Upraviť</button>
          <button onclick="LeadsModule.convertToClient('${this.currentLeadId}')" class="btn-primary">🎯 Konvertovať</button>
        </div>
      `;
    }
  },

  // Detail leadu - kliknutím na riadok
  showLeadDetail(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    
    this.currentLeadId = id;
    const a = lead.analysis || {};
    const md = lead.marketing_data || {};
    const hasAnalysis = a.company || a.analysis;
    
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    
    // Ak má analýzu, zobrazí ju cez renderAnalysisResults
    if (hasAnalysis) {
      this.currentAnalysis = lead.analysis;
      this.editedAnalysis = JSON.parse(JSON.stringify(lead.analysis));
      modal.style.display = 'flex';
      this.renderAnalysisResults(lead, lead.analysis);
      this.renderModalFooter(true);
      return;
    }
    
    // Modal bez analýzy - lepší štýl
    const statusConfig = {
      'new': { label: 'Nový', class: 'blue' },
      'contacted': { label: 'Kontaktovaný', class: 'yellow' },
      'won': { label: 'Vyhraný', class: 'green' },
      'lost': { label: 'Prehraný', class: 'red' }
    };
    const status = statusConfig[lead.status] || statusConfig['new'];
    const socials = md.socialMedia || {};
    const hasSocials = Object.keys(socials).length > 0;
    
    content.innerHTML = `
      <div class="lead-detail-modal">
        <!-- Header -->
        <div class="lead-detail-header">
          <div class="lead-detail-info">
            <h2>${lead.company_name || lead.domain || 'Neznámy'}</h2>
            ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="lead-detail-domain">${lead.domain} ↗</a>` : ''}
          </div>
          <div class="lead-detail-score">
            <div class="score-big ${(lead.score || 0) >= 70 ? 'high' : (lead.score || 0) >= 40 ? 'medium' : 'low'}">${lead.score || 0}</div>
            <span>Skóre</span>
          </div>
        </div>
        
        <!-- Tabs -->
        <div class="lead-detail-tabs">
          <button class="lead-tab active" onclick="LeadsModule.switchDetailTab('info', this)">📋 Info</button>
          ${hasSocials ? `<button class="lead-tab" onclick="LeadsModule.switchDetailTab('social', this)">📱 Sociálne siete</button>` : ''}
          <button class="lead-tab" onclick="LeadsModule.switchDetailTab('history', this)">📜 História</button>
        </div>
        
        <!-- Tab Content -->
        <div id="detail-tab-info" class="detail-tab-content">
          <div class="detail-grid">
            <!-- Kontakt -->
            <div class="detail-card">
              <div class="detail-card-header">
                <span class="detail-card-icon">📧</span>
                <h3>Kontaktné údaje</h3>
              </div>
              <div class="detail-card-body">
                <div class="detail-row">
                  <span class="detail-label">Email</span>
                  <span class="detail-value">${lead.email ? `<a href="mailto:${lead.email}">${lead.email}</a>` : '<em class="empty">nezadaný</em>'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Telefón</span>
                  <span class="detail-value">${lead.phone ? `<a href="tel:${lead.phone}">${lead.phone}</a>` : '<em class="empty">nezadaný</em>'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Odvetvie</span>
                  <span class="detail-value">${lead.industry || '<em class="empty">nezadané</em>'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Mesto</span>
                  <span class="detail-value">${lead.city || '<em class="empty">nezadané</em>'}</span>
                </div>
              </div>
            </div>
            
            <!-- Status -->
            <div class="detail-card">
              <div class="detail-card-header">
                <span class="detail-card-icon">📊</span>
                <h3>Status</h3>
              </div>
              <div class="detail-card-body">
                <div class="detail-row">
                  <span class="detail-label">Stav</span>
                  <span class="detail-value"><span class="status-badge ${status.class}">${status.label}</span></span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Vytvorený</span>
                  <span class="detail-value">${new Date(lead.created_at).toLocaleDateString('sk-SK')}</span>
                </div>
                ${md.importedAt ? `
                <div class="detail-row">
                  <span class="detail-label">Zdroj</span>
                  <span class="detail-value"><span class="source-badge">Marketing Miner</span></span>
                </div>
                ` : ''}
                
                <div class="status-buttons">
                  <label>Zmeniť status:</label>
                  <div class="status-btn-group">
                    ${['new', 'contacted', 'won', 'lost'].map(s => {
                      const labels = { new: '🆕', contacted: '📞', won: '✅', lost: '❌' };
                      return `<button onclick="LeadsModule.updateStatus('${lead.id}', '${s}')" class="status-btn ${lead.status === s ? 'active' : ''}" title="${statusConfig[s]?.label || s}">${labels[s]}</button>`;
                    }).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- CTA -->
          <div class="detail-cta">
            <div class="cta-icon">🤖</div>
            <div class="cta-content">
              <h3>Spustiť AI analýzu</h3>
              <p>Získajte marketingovú stratégiu, odporúčania a generujte personalizovanú ponuku.</p>
            </div>
            <button onclick="LeadsModule.analyze('${lead.id}')" class="btn-primary">🤖 Analyzovať</button>
          </div>
        </div>
        
        <!-- Social Tab -->
        ${hasSocials ? `
        <div id="detail-tab-social" class="detail-tab-content" style="display:none;">
          <div class="social-grid">
            ${socials.facebook ? `
            <a href="${socials.facebook}" target="_blank" class="social-card facebook">
              <div class="social-card-icon">📘</div>
              <div class="social-card-info">
                <strong>Facebook</strong>
                <span>Profil nájdený</span>
              </div>
              <span class="social-card-arrow">↗</span>
            </a>
            ` : ''}
            ${socials.instagram ? `
            <a href="${socials.instagram}" target="_blank" class="social-card instagram">
              <div class="social-card-icon">📷</div>
              <div class="social-card-info">
                <strong>Instagram</strong>
                <span>Profil nájdený</span>
              </div>
              <span class="social-card-arrow">↗</span>
            </a>
            ` : ''}
            ${socials.linkedin ? `
            <a href="${socials.linkedin}" target="_blank" class="social-card linkedin">
              <div class="social-card-icon">💼</div>
              <div class="social-card-info">
                <strong>LinkedIn</strong>
                <span>Profil nájdený</span>
              </div>
              <span class="social-card-arrow">↗</span>
            </a>
            ` : ''}
            ${socials.youtube ? `
            <a href="${socials.youtube}" target="_blank" class="social-card youtube">
              <div class="social-card-icon">▶️</div>
              <div class="social-card-info">
                <strong>YouTube</strong>
                <span>Kanál nájdený</span>
              </div>
              <span class="social-card-arrow">↗</span>
            </a>
            ` : ''}
            ${socials.tiktok ? `
            <a href="${socials.tiktok}" target="_blank" class="social-card tiktok">
              <div class="social-card-icon">🎵</div>
              <div class="social-card-info">
                <strong>TikTok</strong>
                <span>Profil nájdený</span>
              </div>
              <span class="social-card-arrow">↗</span>
            </a>
            ` : ''}
          </div>
          ${md.contactPage ? `
          <div class="contact-page-info">
            <span>📄 Kontaktná stránka:</span>
            <a href="${md.contactPage}" target="_blank">${md.contactPage}</a>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        <!-- History Tab -->
        <div id="detail-tab-history" class="detail-tab-content" style="display:none;">
          <div class="history-timeline">
            <div class="history-item">
              <div class="history-dot"></div>
              <div class="history-content">
                <strong>Lead vytvorený</strong>
                <span>${new Date(lead.created_at).toLocaleString('sk-SK')}</span>
              </div>
            </div>
            ${md.importedAt ? `
            <div class="history-item">
              <div class="history-dot blue"></div>
              <div class="history-content">
                <strong>Import z Marketing Miner</strong>
                <span>${new Date(md.importedAt).toLocaleString('sk-SK')}</span>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    this.renderModalFooter(false);
  },
  
  switchDetailTab(tab, btn) {
    document.querySelectorAll('.lead-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.detail-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`detail-tab-${tab}`).style.display = 'block';
  },

  async updateStatus(leadId, newStatus) {
    try {
      await Database.update('leads', leadId, { status: newStatus });
      const lead = this.leads.find(l => l.id === leadId);
      if (lead) lead.status = newStatus;
      Utils.toast('Status aktualizovaný', 'success');
      this.showLeadDetail(leadId);
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    } catch (error) {
      Utils.toast('Chyba pri aktualizácii', 'error');
    }
  },

  editLeadBasicInfo(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;
    
    const content = document.getElementById('analysis-content');
    content.innerHTML = `
      <div class="edit-lead-form">
        <h2 class="text-xl font-bold mb-6">✏️ Upraviť lead</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-4">
          <div><label class="block text-sm font-medium mb-1">Názov firmy</label><input type="text" id="edit-lead-name" value="${lead.company_name || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-1">Doména</label><input type="text" id="edit-lead-domain" value="${lead.domain || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="edit-lead-email" value="${lead.email || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-1">Telefón</label><input type="text" id="edit-lead-phone" value="${lead.phone || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-1">Odvetvie</label><input type="text" id="edit-lead-industry" value="${lead.industry || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-1">Mesto</label><input type="text" id="edit-lead-city" value="${lead.city || ''}" class="w-full p-3 border rounded-xl"></div>
        </div>
        <div class="mb-4"><label class="block text-sm font-medium mb-1">Poznámky</label><textarea id="edit-lead-notes" rows="3" class="w-full p-3 border rounded-xl">${lead.notes || ''}</textarea></div>
        <div class="flex gap-3">
          <button onclick="LeadsModule.showLeadDetail('${leadId}')" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">← Späť</button>
          <button onclick="LeadsModule.saveLeadBasicInfo('${leadId}')" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold">💾 Uložiť</button>
        </div>
      </div>
    `;
  },

  async saveLeadBasicInfo(leadId) {
    const updates = {
      company_name: document.getElementById('edit-lead-name').value.trim(),
      domain: document.getElementById('edit-lead-domain').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, ''),
      email: document.getElementById('edit-lead-email').value.trim() || null,
      phone: document.getElementById('edit-lead-phone').value.trim() || null,
      industry: document.getElementById('edit-lead-industry').value.trim() || null,
      city: document.getElementById('edit-lead-city').value.trim() || null,
      notes: document.getElementById('edit-lead-notes').value.trim() || null
    };
    
    console.log('Saving lead:', leadId, updates);
    
    try {
      const { data, error } = await Database.client
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select();
      
      if (error) {
        console.error('Save error:', error);
        throw error;
      }
      
      console.log('Save result:', data);
      
      const lead = this.leads.find(l => l.id === leadId);
      if (lead) Object.assign(lead, updates);
      Utils.toast('Uložené! ✅', 'success');
      this.showLeadDetail(leadId);
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    } catch (error) {
      console.error('Save lead error:', error);
      Utils.toast('Chyba pri ukladaní: ' + (error.message || error), 'error');
    }
  },

  async deleteLead(leadId) {
    if (!await Utils.confirm('Naozaj chcete zmazať tento lead?')) return;
    try {
      await Database.delete('leads', leadId);
      this.leads = this.leads.filter(l => l.id !== leadId);
      Utils.toast('Lead zmazaný', 'success');
      this.closeModal();
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      document.getElementById('leads-count').textContent = this.leads.length;
    } catch (error) {
      Utils.toast('Chyba pri mazaní', 'error');
    }
  },

  async convertToClient(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return Utils.toast('Lead nenájdený', 'error');
    
    if (!await Utils.confirm(`Konvertovať "${lead.company_name || lead.domain}" na klienta?`)) return;
    
    const analysis = lead.analysis || {};
    const company = analysis.company || {};
    
    try {
      const clientData = {
        company_name: lead.company_name || company.name || lead.domain,
        contact_person: lead.contact_person || '',
        email: lead.email || '',
        phone: lead.phone || '',
        website: lead.domain ? `https://${lead.domain}` : '',
        city: lead.city || company.location || '',
        industry: lead.industry || company.industry || '',
        source_lead_id: lead.id,
        status: 'active',
        onboarding_status: 'pending',
        notes: lead.notes || '',
        portal_token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      };
      
      const { data: newClient, error } = await Database.client
        .from('clients')
        .insert([clientData])
        .select()
        .single();
      
      if (error) throw error;
      
      // Update lead
      await Database.update('leads', leadId, { 
        status: 'won',
        proposal_status: 'converted',
        converted_client_id: newClient.id,
        converted_at: new Date().toISOString()
      });
      
      // Update local
      lead.status = 'won';
      lead.proposal_status = 'converted';
      
      Utils.toast(`🎉 Klient "${newClient.company_name}" vytvorený!`, 'success');
      
      this.closeModal();
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      
      if (await Utils.confirm('Otvoriť detail klienta?')) {
        Router.navigate('clients', { id: newClient.id });
      }
      
    } catch (error) {
      console.error('Convert error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },

  closeModal() { 
    const modal = document.getElementById('analysis-modal');
    modal.style.display = 'none';
  },

  editAnalysis() {
    if (!this.editedAnalysis) return;
    const modal = document.getElementById('edit-modal');
    const content = document.getElementById('edit-content');
    modal.style.display = 'flex';
    const a = this.editedAnalysis;
    const lead = this.leads.find(l => l.id === this.currentLeadId) || {};
    content.innerHTML = `
      <div class="form-grid" style="margin-bottom:1rem;">
        <div class="form-group"><label>Názov firmy</label><input type="text" id="edit-company-name" value="${a.company?.name || ''}"></div>
        <div class="form-group"><label>Odporúčaný balíček</label><select id="edit-package"><option value="Starter" ${a.recommendedPackage === 'Starter' ? 'selected' : ''}>Starter (149€)</option><option value="Pro" ${a.recommendedPackage === 'Pro' ? 'selected' : ''}>Pro (249€)</option><option value="Enterprise" ${a.recommendedPackage === 'Enterprise' ? 'selected' : ''}>Enterprise (399€)</option><option value="Premium" ${a.recommendedPackage === 'Premium' ? 'selected' : ''}>Premium (799€)</option></select></div>
      </div>
      <div class="analysis-section" style="margin-bottom:1rem;">
        <h3 style="margin:0 0 1rem;">📧 Kontaktné údaje</h3>
        <div class="form-grid">
          <div class="form-group"><label>Email</label><input type="email" id="edit-email" value="${lead.email || ''}" placeholder="email@firma.sk"></div>
          <div class="form-group"><label>Telefón</label><input type="text" id="edit-phone" value="${lead.phone || ''}" placeholder="+421..."></div>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:1rem;"><label>Popis firmy</label><textarea id="edit-company-desc" rows="3">${a.company?.description || ''}</textarea></div>
      <div class="form-group" style="margin-bottom:1rem;"><label>Úvodný text analýzy</label><textarea id="edit-intro" rows="4">${a.analysis?.humanWrittenIntro || ''}</textarea></div>
      <div class="form-group"><label>Poznámka pre klienta</label><textarea id="edit-custom-note" rows="3">${a.customNote || ''}</textarea></div>
    `;
  },

  closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; },

  async saveAnalysisEdits() {
    if (!this.editedAnalysis || !this.currentLeadId) return;
    this.editedAnalysis.company = this.editedAnalysis.company || {};
    this.editedAnalysis.company.name = document.getElementById('edit-company-name').value;
    this.editedAnalysis.company.description = document.getElementById('edit-company-desc').value;
    this.editedAnalysis.analysis = this.editedAnalysis.analysis || {};
    this.editedAnalysis.analysis.humanWrittenIntro = document.getElementById('edit-intro').value;
    this.editedAnalysis.customNote = document.getElementById('edit-custom-note').value;
    this.editedAnalysis.recommendedPackage = document.getElementById('edit-package').value;
    
    // Ulož aj kontaktné údaje k leadu
    const email = document.getElementById('edit-email').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    
    await Database.update('leads', this.currentLeadId, { 
      analysis: this.editedAnalysis,
      email: email || null,
      phone: phone || null
    });
    
    this.currentAnalysis = this.editedAnalysis;
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (lead) {
      lead.analysis = this.editedAnalysis;
      lead.email = email || null;
      lead.phone = phone || null;
    }
    this.renderAnalysisResults(lead, this.editedAnalysis);
    this.closeEditModal();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    Utils.toast('Zmeny uložené!', 'success');
  },

  async generateProposal() { if (!this.currentLeadId || !this.currentAnalysis) return Utils.toast('Najprv spusti analýzu', 'warning'); this.showProposalModal(this.currentLeadId); },

  async generateProposalFor(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead?.analysis) return Utils.toast('Lead nemá analýzu', 'warning');
    this.showProposalModal(id);
  },

  showProposalModal(id) {
    this.currentLeadId = id;
    const lead = this.leads.find(l => l.id === id);
    if (lead?.analysis) {
      this.currentAnalysis = lead.analysis;
      this.editedAnalysis = JSON.parse(JSON.stringify(lead.analysis));
    }
    const modal = document.getElementById('proposal-modal');
    modal.style.display = 'flex';
    document.getElementById('proposal-notes').value = '';
    
    // Update email target
    const emailTarget = document.getElementById('proposal-email-target');
    const emailBtn = document.getElementById('btn-send-email');
    if (lead?.email) {
      emailTarget.textContent = lead.email;
      emailBtn.disabled = false;
    } else {
      emailTarget.textContent = 'Email nie je k dispozícii';
      emailBtn.disabled = true;
    }
  },

  closeProposalModal() {
    document.getElementById('proposal-modal').style.display = 'none';
  },
  
  // ========== EMAIL MODAL S ŠABLÓNAMI ==========
  
  // Fallback šablóny ak DB je prázdna
  defaultEmailTemplates: [
    {
      id: 'formal',
      slug: 'proposal-formal',
      name: '📋 Formálna',
      subject: 'Marketingová ponuka pre {{company}} - Adlify',
      body_html: `Vážený pán / Vážená pani,

dovoľujeme si Vás osloviť s ponukou marketingových služieb pre spoločnosť {{company}}.

Na základe analýzy Vašej online prítomnosti sme pripravili personalizovanú marketingovú stratégiu, ktorá by mohla významne prispieť k rastu Vášho podnikania.

Naša ponuka zahŕňa:
• Komplexnú analýzu Vašej aktuálnej online prítomnosti
• Odporúčanú marketingovú stratégiu pre Google a Meta platformy
• Návrh rozpočtu s predpokladanou návratnosťou investície
• Konkrétne kroky pre zvýšenie viditeľnosti a získanie nových zákazníkov

Radi Vám ponuku predstavíme osobne alebo prostredníctvom videohovoru. Pre dohodnutie termínu nás prosím kontaktujte odpoveďou na tento email.

S úctou,
Adlify tím

---
📧 info@adlify.eu
🌐 www.adlify.eu`
    },
    {
      id: 'friendly',
      slug: 'proposal-friendly',
      name: '😊 Priateľská',
      subject: 'Máme pre {{company}} niečo zaujímavé! 🚀',
      body_html: `Dobrý deň,

volám sa [Vaše meno] z Adlify a rád by som Vám predstavil niečo, čo by mohlo pomôcť {{company}} získať viac zákazníkov.

Pozreli sme sa na Vašu online prítomnosť a pripravili sme pre Vás pár tipov a odporúčaní, ako by ste mohli osloviť viac ľudí cez internet.

Čo sme pre Vás pripravili:
✅ Zhodnotenie Vašej aktuálnej situácie
✅ Návrh stratégie pre Google a Facebook/Instagram
✅ Odhad koľko nových dopytov by ste mohli získať
✅ Transparentný rozpočet bez skrytých poplatkov

Máte 15 minút na krátky hovor tento týždeň? Rád Vám všetko vysvetlím a odpoviem na otázky.

Stačí odpovedať na tento email alebo zavolať na [telefón].

Ďakujem a teším sa na spoluprácu!

[Vaše meno]
Adlify tím`
    },
    {
      id: 'short',
      slug: 'proposal-short',
      name: '⚡ Stručná',
      subject: 'Ponuka pre {{company}}',
      body_html: `Dobrý deň,

pripravili sme pre {{company}} marketingovú ponuku.

Zahŕňa analýzu vašej online prítomnosti a konkrétne odporúčania pre reklamu na Google a sociálnych sieťach.

Máte záujem o krátku prezentáciu? Stačí odpovedať na tento email.

S pozdravom,
Adlify tím
info@adlify.eu`
    },
    {
      id: 'followup',
      slug: 'proposal-followup', 
      name: '🔄 Follow-up',
      subject: 'Pripomíname sa - ponuka pre {{company}}',
      body_html: `Dobrý deň,

pred niekoľkými dňami sme Vám poslali marketingovú ponuku pre {{company}}.

Chcel by som sa uistiť, že ste email dostali a či nemáte nejaké otázky.

Radi Vám ponuku predstavíme osobne - stačí 15-20 minút Vášho času.

Kedy by Vám vyhovovalo?

S pozdravom,
Adlify tím`
    }
  ],
  
  emailTemplates: [],
  selectedTemplateId: null,
  
  async loadEmailTemplates() {
    try {
      // Načítať z DB
      const dbTemplates = await Database.select('email_templates', {
        filters: { is_active: true },
        order: { column: 'name', ascending: true }
      }) || [];
      
      if (dbTemplates.length > 0) {
        this.emailTemplates = dbTemplates;
      } else {
        // Fallback na predvolené
        this.emailTemplates = this.defaultEmailTemplates;
      }
      
      // Pridať "Vlastná" možnosť
      this.emailTemplates.push({
        id: 'custom',
        slug: 'custom',
        name: '✏️ Vlastná správa',
        subject: '',
        body_html: ''
      });
      
    } catch (error) {
      console.error('Failed to load email templates:', error);
      this.emailTemplates = [...this.defaultEmailTemplates, {
        id: 'custom',
        slug: 'custom',
        name: '✏️ Vlastná správa',
        subject: '',
        body_html: ''
      }];
    }
  },
  
  async openEmailModal() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (!lead?.email) return Utils.toast('Lead nemá email', 'warning');
    
    this.closeProposalModal();
    
    // Načítať šablóny z DB
    await this.loadEmailTemplates();
    this.selectedTemplateId = this.emailTemplates[0]?.id || this.emailTemplates[0]?.slug;
    
    const modal = document.getElementById('email-modal');
    const body = document.getElementById('email-modal-body');
    
    body.innerHTML = this.renderEmailForm(lead);
    modal.style.display = 'flex';
  },
  
  closeEmailModal() {
    document.getElementById('email-modal').style.display = 'none';
  },
  
  renderEmailForm(lead) {
    const companyName = lead.analysis?.company?.name || lead.company_name || lead.domain || 'firma';
    const template = this.emailTemplates.find(t => (t.id || t.slug) === this.selectedTemplateId) || this.emailTemplates[0];
    
    // Nahradiť premenné
    const subject = this.replaceVariables(template?.subject || '', lead);
    const body = this.replaceVariables(this.htmlToPlainText(template?.body_html || ''), lead);
    
    return `
      <div class="email-form">
        <div class="variables-info">
          💡 <strong>Premenné:</strong> <code>{{company}}</code> = názov firmy, <code>{{email}}</code> = email, <code>{{domain}}</code> = doména
        </div>
        
        <div class="email-field">
          <label>📋 Vybrať šablónu</label>
          <div class="template-selector">
            ${this.emailTemplates.map(t => `
              <button type="button" class="template-btn ${(t.id || t.slug) === this.selectedTemplateId ? 'active' : ''}" 
                onclick="LeadsModule.selectEmailTemplate('${t.id || t.slug}')">
                ${t.name}
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="email-row">
          <div class="email-field">
            <label>📧 Komu</label>
            <input type="email" id="email-to" value="${lead.email}" readonly style="background:#f8fafc;">
          </div>
          <div class="email-field">
            <label>👤 Meno príjemcu</label>
            <input type="text" id="email-to-name" value="${companyName}" placeholder="Názov firmy alebo meno">
          </div>
        </div>
        
        <div class="email-field">
          <label>📝 Predmet</label>
          <input type="text" id="email-subject" value="${subject}" placeholder="Predmet emailu">
        </div>
        
        <div class="email-field">
          <label>✉️ Správa</label>
          <textarea id="email-body" placeholder="Text emailu...">${body}</textarea>
        </div>
        
        <input type="hidden" id="email-lead-id" value="${lead.id}">
        
        <div class="email-actions">
          <button type="button" class="btn-link" onclick="LeadsModule.openTemplateManager()">
            ⚙️ Spravovať šablóny
          </button>
        </div>
      </div>
    `;
  },
  
  htmlToPlainText(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },
  
  replaceVariables(text, lead) {
    if (!text) return '';
    const companyName = lead.analysis?.company?.name || lead.company_name || lead.domain || 'firma';
    return text
      .replace(/\{\{company\}\}/g, companyName)
      .replace(/\{\{email\}\}/g, lead.email || '')
      .replace(/\{\{domain\}\}/g, lead.domain || '')
      .replace(/\{\{phone\}\}/g, lead.phone || '');
  },
  
  selectEmailTemplate(templateId) {
    this.selectedTemplateId = templateId;
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (lead) {
      document.getElementById('email-modal-body').innerHTML = this.renderEmailForm(lead);
    }
  },
  
  // ========== TEMPLATE MANAGER ==========
  
  openTemplateManager() {
    const modal = document.getElementById('email-modal');
    const body = document.getElementById('email-modal-body');
    
    body.innerHTML = this.renderTemplateManager();
    
    // Zmeniť footer tlačidlá
    const footer = modal.querySelector('.modal-footer');
    footer.innerHTML = `
      <button onclick="LeadsModule.backToEmailForm()" class="btn-secondary">← Späť</button>
      <button onclick="LeadsModule.showAddTemplateForm()" class="btn-primary">+ Nová šablóna</button>
    `;
  },
  
  renderTemplateManager() {
    const templates = this.emailTemplates.filter(t => t.slug !== 'custom');
    
    return `
      <div class="template-manager">
        <h3 style="margin-bottom: 1rem;">⚙️ Správa email šablón</h3>
        
        <div class="template-list">
          ${templates.map(t => `
            <div class="template-item">
              <div class="template-item-info">
                <strong>${t.name}</strong>
                <small>${t.subject || 'Bez predmetu'}</small>
              </div>
              <div class="template-item-actions">
                <button onclick="LeadsModule.editTemplate('${t.id || t.slug}')" class="btn-icon" title="Upraviť">✏️</button>
                <button onclick="LeadsModule.deleteTemplate('${t.id || t.slug}')" class="btn-icon red" title="Zmazať">🗑️</button>
              </div>
            </div>
          `).join('')}
          
          ${templates.length === 0 ? '<p class="text-muted">Žiadne šablóny. Pridajte novú.</p>' : ''}
        </div>
      </div>
      
      <style>
        .template-manager { }
        .template-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .template-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .template-item-info { flex: 1; }
        .template-item-info strong { display: block; margin-bottom: 0.25rem; }
        .template-item-info small { color: #64748b; }
        .template-item-actions { display: flex; gap: 0.5rem; }
        .template-item-actions .btn-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; cursor: pointer; background: white; }
        .template-item-actions .btn-icon:hover { background: #e2e8f0; }
        .template-item-actions .btn-icon.red:hover { background: #fee2e2; }
      </style>
    `;
  },
  
  backToEmailForm() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (lead) {
      document.getElementById('email-modal-body').innerHTML = this.renderEmailForm(lead);
      
      // Obnoviť footer
      const modal = document.getElementById('email-modal');
      const footer = modal.querySelector('.modal-footer');
      footer.innerHTML = `
        <button onclick="LeadsModule.closeEmailModal()" class="btn-secondary">Zrušiť</button>
        <button onclick="LeadsModule.sendEmailFromModal()" class="btn-primary">📤 Odoslať email</button>
      `;
    }
  },
  
  showAddTemplateForm() {
    this.editingTemplateId = null;
    document.getElementById('email-modal-body').innerHTML = this.renderTemplateForm();
    
    const modal = document.getElementById('email-modal');
    const footer = modal.querySelector('.modal-footer');
    footer.innerHTML = `
      <button onclick="LeadsModule.openTemplateManager()" class="btn-secondary">← Späť</button>
      <button onclick="LeadsModule.saveTemplate()" class="btn-primary">💾 Uložiť šablónu</button>
    `;
  },
  
  editTemplate(templateId) {
    const template = this.emailTemplates.find(t => (t.id || t.slug) === templateId);
    if (!template) return;
    
    this.editingTemplateId = template.id;
    document.getElementById('email-modal-body').innerHTML = this.renderTemplateForm(template);
    
    const modal = document.getElementById('email-modal');
    const footer = modal.querySelector('.modal-footer');
    footer.innerHTML = `
      <button onclick="LeadsModule.openTemplateManager()" class="btn-secondary">← Späť</button>
      <button onclick="LeadsModule.saveTemplate()" class="btn-primary">💾 Uložiť zmeny</button>
    `;
  },
  
  renderTemplateForm(template = null) {
    return `
      <div class="template-form">
        <h3 style="margin-bottom: 1rem;">${template ? '✏️ Upraviť šablónu' : '➕ Nová šablóna'}</h3>
        
        <div class="variables-info">
          💡 <strong>Premenné:</strong> <code>{{company}}</code>, <code>{{email}}</code>, <code>{{domain}}</code>, <code>{{phone}}</code>
        </div>
        
        <div class="email-field" style="margin-top: 1rem;">
          <label>Názov šablóny</label>
          <input type="text" id="tpl-name" value="${template?.name || ''}" placeholder="Napr.: Úvodná ponuka">
        </div>
        
        <div class="email-field">
          <label>Predmet emailu</label>
          <input type="text" id="tpl-subject" value="${template?.subject || ''}" placeholder="Predmet s {{company}}">
        </div>
        
        <div class="email-field">
          <label>Text emailu</label>
          <textarea id="tpl-body" rows="12" placeholder="Text emailu...">${this.htmlToPlainText(template?.body_html || '')}</textarea>
        </div>
      </div>
    `;
  },
  
  async saveTemplate() {
    const name = document.getElementById('tpl-name').value.trim();
    const subject = document.getElementById('tpl-subject').value.trim();
    const bodyText = document.getElementById('tpl-body').value.trim();
    
    if (!name || !subject || !bodyText) {
      return Utils.toast('Vyplň všetky polia', 'warning');
    }
    
    // Konvertovať na HTML
    const body_html = bodyText
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
    
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    try {
      if (this.editingTemplateId) {
        // Update
        await Database.update('email_templates', this.editingTemplateId, {
          name,
          subject,
          body_html
        });
        Utils.toast('Šablóna aktualizovaná!', 'success');
      } else {
        // Insert
        await Database.insert('email_templates', {
          slug,
          name,
          subject,
          body_html,
          category: 'proposal',
          is_active: true
        });
        Utils.toast('Šablóna vytvorená!', 'success');
      }
      
      // Reload a späť
      await this.loadEmailTemplates();
      this.openTemplateManager();
      
    } catch (error) {
      console.error('Save template error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  async deleteTemplate(templateId) {
    if (!confirm('Naozaj chceš zmazať túto šablónu?')) return;
    
    try {
      const template = this.emailTemplates.find(t => (t.id || t.slug) === templateId);
      if (template?.id) {
        await Database.update('email_templates', template.id, { is_active: false });
      }
      
      await this.loadEmailTemplates();
      this.openTemplateManager();
      Utils.toast('Šablóna zmazaná', 'success');
      
    } catch (error) {
      console.error('Delete template error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // Generovať unikátny token
  generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  },
  
  async sendEmailFromModal() {
    const to = document.getElementById('email-to').value.trim();
    const toName = document.getElementById('email-to-name').value.trim();
    let subject = document.getElementById('email-subject').value.trim();
    let body = document.getElementById('email-body').value.trim();
    const leadId = document.getElementById('email-lead-id').value;
    
    if (!to || !subject || !body) {
      return Utils.toast('Vyplň všetky povinné polia', 'warning');
    }
    
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) {
      return Utils.toast('Lead nenájdený', 'error');
    }
    
    Utils.toast('Odosielam email...', 'info');
    
    try {
      const companyName = lead.analysis?.company?.name || lead.company_name || lead.domain || 'firma';
      let proposalUrl = null;
      
      // 1. Skúsiť uložiť ponuku do DB (voliteľné)
      if (lead.analysis) {
        try {
          const notes = document.getElementById('proposal-notes')?.value?.trim();
          let analysisToUse = JSON.parse(JSON.stringify(lead.analysis));
          if (notes) analysisToUse.customNote = notes;
          
          const proposalHtml = this.buildProposalHTML(lead, analysisToUse);
          const proposalToken = this.generateToken();
          
          const { data: proposal, error: proposalError } = await Database.client
            .from('proposals')
            .insert({
              lead_id: leadId,
              token: proposalToken,
              company_name: companyName,
              domain: lead.domain,
              html_content: proposalHtml,
              analysis_data: analysisToUse,
              status: 'sent'
            })
            .select()
            .single();
          
          if (!proposalError && proposal) {
            // Použiť aktuálnu doménu pre odkaz
            const baseUrl = window.location.origin;
            proposalUrl = `${baseUrl}/proposal.html?t=${proposalToken}`;
            console.log('Proposal saved, URL:', proposalUrl);
          } else {
            console.warn('Proposal save failed:', proposalError?.message);
          }
        } catch (e) {
          console.warn('Proposal save error (continuing without link):', e.message);
        }
      }
      
      // 2. Pridať odkaz do emailu ak sa podarilo uložiť
      if (proposalUrl) {
        const proposalSection = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 VAŠA PERSONALIZOVANÁ PONUKA

Pripravili sme pre Vás detailnú marketingovú ponuku.
Kliknite na odkaz nižšie pre jej zobrazenie:

🔗 ${proposalUrl}

V ponuke nájdete:
✓ Analýzu Vašej online prítomnosti
✓ SWOT analýzu a odporúčania  
✓ Návrh kľúčových slov
✓ Odporúčaný rozpočet a ROI
✓ Balíčky služieb

Odkaz je platný 30 dní.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        body = body + proposalSection;
      }
      
      // 3. Konvertovať plain text na HTML
      const htmlBody = this.buildEmailHtmlBody(body, proposalUrl, companyName);
      
      // 4. Odoslať email - len cez Netlify
      console.log('Sending email to:', to);
      
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to,
          toName,
          subject,
          htmlBody,
          textBody: body,
          leadId
        })
      });
      
      let result;
      try {
        result = await response.json();
      } catch (e) {
        result = { success: false, error: 'Invalid response from server' };
      }
      
      console.log('Email send result:', result);
      
      if (result.success) {
        // Aktualizovať lead
        await Database.update('leads', leadId, { 
          status: 'contacted',
          proposal_status: 'sent',
          proposal_sent_at: new Date().toISOString()
        });
        lead.status = 'contacted';
        document.getElementById('leads-list').innerHTML = this.renderLeadsList();
        
        this.closeEmailModal();
        Utils.toast('Email odoslaný! ✉️', 'success');
      } else {
        throw new Error(result.error || 'Odoslanie zlyhalo');
      }
      
    } catch (error) {
      console.error('Email send error:', error);
      Utils.toast('Chyba: ' + error.message, 'error');
    }
  },
  
  // Vytvoriť pekné HTML telo emailu
  buildEmailHtmlBody(plainText, proposalUrl, companyName) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    
    <!-- Header -->
    <div style="text-align:center;padding:20px 0;">
      <img src="https://adlify.eu/logo.png" alt="Adlify" style="height:40px;" onerror="this.outerHTML='<span style=font-size:24px;font-weight:bold;color:#f97316;>ADLIFY</span>'">
    </div>
    
    <!-- Content -->
    <div style="background:white;border-radius:12px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
      ${plainText.split('\n\n').map(p => {
        if (p.includes('━━━')) return '';
        if (p.includes('VAŠA PERSONALIZOVANÁ PONUKA')) {
          return `<h2 style="color:#f97316;font-size:18px;margin:20px 0;">📊 Vaša personalizovaná ponuka</h2>`;
        }
        if (p.includes('🔗')) {
          return '';
        }
        if (p.includes('✓')) {
          const items = p.split('\n').filter(l => l.includes('✓'));
          return `<ul style="list-style:none;padding:0;margin:15px 0;">${items.map(i => `<li style="padding:5px 0;color:#475569;">✓ ${i.replace('✓', '').trim()}</li>`).join('')}</ul>`;
        }
        return `<p style="color:#475569;line-height:1.6;margin:15px 0;">${p.replace(/\n/g, '<br>')}</p>`;
      }).join('')}
      
      <!-- CTA Button -->
      <div style="text-align:center;margin:30px 0;">
        <a href="${proposalUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:15px 40px;border-radius:30px;text-decoration:none;font-weight:600;font-size:16px;">
          📄 Zobraziť ponuku
        </a>
      </div>
      
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin-top:20px;">
        Odkaz je platný 30 dní. Po kliknutí sa otvorí interaktívna ponuka s možnosťou stiahnutia PDF.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="text-align:center;padding:30px 0;color:#94a3b8;font-size:13px;">
      <p style="margin:5px 0;">S pozdravom, <strong>Adlify tím</strong></p>
      <p style="margin:5px 0;">
        <a href="mailto:info@adlify.eu" style="color:#f97316;text-decoration:none;">info@adlify.eu</a> | 
        <a href="https://adlify.eu" style="color:#f97316;text-decoration:none;">www.adlify.eu</a>
      </p>
    </div>
    
  </div>
</body>
</html>`;
  },
  
  // HTML ponuka - otvorí v novom okne
  generateProposalHTML() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (!lead?.analysis) return Utils.toast('Najprv analyzuj lead', 'warning');
    
    const notes = document.getElementById('proposal-notes')?.value?.trim();
    let analysisToUse = JSON.parse(JSON.stringify(lead.analysis));
    if (notes) analysisToUse.customNote = notes;
    
    const html = this.buildProposalHTML(lead, analysisToUse);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
    this.closeProposalModal();
    Utils.toast('Ponuka otvorená', 'success');
  },
  
  // PDF ponuka - otvorí v novom okne s print dialogom
  generateProposalPDF() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (!lead?.analysis) return Utils.toast('Najprv analyzuj lead', 'warning');
    
    const notes = document.getElementById('proposal-notes')?.value?.trim();
    let analysisToUse = JSON.parse(JSON.stringify(lead.analysis));
    if (notes) analysisToUse.customNote = notes;
    
    // Použiť rovnaký HTML ako prezentácia
    const html = this.buildProposalHTML(lead, analysisToUse);
    
    // Otvoriť v novom okne
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Počkať na načítanie a pridať print controls
    printWindow.onload = () => {
      // Pridať floating print button
      const controls = printWindow.document.createElement('div');
      controls.id = 'print-controls';
      controls.innerHTML = `
        <style>
          #print-controls {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            gap: 10px;
            background: white;
            padding: 15px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
          #print-controls button {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          #print-controls .btn-print {
            background: linear-gradient(135deg, #f97316, #ea580c);
            color: white;
          }
          #print-controls .btn-print:hover {
            box-shadow: 0 4px 12px rgba(249,115,22,0.4);
          }
          #print-controls .btn-close {
            background: #f1f5f9;
            color: #64748b;
          }
          @media print {
            #print-controls { display: none !important; }
          }
        </style>
        <button class="btn-print" onclick="window.print()">
          📄 Uložiť ako PDF
        </button>
        <button class="btn-close" onclick="window.close()">
          ✕ Zavrieť
        </button>
      `;
      printWindow.document.body.appendChild(controls);
    };
    
    this.closeProposalModal();
    Utils.toast('V novom okne klikni "Uložiť ako PDF" → v dialogu vyber "Uložiť ako PDF"', 'info');
  },
  
  // Poslať emailom - otvoriť compose modal z Messages modulu
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
  
  buildEmailBody(lead, analysis) {
    const companyName = analysis.company?.name || lead.company_name || 'firma';
    return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="https://adlify.eu/logo.png" alt="Adlify" style="height: 40px;">
        </div>
        
        <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 20px;">
          Personalizovaná marketingová ponuka
        </h1>
        
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          Dobrý deň,
        </p>
        
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">
          ďakujeme za Váš záujem o spoluprácu. Pripravili sme pre <strong>${companyName}</strong> 
          personalizovanú marketingovú ponuku na základe analýzy Vašej online prítomnosti.
        </p>
        
        <div style="background: linear-gradient(135deg, #f97316, #ec4899); border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center;">
          <p style="color: white; font-size: 18px; margin: 0 0 15px;">
            Máte otázky? Radi Vám ich zodpovieme!
          </p>
          <a href="mailto:info@adlify.eu" style="display: inline-block; background: white; color: #f97316; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Kontaktovať nás
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 30px;">
          S pozdravom,<br>
          <strong>Adlify tím</strong><br>
          <a href="https://adlify.eu" style="color: #f97316;">www.adlify.eu</a>
        </p>
      </div>
    `;
  },

buildProposalHTML(lead, analysis) {
  const c = analysis.company || {};
  const a = analysis.analysis || {};
  const o = analysis.onlinePresence || {};
  const k = analysis.keywords || {};
  const s = analysis.strategy || {};
  const b = analysis.budget || {};
  const r = analysis.roi || {};
  const camp = analysis.proposedCampaigns || {};
  const timeline = analysis.timeline || {};
  const comp = analysis.competition || {};
  const recPkg = (analysis.recommendedPackage || 'pro').toLowerCase();
  const clientLogo = lead.domain ? `https://logo.clearbit.com/${lead.domain}` : null;

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marketingová stratégia - ${c.name || lead.company_name}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Poppins', sans-serif; background: #ffffff; color: #1a1a2e; line-height: 1.7; }

/* Header */
.header { position: fixed; top: 0; left: 0; right: 0; background: white; padding: 15px 60px; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
.header-logo { height: 36px; }
.header-right { display: flex; align-items: center; gap: 15px; }
.header-client { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #64748b; font-size: 0.9rem; }
.header-client img { height: 28px; border-radius: 6px; }

/* Pages */
.page { min-height: 100vh; padding: 120px 60px 80px; }
.page-content { max-width: 1000px; margin: 0 auto; }
.page-white { background: #ffffff; }
.page-gray { background: #f8fafc; }

/* Hero Section */
.hero-section { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #fff7ed 0%, #fef2f2 50%, #fdf2f8 100%); padding: 60px; }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 12px 28px; border-radius: 50px; font-size: 0.9rem; font-weight: 600; margin-bottom: 30px; box-shadow: 0 4px 15px rgba(255,107,53,0.3); }
.hero-title { font-size: 2.8rem; font-weight: 300; color: #1a1a2e; margin-bottom: 15px; }
.hero-title span { font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-subtitle { font-size: 1.1rem; color: #64748b; max-width: 700px; margin: 0 auto 50px; line-height: 1.8; }
.hero-company-box { background: white; padding: 25px 60px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); border: 2px solid #e2e8f0; }
.hero-company-name { font-size: 1.8rem; font-weight: 700; color: #FF6B35; }
.hero-info { margin-top: 60px; font-size: 0.95rem; color: #94a3b8; max-width: 600px; }

/* Typography */
.gradient-text { background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.section-badge { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 50%; font-weight: 700; font-size: 1.1rem; margin-right: 18px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(255,107,53,0.3); }
.section-title { font-size: 2.2rem; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; color: #1a1a2e; }
.section-subtitle { font-size: 1.05rem; color: #64748b; margin-bottom: 40px; line-height: 1.8; }
.section-divider { width: 80px; height: 4px; background: linear-gradient(135deg, #FF6B35, #E91E63); border-radius: 2px; margin-bottom: 30px; }

/* Cards */
.card { background: white; border-radius: 20px; padding: 30px; box-shadow: 0 4px 25px rgba(0,0,0,0.06); margin-bottom: 24px; border: 1px solid #e2e8f0; transition: all 0.3s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 8px 35px rgba(0,0,0,0.1); }
.card-highlight { border-left: 4px solid #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }
.card-title { font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }

/* Grid */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; align-items: stretch; }

/* Stats */
.stat-box { text-align: center; padding: 32px 24px; background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; transition: all 0.3s; }
.stat-box:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,0,0,0.1); }
.stat-icon { font-size: 2.8rem; margin-bottom: 15px; }
.stat-value { font-size: 2.2rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.stat-label { font-size: 0.9rem; color: #64748b; margin-top: 10px; font-weight: 500; }

/* Tags */
.tag { display: inline-block; padding: 8px 18px; border-radius: 25px; font-size: 0.85rem; font-weight: 500; margin: 4px; }
.tag-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
.tag-light { background: #f1f5f9; color: #475569; }
.tag-success { background: #dcfce7; color: #166534; }
.tag-warning { background: #fef3c7; color: #92400e; }

/* Services Grid */
.services-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.service-tag { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 1px solid #e2e8f0; padding: 12px 22px; border-radius: 12px; font-size: 0.95rem; font-weight: 500; color: #374151; transition: all 0.3s; }
.service-tag:hover { border-color: #FF6B35; color: #FF6B35; transform: translateY(-2px); }

/* SWOT */
.swot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.swot-box { padding: 28px; border-radius: 20px; }
.swot-box h4 { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; }
.swot-box ul { list-style: none; }
.swot-box li { padding: 10px 0; font-size: 0.95rem; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; align-items: flex-start; gap: 10px; }
.swot-box li:last-child { border-bottom: none; }
.swot-box li::before { content: "•"; font-weight: bold; flex-shrink: 0; }
.swot-strengths { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; }
.swot-strengths h4 { color: #166534; }
.swot-strengths li::before { color: #22c55e; }
.swot-weaknesses { background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #fde68a; }
.swot-weaknesses h4 { color: #92400e; }
.swot-weaknesses li::before { color: #f59e0b; }
.swot-opportunities { background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #93c5fd; }
.swot-opportunities h4 { color: #1e40af; }
.swot-opportunities li::before { color: #3b82f6; }
.swot-threats { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fecaca; }
.swot-threats h4 { color: #991b1b; }
.swot-threats li::before { color: #ef4444; }

/* Table */
.data-table { width: 100%; border-collapse: collapse; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
.data-table th { background: linear-gradient(135deg, #f8fafc, #f1f5f9); padding: 18px 20px; text-align: left; font-weight: 600; color: #475569; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
.data-table td { padding: 18px 20px; border-bottom: 1px solid #e2e8f0; }
.data-table tr:hover { background: #f8fafc; }
.data-table tr:last-child td { border-bottom: none; }

/* Packages */
.package-card { background: white; border: 2px solid #e2e8f0; border-radius: 24px; padding: 40px 30px; text-align: center; transition: all 0.3s; position: relative; display: flex; flex-direction: column; height: 100%; }
.package-card:hover { transform: translateY(-8px); box-shadow: 0 20px 50px rgba(0,0,0,0.12); }
.package-card.featured { border-color: #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); box-shadow: 0 10px 40px rgba(255,107,53,0.15); }
.package-card.featured::before { content: "⭐ Odporúčame"; position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 8px 24px; border-radius: 25px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; box-shadow: 0 4px 15px rgba(255,107,53,0.4); }
.package-icon { font-size: 3.5rem; margin-bottom: 18px; }
.package-name { font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; color: #1a1a2e; }
.package-price { font-size: 3.2rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.package-period { color: #64748b; font-size: 0.95rem; margin-bottom: 20px; }
.package-desc { color: #64748b; font-size: 0.9rem; margin-bottom: 28px; min-height: 50px; line-height: 1.6; }
.package-features { list-style: none; text-align: left; margin-bottom: 30px; flex-grow: 1; }
.package-features li { padding: 14px 0; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; display: flex; align-items: center; gap: 12px; }
.package-features li::before { content: "✓"; color: #22c55e; font-weight: bold; font-size: 1.2rem; flex-shrink: 0; }
.package-btn { display: block; width: 100%; padding: 18px; border-radius: 14px; font-weight: 600; text-decoration: none; transition: all 0.3s; font-size: 1rem; margin-top: auto; cursor: pointer; }
.package-btn-outline { border: 2px solid #e2e8f0; color: #475569; background: white; }
.package-btn-outline:hover { border-color: #FF6B35; color: #FF6B35; }
.package-btn-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border: none; box-shadow: 0 4px 15px rgba(255,107,53,0.3); }
.package-btn-gradient:hover { transform: scale(1.02); box-shadow: 0 8px 25px rgba(255,107,53,0.4); }

/* Timeline */
.timeline { position: relative; padding-left: 60px; margin-top: 40px; }
.timeline::before { content: ''; position: absolute; left: 20px; top: 25px; bottom: 25px; width: 4px; background: linear-gradient(180deg, #FF6B35 0%, #E91E63 25%, #9C27B0 50%, #7c3aed 75%, #3b82f6 100%); border-radius: 4px; }
.timeline-item { position: relative; margin-bottom: 30px; }
.timeline-item::before { content: ''; position: absolute; left: -48px; top: 25px; width: 22px; height: 22px; background: #FF6B35; border-radius: 50%; box-shadow: 0 0 0 5px rgba(255,107,53,0.2); }
.timeline-item:nth-child(2)::before { background: #E91E63; box-shadow: 0 0 0 5px rgba(233,30,99,0.2); }
.timeline-item:nth-child(3)::before { background: #9C27B0; box-shadow: 0 0 0 5px rgba(156,39,176,0.2); }
.timeline-item:nth-child(4)::before { background: #7c3aed; box-shadow: 0 0 0 5px rgba(124,58,237,0.2); }
.timeline-item:nth-child(5)::before { background: #3b82f6; box-shadow: 0 0 0 5px rgba(59,130,246,0.2); }
.timeline-card { background: white; border-radius: 20px; padding: 28px 35px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
.timeline-title { font-weight: 700; margin-bottom: 12px; font-size: 1.15rem; }
.timeline-item:nth-child(1) .timeline-title { color: #FF6B35; }
.timeline-item:nth-child(2) .timeline-title { color: #E91E63; }
.timeline-item:nth-child(3) .timeline-title { color: #9C27B0; }
.timeline-item:nth-child(4) .timeline-title { color: #7c3aed; }
.timeline-item:nth-child(5) .timeline-title { color: #3b82f6; }
.timeline-desc { color: #64748b; font-size: 0.95rem; line-height: 1.8; }

/* Benefits */
.benefit-card { background: white; border-radius: 20px; padding: 35px; box-shadow: 0 4px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; transition: all 0.3s; text-align: center; }
.benefit-card:hover { transform: translateY(-5px); box-shadow: 0 12px 40px rgba(0,0,0,0.1); }
.benefit-icon { font-size: 3rem; margin-bottom: 20px; }
.benefit-title { font-size: 1.15rem; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; }
.benefit-desc { color: #64748b; font-size: 0.95rem; line-height: 1.7; }

/* CTA Section */
.cta-section { text-align: center; background: linear-gradient(135deg, #FF6B35, #E91E63); padding: 80px 60px; border-radius: 30px; color: white; margin-top: 40px; }
.cta-title { font-size: 2.5rem; font-weight: 800; margin-bottom: 15px; }
.cta-subtitle { font-size: 1.15rem; opacity: 0.95; margin-bottom: 40px; max-width: 600px; margin-left: auto; margin-right: auto; }
.cta-buttons { display: flex; justify-content: center; gap: 20px; margin-bottom: 40px; flex-wrap: wrap; }
.cta-btn { padding: 18px 40px; border-radius: 14px; font-weight: 600; text-decoration: none; font-size: 1.05rem; transition: all 0.3s; }
.cta-btn-white { background: white; color: #FF6B35; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
.cta-btn-white:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }
.cta-btn-outline { border: 2px solid white; color: white; background: transparent; }
.cta-btn-outline:hover { background: rgba(255,255,255,0.1); }
.cta-contact { display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
.cta-contact p { font-size: 1rem; opacity: 0.95; }
.cta-contact a { color: white; text-decoration: none; font-weight: 500; }
.cta-contact a:hover { text-decoration: underline; }

/* Footer */
.footer { text-align: center; padding: 60px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
.footer-logo { height: 40px; margin-bottom: 25px; }

/* Ad Preview Cards */
.ad-preview { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 0; overflow: hidden; }
.ad-preview-header { background: linear-gradient(135deg, #f8fafc, #f1f5f9); padding: 15px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 0.9rem; color: #475569; }
.ad-preview-content { padding: 25px; }
.google-ad { border-left: 4px solid #4285f4; }
.google-ad .ad-label { color: #1a0dab; font-size: 0.75rem; font-weight: 600; }
.google-ad .ad-title { color: #1a0dab; font-size: 1.1rem; font-weight: 600; margin: 8px 0; }
.google-ad .ad-url { color: #006621; font-size: 0.85rem; }
.google-ad .ad-desc { color: #545454; font-size: 0.9rem; margin-top: 8px; line-height: 1.6; }
.meta-ad { border-left: 4px solid #1877f2; }
.meta-ad .ad-text { color: #1a1a2e; font-size: 0.95rem; line-height: 1.7; margin-bottom: 15px; }
.meta-ad .ad-headline { font-weight: 700; font-size: 1.1rem; color: #1a1a2e; margin-bottom: 8px; }
.meta-ad .ad-cta { display: inline-block; background: #1877f2; color: white; padding: 10px 20px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; }

/* Budget Cards */
.budget-card { background: white; border: 2px solid #e2e8f0; border-radius: 20px; padding: 35px; text-align: center; transition: all 0.3s; }
.budget-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.1); }
.budget-card.featured { border-color: #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }
.budget-card.featured::before { content: "⭐ Odporúčame"; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 6px 18px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.budget-label { font-size: 1rem; color: #64748b; margin-bottom: 10px; }
.budget-value { font-size: 2.8rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.budget-period { color: #94a3b8; font-size: 0.9rem; margin-bottom: 25px; }
.budget-stats { text-align: left; }
.budget-stat { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
.budget-stat:last-child { border-bottom: none; }
.budget-stat-label { color: #64748b; }
.budget-stat-value { font-weight: 600; color: #1a1a2e; }

/* Info Box */
.info-box { background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #93c5fd; border-radius: 16px; padding: 25px 30px; margin-top: 30px; }
.info-box p { color: #1e40af; font-size: 0.95rem; line-height: 1.7; }
.info-box strong { color: #1e3a8a; }

/* Note Box */
.note-box { background: #f8fafc; border-radius: 16px; padding: 25px 30px; margin-top: 30px; text-align: center; }
.note-box p { color: #64748b; font-size: 0.9rem; }

/* Responsive */
@media (max-width: 1024px) {
  .grid-4 { grid-template-columns: repeat(2, 1fr); }
  .page { padding: 100px 40px 60px; }
}
@media (max-width: 768px) {
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .page { padding: 100px 20px 40px; }
  .header { padding: 15px 20px; }
  .hero-section { padding: 40px 20px; }
  .hero-title { font-size: 2rem; }
  .section-title { font-size: 1.6rem; }
  .cta-section { padding: 50px 30px; border-radius: 20px; }
  .cta-title { font-size: 1.8rem; }
  .cta-buttons { flex-direction: column; }
  .cta-contact { flex-direction: column; gap: 15px; }
  .swot-grid { grid-template-columns: 1fr; }
}

@media print {
  .header { position: relative; }
  .page { min-height: auto; page-break-inside: avoid; }
  .package-card, .benefit-card, .stat-box { break-inside: avoid; }
}
</style>
</head>
<body>

<!-- Fixed Header -->
<header class="header">
  <img src="${this.LOGO}" alt="Adlify" class="header-logo" onerror="this.outerHTML='<div style=\\'font-size:1.5rem;font-weight:800;background:linear-gradient(135deg,#FF6B35,#E91E63);-webkit-background-clip:text;-webkit-text-fill-color:transparent;\\'>ADLIFY</div>'">
  <div class="header-right">
    <div class="header-client">
      <span style="color: #94a3b8; font-size: 0.85rem;">Pripravené pre</span>
      ${clientLogo ? `<img src="${clientLogo}" alt="${c.name || lead.company_name}" style="height: 32px; border-radius: 6px; margin-left: 8px;" onerror="this.outerHTML='<strong style=\\'color:#1a1a2e;font-size:1rem;margin-left:8px;\\'>${c.name || lead.company_name}</strong>'">` : ''}
      <strong style="color: #1a1a2e; font-size: 1rem; margin-left: 8px;">${c.name || lead.company_name}</strong>
    </div>
  </div>
</header>

<!-- Hero Section -->
<section class="hero-section">
  <div class="hero-badge">📊 Personalizovaná analýza & stratégia</div>
  <h1 class="hero-title">Návrh <span>marketingovej stratégie</span></h1>
  <p class="hero-subtitle">Komplexná analýza vašej online prítomnosti, identifikácia príležitostí a konkrétne odporúčania pre rast vášho podnikania prostredníctvom online reklamy</p>
  
  <div class="hero-company-box">
    <div class="hero-company-name">${c.name || lead.company_name}</div>
  </div>
  
  <p class="hero-info">V tejto prezentácii nájdete detailnú analýzu vášho podnikania, zhodnotenie aktuálnej online prítomnosti, identifikované príležitosti a konkrétny akčný plán ako získať viac zákazníkov cez online reklamu.</p>
</section>

<!-- Page 1: O firme -->
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">1</span> O vašej firme</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${c.description || 'Spoločnosť pôsobí na slovenskom trhu a ponúka svoje služby zákazníkom.'}</p>
    
    <div class="card">
      <h3 class="card-title">🛠 Vaše služby a produkty</h3>
      <div class="services-grid">
        ${(c.services || ['Služba 1', 'Služba 2', 'Služba 3']).map(s => `<span class="service-tag">${s}</span>`).join('')}
      </div>
    </div>
    
    <div class="card" style="margin-top: 30px;">
      <h3 class="card-title">👥 Vaši ideálni zákazníci</h3>
      <p style="color: #64748b; font-size: 1rem; line-height: 1.8;">${c.targetCustomers || 'Firmy a jednotlivci hľadajúci kvalitné služby'}</p>
    </div>
  </div>
</section>

<!-- Page 2: Čo sme zistili -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">2</span> Čo sme zistili</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${a.humanWrittenIntro || o.summary || 'Na základe našej analýzy sme identifikovali silné stránky aj príležitosti na zlepšenie.'}</p>
    
    ${a.strengths?.length ? `
    <h3 style="margin-bottom: 25px; font-size: 1.3rem; font-weight: 700; color: #1a1a2e;">✅ Vaše silné stránky</h3>
    <div class="grid-2" style="margin-bottom: 40px;">
      ${a.strengths.map(str => `
        <div class="card">
          <h4 style="color: #166534; font-weight: 700; font-size: 1.1rem; margin-bottom: 12px;">${str.title || str}</h4>
          ${str.description ? `<p style="color: #64748b; font-size: 0.95rem; line-height: 1.7;">${str.description}</p>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${a.opportunities?.length ? `
    <h3 style="margin-bottom: 25px; font-size: 1.3rem; font-weight: 700; color: #1a1a2e;">🚀 Príležitosti na zlepšenie</h3>
    <div class="grid-2">
      ${a.opportunities.map(opp => `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="color: #FF6B35; font-weight: 700; font-size: 1.1rem;">${opp.title || opp}</h4>
            ${opp.priority ? `<span class="tag ${opp.priority === 'vysoká' ? 'tag-warning' : 'tag-light'}" style="font-size: 0.75rem;">${opp.priority}</span>` : ''}
          </div>
          ${opp.description ? `<p style="color: #64748b; font-size: 0.95rem; line-height: 1.7;">${opp.description}</p>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>
</section>

<!-- Page 3: Online Presence -->
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">3</span> Vaša online prítomnosť</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${o.summary || 'Zhodnotenie vašej aktuálnej prítomnosti na webe a sociálnych sieťach.'}</p>
    
    <div class="grid-4" style="margin-bottom: 40px;">
      <div class="stat-box">
        <div class="stat-icon">${o.website?.exists !== false ? '✅' : '❌'}</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 5px;">Webstránka</div>
        <div class="stat-label">${o.website?.quality || (o.website?.exists !== false ? 'priemerná' : 'Chýba')}</div>
      </div>
      <div class="stat-box">
        <div class="stat-icon">${o.socialMedia?.facebook?.exists ? '✅' : '❌'}</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 5px;">Facebook</div>
        <div class="stat-label">${o.socialMedia?.facebook?.exists ? 'Aktívny' : 'Neaktívny'}</div>
      </div>
      <div class="stat-box">
        <div class="stat-icon">${o.socialMedia?.instagram?.exists ? '✅' : '❌'}</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 5px;">Instagram</div>
        <div class="stat-label">${o.socialMedia?.instagram?.exists ? 'Aktívny' : 'Neaktívny'}</div>
      </div>
      <div class="stat-box">
        <div class="stat-icon">${o.paidAds?.detected ? '✅' : '❌'}</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 5px;">Platená reklama</div>
        <div class="stat-label">${o.paidAds?.detected ? 'Využíva' : 'Nevyužíva'}</div>
      </div>
    </div>
    
    ${o.website?.strengths?.length || o.website?.weaknesses?.length ? `
    <div class="grid-2">
      ${o.website?.strengths?.length ? `
      <div class="card" style="border-left: 4px solid #22c55e;">
        <h4 style="color: #166534; margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">💪 Čo funguje dobre</h4>
        <ul style="list-style: none;">
          ${o.website.strengths.map(s => `<li style="padding: 10px 0; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0;"><span style="color: #22c55e; font-size: 1.2rem;">✓</span> ${s}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      ${o.website?.weaknesses?.length ? `
      <div class="card" style="border-left: 4px solid #f59e0b;">
        <h4 style="color: #92400e; margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">⚠️ Čo treba zlepšiť</h4>
        <ul style="list-style: none;">
          ${o.website.weaknesses.map(w => `<li style="padding: 10px 0; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0;"><span style="color: #f59e0b; font-size: 1.2rem;">!</span> ${w}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>
    ` : ''}
    
    <div class="note-box">
      <p>📌 Kompletnú analýzu webu vrátane technického SEO auditu pripravíme po objednaní služby</p>
    </div>
  </div>
</section>

<!-- Page 4: SWOT -->
${a.swot ? `
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">4</span> SWOT Analýza</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Strategická analýza silných a slabých stránok, príležitostí a hrozieb pre vaše podnikanie.</p>
    
    <div class="swot-grid">
      <div class="swot-box swot-strengths">
        <h4>💪 Silné stránky</h4>
        <ul>${a.swot.strengths?.map(s => `<li>${s}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-weaknesses">
        <h4>⚠️ Slabé stránky</h4>
        <ul>${a.swot.weaknesses?.map(w => `<li>${w}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-opportunities">
        <h4>🚀 Príležitosti</h4>
        <ul>${a.swot.opportunities?.map(o => `<li>${o}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-threats">
        <h4>⚡ Hrozby</h4>
        <ul>${a.swot.threats?.map(t => `<li>${t}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
    </div>
  </div>
</section>
` : ''}

<!-- Page 5: Keywords -->
${k.topKeywords?.length ? `
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">5</span> Kľúčové slová</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${k.summary || 'Identifikovali sme relevantné kľúčové slová pre vaše podnikanie. Tu je ukážka top 10:'}</p>
    
    <table class="data-table">
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
            <td><strong style="color: #1a1a2e;">${kw.keyword}</strong></td>
            <td style="text-align: center; font-weight: 600;">${typeof kw.searchVolume === 'number' ? kw.searchVolume.toLocaleString() : kw.searchVolume}</td>
            <td style="text-align: center;"><span class="tag ${kw.competition === 'nízka' ? 'tag-success' : kw.competition === 'vysoká' ? 'tag-warning' : 'tag-light'}">${kw.competition}</span></td>
            <td style="text-align: right; font-weight: 700; color: #FF6B35;">${kw.cpc}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="note-box">
      <p>📌 Máme pripravených ďalších <strong>${Math.max((k.totalFound || k.topKeywords?.length || 10) - 10, 30)}+</strong> kľúčových slov vrátane long-tail príležitostí. Kompletný zoznam dostanete po objednaní služby.</p>
    </div>
  </div>
</section>
` : ''}

<!-- Page 6: Strategy -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">6</span> Navrhovaná stratégia</h2>
    <div class="section-divider"></div>
    
    <div class="grid-2" style="margin-bottom: 35px;">
      <div class="card">
        <h4 class="card-title">📱 Odporúčané platformy</h4>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          ${(s.recommendedPlatforms || ['Google Ads', 'Facebook/Instagram']).map(p => `<span class="tag tag-gradient">${p}</span>`).join('')}
        </div>
      </div>
      <div class="card">
        <h4 class="card-title">🎯 Hlavný cieľ</h4>
        <p style="color: #64748b; font-size: 1.05rem; line-height: 1.7;">${s.primaryGoal || 'Generovanie kvalifikovaných dopytov a zvýšenie povedomia o značke'}</p>
      </div>
    </div>
    
    ${s.targetAudience ? `
    <div class="card">
      <h4 class="card-title">👥 Cieľová skupina</h4>
      <div class="grid-3">
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Demografia</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.demographics || 'Bude upresnené'}</p>
        </div>
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Záujmy</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.interests?.join(', ') || 'Bude upresnené'}</p>
        </div>
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Správanie</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.behaviors?.join(', ') || 'Bude upresnené'}</p>
        </div>
      </div>
    </div>
    ` : ''}
  </div>
</section>

<!-- Page 7: Ad Examples -->
${camp.google || camp.meta ? `
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">7</span> Návrhy reklám</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Ukážky reklám, ktoré pre vás pripravíme. Finálne verzie budú prispôsobené vašim potrebám.</p>
    
    <div class="grid-2">
      ${camp.google?.searchCampaign ? `
      <div>
        <h3 style="margin-bottom: 20px; font-size: 1.1rem; font-weight: 700; color: #1a1a2e;">🔍 Google Ads - Vyhľadávanie</h3>
        <div class="ad-preview google-ad">
          <div class="ad-preview-header">NÁHĽAD REKLAMY VO VYHĽADÁVANÍ</div>
          <div class="ad-preview-content">
            <div class="ad-label">Ad</div>
            <div class="ad-title">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.headlines?.[0] || 'Headline reklamy'}</div>
            <div class="ad-url">· www.${lead.domain || 'example.sk'}</div>
            <div class="ad-desc">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.descriptions?.[0] || 'Popis reklamy'}</div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 0.8rem; color: #94a3b8;"><strong>Keywords:</strong> ${camp.google.searchCampaign.adGroups?.[0]?.keywords?.slice(0, 3).join(', ') || 'kľúčové slová'}</p>
            </div>
          </div>
        </div>
      </div>
      ` : ''}
      
      ${camp.meta?.campaign ? `
      <div>
        <h3 style="margin-bottom: 20px; font-size: 1.1rem; font-weight: 700; color: #1a1a2e;">📘 Facebook / Instagram</h3>
        <div class="ad-preview meta-ad">
          <div class="ad-preview-header">NÁHĽAD REKLAMY</div>
          <div class="ad-preview-content">
            <div class="ad-text">${camp.meta.campaign.adSets?.[0]?.adCopy?.primaryText || 'Text reklamy'}</div>
            <div class="ad-headline">${camp.meta.campaign.adSets?.[0]?.adCopy?.headline || 'Headline'}</div>
            <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 15px;">${camp.meta.campaign.adSets?.[0]?.adCopy?.description || ''}</p>
            <span class="meta-ad .ad-cta">${camp.meta.campaign.adSets?.[0]?.adCopy?.cta || 'Zistiť viac'}</span>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
    
    <div class="note-box">
      <p>📌 Toto sú ukážkové reklamy. Finálne verzie vrátane profesionálnych vizuálov vytvoríme na mieru po objednaní.</p>
    </div>
  </div>
</section>
` : ''}

<!-- Page 8: Budget -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">8</span> Odporúčaný rozpočet na reklamu</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${b.analysis || 'Na základe analýzy kľúčových slov a konkurencie odhadujeme optimálny rozpočet pre vaše kampane.'}</p>
    
    <div class="grid-3">
      <div class="budget-card">
        <div class="budget-label">Štart</div>
        <div class="budget-value">${b.recommendations?.starter?.adSpend || 350}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.starter?.expectedClicks || 420}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.starter?.expectedLeads || '12-18'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.starter?.cpa || '19-29€'}</span></div>
        </div>
      </div>
      
      <div class="budget-card featured" style="position: relative;">
        <div class="budget-label">Optimum</div>
        <div class="budget-value">${b.recommendations?.recommended?.adSpend || 600}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.recommended?.expectedClicks || 720}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.recommended?.expectedLeads || '22-32'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.recommended?.cpa || '18-27€'}</span></div>
        </div>
      </div>
      
      <div class="budget-card">
        <div class="budget-label">Agresívny rast</div>
        <div class="budget-value">${b.recommendations?.aggressive?.adSpend || 1000}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.aggressive?.expectedClicks || 1200}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.aggressive?.expectedLeads || '36-54'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.aggressive?.cpa || '17-26€'}</span></div>
        </div>
      </div>
    </div>
    
    <div class="info-box">
      <p>💡 <strong>Dôležité:</strong> Reklamný rozpočet platíte priamo Google alebo Facebook. <strong>Nie je súčasťou ceny za správu kampaní.</strong> Máte nad ním plnú kontrolu a môžete ho kedykoľvek upraviť.</p>
    </div>
  </div>
</section>

<!-- Page 9: ROI -->
${r.projection ? `
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">9</span> Predpokladaná návratnosť (ROI)</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${r.explanation || 'Na základe odhadov návštevnosti, konverzného pomeru a priemernej hodnoty objednávky sme vypočítali potenciálnu návratnosť vašej investície.'}</p>
    
    <div class="grid-3" style="margin-bottom: 40px;">
      <div class="stat-box">
        <div class="stat-value">${r.projection.monthlyLeads}</div>
        <div class="stat-label">Mesačných dopytov</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${r.projection.monthlyRevenue}</div>
        <div class="stat-label">Potenciálny mesačný obrat</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${r.projection.roi}</div>
        <div class="stat-label">Návratnosť investície</div>
      </div>
    </div>
    
    <div class="card">
      <h4 class="card-title">📊 Predpoklady výpočtu</h4>
      <div class="grid-3">
        <div style="text-align: center; padding: 25px;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px; font-weight: 600;">Priemerná hodnota objednávky</p>
          <p style="font-size: 2rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.averageOrderValue || 'N/A'}€</p>
        </div>
        <div style="text-align: center; padding: 25px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px; font-weight: 600;">Konverzný pomer</p>
          <p style="font-size: 2rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.conversionRate || 'N/A'}</p>
        </div>
        <div style="text-align: center; padding: 25px;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px; font-weight: 600;">Hodnota zákazníka (LTV)</p>
          <p style="font-size: 2rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.customerLifetimeValue || 'N/A'}€</p>
        </div>
      </div>
    </div>
  </div>
</section>
` : ''}

<!-- Page 10: Timeline -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">10</span> Časový plán</h2>
    <div class="section-divider"></div>
    
    <div class="timeline">
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 1</div>
          <div class="timeline-desc">${timeline.week1 || 'Nastavenie Google Ads a LinkedIn kampaní, tracking, SEO audit a optimalizácia'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 2</div>
          <div class="timeline-desc">${timeline.week2 || 'Spustenie search kampaní, prvé A/B testy ad copy'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 3-4</div>
          <div class="timeline-desc">${timeline.week3_4 || 'Optimalizácia na základe dát, rozšírenie keyword listu'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Mesiac 2</div>
          <div class="timeline-desc">${timeline.month2 || 'LinkedIn kampane, remarketing, landing page optimalizácia'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Mesiac 3+</div>
          <div class="timeline-desc">${timeline.month3 || 'Škálovanie výkonných kampaní, mesačný report, strategické odporúčania'}</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Page 11: Benefits -->
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">11</span> Čo vám spolupráca prinesie</h2>
    <div class="section-divider"></div>
    
    <div class="grid-2">
      <div class="benefit-card">
        <div class="benefit-icon">🎯</div>
        <div class="benefit-title">Zákazníci s urgentnou potrebou</div>
        <div class="benefit-desc">Oslovíte ľudí, ktorí PRÁVE TERAZ aktívne hľadajú vaše služby alebo produkty. Žiadne čakanie - okamžité výsledky.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">📊</div>
        <div class="benefit-title">100% merateľné výsledky</div>
        <div class="benefit-desc">Presne viete, koľko ľudí videlo reklamu, kliklo, zavolalo alebo vyplnilo formulár. Každé euro je merateľné.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">🏆</div>
        <div class="benefit-title">Konkurenčná výhoda</div>
        <div class="benefit-desc">Zatiaľ čo vaša konkurencia čaká na zákazníkov, vy ich aktívne oslovujete presne v momente, keď hľadajú riešenie.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">📈</div>
        <div class="benefit-title">Flexibilita a kontrola</div>
        <div class="benefit-desc">Rozpočet môžete kedykoľvek navýšiť pred sezónou alebo znížiť. Máte plnú kontrolu nad svojimi investíciami.</div>
      </div>
    </div>
  </div>
</section>

<!-- Page 12: Packages -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">12</span> Naše balíčky</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Na základe analýzy vám odporúčame balíček <strong style="color: #FF6B35;">${analysis.recommendedPackage || 'Pro'}</strong> pre optimálny pomer ceny a výkonu.</p>
    
    <div class="grid-4">
      <div class="package-card ${recPkg === 'starter' ? 'featured' : ''}">
        <div class="package-icon">${this.packages.starter.icon}</div>
        <div class="package-name">Starter</div>
        <div class="package-price">149€</div>
        <div class="package-period">/mesiac</div>
        <div class="package-desc">${this.packages.starter.description}</div>
        <ul class="package-features">
          ${this.packages.starter.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="mailto:${this.CONTACT.email}?subject=Záujem o Starter balíček - ${c.name || lead.company_name}" class="package-btn ${recPkg === 'starter' ? 'package-btn-gradient' : 'package-btn-outline'}">Vybrať Starter</a>
      </div>
      
      <div class="package-card ${recPkg === 'pro' ? 'featured' : ''}">
        <div class="package-icon">${this.packages.pro.icon}</div>
        <div class="package-name">Pro</div>
        <div class="package-price">249€</div>
        <div class="package-period">/mesiac</div>
        <div class="package-desc">${this.packages.pro.description}</div>
        <ul class="package-features">
          ${this.packages.pro.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="mailto:${this.CONTACT.email}?subject=Záujem o Pro balíček - ${c.name || lead.company_name}" class="package-btn ${recPkg === 'pro' ? 'package-btn-gradient' : 'package-btn-outline'}">Vybrať Pro</a>
      </div>
      
      <div class="package-card ${recPkg === 'enterprise' ? 'featured' : ''}">
        <div class="package-icon">${this.packages.enterprise.icon}</div>
        <div class="package-name">Enterprise</div>
        <div class="package-price">399€</div>
        <div class="package-period">/mesiac</div>
        <div class="package-desc">${this.packages.enterprise.description}</div>
        <ul class="package-features">
          ${this.packages.enterprise.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="mailto:${this.CONTACT.email}?subject=Záujem o Enterprise balíček - ${c.name || lead.company_name}" class="package-btn ${recPkg === 'enterprise' ? 'package-btn-gradient' : 'package-btn-outline'}">Vybrať Enterprise</a>
      </div>
      
      <div class="package-card ${recPkg === 'premium' ? 'featured' : ''}">
        <div class="package-icon">${this.packages.premium.icon}</div>
        <div class="package-name" style="color: #FF6B35;">Premium</div>
        <div class="package-price">od 799€</div>
        <div class="package-period">/mesiac</div>
        <div class="package-desc">${this.packages.premium.description}</div>
        <ul class="package-features">
          ${this.packages.premium.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="mailto:${this.CONTACT.email}?subject=Záujem o Premium balíček - ${c.name || lead.company_name}" class="package-btn ${recPkg === 'premium' ? 'package-btn-gradient' : 'package-btn-outline'}">Kontaktujte nás</a>
      </div>
    </div>
  </div>
</section>

<!-- Page 13: CTA -->
<section class="page page-white">
  <div class="page-content">
    <div class="cta-section">
      <h2 class="cta-title">Začnime spoluprácu 🚀</h2>
      <p class="cta-subtitle">Dohodnite si nezáväznú konzultáciu a preberieme, ako vám vieme pomôcť získať viac zákazníkov cez online reklamu.</p>
      
      <div class="cta-buttons">
        <a href="mailto:${this.CONTACT.email}?subject=Mám záujem o spoluprácu - ${c.name || lead.company_name}" class="cta-btn cta-btn-white">✓ Mám záujem</a>
        <a href="mailto:${this.CONTACT.email}?subject=Otázky k ponuke - ${c.name || lead.company_name}" class="cta-btn cta-btn-outline">Mám otázky</a>
      </div>
      
      <div class="cta-contact">
        <p>📧 <a href="mailto:${this.CONTACT.email}">${this.CONTACT.email}</a></p>
        <p>📞 <a href="tel:${this.CONTACT.phone.replace(/\s/g, '')}">${this.CONTACT.phone}</a></p>
        <p>🌐 <a href="https://${this.CONTACT.web}" target="_blank">${this.CONTACT.web}</a></p>
      </div>
    </div>
    
    ${analysis.customNote ? `
    <div class="card card-highlight" style="margin-top: 50px;">
      <h4 style="margin-bottom: 15px; font-weight: 700; font-size: 1.1rem; color: #1a1a2e;">💬 Osobná poznámka od nás</h4>
      <p style="color: #64748b; font-style: italic; font-size: 1.05rem; line-height: 1.8;">${analysis.customNote}</p>
    </div>
    ` : ''}
  </div>
</section>

<!-- Footer -->
<footer class="footer">
  <img src="${this.LOGO}" alt="Adlify" class="footer-logo" onerror="this.outerHTML='<div style=\\'font-size:1.5rem;font-weight:800;color:#94a3b8;margin-bottom:20px;\\'>ADLIFY</div>'">
  <p style="margin-bottom: 10px; color: #64748b;">© ${new Date().getFullYear()} Adlify.eu | Vytvorené s ❤️ pre <strong style="color: #1a1a2e;">${c.name || lead.company_name}</strong></p>
  <p style="font-size: 0.85rem; color: #94a3b8;">Táto prezentácia je dôverná a je určená výhradne pre ${c.name || lead.company_name}</p>
</footer>

</body>
</html>`;
  },

  // Excel file handlers
  handleFileDrop(event) {
    event.preventDefault();
    event.target.classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) this.processExcelFile(file);
  },

  handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) this.processExcelFile(file);
  },

  async processExcelFile(file) {
    Utils.toast('Načítavam súbor...', 'info');
    
    try {
      // Load SheetJS library if not loaded
      if (!window.XLSX) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      }
      
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (rows.length < 2) {
        Utils.toast('Súbor je prázdny', 'warning');
        return;
      }
      
      // Detect columns
      const headers = rows[0].map(h => (h || '').toString().toLowerCase().trim());
      const getIdx = (names) => headers.findIndex(h => names.some(n => h.includes(n)));
      
      const inputIdx = getIdx(['input', 'domain', 'url']);
      const emailIdx = getIdx(['email', 'mail', 'contact email']);
      const contactPageIdx = getIdx(['contact page', 'kontakt']);
      const fbIdx = getIdx(['facebook']);
      const igIdx = getIdx(['instagram']);
      const liIdx = getIdx(['linkedin']);
      const twIdx = getIdx(['twitter', 'x.com']);
      const ytIdx = getIdx(['youtube']);
      const tiktokIdx = getIdx(['tiktok']);
      const ipIdx = getIdx(['ip address', 'ip']);
      const mxIdx = getIdx(['mx']);
      const txtIdx = getIdx(['txt']);
      const categorizationIdx = getIdx(['categorization', 'kategória', 'category', 'typ']);
      const domainAvailIdx = getIdx(['domain availability', 'dostupnosť']);
      
      let leads = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[inputIdx]) continue;
        
        const domain = this.cleanDomain(row[inputIdx]);
        if (!domain) continue;
        
        // Parse emails with confidence (format: "email@test.com (90%); email2@test.com (80%)")
        let primaryEmail = null;
        let allEmails = [];
        if (emailIdx >= 0 && row[emailIdx]) {
          const emailStr = row[emailIdx].toString();
          // Match email and optional confidence
          const emailMatches = emailStr.matchAll(/([^\s;(]+@[^\s;(]+)\s*(?:\((\d+)%?\))?/g);
          for (const match of emailMatches) {
            const email = match[1].trim();
            const confidence = match[2] ? parseInt(match[2]) : 50;
            if (email.includes('@') && email.includes('.')) {
              allEmails.push({ email, confidence });
            }
          }
          // Zoradiť podľa confidence a vybrať najlepší
          allEmails.sort((a, b) => b.confidence - a.confidence);
          primaryEmail = allEmails[0]?.email || null;
        }
        
        // Parse categorization (format: "Blog; Company" or "E-shop")
        let categories = [];
        let businessType = 'unknown';
        if (categorizationIdx >= 0 && row[categorizationIdx]) {
          const catStr = row[categorizationIdx].toString();
          categories = catStr.split(/[;,]/).map(c => c.trim().toLowerCase()).filter(Boolean);
          
          // Determine business type
          if (categories.some(c => c.includes('shop') || c.includes('e-commerce') || c.includes('eshop'))) {
            businessType = 'eshop';
          } else if (categories.some(c => c.includes('company') || c.includes('firma') || c.includes('business'))) {
            businessType = 'company';
          } else if (categories.some(c => c.includes('blog'))) {
            businessType = 'blog';
          } else if (categories.some(c => c.includes('microsite') || c.includes('landing'))) {
            businessType = 'microsite';
          } else if (categories.some(c => c.includes('service') || c.includes('služb'))) {
            businessType = 'service';
          }
        }
        
        // Collect all Marketing Miner data
        const marketingData = {
          contactPage: contactPageIdx >= 0 ? row[contactPageIdx] : null,
          emails: allEmails, // Všetky emaily s confidence
          primaryEmailConfidence: allEmails[0]?.confidence || 0,
          socialMedia: {
            facebook: fbIdx >= 0 && row[fbIdx] ? this.cleanSocialUrl(row[fbIdx]) : null,
            instagram: igIdx >= 0 && row[igIdx] ? this.cleanSocialUrl(row[igIdx]) : null,
            linkedin: liIdx >= 0 && row[liIdx] ? this.cleanSocialUrl(row[liIdx]) : null,
            twitter: twIdx >= 0 && row[twIdx] ? this.cleanSocialUrl(row[twIdx]) : null,
            youtube: ytIdx >= 0 && row[ytIdx] ? this.cleanSocialUrl(row[ytIdx]) : null,
            tiktok: tiktokIdx >= 0 && row[tiktokIdx] ? this.cleanSocialUrl(row[tiktokIdx]) : null
          },
          technical: {
            ip: ipIdx >= 0 ? row[ipIdx] : null,
            mx: mxIdx >= 0 ? row[mxIdx] : null,
            txt: txtIdx >= 0 ? row[txtIdx] : null
          },
          categorization: {
            categories: categories,
            businessType: businessType,
            raw: categorizationIdx >= 0 ? row[categorizationIdx] : null
          },
          domainAvailable: domainAvailIdx >= 0 ? row[domainAvailIdx] === 'available' : false,
          importedAt: new Date().toISOString(),
          source: 'marketing_miner'
        };
        
        // Clean nulls from social media
        Object.keys(marketingData.socialMedia).forEach(k => {
          if (!marketingData.socialMedia[k]) delete marketingData.socialMedia[k];
        });
        
        // Calculate advanced score
        const score = this.calculateImportScore(primaryEmail, allEmails, marketingData);
        
        leads.push({
          domain,
          company_name: this.formatCompanyName(domain),
          email: primaryEmail,
          industry: this.mapBusinessTypeToIndustry(businessType, categories),
          status: 'new',
          score: score,
          marketing_data: marketingData
        });
      }
      
      // Import leads
      let added = 0, skipped = 0, updated = 0;
      for (const lead of leads) {
        try {
          const existing = await Database.select('leads', { filters: { domain: lead.domain }, limit: 1 });
          if (existing?.length > 0) {
            // Update existing with new marketing data
            const ex = existing[0];
            const shouldUpdate = !ex.marketing_data || 
                                 (lead.score > (ex.score || 0)) || 
                                 (lead.email && !ex.email);
            
            if (shouldUpdate) {
              await Database.update('leads', ex.id, { 
                marketing_data: lead.marketing_data,
                email: lead.email || ex.email,
                industry: lead.industry || ex.industry,
                score: Math.max(lead.score, ex.score || 0)
              });
              updated++;
            } else {
              skipped++;
            }
            continue;
          }
          await Database.insert('leads', lead);
          added++;
        } catch (e) { console.error('Import error:', e); }
      }
      
      Utils.toast(`✅ Pridané: ${added}, 🔄 Aktualizované: ${updated}, ⏭️ Preskočené: ${skipped}`, 'success');
      await this.loadLeads();
      this.showTab('list');
      
    } catch (error) {
      console.error('Excel parse error:', error);
      Utils.toast('Chyba pri čítaní súboru', 'error');
    }
  },
  
  // Vyčistiť URL sociálnej siete (prvá ak je viacero)
  cleanSocialUrl(value) {
    if (!value) return null;
    const str = value.toString().trim();
    // Ak je viacero (oddelené ;), vezmi prvú
    const first = str.split(';')[0].trim();
    // Odstráň trailing slashes
    return first.replace(/\/+$/, '') || null;
  },
  
  // Vypočítať skóre pri importe
  calculateImportScore(primaryEmail, allEmails, marketingData) {
    let score = 30; // Základ
    
    // Email scoring
    if (primaryEmail) {
      score += 15;
      const confidence = allEmails[0]?.confidence || 0;
      if (confidence >= 90) score += 10;
      else if (confidence >= 70) score += 5;
      
      // Bonus za viacero emailov
      if (allEmails.length > 1) score += 5;
    }
    
    // Social media scoring
    const socials = marketingData.socialMedia || {};
    const socialCount = Object.keys(socials).length;
    score += socialCount * 5; // 5 bodov za každú sieť
    
    // Bonus za špecifické siete
    if (socials.facebook) score += 3;
    if (socials.instagram) score += 3;
    if (socials.linkedin) score += 5; // LinkedIn je cennejší pre B2B
    
    // Business type scoring
    const bizType = marketingData.categorization?.businessType;
    if (bizType === 'company') score += 10;
    else if (bizType === 'eshop') score += 8;
    else if (bizType === 'service') score += 8;
    else if (bizType === 'blog') score += 2;
    
    // Contact page bonus
    if (marketingData.contactPage) score += 3;
    
    // Cap at 100
    return Math.min(Math.round(score), 100);
  },
  
  // Mapovať business type na industry
  mapBusinessTypeToIndustry(businessType, categories) {
    // Skúsiť nájsť industry z categories
    const catStr = categories.join(' ').toLowerCase();
    
    if (catStr.includes('shop') || catStr.includes('e-commerce')) return 'E-commerce';
    if (catStr.includes('restaurant') || catStr.includes('gastro') || catStr.includes('food')) return 'Gastronómia';
    if (catStr.includes('beauty') || catStr.includes('salon') || catStr.includes('kozmet')) return 'Krása & Wellness';
    if (catStr.includes('auto') || catStr.includes('car') || catStr.includes('servis')) return 'Autoservisy';
    if (catStr.includes('health') || catStr.includes('medic') || catStr.includes('zdrav')) return 'Zdravotníctvo';
    if (catStr.includes('real estate') || catStr.includes('reality')) return 'Reality';
    if (catStr.includes('education') || catStr.includes('škol') || catStr.includes('kurz')) return 'Vzdelávanie';
    if (catStr.includes('tech') || catStr.includes('it') || catStr.includes('software')) return 'IT & Technológie';
    if (catStr.includes('travel') || catStr.includes('tourism') || catStr.includes('hotel')) return 'Cestovný ruch';
    if (catStr.includes('fitness') || catStr.includes('gym') || catStr.includes('sport')) return 'Fitness & Šport';
    
    // Fallback podľa business type
    const typeMap = {
      'eshop': 'E-commerce',
      'company': 'B2B Služby',
      'service': 'Služby',
      'blog': 'Blog/Médiá',
      'microsite': 'Microsite'
    };
    
    return typeMap[businessType] || null;
  },

  formatCompanyName(domain) {
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  },

  cleanDomain(value) {
    if (!value) return null;
    return value.toString().trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase();
  },

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },
  
  // ===========================================
  // MARKETING MINER API HELPERS
  // ===========================================
  
  /**
   * Získať keywords suggestions z MM API
   * @param {string} keyword - Základné kľúčové slovo
   * @param {string} lang - Jazyk (sk, cs, pl, gb, us)
   * @returns {Promise<Array>} - Pole keywords s search volume, CPC, difficulty
   */
  async getKeywordsSuggestions(keyword, lang = 'sk') {
    try {
      console.log('🔄 getKeywordsSuggestions - volám s keyword:', keyword);
      const response = await fetch('/.netlify/functions/marketing-miner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'keywords_suggestions',
          params: { keyword, lang }
        })
      });
      
      console.log('🔄 MM API response status:', response.status);
      const result = await response.json();
      console.log('🔄 MM API result:', result);
      
      if (!result.success) {
        console.warn('MM API error:', result.error);
        return null;
      }
      
      console.log('✅ MM API returned', result.data?.length || 0, 'keywords');
      return result.data;
    } catch (error) {
      console.error('MM API call failed:', error);
      return null;
    }
  },
  
  /**
   * Získať search volume pre konkrétne keywords
   * @param {Array<string>} keywords - Pole keywords
   * @param {string} lang - Jazyk
   * @returns {Promise<Array>}
   */
  async getSearchVolume(keywords, lang = 'sk') {
    try {
      const response = await fetch('/.netlify/functions/marketing-miner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'search_volume',
          params: { keywords, lang }
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.warn('MM API error:', result.error);
        return null;
      }
      
      return result.data;
    } catch (error) {
      console.error('MM API call failed:', error);
      return null;
    }
  },
  
  /**
   * Získať štatistiky domény
   * @param {string} domain - Doména
   * @param {string} lang - Jazyk
   * @returns {Promise<Object>}
   */
  async getDomainStats(domain, lang = 'sk') {
    try {
      const response = await fetch('/.netlify/functions/marketing-miner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'domain_stats',
          params: { domain, lang }
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.warn('MM API error:', result.error);
        return null;
      }
      
      return result.data;
    } catch (error) {
      console.error('MM API call failed:', error);
      return null;
    }
  },
  
  /**
   * Vypočítať reálny rozpočet na základe MM dát
   * @param {Array} keywords - Keywords z MM API
   * @param {number} targetClicks - Cieľový počet klikov/mesiac
   * @returns {Object} - { minBudget, recommendedBudget, maxBudget, estimatedClicks }
   */
  calculateRealBudget(keywords, targetClicks = 500) {
    if (!keywords || keywords.length === 0) {
      return {
        minBudget: 300,
        recommendedBudget: 500,
        maxBudget: 1000,
        estimatedClicks: targetClicks,
        basedOnRealData: false
      };
    }
    
    // Priemer CPC z top keywords (vážený podľa search volume)
    let totalWeight = 0;
    let weightedCpc = 0;
    let totalSearchVolume = 0;
    
    keywords.slice(0, 20).forEach(kw => {
      const volume = kw.searchVolume || 0;
      const cpc = kw.cpc || 0.5;
      totalSearchVolume += volume;
      weightedCpc += cpc * volume;
      totalWeight += volume;
    });
    
    const avgCpc = totalWeight > 0 ? weightedCpc / totalWeight : 0.5;
    
    // Výpočet rozpočtu
    // Predpoklad: 2-5% CTR, teda potrebujeme 20-50x viac impresií ako klikov
    const minClicks = Math.round(targetClicks * 0.5);
    const maxClicks = Math.round(targetClicks * 2);
    
    return {
      minBudget: Math.round(minClicks * avgCpc),
      recommendedBudget: Math.round(targetClicks * avgCpc),
      maxBudget: Math.round(maxClicks * avgCpc),
      estimatedClicks: targetClicks,
      avgCpc: Math.round(avgCpc * 100) / 100,
      totalSearchVolume,
      basedOnRealData: true
    };
  },

  // ===========================================
  // ENRICHMENT & ANALYSIS HELPERS
  // ===========================================

  /**
   * Extrahuje seed keyword z názvu firmy pre MM API
   */
  extractSeedKeyword(lead) {
    const companyName = lead.company_name || '';
    const domain = lead.domain || '';
    const industry = lead.industry || '';
    const marketingData = lead.marketing_data || {};
    
    // 1. Ak máme categorization z importu, použiť to
    if (marketingData.categorization) {
      const cat = marketingData.categorization;
      // Skúsiť extrahovať hlavnú kategóriu
      const catKeyword = this.extractCategoryKeyword(cat);
      if (catKeyword) {
        console.log('🎯 Seed keyword z categorization:', catKeyword);
        return catKeyword;
      }
    }
    
    // 2. Ak máme industry, mapovať na relevantné keywords
    if (industry && industry !== 'unknown' && industry.length > 3) {
      const industryKeyword = this.mapIndustryToKeyword(industry);
      if (industryKeyword) {
        console.log('🎯 Seed keyword z industry:', industryKeyword);
        return industryKeyword;
      }
    }
    
    // 3. Skúsiť rozpoznať biznis typ z názvu firmy
    const businessKeyword = this.detectBusinessFromName(companyName, domain);
    if (businessKeyword) {
      console.log('🎯 Seed keyword z názvu firmy:', businessKeyword);
      return businessKeyword;
    }
    
    // 4. Fallback - vrátiť null a nechať AI vygenerovať keywords
    console.warn('⚠️ Nepodarilo sa extrahovať seed keyword, použijú sa AI odhady');
    return null;
  },

  /**
   * Extrahuje keyword z MM categorization stringu
   */
  extractCategoryKeyword(categorization) {
    if (!categorization) return null;
    
    const catLower = categorization.toLowerCase();
    
    // Mapovania pre bežné kategórie
    const categoryMap = {
      'florist': 'kvetinárstvo',
      'plant': 'rastliny',
      'flower': 'kvety',
      'garden': 'záhradníctvo',
      'interior': 'interiérová zeleň',
      'green': 'zeleň',
      'landscape': 'záhradná architektúra',
      'nursery': 'pestovanie rastlín',
      'restaurant': 'reštaurácia',
      'cafe': 'kaviareň',
      'hotel': 'hotel',
      'fitness': 'fitness',
      'beauty': 'kozmetika',
      'auto': 'autoservis',
      'repair': 'opravy',
      'shop': 'obchod',
      'store': 'predajňa',
      'service': 'služby',
      'consulting': 'poradenstvo',
      'legal': 'právne služby',
      'medical': 'zdravotníctvo',
      'dental': 'zubná ambulancia',
      'construction': 'stavebníctvo',
      'electric': 'elektrikár',
      'plumb': 'inštalatér',
      'clean': 'upratovanie',
      'transport': 'doprava',
      'real estate': 'reality',
      'insurance': 'poistenie',
      'accounting': 'účtovníctvo'
    };
    
    for (const [key, value] of Object.entries(categoryMap)) {
      if (catLower.includes(key)) {
        return value;
      }
    }
    
    return null;
  },

  /**
   * Mapuje industry na relevantné search keywords
   */
  mapIndustryToKeyword(industry) {
    const industryLower = industry.toLowerCase();
    
    const industryKeywords = {
      'e-commerce': 'eshop',
      'gastronómia': 'reštaurácia',
      'krása': 'kozmetika',
      'wellness': 'wellness',
      'autoservisy': 'autoservis',
      'zdravotníctvo': 'lekár',
      'reality': 'reality',
      'vzdelávanie': 'kurzy',
      'it': 'softvér',
      'technológie': 'IT služby',
      'cestovný ruch': 'dovolenka',
      'fitness': 'fitness',
      'šport': 'šport',
      'stavebníctvo': 'stavebná firma',
      'právne služby': 'advokát',
      'účtovníctvo': 'účtovník',
      'marketing': 'marketing',
      'reklama': 'reklama'
    };
    
    for (const [key, value] of Object.entries(industryKeywords)) {
      if (industryLower.includes(key)) {
        return value;
      }
    }
    
    // Ak je industry dostatočne špecifické, použiť priamo
    if (industryLower.length > 5 && industryLower.length < 30) {
      return industryLower;
    }
    
    return null;
  },

  /**
   * Detekuje biznis typ z názvu firmy alebo domény
   */
  detectBusinessFromName(companyName, domain) {
    const combined = (companyName + ' ' + domain).toLowerCase();
    
    // Kľúčové slová indikujúce typ biznisu
    const businessIndicators = {
      'flora': 'interiérová zeleň',
      'plant': 'rastliny',
      'green': 'zeleň',
      'kvet': 'kvetinárstvo',
      'záhrad': 'záhradníctvo',
      'gastro': 'reštaurácia',
      'food': 'jedlo',
      'resto': 'reštaurácia',
      'cafe': 'kaviareň',
      'hotel': 'hotel',
      'auto': 'autoservis',
      'car': 'autoservis',
      'beauty': 'kozmetika',
      'salon': 'salón',
      'kozmet': 'kozmetika',
      'fit': 'fitness',
      'gym': 'fitness',
      'sport': 'športové potreby',
      'tech': 'IT služby',
      'soft': 'softvér',
      'dev': 'vývoj softvéru',
      'build': 'stavebníctvo',
      'stav': 'stavebníctvo',
      'elektr': 'elektrikár',
      'instal': 'inštalatér',
      'clean': 'upratovanie',
      'uprat': 'upratovacie služby',
      'reality': 'reality',
      'legal': 'právne služby',
      'práv': 'advokát',
      'účt': 'účtovníctvo',
      'dent': 'zubná ambulancia',
      'medic': 'zdravotníctvo',
      'zdrav': 'zdravotníctvo',
      'škol': 'vzdelávanie',
      'edu': 'vzdelávanie',
      'travel': 'cestovná kancelária',
      'tour': 'turistika',
      'transport': 'doprava',
      'dopr': 'doprava',
      'market': 'marketing',
      'reklam': 'reklama'
    };
    
    for (const [indicator, keyword] of Object.entries(businessIndicators)) {
      if (combined.includes(indicator)) {
        return keyword;
      }
    }
    
    return null;
  },

  /**
   * Vypočíta priemerné CPC z keywords
   */
  calculateAvgCpcFromKeywords(keywords) {
    if (!keywords || keywords.length === 0) return 0;
    
    let totalWeight = 0;
    let weightedCpc = 0;
    
    keywords.forEach(kw => {
      const volume = kw.searchVolume || 0;
      const cpc = kw.cpc || 0;
      if (volume > 0 && cpc > 0) {
        weightedCpc += cpc * volume;
        totalWeight += volume;
      }
    });
    
    return totalWeight > 0 ? Math.round((weightedCpc / totalWeight) * 100) / 100 : 0.5;
  },

  /**
   * Analyzuje webstránku - základná technická analýza
   */
  async analyzeWebsiteTechnical(domain) {
    try {
      const url = `https://${domain}`;
      const startTime = Date.now();
      
      // Jednoduchý fetch pre základné info
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(10000)
      });
      
      const loadTime = Date.now() - startTime;
      
      if (!response.ok) {
        return { available: false, error: 'Web nedostupný' };
      }
      
      const data = await response.json();
      const html = data.contents || '';
      
      // Extrahovať základné info z HTML
      const issues = [];
      
      // Check meta description
      if (!html.includes('meta name="description"') && !html.includes("meta name='description'")) {
        issues.push('Chýba meta description');
      }
      
      // Check title
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      if (!titleMatch || titleMatch[1].length < 10) {
        issues.push('Slabý alebo chýbajúci title tag');
      }
      
      // Check H1
      if (!html.includes('<h1')) {
        issues.push('Chýba H1 nadpis');
      }
      
      // Check images without alt
      const imgCount = (html.match(/<img/gi) || []).length;
      const imgAltCount = (html.match(/<img[^>]*alt=/gi) || []).length;
      if (imgCount > 0 && imgAltCount < imgCount * 0.5) {
        issues.push(`${imgCount - imgAltCount} obrázkov bez alt textu`);
      }
      
      return {
        available: true,
        loadTime: loadTime,
        hasSSL: url.startsWith('https'),
        hasTitle: !!titleMatch,
        hasMetaDesc: html.includes('meta name="description"'),
        hasH1: html.includes('<h1'),
        issues: issues,
        pageSize: Math.round(html.length / 1024) + ' KB'
      };
      
    } catch (error) {
      console.warn('Web analysis failed:', error);
      return { available: false, error: error.message };
    }
  },

  /**
   * Obohatí AI analýzu o reálne dáta z MM a web analýzy
   */
  enrichAnalysisWithRealData(analysis, realKeywords, domainStats, webAnalysis) {
    const enriched = { ...analysis };
    
    // 1. KEYWORDS - nahradiť vymyslené za reálne
    if (realKeywords && realKeywords.length > 0) {
      enriched.keywords = enriched.keywords || {};
      enriched.keywords.topKeywords = realKeywords.slice(0, 15).map(kw => ({
        keyword: kw.keyword,
        searchVolume: kw.searchVolume || 0,
        competition: this.mapDifficultyToCompetition(kw.difficulty),
        cpc: (kw.cpc || 0).toFixed(2) + '€',
        cpcNumeric: kw.cpc || 0,
        trend: kw.trend || null,
        source: 'marketing_miner'
      }));
      enriched.keywords.source = 'marketing_miner';
      enriched.keywords.summary = `Na základe reálnych dát z Marketing Miner sme identifikovali ${realKeywords.length} relevantných kľúčových slov pre váš biznis.`;
    }
    
    // 2. BUDGET - vypočítať z reálneho CPC
    if (realKeywords && realKeywords.length > 0) {
      const avgCpc = this.calculateAvgCpcFromKeywords(realKeywords);
      const totalVolume = realKeywords.reduce((sum, k) => sum + (k.searchVolume || 0), 0);
      
      enriched.budget = enriched.budget || {};
      enriched.budget.calculatedFromRealData = true;
      enriched.budget.avgCpc = avgCpc;
      enriched.budget.totalSearchVolume = totalVolume;
      
      // Dynamické rozpočty na základe reálneho CPC
      // Cieľ: Starter = 400 klikov, Optimum = 700 klikov, Aggressive = 1200 klikov
      enriched.budget.recommendations = {
        starter: {
          adSpend: Math.max(200, Math.round(400 * avgCpc / 10) * 10), // Min 200€
          clicks: 400,
          leads: '12-20',
          costPerLead: Math.round(400 * avgCpc / 15) + '-' + Math.round(400 * avgCpc / 12) + '€'
        },
        recommended: {
          adSpend: Math.max(350, Math.round(700 * avgCpc / 10) * 10), // Min 350€
          clicks: 700,
          leads: '22-35',
          costPerLead: Math.round(700 * avgCpc / 28) + '-' + Math.round(700 * avgCpc / 22) + '€'
        },
        aggressive: {
          adSpend: Math.max(600, Math.round(1200 * avgCpc / 10) * 10), // Min 600€
          clicks: 1200,
          leads: '36-55',
          costPerLead: Math.round(1200 * avgCpc / 45) + '-' + Math.round(1200 * avgCpc / 36) + '€'
        }
      };
      
      enriched.budget.explanation = `Rozpočty sú vypočítané na základe reálneho priemerného CPC ${avgCpc.toFixed(2)}€ pre vaše kľúčové slová.`;
    }
    
    // 3. DOMAIN STATS - pridať ak dostupné
    if (domainStats && domainStats.visibility) {
      enriched.domainStats = {
        visibility: domainStats.visibility,
        estimatedTraffic: domainStats.estimatedTraffic,
        organicKeywords: domainStats.keywords,
        topKeywords: domainStats.topKeywords?.slice(0, 5) || [],
        source: 'marketing_miner'
      };
    }
    
    // 4. WEB ANALYSIS - pridať technické info
    if (webAnalysis && webAnalysis.available) {
      enriched.onlinePresence = enriched.onlinePresence || {};
      enriched.onlinePresence.website = enriched.onlinePresence.website || {};
      enriched.onlinePresence.website.technical = {
        loadTime: webAnalysis.loadTime,
        loadTimeFormatted: webAnalysis.loadTime + 'ms',
        hasSSL: webAnalysis.hasSSL,
        issues: webAnalysis.issues || [],
        pageSize: webAnalysis.pageSize
      };
      
      // Pridať issues do weaknesses ak existujú
      if (webAnalysis.issues && webAnalysis.issues.length > 0) {
        enriched.onlinePresence.website.weaknesses = [
          ...(enriched.onlinePresence.website.weaknesses || []),
          ...webAnalysis.issues
        ];
      }
    }
    
    // 5. Označiť že analýza obsahuje reálne dáta
    enriched._meta = {
      hasRealKeywords: realKeywords && realKeywords.length > 0,
      hasRealDomainStats: domainStats && domainStats.visibility > 0,
      hasWebAnalysis: webAnalysis && webAnalysis.available,
      analyzedAt: new Date().toISOString(),
      version: '2.3-enriched'
    };
    
    return enriched;
  },

  /**
   * Mapuje difficulty (0-100) na konkurenciu text
   */
  mapDifficultyToCompetition(difficulty) {
    if (!difficulty && difficulty !== 0) return 'stredná';
    if (difficulty < 30) return 'nízka';
    if (difficulty < 60) return 'stredná';
    return 'vysoká';
  },

  async handleImport() {
    const textarea = document.getElementById('import-domains');
    const text = textarea?.value?.trim();
    if (!text) return Utils.toast('Zadaj domény alebo nahraj súbor', 'warning');
    
    const domains = text.split('\n')
      .map(d => this.cleanDomain(d))
      .filter(d => d && d.includes('.'));
    
    if (domains.length === 0) {
      Utils.toast('Žiadne platné domény', 'warning');
      return;
    }
    
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
  },

  async handleAdd() {
    const name = document.getElementById('add-name').value.trim();
    if (!name) return Utils.toast('Zadaj názov firmy', 'warning');
    const domain = document.getElementById('add-domain').value.trim();
    const email = document.getElementById('add-email').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    const industry = document.getElementById('add-industry').value.trim();
    const city = document.getElementById('add-city').value.trim();
    await Database.insert('leads', { 
      domain: domain || `${name.toLowerCase().replace(/\s+/g, '-')}.local`, 
      company_name: name, 
      email: email || null,
      phone: phone || null,
      status: 'new', 
      score: 50, 
      analysis: { company: { industry, location: city } } 
    });
    Utils.toast('Lead pridaný!', 'success');
    ['add-name', 'add-domain', 'add-email', 'add-phone', 'add-industry', 'add-city'].forEach(id => document.getElementById(id).value = '');
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },

  async analyzeSelected() { if (this.selectedIds.size === 0) return Utils.toast('Označ leady', 'warning'); for (const id of this.selectedIds) await this.analyze(id); this.selectedIds.clear(); },

  // Hromadné odoslanie ponúk
  async sendBulkProposals() {
    if (this.selectedIds.size === 0) {
      return Utils.toast('Najprv označ leady', 'warning');
    }
    
    // Filtrovať len leady s emailom a analýzou
    const selectedLeads = this.leads.filter(l => this.selectedIds.has(l.id));
    const validLeads = selectedLeads.filter(l => l.email && l.analysis);
    const noEmail = selectedLeads.filter(l => !l.email);
    const noAnalysis = selectedLeads.filter(l => l.email && !l.analysis);
    
    if (validLeads.length === 0) {
      let msg = 'Žiadny lead nie je pripravený na odoslanie.';
      if (noEmail.length > 0) msg += ` ${noEmail.length} bez emailu.`;
      if (noAnalysis.length > 0) msg += ` ${noAnalysis.length} bez analýzy.`;
      return Utils.toast(msg, 'warning');
    }
    
    // Zobraziť modal s potvrdením
    this.showBulkSendModal(validLeads, noEmail, noAnalysis);
  },
  
  showBulkSendModal(validLeads, noEmail, noAnalysis) {
    // Načítať šablóny
    this.loadEmailTemplates();
    
    const modal = document.createElement('div');
    modal.id = 'bulk-send-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
      <div class="modal-box-new modal-large">
        <div class="modal-header-gradient">
          <h2>📧 Hromadné odoslanie ponúk</h2>
          <button onclick="LeadsModule.closeBulkSendModal()" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="bulk-send-summary">
            <div class="summary-item success">
              <span class="summary-number">${validLeads.length}</span>
              <span class="summary-label">pripravených na odoslanie</span>
            </div>
            ${noEmail.length > 0 ? `
              <div class="summary-item warning">
                <span class="summary-number">${noEmail.length}</span>
                <span class="summary-label">bez emailu (preskočené)</span>
              </div>
            ` : ''}
            ${noAnalysis.length > 0 ? `
              <div class="summary-item warning">
                <span class="summary-number">${noAnalysis.length}</span>
                <span class="summary-label">bez analýzy (preskočené)</span>
              </div>
            ` : ''}
          </div>
          
          <div class="bulk-leads-preview">
            <label>Leady na odoslanie:</label>
            <div class="leads-chips">
              ${validLeads.map(l => `
                <span class="lead-chip">
                  ${l.company_name || l.domain}
                  <small>${l.email}</small>
                </span>
              `).join('')}
            </div>
          </div>
          
          <div class="form-group">
            <label>📋 Vybrať šablónu emailu</label>
            <div class="template-selector" id="bulk-template-selector">
              ${(this.emailTemplates || this.defaultEmailTemplates).filter(t => t.slug !== 'custom').map(t => `
                <button type="button" class="template-btn ${t.slug === 'proposal-formal' ? 'active' : ''}" 
                  onclick="LeadsModule.selectBulkTemplate('${t.id || t.slug}', this)">
                  ${t.name}
                </button>
              `).join('')}
            </div>
          </div>
          
          <div class="form-group">
            <label>📝 Predmet emailu</label>
            <input type="text" id="bulk-subject" value="Marketingová ponuka pre {{company}} - Adlify" class="form-input">
            <small class="form-hint">Použite {{company}} pre názov firmy</small>
          </div>
          
          <div class="bulk-options">
            <label class="checkbox-label">
              <input type="checkbox" id="bulk-include-link" checked>
              Pridať odkaz na online ponuku
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="bulk-delay" checked>
              Oneskorenie medzi emailami (2s) - odporúčané
            </label>
          </div>
          
          <div id="bulk-progress" style="display:none;">
            <div class="progress-bar">
              <div class="progress-fill" id="bulk-progress-fill" style="width:0%"></div>
            </div>
            <p class="progress-text" id="bulk-progress-text">Odosielam...</p>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="LeadsModule.closeBulkSendModal()" class="btn-secondary">Zrušiť</button>
          <button onclick="LeadsModule.executeBulkSend()" class="btn-primary" id="bulk-send-btn">
            📧 Odoslať ${validLeads.length} ponúk
          </button>
        </div>
      </div>
      
      <style>
        .bulk-send-summary { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .summary-item { flex: 1; padding: 1rem; border-radius: 12px; text-align: center; }
        .summary-item.success { background: #dcfce7; border: 1px solid #86efac; }
        .summary-item.warning { background: #fef3c7; border: 1px solid #fcd34d; }
        .summary-number { display: block; font-size: 2rem; font-weight: 700; }
        .summary-item.success .summary-number { color: #16a34a; }
        .summary-item.warning .summary-number { color: #d97706; }
        .summary-label { font-size: 0.85rem; color: #64748b; }
        .bulk-leads-preview { margin-bottom: 1.5rem; }
        .bulk-leads-preview label { display: block; font-weight: 500; margin-bottom: 0.5rem; }
        .leads-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 120px; overflow-y: auto; padding: 0.5rem; background: #f8fafc; border-radius: 8px; }
        .lead-chip { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: white; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; }
        .lead-chip small { color: #64748b; font-size: 0.75rem; }
        .bulk-options { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
        .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
        .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #f97316, #ea580c); transition: width 0.3s; }
        .progress-text { text-align: center; color: #64748b; font-size: 0.9rem; }
        .btn-filter.orange { background: linear-gradient(135deg, #f97316, #ea580c); color: white; }
        .btn-filter.orange:hover { opacity: 0.9; }
      </style>
    `;
    
    document.body.appendChild(modal);
    this.bulkValidLeads = validLeads;
  },
  
  closeBulkSendModal() {
    const modal = document.getElementById('bulk-send-modal');
    if (modal) modal.remove();
    this.bulkValidLeads = null;
  },
  
  selectBulkTemplate(templateId, btn) {
    // Update active state
    document.querySelectorAll('#bulk-template-selector .template-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.selectedBulkTemplateId = templateId;
    
    // Update subject based on template
    const template = (this.emailTemplates || this.defaultEmailTemplates).find(t => (t.id || t.slug) === templateId);
    if (template?.subject) {
      document.getElementById('bulk-subject').value = template.subject;
    }
  },
  
  async executeBulkSend() {
    const leads = this.bulkValidLeads;
    if (!leads || leads.length === 0) return;
    
    const subject = document.getElementById('bulk-subject').value;
    const includeLink = document.getElementById('bulk-include-link').checked;
    const useDelay = document.getElementById('bulk-delay').checked;
    
    // Disable button
    const btn = document.getElementById('bulk-send-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Odosielam...';
    
    // Show progress
    document.getElementById('bulk-progress').style.display = 'block';
    const progressFill = document.getElementById('bulk-progress-fill');
    const progressText = document.getElementById('bulk-progress-text');
    
    let sent = 0;
    let failed = 0;
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      progressText.textContent = `Odosielam ${i + 1}/${leads.length}: ${lead.company_name || lead.domain}`;
      
      try {
        await this.sendSingleBulkEmail(lead, subject, includeLink);
        sent++;
      } catch (e) {
        console.error('Bulk send error for', lead.email, e);
        failed++;
      }
      
      // Update progress
      const percent = Math.round(((i + 1) / leads.length) * 100);
      progressFill.style.width = percent + '%';
      
      // Delay between emails
      if (useDelay && i < leads.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Done
    progressText.textContent = `Hotovo! Odoslaných: ${sent}, Zlyhalo: ${failed}`;
    btn.textContent = '✅ Dokončené';
    
    // Clear selection
    this.selectedIds.clear();
    
    // Refresh list after 2s
    setTimeout(() => {
      this.closeBulkSendModal();
      this.loadLeads().then(() => {
        document.getElementById('leads-list').innerHTML = this.renderLeadsList();
      });
    }, 2000);
    
    Utils.toast(`Odoslaných ${sent} ponúk${failed > 0 ? `, ${failed} zlyhalo` : ''}`, sent > 0 ? 'success' : 'error');
  },
  
  async sendSingleBulkEmail(lead, subjectTemplate, includeLink) {
    const companyName = lead.analysis?.company?.name || lead.company_name || lead.domain || 'firma';
    const subject = subjectTemplate.replace(/\{\{company\}\}/g, companyName);
    
    // Získať šablónu
    const templateId = this.selectedBulkTemplateId || 'proposal-formal';
    const template = (this.emailTemplates || this.defaultEmailTemplates).find(t => (t.id || t.slug) === templateId);
    let body = this.htmlToPlainText(template?.body_html || '');
    body = this.replaceVariables(body, lead);
    
    let proposalUrl = null;
    
    // Uložiť ponuku a získať odkaz
    if (includeLink && lead.analysis) {
      try {
        const proposalHtml = this.buildProposalHTML(lead, lead.analysis);
        const proposalToken = this.generateToken();
        
        await Database.client.from('proposals').insert({
          lead_id: lead.id,
          token: proposalToken,
          company_name: companyName,
          domain: lead.domain,
          html_content: proposalHtml,
          analysis_data: lead.analysis,
          status: 'sent'
        });
        
        proposalUrl = `${window.location.origin}/proposal.html?t=${proposalToken}`;
        
        // Pridať odkaz do emailu
        body += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 VAŠA PERSONALIZOVANÁ PONUKA

Kliknite na odkaz nižšie pre jej zobrazenie:
🔗 ${proposalUrl}

Odkaz je platný 30 dní.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      } catch (e) {
        console.warn('Failed to save proposal:', e);
      }
    }
    
    // Vytvoriť HTML body
    const htmlBody = this.buildEmailHtmlBody(body, proposalUrl, companyName);
    
    // Odoslať email
    const response = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: lead.email,
        toName: companyName,
        subject,
        htmlBody,
        textBody: body,
        leadId: lead.id
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to send');
    }
    
    // Aktualizovať lead
    await Database.update('leads', lead.id, {
      status: 'contacted',
      proposal_status: 'sent',
      proposal_sent_at: new Date().toISOString()
    });
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
  },
  
  // Odoslanie ponuky emailom
  async sendProposalEmail(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return Utils.toast('Lead nenájdený', 'error');
    
    const analysis = lead.analysis;
    if (!analysis) return Utils.toast('Najprv analyzuj lead', 'warning');
    
    // Generuj HTML ponuku
    const proposalHtml = this.buildProposalHTML(lead, analysis);
    
    // Otvor messages modul s predvyplnenými údajmi
    if (window.MessagesModule) {
      const companyName = analysis.company?.name || lead.company_name || lead.domain;
      
      MessagesModule.showComposeModal({
        to: lead.email || '', // Ak nemá email, nechaj prázdne - používateľ zadá ručne
        toName: lead.contact_person || companyName,
        subject: `Návrh marketingovej stratégie pre ${companyName}`,
        body: `Dobrý deň,

dovoľujeme si Vám zaslať návrh marketingovej stratégie pre ${companyName}.

V prílohe nájdete kompletnú analýzu vašej online prítomnosti a konkrétne odporúčania ako získať viac zákazníkov prostredníctvom online reklamy.

V prípade záujmu ma neváhajte kontaktovať.

S pozdravom,
Tím Adlify
+421 944 184 045
info@adlify.eu`,
        leadId: lead.id,
        proposalHtml: proposalHtml,
        onSent: () => this.markProposalSent(leadId, document.getElementById('compose-to')?.value || lead.email)
      });
    } else {
      Utils.toast('Messages modul nie je dostupný', 'error');
    }
  },
  
  // Označenie leadu že ponuka bola odoslaná
  async markProposalSent(leadId, email) {
    const updateData = {
      proposal_status: 'sent',
      proposal_sent_at: new Date().toISOString(),
      proposal_sent_to: email
    };
    
    // Ak lead nemal email, ulož ho
    const lead = this.leads.find(l => l.id === leadId);
    if (email && lead && !lead.email) {
      updateData.email = email;
    }
    
    await Database.update('leads', leadId, updateData);
    
    // Refresh zoznam
    const leadIndex = this.leads.findIndex(l => l.id === leadId);
    if (leadIndex !== -1) {
      this.leads[leadIndex].proposal_status = 'sent';
      this.leads[leadIndex].proposal_sent_at = new Date().toISOString();
      this.leads[leadIndex].proposal_sent_to = email;
      if (email) this.leads[leadIndex].email = email;
    }
    
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    Utils.toast('Ponuka odoslaná! Lead označený.', 'success');
  }
};

window.LeadsModule = LeadsModule;
