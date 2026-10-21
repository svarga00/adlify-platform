-- ============================================================================
-- 048 — Odstránené dopyty
-- ============================================================================
-- „Tu chcem vedieť mazať dopyty." Pri skúšaní vznikli duplicity (ten istý
-- e-mail vložený dvakrát) a zoznam ich ukazuje medzi živými.
--
-- Fyzicky sa nemaže nič (pravidlo appky). Dopyt sa **odloží**: zmizne zo
-- zoznamu aj zo všetkých počítadiel, ale v databáze ostane s dátumom a
-- dôvodom a dá sa vrátiť.
--
-- Idempotentné.
-- ============================================================================

alter table danubra_opportunities
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

comment on column danubra_opportunities.archived_at is
  'Kedy bol dopyt odstránený zo zoznamu. Fyzicky sa nemaže — dá sa vrátiť.';
comment on column danubra_opportunities.archived_reason is
  'Prečo: duplicita, zapísané omylom alebo vlastný text.';

create index if not exists danubra_opportunities_live
  on danubra_opportunities (created_at desc) where archived_at is null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'danubra_opportunities' and column_name = 'archived_at') then
    raise exception 'Migrácia 048: na dopyte chýba stĺpec archived_at.';
  end if;
end $$;
