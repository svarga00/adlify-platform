-- ============================================================================
-- DANUBRA — používatelia a práva
-- ============================================================================
-- Doteraz mal každý prihlásený človek všetko. Pri dvoch ľuďoch to bolo jedno,
-- pri piatich už nie: náborár nemá dôvod vidieť faktúry a účtovníčka nemá
-- dôvod meniť zákazky.
--
-- Model je jednoduchý zámerne:
--
--   * **rola** je predvoľba — administrátor, koordinátor, náborár, účtovníctvo,
--   * **moduly** sú výnimka na mieru. Keď sú vyplnené, platia ony a rola je
--     len poznámka, z čoho sa vychádzalo.
--
-- Dve knobky, ktoré robia to isté, sú mätúce, takže platí jedno pravidlo:
-- *„moduly, ak sú zadané, platia; inak predvoľba roly."*
--
-- Čo sa **nedá** dať nikomu okrem administrátora, lebo to hovorí zadanie:
--   * schválenie faktúry (faktúra sa nikdy nevystaví ani neodošle bez admina),
--   * výnimka pri nasadení bez platných dokladov,
--   * správa používateľov a nastavení firmy.
--
-- Kontroluje to databáza, nie obrazovka. Skrytá položka v menu nie je
-- ochrana — kto pozná adresu, dostane sa tam; kto pozná verejný kľúč, obíde
-- appku úplne.
--
-- Poistka proti zamknutiu sa von: **kým nie je založený ani jeden člen, je
-- každý prihlásený administrátor.** Hneď ako pribudne prvý, platí model.
-- Preto migrácia zároveň zakladá prvého člena z existujúceho používateľa.
-- ============================================================================

create table if not exists danubra_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete cascade,
  email text,
  full_name text,

  role text not null default 'coordinator',
    -- admin | coordinator | recruiter | accountant | custom
  -- Keď je neprázdne, platí toto a rola je len poznámka.
  modules text[],

  active bool not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

create index if not exists idx_dmem_user on danubra_members(user_id);

comment on table danubra_members is
  'Kto smie do appky a na čo. Rola je predvoľba, `modules` je výnimka na '
  'mieru — keď je vyplnená, platí ona.';
comment on column danubra_members.modules is
  'Presný zoznam obrazoviek a právomocí. Prázdne = platí predvoľba roly.';

-- ── Kto som ─────────────────────────────────────────────────────────────────
create or replace function danubra_member()
returns danubra_members language sql stable security definer set search_path = public as $$
  select * from danubra_members where user_id = auth.uid() and active limit 1;
$$;

-- Je appka ešte bez ľudí? Vtedy nemá kto prideľovať práva, takže ich má každý.
create or replace function danubra_no_members()
returns bool language sql stable security definer set search_path = public as $$
  select not exists (select 1 from danubra_members where active);
$$;

create or replace function danubra_is_admin()
returns bool language sql stable security definer set search_path = public as $$
  select auth.role() = 'service_role'
      or danubra_no_members()
      or coalesce((select role = 'admin' from danubra_members
                   where user_id = auth.uid() and active limit 1), false);
$$;

/**
 * Smie prihlásený človek na `p_key`? Kľúč je buď obrazovka („invoices"),
 * alebo právomoc („invoice.approve").
 */
create or replace function danubra_can(p_key text)
returns bool language plpgsql stable security definer set search_path = public as $$
declare
  m danubra_members;
