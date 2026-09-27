-- ============================================================================
-- DANUBRA Hub — 006 — Vzorové dáta
-- ============================================================================
-- Naplní všetky sekcie prepojenými ukážkovými záznamami, aby bolo vidieť,
-- ako appka vyzerá v prevádzke. Dáta sú označené, takže sa dajú kedykoľvek
-- odstrániť (na konci súboru je pripravený mazací príkaz).
--
-- Idempotentné — opakované spustenie nič nezduplikuje.
-- ============================================================================

do $$
declare
  -- ubytovanie
  acc_berlin uuid; acc_muenchen uuid; acc_hamburg uuid; acc_leipzig uuid; acc_koeln uuid;
  cli_kovac uuid; cli_stavmont uuid; cli_horvath uuid;
  inq_berlin uuid; inq_muenchen uuid; inq_leipzig uuid;
  off_berlin uuid; ord_berlin uuid;
  -- subdodávky
  prt_bauer uuid; prt_metall uuid;
  wrk_kovac uuid; wrk_novak uuid; wrk_szabo uuid; wrk_toth uuid; wrk_hudak uuid;
  sub_dielna uuid; sub_stavba uuid;
  asg1 uuid; asg2 uuid; asg3 uuid;
  con_kovac uuid; rec_kovac uuid;
  d date := current_date;
