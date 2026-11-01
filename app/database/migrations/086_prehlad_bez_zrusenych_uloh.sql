-- ============================================================================
-- 086 — prehľad „Dnes" nepočíta zrušené ani archivované úlohy
-- ============================================================================
-- danubra_v_today brala všetko okrem stavu 'done', takže zrušené úlohy
-- (napr. duplicitné A1 zrušené v 076) a archivované úlohy sa zarátali do
-- počítadla na hlavnej stránke a v menu. Teraz len otvorené a rozpracované,
-- nearchivované. Pohľad ostáva security_invoker (066) — práva sa berú
-- z danubra_tasks. Nič sa nemaže.
-- ============================================================================

create or replace view danubra_v_today with (security_invoker = true) as
select id,
       title,
       description,
       entity_type,
       entity_id,
       entity_label,
       priority,
       due_date,
       assigned_name,
       rule_id,
       source,
       case
         when due_date < current_date then 'overdue'
         when due_date = current_date then 'today'
         when due_date <= current_date + 7 then 'week'
         else 'later'
       end as bucket,
       due_date - current_date as days_left
  from danubra_tasks t
 where status not in ('done', 'cancelled')
   and archived_at is null
   and coalesce(postponed_to, current_date) <= current_date;

comment on view danubra_v_today is
  'Úlohy na prehľad Dnes: otvorené a rozpracované, nearchivované, nie odložené do budúcna (086).';
