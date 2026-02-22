// =====================================================
// ADLIFY - Email Template System
// Číta brand nastavenia z App.settings
// =====================================================

window.EmailTemplates = {

  _settingsLoaded: false,

  // Načítaj settings z DB (jednorazovo)
  ensureSettings: async function() {
    if (this._settingsLoaded) return;
    if (window.App && App.settings && App.settings.brand_logo_url) { this._settingsLoaded = true; return; }
    
    try {
      var db = window.Database && Database.client;
      if (!db) return;
      
      var resp = await db.from('settings').select('key, value');
      if (resp.data && resp.data.length > 0) {
        if (!window.App) window.App = {};
        if (!App.settings) App.settings = {};
        resp.data.forEach(function(s) {
          try { App.settings[s.key] = JSON.parse(s.value); } catch(e) { App.settings[s.key] = s.value; }
        });
        this._settingsLoaded = true;
      }
    } catch(e) { console.warn('EmailTemplates: settings load failed', e); }
  },

  // Dynamicky čítaj z App.settings (brand tab)
  getConfig: function() {
    var s = (window.App && App.settings) || {};
    return {
      brandName: s.company_name || 'Adlify',
      logoUrl: s.brand_logo_url || '',
      primaryColor: s.brand_primary_color || '#FF6B35',
      secondaryColor: s.brand_secondary_color || '#E91E63',
      website: s.email_website || 'www.adlify.eu',
      email: s.email_contact || 'info@adlify.eu',
      footerText: s.email_footer_text || '',
      tagline: s.email_tagline || ''
    };
  },

  // === BASE LAYOUT ===
  _baseLayout: function(content) {
    var c = this.getConfig();
    var year = new Date().getFullYear();
    var footer = c.footerText || ('S pozdravom, <strong>T\u00edm ' + c.brandName + '</strong>');

    // Logo: obrázok ak existuje, inak text
    var logoHtml;
    if (c.logoUrl) {
      logoHtml = '<img src="' + c.logoUrl + '" alt="' + c.brandName + '" style="max-height:40px;max-width:200px;display:block;" onerror="this.outerHTML=\'<span style=font-size:24px;font-weight:700;color:' + c.primaryColor + ';>' + c.brandName + '</span>\'">';
    } else {
      logoHtml = '<span style="font-size:24px;font-weight:700;color:' + c.primaryColor + ';letter-spacing:-0.3px;">' + c.brandName + '</span>';
    }

    return [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;background:#f5f5f5;color:#333333;">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;"><tr><td align="center" style="padding:32px 16px;">',
      '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">',

      // Header
      '<tr><td style="padding:28px 32px 20px;">',
      logoHtml,
      '<div style="margin-top:16px;height:3px;border-radius:3px;background:linear-gradient(90deg,' + c.primaryColor + ',' + c.secondaryColor + ');"></div>',
      '</td></tr>',

      // Content
      '<tr><td style="padding:8px 32px 28px;">',
      content,
      '</td></tr>',

      // Footer
      '<tr><td style="padding:20px 32px 24px;background:#fafafa;border-top:1px solid #eee;">',
      '<p style="margin:0 0 12px;font-size:14px;color:#555;">' + footer + '</p>',
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr>',
      '<td style="padding-right:16px;"><a href="mailto:' + c.email + '" style="color:' + c.primaryColor + ';text-decoration:none;font-size:13px;">' + c.email + '</a></td>',
      '<td><a href="https://' + c.website + '" style="color:' + c.primaryColor + ';text-decoration:none;font-size:13px;">' + c.website + '</a></td>',
      '</tr></table>',
      (c.tagline ? '<p style="margin:12px 0 0;font-size:12px;color:#aaa;">' + c.tagline + '</p>' : ''),
      '</td></tr>',

      '</table>',
      '<p style="margin:16px 0 0;font-size:11px;color:#ccc;text-align:center;">\u00a9 ' + year + ' ' + c.brandName + '</p>',
      '</td></tr></table></body></html>'
    ].join('');
  },

  // === HELPERS ===
  _p: function(text, opts) {
    opts = opts || {};
    return '<p style="margin:0 0 16px;font-size:' + (opts.size || '15px') + ';line-height:1.65;color:' + (opts.color || '#555') + ';' + (opts.style || '') + '">' + text + '</p>';
  },
  _heading: function(text) {
    return '<h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#222;line-height:1.3;">' + text + '</h1>';
  },
  _button: function(text, url) {
    var c = this.getConfig();
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0;"><a href="' + url + '" style="display:inline-block;background:' + c.primaryColor + ';color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">' + text + '</a></td></tr></table>';
  },
  _card: function(content) {
    return '<div style="background:#f9fafb;border-radius:8px;padding:20px;margin:16px 0;border:1px solid #eee;">' + content + '</div>';
  },
  _note: function(text) {
    return '<p style="margin:16px 0 0;font-size:12px;color:#aaa;text-align:center;">' + text + '</p>';
  },

  // === SAMPLE DATA pre preview ===
  getSampleData: function() {
    var c = this.getConfig();
    return {
      teamInvite: { firstName: 'Michal', role: 'Obchodn\u00edk', inviteUrl: '#', expiresAt: new Date(Date.now() + 7*86400000).toISOString() },
      onboarding: { contactName: 'J\u00e1n Nov\u00e1k', companyName: 'AutoServis Nov\u00e1k', onboardingUrl: '#' },
      campaignProposal: { contactName: 'Peter Horv\u00e1th', companyName: 'Kader. Style', projectName: 'Google Ads Q1 2026', proposalUrl: '#' },
      leadProposal: { body: 'Dobr\u00fd de\u0148,\n\nna z\u00e1klade anal\u00fdzy va\u0161ej webstr\u00e1nky sme pre v\u00e1s pripravili ponuku.\n\n\u2713 Google Ads kampa\u0148\n\u2713 Meta Ads kampa\u0148\n\u2713 Mesa\u010dn\u00fd reporting', proposalUrl: '#', companyName: 'Test s.r.o.' },
      generic: { title: 'D\u00f4le\u017eit\u00e1 inform\u00e1cia', body: 'Dobr\u00fd de\u0148,\n\nchceli by sme v\u00e1s informova\u0165 o novink\u00e1ch.', buttonText: 'Pozrie\u0165 v\u00fdsledky', buttonUrl: '#' }
    };
  },

  // Template zoznam pre UI
  getTemplateList: function() {
    return [
      { id: 'teamInvite', name: 'Pozv\u00e1nka do t\u00edmu', desc: 'Email pre nov\u00fdch \u010dlenov t\u00edmu', icon: '\ud83d\udc65' },
      { id: 'onboarding', name: 'Onboarding dotazn\u00edk', desc: 'V\u00fdzva na vyplnenie dotazn\u00edka', icon: '\ud83d\udccb' },
      { id: 'campaignProposal', name: 'N\u00e1vrh kampane', desc: 'Odoslanie n\u00e1vrhu klientovi', icon: '\ud83d\udcca' },
      { id: 'leadProposal', name: 'Ponuka pre lead', desc: 'Email s ponukou pre nov\u00fd lead', icon: '\ud83d\udce7' },
      { id: 'generic', name: 'Univerz\u00e1lny email', desc: 'Vlastn\u00fd obsah a tla\u010didlo', icon: '\u2709\ufe0f' }
    ];
  },

  // Vráti default editovateľné polia pre danú šablónu
  getEditableFields: function(templateId) {
    var defaults = {
      teamInvite: {
        heading: 'Pozv\u00e1nka do t\u00edmu',
        greeting: 'Ahoj {firstName},',
        bodyText: 'pozv\u00e1me \u0165a do t\u00edmu {brandName} s rolou {role}. Pre vytvorenie \u00fa\u010dtu klikni na tla\u010didlo ni\u017e\u0161ie.',
        buttonText: 'Prija\u0165 pozv\u00e1nku',
        noteText: 'Pozv\u00e1nka je platn\u00e1 do {expiresAt}.'
      },
      onboarding: {
        heading: 'Vitajte v spolupr\u00e1ci!',
        greeting: 'Dobr\u00fd de\u0148 {contactName},',
        bodyText: '\u010eakujeme za v\u00e1\u0161 z\u00e1ujem o spolupr\u00e1cu. Pre pr\u00edpravu va\u0161ej marketingovej strat\u00e9gie potrebujeme vyplni\u0165 kr\u00e1tky dotazn\u00edk.',
        buttonText: 'Vyplni\u0165 dotazn\u00edk',
        noteText: ''
      },
      campaignProposal: {
        heading: 'V\u00e1\u0161 n\u00e1vrh kampane je pripraven\u00fd',
        greeting: 'Dobr\u00fd de\u0148 {contactName},',
        bodyText: 'na z\u00e1klade inform\u00e1ci\u00ed, ktor\u00e9 ste n\u00e1m poskytli, sme pre v\u00e1s pripravili n\u00e1vrh marketingovej kampane.',
        buttonText: 'Zobrazi\u0165 n\u00e1vrh',
        noteText: 'V pr\u00edpade ot\u00e1zok n\u00e1s nev\u00e1hajte kontaktova\u0165.'
      },
      leadProposal: {
        heading: '',
        greeting: '',
        bodyText: '',
        buttonText: 'Zobrazi\u0165 ponuku',
        noteText: 'Odkaz je platn\u00fd 30 dn\u00ed.'
      },
      generic: {
        heading: '',
        greeting: '',
        bodyText: '',
        buttonText: '',
        noteText: ''
      }
    };
    return defaults[templateId] || {};
  },

  // Získaj override z App.settings
  _getOverride: function(templateId) {
    var s = (window.App && App.settings) || {};
    var raw = s['tpl_override_' + templateId];
    if (!raw) return null;
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { return null; }
  },

  // Pomocná: nahraď {premenné} v texte
  _replaceVars: function(text, vars) {
    if (!text) return text;
    for (var k in vars) {
      if (vars.hasOwnProperty(k)) {
        text = text.split('{' + k + '}').join(vars[k] || '');
      }
    }
    return text;
  },

  // === TEMPLATES ===
  teamInvite: function(data) {
    var c = this.getConfig();
    var o = this._getOverride('teamInvite') || {};
    var vars = { firstName: data.firstName, role: data.role, brandName: c.brandName, expiresAt: new Date(data.expiresAt).toLocaleDateString('sk-SK') };
    
    var heading = this._replaceVars(o.heading || 'Pozv\u00e1nka do t\u00edmu', vars);
    var greeting = this._replaceVars(o.greeting || 'Ahoj <strong>' + data.firstName + '</strong>,', vars);
    var body = this._replaceVars(o.bodyText || 'pozv\u00e1me \u0165a do t\u00edmu <strong>' + c.brandName + '</strong> s rolou <strong>' + data.role + '</strong>. Pre vytvorenie \u00fa\u010dtu klikni na tla\u010didlo ni\u017e\u0161ie.', vars);
    var btn = this._replaceVars(o.buttonText || 'Prija\u0165 pozv\u00e1nku', vars);
    var note = this._replaceVars(o.noteText || 'Pozv\u00e1nka je platn\u00e1 do ' + vars.expiresAt + '.', vars);

    // Ak je override greeting, zabalíme bold na meno
    if (o.greeting) greeting = greeting.replace(data.firstName, '<strong>' + data.firstName + '</strong>');
    if (o.bodyText) body = body.replace(c.brandName, '<strong>' + c.brandName + '</strong>').replace(data.role, '<strong>' + data.role + '</strong>');

    var content = [
      this._heading(heading),
      this._p(greeting),
      this._p(body),
      this._button(btn, data.inviteUrl),
      note ? this._note(note) : ''
    ].join('');
    return this._baseLayout(content);
  },

  onboarding: function(data) {
    var o = this._getOverride('onboarding') || {};
    var greeting = data.contactName ? data.contactName.split(' ')[0] : '';
    var vars = { contactName: greeting, companyName: data.companyName || '' };

    var headingText = this._replaceVars(o.heading || 'Vitajte v spolupr\u00e1ci!', vars);
    var greetText = this._replaceVars(o.greeting || 'Dobr\u00fd de\u0148' + (greeting ? ' <strong>' + greeting + '</strong>' : '') + ',', vars);
    var bodyText = this._replaceVars(o.bodyText || '\u010eakujeme za v\u00e1\u0161 z\u00e1ujem o spolupr\u00e1cu. Pre pr\u00edpravu va\u0161ej marketingovej strat\u00e9gie potrebujeme vyplni\u0165 kr\u00e1tky dotazn\u00edk.', vars);
    var btnText = this._replaceVars(o.buttonText || 'Vyplni\u0165 dotazn\u00edk', vars);
    var noteText = this._replaceVars(o.noteText || '', vars);

    if (o.greeting && greeting) greetText = greetText.replace(greeting, '<strong>' + greeting + '</strong>');

    var content = [
      this._heading(headingText),
      this._p(greetText),
      this._p(bodyText),
      this._card(
        '<p style="margin:0 0 10px;font-weight:600;color:#333;">\u010co v\u00e1s \u010dak\u00e1:</p>' +
        '<p style="margin:0;color:#777;font-size:14px;line-height:2;">' +
        '\u2713 Inform\u00e1cie o va\u0161om podnikan\u00ed<br>\u2713 Cie\u013eov\u00e1 skupina a rozpo\u010det<br>\u2713 V\u00fdber platformy a bal\u00ed\u010dka<br>\u23f1 Cca 10 min\u00fat</p>'
      ),
      this._button(btnText, data.onboardingUrl),
      noteText ? this._note(noteText) : this._note('Ak tla\u010didlo nefunguje: <a href="' + data.onboardingUrl + '" style="color:' + this.getConfig().primaryColor + ';word-break:break-all;">' + data.onboardingUrl + '</a>')
    ].join('');
    return this._baseLayout(content);
  },

  campaignProposal: function(data) {
    var o = this._getOverride('campaignProposal') || {};
    var name = data.contactName || data.companyName || '';
    var vars = { contactName: name, companyName: data.companyName || '', projectName: data.projectName || '' };

    var headingText = this._replaceVars(o.heading || 'V\u00e1\u0161 n\u00e1vrh kampane je pripraven\u00fd', vars);
    var greetText = this._replaceVars(o.greeting || 'Dobr\u00fd de\u0148' + (name ? ' <strong>' + name + '</strong>' : '') + ',', vars);
    var bodyText = this._replaceVars(o.bodyText || 'na z\u00e1klade inform\u00e1ci\u00ed, ktor\u00e9 ste n\u00e1m poskytli, sme pre v\u00e1s pripravili n\u00e1vrh marketingovej kampane.', vars);
    var btnText = this._replaceVars(o.buttonText || 'Zobrazi\u0165 n\u00e1vrh', vars);
    var noteText = this._replaceVars(o.noteText || 'V pr\u00edpade ot\u00e1zok n\u00e1s nev\u00e1hajte kontaktova\u0165.', vars);

    if (o.greeting && name) greetText = greetText.replace(name, '<strong>' + name + '</strong>');

    var content = [
      this._heading(headingText),
      this._p(greetText),
      this._p(bodyText),
      data.projectName ? this._card(
        '<p style="margin:0 0 8px;font-weight:600;color:#333;">' + data.projectName + '</p>' +
        '<p style="margin:0;color:#777;font-size:14px;line-height:1.8;">\u2022 Cielen\u00e9 kampane pre v\u00e1\u0161 biznis<br>\u2022 O\u010dak\u00e1van\u00e9 v\u00fdsledky a metriky<br>\u2022 Optimalizovan\u00fd rozpo\u010det</p>'
      ) : '',
      this._button(btnText, data.proposalUrl),
      noteText ? this._p(noteText, {size:'14px',color:'#999'}) : ''
    ].join('');
    return this._baseLayout(content);
  },

  leadProposal: function(data) {
    var self = this;
    var body = data.body || '';
    var paragraphs = body.split('\n\n').map(function(p) {
      if (!p.trim() || p.indexOf('\u2501') >= 0 || p.indexOf('\ud83d\udd17') >= 0) return '';
      if (p.indexOf('\u2713') >= 0) {
        var items = p.split('\n').filter(function(l) { return l.indexOf('\u2713') >= 0; });
        return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;">' +
          items.map(function(i) { return '<tr><td style="padding:4px 8px 4px 0;color:#48bb78;">\u2713</td><td style="padding:4px 0;font-size:14px;color:#555;">' + i.replace('\u2713','').trim() + '</td></tr>'; }).join('') + '</table>';
      }
      return self._p(p.replace(/\n/g, '<br>'));
    }).join('');
    var content = [paragraphs, data.proposalUrl ? this._button('Zobrazi\u0165 ponuku', data.proposalUrl) : '', data.proposalUrl ? this._note('Odkaz je platn\u00fd 30 dn\u00ed.') : ''].join('');
    return this._baseLayout(content);
  },

  clientOnboardingLink: function(data) { return this.onboarding(data); },

  generic: function(data) {
    var content = [
      data.title ? this._heading(data.title) : '',
      this._p(data.body.replace(/\n/g, '<br>')),
      data.buttonText && data.buttonUrl ? this._button(data.buttonText, data.buttonUrl) : ''
    ].join('');
    return this._baseLayout(content);
  },

  // === SEND ===
  send: async function(opts) {
    await this.ensureSettings();
    var html = opts.htmlBody || this[opts.template](opts.templateData);
    var session = await Database.client.auth.getSession();
    var token = session && session.data && session.data.session ? session.data.session.access_token : '';
    var response = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ to: opts.to, toName: opts.toName, subject: opts.subject, htmlBody: html, textBody: html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500) })
    });
    if (!response.ok) { var e = await response.text(); throw new Error('HTTP ' + response.status + ': ' + e); }
    var result = await response.json();
    if (!result.success) throw new Error(result.error || 'Email sa nepodarilo odoslat');
    return result;
  }
};

// Auto-load settings keď je DB pripravená
(function() {
  var attempts = 0;
  var timer = setInterval(function() {
    attempts++;
    if (attempts > 20) { clearInterval(timer); return; }
    if (window.Database && Database.client) {
      clearInterval(timer);
      EmailTemplates.ensureSettings();
    }
  }, 500);
})();
