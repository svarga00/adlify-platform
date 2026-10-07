-- ============================================================================
-- 042 — vzorové dáta tam, kde chýbali
-- ============================================================================
-- Vzorové dáta z migrácie 027 pokrývali dvadsaťdva tabuliek. Šesť obrazoviek
-- sa však otvára prázdnych, a prázdna obrazovka vyzerá rovnako ako pokazená:
--
--   Objednávky              — tabuľka je nová (041), nemala čo obsahovať
--   Výkaz pre odberateľa    — ani jeden uložený a podpísaný výkaz
--   Správy                  — ani jedno vlákno
--   Zmluvy → dodatky        — zmluva bez dodatku nepovie, ako dodatok vyzerá
--   Checklist pred nasadením — jediný ručný bod nebol nikdy odškrtnutý
--
-- Siedma bola výnimka pri nasadení. Tú sa vzorovo založiť **nedá** a je to
-- správne — vysvetlenie je nižšie pri jej bloku.
--
-- Vkladá sa **len to, čo chýba**: každý blok si najprv overí, či už vzorový
-- záznam nemá. Opakované spustenie teda nič nezdvojí.
--
-- Všetko sa zapisuje do `danubra_demo_ledger`, takže „Vymazať vzorové dáta"
-- to odstráni presne a ostrých záznamov sa nedotkne.
--
-- Záznamy sa hľadajú podľa obchodných kľúčov (číslo zmluvy, názov zákazky,
-- meno), nie podľa natvrdo zapísaných id — tie sú v každej databáze iné.
-- Keď vzorový podklad chýba, blok sa preskočí a napíše to.
-- ============================================================================
do $$
declare
  v_sub_feuerbach uuid;
  v_sub_schule    uuid;
  v_sub_zvaranie  uuid;
  v_partner_vogel uuid;
  v_partner_hart  uuid;
  v_asg_novak     uuid;
  v_asg_toth      uuid;
  v_crew_nitra    uuid;
  v_contract      uuid;
  v_thread        uuid;
  v_id            uuid;
  v_rok           int := extract(isoyear from current_date - 7)::int;
  v_tyzden        int := extract(week   from current_date - 7)::int;
