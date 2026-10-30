-- ============================================================================
-- 078 — oslovovanie firiem po jednom a sledovanie (komu čo išlo a čo sa stalo)
-- ============================================================================
-- „…budeme ich po jednom oslovovať e-mailom a budeme evidovať komu čo išlo,
-- kto sa oslovil, či reagoval, či to videl, otvoril atď."
--
--   danubra_outreach          jeden riadok = jeden e-mail jednej firme
--                             (krok 1 = prvý e-mail, 2+ = pripomenutie v tom
--                             istom vlákne), kľúč na sledovanie a odhlásenie,
--                             SMTP Message-ID (podľa neho sa spáruje odpoveď
--                             aj nedoručenka), počty otvorení a klikov
--   danubra_outreach_events   čo sa s e-mailom stalo: otvorenie, klik,
--                             odpoveď, nedoručenie, odhlásenie — len pribúda
--
-- Zapisuje server (danubra-outreach-send, danubra-track, synchronizácia
-- pošty, odhlásenie) so service role. Appka číta (Marketing).
--
-- Sledovanie otvorenia nie je 100 %: Apple Mail a Gmail obrázky predčítajú
-- (otvorenie bez človeka — `automated`, počíta sa zvlášť do auto_*), iné
-- programy obrázky blokujú (človek bez otvorenia).
--
-- IP adresa sa neukladá, len jej odtlačok HMAC (ip_hash) — rovnako ako
-- formuláre webov (web/api.js), tajomstvo IP_HASH_SECRET v Netlify.
--
-- Nastavenia: danubra_settings.marketing.outreach (track_opens, track_clicks,
-- daily_limit, followup_days, max_steps, portfolio). Šablóny: danubra_message_templates
-- s kanálom 'outreach' (premenné v tvare {firma}, nie {{meno}}).
--
-- Nič sa nemaže: pribúdajú tabuľky, indexy, politiky, jedna funkcia,
-- šablóny a kľúče v nastaveniach (existujúce hodnoty sa neprepíšu).
-- ============================================================================


-- ── 1. Oslovenia ────────────────────────────────────────────────────────────
-- Bez kaskády by archivácia firmy (066) zostala visieť na osloveniach;
-- `on delete cascade` = archivuje sa spolu s firmou a dá sa spolu aj vrátiť.
create table if not exists danubra_outreach (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references danubra_leads(id) on delete cascade,
  partner_id       uuid references danubra_partners(id) on delete set null,
  mailbox_id       uuid references danubra_mailboxes(id),
  mail_message_id  uuid references danubra_mail_messages(id) on delete set null,
  step             integer not null default 1 check (step between 1 and 10),
  lang             text not null default 'de' check (lang in ('de', 'en')),
  to_email         text not null,
  subject          text not null,
  body_html        text,
  body_text        text,
  token            text not null unique check (token ~ '^[a-f0-9]{32}$'),
  message_id       text,
  in_reply_to      text,
  template_key     text,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'bounced')),
  error            text,
  sent_at          timestamptz,
  sent_by          uuid,
  track_opens      boolean not null default true,
  track_clicks     boolean not null default true,
  opened_at        timestamptz,
  open_count       integer not null default 0,
  last_opened_at   timestamptz,
  auto_opened_at   timestamptz,
  auto_open_count  integer not null default 0,
  clicked_at       timestamptz,
  click_count      integer not null default 0,
  last_clicked_at  timestamptz,
  auto_click_count integer not null default 0,
  replied_at       timestamptz,
  reply_message_id uuid references danubra_mail_messages(id) on delete set null,
  bounced_at       timestamptz,
  unsubscribed_at  timestamptz,
  next_followup_at timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  archived_at      timestamptz,
  archived_by      uuid
);

create index if not exists idx_dout_lead on danubra_outreach (lead_id, sent_at desc);
create index if not exists idx_dout_message on danubra_outreach (message_id) where message_id is not null;
create index if not exists idx_dout_sent on danubra_outreach (sent_at desc) where status in ('sent', 'bounced');
create index if not exists idx_dout_followup on danubra_outreach (next_followup_at)
  where status = 'sent' and replied_at is null and next_followup_at is not null;
create index if not exists danubra_outreach_archived_idx on danubra_outreach (archived_at) where archived_at is not null;

comment on table danubra_outreach is
  'Oslovenie firmy e-mailom: jeden riadok = jeden e-mail (krok 1 = prvý, 2+ = pripomenutie). '
  'Zapisuje server danubra-outreach-send; otvorenia a kliky danubra-track; odpoveď a nedoručenie synchronizácia pošty.';