begin
  -- ══ UBYTOVANIA ═══════════════════════════════════════════════════════════
  if not exists (select 1 from danubra_accommodations where name = 'Haus Lindenstraße') then
    insert into danubra_accommodations (name, type, country, city, postal_code, address,
      beds, rooms, max_persons, price_per_bed_night, price_month, min_nights, amenities,
      van_parking, highway_distance_km, invoice_payment, vat_regime,
      owner_name, owner_phone, owner_whatsapp, owner_email, owner_language,
      verification_status, source, access_door_code, wifi_ssid, wifi_password,
      access_key_location, house_rules, deposit_amount, checkin_info, notes)
    values
      ('Haus Lindenstraße', 'haus', 'DE', 'Berlin', '10115', 'Lindenstraße 42',
       12, 5, 12, 18, 480, 7, array['kitchen','washing_machine','wifi','bed_linen'],
       true, 3.5, true, 'mwst', 'Klaus Brenner', '+49 176 2233445', true,
       'brenner@lindenstr.de', 'de', 'verified', 'mein-monteurzimmer.de',
       '4721', 'Linden-Gast', 'gast2026', 'V schránke pri vchode, kód 4721',
       'Od 22:00 nočný kľud. Fajčenie iba na dvore.', 300,
       'Príchod od 14:00, kľúče v schránke.', 'Spoľahlivý, rýchlo odpovedá.'),

      ('Pension Sonnenhof', 'pension', 'DE', 'München', '80331', 'Sonnenstraße 8',
       20, 10, 18, 24, 640, 14, array['wifi','tv','private_bathroom','bed_linen'],
       false, 8, true, 'mwst', 'Petra Wagner', '+49 151 9988776', false,
       'info@sonnenhof-muc.de', 'de', 'verified', 'deutschland-monteurzimmer.de',
       null, 'Sonnenhof', 'willkommen', 'Recepcia, otvorená do 20:00',
       'Raňajky v cene od 6:00.', 200, 'Check-in na recepcii do 20:00.',
       'Drahšie, ale vysoký štandard. Vhodné pre firmy.'),

      ('Monteurwohnung Hafen', 'wohnung', 'DE', 'Hamburg', '20095', 'Hafenweg 15',
       8, 3, 8, 16, 420, 7, array['kitchen','washing_machine','wifi'],
       true, 2, false, 'kleinunternehmer', 'Jörg Petersen', '+49 160 4455667', true,
       null, 'de', 'prices_confirmed', 'monteur-zimmer.info',
       '1905', 'Hafen-WLAN', 'hafen123', 'U susedky v prízemí, byt 2',
       null, 250, null, 'Ceny potvrdené, čaká sa na obhliadku.'),

      ('Zimmer am Bahnhof', 'zimmer', 'DE', 'Leipzig', '04109', 'Bahnhofstraße 3',
       6, 3, 6, 14, 380, 5, array['wifi','bed_linen'],
       true, 5, true, 'mwst', 'Anke Richter', '+49 170 1122334', true,
       'richter.anke@web.de', 'de', 'contacted', 'referral',
       null, null, null, null, null, 150, null, 'Zatiaľ len prvý kontakt.'),

      ('Haus Rheinblick', 'haus', 'DE', 'Köln', '50667', 'Rheinallee 77',
       14, 6, 14, 20, 520, 10, array['kitchen','wifi','tv','washing_machine'],
       true, 4, true, 'mwst', 'Michael Schulz', '+49 152 7788990', false,
       'schulz@rheinblick.de', 'de', 'new', 'auftragsbank.de',
       null, null, null, null, null, null, null, 'Nový kontakt z portálu.');
  end if;

  select id into acc_berlin   from danubra_accommodations where name = 'Haus Lindenstraße' limit 1;
  select id into acc_muenchen from danubra_accommodations where name = 'Pension Sonnenhof' limit 1;
  select id into acc_hamburg  from danubra_accommodations where name = 'Monteurwohnung Hafen' limit 1;
  select id into acc_leipzig  from danubra_accommodations where name = 'Zimmer am Bahnhof' limit 1;
  select id into acc_koeln    from danubra_accommodations where name = 'Haus Rheinblick' limit 1;

  -- ══ KLIENTI (ubytovanie) ═════════════════════════════════════════════════
  if not exists (select 1 from danubra_clients where name = 'Ján Kováč') then
    insert into danubra_clients (type, name, company_id, vat_id, country, contact_person,
      phone, whatsapp, email, language, retainer, retainer_rate, source, notes)
    values
      ('sole_trader', 'Ján Kováč', '51234567', null, 'SK', 'Ján Kováč',
       '+421905123456', true, 'jan.kovac@gmail.com', 'sk', false, null,
       'referral', 'Prvý klient. Vozí partiu na sadrokartón.'),
      ('company', 'STAVMONT s.r.o.', '46789123', 'SK2023456789', 'SK', 'Peter Blaho',
       '+421918777888', true, 'blaho@stavmont.sk', 'sk', true, 200,
       'profesia.sk', 'Pravidelný odberateľ, 8–12 ľudí priebežne.'),
      ('crew', 'Parta Horváth', null, null, 'HU', 'László Horváth',
       '+36 30 1234567', true, 'horvath.laszlo@gmail.com', 'hu', false, null,
       'facebook', 'Maďarská parta, obklady a murárske práce.');
  end if;

  select id into cli_kovac    from danubra_clients where name = 'Ján Kováč' limit 1;
  select id into cli_stavmont from danubra_clients where name = 'STAVMONT s.r.o.' limit 1;
  select id into cli_horvath  from danubra_clients where name = 'Parta Horváth' limit 1;

  -- ══ DOPYTY ═══════════════════════════════════════════════════════════════
  if not exists (select 1 from danubra_inquiries where notes like 'Vzorový dopyt%') then
    insert into danubra_inquiries (client_id, target_city, postal_code, country,
      date_from, date_to, persons, budget_per_bed, requirements, urgent, channel,
      status, received_at, first_response_at, notes)
    values
      (cli_kovac, 'Berlin', '10115', 'DE', d + 14, d + 104, 6, 20,
       array['van_parking','kitchen'], false, 'whatsapp', 'won',
       now() - interval '9 days', now() - interval '9 days' + interval '40 minutes',
       'Vzorový dopyt — partia na sadrokartón, potrebujú parkovanie pre dodávku.'),

      (cli_stavmont, 'München', '80331', 'DE', d + 21, d + 141, 10, 26,
       array['kitchen','washing_machine','invoice'], false, 'email', 'offer_sent',
       now() - interval '4 days', now() - interval '4 days' + interval '2 hours',
       'Vzorový dopyt — firma, nutná faktúra a práčka.'),

      (cli_horvath, 'Leipzig', '04109', 'DE', d + 7, d + 67, 4, 16,
       array['van_parking'], true, 'fb', 'new',
       now() - interval '1 day', null,
       'Vzorový dopyt — súrne, nástup o týždeň. Zatiaľ bez reakcie.');
  end if;

  select id into inq_berlin   from danubra_inquiries where target_city = 'Berlin'  and notes like 'Vzorový%' limit 1;
  select id into inq_muenchen from danubra_inquiries where target_city = 'München' and notes like 'Vzorový%' limit 1;
  select id into inq_leipzig  from danubra_inquiries where target_city = 'Leipzig' and notes like 'Vzorový%' limit 1;

  -- ══ PONUKA + OBJEDNÁVKA ══════════════════════════════════════════════════
  if not exists (select 1 from danubra_orders where order_number = 'OBJ-2026-0042') then
    insert into danubra_offers (inquiry_id, client_id, language, service_fee,
      urgent_surcharge, ongoing_service_enabled, ongoing_service_rate, valid_until,
      status, sent_at, sent_channel)
    values (inq_berlin, cli_kovac, 'sk', 250, false, true, 1.5, d + 5,
      'accepted', now() - interval '8 days', 'whatsapp')
    returning id into off_berlin;

    insert into danubra_offer_variants (offer_id, accommodation_id, price_per_bed_night,
      nights, total_accommodation, sort_order)
    values
      (off_berlin, acc_berlin,  18, 90, 18 * 6 * 90, 0),
      (off_berlin, acc_hamburg, 16, 90, 16 * 6 * 90, 1);

    insert into danubra_orders (order_number, offer_id, inquiry_id, client_id, accommodation_id,
      date_from, date_to, persons, nights, price_per_bed_night, total_accommodation,
      service_fee, ongoing_service_enabled, ongoing_service_rate, status,
      accepted_at, fee_paid_at, owner_confirmed_at, notes)
    values ('OBJ-2026-0042', off_berlin, inq_berlin, cli_kovac, acc_berlin,
      d - 16, d + 74, 6, 90, 18, 9720, 250, true, 1.5, 'in_progress',
      now() - interval '8 days', now() - interval '7 days', now() - interval '6 days',
      'Vzorová objednávka — prebiehajúci pobyt.')
    returning id into ord_berlin;

    insert into danubra_order_persons (order_id, full_name, phone, date_from, date_to) values
      (ord_berlin, 'Ján Kováč',     '+421905123456', d - 16, d + 74),
      (ord_berlin, 'Marek Sedlák',  '+421907222333', d - 16, d + 74),
      (ord_berlin, 'Pavol Krajčí',  '+421908444555', d - 16, d + 74),
      (ord_berlin, 'Tomáš Bednár',  '+421903666777', d - 16, d + 74);

    insert into danubra_order_service_periods (order_id, period_from, period_to, persons, rate, paused)
    values (ord_berlin, d - 16, null, 6, 1.5, false);

    insert into danubra_order_requests (order_id, title, description, reported_by, priority, status)
    values
      (ord_berlin, 'Nefunguje bojler', 'Od pondelka tečie iba studená voda v kúpeľni na poschodí.',
       'Ján Kováč', 'high', 'resolved'),
      (ord_berlin, 'Chýbajú kľúče od brány', 'Dostali sme len jeden kľúč pre šesť ľudí.',
       'Marek Sedlák', 'normal', 'new');

    insert into danubra_documents (order_id, type, language, payload)
    values (ord_berlin, 'handover', 'sk', jsonb_build_object(
      'address', 'Lindenstraße 42', 'city', 'Berlin', 'postal_code', '10115',
      'owner_name', 'Klaus Brenner', 'owner_phone', '+49 176 2233445',
      'access_door_code', '4721', 'wifi_ssid', 'Linden-Gast', 'wifi_password', 'gast2026',
      'access_key_location', 'V schránke pri vchode, kód 4721', 'deposit_amount', 300));

    -- entity_type je typ entity, nie jej id — inak sa záznamy v detaile nezobrazia
    insert into danubra_activities (entity_type, entity_id, type, direction, body) values
      ('order', ord_berlin, 'system', null, 'Stav: awaiting_payment → paid'),
      ('order', ord_berlin, 'whatsapp', 'out', 'Poslané pokyny na ubytovanie vrátane kódu dverí.');
  end if;

  select id into ord_berlin from danubra_orders where order_number = 'OBJ-2026-0042' limit 1;

  -- ══ ODBERATELIA V NEMECKU ════════════════════════════════════════════════
  if not exists (select 1 from danubra_partners where name = 'Bauer Bau GmbH') then
    insert into danubra_partners (name, ust_idnr, address, city, postal_code, country,
      contact_person, phone, email, payment_terms_days, is_construction,
      factoring_eligible, rating, source, notes)
    values
      ('Bauer Bau GmbH', 'DE811234567', 'Industriestraße 12', 'Leipzig', '04329', 'DE',
       'Thomas Bauer', '+49 341 5566778', 'bauer@bauerbau.de', 45, true, true, 'b',
       'auftragsbank.de', 'Vzorový odberateľ — stavebné dokončovacie práce.'),
      ('Metallbau Sommer KG', 'DE815554433', 'Am Gewerbepark 5', 'Chemnitz', '09114', 'DE',
       'Andrea Sommer', '+49 371 2233445', 'a.sommer@metallbau-sommer.de', 30, false, false, 'a',
       'referral', 'Vzorový odberateľ — dielenské a kovoobrábacie práce, platí načas.');
  end if;

  select id into prt_bauer  from danubra_partners where name = 'Bauer Bau GmbH' limit 1;
  select id into prt_metall from danubra_partners where name = 'Metallbau Sommer KG' limit 1;

  -- ══ PRACOVNÍCI ═══════════════════════════════════════════════════════════
  if not exists (select 1 from danubra_workers where full_name = 'Miroslav Ferenc') then
    insert into danubra_workers (full_name, phone, whatsapp, email, language, city, country,
      profession, skill_level, skills, german_level, driving_licence, own_tools,
      employment_type, gross_monthly, per_diem_daily, status, available_from, source, notes)
    values
      ('Miroslav Ferenc', '+421905334455', true, 'm.ferenc@gmail.com', 'sk', 'Nitra', 'SK',
       'zvarac', 'fachwerker', array['MAG','TIG','čítanie výkresov'], 'zaklad', true, true,
       'tpp', 2800, 45, 'deployed', d - 60, 'referral', 'Skúsený zvárač, pracoval v DE tri roky.'),
      ('Ladislav Tóth', '+421918556677', true, 'l.toth@gmail.com', 'hu', 'Komárno', 'SK',
       'cnc', 'fachwerker', array['CNC frézovanie','meranie'], 'zaklad', true, false,
       'tpp', 2700, 45, 'deployed', d - 60, 'profesia.sk', 'Hovorí po maďarsky aj slovensky.'),
      ('Peter Hudák', '+421903778899', true, null, 'sk', 'Prešov', 'SK',
       'trockenbau', 'fachwerker', array['sadrokartón','tmelenie'], 'ziadny', true, true,
       'tpp', 2600, 45, 'ready', d + 14, 'referral', 'Pripravený na nástup, čaká na zákazku.'),
      ('Marek Novák', '+421907991122', true, null, 'sk', 'Žilina', 'SK',
       'murar', 'werker', array['murovanie','omietky'], 'ziadny', false, false,
       'tpp', 2100, 45, 'screening', d + 30, 'facebook', 'Preveruje sa, chýbajú doklady.'),
      ('Zoltán Szabó', '+36 30 4455667', true, null, 'hu', 'Győr', 'HU',
       'obkladac', 'fachwerker', array['obklady','dlažby'], 'dobry', true, true,
       'zivnost', null, 45, 'candidate', d + 45, 'facebook', 'Kandidát, zatiaľ len telefonát.');
  end if;

  select id into wrk_kovac from danubra_workers where full_name = 'Miroslav Ferenc' limit 1;
  select id into wrk_toth  from danubra_workers where full_name = 'Ladislav Tóth' limit 1;
  select id into wrk_hudak from danubra_workers where full_name = 'Peter Hudák' limit 1;
  select id into wrk_novak from danubra_workers where full_name = 'Marek Novák' limit 1;
  select id into wrk_szabo from danubra_workers where full_name = 'Zoltán Szabó' limit 1;

  -- doklady pracovníkov (A1 s rôznymi platnosťami — nech je vidieť upozornenia)
  if not exists (select 1 from danubra_worker_documents where worker_id = wrk_kovac and kind = 'a1') then
    insert into danubra_worker_documents (worker_id, kind, reference, valid_from, valid_to, status) values
      (wrk_kovac, 'a1', 'A1-2026-0142', d - 60, d + 300, 'valid'),
      (wrk_kovac, 'medical', 'LP-2026-88', d - 90, d + 275, 'valid'),
      (wrk_toth,  'a1', 'A1-2026-0143', d - 60, d + 25,  'valid'),   -- čoskoro vyprší
      (wrk_hudak, 'a1', 'A1-2026-0151', d - 5,  d + 350, 'valid'),
      (wrk_novak, 'passport', 'SK1234567', d - 400, d + 900, 'valid');
      -- Marek Novák zámerne bez A1 — v compliance sa objaví ako problém
  end if;

  -- ══ ZÁKAZKY (subdodávky) ═════════════════════════════════════════════════
  if not exists (select 1 from danubra_subcontracts where contract_number = 'ZAK-2026-0001') then
    insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade,
      site_name, site_address, site_city, site_postal_code, date_from, date_to, scope,
      billing_model, charge_rate, freistellung_verified, status, won_at, notes)
    values ('ZAK-2026-0001', prt_metall, 'Zváranie oceľových konštrukcií', 'workshop', 'zvaranie',
      'Dielňa Chemnitz', 'Am Gewerbepark 5', 'Chemnitz', '09114', d - 30, d + 60,
      'Zváranie a montáž oceľových rámov podľa výkresovej dokumentácie, 240 kusov. '
      || 'Vrátane kontroly zvarov a povrchovej úpravy.',
      'hourly', 34, false, 'active', now() - interval '35 days',
      'Vzorová zákazka — dielenské práce, nízka regulácia.')
    returning id into sub_dielna;

    insert into danubra_subcontracts (contract_number, partner_id, title, work_type, trade,
      site_name, site_address, site_city, site_postal_code, date_from, date_to, scope,
      billing_model, charge_rate, freistellung_verified, status, notes)
    values ('ZAK-2026-0002', prt_bauer, 'Sadrokartónové priečky — bytový dom', 'construction', 'trockenbau',
      'Novostavba Leipzig-Süd', 'Kurt-Eisner-Straße 40', 'Leipzig', '04275', d + 20, d + 140,
      'Montáž sadrokartónových priečok vrátane tmelenia a brúsenia, 820 m².',
      'unit', 38, false, 'negotiation',
      'Vzorová zákazka — stavba, čaká na doriešenie compliance.')
    returning id into sub_stavba;

    -- nasadenia na dielenskú zákazku
    insert into danubra_assignments (subcontract_id, worker_id, date_from, date_to, role,
      charge_rate, gross_monthly, per_diem_daily, accommodation_monthly, transport_monthly, status)
    values (sub_dielna, wrk_kovac, d - 30, d + 60, 'predak', 34, 2800, 45, 350, 150, 'active')
    returning id into asg1;

    insert into danubra_assignments (subcontract_id, worker_id, date_from, date_to, role,
      charge_rate, gross_monthly, per_diem_daily, accommodation_monthly, transport_monthly, status)
    values (sub_dielna, wrk_toth, d - 30, d + 60, 'pracovnik', 34, 2700, 45, 350, 150, 'active')
    returning id into asg2;

    -- odpracované hodiny za posledné dni (dielňa + trocha stavby)
    insert into danubra_timesheets (assignment_id, worker_id, work_date, hours, activity_type, description, approved)
    select asg1, wrk_kovac, d - i, 8, 'workshop', 'Zváranie rámov podľa výkresu', true
    from generate_series(1, 12) i where extract(dow from d - i) between 1 and 5;

    insert into danubra_timesheets (assignment_id, worker_id, work_date, hours, activity_type, description, approved)
    select asg2, wrk_toth, d - i, 8, 'workshop', 'CNC frézovanie dielcov', true
    from generate_series(1, 12) i where extract(dow from d - i) between 1 and 5;

    -- pár nepotvrdených záznamov, nech je vidieť upozornenie
    insert into danubra_timesheets (assignment_id, worker_id, work_date, hours, activity_type, description, approved)
    values (asg1, wrk_kovac, d - 1, 8, 'workshop', 'Kontrola zvarov', false),
           (asg2, wrk_toth,  d - 1, 6, 'workshop', 'Meranie a dokončenie série', false);
  end if;

  select id into sub_dielna from danubra_subcontracts where contract_number = 'ZAK-2026-0001' limit 1;
  select id into sub_stavba from danubra_subcontracts where contract_number = 'ZAK-2026-0002' limit 1;

  -- ══ COMPLIANCE (firemné položky) ═════════════════════════════════════════
  if not exists (select 1 from danubra_compliance where scope = 'company' and kind = 'ust_idnr') then
    insert into danubra_compliance (scope, kind, reference, valid_from, valid_to, status, responsible, notes) values
      ('company', 'ust_idnr', 'DE327654321', d - 200, null, 'active', 'Michaela',
       'Pridelené nemeckým Finanzamtom.'),
      ('company', 'insurance', 'BHV-2026-4471', d - 120, d + 245, 'active', 'Štefan',
       'Betriebshaftpflicht, poistná suma 3 mil. €.'),
      ('company', 'freistellung_48b', null, null, null, 'pending', 'Michaela',
       'Podaná žiadosť cez ELSTER, čaká sa na vydanie. Dovtedy zrážka 15 % pri stavebných prácach.'),
      ('company', 'soka_registration', null, null, null, 'pending', 'účtovník',
       'Rieši sa pred začiatkom stavebnej zákazky ZAK-2026-0002.');
  end if;

  -- ══ MARKETING ════════════════════════════════════════════════════════════
  if not exists (select 1 from danubra_marketing_listings where platform = 'mein-monteurzimmer') then
    insert into danubra_marketing_listings (platform, listing_type, url, language,
      published_at, renew_at, status, performance_note) values
      ('mein-monteurzimmer', 'ubytovanie', 'https://mein-monteurzimmer.de', 'de',
       d - 60, d + 5, 'active', 'Najviac dopytov, jednoznačne sa oplatí obnoviť.'),
      ('auftragsbank', 'subdodávky', 'https://auftragsbank.de', 'de',
       d - 40, d + 50, 'active', 'Odtiaľ prišiel Bauer Bau.'),
      ('profesia', 'nábor', 'https://profesia.sk', 'sk',
       d - 25, d + 5, 'active', 'Slabšie ako odporúčania, ale niečo prinesie.'),
      ('facebook', 'nábor', null, 'sk',
       d - 90, d - 10, 'expired', 'Skupiny „Práca v Nemecku" fungujú lepšie než platená reklama.');

    insert into danubra_marketing_expenses (spent_at, channel, amount, note) values
      (d - 55, 'portal', 89, 'mein-monteurzimmer.de — ročný inzerát'),
      (d - 38, 'portal', 120, 'Auftragsbank.de — členstvo'),
      (d - 22, 'portal', 60, 'profesia.sk — inzerát na nábor'),
      (d - 12, 'referral', 150, 'Odmena za privedeného zvárača'),
      (d - 5,  'ads', 45, 'Facebook — testovacia kampaň na nábor');
  end if;

  -- ══ ÚLOHY ════════════════════════════════════════════════════════════════
  if to_regclass('public.danubra_tasks') is not null
     and not exists (select 1 from danubra_tasks where title like 'Doriešiť §48b%') then
    insert into danubra_tasks (title, description, entity_type, entity_id, entity_label,
      priority, status, due_date, assigned_name, source) values
      ('Doriešiť §48b pred stavebnou zákazkou',
       'Bez Freistellungsbescheinigung zrazí Bauer Bau 15 % z každej faktúry.',
       'subcontract', sub_stavba, 'ZAK-2026-0002', 'high', 'in_progress', d + 10, 'Michaela', 'manual'),
      ('Registrácia SOKA-BAU',
       'Nutná pred začiatkom prác na sadrokartóne — stavebné hodiny presiahnu polovicu.',
       'subcontract', sub_stavba, 'ZAK-2026-0002', 'high', 'open', d + 12, 'účtovník', 'manual'),
      ('Požiadať o nové A1 pre Ladislava Tótha',
       'Súčasné A1 platí už len necelý mesiac, vystavenie trvá až 45 dní.',
       'worker', wrk_toth, 'Ladislav Tóth', 'high', 'open', d + 3, 'Štefan', 'manual'),
      ('Ozvať sa parte Horváth',
       'Súrny dopyt na Leipzig, zatiaľ bez reakcie.',
       'inquiry', inq_leipzig, 'Leipzig, 4 osoby', 'high', 'open', d, 'Štefan', 'manual'),
      ('Obnoviť inzerát mein-monteurzimmer.de',
       'Končí o päť dní, prináša najviac dopytov.',
       null, null, null, 'normal', 'open', d + 4, 'Štefan', 'manual'),
      ('Doplniť doklady Mareka Nováka',
       'Chýba A1 aj lekárska prehliadka, bez nich sa nedá nasadiť.',
       'worker', wrk_novak, 'Marek Novák', 'normal', 'open', d + 7, 'Štefan', 'manual'),
      ('Vyriešiť kľúče od brány v Berlíne',
       'Partia má jeden kľúč pre šesť ľudí, dohodnúť s majiteľom ďalšie.',
       'order', ord_berlin, 'OBJ-2026-0042', 'normal', 'open', d + 1, 'Štefan', 'manual'),
      ('Dohodnúť faktoring',
       'Pred škálovaním nad osem ľudí — inak nevyjde pracovný kapitál.',
       null, null, null, 'high', 'open', d + 21, 'Michaela', 'manual');
  end if;

  -- ══ AI NÁBOR ═════════════════════════════════════════════════════════════
  if to_regclass('public.danubra_consents') is not null
     and not exists (select 1 from danubra_consents where subject_id = wrk_hudak) then
    insert into danubra_consents (subject_type, subject_id, subject_name, subject_phone,
      kind, granted, granted_at, method, evidence_note, language, retention_until)
    values ('worker', wrk_hudak, 'Peter Hudák', '+421903778899', 'call_recording', true,
      now() - interval '6 days', 'verbal_recorded',
      'Na začiatku nahrávky zaznelo: „Áno, súhlasím s nahrávaním." (0:14)', 'sk', d + 174)
    returning id into con_kovac;

    insert into danubra_call_recordings (subject_type, subject_id, subject_name, subject_phone,
      consent_id, consent_confirmed, audio_url, duration_seconds, language, recorded_at,
      status, transcript, summary, extraction, processed_at, delete_after)
    values ('worker', wrk_hudak, 'Peter Hudák', '+421903778899', con_kovac, true,
      'https://example.invalid/vzor/hovor-hudak.m4a', 512, 'sk', now() - interval '6 days',
      'done',
      'Dobrý deň, volám z DANUBRA. Tento hovor by sme si radi nahrali... Áno, súhlasím. '
      || 'Takže ide o sadrokartón v Lipsku, nástup dvadsiateho. Hrubá mzda dvetisícšesťsto, '
      || 'diéty štyridsaťpäť eur na deň. Ubytovanie zabezpečujeme my, platíme ho z našej strany. '
      || 'Doprava — prvú cestu hradíme, ďalšie si riešite sami. Osem hodín denne, soboty podľa dohody.',
      'Peter Hudák nastupuje na sadrokartónovú zákazku v Lipsku. Dohodli sme hrubú mzdu 2 600 € '
      || 'a diéty 45 € na deň. Ubytovanie hradíme my, prvú cestu tiež. Pracovný čas osem hodín denne, '
      || 'soboty len po dohode. Termín nástupu je dvadsiateho.',
      jsonb_build_object('open_questions', jsonb_build_array(
        'Nedohodlo sa, ako sa riešia soboty a či sú platené inak.',
        'Nepadlo, kto hradí spiatočnú cestu.')),
      now() - interval '6 days', d + 174)
    returning id into rec_kovac;

    insert into danubra_promises (recording_id, subject_type, subject_id, kind, statement,
      value_text, value_number, value_date, confidence, status) values
      (rec_kovac, 'worker', wrk_hudak, 'wage', 'Hrubá mzda 2 600 € mesačne.',
       '2600 € hrubého', 2600, null, 0.95, 'open'),
      (rec_kovac, 'worker', wrk_hudak, 'per_diem', 'Diéty 45 € za každý odpracovaný deň.',
       '45 € na deň', 45, null, 0.93, 'open'),
      (rec_kovac, 'worker', wrk_hudak, 'accommodation', 'Ubytovanie zabezpečuje a hradí zamestnávateľ.',
       'hradíme my', null, null, 0.9, 'fulfilled'),
      (rec_kovac, 'worker', wrk_hudak, 'start_date', 'Nástup dvadsiateho.',
       'dvadsiateho', null, d + 14, 0.7, 'open'),
      (rec_kovac, 'worker', wrk_hudak, 'transport', 'Prvú cestu hradí zamestnávateľ, ďalšie si rieši pracovník.',
       'prvá cesta hradená', null, null, 0.85, 'open'),
      (rec_kovac, 'worker', wrk_hudak, 'working_hours', 'Osem hodín denne, soboty podľa dohody.',
       '8 h denne', 8, null, 0.6, 'open');
  end if;

  raise notice 'Vzorové dáta sú pripravené.';
