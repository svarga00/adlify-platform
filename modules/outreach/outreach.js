/**
 * ADLIFY PLATFORM — Outreach Module v1.0
 *
 * Personalizovane cold emaily firmam s audit-first prístupom.
 *
 * Flow:
 *   1. Vyber leadov (filter: status, segment, bez audit_sent)
 *   2. Preview generovaneho emailu (OutreachTemplates.coldOutreachAudit)
 *   3. Rucna uprava per lead ak treba
 *   4. Poslanie cez /.netlify/functions/send-email (Resend)
 *   5. Update leads.outreach_email_sent_at + outreach_stage='email_sent'
 *
 * Meniaci sa state:
 *   - OutreachModule.currentView: 'overview' | 'compose' | 'preview'
 *   - OutreachModule.selectedIds: Set<uuid>
 *   - OutreachModule.drafts: Map<leadId, { subject, html, text, edited }>
 */

const OutreachModule = {
  id: 'outreach',
  name: 'Outreach',
  icon: '📮',
  title: 'Outreach',
  subtitle: 'Personalizované oslovovanie firiem',

  menu: { section: 'main', order: 25 },
  permissions: ['leads', 'view'],

  leads: [],
  selectedIds: new Set(),
  drafts: new Map(),
  currentView: 'overview',
  filters: { stage: 'pending', source: 'all', search: '' },

  init() {
    console.log('📮 Outreach module initialized');
  },

  async render(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam...</div>';
    try {
      const { data, error } = await Database.client
        .from('leads')
        .select('id, company_name, domain, contact_person, email, phone, industry, city, status, score, source, audit_token, outreach_stage, outreach_email_sent_at, outreach_email_opened_at, audit_requested_at, audit_delivered_at, audit_viewed_at, created_at, notes')
        .order('score', { ascending: false, nullsLast: true })
        .limit(500);
      if (error) throw error;
      this.leads = data || [];
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
    const l = this.leads;
    return {
      total: l.length,
      pending: l.filter(x => !x.outreach_stage || x.outreach_stage === 'pending').length,
      email_sent: l.filter(x => x.outreach_stage === 'email_sent').length,
      email_opened: l.filter(x => x.outreach_email_opened_at).length,
      audit_requested: l.filter(x => x.audit_requested_at).length,
      audit_viewed: l.filter(x => x.audit_viewed_at).length,
      call_booked: l.filter(x => x.outreach_stage === 'call_booked').length,
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
      { label: 'Voľné leady', value: stats.pending, color: '#6F6758' },
      { label: 'Email odoslaný', value: stats.email_sent, color: '#3B82F6' },
      { label: 'Email otvorený', value: stats.email_opened, color: '#8B5CF6' },
      { label: 'Klikol na audit', value: stats.audit_requested, color: '#F59E0B' },
      { label: 'Audit videl', value: stats.audit_viewed, color: '#EA580C' },
      { label: 'Rezervoval call', value: stats.call_booked, color: '#16A34A' },
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
          <option value="pending" ${f.stage==='pending'?'selected':''}>Voľné (neodoslané)</option>
          <option value="email_sent" ${f.stage==='email_sent'?'selected':''}>Email odoslaný</option>
          <option value="audit_requested" ${f.stage==='audit_requested'?'selected':''}>Klikli na audit</option>
          <option value="audit_viewed" ${f.stage==='audit_viewed'?'selected':''}>Audit videli</option>
          <option value="call_booked" ${f.stage==='call_booked'?'selected':''}>Rezervovali call</option>
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
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Akcia</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="5" style="padding:40px;text-align:center;color:#6F6758;">Žiadne leady podľa filtra.</td></tr>
              ` : filtered.slice(0, 100).map(l => this.renderRow(l)).join('')}
            </tbody>
          </table>
        </div>
        ${filtered.length > 100 ? `<div style="padding:12px;text-align:center;color:#948B7C;font-size:13px;border-top:1px solid #EAE6DE;">Zobrazených 100 z ${filtered.length}</div>` : ''}
      </div>
    `;
  },

  renderRow(lead) {
    const stage = this.stageBadge(lead);
    const company = lead.company_name || lead.domain;
    const contact = lead.contact_person ? `${lead.contact_person}${lead.email ? ' · ' + lead.email : ''}` : (lead.email || '—');
    const canSend = !lead.outreach_email_sent_at && lead.email;

    return `
      <tr style="border-top:1px solid #EAE6DE;">
        <td style="padding:14px 16px;">
          <div style="font-weight:600;color:#14120E;">${this.esc(company)}</div>
          <div style="font-size:12px;color:#948B7C;">${this.esc(lead.domain || '')}${lead.industry ? ' · ' + this.esc(lead.industry) : ''}</div>
        </td>
        <td style="padding:14px 16px;color:#6F6758;">${this.esc(contact)}</td>
        <td style="padding:14px 16px;">${stage}</td>
        <td style="padding:14px 16px;"><strong>${lead.score || 0}</strong></td>
        <td style="padding:14px 16px;">
          ${canSend ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="OutreachModule.composeSingle('${lead.id}')">Poslať email</button>` : ''}
          ${lead.audit_token ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="window.open('/audit.html?t=${lead.audit_token}', '_blank')" title="Pozrieť audit">Audit</button>` : ''}
        </td>
      </tr>
    `;
  },

  stageBadge(lead) {
    const s = lead.outreach_stage || 'pending';
    const map = {
      pending: { label: 'Voľný', color: '#6F6758', bg: '#F7F5F1' },
      email_sent: { label: 'Email odoslaný', color: '#3B82F6', bg: '#DBEAFE' },
      email_opened: { label: 'Otvorený', color: '#8B5CF6', bg: '#EDE9FE' },
      audit_requested: { label: 'Klikol', color: '#F59E0B', bg: '#FEF3C7' },
      audit_delivered: { label: 'Audit doručený', color: '#EA580C', bg: '#FFE6D3' },
      audit_viewed: { label: 'Audit videl', color: '#DC2626', bg: '#FEE2E2' },
      call_booked: { label: 'Rezervoval', color: '#16A34A', bg: '#DCFCE7' },
      converted: { label: 'Klient', color: '#16A34A', bg: '#DCFCE7' },
      lost: { label: 'Stratený', color: '#6F6758', bg: '#F7F5F1' },
    };
    const info = map[s] || map.pending;
    return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${info.bg};color:${info.color};font-size:12px;font-weight:600;">${info.label}</span>`;
  },

  renderCompose() {
    const selected = Array.from(this.selectedIds).map(id => this.leads.find(l => l.id === id)).filter(Boolean);
    const ready = selected.filter(l => l.email);
    const noEmail = selected.filter(l => !l.email);

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
          ${ready.map(l => `
            <div style="padding:12px 14px;border-bottom:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:600;">${this.esc(l.company_name || l.domain)}</div>
                <div style="font-size:12px;color:#948B7C;">${this.esc(l.contact_person || '')} · ${this.esc(l.email)}</div>
              </div>
              <button class="adl-btn adl-btn-sm adl-btn-ghost" onclick="OutreachModule.previewSingle('${l.id}')">Náhľad</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div id="outreach-progress" style="display:none;"></div>
    `;
  },

  applyFilters() {
    let out = this.leads;
    const { stage, search } = this.filters;
    if (stage && stage !== 'all') {
      if (stage === 'pending') out = out.filter(l => !l.outreach_stage || l.outreach_stage === 'pending');
      else if (stage === 'audit_requested') out = out.filter(l => l.audit_requested_at && !l.audit_delivered_at);
      else out = out.filter(l => l.outreach_stage === stage);
    }
    if (search) {
      const s = search.toLowerCase();
      out = out.filter(l =>
        (l.company_name || '').toLowerCase().includes(s) ||
        (l.domain || '').toLowerCase().includes(s) ||
        (l.email || '').toLowerCase().includes(s) ||
        (l.industry || '').toLowerCase().includes(s)
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
    const candidates = this.leads.filter(l => (!l.outreach_stage || l.outreach_stage === 'pending') && l.email);
    if (candidates.length === 0) return Utils.toast('Žiadne voľné leady s emailom', 'warning');
    this.selectedIds = new Set(candidates.slice(0, 30).map(l => l.id));
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  composeSingle(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead?.email) return Utils.toast('Lead nemá email', 'warning');
    this.selectedIds = new Set([leadId]);
    this.drafts.clear();
    this.currentView = 'compose';
    this.rerender();
  },

  buildEmail(lead) {
    if (!window.OutreachTemplates) {
      console.error('OutreachTemplates missing — include shared/js/utils/outreach-templates.js');
      return null;
    }
    return OutreachTemplates.coldOutreachAudit({
      contactName: lead.contact_person || '',
      companyName: lead.company_name || lead.domain,
      domain: lead.domain,
      industry: lead.industry || '',
      city: lead.city || '',
      auditToken: lead.audit_token,
    });
  },

  previewFirst() {
    const firstId = Array.from(this.selectedIds).find(id => this.leads.find(l => l.id === id)?.email);
    if (firstId) this.previewSingle(firstId);
  },

  previewSingle(leadId) {
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;
    const email = this.buildEmail(lead);
    if (!email) return Utils.toast('Chyba pri generovaní emailu', 'danger');

    const box = document.getElementById('outreach-preview');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Náhľad pre: ${this.esc(lead.company_name || lead.domain)}</div>
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
      .map(id => this.leads.find(l => l.id === id))
      .filter(l => l && l.email);

    if (selected.length === 0) return Utils.toast('Žiadne leady', 'warning');
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
      const lead = selected[i];
      try {
        const email = this.buildEmail(lead);
        const r = await fetch('/.netlify/functions/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lead.email,
            subject: email.subject,
            htmlBody: email.html,
            textBody: email.text,
            leadId: lead.id,
          }),
        });
        if (r.ok) {
          ok++;
          await Database.client.from('leads').update({
            outreach_email_sent_at: new Date().toISOString(),
            outreach_stage: 'email_sent',
          }).eq('id', lead.id);
          this.appendLog(`✓ ${lead.company_name || lead.domain} (${lead.email})`, 'ok');
        } else {
          fail++;
          this.appendLog(`✗ ${lead.company_name || lead.domain}: ${r.status}`, 'err');
        }
      } catch (e) {
        fail++;
        this.appendLog(`✗ ${lead.company_name || lead.domain}: ${e.message}`, 'err');
      }
      const pct = Math.round(((i + 1) / selected.length) * 100);
      document.getElementById('outreach-bar').style.width = pct + '%';
      document.getElementById('outreach-status').textContent = `Odosielam ${i + 1}/${selected.length}...`;
      await new Promise(r => setTimeout(r, 250)); // anti-spam delay
    }

    document.getElementById('outreach-status').textContent = `Hotovo: ${ok} odoslaných, ${fail} neúspešných.`;
    Utils.toast(`Kampaň dokončená: ${ok}/${selected.length}`, fail === 0 ? 'success' : 'warning');

    // Reload leads
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
    const rows = [['Firma', 'Doména', 'Email', 'Kontakt', 'Odvetvie', 'Fáza', 'Skóre', 'Audit link']];
    this.leads.forEach(l => {
      rows.push([
        l.company_name || '',
        l.domain || '',
        l.email || '',
        l.contact_person || '',
        l.industry || '',
        l.outreach_stage || 'pending',
        l.score || 0,
        l.audit_token ? `${location.origin}/audit.html?t=${l.audit_token}` : '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
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
