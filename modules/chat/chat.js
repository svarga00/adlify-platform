/**
 * ADLIFY V2 - Chat Module
 * Unified inbox pre všetku komunikáciu
 */

const ChatModule = {
    name: 'chat',
    title: 'Chat',
    icon: '💬',
    
    conversations: [],
    selectedConversation: null,
    messages: [],
    
    async render(container) {
        container.innerHTML = `
        <div class="chat-layout" style="display:flex;gap:0;height:calc(100vh - 112px);margin:-24px;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <!-- Sidebar -->
            <div class="chat-sidebar" style="width:360px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;flex-shrink:0;">
                <!-- Header -->
                <div style="padding:16px;border-bottom:1px solid #e2e8f0;">
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f1f5f9;border-radius:8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="chat-search" placeholder="Hľadať konverzáciu..." style="border:none;outline:none;background:none;flex:1;font-size:14px;">
                    </div>
                </div>
                
                <!-- Filters -->
                <div style="padding:12px 16px;display:flex;gap:8px;border-bottom:1px solid #e2e8f0;">
                    <button class="chat-filter active" data-filter="all" onclick="ChatModule.setFilter('all')" style="padding:6px 12px;background:#f97316;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Všetky</button>
                    <button class="chat-filter" data-filter="open" onclick="ChatModule.setFilter('open')" style="padding:6px 12px;background:#f1f5f9;color:#64748b;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Otvorené</button>
                    <button class="chat-filter" data-filter="pending" onclick="ChatModule.setFilter('pending')" style="padding:6px 12px;background:#f1f5f9;color:#64748b;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Čakajúce</button>
                </div>
                
                <!-- Conversation list -->
                <div id="conversation-list" style="flex:1;overflow-y:auto;"></div>
            </div>
            
            <!-- Chat area -->
            <div class="chat-area" style="flex:1;display:flex;flex-direction:column;">
                <div id="chat-content" style="flex:1;display:flex;flex-direction:column;">
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;">
                        <div style="text-align:center;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <p>Vyberte konverzáciu</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        await this.loadConversations();
        this.bindEvents();
        
        // Check URL params
        const params = Router.getParams();
        if (params.id) {
            this.selectConversation(params.id);
        }
    },
    
    async loadConversations() {
        const list = document.getElementById('conversation-list');
        
        try {
            const { data, error } = await Database.query('conversations')
                .select('*, contacts(first_name, last_name, email), companies(name)')
                .order('last_message_at', { ascending: false });
            
            if (error?.code === '42P01') {
                // Fallback - show empty state
                list.innerHTML = `
                <div style="padding:40px;text-align:center;color:#94a3b8;">
                    <p>Conversations tabuľka neexistuje.</p>
                    <p style="margin-top:8px;font-size:12px;">Spustite migráciu v Supabase.</p>
                </div>
                `;
                return;
            }
            
            this.conversations = data || [];
            this.renderConversationList();
        } catch (e) {
            console.error('Load conversations error:', e);
            list.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">Chyba pri načítaní</div>';
        }
    },
    
    renderConversationList(filter = 'all') {
        const list = document.getElementById('conversation-list');
        let items = this.conversations;
        
        if (filter === 'open') items = items.filter(c => c.status === 'open');
        if (filter === 'pending') items = items.filter(c => c.status === 'pending');
        
        if (!items.length) {
            list.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">Žiadne konverzácie</div>';
            return;
        }
        
        const statusColors = {
            open: '#22c55e',
            pending: '#f59e0b',
            resolved: '#94a3b8'
        };
        
        list.innerHTML = items.map(c => {
            const name = c.contacts ? `${c.contacts.first_name || ''} ${c.contacts.last_name || ''}`.trim() : c.companies?.name || 'Neznámy';
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const isSelected = this.selectedConversation?.id === c.id;
            const hasUnread = c.unread_count > 0;
            
            return `
            <div class="conversation-item" data-id="${c.id}" onclick="ChatModule.selectConversation('${c.id}')" 
                 style="padding:16px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${isSelected ? '#fff7ed' : 'white'};transition:background 0.15s;"
                 onmouseenter="if(!this.classList.contains('selected'))this.style.background='#f8fafc'"
                 onmouseleave="if(!this.classList.contains('selected'))this.style.background='${isSelected ? '#fff7ed' : 'white'}'">
                <div style="display:flex;gap:12px;">
                    <div style="position:relative;">
                        <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;">${initials}</div>
                        <div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:${statusColors[c.status] || '#94a3b8'};border:2px solid white;"></div>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                            <span style="font-weight:${hasUnread ? '700' : '500'};font-size:14px;color:#0f172a;">${this.escapeHtml(name)}</span>
                            <span style="font-size:11px;color:#94a3b8;">${c.last_message_at ? this.timeAgo(c.last_message_at) : ''}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <p style="font-size:13px;color:${hasUnread ? '#0f172a' : '#64748b'};font-weight:${hasUnread ? '500' : 'normal'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">
                                ${c.last_message_preview || 'Žiadne správy'}
                            </p>
                            ${hasUnread ? `<span style="background:#ef4444;color:white;font-size:11px;font-weight:600;padding:2px 6px;border-radius:10px;">${c.unread_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },
    
    setFilter(filter) {
        document.querySelectorAll('.chat-filter').forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.style.background = '#f97316';
                btn.style.color = 'white';
                btn.classList.add('active');
            } else {
                btn.style.background = '#f1f5f9';
                btn.style.color = '#64748b';
                btn.classList.remove('active');
            }
        });
        this.renderConversationList(filter);
    },
    
    async selectConversation(id) {
        const conversation = this.conversations.find(c => c.id === id);
        if (!conversation) return;
        
        this.selectedConversation = conversation;
        this.renderConversationList();
        
        // Load messages
        await this.loadMessages(id);
        
        // Mark as read
        if (conversation.unread_count > 0) {
            await Database.query('conversations')
                .update({ unread_count: 0 })
                .eq('id', id);
            conversation.unread_count = 0;
            this.renderConversationList();
        }
    },
    
    async loadMessages(conversationId) {
        const content = document.getElementById('chat-content');
        const c = this.selectedConversation;
        const name = c.contacts ? `${c.contacts.first_name || ''} ${c.contacts.last_name || ''}`.trim() : c.companies?.name || 'Konverzácia';
        
        try {
            const { data: messages } = await Database.query('conversation_messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });
            
            this.messages = messages || [];
            
            content.innerHTML = `
            <!-- Header -->
            <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;">${name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>
                    <div>
                        <h3 style="font-size:16px;font-weight:600;color:#0f172a;">${this.escapeHtml(name)}</h3>
                        <p style="font-size:12px;color:#64748b;">${c.channel || 'email'} · ${c.status}</p>
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button onclick="ChatModule.resolveConversation()" style="padding:8px 12px;background:#f0fdf4;color:#22c55e;border:none;border-radius:6px;font-size:13px;cursor:pointer;">✓ Vyriešené</button>
                </div>
            </div>
            
            <!-- Messages -->
            <div id="messages-container" style="flex:1;overflow-y:auto;padding:20px;">
                ${this.messages.map(m => this.renderMessage(m)).join('')}
            </div>
            
            <!-- Input -->
            <div style="padding:16px 20px;border-top:1px solid #e2e8f0;">
                <div style="display:flex;gap:12px;">
                    <textarea id="message-input" placeholder="Napíšte správu..." rows="2" style="flex:1;padding:12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:none;font-family:inherit;"></textarea>
                    <button onclick="ChatModule.sendMessage()" style="padding:12px 20px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;align-self:flex-end;">
                        Odoslať
                    </button>
                </div>
                <div style="display:flex;gap:12px;margin-top:8px;">
                    <button onclick="ChatModule.addInternalNote()" style="padding:6px 12px;background:#f1f5f9;color:#64748b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">+ Interná poznámka</button>
                </div>
            </div>
            `;
            
            // Scroll to bottom
            const container = document.getElementById('messages-container');
            container.scrollTop = container.scrollHeight;
            
        } catch (e) {
            console.error('Load messages error:', e);
            content.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">Chyba pri načítaní správ</div>';
        }
    },
    
    renderMessage(m) {
        const isOutgoing = m.sender_type === 'agent' || m.sender_type === 'bot';
        const isInternal = m.is_internal;
        const isAIDraft = m.is_ai_draft;
        
        if (isInternal) {
            return `
            <div style="max-width:80%;margin:12px auto;padding:12px 16px;background:#fffbeb;border-radius:8px;border:1px dashed #f59e0b;">
                <div style="font-size:11px;color:#b45309;margin-bottom:4px;">🔒 Interná poznámka</div>
                <div style="font-size:14px;color:#78350f;">${this.escapeHtml(m.content)}</div>
                <div style="font-size:11px;color:#b45309;margin-top:8px;">${m.sender_name || 'Tím'} · ${this.formatTime(m.created_at)}</div>
            </div>
            `;
        }
        
        if (isAIDraft) {
            return `
            <div style="max-width:80%;margin:12px 0 12px auto;">
                <div style="padding:12px 16px;background:#f0f9ff;border-radius:12px 12px 4px 12px;border:1px solid #bae6fd;">
                    <div style="font-size:11px;color:#0369a1;margin-bottom:4px;">✨ AI Draft - čaká na schválenie</div>
                    <div style="font-size:14px;color:#0c4a6e;">${this.escapeHtml(m.content)}</div>
                </div>
                <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
                    <button onclick="ChatModule.approveDraft('${m.id}')" style="padding:6px 12px;background:#22c55e;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Schváliť</button>
                    <button onclick="ChatModule.editDraft('${m.id}')" style="padding:6px 12px;background:#f1f5f9;color:#64748b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Upraviť</button>
                </div>
            </div>
            `;
        }
        
        return `
        <div style="max-width:80%;margin:12px 0;${isOutgoing ? 'margin-left:auto;' : ''}">
            <div style="padding:12px 16px;background:${isOutgoing ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#f1f5f9'};color:${isOutgoing ? 'white' : '#0f172a'};border-radius:${isOutgoing ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};">
                ${this.escapeHtml(m.content)}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;${isOutgoing ? 'text-align:right;' : ''}">${m.sender_name || (isOutgoing ? 'Tím' : 'Klient')} · ${this.formatTime(m.created_at)}</div>
        </div>
        `;
    },
    
    async sendMessage() {
        const input = document.getElementById('message-input');
        const content = input.value.trim();
        if (!content || !this.selectedConversation) return;
        
        try {
            await Database.query('conversation_messages').insert({
                conversation_id: this.selectedConversation.id,
                sender_type: 'agent',
                sender_id: Auth.user?.id,
                sender_name: Auth.user?.full_name || 'Tím',
                content: content,
                created_at: new Date().toISOString()
            });
            
            input.value = '';
            await this.loadMessages(this.selectedConversation.id);
            await this.loadConversations();
        } catch (e) {
            Utils.toast('Chyba pri odosielaní', 'error');
        }
    },
    
    async addInternalNote() {
        const note = prompt('Interná poznámka (klient nevidí):');
        if (!note || !this.selectedConversation) return;
        
        try {
            await Database.query('conversation_messages').insert({
                conversation_id: this.selectedConversation.id,
                sender_type: 'agent',
                sender_id: Auth.user?.id,
                sender_name: Auth.user?.full_name || 'Tím',
                content: note,
                is_internal: true,
                created_at: new Date().toISOString()
            });
            
            await this.loadMessages(this.selectedConversation.id);
        } catch (e) {
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async approveDraft(messageId) {
        try {
            await Database.query('conversation_messages')
                .update({ is_ai_draft: false, ai_approved_at: new Date().toISOString() })
                .eq('id', messageId);
            
            Utils.toast('Draft schválený a odoslaný', 'success');
            await this.loadMessages(this.selectedConversation.id);
        } catch (e) {
            Utils.toast('Chyba', 'error');
        }
    },
    
    editDraft(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;
        
        const input = document.getElementById('message-input');
        input.value = message.content;
        input.focus();
        
        // Delete draft
        Database.query('conversation_messages').delete().eq('id', messageId);
    },
    
    async resolveConversation() {
        if (!this.selectedConversation) return;
        
        try {
            await Database.query('conversations')
                .update({ status: 'resolved' })
                .eq('id', this.selectedConversation.id);
            
            Utils.toast('Konverzácia vyriešená', 'success');
            await this.loadConversations();
        } catch (e) {
            Utils.toast('Chyba', 'error');
        }
    },
    
    bindEvents() {
        document.getElementById('chat-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        
        // Send on Enter (without Shift)
        document.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'message-input') {
                e.preventDefault();
                this.sendMessage();
            }
        });
    },
    
    timeAgo(date) {
        const s = Math.floor((new Date() - new Date(date)) / 1000);
        if (s < 60) return 'teraz';
        if (s < 3600) return `${Math.floor(s / 60)}m`;
        if (s < 86400) return `${Math.floor(s / 3600)}h`;
        return `${Math.floor(s / 86400)}d`;
    },
    
    formatTime(date) {
        return new Date(date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    },
    
    escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};

window.ChatModule = ChatModule;
