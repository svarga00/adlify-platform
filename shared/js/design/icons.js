/* Adlify Icon Library — Lucide-like stroke SVGs
 * Použitie:
 *   I.Dashboard()                       → '<svg ...>…</svg>' (default 18px, 1.6 stroke)
 *   I.Dashboard({ size: 20, stroke: 2, color: 'var(--brand-500)' })
 *   I.Logo({ size: 32 })                → plný brand logo SVG
 *   I.LogoWord({ size: 28, sub: 'KLIENT' }) → logo + "Adlify" text
 */
(function (w) {
  'use strict';

  function attrs(o) {
    const {
      size = 18,
      stroke = 1.6,
      color = 'currentColor',
      fill = 'none',
      className = '',
      style = ''
    } = o || {};
    const styleAttr = style ? ` style="${style}"` : '';
    const classAttr = className ? ` class="${className}"` : '';
    return {
      open: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"${classAttr}${styleAttr}>`,
      close: '</svg>'
    };
  }

  function icon(pathOrInner) {
    return function (opts) {
      const a = attrs(opts);
      return a.open + pathOrInner + a.close;
    };
  }

  const I = {
    // Brand mark — orange gradient square with "A" monogram
    Logo: function (opts) {
      const { size = 28, id = 'd' } = opts || {};
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">
        <defs><linearGradient id="adlG-${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FB923C"/>
          <stop offset="1" stop-color="#EA580C"/>
        </linearGradient></defs>
        <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#adlG-${id})"/>
        <path d="M8 23 L14 8.5 L18 8.5 L24 23 M11 18 L21 18" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="24" cy="8" r="2.4" fill="#fff"/>
      </svg>`;
    },

    LogoWord: function (opts) {
      const { size = 28, id = 'd', sub = '', color = 'currentColor' } = opts || {};
      const subTag = sub ? `<span style="font-size:.55em;font-weight:500;color:var(--ink-sub);margin-left:6px;text-transform:uppercase;letter-spacing:.8px">${sub}</span>` : '';
      return `<span style="display:inline-flex;align-items:center;gap:9px">
        ${I.Logo({ size: size, id: id })}
        <span style="font-size:${size * 0.66}px;font-weight:700;letter-spacing:-.5px;color:${color}">Adlify${subTag}</span>
      </span>`;
    },

    // Nav icons
    Dashboard: icon('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    Leads:     icon('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    Clients:   icon('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1.5-4 5-5 7-5s5.5 1 7 5"/><circle cx="17" cy="7" r="2.5"/><path d="M15 13c3 0 5 2 6 5"/>'),
    Projects:  icon('<path d="M3 7.5l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16.5l9 4 9-4"/>'),
    Campaign:  icon('<path d="M3 11v2a1 1 0 001 1h3l8 5V5L7 10H4a1 1 0 00-1 1z"/><path d="M18 9a4 4 0 010 6"/>'),
    Mail:      icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    Tasks:     icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 11l3 3 5-6"/>'),
    Ticket:    icon('<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'),
    Invoice:   icon('<path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 12h6M9 16h6M9 8h3"/>'),
    Onboard:   icon('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    Package:   icon('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
    Report:    icon('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
    Calendar:  icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    Template:  icon('<rect x="3" y="3" width="18" height="5" rx="1.5"/><rect x="3" y="11" width="9" height="10" rx="1.5"/><rect x="15" y="11" width="6" height="10" rx="1.5"/>'),
    Docs:      icon('<path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5M9 13h8M9 17h5"/>'),
    Key:       icon('<circle cx="8" cy="14" r="4"/><path d="M11 12l9-9 2 2-3 3 2 2-2 2-2-2-3 3"/>'),
    Settings:  icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),

    // Action icons
    Search:    icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    Bell:      icon('<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 004 0"/>'),
    Plus:      icon('<path d="M12 5v14M5 12h14"/>'),
    Filter:    icon('<path d="M3 5h18l-7 9v5l-4 2v-7L3 5z"/>'),
    Chevron:       icon('<path d="M9 6l6 6-6 6"/>'),
    ChevronDown:   icon('<path d="M6 9l6 6 6-6"/>'),
    ChevronLeft:   icon('<path d="M15 6l-6 6 6 6"/>'),
    ArrowUp:    icon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    ArrowDown:  icon('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    ArrowRight: icon('<path d="M5 12h14M13 5l7 7-7 7"/>'),
    Check:      icon('<path d="M5 12l5 5L20 7"/>'),
    X:          icon('<path d="M6 6l12 12M18 6L6 18"/>'),
    Dot:        icon('<circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    More:       icon('<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>'),
    Upload:     icon('<path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12"/>'),
    Download:   icon('<path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 16V4"/>'),
    Sparkle:    icon('<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>'),
    Zap:        icon('<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>'),
    Phone:      icon('<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L7.9 9.8a16 16 0 006 6l1.4-1.3a2 2 0 012.1-.4 13 13 0 002.6.6 2 2 0 011.7 2z"/>'),
    Globe:      icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/>'),
    Play:       icon('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>'),
    Pause:      icon('<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'),
    Edit:       icon('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    Trash:      icon('<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/>'),
    Eye:        icon('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>'),
    Link:       icon('<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>'),
    Copy:       icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
    Send:       icon('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>'),
    Attach:     icon('<path d="M21 10l-9.5 9.5a5 5 0 01-7-7L14 3a3.5 3.5 0 015 5L9 18.5a2 2 0 01-3-3L15 7"/>'),
    Chart:      icon('<path d="M3 3v18h18"/><path d="M7 15l4-4 4 3 5-7"/>'),
    Users:      icon('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-5 7-5s6 1 7 5"/><circle cx="17" cy="7" r="2.5"/>'),
    Building:   icon('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>'),
    Money:      icon('<path d="M12 2v20M17 6H10a3 3 0 000 6h4a3 3 0 010 6H6"/>'),
    Target:     icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
    Rocket:     icon('<path d="M5 19s-1-4 2-7 7-2 7-2 1 4-2 7-7 2-7 2z"/><path d="M14 10s3-1 5-3 2-5 2-5-3 0-5 2-3 5-3 5"/><path d="M9 15l-3 3M7 13l-4 4"/>'),
    Hash:       icon('<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>'),
    Folder:     icon('<path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>'),
    Lock:       icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
    Logout:     icon('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'),
    External:   icon('<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>'),
    Megaphone:  icon('<path d="M3 11v2a1 1 0 001 1h2l10 5V5L6 10H4a1 1 0 00-1 1z"/><path d="M18 8a5 5 0 010 8"/>'),
    Clock:      icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    Star:       icon('<path d="M12 2l3 7 7 .5-5.5 5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9l3-7z"/>'),
    Info:       icon('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'),
    Warning:    icon('<path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    Menu:       icon('<path d="M3 12h18M3 6h18M3 18h18"/>'),
    Image:      icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),

    // Social (brand colors preserved on raw SVG)
    Fb:         function (o) { const s = (o && o.size) || 16; return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.6c0-.9.2-1.5 1.5-1.5h1.6V4.5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.2H8v3h2.5V21h3z"/></svg>`; },
    Google:     function (o) { const s = (o && o.size) || 16; return `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3v2.6A10 10 0 0012 22z"/><path fill="#FBBC04" d="M6.4 13.9A6 6 0 016 12c0-.7.1-1.3.4-1.9V7.5H3a10 10 0 000 9l3.4-2.6z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003 7.5l3.4 2.6C7.2 7.7 9.4 6 12 6z"/></svg>`; },
    Instagram:  icon('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/>'),
  };

  w.I = I;
})(window);
