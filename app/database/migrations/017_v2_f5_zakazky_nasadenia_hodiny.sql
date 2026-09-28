-- ============================================================================
-- DANUBRA Hub v2 — F5 — Zákazky, nasadenia, výkazy hodín
-- ============================================================================
-- Od zmluvy po podklad na fakturáciu.
--
-- Tri veci, ktoré drží databáza:
--
--   1. **Uzavreté obdobie sa nemení.** Keď sa z hodín raz spraví podklad,
--      hodiny v ňom sa nedajú prepísať ani domazať. Bez toho by sa faktúra
--      a podklad rozišli a nikto by nevedel, ktoré číslo platí.
--   2. **Nasadenie bez platných dokladov neprejde** — a keď áno, len cez
--      zapísanú výnimku z F1.
--   3. **`danubra_workers.crew_id` prestáva byť druhý zdroj pravdy.**
--      Udržiava ho trigger podľa členstva, takže je to skratka, nie
--      informácia, ktorú treba ručne synchronizovať.
--
-- Idempotentné.
-- ============================================================================

-- ── Zákazka ─────────────────────────────────────────────────────────────────
alter table danubra_subcontracts add column if not exists contract_id uuid
  references danubra_contracts;
alter table danubra_subcontracts add column if not exists quote_id uuid
  references danubra_quotes;
alter table danubra_subcontracts add column if not exists hwo_notified_at date;
alter table danubra_subcontracts add column if not exists soka_registered_at date;

comment on column danubra_subcontracts.contract_id is
  'Zmluva, na ktorej zákazka stojí. Bez nej je to práca bez právneho základu.';
comment on column danubra_subcontracts.hwo_notified_at is
  'Dátum oznámenia regulovaného remesla podľa §9 HwO. Pri regulovaných '
  'remeslách sa bez neho nesmie začať.';
comment on column danubra_subcontracts.soka_registered_at is
  'Registrácia v SOKA-BAU. Pri stavebných prácach povinná; odvod je 14,7 %.';

create index if not exists idx_dsub_contract on danubra_subcontracts(contract_id);

-- ── Nasadenie ───────────────────────────────────────────────────────────────
alter table danubra_assignments add column if not exists crew_id uuid
  references danubra_crews;
alter table danubra_assignments add column if not exists worker_rate numeric;
alter table danubra_assignments add column if not exists overhead_per_hour numeric default 0;
alter table danubra_assignments add column if not exists started_at date;
alter table danubra_assignments add column if not exists ended_reason text;

comment on column danubra_assignments.worker_rate is
  'Čo platíme živnostníkovi za hodinu. charge_rate zostáva ako to, čo '
  'fakturujeme odberateľovi — rozdiel mínus réžia je marža.';
comment on column danubra_assignments.crew_id is
  'Partia, s ktorou bol človek nasadený. Nasadzuje sa naraz, ale fakturuje '
  'každý sám za seba (R5).';
comment on column danubra_assignments.accommodation_order_id is
  'Historická väzba na ubytovaciu objednávku z v1. Nové záznamy ju '
  'nepoužívajú — ubytovanie je od v2 náklad zákazky.';

create index if not exists idx_dasg_crew on danubra_assignments(crew_id)
  where crew_id is not null;

-- ── Výkazy hodín ────────────────────────────────────────────────────────────
alter table danubra_timesheets add column if not exists period_id uuid;
alter table danubra_timesheets add column if not exists rate_used numeric;
alter table danubra_timesheets add column if not exists source text default 'manual';

comment on column danubra_timesheets.rate_used is
  'Sadzba platná v deň výkonu. Zapíše sa pri uzávierke, aby neskoršia zmena '
  'sadzby neprepísala to, čo už bolo vyfakturované.';
comment on column danubra_timesheets.source is
  'manual | import | worker_app — odkiaľ hodiny prišli.';

create index if not exists idx_dts_period on danubra_timesheets(period_id)
  where period_id is not null;
create index if not exists idx_dts_date on danubra_timesheets(work_date);

