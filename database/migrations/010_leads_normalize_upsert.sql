-- ============================================
-- MIGRÁCIA 010: Leads — doplnenie kontaktných stĺpcov + UNIQUE constraint na domain
-- ============================================
-- Účel:
--   1. Doplniť stĺpce, ktoré aplikácia už zapisuje, ale nie sú vo
--      verzovanej schéme (`email`, `phone`, `logo_url`, `industry`).
--   2. Pridať nové stĺpce pre scraper workflow: `source_query`
--      (po čom sa firma našla), `contacted_at` (kedy bol lead
--      kontaktovaný).
--   3. Dedup duplicitných leadov podľa (org_id, lower(domain))
--      a vytvoriť UNIQUE INDEX, aby `.upsert(..., { onConflict })`
--      fungoval správne.
--
-- Idempotentnosť: všetky kroky sú `IF NOT EXISTS` — bezpečné spustiť
-- opakovane.
-- ============================================

-- ───── 1. Doplnenie chýbajúcich stĺpcov ─────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_query TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

-- ───── 2. Dedup duplicitných doman pred UNIQUE indexom ─────
-- Necháme najnovší záznam (najvyšší created_at, pri rovnosti najvyššie id)
-- pre každú dvojicu (org_id, lower(domain)).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY org_id, lower(domain)
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM leads
  WHERE domain IS NOT NULL AND domain <> ''
)
DELETE FROM leads
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ───── 3. UNIQUE INDEX na (org_id, lower(domain)) ─────
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_domain_uniq
  ON leads (org_id, lower(domain))
  WHERE domain IS NOT NULL AND domain <> '';

-- ───── 4. Pomocný index pre lookup podľa domény ─────
CREATE INDEX IF NOT EXISTS idx_leads_domain_lower
  ON leads (lower(domain))
  WHERE domain IS NOT NULL AND domain <> '';
