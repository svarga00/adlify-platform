-- ============================================================================
-- DANUBRA — bezpečnosť: dáta len pre členov appky, admin-only aj v databáze
-- ============================================================================
-- Kontrola pred ostrou prevádzkou našla tieto diery (všetky v databáze, takže
-- ich neopraví žiadna zmena v appke):
--
--   1. **Supabase je spoločný s Adlify.** Politiky na tabuľkách danubra_*
--      púšťajú každého, kto má rolu `authenticated` — teda aj každého
--      používateľa Adlify, ktorý do DANUBRA nikdy pozvaný nebol. S verejným
--      kľúčom z appky a vlastným prihlásením si vie prečítať a zmeniť
--      živnostníkov (rodné čísla, IBAN, doklady), faktúry, banku, poštu.
--      → Reštriktívna politika na každej tabuľke danubra_*: riadok vidí
--        a mení len aktívny člen danubra_members (danubra_is_member()).
--   2. **Úložisko danubra-docs a danubra-calls** (skeny dokladov, nahrávky
--      hovorov, prílohy e-mailov) — to isté, len `authenticated`. Navyše
--      prílohy z cudzej schránky (mail/<schránka>/…) vidí každý člen, aj keď
--      do tej schránky prístup nemá; a súbor sa dal prepísať alebo zmazať.
--   3. **danubra_demo_purge** (Vymazať vzorové dáta) je „len admin" iba
--      v appke. Funkcia sama práva neoverovala a volať ju smel každý
--      prihlásený — a v Supabase aj anonymný (revoke from public nestačí,
--      Supabase dáva funkciám právo pre anon zvlášť).
--   4. **danubra_next_number** — anonymný návštevník vedel jedným volaním
--      „minúť" číslo faktúry (diera v číselnom rade faktúr). Rieši časť 8
--      (anon); kontrolu člena treba do tela, ktoré prepisuje 070.
--   5. **danubra_preview_task_rule / danubra_rule_fields** bežali s právami
--      vlastníka bez kontroly volajúceho — anonymný návštevník si cez ne
--      vedel prečítať údaje zo sledovaných tabuliek (aj archivované).
--   6. **Výnimky z pravidiel** (danubra_overrides) — založiť smie len admin
--      (030), ale *zmeniť* existujúcu smel ktokoľvek: predĺžiť platnosť,
--      vrátiť zrušenú, prehodiť ju na iné nasadenie.
--   7. danubra_is_admin(): v prázdnej appke (bez členov) bol adminom aj
--      anonymný návštevník, nielen prihlásený.
--
-- Nič sa tu nemaže: pribúdajú politiky, funkcie a jeden spúšťač;
-- danubra_demo_purge sa premenuje na danubra_demo_purge_unchecked a namiesto
-- nej je obal s kontrolou admina. Idempotentné.
--
-- POZOR pri ďalších migráciách: kto znova napíše
-- `create or replace function danubra_demo_purge()`, prepíše obal
-- s kontrolou — telo patrí do danubra_demo_purge_unchecked.
-- ============================================================================

-- ── 0. Je prihlásený človek členom appky? ───────────────────────────────────
-- Rovnaké pravidlo ako danubra_can(): kým nie je založený nikto, smie každý
-- *prihlásený* (nie anonymný) — inak by sa prvý človek zamkol von.
create or replace function danubra_is_member()
returns bool language sql stable security definer set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false)
      or (auth.uid() is not null and (
            danubra_no_members()
         or exists (select 1 from danubra_members where user_id = auth.uid() and active)));
$$;
comment on function danubra_is_member() is
  'Aktívny člen danubra_members (alebo service role). Kým nie je založený '
  'nikto, smie každý prihlásený. Anonymný nikdy.';
-- anon smie volať (vráti false) — volá sa z politiky na storage.objects,
-- ktorú vyhodnocuje aj anonymný prístup k iným bucketom.
grant execute on function danubra_is_member() to anon, authenticated, service_role;

-- ── 7. danubra_is_admin: prázdna appka nerobí admina z anonymného ──────────
create or replace function danubra_is_admin()
returns bool language sql stable security definer set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false)
      or (auth.uid() is not null and danubra_no_members())
      or coalesce((select role = 'admin' from danubra_members
                   where user_id = auth.uid() and active limit 1), false);
$$;

