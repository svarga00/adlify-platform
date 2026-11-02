-- ============================================================================
-- 088 — hľadanie firiem po kolách (viac ako 50 firiem naraz)
-- ============================================================================
-- „Potrebujem tie kontakty vedieť exportovať a hľadať naraz viac ako 50."
--
-- Funkcia na pozadí (danubra-leads-from-urls-background) smie na Netlify
-- bežať najviac 15 minút. Hľadanie 100–300 firiem preto beží po kolách:
-- každé kolo spracuje, čo stihne (Google Mapy raz, potom Impressum a skóre
-- AI po ~150 firmách), pred ~12. minútou si sem uloží, čo ešte čaká,
-- a spustí samo seba znova (podpísaný kľúč, nie prihlásenie používateľa).
--
--   danubra_lead_search_state   jeden riadok na hľadanie: číslo posledného
--                               kola (round) a stav (state): čakajúce úlohy
--                               Google Máp, firmy, ktoré ešte treba overiť
--                               a ohodnotiť, počty a čo sa už uložilo (na
--                               duplicity medzi kolami). Po skončení hľadania
--                               sa state vyprázdni (null), riadok ostane.
--
-- Prečo nie stĺpec v danubra_lead_searches: appka číta hľadanie každé 2 s
-- (priebeh) — stav s ~500 firmami by sa sťahoval stále dokola. Táto tabuľka
-- je len pre server (service role); prihlásený používateľ do nej nevidí.
--
-- Kolo si číslo „zaberie" podmieneným zápisom (round = n len keď je n − 1),
-- takže to isté kolo nikdy nebeží dvakrát. Priebeh pre appku ostáva
-- v danubra_lead_searches: stats.round, stats.rounds (odhad), stats.multi,
-- stats.handoff_at (kolo skončilo a spustilo ďalšie).
--
-- Bez tejto migrácie hľadanie beží ako doteraz — najviac 50 firiem v jednom
-- behu. Nič sa nemaže; pribúda tabuľka a riadok v mapovaní práv. Idempotentné.
-- ============================================================================


-- ── 1. Stav hľadania medzi kolami ───────────────────────────────────────────
create table if not exists danubra_lead_search_state (
  search_id   uuid primary key references danubra_lead_searches(id),
  round       int not null default 1,
  state       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table danubra_lead_search_state is
  'Hľadanie firiem po kolách (088): čo ešte čaká na ďalšie kolo funkcie danubra-leads-from-urls-background. '
  'Zapisuje a číta len server (service role). Po skončení hľadania je state null.';
comment on column danubra_lead_search_state.round is
  'Číslo kola, ktoré si funkcia naposledy zabrala (podmienený zápis: round = n, len keď bolo n − 1).';
comment on column danubra_lead_search_state.state is
  'Stav medzi kolami: phase (maps/work), úlohy Google Máp, firmy na overenie a skóre (queue), počty (stats, dropped), '
  'koľko sa uložilo (added) a kľúče uložených firiem (duplicity medzi kolami). Null = hľadanie skončilo.';


-- ── 2. RLS: len server ──────────────────────────────────────────────────────
-- Service role RLS obchádza; prihlásený používateľ nemá žiadnu politiku,
-- teda nevidí nič. Appka túto tabuľku nepotrebuje.
alter table danubra_lead_search_state enable row level security;
revoke all on danubra_lead_search_state from anon;
revoke all on danubra_lead_search_state from authenticated;


-- ── 3. Práva podľa modulu (072) — kvôli úplnému mapovaniu tabuliek ──────────
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_lead_search_state', '{marketing}', '{marketing}', 'Stav hľadania firiem medzi kolami (088). Len server (service role).')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'danubra_lead_search_state') as tabulka,
  (select count(*) from danubra_table_modules where table_name = 'danubra_lead_search_state') as zmapovana_tabulka,
  (select relrowsecurity from pg_class where oid = 'public.danubra_lead_search_state'::regclass) as rls_zapnute;
