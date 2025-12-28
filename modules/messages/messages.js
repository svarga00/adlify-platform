/**
 * ADLIFY PLATFORM - Messages Module
 * @version 1.0.0
 * Email management - Inbox, Outbox, Compose
 */

const MessagesModule = {
  id: 'messages',
  name: 'Správy',
  icon: '📧',
  title: 'Správy',
  subtitle: 'Email komunikácia',
  
  menu: { section: 'main', order: 25 },
  
  // State
  messages: [],
  templates: [],
  currentTab: 'inbox',
  selectedMessage: null,
  filters: { type: '', search: '', isRead: '' },
  isSyncing: false,
  
  // API URLs
  SEND_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/send-email',
  FETCH_URL: 'https://eidkljfaeqvvegiponwl.supabase.co/functions/v1/fetch-emails',
  
  init() { 
    console.log('📧 Messages module initialized'); 
  },
  
  async render(container, params = {}) {
    container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="animate-spin text-4xl">⏳</div></div>';
    
    try {
      await Promise.all([
        this.loadMessages(),
        this.loadTemplates()
      ]);
      
      container.innerHTML = this.template();
      this.setupEventListeners();
      
      if (params.tab) this.showTab(params.tab);
      if (params.compose) this.showComposeModal(params);
      
    } catch (error) {
      console.error('Messages error:', error);
      Utils.showEmpty(container, error.message, '❌');
    }
  },
  
  async loadMessages() {
    const filters = { is_deleted: false };
    if (this.filters.type) filters.type = this.filters.type;
    
    this.messages = await Database.select('messages', {
      filters,
      order: { column: 'created_at', ascending: false },
      limit: 100
    }) || [];
  },
  
  async loadTemplates() {
    this.templates = await Database.select('email_templates', {
      filters: { is_active: true }
    }) || [];
  },
  
  template() {
    const inboxCount = this.messages.filter(m => m.type === 'inbound').length;
    const unreadCount = this.messages.filter(m => m.type === 'inbound' && !m.is_read).length;
    const sentCount = this.messages.filter(m => m.type === 'outbound').length;
    
    return `
      <div class="flex gap-6 h-[calc(100vh-200px)]">
        <!-- Sidebar -->
        <div class="w-64 flex-shrink-0">
          <button onclick="MessagesModule.showComposeModal()" class="w-full gradient-bg text-white py-3 px-4 rounded-xl font-semibold mb-4 flex items-center justify-center gap-2 hover:opacity-90 transition">
            ✏️ Nová správa
          </button>
          
          <div class="card p-2">
            <button onclick="MessagesModule.showTab('inbox')" class="sidebar-btn ${this.currentTab === 'inbox' ? 'active' : ''}" data-tab="inbox">
              <span>📥</span>
              <span class="flex-1 text-left">Doručené</span>
              ${unreadCount > 0 ? `<span class="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">${unreadCount}</span>` : ''}
            </button>
            <button onclick="MessagesModule.showTab('sent')" class="sidebar-btn ${this.currentTab === 'sent' ? 'active' : ''}" data-tab="sent">
              <span>📤</span>
              <span class="flex-1 text-left">Odoslané</span>
              <span class="text-gray-400 text-sm">${sentCount}</span>
            </button>
            <button onclick="MessagesModule.showTab('starred')" class="sidebar-btn ${this.currentTab === 'starred' ? 'active' : ''}" data-tab="starred">
              <span>⭐</span>
              <span class="flex-1 text-left">Označené</span>
            </button>
            <button onclick="MessagesModule.showTab('templates')" class="sidebar-btn ${this.currentTab === 'templates' ? 'active' : ''}" data-tab="templates">
              <span>📋</span>
              <span class="flex-1 text-left">Šablóny</span>
            </button>
          </div>
          
          <div class="mt-4">
            <button onclick="MessagesModule.syncInbox()" class="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm flex items-center justify-center gap-2 ${this.isSyncing ? 'opacity-50' : ''}">
              <span class="${this.isSyncing ? 'animate-spin' : ''}">🔄</span>
              ${this.isSyncing ? 'Synchronizujem...' : 'Synchronizovať'}
            </button>
          </div>
        </div>
        
        <!-- Main Content -->
        <div class="flex-1 card p-0 overflow-hidden flex flex-col">
          <!-- Toolbar -->
          <div class="p-4 border-b flex items-center gap-4">
            <input type="text" placeholder="🔍 Hľadať v správach..." 
              class="flex-1 p-2 border rounded-lg" 
              onkeyup="MessagesModule.search(this.value)">
            <select onchange="MessagesModule.filterBy(this.value)" class="p-2 border rounded-lg">
              <option value="">Všetky</option>
              <option value="unread">Neprečítané</option>
              <option value="read">Prečítané</option>
            </select>
          </div>
          
          <!-- Messages List / Content -->
          <div class="flex-1 overflow-hidden flex">
            <div id="messages-list" class="w-96 border-r overflow-y-auto">
              ${this.renderMessagesList()}
            </div>
            <div id="message-detail" class="flex-1 overflow-y-auto p-6">
              ${this.renderMessageDetail()}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Compose Modal -->
      <div id="compose-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
            <h2 class="text-xl font-bold">✏️ Nová správa</h2>
            <button onclick="MessagesModule.closeComposeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
          </div>
          <div id="compose-content" class="p-6 overflow-y-auto flex-1">
            ${this.renderComposeForm()}
          </div>
          <div class="p-4 border-t flex gap-3 justify-between bg-gray-50">
            <div class="flex gap-2">
              <button onclick="MessagesModule.attachFile()" class="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">📎 Príloha</button>
              <select onchange="MessagesModule.loadTemplate(this.value)" class="px-4 py-2 border rounded-lg">
                <option value="">Vybrať šablónu...</option>
                ${this.templates.map(t => `<option value="${t.slug}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="flex gap-2">
              <button onclick="MessagesModule.closeComposeModal()" class="px-4 py-2 bg-gray-200 rounded-lg">Zrušiť</button>
              <button onclick="MessagesModule.sendEmail()" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold">📤 Odoslať</button>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .sidebar-btn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border-radius: 10px; transition: all 0.2s; text-align: left; }
        .sidebar-btn:hover { background: #f3f4f6; }
        .sidebar-btn.active { background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; }
        .message-item { padding: 16px; border-bottom: 1px solid #e5e7eb; cursor: pointer; transition: background 0.2s; }
        .message-item:hover { background: #f9fafb; }
        .message-item.active { background: #fef3f2; border-left: 3px solid #FF6B35; }
        .message-item.unread { background: #fffbeb; }
        .message-item.unread .message-subject { font-weight: 600; }
      </style>
    `;
  },
  
  renderMessagesList() {
    let filtered = [...this.messages];
    
    // Filter by tab
    if (this.currentTab === 'inbox') {
      filtered = filtered.filter(m => m.type === 'inbound');
    } else if (this.currentTab === 'sent') {
      filtered = filtered.filter(m => m.type === 'outbound');
    } else if (this.currentTab === 'starred') {
      filtered = filtered.filter(m => m.is_starred);
    } else if (this.currentTab === 'templates') {
      return this.renderTemplatesList();
    }
    
    // Search filter
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      filtered = filtered.filter(m => 
        (m.subject || '').toLowerCase().includes(search) ||
        (m.from_email || '').toLowerCase().includes(search) ||
        (m.to_email || '').toLowerCase().includes(search)
      );
    }
    
    if (filtered.length === 0) {
      return `
        <div class="flex flex-col items-center justify-center h-full text-gray-400 p-8">
          <span class="text-4xl mb-4">📭</span>
          <p>Žiadne správy</p>
        </div>
      `;
    }
    
    return filtered.map(m => {
      const isInbound = m.type === 'inbound';
      const displayEmail = isInbound ? m.from_email : m.to_email;
      const displayName = isInbound ? (m.from_name || m.from_email) : (m.to_name || m.to_email);
      const isActive = this.selectedMessage?.id === m.id;
      
      return `
        <div class="message-item ${isActive ? 'active' : ''} ${!m.is_read && isInbound ? 'unread' : ''}" 
             onclick="MessagesModule.selectMessage('${m.id}')">
          <div class="flex items-center justify-between mb-1">
            <span class="font-medium truncate flex-1">${displayName}</span>
            <span class="text-xs text-gray-400">${Utils.timeAgo(m.created_at)}</span>
          </div>
          <div class="message-subject text-sm truncate">${m.subject || '(bez predmetu)'}</div>
          <div class="flex items-center gap-2 mt-2">
            ${m.is_starred ? '<span>⭐</span>' : ''}
            ${this.parseAttachments(m.attachments).length > 0 ? '<span>📎</span>' : ''}
            ${m.status === 'sent' ? '<span class="text-xs text-green-600">✓ Odoslané</span>' : ''}
            ${m.status === 'failed' ? '<span class="text-xs text-red-600">✗ Chyba</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },
  
  renderTemplatesList() {
    if (this.templates.length === 0) {
      return `
        <div class="flex flex-col items-center justify-center h-full text-gray-400 p-8">
          <span class="text-4xl mb-4">📋</span>
          <p>Žiadne šablóny</p>
        </div>
      `;
    }
    
    return this.templates.map(t => `
      <div class="message-item" onclick="MessagesModule.previewTemplate('${t.slug}')">
        <div class="flex items-center justify-between mb-1">
          <span class="font-medium">${t.name}</span>
          <span class="text-xs px-2 py-1 bg-gray-100 rounded">${t.category}</span>
        </div>
        <div class="text-sm text-gray-500 truncate">${t.subject}</div>
      </div>
    `).join('');
  },
  
  renderMessageDetail() {
    if (this.currentTab === 'templates' && this.selectedMessage) {
      return this.renderTemplatePreview(this.selectedMessage);
    }
    
    if (!this.selectedMessage) {
      return `
        <div class="flex flex-col items-center justify-center h-full text-gray-400">
          <span class="text-6xl mb-4">📬</span>
          <p>Vyber správu pre zobrazenie</p>
        </div>
      `;
    }
    
    const m = this.selectedMessage;
    const isInbound = m.type === 'inbound';
    const attachments = this.parseAttachments(m.attachments);
    
    return `
      <div class="max-w-3xl">
        <!-- Header -->
        <div class="flex items-start justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold mb-2">${m.subject || '(bez predmetu)'}</h2>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span>${isInbound ? 'Od:' : 'Komu:'} <strong>${isInbound ? (m.from_name || m.from_email) : (m.to_name || m.to_email)}</strong></span>
              <span>${Utils.formatDate(m.created_at, 'full')}</span>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="MessagesModule.toggleStar('${m.id}')" class="p-2 hover:bg-gray-100 rounded-lg" title="Označiť">
              ${m.is_starred ? '⭐' : '☆'}
            </button>
            ${isInbound ? `
              <button onclick="MessagesModule.replyTo('${m.id}')" class="p-2 hover:bg-gray-100 rounded-lg" title="Odpovedať">
                ↩️
              </button>
            ` : ''}
            <button onclick="MessagesModule.deleteMessage('${m.id}')" class="p-2 hover:bg-gray-100 rounded-lg text-red-500" title="Vymazať">
              🗑️
            </button>
          </div>
        </div>
        
        <!-- Metadata -->
        ${m.lead_id ? `
          <div class="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
            <span class="text-blue-600">🔗 Prepojené s leadom</span>
            <a href="#leads?id=${m.lead_id}" class="ml-2 text-blue-700 underline">Zobraziť lead</a>
          </div>
        ` : ''}
        
        <!-- Attachments -->
        ${attachments.length > 0 ? `
          <div class="mb-4 p-3 bg-gray-50 rounded-lg">
            <p class="text-sm font-medium mb-2">📎 Prílohy (${attachments.length})</p>
            <div class="flex flex-wrap gap-2">
              ${attachments.map(a => `
                <span class="px-3 py-1 bg-white border rounded-lg text-sm">${a.filename}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <!-- Body -->
        <div class="prose max-w-none border-t pt-6">
          ${m.body_html || `<p class="whitespace-pre-wrap">${m.body_text || 'Žiadny obsah'}</p>`}
        </div>
      </div>
    `;
  },
  
  renderTemplatePreview(template) {
    return `
      <div class="max-w-3xl">
        <div class="flex items-start justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold mb-2">${template.name}</h2>
            <p class="text-gray-500">${template.description || ''}</p>
          </div>
          <button onclick="MessagesModule.useTemplate('${template.slug}')" class="px-4 py-2 gradient-bg text-white rounded-lg">
            Použiť šablónu
          </button>
        </div>
        
        <div class="mb-4">
          <label class="text-sm font-medium text-gray-500">Predmet:</label>
          <p class="font-medium">${template.subject}</p>
        </div>
        
        <div class="mb-4">
          <label class="text-sm font-medium text-gray-500">Premenné:</label>
          <div class="flex flex-wrap gap-2 mt-1">
            ${(JSON.parse(template.variables || '[]')).map(v => `
              <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">{{${v}}}</span>
            `).join('')}
          </div>
        </div>
        
        <div class="border-t pt-4">
          <label class="text-sm font-medium text-gray-500">Náhľad:</label>
          <div class="mt-2 p-4 bg-gray-50 rounded-lg prose max-w-none">
            ${template.body_html}
          </div>
        </div>
      </div>
    `;
  },
  
  renderComposeForm(prefill = {}) {
    return `
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Komu</label>
          <input type="email" id="compose-to" value="${prefill.to || ''}" 
            placeholder="email@example.com" class="w-full p-3 border rounded-xl">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Meno príjemcu (voliteľné)</label>
          <input type="text" id="compose-to-name" value="${prefill.toName || ''}" 
            placeholder="Ján Novák" class="w-full p-3 border rounded-xl">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Predmet</label>
          <input type="text" id="compose-subject" value="${prefill.subject || ''}" 
            placeholder="Predmet správy" class="w-full p-3 border rounded-xl">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Správa</label>
          <textarea id="compose-body" rows="12" 
            placeholder="Obsah správy..." class="w-full p-3 border rounded-xl">${prefill.body || ''}</textarea>
        </div>
        <div id="compose-attachments" class="hidden">
          <label class="block text-sm font-medium mb-1">Prílohy</label>
          <div id="attachments-list" class="flex flex-wrap gap-2"></div>
        </div>
        
        ${prefill.leadId ? `<input type="hidden" id="compose-lead-id" value="${prefill.leadId}">` : ''}
      </div>
    `;
  },
  
  // ==========================================
  // ACTIONS
  // ==========================================
  
  showTab(tab) {
    this.currentTab = tab;
    this.selectedMessage = null;
    document.querySelectorAll('.sidebar-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
    document.getElementById('message-detail').innerHTML = this.renderMessageDetail();
  },
  
  search(value) {
    this.filters.search = value;
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
  },
  
  filterBy(value) {
    this.filters.isRead = value;
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
  },
  
  async selectMessage(id) {
    const message = this.messages.find(m => m.id === id);
    if (!message) return;
    
    this.selectedMessage = message;
    
    // Mark as read
    if (message.type === 'inbound' && !message.is_read) {
      await Database.update('messages', id, { is_read: true });
      message.is_read = true;
    }
    
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
    document.getElementById('message-detail').innerHTML = this.renderMessageDetail();
  },
  
  previewTemplate(slug) {
    const template = this.templates.find(t => t.slug === slug);
    if (template) {
      this.selectedMessage = template;
      document.getElementById('message-detail').innerHTML = this.renderTemplatePreview(template);
    }
  },
  
  useTemplate(slug) {
    this.loadTemplate(slug);
    this.showComposeModal();
  },
  
  // Callback po odoslaní (napr. pre označenie leadu)
  onSentCallback: null,
  
  showComposeModal(prefill = {}) {
    // Uložíme callback ak bol poskytnutý
    this.onSentCallback = prefill.onSent || null;
    
    // Ak modal neexistuje (sme v inom module), vytvor ho
    if (!document.getElementById('compose-modal')) {
      const modalHtml = `
        <div id="compose-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
          <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div class="p-4 border-b flex items-center justify-between bg-gradient-to-r from-orange-500 to-pink-500 text-white">
              <h2 class="text-xl font-bold">✏️ Nová správa</h2>
              <button onclick="MessagesModule.closeComposeModal()" class="p-2 hover:bg-white/20 rounded-lg">✕</button>
            </div>
            <div id="compose-content" class="p-6 overflow-y-auto flex-1"></div>
            <div class="p-4 border-t flex gap-3 justify-end bg-gray-50">
              <button onclick="MessagesModule.closeComposeModal()" class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Zrušiť</button>
              <button onclick="MessagesModule.sendEmail()" class="px-6 py-2 gradient-bg text-white rounded-lg font-semibold hover:opacity-90">📤 Odoslať</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('compose-content').innerHTML = this.renderComposeForm(prefill);
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },
  
  closeComposeModal() {
    const modal = document.getElementById('compose-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    this.onSentCallback = null; // Reset callback
  },
  
  loadTemplate(slug) {
    if (!slug) return;
    const template = this.templates.find(t => t.slug === slug);
    if (template) {
      document.getElementById('compose-subject').value = template.subject;
      // Convert HTML to plain text for textarea
      const plainText = template.body_html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      document.getElementById('compose-body').value = plainText;
    }
  },
  
  async sendEmail() {
    const to = document.getElementById('compose-to').value.trim();
    const toName = document.getElementById('compose-to-name').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const body = document.getElementById('compose-body').value.trim();
    const leadId = document.getElementById('compose-lead-id')?.value;
    
    if (!to || !subject || !body) {
      Utils.toast('Vyplň všetky povinné polia', 'warning');
      return;
    }
    
    Utils.toast('Odosielam email...', 'info');
    
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      // Convert plain text to HTML
      const htmlBody = body
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
      
      const response = await fetch(this.SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to,
          toName,
          subject,
          htmlBody,
          textBody: body,
          leadId
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        Utils.toast('Email odoslaný! ✉️', 'success');
        
        // Zavolaj callback ak existuje (napr. pre označenie leadu)
        if (this.onSentCallback && typeof this.onSentCallback === 'function') {
          this.onSentCallback();
        }
        
        this.closeComposeModal();
        await this.loadMessages();
        document.getElementById('messages-list').innerHTML = this.renderMessagesList();
      } else {
        throw new Error(result.error || 'Chyba pri odosielaní');
      }
    } catch (error) {
      console.error('Send error:', error);
      Utils.toast(`Chyba: ${error.message}`, 'error');
    }
  },
  
  async syncInbox() {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    Utils.toast('Synchronizujem inbox...', 'info');
    
    try {
      const session = await Database.client.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      
      const response = await fetch(this.FETCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ limit: 50 })
      });
      
      const result = await response.json();
      
      if (result.success) {
        Utils.toast(`Synchronizované! ${result.fetched} nových správ`, 'success');
        await this.loadMessages();
        document.getElementById('messages-list').innerHTML = this.renderMessagesList();
      } else {
        throw new Error(result.error || 'Chyba pri synchronizácii');
      }
    } catch (error) {
      console.error('Sync error:', error);
      Utils.toast(`Chyba: ${error.message}`, 'error');
    } finally {
      this.isSyncing = false;
    }
  },
  
  async toggleStar(id) {
    const message = this.messages.find(m => m.id === id);
    if (!message) return;
    
    const newValue = !message.is_starred;
    await Database.update('messages', id, { is_starred: newValue });
    message.is_starred = newValue;
    
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
    document.getElementById('message-detail').innerHTML = this.renderMessageDetail();
  },
  
  async deleteMessage(id) {
    if (!await Utils.confirm('Vymazať túto správu?')) return;
    
    await Database.update('messages', id, { is_deleted: true });
    this.messages = this.messages.filter(m => m.id !== id);
    this.selectedMessage = null;
    
    document.getElementById('messages-list').innerHTML = this.renderMessagesList();
    document.getElementById('message-detail').innerHTML = this.renderMessageDetail();
    Utils.toast('Správa vymazaná', 'success');
  },
  
  replyTo(id) {
    const message = this.messages.find(m => m.id === id);
    if (!message) return;
    
    this.showComposeModal({
      to: message.from_email,
      toName: message.from_name,
      subject: `Re: ${message.subject}`,
      body: `\n\n---\nPôvodná správa od ${message.from_name || message.from_email}:\n${message.body_text || ''}`
    });
  },
  
  // For sending proposal from leads module
  async sendProposal(lead, proposalHtml) {
    if (!lead.email) {
      Utils.toast('Lead nemá email', 'warning');
      return;
    }
    
    this.showComposeModal({
      to: lead.email,
      toName: lead.contact_person || lead.company_name,
      subject: `Návrh marketingovej stratégie pre ${lead.company_name}`,
      body: `Dobrý deň,

dovoľujeme si Vám zaslať návrh marketingovej stratégie pre ${lead.company_name}.

V prílohe nájdete kompletnú analýzu vašej online prítomnosti a konkrétne odporúčania ako získať viac zákazníkov prostredníctvom online reklamy.

V prípade záujmu ma neváhajte kontaktovať.

S pozdravom,
Tím Adlify`,
      leadId: lead.id
    });
  },
  
  setupEventListeners() {
    // Any additional event listeners
  },
  
  // Helper function to safely parse attachments
  parseAttachments(attachments) {
    if (!attachments) return [];
    if (Array.isArray(attachments)) return attachments;
    if (typeof attachments === 'string') {
      try {
        return JSON.parse(attachments) || [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }
};

// Export
window.MessagesModule = MessagesModule;
