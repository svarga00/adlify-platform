-- ============================================================================
-- 045 — podklady k náboru na jednom mieste
-- ============================================================================
-- Ku každému náboru vzniká jeden dokument: čo o zákazke vieme, a potom texty na
-- priame vloženie — web, Bazoš CZ, Bazoš SK, Facebook CZ, Facebook SK, platená
-- reklama, voiceover a prompty na obrázky. Doteraz to žilo mimo appky, takže pri
-- ďalšej zákazke sa hľadalo, čo sa minule písalo a kam sa to dávalo.
--
-- Pridáva sa:
--
--   * `recruitment_plans.brief`    — čo o ponúkanej zákazke vieme (voľný text,
--                                    píše ho ten, kto zákazku priniesol)
--   * `recruitment_plans.analysis` — zhrnutie zákazky v poliach (pozícia,
--                                    miesto, projekt, forma, podmienka,
--                                    ubytovanie, sadzba, nástup, kontakt)
--                                    plus riziká a čo treba doveriť
--   * `danubra_plan_assets`        — jeden riadok = jeden blok textu, promptu
--                                    alebo obrázka ku kanálu
--
-- Prečo jeden riadok na blok a nie jeden veľký text: každý blok sa kopíruje
-- zvlášť, pretože presne tak sa aj vkladá — titulok do titulku, text do textu.
-- A pri ďalšej zákazke sa z nich dá vziať to, čo sa osvedčilo.
--
-- **Nič sa nemaže.** Nová verzia textu starú neprepíše tichom: stará sa
-- archivuje (`archived_at`) a zostáva dohľadateľná. To, čo odišlo na Bazoš,
-- musí byť možné prečítať aj o pol roka, keď sa niekto ozve na starý inzerát.
--
-- Idempotentné.
-- ============================================================================

-- ── 1. Zadanie a analýza na nábore ──────────────────────────────────────────
alter table danubra_recruitment_plans
  add column if not exists brief text,
  add column if not exists analysis jsonb not null default '{}'::jsonb,
  add column if not exists analyzed_at timestamptz,
  add column if not exists analyzed_by uuid references auth.users(id);

comment on column danubra_recruitment_plans.brief is
  'Čo o ponúkanej zákazke vieme — voľným textom, ako to príde od toho, kto ju '
  'priniesol. Vstup pre analýzu; neprepisuje sa, dopĺňa sa.';
comment on column danubra_recruitment_plans.analysis is
  'Zhrnutie zákazky v poliach (pozícia, miesto, projekt, forma, podmienka, '
  'ubytovanie, sadzba, nástup, kontakt) + riziká a čo treba doveriť. '
  'Značka [XX] znamená údaj, ktorý sa ešte nevie.';

-- ── 2. Podklady ─────────────────────────────────────────────────────────────
create table if not exists danubra_plan_assets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references danubra_recruitment_plans(id) on delete cascade,

  -- Kanál a blok podľa `app/lib/recruiting/kit.js`. Zámerne text a nie enum:
  -- pridať kanál sa musí dať zmenou appky, nie migráciou databázy.
  channel text not null,
  block text not null,

  title text,
  body text,

  -- Obrázok alebo priložený súbor. Cesta do privátneho vedra; von ide vždy len
  -- krátkodobo podpísaný odkaz.
  file_path text,
  file_name text,
  file_type text,

  -- Odkiaľ to je: `human` napísal človek, `ai` navrhla appka a človek to ešte
  -- nemusel čítať. Návrh sa nikde nezverejňuje sám.
  source text not null default 'human' check (source in ('human', 'ai')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),

  sort_order int not null default 0,
  -- Nič sa nemaže: stará verzia sa archivuje a zostáva dohľadateľná.
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table danubra_plan_assets is
  'Podklady k náboru: jeden riadok = jeden blok textu, promptu alebo obrázka '
  'ku kanálu. Nič sa nemaže — nová verzia starú archivuje.';

-- Jeden kanál a blok má práve jeden živý text. Staré verzie zostávajú, ale
-- nesmú sa počítať dvakrát.
create unique index if not exists danubra_plan_assets_live
  on danubra_plan_assets (plan_id, channel, block)
  where archived_at is null;

create index if not exists danubra_plan_assets_plan
  on danubra_plan_assets (plan_id, channel);

-- ── 3. Čas poslednej zmeny ──────────────────────────────────────────────────
-- Rovnaký spúšťač ako na ostatných tabuľkách (migrácia 001).
drop trigger if exists set_updated_at on danubra_plan_assets;
create trigger set_updated_at
  before update on danubra_plan_assets
  for each row execute function danubra_set_updated_at();

-- ── 4. Kto to smie vidieť a meniť ───────────────────────────────────────────
-- Podklady sú interný materiál firmy: číta a píše ich prihlásený člen tímu,
-- rovnako ako inzeráty. Von sa nedostanú — appka ich len zobrazuje na
-- skopírovanie.
alter table danubra_plan_assets enable row level security;

drop policy if exists danubra_plan_assets_read on danubra_plan_assets;
create policy danubra_plan_assets_read on danubra_plan_assets
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists danubra_plan_assets_write on danubra_plan_assets;
create policy danubra_plan_assets_write on danubra_plan_assets
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists danubra_plan_assets_update on danubra_plan_assets;
create policy danubra_plan_assets_update on danubra_plan_assets
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Mazať sa nedá vôbec — archivuje sa. Preto tu zámerne nie je `for delete`.

-- ── 5. Kontrola ─────────────────────────────────────────────────────────────
do $$
declare
  chyba text;
begin
  -- Stĺpce na nábore
  if not exists (select 1 from information_schema.columns
                 where table_name = 'danubra_recruitment_plans' and column_name = 'brief') then
    raise exception 'Migrácia 045: na nábore chýba stĺpec brief.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'danubra_recruitment_plans' and column_name = 'analysis') then
    raise exception 'Migrácia 045: na nábore chýba stĺpec analysis.';
  end if;

  -- Jeden živý blok na kanál. Keby index nevznikol, dva texty v tom istom
  -- bloku by sa tichom prekrývali a nikto by nevedel, ktorý odišiel na Bazoš.
  if not exists (select 1 from pg_indexes
                 where indexname = 'danubra_plan_assets_live') then
    raise exception 'Migrácia 045: chýba index na jeden živý blok v kanáli.';
  end if;

  -- Mazanie nesmie byť povolené žiadnym pravidlom.
  select polname into chyba from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'danubra_plan_assets' and p.polcmd = 'd' limit 1;
  if chyba is not null then
    raise exception 'Migrácia 045: podklady sa nesmú dať mazať, pravidlo % to dovoľuje.', chyba;
  end if;

  raise notice 'Migrácia 045: podklady k náboru sú pripravené.';
end $$;
