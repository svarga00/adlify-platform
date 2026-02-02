/**
 * ADLIFY PLATFORM - Database
 * @version 2.0.0
 */

const Database = {
  client: null,
  isConnected: false,
  
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
  
  getClient() {
    if (!this.client) this.init();
    return this.client;
  },
  
  /**
   * Query builder - returns Supabase query for chaining
   * Usage: Database.query('deals').select('*').eq('stage', 'new')
   */
  query(table) {
    if (!this.client) this.init();
    return this.client.from(table);
  },
  
  // CRUD HELPERS
  
  async select(table, options = {}) {
    const { columns = '*', filters = {}, order = null, limit = null, single = false } = options;
    
    let query = this.client.from(table).select(columns);
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        query = query.eq(key, value);
      }
    });
    
    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? false });
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
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
  
  // SPECIFIC QUERIES (backward compatible)
  
  async getLeads(filters = {}) {
    return this.select('leads', {
      columns: '*, assigned_to:user_profiles(full_name)',
      filters,
      order: { column: 'created_at', ascending: false }
    });
  },
  
  async getClients(filters = {}) {
    return this.select('clients', {
      columns: '*, assigned_to:user_profiles(full_name)',
      filters,
      order: { column: 'company_name', ascending: true }
    });
  },
  
  async getClient(id) {
    return this.select('clients', {
      columns: '*',
      filters: { id },
      single: true
    });
  },
  
  async getCampaigns(filters = {}) {
    return this.select('campaigns', {
      columns: '*, client:clients(id, company_name)',
      filters,
      order: { column: 'created_at', ascending: false }
    });
  },
  
  async getMessages(filters = {}) {
    return this.select('messages', {
      columns: '*',
      filters,
      order: { column: 'created_at', ascending: false }
    });
  }
};

window.Database = Database;
window.db = Database;
