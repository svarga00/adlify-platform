-- ============================================================================
-- DANUBRA — úlohy z pravidiel ukazujú správne meno a vedú na správny záznam
-- ============================================================================
-- Na obrazovke Úlohy stálo „Pracovník: SP-A1-2026-110092" (číslo dokladu
-- namiesto mena) a „Zákazka: 214ba567-08f5-…" (interné číslo obdobia namiesto
-- zákazky). Pravidlo brala ako „záznam" riadok zdrojovej tabuľky (doklad,
-- obdobie), nie človeka či zákazku, ku ktorej patrí — úloha preto viedla na
-- zlé miesto a jej názov nič nehovoril.
--
-- A1 navyše zakladali dve miesta naraz: pravidlo „a1_expiry" aj nočná kontrola
-- (danubra-cron-daily: „A1 pre … je neplatné" / „Požiadať o nové A1 pre …").
-- Nočná kontrola je presnejšia (berie len ľudí, ktorí naozaj chodia na stavby),
-- preto sa pravidlo vypína; dá sa zapnúť späť v Úlohy → Pravidlá.
--
-- Odteraz pravidlo vie, v ktorom stĺpci zdrojového riadku je záznam, ktorého
-- sa úloha týka (entity_field — napr. worker_id pri doklade), a meno sa berie
-- z toho záznamu (danubra_entity_label).
--
-- Existujúce úlohy sa tu nemenia — ich oprava je v 076.
-- ============================================================================

alter table danubra_task_rules add column if not exists entity_field text
  check (entity_field is null or entity_field ~ '^[a-z_]{2,40}$');
comment on column danubra_task_rules.entity_field is
  'Stĺpec zdrojového riadku s id záznamu, ktorého sa úloha týka (napr. worker_id pri '
  'doklade, subcontract_id pri období). Prázdne = id samotného riadku.';

-- Čitateľný názov záznamu podľa druhu. Neznámy druh alebo chýbajúci záznam = null.
create or replace function danubra_entity_label(p_type text, p_id uuid)
returns text language plpgsql stable security invoker set search_path = public as $$
declare v text;
begin
  if p_id is null then return null; end if;
  case p_type
    when 'worker'      then select full_name into v from danubra_workers where id = p_id;
    when 'candidate'   then select full_name into v from danubra_candidates where id = p_id;
    when 'subcontract' then select coalesce(title, contract_number) into v from danubra_subcontracts where id = p_id;
    when 'partner'     then select name into v from danubra_partners where id = p_id;
    when 'contract'    then select coalesce(title, contract_number) into v from danubra_contracts where id = p_id;
    when 'quote'       then select coalesce(title, quote_number) into v from danubra_quotes where id = p_id;
    when 'invoice'     then select invoice_number into v from danubra_invoices where id = p_id;
    when 'crew'        then select name into v from danubra_crews where id = p_id;
    else v := null;
  end case;
  return v;
exception when undefined_column or undefined_table then
  return null;
end $$;
comment on function danubra_entity_label(text, uuid) is
  'Čitateľný názov záznamu (meno človeka, názov zákazky, číslo faktúry…) pre úlohy.';

update danubra_task_rules set
  entity_field = 'worker_id',
  task_title_template = 'Vybaviť nové A1 pre {label} — platnosť končí {date}',
  active = false,
  updated_at = now()
 where key = 'a1_expiry';

update danubra_task_rules set
  entity_field = 'worker_id',
  task_title_template = 'Obnoviť živnostenský list pre {label} — platnosť končí {date}',
  updated_at = now()
 where key = 'trade_licence_expiry';

update danubra_task_rules set
  entity_field = 'subcontract_id',
  task_title_template = 'Uzavrieť obdobie zákazky {label} do {date} a vystaviť faktúru',
  updated_at = now()
 where key = 'period_to_close';

create or replace function danubra_run_task_rules(p_key text default null)
returns int
language plpgsql
security invoker
as $$
declare
  r record;
  rec record;
  v_sql text;
  v_where text;
  v_count int := 0;
  v_title text;
  v_label text;
  v_key text;
  k text;
  val jsonb;
begin
  for r in
    select * from danubra_task_rules
    where active = true and (p_key is null or key = p_key)
  loop
    v_where := '';
    for k, val in select * from jsonb_each(coalesce(r.filter, '{}'::jsonb))
    loop
      if k !~ '^[a-z_]{2,40}$' then
        raise exception 'pravidlo %: neplatný názov stĺpca vo filtri „%"', r.key, k;
      end if;
      v_where := v_where || format(' and %I = %L', k,
        case when jsonb_typeof(val) = 'string' then val #>> '{}' else val::text end);
    end loop;

    v_sql := format(
      'select id as src_id, %I as entity_id, %I as when_date,
              coalesce(%I::text, ''záznam'') as src_label
       from %I
       where %I is not null
         and %I <= current_date + $1
         and %I >= current_date - 365 %s',
      coalesce(r.entity_field, 'id'), r.date_field, coalesce(r.label_field, 'id'),
      r.source_table, r.date_field, r.date_field, r.date_field, v_where);

    for rec in execute v_sql using coalesce(r.days_before, 30)
    loop
      -- Jedna úloha na jeden zdrojový riadok a dátum, kým nie je vybavená.
      v_key := 'rule:' || r.key || ':' || rec.src_id::text || ':' || rec.when_date::text;
      if exists (select 1 from danubra_tasks t where t.source_key = v_key)
         or exists (select 1 from danubra_tasks t
                     where t.rule_id = r.id and t.entity_id = rec.src_id and t.status <> 'done') then
        continue;
      end if;

      v_label := coalesce(danubra_entity_label(r.entity_type, rec.entity_id), rec.src_label);
      v_title := replace(r.task_title_template, '{label}', v_label);
      v_title := replace(v_title, '{date}', to_char(rec.when_date, 'DD.MM.YYYY'));
      v_title := replace(v_title, '{days}', (rec.when_date - current_date)::text);

      insert into danubra_tasks (
        title, description, entity_type, entity_id, entity_label,
        priority, status, due_date, assigned_name, source, rule_id, level, source_key
      ) values (
        v_title, r.description, r.entity_type, rec.entity_id, v_label,
        coalesce(r.priority, 'normal'), 'open',
        rec.when_date, r.assigned_name, 'rule', r.id, 'auto', v_key
      );
      v_count := v_count + 1;
    end loop;

    update danubra_task_rules set last_run_at = now(), updated_at = now()
    where id = r.id;
  end loop;

  return v_count;
end $$;

comment on function danubra_run_task_rules(text) is
  'Prejde pravidlá a vytvorí z nich úlohy. Úloha patrí záznamu z entity_field '
  '(človek pri doklade, zákazka pri období) a nesie jeho meno. Jedna úloha na '
  'zdrojový riadok a dátum (source_key), kým nie je vybavená.';

revoke execute on function danubra_entity_label(text, uuid) from public, anon;
grant execute on function danubra_entity_label(text, uuid) to authenticated, service_role;
revoke execute on function danubra_run_task_rules(text) from public, anon;
grant execute on function danubra_run_task_rules(text) to authenticated, service_role;
