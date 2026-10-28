-- ============================================================================
-- DANUBRA — archív namiesto mazania
-- ============================================================================
-- Pravidlo firmy: nič sa fyzicky nemaže. Doteraz ale tlačidlá „Zmazať" pri
-- zákazke, človeku, kandidátovi, odberateľovi, hodinách a ďalších naozaj
-- mazali riadky z databázy.
--
-- Odteraz:
--   * každý DELETE na tabuľkách nižšie trigger premení na archiváciu
--     (archived_at = now(), archived_by = kto) — aj keď by prišiel odinakiaľ
--     než z appky;
--   * ak na záznam odkazuje živý záznam (odberateľ má zákazky, človek má
--     hodiny…), archivovať sa nedá — rovnako ako doteraz zmazať (chyba 23503);
--   * čo sa doteraz mazalo kaskádou (nasadenia zákazky, doklady človeka…),
--     sa archivuje spolu s ním, v tej istej chvíli (rovnaké archived_at),
--     takže sa dá aj spolu vrátiť;
--   * appka archivované riadky nevidí (reštriktívna RLS politika na SELECT)
--     — zoznamy, súčty ani hľadanie ich netreba filtrovať;
--   * pohľady (danubra_v_*) bežia s právami používateľa, inak by archivované
--     riadky započítavali (napríklad zmazané hodiny do účtu človeka);
--   * admin vidí archív a vie záznam vrátiť: danubra_archived / danubra_unarchive.
--
-- Výnimka: danubra_demo_purge (Vymazať vzorové dáta, len admin) maže naozaj —
-- vzorové dáta nie sú záznamy firmy. Robí to cez set_config('danubra.allow_delete').
--
-- Nič sa tu nemaže ani neprepisuje: pribúdajú len stĺpce, triggre, politiky
-- a funkcie. Dva unikátne indexy (štítky k hovorom, kódy otázok) sa menia na
-- „unikátne medzi živými", aby sa dal archivovaný štítok založiť znova.
-- ============================================================================

-- ── 1. Tabuľky ──────────────────────────────────────────────────────────────
create temp table _arch_tables(t text primary key) on commit drop;
insert into _arch_tables values
  ('danubra_accommodations'), ('danubra_recruitment_plans'), ('danubra_timesheets'),
  ('danubra_partners'), ('danubra_subcontract_accommodations'), ('danubra_subcontracts'),
  ('danubra_call_chips'), ('danubra_screening_questions'), ('danubra_candidates'),
  ('danubra_call_recordings'), ('danubra_tasks'), ('danubra_compliance'),
  ('danubra_inquiries'), ('danubra_offers'), ('danubra_order_persons'), ('danubra_clients'),
  ('danubra_workers'), ('danubra_worker_documents'), ('danubra_marketing_listings'),
  ('danubra_marketing_expenses'),
  -- deti, ktoré sa doteraz mazali kaskádou s rodičom
  ('danubra_assignments'), ('danubra_stays'), ('danubra_screening_answers'),
  ('danubra_candidate_checks'), ('danubra_candidate_notes'), ('danubra_crew_members'),
  ('danubra_offer_variants');
-- danubra_plan_assets sem nepatrí: verzie textov k náboru už archived_at majú
-- a archivujú ich appka aj server samy (unikátny index „živá verzia").

-- ── 2. Trigger: zmazanie → archív ───────────────────────────────────────────
create or replace function danubra_archive_instead_of_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fk record;
  n int;
  meno text;
  nazvy constant jsonb := '{
    "danubra_subcontracts":"zákazky","danubra_invoices":"faktúry","danubra_quotes":"ponuky",
    "danubra_contracts":"zmluvy","danubra_assignments":"nasadenia","danubra_timesheets":"hodiny",
    "danubra_bills":"prijaté faktúry","danubra_costs":"náklady","danubra_advances":"zálohy",
    "danubra_periods":"obdobia","danubra_hour_sheets":"výkazy","danubra_crews":"partie",
    "danubra_work_orders":"objednávky","danubra_orders":"objednávky","danubra_offers":"ponuky",
    "danubra_candidates":"kandidáti","danubra_workers":"ľudia","danubra_ads":"inzeráty",
    "danubra_recruitment_plans":"nábory","danubra_archive":"dokumenty","danubra_leads":"firmy z marketingu",
    "danubra_mail_messages":"e-maily","danubra_campaign_sends":"kampane","danubra_stays":"pobyty",
    "danubra_bundles":"balíky","danubra_web_submissions":"prihlášky z webu",
    "danubra_offer_variants":"varianty ponúk","danubra_subcontract_accommodations":"ubytovania zákaziek"
  }'::jsonb;
