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
    toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-slide-up`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  /**
   * Confirm dialog
   */
  async confirm(message, title = 'Potvrdiť') {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-sm mx-4">
          <h3 class="font-bold text-lg mb-2">${title}</h3>
          <p class="text-gray-600 mb-6">${message}</p>
          <div class="flex gap-3">
            <button class="flex-1 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200" data-action="cancel">Zrušiť</button>
            <button class="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600" data-action="confirm">Potvrdiť</button>
          </div>
        </div>
      `;
      
      modal.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action === 'confirm') resolve(true);
        if (action === 'cancel' || e.target === modal) resolve(false);
        modal.remove();
      });
      
      document.body.appendChild(modal);
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
