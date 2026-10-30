-- ============================================================================
-- 081a — kontakty s firmami, kategória firmy a ďalší krok (1/2)
-- ============================================================================
-- „…rýchle tlačidlá a možnosť zaznamenať, o čom sme sa bavili, s kým a kto
-- presne od nás. Kontaktované firmy treba kategorizovať a hlavne nezabudnúť
-- na ďalší krok — keď niekto povie, že sa máme ozvať o 2–3 týždne alebo
-- mesiace, aby sme sa naozaj ozvali."
--
--   danubra_lead_contacts   jeden riadok = jeden kontakt s firmou (hovor,
--                           e-mail, stretnutie, LinkedIn, poznámka): s kým,
--                           kto od nás, výsledok, o čom, ďalší krok (dátum
--                           a text) a úloha, ktorá z neho vznikla, stav firmy
--                           pred a po, návrh AI (ai_extracted). Záznam sa
--                           po uložení nemení — oprava je nový riadok
--                           s corrects_id (ako poznámky pri kandidátovi, 010).
--   danubra_leads.status    kategória firmy: pribúda Stretnutie (meeting),
--                           Ponuka (offer), Ozvať sa neskôr (later)
--                           a Nedostupná (unreachable). „Je odberateľ" je
--                           naďalej won, „Nemá záujem" rejected.
--   danubra_leads           next_step_at / next_step_text (najbližší
--                           dohodnutý krok — kým nepríde, nepripomína sa
--                           e-mailom), status_changed_at / _by
--   danubra_outreach        attachments — čo išlo v prílohe (prezentácia PDF)
--   danubra_activities      každá zmena kategórie firmy sa zapíše sama
--                           (spúšťač), aj keď ju zmení server alebo zoznam
--                           firiem — história sa nestratí
--   danubra_entity_label    pozná firmu z marketingu ('lead')
--
-- Zapisuje hlavne server (danubra-lead-contact): kontakt, úlohu v Úlohách
-- s termínom ďalšieho kroku a stav firmy. Appka číta (Marketing).
--
-- Spúšťajte 081a, potom 081b (rozdelené, nech sa zmestí do jedného volania).
-- Nič sa nemaže: pribúda tabuľka, stĺpce, tri funkcie, dva spúšťače,
-- politiky a riadok v mapovaní práv. Idempotentné.
-- ============================================================================


-- ── 1. Kategória firmy ──────────────────────────────────────────────────────
alter table danubra_leads drop constraint if exists danubra_leads_status_check;
alter table danubra_leads add constraint danubra_leads_status_check
  check (status in ('new', 'contacted', 'replied', 'interested', 'meeting', 'offer', 'won',
                    'later', 'rejected', 'unreachable', 'unsubscribed'));

alter table danubra_leads
  add column if not exists next_step_at date,
  add column if not exists next_step_text text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid;

comment on column danubra_leads.status is
  'Kategória firmy: new, contacted, replied, interested, meeting (stretnutie), offer (ponuka), won (je odberateľ), '
  'later (ozvať sa neskôr), rejected (nemá záujem), unreachable (nedostupná), unsubscribed (odhlásená z e-mailov).';
comment on column danubra_leads.next_step_at is
  'Najbližší dohodnutý ďalší krok s firmou (z posledného kontaktu). Kým nepríde, appka nepripomína e-mailom.';
comment on column danubra_leads.next_step_text is 'Čo je ďalší krok (napr. „Zavolať p. Müllerovi kvôli Trockenbau od marca").';
comment on column danubra_leads.status_changed_by is
  'Kto naposledy zmenil kategóriu (server ho zapíše spolu so zmenou; z appky platí prihlásený).';

create index if not exists danubra_leads_next_step_idx
  on danubra_leads (next_step_at) where next_step_at is not null and archived_at is null;
create index if not exists danubra_leads_status_idx on danubra_leads (status) where archived_at is null;

