-- ============================================================================
-- DANUBRA v2 — zálohy živnostníkom a ich účet
-- ============================================================================
-- Živnostník nám fakturuje spätne, ale peniaze potrebuje priebežne. V praxi
-- sa preto vypláca záloha — a dovtedy sa to viedlo v hlave alebo v zošite.
-- Keď sa na ňu zabudne, zaplatí sa faktúra celá a záloha je preč.
--
-- Preto:
--   * záloha je záznam s dátumom, sumou a spôsobom výplaty,
--   * vyrovná sa naviazaním na prijatú faktúru (`settled_bill_id`),
--   * **nemaže sa** — omyl sa ruší cez `voided_at` s dôvodom, rovnako ako
--     výnimky z blokátorov (migrácia 013).
--
-- Pohľad `danubra_v_worker_account` odpovedá na otázku, ktorá sa pýta pri
-- každej výplate: **koľko tomuto človeku dlhujeme?**
--
-- Idempotentná. Nič nemaže ani nepremenúva.
-- ============================================================================

-- ── Zálohy ──────────────────────────────────────────────────────────────────
create table if not exists danubra_advances (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references danubra_workers,
  -- Na ktorú zákazku sa záloha viaže. Nepovinné: vypláca sa človeku,
  -- nie stavbe, ale pri rozúčtovaní nákladov to pomôže.
  subcontract_id uuid references danubra_subcontracts,
  amount numeric not null,
  currency text not null default 'EUR',
  paid_on date not null default current_date,
  method text not null default 'bank',      -- bank | cash | other
  note text,

  -- Vyrovnanie: záloha sa odpočíta od konkrétnej prijatej faktúry.
  settled_bill_id uuid references danubra_bills,
  settled_at timestamptz,

  -- Storno. Riadok zostáva, aby sa dalo dohľadať, čo sa stalo.
  voided_at timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,

  constraint danubra_advances_amount_positive check (amount > 0),
  -- Dôvod storna musí byť zmysluplný, nie medzera. Rovnaký prah ako
  -- `danubra_overrides.reason` (5 znakov), aby to bolo všade rovnaké.
  constraint danubra_advances_void_reason check (
    voided_at is null or length(btrim(coalesce(void_reason, ''))) >= 5
  )
);

create index if not exists idx_dadv_worker on danubra_advances(worker_id, paid_on desc);
create index if not exists idx_dadv_open on danubra_advances(worker_id)
  where settled_at is null and voided_at is null;
create index if not exists idx_dadv_bill on danubra_advances(settled_bill_id)
  where settled_bill_id is not null;

comment on table danubra_advances is
  'Zálohy vyplatené živnostníkovi pred jeho faktúrou. Nemažú sa — omyl sa '
  'ruší cez voided_at s dôvodom.';
comment on column danubra_advances.settled_bill_id is
  'Prijatá faktúra, z ktorej sa záloha odpočítala. Kým je prázdne, záloha '
  'je nevyrovnaná a znižuje to, čo živnostníkovi dlhujeme.';

-- ── Záloha musí patriť tomu istému človeku ako faktúra ─────────────────────
-- Bez toho by sa dala odpočítať záloha jedného človeka z faktúry druhého
-- a v účte by to nikde nebolo vidieť.
create or replace function danubra_advance_check()
returns trigger language plpgsql as $$
declare
  v_bill_worker uuid;
begin
  if new.settled_bill_id is not null then
    select worker_id into v_bill_worker
      from danubra_bills where id = new.settled_bill_id;
    if v_bill_worker is null then
      raise exception 'Faktúra, na ktorú sa záloha viaže, neexistuje';
    end if;
    if v_bill_worker <> new.worker_id then
      raise exception 'Záloha patrí inému živnostníkovi než faktúra — odpočítať sa nedá';
    end if;
    -- Naviazanie na faktúru je zároveň vyrovnanie.
    if new.settled_at is null then new.settled_at := now(); end if;
  end if;

  -- Zrušená záloha sa nevyrovnáva; sú to dve rôzne veci a plietli by sa.
  if new.voided_at is not null and new.settled_at is not null then
    raise exception 'Záloha je zrušená — vyrovnať sa už nedá';
  end if;
  return new;
end $$;

drop trigger if exists danubra_advance_check on danubra_advances;
create trigger danubra_advance_check
  before insert or update on danubra_advances
  for each row execute function danubra_advance_check();

drop trigger if exists set_updated_at on danubra_advances;
create trigger set_updated_at before update on danubra_advances
  for each row execute function danubra_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Zámerne bez politiky na delete: záloha sa ruší cez voided_at.
alter table danubra_advances enable row level security;
do $$
begin
  drop policy if exists danubra_advances_read on danubra_advances;
  drop policy if exists danubra_advances_write on danubra_advances;
  drop policy if exists danubra_advances_update on danubra_advances;

  create policy danubra_advances_read on danubra_advances
    for select using (auth.role() = 'authenticated');
  create policy danubra_advances_write on danubra_advances
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_advances_update on danubra_advances
    for update using (auth.role() = 'authenticated');
