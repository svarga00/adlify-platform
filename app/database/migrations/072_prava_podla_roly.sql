-- ============================================================================
-- DANUBRA — práva podľa roly aj v databáze (nielen v menu)
-- ============================================================================
-- Nález z bezpečnostnej kontroly: práva podľa roly (administrátor,
-- koordinátor, náborár, účtovníctvo, na mieru) držala len appka
-- (app/lib/perm.js). Databáza od 069 overovala iba „je to člen appky".
-- Náborár si tak s verejným kľúčom z appky a vlastným prihlásením cez API
-- prečítal faktúry, banku, náklady aj poštu — menu mu ich len neukazovalo.
--
-- Odteraz:
--   * každá tabuľka danubra_* má v `danubra_table_modules` zapísané, ktoré
--     moduly (kľúče z perm.js → MODULES, napr. invoices, bank, candidates)
--     ju smú **čítať** a ktoré do nej smú **zapisovať**,
--   * na každej zapísanej tabuľke sú štyri reštriktívne politiky
--     (select / insert / update / delete). Reštriktívne = pridávajú sa
--     k existujúcim cez AND, takže nič, čo platí dnes (len člen, len admin
--     mení nastavenia, schránky, skryté archivované…), sa neuvoľní,
--   * rozhoduje `danubra_can()` (030/032) — tá istá funkcia a tie isté
--     predvoľby rolí, ktoré zrkadlí perm.js. Admin smie všetko; kým nie je
--     založený ani jeden člen, smie každý prihlásený (ako doteraz),
--   * serverové funkcie bežia so service role a politiky ich neobmedzujú
--     (práva overujú samy cez app/lib/server-guard.js).
--
-- Ako čítať mapovanie (tabuľka danubra_table_modules):
--   read_modules  = null  → číta každý člen (nastavenia firmy, úlohy,
--                           remeslá, odberatelia, zákazky — appka ich
--                           potrebuje na Prehľade a v menách všade),
--   read_modules  = {…}   → číta, kto má aspoň jeden z modulov (alebo smie
--                           do tabuľky zapisovať),
--   write_modules = null  → zapisuje každý, kto smie čítať,
--   write_modules = {…}   → zapisuje (insert, update, aj „zmazanie", ktoré
--                           je od 066 archivácia), kto má aspoň jeden z nich.
--   Tabuľka, ktorá v mapovaní nie je, sa správa ako doteraz (len člen) —
--   kontrola na konci ju vypíše. Test app/lib/perm.test.js stráži, aby
--   každá tabuľka z migrácií mala riadok a aby kľúče sedeli s perm.js.
--
-- Prečo sú niektoré zoznamy „čítania" široké: databáza sama číta cez
-- tabuľky (spúšťače a funkcie bežia s právami používateľa). Napríklad
-- kontrola prijatej faktúry (danubra_bill_check) dopočíta očakávanú sumu
-- z hodín a nasadení — keby ich účtovníčka nevidela, suma by vyšla nula
-- a faktúra by spadla do sporu. Faktúra z obdobia číta compliance (§48b
-- zrážka 15 %). Preto čítanie sedí s tým, čo databáza pri zápise potrebuje.
--
-- Úprava: zmeňte riadok v zozname nižšie a spustite túto migráciu znova
-- (je idempotentná — riadky sa prepíšu, politiky sa založia nanovo).
-- Nová tabuľka v ďalšej migrácii = nový riadok (inak test spadne).
--
-- Nič sa tu nemaže: pribúda tabuľka, tri funkcie, politiky a jeden
-- spúšťač. Existujúce politiky a funkcie sa nemenia.
-- ============================================================================

