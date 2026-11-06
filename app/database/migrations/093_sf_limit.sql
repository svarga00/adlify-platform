-- ============================================================================
-- DANUBRA — 093 — SuperFaktúra: denný limit požiadaviek
-- ============================================================================
-- Účet SuperFaktúry (PUNDS) má tvrdý limit 1000 požiadaviek na deň (a 30 000
-- na mesiac). Keď sa minie, SuperFaktúra ďalšie odmieta — nedala by sa
-- vystaviť ani odoslať faktúra. Appka preto každú požiadavku (aj opakovaný
-- pokus) najprv zarezervuje tu a až potom ju pošle (app/lib/billing/sf-budget.js):
--
--   1. `danubra_sf_usage` — jeden riadok na kalendárny deň (Europe/Bratislava):
--      koľko požiadaviek appka poslala (`used`), z toho podľa druhu
--      (`by_kind`: sync = synchronizácia a PDF, write = vystavenie, odoslanie,
--      úhrada, test spojenia), čo hlási SuperFaktúra v hlavičkách
--      X-RateLimit-* (`sf_used`, `sf_limit`, `sf_reset`), či SuperFaktúra
--      hlásila prekročenie (`blocked_at`) a kedy prebehla denná synchronizácia
--      z cronu (`cron_sync_at` — len raz za deň).
--   2. `danubra_sf_usage_take` — atómová rezerva: jeden príkaz
--      `insert … on conflict do update … where`. Keď by rezerva prekročila
--      strop (celkový alebo pre druh), nič sa nezapíše a vráti sa ok = false —
--      požiadavka neodíde. Platí prísnejšie z dvoch počítadiel (naše
--      a SuperFaktúry). Ani dve súbežné funkcie strop neprekročia.
--   3. `danubra_sf_usage_report` — zápis stavu podľa hlavičiek SuperFaktúry.
--   4. `danubra_invoices.sf_synced_at` (je už z 018) — synchronizácia preskočí
--      faktúry synchronizované za posledných 20 h.
--
-- Len server (service role). Prehliadač počítadlo vidí cez akciu `status`
-- funkcie danubra-sf-invoice, nikdy priamo — preto anon ani authenticated
-- k tabuľke ani k funkciám nesmú.
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

