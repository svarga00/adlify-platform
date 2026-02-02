/**
 * ADLIFY PLATFORM - Database
 * @version 1.0.0
 * 
 * Supabase wrapper with helper methods
 */

const Database = {
  client: null,
  isConnected: false,
  
  /**
   * Initialize Supabase client
   */
  init() {
    const url = Config.get('supabase_url');
    const key = Config.get('supabase_key');
    
    if (!url || !key) {
      console.warn('⚠️ Supabase not configured');
      return false;
    }
    
    try {
      this.client = supabase.createClient(url, key);
      console.log('🗄️ Database initialized');
      return true;
    } catch (e) {
      console.error('❌ Database init failed:', e);
      return false;
    }
  },
  
  /**
   * Test connection
   */
  async testConnection() {
    if (!this.client) {
      if (!this.init()) return false;
    }
    
    try {
      const { error } = await this.client.from('organizations').select('id').limit(1);
      this.isConnected = !error;
      return this.isConnected;
    } catch (e) {
      this.isConnected = false;
      return false;
    }
  },
  
  /**
   * Get Supabase client
   */
  getClient() {
    if (!this.client) this.init();
    return this.client;
  },
  
  // ==========================================
  // CRUD HELPERS
  // ==========================================
  
  /**
   * Select records
   */
  async select(table, options = {}) {
    const { columns = '*', filters = {}, order = null, limit = null, single = false } = options;
    
    let query = this.client.from(table).select(columns);
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        query = query.eq(key, value);
      }
    });
    
    // Apply order
    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? false });
    }
    
    // Apply limit
    if (limit) {
      query = query.limit(limit);
    }
    
    // Single record
    if (single) {
      query = query.single();
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error(`❌ Select ${table} error:`, error);
      throw error;
    }
    
    return data;
  },
  
  /**
   * Insert record(s)
   */
  async insert(table, data, returnData = true) {
    let query = this.client.from(table).insert(data);
    
    if (returnData) {
      query = query.select();
    }
    
    const { data: result, error } = await query;
    
    if (error) {
      console.error(`❌ Insert ${table} error:`, error);
      throw error;
    }
    
    return result;
  },
  
  /**
   * Update record(s)
   */
  async update(table, id, data) {
    const { data: result, error } = await this.client
      .from(table)
      .update(data)
      .eq('id', id)
      .select();
    
    if (error) {
      console.error(`❌ Update ${table} error:`, error);
      throw error;
    }
    
    return result?.[0];
  },
  
  /**
   * Delete record(s)
   */
  async delete(table, id) {
    const { error } = await this.client
      .from(table)
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error(`❌ Delete ${table} error:`, error);
      throw error;
    }
    
    return true;
  },
  
  /**
   * Count records
   */
  async count(table, filters = {}) {
    let query = this.client.from(table).select('id', { count: 'exact', head: true });
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        query = query.eq(key, value);
      }
    });
    
    const { count, error } = await query;
    
    if (error) {
      console.error(`❌ Count ${table} error:`, error);
      throw error;
    }
    
    return count;
  },
  
  // ==========================================
  // SPECIFIC QUERIES
  // ==========================================
  
  /**
   * Get leads with optional filters
   */
  async getLeads(filters = {}) {
    return this.select('leads', {
      columns: '*, assigned_to:user_profiles(full_name)',
      filters,
      order: { column: 'created_at', ascending: false }
    });
  },
  
  /**
   * Get clients with relations
   */
  async getClients(filters = {}) {
    return this.select('clients', {
      columns: '*, assigned_to:user_profiles(full_name), services:client_services(id, service_type, status)',
      filters,
      order: { column: 'company_name', ascending: true }
    });
  },
  
  /**
   * Get client detail
   */
  async getClient(id) {
    return this.select('clients', {
      columns: `
        *,
        assigned_to:user_profiles(id, full_name, email),
        services:client_services(*),
        campaigns:campaigns(*),
        invoices:invoices(id, invoice_number, total, status, due_date)
      `,
      filters: { id },
      single: true
    });
  },
  
  /**
   * Get campaigns with client info
   */
  async getCampaigns(filters = {}) {
    return this.select('campaigns', {
      columns: '*, client:clients(id, company_name)',
      filters,
      order: { column: 'created_at', ascending: false }
    });
  },
  
  /**
   * Get activities for entity
   */
  async getActivities(entityType, entityId, limit = 20) {
    return this.select('activities', {
      columns: '*, user:user_profiles(full_name, avatar_url)',
      filters: { entity_type: entityType, entity_id: entityId },
      order: { column: 'created_at', ascending: false },
      limit
    });
  },
  
  /**
   * Log activity
   */
  async logActivity(data) {
    return this.insert('activities', {
      ...data,
      user_id: Auth.user?.id,
      user_name: Auth.profile?.full_name
    });
  },
  
  /**
   * Get tasks for user
   */
  async getTasks(userId = null, status = null) {
    const filters = {};
    if (userId) filters.assignee = userId;
    if (status) filters.status = status;
    
    return this.select('tasks', {
      columns: '*, client:clients(company_name), assignee:user_profiles(full_name)',
      filters,
      order: { column: 'due_date', ascending: true }
    });
  },
  
  /**
   * Get dashboard stats
   */
  async getDashboardStats() {
    const [leads, clients, campaigns, tasks] = await Promise.all([
      this.client.from('leads').select('status', { count: 'exact' }),
      this.client.from('clients').select('status', { count: 'exact' }),
      this.client.from('campaigns').select('status', { count: 'exact' }),
      this.client.from('tasks').select('status', { count: 'exact' }).eq('status', 'todo')
    ]);
    
    return {
      leads: leads.count || 0,
      clients: clients.count || 0,
      campaigns: campaigns.count || 0,
      pendingTasks: tasks.count || 0
    };
  }
};

// Export
window.Database = Database;
window.db = Database; // Shortcut
