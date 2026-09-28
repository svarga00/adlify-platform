-- ============================================================================
-- DANUBRA v2 — stavby na mape a kto kde býva
-- ============================================================================
-- Väzba stavba ↔ ubytovanie existuje od migrácie 007
-- (`danubra_subcontract_accommodations`), ale chýbali jej dve veci:
--
--   1. **Súradnice.** Bez nich sa nedá nakresliť mapa ani povedať, ako
--      ďaleko je ubytovanie od stavby. Cesta tam a späť je denný náklad
--      a v praxi to rozhoduje, či sa ubytovanie oplatí.
--   2. **Kto kde býva.** Obsadenosť bola ručne vypísané číslo
--      (`occupied`) — druhý zdroj pravdy, ktorý sa rozišiel hneď, ako
--      niekto odišiel a nikto to neprepísal.
--
-- Pobyt je záznam s trvaním, rovnako ako členstvo v partii: **nemaže sa**,
-- ukončuje sa dátumom. Inak by sa spätne nedalo povedať, kto kde v ktorom
-- mesiaci spal — a to je otázka, ktorá príde pri kontrole aj pri
-- rozúčtovaní nákladov.
--
-- Idempotentná. Nič nemaže ani nepremenúva.
-- ============================================================================

-- ── Súradnice ───────────────────────────────────────────────────────────────
-- `danubra_accommodations` ich má od začiatku (migrácia 001). Stavba a ručne
-- zapísané ubytovanie ich nemali.
alter table danubra_subcontracts add column if not exists lat numeric;
alter table danubra_subcontracts add column if not exists lng numeric;
alter table danubra_subcontract_accommodations add column if not exists lat numeric;
alter table danubra_subcontract_accommodations add column if not exists lng numeric;

comment on column danubra_subcontracts.lat is
  'Zemepisná šírka miesta výkonu. Zadáva sa vložením odkazu z máp alebo '
  'ručne — appka sama nikam nevolá.';

-- ── Pobyty: kto kde býva ────────────────────────────────────────────────────
create table if not exists danubra_stays (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references danubra_workers,
  lodging_id uuid not null references danubra_subcontract_accommodations on delete cascade,
  date_from date not null default current_date,
  date_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,

  constraint danubra_stays_range check (date_to is null or date_to >= date_from)
);

create index if not exists idx_dstay_worker on danubra_stays(worker_id, date_from desc);
create index if not exists idx_dstay_lodging on danubra_stays(lodging_id);
create index if not exists idx_dstay_current on danubra_stays(lodging_id)
  where date_to is null;

comment on table danubra_stays is
  'Kto kde býva. Pobyt sa nemaže — ukončuje sa dátumom, rovnako ako členstvo '
  'v partii. Inak by sa spätne nedalo povedať, kto kde v ktorom mesiaci spal.';

-- ── Jeden človek, jedna posteľ ──────────────────────────────────────────────
-- Prekrývajúce sa pobyty toho istého človeka znamenajú, že sa niekde zabudlo
-- zapísať odchod. Keby to prešlo, obsadenosť by bola vyššia, než je pravda,
-- a ubytovanie by sa zaplatilo dvakrát.
create or replace function danubra_stay_check()
returns trigger language plpgsql as $$
declare
  v_conflict record;
begin
  select s.id, s.date_from, s.date_to into v_conflict
  from danubra_stays s
  where s.worker_id = new.worker_id
    and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and daterange(s.date_from, s.date_to, '[]')
        && daterange(new.date_from, new.date_to, '[]')
  limit 1;

  if v_conflict.id is not null then
    raise exception 'Tento človek už v tom čase býva inde (od % do %) — najprv ukonči ten pobyt',
      v_conflict.date_from, coalesce(v_conflict.date_to::text, 'bez konca');
  end if;
  return new;
end $$;

drop trigger if exists danubra_stay_check on danubra_stays;
create trigger danubra_stay_check
  before insert or update on danubra_stays
  for each row execute function danubra_stay_check();

