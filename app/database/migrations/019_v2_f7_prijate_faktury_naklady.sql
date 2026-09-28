-- ============================================================================
-- DANUBRA Hub v2 — F7 — Prijaté faktúry a náklady
-- ============================================================================
-- Druhá strana peňazí.
--
-- Toto je miesto, kde sa v tomto biznise najčastejšie strácajú peniaze:
-- živnostník vyfakturuje viac hodín, než odrobil, a pri desiatich ľuďoch to
-- nikto nezachytí. Appka vie, koľko schválených hodín má za obdobie, takže
-- rozdiel dopočíta sama — a faktúru s rozdielom **nepustí schváliť bez
-- poznámky**. Drží to trigger, nie obrazovka.
--
-- Druhá vec: skeny. Privátny bucket, podpísané URL s krátkou platnosťou,
-- nikdy priamy odkaz. To isté úložisko poslúži aj dokladom pracovníkov
-- a PDF zmlúv, ktoré na to čakali od F2 a F4.
--
-- Idempotentné.
-- ============================================================================

-- ── Faktúra od živnostníka ──────────────────────────────────────────────────
create table if not exists danubra_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text,                        -- ich číslo faktúry
  worker_id uuid not null references danubra_workers,
  assignment_id uuid references danubra_assignments,
  period_id uuid references danubra_periods,
  subcontract_id uuid references danubra_subcontracts,
  issue_date date, due_date date, delivery_date date,
  amount numeric not null,
  vat_amount numeric default 0,
  currency text default 'EUR',
  -- kontrola voči schváleným hodinám
  expected_amount numeric,
  expected_hours numeric,
  variance numeric,
  status text not null default 'received', -- received|checked|approved|paid|disputed
  checked_at timestamptz, checked_by uuid references auth.users,
  approved_at timestamptz, approved_by uuid references auth.users,
  paid_at timestamptz,
  storage_path text,
  sf_expense_id int,
  sf_error text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dbill_worker on danubra_bills(worker_id);
create index if not exists idx_dbill_status on danubra_bills(status);
create index if not exists idx_dbill_period on danubra_bills(period_id)
  where period_id is not null;

comment on table danubra_bills is
  'Faktúry, ktoré nám pošlú živnostníci. `expected_amount` dopočíta databáza '
  'zo schválených hodín; nenulový `variance` znamená, že sa treba pozrieť.';
comment on column danubra_bills.expected_amount is
  'Čo by podľa schválených hodín a sadzby nasadenia malo prísť. Počíta sa '
  'automaticky — nezapisuj ručne.';
comment on column danubra_bills.variance is
  'amount − expected_amount. Kladný znamená, že fakturuje viac, než odrobil.';

-- ── Ostatné náklady ─────────────────────────────────────────────────────────
create table if not exists danubra_costs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subcontract_id uuid references danubra_subcontracts,
  worker_id uuid references danubra_workers,
  supplier text,
  description text,
  amount numeric not null,
  currency text default 'EUR',
  cost_date date not null default current_date,
  -- opakované náklady (mesačné ubytovanie)
  recurring bool default false,
  recurring_until date,
  parent_cost_id uuid references danubra_costs,
  storage_path text,
  sf_expense_id int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcost_sub on danubra_costs(subcontract_id);
create index if not exists idx_dcost_date on danubra_costs(cost_date desc);
create index if not exists idx_dcost_recurring on danubra_costs(recurring)
  where recurring = true;

comment on column danubra_costs.category is
  'Kľúč z číselníka cost_category (migrácia 013).';
comment on column danubra_costs.parent_cost_id is
  'Pri opakovanom náklade ukazuje na predlohu, z ktorej vznikol. Vďaka tomu '
  'sa dá zrušiť celý rad, nie každý mesiac zvlášť.';

-- ── Kontrola voči hodinám ───────────────────────────────────────────────────
-- Toto je jadro fázy. Počíta sa v databáze, aby to platilo aj pri importe.
create or replace function danubra_bill_check()
returns trigger
language plpgsql
as $$
declare
  v_expected numeric := null;
  v_hours numeric := null;
