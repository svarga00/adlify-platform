# Adlify Design System v1

Tento priečinok obsahuje **handoff bundle** z Claude Design — kompletný redesign Adlify appky a klientskeho portálu.

## Obsah

| Súbor / priečinok | Popis |
|---|---|
| `Adlify Design.html` | Hlavný React canvas s 38 obrazovkami (admin + portál + mobil) |
| `Feature Spec.html` | Detailný spec — moduly, role matica, roadmap (~735 riadkov) |
| `chats/chat1.md` | Pôvodná konverzácia s design asistentom — `čo užívateľ chcel` |
| `src/*.jsx` | React/JSX prototypy: `chrome` (sidebar+topbar), `ui` (Card, Btn, Chip…), `icons` (~50 stroke), `screens-admin-1..3`, `screens-portal`, `screens-mobile` |
| `styles/tokens.css` | Design tokens (farby, spacing, type, shadows) |

> ℹ️ Súbory sú **read-only referencia** — nepoužívajú sa za runtime.
> Implementácia žije v `shared/css/` a `shared/js/`.

## Implementácia v Adlify

Design je port-ovaný do Adlify postupne, **PR po PR**:

### ✅ Foundation (tento PR)

- `shared/css/tokens.css` — všetky tokeny ako `--adl-*` custom properties (light + dark theme)
- `shared/css/components.css` — base CSS classy: `.adl-btn`, `.adl-card`, `.adl-chip`, `.adl-stat`, `.adl-avatar`, `.adl-badge`, `.adl-input`, `.adl-table`, atď.
- `shared/js/core/icons.js` — `window.Icons` API postavená na [Lucide](https://lucide.dev) CDN + custom logo SVG
- `admin/index.html` — pridaný Lucide CDN, JetBrains Mono font, prepojené nové CSS

### 🔜 Chrome (ďalší PR)

Nový sidebar (full / icon / floating variant) + topbar (search, breadcrumbs, bell) — port z `src/chrome.jsx`.

### 🔜 Moduly (postupne)

Dashboard → Leady → Klienti → Projekty → Kampane → Onboarding → … podľa priority užívateľa. Každý modul = jeden PR.

## Quick reference — design tokens

```css
/* Brand */
--adl-brand-500: #F97316;   /* primary orange */
--adl-brand-700: #C2410C;   /* hover/active */

/* Surfaces (light) */
--adl-bg:      #F7F5F1;     /* warm off-white */
--adl-surface: #FFFFFF;
--adl-border:  #EAE6DE;
--adl-ink:     #14120E;     /* primary text */

/* Pastel akcenty pre tagy/charts */
--adl-acc-sky / --adl-acc-mint / --adl-acc-lavender /
--adl-acc-rose / --adl-acc-amber

/* Type */
--adl-font-sans: 'Inter', system-ui, …
--adl-font-mono: 'JetBrains Mono', …
```

## Quick reference — komponenty (opt-in)

```html
<div class="adl">
  <!-- Buttons -->
  <button class="adl-btn adl-btn--primary">Pridať</button>
  <button class="adl-btn adl-btn--outline adl-btn--sm">Filter</button>

  <!-- Card -->
  <div class="adl-card">
    <div class="adl-card__header">
      <div class="adl-card__title">Posledné leady</div>
    </div>
    <div class="adl-card__body">…</div>
  </div>

  <!-- Chip -->
  <span class="adl-chip adl-chip--mint">Aktívna</span>
  <span class="adl-chip adl-chip--brand">+12%</span>

  <!-- Stat -->
  <div class="adl-stat adl-stat--hero">
    <div class="adl-stat__top">
      <div class="adl-stat__label">Mesačný príjem · MRR</div>
    </div>
    <div class="adl-stat__value">5 416 €</div>
    <div class="adl-stat__delta adl-stat__delta--pos">+12.4%</div>
  </div>
</div>
```

> ⚠️ Bez `class="adl"` na koreňovom kontajneri sa **font-family a base štýly neaplikujú** — toto je úmyselné, aby sa neporušila aktuálna Tailwind-založená appka.

## Quick reference — ikony

```js
// SVG markup ako string:
container.innerHTML = `<div>${Icons.svg('dashboard', { size: 18 })} Dashboard</div>`;

// Cez data-atribút (auto-render):
container.innerHTML = '<i data-icon="leads" data-size="20"></i>';
Icons.refresh(container);

// Element priamo:
const svgEl = Icons.create('settings', { size: 16, color: 'var(--adl-ink-sub)' });
```

Sémantické aliasy: `dashboard`, `leads`, `clients`, `projects`, `campaigns`,
`marketing`, `mail`, `tasks`, `tickets`, `invoice`, `onboarding`, `services`,
`reports`, `calendar`, `templates`, `documents`, `keywords`, `automations`,
`settings`, `integrations`, `team`, atď. Plný zoznam v `shared/js/core/icons.js` (ALIASES).

## Princípy z designu

- **Soft modern** — off-white pozadia, jemné tiene, oranžový akcent
- **Bez emoji** — len stroke ikony (Lucide / custom)
- **Inter + JetBrains Mono** — sans pre text, mono pre čísla/skratky
- **Vyvážená SaaS hustota** — `--adl-gap: 16px`, `--adl-pad: 20px`, `--adl-row: 44px`
- **Pastel accents** — sky/mint/lavender/rose/amber pre tagy a charts (nie pre primárne akcie)
