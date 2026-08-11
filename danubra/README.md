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
    004_recruiting_ai.sql AI nábor: súhlasy, nahrávky hovorov, zachytené sľuby
    003_staffing.sql      subdodávky: pracovníci, odberatelia DE, zákazky, nasadenia,
                          hodiny, compliance register + rad ZAK-2026-0001
  (crony: netlify/functions/danubra-cron-daily.js, danubra-cron-monthly.js)
  lib/
    billing/
      ongoing-service.js  výpočet priebežnej služby (§6.4)  ✅ testy
      regime.js           fakturačný režim SK/EU/other (§6.3) ✅ testy
    orders/
      state-machine.js    stavový automat objednávky (§6.2)  ✅ testy
    numbering.js          číselné rady OBJ-.../faktúry (§6.1) ✅ testy
    matching.js           panel zhôd dopyt → ubytovania (§6.5)  ✅ testy
    sms/provider.js       E.164, segmenty GSM-7/Unicode, diakritika  ✅ testy
    staffing/margin.js      jednotková ekonomika vyslaného pracovníka  ✅ testy
    staffing/compliance.js  A1, §48b, SOKA, ANÜ, cash-flow prahy       ✅ testy
    qr.js                 QR kodér + SEPA platobný reťazec        ✅ testy
    documents/templates.js  dokumenty §8 (faktúra, potvrdenia, pokyny)
  js/services/
    orders-service.js     stavové prechody + vedľajšie efekty (§6.2), predĺženia, segmenty
    *.test.js             unit testy (node, bez frameworku)
  (ďalšie: app shell, moduly obrazoviek, netlify funkcie — pribúdajú po milestonoch)
```

## Testy

```bash
node danubra/lib/billing/ongoing-service.test.js   # 19 testov
node danubra/lib/core.test.js                      # 35 testov
node danubra/lib/matching.test.js                  # 23 testov
node danubra/lib/qr.test.js                        # 39 testov
node danubra/lib/staffing/staffing.test.js         # 58 testov
node danubra/lib/sms/sms.test.js                   # 47 testov
```

## Dve agendy

Aplikácia obsluhuje dva oddelené biznisy so spoločným prostredím:

| | **Ubytovanie** (Fáza 1) | **Subdodávky** (Fáza 2) |
|---|---|---|
| Klienti | `danubra_clients` — firmy a party zo SK/HU | `danubra_partners` — nemeckí GU |
| Dopyt → | ponuka → objednávka → spis | zákazka (Werkvertrag) → nasadenie |
| Príjem | poplatok + priebežná služba | marža medzi sadzbou a nákladom pracovníka |
| Riziko | doručenie ubytovania | compliance (ANÜ, §48b, SOKA, A1) a cash-flow |

Spoločné ostáva: prihlásenie, nastavenia, faktúry, komunikačné záznamy a dokumenty.

## Stav (milestones)

- [x] **M1** — dátový model (schéma, RLS, triggery, indexy, seed)
- [x] **M4/M6 core** — algoritmy priebežnej služby, stavový automat, číselné rady, fakturačný režim + testy
- [x] **M2** — ubytovania + klienti CRUD
- [x] **Dizajn** — rozhranie podľa schváleného návrhu (Archivo, zoskupená navigácia, KPI)
- [x] **M3** — dopyty + ponuky (panel zhôd §6.5, wizard, text pre klienta)
- [x] **M4/M5** — objednávky + spis zákazky (stavový automat, prístupové kódy, ticketing, priebežná služba)
- [x] **M6** — fakturácia, dokumenty s QR platbou, denný a mesačný cron
- [x] **Fáza 2 základ** — dátový model, ekonomika, compliance, pracovníci, zákazky
- [x] **Fáza 2 pokračovanie** — odberatelia DE, hodiny, fakturácia subdodávok, cash-flow panel
- [x] **M7** — SMS vrstva so segmentmi a diakritikou, odosielanie, limity
- [x] **M8** — marketing: inzeráty s obnovením, výdavky voči rozpočtu
- [x] **M9** — príjem dopytov z webu (tolerantné mapovanie SK/CS/HU formulárov)
- [x] **AI nábor** — súhlasy, nahrávky, prepis a extrakcia sľubov

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
