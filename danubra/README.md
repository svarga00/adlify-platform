# DANUBRA Hub

Interná appka pre sprostredkovanie ubytovania pre pracovníkov v Nemecku:
dopyt → ponuka → objednávka → aktívny pobyt → fakturácia → ukončenie.

**Stack:** vanilla JS + Supabase + Netlify functions (rovnaký ako Adlify — beží
na existujúcej infraštruktúre, žiadny nový setup). Odchýlka od pôvodného
Next.js zadania je vedomá — dôvod: nulový nový setup na želanie zadávateľa.
Všetka biznis logika, dátový model a pravidlá (§2–§8) sú podľa zadania.

## Štruktúra

```
danubra/
  database/migrations/    SQL migrácie (spustiť v Supabase SQL Editor)
    001_schema.sql        všetkých 18 tabuliek + RLS + triggery + indexy + seed settings
    002_numbering.sql     atomická RPC danubra_next_number() pre číselné rady (§6.1)
  lib/
    billing/
      ongoing-service.js  výpočet priebežnej služby (§6.4)  ✅ testy
      regime.js           fakturačný režim SK/EU/other (§6.3) ✅ testy
    orders/
      state-machine.js    stavový automat objednávky (§6.2)  ✅ testy
    numbering.js          číselné rady OBJ-.../faktúry (§6.1) ✅ testy
    matching.js           panel zhôd dopyt → ubytovania (§6.5)  ✅ testy
    *.test.js             unit testy (node, bez frameworku)
  (ďalšie: app shell, moduly obrazoviek, netlify funkcie — pribúdajú po milestonoch)
```

## Testy

```bash
node danubra/lib/billing/ongoing-service.test.js   # 19 testov
node danubra/lib/core.test.js                      # 35 testov
node danubra/lib/matching.test.js                  # 23 testov
```

## Stav (milestones)

- [x] **M1** — dátový model (schéma, RLS, triggery, indexy, seed)
- [x] **M4/M6 core** — algoritmy priebežnej služby, stavový automat, číselné rady, fakturačný režim + testy
- [ ] **M2** — ubytovania + klienti CRUD
- [x] **M3** — dopyty + ponuky (panel zhôd §6.5, wizard, text pre klienta)
- [ ] **M5** — spis zákazky (8 sekcií, prístupové kódy, ticketing, os)
- [ ] **M6** — fakturácia, PDF, QR, mesačný cron
- [ ] **M7** — SMS vrstva + šablóny + denný cron
- [ ] **M8** — marketing + KPI dashboard
- [ ] **M9** — príjem dopytov z webu (webhook)

## Kritické pravidlá (§5) — dodržiavané v logike

1. Adresa/kontakt na ubytovateľa sa NEZOBRAZÍ kým `orders.status` nie je aspoň `paid`
2. Faktúry za priebežnú službu sa NIKDY neodosielajú automaticky (draft_pending_approval)
3. `orders.date_to` sa mení len cez `order_extensions` (so záznamom pôvodnej hodnoty)
4. Priebežná služba len z nepozastavených segmentov v období in_progress
5. Fakturačný režim z `clients.country` + `vat_id`, nikdy ručne
6. Peniaze `numeric`, zaokrúhlenie až pri výstupe
7. Dátumy v `Europe/Bratislava`, crony rátajú s letným časom

## Migrácie — ako spustiť

Supabase SQL Editor → nová query → vlož obsah `001_schema.sql` → Run.
Tabuľky sú oddelené od Adlify — žiadny konflikt na spoločnom projekte.
