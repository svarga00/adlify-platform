/**
 * Creatives modul — wizard pre tvorbu a editáciu reklám.
 *
 * Route: #creatives?project_id=<uuid>&ad_id=<uuid>
 *
 * UX: jedna reklama na celú obrazovku, vľavo sidebar s navigáciou cez celý
 * projekt (kampaň → ad group → reklamy), hore breadcrumb + tlačidlá
 * Predch/Ďalšia, hlavná oblasť má Notion-like inline edit (klik na text →
 * contenteditable → blur uloží).
 *
 * Polia ktoré sa dajú editovať inline:
 *   - názov reklamy (cez prvý headline ktorý slúži ako label)
 *   - headlines[] (max 30 znakov Google / 40 znakov Meta)
 *   - descriptions[] (max 90 znakov Google / 125 znakov Meta primary)
 *   - call_to_action, final_url, path1, path2
 *   - image_prompt, image_aspect_ratio
 *   - status (pending → uploaded → approved)
 *
 * Image upload zachovaný z pôvodného Kreatívy modal-u (Supabase Storage).
 */
const CreativesModule = {
  id: 'creatives',
  name: 'Kreatívy',
  icon: '🎨',
  title: 'Kreatívy',
  subtitle: 'Tvorba a editácia reklám',
  permissions: ['owner', 'admin', 'manager'],
  // Bez menu — táto stránka je dostupná len cez „Kreatívy & prompty" tlačidlo
  // v project detaile (#projects).

  // state
  projectId: null,
  project: null,
  campaigns: [],          // [{...campaign, ad_groups: [{...ag, ads: [...]}]}]
  flatAds: [],            // poradie reklám pre wizard navigáciu
  currentAdId: null,
  _container: null,

  async render(container, params) {
    this._container = container;
    this.projectId = params.project_id;
    this.currentAdId = params.ad_id || null;

    if (!this.projectId) {
      container.innerHTML = this._renderError('Chýba project_id', 'Otvor kreatívy z projektu cez tlačidlo „🎨 Kreatívy & prompty".');
      return;
    }

    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;">⏳ Načítavam…</div>';

    try {
      await this._loadData();
      if (!this.currentAdId && this.flatAds.length > 0) {
        // Default: prvá Display/Meta reklama (s image promptom) ak existuje,
        // inak prvá v zozname.
        const firstWithImage = this.flatAds.find(a => a.image_prompt);
        this.currentAdId = (firstWithImage || this.flatAds[0])?.id;
      }
      this._renderApp();
    } catch (e) {
      console.error('[creatives] render error:', e);
      container.innerHTML = this._renderError('Chyba pri načítaní', e.message);
    }
  },

  async _loadData() {
    // Project — bez embed-u clients (PostgREST 400 ak FK nie je explicitne
    // pomenovaná). Klienta načítame separátne.
    const { data: project, error: projectErr } = await Database.client
      .from('campaign_projects')
      .select('*')
      .eq('id', this.projectId)
      .maybeSingle();
    if (projectErr) throw new Error('Načítanie projektu zlyhalo: ' + projectErr.message);
    if (!project) throw new Error('Projekt nenájdený (id=' + this.projectId + ')');
    this.project = project;

    if (project.client_id) {
      const { data: clientRow } = await Database.client
        .from('clients')
        .select('id, company_name, website, email')
        .eq('id', project.client_id)
        .maybeSingle();
      this.project.client = clientRow || null;
    }

    // Campaigns
    const { data: campaigns } = await Database.client
      .from('campaigns')
      .select('*')
      .eq('project_id', this.projectId)
      .order('platform').order('created_at');
    this.campaigns = campaigns || [];

    if (this.campaigns.length === 0) {
      this.flatAds = [];
      return;
    }

    // Ad groups
    const campaignIds = this.campaigns.map(c => c.id);
    const { data: adGroups } = await Database.client
      .from('ad_groups')
      .select('*')
      .in('campaign_id', campaignIds)
      .order('created_at');

    const groupIds = (adGroups || []).map(g => g.id);

    // Ads
    const { data: ads } = await Database.client
      .from('ads')
      .select('*')
      .in('ad_group_id', groupIds)
      .order('created_at');

    // Mapuj
    const adsByGroup = new Map();
    for (const ad of (ads || [])) {
      if (!adsByGroup.has(ad.ad_group_id)) adsByGroup.set(ad.ad_group_id, []);
      adsByGroup.get(ad.ad_group_id).push(ad);
    }
    const groupsByCampaign = new Map();
    for (const g of (adGroups || [])) {
      g.ads = adsByGroup.get(g.id) || [];
      if (!groupsByCampaign.has(g.campaign_id)) groupsByCampaign.set(g.campaign_id, []);
      groupsByCampaign.get(g.campaign_id).push(g);
    }
    for (const c of this.campaigns) {
      c.ad_groups = groupsByCampaign.get(c.id) || [];
    }

    // Flat list pre wizard navigáciu — preserved order: kampaň → AG → reklamy
    this.flatAds = [];
    for (const c of this.campaigns) {
      for (const g of c.ad_groups) {
        for (const ad of g.ads) {
          this.flatAds.push({ ...ad, _campaign: c, _adGroup: g });
        }
      }
    }
  },

  _renderApp() {
    const ad = this.flatAds.find(a => a.id === this.currentAdId);
    if (!ad) {
      this._container.innerHTML = this._renderError('Reklama nenájdená', 'Reklama bola možno zmazaná, alebo projekt nemá žiadne reklamy.');
      return;
    }

    const idx = this.flatAds.findIndex(a => a.id === this.currentAdId);
    const prev = this.flatAds[idx - 1];
    const next = this.flatAds[idx + 1];

    this._container.innerHTML = `
      <div class="adl-creatives" style="display:grid;grid-template-columns:280px 1fr;gap:0;height:calc(100vh - 100px);background:#f7f5f1;">
        ${this._renderSidebar(ad)}
        ${this._renderMain(ad, idx, prev, next)}
      </div>
    `;

    this._attachInlineHandlers();
    this._attachKeyboardNav(prev, next);
    if (window.lucide?.createIcons) window.lucide.createIcons();
  },

  _renderSidebar(currentAd) {
    return `
      <aside style="background:#fff;border-right:1px solid #eae6de;overflow-y:auto;padding:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <button onclick="window.location.hash='projects'"
            style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px;"
            title="Späť na projekty">←</button>
          <div style="font-size:13px;font-weight:600;color:#14120e;flex:1;">Kreatívy projektu</div>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:12px;line-height:1.5;">
          ${this._esc(this.project.name)}<br>
          <span style="color:#948b7c;">${this.flatAds.length} reklám</span>
        </div>
        ${this.campaigns.map(c => `
          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;padding:4px 0;">
              ${c.platform === 'google' ? '🔍' : c.platform === 'meta' ? '📘' : '📊'} ${this._esc(c.name)}
            </div>
            ${(c.ad_groups || []).map(g => `
              <div style="margin-left:8px;margin-bottom:6px;">
                <div style="font-size:11px;color:#6b7280;padding:2px 4px;">📁 ${this._esc(g.name)}</div>
                ${(g.ads || []).map(ad => {
                  const isCurrent = ad.id === currentAd.id;
                  const label = (ad.headlines?.[0]) || 'Reklama';
                  const status = ad.image_status;
                  const statusDot = status === 'approved' ? '🟢' : status === 'uploaded' ? '🔵' : status === 'skipped' ? '⚪' : '🟡';
                  const variantChip = ad.variant_label
                    ? `<span style="background:${isCurrent ? 'rgba(255,255,255,0.3)' : '#ede9fe'};color:${isCurrent ? '#fff' : '#6b21a8'};padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:700;margin-right:4px;">${this._esc(ad.variant_label)}</span>`
                    : '';
                  return `
                    <button onclick="CreativesModule.goToAd('${ad.id}')"
                      style="display:block;width:100%;text-align:left;padding:6px 8px;margin:1px 0;border-radius:6px;font-size:12px;border:none;cursor:pointer;
                        background:${isCurrent ? '#FF6B35' : 'transparent'};
                        color:${isCurrent ? '#fff' : '#374151'};">
                      ${statusDot} ${variantChip}${this._esc(label.slice(0, 24))}${label.length > 24 ? '…' : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </aside>
    `;
  },

  _renderMain(ad, idx, prev, next) {
    const c = ad._campaign;
    const g = ad._adGroup;
    const isGoogle = c.platform === 'google';
    const isSearchAd = (c.campaign_type || '').toLowerCase() === 'search';
    const platformIcon = isGoogle ? '🔍 Google' : c.platform === 'meta' ? '📘 Meta' : c.platform;
    const headlineLimit = isGoogle ? 30 : 40;
    const descLimit = isGoogle ? 90 : 125;
    const headlinesArr = Array.isArray(ad.headlines) ? ad.headlines : [];
    const descriptionsArr = Array.isArray(ad.descriptions) ? ad.descriptions : [];
    const kwArr = Array.isArray(g.keywords) ? g.keywords : [];
    const negKwArr = Array.isArray(g.negative_keywords) ? g.negative_keywords : [];

    return `
      <main style="overflow-y:auto;padding:24px 32px;">
        <!-- Breadcrumb + nav -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div style="font-size:13px;color:#6b7280;">
            <span style="color:#14120e;font-weight:600;">${this._esc(this.project.client?.company_name || this.project.name)}</span>
            <span style="color:#d1d5db;margin:0 6px;">›</span>
            ${platformIcon}
            <span style="color:#d1d5db;margin:0 6px;">›</span>
            ${this._esc(c.name)}
            <span style="color:#d1d5db;margin:0 6px;">›</span>
            ${this._esc(g.name)}
            <span style="color:#d1d5db;margin:0 6px;">›</span>
            <strong style="color:#FF6B35;">Reklama ${idx + 1} z ${this.flatAds.length}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button onclick="${prev ? `CreativesModule.goToAd('${prev.id}')` : 'void 0'}"
              ${!prev ? 'disabled' : ''}
              style="padding:8px 14px;background:${prev ? '#fff' : '#f3f4f6'};border:1px solid #eae6de;border-radius:8px;font-size:13px;cursor:${prev ? 'pointer' : 'not-allowed'};color:${prev ? '#374151' : '#9ca3af'};">
              ◄ Predošlá
            </button>
            <button onclick="${next ? `CreativesModule.goToAd('${next.id}')` : 'void 0'}"
              ${!next ? 'disabled' : ''}
              style="padding:8px 14px;background:${next ? '#FF6B35' : '#f3f4f6'};color:${next ? '#fff' : '#9ca3af'};border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:${next ? 'pointer' : 'not-allowed'};">
              Ďalšia ►
            </button>
          </div>
        </div>

        <!-- Status pill -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
          ${this._statusPill(ad.image_status)}
          ${ad.variant_label ? `<span style="background:linear-gradient(135deg,#8b5cf6,#ec4899);color:white;padding:3px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;">🅰 Variant ${this._esc(ad.variant_label)}</span>` : ''}
          ${ad.variant_hook ? `<span style="background:#fafaf8;border:1px solid #eae6de;color:#14120e;padding:3px 12px;border-radius:9999px;font-size:11px;font-weight:500;">Hook: ${this._esc(ad.variant_hook)}</span>` : ''}
          <span style="font-size:12px;color:#6b7280;">${this._esc(c.campaign_type || '')} · daily ${c.budget_daily || 0}€</span>
          <button onclick="CreativesModule.regenerateAd('${ad.id}')"
            style="margin-left:auto;padding:6px 12px;background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
            ✨ Pregenerovať s pripomienkami
          </button>
        </div>

        ${this._renderVariantSwitcher(ad)}

        <!-- HEADLINES -->
        <section style="background:#fff;border:1px solid #eae6de;border-radius:14px;padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 style="margin:0;font-size:14px;font-weight:700;color:#14120e;">📝 Nadpisy <span style="font-weight:400;color:#9ca3af;">(${headlinesArr.length}, max ${headlineLimit} znakov)</span></h3>
            <button onclick="CreativesModule.addHeadline('${ad.id}')"
              style="font-size:12px;padding:4px 10px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;">+ Pridať</button>
          </div>
          <div id="headlines-list" style="display:flex;flex-direction:column;gap:6px;">
            ${headlinesArr.map((h, i) => this._renderEditableLine('headline', ad.id, i, h, headlineLimit)).join('')}
            ${headlinesArr.length === 0 ? '<div style="font-size:12px;color:#9ca3af;font-style:italic;">Žiadne nadpisy. Klikni „+ Pridať".</div>' : ''}
          </div>
        </section>

        <!-- DESCRIPTIONS -->
        <section style="background:#fff;border:1px solid #eae6de;border-radius:14px;padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 style="margin:0;font-size:14px;font-weight:700;color:#14120e;">📄 Texty <span style="font-weight:400;color:#9ca3af;">(${descriptionsArr.length}, max ${descLimit} znakov)</span></h3>
            <button onclick="CreativesModule.addDescription('${ad.id}')"
              style="font-size:12px;padding:4px 10px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;">+ Pridať</button>
          </div>
          <div id="descriptions-list" style="display:flex;flex-direction:column;gap:6px;">
            ${descriptionsArr.map((d, i) => this._renderEditableLine('description', ad.id, i, d, descLimit)).join('')}
            ${descriptionsArr.length === 0 ? '<div style="font-size:12px;color:#9ca3af;font-style:italic;">Žiadne texty. Klikni „+ Pridať".</div>' : ''}
          </div>
        </section>

        <!-- CTA + URL -->
        <section style="background:#fff;border:1px solid #eae6de;border-radius:14px;padding:20px;margin-bottom:16px;">
          <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#14120e;">🔗 URL a CTA</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
              Call to Action
              <input type="text" value="${this._esc(ad.call_to_action || '')}" placeholder="Zavolajte / Objednať / Získať zľavu"
                onchange="CreativesModule.saveField('${ad.id}', 'call_to_action', this.value)"
                style="padding:8px;border:1px solid #eae6de;border-radius:6px;font-size:13px;">
            </label>
            <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
              Final URL
              <input type="url" value="${this._esc(ad.final_url || '')}" placeholder="https://klient.sk/sluzby"
                onchange="CreativesModule.saveField('${ad.id}', 'final_url', this.value)"
                style="padding:8px;border:1px solid #eae6de;border-radius:6px;font-size:13px;">
            </label>
            ${isGoogle ? `
              <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
                Path 1 <span style="color:#9ca3af;">(max 15 znakov, zobrazuje sa za doménou)</span>
                <input type="text" maxlength="15" value="${this._esc(ad.path1 || '')}" placeholder="klima"
                  onchange="CreativesModule.saveField('${ad.id}', 'path1', this.value)"
                  style="padding:8px;border:1px solid #eae6de;border-radius:6px;font-size:13px;">
              </label>
              <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
                Path 2 <span style="color:#9ca3af;">(max 15 znakov)</span>
                <input type="text" maxlength="15" value="${this._esc(ad.path2 || '')}" placeholder="liptov"
                  onchange="CreativesModule.saveField('${ad.id}', 'path2', this.value)"
                  style="padding:8px;border:1px solid #eae6de;border-radius:6px;font-size:13px;">
              </label>
            ` : ''}
          </div>
        </section>

        ${!isSearchAd ? `
        <!-- IMAGE PROMPT + UPLOAD -->
        <section style="background:#fff;border:1px solid #eae6de;border-radius:14px;padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <h3 style="margin:0;font-size:14px;font-weight:700;color:#14120e;">🖼️ Obrázok</h3>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#6b7280;">
              ${ad.image_format ? `<span style="background:#fafaf8;border:1px solid #eae6de;padding:3px 9px;border-radius:9999px;font-weight:600;">${this._esc(ad.image_format)}</span>` : ''}
              <span>Aspect: <strong>${this._esc(ad.image_aspect_ratio || '1:1')}</strong></span>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Image prompt pre Nano Banana 2 / DALL·E / Midjourney / Flux:</div>
            <div contenteditable="true" data-save="image_prompt" data-ad-id="${ad.id}" id="prompt-${ad.id}"
              style="padding:10px 12px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;font-size:12px;font-family:monospace;color:#581c87;min-height:60px;white-space:pre-wrap;cursor:text;"
              placeholder="Photo, modern slovak kitchen, natural light, no text, no logos, --ar 1:1">${this._esc(ad.image_prompt || '')}</div>
            <button onclick="CreativesModule.copyPrompt('${ad.id}', this)"
              style="margin-top:6px;font-size:11px;padding:6px 14px;background:#a855f7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
              📋 Skopírovať prompt
            </button>
          </div>

          ${this._renderTextOverlay(ad)}
          <div style="margin-bottom:12px;padding:10px 14px;background:#fff7ed;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;">
            <div style="font-size:11px;font-weight:700;color:#7c2d12;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">💡 Tip pre úpravy</div>
            <textarea rows="2" placeholder="napr. Color grading: teplé jantárové tóny, kontrast s chladnou modrou..."
              onblur="CreativesModule.saveField('${ad.id}', 'image_style_notes', this.value)"
              style="width:100%;background:white;padding:8px 10px;border-radius:6px;border:1px solid #fed7aa;color:#9a3412;font-size:12px;line-height:1.5;resize:vertical;">${this._esc(ad.image_style_notes || '')}</textarea>
          </div>

          <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:3px;">Formát kreatívy</label>
              <select onchange="CreativesModule.saveField('${ad.id}', 'image_format', this.value)"
                style="width:100%;padding:8px 10px;border:1px solid #eae6de;border-radius:6px;font-size:12px;background:white;">
                <option value="photo" ${ad.image_format === 'photo' ? 'selected' : ''}>📸 Photo (realistická foto)</option>
                <option value="illustration" ${ad.image_format === 'illustration' ? 'selected' : ''}>🎨 Illustration</option>
                <option value="3d_render" ${ad.image_format === '3d_render' ? 'selected' : ''}>🧊 3D render</option>
                <option value="minimal_banner" ${ad.image_format === 'minimal_banner' ? 'selected' : ''}>▭ Minimal banner</option>
                <option value="cinematic" ${ad.image_format === 'cinematic' ? 'selected' : ''}>🎬 Cinematic</option>
                <option value="lifestyle" ${ad.image_format === 'lifestyle' ? 'selected' : ''}>👥 Lifestyle</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:3px;">Aspect ratio</label>
              <select onchange="CreativesModule.saveField('${ad.id}', 'image_aspect_ratio', this.value)"
                style="width:100%;padding:8px 10px;border:1px solid #eae6de;border-radius:6px;font-size:12px;background:white;">
                <option value="1:1" ${ad.image_aspect_ratio === '1:1' ? 'selected' : ''}>⊞ 1:1 (Meta feed)</option>
                <option value="1.91:1" ${ad.image_aspect_ratio === '1.91:1' ? 'selected' : ''}>▭ 1.91:1 (Display banner)</option>
                <option value="4:5" ${ad.image_aspect_ratio === '4:5' ? 'selected' : ''}>▯ 4:5 (Meta vertical)</option>
                <option value="9:16" ${ad.image_aspect_ratio === '9:16' ? 'selected' : ''}>📱 9:16 (IG Story / Reels)</option>
              </select>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
            <button onclick="CreativesModule.regenerateImagePrompt('${ad.id}', this)"
              style="padding:8px 16px;background:linear-gradient(135deg,#8b5cf6,#ec4899);color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
              ✨ Pregenerovať len image prompt (po úprave hooku/farby)
            </button>
          </div>

          ${ad.image_url ? `
            <div style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#f9fafb;border-radius:10px;">
              <img src="${this._esc(ad.image_url)}" style="width:160px;height:160px;object-fit:cover;border-radius:8px;border:1px solid #eae6de;" onerror="this.style.display='none';">
              <div style="flex:1;font-size:12px;">
                <div style="color:#6b7280;margin-bottom:8px;word-break:break-all;">${this._esc(ad.image_url)}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <label style="padding:6px 12px;background:#fff;border:1px solid #eae6de;border-radius:6px;font-size:12px;cursor:pointer;">
                    🔄 Zmeniť obrázok
                    <input type="file" accept="image/*" class="hidden" style="display:none;"
                      onchange="CreativesModule.uploadImage('${ad.id}', this.files[0]);">
                  </label>
                  ${ad.image_status !== 'approved' ? `
                    <button onclick="CreativesModule.approveImage('${ad.id}')"
                      style="padding:6px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
                      ✓ Schváliť obrázok
                    </button>
                  ` : ''}
                  <a href="${this._esc(ad.image_url)}" target="_blank"
                    style="padding:6px 12px;background:#fff;border:1px solid #eae6de;border-radius:6px;font-size:12px;text-decoration:none;color:#3b82f6;">
                    Plný náhľad ↗
                  </a>
                </div>
              </div>
            </div>
          ` : `
            <label id="upload-zone" style="display:block;text-align:center;padding:32px;border:2px dashed #d1d5db;border-radius:10px;cursor:pointer;color:#6b7280;"
              ondragover="event.preventDefault(); this.style.borderColor='#FF6B35'; this.style.background='#fff7ed';"
              ondragleave="this.style.borderColor='#d1d5db'; this.style.background='transparent';"
              ondrop="event.preventDefault(); this.style.borderColor='#d1d5db'; this.style.background='transparent'; CreativesModule.uploadImage('${ad.id}', event.dataTransfer.files[0]);">
              <div style="font-size:32px;margin-bottom:6px;">📤</div>
              <div style="font-size:13px;font-weight:600;color:#14120e;">Nahrať obrázok</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Klik alebo drag-drop · max 10 MB · JPG/PNG/WebP</div>
              <input type="file" accept="image/*" style="display:none;"
                onchange="CreativesModule.uploadImage('${ad.id}', this.files[0]);">
            </label>
          `}
        </section>
        ` : `
          <div style="background:#f9fafb;border:1px dashed #e5e7eb;border-radius:10px;padding:14px;font-size:12px;color:#6b7280;text-align:center;margin-bottom:16px;">
            ℹ️ Search reklama — bez obrázka
          </div>
        `}

        <!-- AD GROUP context: keywords (read-only here, edit cez kampaň detail) -->
        <section style="background:#fff;border:1px solid #eae6de;border-radius:14px;padding:20px;margin-bottom:16px;">
          <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#14120e;">🎯 Kontext ad groupy <span style="font-weight:400;color:#9ca3af;">(${this._esc(g.name)})</span></h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div>
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Kľúčové slová (${kwArr.length})</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${kwArr.length ? kwArr.map(k => `<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:9999px;font-size:11px;">${this._esc(k)}</span>`).join('') : '<span style="color:#9ca3af;font-size:12px;">žiadne</span>'}
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Negatívne KW (${negKwArr.length})</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${negKwArr.length ? negKwArr.slice(0, 12).map(k => `<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:9999px;font-size:11px;">${this._esc(k)}</span>`).join('') + (negKwArr.length > 12 ? `<span style="font-size:11px;color:#9ca3af;">+${negKwArr.length - 12}</span>` : '') : '<span style="color:#9ca3af;font-size:12px;">žiadne</span>'}
              </div>
            </div>
          </div>
        </section>

        <!-- Spodná navigácia -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-top:1px solid #eae6de;">
          <div style="font-size:12px;color:#6b7280;">💡 ← / → klávesy = navigácia · Tab/Enter v poli = uloženie</div>
          <div style="display:flex;gap:8px;">
            <button onclick="${prev ? `CreativesModule.goToAd('${prev.id}')` : 'void 0'}" ${!prev ? 'disabled' : ''}
              style="padding:10px 18px;background:${prev ? '#fff' : '#f3f4f6'};border:1px solid #eae6de;border-radius:8px;font-size:13px;cursor:${prev ? 'pointer' : 'not-allowed'};color:${prev ? '#374151' : '#9ca3af'};">◄ Predošlá</button>
            <button onclick="${next ? `CreativesModule.goToAd('${next.id}')` : 'void 0'}" ${!next ? 'disabled' : ''}
              style="padding:10px 18px;background:${next ? '#FF6B35' : '#f3f4f6'};color:${next ? '#fff' : '#9ca3af'};border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:${next ? 'pointer' : 'not-allowed'};">Ďalšia ►</button>
          </div>
        </div>
      </main>
    `;
  },

  _renderEditableLine(kind, adId, idx, value, limit) {
    const safe = this._esc(value);
    const tooLong = value.length > limit;
    return `
      <div style="display:flex;align-items:center;gap:8px;">
        <div contenteditable="true" data-save="${kind}" data-ad-id="${adId}" data-idx="${idx}" data-limit="${limit}"
          style="flex:1;padding:8px 12px;background:#f9fafb;border:1px solid ${tooLong ? '#ef4444' : '#eae6de'};border-radius:8px;font-size:13px;cursor:text;min-height:24px;"
          oninput="CreativesModule.updateCounter(this)">${safe}</div>
        <span class="char-counter" style="font-size:11px;min-width:48px;text-align:right;color:${tooLong ? '#ef4444' : '#9ca3af'};">${value.length}/${limit}</span>
        <button onclick="CreativesModule.removeLine('${kind}', '${adId}', ${idx})"
          style="padding:4px 8px;background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;" title="Zmazať">✕</button>
      </div>
    `;
  },

  // Variant switcher — ak má reklama variant_group_id, zobrazí tlačidlá pre
  // rýchle prepínanie medzi A / B / C variantmi v tej istej ad group.
  _renderVariantSwitcher(currentAd) {
    if (!currentAd.variant_group_id) return '';
    const siblings = this.flatAds
      .filter(a => a.variant_group_id === currentAd.variant_group_id)
      .sort((a, b) => (a.variant_label || '').localeCompare(b.variant_label || ''));
    if (siblings.length < 2) return '';
    return `
      <div style="background:linear-gradient(135deg,#faf5ff,#fdf2f8);border:1px solid #e9d5ff;border-radius:14px;padding:14px 18px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="font-size:11px;font-weight:700;color:#6b21a8;text-transform:uppercase;letter-spacing:1.2px;">A/B test — ${siblings.length} varianty</div>
          <div style="display:flex;gap:6px;">
            ${siblings.map(s => `
              <button onclick="CreativesModule.goToAd('${s.id}')"
                style="padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;
                  background:${s.id === currentAd.id ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : 'white'};
                  color:${s.id === currentAd.id ? 'white' : '#6b21a8'};
                  border:1px solid ${s.id === currentAd.id ? 'transparent' : '#e9d5ff'};">
                Variant ${this._esc(s.variant_label || '?')}
                ${s.variant_hook ? `<span style="opacity:0.8;font-weight:500;margin-left:4px;">· ${this._esc(s.variant_hook.slice(0, 24))}</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _statusPill(status) {
    const map = {
      pending:  { bg: '#fef3c7', color: '#92400e', label: '⏳ Čaká na obrázok' },
      uploaded: { bg: '#dbeafe', color: '#1e40af', label: '📤 Obrázok nahraný' },
      approved: { bg: '#dcfce7', color: '#166534', label: '✓ Schválené' },
      skipped:  { bg: '#f3f4f6', color: '#6b7280', label: '— Search ad (bez obrázka)' },
    };
    const s = map[status] || map.pending;
    return `<span style="background:${s.bg};color:${s.color};padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;">${s.label}</span>`;
  },

  _attachInlineHandlers() {
    document.querySelectorAll('[contenteditable="true"][data-save]').forEach(el => {
      el.addEventListener('blur', () => this._handleBlur(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          el.blur();
        }
      });
    });
  },

  updateCounter(el) {
    const limit = parseInt(el.dataset.limit) || 30;
    const len = el.innerText.length;
    const counter = el.parentElement.querySelector('.char-counter');
    if (counter) {
      counter.textContent = `${len}/${limit}`;
      counter.style.color = len > limit ? '#ef4444' : '#9ca3af';
    }
    el.style.borderColor = len > limit ? '#ef4444' : '#eae6de';
  },

  async _handleBlur(el) {
    const kind = el.dataset.save;
    const adId = el.dataset.adId;
    const text = el.innerText.trim();
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;

    if (kind === 'headline' || kind === 'description') {
      const idx = parseInt(el.dataset.idx);
      const field = kind === 'headline' ? 'headlines' : 'descriptions';
      const arr = [...(ad[field] || [])];
      if (arr[idx] === text) return;  // bez zmeny
      arr[idx] = text;
      await this._save(adId, { [field]: arr });
    } else if (kind === 'image_prompt') {
      if (ad.image_prompt === text) return;
      await this._save(adId, { image_prompt: text });
    }
  },

  async _save(adId, patch) {
    try {
      const { error } = await Database.client
        .from('ads')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', adId);
      if (error) throw error;
      Object.assign(this.flatAds.find(a => a.id === adId) || {}, patch);
      Utils.toast('Uložené', 'success');
    } catch (e) {
      console.error('Save error:', e);
      Utils.toast('Chyba ukladania: ' + e.message, 'error');
    }
  },

  async saveField(adId, field, value) {
    await this._save(adId, { [field]: value });
  },

  // Save nested pole v image_text_overlay JSONB (headline/cta/position/color)
  async saveOverlayField(adId, key, value) {
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;
    const overlay = { ...(ad.image_text_overlay || {}) };
    overlay[key] = value || null;
    await this._save(adId, { image_text_overlay: overlay });
  },

  // Micro-regenerate — pošle aktuálny stav reklamy (headline/desc/overlay/format/
  // brand farby) AI a získa nový image_prompt + image_style_notes. Žiadne Claude
  // calls pre strategy/google/meta — len 1 short call (~300 tokens output).
  // Cena ~$0.01 per reklama vs ~$0.50 za celý projekt.
  async regenerateImagePrompt(adId, btn) {
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Generujem...';
    try {
      const r = await fetch('/.netlify/functions/regenerate-ad-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: adId, project_id: this.projectId }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Generate failed');
      Object.assign(ad, {
        image_prompt: data.image_prompt,
        image_style_notes: data.image_style_notes || ad.image_style_notes,
      });
      this._renderApp();
      Utils.toast('✓ Image prompt regenerovaný', 'success');
    } catch (e) {
      console.error('regenerateImagePrompt:', e);
      Utils.toast('Chyba: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  },

  async addHeadline(adId) {
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;
    const arr = [...(ad.headlines || []), ''];
    await this._save(adId, { headlines: arr });
    this._renderApp();
  },

  async addDescription(adId) {
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;
    const arr = [...(ad.descriptions || []), ''];
    await this._save(adId, { descriptions: arr });
    this._renderApp();
  },

  async removeLine(kind, adId, idx) {
    const ad = this.flatAds.find(a => a.id === adId);
    if (!ad) return;
    const field = kind === 'headline' ? 'headlines' : 'descriptions';
    const arr = [...(ad[field] || [])];
    arr.splice(idx, 1);
    await this._save(adId, { [field]: arr });
    this._renderApp();
  },

  async uploadImage(adId, file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return Utils.toast('Iba obrázky', 'warning');
    if (file.size > 10 * 1024 * 1024) return Utils.toast('Max 10 MB', 'warning');

    Utils.toast('⏳ Nahrávam…', 'info');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
      const path = `ad-creatives/${this.projectId}/${adId}-${Date.now()}.${ext}`;
      const { error: upErr } = await Database.client.storage
        .from('assets')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message?.includes('Bucket') ? 'Bucket "assets" neexistuje v Supabase Storage' : upErr.message);
      const { data: urlData } = Database.client.storage.from('assets').getPublicUrl(path);
      await this._save(adId, { image_url: urlData.publicUrl, image_status: 'uploaded' });
      this._renderApp();
    } catch (e) {
      Utils.toast('Upload zlyhal: ' + e.message, 'error');
    }
  },

  // Renderuje text overlay info — AI navrhne headline/CTA ktoré sa pridá
  // NA obrázok ako overlay (cez Canvas/Figma/Photoshop pri post-processingu).
  // Obrázok samotný nemá text (Nano Banana generuje "no text in image").
  _renderTextOverlay(ad) {
    const overlay = ad.image_text_overlay || {};
    return `
      <div style="margin-bottom:12px;padding:14px 16px;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #a7f3d0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">✨ Text overlay (na obrázok)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
          <div>
            <label style="display:block;color:#065f46;font-weight:600;font-size:11px;margin-bottom:3px;">Hook (headline)</label>
            <input type="text" value="${this._esc(overlay.headline || '')}" placeholder="napr. Bezpečný zámok — dnes"
              onblur="CreativesModule.saveOverlayField('${ad.id}', 'headline', this.value)"
              style="width:100%;background:white;padding:8px 12px;border-radius:6px;border:1px solid #d1fae5;color:#14120e;font-weight:600;font-size:13px;">
          </div>
          <div>
            <label style="display:block;color:#065f46;font-weight:600;font-size:11px;margin-bottom:3px;">CTA</label>
            <input type="text" value="${this._esc(overlay.cta || '')}" placeholder="napr. Zavolajte"
              onblur="CreativesModule.saveOverlayField('${ad.id}', 'cta', this.value)"
              style="width:100%;background:white;padding:8px 12px;border-radius:6px;border:1px solid #d1fae5;color:#14120e;font-weight:600;font-size:13px;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;color:#065f46;">
          <div>
            <label style="display:block;font-weight:600;margin-bottom:3px;">Pozícia</label>
            <select onchange="CreativesModule.saveOverlayField('${ad.id}', 'position', this.value)"
              style="width:100%;background:white;padding:7px 10px;border-radius:6px;border:1px solid #d1fae5;color:#14120e;font-size:12px;">
              <option value="">— vyber —</option>
              <option value="top-left" ${overlay.position === 'top-left' ? 'selected' : ''}>↖ vľavo hore</option>
              <option value="top-right" ${overlay.position === 'top-right' ? 'selected' : ''}>↗ vpravo hore</option>
              <option value="bottom-left" ${overlay.position === 'bottom-left' ? 'selected' : ''}>↙ vľavo dole</option>
              <option value="bottom-right" ${overlay.position === 'bottom-right' ? 'selected' : ''}>↘ vpravo dole</option>
              <option value="center" ${overlay.position === 'center' ? 'selected' : ''}>⊕ stred</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:3px;">Farba textu</label>
            <select onchange="CreativesModule.saveOverlayField('${ad.id}', 'color', this.value)"
              style="width:100%;background:white;padding:7px 10px;border-radius:6px;border:1px solid #d1fae5;color:#14120e;font-size:12px;">
              <option value="">— vyber —</option>
              <option value="white" ${overlay.color === 'white' ? 'selected' : ''}>⚪ biela</option>
              <option value="dark" ${overlay.color === 'dark' ? 'selected' : ''}>⚫ tmavá</option>
              <option value="brand" ${overlay.color === 'brand' ? 'selected' : ''}>🟠 brand (primary)</option>
            </select>
          </div>
        </div>
      </div>
    `;
  },

  // Kopíruje image prompt do clipboardu — robí to z DOM elementu (nie z
  // JS escape stringu), takže funguje aj keď prompt obsahuje úvodzovky,
  // newlines a špeciálne znaky. Fallback na document.execCommand pre staršie
  // browsery alebo non-HTTPS kontexty kde navigator.clipboard nie je dostupný.
  async copyPrompt(adId, btn) {
    const el = document.getElementById(`prompt-${adId}`);
    if (!el) return Utils.toast('Prompt nenájdený', 'error');
    const text = el.innerText.trim();
    if (!text) return Utils.toast('Prompt je prázdny', 'warning');

    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        // Fallback: dočasný textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch (e) {
      console.error('copyPrompt:', e);
    }

    if (ok) {
      Utils.toast('✓ Prompt skopírovaný — vlož do Nano Banana 2', 'success');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Skopírované';
        btn.style.background = '#16a34a';
        setTimeout(() => { btn.textContent = orig; btn.style.background = '#a855f7'; }, 1500);
      }
    } else {
      Utils.toast('Skopírovanie zlyhalo — vyber text manuálne a Ctrl+C', 'error');
    }
  },

  async approveImage(adId) {
    await this._save(adId, { image_status: 'approved' });
    this._renderApp();
  },

  goToAd(adId) {
    this.currentAdId = adId;
    Router.navigate('creatives', { project_id: this.projectId, ad_id: adId });
  },

  _attachKeyboardNav(prev, next) {
    // Ku prepínaniu medzi reklamami klávesnicou. Odregistruj predošlý handler
    // (re-render volá _renderApp viackrát).
    if (this._kbdHandler) document.removeEventListener('keydown', this._kbdHandler);
    this._kbdHandler = (e) => {
      // Ignoruj v inputoch / contenteditable
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft' && prev) this.goToAd(prev.id);
      else if (e.key === 'ArrowRight' && next) this.goToAd(next.id);
    };
    document.addEventListener('keydown', this._kbdHandler);
  },

  async regenerateAd(adId) {
    const feedback = window.prompt('Napíš čo zmeniť v tejto reklame:\n\n(napr. „Daj viac dôraz na cenu", „Zmeň CTA na Zavolajte hneď", „Headlines nech sú emotívnejšie")');
    if (!feedback?.trim()) return;
    Utils.toast('⏳ Pregenerovanie jednej reklamy ešte nie je implementované — pošli pripomienky cez celý projekt (Pregenerovať s pripomienkami v stave Kontrola).', 'info');
    // TODO: pridať netlify fn ktorá pregeneruje len jednu reklamu — short-form
    // prompt na úrovni reklamy bez celého strategy + research overhead.
  },

  destroy() {
    if (this._kbdHandler) {
      document.removeEventListener('keydown', this._kbdHandler);
      this._kbdHandler = null;
    }
  },

  _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  _renderError(title, message) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h2 style="font-size:20px;font-weight:600;margin-bottom:8px;">${this._esc(title)}</h2>
        <p style="color:#6b7280;max-width:480px;margin:0 0 20px;">${this._esc(message)}</p>
        <a href="#projects" style="padding:10px 20px;background:#FF6B35;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">← Späť na projekty</a>
      </div>
    `;
  },
};

if (typeof window !== 'undefined') {
  window.CreativesModule = CreativesModule;
  if (window.ModuleRegistry?.register) window.ModuleRegistry.register(CreativesModule);
  // Router registration — modul je dostupný cez #creatives?project_id=X&ad_id=Y
  if (window.Router?.register) window.Router.register('creatives', CreativesModule);
}
