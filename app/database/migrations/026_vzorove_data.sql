-- ============================================================================
-- DANUBRA — vzorové dáta: evidencia a vymazanie
-- ============================================================================
-- Appka bez dát sa nedá posúdiť: prázdny prehľad vyzerá rovnako ako pokazený.
-- Vzorové dáta sú tu preto, aby bolo vidieť, ako to vyzerá naplnené.
--
-- Musia sa dať odstrániť **presne** — nie „zmaž všetko, čo vyzerá ako vzor".
-- Preto si každý vložený riadok zapíšeme sem a mazanie ide len podľa tohto
-- zoznamu. Čo nie je v ňom, sa nedotkne.
--
-- Samotné dáta vkladá 027; toto je len mechanika.
-- ============================================================================
create table if not exists danubra_demo_ledger (
  seq bigserial primary key,
  table_name text not null,
  row_id uuid not null,
  created_at timestamptz not null default now(),
  unique (table_name, row_id)
);

comment on table danubra_demo_ledger is
  'Zoznam vzorových riadkov. Mazanie ide len podľa neho — čo tu nie je, '
  'sa nedotkne. Prázdna tabuľka znamená, že v systéme sú už len ostré dáta.';

alter table danubra_demo_ledger enable row level security;
do $$
begin
  drop policy if exists danubra_demo_ledger_read on danubra_demo_ledger;
  create policy danubra_demo_ledger_read on danubra_demo_ledger
    for select using (auth.role() = 'authenticated');
end $$;

create or replace function danubra_demo_mark(p_table text, p_id uuid)
returns uuid language plpgsql as $$
begin
  if p_id is null then return null; end if;
  insert into danubra_demo_ledger (table_name, row_id)
    values (p_table, p_id) on conflict (table_name, row_id) do nothing;
  return p_id;
end $$;

-- `security definer`, lebo časť tabuliek zámerne nemá politiku na delete
-- (pobyty, zálohy, výnimky, členstvo v partii sa bežne nemažú). Tu je to
-- v poriadku: maže sa **len** to, čo je v evidencii, a nič iné.
create or replace function danubra_demo_purge()
returns table (tabulka text, zmazanych int)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int;
begin
  create temp table _purged (p_table text, p_count int) on commit drop;

  for r in
    select table_name, array_agg(row_id) as ids
    from danubra_demo_ledger group by table_name order by max(seq) desc
  loop
    -- Názov tabuľky ide do SQL, takže musí byť z nášho vlastného tvaru
    -- a nič iné. Podvrhnutý riadok v evidencii sa takto nedá zneužiť.
    if r.table_name !~ '^danubra_[a-z_]{3,60}$' then
      raise exception 'nečakaný názov tabuľky v evidencii: %', r.table_name;
    end if;
    execute format('delete from %I where id = any($1)', r.table_name) using r.ids;
    get diagnostics v_count = row_count;
    insert into _purged values (r.table_name, v_count);
  end loop;

  delete from danubra_demo_ledger;
  return query select p_table, p_count from _purged order by p_count desc;
end $$;

comment on function danubra_demo_purge is
  'Zmaže vzorové dáta. Maže výlučne riadky zapísané v danubra_demo_ledger — '
  'ostrých dát sa nedotkne.';

revoke all on function danubra_demo_purge() from public;
grant execute on function danubra_demo_purge() to authenticated;
