/**
 * ADLIFY PLATFORM - Leads Outreach Extension v1.0
 * B2B Lead Generation Dashboard - Taby pre LeadsModule
 * 
 * Tento súbor ROZŠIRUJE existujúci LeadsModule o nové taby:
 * - Segmenty (prioritizácia 10 segmentov SK trhu)
 * - Checklist (interaktívne úlohy per segment)
 * - 12M Plán (fázový akčný plán)
 * - Nástroje (tool stack & workflow)
 * - Postup (SOP pre zamestnancov)
 * 
 * INŠTALÁCIA: Pridať <script src="modules/leads/leads-outreach.js"></script>
 *             za leads.js v admin/index.html
 */

(function() {
  'use strict';
  
  // Počkaj kým LeadsModule existuje
  if (!window.LeadsModule) {
    console.warn('⚠️ LeadsModule not found, leads-outreach.js cannot initialize');
    return;
  }

  const LM = window.LeadsModule;
  
  // ============================================================
  // DATA: Segmenty slovenského trhu
  // ============================================================
  
  LM.outreachSegments = [
    {
      id: 'eshopy',
      name: 'E-shopy',
      icon: '🛒',
      tier: 1,
      priority: 95,
      months: '1–4',
      count: '~16 000',
      package: 'Professional €329–€499',
      ltv: '€6 000–€22 000',
      scores: { digital: 5, willingness: 5, roi: 5, competition: 4 },
      description: 'Najrýchlejšia konverzia – rozumejú digitálu, vysoké LTV. Shoptet má 7 000+ SK e-shopov.',
      leadSources: [
        'FinStat SK-NACE 47.91 (internetový maloobchod), revenue >€100K',
        'Shoptet katalóg (7 000+ SK e-shopov)',
        'Google Ads Transparency – filtrovať tie BEZ reklám',
        'Meta Ad Library – bez aktívnych kampaní'
      ],
      keywords: ['eshop správa reklám', 'google shopping správa', 'PPC pre eshopy', 'facebook reklama eshop'],
      outreach: 'LinkedIn → Email → Telefón. Personalizované: "Váš konkurent XY inzeruje na Google Shopping..."',
      seasonal: 'Ideálne aug–sept (pred Q4), jan–feb (nové rozpočty)'
    },
    {
      id: 'zubari',
      name: 'Zubné kliniky',
      icon: '🦷',
      tier: 1,
      priority: 88,
      months: '1–4',
      count: '2 500–3 500',
      package: 'Starter–Professional €179–€499',
      ltv: '€3 500–€12 000',
      scores: { digital: 3, willingness: 4, roi: 4, competition: 2 },
      description: 'Vysoké LTV pacienta (€500–€2 000+), málo konkurenčných agentúr cieli na tento segment.',
      leadSources: [
        'FinStat SK-NACE 86.23 (zubná starostlivosť)',
        'Google Maps: "zubár" + všetky krajské mestá',
        'Zlaté Stránky kategória Stomatológia',
        'Komora zubných lekárov – zoznam členov'
      ],
      keywords: ['zubár reklama', 'stomatológ marketing', 'nový pacienti zubár', 'zubná klinika google'],
      outreach: 'Email → Telefón → LinkedIn. Vizuál: "Koľko pacientov strácate bez Google reklamy?"',
      seasonal: 'Celoročne, mierne zvýšenie jan a sept'
    },
    {
      id: 'reality',
      name: 'Reality kancelárie',
      icon: '🏠',
      tier: 1,
      priority: 85,
      months: '1–4',
      count: '2 000–3 500',
      package: 'Professional €329–€499',
      ltv: '€4 000–€10 000',
      scores: { digital: 4, willingness: 4, roi: 4, competition: 3 },
      description: 'Už platia za portály (Reality.sk, Nehnuteľnosti.sk), rozumejú ROI. Vysoká ochota platiť.',
      leadSources: [
        'FinStat SK-NACE 68.31 (sprostredkovanie realít)',
        'Reality.sk a Nehnuteľnosti.sk – zoznam kancelárií',
        'Google Maps: "realitná kancelária" + mestá',
        'LinkedIn: "realitný maklér" Slovensko'
      ],
      keywords: ['reality marketing', 'realitná kancelária reklama', 'predaj nehnuteľností google'],
      outreach: 'LinkedIn → Email. ROI argument: "Za cenu jedného portálového inzerátu..."',
      seasonal: 'Jar (marec–máj) a jeseň (sept–nov) – najvyššia aktivita'
    },
    {
      id: 'restauracie',
      name: 'Reštaurácie & gastro',
      icon: '🍕',
      tier: 1,
      priority: 82,
      months: '1–4',
      count: '15 000–20 000',
      package: 'Starter €149–€269',
      ltv: '€900–€3 200',
      scores: { digital: 3, willingness: 3, roi: 4, competition: 2 },
      description: 'Obrovský objem, nízke ceny ale veľa leadov. Ideálne pre Starter balík a upsell.',
      leadSources: [
        'Google Maps: "reštaurácia/pizzeria/kaviareň" + mestá',
        'Zlaté Stránky: Reštaurácie, Kaviarne, Bary',
        'TripAdvisor/Google Reviews – aktívne podniky',
        'Instagram: lokálne gastro účty bez reklám'
      ],
      keywords: ['reštaurácia marketing', 'reklama pre reštaurácie', 'facebook reklama gastro'],
      outreach: 'Email (hromadne) → Telefón. Jednoduché posolstvo: "Viac hostí za menej peňazí"',
      seasonal: 'Marec–apríl (pred letom), sept–okt (jesenná sezóna)'
    },
    {
      id: 'beauty',
      name: 'Beauty & kadernícke salóny',
      icon: '💇',
      tier: 1,
      priority: 80,
      months: '1–4',
      count: '13 000–20 000',
      package: 'Starter €149–€269',
      ltv: '€900–€3 200',
      scores: { digital: 3, willingness: 3, roi: 4, competition: 2 },
      description: 'Veľký objem, Instagram-first segment. Ľahký vstup cez Meta Ads.',
      leadSources: [
        'Google Maps: "kadernícky salón/kozmetika/nechty" + mestá',
        'Instagram: beauty účty s 500+ followermi bez reklám',
        'Bookio.com, Reservio – registrované salóny',
        'Zlaté Stránky: Kadernícke služby, Kozmetika'
      ],
      keywords: ['beauty salón reklama', 'kadernícky salón marketing', 'instagram reklama salón'],
      outreach: 'Instagram DM → Email → Telefón. Ukážka: "Ako salón XY získal 30 nových klientiek"',
      seasonal: 'Celoročne, peak pred sviatkami (Vianoce, Valentín, ples)'
    },
    {
      id: 'autoservisy',
      name: 'Autoservisy & pneuservisy',
      icon: '🔧',
      tier: 2,
      priority: 72,
      months: '5–6',
      count: '3 000–5 000',
      package: 'Starter €149–€269',
      ltv: '€1 800–€5 000',
      scores: { digital: 2, willingness: 3, roi: 4, competition: 1 },
      description: 'Nízka digitálna zrelosť ale silný lokálny dopyt. Takmer žiadna konkurencia od agentúr.',
      leadSources: [
        'FinStat SK-NACE 45.20 (údržba motorových vozidiel)',
        'Google Maps: "autoservis/pneuservis" + mestá',
        'Autobazar.sk, Automarket.sk – inzerenti',
        'Zlaté Stránky: Autoservisy, Pneuservisy'
      ],
      keywords: ['autoservis reklama', 'pneuservis marketing', 'autoopravovňa google'],
      outreach: 'Telefón → Email. Priamy, stručný prístup. Sezónny hook: "Sezóna prezutia = peak dopytov"',
      seasonal: 'Apríl (letné pneumatiky), október (zimné pneumatiky)'
    },
    {
      id: 'pravnici',
      name: 'Právnici & účtovníci',
      icon: '⚖️',
      tier: 2,
      priority: 68,
      months: '5–6',
      count: '13 000–19 000',
      package: 'Professional €329–€499',
      ltv: '€4 000–€8 000',
      scores: { digital: 3, willingness: 4, roi: 3, competition: 2 },
      description: 'Vysoká ochota platiť, dlhé LTV. LinkedIn je primárny kanál.',
      leadSources: [
        'Slovenská advokátska komora – zoznam advokátov',
        'Slovenská komora daňových poradcov',
        'FinStat SK-NACE 69.10 (právne služby), 69.20 (účtovníctvo)',
        'LinkedIn: "advokát" / "účtovník" Slovensko'
      ],
      keywords: ['advokát marketing', 'právnik reklama', 'účtovníctvo google ads'],
      outreach: 'LinkedIn (výhradne) → Email. Profesionálny tón, case studies.',
      seasonal: 'Január (daňové priznania), september (obchodná sezóna)'
    },
    {
      id: 'fitness',
      name: 'Fitness & wellness',
      icon: '💪',
      tier: 2,
      priority: 65,
      months: '5–6',
      count: '1 100–1 800',
      package: 'Starter–Professional €149–€329',
      ltv: '€1 800–€5 000',
      scores: { digital: 3, willingness: 3, roi: 3, competition: 2 },
      description: 'Silný sezónny dopyt, členský model = predvídateľné tržby.',
      leadSources: [
        'Google Maps: "fitness/gym/wellness" + mestá',
        'Instagram: fitness účty s aktívnou komunitou',
        'GoPass, MultiSport – partnerské centrá',
        'Facebook skupiny: Fitness Slovensko'
      ],
      keywords: ['fitness reklama', 'gym marketing', 'wellness centrum google ads'],
      outreach: 'Instagram → Email → Telefón. Hook: "Január = 40% nových členov. Ste pripravení?"',
      seasonal: 'Január (novoročné predsavzatia), september (návrat po lete)'
    },
    {
      id: 'skoly',
      name: 'Jazykové & autoškoly',
      icon: '📚',
      tier: 2,
      priority: 62,
      months: '5–6',
      count: '1 300–2 200',
      package: 'Starter €149–€269',
      ltv: '€1 200–€3 500',
      scores: { digital: 3, willingness: 3, roi: 4, competition: 1 },
      description: 'Jasný enrollment model, ľahko merateľný ROI na dopyt.',
      leadSources: [
        'FinStat SK-NACE 85.53 (autoškoly), 85.59 (jazykové školy)',
        'Google Maps: "jazyková škola/autoškola" + mestá',
        'Kurzy.sk, EduPage – registrované školy',
        'Facebook: reklamné skupiny pre jazykové školy'
      ],
      keywords: ['jazyková škola reklama', 'autoškola marketing', 'kurzy google ads'],
      outreach: 'Email → Telefón. Hook: "Každý mesiac hľadá 5 000 ľudí autoškolu na Google"',
      seasonal: 'Máj–jún (pred letom), august–september (nový školský rok)'
    },
    {
      id: 'stavba',
      name: 'Stavba & remeslá',
      icon: '🏗️',
      tier: 3,
      priority: 55,
      months: '7–12',
      count: '~124 000',
      package: 'Starter €149',
      ltv: '€900–€1 800',
      scores: { digital: 1, willingness: 2, roi: 3, competition: 1 },
      description: 'Najväčší segment na SK trhu. Veľmi nízka digitálna zrelosť, ale obrovský objem.',
      leadSources: [
        'FinStat SK-NACE 41-43 (stavebníctvo), revenue >€50K',
        'Google Maps: "murár/elektrikár/inštalatér/stolár" + mestá',
        'Bazos.sk, Jaspravim.sk – inzerujúci remeselníci',
        'Zlaté Stránky: Stavebné firmy, Elektrikári, Inštalatéri'
      ],
      keywords: ['stavebná firma reklama', 'remeselník marketing', 'elektrikár google'],
      outreach: 'Telefón (primárne) → SMS → Email. Jednoduchý jazyk, žiadny žargón.',
      seasonal: 'Február–marec (príprava na sezónu), jeseň (interiérové práce)'
    }
  ];

  // ============================================================
  // DATA: Checklist úloh per segment
  // ============================================================
  
  LM.outreachChecklists = {
    eshopy: [
      { id: 'e1', text: 'Stiahnuť FinStat zoznam (SK-NACE 47.91, tržby >€100K)' },
      { id: 'e2', text: 'Overiť ne-inzerentov v Google Ads Transparency' },
      { id: 'e3', text: 'Overiť ne-inzerentov v Meta Ad Library' },
      { id: 'e4', text: 'Scrape Shoptet katalóg (7 000+ SK e-shopov)' },
      { id: 'e5', text: 'Obohatiť kontakty cez Hunter.io / Kaspr' },
      { id: 'e6', text: 'Pripraviť personalizovaný email template' },
      { id: 'e7', text: 'Spustiť LinkedIn outreach (50 kontaktov/týždeň)' },
      { id: 'e8', text: 'Follow-up hovory 3 dni po emaili' },
      { id: 'e9', text: 'Poslať free case study / mini-audit' },
      { id: 'e10', text: 'Naplánovať demo stretnutia' }
    ],
    zubari: [
      { id: 'z1', text: 'Stiahnuť FinStat (SK-NACE 86.23)' },
      { id: 'z2', text: 'Google Maps scraping: "zubár" + krajské mestá' },
      { id: 'z3', text: 'Overiť ne-inzerentov (Google + Meta)' },
      { id: 'z4', text: 'Pripraviť email template pre zubárov' },
      { id: 'z5', text: 'Vytvoriť vizuál: "Koľko pacientov strácate?"' },
      { id: 'z6', text: 'Spustiť emailové kampane (segmentované podľa mesta)' },
      { id: 'z7', text: 'Follow-up hovory po 5 dňoch' },
      { id: 'z8', text: 'Ponúknuť free audit viditeľnosti' },
      { id: 'z9', text: 'Pripraviť case study (po prvom klientovi)' },
      { id: 'z10', text: 'Vytvoriť landing page: adlify.eu/pre-zubarov' }
    ],
    reality: [
      { id: 'r1', text: 'Stiahnuť FinStat (SK-NACE 68.31)' },
      { id: 'r2', text: 'Zozbierať kancelárie z Reality.sk a Nehnuteľnosti.sk' },
      { id: 'r3', text: 'Overiť ne-inzerentov (Google + Meta)' },
      { id: 'r4', text: 'LinkedIn prospecting: "realitný maklér"' },
      { id: 'r5', text: 'Pripraviť ROI email: "Za cenu portálového inzerátu..."' },
      { id: 'r6', text: 'Spustiť LinkedIn outreach' },
      { id: 'r7', text: 'Email kampane na kancelárie bez reklám' },
      { id: 'r8', text: 'Ponúknuť porovnanie: portály vs. Google Ads' },
      { id: 'r9', text: 'Follow-up hovory' },
      { id: 'r10', text: 'Pripraviť vertikálnu landing page' }
    ],
    restauracie: [
      { id: 'g1', text: 'Google Maps scraping: reštaurácie + TOP 8 miest' },
      { id: 'g2', text: 'Filtrovať podniky s 4+ hviezdičkami a >50 recenzií' },
      { id: 'g3', text: 'Overiť ne-inzerentov (Google + Meta)' },
      { id: 'g4', text: 'Stiahnuť kontakty z TripAdvisor listingov' },
      { id: 'g5', text: 'Pripraviť email template: "Viac hostí za menej peňazí"' },
      { id: 'g6', text: 'Hromadný email (200/týždeň)' },
      { id: 'g7', text: 'Follow-up hovory na najsľubnejšie kontakty' },
      { id: 'g8', text: 'Instagram DM pre aktívne gastro účty' },
      { id: 'g9', text: 'Pripraviť case study (po prvom klientovi)' },
      { id: 'g10', text: 'Vytvoriť landing page: adlify.eu/pre-restauracie' }
    ],
    beauty: [
      { id: 'b1', text: 'Google Maps scraping: kadernícke salóny + mestá' },
      { id: 'b2', text: 'Instagram research: beauty účty 500+ followerov' },
      { id: 'b3', text: 'Overiť ne-inzerentov (Meta Ad Library)' },
      { id: 'b4', text: 'Stiahnuť kontakty z Bookio/Reservio' },
      { id: 'b5', text: 'Pripraviť Instagram DM template' },
      { id: 'b6', text: 'Spustiť Instagram outreach (30 DM/deň)' },
      { id: 'b7', text: 'Email kampane na salóny bez reklám' },
      { id: 'b8', text: 'Vizuál: "Ako salón XY získal 30 nových klientiek"' },
      { id: 'b9', text: 'Follow-up hovory' },
      { id: 'b10', text: 'Vytvoriť landing page: adlify.eu/pre-salony' }
    ],
    autoservisy: [
      { id: 'a1', text: 'FinStat SK-NACE 45.20 + Google Maps scraping' },
      { id: 'a2', text: 'Overiť ne-inzerentov v Google Ads Transparency' },
      { id: 'a3', text: 'Pripraviť telefónny skript (stručný, praktický)' },
      { id: 'a4', text: 'Sezónny email: "Blíži sa prezúvanie – buďte viditeľní"' },
      { id: 'a5', text: 'Cold calling kampaň (20 hovorov/deň)' },
      { id: 'a6', text: 'Follow-up email po hovore' },
      { id: 'a7', text: 'Pripraviť case study z autoservis segmentu' },
      { id: 'a8', text: 'Google Ads ukážka pre lokálne autoservisy' },
      { id: 'a9', text: 'Ponúknuť free audit (čo hľadajú vodiči vo vašom meste)' },
      { id: 'a10', text: 'Landing page: adlify.eu/pre-autoservisy' }
    ],
    pravnici: [
      { id: 'p1', text: 'LinkedIn Sales Navigator: advokáti/účtovníci SK' },
      { id: 'p2', text: 'FinStat SK-NACE 69.10 + 69.20' },
      { id: 'p3', text: 'SAK (Slovenská advokátska komora) – zoznam' },
      { id: 'p4', text: 'Pripraviť profesionálny LinkedIn message' },
      { id: 'p5', text: 'Spustiť LinkedIn outreach (20 connection requests/deň)' },
      { id: 'p6', text: 'Email kampane s case study' },
      { id: 'p7', text: 'Ponúknuť bezplatnú konzultáciu' },
      { id: 'p8', text: 'Follow-up po 7 dňoch' },
      { id: 'p9', text: 'Pripraviť whitepaper: "Marketing pre advokátov v 2026"' },
      { id: 'p10', text: 'Landing page: adlify.eu/pre-pravnikov' }
    ],
    fitness: [
      { id: 'f1', text: 'Google Maps: "fitness/gym/wellness" + mestá' },
      { id: 'f2', text: 'Instagram: fitness účty s aktívnou komunitou' },
      { id: 'f3', text: 'GoPass/MultiSport – partnerské centrá' },
      { id: 'f4', text: 'Overiť ne-inzerentov (Meta Ad Library)' },
      { id: 'f5', text: 'Pripraviť sezónny email: "Január = 40% nových členov"' },
      { id: 'f6', text: 'Instagram DM outreach' },
      { id: 'f7', text: 'Email kampane na fitness centrá' },
      { id: 'f8', text: 'Follow-up hovory' },
      { id: 'f9', text: 'Pripraviť ROI kalkulačku pre fitness' },
      { id: 'f10', text: 'Landing page: adlify.eu/pre-fitness' }
    ],
    skoly: [
      { id: 's1', text: 'FinStat SK-NACE 85.53 + 85.59' },
      { id: 's2', text: 'Google Maps: "jazyková škola/autoškola" + mestá' },
      { id: 's3', text: 'Kurzy.sk – registrované vzdelávacie inštitúcie' },
      { id: 's4', text: 'Overiť ne-inzerentov' },
      { id: 's5', text: 'Pripraviť email: "5 000 ľudí mesačne hľadá autoškolu na Google"' },
      { id: 's6', text: 'Email kampane' },
      { id: 's7', text: 'Follow-up hovory' },
      { id: 's8', text: 'Ponúknuť free audit: koľko dopytov strácate' },
      { id: 's9', text: 'Pripraviť case study' },
      { id: 's10', text: 'Landing page: adlify.eu/pre-skoly' }
    ],
    stavba: [
      { id: 'st1', text: 'FinStat SK-NACE 41-43, tržby >€50K' },
      { id: 'st2', text: 'Google Maps: "murár/elektrikár/inštalatér" + mestá' },
      { id: 'st3', text: 'Bazos.sk, Jaspravim.sk – aktívni remeselníci' },
      { id: 'st4', text: 'Pripraviť jednoduchý telefónny skript' },
      { id: 'st5', text: 'Cold calling kampaň (30 hovorov/deň)' },
      { id: 'st6', text: 'SMS follow-up po hovore' },
      { id: 'st7', text: 'Jednoduchý email: "Zákazníci vás hľadajú na Google"' },
      { id: 'st8', text: 'Ukážka lokálnej reklamy (screenshot)' },
      { id: 'st9', text: 'Ponúknuť mesiac zadarmo na vyskúšanie' },
      { id: 'st10', text: 'Landing page: adlify.eu/pre-remesla' }
    ]
  };

  // ============================================================
  // DATA: 12-mesačný plán
  // ============================================================
  
  LM.outreachPlan = [
    {
      phase: 1,
      title: 'Príprava & prvé oslovenia',
      months: 'Mesiace 1–2',
      color: '#f97316',
      target: '5–10 klientov',
      tasks: [
        'Nastaviť nástroje (FinStat, Marketing Miner, Hunter.io, Kaspr)',
        'Vytvoriť email šablóny pre Tier 1 segmenty',
        'Vybudovať LinkedIn a firemné profily',
        'Stiahnuť prvé lead listy: E-shopy (500) + Zubári (200)',
        'Kvalifikovať leady (overiť v Transparency nástrojoch)',
        'Spustiť emailové kampane (100/týždeň)',
        'Spustiť LinkedIn outreach (50 spojení/týždeň)',
        'Prvé demá a konverzie'
      ]
    },
    {
      phase: 2,
      title: 'Škálovanie Tier 1',
      months: 'Mesiace 3–4',
      color: '#ec4899',
      target: '15–25 klientov',
      tasks: [
        'Rozšíriť lead listy: Reštaurácie (500) + Beauty salóny (500)',
        'Vytvoriť prvé case studies z existujúcich klientov',
        'Spustiť vertikálne landing pages',
        'Zvýšiť email outreach na 200/týždeň',
        'Začať follow-up calling',
        'Pridať cold calling do outreach mixu',
        'Sledovať a optimalizovať konverzné pomery',
        'Cieľ: 15–25 aktívnych klientov'
      ]
    },
    {
      phase: 3,
      title: 'Expanzia do Tier 2',
      months: 'Mesiace 5–6',
      color: '#8b5cf6',
      target: '40–60 klientov',
      tasks: [
        'Stiahnuť Tier 2 lead listy',
        'Cieliť autoservisy (sezóna prezúvania)',
        'Cieliť právnikov/účtovníkov cez LinkedIn',
        'Cieliť fitness centrá (pred septembrom)',
        'Vytvoriť referral program pre existujúcich klientov',
        'Zvážiť BNI Slovakia členstvo',
        'Zúčastniť sa konferencií (Marketing RULEZZ, E-commerce Bridge)',
        'Cieľ: 40–60 aktívnych klientov'
      ]
    },
    {
      phase: 4,
      title: 'Škálovanie & Tier 3',
      months: 'Mesiace 7–12',
      color: '#3b82f6',
      target: '100+ klientov',
      tasks: [
        'Cieliť stavebný sektor (124K firiem – telefonicky)',
        'Rozšíriť tím o ďalšieho obchodníka',
        'Automatizovať lead scoring v admin paneli',
        'Vytvoriť video testimonials od klientov',
        'Spustiť vlastnú Google Ads kampaň pre Adlify',
        'Content marketing: blog články per segment',
        'Partnerstvá s web agentúrami (vzájomné odporúčania)',
        'Cieľ: 100+ aktívnych klientov'
      ]
    }
  ];

  // ============================================================
  // DATA: Nástroje
  // ============================================================
  
  LM.outreachTools = [
    { name: 'FinStat.sk', desc: 'Finančné dáta, SK-NACE filtrovanie', price: 'od €29/mes', priority: 'high', url: 'https://finstat.sk' },
    { name: 'Marketing Miner', desc: 'PPC aktivita, bulk domain check', price: 'Custom plán', priority: 'high', url: 'https://marketingminer.com' },
    { name: 'Google Maps Scraper (Apify)', desc: 'Scraping biznis kontaktov', price: 'Free tier ~2 000/mes', priority: 'high', url: 'https://apify.com' },
    { name: 'Hunter.io', desc: 'Hľadanie emailov z domén', price: 'od €49/mes', priority: 'medium', url: 'https://hunter.io' },
    { name: 'Kaspr', desc: 'B2B kontakty z LinkedIn', price: 'od €49/mes', priority: 'medium', url: 'https://kaspr.io' },
    { name: 'LinkedIn Sales Navigator', desc: 'Cielenie decision makerov', price: '~€99/mes', priority: 'medium', url: 'https://linkedin.com/sales' },
    { name: 'Google Ads Transparency', desc: 'Overenie inzerentov (kto inzeruje)', price: 'ZADARMO', priority: 'high', url: 'https://adstransparency.google.com' },
    { name: 'Meta Ad Library', desc: 'Overenie FB/IG reklám', price: 'ZADARMO', priority: 'high', url: 'https://facebook.com/ads/library' }
  ];

  // ============================================================
  // DATA: SOP Postup pre zamestnanca
  // ============================================================
  
  LM.outreachSOP = [
    {
      id: 'sop1',
      title: '🌅 Ranný štart (8:30–9:00)',
      icon: '☕',
      tasks: [
        'Otvor admin panel → Leady → tab "Prehľad" a skontroluj KPI za včera',
        'Skontroluj odpovede na emaily v info@adlify.eu',
        'Odpíš na všetky odpovede do 1 hodiny',
        'Zapíš poznámky k leadom, ktorí odpovedali (v admin paneli)',
        'Naplánuj si prioritné úlohy na dnes podľa checklistu'
      ]
    },
    {
      id: 'sop2',
      title: '🔍 Prospecting nových leadov (9:00–11:00)',
      icon: '🎯',
      tasks: [
        'Vyber aktuálny prioritný segment (podľa tabu "Segmenty")',
        'Otvor príslušný zdroj (FinStat / Google Maps / LinkedIn)',
        'Stiahni/nájdi 30–50 nových kontaktov',
        'Pre každý kontakt over v Google Ads Transparency či inzeruje',
        'Kontakty BEZ reklám = ideálni kandidáti → importuj do Adlify admin',
        'Vyplň email, telefón, odvetvie a mesto',
        'Cieľ: 30 nových kvalifikovaných leadov denne'
      ]
    },
    {
      id: 'sop3',
      title: '📧 Email outreach (11:00–12:30)',
      icon: '✉️',
      tasks: [
        'Otvor tab "Zoznam" → filtruj status "Nové"',
        'Označ 40 leadov → klikni "📧 Ponuky" (hromadné odoslanie)',
        'Vyber vhodnú šablónu podľa segmentu',
        'Skontroluj predmet a obsah emailu',
        'Odošli s oneskorením (2s medzi emailami)',
        'Sleduj doručenie a odpovede',
        'Cieľ: 40 emailov denne / 200 týždenne'
      ]
    },
    {
      id: 'sop4',
      title: '📞 Follow-up hovory (13:30–15:30)',
      icon: '📱',
      tasks: [
        'Filtruj leady so statusom "Kontaktované" (odoslaný email pred 3+ dňami)',
        'Priprav si telefónny skript (krátky, priateľský)',
        'Volaj: "Dobrý deň, volám z Adlify. Posielali sme Vám emailom analýzu..."',
        'Cieľ hovoru: dohodnúť 15-min prezentáciu/demo',
        'Po hovore aktualizuj status leadu v admin paneli',
        'Zapíš poznámky: záujem, námietky, ďalší krok',
        'Cieľ: 10–15 hovorov denne / 50 týždenne'
      ]
    },
    {
      id: 'sop5',
      title: '🤖 AI analýzy & ponuky (15:30–16:30)',
      icon: '📊',
      tasks: [
        'Vyber leady, ktorí prejavili záujem (odpovedali / dohodnuté demo)',
        'Spusti AI analýzu (tlačidlo 🤖 v zozname)',
        'Skontroluj výsledky analýzy → uprav ak treba (✏️ Upraviť)',
        'Pridaj osobnú poznámku relevantné pre klienta',
        'Generuj personalizovanú ponuku (📄 Generovať ponuku)',
        'Odošli ponuku emailom s odkazom',
        'Cieľ: 5 personalizovaných ponúk denne'
      ]
    },
    {
      id: 'sop6',
      title: '🎯 Demo prezentácie (podľa plánu)',
      icon: '💻',
      tasks: [
        'Priprav sa: otvor ponuku klienta, prejdi si analýzu',
        'Začni demo s "Čo sme o vás zistili" (SWOT, online prítomnosť)',
        'Ukáž konkrétne kľúčové slová a ich hľadanosť',
        'Porovnaj s konkurenciou (kto inzeruje, kto nie)',
        'Predstav odporúčaný balíček a rozpočet',
        'Odpovedz na otázky, rieš námietky',
        'Zavrieť: "Kedy by sme mohli začať?"',
        'Po deme: pošli summary email s ďalšími krokmi',
        'Cieľ: 5 dem týždenne, 15% konverzia na klienta'
      ]
    },
    {
      id: 'sop7',
      title: '📈 Koniec dňa (16:30–17:00)',
      icon: '📋',
      tasks: [
        'Aktualizuj všetky statusy leadov v admin paneli',
        'Zapíš denné čísla: emaily, hovory, demá, konverzie',
        'Skontroluj checklist – čo zostalo na zajtra',
        'Odpíš na posledné správy',
        'Naplánuj prioritné úlohy na ďalší deň',
        'Piatok: týždenný report pre manažment'
      ]
    }
  ];

  // ============================================================
  // STATE: Checklist progress (localStorage)
  // ============================================================
  
  LM.outreachState = {
    checklist: {},    // { segmentId: { taskId: true/false } }
    planChecks: {},   // { phaseIdx-taskIdx: true/false }
    
    load() {
      try {
        const saved = localStorage.getItem('adlify_outreach_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.checklist = parsed.checklist || {};
          this.planChecks = parsed.planChecks || {};
        }
      } catch (e) { console.warn('Failed to load outreach state:', e); }
    },
    
    save() {
      try {
        localStorage.setItem('adlify_outreach_state', JSON.stringify({
          checklist: this.checklist,
          planChecks: this.planChecks
        }));
      } catch (e) { console.warn('Failed to save outreach state:', e); }
    },
    
    toggleCheck(segmentId, taskId) {
      if (!this.checklist[segmentId]) this.checklist[segmentId] = {};
      this.checklist[segmentId][taskId] = !this.checklist[segmentId][taskId];
      this.save();
    },
    
    isChecked(segmentId, taskId) {
      return this.checklist[segmentId]?.[taskId] || false;
    },
    
    getProgress(segmentId) {
      const tasks = LM.outreachChecklists[segmentId] || [];
      if (tasks.length === 0) return 0;
      const done = tasks.filter(t => this.isChecked(segmentId, t.id)).length;
      return Math.round((done / tasks.length) * 100);
    },
    
    togglePlan(key) {
      this.planChecks[key] = !this.planChecks[key];
      this.save();
    },
    
    isPlanChecked(key) {
      return this.planChecks[key] || false;
    },
    
    getPlanProgress(phaseIdx) {
      const phase = LM.outreachPlan[phaseIdx];
      if (!phase) return 0;
      const done = phase.tasks.filter((_, i) => this.isPlanChecked(`${phaseIdx}-${i}`)).length;
      return Math.round((done / phase.tasks.length) * 100);
    }
  };
  
  // Načítať uložený stav
  LM.outreachState.load();

  // ============================================================
  // RENDER: Tab Segmenty
  // ============================================================
  
  LM.renderSegmentyTab = function() {
    const tiers = [
      { label: 'Tier 1 — Mesiace 1–4', tier: 1, color: '#22c55e' },
      { label: 'Tier 2 — Mesiace 5–6', tier: 2, color: '#f59e0b' },
      { label: 'Tier 3 — Mesiace 7–12', tier: 3, color: '#94a3b8' }
    ];

    return `
      <div class="outreach-section">
        <div class="outreach-kpi-grid">
          <div class="outreach-kpi"><span class="kpi-value">684K</span><span class="kpi-label">SK SME firiem</span></div>
          <div class="outreach-kpi"><span class="kpi-value">10</span><span class="kpi-label">Segmentov</span></div>
          <div class="outreach-kpi"><span class="kpi-value">150</span><span class="kpi-label">Leadov/týždeň</span></div>
          <div class="outreach-kpi"><span class="kpi-value">100+</span><span class="kpi-label">Cieľ rok 1</span></div>
        </div>

        ${tiers.map(t => `
          <h3 class="outreach-tier-title" style="border-left: 4px solid ${t.color}; padding-left: 12px; margin: 24px 0 16px;">
            ${t.label}
          </h3>
          <div class="outreach-segments-list">
            ${this.outreachSegments.filter(s => s.tier === t.tier).map(seg => `
              <div class="outreach-segment-card" id="seg-card-${seg.id}">
                <div class="seg-header" onclick="LeadsModule.toggleSegmentDetail('${seg.id}')">
                  <div class="seg-icon">${seg.icon}</div>
                  <div class="seg-info">
                    <strong>${seg.name}</strong>
                    <span class="seg-meta">${seg.count} firiem · ${seg.package}</span>
                  </div>
                  <div class="seg-score-col">
                    <div class="seg-priority-bar">
                      <div class="seg-priority-fill" style="width: ${seg.priority}%; background: ${t.color};"></div>
                    </div>
                    <span class="seg-priority-num">${seg.priority}</span>
                  </div>
                  <span class="seg-toggle" id="seg-toggle-${seg.id}">▸</span>
                </div>
                <div class="seg-detail" id="seg-detail-${seg.id}" style="display:none;">
                  <p class="seg-desc">${seg.description}</p>
                  
                  <div class="seg-scores">
                    ${['digital', 'willingness', 'roi', 'competition'].map(key => {
                      const labels = { digital: 'Digitálna zrelosť', willingness: 'Ochota platiť', roi: 'Ľahkosť ROI', competition: 'Konkurencia agentúr' };
                      const val = seg.scores[key];
                      return `<div class="seg-score-item">
                        <span class="seg-score-label">${labels[key]}</span>
                        <div class="seg-score-dots">${[1,2,3,4,5].map(i => `<span class="seg-dot ${i <= val ? 'filled' : ''}"></span>`).join('')}</div>
                      </div>`;
                    }).join('')}
                  </div>
                  
                  <div class="seg-detail-grid">
                    <div>
                      <h4>📋 Zdroje leadov</h4>
                      <ul>${seg.leadSources.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                    <div>
                      <h4>🔍 Kľúčové slová</h4>
                      <div class="seg-tags">${seg.keywords.map(k => `<span class="seg-tag">${k}</span>`).join('')}</div>
                      <h4 style="margin-top:12px;">📣 Outreach stratégia</h4>
                      <p>${seg.outreach}</p>
                      <h4 style="margin-top:12px;">📅 Sezóna</h4>
                      <p>${seg.seasonal}</p>
                    </div>
                  </div>
                  
                  <div class="seg-footer">
                    <span>LTV: <strong>${seg.ltv}</strong></span>
                    <span>Mesiace: <strong>${seg.months}</strong></span>
                    <span>Checklist: <strong>${this.outreachState.getProgress(seg.id)}%</strong></span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
      ${this.getOutreachStyles()}
    `;
  };

  LM.toggleSegmentDetail = function(segId) {
    const detail = document.getElementById(`seg-detail-${segId}`);
    const toggle = document.getElementById(`seg-toggle-${segId}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    if (toggle) toggle.textContent = isOpen ? '▸' : '▾';
  };

  // ============================================================
  // RENDER: Tab Checklist
  // ============================================================
  
  LM.renderChecklistTab = function() {
    // Celkový progress
    const totalTasks = this.outreachSegments.reduce((sum, seg) => sum + (this.outreachChecklists[seg.id]?.length || 0), 0);
    const totalDone = this.outreachSegments.reduce((sum, seg) => {
      const tasks = this.outreachChecklists[seg.id] || [];
      return sum + tasks.filter(t => this.outreachState.isChecked(seg.id, t.id)).length;
    }, 0);
    const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

    return `
      <div class="outreach-section" id="checklist-container">
        <!-- Celkový progress -->
        <div class="cl-total-progress">
          <div class="cl-total-left">
            <div class="cl-total-ring" style="--pct: ${totalPct}">
              <svg viewBox="0 0 36 36">
                <defs><linearGradient id="cl-grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs>
                <path class="cl-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                <path class="cl-ring-fill" stroke-dasharray="${totalPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              </svg>
              <span class="cl-ring-text">${totalPct}%</span>
            </div>
            <div>
              <strong class="cl-total-title">Celkový progres</strong>
              <span class="cl-total-sub">${totalDone} z ${totalTasks} úloh dokončených</span>
            </div>
          </div>
        </div>

        <!-- Quick nav -->
        <div class="cl-nav">
          ${this.outreachSegments.map(seg => {
            const progress = this.outreachState.getProgress(seg.id);
            const tasks = this.outreachChecklists[seg.id] || [];
            const done = tasks.filter(t => this.outreachState.isChecked(seg.id, t.id)).length;
            return `
              <button class="cl-nav-btn ${progress === 100 ? 'done' : ''}" onclick="LeadsModule.scrollToChecklist('${seg.id}')">
                <span class="cl-nav-icon">${seg.icon}</span>
                <span class="cl-nav-name">${seg.name}</span>
                <span class="cl-nav-count">${done}/${tasks.length}</span>
                <div class="cl-nav-bar"><div class="cl-nav-fill" style="width:${progress}%"></div></div>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Segment blocks -->
        ${this.outreachSegments.map(seg => {
          const tasks = this.outreachChecklists[seg.id] || [];
          const progress = this.outreachState.getProgress(seg.id);
          const done = tasks.filter(t => this.outreachState.isChecked(seg.id, t.id)).length;
          return `
            <div class="cl-block" id="checklist-${seg.id}">
              <div class="cl-block-head">
                <div class="cl-block-info">
                  <span class="cl-block-icon">${seg.icon}</span>
                  <div>
                    <strong>${seg.name}</strong>
                    <span class="cl-block-meta">${seg.count} firiem · Tier ${seg.tier} · ${done}/${tasks.length} hotovo</span>
                  </div>
                </div>
                <div class="cl-block-progress">
                  <div class="cl-pbar"><div class="cl-pfill" style="width:${progress}%"></div></div>
                  <span class="cl-ptext">${progress}%</span>
                </div>
              </div>
              <div class="cl-tasks">
                ${tasks.map((task, i) => {
                  const checked = this.outreachState.isChecked(seg.id, task.id);
                  return `
                    <div class="cl-task ${checked ? 'checked' : ''}" data-seg="${seg.id}" data-task="${task.id}">
                      <div class="cl-checkbox ${checked ? 'on' : ''}">
                        <svg viewBox="0 0 12 12"><polyline points="2.5 6 5 8.5 9.5 3.5"/></svg>
                      </div>
                      <span class="cl-task-num">${i + 1}.</span>
                      <span class="cl-task-text">${task.text}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${this.getOutreachStyles()}
    `;
    
    // Event delegation po renderovaní
    setTimeout(() => {
      const container = document.getElementById('checklist-container');
      if (container && !container._clBound) {
        container._clBound = true;
        container.addEventListener('click', (e) => {
          const taskEl = e.target.closest('.cl-task');
          if (!taskEl) return;
          const segId = taskEl.dataset.seg;
          const taskId = taskEl.dataset.task;
          if (!segId || !taskId) return;
          
          LM.outreachState.toggleCheck(segId, taskId);
          const isChecked = LM.outreachState.isChecked(segId, taskId);
          
          // Toggle vizuál
          taskEl.classList.toggle('checked', isChecked);
          const cb = taskEl.querySelector('.cl-checkbox');
          if (cb) cb.classList.toggle('on', isChecked);
          
          // Update progress bar v bloku
          const progress = LM.outreachState.getProgress(segId);
          const block = document.getElementById('checklist-' + segId);
          if (block) {
            const fill = block.querySelector('.cl-pfill');
            const text = block.querySelector('.cl-ptext');
            if (fill) fill.style.width = progress + '%';
            if (text) text.textContent = progress + '%';
            
            // Update meta text
            const tasks = LM.outreachChecklists[segId] || [];
            const done = tasks.filter(t => LM.outreachState.isChecked(segId, t.id)).length;
            const meta = block.querySelector('.cl-block-meta');
            if (meta) {
              const seg = LM.outreachSegments.find(s => s.id === segId);
              meta.textContent = seg.count + ' firiem · Tier ' + seg.tier + ' · ' + done + '/' + tasks.length + ' hotovo';
            }
          }
          
          // Update celkový ring
          const totalTasks = LM.outreachSegments.reduce((s, seg) => s + (LM.outreachChecklists[seg.id]?.length || 0), 0);
          const totalDone = LM.outreachSegments.reduce((s, seg) => {
            const t = LM.outreachChecklists[seg.id] || [];
            return s + t.filter(tk => LM.outreachState.isChecked(seg.id, tk.id)).length;
          }, 0);
          const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
          const ringFill = document.querySelector('.cl-ring-fill');
          const ringText = document.querySelector('.cl-ring-text');
          const totalSub = document.querySelector('.cl-total-sub');
          if (ringFill) ringFill.setAttribute('stroke-dasharray', totalPct + ', 100');
          if (ringText) ringText.textContent = totalPct + '%';
          if (totalSub) totalSub.textContent = totalDone + ' z ' + totalTasks + ' úloh dokončených';
        });
      }
    }, 60);
  };

  LM.scrollToChecklist = function(segId) {
    const el = document.getElementById(`checklist-${segId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ============================================================
  // RENDER: Tab 12M Plán
  // ============================================================
  
  LM.renderPlanTab = function() {
    return `
      <div class="outreach-section">
        <div class="plan-overview">
          ${this.outreachPlan.map((phase, idx) => {
            const progress = this.outreachState.getPlanProgress(idx);
            return `
              <div class="plan-phase-summary" style="border-top: 3px solid ${phase.color}">
                <span class="plan-phase-num" style="background:${phase.color}">${phase.phase}</span>
                <strong>${phase.months}</strong>
                <div class="mini-progress"><div class="mini-fill" style="width:${progress}%; background:${phase.color}"></div></div>
                <small>Cieľ: ${phase.target}</small>
              </div>
            `;
          }).join('')}
        </div>

        <div class="plan-timeline">
          ${this.outreachPlan.map((phase, phaseIdx) => {
            const progress = this.outreachState.getPlanProgress(phaseIdx);
            return `
              <div class="plan-phase-block">
                <div class="plan-phase-header" style="background: linear-gradient(135deg, ${phase.color}20, ${phase.color}10); border-left: 4px solid ${phase.color};">
                  <div>
                    <span class="plan-phase-badge" style="background:${phase.color}">${phase.months}</span>
                    <h3 style="color:${phase.color}; margin: 8px 0 4px;">${phase.title}</h3>
                    <span class="plan-target">🎯 Cieľ: ${phase.target}</span>
                  </div>
                  <div class="plan-progress-wrap">
                    <div class="checklist-progress-bar"><div class="checklist-progress-fill" style="width:${progress}%; background:${phase.color}"></div></div>
                    <span>${progress}%</span>
                  </div>
                </div>
                <div class="plan-tasks">
                  ${phase.tasks.map((task, taskIdx) => {
                    const key = `${phaseIdx}-${taskIdx}`;
                    const checked = this.outreachState.isPlanChecked(key);
                    return `
                      <label class="checklist-task ${checked ? 'done' : ''}" onclick="LeadsModule.togglePlanTask('${key}', ${phaseIdx}, this)">
                        <input type="checkbox" ${checked ? 'checked' : ''}>
                        <span class="task-text">${task}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ${this.getOutreachStyles()}
    `;
  };

  LM.togglePlanTask = function(key, phaseIdx, el) {
    this.outreachState.togglePlan(key);
    const checked = this.outreachState.isPlanChecked(key);
    el.classList.toggle('done', checked);
    
    // Update progress
    const progress = this.outreachState.getPlanProgress(phaseIdx);
    const header = el.closest('.plan-phase-block')?.querySelector('.plan-progress-wrap');
    if (header) {
      const fill = header.querySelector('.checklist-progress-fill');
      const text = header.querySelector('span:last-child');
      if (fill) fill.style.width = progress + '%';
      if (text) text.textContent = progress + '%';
    }
  };

  // ============================================================
  // RENDER: Tab Nástroje
  // ============================================================
  
  LM.renderNastrojeTab = function() {
    return `
      <div class="outreach-section">
        <h3 style="margin-bottom: 16px;">🧰 Nástroje (€275–€350/mesiac celkom)</h3>
        <div class="tools-grid">
          ${this.outreachTools.map(tool => `
            <a href="${tool.url}" target="_blank" class="tool-card priority-${tool.priority}">
              <div class="tool-card-top">
                <strong>${tool.name}</strong>
                <span class="tool-priority ${tool.priority}">${tool.priority === 'high' ? '🔴 High' : '🟡 Medium'}</span>
              </div>
              <p>${tool.desc}</p>
              <span class="tool-price">${tool.price}</span>
            </a>
          `).join('')}
        </div>

        <h3 style="margin: 32px 0 16px;">🔄 6-krokový workflow kvalifikácie leadov</h3>
        <div class="workflow-steps">
          ${[
            { num: 1, title: 'Zber surových leadov', desc: 'FinStat, Google Maps, Zlaté Stránky, ZRSR → Excel zoznam', icon: '📥' },
            { num: 2, title: 'Check digitálnej pripravenosti', desc: 'Marketing Miner bulk domain check → identifikovať ne-inzerentov', icon: '🔍' },
            { num: 3, title: 'Overenie v Transparency', desc: 'Google Ads + Meta Ad Library → potvrdiť, že nemajú reklamy', icon: '✅' },
            { num: 4, title: 'Obohatenie kontaktov', desc: 'Hunter.io / Kaspr → email + telefón vlastníka/marketing manažéra', icon: '📧' },
            { num: 5, title: 'Scoring & priradenie', desc: 'Lead score podľa tržieb, kvality webu, konkurencie v meste, segmentu', icon: '📊' },
            { num: 6, title: 'Import do Adlify', desc: 'Import do leads modulu → automatické priradenie obchodníkovi', icon: '🚀' }
          ].map(step => `
            <div class="workflow-step">
              <div class="workflow-num" style="background: linear-gradient(135deg, #f97316, #ec4899);">${step.num}</div>
              <div class="workflow-content">
                <strong>${step.icon} ${step.title}</strong>
                <p>${step.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <h3 style="margin: 32px 0 16px;">📊 Týždenné KPI ciele</h3>
        <div class="kpi-targets-grid">
          ${[
            { label: 'Nové leady', value: '150', unit: '/týždeň' },
            { label: 'Odoslané emaily', value: '200', unit: '/týždeň' },
            { label: 'Uskutočnené hovory', value: '50', unit: '/týždeň' },
            { label: 'Demo stretnutia', value: '5', unit: '/týždeň' },
            { label: 'Konverzia z dem', value: '15%', unit: '' },
            { label: 'Q1 cieľ klientov', value: '25', unit: '' }
          ].map(kpi => `
            <div class="kpi-target-card">
              <span class="kpi-target-value">${kpi.value}</span>
              <span class="kpi-target-label">${kpi.label} ${kpi.unit}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ${this.getOutreachStyles()}
    `;
  };

  // ============================================================
  // RENDER: Tab Postup (SOP)
  // ============================================================
  
  LM.renderPostupTab = function() {
    return `
      <div class="outreach-section">
        <div class="sop-intro">
          <h3>📖 Denný postup obchodníka</h3>
          <p>Štandardný operačný postup (SOP) pre každodenné aktivity pri B2B outreachi. Dodržiavaj tento postup a sleduj výsledky.</p>
        </div>

        <div class="sop-timeline">
          ${this.outreachSOP.map(step => `
            <div class="sop-block">
              <div class="sop-block-header">
                <span class="sop-icon">${step.icon}</span>
                <h4>${step.title}</h4>
              </div>
              <div class="sop-tasks">
                ${step.tasks.map((task, i) => `
                  <div class="sop-task">
                    <span class="sop-task-num">${i + 1}</span>
                    <span>${task}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="sop-tips">
          <h3 style="margin-bottom: 16px;">💡 Kľúčové pravidlá</h3>
          <div class="sop-tips-grid">
            ${[
              { icon: '⏱️', title: 'Rýchla odpoveď', desc: 'Na každú odpoveď od leadu reaguj do 1 hodiny. Rýchlosť = dôveryhodnosť.' },
              { icon: '📝', title: 'Vždy zapisuj', desc: 'Každý hovor, email, stretnutie zapíš do admin panelu. Bez záznamu to neexistuje.' },
              { icon: '🎯', title: 'Personalizuj', desc: 'Nikdy neposielajú generické emaily. Vždy spomeň meno firmy, ich odvetvie a konkrétny tip.' },
              { icon: '🔁', title: '3× follow-up', desc: 'Minimum 3 kontaktné body: email → hovor → druhý email. Väčšina konverzií je z follow-upu.' },
              { icon: '📊', title: 'Sleduj metriky', desc: 'Denne: odoslané emaily, hovory, demá. Týždenne: konverzný pomer, nový klienti.' },
              { icon: '🚫', title: 'Nehovor "AI"', desc: 'Adlify sa prezentuje ako profesionálna marketingová agentúra. Nikdy nespomínaj AI v komunikácii s klientmi.' },
              { icon: '🤝', title: 'Buduj dôveru', desc: 'Slovenský trh je o vzťahoch. Najprv hodnota, potom predaj. Ponúkni free audit.' },
              { icon: '📅', title: 'Sezónnosť', desc: 'Prispôsob outreach sezóne segmentu. Auto pred prezúvaním, gastro pred letom, eshopy pred Q4.' }
            ].map(tip => `
              <div class="sop-tip-card">
                <span class="sop-tip-icon">${tip.icon}</span>
                <strong>${tip.title}</strong>
                <p>${tip.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="sop-scripts">
          <h3 style="margin-bottom: 16px;">📞 Telefónne skripty</h3>
          
          <div class="script-card">
            <h4>Prvý hovor (follow-up po emaili)</h4>
            <div class="script-text">
              "Dobrý deň, [meno]. Volám z marketingovej agentúry Adlify. Pred pár dňami sme Vám posielali emailom analýzu online prítomnosti Vašej firmy [názov]. Chcel by som sa opýtať, či ste ju mali možnosť pozrieť? ... Rád by som Vám v 15 minútach ukázal, ako by sme Vám vedeli pomôcť získať viac zákazníkov cez internet. Kedy by Vám to vyhovovalo?"
            </div>
          </div>
          
          <div class="script-card">
            <h4>Námietka: "Nemáme rozpočet"</h4>
            <div class="script-text">
              "Rozumiem. Práve preto sme navrhli balíček od 149€ mesačne – to je menej ako jeden inzerát v novinách. A na rozdiel od novín, presne viete koľko ľudí vašu reklamu videlo a kliklo. Navyše, rozpočet na samotnú reklamu si určujete sami. Čo keby sme sa stretli len na 15 minút a ukázal som Vám, čo je reálne?"
            </div>
          </div>
          
          <div class="script-card">
            <h4>Námietka: "Už máme agentúru"</h4>
            <div class="script-text">
              "Super, to je skvelé že investujete do online marketingu. Môžem sa opýtať, aké výsledky momentálne dosahujete? ... Ponúkame bezplatné porovnanie vašich aktuálnych kampaní s tým, čo by sme navrhli my. Bez záväzkov – ak ste spokojní s tým čo máte, len potvrdíme že ste v dobrých rukách."
            </div>
          </div>
        </div>
      </div>
      ${this.getOutreachStyles()}
    `;
  };

  // ============================================================
  // STYLES
  // ============================================================
  
  LM.getOutreachStyles = function() {
    // Vráť prázdny ak styly sú už injektované
    if (document.getElementById('outreach-styles')) return '';
    
    return `<style id="outreach-styles">
      /* Base */
      .outreach-section { padding: 0; }
      
      /* Fix tabs overflow with 8 tabs */
      .billing-tabs-new { flex-wrap: wrap; }
      @media (max-width: 1200px) { .billing-tabs-new { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .billing-tabs-new::-webkit-scrollbar { display: none; }
        .billing-tabs-new .tab-btn-new { white-space: nowrap; flex-shrink: 0; }
      }
      
      /* KPI Grid */
      .outreach-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
      .outreach-kpi { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
      .kpi-value { display: block; font-size: 1.75rem; font-weight: 800; background: linear-gradient(135deg, #f97316, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .kpi-label { font-size: 0.85rem; color: #64748b; }
      
      /* Segment Cards */
      .outreach-segments-list { display: flex; flex-direction: column; gap: 8px; }
      .outreach-segment-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; transition: box-shadow 0.2s; }
      .outreach-segment-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      .seg-header { display: flex; align-items: center; gap: 12px; padding: 16px; cursor: pointer; }
      .seg-icon { font-size: 1.5rem; width: 40px; text-align: center; flex-shrink: 0; }
      .seg-info { flex: 1; min-width: 0; }
      .seg-info strong { display: block; font-size: 0.95rem; }
      .seg-meta { font-size: 0.8rem; color: #64748b; }
      .seg-score-col { display: flex; align-items: center; gap: 8px; width: 150px; flex-shrink: 0; }
      .seg-priority-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
      .seg-priority-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
      .seg-priority-num { font-weight: 700; font-size: 0.9rem; color: #1e293b; min-width: 24px; text-align: right; }
      .seg-toggle { font-size: 1.2rem; color: #94a3b8; width: 24px; text-align: center; flex-shrink: 0; }
      
      .seg-detail { padding: 0 16px 16px; border-top: 1px solid #f1f5f9; }
      .seg-desc { color: #475569; font-size: 0.9rem; margin: 12px 0 16px; line-height: 1.6; }
      
      .seg-scores { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
      .seg-score-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 8px; }
      .seg-score-label { font-size: 0.8rem; color: #64748b; }
      .seg-score-dots { display: flex; gap: 4px; }
      .seg-dot { width: 10px; height: 10px; border-radius: 50%; background: #e2e8f0; }
      .seg-dot.filled { background: #f97316; }
      
      .seg-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .seg-detail-grid h4 { font-size: 0.85rem; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
      .seg-detail-grid ul { list-style: none; padding: 0; margin: 0; }
      .seg-detail-grid li { font-size: 0.85rem; color: #475569; padding: 4px 0; padding-left: 16px; position: relative; }
      .seg-detail-grid li::before { content: "→"; position: absolute; left: 0; color: #f97316; }
      .seg-detail-grid p { font-size: 0.85rem; color: #475569; line-height: 1.5; }
      .seg-tags { display: flex; flex-wrap: wrap; gap: 4px; }
      .seg-tag { display: inline-block; padding: 3px 10px; background: #f1f5f9; border-radius: 12px; font-size: 0.8rem; color: #475569; }
      
      .seg-footer { display: flex; gap: 24px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 0.85rem; color: #64748b; }
      
      /* Checklist - Total Progress */
      .cl-total-progress { display: flex; align-items: center; justify-content: space-between; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
      .cl-total-left { display: flex; align-items: center; gap: 20px; }
      .cl-total-ring { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
      .cl-total-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
      .cl-ring-bg { fill: none; stroke: #e2e8f0; stroke-width: 3; }
      .cl-ring-fill { fill: none; stroke: url(#cl-grad); stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
      .cl-ring-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; color: #1e293b; }
      .cl-total-title { display: block; font-size: 1rem; font-weight: 700; color: #0f172a; }
      .cl-total-sub { font-size: 0.85rem; color: #64748b; }
      
      /* Checklist - Quick Nav */
      .cl-nav { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
      @media (max-width: 900px) { .cl-nav { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 600px) { .cl-nav { grid-template-columns: repeat(2, 1fr); } }
      .cl-nav-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-family: inherit; font-size: inherit; }
      .cl-nav-btn:hover { border-color: #f97316; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(249,115,22,0.1); }
      .cl-nav-btn.done { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-color: #86efac; }
      .cl-nav-icon { font-size: 1.4rem; }
      .cl-nav-name { font-size: 0.75rem; font-weight: 600; color: #334155; text-align: center; }
      .cl-nav-count { font-size: 0.7rem; color: #94a3b8; font-weight: 600; }
      .cl-nav-bar { width: 100%; height: 3px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
      .cl-nav-fill { height: 100%; background: linear-gradient(90deg, #f97316, #ec4899); border-radius: 2px; transition: width 0.4s ease; }
      
      /* Checklist - Blocks */
      .cl-block { background: white; border: 1px solid #e2e8f0; border-radius: 16px; margin-bottom: 16px; overflow: hidden; transition: box-shadow 0.2s; }
      .cl-block:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
      .cl-block-head { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
      .cl-block-info { display: flex; align-items: center; gap: 14px; }
      .cl-block-icon { font-size: 1.6rem; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 12px; flex-shrink: 0; }
      .cl-block-info strong { display: block; font-size: 1rem; color: #0f172a; }
      .cl-block-meta { font-size: 0.8rem; color: #94a3b8; }
      .cl-block-progress { display: flex; align-items: center; gap: 10px; }
      .cl-pbar { width: 120px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
      .cl-pfill { height: 100%; background: linear-gradient(90deg, #f97316, #ec4899); border-radius: 3px; transition: width 0.4s ease; }
      .cl-ptext { font-weight: 700; font-size: 0.85rem; color: #334155; min-width: 36px; text-align: right; }
      
      /* Checklist - Tasks */
      .cl-tasks { padding: 8px 12px; }
      .cl-task { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; cursor: pointer; transition: all 0.15s; user-select: none; }
      .cl-task:hover { background: #f8fafc; }
      .cl-task.checked { opacity: 0.55; }
      .cl-task.checked .cl-task-text { text-decoration: line-through; }
      
      /* Custom Checkbox */
      .cl-checkbox { width: 22px; height: 22px; border-radius: 6px; border: 2px solid #d1d5db; background: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
      .cl-checkbox svg { width: 12px; height: 12px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity 0.15s; }
      .cl-checkbox.on { background: linear-gradient(135deg, #f97316, #ec4899); border-color: transparent; transform: scale(1.05); }
      .cl-checkbox.on svg { opacity: 1; }
      
      .cl-task-num { font-size: 0.75rem; color: #94a3b8; font-weight: 600; min-width: 20px; }
      .cl-task-text { font-size: 0.9rem; color: #334155; line-height: 1.4; }
      
      /* Plan */
      .mini-progress { width: 60px; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; margin: 6px auto; }
      .mini-fill { height: 100%; background: #f97316; border-radius: 2px; transition: width 0.3s; }
      .checklist-progress-bar { width: 120px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
      .checklist-progress-fill { height: 100%; background: linear-gradient(90deg, #f97316, #ec4899); border-radius: 3px; transition: width 0.4s; }
      .checklist-task { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; cursor: pointer; transition: all 0.15s; user-select: none; }
      .checklist-task:hover { background: #f8fafc; }
      .checklist-task.done .task-text { text-decoration: line-through; color: #94a3b8; }
      .checklist-task input[type="checkbox"] { accent-color: #f97316; width: 18px; height: 18px; flex-shrink: 0; cursor: pointer; }
      .task-text { font-size: 0.9rem; color: #334155; line-height: 1.4; }
      .tier-badge { padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
      .tier-badge.tier-1 { background: #dcfce7; color: #166534; }
      .tier-badge.tier-2 { background: #fef3c7; color: #92400e; }
      .tier-badge.tier-3 { background: #f1f5f9; color: #64748b; }
      .plan-overview { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
      .plan-phase-summary { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
      .plan-phase-num { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; color: white; font-weight: 700; font-size: 0.85rem; margin-bottom: 8px; }
      .plan-phase-summary strong { display: block; font-size: 0.85rem; margin-bottom: 8px; }
      .plan-phase-summary small { color: #64748b; font-size: 0.8rem; }
      
      .plan-phase-block { background: white; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
      .plan-phase-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; }
      .plan-phase-badge { display: inline-block; padding: 4px 12px; border-radius: 8px; color: white; font-size: 0.8rem; font-weight: 600; }
      .plan-target { font-size: 0.85rem; color: #64748b; }
      .plan-progress-wrap { display: flex; align-items: center; gap: 8px; min-width: 150px; }
      .plan-tasks { padding: 8px 16px 16px; }
      
      /* Tools */
      .tools-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .tool-card { display: block; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-decoration: none; color: inherit; transition: all 0.2s; }
      .tool-card:hover { border-color: #f97316; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      .tool-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .tool-card-top strong { color: #1e293b; font-size: 0.95rem; }
      .tool-priority { font-size: 0.75rem; padding: 2px 8px; border-radius: 8px; }
      .tool-priority.high { background: #fee2e2; color: #dc2626; }
      .tool-priority.medium { background: #fef3c7; color: #d97706; }
      .tool-card p { font-size: 0.85rem; color: #64748b; margin: 0 0 8px; }
      .tool-price { font-size: 0.85rem; font-weight: 600; color: #f97316; }
      
      /* Workflow */
      .workflow-steps { display: flex; flex-direction: column; gap: 0; }
      .workflow-step { display: flex; align-items: flex-start; gap: 16px; padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 0; position: relative; }
      .workflow-step:first-child { border-radius: 12px 12px 0 0; }
      .workflow-step:last-child { border-radius: 0 0 12px 12px; }
      .workflow-step:not(:last-child) { border-bottom: none; }
      .workflow-num { width: 32px; height: 32px; border-radius: 50%; color: white; font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .workflow-content { flex: 1; }
      .workflow-content strong { display: block; font-size: 0.9rem; margin-bottom: 4px; }
      .workflow-content p { font-size: 0.85rem; color: #64748b; margin: 0; }
      
      /* KPI Targets */
      .kpi-targets-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .kpi-target-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
      .kpi-target-value { display: block; font-size: 1.5rem; font-weight: 800; color: #f97316; }
      .kpi-target-label { font-size: 0.8rem; color: #64748b; }
      
      /* SOP */
      .sop-intro { background: linear-gradient(135deg, #fff7ed, #fef2f2); border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
      .sop-intro h3 { margin: 0 0 8px; }
      .sop-intro p { margin: 0; color: #64748b; font-size: 0.9rem; }
      
      .sop-block { background: white; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
      .sop-block-header { display: flex; align-items: center; gap: 12px; padding: 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      .sop-icon { font-size: 1.5rem; }
      .sop-block-header h4 { margin: 0; font-size: 0.95rem; }
      .sop-tasks { padding: 12px 16px; }
      .sop-task { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f8fafc; font-size: 0.9rem; color: #334155; line-height: 1.5; }
      .sop-task:last-child { border-bottom: none; }
      .sop-task-num { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f97316, #ec4899); color: white; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
      
      .sop-tips-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .sop-tip-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
      .sop-tip-icon { font-size: 1.5rem; display: block; margin-bottom: 8px; }
      .sop-tip-card strong { display: block; margin-bottom: 6px; font-size: 0.9rem; }
      .sop-tip-card p { font-size: 0.85rem; color: #64748b; margin: 0; line-height: 1.5; }
      
      .sop-scripts { margin-top: 32px; }
      .script-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
      .script-card h4 { font-size: 0.9rem; margin: 0 0 12px; color: #f97316; }
      .script-text { background: #f8fafc; border-radius: 8px; padding: 16px; font-size: 0.9rem; color: #334155; line-height: 1.7; font-style: italic; }
      
      /* Responsive */
      @media (max-width: 768px) {
        .outreach-kpi-grid, .plan-overview { grid-template-columns: repeat(2, 1fr); }
        .seg-score-col { display: none; }
        .seg-detail-grid { grid-template-columns: 1fr; }
        .tools-grid, .sop-tips-grid, .kpi-targets-grid { grid-template-columns: 1fr; }
        .cl-nav { grid-template-columns: repeat(2, 1fr); }
        .cl-block-head { flex-direction: column; gap: 12px; align-items: flex-start; }
        .cl-total-progress { flex-direction: column; gap: 12px; }
      }
    </style>`;
  };

  // ============================================================
  // PATCH: Inject new tabs into LeadsModule
  // ============================================================
  
  const _originalShowTab = LM.showTab.bind(LM);
  
  LM.showTab = function(tab) {
    const outreachTabs = ['segmenty', 'checklist', 'plan', 'nastroje', 'postup'];
    
    if (outreachTabs.includes(tab)) {
      document.querySelectorAll('.tab-btn-new').forEach(btn => btn.classList.remove('active'));
      document.querySelector(`.tab-btn-new[data-tab="${tab}"]`)?.classList.add('active');
      
      const contentEl = document.getElementById('leads-tab-content');
      if (!contentEl) return;
      
      switch(tab) {
        case 'segmenty': contentEl.innerHTML = this.renderSegmentyTab(); break;
        case 'checklist': contentEl.innerHTML = this.renderChecklistTab(); break;
        case 'plan': contentEl.innerHTML = this.renderPlanTab(); break;
        case 'nastroje': contentEl.innerHTML = this.renderNastrojeTab(); break;
        case 'postup': contentEl.innerHTML = this.renderPostupTab(); break;
      }
    } else {
      _originalShowTab(tab);
    }
  };

  // ============================================================
  // PATCH: Inject tab buttons via MutationObserver (safe, no recursion)
  // ============================================================
  
  function injectOutreachTabs() {
    const tabsContainer = document.querySelector('.billing-tabs-new');
    if (tabsContainer && !tabsContainer.querySelector('[data-tab="segmenty"]')) {
      tabsContainer.insertAdjacentHTML('beforeend',
        '<button class="tab-btn-new" data-tab="segmenty" onclick="LeadsModule.showTab(\'segmenty\')"><span class="tab-icon">🎯</span> Segmenty</button>' +
        '<button class="tab-btn-new" data-tab="checklist" onclick="LeadsModule.showTab(\'checklist\')"><span class="tab-icon">✅</span> Checklist</button>' +
        '<button class="tab-btn-new" data-tab="plan" onclick="LeadsModule.showTab(\'plan\')"><span class="tab-icon">📅</span> 12M Plán</button>' +
        '<button class="tab-btn-new" data-tab="nastroje" onclick="LeadsModule.showTab(\'nastroje\')"><span class="tab-icon">🧰</span> Nástroje</button>' +
        '<button class="tab-btn-new" data-tab="postup" onclick="LeadsModule.showTab(\'postup\')"><span class="tab-icon">📖</span> Postup</button>'
      );
    }
  }

  // Sleduj zmeny v main-content a injektuj taby keď sa Leady renderujú
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    const observer = new MutationObserver(() => {
      injectOutreachTabs();
    });
    observer.observe(mainContent, { childList: true, subtree: true });
  }
  
  // Skúsiť injektovať aj hneď (pre prípad že Leady sú už renderované)
  injectOutreachTabs();

  console.log('✅ Leads Outreach Extension v1.0 loaded - 5 nových tabov');

})();
