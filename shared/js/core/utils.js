/**
 * ADLIFY PLATFORM - Utils
 * @version 1.0.0
 * 
 * Helper functions used across the app
 */

const Utils = {
  
  // ==========================================
  // DATE & TIME
  // ==========================================
  
  /**
   * Format date
   */
  formatDate(date, format = 'short') {
    if (!date) return '-';
    const d = new Date(date);
    const locale = Config.get('locale') || 'sk-SK';
    
    const formats = {
      short: { day: 'numeric', month: 'short' },
      medium: { day: 'numeric', month: 'short', year: 'numeric' },
      long: { day: 'numeric', month: 'long', year: 'numeric' },
      full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      time: { hour: '2-digit', minute: '2-digit' },
      datetime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    };
    
    return d.toLocaleDateString(locale, formats[format] || formats.short);
  },
  
  /**
   * Time ago (relative time)
   */
  timeAgo(date) {
    if (!date) return '-';
    const d = new Date(date);
    const diff = Date.now() - d.getTime();
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'práve teraz';
    if (minutes < 60) return `pred ${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `pred ${hours}h`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `pred ${days}d`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `pred ${weeks} týžd.`;
    
    return this.formatDate(date, 'medium');
  },
  
  /**
   * Is today
   */
  isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  },
  
  /**
   * Is past
   */
  isPast(date) {
    return new Date(date) < new Date();
  },
  
  // ==========================================
  // FORMATTING
  // ==========================================
  
  /**
   * Format currency
   */
  formatCurrency(amount, currency = null) {
    if (amount === null || amount === undefined) return '-';
    const cur = currency || Config.get('currency') || 'EUR';
    const locale = Config.get('locale') || 'sk-SK';
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  },
  
  /**
   * Format number
   */
  formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '-';
    const locale = Config.get('locale') || 'sk-SK';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  },
  
  /**
   * Format percent
   */
  formatPercent(value, decimals = 1) {
    if (value === null || value === undefined) return '-';
    return this.formatNumber(value, decimals) + '%';
  },
  
  /**
   * Format phone
   */
  formatPhone(phone) {
    if (!phone) return '-';
    // Slovak format: +421 XXX XXX XXX
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('421')) {
      return `+${cleaned.slice(0,3)} ${cleaned.slice(3,6)} ${cleaned.slice(6,9)} ${cleaned.slice(9)}`;
    }
    return phone;
  },
  
  // ==========================================
  // STRINGS
  // ==========================================
  
  /**
   * Truncate text
   */
  truncate(text, length = 50) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  },
  
  /**
   * Slugify
   */
  slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },
  
  /**
   * Capitalize
   */
  capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
  
  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  // ==========================================
  // STATUS & BADGES
  // ==========================================
  
  /**
   * Get status badge HTML
   */
  statusBadge(status, type = 'lead') {
    const configs = {
      lead: {
        new: { label: 'Nový', class: 'bg-blue-100 text-blue-700', icon: '🆕' },
        analyzing: { label: 'Analyzuje sa', class: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
        ready: { label: 'Ready', class: 'bg-purple-100 text-purple-700', icon: '✨' },
        contacted: { label: 'Kontaktovaný', class: 'bg-orange-100 text-orange-700', icon: '📧' },
        negotiating: { label: 'Vyjednáva sa', class: 'bg-cyan-100 text-cyan-700', icon: '🤝' },
        converted: { label: 'Klient', class: 'bg-green-100 text-green-700', icon: '✅' },
        lost: { label: 'Stratený', class: 'bg-gray-100 text-gray-500', icon: '❌' }
      },
      client: {
        trial: { label: 'Trial', class: 'bg-blue-100 text-blue-700', icon: '🧪' },
        active: { label: 'Aktívny', class: 'bg-green-100 text-green-700', icon: '✅' },
        paused: { label: 'Pozastavený', class: 'bg-yellow-100 text-yellow-700', icon: '⏸️' },
        cancelled: { label: 'Zrušený', class: 'bg-red-100 text-red-700', icon: '❌' }
      },
      campaign: {
        draft: { label: 'Koncept', class: 'bg-gray-100 text-gray-600', icon: '📝' },
        active: { label: 'Aktívna', class: 'bg-green-100 text-green-700', icon: '▶️' },
        paused: { label: 'Pozastavená', class: 'bg-yellow-100 text-yellow-700', icon: '⏸️' },
        ended: { label: 'Ukončená', class: 'bg-gray-100 text-gray-500', icon: '⏹️' }
      },
      invoice: {
        draft: { label: 'Koncept', class: 'bg-gray-100 text-gray-600', icon: '📝' },
        sent: { label: 'Odoslaná', class: 'bg-blue-100 text-blue-700', icon: '📤' },
        paid: { label: 'Zaplatená', class: 'bg-green-100 text-green-700', icon: '✅' },
        overdue: { label: 'Po splatnosti', class: 'bg-red-100 text-red-700', icon: '⚠️' }
      },
      task: {
        todo: { label: 'Na spraviť', class: 'bg-gray-100 text-gray-600', icon: '📋' },
        in_progress: { label: 'Prebieha', class: 'bg-blue-100 text-blue-700', icon: '🔄' },
        waiting: { label: 'Čaká sa', class: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
        done: { label: 'Hotovo', class: 'bg-green-100 text-green-700', icon: '✅' }
      }
    };
    
    const config = configs[type]?.[status] || { label: status, class: 'bg-gray-100', icon: '📋' };
    
    return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.class}">
      ${config.icon} ${config.label}
    </span>`;
  },
  
  /**
   * Get score badge
   */
  scoreBadge(score) {
    if (!score && score !== 0) return '<span class="text-gray-400">-</span>';
    
    let colorClass = 'bg-red-100 text-red-700';
    if (score >= 80) colorClass = 'bg-green-100 text-green-700';
    else if (score >= 60) colorClass = 'bg-yellow-100 text-yellow-700';
    
    return `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${colorClass}">${score}</span>`;
  },
  
  /**
   * Get priority badge
   */
  priorityBadge(priority) {
    const configs = {
      low: { label: 'Nízka', class: 'text-gray-500', icon: '⬇️' },
      medium: { label: 'Stredná', class: 'text-blue-600', icon: '➡️' },
      high: { label: 'Vysoká', class: 'text-orange-600', icon: '⬆️' },
      urgent: { label: 'Urgentná', class: 'text-red-600', icon: '🔥' }
    };
    
    const config = configs[priority] || configs.medium;
    return `<span class="${config.class}">${config.icon}</span>`;
  },
  
  // ==========================================
  // DOM
  // ==========================================
  
  /**
   * Create element from HTML string
   */
  createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  },
  
  /**
   * Show loading
   */
  showLoading(container, message = 'Načítavam...') {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-32">
          <div class="animate-spin text-3xl mb-2">⏳</div>
          <span class="text-gray-500">${message}</span>
        </div>
      `;
    }
  },
  
  /**
   * Show empty state
   */
  showEmpty(container, message = 'Žiadne dáta', icon = '📭') {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-32 text-center">
          <div class="text-4xl mb-2">${icon}</div>
          <span class="text-gray-500">${message}</span>
        </div>
      `;
    }
  },
  
  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  
  /**
   * Show toast notification
   */
  toast(message, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    };
    
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-up`;
    toast.style.zIndex = '10000';
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  /**
   * Confirm dialog - pekné vyskakovacie okno
   * @param {string} message - Text správy
   * @param {object|string} options - Konfigurácia alebo title string (spätná kompatibilita)
   * @param {string} options.title - Nadpis
   * @param {string} options.type - 'danger' | 'warning' | 'success' | 'info' (default: 'danger')
   * @param {string} options.confirmText - Text tlačidla (default: 'Potvrdiť')
   * @param {string} options.cancelText - Text zrušenia (default: 'Zrušiť')
   */
  async confirm(message, options = {}) {
    if (typeof options === 'string') options = { title: options };
    
    const {
      title = 'Potvrdiť',
      type = 'danger',
      confirmText = 'Potvrdiť',
      cancelText = 'Zrušiť'
    } = options;

    const themes = {
      danger: {
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        iconBg: '#fef2f2', iconBorder: '#fecaca',
        btnBg: '#dc2626', btnHover: '#b91c1c'
      },
      warning: {
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        iconBg: '#fffbeb', iconBorder: '#fde68a',
        btnBg: '#f59e0b', btnHover: '#d97706'
      },
      success: {
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        iconBg: '#f0fdf4', iconBorder: '#bbf7d0',
        btnBg: '#22c55e', btnHover: '#16a34a'
      },
      info: {
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        iconBg: '#eef2ff', iconBorder: '#c7d2fe',
        btnBg: '#6366f1', btnHover: '#4f46e5'
      }
    };

    const t = themes[type] || themes.danger;

    return new Promise((resolve) => {
      const existing = document.getElementById('utils-confirm-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'utils-confirm-modal';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '9999', padding: '1rem', backdropFilter: 'blur(4px)',
        opacity: '0', transition: 'opacity 0.15s ease'
      });

      overlay.innerHTML = `
        <div id="utils-confirm-box" style="
          background: white; border-radius: 16px; width: 100%; max-width: 400px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          transform: scale(0.95) translateY(10px);
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
          overflow: hidden;
        ">
          <div style="padding: 1.5rem 1.5rem 1rem; text-align: center;">
            <div style="
              width: 56px; height: 56px; border-radius: 50%;
              background: ${t.iconBg}; border: 2px solid ${t.iconBorder};
              display: flex; align-items: center; justify-content: center;
              margin: 0 auto 1rem;
            ">${t.icon}</div>
            <h3 style="font-size: 1.125rem; font-weight: 700; color: #1e293b; margin: 0 0 0.5rem;">${title}</h3>
            <p style="font-size: 0.9rem; color: #64748b; margin: 0; line-height: 1.5;">${message}</p>
          </div>
          <div style="padding: 1rem 1.5rem 1.5rem; display: flex; gap: 0.75rem;">
            <button data-action="cancel" style="
              flex: 1; padding: 0.625rem 1rem; border-radius: 10px;
              border: 1px solid #e2e8f0; background: white; color: #475569;
              font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
            ">${cancelText}</button>
            <button data-action="confirm" style="
              flex: 1; padding: 0.625rem 1rem; border-radius: 10px;
              border: none; background: ${t.btnBg}; color: white;
              font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
            ">${confirmText}</button>
          </div>
        </div>
      `;

      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      const cancelBtn = overlay.querySelector('[data-action="cancel"]');
      confirmBtn.onmouseenter = () => confirmBtn.style.background = t.btnHover;
      confirmBtn.onmouseleave = () => confirmBtn.style.background = t.btnBg;
      cancelBtn.onmouseenter = () => { cancelBtn.style.background = '#f8fafc'; cancelBtn.style.borderColor = '#cbd5e1'; };
      cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'white'; cancelBtn.style.borderColor = '#e2e8f0'; };

      const close = (result) => {
        const box = document.getElementById('utils-confirm-box');
        overlay.style.opacity = '0';
        if (box) box.style.transform = 'scale(0.95) translateY(10px)';
        setTimeout(() => { overlay.remove(); resolve(result); }, 150);
      };

      overlay.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action === 'confirm') close(true);
        else if (action === 'cancel' || e.target === overlay) close(false);
      });

      const onKey = (e) => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        const box = document.getElementById('utils-confirm-box');
        if (box) box.style.transform = 'scale(1) translateY(0)';
      });
    });
  },
  
  // ==========================================
  // VALIDATION
  // ==========================================
  
  /**
   * Validate email
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  
  /**
   * Validate URL
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  
  /**
   * Validate domain
   */
  isValidDomain(domain) {
    return /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain);
  }
};

// Export
window.Utils = Utils;
