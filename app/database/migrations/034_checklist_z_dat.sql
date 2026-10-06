-- ============================================================================
-- DANUBRA — checklist pred nasadením z dát, nie z odškrtávania
-- ============================================================================
-- `danubra_assignment_checks` existuje od migrácie 017 a **nikdy sa
-- nepoužila**. Detail zákazky kreslil starý checklist z v1
-- (`danubra_checklist_items`): deväť bodov s voľným textom, ktoré sa pri
-- každom nasadení nakopírovali z nastavení a odškrtávali sa rukou.
--
-- Ručné odškrtávanie je pri väčšine z nich horšie než žiadny checklist.
-- „Platné A1" sa dalo odškrtnúť aj vtedy, keď A1 v kartotéke nebolo — appka
-- tak mala dve odpovede na tú istú otázku a tá nesprávna svietila nazeleno.
-- To isté sa už raz stalo s obsadenosťou ubytovaní, kde bolo ručne vypísané
-- číslo; odvtedy sa počíta z pobytov.
--
-- Od teraz sa odškrtáva **jediný bod** — odovzdané pokyny pracovníkovi, ktoré
-- nikde inde v systéme nie sú. Zvyšok sa číta z dokladov, zákazky a pobytov.
--
-- Pri prepise sa ukázalo, že v tých deviatich bodoch **chýbal živnostenský
-- list** — pritom je z nich najdôležitejší: bez neho to nie je subdodávka,
-- ale zamestnávanie. Chytil to test, ktorý porovnáva body checklistu
-- s pravidlami blokátora.
--
-- Nič sa nemaže. `danubra_checklist_items` zostáva so všetkými riadkami ako
-- história; appka z nej už len nečíta.
-- ============================================================================

-- ── Odškrtnuté pokyny sa neprepadnú ─────────────────────────────────────────
-- Kto už raz pokyny odovzdal a odškrtol si to, nemá to robiť druhýkrát.
-- Prenáša sa výlučne tento jeden bod — ostatné sa dopočítajú z dát a prenášať
-- ich by znamenalo priniesť si aj to, čo bolo odškrtnuté nesprávne.
insert into danubra_assignment_checks (assignment_id, rule_key, required, done, done_at)
select ci.assignment_id, 'instructions', true, true,
       coalesce(ci.done_at, ci.updated_at, ci.created_at)
  from danubra_checklist_items ci
 where ci.done
   and ci.assignment_id is not null
   and ci.title ilike '%pokyny%'
on conflict (assignment_id, rule_key) do nothing;

comment on table danubra_assignment_checks is
  'Checklist pred nasadením — ale len tie body, ktoré appka vedieť nemôže. '
  'Doklady sa čítajú z kartotéky, §48b a Zoll zo zákazky, ubytovanie '
  'z pobytov, doprava zo zákazky. Kľúče sú v lib/staffing/checks.js.';

comment on table danubra_checklist_items is
  'História checklistov z v1. Appka z nej už nečíta — body sa počítajú '
  'z dát (lib/staffing/checks.js) a ručne sa odškrtáva jediný, ktorý je '
  'v danubra_assignment_checks. Riadky sa nemažú.';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_checklist_items)   as v1_polozky_zostavaju,
  (select count(*) from danubra_assignment_checks) as v2_odskrtnute_pokyny;
