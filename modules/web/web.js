// modules/web/web.js
// Web CMS modul pre Adlify admin panel
// Spravuje obsah marketingového webu adlify.eu (testimoniály, prípadové štúdie, blog, služby, FAQ, settings)
// Registrácia: App.register(WebModule);

(function () {
  'use strict';

  const TABS = [
    { key: 'testimonials', label: 'Testimoniály',     icon: '💬' },
    { key: 'cases',        label: 'Prípadové štúdie', icon: '📊' },
    { key: 'blog',         label: 'Blog',             icon: '📝' },
    { key: 'services',     label: 'Služby',           icon: '⚙️' },
    { key: 'faq',          label: 'FAQ',              icon: '❓' },
    { key: 'settings',     label: 'Nastavenia',       icon: '🔧' },
  ];

  const TABLE_MAP = {
    testimonials: 'web_testimonials',
    cases:        'web_cases',
    blog:         'web_blog_posts',
    services:     'web_services',
    faq:          'web_faq',
    settings:     'web_settings',
  };

  const WebModule = {
    id: 'web',
    title: 'Marketingový web',
    icon: '🌐',
    menu: { section: 'tools', order: 99 },
    permissions: ['admin'],

    state: {
      activeTab: 'testimonials',
      data: {
        testimonials: [],
        cases: [],
        blog: [],
        services: [],
        faq: [],
        settings: [],
      },
      loading: false,
      buildPending: false,
      lastBuild: null,
    },

    getStyles() {
      return `<style>
        .web-module { max-width: 1400px; margin: 0 auto; padding: 24px; }
        .web-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 32px; flex-wrap: wrap; }
        .web-title { font-size: 28px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; color: #111827; }
        .web-subtitle { color: #6b7280; margin: 0; font-size: 14px; }
        .web-header-actions { display: flex; gap: 8px; }
        .btn-publish { display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; background: linear-gradient(135deg, #F16434, #E85D9C); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; transition: transform 0.15s, box-shadow 0.15s; }
        .btn-publish:hover { transform: translateY(-1px); box-shadow: 0 8px 20px -8px rgba(241,100,52,0.5); }
        .btn-publish:disabled { opacity: 0.5; cursor: wait; }

        .web-build-status { margin-bottom: 16px; }
        .web-build-status:empty { display: none; }
        .web-build-banner { padding: 12px 16px; border-radius: 10px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
        .web-build-banner.success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
        .web-build-banner.pending { background: #fefce8; color: #854d0e; border: 1px solid #fde68a; }
        .web-build-banner.failed { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

        .web-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 0; overflow-x: auto; }
        .web-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #6b7280; cursor: pointer; font-size: 14px; font-weight: 500; white-space: nowrap; transition: color 0.15s, border-color 0.15s; }
        .web-tab:hover { color: #111827; }
        .web-tab.active { color: #111827; border-bottom-color: #F16434; }
        .web-tab-icon { font-size: 16px; }

        .web-loading, .web-empty { text-align: center; padding: 48px 24px; color: #6b7280; }

        .web-toolbar { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .web-toolbar-left { display: flex; gap: 8px; align-items: center; }
        .btn-add { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; background: #111827; color: white; border: none; border-radius: 9px; font-weight: 500; cursor: pointer; font-size: 13px; }
        .btn-add:hover { background: #000; }

        .web-list { display: flex; flex-direction: column; gap: 8px; }
        .web-list-item { display: grid; grid-template-columns: 1fr auto auto auto; gap: 14px; align-items: center; padding: 14px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 10px; transition: border-color 0.15s, box-shadow 0.15s; }
        .web-list-item:hover { border-color: #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .web-list-main { min-width: 0; }
        .web-list-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .web-list-meta { font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .web-list-badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 500; }
        .web-list-badge.published { background: #d1fae5; color: #065f46; }
        .web-list-badge.draft     { background: #fef3c7; color: #92400e; }
        .web-list-actions { display: flex; gap: 4px; }
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #6b7280; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
        .icon-btn:hover { background: #f3f4f6; color: #111827; }
        .icon-btn.danger:hover { background: #fee2e2; color: #b91c1c; }

        .web-settings-row { display: grid; grid-template-columns: 220px 1fr auto; gap: 14px; align-items: center; padding: 12px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 10px; }
        .web-settings-key { font-family: monospace; font-size: 12px; color: #111827; }
        .web-settings-desc { font-size: 11px; color: #6b7280; margin-top: 2px; }

        .web-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 600; opacity: 0; pointer-events: none; transition: opacity 0.25s; backdrop-filter: blur(4px); }
        .web-drawer-backdrop.open { opacity: 1; pointer-events: auto; }
        .web-drawer { position: fixed; top: 0; right: 0; height: 100dvh; width: min(640px, 100vw); background: white; z-index: 601; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.22,0.8,0.2,1); box-shadow: -16px 0 60px -20px rgba(0,0,0,0.25); }
        .web-drawer.open { transform: translateX(0); }
        .web-drawer-header { padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .web-drawer-title { font-size: 18px; font-weight: 600; margin: 0; }
        .web-drawer-close { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e5e7eb; background: white; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .web-drawer-body { flex: 1; overflow-y: auto; padding: 24px; }
        .web-drawer-footer { padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px; }

        .web-form { display: flex; flex-direction: column; gap: 16px; }
        .web-form-group { display: flex; flex-direction: column; gap: 6px; }
        .web-form-group.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .web-form-label { font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.03em; }
        .web-form-hint { font-size: 11px; color: #6b7280; margin-top: 2px; }
        .web-form-input, .web-form-textarea, .web-form-select { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; background: white; transition: border-color 0.15s, box-shadow 0.15s; }
        .web-form-input:focus, .web-form-textarea:focus, .web-form-select:focus { outline: none; border-color: #F16434; box-shadow: 0 0 0 3px rgba(241,100,52,0.1); }
        .web-form-textarea { resize: vertical; min-height: 90px; line-height: 1.5; font-family: inherit; }
        .web-form-checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .web-form-checkbox input { margin: 0; width: 16px; height: 16px; }

        .btn-primary { padding: 10px 18px; background: #111827; color: white; border: none; border-radius: 9px; font-weight: 500; cursor: pointer; font-size: 14px; }
        .btn-primary:hover { background: #000; }
        .btn-secondary { padding: 10px 18px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 9px; font-weight: 500; cursor: pointer; font-size: 14px; }
        .btn-secondary:hover { background: #f9fafb; }
        .btn-danger { padding: 10px 18px; background: #dc2626; color: white; border: none; border-radius: 9px; font-weight: 500; cursor: pointer; font-size: 14px; }
        .btn-danger:hover { background: #b91c1c; }

        @media (max-width: 768px) {
          .web-module { padding: 16px; }
          .web-list-item { grid-template-columns: 1fr auto; gap: 8px; padding: 12px; }
          .web-list-actions { grid-column: 1 / -1; justify-content: flex-end; }
          .web-list-badge { display: none; }
          .web-form-group.row-2 { grid-template-columns: 1fr; }
          .web-settings-row { grid-template-columns: 1fr; gap: 8px; }
        }
      </style>`;
    },

    async render() {
      return `
        ${this.getStyles()}
        <div class="web-module">
          <div class="web-header">
            <div>
              <h1 class="web-title">Marketingový web</h1>
              <p class="web-subtitle">Spravujte obsah na adlify.eu — testimoniály, prípadové štúdie, blog, FAQ.</p>
            </div>
            <div class="web-header-actions">
              <button class="btn-publish" id="web-publish-btn">
                <span>📤</span>
                <span>Publikovať zmeny</span>
              </button>
            </div>
          </div>

          <div class="web-build-status" id="web-build-status"></div>

          <div class="web-tabs">
            ${TABS.map(t => `
              <button class="web-tab ${this.state.activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">
                <span class="web-tab-icon">${t.icon}</span>
                <span>${t.label}</span>
              </button>
            `).join('')}
          </div>

          <div class="web-tab-content" id="web-tab-content">
            <div class="web-loading">Načítavam…</div>
          </div>
        </div>
      `;
    },

    async afterRender() {
      this.bindHeader();
      this.bindTabs();
      await this.loadActiveTab();
      this.checkLastBuild();
    },

    bindHeader() {
      const btn = document.getElementById('web-publish-btn');
      if (btn) btn.addEventListener('click', () => this.publish());
    },

    bindTabs() {
      document.querySelectorAll('.web-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this.state.activeTab = tab.getAttribute('data-tab');
          document.querySelectorAll('.web-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.loadActiveTab();
        });
      });
    },

    async loadActiveTab() {
      const container = document.getElementById('web-tab-content');
      if (!container) return;
      container.innerHTML = '<div class="web-loading">Načítavam…</div>';

      const tabKey = this.state.activeTab;
      try {
        await this.fetchData(tabKey);
        this.renderTab(tabKey);
      } catch (err) {
        console.error(`[web] load ${tabKey} failed`, err);
        container.innerHTML = `<div class="web-empty">Chyba pri načítaní: ${err.message || err}</div>`;
      }
    },

    async fetchData(tabKey) {
      const table = TABLE_MAP[tabKey];
      if (!table) return;

      const orderCol = tabKey === 'blog' ? 'published_at' : (tabKey === 'settings' ? 'key' : 'sort_order');
      const orderAsc = tabKey === 'blog' ? false : true;

      const { data, error } = await Database.client
        .from(table)
        .select('*')
        .order(orderCol, { ascending: orderAsc, nullsFirst: false });

      if (error) throw error;
      this.state.data[tabKey] = data || [];
    },

    renderTab(tabKey) {
      const container = document.getElementById('web-tab-content');
      if (!container) return;
      const items = this.state.data[tabKey] || [];

      if (tabKey === 'settings') {
        this.renderSettings(container, items);
        return;
      }

      const newButtonLabel = ({
        testimonials: 'Pridať testimoniál',
        cases:        'Pridať prípadovú štúdiu',
        blog:         'Pridať blog post',
        services:     'Pridať službu',
        faq:          'Pridať otázku',
      })[tabKey] || 'Pridať';

      container.innerHTML = `
        <div class="web-toolbar">
          <div class="web-toolbar-left">
            <span style="color: #6b7280; font-size: 13px;">${items.length} ${items.length === 1 ? 'položka' : (items.length < 5 ? 'položky' : 'položiek')}</span>
          </div>
          <button class="btn-add" id="web-add-btn">
            <span>+</span>
            <span>${newButtonLabel}</span>
          </button>
        </div>

        <div class="web-list" id="web-list">
          ${items.length === 0 ? '<div class="web-empty">Zatiaľ tu nič nie je. Pridajte prvú položku.</div>' : items.map(item => this.renderListItem(tabKey, item)).join('')}
        </div>
      `;

      const addBtn = document.getElementById('web-add-btn');
      if (addBtn) addBtn.addEventListener('click', () => this.openEditor(tabKey, null));

      document.querySelectorAll('.web-list-item').forEach(el => {
        const id = el.getAttribute('data-id');
        const editBtn = el.querySelector('.icon-btn[data-action="edit"]');
        const toggleBtn = el.querySelector('.icon-btn[data-action="toggle"]');
        const deleteBtn = el.querySelector('.icon-btn[data-action="delete"]');

        if (editBtn) editBtn.addEventListener('click', () => {
          const item = items.find(i => i.id === id);
          this.openEditor(tabKey, item);
        });
        if (toggleBtn) toggleBtn.addEventListener('click', () => {
          const item = items.find(i => i.id === id);
          this.togglePublished(tabKey, item);
        });
        if (deleteBtn) deleteBtn.addEventListener('click', () => {
          const item = items.find(i => i.id === id);
          this.deleteItem(tabKey, item);
        });
      });
    },

    renderListItem(tabKey, item) {
      let title = '';
      let meta = '';
      switch (tabKey) {
        case 'testimonials':
          title = item.author_name || '(bez mena)';
          meta = (item.quote || '').substring(0, 90) + (item.quote && item.quote.length > 90 ? '…' : '');
          break;
        case 'cases':
          title = item.title || '(bez názvu)';
          meta = `${item.category || ''} · ${item.kpi_1_label || ''} ${item.kpi_1_value || ''}`;
          break;
        case 'blog':
          title = item.title || '(bez názvu)';
          meta = `${item.category || ''} · ${item.published_at ? new Date(item.published_at).toLocaleDateString('sk-SK') : 'koncept'}`;
          break;
        case 'services':
          title = `${item.tag || ''} ${item.title || ''}`.trim();
          meta = (item.description || '').substring(0, 90);
          break;
        case 'faq':
          title = item.question || '(bez otázky)';
          meta = (item.answer || '').substring(0, 90);
          break;
      }

      const isPublished = item.is_published !== false;
      return `
        <div class="web-list-item" data-id="${item.id}">
          <div class="web-list-main">
            <div class="web-list-title">${this.escapeHTML(title)}</div>
            <div class="web-list-meta">${this.escapeHTML(meta)}</div>
          </div>
          <span class="web-list-badge ${isPublished ? 'published' : 'draft'}">${isPublished ? 'Zverejnené' : 'Koncept'}</span>
          <div class="web-list-actions">
            <button class="icon-btn" data-action="toggle" title="${isPublished ? 'Skryť' : 'Zverejniť'}">${isPublished ? '👁️' : '🚫'}</button>
            <button class="icon-btn" data-action="edit" title="Upraviť">✏️</button>
            <button class="icon-btn danger" data-action="delete" title="Zmazať">🗑️</button>
          </div>
        </div>
      `;
    },

    renderSettings(container, items) {
      container.innerHTML = `
        <div class="web-toolbar">
          <div class="web-toolbar-left">
            <span style="color: #6b7280; font-size: 13px;">Globálne nastavenia, ktoré sa zobrazujú na webe</span>
          </div>
        </div>
        <div class="web-list" id="web-list">
          ${items.map(item => `
            <div class="web-settings-row" data-key="${this.escapeAttr(item.key)}">
              <div>
                <div class="web-settings-key">${this.escapeHTML(item.key)}</div>
                <div class="web-settings-desc">${this.escapeHTML(item.description || '')}</div>
              </div>
              <input class="web-form-input" data-setting-key="${this.escapeAttr(item.key)}" value="${this.escapeAttr(typeof item.value === 'string' ? item.value : JSON.stringify(item.value))}">
              <button class="btn-primary" data-save-key="${this.escapeAttr(item.key)}" style="padding: 8px 14px;">Uložiť</button>
            </div>
          `).join('')}
        </div>
      `;

      document.querySelectorAll('[data-save-key]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const key = btn.getAttribute('data-save-key');
          const input = container.querySelector(`[data-setting-key="${CSS.escape(key)}"]`);
          if (input) await this.saveSetting(key, input.value);
        });
      });
    },

    async saveSetting(key, valueStr) {
      try {
        let value;
        try { value = JSON.parse(valueStr); } catch { value = valueStr; }

        const { error } = await Database.client
          .from('web_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);

        if (error) throw error;
        Utils.toast('Uložené ✓', 'success');
        this.markBuildPending();
      } catch (err) {
        Utils.toast('Chyba: ' + err.message, 'error');
      }
    },

    openEditor(tabKey, item) {
      const isNew = !item;
      const data = item || this.defaults(tabKey);

      const drawer = document.createElement('div');
      drawer.innerHTML = `
        <div class="web-drawer-backdrop" id="web-drawer-bd"></div>
        <aside class="web-drawer" id="web-drawer">
          <div class="web-drawer-header">
            <h2 class="web-drawer-title">${isNew ? 'Pridať' : 'Upraviť'}</h2>
            <button class="web-drawer-close" id="web-drawer-close">✕</button>
          </div>
          <div class="web-drawer-body">
            <form class="web-form" id="web-form" onsubmit="return false;">
              ${this.renderFormFields(tabKey, data)}
              <label class="web-form-checkbox" style="margin-top: 8px;">
                <input type="checkbox" name="is_published" ${data.is_published !== false ? 'checked' : ''}>
                <span>Zverejnené (viditeľné na webe)</span>
              </label>
            </form>
          </div>
          <div class="web-drawer-footer">
            ${!isNew ? `<button class="btn-danger" id="web-delete-btn" style="margin-right: auto;">Zmazať</button>` : ''}
            <button class="btn-secondary" id="web-cancel-btn">Zrušiť</button>
            <button class="btn-primary" id="web-save-btn">${isNew ? 'Pridať' : 'Uložiť'}</button>
          </div>
        </aside>
      `;
      document.body.appendChild(drawer);

      requestAnimationFrame(() => {
        drawer.querySelector('#web-drawer-bd').classList.add('open');
        drawer.querySelector('#web-drawer').classList.add('open');
      });

      const close = () => {
        drawer.querySelector('#web-drawer-bd').classList.remove('open');
        drawer.querySelector('#web-drawer').classList.remove('open');
        setTimeout(() => drawer.remove(), 280);
      };

      drawer.querySelector('#web-drawer-close').addEventListener('click', close);
      drawer.querySelector('#web-cancel-btn').addEventListener('click', close);
      drawer.querySelector('#web-drawer-bd').addEventListener('click', close);

      drawer.querySelector('#web-save-btn').addEventListener('click', async () => {
        const form = drawer.querySelector('#web-form');
        const formData = new FormData(form);
        const payload = {};
        formData.forEach((value, key) => { payload[key] = value; });
        payload.is_published = form.querySelector('[name="is_published"]').checked;
        const featuredCheckbox = form.querySelector('[name="is_featured"]');
        if (featuredCheckbox) payload.is_featured = featuredCheckbox.checked;

        if ('sort_order' in payload) payload.sort_order = parseInt(payload.sort_order) || 0;
        if ('read_time_min' in payload) payload.read_time_min = parseInt(payload.read_time_min) || 5;

        if ('published_at' in payload && !payload.published_at) {
          payload.published_at = null;
        } else if (payload.published_at && !payload.published_at.includes('T')) {
          payload.published_at = new Date(payload.published_at).toISOString();
        }

        Object.keys(payload).forEach(k => {
          if (payload[k] === '' && k !== 'is_published' && k !== 'is_featured') payload[k] = null;
        });

        try {
          await this.saveItem(tabKey, item && item.id, payload);
          close();
          await this.loadActiveTab();
          Utils.toast('Uložené ✓', 'success');
        } catch (err) {
          Utils.toast('Chyba: ' + err.message, 'error');
        }
      });

      const delBtn = drawer.querySelector('#web-delete-btn');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Naozaj zmazať túto položku?')) return;
        await this.deleteItem(tabKey, item, false);
        close();
        await this.loadActiveTab();
      });
    },

    defaults(tabKey) {
      const d = { is_published: true, sort_order: 0 };
      if (tabKey === 'blog') {
        d.published_at = new Date().toISOString();
        d.read_time_min = 5;
      }
      return d;
    },

    renderFormFields(tabKey, item) {
      const f = (label, name, value, opts = {}) => {
        const type = opts.type || 'text';
        const tag = opts.textarea ? 'textarea' : 'input';
        const val = (value === null || value === undefined) ? '' : value;
        return `
          <div class="web-form-group">
            <label class="web-form-label">${label}</label>
            ${tag === 'textarea'
              ? `<textarea class="web-form-textarea" name="${name}" ${opts.rows ? `rows="${opts.rows}"` : ''}>${this.escapeHTML(val)}</textarea>`
              : `<input class="web-form-input" name="${name}" type="${type}" value="${this.escapeAttr(val)}">`
            }
            ${opts.hint ? `<div class="web-form-hint">${opts.hint}</div>` : ''}
          </div>
        `;
      };

      const numberF = (label, name, value, opts = {}) => f(label, name, value, Object.assign({}, opts, { type: 'number' }));

      switch (tabKey) {
        case 'testimonials':
          return `
            ${f('Citát', 'quote', item.quote, { textarea: true, rows: 4, hint: 'Čo klient povedal — krátko a úderne.' })}
            <div class="web-form-group row-2">
              ${f('Meno', 'author_name', item.author_name)}
              ${f('Iniciály (avatar)', 'author_initials', item.author_initials, { hint: 'Napr. PN' })}
            </div>
            ${f('Funkcia / firma', 'author_role', item.author_role, { hint: 'Napr. Konateľka, Krajčírstvo Soja' })}
            ${numberF('Poradie', 'sort_order', item.sort_order, { hint: 'Nižšie číslo = vyššie zobrazenie' })}
          `;
        case 'cases':
          return `
            <div class="web-form-group row-2">
              ${f('Slug (URL)', 'slug', item.slug, { hint: 'Napr. zlatka-sk' })}
              ${f('Názov', 'title', item.title)}
            </div>
            ${f('Kategória', 'category', item.category, { hint: 'Napr. E-COMMERCE · ŠPERKY' })}
            ${f('Hero gradient (CSS)', 'hero_gradient', item.hero_gradient, { hint: 'CSS linear-gradient(...)' })}
            ${f('Krátke zhrnutie', 'summary', item.summary, { textarea: true, rows: 2 })}
            ${f('Detail (Markdown)', 'body_md', item.body_md, { textarea: true, rows: 6 })}
            <div class="web-form-group row-2">
              ${f('KPI 1 — popis', 'kpi_1_label', item.kpi_1_label, { hint: 'Napr. Tržby YoY' })}
              ${f('KPI 1 — hodnota', 'kpi_1_value', item.kpi_1_value, { hint: 'Napr. +284%' })}
            </div>
            <div class="web-form-group row-2">
              ${f('KPI 2 — popis', 'kpi_2_label', item.kpi_2_label, { hint: 'Napr. ROAS' })}
              ${f('KPI 2 — hodnota', 'kpi_2_value', item.kpi_2_value, { hint: 'Napr. 6.2×' })}
            </div>
            ${numberF('Poradie', 'sort_order', item.sort_order)}
          `;
        case 'blog':
          return `
            <div class="web-form-group row-2">
              ${f('Slug (URL)', 'slug', item.slug)}
              ${f('Kategória', 'category', item.category, { hint: 'Napr. Google Ads, SEO' })}
            </div>
            ${f('Titulok', 'title', item.title)}
            ${f('Krátky popis (excerpt)', 'excerpt', item.excerpt, { textarea: true, rows: 2 })}
            ${f('Obsah (Markdown)', 'body_md', item.body_md, { textarea: true, rows: 12 })}
            <div class="web-form-group row-2">
              ${numberF('Čas čítania (min)', 'read_time_min', item.read_time_min)}
              ${f('Dátum publikácie', 'published_at', item.published_at ? item.published_at.substring(0,10) : '', { type: 'date' })}
            </div>
            <div class="web-form-group row-2">
              ${f('Autor — meno', 'author_name', item.author_name)}
              ${f('Autor — iniciály', 'author_initials', item.author_initials)}
            </div>
            <label class="web-form-checkbox">
              <input type="checkbox" name="is_featured" ${item.is_featured ? 'checked' : ''}>
              <span>Featured (zobrazí sa v hero blog stránky)</span>
            </label>
          `;
        case 'services':
          return `
            <div class="web-form-group row-2">
              ${f('Tag', 'tag', item.tag, { hint: 'Napr. 01' })}
              ${f('Názov', 'title', item.title)}
            </div>
            ${f('Popis', 'description', item.description, { textarea: true, rows: 3 })}
            <div class="web-form-group row-2">
              ${f('Stat 1 — popis', 'stat_1_label', item.stat_1_label, { hint: 'Napr. Setup' })}
              ${f('Stat 1 — hodnota', 'stat_1_value', item.stat_1_value, { hint: 'Napr. 10 dní' })}
            </div>
            <div class="web-form-group row-2">
              ${f('Stat 2 — popis', 'stat_2_label', item.stat_2_label)}
              ${f('Stat 2 — hodnota', 'stat_2_value', item.stat_2_value)}
            </div>
            <div class="web-form-group row-2">
              ${f('Stat 3 — popis', 'stat_3_label', item.stat_3_label)}
              ${f('Stat 3 — hodnota', 'stat_3_value', item.stat_3_value)}
            </div>
            <div class="web-form-group row-2">
              ${f('Stat 4 — popis', 'stat_4_label', item.stat_4_label)}
              ${f('Stat 4 — hodnota', 'stat_4_value', item.stat_4_value)}
            </div>
            ${numberF('Poradie', 'sort_order', item.sort_order)}
          `;
        case 'faq':
          return `
            ${f('Otázka', 'question', item.question)}
            ${f('Odpoveď', 'answer', item.answer, { textarea: true, rows: 5 })}
            <div class="web-form-group row-2">
              ${f('Kategória', 'category', item.category, { hint: 'Napr. Cenník, Spolupráca' })}
              ${numberF('Poradie', 'sort_order', item.sort_order)}
            </div>
          `;
      }
      return '';
    },

    async saveItem(tabKey, id, payload) {
      const table = TABLE_MAP[tabKey];
      payload.updated_at = new Date().toISOString();

      let result;
      if (id) {
        result = await Database.client.from(table).update(payload).eq('id', id);
      } else {
        result = await Database.client.from(table).insert(payload);
      }
      if (result.error) throw result.error;
      this.markBuildPending();
    },

    async togglePublished(tabKey, item) {
      const table = TABLE_MAP[tabKey];
      const { error } = await Database.client
        .from(table)
        .update({ is_published: !item.is_published, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) {
        Utils.toast('Chyba: ' + error.message, 'error');
        return;
      }
      await this.loadActiveTab();
      this.markBuildPending();
    },

    async deleteItem(tabKey, item, askConfirm = true) {
      if (askConfirm && !confirm('Naozaj zmazať túto položku?')) return;
      const table = TABLE_MAP[tabKey];
      const { error } = await Database.client.from(table).delete().eq('id', item.id);
      if (error) {
        Utils.toast('Chyba: ' + error.message, 'error');
        return;
      }
      if (askConfirm) {
        await this.loadActiveTab();
      }
      this.markBuildPending();
      Utils.toast('Zmazané ✓', 'success');
    },

    markBuildPending() {
      this.state.buildPending = true;
      this.renderBuildStatus();
    },

    async checkLastBuild() {
      try {
        const { data, error } = await Database.client
          .from('web_build_log')
          .select('*')
          .order('triggered_at', { ascending: false })
          .limit(1);
        if (!error && data && data.length) {
          this.state.lastBuild = data[0];
          this.renderBuildStatus();
        }
      } catch (e) { /* silent */ }
    },

    renderBuildStatus() {
      const el = document.getElementById('web-build-status');
      if (!el) return;
      let html = '';
      if (this.state.buildPending) {
        html = `<div class="web-build-banner pending">
          <span>⚠️</span>
          <span>Máte neuložené zmeny. Kliknite na <strong>Publikovať zmeny</strong> aby sa prejavili na webe.</span>
        </div>`;
      } else if (this.state.lastBuild) {
        const b = this.state.lastBuild;
        const time = new Date(b.triggered_at).toLocaleString('sk-SK');
        if (b.status === 'success') {
          html = `<div class="web-build-banner success"><span>✅</span><span>Naposledy publikované: ${time}</span></div>`;
        } else if (b.status === 'failed') {
          html = `<div class="web-build-banner failed"><span>❌</span><span>Posledný deploy zlyhal (${time}): ${this.escapeHTML(b.error_message || '')}</span></div>`;
        }
      }
      el.innerHTML = html;
    },

    async publish() {
      const btn = document.getElementById('web-publish-btn');
      const labelSpan = btn ? btn.querySelector('span:last-child') : null;
      if (btn) {
        btn.disabled = true;
        if (labelSpan) labelSpan.textContent = 'Publikujem…';
      }

      try {
        const { data: { user } } = await Database.client.auth.getUser();
        const { data: logRow, error: logErr } = await Database.client
          .from('web_build_log')
          .insert({ triggered_by: user && user.id, status: 'pending' })
          .select()
          .single();
        if (logErr) throw logErr;

        const { data, error } = await Database.client.functions.invoke('trigger-web-build', {
          body: { build_log_id: logRow.id }
        });

        if (error) throw error;

        this.state.buildPending = false;
        this.state.lastBuild = Object.assign({}, logRow, { status: 'success' });
        this.renderBuildStatus();
        Utils.toast('Web bol naplánovaný na rebuild — zmeny budú online o 1-3 min ✓', 'success');
      } catch (err) {
        console.error(err);
        Utils.toast('Chyba pri publikovaní: ' + (err.message || err), 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          if (labelSpan) labelSpan.textContent = 'Publikovať zmeny';
        }
      }
    },

    escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    },
    escapeAttr(val) {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
  };

  window.WebModule = WebModule;
})();