drop trigger if exists set_updated_at on danubra_stays;
create trigger set_updated_at before update on danubra_stays
  for each row execute function danubra_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Zámerne bez politiky na delete: pobyt sa ukončuje, nie maže.
alter table danubra_stays enable row level security;
do $$
begin
  drop policy if exists danubra_stays_read on danubra_stays;
  drop policy if exists danubra_stays_write on danubra_stays;
  drop policy if exists danubra_stays_update on danubra_stays;

  create policy danubra_stays_read on danubra_stays
    for select using (auth.role() = 'authenticated');
  create policy danubra_stays_write on danubra_stays
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_stays_update on danubra_stays
    for update using (auth.role() = 'authenticated');
end $$;

-- ── Obsadenosť ──────────────────────────────────────────────────────────────
-- Počíta sa z pobytov, nie z ručne vypísaného čísla. Stĺpec `occupied`
-- zostáva (nič sa nemaže), ale je označený ako historický.
comment on column danubra_subcontract_accommodations.occupied is
  'Historické, ručne vypisované číslo z v1. Obsadenosť ber z pohľadu '
  'danubra_v_lodging_occupancy — počíta sa z pobytov a nemá sa ako rozísť.';

create or replace view danubra_v_lodging_occupancy as
select
  l.id                                   as lodging_id,
  l.subcontract_id,
  l.accommodation_id,
  coalesce(l.name, a.name)               as name,
  coalesce(l.city, a.city)               as city,
  coalesce(l.address, a.address)         as address,
  coalesce(l.lat, a.lat)                 as lat,
  coalesce(l.lng, a.lng)                 as lng,
  coalesce(l.capacity, a.max_persons)    as capacity,
  coalesce(l.price_monthly, a.price_month) as price_monthly,
  l.date_from, l.date_to,
  count(s.id) filter (
    where s.date_from <= current_date
      and (s.date_to is null or s.date_to >= current_date)
  )                                      as occupied_now,
  count(s.id)                            as stays_total,
  greatest(coalesce(l.capacity, a.max_persons, 0) - count(s.id) filter (
    where s.date_from <= current_date
      and (s.date_to is null or s.date_to >= current_date)
  ), 0)                                  as free_beds
from danubra_subcontract_accommodations l
left join danubra_accommodations a on a.id = l.accommodation_id
left join danubra_stays s on s.lodging_id = l.id
group by l.id, a.name, a.city, a.address, a.lat, a.lng, a.max_persons, a.price_month;

comment on view danubra_v_lodging_occupancy is
  'Ubytovania zákazky s dopočítanou obsadenosťou. Údaje sa berú z väzby, '
  'a keď tam nie sú, z databázy ubytovaní — ručný zápis má prednosť.';

-- ── Kde kto býva, z pohľadu človeka ────────────────────────────────────────
create or replace view danubra_v_worker_stay as
select
  s.id           as stay_id,
  s.worker_id,
  w.full_name,
  s.lodging_id,
  l.subcontract_id,
  sc.title       as subcontract_title,
  coalesce(l.name, a.name)       as lodging_name,
  coalesce(l.city, a.city)       as lodging_city,
  coalesce(l.address, a.address) as lodging_address,
  s.date_from, s.date_to,
  (s.date_from <= current_date
    and (s.date_to is null or s.date_to >= current_date)) as is_current
from danubra_stays s
join danubra_workers w on w.id = s.worker_id
join danubra_subcontract_accommodations l on l.id = s.lodging_id
left join danubra_accommodations a on a.id = l.accommodation_id
left join danubra_subcontracts sc on sc.id = l.subcontract_id;

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_stays)                  as pobytov,
  (select count(*) from danubra_v_lodging_occupancy)    as ubytovani_na_zakazkach,
  (select count(*) from danubra_v_worker_stay)          as zaznamov_kde_kto_byva;
