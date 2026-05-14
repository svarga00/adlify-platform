/**
 * ADLIFY OUTREACH — FB Groups Extension v1.0
 *
 * Rozširuje OutreachModule o novú "view" pre evidenciu FB skupín
 * kde publikujeme ponuky práce / outreach.
 *
 * Inštalácia:
 *  - Pridať <script src="../modules/outreach/fb-groups.js"></script>
 *    za outreach.js v admin/index.html
 *  - outreach.js musí zavolať OutreachModule.renderFbGroups() / openFbGroups()
 *    pre rozšírené view (vid hook v template())
 *
 * Bookmarklet pattern:
 *  1. User pretiahne JS link do záložiek
 *  2. Na FB skupine klikne → bookmarklet vyčíta DOM (URL, názov, members, image)
 *  3. window.open('/admin/#outreach?view=fb-groups&action=import&...') v novom tabe
 *  4. Adlify tab (Supabase JWT v localStorage) ukáže confirm modal
 *  5. User submit → upsert do `outreach_groups` (revive ak soft-deleted)
 *
 * Riešené FB CSP: window.open obchádza connect-src. Bookmarklet zdroj je
 * v samostatnom súbore `fb-groups-bookmarklet.js`, encoduje sa cez
 * encodeURIComponent celý IIFE — žiadne PHP-heredoc-style escape problémy.
 */

