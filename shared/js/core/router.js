/**
 * ADLIFY PLATFORM - Router
 * @version 1.0.0
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
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    
    // Find matching route
    let module = this.routes.get(path);
    
    // Try parent path
    if (!module) {
      const parentPath = path.split('/')[0];
      module = this.routes.get(parentPath);
    }
    
    if (!module) {
      console.warn('⚠️ Route not found:', path);
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
    const prevModule = this.currentModule;
    this.currentRoute = path;
    this.currentModule = module;

    // Zatvor všetky otvorené modaly z predchádzajúceho view-u —
    // inak môže zostať visieť v body a prekrývať nový modul.
    // Pokrývame oba patterny použité v moduloch:
    //   - .modal-overlay (tasks.js, tickets.js, …)
    //   - dialógy v #modals kontajneri (FB groups, atď.)
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const modalsHost = document.getElementById('modals');
    if (modalsHost) modalsHost.innerHTML = '';

    // Destroy predchádzajúci modul (ak má destroy)
    if (prevModule && prevModule !== module && typeof prevModule.destroy === 'function') {
        try { prevModule.destroy(); } catch(e) { console.warn('Module destroy error:', e); }
    }
    
    // Update UI
    this.updateActiveMenu(path);
    this.updateBreadcrumb(module);
    
    // Render module
    try {
      if (this.container) {
        this.container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
      }
      
      await module.render(this.container, Object.fromEntries(params));
      
    } catch (e) {
      console.error('❌ Route render error:', e);
      this.renderError(e);
    }
  },
  
  /**
   * Update active menu item
   */
  updateActiveMenu(path) {
    document.querySelectorAll('[data-route]').forEach(el => {
      el.classList.remove('active');
      if (el.dataset.route === path || path.startsWith(el.dataset.route + '/')) {
        el.classList.add('active');
      }
    });
  },
  
  /**
   * Update breadcrumb
   */
  updateBreadcrumb(module) {
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    
    if (titleEl) titleEl.textContent = module.title || module.name;
    if (subtitleEl) subtitleEl.textContent = module.subtitle || '';
  },
  
  /**
   * Render 404 page
   */
  render404() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-center">
          <div class="text-6xl mb-4">🔍</div>
          <h2 class="text-2xl font-bold text-gray-700">Stránka nenájdená</h2>
          <p class="text-gray-500 mt-2">Táto stránka neexistuje.</p>
          <a href="#dashboard" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Späť na dashboard</a>
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
        <div class="flex flex-col items-center justify-center h-64 text-center">
          <div class="text-6xl mb-4">🔒</div>
          <h2 class="text-2xl font-bold text-gray-700">Prístup zamietnutý</h2>
          <p class="text-gray-500 mt-2">Nemáš oprávnenie na zobrazenie tejto stránky.</p>
          <a href="#dashboard" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Späť na dashboard</a>
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
        <div class="flex flex-col items-center justify-center h-64 text-center">
          <div class="text-6xl mb-4">❌</div>
          <h2 class="text-2xl font-bold text-gray-700">Chyba</h2>
          <p class="text-gray-500 mt-2">${error.message || 'Nastala neočakávaná chyba.'}</p>
          <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Obnoviť stránku</button>
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
