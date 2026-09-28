-- ============================================================================
-- DANUBRA Hub v2 — F3 — Partie a odberatelia
-- ============================================================================
-- Partia je organizačná skupina, nie právny subjekt. Chodia spolu, ale
-- každý živnostník fakturuje sám za seba (rozhodnutie R5) — jedna spoločná
-- faktúra za skupinu ľudí by pri kontrole vyzerala ako zamestnávanie alebo
-- ako skrytá Arbeitnehmerüberlassung, presne to riziko, pred ktorým appka
-- inak varuje.
--
-- Členstvo má trvanie. Ľudia z partie odchádzajú a vracajú sa, a keď sa
-- história prepisuje, nedá sa spätne povedať, kto na ktorej stavbe bol.
--
-- Druhá polovica fázy je oprava, ktorá sa našla cestou: vydané faktúry
-- nemali väzbu na nemeckého odberateľa. `client_id` ukazuje na
-- `danubra_clients`, čo je agenda ubytovania — takže prehľad platobnej
-- disciplíny u odberateľa nikdy nemal čo zobraziť a tichо ukazoval nulu.
--
-- Idempotentné.
-- ============================================================================

-- ── Partie ──────────────────────────────────────────────────────────────────
create table if not exists danubra_crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_worker_id uuid references danubra_workers,
  trade_key text,
  usual_size int,
  phone text,
  language text default 'sk',
  status text not null default 'active',   -- active | paused | disbanded
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

comment on table danubra_crews is
  'Partia je organizačná skupina, nie právny subjekt. Nasadzuje sa naraz, '
  'ale každý člen fakturuje sám za seba (R5).';
comment on column danubra_crews.leader_worker_id is
  'Predák. Musí byť aj v danubra_crew_members — drží to trigger.';

-- Členstvo má trvanie, aby sa dalo spätne povedať, kto kedy v partii bol.
create table if not exists danubra_crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references danubra_crews on delete cascade,
  worker_id uuid not null references danubra_workers on delete cascade,
  role text default 'member',              -- leader | member
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now()
);
create index if not exists idx_dcm_crew on danubra_crew_members(crew_id);
create index if not exists idx_dcm_worker on danubra_crew_members(worker_id);

-- Ten istý človek nemôže byť v tej istej partii dvakrát naraz. Po odchode
-- sa vrátiť môže — vtedy vznikne nový riadok s novým `joined_at`.
create unique index if not exists idx_dcm_active
  on danubra_crew_members(crew_id, worker_id) where left_at is null;

do $$
begin
  alter table danubra_crew_members add constraint danubra_dcm_dates_chk
    check (left_at is null or left_at >= joined_at);
exception when duplicate_object then null;
end $$;

comment on table danubra_crew_members is
  'Členstvo s trvaním. Odchod sa zapisuje cez left_at, riadok sa nemaže — '
  'inak by sa spätne nedalo povedať, kto na ktorej stavbe bol.';

-- `danubra_workers.crew_id` z F2 dostáva cudzí kľúč až tu, keď už je kam.
-- Pri zrušení partie sa človek nemaže, len stratí príslušnosť.
do $$
begin
  alter table danubra_workers add constraint danubra_workers_crew_fk
    foreign key (crew_id) references danubra_crews on delete set null;
exception when duplicate_object then null;
end $$;

-- ── Odberatelia ─────────────────────────────────────────────────────────────
alter table danubra_partners add column if not exists sf_client_id int;
alter table danubra_partners add column if not exists default_charge_rate numeric;
alter table danubra_partners add column if not exists invoice_language text default 'de';
alter table danubra_partners add column if not exists reverse_charge bool default true;
alter table danubra_partners add column if not exists status text default 'active';

comment on column danubra_partners.sf_client_id is
  'Id odberateľa v SuperFaktúre. Ukladá sa po prvej faktúre, aby sa ďalšie '
  'naviazali naň a nevznikal duplicitný odberateľ v adresári.';
comment on column danubra_partners.reverse_charge is
  'Prenesenie daňovej povinnosti §13b UStG. Pri nemeckom odberateľovi '
  's platným USt-IdNr sa fakturuje s nulovou sadzbou.';
comment on column danubra_partners.invoice_language is
  'Jazyk dokladu. UI je po slovensky, dokumenty pre partnerov po nemecky.';

-- ── Chýbajúca väzba faktúry na odberateľa ───────────────────────────────────
-- Toto je tá oprava. `client_id` zostáva pre historické záznamy z agendy
-- ubytovania (R4); nové vydané faktúry idú cez `partner_id`.
alter table danubra_invoices add column if not exists partner_id uuid
  references danubra_partners;
create index if not exists idx_dinv_partner on danubra_invoices(partner_id)
  where partner_id is not null;

comment on column danubra_invoices.partner_id is
  'Nemecký odberateľ. Vydané faktúry v2 idú cez tento stĺpec.';
comment on column danubra_invoices.client_id is
  'Klient z agendy ubytovania (v1). Zostáva pre historické záznamy, nové '
  'faktúry ho nepoužívajú — pozri partner_id.';