-- Čo išlo v prílohe e-mailu oslovenia: [{ kind: 'presentation', name, size, pages, trade, region }]
alter table danubra_outreach add column if not exists attachments jsonb;
comment on column danubra_outreach.attachments is
  'Prílohy e-mailu oslovenia (napr. prezentácia PDF prispôsobená remeslu a regiónu): meno, veľkosť, strany, remeslo, región.';


-- ── 2. Kontakty s firmou ────────────────────────────────────────────────────
create table if not exists danubra_lead_contacts (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references danubra_leads(id) on delete cascade,
  kind              text not null default 'call' check (kind in ('call', 'email', 'meeting', 'note', 'linkedin', 'other')),
  direction         text not null default 'out' check (direction in ('in', 'out')),
  outcome           text check (outcome is null or outcome in ('no_answer', 'busy', 'callback', 'interested',
                      'not_interested', 'send_offer', 'meeting_set', 'wrong_number', 'other')),
  contact_name      text,
  contact_role      text,
  contact_phone     text,
  contact_email     text,
  our_member_id     uuid references danubra_members(id) on delete set null,
  our_user_id       uuid,
  our_member_name   text,
  summary           text,
  happened_at       timestamptz not null default now(),
  duration_min      integer check (duration_min is null or duration_min between 0 and 600),
  next_step_at      date,
  next_step_text    text,
  next_step_task_id uuid references danubra_tasks(id) on delete set null,
  stage_before      text,
  stage_after       text,
  ai_extracted      jsonb,
  corrects_id       uuid references danubra_lead_contacts(id),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  archived_at       timestamptz,
  archived_by       uuid
);

create index if not exists idx_dlc_lead on danubra_lead_contacts (lead_id, happened_at desc);
create index if not exists idx_dlc_next on danubra_lead_contacts (next_step_at) where next_step_at is not null and archived_at is null;
create index if not exists idx_dlc_member on danubra_lead_contacts (our_user_id, happened_at desc);
create index if not exists idx_dlc_corrects on danubra_lead_contacts (corrects_id) where corrects_id is not null;
create index if not exists danubra_lead_contacts_archived_idx on danubra_lead_contacts (archived_at) where archived_at is not null;

comment on table danubra_lead_contacts is
  'Kontakt s firmou z marketingu: hovor, e-mail, stretnutie, LinkedIn, poznámka. S kým (contact_*), kto od nás '
  '(our_*), výsledok, o čom, ďalší krok a úloha z neho. Po uložení sa nemení — oprava je nový riadok s corrects_id.';
comment on column danubra_lead_contacts.outcome is
  'Výsledok: no_answer (nedvíha), busy (obsadené), callback (zavolať neskôr), interested (má záujem), not_interested, '
  'send_offer (poslať ponuku), meeting_set (stretnutie dohodnuté), wrong_number (zlé číslo), other.';
comment on column danubra_lead_contacts.ai_extracted is
  'Čo navrhla AI alebo pravidlá z textu (dátum, text ďalšieho kroku, istota, stav) a či to človek prijal alebo zmenil.';
comment on column danubra_lead_contacts.corrects_id is 'Tento riadok opravuje iný (pôvodný sa nemení, časová os ukáže oboje).';

-- Záznam sa nemení. Dovolené je len archivovať a priradiť úlohu ďalšieho kroku.
create or replace function danubra_lead_contact_no_edit()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - array['archived_at', 'archived_by', 'next_step_task_id'])
     is distinct from (to_jsonb(old) - array['archived_at', 'archived_by', 'next_step_task_id']) then
    raise exception 'Záznam o kontakte sa nemení — opravu zapíšte ako nový záznam.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_lead_contact_no_edit_trg on danubra_lead_contacts;
create trigger danubra_lead_contact_no_edit_trg
  before update on danubra_lead_contacts
  for each row execute function danubra_lead_contact_no_edit();

-- Pokračovanie: 081b_kontakty_s_firmami_prava.sql (história kategórie, mená úloh, RLS, práva).
