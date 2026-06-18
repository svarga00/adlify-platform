-- Outscraper enrichment data (reviews, employees, revenue, linkedin/fb/ig,
-- website tech, atď.) putuje z prospects.analysis → leads.analysis → tu na
-- clients.lead_enrichment, aby ho AI generate-campaigns mohol použiť pri
-- tvorbe stratégie/kampaní (social proof, channel strategy, sizing).
--
-- Idempotent.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_enrichment JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.lead_enrichment IS
'Outscraper/lead enrichment dáta: reviews, rating, size_tier, employees, revenue, founded_year, linkedin, facebook, instagram, website_title, website_description, has_gtm, has_fb_pixel, category, address, email_status. Kopíruje sa pri convertToClient z lead.analysis. Generate-campaigns to číta a vkladá do AI promptu.';

-- Backfill — kde existuje lead.analysis a client vznikol z lead konverzie,
-- doplň lead_enrichment ak je prázdne
UPDATE clients c
SET lead_enrichment = COALESCE(l.analysis, '{}'::jsonb)
FROM leads l
WHERE c.lead_id = l.id
  AND (c.lead_enrichment IS NULL OR c.lead_enrichment = '{}'::jsonb)
  AND l.analysis IS NOT NULL
  AND l.analysis != '{}'::jsonb;

-- Diagnostika
SELECT count(*) AS clients_with_enrichment
FROM clients
WHERE lead_enrichment IS NOT NULL
  AND lead_enrichment != '{}'::jsonb;
