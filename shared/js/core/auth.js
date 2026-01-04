/**
 * ADLIFY PLATFORM - Authentication
 * @version 1.0.0
 * 
 * Handles user authentication, sessions, and permissions
 */

const Auth = {
  user: null,
  profile: null,
  teamMember: null,
  clientUser: null,
  
  /**
   * Initialize auth - check session
   */
  async init() {
    if (!Database.client) {
      console.warn('⚠️ Database not initialized');
      return false;
    }
    
    try {
      // Get current session
      const { data: { session }, error } = await Database.client.auth.getSession();
      
      if (error || !session) {
        console.log('🔒 No active session');
        return false;
      }
      
      this.user = session.user;
      await this.loadProfile();
      
      console.log('🔓 Auth initialized:', this.profile?.full_name || this.user.email);
      return true;
      
    } catch (e) {
      console.error('❌ Auth init error:', e);
      return false;
    }
  },
  
  /**
   * Load user profile with permissions
   */
  async loadProfile() {
    if (!this.user) return null;
    
    // Get profile (may not exist for new users)
    const { data: profile, error: profileError } = await Database.client
      .from('user_profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();
    
    if (profileError) console.log('⚠️ Profile error:', profileError.message);
    this.profile = profile;
    
    // Check if user is team member (directly from team_members table)
    const { data: teamMember, error: teamError } = await Database.client
      .from('team_members')
      .select('*')
      .eq('user_id', this.user.id)
      .eq('status', 'active')
      .single();
    
    if (teamError) console.log('⚠️ Team member error:', teamError.message);
    console.log('👤 Team member loaded:', teamMember);
    this.teamMember = teamMember;
    
    // If client, load client data
    if (profile && profile.role === 'client') {
      const { data: clientUser } = await Database.client
        .from('client_users')
        .select('*, client:clients(*)')
        .eq('user_id', this.user.id)
        .single();
      
      this.clientUser = clientUser;
    }
    
    // Update last login if profile exists
    if (profile) {
      await Database.client
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', this.user.id);
    }
    
    return this.profile;
  },
  
  /**
   * Login with email and password
   */
  async login(email, password) {
    const { data, error } = await Database.client.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    this.user = data.user;
    await this.loadProfile();
    
    return data;
  },
  
  /**
   * Logout
   */
  async logout() {
    await Database.client.auth.signOut();
    this.user = null;
    this.profile = null;
    this.teamMember = null;
    this.clientUser = null;
    window.location.href = '/login.html';
  },
  
  /**
   * Register new user
   */
  async register(email, password, metadata = {}) {
    const { data, error } = await Database.client.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Reset password request
   */
  async resetPassword(email) {
    const { error } = await Database.client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    
    if (error) throw error;
    return true;
  },
  
  /**
   * Update password
   */
  async updatePassword(newPassword) {
    const { error } = await Database.client.auth.updateUser({
      password: newPassword
    });
    
    if (error) throw error;
    return true;
  },
  
  // ==========================================
  // PERMISSIONS
  // ==========================================
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.user;
  },
  
  /**
   * Check if user is team member (not client)
   */
  isTeamMember() {
    return !!this.teamMember;
  },
  
  /**
   * Check if user is client (and NOT team member)
   */
  isClient() {
    // Team member má prioritu
    if (this.teamMember) return false;
    return this.profile?.role === 'client' || !!this.clientUser;
  },
  
  /**
   * Check if user is owner
   */
  isOwner() {
    return this.profile?.role === 'owner' || this.teamMember?.role === 'owner';
  },
  
  /**
   * Check if user is admin (owner or admin)
   */
  isAdmin() {
    return this.isOwner() || this.teamMember?.role === 'admin';
  },
  
  /**
   * Get user role
   */
  getRole() {
    if (this.teamMember) return this.teamMember.role;
    if (this.clientUser) return 'client';
    return this.profile?.role || 'unknown';
  },
  
  /**
   * Check permission
   * @param {string} resource - Resource name (leads, clients, etc.)
   * @param {string} action - Action (view, create, edit, delete)
   */
  can(resource, action) {
    // Owner can do everything
    if (this.isOwner()) return true;
    
    // Admin can do almost everything
    if (this.isAdmin()) return true;
    
    // Team members
    if (this.teamMember) {
      // 1. Check custom_permissions first (individuálne oprávnenia)
      if (this.teamMember.custom_permissions) {
        const customPerm = this.teamMember.custom_permissions[resource]?.[action];
        if (customPerm !== undefined) {
          return customPerm === true;
        }
      }
      
      // 2. Fallback to role-based permissions
      const role = this.teamMember.role;
      
      // Everyone can view
      if (action === 'view') return true;
      
      // Sales can manage leads and messages
      if (role === 'sales' && ['leads', 'messages'].includes(resource)) return true;
      
      // Manager can manage clients, projects, tasks
      if (role === 'manager' && ['leads', 'clients', 'projects', 'tasks', 'messages'].includes(resource)) return true;
      
      // Support can manage messages and tasks
      if (role === 'support' && ['messages', 'tasks'].includes(resource)) return true;
      
      return false;
    }
    
    // Clients have limited permissions
    if (this.clientUser) {
      const permissions = this.clientUser.permissions;
      return permissions?.[resource]?.[action] === true;
    }
    
    return false;
  },
  
  /**
   * Get client ID (for client users)
   */
  getClientId() {
    return this.clientUser?.client_id || null;
  },
  
  /**
   * Get org ID
   */
  getOrgId() {
    return this.teamMember?.org_id || this.profile?.org_id || null;
  },
  
  // ==========================================
  // USER MANAGEMENT
  // ==========================================
  
  /**
   * Invite user (team member or client)
   */
  async inviteUser(email, role, options = {}) {
    // This would typically call a Supabase Edge Function
    // For now, we'll use Supabase's built-in invite
    
    const { data, error } = await Database.client.auth.admin.inviteUserByEmail(email, {
      data: {
        role,
        ...options
      }
    });
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Update profile
   */
  async updateProfile(data) {
    const { error } = await Database.client
      .from('user_profiles')
      .update(data)
      .eq('id', this.user.id);
    
    if (error) throw error;
    
    // Reload profile
    await this.loadProfile();
    return this.profile;
  },
  
  // ==========================================
  // HELPERS
  // ==========================================
  
  /**
   * Get redirect URL based on role
   */
  getRedirectUrl() {
    console.log('🔀 getRedirectUrl:', { isClient: this.isClient(), isTeamMember: this.isTeamMember(), teamMember: this.teamMember });
    
    // Ak nie je ani team member ani client, odhlásiť
    if (!this.isTeamMember() && !this.isClient()) {
      console.log('❌ User is neither team member nor client - logging out');
      alert('Váš účet nie je priradený k tímu. Kontaktujte administrátora.');
      this.logout();
      return '/login.html';
    }
    
    if (this.isClient()) {
      return '/portal/';
    }
    return '/admin/index.html';
  },
  
  /**
   * Require auth - redirect if not logged in
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
  
  /**
   * Require team member - redirect if client
   */
  requireTeam() {
    if (!this.requireAuth()) return false;
    if (!this.isTeamMember()) {
      window.location.href = '/portal/';
      return false;
    }
    return true;
  },
  
  /**
   * Require admin - redirect if not admin
   */
  requireAdmin() {
    if (!this.requireAuth()) return false;
    if (!this.isAdmin()) {
      window.location.href = this.getRedirectUrl();
      return false;
    }
    return true;
  }
};

// Export
window.Auth = Auth;
