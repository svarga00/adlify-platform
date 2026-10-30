-- ============================================================================
-- 081b — kontakty s firmami (2/2): história kategórie, mená úloh, RLS, práva
-- ============================================================================
-- Spúšťa sa po 081a (tabuľka danubra_lead_contacts a nové stĺpce firiem).
-- Popis celej zmeny je v hlavičke 081a. Idempotentné, nič sa nemaže.
-- ============================================================================


-- ── 3. História kategórie firmy (danubra_activities) ────────────────────────
create or replace function danubra_lead_status_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_who uuid;
  lbl constant jsonb := '{"new":"Nová","contacted":"Oslovená","replied":"Odpísala","interested":"Má záujem",
    "meeting":"Stretnutie","offer":"Ponuka","won":"Je odberateľ","later":"Ozvať sa neskôr","rejected":"Nemá záujem",
    "unreachable":"Nedostupná","unsubscribed":"Odhlásená"}'::jsonb;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Server zapíše, kto zmenu urobil, spolu so zmenou; inak prihlásený.
    v_who := case when new.status_changed_by is distinct from old.status_changed_by then new.status_changed_by else auth.uid() end;
    insert into danubra_activities (entity_type, entity_id, type, body, source, created_by)
    values ('lead', new.id, 'change',
            format('Kategória: %s → %s', coalesce(lbl ->> old.status, old.status), coalesce(lbl ->> new.status, new.status)),
            'lead_status', v_who);
  end if;
  return null;
end $$;

create or replace function danubra_lead_status_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status_changed_by is not distinct from old.status_changed_by then
      new.status_changed_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists danubra_lead_status_stamp_trg on danubra_leads;
create trigger danubra_lead_status_stamp_trg
  before update of status on danubra_leads
  for each row execute function danubra_lead_status_stamp();

drop trigger if exists danubra_lead_status_log_trg on danubra_leads;
create trigger danubra_lead_status_log_trg
  after update of status on danubra_leads
  for each row execute function danubra_lead_status_log();


-- ── 4. Úlohy: meno firmy z marketingu (075) ─────────────────────────────────
create or replace function danubra_entity_label(p_type text, p_id uuid)
returns text language plpgsql stable security invoker set search_path = public as $$
declare v text;
begin
  if p_id is null then return null; end if;
  case p_type
    when 'worker'      then select full_name into v from danubra_workers where id = p_id;
    when 'candidate'   then select full_name into v from danubra_candidates where id = p_id;
    when 'subcontract' then select coalesce(title, contract_number) into v from danubra_subcontracts where id = p_id;
    when 'partner'     then select name into v from danubra_partners where id = p_id;
    when 'contract'    then select coalesce(title, contract_number) into v from danubra_contracts where id = p_id;
    when 'quote'       then select coalesce(title, quote_number) into v from danubra_quotes where id = p_id;
    when 'invoice'     then select invoice_number into v from danubra_invoices where id = p_id;
    when 'crew'        then select name into v from danubra_crews where id = p_id;
    when 'lead'        then select name into v from danubra_leads where id = p_id;
    else v := null;
  end case;
  return v;
exception when undefined_column or undefined_table then
  return null;
end $$;


-- ── 5. RLS ako pri ostatných tabuľkách (069, 066, 078) ──────────────────────
alter table danubra_lead_contacts enable row level security;
drop policy if exists danubra_auth_all on danubra_lead_contacts;
create policy danubra_auth_all on danubra_lead_contacts
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists danubra_members_only on danubra_lead_contacts;
create policy danubra_members_only on danubra_lead_contacts as restrictive for all
  using ((select danubra_is_member())) with check ((select danubra_is_member()));
drop policy if exists danubra_hide_archived on danubra_lead_contacts;
create policy danubra_hide_archived on danubra_lead_contacts as restrictive for select
  using (archived_at is null);
-- Zmazanie = archív (066).
drop trigger if exists zz_danubra_archive on danubra_lead_contacts;
create trigger zz_danubra_archive before delete on danubra_lead_contacts
  for each row execute function danubra_archive_instead_of_delete();
revoke all on danubra_lead_contacts from anon;


-- ── 6. Práva podľa modulu (072) ─────────────────────────────────────────────
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_lead_contacts', '{marketing}', '{marketing}', 'Kontakty s firmami z marketingu: hovory, stretnutia, ďalší krok (081). Zapisuje hlavne server danubra-lead-contact.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();

drop policy if exists danubra_module_read on danubra_lead_contacts;
drop policy if exists danubra_module_insert on danubra_lead_contacts;
drop policy if exists danubra_module_update on danubra_lead_contacts;
drop policy if exists danubra_module_delete on danubra_lead_contacts;
create policy danubra_module_read on danubra_lead_contacts as restrictive for select
  using ((select danubra_table_ok('danubra_lead_contacts', false)));
create policy danubra_module_insert on danubra_lead_contacts as restrictive for insert
  with check ((select danubra_table_ok('danubra_lead_contacts', true)));
create policy danubra_module_update on danubra_lead_contacts as restrictive for update
  using ((select danubra_table_ok('danubra_lead_contacts', true)))
  with check ((select danubra_table_ok('danubra_lead_contacts', true)));
create policy danubra_module_delete on danubra_lead_contacts as restrictive for delete
  using ((select danubra_table_ok('danubra_lead_contacts', true)));


-- ── 7. Anonymný prístup k novým funkciám (069 §8, 074, 078) ─────────────────
do $x$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('danubra_lead_contact_no_edit', 'danubra_lead_status_log', 'danubra_lead_status_stamp')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $x$;
revoke execute on function danubra_entity_label(text, uuid) from public, anon;


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_table_modules where table_name = 'danubra_lead_contacts') as zmapovana_tabulka,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'danubra_lead_contacts') as politiky,
  (select count(*) from information_schema.columns where table_name = 'danubra_leads'
     and column_name in ('next_step_at', 'next_step_text', 'status_changed_at', 'status_changed_by')) as nove_stlpce_firiem,
  (select count(*) from pg_trigger where tgname in ('danubra_lead_status_log_trg', 'danubra_lead_status_stamp_trg',
     'danubra_lead_contact_no_edit_trg', 'zz_danubra_archive') and not tgisinternal
     and tgrelid in ('danubra_leads'::regclass, 'danubra_lead_contacts'::regclass)) as spustace;