comment on column danubra_outreach.token is 'Kľúč e-mailu (32 hex) — v sledovacom obrázku, v odkazoch a v odkaze na odhlásenie.';
comment on column danubra_outreach.message_id is 'SMTP Message-ID odoslaného e-mailu. Podľa neho sa spáruje odpoveď (In-Reply-To) aj nedoručenka.';
comment on column danubra_outreach.opened_at is 'Prvé otvorenie, ktoré nevyzerá ako automat. Automatické (Apple, Gmail, skener) sú v auto_opened_at.';
comment on column danubra_outreach.auto_opened_at is 'Prvé otvorenie, ktoré pravdepodobne urobil automat (predčítanie obrázkov) — v appke „možno automaticky".';
comment on column danubra_outreach.next_followup_at is 'Kedy sa pripomenúť, ak firma neodpíše (sent_at + followup_days). Nočná kontrola z toho založí úlohu.';


-- ── 2. Udalosti ─────────────────────────────────────────────────────────────
create table if not exists danubra_outreach_events (
  id               uuid primary key default gen_random_uuid(),
  outreach_id      uuid not null references danubra_outreach(id) on delete cascade,
  lead_id          uuid references danubra_leads(id) on delete cascade,
  type             text not null check (type in ('open', 'click', 'reply', 'bounce', 'unsubscribe')),
  url              text,
  at               timestamptz not null default now(),
  ip_hash          text,
  user_agent       text,
  automated        boolean not null default false,
  auto_reason      text,
  mail_message_id  uuid references danubra_mail_messages(id) on delete set null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,
  archived_by      uuid
);

create index if not exists idx_doutev_outreach on danubra_outreach_events (outreach_id, at desc);
create index if not exists idx_doutev_lead on danubra_outreach_events (lead_id, at desc);
create index if not exists danubra_outreach_events_archived_idx on danubra_outreach_events (archived_at) where archived_at is not null;

comment on table danubra_outreach_events is
  'Čo sa stalo s e-mailom oslovenia: open, click, reply, bounce, unsubscribe. Len pribúda — záznam sa nemení. '
  'IP len ako odtlačok HMAC (ip_hash), prehliadač skrátený (user_agent).';
comment on column danubra_outreach_events.automated is 'Pravdepodobne automat (Apple Mail Privacy, Google Image Proxy, skener odkazov) — nie človek.';

-- Udalosť sa nemení. Dovolená je len archivácia (archived_at/archived_by),
-- ktorú robí danubra_archive_instead_of_delete pri archivácii oslovenia.
create or replace function danubra_outreach_event_no_edit()
returns trigger
language plpgsql
as $$
begin
  if new.outreach_id is distinct from old.outreach_id
     or new.lead_id is distinct from old.lead_id
     or new.type is distinct from old.type
     or new.url is distinct from old.url
     or new.at is distinct from old.at
     or new.ip_hash is distinct from old.ip_hash
     or new.user_agent is distinct from old.user_agent
     or new.automated is distinct from old.automated
     or new.auto_reason is distinct from old.auto_reason
     or new.created_at is distinct from old.created_at then
    raise exception 'Udalosť oslovenia sa nemení — zapisuje sa len nová.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_outreach_event_no_edit_trg on danubra_outreach_events;
create trigger danubra_outreach_event_no_edit_trg
  before update on danubra_outreach_events
  for each row execute function danubra_outreach_event_no_edit();


