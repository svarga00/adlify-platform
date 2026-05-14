/**
 * Ad Platforms modul — OAuth-based pripojenia na Google Ads,
 * Meta Ads, LinkedIn Ads. Umožňuje connect/disconnect + výber
 * reklamného účtu + manuálny/automatický sync metrík.
 */
const AdPlatformsModule = {
  id: 'ad-platforms',
  name: 'Reklamné platformy',
  icon: '📊',
  title: 'Reklamné platformy',
  subtitle: 'Google Ads, Meta, LinkedIn — connect a synchronizuj metriky',
  menu: { section: 'main', order: 60 },
  permissions: ['owner', 'admin', 'manager'],

  connections: [],
  clientsList: [],
  _container: null,
  _loading: true,

  PLATFORMS: [
    { key: 'google_ads',       name: 'Google Ads',       icon: '🔍', color: '#4285F4', desc: 'Search + Display + YouTube reklamy',  supportsAccounts: true,  supportsSync: true },
    { key: 'meta_ads',         name: 'Meta Ads',         icon: '📘', color: '#1877F2', desc: 'Facebook + Instagram reklamy',         supportsAccounts: true,  supportsSync: true },
    { key: 'linkedin_ads',     name: 'LinkedIn Ads',     icon: '💼', color: '#0A66C2', desc: 'B2B sponzorované príspevky + InMail',  supportsAccounts: false, supportsSync: false },
    { key: 'tiktok_ads',       name: 'TikTok Ads',       icon: '🎵', color: '#010101', desc: 'TikTok reklamný manažér',              supportsAccounts: false, supportsSync: false },
    { key: 'google_analytics', name: 'Google Analytics', icon: '📊', color: '#F9AB00', desc: 'Web analytika a konverzie',            supportsAccounts: false, supportsSync: false },
    { key: 'google_business',  name: 'Google Business',  icon: '📍', color: '#34A853', desc: 'Google Maps & reviews',                 supportsAccounts: false, supportsSync: false },
  ],

  init() { console.log('📊 Ad Platforms module initialized'); },

  async render(container) {
    this._container = container;
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6F6758;">Načítavam…</div>';
    try {
      const [connsRes, clientsRes] = await Promise.all([
        Database.client.from('platform_connections').select('*').order('created_at', { ascending: false }),
        Database.client.from('clients').select('id, company_name, status').eq('status', 'active').order('company_name'),
      ]);
      this.connections = connsRes.data || [];
      this.clientsList = clientsRes.data || [];
      this._loading = false;
      container.innerHTML = this.template();
    } catch (e) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626;">Chyba: ${this._esc(e.message)}</div>`;
    }
  },

  template() {
    const byPlatform = {};
    this.connections.forEach(c => {
      (byPlatform[c.platform] = byPlatform[c.platform] || []).push(c);
    });
    const totalActive = this.connections.filter(c => c.is_active && c.account_id !== 'pending').length;

    return `
      <div class="adl">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:16px;flex-wrap:wrap;">
          <div>
            <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:0 0 4px;color:#14120E;">📊 Reklamné platformy</h1>
            <p style="color:#6F6758;font-size:14px;margin:0;">${totalActive} aktívnych pripojení · automatický sync metrík každé 2 hodiny</p>
          </div>
          <div class="adl-toolbar">
            <button class="adl-btn adl-btn-outline" onclick="AdPlatformsModule.syncAllNow()">↻ Sync všetkých</button>
            <a href="#campaigns" class="adl-btn adl-btn-outline">Otvoriť kampane →</a>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:16px;">
          ${this.PLATFORMS.map(p => this._renderPlatformCard(p, byPlatform[p.key] || [])).join('')}
        </div>
      </div>
    `;
  },

  _renderPlatformCard(p, conns) {
    const connected = conns.length > 0;
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 20px;border-bottom:${connected ? '1px solid #EAE6DE' : '0'};">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:12px;background:${p.color}18;color:${p.color};display:flex;align-items:center;justify-content:center;font-size:22px;">${p.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:15px;color:#14120E;">${p.name}</div>
              <div style="font-size:12px;color:#948B7C;">${p.desc}</div>
            </div>
            ${connected ? '<span style="font-size:11px;background:#DCFCE7;color:#166534;padding:3px 9px;border-radius:999px;font-weight:600;">pripojené</span>' : ''}
          </div>
          <button class="adl-btn ${connected ? 'adl-btn-outline' : 'adl-btn-primary'}" style="width:100%;margin-top:12px;"
            onclick="AdPlatformsModule.connect('${p.key}')">
            ${connected ? '+ Ďalšie pripojenie' : '+ Pripojiť ' + p.name}
          </button>
        </div>
        ${conns.map(c => this._renderConnectionRow(c, p)).join('')}
      </div>
    `;
  },

  _renderConnectionRow(c, p) {
    const client = this.clientsList.find(cl => cl.id === c.client_id);
    const pending = c.account_id === 'pending';
    const scopeLabel = pending ? 'Vyber reklamný účet' : (c.account_name || c.account_id);
    const lastSync = c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('sk-SK') : 'nikdy';
    return `
      <div style="padding:12px 20px;border-top:1px solid #F7F5F1;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:${pending ? '#92400E' : '#14120E'};">
            ${pending ? '⚠ ' : ''}${this._esc(scopeLabel)}
          </div>
          <div style="font-size:11px;color:#948B7C;">
            ${client ? `Klient: ${this._esc(client.company_name)}` : 'Agency-wide'}
            ${c.metadata?.currency ? ` · ${this._esc(c.metadata.currency)}` : ''}
            · Sync: ${lastSync}
          </div>
          ${c.last_error ? `<div style="font-size:11px;color:#DC2626;margin-top:2px;">⚠ ${this._esc(c.last_error)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${pending && p.supportsAccounts ? `<button class="adl-btn adl-btn-sm adl-btn-primary" onclick="AdPlatformsModule.pickAccount('${c.id}','${p.key}')">Vybrať účet</button>` : ''}
          ${!pending && p.supportsSync ? `<button class="adl-btn adl-btn-sm adl-btn-outline" onclick="AdPlatformsModule.syncNow('${c.id}','${p.key}')">↻ Sync</button>` : ''}
          <button class="adl-btn adl-btn-sm adl-btn-ghost" style="color:#DC2626;" onclick="AdPlatformsModule.disconnect('${c.id}')">✕</button>
        </div>
      </div>
    `;
  },

  async connect(platform) {
    const clientOptions = [{ id: '', label: '🏢 Agency-wide' }]
      .concat(this.clientsList.map(c => ({ id: c.id, label: c.company_name })));

    const options = clientOptions.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    const choice = await Utils.prompt({
      title: `Pripojiť ${platform}`,
      message: `Kam patrí pripojenie?\n\n${options}`,
      placeholder: '1',
      defaultValue: '1',
      confirmText: 'Pokračovať',
    });
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= clientOptions.length) return Utils.toast('Neplatná voľba', 'warning');
    const clientId = clientOptions[idx].id;

    const userId = window.Auth?.user?.id || '';
    const params = new URLSearchParams({ platform, return_to: '/admin/#ad-platforms' });
    if (clientId) params.set('client_id', clientId);
    if (userId) params.set('user_id', userId);
    window.location.href = `/.netlify/functions/oauth-start?${params.toString()}`;
  },

  async disconnect(id) {
    const ok = await Utils.confirm('Odpojiť? Tokens sa zmažú. Kampane v DB ostanú.', { type: 'danger', confirmText: 'Odpojiť' });
    if (!ok) return;
    await Database.client.from('platform_connections').delete().eq('id', id);
    Utils.toast('Odpojené', 'success');
    this.render(this._container);
  },

  async pickAccount(connId, platform) {
    const fn = platform === 'google_ads' ? 'google-ads-accounts' : platform === 'meta_ads' ? 'meta-ads-accounts' : null;
    if (!fn) return Utils.toast('Platforma nepodporuje výber účtu cez UI.', 'warning');

    Utils.toast('Načítavam účty…', 'info');
    try {
      const r = await fetch(`/.netlify/functions/${fn}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const accounts = d.accounts || [];
      if (accounts.length === 0) return Utils.toast('Žiadne reklamné účty.', 'warning');

      const list = accounts.map((a, i) => `${i + 1}. ${a.name} (${a.id})${a.currency ? ' · ' + a.currency : ''}`).join('\n');
      const pick = await Utils.prompt({
        title: 'Výber reklamného účtu',
        message: list,
        placeholder: '1', defaultValue: '1', confirmText: 'Uložiť',
      });
      if (!pick) return;
      const pi = parseInt(pick) - 1;
      if (pi < 0 || pi >= accounts.length) return Utils.toast('Neplatná voľba', 'warning');
      const chosen = accounts[pi];
      await Database.client.from('platform_connections').update({
        account_id: chosen.id, account_name: chosen.name,
        metadata: { currency: chosen.currency, timezone: chosen.timezone, business: chosen.business || null },
      }).eq('id', connId);
      Utils.toast('Účet priradený — spúšťam sync…', 'success');
      await this.syncNow(connId, platform);
    } catch (e) { Utils.toast('Chyba: ' + e.message, 'danger'); }
  },

  async syncNow(connId, platform) {
    const fn = platform === 'google_ads' ? 'google-ads-sync-metrics' : platform === 'meta_ads' ? 'meta-ads-sync-metrics' : null;
    if (!fn) return Utils.toast('Platforma nepodporuje sync', 'warning');
    Utils.toast('Synchronizujem…', 'info');
    try {
      const r = await fetch(`/.netlify/functions/${fn}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      Utils.toast(`Synchronizovaných ${d.synced || 0} kampaní`, 'success');
      this.render(this._container);
    } catch (e) { Utils.toast('Chyba: ' + e.message, 'danger'); }
  },

  async syncAllNow() {
    const eligible = this.connections.filter(c => c.is_active && c.account_id !== 'pending' && (c.platform === 'google_ads' || c.platform === 'meta_ads'));
    if (!eligible.length) return Utils.toast('Žiadne pripojenia na sync.', 'warning');
    Utils.toast(`Synchronizujem ${eligible.length} pripojení…`, 'info');
    let ok = 0, fail = 0;
    for (const c of eligible) {
      try {
        const fn = c.platform === 'google_ads' ? 'google-ads-sync-metrics' : 'meta-ads-sync-metrics';
        const r = await fetch(`/.netlify/functions/${fn}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: c.id }),
        });
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    Utils.toast(`Hotovo: ${ok} úspešných, ${fail} chýb`, fail === 0 ? 'success' : 'warning');
    this.render(this._container);
  },

  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
};

if (typeof window !== 'undefined') {
  window.AdPlatformsModule = AdPlatformsModule;
  if (window.ModuleRegistry?.register) window.ModuleRegistry.register(AdPlatformsModule);
}
