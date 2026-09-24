-- ============================================================================
-- DANUBRA v2 — refakturovateľné náklady
-- ============================================================================
-- Ubytovanie platíme my, ale väčšinou sa refakturuje ďalej — odberateľovi
-- alebo sa strhne živnostníkovi. Kým sa tak nestane, sú to **naše peniaze
-- viazané v cudzej veci** a v cash-flow chýbajú.
--
-- Dovtedy sa to nedalo povedať: náklad bol len suma s kategóriou. Nedalo sa
-- rozlíšiť, čo sa vráti a čo je naozaj náš výdavok, takže výhľad vyzeral
-- horšie, než bol.
--
-- Dva stĺpce:
--   rebillable            vráti sa nám to?
--   rebilled_invoice_id   ktorou faktúrou sa to vrátilo
--
-- Idempotentná. Nič nemaže ani nepremenúva.
-- ============================================================================

alter table danubra_costs add column if not exists rebillable bool not null default false;
alter table danubra_costs add column if not exists rebilled_invoice_id uuid
  references danubra_invoices;
alter table danubra_costs add column if not exists rebilled_at timestamptz;

comment on column danubra_costs.rebillable is
  'Vráti sa nám tento náklad? Ubytovanie a doprava zvyčajne áno — buď sa '
  'refakturuje odberateľovi, alebo sa strhne živnostníkovi.';
comment on column danubra_costs.rebilled_invoice_id is
  'Faktúra, ktorou sa náklad vrátil. Kým je prázdna, peniaze sú viazané '
  'a v cash-flow chýbajú.';

create index if not exists idx_dcost_tied on danubra_costs(cost_date)
  where rebillable = true and rebilled_invoice_id is null;

-- ── Refakturácia je dvojica, nie jedna vec ─────────────────────────────────
-- Naviazanie na faktúru znamená, že sa to vrátilo. Bez tejto poistky by
-- ostalo `rebilled_at` prázdne a náklad by sa navždy tváril ako viazaný.
create or replace function danubra_cost_rebill_check()
returns trigger language plpgsql as $$
begin
  if new.rebilled_invoice_id is not null then
    if not new.rebillable then
      raise exception 'Náklad nie je označený ako refakturovateľný — najprv to zaškrtni';
    end if;
    if new.rebilled_at is null then new.rebilled_at := now(); end if;
  else
    -- Odviazanie od faktúry vráti náklad medzi viazané.
    new.rebilled_at := null;
  end if;
  return new;
end $$;

drop trigger if exists danubra_cost_rebill_check on danubra_costs;
create trigger danubra_cost_rebill_check
  before insert or update on danubra_costs
  for each row execute function danubra_cost_rebill_check();

-- ── Historické ubytovanie a doprava sú refakturovateľné ────────────────────
-- Dotýka sa len riadkov, ktoré ešte majú predvolené `false`; čo niekto
-- nastaví ručne, zostáva.
update danubra_costs
   set rebillable = true
 where category in ('accommodation', 'travel', 'transport')
   and rebillable = false
   and rebilled_invoice_id is null;

-- ── Koľko nám kde viazne ───────────────────────────────────────────────────
create or replace view danubra_v_tied_money as
select
  c.category,
  c.subcontract_id,
  sc.title                         as subcontract_title,
  count(*)                         as polozek,
  sum(c.amount)                    as viazne,
  min(c.cost_date)                 as najstarsi,
  max(c.cost_date)                 as najnovsi
from danubra_costs c
left join danubra_subcontracts sc on sc.id = c.subcontract_id
where c.rebillable = true
  and c.rebilled_invoice_id is null
group by c.category, c.subcontract_id, sc.title;

comment on view danubra_v_tied_money is
  'Naše peniaze viazané v nákladoch, ktoré sa majú vrátiť. Kým sa nevrátia, '
  'v cash-flow chýbajú, hoci to nie je strata.';

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_costs where rebillable) as refakturovatelnych,
  (select coalesce(sum(viazne), 0) from danubra_v_tied_money) as viazne_spolu;
