-- ============================================================================
-- DANUBRA Hub — 002 — Atomické číselné rady (§6.1)
-- ============================================================================
-- Číslo objednávky/faktúry sa musí prideliť transakčne, aby nikdy nevznikla
-- diera ani duplicita. V prehliadači to nedokážeme — preto RPC funkcia, ktorá
-- zamkne riadok settings (SELECT ... FOR UPDATE) a atomicky inkrementuje.
--
-- Použitie z appky:
--   const { data } = await DB.client.rpc('danubra_next_number', { p_kind: 'order' });
--   // data = 'OBJ-2026-0042'
--
-- Idempotentné.
-- ============================================================================

create or replace function danubra_next_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings danubra_settings%rowtype;
  v_series   jsonb;
  v_year     int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_current  int;
  v_col      text;
  v_result   text;
begin
  if p_kind not in ('order', 'invoice') then
    raise exception 'Neznámy typ číselnej rady: %', p_kind;
  end if;

  -- Zamkni jediný riadok nastavení na dobu transakcie
  select * into v_settings from danubra_settings order by created_at limit 1 for update;
  if not found then
    insert into danubra_settings default values returning * into v_settings;
    select * into v_settings from danubra_settings where id = v_settings.id for update;
  end if;

  v_col := case when p_kind = 'order' then 'order_series' else 'invoice_series' end;
  v_series := case when p_kind = 'order' then v_settings.order_series else v_settings.invoice_series end;
  v_series := coalesce(v_series, '{}'::jsonb);

  -- Reset pri zmene roka
  if coalesce((v_series->>'year')::int, 0) <> v_year then
    v_current := 1;
  else
    v_current := coalesce((v_series->>'current')::int, 0) + 1;
  end if;

  v_series := v_series || jsonb_build_object('year', v_year, 'current', v_current);

  execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
    using v_series, v_settings.id;

  if p_kind = 'order' then
    v_result := 'OBJ-' || v_year || '-' || lpad(v_current::text, 4, '0');
  else
    v_result := v_year::text || lpad(v_current::text, 3, '0');
  end if;

  return v_result;
end;
$$;

comment on function danubra_next_number(text) is
  'Atomicky pridelí ďalšie číslo v rade (order → OBJ-2026-0042, invoice → 2026001). §6.1';

grant execute on function danubra_next_number(text) to authenticated, service_role;

-- Kontrola: select danubra_next_number('order');
