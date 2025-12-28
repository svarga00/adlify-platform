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
    
    // Get profile
    const { data: profile } = await Database.client
      .from('user_profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();
    
    this.profile = profile;
    
    // If team member, load team data
    if (profile && ['owner', 'admin', 'employee'].includes(profile.role)) {
      const { data: teamMember } = await Database.client
        .from('team_members')
        .select('*')
        .eq('user_id', this.user.id)
        .single();
      
      this.teamMember = teamMember;
    }
    
    // If client, load client data
    if (profile && profile.role === 'client') {
      const { data: clientUser } = await Database.client
        .from('client_users')
        .select('*, client:clients(*)')
        .eq('user_id', this.user.id)
        .single();
      
      this.clientUser = clientUser;
    }
    
    // Update last login
    await Database.client
      .from('user_profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', this.user.id);
    
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
   * Check if user is client
   */
  isClient() {
    return this.profile?.role === 'client';
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
    
    // Get permissions based on user type
    let permissions;
    
    if (this.teamMember) {
      permissions = this.teamMember.permissions;
    } else if (this.clientUser) {
      permissions = this.clientUser.permissions;
    } else {
      return false;
    }
    
    // Check permission
    return permissions?.[resource]?.[action] === true;
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
    if (this.isClient()) {
      return '/portal/';
    }
    return '/admin/';
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
