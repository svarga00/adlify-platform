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
    const hash = window.location.hash.slice(1) || 'desk';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    
    // Find matching route
    let module = this.routes.get(path);
    
    // Try parent path (for nested routes like crm/pipeline)
    if (!module) {
      const parentPath = path.split('/')[0];
      module = this.routes.get(parentPath);
    }
    
    // Route aliases for backward compatibility
    const routeAliases = {
      'dashboard': 'desk',
      'leads': 'crm',
      'clients': 'crm',
      'pipeline': 'crm',
      'contacts': 'crm',
      'companies': 'crm',
      'engagements': 'crm',
      'messages': 'chat',
      'tickets': 'chat',
      'inbox': 'chat'
    };
    
    if (!module && routeAliases[path]) {
      module = this.routes.get(routeAliases[path]);
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
    this.currentRoute = path;
    this.currentModule = module;
    
    // Update UI
    this.updateActiveMenu(path);
    this.updateBreadcrumb(module);
    
    // Render module
    try {
      if (this.container) {
        this.container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
      }
      
      await module.render(this.container, Object.fromEntries(params));
      
    } catch (e) {
      console.error('❌ Route render error:', e);
      this.renderError(e);
    }
  },
  
  /**
   * Update active menu item - New sidebar design
   */
  updateActiveMenu(path) {
    const basePath = path.split('/')[0];
    const fullPath = path;
    
    // Route mapping to sidebar items
    const routeToNav = {
      'desk': 'desk',
      'dashboard': 'desk',
      'crm': 'crm',
      'leads': 'crm',
      'pipeline': 'crm',
      'contacts': 'crm',
      'companies': 'crm',
      'engagements': 'crm',
      'clients': 'crm',
      'campaigns': 'campaigns',
      'onboarding': 'onboarding',
      'chat': 'chat',
      'messages': 'chat',
      'tickets': 'chat',
      'inbox': 'chat',
      'settings': 'settings',
      'services': 'settings',
      'templates': 'settings',
      'billing': 'settings',
      'team': 'settings',
      'integrations': 'settings',
      'automations': 'settings',
      'reporting': 'settings',
      'reports': 'settings'
    };
    
    const navTarget = routeToNav[basePath] || basePath;
    
    // Update main nav items
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.remove('active');
      const route = el.dataset.route;
      
      // Check if this nav item should be active
      if (route === navTarget || 
          route === fullPath || 
          fullPath.startsWith(route + '/') ||
          (route === 'crm' && ['crm', 'leads', 'pipeline', 'contacts', 'companies', 'engagements', 'clients'].includes(basePath))) {
        el.classList.add('active');
        
        // Expand parent submenu if needed
        const expandable = el.closest('.nav-submenu')?.previousElementSibling;
        if (expandable?.dataset.expand) {
          expandable.classList.add('expanded');
          document.getElementById('submenu-' + expandable.dataset.expand).style.display = 'block';
        }
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
