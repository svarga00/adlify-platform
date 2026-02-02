/**
 * ADLIFY PLATFORM - App V2
 * @version 2.0.0
 */

const App = {
  version: '2.0.0',
  modules: new Map(),
  isReady: false,
  
  async init(options = {}) {
    console.log('🚀 Adlify Platform v' + this.version);
    
    try {
      Config.init();
      
      if (!Config.isSupabaseConfigured()) {
        this.showSetup();
        return false;
      }
      
      if (!Database.init()) {
        this.showError('Nepodarilo sa pripojiť k databáze');
        return false;
      }
      
      const connected = await Database.testConnection();
      if (!connected) {
        this.showError('Databáza nie je dostupná');
        return false;
      }
      
      const authenticated = await Auth.init();
      if (!authenticated) {
        if (!window.location.pathname.includes('login')) {
          window.location.href = '/login.html';
        }
        return false;
      }
      
      console.log('🔍 Auth check:', { teamMember: Auth.teamMember, isTeamMember: Auth.isTeamMember() });
      
      if (options.requireTeam && !Auth.isTeamMember()) {
        window.location.href = '/portal/';
        return false;
      }
      
      if (options.requireClient && !Auth.isClient()) {
        window.location.href = '/admin/index.html';
        return false;
      }
      
      this.initUI();
      
      // IMPORTANT: Don't init router yet - wait for modules to register
      // Router will be initialized after modules are registered via App.start()
      
      this.isReady = true;
      console.log('✅ App ready - waiting for modules');
      return true;
      
    } catch (error) {
      console.error('❌ App init error:', error);
      this.showError(error.message);
      return false;
    }
  },
  
  /**
   * Start the app after modules are registered
   */
  start() {
    console.log('🎬 Starting router with', this.modules.size, 'modules');
    Router.init('main-content');
    
    // Navigate to default route if no hash
    if (!window.location.hash) {
      Router.navigate('desk');
    }
  },
  
  /**
   * Register module - accepts both 'id' and 'name'
   */
  register(module) {
    const moduleId = module.id || module.name;
    
    if (!moduleId) {
      console.error('Module must have an id or name', module);
      return this;
    }
    
    module.id = moduleId;
    module.name = module.name || moduleId;
    
    this.modules.set(moduleId, module);
    
    // Pre-register route (Router will use it when initialized)
    if (module.route !== false) {
      Router.register(moduleId, module);
    }
    
    if (typeof module.init === 'function') {
      module.init();
    }
    
    console.log(`📦 Module registered: ${moduleId}`);
    return this;
  },
  
  getModule(id) {
    return this.modules.get(id);
  },
  
  initUI() {
    const userName = Auth.profile?.full_name || Auth.user?.email || 'User';
    const userInitial = userName.charAt(0).toUpperCase();
    
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = userName;
    
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl) userAvatarEl.textContent = userInitial;
  },
  
  showSetup() {
    const container = document.getElementById('app') || document.body;
    container.innerHTML = `
      <div style="min-height:100vh;background:#f1f5f9;display:flex;align-items:center;justify-content:center;padding:16px;">
        <div style="background:white;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);padding:32px;max-width:400px;width:100%;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#f97316,#ec4899);border-radius:16px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:700;margin:0 auto 16px;">A</div>
            <h1 style="font-size:24px;font-weight:700;">Vitaj v Adlify</h1>
            <p style="color:#64748b;margin-top:8px;">Nastav pripojenie k databáze</p>
          </div>
          <form id="setup-form">
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:14px;font-weight:500;margin-bottom:6px;">Supabase URL</label>
              <input type="url" id="setup-url" required placeholder="https://xxx.supabase.co" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:14px;font-weight:500;margin-bottom:6px;">Supabase Anon Key</label>
              <input type="password" id="setup-key" required placeholder="eyJhbGc..." style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
            </div>
            <button type="submit" style="width:100%;padding:12px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;font-weight:600;border:none;border-radius:8px;cursor:pointer;">Pripojiť</button>
          </form>
        </div>
      </div>
    `;
    
    document.getElementById('setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      Config.set('supabase_url', document.getElementById('setup-url').value.trim());
      Config.set('supabase_key', document.getElementById('setup-key').value.trim());
      location.reload();
    });
  },
  
  showError(message) {
    const container = document.getElementById('app') || document.body;
    container.innerHTML = `
      <div style="min-height:100vh;background:#f1f5f9;display:flex;align-items:center;justify-content:center;padding:16px;">
        <div style="background:white;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);padding:32px;max-width:400px;width:100%;text-align:center;">
          <div style="font-size:64px;margin-bottom:16px;">❌</div>
          <h1 style="font-size:24px;font-weight:700;color:#1e293b;">Chyba</h1>
          <p style="color:#64748b;margin-top:8px;">${message}</p>
          <div style="margin-top:24px;">
            <button onclick="location.reload()" style="width:100%;padding:12px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer;margin-bottom:8px;">Skúsiť znova</button>
            <button onclick="Config.clear();location.reload()" style="width:100%;padding:8px;background:none;border:none;color:#64748b;cursor:pointer;font-size:14px;">Resetovať nastavenia</button>
          </div>
        </div>
      </div>
    `;
  },
  
  openSearch() {
    console.log('Search - coming soon');
  },
  
  quickAdd() {
    console.log('Quick add - coming soon');
  }
};

window.App = App;