-- ── 1. Počítadlo ────────────────────────────────────────────────────────────
create table if not exists danubra_sf_usage (
  day date primary key,
  used int not null default 0 check (used >= 0),
  by_kind jsonb not null default '{}'::jsonb,
  sf_used int,
  sf_limit int,
  sf_reset text,
  blocked_at timestamptz,
  cron_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table danubra_sf_usage is
  'Požiadavky na SuperFaktúru za deň (Europe/Bratislava). Rezervujú sa pred odoslaním '
  '(danubra_sf_usage_take), aby appka nikdy neprekročila denný limit účtu. Len service role.';
comment on column danubra_sf_usage.used is 'Koľko požiadaviek appka v ten deň zarezervovala (= poslala), vrátane opakovaných pokusov.';
comment on column danubra_sf_usage.by_kind is 'Rozpis podľa druhu: {"sync": n, "write": n}. sync = synchronizácia a PDF, write = vystavenie, odoslanie, úhrada, test.';
comment on column danubra_sf_usage.sf_used is 'Podľa hlavičiek SuperFaktúry: náš limit − X-RateLimit-DailyRemaining (alebo MonthlyRemaining, ak je menší). Najvyššia hodnota za deň.';
comment on column danubra_sf_usage.sf_limit is 'X-RateLimit-DailyLimit, ako ho naposledy poslala SuperFaktúra.';
comment on column danubra_sf_usage.sf_reset is 'X-RateLimit-DailyReset (napr. „07.11.2026 00:00:00", bez časového pásma).';
comment on column danubra_sf_usage.blocked_at is 'SuperFaktúra hlásila prekročený limit (X-RateLimit-Message) — do konca dňa sa nič neposiela.';
comment on column danubra_sf_usage.cron_sync_at is 'Kedy dnes bežala denná synchronizácia z cronu. Druhý beh v ten istý deň sa nespustí.';

alter table danubra_sf_usage enable row level security;
-- Žiadna politika: cez API sa k tabuľke dostane len service role (ten RLS obchádza).
revoke all on danubra_sf_usage from public, anon, authenticated;
grant select, insert, update on danubra_sf_usage to service_role;

-- Mapovanie modulov (072): tabuľka patrí k Vydaným faktúram. Bez politiky
-- danubra_auth_all ju aj tak číta len server.
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_sf_usage', '{invoices}', '{invoices}', 'Počítadlo požiadaviek na SuperFaktúru (093) — len server (service role); appka ho vidí cez akciu status.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();

-- ── 2. Rezerva pred odoslaním ───────────────────────────────────────────────
-- p_cap      celkový strop na deň (write: limit − rezerva, sync: ešte o rezervu pre zápis menej)
-- p_kind_cap strop pre druh (sync: SF_SYNC_BUDGET), null = bez stropu pre druh
-- Vracia { ok, used, kind_used, blocked }. used = prísnejšie z našich a jej čísel.
create or replace function danubra_sf_usage_take(
  p_day date, p_kind text, p_n int default 1, p_cap int default 950, p_kind_cap int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_used int;
  v_kind int;
  v_row danubra_sf_usage%rowtype;
begin
  if p_day is null then raise exception 'Chýba deň.' using errcode = 'invalid_parameter_value'; end if;
  if p_kind is null or p_kind !~ '^[a-z_]{1,20}$' then
    raise exception 'Neplatný druh požiadavky: %', p_kind using errcode = 'invalid_parameter_value';
  end if;
  if p_n is null or p_n < 1 or p_n > 100 then
    raise exception 'Počet požiadaviek musí byť 1 až 100.' using errcode = 'invalid_parameter_value';
  end if;
  if p_cap is null or p_cap < 0 then raise exception 'Chýba strop.' using errcode = 'invalid_parameter_value'; end if;

  if p_n <= p_cap and (p_kind_cap is null or p_n <= p_kind_cap) then
    insert into danubra_sf_usage as u (day, used, by_kind, updated_at)
    values (p_day, p_n, jsonb_build_object(p_kind, p_n), now())
    on conflict (day) do update
       set used = u.used + p_n,
           by_kind = u.by_kind || jsonb_build_object(p_kind, coalesce((u.by_kind ->> p_kind)::int, 0) + p_n),
           updated_at = now()
     where u.blocked_at is null
       and greatest(u.used, coalesce(u.sf_used, 0)) + p_n <= p_cap
       and (p_kind_cap is null or coalesce((u.by_kind ->> p_kind)::int, 0) + p_n <= p_kind_cap)
    returning greatest(u.used, coalesce(u.sf_used, 0)), coalesce((u.by_kind ->> p_kind)::int, 0)
         into v_used, v_kind;
    if found then
      return jsonb_build_object('ok', true, 'used', v_used, 'kind_used', v_kind, 'blocked', false);
    end if;
  end if;

  select * into v_row from danubra_sf_usage where day = p_day;
  return jsonb_build_object('ok', false,
    'used', greatest(coalesce(v_row.used, 0), coalesce(v_row.sf_used, 0)),
    'kind_used', coalesce((v_row.by_kind ->> p_kind)::int, 0),
    'blocked', v_row.blocked_at is not null);
end $$;

comment on function danubra_sf_usage_take(date, text, int, int, int) is
  'Zarezervuje p_n požiadaviek na SuperFaktúru pre deň a druh. Atómovo; pri prekročení stropu '
  'nič nezapíše a vráti ok = false (požiadavka sa nepošle). Len service role.';

revoke all on function danubra_sf_usage_take(date, text, int, int, int) from public, anon, authenticated;
grant execute on function danubra_sf_usage_take(date, text, int, int, int) to service_role;

-- ── 3. Stav podľa SuperFaktúry ──────────────────────────────────────────────
create or replace function danubra_sf_usage_report(
  p_day date, p_sf_used int default null, p_sf_limit int default null, p_reset text default null, p_blocked boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_day is null then raise exception 'Chýba deň.' using errcode = 'invalid_parameter_value'; end if;
  insert into danubra_sf_usage as u (day, sf_used, sf_limit, sf_reset, blocked_at, updated_at)
  values (p_day, greatest(p_sf_used, 0), p_sf_limit, left(p_reset, 40),
          case when coalesce(p_blocked, false) then now() end, now())
  on conflict (day) do update
     set sf_used = case when excluded.sf_used is null then u.sf_used
                        else greatest(coalesce(u.sf_used, 0), excluded.sf_used) end,
         sf_limit = coalesce(excluded.sf_limit, u.sf_limit),
         sf_reset = coalesce(excluded.sf_reset, u.sf_reset),
         blocked_at = coalesce(u.blocked_at, excluded.blocked_at),
         updated_at = now();
end $$;

comment on function danubra_sf_usage_report(date, int, int, text, boolean) is
  'Zapíše stav počítadla podľa hlavičiek X-RateLimit-* SuperFaktúry (najvyšší za deň) a prípadné '
  'hlásenie o prekročení limitu. Len service role.';

revoke all on function danubra_sf_usage_report(date, int, int, text, boolean) from public, anon, authenticated;
grant execute on function danubra_sf_usage_report(date, int, int, text, boolean) to service_role;

-- ── 4. Faktúry: kedy naposledy synchronizované ──────────────────────────────
alter table danubra_invoices add column if not exists sf_synced_at timestamptz;

comment on column danubra_invoices.sf_synced_at is
  'Kedy sa doklad naposledy načítal zo SuperFaktúry (alebo do nej zapísal). Synchronizácia '
  'všetkých preskočí faktúry synchronizované za posledných 20 h — šetrí denný limit požiadaviek.';

create index if not exists idx_dinv_sf_synced on danubra_invoices (sf_environment, sf_synced_at)
  where sf_invoice_id is not null;

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select day, used, by_kind, sf_used, blocked_at, cron_sync_at
  from danubra_sf_usage order by day desc limit 7;
