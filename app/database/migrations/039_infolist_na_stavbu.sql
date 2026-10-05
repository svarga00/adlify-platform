-- ============================================================================
-- 039 — čo treba vedieť, aby človek v pondelok ráno našiel bránu
-- ============================================================================
-- Živnostník dostane adresu stavby a dátum nástupu. Všetko ostatné sa dnes
-- rieši telefonátom: kde presne sa hlásiť, o koľkej sa začína, kto je polier
-- a kde si vyzdvihne kľúče od ubytovania. Tie telefonáty chodia v nedeľu
-- večer a cez víkend, a odpoveď na ne nie je nikde zapísaná — takže na ňu
-- zakaždým odpovedá ten istý človek z hlavy.
--
-- Týchto päť polí je presne to, čo sa v tých hovoroch pýta. Nie sú povinné:
-- zákazka bez nich funguje tak ako doteraz, len infolist povie, že údaj ešte
-- nie je doplnený — namiesto toho, aby vytlačil prázdny riadok.
--
-- Žiadne dáta sa nemenia, iba pribúdajú stĺpce. Idempotentné.
-- ============================================================================

-- ── Stavba ──────────────────────────────────────────────────────────────────
alter table danubra_subcontracts
  add column if not exists site_contact_name  text,
  add column if not exists site_contact_phone text,
  add column if not exists meeting_point      text,
  add column if not exists work_start         text,
  add column if not exists site_note          text;

comment on column danubra_subcontracts.site_contact_name is
  'Polier alebo stavbyvedúci — za kým sa človek hlási prvý deň.';
comment on column danubra_subcontracts.site_contact_phone is
  'Telefón naňho. Na infoliste je ako odkaz, aby sa dal z mobilu rovno vytočiť.';
comment on column danubra_subcontracts.meeting_point is
  'Kde presne na stavbe — brána, bunka, vrátnica. Adresa veľkej stavby '
  'nestačí: človek stojí pred plotom dlhým tristo metrov.';
comment on column danubra_subcontracts.work_start is
  'O koľkej sa začína, napr. 07:00. Text, nie čas — býva to „07:00 (v piatok 06:30)".';
comment on column danubra_subcontracts.site_note is
  'Čo ešte treba vedieť: parkovanie, prístup, čo si priniesť nad rámec bežného.';

-- ── Ubytovanie ──────────────────────────────────────────────────────────────
alter table danubra_subcontract_accommodations
  add column if not exists keys_note   text,
  add column if not exists house_rules text;

comment on column danubra_subcontract_accommodations.keys_note is
  'Kde a u koho sú kľúče. Druhá najčastejšia otázka v nedeľu večer.';
comment on column danubra_subcontract_accommodations.house_rules is
  'Čo platí v dome — nočný pokoj, triedenie odpadu, zákaz fajčenia. '
  'V Nemecku sa to berie vážnejšie, než človek zo Slovenska čaká.';

-- ── Kontrola ────────────────────────────────────────────────────────────────
do $$
declare chyba text;
begin
  select string_agg(x.t || '.' || x.c, ', ') into chyba
  from (values
    ('danubra_subcontracts', 'site_contact_name'),
    ('danubra_subcontracts', 'site_contact_phone'),
    ('danubra_subcontracts', 'meeting_point'),
    ('danubra_subcontracts', 'work_start'),
    ('danubra_subcontracts', 'site_note'),
    ('danubra_subcontract_accommodations', 'keys_note'),
    ('danubra_subcontract_accommodations', 'house_rules')
  ) as x(t, c)
  where not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = x.t and column_name = x.c);
  if chyba is not null then
    raise exception 'Nepribudlo: %', chyba;
  end if;
  raise notice 'Infolist má kam ukladať údaje.';
end $$;
