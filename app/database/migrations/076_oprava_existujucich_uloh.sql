-- ============================================================================
-- DANUBRA — oprava existujúcich úloh z pravidiel (k 075)
-- ============================================================================
-- Úlohy, ktoré pravidlá založili pred 075, nesú ako „záznam" doklad alebo
-- obdobie (a jeho číslo), nie človeka či zákazku. Tu sa im prestaví odkaz na
-- človeka/zákazku a meno. Nič sa nemaže:
--   * A1 (a1_expiry): ak k tomu istému človeku už je úloha z nočnej kontroly
--     (source = 'cron'), úloha z pravidla sa označí ako zrušená s poznámkou
--     v popise — ostáva v histórii; inak sa len opraví meno a odkaz.
--   * živnostenský list, obdobie: opraví sa meno, odkaz a názov.
-- Platí len pre nevybavené úlohy (open / in_progress).
-- ============================================================================

-- A1 a živnostenský list: odkaz z dokladu na človeka.
update danubra_tasks t
   set entity_id = d.worker_id,
       entity_label = w.full_name,
       source_key = coalesce(t.source_key, 'rule:' || r.key || ':' || d.id::text || ':' || d.valid_to::text),
       title = case r.key
         when 'a1_expiry' then 'Vybaviť nové A1 pre ' || w.full_name || ' — platnosť končí ' || to_char(d.valid_to, 'DD.MM.YYYY')
         else 'Obnoviť živnostenský list pre ' || w.full_name || ' — platnosť končí ' || to_char(d.valid_to, 'DD.MM.YYYY')
       end,
       updated_at = now()
  from danubra_task_rules r, danubra_worker_documents d, danubra_workers w
 where t.rule_id = r.id and r.key in ('a1_expiry', 'trade_licence_expiry')
   and t.status in ('open', 'in_progress')
   and d.id = t.entity_id and w.id = d.worker_id;

-- A1 z pravidla, keď ten istý človek už má úlohu z nočnej kontroly: zrušiť (nie zmazať).
update danubra_tasks t
   set status = 'cancelled',
       description = coalesce(t.description || E'\n\n', '')
         || 'Zrušené pri oprave úloh: tú istú vec rieši úloha z nočnej kontroly A1.',
       updated_at = now()
  from danubra_task_rules r
 where t.rule_id = r.id and r.key = 'a1_expiry'
   and t.status in ('open', 'in_progress')
   and exists (select 1 from danubra_tasks c
                where c.source = 'cron' and c.entity_type = 'worker'
                  and c.entity_id = t.entity_id
                  and c.status in ('open', 'in_progress')
                  and c.source_key like 'a1:%');

-- Obdobie: odkaz z obdobia na zákazku.
update danubra_tasks t
   set entity_id = p.subcontract_id,
       entity_label = coalesce(s.title, s.contract_number),
       source_key = coalesce(t.source_key, 'rule:' || r.key || ':' || p.id::text || ':' || p.period_to::text),
       title = 'Uzavrieť obdobie zákazky ' || coalesce(s.title, s.contract_number)
               || ' do ' || to_char(p.period_to, 'DD.MM.YYYY') || ' a vystaviť faktúru',
       updated_at = now()
  from danubra_task_rules r, danubra_periods p, danubra_subcontracts s
 where t.rule_id = r.id and r.key = 'period_to_close'
   and t.status in ('open', 'in_progress')
   and p.id = t.entity_id and s.id = p.subcontract_id;

-- ── Kontrola: žiadna otvorená úloha s interným číslom namiesto mena ─────────
select count(*) as uloh_s_cislom_namiesto_mena
  from danubra_tasks
 where status in ('open', 'in_progress')
   and entity_label ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';
