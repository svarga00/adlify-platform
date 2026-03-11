/**
 * ADLIFY - Daily Workflow Widget v1.0
 * Floating mini-app pre denný workflow
 * 
 * INŠTALÁCIA:
 * 1. Ulož ako: admin/js/workflow-widget.js
 * 2. V admin/index.html pridaj pred </body>:
 *    <script src="js/workflow-widget.js"></script>
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'adlify_workflow_widget';
  const DAILY_RESET_KEY = 'adlify_daily_reset';

  // ============================================
  // DEFAULT DATA
  // ============================================

  const DEFAULT_DAILY_CHECKLIST = [
    { id: 'd1', text: '📧 Skontrolovať emaily a odpovede na ponuky', done: false },
    { id: 'd2', text: '📊 Skontrolovať výkon kampaní (Google Ads, Meta)', done: false },
    { id: 'd3', text: '🔍 Nájsť 10 nových leadov v Marketing Miner', done: false },
    { id: 'd4', text: '🤖 Spustiť AI analýzu na nové leady', done: false },
    { id: 'd5', text: '📤 Odoslať 5+ personalizovaných ponúk', done: false },
    { id: 'd6', text: '📞 Follow-up hovory / emaily (3-5 dní staré)', done: false },
    { id: 'd7', text: '📝 Aktualizovať status leadov v CRM', done: false },
    { id: 'd8', text: '📈 Zapísať denný report (koľko leadov, ponúk, odpovedí)', done: false }
  ];

  const WORKFLOW_STEPS = [
    { id: 'w1', icon: '⛏️', label: 'MM Research', desc: 'Hľadanie domén v Marketing Miner' },
    { id: 'w2', icon: '📥', label: 'Import', desc: 'Import Excel do Leadov' },
    { id: 'w3', icon: '🤖', label: 'AI Analýza', desc: 'Spustenie analýzy na importované leady' },
    { id: 'w4', icon: '✏️', label: 'Úprava', desc: 'Kontrola a úprava analýzy' },
    { id: 'w5', icon: '📤', label: 'Odoslanie', desc: 'Odoslanie ponuky emailom' },
    { id: 'w6', icon: '📞', label: 'Follow-up', desc: 'Telefonát / email po 3-5 dňoch' },
    { id: 'w7', icon: '🎯', label: 'Konverzia', desc: 'Konvertovať na klienta' }
  ];

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return getDefaultState();
  }

  function getDefaultState() {
    return {
      position: { x: window.innerWidth - 380, y: 80 },
      collapsed: false,
      minimized: false,
      activeTab: 'checklist',
      width: 360,
      dailyChecklist: JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST)),
      tasks: [],
      quickNotes: '',
      stats: { leadsToday: 0, proposalsToday: 0, responsesToday: 0 },
      pomodoroRunning: false,
      pomodoroTime: 25 * 60,
      lastResetDate: new Date().toDateString()
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function checkDailyReset() {
    const today = new Date().toDateString();
    if (state.lastResetDate !== today) {
      // Reset daily checklist
      state.dailyChecklist = JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST));
      state.stats = { leadsToday: 0, proposalsToday: 0, responsesToday: 0 };
      state.lastResetDate = today;
      saveState();
    }
  }

  let state = loadState();
  checkDailyReset();

  // ============================================
  // INJECT STYLES
  // ============================================

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Widget Container */
    #wf-widget {
      position: fixed;
      z-index: 9999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      color: #1e293b;
      user-select: none;
      transition: box-shadow 0.3s, opacity 0.2s;
    }
    #wf-widget.dragging {
      opacity: 0.85;
      box-shadow: 0 25px 60px rgba(0,0,0,0.25) !important;
    }

    /* Widget Body */
    .wf-body {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.06);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 520px;
      backdrop-filter: blur(20px);
    }
    #wf-widget.minimized .wf-body {
      display: none;
    }

    /* Header */
    .wf-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      cursor: grab;
      flex-shrink: 0;
    }
    .wf-header:active { cursor: grabbing; }
    .wf-header-title {
      flex: 1;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: -0.2px;
    }
    .wf-header-time {
      font-size: 11px;
      opacity: 0.85;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .wf-header-btn {
      width: 26px;
      height: 26px;
      border: none;
      background: rgba(255,255,255,0.2);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .wf-header-btn:hover { background: rgba(255,255,255,0.35); }

    /* Minimized Bubble */
    .wf-bubble {
      display: none;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: white;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 20px rgba(249,115,22,0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      border: 3px solid white;
    }
    .wf-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(249,115,22,0.5);
    }
    #wf-widget.minimized .wf-bubble { display: flex; }
    .wf-bubble-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 20px;
      height: 20px;
      background: #ef4444;
      color: white;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    /* Tabs */
    .wf-tabs {
      display: flex;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-shrink: 0;
    }
    .wf-tab {
      flex: 1;
      padding: 8px 4px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      transition: all 0.15s;
      border-bottom: 2px solid transparent;
    }
    .wf-tab:hover { color: #f97316; background: #fff7ed; }
    .wf-tab.active {
      color: #f97316;
      border-bottom-color: #f97316;
      background: white;
      font-weight: 600;
    }
    .wf-tab-icon { font-size: 16px; }

    /* Content */
    .wf-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      min-height: 200px;
    }
    .wf-content::-webkit-scrollbar { width: 4px; }
    .wf-content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

    /* Checklist */
    .wf-check-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 4px;
      transition: background 0.15s;
      cursor: pointer;
    }
    .wf-check-item:hover { background: #f8fafc; }
    .wf-check-item.done { opacity: 0.5; }
    .wf-check-item.done .wf-check-text { text-decoration: line-through; }
    .wf-check-box {
      width: 18px;
      height: 18px;
      border: 2px solid #cbd5e1;
      border-radius: 5px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
      transition: all 0.2s;
      font-size: 11px;
      color: transparent;
    }
    .wf-check-item.done .wf-check-box {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
    }
    .wf-check-text {
      font-size: 12.5px;
      line-height: 1.4;
      flex: 1;
      color: #334155;
    }
    .wf-progress-bar {
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .wf-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #16a34a);
      border-radius: 3px;
      transition: width 0.4s ease;
    }
    .wf-progress-label {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }

    /* Tasks */
    .wf-task-input-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .wf-task-input {
      flex: 1;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .wf-task-input:focus { border-color: #f97316; }
    .wf-task-add-btn {
      padding: 8px 12px;
      background: #f97316;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .wf-task-add-btn:hover { background: #ea580c; }
    .wf-task-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 4px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .wf-task-item.done { opacity: 0.5; }
    .wf-task-item.done .wf-task-text { text-decoration: line-through; }
    .wf-task-text { flex: 1; font-size: 12px; }
    .wf-task-priority {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wf-task-priority.high { background: #ef4444; }
    .wf-task-priority.medium { background: #f59e0b; }
    .wf-task-priority.low { background: #22c55e; }
    .wf-task-delete {
      width: 22px;
      height: 22px;
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }
    .wf-task-delete:hover { background: #fee2e2; color: #ef4444; }

    /* Workflow */
    .wf-flow-step {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      transition: all 0.2s;
      cursor: pointer;
    }
    .wf-flow-step:hover { border-color: #f97316; background: #fff7ed; }
    .wf-flow-step.active {
      border-color: #f97316;
      background: linear-gradient(135deg, #fff7ed, #fef2f2);
      box-shadow: 0 2px 8px rgba(249,115,22,0.1);
    }
    .wf-flow-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      border: 1px solid #e2e8f0;
    }
    .wf-flow-step.active .wf-flow-icon {
      background: #f97316;
      border-color: #f97316;
      box-shadow: 0 2px 8px rgba(249,115,22,0.3);
    }
    .wf-flow-label { font-weight: 600; font-size: 12px; }
    .wf-flow-desc { font-size: 11px; color: #64748b; }
    .wf-flow-arrow {
      text-align: center;
      color: #cbd5e1;
      font-size: 10px;
      margin: 2px 0;
    }

    /* Notes */
    .wf-notes-area {
      width: 100%;
      height: 180px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.6;
      color: #334155;
    }
    .wf-notes-area:focus { border-color: #f97316; }
    .wf-notes-area::placeholder { color: #94a3b8; }

    /* Stats */
    .wf-stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .wf-stat-box {
      text-align: center;
      padding: 10px 6px;
      background: #f8fafc;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    .wf-stat-value {
      font-size: 20px;
      font-weight: 800;
      color: #f97316;
      font-variant-numeric: tabular-nums;
    }
    .wf-stat-label {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }
    .wf-stat-btn {
      width: 100%;
      padding: 3px;
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      border-radius: 4px;
      margin-top: 4px;
    }
    .wf-stat-btn:hover { background: #f1f5f9; color: #f97316; }

    /* Pomodoro */
    .wf-pomo {
      text-align: center;
      padding: 12px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }
    .wf-pomo-time {
      font-size: 36px;
      font-weight: 800;
      color: #1e293b;
      font-variant-numeric: tabular-nums;
      letter-spacing: -1px;
      margin: 8px 0;
    }
    .wf-pomo-label { font-size: 11px; color: #64748b; margin-bottom: 10px; }
    .wf-pomo-btns { display: flex; gap: 6px; justify-content: center; }
    .wf-pomo-btn {
      padding: 6px 16px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .wf-pomo-btn.start { background: #22c55e; color: white; }
    .wf-pomo-btn.start:hover { background: #16a34a; }
    .wf-pomo-btn.pause { background: #f59e0b; color: white; }
    .wf-pomo-btn.reset { background: #e2e8f0; color: #64748b; }
    .wf-pomo-btn.reset:hover { background: #cbd5e1; }

    /* Footer */
    .wf-footer {
      padding: 8px 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      flex-shrink: 0;
    }
    .wf-footer-btn {
      padding: 4px 10px;
      border: none;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font-size: 11px;
      border-radius: 6px;
    }
    .wf-footer-btn:hover { background: #e2e8f0; color: #1e293b; }

    /* Resize handle */
    .wf-resize {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      opacity: 0.3;
    }
    .wf-resize:hover { opacity: 0.7; }

    /* Section headers */
    .wf-section-head {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 12px 0 8px;
    }
    .wf-section-head:first-child { margin-top: 0; }

    /* Animations */
    @keyframes wfSlideIn {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .wf-body { animation: wfSlideIn 0.25s ease; }
  `;
  document.head.appendChild(styleEl);

  // ============================================
  // CREATE WIDGET
  // ============================================

  const widget = document.createElement('div');
  widget.id = 'wf-widget';
  widget.style.left = state.position.x + 'px';
  widget.style.top = state.position.y + 'px';
  widget.style.width = state.width + 'px';
  if (state.minimized) widget.classList.add('minimized');

  // ============================================
  // RENDER
  // ============================================

  function render() {
    const doneCount = state.dailyChecklist.filter(i => i.done).length;
    const totalCount = state.dailyChecklist.length;
    const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const pendingTasks = state.tasks.filter(t => !t.done).length;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });

    widget.innerHTML = `
      <!-- Minimized bubble -->
      <div class="wf-bubble" onclick="WfWidget.toggle()" style="position:relative;">
        🚀
        ${pendingTasks > 0 ? `<span class="wf-bubble-badge">${pendingTasks}</span>` : ''}
      </div>

      <!-- Full widget -->
      <div class="wf-body" style="width:${state.width}px;">
        <!-- Header -->
        <div class="wf-header" onmousedown="WfWidget.startDrag(event)">
          <span style="font-size:16px;">🚀</span>
          <span class="wf-header-title">Denný Workflow</span>
          <span class="wf-header-time">${timeStr}</span>
          <button class="wf-header-btn" onclick="WfWidget.toggle()" title="Minimalizovať">−</button>
          <button class="wf-header-btn" onclick="WfWidget.close()" title="Skryť (Alt+W)">✕</button>
        </div>

        <!-- Tabs -->
        <div class="wf-tabs">
          <button class="wf-tab ${state.activeTab === 'checklist' ? 'active' : ''}" onclick="WfWidget.setTab('checklist')">
            <span class="wf-tab-icon">☑️</span>
            Checklist
          </button>
          <button class="wf-tab ${state.activeTab === 'tasks' ? 'active' : ''}" onclick="WfWidget.setTab('tasks')">
            <span class="wf-tab-icon">📋</span>
            Úlohy ${pendingTasks > 0 ? `<span style="background:#ef4444;color:white;border-radius:8px;padding:0 5px;font-size:10px;">${pendingTasks}</span>` : ''}
          </button>
          <button class="wf-tab ${state.activeTab === 'workflow' ? 'active' : ''}" onclick="WfWidget.setTab('workflow')">
            <span class="wf-tab-icon">🔄</span>
            Flow
          </button>
          <button class="wf-tab ${state.activeTab === 'notes' ? 'active' : ''}" onclick="WfWidget.setTab('notes')">
            <span class="wf-tab-icon">📝</span>
            Notes
          </button>
        </div>

        <!-- Content -->
        <div class="wf-content">
          ${renderTab()}
        </div>

        <!-- Footer -->
        <div class="wf-footer">
          <span style="font-size:11px;color:#94a3b8;">
            ${progress}% hotové dnes
          </span>
          <button class="wf-footer-btn" onclick="WfWidget.resetDaily()">🔄 Reset dňa</button>
        </div>
      </div>
    `;
  }

  function renderTab() {
    switch (state.activeTab) {
      case 'checklist': return renderChecklist();
      case 'tasks': return renderTasks();
      case 'workflow': return renderWorkflow();
      case 'notes': return renderNotes();
      default: return renderChecklist();
    }
  }

  function renderChecklist() {
    const doneCount = state.dailyChecklist.filter(i => i.done).length;
    const total = state.dailyChecklist.length;
    const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    return `
      <!-- Stats -->
      <div class="wf-stats-row">
        <div class="wf-stat-box">
          <div class="wf-stat-value">${state.stats.leadsToday}</div>
          <div class="wf-stat-label">Leady</div>
          <button class="wf-stat-btn" onclick="WfWidget.incStat('leadsToday')">+</button>
        </div>
        <div class="wf-stat-box">
          <div class="wf-stat-value">${state.stats.proposalsToday}</div>
          <div class="wf-stat-label">Ponuky</div>
          <button class="wf-stat-btn" onclick="WfWidget.incStat('proposalsToday')">+</button>
        </div>
        <div class="wf-stat-box">
          <div class="wf-stat-value">${state.stats.responsesToday}</div>
          <div class="wf-stat-label">Odpovede</div>
          <button class="wf-stat-btn" onclick="WfWidget.incStat('responsesToday')">+</button>
        </div>
      </div>

      <!-- Progress -->
      <div class="wf-progress-label">
        <span>Denný checklist</span>
        <span>${doneCount}/${total}</span>
      </div>
      <div class="wf-progress-bar">
        <div class="wf-progress-fill" style="width:${progress}%"></div>
      </div>

      <!-- Checklist items -->
      ${state.dailyChecklist.map((item, i) => `
        <div class="wf-check-item ${item.done ? 'done' : ''}" onclick="WfWidget.toggleCheck(${i})">
          <div class="wf-check-box">${item.done ? '✓' : ''}</div>
          <span class="wf-check-text">${item.text}</span>
        </div>
      `).join('')}

      <!-- Pomodoro -->
      <div class="wf-section-head" style="margin-top:16px;">⏱️ Focus Timer</div>
      <div class="wf-pomo">
        <div class="wf-pomo-label">${state.pomodoroRunning ? 'Pracujem...' : 'Pripravený'}</div>
        <div class="wf-pomo-time">${formatTime(state.pomodoroTime)}</div>
        <div class="wf-pomo-btns">
          ${state.pomodoroRunning 
            ? `<button class="wf-pomo-btn pause" onclick="WfWidget.pomoPause()">⏸ Pauza</button>`
            : `<button class="wf-pomo-btn start" onclick="WfWidget.pomoStart()">▶ Štart</button>`
          }
          <button class="wf-pomo-btn reset" onclick="WfWidget.pomoReset()">↺ Reset</button>
        </div>
      </div>
    `;
  }

  function renderTasks() {
    const pending = state.tasks.filter(t => !t.done);
    const done = state.tasks.filter(t => t.done);

    return `
      <div class="wf-task-input-row">
        <input type="text" class="wf-task-input" id="wf-task-input" 
               placeholder="Nová úloha..." 
               onkeydown="if(event.key==='Enter')WfWidget.addTask()">
        <button class="wf-task-add-btn" onclick="WfWidget.addTask()">+ Pridať</button>
      </div>

      <!-- Priority filter -->
      <div style="display:flex;gap:4px;margin-bottom:10px;">
        <button class="wf-footer-btn" onclick="WfWidget.addTaskWithPriority('high')" style="font-size:10px;">🔴 Urgentné</button>
        <button class="wf-footer-btn" onclick="WfWidget.addTaskWithPriority('medium')" style="font-size:10px;">🟡 Stredné</button>
        <button class="wf-footer-btn" onclick="WfWidget.addTaskWithPriority('low')" style="font-size:10px;">🟢 Nízke</button>
      </div>

      ${pending.length === 0 && done.length === 0 ? `
        <div style="text-align:center;padding:30px 0;color:#94a3b8;">
          <div style="font-size:28px;margin-bottom:8px;">✅</div>
          <div style="font-size:12px;">Žiadne úlohy. Pridaj novú!</div>
        </div>
      ` : ''}

      ${pending.length > 0 ? `
        <div class="wf-section-head">Aktívne (${pending.length})</div>
        ${pending.map(t => renderTaskItem(t)).join('')}
      ` : ''}

      ${done.length > 0 ? `
        <div class="wf-section-head" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Hotové (${done.length})</span>
          <button class="wf-footer-btn" onclick="WfWidget.clearDoneTasks()" style="font-size:10px;">Vymazať</button>
        </div>
        ${done.map(t => renderTaskItem(t)).join('')}
      ` : ''}
    `;
  }

  function renderTaskItem(t) {
    return `
      <div class="wf-task-item ${t.done ? 'done' : ''}">
        <div class="wf-check-box" style="cursor:pointer;${t.done ? 'background:#22c55e;border-color:#22c55e;color:white;' : ''}" 
             onclick="WfWidget.toggleTask('${t.id}')">${t.done ? '✓' : ''}</div>
        <div class="wf-task-priority ${t.priority || 'medium'}"></div>
        <span class="wf-task-text">${t.text}</span>
        <button class="wf-task-delete" onclick="WfWidget.deleteTask('${t.id}')">✕</button>
      </div>
    `;
  }

  function renderWorkflow() {
    return `
      <div class="wf-section-head">Lead → Klient Pipeline</div>
      ${WORKFLOW_STEPS.map((step, i) => `
        ${i > 0 ? '<div class="wf-flow-arrow">↓</div>' : ''}
        <div class="wf-flow-step ${state.activeWorkflowStep === step.id ? 'active' : ''}" 
             onclick="WfWidget.setWorkflowStep('${step.id}')">
          <div class="wf-flow-icon">${step.icon}</div>
          <div>
            <div class="wf-flow-label">${step.label}</div>
            <div class="wf-flow-desc">${step.desc}</div>
          </div>
        </div>
      `).join('')}

      <div class="wf-section-head" style="margin-top:16px;">⚡ Rýchle akcie</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button class="wf-footer-btn" onclick="WfWidget.quickAction('leads')" style="background:#dbeafe;color:#1d4ed8;">📥 Import leadov</button>
        <button class="wf-footer-btn" onclick="WfWidget.quickAction('analyze')" style="background:#f3e8ff;color:#7c3aed;">🤖 AI Analýza</button>
        <button class="wf-footer-btn" onclick="WfWidget.quickAction('email')" style="background:#dcfce7;color:#166534;">📧 Hromadné ponuky</button>
        <button class="wf-footer-btn" onclick="WfWidget.quickAction('mm')" style="background:#fff7ed;color:#9a3412;">⛏️ Marketing Miner</button>
      </div>
    `;
  }

  function renderNotes() {
    return `
      <div class="wf-section-head">Rýchle poznámky</div>
      <textarea class="wf-notes-area" 
                placeholder="Poznámky, nápady, linky...&#10;&#10;Ukladá sa automaticky."
                oninput="WfWidget.saveNotes(this.value)">${state.quickNotes || ''}</textarea>

      <div class="wf-section-head" style="margin-top:14px;">📌 Dôležité kontakty</div>
      <div style="font-size:12px;color:#475569;line-height:1.8;">
        <div>📧 <strong>info@adlify.eu</strong></div>
        <div>📞 <strong>+421 944 184 045</strong></div>
        <div>🌐 <strong>www.adlify.eu</strong></div>
      </div>

      <div class="wf-section-head" style="margin-top:14px;">🔗 Rýchle linky</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <a href="https://ads.google.com" target="_blank" class="wf-footer-btn" style="text-decoration:none;background:#e2e8f0;">Google Ads ↗</a>
        <a href="https://business.facebook.com" target="_blank" class="wf-footer-btn" style="text-decoration:none;background:#e2e8f0;">Meta Ads ↗</a>
        <a href="https://marketingminer.com" target="_blank" class="wf-footer-btn" style="text-decoration:none;background:#e2e8f0;">Marketing Miner ↗</a>
        <a href="https://app.supabase.com" target="_blank" class="wf-footer-btn" style="text-decoration:none;background:#e2e8f0;">Supabase ↗</a>
      </div>
    `;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ============================================
  // DRAG & DROP
  // ============================================

  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function startDrag(e) {
    if (e.target.closest('.wf-header-btn')) return;
    isDragging = true;
    dragOffset.x = e.clientX - widget.offsetLeft;
    dragOffset.y = e.clientY - widget.offsetTop;
    widget.classList.add('dragging');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;
    // Keep within viewport
    x = Math.max(0, Math.min(x, window.innerWidth - 60));
    y = Math.max(0, Math.min(y, window.innerHeight - 60));
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
    state.position = { x, y };
  }

  function stopDrag() {
    isDragging = false;
    widget.classList.remove('dragging');
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    saveState();
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.WfWidget = {
    startDrag,

    toggle() {
      state.minimized = !state.minimized;
      widget.classList.toggle('minimized', state.minimized);
      saveState();
      render();
    },

    close() {
      widget.style.display = 'none';
    },

    show() {
      widget.style.display = 'block';
      state.minimized = false;
      widget.classList.remove('minimized');
      render();
    },

    setTab(tab) {
      state.activeTab = tab;
      saveState();
      render();
    },

    // Checklist
    toggleCheck(index) {
      state.dailyChecklist[index].done = !state.dailyChecklist[index].done;
      saveState();
      render();
    },

    // Stats
    incStat(key) {
      state.stats[key] = (state.stats[key] || 0) + 1;
      saveState();
      render();
    },

    // Tasks
    addTask() {
      const input = document.getElementById('wf-task-input');
      if (!input || !input.value.trim()) return;
      state.tasks.unshift({
        id: 't_' + Date.now(),
        text: input.value.trim(),
        done: false,
        priority: 'medium',
        created: new Date().toISOString()
      });
      saveState();
      render();
      // Re-focus input
      setTimeout(() => {
        const newInput = document.getElementById('wf-task-input');
        if (newInput) newInput.focus();
      }, 50);
    },

    addTaskWithPriority(priority) {
      const input = document.getElementById('wf-task-input');
      if (!input || !input.value.trim()) {
        input?.focus();
        return;
      }
      state.tasks.unshift({
        id: 't_' + Date.now(),
        text: input.value.trim(),
        done: false,
        priority,
        created: new Date().toISOString()
      });
      saveState();
      render();
    },

    toggleTask(id) {
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.done = !task.done;
        saveState();
        render();
      }
    },

    deleteTask(id) {
      state.tasks = state.tasks.filter(t => t.id !== id);
      saveState();
      render();
    },

    clearDoneTasks() {
      state.tasks = state.tasks.filter(t => !t.done);
      saveState();
      render();
    },

    // Workflow
    setWorkflowStep(stepId) {
      state.activeWorkflowStep = state.activeWorkflowStep === stepId ? null : stepId;
      saveState();
      render();
    },

    quickAction(action) {
      switch (action) {
        case 'leads':
          if (window.Router) Router.navigate('leads');
          setTimeout(() => { if (window.LeadsModule) LeadsModule.showTab('import'); }, 300);
          break;
        case 'analyze':
          if (window.Router) Router.navigate('leads');
          break;
        case 'email':
          if (window.Router) Router.navigate('leads');
          break;
        case 'mm':
          window.open('https://marketingminer.com', '_blank');
          break;
      }
    },

    // Notes
    saveNotes(value) {
      state.quickNotes = value;
      saveState();
    },

    // Pomodoro
    pomoStart() {
      state.pomodoroRunning = true;
      saveState();
      render();
      WfWidget._pomoInterval = setInterval(() => {
        if (state.pomodoroTime <= 0) {
          WfWidget.pomoPause();
          state.pomodoroTime = 0;
          saveState();
          render();
          // Notification
          if (Notification.permission === 'granted') {
            new Notification('⏱️ Pomodoro hotové!', { body: 'Čas na krátku pauzu.' });
          }
          if (window.Utils) Utils.toast('⏱️ Pomodoro hotové! Daj si pauzu.', 'success');
          return;
        }
        state.pomodoroTime--;
        // Update only timer without full re-render
        const timeEl = document.querySelector('.wf-pomo-time');
        if (timeEl) timeEl.textContent = formatTime(state.pomodoroTime);
      }, 1000);
    },

    pomoPause() {
      state.pomodoroRunning = false;
      clearInterval(WfWidget._pomoInterval);
      saveState();
      render();
    },

    pomoReset() {
      state.pomodoroRunning = false;
      state.pomodoroTime = 25 * 60;
      clearInterval(WfWidget._pomoInterval);
      saveState();
      render();
    },

    // Daily reset
    resetDaily() {
      if (!confirm('Resetovať denný checklist a štatistiky?')) return;
      state.dailyChecklist = JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST));
      state.stats = { leadsToday: 0, proposalsToday: 0, responsesToday: 0 };
      state.lastResetDate = new Date().toDateString();
      saveState();
      render();
    }
  };

  // ============================================
  // KEYBOARD SHORTCUT
  // ============================================

  document.addEventListener('keydown', (e) => {
    // Alt+W to toggle widget
    if (e.altKey && e.key === 'w') {
      e.preventDefault();
      if (widget.style.display === 'none') {
        WfWidget.show();
      } else {
        WfWidget.toggle();
      }
    }
  });

  // ============================================
  // CLOCK UPDATE
  // ============================================

  setInterval(() => {
    const timeEl = widget.querySelector('.wf-header-time');
    if (timeEl) {
      timeEl.textContent = new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    }
  }, 30000);

  // ============================================
  // INIT
  // ============================================

  document.body.appendChild(widget);
  render();

  // Request notification permission for pomodoro
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  console.log('🚀 Workflow Widget v1.0 loaded (Alt+W to toggle)');

})();
