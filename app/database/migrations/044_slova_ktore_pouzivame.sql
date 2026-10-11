-- ============================================================================
-- 044 — appka hovorí slovami, ktoré vo firme naozaj používame
-- ============================================================================
-- „Polier" je nemecké slovo pre majstra na stavbe. Do appky sa dostalo z môjho
-- popisu, nie z firmy — a človek, ktorý nábor robí, ho nepoužíva. Slovo, ktoré
-- treba niekomu vysvetliť, robí z jednoduchej otázky zložitú.
--
-- Rozdiel, ktorý sa tu drží:
--
--   * **v našich textoch** (otázky pri hovore, polia na odškrtávanie) je slovo
--     preč a nahradené tým, čo sa naozaj robí: „zavolali sme tomu, pre koho
--     robil",
--   * **v učebnici remesiel** zostáva. Na nemeckej stavbe sa tomu človeku
--     naozaj hovorí Polier a živnostník to slovo bude slýchať — len je to
--     teraz pomenované ako slovo, ktoré tam uslyší, nie ako naše.
--
-- Idempotentné: druhé spustenie už nenájde čo meniť.
-- ============================================================================

-- ── 1. Polia pri hovore ─────────────────────────────────────────────────────
update danubra_call_chips
set label = 'Dal meno aj číslo na toho, pre koho robil'
where label = 'Dal meno poliera aj číslo';

update danubra_call_chips
set label = 'Nepamätá si, pre koho robil'
where label = 'Meno poliera si nepamätá';

-- ── 2. Otázka pri telefonáte ────────────────────────────────────────────────
update danubra_screening_questions
set question_sk = 'Na ktorej stavbe ste robili naposledy a kto vás tam viedol? Môžeme mu zavolať?',
    good_answer = 'Povie mesto, firmu aj meno človeka a nemá problém s tým, že sa to overí.'
where code = 'u_polier';

-- ── 3. Učebnica remesiel: slovo zostáva, ale ako nemecké ────────────────────
update danubra_trade_basics
set title = 'Polier — koho tak na stavbe volajú'
where code = 'polier' and title = 'Kto je Polier';

-- ── 4. Kontrola ─────────────────────────────────────────────────────────────
-- V našich vlastných textoch nesmie slovo zostať. V učebnici smie — tam sa
-- vysvetľuje.
do $$
declare nase int;
begin
  select (select count(*) from danubra_call_chips where label ilike '%polier%')
       + (select count(*) from danubra_screening_questions where question_sk ilike '%polier%')
    into nase;

  if nase > 0 then
    raise exception 'Migrácia 044: v % našich textoch zostalo slovo „polier".', nase;
  end if;

  raise notice 'Migrácia 044: v otázkach a poliach hovoru je slovo „polier" preč; v učebnici zostáva vysvetlené.';
end $$;
