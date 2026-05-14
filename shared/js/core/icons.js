/**
 * ADLIFY ICONS v1
 *
 * Centrálna API pre stroke ikony — postavená na Lucide CDN
 * (https://unpkg.com/lucide@latest/dist/umd/lucide.js) plus pár
 * Adlify-specific custom SVG (logo, brand glyph).
 *
 * Použitie:
 *   const html = Icons.svg('dashboard', { size: 18 });
 *   container.innerHTML = `<div>${html} Dashboard</div>`;
 *
 *   // alebo cez data-atribút (auto-render po Icons.refresh()):
 *   container.innerHTML = '<i data-icon="dashboard" data-size="18"></i>';
 *   Icons.refresh(container);
 *
 * Sémantické aliasy (semantic name → Lucide name):
 *   dashboard, leads, clients, projects, campaigns, marketing, mail,
 *   tasks, tickets, invoice, onboarding, services, reports, calendar,
 *   templates, documents, keywords, settings, integrations, team,
 *   search, bell, plus, chevron, more, edit, trash, eye, link, copy,
 *   send, attach, chart, building, money, target, rocket, hash, folder,
 *   lock, logout, external, megaphone, clock, star, info, warning,
 *   check, x, dot, sparkle, zap, phone, globe, play, pause, upload,
 *   download, arrow-up, arrow-down, arrow-right.
 */

