-- ─────────────────────────────────────────────────────────────
-- TESTOVACÍ KLIENT — ZámkyExpres s.r.o. (zámočníctvo, Žilina + okolie)
-- ─────────────────────────────────────────────────────────────
-- Realistický príklad: lokálny urgentný servis (24/7 otváranie dverí,
-- výmena zámkov) — testuje sezónne kampane, urgentné CTA, lokálne SEO,
-- click-to-call, sezónne ad scheduling.
--
-- Po spustení:
--   1. #clients → ZámkyExpres → onboarding
--   2. #projects → ZámkyExpres projekt → "Spustiť AI generovanie"

-- 1. Klient
INSERT INTO clients (
  company_name, email, contact_person, phone,
  website, industry, status, notes, created_at, updated_at
) VALUES (
  'ZámkyExpres s.r.o.',
  'info@zamkyexpres.sk',
  'Marek Hudák',
  '+421 905 123 456',
  'https://zamkyexpres.sk',
  'Zámočníctvo a bezpečnosť',
  'active',
  'Testovací klient — urgentné zámočnícke služby, sezónny biznis (zima + sťahovacie obdobie)',
  NOW(), NOW()
)
ON CONFLICT DO NOTHING
RETURNING id;

-- 2. Onboarding — plné odpovede ako keby Marek prešiel onboarding
INSERT INTO onboarding_responses (
  client_id, status, submitted_at, data, access_token, created_at, updated_at
)
SELECT
  c.id,
  'submitted',
  NOW(),
  jsonb_build_object(
    'company_name', 'ZámkyExpres s.r.o.',
    'company_website', 'https://zamkyexpres.sk',
    'company_industry', 'Zámočníctvo a bezpečnostné služby',
    'company_size', '2-5',
    'company_location', 'Žilina',
    'company_founded_year', '2019',
    'company_description', 'Rodinný zámočnícky servis pre Žilinský a Trenčiansky kraj. Pomáhame ľuďom keď sa im zabuchnú dvere, stratia kľúče, alebo potrebujú vymeniť bezpečnostný zámok. Príde do 30 minút, transparentné ceny, žiadne prekvapenia na faktúre.',

    'products_services', jsonb_build_array(
      jsonb_build_object('name', 'Núdzové otvorenie dverí 24/7', 'description', 'Zabuchnuté alebo zamknuté dvere, stratené kľúče. Príchod do 30 min v Žiline a okolí.', 'price_range', '60-120€', 'is_main', true),
      jsonb_build_object('name', 'Výmena a montáž bezpečnostných zámkov', 'description', 'Bezpečnostné dvere, FAB, Mul-T-Lock, Abloy — kompletná dodávka aj montáž.', 'price_range', '120-450€', 'is_main', true),
      jsonb_build_object('name', 'Sťahovanie — kompletná výmena zámkov', 'description', 'Pri nasťahovaní do nového bytu vymeníme všetky zámky pre vašu istotu.', 'price_range', '150-300€', 'is_main', false),
      jsonb_build_object('name', 'Otváranie áut', 'description', 'Zabuchnuté kľúče v aute, problém s autoalarmom. Bez poškodenia.', 'price_range', '50-90€', 'is_main', false),
      jsonb_build_object('name', 'Výroba duplikátov kľúčov', 'description', 'Klasické aj autoelektronické kľúče.', 'price_range', '5-80€', 'is_main', false)
    ),

    'unique_selling_points', jsonb_build_array(
      'Príchod do 30 minút v Žiline a okolí',
      '24/7 dostupnosť — aj cez víkendy a sviatky',
      'Fixné ceny vopred, žiadne prekvapenia',
      '5★ recenzie · 500+ spokojných zákazníkov',
      'Otvárame bez poškodenia dverí (90% prípadov)'
    ),

    'competitive_advantages', 'Ostatní zámočníci na linke „nemajú čas" alebo prídu o 3 hodiny. My garantujeme 30 minút, dispatcher 24/7. Cenu poviete dispečerovi pred výjazdom — žiadne navyšovanie na mieste keď zákazník nemá inú možnosť. Pracujeme s reálnymi bezpečnostnými zámkami (Abloy, Mul-T-Lock) — väčšina konkurencie montuje len lacné FAB.',

    'target_audience', jsonb_build_object(
      'b2b', true,
      'b2c', true,
      'demographics', jsonb_build_object('age_from', '25', 'age_to', '70', 'gender', 'all'),
      'geographic', jsonb_build_object(
        'regions', jsonb_build_array('Žilina', 'Martin', 'Čadca', 'Považská Bystrica', 'Bytča', 'Ružomberok'),
        'countries', jsonb_build_array('Slovensko')
      )
    ),

    'ideal_customent_description', 'Človek v urgentnej situácii — zabuchnuté dvere o 22:00 keď sa vracal z práce, mladá rodina s dieťaťom za dverami. Alebo majiteľ bytu ktorý sa práve nasťahoval a chce vymeniť všetky zámky pred prvou nocou. Vždy hľadá rýchle, dôveryhodné riešenie a je ochotný zaplatiť za istotu.',
    'ideal_customer_description', 'Človek v urgentnej situácii — zabuchnuté dvere o 22:00 keď sa vracal z práce, mladá rodina s dieťaťom za dverami. Alebo majiteľ bytu ktorý sa práve nasťahoval a chce vymeniť všetky zámky pred prvou nocou. Vždy hľadá rýchle, dôveryhodné riešenie a je ochotný zaplatiť za istotu.',

    'special_requirements', 'Veľmi dôležité: kampaň MUSÍ tlačiť telefón + click-to-call, nie webový formulár. Naši zákazníci sú v stresových situáciách, nikto nebude vypĺňať formulár keď nemôže do bytu. Tiež musí byť aktívne v nočných hodinách (18:00-08:00) a cez víkendy — tam ide cca 60% urgentných zákaziek.',

    'primary_goals', jsonb_build_array('leads', 'local'),
    'secondary_goals', jsonb_build_array('awareness'),

    'expected_cpa', '15',
    'expected_roas', '5',
    'average_order_value', '95',
    'customer_lifetime_value', '180',

    'monthly_budget_min', '250',
    'monthly_budget_max', '400',
    'previous_monthly_budget', '180',
    'billing_period', 'monthly',
    'selected_package', 'pro',
    'timeline_urgency', 'this_month',

    'previous_ad_experience', 'Skúšali sme Google Ads v roku 2023 sami — cca 4 mesiace. CPA bola okolo 35€, lebo kampaň bežala 24/7 aj v hodinách keď nikto nehľadá zámočníka.',
    'what_worked', 'Search ads na frázy "zámočník Žilina" a "núdzové otvorenie dverí" prinášali 80% telefonátov.',
    'what_didnt_work', 'Display kampane priniesli kliky ale 0 telefonátov. Display nie je vhodný pre urgentné služby. Tiež sme platili za broadcast keywords "zámok" čo prinášalo ľudí čo chceli kúpiť zámok do dverí, nie servis.',

    'current_marketing_channels', jsonb_build_array('Google My Business', 'Word of mouth', 'Letáky pri novostavbách'),

    'brand_tone_of_voice', 'Profesionálny ale ľudský, uistujúci. Klient je v strese — náš tón hovorí "nebojte sa, prídeme rýchlo". Vykáme. Bez prílišnej formálnosti.',
    'preferred_ad_style', 'Konkrétne čísla (30 min, 24/7), telefónne číslo veľké a viditeľné. Žiadne stock fotky šťastných rodín, radšej reálne fotky našich technikov pri práci alebo otvorených bezpečnostných dverí.',

    'has_brand_guidelines', false,

    'existing_assets', jsonb_build_object('has_logo', true, 'has_photos', true, 'has_videos', false),

    'has_google_analytics', true,
    'has_facebook_pixel', false,
    'has_google_ads_account', true,
    'has_meta_business', false,

    'can_add_tracking_codes', 'yes',
    'has_existing_accounts', 'yes',
    'how_did_you_find_us', 'Google search "marketing agentúra Žilina"',

    'questions_for_us', 'Vieme nastaviť ad scheduling — kampaň aktívna len medzi 18:00-08:00 a cez víkendy? V tých časoch máme 60% objednávok ale konkurencia tam reklamy spravidla nemá.',

    'selected_platforms', jsonb_build_array('google_ads', 'meta_ads'),
    'website_manager', 'agency',
    'best_contact_time', '9-17 v pracovné dni',
    'preferred_contact_method', 'phone',
    'seasonal_business', true,
    'peak_seasons', jsonb_build_array('november-február (zamrznuté zámky)', 'jún-august (sťahovacia sezóna, nové byty)')
  ),
  'obr_zamky_' || substring(md5(random()::text) from 1 for 12),
  NOW(), NOW()
FROM clients c
WHERE c.company_name = 'ZámkyExpres s.r.o.'
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_responses o WHERE o.client_id = c.id
  )
RETURNING id, client_id;

-- 3. Campaign project — draft, ready na "Spustiť AI generovanie"
INSERT INTO campaign_projects (
  client_id, name, description, status,
  ad_spend_budget, management_fee, total_monthly_budget,
  created_at, updated_at
)
SELECT
  c.id,
  'ZámkyExpres — Q1 2026 launch (lokálne urgentné služby)',
  'Lokálne Google Search + Meta Awareness pre Žilinský a Trenčiansky kraj. Hlavný hook: 30 min príchod, 24/7. Search kampane optimalizované pre call-only (click-to-call). Ad scheduling 18:00-08:00 + víkendy.',
  'draft',
  300, 0, 300,
  NOW(), NOW()
FROM clients c
WHERE c.company_name = 'ZámkyExpres s.r.o.'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_projects p WHERE p.client_id = c.id
  )
RETURNING id, name, status;
