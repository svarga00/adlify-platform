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
   * Initialize UI elements
   */
  initUI() {
    // Update user info
    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');
    const userRoleEl = document.getElementById('user-role');
    
    if (userNameEl) {
      userNameEl.textContent = Auth.profile?.full_name || Auth.user?.email;
    }
    
    if (userAvatarEl) {
      if (Auth.profile?.avatar_url) {
        userAvatarEl.src = Auth.profile.avatar_url;
      } else {
        userAvatarEl.textContent = (Auth.profile?.full_name || Auth.user?.email || 'U').charAt(0).toUpperCase();
      }
    }
    
    if (userRoleEl) {
      const roles = { owner: 'Vlastník', admin: 'Admin', employee: 'Zamestnanec', client: 'Klient' };
      userRoleEl.textContent = roles[Auth.getRole()] || Auth.getRole();
    }
    
    // Setup logout
    document.querySelectorAll('[data-action="logout"]').forEach(el => {
      el.addEventListener('click', () => Auth.logout());
    });
    
    // Setup sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }
  },
  
  /**
   * Add menu item
   */
  addMenuItem(module) {
    const section = module.menu.section || 'main';
    const menuContainer = document.querySelector(`[data-menu-section="${section}"]`);
    
    if (!menuContainer) return;
    
    // Check permission
    if (module.permissions) {
      const [resource, action] = module.permissions;
      if (!Auth.can(resource, action)) return;
    }
    
    const item = document.createElement('a');
    item.href = `#${module.id}`;
    item.className = 'sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:text-white cursor-pointer';
    item.dataset.route = module.id;
    item.innerHTML = `
      <span class="text-xl">${module.icon || '📋'}</span>
      <span>${module.name}</span>
      ${module.badge ? `<span class="ml-auto badge">${module.badge}</span>` : ''}
    `;
    
    menuContainer.appendChild(item);
  },
  
  /**
   * Update connection status
   */
  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      if (connected) {
        statusEl.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full"></span> Pripojené';
        statusEl.className = 'flex items-center gap-2 text-sm text-green-400';
      } else {
        statusEl.innerHTML = '<span class="w-2 h-2 bg-red-500 rounded-full"></span> Offline';
        statusEl.className = 'flex items-center gap-2 text-sm text-red-400';
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
