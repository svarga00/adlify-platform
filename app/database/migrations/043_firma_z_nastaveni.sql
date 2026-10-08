-- ============================================================================
-- 043 — názov firmy patrí do Nastavení, nie do uložených textov
-- ============================================================================
-- Migrácia 004 uložila skript súhlasu s nahrávaním hovoru s názvom firmy
-- napísaným priamo v texte („volám z DANUBRA", „hier ist DANUBRA"). Keď sa
-- firma premenuje, zmena názvu v Nastaveniach to nemá ako prepísať — appka sa
-- naďalej predstavuje starým menom, a to v texte, ktorý je právnym základom
-- nahrávania (§377 Trestného zákona, §201 StGB).
--
-- Text drží zástupný `{firma}` a názov sa doplní pri zobrazení z
-- `settings.supplier.name`.
--
-- Mení sa len text, ktorý je **presne ten zo migrácie 004**. Text, ktorý si
-- medzitým niekto prepísal po svojom, sa nechá na pokoji — vlastné znenie
-- súhlasu nie je čo prepisovať automaticky.
--
-- Idempotentné: druhé spustenie už nenájde čo meniť.
-- ============================================================================

-- ── 1. Slovenské znenie ─────────────────────────────────────────────────────
update danubra_settings
set recruiting = recruiting || jsonb_build_object(
  'consent_script_sk',
    replace(recruiting->>'consent_script_sk', 'volám z DANUBRA', 'volám z {firma}'))
where recruiting ? 'consent_script_sk'
  and recruiting->>'consent_script_sk' like '%volám z DANUBRA%';

-- ── 2. Nemecké znenie ───────────────────────────────────────────────────────
update danubra_settings
set recruiting = recruiting || jsonb_build_object(
  'consent_script_de',
    replace(recruiting->>'consent_script_de', 'hier ist DANUBRA', 'hier ist {firma}'))
where recruiting ? 'consent_script_de'
  and recruiting->>'consent_script_de' like '%hier ist DANUBRA%';

-- ── 3. Kontrola ─────────────────────────────────────────────────────────────
-- Po migrácii nesmie v skripte súhlasu zostať názov firmy. Keby zostal,
-- migrácia tvrdí, že prešla, a appka by sa ďalej predstavovala starým menom.
do $$
declare zostalo int;
begin
  select count(*) into zostalo
  from danubra_settings
  where coalesce(recruiting->>'consent_script_sk', '') like '%DANUBRA%'
     or coalesce(recruiting->>'consent_script_de', '') like '%DANUBRA%';

  if zostalo > 0 then
    raise exception 'Migrácia 043: v % riadku zostal názov firmy v skripte súhlasu.', zostalo;
  end if;

  raise notice 'Migrácia 043: názov firmy je zo skriptu súhlasu preč, drží ho {firma}.';
end $$;

-- ── 4. Čo sa zámerne NEMENÍ ─────────────────────────────────────────────────
-- `settings.supplier.name` zostáva, ako je. Je to **údaj o firme**, nie vzorový
-- text: zmeniť ho smie len človek v Nastaveniach, pretože to, čo je na
-- faktúrach a zmluvách, nemá prepisovať migrácia.
--
-- Demo prepis hovoru (migrácia 006) tiež zostáva — je to vzorový záznam
-- hovoru, ktorý sa naozaj takto odviedol, nie šablóna na použitie.
