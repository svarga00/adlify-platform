/**
 * ADLIFY PLATFORM — Outreach Module v2.0
 *
 * Pracuje s tabuľkou `prospects` (cold outreach targets).
 * Prospect sa premení na lead buď:
 *   - automaticky podľa pravidiel v outreach_settings (audit click, call booked, ...)
 *   - manuálne cez tlačidlo "Presunúť do leadov"
 *
 * Flow:
 *   1. Vyber prospectov (filter: stage, segment, search)
 *   2. Preview generovaneho emailu (OutreachTemplates.coldOutreachAudit)
 *   3. Poslanie cez /.netlify/functions/send-email (Resend)
 *   4. Update prospects.outreach_email_sent_at + outreach_stage='email_sent'
 */

const OutreachModule = {
  id: 'outreach',
  name: 'Outreach',
  icon: '📮',
  title: 'Outreach',
  subtitle: 'Personalizované oslovovanie firiem',

  menu: { section: 'main', order: 25 },
  permissions: ['leads', 'view'],

  prospects: [],
  selectedIds: new Set(),
  drafts: new Map(),
  currentView: 'overview',
  filters: { stage: 'pending', segment: 'all', search: '' },

  init() {
    console.log('📮 Outreach module initialized');
  },

  async render(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam...</div>';
    try {
      const { data, error } = await Database.client
        .from('prospects')
        .select('id, company_name, domain, contact_person, email, phone, industry, city, segment, status:outreach_stage, score, source, audit_token, outreach_stage, outreach_email_sent_at, outreach_email_opened_at, outreach_email_open_count, outreach_email_replied_at, audit_requested_at, audit_delivered_at, audit_viewed_at, converted_to_lead_id, converted_at, conversion_reason, created_at, notes')
        .order('score', { ascending: false, nullsLast: true })
        .limit(500);
      if (error) throw error;
      this.prospects = data || [];
      container.innerHTML = this.template();
      this.bindEvents();
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626;">Chyba: ${e.message}</div>`;
    }
  },

  template() {
    const stats = this.computeStats();
    return `
      <div class="adl">
        ${this.renderHeader(stats)}
        ${this.renderFunnel(stats)}
        ${this.currentView === 'compose' ? this.renderCompose() : this.renderOverview(stats)}
      </div>
    `;
  },

  computeStats() {
    const p = this.prospects;
    return {
      total: p.length,
      pending: p.filter(x => !x.outreach_stage || x.outreach_stage === 'pending').length,
      email_sent: p.filter(x => x.outreach_stage === 'email_sent').length,
      email_opened: p.filter(x => x.outreach_email_opened_at).length,
      audit_requested: p.filter(x => x.audit_requested_at).length,
      audit_viewed: p.filter(x => x.audit_viewed_at).length,
      converted: p.filter(x => x.outreach_stage === 'converted').length,
    };
  },

  renderHeader(stats) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 4px;color:#14120E;">Outreach</h1>
          <p style="color:#6F6758;font-size:14px;margin:0;">Personalizované oslovovanie firiem · Audit-first flow</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${this.currentView === 'compose' ? `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.setView('overview')">← Späť</button>
          ` : `
            <button class="adl-btn adl-btn-outline" onclick="OutreachModule.exportCsv()">Export CSV</button>
            <button class="adl-btn adl-btn-primary" onclick="OutreachModule.startCompose()" ${stats.pending === 0 ? 'disabled' : ''}>Nová kampaň (${stats.pending})</button>
          `}
        </div>
      </div>
    `;
  },

  renderFunnel(stats) {
    const steps = [
      { label: 'Voľní prospekti', value: stats.pending, color: '#6F6758' },
      { label: 'Email odoslaný', value: stats.email_sent, color: '#3B82F6' },
      { label: 'Email otvorený', value: stats.email_opened, color: '#8B5CF6' },
      { label: 'Klikol na audit', value: stats.audit_requested, color: '#F59E0B' },
      { label: 'Audit videl', value: stats.audit_viewed, color: '#EA580C' },
      { label: 'Lead', value: stats.converted, color: '#16A34A' },
    ];
    return `
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:24px;">
        ${steps.map(s => `
          <div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:16px;">
            <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;">${s.label}</div>
            <div style="font-size:24px;font-weight:800;color:${s.color};letter-spacing:-0.5px;">${s.value}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderOverview(stats) {
    const f = this.filters;
    const filtered = this.applyFilters();

    return `
      <!-- Filters -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <input type="text" placeholder="Hľadať firmu, doménu..." value="${f.search}" oninput="OutreachModule.setFilter('search', this.value)"
          style="flex:1;min-width:220px;padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
        <select onchange="OutreachModule.setFilter('stage', this.value)"
          style="padding:10px 14px;border:1.5px solid #EAE6DE;border-radius:10px;font-size:14px;background:#fff;">
          <option value="all" ${f.stage==='all'?'selected':''}>Všetky fázy</option>
          <option value="pending" ${f.stage==='pending'?'selected':''}>Voľní (neodoslané)</option>
          <option value="email_sent" ${f.stage==='email_sent'?'selected':''}>Email odoslaný</option>
          <option value="email_opened" ${f.stage==='email_opened'?'selected':''}>Email otvorený</option>
          <option value="audit_requested" ${f.stage==='audit_requested'?'selected':''}>Klikli na audit</option>
          <option value="audit_viewed" ${f.stage==='audit_viewed'?'selected':''}>Audit videli</option>
          <option value="converted" ${f.stage==='converted'?'selected':''}>Premenení na lead</option>
          <option value="lost" ${f.stage==='lost'?'selected':''}>Stratení</option>
        </select>
      </div>

      <!-- Table -->
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead style="background:#F7F5F1;">
              <tr>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Firma</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Kontakt</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Fáza</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Skóre</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Akcie</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="5" style="padding:40px;text-align:center;color:#6F6758;">Žiadni prospekti podľa filtra.</td></tr>
              ` : filtered.slice(0, 100).map(p => this.renderRow(p)).join('')}
            </tbody>
          </table>
        </div>
        ${filtered.length > 100 ? `<div style="padding:12px;text-align:center;color:#948B7C;font-size:13px;border-top:1px solid #EAE6DE;">Zobrazených 100 z ${filtered.length}</div>` : ''}
      </div>
    `;
  },

  renderRow(prospect) {
    const stage = this.stageBadge(prospect);
    const company = prospect.company_name || prospect.domain;
    const contact = prospect.contact_person ? `${prospect.contact_person}${prospect.email ? ' · ' + prospect.email : ''}` : (prospect.email || '—');
    const canSend = !prospect.outreach_email_sent_at && prospect.email && prospect.outreach_stage !== 'converted';
    const isConverted = prospect.outreach_stage === 'converted';

    return `
      <tr style="border-top:1px solid #EAE6DE;${isConverted ? 'opacity:.6;' : ''}">
        <td style="padding:14px 16px;">
          <div style="font-weight:600;color:#14120E;">${this.esc(company)}</div>
          <div style="font-size:12px;color:#948B7C;">${this.esc(prospect.domain || '')}${prospect.industry ? ' · ' + this.esc(prospect.industry) : ''}</div>
        </td>
        <td style="padding:14px 16px;color:#6F6758;">${this.esc(contact)}</td>
        <td style="padding:14px 16px;">${stage}</td>
        <td style="padding:14px 16px;"><strong>${prospect.score || 0}</strong></td>
        <td style="padding:14px 16px;display:flex;gap:6px;flex-wrap:wrap;">
          ${canSend ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.composeSingle('${prospect.id}')">Poslať email</button>` : ''}
          ${prospect.audit_token ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="window.open('/audit.html?t=${prospect.audit_token}', '_blank')" title="Pozrieť audit">Audit</button>` : ''}
          ${!isConverted ? `<button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.promoteToLead('${prospect.id}')" title="Manuálne presunúť do leadov">→ Lead</button>` : ''}
          ${isConverted && prospect.converted_to_lead_id ? `<a class="adl-btn adl-btn-sm adl-btn-soft" href="#/leads?id=${prospect.converted_to_lead_id}">Otvoriť lead</a>` : ''}
        </td>
      </tr>
    `;
  },

  stageBadge(prospect) {
    const s = prospect.outreach_stage || 'pending';
    const map = {
      pending: { label: 'Voľný', color: '#6F6758', bg: '#F7F5F1' },
      email_sent: { label: 'Email odoslaný', color: '#3B82F6', bg: '#DBEAFE' },
      email_opened: { label: 'Otvorený', color: '#8B5CF6', bg: '#EDE9FE' },
      email_clicked: { label: 'Klikol', color: '#F59E0B', bg: '#FEF3C7' },
      bounced: { label: 'Bounced', color: '#DC2626', bg: '#FEE2E2' },
      unsubscribed: { label: 'Opt-out', color: '#6F6758', bg: '#F7F5F1' },
      converted: { label: 'Lead', color: '#16A34A', bg: '#DCFCE7' },
      lost: { label: 'Stratený', color: '#6F6758', bg: '#F7F5F1' },
    };
    const info = map[s] || map.pending;
    return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${info.bg};color:${info.color};font-size:12px;font-weight:600;">${info.label}</span>`;
  },

  renderCompose() {
    const selected = Array.from(this.selectedIds).map(id => this.prospects.find(p => p.id === id)).filter(Boolean);
    const ready = selected.filter(p => p.email);
    const noEmail = selected.filter(p => !p.email);

    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:24px;margin-bottom:16px;">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#14120E;">Odoslať kampaň (${ready.length} firiem)</h2>
        <p style="color:#6F6758;font-size:14px;margin:0 0 16px;">Každý email je personalizovaný na firmu (meno, odvetvie, mesto). Odosielateľ: <strong>Štefan Varga · Adlify</strong>.</p>
        ${noEmail.length ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;font-size:13px;color:#92400E;margin-bottom:16px;">${noEmail.length} firiem nemá email a bude preskočených.</div>` : ''}

        <div style="display:flex;gap:10px;margin-bottom:16px;">
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule.previewFirst()">Náhľad 1. emailu</button>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.sendCampaign()" ${ready.length === 0 ? 'disabled' : ''}>
            Odoslať ${ready.length} emailov
          </button>
        </div>

        <div id="outreach-preview" style="display:none;margin-top:16px;border-top:1px solid #EAE6DE;padding-top:16px;"></div>

        <div style="max-height:360px;overflow-y:auto;margin-top:16px;border:1px solid #EAE6DE;border-radius:10px;">
          ${ready.map(p => `
            <div style="padding:12px 14px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:600;">${this.esc(p.company_name || p.domain)}</div>
                <div style="font-size:12px;color:#948B7C;">${this.esc(p.contact_person || '')} · ${this.esc(p.email)}</div>
              </div>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewSingle('${p.id}')">Náhľad</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div id="outreach-progress" style="display:none;"></div>
    `;
  },

  applyFilters() {
    let out = this.prospects;
    const { stage, search } = this.filters;
    if (stage && stage !== 'all') {
      if (stage === 'pending') out = out.filter(p => !p.outreach_stage || p.outreach_stage === 'pending');
      else if (stage === 'audit_requested') out = out.filter(p => p.audit_requested_at && !p.audit_viewed_at);
      else if (stage === 'audit_viewed') out = out.filter(p => p.audit_viewed_at);
      else out = out.filter(p => p.outreach_stage === stage);
    }
    if (search) {
      const s = search.toLowerCase();
      out = out.filter(p =>
        (p.company_name || '').toLowerCase().includes(s) ||
        (p.domain || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s) ||
        (p.industry || '').toLowerCase().includes(s)
      );
    }
    return out;
  },

  setFilter(k, v) {
    this.filters[k] = v;
    this.rerender();
  },

  setView(v) {
    this.currentView = v;
    this.rerender();
  },

  rerender() {
    const container = document.getElementById('module-content') || document.querySelector('[data-module-container]');
    if (container) container.innerHTML = this.template();
  },

  startCompose() {
    const candidates = this.prospects.filter(p => (!p.outreach_stage || p.outreach_stage === 'pending') && p.email);
    if (candidates.length === 0) return Utils.toast('Žiadni voľní prospekti s emailom', 'warning');
    this.selectedIds = new Set(candidates.slice(0, 30).map(p => p.id));
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  composeSingle(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p?.email) return Utils.toast('Prospect nemá email', 'warning');
    this.selectedIds = new Set([prospectId]);
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  async promoteToLead(prospectId) {
    if (!window.Prospects) return Utils.toast('Prospects helper nie je načítaný', 'danger');
    const p = this.prospects.find(x => x.id === prospectId);
    const label = p?.company_name || p?.domain || 'prospect';
    if (!confirm(`Presunúť "${label}" do leadov?`)) return;

    const { lead, error } = await window.Prospects.promoteToLead(prospectId, 'manual');
    if (error) {
      Utils.toast('Chyba: ' + error.message, 'danger');
      return;
    }
    Utils.toast(`Presunutý do leadov (id ${lead.id.slice(0, 8)}…)`, 'success');
    // reload
    this.render(document.getElementById('module-content') || document.querySelector('[data-module-container]'));
  },

  buildEmail(prospect) {
    if (!window.OutreachTemplates) {
      console.error('OutreachTemplates missing — include shared/js/utils/outreach-templates.js');
      return null;
    }
    return OutreachTemplates.coldOutreachAudit({
      contactName: prospect.contact_person || '',
      companyName: prospect.company_name || prospect.domain,
      domain: prospect.domain,
      industry: prospect.industry || '',
      city: prospect.city || '',
      auditToken: prospect.audit_token,
    });
  },

  previewFirst() {
    const firstId = Array.from(this.selectedIds).find(id => this.prospects.find(p => p.id === id)?.email);
    if (firstId) this.previewSingle(firstId);
  },

  previewSingle(prospectId) {
    const p = this.prospects.find(x => x.id === prospectId);
    if (!p) return;
    const email = this.buildEmail(p);
    if (!email) return Utils.toast('Chyba pri generovaní emailu', 'danger');

    const box = document.getElementById('outreach-preview');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Náhľad pre: ${this.esc(p.company_name || p.domain)}</div>
          <div style="font-weight:700;font-size:16px;">${this.esc(email.subject)}</div>
        </div>
        <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="document.getElementById('outreach-preview').style.display='none'">Zavrieť</button>
      </div>
      <div style="border:1px solid #EAE6DE;border-radius:12px;overflow:hidden;background:#F7F5F1;padding:12px;">
        <iframe id="outreach-iframe" style="width:100%;height:560px;border:0;background:#fff;border-radius:8px;"></iframe>
      </div>
    `;
    const iframe = document.getElementById('outreach-iframe');
    iframe.onload = () => {
      try { iframe.contentDocument.body.innerHTML = ''; iframe.contentDocument.open(); iframe.contentDocument.write(email.html); iframe.contentDocument.close(); } catch(e) {}
    };
    iframe.src = 'about:blank';
  },

  async sendCampaign() {
    const selected = Array.from(this.selectedIds)
      .map(id => this.prospects.find(p => p.id === id))
      .filter(p => p && p.email);

    if (selected.length === 0) return Utils.toast('Žiadni prospekti', 'warning');
    if (!confirm(`Odoslať ${selected.length} emailov?\n\nTáto akcia je nezvratná.`)) return;

    const progressBox = document.getElementById('outreach-progress');
    progressBox.style.display = 'block';
    progressBox.innerHTML = `<div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:20px;">
      <div id="outreach-status" style="font-weight:600;margin-bottom:12px;">Odosielam 0/${selected.length}...</div>
      <div style="background:#F7F5F1;border-radius:8px;height:10px;overflow:hidden;"><div id="outreach-bar" style="height:100%;background:#F97316;width:0%;transition:width .3s;"></div></div>
      <div id="outreach-log" style="margin-top:12px;font-size:12px;font-family:monospace;color:#6F6758;max-height:200px;overflow-y:auto;"></div>
    </div>`;

    let ok = 0, fail = 0;
    for (let i = 0; i < selected.length; i++) {
      const prospect = selected[i];
      try {
        const email = this.buildEmail(prospect);
        const r = await fetch('/.netlify/functions/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: prospect.email,
            subject: email.subject,
            htmlBody: email.html,
            textBody: email.text,
            prospectId: prospect.id,
          }),
        });
        if (r.ok) {
          ok++;
          await Database.client.from('prospects').update({
            outreach_email_sent_at: new Date().toISOString(),
            outreach_last_contacted_at: new Date().toISOString(),
            outreach_stage: 'email_sent',
          }).eq('id', prospect.id);
          this.appendLog(`✓ ${prospect.company_name || prospect.domain} (${prospect.email})`, 'ok');
        } else {
          fail++;
          this.appendLog(`✗ ${prospect.company_name || prospect.domain}: ${r.status}`, 'err');
        }
      } catch (e) {
        fail++;
        this.appendLog(`✗ ${prospect.company_name || prospect.domain}: ${e.message}`, 'err');
      }
      const pct = Math.round(((i + 1) / selected.length) * 100);
      document.getElementById('outreach-bar').style.width = pct + '%';
      document.getElementById('outreach-status').textContent = `Odosielam ${i + 1}/${selected.length}...`;
      await new Promise(r => setTimeout(r, 250)); // anti-spam delay
    }

    document.getElementById('outreach-status').textContent = `Hotovo: ${ok} odoslaných, ${fail} neúspešných.`;
    Utils.toast(`Kampaň dokončená: ${ok}/${selected.length}`, fail === 0 ? 'success' : 'warning');

    setTimeout(() => { this.currentView = 'overview'; this.render(document.getElementById('module-content') || document.querySelector('[data-module-container]')); }, 2000);
  },

  appendLog(msg, type) {
    const el = document.getElementById('outreach-log');
    if (!el) return;
    const color = type === 'err' ? '#DC2626' : '#16A34A';
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = msg;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  exportCsv() {
    const rows = [['Firma', 'Doména', 'Email', 'Kontakt', 'Odvetvie', 'Segment', 'Fáza', 'Skóre', 'Audit link']];
    this.prospects.forEach(p => {
      rows.push([
        p.company_name || '',
        p.domain || '',
        p.email || '',
        p.contact_person || '',
        p.industry || '',
        p.segment || '',
        p.outreach_stage || 'pending',
        p.score || 0,
        p.audit_token ? `${location.origin}/audit.html?t=${p.audit_token}` : '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `adlify-outreach-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  bindEvents() {
    // placeholder pre buduce listenery
  },

  esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
};

if (typeof window !== 'undefined') {
  window.OutreachModule = OutreachModule;
  if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register(OutreachModule);
  }
}
