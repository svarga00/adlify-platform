-- ============================================
-- MIGRÁCIA 015: First-time onboarding tour state
-- ============================================
-- Účel:
--   Klient po prvom prihlásení do portálu uvidí 5-6 step tour modal
--   so highlightom konkrétnej oblasti (Dashboard → Správy → Schvaľovanie
--   → Reporty → Nastavenia). Po preskočení / dokončení sa zapíše
--   timestamp, aby sa tour viac nezobrazoval.
--
--   Stĺpec: `user_profiles.tour_completed_at TIMESTAMPTZ`
--   - NULL → tour nebol dokončený → zobraziť
--   - timestamp → tour bol dokončený / preskočený
--
--   User-level (nie client-level) lebo client_users many-to-many vzťah —
--   ak by jeden klient mal viacero členov tímu, každý si tour pozrie zvlášť.
-- ============================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ;
