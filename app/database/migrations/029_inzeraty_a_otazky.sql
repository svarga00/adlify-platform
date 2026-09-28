-- ============================================================================
-- DANUBRA — inzeráty a otázky do hovoru
-- ============================================================================
-- Prvá vec, ktorú treba pri telefonáte vedieť, nie je meno. Je to **na ktorý
-- inzerát človek volá**. Od toho sa odvíja všetko ostatné: aké remeslo,
-- do akého mesta, akú sadzbu sme sľúbili a na čo sa treba pýtať.
--
-- Bez toho sa hovor začína otázkou „a čo vlastne hľadáte?", čo je presne
-- opačné poradie, než aké funguje: my sme ho oslovili, my máme vedieť, čím.
--
-- Dva dôvody, prečo je to vlastná tabuľka a nie kolónka pri kandidátovi:
--
--   * **Sľub sa musí dať dohľadať.** Keď sa o mesiac na stavbe povie „veď
--     ste písali 18 €", musí byť po ruke text inzerátu v znení, v akom bežal.
--   * **Treba vedieť, ktorý inzerát ľudí prináša.** Bez toho sa platí za
--     dosah naslepo. Pohľad na konci to spočíta.
--
-- Otázky pribúdajú za behu. Doteraz boli len na čítanie v Remeslách a do
-- hovoru sa nedostali vôbec — pritom práve pri telefóne sú užitočné.
-- ============================================================================

-- ── Inzerát ─────────────────────────────────────────────────────────────────
create table if not exists danubra_ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,                  -- interný názov: „Murári Stuttgart FB"
  channel text not null default 'facebook',
    -- facebook | portal | referral | print | other
  channel_detail text,                  -- konkrétna skupina, portál, mesto
  url text,                             -- kam inzerát smeruje alebo kde beží

  -- Čoho sa týka
  trade_key text,                       -- null = viac remesiel naraz
  city text,
  country text default 'DE',
  subcontract_id uuid references danubra_subcontracts,
  plan_id uuid references danubra_recruitment_plans,

  -- Čo sme v ňom sľúbili. Toto je tá časť, kvôli ktorej to celé existuje.
  rate_offered numeric,                 -- €/h pre človeka
  promise text[],                       -- krátke body: „ubytovanie platíme"
  body text,                            -- presné znenie inzerátu

  -- Kedy beží
  active bool not null default true,
  starts_on date,
  ends_on date,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

create index if not exists idx_dads_active on danubra_ads(active, trade_key);
create index if not exists idx_dads_plan on danubra_ads(plan_id) where plan_id is not null;

comment on table danubra_ads is
  'Inzerát, na ktorý ľudia volajú. Drží aj to, čo sme v ňom sľúbili — pri '
  'spore o sadzbu alebo ubytovanie je to jediný dôkaz, čo bolo napísané.';
comment on column danubra_ads.promise is
  'Krátke body toho, čo inzerát sľuboval. Počas hovoru sú vpravo na očiach, '
  'aby sa nesľúbilo niečo iné, než čo bolo v inzeráte.';

-- ── Odkiaľ sa kandidát vzal ────────────────────────────────────────────────
alter table danubra_candidates add column if not exists ad_id uuid references danubra_ads;
create index if not exists idx_dcand_ad on danubra_candidates(ad_id) where ad_id is not null;

comment on column danubra_candidates.ad_id is
  'Inzerát, na ktorý sa ozval. Zisťuje sa ako prvá vec v hovore — určuje '
  'remeslo, mesto aj to, čo sme sľúbili.';

-- ── Otázka viazaná na inzerát ──────────────────────────────────────────────
-- Väčšina otázok patrí k remeslu. Niektoré ale ku konkrétnemu inzerátu —
-- „v inzeráte bolo, že nástup je do dvoch týždňov, stíhate to?".
alter table danubra_screening_questions add column if not exists ad_id uuid references danubra_ads;
alter table danubra_screening_questions add column if not exists segment text;

comment on column danubra_screening_questions.segment is
  'Do ktorej časti hovoru otázka patrí (intro, trade, verify, legal, '
  'logistics, money). Keď je prázdny, odvodí sa z druhu otázky.';

-- Otázky sa teraz zakladajú aj z appky, takže `code` nesmie byť povinný
-- ručný údaj — dopočíta sa, ak ho nikto nezadá.
create or replace function danubra_question_code()
returns trigger language plpgsql as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'q_' || replace(new.id::text, '-', '');
  end if;
  return new;
end $$;

drop trigger if exists danubra_question_code on danubra_screening_questions;
create trigger danubra_question_code before insert on danubra_screening_questions
  for each row execute function danubra_question_code();

-- ── Ktorý inzerát prináša ľudí ─────────────────────────────────────────────
-- Bez tohto čísla sa za dosah platí naslepo.
create or replace view danubra_v_ad_performance as
select
  a.id, a.title, a.channel, a.channel_detail, a.trade_key, a.city,
  a.active, a.starts_on, a.ends_on, a.rate_offered,
  count(c.id)                                             as candidates,
  count(c.id) filter (where c.first_contact_at is not null) as contacted,
  count(c.id) filter (where c.status = 'hired')            as hired,
  min(c.created_at)                                        as first_response,
  max(c.created_at)                                        as last_response
from danubra_ads a
left join danubra_candidates c on c.ad_id = a.id
group by a.id;

comment on view danubra_v_ad_performance is
  'Koľko ľudí sa na inzerát ozvalo, koľkým sme sa stihli ozvať späť '
  'a koľko z nich nastúpilo.';

-- ── Prístup ─────────────────────────────────────────────────────────────────
alter table danubra_ads enable row level security;
do $$
begin
  drop policy if exists danubra_ads_read on danubra_ads;
  drop policy if exists danubra_ads_write on danubra_ads;
  drop policy if exists danubra_ads_update on danubra_ads;
  create policy danubra_ads_read on danubra_ads
    for select using (auth.role() = 'authenticated');
  create policy danubra_ads_write on danubra_ads
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_ads_update on danubra_ads
    for update using (auth.role() = 'authenticated');
end $$;

-- Zmazať sa nedá ani inzerát. Dobehnutý inzerát sa vypne (`active = false`) —
-- kandidáti, ktorí sa naň ozvali, musia zostať naviazaní na to, čo čítali.

drop trigger if exists set_updated_at on danubra_ads;
create trigger set_updated_at before update on danubra_ads
  for each row execute function danubra_set_updated_at();
