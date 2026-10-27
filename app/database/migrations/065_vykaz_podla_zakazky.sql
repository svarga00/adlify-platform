-- ============================================================================
-- DANUBRA — výkaz (Stundennachweis) podľa zákazky a týždňa
-- ============================================================================
-- Podpis majstra sa zapisoval na dvoch miestach a druhé ho nevidelo:
--   * okno „Zapísať hodiny" (HourEntry) — podľa zákazky a týždňa,
--   * Výkaz pre odberateľa — podľa partie a týždňa.
-- Hodiny sa zapisujú za zákazku (partia aj jednotlivci), takže výkaz patrí
-- zákazke. Partia je na ňom nepovinná — jednotlivec bez partie má tiež
-- Stundennachweis. Doteraz `crew_id not null` zápis z okna hodín ticho
-- odmietal (appka si to nechala pre seba v konzole).
--
-- Nič sa nemaže ani neprepisuje: staré riadky partie zostávajú, appka ich
-- číta tiež (`DanubraHourScan.pickSheet`) a pri ďalšom uložení k nim doplní
-- zákazku. Podpísaný výkaz drží ďalej trigger `danubra_hour_sheet_frozen`
-- (zákazka sa doplniť smie, obsah papiera nie).
--
-- Kým táto migrácia nie je v databáze, appka výkaz priradí partii, keď sú
-- všetci ľudia z tabuľky z jednej partie; inak povie, že podpis sa neuložil.
-- ============================================================================

alter table danubra_hour_sheets alter column crew_id drop not null;

-- Jeden výkaz bez partie na zákazku a týždeň. Výkazy konkrétnych partií
-- stráži naďalej pôvodné `unique (crew_id, iso_year, iso_week)`.
create unique index if not exists danubra_hour_sheets_sub_week
  on danubra_hour_sheets (subcontract_id, iso_year, iso_week)
  where crew_id is null and subcontract_id is not null;

comment on table danubra_hour_sheets is
  'Odovzdané týždenné výkazy (Stundennachweis). Jeden týždeň, jedna zákazka; '
  'partia je nepovinná (staré riadky sú podľa partie). Zapisuje ich len okno '
  '„Zapísať hodiny", Výkaz pre odberateľa ich len číta.';
comment on column danubra_hour_sheets.crew_id is
  'Partia, ak je výkaz len za ňu. Prázdne = celá zákazka (aj jednotlivci).';

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_hour_sheets)                              as vykazov,
  (select count(*) from danubra_hour_sheets where subcontract_id is null) as bez_zakazky,
  (select count(*) from danubra_hour_sheets where signed_at is not null)  as podpisanych;
