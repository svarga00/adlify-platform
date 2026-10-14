-- ============================================================================
-- 046 — Možnosti: potenciálne zákazky, ktoré ešte nie sú zákazkami
-- ============================================================================
-- Reťazec v appke začínal ponukou alebo zákazkou. Lenže predtým, než vznikne
-- ponuka, príde telefonát alebo e-mail: „máme stavbu pri Mníchove, potrebujeme
-- štyroch zváračov". Takáto vec žila v e-mailoch a v hlave toho, kto ju
-- prijal — a keď z nej nič nebolo, nikde nezostalo, že vôbec bola.
--
-- Možnosť je zámerne **nízky prah**: názov firmy, čo potrebujú a kontakt. Píše
-- ju ten, kto ju prijal, aj keď o zákazke nevie nič viac. Všetko ostatné sa
-- dopĺňa potom.
--
-- Čo z možnosti vznikne:
--   * **nábor** (`plan_id`) — zadanie sa prenesie a analýza z neho spraví
--     podklady, otázky a polia náboru,
--   * **zákazka** (`subcontract_id`), keď sa dohodne.
--
-- `verify_result` drží odpoveď registra (VIES) o firme odberateľa. Je to
-- **odpoveď registra**, nie náš názor: keď register neodpovie, uloží sa aj to,
-- a to nie je to isté ako „firma neexistuje".
--
-- Nič sa nemaže: stratená možnosť zostáva so stavom `lost` a dôvodom. O pol
-- roka sa tá istá firma ozve znova a vtedy je dobré vedieť, čo bolo naposledy.
--
-- Idempotentné.
-- ============================================================================

create table if not exists danubra_opportunities (
  id uuid primary key default gen_random_uuid(),

  -- Čo prišlo. Jediné povinné je, aby sa to dalo pomenovať.
  title text not null,
  brief text,                                   -- čo o tom vieme, voľným textom

  -- Firma, ktorá sa ozvala.
  company_name text,
  company_vat text,                             -- USt-IdNr / IČ DPH
  company_country text default 'DE',
  contact_name text,
  contact_phone text,
  contact_email text,

  -- Čo potrebujú.
  city text,
  country text default 'DE',
  trade_key text,
  headcount int,
  rate_client numeric(10,2),                    -- čo sú ochotní platiť
  rate_worker numeric(10,2),                    -- čo by sme dali živnostníkovi
  start_date date,

  -- Odkiaľ možnosť prišla a ako to s ňou stojí.
  source text,
  status text not null default 'new'
    check (status in ('new', 'checking', 'offer', 'won', 'lost')),
  lost_reason text,

  -- Výsledok analýzy zadania (rovnaký tvar ako na nábore).
  analysis jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,

  -- Odpoveď registra o firme. Ukladá sa aj to, že register neodpovedal.
  verify_result jsonb,
  verified_at timestamptz,

  -- Čo z možnosti vzniklo.
  plan_id uuid references danubra_recruitment_plans(id) on delete set null,
  subcontract_id uuid references danubra_subcontracts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table danubra_opportunities is
  'Potenciálne zákazky — to, čo príde pred ponukou. Nízky prah: názov firmy, '
  'čo potrebujú, kontakt. Z možnosti vznikne nábor alebo zákazka.';
comment on column danubra_opportunities.verify_result is
  'Odpoveď registra (VIES) o firme. Keď register neodpovie, uloží sa aj to — '
  'nie je to to isté ako „firma neexistuje".';

create index if not exists danubra_opportunities_status
  on danubra_opportunities (status, created_at desc);
create index if not exists danubra_opportunities_vat
  on danubra_opportunities (company_vat) where company_vat is not null;

-- Čas poslednej zmeny rovnako ako na ostatných tabuľkách (migrácia 001).
drop trigger if exists set_updated_at on danubra_opportunities;
create trigger set_updated_at
  before update on danubra_opportunities
  for each row execute function danubra_set_updated_at();

-- ── Kto to smie vidieť a písať ──────────────────────────────────────────────
-- Možnosti má zapisovať každý z tímu — to je celý zmysel. Mazať ich nesmie
-- nikto: stratená možnosť je záznam, že sa firma už raz ozvala.
alter table danubra_opportunities enable row level security;

drop policy if exists danubra_opportunities_read on danubra_opportunities;
create policy danubra_opportunities_read on danubra_opportunities
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists danubra_opportunities_write on danubra_opportunities;
create policy danubra_opportunities_write on danubra_opportunities
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists danubra_opportunities_update on danubra_opportunities;
create policy danubra_opportunities_update on danubra_opportunities
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Overenie firmy aj pri odberateľovi ──────────────────────────────────────
-- Tá istá odpoveď registra sa ukladá aj k odberateľovi: keď sa z možnosti
-- stane zákazka, overenie nemá začínať odznova.
alter table danubra_partners
  add column if not exists vies_result jsonb,
  add column if not exists vies_checked_at timestamptz;

comment on column danubra_partners.vies_result is
  'Odpoveď registra VIES o USt-IdNr odberateľa. Keď register neodpovie, uloží '
  'sa aj to — nie je to to isté ako neplatné číslo.';

-- ── Kontrola ────────────────────────────────────────────────────────────────
do $$
declare chyba text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_name = 'danubra_opportunities') then
    raise exception 'Migrácia 046: tabuľka možností nevznikla.';
  end if;

  -- Mazanie nesmie byť povolené žiadnym pravidlom.
  select polname into chyba from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'danubra_opportunities' and p.polcmd = 'd' limit 1;
  if chyba is not null then
    raise exception 'Migrácia 046: možnosti sa nesmú dať mazať, pravidlo % to dovoľuje.', chyba;
  end if;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 where c.relname = 'danubra_opportunities' and not t.tgisinternal) then
    raise exception 'Migrácia 046: chýba spúšťač na čas poslednej zmeny.';
  end if;

  raise notice 'Migrácia 046: možnosti sú pripravené.';
end $$;
