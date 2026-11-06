-- ============================================================================
-- DANUBRA — prihlásenie kolegov: poistka, ktorá prepojí účet s človekom
-- ============================================================================
-- Človek v Nastaveniach → Používatelia (danubra_members) je prepojený s účtom
-- cez user_id. Bez prepojenia ho appka nepustí (danubra_is_member() hľadá
-- user_id = auth.uid()), aj keď má účet s tým istým e-mailom.
--
-- Pozvánku robí funkcia danubra-member-invite (založí účet a hneď prepojí).
-- Toto je poistka pre účty, ktoré vzniknú inak — admin ho založí v Supabase,
-- človek príde cez pozvánku zo Supabase a pod.:
--
--   1. spúšťač na auth.users (po založení účtu): ak je v danubra_members
--      **práve jeden** neprepojený človek s rovnakým e-mailom (bez ohľadu na
--      veľkosť písmen), prepojí sa. Pri dvoch a viac sa nerobí nič — nech
--      nikto nedostane cudzie práva omylom,
--   2. jednorazovo to isté pre účty, ktoré už existujú.
--
-- Spúšťač nikdy nezastaví založenie účtu (aj Adlify účty idú cez tú istú
-- tabuľku): chyba sa len zapíše do logu.
-- ============================================================================

create or replace function danubra_link_member_by_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hit uuid;
  n int;
begin
  if new.email is null or btrim(new.email) = '' then return new; end if;
  select count(*), min(m.id::text)::uuid into n, hit
    from danubra_members m
   where m.user_id is null and m.email is not null
     and lower(btrim(m.email)) = lower(btrim(new.email));
  if n = 1 and not exists (select 1 from danubra_members where user_id = new.id) then
    update danubra_members set user_id = new.id, updated_at = now() where id = hit and user_id is null;
  end if;
  return new;
exception when others then
  raise warning 'danubra_link_member_by_email: %', sqlerrm;
  return new;
end;
$$;

comment on function danubra_link_member_by_email() is
  'Po založení účtu v auth.users prepojí jediného neprepojeného člena DANUBRA s rovnakým e-mailom.';

revoke all on function danubra_link_member_by_email() from public;
revoke all on function danubra_link_member_by_email() from anon, authenticated;

drop trigger if exists danubra_link_member_by_email on auth.users;
create trigger danubra_link_member_by_email
  after insert on auth.users
  for each row execute function danubra_link_member_by_email();

-- ── Jednorazovo: existujúce účty ────────────────────────────────────────────
-- Len jednoznačné páry: jeden neprepojený človek ↔ jeden účet s tým e-mailom,
-- a účet ešte nepatrí nikomu inému v zozname.
with kandidati as (
  select m.id as member_id, lower(btrim(m.email)) as e
    from danubra_members m
   where m.user_id is null and m.email is not null and btrim(m.email) <> ''
),
jednoznacni as (
  select k.member_id, min(u.id::text)::uuid as user_id
    from kandidati k
    join auth.users u on lower(btrim(u.email)) = k.e
   where (select count(*) from kandidati k2 where k2.e = k.e) = 1
   group by k.member_id
  having count(u.id) = 1
)
update danubra_members m
   set user_id = j.user_id, updated_at = now()
  from jednoznacni j
 where m.id = j.member_id and m.user_id is null
   and not exists (select 1 from danubra_members x where x.user_id = j.user_id);
