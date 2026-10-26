-- ============================================================================
-- 064 — nové vzorové dáta: všetky stavy, všetky obrazovky
-- ============================================================================
-- Majiteľ schválil, že pracovné záznamy sa nahradia novou vzorovou sadou,
-- ktorá pokryje každý stav každej veci. Prázdna obrazovka vyzerá rovnako ako
-- pokazená a stav, ktorý v dátach nikdy nebol, sa nedá posúdiť — preto tu je
-- každý stav, každé upozornenie a každý filter aspoň raz.
--
-- Čo skript robí, v tomto poradí (všetko v jednom bloku — buď prejde celý,
-- alebo sa nestane nič):
--
--   1. Staré PDF v archíve **skryje** (archived_at = now()). Nemaže ich —
--      archív je doklad o tom, čo odišlo von.
--   2. Odkazy z tabuliek, ktoré zostávajú (archív, pošta, otázky k náboru,
--      prihlášky z webu), na mazané riadky nastaví na null.
--   3. Zmaže všetky pracovné záznamy v poradí, ktoré dovolia cudzie kľúče,
--      a vyprázdni evidenciu vzorových dát.
--   4. Vloží novú sadu a každý riadok zapíše do danubra_demo_ledger, takže
--      pás „V systéme sú vzorové dáta" aj tlačidlo „Vymazať vzorové dáta"
--      fungujú ďalej.
--
-- Nedotkne sa: nastavení, používateľov, schránok a pošty (len odkazy),
-- číselníkov, remesiel, otázok, čipov, šablón, pravidiel úloh, obsahu webu,
-- prihlášok z webu, zoznamu odhlásených.
--
-- Dátumy sú vždy voči dňu spustenia (current_date), takže časť dokladov je
-- platná, časť končí do 30 dní a časť je po platnosti — aj keď sa skript
-- spustí o týždeň neskôr.
--
-- E-maily a weby vzorových firiem a ľudí sú na doméne `.example`, ktorá
-- podľa RFC 2606 neexistuje. Keby niekto omylom stlačil „Odoslať", nič
-- nikomu neodíde. Telefóny majú skutočný tvar, ale sú vymyslené.
--
-- Spustiť raz. Druhé spustenie sa zastaví samo (pozná vzorovú firmu), aby
-- nezmazalo, čo medzičasom pribudlo naostro.
-- ============================================================================


-- ── Vymazanie vzorových dát musí prejsť cez ochrany ──────────────────────────
-- Tlačidlo „Vymazať vzorové dáta" (danubra_demo_purge) mazalo riadky podľa
-- evidencie, ale tri ochrany ho zastavili:
--   · hodiny v uzavretom období sa nemažú (danubra_ts_frozen_trg),
--   · dodatok k zmluve sa nemaže (danubra_amendment_no_delete_trg),
--   · ostré tabuľky (archív, pošta, otázky) držia odkaz na vzorový riadok.
-- Tu sa to rieši len pre riadky, ktoré sú v evidencii — ostrých sa to netýka.
create or replace function danubra_demo_purge()
returns table (tabulka text, zmazanych int)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int;
begin
  create temp table _purged (p_table text, p_count int) on commit drop;

  -- Ostré záznamy, ktoré ukazujú na vzorové, si nechajú všetko okrem odkazu.
  update danubra_archive set worker_id = null
   where worker_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_workers');
  update danubra_archive set partner_id = null
   where partner_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_partners');
  update danubra_archive set subcontract_id = null
   where subcontract_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_subcontracts');
  update danubra_mail_messages set worker_id = null
   where worker_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_workers');
  update danubra_mail_messages set partner_id = null
   where partner_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_partners');
  update danubra_mail_messages set lead_id = null
   where lead_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_leads');
  update danubra_web_submissions set candidate_id = null
   where candidate_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_candidates');
  update danubra_web_submissions set opportunity_id = null
   where opportunity_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_opportunities');
  update danubra_screening_questions set ad_id = null
   where ad_id in (select row_id from danubra_demo_ledger where table_name = 'danubra_ads');

  -- Vzorové obdobie sa pred mazaním otvorí, inak hodiny v ňom zostanú zamknuté.
  update danubra_periods set status = 'open'
   where status <> 'open'
     and id in (select row_id from danubra_demo_ledger where table_name = 'danubra_periods');

  -- Dodatky sa bežne nemažú. Vzorové áno — a len tie, ktoré sú v evidencii.
  alter table danubra_contract_amendments disable trigger danubra_amendment_no_delete_trg;

  for r in
    select table_name, array_agg(row_id) as ids
    from danubra_demo_ledger group by table_name order by max(seq) desc
  loop
    if r.table_name !~ '^danubra_[a-z_]{3,60}$' then
      raise exception 'nečakaný názov tabuľky v evidencii: %', r.table_name;
    end if;
    execute format('delete from %I where id = any($1)', r.table_name) using r.ids;
    get diagnostics v_count = row_count;
    insert into _purged values (r.table_name, v_count);
  end loop;

  alter table danubra_contract_amendments enable trigger danubra_amendment_no_delete_trg;

  delete from danubra_demo_ledger;
  return query select p_table, p_count from _purged order by p_count desc;
end $$;

comment on function danubra_demo_purge is
  'Zmaže vzorové dáta. Maže výlučne riadky zapísané v danubra_demo_ledger — '
  'ostrých dát sa nedotkne. Ostré odkazy na vzorové riadky nastaví na null, '
  'vzorové obdobia otvorí a vzorové dodatky zmaže napriek ochrane.';

revoke all on function danubra_demo_purge() from public;
grant execute on function danubra_demo_purge() to authenticated;


-- ── Výmena dát ───────────────────────────────────────────────────────────────
do $$
declare
  v_d   date := current_date;
  v_m0  date := date_trunc('month', current_date)::date;                       -- tento mesiac
  v_m1  date := (date_trunc('month', current_date) - interval '1 month')::date; -- minulý
  v_m2  date := (date_trunc('month', current_date) - interval '2 month')::date; -- predminulý
  v_m3  date := (date_trunc('month', current_date) - interval '3 month')::date;
  v_m0e date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_admin uuid;
  v_t text;

  -- odberatelia
  p_hof uuid; p_kru uuid; p_neu uuid; p_sch uuid; p_wag uuid; p_lin uuid;
  -- živnostníci
  w_kov uuid; w_bal uuid; w_hud uuid; w_dvo uuid; w_sza uuid; w_nag uuid; w_kis uuid;
  w_nov uuid; w_hor uuid; w_pro uuid; w_sim uuid; w_pol uuid; w_kol uuid; w_sta uuid;
  -- partie
  c_kov uuid; c_sza uuid; c_hor uuid; c_pol uuid;
  -- ponuky, zmluvy, zákazky
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid; q7 uuid;
  k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid; k6 uuid; k7 uuid; k8 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid; s9 uuid;
  -- nábor
  rp1 uuid; rp2 uuid; rp3 uuid; rp4 uuid; rp5 uuid; rp6 uuid;
  ad1 uuid; ad2 uuid; ad3 uuid; ad4 uuid; ad5 uuid; ad6 uuid;
  cd1 uuid; cd2 uuid; cd3 uuid; cd4 uuid; cd5 uuid; cd6 uuid; cd7 uuid; cd8 uuid;
  cd9 uuid; cd10 uuid; cd11 uuid; cd12 uuid;
  o1 uuid; o4 uuid;
  -- ubytovanie
  ac1 uuid; ac2 uuid; ac3 uuid; ac4 uuid; ac5 uuid; ac6 uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  -- nasadenia a obdobia
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid; a10 uuid; a11 uuid;
  ps7a uuid; ps7b uuid; ps7c uuid; ps1a uuid; ps1b uuid; ps1c uuid; ps2a uuid; ps2b uuid; ps3a uuid; ps3b uuid;
  -- objednávky
  wo1 uuid; wo2 uuid; wo3 uuid; wo6 uuid; wo8 uuid;
  -- faktúry a peniaze
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid; i7 uuid; i8 uuid; i9 uuid; i10 uuid; i12 uuid; i13 uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; b11 uuid;
  co1 uuid; co2 uuid; co3 uuid;
  -- ubytovacia agentúra (modul je v nastaveniach vypnutý, dáta sú pre úplnosť)
  cl1 uuid; cl2 uuid; cl3 uuid;
  iq1 uuid; iq2 uuid; iq3 uuid; iq4 uuid;
  of1 uuid; of2 uuid; of3 uuid; of4 uuid;
  or1 uuid; or2 uuid; or3 uuid; or4 uuid; or5 uuid; or6 uuid; or7 uuid; or8 uuid;
  -- hlas, správy, marketing
  cn1 uuid; cn2 uuid; cn3 uuid; cn4 uuid; cn5 uuid;
  r1 uuid; r2 uuid; r4 uuid;
  th1 uuid; th2 uuid; th3 uuid; th4 uuid;
  ld1 uuid; ld2 uuid; ld3 uuid; ld4 uuid; ld5 uuid; ld6 uuid; ld7 uuid; ld8 uuid;
  ca1 uuid; ca2 uuid;
  v_id uuid;
  v_amt numeric;
  v_amt_sza numeric;
  v_hrs numeric;
  v_week_mon date;
