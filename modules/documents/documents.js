/**
 * ADLIFY - Documents Module
 * Správa súborov a dokumentov
 */

const DocumentsModule = {
    id: 'documents',
    name: 'Dokumenty',
    icon: '📁',
    title: 'Dokumenty',
    menu: { section: 'tools', order: 58 },
    permissions: ['documents', 'view'],

    // Data
    documents: [],
    currentCategory: 'all',
    clients: [],
    projects: [],

    async init() {
        console.log('📁 Documents module initialized');
    },

    async render(container) {
        container.innerHTML = `
            <div class="documents-module">
                <div class="module-header">
                    <div class="header-left">
                        <h1>Dokumenty</h1>
                        <p class="subtitle">Súbory, zmluvy a prílohy</p>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" onclick="DocumentsModule.showUploadModal()">
                            <span>📤</span> Nahrať súbor
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="docs-stats">
                    <div class="stat-item">
                        <span class="stat-icon">📄</span>
                        <span class="stat-value" id="stat-total">0</span>
                        <span class="stat-label">Celkom</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">📝</span>
                        <span class="stat-value" id="stat-contracts">0</span>
                        <span class="stat-label">Zmluvy</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">💰</span>
                        <span class="stat-value" id="stat-invoices">0</span>
                        <span class="stat-label">Faktúry</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🖼️</span>
                        <span class="stat-value" id="stat-images">0</span>
                        <span class="stat-label">Obrázky</span>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-bar">
                    <div class="category-filter">
                        <button class="cat-btn ${this.currentCategory === 'all' ? 'active' : ''}" onclick="DocumentsModule.setCategory('all')">Všetky</button>
                        <button class="cat-btn ${this.currentCategory === 'contract' ? 'active' : ''}" onclick="DocumentsModule.setCategory('contract')">📝 Zmluvy</button>
                        <button class="cat-btn ${this.currentCategory === 'invoice' ? 'active' : ''}" onclick="DocumentsModule.setCategory('invoice')">💰 Faktúry</button>
                        <button class="cat-btn ${this.currentCategory === 'proposal' ? 'active' : ''}" onclick="DocumentsModule.setCategory('proposal')">📄 Ponuky</button>
                        <button class="cat-btn ${this.currentCategory === 'image' ? 'active' : ''}" onclick="DocumentsModule.setCategory('image')">🖼️ Obrázky</button>
                        <button class="cat-btn ${this.currentCategory === 'other' ? 'active' : ''}" onclick="DocumentsModule.setCategory('other')">📁 Ostatné</button>
                    </div>
                    <div class="search-box">
                        <input type="text" id="doc-search" placeholder="Hľadať dokumenty..." oninput="DocumentsModule.handleSearch()">
                    </div>
                </div>

                <div class="documents-content" id="documents-content">
                    <div class="loading">Načítavam dokumenty...</div>
                </div>
            </div>
            ${this.getStyles()}
        `;

        await this.loadData();
        this.renderDocuments();
    },

    async loadData() {
        try {
            // Load documents
            const { data: docs, error } = await Database.client
                .from('documents')
                .select('*, uploader:team_members!uploaded_by(first_name, last_name)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.documents = docs || [];

            // Load clients for linking
            const { data: clients } = await Database.client
                .from('clients')
                .select('id, company_name');
            this.clients = clients || [];

            // Load projects for linking
            const { data: projects } = await Database.client
                .from('projects')
                .select('id, name');
            this.projects = projects || [];

            // Update stats
            this.updateStats();

        } catch (error) {
            console.error('Load documents error:', error);
            this.documents = [];
        }
    },

    updateStats() {
        document.getElementById('stat-total').textContent = this.documents.length;
        document.getElementById('stat-contracts').textContent = this.documents.filter(d => d.category === 'contract').length;
        document.getElementById('stat-invoices').textContent = this.documents.filter(d => d.category === 'invoice').length;
        document.getElementById('stat-images').textContent = this.documents.filter(d => d.category === 'image').length;
    },

    renderDocuments() {
        const container = document.getElementById('documents-content');
        if (!container) return;

        const filtered = this.getFilteredDocuments();

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3>Žiadne dokumenty</h3>
                    <p>Nahraj prvý dokument kliknutím na tlačidlo "Nahrať súbor"</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="documents-grid">
                ${filtered.map(doc => this.renderDocumentCard(doc)).join('')}
            </div>
        `;
    },

    renderDocumentCard(doc) {
        const icons = {
            contract: '📝',
            invoice: '💰',
            proposal: '📄',
            report: '📊',
            image: '🖼️',
            video: '🎬',
            other: '📁'
        };

        const icon = icons[doc.category] || '📄';
        const uploaderName = doc.uploader ? `${doc.uploader.first_name} ${doc.uploader.last_name}` : 'Neznámy';
        const fileSize = this.formatFileSize(doc.file_size);
        const isImage = doc.file_type?.startsWith('image/');

        return `
            <div class="document-card" onclick="DocumentsModule.openDocument('${doc.id}')">
                <div class="doc-preview">
                    ${isImage && doc.file_url ? 
                        `<img src="${doc.file_url}" alt="${doc.name}">` : 
                        `<span class="doc-icon">${icon}</span>`
                    }
                </div>
                <div class="doc-info">
                    <h4 class="doc-name">${doc.name}</h4>
                    <p class="doc-meta">
                        <span>${this.getCategoryName(doc.category)}</span>
                        <span>•</span>
                        <span>${fileSize}</span>
                    </p>
                    <p class="doc-date">
                        ${uploaderName} • ${this.formatDate(doc.created_at)}
                    </p>
                </div>
                <div class="doc-actions">
                    <a href="${doc.file_url}" target="_blank" class="btn-icon" onclick="event.stopPropagation()" title="Stiahnuť">
                        📥
                    </a>
                    <button class="btn-icon" onclick="event.stopPropagation(); DocumentsModule.deleteDocument('${doc.id}')" title="Zmazať">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    },

    getFilteredDocuments() {
        let filtered = [...this.documents];

        // Filter by category
        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(d => d.category === this.currentCategory);
        }

        // Search
        const query = document.getElementById('doc-search')?.value?.toLowerCase();
        if (query) {
            filtered = filtered.filter(d => 
                d.name.toLowerCase().includes(query) ||
                d.description?.toLowerCase().includes(query) ||
                d.file_name?.toLowerCase().includes(query)
            );
        }

        return filtered;
    },

    setCategory(category) {
        this.currentCategory = category;
        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        this.renderDocuments();
    },

    handleSearch() {
        this.renderDocuments();
    },

    showUploadModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal upload-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">📤</span>
                        <h2>Nahrať dokument</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <form id="upload-form">
                        <!-- Drop zone -->
                        <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
                            <div class="drop-icon">📁</div>
                            <p>Pretiahni súbor sem alebo klikni pre výber</p>
                            <span class="drop-hint">PDF, DOC, XLS, JPG, PNG do 10MB</span>
                            <input type="file" id="file-input" hidden onchange="DocumentsModule.handleFileSelect(this)">
                        </div>
                        
                        <div id="file-preview" class="file-preview" style="display:none">
                            <span class="file-icon">📄</span>
                            <span class="file-name" id="selected-file-name"></span>
                            <button type="button" class="btn-remove" onclick="DocumentsModule.removeFile()">×</button>
                        </div>
                        
                        <div class="form-group">
                            <label>Názov dokumentu *</label>
                            <input type="text" name="name" id="doc-name" required placeholder="Názov súboru">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Kategória</label>
                                <select name="category">
                                    <option value="other">📁 Ostatné</option>
                                    <option value="contract">📝 Zmluva</option>
                                    <option value="invoice">💰 Faktúra</option>
                                    <option value="proposal">📄 Ponuka</option>
                                    <option value="report">📊 Report</option>
                                    <option value="image">🖼️ Obrázok</option>
                                    <option value="video">🎬 Video</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Priradiť klientovi</label>
                                <select name="client_id">
                                    <option value="">-- Bez klienta --</option>
                                    ${this.clients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Popis</label>
                            <textarea name="description" rows="2" placeholder="Voliteľný popis dokumentu"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="is_public">
                                <span>Zdieľať v klientskom portáli</span>
                            </label>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zrušiť</button>
                    <button class="btn-primary" onclick="DocumentsModule.uploadDocument()" id="upload-btn" disabled>
                        📤 Nahrať
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Setup drag and drop
        this.setupDropZone();
    },

    setupDropZone() {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
            dropZone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(event => {
            dropZone.addEventListener(event, () => dropZone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(event => {
            dropZone.addEventListener(event, () => dropZone.classList.remove('drag-over'));
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                document.getElementById('file-input').files = files;
                this.handleFileSelect(document.getElementById('file-input'));
            }
        });
    },

    selectedFile: null,

    handleFileSelect(input) {
        const file = input.files[0];
        if (!file) return;

        // Check size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            Utils.showNotification('Súbor je príliš veľký (max 10MB)', 'error');
            return;
        }

        this.selectedFile = file;

        // Show preview
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('file-preview').style.display = 'flex';
        document.getElementById('selected-file-name').textContent = file.name;
        document.getElementById('upload-btn').disabled = false;

        // Auto-fill name
        const nameInput = document.getElementById('doc-name');
        if (!nameInput.value) {
            nameInput.value = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        }
    },

    removeFile() {
        this.selectedFile = null;
        document.getElementById('file-input').value = '';
        document.getElementById('drop-zone').style.display = 'block';
        document.getElementById('file-preview').style.display = 'none';
        document.getElementById('upload-btn').disabled = true;
    },

    async uploadDocument() {
        if (!this.selectedFile) {
            Utils.showNotification('Vyber súbor', 'error');
            return;
        }

        const form = document.getElementById('upload-form');
        const formData = new FormData(form);

        const uploadBtn = document.getElementById('upload-btn');
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Nahrávam...';

        try {
            // Upload to Supabase Storage
            const fileExt = this.selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `documents/${fileName}`;

            const { data: uploadData, error: uploadError } = await Database.client
                .storage
                .from('adlify-files')
                .upload(filePath, this.selectedFile);

            if (uploadError) {
                // If bucket doesn't exist, use placeholder URL
                console.warn('Storage upload failed, using placeholder:', uploadError);
            }

            // Get public URL (or use placeholder)
            let fileUrl;
            if (uploadData) {
                const { data: { publicUrl } } = Database.client
                    .storage
                    .from('adlify-files')
                    .getPublicUrl(filePath);
                fileUrl = publicUrl;
            } else {
                // Placeholder - in production you'd set up storage properly
                fileUrl = `https://placeholder.com/documents/${fileName}`;
            }

            // Save to database
            const docData = {
                name: formData.get('name'),
                description: formData.get('description') || null,
                file_url: fileUrl,
                file_name: this.selectedFile.name,
                file_type: this.selectedFile.type,
                file_size: this.selectedFile.size,
                category: formData.get('category'),
                client_id: formData.get('client_id') || null,
                is_public: formData.get('is_public') === 'on',
                uploaded_by: Auth.teamMember?.id
            };

            const { error: dbError } = await Database.client
                .from('documents')
                .insert([docData]);

            if (dbError) throw dbError;

            document.querySelector('.modal-overlay').remove();
            await this.loadData();
            this.renderDocuments();
            Utils.showNotification('Dokument nahratý', 'success');

        } catch (error) {
            console.error('Upload error:', error);
            Utils.showNotification('Chyba pri nahrávaní: ' + error.message, 'error');
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 Nahrať';
        }
    },

    async openDocument(id) {
        const doc = this.documents.find(d => d.id === id);
        if (!doc) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal document-detail-modal">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="modal-icon">${this.getCategoryIcon(doc.category)}</span>
                        <h2>${doc.name}</h2>
                    </div>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="doc-detail-preview">
                        ${doc.file_type?.startsWith('image/') ? 
                            `<img src="${doc.file_url}" alt="${doc.name}">` :
                            `<div class="preview-placeholder">
                                <span>${this.getCategoryIcon(doc.category)}</span>
                                <p>${doc.file_name}</p>
                            </div>`
                        }
                    </div>
                    
                    <div class="doc-detail-info">
                        <div class="info-row">
                            <span class="label">Súbor:</span>
                            <span class="value">${doc.file_name}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Typ:</span>
                            <span class="value">${doc.file_type || 'Neznámy'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Veľkosť:</span>
                            <span class="value">${this.formatFileSize(doc.file_size)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Kategória:</span>
                            <span class="value">${this.getCategoryName(doc.category)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Nahral:</span>
                            <span class="value">${doc.uploader ? doc.uploader.first_name + ' ' + doc.uploader.last_name : 'Neznámy'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Dátum:</span>
                            <span class="value">${this.formatDate(doc.created_at)}</span>
                        </div>
                        ${doc.description ? `
                            <div class="info-row">
                                <span class="label">Popis:</span>
                                <span class="value">${doc.description}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-danger" onclick="DocumentsModule.deleteDocument('${doc.id}')">🗑️ Zmazať</button>
                    <div class="footer-right">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Zavrieť</button>
                        <a href="${doc.file_url}" target="_blank" class="btn-primary">📥 Stiahnuť</a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async deleteDocument(id) {
        if (!confirm('Naozaj chceš zmazať tento dokument?')) return;

        try {
            const { error } = await Database.client
                .from('documents')
                .delete()
                .eq('id', id);

            if (error) throw error;

            document.querySelector('.modal-overlay')?.remove();
            await this.loadData();
            this.renderDocuments();
            Utils.showNotification('Dokument zmazaný', 'success');

        } catch (error) {
            console.error('Delete error:', error);
            Utils.showNotification('Chyba pri mazaní', 'error');
        }
    },

    getCategoryIcon(category) {
        const icons = {
            contract: '📝',
            invoice: '💰',
            proposal: '📄',
            report: '📊',
            image: '🖼️',
            video: '🎬',
            other: '📁'
        };
        return icons[category] || '📄';
    },

    getCategoryName(category) {
        const names = {
            contract: 'Zmluva',
            invoice: 'Faktúra',
            proposal: 'Ponuka',
            report: 'Report',
            image: 'Obrázok',
            video: 'Video',
            other: 'Ostatné'
        };
        return names[category] || category;
    },

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('sk-SK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    },

    getStyles() {
        return `
            <style>
                .documents-module {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .module-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 2rem;
                }

                .header-left h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                }

                .subtitle {
                    color: #64748b;
                    margin-top: 0.25rem;
                }

                .btn-primary {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #f97316, #ec4899);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                }

                .docs-stats {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .stat-item {
                    background: white;
                    border-radius: 12px;
                    padding: 1rem;
                    text-align: center;
                    border: 1px solid #e2e8f0;
                }

                .stat-icon {
                    font-size: 1.5rem;
                    display: block;
                    margin-bottom: 0.25rem;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    display: block;
                }

                .stat-label {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                .filters-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    flex-wrap: wrap;
                    gap: 1rem;
                }

                .category-filter {
                    display: flex;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }

                .cat-btn {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 0.875rem;
                }

                .cat-btn.active {
                    background: #6366f1;
                    color: white;
                    border-color: #6366f1;
                }

                .search-box input {
                    padding: 0.5rem 1rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    width: 250px;
                }

                .documents-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 1rem;
                }

                .document-card {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .document-card:hover {
                    border-color: #6366f1;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
                }

                .doc-preview {
                    height: 120px;
                    background: #f8fafc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }

                .doc-preview img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .doc-icon {
                    font-size: 3rem;
                }

                .doc-info {
                    padding: 1rem;
                }

                .doc-name {
                    font-size: 0.95rem;
                    font-weight: 600;
                    margin: 0 0 0.25rem 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .doc-meta {
                    font-size: 0.75rem;
                    color: #64748b;
                    margin: 0 0 0.25rem 0;
                    display: flex;
                    gap: 0.5rem;
                }

                .doc-date {
                    font-size: 0.7rem;
                    color: #94a3b8;
                    margin: 0;
                }

                .doc-actions {
                    display: flex;
                    gap: 0.5rem;
                    padding: 0.75rem 1rem;
                    border-top: 1px solid #f1f5f9;
                }

                .btn-icon {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-decoration: none;
                }

                .btn-icon:hover {
                    background: #e2e8f0;
                }

                /* Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                }

                .upload-modal, .document-detail-modal {
                    background: white;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .document-detail-modal {
                    max-width: 600px;
                }

                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }

                .modal-icon {
                    font-size: 1.5rem;
                }

                .modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: #f1f5f9;
                    border-radius: 8px;
                    font-size: 1.25rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 1.5rem;
                    overflow-y: auto;
                }

                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                }

                .footer-right {
                    display: flex;
                    gap: 0.75rem;
                }

                /* Drop zone */
                .drop-zone {
                    border: 2px dashed #d1d5db;
                    border-radius: 12px;
                    padding: 2rem;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-bottom: 1rem;
                }

                .drop-zone:hover, .drop-zone.drag-over {
                    border-color: #6366f1;
                    background: #f0f9ff;
                }

                .drop-icon {
                    font-size: 3rem;
                    margin-bottom: 0.5rem;
                }

                .drop-hint {
                    font-size: 0.75rem;
                    color: #94a3b8;
                }

                .file-preview {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                }

                .file-icon {
                    font-size: 1.5rem;
                }

                .file-name {
                    flex: 1;
                    font-size: 0.875rem;
                }

                .btn-remove {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: #fecaca;
                    color: #dc2626;
                    border-radius: 4px;
                    cursor: pointer;
                }

                /* Form */
                .form-group {
                    margin-bottom: 1rem;
                }

                .form-group label {
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }

                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 0.875rem;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }

                .btn-secondary {
                    padding: 0.75rem 1.25rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    cursor: pointer;
                }

                .btn-danger {
                    padding: 0.75rem 1.25rem;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    color: #dc2626;
                    cursor: pointer;
                }

                /* Document detail */
                .doc-detail-preview {
                    background: #f8fafc;
                    border-radius: 8px;
                    padding: 2rem;
                    text-align: center;
                    margin-bottom: 1rem;
                }

                .doc-detail-preview img {
                    max-width: 100%;
                    max-height: 300px;
                    border-radius: 8px;
                }

                .preview-placeholder {
                    color: #64748b;
                }

                .preview-placeholder span {
                    font-size: 4rem;
                    display: block;
                }

                .doc-detail-info {
                    background: #f8fafc;
                    border-radius: 8px;
                    padding: 1rem;
                }

                .info-row {
                    display: flex;
                    padding: 0.5rem 0;
                    border-bottom: 1px solid #e2e8f0;
                }

                .info-row:last-child {
                    border-bottom: none;
                }

                .info-row .label {
                    width: 100px;
                    font-weight: 500;
                    color: #64748b;
                }

                .info-row .value {
                    flex: 1;
                }

                .empty-state {
                    text-align: center;
                    padding: 4rem;
                }

                .empty-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }

                .loading {
                    text-align: center;
                    padding: 3rem;
                    color: #64748b;
                }

                @media (max-width: 768px) {
                    .docs-stats {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
            </style>
        `;
    }
};

// Export
window.DocumentsModule = DocumentsModule;
