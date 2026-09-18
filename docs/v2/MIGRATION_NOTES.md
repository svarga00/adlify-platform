# DANUBRA Hub v2 — poznámky k migrácii (FÁZA F0)

Stav k 16. 9. 2026, doplnené po napísaní zadania.

Pôvodné tri dokumenty sa nenašli (bod 1), tak boli **napísané nanovo** —
`01_DANUBRA_Hub_v2_navrh.md`, `02_DANUBRA_Hub_v2_schema.sql`,
`03_DANUBRA_Hub_v2_superfaktura.md`. Rozhodnutia, ktoré pri tom padli, sú
v `DECISIONS.md`. Tento dokument teda už nie je zablokovaný — treba ho len
prejsť a povedať, čo nesedí.

---

## 1. Čo chýbalo a ako sa to vyriešilo

### 1.1 Zadávacie dokumenty neexistujú

Hľadal som `docs/v2/01_DANUBRA_Hub_v2_navrh.md`, `02_DANUBRA_Hub_v2_schema.sql`
a `03_DANUBRA_Hub_v2_superfaktura.md`:

| Kde | Výsledok |
|---|---|
| pracovný strom repozitára | nie je |
| všetky vetvy (`git log --all`) | nie je |
| celá história (`--diff-filter=A`) | nie je |
| Google Drive (celý účet + priečinok DANUBRA) | nie je |
| súborový systém stroja | nie je |

V histórii je commit `a79ee9c` s názvom „V2", ale ide o
`database/migrations/v2_architecture.sql` z **Adlify** (január 2026), nesúvisí.

Adresár `docs/` bol odstránený pri čistke Adlify v PR #112 — obsahoval však len
`audit-intake-integration.md` a `gmail-oauth-setup.md`, žiadne v2 dokumenty.

**Vyriešené:** dokumenty boli napísané nanovo na základe v1, `BIZNIS-KONTEXT.md`
a oficiálnej dokumentácie SuperFaktúry.

### 1.2 Zadanie predpokladá iný stack, než aký appka má

| Zadanie predpokladá | Skutočnosť |
|---|---|
| `app/`, `lib/`, `supabase/migrations/` | `danubra/js/modules/`, `danubra/lib/`, `danubra/database/migrations/` |
| „vygeneruj TypeScript typy zo Supabase" | žiadny TypeScript — čistý JS v `<script>` tagoch |
| „decimal.js v TS" | žiadny build krok, žiadny bundler, žiadne npm závislosti vo frontende |
| `supabase/migrations/YYYYMMDD_v2_fX_*.sql` (CLI) | `NNN_nazov.sql`, spúšťané ručne v SQL editore |
| framework s komponentmi (kap. 2–4) | vlastný render cez template stringy, ~40 súborov |

**Vyriešené (R1 v `DECISIONS.md`):** beh zostáva vanilla JS, ale typy zo Supabase
sa vygenerujú a kontrolujú cez JSDoc + `tsc --checkJs --noEmit`. Úžitok
z typov bez jediného prepísaného súboru.

---

## 2. Čo je v v1 reálne hotové

Overené v kóde aj v databáze, nie podľa plánu.

### 2.1 Dokončené a v prevádzke

| Oblasť | Stav | Dôkaz |
|---|---|---|
| Nábor: živý hovor cez zaškrtávacie polia | hotové | 109 polí, 11 zaškrtnutí v hovoroch |
| Nábor: kandidáti a 6-krokový proces | hotové | 8 kandidátov v procese, 37 zaškrtnutí |
| Nábor: príručka remesiel a otázky | hotové | 11 remesiel (všetky s `pitch`), 70 otázok |
| Nábor: náborové plány | hotové | 3 plány |
| AI: zápis dohôd z nahrávok hovorov | hotové | 1 nahrávka, 6 sľubov, súhlasy |
| Subdodávky: zákazky, nasadenia, hodiny | hotové | 2 zákazky, 2 nasadenia, 18 výkazov |
| Compliance: A1, §48b, SOKA, ANÜ test | hotové | 4 položky, 73 testov |
| Úlohy a pripomienky + denný/mesačný cron | hotové | 15 úloh |
| Ubytovanie: dopyty → ponuky → objednávky | hotové | 3 dopyty, 1 ponuka, 1 objednávka |
| Faktúry: číslovanie, QR, SEPA | hotové | 1 faktúra, 39 testov na QR |
| Marketing: inzeráty a náklady | hotové | 4 inzeráty, 5 nákladov |