-- ── Uzávierka obdobia ───────────────────────────────────────────────────────
create table if not exists danubra_periods (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references danubra_subcontracts,
  period_from date not null,
  period_to date not null,
  status text not null default 'open',     -- open | closed | invoiced
  closed_at timestamptz, closed_by uuid references auth.users,
  -- Súčty sa uložia pri uzavretí, nech sa spätne nemenia.
  hours_construction numeric default 0,
  hours_workshop numeric default 0,
  hours_travel numeric default 0,
  amount_charged numeric default 0,
  amount_worker_cost numeric default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_dper_unique
  on danubra_periods(subcontract_id, period_from, period_to);
create index if not exists idx_dper_status on danubra_periods(status);

comment on table danubra_periods is
  'Uzávierka obdobia. Z hodín vznikne podklad, ktorý sa už nemení — súčty '
  'sú uložené, nie dopočítavané, aby sa faktúra a podklad nikdy nerozišli.';

do $$
begin
  alter table danubra_periods add constraint danubra_per_dates_chk
    check (period_to >= period_from);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table danubra_timesheets
    add constraint danubra_ts_period_fk foreign key (period_id)
    references danubra_periods;
exception when duplicate_object then null;
end $$;

-- ── Checklist pred nasadením ────────────────────────────────────────────────
-- v1 mala danubra_checklist_items s voľným textom a nepoužila sa. v2 ju viaže
-- na kľúče pravidiel, takže sa dá povedať, čo presne chýba.
create table if not exists danubra_assignment_checks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references danubra_assignments on delete cascade,
  rule_key text not null,
  required bool default true,
  done bool default false,
  done_at timestamptz, done_by uuid references auth.users,
  note text,
  created_at timestamptz not null default now(),
  unique (assignment_id, rule_key)
);
create index if not exists idx_dac_assignment on danubra_assignment_checks(assignment_id);

-- ── Uzavreté obdobie sa nemení ──────────────────────────────────────────────
-- Toto je jadro fázy. Keď sa z hodín raz spraví podklad a z podkladu faktúra,
-- hodiny v ňom sa nesmú dať prepísať — inak by sa podklad a faktúra rozišli
-- a pri kontrole by sa nedalo povedať, ktoré číslo platí.
create or replace function danubra_timesheet_period_frozen()
returns trigger
language plpgsql
as $$
declare
  v_period uuid;
  v_status text;
begin
  v_period := coalesce(
    case when tg_op = 'DELETE' then old.period_id else new.period_id end,
    case when tg_op = 'UPDATE' then old.period_id end
  );
  if v_period is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select status into v_status from danubra_periods where id = v_period;
  if v_status in ('closed', 'invoiced') then
    raise exception
      'Hodiny patria do uzavretého obdobia (%). Uzavreté obdobie sa nemení — otvor ho späť alebo zapíš opravu do nasledujúceho obdobia.',
      v_status
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists danubra_ts_frozen_trg on danubra_timesheets;
create trigger danubra_ts_frozen_trg
  before update or delete on danubra_timesheets
  for each row execute function danubra_timesheet_period_frozen();

comment on function danubra_timesheet_period_frozen() is
  'Hodiny v uzavretom alebo vyfakturovanom období sa nedajú zmeniť ani '
  'zmazať. Drží sa to v databáze, nie v UI — hodiny môže meniť aj import.';

-- ── crew_id na pracovníkovi: udržiavaná skratka, nie druhý zdroj pravdy ─────
-- Vo F2 stĺpec pribudol a nikto ho nezapisoval, takže hrozilo, že sa rozíde
-- s tabuľkou členstva. Riešenie: nedrží ho človek, drží ho trigger podľa
-- danubra_crew_members. Pravda zostáva v členstve, ktoré má trvanie; toto je
-- len „v ktorej partii je práve teraz", aby sa to nemuselo dopočítavať
-- v každom zozname.
create or replace function danubra_worker_crew_sync()
returns trigger
language plpgsql
as $$
declare
  v_worker uuid := coalesce(new.worker_id, old.worker_id);
begin
  update danubra_workers w
  set crew_id = (
    select m.crew_id from danubra_crew_members m
    where m.worker_id = v_worker and m.left_at is null
    order by m.joined_at desc limit 1
  )
  where w.id = v_worker;
  return null;
end $$;

drop trigger if exists danubra_worker_crew_trg on danubra_crew_members;
create trigger danubra_worker_crew_trg
  after insert or update or delete on danubra_crew_members
  for each row execute function danubra_worker_crew_sync();

comment on column danubra_workers.crew_id is
  'V ktorej partii je človek práve teraz. Udržiava trigger podľa '
  'danubra_crew_members — nezapisuj to ručne. Pravda o členstve je '
  'v danubra_crew_members, lebo tam má trvanie.';

-- Dorovnanie existujúcich záznamov
update danubra_workers w
set crew_id = (
  select m.crew_id from danubra_crew_members m
  where m.worker_id = w.id and m.left_at is null
  order by m.joined_at desc limit 1
);