end $$;

-- ── Číselník spôsobov výplaty ──────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('advance_method','bank','Prevodom','Überweisung','Vidno to vo výpise, dá sa spárovať.',1),
('advance_method','cash','V hotovosti','Bar','Nechaj si potvrdiť prevzatie.',2),
('advance_method','other','Inak','Sonstiges',null,3)
on conflict (kind, key) do update
  set label_sk = excluded.label_sk,
      label_de = excluded.label_de,
      hint     = excluded.hint,
      sort_order = excluded.sort_order;

-- ── Účet živnostníka ───────────────────────────────────────────────────────
-- Odpovedá na otázku, ktorá sa pýta pri každej výplate: koľko mu dlhujeme?
--
--   odrobil     → hodiny × sadzba platná v ten deň (odhad, kým nepríde faktúra)
--   vyfakturoval→ jeho prijaté faktúry, ktoré sme schválili alebo uhradili
--   uhradené    → z toho už zaplatené
--   zálohy      → vyplatené a ešte nevyrovnané
--   dlhujeme    = schválené neuhradené − nevyrovnané zálohy
--
-- Sporné faktúry sa nezapočítavajú — ešte nie sú záväzok (rovnako ako
-- v ekonomike zákazky, migrácia 019).
create or replace view danubra_v_worker_account as
with hours as (
  select
    t.worker_id,
    coalesce(sum(t.hours), 0)                                as hours_total,
    coalesce(sum(t.hours) filter (where t.period_id is null), 0) as hours_open,
    coalesce(sum(t.hours * coalesce(t.rate_used, a.worker_rate, w.hourly_cost, 0)), 0)
                                                             as earned_total
  from danubra_timesheets t
  join danubra_workers w on w.id = t.worker_id
  left join danubra_assignments a on a.id = t.assignment_id
  group by t.worker_id
),
bills as (
  select
    b.worker_id,
    coalesce(sum(b.amount) filter (where b.status in ('approved','paid')), 0) as billed,
    coalesce(sum(b.amount) filter (where b.status = 'paid'), 0)              as bills_paid,
    coalesce(sum(b.amount) filter (where b.status = 'approved'), 0)          as bills_unpaid,
    coalesce(sum(b.amount) filter (where b.status = 'disputed'), 0)          as bills_disputed,
    count(*) filter (where b.status in ('received','checked'))               as bills_to_check
  from danubra_bills b
  group by b.worker_id
),
adv as (
  select
    v.worker_id,
    coalesce(sum(v.amount) filter (where v.settled_at is null and v.voided_at is null), 0) as advances_open,
    coalesce(sum(v.amount) filter (where v.voided_at is null), 0)                          as advances_total
  from danubra_advances v
  group by v.worker_id
)
select
  w.id                                as worker_id,
  w.full_name,
  coalesce(h.hours_total, 0)          as hours_total,
  coalesce(h.hours_open, 0)           as hours_open,
  coalesce(h.earned_total, 0)         as earned_total,
  coalesce(b.billed, 0)               as billed,
  coalesce(b.bills_paid, 0)           as bills_paid,
  coalesce(b.bills_unpaid, 0)         as bills_unpaid,
  coalesce(b.bills_disputed, 0)       as bills_disputed,
  coalesce(b.bills_to_check, 0)       as bills_to_check,
  coalesce(a.advances_open, 0)        as advances_open,
  coalesce(a.advances_total, 0)       as advances_total,
  coalesce(b.bills_unpaid, 0) - coalesce(a.advances_open, 0) as owed
from danubra_workers w
left join hours h on h.worker_id = w.id
left join bills b on b.worker_id = w.id
left join adv   a on a.worker_id = w.id;

comment on view danubra_v_worker_account is
  'Účet živnostníka: čo odrobil, čo vyfakturoval, čo dostal zálohou a koľko '
  'mu dlhujeme. `owed` je schválené neuhradené mínus nevyrovnané zálohy. '
  'Rovnaké pravidlá ako lib/staffing/account.js, ktorá má testy.';

-- ── Prečo tu nie je pravidlo na nevyrovnané zálohy ─────────────────────────
-- Motor pravidiel (migrácia 021) zapisuje úlohe `entity_id` riadku zdrojovej
-- tabuľky. Pri zálohe by teda vznikla úloha s `entity_type = 'worker'`
-- a `entity_id` zálohy — odkaz, ktorý nikam nevedie.
--
-- Nevyrovnané zálohy sa preto ukazujú priamo v účte živnostníka a medzi
-- upozorneniami na prehľade, kde sa dá odkázať na správneho človeka.
-- Pravidlo tu pribudne, až keď bude motor vedieť odvodiť entitu z iného
-- stĺpca než `id`.

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_advances)            as zaloh,
  (select count(*) from danubra_v_worker_account)    as uctov,
  (select count(*) from danubra_enums
     where kind = 'advance_method')                  as sposobov_vyplaty;