(function () {
  'use strict';

  /* Sémantické aliasy → Lucide ikony. Keď chceš pridať novú,
     najprv over že existuje v https://lucide.dev/icons */
  const ALIASES = {
    dashboard:     'layout-dashboard',
    leads:         'target',
    clients:       'users',
    projects:      'kanban',
    campaigns:     'megaphone',
    campaign:      'megaphone',
    marketing:     'megaphone',
    mail:          'mail',
    messages:      'mail',
    tasks:         'list-checks',
    tickets:       'ticket',
    ticket:        'ticket',
    invoice:       'file-text',
    billing:       'receipt',
    onboarding:    'rocket',
    services:      'package',
    reports:       'bar-chart-3',
    report:        'bar-chart-3',
    calendar:      'calendar',
    templates:     'layout-template',
    template:      'layout-template',
    documents:     'folder',
    docs:          'folder',
    keywords:      'hash',
    automations:   'zap',
    settings:      'settings',
    integrations:  'plug',
    team:          'users-2',

    /* generic */
    search:        'search',
    bell:          'bell',
    plus:          'plus',
    chevron:       'chevron-right',
    'chevron-right':'chevron-right',
    'chevron-down':'chevron-down',
    'chevron-up':  'chevron-up',
    'chevron-left':'chevron-left',
    more:          'more-horizontal',
    edit:          'pencil',
    pencil:        'pencil',
    trash:         'trash-2',
    eye:           'eye',
    link:          'link',
    copy:          'copy',
    send:          'send',
    attach:        'paperclip',
    chart:         'line-chart',
    building:      'building-2',
    money:         'banknote',
    target:        'target',
    rocket:        'rocket',
    hash:          'hash',
    folder:        'folder',
    lock:          'lock',
    logout:        'log-out',
    external:      'external-link',
    megaphone:     'megaphone',
    clock:         'clock',
    star:          'star',
    info:          'info',
    warning:       'alert-triangle',
    check:         'check',
    x:             'x',
    dot:           'circle-dot',
    sparkle:       'sparkles',
    zap:           'zap',
    phone:         'phone',
    globe:         'globe',
    play:          'play',
    pause:         'pause',
    upload:        'upload',
    download:      'download',
    'arrow-up':    'arrow-up',
    'arrow-down':  'arrow-down',
    'arrow-right': 'arrow-right',
    'arrow-left':  'arrow-left',
    user:          'user',
    users:         'users',
    facebook:      'facebook',
    instagram:     'instagram',
    google:        'chrome',
    eye_off:       'eye-off'
  };

  /* Custom (non-Lucide) SVG ikony — Adlify branding glyf, atď. */
  const CUSTOM = {
    logo: ({ size = 28 } = {}) => (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 32 32" fill="none">' +
      '<defs><linearGradient id="adl-logo-g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FB923C"/><stop offset="1" stop-color="#EA580C"/>' +
      '</linearGradient></defs>' +
      '<rect x="1" y="1" width="30" height="30" rx="8" fill="url(#adl-logo-g)"/>' +
      '<path d="M8 23 L14 8.5 L18 8.5 L24 23 M11 18 L21 18" stroke="#fff" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<circle cx="24" cy="8" r="2.4" fill="#fff"/></svg>'
    )
  };

  function resolveLucideName(name) {
    if (!name) return null;
    const lower = String(name).toLowerCase().trim();
    return ALIASES[lower] || lower;
  }

  /**
   * Get SVG markup for an icon name.
   * @param {string} name       Sémantický alebo Lucide názov.
   * @param {object} [opts]
   * @param {number} [opts.size=18]
   * @param {number} [opts.stroke=1.6]
   * @param {string} [opts.color='currentColor']
   * @param {string} [opts.className]
   * @returns {string} SVG markup (alebo placeholder ak ikona neexistuje).
   */
  function svg(name, opts = {}) {
    const size = opts.size || 18;
    const stroke = opts.stroke || 1.6;
    const color = opts.color || 'currentColor';
    const cls = opts.className ? ' class="' + escapeAttr(opts.className) + '"' : '';

    /* 1. Custom ikona? */
    const lower = String(name || '').toLowerCase().trim();
    if (CUSTOM[lower]) return CUSTOM[lower](opts);

    /* 2. Lucide */
    const lucideName = resolveLucideName(lower);
    const lucide = window.lucide;
    if (!lucide || !lucide.icons) {
      return placeholderSvg(size, cls);
    }
    const pascal = toPascalCase(lucideName);
    const iconDef = lucide.icons[pascal] || lucide.icons[lucideName];
    if (!iconDef) {
      console.warn('[Icons] Unknown icon:', name, '→', lucideName);
      return placeholderSvg(size, cls);
    }

    /* Lucide icons sú definované ako array of [tag, attrs, children?].
       UMD build exponuje aj toSvg() na niektorých verziách,
       ale spoľahnem sa na priamy render z definície (zachová sa
       konzistencia naprieč verziami knižnice). */
    const children = renderLucideChildren(iconDef);
    return (
      '<svg' + cls +
      ' xmlns="http://www.w3.org/2000/svg"' +
      ' width="' + size + '"' +
      ' height="' + size + '"' +
      ' viewBox="0 0 24 24"' +
      ' fill="none"' +
      ' stroke="' + escapeAttr(color) + '"' +
      ' stroke-width="' + stroke + '"' +
      ' stroke-linecap="round"' +
      ' stroke-linejoin="round">' +
      children +
      '</svg>'
    );
  }

  function renderLucideChildren(iconDef) {
    /* Lucide UMD: icons[name] je buď
         - array: [['path', {d: '...'}], ['circle', {cx, cy, r}], ...]
         - object: { name, ..., src: <array> } v novších verziách */
    const arr = Array.isArray(iconDef) ? iconDef
              : (iconDef && Array.isArray(iconDef.src)) ? iconDef.src
              : null;
    if (!arr) return '';
    return arr.map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs || {})
        .map(([k, v]) => k + '="' + escapeAttr(String(v)) + '"')
        .join(' ');
      return '<' + tag + ' ' + attrStr + '/>';
    }).join('');
  }

  function placeholderSvg(size, cls) {
    return (
      '<svg' + cls + ' width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="2 3"/>' +
      '</svg>'
    );
  }

  function toPascalCase(s) {
    return String(s).replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /**
   * Refresh všetkých <i data-icon="..."> elementov v rámci scope.
   * @param {Element|Document} [scope=document]
   */
  function refresh(scope) {
    const root = scope || document;
    const nodes = root.querySelectorAll('[data-icon]');
    nodes.forEach((el) => {
      const name = el.getAttribute('data-icon');
      const size = parseInt(el.getAttribute('data-size'), 10) || 18;
      const stroke = parseFloat(el.getAttribute('data-stroke')) || 1.6;
      const color = el.getAttribute('data-color') || 'currentColor';
      const cls = el.getAttribute('data-class') || '';
      el.innerHTML = svg(name, { size, stroke, color, className: cls });
      el.setAttribute('data-icon-rendered', '1');
    });
  }

  /**
   * Create an SVGElement directly (handy keď nepoužívaš innerHTML).
   */
  function create(name, opts) {
    const tmp = document.createElement('div');
    tmp.innerHTML = svg(name, opts);
    return tmp.firstElementChild;
  }

  /* Auto-refresh po načítaní DOM-u */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => refresh());
    } else {
      refresh();
    }
  }

  window.Icons = { svg, refresh, create, init, ALIASES, CUSTOM };

  /* Spusti automaticky po načítaní stránky */
  init();
})();