begin
  -- Očakávaná suma sa dá dopočítať len vtedy, keď vieme, za ktoré obdobie
  -- a ktorého človeka faktúra je.
  if new.period_id is not null and new.worker_id is not null then
    select
      coalesce(sum(t.hours), 0),
      coalesce(sum(t.hours * coalesce(t.rate_used, a.worker_rate,
        (select hourly_cost from danubra_workers where id = new.worker_id), 0)), 0)
    into v_hours, v_expected
    from danubra_timesheets t
    join danubra_assignments a on a.id = t.assignment_id
    where t.period_id = new.period_id
      and t.worker_id = new.worker_id
      and coalesce(t.approved, false) = true;
  end if;

  new.expected_hours := v_hours;
  new.expected_amount := v_expected;
  new.variance := case when v_expected is null then null
                       else round(coalesce(new.amount, 0) - v_expected, 2) end;

  -- Nenulový rozdiel = spor. Stav sa nastaví sám, nech sa to nedá prehliadnuť.
  -- Tolerancia jeden cent kryje zaokrúhľovanie, nie „skoro sedí".
  if new.variance is not null and abs(new.variance) > 0.01
     and new.status in ('received', 'checked') then
    new.status := 'disputed';
  end if;

  -- Sporná faktúra sa nedá schváliť bez poznámky. Bez toho by sa rozdiel
  -- odklikol a o pol roka by nikto nevedel, prečo.
  if new.status = 'approved' and new.variance is not null and abs(new.variance) > 0.01 then
    if length(btrim(coalesce(new.note, ''))) < 5 then
      raise exception
        'Faktúra sa líši od schválených hodín o %. Schváliť sa dá len s poznámkou, ktorá vysvetlí prečo.',
        new.variance using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  return new;
end $$;

drop trigger if exists danubra_bill_check_trg on danubra_bills;
create trigger danubra_bill_check_trg before insert or update on danubra_bills
  for each row execute function danubra_bill_check();

comment on function danubra_bill_check() is
  'Dopočíta očakávanú sumu zo schválených hodín a rozdiel. Faktúru '
  's rozdielom preklopí do sporu a nepustí ju schváliť bez poznámky. '
  'V databáze, nie v UI — faktúry môžu prísť aj importom.';

-- ── Opakované náklady ───────────────────────────────────────────────────────
-- Mesačné ubytovanie sa nezadáva dvanásťkrát ručne.
create or replace function danubra_generate_recurring_costs(p_until date default null)
returns int
language plpgsql
security invoker
as $$
declare
  c record;
  v_next date;
  v_count int := 0;
  v_limit date := coalesce(p_until, (current_date + interval '1 month')::date);
begin
  for c in
    select * from danubra_costs
    where recurring = true and parent_cost_id is null
      and (recurring_until is null or recurring_until >= current_date)
  loop
    -- Posledný mesiac, ktorý z tejto predlohy už vznikol.
    select coalesce(max(cost_date), c.cost_date) into v_next
    from danubra_costs where parent_cost_id = c.id;

    v_next := (date_trunc('month', v_next) + interval '1 month')::date
              + (extract(day from c.cost_date)::int - 1);

    while v_next <= v_limit
          and (c.recurring_until is null or v_next <= c.recurring_until)
    loop
      if not exists (
        select 1 from danubra_costs
        where parent_cost_id = c.id and cost_date = v_next
      ) then
        insert into danubra_costs (
          category, subcontract_id, worker_id, supplier, description,
          amount, currency, cost_date, recurring, parent_cost_id, note
        ) values (
          c.category, c.subcontract_id, c.worker_id, c.supplier, c.description,
          c.amount, c.currency, v_next, false, c.id,
          'Vzniklo z opakovaného nákladu.'
        );
        v_count := v_count + 1;
      end if;
      v_next := (date_trunc('month', v_next) + interval '1 month')::date
                + (extract(day from c.cost_date)::int - 1);
    end loop;
  end loop;

  return v_count;
end $$;

comment on function danubra_generate_recurring_costs(date) is
  'Vygeneruje opakované náklady do zadaného dátumu. Idempotentné — čo už '
  'existuje, nevznikne druhýkrát. Volá to denný cron.';

-- ── Náklady a marža zákazky ─────────────────────────────────────────────────
create or replace view danubra_v_subcontract_economics as
select
  s.id as subcontract_id,
  s.title,
  s.partner_id,
  coalesce(inv.charged, 0)      as invoiced,
  coalesce(b.billed, 0)         as worker_bills,
  coalesce(co.costs, 0)         as other_costs,
  coalesce(inv.charged, 0) - coalesce(b.billed, 0) - coalesce(co.costs, 0) as margin,
  coalesce(inv.withheld, 0)     as withheld_48b
