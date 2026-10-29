-- ============================================================================
-- 074 — ponuka vie, z ktorého dopytu je, a predĺženie má záznam
-- ============================================================================
-- 1. Ponuka ↔ dopyt. Pri dopyte po „Spraviť ponuku" nebolo vidieť, aká
--    ponuka z neho vznikla — ponuka o dopyte nič nevedela. Pribúda
--    `danubra_quotes.opportunity_id`.
--
-- 2. Predĺženie / zmena konca nasadenia a zákazky. Pravidlo firmy: „zmena
--    koncového dátumu = záznam predĺženia/dodatku". Pri zmluve to riešia
--    dodatky (036). Pri nasadení a zákazke sa koniec doteraz dal prepísať
--    a trigger danubra_keep_history (071) zapísal len „z … na …" — bez
--    dôvodu. Odteraz appka mení koniec len cez funkcie nižšie, ktoré
--    vyžadujú dôvod a zapíšu riadok do danubra_assignment_extensions
--    (pôvodný koniec, nový koniec, dôvod, kto, kedy) — v jednej transakcii
--    so zmenou dátumu.
--
-- Nič sa tu nemaže: pribúda stĺpec, tabuľka, indexy, politiky a funkcie.
-- ============================================================================


-- ── 1. Ponuka z dopytu ──────────────────────────────────────────────────────
-- Bez kaskády. `on delete set null` je tu kvôli „Vymazať vzorové dáta"
-- (danubra_demo_purge maže vzorový dopyt naozaj) — ostrá ponuka zo vzorového
-- dopytu by inak mazanie zastavila. Bežné „zmazanie" dopytu je archivácia
-- (066), pri ktorej odkaz ostáva.
alter table danubra_quotes
  add column if not exists opportunity_id uuid references danubra_opportunities(id) on delete set null;

create index if not exists idx_dq_opportunity on danubra_quotes(opportunity_id)
  where opportunity_id is not null;

comment on column danubra_quotes.opportunity_id is
  'Dopyt, z ktorého ponuka vznikla („Spraviť ponuku" pri dopyte). Prázdne = ponuka bez dopytu.';


-- ── 2. Záznamy o predĺžení ──────────────────────────────────────────────────
-- Jedna tabuľka pre nasadenie aj celú zákazku:
--   * assignment_id vyplnené  = zmena konca nasadenia jedného človeka,
--   * assignment_id prázdne   = zmena konca celej zákazky.
-- subcontract_id je vždy vyplnené, aby sa história zákazky načítala jedným
-- dotazom. Kaskáda = pri archivácii zákazky alebo nasadenia sa záznamy
-- archivujú spolu s ním (066) a dajú sa spolu aj vrátiť.
create table if not exists danubra_assignment_extensions (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references danubra_subcontracts(id) on delete cascade,
  assignment_id uuid references danubra_assignments(id) on delete cascade,
  old_date_to date,
  new_date_to date,
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);

create index if not exists idx_dax_subcontract on danubra_assignment_extensions(subcontract_id, created_at desc);
create index if not exists idx_dax_assignment on danubra_assignment_extensions(assignment_id)
  where assignment_id is not null;
create index if not exists danubra_assignment_extensions_archived_idx
  on danubra_assignment_extensions (archived_at) where archived_at is not null;

comment on table danubra_assignment_extensions is
  'Predĺženie alebo zmena konca nasadenia (assignment_id) alebo celej zákazky (assignment_id prázdne): '
  'pôvodný a nový koniec, dôvod, kto a kedy. Zapisujú ho danubra_extend_assignment a danubra_extend_subcontract.';
comment on column danubra_assignment_extensions.old_date_to is 'Koniec pred zmenou. Prázdne = predtým bez konca.';
comment on column danubra_assignment_extensions.new_date_to is 'Nový koniec. Prázdne = odteraz bez konca.';

