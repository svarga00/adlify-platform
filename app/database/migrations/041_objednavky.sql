-- ============================================================================
-- 041 — objednávky: od odberateľa a živnostníkovi
-- ============================================================================
-- V appke objednávky neboli. Boli len tie z v1, ktoré patrili ubytovacej
-- agende — iný biznis, iné stĺpce. V subdodávkach pritom chýbali dve veci,
-- a každá z iného dôvodu:
--
-- **Od odberateľa.** Nemecký generál pošle Bestellung alebo Auftrag. Má svoje
-- číslo a to číslo musí byť na našej faktúre — bez neho ju účtovné oddelenie
-- často neprepustí a platba sa posunie o mesiac. Doteraz sa to nikde
-- nezapisovalo, takže sa pri fakturácii dohľadávalo v e-mailoch.
--
-- **Živnostníkovi.** Toto je dôležitejšie. Werkvertrag znamená, že si
-- objednávame **dielo**, nie hodiny. Keď príde kontrola a opýta sa, čo presne
-- mal ten človek na stavbe urobiť, odpoveď „bol tam a robil, čo bolo treba"
-- je presne tá, po ktorej sa z Werkvertrag stane Arbeitnehmerüberlassung.
-- Jedna objednávka na jedno nasadenie — čo je dielo, za koľko a dokedy — je
-- doklad, ktorý tú otázku zodpovie.
--
-- Preto je `assignment_id` pri objednávke živnostníkovi **jedinečné**: jedno
-- nasadenie, jedna objednávka. Keby ich bolo viac, nevedelo by sa, ktorá
-- platí.
--
-- Číslo sa berie z existujúceho radu `order` (OBJ-RRRR-NNNN). Číslo odberateľa
-- je zvlášť v `their_ref` — to je jeho, nie naše.
--
-- Žiadne dáta sa nemenia. Idempotentné.
-- ============================================================================

create table if not exists danubra_work_orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text unique,
  kind            text not null check (kind in ('customer', 'worker')),
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'confirmed', 'done', 'cancelled')),

  title           text not null,
  scope           text,
  date_from       date,
  date_to         date,

  -- Cena. Rovnaké modely ako na zákazke, aby sa to dalo porovnať.
  price_model     text default 'hourly' check (price_model in ('hourly', 'unit', 'fixed')),
  rate            numeric(12,2),
  unit_label      text,
  unit_price      numeric(12,2),
  fixed_price     numeric(12,2),
  currency        text not null default 'EUR',

  -- Strana odberateľa
  partner_id      uuid references danubra_partners(id) on delete restrict,
  contract_id     uuid references danubra_contracts(id) on delete set null,
  subcontract_id  uuid references danubra_subcontracts(id) on delete set null,
  their_ref       text,
  received_at     date,
  confirmed_at    timestamptz,

  -- Strana živnostníka
  worker_id       uuid references danubra_workers(id) on delete restrict,
  assignment_id   uuid references danubra_assignments(id) on delete cascade,
  accepted_at     timestamptz,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,

  -- Objednávka je buď od odberateľa, alebo živnostníkovi. Nikdy oboje:
  -- zmiešaný záznam by sa nedal ani vytlačiť, ani zaúčtovať.
  constraint danubra_work_order_strana check (
    (kind = 'customer' and partner_id is not null and worker_id is null
      and assignment_id is null)
    or
    (kind = 'worker' and worker_id is not null and partner_id is null)
  )
);

comment on table danubra_work_orders is
  'Objednávky. kind=customer: čo si u nás objednal odberateľ (vrátane jeho '
  'čísla, ktoré patrí na faktúru). kind=worker: čo sme my objednali u '
  'živnostníka — jedna na nasadenie, lebo to je doklad, ktorý robí '
  'z Werkvertrag dielo a nie hodiny.';
comment on column danubra_work_orders.their_ref is
  'Číslo objednávky odberateľa (Bestellnummer). Patrí na našu faktúru — bez '
  'neho ju účtovné oddelenie často neprepustí.';
comment on column danubra_work_orders.scope is
  'Čo je dielo. Pri objednávke živnostníkovi je to tá časť, na ktorú sa pýta '
  'kontrola; „robil, čo bolo treba" je zlá odpoveď.';

-- Jedno nasadenie, jedna objednávka.
create unique index if not exists danubra_work_order_asg_uniq
  on danubra_work_orders (assignment_id) where assignment_id is not null;

create index if not exists danubra_work_order_partner_idx
  on danubra_work_orders (partner_id) where partner_id is not null;
create index if not exists danubra_work_order_worker_idx
  on danubra_work_orders (worker_id) where worker_id is not null;
create index if not exists danubra_work_order_sub_idx
  on danubra_work_orders (subcontract_id) where subcontract_id is not null;

-- Faktúra vie, ktorú objednávku odberateľa plní — odtiaľ sa na ňu dostane
-- jeho číslo.
alter table danubra_invoices
  add column if not exists work_order_id uuid references danubra_work_orders(id) on delete set null;
comment on column danubra_invoices.work_order_id is
  'Objednávka odberateľa, ktorú táto faktúra plní. Jej `their_ref` ide na '
  'faktúru ako „Ihre Bestellnummer".';

-- ── updated_at ──────────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_work_orders;
create trigger set_updated_at before update on danubra_work_orders
  for each row execute function danubra_set_updated_at();

-- ── Práva ───────────────────────────────────────────────────────────────────
alter table danubra_work_orders enable row level security;
drop policy if exists danubra_auth_all on danubra_work_orders;
create policy danubra_auth_all on danubra_work_orders
  for all
  using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Kontrola ────────────────────────────────────────────────────────────────
-- Obmedzenie strán sa overí naostro v transakcii, ktorá sa zroluje. Keby
-- prestalo platiť, dalo by sa založiť objednávku, ktorá je zároveň od
-- odberateľa aj živnostníkovi — a tá sa nedá ani vytlačiť.
do $$
declare
  v_partner uuid;
  v_worker  uuid;
  v_ok      boolean;
begin
  select id into v_partner from danubra_partners limit 1;
  select id into v_worker  from danubra_workers  limit 1;
  if v_partner is null or v_worker is null then
    raise notice 'Preskočené — v databáze nie je odberateľ alebo živnostník.';
    return;
  end if;

  -- Zmiešaná strana musí spadnúť.
  begin
    insert into danubra_work_orders (kind, title, partner_id, worker_id)
    values ('customer', 'kontrola', v_partner, v_worker);
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Objednávka smie byť buď od odberateľa, alebo živnostníkovi — nie oboje.';
  end if;

  -- Objednávka živnostníkovi bez neho musí spadnúť.
  begin
    insert into danubra_work_orders (kind, title) values ('worker', 'kontrola');
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'Objednávka živnostníkovi musí vedieť, komu patrí.';
  end if;

  raise notice 'Objednávky: strany sú ustrážené.';
end $$;
