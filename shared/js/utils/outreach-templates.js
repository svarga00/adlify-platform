/**
 * ADLIFY - Outreach Email Templates v1
 *
 * Audit-first cold outreach flow:
 *   1. Cold email (audit ponuka zadarmo) -> klik na CTA
 *   2. Audit request page -> trigger deep-audit
 *   3. Audit delivered email -> link na personalizovanu auditovu stranku
 *   4. Booking confirmation email -> .ics attachment
 *
 * Style: branded Adlify + personal Stefan Varga signature.
 * Vsetky styly inline (Gmail strips <style>), 600px sirka, plain-text fallback.
 */

const OutreachTemplates = {

  brand: {
    primary: '#F97316',
    primaryDark: '#EA580C',
    ink: '#14120E',
    inkSoft: '#3A352B',
    muted: '#6F6758',
    mutedLight: '#948B7C',
    bg: '#F7F5F1',
    surface: '#FFFFFF',
    border: '#EAE6DE',
    success: '#16A34A',
  },

  /**
   * Generuje base URL pre linky.
   */
  baseUrl() {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }
    return 'https://adlify.eu';
  },

  _cache: new Map(),

  /**
   * Načíta šablónu z DB podľa slug. Cache po dobu session.
   */
  async loadTemplate(slug) {
    if (this._cache.has(slug)) return this._cache.get(slug);
    if (typeof Database === 'undefined' || !Database.client) return null;
    const { data, error } = await Database.client
      .from('email_templates')
      .select('slug, name, subject, plain_text, body_text, html_content, body_html, variables, is_active')
      .eq('slug', slug)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    this._cache.set(slug, data);
    return data;
  },

  clearCache() { this._cache.clear(); },

  /**
   * Substituuje {{vars}} v stringu podľa slovníka.
   * Nedefinované premenné ostanú prázdne.
   */
  substitute(str, vars) {
    if (!str) return '';
    return str.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_, key) => {
      const v = vars[key];
      return v == null ? '' : String(v);
    });
  },

  /**
   * Zabalí plain-text odseky do brand HTML wrappera.
   * Používa sa keď šablóna v DB nemá vlastný html_content.
   */
  wrapTextInBrand(subject, text, trackPixelUrl) {
    const paragraphs = String(text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const body = paragraphs.map(p => {
      const lines = p.split(/\n/).map(l => this._escapeHtml(l)).join('<br>');
      return `<p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">${this._linkify(lines)}</p>`;
    }).join('');
    return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${this._escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${this.brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${this.brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${this.brand.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${this.brand.surface};border-radius:16px;border:1px solid ${this.brand.border};overflow:hidden;">
        <tr><td style="padding:28px 32px 0;">
          <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${this.brand.primary};color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;">A</span>
          <span style="display:inline-block;font-size:18px;font-weight:700;color:${this.brand.ink};margin-left:10px;vertical-align:middle;letter-spacing:-0.3px;">Adlify</span>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">${body}</td></tr>
        <tr><td style="padding:20px 32px 24px;background:${this.brand.bg};border-top:1px solid ${this.brand.border};">
          <p style="margin:0;font-size:11px;color:${this.brand.mutedLight};line-height:1.5;text-align:center;">
            Adlify s.r.o. · Marketingová agentúra · <a href="https://adlify.eu" style="color:${this.brand.mutedLight};">adlify.eu</a>
          </p>
        </td></tr>
      </table>
      ${trackPixelUrl ? `<img src="${trackPixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">` : ''}
    </td></tr>
  </table>
</body></html>`;
  },

  _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  _linkify(s) {
    return String(s).replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" style="color:${this.brand.primary};text-decoration:none;">${url}</a>`);
  },

  /**
   * Univerzálny render: načíta šablónu z DB, substituuje premenné, vráti { subject, html, text }.
   * Ak šablóna v DB neexistuje, vráti null (caller môže padnúť na hardcoded fallback).
   */
  async render(slug, vars = {}, opts = {}) {
    const tpl = await this.loadTemplate(slug);
    if (!tpl) return null;
    const subject = this.substitute(tpl.subject, vars);
    const text = this.substitute(tpl.plain_text || tpl.body_text || '', vars);
    const rawHtml = tpl.html_content || tpl.body_html;
    const html = rawHtml
      ? this.substitute(rawHtml, vars)
      : this.wrapTextInBrand(subject, text, opts.trackPixelUrl || null);
    return { subject, html, text };
  },

  /**
   * Pripraví "vars" slovník pre cold outreach zo záznamu prospekta + org settings.
   */
  buildColdOutreachVars(data) {
    const {
      contactName, companyName, domain, industry, auditToken, city,
      senderName = 'Štefan Varga', senderTitle = 'Adlify',
    } = data;
    return {
      greeting: contactName ? `Pán ${contactName}` : 'Dobrý deň',
      contact_name: contactName || '',
      company: companyName || domain || '',
      domain: domain || '',
      industry: industry || '',
      industry_hook: this._industryHook(industry, city) ? ` — ${this._industryHook(industry, city)}` : '',
      city: city || '',
      audit_request_url: auditToken ? `${this.baseUrl()}/audit-request.html?t=${auditToken}` : '',
      audit_url: auditToken ? `${this.baseUrl()}/audit.html?t=${auditToken}` : '',
      sender_name: senderName,
      sender_title: senderTitle,
    };
  },

  /**
   * 1. COLD OUTREACH EMAIL — ponuka bezplatneho mini-auditu.
   *
   * @param {Object} data
   * @param {string} data.contactName - Meno kontaktnej osoby (alebo company name)
   * @param {string} data.companyName - Nazov firmy
   * @param {string} data.domain - Domena klienta
   * @param {string} data.industry - Odvetvie (gastro, fitness, ...)
   * @param {string} data.auditToken - UUID token z leads.audit_token
   * @param {string} data.city - Mesto (optional)
   * @returns {{subject:string, html:string, text:string}}
   */
  /**
   * Preferovaná verzia — najprv skúsi DB šablónu, padne na hardcoded.
   */
  async coldOutreachAuditAsync(data) {
    const trackPixel = data.auditToken
      ? `${this.baseUrl()}/.netlify/functions/track-open?audit=${data.auditToken}`
      : null;
    const vars = this.buildColdOutreachVars(data);
    const fromDb = await this.render('cold_outreach_audit', vars, { trackPixelUrl: trackPixel });
    if (fromDb) return fromDb;
    return this.coldOutreachAudit(data);
  },

  async auditDeliveredAsync(data) {
    const vars = this.buildColdOutreachVars(data);
    const fromDb = await this.render('audit_delivered', vars);
    if (fromDb) return fromDb;
    return this.auditDelivered(data);
  },

  coldOutreachAudit(data) {
    const {
      contactName,
      companyName,
      domain,
      industry,
      auditToken,
      city,
    } = data;

    const greeting = contactName ? `Pán ${contactName}` : `Dobrý deň`;
    const company = companyName || domain;
    const industryHook = this._industryHook(industry, city);
    const requestUrl = `${this.baseUrl()}/audit-request.html?t=${auditToken}`;
    const trackPixel = `${this.baseUrl()}/.netlify/functions/track-open?audit=${auditToken}`;

    const subject = `${company} — ponuka bezplatného mini-auditu`;

    const html = `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${this.brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${this.brand.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Pripravujem 5 bezplatných mini-auditov v segmente — záujem? Stačí kliknúť.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${this.brand.bg};padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${this.brand.surface};border-radius:16px;border:1px solid ${this.brand.border};overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:28px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${this.brand.primary};color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;vertical-align:middle;">A</span>
                <span style="display:inline-block;font-size:18px;font-weight:700;color:${this.brand.ink};margin-left:10px;vertical-align:middle;letter-spacing:-0.3px;">Adlify</span>
              </td>
              <td align="right" style="font-size:12px;color:${this.brand.mutedLight};vertical-align:middle;">
                Marketingová agentúra
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">${greeting},</p>

          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            všimol som si <strong style="color:${this.brand.ink};">${company}</strong>${industryHook ? ` — ${industryHook}` : ''}.
          </p>

          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            V týchto dňoch pripravujem <strong style="color:${this.brand.ink};">5 bezplatných mini-auditov</strong> pre vybrané firmy. Konkrétne 3 body čo zlepšiť hneď, ako to robí konkurencia, a kde sú peniaze ktoré teraz unikajú.
          </p>

          <p style="margin:0 0 24px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            Žiadne záväzky, žiadny predaj — len analýza ako keby som ju robil pre seba.
          </p>

          <!-- CTA -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td align="center">
              <a href="${requestUrl}" style="display:inline-block;background:${this.brand.primary};color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:12px;letter-spacing:-0.2px;">Chcem audit zadarmo →</a>
            </td></tr>
            <tr><td align="center" style="padding-top:10px;">
              <span style="font-size:12px;color:${this.brand.mutedLight};">Doručím do 48 hodín · 5 voľných miest</span>
            </td></tr>
          </table>

          <p style="margin:24px 0 4px;font-size:15px;color:${this.brand.inkSoft};line-height:1.5;">
            S pozdravom,
          </p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:${this.brand.ink};line-height:1.4;">
            Štefan Varga
          </p>
          <p style="margin:0 0 16px;font-size:13px;color:${this.brand.muted};line-height:1.4;">
            Adlify · <a href="mailto:info@adlify.eu" style="color:${this.brand.primary};text-decoration:none;">info@adlify.eu</a> · <a href="tel:+421944184045" style="color:${this.brand.primary};text-decoration:none;">+421 944 184 045</a>
          </p>

          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${this.brand.border};font-size:13px;color:${this.brand.muted};line-height:1.5;font-style:italic;">
            P.S. Ak nemáte záujem, ignorujte prosím tento email — nebudem písať druhýkrát.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px 24px;background:${this.brand.bg};border-top:1px solid ${this.brand.border};">
          <p style="margin:0;font-size:11px;color:${this.brand.mutedLight};line-height:1.5;text-align:center;">
            Adlify s.r.o. · Marketingová agentúra · <a href="https://adlify.eu" style="color:${this.brand.mutedLight};">adlify.eu</a>
          </p>
        </td></tr>

      </table>

      <img src="${trackPixel}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">

    </td></tr>
  </table>
</body>
</html>`;

    const text = `${greeting},

všimol som si ${company}${industryHook ? ` — ${industryHook}` : ''}.

V týchto dňoch pripravujem 5 bezplatných mini-auditov pre vybrané firmy. Konkrétne 3 body čo zlepšiť hneď, ako to robí konkurencia, a kde sú peniaze ktoré teraz unikajú.

Žiadne záväzky, žiadny predaj — len analýza ako keby som ju robil pre seba.

Chcem audit zadarmo: ${requestUrl}

(Doručím do 48 hodín, 5 voľných miest)

S pozdravom,
Štefan Varga
Adlify
info@adlify.eu | +421 944 184 045

P.S. Ak nemáte záujem, ignorujte prosím tento email — nebudem písať druhýkrát.`;

    return { subject, html, text };
  },

  /**
   * 2. AUDIT DELIVERED EMAIL — audit hotovy, link na personalizovanu stranku.
   */
  auditDelivered(data) {
    const { contactName, companyName, domain, auditToken } = data;
    const greeting = contactName ? `Pán ${contactName}` : `Dobrý deň`;
    const company = companyName || domain;
    const auditUrl = `${this.baseUrl()}/audit.html?t=${auditToken}`;

    const subject = `Váš mini-audit pre ${company} je hotový`;

    const html = `<!DOCTYPE html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${this.brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${this.brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${this.brand.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${this.brand.surface};border-radius:16px;border:1px solid ${this.brand.border};overflow:hidden;">

        <tr><td style="padding:28px 32px 0;">
          <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${this.brand.primary};color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;">A</span>
          <span style="display:inline-block;font-size:18px;font-weight:700;color:${this.brand.ink};margin-left:10px;vertical-align:middle;letter-spacing:-0.3px;">Adlify</span>
        </td></tr>

        <tr><td style="padding:24px 32px 8px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${this.brand.ink};letter-spacing:-0.5px;">Audit je pripravený ✓</h1>

          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">${greeting},</p>

          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            podľa sľubu — váš mini-audit pre <strong style="color:${this.brand.ink};">${company}</strong> je hotový.
          </p>

          <p style="margin:0 0 24px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            Pozrel som sa na váš web, sociálne siete, aktuálne reklamy a porovnal vás s konkurenciou. V audite nájdete <strong>3 konkrétne body</strong> ktoré ovplyvňujú vašu výkonnosť — a ako to riešia firmy ktorým sa darí.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td align="center">
              <a href="${auditUrl}" style="display:inline-block;background:${this.brand.primary};color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:12px;letter-spacing:-0.2px;">Pozrieť audit →</a>
            </td></tr>
            <tr><td align="center" style="padding-top:10px;">
              <span style="font-size:12px;color:${this.brand.mutedLight};">Audit ostane dostupný 30 dní</span>
            </td></tr>
          </table>

          <p style="margin:24px 0 4px;font-size:15px;color:${this.brand.inkSoft};">S pozdravom,</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:${this.brand.ink};">Štefan Varga</p>
          <p style="margin:0 0 16px;font-size:13px;color:${this.brand.muted};">
            Adlify · <a href="mailto:info@adlify.eu" style="color:${this.brand.primary};text-decoration:none;">info@adlify.eu</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `${greeting},

audit je pripravený. Pozrel som sa na váš web, sociálne siete, aktuálne reklamy a porovnal vás s konkurenciou. V audite nájdete 3 konkrétne body ktoré ovplyvňujú vašu výkonnosť.

Pozrieť audit: ${auditUrl}

(Audit ostane dostupný 30 dní)

S pozdravom,
Štefan Varga
Adlify
info@adlify.eu`;

    return { subject, html, text };
  },

  /**
   * 3. CALL BOOKING CONFIRMATION — potvrdenie rezervacie + .ics attachment.
   */
  callBookingConfirmation(data) {
    const { contactName, companyName, scheduledAt, durationMinutes, topic, icsUid } = data;
    const greeting = contactName ? `Pán ${contactName}` : `Dobrý deň`;
    const dateFmt = new Date(scheduledAt).toLocaleString('sk-SK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const subject = `Potvrdenie rezervácie — ${dateFmt}`;

    const html = `<!DOCTYPE html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${this.brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${this.brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${this.brand.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${this.brand.surface};border-radius:16px;border:1px solid ${this.brand.border};overflow:hidden;">
        <tr><td style="padding:28px 32px 0;">
          <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${this.brand.primary};color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;">A</span>
          <span style="display:inline-block;font-size:18px;font-weight:700;color:${this.brand.ink};margin-left:10px;vertical-align:middle;">Adlify</span>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${this.brand.ink};">Hovor potvrdený ✓</h1>
          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">${greeting},</p>
          <p style="margin:0 0 16px;font-size:16px;color:${this.brand.inkSoft};line-height:1.6;">
            ďakujem za rezerváciu hovoru. Tešíme sa na rozhovor.
          </p>
          <div style="background:${this.brand.bg};border:1px solid ${this.brand.border};border-radius:12px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:${this.brand.mutedLight};text-transform:uppercase;letter-spacing:0.5px;">Termín</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${this.brand.ink};">${dateFmt}</p>
            <p style="margin:0 0 6px;font-size:13px;color:${this.brand.mutedLight};text-transform:uppercase;letter-spacing:0.5px;">Trvanie</p>
            <p style="margin:0 0 16px;font-size:15px;color:${this.brand.inkSoft};">${durationMinutes || 15} minút (telefonicky)</p>
            ${topic ? `<p style="margin:0 0 6px;font-size:13px;color:${this.brand.mutedLight};text-transform:uppercase;letter-spacing:0.5px;">Téma</p><p style="margin:0;font-size:15px;color:${this.brand.inkSoft};">${topic}</p>` : ''}
          </div>
          <p style="margin:0 0 16px;font-size:14px;color:${this.brand.muted};line-height:1.5;">
            Pozvánka do kalendára je v prílohe (.ics). Ak potrebujete termín presunúť, jednoducho odpíšte na tento email.
          </p>
          <p style="margin:20px 0 4px;font-size:15px;color:${this.brand.inkSoft};">S pozdravom,</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:${this.brand.ink};">Štefan Varga</p>
          <p style="margin:0;font-size:13px;color:${this.brand.muted};">Adlify · info@adlify.eu</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `${greeting},

ďakujem za rezerváciu hovoru.

Termín: ${dateFmt}
Trvanie: ${durationMinutes || 15} minút (telefonicky)${topic ? `\nTéma: ${topic}` : ''}

Pozvánka do kalendára je v prílohe (.ics).

S pozdravom,
Štefan Varga
Adlify`;

    return { subject, html, text };
  },

  /**
   * Helper: vyplyva z industry vetnu vsuvku, napr. "moderny web v gastro segmente v BA".
   */
  _industryHook(industry, city) {
    if (!industry) return '';
    const ind = industry.toLowerCase();
    const cityPart = city ? ` v meste ${city}` : '';
    const map = [
      ['gastro', 'gastronomická prevádzka'],
      ['reštau', 'reštaurácia'],
      ['kavi', 'kaviareň'],
      ['fitness', 'fitness centrum'],
      ['kader', 'kaderníctvo'],
      ['kozmet', 'kozmetické štúdio'],
      ['salón', 'salón'],
      ['stomat', 'stomatologická ambulancia'],
      ['zub', 'stomatológia'],
      ['právn', 'advokátska kancelária'],
      ['advok', 'advokátska kancelária'],
      ['stavb', 'stavebná firma'],
      ['real', 'realitná kancelária'],
      ['eshop', 'e-shop'],
      ['obchod', 'obchod'],
      ['hotel', 'hotel'],
      ['ubytov', 'ubytovacie zariadenie'],
      ['škol', 'vzdelávacie zariadenie'],
      ['kurz', 'kurzy'],
      ['servis', 'autoservis'],
      ['auto', 'automobilová firma'],
      ['it', 'IT firma'],
      ['soft', 'softvérová firma'],
    ];
    for (const [key, label] of map) {
      if (ind.includes(key)) return `${label}${cityPart}`;
    }
    return `firma${cityPart}`;
  },

};

if (typeof window !== 'undefined') window.OutreachTemplates = OutreachTemplates;
if (typeof module !== 'undefined' && module.exports) module.exports = OutreachTemplates;