-- RLS ako pri ostatných tabuľkách: prístup pre prihlásených (016), navrch
-- reštriktívne „len členovia" (069) a skrytie archivovaných (066).
alter table danubra_assignment_extensions enable row level security;
drop policy if exists danubra_auth_all on danubra_assignment_extensions;
create policy danubra_auth_all on danubra_assignment_extensions
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists danubra_members_only on danubra_assignment_extensions;
create policy danubra_members_only on danubra_assignment_extensions as restrictive for all
  using ((select danubra_is_member())) with check ((select danubra_is_member()));
drop policy if exists danubra_hide_archived on danubra_assignment_extensions;
create policy danubra_hide_archived on danubra_assignment_extensions as restrictive for select
  using (archived_at is null);

-- Zmazanie = archív (066).
drop trigger if exists zz_danubra_archive on danubra_assignment_extensions;
create trigger zz_danubra_archive before delete on danubra_assignment_extensions
  for each row execute function danubra_archive_instead_of_delete();

-- Záznam sa neprepisuje. Keď bol dôvod zle, zapíše sa nový — inak by
-- história predĺžení bola len ďalšie pole, ktoré sa dá potichu zmeniť.
create or replace function danubra_extension_no_edit()
returns trigger
language plpgsql
as $$
begin
  if new.subcontract_id is distinct from old.subcontract_id
     or new.assignment_id is distinct from old.assignment_id
     or new.old_date_to is distinct from old.old_date_to
     or new.new_date_to is distinct from old.new_date_to
     or new.reason is distinct from old.reason
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Záznam o predĺžení sa nemení. Ak je v ňom chyba, zapíšte novú zmenu konca s vysvetlením.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_extension_no_edit_trg on danubra_assignment_extensions;
create trigger danubra_extension_no_edit_trg
  before update on danubra_assignment_extensions
  for each row execute function danubra_extension_no_edit();


