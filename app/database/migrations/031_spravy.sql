-- ============================================================================
-- DANUBRA — správy
-- ============================================================================
-- Komunikácia je dnes roztrúsená: niečo vo WhatsApp, niečo v maile, niečo
-- „sme sa dohodli po telefóne". Keď sa o mesiac niekto pýta, čo sme sľúbili,
-- hľadá sa to v troch aplikáciách a v hlave.
--
-- Tri veci, ktoré to má riešiť, a **dve z nich fungujú hneď**:
--
--   1. **Interná komunikácia pri zázname** — poznámka k živnostníkovi,
--      k zákazke, k faktúre, ktorú vidia kolegovia. Žiadny kľúč netreba.
--   2. **Evidencia toho, čo sme poslali a čo prišlo** — aj keď to odišlo
--      odinakiaľ. Zapíše sa to sem a je to pri zázname.
--   3. **Samotné odosielanie** — čaká na kľúč od poskytovateľa a na
--      rozhodnutie, na akú adresu sa má prijímať. Kým to nie je, správa sa
--      zaradí do frontu a **neodíde**. Nikde sa netvári, že odišla.
--
-- Tvrdé pravidlo appky platí aj tu: **nič sa nemaže.** Vlákno sa uzavrie,
-- správa zostane. Pri spore o to, čo bolo dohodnuté, je história jediné,
-- čo rozhoduje.
-- ============================================================================

