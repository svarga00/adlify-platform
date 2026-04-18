# Adlify Design Reference

Interný dokument pre redesign podľa **design bundle** z claude.ai/design
(uložený v `/tmp/design-bundle/adlify-app/project/`). Slúži ako
referencia pre postupné prerobenie modulov — **jeden modul per commit**.

---

## Design tokens (shared/css/tokens.css)

| Skupina | Kľúčové tokeny |
|---------|----------------|
| Brand   | `--brand-500: #F97316` (primary) · `--brand-600: #EA5A0B` (hover) |
| Neutral | `--n-0` (white) … `--n-900` (#14120E). BG `--n-50` #F7F5F1. |
| Pastel  | `--acc-sky`, `--acc-mint`, `--acc-lavender`, `--acc-rose`, `--acc-amber` + `-ink` varianty |
| Shadow  | `--sh-xs/sm/md/lg/float` — very soft |
| Radius  | `--r-sm/md/lg/xl/full` (4/10/14/20/999px) |
| Font    | Inter (UI), JetBrains Mono (čísla) |
| Density | gap 16px, pad 20px, row 44px |

**Pravidlo:** NIKDY emoji v UI. Všetko cez `window.I.XxxIcon({size})` (SVG).

---

## UI primitívy (shared/css/ui.css)

| Class | Ekvivalent v design bundle |
|-------|----------------------------|
| `.adl-chip [adl-chip-{tone}] [adl-chip-sm]` | `<Chip tone=...>` — dots dot `<span class="dot"></span>` |
| `.adl-btn [adl-btn-{primary|ink|outline|ghost|soft|danger|icon}] [adl-btn-sm|lg]` | `<Btn variant=...>` |
| `.adl-card > .adl-card-header > .adl-card-title / .adl-card-body` | `<Card title right>` |
| `.adl-stat > .adl-stat-head / .adl-stat-label / .adl-stat-value / .adl-stat-delta` | `<Stat label value delta accent="hero">` |
| `.adl-avatar [adl-avatar-sm|lg|xl]` | `<Avatar name size>` |
| `.adl-input / .adl-input-search / .adl-kbd` | input field |
| `.adl-table-wrap > .adl-table [adl-table-compact]` | `<Table cols rows>` |

**Chrome (shared/css/chrome.css):** `.adl-frame > .adl-sidebar + .adl-main > .adl-topbar + .adl-content`

---

## Admin moduly — status redesignu

| Modul | Súbor | Status | Poznámky |
|-------|-------|--------|----------|
| **Chrome (sidebar+topbar)** | `admin/index.html` | ✅ | Light sidebar, svg ikony, scroll fix, mobile drawer s popismi |
| **Dashboard** | `modules/dashboard/dashboard.js` | ✅ | Hero MRR + 2 stats, Pipeline donut, Activity bar, Quick actions, Recent leads, Metrics |
| **Leady** | `modules/leads/leads.js` | ✅ | List + filter + table (detail modal obsah zachovaný z F2) |
| **Klienti** | `modules/clients/clients.js` | ✅ | 3-column grid cards, logo chip, status, MRR mono |
| **Klient Detail** | — | 🟡 | Zachovaný (renderDetail v clients.js), UI light |
| **Projekty** | `modules/projects/projects.js` | ✅ | Kanban (6 stĺpcov) + grid toggle, workflow dots, detail taby |
| **Kampane** | `modules/campaigns/campaigns.js` | ✅ | Cards s metrikami, platform toggle, grouping by client |
| **Inbox / Správy** | `modules/messages/messages.js` | 🟡 | Zachovaný — komplexný 2-panel email/chat layout, neskôr |
| **Úlohy** | `modules/tasks/tasks.js` | ✅ | Kanban + list toggle, drag&drop, priority chips |
| **Tickety** | `modules/tickets/tickets.js` | ✅ | List cards s priority/status/kategória chipmi |
| **Fakturácia** | `modules/billing/billing.js` | ✅ (header+tabs) | Content tabov zachovaný, header a tabs adl |
| **Onboarding** | `modules/onboarding/onboarding.js` | 🟡 | Zachovaný — multi-step s vlastnými komponentmi |
| **Služby & Balíčky** | `modules/services/services.js` | ✅ | Pilule taby (Balíčky/Služby) |
| **Reporty** | `modules/reporting/reporting.js` | ✅ (header) | Obsah charts zachovaný |
| **Kalendár** | `modules/calendar/calendar.js` | ✅ (header+nav) | View toggle + chevron nav |
| **Šablóny** | `modules/templates/templates.js` | ✅ | Type filter pilule |
| **Dokumenty** | `modules/documents/documents.js` | ✅ | 4 stats + category filter pilule + search |
| **Keywords** | `modules/keywords/keywords.js` | ✅ | Quick search card + feature chipy, history card |
| **Nastavenia** | `modules/settings/settings.js` | ✅ (header+tabs) | 7 scrollable tabs |
| **Integrácie** | `modules/integrations/integrations.js` | ✅ | Light modal |
| **Tím** | `modules/team/team.js` | ✅ | Invite btn, 3 pill tabs |
| **Automatizácie** | `modules/automations/automations.js` | ✅ | 3 stat karty + templates grid |

---

## Klient portál moduly — status redesignu

| Modul | Súbor | Status | Poznámky |
|-------|-------|--------|----------|
| **Login** | `portal/login.html` | ✅ | Split 50/50 form + hero s testimonialom, Martin Jabĺčko + 3 stats |
| **Register** | `portal/register.html` | ✅ (čiastočne) | Gradient zjednodušený, SVG ikony vo features |
| **Dashboard** | `portal/index.html` | ✅ | Logo + Klient chip, nav tabs s ikonami, welcome card gradient, stats s farebnými ikonami, empty states |
| **Proposal (klient view)** | `portal/proposal.html` | ✅ | Hotový v F2, má všetky sekcie návrhu kampane |
| **Campaigns tab** | (v `portal/index.html`) | ✅ | Item list s Fb/Google ikonami |
| **Invoices tab** | (v `portal/index.html`) | ✅ | Item list s Invoice ikonou |
| **Documents tab** | (v `portal/index.html`) | ✅ | Item list s category ikonami |
| **Support tab** | (v `portal/index.html`) | 🟡 | Zachovaný, ostáva redesignovať |
| **Account tab** | (v `portal/index.html`) | 🟡 | Zachovaný, ostáva redesignovať |

**Portal chrome:** používa tabs-style nav v headeri (nie sidebar). Pre budúcnosť: ak bude portál rásť, môžeme pridať sidebar variant s 'portal' módom v `chrome.css`.

---

## Poradie práce — HOTOVO

1. ✅ **F1** — Design fundament (tokens, icons, UI, chrome CSS)
2. ✅ **F2** — Dashboard + Leady list
3. ✅ **F3** — Admin chrome (sidebar + topbar)
4. ✅ **F4** — Klienti list
5. ✅ **F5** — Projekty kanban + grid
6. ✅ **F6** — Kampane, Úlohy, Tickety, Fakturácia
7. ✅ **F7** — Služby, Keywords, Dokumenty, Šablóny
8. ✅ **F8** — Reporty, Kalendár, Nastavenia, Integrácie, Tím, Automatizácie
9. ✅ **F9** — Klient portál (login, register, dashboard)
10. ✅ **Responsive** — globálne mobile CSS pravidlá v `responsive.css`

## Ostáva (polishing / deep redesign)

- **Messages/Inbox** — komplexný 2-panel layout, vyžaduje dedikovaný rewrite
- **Onboarding** — multi-step flow s vlastnými komponentmi (PlatformSelector, PackageCalculator, AccountHealthCheck); cieľový screen `ScreenOnboarding`
- **Lead Detail modal** — `ScreenLeadDetail` má left/right split (profil + AI analysis)
- **Klient Detail modal** — `ScreenClientDetail` má header s MRR + taby Prehľad/Projekty/Faktúry/Dokumenty
- **Edit forms a create modály** — v Klienti, Projekty, Kampane atď. — majú ešte pôvodné štýly
- **Portal Support + Account taby** — ostali v pôvodnom markupe
- **Portal chrome** — ak portál rastie, pridať `mode="portal"` variant sidebaru

**Princíp:** per modul prepisujeme len UI layer (template/render funkcie a CSS triedy). Business logika (calculateStats, load funkcie, API volania, flows) zostáva.

---

## Brand pravidlá (pripomenutie)

- **Nikdy** nespomínaj AI/automatizáciu v klient-facing texte
- Tón: **profesionálny, množné číslo** („pre Vás pripravujeme")
- Cenová politika: 149–799€/mes (štandard), 299–899€/mes (e-shop)
- Klient vidí **seriózna agentúra**, nie „AI tool"
