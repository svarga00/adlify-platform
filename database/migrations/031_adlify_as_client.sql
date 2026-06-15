-- ────────────────────────────────────────────────────────────
-- ADLIFY AKO VLASTNÝ KLIENT
-- ────────────────────────────────────────────────────────────
-- Setup pre testovanie celého produktu na vlastnom marketingu:
-- 1. Vytvorí klienta "Adlify" s reálnymi údajmi
-- 2. Vyplní onboarding ako keby Štefan sám prešiel onboarding
-- 3. Vytvorí "Pripravený" projekt — môžeš rovno spustiť AI generovanie
--
-- Po spustení:
--   1. Choď #clients → Adlify → otvor onboarding (vidíš dáta)
--   2. Choď #projects → Adlify projekt → "Spustiť AI generovanie"
--   3. Po vygenerovaní → kreatívy, export CSV, OAuth pripojenie reálnych
--      ad účtov, tracking pixel na adlify.eu
-- ────────────────────────────────────────────────────────────

-- 1. Klient Adlify
INSERT INTO clients (
  company_name, email, contact_person, phone,
  website, industry, status, notes, created_at, updated_at
) VALUES (
  'Adlify s.r.o.',
  'info@adlify.eu',
  'Štefan Varga',
  '+421 944 388 881',
  'https://adlify.eu',
  'Marketing & Reklama',
  'active',
  'Vlastný klient pre testovanie produktu',
  NOW(), NOW()
)
ON CONFLICT DO NOTHING
RETURNING id;
-- Skopíruj si ID vyššie pre prípad — alebo použi query nižšie

-- 2. Onboarding response — vyplnené ako keby Adlify prešiel reálny onboarding
INSERT INTO onboarding_responses (
  client_id, status, submitted_at, data, access_token, created_at, updated_at
)
SELECT
  c.id,
  'submitted',
  NOW(),
  jsonb_build_object(
    'company_name', 'Adlify s.r.o.',
    'company_website', 'https://adlify.eu',
    'company_industry', 'Marketing & Reklama',
    'company_size', '2-5',
    'company_location', 'Bratislava',
    'company_founded_year', '2025',
    'company_description', 'Marketingová agentúra ktorá pomáha SMB firmám na Slovensku a v Česku spustiť a optimalizovať Google Ads a Meta Ads kampane. Plne digitálny servis cez platformu Adlify — onboarding, AI návrh stratégie, kreatívy, real-time reporty.',

    'products_services', jsonb_build_array(
      jsonb_build_object('name', 'Google Ads management', 'description', 'Plný setup + správa Google Search a Display kampaní', 'price_range', '249-499€/mes', 'is_main', true),
      jsonb_build_object('name', 'Meta Ads management', 'description', 'Facebook + Instagram reklamy: konverzie, awareness, remarketing', 'price_range', '249-499€/mes', 'is_main', true),
      jsonb_build_object('name', 'AI návrh kampane', 'description', 'Strategia, kreatívy, image prompty — pripravené za 60 sekúnd', 'price_range', 'súčasť balíčka')
    ),

    'unique_selling_points', jsonb_build_array(
      'AI návrh kampane za 60 sekúnd',
      'Real-time reporty cez vlastný portál pre klienta',
      'Konverzný tracking pixel zadarmo',
      'Týždenné automatické vyhodnotenie',
      'Lokálne SK/CZ trh expertíza'
    ),

    'competitive_advantages', 'Štandardná agentúra dáva proposal za 3-5 dní a reportuje v Exceli mesačne. My dávame návrh za hodinu, klient má vlastný portál s live KPI, dostane týždenný AI vyhodnotený report s plánom. Cena rovnaká alebo nižšia ako tradičné agentúry.',

    'target_audience', jsonb_build_object(
      'b2b', true,
      'b2c', false,
      'demographics', jsonb_build_object('age_from', '28', 'age_to', '65', 'gender', 'all'),
      'geographic', jsonb_build_object(
        'regions', jsonb_build_array('Bratislava', 'Košice', 'Žilina', 'Praha', 'Brno'),
        'countries', jsonb_build_array('Slovensko', 'Česko')
      )
    ),

    'ideal_customer_description', 'Majiteľ SMB firmy 5-30 zamestnancov ktorý chce reálne PPC výsledky bez toho aby musel byť expertom. Doteraz si reklamy robil sám alebo cez nepríliš transparentnú agentúru. Hľadá agentúru ktorá je rýchla, transparentná a vie ukázať čo skutočne funguje.',

    'special_requirements', 'Sezónne kampane — najsilnejšie obdobie je január (nový rok, nové ciele firiem) a september (nové fiškálne plány po lete).',

    'primary_goals', jsonb_build_array('leads', 'awareness'),
    'secondary_goals', jsonb_build_array('engagement'),

    'expected_cpa', '25',
    'expected_roas', '4',
    'average_order_value', '350',
    'customer_lifetime_value', '4500',

    'monthly_budget_min', '300',
    'monthly_budget_max', '1500',
    'previous_monthly_budget', '0',
    'billing_period', 'monthly',
    'selected_package', 'pro',
    'timeline_urgency', 'this_month',

    'previous_ad_experience', 'Žiadna — toto je nový brand bez histórie ad účtov.',
    'what_worked', 'Organické LinkedIn príspevky o produkte zatiaľ generujú demá.',
    'what_didnt_work', '—',

    'current_marketing_channels', jsonb_build_array('LinkedIn organic', 'Word of mouth'),

    'brand_tone_of_voice', 'Profesionálny ale ľudský. Vykáme. Bez korporátneho žargónu.',
    'preferred_ad_style', 'Modern, minimalistický, zameraný na výsledky a transparentnosť. Žiadne stock fotky šťastných ľudí, radšej screenshoty produktu / dát.',

    'has_brand_guidelines', true,

    'existing_assets', jsonb_build_object('has_logo', true, 'has_photos', false, 'has_videos', false),

    'has_google_analytics', false,
    'has_facebook_pixel', false,
    'has_google_ads_account', false,
    'has_meta_business', false,

    'can_add_tracking_codes', 'yes',
    'has_existing_accounts', 'no',
    'how_did_you_find_us', 'vlastný produkt',

    'questions_for_us', 'Otestujme všetky platformy + tracking + reporting na vlastnom marketingu.',

    'selected_platforms', jsonb_build_array('google_ads', 'meta_ads'),
    'website_manager', 'internal',
    'best_contact_time', 'kedykoľvek',
    'preferred_contact_method', 'email',
    'seasonal_business', true,
    'peak_seasons', jsonb_build_array('január', 'september')
  ),
  'obr_adlify_' || substring(md5(random()::text) from 1 for 12),
  NOW(), NOW()
FROM clients c
WHERE c.company_name = 'Adlify s.r.o.'
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_responses o WHERE o.client_id = c.id
  )
RETURNING id, client_id;

-- 3. Campaign project — pripravený, status draft (rovno klikni "Spustiť AI generovanie")
INSERT INTO campaign_projects (
  client_id, name, description, status,
  ad_spend_budget, management_fee, total_monthly_budget,
  created_at, updated_at
)
SELECT
  c.id,
  'Adlify — Q1 2026 Launch (Google + Meta)',
  'Vlastný marketing testing projekt — Google Ads (Search + Display) + Meta Ads (Conversions + Awareness). Testuje sa kompletný flow od AI návrhu po nasadenie, tracking a reporting.',
  'draft',
  500, 0, 500,
  NOW(), NOW()
FROM clients c
WHERE c.company_name = 'Adlify s.r.o.'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_projects p WHERE p.client_id = c.id
  )
RETURNING id, name, status;
