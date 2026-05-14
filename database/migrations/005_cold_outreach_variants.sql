-- ============================================
-- COLD OUTREACH VARIANT TEMPLATES
-- Migration 005
--
-- Pridáva 5 variant cold outreach emailov (different angles).
-- Každá má svoj slug + štýl:
--   short  — 3 vety, priamy ASK
--   problem — problem-solution hook
--   case   — case study / social proof
--   friendly — otvárajúca otázka
--   local  — mesto + konkurencia
-- ============================================

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_short',
  'Cold – Krátka (3 vety)',
  'Najkratšia verzia: pozdrav, hook, CTA. Vhodná keď máte málo informácií o firme.',
  'outreach',
  '{{company}} — 48h a máte mini-audit',
  E'{{greeting}},\n\nrobím bezplatné mini-audity pre vybrané firmy — čo zmeniť hneď, čo robí konkurencia, kde unikajú peniaze. Doručím do 48 hodín.\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n\n{{sender_name}}, {{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_short');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_problem_solution',
  'Cold – Problém/riešenie',
  'Identifikuje typický problém segmentu a ponúka audit ako prvý krok.',
  'outreach',
  'Prečo {{company}} stráca zákazníkov online (a ako to zmeniť)',
  E'{{greeting}},\n\nväčšina firiem{{industry_hook}} stráca 30–60 % potenciálnych zákazníkov ešte predtým, ako sa dostanú na telefón alebo do obchodu. Pomalý web, zlé kľúčové slová, slabá ponuka na prvý pohľad.\n\nSpravil som si rýchly prehľad cez {{domain}} a našiel som 3 konkrétne veci, ktoré by som v prvom rade zmenil. Zhrniem ich v bezplatnom mini-audite — uvidíte presne čísla a priority.\n\n[[Pošlite mi audit|{{audit_request_url}}]]\n\nBez záväzku, bez predaja. Len ukážka ako pracujem.\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_problem_solution');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_case_study',
  'Cold – Case study (social proof)',
  'Opiera sa o výsledok inej firmy v segmente. Najlepšie funguje keď máte reálny kejs.',
  'outreach',
  '{{company}}: ako sme podobnej firme zdvihli dopyty o 40 %',
  E'{{greeting}},\n\nminulý rok sme pomohli firme{{industry_hook}} zdvihnúť počet kvalitných dopytov z webu o 40 % za 3 mesiace — bez zvýšenia rozpočtu, len lepšími reklamami a opravou 5 vecí na stránke.\n\nKeď sa pozriem na {{domain}}, vidím podobný potenciál. Môžem vám urobiť bezplatný mini-audit, kde vám konkrétne ukážem čo zmeniť a aké výsledky môžete očakávať.\n\n[[Chcem rovnaký audit|{{audit_request_url}}]]\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_case_study');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_friendly',
  'Cold – Priateľská (otázka)',
  'Neformálnejší tón, otvára otázkou. Dobré pre menšie firmy / majiteľov.',
  'outreach',
  'Rýchla otázka ohľadom {{company}}',
  E'{{greeting}},\n\nmôžem byť úprimný? Prezrel som si {{domain}} a napadlo ma pár vecí, ktoré by ste mohli chcieť vedieť — čo funguje, čo nie, a jedna vec ktorá by mohla zdvihnúť vašu výkonnosť celkom rýchlo.\n\nZhrniem to do krátkeho auditu (cca strana A4) a pošlem vám to do 48 hodín. Zadarmo. Stačí klik:\n\n[[Áno, pošlite mi to|{{audit_request_url}}]]\n\nAk vás to nezaujíma, len ignorujte tento email — nebudem vás bombardovať.\n\nDržím palce,\n{{sender_name}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_friendly');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_local',
  'Cold – Lokálna konkurencia',
  'Zameriava sa na lokalitu a konkurenciu v meste. Funguje najmä pre gastro, fitness, služby.',
  'outreach',
  '{{company}} vs. konkurencia v {{city}}',
  E'{{greeting}},\n\npozeral som si lokálnu konkurenciu{{industry_hook}} v {{city}} a všimol som si jednu vec — {{company}} má priestor predbehnúť ich v tom ako vás ľudia nájdu online. Konkrétne 3 body: rýchlosť webu, čo vidí zákazník prvých 5 sekúnd, a kde ste v Google Maps.\n\nZhrniem to do bezplatného mini-auditu — presné čísla, porovnanie s 2 konkurentami, a čo zmeniť ako prvé.\n\n[[Chcem audit pre {{company}}|{{audit_request_url}}]]\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_local');
