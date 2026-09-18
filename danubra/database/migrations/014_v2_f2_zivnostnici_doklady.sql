-- ============================================================================
-- DANUBRA Hub v2 — F2 — Živnostníci a doklady
-- ============================================================================
-- v1 viedla ľudí ako zamestnancov: `gross_monthly`, `employment_type`.
-- v2 je živnostnícky — človek nám fakturuje. Staré stĺpce zostávajú, lebo
-- historické záznamy sa nemenia; pribúdajú fakturačné údaje živnosti.
--
-- Doklady dostávajú väzbu na úložisko a vlastný horizont upozornenia:
-- A1 trvá vybaviť až 45 dní, zdravotná prehliadka týždeň. Jeden pevný
-- tridsaťdňový horizont pre všetko je preto zlá odpoveď.
--
-- Prevod kandidáta na živnostníka je RPC, aby sa nestalo, že vznikne
-- pracovník a väzba na kandidáta nie — alebo dvakrát ten istý človek.
--
-- Idempotentné.
-- ============================================================================

-- ── Fakturačné údaje živnosti ───────────────────────────────────────────────
alter table danubra_workers add column if not exists company_name text;
alter table danubra_workers add column if not exists company_id text;
alter table danubra_workers add column if not exists tax_id text;
alter table danubra_workers add column if not exists vat_id text;
alter table danubra_workers add column if not exists business_address text;
alter table danubra_workers add column if not exists business_city text;
alter table danubra_workers add column if not exists business_zip text;
alter table danubra_workers add column if not exists business_country text default 'SK';
alter table danubra_workers add column if not exists trade_licence_from date;
alter table danubra_workers add column if not exists trade_licence_scopes text[];
alter table danubra_workers add column if not exists vat_payer bool default false;
alter table danubra_workers add column if not exists sf_client_id int;
alter table danubra_workers add column if not exists crew_id uuid;   -- FK doplní F3

comment on column danubra_workers.hourly_cost is
  'Čo nám fakturuje za hodinu. Pri zamestnancovi z v1 sa namiesto toho '
  'počíta z gross_monthly.';
comment on column danubra_workers.company_id is
  'IČO. Overiteľné v zrsr.sk; pri českej živnosti v rzp.cz.';
comment on column danubra_workers.vat_payer is
  'Platiteľ DPH. Pri prijatej faktúre rozhoduje o tom, či na nej má byť DPH.';
comment on column danubra_workers.trade_licence_scopes is
  'Odbory zo živnostenského listu. Pri regulovanom remesle v Nemecku sa '
  'podľa nich posudzuje oznámenie §9 HwO.';
comment on column danubra_workers.crew_id is
  'Partia. Cudzí kľúč pribudne vo F3 spolu s tabuľkou danubra_crews.';

-- Podľa IČO sa páruje prijatá faktúra s človekom, preto index.
create index if not exists idx_dw_company_id on danubra_workers(company_id)
  where company_id is not null;

-- ── Doklady ─────────────────────────────────────────────────────────────────
alter table danubra_worker_documents add column if not exists storage_path text;
alter table danubra_worker_documents add column if not exists notify_days_before int default 30;
alter table danubra_worker_documents add column if not exists required_for text[];

comment on column danubra_worker_documents.notify_days_before is
  'Koľko dní pred koncom platnosti upozorniť. A1 trvá vybaviť až 45 dní, '
  'zdravotná prehliadka týždeň — jeden horizont pre všetko nestačí.';
comment on column danubra_worker_documents.required_for is
  'Na čo je doklad podmienkou, napríklad {assignment,construction}. '
  'Kľúče zodpovedajú kontextom v lib/staffing/documents.js.';
comment on column danubra_worker_documents.storage_path is
  'Cesta v privátnom buckete. Do UI sa nikdy nedáva priamo — len podpísaná '
  'URL s krátkou platnosťou.';

