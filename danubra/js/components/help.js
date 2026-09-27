// ============================================================================
// DANUBRA — vysvetlivky (okno a tlačidlo „?")
// ============================================================================
// Obsah je v `lib/explain.js`, tu je len to, ako sa zobrazí. Dôvod je jeden:
// text sa dá testovať a prehľadávať, HTML nie.
//
// Tlačidlo má byť malé a tiché. Vysvetlivka je pre toho, kto sa pýta — nie
// pre toho, kto už vie, a ten ju má mať z cesty.
// ============================================================================
(function () {
  const E = () => window.DanubraExplain;

  /** Odstavce, kde `**takto**` je tučné a zvyšok sa zneškodní. */
  function para(s) {
    const safe = UI.esc(String(s));
    return `<p>${safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
  }

  function section(icon, heading, items) {
    if (!items || !items.length) return '';
    return `<section class="hx-sec">
      <h4>${Icon(icon, 14)} ${UI.esc(heading)}</h4>
      ${items.map(para).join('')}
    </section>`;
  }

  const Help = {
    /**
     * Tlačidlo „?". Keď k téme nie je text, nevráti nič — prázdne tlačidlo,
     * ktoré nič neotvorí, je horšie než žiadne.
     */
    btn(key, { size = 14 } = {}) {
      if (!E() || !E().has(key)) return '';
      const t = E().get(key);
      return `<button class="help-btn no-print" onclick="Help.open('${key}')"
        title="${UI.esc(t.title)} — čo to je a prečo je to takto"
        aria-label="Vysvetlivka: ${UI.esc(t.title)}">${Icon('help', size)}</button>`;
    },

    /** Otvorí vysvetlivku. */
    open(key) {
      const t = E() && E().get(key);
      if (!t) return UI.toast('K tomuto zatiaľ vysvetlivka nie je.', 'err');

      const links = (t.links || [])
        .filter(([route]) => !window.Danubra || Danubra.routeAvailable(route));

      UI.modal(t.title, `
        <div class="hx">
          <p class="hx-lead">${UI.esc(t.lead)}</p>
          ${section('doc', 'Čo to je', t.what)}
          ${section('rules', 'Ako sa to počíta', t.how)}
          ${section('zap', 'Prečo je to takto', t.why)}
          ${section('alert', 'Na čo si dať pozor', t.watch)}
          ${links.length ? `<section class="hx-sec hx-links">
            <h4>${Icon('chevron', 14)} Kam ďalej</h4>
            <div class="hx-go">
              ${links.map(([route, label]) => `<button class="link-chip"
                onclick="UI.closeModal();Danubra.go('${route}')">
                ${Icon('chevron', 12)} ${UI.esc(label)}</button>`).join('')}
            </div>
          </section>` : ''}
          <div class="hx-foot">
            <button class="btn btn-ghost btn-sm" onclick="Help.index()">
              ${Icon('help', 14)} Všetky vysvetlivky</button>
          </div>
        </div>`, { wide: true });
    },

    /**
     * Zoznam všetkého, čo je vysvetlené. Je to zároveň odpoveď na otázku
     * „čo tá appka vlastne robí" — bez toho, aby sa po nej muselo klikať.
     */
    index() {
      if (!E()) return;
      const GROUPS = [
        ['Celá appka', k => k === 'app'],
        ['Prehľad', k => k.startsWith('dash.') || k === 'screen.dashboard'],
        ['Dlaždice hore', k => k.startsWith('kpi.')],
        ['Karty prehľadu', k => k.startsWith('card.')],
        ['Obrazovky', k => k.startsWith('screen.') && k !== 'screen.dashboard'],
      ];
      const all = E().keys();
      const used = new Set();
      const html = GROUPS.map(([label, test]) => {
        const items = all.filter(k => test(k) && !used.has(k));
        items.forEach(k => used.add(k));
        if (!items.length) return '';
        return `<section class="hx-sec">
          <h4>${UI.esc(label)}</h4>
          <div class="hx-list">
            ${items.map(k => {
              const t = E().get(k);
              return `<button class="hx-item" onclick="Help.open('${k}')">
                <strong>${UI.esc(t.title)}</strong>
                <span>${UI.esc(t.lead)}</span>
              </button>`;
            }).join('')}
          </div>
        </section>`;
      }).join('');

      UI.modal('Vysvetlivky', `<div class="hx">
        <p class="hx-lead">Ku každému číslu je napísané, čo to je, ako sa počíta
          a prečo je to takto spravené.</p>
        ${html}
      </div>`, { wide: true });
    },
  };

  window.Help = Help;
})();