-- ── Vlákno ──────────────────────────────────────────────────────────────────
create table if not exists danubra_message_threads (
  id uuid primary key default gen_random_uuid(),
  subject text,

  -- Čoho sa to týka. Vďaka tomu je komunikácia pri zázname a nie zvlášť.
  entity_type text,                     -- worker | candidate | partner | subcontract | invoice…
  entity_id uuid,

  -- S kým. Prázdne pri internom vlákne.
  party_type text,                      -- worker | candidate | partner | client
  party_id uuid,
  party_name text,
  to_email text,
  to_phone text,

  channel text not null default 'internal',  -- internal | email | sms | whatsapp
  status text not null default 'open',       -- open | done
  last_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

create index if not exists idx_dthr_entity on danubra_message_threads(entity_type, entity_id);
create index if not exists idx_dthr_last on danubra_message_threads(last_at desc);

comment on table danubra_message_threads is
  'Vlákno komunikácie. Viaže sa na záznam, takže je vidieť pri ňom — nie '
  'v osobitnej schránke, kde ho nikto nehľadá.';

-- ── Správa ──────────────────────────────────────────────────────────────────
create table if not exists danubra_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references danubra_message_threads on delete cascade,

  direction text not null default 'out',     -- out | in | note
  channel text not null default 'internal',
  subject text,
  body text not null,

  -- Kam a od koho
  to_email text,
  to_phone text,
  from_name text,

  status text not null default 'draft',
    -- draft   — rozpísané, nikam nejde
    -- queued  — čaká na odoslanie (kým nie je kľúč, zostáva tu)
    -- sent | failed | received | note
  queued_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  error text,
  provider_id text,                     -- id u poskytovateľa, na dohľadanie

  author_id uuid references auth.users,
  author_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_dmsg_thread on danubra_messages(thread_id, created_at);
create index if not exists idx_dmsg_queue on danubra_messages(status)
  where status in ('queued', 'failed');

comment on column danubra_messages.status is
  'Kým nie je nastavený kľúč poskytovateľa, správa zostáva v stave `queued` '
  'a nikam neodíde. Nikde sa netvári, že odišla.';

-- Nič sa nemaže a odoslaná správa sa už nemení. Text, ktorý odišiel, musí
-- zostať v znení, v akom odišiel — inak je história na nič.
create or replace function danubra_message_immutable()
returns trigger language plpgsql as $$
begin
  if old.status in ('sent', 'received')
     and (new.body is distinct from old.body or new.subject is distinct from old.subject) then
    raise exception 'Odoslanú ani prijatú správu už nemožno prepísať.';
  end if;
  return new;
end $$;

drop trigger if exists danubra_message_immutable on danubra_messages;
create trigger danubra_message_immutable before update on danubra_messages
  for each row execute function danubra_message_immutable();

-- Vlákno si pamätá, kedy sa v ňom naposledy niečo dialo.
create or replace function danubra_thread_touch()
returns trigger language plpgsql as $$
begin
  update danubra_message_threads
     set last_at = greatest(last_at, new.created_at), updated_at = now()
   where id = new.thread_id;
  return new;
end $$;

drop trigger if exists danubra_thread_touch on danubra_messages;
create trigger danubra_thread_touch after insert on danubra_messages
  for each row execute function danubra_thread_touch();

-- ── Šablóny ─────────────────────────────────────────────────────────────────
-- Po slovensky pre našich ľudí, po nemecky pre odberateľov. To nie je vkus:
-- dokument ani správa, ktorej partner nerozumie, nefunguje.
--
-- Tabuľka je z migrácie 001 a bola prázdna — dopĺňajú sa jej stĺpce, aby sa
-- nestratil ten, kto si na ňu medzitým niečo naviazal.
alter table danubra_message_templates add column if not exists title text;
alter table danubra_message_templates add column if not exists audience text;
alter table danubra_message_templates add column if not exists note text;
alter table danubra_message_templates add column if not exists active bool not null default true;
alter table danubra_message_templates add column if not exists sort_order int default 0;
update danubra_message_templates set title = coalesce(title, key) where title is null;

comment on table danubra_message_templates is
  'Predpripravené texty. Zástupné miesta v tvare {{meno}} sa doplnia zo '
  'záznamu, ktorého sa správa týka.';

-- ── Prístup ─────────────────────────────────────────────────────────────────
do $$
begin
  alter table danubra_message_threads enable row level security;
  alter table danubra_messages enable row level security;
  alter table danubra_message_templates enable row level security;

  drop policy if exists danubra_thr_read on danubra_message_threads;
  drop policy if exists danubra_thr_write on danubra_message_threads;
  drop policy if exists danubra_thr_update on danubra_message_threads;
  create policy danubra_thr_read on danubra_message_threads
    for select using (auth.role() = 'authenticated');
  create policy danubra_thr_write on danubra_message_threads
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_thr_update on danubra_message_threads
    for update using (auth.role() = 'authenticated');

  drop policy if exists danubra_msg_read on danubra_messages;
  drop policy if exists danubra_msg_write on danubra_messages;
  drop policy if exists danubra_msg_update on danubra_messages;
  create policy danubra_msg_read on danubra_messages
    for select using (auth.role() = 'authenticated');
  create policy danubra_msg_write on danubra_messages
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_msg_update on danubra_messages
    for update using (auth.role() = 'authenticated');

  drop policy if exists danubra_tpl_read on danubra_message_templates;
  drop policy if exists danubra_tpl_write on danubra_message_templates;
  drop policy if exists danubra_tpl_update on danubra_message_templates;
  create policy danubra_tpl_read on danubra_message_templates
    for select using (auth.role() = 'authenticated');
  -- Šablóny sú firemný text — mení ich administrátor.
  create policy danubra_tpl_write on danubra_message_templates
    for insert with check (danubra_is_admin());
  create policy danubra_tpl_update on danubra_message_templates
    for update using (danubra_is_admin());
end $$;

drop trigger if exists set_updated_at on danubra_message_threads;
create trigger set_updated_at before update on danubra_message_threads
  for each row execute function danubra_set_updated_at();
drop trigger if exists set_updated_at on danubra_message_templates;
create trigger set_updated_at before update on danubra_message_templates
  for each row execute function danubra_set_updated_at();

-- ── Predpripravené texty ────────────────────────────────────────────────────
insert into danubra_message_templates (key, title, language, channel, audience, subject, body, sort_order)
values
  ('cand_first_call', 'Kandidát — po prvom telefonáte', 'sk', 'email', 'candidate',
   'Práca v Nemecku — {{mesto}}',
   E'Dobrý deň {{meno}},\n\nďakujem za telefonát. Zhrniem, na čom sme sa dohodli:\n\n– miesto: {{mesto}}\n– sadzba: {{sadzba}} €/h na živnosť\n– nástup: {{nastup}}\n\nČo od Vás potrebujem, aby sme mohli pokračovať:\n1. živnostenský list\n2. doklad totožnosti\n3. číslo účtu na výplatu\n\nA1 vybavíme my, len k tomu budem potrebovať údaje vyššie.\n\nOzvem sa {{kedy}}.\n\nS pozdravom', 10),

  ('worker_docs_expiring', 'Živnostník — končí doklad', 'sk', 'email', 'worker',
   'Končí platnosť dokladu',
   E'Dobrý deň {{meno}},\n\nupozorňujem, že {{doklad}} Vám končí {{datum}}.\n\nBez platného dokladu nesmiete na stavbu — kontrola to pýta ako prvé. Pošlite mi prosím nový sken, alebo mi dajte vedieť, ak potrebujete pomôcť s vybavením.\n\nĎakujem', 20),

  ('worker_invoice_reminder', 'Živnostník — chýba faktúra', 'sk', 'email', 'worker',
   'Faktúra za {{obdobie}}',
   E'Dobrý deň {{meno}},\n\nza {{obdobie}} máte schválených {{hodiny}} h. Pošlite prosím faktúru, aby som ju stihol zaradiť do najbližšej platby.\n\nĎakujem', 30),

  ('partner_offer', 'Odberateľ — ponuka', 'de', 'email', 'partner',
   'Angebot — {{zakazka}}',
   E'Sehr geehrte Damen und Herren,\n\nanbei unser Angebot für {{zakazka}} in {{mesto}}.\n\n– Gewerk: {{remeslo}}\n– Anzahl: {{pocet}} Personen\n– Stundensatz: {{sadzba}} €/h\n– Beginn: {{nastup}}\n\nAlle Mitarbeiter sind selbständige Unternehmer mit gültiger A1-Bescheinigung. Die Abrechnung erfolgt monatlich nach unterschriebenem Stundennachweis.\n\nFür Rückfragen stehe ich gerne zur Verfügung.\n\nMit freundlichen Grüßen', 40),

  ('partner_timesheet', 'Odberateľ — výkaz na podpis', 'de', 'email', 'partner',
   'Stundennachweis KW {{tyzden}}',
   E'Sehr geehrte Damen und Herren,\n\nanbei der Stundennachweis für die KW {{tyzden}} — Baustelle {{zakazka}}.\n\nBitte prüfen und unterschrieben zurücksenden. Auf dieser Grundlage stellen wir die Rechnung.\n\nMit freundlichen Grüßen', 50),

  ('partner_overdue', 'Odberateľ — faktúra po splatnosti', 'de', 'email', 'partner',
   'Zahlungserinnerung — Rechnung {{faktura}}',
   E'Sehr geehrte Damen und Herren,\n\nunsere Rechnung {{faktura}} vom {{datum}} über {{suma}} ist seit {{splatnost}} fällig und bislang nicht ausgeglichen.\n\nWir bitten um kurzfristige Überweisung. Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen', 60)
-- Jedinečnosť je v pôvodnej tabuľke na trojici kľúč + jazyk + kanál, nie na
-- samotnom kľúči — tá istá šablóna môže existovať po slovensky aj po nemecky.
on conflict (key, language, channel) do nothing;