begin
  -- Vymazať vzorové dáta (danubra_demo_purge) maže naozaj.
  if coalesce(current_setting('danubra.allow_delete', true), '') = 'on' then
    return old;
  end if;
  if old.archived_at is not null then
    return null;
  end if;

  for fk in
    select c.conrelid as child, a.attname as col, c.confdeltype as akcia,
           exists (select 1 from pg_attribute x where x.attrelid = c.conrelid
                   and x.attname = 'archived_at' and not x.attisdropped) as ma_archiv
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.confrelid = tg_relid and c.contype = 'f' and array_length(c.conkey, 1) = 1
  loop
    if fk.akcia in ('a', 'r') then
      -- Doteraz by zmazanie zastavil cudzí kľúč. Počítajú sa len živé odkazy.
      execute format('select count(*) from %s where %I = $1 %s %s',
                     fk.child::regclass, fk.col,
                     case when fk.ma_archiv then 'and archived_at is null' else '' end,
                     case when fk.child = tg_relid then 'and id <> $1' else '' end)
        into n using old.id;
      if n > 0 then
        meno := coalesce(nazvy ->> fk.child::regclass::text,
                         replace(fk.child::regclass::text, 'danubra_', ''));
        raise exception using errcode = '23503',
          message = format('Záznam sa nedá archivovať: nadväzuje naň %s záznam(ov) — %s.', n, meno),
          hint = 'Najprv archivujte alebo presuňte to, čo naň nadväzuje.';
      end if;
    elsif fk.akcia = 'c' and fk.ma_archiv then
      -- Doteraz kaskáda zmazala deti. Teraz ich trigger dieťaťa archivuje.
      execute format('delete from %s where %I = $1', fk.child::regclass, fk.col) using old.id;
    end if;
    -- 'n' / 'd' (set null / default): odkaz ostáva, história sa nestráca.
  end loop;

  execute format('update %s set archived_at = now(), archived_by = auth.uid() where id = $1',
                 tg_relid::regclass) using old.id;
  return null;   -- riadok ostáva
end $$;

comment on function danubra_archive_instead_of_delete is
  'Pravidlo „nič sa nemaže": DELETE na tabuľke nastaví archived_at. Výnimka: danubra.allow_delete = on (len Vymazať vzorové dáta).';

