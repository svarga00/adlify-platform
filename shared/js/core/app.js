/**
 * ADLIFY PLATFORM - App
 * @version 1.0.0
 * 
 * Main application bootstrap and module registry
 */

const App = {
  version: '1.0.0',
  modules: new Map(),
  integrations: new Map(),
  isReady: false,
  
  /**
   * Initialize application
   */
  async init(options = {}) {
    console.log('🚀 Adlify Platform v' + this.version);
    
    try {
      // 1. Initialize Config
      Config.init();
      
      // 2. Check if configured
      if (!Config.isSupabaseConfigured()) {
        console.log('⚙️ First run - showing setup');
        this.showSetup();
        return false;
      }
      
      // 3. Initialize Database
      if (!Database.init()) {
        this.showError('Nepodarilo sa pripojiť k databáze');
        return false;
      }
      
      // 4. Test connection
      const connected = await Database.testConnection();
      if (!connected) {
        this.showError('Databáza nie je dostupná');
        return false;
      }
      
      // 5. Initialize Auth
      const authenticated = await Auth.init();
      if (!authenticated) {
        // Redirect to login
        if (!window.location.pathname.includes('login')) {
          window.location.href = '/login.html';
        }
        return false;
      }
      
      // 6. Check access
      console.log('🔍 Auth check:', { teamMember: Auth.teamMember, isTeamMember: Auth.isTeamMember() });
      
      if (options.requireTeam && !Auth.isTeamMember()) {
        console.log('❌ Not a team member, redirecting to portal');
        window.location.href = '/portal/';
        return false;
      }
      
      if (options.requireClient && !Auth.isClient()) {
        window.location.href = '/admin/index.html';
        return false;
      }
      
      // 7. Initialize UI
      this.initUI();
      
      // 8. Initialize Router
      Router.init('main-content');
      
      // 9. Register default modules
      await this.loadModules(options.modules || []);
      
      // 10. Done
      this.isReady = true;
      this.updateConnectionStatus(true);
      
      console.log('✅ App ready');
      return true;
      
    } catch (error) {
      console.error('❌ App init error:', error);
      this.showError(error.message);
      return false;
    }
  },
  
  /**
   * Register module
   */
  register(module) {
    if (!module.id) {
      console.error('Module must have an id');
      return this;
    }
    
    this.modules.set(module.id, module);
    
    // Register route
    if (module.route !== false) {
      Router.register(module.id, module);
    }
    
    // Add to menu
    if (module.menu && module.menu.show !== false) {
      this.addMenuItem(module);
    }
    
    // Initialize module
    if (typeof module.init === 'function') {
      module.init();
    }
    
    console.log(`📦 Module registered: ${module.id}`);
    return this;
  },
  
  /**
   * Register integration
   */
  registerIntegration(integration) {
    this.integrations.set(integration.id, integration);
    console.log(`🔌 Integration registered: ${integration.id}`);
    return this;
  },
  
  /**
   * Get module
   */
  getModule(id) {
    return this.modules.get(id);
  },
  
  /**
   * Load modules dynamically
   */
  async loadModules(moduleIds) {
    for (const id of moduleIds) {
      try {
        // Check if already loaded
        if (this.modules.has(id)) continue;
        
        // Dynamic import would go here
        // For now, modules are loaded via script tags
        console.log(`📦 Loading module: ${id}`);
        
      } catch (e) {
        console.error(`Failed to load module ${id}:`, e);
      }
    }
  },
  
  /**
   * Initialize UI elements - New Icon Rail design
   */
  initUI() {
    // Update user info
    const userName = Auth.profile?.full_name || Auth.user?.email || 'User';
    const userInitial = userName.charAt(0).toUpperCase();
    
    // User name in panel
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) {
      userNameEl.textContent = userName;
    }
    
    // Avatars (rail + panel)
    const userAvatarEl = document.getElementById('user-avatar');
    const userAvatarPanelEl = document.getElementById('user-avatar-panel');
    
    if (userAvatarEl) {
      userAvatarEl.textContent = userInitial;
    }
    if (userAvatarPanelEl) {
      userAvatarPanelEl.textContent = userInitial;
    }
    
    // Setup logout
    document.querySelectorAll('[data-action="logout"]').forEach(el => {
      el.addEventListener('click', () => Auth.logout());
    });
    
    // Setup rail item click handlers
    document.querySelectorAll('.rail-item[data-category]').forEach(item => {
      item.addEventListener('click', () => {
        // Remove active from all rail items
        document.querySelectorAll('.rail-item').forEach(i => i.classList.remove('active'));
        // Add active to clicked
        item.classList.add('active');
        
        // Update panel header
        const title = item.querySelector('.tooltip-title')?.textContent || '';
        const desc = item.querySelector('.tooltip-desc')?.textContent || '';
        const panelTitle = document.getElementById('panel-title');
        const panelSubtitle = document.getElementById('panel-subtitle');
        if (panelTitle) panelTitle.textContent = title;
        if (panelSubtitle) panelSubtitle.textContent = desc;
      });
    });
  },
  
  /**
   * Add menu item - New Icon Rail + Panel design
   */
  addMenuItem(module) {
    // Map modules to new categories by ID
    const moduleCategories = {
      // Dashboard
      'dashboard': 'dashboard',
      // CRM
      'leads': 'crm',
      'clients': 'crm',
      'projects': 'crm',
      // Marketing
      'campaigns': 'marketing',
      'onboarding': 'marketing',
      // Communication
      'messages': 'communication',
      'tickets': 'communication',
      // Productivity
      'tasks': 'productivity',
      'calendar': 'productivity',
      // Finance
      'billing': 'finance',
      'reporting': 'finance',
      // Config
      'services': 'config',
      'templates': 'config',
      'documents': 'config',
      'keywords': 'config',
      'automations': 'config',
      // Settings
      'settings': 'settings',
      'integrations': 'settings',
      'team': 'settings'
    };
    
    // Get section from mapping or fallback
    let section = moduleCategories[module.id] || module.menu.section || 'config';
    
    // Fallback mapping for old sections
    if (section === 'main') section = 'crm';
    if (section === 'tools') section = 'config';
    
    const menuContainer = document.querySelector(`[data-menu-section="${section}"]`);
    
    if (!menuContainer) {
      console.warn(`Menu section not found: ${section} for module ${module.id}`);
      return;
    }
    
    // Check permission
    if (module.permissions) {
      const [resource, action] = module.permissions;
      if (!Auth.can(resource, action)) return;
    }
    
    // SVG icons mapping
    const iconSVGs = {
      // Dashboard
      '📊': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
      // CRM
      '🎯': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      '👥': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      '📁': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      // Marketing
      '📢': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
      '🚀': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
      '📋': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
      // Communication
      '📧': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
      '🎫': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      // Productivity
      '✅': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      '📅': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      // Finance
      '💰': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      '📄': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      '📈': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      // Config
      '📦': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
      '📝': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      '📑': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      '🔑': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      '⚡': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      // Settings
      '⚙️': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      '🔌': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
      '👤': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    };
    
    const icon = module.icon || '📋';
    const svgIcon = iconSVGs[icon] || iconSVGs['📋'];
    
    const item = document.createElement('a');
    item.href = `#${module.id}`;
    item.className = 'sidebar-item';
    item.dataset.route = module.id;
    
    let badgeHtml = '';
    if (module.badge) {
      const badgeClass = module.badgeColor || '';
      badgeHtml = `<span class="menu-badge ${badgeClass}">${module.badge}</span>`;
    }
    
    item.innerHTML = `
      ${svgIcon}
      <span>${module.name}</span>
      ${badgeHtml}
    `;
    
    menuContainer.appendChild(item);
  },
  
  /**
   * Update connection status - New design
   */
  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    const statusDot = document.getElementById('connection-dot');
    
    if (statusEl) {
      if (connected) {
        statusEl.textContent = 'Pripojené';
        statusEl.className = 'panel-user-status connected';
      } else {
        statusEl.textContent = 'Offline';
        statusEl.className = 'panel-user-status';
      }
    }
    
    if (statusDot) {
      if (connected) {
        statusDot.classList.add('connected');
      } else {
        statusDot.classList.remove('connected');
      }
    }
  },
  
  /**
   * Show setup screen
   */
  showSetup() {
    const container = document.getElementById('app') || document.body;
    container.innerHTML = `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">A</div>
            <h1 class="text-2xl font-bold">Vitaj v Adlify</h1>
            <p class="text-gray-500 mt-2">Nastav pripojenie k databáze</p>
          </div>
          
          <form id="setup-form" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Supabase URL</label>
              <input type="url" id="setup-url" required placeholder="https://xxx.supabase.co" class="w-full p-3 border rounded-xl">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Supabase Anon Key</label>
              <input type="password" id="setup-key" required placeholder="eyJhbGc..." class="w-full p-3 border rounded-xl">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold rounded-xl">
              Pripojiť
            </button>
          </form>
          
          <p class="text-xs text-gray-400 text-center mt-4">
            Údaje nájdeš v Supabase Dashboard → Settings → API
          </p>
        </div>
      </div>
    `;
    
    document.getElementById('setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const url = document.getElementById('setup-url').value.trim();
      const key = document.getElementById('setup-key').value.trim();
      
      Config.set('supabase_url', url);
      Config.set('supabase_key', key);
      
      // Test and reload
      location.reload();
    });
  },
  
  /**
   * Show error screen
   */
  showError(message) {
    const container = document.getElementById('app') || document.body;
    container.innerHTML = `
      <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div class="text-6xl mb-4">❌</div>
          <h1 class="text-2xl font-bold text-gray-800">Chyba</h1>
          <p class="text-gray-500 mt-2">${message}</p>
          <div class="mt-6 space-y-2">
            <button onclick="location.reload()" class="w-full py-2 bg-gray-100 rounded-xl hover:bg-gray-200">Skúsiť znova</button>
            <button onclick="Config.clear(); location.reload()" class="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Resetovať nastavenia</button>
          </div>
        </div>
      </div>
    `;
  },
  
  // ==========================================
  // EVENT SYSTEM
  // ==========================================
  
  _events: new Map(),
  
  /**
   * Subscribe to event
   */
  on(event, callback) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(callback);
    return this;
  },
  
  /**
   * Unsubscribe from event
   */
  off(event, callback) {
    if (this._events.has(event)) {
      const callbacks = this._events.get(event).filter(cb => cb !== callback);
      this._events.set(event, callbacks);
    }
    return this;
  },
  
  /**
   * Emit event
   */
  emit(event, data) {
    if (this._events.has(event)) {
      this._events.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`Event handler error for ${event}:`, e);
        }
      });
    }
    return this;
  }
};

// Export
window.App = App;
