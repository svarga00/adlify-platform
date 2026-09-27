-- ============================================================================
-- DANUBRA Hub v2 — F4 — Ponuky a zmluvy
-- ============================================================================
-- Obchodná časť pred zákazkou: čo sme sľúbili, za koľko, a čo je podpísané.
--
-- Tvrdé pravidlo zo zadania: **zmena koncového dátumu = záznam dodatku.**
-- Drží ho trigger v databáze, nie UI. Keby to strážila len obrazovka,
-- stačil by jeden import alebo jeden `update` z SQL editora a zmluva by
-- tvrdila niečo iné, než na čo sa odberateľ podpísal. To isté platí pre
-- sadzbu — dohodnutá cena nie je políčko, ktoré sa prepíše.
--
-- Ponuka pozná svoju maržu. Nie preto, aby sa ukázala odberateľovi, ale aby
-- sa nedala odoslať ponuka, na ktorej sa prerába — v1 sa to dalo zistiť až
-- z faktúr, teda o tri mesiace neskôr.
--
-- Idempotentné.
-- ============================================================================

-- ── Ponuka ──────────────────────────────────────────────────────────────────
create table if not exists danubra_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text unique,                -- PON-2026-0001
  partner_id uuid references danubra_partners,
  title text not null,
  trade_key text,
  headcount int not null default 1,
  work_type text default 'construction',   -- construction | workshop
  site_city text, site_address text, country text default 'DE',
  date_from date, date_to date,
  hours_per_month numeric default 168,     -- predpoklad na prepočet marže
  -- peniaze
  charge_rate numeric,                     -- čo fakturujeme odberateľovi za hodinu
  worker_rate numeric,                     -- čo platíme živnostníkovi za hodinu
  overhead_per_hour numeric default 0,     -- ubytovanie, doprava, réžia
  currency text default 'EUR',
  -- platnosť a stav
  valid_until date,
  status text not null default 'draft',    -- draft|sent|accepted|rejected|expired
  sent_at timestamptz, decided_at timestamptz,
  reject_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dq_status on danubra_quotes(status);
create index if not exists idx_dq_partner on danubra_quotes(partner_id);

comment on table danubra_quotes is
  'Ponuka odberateľovi. Pozná svoju maržu, aby sa nedala odoslať ponuka, '
  'na ktorej sa prerába.';
comment on column danubra_quotes.hours_per_month is
  'Predpoklad odrobených hodín na človeka a mesiac. Slúži len na prepočet '
  'marže v ponuke, fakturuje sa podľa skutočných hodín.';
comment on column danubra_quotes.overhead_per_hour is
  'Ubytovanie, doprava a réžia prepočítané na hodinu. Bez toho vyzerá marža '
  'lepšie, než je.';

-- ── Zmluva ──────────────────────────────────────────────────────────────────
create table if not exists danubra_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text unique,             -- ZML-2026-0001
  partner_id uuid not null references danubra_partners,
  quote_id uuid references danubra_quotes,
  title text not null,
  kind text default 'werkvertrag',         -- werkvertrag | framework
  scope text,
  date_from date, date_to date,
  charge_rate numeric,
  payment_terms_days int default 30,
  signed_at date,
  storage_path text,
  status text not null default 'draft',    -- draft|sent|signed|active|ended|cancelled
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcon_partner on danubra_contracts(partner_id);
create index if not exists idx_dcon_status on danubra_contracts(status);

comment on column danubra_contracts.scope is
  'Predmet diela. Píše sa ako dielo, nie ako hodiny — pri kontrole rozhoduje '
  'obsah zmluvy, nie jej názov. Hodinová formulácia je jeden zo znakov '
  'skrytej Arbeitnehmerüberlassung.';
comment on column danubra_contracts.kind is
  'werkvertrag = zmluva o dielo na konkrétnu zákazku, framework = rámcová.';

-- ── Dodatok ─────────────────────────────────────────────────────────────────
-- Zmena dátumu alebo sadzby nikdy neprepíše pôvodnú hodnotu — pribudne riadok.
create table if not exists danubra_contract_amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references danubra_contracts on delete cascade,
  amendment_number text,
  field text not null,                     -- 'date_to' | 'charge_rate' | ...
  old_value text not null,
  new_value text not null,
  reason text,
  signed_at date,
  storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dca_contract on danubra_contract_amendments(contract_id);

comment on table danubra_contract_amendments is
  'Dodatky k zmluve. Append-only: RLS má select a insert, nie update ani '
  'delete. História dohodnutých podmienok sa neprepisuje.';

-- ── Trigger: chránené polia sa menia len cez dodatok ────────────────────────
-- Toto je tvrdé pravidlo zo zadania a musí platiť aj pre import a pre ručný
-- `update` v SQL editore, nielen pre obrazovku.
--
-- Postup je: najprv zapíš dodatok, potom uprav zmluvu. Trigger overí, že
-- k novej hodnote dodatok existuje.
create or replace function danubra_contract_needs_amendment()
returns trigger
language plpgsql
as $$
declare
  f text;
  old_txt text;
  new_txt text;
