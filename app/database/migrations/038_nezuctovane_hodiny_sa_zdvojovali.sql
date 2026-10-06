-- ============================================================================
-- 038 — nezúčtované hodiny sa násobili počtom období
-- ============================================================================
-- Pohľad `danubra_v_subcontract_status` pripájal k zákazke naraz nasadenia,
-- výkazy **aj obdobia** — tri tabuľky, z ktorých každá má k jednej zákazke
-- viac riadkov. Postgres z toho spraví súčin: každý riadok výkazu sa zopakuje
-- toľkokrát, koľko má zákazka období, a `sum(t.hours)` to poslušne sčíta.
--
-- Na ostrých dátach to bolo vidieť takto:
--
--   Wohnpark Feuerbach — 2 obdobia →  82 h sa ukázalo ako 164 h
--   Sanierung Schulzentrum — 0 období →  24 h správne
--   Zváranie oceľových konštrukcií — 0 období → 150 h správne
--
-- Čiže chyba rástla s tým, ako zákazka starla. Zákazka bez uzavretého obdobia
-- ukazovala správne číslo, zabehnutá zákazka dvoj- až trojnásobok — a práve tá
-- zabehnutá je tá, podľa ktorej sa rozhoduje. Na prehľade to bolo číslo
-- „nezúčtované hodiny", podľa ktorého sa uzatvárajú obdobia a vystavujú
-- faktúry.
--
-- Oprava: každý súčet si spočíta svoja vlastná podmnožina (`LATERAL`), takže
-- sa tabuľky už nestretnú v jednom `GROUP BY`. Rovnako to má riešené
-- `danubra_v_subcontract_economics` — tam sa to spravilo správne hneď.
--
-- Stĺpce, ich poradie ani typy sa nemenia, takže `create or replace` zachová
-- práva aj závislosti. Žiadne dáta sa nemenia — mení sa len to, ako sa čítajú.
--
-- Idempotentné.
-- ============================================================================

create or replace view danubra_v_subcontract_status as
select
  s.id,
  s.contract_number,
  s.title,
  s.status,
  s.work_type,
  s.partner_id,
  p.name as partner_name,
  s.contract_id,
  c.status as contract_status,
  coalesce(asg.active_assignments, 0::bigint) as active_assignments,
  coalesce(asg.crews, 0::bigint)              as crews,
  coalesce(ts.hours_open, 0::numeric)         as hours_open,
  coalesce(per.periods_open, 0::bigint)       as periods_open,
  coalesce(per.periods_closed, 0::bigint)     as periods_closed
from danubra_subcontracts s
  -- Jeden k jednému, tie môžu zostať v obyčajnom spojení.
  left join danubra_partners  p on p.id = s.partner_id
  left join danubra_contracts c on c.id = s.contract_id
  -- Nasadenia
  left join lateral (
    select
      count(*) filter (where a.status = 'active') as active_assignments,
      count(distinct a.crew_id) filter (
        where a.status = 'active' and a.crew_id is not null) as crews
    from danubra_assignments a
    where a.subcontract_id = s.id
  ) asg on true
  -- Hodiny mimo uzavretého obdobia. Ide sa cez nasadenie, lebo výkaz sa
  -- k zákazke viaže cezeň — ale už vo vlastnom dotaze, nie v spoločnom.
  left join lateral (
    select coalesce(sum(t.hours) filter (where t.period_id is null), 0::numeric)
             as hours_open
    from danubra_timesheets t
    join danubra_assignments a2 on a2.id = t.assignment_id
    where a2.subcontract_id = s.id
  ) ts on true
  -- Obdobia
  left join lateral (
    select
      count(*) filter (where per2.status = 'open')   as periods_open,
      count(*) filter (where per2.status = 'closed') as periods_closed
    from danubra_periods per2
    where per2.subcontract_id = s.id
  ) per on true;

comment on view danubra_v_subcontract_status is
  'Stav zákazky. Každý súčet má vlastný LATERAL — spoločné spojenie viacerých '
  'tabuliek „jedna k mnohým" by riadky vynásobilo (migrácia 038).';

-- ── Kontrola ───────────────────────────────────────────────────────────────
-- Nechceme to overiť „na oko". Pohľad musí dať to isté, čo priamy dotaz; ak
-- nie, migrácia spadne a nič sa nenasadí.
do $$
declare
  rozdiel record;
begin
  for rozdiel in
    select s.id, s.title, v.hours_open as z_pohladu,
           (select coalesce(sum(t.hours), 0)
              from danubra_timesheets t
              join danubra_assignments a on a.id = t.assignment_id
             where a.subcontract_id = s.id and t.period_id is null) as priamo
    from danubra_subcontracts s
    join danubra_v_subcontract_status v on v.id = s.id
  loop
    if rozdiel.z_pohladu is distinct from rozdiel.priamo then
      raise exception 'Pohľad stále nesedí pri zákazke %: pohľad %, priamo %',
        rozdiel.title, rozdiel.z_pohladu, rozdiel.priamo;
    end if;
  end loop;
  raise notice 'Nezúčtované hodiny v pohľade sedia s priamym dotazom.';
end $$;
