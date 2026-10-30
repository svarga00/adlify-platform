-- ============================================================================
-- 084 — Jazyky kandidáta (punds.sk: „Ktorými jazykmi hovoríte?")
-- ============================================================================
-- Web punds.sk pribral rumunčinu, poľštinu a bulharčinu. Tím firmy nimi
-- nehovorí, preto sa vo formulári prihlášky a kontaktu (vo všetkých jazykoch
-- webu) povinne zaškrtáva, ktorými jazykmi uchádzač hovorí. Podľa toho sa dá
-- hneď vidieť, či sa s ním (alebo s vedúcim partie) dohovoríme po nemecky
-- alebo anglicky.
--
-- Kódy: de, en, sk, cs, hu, ro, pl, bg, other (web/shared/sites.js → SPOKEN).
-- Zapisuje web/api.js (service role); appka ukazuje v detaile kandidáta.
-- ============================================================================
alter table danubra_candidates add column if not exists languages text[];
comment on column danubra_candidates.languages is 'Jazyky, ktorými kandidát hovorí (z formulára na webe): de, en, sk, cs, hu, ro, pl, bg, other';
