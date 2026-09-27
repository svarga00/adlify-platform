-- ============================================================================
-- DANUBRA Hub v2 — F1 — Základ a archivácia ubytovania
-- ============================================================================
-- Prvá migrácia v2. Nič nemaže a nič nepremenúva — len pridáva prepínače
-- modulov a číselníky, ktoré sú dnes rozsypané ako voľné reťazce po moduloch.
--
-- Ubytovacia agenda sa vypína príznakom, nie zmazaním. Dáta zostávajú,
-- väzby zostávajú, len zmizne z navigácie.
--
-- Idempotentné.
-- ============================================================================

-- ── Ktoré agendy sú zapnuté ─────────────────────────────────────────────────
-- Príznak, nie mazanie. Ubytovanie sa dá kedykoľvek vrátiť jedným `true`.
alter table danubra_settings add column if not exists modules jsonb
  default '{}'::jsonb;

update danubra_settings
set modules = coalesce(modules, '{}'::jsonb) || jsonb_build_object(
  'recruiting',     true,    -- nábor, kandidáti, príručka remesiel
  'contracts',      true,    -- odberatelia, ponuky, zmluvy, zákazky
  'finance',        true,    -- faktúry, náklady, banka, cash-flow
  'accommodation',  false    -- obchodná časť ubytovania — archivovaná
)
where modules is null or not (modules ? 'recruiting');

comment on column danubra_settings.modules is
  'Ktoré agendy sa zobrazujú. accommodation=false skryje dopyty, ponuky, '
  'objednávky a klientov z v1; dáta ani väzby sa nemažú. Databáza ubytovaní '
  'zostáva dostupná, lebo ubytovanie je naďalej náklad zákazky.';

-- ── Číselníky ───────────────────────────────────────────────────────────────
-- Dnes sú typy dokladov, kategórie nákladov a jednotky voľné reťazce roztrúsené
-- po moduloch. Tu sú na jednom mieste, s nemeckým prekladom pre doklady.
create table if not exists danubra_enums (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  key text not null,
  label_sk text not null,
  label_de text,
  hint text,
  sort_order int not null default 0,
  active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, key)
);
create index if not exists idx_denum_kind on danubra_enums(kind, active, sort_order);

comment on table danubra_enums is
  'Číselníky na jednom mieste. Pridanie hodnoty nevyžaduje zásah do kódu.';

