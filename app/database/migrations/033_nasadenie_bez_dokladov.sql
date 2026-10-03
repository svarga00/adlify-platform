-- ============================================================================
-- DANUBRA — nasadenie bez platných dokladov drží databáza
-- ============================================================================
-- Zadanie: „nasadenie bez platných dokladov len s výnimkou admina".
--
-- Doteraz to bola pravda len na obrazovke. Blokátor v kartotéke živnostníka
-- ukázal, čo chýba, ale `danubra_assignments` nemala žiadny trigger — takže
-- nasadiť človeka bez A1 šlo z formulára zákazky, z importu aj ručným
-- `insert`-om v SQL editore. Tvrdenie „bez platných dokladov sa nasadiť nedá"
-- bolo teda popis zámeru, nie stavu.
--
-- Táto migrácia to dorovnáva. Pravidlo je tam, kde má byť: pri zápise
-- nasadenia.
--
-- ── Prečo sa stav dokladu počíta aj tu, keď je v JS ──────────────────────────
-- `lib/staffing/documents.js` počíta päť stavov (missing, not_yet, valid,
-- expiring, expired) a k tomu horizonty upozornení — a1 šesťdesiat dní,
-- občiansky devädesiat. Nič z toho tu nie je potrebné a zámerne to tu nie je:
-- **blokuje len chýbajúci, ešte neplatný a expirovaný doklad.** „Čoskoro
-- vyprší" je upozornenie, nie prekážka. Tým sa zo SQL vypadli presne tie
-- časti, ktoré by sa s JS mohli rozísť, a zostalo porovnanie dvoch dátumov.
--
-- ── K akému dňu sa to posudzuje ──────────────────────────────────────────────
-- K prvému dňu nasadenia, nie k dnešku. Keď človek nastupuje za tri týždne
-- a A1 mu príde za týždeň, zastaviť ho dnes by bolo nesprávne. A naopak:
-- doklad, ktorý dnes platí, ale do nástupu vyprší, takto neprejde — čo je
-- presne to, čo chceme.
--
-- Idempotentné. Nič sa nemaže ani nepremenúva.
-- ============================================================================

-- ── Chýbajúci kľúč v číselníku ──────────────────────────────────────────────
-- Suma faktúry, ktorá nesedí s podkladom, je jediná prekážka pri faktúre,
-- ktorú sa dá prevziať na seba: niekedy sa s odberateľom naozaj dohodne iná
-- suma a vtedy musí byť zapísané prečo. Ostatné prekážky pri faktúre sa
-- neobchádzajú — bez odberateľa niet komu fakturovať a reverse charge bez
-- USt-IdNr je nesprávny doklad, nie prevzaté riziko.
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('override_rule','invoice_amount_mismatch','Suma faktúry nesedí s podkladom',
 'Rechnungsbetrag weicht vom Nachweis ab',
 'Dohodnutá iná suma, než vyšla z hodín. Dôvod je povinný.',10)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- ── „Nie je admin" nesmie znamenať „nevieme" ────────────────────────────────
-- `danubra_is_admin()` z migrácie 030 vracia `auth.role() = 'service_role'
-- or …`. Keď spojenie nemá JWT — priame spojenie do databázy, psql, nástroj
-- na migrácie — `auth.role()` je NULL a celý výraz vyjde NULL, nie false.
-- A ochrana napísaná ako `if not danubra_is_admin() then raise` sa pri NULL
-- **nespustí**: `not NULL` je NULL, čo nie je pravda, takže sa vetva
-- preskočí a zápis prejde bez jediného slova.
--
-- Cez PostgREST sa to nestane, tam je rola vždy nastavená, takže v appke to
-- nič nemenilo. Ale ochrana, ktorá funguje len vtedy, keď ju niekto volá
-- správnou cestou, nie je ochrana. Preto tu chýba jediné `coalesce`.
create or replace function danubra_is_admin()
returns bool language sql stable security definer set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false)
      or danubra_no_members()
      or coalesce((select role = 'admin' from danubra_members
                   where user_id = auth.uid() and active limit 1), false);
$$;