(function () {
  'use strict';

  if (!window.OutreachModule) {
    console.warn('⚠️ OutreachModule not found — fb-groups.js cannot initialize');
    return;
  }

  const OM = window.OutreachModule;

  /* ============================================================
     STATE
     ============================================================ */
  OM.fbGroups = [];
  OM.fbGroupsLoaded = false;
  OM._bookmarkletSrc = null;

  /* ============================================================
     PUBLIC ACTIONS — volané z toolbar tlačidla
     ============================================================ */

  OM.openFbGroups = async function () {
    this.currentView = 'fb-groups';
    if (!this.fbGroupsLoaded) {
      try {
        await this.loadFbGroups();
      } catch (e) {
        console.error('Load fb groups error:', e);
      }
    }
    this.rerender();
  };

  OM.loadFbGroups = async function () {
    const { data, error } = await Database.client
      .from('outreach_groups')
      .select('*')
      .is('deleted_at', null)
      .order('member_count', { ascending: false, nullsLast: true });
    if (error) throw error;
    this.fbGroups = data || [];
    this.fbGroupsLoaded = true;
  };

  /* ============================================================
     RENDER
     ============================================================ */

  OM.renderFbGroups = function () {
    const total = this.fbGroups.length;
    const active = this.fbGroups.filter((g) => g.is_active).length;
    const totalMembers = this.fbGroups.reduce(
      (s, g) => s + (g.member_count || 0),
      0
    );

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          ${this._renderFbStat(total, 'Skupín celkom')}
          ${this._renderFbStat(active, 'Aktívnych')}
          ${this._renderFbStat(this._fmtNum(totalMembers), 'Členov celkom')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openFbBookmarkletModal()">${OM._fbIcon('bookmark')} Bookmarklet</button>
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.openFbGroupImport({})">${OM._fbIcon('plus')} Pridať ručne</button>
        </div>
      </div>

      ${total === 0 ? this._renderFbEmpty() : this._renderFbTable()}
    `;
  };

  OM._renderFbStat = function (value, label) {
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:14px;padding:14px 20px;text-align:center;min-width:120px;">
        <div style="font-size:22px;font-weight:700;color:#14120E;letter-spacing:-0.4px;">${value}</div>
        <div style="font-size:11px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-top:2px;">${label}</div>
      </div>
    `;
  };

  OM._renderFbEmpty = function () {
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;padding:60px 24px;text-align:center;">
        <div style="font-size:42px;margin-bottom:12px;">📢</div>
        <h3 style="font-size:18px;font-weight:600;color:#14120E;margin:0 0 8px;">Žiadne skupiny</h3>
        <p style="color:#6F6758;margin-bottom:20px;">Pridaj prvú FB skupinu bookmarkletom alebo ručne.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="adl-btn adl-btn-primary" onclick="OutreachModule.openFbBookmarkletModal()">${OM._fbIcon('bookmark')} Inštalovať bookmarklet</button>
          <button class="adl-btn adl-btn-outline" onclick="OutreachModule.openFbGroupImport({})">${OM._fbIcon('plus')} Pridať ručne</button>
        </div>
      </div>
    `;
  };

  OM._renderFbTable = function () {
    return `
      <div style="background:#fff;border:1px solid #EAE6DE;border-radius:16px;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead style="background:#F7F5F1;">
              <tr>
                <th style="padding:12px 16px;text-align:left;width:56px;"></th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Skupina</th>
                <th style="padding:12px 16px;text-align:right;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Členovia</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Kategória</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Stav</th>
                <th style="padding:12px 16px;text-align:left;font-weight:600;color:#6F6758;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Pridané</th>
                <th style="padding:12px 16px;text-align:right;width:96px;"></th>
              </tr>
            </thead>
            <tbody>
              ${this.fbGroups.map((g) => OM._renderFbRow(g)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  OM._renderFbRow = function (g) {
    const esc = OM._esc;
    const safeName = esc(g.name || '(bez názvu)');
    const safeUrl = esc(g.url || '');
    const date = g.created_at
      ? new Date(g.created_at).toLocaleDateString('sk-SK')
      : '–';
    const avatar = g.image_url
      ? `<img src="${esc(g.image_url)}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const fallback = `<div style="${g.image_url ? 'display:none;' : ''}width:40px;height:40px;border-radius:8px;background:#F1EEE8;display:flex;align-items:center;justify-content:center;font-size:18px;color:#948B7C;">${OM._fbIcon('users', 20)}</div>`;
    const statusCls = g.is_active
      ? 'background:#D6EFDE;color:#1F6E3D;'
      : 'background:#F1EEE8;color:#948B7C;';
    const statusTxt = g.is_active ? 'Aktívna' : 'Neaktívna';

    return `
      <tr style="border-bottom:1px solid #F1EEE8;">
        <td style="padding:10px 16px;">${avatar}${fallback}</td>
        <td style="padding:10px 16px;">
          <a href="${safeUrl}" target="_blank" rel="noopener" style="color:#14120E;font-weight:500;text-decoration:none;">${safeName}</a>
          ${g.description ? `<div style="font-size:12px;color:#948B7C;margin-top:2px;">${esc(g.description.substring(0, 80))}${g.description.length > 80 ? '…' : ''}</div>` : ''}
        </td>
        <td style="padding:10px 16px;text-align:right;color:#524C3F;font-variant-numeric:tabular-nums;">${g.member_count ? OM._fmtNum(g.member_count) : '–'}</td>
        <td style="padding:10px 16px;">${g.category ? `<span style="background:#F1EEE8;padding:2px 8px;border-radius:6px;font-size:12px;color:#524C3F;">${esc(g.category)}</span>` : '–'}</td>
        <td style="padding:10px 16px;"><span style="padding:3px 8px;border-radius:6px;font-size:12px;font-weight:500;${statusCls}">${statusTxt}</span></td>
        <td style="padding:10px 16px;color:#948B7C;font-size:13px;">${date}</td>
        <td style="padding:10px 16px;text-align:right;white-space:nowrap;">
          <button onclick="OutreachModule.openFbEditModal('${g.id}')" title="Upraviť" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;color:#6F6758;">${OM._fbIcon('edit')}</button>
          <button onclick="OutreachModule.confirmFbDelete('${g.id}')" title="Zmazať" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;color:#DC3C3C;">${OM._fbIcon('trash')}</button>
        </td>
      </tr>
    `;
  };

  /* ============================================================
     BOOKMARKLET MODAL
     ============================================================ */

  OM.openFbBookmarkletModal = async function () {
    const src = await OM._fetchBookmarkletSrc();
    if (!src) return;

    const origin = window.location.origin;
    const importBase = `${origin}/admin/#outreach?view=fb-groups&action=import`;
    const normalHref =
      'javascript:' +
      encodeURIComponent(
        src
          .replaceAll('__IMPORT_BASE_URL__', importBase)
          .replaceAll('__DEBUG__', 'false')
      );
    const debugHref =
      'javascript:' +
      encodeURIComponent(
        src
          .replaceAll('__IMPORT_BASE_URL__', importBase)
          .replaceAll('__DEBUG__', 'true')
      );
    const rawSrc = src
      .replaceAll('__IMPORT_BASE_URL__', importBase)
      .replaceAll('__DEBUG__', 'false');

    const consoleHelper =
      'console.log({url:location.href,title:document.title,' +
      "ogTitle:document.querySelector('meta[property=\\'og:title\\']')?.content," +
      "members:[...document.querySelectorAll('a[href*=\\'/members/\\']')]" +
      '.map(a=>a.innerText).join(" | ")});';

    OM._openFbModal(
      'FB Bookmarklet · inštalácia',
      `
        <p style="color:#524C3F;font-size:14px;line-height:1.55;margin:0 0 18px;">
          <strong>Pretiahni</strong> tlačidlo nižšie do záložiek prehliadača.
          Potom na ľubovoľnej FB stránke skupiny naň klikni — Adlify sa
          otvorí s predvyplneným formulárom.
        </p>

        <div style="display:flex;gap:12px;flex-wrap:wrap;padding:20px;background:#F7F5F1;border:2px dashed #EAE6DE;border-radius:12px;align-items:center;justify-content:center;margin-bottom:20px;">
          <a href="${normalHref}" draggable="true" onclick="return false"
             style="display:inline-flex;align-items:center;padding:11px 22px;border-radius:10px;font-size:15px;font-weight:600;cursor:grab;text-decoration:none;background:linear-gradient(135deg,#F97316,#EA580C);color:#fff;box-shadow:0 4px 14px rgba(249,115,22,0.35);user-select:none;"
             title="Pretiahni ma do záložiek">
            ${OM._fbIcon('plus', 16)} Pridať FB skupinu do Adlify
          </a>
          <a href="${debugHref}" draggable="true" onclick="return false"
             style="display:inline-flex;align-items:center;padding:11px 22px;border-radius:10px;font-size:15px;font-weight:600;cursor:grab;text-decoration:none;background:linear-gradient(135deg,#F59E0B,#D89418);color:#fff;box-shadow:0 4px 14px rgba(245,158,11,0.3);user-select:none;"
             title="DEBUG — pred otvorením ukáže čo sa našlo">
            ${OM._fbIcon('search', 16)} DEBUG verzia
          </a>
        </div>

        <ol style="margin:0 0 18px;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:8px;">
          ${[
            'Pretiahni oranžové tlačidlo do lišty záložiek',
            'Otvor ľubovoľnú FB stránku skupiny',
            'Klikni na záložku „Pridať FB skupinu do Adlify"',
            'Skontroluj údaje a potvrď'
          ]
            .map(
              (t, i) => `
            <li style="display:flex;align-items:center;gap:10px;font-size:14px;color:#3A352B;">
              <span style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#F97316,#EA580C);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
              ${t}
            </li>`
            )
            .join('')}
        </ol>

        <details style="font-size:13px;color:#6F6758;margin-bottom:12px;">
          <summary style="cursor:pointer;padding:4px 0;">Zobraziť zdrojový kód bookmarkletu</summary>
          <textarea readonly style="width:100%;height:120px;font-family:'JetBrains Mono',monospace;font-size:11px;padding:8px;border:1px solid #EAE6DE;border-radius:6px;resize:vertical;margin-top:8px;box-sizing:border-box;">${OM._esc(rawSrc)}</textarea>
        </details>

        <details style="font-size:13px;color:#6F6758;">
          <summary style="cursor:pointer;padding:4px 0;">Troubleshooting · diagnostika v DevTools</summary>
          <p style="margin:8px 0 6px;color:#3A352B;">Ak bookmarklet nefunguje, vlož tento kód do DevTools Console na stránke skupiny a pošli mi výstup:</p>
          <textarea readonly style="width:100%;height:80px;font-family:'JetBrains Mono',monospace;font-size:11px;padding:8px;border:1px solid #EAE6DE;border-radius:6px;resize:vertical;box-sizing:border-box;">${consoleHelper}</textarea>
        </details>
      `
    );
  };

  OM._fetchBookmarkletSrc = async function () {
    if (OM._bookmarkletSrc) return OM._bookmarkletSrc;
    try {
      const res = await fetch('/modules/outreach/fb-groups-bookmarklet.js');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      OM._bookmarkletSrc = await res.text();
      return OM._bookmarkletSrc;
    } catch (e) {
      alert('Chyba pri načítaní bookmarkletu: ' + e.message);
      return null;
    }
  };

  /* ============================================================
     IMPORT / EDIT CONFIRM MODAL
     ============================================================ */

  OM.openFbGroupImport = async function (data) {
    let existing = null;
    if (data && data.url) {
      const { data: row } = await Database.client
        .from('outreach_groups')
        .select('*')
        .eq('url', data.url)
        .maybeSingle();
      existing = row || null;
    }

    const isUpdate = !!existing;
    const prefill = existing || {};
    const initial = {
      url: data.url || prefill.url || '',
      name: data.name || prefill.name || '',
      member_count: data.members || prefill.member_count || '',
      image_url: data.image || prefill.image_url || '',
      category: prefill.category || '',
      description: prefill.description || ''
    };
    const previewImg = initial.image_url;

    const formId = 'fb-import-form';

    OM._openFbModal(
      isUpdate ? 'Aktualizovať skupinu' : 'Pridať FB skupinu',
      `
        <form id="${formId}" style="display:flex;flex-direction:column;gap:14px;">
          ${isUpdate ? `
            <div style="background:#FBE7C0;border:1px solid #F4D58D;color:#7A4A0E;padding:10px 14px;border-radius:8px;font-size:13px;">
              ${OM._fbIcon('warning', 14)} Skupina s touto URL už existuje${existing.deleted_at ? ' (bola zmazaná)' : ''}. Pôvodné údaje budú prepísané.
            </div>` : ''}

          ${previewImg ? `
            <div style="border-radius:10px;overflow:hidden;max-height:180px;">
              <img src="${OM._esc(previewImg)}" alt="cover" style="width:100%;max-height:180px;object-fit:cover;display:block;" onerror="this.parentElement.style.display='none'">
            </div>` : ''}

          ${OM._fbField('URL skupiny', `<input type="url" name="url" value="${OM._esc(initial.url)}" readonly style="${OM._fbInputStyle()}background:#F7F5F1;color:#524C3F;cursor:default;">`)}
          ${OM._fbField('Názov skupiny <span style="color:#DC3C3C">*</span>', `<input type="text" name="name" value="${OM._esc(initial.name)}" required placeholder="Názov skupiny" style="${OM._fbInputStyle()}">`)}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${OM._fbField('Počet členov', `<input type="number" name="member_count" value="${OM._esc(initial.member_count)}" placeholder="napr. 15000" style="${OM._fbInputStyle()}">`)}
            ${OM._fbField('Kategória', `<input type="text" name="category" value="${OM._esc(initial.category)}" placeholder="napr. Práca SK" style="${OM._fbInputStyle()}">`)}
          </div>

          ${OM._fbField('URL obrázka (cover)', `<input type="url" name="image_url" value="${OM._esc(initial.image_url)}" placeholder="https://..." style="${OM._fbInputStyle()}">`)}
          ${OM._fbField('Popis (voliteľné)', `<textarea name="description" rows="3" placeholder="Krátky popis skupiny..." style="${OM._fbInputStyle()}resize:vertical;min-height:70px;">${OM._esc(initial.description)}</textarea>`)}

          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:4px;">
            <button type="button" class="adl-btn adl-btn-outline" data-fb-cancel>Zrušiť</button>
            <button type="submit" class="adl-btn adl-btn-primary">
              ${isUpdate ? OM._fbIcon('refresh', 14) + ' Aktualizovať skupinu' : OM._fbIcon('plus', 14) + ' Pridať skupinu'}
            </button>
          </div>
        </form>
      `,
      (modalEl) => {
        modalEl.querySelector('[data-fb-cancel]').addEventListener('click', () => modalEl.remove());
        const form = modalEl.querySelector('#' + formId);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const payload = {
            url: fd.get('url'),
            name: fd.get('name'),
            member_count: fd.get('member_count') ? parseInt(fd.get('member_count')) : null,
            category: fd.get('category') || null,
            image_url: fd.get('image_url') || null,
            description: fd.get('description') || null
          };
          const btn = form.querySelector('[type=submit]');
          btn.disabled = true;
          btn.textContent = 'Ukladám…';
          try {
            await OM.upsertFbGroup(payload, existing);
            modalEl.remove();
            await OM.loadFbGroups();
            OM._cleanFbImportFromUrl();
            OM.rerender();
            OM._toast(isUpdate ? 'Skupina aktualizovaná' : 'Skupina pridaná', 'ok');
          } catch (err) {
            btn.disabled = false;
            btn.textContent = isUpdate ? 'Aktualizovať skupinu' : 'Pridať skupinu';
            OM._toast('Chyba: ' + err.message, 'err');
          }
        });
      }
    );
  };

  OM.upsertFbGroup = async function (payload, existing) {
    const orgId = Auth.getOrgId();

    if (!existing && payload.url) {
      const { data: row } = await Database.client
        .from('outreach_groups')
        .select('*')
        .eq('url', payload.url)
        .maybeSingle();
      existing = row || null;
    }

    if (existing) {
      const { error } = await Database.client
        .from('outreach_groups')
        .update({
          name: payload.name,
          member_count: payload.member_count,
          image_url: payload.image_url,
          category: payload.category,
          description: payload.description,
          is_active: true,
          deleted_at: null
        })
        .eq('id', existing.id);
      if (error) throw error;
      return existing;
    }

    const { data, error } = await Database.client
      .from('outreach_groups')
      .insert({
        org_id: orgId,
        platform: 'facebook',
        url: payload.url,
        name: payload.name,
        member_count: payload.member_count,
        image_url: payload.image_url,
        category: payload.category,
        description: payload.description,
        created_by: Auth.user?.id
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  OM.openFbEditModal = function (id) {
    const g = OM.fbGroups.find((x) => x.id === id);
    if (!g) return;
    OM.openFbGroupImport({
      url: g.url,
      name: g.name,
      members: g.member_count || '',
      image: g.image_url || ''
    });
  };

  OM.confirmFbDelete = function (id) {
    const g = OM.fbGroups.find((x) => x.id === id);
    if (!g) return;
    if (!confirm(`Odstrániť skupinu „${g.name}"?`)) return;
    OM.deleteFbGroup(id);
  };

  OM.deleteFbGroup = async function (id) {
    const { error } = await Database.client
      .from('outreach_groups')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (error) {
      OM._toast('Chyba pri mazaní: ' + error.message, 'err');
      return;
    }
    OM.fbGroups = OM.fbGroups.filter((g) => g.id !== id);
    OM.rerender();
    OM._toast('Skupina odstránená', 'ok');
  };

  /* ============================================================
     IMPORT HOOK — po načítaní stránky s ?action=import otvor confirm
     ============================================================ */

  /**
   * Zavolaj zo OutreachModule.render() ak prišli params:
   *   if (params.view === 'fb-groups' && params.action === 'import') {
   *     await OutreachModule.openFbGroups();
   *     OutreachModule.handleFbImportParams(params);
   *   }
   */
  OM.handleFbImportParams = function (params) {
    if (!params || params.action !== 'import') return;
    OM.openFbGroupImport({
      url: decodeURIComponent(params.url || ''),
      name: decodeURIComponent(params.name || ''),
      members: params.members || '',
      image: decodeURIComponent(params.image || '')
    });
  };

  OM._cleanFbImportFromUrl = function () {
    /* Po úspešnom uložení vyčistí action=import query params z URL,
       aby refresh nevyvolal modal znovu. */
    if (window.location.hash.includes('action=import')) {
      const cleanHash = '#outreach?view=fb-groups';
      history.replaceState(null, '', cleanHash);
    }
  };

  /* ============================================================
     HELPERS
     ============================================================ */

  OM._openFbModal = function (title, bodyHtml, onMount) {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `
      <div role="dialog" aria-modal="true"
           style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #F1EEE8;flex-shrink:0;">
          <h2 style="font-size:18px;font-weight:700;color:#14120E;margin:0;">${title}</h2>
          <button data-fb-close aria-label="Zavrieť" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6F6758;padding:4px 8px;border-radius:6px;line-height:1;">✕</button>
        </div>
        <div style="overflow-y:auto;padding:20px 24px 24px;flex:1;">${bodyHtml}</div>
      </div>
    `;
    el.querySelector('[data-fb-close]').addEventListener('click', () => el.remove());
    el.addEventListener('click', (e) => {
      if (e.target === el) el.remove();
    });
    const modalsHost = document.getElementById('modals') || document.body;
    modalsHost.appendChild(el);
    if (typeof onMount === 'function') onMount(el);
    return el;
  };

  OM._fbField = function (label, control) {
    return `
      <div style="display:flex;flex-direction:column;gap:5px;">
        <label style="font-size:13px;font-weight:500;color:#3A352B;">${label}</label>
        ${control}
      </div>
    `;
  };

  OM._fbInputStyle = function () {
    return 'width:100%;padding:9px 12px;border:1px solid #E0DBD1;border-radius:9px;font-size:13px;font-family:inherit;color:#14120E;background:#fff;box-sizing:border-box;';
  };

  OM._toast = function (msg, kind) {
    /* Použi globálny toast ak existuje. */
    if (window.Utils && typeof Utils.toast === 'function') {
      Utils.toast(msg, kind === 'err' ? 'error' : 'success');
      return;
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);background:' +
      (kind === 'err' ? '#DC3C3C' : '#2F9E5E') +
      ';';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  };

  OM._esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  OM._fmtNum = function (n) {
    if (n === null || n === undefined || n === '') return '–';
    try {
      return new Intl.NumberFormat('sk-SK').format(n);
    } catch {
      return String(n);
    }
  };

  /* Minimal inline SVG ikony — bez závislosti na window.I (custom z PR #1)
     ani window.Icons (Lucide z PR #3). Stačí 6 ikon pre tento modul. */
  OM._fbIcon = function (name, size) {
    size = size || 16;
    const wrap = (inner) =>
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;">${inner}</svg>`;
    switch (name) {
      case 'plus':
        return wrap('<path d="M12 5v14M5 12h14"/>');
      case 'edit':
        return wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>');
      case 'trash':
        return wrap('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>');
      case 'bookmark':
        return wrap('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>');
      case 'search':
        return wrap('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>');
      case 'refresh':
        return wrap('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>');
      case 'users':
        return wrap('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');
      case 'warning':
        return wrap('<path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>');
      default:
        return wrap('<circle cx="12" cy="12" r="9"/>');
    }
  };
})();