-- ── Platobná disciplína ─────────────────────────────────────────────────────
-- Počíta sa v SQL, aby to nemusel každý modul dopočítavať sám a aby sedeli
-- čísla na dashboarde a v detaile odberateľa.
--
-- `avg_days_to_pay` sa zámerne nedrží ako stĺpec — bol by to údaj, ktorý
-- sa tichо rozíde s faktúrami. Radšej pohľad, ktorý je vždy aktuálny.
create or replace view danubra_v_partner_payment as
select
  p.id as partner_id,
  p.name,
  p.payment_terms_days,
  count(i.id) as invoices_total,
  count(i.id) filter (where i.status = 'paid') as invoices_paid,
  count(i.id) filter (where i.status <> 'paid' and i.due_date < current_date)
    as invoices_overdue,
  coalesce(sum(i.total) filter (where i.status <> 'paid'), 0) as outstanding,
  coalesce(sum(i.total) filter (where i.status <> 'paid' and i.due_date < current_date), 0)
    as overdue_amount,
  -- Priemerný počet dní od vystavenia po úhradu. Null, kým nič nezaplatili.
  round(avg(
    case when i.status = 'paid' and i.paid_at is not null and i.issue_date is not null
         then (i.paid_at::date - i.issue_date) end
  )::numeric, 1) as avg_days_to_pay,
  -- Koľko z uhradených prišlo do splatnosti.
  round(
    100.0 * count(i.id) filter (
      where i.status = 'paid' and i.paid_at is not null and i.due_date is not null
        and i.paid_at::date <= i.due_date
    ) / nullif(count(i.id) filter (where i.status = 'paid'), 0)
  , 0) as on_time_pct
from danubra_partners p
left join danubra_invoices i on i.partner_id = p.id
group by p.id, p.name, p.payment_terms_days;

comment on view danubra_v_partner_payment is
  'Platobná disciplína odberateľa. Počíta sa z faktúr naviazaných cez '
  'partner_id, nie cez client_id — ten patrí agende ubytovania.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_crews;
create trigger set_updated_at before update on danubra_crews
  for each row execute function danubra_set_updated_at();

alter table danubra_crews enable row level security;
drop policy if exists danubra_auth_all on danubra_crews;
create policy danubra_auth_all on danubra_crews
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Členstvo je história — dá sa pridať a ukončiť, nie zmazať.
alter table danubra_crew_members enable row level security;
drop policy if exists danubra_auth_all on danubra_crew_members;
drop policy if exists danubra_dcm_read on danubra_crew_members;
drop policy if exists danubra_dcm_insert on danubra_crew_members;
drop policy if exists danubra_dcm_update on danubra_crew_members;
create policy danubra_dcm_read on danubra_crew_members
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_dcm_insert on danubra_crew_members
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_dcm_update on danubra_crew_members
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Predák musí byť členom ──────────────────────────────────────────────────
-- Bez toho by partia mohla mať predáka, ktorý v nej nie je — a pri nasadení
-- by sa nedalo povedať, kto za ňu na stavbe hovorí.
create or replace function danubra_crew_leader_is_member()
returns trigger
language plpgsql
as $$
begin
  if new.leader_worker_id is null then
    return new;
  end if;
  if not exists (
    select 1 from danubra_crew_members m
    where m.crew_id = new.id and m.worker_id = new.leader_worker_id and m.left_at is null
  ) then
    insert into danubra_crew_members (crew_id, worker_id, role)
    values (new.id, new.leader_worker_id, 'leader')
    on conflict do nothing;
  else
    update danubra_crew_members set role = 'leader'
    where crew_id = new.id and worker_id = new.leader_worker_id and left_at is null;
  end if;
  -- Predák je vždy len jeden.
  update danubra_crew_members set role = 'member'
  where crew_id = new.id and left_at is null
    and worker_id <> new.leader_worker_id and role = 'leader';
  return new;
end $$;

drop trigger if exists danubra_crew_leader_trg on danubra_crews;
create trigger danubra_crew_leader_trg after insert or update of leader_worker_id
  on danubra_crews for each row execute function danubra_crew_leader_is_member();

comment on function danubra_crew_leader_is_member() is
  'Predák partie je vždy aj jej členom a je vždy len jeden. Drží sa to tu, '
  'nie v UI, lebo partiu môže založiť aj import alebo skript.';

-- ── Číselník remesiel partie ────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, sort_order) values
('crew_status','active','Aktívna','Aktiv',1),
('crew_status','paused','Pozastavená','Pausiert',2),
('crew_status','disbanded','Rozpustená','Aufgelöst',3)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  sort_order = excluded.sort_order;

-- Diagnostika
select
  (select count(*) from danubra_crews) as partii,
  (select count(*) from danubra_crew_members where left_at is null) as clenov,
  (select count(*) from danubra_invoices where partner_id is not null) as faktur_s_odberatelom,
  (select count(*) from danubra_v_partner_payment) as odberatelov;
