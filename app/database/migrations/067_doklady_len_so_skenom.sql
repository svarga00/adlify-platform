-- ============================================================================
-- DANUBRA — doklad platí, až keď je naozaj nahratý
-- ============================================================================
-- „Doklady k živnostníkom by bolo dobré, keby sa reálne nahrávali, a to by
-- bola kontrola." Doteraz stačilo do appky zapísať druh a dátumy — sken bol
-- nepovinný. Kontrola pri nasadení (danubra_doc_blockers) tak verila zápisu,
-- nie papieru.
--
-- Odteraz:
--   * doklad bez nahratého súboru (storage_path / file_url) sa pri nasadení
--     neráta — hlási sa ako „missing_scan" (Doklad je zapísaný, ale nie je
--     nahratý). Výnimku môže zapísať len admin, ako pri iných dokladoch;
--   * pri doklade sa zapisuje, kto ho podľa skenu skontroloval a kedy
--     (checked_by / checked_at), a čo z neho prečítala AI (ai_read);
--   * archivované doklady (066) sa nerátajú.
--
-- Nič sa nemaže ani neprepisuje. Staré doklady bez skenu ostávajú — len sa
-- pri ďalšom nasadení vypýtajú sken.
-- ============================================================================

alter table danubra_worker_documents add column if not exists checked_at timestamptz;
alter table danubra_worker_documents add column if not exists checked_by uuid;
alter table danubra_worker_documents add column if not exists ai_read jsonb;

comment on column danubra_worker_documents.checked_at is
  'Kedy kolega porovnal údaje so skenom a potvrdil ich.';
comment on column danubra_worker_documents.checked_by is
  'Kto údaje so skenom porovnal a potvrdil.';
comment on column danubra_worker_documents.ai_read is
  'Čo z nahratého dokladu prečítala AI (druh, číslo, platnosť, meno) — na porovnanie, nie ako pravda.';

insert into danubra_enums (kind, key, label_sk, hint, sort_order, active)
select 'override_rule', 'missing_scan', 'Doklad je zapísaný, ale nie je nahratý',
       'Doklad sa ráta, až keď je nahratá fotka alebo PDF.', 11, true
 where not exists (select 1 from danubra_enums where kind = 'override_rule' and key = 'missing_scan');

-- Rovnaký podpis aj logika ako v 033, navyše: archivované sa nerátajú
-- a doklad bez súboru je „missing_scan".
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
  stav as (
    select p.rule_key,
           coalesce(max(
             case
               when d.id is null then 0                                      -- nemá ho
               when d.valid_from is not null and d.valid_from > p_on then 2  -- ešte neplatí
               when d.valid_to   is not null and d.valid_to   < p_on then 1  -- expiroval
               when coalesce(d.storage_path, d.file_url) is null then 3      -- bez skenu
               else 4                                                        -- platí
             end), 0) as rank
      from pozadovane p
      left join danubra_worker_documents d
        on d.worker_id = p_worker_id and d.kind = any(p.kinds) and d.archived_at is null
     group by p.rule_key
  )
  select case s.rank when 1 then 'expired_document'
                     when 3 then 'missing_scan'
                     else s.rule_key end
    from stav s
   where s.rank < 4;
end $$;

comment on function danubra_doc_blockers(uuid, date, text, bool) is
  'Kľúče pravidiel, ktoré k danému dňu blokujú nasadenie človeka. Blokuje '
  'chýbajúci, ešte neplatný, expirovaný a nenahratý (bez skenu) doklad; '
  '„čoskoro vyprší" je upozornenie a nie je tu. Kľúče sedia s lib/staffing/documents.js.';

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_worker_documents where archived_at is null) as dokladov,
  (select count(*) from danubra_worker_documents
    where archived_at is null and coalesce(storage_path, file_url) is null) as bez_skenu;