-- ── 3. Predĺžiť / zmeniť koniec nasadenia ───────────────────────────────────
-- security invoker: platia práva toho, kto to robí (RLS na nasadeniach aj
-- na záznamoch). Stráže nasadenia (prekrytie z 071, doklady z 033) sa
-- uplatnia pri update ako vždy.
create or replace function danubra_extend_assignment(
  p_assignment_id uuid,
  p_new_date_to date,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if length(v_reason) < 3 then
    raise exception 'Napíšte dôvod predĺženia alebo zmeny konca — zostane v histórii nasadenia.'
      using errcode = 'check_violation';
  end if;

  select * into a from danubra_assignments
   where id = p_assignment_id and archived_at is null
   for update;
  if not found then
    raise exception 'Nasadenie sa nenašlo alebo je v archíve.' using errcode = 'no_data_found';
  end if;
  if coalesce(a.status, '') = 'cancelled' then
    raise exception 'Zrušené nasadenie sa nepredlžuje. Nasaďte človeka znova.' using errcode = 'check_violation';
  end if;
  if a.date_to is not distinct from p_new_date_to then
    raise exception 'Koniec nasadenia je už %.', coalesce(to_char(p_new_date_to, 'DD.MM.YYYY'), 'bez konca')
      using errcode = 'check_violation';
  end if;
  if p_new_date_to is not null and p_new_date_to < coalesce(a.started_at, a.date_from, p_new_date_to) then
    raise exception 'Nový koniec (%) nemôže byť pred začiatkom nasadenia (%).',
      to_char(p_new_date_to, 'DD.MM.YYYY'), to_char(coalesce(a.started_at, a.date_from), 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;

  insert into danubra_assignment_extensions (subcontract_id, assignment_id, old_date_to, new_date_to, reason)
  values (a.subcontract_id, a.id, a.date_to, p_new_date_to, v_reason)
  returning id into v_id;

  update danubra_assignments set date_to = p_new_date_to where id = a.id;

  return jsonb_build_object('id', v_id, 'old_date_to', a.date_to, 'new_date_to', p_new_date_to);
end $$;

comment on function danubra_extend_assignment(uuid, date, text) is
  'Zmení koniec nasadenia (date_to) a zapíše záznam do danubra_assignment_extensions s dôvodom — '
  'v jednej transakcii. Prázdny nový koniec = bez konca.';


-- ── 4. Predĺžiť / zmeniť koniec celej zákazky ───────────────────────────────
-- `p_with_assignments` = zmeniť rovnako aj nasadenia, ktoré končili spolu so
-- zákazkou (mali rovnaký koniec) — každé dostane vlastný záznam s tým istým
-- dôvodom. Nasadenia s iným koncom sa nemenia: ten koniec niekto zadal zámerne.
create or replace function danubra_extend_subcontract(
  p_subcontract_id uuid,
  p_new_date_to date,
  p_reason text,
  p_with_assignments bool default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s record;
  a record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_n int := 0;
  v_id uuid;
begin
  if length(v_reason) < 3 then
    raise exception 'Napíšte dôvod predĺženia alebo zmeny konca — zostane v histórii zákazky.'
      using errcode = 'check_violation';
  end if;

  select * into s from danubra_subcontracts
   where id = p_subcontract_id and archived_at is null
   for update;
  if not found then
    raise exception 'Zákazka sa nenašla alebo je v archíve.' using errcode = 'no_data_found';
  end if;
  if s.date_to is not distinct from p_new_date_to then
    raise exception 'Koniec zákazky je už %.', coalesce(to_char(p_new_date_to, 'DD.MM.YYYY'), 'bez konca')
      using errcode = 'check_violation';
  end if;
  if p_new_date_to is not null and s.date_from is not null and p_new_date_to < s.date_from then
    raise exception 'Nový koniec (%) nemôže byť pred začiatkom zákazky (%).',
      to_char(p_new_date_to, 'DD.MM.YYYY'), to_char(s.date_from, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;

  insert into danubra_assignment_extensions (subcontract_id, assignment_id, old_date_to, new_date_to, reason)
  values (s.id, null, s.date_to, p_new_date_to, v_reason)
  returning id into v_id;

  update danubra_subcontracts set date_to = p_new_date_to where id = s.id;

  if p_with_assignments and s.date_to is not null then
    for a in
      select * from danubra_assignments
       where subcontract_id = s.id and archived_at is null
         and coalesce(status, 'planned') in ('planned', 'active')
         and date_to = s.date_to
       for update
    loop
      if p_new_date_to is not null and p_new_date_to < coalesce(a.started_at, a.date_from, p_new_date_to) then
        continue;
      end if;
      insert into danubra_assignment_extensions (subcontract_id, assignment_id, old_date_to, new_date_to, reason)
      values (s.id, a.id, a.date_to, p_new_date_to, v_reason);
      update danubra_assignments set date_to = p_new_date_to where id = a.id;
      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'old_date_to', s.date_to, 'new_date_to', p_new_date_to,
                            'assignments', v_n);
end $$;

comment on function danubra_extend_subcontract(uuid, date, text, bool) is
  'Zmení koniec zákazky (date_to) a zapíše záznam do danubra_assignment_extensions s dôvodom. '
  'S p_with_assignments zmení rovnako aj živé nasadenia, ktoré mali ten istý koniec ako zákazka.';


-- ── Anonymný prístup k novým funkciám (rovnako ako 069 §8 a 071) ────────────
do $x$
declare r record; v_auth bool;
begin
  for r in
    select p.oid, p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('danubra_extension_no_edit', 'danubra_extend_assignment',
                         'danubra_extend_subcontract')
  loop
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', r.f);
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.f);
    end if;
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $x$;
grant execute on function danubra_extend_assignment(uuid, date, text) to authenticated;
grant execute on function danubra_extend_subcontract(uuid, date, text, bool) to authenticated;
