-- ============================================================================
-- DANUBRA — pravidlá úloh sa dajú pridať z rozhrania
-- ============================================================================
-- Od F9 je pravidlo riadok v tabuľke, nie kus kódu — ale pridať nový sa dalo
-- len `insert`-om v SQL editore. Z appky sa dalo iba vypnúť a zapnúť.
--
-- Prečo to nešlo skôr: motor skladá SQL z hodnôt v tom riadku, takže formulár,
-- ktorý by nechal napísať názov stĺpca voľne, by bol cesta k spusteniu
-- ľubovoľného SQL. CHECK na `source_table` a vzor na `date_field` to držia
-- v databáze, ale rozhranie by aj tak muselo hádať, ktoré stĺpce existujú —
-- a pri preklepe by človek dostal chybu z Postgresu.
--
-- Rieši sa to tak, že **zoznam stĺpcov dá databáza**. Nie natvrdo v appke,
-- kde by sa pri prvej zmene schémy rozišiel, ale z katalógu — a len pre
-- tabuľky, ktoré CHECK aj tak povoľuje.
--
-- Druhá vec je skúška naprázdno. Pravidlo, ktoré sa uloží a až ráno sa ukáže,
-- že vyrobilo tristo úloh, je horšie než žiadne. `danubra_preview_task_rule`
-- prejde to isté, čo motor, ale **nič nezapíše** — vráti počet a päť ukážok.
--
-- Idempotentné. Nič sa nemaže ani nepremenúva.
-- ============================================================================

-- ── Ktoré tabuľky sa smú sledovať ───────────────────────────────────────────
-- Jediný zdroj pravdy je CHECK z migrácie 021. Táto funkcia ho číta, takže
-- keď do neho niekto pridá tabuľku, rozhranie ju ponúkne samo — a naopak sa
-- nedá ponúknuť tabuľka, ktorú by databáza odmietla.
create or replace function danubra_rule_tables()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select t.tab
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid),
      '''(danubra_[a-z_]+)''', 'g') as m(arr)
    cross join lateral unnest(m.arr) as t(tab)
   where c.conname = 'danubra_tr_source_chk'
   order by 1;
$$;

comment on function danubra_rule_tables() is
  'Tabuľky, ktoré smie pravidlo úloh sledovať. Číta sa z CHECK-u '
  'danubra_tr_source_chk (migrácia 021), aby existoval jediný zoznam.';

-- ── Ktoré stĺpce má tá tabuľka ──────────────────────────────────────────────
-- `kind` je to, na čo sa stĺpec v pravidle hodí:
--   'date'   dátum, podľa ktorého sa pravidlo spúšťa
--   'label'  text, ktorým sa záznam pomenuje v úlohe
--   'filter' text, číslo alebo áno/nie, podľa ktorého sa dá zúžiť výber
create or replace function danubra_rule_fields(p_table text)
returns table (column_name text, data_type text, kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Tabuľka mimo povoleného zoznamu sa ani nečíta. Bez tejto kontroly by
  -- funkcia so `security definer` vedela vyzradiť stĺpce hocičoho v schéme.
  if not exists (select 1 from danubra_rule_tables() t where t = p_table) then
    raise exception 'tabuľka „%" sa v pravidlách sledovať nedá', p_table;
  end if;

  return query
  select c.column_name::text,
         c.data_type::text,
         case
           when c.data_type in ('date', 'timestamp with time zone',
                                'timestamp without time zone') then 'date'
           when c.column_name in ('name', 'full_name', 'title', 'label',
                                  'invoice_number', 'contract_number', 'key') then 'label'
           else 'filter'
         end
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and c.data_type in ('date', 'timestamp with time zone',
                         'timestamp without time zone',
                         'text', 'character varying', 'boolean',
                         'integer', 'numeric')
   order by 3, 1;
end $$;

comment on function danubra_rule_fields(text) is
  'Stĺpce tabuľky, ktoré sa dajú použiť v pravidle úloh, rozdelené na '
  'dátumové, pomenúvacie a filtrovacie. Tabuľka musí byť z '
  'danubra_rule_tables(), inak funkcia vyhodí chybu.';

-- ── Skúška naprázdno ────────────────────────────────────────────────────────
-- To isté, čo robí motor, ale bez zápisu. Vracia počet záznamov, ktoré by
-- dnes pravidlo chytilo, a päť ukážok textu úlohy.
--
-- Kontroly sú tu zopakované naschvál: funkcia je `security definer`, takže
-- nesmie spoliehať na to, že ju volá rozhranie, ktoré si vstupy overilo.
create or replace function danubra_preview_task_rule(
  p_source_table text,
  p_date_field text,
  p_label_field text default 'name',
  p_filter jsonb default '{}'::jsonb,
  p_days_before int default 30,
  p_title_template text default '{label}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
  v_sql text;
  v_where text := '';
  v_count int := 0;
  v_samples jsonb := '[]'::jsonb;
  k text;
  val jsonb;
begin
  if not exists (select 1 from danubra_rule_tables() t where t = p_source_table) then
    raise exception 'tabuľka „%" sa v pravidlách sledovať nedá', p_source_table;
  end if;
  if p_date_field !~ '^[a-z_]{3,40}$' then
    raise exception 'neplatný názov dátumového stĺpca „%"', p_date_field;
  end if;
  if coalesce(p_label_field, 'id') !~ '^[a-z_]{2,40}$' then
    raise exception 'neplatný názov stĺpca „%"', p_label_field;
  end if;

  for k, val in select * from jsonb_each(coalesce(p_filter, '{}'::jsonb))
  loop
    if k !~ '^[a-z_]{2,40}$' then
      raise exception 'neplatný názov stĺpca vo filtri „%"', k;
    end if;
    v_where := v_where || format(' and %I = %L', k,
      case when jsonb_typeof(val) = 'string' then val #>> '{}' else val::text end);
  end loop;

  v_sql := format(
    'select %I as when_date, coalesce(%I::text, ''záznam'') as label
       from %I
      where %I is not null
        and %I <= current_date + $1
        and %I >= current_date - 365 %s
      order by %I',
    p_date_field, coalesce(p_label_field, 'id'), p_source_table,
    p_date_field, p_date_field, p_date_field, v_where, p_date_field);

  for rec in execute v_sql using coalesce(p_days_before, 30)
  loop
    v_count := v_count + 1;
    if v_count <= 5 then
      v_samples := v_samples || to_jsonb(
        replace(replace(replace(coalesce(p_title_template, '{label}'),
          '{label}', rec.label),
          '{date}', to_char(rec.when_date::date, 'DD.MM.YYYY')),
          '{days}', (rec.when_date::date - current_date)::text));
    end if;
  end loop;

  return jsonb_build_object('count', v_count, 'samples', v_samples);
end $$;

comment on function danubra_preview_task_rule(text, text, text, jsonb, int, text) is
  'Skúška pravidla naprázdno: koľko úloh by dnes vzniklo a ako by vyzerali. '
  'Nič nezapisuje. Vstupy si overuje sama — je security definer.';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_rule_tables())                       as sledovatelne_tabulky,
  (select count(*) from danubra_rule_fields('danubra_worker_documents')) as stlpce_dokladov,
  (select danubra_preview_task_rule('danubra_worker_documents', 'valid_to',
     'kind', '{}'::jsonb, 60, 'Obnoviť {label} — končí {date}'))     as skuska;