**Migrácie 001–012 sú všetky nasadené.** (011 a 012 potvrdené: 11 remesiel má
`pitch`, tabuľka `danubra_call_chips` existuje a je naplnená.)

### 2.2 Rozostavané alebo nepoužívané

| Vec | Stav |
|---|---|
| `danubra_checklist_items` | tabuľka aj UI existujú, 0 riadkov — nikdy sa nepoužilo |
| `danubra_subcontract_accommodations` | tabuľka aj UI existujú, 0 riadkov |
| `danubra_message_templates` | 0 riadkov |
| `danubra_order_extensions` | 0 riadkov — pravidlo o predĺžení existuje, nebolo použité |
| SMS cez Twilio | kód hotový, beží v režime `log` (chýba `SMS_PROVIDER`) |
| AI návrhy polí z poznámok | kód hotový, závisí od `ANTHROPIC_API_KEY` — **stále neoverené** |
| Fakturačné údaje (IBAN) | v `danubra_settings` je stále `SK00 0000…` → QR na faktúrach nefunguje |

### 2.3 Kód

- 20 UI modulov, 13 knižníc, 6 serverových funkcií
- 360 jednotkových testov (core 35, matching 23, qr 39, ongoing-service 19,
  chips 47, process 46, screening 31, sms 47, staffing 73)
- smoke test rozhrania: 40 súborov, 20 kontrol

---

## 3. Tabuľky v databáze

40 tabuliek, 2,9 MB. Zaradenie do skupín zodpovedá `02_schema.sql`;
podrobné mapovanie je v kapitole 4.

### 3.1 Ubytovanie → podľa zadania archivovať

| Tabuľka | Stĺpcov | Riadkov |
|---|---|---|
| `danubra_accommodations` | 45 | 5 |
| `danubra_inquiries` | 20 | 3 |
| `danubra_offers` | 15 | 1 |
| `danubra_offer_variants` | 10 | 2 |
| `danubra_orders` | 27 | 1 |
| `danubra_order_persons` | 9 | 4 |
| `danubra_order_requests` | 13 | 2 |
| `danubra_order_service_periods` | 11 | 1 |
| `danubra_order_extensions` | 8 | 0 |
| `danubra_subcontract_accommodations` | 16 | 0 |
| `danubra_clients` | 20 | 3 |

**Pozor na dve väzby:** `danubra_assignments.accommodation_order_id` ukazuje na
`danubra_orders` a `danubra_invoices.client_id` na `danubra_clients`. Archivácia
ubytovania teda nie je len skrytie menu — treba rozhodnúť, čo s týmito stĺpcami.

### 3.2 Nábor a subdodávky → pravdepodobne ponechať a rozšíriť

`danubra_workers` (35 st./5 r.), `danubra_candidates` (45/8),
`danubra_candidate_checks` (9/37), `danubra_candidate_chips` (9/11),
`danubra_candidate_notes` (7/9), `danubra_call_chips` (15/109),
`danubra_trades` (23/11), `danubra_screening_questions` (14/70),
`danubra_screening_answers` (12/14), `danubra_recruitment_plans` (25/3),
`danubra_partners` (21/2), `danubra_subcontracts` (30/2),
`danubra_assignments` (17/2), `danubra_timesheets` (13/18),
`danubra_worker_documents` (12/5), `danubra_compliance` (14/4),
`danubra_checklist_items` (13/0)

