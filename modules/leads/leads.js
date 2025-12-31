/**
 * ADLIFY PLATFORM - Leads Module v2.2
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
    const stats = {
      total: this.leads.length,
      new: this.leads.filter(l => !l.status || l.status === 'new').length,
      analyzed: this.leads.filter(l => l.analysis).length,
      contacted: this.leads.filter(l => l.status === 'contacted' || l.proposal_status === 'sent').length
    };
    
    return `
      <div class="leads-module-v3">
        <!-- Header -->
        <div class="leads-header">
          <div class="leads-header-content">
            <div class="leads-header-title">
              <h1>👥 Leady</h1>
              <p>Správa potenciálnych klientov</p>
            </div>
            <div class="leads-header-actions">
              <button onclick="LeadsModule.showTab('import')" class="btn-leads-secondary">
                📥 Import
              </button>
              <button onclick="LeadsModule.showTab('add')" class="btn-leads-primary">
                ➕ Nový lead
              </button>
            </div>
          </div>
        </div>
        
        <!-- Stats -->
        <div class="leads-stats">
          <div class="leads-stat-card">
            <div class="stat-icon blue">👥</div>
            <div class="stat-info">
              <span class="stat-value">${stats.total}</span>
              <span class="stat-label">Celkom</span>
            </div>
          </div>
          <div class="leads-stat-card">
            <div class="stat-icon green">🆕</div>
            <div class="stat-info">
              <span class="stat-value">${stats.new}</span>
              <span class="stat-label">Nové</span>
            </div>
          </div>
          <div class="leads-stat-card">
            <div class="stat-icon purple">🤖</div>
            <div class="stat-info">
              <span class="stat-value">${stats.analyzed}</span>
              <span class="stat-label">Analyzované</span>
            </div>
          </div>
          <div class="leads-stat-card">
            <div class="stat-icon orange">📧</div>
            <div class="stat-info">
              <span class="stat-value">${stats.contacted}</span>
              <span class="stat-label">Kontaktované</span>
            </div>
          </div>
        </div>
        
        <!-- Tabs -->
        <div class="leads-tabs-bar">
          <div class="leads-tabs">
            <button onclick="LeadsModule.showTab('list')" class="leads-tab active" data-tab="list">
              📋 Zoznam
            </button>
            <button onclick="LeadsModule.showTab('import')" class="leads-tab" data-tab="import">
              📥 Import
            </button>
            <button onclick="LeadsModule.showTab('add')" class="leads-tab" data-tab="add">
              ✏️ Pridať
            </button>
          </div>
          
          <div class="leads-filters">
            <div class="leads-search">
              <span>🔍</span>
              <input type="text" id="filter-search" placeholder="Hľadať..." value="${this.filters.search}">
            </div>
            <select id="filter-status" class="leads-select" onchange="LeadsModule.onStatusChange(this.value)">
              <option value="">Všetky stavy</option>
              <option value="new" ${this.filters.status === 'new' ? 'selected' : ''}>🆕 Nové</option>
              <option value="analyzed" ${this.filters.status === 'analyzed' ? 'selected' : ''}>🤖 Analyzované</option>
              <option value="contacted" ${this.filters.status === 'contacted' ? 'selected' : ''}>📧 Kontaktované</option>
              <option value="converted" ${this.filters.status === 'converted' ? 'selected' : ''}>✅ Klienti</option>
            </select>
          </div>
        </div>
        
        <!-- Content -->
        <div class="leads-content">
          <!-- List Tab -->
          <div id="tab-list" class="tab-content">
            <!-- Bulk Actions -->
            <div class="leads-bulk-bar">
              <button onclick="LeadsModule.selectAll()" class="btn-bulk">☑️ Označiť všetky</button>
              <button onclick="LeadsModule.analyzeSelected()" class="btn-bulk purple">🤖 Analyzovať označené</button>
              <button onclick="LeadsModule.deleteSelected()" class="btn-bulk red">🗑️ Zmazať označené</button>
              <span class="bulk-count">${this.selectedIds.size > 0 ? `(${this.selectedIds.size} označených)` : ''}</span>
            </div>
            
            <!-- Table -->
            <div class="leads-table-card">
              <div class="leads-table-header">
                <span>Leady (<span id="leads-count">${this.leads.length}</span>)</span>
              </div>
              <div id="leads-list" class="leads-table-body">
                ${this.renderLeadsList()}
              </div>
            </div>
          </div>
          
          <!-- Import Tab -->
          <div id="tab-import" class="tab-content hidden">
            <div class="leads-form-card">
              <h2>📥 Import leadov</h2>
              
              <div class="import-options">
                <div class="import-option" onclick="LeadsModule.showImportType('domains')">
                  <div class="import-icon">📝</div>
                  <div class="import-text">
                    <strong>Domény / Zoznam</strong>
                    <span>Vložte domény alebo skopírujte z Excelu</span>
                  </div>
                </div>
                <div class="import-option" onclick="LeadsModule.showImportType('miner')">
                  <div class="import-icon">⛏️</div>
                  <div class="import-text">
                    <strong>Marketing Miner</strong>
                    <span>Import z SERP analýzy / Contact Finder</span>
                  </div>
                </div>
                <div class="import-option" onclick="LeadsModule.showImportType('csv')">
                  <div class="import-icon">📄</div>
                  <div class="import-text">
                    <strong>CSV súbor</strong>
                    <span>Nahrajte CSV s leadmi</span>
                  </div>
                </div>
              </div>
              
              <!-- Domains Import -->
              <div id="import-domains-section" class="import-section">
                <label>Domény (jedna na riadok)</label>
                <textarea id="import-domains" rows="8" placeholder="firma1.sk&#10;firma2.sk&#10;firma3.sk"></textarea>
                <div class="form-actions">
                  <button onclick="LeadsModule.handleImport()" class="btn-leads-primary">📥 Importovať domény</button>
                </div>
              </div>
              
              <!-- Marketing Miner Import -->
              <div id="import-miner-section" class="import-section hidden">
                <label>Marketing Miner JSON/CSV výstup</label>
                <textarea id="import-miner-data" rows="8" placeholder="Vložte JSON alebo CSV dáta z Marketing Miner..."></textarea>
                <p class="form-hint">Podporované: SERP Analyzer, Contact Finder, Company Details</p>
                <div class="form-actions">
                  <button onclick="LeadsModule.handleMinerImport()" class="btn-leads-primary">⛏️ Importovať z Miner</button>
                </div>
              </div>
              
              <!-- CSV Import -->
              <div id="import-csv-section" class="import-section hidden">
                <label>CSV súbor</label>
                <input type="file" id="import-csv-file" accept=".csv" onchange="LeadsModule.handleCSVSelect(this)">
                <p class="form-hint">Očakávané stĺpce: domain, company_name, email, phone</p>
                <div id="csv-preview"></div>
                <div class="form-actions">
                  <button onclick="LeadsModule.handleCSVImport()" class="btn-leads-primary" id="csv-import-btn" disabled>📄 Importovať CSV</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Add Tab -->
          <div id="tab-add" class="tab-content hidden">
            <div class="leads-form-card">
              <h2>✏️ Pridať nový lead</h2>
              <div class="form-grid">
                <div class="form-group">
                  <label>Názov firmy *</label>
                  <input type="text" id="add-name" placeholder="Zadajte názov firmy">
                </div>
                <div class="form-group">
                  <label>Doména</label>
                  <input type="text" id="add-domain" placeholder="firma.sk">
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" id="add-email" placeholder="kontakt@firma.sk">
                </div>
                <div class="form-group">
                  <label>Telefón</label>
                  <input type="text" id="add-phone" placeholder="+421...">
                </div>
                <div class="form-group">
                  <label>Odvetvie</label>
                  <input type="text" id="add-industry" placeholder="napr. E-commerce">
                </div>
                <div class="form-group">
                  <label>Mesto</label>
                  <input type="text" id="add-city" placeholder="napr. Bratislava">
                </div>
              </div>
              <div class="form-actions">
                <button onclick="LeadsModule.handleAdd()" class="btn-leads-primary">
                  ➕ Pridať lead
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Analysis Modal -->
      <div id="analysis-modal" class="modal-overlay hidden">
        <div class="modal-box modal-large">
          <div class="modal-header gradient">
            <h2>🤖 AI Analýza</h2>
            <button onclick="LeadsModule.closeModal()" class="modal-close">✕</button>
          </div>
          <div id="analysis-content" class="modal-body"></div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeModal()" class="btn-leads-secondary">Zavrieť</button>
            <div class="modal-footer-right">
              <button onclick="LeadsModule.editAnalysis()" class="btn-leads-secondary">✏️ Upraviť</button>
              <button onclick="LeadsModule.generateProposal()" class="btn-leads-primary">📄 Generovať ponuku</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Edit Modal -->
      <div id="edit-modal" class="modal-overlay hidden">
        <div class="modal-box modal-large">
          <div class="modal-header">
            <h2>✏️ Upraviť analýzu</h2>
            <button onclick="LeadsModule.closeEditModal()" class="modal-close">✕</button>
          </div>
          <div id="edit-content" class="modal-body"></div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeEditModal()" class="btn-leads-secondary">Zrušiť</button>
            <button onclick="LeadsModule.saveAnalysisEdits()" class="btn-leads-primary">💾 Uložiť zmeny</button>
          </div>
        </div>
      </div>
      
      <!-- Proposal Modal -->
      <div id="proposal-modal" class="modal-overlay hidden">
        <div class="modal-box">
          <div class="modal-header gradient">
            <h2>📄 Generovať ponuku</h2>
            <button onclick="LeadsModule.closeProposalModal()" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">Pred generovaním ponuky môžeš pridať poznámky. AI prepracuje analýzu podľa pokynov.</p>
            <div class="form-group">
              <label>📝 Poznámky pre AI (voliteľné)</label>
              <textarea id="proposal-notes" rows="6" placeholder="Napr.: Zameraj sa na lokálnych zákazníkov. Odporúčam Pro balík..."></textarea>
            </div>
            <div class="tip-box">
              <strong>💡 Tip:</strong> Môžeš napísať čokoľvek - opravy, zmenu tónu, špecifické odporúčania.
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="LeadsModule.closeProposalModal()" class="btn-leads-secondary">Zrušiť</button>
            <div class="modal-footer-right">
              <button onclick="LeadsModule.generateProposalDirect()" class="btn-leads-secondary">Bez úprav</button>
              <button onclick="LeadsModule.generateProposalWithNotes()" class="btn-leads-primary">🤖 Generovať s AI</button>
            </div>
          </div>
        </div>
      </div>
      
      ${this.renderStyles()}
    `;
  },
  
  renderStyles() {
    return `
      <style>
        .leads-module-v3 {
          background: #f8fafc;
          min-height: 100vh;
          margin: -1.5rem;
          padding: 0;
        }
        
        /* Header */
        .leads-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          padding: 2rem 2rem 4rem;
        }
        
        .leads-header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .leads-header-title h1 {
          color: white;
          font-size: 1.75rem;
          font-weight: 700;
          margin: 0;
        }
        
        .leads-header-title p {
          color: #94a3b8;
          margin: 0.25rem 0 0 0;
        }
        
        .leads-header-actions {
          display: flex;
          gap: 0.75rem;
        }
        
        /* Buttons */
        .btn-leads-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-leads-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
        }
        
        .btn-leads-secondary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          font-weight: 500;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-leads-secondary:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        /* Stats */
        .leads-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          max-width: 1400px;
          margin: -2rem auto 0;
          padding: 0 2rem;
          position: relative;
          z-index: 10;
        }
        
        .leads-stat-card {
          background: white;
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        
        .stat-icon.blue { background: #dbeafe; }
        .stat-icon.green { background: #d1fae5; }
        .stat-icon.purple { background: #ede9fe; }
        .stat-icon.orange { background: #ffedd5; }
        
        .stat-info {
          display: flex;
          flex-direction: column;
        }
        
        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
        }
        
        .stat-label {
          font-size: 0.85rem;
          color: #64748b;
        }
        
        /* Tabs Bar */
        .leads-tabs-bar {
          background: white;
          border-bottom: 1px solid #e2e8f0;
          padding: 0 2rem;
          margin-top: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .leads-tabs {
          display: flex;
          gap: 0.25rem;
        }
        
        .leads-tab {
          padding: 1rem 1.25rem;
          background: transparent;
          border: none;
          font-size: 0.9rem;
          font-weight: 500;
          color: #64748b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        
        .leads-tab:hover {
          color: #1e293b;
        }
        
        .leads-tab.active {
          color: #f97316;
          border-bottom-color: #f97316;
        }
        
        .leads-filters {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem 0;
        }
        
        .leads-search {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #f1f5f9;
          border-radius: 8px;
          border: 1px solid transparent;
        }
        
        .leads-search:focus-within {
          background: white;
          border-color: #f97316;
        }
        
        .leads-search input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.9rem;
          width: 180px;
        }
        
        .leads-select {
          padding: 0.5rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.9rem;
          background: white;
          cursor: pointer;
        }
        
        /* Content */
        .leads-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.5rem 2rem;
        }
        
        /* Bulk Actions */
        .leads-bulk-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .btn-bulk {
          padding: 0.5rem 0.875rem;
          background: #f1f5f9;
          border: none;
          border-radius: 8px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .btn-bulk:hover {
          background: #e2e8f0;
        }
        
        .btn-bulk.purple:hover {
          background: #ede9fe;
          color: #7c3aed;
        }
        
        .btn-bulk.red:hover {
          background: #fee2e2;
          color: #dc2626;
        }
        
        .bulk-count {
          font-size: 0.85rem;
          color: #64748b;
          margin-left: 0.5rem;
        }
        
        /* Table */
        .leads-table-card {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .leads-table-header {
          padding: 1rem 1.25rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 600;
          color: #475569;
        }
        
        .leads-table-body {
          max-height: 60vh;
          overflow-y: auto;
        }
        
        /* Form Card */
        .leads-form-card {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .leads-form-card h2 {
          font-size: 1.25rem;
          margin: 0 0 0.5rem 0;
        }
        
        .form-desc {
          color: #64748b;
          margin-bottom: 1.5rem;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .form-group {
          margin-bottom: 0;
        }
        
        .form-group label {
          display: block;
          font-size: 0.85rem;
          font-weight: 500;
          color: #475569;
          margin-bottom: 0.5rem;
        }
        
        .form-group input,
        .form-group textarea,
        .leads-form-card textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.9rem;
          transition: all 0.15s;
        }
        
        .form-group input:focus,
        .form-group textarea:focus,
        .leads-form-card textarea:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }
        
        .form-actions {
          margin-top: 1.5rem;
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
        
        .modal-overlay.hidden {
          display: none;
        }
        
        .modal-box {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        
        .modal-box.modal-large {
          max-width: 900px;
        }
        
        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .modal-header.gradient {
          background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
          color: white;
          border: none;
        }
        
        .modal-header h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }
        
        .modal-close {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: inherit;
          font-size: 1.25rem;
        }
        
        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
          flex: 1;
        }
        
        .modal-desc {
          color: #64748b;
          margin-bottom: 1.5rem;
        }
        
        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
        }
        
        .modal-footer-right {
          display: flex;
          gap: 0.75rem;
        }
        
        .modal-footer .btn-leads-secondary {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        
        .modal-footer .btn-leads-secondary:hover {
          background: #e2e8f0;
        }
        
        .tip-box {
          background: #eff6ff;
          border-radius: 10px;
          padding: 1rem;
          font-size: 0.9rem;
          color: #1e40af;
          margin-top: 1rem;
        }
        
        /* Lead Row Styles */
        .leads-table-body > div {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.15s;
        }
        
        .leads-table-body > div:hover {
          background: #f8fafc;
        }
        
        /* Tab Content */
        .tab-content.hidden {
          display: none;
        }
        
        /* Table Styles */
        .leads-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .leads-table th {
          background: #f8fafc;
          padding: 0.875rem 1rem;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .leads-table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        
        .lead-row {
          cursor: pointer;
          transition: background 0.15s;
        }
        
        .lead-row:hover {
          background: #f8fafc;
        }
        
        .col-check { width: 40px; }
        .col-actions { width: 140px; }
        
        .lead-company {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        
        .lead-company strong {
          color: #1e293b;
        }
        
        .lead-domain {
          font-size: 0.8rem;
          color: #f97316;
          text-decoration: none;
        }
        
        .lead-domain:hover {
          text-decoration: underline;
        }
        
        .lead-contact {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          font-size: 0.85rem;
        }
        
        .contact-email { color: #2563eb; }
        .contact-phone { color: #059669; }
        
        .lead-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        
        .status-badge.blue { background: #dbeafe; color: #1d4ed8; }
        .status-badge.yellow { background: #fef3c7; color: #b45309; }
        .status-badge.purple { background: #ede9fe; color: #7c3aed; }
        .status-badge.green { background: #d1fae5; color: #047857; }
        .status-badge.red { background: #fee2e2; color: #dc2626; }
        
        .analysis-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          background: #d1fae5;
          color: #047857;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        
        .proposal-badge {
          font-size: 0.8rem;
        }
        
        .score-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.9rem;
        }
        
        .score-badge.high { background: #d1fae5; color: #047857; }
        .score-badge.medium { background: #fef3c7; color: #b45309; }
        .score-badge.low { background: #f1f5f9; color: #64748b; }
        
        .btn-action {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.15s;
        }
        
        .btn-action:hover { background: #e2e8f0; }
        .btn-action.green:hover { background: #d1fae5; }
        
        /* Detail Modal Styles */
        .lead-detail {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .detail-title h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0;
          color: #1e293b;
        }
        
        .detail-domain {
          color: #f97316;
          text-decoration: none;
          font-size: 0.9rem;
        }
        
        .detail-domain:hover { text-decoration: underline; }
        
        .detail-score {
          text-align: center;
        }
        
        .score-big {
          display: block;
          font-size: 2rem;
          font-weight: 800;
          line-height: 1;
        }
        
        .score-big.high { color: #047857; }
        .score-big.medium { color: #b45309; }
        .score-big.low { color: #64748b; }
        
        .score-label {
          font-size: 0.75rem;
          color: #94a3b8;
          text-transform: uppercase;
        }
        
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        
        .detail-card {
          background: #f8fafc;
          border-radius: 12px;
          padding: 1.25rem;
        }
        
        .detail-card h4 {
          font-size: 0.9rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
          color: #475569;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .info-row:last-child { border-bottom: none; }
        
        .info-label {
          font-size: 0.85rem;
          color: #64748b;
        }
        
        .info-value {
          font-size: 0.85rem;
          color: #1e293b;
          font-weight: 500;
        }
        
        .info-value a {
          color: #f97316;
          text-decoration: none;
        }
        
        .info-value a:hover { text-decoration: underline; }
        
        .status-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        
        .status-option {
          padding: 0.5rem 0.75rem;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .status-option:hover {
          border-color: #f97316;
        }
        
        .status-option.active {
          background: #f97316;
          border-color: #f97316;
          color: white;
        }
        
        .detail-section {
          background: #f8fafc;
          border-radius: 12px;
          padding: 1.25rem;
        }
        
        .detail-section h4 {
          font-size: 0.9rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
          color: #475569;
        }
        
        .analysis-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        
        .analysis-block {
          background: white;
          border-radius: 8px;
          padding: 1rem;
        }
        
        .analysis-block h5 {
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 0.5rem 0;
        }
        
        .analysis-block p {
          font-size: 0.9rem;
          color: #334155;
          margin: 0;
          line-height: 1.5;
        }
        
        .analysis-block.highlight {
          background: #fff7ed;
          border: 1px solid #fed7aa;
        }
        
        .analysis-block.package {
          background: linear-gradient(135deg, #f97316 0%, #ec4899 100%);
          color: white;
        }
        
        .analysis-block.package h5 { color: rgba(255,255,255,0.8); }
        .analysis-block.package .package-name { font-size: 1.1rem; font-weight: 700; }
        .analysis-block.package .package-price { font-size: 0.9rem; opacity: 0.9; }
        
        .no-analysis-box {
          text-align: center;
          padding: 2.5rem;
          background: #f8fafc;
          border-radius: 12px;
        }
        
        .no-analysis-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .no-analysis-box h4 {
          margin: 0 0 0.5rem;
          color: #1e293b;
        }
        
        .no-analysis-box p {
          color: #64748b;
          margin: 0 0 1.5rem;
        }
        
        .detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .btn-leads-success {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
        }
        
        .edit-lead-form h3 {
          margin: 0 0 1.5rem;
        }
        
        .empty-state {
          text-align: center;
          padding: 3rem;
        }
        
        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .empty-state h3 {
          margin: 0 0 0.5rem;
          color: #1e293b;
        }
        
        .empty-state p {
          color: #64748b;
          margin: 0;
        }
        
        /* Import Options */
        .import-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .import-option {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .import-option:hover {
          border-color: #f97316;
          background: #fff7ed;
        }
        
        .import-option.active {
          border-color: #f97316;
          background: #fff7ed;
        }
        
        .import-icon {
          font-size: 1.75rem;
        }
        
        .import-text {
          display: flex;
          flex-direction: column;
        }
        
        .import-text strong {
          font-size: 0.9rem;
          color: #1e293b;
        }
        
        .import-text span {
          font-size: 0.8rem;
          color: #64748b;
        }
        
        .import-section {
          margin-top: 1rem;
        }
        
        .import-section.hidden {
          display: none;
        }
        
        .import-section label {
          display: block;
          font-size: 0.9rem;
          font-weight: 500;
          color: #475569;
          margin-bottom: 0.5rem;
        }
        
        .form-hint {
          font-size: 0.8rem;
          color: #94a3b8;
          margin-top: 0.5rem;
        }
        
        .csv-preview-box {
          background: #f8fafc;
          border-radius: 8px;
          padding: 1rem;
          margin-top: 1rem;
        }
        
        .csv-preview-box p {
          margin: 0 0 0.5rem;
          font-size: 0.85rem;
        }
        
        .preview-header {
          color: #64748b;
        }
        
        .preview-sample {
          color: #94a3b8;
          font-size: 0.8rem !important;
        }
        
        @media (max-width: 768px) {
          .import-options {
            grid-template-columns: 1fr;
          }
        }
        
        /* Responsive */
        @media (max-width: 1024px) {
          .leads-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .detail-grid, .analysis-grid {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 768px) {
          .leads-stats {
            grid-template-columns: 1fr;
          }
          
          .leads-tabs-bar {
            flex-direction: column;
            gap: 1rem;
            padding: 1rem;
          }
          
          .leads-filters {
            width: 100%;
            flex-wrap: wrap;
          }
          
          .form-grid {
            grid-template-columns: 1fr;
          }
          
          .leads-header-content {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }
        }
      </style>
    `;
  },

  renderLeadsList() {
    if (this.leads.length === 0) return '<div class="empty-state"><div class="empty-icon">👥</div><h3>Žiadne leady</h3><p>Pridajte lead alebo importujte domény</p></div>';
    
    return `
      <table class="leads-table">
        <thead>
          <tr>
            <th class="col-check"><input type="checkbox" onchange="LeadsModule.toggleAllCheckbox(this.checked)"></th>
            <th>Firma</th>
            <th>Kontakt</th>
            <th>Status</th>
            <th>Skóre</th>
            <th>Akcie</th>
          </tr>
        </thead>
        <tbody>
          ${this.leads.map(lead => this.renderLeadRow(lead)).join('')}
        </tbody>
      </table>
    `;
  },

  renderLeadRow(lead) {
    const a = lead.analysis || {};
    const hasAnalysis = a.company || a.analysis;
    const proposalStatus = lead.proposal_status || 'not_sent';
    const score = lead.score || 0;
    const scoreClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    
    const statusConfig = {
      'new': { label: 'Nový', class: 'blue' },
      'contacted': { label: 'Kontaktovaný', class: 'yellow' },
      'proposal_sent': { label: 'Ponuka', class: 'purple' },
      'won': { label: 'Vyhraný', class: 'green' },
      'lost': { label: 'Prehraný', class: 'red' }
    };
    const status = statusConfig[lead.status] || statusConfig['new'];
    
    return `
      <tr class="lead-row" onclick="LeadsModule.showLeadDetail('${lead.id}')">
        <td class="col-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${this.selectedIds.has(lead.id) ? 'checked' : ''} onchange="LeadsModule.toggleSelect('${lead.id}')">
        </td>
        <td>
          <div class="lead-company">
            <strong>${lead.company_name || lead.domain || 'Neznámy'}</strong>
            ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" onclick="event.stopPropagation()" class="lead-domain">${lead.domain}</a>` : ''}
          </div>
        </td>
        <td>
          <div class="lead-contact">
            ${lead.email ? `<span class="contact-email">📧 ${lead.email}</span>` : ''}
            ${lead.phone ? `<span class="contact-phone">📞 ${lead.phone}</span>` : ''}
            ${!lead.email && !lead.phone ? '-' : ''}
          </div>
        </td>
        <td>
          <div class="lead-badges">
            <span class="status-badge ${status.class}">${status.label}</span>
            ${hasAnalysis ? '<span class="analysis-badge">✓ AI</span>' : ''}
            ${proposalStatus === 'sent' ? '<span class="proposal-badge">📧</span>' : ''}
          </div>
        </td>
        <td><div class="score-badge ${scoreClass}">${score}</div></td>
        <td class="col-actions" onclick="event.stopPropagation()">
          <button class="btn-action" onclick="LeadsModule.analyze('${lead.id}')" title="AI Analýza">🤖</button>
          ${hasAnalysis ? `<button class="btn-action" onclick="LeadsModule.showProposalModal('${lead.id}')" title="Ponuka">📄</button>` : ''}
          <button class="btn-action green" onclick="LeadsModule.convertToClient('${lead.id}')" title="Konvertovať">🎯</button>
        </td>
      </tr>
    `;
  },

  toggleAllCheckbox(checked) {
    if (checked) this.leads.forEach(l => this.selectedIds.add(l.id));
    else this.selectedIds.clear();
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
  },

  async showLeadDetail(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;
    
    this.currentLeadId = leadId;
    const a = lead.analysis || {};
    const company = a.company || {};
    const analysis = a.analysis || {};
    const hasAnalysis = company.name || analysis.business_overview;
    
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    
    content.innerHTML = `
      <div class="lead-detail">
        <div class="detail-header">
          <div class="detail-title">
            <h2>${lead.company_name || lead.domain || 'Neznámy'}</h2>
            ${lead.domain ? `<a href="https://${lead.domain}" target="_blank" class="detail-domain">${lead.domain} ↗</a>` : ''}
          </div>
          <div class="detail-score">
            <span class="score-big ${(lead.score || 0) >= 80 ? 'high' : (lead.score || 0) >= 50 ? 'medium' : 'low'}">${lead.score || 0}</span>
            <span class="score-label">Skóre</span>
          </div>
        </div>
        
        <div class="detail-grid">
          <div class="detail-card">
            <h4>📋 Kontaktné údaje</h4>
            <div class="info-row"><span class="info-label">Email</span><span class="info-value">${lead.email ? `<a href="mailto:${lead.email}">${lead.email}</a>` : '-'}</span></div>
            <div class="info-row"><span class="info-label">Telefón</span><span class="info-value">${lead.phone ? `<a href="tel:${lead.phone}">${lead.phone}</a>` : '-'}</span></div>
            <div class="info-row"><span class="info-label">Odvetvie</span><span class="info-value">${lead.industry || company.industry || '-'}</span></div>
            <div class="info-row"><span class="info-label">Lokalita</span><span class="info-value">${lead.city || company.location || '-'}</span></div>
          </div>
          
          <div class="detail-card">
            <h4>📊 Status</h4>
            <div class="status-selector">
              ${['new', 'contacted', 'proposal_sent', 'won', 'lost'].map(s => {
                const cfg = { new: '🆕 Nový', contacted: '📞 Kontaktovaný', proposal_sent: '📧 Ponuka', won: '✅ Vyhraný', lost: '❌ Prehraný' };
                return `<button class="status-option ${lead.status === s ? 'active' : ''}" onclick="LeadsModule.updateLeadStatus('${lead.id}', '${s}')">${cfg[s]}</button>`;
              }).join('')}
            </div>
            <div class="info-row" style="margin-top:1rem"><span class="info-label">Vytvorený</span><span class="info-value">${new Date(lead.created_at).toLocaleDateString('sk-SK')}</span></div>
          </div>
        </div>
        
        ${hasAnalysis ? `
          <div class="detail-section">
            <h4>🤖 AI Analýza</h4>
            <div class="analysis-grid">
              ${analysis.business_overview ? `<div class="analysis-block"><h5>Prehľad podnikania</h5><p>${analysis.business_overview}</p></div>` : ''}
              ${analysis.marketing_assessment ? `<div class="analysis-block"><h5>Marketingové hodnotenie</h5><p>${analysis.marketing_assessment}</p></div>` : ''}
              ${analysis.recommendation ? `<div class="analysis-block highlight"><h5>💡 Odporúčanie</h5><p>${analysis.recommendation}</p></div>` : ''}
              ${a.recommendedPackage ? `<div class="analysis-block package"><h5>📦 Odporúčaný balík</h5><p class="package-name">${this.packages[a.recommendedPackage]?.icon || '📦'} ${this.packages[a.recommendedPackage]?.name || a.recommendedPackage}</p><p class="package-price">${this.packages[a.recommendedPackage]?.price || '???'}€/mesiac</p></div>` : ''}
            </div>
          </div>
        ` : `
          <div class="no-analysis-box">
            <div class="no-analysis-icon">🤖</div>
            <h4>Lead ešte nebol analyzovaný</h4>
            <p>Spustite AI analýzu pre získanie odporúčaní</p>
            <button onclick="LeadsModule.analyze('${lead.id}')" class="btn-leads-primary">🤖 Spustiť AI analýzu</button>
          </div>
        `}
        
        <div class="detail-actions">
          <button onclick="LeadsModule.editLeadInfo('${lead.id}')" class="btn-leads-secondary">✏️ Upraviť</button>
          ${hasAnalysis ? `<button onclick="LeadsModule.editAnalysis()" class="btn-leads-secondary">✏️ Analýza</button>` : ''}
          ${hasAnalysis ? `<button onclick="LeadsModule.showProposalModal('${lead.id}')" class="btn-leads-secondary">📄 Ponuka</button>` : ''}
          ${hasAnalysis && lead.email ? `<button onclick="LeadsModule.sendProposalEmail('${lead.id}')" class="btn-leads-primary">📧 Odoslať</button>` : ''}
          <button onclick="LeadsModule.convertToClient('${lead.id}')" class="btn-leads-success">🎯 Konvertovať</button>
        </div>
      </div>
    `;
    
    if (hasAnalysis) this.currentAnalysis = a;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async updateLeadStatus(leadId, newStatus) {
    try {
      await Database.client.from('leads').update({ status: newStatus }).eq('id', leadId);
      const lead = this.leads.find(l => l.id === leadId);
      if (lead) lead.status = newStatus;
      Utils.toast('Status aktualizovaný', 'success');
      this.showLeadDetail(leadId);
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    } catch (error) {
      Utils.toast('Chyba', 'error');
    }
  },

  editLeadInfo(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;
    document.getElementById('analysis-content').innerHTML = `
      <div class="edit-lead-form">
        <h3>✏️ Upraviť lead</h3>
        <div class="form-grid">
          <div class="form-group"><label>Názov firmy</label><input type="text" id="edit-company-name" value="${lead.company_name || ''}"></div>
          <div class="form-group"><label>Doména</label><input type="text" id="edit-domain" value="${lead.domain || ''}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="edit-lead-email" value="${lead.email || ''}"></div>
          <div class="form-group"><label>Telefón</label><input type="text" id="edit-lead-phone" value="${lead.phone || ''}"></div>
          <div class="form-group"><label>Odvetvie</label><input type="text" id="edit-industry" value="${lead.industry || ''}"></div>
          <div class="form-group"><label>Mesto</label><input type="text" id="edit-city" value="${lead.city || ''}"></div>
        </div>
        <div class="form-group"><label>Poznámky</label><textarea id="edit-notes" rows="3">${lead.notes || ''}</textarea></div>
        <div class="form-actions">
          <button onclick="LeadsModule.showLeadDetail('${leadId}')" class="btn-leads-secondary">← Späť</button>
          <button onclick="LeadsModule.saveLeadInfo('${leadId}')" class="btn-leads-primary">💾 Uložiť</button>
        </div>
      </div>
    `;
  },

  async saveLeadInfo(leadId) {
    const updates = {
      company_name: document.getElementById('edit-company-name').value.trim(),
      domain: document.getElementById('edit-domain').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, ''),
      email: document.getElementById('edit-lead-email').value.trim() || null,
      phone: document.getElementById('edit-lead-phone').value.trim() || null,
      industry: document.getElementById('edit-industry').value.trim() || null,
      city: document.getElementById('edit-city').value.trim() || null,
      notes: document.getElementById('edit-notes').value.trim() || null
    };
    try {
      await Database.client.from('leads').update(updates).eq('id', leadId);
      const lead = this.leads.find(l => l.id === leadId);
      if (lead) Object.assign(lead, updates);
      Utils.toast('Uložené!', 'success');
      this.showLeadDetail(leadId);
      document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    } catch (error) {
      Utils.toast('Chyba', 'error');
    }
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
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.leads-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.remove('hidden');
    document.querySelector(`.leads-tab[data-tab="${tab}"]`)?.classList.add('active');
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
    const lead = this.leads.find(l => l.id === this.currentLeadId) || {};
    content.innerHTML = `
      <div class="space-y-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-2">Názov firmy</label><input type="text" id="edit-company-name" value="${a.company?.name || ''}" class="w-full p-3 border rounded-xl"></div>
          <div><label class="block text-sm font-medium mb-2">Odporúčaný balíček</label><select id="edit-package" class="w-full p-3 border rounded-xl"><option value="Starter" ${a.recommendedPackage === 'Starter' ? 'selected' : ''}>Starter (149€)</option><option value="Pro" ${a.recommendedPackage === 'Pro' ? 'selected' : ''}>Pro (249€)</option><option value="Enterprise" ${a.recommendedPackage === 'Enterprise' ? 'selected' : ''}>Enterprise (399€)</option><option value="Premium" ${a.recommendedPackage === 'Premium' ? 'selected' : ''}>Premium (799€)</option></select></div>
        </div>
        <div class="grid md:grid-cols-2 gap-4 p-4 bg-orange-50 rounded-xl">
          <div><label class="block text-sm font-medium mb-2">📧 Email kontakt</label><input type="email" id="edit-email" value="${lead.email || ''}" class="w-full p-3 border rounded-xl" placeholder="email@firma.sk"></div>
          <div><label class="block text-sm font-medium mb-2">📞 Telefón</label><input type="text" id="edit-phone" value="${lead.phone || ''}" class="w-full p-3 border rounded-xl" placeholder="+421..."></div>
        </div>
        <div><label class="block text-sm font-medium mb-2">Popis firmy</label><textarea id="edit-company-desc" rows="3" class="w-full p-3 border rounded-xl">${a.company?.description || ''}</textarea></div>
        <div><label class="block text-sm font-medium mb-2">Naše zistenia (úvodný text)</label><textarea id="edit-intro" rows="4" class="w-full p-3 border rounded-xl">${a.analysis?.humanWrittenIntro || ''}</textarea></div>
        <div><label class="block text-sm font-medium mb-2">Osobná poznámka pre klienta</label><textarea id="edit-custom-note" rows="3" class="w-full p-3 border rounded-xl">${a.customNote || ''}</textarea></div>
      </div>`;
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
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('proposal-notes').value = '';
  },

  closeProposalModal() {
    document.getElementById('proposal-modal').classList.add('hidden');
    document.getElementById('proposal-modal').classList.remove('flex');
  },

  generateProposalDirect() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (!lead?.analysis) return;
    this.closeProposalModal();
    Utils.toast('Generujem ponuku...', 'info');
    const html = this.generateProposalHTML(lead, lead.analysis);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  },

  async generateProposalWithNotes() {
    const lead = this.leads.find(l => l.id === this.currentLeadId);
    if (!lead?.analysis) return;
    
    const notes = document.getElementById('proposal-notes').value.trim();
    if (!notes) {
      this.generateProposalDirect();
      return;
    }
    
    this.closeProposalModal();
    Utils.toast('AI prepracováva analýzu...', 'info');
    
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      // Call AI to refine analysis based on notes
      const response = await fetch(this.ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'refine',
          existingAnalysis: lead.analysis,
          refinementNotes: notes,
          companyName: lead.company_name,
          domain: lead.domain
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.analysis) {
        // Use refined analysis
        const html = this.generateProposalHTML(lead, result.analysis);
        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
        Utils.toast('Ponuka vygenerovaná s úpravami!', 'success');
      } else {
        // Fallback to original if refine fails
        console.warn('Refine failed, using original:', result.error);
        const html = this.generateProposalHTML(lead, lead.analysis);
        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
        Utils.toast('Ponuka vygenerovaná (bez AI úprav)', 'warning');
      }
    } catch (error) {
      console.error('Refine error:', error);
      // Fallback to original
      const html = this.generateProposalHTML(lead, lead.analysis);
      const blob = new Blob([html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
      Utils.toast('Ponuka vygenerovaná (AI nedostupné)', 'warning');
    }
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

/* Typography */
.gradient-text { background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.section-badge { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 50%; font-weight: 700; font-size: 1rem; margin-right: 15px; flex-shrink: 0; }
.section-title { font-size: 2rem; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; color: #1a1a2e; }
.section-subtitle { font-size: 1.05rem; color: #64748b; margin-bottom: 35px; line-height: 1.8; }
.section-divider { width: 80px; height: 4px; background: linear-gradient(135deg, #FF6B35, #E91E63); border-radius: 2px; margin-bottom: 30px; }

/* Cards */
.card { background: white; border-radius: 16px; padding: 28px; box-shadow: 0 4px 25px rgba(0,0,0,0.06); margin-bottom: 20px; border: 1px solid #e2e8f0; }
.card-highlight { border-left: 4px solid #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }

/* Grid */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; align-items: stretch; }

/* Stats */
.stat-box { text-align: center; padding: 28px; background: white; border-radius: 16px; box-shadow: 0 2px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
.stat-icon { font-size: 2.5rem; margin-bottom: 12px; }
.stat-value { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.stat-label { font-size: 0.85rem; color: #64748b; margin-top: 8px; }

/* Tags */
.tag { display: inline-block; padding: 8px 18px; border-radius: 25px; font-size: 0.85rem; font-weight: 500; margin: 4px; }
.tag-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
.tag-light { background: #f1f5f9; color: #475569; }
.tag-success { background: #dcfce7; color: #166534; }
.tag-warning { background: #fef3c7; color: #92400e; }

/* SWOT */
.swot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.swot-box { padding: 24px; border-radius: 16px; }
.swot-box h4 { font-size: 1rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
.swot-box ul { list-style: none; }
.swot-box li { padding: 8px 0; font-size: 0.9rem; border-bottom: 1px solid rgba(0,0,0,0.05); }
.swot-box li:last-child { border-bottom: none; }
.swot-strengths { background: #f0fdf4; border: 1px solid #bbf7d0; }
.swot-strengths h4 { color: #166534; }
.swot-weaknesses { background: #fef3c7; border: 1px solid #fde68a; }
.swot-weaknesses h4 { color: #92400e; }
.swot-opportunities { background: #dbeafe; border: 1px solid #93c5fd; }
.swot-opportunities h4 { color: #1e40af; }
.swot-threats { background: #fee2e2; border: 1px solid #fecaca; }
.swot-threats h4 { color: #991b1b; }

/* Table */
.data-table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
.data-table th { background: #f8fafc; padding: 16px; text-align: left; font-weight: 600; color: #475569; font-size: 0.85rem; border-bottom: 2px solid #e2e8f0; }
.data-table td { padding: 16px; border-bottom: 1px solid #e2e8f0; }
.data-table tr:hover { background: #f8fafc; }
.data-table tr:last-child td { border-bottom: none; }

/* Packages */
.package-card { background: white; border: 2px solid #e2e8f0; border-radius: 20px; padding: 35px 28px; text-align: center; transition: all 0.3s; position: relative; display: flex; flex-direction: column; height: 100%; }
.package-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0,0,0,0.1); }
.package-card.featured { border-color: #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); }
.package-card.featured::before { content: "⭐ Odporúčame"; position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 6px 20px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.package-icon { font-size: 3rem; margin-bottom: 15px; }
.package-name { font-size: 1.5rem; font-weight: 700; margin-bottom: 5px; color: #1a1a2e; }
.package-price { font-size: 3rem; font-weight: 800; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.package-period { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
.package-desc { color: #64748b; font-size: 0.85rem; margin-bottom: 25px; min-height: 45px; }
.package-features { list-style: none; text-align: left; margin-bottom: 30px; flex-grow: 1; }
.package-features li { padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; display: flex; align-items: center; gap: 10px; }
.package-features li::before { content: "✓"; color: #22c55e; font-weight: bold; font-size: 1.1rem; }
.package-btn { display: block; width: 100%; padding: 16px; border-radius: 12px; font-weight: 600; text-decoration: none; transition: all 0.3s; font-size: 1rem; margin-top: auto; }
.package-btn-outline { border: 2px solid #e2e8f0; color: #475569; background: white; }
.package-btn-outline:hover { border-color: #FF6B35; color: #FF6B35; }
.package-btn-gradient { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border: none; }
.package-btn-gradient:hover { transform: scale(1.02); box-shadow: 0 5px 20px rgba(255,107,53,0.4); }

/* Timeline - Light style */
.timeline { position: relative; padding-left: 50px; margin-top: 40px; }
.timeline::before { content: ''; position: absolute; left: 15px; top: 20px; bottom: 20px; width: 3px; background: linear-gradient(180deg, #FF6B35, #E91E63, #9C27B0, #7c3aed, #3b82f6); border-radius: 3px; }
.timeline-item { position: relative; margin-bottom: 25px; }
.timeline-item::before { content: ''; position: absolute; left: -42px; top: 20px; width: 18px; height: 18px; background: #FF6B35; border-radius: 50%; box-shadow: 0 0 0 4px rgba(255,107,53,0.2); }
.timeline-item:nth-child(2)::before { background: #E91E63; box-shadow: 0 0 0 4px rgba(233,30,99,0.2); }
.timeline-item:nth-child(3)::before { background: #9C27B0; box-shadow: 0 0 0 4px rgba(156,39,176,0.2); }
.timeline-item:nth-child(4)::before { background: #7c3aed; box-shadow: 0 0 0 4px rgba(124,58,237,0.2); }
.timeline-item:nth-child(5)::before { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
.timeline-card { background: #f8fafc; border-radius: 16px; padding: 25px 30px; border: 1px solid #e2e8f0; }
.timeline-title { font-weight: 700; margin-bottom: 10px; font-size: 1.1rem; }
.timeline-item:nth-child(1) .timeline-title { color: #FF6B35; }
.timeline-item:nth-child(2) .timeline-title { color: #E91E63; }
.timeline-item:nth-child(3) .timeline-title { color: #9C27B0; }
.timeline-item:nth-child(4) .timeline-title { color: #7c3aed; }
.timeline-item:nth-child(5) .timeline-title { color: #3b82f6; }
.timeline-desc { color: #64748b; font-size: 0.95rem; line-height: 1.7; }

/* Benefits */
.benefit-card { background: white; border-radius: 16px; padding: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; transition: all 0.3s; }
.benefit-card:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,0,0,0.1); }
.benefit-icon { width: 60px; height: 60px; background: linear-gradient(135deg, #fff7ed, #fef2f2); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 20px; }
.benefit-title { font-weight: 700; margin-bottom: 10px; font-size: 1.1rem; color: #1a1a2e; }
.benefit-desc { color: #64748b; font-size: 0.95rem; line-height: 1.6; }

/* CTA Section */
.cta-section { background: linear-gradient(135deg, #FF6B35 0%, #E91E63 100%); border-radius: 24px; padding: 70px; text-align: center; color: white; }
.cta-title { font-size: 2.5rem; font-weight: 800; margin-bottom: 20px; }
.cta-subtitle { font-size: 1.15rem; opacity: 0.95; margin-bottom: 40px; max-width: 550px; margin-left: auto; margin-right: auto; line-height: 1.7; }
.cta-buttons { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 35px; }
.cta-btn { padding: 18px 40px; border-radius: 12px; font-weight: 600; text-decoration: none; font-size: 1.05rem; transition: all 0.3s; display: inline-flex; align-items: center; gap: 10px; }
.cta-btn-white { background: white; color: #FF6B35; }
.cta-btn-white:hover { transform: scale(1.05); box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.cta-btn-outline { background: transparent; color: white; border: 2px solid white; }
.cta-btn-outline:hover { background: white; color: #FF6B35; }
.cta-contact { margin-top: 25px; font-size: 1rem; }
.cta-contact p { margin: 10px 0; }
.cta-contact a { color: white; text-decoration: none; font-weight: 500; }
.cta-contact a:hover { text-decoration: underline; }

/* Footer */
.footer { text-align: center; padding: 50px; background: #f8fafc; color: #64748b; font-size: 0.9rem; }
.footer-logo { height: 35px; margin-bottom: 20px; }

/* Hero */
.hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 60px; }
.hero-content { max-width: 850px; }
.hero-logo { height: 55px; margin-bottom: 45px; }
.hero-badge { display: inline-block; padding: 10px 25px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 30px; font-size: 0.9rem; font-weight: 600; margin-bottom: 30px; }
.hero-title { font-size: 3.2rem; font-weight: 800; margin-bottom: 25px; color: #1a1a2e; line-height: 1.2; }
.hero-subtitle { font-size: 1.25rem; color: #64748b; margin-bottom: 45px; line-height: 1.7; }
.hero-client { display: inline-flex; align-items: center; gap: 20px; padding: 25px 50px; background: white; border-radius: 20px; box-shadow: 0 15px 50px rgba(0,0,0,0.1); }
.hero-client img { height: 50px; border-radius: 10px; }
.hero-client-name { font-size: 1.6rem; font-weight: 700; background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-info { margin-top: 55px; color: #94a3b8; font-size: 0.95rem; line-height: 1.7; }

/* Ad Previews */
.ad-preview { background: white; border-radius: 16px; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
.ad-preview-google { border-left: 4px solid #4285f4; }
.ad-preview-meta { border-left: 4px solid #1877f2; }
.ad-preview-label { font-size: 0.8rem; color: #64748b; margin-bottom: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

/* Budget Cards */
.budget-card { background: white; border-radius: 20px; padding: 35px; text-align: center; border: 2px solid #e2e8f0; transition: all 0.3s; }
.budget-card:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
.budget-card.featured { border-color: #FF6B35; background: linear-gradient(135deg, #fff7ed, #fef2f2); transform: scale(1.05); position: relative; }
.budget-card.featured::before { content: "⭐ Odporúčame"; position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; padding: 6px 20px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.budget-label { color: #64748b; font-size: 0.9rem; margin-bottom: 8px; }
.budget-value { font-size: 3rem; font-weight: 800; color: #1a1a2e; }
.budget-card.featured .budget-value { background: linear-gradient(135deg, #FF6B35, #E91E63); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.budget-period { color: #94a3b8; font-size: 0.85rem; margin-bottom: 25px; }
.budget-stats { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: left; }
.budget-stat { display: flex; justify-content: space-between; padding: 10px 0; }
.budget-stat-label { color: #64748b; }
.budget-stat-value { font-weight: 600; }

@media (max-width: 768px) {
  .page { padding: 100px 25px 60px; }
  .header { padding: 12px 20px; }
  .grid-2, .grid-3, .grid-4, .swot-grid { grid-template-columns: 1fr; }
  .hero { padding: 40px 20px; }
  .hero-title { font-size: 2rem; }
  .hero-client { padding: 20px 30px; flex-direction: column; text-align: center; }
  .section-title { font-size: 1.5rem; }
  .cta-section { padding: 40px 25px; }
  .cta-title { font-size: 1.8rem; }
  .package-card.featured { transform: none; }
  .budget-card.featured { transform: none; }
}

@media print {
  .header { position: relative; }
  .page { min-height: auto; page-break-after: always; padding: 40px; }
}
</style>
</head>
<body>

<!-- Fixed Header -->
<header class="header">
  <img src="${this.LOGO}" alt="Adlify" class="header-logo" onerror="this.outerHTML='<span style=\\'font-size:1.5rem;font-weight:800;background:linear-gradient(135deg,#FF6B35,#E91E63);-webkit-background-clip:text;-webkit-text-fill-color:transparent;\\'>ADLIFY</span>'">
  <div class="header-right">
    <div class="header-client">
      ${clientLogo ? `<img src="${clientLogo}" alt="${c.name}" onerror="this.style.display='none'">` : ''}
      <span>Pripravené pre ${c.name || lead.company_name}</span>
    </div>
  </div>
</header>

<!-- Page 1: Hero -->
<section class="hero">
  <div class="hero-content">
    <img src="${this.LOGO}" alt="Adlify" class="hero-logo" onerror="this.outerHTML='<div style=\\'font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,#FF6B35,#E91E63);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:40px;\\'>ADLIFY</div>'">
    <div class="hero-badge">📊 Personalizovaná analýza & stratégia</div>
    <h1 class="hero-title">Návrh <span class="gradient-text">marketingovej stratégie</span></h1>
    <p class="hero-subtitle">Komplexná analýza vašej online prítomnosti, identifikácia príležitostí a konkrétne odporúčania pre rast vášho podnikania prostredníctvom online reklamy</p>
    <div class="hero-client">
      ${clientLogo ? `<img src="${clientLogo}" alt="${c.name}" onerror="this.style.display='none'">` : ''}
      <span class="hero-client-name">${c.name || lead.company_name || lead.domain}</span>
    </div>
    <p class="hero-info">V tejto prezentácii nájdete detailnú analýzu vášho podnikania, zhodnotenie aktuálnej online prítomnosti, identifikované príležitosti a konkrétny akčný plán ako získať viac zákazníkov cez online reklamu.</p>
  </div>
</section>

<!-- Page 2: About Company -->
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">1</span> O vašej firme</h2>
    <div class="section-divider"></div>
    
    <div class="card card-highlight">
      <p style="font-size: 1.15rem; line-height: 1.9; color: #374151;">${c.description || 'Váš popis firmy bude doplnený na základe analýzy.'}</p>
    </div>
    
    ${c.services?.length ? `
    <h3 style="margin: 40px 0 20px; font-size: 1.3rem; font-weight: 700; color: #1a1a2e;">🛠️ Vaše služby a produkty</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 12px;">
      ${c.services.map(s => `<span class="tag tag-gradient">${s}</span>`).join('')}
    </div>
    ` : ''}
    
    ${c.targetCustomers ? `
    <h3 style="margin: 40px 0 20px; font-size: 1.3rem; font-weight: 700; color: #1a1a2e;">👥 Vaši ideálni zákazníci</h3>
    <p style="color: #64748b; font-size: 1.05rem; line-height: 1.8;">${c.targetCustomers}</p>
    ` : ''}
  </div>
</section>

<!-- Page 3: Our Findings -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">2</span> Čo sme zistili</h2>
    <div class="section-divider"></div>
    
    ${a.humanWrittenIntro ? `
    <div class="card card-highlight" style="margin-bottom: 40px;">
      <p style="font-size: 1.1rem; line-height: 1.9; color: #374151;">${a.humanWrittenIntro}</p>
    </div>
    ` : ''}
    
    ${a.strengths?.length ? `
    <h3 style="margin-bottom: 25px; font-size: 1.3rem; font-weight: 700; color: #1a1a2e;">✅ Vaše silné stránky</h3>
    <div class="grid-2" style="margin-bottom: 40px;">
      ${a.strengths.map(str => `
        <div class="card">
          <h4 style="color: #166534; margin-bottom: 12px; font-weight: 700; font-size: 1.1rem;">${str.title || str}</h4>
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

<!-- Page 4: Online Presence -->
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">3</span> Vaša online prítomnosť</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${o.summary || 'Zhodnotenie vašej aktuálnej prítomnosti na webe a sociálnych sieťach.'}</p>
    
    <div class="grid-4" style="margin-bottom: 40px;">
      <div class="stat-box">
        <div class="stat-icon">${o.website?.exists ? '✅' : '❌'}</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 5px;">Webstránka</div>
        <div class="stat-label">${o.website?.quality || (o.website?.exists ? 'Aktívna' : 'Chýba')}</div>
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
    
    <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8; text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">📌 Kompletnú analýzu webu vrátane technického SEO auditu pripravíme po objednaní služby</p>
  </div>
</section>

<!-- Page 5: SWOT -->
${a.swot ? `
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">4</span> SWOT Analýza</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Strategická analýza silných a slabých stránok, príležitostí a hrozieb pre vaše podnikanie.</p>
    
    <div class="swot-grid">
      <div class="swot-box swot-strengths">
        <h4>💪 Silné stránky</h4>
        <ul>${a.swot.strengths?.map(s => `<li>• ${s}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-weaknesses">
        <h4>⚠️ Slabé stránky</h4>
        <ul>${a.swot.weaknesses?.map(w => `<li>• ${w}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-opportunities">
        <h4>🚀 Príležitosti</h4>
        <ul>${a.swot.opportunities?.map(o => `<li>• ${o}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
      <div class="swot-box swot-threats">
        <h4>⚡ Hrozby</h4>
        <ul>${a.swot.threats?.map(t => `<li>• ${t}</li>`).join('') || '<li>Žiadne údaje</li>'}</ul>
      </div>
    </div>
  </div>
</section>
` : ''}

<!-- Page 6: Keywords -->
${k.topKeywords?.length ? `
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">5</span> Kľúčové slová</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Identifikovali sme relevantné kľúčové slová pre vaše podnikanie. Tu je ukážka top ${Math.min(k.topKeywords.length, 10)}:</p>
    
    <table class="data-table">
      <thead>
        <tr>
          <th style="border-radius: 12px 0 0 0;">Kľúčové slovo</th>
          <th style="text-align: center;">Mesačná hľadanosť</th>
          <th style="text-align: center;">Konkurencia</th>
          <th style="text-align: right; border-radius: 0 12px 0 0;">Cena za klik</th>
        </tr>
      </thead>
      <tbody>
        ${k.topKeywords.slice(0, 10).map(kw => `
          <tr>
            <td><strong style="color: #1a1a2e;">${kw.keyword}</strong></td>
            <td style="text-align: center; font-weight: 600;">${kw.searchVolume}</td>
            <td style="text-align: center;"><span class="tag ${kw.competition === 'nízka' ? 'tag-success' : kw.competition === 'vysoká' ? 'tag-warning' : 'tag-light'}">${kw.competition}</span></td>
            <td style="text-align: right; font-weight: 700; color: #FF6B35;">${kw.cpc}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    ${k.topKeywords.length > 10 ? `<p style="margin-top: 25px; font-size: 0.9rem; color: #94a3b8; text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">📌 Máme pripravených ďalších <strong>${Math.max(k.topKeywords.length - 10, 30)}+</strong> kľúčových slov vrátane long-tail príležitostí. Kompletný zoznam dostanete po objednaní služby.</p>` : `<p style="margin-top: 25px; font-size: 0.9rem; color: #94a3b8; text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">📌 Máme pripravených ďalších <strong>30+</strong> kľúčových slov vrátane long-tail príležitostí. Kompletný zoznam dostanete po objednaní služby.</p>`}
  </div>
</section>
` : ''}

<!-- Page 7: Strategy -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">6</span> Navrhovaná stratégia</h2>
    <div class="section-divider"></div>
    
    <div class="grid-2" style="margin-bottom: 35px;">
      <div class="card">
        <h4 style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; color: #1a1a2e;">📱 Odporúčané platformy</h4>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          ${(s.recommendedPlatforms || ['Google Ads', 'Facebook/Instagram']).map(p => `<span class="tag tag-gradient">${p}</span>`).join('')}
        </div>
      </div>
      <div class="card">
        <h4 style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; color: #1a1a2e;">🎯 Hlavný cieľ</h4>
        <p style="color: #64748b; font-size: 1.05rem; line-height: 1.7;">${s.primaryGoal || 'Generovanie kvalifikovaných dopytov a zvýšenie povedomia o značke'}</p>
      </div>
    </div>
    
    ${s.targetAudience ? `
    <div class="card">
      <h4 style="margin-bottom: 25px; font-weight: 700; font-size: 1.1rem; color: #1a1a2e;">👥 Cieľová skupina</h4>
      <div class="grid-3">
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Demografia</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.demographics || 'Bude upresnené'}</p>
        </div>
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Záujmy</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.interests?.join(', ') || 'Bude upresnené'}</p>
        </div>
        <div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Správanie</p>
          <p style="font-weight: 600; color: #1a1a2e;">${s.targetAudience.behaviors?.join(', ') || 'Bude upresnené'}</p>
        </div>
      </div>
    </div>
    ` : ''}
  </div>
</section>

<!-- Page 8: Ad Examples -->
${camp.google || camp.meta ? `
<section class="page page-white">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">7</span> Návrhy reklám</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">Ukážky reklám, ktoré pre vás pripravíme. Finálne verzie budú prispôsobené vašim potrebám.</p>
    
    <div class="grid-2">
      ${camp.google?.searchCampaign ? `
      <div>
        <h4 style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; color: #4285f4;">🔍 Google Ads - Vyhľadávanie</h4>
        <div class="ad-preview ad-preview-google">
          <div class="ad-preview-label">Náhľad reklamy vo vyhľadávaní</div>
          <p style="color: #1a0dab; font-size: 1.2rem; margin-bottom: 8px; font-weight: 600;">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.headlines?.[0] || 'Váš Headline'}</p>
          <p style="color: #006621; font-size: 0.9rem; margin-bottom: 12px;">Ad · www.${lead.domain || 'example.sk'}</p>
          <p style="color: #545454; font-size: 0.95rem; line-height: 1.6;">${camp.google.searchCampaign.adGroups?.[0]?.adCopy?.descriptions?.[0] || 'Váš popis reklamy bude tu.'}</p>
        </div>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 15px;">Keywords: ${camp.google.searchCampaign.adGroups?.[0]?.keywords?.slice(0, 3).join(', ') || 'Budú doplnené'}</p>
      </div>
      ` : ''}
      
      ${camp.meta?.campaign ? `
      <div>
        <h4 style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; color: #1877f2;">📘 Facebook / Instagram</h4>
        <div class="ad-preview ad-preview-meta">
          <div class="ad-preview-label">Náhľad reklamy</div>
          <p style="font-size: 0.95rem; margin-bottom: 20px; color: #1a1a2e; line-height: 1.6;">${camp.meta.campaign.adSets?.[0]?.adCopy?.primaryText || 'Text vašej reklamy bude tu.'}</p>
          <div style="background: #f0f2f5; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
            <p style="font-weight: 700; margin-bottom: 5px; font-size: 1.05rem;">${camp.meta.campaign.adSets?.[0]?.adCopy?.headline || 'Váš Headline'}</p>
            <p style="font-size: 0.9rem; color: #64748b;">${camp.meta.campaign.adSets?.[0]?.adCopy?.description || 'Váš popis'}</p>
          </div>
          <span class="tag tag-gradient">${camp.meta.campaign.adSets?.[0]?.adCopy?.cta || 'Zistiť viac'}</span>
        </div>
      </div>
      ` : ''}
    </div>
    
    <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8; text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">📌 Toto sú ukážkové reklamy. Finálne verzie vrátane profesionálnych vizuálov vytvoríme na mieru po objednaní.</p>
  </div>
</section>
` : ''}

<!-- Page 9: Budget -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">8</span> Odporúčaný rozpočet na reklamu</h2>
    <div class="section-divider"></div>
    <p class="section-subtitle">${b.analysis || 'Na základe analýzy kľúčových slov a konkurencie sme pripravili tri varianty rozpočtu pre vaše kampane.'}</p>
    
    <div class="grid-3">
      <div class="budget-card">
        <div class="budget-label">Štart</div>
        <div class="budget-value">${b.recommendations?.starter?.adSpend || 300}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.starter?.expectedClicks || 400}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.starter?.expectedConversions || '15-25'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.starter?.cpa || '12-20€'}</span></div>
        </div>
      </div>
      
      <div class="budget-card featured">
        <div class="budget-label" style="color: #FF6B35;">Optimum</div>
        <div class="budget-value">${b.recommendations?.recommended?.adSpend || 500}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.recommended?.expectedClicks || 700}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.recommended?.expectedConversions || '30-45'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.recommended?.cpa || '11-17€'}</span></div>
        </div>
      </div>
      
      <div class="budget-card">
        <div class="budget-label">Agresívny rast</div>
        <div class="budget-value">${b.recommendations?.aggressive?.adSpend || 800}€</div>
        <div class="budget-period">mesačne na reklamu</div>
        <div class="budget-stats">
          <div class="budget-stat"><span class="budget-stat-label">Očakávané kliky</span><span class="budget-stat-value">~${b.recommendations?.aggressive?.expectedClicks || 1200}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Očakávané dopyty</span><span class="budget-stat-value">~${b.recommendations?.aggressive?.expectedConversions || '50-70'}</span></div>
          <div class="budget-stat"><span class="budget-stat-label">Cena za dopyt</span><span class="budget-stat-value">${b.recommendations?.aggressive?.cpa || '10-15€'}</span></div>
        </div>
      </div>
    </div>
    
    <div style="margin-top: 35px; padding: 25px; background: white; border-radius: 16px; border-left: 4px solid #3b82f6;">
      <p style="font-size: 1rem; color: #1a1a2e;"><strong>💡 Dôležité:</strong> Reklamný rozpočet platíte priamo Google alebo Facebook. <strong>Nie je súčasťou ceny za správu kampaní.</strong> Máte nad ním plnú kontrolu a môžete ho kedykoľvek upraviť.</p>
    </div>
  </div>
</section>

<!-- Page 10: ROI -->
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
      <h4 style="margin-bottom: 25px; font-weight: 700; font-size: 1.1rem; color: #1a1a2e;">📊 Predpoklady výpočtu</h4>
      <div class="grid-3">
        <div style="text-align: center; padding: 20px;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px;">Priemerná hodnota objednávky</p>
          <p style="font-size: 1.8rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.averageOrderValue || 'N/A'}€</p>
        </div>
        <div style="text-align: center; padding: 20px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px;">Konverzný pomer</p>
          <p style="font-size: 1.8rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.conversionRate || 'N/A'}</p>
        </div>
        <div style="text-align: center; padding: 20px;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px;">Hodnota zákazníka (LTV)</p>
          <p style="font-size: 1.8rem; font-weight: 700; color: #1a1a2e;">${r.assumptions?.customerLifetimeValue || 'N/A'}€</p>
        </div>
      </div>
    </div>
  </div>
</section>
` : ''}

<!-- Page 11: Timeline -->
<section class="page page-gray">
  <div class="page-content">
    <h2 class="section-title"><span class="section-badge">10</span> Časový plán</h2>
    <div class="section-divider"></div>
    
    <div class="timeline">
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 1</div>
          <div class="timeline-desc">${timeline.week1 || 'Audit existujúcej web stránky, nastavenie Google Ads a Meta Ads účtov, tracking implementácia'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 2</div>
          <div class="timeline-desc">${timeline.week2 || 'Spustenie search kampaní, prvé A/B testy ad copy, optimalizácia landing pages'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Týždeň 3-4</div>
          <div class="timeline-desc">${timeline.week3_4 || 'Rozšírenie o display kampane, remarketing nastavenie, testovanie rôznych audience'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Mesiac 2</div>
          <div class="timeline-desc">${timeline.month2 || 'Rozšírenie keyword listu, škálovanie úspešných kampaní, case studies tvorba'}</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-card">
          <div class="timeline-title">Mesiac 3+</div>
          <div class="timeline-desc">${timeline.month3 || 'Plná optimalizácia na základe dát, scaling successful campaigns, SEO odporúčania'}</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Page 12: Benefits -->
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

<!-- Page 13: Packages -->
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

<!-- Page 14: CTA -->
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
  <p style="margin-bottom: 10px;">© ${new Date().getFullYear()} Adlify.eu | Vytvorené s ❤️ pre <strong>${c.name || lead.company_name}</strong></p>
  <p style="font-size: 0.85rem; color: #94a3b8;">Táto prezentácia je dôverná a je určená výhradne pre ${c.name || lead.company_name}</p>
</footer>

</body>
</html>`;
  },

  async handleImport() {
    const textarea = document.getElementById('import-domains');
    const text = textarea.value.trim();
    if (!text) return Utils.toast('Zadaj domény', 'warning');
    const domains = text.split('\n').map(d => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(d => d.includes('.'));
    let added = 0, skipped = 0;
    for (const domain of domains) {
      try {
        // Kontrola duplicity
        const { data: existing } = await Database.client
          .from('leads')
          .select('id')
          .eq('domain', domain)
          .limit(1);
        
        if (existing && existing.length > 0) { 
          skipped++; 
          continue; 
        }
        
        await Database.insert('leads', { domain, company_name: domain.split('.')[0], status: 'new', score: 50 });
        added++;
      } catch (e) { console.error('Import error:', e); }
    }
    Utils.toast(`Pridaných: ${added}, Preskočených (duplicity): ${skipped}`, 'success');
    textarea.value = '';
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },

  // Import type switcher
  showImportType(type) {
    document.querySelectorAll('.import-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`import-${type}-section`)?.classList.remove('hidden');
    document.querySelectorAll('.import-option').forEach(o => o.classList.remove('active'));
    event.currentTarget?.classList.add('active');
  },

  // Marketing Miner import
  async handleMinerImport() {
    const textarea = document.getElementById('import-miner-data');
    const text = textarea.value.trim();
    if (!text) return Utils.toast('Vložte dáta z Marketing Miner', 'warning');
    
    let leads = [];
    
    try {
      // Try JSON first
      if (text.startsWith('[') || text.startsWith('{')) {
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : (data.results || data.data || [data]);
        leads = items.map(item => ({
          domain: (item.domain || item.url || item.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          company_name: item.company_name || item.companyName || item.name || item.title || '',
          email: item.email || item.emails?.[0] || '',
          phone: item.phone || item.phones?.[0] || item.telephone || '',
          industry: item.industry || item.category || '',
          city: item.city || item.location || ''
        })).filter(l => l.domain);
      } else {
        // Try CSV
        const lines = text.split('\n').filter(l => l.trim());
        const header = lines[0].toLowerCase().split(/[,;\t]/);
        const domainIdx = header.findIndex(h => h.includes('domain') || h.includes('url') || h.includes('web'));
        const nameIdx = header.findIndex(h => h.includes('name') || h.includes('company') || h.includes('firma'));
        const emailIdx = header.findIndex(h => h.includes('email') || h.includes('mail'));
        const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('tel'));
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/[,;\t]/);
          const domain = (cols[domainIdx] || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/"/g, '');
          if (domain && domain.includes('.')) {
            leads.push({
              domain,
              company_name: (cols[nameIdx] || domain.split('.')[0]).replace(/"/g, ''),
              email: (cols[emailIdx] || '').replace(/"/g, ''),
              phone: (cols[phoneIdx] || '').replace(/"/g, '')
            });
          }
        }
      }
    } catch (e) {
      console.error('Parse error:', e);
      return Utils.toast('Nepodarilo sa spracovať dáta. Skontrolujte formát.', 'error');
    }
    
    if (leads.length === 0) return Utils.toast('Žiadne platné leady v dátach', 'warning');
    
    let added = 0, skipped = 0;
    for (const lead of leads) {
      try {
        const { data: existing } = await Database.client
          .from('leads')
          .select('id')
          .eq('domain', lead.domain)
          .limit(1);
        
        if (existing && existing.length > 0) { skipped++; continue; }
        
        await Database.insert('leads', {
          domain: lead.domain,
          company_name: lead.company_name || lead.domain.split('.')[0],
          email: lead.email || null,
          phone: lead.phone || null,
          industry: lead.industry || null,
          city: lead.city || null,
          status: 'new',
          score: 50
        });
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

  // CSV file handling
  csvData: null,
  
  handleCSVSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        Utils.toast('CSV je prázdny alebo má len hlavičku', 'warning');
        return;
      }
      
      const header = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const preview = lines.slice(1, 4).map(line => {
        const cols = line.split(/[,;\t]/);
        return header.map((h, i) => `${h}: ${(cols[i] || '').replace(/"/g, '')}`).join(', ');
      });
      
      this.csvData = { text, header, count: lines.length - 1 };
      
      document.getElementById('csv-preview').innerHTML = `
        <div class="csv-preview-box">
          <p><strong>${this.csvData.count} riadkov</strong></p>
          <p class="preview-header">Stĺpce: ${header.join(', ')}</p>
          <p class="preview-sample">Ukážka: ${preview[0]}</p>
        </div>
      `;
      document.getElementById('csv-import-btn').disabled = false;
    };
    reader.readAsText(file);
  },

  async handleCSVImport() {
    if (!this.csvData) return Utils.toast('Najprv vyberte CSV súbor', 'warning');
    
    const lines = this.csvData.text.split('\n').filter(l => l.trim());
    const header = this.csvData.header;
    
    const domainIdx = header.findIndex(h => h.includes('domain') || h.includes('url') || h.includes('web'));
    const nameIdx = header.findIndex(h => h.includes('name') || h.includes('company') || h.includes('firma'));
    const emailIdx = header.findIndex(h => h.includes('email') || h.includes('mail'));
    const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('tel'));
    
    if (domainIdx === -1 && nameIdx === -1) {
      return Utils.toast('CSV musí obsahovať stĺpec domain alebo company_name', 'error');
    }
    
    let added = 0, skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/"/g, ''));
      const domain = (cols[domainIdx] || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      const name = cols[nameIdx] || domain?.split('.')[0] || '';
      
      if (!domain && !name) continue;
      
      try {
        if (domain) {
          const { data: existing } = await Database.client
            .from('leads')
            .select('id')
            .eq('domain', domain)
            .limit(1);
          if (existing && existing.length > 0) { skipped++; continue; }
        }
        
        await Database.insert('leads', {
          domain: domain || `${name.toLowerCase().replace(/\s+/g, '-')}.local`,
          company_name: name,
          email: cols[emailIdx] || null,
          phone: cols[phoneIdx] || null,
          status: 'new',
          score: 50
        });
        added++;
      } catch (e) { console.error('Import error:', e); }
    }
    
    Utils.toast(`Pridaných: ${added}, Preskočených: ${skipped}`, 'success');
    this.csvData = null;
    document.getElementById('csv-preview').innerHTML = '';
    document.getElementById('csv-import-btn').disabled = true;
    document.getElementById('import-csv-file').value = '';
    await this.loadLeads();
    this.showTab('list');
    document.getElementById('leads-list').innerHTML = this.renderLeadsList();
    document.getElementById('leads-count').textContent = this.leads.length;
  },

  async handleAdd() {
    const name = document.getElementById('add-name').value.trim();
    if (!name) return Utils.toast('Zadaj názov firmy', 'warning');
    const domain = document.getElementById('add-domain').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const email = document.getElementById('add-email').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    const industry = document.getElementById('add-industry').value.trim();
    const city = document.getElementById('add-city').value.trim();
    
    // Kontrola duplicity podľa domény alebo názvu
    const checkDomain = domain || `${name.toLowerCase().replace(/\s+/g, '-')}.local`;
    try {
      const { data: existing } = await Database.client
        .from('leads')
        .select('id, company_name, domain')
        .or(`domain.eq.${checkDomain},company_name.ilike.${name}`)
        .limit(1);
      
      if (existing && existing.length > 0) {
        return Utils.toast(`Lead "${existing[0].company_name || existing[0].domain}" už existuje!`, 'warning');
      }
    } catch (e) {
      console.warn('Duplicate check failed:', e);
    }
    
    await Database.insert('leads', { 
      domain: checkDomain, 
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
    const proposalHtml = this.generateProposalHTML(lead, analysis);
    
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