begin
  foreach f in array array['date_to', 'charge_rate']
  loop
    if f = 'date_to' then
      old_txt := coalesce(old.date_to::text, '');
      new_txt := coalesce(new.date_to::text, '');
    else
      old_txt := coalesce(old.charge_rate::text, '');
      new_txt := coalesce(new.charge_rate::text, '');
    end if;

    if old_txt is distinct from new_txt then
      -- Kým zmluva nie je podpísaná, niet čo chrániť — dohoda ešte nevznikla.
      if old.status in ('draft', 'sent') then
        continue;
      end if;
      if not exists (
        select 1 from danubra_contract_amendments a
        where a.contract_id = new.id
          and a.field = f
          and a.new_value = new_txt
      ) then
        raise exception
          'Zmena poľa % na podpísanej zmluve vyžaduje dodatok. Zapíš najprv riadok do danubra_contract_amendments (field=%, new_value=%).',
          f, f, new_txt
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists danubra_contract_amend_trg on danubra_contracts;
create trigger danubra_contract_amend_trg before update on danubra_contracts
  for each row execute function danubra_contract_needs_amendment();

comment on function danubra_contract_needs_amendment() is
  'Koncový dátum a sadzba sa na podpísanej zmluve nedajú prepísať bez '
  'zapísaného dodatku. Drží sa to v databáze, nie v UI, lebo zmluvu môže '
  'zmeniť aj import alebo ručný update.';

-- ── Marža ponuky ────────────────────────────────────────────────────────────
-- Rovnaký výpočet ako v lib/quotes.js, aby sedeli čísla v zozname a v detaile.
create or replace view danubra_v_quote_margin as
select
  q.*,
  p.name as partner_name,
  coalesce(q.charge_rate, 0) - coalesce(q.worker_rate, 0) - coalesce(q.overhead_per_hour, 0)
    as margin_per_hour,
  case when coalesce(q.charge_rate, 0) = 0 then null
       else round(100.0 * (coalesce(q.charge_rate, 0) - coalesce(q.worker_rate, 0)
            - coalesce(q.overhead_per_hour, 0)) / q.charge_rate, 1)
  end as margin_pct,
  (coalesce(q.charge_rate, 0) - coalesce(q.worker_rate, 0) - coalesce(q.overhead_per_hour, 0))
    * coalesce(q.hours_per_month, 0) * coalesce(q.headcount, 1) as margin_per_month
from danubra_quotes q
left join danubra_partners p on p.id = q.partner_id;

comment on view danubra_v_quote_margin is
  'Ponuky s dopočítanou maržou. Rovnaké pravidlá ako lib/quotes.js.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_quotes;
create trigger set_updated_at before update on danubra_quotes
  for each row execute function danubra_set_updated_at();
drop trigger if exists set_updated_at on danubra_contracts;
create trigger set_updated_at before update on danubra_contracts
  for each row execute function danubra_set_updated_at();

alter table danubra_quotes enable row level security;
drop policy if exists danubra_auth_all on danubra_quotes;
create policy danubra_auth_all on danubra_quotes
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

alter table danubra_contracts enable row level security;
drop policy if exists danubra_auth_all on danubra_contracts;
create policy danubra_auth_all on danubra_contracts
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Dodatky sú append-only — bez update aj bez delete.
alter table danubra_contract_amendments enable row level security;
drop policy if exists danubra_auth_all on danubra_contract_amendments;
drop policy if exists danubra_dca_read on danubra_contract_amendments;
drop policy if exists danubra_dca_insert on danubra_contract_amendments;
create policy danubra_dca_read on danubra_contract_amendments
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_dca_insert on danubra_contract_amendments
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Číselníky ───────────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, sort_order) values
('quote_status','draft','Rozpracovaná','Entwurf',1),
('quote_status','sent','Odoslaná','Versendet',2),
('quote_status','accepted','Prijatá','Angenommen',3),
('quote_status','rejected','Odmietnutá','Abgelehnt',4),
('quote_status','expired','Prepadla','Abgelaufen',5),
('contract_status','draft','Rozpracovaná','Entwurf',1),
('contract_status','sent','Odoslaná na podpis','Zur Unterschrift',2),
('contract_status','signed','Podpísaná','Unterschrieben',3),
('contract_status','active','Prebieha','Laufend',4),
('contract_status','ended','Ukončená','Beendet',5),
('contract_status','cancelled','Zrušená','Storniert',6),
('contract_kind','werkvertrag','Zmluva o dielo','Werkvertrag',1),
('contract_kind','framework','Rámcová zmluva','Rahmenvertrag',2)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  sort_order = excluded.sort_order;

-- ── Číselné rady pre ponuky a zmluvy ────────────────────────────────────────
-- Rovnaký tvar ako existujúce rady (invoice_series, order_series,
-- subcontract_series), aby ich vedelo obslúžiť to isté lib/numbering.js.
alter table danubra_settings add column if not exists quote_series jsonb
  default '{}'::jsonb;
alter table danubra_settings add column if not exists contract_series jsonb
  default '{}'::jsonb;

update danubra_settings set
  quote_series = case when coalesce(quote_series, '{}'::jsonb) ? 'year' then quote_series
    else jsonb_build_object('year', extract(year from now())::int, 'current', 0) end,
  contract_series = case when coalesce(contract_series, '{}'::jsonb) ? 'year' then contract_series
    else jsonb_build_object('year', extract(year from now())::int, 'current', 0) end;

-- Diagnostika
select
  (select count(*) from danubra_quotes) as ponuk,
  (select count(*) from danubra_contracts) as zmluv,
  (select count(*) from danubra_contract_amendments) as dodatkov;