-- ── 1. Tabuľky: len členovia ────────────────────────────────────────────────
-- Reštriktívna politika sa pridá k existujúcim (AND), takže nič, čo dnes
-- platí (admin-only zápis nastavení, schránky, archív…), sa neuvoľní.
-- danubra_members zostáva čitateľná pre prihlásených: appka podľa nej
-- zisťuje, či je človek pozvaný (inak by sa nepozvanému tvárila ako prázdna
-- appka s plnými právami). Zápis do nej má už teraz len admin.
do $x$
declare r record;
begin
  for r in
    select c.relname as t
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and c.relname like 'danubra\_%' escape '\'
       and c.relname <> 'danubra_members'
  loop
    execute format('alter table %I enable row level security', r.t);
    execute format('drop policy if exists danubra_members_only on %I', r.t);
    execute format('create policy danubra_members_only on %I as restrictive for all
                    using ((select danubra_is_member())) with check ((select danubra_is_member()))', r.t);
  end loop;
end $x$;

-- ── 2. Úložisko ─────────────────────────────────────────────────────────────
-- Čítanie: len člen; prílohy e-mailov (mail/<id schránky>/…) len ten, kto do
-- schránky smie. Zápis: len člen. Prepísať ani zmazať súbor z prehliadača
-- nesmie nikto (pravidlo „nič sa nemaže" — skeny a nahrávky sú dôkazy);
-- server (service role) politiky obchádza, takže mazanie nahrávok po
-- uplynutí lehoty (cron) a prílohy z pošty fungujú ďalej.
create or replace function danubra_storage_read_ok(p_name text)
returns bool language plpgsql stable security definer set search_path = public as $$
declare v_box uuid;
begin
  if not danubra_is_member() then return false; end if;
  if split_part(coalesce(p_name, ''), '/', 1) <> 'mail' then return true; end if;
  begin
    v_box := split_part(p_name, '/', 2)::uuid;
  exception when others then
    return danubra_is_admin();
  end;
  return danubra_mailbox_ok(v_box);
end $$;
grant execute on function danubra_storage_read_ok(text) to anon, authenticated, service_role;

do $x$
begin
  drop policy if exists danubra_store_read_members on storage.objects;
  drop policy if exists danubra_store_insert_members on storage.objects;
  drop policy if exists danubra_store_no_update on storage.objects;
  drop policy if exists danubra_store_no_delete on storage.objects;

  create policy danubra_store_read_members on storage.objects as restrictive for select
    using (bucket_id not in ('danubra-docs', 'danubra-calls') or public.danubra_storage_read_ok(name));
  create policy danubra_store_insert_members on storage.objects as restrictive for insert
    with check (bucket_id not in ('danubra-docs', 'danubra-calls', 'punds-web') or public.danubra_is_member());
  create policy danubra_store_no_update on storage.objects as restrictive for update
    using (bucket_id not in ('danubra-docs', 'danubra-calls', 'punds-web')
           or (bucket_id = 'punds-web' and public.danubra_is_member()));
  create policy danubra_store_no_delete on storage.objects as restrictive for delete
    using (bucket_id not in ('danubra-docs', 'danubra-calls', 'punds-web')
           or (bucket_id = 'punds-web' and public.danubra_is_member()));
exception when insufficient_privilege then
  raise notice 'Politiky na storage.objects sa nedajú vytvoriť cez SQL — nastavte ich v Storage → Policies (pozri tento súbor).';
end $x$;

-- ── 3. Vymazať vzorové dáta: len admin aj v databáze ────────────────────────
do $x$
begin
  if to_regprocedure('public.danubra_demo_purge_unchecked()') is null
     and to_regprocedure('public.danubra_demo_purge()') is not null then
    alter function public.danubra_demo_purge() rename to danubra_demo_purge_unchecked;
  end if;
end $x$;
revoke all on function danubra_demo_purge_unchecked() from public, anon, authenticated;

create or replace function danubra_demo_purge()
returns table (tabulka text, zmazanych int)
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(danubra_is_admin(), false) then
    raise exception using errcode = '42501',
      message = 'Vzorové dáta smie vymazať len administrátor.';
  end if;
  return query select * from danubra_demo_purge_unchecked();
end $$;
revoke all on function danubra_demo_purge() from public, anon;
grant execute on function danubra_demo_purge() to authenticated, service_role;
comment on function danubra_demo_purge() is
  'Vymaže vzorové dáta (len admin). Telo je v danubra_demo_purge_unchecked — '
  'tú nesmie volať nikto z appky.';

-- ── 4. Číselné rady ─────────────────────────────────────────────────────────
-- danubra_next_number prepisuje migrácia 070 (číslo sa neoreže), preto sa tu
-- telo nemení: anonymnému sa právo odoberie v časti 8 (create or replace
-- v 070 práva ponechá). Kontrolu člena (danubra_is_member()) treba dopísať
-- priamo do tela v 070 — inak smie číslo „minúť" aj prihlásený nečlen.

-- ── 5. Funkcie, ktoré nemusia bežať s právami vlastníka ─────────────────────
-- S právami volajúceho na ne platí RLS (členovia, skryté archivované) a
-- kontroly názvov vo funkciách zostávajú. danubra_rule_tables len číta CHECK
-- z katalógu, tá môže ostať.
alter function danubra_preview_task_rule(text, text, text, jsonb, int, text) security invoker;
alter function danubra_rule_fields(text) security invoker;
alter function danubra_chip_used(uuid) security invoker;

-- ── 6. Výnimky z pravidiel: meniť smie len admin, ostatní len zrušiť ────────
create or replace function danubra_override_update_guard()
returns trigger language plpgsql as $$
begin
  -- Vlastník databázy (SQL editor, migrácie) a admin smú všetko.
  if current_user in ('postgres', 'supabase_admin') or coalesce(danubra_is_admin(), false) then
    return new;
  end if;
  -- Ne-admin smie výnimku len zrušiť (revoked_at z prázdneho na dátum);
  -- všetko ostatné musí ostať, ako to zapísal admin.
  if old.revoked_at is null and new.revoked_at is not null
     and (to_jsonb(new) - 'revoked_at') = (to_jsonb(old) - 'revoked_at') then
    return new;
  end if;
  raise exception using errcode = '42501',
    message = 'Výnimku z pravidla môže meniť len administrátor. Vy ju môžete len zrušiť.';
end $$;
drop trigger if exists danubra_override_update_guard on danubra_overrides;
create trigger danubra_override_update_guard before update on danubra_overrides
  for each row execute function danubra_override_update_guard();

-- ── 8. Anonymný prístup k funkciám appky ────────────────────────────────────
-- Supabase dáva novým funkciám v schéme public právo EXECUTE aj pre `anon`
-- (nie cez PUBLIC, takže `revoke ... from public` nestačí). Appka anonymne
-- nevolá nič — verejné stránky (potvrdenie faktúry, balík, weby, odhlásenie)
-- idú cez serverové funkcie so service-role kľúčom.
-- Výnimky: danubra_is_member a danubra_storage_read_ok (volajú sa z politík
-- na storage.objects, ktoré vyhodnocuje aj anonymný prístup k iným bucketom).
-- Platí pre funkcie, ktoré existujú teraz; novým v ďalších migráciách treba
-- `revoke execute ... from anon` dopísať.
do $x$
declare
  r record;
  v_auth bool;
begin
  for r in
    select p.oid, p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname like 'danubra\_%' escape '\'
       and p.proname not in ('danubra_is_member', 'danubra_storage_read_ok')
  loop
    -- Prihlásený si ponechá presne to, čo mal (aj keď to mal len cez PUBLIC).
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', r.f);
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.f);
    end if;
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $x$;
-- Telá bez kontroly práv a vnútorné pomocné funkcie archívu nesmie volať ani
-- prihlásený. (066 ich odobrala len PUBLIC — v Supabase mal `authenticated`
-- právo zvlášť, takže danubra_unarchive_rec — vrátenie z archívu bez
-- kontroly admina — sa dala zavolať priamo.)
revoke all on function danubra_demo_purge_unchecked() from authenticated;
revoke all on function danubra_unarchive_rec(regclass, uuid, timestamptz) from authenticated;

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'danubra_members_only') as tabulky_len_pre_clenov,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'danubra_store_%') as politiky_uloziska,
  has_function_privilege('anon', 'danubra_demo_purge()', 'execute') as anon_smie_vymazat_vzorove,
  has_function_privilege('authenticated', 'danubra_demo_purge_unchecked()', 'execute') as prihlaseny_smie_telo_bez_kontroly;