### 3.3 Spoločné

`danubra_settings` (13/1), `danubra_tasks` (20/15), `danubra_activities` (15/40),
`danubra_documents` (11/1), `danubra_invoices` (19/1), `danubra_invoice_items` (10/1),
`danubra_message_templates` (9/0), `danubra_marketing_listings` (12/4),
`danubra_marketing_expenses` (8/5), `danubra_consents` (18/1),
`danubra_call_recordings` (28/1), `danubra_promises` (17/6)

### 3.4 Skutočné stĺpce tabuliek, ktoré zadanie spomína

Toto je skutočný stav databázy — `02_schema.sql` je písaná proti nemu:

**`danubra_partners`** — `id`, `name`, `ust_idnr`, `registration_no`, `address`,
`city`, `postal_code`, `country`, `contact_person`, `phone`, `email`, `language`,
`payment_terms_days`, `is_construction`, `factoring_eligible`, `rating`, `source`,
`notes`, `created_at`, `updated_at`, `created_by`

**`danubra_workers`** — `id`, `full_name`, `phone`, `email`, `whatsapp`,
`language`, `birth_date`, `address`, `city`, `country`, `profession`,
`skill_level`, `skills[]`, `languages[]`, `german_level`, `driving_licence`,
`own_tools`, `employment_type`, `gross_monthly`, `hourly_gross`, `per_diem_daily`,
`bank_iban`, `status`, `available_from`, `source`, `referred_by`, `notes`,
`created_at`, `updated_at`, `created_by`, `legal_form`, `hourly_cost`,
`cooperating_since`, `candidate_id`, `regulated_trade`

**`danubra_subcontracts`** — `id`, `contract_number`, `partner_id`, `title`,
`work_type`, `trade`, `site_name`, `site_address`, `site_city`,
`site_postal_code`, `date_from`, `date_to`, `scope`, `billing_model`,
`charge_rate`, `unit_label`, `fixed_price`, `zoll_reported_at`, `zoll_reference`,
`freistellung_verified`, `soka_relevant`, `status`, `won_at`, `completed_at`,
`notes`, `created_at`, `updated_at`, `created_by`, `transport_note`,
`transport_provided`

**`danubra_assignments`** — `id`, `subcontract_id`, `worker_id`, `date_from`,
`date_to`, `role`, `charge_rate`, `gross_monthly`, `per_diem_daily`,
`accommodation_monthly`, `transport_monthly`, `accommodation_order_id`, `status`,
`notes`, `created_at`, `updated_at`, `created_by`

**`danubra_timesheets`** — `id`, `assignment_id`, `worker_id`, `work_date`,
`hours`, `activity_type`, `description`, `approved`, `approved_at`,
`invoiced_at`, `created_at`, `updated_at`, `created_by`

**`danubra_invoices`** — `id`, `invoice_number`, `client_id`, `order_id`, `type`,
`issue_date`, `due_date`, `delivery_date`, `total`, `currency`, `vat_regime`,
`status`, `paid_at`, `billing_period_from`, `billing_period_to`, `pdf_url`,
`created_at`, `updated_at`, `created_by`

Všimni si: `danubra_invoices` dnes vie len **vydané** faktúry a je naviazaná na
`client_id` + `order_id` (ubytovanie). Prijaté faktúry, náklady a banka
v databáze **neexistujú** — to je celé nové.

---

## 4. Mapovanie tabuliek v1 → v2

Podľa `02_DANUBRA_Hub_v2_schema.sql`.

### 4.1 Ponechať a rozšíriť

