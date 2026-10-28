-- ============================================================================
-- DANUBRA — ľudia, zákazky, hodiny, doklady: čo musí držať databáza
-- ============================================================================
-- Kontrola pred ostrou prevádzkou našla miesta, kde pravidlo platilo len na
-- obrazovke (alebo ani tam):
--
--   1. „Nastúpil" — zmena nasadenia na `active` sa doklady nekontrolovala.
--      Stráž z 033 sa spúšťala len pri zmene človeka alebo dátumu, takže
--      nasadenie naplánované v marci prešlo na „nastúpil" v júni aj
--      s expirovaným A1. Teraz sa doklady posudzujú aj k dňu nástupu
--      (started_at).
--   2. Ten istý človek nasadený na tú istú zákazku dvakrát v tom istom čase
--      (dvojklik na „Nasadiť", nasadenie partie popri plánovanom nasadení
--      jednotlivca). Partia sa pritom preskakovala len pri stave `active`,
--      nie pri `planned`.
--   3. Hodiny dopísané dodatočne do uzavretého obdobia. Stráž z 017 bráni
--      zmene riadkov, ktoré k obdobiu patria, ale nový riadok s dátumom
--      v uzavretom mesiaci prešiel — a nikdy sa nevyfakturoval (ďalšie
--      obdobie berie len svoje dni).
--   4. Podpísaná zmluva sa dala prepnúť späť na „Rozpracovaná", prepísať jej
--      koniec platnosti a sadzbu bez dodatku a prepnúť naspäť.
--   5. Prevod kandidáta na živnostníka pri dvoch súčasných volaniach
--      (dvojklik) vyrobil dvoch ľudí — funkcia si riadok kandidáta nezamkla.
--   6. Poznámky (`notes`) pri človeku, zákazke, nasadení, partii, zmluve…
--      sa prepisujú z formulára — staré znenie sa stratilo. Koniec zákazky
--      a nasadenia sa menil bez záznamu. Odteraz sa pôvodné znenie poznámky
--      a každá zmena konca zapíše do danubra_activities (nič sa nestratí,
--      formuláre fungujú ako doteraz).
--   7. Hlášky z databázy, ktoré appka ukazuje tak, ako sú, tykali
--      („Vybav doklad", „najprv ukonči ten pobyt", „Zapíš najprv riadok…").
--
-- Nič sa nemaže ani neprepisuje v dátach. Existujúce riadky sa nemenia —
-- stráže platia pre nové zápisy. Idempotentné.
-- ============================================================================


-- ── 1. Doklady pri nasadení aj pri nástupe ──────────────────────────────────
create or replace function danubra_assignment_docs_guard()
returns trigger
language plpgsql
as $$
declare
  v_on date;
  v_work_type text;
  v_open text[];
  v_names text;
  v_nastup bool := false;
begin
  -- Zrušené ani archivované nasadenie nikoho na stavbu neposiela.
  if coalesce(new.status, '') = 'cancelled' or new.archived_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- „Nastúpil": z naplánovaného (alebo iného) stavu na bežiaci.
    v_nastup := coalesce(new.status, '') = 'active' and coalesce(old.status, '') <> 'active';
    -- Inak sa kontroluje len to, čo na doklady vplýva — poznámka pri
    -- nasadení s výnimkou sa musí dať opraviť aj po expirácii dokladu.
    -- Vrátenie z archívu nie je nasadenie: admin musí vedieť vrátiť aj
    -- minuloročné nasadenie, ktorého doklady medzitým vymenili nové.
    if new.worker_id is not distinct from old.worker_id
       and new.date_from is not distinct from old.date_from
       and coalesce(old.status, '') <> 'cancelled'
       and not v_nastup then
      return new;
    end if;
  end if;

  -- Pri nástupe rozhoduje deň nástupu, inak prvý deň nasadenia.
  v_on := case when v_nastup then coalesce(new.started_at, new.date_from, current_date)
               else coalesce(new.date_from, current_date) end;
  select work_type into v_work_type
    from danubra_subcontracts where id = new.subcontract_id;

  select array_agg(b.rule_key) into v_open
    from danubra_doc_blockers(new.worker_id, v_on,
                              coalesce(v_work_type, 'construction')) as b(rule_key)
   where not exists (
     select 1 from danubra_overrides o
      where o.rule_key = b.rule_key
        and o.revoked_at is null
        and (o.valid_until is null or o.valid_until >= v_on)
        and ((o.entity_type = 'worker'     and o.entity_id = new.worker_id)
          or (o.entity_type = 'assignment' and o.entity_id = new.id))
   );

  if v_open is null or array_length(v_open, 1) = 0 then
    return new;
  end if;

  select string_agg(coalesce(e.label_sk, o.k), ', ' order by o.k)
    into v_names
    from unnest(v_open) as o(k)
    left join danubra_enums e on e.kind = 'override_rule' and e.key = o.k;

  raise exception
    'Bez platných dokladov sa % nedá (%). Vybavte doklad, alebo nech '
    'administrátor zapíše výnimku s dôvodom — tá zostane v histórii.',
    case when v_nastup then 'nastúpiť' else 'nasadiť' end, v_names
    using errcode = 'check_violation';
end $$;

comment on function danubra_assignment_docs_guard() is
  'Nasadenie bez platných dokladov neprejde ani z importu, ani ručným '
  'insertom. Posudzuje sa k prvému dňu nasadenia, pri zmene na „nastúpil" '
  '(active) k dňu nástupu. Obísť sa to dá jedine výnimkou administrátora.';


-- ── 2. Jeden človek, jedna zákazka, jedno nasadenie v čase ──────────────────
create or replace function danubra_assignment_overlap_guard()
returns trigger
language plpgsql
as $$
declare
  v record;
begin
  if coalesce(new.status, '') = 'cancelled' or new.archived_at is not null
     or new.worker_id is null or new.subcontract_id is null then
    return new;
  end if;
  -- Pri úprave len vtedy, keď sa mení človek/zákazka alebo sa zrušené
  -- nasadenie obnovuje. Ukončenie (Odišiel) a vrátenie z archívu (história)
  -- sa nekontrolujú.
  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.subcontract_id is not distinct from old.subcontract_id
     and coalesce(old.status, '') <> 'cancelled' then
    return new;
  end if;

  -- Dvojklik pošle dva zápisy naraz; bez zámku by oba prešli.
  perform pg_advisory_xact_lock(hashtext('danubra_asg:' || new.worker_id::text || ':' || new.subcontract_id::text));

  select a.id, a.date_from, a.date_to into v
    from danubra_assignments a
   where a.worker_id = new.worker_id
     and a.subcontract_id = new.subcontract_id
     and a.id <> new.id
     and coalesce(a.status, '') <> 'cancelled'
     and a.archived_at is null
     and (a.date_from is null or new.date_to is null or a.date_from <= new.date_to)
     and (new.date_from is null or a.date_to is null or new.date_from <= a.date_to)
   limit 1;

  if v.id is not null then
    raise exception
      'Tento človek už na tejto zákazke nasadený je (% – %). Zrušte alebo ukončite to nasadenie, alebo zvoľte obdobie, ktoré sa s ním neprekrýva.',
      coalesce(to_char(v.date_from, 'DD.MM.YYYY'), 'bez začiatku'),
      coalesce(to_char(v.date_to, 'DD.MM.YYYY'), 'bez konca')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_assignment_overlap_guard on danubra_assignments;
create trigger danubra_assignment_overlap_guard
  before insert or update on danubra_assignments
  for each row execute function danubra_assignment_overlap_guard();

comment on function danubra_assignment_overlap_guard() is
  'Ten istý človek nesmie mať na tej istej zákazke dve živé nasadenia, '
  'ktoré sa časovo prekrývajú (dvojklik, partia popri jednotlivcovi). '
  'Hodiny by sa inak rozdelili medzi dve nasadenia a ľudí by bolo „viac".';


-- ── Nasadenie partie: preskočí každého, kto na zákazke v tom čase už je ─────
-- Doteraz len toho so stavom `active`. Naplánovaný (`planned`) jednotlivec
-- dostal druhé nasadenie. Archivovaní členovia sa nenasadzujú.
create or replace function danubra_assign_crew(
  p_crew_id uuid,
  p_subcontract_id uuid,
  p_date_from date default current_date,
  p_date_to date default null,
  p_worker_rate numeric default null,
  p_charge_rate numeric default null,
  p_overhead numeric default 0
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_count int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_already int := 0;
  v_blockers text[];
  v_work_type text;
  m record;
begin
  if not exists (select 1 from danubra_crews where id = p_crew_id) then
    raise exception 'Partia % neexistuje.', p_crew_id;
  end if;
  if not exists (select 1 from danubra_subcontracts where id = p_subcontract_id) then
    raise exception 'Zákazka % neexistuje.', p_subcontract_id;
  end if;

  -- Dvojklik na „Nasadiť partiu" nesmie nasadiť partiu dvakrát.
  perform pg_advisory_xact_lock(hashtext('danubra_crew:' || p_subcontract_id::text));

  select work_type into v_work_type
    from danubra_subcontracts where id = p_subcontract_id;

  for m in
    select cm.worker_id, cm.role, w.full_name
    from danubra_crew_members cm
    join danubra_workers w on w.id = cm.worker_id
    where cm.crew_id = p_crew_id and cm.left_at is null
      and cm.archived_at is null and w.archived_at is null
    order by w.full_name
  loop
    -- Kto na zákazke v tom čase už je (naplánovaný aj bežiaci), ten sa
    -- nepridáva druhýkrát.
    if exists (
      select 1 from danubra_assignments a
      where a.subcontract_id = p_subcontract_id
        and a.worker_id = m.worker_id
        and coalesce(a.status, '') <> 'cancelled'
        and a.archived_at is null
        and (a.date_from is null or p_date_to is null or a.date_from <= p_date_to)
        and (p_date_from is null or a.date_to is null or p_date_from <= a.date_to)
    ) then
      v_already := v_already + 1;
      continue;
    end if;

    select array_agg(b.rule_key) into v_blockers
      from danubra_doc_blockers(m.worker_id, p_date_from,
                                coalesce(v_work_type, 'construction')) as b(rule_key)
     where not exists (
       select 1 from danubra_overrides o
        where o.rule_key = b.rule_key
          and o.revoked_at is null
          and (o.valid_until is null or o.valid_until >= p_date_from)
          and o.entity_type = 'worker' and o.entity_id = m.worker_id
     );

    if v_blockers is not null and array_length(v_blockers, 1) > 0 then
      v_skipped := v_skipped || jsonb_build_object(
        'worker_id', m.worker_id,
        'name', m.full_name,
        'rules', to_jsonb(v_blockers),
        'labels', (select coalesce(jsonb_agg(coalesce(e.label_sk, k.k)), '[]'::jsonb)
                     from unnest(v_blockers) as k(k)
                     left join danubra_enums e
                       on e.kind = 'override_rule' and e.key = k.k)
      );
      continue;
    end if;

    insert into danubra_assignments (
      subcontract_id, worker_id, crew_id, role,
      date_from, date_to, worker_rate, charge_rate, overhead_per_hour, status
    ) values (
      p_subcontract_id, m.worker_id, p_crew_id,
      case when m.role = 'leader' then 'predak' else 'clen' end,
      p_date_from, p_date_to,
      coalesce(p_worker_rate, (select hourly_cost from danubra_workers where id = m.worker_id)),
      p_charge_rate, coalesce(p_overhead, 0), 'active'
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'deployed', v_count,
    'already',  v_already,
    'skipped',  v_skipped
  );
end $$;

comment on function danubra_assign_crew(uuid, uuid, date, date, numeric, numeric, numeric) is
  'Nasadí aktívnych členov partie na zákazku naraz. Preskočí toho, kto na '
  'nej v tom čase už je (naplánovaný aj bežiaci), a toho, komu k prvému dňu '
  'chýba doklad — a v odpovedi povie kto a čo mu chýba. Vracia {deployed, already, skipped[]}.';


-- ── 3. Do uzavretého obdobia sa hodiny nedopisujú ───────────────────────────
-- Riadky s `period_id` stráži danubra_ts_frozen_trg (017). Tu ide o riadok
-- bez obdobia, ktorého deň padá do uzavretého alebo vyfakturovaného obdobia
-- tej istej zákazky: taký by sa nevyfakturoval nikdy.
create or replace function danubra_timesheet_closed_range()
returns trigger
language plpgsql
as $$
declare
  v_per record;
begin
  if new.period_id is not null or new.archived_at is not null then
    return new;
  end if;
  -- Schválenie a archivácia sa nekontrolujú: schválené hodiny sa po
  -- otvorení obdobia späť do neho dostanú, a archivovať sa smie vždy.
  if tg_op = 'UPDATE'
     and new.hours is not distinct from old.hours
     and new.work_date is not distinct from old.work_date
     and new.assignment_id is not distinct from old.assignment_id
     and new.activity_type is not distinct from old.activity_type then
    return new;
  end if;

  select p.period_from, p.period_to, p.status into v_per
    from danubra_periods p
    join danubra_assignments a on a.subcontract_id = p.subcontract_id
   where a.id = new.assignment_id
     and p.status in ('closed', 'invoiced')
     and new.work_date between p.period_from and p.period_to
   limit 1;

  if found then
    raise exception
      'Deň % patrí do uzavretého obdobia (% – %). Uzavreté obdobie sa nemení — otvorte ho späť alebo zapíšte opravu do nasledujúceho obdobia.',
      to_char(new.work_date, 'DD.MM.YYYY'),
      to_char(v_per.period_from, 'DD.MM.YYYY'), to_char(v_per.period_to, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_ts_closed_range_trg on danubra_timesheets;
create trigger danubra_ts_closed_range_trg
  before insert or update on danubra_timesheets
  for each row execute function danubra_timesheet_closed_range();

comment on function danubra_timesheet_closed_range() is
  'Hodiny s dňom v uzavretom alebo vyfakturovanom období zákazky sa '
  'nedopisujú ani nemenia, kým sa obdobie neotvorí späť — inak by sa '
  'nevyfakturovali nikdy.';


-- ── 4. Podpísaná zmluva sa nevracia medzi rozpracované ──────────────────────
create or replace function danubra_contract_no_reopen()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.status, 'draft') not in ('draft', 'sent')
     and coalesce(new.status, 'draft') in ('draft', 'sent') then
    raise exception
      'Podpísaná zmluva sa nevracia medzi rozpracované. Zmenu podmienok zapíšte dodatkom.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Meno so „a_" — beží pred danubra_contract_amend_trg (triggery idú podľa mena).
drop trigger if exists a_danubra_contract_no_reopen on danubra_contracts;
create trigger a_danubra_contract_no_reopen
  before update of status on danubra_contracts
  for each row execute function danubra_contract_no_reopen();

comment on function danubra_contract_no_reopen() is
  'Bez toho by sa koniec platnosti a sadzba podpísanej zmluvy dali zmeniť '
  'bez dodatku: prepnúť na Rozpracovaná, zmeniť, prepnúť späť.';

-- Rovnaká logika ako v 036, len hláška vyká a nehovorí o tabuľkách.
create or replace function danubra_contract_needs_amendment()
returns trigger
language plpgsql
as $$
declare
  f text;
  old_txt text;
  new_txt text;
begin
  foreach f in array array['date_to', 'charge_rate', 'fixed_price',
                           'unit_price', 'retention_pct']
  loop
    old_txt := coalesce(to_jsonb(old) ->> f, '');
    new_txt := coalesce(to_jsonb(new) ->> f, '');

    if old_txt is distinct from new_txt then
      if old.status in ('draft', 'sent') then
        continue;
      end if;
      if not exists (
        select 1 from danubra_contract_amendments a
        where a.contract_id = new.id
          and a.field = f
          and a.new_value = new_txt
      ) then
        raise exception
          'Zmena poľa % na podpísanej zmluve vyžaduje dodatok. Zapíšte najprv dodatok s novou hodnotou %.',
          f, new_txt
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return new;
end $$;


-- ── 5. Prevod kandidáta: dvojklik nevyrobí dvoch ľudí ───────────────────────
create or replace function danubra_convert_candidate(
  p_candidate_id uuid,
  p_regulated_trade bool default null,
  p_candidate_status text default 'ready'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  c record;
  v_worker_id uuid;
begin
  -- Zámok riadku: druhé súčasné volanie počká a uvidí už prevedeného.
  select * into c from danubra_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Kandidát % neexistuje.', p_candidate_id;
  end if;

  if c.converted_worker_id is not null then
    return c.converted_worker_id;
  end if;

  select id into v_worker_id from danubra_workers
    where candidate_id = p_candidate_id limit 1;

  if v_worker_id is null then
    insert into danubra_workers (
      full_name, phone, email, whatsapp, language, city, country,
      profession, skill_level, german_level, driving_licence, own_tools,
      legal_form, hourly_cost, available_from, source, referred_by,
      candidate_id, cooperating_since, status, regulated_trade, notes
    ) values (
      c.full_name, c.phone, c.email, coalesce(c.whatsapp, true),
      coalesce(c.language, 'sk'), c.city, coalesce(c.country, 'SK'),
      c.profession, c.skill_level, c.german_level,
      c.driving_licence, c.own_tools,
      coalesce(c.legal_form, 'szco'), c.expected_rate,
      coalesce(c.available_from, c.expected_start),
      c.source, c.referred_by,
      c.id, current_date, 'ready', p_regulated_trade,
      c.notes
    )
    returning id into v_worker_id;
  end if;

  update danubra_candidates
  set converted_worker_id = v_worker_id,
      converted_at = now(),
      status = coalesce(p_candidate_status, status),
      updated_at = now()
  where id = p_candidate_id;

  insert into danubra_candidate_notes (candidate_id, step_key, body, author_name)
  values (p_candidate_id, 'convert',
    'Prevedený na živnostníka. Kartotéka pracovníka: ' || v_worker_id::text, 'systém');

  insert into danubra_activities (entity_type, entity_id, type, body, source)
  values ('worker', v_worker_id, 'system',
    'Vznikol prevodom kandidáta ' || p_candidate_id::text ||
    '. Náborová história zostala pri kandidátovi.', 'system');

  return v_worker_id;
end $$;


-- ── 6. Pôvodná poznámka a zmena konca sa nestratia ──────────────────────────
-- Formuláre prepisujú pole `notes` celé. Neblokuje sa to (oprava preklepu
-- musí ísť), ale keď nové znenie pôvodné neobsahuje, pôvodné sa zapíše do
-- danubra_activities. Rovnako zmena konca zákazky a nasadenia (date_to):
-- predĺženie alebo skrátenie je záznam, nie tiché prepísanie.
create or replace function danubra_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_type text := tg_argv[0];
  v_dates bool := coalesce(tg_argv[1], '') = 'dates';
  v_old text;
begin
  v_old := nullif(btrim(coalesce(o ->> 'notes', '')), '');
  if v_old is not null and position(v_old in coalesce(n ->> 'notes', '')) = 0 then
    insert into danubra_activities (entity_type, entity_id, type, body, source, created_by)
    values (v_type, (n ->> 'id')::uuid, 'note_history',
            'Poznámka pred zmenou: ' || v_old, 'system', auth.uid());
  end if;

  if v_dates and (o ->> 'date_to') is not null
     and (o ->> 'date_to') is distinct from (n ->> 'date_to') then
    insert into danubra_activities (entity_type, entity_id, type, body, source, created_by)
    values (v_type, (n ->> 'id')::uuid, 'date_change',
            'Koniec zmenený z ' || to_char((o ->> 'date_to')::date, 'DD.MM.YYYY') || ' na '
              || coalesce(to_char((n ->> 'date_to')::date, 'DD.MM.YYYY'), 'bez konca') || '.',
            'system', auth.uid());
  end if;
  return new;
end $$;

comment on function danubra_keep_history() is
  'Pôvodné znenie prepísanej poznámky a každú zmenu konca (date_to) zapíše '
  'do danubra_activities. Formulár nezastaví — len zabezpečí, že sa nič nestratí.';

do $x$
declare
  r record;
begin
  for r in select * from (values
      ('danubra_workers', 'worker', ''),
      ('danubra_candidates', 'candidate', ''),
      ('danubra_subcontracts', 'subcontract', 'dates'),
      ('danubra_assignments', 'assignment', 'dates'),
      ('danubra_crews', 'crew', ''),
      ('danubra_contracts', 'contract', ''),
      ('danubra_work_orders', 'work_order', ''),
      ('danubra_accommodations', 'accommodation', '')
    ) as t(tbl, kind, dates)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    execute format('drop trigger if exists danubra_keep_history on %I', r.tbl);
    execute format('create trigger danubra_keep_history after update on %I
                    for each row execute function danubra_keep_history(%L, %L)',
                   r.tbl, r.kind, r.dates);
  end loop;
end $x$;


-- ── 7. Pobyty: vykanie a archivované sa nerátajú ────────────────────────────
create or replace function danubra_stay_check()
returns trigger language plpgsql as $$
declare
  v_conflict record;
begin
  if new.archived_at is not null then
    return new;
  end if;
  -- Dvojklik na „Ubytovať" — dva zápisy naraz by kontrolou prešli oba.
  perform pg_advisory_xact_lock(hashtext('danubra_stay:' || new.worker_id::text));

  select s.id, s.date_from, s.date_to into v_conflict
  from danubra_stays s
  where s.worker_id = new.worker_id
    and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and s.archived_at is null
    and daterange(s.date_from, s.date_to, '[]')
        && daterange(new.date_from, new.date_to, '[]')
  limit 1;

  if v_conflict.id is not null then
    raise exception 'Tento človek už v tom čase býva inde (od % do %) — najprv ukončite ten pobyt.',
      to_char(v_conflict.date_from, 'DD.MM.YYYY'),
      coalesce(to_char(v_conflict.date_to, 'DD.MM.YYYY'), 'bez konca');
  end if;
  return new;
end $$;


-- ── Kontrola ────────────────────────────────────────────────────────────────
-- Koľko už zapísaných údajov by nové stráže nepustili. Nič sa nemení —
-- je to zoznam, čo treba dobehnúť ručne.
select
  (select count(*) from danubra_assignments a
     where coalesce(a.status, '') <> 'cancelled' and a.archived_at is null
       and exists (select 1 from danubra_assignments b
                    where b.worker_id = a.worker_id and b.subcontract_id = a.subcontract_id
                      and b.id < a.id and coalesce(b.status, '') <> 'cancelled' and b.archived_at is null
                      and (b.date_from is null or a.date_to is null or b.date_from <= a.date_to)
                      and (a.date_from is null or b.date_to is null or a.date_from <= b.date_to)))
    as zdvojene_nasadenia,
  (select count(*) from danubra_timesheets t
     join danubra_assignments a on a.id = t.assignment_id
     join danubra_periods p on p.subcontract_id = a.subcontract_id
                           and p.status in ('closed', 'invoiced')
                           and t.work_date between p.period_from and p.period_to
    where t.period_id is null and t.archived_at is null)
    as hodiny_mimo_uzavretych_obdobi;

-- ── Anonymný prístup k novým funkciám (rovnako ako 069 §8) ──────────────────
-- Funkcie z 070 a 071 vznikli až po 069, takže im treba odobrať `anon` znova.
do $x$
declare r record; v_auth bool;
begin
  for r in
    select p.oid, p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname like 'danubra\_%' escape '\'
       and p.proname not in ('danubra_is_member', 'danubra_storage_read_ok')
  loop
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', r.f);
    if v_auth then
      execute format('grant execute on function %s to authenticated', r.f);
    end if;
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $x$;
revoke all on function danubra_demo_purge_unchecked() from authenticated;
revoke all on function danubra_unarchive_rec(regclass, uuid, timestamptz) from authenticated;
