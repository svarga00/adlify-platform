/**
 * ADLIFY PLATFORM - Configuration
 * @version 1.1.0
 * 
 * Handles all app configuration
 */

const Config = {
  // Default values - Supabase credentials sú verejné (anon key)
  defaults: {
    supabase_url: 'https://eidkljfaeqvvegiponwl.supabase.co',
    supabase_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGtsamZhZXF2dmVnaXBvbndsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NTgzNjgsImV4cCI6MjA4MjQzNDM2OH0.jFJe_IddYNiO-TOAdxhPSYtSQJlx4i6CFflB0CN4AIQ',
    claude_api_key: '',
    mm_api_key: '',
    app_name: 'Adlify',
    app_version: '1.0.0',
    default_package: 'pro',
    currency: 'EUR',
    locale: 'sk-SK',
    timezone: 'Europe/Bratislava'
  },
  
  // Cache
  _cache: null,
  
  /**
   * Initialize config from localStorage
   */
  init() {
    this._cache = { ...this.defaults };
    
    // Load from localStorage
    Object.keys(this.defaults).forEach(key => {
      const stored = localStorage.getItem(`adlify_${key}`);
      if (stored !== null) {
        this._cache[key] = stored;
      }
    });
    
    console.log('⚙️ Config initialized');
    return this;
  },
  
  /**
   * Get config value
   */
  get(key) {
    if (!this._cache) this.init();
    return this._cache[key];
  },
  
  /**
   * Set config value
   */
  set(key, value) {
    if (!this._cache) this.init();
    this._cache[key] = value;
    localStorage.setItem(`adlify_${key}`, value);
    return this;
  },
  
  /**
   * Set multiple values
   */
  setAll(values) {
    Object.entries(values).forEach(([key, value]) => {
      this.set(key, value);
    });
    return this;
  },
  
  /**
   * Get all config
   */
  getAll() {
    if (!this._cache) this.init();
    return { ...this._cache };
  },
  
  /**
   * Check if Supabase is configured
   */
  isSupabaseConfigured() {
    return !!(this.get('supabase_url') && this.get('supabase_key'));
  },
  
  /**
   * Check if Claude is configured
   */
  isClaudeConfigured() {
    return !!this.get('claude_api_key');
  },
  
  /**
   * Clear all config
   */
  clear() {
    Object.keys(this.defaults).forEach(key => {
      localStorage.removeItem(`adlify_${key}`);
    });
    this._cache = { ...this.defaults };
    return this;
  }
};

// Auto-init
Config.init();

// Export for modules
window.Config = Config;
