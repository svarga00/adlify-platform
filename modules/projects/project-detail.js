/**
 * Project Detail modul — celá podstránka projektu (namiesto modal-u).
 *
 * Route: #project?id=<uuid>&tab=<overview|strategy|campaigns|onboarding|deployment>
 *
 * Layout:
 *   ┌─ Sidebar (280px) ───┬─ Hlavná oblasť ─────────┐
 *   │ ← Späť na projekty  │ Breadcrumb + header     │
 *   │ ━━━━━━━━━━━━━━━━━━━ │ ━━━━━━━━━━━━━━━━━━━━━━ │
 *   │ ⬛ Prehľad          │ KPI cards (4)           │
 *   │ 🎯 Stratégia        │                          │
 *   │ 📣 Kampane          │ Obsah aktuálnej sekcie  │
 *   │ 🛬 Onboarding       │ (mení sa podľa tabu)    │
 *   │ 🚀 Deployment       │                          │
 *   │                     │                          │
 *   │ ━━━━━━━━━━━━━━━━━━━ │                          │
 *   │ Status: [▼]         │                          │
 *   │ ✏️ Upraviť          │                          │
 *   │ 🎨 Kreatívy         │                          │
 *   │ ✨ Pregenerovať     │                          │
 *   │ ✅ Schváliť         │                          │
 *   └─────────────────────┴──────────────────────────┘
 *
 * Implementácia: znova používa existujúce renderDetailContent z CampaignProjectsModule
 * (700+ riadkov obsahu tabov), len ho obtočí novým page layout-om.
 */
