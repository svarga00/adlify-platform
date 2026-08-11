// ============================================================================
// DANUBRA — Komunikačný panel (§11)
// Znovupoužiteľný v detaile klienta, dopytu, objednávky a v spise.
// WhatsApp / Volať / E-mail (SMS pribudne v M7). Každá akcia zaloguje activity.
// ============================================================================
window.CommPanel = {
  /**
   * @param {Object} opts
   *   contact:   { phone, whatsapp:bool, email, name }
   *   entity:    { type, id }   — pre activities log
   *   sticky:    bool           — na mobile sticky dole
   */
  render(opts = {}) {
    const c = opts.contact || {};
    const phone = (c.phone || '').trim();
    const email = (c.email || '').trim();
    const telHref = phone ? `tel:${phone.replace(/\s/g, '')}` : null;
    const waHref = phone ? `https://wa.me/${phone.replace(/[^\d]/g, '')}` : null;
    const mailHref = email ? `mailto:${email}` : null;
    const meta = encodeURIComponent(JSON.stringify(opts.entity || {}));

    const btn = (href, ico, label, kind, chan) => href
      ? `<a href="${href}" target="_blank" rel="noopener" class="comm-btn comm-${kind}"
           onclick="CommPanel._log('${chan}','${meta}')">
           <span class="comm-ico">${Icon(ico)}</span><span>${label}</span></a>`
      : `<span class="comm-btn comm-disabled"><span class="comm-ico">${Icon(ico)}</span><span>${label}</span></span>`;

    return `
      <div class="comm-panel${opts.sticky ? ' comm-sticky' : ''}">
        ${btn(telHref, 'phone', 'Volať', 'call', 'call')}
        ${btn(c.whatsapp !== false ? waHref : null, 'whatsapp', 'WhatsApp', 'wa', 'whatsapp')}
        ${btn(mailHref, 'mail', 'E-mail', 'mail', 'email')}
        <button class="comm-btn comm-note" onclick="CommPanel._notePrompt('${meta}')">
          <span class="comm-ico">${Icon('note')}</span><span>Poznámka</span></button>
      </div>`;
  },

  async _log(channel, metaEnc, body) {
    let entity = {};
    try { entity = JSON.parse(decodeURIComponent(metaEnc)); } catch {}
    if (!entity.type || !entity.id) return;
    try {
      await DB.insert('activities', {
        entity_type: entity.type,
        entity_id: entity.id,
        type: channel,
        direction: 'out',
        body: body || `${channel} kontakt`,
      });
    } catch (e) { /* ticho — kontakt sa aj tak otvoril */ }
  },

  async _notePrompt(metaEnc) {
    const text = prompt('Poznámka ku komunikácii:');
    if (!text) return;
    await this._log('note', metaEnc, text);
    UI.toast('Poznámka uložená', 'ok');
    if (window.Danubra) Danubra.renderRoute();
  },

  css() {
    return `
    .comm-panel { display:flex; gap:8px; flex-wrap:wrap; }
    .comm-btn { display:inline-flex; align-items:center; gap:7px; padding:10px 14px;
      border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; border:1.5px solid var(--border);
      background:#fff; color:var(--ink); text-decoration:none; font-family:inherit; }
    .comm-btn .comm-ico { font-size:16px; }
    .comm-call { border-color:#BEE3CE; color:var(--green); }
    .comm-wa   { border-color:#B9E6C4; color:#128C3E; }
    .comm-mail { border-color:#C3D3FA; color:var(--blue); }
    .comm-note { border-color:var(--border-strong); color:var(--ink-sub); }
    .comm-disabled { opacity:.4; cursor:not-allowed; }
    .comm-sticky {}
    @media (max-width:860px) {
      .comm-sticky { position:sticky; bottom:0; background:#fff; padding:10px 0;
        border-top:1px solid var(--border); margin:0 -16px; padding-left:16px; padding-right:16px; }
      .comm-btn { flex:1; justify-content:center; padding:12px 8px; }
      .comm-btn span:not(.comm-ico) { display:none; }
    }`;
  },
};