-- ── Ktoré doklady blokujú ───────────────────────────────────────────────────
-- Vracia kľúče pravidiel, ktoré k danému dňu blokujú nasadenie. Prázdny
-- výsledok znamená „doklady sú v poriadku".
--
-- Zoznam požiadaviek sedí s `REQUIRED` v lib/staffing/documents.js:
--   vždy         doklad totožnosti (občiansky **alebo** pas), živnostenský
--                list, zmluva o dielo
--   stavba/dielňa A1
--   regulované   doklad o odbornosti (§9 HwO)
-- Poistenie a zdravotná prehliadka sú upozornenie, nie prekážka — tu nie sú.
--
-- `p_work_type` sa zatiaľ nikam nerozvetvuje a je to tak správne: stavba aj
-- dielňa dnes blokujú na tom istom (A1). Rozdiel medzi nimi je v zdravotnej
-- prehliadke, ktorá je len upozornenie. Parameter tu je preto, aby sa pri
-- zmene pravidiel nemuselo prepisovať volanie na piatich miestach.
create or replace function danubra_doc_blockers(
  p_worker_id uuid,
  p_on date default current_date,
  p_work_type text default 'construction',
  p_regulated bool default null
)
returns setof text
language plpgsql
stable
security invoker
as $$
declare
  v_regulated bool;
begin
  -- Keď sa neodovzdá, rozhoduje kartotéka. Zmena remesla sa tak nedá obísť
  -- tým, že sa parameter nepošle.
  if p_regulated is null then
    select coalesce(regulated_trade, false) into v_regulated
      from danubra_workers where id = p_worker_id;
  else
    v_regulated := p_regulated;
  end if;

  return query
  with pozadovane(rule_key, kinds) as (
    values
      ('missing_document'::text,      array['id_card','passport']::text[]),
      ('missing_trade_licence'::text, array['trade_licence']::text[]),
      ('missing_contract'::text,      array['contract']::text[]),
      ('missing_a1'::text,            array['a1']::text[])
    union all
    select 'missing_hwo'::text, array['certificate']::text[]
    where coalesce(v_regulated, false)
  ),
  -- Najlepší stav spomedzi dokladov, ktoré požiadavku vedia naplniť.
  -- Pas nahrádza občiansky a naopak — je to to isté právne postavenie,
  -- preto sa berie ten lepší z oboch, nie oba zvlášť.
  stav as (
    select p.rule_key,
           coalesce(max(
             case
               -- Bez `left join` by requirement bez dokladu z výsledku vypadla
               -- a tvárila by sa ako splnená. Preto sa tu prázdny riadok musí
               -- pomenovať zvlášť, inak spadne do vetvy „platí".
               when d.id is null then 0                                      -- nemá ho
               when d.valid_from is not null and d.valid_from > p_on then 2  -- ešte neplatí
               when d.valid_to   is not null and d.valid_to   < p_on then 1  -- expiroval
               else 4                                                        -- platí
             end), 0) as rank
      from pozadovane p
      left join danubra_worker_documents d
        on d.worker_id = p_worker_id and d.kind = any(p.kinds)
     group by p.rule_key
  )
  select case when s.rank = 1 then 'expired_document' else s.rule_key end
    from stav s
   where s.rank < 4;
end $$;

comment on function danubra_doc_blockers(uuid, date, text, bool) is
  'Kľúče pravidiel, ktoré k danému dňu blokujú nasadenie človeka. Blokuje '
  'chýbajúci, ešte neplatný a expirovaný doklad; „čoskoro vyprší" je '
  'upozornenie a nie je tu. Kľúče sedia s lib/staffing/documents.js.';

-- ── Nasadenie bez dokladov neprejde ─────────────────────────────────────────
-- Výnimku hľadá pri človeku aj pri samotnom nasadení. Výnimka na doklad sa
-- drží človeka (má ju pre každú stavbu, inak by ju niekto písal znova s tým
-- istým dôvodom); výnimka na sadzbu alebo hlásenie Zoll sa drží nasadenia.
create or replace function danubra_assignment_docs_guard()
returns trigger
language plpgsql
as $$
declare
  v_on date;
  v_work_type text;
  v_open text[];
  v_names text;
