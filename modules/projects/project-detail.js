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
          <div id="detail-content">${contentHTML}</div>
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
    </style>`;
  },

  _renderSidebar(project, statusMeta) {
    const tabs = [
      { id: 'overview',    icon: '⬛', label: 'Prehľad' },
      { id: 'strategy',    icon: '🎯', label: 'Stratégia' },
      { id: 'campaigns',   icon: '📣', label: 'Kampane' },
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
    switch (project.status) {
      case 'draft':
        buttons.push(btn(c.purple, `CampaignProjectsModule.startGeneration('${id}')`, '🤖 Spustiť AI generovanie'));
        break;
      case 'internal_review':
        buttons.push(btn(c.purple, `CampaignProjectsModule.openCreativesPage('${id}')`, '🎨 Kreatívy & prompty'));
        buttons.push(btn(c.blue,   `window.open('/.netlify/functions/proposal-html?project_id=${id}', '_blank')`, '📄 Zobraziť PDF náhľad'));
        buttons.push(btn(c.orange, `CampaignProjectsModule.regenerateWithFeedback('${id}')`, '✏️ Pregenerovať s pripomienkami'));
        buttons.push(btn(c.green,  `CampaignProjectsModule.approveInternal('${id}')`, '✅ Schváliť pre klienta'));
        break;
      case 'client_review':
        buttons.push(btn(c.purple, `CampaignProjectsModule.generateClientLink('${id}')`, project.client_portal_token ? '🔗 Kopírovať odkaz' : '🔗 Generovať odkaz'));
        buttons.push(btn(c.green,  `CampaignProjectsModule.sendProposalToClient('${id}')`, '📧 Poslať klientovi email'));
        buttons.push(btn(c.blue,   `window.open('/.netlify/functions/proposal-html?project_id=${id}', '_blank')`, '📄 PDF náhľad'));
        buttons.push(btn(c.blue,   `CampaignProjectsModule.previewAsClient('${id}')`, '👁️ Náhľad portálu'));
        break;
      case 'approved':
        buttons.push(btn(c.purple, `CampaignProjectsModule.openCreativesPage('${id}')`, '🎨 Kreatívy & prompty'));
        buttons.push(btn(c.blue,   `window.open('/.netlify/functions/proposal-html?project_id=${id}', '_blank')`, '📄 Stiahnuť PDF'));
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