-- ── 1. Mapovanie tabuľka → moduly ───────────────────────────────────────────
create table if not exists danubra_table_modules (
  table_name text primary key check (table_name like 'danubra\_%' escape '\'),
  read_modules text[],
  write_modules text[],
  note text,
  updated_at timestamptz not null default now()
);

comment on table danubra_table_modules is
  'Ktoré moduly appky (kľúče z perm.js → MODULES) smú tabuľku čítať a ktoré do nej '
  'zapisovať. null pri čítaní = každý člen; null pri zápise = kto smie čítať. '
  'Mení sa migráciou (072 a ďalšie), nie z appky.';
comment on column danubra_table_modules.read_modules is
  'Čítať smie, kto má aspoň jeden z týchto modulov (alebo smie zapisovať). null = každý člen.';
comment on column danubra_table_modules.write_modules is
  'Zapisovať (aj archivovať) smie, kto má aspoň jeden z týchto modulov. null = kto smie čítať.';

alter table danubra_table_modules enable row level security;
do $x$
begin
  drop policy if exists danubra_table_modules_read on danubra_table_modules;
  drop policy if exists danubra_members_only on danubra_table_modules;
  -- Prečítať si ho smie každý člen (appka z neho nič nepotrebuje, ale je to
  -- popis pravidiel, nie tajomstvo). Zapisuje len migrácia.
  create policy danubra_table_modules_read on danubra_table_modules
    for select using (auth.role() in ('authenticated', 'service_role'));
  create policy danubra_members_only on danubra_table_modules as restrictive for all
    using ((select danubra_is_member())) with check ((select danubra_is_member()));
end $x$;
revoke insert, update, delete on danubra_table_modules from anon, authenticated;

-- Jeden riadok = jedna tabuľka. Kľúče modulov:
--   dashboard tasks messages | quotes contracts subcontracts timesheets hoursheet |
--   ads hiring candidates workers crews trades recruiting | partners accommodations |
--   invoices costs bank | compliance rules settings | marketing
-- Predvoľby rolí (danubra_can v 032, PRESETS v perm.js):
--   koordinátor  dashboard tasks messages subcontracts timesheets hoursheet crews workers
--                partners quotes contracts accommodations compliance costs ads hiring candidates
--   náborár      dashboard tasks messages ads hiring candidates workers crews trades recruiting
--   účtovníctvo  dashboard messages invoices costs bank partners subcontracts timesheets
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  -- ── Spoločné pre celú appku ───────────────────────────────────────────────
  ('danubra_settings', null, '{settings}', 'Nastavenia firmy číta každý (fakturačné údaje na dokumentoch, zapnuté agendy). Zápis navyše len admin (030).'),
  ('danubra_enums', null, '{rules,settings}', 'Číselníky — potrebuje ich každá obrazovka.'),
  ('danubra_tasks', null, null, 'Úlohy vznikajú z každej obrazovky a Prehľad dňa ich ukazuje každému.'),
  ('danubra_task_rules', null, '{tasks,rules}', 'Pravidlá úloh číta každý (z nich vznikajú úlohy), mení Úlohy alebo Cenník a pravidlá.'),
  ('danubra_activities', null, null, 'Záznam komunikácie (hovor, SMS, e-mail) — píše sa z karty človeka, firmy aj kandidáta.'),
  ('danubra_archive', null, null, 'Dokumenty (PDF) — vznikajú na každej obrazovke, ktorá tlačí. Samotné súbory stráži úložisko.'),
  ('danubra_bundles', null, null, 'Balík papierov pre človeka (tlačidlo Papiere) — z karty človeka aj zákazky.'),
  ('danubra_demo_ledger', null, '{settings}', 'Zoznam vzorových riadkov — Prehľad podľa neho ukáže pásik Vzorové dáta.'),
  ('danubra_trades', null, '{trades}', 'Remeslá — názvy sú v nábore, na zákazke aj na Prehľade.'),
  ('danubra_trade_basics', null, '{trades}', 'Čo platí na stavbe bez ohľadu na remeslo.'),
  ('danubra_partners', null, '{partners,contracts,quotes,marketing}', 'Odberatelia — mená sú všade (Prehľad, zvonček, pošta, nábor). Zakladá aj dopyt a marketing.'),
  ('danubra_subcontracts', null, '{subcontracts}', 'Zákazky — názov a mesto stavby potrebuje nábor, peniaze aj Prehľad.'),
  ('danubra_message_templates', null, '{messages,settings}', 'Predpripravené texty SMS a e-mailov.'),

  -- ── Zákazky ───────────────────────────────────────────────────────────────
  ('danubra_opportunities', '{contracts,quotes,subcontracts,hiring}', '{contracts}', 'Dopyty (obrazovka Dopyty = právo contracts).'),
  ('danubra_quotes', '{quotes,contracts,subcontracts}', '{quotes}', 'Ponuky odberateľom.'),
  ('danubra_contracts', '{contracts,quotes,subcontracts,invoices}', '{contracts}', 'Zmluvy; faktúra z nich berie podmienky.'),
  ('danubra_contract_amendments', '{contracts,quotes,subcontracts}', '{contracts}', 'Dodatky k zmluvám.'),
  ('danubra_work_orders', '{contracts,subcontracts,workers,invoices,costs}', '{contracts}', 'Objednávky (obrazovka Objednávky = právo contracts).'),
  ('danubra_assignments', '{subcontracts,timesheets,hoursheet,workers,crews,contracts,compliance,invoices,costs,bank}', '{subcontracts}', 'Nasadenia. Čítajú ich aj kontroly prijatých faktúr a uzávierka obdobia.'),
  ('danubra_assignment_checks', '{subcontracts}', '{subcontracts}', 'Checklist pred nasadením.'),
  ('danubra_timesheets', '{timesheets,hoursheet,subcontracts,invoices,costs,bank}', '{timesheets,hoursheet,subcontracts,invoices}', 'Hodiny. Uzávierka obdobia (zákazka aj fakturácia) ich zamyká; kontrola prijatej faktúry z nich ráta sumu.'),
  ('danubra_periods', '{subcontracts,timesheets,hoursheet,invoices,costs,bank}', '{subcontracts,timesheets,invoices}', 'Uzávierky období; faktúra obdobie označí.'),
  ('danubra_hour_sheets', '{hoursheet,timesheets,subcontracts,invoices}', '{hoursheet,timesheets,subcontracts}', 'Výkaz pre odberateľa (Stundennachweis).'),
  ('danubra_compliance', '{compliance,subcontracts,invoices,workers}', '{compliance}', 'Compliance — faktúra z obdobia podľa nej rozhodne o zrážke §48b.'),
  ('danubra_overrides', '{subcontracts,workers,invoices,compliance,crews}', null, 'Výnimky z pravidiel. Založiť a meniť smie len admin (030, 069); kontrola nasadenia ich číta.'),
  ('danubra_accommodations', '{accommodations,subcontracts,workers,costs}', '{accommodations,subcontracts}', 'Ubytovania — náklad zákazky.'),
  ('danubra_subcontract_accommodations', '{subcontracts,accommodations,costs}', '{subcontracts,accommodations}', 'Ubytovanie pri zákazke.'),
  ('danubra_stays', '{accommodations,subcontracts,workers}', '{accommodations,subcontracts}', 'Kto kde býva.'),

  -- ── Ľudia a nábor ─────────────────────────────────────────────────────────
  ('danubra_workers', '{workers,crews,candidates,hiring,recruiting,subcontracts,timesheets,hoursheet,compliance,accommodations,contracts,invoices,costs,bank}', '{workers,crews,candidates,subcontracts}', 'Živnostníci (rodné čísla, IBAN). Nie pre marketing ani pre toho, kto má len Správy. Zapisuje aj prevod kandidáta, partia a nasadenie (stav).'),
  ('danubra_worker_documents', '{workers,compliance,subcontracts,contracts,crews}', '{workers,compliance}', 'Doklady živnostníkov; kontrola nasadenia ich číta.'),
  ('danubra_crews', '{crews,workers,subcontracts,timesheets,hoursheet,candidates}', '{crews}', 'Partie.'),
  ('danubra_crew_members', '{crews,workers,subcontracts,timesheets,hoursheet,candidates}', '{crews}', 'Členstvo v partii.'),
  ('danubra_promises', '{recruiting,workers,candidates}', '{recruiting,workers,candidates}', 'Čo sme človeku sľúbili.'),
  ('danubra_candidates', '{candidates,hiring,recruiting}', '{candidates,hiring}', 'Kandidáti.'),
  ('danubra_candidate_checks', '{candidates,hiring,recruiting}', '{candidates,hiring}', 'Kto čo pri kandidátovi overil.'),
  ('danubra_candidate_chips', '{candidates,hiring,recruiting}', '{candidates,hiring}', 'Čo pri kandidátovi zaznelo.'),
  ('danubra_candidate_notes', '{candidates,hiring,recruiting}', '{candidates,hiring}', 'Poznámky ku kandidátovi.'),
  ('danubra_screening_answers', '{candidates,hiring,recruiting}', '{candidates,hiring}', 'Odpovede na overovacie otázky.'),
  ('danubra_screening_questions', '{trades,hiring,candidates,recruiting,workers}', '{trades,hiring,candidates}', 'Otázky k remeslám.'),
  ('danubra_call_chips', '{trades,candidates,hiring,recruiting}', '{trades,candidates,hiring}', 'Zaškrtávacie polia pre hovor.'),
  ('danubra_checklist_items', '{candidates}', '{candidates}', 'História checklistov z v1 (appka ju už nečíta).'),
  ('danubra_call_recordings', '{recruiting,candidates}', '{recruiting}', 'Nahrávky a prepisy hovorov.'),
  ('danubra_consents', '{recruiting,candidates}', '{recruiting}', 'Súhlasy s nahrávaním (GDPR).'),
  ('danubra_ads', '{ads,hiring,candidates,recruiting,trades,marketing}', '{ads}', 'Inzeráty.'),
  ('danubra_recruitment_plans', '{hiring,ads,candidates,recruiting,contracts,subcontracts}', '{hiring,candidates,contracts}', 'Náborové plány; zakladá ich aj dopyt.'),
  ('danubra_plan_assets', '{hiring,ads,contracts}', '{hiring,ads,contracts}', 'Podklady k náboru (texty, obrázky).'),

  -- ── Peniaze ───────────────────────────────────────────────────────────────
  ('danubra_invoices', '{invoices,bank}', '{invoices,bank}', 'Vydané faktúry. Banka ich pri párovaní označí ako uhradené.'),
  ('danubra_invoice_items', '{invoices,bank}', '{invoices}', 'Položky faktúr.'),
  ('danubra_invoice_reminders', '{invoices,bank}', '{invoices}', 'Upomienky.'),
  ('danubra_bills', '{costs,bank,invoices}', '{costs,bank}', 'Prijaté faktúry (aj za živnostníkov). Banka ich pri párovaní označí.'),
  ('danubra_costs', '{costs,bank,invoices}', '{costs}', 'Náklady; refakturácia ich ukazuje pri vydanej faktúre.'),
  ('danubra_advances', '{costs,bank}', '{costs,bank}', 'Zálohy živnostníkom (obrazovka Zálohy = právo costs).'),
  ('danubra_bank_transactions', '{bank}', '{bank}', 'Pohyby na účte.'),

  -- ── Správy a pošta ────────────────────────────────────────────────────────
  ('danubra_messages', '{messages}', '{messages}', 'Interné poznámky.'),
  ('danubra_message_threads', '{messages}', '{messages}', 'Vlákna interných poznámok.'),
  ('danubra_mail_messages', '{messages}', '{messages}', 'E-maily (obrazovka Správy = právo messages). Navyše len schránky, ku ktorým má človek prístup (058).'),
  ('danubra_mailboxes', '{messages,settings}', '{settings}', 'Schránky. Zapisuje len server (058).'),
  ('danubra_mailbox_access', '{messages,settings}', '{settings}', 'Kto smie do ktorej schránky. Mení admin (058).'),

  -- ── Marketing ─────────────────────────────────────────────────────────────
  ('danubra_leads', '{marketing}', '{marketing}', 'Firmy z marketingu.'),
  ('danubra_lead_searches', '{marketing}', '{marketing}', 'Hľadania firiem.'),
  ('danubra_campaigns', '{marketing}', '{marketing}', 'E-mailové kampane firmám.'),
  ('danubra_campaign_sends', '{marketing}', '{marketing}', 'Odoslané e-maily kampaní.'),
  ('danubra_email_optout', '{marketing}', '{marketing}', 'Odhlásení z e-mailov (zapisuje server).'),
  ('danubra_marketing_listings', '{marketing}', '{marketing}', 'Inzercia.'),
  ('danubra_marketing_expenses', '{marketing}', '{marketing}', 'Výdavky na inzerciu.'),
  ('danubra_web_content', '{marketing}', '{marketing}', 'Texty webov punds (verejný web ich číta cez server).'),
  ('danubra_web_submissions', '{marketing,candidates}', '{marketing}', 'Prihlášky a dopyty z webov.'),

  -- ── Ubytovacia agenda z v1 (z menu je preč, faktúry k nej zostali) ─────────
  ('danubra_clients', '{invoices}', '{invoices}', 'Klienti ubytovacej agendy z v1.'),
  ('danubra_inquiries', '{invoices}', '{invoices}', 'Dopyty na ubytovanie z v1.'),
  ('danubra_offers', '{invoices}', '{invoices}', 'Ponuky ubytovania z v1.'),
  ('danubra_offer_variants', '{invoices}', '{invoices}', 'Varianty ponúk z v1.'),
  ('danubra_orders', '{invoices}', '{invoices}', 'Objednávky ubytovania z v1 (nie Objednávky zákaziek — tie sú danubra_work_orders).'),
  ('danubra_order_persons', '{invoices}', '{invoices}', 'Osoby k objednávkam z v1.'),
  ('danubra_order_requests', '{invoices}', '{invoices}', 'Požiadavky k objednávkam z v1.'),
  ('danubra_order_extensions', '{invoices}', '{invoices}', 'Predĺženia objednávok z v1.'),
  ('danubra_order_service_periods', '{invoices}', '{invoices}', 'Priebežná služba z v1 (mesačná fakturácia).'),
  ('danubra_documents', '{invoices}', '{invoices}', 'Doklady ubytovacej agendy z v1.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules,
      write_modules = excluded.write_modules,
      note = excluded.note,
      updated_at = now();

-- ── 2. Funkcie pre politiky ─────────────────────────────────────────────────
-- Smie prihlásený človek aspoň na jeden z modulov? null = áno (bez obmedzenia).
create or replace function danubra_can_any(p_keys text[])
returns bool language sql stable security definer set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false)
      or p_keys is null
      or coalesce(danubra_is_admin(), false)
      or exists (select 1 from unnest(p_keys) k where danubra_can(k));
$$;
comment on function danubra_can_any(text[]) is
  'Smie prihlásený človek aspoň na jeden z modulov (danubra_can)? null = áno. Admin vždy.';

-- Smie čítať (p_write = false) alebo zapisovať (true) do tabuľky podľa
-- danubra_table_modules? Členstvo samo stráži politika danubra_members_only (069).
create or replace function danubra_table_ok(p_table text, p_write bool default false)
returns bool language plpgsql stable security definer set search_path = public as $$
declare
  r danubra_table_modules;
begin
  if coalesce(auth.role() = 'service_role', false) or coalesce(danubra_is_admin(), false) then
    return true;
  end if;
  select * into r from danubra_table_modules where table_name = p_table;
  if not found then
    return true;                       -- nezmapovaná: platí len „člen" (069)
  end if;
  if p_write then
    return danubra_can_any(coalesce(r.write_modules, r.read_modules));
  end if;
  if r.read_modules is null then
    return true;
  end if;
  -- Kto smie zapisovať, smie aj čítať (update a insert … returning to aj tak potrebujú).
  return danubra_can_any(r.read_modules || coalesce(r.write_modules, '{}'::text[]));
end $$;
comment on function danubra_table_ok(text, bool) is
  'Smie prihlásený človek tabuľku čítať (false) alebo do nej zapisovať (true) podľa '
  'danubra_table_modules? Admin a service role vždy; nezmapovaná tabuľka = áno (stráži ju 069).';

-- Volajú sa z politík, ktoré Postgres vyhodnocuje aj pri anonymnom dotaze
-- (vráti sa prázdno, nie chyba) — preto ich smie volať aj anon. Nič neprezradia.
revoke all on function danubra_can_any(text[]) from public;
revoke all on function danubra_table_ok(text, bool) from public;
grant execute on function danubra_can_any(text[]) to anon, authenticated, service_role;
grant execute on function danubra_table_ok(text, bool) to anon, authenticated, service_role;

-- ── 3. Politiky na tabuľkách ────────────────────────────────────────────────
-- `(select …)` = vyhodnotí sa raz na dotaz, nie pre každý riadok.
do $x$
declare
  r record;
begin
  for r in
    select m.table_name as t
      from danubra_table_modules m
      join pg_class c on c.relname = m.table_name
                     and c.relnamespace = 'public'::regnamespace
                     and c.relkind in ('r', 'p')
     where m.table_name not in ('danubra_members', 'danubra_table_modules')
  loop
    execute format('alter table %I enable row level security', r.t);
    execute format('drop policy if exists danubra_module_read on %I', r.t);
    execute format('drop policy if exists danubra_module_insert on %I', r.t);
    execute format('drop policy if exists danubra_module_update on %I', r.t);
    execute format('drop policy if exists danubra_module_delete on %I', r.t);
    execute format('create policy danubra_module_read on %I as restrictive for select
                    using ((select danubra_table_ok(%L, false)))', r.t, r.t);
    execute format('create policy danubra_module_insert on %I as restrictive for insert
                    with check ((select danubra_table_ok(%L, true)))', r.t, r.t);
    execute format('create policy danubra_module_update on %I as restrictive for update
                    using ((select danubra_table_ok(%L, true)))
                    with check ((select danubra_table_ok(%L, true)))', r.t, r.t, r.t);
    execute format('create policy danubra_module_delete on %I as restrictive for delete
                    using ((select danubra_table_ok(%L, true)))', r.t, r.t);
  end loop;

  -- Tabuľky v databáze, ktoré mapovanie nepozná (napr. založené mimo migrácií).
  for r in
    select c.relname as t
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and c.relname like 'danubra\_%' escape '\'
       and c.relname not in ('danubra_members', 'danubra_table_modules')
       and not exists (select 1 from danubra_table_modules m where m.table_name = c.relname)
  loop
    raise notice 'Tabuľka % nemá v danubra_table_modules modul — platí pre ňu len „člen appky" (069).', r.t;
  end loop;
end $x$;

-- ── 4. Obdobie s faktúrou sa neotvorí ani keď faktúru nevidíte ──────────────
-- Stráž z 070 (danubra_period_reopen_guard) beží s právami používateľa.
-- Koordinátor faktúry nevidí, takže by si myslela, že žiadna nie je, a pustila
-- by obdobie otvoriť pod vystavenou faktúrou. Pôvodná stráž sa nemení (drží
-- výnimku pre vlastníka databázy); toto je druhá, ktorá sa pozrie bez RLS.
create or replace function danubra_period_documents(p_period uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from danubra_invoices
                  where period_id = p_period and status <> 'cancelled') then 'invoice'
    when exists (select 1 from danubra_bills
                  where period_id = p_period and source = 'self_billing'
                    and status <> 'discarded') then 'self_bill'
  end;
$$;
comment on function danubra_period_documents(uuid) is
  'Je z obdobia faktúra (invoice) alebo faktúra za živnostníka (self_bill)? Bez ohľadu na '
  'to, či ich volajúci vidí — volá ju stráž otvorenia obdobia. Vráti len druh, nie údaje.';
revoke all on function danubra_period_documents(uuid) from public, anon;
grant execute on function danubra_period_documents(uuid) to authenticated, service_role;

create or replace function danubra_period_reopen_guard_all()
returns trigger language plpgsql as $$
declare
  v_doc text;
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if old.status in ('closed', 'invoiced') and new.status = 'open' then
    v_doc := danubra_period_documents(new.id);
    if v_doc = 'invoice' then
      raise exception 'Z obdobia už je faktúra (aj návrh). Otvoriť späť sa nedá — najprv faktúru '
        'stornujte alebo opravte rozdiel v nasledujúcom období.' using errcode = 'check_violation';
    elsif v_doc = 'self_bill' then
      raise exception 'Z obdobia už je faktúra za živnostníka. Otvoriť späť sa nedá — najprv ju zahoďte.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function danubra_period_reopen_guard_all() from public, anon;

drop trigger if exists danubra_period_reopen_guard_all on danubra_periods;
create trigger danubra_period_reopen_guard_all before update on danubra_periods
  for each row execute function danubra_period_reopen_guard_all();

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_table_modules) as zmapovanych_tabuliek,
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'danubra_module_read') as tabulky_s_pravami_podla_modulu,
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and c.relname like 'danubra\_%' escape '\'
      and c.relname not in ('danubra_members', 'danubra_table_modules')
      and not exists (select 1 from danubra_table_modules m where m.table_name = c.relname)) as bez_modulu;