begin
  if auth.role() = 'service_role' or danubra_no_members() then return true; end if;
  select * into m from danubra_members where user_id = auth.uid() and active limit 1;
  if m.id is null then return false; end if;             -- pozvaný nebol
  if m.role = 'admin' then return true; end if;

  -- Právomoci z tvrdých pravidiel má len administrátor. Nedá sa to obísť ani
  -- vlastným zoznamom modulov.
  if p_key in ('invoice.approve', 'deploy.override', 'members.manage',
               'settings.write', 'demo.purge') then
    return false;
  end if;

  if m.modules is not null and array_length(m.modules, 1) > 0 then
    return p_key = any(m.modules);
  end if;

  return case m.role
    when 'coordinator' then p_key in ('dashboard','tasks','subcontracts','timesheets',
      'hoursheet','crews','workers','partners','quotes','contracts','accommodations',
      'compliance','costs','ads','hiring','candidates')
    when 'recruiter' then p_key in ('dashboard','tasks','ads','hiring','candidates',
      'workers','crews','trades','recruiting')
    when 'accountant' then p_key in ('dashboard','invoices','costs','bank','partners',
      'subcontracts','timesheets')
    else false
  end;
end $$;

comment on function danubra_can is
  'Smie prihlásený človek na túto obrazovku alebo právomoc. Kým nie je '
  'založený ani jeden člen, smie každý — inak by sa prvý človek zamkol von.';

-- ── Prístup k samotnej tabuľke ──────────────────────────────────────────────
alter table danubra_members enable row level security;
do $$
begin
  drop policy if exists danubra_members_read on danubra_members;
  drop policy if exists danubra_members_write on danubra_members;
  drop policy if exists danubra_members_update on danubra_members;
  -- Kto je kto, vidí každý: mená sú v úlohách a v poznámkach aj tak.
  create policy danubra_members_read on danubra_members
    for select using (auth.role() = 'authenticated');
  create policy danubra_members_write on danubra_members
    for insert with check (danubra_is_admin());
  create policy danubra_members_update on danubra_members
    for update using (danubra_is_admin());
end $$;

drop trigger if exists set_updated_at on danubra_members;
create trigger set_updated_at before update on danubra_members
  for each row execute function danubra_set_updated_at();

-- ── Nastavenia firmy mení len administrátor ─────────────────────────────────
do $$
begin
  drop policy if exists danubra_auth_all on danubra_settings;
  drop policy if exists danubra_settings_read on danubra_settings;
  drop policy if exists danubra_settings_write on danubra_settings;
  drop policy if exists danubra_settings_update on danubra_settings;
  create policy danubra_settings_read on danubra_settings
    for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
  create policy danubra_settings_write on danubra_settings
    for insert with check (danubra_is_admin());
  create policy danubra_settings_update on danubra_settings
    for update using (danubra_is_admin());
end $$;

-- ── Schválenie faktúry je vec administrátora ────────────────────────────────
-- Je to prechod stavu, nie viditeľnosť riadku, takže to drží spúšťač a nie
-- politika. Platí to aj pre import a aj pre priamy `update`.
create or replace function danubra_invoice_approval_guard()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'issued', 'sent')
     and old.status in ('draft', 'pending_approval', 'draft_pending_approval')
     and not danubra_is_admin() then
    raise exception
      'Faktúru smie schváliť a vystaviť len administrátor (§5.2).';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_approval_guard on danubra_invoices;
create trigger danubra_invoice_approval_guard before update on danubra_invoices
  for each row execute function danubra_invoice_approval_guard();

-- ── Výnimku pri nasadení dáva administrátor ─────────────────────────────────
create or replace function danubra_override_guard()
returns trigger language plpgsql as $$
begin
  if not danubra_is_admin() then
    raise exception 'Výnimku z pravidla môže povoliť len administrátor.';
  end if;
  return new;
end $$;

drop trigger if exists danubra_override_guard on danubra_overrides;
create trigger danubra_override_guard before insert on danubra_overrides
  for each row execute function danubra_override_guard();

-- ── Prvý človek ─────────────────────────────────────────────────────────────
-- Bez tohto by po prvom pozvaní niekoho iného zostal majiteľ bez práv.
insert into danubra_members (user_id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), 'admin'
from auth.users u
where not exists (select 1 from danubra_members)
order by u.created_at
limit 1
on conflict (user_id) do nothing;