create index if not exists idx_dwd_valid_to on danubra_worker_documents(valid_to)
  where valid_to is not null;
create index if not exists idx_dwd_worker_kind on danubra_worker_documents(worker_id, kind);

-- Predvolené horizonty podľa druhu dokladu. Dotýka sa len riadkov, ktoré
-- ešte majú predvolenú tridsiatku — ručne nastavené hodnoty zostávajú.
update danubra_worker_documents set notify_days_before = 60
  where kind = 'a1' and coalesce(notify_days_before, 30) = 30;
update danubra_worker_documents set notify_days_before = 90
  where kind in ('id_card', 'passport') and coalesce(notify_days_before, 30) = 30;
update danubra_worker_documents set notify_days_before = 14
  where kind = 'medical' and coalesce(notify_days_before, 30) = 30;

-- ── Školenie BOZP do číselníka dokladov ────────────────────────────────────
-- v1 ho mala len ako reťazec v kóde modulu pracovníkov.
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('worker_document','training','Školenie BOZP','Sicherheitsschulung',
 'Na väčších stavbách ho kontrolujú pri vstupe.',6)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- ── Dva kľúče výnimiek, ktoré F2 priniesla ─────────────────────────────────
-- Blokátor v lib/staffing/documents.js používa tieto kľúče; bez nich by
-- zapísaná výnimka ukazovala na pravidlo, ktoré v číselníku neexistuje.
insert into danubra_enums (kind, key, label_sk, hint, sort_order) values
('override_rule','missing_document','Nasadenie bez povinného dokladu',
 'Doklad, ktorý človek vôbec nemá — na rozdiel od expirovaného.',8),
('override_rule','missing_billing_data','Neúplné fakturačné údaje živnosti',
 'Bez IČO, IBAN-u a adresy sa jeho faktúra nedá zaúčtovať.',9)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, hint = excluded.hint, sort_order = excluded.sort_order;

-- ── Prehľad platnosti dokladov ──────────────────────────────────────────────
-- Stav sa počíta v SQL, aby ho nemusel každý modul dopočítavať sám a aby
-- sa dal filtrovať a zoradiť priamo v dotaze.
create or replace view danubra_v_worker_documents as
select
  d.*,
  w.full_name as worker_name,
  w.status as worker_status,
  coalesce(d.notify_days_before, 30) as horizon_days,
  case
    when d.valid_from is not null and d.valid_from > current_date then 'not_yet'
    when d.valid_to is null then 'valid'
    when d.valid_to < current_date then 'expired'
    when d.valid_to <= current_date + coalesce(d.notify_days_before, 30) then 'expiring'
    else 'valid'
  end as validity,
  case when d.valid_to is null then null
       else d.valid_to - current_date end as days_left
from danubra_worker_documents d
join danubra_workers w on w.id = d.worker_id;

comment on view danubra_v_worker_documents is
  'Doklady so dopočítaným stavom platnosti. `validity` je not_yet | valid | '
  'expiring | expired a drží sa rovnakých pravidiel ako docState() v JS.';

-- ── Prevod kandidáta na živnostníka ─────────────────────────────────────────
-- v1 to robila dvoma samostatnými zápismi z prehliadača: najprv vznikol
-- pracovník, potom sa doplnila väzba. Keď druhý zápis nedobehol — zlé
-- pripojenie, zatvorený mobil — človek zostal v systéme dvakrát a náborová
-- história sa k nemu nedala dohľadať. Preto jedna operácia v databáze.
--
-- `p_regulated_trade` prichádza z appky, lebo zoznam regulovaných remesiel
-- podľa §9 HwO je v `lib/staffing/compliance.js` a nemá zmysel ho mať na
-- dvoch miestach.
--
-- Stavy sa držia slovníka z v1: pracovník `ready`, kandidát `ready`.
-- `outcome` sa zámerne nemení — CHECK `danubra_cand_hired_needs_subcontract`
-- žiada pri `hired` zákazku, a prevod do kartotéky ešte neznamená nasadenie.
--
-- `p_candidate_status` = null znamená „stav nechaj tak". Používa to nastúpenie
-- kandidáta, ktoré si stav (`placed`) nastavilo samo — inak by ho prevod
-- zhodil späť na `ready`.
-- Prvá verzia mala dva parametre. Zahadzuje sa, aby nezostali dve funkcie
-- s rovnakým menom a nebolo treba hádať, ktorú appka volá.
drop function if exists danubra_convert_candidate(uuid, bool);