begin
  select id into v_sub_feuerbach from danubra_subcontracts where title like 'Wohnpark Feuerbach%' limit 1;
  select id into v_sub_schule    from danubra_subcontracts where title like 'Sanierung Schulzentrum%' limit 1;
  select id into v_sub_zvaranie  from danubra_subcontracts where title like 'Zváranie%' limit 1;
  select id into v_partner_vogel from danubra_partners where name like 'Bauunternehmen Vogel%' limit 1;
  select id into v_partner_hart  from danubra_partners where name like 'Hartmann Bau%' limit 1;
  select id into v_crew_nitra    from danubra_crews where name like 'Partia Nitra%' limit 1;
  select id into v_contract      from danubra_contracts where contract_number = 'ZML-VZOR-001' limit 1;

  select a.id into v_asg_novak from danubra_assignments a
    join danubra_workers w on w.id = a.worker_id
    where w.full_name = 'Ján Novák' and a.subcontract_id = v_sub_feuerbach limit 1;
  select a.id into v_asg_toth from danubra_assignments a
    join danubra_workers w on w.id = a.worker_id
    where w.full_name = 'Ladislav Tóth' limit 1;

  if v_sub_feuerbach is null then
    raise notice 'Preskočené — vzorové zákazky v databáze nie sú.';
    return;
  end if;

  -- ── Objednávky ────────────────────────────────────────────────────────────
  -- Dve od odberateľa (jedna potvrdená aj s jeho číslom, jedna čerstvá)
  -- a dve živnostníkom. Tá druhá má úmyselne **pevnú cenu** — pri Werkvertrag
  -- je to silnejší doklad než hodinová sadzba a nech je vidieť oboje.
  if not exists (select 1 from danubra_demo_ledger where table_name = 'danubra_work_orders') then
    if v_partner_vogel is not null then
      insert into danubra_work_orders
        (order_number, kind, status, title, scope, date_from, date_to,
         price_model, rate, partner_id, subcontract_id, contract_id, their_ref,
         received_at, confirmed_at)
      values ('OBJ-VZOR-0001', 'customer', 'confirmed',
        'Trockenbau 2. OG, Block B',
        'Trockenbauwände im 2. Obergeschoss, Block B: Ständerwerk, einlagige '
        || 'Beplankung beidseitig, Verspachtelung Q2. Türöffnungen laut Plan.',
        current_date - 55, current_date + 75, 'hourly', 34.00,
        v_partner_vogel, v_sub_feuerbach, v_contract, '4500-2026-8871',
        current_date - 60, now() - interval '58 days')
      returning id into v_id;
      perform danubra_demo_mark('danubra_work_orders', v_id);
    end if;

    if v_partner_hart is not null and v_sub_schule is not null then
      insert into danubra_work_orders
        (order_number, kind, status, title, scope, date_from, date_to,
         price_model, rate, partner_id, subcontract_id, their_ref, received_at)
      values ('OBJ-VZOR-0002', 'customer', 'sent',
        'Sanierung — Innenausbau',
        'Innenausbau Bauabschnitt 1 nach Leistungsverzeichnis.',
        current_date - 15, current_date + 130, 'hourly', 36.00,
        v_partner_hart, v_sub_schule, 'BST-2026-1140', current_date - 18)
      returning id into v_id;
      perform danubra_demo_mark('danubra_work_orders', v_id);
    end if;

    if v_asg_novak is not null then
      insert into danubra_work_orders
        (order_number, kind, status, title, scope, date_from, date_to,
         price_model, rate, worker_id, assignment_id, subcontract_id, accepted_at)
      select 'OBJ-VZOR-0003', 'worker', 'confirmed',
        'Sadrokartón 2. NP, blok B',
        'Montáž sadrokartónových priečok na 2. NP, blok B: nosný rošt, '
        || 'jednoduché opláštenie z oboch strán, tmelenie do stupňa Q2. '
        || 'Otvory pre dvere podľa výkresu. Materiál dodá objednávateľ.',
        current_date - 55, current_date + 75, 'hourly', 18.00,
        a.worker_id, a.id, a.subcontract_id, now() - interval '54 days'
      from danubra_assignments a where a.id = v_asg_novak
      returning id into v_id;
      perform danubra_demo_mark('danubra_work_orders', v_id);
    end if;

    if v_asg_toth is not null then
      insert into danubra_work_orders
        (order_number, kind, status, title, scope, date_from, date_to,
         price_model, fixed_price, worker_id, assignment_id, subcontract_id)
      select 'OBJ-VZOR-0004', 'worker', 'sent',
        'Zváranie nosníkov — hala C',
        'Zváranie oceľových nosníkov v hale C podľa výkresu 24-C-07. '
        || 'Kútové zvary a3, vizuálna kontrola po každej sekcii. '
        || 'Rozsah 42 spojov.',
        current_date - 10, current_date + 20, 'fixed', 3800.00,
        a.worker_id, a.id, a.subcontract_id
      from danubra_assignments a where a.id = v_asg_toth
      returning id into v_id;
      perform danubra_demo_mark('danubra_work_orders', v_id);
    end if;
    raise notice 'Objednávky doplnené.';
  end if;

  -- ── Výkaz pre odberateľa ──────────────────────────────────────────────────
  -- Jeden uložený a **podpísaný** výkaz za minulý týždeň. Bez neho sa nedá
  -- vidieť, čo sa po podpise zmrazí.
  if v_crew_nitra is not null
     and not exists (select 1 from danubra_demo_ledger where table_name = 'danubra_hour_sheets') then
    insert into danubra_hour_sheets
      (crew_id, subcontract_id, iso_year, iso_week, total_hours,
       signed_at, signed_by_name, note)
    values (v_crew_nitra, v_sub_feuerbach, v_rok, v_tyzden, 85.5,
      now() - interval '3 days', 'Klaus Berger',
      'Podpísané na stavbe, originál odovzdaný polierovi.')
    returning id into v_id;
    perform danubra_demo_mark('danubra_hour_sheets', v_id);
    raise notice 'Výkaz doplnený.';
  end if;

  -- ── Správy ────────────────────────────────────────────────────────────────
  -- Jedno vlákno pri zákazke: interná poznámka a jedna správa vo fronte.
  -- Fronta je dôležitá — appka nikde netvrdí, že odoslala, kým kľúč nie je.
  if v_partner_vogel is not null
     and not exists (select 1 from danubra_demo_ledger where table_name = 'danubra_message_threads') then
    insert into danubra_message_threads
      (subject, entity_type, entity_id, party_type, party_id, party_name,
       to_email, channel, status, last_at)
    values ('Termín na 2. NP', 'subcontract', v_sub_feuerbach,
      'partner', v_partner_vogel, 'Bauunternehmen Vogel GmbH',
      'vogel@example.de', 'email', 'open', now() - interval '2 days')
    returning id into v_thread;
    perform danubra_demo_mark('danubra_message_threads', v_thread);

    insert into danubra_messages
      (thread_id, direction, channel, body, status, author_name, created_at)
    values (v_thread, 'internal', 'note',
      'Polier volal, že 2. NP sa uvoľní až o týždeň. Treba posunúť nástup '
      || 'dvoch ľudí, inak budú stáť.', 'noted', 'Štefan',
      now() - interval '2 days')
    returning id into v_id;
    perform danubra_demo_mark('danubra_messages', v_id);

    insert into danubra_messages
      (thread_id, direction, channel, subject, body, to_email, status,
       queued_at, author_name, created_at)
    values (v_thread, 'out', 'email', 'Terminverschiebung 2. OG',
      'Guten Tag, wir haben erfahren, dass das 2. Obergeschoss erst eine Woche '
      || 'später frei wird. Können Sie uns den neuen Termin bestätigen?',
      'vogel@example.de', 'queued', now() - interval '2 days', 'Štefan',
      now() - interval '2 days')
    returning id into v_id;
    perform danubra_demo_mark('danubra_messages', v_id);
    raise notice 'Správy doplnené.';
  end if;

  -- ── Dodatok k zmluve ──────────────────────────────────────────────────────
  -- Zmluva bez dodatku nepovie, čo sa stane pri zmene termínu. Práve to je
  -- pravidlo zo zadania: zmena koncového dátumu = záznam predĺženia.
  if v_contract is not null
     and not exists (select 1 from danubra_demo_ledger where table_name = 'danubra_contract_amendments') then
    insert into danubra_contract_amendments
      (contract_id, amendment_number, field, old_value, new_value, reason, signed_at)
    values (v_contract, 'DOD-VZOR-001', 'date_to',
      to_char(current_date + 45, 'YYYY-MM-DD'),
      to_char(current_date + 75, 'YYYY-MM-DD'),
      'Posun termínu o 30 dní — odberateľ neuvoľnil 2. NP načas.',
      current_date - 20)
    returning id into v_id;
    perform danubra_demo_mark('danubra_contract_amendments', v_id);
    raise notice 'Dodatok doplnený.';
  end if;

  -- ── Výnimka pri nasadení: vzorová sa založiť NEDÁ ─────────────────────────
  -- Skúsil som ju sem dať a `danubra_override_guard` ma odmietol:
  --
  --   Výnimku z pravidla môže povoliť len administrátor.
  --
  -- Je to tá istá ochrana z migrácie 033, ktorá predtým ticho prechádzala,
  -- lebo `danubra_is_admin()` vracalo bez JWT `NULL` a `not NULL` nie je
  -- pravda. Odvtedy vracia `false`, takže zabralo — a zabralo aj na mňa:
  -- migrácia beží ako `postgres`, bez prihlásenia, teda bez administrátora.
  --
  -- Oslabiť pravidlo kvôli vzorovým dátam by znamenalo zrušiť presne tú
  -- ochranu, ktorá v zadaní stojí ako tvrdé pravidlo. Vzorová výnimka tu
  -- preto nie je. Kto si ju chce pozrieť, založí ju v appke pri nasadení
  -- bez dokladov — a prejde si pritom presne ten postup, ktorý sa inak
  -- učí z obrázka.

  -- ── Checklist pred nasadením ──────────────────────────────────────────────
  -- Osem bodov sa počíta z dát, deviaty sa odškrtáva ručne. Bez jediného
  -- odškrtnutého nie je vidieť, že sa to vôbec dá.
  if v_asg_novak is not null
     and not exists (select 1 from danubra_demo_ledger where table_name = 'danubra_assignment_checks') then
    insert into danubra_assignment_checks
      (assignment_id, rule_key, required, done, done_at, note)
    values (v_asg_novak, 'instructions', true, true, now() - interval '56 days',
      'Infolist odovzdaný osobne, prešli sme bránu B aj kľúče od ubytovania.')
    returning id into v_id;
    perform danubra_demo_mark('danubra_assignment_checks', v_id);
    raise notice 'Checklist doplnený.';
  end if;
end $$;

-- ── Kontrola ────────────────────────────────────────────────────────────────
-- Obrazovka, ktorá sa otvára prázdna, vyzerá rovnako ako pokazená. Preto sa
-- tu overí, že žiadna z doplnených tabuliek nezostala bez vzorového riadku.
do $$
declare chyba text;
begin
  select string_agg(x.t, ', ') into chyba from (
    select t from unnest(array[
      'danubra_work_orders', 'danubra_hour_sheets', 'danubra_message_threads',
      'danubra_messages', 'danubra_contract_amendments',
      'danubra_assignment_checks'
    ]) as t
    where not exists (select 1 from danubra_demo_ledger d where d.table_name = t)
  ) x;
  if chyba is not null then
    raise warning 'Bez vzorových dát zostali: %', chyba;
  else
    raise notice 'Vzorové dáta sú všade, kde ich obrazovky potrebujú.';
  end if;
end $$;