-- ── Nasadenie celej partie naraz ────────────────────────────────────────────
-- Klikať po jednom pri šesťčlennej partii je cesta k preklepu v sadzbe.
-- Funkcia preskočí tých, čo na zákazke už nasadení sú — dá sa teda zavolať
-- znova, keď do partie niekto pribudne.
create or replace function danubra_assign_crew(
  p_crew_id uuid,
  p_subcontract_id uuid,
  p_date_from date default current_date,
  p_date_to date default null,
  p_worker_rate numeric default null,
  p_charge_rate numeric default null,
  p_overhead numeric default 0
)
returns int
language plpgsql
security invoker
as $$
declare
  v_count int := 0;
  m record;
begin
  if not exists (select 1 from danubra_crews where id = p_crew_id) then
    raise exception 'partia % neexistuje', p_crew_id;
  end if;
  if not exists (select 1 from danubra_subcontracts where id = p_subcontract_id) then
    raise exception 'zákazka % neexistuje', p_subcontract_id;
  end if;

  for m in
    select cm.worker_id, cm.role
    from danubra_crew_members cm
    where cm.crew_id = p_crew_id and cm.left_at is null
  loop
    -- Kto na zákazke už beží, ten sa nepridáva druhýkrát.
    if exists (
      select 1 from danubra_assignments a
      where a.subcontract_id = p_subcontract_id
        and a.worker_id = m.worker_id
        and a.status = 'active'
    ) then
      continue;
    end if;

    insert into danubra_assignments (
      subcontract_id, worker_id, crew_id, role,
      date_from, date_to, worker_rate, charge_rate, overhead_per_hour, status
    ) values (
      p_subcontract_id, m.worker_id, p_crew_id,
      case when m.role = 'leader' then 'predak' else 'clen' end,
      p_date_from, p_date_to,
      coalesce(p_worker_rate, (select hourly_cost from danubra_workers where id = m.worker_id)),
      p_charge_rate, coalesce(p_overhead, 0), 'active'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function danubra_assign_crew(uuid, uuid, date, date, numeric, numeric, numeric) is
  'Nasadí všetkých aktívnych členov partie na zákazku naraz. Kto už na nej '
  'beží, ten sa preskočí — dá sa teda zavolať znova, keď do partie niekto '
  'pribudne. Vracia počet skutočne pridaných.';

-- ── Uzávierka obdobia ───────────────────────────────────────────────────────
-- Súčty sa **uložia**, nie dopočítavajú. Keby sa dopočítavali, neskoršia
-- zmena sadzby by spätne zmenila to, čo už bolo vyfakturované.
create or replace function danubra_close_period(p_period_id uuid)
returns danubra_periods
language plpgsql
security invoker
as $$
declare
  p danubra_periods;
begin
  select * into p from danubra_periods where id = p_period_id for update;
  if not found then
    raise exception 'obdobie % neexistuje', p_period_id;
  end if;
  if p.status <> 'open' then
    raise exception 'obdobie už je %; znova sa uzavrieť nedá', p.status;
  end if;

  -- Hodiny sa naviažu na obdobie a zmrazí sa sadzba, ktorá pri nich platila.
  update danubra_timesheets t
  set period_id = p.id,
      rate_used = coalesce(t.rate_used, a.worker_rate,
                           (select hourly_cost from danubra_workers where id = t.worker_id))
  from danubra_assignments a
  where t.assignment_id = a.id
    and a.subcontract_id = p.subcontract_id
    and t.work_date between p.period_from and p.period_to
    and t.period_id is null
    and coalesce(t.approved, false) = true;

  -- Súčty z toho, čo do obdobia naozaj patrí.
  select
    coalesce(sum(t.hours) filter (where coalesce(t.activity_type,'construction') = 'construction'), 0),
    coalesce(sum(t.hours) filter (where t.activity_type = 'workshop'), 0),
    coalesce(sum(t.hours) filter (where t.activity_type = 'travel'), 0),
    coalesce(sum(t.hours * coalesce(a.charge_rate, 0)), 0),
    coalesce(sum(t.hours * coalesce(t.rate_used, a.worker_rate, 0)), 0)
  into p.hours_construction, p.hours_workshop, p.hours_travel,
       p.amount_charged, p.amount_worker_cost
  from danubra_timesheets t
  join danubra_assignments a on a.id = t.assignment_id
  where t.period_id = p.id;

  update danubra_periods set
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    hours_construction = p.hours_construction,
    hours_workshop = p.hours_workshop,
    hours_travel = p.hours_travel,
    amount_charged = p.amount_charged,
    amount_worker_cost = p.amount_worker_cost,
    updated_at = now()
  where id = p.id
  returning * into p;

  return p;
end $$;

comment on function danubra_close_period(uuid) is
  'Uzavrie obdobie: naviaže schválené hodiny, zmrazí sadzbu, ktorá pri nich '
  'platila, a uloží súčty. Súčty sa ukladajú, nie dopočítavajú — neskoršia '
  'zmena sadzby nesmie spätne zmeniť to, čo už bolo vyfakturované.';

-- Otvorenie späť. Dá sa len dovtedy, kým z obdobia nevznikla faktúra.
create or replace function danubra_reopen_period(p_period_id uuid, p_reason text)
returns danubra_periods
language plpgsql
security invoker
as $$
declare
  p danubra_periods;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'otvorenie obdobia späť vyžaduje dôvod aspoň na 5 znakov';
  end if;

  select * into p from danubra_periods where id = p_period_id for update;
  if not found then
    raise exception 'obdobie % neexistuje', p_period_id;
  end if;
  if p.status = 'invoiced' then
    raise exception 'z obdobia už vznikla faktúra — otvoriť späť sa nedá; oprav to dobropisom alebo v nasledujúcom období';
  end if;
  if p.status = 'open' then
    return p;
  end if;

  update danubra_periods set
    status = 'open', closed_at = null, closed_by = null,
    note = trim(both E'\n' from coalesce(note, '') || E'\n' ||
      to_char(now(), 'DD.MM.YYYY') || ' otvorené späť: ' || p_reason),
    updated_at = now()
  where id = p.id returning * into p;

  return p;
end $$;

comment on function danubra_reopen_period(uuid, text) is
  'Otvorí uzavreté obdobie späť. Vyžaduje dôvod, ktorý sa pripíše do '
  'poznámky obdobia. Vyfakturované obdobie sa otvoriť nedá.';

-- ── Prehľad zákazky ─────────────────────────────────────────────────────────
create or replace view danubra_v_subcontract_status as
select
  s.id,
  s.contract_number,
  s.title,
  s.status,
  s.work_type,
  s.partner_id,
  p.name as partner_name,
  s.contract_id,
  c.status as contract_status,
  count(distinct a.id) filter (where a.status = 'active') as active_assignments,
  count(distinct a.crew_id) filter (where a.status = 'active' and a.crew_id is not null) as crews,
  coalesce(sum(t.hours) filter (where t.period_id is null), 0) as hours_open,
  count(distinct per.id) filter (where per.status = 'open') as periods_open,
  count(distinct per.id) filter (where per.status = 'closed') as periods_closed
from danubra_subcontracts s
left join danubra_partners p on p.id = s.partner_id
left join danubra_contracts c on c.id = s.contract_id
left join danubra_assignments a on a.subcontract_id = s.id
left join danubra_timesheets t on t.assignment_id = a.id
left join danubra_periods per on per.subcontract_id = s.id
group by s.id, s.contract_number, s.title, s.status, s.work_type,
         s.partner_id, p.name, s.contract_id, c.status;

comment on view danubra_v_subcontract_status is
  'Zákazky s počtom nasadení, neuzavretých hodín a obdobím. Slúži zoznamu '
  'zákaziek, aby nemusel robiť päť dotazov na riadok.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_periods;
create trigger set_updated_at before update on danubra_periods
  for each row execute function danubra_set_updated_at();

alter table danubra_periods enable row level security;
drop policy if exists danubra_auth_all on danubra_periods;
create policy danubra_auth_all on danubra_periods
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

alter table danubra_assignment_checks enable row level security;
drop policy if exists danubra_auth_all on danubra_assignment_checks;
create policy danubra_auth_all on danubra_assignment_checks
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Číselníky ───────────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, sort_order) values
('period_status','open','Otvorené','Offen',1),
('period_status','closed','Uzavreté','Abgeschlossen',2),
('period_status','invoiced','Vyfakturované','Fakturiert',3),
('activity_type','construction','Stavebné práce','Bauarbeiten',1),
('activity_type','workshop','Dielenské práce','Werkstattarbeiten',2),
('activity_type','travel','Cesta','Fahrt',3),
('activity_type','other','Iné','Sonstiges',9)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  sort_order = excluded.sort_order;

-- Diagnostika
select
  (select count(*) from danubra_periods) as obdobi,
  (select count(*) from danubra_assignments where crew_id is not null) as nasadeni_s_partiou,
  (select count(*) from danubra_workers where crew_id is not null) as ludi_v_partii;
