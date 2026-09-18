-- ============================================================================
-- DANUBRA Hub v2 — F9 — Úlohy ako pravidlá a dashboard
-- ============================================================================
-- v1 mala pravidlá zadrôtované v crone: „ak A1 expiruje do 30 dní, sprav
-- úlohu". Pridať nové pravidlo znamenalo zasiahnuť do kódu a nasadiť.
--
-- Tu sú pravidlá dáta. Riadok v `danubra_task_rules` povie, čo sledovať,
-- ako ďaleko dopredu a akú úlohu z toho spraviť. Nové pravidlo je nový
-- riadok, nie nová verzia appky.
--
-- **Bezpečnosť:** motor pravidiel skladá SQL z hodnôt v tabuľke. Preto je
-- `source_table` aj `date_field` obmedzený CHECK-om na známy zoznam a do
-- dotazu ide cez `%I`. Bez toho by riadok v tabuľke znamenal spustenie
-- ľubovoľného SQL.
--
-- Úlohy sa negenerujú duplicitne: to isté pravidlo nad tým istým záznamom
-- vytvorí úlohu raz, kým nie je vybavená.
--
-- Idempotentné.
-- ============================================================================

create table if not exists danubra_task_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text,
  -- čo sledovať
  source_table text not null,
  date_field text not null,
  label_field text default 'name',
  filter jsonb default '{}'::jsonb,
  days_before int default 30,
  -- akú úlohu vytvoriť
  task_title_template text not null,       -- „Vybaviť nové A1 pre {label}"
  priority text default 'normal',
  assigned_name text,
  entity_type text,                        -- na čo úloha ukazuje
  active bool default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table danubra_task_rules is
  'Pravidlá, z ktorých vznikajú úlohy. v1 ich mala zadrôtované v crone; '
  'tu je nové pravidlo nový riadok, nie nová verzia appky.';
comment on column danubra_task_rules.task_title_template is
  'Text úlohy. {label} sa nahradí názvom záznamu, {date} dátumom, '
  '{days} počtom dní, ktoré zostávajú.';