-- ── Výnimky z blokátorov ────────────────────────────────────────────────────
-- Admin smie obísť pravidlo, ale musí povedať prečo — a zostane to zapísané.
-- Bez tohto by „výnimka" znamenala, že pravidlo neexistuje.
create table if not exists danubra_overrides (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,          -- 'assignment' | 'subcontract' | 'invoice'
  entity_id uuid not null,
  rule_key text not null,             -- ktoré pravidlo sa obišlo
  reason text not null,               -- povinné, bez toho sa výnimka nedá uložiť
  granted_by uuid references auth.users,
  granted_at timestamptz not null default now(),
  valid_until date,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_dovr_entity on danubra_overrides(entity_type, entity_id);
create index if not exists idx_dovr_rule on danubra_overrides(rule_key);

do $$
begin
  alter table danubra_overrides add constraint danubra_ovr_reason_chk
    check (length(btrim(reason)) >= 5);
exception when duplicate_object then null;
end $$;

comment on table danubra_overrides is
  'Zapísané obídenia blokátorov. Append-only v duchu poznámok — zrušenie '
  'výnimky sa robí cez revoked_at, nie zmazaním riadku.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_enums;
create trigger set_updated_at before update on danubra_enums
  for each row execute function danubra_set_updated_at();

alter table danubra_enums enable row level security;
drop policy if exists danubra_auth_all on danubra_enums;
create policy danubra_auth_all on danubra_enums
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Výnimky sa nemažú — len čítanie, zápis a zrušenie cez update.
alter table danubra_overrides enable row level security;
drop policy if exists danubra_auth_all on danubra_overrides;
drop policy if exists danubra_ovr_read on danubra_overrides;
drop policy if exists danubra_ovr_insert on danubra_overrides;
drop policy if exists danubra_ovr_update on danubra_overrides;
create policy danubra_ovr_read on danubra_overrides
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_ovr_insert on danubra_overrides
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_ovr_update on danubra_overrides
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Naplnenie číselníkov ────────────────────────────────────────────────────

-- Typy dokladov pracovníka. `required_for` v danubra_worker_documents sa
-- odvoláva na tieto kľúče.
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('worker_document','id_card','Občiansky preukaz','Personalausweis','Platnosť aspoň pol roka dopredu.',1),
('worker_document','passport','Pas','Reisepass',null,2),
('worker_document','trade_licence','Živnostenský list','Gewerbeschein','Overiteľné v zrsr.sk alebo rzp.cz.',3),
('worker_document','a1','Formulár A1','A1-Bescheinigung','Vystavuje Sociálna poisťovňa, trvá až 45 dní.',4),
('worker_document','medical','Zdravotná prehliadka','Ärztliche Untersuchung',null,5),
('worker_document','contract','Zmluva o dielo','Werkvertrag','Dielo, nie hodiny.',6),
('worker_document','certificate','Odborný certifikát','Zertifikat','Napríklad zvárací podľa EN ISO 9606-1.',7),
('worker_document','insurance','Poistenie','Versicherung',null,8),
('worker_document','other','Iné','Sonstiges',null,99)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- Kategórie nákladov — použije ich danubra_costs v F7.
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('cost_category','accommodation','Ubytovanie','Unterkunft','Najväčšia položka po mzdách.',1),
('cost_category','transport','Doprava','Fahrtkosten',null,2),
('cost_category','tools','Náradie a vybavenie','Werkzeug',null,3),
('cost_category','insurance','Poistenie','Versicherung','Betriebshaftpflicht.',4),
('cost_category','soka','SOKA-BAU','SOKA-BAU','14,7 % pri stavebných prácach.',5),
('cost_category','fees','Poplatky a odvody','Gebühren',null,6),
('cost_category','marketing','Nábor a inzercia','Personalbeschaffung',null,7),
('cost_category','other','Iné','Sonstiges',null,99)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- Jednotky na faktúrach. `key` ide priamo do SuperFaktúry ako `unit`.
insert into danubra_enums (kind, key, label_sk, label_de, sort_order) values
('unit','h','hodina','Stunde',1),
('unit','ks','kus','Stück',2),
('unit','m2','m²','m²',3),
('unit','m','bm','lfm',4),
('unit','den','deň','Tag',5),
('unit','mes','mesiac','Monat',6),
('unit','pausal','paušál','Pauschal',7)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  sort_order = excluded.sort_order;

-- Pravidlá, ktoré sa dajú obísť výnimkou. Zoznam je tu, aby UI vedelo, čo
-- vlastne admin povoľuje, a aby sa dalo dohľadať, ktoré pravidlá sa obchádzajú
-- najčastejšie.
insert into danubra_enums (kind, key, label_sk, hint, sort_order) values
('override_rule','missing_a1','Nasadenie bez platného A1','Pri kontrole Zoll hrozí pokuta.',1),
('override_rule','missing_trade_licence','Nasadenie bez živnostenského listu','Bez nej to nie je subdodávka.',2),
('override_rule','expired_document','Nasadenie s expirovaným dokladom',null,3),
('override_rule','missing_contract','Nasadenie bez podpísanej zmluvy o dielo',null,4),
('override_rule','below_min_wage','Sadzba pod stavebnou minimálnou mzdou','Rozhoduje obsah práce, nie názov zmluvy.',5),
('override_rule','missing_zoll','Začiatok stavebných prác bez hlásenia Zoll',null,6),
('override_rule','missing_hwo','Regulované remeslo bez oznámenia §9 HwO',null,7)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, hint = excluded.hint, sort_order = excluded.sort_order;

-- Diagnostika
select kind, count(*) as hodnot from danubra_enums group by kind order by kind;
