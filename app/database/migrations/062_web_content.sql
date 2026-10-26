-- ============================================================================
-- 062 — obsah webov punds.sk / punds.eu spravovaný v appke (Marketing → Weby)
-- ============================================================================
-- Jeden riadok = jeden kúsok obsahu:
--   contacts             { sk: { phone1, phone2, email }, eu: { phone, email }, whatsapp }
--   company              { md }                       — konateľ (Impressum)
--   team                 [ { id, name, role: {sk,…}, langs, photo, sites: ['sk','eu'], active } ]
--   images               { "<pôvodná adresa fotky>": "<nová adresa>" }
--   texts:<web>:<stránka> { <jazyk>: { "<cesta>": "<text>" } }  — prepísané texty
-- Web si obsah načíta zo servera (service role) a drží ho minútu.
-- Štatistika z webov ide cez funkciu bez osobných údajov.
-- ============================================================================
set lock_timeout = '15s';

create table if not exists danubra_web_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table danubra_web_content enable row level security;
drop policy if exists danubra_web_content_read on danubra_web_content;
create policy danubra_web_content_read on danubra_web_content for select using (auth.role() = 'authenticated');
drop policy if exists danubra_web_content_ins on danubra_web_content;
create policy danubra_web_content_ins on danubra_web_content for insert with check (auth.role() = 'authenticated');
drop policy if exists danubra_web_content_upd on danubra_web_content;
create policy danubra_web_content_upd on danubra_web_content for update using (auth.role() = 'authenticated');

-- Čo prišlo z webov za posledných N dní — počty, bez mien a kontaktov.
create or replace function danubra_web_stats(days integer default 30)
returns table (day date, site text, form text, lang text, total bigint, spam bigint, failed bigint, mail_error bigint)
language sql security definer set search_path = public stable as $$
  select (created_at at time zone 'Europe/Bratislava')::date as day, site, form, coalesce(lang, '—') as lang,
         count(*) as total,
         count(*) filter (where spam) as spam,
         count(*) filter (where error like 'invalid%') as failed,
         count(*) filter (where error is not null and error not like 'invalid%') as mail_error
  from danubra_web_submissions
  where created_at >= now() - make_interval(days => greatest(1, least(days, 366)))
  group by 1, 2, 3, 4
  order by 1 desc;
$$;
revoke all on function danubra_web_stats(integer) from public, anon;
grant execute on function danubra_web_stats(integer) to authenticated;
