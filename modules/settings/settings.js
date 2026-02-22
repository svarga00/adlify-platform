// =====================================================
// ADLIFY - Settings Module v2.0
// Brand Management + Email Accounts + Signatures
// =====================================================

const SettingsModule = {
    id: 'settings',
    name: 'Nastavenia',
    icon: '⚙️',
    title: 'Nastavenia',
    menu: { section: 'settings', order: 10 },
    permissions: ['owner', 'admin'],
    
    // Aktuálny tab
    currentTab: 'brand',
    
    // Cache dát
    settings: {},
    emailAccounts: [],
    signatures: [],
    templates: [],
    currentUser: null,
    
    // Quill editor instance
    quillEditor: null,
    
    // ===========================================
    // CORE METHODS
    // ===========================================
    
    async render(container) {
        // Načítaj aktuálneho usera
        const { data: { user } } = await Database.client.auth.getUser();
        this.currentUser = user;
        
        container.innerHTML = `
            <div class="settings-module">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-2xl font-bold">⚙️ Nastavenia</h1>
                </div>
                
                <!-- Tabs -->
                <div class="tabs-container mb-6">
                    <div class="flex gap-1 border-b overflow-x-auto">
                        <button class="tab-btn ${this.currentTab === 'brand' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('brand')">
                            🎨 Brand
                        </button>
                        <button class="tab-btn ${this.currentTab === 'company' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('company')">
                            🏢 Firma
                        </button>
                        <button class="tab-btn ${this.currentTab === 'email-accounts' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('email-accounts')">
                            📬 Schránky
                        </button>
                        <button class="tab-btn ${this.currentTab === 'signatures' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('signatures')">
                            ✍️ Podpisy
                        </button>
                        <button class="tab-btn ${this.currentTab === 'templates' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('templates')">
                            📝 Šablóny
                        </button>
                        <button class="tab-btn ${this.currentTab === 'banking' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('banking')">
                            🏦 Banka
                        </button>
                        <button class="tab-btn ${this.currentTab === 'invoicing' ? 'active' : ''}" 
                                onclick="SettingsModule.switchTab('invoicing')">
                            📄 Fakturácia
                        </button>
                    </div>
                </div>
                
                <!-- Content -->
                <div id="settings-content" class="settings-content">
                    <div class="text-center py-8 text-gray-500">
                        <div class="spinner"></div>
                        Načítavam nastavenia...
                    </div>
                </div>
            </div>
            
            ${this.getStyles()}
        `;
        
        // Načítaj Quill CSS/JS ak ešte nie je
        await this.loadQuill();
        
        await this.loadAllData();
        this.renderContent();
    },
    
    async loadQuill() {
        if (window.Quill) return;
        
        // CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
        document.head.appendChild(css);
        
        // JS
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    },
    
    async loadAllData() {
        await Promise.all([
            this.loadSettings(),
            this.loadEmailAccounts(),
            this.loadSignatures(),
            this.loadTemplates()
        ]);
    },
    
    async loadSettings() {
        try {
            const { data, error } = await Database.client
                .from('settings')
                .select('*');
            
            if (error) throw error;
            
            this.settings = {};
            (data || []).forEach(s => {
                try {
                    this.settings[s.key] = JSON.parse(s.value);
                } catch {
                    this.settings[s.key] = s.value;
                }
            });
            
            // Update global App.settings
            if (window.App) {
                App.settings = { ...App.settings, ...this.settings };
            }
            
        } catch (err) {
            console.error('Error loading settings:', err);
        }
    },
    
    async loadEmailAccounts() {
        try {
            const { data, error } = await Database.client
                .from('email_accounts')
                .select('*')
                .order('is_default', { ascending: false })
                .order('name');
            
            if (error) throw error;
            this.emailAccounts = data || [];
        } catch (err) {
            console.error('Error loading email accounts:', err);
            this.emailAccounts = [];
        }
    },
    
    async loadSignatures() {
        try {
            const { data, error } = await Database.client
                .from('email_signatures')
                .select('*')
                .eq('user_id', this.currentUser?.id)
                .order('is_default', { ascending: false });
            
            if (error) throw error;
            this.signatures = data || [];
        } catch (err) {
            console.error('Error loading signatures:', err);
            this.signatures = [];
        }
    },
    
    async loadTemplates() {
        try {
            const { data, error } = await Database.client
                .from('email_templates')
                .select('*')
                .order('name');
            
            if (error) throw error;
            this.templates = data || [];
        } catch (err) {
            console.error('Error loading templates:', err);
            this.templates = [];
        }
    },
    
    switchTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        this.renderContent();
    },
    
    renderContent() {
        const content = document.getElementById('settings-content');
        if (!content) return;
        
        switch (this.currentTab) {
            case 'brand':
                content.innerHTML = this.renderBrandSettings();
                break;
            case 'company':
                content.innerHTML = this.renderCompanySettings();
                break;
            case 'email-accounts':
                content.innerHTML = this.renderEmailAccounts();
                break;
            case 'signatures':
                content.innerHTML = this.renderSignatures();
                this.initSignatureEditor();
                break;
            case 'templates':
                content.innerHTML = this.renderTemplates();
                setTimeout(() => this.refreshTemplatePreviews(), 100);
                break;
            case 'banking':
                content.innerHTML = this.renderBankingSettings();
                break;
            case 'invoicing':
                content.innerHTML = this.renderInvoicingSettings();
                break;
        }
    },
    
    // ===========================================
    // BRAND SETTINGS
    // ===========================================
    
    renderBrandSettings() {
        const logoUrl = this.getValue('brand_logo_url', 'https://adlify.eu/logo.png');
        const logoDarkUrl = this.getValue('brand_logo_dark_url', '');
        const iconUrl = this.getValue('brand_logo_icon_url', '');
        const primaryColor = this.getValue('brand_primary_color', '#FF6B35');
        const secondaryColor = this.getValue('brand_secondary_color', '#E91E63');
        
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">🎨 Brand & Logo</h2>
                <p class="text-sm text-gray-500 mb-6">Nastavte logá a farby, ktoré sa použijú v celej aplikácii, emailoch a dokumentoch.</p>
                
                <form id="brand-form" onsubmit="SettingsModule.saveBrandSettings(event)" class="space-y-6">
                    
                    <!-- Logá -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <!-- Hlavné logo -->
                        <div class="logo-upload-box">
                            <label class="block text-sm font-medium mb-2">Hlavné logo</label>
                            <div class="logo-preview" id="preview-logo" style="background: #f8fafc;">
                                ${logoUrl ? `<img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">` : '<span class="text-gray-400">Žiadne logo</span>'}
                            </div>
                            <input type="url" name="brand_logo_url" value="${logoUrl}" 
                                   placeholder="https://..." class="w-full p-2 border rounded-lg text-sm mt-2"
                                   onchange="SettingsModule.previewLogo(this, 'preview-logo')">
                            <button type="button" onclick="SettingsModule.uploadLogo('brand_logo_url')" 
                                    class="btn-secondary text-xs mt-2 w-full">📤 Nahrať</button>
                        </div>
                        
                        <!-- Logo tmavé -->
                        <div class="logo-upload-box">
                            <label class="block text-sm font-medium mb-2">Logo (tmavé pozadie)</label>
                            <div class="logo-preview" id="preview-logo-dark" style="background: #1a1a2e;">
                                ${logoDarkUrl ? `<img src="${logoDarkUrl}" alt="Logo dark" onerror="this.style.display='none'">` : '<span class="text-gray-400">Žiadne logo</span>'}
                            </div>
                            <input type="url" name="brand_logo_dark_url" value="${logoDarkUrl}" 
                                   placeholder="https://..." class="w-full p-2 border rounded-lg text-sm mt-2"
                                   onchange="SettingsModule.previewLogo(this, 'preview-logo-dark')">
                            <button type="button" onclick="SettingsModule.uploadLogo('brand_logo_dark_url')" 
                                    class="btn-secondary text-xs mt-2 w-full">📤 Nahrať</button>
                        </div>
                        
                        <!-- Ikona -->
                        <div class="logo-upload-box">
                            <label class="block text-sm font-medium mb-2">Ikona / Favicon</label>
                            <div class="logo-preview logo-preview-small" id="preview-icon" style="background: #f8fafc;">
                                ${iconUrl ? `<img src="${iconUrl}" alt="Icon" onerror="this.style.display='none'">` : '<span class="text-gray-400">Žiadna ikona</span>'}
                            </div>
                            <input type="url" name="brand_logo_icon_url" value="${iconUrl}" 
                                   placeholder="https://..." class="w-full p-2 border rounded-lg text-sm mt-2"
                                   onchange="SettingsModule.previewLogo(this, 'preview-icon')">
                            <button type="button" onclick="SettingsModule.uploadLogo('brand_logo_icon_url')" 
                                    class="btn-secondary text-xs mt-2 w-full">📤 Nahrať</button>
                        </div>
                    </div>
                    
                    <hr class="my-6">
                    
                    <!-- Farby -->
                    <h3 class="font-medium mb-4">🎨 Brand farby</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Primárna farba</label>
                            <div class="flex gap-2">
                                <input type="color" name="brand_primary_color" value="${primaryColor}" 
                                       class="w-12 h-10 border rounded cursor-pointer">
                                <input type="text" value="${primaryColor}" 
                                       class="flex-1 p-2 border rounded-lg font-mono text-sm"
                                       onchange="this.previousElementSibling.value = this.value"
                                       oninput="this.previousElementSibling.value = this.value">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Sekundárna farba</label>
                            <div class="flex gap-2">
                                <input type="color" name="brand_secondary_color" value="${secondaryColor}" 
                                       class="w-12 h-10 border rounded cursor-pointer">
                                <input type="text" value="${secondaryColor}" 
                                       class="flex-1 p-2 border rounded-lg font-mono text-sm"
                                       onchange="this.previousElementSibling.value = this.value"
                                       oninput="this.previousElementSibling.value = this.value">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Preview -->
                    <div class="mt-6 p-4 bg-gray-50 rounded-xl">
                        <p class="text-sm text-gray-500 mb-3">Náhľad gradientu:</p>
                        <div id="gradient-preview" class="h-16 rounded-lg" 
                             style="background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});">
                        </div>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">
                            💾 Uložiť zmeny
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    previewLogo(input, previewId) {
        const preview = document.getElementById(previewId);
        if (!preview) return;
        
        const url = input.value.trim();
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="Preview" onerror="this.outerHTML='<span class=\\'text-red-500 text-sm\\'>Neplatná URL</span>'">`;
        } else {
            preview.innerHTML = '<span class="text-gray-400">Žiadne logo</span>';
        }
    },
    
    async uploadLogo(fieldName) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 2 * 1024 * 1024) {
                Utils.toast('Súbor je príliš veľký (max 2MB)', 'warning');
                return;
            }
            
            Utils.toast('Nahrávam...', 'info');
            
            try {
                const ext = file.name.split('.').pop().toLowerCase();
                const fileName = fieldName.replace('brand_', '') + '_' + Date.now() + '.' + ext;
                const filePath = 'brand/' + fileName;
                
                // Upload do Supabase Storage
                const { data, error } = await Database.client.storage
                    .from('assets')
                    .upload(filePath, file, { 
                        cacheControl: '3600',
                        upsert: true 
                    });
                
                if (error) throw error;
                
                // Získaj verejnú URL
                const { data: urlData } = Database.client.storage
                    .from('assets')
                    .getPublicUrl(filePath);
                
                const publicUrl = urlData.publicUrl;
                
                // Nastav URL do inputu a preview
                const urlInput = document.querySelector('input[name="' + fieldName + '"]');
                if (urlInput) {
                    urlInput.value = publicUrl;
                    urlInput.dispatchEvent(new Event('change'));
                }
                
                // Ulož do settings
                await Database.client
                    .from('settings')
                    .upsert({ 
                        key: fieldName, 
                        value: JSON.stringify(publicUrl),
                        category: 'brand',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                
                this.settings[fieldName] = publicUrl;
                if (window.App) App.settings = { ...App.settings, ...this.settings };
                
                // Refresh preview
                const previewMap = {
                    'brand_logo_url': 'preview-logo',
                    'brand_logo_dark_url': 'preview-logo-dark',
                    'brand_logo_icon_url': 'preview-icon'
                };
                const previewEl = document.getElementById(previewMap[fieldName]);
                if (previewEl) {
                    previewEl.innerHTML = '<img src="' + publicUrl + '" alt="Logo">';
                }
                
                Utils.toast('Logo nahrané ✅', 'success');
                
            } catch (err) {
                console.error('Upload error:', err);
                if (err.message && err.message.includes('Bucket not found')) {
                    Utils.toast('Storage bucket "assets" neexistuje. Vytvorte ho v Supabase Dashboard → Storage.', 'error');
                } else {
                    Utils.toast('Chyba: ' + (err.message || 'Upload zlyhal'), 'error');
                }
            }
        };
        
        input.click();
    },
    
    async saveBrandSettings(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        
        try {
            for (const [key, value] of formData.entries()) {
                await Database.client
                    .from('settings')
                    .upsert({ 
                        key: key, 
                        value: JSON.stringify(value),
                        category: 'brand',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                
                this.settings[key] = value;
            }
            
            // Update global
            if (window.App) {
                App.settings = { ...App.settings, ...this.settings };
            }
            
            Utils.toast('Brand nastavenia uložené! ✅', 'success');
            
        } catch (err) {
            console.error('Error saving brand settings:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    // ===========================================
    // EMAIL ACCOUNTS
    // ===========================================
    
    renderEmailAccounts() {
        return `
            <div class="settings-card">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">📬 Emailové schránky</h2>
                        <p class="text-sm text-gray-500">Spravujte emailové účty pre odosielanie a príjem správ.</p>
                    </div>
                    <button onclick="SettingsModule.showAddAccountModal()" class="btn-primary">
                        ➕ Pridať schránku
                    </button>
                </div>
                
                <div class="space-y-4" id="email-accounts-list">
                    ${this.emailAccounts.length === 0 ? `
                        <div class="text-center py-8 text-gray-500">
                            <div class="text-4xl mb-2">📭</div>
                            <p>Žiadne emailové schránky</p>
                            <button onclick="SettingsModule.showAddAccountModal()" class="btn-secondary mt-4">
                                ➕ Pridať prvú schránku
                            </button>
                        </div>
                    ` : this.emailAccounts.map(acc => this.renderAccountCard(acc)).join('')}
                </div>
            </div>
            
            <!-- Add/Edit Account Modal -->
            <div id="account-modal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 id="account-modal-title">Pridať emailovú schránku</h3>
                        <button onclick="SettingsModule.closeAccountModal()" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" id="account-modal-body">
                        <!-- Form sa vloží dynamicky -->
                    </div>
                </div>
            </div>
        `;
    },
    
    renderAccountCard(account) {
        const statusColors = {
            'success': 'text-green-600',
            'error': 'text-red-600',
            'syncing': 'text-yellow-600',
            'never': 'text-gray-400'
        };
        const statusIcons = {
            'success': '✅',
            'error': '❌',
            'syncing': '🔄',
            'never': '⏸️'
        };
        
        return `
            <div class="email-account-card ${account.is_default ? 'default' : ''} ${!account.is_active ? 'inactive' : ''}">
                <div class="flex items-start gap-4">
                    <div class="account-icon ${account.account_type === 'shared' ? 'shared' : 'personal'}">
                        ${account.account_type === 'shared' ? '👥' : '👤'}
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-semibold">${account.name}</h4>
                            ${account.is_default ? '<span class="badge badge-primary">Predvolená</span>' : ''}
                            ${!account.is_active ? '<span class="badge badge-gray">Neaktívna</span>' : ''}
                        </div>
                        <p class="text-sm text-gray-600">${account.email}</p>
                        <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span title="SMTP">${account.smtp_host ? '📤 ' + account.smtp_host : '📤 Nenastavené'}</span>
                            <span title="IMAP">${account.imap_host ? '📥 ' + account.imap_host : '📥 Nenastavené'}</span>
                            <span class="${statusColors[account.sync_status] || 'text-gray-400'}">
                                ${statusIcons[account.sync_status] || '⏸️'} 
                                ${account.last_sync_at ? 'Sync: ' + new Date(account.last_sync_at).toLocaleString('sk') : 'Nikdy synchronizované'}
                            </span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="SettingsModule.testAccount('${account.id}')" class="btn-icon" title="Test pripojenia">
                            🔌
                        </button>
                        <button onclick="SettingsModule.editAccount('${account.id}')" class="btn-icon" title="Upraviť">
                            ✏️
                        </button>
                        <button onclick="SettingsModule.deleteAccount('${account.id}')" class="btn-icon text-red-500" title="Zmazať">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    showAddAccountModal() {
        this.showAccountForm(null);
    },
    
    editAccount(id) {
        const account = this.emailAccounts.find(a => a.id === id);
        if (account) this.showAccountForm(account);
    },
    
    showAccountForm(account) {
        const isEdit = !!account;
        document.getElementById('account-modal-title').textContent = isEdit ? 'Upraviť schránku' : 'Pridať schránku';
        
        document.getElementById('account-modal-body').innerHTML = `
            <form id="account-form" onsubmit="SettingsModule.saveAccount(event, '${account?.id || ''}')" class="space-y-4">
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Názov *</label>
                        <input type="text" name="name" value="${account?.name || ''}" required
                               class="w-full p-3 border rounded-xl" placeholder="napr. Info, Support">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Email *</label>
                        <input type="email" name="email" value="${account?.email || ''}" required
                               class="w-full p-3 border rounded-xl" placeholder="info@adlify.eu">
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Zobrazované meno</label>
                        <input type="text" name="display_name" value="${account?.display_name || ''}"
                               class="w-full p-3 border rounded-xl" placeholder="Adlify Info">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Typ</label>
                        <select name="account_type" class="w-full p-3 border rounded-xl">
                            <option value="shared" ${account?.account_type === 'shared' ? 'selected' : ''}>👥 Zdieľaná (pre všetkých)</option>
                            <option value="personal" ${account?.account_type === 'personal' ? 'selected' : ''}>👤 Osobná</option>
                        </select>
                    </div>
                </div>
                
                <hr class="my-4">
                
                <h4 class="font-medium">📤 SMTP (odosielanie)</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Server</label>
                        <input type="text" name="smtp_host" value="${account?.smtp_host || ''}"
                               class="w-full p-3 border rounded-xl" placeholder="smtp.webglobe.sk">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Port</label>
                        <input type="number" name="smtp_port" value="${account?.smtp_port || 465}"
                               class="w-full p-3 border rounded-xl">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Používateľ</label>
                        <input type="text" name="smtp_user" value="${account?.smtp_user || ''}"
                               class="w-full p-3 border rounded-xl" placeholder="info@adlify.eu">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Heslo</label>
                        <input type="password" name="smtp_password" value=""
                               class="w-full p-3 border rounded-xl" placeholder="${isEdit ? '••••••••' : ''}">
                        ${isEdit ? '<p class="text-xs text-gray-500 mt-1">Nechajte prázdne ak nechcete meniť</p>' : ''}
                    </div>
                </div>
                
                <hr class="my-4">
                
                <h4 class="font-medium">📥 IMAP (príjem) <span class="text-gray-400 text-sm">- voliteľné</span></h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Server</label>
                        <input type="text" name="imap_host" value="${account?.imap_host || ''}"
                               class="w-full p-3 border rounded-xl" placeholder="imap.webglobe.sk">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Port</label>
                        <input type="number" name="imap_port" value="${account?.imap_port || 993}"
                               class="w-full p-3 border rounded-xl">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Používateľ</label>
                        <input type="text" name="imap_user" value="${account?.imap_user || ''}"
                               class="w-full p-3 border rounded-xl">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Heslo</label>
                        <input type="password" name="imap_password" value=""
                               class="w-full p-3 border rounded-xl" placeholder="${isEdit ? '••••••••' : ''}">
                    </div>
                </div>
                
                <hr class="my-4">
                
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="is_active" ${account?.is_active !== false ? 'checked' : ''}>
                        <span>Aktívna</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="is_default" ${account?.is_default ? 'checked' : ''}>
                        <span>Predvolená schránka</span>
                    </label>
                </div>
                
                <div class="flex justify-end gap-2 pt-4">
                    <button type="button" onclick="SettingsModule.closeAccountModal()" class="btn-secondary">
                        Zrušiť
                    </button>
                    <button type="submit" class="btn-primary">
                        💾 ${isEdit ? 'Uložiť zmeny' : 'Pridať schránku'}
                    </button>
                </div>
            </form>
        `;
        
        document.getElementById('account-modal').style.display = 'flex';
    },
    
    closeAccountModal() {
        document.getElementById('account-modal').style.display = 'none';
    },
    
    async saveAccount(e, id) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            display_name: formData.get('display_name') || null,
            account_type: formData.get('account_type'),
            smtp_host: formData.get('smtp_host') || null,
            smtp_port: parseInt(formData.get('smtp_port')) || 465,
            smtp_user: formData.get('smtp_user') || null,
            imap_host: formData.get('imap_host') || null,
            imap_port: parseInt(formData.get('imap_port')) || 993,
            imap_user: formData.get('imap_user') || null,
            is_active: formData.has('is_active'),
            is_default: formData.has('is_default')
        };
        
        // Heslá len ak boli zadané
        if (formData.get('smtp_password')) {
            data.smtp_password = formData.get('smtp_password');
        }
        if (formData.get('imap_password')) {
            data.imap_password = formData.get('imap_password');
        }
        
        // Ak je default, odznač ostatné
        if (data.is_default) {
            await Database.client
                .from('email_accounts')
                .update({ is_default: false })
                .neq('id', id || '00000000-0000-0000-0000-000000000000');
        }
        
        try {
            if (id) {
                // Update
                const { error } = await Database.client
                    .from('email_accounts')
                    .update(data)
                    .eq('id', id);
                
                if (error) throw error;
                Utils.toast('Schránka aktualizovaná! ✅', 'success');
            } else {
                // Insert
                data.owner_id = data.account_type === 'personal' ? this.currentUser?.id : null;
                
                const { error } = await Database.client
                    .from('email_accounts')
                    .insert(data);
                
                if (error) throw error;
                Utils.toast('Schránka pridaná! ✅', 'success');
            }
            
            this.closeAccountModal();
            await this.loadEmailAccounts();
            this.renderContent();
            
        } catch (err) {
            console.error('Error saving account:', err);
            Utils.toast('Chyba: ' + err.message, 'error');
        }
    },
    
    async deleteAccount(id) {
        if (!await Utils.confirm('Zmazať túto emailovú schránku?', { title: 'Zmazať schránku', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
        
        try {
            const { error } = await Database.client
                .from('email_accounts')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            Utils.toast('Schránka zmazaná', 'success');
            await this.loadEmailAccounts();
            this.renderContent();
            
        } catch (err) {
            console.error('Error deleting account:', err);
            Utils.toast('Chyba pri mazaní', 'error');
        }
    },
    
    async testAccount(id) {
        Utils.toast('Testujem pripojenie...', 'info');
        
        // TODO: Implementovať cez Netlify function
        setTimeout(() => {
            Utils.toast('Test pripojenia bude dostupný čoskoro', 'info');
        }, 1000);
    },
    
    // ===========================================
    // SIGNATURES
    // ===========================================
    
    renderSignatures() {
        const currentSig = this.signatures.find(s => s.is_default) || this.signatures[0];
        
        return `
            <div class="settings-card">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-lg font-semibold">✍️ Email podpisy</h2>
                        <p class="text-sm text-gray-500">Vytvorte si vlastné podpisy pre emaily.</p>
                    </div>
                    <button onclick="SettingsModule.addSignature()" class="btn-primary">
                        ➕ Nový podpis
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- Zoznam podpisov -->
                    <div class="space-y-2">
                        ${this.signatures.length === 0 ? `
                            <div class="text-center py-4 text-gray-500">
                                <p class="text-sm">Zatiaľ nemáte žiadne podpisy</p>
                            </div>
                        ` : this.signatures.map(sig => `
                            <div class="signature-item ${sig.id === currentSig?.id ? 'active' : ''}" 
                                 onclick="SettingsModule.selectSignature('${sig.id}')">
                                <div class="flex items-center justify-between">
                                    <span class="font-medium">${sig.name}</span>
                                    ${sig.is_default ? '<span class="badge badge-primary text-xs">Predvolený</span>' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Editor -->
                    <div class="md:col-span-2">
                        ${currentSig ? `
                            <form id="signature-form" onsubmit="SettingsModule.saveSignature(event, '${currentSig.id}')" class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1">Názov podpisu</label>
                                    <input type="text" name="name" value="${currentSig.name}" required
                                           class="w-full p-3 border rounded-xl">
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium mb-2">Obsah podpisu</label>
                                    <div id="signature-editor" class="signature-editor"></div>
                                    <input type="hidden" name="html_content" id="signature-html">
                                </div>
                                
                                <div class="flex items-center gap-4">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" name="is_default" ${currentSig.is_default ? 'checked' : ''}>
                                        <span>Predvolený podpis</span>
                                    </label>
                                </div>
                                
                                <div class="flex justify-between pt-4">
                                    <button type="button" onclick="SettingsModule.deleteSignature('${currentSig.id}')" 
                                            class="btn-secondary text-red-500">
                                        🗑️ Zmazať
                                    </button>
                                    <button type="submit" class="btn-primary">
                                        💾 Uložiť podpis
                                    </button>
                                </div>
                            </form>
                        ` : `
                            <div class="text-center py-12 text-gray-500">
                                <div class="text-4xl mb-2">✍️</div>
                                <p>Vytvorte si prvý email podpis</p>
                                <button onclick="SettingsModule.addSignature()" class="btn-primary mt-4">
                                    ➕ Vytvoriť podpis
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    },
    
    initSignatureEditor() {
        const editorEl = document.getElementById('signature-editor');
        if (!editorEl || !window.Quill) return;
        
        // Destroy existing
        if (this.quillEditor) {
            this.quillEditor = null;
        }
        
        const currentSig = this.signatures.find(s => document.querySelector('.signature-item.active')?.onclick?.toString().includes(s.id)) 
                          || this.signatures.find(s => s.is_default) 
                          || this.signatures[0];
        
        this.quillEditor = new Quill('#signature-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'color': [] }],
                    ['link', 'image'],
                    [{ 'align': [] }],
                    ['clean']
                ]
            },
            placeholder: 'Napíšte svoj podpis...'
        });
        
        // Načítaj obsah
        if (currentSig?.html_content) {
            this.quillEditor.root.innerHTML = currentSig.html_content;
        }
        
        // Sync do hidden inputu
        this.quillEditor.on('text-change', () => {
            const html = this.quillEditor.root.innerHTML;
            document.getElementById('signature-html').value = html;
        });
    },
    
    selectSignature(id) {
        const sig = this.signatures.find(s => s.id === id);
        if (!sig) return;
        
        // Update active class
        document.querySelectorAll('.signature-item').forEach(el => {
            el.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
        
        // Update form
        document.querySelector('input[name="name"]').value = sig.name;
        document.querySelector('input[name="is_default"]').checked = sig.is_default;
        
        // Update Quill
        if (this.quillEditor) {
            this.quillEditor.root.innerHTML = sig.html_content || '';
        }
        
        // Update form action
        document.getElementById('signature-form').onsubmit = (e) => this.saveSignature(e, id);
        document.querySelector('.btn-secondary.text-red-500').onclick = () => this.deleteSignature(id);
    },
    
    async addSignature() {
        try {
            const { data, error } = await Database.client
                .from('email_signatures')
                .insert({
                    user_id: this.currentUser?.id,
                    name: 'Nový podpis',
                    html_content: '<p>S pozdravom,<br>Vaše meno</p>',
                    is_default: this.signatures.length === 0
                })
                .select()
                .single();
            
            if (error) throw error;
            
            await this.loadSignatures();
            this.renderContent();
            Utils.toast('Podpis vytvorený', 'success');
            
        } catch (err) {
            console.error('Error creating signature:', err);
            Utils.toast('Chyba pri vytváraní podpisu', 'error');
        }
    },
    
    async saveSignature(e, id) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        
        const data = {
            name: formData.get('name'),
            html_content: this.quillEditor?.root.innerHTML || formData.get('html_content'),
            is_default: formData.has('is_default')
        };
        
        // Ak je default, odznač ostatné
        if (data.is_default) {
            await Database.client
                .from('email_signatures')
                .update({ is_default: false })
                .eq('user_id', this.currentUser?.id)
                .neq('id', id);
        }
        
        try {
            const { error } = await Database.client
                .from('email_signatures')
                .update(data)
                .eq('id', id);
            
            if (error) throw error;
            
            await this.loadSignatures();
            this.renderContent();
            Utils.toast('Podpis uložený! ✅', 'success');
            
        } catch (err) {
            console.error('Error saving signature:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    async deleteSignature(id) {
        if (!await Utils.confirm('Zmazať tento emailový podpis?', { title: 'Zmazať podpis', type: 'danger', confirmText: 'Zmazať', cancelText: 'Ponechať' })) return;
        
        try {
            const { error } = await Database.client
                .from('email_signatures')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            await this.loadSignatures();
            this.renderContent();
            Utils.toast('Podpis zmazaný', 'success');
            
        } catch (err) {
            console.error('Error deleting signature:', err);
            Utils.toast('Chyba pri mazaní', 'error');
        }
    },
    
    // ===========================================
    // TEMPLATES
    // ===========================================
    
    renderTemplates() {
        if (!window.EmailTemplates) {
            return '<div class="settings-card"><p class="text-gray-500">EmailTemplates modul nie je načítaný.</p></div>';
        }

        const templates = EmailTemplates.getTemplateList();
        const emailWebsite = this.getValue('email_website', 'www.adlify.eu');
        const emailContact = this.getValue('email_contact', 'info@adlify.eu');
        const emailFooter = this.getValue('email_footer_text', '');
        const emailTagline = this.getValue('email_tagline', '');

        return `
            <div class="settings-card mb-6">
                <h2 class="text-lg font-semibold mb-1">📧 Nastavenia emailov</h2>
                <p class="text-sm text-gray-500 mb-5">Tieto údaje sa zobrazia v päte každého odoslaného emailu. Logo a farby sa preberajú z Brand nastavení.</p>
                
                <form id="email-settings-form" onsubmit="SettingsModule.saveEmailSettings(event)" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Kontaktný email</label>
                            <input type="email" name="email_contact" value="${emailContact}" 
                                   class="w-full p-2.5 border rounded-lg text-sm" placeholder="info@adlify.eu">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Web stránka</label>
                            <input type="text" name="email_website" value="${emailWebsite}" 
                                   class="w-full p-2.5 border rounded-lg text-sm" placeholder="www.adlify.eu">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Text päty <span class="text-gray-400 font-normal">(nepovinné)</span></label>
                        <input type="text" name="email_footer_text" value="${emailFooter}" 
                               class="w-full p-2.5 border rounded-lg text-sm" placeholder="S pozdravom, Tím Adlify">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Tagline <span class="text-gray-400 font-normal">(nepovinné)</span></label>
                        <input type="text" name="email_tagline" value="${emailTagline}" 
                               class="w-full p-2.5 border rounded-lg text-sm" placeholder="Online marketing, ktorý funguje.">
                    </div>
                    <div class="flex justify-end pt-2">
                        <button type="submit" class="btn-primary">💾 Uložiť</button>
                    </div>
                </form>
            </div>
            
            <div class="settings-card">
                <div class="flex justify-between items-center mb-5">
                    <div>
                        <h2 class="text-lg font-semibold mb-1">📝 Šablóny emailov</h2>
                        <p class="text-sm text-gray-500">Náhľad systémových šablón. Farby a logo sa menia v Brand nastaveniach.</p>
                    </div>
                    <button onclick="SettingsModule.refreshTemplatePreviews()" class="btn-secondary text-xs">🔄 Obnoviť</button>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5" id="email-templates-grid">
                    ${templates.map(tpl => `
                        <div class="email-tpl-card">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="text-xl">${tpl.icon}</span>
                                    <div>
                                        <h4 class="font-semibold text-sm">${tpl.name}</h4>
                                        <p class="text-xs text-gray-400">${tpl.desc}</p>
                                    </div>
                                </div>
                                <button onclick="SettingsModule.previewEmailTemplate('${tpl.id}')" 
                                        class="btn-secondary text-xs" title="Otvoriť náhľad">
                                    🔍 Náhľad
                                </button>
                            </div>
                            <div class="email-tpl-preview">
                                <iframe id="tpl-frame-${tpl.id}" 
                                        style="width:200%;height:200%;transform:scale(0.5);transform-origin:top left;border:none;pointer-events:none;"
                                        sandbox="allow-same-origin"></iframe>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <style>
                .email-tpl-card {
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px;
                    background: #fff;
                    transition: box-shadow 0.2s;
                }
                .email-tpl-card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                }
                .email-tpl-preview {
                    width: 100%;
                    height: 260px;
                    overflow: hidden;
                    border-radius: 8px;
                    border: 1px solid #edf2f7;
                    background: #f5f5f5;
                    position: relative;
                }
            </style>
        `;
    },

    async saveEmailSettings(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        try {
            for (const [key, value] of formData.entries()) {
                await Database.client
                    .from('settings')
                    .upsert({ 
                        key: key, 
                        value: JSON.stringify(value),
                        category: 'email',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                
                this.settings[key] = value;
            }
            
            if (window.App) App.settings = { ...App.settings, ...this.settings };
            
            Utils.toast('Email nastavenia uložené ✅', 'success');
            
            // Refresh previews
            setTimeout(() => this.refreshTemplatePreviews(), 300);
            
        } catch (err) {
            console.error('Error saving email settings:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },

    refreshTemplatePreviews() {
        if (!window.EmailTemplates) return;
        
        const templates = EmailTemplates.getTemplateList();
        const samples = EmailTemplates.getSampleData();
        
        templates.forEach(tpl => {
            const frame = document.getElementById('tpl-frame-' + tpl.id);
            if (!frame) return;
            
            try {
                const html = EmailTemplates[tpl.id](samples[tpl.id]);
                frame.srcdoc = html;
            } catch (err) {
                console.warn('Preview error for', tpl.id, err);
            }
        });
    },

    previewEmailTemplate(templateId) {
        if (!window.EmailTemplates) return;
        
        const samples = EmailTemplates.getSampleData();
        const data = samples[templateId];
        if (!data) return;
        
        try {
            const html = EmailTemplates[templateId](data);
            const preview = window.open('', '_blank', 'width=640,height=700');
            preview.document.write(html);
            preview.document.close();
        } catch (err) {
            Utils.toast('Chyba pri generovaní náhľadu', 'error');
        }
    },
    
    // ===========================================
    // COMPANY SETTINGS (unchanged)
    // ===========================================
    
    renderCompanySettings() {
        const s = this.settings;
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">🏢 Firemné údaje</h2>
                <p class="text-sm text-gray-500 mb-6">Tieto údaje sa použijú na faktúrach a v komunikácii.</p>
                
                <form id="company-form" onsubmit="SettingsModule.saveForm(event, 'company-form')" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Názov firmy *</label>
                            <input type="text" name="company_name" value="${this.getValue('company_name')}" 
                                   class="w-full p-3 border rounded-xl" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">IČO</label>
                            <input type="text" name="company_ico" value="${this.getValue('company_ico')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="12345678">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">DIČ</label>
                            <input type="text" name="company_dic" value="${this.getValue('company_dic')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">IČ DPH</label>
                            <input type="text" name="company_ic_dph" value="${this.getValue('company_ic_dph')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Adresa</label>
                        <input type="text" name="company_address" value="${this.getValue('company_address')}" 
                               class="w-full p-3 border rounded-xl">
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Mesto</label>
                            <input type="text" name="company_city" value="${this.getValue('company_city')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">PSČ</label>
                            <input type="text" name="company_zip" value="${this.getValue('company_zip')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Krajina</label>
                            <input type="text" name="company_country" value="${this.getValue('company_country', 'Slovensko')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <hr class="my-6">
                    
                    <h3 class="font-medium mb-4">📞 Kontaktné údaje</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Email</label>
                            <input type="email" name="company_email" value="${this.getValue('company_email')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Telefón</label>
                            <input type="text" name="company_phone" value="${this.getValue('company_phone')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">💾 Uložiť zmeny</button>
                    </div>
                </form>
            </div>
        `;
    },
    
    renderBankingSettings() {
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">🏦 Bankové údaje</h2>
                <p class="text-sm text-gray-500 mb-6">Údaje pre fakturáciu a platby.</p>
                
                <form id="banking-form" onsubmit="SettingsModule.saveForm(event, 'banking-form')" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Názov banky</label>
                            <input type="text" name="bank_name" value="${this.getValue('bank_name')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">IBAN</label>
                            <input type="text" name="bank_iban" value="${this.getValue('bank_iban')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="SK00 0000 0000 0000 0000 0000">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">SWIFT/BIC</label>
                            <input type="text" name="bank_swift" value="${this.getValue('bank_swift')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Číslo účtu</label>
                            <input type="text" name="bank_account" value="${this.getValue('bank_account')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">💾 Uložiť zmeny</button>
                    </div>
                </form>
            </div>
        `;
    },
    
    renderInvoicingSettings() {
        return `
            <div class="settings-card">
                <h2 class="text-lg font-semibold mb-4">📄 Nastavenia fakturácie</h2>
                <p class="text-sm text-gray-500 mb-6">Predvolené hodnoty pre nové faktúry.</p>
                
                <form id="invoicing-form" onsubmit="SettingsModule.saveForm(event, 'invoicing-form')" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Prefix faktúr</label>
                            <input type="text" name="invoice_prefix" value="${this.getValue('invoice_prefix', 'FA')}" 
                                   class="w-full p-3 border rounded-xl" placeholder="FA">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Ďalšie číslo</label>
                            <input type="number" name="invoice_next_number" value="${this.getValue('invoice_next_number', '1')}" 
                                   class="w-full p-3 border rounded-xl" min="1">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Splatnosť (dni)</label>
                            <input type="number" name="invoice_due_days" value="${this.getValue('invoice_due_days', '14')}" 
                                   class="w-full p-3 border rounded-xl">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">DPH sadzba</label>
                            <select name="invoice_tax_rate" class="w-full p-3 border rounded-xl">
                                <option value="0" ${this.getValue('invoice_tax_rate', '20') == '0' ? 'selected' : ''}>0% - Neplatiteľ DPH</option>
                                <option value="10" ${this.getValue('invoice_tax_rate', '20') == '10' ? 'selected' : ''}>10% - Znížená sadzba</option>
                                <option value="20" ${this.getValue('invoice_tax_rate', '20') == '20' ? 'selected' : ''}>20% - Základná sadzba</option>
                                <option value="23" ${this.getValue('invoice_tax_rate', '20') == '23' ? 'selected' : ''}>23% - Nová sadzba (od 2025)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Formát čísla</label>
                            <div class="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                                Ukážka: <strong>${this.getValue('invoice_prefix', 'FA')}${new Date().getFullYear()}${String(parseInt(this.getValue('invoice_next_number', '1'))).padStart(4, '0')}</strong>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Text na faktúre</label>
                        <textarea name="invoice_note" rows="3" class="w-full p-3 border rounded-xl"
                                  placeholder="Ďakujeme za spoluprácu.">${this.getValue('invoice_note')}</textarea>
                    </div>
                    
                    <div class="flex justify-end pt-4">
                        <button type="submit" class="btn-primary">💾 Uložiť zmeny</button>
                    </div>
                </form>
            </div>
        `;
    },
    
    // ===========================================
    // HELPER METHODS
    // ===========================================
    
    getValue(key, defaultValue = '') {
        const val = this.settings[key];
        if (val === undefined || val === null) return defaultValue;
        return val;
    },
    
    async saveForm(e, formId) {
        e.preventDefault();
        
        const form = document.getElementById(formId);
        if (!form) return;
        
        const formData = new FormData(form);
        
        try {
            for (const [key, value] of formData.entries()) {
                await Database.client
                    .from('settings')
                    .upsert({ 
                        key: key, 
                        value: JSON.stringify(value),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                
                this.settings[key] = value;
            }
            
            // Update global
            if (window.App) {
                App.settings = { ...App.settings, ...this.settings };
            }
            
            Utils.toast('Uložené! ✅', 'success');
            
        } catch (err) {
            console.error('Error saving:', err);
            Utils.toast('Chyba pri ukladaní', 'error');
        }
    },
    
    // ===========================================
    // STYLES
    // ===========================================
    
    getStyles() {
        return `
        <style>
        .settings-module { max-width: 1200px; }
        
        .tab-btn {
            padding: 12px 20px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 14px;
            color: #64748b;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            white-space: nowrap;
        }
        .tab-btn:hover { color: #1a1a2e; background: #f8fafc; }
        .tab-btn.active { 
            color: #f97316; 
            border-bottom-color: #f97316; 
            font-weight: 600;
        }
        
        .settings-card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        
        /* Logo upload */
        .logo-upload-box { text-align: center; }
        .logo-preview {
            width: 100%;
            height: 100px;
            border: 2px dashed #e2e8f0;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .logo-preview img { max-height: 80px; max-width: 100%; object-fit: contain; }
        .logo-preview-small { height: 80px; }
        
        /* Email accounts */
        .email-account-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            transition: all 0.2s;
        }
        .email-account-card:hover { border-color: #f97316; }
        .email-account-card.default { border-color: #f97316; background: #fff7ed; }
        .email-account-card.inactive { opacity: 0.6; }
        
        .account-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        .account-icon.shared { background: #dbeafe; }
        .account-icon.personal { background: #dcfce7; }
        
        /* Signatures */
        .signature-item {
            padding: 12px 16px;
            border-radius: 8px;
            cursor: pointer;
            border: 1px solid #e2e8f0;
            transition: all 0.2s;
        }
        .signature-item:hover { border-color: #f97316; }
        .signature-item.active { 
            background: #fff7ed; 
            border-color: #f97316; 
        }
        
        .signature-editor {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            min-height: 200px;
        }
        .signature-editor .ql-toolbar { border-radius: 12px 12px 0 0; }
        .signature-editor .ql-container { border-radius: 0 0 12px 12px; min-height: 150px; }
        
        /* Templates */
        .template-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
        }
        
        /* Badges */
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
        }
        .badge-primary { background: #fff7ed; color: #f97316; }
        .badge-gray { background: #f1f5f9; color: #64748b; }
        
        /* Modal */
        .modal {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .modal-content {
            background: white;
            border-radius: 16px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e2e8f0;
        }
        .modal-header h3 { font-size: 18px; font-weight: 600; }
        .modal-close {
            width: 32px;
            height: 32px;
            border: none;
            background: #f1f5f9;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
        }
        .modal-body { padding: 24px; }
        
        /* Buttons */
        .btn-primary {
            background: linear-gradient(135deg, #f97316, #ea580c);
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
        }
        .btn-secondary {
            background: #f1f5f9;
            color: #475569;
            padding: 10px 20px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
        }
        .btn-icon {
            width: 36px;
            height: 36px;
            border: none;
            background: #f1f5f9;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
        }
        .btn-icon:hover { background: #e2e8f0; }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: #f97316;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        `;
    }
};

// Register module
if (typeof App !== 'undefined') {
    App.register(SettingsModule);
}
