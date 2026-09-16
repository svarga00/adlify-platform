# DANUBRA Hub v2 — poznámky k migrácii (FÁZA F0)

Stav k 16. 9. 2026. Tento dokument je **neúplný** — chýbajú tri vstupné
dokumenty, bez ktorých sa polovica F0 spraviť nedá. Čo sa dalo zistiť
z repozitára a z databázy, je nižšie; čo je zablokované, je označené.

---

## 1. Čo blokuje dokončenie F0

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

**Bez nich sa nedá spraviť:** cieľový dátový model, mapovanie tabuliek v1 → v2,
rozdiely oproti `02_schema.sql`, rozdelenie na fázy F1–F9 (odvolávka na
„kapitolu 10" a „kapitoly 2–4"), ani obchodné pravidlá z kapitoly 8.

Odhadnúť to z jedného odstavca zhrnutia by znamenalo vymyslieť si dátový model,
stavové automaty a integráciu platobného API — a potom podľa toho migrovať
produkčnú databázu. To nie.

### 1.2 Zadanie predpokladá iný stack, než aký appka má

Toto je väčšia vec než chýbajúce súbory a treba ju rozhodnúť skôr, než sa čokoľvek
začne písať.

| Zadanie predpokladá | Skutočnosť |
|---|---|
| `app/`, `lib/`, `supabase/migrations/` | `danubra/js/modules/`, `danubra/lib/`, `danubra/database/migrations/` |
| „vygeneruj TypeScript typy zo Supabase" | žiadny TypeScript — čistý JS v `<script>` tagoch |
| „decimal.js v TS" | žiadny build krok, žiadny bundler, žiadne npm závislosti vo frontende |
| `supabase/migrations/YYYYMMDD_v2_fX_*.sql` (CLI) | `NNN_nazov.sql`, spúšťané ručne v SQL editore |
| framework s komponentmi (kap. 2–4) | vlastný render cez template stringy, ~40 súborov |

Sú to dve rôzne zadania:

**A. Zostať na dnešnom stacku.** v2 sa spraví ako doteraz — vanilla JS, migrácie
číslované ďalej (013+), peniaze cez `numeric` v DB a vlastný zaokrúhľovací helper
namiesto decimal.js. Rýchle, nič sa nezahadzuje, ale žiadne TS typy.

**B. Prepísať na Next.js + TypeScript.** Zodpovedá zneniu zadania (typy zo
Supabase, decimal.js, komponenty). Znamená to ale nový projekt a prepísanie
všetkého, čo dnes funguje — vrátane živého náboru, ktorý sa práve ladil podľa
reálnych hovorov.

Moje odporúčanie je **A**, a to aj keby dokumenty existovali: appka sa používa,
má 360 testov a v databáze sú reálne dáta. Prepis na TS je práca na týždne bez
jediného nového prínosu pre používateľa. Ak je za bodom B dôvod, ktorý nevidím
(napríklad že to má robiť niekto ďalší, alebo to má byť produkt pre viac firiem),
poviem si to a prispôsobím sa.

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

40 tabuliek, 2,9 MB. Zaradenie do skupín je **predbežné** — vychádza len
z jedného odstavca zadania, nie z `02_schema.sql`.

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

Zadanie hovorí o „rozdieloch v názvoch stĺpcov v `partners`". Bez `02_schema.sql`
ich porovnať neviem, tak sem dávam, čo je dnes v databáze:

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

## 4. Čo je zablokované

| Bod zadania | Prečo sa nedá |
|---|---|
| mapovanie tabuliek v1 → v2 (ponechať / rozšíriť / archivovať) | chýba `02_schema.sql` |
| rozdiely medzi `02_schema.sql` a databázou | chýba `02_schema.sql` |
| plán migrácií podľa fáz F1–F8 | chýba kapitola 10 z `01_navrh.md` |
| obchodné pravidlá do testov | chýba kapitola 8 |
| UI podľa kapitol 2–4 | chýbajú kapitoly 2–4 |
| SuperFaktúra (F6, F7) | chýba `03_superfaktura.md` |

Dokumentáciu SuperFaktúry z GitHubu si stiahnuť viem, ale bez `03_...md` neviem,
**ktoré** jej časti sa majú použiť a ako má vyzerať schvaľovací tok.

---

## 5. Čo potrebujem od teba

1. **Tie tri dokumenty.** Stačí ich hodiť do `docs/v2/` a pushnúť, alebo vložiť
   sem do chatu — prečítam si ich odtiaľ rovnako dobre.
2. **Rozhodnutie o stacku** (A alebo B z bodu 1.2). Toto viem rozhodnúť aj sám,
   ale mení to rozsah práce z dní na týždne, tak sa radšej spýtam.

Keď to bude, dopíšem zvyšok F0 a ukážem plán fáz predtým, než sa čohokoľvek dotknem.

---

## 6. Čo som zatiaľ neurobil — zámerne

Nič som nezmazal, nezmenil ani nemigroval. Databáza aj kód sú v stave, v akom
boli pred F0. Jediná zmena v repozitári je tento súbor.
