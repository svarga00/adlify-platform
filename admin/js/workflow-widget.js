/**
 * ADLIFY - Daily Workflow Widget v1.1
 * Floating mini-app pre denný workflow
 * 
 * PREPOJENIA:
 * - Database.client → reálne dáta z Supabase (leady, ponuky, klienti)
 * - LeadsModule.leads → ak je načítaný, použije lokálne dáta
 * - Router.navigate → rýchle akcie navigujú do modulov
 * 
 * INŠTALÁCIA:
 * 1. Ulož ako: admin/js/workflow-widget.js
 * 2. V admin/index.html pridaj pred </body>:
 *    <script src="js/workflow-widget.js"></script>
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'adlify_workflow_widget';

  const DEFAULT_DAILY_CHECKLIST = [
    { id: 'd1', text: '📧 Skontrolovať emaily a odpovede na ponuky', done: false },
    { id: 'd2', text: '📊 Skontrolovať výkon kampaní (Google Ads, Meta)', done: false },
    { id: 'd3', text: '🔍 Nájsť 10 nových leadov v Marketing Miner', done: false },
    { id: 'd4', text: '🤖 Spustiť AI analýzu na nové leady', done: false },
    { id: 'd5', text: '📤 Odoslať 5+ personalizovaných ponúk', done: false },
    { id: 'd6', text: '📞 Follow-up hovory / emaily (3-5 dní staré)', done: false },
    { id: 'd7', text: '📝 Aktualizovať status leadov v CRM', done: false },
    { id: 'd8', text: '📈 Zapísať denný report', done: false }
  ];

  const WORKFLOW_STEPS = [
    { id: 'w1', icon: '⛏️', label: 'MM Research', desc: 'Hľadanie domén v Marketing Miner', url: 'https://marketingminer.com' },
    { id: 'w2', icon: '📥', label: 'Import', desc: 'Import Excel do Leadov', route: 'leads', tab: 'import' },
    { id: 'w3', icon: '🤖', label: 'AI Analýza', desc: 'Spustiť analýzu na leady', route: 'leads' },
    { id: 'w4', icon: '✏️', label: 'Úprava', desc: 'Kontrola a úprava analýzy', route: 'leads' },
    { id: 'w5', icon: '📤', label: 'Odoslanie', desc: 'Odoslanie ponuky emailom', route: 'leads' },
    { id: 'w6', icon: '📞', label: 'Follow-up', desc: 'Follow-up po 3-5 dňoch', route: 'leads', filter: 'contacted' },
    { id: 'w7', icon: '🎯', label: 'Konverzia', desc: 'Konvertovať na klienta', route: 'clients' }
  ];

  // === STATE ===
  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s) { if (!s.size) s.size = { w: 360, h: null }; return s; } } catch(e) {}
    return getDefault();
  }
  function getDefault() {
    return { position:{x:window.innerWidth-390,y:80}, minimized:false, activeTab:'checklist', size:{w:360,h:null},
      dailyChecklist:JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST)), tasks:[], quickNotes:'',
      pomodoroRunning:false, pomodoroTime:25*60, lastResetDate:new Date().toDateString(), activeWorkflowStep:null };
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){} }

  let state = loadState();
  // Daily reset
  if (state.lastResetDate !== new Date().toDateString()) {
    state.dailyChecklist = JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST));
    state.lastResetDate = new Date().toDateString();
    save();
  }

  let live = { totalLeads:0, newToday:0, proposalsToday:0, contactedToday:0, totalClients:0 };

  // === FETCH REAL DATA ===
  async function fetchLive() {
    try {
      const db = window.Database?.client;
      if (!db) return;
      const today = new Date(); today.setHours(0,0,0,0);
      const iso = today.toISOString();
      const [a,b,c,d,e] = await Promise.all([
        db.from('leads').select('id',{count:'exact',head:true}),
        db.from('leads').select('id',{count:'exact',head:true}).gte('created_at',iso),
        db.from('leads').select('id',{count:'exact',head:true}).gte('proposal_sent_at',iso),
        db.from('leads').select('id',{count:'exact',head:true}).eq('status','contacted').gte('updated_at',iso),
        db.from('clients').select('id',{count:'exact',head:true})
      ]);
      live.totalLeads = a.count||0;
      live.newToday = b.count||0;
      live.proposalsToday = c.count||0;
      live.contactedToday = d.count||0;
      live.totalClients = e.count||0;
    } catch(e) { console.warn('WfWidget fetch:', e); }
  }

  // === STYLES ===
  const css = document.createElement('style');
  css.textContent = `
#wf-widget{position:fixed;z-index:9999;font-family:'Inter',-apple-system,sans-serif;font-size:13px;color:#1e293b;user-select:none;}
#wf-widget.dragging{opacity:.85}
.wf-body{background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.06);overflow:hidden;display:flex;flex-direction:column;position:relative;animation:wfIn .2s ease}
#wf-widget.minimized .wf-body{display:none}
.wf-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;cursor:grab;flex-shrink:0}
.wf-header:active{cursor:grabbing}
.wf-header-title{flex:1;font-weight:700;font-size:13px}
.wf-header-time{font-size:11px;opacity:.85;font-weight:500;font-variant-numeric:tabular-nums}
.wf-hbtn{width:26px;height:26px;border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.wf-hbtn:hover{background:rgba(255,255,255,.35)}
.wf-bubble{display:none;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;cursor:grab;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(249,115,22,.4);border:3px solid #fff;position:relative;transition:transform .2s}
.wf-bubble:hover{transform:scale(1.1)}
.wf-bubble:active{cursor:grabbing}
#wf-widget.minimized .wf-bubble{display:flex}
.wf-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;background:#ef4444;color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;padding:0 4px}
.wf-tabs{display:flex;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0}
.wf-tab{flex:1;padding:8px 4px;border:none;background:0;cursor:pointer;font-size:11px;color:#64748b;font-weight:500;display:flex;flex-direction:column;align-items:center;gap:2px;border-bottom:2px solid transparent;transition:all .15s}
.wf-tab:hover{color:#f97316;background:#fff7ed}
.wf-tab.active{color:#f97316;border-bottom-color:#f97316;background:#fff;font-weight:600}
.wf-tab-icon{font-size:16px}
.wf-tbadge{background:#ef4444;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;margin-left:2px}
.wf-content{flex:1;overflow-y:auto;padding:12px}
.wf-content::-webkit-scrollbar{width:4px}
.wf-content::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
.wf-ci{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:8px;margin-bottom:3px;cursor:pointer;transition:background .15s}
.wf-ci:hover{background:#f8fafc}
.wf-ci.done{opacity:.4}
.wf-ci.done .wf-ct{text-decoration:line-through}
.wf-cb{width:18px;height:18px;border:2px solid #cbd5e1;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px;font-size:11px;color:transparent;transition:all .2s}
.wf-ci.done .wf-cb{background:#22c55e;border-color:#22c55e;color:#fff}
.wf-ct{font-size:12.5px;line-height:1.4;flex:1;color:#334155}
.wf-pb{height:6px;background:#e2e8f0;border-radius:3px;margin-bottom:12px;overflow:hidden}
.wf-pf{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:3px;transition:width .4s}
.wf-pl{font-size:11px;color:#64748b;margin-bottom:6px;display:flex;justify-content:space-between}
.wf-ls{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}
.wf-lsi{text-align:center;padding:8px 4px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;transition:all .15s}
.wf-lsi:hover{border-color:#f97316;background:#fff7ed}
.wf-lsv{font-size:18px;font-weight:800;color:#f97316;font-variant-numeric:tabular-nums}
.wf-lsl{font-size:9px;color:#64748b;margin-top:2px}
.wf-lss{font-size:9px;color:#22c55e;font-weight:600}
.wf-tir{display:flex;gap:6px;margin-bottom:8px}
.wf-ti{flex:1;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit;outline:none}
.wf-ti:focus{border-color:#f97316}
.wf-tab2{padding:8px 12px;background:#f97316;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.wf-tab2:hover{background:#ea580c}
.wf-tsk{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;margin-bottom:3px;background:#f8fafc;border:1px solid #e2e8f0}
.wf-tsk.done{opacity:.4}
.wf-tsk.done .wf-tt{text-decoration:line-through}
.wf-tt{flex:1;font-size:12px}
.wf-tp{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.wf-tp.high{background:#ef4444}.wf-tp.medium{background:#f59e0b}.wf-tp.low{background:#22c55e}
.wf-td{width:22px;height:22px;border:none;background:0;color:#94a3b8;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:13px}
.wf-td:hover{background:#fee2e2;color:#ef4444}
.wf-pbs{display:flex;gap:4px;margin-bottom:8px}
.wf-pbb{padding:4px 8px;border:none;background:#f1f5f9;border-radius:6px;font-size:10px;cursor:pointer}
.wf-pbb:hover{background:#fff7ed}
.wf-fs{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;margin-bottom:4px;background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;transition:all .2s}
.wf-fs:hover{border-color:#f97316;background:#fff7ed}
.wf-fs.active{border-color:#f97316;background:linear-gradient(135deg,#fff7ed,#fef2f2)}
.wf-fi{width:34px;height:34px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;border:1px solid #e2e8f0}
.wf-fs.active .wf-fi{background:#f97316;border-color:#f97316;box-shadow:0 2px 8px rgba(249,115,22,.3)}
.wf-fl{font-weight:600;font-size:12px}
.wf-fd{font-size:11px;color:#64748b}
.wf-fa{text-align:center;color:#cbd5e1;font-size:10px;margin:1px 0}
.wf-fg{margin-left:auto;padding:4px 10px;background:#f97316;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;opacity:0;transition:opacity .15s}
.wf-fs:hover .wf-fg{opacity:1}
.wf-na{width:100%;min-height:140px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:12px;font-family:inherit;resize:vertical;outline:none;line-height:1.6;color:#334155}
.wf-na:focus{border-color:#f97316}
.wf-pomo{text-align:center;padding:12px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0}
.wf-pt{font-size:34px;font-weight:800;color:#1e293b;font-variant-numeric:tabular-nums;letter-spacing:-1px;margin:6px 0}
.wf-plb{font-size:11px;color:#64748b}
.wf-pbs2{display:flex;gap:6px;justify-content:center;margin-top:8px}
.wf-pmb{padding:6px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}
.wf-pmb.start{background:#22c55e;color:#fff}
.wf-pmb.pause{background:#f59e0b;color:#fff}
.wf-pmb.reset{background:#e2e8f0;color:#64748b}
.wf-footer{padding:8px 12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;flex-shrink:0}
.wf-fbtn{padding:4px 10px;border:none;background:0;color:#64748b;cursor:pointer;font-size:11px;border-radius:6px}
.wf-fbtn:hover{background:#e2e8f0;color:#1e293b}
.wf-rh{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;opacity:.2;transition:opacity .15s;background:linear-gradient(135deg,transparent 50%,#94a3b8 50%);border-radius:0 0 16px 0}
.wf-rh:hover{opacity:.6}
.wf-sh{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 8px}
.wf-sh:first-child{margin-top:0}
.wf-ql{display:flex;flex-wrap:wrap;gap:6px}
.wf-qlb{padding:5px 10px;background:#e2e8f0;border:none;border-radius:6px;font-size:11px;cursor:pointer;text-decoration:none;color:#475569;transition:all .15s}
.wf-qlb:hover{background:#f97316;color:#fff}
@keyframes wfIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
  `;
  document.head.appendChild(css);

  // === WIDGET ELEMENT ===
  const W = document.createElement('div');
  W.id = 'wf-widget';
  W.style.left = state.position.x + 'px';
  W.style.top = state.position.y + 'px';
  if (state.minimized) W.classList.add('minimized');

  function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

  // === RENDER ===
  function render() {
    const dc = state.dailyChecklist.filter(i=>i.done).length;
    const tc = state.dailyChecklist.length;
    const pct = tc>0?Math.round(dc/tc*100):0;
    const pt = state.tasks.filter(t=>!t.done).length;
    const time = new Date().toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'});

    W.innerHTML = `
      <div class="wf-bubble" onmousedown="WfWidget.bubbleDrag(event)" title="Klik = otvoriť | Ťahať = presunúť">🚀${pt>0?`<span class="wf-badge">${pt}</span>`:''}</div>
      <div class="wf-body" style="width:${state.size.w}px;max-height:${state.size.h||540}px;">
        <div class="wf-header" onmousedown="WfWidget.drag(event)">
          <span style="font-size:16px">🚀</span>
          <span class="wf-header-title">Denný Workflow</span>
          <span class="wf-header-time">${time}</span>
          <button class="wf-hbtn" onclick="WfWidget.toggle()" title="Minimalizovať">−</button>
          <button class="wf-hbtn" onclick="WfWidget.hide()" title="Skryť (Alt+W)">✕</button>
        </div>
        <div class="wf-tabs">
          ${['checklist','tasks','workflow','notes'].map(t=>{
            const icons={checklist:'☑️',tasks:'📋',workflow:'🔄',notes:'📝'};
            const labels={checklist:'Checklist',tasks:'Úlohy',workflow:'Flow',notes:'Notes'};
            return `<button class="wf-tab ${state.activeTab===t?'active':''}" onclick="WfWidget.tab('${t}')"><span class="wf-tab-icon">${icons[t]}</span>${labels[t]}${t==='tasks'&&pt>0?`<span class="wf-tbadge">${pt}</span>`:''}</button>`;
          }).join('')}
        </div>
        <div class="wf-content">${renderTab()}</div>
        <div class="wf-footer">
          <span style="font-size:11px;color:#94a3b8">${pct}% hotové dnes</span>
          <button class="wf-fbtn" onclick="WfWidget.resetDay()">🔄 Reset</button>
        </div>
        <div class="wf-rh" onmousedown="WfWidget.resizeStart(event)"></div>
      </div>`;
  }

  function renderTab() {
    if (state.activeTab==='checklist') return renderChecklist();
    if (state.activeTab==='tasks') return renderTasks();
    if (state.activeTab==='workflow') return renderWorkflow();
    if (state.activeTab==='notes') return renderNotes();
    return '';
  }

  function renderChecklist() {
    const dc=state.dailyChecklist.filter(i=>i.done).length, tc=state.dailyChecklist.length, pct=tc>0?Math.round(dc/tc*100):0;
    return `
      <div class="wf-ls">
        <div class="wf-lsi" onclick="WfWidget.go('leads')"><div class="wf-lsv">${live.totalLeads}</div><div class="wf-lsl">Leadov</div>${live.newToday>0?`<div class="wf-lss">+${live.newToday} dnes</div>`:''}</div>
        <div class="wf-lsi" onclick="WfWidget.go('leads')"><div class="wf-lsv">${live.proposalsToday}</div><div class="wf-lsl">Ponúk dnes</div>${live.contactedToday>0?`<div class="wf-lss">${live.contactedToday} kontakt.</div>`:''}</div>
        <div class="wf-lsi" onclick="WfWidget.go('clients')"><div class="wf-lsv">${live.totalClients}</div><div class="wf-lsl">Klientov</div></div>
      </div>
      <div class="wf-pl"><span>Denný checklist</span><span>${dc}/${tc}</span></div>
      <div class="wf-pb"><div class="wf-pf" style="width:${pct}%"></div></div>
      ${state.dailyChecklist.map((item,i)=>`<div class="wf-ci ${item.done?'done':''}" onclick="WfWidget.check(${i})"><div class="wf-cb">${item.done?'✓':''}</div><span class="wf-ct">${item.text}</span></div>`).join('')}
      <div class="wf-sh" style="margin-top:14px">⏱️ Focus Timer</div>
      <div class="wf-pomo">
        <div class="wf-plb">${state.pomodoroRunning?'🔴 Pracujem...':'Pripravený'}</div>
        <div class="wf-pt">${fmt(state.pomodoroTime)}</div>
        <div class="wf-pbs2">
          ${state.pomodoroRunning?`<button class="wf-pmb pause" onclick="WfWidget.pp()">⏸ Pauza</button>`:`<button class="wf-pmb start" onclick="WfWidget.ps()">▶ Štart</button>`}
          <button class="wf-pmb reset" onclick="WfWidget.pr()">↺</button>
        </div>
      </div>`;
  }

  function renderTasks() {
    const p=state.tasks.filter(t=>!t.done), d=state.tasks.filter(t=>t.done);
    return `
      <div class="wf-tir"><input type="text" class="wf-ti" id="wf-ti" placeholder="Nová úloha..." onkeydown="if(event.key==='Enter')WfWidget.addT()"><button class="wf-tab2" onclick="WfWidget.addT()">+</button></div>
      <div class="wf-pbs"><button class="wf-pbb" onclick="WfWidget.addTP('high')">🔴 Urgent</button><button class="wf-pbb" onclick="WfWidget.addTP('medium')">🟡 Stredné</button><button class="wf-pbb" onclick="WfWidget.addTP('low')">🟢 Nízke</button></div>
      ${p.length===0&&d.length===0?'<div style="text-align:center;padding:24px 0;color:#94a3b8;font-size:12px">✅ Žiadne úlohy</div>':''}
      ${p.length>0?`<div class="wf-sh">Aktívne (${p.length})</div>${p.map(rT).join('')}`:''}
      ${d.length>0?`<div class="wf-sh" style="display:flex;justify-content:space-between"><span>Hotové (${d.length})</span><button class="wf-fbtn" onclick="WfWidget.clrD()" style="font-size:10px">Vymazať</button></div>${d.map(rT).join('')}`:''}`;
  }

  function rT(t) {
    return `<div class="wf-tsk ${t.done?'done':''}"><div class="wf-cb" style="cursor:pointer;${t.done?'background:#22c55e;border-color:#22c55e;color:#fff;':''}" onclick="WfWidget.tglT('${t.id}')">${t.done?'✓':''}</div><div class="wf-tp ${t.priority||'medium'}"></div><span class="wf-tt">${t.text}</span><button class="wf-td" onclick="WfWidget.delT('${t.id}')">✕</button></div>`;
  }

  function renderWorkflow() {
    return `
      <div class="wf-sh">Lead → Klient Pipeline</div>
      ${WORKFLOW_STEPS.map((s,i)=>`${i>0?'<div class="wf-fa">↓</div>':''}
        <div class="wf-fs ${state.activeWorkflowStep===s.id?'active':''}" onclick="WfWidget.setFS('${s.id}')">
          <div class="wf-fi">${s.icon}</div>
          <div style="flex:1"><div class="wf-fl">${s.label}</div><div class="wf-fd">${s.desc}</div></div>
          <button class="wf-fg" onclick="event.stopPropagation();WfWidget.goStep('${s.id}')">Otvoriť →</button>
        </div>`).join('')}
      <div class="wf-sh" style="margin-top:14px">⚡ Rýchle akcie</div>
      <div class="wf-ql">
        <button class="wf-qlb" onclick="WfWidget.go('leads','import')">📥 Import</button>
        <button class="wf-qlb" onclick="WfWidget.go('leads')">🤖 Analýza</button>
        <button class="wf-qlb" onclick="WfWidget.go('leads')">📧 Ponuky</button>
        <button class="wf-qlb" onclick="WfWidget.go('clients')">👥 Klienti</button>
        <button class="wf-qlb" onclick="WfWidget.go('billing')">💰 Faktúry</button>
        <button class="wf-qlb" onclick="WfWidget.go('messages')">📧 Emaily</button>
        <a class="wf-qlb" href="https://marketingminer.com" target="_blank">⛏️ MM ↗</a>
        <a class="wf-qlb" href="https://ads.google.com" target="_blank">Google Ads ↗</a>
        <a class="wf-qlb" href="https://business.facebook.com" target="_blank">Meta Ads ↗</a>
      </div>`;
  }

  function renderNotes() {
    return `
      <div class="wf-sh">Rýchle poznámky</div>
      <textarea class="wf-na" placeholder="Poznámky, nápady, linky..." oninput="WfWidget.saveN(this.value)">${state.quickNotes||''}</textarea>
      <div class="wf-sh" style="margin-top:14px">📌 Kontakty</div>
      <div style="font-size:12px;color:#475569;line-height:1.8">
        <div>📧 <strong>info@adlify.eu</strong></div>
        <div>📞 <strong>+421 944 184 045</strong></div>
        <div>🌐 <strong>www.adlify.eu</strong></div>
      </div>
      <div class="wf-ql" style="margin-top:10px">
        <a class="wf-qlb" href="https://ads.google.com" target="_blank">Google Ads ↗</a>
        <a class="wf-qlb" href="https://business.facebook.com" target="_blank">Meta Ads ↗</a>
        <a class="wf-qlb" href="https://marketingminer.com" target="_blank">MM ↗</a>
        <a class="wf-qlb" href="https://app.supabase.com" target="_blank">Supabase ↗</a>
      </div>`;
  }

  // === DRAG WIDGET ===
  let _d=false, _do={x:0,y:0};
  function drag(e) { if(e.target.closest('.wf-hbtn'))return; _d=true; _do={x:e.clientX-W.offsetLeft,y:e.clientY-W.offsetTop}; W.classList.add('dragging'); document.addEventListener('mousemove',_dm); document.addEventListener('mouseup',_du); e.preventDefault(); }
  function _dm(e) { if(!_d)return; let x=Math.max(0,Math.min(e.clientX-_do.x,innerWidth-60)), y=Math.max(0,Math.min(e.clientY-_do.y,innerHeight-60)); W.style.left=x+'px'; W.style.top=y+'px'; state.position={x,y}; }
  function _du() { _d=false; W.classList.remove('dragging'); document.removeEventListener('mousemove',_dm); document.removeEventListener('mouseup',_du); save(); }

  // === DRAG BUBBLE ===
  let _bd=false, _bm=false, _bo={x:0,y:0};
  function bubbleDrag(e) { _bd=true; _bm=false; _bo={x:e.clientX-W.offsetLeft,y:e.clientY-W.offsetTop}; document.addEventListener('mousemove',_bdm); document.addEventListener('mouseup',_bdu); e.preventDefault(); }
  function _bdm(e) { if(!_bd)return; _bm=true; let x=Math.max(0,Math.min(e.clientX-_bo.x,innerWidth-60)), y=Math.max(0,Math.min(e.clientY-_bo.y,innerHeight-60)); W.style.left=x+'px'; W.style.top=y+'px'; state.position={x,y}; }
  function _bdu() { _bd=false; document.removeEventListener('mousemove',_bdm); document.removeEventListener('mouseup',_bdu); if(!_bm) WfWidget.toggle(); save(); }

  // === RESIZE ===
  let _r=false, _rs={x:0,y:0,w:0,h:0};
  function resizeStart(e) { _r=true; const b=W.querySelector('.wf-body'); _rs={x:e.clientX,y:e.clientY,w:b.offsetWidth,h:b.offsetHeight}; document.addEventListener('mousemove',_rm); document.addEventListener('mouseup',_ru); e.preventDefault(); e.stopPropagation(); }
  function _rm(e) { if(!_r)return; const nw=Math.max(300,Math.min(_rs.w+(e.clientX-_rs.x),600)), nh=Math.max(300,Math.min(_rs.h+(e.clientY-_rs.y),innerHeight-100)); state.size={w:nw,h:nh}; const b=W.querySelector('.wf-body'); if(b){b.style.width=nw+'px';b.style.maxHeight=nh+'px';} }
  function _ru() { _r=false; document.removeEventListener('mousemove',_rm); document.removeEventListener('mouseup',_ru); save(); }

  // === PUBLIC API ===
  window.WfWidget = {
    drag, bubbleDrag, resizeStart,
    toggle() { state.minimized=!state.minimized; W.classList.toggle('minimized',state.minimized); save(); if(!state.minimized) fetchLive().then(render); else render(); },
    hide() { W.style.display='none'; },
    show() { W.style.display='block'; state.minimized=false; W.classList.remove('minimized'); fetchLive().then(render); },
    tab(t) { state.activeTab=t; save(); render(); },
    check(i) { state.dailyChecklist[i].done=!state.dailyChecklist[i].done; save(); render(); },
    addT() { const el=document.getElementById('wf-ti'); if(!el||!el.value.trim())return; state.tasks.unshift({id:'t_'+Date.now(),text:el.value.trim(),done:false,priority:'medium',created:new Date().toISOString()}); save(); render(); setTimeout(()=>{const e=document.getElementById('wf-ti');if(e)e.focus();},50); },
    addTP(p) { const el=document.getElementById('wf-ti'); if(!el||!el.value.trim()){el?.focus();return;} state.tasks.unshift({id:'t_'+Date.now(),text:el.value.trim(),done:false,priority:p,created:new Date().toISOString()}); save(); render(); },
    tglT(id) { const t=state.tasks.find(t=>t.id===id); if(t){t.done=!t.done;save();render();} },
    delT(id) { state.tasks=state.tasks.filter(t=>t.id!==id); save(); render(); },
    clrD() { state.tasks=state.tasks.filter(t=>!t.done); save(); render(); },
    setFS(id) { state.activeWorkflowStep=state.activeWorkflowStep===id?null:id; save(); render(); },
    goStep(id) { const s=WORKFLOW_STEPS.find(s=>s.id===id); if(!s)return; if(s.url){window.open(s.url,'_blank');return;} if(s.route&&window.Router){Router.navigate(s.route);if(s.tab)setTimeout(()=>{if(window.LeadsModule)LeadsModule.showTab(s.tab);},300);if(s.filter)setTimeout(()=>{if(window.LeadsModule)LeadsModule.onStatusChange(s.filter);},300);} },
    go(route,tab) { if(window.Router)Router.navigate(route); if(tab)setTimeout(()=>{if(window.LeadsModule)LeadsModule.showTab(tab);},300); },
    saveN(v) { state.quickNotes=v; save(); },
    ps() { state.pomodoroRunning=true; save(); render(); WfWidget._pi=setInterval(()=>{if(state.pomodoroTime<=0){WfWidget.pp();state.pomodoroTime=0;save();render();if(Notification.permission==='granted')new Notification('⏱️ Pomodoro hotové!',{body:'Čas na pauzu.'});if(window.Utils)Utils.toast('⏱️ Pomodoro hotové!','success');return;}state.pomodoroTime--;const el=document.querySelector('.wf-pt');if(el)el.textContent=fmt(state.pomodoroTime);},1000); },
    pp() { state.pomodoroRunning=false; clearInterval(WfWidget._pi); save(); render(); },
    pr() { state.pomodoroRunning=false; state.pomodoroTime=25*60; clearInterval(WfWidget._pi); save(); render(); },
    resetDay() { if(!confirm('Resetovať denný checklist?'))return; state.dailyChecklist=JSON.parse(JSON.stringify(DEFAULT_DAILY_CHECKLIST)); state.lastResetDate=new Date().toDateString(); save(); render(); },
    refresh() { fetchLive().then(render); }
  };

  // === KEYBOARD ===
  document.addEventListener('keydown', e => { if(e.altKey&&(e.key==='w'||e.key==='W')){e.preventDefault();W.style.display==='none'?WfWidget.show():WfWidget.toggle();} });

  // === AUTO REFRESH ===
  setInterval(()=>{const el=W.querySelector('.wf-header-time');if(el)el.textContent=new Date().toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'});},30000);
  setInterval(()=>{if(!state.minimized)fetchLive().then(()=>{const els=W.querySelectorAll('.wf-lsv');if(els.length>=3){els[0].textContent=live.totalLeads;els[1].textContent=live.proposalsToday;els[2].textContent=live.totalClients;}});},60000);

  // === INIT ===
  document.body.appendChild(W);
  render();
  setTimeout(()=>fetchLive().then(render),2000);
  if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();
  console.log('🚀 Workflow Widget v1.1 (Alt+W)');
})();
