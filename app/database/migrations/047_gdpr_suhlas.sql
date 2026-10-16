-- ============================================================================
-- 047 — Súhlas GDPR ako doklad živnostníka
-- ============================================================================
-- Štvrtý krok v reťazci, ktorý popísal majiteľ:
--
--   „potrebujem od živnostníka súhlas s GDPR"
--
-- Appka o ňom dovtedy nevedela. Pritom držíme jeho meno, doklad totožnosti,
-- A1, živnostenský list, telefón aj číslo účtu — a posielame to nemeckému
-- odberateľovi, na stavbu a úradom. Bez jeho súhlasu na to nemáme právo.
--
-- Nerobí sa preto nová tabuľka. Súhlas je **doklad ako každý iný**: má dátum,
-- dá sa priložiť podpísaný papier a je vidieť, kto ho má a kto nie. Stačí
-- teda jedna hodnota do číselníka typov dokladov.
--
-- `contract` (rámcová zmluva o dielo so živnostníkom — piaty krok) v číselníku
-- už je; dopĺňa sa len `gdpr`.
--
-- Nič sa nemaže a nič sa neprepisuje: `on conflict do nothing`.
-- Idempotentné.
-- ============================================================================

insert into danubra_enums (kind, key, label_sk, sort_order, active)
values ('worker_document', 'gdpr', 'Súhlas GDPR', 9, true)
on conflict (kind, key) do nothing;

-- ── Kontrola ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from danubra_enums
                 where kind = 'worker_document' and key = 'gdpr' and active) then
    raise exception 'Migrácia 047: typ dokladu „gdpr" nevznikol.';
  end if;

  -- Piaty krok sa opiera o `contract`. Keby raz zmizol, reťazec by ticho
  -- tvrdil, že zmluvu nemá nikto.
  if not exists (select 1 from danubra_enums
                 where kind = 'worker_document' and key = 'contract' and active) then
    raise exception 'Migrácia 047: typ dokladu „contract" chýba — piaty krok reťazca na ňom stojí.';
  end if;

  raise notice 'Migrácia 047: súhlas GDPR je typom dokladu.';
end $$;