from danubra_subcontracts s
left join lateral (
  select sum(i.total) as charged, sum(i.withholding_amount) as withheld
  from danubra_invoices i
  where i.subcontract_id = s.id and i.status not in ('cancelled', 'draft')
) inv on true
left join lateral (
  select sum(x.amount) as billed from danubra_bills x
  where x.subcontract_id = s.id and x.status in ('approved', 'paid')
) b on true
left join lateral (
  select sum(x.amount) as costs from danubra_costs x
  where x.subcontract_id = s.id
) co on true;

comment on view danubra_v_subcontract_economics is
  'Čo zákazka zarobila po odpočítaní faktúr od živnostníkov a ostatných '
  'nákladov. Do nákladov sa počítajú len schválené a uhradené faktúry — '
  'sporné nie, tie ešte nie sú záväzok.';

-- ── Privátny bucket na doklady ──────────────────────────────────────────────
-- Skeny prijatých faktúr, doklady pracovníkov (čakali od F2) a PDF zmlúv
-- (čakali od F4). Jedno úložisko, jeden režim prístupu.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('danubra-docs', 'danubra-docs', false, 26214400,
          array['application/pdf','image/jpeg','image/png','image/heic',
                'image/webp','image/tiff'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when insufficient_privilege then
  raise notice 'Bucket danubra-docs sa nedá založiť cez SQL — vytvor ho ručne v Storage (Public vypnuté).';
end $$;

do $$
begin
  drop policy if exists danubra_docs_read on storage.objects;
  drop policy if exists danubra_docs_write on storage.objects;
  drop policy if exists danubra_docs_update on storage.objects;
  drop policy if exists danubra_docs_delete on storage.objects;

  create policy danubra_docs_read on storage.objects
    for select using (bucket_id = 'danubra-docs' and auth.role() = 'authenticated');
  create policy danubra_docs_write on storage.objects
    for insert with check (bucket_id = 'danubra-docs' and auth.role() = 'authenticated');
  create policy danubra_docs_update on storage.objects
    for update using (bucket_id = 'danubra-docs' and auth.role() = 'authenticated');
  create policy danubra_docs_delete on storage.objects
    for delete using (bucket_id = 'danubra-docs' and auth.role() = 'authenticated');
exception when insufficient_privilege then
  raise notice 'Politiky na storage.objects sa nedajú vytvoriť cez SQL — nastav ich v Storage → Policies.';
end $$;

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_bills;
create trigger set_updated_at before update on danubra_bills
  for each row execute function danubra_set_updated_at();
drop trigger if exists set_updated_at on danubra_costs;
create trigger set_updated_at before update on danubra_costs
  for each row execute function danubra_set_updated_at();

-- Prijatá faktúra sa nemaže — je to doklad. Zlá sa označí ako sporná.
alter table danubra_bills enable row level security;
drop policy if exists danubra_auth_all on danubra_bills;
drop policy if exists danubra_bill_read on danubra_bills;
drop policy if exists danubra_bill_insert on danubra_bills;
drop policy if exists danubra_bill_update on danubra_bills;
create policy danubra_bill_read on danubra_bills
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_bill_insert on danubra_bills
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_bill_update on danubra_bills
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

alter table danubra_costs enable row level security;
drop policy if exists danubra_auth_all on danubra_costs;
create policy danubra_auth_all on danubra_costs
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Číselník stavov ─────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('bill_status','received','Prijatá','Erhalten','Ešte nikto nekontroloval.',1),
('bill_status','checked','Skontrolovaná','Geprüft','Sedí s hodinami.',2),
('bill_status','disputed','Sporná','Strittig',
 'Líši sa od schválených hodín. Schváliť sa dá len s poznámkou.',3),
('bill_status','approved','Schválená','Freigegeben',null,4),
('bill_status','paid','Uhradená','Bezahlt',null,5)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- Diagnostika
select
  (select count(*) from danubra_bills) as prijatych_faktur,
  (select count(*) from danubra_costs) as nakladov,
  (select count(*) from storage.buckets where id = 'danubra-docs') as bucket;