-- ── 3. Stĺpce, trigger a skrytie archivovaných ──────────────────────────────
do $x$
declare r record;
begin
  for r in select t from _arch_tables loop
    execute format('alter table %I add column if not exists archived_at timestamptz', r.t);
    execute format('alter table %I add column if not exists archived_by uuid', r.t);
    execute format('comment on column %I.archived_at is %L', r.t,
      'Kedy sa záznam presunul do archívu (namiesto zmazania). Prázdne = živý záznam.');
    -- Meno so „zz_" — beží ako posledný pred zmazaním, takže iné stráže
    -- (napríklad uzavreté obdobie pri hodinách) sa uplatnia skôr.
    execute format('drop trigger if exists zz_danubra_archive on %I', r.t);
    execute format('create trigger zz_danubra_archive before delete on %I
                    for each row execute function danubra_archive_instead_of_delete()', r.t);
    execute format('drop policy if exists danubra_hide_archived on %I', r.t);
    execute format('create policy danubra_hide_archived on %I as restrictive for select
                    using (archived_at is null)', r.t);
    execute format('create index if not exists %I on %I (archived_at) where archived_at is not null',
                   r.t || '_archived_idx', r.t);
  end loop;
end $x$;

-- ── 4. Unikátne len medzi živými ────────────────────────────────────────────
-- Archivovaný štítok „Má auto" nesmie zablokovať založenie nového rovnakého.
drop index if exists idx_dchip_uniq;
create unique index idx_dchip_uniq on danubra_call_chips
  (coalesce(trade_key, ''::text), segment, lower(label)) where archived_at is null;

alter table danubra_screening_questions drop constraint if exists danubra_screening_questions_code_key;
drop index if exists danubra_screening_questions_code_key;
create unique index danubra_screening_questions_code_key on danubra_screening_questions (code)
  where archived_at is null;

-- ── 5. Pohľady s právami používateľa ────────────────────────────────────────
-- Inak by pohľad bežal s právami vlastníka a archivované riadky by videl.
do $x$
declare v text;
begin
  foreach v in array array['danubra_v_ad_performance','danubra_v_cashflow',
    'danubra_v_lodging_occupancy','danubra_v_partner_payment','danubra_v_quote_margin',
    'danubra_v_subcontract_economics','danubra_v_subcontract_status','danubra_v_tied_money',
    'danubra_v_today','danubra_v_worker_account','danubra_v_worker_documents','danubra_v_worker_stay']
  loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view %I set (security_invoker = true)', v);
    end if;
  end loop;
end $x$;

-- ── 6. Archív pre admina ────────────────────────────────────────────────────
create or replace function danubra_archived(p_table text)
returns table (id uuid, label text, archived_at timestamptz, archived_by uuid, data jsonb)
language plpgsql security definer set search_path = public as $$
declare v_t text := 'danubra_' || p_table;
begin
  if not danubra_is_admin() then
    raise exception using errcode = '42501', message = 'Archív vidí len admin.';
  end if;
  if p_table !~ '^[a-z_]{3,60}$' or not exists (
       select 1 from pg_trigger where tgname = 'zz_danubra_archive'
          and tgrelid = to_regclass('public.' || v_t)) then
    raise exception 'Neznámy druh archívu: %', p_table;
  end if;
  return query execute format($q$
    select t.id,
           coalesce(to_jsonb(t)->>'full_name', to_jsonb(t)->>'name', to_jsonb(t)->>'title',
                    to_jsonb(t)->>'label', to_jsonb(t)->>'contract_number', to_jsonb(t)->>'question',
                    to_jsonb(t)->>'file_name', to_jsonb(t)->>'doc_type', to_jsonb(t)->>'subject',
                    to_jsonb(t)->>'company_name', to_jsonb(t)->>'note', to_jsonb(t)->>'body',
                    to_jsonb(t)->>'work_date', t.id::text),
           t.archived_at, t.archived_by, to_jsonb(t)
      from %I t where t.archived_at is not null
     order by t.archived_at desc limit 500$q$, v_t);
end $$;

-- Vráti riadok a všetko, čo sa archivovalo spolu s ním (rovnaké archived_at).
create or replace function danubra_unarchive_rec(p_rel regclass, p_id uuid, p_ts timestamptz)
returns int language plpgsql security definer set search_path = public as $$
declare fk record; r record; n int := 0; m int;
begin
  execute format('update %s set archived_at = null, archived_by = null
                   where id = $1 and archived_at = $2', p_rel) using p_id, p_ts;
  get diagnostics m = row_count;
  if m = 0 then return 0; end if;
  n := m;
  for fk in
    select c.conrelid as child, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.confrelid = p_rel and c.contype = 'f' and c.confdeltype = 'c'
       and array_length(c.conkey, 1) = 1
       and exists (select 1 from pg_attribute x where x.attrelid = c.conrelid
                   and x.attname = 'archived_at' and not x.attisdropped)
  loop
    for r in execute format('select id from %s where %I = $1 and archived_at = $2',
                            fk.child::regclass, fk.col) using p_id, p_ts loop
      n := n + danubra_unarchive_rec(fk.child::regclass, r.id, p_ts);
    end loop;
  end loop;
  return n;
end $$;

create or replace function danubra_unarchive(p_table text, p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rel regclass;
  v_ts timestamptz;
  fk record;
  v_parent_arch timestamptz;
begin
  if not danubra_is_admin() then
    raise exception using errcode = '42501', message = 'Vrátiť z archívu môže len admin.';
  end if;
  v_rel := to_regclass('public.danubra_' || p_table);
  if p_table !~ '^[a-z_]{3,60}$' or v_rel is null or not exists (
       select 1 from pg_trigger where tgname = 'zz_danubra_archive' and tgrelid = v_rel) then
    raise exception 'Neznámy druh archívu: %', p_table;
  end if;
  execute format('select archived_at from %s where id = $1', v_rel) into v_ts using p_id;
  if v_ts is null then return 0; end if;

  -- Dieťa archivovaného rodiča sa samo nevracia — najprv rodič.
  for fk in
    select c.confrelid as parent, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid = v_rel and c.contype = 'f' and array_length(c.conkey, 1) = 1
       and c.confrelid <> v_rel
       and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid
                   and x.attname = 'archived_at' and not x.attisdropped)
  loop
    execute format('select p.archived_at from %s p join %s t on t.%I = p.id where t.id = $1',
                   fk.parent::regclass, v_rel, fk.col) into v_parent_arch using p_id;
    if v_parent_arch is not null then
      raise exception using errcode = 'P0001',
        message = format('Najprv vráťte z archívu záznam, ku ktorému patrí (%s).',
                         replace(fk.parent::regclass::text, 'danubra_', ''));
    end if;
  end loop;

  return danubra_unarchive_rec(v_rel, p_id, v_ts);
end $$;

revoke all on function danubra_archived(text) from public;
revoke all on function danubra_unarchive(text, uuid) from public;
revoke all on function danubra_unarchive_rec(regclass, uuid, timestamptz) from public;
revoke all on function danubra_archive_instead_of_delete() from public;
grant execute on function danubra_archived(text) to authenticated;
grant execute on function danubra_unarchive(text, uuid) to authenticated;

comment on function danubra_archived is 'Archivované záznamy jedného druhu (len admin).';
comment on function danubra_unarchive is 'Vráti záznam z archívu aj s tým, čo sa archivovalo spolu s ním (len admin).';

-- ── 7. Vymazať vzorové dáta maže naozaj ─────────────────────────────────────
-- Rovnaká funkcia ako v 064, len na začiatku povolí skutočné zmazanie
-- (platí len do konca tejto transakcie).
CREATE OR REPLACE FUNCTION public.danubra_demo_purge()
 RETURNS TABLE(tabulka text, zmazanych integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare r record;v_count int;begin perform set_config('danubra.allow_delete','on',true);create temp table _purged(p_table text,p_count int)on commit drop;update danubra_archive set worker_id = null where worker_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_workers');update danubra_archive set partner_id = null where partner_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_partners');update danubra_archive set subcontract_id = null where subcontract_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_subcontracts');update danubra_mail_messages set worker_id = null where worker_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_workers');update danubra_mail_messages set partner_id = null where partner_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_partners');update danubra_mail_messages set lead_id = null where lead_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_leads');update danubra_web_submissions set candidate_id = null where candidate_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_candidates');update danubra_web_submissions set opportunity_id = null where opportunity_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_opportunities');update danubra_screening_questions set ad_id = null where ad_id in(select row_id from danubra_demo_ledger where table_name = 'danubra_ads');update danubra_periods set status = 'open' where status <> 'open' and id in(select row_id from danubra_demo_ledger where table_name = 'danubra_periods');alter table danubra_contract_amendments disable trigger danubra_amendment_no_delete_trg;for r in select table_name,array_agg(row_id)as ids from danubra_demo_ledger group by table_name order by max(seq)desc loop if r.table_name !~ '^danubra_[a-z_]{3,60}$' then raise exception 'nečakaný názov tabuľky v evidencii: %',r.table_name;end if;execute format('delete from %I where id = any($1)',r.table_name)using r.ids;get diagnostics v_count = row_count;insert into _purged values(r.table_name,v_count);end loop;alter table danubra_contract_amendments enable trigger danubra_amendment_no_delete_trg;delete from danubra_demo_ledger;perform set_config('danubra.allow_delete','',true);return query select p_table,p_count from _purged order by p_count desc;end $function$;

-- ── Kontrola ────────────────────────────────────────────────────────────────
select count(*) filter (where tgname = 'zz_danubra_archive') as tabuliek_s_archivom
  from pg_trigger where tgname = 'zz_danubra_archive';