end $$;

-- ============================================================================
-- Odstránenie vzorových dát (spustiť len ak ich už netreba):
--
--   delete from danubra_promises where subject_id in (select id from danubra_workers);
--   delete from danubra_call_recordings where audio_url like '%example.invalid%';
--   delete from danubra_consents where evidence_note like '%0:14%';
--   delete from danubra_tasks;
--   delete from danubra_timesheets;
--   delete from danubra_assignments;
--   delete from danubra_subcontracts where contract_number in ('ZAK-2026-0001','ZAK-2026-0002');
--   delete from danubra_workers;
--   delete from danubra_partners;
--   delete from danubra_marketing_expenses; delete from danubra_marketing_listings;
--   delete from danubra_compliance where scope = 'company';
--   delete from danubra_orders where order_number = 'OBJ-2026-0042';
--   delete from danubra_offers; delete from danubra_inquiries where notes like 'Vzorový%';
--   delete from danubra_clients; delete from danubra_accommodations;
-- ============================================================================

select 'ubytovania' t, count(*) from danubra_accommodations
union all select 'klienti', count(*) from danubra_clients
union all select 'dopyty', count(*) from danubra_inquiries
union all select 'objednávky', count(*) from danubra_orders
union all select 'pracovníci', count(*) from danubra_workers
union all select 'odberatelia', count(*) from danubra_partners
union all select 'zákazky', count(*) from danubra_subcontracts
union all select 'hodiny', count(*) from danubra_timesheets;