create or replace function danubra_convert_candidate(
  p_candidate_id uuid,
  p_regulated_trade bool default null,
  p_candidate_status text default 'ready'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  c record;
  v_worker_id uuid;
begin
  select * into c from danubra_candidates where id = p_candidate_id;
  if not found then
    raise exception 'kandidát % neexistuje', p_candidate_id;
  end if;

  -- Druhé zavolanie nesmie vyrobiť druhého človeka.
  if c.converted_worker_id is not null then
    return c.converted_worker_id;
  end if;

  -- Ak už pracovník na tohto kandidáta ukazuje, doviaž ho a skonči.
  -- Sem sa dostane presne ten prípad, ktorý v1 nechala nedokončený.
  select id into v_worker_id from danubra_workers
    where candidate_id = p_candidate_id limit 1;

  if v_worker_id is null then
    insert into danubra_workers (
      full_name, phone, email, whatsapp, language, city, country,
      profession, skill_level, german_level, driving_licence, own_tools,
      legal_form, hourly_cost, available_from, source, referred_by,
      candidate_id, cooperating_since, status, regulated_trade, notes
    ) values (
      c.full_name, c.phone, c.email, coalesce(c.whatsapp, true),
      coalesce(c.language, 'sk'), c.city, coalesce(c.country, 'SK'),
      c.profession, c.skill_level, c.german_level,
      c.driving_licence, c.own_tools,
      coalesce(c.legal_form, 'szco'), c.expected_rate,
      coalesce(c.available_from, c.expected_start),
      c.source, c.referred_by,
      c.id, current_date, 'ready', p_regulated_trade,
      c.notes
    )
    returning id into v_worker_id;
  end if;

  update danubra_candidates
  set converted_worker_id = v_worker_id,
      converted_at = now(),
      status = coalesce(p_candidate_status, status),
      updated_at = now()
  where id = p_candidate_id;

  -- História zostáva pri kandidátovi a pribúda k nej záznam o prevode.
  -- Poznámky sú append-only, takže sa nič neprepisuje.
  insert into danubra_candidate_notes (candidate_id, step_key, body, author_name)
  values (p_candidate_id, 'convert',
    'Prevedený na živnostníka. Kartotéka pracovníka: ' || v_worker_id::text, 'systém');

  insert into danubra_activities (entity_type, entity_id, type, body, source)
  values ('worker', v_worker_id, 'system',
    'Vznikol prevodom kandidáta ' || p_candidate_id::text ||
    '. Náborová história zostala pri kandidátovi.', 'system');

  return v_worker_id;
end $$;

comment on function danubra_convert_candidate(uuid, bool, text) is
  'Prevedie kandidáta na živnostníka v jednej operácii. Idempotentné — '
  'druhé zavolanie vráti toho istého pracovníka, nevyrobí druhého, a doviaže '
  'aj pracovníka, ktorý ostal po nedokončenom prevode z v1. Náborová '
  'história zostáva pri kandidátovi, väzba drží oba smery.';

-- Diagnostika
select
  (select count(*) from danubra_workers) as pracovnikov,
  (select count(*) from danubra_v_worker_documents where validity = 'expired') as expirovanych,
  (select count(*) from danubra_v_worker_documents where validity = 'expiring') as blizi_sa_koniec;
