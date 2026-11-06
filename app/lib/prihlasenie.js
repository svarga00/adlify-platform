// ============================================================================
// DANUBRA — prihlásenie kolegov: pozvánka, odkaz na heslo, stav účtu
// ============================================================================
// Spoločné pre server (netlify/functions/danubra-member-invite.js), obrazovku
// Používatelia (js/modules/members.js) a stránku „Nastavte si heslo"
// (js/components/heslo.js). Len čisté funkcie — nič tu nevolá sieť.
//
// Prečo vlastný odkaz a nie odkaz zo Supabase (action_link):
//   * odkaz zo Supabase sa „spotrebuje" už tým, že ho niekto otvorí. Náhľad
//     odkazu vo WhatsAppe alebo kontrola odkazov v e-maile ho otvorí skôr
//     ako človek — a človek potom dostane „odkaz vypršal",
//   * náš odkaz vedie do appky (/app/?heslo=1#k=<kód>). Kód je za # (nejde
//     na server ani do záznamov) a overí sa až po kliknutí na „Nastaviť
//     heslo" (supabase.auth.verifyOtp). Otvorenie stránky nič nespotrebuje.
//   * adresa návratu nemá # v sebe: Supabase k nej pridáva vlastný
//     #access_token=… a dva znaky # za sebou by appka neprečítala.
//
// Testy: node app/lib/prihlasenie.test.js
// ============================================================================
(function () {
  const MIN_LEN = 10;
  const APP_DEFAULT = 'https://adlify-app.netlify.app';

  const MSG = {
    expired: 'Odkaz vypršal — požiadajte administrátora o nový.',
    expiredSub: 'Odkaz na nastavenie hesla platí obmedzený čas a dá sa použiť len raz. '
      + 'Ak ste si heslo už nastavili, prihláste sa e-mailom a heslom.',
    note: 'Odkaz platí obmedzený čas (podľa nastavenia Supabase: predvolene 1 h, najviac 24 h) a dá sa použiť raz.',
    forgotSent: 'Ak je e-mail v appke, poslali sme odkaz na nastavenie hesla.',
  };

  const base = (appUrl) => String(appUrl || APP_DEFAULT).trim().replace(/\/+$/, '').replace(/\/app$/, '');

  /** Kam sa človek vráti zo Supabase (Zabudli ste heslo, pôvodný odkaz). */
  function redirectTo(appUrl) { return `${base(appUrl)}/app/?heslo=1`; }

  /** Adresa appky na prihlásenie. */
  function appAddress(appUrl) { return `${base(appUrl)}/app/`; }

  /** Odkaz, ktorý dostane kolega. Kód je za #, takže nejde na server. */
  function setLink(appUrl, tokenHash) {
    return `${redirectTo(appUrl)}#k=${encodeURIComponent(String(tokenHash || ''))}`;
  }

  /**
   * Heslo dvakrát. Supabase má vlastné minimum (predvolene 6 znakov),
   * appka chce aspoň 10 — krátke heslá sa dajú uhádnuť.
   * @returns {{ ok: boolean, error?: string }}
   */
  function checkPassword(p1, p2) {
    const a = String(p1 == null ? '' : p1);
    const b = String(p2 == null ? '' : p2);
    if (!a) return { ok: false, error: 'Zadajte nové heslo.' };
    if (a.length < MIN_LEN) return { ok: false, error: `Heslo musí mať aspoň ${MIN_LEN} znakov (teraz má ${a.length}).` };
    if (/^\s|\s$/.test(a)) return { ok: false, error: 'Heslo nesmie začínať ani končiť medzerou.' };
    if (/^(.)\1+$/.test(a)) return { ok: false, error: 'Heslo nesmie byť jeden znak stále dookola.' };
    if (a !== b) return { ok: false, error: 'Heslá sa nezhodujú — napíšte ho dvakrát rovnako.' };
    return { ok: true };
  }

  /**
   * Čo prišlo v adrese pri otvorení stránky.
   *   token   — náš odkaz s kódom (#k=…), overí sa až po kliknutí,
   *   session — návrat zo Supabase s prihlásením (#access_token=…&type=recovery)
   *             alebo ?heslo=1 bez ničoho (napr. obnovená stránka),
   *   error   — Supabase vrátil chybu (odkaz vypršal alebo bol už použitý),
   *   manual  — #/heslo: prihlásený si mení heslo sám,
   *   null    — nič s heslom.
   */
  function parseReturn(search, hash) {
    const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const h = String(hash || '');
    if (/^#\/heslo(?:[/?]|$)/.test(h)) return { mode: 'manual' };
    const p = new URLSearchParams(h.startsWith('#') && !h.startsWith('#/') ? h.slice(1) : '');
    const err = p.get('error_code') || p.get('error') || p.get('error_description')
      || q.get('error_code') || q.get('error_description');
    const fromLink = q.has('heslo') || p.get('type') === 'recovery';
    if (err && (fromLink || p.get('error_code'))) return { mode: 'error', code: p.get('error_code') || q.get('error_code') || p.get('error') || 'error' };
    if (p.get('k')) return { mode: 'token', token: p.get('k') };
    if (p.get('access_token') && fromLink) return { mode: 'session' };
    if (q.has('heslo')) return { mode: 'session' };
    return null;
  }

  /**
   * Stav prihlásenia člena podľa účtu v Supabase Auth (len server — klient
   * auth.users nevidí). Nikdy nevracia nič tajné: žiadne kódy, heslá ani
   * metadáta navyše — len to, čo sa ukáže v stĺpci „Prihlásenie".
   *
   * `app_metadata` píše len server (service role): danubra_invited = účet
   * založila appka, danubra_link_at = kedy dostal posledný odkaz na heslo.
   * `user_metadata.danubra_password_set_at` zapíše stránka „Nastavte si heslo".
   */
  function stateOf(user) {
    if (!user) return { has_account: false, state: 'none', last_sign_in_at: null, invited_at: null, password_set_at: null, pending: false, external: false };
    const am = user.app_metadata || {};
    const um = user.user_metadata || {};
    const linkAt = am.danubra_link_at || null;
    const pwAt = um.danubra_password_set_at || null;
    const ours = !!am.danubra_invited;
    const signed = user.last_sign_in_at || null;
    // Účet, ktorý založila appka, je aktívny až s nastaveným heslom: kliknutie
    // na odkaz síce prihlási (last_sign_in_at), ale heslo ešte nemusí mať.
    const active = !!signed && (!ours || !!pwAt);
    const pending = !!linkAt && (!pwAt || String(pwAt) < String(linkAt));
    return {
      has_account: true, state: active ? 'active' : 'invited',
      last_sign_in_at: signed, invited_at: linkAt || user.invited_at || null,
      password_set_at: pwAt, pending, external: !ours,
    };
  }

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
  };

  /** Text do stĺpca „Prihlásenie". `st` = riadok z akcie `status` (alebo null = načítava sa). */
  function loginLabel(st, member) {
    if (member && !member.email) return { key: 'noemail', text: 'Bez e-mailu', sub: 'doplňte e-mail, potom sa dá pozvať', tone: 'mute' };
    if (st === undefined || st === null) return { key: 'loading', text: 'zisťujem…', sub: '', tone: 'mute' };
    if (st.error) return { key: 'unknown', text: 'nezistené', sub: st.error, tone: 'mute' };
    if (st.state === 'active') {
      return { key: 'active', text: 'Aktívny', tone: 'green',
        sub: [st.last_sign_in_at ? `posledné prihlásenie dňa ${fmt(st.last_sign_in_at)}` : '',
          st.pending ? `odkaz na nové heslo poslaný ${fmt(st.invited_at)}` : ''].filter(Boolean).join(' · ') };
    }
    if (st.state === 'invited') {
      return { key: 'invited', text: 'Pozvaný (čaká na heslo)', tone: 'amber',
        sub: st.invited_at ? `odkaz poslaný ${fmt(st.invited_at)}` : (st.linked === false ? 'účet existuje, ešte nie je prepojený' : '') };
    }
    return { key: 'none', text: 'Nemá účet', sub: '', tone: 'mute' };
  }

  // Názov firmy z Nastavení (nie zadrôtovaný v kóde).
  const firm = (company) => (String(company || '').trim() ? ` firmy ${String(company).trim()}` : '');
  const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

  /** Krátka správa do WhatsAppu (vykanie). */
  function whatsappText({ name, email, link, appUrl, company } = {}) {
    const n = first(name);
    return `Dobrý deň${n ? `, ${n}` : ''}. Posielam Vám prístup do našej firemnej appky${firm(company)}. `
      + `Heslo si nastavíte cez tento odkaz (platí obmedzený čas a dá sa použiť raz):\n${link}\n\n`
      + `Potom sa prihlasujte na ${appAddress(appUrl)}${email ? ` e-mailom ${email}` : ''} a svojím heslom.`;
  }

  const mailSubject = (company) => `Prístup do firemnej appky${String(company || '').trim() ? ` — ${String(company).trim()}` : ''}`;

  /** E-mail s pozvánkou (vykanie). `link` = null → verzia na uloženie do appky (bez odkazu). */
  function mailText({ name, email, link, appUrl, from, company } = {}) {
    const n = String(name || '').trim();
    return [
      `Dobrý deň${n ? `, ${n}` : ''},`, '',
      `posielam Vám prístup do našej firemnej appky${firm(company)}.`, '',
      `1. Otvorte tento odkaz a nastavte si heslo (aspoň ${MIN_LEN} znakov):`,
      link || '[odkaz na nastavenie hesla — v appke sa z bezpečnosti neukladá]', '',
      `2. Potom sa prihlasujte na ${appAddress(appUrl)}`,
      `   E-mail: ${email || ''}`,
      '   Heslo: to, ktoré si nastavíte.', '',
      'Odkaz platí obmedzený čas a dá sa použiť raz. Ak už nefunguje, napíšte mi a pošlem Vám nový.', '',
      'S pozdravom',
      String(from || '').trim() || String(company || '').trim(),
    ].join('\n');
  }

  const API = {
    MIN_LEN, MSG, redirectTo, appAddress, setLink, checkPassword, parseReturn,
    stateOf, loginLabel, whatsappText, mailSubject, mailText, fmt,
  };
  if (typeof window !== 'undefined') window.DanubraPrihlasenie = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
