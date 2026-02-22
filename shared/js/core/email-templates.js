// =====================================================
// ADLIFY - Centrálny Email Template Systém
// Všetky emaily na jednom mieste, konzistentný branding
// =====================================================

window.EmailTemplates = {

  // ==========================================
  // KONFIGURÁCIA
  // ==========================================
  
  config: {
    logo: 'https://adlify.eu/logo.png',
    brandName: 'Adlify',
    website: 'www.adlify.eu',
    email: 'info@adlify.eu',
    colors: {
      primary: '#FF6B35',
      secondary: '#E91E63',
      accent: '#9C27B0',
      text: '#334155',
      muted: '#94a3b8',
      bg: '#f8fafc',
      cardBg: '#ffffff',
      border: '#e2e8f0'
    }
  },

  // ==========================================
  // BASE LAYOUT
  // ==========================================

  _baseLayout(content, options = {}) {
    const c = this.config.colors;
    const year = new Date().getFullYear();
    const footerText = options.footerText || 'S pozdravom, <strong>Adlify tím</strong>';
    
    return [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;font-family:Inter,Arial,Helvetica,sans-serif;background:' + c.bg + ';color:' + c.text + ';">',
      '<div style="max-width:600px;margin:0 auto;padding:40px 20px;">',
      
      // Header
      '<div style="text-align:center;margin-bottom:32px;">',
      '<div style="background:linear-gradient(135deg,' + c.primary + ' 0%,' + c.secondary + ' 50%,' + c.accent + ' 100%);border-radius:16px;padding:24px 40px;display:inline-block;">',
      '<img src="' + this.config.logo + '" alt="Adlify" style="height:36px;display:block;" onerror="this.outerHTML=\'<span style=color:white;font-size:24px;font-weight:bold;letter-spacing:1px;>ADLIFY</span>\'">',
      '</div></div>',
      
      // Content
      '<div style="background:' + c.cardBg + ';border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">',
      content,
      '</div>',
      
      // Footer
      '<div style="text-align:center;padding:32px 0 16px;color:' + c.muted + ';font-size:13px;">',
      '<p style="margin:0 0 8px;">' + footerText + '</p>',
      '<p style="margin:0 0 4px;">',
      '<a href="mailto:' + this.config.email + '" style="color:' + c.primary + ';text-decoration:none;">' + this.config.email + '</a>',
      ' &middot; ',
      '<a href="https://' + this.config.website + '" style="color:' + c.primary + ';text-decoration:none;">' + this.config.website + '</a>',
      '</p>',
      '<p style="margin:0;font-size:11px;color:#cbd5e1;">&copy; ' + year + ' ' + this.config.brandName + ' &middot; AI-powered marketing</p>',
      '</div>',
      
      '</div></body></html>'
    ].join('');
  },

  // Helper pre paragraf
  _p(text, extra = '') {
    return '<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 16px;' + extra + '">' + text + '</p>';
  },

  // Helper pre CTA button
  _button(text, url, style = 'primary') {
    const c = this.config.colors;
    const bg = style === 'primary' 
      ? 'background:linear-gradient(135deg,' + c.primary + ' 0%,' + c.secondary + ' 100%)' 
      : 'background:' + c.primary;
    return [
      '<div style="text-align:center;margin:32px 0;">',
      '<a href="' + url + '" style="display:inline-block;' + bg + ';color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:600;font-size:16px;">',
      text,
      '</a></div>'
    ].join('');
  },

  // Helper pre info card
  _card(content) {
    return '<div style="background:#f1f5f9;border-radius:12px;padding:24px;margin:20px 0;">' + content + '</div>';
  },

  // Helper pre heading
  _h1(text) {
    return '<h1 style="font-size:24px;color:#1e293b;margin:0 0 8px;font-weight:700;">' + text + '</h1>';
  },

  _h2(text) {
    return '<h2 style="font-size:18px;color:#1e293b;margin:20px 0 12px;font-weight:600;">' + text + '</h2>';
  },

  // ==========================================
  // ŠABLÓNY
  // ==========================================

  /**
   * Pozvánka do tímu
   */
  teamInvite({ firstName, role, inviteUrl, expiresAt }) {
    const expiryDate = new Date(expiresAt).toLocaleDateString('sk-SK');
    
    const content = [
      this._h1('Pozvánka do tímu'),
      this._p('Ahoj <strong>' + firstName + '</strong>,'),
      this._p('Bol/a si pozvaný/á do tímu <strong>Adlify</strong> s rolou <strong>' + role + '</strong>.'),
      this._p('Klikni na tlačidlo nižšie pre vytvorenie účtu a pripojenie sa k tímu.'),
      this._button('Prijať pozvánku', inviteUrl),
      '<p style="text-align:center;color:#94a3b8;font-size:13px;margin:0;">Pozvánka platná do ' + expiryDate + '</p>'
    ].join('');
    
    return this._baseLayout(content);
  },

  /**
   * Onboarding dotazník
   */
  onboarding({ contactName, companyName, onboardingUrl }) {
    const greeting = contactName ? contactName.split(' ')[0] : '';
    
    const content = [
      this._h1('Dobrý deň' + (greeting ? ', ' + greeting : '') + '!'),
      this._p('Ďakujeme za váš záujem o spoluprácu s Adlify. Pre prípravu vašej marketingovej stratégie potrebujeme od vás vyplniť krátky onboarding dotazník.'),
      this._card(
        '<p style="margin:0 0 8px;font-weight:600;color:#334155;">📋 Čo vás čaká:</p>' +
        '<p style="margin:0;color:#64748b;font-size:14px;line-height:1.8;">' +
        '✓ Otázky o vašom biznise a cieľoch<br>' +
        '✓ Cieľová skupina a rozpočet<br>' +
        '✓ Výber platforiem a balíčka<br>' +
        '⏱ Trvanie: cca 10-15 minút</p>'
      ),
      this._button('Vyplniť dotazník →', onboardingUrl),
      '<p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">Ak tlačidlo nefunguje: <a href="' + onboardingUrl + '" style="color:#FF6B35;word-break:break-all;">' + onboardingUrl + '</a></p>'
    ].join('');
    
    return this._baseLayout(content);
  },

  /**
   * Návrh kampane / proposal
   */
  campaignProposal({ contactName, companyName, projectName, proposalUrl }) {
    const content = [
      this._h1('Návrh kampane je pripravený!'),
      this._p('Dobrý deň ' + (contactName || companyName) + ','),
      this._p('Pripravili sme pre vás personalizovaný návrh marketingovej kampane.'),
      this._card(
        '<p style="margin:0 0 12px;font-weight:600;color:#334155;">📊 ' + (projectName || 'Marketingová kampaň') + '</p>' +
        '<p style="margin:0;color:#64748b;font-size:14px;line-height:1.8;">' +
        '🎯 Cielené kampane pre váš biznis<br>' +
        '📈 Očakávané výsledky a metriky<br>' +
        '💰 Optimalizovaný rozpočet</p>'
      ),
      this._button('Zobraziť návrh kampane →', proposalUrl),
      this._p('Po prezretí návrhu môžete:', 'font-size:14px;'),
      '<p style="color:#64748b;font-size:14px;line-height:2;margin:0 0 16px;">' +
        '✅ <strong>Schváliť návrh</strong> — začneme s realizáciou<br>' +
        '✏️ <strong>Požiadať o úpravu</strong> — ak máte pripomienky</p>',
      this._p('V prípade otázok nás neváhajte kontaktovať.', 'font-size:14px;')
    ].join('');
    
    return this._baseLayout(content);
  },

  /**
   * Lead - ponuka s textom
   */
  leadProposal({ body, proposalUrl, companyName }) {
    // Konvertuj plain text na HTML paragrafy
    const paragraphs = body.split('\n\n').map(p => {
      if (!p.trim() || p.includes('━━━')) return '';
      if (p.includes('VAŠA PERSONALIZOVANÁ PONUKA')) {
        return this._h2('📊 Vaša personalizovaná ponuka');
      }
      if (p.includes('🔗')) return '';
      if (p.includes('✓')) {
        const items = p.split('\n').filter(l => l.includes('✓'));
        return '<ul style="list-style:none;padding:0;margin:12px 0;">' + items.map(i => '<li style="padding:4px 0;color:#475569;">✓ ' + i.replace('✓', '').trim() + '</li>').join('') + '</ul>';
      }
      return this._p(p.replace(/\n/g, '<br>'));
    }).join('');
    
    const content = [
      paragraphs,
      proposalUrl ? this._button('📄 Zobraziť ponuku', proposalUrl) : '',
      proposalUrl ? '<p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Odkaz je platný 30 dní.</p>' : ''
    ].join('');
    
    return this._baseLayout(content);
  },

  /**
   * Onboarding link pre klienta (z clients modulu)
   */
  clientOnboardingLink({ contactName, companyName, onboardingUrl }) {
    return this.onboarding({ contactName, companyName, onboardingUrl });
  },

  /**
   * Generický email s vlastným obsahom
   */
  generic({ title, body, buttonText, buttonUrl }) {
    const content = [
      title ? this._h1(title) : '',
      this._p(body.replace(/\n/g, '<br>')),
      buttonText && buttonUrl ? this._button(buttonText, buttonUrl) : ''
    ].join('');
    
    return this._baseLayout(content);
  },

  // ==========================================
  // UTILITY
  // ==========================================

  /**
   * Odošli email cez Netlify function
   */
  async send({ to, toName, subject, template, templateData, htmlBody }) {
    const html = htmlBody || this[template](templateData);
    
    const session = await Database.client.auth.getSession();
    const token = session?.data?.session?.access_token || '';
    
    const response = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        to,
        toName,
        subject,
        htmlBody: html,
        textBody: this._stripHtml(html)
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('HTTP ' + response.status + ': ' + errorText);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Nepodarilo sa odoslať email');
    }
    
    return result;
  },

  _stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 500);
  }
};
