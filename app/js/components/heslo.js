// ============================================================================
// DANUBRA — „Nastavte si heslo" a „Zabudli ste heslo?"
// ============================================================================
// Kolega dostane od admina odkaz (Nastavenia → Používatelia → Pozvať do appky)
// alebo si ho pošle sám na prihlasovacej stránke. Odkaz vedie sem:
//
//   /app/?heslo=1#k=<kód>     náš odkaz — kód sa overí až po kliknutí na
//                             „Nastaviť heslo" (verifyOtp), takže náhľad
//                             odkazu vo WhatsAppe ho nespotrebuje,
//   /app/?heslo=1#access_token=…&type=recovery
//                             návrat zo Supabase („Zabudli ste heslo?") —
//                             supabase-js prihlásenie prečíta z adresy sám,
//   /app/?heslo=1#error=…     odkaz vypršal alebo už bol použitý,
//   /app/#/heslo              prihlásený si mení heslo sám.
//
// Obrazovka leží nad celou appkou (aj nad prihlásením) — rieši sa skôr ako
// prihlásenie. Po uložení hesla sa appka načíta znova už prihlásená.
// Pravidlá hesla a texty sú v lib/prihlasenie.js (testy: prihlasenie.test.js).
// ============================================================================
(function () {
  const P = () => window.DanubraPrihlasenie;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s) => (window.Icon && Icon.has && Icon.has(n) ? Icon(n, s) : '');

  const CSS = `
.login-link { display: block; margin: 2px auto 0; background: none; border: 0; padding: 6px 4px; color: var(--ink-sub);
  font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; font-family: inherit; }
.login-link:hover { color: var(--brand-700, #C25C0C); }
.login-alt, .hs-form { display: grid; gap: 14px; }
.login-alt label, .hs-form label { display: grid; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--ink-sub); }
.login-alt input, .hs-form input { padding: 11px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 14px; background: var(--field); font-family: inherit; }
.login-alt input:focus, .hs-form input:focus { outline: none; border-color: var(--brand); background: #fff; }
.login-alt-t, .hs-t { font-size: 18px; font-weight: 700; color: var(--ink); text-align: center; line-height: 1.3; }
.login-alt-s, .hs-s { margin: -6px 0 0; font-size: 13px; color: var(--ink-sub); text-align: center; line-height: 1.5; }
.login-note { background: var(--green-50, #E7F7EE); color: var(--ink); padding: 10px 14px; border-radius: var(--radius-sm);
  font-size: 13px; text-align: center; line-height: 1.45; }
.login-note.is-warn { background: var(--brand-50, #FDEEE1); }
.hs-screen { position: fixed; inset: 0; z-index: 9000; overflow-y: auto; }
#heslo-screen { z-index: 9001; }
.hs-hint { margin: -8px 0 0; font-size: 12px; color: var(--ink-sub); line-height: 1.45; }
.hs-ico { display: flex; justify-content: center; color: var(--brand); margin-bottom: -4px; }
.hs-form .hs-show { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink-sub); cursor: pointer; }
.hs-form .hs-show input { width: 16px; height: 16px; margin: 0; padding: 0; }
.hs-who { font-weight: 600; color: var(--ink); word-break: break-all; }
`;

  const H = {
    mode: null, token: null, verified: false, email: null,
    /** Po uložení hesla — načítať appku znova, už prihlásený (test to podvrhne). */
    after() { location.replace(`${location.pathname}#/`); },

    boot() {
      if (typeof document === 'undefined' || !document.head || !window.DB || !P()) return;
      try {
        const st = document.createElement('style');
        st.id = 'heslo-css'; st.textContent = CSS;
        document.head.appendChild(st);
      } catch (e) { /* bez štýlov sa dá stále použiť */ }
      this.bindForgot();
      const boot = DB.bootUrl || { search: location.search, hash: location.hash };
      const r = P().parseReturn(boot.search, boot.hash);
      if (r) this.start(r);
      window.addEventListener('hashchange', () => {
        if (/^#\/heslo(?:[/?]|$)/.test(location.hash || '') && !$('heslo-screen')) this.start({ mode: 'manual' });
      });
    },

    // ── Zabudli ste heslo? ─────────────────────────────────────────────────
    bindForgot() {
      const link = $('login-forgot'), form = $('forgot-form'), login = $('login-form'), back = $('forgot-back');
      if (!link || !form || !login || !link.addEventListener) return;
      link.addEventListener('click', () => {
        login.hidden = true; form.hidden = false;
        const msg = $('forgot-msg'); if (msg) msg.hidden = true;
        const e = $('forgot-email'), le = $('login-email');
        if (e && le && le.value && !e.value) e.value = le.value;
        if (e) e.focus();
      });
      if (back) back.addEventListener('click', () => { form.hidden = true; login.hidden = false; });
      form.addEventListener('submit', (ev) => this.forgot(ev));
    },

    async forgot(ev) {
      if (ev) ev.preventDefault();
      const email = String(($('forgot-email') || {}).value || '').trim();
      const btn = $('forgot-btn'), msg = $('forgot-msg');
      if (!email) return;
      btn.disabled = true; btn.textContent = 'Posielam…';
      let error = null;
      try {
        const r = await DB.client.auth.resetPasswordForEmail(email, { redirectTo: P().redirectTo(location.origin) });
        error = r && r.error;
      } catch (e) { error = e; }
      btn.disabled = false; btn.textContent = 'Poslať odkaz';
      // Vždy tá istá veta — nech sa podľa odpovede nedá zistiť, kto v appke je.
      // Len pri limite odosielania sa povie, že treba chvíľu počkať.
      const rate = error && (Number(error.status) === 429 || /rate|seconds/i.test(error.message || ''));
      msg.textContent = rate
        ? 'Teraz sa nedá poslať ďalší e-mail. Skúste to o niekoľko minút alebo požiadajte administrátora o odkaz.'
        : `${P().MSG.forgotSent} Pozrite si aj priečinok Nevyžiadaná pošta.`;
      msg.classList.toggle('is-warn', !!rate);
      msg.hidden = false;
    },

    // ── Nastavte si heslo ──────────────────────────────────────────────────
    async start(r) {
      this.mode = r.mode; this.token = r.token || null; this.verified = false; this.email = null;
      // Kód a chyba z adresy preč — nech neostanú v histórii ani v záložke.
      if (r.mode === 'token' || r.mode === 'error') {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nič */ }
      }
      if (r.mode === 'error') return this.expired();
      if (r.mode === 'token') return this.form();
      this.screen(`<div class="hs-t">Overujem odkaz…</div>`);
      let session = null;
      try {
        const { data } = await DB.client.auth.getSession();
        session = data && data.session;
      } catch (e) { session = null; }
      if (!session) {
        // #/heslo bez prihlásenia: obyčajné prihlásenie (má tam „Zabudli ste heslo?").
        if (r.mode === 'manual') { this.close(); try { location.hash = '#/'; } catch (e) { /* nič */ } return; }
        return this.expired();
      }
      this.verified = true;
      this.email = (session.user && session.user.email) || null;
      return this.form();
    },

    screen(inner) {
      let el = $('heslo-screen');
      if (!el) {
        el = document.createElement('div');
        el.id = 'heslo-screen';
        el.className = 'login-screen hs-screen';
        document.body.appendChild(el);
      }
      const brand = ($('login-screen') && $('login-screen').querySelector('.login-brand')) || null;
      el.innerHTML = `<div class="login-card">${brand ? brand.outerHTML : ''}${inner}</div>`;
      return el;
    },

    close() { const el = $('heslo-screen'); if (el) el.remove(); },

    /**
     * Prihlásený, ale nie je v tíme (žiadny aktívny riadok v Používateľoch).
     * `who` = { email, off } ukáže správu, `null` ju zavrie. Volá app.js
     * pri každom vykreslení (_render).
     */
    noAccess(who) {
      let el = $('noaccess-screen');
      if (!who) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'noaccess-screen';
        el.className = 'login-screen hs-screen';
        el.setAttribute('role', 'alertdialog');
        document.body.appendChild(el);
      }
      const brand = ($('login-screen') && $('login-screen').querySelector('.login-brand')) || null;
      const mail = who.email ? ` (rovnaký e-mail: ${who.email})` : '';
      const title = who.off ? 'Váš prístup do appky je vypnutý.' : 'Váš účet ešte nie je priradený k tímu.';
      const ask = who.off
        ? `Požiadajte administrátora, aby Vám ho znova zapol v Nastavenia → Používatelia${mail}.`
        : `Požiadajte administrátora, aby Vás pridal v Nastavenia → Používatelia${mail}.`;
      el.innerHTML = `<div class="login-card">${brand ? brand.outerHTML : ''}
        <div class="hs-form">
          <div class="hs-ico">${ico('lock', 30)}</div>
          <div class="hs-t" id="noaccess-title">${esc(title)}</div>
          <p class="hs-s" id="noaccess-text">${esc(ask)}</p>
          <p class="hs-s">Keď to urobí, odhláste sa a prihláste znova.</p>
          <button type="button" class="btn btn-primary btn-block" id="noaccess-logout">${ico('logout', 15)} Odhlásiť sa</button>
        </div></div>`;
      el.querySelector('#noaccess-logout').addEventListener('click', () => {
        if (window.Danubra && Danubra.logout) Danubra.logout();
        else if (window.DB) DB.signOut().then(() => location.reload());
      });
    },

    form() {
      const manual = this.mode === 'manual';
      const min = P().MIN_LEN;
      const el = this.screen(`
        <form class="hs-form" id="heslo-form" novalidate>
          <div class="hs-t">${manual ? 'Zmeniť heslo' : 'Nastavte si heslo'}</div>
          <p class="hs-s">${this.email ? `Pre účet <span class="hs-who">${esc(this.email)}</span>. ` : ''}Týmto heslom
            sa potom budete prihlasovať do appky.</p>
          <label>Nové heslo
            <input type="password" id="heslo-1" autocomplete="new-password" minlength="${min}" required>
          </label>
          <label>Heslo ešte raz
            <input type="password" id="heslo-2" autocomplete="new-password" minlength="${min}" required>
          </label>
          <p class="hs-hint">Aspoň ${min} znakov. Najľahšie si zapamätáte niekoľko slov za sebou,
            napríklad <em>modrá-lavica-pri-Dunaji</em>. Nepoužívajte heslo z iných stránok.</p>
          <label class="hs-show"><input type="checkbox" id="heslo-show"> Ukázať heslo</label>
          <button type="submit" class="btn btn-primary btn-block" id="heslo-btn">${manual ? 'Uložiť nové heslo' : 'Nastaviť heslo a pokračovať'}</button>
          <div id="heslo-error" class="login-error" role="alert" hidden></div>
          ${manual ? '<button type="button" class="login-link" id="heslo-cancel">Zrušiť</button>' : ''}
        </form>`);
      el.querySelector('#heslo-form').addEventListener('submit', (e) => this.submit(e));
      el.querySelector('#heslo-show').addEventListener('change', (e) => {
        for (const id of ['heslo-1', 'heslo-2']) $(id).type = e.target.checked ? 'text' : 'password';
      });
      const c = el.querySelector('#heslo-cancel');
      if (c) c.addEventListener('click', () => { this.close(); try { history.back(); } catch (e) { /* nič */ } });
      const first = $('heslo-1'); if (first) first.focus();
    },

    err(text) {
      const e = $('heslo-error');
      if (!e) return;
      e.textContent = text; e.hidden = false;
    },

    expired() {
      const el = this.screen(`
        <div class="hs-form">
          <div class="hs-ico">${ico('alert', 30)}</div>
          <div class="hs-t" id="heslo-expired">${esc(P().MSG.expired)}</div>
          <p class="hs-s">${esc(P().MSG.expiredSub)}</p>
          <button type="button" class="btn btn-primary btn-block" id="heslo-login">Späť na prihlásenie</button>
        </div>`);
      el.querySelector('#heslo-login').addEventListener('click', () => {
        this.close();
        try { history.replaceState(null, '', `${location.pathname}#/`); } catch (e) { /* nič */ }
      });
    },

    /** Chyba zo Supabase po slovensky. `null` = odkaz už neplatí. */
    message(error) {
      const t = `${error && error.code ? error.code : ''} ${error && error.message ? error.message : ''}`;
      if (/same_password|different from the old/i.test(t)) return 'Nové heslo musí byť iné ako doterajšie.';
      if (/weak|pwned|leaked|characters/i.test(t)) return 'Heslo je príliš slabé alebo sa objavilo v únikoch hesiel. Zvoľte iné.';
      if (/reauth/i.test(t)) return 'Z bezpečnosti sa najprv odhláste, prihláste sa znova a potom si heslo zmeňte.';
      if (/session|jwt|expired|not authenticated|invalid/i.test(t)) return null;
      return 'Heslo sa nepodarilo uložiť. Skúste to o chvíľu.';
    },

    async submit(ev) {
      if (ev) ev.preventDefault();
      const p1 = $('heslo-1').value, p2 = $('heslo-2').value;
      const c = P().checkPassword(p1, p2);
      if (!c.ok) return this.err(c.error);
      const btn = $('heslo-btn');
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Ukladám…';
      const fail = (text) => { btn.disabled = false; btn.textContent = label; this.err(text); };
      try {
        if (this.mode === 'token' && !this.verified) {
          const { error } = await DB.client.auth.verifyOtp({ token_hash: this.token, type: 'recovery' });
          if (error) return this.expired();
          this.verified = true;
        }
        const { error } = await DB.client.auth.updateUser({ password: p1, data: { danubra_password_set_at: new Date().toISOString() } });
        if (error) {
          const m = this.message(error);
          return m === null ? this.expired() : fail(m);
        }
      } catch (e) {
        return fail('Spojenie zlyhalo. Skontrolujte internet a skúste to znova.');
      }
      this.screen(`<div class="hs-form"><div class="hs-ico">${ico('check', 30)}</div>
        <div class="hs-t" id="heslo-done">Heslo je nastavené</div>
        <p class="hs-s">Otváram appku…</p></div>`);
      setTimeout(() => this.after(), 700);
    },
  };

  window.Heslo = H;
  try { H.boot(); } catch (e) { console.error('[danubra] heslo', e); }
})();