-- ── 3. RLS ako pri ostatných tabuľkách (074) ────────────────────────────────
do $x$
declare t text;
begin
  foreach t in array array['danubra_outreach', 'danubra_outreach_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
    execute format('drop policy if exists danubra_members_only on %I', t);
    execute format('create policy danubra_members_only on %I as restrictive for all
      using ((select danubra_is_member())) with check ((select danubra_is_member()))', t);
    execute format('drop policy if exists danubra_hide_archived on %I', t);
    execute format('create policy danubra_hide_archived on %I as restrictive for select
      using (archived_at is null)', t);
    -- Zmazanie = archív (066).
    execute format('drop trigger if exists zz_danubra_archive on %I', t);
    execute format('create trigger zz_danubra_archive before delete on %I
      for each row execute function danubra_archive_instead_of_delete()', t);
    -- Verejný kľúč (anon) k tabuľkám nemá čo robiť — sledovanie ide cez server.
    execute format('revoke all on %I from anon', t);
  end loop;
end $x$;


-- ── 4. Práva podľa modulu (072) ─────────────────────────────────────────────
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_outreach', '{marketing}', '{marketing}', 'Oslovenia firiem e-mailom (078). Zapisuje hlavne server (odoslanie, sledovanie, odpovede).'),
  ('danubra_outreach_events', '{marketing}', '{marketing}', 'Udalosti oslovení: otvorenie, klik, odpoveď, nedoručenie, odhlásenie (078). Zapisuje server.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();

do $x$
declare t text;
begin
  foreach t in array array['danubra_outreach', 'danubra_outreach_events'] loop
    execute format('drop policy if exists danubra_module_read on %I', t);
    execute format('drop policy if exists danubra_module_insert on %I', t);
    execute format('drop policy if exists danubra_module_update on %I', t);
    execute format('drop policy if exists danubra_module_delete on %I', t);
    execute format('create policy danubra_module_read on %I as restrictive for select
                    using ((select danubra_table_ok(%L, false)))', t, t);
    execute format('create policy danubra_module_insert on %I as restrictive for insert
                    with check ((select danubra_table_ok(%L, true)))', t, t);
    execute format('create policy danubra_module_update on %I as restrictive for update
                    using ((select danubra_table_ok(%L, true)))
                    with check ((select danubra_table_ok(%L, true)))', t, t, t);
    execute format('create policy danubra_module_delete on %I as restrictive for delete
                    using ((select danubra_table_ok(%L, true)))', t, t);
  end loop;
end $x$;


-- ── 5. Otvorenie / klik naraz (danubra-track) ───────────────────────────────
-- Udalosť a počítadlo v jednej transakcii — dve požiadavky naraz by inak
-- prepísali počet jedna druhej. Ochrana pred zahltením: to isté otvorenie
-- z toho istého odtlačku IP do 30 s sa neráta znova (obrázok sa načíta
-- viackrát) a jeden e-mail má najviac 60 udalostí za hodinu.
-- Volá ju len server (service role); neznámy kľúč = null, žiadna chyba.
create or replace function danubra_outreach_hit(
  p_token text,
  p_type text,
  p_url text default null,
  p_ip_hash text default null,
  p_user_agent text default null,
  p_automated boolean default false,
  p_auto_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  o record;
  v_now timestamptz := now();
begin
  if p_type not in ('open', 'click') or p_token is null or p_token !~ '^[a-f0-9]{32}$' then
    return null;
  end if;
  select id, lead_id into o from danubra_outreach
   where token = p_token and archived_at is null and status in ('sent', 'bounced')
   for update;
  if not found then
    return null;
  end if;

  if (select count(*) from danubra_outreach_events
       where outreach_id = o.id and at > v_now - interval '1 hour') >= 60 then
    return o.id;
  end if;
  if p_ip_hash is not null and exists (
       select 1 from danubra_outreach_events
        where outreach_id = o.id and type = p_type and ip_hash = p_ip_hash
          and coalesce(url, '') = coalesce(left(p_url, 2000), '')
          and at > v_now - interval '30 seconds') then
    return o.id;
  end if;

  insert into danubra_outreach_events (outreach_id, lead_id, type, url, at, ip_hash, user_agent, automated, auto_reason)
  values (o.id, o.lead_id, p_type, left(p_url, 2000), v_now, p_ip_hash, left(p_user_agent, 200),
          coalesce(p_automated, false), left(p_auto_reason, 200));

  if p_type = 'open' then
    if coalesce(p_automated, false) then
      update danubra_outreach set auto_open_count = auto_open_count + 1,
        auto_opened_at = coalesce(auto_opened_at, v_now) where id = o.id;
    else
      update danubra_outreach set open_count = open_count + 1,
        opened_at = coalesce(opened_at, v_now), last_opened_at = v_now where id = o.id;
    end if;
  else
    if coalesce(p_automated, false) then
      update danubra_outreach set auto_click_count = auto_click_count + 1 where id = o.id;
    else
      update danubra_outreach set click_count = click_count + 1,
        clicked_at = coalesce(clicked_at, v_now), last_clicked_at = v_now where id = o.id;
    end if;
  end if;
  return o.id;
end $$;

comment on function danubra_outreach_hit(text, text, text, text, text, boolean, text) is
  'Zapíše otvorenie alebo klik e-mailu oslovenia (udalosť + počítadlo naraz). Volá len danubra-track (service role).';


-- ── 6. Nastavenia oslovovania ───────────────────────────────────────────────
-- Doplnia sa len chýbajúce kľúče — čo už niekto nastavil, zostáva.
update danubra_settings
   set marketing = jsonb_set(
         coalesce(marketing, '{}'::jsonb), '{outreach}',
         jsonb_build_object('track_opens', true, 'track_clicks', true, 'daily_limit', 30,
                            'followup_days', 5, 'max_steps', 3, 'portfolio', '')
           || coalesce(marketing -> 'outreach', '{}'::jsonb),
         true);


-- ── 7. Šablóny oslovenia ────────────────────────────────────────────────────
-- Kanál 'outreach' — do bežných e-mailov (kanál 'email') sa nemiešajú.
-- Premenné: {oslovenie} {firma} {mesto} {konatel} {remeslo} {podobna}
-- {portfolio} {nasa_firma} {datum} {predmet}; náhrada pri chýbajúcom údaji
-- za zvislou čiarou: {mesto|Ihrer Region}. Pätičku s Impressum a odhlásením
-- pridáva server vždy — v šablóne nie je.
insert into danubra_message_templates (key, title, language, channel, audience, subject, body, note, sort_order)
values
  ('outreach_intro', 'Oslovenie — prvý e-mail (DE)', 'de', 'outreach', 'lead',
   'Zusätzliche Fachkräfte für {firma}?',
   E'{oslovenie}\n\nwir sind {nasa_firma}, ein Nachunternehmer aus der Slowakei. Wir stellen erfahrene Handwerker für Baustellen in Deutschland – im Werkvertrag, mit A1-Bescheinigung und Freistellungsbescheinigung nach § 48b EStG.\n\n{portfolio}\n\nFalls Sie in {mesto|Ihrer Region} in den nächsten Monaten zusätzliche Leute für {remeslo|Ihre Projekte} brauchen: Darf ich Sie kurz anrufen oder Ihnen unsere Referenzen schicken?\n\nMit freundlichen Grüßen',
   'Krok 1. Krátke predstavenie v Sie-forme.', 110),
  ('outreach_followup', 'Oslovenie — pripomenutie (DE)', 'de', 'outreach', 'lead',
   'Re: {predmet}',
   E'{oslovenie}\n\nich wollte kurz nachfragen, ob meine Nachricht vom {datum|letzter Woche} bei Ihnen angekommen ist. Wenn Sie aktuell oder demnächst Unterstützung für {remeslo|Ihre Baustellen} brauchen, genügt eine kurze Antwort – ich melde mich dann mit einem konkreten Vorschlag.\n\nMit freundlichen Grüßen',
   'Krok 2 a ďalší. Ide v tom istom vlákne (Re:).', 120),
  ('outreach_intro', 'Oslovenie — prvý e-mail (EN)', 'en', 'outreach', 'lead',
   'Additional skilled workers for {firma}?',
   E'{oslovenie}\n\nwe are {nasa_firma}, a subcontractor from Slovakia. We provide experienced tradespeople for construction sites in Germany – under a contract for work, with A1 certificates and an exemption certificate under § 48b EStG.\n\n{portfolio}\n\nIf you need additional people for {remeslo|your projects} in {mesto|your region} in the coming months, may I give you a short call or send you our references?\n\nKind regards',
   'Krok 1, po anglicky.', 130),
  ('outreach_followup', 'Oslovenie — pripomenutie (EN)', 'en', 'outreach', 'lead',
   'Re: {predmet}',
   E'{oslovenie}\n\nI just wanted to check whether my message from {datum|last week} reached you. If you need support for {remeslo|your sites} now or soon, a short reply is enough – I will then get back to you with a concrete proposal.\n\nKind regards',
   'Krok 2 a ďalší, po anglicky.', 140)
on conflict (key, language, channel) do nothing;


-- ── 8. Anonymný prístup k novým funkciám (rovnako ako 069 §8 a 074) ─────────
do $x$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('danubra_outreach_event_no_edit', 'danubra_outreach_hit')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    -- Otvorenie a klik zapisuje len server — prihlásený človek nie.
    if r.proname = 'danubra_outreach_hit' then
      execute format('revoke execute on function %s from authenticated', r.f);
    end if;
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $x$;


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_table_modules where table_name in ('danubra_outreach', 'danubra_outreach_events')) as zmapovane_tabulky,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('danubra_outreach', 'danubra_outreach_events') and policyname = 'danubra_module_read') as s_pravami_podla_modulu,
  (select count(*) from danubra_message_templates where channel = 'outreach') as sablony_oslovenia,
  (select marketing -> 'outreach' from danubra_settings order by created_at limit 1) as nastavenia;
