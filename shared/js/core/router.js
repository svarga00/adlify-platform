/**
 * ADLIFY PLATFORM - Router V2
 * @version 2.0.0
 * 
 * Handles navigation and module loading
 */

const Router = {
  currentRoute: null,
  currentModule: null,
  routes: new Map(),
  container: null,
  
  /**
   * Initialize router
   */
  init(containerId = 'main-content') {
    this.container = document.getElementById(containerId);
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    
    // Handle initial route
    this.handleRoute();
    
    console.log('🧭 Router initialized');
    return this;
  },
  
  /**
   * Register route
   */
  register(path, module) {
    this.routes.set(path, module);
    console.log(`📍 Route registered: ${path}`);
    return this;
  },
  
  /**
   * Register multiple routes
   */
  registerAll(routes) {
    Object.entries(routes).forEach(([path, module]) => {
      this.register(path, module);
    });
    return this;
  },
  
  /**
   * Navigate to route
   */
  navigate(path, params = {}) {
    // Build URL with params
    let url = path;
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += '?' + searchParams.toString();
    }
    
    window.location.hash = url;
  },
  
  /**
   * Handle route change
   */
  async handleRoute() {
    const hash = window.location.hash.slice(1) || 'desk';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    
    // Route aliases - only for backward compatibility redirects
    const routeAliases = {
      'dashboard': 'desk',
      'leads': 'pipeline',
      'clients': 'engagements',
      'messages': 'chat',
      'tickets': 'chat',
      'inbox': 'chat'
    };
    
    // Get actual path (apply alias if exists)
    const actualPath = routeAliases[path] || path;
    
    // Find matching route
    let module = this.routes.get(actualPath);
    
    // Try parent path (for nested routes like settings/team)
    if (!module) {
      const parentPath = actualPath.split('/')[0];
      module = this.routes.get(parentPath);
    }
    
    if (!module) {
      console.warn('⚠️ Route not found:', actualPath);
      console.log('📋 Available routes:', Array.from(this.routes.keys()));
      this.render404();
      return;
    }
    
    // Check permissions
    if (module.permissions) {
      const [resource, action] = module.permissions;
      if (!Auth.can(resource, action)) {
        this.render403();
        return;
      }
    }
    
    // Update current state
    this.currentRoute = actualPath;
    this.currentModule = module;
    
    // Update UI
    this.updateActiveMenu(actualPath);
    this.updatePageTitle(module);
    
    // Render module
    try {
      if (this.container) {
        this.container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#64748b;"><svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>';
      }
      
      await module.render(this.container, Object.fromEntries(params));
      
    } catch (e) {
      console.error('❌ Route render error:', e);
      this.renderError(e);
    }
  },
  
  /**
   * Update active menu item - V2 sidebar design
   */
  updateActiveMenu(path) {
    const basePath = path.split('/')[0];
    
    // CRM sub-routes
    const crmRoutes = ['pipeline', 'contacts', 'companies', 'engagements'];
    const isCrmRoute = crmRoutes.includes(basePath);
    
    // Settings sub-routes
    const settingsRoutes = ['services', 'templates', 'billing', 'reporting', 'team', 'integrations', 'automations', 'system'];
    const isSettingsRoute = settingsRoutes.includes(basePath);
    
    // Remove all active states
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-subitem').forEach(el => el.classList.remove('active'));
    
    // Set active main nav item
    if (isCrmRoute) {
      document.querySelector('.nav-item[data-route="crm"]')?.classList.add('active');
      document.getElementById('crm-subitems')?.classList.add('open');
    } else if (isSettingsRoute) {
      document.querySelector('.nav-item[data-route="settings"]')?.classList.add('active');
      document.getElementById('settings-subitems')?.classList.add('open');
    } else {
      document.querySelector(`.nav-item[data-route="${basePath}"]`)?.classList.add('active');
    }
    
    // Set active sub-item
    document.querySelector(`.nav-subitem[data-route="${basePath}"]`)?.classList.add('active');
  },
  
  /**
   * Update page title
   */
  updatePageTitle(module) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.textContent = module.title || module.name || 'Adlify';
    }
  },
  
  /**
   * Render 404 page
   */
  render404() {
    if (this.container) {
      this.container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;text-align:center;">
          <div style="font-size:64px;margin-bottom:16px;">🔍</div>
          <h2 style="font-size:24px;font-weight:700;color:#374151;margin-bottom:8px;">Stránka nenájdená</h2>
          <p style="color:#6b7280;margin-bottom:24px;">Táto stránka neexistuje.</p>
          <a href="#desk" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border-radius:8px;text-decoration:none;font-weight:500;">Späť na dashboard</a>
        </div>
      `;
    }
  },
  
  /**
   * Render 403 page
   */
  render403() {
    if (this.container) {
      this.container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;text-align:center;">
          <div style="font-size:64px;margin-bottom:16px;">🔒</div>
          <h2 style="font-size:24px;font-weight:700;color:#374151;margin-bottom:8px;">Prístup zamietnutý</h2>
          <p style="color:#6b7280;margin-bottom:24px;">Nemáš oprávnenie na zobrazenie tejto stránky.</p>
          <a href="#desk" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border-radius:8px;text-decoration:none;font-weight:500;">Späť na dashboard</a>
        </div>
      `;
    }
  },
  
  /**
   * Render error page
   */
  renderError(error) {
    if (this.container) {
      this.container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;text-align:center;">
          <div style="font-size:64px;margin-bottom:16px;">❌</div>
          <h2 style="font-size:24px;font-weight:700;color:#374151;margin-bottom:8px;">Chyba</h2>
          <p style="color:#6b7280;margin-bottom:24px;">${error.message || 'Nastala neočakávaná chyba.'}</p>
          <button onclick="location.reload()" style="padding:10px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border-radius:8px;border:none;cursor:pointer;font-weight:500;">Obnoviť stránku</button>
        </div>
      `;
    }
  },
  
  /**
   * Get current params
   */
  getParams() {
    const hash = window.location.hash.slice(1);
    const [, queryString] = hash.split('?');
    return Object.fromEntries(new URLSearchParams(queryString || ''));
  },
  
  /**
   * Get param value
   */
  getParam(key) {
    return this.getParams()[key];
  }
};

// Export
window.Router = Router;