| Tabuľka | Čo pribúda | Fáza |
|---|---|---|
| `danubra_settings` | `modules` (ktoré agendy sú zapnuté) | F1 |
| `danubra_workers` | fakturačné údaje živnosti, `sf_client_id`, `crew_id` | F2 |
| `danubra_worker_documents` | `storage_path`, `notify_days_before`, `required_for` | F2 |
| `danubra_partners` | `sf_client_id`, `reverse_charge`, `avg_days_to_pay` | F3 |
| `danubra_subcontracts` | `contract_id`, `quote_id`, `hwo_notified_at`, `soka_registered_at` | F5 |
| `danubra_assignments` | `crew_id`, `worker_rate`, `overhead_per_hour` | F5 |
| `danubra_timesheets` | `period_id`, `rate_used`, `source` | F5 |
| `danubra_invoices` | `partner_id`, `period_id`, schvaľovanie, §48b, SuperFaktúra | F6 |
| `danubra_tasks` | `rule_id`, `snoozed_until` | F9 |

### 4.2 Nové tabuľky

| Tabuľka | Načo | Fáza |
|---|---|---|
| `danubra_enums` | číselníky, dnes rozsypané ako reťazce | F1 |
| `danubra_overrides` | zapísané výnimky z blokátorov | F2 |
| `danubra_crews`, `danubra_crew_members` | partie s trvaním členstva | F3 |
| `danubra_quotes` | ponuky s prepočtom marže | F4 |
| `danubra_contracts`, `danubra_contract_amendments` | zmluvy a dodatky | F4 |
| `danubra_periods` | uzávierka hodín → podklad na faktúru | F5 |
| `danubra_assignment_checks` | checklist pred nástupom naviazaný na pravidlá | F5 |
| `danubra_bills` | prijaté faktúry od živnostníkov | F7 |
| `danubra_costs` | ostatné náklady vrátane opakovaných | F7 |
| `danubra_bank_transactions` | výpis a párovanie | F8 |
| `danubra_task_rules` | pravidlá úloh ako dáta, nie v kóde | F9 |

### 4.3 Archivovať

`danubra_inquiries`, `danubra_offers`, `danubra_offer_variants`,
`danubra_orders`, `danubra_order_persons`, `danubra_order_requests`,
`danubra_order_service_periods`, `danubra_order_extensions`, `danubra_clients`

Zostávajú v databáze aj s dátami, mizne len navigácia.

### 4.4 Zostávajú aktívne napriek archivácii ubytovania

`danubra_accommodations` a `danubra_subcontract_accommodations` — ubytovanie je
naďalej náklad zákazky a argument v inzeráte (R4 v `DECISIONS.md`).

### 4.5 Nepoužité tabuľky z v1

| Tabuľka | Rozhodnutie |
|---|---|
| `danubra_checklist_items` | nahrádza ju `danubra_assignment_checks`; stará zostane prázdna |
| `danubra_message_templates` | ponechať, príde k nej použitie pri komunikácii |

---

## 5. Rozdiely oproti cieľovej schéme

Keďže `02_schema.sql` je písaná proti skutočnej databáze, „rozdiely" sú presne
zoznam `alter table` príkazov v nej. Dve veci ale stoja za zvýraznenie:

**`danubra_workers` má mzdový model, v2 je živnostnícky.** Dnes tam sú
`employment_type`, `gross_monthly`, `hourly_gross`. v2 pridáva
`hourly_cost` (čo nám fakturuje) a údaje živnosti. Staré stĺpce sa **nemažú** —
5 existujúcich pracovníkov ich má vyplnené a model zamestnanca zostáva možný.

**`danubra_invoices` visí na ubytovaní.** `client_id` + `order_id` sú z v1.
v2 pridáva `partner_id` + `subcontract_id` + `period_id`. Staré stĺpce zostanú
pre jednu historickú faktúru.

**Názvy v `danubra_partners` sedia** s tým, čo v2 potrebuje — pribúdajú len
nové stĺpce, nič sa nepremenúva. (Zadanie spomínalo rozdiely v názvoch; pri
skutočnej tabuľke žiadne nie sú.)

---

## 6. Čo som zatiaľ neurobil — zámerne

Nič som nezmazal, nezmenil ani nemigroval. Databáza aj kód sú v stave, v akom
boli pred F0. Jediná zmena v repozitári je tento súbor.