begin
  -- ── 0. Spustiť len raz ─────────────────────────────────────────────────────
  if exists (select 1 from danubra_partners where ust_idnr = 'DE287451936' and name = 'Hofmann Bau GmbH') then
    raise notice '064 už prebehla (vzorová firma Hofmann Bau GmbH existuje) — nič sa nemení.';
    return;
  end if;

  select user_id into v_admin from danubra_members
   where role = 'admin' and active order by created_at limit 1;

  -- ── 1. Staré PDF skryť ─────────────────────────────────────────────────────
  update danubra_archive set archived_at = now() where archived_at is null;

  -- ── 2. Odkazy z tabuliek, ktoré zostávajú ──────────────────────────────────
  update danubra_archive
     set worker_id = null, partner_id = null, subcontract_id = null
   where worker_id is not null or partner_id is not null or subcontract_id is not null;
  update danubra_mail_messages
     set worker_id = null, partner_id = null, lead_id = null
   where worker_id is not null or partner_id is not null or lead_id is not null;
  update danubra_web_submissions
     set candidate_id = null, opportunity_id = null
   where candidate_id is not null or opportunity_id is not null;
  update danubra_screening_questions set ad_id = null where ad_id is not null;

  -- ── 3. Zmazať pracovné záznamy ─────────────────────────────────────────────
  -- Uzavreté obdobia sa najprv otvoria — inak by hodiny v nich zostali
  -- zamknuté (danubra_ts_frozen_trg). Dodatky sa bežne nemažú; tu áno, lebo
  -- sa maže celá sada naraz so súhlasom majiteľa.
  update danubra_periods set status = 'open' where status <> 'open';
  alter table danubra_contract_amendments disable trigger danubra_amendment_no_delete_trg;

  delete from danubra_bank_transactions;
  delete from danubra_invoice_reminders;
  delete from danubra_advances;
  delete from danubra_costs;
  delete from danubra_invoice_items;
  delete from danubra_invoices;
  delete from danubra_bills;
  delete from danubra_bundles;
  delete from danubra_work_orders;
  delete from danubra_timesheets;
  delete from danubra_hour_sheets;
  delete from danubra_checklist_items;
  delete from danubra_assignment_checks;
  delete from danubra_stays;
  delete from danubra_subcontract_accommodations;
  delete from danubra_assignments;
  delete from danubra_periods;
  delete from danubra_promises;
  delete from danubra_call_recordings;
  delete from danubra_consents;
  update danubra_workers set candidate_id = null where candidate_id is not null;
  delete from danubra_candidate_chips;
  delete from danubra_candidate_checks;
  delete from danubra_candidate_notes;
  delete from danubra_screening_answers;
  delete from danubra_candidates;
  delete from danubra_ads;
  delete from danubra_plan_assets;
  delete from danubra_opportunities;
  delete from danubra_recruitment_plans;
  delete from danubra_campaign_sends;
  delete from danubra_campaigns;
  delete from danubra_lead_searches;
  delete from danubra_leads;
  delete from danubra_subcontracts;
  delete from danubra_contract_amendments;
  delete from danubra_contracts;
  delete from danubra_quotes;
  delete from danubra_partners;
  delete from danubra_crew_members;
  delete from danubra_crews;
  delete from danubra_worker_documents;
  delete from danubra_overrides;
  delete from danubra_workers;
  delete from danubra_documents;
  delete from danubra_order_extensions;
  delete from danubra_order_service_periods;
  delete from danubra_order_requests;
  delete from danubra_order_persons;
  delete from danubra_orders;
  delete from danubra_offer_variants;
  delete from danubra_offers;
  delete from danubra_inquiries;
  delete from danubra_clients;
  delete from danubra_accommodations;
  delete from danubra_activities;
  delete from danubra_tasks;
  delete from danubra_messages;
  delete from danubra_message_threads;
  delete from danubra_marketing_listings;
  delete from danubra_marketing_expenses;
  delete from danubra_compliance;
  delete from danubra_demo_ledger;

  alter table danubra_contract_amendments enable trigger danubra_amendment_no_delete_trg;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. NOVÁ SADA
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── Odberatelia ────────────────────────────────────────────────────────────
  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    default_charge_rate, invoice_language, reverse_charge, status, website, vies_result, vies_checked_at)
  values ('Hofmann Bau GmbH', 'DE287451936', 'HRB 214587, Amtsgericht München',
    'Landsberger Straße 312', 'München', '80687', 'DE', 'Herr Markus Hofmann', '+49 89 5467 2210',
    'bauleitung@hofmann-bau.example', 'de', 30, true, 'A', 'odporúčanie',
    'Najstarší odberateľ. Platí včas, chce podpísaný týždenný výkaz každý piatok.',
    38.50, 'de', true, 'active', 'https://www.hofmann-bau.example',
    jsonb_build_object('valid', true, 'vat', 'DE287451936', 'name', null, 'address', null, 'source', 'vies'),
    now() - interval '12 days')
  returning id into p_hof;

  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    default_charge_rate, reverse_charge, status, website)
  values ('Krüger Innenausbau GmbH', 'DE314752869', 'HRB 762341, Amtsgericht Stuttgart',
    'Heilbronner Straße 150', 'Stuttgart', '70191', 'DE', 'Frau Sabine Krüger', '+49 711 2584 330',
    'einkauf@krueger-innenausbau.example', 'de', 21, true, 'B', 'kampaň',
    'Získaná z jesennej e-mailovej kampane. Freistellung od nás zatiaľ nemá overenú, zráža 15 %.',
    36.00, true, 'active', 'https://www.krueger-innenausbau.example')
  returning id into p_kru;

  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    default_charge_rate, reverse_charge, status, website, vies_result, vies_checked_at)
  values ('Stahlbau Neumann GmbH', 'DE198374652', 'HRB 30127, Amtsgericht Augsburg',
    'Berliner Allee 42', 'Augsburg', '86153', 'DE', 'Herr Jürgen Neumann', '+49 821 4509 120',
    'technik@stahlbau-neumann.example', 'de', 30, false, 'A', 'veľtrh',
    'Dielenská výroba oceľových konštrukcií v hale 4. Nie je to stavba — SOKA-BAU sa netýka.',
    41.00, true, 'active', 'https://www.stahlbau-neumann.example',
    jsonb_build_object('valid', true, 'vat', 'DE198374652', 'name', null, 'address', null, 'source', 'vies'),
    now() - interval '40 days')
  returning id into p_neu;

  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    reverse_charge, status, website, vies_result, vies_checked_at)
  values ('Schäfer Fassadentechnik GmbH', 'DE265489137', 'HRB 33918, Amtsgericht Nürnberg',
    'Rothenburger Straße 241', 'Nürnberg', '90439', 'DE', 'Herr Dieter Schäfer', '+49 911 6612 045',
    'schaefer@schaefer-fassaden.example', 'de', 45, true, 'C', 'Auftragsbank.de',
    'Tlačí na cenu, splatnosť 45 dní. Jednu ponuku odmietol, o druhej sa rokuje.',
    true, 'active', 'https://www.schaefer-fassaden.example',
    jsonb_build_object('valid', false, 'vat', 'DE265489137', 'name', null, 'address', null, 'source', 'vies'),
    now() - interval '5 days')
  returning id into p_sch;

  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    reverse_charge, status, website)
  values ('Wagner Haustechnik GmbH', 'DE301928475', 'HRB 15582, Amtsgericht Regensburg',
    'Hornstraße 8', 'Regensburg', '93053', 'DE', 'Herr Florian Wagner', '+49 941 7098 214',
    'f.wagner@wagner-haustechnik.example', 'de', 30, true, 'B', 'web',
    'Jedna zákazka zrušená (hotel), nová sa pripravuje.',
    true, 'active', 'https://www.wagner-haustechnik.example')
  returning id into p_wag;

  insert into danubra_partners (name, ust_idnr, registration_no, address, city, postal_code, country,
    contact_person, phone, email, language, payment_terms_days, is_construction, rating, source, notes,
    reverse_charge, status)
  values ('Lindner Trockenbau GmbH', 'DE276310948', 'HRB 6621, Amtsgericht Ingolstadt',
    'Friedrich-Ebert-Straße 77', 'Ingolstadt', '85055', 'DE', 'Frau Petra Lindner', '+49 841 3317 600',
    'p.lindner@lindner-trockenbau.example', 'de', 30, true, null, 'Auftragsbank.de',
    'Spolupráca ukončená v roku 2025 — neplatili načas. Neponúkať.',
    true, 'inactive')
  returning id into p_lin;

  -- ── Živnostníci ────────────────────────────────────────────────────────────
  -- Každý stav: candidate, screening, ready, deployed, inactive, blacklist.
  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, address, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, notes, cooperating_since, company_id, tax_id,
    business_address, business_city, business_zip, business_country, trade_licence_from, trade_licence_scopes)
  values ('Ján Kováčik', '+421 905 318 442', 'jan.kovacik@mail.example', true, 'sk', '1984-03-12',
    'Štúrova 14', 'Nitra', 'SK', 'trockenbau', 'fachwerker', array['sadrokartón Q2–Q3', 'podhľady', 'protipožiarne priečky'],
    array['sk', 'de'], 'B1', true, true, 'szco', 22.00, 'SK1209000000005123874631', 'deployed', 'referral',
    'Vedie partiu. Dohodne sa s polierom bez tlmočníka.', v_m0 - interval '30 months',
    '50123456', '1123456789', 'Štúrova 14', 'Nitra', '949 01', 'SK', '2016-04-01',
    array['Montáž sadrokartónových konštrukcií'])
  returning id into w_kov;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, address, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, referred_by, cooperating_since, company_id, tax_id,
    business_address, business_city, business_zip, trade_licence_from, trade_licence_scopes)
  values ('Peter Baláž', '+421 907 264 118', 'peter.balaz@mail.example', true, 'sk', '1990-07-02',
    'Hlavná 51', 'Vráble', 'SK', 'trockenbau', 'fachwerker', array['sadrokartón Q2', 'tmelenie'],
    array['sk'], 'A1', true, true, 'szco', 21.00, 'SK1611000000002941837265', 'deployed', 'referral', w_kov,
    v_m0 - interval '14 months', '51234987', '1129876543', 'Hlavná 51', 'Vráble', '952 01', '2019-02-15',
    array['Montáž sadrokartónových konštrukcií', 'Maliarske a natieračské práce'])
  returning id into w_bal;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, cooperating_since, company_id, business_city, trade_licence_from)
  values ('Marek Hudec', '+421 918 402 775', 'marek.hudec@mail.example', true, 'sk', '1996-11-21',
    'Zlaté Moravce', 'SK', 'trockenbau', 'werker', array['rošty', 'opláštenie'], array['sk'], 'A1', false, false,
    'szco', 19.00, 'SK0302000000004518293746', 'deployed', 'meta_ads', v_m2, '53318764', 'Zlaté Moravce', '2024-05-01')
  returning id into w_hud;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, address, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, cooperating_since, company_id, tax_id,
    business_address, business_city, business_zip, business_country, trade_licence_from,
    self_billing, self_billing_since, self_billing_prefix, self_billing_seq, notes)
  values ('Tomáš Dvořák', '+420 603 214 876', 'tomas.dvorak@mail.example', true, 'cs', '1987-05-30',
    'Lannova 22', 'České Budějovice', 'CZ', 'maliar', 'fachwerker', array['Airless', 'sklotextil', 'fasády'],
    array['cs', 'de'], 'A2', true, true, 'szco', 21.50, 'CZ1708000000002618394057', 'deployed', 'profesia',
    v_m1, '07654321', 'CZ8705301234', 'Lannova 22', 'České Budějovice', '370 01', 'CZ', '2012-09-01',
    true, v_m1, 'TD', 1,
    'Faktúry za neho vystavujeme my (dohoda o vyhotovovaní faktúr podpísaná).')
  returning id into w_dvo;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, cooperating_since, company_id, business_city, business_country,
    trade_licence_from, notes)
  values ('László Szabó', '+36 30 412 7788', 'laszlo.szabo@mail.example', true, 'hu', '1982-01-17',
    'Győr', 'HU', 'zvarac', 'fachwerker', array['MIG/MAG 135', 'TIG 141', 'čítanie výkresov'],
    array['hu', 'de', 'sk'], 'B1', true, true, 'szco', 24.00, 'HU38117730161234567800000000', 'deployed', 'referral',
    v_m0 - interval '20 months', '58213467', 'Győr', 'HU', '2011-03-01',
    'Vedúci maďarskej partie, hovorí aj po slovensky.')
  returning id into w_sza;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, skills, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, referred_by, cooperating_since, business_city, business_country,
    trade_licence_from)
  values ('Gábor Nagy', '+36 20 958 3341', 'gabor.nagy@mail.example', true, 'hu', '1993-08-09',
    'Mosonmagyaróvár', 'HU', 'zamocnik', 'werker', array['montáž oceľových konštrukcií', 'brúsenie'],
    array['hu'], null, true, false, 'szco', 20.00, 'HU51104001774859301200000000', 'deployed', 'referral', w_sza,
    v_m1, 'Mosonmagyaróvár', 'HU', '2020-06-01')
  returning id into w_nag;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, available_from, source, business_country, trade_licence_from)
  values ('Zoltán Kiss', '+36 70 233 9014', 'zoltan.kiss@mail.example', true, 'hu', '1989-12-03',
    'Komárom', 'HU', 'zvarac', 'fachwerker', array['hu', 'sk'], 'A2', true, true, 'szco',
    23.00, 'HU53120101540198276500000000', 'ready', v_d + 14, 'facebook', 'HU', '2015-01-01')
  returning id into w_kis;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, available_from, source, cooperating_since, company_id, business_city,
    business_country, trade_licence_from)
  values ('Jakub Novotný', '+420 734 118 652', 'jakub.novotny@mail.example', true, 'cs', '1995-04-14',
    'Brno', 'CZ', 'obkladac', 'fachwerker', array['cs', 'de'], 'A2', true, true, 'szco',
    21.00, 'CZ4201000000194837261509', 'ready', v_d + 14, 'meta_ads', v_d - 6, '09812345', 'Brno', 'CZ', '2018-10-01')
  returning id into w_nov;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, driving_licence, legal_form, hourly_cost, status, source, notes, trade_licence_from)
  values ('Michal Horváth', '+421 949 506 213', 'michal.horvath@mail.example', true, 'sk', '1991-02-26',
    'Komárno', 'SK', 'murar', 'werker', array['sk', 'hu'], true, 'szco', 19.50, 'screening', 'facebook',
    'Chýba A1 aj podpísaná zmluva. Podal žiadosť o A1 v Sociálnej poisťovni.', '2023-03-01')
  returning id into w_hor;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, legal_form, status, source)
  values ('Radek Procházka', '+420 777 302 914', 'radek.prochazka@mail.example', false, 'cs', '1998-06-08',
    'Ostrava', 'CZ', 'montaznik', 'werker', array['cs'], 'szco', 'candidate', 'web')
  returning id into w_pro;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, regulated_trade, company_id, business_city, trade_licence_from, notes)
  values ('Igor Šimko', '+421 902 771 340', 'igor.simko@mail.example', true, 'sk', '1980-10-19',
    'Trnava', 'SK', 'elektrikar', 'fachwerker', array['sk', 'de'], 'B1', true, true, 'szco',
    25.00, 'SK5809000000005098713264', 'ready', 'referral', true, '47563210', 'Trnava', '2008-01-01',
    'Regulované remeslo — pred nasadením treba oznámenie §9 HwO. A1 mu skončilo.')
  returning id into w_sim;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, legal_form, hourly_cost, bank_iban, status, source, cooperating_since, notes)
  values ('Roman Polák', '+421 915 883 207', 'roman.polak@mail.example', true, 'sk', '1978-09-05',
    'Levice', 'SK', 'trockenbau', 'fachwerker', array['sk'], 'szco', 21.00, 'SK0611000000002617394852',
    'inactive', 'referral', v_m3,
    'Po skončení zákazky Freiham si dal pauzu do jari. Ozvať sa mu vo februári.')
  returning id into w_pol;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, legal_form, status, source, notes)
  values ('Dušan Kollár', '+421 944 120 568', 'dusan.kollar@mail.example', false, 'sk', '1985-12-11',
    'Šaľa', 'SK', 'trockenbau', 'werker', array['sk'], 'szco', 'blacklist', 'facebook',
    'Nespolupracovať: dvakrát odišiel zo stavby bez ohlásenia, odberateľ to reklamoval.')
  returning id into w_kol;

  insert into danubra_workers (full_name, phone, email, whatsapp, language, birth_date, city, country,
    profession, skill_level, languages, german_level, driving_licence, own_tools, legal_form,
    hourly_cost, bank_iban, status, source, cooperating_since, company_name, company_id, tax_id, vat_id, vat_payer,
    business_address, business_city, business_zip, business_country,
    self_billing, self_billing_since, self_billing_prefix, self_billing_seq)
  values ('Ondřej Šťastný', '+420 608 447 125', 'ondrej.stastny@mail.example', true, 'cs', '1988-03-23',
    'Plzeň', 'CZ', 'maliar', 'fachwerker', array['cs', 'de'], 'B1', true, true, 'sro',
    22.50, 'CZ1603000000002174938650', 'deployed', 'web', v_m1,
    'OS Montáže s.r.o.', '08765432', 'CZ08765432', 'CZ08765432', false,
    'Klatovská 118', 'Plzeň', '301 00', 'CZ', true, v_m1, 'OSM', 0)
  returning id into w_sta;

  -- ── Doklady ────────────────────────────────────────────────────────────────
  -- Platné, končiace do 30 dní, po platnosti, ešte neplatné (A1 od budúcna)
  -- a chýbajúce. Nasadenie sa pustí len s platnými dokladmi k dátumu nástupu
  -- (danubra_assignment_docs_guard), preto sú dátumy zvolené tak, aby k nástupu
  -- platili a niektoré odvtedy vypršali.
  insert into danubra_worker_documents (worker_id, kind, reference, valid_from, valid_to, status, notes)
  values
    (w_kov, 'id_card',       'HK 482917', '2021-05-10', '2031-05-10', 'valid', null),
    (w_kov, 'trade_licence', 'OÚ-NR-OZP-2016/004512', '2016-04-01', null, 'valid', 'Výpis zo živnostenského registra.'),
    (w_kov, 'contract',      'RZ-VZOR-2026-01', v_m2 - 20, null, 'valid', 'Rámcová zmluva o dielo.'),
    (w_kov, 'a1',            'SP-A1-2026-118204', v_m2 - 10, v_d + 200, 'valid', null),
    (w_kov, 'medical',       null, v_d - 200, v_d + 160, 'valid', 'Pracovná zdravotná služba Nitra.'),
    (w_kov, 'training',      'BOZP-2026-07', v_d - 90, v_d + 275, 'valid', 'Školenie BOZP a práca vo výškach.'),
    (w_kov, 'gdpr',          null, v_m2 - 20, null, 'valid', null),
    (w_bal, 'id_card',       'EA 119384', '2020-02-01', '2030-02-01', 'valid', null),
    (w_bal, 'trade_licence', 'OÚ-NR-OZP-2019/001877', '2019-02-15', null, 'valid', null),
    (w_bal, 'contract',      'RZ-VZOR-2026-02', v_m2 - 20, null, 'valid', null),
    (w_bal, 'a1',            'SP-A1-2026-118207', v_m2 - 10, v_d + 20, 'valid', 'Končí o 20 dní — požiadať o predĺženie.'),
    (w_bal, 'medical',       null, v_d - 355, v_d + 10, 'valid', null),
    (w_hud, 'id_card',       'HZ 774106', '2016-09-01', v_d + 60, 'valid', 'Občiansky končí o dva mesiace.'),
    (w_hud, 'trade_licence', 'OÚ-NR-OZP-2024/006230', '2024-05-01', null, 'valid', null),
    (w_hud, 'contract',      'RZ-VZOR-2026-03', v_m2 - 20, null, 'valid', null),
    (w_hud, 'a1',            'SP-A1-2026-118215', v_m2 - 10, v_d + 180, 'valid', null),
    (w_hud, 'insurance',     'PZ-2026-55120', v_d - 100, v_d + 265, 'valid', 'Poistenie zodpovednosti, Kooperativa.'),
    (w_dvo, 'passport',      '45127788', '2019-04-01', '2029-04-01', 'valid', null),
    (w_dvo, 'trade_licence', 'ŽL 370104-2012', '2012-09-01', null, 'valid', 'Živnostenský list, Magistrát České Budějovice.'),
    (w_dvo, 'contract',      'RZ-VZOR-2026-04', v_m1 - 5, null, 'valid', 'Rámcová zmluva + dohoda o vyhotovovaní faktúr.'),
    (w_dvo, 'a1',            'ČSSZ-A1-2026-33018', v_m1 - 5, v_d + 150, 'valid', null),
    (w_sza, 'id_card',       '512384AE', '2018-01-10', '2028-01-10', 'valid', null),
    (w_sza, 'trade_licence', 'EV-58213467', '2011-03-01', null, 'valid', 'Egyéni vállalkozó, NAV.'),
    (w_sza, 'contract',      'RZ-VZOR-2026-05', v_m1 - 10, null, 'valid', null),
    (w_sza, 'a1',            'NEAK-A1-2026-90211', v_m1 - 10, v_d + 120, 'valid', null),
    (w_sza, 'certificate',   'EN ISO 9606-1 135 P BW', v_d - 705, v_d + 25, 'valid', 'Zváračský certifikát — predĺženie do mesiaca.'),
    (w_nag, 'id_card',       '733902HA', '2021-03-01', '2031-03-01', 'valid', null),
    (w_nag, 'trade_licence', 'EV-60118422', '2020-06-01', null, 'valid', null),
    (w_nag, 'contract',      'RZ-VZOR-2026-06', v_m1 - 10, null, 'valid', null),
    (w_nag, 'a1',            'NEAK-A1-2026-90212', v_m1 - 10, v_d - 3, 'valid', 'Vypršalo — nové je podané, chodí 2 až 6 týždňov.'),
    (w_kis, 'id_card',       '845120KC', '2022-06-01', '2032-06-01', 'valid', null),
    (w_kis, 'trade_licence', 'EV-55120934', '2015-01-01', null, 'valid', null),
    (w_kis, 'contract',      'RZ-VZOR-2026-07', v_d - 3, null, 'valid', null),
    (w_kis, 'a1',            'NEAK-A1-2026-91540', v_d + 10, v_d + 375, 'valid', 'Platí až od nástupu.'),
    (w_nov, 'passport',      '41993276', '2020-08-01', '2030-08-01', 'valid', null),
    (w_nov, 'trade_licence', 'ŽL 620031-2018', '2018-10-01', null, 'valid', null),
    (w_nov, 'contract',      'RZ-VZOR-2026-08', v_d - 4, null, 'valid', null),
    (w_nov, 'a1',            'ČSSZ-A1-2026-34507', v_d + 7, v_d + 200, 'valid', null),
    (w_nov, 'gdpr',          null, v_d - 6, null, 'valid', null),
    (w_hor, 'id_card',       'KM 302118', '2022-01-15', '2032-01-15', 'valid', null),
    (w_hor, 'trade_licence', 'OÚ-KN-OZP-2023/001204', '2023-03-01', null, 'valid', null),
    (w_pro, 'id_card',       '206774512', '2023-05-01', '2033-05-01', 'valid', null),
    (w_pro, 'gdpr',          null, v_d - 9, null, 'valid', null),
    (w_sim, 'id_card',       'TT 559021', '2019-11-01', '2029-11-01', 'valid', null),
    (w_sim, 'trade_licence', 'OÚ-TT-OZP-2008/000311', '2008-01-01', null, 'valid', null),
    (w_sim, 'contract',      'RZ-VZOR-2026-11', v_m1, null, 'valid', null),
    (w_sim, 'a1',            'SP-A1-2025-993120', v_d - 405, v_d - 40, 'valid', 'Po platnosti — bez nového A1 sa nasadiť nedá.'),
    (w_sim, 'certificate',   'Osvedčenie §22 vyhl. 508/2009', '2010-05-01', null, 'valid', 'Odborná spôsobilosť elektrotechnika — podklad pre §9 HwO.'),
    (w_pol, 'id_card',       'LV 118274', '2017-04-01', '2027-04-01', 'valid', null),
    (w_pol, 'trade_licence', 'OÚ-LV-OZP-2014/002871', '2014-01-01', null, 'valid', null),
    (w_pol, 'contract',      'RZ-VZOR-2026-12', v_m3 - 5, v_m1 + 14, 'valid', 'Ukončená spolu so zákazkou Freiham.'),
    (w_pol, 'a1',            'SP-A1-2026-110092', v_m3 - 5, v_m1 + 14, 'valid', null),
    (w_kol, 'id_card',       'SA 552901', '2015-06-01', v_d - 120, 'valid', 'Po platnosti.'),
    (w_sta, 'id_card',       '210338741', '2021-09-01', '2031-09-01', 'valid', null),
    (w_sta, 'trade_licence', 'OR KS Plzeň C 41872', '2019-11-01', null, 'valid', 'Výpis z obchodného registra s.r.o.'),
    (w_sta, 'contract',      'RZ-VZOR-2026-14', v_m1, null, 'valid', 'Rámcová zmluva + dohoda o vyhotovovaní faktúr.'),
    (w_sta, 'a1',            'ČSSZ-A1-2026-34110', v_m1, v_d + 90, 'valid', null),
    (w_sta, 'insurance',     'ČPP-2026-11823', v_d - 300, v_d + 65, 'valid', null);

  -- ── Partie ─────────────────────────────────────────────────────────────────
  -- Vedúci sa nastaví až po zapísaní členov — trigger ho len označí za vedúceho.
  insert into danubra_crews (name, trade_key, usual_size, phone, language, status, notes)
  values ('Partia Kováčik', 'trockenbau', 3, '+421 905 318 442', 'sk', 'active',
    'Zohratá trojica zo Nitrianskeho kraja, spolu od roku 2023.')
  returning id into c_kov;
  insert into danubra_crews (name, trade_key, usual_size, phone, language, status, notes)
  values ('Partia Szabó', 'zvarac', 2, '+36 30 412 7788', 'hu', 'active', 'Zvárač a zámočník, chodia spolu.')
  returning id into c_sza;
  insert into danubra_crews (name, trade_key, usual_size, phone, language, status, notes)
  values ('Partia Horváth', 'murar', 3, '+421 949 506 213', 'sk', 'paused',
    'Čaká na A1 pre vedúceho. Tretieho člena ešte hľadajú.')
  returning id into c_hor;
  insert into danubra_crews (name, trade_key, usual_size, language, status, notes)
  values ('Partia Polák', 'trockenbau', 2, 'sk', 'disbanded', 'Rozpadla sa po zákazke Freiham.')
  returning id into c_pol;

  insert into danubra_crew_members (crew_id, worker_id, role, joined_at, left_at)
  values
    (c_kov, w_kov, 'leader', v_m0 - interval '30 months', null),
    (c_kov, w_bal, 'member', v_m0 - interval '14 months', null),
    (c_kov, w_hud, 'member', v_m2, null),
    (c_sza, w_sza, 'leader', v_m0 - interval '20 months', null),
    (c_sza, w_nag, 'member', v_m1, null),
    (c_hor, w_hor, 'leader', v_d - 20, null),
    (c_hor, w_pro, 'member', v_d - 9, null),
    (c_pol, w_pol, 'member', v_m3, v_m1 + 14),
    (c_pol, w_kol, 'member', v_m3, v_m2 - 5);

  update danubra_crews set leader_worker_id = w_kov where id = c_kov;
  update danubra_crews set leader_worker_id = w_sza where id = c_sza;
  update danubra_crews set leader_worker_id = w_hor where id = c_hor;

  -- ── Ponuky odberateľom ─────────────────────────────────────────────────────
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city, site_address,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status,
    sent_at, decided_at, notes)
  values ('PON-VZOR-2026-001', p_hof, 'Trockenbau Wohnanlage Isarauen, Bauteil A–C', 'trockenbau', 3, 'construction',
    'München', 'Schäftlarnstraße 160, 81371 München', 'DE', v_m2 + 14, v_d + 120, 200, 38.50, 21.00, 2.50,
    v_m2 + 5, 'accepted', v_m2 - 10, v_m2 + 2, 'Prijatá po jednom kole, bez zľavy.')
  returning id into q1;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status,
    sent_at, decided_at)
  values ('PON-VZOR-2026-002', p_neu, 'Schweißarbeiten Halle 4 — Stahlträger und Bühnen', 'zvarac', 2, 'workshop',
    'Augsburg', 'DE', v_m1, v_d + 60, 176, 40.00, 22.00, 2.00, v_m1 - 3, 'accepted', v_m1 - 20, v_m1 - 8)
  returning id into q2;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city, site_address,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status, sent_at, notes)
  values ('PON-VZOR-2026-003', p_kru, 'Fliesenarbeiten Klinikum Nord, Bettenhaus', 'obkladac', 3, 'construction',
    'Stuttgart', 'Auerbachstraße 110, 70376 Stuttgart', 'DE', v_d + 14, v_d + 134, 190, 37.00, 21.00, 2.50,
    v_d + 5, 'sent', v_d - 9, 'Platnosť končí o 5 dní — zavolať pani Krügerovej.')
  returning id into q3;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status, sent_at)
  values ('PON-VZOR-2026-004', p_sch, 'Fassadensanierung Gostenhof — WDVS und Putz', 'omietkar', 4, 'construction',
    'Nürnberg', 'DE', v_d + 30, v_d + 150, 200, 35.50, 20.50, 2.50, v_d + 20, 'sent', v_d - 4)
  returning id into q4;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status,
    sent_at, decided_at, reject_reason)
  values ('PON-VZOR-2026-005', p_sch, 'Putzarbeiten Wohnpark Schweinau', 'omietkar', 3, 'construction',
    'Nürnberg', 'DE', v_m1 + 10, v_d + 60, 190, 36.00, 21.00, 2.50, v_m1, 'rejected', v_m2 + 20, v_m1 - 2,
    'Odberateľ vzal poľskú firmu za 31 €/h. Pod 34 €/h nejdeme.')
  returning id into q5;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status, sent_at, notes)
  values ('PON-VZOR-2026-006', p_wag, 'Montage Lüftungskanäle Bürohaus Ost', 'montaznik', 2, 'construction',
    'Regensburg', 'DE', v_m1, v_m0 + 20, 176, 37.50, 22.00, 2.50, v_m1 - 10, 'expired', v_m2 + 10,
    'Odberateľ sa neozval, ponuka prepadla.')
  returning id into q6;
  insert into danubra_quotes (quote_number, partner_id, title, trade_key, headcount, work_type, site_city,
    country, date_from, date_to, hours_per_month, charge_rate, worker_rate, overhead_per_hour, valid_until, status, notes)
  values ('PON-VZOR-2026-007', p_wag, 'Haustechnik Kreuzhof — Rohrmontage', 'montaznik', 2, 'construction',
    'Regensburg', 'DE', v_d + 45, v_d + 165, 176, 38.00, 22.50, 2.50, v_d + 30, 'draft',
    'Rozpracovaná — čaká sa na výkaz výmer od pána Wagnera.')
  returning id into q7;

  -- ── Zmluvy ─────────────────────────────────────────────────────────────────
  -- Stavy draft, sent, signed, active, ended, cancelled; Werkvertrag aj rámcová.
  insert into danubra_contracts (contract_number, partner_id, quote_id, title, kind, scope, date_from, date_to,
    charge_rate, payment_terms_days, signed_at, status, notes, site_name, site_city, site_address, price_model,
    retention_pct, warranty_months, penalty_note, notice_days, contact_name, contact_email, contact_phone)
  values ('ZML-VZOR-2026-001', p_hof, q1, 'Werkvertrag Trockenbau Wohnanlage Isarauen', 'werkvertrag',
    'Trockenbauarbeiten Bauteil A–C: Ständerwände CW/UW, Beplankung GKB/GKF, Verspachtelung Q2/Q3, '
    || 'abgehängte Decken im Treppenhaus. Material stellt der Auftraggeber.',
    v_m2 + 14, v_d + 120, 38.50, 30, v_m2 + 8, 'active', 'Termín predĺžený dodatkom č. 1.',
    'Wohnanlage Isarauen', 'München', 'Schäftlarnstraße 160, 81371 München', 'hourly',
    5, 60, 'Vertragsstrafe 0,2 % je Werktag, max. 5 %.', 14, 'Herr Thomas Brandl (Polier)',
    'bauleitung@hofmann-bau.example', '+49 151 2264 9031')
  returning id into k1;
  insert into danubra_contracts (contract_number, partner_id, quote_id, title, kind, scope, date_from, date_to,
    charge_rate, payment_terms_days, signed_at, status, site_name, site_city, site_address, price_model,
    warranty_months, notice_days, contact_name, contact_phone)
  values ('ZML-VZOR-2026-002', p_neu, q2, 'Werkvertrag Schweißarbeiten Halle 4', 'werkvertrag',
    'Schweißen von Stahlträgern und Bühnen nach Zeichnungen 24-H4-01 bis 24-H4-18, Sichtprüfung je Abschnitt.',
    v_m1, v_d + 60, 41.00, 30, v_m1 - 5, 'active', 'Halle 4', 'Augsburg', 'Berliner Allee 42, 86153 Augsburg',
    'hourly', 24, 14, 'Herr Jürgen Neumann', '+49 821 4509 120')
  returning id into k2;
  insert into danubra_contracts (contract_number, partner_id, title, kind, scope, date_from, date_to,
    charge_rate, payment_terms_days, signed_at, status, site_name, site_city, site_address, price_model,
    retention_pct, warranty_months, contact_name, contact_email, contact_phone)
  values ('ZML-VZOR-2026-003', p_kru, 'Werkvertrag Malerarbeiten Bürogebäude Neckarpark', 'werkvertrag',
    'Malerarbeiten 1.–4. OG: Grundierung, zweimaliger Anstrich Dispersion, Glasgewebe in Fluren.',
    v_m1 + 7, v_d + 45, 36.00, 21, v_m1 + 3, 'signed', 'Bürogebäude Neckarpark', 'Stuttgart',
    'Mercedesstraße 41, 70372 Stuttgart', 'hourly', 3, 48, 'Frau Sabine Keller (Bauleiterin)',
    'einkauf@krueger-innenausbau.example', '+49 160 9183 2207')
  returning id into k3;
  insert into danubra_contracts (contract_number, partner_id, quote_id, title, kind, scope, date_from, date_to,
    charge_rate, payment_terms_days, status, notes, site_name, site_city, price_model, warranty_months)
  values ('ZML-VZOR-2026-004', p_kru, q3, 'Werkvertrag Fliesenarbeiten Klinikum Nord', 'werkvertrag',
    'Wand- und Bodenfliesen Bettenhaus, Nassräume inkl. Abdichtung nach DIN 18534.',
    v_d + 14, v_d + 134, 37.00, 21, 'sent', 'Poslaná na podpis, odberateľ ju má od pondelka.',
    'Klinikum Nord', 'Stuttgart', 'hourly', 60)
  returning id into k4;
  insert into danubra_contracts (contract_number, partner_id, quote_id, title, kind, scope, date_from, date_to,
    payment_terms_days, status, notes, site_name, site_city, price_model, unit_label, unit_price, retention_pct)
  values ('ZML-VZOR-2026-005', p_sch, q4, 'Werkvertrag Fassadensanierung Gostenhof', 'werkvertrag',
    'WDVS 140 mm, Armierung, Oberputz, ca. 1 850 m².', v_d + 30, v_d + 150, 45, 'draft',
    'Návrh za m² — odberateľ chce cenu za jednotku, nie za hodinu.', 'Fassade Gostenhof', 'Nürnberg',
    'unit', 'm²', 19.50, 5)
  returning id into k5;
  insert into danubra_contracts (contract_number, partner_id, title, kind, scope, date_from, date_to, charge_rate,
    payment_terms_days, signed_at, status, site_name, site_city, site_address, price_model, warranty_months)
  values ('ZML-VZOR-2026-006', p_hof, 'Werkvertrag Trockenbau Lagerhalle Freiham', 'werkvertrag',
    'Trennwände Bürotrakt und Sozialräume.', v_m3 + 1, v_m1 + 14, 38.00, 30, v_m3 - 5, 'ended',
    'Lagerhalle Freiham', 'München', 'Hans-Steinkohl-Straße 9, 81249 München', 'hourly', 60)
  returning id into k6;
  insert into danubra_contracts (contract_number, partner_id, title, kind, scope, date_from, payment_terms_days,
    signed_at, status, notes, price_model, charge_rate, notice_days)
  values ('ZML-VZOR-2026-007', p_hof, 'Rahmenvertrag Nachunternehmerleistungen 2026–2027', 'framework',
    'Rahmen für Einzelaufträge im Trockenbau und Innenausbau; Einzelheiten je Bestellung.',
    v_m0 - interval '10 months', 30, (v_m0 - interval '10 months')::date, 'active',
    'Jednotlivé zákazky idú cez objednávky.', 'hourly', 38.50, 30)
  returning id into k7;
  insert into danubra_contracts (contract_number, partner_id, title, kind, date_from, date_to, fixed_price,
    payment_terms_days, status, notes, site_city, price_model)
  values ('ZML-VZOR-2026-008', p_wag, 'Werkvertrag Innenausbau Hotel Altstadt', 'werkvertrag',
    v_m1 + 15, v_d + 90, 48000.00, 30, 'cancelled', 'Investor stavbu zastavil, zmluva sa nepodpísala.',
    'Regensburg', 'fixed')
  returning id into k8;

  -- Dodatky: zmena termínu a zmena sadzby — podpísaná zmluva sa mení len takto.
  insert into danubra_contract_amendments (contract_id, amendment_number, field, old_value, new_value, reason, signed_at)
  values
    (k1, 'DOD-VZOR-001', 'date_to', to_char(v_d + 60, 'YYYY-MM-DD'), to_char(v_d + 120, 'YYYY-MM-DD'),
     'Posun termínu o 60 dní — odberateľ pridal Bauteil C.', v_d - 12),
    (k2, 'DOD-VZOR-002', 'charge_rate', '40.00', '41.00',
     'Vyššia sadzba za zváranie nad hlavou na bühne v 2. úrovni.', v_m1 + 10);

  -- ── Zákazky ────────────────────────────────────────────────────────────────
  -- Všetkých sedem stavov, stavba aj dielňa.
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_address,
    site_city, site_postal_code, date_from, date_to, scope, billing_model, charge_rate, zoll_reported_at, zoll_reference,
    freistellung_verified, soka_relevant, status, won_at, notes, transport_note, transport_provided, contract_id,
    quote_id, soka_registered_at, lat, lng, site_contact_name, site_contact_phone, meeting_point, work_start, site_note)
  values ('ZAK-VZOR-2026-001', p_hof, 'Wohnanlage Isarauen — Trockenbau', 'construction', 'trockenbau',
    'Wohnanlage Isarauen', 'Schäftlarnstraße 160', 'München', '81371', v_m2 + 14, v_d + 120,
    'Trockenbau Bauteil A–C, 2.–5. OG.', 'hourly', 38.50, v_m2 + 10, 'MLD-2026-0841177',
    true, true, 'active', v_m2 + 2, 'Hlavná zákazka jesene.',
    'Partia chodí vlastnou dodávkou Kováčika, palivo refakturujeme.', true, k1, q1, v_m2 + 9,
    48.1046, 11.5452, 'Herr Thomas Brandl (Polier)', '+49 151 2264 9031',
    'Kontajner stavbyvedúceho pri bráne B', '06:30', 'Prilba, reflexná vesta a S3 obuv povinné. Parkovať len na P2.')
  returning id into s1;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_address,
    site_city, site_postal_code, date_from, date_to, scope, billing_model, charge_rate, freistellung_verified,
    soka_relevant, status, won_at, contract_id, quote_id, lat, lng, site_contact_name, site_contact_phone,
    meeting_point, work_start)
  values ('ZAK-VZOR-2026-002', p_neu, 'Stahlbau Halle 4 — Schweißarbeiten', 'workshop', 'zvarac',
    'Halle 4', 'Berliner Allee 42', 'Augsburg', '86153', v_m1, v_d + 60,
    'Schweißen von Stahlträgern und Bühnen nach Zeichnungen.', 'hourly', 41.00, true, false, 'active', v_m1 - 8,
    k2, q2, 48.3858, 10.9136, 'Herr Jürgen Neumann', '+49 821 4509 120', 'Pförtner Tor 1', '06:00')
  returning id into s2;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_address,
    site_city, site_postal_code, date_from, date_to, scope, billing_model, charge_rate, zoll_reported_at, zoll_reference,
    freistellung_verified, soka_relevant, status, won_at, notes, contract_id, lat, lng,
    site_contact_name, site_contact_phone, meeting_point, work_start)
  values ('ZAK-VZOR-2026-003', p_kru, 'Bürogebäude Neckarpark — Malerarbeiten', 'construction', 'maliar',
    'Bürogebäude Neckarpark', 'Mercedesstraße 41', 'Stuttgart', '70372', v_m1 + 7, v_d + 45,
    'Malerarbeiten 1.–4. OG.', 'hourly', 36.00, v_m1 + 5, 'MLD-2026-0903362', false, true, 'active', v_m1 + 1,
    'Freistellung odberateľ neoveril — z faktúr zráža 15 % (§48b).', k3, 48.7936, 9.2263,
    'Frau Sabine Keller (Bauleiterin)', '+49 160 9183 2207', 'Baubüro im EG', '07:00')
  returning id into s3;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_address,
    site_city, site_postal_code, date_from, date_to, scope, billing_model, unit_label, charge_rate, freistellung_verified,
    soka_relevant, status, won_at, notes, contract_id, quote_id, lat, lng, site_contact_name, site_contact_phone, work_start)
  values ('ZAK-VZOR-2026-004', p_kru, 'Klinikum Nord — Fliesenarbeiten', 'construction', 'obkladac',
    'Klinikum Nord, Bettenhaus', 'Auerbachstraße 110', 'Stuttgart', '70376', v_d + 14, v_d + 134,
    'Wand- und Bodenfliesen Bettenhaus.', 'hourly', null, 37.00, false, true, 'won', v_d - 3,
    'Vyhraná, zmluva poslaná na podpis. Nastupujú Novotný a Kiss, tretieho hľadáme.', k4, q3,
    48.8247, 9.2071, 'Herr Uwe Seidel (Polier)', '+49 171 4402 618', '07:00')
  returning id into s4;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_city,
    site_postal_code, date_from, date_to, scope, billing_model, unit_label, soka_relevant, status, notes, contract_id,
    quote_id, lat, lng)
  values ('ZAK-VZOR-2026-005', p_sch, 'Fassadensanierung Gostenhof', 'construction', 'omietkar',
    'Fassade Gostenhof', 'Nürnberg', '90443', v_d + 30, v_d + 150, 'WDVS und Oberputz.', 'unit', 'm²', true,
    'negotiation', 'Rokuje sa: my 19,50 €/m², odberateľ chce 18 €/m².', k5, q4, 49.4483, 11.0587)
  returning id into s5;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_city, date_from, date_to,
    billing_model, charge_rate, status, notes, quote_id)
  values ('ZAK-VZOR-2026-006', p_wag, 'Haustechnik Kreuzhof — Montage', 'construction', 'montaznik',
    'Regensburg', v_d + 45, v_d + 165, 'hourly', 38.00, 'draft', 'Príprava — chýba výkaz výmer.', q7)
  returning id into s6;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_name, site_address,
    site_city, site_postal_code, date_from, date_to, scope, billing_model, charge_rate, fixed_price, zoll_reported_at,
    zoll_reference, freistellung_verified, soka_relevant, status, won_at, completed_at, contract_id, lat, lng)
  values ('ZAK-VZOR-2026-007', p_hof, 'Lagerhalle Freiham — Trockenbau', 'construction', 'trockenbau',
    'Lagerhalle Freiham', 'Hans-Steinkohl-Straße 9', 'München', '81249', v_m3 + 1, v_m1 + 14,
    'Trennwände Bürotrakt.', 'hourly', 38.00, null, v_m3 - 2, 'MLD-2026-0617730', true, true, 'completed',
    v_m3 - 10, (v_m1 + 15)::timestamptz, k6, 48.1338, 11.4097)
  returning id into s7;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_city, date_from, date_to,
    billing_model, charge_rate, status, notes, quote_id)
  values ('ZAK-VZOR-2026-008', p_sch, 'Wohnpark Schweinau — Putzarbeiten', 'construction', 'omietkar',
    'Nürnberg', v_m1 + 10, v_d + 60, 'hourly', 36.00, 'lost', 'Prehratá na cene, pozri ponuku PON-VZOR-2026-005.', q5)
  returning id into s8;
  insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade, site_city, date_from, date_to,
    billing_model, fixed_price, status, notes, contract_id)
  values ('ZAK-VZOR-2026-009', p_wag, 'Hotel Altstadt — Innenausbau', 'construction', 'trockenbau',
    'Regensburg', v_m1 + 15, v_d + 90, 'fixed', 48000.00, 'cancelled', 'Investor stavbu zastavil.', k8)
  returning id into s9;

  -- ── Ubytovania (katalóg) ───────────────────────────────────────────────────
  insert into danubra_accommodations (name, type, country, city, postal_code, address, lat, lng, beds, rooms, max_persons,
    price_per_bed_night, price_week, price_month, min_nights, amenities, van_parking, highway_distance_km, invoice_payment,
    vat_regime, owner_name, owner_phone, owner_whatsapp, owner_email, owner_language, verification_status, source,
    last_contact_at, notes, access_door_code, access_key_location, wifi_ssid, wifi_password, gate_code, room_number, floor,
    house_rules, deposit_amount, deposit_holder, checkin_info, checkout_info)
  values ('Pension Sonnenhof', 'pension', 'DE', 'München', '81369', 'Boschetsrieder Straße 58', 48.1012, 11.5297,
    6, 3, 6, 22.00, 140.00, 1350.00, 7, array['kitchen', 'washing_machine', 'wifi', 'bed_linen'], true, 4.5, true,
    null, 'Frau Monika Huber', '+49 89 7234 115', true, 'pension@sonnenhof.example', 'de', 'verified',
    'mein-monteurzimmer.de', now() - interval '6 days', 'Majiteľka vystavuje faktúru mesačne.',
    '4711#', 'Kľúčová schránka vľavo od vchodu, kód 0815', 'Sonnenhof-Gast', 'Monteur2026!', null,
    'Izby 1, 2, 3', '1. poschodie', 'Nočný kľud od 22:00. Nefajčiť v izbách. Topánky nechávať pri vchode.',
    300.00, 'Frau Huber', 'Príchod od 15:00, pri neskoršom príchode zavolajte vopred.', 'Odchod do 10:00, kľúče do schránky.')
  returning id into ac1;
  insert into danubra_accommodations (name, type, country, city, postal_code, address, lat, lng, beds, rooms, max_persons,
    price_month, min_nights, amenities, van_parking, invoice_payment, owner_name, owner_phone, owner_whatsapp,
    owner_language, verification_status, source, notes, access_door_code, access_key_location, wifi_ssid, wifi_password,
    room_number, floor, house_rules, deposit_amount, deposit_holder, checkin_info, checkout_info)
  values ('Ferienwohnung Keller', 'wohnung', 'DE', 'Stuttgart', '70374', 'Waiblinger Straße 87', 48.8039, 9.2348,
    3, 2, 3, 980.00, 30, array['kitchen', 'washing_machine', 'wifi', 'tv'], false, true, 'Herr Rolf Keller',
    '+49 711 5520 914', false, 'de', 'verified', 'deutschland-monteurzimmer.de', 'Byt v suteréne rodinného domu.',
    '2580', 'U majiteľa na prízemí', 'Keller-FeWo', 'Neckar#87', 'Byt č. 2', 'suterén',
    'Smeti triediť, žltý kôš v stredu.', 200.00, 'Herr Keller',
    'Kľúče odovzdá pán Keller osobne, zavolajte mu deň vopred.', 'Byt odovzdať upratovaný.')
  returning id into ac2;
  insert into danubra_accommodations (name, type, country, city, postal_code, address, lat, lng, beds, rooms, max_persons,
    price_per_bed_night, price_month, amenities, van_parking, invoice_payment, owner_name, owner_phone, owner_whatsapp,
    owner_language, verification_status, source, notes, access_door_code, wifi_ssid, wifi_password, room_number,
    checkin_info)
  values ('Monteurzimmer Gersthofen', 'zimmer', 'DE', 'Gersthofen', '86368', 'Augsburger Straße 21', 48.4237, 10.8786,
    4, 2, 4, 19.00, 1140.00, array['kitchen', 'wifi'], true, false, 'Herr Karl Bauer', '+49 821 2490 337', true, 'de',
    'prices_confirmed', 'monteur-zimmer.info', 'Platba v hotovosti, faktúru nevystaví.', '1357', 'Gersthofen-Zimmer',
    'Zimmer21', 'Izba 4', 'Kód od vchodu príde SMS deň pred príchodom.')
  returning id into ac3;
  insert into danubra_accommodations (name, type, country, city, postal_code, address, beds, rooms, max_persons,
    price_month, amenities, van_parking, owner_name, owner_phone, owner_language, verification_status, source,
    last_contact_at, notes)
  values ('Haus am Wöhrder See', 'haus', 'DE', 'Nürnberg', '90489', 'Veilhofstraße 12', 8, 4, 8, 2400.00,
    array['kitchen', 'washing_machine', 'wifi', 'tv', 'private_bathroom'], true, 'Frau Ingrid Roth', '+49 911 5590 230',
    'de', 'contacted', 'deutschland-monteurzimmer.de', now() - interval '3 days',
    'Pre fasádu Gostenhof, ak ju vyhráme. Čaká sa na cenu za 4 osoby.')
  returning id into ac4;
  insert into danubra_accommodations (name, type, country, city, postal_code, beds, max_persons, price_per_bed_night,
    verification_status, source, notes)
  values ('Hostel Regensburg Ost', 'hostel', 'DE', 'Regensburg', '93055', 20, 20, 24.00, 'new', 'Google',
    'Nájdené pri hľadaní pre Kreuzhof, zatiaľ neoslovené.')
  returning id into ac5;
  insert into danubra_accommodations (name, type, country, city, beds, max_persons, price_month, owner_name,
    owner_phone, verification_status, source, notes)
  values ('Zimmer Krause', 'zimmer', 'DE', 'Augsburg', 3, 3, 1500.00, 'Herr Günter Krause', '+49 821 3381 006',
    'not_cooperating', 'monteur-zimmer.info', 'Dvakrát zrušil rezerváciu deň pred príchodom.')
  returning id into ac6;

  -- ── Ubytovanie pri zákazkách a pobyty ─────────────────────────────────────
  insert into danubra_subcontract_accommodations (subcontract_id, accommodation_id, name, address, city, maps_url,
    capacity, price_monthly, date_from, date_to, note, lat, lng, keys_note, house_rules)
  values (s1, ac1, 'Pension Sonnenhof', 'Boschetsrieder Straße 58, 81369 München', 'München',
    'https://maps.google.com/?q=48.1012,11.5297', 4, 1350.00, v_m2 + 13, null,
    'Na stavbu 12 minút autom.', 48.1012, 11.5297, 'Kľúčová schránka vľavo od vchodu, kód 0815.',
    'Nočný kľud od 22:00. Nefajčiť v izbách.')
  returning id into l1;
  insert into danubra_subcontract_accommodations (subcontract_id, accommodation_id, name, address, city, capacity,
    price_monthly, date_from, note, lat, lng, keys_note)
  values (s3, ac2, 'Ferienwohnung Keller', 'Waiblinger Straße 87, 70374 Stuttgart', 'Stuttgart', 3, 980.00, v_m1 + 6,
    'Byt pre dvoch, refakturuje sa odberateľovi.', 48.8039, 9.2348, 'Kľúče u pána Kellera na prízemí.')
  returning id into l2;
  insert into danubra_subcontract_accommodations (subcontract_id, accommodation_id, name, address, city, capacity,
    price_monthly, date_from, lat, lng, keys_note)
  values (s2, ac3, 'Monteurzimmer Gersthofen', 'Augsburger Straße 21, 86368 Gersthofen', 'Gersthofen', 2, 1140.00,
    v_m1 - 1, 48.4237, 10.8786, 'Kód od vchodu 1357.')
  returning id into l3;
  insert into danubra_subcontract_accommodations (subcontract_id, accommodation_id, name, city, capacity,
    price_monthly, date_from, date_to, note)
  values (s7, ac1, 'Pension Sonnenhof', 'München', 2, 900.00, v_m3, v_m1 + 15, 'Ukončené spolu so zákazkou.')
  returning id into l4;

  -- Kováčik a Baláž spia v jednej izbe, Hudec vedľa; Dvořák so Šťastným
  -- zdieľajú byt, Szabó s Nagyom izbu. Novotný má lôžko od nástupu.
  insert into danubra_stays (worker_id, lodging_id, date_from, date_to, note)
  values
    (w_kov, l1, v_m2 + 13, null, 'Izba 1 — spolu s Petrom Balážom.'),
    (w_bal, l1, v_m2 + 13, null, 'Izba 1 — spolu s Jánom Kováčikom.'),
    (w_hud, l1, v_m2 + 13, null, 'Izba 2.'),
    (w_nov, l1, v_d + 13, null, 'Izba 3 — od nástupu na Klinikum Nord, kým sa nenájde niečo v Stuttgarte.'),
    (w_dvo, l2, v_m1 + 6, null, 'Spálňa pre dvoch, spolu s Ondřejom Šťastným.'),
    (w_sta, l2, v_m1 + 6, null, 'Spálňa pre dvoch, spolu s Tomášom Dvořákom.'),
    (w_sza, l3, v_m1 - 1, null, 'Izba 4 — spolu s Gáborom Nagyom.'),
    (w_nag, l3, v_m1 - 1, null, 'Izba 4 — spolu s Lászlóom Szabóom.'),
    (w_pol, l4, v_m3, v_m1 + 15, null);

  -- ── Nasadenia ──────────────────────────────────────────────────────────────
  -- S partiou aj bez nej; kontakt na stavbe raz cez vedúceho partie
  -- (contact_worker_id), raz cez nemeckého poliera (contact_name/phone).
  insert into danubra_assignments (subcontract_id, worker_id, crew_id, date_from, date_to, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, notes, contact_note)
  values (s1, w_kov, c_kov, v_m2 + 14, null, 'predak', 38.50, 22.00, 2.50, 'active', v_m2 + 14,
    'Vedie partiu, preberá pokyny od poliera.', 'Ráno o 6:15 porada pri kontajneri.')
  returning id into a1;
  insert into danubra_assignments (subcontract_id, worker_id, crew_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_worker_id, contact_note)
  values (s1, w_bal, c_kov, v_m2 + 14, 'pracovnik', 38.50, 21.00, 2.50, 'active', v_m2 + 14, w_kov,
    'Všetko cez Jána Kováčika, hovorí po nemecky.')
  returning id into a2;
  insert into danubra_assignments (subcontract_id, worker_id, crew_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_worker_id)
  values (s1, w_hud, c_kov, v_m2 + 14, 'pracovnik', 38.50, 19.00, 2.50, 'active', v_m2 + 14, w_kov)
  returning id into a3;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, date_to, role, charge_rate, worker_rate,
    overhead_per_hour, status, notes, contact_name, contact_phone, contact_note)
  values (s4, w_nov, v_d + 14, null, 'pracovnik', 37.00, 21.00, 2.50, 'planned',
    'Prvý deň hlásiť sa u poliera, priniesť vlastnú miešačku a lasery.',
    'Herr Uwe Seidel (Polier)', '+49 171 4402 618', 'Rozumie len po nemecky, pomaly a jednoducho. Kancelária v kontajneri č. 3.')
  returning id into a4;
  insert into danubra_assignments (subcontract_id, worker_id, crew_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_note)
  values (s2, w_sza, c_sza, v_m1, 'predak', 41.00, 24.00, 2.00, 'active', v_m1, 'Výkresy berie od pána Neumanna v kancelárii haly.')
  returning id into a5;
  insert into danubra_assignments (subcontract_id, worker_id, crew_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_worker_id)
  values (s2, w_nag, c_sza, v_m1, 'pracovnik', 41.00, 20.00, 2.00, 'active', v_m1, w_sza)
  returning id into a6;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_name, contact_phone, contact_note)
  values (s3, w_dvo, v_m1 + 7, 'predak', 36.00, 21.50, 2.50, 'active', v_m1 + 7,
    'Frau Sabine Keller (Bauleiterin)', '+49 160 9183 2207', 'Je na stavbe od 7:00 do 15:00, potom len na mobile.')
  returning id into a7;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, contact_worker_id, contact_note)
  values (s3, w_sta, v_m1 + 7, 'pracovnik', 36.00, 22.50, 2.50, 'active', v_m1 + 7, w_dvo, 'Pokyny cez Tomáša Dvořáka.')
  returning id into a8;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, date_to, role, charge_rate, worker_rate,
    overhead_per_hour, status, started_at, ended_reason)
  values (s7, w_pol, v_m3 + 1, v_m1 + 14, 'pracovnik', 38.00, 21.00, 2.50, 'ended', v_m3 + 1,
    'Zákazka dokončená a odovzdaná.')
  returning id into a9;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, role, charge_rate, worker_rate,
    overhead_per_hour, status, notes, contact_name, contact_phone)
  values (s4, w_kis, v_d + 14, 'pracovnik', 37.00, 21.50, 2.50, 'planned', 'Nastupuje spolu s Novotným.',
    'Herr Uwe Seidel (Polier)', '+49 171 4402 618')
  returning id into a10;
  insert into danubra_assignments (subcontract_id, worker_id, date_from, role, charge_rate, worker_rate, status, notes)
  values (s9, w_sim, v_m1 + 15, 'pracovnik', 37.00, 25.00, 'cancelled', 'Zrušené spolu so zákazkou Hotel Altstadt.')
  returning id into a11;

  -- Ručný bod checklistu „pokyny odovzdané" — raz odškrtnutý, raz nie.
  insert into danubra_assignment_checks (assignment_id, rule_key, required, done, done_at, done_by, note)
  values
    (a1, 'instructions', true, true, (v_m2 + 13)::timestamptz + interval '18 hours', v_admin,
     'Infolist odovzdaný osobne, prešli sme bránu B aj kľúče od penziónu.'),
    (a7, 'instructions', true, true, (v_m1 + 6)::timestamptz + interval '17 hours', v_admin, 'Poslané cez WhatsApp, potvrdil.'),
    (a4, 'instructions', true, false, null, null, 'Poslať infolist týždeň pred nástupom.');

  insert into danubra_checklist_items (assignment_id, step_order, title, description, required, done, done_at, done_by, note)
  values
    (a4, 1, 'Podpísaná zmluva o dielo', 'Werkvertrag s definovaným dielom, nie hodinami.', true, true, now() - interval '4 days', 'Michaela', null),
    (a4, 2, 'Platné A1', 'Vystavuje ČSSZ, platí od dňa nástupu.', true, true, now() - interval '2 days', 'Michaela', 'A1 od nástupu.'),
    (a4, 3, 'Doklad totožnosti a kópia', null, true, true, now() - interval '6 days', 'Michaela', null),
    (a4, 4, 'Zabezpečené ubytovanie', 'Adresa, kontakt a spôsob prevzatia kľúčov.', true, true, now() - interval '1 day', 'Štefan', 'Pension Sonnenhof, izba 3.'),
    (a4, 5, 'Vyriešená doprava na miesto', null, true, false, null, null, 'Ide vlakom Brno–Stuttgart, lístok ešte nemá.'),
    (a4, 6, 'Odovzdané pokyny pracovníkovi', 'Adresa, kontakt na predáka, čas nástupu, čo si priniesť.', true, false, null, null, null);

  -- ── Obdobia (otvorené; uzavrú sa po zapísaní hodín) ────────────────────────
  insert into danubra_periods (subcontract_id, period_from, period_to, status, note) values
    (s7, v_m3 + 1, v_m2 - 1, 'open', null) returning id into ps7a;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s7, v_m2, v_m1 - 1, 'open') returning id into ps7b;
  insert into danubra_periods (subcontract_id, period_from, period_to, status, note) values
    (s7, v_m1, v_m1 + 14, 'open', 'Posledné obdobie — zákazka skončila v polovici mesiaca.') returning id into ps7c;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s1, v_m2 + 14, v_m1 - 1, 'open') returning id into ps1a;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s1, v_m1, v_m0 - 1, 'open') returning id into ps1b;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s1, v_m0, v_m0e, 'open') returning id into ps1c;
  insert into danubra_periods (subcontract_id, period_from, period_to, status, note) values
    (s2, v_m1, v_m0 - 1, 'open', 'Treba uzavrieť — hodiny sú schválené, chýba len kliknutie.') returning id into ps2a;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s2, v_m0, v_m0e, 'open') returning id into ps2b;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s3, v_m1 + 7, v_m0 - 1, 'open') returning id into ps3a;
  insert into danubra_periods (subcontract_id, period_from, period_to, status) values
    (s3, v_m0, v_m0e, 'open') returning id into ps3b;

  -- ── Hodiny ─────────────────────────────────────────────────────────────────
  -- Pondelok až piatok, 10 h (piatok 8 h), prvý deň cesta. Posledný týždeň
  -- ešte nie je schválený — presne tak to vyzerá v pondelok ráno.
  -- Hudec mal jeden deň voľno (u lekára), Nagy jeden piatok neprišiel.
  insert into danubra_timesheets (assignment_id, worker_id, work_date, hours, activity_type, description,
    approved, approved_at, source, time_from, time_to)
  select a.id, a.worker_id, g::date,
    case when g::date = a.date_from then 8 when extract(isodow from g) = 5 then 8 else 10 end,
    case when g::date = a.date_from then 'travel'
         when s.work_type = 'workshop' then 'workshop' else 'construction' end,
    case when g::date = a.date_from then 'Cesta na stavbu a nástup' end,
    g::date < v_d - 6,
    case when g::date < v_d - 6 then (g::date + 3)::timestamptz + interval '9 hours' end,
    'manual', '07:00'::time,
    '07:30'::time + make_interval(hours => case when g::date = a.date_from then 8 when extract(isodow from g) = 5 then 8 else 10 end)
  from danubra_assignments a
  join danubra_subcontracts s on s.id = a.subcontract_id
  cross join lateral generate_series(a.date_from, least(coalesce(a.date_to, v_d - 1), v_d - 1), interval '1 day') g
  where a.status in ('active', 'ended')
    and extract(isodow from g) between 1 and 5
    and not (a.id = a3 and g::date = v_m1 + 9)
    and not (a.id = a6 and g::date = (select max(x::date) from generate_series(v_m1, v_m0 - 1, interval '1 day') x
                                       where extract(isodow from x) = 5));

  -- Sobota navyše pre partiu Kováčik pred koncom septembra (odberateľ to chcel).
  insert into danubra_timesheets (assignment_id, worker_id, work_date, hours, activity_type, description,
    approved, approved_at, source)
  select a.id, a.worker_id,
    (select max(x::date) from generate_series(v_m1, v_m0 - 1, interval '1 day') x where extract(isodow from x) = 6),
    6, 'construction', 'Sobota na žiadosť poliera — dorobiť 3. OG', true, now() - interval '20 days', 'manual'
  from danubra_assignments a where a.id in (a1, a2);

  -- Uzavrieť obdobia: naviažu sa schválené hodiny a zmrazí sa sadzba.
  perform danubra_close_period(ps7a);
  perform danubra_close_period(ps7b);
  perform danubra_close_period(ps7c);
  perform danubra_close_period(ps1a);
  perform danubra_close_period(ps1b);
  perform danubra_close_period(ps3a);
  update danubra_periods set closed_by = v_admin, note = coalesce(note, 'Uzavreté po kontrole výkazov.')
   where id in (ps7a, ps7b, ps7c, ps1a, ps1b, ps3a);

  -- ── Týždenné výkazy pre odberateľa ────────────────────────────────────────
  -- Dva podpísané (zmrazený stav papiera), jeden uložený a nepodpísaný.
  for v_week_mon, v_t in
    select (date_trunc('week', v_d)::date - 7), 'Podpísané na stavbe, originál odovzdaný polierovi.'
    union all
    select (date_trunc('week', v_d)::date - 14), 'Podpísané, sken v e-maile od pána Brandla.'
  loop
    insert into danubra_hour_sheets (crew_id, subcontract_id, iso_year, iso_week, total_hours, snapshot,
      signed_at, signed_by_name, note)
    select c_kov, s1, extract(isoyear from v_week_mon)::int, extract(week from v_week_mon)::int,
      coalesce(sum(t.hours), 0),
      jsonb_build_object(
        'dni', (select jsonb_agg(to_char(x::date, 'YYYY-MM-DD') order by x)
                  from generate_series(v_week_mon, v_week_mon + 6, interval '1 day') x),
        'riadky', (select jsonb_agg(jsonb_build_object('meno', w.full_name,
                     'hodiny', (select jsonb_agg(coalesce((select sum(t2.hours) from danubra_timesheets t2
                                  where t2.worker_id = w.id and t2.work_date = x::date and t2.assignment_id in (a1, a2, a3)), 0)
                                order by x)
                                from generate_series(v_week_mon, v_week_mon + 6, interval '1 day') x),
                     'spolu', (select coalesce(sum(t3.hours), 0) from danubra_timesheets t3
                                where t3.worker_id = w.id and t3.assignment_id in (a1, a2, a3)
                                  and t3.work_date between v_week_mon and v_week_mon + 6)) order by w.full_name)
                   from danubra_workers w where w.id in (w_kov, w_bal, w_hud)),
        'po_dnoch', (select jsonb_agg(coalesce((select sum(t4.hours) from danubra_timesheets t4
                       where t4.assignment_id in (a1, a2, a3) and t4.work_date = x::date), 0) order by x)
                     from generate_series(v_week_mon, v_week_mon + 6, interval '1 day') x),
        'spolu', coalesce(sum(t.hours), 0),
        'projekt', 'Wohnanlage Isarauen — Trockenbau', 'baustelle', 'Schäftlarnstraße 160, 81371 München',
        'kunde', 'Hofmann Bau GmbH', 'partia', 'Partia Kováčik'),
      (v_week_mon + 4)::timestamptz + interval '14 hours', 'Thomas Brandl', v_t
    from danubra_timesheets t
    where t.assignment_id in (a1, a2, a3) and t.work_date between v_week_mon and v_week_mon + 6;
  end loop;

  insert into danubra_hour_sheets (crew_id, subcontract_id, iso_year, iso_week, total_hours, note)
  select c_sza, s2, extract(isoyear from date_trunc('week', v_d) - interval '7 days')::int,
    extract(week from date_trunc('week', v_d) - interval '7 days')::int, coalesce(sum(t.hours), 0),
    'Pripravený, pán Neumann ho podpíše v piatok.'
  from danubra_timesheets t
  where t.assignment_id in (a5, a6)
    and t.work_date between date_trunc('week', v_d)::date - 7 and date_trunc('week', v_d)::date - 1;

  -- ── Objednávky (od odberateľa a živnostníkom) ──────────────────────────────
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model, rate,
    partner_id, subcontract_id, contract_id, their_ref, received_at, confirmed_at)
  values ('OBJ-VZOR-0001', 'customer', 'confirmed', 'Trockenbau Bauteil A–C, 2.–5. OG',
    'Ständerwände, Beplankung GKB/GKF, Verspachtelung Q2/Q3 laut Leistungsverzeichnis.',
    v_m2 + 14, v_d + 120, 'hourly', 38.50, p_hof, s1, k1, '4500-2026-8871', v_m2 + 4, (v_m2 + 6)::timestamptz)
  returning id into wo1;
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model,
    rate, partner_id, subcontract_id, contract_id, their_ref, received_at)
  values ('OBJ-VZOR-0002', 'customer', 'sent', 'Fliesenarbeiten Bettenhaus, Nassräume', 'Wand- und Bodenfliesen inkl. Abdichtung.',
    v_d + 14, v_d + 134, 'hourly', 37.00, p_kru, s4, k4, 'BST-2026-2214', v_d - 2)
  returning id into wo2;
  insert into danubra_work_orders (order_number, kind, status, title, date_from, date_to, price_model, rate,
    partner_id, subcontract_id, contract_id, their_ref, received_at, confirmed_at, notes)
  values ('OBJ-VZOR-0003', 'customer', 'done', 'Trennwände Bürotrakt Lagerhalle Freiham', v_m3 + 1, v_m1 + 14, 'hourly',
    38.00, p_hof, s7, k6, '4500-2026-6120', v_m3 - 8, (v_m3 - 6)::timestamptz, 'Odovzdané a prevzaté bez vád.')
  returning id into wo3;
  insert into danubra_work_orders (order_number, kind, status, title, date_from, price_model, rate, partner_id, subcontract_id, notes)
  values ('OBJ-VZOR-0004', 'customer', 'draft', 'Rohrmontage Kreuzhof', v_d + 45, 'hourly', 38.00, p_wag, s6,
    'Rozpracovaná — čaká sa na číslo objednávky od odberateľa.');
  insert into danubra_work_orders (order_number, kind, status, title, date_from, price_model, fixed_price, partner_id, subcontract_id, contract_id, their_ref, notes)
  values ('OBJ-VZOR-0005', 'customer', 'cancelled', 'Innenausbau Hotel Altstadt (Pauschale)', v_m1 + 15, 'fixed', 48000.00, p_wag, s9, k8,
    'HA-2026-031', 'Zrušená investorom.');
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model, rate,
    worker_id, assignment_id, subcontract_id, accepted_at)
  values ('OBJ-VZOR-0006', 'worker', 'confirmed', 'Sadrokartón Bauteil A–C, 2.–5. NP',
    'Montáž sadrokartónových priečok a podhľadov podľa výkresov, tmelenie Q2/Q3. Materiál dodá objednávateľ.',
    v_m2 + 14, v_d + 120, 'hourly', 22.00, w_kov, a1, s1, (v_m2 + 12)::timestamptz)
  returning id into wo6;
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model, rate,
    worker_id, assignment_id, subcontract_id)
  values ('OBJ-VZOR-0007', 'worker', 'sent', 'Obklady a dlažby — Klinikum Nord',
    'Obklady stien a dlažba v kúpeľniach izieb, hydroizolácia stierkou.', v_d + 14, v_d + 134, 'hourly', 21.00,
    w_nov, a4, s4);
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model, rate,
    worker_id, assignment_id, subcontract_id, accepted_at, notes)
  values ('OBJ-VZOR-0008', 'worker', 'done', 'Priečky administratívnej časti — Freiham', 'Priečky a sociálky.',
    v_m3 + 1, v_m1 + 14, 'hourly', 21.00, w_pol, a9, s7, (v_m3 - 1)::timestamptz, 'Vybavené, vyfakturované.')
  returning id into wo8;
  insert into danubra_work_orders (order_number, kind, status, title, scope, date_from, date_to, price_model,
    unit_label, unit_price, worker_id, assignment_id, subcontract_id)
  values ('OBJ-VZOR-0009', 'worker', 'draft', 'Zváranie zábradlí bühne — doplnok', 'Zábradlie na bühne 2. úrovne, kútové zvary.',
    v_d + 3, v_d + 20, 'unit', 'm', 14.50, w_sza, a5, s2);

  -- ── Faktúry odberateľom ────────────────────────────────────────────────────
  -- Číselný rad VZOR-…, aby sa nepobil s ostrým radom z Nastavení.
  -- Stavy draft, pending_approval, approved, issued, sent, paid, overdue,
  -- cancelled (v2) a draft_pending_approval (v1, ubytovacia agentúra).
  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps7a;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, work_order_id, type,
    issue_date, due_date, delivery_date, total, amount_net, withholding_pct, withholding_amount, currency, vat_regime,
    status, paid_at, billing_period_from, billing_period_to, approved_by, approved_at, sent_at)
  values ('VZOR-2026-0001', p_hof, s7, ps7a, k6, wo3, 'standard', v_m2 + 2, v_m2 + 32, v_m2 - 1, v_amt, v_amt, 0, 0, 'EUR',
    'reverse_charge', 'paid', (v_m2 + 27)::timestamptz, v_m3 + 1, v_m2 - 1, v_admin, (v_m2 + 1)::timestamptz,
    (v_m2 + 2)::timestamptz)
  returning id into i1;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i1, 'Trockenbauarbeiten Lagerhalle Freiham gem. Werkvertrag ZML-VZOR-2026-006, Leistungszeitraum '
    || to_char(v_m3 + 1, 'DD.MM.') || '–' || to_char(v_m2 - 1, 'DD.MM.YYYY'), v_hrs, 'h', 38.00, v_amt);

  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps7b;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, type, issue_date,
    due_date, delivery_date, total, amount_net, currency, vat_regime, status, paid_at, billing_period_from,
    billing_period_to, approved_by, approved_at, sent_at)
  values ('VZOR-2026-0002', p_hof, s7, ps7b, k6, 'standard', v_m1 + 1, v_m1 + 31, v_m1 - 1, v_amt, v_amt, 'EUR',
    'reverse_charge', 'paid', (v_m1 + 35)::timestamptz, v_m2, v_m1 - 1, v_admin, v_m1::timestamptz, (v_m1 + 1)::timestamptz)
  returning id into i2;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i2, 'Trockenbauarbeiten Lagerhalle Freiham, Leistungszeitraum ' || to_char(v_m2, 'MM/YYYY'), v_hrs, 'h', 38.00, v_amt);

  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps7c;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, type, issue_date,
    due_date, delivery_date, total, amount_net, currency, vat_regime, status, billing_period_from, billing_period_to,
    approved_by, approved_at, sent_at)
  values ('VZOR-2026-0003', p_hof, s7, ps7c, k6, 'standard', v_m1 + 16, v_d - 9, v_m1 + 14, v_amt, v_amt, 'EUR',
    'reverse_charge', 'overdue', v_m1, v_m1 + 14, v_admin, (v_m1 + 16)::timestamptz, (v_m1 + 16)::timestamptz)
  returning id into i3;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i3, 'Trockenbauarbeiten Lagerhalle Freiham, Schlussrechnung ' || to_char(v_m1, 'DD.MM.') || '–'
    || to_char(v_m1 + 14, 'DD.MM.YYYY'), v_hrs, 'h', 38.00, v_amt);

  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps1a;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, work_order_id, type,
    issue_date, due_date, delivery_date, total, amount_net, currency, vat_regime, status, paid_at, billing_period_from,
    billing_period_to, approved_by, approved_at, sent_at)
  values ('VZOR-2026-0004', p_hof, s1, ps1a, k1, wo1, 'standard', v_m1 + 1, v_m1 + 31, v_m1 - 1, v_amt, v_amt, 'EUR',
    'reverse_charge', 'paid', (v_m1 + 26)::timestamptz, v_m2 + 14, v_m1 - 1, v_admin, v_m1::timestamptz, (v_m1 + 1)::timestamptz)
  returning id into i4;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i4, 'Trockenbauarbeiten Wohnanlage Isarauen gem. Bestellung 4500-2026-8871, Leistungszeitraum '
    || to_char(v_m2 + 14, 'DD.MM.') || '–' || to_char(v_m1 - 1, 'DD.MM.YYYY'), v_hrs, 'h', 38.50, v_amt);

  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps1b;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, work_order_id, type,
    issue_date, due_date, delivery_date, total, amount_net, currency, vat_regime, status, billing_period_from,
    billing_period_to, approved_by, approved_at, sent_at)
  values ('VZOR-2026-0005', p_hof, s1, ps1b, k1, wo1, 'standard', v_m0 + 2, v_m0 + 32, v_m0 - 1, v_amt, v_amt, 'EUR',
    'reverse_charge', 'sent', v_m1, v_m0 - 1, v_admin, (v_m0 + 1)::timestamptz, (v_m0 + 2)::timestamptz)
  returning id into i5;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i5, 'Trockenbauarbeiten Wohnanlage Isarauen, Leistungszeitraum ' || to_char(v_m1, 'MM/YYYY'), v_hrs, 'h', 38.50, v_amt);

  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, contract_id, type, issue_date, due_date,
    delivery_date, total, amount_net, currency, vat_regime, status, approved_by, approved_at)
  values ('VZOR-2026-0006', p_hof, s1, k1, 'standard', v_d - 1, v_d + 29, v_d - 3, 1155.00, 1155.00, 'EUR',
    'reverse_charge', 'issued', v_admin, (v_d - 2)::timestamptz)
  returning id into i6;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i6, 'Regiestunden Rückbau Altständerwerk 3. OG laut Stundenzettel Nr. 14', 30, 'h', 38.50, 1155.00);

  select amount_charged, hours_construction + hours_workshop + hours_travel into v_amt, v_hrs from danubra_periods where id = ps3a;
  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, period_id, contract_id, type, issue_date,
    due_date, delivery_date, total, amount_net, withholding_pct, withholding_amount, currency, vat_regime, status,
    billing_period_from, billing_period_to)
  values ('VZOR-2026-0007', p_kru, s3, ps3a, k3, 'standard', v_d, v_d + 21, v_m0 - 1, v_amt,
    v_amt - round(v_amt * 0.15, 2), 15, round(v_amt * 0.15, 2), 'EUR', 'reverse_charge', 'pending_approval',
    v_m1 + 7, v_m0 - 1)
  returning id into i7;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i7, 'Malerarbeiten Bürogebäude Neckarpark gem. Werkvertrag ZML-VZOR-2026-003, Leistungszeitraum '
    || to_char(v_m1 + 7, 'DD.MM.') || '–' || to_char(v_m0 - 1, 'DD.MM.YYYY'), v_hrs, 'h', 36.00, v_amt);

  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, contract_id, type, issue_date, due_date,
    delivery_date, total, amount_net, currency, vat_regime, status, approved_by, approved_at)
  values ('VZOR-2026-0008', p_kru, s3, k3, 'standard', v_d - 1, v_d + 20, v_m0 - 1, 980.00, 980.00, 'EUR',
    'reverse_charge', 'approved', v_admin, (v_d - 1)::timestamptz)
  returning id into i8;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i8, 'Weiterberechnung Unterkunft Ferienwohnung Keller, ' || to_char(v_m1, 'MM/YYYY') || ' (2 Personen)',
    1, 'mes', 980.00, 980.00);

  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, contract_id, type, issue_date, due_date,
    delivery_date, total, amount_net, currency, vat_regime, status)
  values ('VZOR-2026-0009', p_neu, s2, k2, 'standard', v_d, v_d + 30, v_d, 615.00, 615.00, 'EUR', 'reverse_charge', 'draft')
  returning id into i9;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total) values
    (i9, 'Zusätzliche Schweißarbeiten Treppenwange, Regie', 15, 'h', 41.00, 615.00);

  insert into danubra_invoices (invoice_number, partner_id, subcontract_id, contract_id, type, issue_date, due_date,
    delivery_date, total, amount_net, currency, vat_regime, status)
  values ('VZOR-2026-0010', p_wag, s9, k8, 'standard', v_m1 + 16, v_m1 + 46, v_m1 + 16, 1850.00, 1850.00, 'EUR',
    'reverse_charge', 'cancelled')
  returning id into i10;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total) values
    (i10, 'Baustelleneinrichtung Hotel Altstadt (storniert, Projekt eingestellt)', 1, 'pausal', 1850.00, 1850.00);

  -- Obdobia, z ktorých odišla faktúra, sú vyfakturované.
  update danubra_periods set status = 'invoiced' where id in (ps7a, ps7b, ps7c, ps1a, ps1b);

  insert into danubra_invoice_reminders (invoice_id, level, sent_at, deadline, amount, channel, note, created_by)
  select i3, 1, now() - interval '3 days', v_d + 4, total, 'email',
    'Zahlungserinnerung an Herrn Hofmann, telefonisch angekündigt.', v_admin
  from danubra_invoices where id = i3;

  -- ── Prijaté faktúry ────────────────────────────────────────────────────────
  -- Suma sa berie zo schválených hodín, aby kontrola (danubra_bill_check)
  -- sedela; Hudec si napísal o 120 € viac, a tak je v spore.
  select coalesce(sum(t.hours * t.rate_used), 0) into v_amt from danubra_timesheets t where t.period_id = ps1a and t.worker_id = w_kov;
  insert into danubra_bills (bill_number, worker_id, assignment_id, period_id, subcontract_id, issue_date, due_date,
    delivery_date, amount, status, checked_at, checked_by, approved_at, approved_by, paid_at, note, supplier_name,
    supplier_ico, supplier_iban, variable_symbol, category, source)
  values ('2026018', w_kov, a1, ps1a, s1, v_m1 + 2, v_m1 + 16, v_m1 - 1, v_amt, 'paid', (v_m1 + 3)::timestamptz, v_admin,
    (v_m1 + 4)::timestamptz, v_admin, (v_m1 + 12)::timestamptz, 'Sedí s výkazom.', 'Ján Kováčik', '50123456',
    'SK1209000000005123874631', '2026018', 'work', 'manual')
  returning id into b1;

  select coalesce(sum(t.hours * t.rate_used), 0) into v_amt from danubra_timesheets t where t.period_id = ps1b and t.worker_id = w_bal;
  insert into danubra_bills (bill_number, worker_id, assignment_id, period_id, subcontract_id, issue_date, due_date,
    delivery_date, amount, status, checked_at, checked_by, approved_at, approved_by, supplier_name, supplier_ico,
    supplier_iban, variable_symbol, category, source, storage_path)
  values ('FA-2026-09', w_bal, a2, ps1b, s1, v_m0 + 1, v_d + 5, v_m0 - 1, v_amt, 'approved', (v_m0 + 3)::timestamptz,
    v_admin, (v_m0 + 4)::timestamptz, v_admin, 'Peter Baláž', '51234987', 'SK1611000000002941837265', '202609',
    'work', 'manual', null)
  returning id into b2;

  select coalesce(sum(t.hours * t.rate_used), 0) into v_amt from danubra_timesheets t where t.period_id = ps1b and t.worker_id = w_hud;
  insert into danubra_bills (bill_number, worker_id, assignment_id, period_id, subcontract_id, issue_date, due_date,
    delivery_date, amount, status, note, supplier_name, supplier_ico, supplier_iban, variable_symbol, category, source)
  values ('3/2026', w_hud, a3, ps1b, s1, v_m0 + 2, v_d + 3, v_m0 - 1, v_amt + 120, 'received',
    'Na faktúre je o 120 € viac, než dávajú schválené hodiny — fakturoval aj deň u lekára.', 'Marek Hudec', '53318764',
    'SK0302000000004518293746', '32026', 'work', 'manual')
  returning id into b3;

  select coalesce(sum(t.hours), 0) * 24.00 into v_amt_sza from danubra_timesheets t
   where t.assignment_id = a5 and t.work_date between v_m1 and v_m0 - 1 and t.approved;
  insert into danubra_bills (bill_number, worker_id, assignment_id, subcontract_id, issue_date, due_date, delivery_date,
    amount, status, supplier_name, variable_symbol, category, source, note)
  values ('SZL-2026-09', w_sza, a5, s2, v_m0 + 2, v_d + 6, v_m0 - 1, v_amt_sza, 'received', 'László Szabó', '202609',
    'work', 'manual', 'Obdobie zatiaľ nie je uzavreté — skontrolovať po uzavretí.')
  returning id into b4;

  select coalesce(sum(t.hours), 0) * 20.00 into v_amt from danubra_timesheets t
   where t.assignment_id = a6 and t.work_date between v_m1 and v_m0 - 1 and t.approved;
  insert into danubra_bills (bill_number, worker_id, assignment_id, subcontract_id, issue_date, due_date, delivery_date,
    amount, status, checked_at, checked_by, supplier_name, variable_symbol, category, source, note)
  values ('NG-09/2026', w_nag, a6, s2, v_m0 + 3, v_d + 7, v_m0 - 1, v_amt, 'checked', now() - interval '2 days', v_admin,
    'Gábor Nagy', '92026', 'work', 'manual', 'Skontrolované, čaká na schválenie adminom.')
  returning id into b5;

  -- Faktúry za živnostníka (self-billing): jedna poslaná na potvrdenie, jedna návrh.
  select coalesce(sum(t.hours * t.rate_used), 0), coalesce(sum(t.hours), 0) into v_amt, v_hrs
    from danubra_timesheets t where t.period_id = ps3a and t.worker_id = w_dvo;
  insert into danubra_bills (bill_number, worker_id, assignment_id, period_id, subcontract_id, issue_date, due_date,
    delivery_date, amount, status, approved_at, approved_by, supplier_name, supplier_ico, supplier_dic, supplier_iban,
    variable_symbol, category, source, lines, confirm_token, sent_to_worker_at)
  values ('TD-' || to_char(v_d, 'YYYY') || '-001', w_dvo, a7, ps3a, s3, v_d - 2, v_d + 12, v_m0 - 1, v_amt, 'self_sent',
    (v_d - 2)::timestamptz, v_admin, 'Tomáš Dvořák', '07654321', 'CZ8705301234', 'CZ1708000000002618394057',
    right(to_char(v_d, 'YYYY') || '001', 10), 'work', 'self_billing',
    jsonb_build_array(jsonb_build_object('description', 'Maliarske práce — Bürogebäude Neckarpark', 'activity', 'construction',
      'from', to_char(v_m1 + 7, 'YYYY-MM-DD'), 'to', to_char(v_m0 - 1, 'YYYY-MM-DD'), 'hours', v_hrs, 'rate', 21.50, 'total', v_amt)),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), now() - interval '2 days')
  returning id into b6;

  select coalesce(sum(t.hours * t.rate_used), 0), coalesce(sum(t.hours), 0) into v_amt, v_hrs
    from danubra_timesheets t where t.period_id = ps3a and t.worker_id = w_sta;
  insert into danubra_bills (worker_id, assignment_id, period_id, subcontract_id, delivery_date, amount, status,
    supplier_name, category, source, lines)
  values (w_sta, a8, ps3a, s3, v_m0 - 1, v_amt, 'self_draft', 'OS Montáže s.r.o.', 'work', 'self_billing',
    jsonb_build_array(jsonb_build_object('description', 'Maliarske práce — Bürogebäude Neckarpark', 'activity', 'construction',
      'from', to_char(v_m1 + 7, 'YYYY-MM-DD'), 'to', to_char(v_m0 - 1, 'YYYY-MM-DD'), 'hours', v_hrs, 'rate', 22.50, 'total', v_amt)));

  select coalesce(sum(t.hours * t.rate_used), 0) into v_amt from danubra_timesheets t where t.period_id = ps7c and t.worker_id = w_pol;
  insert into danubra_bills (bill_number, worker_id, assignment_id, period_id, subcontract_id, issue_date, due_date,
    delivery_date, amount, status, approved_at, approved_by, paid_at, supplier_name, variable_symbol, category, source)
  values ('RP-2026-007', w_pol, a9, ps7c, s7, v_m1 + 16, v_m1 + 30, v_m1 + 14, v_amt, 'paid', (v_m1 + 17)::timestamptz,
    v_admin, (v_m1 + 28)::timestamptz, 'Roman Polák', '2026007', 'work', 'manual')
  returning id into b11;

  -- Dodávatelia: na kontrolu (prečítané z PDF), dobropis na kontrolu, chyba
  -- čítania, prijatá bloček z pumpy a zahodená duplicita.
  insert into danubra_bills (bill_number, subcontract_id, issue_date, due_date, delivery_date, amount, status,
    supplier_name, supplier_iban, variable_symbol, category, source, extract_status, extracted, extracted_at)
  values ('RE-2026-1047', s1, v_d - 2, v_d + 12, v_m0 - 1, 1350.00, 'review', 'Pension Sonnenhof', 'DE66701500000001234567',
    '20261047', 'accommodation', 'pdf', 'done',
    jsonb_build_object('_file', 'Rechnung_Sonnenhof_2026-1047.pdf', 'doc_type', 'invoice', 'number', 'RE-2026-1047',
      'variable_symbol', '20261047', 'issue_date', to_char(v_d - 2, 'YYYY-MM-DD'), 'due_date', to_char(v_d + 12, 'YYYY-MM-DD'),
      'currency', 'EUR', 'total', 1350.00, 'vat', 88.32, 'base', 1261.68, 'category', 'accommodation',
      'supplier', jsonb_build_object('name', 'Pension Sonnenhof', 'country', 'DE', 'iban', 'DE66701500000001234567',
        'address', 'Boschetsrieder Straße 58, 81369 München'),
      'customer', jsonb_build_object('name', 'Partner und Service s. r. o.', 'country', 'SK'),
      'period_from', to_char(v_m1, 'YYYY-MM-DD'), 'period_to', to_char(v_m0 - 1, 'YYYY-MM-DD'),
      'items', jsonb_build_array(jsonb_build_object('description', 'Übernachtung 3 Personen, ' || to_char(v_m1, 'MM/YYYY'),
        'quantity', 1, 'unit', 'Monat', 'unit_price', 1350.00, 'total', 1350.00)),
      'uncertain', jsonb_build_array('DPH 7 % — nie sme platitelia, overiť, či ju má účtovať')),
    now() - interval '1 day');
  insert into danubra_bills (bill_number, issue_date, delivery_date, amount, status, supplier_name, category, source,
    extract_status, extracted, extracted_at, note)
  values ('GS-88123', v_d - 4, v_d - 6, 45.90, 'review', 'Hornbach Baumarkt AG', 'tools', 'pdf', 'done',
    jsonb_build_object('_file', 'Gutschrift_Hornbach_88123.pdf', 'doc_type', 'credit_note', 'number', 'GS-88123',
      'issue_date', to_char(v_d - 4, 'YYYY-MM-DD'), 'currency', 'EUR', 'total', 45.90, 'category', 'tools',
      'supplier', jsonb_build_object('name', 'Hornbach Baumarkt AG', 'country', 'DE'),
      'items', jsonb_build_array(jsonb_build_object('description', 'Rückgabe Schleifgitter K120', 'quantity', 6,
        'unit', 'Stk', 'unit_price', 7.65, 'total', 45.90))),
    now() - interval '3 days', 'Dobropis za vrátený materiál — peniaze idú k nám.');
  insert into danubra_bills (amount, status, category, source, extract_status, extract_error, extracted, created_at)
  values (0, 'review', 'other', 'image', 'error', 'Fotka je rozmazaná, suma sa nedala prečítať.',
    jsonb_build_object('_file', 'IMG_20261021_0912.jpg'), now() - interval '5 days');
  insert into danubra_bills (bill_number, subcontract_id, issue_date, due_date, amount, status, supplier_name,
    supplier_ic_dph, category, source, note)
  values ('4471-2209', s2, v_d - 6, v_d - 6, 86.40, 'received', 'Aral Tankstelle Augsburg-Ost', 'DE811234590', 'fuel',
    'image', 'Nafta do dodávky, platené kartou.');
  insert into danubra_bills (bill_number, worker_id, subcontract_id, issue_date, amount, status, supplier_name, category,
    source, note)
  values ('SZL-2026-09', w_sza, s2, v_m0 + 2, v_amt_sza, 'discarded', 'László Szabó', 'work', 'manual',
    'Duplicita — tá istá faktúra prišla e-mailom aj cez WhatsApp.');

  -- ── Zálohy ─────────────────────────────────────────────────────────────────
  insert into danubra_advances (worker_id, subcontract_id, amount, paid_on, method, note, settled_bill_id)
  values (w_kov, s1, 200.00, v_m2 + 20, 'cash', 'Na naftu a jedlo v prvom týždni.', b1);
  insert into danubra_advances (worker_id, subcontract_id, amount, paid_on, method, note)
  values (w_bal, s1, 300.00, v_d - 20, 'bank', 'Záloha na opravu auta, odpočíta sa z októbrovej faktúry.');
  insert into danubra_advances (worker_id, subcontract_id, amount, paid_on, method, note, voided_at, void_reason)
  values (w_sza, s2, 150.00, v_m1 + 3, 'cash', 'Hotovosť na stavbe.', now() - interval '30 days',
    'Zapísané dvakrát — tá istá záloha je už v zápise z 3. dňa.');
  insert into danubra_advances (worker_id, subcontract_id, amount, paid_on, method, note)
  values (w_nov, s4, 100.00, v_d - 1, 'bank', 'Na lístok na vlak do Stuttgartu.');

  -- ── Náklady ────────────────────────────────────────────────────────────────
  -- Opakované ubytovanie (rodič + mesačný potomok), refakturované aj
  -- „viaznuce", palivo, náradie, poistenie, SOKA, poplatky, marketing.
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date, recurring, recurring_until, note)
  values ('accommodation', s1, 'Pension Sonnenhof', 'Ubytovanie partie Kováčik — ' || to_char(v_m1, 'MM/YYYY'), 1350.00,
    v_m1, true, v_d + 120, 'Mesačne, kým beží zákazka.')
  returning id into co1;
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date, parent_cost_id)
  values ('accommodation', s1, 'Pension Sonnenhof', 'Ubytovanie partie Kováčik — ' || to_char(v_m0, 'MM/YYYY'), 1350.00, v_m0, co1);
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date, rebilled_invoice_id)
  values ('accommodation', s3, 'Ferienwohnung Keller', 'Byt Dvořák + Šťastný — ' || to_char(v_m1, 'MM/YYYY'), 980.00,
    v_m1 + 6, i8)
  returning id into co2;
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date)
  values ('transport', s1, 'Ján Kováčik', 'Doprava partie Nitra–München a späť (turnus)', 420.00, v_d - 10);
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date, rebillable)
  values ('fuel', s2, 'Aral Tankstelle', 'Nafta do dodávky', 86.40, v_d - 6, false);
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date)
  values ('tools', s1, 'Hilti Deutschland AG', 'Laser PR 2-HS, náhrada za pokazený', 249.00, v_d - 15);
  insert into danubra_costs (category, supplier, description, amount, cost_date, recurring, recurring_until)
  values ('insurance', 'Allianz Versicherungs-AG', 'Betriebshaftpflicht — ročné poistné', 1180.00, v_d - 190, true, v_d + 175);
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date)
  values ('soka', s1, 'SOKA-BAU', 'Príspevok SOKA-BAU — ' || to_char(v_m1, 'MM/YYYY'), 640.00, v_m0 + 14);
  insert into danubra_costs (category, supplier, description, amount, cost_date)
  values ('fees', 'Raiffeisen Bank', 'Poplatky za zahraničné platby', 35.00, v_d - 4);
  insert into danubra_costs (category, supplier, description, amount, cost_date)
  values ('marketing', 'Meta Platforms Ireland', 'Reklama nábor obkladačov', 150.00, v_d - 7);
  insert into danubra_costs (category, subcontract_id, supplier, description, amount, cost_date, rebillable)
  values ('work', s1, 'Gerüstbau Lenz GmbH', 'Prenájom pojazdného lešenia, 2 týždne', 380.00, v_d - 12, true)
  returning id into co3;
  insert into danubra_costs (category, supplier, description, amount, cost_date)
  values ('other', 'Pošta', 'Doporučené listy — zmluvy na podpis', 18.60, v_d - 2);

  -- ── Banka ──────────────────────────────────────────────────────────────────
  -- Spárované automaticky, ručne, nespárované a ignorované.
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, variable_symbol, message,
    matched_invoice_id, match_status, match_note, matched_at, matched_by, import_hash, import_batch)
  select (paid_at)::date, total, 'Hofmann Bau GmbH', 'DE79600501010004827391', '20260001', 'RE VZOR-2026-0001',
    i1, 'auto', 'Variabilný symbol a suma sedia.', paid_at, null, 'vzor-064-t1', 'vypis-vzor-' || to_char(v_m2, 'YYYY-MM')
  from danubra_invoices where id = i1;
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, message,
    matched_invoice_id, match_status, match_note, matched_at, matched_by, import_hash, import_batch)
  select (paid_at)::date, total, 'HOFMANN BAU GMBH MUENCHEN', 'DE79600501010004827391', 'Rechnung Freiham August',
    i2, 'manual', 'Bez variabilného symbolu — spárované podľa sumy a textu.', paid_at, v_admin, 'vzor-064-t2',
    'vypis-vzor-' || to_char(v_m1, 'YYYY-MM')
  from danubra_invoices where id = i2;
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, variable_symbol, message,
    matched_invoice_id, match_status, matched_at, import_hash, import_batch)
  select (paid_at)::date, total, 'Hofmann Bau GmbH', 'DE79600501010004827391', '20260004', 'RE VZOR-2026-0004',
    i4, 'auto', paid_at, 'vzor-064-t3', 'vypis-vzor-' || to_char(v_m1, 'YYYY-MM')
  from danubra_invoices where id = i4;
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, variable_symbol, message,
    matched_bill_id, match_status, matched_at, import_hash, import_batch)
  select (paid_at)::date, -(amount - 200), 'Ján Kováčik', 'SK1209000000005123874631', '2026018',
    'Faktúra 2026018 po odpočítaní zálohy 200 EUR', b1, 'auto', paid_at, 'vzor-064-t4',
    'vypis-vzor-' || to_char(v_m1, 'YYYY-MM')
  from danubra_bills where id = b1;
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, message,
    matched_bill_id, match_status, matched_at, import_hash, import_batch)
  select (paid_at)::date, -amount, 'Roman Polák', 'SK0611000000002617394852', 'RP-2026-007', b11, 'auto', paid_at,
    'vzor-064-t5', 'vypis-vzor-' || to_char(v_m1, 'YYYY-MM')
  from danubra_bills where id = b11;
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, message,
    matched_cost_id, match_status, match_note, matched_at, matched_by, import_hash, import_batch)
  values (v_m1 + 8, -980.00, 'Rolf Keller', 'DE29720500000250938471', 'Miete FeWo September',
    co2, 'manual', 'Ubytovanie Stuttgart, refakturované faktúrou VZOR-2026-0008.', (v_m1 + 9)::timestamptz, v_admin,
    'vzor-064-t6', 'vypis-vzor-' || to_char(v_m1, 'YYYY-MM'));
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, counterparty_iban, message,
    match_status, import_hash, import_batch)
  values
    (v_d - 3, 2500.00, 'Krüger Innenausbau GmbH', 'DE26760501010013928475', 'Abschlag Neckarpark', 'unmatched',
     'vzor-064-t7', 'vypis-vzor-' || to_char(v_m0, 'YYYY-MM')),
    (v_d - 20, -300.00, 'Peter Baláž', 'SK1611000000002941837265', 'Záloha', 'unmatched',
     'vzor-064-t8', 'vypis-vzor-' || to_char(v_m0, 'YYYY-MM'));
  insert into danubra_bank_transactions (booked_at, amount, counterparty_name, message, match_status, match_note,
    matched_at, import_hash, import_batch)
  values
    (v_m0 - 1, -12.90, 'Tatra banka', 'Poplatok za vedenie účtu', 'ignored', 'Bankový poplatok — nepáruje sa.',
     now() - interval '20 days', 'vzor-064-t9', 'vypis-vzor-' || to_char(v_m1, 'YYYY-MM')),
    (v_m3 + 2, 18000.00, 'Partner und Service s. r. o.', 'Prevod z rezervného účtu', 'ignored',
     'Vlastný prevod medzi účtami.', now() - interval '80 days', 'vzor-064-t10', 'vypis-vzor-' || to_char(v_m3, 'YYYY-MM'));

  -- ── Compliance firmy ───────────────────────────────────────────────────────
  -- Platné, vybavuje sa, končí, po platnosti, netýka sa — a §9 HwO chýba
  -- úplne (obrazovka ho ukáže medzi „Čo ešte chýba zaevidovať").
  insert into danubra_compliance (scope, kind, reference, valid_from, valid_to, status, responsible, notes)
  values
    ('company', 'freistellung_48b', 'FB-VZOR-48b-2026', v_d - 140, v_d + 225, 'active', 'Michaela',
     'Freistellungsbescheinigung §48b — vzorový záznam.'),
    ('company', 'ust_idnr', 'DE-VZOR-000000', v_d - 270, null, 'active', 'Michaela', 'Vzorový záznam USt-IdNr.'),
    ('company', 'soka_registration', null, null, null, 'pending', 'účtovník', 'Registrácia podaná, čaká sa na číslo.'),
    ('company', 'insurance', 'BHV-VZOR-4471', v_d - 375, v_d - 10, 'active', 'Štefan',
     'Betriebshaftpflicht — skončila, obnova je v riešení.'),
    ('company', 'other', 'Gewerbeanmeldung', null, null, 'not_required', null, 'Pri vysielaní zo SK sa netýka.');

  -- ── Nábor: plány ───────────────────────────────────────────────────────────
  insert into danubra_recruitment_plans (title, trade_key, headcount, skill_level, legal_form, subcontract_id, city, country,
    start_date, deadline, offer_rate, client_rate, budget, accommodation_provided, transport_provided, advance_possible,
    channels, ad_text, status, step, notes, brief)
  values ('Obkladači Stuttgart — Klinikum Nord', 'obkladac', 3, 'fachwerker', 'szco', s4, 'Stuttgart', 'DE', v_d + 14, v_d + 7,
    21.00, 37.00, 450.00, true, false, true, array['meta_ads', 'facebook', 'referral'],
    'Obkladač — Stuttgart, Nemecko' || chr(10) || chr(10) || 'Sadzba: 21 €/h (živnosť)' || chr(10)
    || 'Nástup: o dva týždne, na 4 mesiace' || chr(10) || 'Ubytovanie zabezpečíme a platíme my',
    'active', 5, 'Máme dvoch z troch, tretí chýba a termín sa blíži.',
    'Klinikum Nord, Bettenhaus: obklady a dlažby v kúpeľniach, hydroizolácia stierkou.')
  returning id into rp1;
  insert into danubra_recruitment_plans (title, trade_key, headcount, skill_level, legal_form, subcontract_id, city, country,
    start_date, deadline, offer_rate, client_rate, budget, channels, status, step, notes)
  values ('Sadrokartonári München — posila na Bauteil C', 'trockenbau', 2, 'fachwerker', 'szco', s1, 'München', 'DE',
    v_d + 21, v_d + 14, 21.00, 38.50, 300.00, array['profesia', 'referral'], 'active', 4,
    'Dodatok predĺžil zákazku, odberateľ chce o dvoch ľudí viac.')
  returning id into rp2;
  insert into danubra_recruitment_plans (title, trade_key, headcount, legal_form, city, country, start_date, offer_rate,
    client_rate, channels, status, step, brief)
  values ('Elektrikári Erlangen', 'elektrikar', 4, 'szco', 'Erlangen', 'DE', v_d + 60, 25.00, 42.00,
    array['web', 'referral'], 'draft', 2, 'Možnosť z webu — ešte nevieme, či to vezmeme. Treba §9 HwO.')
  returning id into rp3;
  insert into danubra_recruitment_plans (title, trade_key, headcount, subcontract_id, city, country, start_date, offer_rate,
    client_rate, channels, status, step, notes)
  values ('Zvárači Augsburg — tretí do partie', 'zvarac', 1, s2, 'Augsburg', 'DE', v_d + 10, 23.00, 41.00,
    array['referral'], 'paused', 3, 'Pozastavené — pán Neumann zatiaľ tretieho nechce.')
  returning id into rp4;
  insert into danubra_recruitment_plans (title, trade_key, headcount, subcontract_id, city, country, start_date, offer_rate,
    client_rate, channels, status, step, notes)
  values ('Sadrokartón Freiham', 'trockenbau', 2, s7, 'München', 'DE', v_m3 + 1, 21.00, 38.00,
    array['referral', 'facebook'], 'done', 5, 'Obsadené, zákazka skončila.')
  returning id into rp5;
  insert into danubra_recruitment_plans (title, trade_key, headcount, subcontract_id, city, country, start_date, offer_rate,
    channels, status, step, notes)
  values ('Hotel Altstadt — sadrokartonári', 'trockenbau', 3, s9, 'Regensburg', 'DE', v_m1 + 15, 21.00,
    array['facebook'], 'cancelled', 2, 'Zrušené spolu so zákazkou.')
  returning id into rp6;

  insert into danubra_plan_assets (plan_id, channel, block, title, body, source, approved_at, approved_by, sort_order, archived_at)
  values
    (rp1, 'fb_sk', 'short', 'Krátky príspevok do skupín',
     'Obkladač do Stuttgartu, nemocnica Klinikum Nord. 21 €/h na živnosť, ubytovanie platíme my, nástup o dva týždne. '
     || 'Volajte alebo píšte na WhatsApp: +421 910 523 858', 'human', now() - interval '8 days', v_admin, 1, null),
    (rp1, 'fb_sk', 'long', 'Dlhý príspevok na stránku',
     'HĽADÁME OBKLADAČA DO STUTTGARTU' || chr(10) || chr(10)
     || 'Nemocnica Klinikum Nord, nová lôžková časť. Obklady a dlažby v kúpeľniach izieb, hydroizolácia stierkou.'
     || chr(10) || '21 €/h na živnosť, približne 50 hodín týždenne, turnus 3+1.' || chr(10)
     || 'Ubytovanie zabezpečíme a platíme. A1 a papiere vybavíme s Vami.', 'human', now() - interval '8 days', v_admin, 2, null),
    (rp1, 'fb_sk', 'urgent', 'Urgentný príspevok',
     'OBSADZUJEME HNEĎ: posledné miesto pre obkladača v Stuttgarte. 21 €/h, nástup o dva týždne.', 'ai', null, null, 3, null),
    (rp1, 'web', 'title', 'Titulok', 'Obkladač – Nemecko (Stuttgart, nemocnica)', 'human', now() - interval '7 days', v_admin, 1, null),
    (rp1, 'web', 'slug', 'URL adresa', 'obkladac-stuttgart-klinikum', 'human', now() - interval '7 days', v_admin, 2, null),
    (rp1, 'web', 'perex', 'Krátky perex',
     'Obklady a dlažby v novej lôžkovej časti nemocnice v Stuttgarte. Živnosť, 21 €/h, ubytovanie platíme my.',
     'ai', null, null, 3, null),
    (rp1, 'bazos_sk', 'title', 'Titulok', 'Obkladač – Nemecko Stuttgart 21 €/h', 'ai', null, null, 1, null),
    (rp1, 'bazos_sk', 'body', 'Text inzerátu',
     'Hľadáme skúseného obkladača na nemocnicu v Stuttgarte. Živnosť, 21 €/h, ubytovanie zadarmo, nástup o dva týždne.',
     'ai', null, null, 2, null),
    (rp1, 'images', 'canva', 'Texty do Canvy',
     'Hlavný nadpis: OBKLADAČ – STUTTGART' || chr(10) || 'Podnadpis: nemocnica · 21 €/h · ubytovanie zadarmo',
     'human', now() - interval '6 days', v_admin, 1, null),
    (rp1, 'fb_sk', 'short', 'Krátky príspevok (staršia verzia)',
     'Obkladač Stuttgart 20 €/h — prekonané, sadzba sa zvýšila.', 'ai', null, null, 9, now() - interval '9 days'),
    (rp2, 'fb_sk', 'short', 'Krátky príspevok do skupín',
     'Sadrokartonár do Mníchova, 21 €/h na živnosť, ubytovanie v penzióne platíme my. Pridáte sa k zohratej partii.',
     'human', now() - interval '3 days', v_admin, 1, null),
    (rp2, 'web', 'title', 'Titulok', 'Sadrokartonár – Nemecko (München)', 'ai', null, null, 1, null);

  -- ── Nábor: inzeráty ────────────────────────────────────────────────────────
  -- Bežiace, dobehnuté, ešte nespustené a jeden zverejnený na punds.sk.
  -- Zverejnený je zámerne už dobehnutý (active = false): web ukazuje len
  -- aktívne inzeráty, takže vymyslená ponuka sa verejne neukáže, ale
  -- v appke je vidieť štítok „na webe" aj celú webovú časť.
  insert into danubra_ads (title, channel, channel_detail, url, trade_key, city, country, subcontract_id, plan_id,
    rate_offered, promise, body, active, starts_on, ends_on, note)
  values ('Obkladač Stuttgart — Klinikum Nord', 'facebook', 'Skupina Práca v Nemecku — stavebníctvo', null, 'obkladac',
    'Stuttgart', 'DE', s4, rp1, 21.00, array['Ubytovanie zabezpečíme a platíme', 'Výplata každý mesiac načas', 'A1 vybavíme s Vami'],
    'Obklady a dlažby v nemocnici, 21 €/h na živnosť, nástup o dva týždne.', true, v_d - 10, v_d + 20, 'Meta reklama 15 €/deň.')
  returning id into ad1;
  insert into danubra_ads (title, channel, channel_detail, url, trade_key, city, country, subcontract_id, plan_id,
    rate_offered, body, active, starts_on, ends_on)
  values ('Sadrokartonár München', 'portal', 'profesia.sk', 'https://www.profesia.example/ponuka/sadrokartonar-mnichov',
    'trockenbau', 'München', 'DE', s1, rp2, 21.00, 'Posila do zohratej partie na bytovom komplexe v Mníchove.',
    true, v_d - 5, v_d + 25)
  returning id into ad2;
  insert into danubra_ads (title, channel, channel_detail, trade_key, city, country, subcontract_id, plan_id, rate_offered,
    body, active, starts_on, ends_on, note)
  values ('Odmena za odporúčanie zvárača', 'referral', 'Naši ľudia na stavbách', 'zvarac', 'Augsburg', 'DE', s2, rp4, 23.00,
    '100 € tomu, kto privedie zvárača, ktorý u nás odrobí mesiac.', false, v_m1 + 5, v_d - 2, 'Pozastavené spolu s plánom.')
  returning id into ad3;
  insert into danubra_ads (title, channel, channel_detail, trade_key, city, country, subcontract_id, plan_id, rate_offered,
    promise, body, active, starts_on, ends_on, web_published, web_title, web_slug, web_prof, web_body, rate_max, start_now,
    duration, hours_week, rotation, accommodation, headcount, lat, lng, duties, requirements, benefits, faq, published_at)
  values ('Sadrokartonár Freiham', 'facebook', 'Stránka punds.sk', 'trockenbau', 'München', 'DE', s7, rp5, 21.00,
    array['Ubytovanie platíme my'], 'Priečky v skladovej hale pri Mníchove.', false, v_m3 - 20, v_m3 + 5,
    true, 'Sadrokartonár – Nemecko (München Freiham)', 'sadrokartonar-mnichov-freiham-vzor', 'sadrokarton',
    'Montáž priečok a podhľadov v administratívnej časti skladovej haly v Mníchove-Freihame.', 23.00, false,
    '3 mesiace', 50, '3+1', true, 2, 48.1338, 11.4097,
    array['Montáž kovových roštov CW/UW', 'Opláštenie GKB a GKF', 'Tmelenie Q2'],
    array['Prax so sadrokartónom aspoň 2 roky', 'Živnosť alebo ochota ju založiť', 'Vlastné základné náradie'],
    array['21–23 € / hod. na faktúru', 'Ubytovanie zabezpečené', 'Pomoc s A1 a papiermi'],
    jsonb_build_array(jsonb_build_object('q', 'Kto platí ubytovanie?', 'a', 'My, ubytovanie je v cene.'),
      jsonb_build_object('q', 'Musím vedieť po nemecky?', 'a', 'Nie, s polierom sa dohovorí vedúci partie.')),
    (v_m3 - 20)::timestamptz)
  returning id into ad4;
  insert into danubra_ads (title, channel, channel_detail, trade_key, city, country, rate_offered, body, active, starts_on, ends_on)
  values ('Letáky — stavebniny Nové Zámky', 'print', 'Stavebniny pri Nitrianskej ceste', 'trockenbau', 'Nové Zámky', 'SK',
    20.00, 'Hľadáme remeselníkov na stavby v Nemecku. Volajte +421 910 523 858.', false, v_m2, v_m1)
  returning id into ad5;
  insert into danubra_ads (title, channel, channel_detail, trade_key, city, country, plan_id, rate_offered, body, active,
    starts_on, ends_on, note)
  values ('Elektrikár Erlangen — TikTok video', 'other', 'TikTok', 'elektrikar', 'Erlangen', 'DE', rp3, 25.00,
    'Krátke video zo stavby, odkaz na formulár.', true, v_d + 3, v_d + 33, 'Spustí sa, keď bude jasné, či Erlangen berieme.')
  returning id into ad6;

  -- ── Možnosti (dopyty odberateľov) ──────────────────────────────────────────
  insert into danubra_opportunities (title, brief, city, country, trade_key, headcount, source, status, created_at, consent_at)
  values ('Elektroinstallation Wohnbau Erlangen', 'Hľadajú 4 elektrikárov na bytový dom, od januára. Viac nenapísali.',
    'Erlangen', 'DE', 'elektrikar', 4, 'web', 'new', now() - interval '2 hours', now() - interval '2 hours')
  returning id into o1;
  update danubra_recruitment_plans set notes = 'Väzba na možnosť z webu (Erlangen).' where id = rp3;
  update danubra_opportunities set plan_id = rp3 where id = o1;
  insert into danubra_opportunities (title, brief, company_name, company_vat, company_country, contact_name, contact_phone,
    contact_email, city, country, trade_key, headcount, rate_client, rate_worker, start_date, source, status, verified_at, verify_result)
  values ('Trockenbau Schulzentrum Fürth', 'Sanácia školy, priečky a podhľady, 3 ľudia na 3 mesiace.',
    'Baugesellschaft Mittelfranken GmbH', 'DE293847561', 'DE', 'Herr Stefan Pohl', '+49 911 9761 440',
    's.pohl@bg-mittelfranken.example', 'Fürth', 'DE', 'trockenbau', 3, 38.00, 21.00, v_d + 40, 'e-mail', 'checking',
    now() - interval '1 day', jsonb_build_object('valid', true, 'source', 'vies'));
  insert into danubra_opportunities (title, brief, company_name, company_vat, contact_name, contact_phone, city, country,
    trade_key, headcount, rate_client, rate_worker, start_date, source, status, subcontract_id)
  values ('Fassadensanierung Gostenhof', 'WDVS a omietky, 4 ľudia.', 'Schäfer Fassadentechnik GmbH', 'DE265489137',
    'Herr Dieter Schäfer', '+49 911 6612 045', 'Nürnberg', 'DE', 'omietkar', 4, 35.50, 20.50, v_d + 30, 'telefón', 'offer', s5);
  insert into danubra_opportunities (title, brief, company_name, company_vat, contact_name, contact_phone, contact_email,
    city, country, trade_key, headcount, rate_client, rate_worker, start_date, source, status, subcontract_id, plan_id)
  values ('Fliesenarbeiten Klinikum Nord', 'Obklady v nemocnici, 3 ľudia.', 'Krüger Innenausbau GmbH', 'DE314752869',
    'Frau Sabine Krüger', '+49 711 2584 330', 'einkauf@krueger-innenausbau.example', 'Stuttgart', 'DE', 'obkladac', 3,
    37.00, 21.00, v_d + 14, 'kampaň', 'won', s4, rp1)
  returning id into o4;
  insert into danubra_opportunities (title, brief, company_name, company_vat, city, country, trade_key, headcount,
    rate_client, source, status, lost_reason)
  values ('Putzarbeiten Wohnpark Schweinau', 'Omietky, 3 ľudia.', 'Schäfer Fassadentechnik GmbH', 'DE265489137',
    'Nürnberg', 'DE', 'omietkar', 3, 36.00, 'telefón', 'lost', 'Prehrali sme na cene — konkurencia ponúkla 31 €/h.');
  insert into danubra_opportunities (title, brief, city, country, trade_key, headcount, source, status, archived_at, archived_reason)
  values ('Montage Photovoltaik Ingolstadt', 'Ten istý dopyt prišiel dvakrát.', 'Ingolstadt', 'DE', 'montaznik', 2, 'web',
    'checking', now() - interval '4 days', 'Duplicita — ten istý dopyt je tu dvakrát');

  -- ── Kandidáti ──────────────────────────────────────────────────────────────
  -- Všetkých osem stavov, jednotlivec aj partia, každý verdikt.
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
    german_level, source, source_detail, status, expected_rate, available_from, received_at, plan_id, ad_id,
    type, trade_license_status, consent_at, notes)
  values ('Peter Mráz', '+421 948 330 275', 'peter.mraz@mail.example', true, 'sk', 'Topoľčany', 'SK', 'obkladac', 'fachwerker',
    'A1', 'meta_ads', 'Meta reklama — obkladač Stuttgart', 'new', 21.00, v_d + 10, now() - interval '25 minutes', rp1, ad1,
    'individual', 'active', now() - interval '25 minutes', 'Prihlásil sa cez formulár v reklame.')
  returning id into cd1;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, source, status,
    received_at, plan_id, type, trade_license_status, consent_at)
  values ('Lukáš Benko', '+421 951 207 664', 'lukas.benko@mail.example', true, 'sk', 'Galanta', 'SK', 'trockenbau', 'web',
    'new', now() - interval '3 hours', rp2, 'individual', 'willing', now() - interval '3 hours')
  returning id into cd2;
  insert into danubra_candidates (full_name, phone, whatsapp, language, city, country, profession, source, source_detail,
    status, received_at, first_contact_at, plan_id, ad_id, type, crew_size, german_speaker, has_car, trade_license_status,
    screening_verdict, notes)
  values ('Attila Molnár', '+36 30 771 2045', true, 'hu', 'Komárom', 'HU', 'obkladac', 'facebook', 'Skupina Munka Németországban',
    'contacted', now() - interval '2 days', now() - interval '2 days' + interval '12 minutes', rp1, ad1, 'crew', 3, false, true,
    'active', 'unknown', 'Partia troch, nikto nevie po nemecky. Hovor nedokončený, volá späť večer.')
  returning id into cd3;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
    german_level, driving_licence, own_tools, source, status, expected_rate, available_from, received_at, first_contact_at,
    plan_id, ad_id, screening_score, screening_verdict, screening_done_at, last_site, last_foreman, type,
    trade_license_status, expected_start, consent_at)
  values ('Vladimír Kučera', '+420 721 554 309', 'vladimir.kucera@mail.example', true, 'cs', 'Zlín', 'CZ', 'trockenbau',
    'fachwerker', 'A2', true, true, 'profesia', 'interview', 22.00, v_d + 14, now() - interval '6 days',
    now() - interval '6 days' + interval '8 minutes', rp2, ad2, 72, 'ok', now() - interval '5 days',
    'Wohnquartier Leopoldstraße, München', 'Herr Gruber', 'individual', 'active', v_d + 21, now() - interval '6 days')
  returning id into cd4;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
    german_level, driving_licence, own_tools, source, referred_by, status, expected_rate, available_from, received_at,
    first_contact_at, plan_id, screening_score, screening_verdict, screening_done_at, last_site, last_foreman,
    reference_checked, type, trade_license_status, expected_start, consent_at)
  values ('Martin Sloboda', '+421 908 645 112', 'martin.sloboda@mail.example', true, 'sk', 'Nitra', 'SK', 'trockenbau',
    'fachwerker', 'A2', true, true, 'referral', w_kov, 'documents', 21.00, v_d + 18, now() - interval '12 days',
    now() - interval '12 days' + interval '5 minutes', rp2, 86, 'strong', now() - interval '11 days',
    'Bürohaus Werksviertel, München', 'Herr Maier', true, 'individual', 'active', v_d + 21, now() - interval '12 days')
  returning id into cd5;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
    german_level, driving_licence, own_tools, source, status, expected_rate, available_from, received_at, first_contact_at,
    plan_id, ad_id, screening_score, screening_verdict, screening_done_at, reference_checked, type, trade_license_status,
    expected_start, consent_at)
  values ('Pavol Gajdoš', '+421 917 284 503', 'pavol.gajdos@mail.example', true, 'sk', 'Prievidza', 'SK', 'obkladac',
    'fachwerker', 'B1', true, true, 'meta_ads', 'ready', 21.00, v_d + 14, now() - interval '15 days',
    now() - interval '15 days' + interval '9 minutes', rp1, ad1, 91, 'strong', now() - interval '14 days', true,
    'individual', 'active', v_d + 14, now() - interval '15 days')
  returning id into cd6;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
    german_level, source, status, expected_rate, received_at, first_contact_at, converted_worker_id, converted_at, plan_id,
    ad_id, screening_score, screening_verdict, screening_done_at, reference_checked, type, trade_license_status,
    expected_start, outcome, outcome_reason, subcontract_id, consent_at)
  values ('Jakub Novotný', '+420 734 118 652', 'jakub.novotny@mail.example', true, 'cs', 'Brno', 'CZ', 'obkladac', 'fachwerker',
    'A2', 'meta_ads', 'placed', 21.00, now() - interval '20 days', now() - interval '20 days' + interval '6 minutes',
    w_nov, now() - interval '6 days', rp1, ad1, 88, 'strong', now() - interval '19 days', true, 'individual', 'active',
    v_d + 14, 'hired', 'Nastupuje na Klinikum Nord.', s4, now() - interval '20 days')
  returning id into cd7;
  insert into danubra_candidates (full_name, phone, whatsapp, language, city, country, profession, source, status,
    reject_reason, received_at, first_contact_at, plan_id, screening_score, screening_verdict, screening_done_at, type,
    trade_license_status, outcome, outcome_reason)
  values ('Róbert Šebo', '+421 940 115 839', true, 'sk', 'Lučenec', 'SK', 'trockenbau', 'facebook', 'rejected',
    'Tvrdí, že A1 netreba, a pýtal zálohu vopred.', now() - interval '9 days', now() - interval '9 days' + interval '30 minutes',
    rp2, 28, 'reject', now() - interval '9 days', 'individual', 'none', 'rejected', 'Červené vlajky v hovore.')
  returning id into cd8;
  insert into danubra_candidates (full_name, phone, whatsapp, language, city, country, profession, source, status,
    reject_reason, received_at, first_contact_at, plan_id, screening_score, screening_verdict, type, trade_license_status)
  values ('Norbert Farkas', '+36 20 314 6607', true, 'hu', 'Tatabánya', 'HU', 'zvarac', 'referral', 'lost',
    'Neozýva sa od prvého hovoru, dvakrát nezdvihol.', now() - interval '25 days', now() - interval '25 days' + interval '40 minutes',
    rp4, 55, 'weak', 'individual', 'active')
  returning id into cd9;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, source, status,
    received_at, first_contact_at, plan_id, ad_id, type, trade_license_status, consent_at)
  values ('Jiří Svoboda', '+420 702 993 418', 'jiri.svoboda@mail.example', false, 'cs', 'Olomouc', 'CZ', 'trockenbau',
    'profesia', 'contacted', now() - interval '1 day', now() - interval '1 day' + interval '7 minutes', rp2, ad2,
    'individual', 'willing', now() - interval '1 day')
  returning id into cd10;
  insert into danubra_candidates (full_name, phone, whatsapp, language, city, country, profession, skill_level, german_level,
    source, status, expected_rate, received_at, first_contact_at, plan_id, screening_score, screening_verdict,
    screening_done_at, type, crew_size, german_speaker, has_car, trade_license_status, expected_start)
  values ('Ervin Tóth', '+36 70 448 1290', true, 'hu', 'Győr', 'HU', 'zvarac', 'fachwerker', 'B1', 'ine', 'interview', 23.50,
    now() - interval '4 days', now() - interval '4 days' + interval '15 minutes', rp4, 64, 'ok', now() - interval '3 days',
    'crew', 4, true, true, 'active', v_d + 30)
  returning id into cd11;
  insert into danubra_candidates (full_name, phone, email, whatsapp, language, city, country, profession, source, status,
    expected_rate, received_at, first_contact_at, plan_id, screening_score, screening_verdict, screening_done_at, type,
    trade_license_status, notes)
  values ('Ľubomír Hric', '+421 903 552 718', 'lubomir.hric@mail.example', true, 'sk', 'Žiar nad Hronom', 'SK', 'obkladac',
    'web', 'documents', 20.00, now() - interval '10 days', now() - interval '10 days' + interval '11 minutes', rp1, 58, 'weak',
    now() - interval '9 days', 'individual', 'none', 'Živnosť ešte nemá, zakladá ju. Bez nej nepôjde.')
  returning id into cd12;

  -- Pracovník Novotný vznikol z kandidáta — väzba ide z kandidáta na neho.
  -- (Opačný odkaz workers.candidate_id sa nevypĺňa, aby sa vzorové dáta
  -- dali zmazať bez slučky v cudzích kľúčoch.)

  -- Zaškrtnuté kroky postupu a vlajky.
  insert into danubra_candidate_checks (candidate_id, step_key, item_index, checked, checked_by, checked_at)
  select c, s, i, true, v_admin, now() - interval '5 days'
  from (values
    (cd4, 'call', 0), (cd4, 'call', 1),
    (cd5, 'call', 0), (cd5, 'call', 1), (cd5, 'proof', 0), (cd5, 'proof', 1), (cd5, 'proof', 2), (cd5, 'deal', 0),
    (cd6, 'call', 0), (cd6, 'call', 1), (cd6, 'proof', 0), (cd6, 'proof', 1), (cd6, 'proof', 2), (cd6, 'proof', 3),
    (cd6, 'deal', 0), (cd6, 'deal', 1), (cd6, 'deal', 2), (cd6, 'papers', 0), (cd6, 'papers', 1), (cd6, 'papers', 2), (cd6, 'papers', 3),
    (cd7, 'call', 0), (cd7, 'call', 1), (cd7, 'proof', 0), (cd7, 'proof', 1), (cd7, 'proof', 2), (cd7, 'deal', 0),
    (cd7, 'deal', 1), (cd7, 'deal', 2), (cd7, 'papers', 0), (cd7, 'papers', 1), (cd7, 'papers', 2), (cd7, 'papers', 3),
    (cd7, 'site', 0),
    (cd8, 'call', 0), (cd8, 'flags', 0), (cd8, 'flags', 1),
    (cd11, 'call', 0), (cd11, 'call', 1), (cd11, 'proof', 4),
    (cd12, 'call', 0), (cd12, 'call', 1), (cd12, 'proof', 0)
  ) as x(c, s, i);

  insert into danubra_candidate_notes (candidate_id, step_key, body, created_by, author_name, created_at)
  values
    (cd4, 'call', 'Robil dva roky v Mníchove cez agentúru, chce prejsť na živnosť priamo. Na Q3 sa pýtal sám.', v_admin, 'Štefan', now() - interval '6 days'),
    (cd5, 'proof', 'Pán Maier z Werksviertel by ho vzal znova bez zaváhania. Fotky priečok poslal, sú jeho.', v_admin, 'Michaela', now() - interval '10 days'),
    (cd5, 'papers', 'A1 podané v pondelok, kópiu živnosti máme.', v_admin, 'Michaela', now() - interval '3 days'),
    (cd6, 'deal', 'Písomne potvrdil 21 €/h a nástup o dva týždne.', v_admin, 'Štefan', now() - interval '8 days'),
    (cd8, 'flags', 'Pýtal 500 € zálohu ešte pred podpisom a tvrdí, že A1 netreba. Nebrať.', v_admin, 'Štefan', now() - interval '9 days'),
    (cd11, 'call', 'Partia štyroch, vedúci hovorí dobre po nemecky. Chcú spolu, nie jednotlivo.', v_admin, 'Štefan', now() - interval '4 days');

  -- Čipy z hovoru — berú sa zo zdieľaného zoznamu (danubra_call_chips).
  insert into danubra_candidate_chips (candidate_id, chip_id, label, polarity, weight, segment, checked_by, checked_at)
  select x.c, ch.id, ch.label, ch.polarity, ch.weight, ch.segment, v_admin, now() - interval '5 days'
  from (values
    (cd4, 'Má aktívnu živnosť'), (cd4, 'Má vlastné náradie'), (cd4, 'Sadzba sedí s ponukou'), (cd4, 'Trvá na vlastnej izbe'),
    (cd5, 'Má aktívnu živnosť'), (cd5, 'Vie, čo je A1'), (cd5, 'Turnus 3+1 mu vyhovuje'), (cd5, 'Má kolegu, ktorý by šiel tiež'),
    (cd6, 'Má aktívnu živnosť'), (cd6, 'Vie po nemecky aspoň základ'), (cd6, 'Nastúpi dlhodobo, aspoň tri mesiace'),
    (cd8, 'Tvrdí, že A1 netreba'), (cd8, 'Pýtal zálohu vopred'), (cd8, 'Peniaze ako prvá otázka'),
    (cd11, 'Je to partia'), (cd11, 'Má vlastné auto'),
    (cd12, 'Nemá a nechce živnosť'), (cd12, 'Chce výrazne viac')
  ) as x(c, lbl)
  join lateral (select * from danubra_call_chips cc where cc.label = x.lbl and cc.active order by cc.created_at limit 1) ch on true;

  -- Odpovede na otázky z príručky.
  insert into danubra_screening_answers (candidate_id, question_id, plan_id, answer_text, rating, flagged, note, created_by)
  select x.c, q.id, x.p, x.ans, x.r, x.f, x.n, v_admin
  from (values
    (cd4, 'u_zivnost', rp2, 'Áno, od roku 2021, fakturoval do Rakúska.', 3, false, null),
    (cd4, 'u_a1', rp2, 'Vie, čo to je, raz mu ho vybavovala agentúra.', 2, false, null),
    (cd4, 'u_ubytovanie', rp2, 'Radšej sám na izbe.', 1, false, 'Trvá na vlastnej izbe.'),
    (cd5, 'u_zivnost', rp2, 'Áno, od 2018.', 3, false, null),
    (cd5, 'u_polier', rp2, 'Werksviertel, pán Maier — dá na neho kontakt.', 3, false, null),
    (cd5, 'u_nastup', rp2, 'O tri týždne, na dlhšie.', 2, false, null),
    (cd8, 'u_a1', rp2, 'Vraj netreba, dva roky robil bez neho.', 0, true, 'Červená vlajka.'),
    (cd8, 'u_zaloha', rp2, 'Potrebuje 500 € vopred.', 0, true, null),
    (cd11, 'u_doprava', rp4, 'Majú dodávku pre štyroch.', 3, false, null),
    (cd12, 'u_zivnost', rp1, 'Nemá, ale založí si ju.', 1, false, null)
  ) as x(c, code, p, ans, r, f, n)
  join danubra_screening_questions q on q.code = x.code;

  -- ── Súhlasy, nahrávky hovorov, sľuby ───────────────────────────────────────
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, granted_at, method,
    evidence_note, language, retention_until)
  values ('worker', w_kov, 'Ján Kováčik', '+421 905 318 442', 'call_recording', true, now() - interval '60 days',
    'verbal_recorded', 'Súhlas povedaný na začiatku nahrávky.', 'sk', v_d + 120)
  returning id into cn1;
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, granted_at, method,
    evidence_note, language, retention_until)
  values ('worker', w_nov, 'Jakub Novotný', '+420 734 118 652', 'call_recording', true, now() - interval '7 days',
    'verbal_recorded', 'Súhlas po česky na začiatku hovoru.', 'cs', v_d + 173)
  returning id into cn2;
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, granted_at, method,
    language, revoked_at, revoke_reason)
  values ('worker', w_kol, 'Dušan Kollár', '+421 944 120 568', 'call_recording', true, now() - interval '120 days',
    'verbal_recorded', 'sk', now() - interval '40 days', 'Požiadal o zmazanie nahrávok.')
  returning id into cn3;
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, language)
  values ('candidate', cd3, 'Attila Molnár', '+36 30 771 2045', 'call_recording', false, 'hu');
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, granted_at, method,
    evidence_note, language, retention_until)
  values ('worker', w_sza, 'László Szabó', '+36 30 412 7788', 'call_recording', true, now() - interval '12 days',
    'verbal_recorded', 'Súhlas po maďarsky na začiatku hovoru.', 'hu', v_d + 168)
  returning id into cn4;
  insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone, kind, granted, granted_at, method,
    evidence_note, language, retention_until)
  values ('worker', w_bal, 'Peter Baláž', '+421 907 264 118', 'call_recording', true, now() - interval '90 days',
    'written', 'Podpísaný súhlas pri rámcovej zmluve.', 'sk', v_d + 180)
  returning id into cn5;

  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_id, consent_confirmed,
    duration_seconds, language, recorded_at, status, transcript, transcript_provider, summary, extraction, processed_at,
    delete_after, source, direction)
  values ('worker', w_kov, 'Ján Kováčik', '+421 905 318 442', cn1, true, 412, 'sk', now() - interval '60 days', 'done',
    'Dobrý deň, pán Kováčik, volám kvôli Mníchovu... Ubytovanie v penzióne platíme my, tri osoby, dve izby...',
    'whisper', 'Dohodnuté: 22 €/h, ubytovanie platíme my, nástup v polovici mesiaca, doprava vlastnou dodávkou.',
    jsonb_build_object('wage', 22, 'accommodation', 'platí firma', 'start_date', to_char(v_m2 + 14, 'YYYY-MM-DD')),
    now() - interval '60 days', v_d + 120, 'upload', 'out')
  returning id into r1;
  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_id, consent_confirmed,
    duration_seconds, language, recorded_at, status, transcript, transcript_provider, processed_at, delete_after, source, direction)
  values ('worker', w_nov, 'Jakub Novotný', '+420 734 118 652', cn2, true, 285, 'cs', now() - interval '7 days', 'transcribed',
    'Dobrý den, pane Novotný... sazba 21 eur na hodinu, nástup za dva týdny...', 'whisper', now() - interval '7 days',
    v_d + 173, 'upload', 'out')
  returning id into r2;
  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_confirmed, language,
    recorded_at, status, source, direction)
  values ('candidate', cd3, 'Attila Molnár', '+36 30 771 2045', false, 'hu', now() - interval '2 days', 'awaiting_consent',
    'upload', 'out');
  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_id, consent_confirmed,
    duration_seconds, language, recorded_at, status, error, delete_after, source, direction)
  values ('worker', w_sza, 'László Szabó', '+36 30 412 7788', cn4, true, 190, 'hu', now() - interval '12 days', 'failed',
    'Prepis zlyhal: zvuk je príliš tichý.', v_d + 168, 'upload', 'in')
  returning id into r4;
  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_id, consent_confirmed,
    duration_seconds, language, recorded_at, status, deleted_at, source, direction)
  values ('worker', w_kol, 'Dušan Kollár', '+421 944 120 568', cn3, true, 233, 'sk', now() - interval '120 days', 'deleted',
    now() - interval '40 days', 'upload', 'out');
  insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone, consent_id, consent_confirmed,
    duration_seconds, language, recorded_at, status, delete_after, source, direction)
  values ('worker', w_bal, 'Peter Baláž', '+421 907 264 118', cn5, true, 140, 'sk', now() - interval '1 hour', 'uploaded',
    v_d + 180, 'upload', 'in');

  insert into danubra_promises (recording_id, subject_type, subject_id, kind, statement, value_text, value_number, value_date,
    confidence, status, due_date, fulfilled_at, note)
  values
    (r1, 'worker', w_kov, 'wage', 'Sadzba 22 €/h na živnosť.', '22 €/h', 22, null, 0.95, 'fulfilled', null, now() - interval '30 days', 'Platí od prvej faktúry.'),
    (r1, 'worker', w_kov, 'accommodation', 'Ubytovanie v penzióne platí firma.', 'platí firma', null, null, 0.9, 'fulfilled', null, now() - interval '55 days', null),
    (r2, 'worker', w_nov, 'wage', 'Sadzba 21 €/h.', '21 €/h', 21, null, 0.9, 'open', null, null, null),
    (r2, 'worker', w_nov, 'start_date', 'Nástup o dva týždne na Klinikum Nord.', null, null, v_d + 14, 0.9, 'open', v_d + 14, null, null),
    (r2, 'worker', w_nov, 'transport', 'Lístok na vlak pošleme do piatku.', null, null, v_d - 2, 0.8, 'open', v_d - 2, null, 'Termín prešiel — poslať dnes.'),
    (null, 'worker', w_bal, 'other', 'Cestu domov na turnus preplatíme.', null, null, null, null, 'broken', v_d - 15, null, 'Zaplatil si sám, treba mu to vrátiť.'),
    (null, 'worker', w_sza, 'working_hours', 'Najviac 50 hodín týždenne.', '50 h/týždeň', 50, null, null, 'disputed', null, null, 'Tvrdí, že sme sľúbili 45.'),
    (null, 'worker', w_nag, 'equipment', 'Ochranný štít na zváranie dostane na stavbe.', null, null, null, null, 'open', v_d + 5, null, null),
    (null, 'worker', w_hud, 'per_diem', 'Diéty 15 € na deň.', '15 €/deň', 15, null, null, 'cancelled', null, null, 'Pri živnosti sa diéty neplatia — vysvetlené.');

  -- ── Úlohy ──────────────────────────────────────────────────────────────────
  -- Každá priorita a stav, po termíne, dnes, tento týždeň, neskôr, odložená;
  -- ručné aj automatické z pravidiel (rovnaký source_key ako denný cron).
  insert into danubra_tasks (title, description, entity_type, entity_id, entity_label, priority, status, due_date,
    assigned_to, assigned_name, source, level, done_at, postponed_to, created_at)
  values
    ('Zavolať pánovi Hofmannovi kvôli faktúre VZOR-2026-0003', 'Je po splatnosti, upomienka odišla.', 'invoice', i3,
     'VZOR-2026-0003', 'high', 'open', v_d - 3, v_admin, 'Štefan', 'manual', 'manual', null, null, now() - interval '6 days'),
    ('Poslať Jakubovi Novotnému lístok na vlak', null, 'worker', w_nov, 'Jakub Novotný', 'normal', 'in_progress', v_d,
     v_admin, 'Michaela', 'manual', 'manual', null, null, now() - interval '2 days'),
    ('Objednať tretiu izbu v Stuttgarte', 'Keď sa nájde tretí obkladač.', 'subcontract', s4, 'Klinikum Nord — Fliesenarbeiten',
     'low', 'open', v_d + 12, null, null, 'manual', 'manual', null, null, now() - interval '1 day'),
    ('Pripraviť infolist pre Klinikum Nord', null, 'subcontract', s4, 'Klinikum Nord — Fliesenarbeiten', 'normal', 'open',
     v_d + 4, v_admin, 'Michaela', 'manual', 'manual', null, null, now() - interval '1 day'),
    ('Skontrolovať faktúru Mareka Hudeca', 'Je na nej o 120 € viac, než dávajú schválené hodiny.', 'bill', b3, '3/2026', 'high', 'open', v_d + 1,
     v_admin, 'Štefan', 'manual', 'manual', null, null, now() - interval '1 day'),
    ('Podpísať rámcovú zmluvu s Hofmann Bau', null, 'contract', k7, 'ZML-VZOR-2026-007', 'normal', 'done', v_d - 30, v_admin,
     'Štefan', 'manual', 'manual', now() - interval '29 days', null, now() - interval '40 days'),
    ('Ponuka pre Lindner Trockenbau', 'Spolupráca ukončená, nerobiť.', 'partner', p_lin, 'Lindner Trockenbau GmbH', 'low',
     'cancelled', v_d - 10, null, null, 'manual', 'manual', null, null, now() - interval '20 days'),
    ('Overiť Freistellung u Krüger Innenausbau', 'Odložené — pani Krügerová je do pondelka na dovolenke.', 'partner', p_kru,
     'Krüger Innenausbau GmbH', 'normal', 'open', v_d - 1, v_admin, 'Michaela', 'manual', 'manual', null, v_d + 5,
     now() - interval '5 days');

  insert into danubra_tasks (title, entity_type, entity_id, entity_label, priority, status, due_date, assigned_name, source,
    level, source_field, source_key, rule_id, created_at)
  select 'Požiadať o nové A1 pre Petra Baláža', 'worker', w_bal, 'Peter Baláž', 'high', 'open', d.valid_to, 'Michaela', 'cron',
    'auto', 'danubra_worker_documents.valid_to', 'a1:' || d.id || ':' || d.valid_to, null, now() - interval '25 days'
  from danubra_worker_documents d where d.worker_id = w_bal and d.kind = 'a1';
  insert into danubra_tasks (title, entity_type, entity_id, entity_label, priority, status, due_date, assigned_name, source,
    level, source_field, source_key, created_at)
  select 'A1 pre Gábora Nagya je neplatné', 'worker', w_nag, 'Gábor Nagy', 'high', 'open', d.valid_to, 'Michaela', 'cron',
    'auto', 'danubra_worker_documents.valid_to', 'a1:' || d.id || ':' || d.valid_to, now() - interval '40 days'
  from danubra_worker_documents d where d.worker_id = w_nag and d.kind = 'a1';
  insert into danubra_tasks (title, entity_type, entity_id, entity_label, priority, status, due_date, source, level,
    source_field, source_key, rule_id, created_at)
  select 'Ponuka PON-VZOR-2026-003 končí', 'quote', q3, 'PON-VZOR-2026-003', r.priority, 'open', v_d + 5, 'rule', 'auto',
    'danubra_quotes.valid_until', 'rule:quote_expiring:' || q3, r.id, now() - interval '2 days'
  from danubra_task_rules r where r.key = 'quote_expiring';
  insert into danubra_tasks (title, entity_type, entity_id, entity_label, priority, status, due_date, source, level,
    source_field, source_key, rule_id, created_at)
  select 'Uzavrieť obdobie Stahlbau Halle 4 — ' || to_char(v_m1, 'MM/YYYY'), 'subcontract', s2, 'Stahlbau Halle 4 — Schweißarbeiten',
    'high', 'open', v_m0 - 1, 'rule', 'auto', 'danubra_periods.period_to', 'rule:period_to_close:' || ps2a, r.id,
    now() - interval '25 days'
  from danubra_task_rules r where r.key = 'period_to_close';
  insert into danubra_tasks (title, entity_type, entity_id, entity_label, priority, status, due_date, source, level,
    source_field, source_key, created_at)
  values
    ('Ozvať sa kandidátovi Peter Mráz', 'candidate', cd1, 'Peter Mráz', 'high', 'open', v_d, 'cron', 'auto',
     'danubra_candidates.first_contact_at', 'candidate:' || cd1, now() - interval '20 minutes'),
    ('Obnoviť Betriebshaftpflicht', null, null, 'Compliance firmy', 'high', 'open', v_d - 10, 'cron', 'auto',
     'danubra_compliance.valid_to', 'compliance-vzor:insurance:' || (v_d - 10), now() - interval '30 days'),
    ('Nábor Obkladači Stuttgart nestíha', null, null, 'Obkladači Stuttgart — Klinikum Nord', 'normal', 'open', v_d + 7,
     'cron', 'auto', 'danubra_recruitment_plans.deadline', 'plan:' || rp1 || ':' || (v_d + 7), now() - interval '1 day');

  -- ── Aktivity (časová os) ───────────────────────────────────────────────────
  insert into danubra_activities (entity_type, entity_id, type, direction, body, follow_up_at, done, source, created_at, created_by)
  values
    ('worker', w_nov, 'call', 'out', 'Dohodnutý nástup o dva týždne, sadzba 21 €/h. Lístok pošleme do piatku.',
     now() - interval '2 days', false, 'manual', now() - interval '7 days', v_admin),
    ('worker', w_bal, 'whatsapp', 'in', 'Píše, že mu o 20 dní končí A1 — či mu pomôžeme s novým.', null, true, 'manual',
     now() - interval '4 days', v_admin),
    ('worker', w_kov, 'note', null, 'Partia je spokojná s penziónom, pani Huberová pýta zálohu na november.', null, true,
     'manual', now() - interval '3 days', v_admin),
    ('worker', w_nag, 'email', 'out', 'Poslaná žiadosť o nové A1 na NEAK.', now() + interval '7 days', false, 'manual',
     now() - interval '10 days', v_admin),
    ('worker', w_sim, 'call', 'out', 'Kým nebude nové A1 a oznámenie §9 HwO, nasadiť ho nemôžeme. Rozumie.', null, true,
     'manual', now() - interval '6 days', v_admin),
    ('candidate', cd1, 'system', null, 'Prihláška z reklamy Meta — čaká na prvý hovor.', null, false, 'web',
     now() - interval '25 minutes', null),
    ('candidate', cd3, 'call', 'out', 'Nezdvihol, poslaná SMS. Volá späť večer.', now() + interval '5 hours', false, 'manual',
     now() - interval '2 days', v_admin),
    ('candidate', cd5, 'whatsapp', 'out', 'Poslaný zoznam dokladov na podpis zmluvy.', null, true, 'manual',
     now() - interval '5 days', v_admin),
    ('partner', p_hof, 'call', 'out', 'Pán Hofmann sľúbil úhradu VZOR-2026-0003 do piatku.', now() - interval '1 day', false,
     'manual', now() - interval '4 days', v_admin),
    ('partner', p_kru, 'email', 'in', 'Pani Krügerová potvrdila zákazku Klinikum Nord.', null, true, 'manual',
     now() - interval '3 days', v_admin),
    ('partner', p_sch, 'call', 'out', 'Pán Schäfer chce 18 €/m², my držíme 19,50 €/m². Volať znova v stredu.',
     now() + interval '2 days', false, 'manual', now() - interval '1 day', v_admin),
    ('subcontract', s1, 'system', null, 'Faktúra VZOR-2026-0005 odoslaná odberateľovi.', null, true, 'manual',
     (v_m0 + 2)::timestamptz, null),
    ('subcontract', s3, 'system', null, 'Návrh faktúry VZOR-2026-0007 čaká na schválenie (zrážka §48b 15 %).', null, false,
     'manual', now() - interval '1 hour', null);

  -- ── Interné správy ─────────────────────────────────────────────────────────
  insert into danubra_message_threads (subject, entity_type, entity_id, party_type, party_id, party_name, to_email,
    channel, status, last_at, created_by)
  values ('Termín Bauteil C', 'subcontract', s1, 'partner', p_hof, 'Hofmann Bau GmbH', 'bauleitung@hofmann-bau.example',
    'email', 'open', now() - interval '1 day', v_admin)
  returning id into th1;
  insert into danubra_messages (thread_id, direction, channel, body, status, author_id, author_name, created_at)
  values (th1, 'internal', 'internal', 'Polier volal, že Bauteil C sa uvoľní až o týždeň. Posunúť nástup posily, inak budú stáť.',
    'note', v_admin, 'Štefan', now() - interval '3 days');
  insert into danubra_messages (thread_id, direction, channel, subject, body, to_email, from_name, status, queued_at, sent_at,
    author_id, author_name, created_at)
  values (th1, 'out', 'email', 'Terminverschiebung Bauteil C',
    'Sehr geehrter Herr Hofmann,' || chr(10) || chr(10) || 'wir haben erfahren, dass Bauteil C erst eine Woche später frei wird. '
    || 'Können Sie uns den neuen Termin bitte schriftlich bestätigen?' || chr(10) || chr(10) || 'Mit freundlichen Grüßen'
    || chr(10) || 'Partner und Service s. r. o.', 'bauleitung@hofmann-bau.example', 'Partner und Service', 'sent',
    now() - interval '3 days', now() - interval '3 days', v_admin, 'Štefan', now() - interval '3 days');
  insert into danubra_messages (thread_id, direction, channel, subject, body, from_name, status, created_at)
  values (th1, 'in', 'email', 'AW: Terminverschiebung Bauteil C',
    'Guten Tag, ja, Bauteil C ab dem ' || to_char(v_d + 7, 'DD.MM.YYYY') || '. Gruß, M. Hofmann', 'Markus Hofmann',
    'received', now() - interval '1 day');

  insert into danubra_message_threads (subject, entity_type, entity_id, party_type, party_id, party_name, to_phone,
    channel, status, last_at, created_by)
  values ('Nástup Klinikum Nord', 'worker', w_nov, 'worker', w_nov, 'Jakub Novotný', '+420 734 118 652', 'whatsapp', 'open',
    now() - interval '2 hours', v_admin)
  returning id into th2;
  insert into danubra_messages (thread_id, direction, channel, body, to_phone, status, queued_at, author_id, author_name, created_at)
  values (th2, 'out', 'whatsapp',
    'Dobrý deň, pán Novotný, posielame Vám adresu ubytovania a kontakt na poliera. Nástup je ' || to_char(v_d + 14, 'DD.MM.YYYY')
    || ' o 7:00, hláste sa prosím v kontajneri č. 3.', '+420 734 118 652', 'queued', now() - interval '2 hours', v_admin,
    'Michaela', now() - interval '2 hours');
  insert into danubra_messages (thread_id, direction, channel, body, to_phone, status, queued_at, failed_at, error,
    author_id, author_name, created_at)
  values (th2, 'out', 'sms', 'Dobrý deň, pán Novotný, lístok na vlak Vám pošleme e-mailom do piatku.', '+420 734 118 652',
    'failed', now() - interval '1 day', now() - interval '1 day', 'Brána SMS nie je nastavená.', v_admin, 'Michaela',
    now() - interval '1 day');

  insert into danubra_message_threads (subject, entity_type, entity_id, channel, status, last_at, created_by)
  values ('Upomienka Freiham', 'invoice', i3, 'internal', 'done', now() - interval '3 days', v_admin)
  returning id into th3;
  insert into danubra_messages (thread_id, direction, channel, body, status, author_id, author_name, created_at)
  values
    (th3, 'internal', 'internal', 'Faktúra VZOR-2026-0003 je po splatnosti. Pošlem prvú upomienku.', 'note', v_admin, 'Michaela',
     now() - interval '4 days'),
    (th3, 'internal', 'internal', 'Upomienka odišla, pán Hofmann sľúbil platbu do piatku. Uzatváram.', 'note', v_admin, 'Štefan',
     now() - interval '3 days');

  insert into danubra_message_threads (subject, entity_type, entity_id, party_type, party_id, party_name, to_phone,
    channel, status, last_at, created_by)
  values ('Doklady na podpis', 'candidate', cd5, 'candidate', cd5, 'Martin Sloboda', '+421 908 645 112', 'sms', 'open',
    now() - interval '30 minutes', v_admin)
  returning id into th4;
  insert into danubra_messages (thread_id, direction, channel, body, to_phone, status, author_id, author_name, created_at)
  values (th4, 'out', 'sms', 'Dobrý deň, pán Sloboda, prineste prosím v stredu občiansky preukaz a výpis zo živnostenského registra.',
    '+421 908 645 112', 'draft', v_admin, 'Michaela', now() - interval '30 minutes');

  -- ── Oslovenie firiem (leady a kampane) ─────────────────────────────────────
  insert into danubra_leads (name, city, postal_code, address, country, website, email, phone, trade, why, source, source_ref,
    status, notes, lat, lng, created_at)
  values ('Holzbau Brenner GmbH', 'Rosenheim', '83022', 'Kufsteiner Straße 40', 'DE', 'https://www.holzbau-brenner.example',
    'info@holzbau-brenner.example', '+49 8031 22 410', 'Holzbau', 'Stavia drevostavby, hľadajú montážnikov.', 'osm',
    'node/552918334', 'new', null, 47.8481, 12.1186, now() - interval '1 day')
  returning id into ld1;
  insert into danubra_leads (name, city, postal_code, country, website, email, phone, trade, why, source, similar_to, status,
    last_contact_at, created_at)
  values ('Dachdeckerei Lechner GmbH', 'Landshut', '84028', 'DE', 'https://www.dach-lechner.example',
    'kontakt@dach-lechner.example', '+49 871 9640 12', 'Trockenbau, Dachausbau', 'Podobná ako Hofmann Bau — podkrovia a priečky.',
    'ai', p_hof, 'contacted', now() - interval '12 days', now() - interval '20 days')
  returning id into ld2;
  insert into danubra_leads (name, city, country, email, phone, trade, source, status, last_contact_at, notes, created_at)
  values ('Innenausbau Seitz GmbH', 'Würzburg', 'DE', 'buero@seitz-innenausbau.example', '+49 931 3045 77', 'Innenausbau',
    'manual', 'replied', now() - interval '8 days', 'Odpísali, že na jar budú potrebovať 2 ľudí.', now() - interval '20 days')
  returning id into ld3;
  insert into danubra_leads (name, city, country, email, phone, trade, source, status, last_contact_at, notes, created_at)
  values ('Malerbetrieb Hoffmann & Sohn', 'Ulm', 'DE', 'info@maler-hoffmann.example', '+49 731 6022 18', 'Maler', 'ai',
    'interested', now() - interval '5 days', 'Chcú ponuku na 3 maliarov od januára.', now() - interval '20 days')
  returning id into ld4;
  insert into danubra_leads (name, city, country, email, phone, trade, source, status, partner_id, last_contact_at, created_at)
  values ('Krüger Innenausbau GmbH', 'Stuttgart', 'DE', 'einkauf@krueger-innenausbau.example', '+49 711 2584 330',
    'Innenausbau', 'osm', 'won', p_kru, now() - interval '30 days', now() - interval '60 days')
  returning id into ld5;
  insert into danubra_leads (name, city, country, email, trade, source, status, notes, last_contact_at, created_at)
  values ('Fliesen Wolf GmbH', 'Augsburg', 'DE', 'info@fliesen-wolf.example', 'Fliesen', 'osm', 'rejected',
    'Robia len s vlastnými ľuďmi.', now() - interval '12 days', now() - interval '20 days')
  returning id into ld6;
  insert into danubra_leads (name, city, country, email, trade, source, status, notes, last_contact_at, created_at)
  values ('Stuckateur Bauer GmbH', 'Passau', 'DE', 'info@stuck-bauer.example', 'Stuck', 'ai', 'unsubscribed',
    'Odhlásili sa z e-mailov.', now() - interval '12 days', now() - interval '20 days')
  returning id into ld7;
  insert into danubra_leads (name, city, country, email, trade, source, status, archived_at, notes, created_at)
  values ('Bau Service Huber', 'Freising', 'DE', 'huber@bau-service.example', 'Bau', 'osm', 'new', now() - interval '6 days',
    'Firma už neexistuje — archivované.', now() - interval '25 days')
  returning id into ld8;

  insert into danubra_lead_searches (kind, params, status, found, added, finished_at, created_at, created_by)
  values ('ai', jsonb_build_object('region', 'Bayern', 'trade', 'Trockenbau', 'count', 15), 'done', 12, 4,
    now() - interval '20 days', now() - interval '20 days', v_admin);
  insert into danubra_lead_searches (kind, params, status, error, finished_at, created_at, created_by)
  values ('osm', jsonb_build_object('city', 'Würzburg', 'craft', 'tiler'), 'error', 'Overpass neodpovedal do 30 sekúnd.',
    now() - interval '3 days', now() - interval '3 days', v_admin);

  insert into danubra_campaigns (name, subject, body, lang, status, sent_count, failed_count, last_run_at, created_at, created_by)
  values ('Jeseň 2026 — voľné kapacity Trockenbau', 'Freie Kapazitäten im Trockenbau ab sofort',
    'Sehr geehrte Damen und Herren,' || chr(10) || chr(10) || 'wir haben ab sofort eingespielte Trockenbau-Teams aus der Slowakei frei. '
    || 'Abrechnung per Stunde, Reverse Charge nach §13b UStG, A1 und Unterlagen vollständig.' || chr(10) || chr(10)
    || 'Mit freundlichen Grüßen' || chr(10) || 'Partner und Service s. r. o.', 'de', 'done', 4, 1, now() - interval '12 days',
    now() - interval '13 days', v_admin)
  returning id into ca1;
  insert into danubra_campaign_sends (campaign_id, lead_id, partner_id, email, name, token, status, error, sent_at, created_at)
  values
    (ca1, ld2, null, 'kontakt@dach-lechner.example', 'Dachdeckerei Lechner GmbH', replace(gen_random_uuid()::text, '-', ''), 'sent', null, now() - interval '12 days', now() - interval '12 days'),
    (ca1, ld3, null, 'buero@seitz-innenausbau.example', 'Innenausbau Seitz GmbH', replace(gen_random_uuid()::text, '-', ''), 'sent', null, now() - interval '12 days', now() - interval '12 days'),
    (ca1, ld4, null, 'info@maler-hoffmann.example', 'Malerbetrieb Hoffmann & Sohn', replace(gen_random_uuid()::text, '-', ''), 'sent', null, now() - interval '12 days', now() - interval '12 days'),
    (ca1, null, p_neu, 'technik@stahlbau-neumann.example', 'Stahlbau Neumann GmbH', replace(gen_random_uuid()::text, '-', ''), 'sent', null, now() - interval '12 days', now() - interval '12 days'),
    (ca1, ld6, null, 'info@fliesen-wolf.example', 'Fliesen Wolf GmbH', replace(gen_random_uuid()::text, '-', ''), 'failed', '550 Mailbox unavailable', null, now() - interval '12 days'),
    (ca1, ld7, null, 'info@stuck-bauer.example', 'Stuckateur Bauer GmbH', replace(gen_random_uuid()::text, '-', ''), 'skipped', 'odhlásený', null, now() - interval '12 days');

  insert into danubra_campaigns (name, subject, body, lang, status, created_at, created_by)
  values ('Zima 2026 — obkladači a maliari', 'Fliesenleger und Maler für Ihre Winterbaustellen',
    'Sehr geehrte Damen und Herren,' || chr(10) || chr(10) || 'für Innenarbeiten im Winter bieten wir erfahrene Fliesenleger und Maler an. '
    || 'Gerne senden wir Ihnen ein Angebot.' || chr(10) || chr(10) || 'Mit freundlichen Grüßen' || chr(10)
    || 'Partner und Service s. r. o.', 'de', 'draft', now() - interval '1 day', v_admin)
  returning id into ca2;
  insert into danubra_campaign_sends (campaign_id, lead_id, email, name, token, status, created_at)
  values
    (ca2, ld1, 'info@holzbau-brenner.example', 'Holzbau Brenner GmbH', replace(gen_random_uuid()::text, '-', ''), 'queued', now() - interval '1 day'),
    (ca2, ld4, 'info@maler-hoffmann.example', 'Malerbetrieb Hoffmann & Sohn', replace(gen_random_uuid()::text, '-', ''), 'queued', now() - interval '1 day');

  -- ── Marketing: inzercia a výdavky ──────────────────────────────────────────
  insert into danubra_marketing_listings (platform, listing_type, url, language, published_at, renew_at, status, performance_note)
  values
    ('auftragsbank', 'subdodávky', 'https://www.auftragsbank.example/profil/punds', 'de', v_d - 80, v_d + 10, 'active',
     'Z tohto portálu prišiel Schäfer.'),
    ('subunternehmen-gesucht', 'subdodávky', 'https://www.subunternehmen-gesucht.example/punds', 'de', v_d - 50, v_d - 2,
     'to_renew', 'Obnoviť — zatiaľ bez dopytu.'),
    ('profesia', 'nábor', 'https://www.profesia.example/ponuka/sadrokartonar-mnichov', 'sk', v_d - 5, v_d + 25, 'active',
     'Dvaja kandidáti za týždeň.'),
    ('facebook', 'nábor', null, 'sk', v_d - 70, v_d - 40, 'expired', 'Skupina zrušila inzeráty od firiem.'),
    ('mein-monteurzimmer', 'ubytovanie', 'https://www.mein-monteurzimmer.example/suche', 'de', v_d - 30, v_d + 3, 'active', null);

  insert into danubra_marketing_expenses (spent_at, channel, amount, note)
  values
    (v_d - 7, 'ads', 150.00, 'Meta reklama — obkladači Stuttgart'),
    (v_d - 5, 'portal', 49.00, 'profesia.sk — inzerát sadrokartonár'),
    (v_m0 + 1, 'portal', 39.00, 'Auftragsbank.de — mesačný profil'),
    (v_d - 3, 'referral', 100.00, 'Odmena Jánovi Kováčikovi za Martina Slobodu'),
    (v_m1 + 10, 'print', 65.00, 'Letáky stavebniny Nové Zámky'),
    (v_m1 + 20, 'ine', 25.00, 'Fotky zo stavby pre web');

  -- ── Balíky dokumentov pre živnostníka ──────────────────────────────────────
  insert into danubra_bundles (token, worker_id, subcontract_id, assignment_id, title, items, message, channels, lang,
    expires_at, opened_at, open_count, created_by)
  values (replace(gen_random_uuid()::text, '-', ''), w_nov, s4, a4, 'Nástup Klinikum Nord',
    jsonb_build_array(jsonb_build_object('title', 'Infolist na stavbu', 'kind', 'infolist'),
      jsonb_build_object('title', 'Infolist k ubytovaniu', 'kind', 'infolist_lodging'),
      jsonb_build_object('title', 'Objednávka OBJ-VZOR-0007', 'kind', 'objednavka')),
    'Dobrý deň, pán Novotný, v odkaze nájdete všetko k nástupu.', array['whatsapp'], 'sk', now() + interval '20 days',
    now() - interval '1 day', 2, v_admin);
  insert into danubra_bundles (token, worker_id, subcontract_id, assignment_id, title, items, message, channels, lang,
    expires_at, revoked_at, created_by)
  values (replace(gen_random_uuid()::text, '-', ''), w_kov, s1, a1, 'Nástup Isarauen',
    jsonb_build_array(jsonb_build_object('title', 'Infolist na stavbu', 'kind', 'infolist')),
    'Dobrý deň, pán Kováčik, posielame infolist k nástupu.', array['sms'], 'sk', now() + interval '5 days',
    now() - interval '50 days', v_admin);

  -- ══════════════════════════════════════════════════════════════════════════
  -- Ubytovacia agentúra (modul „accommodation" je v Nastaveniach vypnutý;
  -- dáta sú tu, aby obrazovky po zapnutí neboli prázdne)
  -- ══════════════════════════════════════════════════════════════════════════
  insert into danubra_clients (type, name, company_id, vat_id, country, contact_person, phone, whatsapp, email, language,
    retainer, retainer_rate, retainer_from, source, notes)
  values ('company', 'Montáže Šurany s.r.o.', '52418736', 'SK2121234567', 'SK', 'Ing. Pavol Rác', '+421 905 771 204', true,
    'objednavky@montaze-surany.example', 'sk', true, 200, v_m3, 'web', 'Pravidelne ubytúva 4–6 ľudí v Bavorsku.')
  returning id into cl1;
  insert into danubra_clients (type, name, country, contact_person, phone, whatsapp, language, source)
  values ('crew', 'Partia Bencze', 'HU', 'Bencze Tamás', '+36 30 552 7810', true, 'hu', 'whatsapp')
  returning id into cl2;
  insert into danubra_clients (type, name, company_id, country, contact_person, phone, whatsapp, email, language, source)
  values ('sole_trader', 'Radovan Michalík', '45120983', 'SK', 'Radovan Michalík', '+421 911 402 336', true,
    'radovan.michalik@mail.example', 'sk', 'fb')
  returning id into cl3;

  insert into danubra_inquiries (client_id, target_city, postal_code, country, date_from, date_to, persons, budget_per_bed,
    requirements, urgent, channel, status, received_at, first_response_at, notes)
  values (cl1, 'Regensburg', '93053', 'DE', v_d + 10, v_d + 70, 4, 25, array['van_parking', 'kitchen', 'invoice'], false,
    'email', 'offer_sent', now() - interval '6 days', now() - interval '6 days' + interval '20 minutes', null)
  returning id into iq1;
  insert into danubra_inquiries (client_id, target_city, country, date_from, date_to, persons, budget_per_bed, requirements,
    urgent, channel, status, received_at, first_response_at)
  values (cl1, 'München', 'DE', v_m1, v_d + 40, 3, 24, array['kitchen', 'wifi'], false, 'whatsapp', 'accommodated',
    now() - interval '60 days', now() - interval '60 days' + interval '5 minutes')
  returning id into iq2;
  insert into danubra_inquiries (client_id, target_city, country, date_from, date_to, persons, urgent, channel, status, received_at)
  values (cl2, 'Ingolstadt', 'DE', v_d + 3, v_d + 33, 5, true, 'fb', 'new', now() - interval '40 minutes')
  returning id into iq3;
  insert into danubra_inquiries (client_id, target_city, country, date_from, date_to, persons, channel, status, lost_reason,
    received_at, first_response_at)
  values (cl3, 'Nürnberg', 'DE', v_m1, v_m0, 2, 'phone', 'lost', 'Našiel si ubytovanie sám.', now() - interval '45 days',
    now() - interval '45 days' + interval '2 hours')
  returning id into iq4;
  insert into danubra_inquiries (client_id, target_city, country, date_from, date_to, persons, channel, status, received_at, first_response_at)
  values
    (cl3, 'Augsburg', 'DE', v_d + 20, v_d + 50, 2, 'web', 'qualified', now() - interval '2 days', now() - interval '2 days' + interval '9 minutes'),
    (cl1, 'Stuttgart', 'DE', v_m2, v_m1, 3, 'email', 'closed', now() - interval '100 days', now() - interval '100 days' + interval '30 minutes'),
    (cl2, 'Gersthofen', 'DE', v_d + 7, v_d + 37, 4, 'whatsapp', 'won', now() - interval '5 days', now() - interval '5 days' + interval '4 minutes');

  insert into danubra_offers (inquiry_id, client_id, language, service_fee, urgent_surcharge, ongoing_service_enabled,
    ongoing_service_rate, valid_until, status, sent_at, sent_channel)
  values (iq1, cl1, 'sk', 400, false, true, 1.5, v_d + 2, 'sent', now() - interval '5 days', 'email')
  returning id into of1;
  insert into danubra_offers (inquiry_id, client_id, language, service_fee, ongoing_service_enabled, ongoing_service_rate,
    valid_until, status, sent_at, sent_channel)
  values (iq2, cl1, 'sk', 400, true, 1.5, v_m1 - 5, 'accepted', now() - interval '59 days', 'whatsapp')
  returning id into of2;
  insert into danubra_offers (inquiry_id, client_id, language, service_fee, urgent_surcharge, valid_until, status)
  values (iq3, cl2, 'hu', 250, true, v_d + 3, 'draft')
  returning id into of3;
  insert into danubra_offers (inquiry_id, client_id, language, service_fee, valid_until, status, sent_at, sent_channel)
  values (iq4, cl3, 'sk', 150, v_m1 - 10, 'expired', now() - interval '44 days', 'sms')
  returning id into of4;

  insert into danubra_offer_variants (offer_id, accommodation_id, price_per_bed_night, nights, total_accommodation, sort_order)
  values
    (of1, ac5, 24.00, 60, 5760.00, 1),
    (of1, ac4, 20.00, 60, 4800.00, 2),
    (of2, ac1, 22.00, 70, 4620.00, 1),
    (of3, ac3, 19.00, 30, 2850.00, 1),
    (of4, ac4, 21.00, 30, 1260.00, 1);

  -- Objednávky ubytovania — každý stav automatu.
  insert into danubra_orders (order_number, offer_id, inquiry_id, client_id, accommodation_id, date_from, date_to, persons,
    nights, price_per_bed_night, total_accommodation, service_fee, ongoing_service_enabled, ongoing_service_rate, status,
    accepted_at, fee_paid_at, payment_method, owner_confirmed_at, terms_version)
  values ('UBY-VZOR-0001', of2, iq2, cl1, ac1, v_m1, v_d + 40, 3, 70, 22.00, 4620.00, 400, true, 1.5, 'in_progress',
    now() - interval '58 days', now() - interval '57 days', 'bank', now() - interval '56 days', 'v1')
  returning id into or1;
  insert into danubra_orders (order_number, client_id, accommodation_id, date_from, date_to, persons, nights,
    price_per_bed_night, total_accommodation, service_fee, status, accepted_at, terms_version)
  values ('UBY-VZOR-0002', cl2, ac3, v_d + 7, v_d + 37, 4, 30, 19.00, 2280.00, 250, 'awaiting_payment', now() - interval '1 day', 'v1')
  returning id into or2;
  insert into danubra_orders (order_number, client_id, date_from, date_to, persons, service_fee, status, terms_version)
  values ('UBY-VZOR-0003', cl3, v_d + 20, v_d + 50, 2, 150, 'new', 'v1')
  returning id into or3;
  insert into danubra_orders (order_number, client_id, accommodation_id, date_from, date_to, persons, nights,
    price_per_bed_night, total_accommodation, service_fee, status, accepted_at, fee_paid_at, payment_method, terms_version)
  values ('UBY-VZOR-0004', cl1, ac4, v_d + 10, v_d + 70, 4, 60, 20.00, 4800.00, 400, 'paid', now() - interval '2 days',
    now() - interval '1 day', 'bank', 'v1')
  returning id into or4;
  insert into danubra_orders (order_number, client_id, accommodation_id, date_from, date_to, persons, nights,
    price_per_bed_night, total_accommodation, service_fee, status, accepted_at, fee_paid_at, payment_method,
    owner_confirmed_at, terms_version)
  values ('UBY-VZOR-0005', cl2, ac3, v_d + 3, v_d + 33, 2, 30, 19.00, 1140.00, 250, 'owner_confirmed', now() - interval '6 days',
    now() - interval '5 days', 'cash', now() - interval '4 days', 'v1')
  returning id into or5;
  insert into danubra_orders (order_number, client_id, accommodation_id, date_from, date_to, persons, nights,
    price_per_bed_night, total_accommodation, service_fee, ongoing_service_enabled, ongoing_service_rate, status, accepted_at,
    fee_paid_at, payment_method, owner_confirmed_at, terms_version)
  values ('UBY-VZOR-0006', cl1, ac2, v_m1, v_d + 5, 3, 55, 18.00, 2970.00, 400, true, 1.5, 'ending_soon', now() - interval '60 days',
    now() - interval '59 days', 'bank', now() - interval '58 days', 'v1')
  returning id into or6;
  insert into danubra_orders (order_number, client_id, accommodation_id, date_from, date_to, persons, nights,
    price_per_bed_night, total_accommodation, service_fee, status, accepted_at, fee_paid_at, payment_method,
    owner_confirmed_at, terms_version)
  values ('UBY-VZOR-0007', cl1, ac2, v_m3, v_m2, 3, 31, 18.00, 1674.00, 400, 'completed', now() - interval '100 days',
    now() - interval '99 days', 'bank', now() - interval '98 days', 'v1')
  returning id into or7;
  insert into danubra_orders (order_number, client_id, date_from, date_to, persons, service_fee, status, cancellation_reason, terms_version)
  values ('UBY-VZOR-0008', cl3, v_m1, v_m0, 2, 150, 'cancelled', 'Klient zrušil — zákazka mu odpadla.', 'v1')
  returning id into or8;

  insert into danubra_order_persons (order_id, full_name, phone, date_from, date_to)
  values
    (or1, 'Pavol Rác', '+421 905 771 204', v_m1, v_d + 40),
    (or1, 'Miroslav Kuruc', '+421 907 330 118', v_m1, v_d + 40),
    (or1, 'Ladislav Bódi', '+421 918 220 744', v_m1, v_d + 40),
    (or5, 'Bencze Tamás', '+36 30 552 7810', v_d + 3, v_d + 33);
  insert into danubra_order_requests (order_id, title, description, reported_by, priority, status, resolution, resolved_at, created_at)
  values
    (or1, 'Nefunguje práčka', 'Práčka v penzióne netočí.', 'Pavol Rác', 'normal', 'new', null, null, now() - interval '5 hours'),
    (or1, 'Chýba kľúč od garáže', null, 'Miroslav Kuruc', 'high', 'in_progress', null, null, now() - interval '2 days'),
    (or6, 'Hluk od suseda', 'Sused po 22:00 púšťa hudbu.', 'klient', 'normal', 'resolved', 'Majiteľ sa so susedom dohodol.',
     now() - interval '10 days', now() - interval '12 days');
  insert into danubra_order_service_periods (order_id, period_from, period_to, persons, rate, paused, pause_reason)
  values
    (or1, v_m1, v_m0 - 1, 3, 1.5, false, null),
    (or1, v_m0, null, 3, 1.5, false, null),
    (or6, v_m1, v_m1 + 13, 3, 1.5, true, 'Partia bola doma na turnuse.');
  insert into danubra_order_extensions (order_id, previous_date_to, new_date_to, reason)
  values (or1, v_d + 10, v_d + 40, 'Klientovi sa predĺžila zákazka.');
  insert into danubra_documents (order_id, type, language, sent_at, sent_channel, payload)
  values
    (or1, 'handover', 'sk', now() - interval '56 days', 'whatsapp', jsonb_build_object('access_door_code', '4711#')),
    (or1, 'owner_confirmation', 'de', now() - interval '57 days', 'email', jsonb_build_object('persons', 3)),
    (or2, 'payment_request', 'hu', now() - interval '1 day', 'whatsapp', jsonb_build_object('amount', 250)),
    (or4, 'order_confirmation', 'sk', now() - interval '2 days', 'email', jsonb_build_object('amount', 400));

  insert into danubra_invoices (invoice_number, client_id, order_id, type, issue_date, due_date, delivery_date, total,
    currency, vat_regime, status, paid_at)
  values ('VZOR-2026-0011', cl1, or1, 'service_fee', (now() - interval '58 days')::date, (now() - interval '51 days')::date,
    (now() - interval '58 days')::date, 400.00, 'EUR', 'sk_no_vat', 'paid', now() - interval '57 days')
  returning id into i12;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i12, 'Sprostredkovanie ubytovania — objednávka UBY-VZOR-0001', 1, 'ks', 400.00, 400.00);
  insert into danubra_invoices (invoice_number, client_id, order_id, type, issue_date, due_date, delivery_date, total,
    currency, vat_regime, status, billing_period_from, billing_period_to)
  values ('VZOR-2026-0012', cl1, or1, 'ongoing_service', v_d, v_d + 14, v_m0 - 1, 135.00, 'EUR', 'sk_no_vat',
    'draft_pending_approval', v_m1, v_m0 - 1)
  returning id into i13;
  insert into danubra_invoice_items (invoice_id, description, quantity, unit, unit_price, total)
  values (i13, 'Priebežná služba ' || to_char(v_m1, 'MM/YYYY') || ' — 3 osoby × 30 nocí', 90, 'den', 1.50, 135.00);

  insert into danubra_activities (entity_type, entity_id, type, direction, body, source, created_at)
  values
    ('order', or1, 'system', null, 'Stav zmenený: paid → owner_confirmed', 'manual', now() - interval '56 days'),
    ('order', or1, 'whatsapp', 'out', 'Poslaný odovzdávací list s kódom od dverí.', 'manual', now() - interval '56 days');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. Evidencia vzorových dát
  -- ══════════════════════════════════════════════════════════════════════════
  -- Zapisuje sa až na konci a po tabuľkách v poradí „rodič pred dieťaťom".
  -- Mazanie (danubra_demo_purge) ide podľa poradia zápisu odzadu, takže
  -- deti padnú skôr než rodičia a cudzie kľúče ho nezastavia. Zapisujú sa
  -- všetky riadky týchto tabuliek — po kroku 3 v nich nič iné nie je
  -- (vrátane členstva vedúceho, ktoré založil trigger).
  for v_t in select unnest(array[
    'danubra_partners', 'danubra_workers', 'danubra_crews', 'danubra_crew_members', 'danubra_worker_documents',
    'danubra_quotes', 'danubra_contracts', 'danubra_contract_amendments', 'danubra_subcontracts',
    'danubra_recruitment_plans', 'danubra_plan_assets', 'danubra_ads', 'danubra_opportunities',
    'danubra_candidates', 'danubra_candidate_chips', 'danubra_candidate_checks', 'danubra_candidate_notes',
    'danubra_screening_answers', 'danubra_accommodations', 'danubra_subcontract_accommodations', 'danubra_stays',
    'danubra_periods', 'danubra_assignments', 'danubra_assignment_checks', 'danubra_checklist_items',
    'danubra_timesheets', 'danubra_hour_sheets', 'danubra_work_orders',
    'danubra_clients', 'danubra_inquiries', 'danubra_offers', 'danubra_offer_variants', 'danubra_orders',
    'danubra_order_persons', 'danubra_order_requests', 'danubra_order_service_periods', 'danubra_order_extensions',
    'danubra_documents',
    'danubra_invoices', 'danubra_invoice_items', 'danubra_invoice_reminders', 'danubra_bills', 'danubra_advances',
    'danubra_costs', 'danubra_bank_transactions',
    'danubra_consents', 'danubra_call_recordings', 'danubra_promises', 'danubra_compliance', 'danubra_tasks',
    'danubra_activities', 'danubra_message_threads', 'danubra_messages',
    'danubra_leads', 'danubra_lead_searches', 'danubra_campaigns', 'danubra_campaign_sends',
    'danubra_marketing_listings', 'danubra_marketing_expenses', 'danubra_bundles'])
  loop
    -- Poradie v rámci jednej tabuľky nerozhoduje: riadky jednej tabuľky maže
    -- jeden príkaz naraz (aj náklad s rodičom v tej istej tabuľke).
    execute format('select danubra_demo_mark(%L, id) from %I order by id', v_t, v_t);
  end loop;

  raise notice '064: vzorové dáta vymenené, v evidencii % riadkov.', (select count(*) from danubra_demo_ledger);
end $$;