const ProjectDetailModule = {
  id: 'project',
  name: 'Detail projektu',
  icon: '📂',
  title: 'Detail projektu',
  subtitle: '',
  permissions: ['owner', 'admin', 'manager'],
  // Bez menu — dostupné len cez klik na projekt v #projects.

  projectId: null,
  currentTab: 'overview',
  _container: null,

  async render(container, params) {
    this._container = container;
    this.projectId = params.id;
    this.currentTab = params.tab || 'overview';

    if (!this.projectId) {
      container.innerHTML = this._renderError('Chýba ID projektu', 'Otvor projekt cez zoznam #projects.');
      return;
    }

    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;">⏳ Načítavam projekt…</div>';

    try {
      // Použij CampaignProjectsModule.loadData() ak ešte nemá dáta (cold load),
      // potom vyhľadaj projekt v jeho cache. Tým ho nemusíme duplicitne tahať.
      if (!window.CampaignProjectsModule?.projects?.length) {
        await window.CampaignProjectsModule?.loadData?.();
      }
      const project = window.CampaignProjectsModule?.projects?.find(p => p.id === this.projectId);
      if (!project) {
        // Fallback — projekt nie je v cache, načítaj priamo
        const { data } = await Database.client
          .from('campaign_projects').select('*').eq('id', this.projectId).maybeSingle();
        if (!data) throw new Error('Projekt nenájdený (id=' + this.projectId + ')');
        window.CampaignProjectsModule.selectedProject = data;
      } else {
        window.CampaignProjectsModule.selectedProject = project;
      }
      // Načítaj počet kampaní — slúži na rozhodnutie ktoré tlačidlá ukázať
      // v sidebar-i (Kreatívy & PDF dostupné len ak existujú kampane)
      try {
        const { count } = await Database.client.from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', this.projectId);
        this._campaignsCount = count || 0;
      } catch { this._campaignsCount = 0; }
      await this._renderApp();
    } catch (e) {
      console.error('[project-detail] render error:', e);
      container.innerHTML = this._renderError('Chyba pri načítaní', e.message);
    }
  },

  async _renderApp() {
    const project = window.CampaignProjectsModule.selectedProject;
    if (!project) return;

    const statusMeta = (window.CampaignProjectsModule.STATUSES || {})[project.status] || { label: project.status, color: 'gray', icon: '•' };

    // Reuse existing renderDetailContent — generuje VŠETKY taby v jednom HTML
    // (kazdy obalený v <div data-tab-content="X" class="hidden">). My nižšie
    // priamo do DOM-u skryjeme všetky okrem aktuálneho.
    const contentHTML = await window.CampaignProjectsModule.renderDetailContent(project);

    this._container.innerHTML = `
      ${this._modernThemeCSS()}
      <div class="adl-pd" style="display:grid;grid-template-columns:280px 1fr;gap:0;min-height:calc(100vh - 100px);background:#f7f5f1;">
        ${this._renderSidebar(project, statusMeta)}
        <main id="project-detail-main" style="overflow-y:auto;padding:24px 32px;">
          ${this._renderBreadcrumb(project, statusMeta)}
          <div id="detail-content">
            ${contentHTML}
            <!-- Tracking tab — injected ako extra tab content -->
            <div data-tab-content="tracking" class="space-y-6 hidden">
              ${this._renderTrackingTab(project)}
            </div>
            <!-- Brand tab — farby, logo, font pre AI generovanie -->
            <div data-tab-content="brand" class="space-y-6 hidden">
              <div id="brand-tab-host"><div style="padding:24px;color:#9ca3af;text-align:center;">⏳ Načítavam…</div></div>
            </div>
          </div>
        </main>
      </div>
    `;

    // Skry všetky taby okrem aktuálneho
    this._switchTabUI(this.currentTab);
    // Ak existujú lucide ikonky, refresh
    if (window.lucide?.createIcons) window.lucide.createIcons();
  },

  // Modern theme — tvrdo override-uje farebné triedy z renderDetailContent
  // ktoré používa Tailwind-like utility (bg-purple-50 atď). Cieľom je jednotný
  // tichý monochromatický vzhľad s len jednou akcentnou farbou (brand orange),
  // jemné borders namiesto color blokov, lepšia typografia.
  _modernThemeCSS() {
    return `<style>
      /* === MODERN PROJECT DETAIL THEME === */
      .adl-pd { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; color: #14120e; }
      .adl-pd #detail-content { letter-spacing: -0.005em; }

      /* Karty — tichá biela s jemným borderom */
      .adl-pd .card,
      .adl-pd [class*='bg-gray-50'],
      .adl-pd [class*='bg-purple-50'],
      .adl-pd [class*='bg-green-50'],
      .adl-pd [class*='bg-amber-50'],
      .adl-pd [class*='bg-blue-50'],
      .adl-pd [class*='bg-yellow-50'],
      .adl-pd [class*='bg-orange-50'],
      .adl-pd [class*='bg-red-50'],
      .adl-pd [class*='bg-indigo-50'] {
        background: #ffffff !important;
        border: 1px solid #eae6de !important;
        border-radius: 12px !important;
        box-shadow: none !important;
      }

      /* Vnorené sekcie (insights v karte) — ešte tichšie */
      .adl-pd .card .bg-gray-50,
      .adl-pd .card [class*='bg-purple-50'],
      .adl-pd .card [class*='bg-green-50'],
      .adl-pd .card [class*='bg-amber-50'],
      .adl-pd .card [class*='bg-blue-50'] {
        background: #fafaf8 !important;
        border: 1px solid #f0ebe2 !important;
      }

      /* Levostranný akcent pre semantické bloky — Zistenia / Príležitosti / Výzvy */
      .adl-pd [class*='bg-green-50']:not(.card) { border-left: 3px solid #84cc16 !important; }
      .adl-pd [class*='bg-amber-50']:not(.card) { border-left: 3px solid #f59e0b !important; }
      .adl-pd [class*='bg-purple-50']:not(.card) { border-left: 3px solid #FF6B35 !important; }
      .adl-pd [class*='bg-blue-50']:not(.card) { border-left: 3px solid #3b82f6 !important; }

      /* Text farby — všetko jednotná tmavá, akcenty jemné */
      .adl-pd .text-purple-700, .adl-pd .text-purple-800,
      .adl-pd .text-green-700, .adl-pd .text-green-800,
      .adl-pd .text-amber-700, .adl-pd .text-amber-900,
      .adl-pd .text-blue-700, .adl-pd .text-blue-800, .adl-pd .text-blue-900,
      .adl-pd .text-orange-700, .adl-pd .text-orange-800,
      .adl-pd .text-yellow-700, .adl-pd .text-yellow-800 {
        color: #14120e !important;
      }
      .adl-pd .text-gray-500 { color: #6b7280 !important; font-weight: 500; }
      .adl-pd .text-gray-600 { color: #4b5563 !important; }

      /* Typografia — väčšie nadpisy, lepšia hierarchia */
      .adl-pd .card h4 { font-size: 13px !important; font-weight: 600 !important; color: #14120e !important; letter-spacing: -0.005em; margin-bottom: 14px !important; padding-bottom: 12px; border-bottom: 1px solid #f0ebe2; }
      .adl-pd .card h5 { font-size: 10px !important; font-weight: 700 !important; color: #9ca3af !important; text-transform: uppercase; letter-spacing: 0.6px !important; }
      .adl-pd p { line-height: 1.6 !important; color: #374151; font-size: 13.5px; }
      .adl-pd .card p { margin-bottom: 0; }

      /* Chips — minimalistické, žiadne bujaré farby */
      .adl-pd .rounded-full {
        background: #f7f5f1 !important;
        color: #14120e !important;
        border: 1px solid #eae6de !important;
        font-weight: 500 !important;
        font-size: 11.5px !important;
      }
      /* Sémantické chips — len jemný akcent v texte */
      .adl-pd .bg-green-100, .adl-pd .bg-yellow-100, .adl-pd .bg-blue-100, .adl-pd .bg-purple-100, .adl-pd .bg-red-50 {
        background: #f7f5f1 !important;
        color: #14120e !important;
      }
      .adl-pd .bg-red-50 { color: #b91c1c !important; }

      /* KPI cards v Prehľade */
      .adl-pd .grid > .bg-white.border {
        background: #ffffff !important;
        border: 1px solid #eae6de !important;
        border-radius: 12px !important;
        padding: 16px !important;
        transition: border-color 0.15s;
      }
      .adl-pd .grid > .bg-white.border:hover { border-color: #d4cebe !important; }
      .adl-pd .text-xl.font-bold { font-size: 22px !important; font-weight: 700 !important; letter-spacing: -0.02em; color: #14120e !important; }
      .adl-pd .text-xs.text-gray-500 { font-size: 11px !important; color: #9ca3af !important; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

      /* Status pill v overview — schovať (máme ho v sidebari) */
      .adl-pd #detail-content > .space-y-6 > .bg-gray-50.rounded-xl:first-child { display: none; }

      /* Tab nav — schovať pôvodný (máme sidebar) */
      .adl-pd #detail-content .border-b.overflow-x-auto { display: none !important; }

      /* Spacing */
      .adl-pd #detail-content > .space-y-6 > * { margin-bottom: 16px; }
      .adl-pd .card { padding: 18px 20px !important; }

      /* Tabuľky */
      .adl-pd table thead tr { border-bottom: 1px solid #eae6de !important; }
      .adl-pd table th { color: #9ca3af !important; font-size: 10.5px !important; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 6px !important; }
      .adl-pd table td { border-bottom: 1px solid #f5f1ea !important; padding: 10px 6px !important; font-size: 13px; }
      .adl-pd table tr:hover td { background: #faf8f4 !important; }

      /* Tlačidlá v obsahu — jemnejšie */
      .adl-pd .bg-purple-600, .adl-pd .bg-blue-600, .adl-pd .bg-green-600 {
        background: #14120e !important; color: white !important;
      }
      .adl-pd .bg-purple-600:hover, .adl-pd .bg-blue-600:hover, .adl-pd .bg-green-600:hover {
        background: #FF6B35 !important;
      }

      /* Klient portal link — prominentnejší akcent */
      .adl-pd .bg-blue-50.border.border-blue-200 {
        background: linear-gradient(135deg, #fff7ed, #fef3e6) !important;
        border: 1px solid #fed7aa !important;
        border-left: 3px solid #FF6B35 !important;
      }

      /* Feedback od klienta */
      .adl-pd .bg-orange-50.border.border-orange-200 {
        background: #fff7ed !important;
        border: 1px solid #fed7aa !important;
        border-left: 3px solid #f97316 !important;
      }

      /* Onboarding warning */
      .adl-pd .bg-yellow-50.border.border-yellow-200 {
        background: #fffbeb !important;
        border: 1px solid #fde68a !important;
        border-left: 3px solid #f59e0b !important;
      }

      /* ───── Markdown rendered stratégia ───── */
      .adl-pd .md-content > * + * { margin-top: 12px; }
      .adl-pd .md-h { font-size: 14px !important; font-weight: 700 !important; color: #FF6B35 !important; letter-spacing: -0.005em; line-height: 1.3; margin: 22px 0 8px !important; padding-bottom: 8px; border-bottom: 1px solid #f0ebe2; text-transform: none !important; }
      .adl-pd .md-content > .md-h:first-child { margin-top: 0 !important; }
      .adl-pd .md-h2 { font-size: 13px !important; font-weight: 700 !important; color: #14120e !important; margin: 16px 0 6px !important; }
      .adl-pd .md-p { font-size: 13.5px !important; line-height: 1.65 !important; color: #374151 !important; margin-bottom: 0 !important; }
      .adl-pd .md-p strong { color: #14120e !important; font-weight: 600 !important; }
      .adl-pd .md-ul { list-style: none !important; padding-left: 0 !important; margin: 6px 0 12px !important; }
      .adl-pd .md-li { font-size: 13.5px !important; line-height: 1.6 !important; color: #374151 !important; padding: 4px 0 4px 22px !important; position: relative; }
      .adl-pd .md-li::before { content: ''; position: absolute; left: 6px; top: 13px; width: 5px; height: 5px; border-radius: 50%; background: #FF6B35; }
      .adl-pd .md-li strong { color: #14120e !important; font-weight: 600 !important; }
    </style>`;
  },

  _renderSidebar(project, statusMeta) {
    const tabs = [
      { id: 'overview',    icon: '⬛', label: 'Prehľad' },
      { id: 'strategy',    icon: '🎯', label: 'Stratégia' },
      { id: 'campaigns',   icon: '📣', label: 'Kampane' },
      { id: 'brand',       icon: '🎨', label: 'Brand' },
      { id: 'tracking',    icon: '📈', label: 'Tracking' },
      { id: 'onboarding',  icon: '🛬', label: 'Onboarding' },
      { id: 'deployment',  icon: '🚀', label: 'Deployment' },
    ];

    const STATUSES = window.CampaignProjectsModule?.STATUSES || {};
    const statusOptions = Object.entries(STATUSES).map(([key, val]) => `
      <option value="${key}" ${project.status === key ? 'selected' : ''}>${val.icon || ''} ${val.label || key}</option>
    `).join('');

    return `
      <aside style="background:#fff;border-right:1px solid #eae6de;overflow-y:auto;padding:16px;display:flex;flex-direction:column;">
        <button onclick="window.location.hash='projects'"
          style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;color:#6b7280;font-size:13px;padding:6px 0;margin-bottom:12px;text-align:left;">
          <span style="font-size:16px;">←</span> Späť na projekty
        </button>

        <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Projekt</div>
        <div style="font-size:15px;font-weight:700;color:#14120e;margin-bottom:6px;word-wrap:break-word;">${this._esc(project.name || '')}</div>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;background:#${this._statusBgFor(statusMeta.color)};color:#${this._statusFgFor(statusMeta.color)};font-size:11px;font-weight:600;align-self:flex-start;margin-bottom:18px;">
          ${statusMeta.icon || '•'} ${this._esc(statusMeta.label)}
        </div>

        <nav style="display:flex;flex-direction:column;gap:2px;margin-bottom:20px;">
          ${tabs.map(t => `
            <button onclick="ProjectDetailModule.switchTab('${t.id}')"
              data-tab-btn="${t.id}"
              style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:none;background:${this.currentTab === t.id ? '#FF6B35' : 'transparent'};color:${this.currentTab === t.id ? '#fff' : '#374151'};border-radius:8px;font-size:13px;font-weight:${this.currentTab === t.id ? '600' : '500'};text-align:left;cursor:pointer;">
              <span style="font-size:14px;">${t.icon}</span>
              <span>${t.label}</span>
            </button>
          `).join('')}
        </nav>

        <!-- Status changer -->
        <div style="padding-top:16px;border-top:1px solid #eae6de;">
          <label style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Status</label>
          <select onchange="CampaignProjectsModule.changeStatus('${project.id}', this.value)"
            style="width:100%;padding:8px;border:1px solid #eae6de;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;">
            ${statusOptions}
          </select>
        </div>

        <!-- Akčné tlačidlá podľa statusu -->
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px;">
          ${this._renderActionButtons(project)}
        </div>

        <div style="flex:1;"></div>

        <!-- Footer akcie -->
        <div style="padding-top:14px;border-top:1px solid #eae6de;margin-top:12px;">
          <button onclick="CampaignProjectsModule.editProject('${project.id}')"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:12px;cursor:pointer;margin-bottom:4px;">
            ✏️ Upraviť projekt
          </button>
          <button onclick="if(confirm('Naozaj zmazať projekt?')) CampaignProjectsModule.deleteProject('${project.id}')"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:#fef2f2;color:#dc2626;border:none;border-radius:8px;font-size:12px;cursor:pointer;">
            🗑️ Zmazať projekt
          </button>
        </div>
      </aside>
    `;
  },

  // Akčné tlačidlá závisia od statusu — kopírujem logiku z renderDetailActions
  // ale rozdelené do sidebaru (zachovám aktuálne handlery).
  _renderActionButtons(project) {
    const id = project.id;
    const btn = (color, onClick, label) => `
      <button onclick="${onClick}"
        style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:${color.bg};color:${color.fg};border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;text-align:left;">
        ${label}
      </button>
    `;
    const c = {
      purple: { bg: '#f3e8ff', fg: '#6b21a8' },
      orange: { bg: '#fff7ed', fg: '#9a3412' },
      green:  { bg: '#dcfce7', fg: '#166534' },
      blue:   { bg: '#dbeafe', fg: '#1e40af' },
      indigo: { bg: '#e0e7ff', fg: '#3730a3' },
      grad:   { bg: 'linear-gradient(135deg,#FF6B35,#E91E63)', fg: '#fff' },
    };

    const buttons = [];

    // Kreatívy & PDF — dostupné VŽDY keď projekt má vygenerované kampane,
    // bez ohľadu na status. Predtým bolo viazané len na internal_review +
    // approved → ak status zostal 'draft' po neúspešnom flip-e, admin nevedel
    // editovať kreatívy.
    const hasCampaigns = (this._campaignsCount || 0) > 0;
    if (hasCampaigns) {
      buttons.push(btn(c.purple, `CampaignProjectsModule.openCreativesPage('${id}')`, '🎨 Kreatívy & prompty'));
      buttons.push(btn(c.blue,   `window.open('/.netlify/functions/proposal-html?project_id=${id}', '_blank')`, '📄 PDF náhľad'));
    }

    switch (project.status) {
      case 'draft':
        if (hasCampaigns) {
          // Projekt už má kampane (po prvom AI runu), ale status sa nepovýšil.
          // Daj adminovi quick action na povýšenie + možnosť pregenerovať.
          buttons.push(btn(c.green,  `CampaignProjectsModule.promoteToReview('${id}')`, '✅ Povýšiť na Kontrolu'));
          buttons.push(btn(c.orange, `CampaignProjectsModule.regenerateWithFeedback('${id}')`, '✏️ Pregenerovať s pripomienkami'));
        } else {
          buttons.push(btn(c.purple, `CampaignProjectsModule.startGeneration('${id}')`, '🤖 Spustiť AI generovanie'));
        }
        break;
      case 'internal_review':
        buttons.push(btn(c.orange, `CampaignProjectsModule.regenerateWithFeedback('${id}')`, '✏️ Pregenerovať s pripomienkami'));
        buttons.push(btn(c.green,  `CampaignProjectsModule.approveInternal('${id}')`, '✅ Schváliť pre klienta'));
        break;
      case 'client_review':
        buttons.push(btn(c.purple, `CampaignProjectsModule.generateClientLink('${id}')`, project.client_portal_token ? '🔗 Kopírovať odkaz' : '🔗 Generovať odkaz'));
        buttons.push(btn(c.green,  `CampaignProjectsModule.sendProposalToClient('${id}')`, '📧 Poslať klientovi email'));
        buttons.push(btn(c.blue,   `CampaignProjectsModule.previewAsClient('${id}')`, '👁️ Náhľad portálu'));
        break;
      case 'approved':
        buttons.push(btn(c.blue,   `CampaignProjectsModule.exportCampaigns('${id}','google_editor')`, '⬇️ Google Ads CSV'));
        buttons.push(btn(c.indigo, `CampaignProjectsModule.exportCampaigns('${id}','meta_csv')`, '⬇️ Meta Bulk CSV'));
        buttons.push(btn(c.grad,   `CampaignProjectsModule.deployProject('${id}')`, '🚀 Označiť ako nasadené'));
        break;
      case 'active':
        buttons.push(btn(c.orange, `CampaignProjectsModule.pauseProject('${id}')`, '⏸️ Pozastaviť'));
        buttons.push(btn(c.blue,   `CampaignProjectsModule.viewReport('${id}')`, '📊 Report'));
        break;
      case 'paused':
        buttons.push(btn(c.green,  `CampaignProjectsModule.resumeProject('${id}')`, '▶️ Obnoviť'));
        break;
    }
    return buttons.join('');
  },

  _renderBreadcrumb(project, statusMeta) {
    const clientName = project.client?.company_name || '';
    return `
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#6b7280;margin-bottom:16px;flex-wrap:wrap;">
        <a href="#projects" style="color:#6b7280;text-decoration:none;">Projekty</a>
        <span style="color:#d1d5db;">›</span>
        ${clientName ? `<span style="color:#14120e;font-weight:600;">${this._esc(clientName)}</span><span style="color:#d1d5db;">›</span>` : ''}
        <span style="color:#14120e;font-weight:600;">${this._esc(project.name)}</span>
        <span style="margin-left:auto;font-size:11px;color:#9ca3af;">Vytvorené: ${this._formatDate(project.created_at)}</span>
      </div>
    `;
  },

  switchTab(tabId) {
    this.currentTab = tabId;
    // Update URL (history-friendly)
    Router.navigate('project', { id: this.projectId, tab: tabId });
    this._switchTabUI(tabId);
  },

  // Tracking tab — pixel snippet ktorý admin pošle klientovi na vloženie
  // na web (cez GTM alebo priamo do <head>). Loguje konverzie cez
  // /.netlify/functions/track-conversion → tabuľka conversions →
  // campaign_metrics_daily → real-time portal reports.
  _renderTrackingTab(project) {
    const baseUrl = window.location.origin;
    const pixelSnippet = `<!-- Adlify konverzný pixel — ${this._esc(project.name)} -->
<script>
(function(){
  window.adlify = window.adlify || function(){(window.adlify.q=window.adlify.q||[]).push(arguments)};
  adlify.pid = '${project.id}';
  adlify.endpoint = '${baseUrl}/.netlify/functions/track-conversion';
  adlify.send = function(event, opts){
    opts = opts || {};
    var data = Object.assign({
      project_id: adlify.pid,
      event_type: event,
      page_url: location.href,
      gclid: new URLSearchParams(location.search).get('gclid'),
      fbclid: new URLSearchParams(location.search).get('fbclid'),
      utm_source: new URLSearchParams(location.search).get('utm_source'),
      utm_medium: new URLSearchParams(location.search).get('utm_medium'),
      utm_campaign: new URLSearchParams(location.search).get('utm_campaign'),
    }, opts);
    fetch(adlify.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data), keepalive: true}).catch(function(){});
  };
  // Auto-track page view
  adlify.send('page_view');
})();
</script>
<!-- /Adlify -->`;

    const usageExamples = `<!-- Príklady použitia po vložení snippetu vyššie -->

<!-- 1. Form submit (lead generation) -->
<form onsubmit="adlify.send('lead', {value: 50, content: 'kontakt-formular'})">
  ...
</form>

<!-- 2. Click-to-call -->
<a href="tel:+421900123456" onclick="adlify.send('call', {value: 30})">Zavolajte</a>

<!-- 3. Purchase (e-shop) -->
<script>
  // Na thank-you stránke po nákupe:
  adlify.send('purchase', {
    value: 250.00,        // suma objednávky
    currency: 'EUR',
    client_ref: 'ORD-12345'
  });
</script>

<!-- 4. Custom event -->
<button onclick="adlify.send('newsletter_signup')">Prihlásiť na newsletter</button>`;

    const pixelBeacon = `<!-- Alternatívne — pixel beacon (1×1 GIF) ak nemôžete použiť JS -->
<img src="${baseUrl}/.netlify/functions/track-conversion?p=${project.id}&t=page_view"
     width="1" height="1" alt="" style="display:none;">`;

    return `
      <div class="card">
        <h4>📈 Konverzný tracking</h4>
        <p style="color:#374151;margin-bottom:16px;">
          Vložením tohto kódu na klientov web budeme vedieť presne čo na ňom funguje. Konverzie z Google
          a Meta reklám sa pripoja automaticky cez <code>gclid</code> a <code>fbclid</code> parametre v URL.
          Posiela sa do <strong>conversions</strong> tabuľky a denne agreguje do <strong>campaign_metrics_daily</strong>.
        </p>

        <div style="background:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:18px;font-size:13px;color:#9a3412;">
          <strong>Návod pre klienta:</strong>
          <ol style="margin:6px 0 0 18px;padding:0;line-height:1.7;">
            <li>Skopírujte snippet nižšie</li>
            <li>Vložte ho do <code>&lt;head&gt;</code> tagu na všetkých stránkach (najlepšie cez Google Tag Manager)</li>
            <li>Na stránkach po konverzii (thank-you, potvrdenie objednávky) volajte <code>adlify.send('purchase', {value: 100})</code></li>
          </ol>
        </div>

        <h5 style="margin-top:16px;">1. Hlavný snippet</h5>
        <div style="position:relative;margin-bottom:8px;">
          <pre style="background:#14120e;color:#e5e7eb;padding:14px;border-radius:8px;overflow-x:auto;font-size:11.5px;line-height:1.5;max-height:280px;white-space:pre-wrap;word-break:break-all;"><code>${this._esc(pixelSnippet)}</code></pre>
          <button onclick="navigator.clipboard.writeText(${JSON.stringify(pixelSnippet)}); Utils.toast('Snippet skopírovaný do clipboardu', 'success');"
            style="position:absolute;top:8px;right:8px;background:#FF6B35;color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
            📋 Kopírovať
          </button>
        </div>

        <h5 style="margin-top:24px;">2. Príklady použitia</h5>
        <div style="position:relative;margin-bottom:8px;">
          <pre style="background:#fafaf8;color:#14120e;padding:14px;border-radius:8px;overflow-x:auto;font-size:11.5px;line-height:1.5;border:1px solid #eae6de;max-height:300px;white-space:pre-wrap;"><code>${this._esc(usageExamples)}</code></pre>
          <button onclick="navigator.clipboard.writeText(${JSON.stringify(usageExamples)}); Utils.toast('Príklady skopírované', 'success');"
            style="position:absolute;top:8px;right:8px;background:white;color:#14120e;border:1px solid #eae6de;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
            📋 Kopírovať
          </button>
        </div>

        <details style="margin-top:18px;">
          <summary style="cursor:pointer;font-size:13px;color:#6b7280;font-weight:600;">Alternatíva — pixel beacon (GIF) pre weby bez JavaScriptu</summary>
          <pre style="background:#fafaf8;color:#14120e;padding:14px;border-radius:8px;overflow-x:auto;font-size:11.5px;margin-top:8px;border:1px solid #eae6de;white-space:pre-wrap;word-break:break-all;"><code>${this._esc(pixelBeacon)}</code></pre>
        </details>
      </div>

      <div class="card">
        <h4>📊 Konverzie projektu</h4>
        <div id="tracking-conversions-summary" style="color:#6b7280;font-size:13px;">⏳ Načítavam…</div>
      </div>
    `;
  },

  async _loadConversionsSummary() {
    const el = document.getElementById('tracking-conversions-summary');
    if (!el) return;
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await Database.client
        .from('conversions')
        .select('event_type, event_value, created_at')
        .eq('project_id', this.projectId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!data?.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;">Zatiaľ žiadne konverzie. Po vložení pixelu na web sa tu objavia.</div>';
        return;
      }
      const byType = new Map();
      let totalValue = 0;
      for (const c of data) {
        const cur = byType.get(c.event_type) || { count: 0, value: 0 };
        cur.count++;
        cur.value += Number(c.event_value) || 0;
        byType.set(c.event_type, cur);
        totalValue += Number(c.event_value) || 0;
      }
      el.innerHTML = `
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">Posledných 30 dní</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
          ${Array.from(byType.entries()).map(([type, m]) => `
            <div style="background:#fafaf8;border:1px solid #eae6de;border-radius:10px;padding:14px;">
              <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${this._esc(type)}</div>
              <div style="font-size:22px;font-weight:700;color:#14120e;margin-top:4px;">${m.count}</div>
              ${m.value > 0 ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${Math.round(m.value)} €</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      console.error('[tracking-summary]', e);
      el.innerHTML = `<div style="color:#dc2626;font-size:12px;">Chyba: ${this._esc(e.message)}</div>`;
    }
  },

  _switchTabUI(tabId) {
    // Skry všetky tab kontentu, zobraz vybraný
    document.querySelectorAll('[data-tab-content]').forEach(el => {
      if (el.dataset.tabContent === tabId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
    // Update sidebar tlačidiel (aktívny)
    document.querySelectorAll('[data-tab-btn]').forEach(el => {
      const isActive = el.dataset.tabBtn === tabId;
      el.style.background = isActive ? '#FF6B35' : 'transparent';
      el.style.color = isActive ? '#fff' : '#374151';
      el.style.fontWeight = isActive ? '600' : '500';
    });
    // Lazy load tracking summary (len keď user otvorí tab)
    if (tabId === 'tracking') this._loadConversionsSummary?.();
    if (tabId === 'strategy') this._loadProposalVersions?.();
    if (tabId === 'brand') this._loadBrandTab?.();
  },

  // ─────────────────────────────────────────────────────────
  // BRAND TAB — farby, logo, font, voice notes (per klient)
  // Tieto sa použijú v AI prompte pri generovaní image_prompt
  // a image_text_overlay.
  // ─────────────────────────────────────────────────────────
  async _loadBrandTab() {
    const host = document.getElementById('brand-tab-host');
    if (!host) return;
    const project = window.CampaignProjectsModule.selectedProject;
    if (!project?.client_id) {
      host.innerHTML = '<div class="card" style="color:#9ca3af;">Projekt nemá priradeného klienta.</div>';
      return;
    }
    try {
      const { data: client, error } = await Database.client
        .from('clients')
        .select('id, company_name, brand_colors, brand_font, brand_logo_url, brand_voice_notes')
        .eq('id', project.client_id)
        .single();
      if (error) throw error;
      host.innerHTML = this._renderBrandForm(client);
    } catch (e) {
      console.error('[brand]', e);
      host.innerHTML = `<div class="card" style="color:#dc2626;">Chyba: ${this._esc(e.message)} — spustil si migráciu 036?</div>`;
    }
  },

  _renderBrandForm(client) {
    const colors = Array.isArray(client.brand_colors) ? client.brand_colors : [];
    const c0 = colors[0] || '';
    const c1 = colors[1] || '';
    const c2 = colors[2] || '';
    return `
      <div class="card">
        <h4>🎨 Brand assets — ${this._esc(client.company_name)}</h4>
        <p style="color:#374151;font-size:13px;margin-bottom:18px;">
          Tieto údaje sa použijú v <strong>image promptoch</strong> (color palette),
          <strong>text overlay</strong> (farba textu) a <strong>PDF prezentácii</strong>.
          AI ich automaticky zahrnie pri ďalšom generovaní.
        </p>

        <h5 style="margin-top:0;">Brand farby</h5>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;">
          ${[0,1,2].map(i => {
            const v = colors[i] || '';
            const labels = ['Primary (hlavná)', 'Secondary (doplnková)', 'Accent (akcent)'];
            const defaults = ['#FF6B35', '#14120e', '#fafaf8'];
            const cv = v || defaults[i];
            return `
              <div>
                <label style="display:block;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${labels[i]}</label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="color" id="brand-color-${i}" value="${cv}"
                    style="width:40px;height:40px;border:1px solid #eae6de;border-radius:8px;cursor:pointer;padding:2px;background:white;flex-shrink:0;"
                    oninput="document.getElementById('brand-color-text-${i}').value = this.value.toUpperCase();">
                  <input type="text" id="brand-color-text-${i}" value="${this._esc(v)}" placeholder="${defaults[i]}"
                    style="flex:1;min-width:0;padding:8px 10px;border:1px solid #eae6de;border-radius:8px;font-family:monospace;font-size:13px;text-transform:uppercase;"
                    oninput="if(/^#?[0-9a-fA-F]{6}$/.test(this.value.trim())){const v=this.value.trim().startsWith('#')?this.value.trim():'#'+this.value.trim(); document.getElementById('brand-color-${i}').value = v; this.value = v.toUpperCase();}">
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <h5>Font</h5>
        <input type="text" id="brand-font" value="${this._esc(client.brand_font || '')}"
          placeholder="napr. Inter / Poppins / vlastný custom font"
          style="width:100%;padding:10px 12px;border:1px solid #eae6de;border-radius:8px;font-size:13px;margin-bottom:18px;">

        <h5>Logo URL</h5>
        <input type="url" id="brand-logo-url" value="${this._esc(client.brand_logo_url || '')}"
          placeholder="https://klient.sk/logo.png alebo Supabase Storage URL"
          style="width:100%;padding:10px 12px;border:1px solid #eae6de;border-radius:8px;font-size:13px;margin-bottom:6px;">
        ${client.brand_logo_url ? `<div style="margin-bottom:18px;"><img src="${this._esc(client.brand_logo_url)}" alt="Logo" style="max-height:60px;border:1px solid #eae6de;border-radius:8px;padding:8px;background:white;" onerror="this.style.display='none';"></div>` : '<div style="margin-bottom:12px;"></div>'}

        <h5>Brand voice & extra inštrukcie</h5>
        <textarea id="brand-voice" rows="4"
          placeholder="Napr.: 'Vykáme, profesionálne ale nie korporátne, emoji NIE. Zakázané témy: politika, náboženstvo. Vyhýbať sa slovám: revolučný, najlepší.'"
          style="width:100%;padding:10px 12px;border:1px solid #eae6de;border-radius:8px;font-size:13px;line-height:1.5;margin-bottom:18px;">${this._esc(client.brand_voice_notes || '')}</textarea>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="ProjectDetailModule._saveBrand('${client.id}')"
            style="padding:10px 22px;background:#FF6B35;color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:13px;">
            💾 Uložiť brand
          </button>
        </div>
      </div>

      <div class="card" style="background:#fff7ed;border-left:3px solid #FF6B35;">
        <h4 style="color:#9a3412;">💡 Ako to funguje</h4>
        <ul style="color:#7c2d12;line-height:1.7;">
          <li>Po uložení tieto údaje pôjdu do AI promptu pri ďalšom generovaní/pregenerovaní.</li>
          <li>AI vyrobí image prompty so spomenutím tvojich farieb: <code style="background:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">color palette of [tvoje farby]</code></li>
          <li>Text overlay color: "brand" → použije sa tvoja primary farba.</li>
          <li>Brand voice notes idú do prompt-u ako extra konštrikcia pre copywriting.</li>
        </ul>
      </div>
    `;
  },

  async _saveBrand(clientId) {
    // Číta z OBOCH inputov — text input má prednosť, ak prázdny tak color
    // picker (browser color picker vždy má hodnotu, takže fallback funguje).
    const colors = [];
    for (let i = 0; i < 3; i++) {
      let val = document.getElementById(`brand-color-text-${i}`)?.value?.trim() || '';
      if (!val) val = document.getElementById(`brand-color-${i}`)?.value?.trim() || '';
      if (!val) continue;
      // Normalizuj — pridaj # ak chýba
      if (!val.startsWith('#')) val = '#' + val;
      val = val.toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(val)) colors.push(val);
    }
    const brand_font = document.getElementById('brand-font')?.value?.trim() || null;
    const brand_logo_url = document.getElementById('brand-logo-url')?.value?.trim() || null;
    const brand_voice_notes = document.getElementById('brand-voice')?.value?.trim() || null;

    console.log('[brand save]', { clientId, colors, brand_font, brand_logo_url, brand_voice_notes });

    try {
      const { data, error } = await Database.client.from('clients').update({
        brand_colors: colors.length ? colors : null,
        brand_font, brand_logo_url, brand_voice_notes,
      }).eq('id', clientId).select();
      if (error) throw error;
      if (!data?.length) throw new Error('Update nevrátil žiadne riadky (RLS / chýbajúce stĺpce?)');
      console.log('[brand save] OK:', data[0]);
      Utils.toast(`✓ Brand uložený (${colors.length} ${colors.length === 1 ? 'farba' : 'farby'})`, 'success');
      // Reload tab aby ukázal aktuálne dáta + logo preview
      await this._loadBrandTab();
    } catch (e) {
      console.error('[brand save] error:', e);
      const msg = e.message?.includes('column') || e.message?.includes('schema')
        ? 'Chýba migrácia 036 — spusti SQL v Supabase'
        : e.message;
      Utils.toast('Chyba: ' + msg, 'error');
    }
  },

  // História verzií návrhu (snapshoty pred regeneráciou)
  async _loadProposalVersions() {
    let host = document.getElementById('proposal-versions-host');
    if (!host) {
      // Vlož kartu na koniec strategy tabu
      const strategyTab = document.querySelector('[data-tab-content="strategy"]');
      if (!strategyTab) return;
      host = document.createElement('div');
      host.id = 'proposal-versions-host';
      strategyTab.appendChild(host);
    }
    host.innerHTML = '<div class="card"><div style="color:#9ca3af;font-size:13px;">⏳ Načítavam históriu verzií…</div></div>';

    try {
      const { data: versions, error } = await Database.client
        .from('proposal_versions')
        .select('id, version, trigger, feedback, created_at, strategy_summary, business_analysis')
        .eq('project_id', this.projectId)
        .order('version', { ascending: false });
      if (error) throw error;

      const current = window.CampaignProjectsModule.selectedProject?.proposal_version || 1;
      const triggerLabel = (t) => ({ initial: 'Pôvodný návrh', regenerate: 'Pregenerované s pripomienkami', client_revision: 'Po revízii klienta' }[t] || t);

      host.innerHTML = `
        <div class="card">
          <h4>📜 História verzií</h4>
          <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">Aktuálne verzia <strong>v${current}</strong>. Pred pregenerovaním sa staré dáta automaticky archivujú.</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;border-left:3px solid #FF6B35;">
              <div style="background:#FF6B35;color:white;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;">v${current}</div>
              <div style="flex:1;font-size:13px;color:#14120e;">Aktuálna verzia</div>
              <div style="font-size:11px;color:#9a3412;">v sidebari →</div>
            </div>
            ${(versions || []).map(v => `
              <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#fafaf8;border:1px solid #eae6de;border-radius:10px;">
                <div style="background:#fff;color:#14120e;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #eae6de;">v${v.version}</div>
                <div style="flex:1;">
                  <div style="font-size:13px;color:#14120e;font-weight:500;">${this._esc(triggerLabel(v.trigger))}</div>
                  ${v.feedback ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;font-style:italic;">"${this._esc(v.feedback.slice(0, 180))}${v.feedback.length > 180 ? '…' : ''}"</div>` : ''}
                  ${v.strategy_summary ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px;">${this._esc(v.strategy_summary.slice(0, 220))}…</div>` : ''}
                </div>
                <div style="font-size:11px;color:#9ca3af;white-space:nowrap;">${this._formatDate(v.created_at)}</div>
                <button onclick="ProjectDetailModule.viewProposalVersion('${v.id}')"
                  style="background:#fff;border:1px solid #eae6de;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;color:#14120e;font-weight:600;">
                  Pozrieť
                </button>
              </div>
            `).join('') || '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px;">Toto je prvá verzia — žiadne staršie snapshoty.</div>'}
          </div>
        </div>
      `;
    } catch (e) {
      console.error('[proposal-versions]', e);
      host.innerHTML = `<div class="card" style="color:#dc2626;font-size:12px;">Chyba: ${this._esc(e.message)} <br><span style="color:#9ca3af;">Spusti migráciu 030 v Supabase SQL Editor.</span></div>`;
    }
  },

  async viewProposalVersion(versionId) {
    try {
      const { data: v } = await Database.client.from('proposal_versions').select('*').eq('id', versionId).single();
      if (!v) return Utils.toast('Verzia nenájdená', 'error');

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4';
      modal.id = 'version-view-modal';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-5 border-b flex items-center justify-between">
            <h2 class="text-lg font-bold">📜 Verzia ${v.version} · ${this._formatDate(v.created_at)}</h2>
            <button onclick="document.getElementById('version-view-modal').remove()" class="text-2xl text-gray-400 hover:text-gray-700">×</button>
          </div>
          <div class="overflow-y-auto flex-1 p-6 space-y-4">
            ${v.feedback ? `<div style="background:#fff7ed;border-left:3px solid #FF6B35;padding:12px 16px;border-radius:0 8px 8px 0;"><strong>Pripomienka:</strong> ${this._esc(v.feedback)}</div>` : ''}
            ${v.strategy_summary ? `<div><h4 style="font-size:13px;font-weight:600;color:#14120e;margin-bottom:8px;">🎯 Stratégia</h4><p style="font-size:13px;line-height:1.6;color:#374151;white-space:pre-line;">${this._esc(v.strategy_summary)}</p></div>` : ''}
            ${v.business_analysis?.summary ? `<div><h4 style="font-size:13px;font-weight:600;color:#14120e;margin-bottom:8px;">💼 Analýza biznisu</h4><p style="font-size:13px;line-height:1.6;color:#374151;">${this._esc(v.business_analysis.summary)}</p></div>` : ''}
            ${v.campaigns_snapshot?.length ? `<div><h4 style="font-size:13px;font-weight:600;color:#14120e;margin-bottom:8px;">📣 Kampane (${v.campaigns_snapshot.length})</h4><ul style="font-size:13px;color:#374151;line-height:1.7;">${v.campaigns_snapshot.map(c => `<li>• ${this._esc(c.name)} <span style="color:#9ca3af;">(${c.platform}, ${c.budget_daily}€/deň)</span></li>`).join('')}</ul></div>` : ''}
            <details><summary style="cursor:pointer;font-size:12px;color:#6b7280;font-weight:600;">📋 Plný JSON snapshot</summary><pre style="background:#fafaf8;border:1px solid #eae6de;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto;max-height:300px;margin-top:8px;">${this._esc(JSON.stringify(v, null, 2))}</pre></details>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {
      Utils.toast('Chyba: ' + e.message, 'error');
    }
  },

  // Helpers
  _statusBgFor(color) {
    return ({ purple: 'f3e8ff', amber: 'fef3c7', sky: 'dbeafe', orange: 'fed7aa', mint: 'd1fae5', green: 'dcfce7', lav: 'ede9fe', err: 'fee2e2', n: 'f3f4f6' })[color] || 'f3f4f6';
  },
  _statusFgFor(color) {
    return ({ purple: '6b21a8', amber: '92400e', sky: '1e40af', orange: '9a3412', mint: '065f46', green: '166534', lav: '5b21b6', err: '991b1b', n: '6b7280' })[color] || '6b7280';
  },
  _formatDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  },
  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
  _renderError(title, message) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h2 style="font-size:20px;font-weight:600;margin-bottom:8px;">${this._esc(title)}</h2>
        <p style="color:#6b7280;max-width:480px;margin:0 0 20px;">${this._esc(message)}</p>
        <a href="#projects" style="padding:10px 20px;background:#FF6B35;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">← Späť na projekty</a>
      </div>
    `;
  },
};

if (typeof window !== 'undefined') {
  window.ProjectDetailModule = ProjectDetailModule;
  if (window.ModuleRegistry?.register) window.ModuleRegistry.register(ProjectDetailModule);
  if (window.Router?.register) window.Router.register('project', ProjectDetailModule);
}