begin
  -- Zrušené nasadenie nikoho na stavbu neposiela.
  if coalesce(new.status, '') = 'cancelled' then
    return new;
  end if;

  -- Pri úprave sa kontroluje len vtedy, keď sa zmenilo niečo, čo na doklady
  -- vplýva. Inak by sa nedala opraviť poznámka pri nasadení, ktoré má
  -- zapísanú výnimku a doklad medzitým expiroval.
  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date_from is not distinct from old.date_from
     and coalesce(old.status, '') <> 'cancelled' then
    return new;
  end if;

  v_on := coalesce(new.date_from, current_date);
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

  -- Hláška musí povedať, čo chýba, a ako sa to rieši. „Porušenie pravidla"
  -- pošle človeka hľadať chybu v appke namiesto v doklade.
  select string_agg(coalesce(e.label_sk, o.k), ', ' order by o.k)
    into v_names
    from unnest(v_open) as o(k)
    left join danubra_enums e on e.kind = 'override_rule' and e.key = o.k;

  raise exception
    'Bez platných dokladov sa nasadiť nedá (%). Vybav doklad, alebo nech '
    'administrátor zapíše výnimku s dôvodom — tá zostane v histórii.',
    v_names
    using errcode = 'check_violation';
end $$;

drop trigger if exists danubra_assignment_docs_guard on danubra_assignments;
create trigger danubra_assignment_docs_guard
  before insert or update on danubra_assignments
  for each row execute function danubra_assignment_docs_guard();

comment on function danubra_assignment_docs_guard() is
  'Nasadenie bez platných dokladov neprejde ani z importu, ani ručným '
  'insertom. Posudzuje sa k prvému dňu nasadenia. Obísť sa to dá jedine '
  'zapísanou výnimkou, a tú smie vložiť len administrátor '
  '(danubra_override_guard z migrácie 030).';

-- ── Nasadenie partie: jeden bez dokladov nesmie zhodiť celú partiu ──────────
-- `danubra_assign_crew` nasadzovala všetkých členov v jednom cykle. S novým
-- triggerom by prvý človek bez dokladov zhodil celé volanie a nenasadil by sa
-- nikto — pritom partia má bežne piatich ľudí a chýba doklad jednému.
--
-- Rieši sa to tak, ako už funkcia riešila „kto na zákazke beží": preskočí ho.
-- Ale **musí sa povedať kto a prečo**, inak by sa tichým preskočením stratilo
-- presne to, čo je dôležité — že jeden človek na stavbu nejde.
--
-- Návratový typ sa preto mení z `int` na `jsonb`. Stará verzia sa zahadzuje,
-- aby nezostali dve funkcie s rovnakým menom a nebolo treba hádať, ktorú
-- appka volá — rovnako ako pri `danubra_convert_candidate` v migrácii 014.
drop function if exists danubra_assign_crew(uuid, uuid, date, date, numeric, numeric, numeric);

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
    raise exception 'partia % neexistuje', p_crew_id;
  end if;
  if not exists (select 1 from danubra_subcontracts where id = p_subcontract_id) then
    raise exception 'zákazka % neexistuje', p_subcontract_id;
  end if;

  select work_type into v_work_type
    from danubra_subcontracts where id = p_subcontract_id;

  for m in
    select cm.worker_id, cm.role, w.full_name
    from danubra_crew_members cm
    join danubra_workers w on w.id = cm.worker_id
    where cm.crew_id = p_crew_id and cm.left_at is null
    order by w.full_name
  loop
    -- Kto na zákazke už beží, ten sa nepridáva druhýkrát.
    if exists (
      select 1 from danubra_assignments a
      where a.subcontract_id = p_subcontract_id
        and a.worker_id = m.worker_id
        and a.status = 'active'
    ) then
      v_already := v_already + 1;
      continue;
    end if;

    -- Doklady k prvému dňu nasadenia, mínus to, čo je povolené výnimkou.
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
  'Nasadí aktívnych členov partie na zákazku naraz. Preskočí toho, kto už na '
  'nej beží, a toho, komu k prvému dňu chýba doklad — a v odpovedi povie '
  'kto a čo mu chýba. Vracia {deployed, already, skipped[]}.';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
-- Koľko z už zapísaných nasadení by dnes neprešlo. Existujúce riadky sa
-- nemenia — trigger je `before insert or update`, takže história zostáva
-- tak, ako je. Je to len informácia, koľko dokladov treba dobehnúť.
select
  count(*) filter (where blokuje) as nasadeni_bez_dokladov,
  count(*)                        as nasadeni_spolu
from (
  select exists (
    select 1 from danubra_doc_blockers(a.worker_id,
      coalesce(a.date_from, current_date),
      coalesce(sc.work_type, 'construction'))
  ) as blokuje
  from danubra_assignments a
  left join danubra_subcontracts sc on sc.id = a.subcontract_id
  where coalesce(a.status, '') <> 'cancelled'
) t;
