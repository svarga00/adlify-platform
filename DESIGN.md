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

| Modul | Súbor | Status | Design screen | Poznámky |
|-------|-------|--------|---------------|----------|
| **Dashboard** | `modules/dashboard/dashboard.js` | ✅ | `ScreenDashboard` (hero variant) | MRR hero gradient + 2 Stats, Pipeline donut s legend listom, Activity bar (Chart.js), 3 bottom cards (QA + Recent leads + Metrics) |
| **Leady** | `modules/leads/leads.js` | ✅ (list + filter) | `ScreenLeads` | Detail modal (analysis), Import/Pridať tab — **NEUROBENÉ** |
| **Lead Detail** | — (modal v leads.js) | ⏳ | `ScreenLeadDetail` | Left: profil + socials + contacts; Right: AI analysis (kompetenti, ideal klient, nápady kampaní) |
| **Klienti** | `modules/clients/clients.js` | ⏳ | `ScreenClients` | Grid cards: logo + meno + MRR + stats, filter by status |
| **Klient Detail** | — | ⏳ | `ScreenClientDetail` | Header s logom + MRR, taby: Prehľad/Projekty/Faktúry/Dokumenty |
| **Projekty** | `modules/projects/projects.js` | 🟡 (sčasti v F2) | `ScreenProjects` | **Kanban** view (draft/generating/internal_review/client_review/approved/active) + detail modal taby |
| **Kampane** | `modules/campaigns/campaigns.js` | ⏳ | `ScreenCampaigns` | Table s platformami, performance metriky, status switch |
| **Inbox / Správy** | `modules/messages/messages.js` | ⏳ | `ScreenInbox` | 3-column: threads / messages / context. Email+chat hybrid. |
| **Úlohy** | `modules/tasks/tasks.js` | ⏳ | `ScreenTasks` | Kanban by status + priority chips |
| **Tickety** | `modules/tickets/tickets.js` | ⏳ | `ScreenTickets` | List + chat detail, SLA chip |
| **Fakturácia** | `modules/billing/billing.js` | ⏳ | `ScreenInvoicing` | Table s stavmi zaplatených, MRR summary |
| **Onboarding** | `modules/onboarding/onboarding.js` | ⏳ | `ScreenOnboarding` | Multi-step forma, progress, súčasný UX zachovať |
| **Služby & Balíčky** | `modules/services/services.js` | ⏳ | `ScreenServices` | Pricing cards |
| **Reporty** | `modules/reporting/reporting.js` | ⏳ | `ScreenReports` | Charts grid |
| **Kalendár** | `modules/calendar/calendar.js` | ⏳ | `ScreenCalendar` | Týždeň view + agenda list |
| **Šablóny** | `modules/templates/templates.js` | ⏳ | `ScreenTemplates` | Library + editor |
| **Dokumenty** | `modules/documents/documents.js` | ⏳ | `ScreenDocuments` | Folder tree + preview |
| **Keywords** | `modules/keywords/keywords.js` | ⏳ | `ScreenKeywords` | Tabuľka s volume/CPC, filter, export |
| **Nastavenia** | `modules/settings/settings.js` | ⏳ | `ScreenSettings` | Sekcie s karotkami |
| **Integrácie** | `modules/integrations/integrations.js` | ⏳ | — (v Settings?) | Karty per integrácia (Meta, Google, Marketing Miner…) |
| **Tím** | `modules/team/team.js` | ⏳ | — | User list + roles |

**Chrome admin:** ✅ (Sidebar + Topbar `modules F3`)

---

## Klient portál moduly — status redesignu

| Modul | Súbor | Status | Design screen | Poznámky |
|-------|-------|--------|---------------|----------|
| **Login** | `portal/login.html` | ⏳ | `ScreenPortalLogin` | Split screen: orange hero left + form right |
| **Register** | `portal/register.html` | ⏳ | — | Podobne ako login |
| **Dashboard** | `portal/index.html` | ⏳ | `ScreenPortalDashboard` | Performance hero + KPI cards + kampane overview + messages teaser |
| **Proposal (klient view)** | `portal/proposal.html` | ✅ (F2 content) | — | Obsah hotový, ale chrome nie |
| **Reporty** | — v `portal/index.html` | ⏳ | `ScreenPortalReports` | Line charts, metriky per kampaň |
| **Kampane status** | — | ⏳ | `ScreenPortalCampaigns` | List kampaní s results |
| **Správy/Chat** | — | ⏳ | `ScreenPortalMessages` | Chat s agenturou |
| **Schvaľovanie kreatív** | — | ⏳ | `ScreenPortalApprovals` | Grid obrázkov + approve/reject |
| **Kalendár/meetingy** | — | ⏳ | `ScreenPortalCalendar` | Agenda list |
| **Tickety/podpora** | — | ⏳ | `ScreenPortalTickets` | List + detail |
| **Faktúry a platby** | — | ⏳ | `ScreenPortalInvoices` | Table + pay button |
| **Dokumenty/zmluvy** | — | ⏳ | `ScreenPortalDocuments` | Folder + download |
| **Nastavenia účtu** | — | ⏳ | `ScreenPortalSettings` | Profile + brand + notifications |

**Portal chrome:** ⏳ — podobný sidebar ako admin ale s "Klient" tagom a menšou sadou položiek (groupy Prehľad/Spolupráca/Administratíva)

---

## Poradie práce (navrhované)

1. ✅ **F1** — Design fundament (tokens, icons, UI, chrome CSS)
2. ✅ **F2** — Dashboard + Leady list
3. ✅ **F3** — Admin chrome (sidebar + topbar)
4. ➡ **F4** — Klienti list + detail (CRM-style, druhý najčastejší)
5. ➡ **F5** — Projekty kanban + detail modal
6. ➡ **F6** — Klient portál chrome + Dashboard + Login
7. ➡ **F7** — Lead detail modal + Kampane list
8. ➡ **F8** — Úlohy + Tickety + Inbox (3 moduly naraz, podobný tvar)
9. ➡ **F9** — Fakturácia + Reporty + Kalendár
10. ➡ **F10** — Ostatné (Šablóny, Dokumenty, Keywords, Nastavenia, Integrácie, Tím)
11. ➡ **Polishing** — detail modálky, edit forms, tlačidlá, dropdowns, toasty

**Princíp:** per modul prepisujeme len UI layer (template/render funkcie a CSS triedy). Business logika (calculateStats, load funkcie, API volania, flows) zostáva.

---

## Brand pravidlá (pripomenutie)

- **Nikdy** nespomínaj AI/automatizáciu v klient-facing texte
- Tón: **profesionálny, množné číslo** („pre Vás pripravujeme")
- Cenová politika: 149–799€/mes (štandard), 299–899€/mes (e-shop)
- Klient vidí **seriózna agentúra**, nie „AI tool"