-- Motor skladá SQL z týchto hodnôt, takže musia byť z uzavretého zoznamu.
do $$
begin
  alter table danubra_task_rules add constraint danubra_tr_source_chk
    check (source_table in (
      'danubra_worker_documents', 'danubra_workers', 'danubra_assignments',
      'danubra_subcontracts', 'danubra_contracts', 'danubra_quotes',
      'danubra_invoices', 'danubra_bills', 'danubra_periods',
      'danubra_candidates', 'danubra_crews'
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table danubra_task_rules add constraint danubra_tr_datefield_chk
    check (date_field ~ '^[a-z_]{3,40}$');
exception when duplicate_object then null;
end $$;

-- ── Väzba úlohy na pravidlo ─────────────────────────────────────────────────
-- `postponed_to` z v1 slúži ako odloženie; nový stĺpec netreba.
alter table danubra_tasks add column if not exists rule_id uuid
  references danubra_task_rules;
create index if not exists idx_dtask_rule on danubra_tasks(rule_id)
  where rule_id is not null;

comment on column danubra_tasks.rule_id is
  'Z ktorého pravidla úloha vznikla. Prázdne pri úlohách, ktoré si niekto '
  'napísal sám.';

-- ── Motor pravidiel ─────────────────────────────────────────────────────────
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
  k text;
  val jsonb;
begin
  for r in
    select * from danubra_task_rules
    where active = true and (p_key is null or key = p_key)
  loop
    -- Filter z jsonb na WHERE. Kľúče musia vyzerať ako názvy stĺpcov,
    -- hodnoty idú ako literál cez quote_literal.
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
      'select id, %I as when_date, coalesce(%I::text, ''záznam'') as label
       from %I
       where %I is not null
         and %I <= current_date + $1
         and %I >= current_date - 365 %s',
      r.date_field, coalesce(r.label_field, 'id'), r.source_table,
      r.date_field, r.date_field, r.date_field, v_where);

    for rec in execute v_sql using coalesce(r.days_before, 30)
    loop
      -- To isté pravidlo nad tým istým záznamom vytvorí úlohu raz, kým nie
      -- je vybavená. Inak by denný cron každé ráno pridal ďalšiu kópiu.
      if exists (
        select 1 from danubra_tasks t
        where t.rule_id = r.id
          and t.entity_id = rec.id
          and t.status <> 'done'
      ) then
        continue;
      end if;

      v_title := replace(r.task_title_template, '{label}', rec.label);
      v_title := replace(v_title, '{date}', to_char(rec.when_date, 'DD.MM.YYYY'));
      v_title := replace(v_title, '{days}', (rec.when_date - current_date)::text);

      insert into danubra_tasks (
        title, description, entity_type, entity_id, entity_label,
        priority, status, due_date, assigned_name, source, rule_id, level
      ) values (
        v_title, r.description, r.entity_type, rec.id, rec.label,
        coalesce(r.priority, 'normal'), 'open',
        rec.when_date, r.assigned_name, 'rule', r.id, 'auto'
      );
      v_count := v_count + 1;
    end loop;

    update danubra_task_rules set last_run_at = now(), updated_at = now()
    where id = r.id;
  end loop;

  return v_count;
end $$;

comment on function danubra_run_task_rules(text) is
  'Prejde pravidlá a vytvorí z nich úlohy. To isté pravidlo nad tým istým '
  'záznamom vytvorí úlohu raz, kým nie je vybavená — inak by cron každé ráno '
  'pridal kópiu. Názvy tabuliek a stĺpcov sú obmedzené CHECK-om a do dotazu '
  'idú cez %I.';

-- ── Čo dnes treba spraviť ───────────────────────────────────────────────────
-- Dashboard nemá byť zoznam všetkého, ale zoznam toho, čo je dnes na rade.
create or replace view danubra_v_today as
select
  t.id, t.title, t.description, t.entity_type, t.entity_id, t.entity_label,
  t.priority, t.due_date, t.assigned_name, t.rule_id, t.source,
  case
    when t.due_date < current_date then 'overdue'
    when t.due_date = current_date then 'today'
    when t.due_date <= current_date + 7 then 'week'
    else 'later'
  end as bucket,
  (t.due_date - current_date) as days_left
from danubra_tasks t
where t.status <> 'done'
  and coalesce(t.postponed_to, current_date) <= current_date;

comment on view danubra_v_today is
  'Otvorené úlohy, ktoré nie sú odložené na neskôr, roztriedené podľa toho, '
  'čo horí. Odložená úloha sa vráti sama, keď dôjde jej deň.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_task_rules;
create trigger set_updated_at before update on danubra_task_rules
  for each row execute function danubra_set_updated_at();

alter table danubra_task_rules enable row level security;
drop policy if exists danubra_auth_all on danubra_task_rules;
create policy danubra_auth_all on danubra_task_rules
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Pravidlá, ktoré v1 mala v kóde ──────────────────────────────────────────
-- Tieto tri boli zadrôtované v dennom crone. Teraz sú to riadky a dajú sa
-- vypnúť alebo prepísať bez nasadenia.
insert into danubra_task_rules (
  key, title, description, source_table, date_field, label_field,
  filter, days_before, task_title_template, priority, entity_type, assigned_name
) values
('a1_expiry', 'Blíži sa koniec platnosti A1',
 'A1 vystavuje Sociálna poisťovňa a trvá to až 45 dní. Žiadaj s predstihom, inak sa človek nedá vyslať.',
 'danubra_worker_documents', 'valid_to', 'reference',
 '{"kind":"a1"}'::jsonb, 60,
 'Vybaviť nové A1 — platnosť končí {date}', 'high', 'worker', null),

('trade_licence_expiry', 'Blíži sa koniec živnostenského listu',
 'Bez platnej živnosti to nie je subdodávka, ale zamestnávanie.',
 'danubra_worker_documents', 'valid_to', 'reference',
 '{"kind":"trade_licence"}'::jsonb, 60,
 'Obnoviť živnostenský list — platnosť končí {date}', 'high', 'worker', null),

('contract_ending', 'Blíži sa koniec zmluvy',
 'Predĺženie je dodatok, nie prepísanie dátumu — vybav to skôr, než zmluva dobehne.',
 'danubra_contracts', 'date_to', 'title',
 '{"status":"active"}'::jsonb, 30,
 'Zmluva {label} končí {date} — predĺžiť dodatkom?', 'high', 'contract', null),

('quote_expiring', 'Ponuke sa blíži koniec platnosti',
 'Ozvi sa odberateľovi skôr, než ponuka prepadne.',
 'danubra_quotes', 'valid_until', 'title',
 '{"status":"sent"}'::jsonb, 7,
 'Ponuka {label} platí do {date} — ozvať sa odberateľovi', 'normal', 'quote', null),

('invoice_due', 'Faktúra sa blíži k splatnosti',
 'Pripomeň sa skôr, než bude po splatnosti.',
 'danubra_invoices', 'due_date', 'invoice_number',
 '{"status":"sent"}'::jsonb, 3,
 'Faktúra {label} je splatná {date}', 'normal', 'invoice', null),

('period_to_close', 'Obdobie čaká na uzávierku',
 'Kým sa obdobie neuzavrie, nedá sa z neho vystaviť faktúra.',
 'danubra_periods', 'period_to', 'id',
 '{"status":"open"}'::jsonb, 0,
 'Uzavrieť obdobie do {date} a vystaviť faktúru', 'high', 'subcontract', null)
on conflict (key) do update set
  title = excluded.title, description = excluded.description,
  source_table = excluded.source_table, date_field = excluded.date_field,
  label_field = excluded.label_field, filter = excluded.filter,
  days_before = excluded.days_before,
  task_title_template = excluded.task_title_template,
  priority = excluded.priority, entity_type = excluded.entity_type;

-- Diagnostika
select
  (select count(*) from danubra_task_rules where active) as pravidiel,
  (select count(*) from danubra_v_today) as uloh_dnes;
