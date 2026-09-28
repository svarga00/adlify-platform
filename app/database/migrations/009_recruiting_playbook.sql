-- ============================================================================
-- DANUBRA Hub — 009 — Náborový playbook: remeslá, skríning, náborové plány
-- ============================================================================
-- Vysielanie ľudí na nemecké stavby stojí a padá na dvoch veciach:
--   1. či človek remeslo naozaj vie (nie čo tvrdí do telefónu),
--   2. či sa dá nasadiť legálne (A1, §48b, §9 HwO, minimálna mzda).
--
-- Preto tu nie je len „zoznam kandidátov", ale:
--   danubra_trades               — čo mám o remesle vedieť, kým začnem naberať
--   danubra_screening_questions  — otázky vrátane overovacích („skrytých")
--   danubra_recruitment_plans    — koho, koľko, kam, za koľko — krok za krokom
--   danubra_screening_answers    — čo odpovedal, ako som to ohodnotil
--
-- Overovacia otázka je taká, na ktorú kandidát nevie, že sa ňou preveruje.
-- Znie ako bežná odborná otázka, ale odpoveď sa dá overiť a človek, ktorý
-- remeslo nerobil, ju nevie — nedá sa na ňu pripraviť z inzerátu.
--
-- Idempotentné.
-- ============================================================================

-- ── Remeslá: znalostná karta ────────────────────────────────────────────────
create table if not exists danubra_trades (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name_sk text not null,
  name_de text,
  -- zaradenie a peniaze
  lohngruppe text,                     -- 'LG1' | 'LG2' (Bau-Mindestlohn)
  rate_worker_min numeric,             -- čo si pýta človek (€/h)
  rate_worker_max numeric,
  rate_client_min numeric,             -- čo za neho fakturujeme odberateľovi
  rate_client_max numeric,
  -- právne
  regulated bool default false,        -- §9 HwO — oznámenie Handwerkskammer
  legal_note text,
  -- čo mám o remesle vedieť
  summary text,
  work_scope text[],                   -- čo reálne na stavbe robí
  materials text[],                    -- s čím pracuje (pozná ich menom)
  tools text[],                        -- čo má mať vlastné
  certificates text[],                 -- čo musí vedieť doložiť
  red_flags text[],                    -- podľa čoho spoznám, že to nerobil
  daily_output text,                   -- reálny denný výkon — meradlo na kontrolu
  sort_order int default 0,
  active bool default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dtrade_active on danubra_trades(active, sort_order);

-- ── Skríningové otázky ──────────────────────────────────────────────────────
create table if not exists danubra_screening_questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- stabilný kľúč kvôli opakovanému seedu
  trade_key text,                      -- null = univerzálna, platí pre všetkých
  phase text not null default 'phone', -- 'phone' | 'interview' | 'onsite'
  kind text not null default 'knowledge',
    -- knowledge  — odborná znalosť
    -- hidden     — overovacia; kandidát nevie, že sa ňou preveruje
    -- legal      — živnosť, A1, doklady
    -- logistics  — doprava, ubytovanie, termín nástupu
    -- motivation — peniaze, ochota, dôvod odchodu
  question_sk text not null,
  question_de text,
  good_answer text,                    -- čo chcem počuť
  red_flag_answer text,                -- pri čom zbystriť
  weight int not null default 1,       -- váha v skóre (kritické otázky 2–3)
  sort_order int default 0,
  active bool default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dsq_trade on danubra_screening_questions(trade_key, phase, sort_order);

-- ── Náborový plán ───────────────────────────────────────────────────────────
-- „Idem naberať troch sadrokartonárov do Mníchova na marec za 18 €/h."
create table if not exists danubra_recruitment_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  trade_key text,
  headcount int not null default 1,
  skill_level text,                    -- 'werker' | 'fachwerker'
  legal_form text default 'szco',      -- 'szco' | 'employee'
  -- kam a kedy
  subcontract_id uuid references danubra_subcontracts,
  city text, country text default 'DE',
  start_date date, deadline date,
  -- peniaze
  offer_rate numeric,                  -- čo ponúkame človeku €/h
  client_rate numeric,                 -- čo fakturujeme odberateľovi €/h
  budget numeric,                      -- rozpočet na reklamu
  -- podmienky, ktoré predávajú
  accommodation_provided bool default true,
  transport_provided bool default false,
  advance_possible bool default false, -- záloha pred prvou výplatou
  -- kanály a inzerát
  channels text[],                     -- 'meta_ads','facebook','profesia','referral','tiktok','web'
  ad_text text,
  -- priebeh
  status text not null default 'draft',-- draft | active | paused | done | cancelled
  step int not null default 1,         -- kam sa dostal sprievodca (1–5)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_drp_status on danubra_recruitment_plans(status);
create index if not exists idx_drp_trade on danubra_recruitment_plans(trade_key);

-- ── Odpovede kandidáta ──────────────────────────────────────────────────────
create table if not exists danubra_screening_answers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references danubra_candidates on delete cascade,
  question_id uuid references danubra_screening_questions on delete cascade,
  plan_id uuid references danubra_recruitment_plans on delete set null,
  answer_text text,
  rating int,                          -- 0 nevie · 1 slabé · 2 dobré · 3 presné
  flagged bool default false,          -- vyslovene varovná odpoveď
  note text,
  asked_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  unique (candidate_id, question_id)
);
create index if not exists idx_dsa_cand on danubra_screening_answers(candidate_id);

-- ── Rozšírenie kandidátov ───────────────────────────────────────────────────
alter table danubra_candidates add column if not exists plan_id uuid references danubra_recruitment_plans;
alter table danubra_candidates add column if not exists screening_score numeric;   -- 0–100 %
alter table danubra_candidates add column if not exists screening_verdict text;    -- strong|ok|weak|reject
alter table danubra_candidates add column if not exists screening_done_at timestamptz;
alter table danubra_candidates add column if not exists last_site text;            -- kde naposledy robil
alter table danubra_candidates add column if not exists last_foreman text;         -- polier, ktorý ho vie potvrdiť
alter table danubra_candidates add column if not exists reference_checked bool default false;

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['danubra_trades','danubra_screening_questions',
                           'danubra_recruitment_plans','danubra_screening_answers'] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function danubra_set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
  end loop;
end $$;

-- ============================================================================
-- SEED — remeslá
-- ============================================================================
-- Sadzby sú orientačné pásma pre nemecké stavby v roku 2026. Bau-Mindestlohn
-- LG1 15,86 €/h, LG2 17,34 €/h — pod to sa ísť nesmie ani pri SZČO modeli,
-- lebo pri kontrole Zoll sa skúma skutočný obsah práce, nie názov zmluvy.
insert into danubra_trades
  (key, name_sk, name_de, lohngruppe, rate_worker_min, rate_worker_max,
   rate_client_min, rate_client_max, regulated, legal_note, summary,
   work_scope, materials, tools, certificates, red_flags, daily_output, sort_order)
values
('trockenbau','Sadrokartonár','Trockenbauer','LG2',16,20,26,32,false,null,
 'Najžiadanejšie remeslo na nemeckých stavbách a zároveň to, kde je najviac ľudí, ktorí „to už raz robili". Rozdiel medzi montážnikom a majstrom je vidieť na rovnosti steny a na tom, či pozná stupne kvality povrchu.',
 array['montáž priečok CW/UW','predsadené steny a šachty','zavesené podhľady CD/UD',
       'jednoduché a dvojité opláštenie','vkladanie minerálnej izolácie',
       'špárovanie a brúsenie do stupňa Q1–Q4','protipožiarne a vlhkuvzdorné konštrukcie'],
 array['GKB biela štandardná','GKBI impregnovaná zelená do vlhka','GKF protipožiarna ružová',
       'profily CW 50/75/100, UW, CD, UD','Uniflott a Fugenfüller','výstužná páska',
       'akustická napojovacia páska','minerálna vlna'],
 array['aku skrutkovač s hĺbkovým dorazom','nožnice na plech a rezačka profilov','odlamovací nôž',
       'rotačný laser alebo vodováha 2 m','špachtle 20 a 40 cm','rašpľa na hrany','brúsna žirafa'],
 array['prax doložiteľná stavbou a polierom'],
 array['nevie rozteč profilov','nepozná rozdiel medzi GKB a GKBI',
       'nevie povedať, čo je Q2 a Q3','hovorí len „dával som dosky"',
       'sľubuje nereálny denný výkon'],
 'Montáž priečky s jednoduchým opláštením 25–35 m² za deň vo dvojici. Kto tvrdí 60 m², buď klame, alebo to robí zle.',1),

('maliar','Maliar','Maler und Lackierer','LG2',15.9,19,25,30,false,null,
 'Na novostavbách nadväzuje priamo na sadrokartón, takže musí rozumieť stupňom Q. V Nemecku sa veľa strieka Airlessom — kto to nikdy nerobil, spomalí celú partiu.',
 array['penetrácia podkladu','stierkovanie a brúsenie','maľba valčekom a striekaním Airless',
       'tapetovanie vrátane sklotextilu','fasádne nátery a WDVS','lakovanie zárubní a kovu'],
 array['Tiefengrund penetrácia','disperzná farba','silikátová a silikónová fasádna farba',
       'Rollputz a štruktúrované omietky','akrylové tmely'],
 array['Airless striekacie zariadenie alebo aspoň prax s ním','teleskopická tyč a valčeky',
       'brúsna žirafa','maskovacia technika','stierky'],
 array['prax doložiteľná stavbou'],
 array['nevie, koľko vrstiev ide na nový sadrokartón','nepozná Airless ani dýzy',
       'nerozlišuje silikátovú a disperznú farbu'],
 'Valčekom 150–250 m² steny za deň v dvoch vrstvách, Airlessom podstatne viac.',2),

('obkladac','Obkladač','Fliesenleger','LG2',17,22,28,34,false,null,
 'Remeslo, kde chyba stojí najviac — zle urobená hydroizolácia v sprche sa zistí až keď zateká k susedovi. Veľkoformát 60×60 a viac je dnes štandard a vyžaduje inú techniku ako malý obklad.',
 array['príprava a nivelácia podkladu','hydroizolácia mokrých zón','kladenie obkladu a dlažby',
       'veľkoformát metódou buttering-floating','škárovanie a silikónovanie','dilatačné škáry'],
 array['flexibilné lepidlo C2TE','hydroizolačná stierka a tesniace pásy',
       'oddeľovacia rohož (Entkopplungsmatte)','škárovacia hmota','silikón a dilatačné profily',
       'krížiky a nivelačný systém'],
 array['rezačka a mokrá píla','zubové hladidlá viacerých veľkostí','gumené hladidlo',
       'nivelačný systém','laser'],
 array['prax doložiteľná stavbou'],
 array['nevie, aké zubové hladidlo na veľký formát','nepozná oddeľovaciu rohož',
       'na otázku o hydroizolácii odpovie „dá sa aj bez toho"'],
 'Bežná dlažba 15–25 m² za deň, veľkoformát a mozaika podstatne menej.',3),

('murar','Murár','Maurer','LG2',16.5,20,27,33,false,null,
 'V Nemecku sa murujú prevažne presné tvárnice na tenkovrstvovú maltu — kto celý život muroval na klasickú maltu, prvé dni spomalí. Dôležitá je práca s laserom a založenie prvého radu.',
 array['založenie prvého radu do nivelety','murovanie presných tvárnic','preklady a vence',
       'debnenie menších konštrukcií','omietanie a jadrové omietky','osadzovanie zárubní'],
 array['Poroton a vápennopieskové tvárnice','tenkovrstvová malta','vyrovnávacia malta',
       'preklady','výstuž do škár'],
 array['murárska lyžica a naberačka na tenkovrstvovú maltu','rotačný laser','vodováha 2 m',
       'gumené kladivo','píla na tvárnice'],
 array['prax doložiteľná stavbou'],
 array['nevie hrúbku škáry pri tenkovrstvovej malte','nevie, ako sa zakladá prvý rad',
       'nepracoval s laserom'],
 'Podľa hrúbky muriva 6–12 m² za deň.',4),

('betonar','Betonár a železiar','Betonbauer / Eisenflechter','LG2',16.5,20,27,33,false,null,
 'Práca v partii a v tvrdom tempe. Kľúčové je krytie výstuže a poctivé vibrovanie — chyby sú neopraviteľné, lebo sú zaliate v betóne.',
 array['systémové debnenie Doka a Peri','viazanie výstuže podľa výkresu','osadzovanie dištančníkov',
       'ukladanie a vibrovanie betónu','ošetrovanie betónu','odformovanie'],
 array['betonárska oceľ a viazací drôt','dištančné podložky','systémové debnenie',
       'odformovací olej','tesniace pásy'],
 array['viazacie kliešte','vŕtačka','uťahovák','ochranné pomôcky'],
 array['prax doložiteľná stavbou'],
 array['nevie, aké má byť krytie výstuže','nepozná systémové debnenie menom',
       'podceňuje vibrovanie'],
 'Viazanie výstuže 400–800 kg na osobu za deň podľa zložitosti.',5),

('tesar','Tesár','Zimmerer','LG2',17,21,28,34,false,null,
 'Krovy, debnenie, drevostavby. V Nemecku sa veľa robí systémovým debnením a montovanými krovmi — čítanie výkresu je podmienka, nie výhoda.',
 array['krovy a väzníkové strechy','debnenie stropov a stien','montáž drevostavieb',
       'záklop a latovanie','osadzovanie strešných okien'],
 array['KVH a BSH hranoly','systémové debnenie','kotvy a spojovacie prvky','difúzne fólie'],
 array['motorová a ponorná píla','uťahovák','tesárska sekera','laser','pás a šnúra'],
 array['prax doložiteľná stavbou','výhodou práca vo výškach'],
 array['nečíta výkres','nepozná systémové debnenie','nemá skúsenosť s prácou vo výške'],
 'Podľa typu konštrukcie; pri debnení stropu 25–40 m² na osobu za deň.',6),

('zvarac','Zvárač','Schweißer','LG2',18,24,30,38,false,
 'Certifikát podľa EN ISO 9606-1 musí byť platný a na správnu metódu aj polohu. Bez neho ho na nemeckú stavbu nikto nepustí.',
 'Jediné remeslo, kde sa kvalifikácia dá overiť papierom na mieste. Ak kandidát nevie povedať číslo metódy a polohy, ktoré má na certifikáte, nezváral v Nemecku.',
 array['zváranie MAG 135 a TIG 141','zváranie konštrukčnej ocele a nerezu',
       'príprava zvarových plôch','čítanie WPS','opravy a montážne zvary'],
 array['zváracie drôty a elektródy','ochranné plyny','brúsne kotúče'],
 array['zváracia kukla samostmievacia','uhlová brúska','kladivo a kefa na trosku','meradlá zvarov'],
 array['EN ISO 9606-1 platný certifikát','polohy PA, PB, PF podľa potreby','výhodou EN 1090'],
 array['nevie číslo metódy, ktorú má na certifikáte','certifikát po platnosti',
       'nevie, čo je WPS'],
 'Podľa výkresu; pri montážnych zvaroch sa hodnotí kvalita, nie meter.',7),

('zamocnik','Zámočník','Schlosser / Metallbauer','LG2',17,21,28,34,false,null,
 'Oceľové konštrukcie, zábradlia, montáž. Presnosť a lícovanie sú dôležitejšie ako rýchlosť.',
 array['výroba a montáž oceľových konštrukcií','zábradlia a schodiská',
       'kotvenie do betónu','montáž brán a dverí','drobné zvary'],
 array['profily a plechy','chemické a mechanické kotvy','spojovací materiál'],
 array['uhlová brúska','vŕtačka a uťahovák','meradlá','zvárací zdroj podľa práce'],
 array['prax doložiteľná stavbou','výhodou zvárací certifikát'],
 array['nevie kotviť do betónu','neznalosť lícovania a merania'],
 'Podľa dielca; hodnotí sa presnosť osadenia.',8),

('elektrikar','Elektrikár','Elektriker','LG2',18,23,30,38,true,
 'REGULOVANÉ REMESLO — pred nasadením je nutné oznámenie na Handwerkskammer podľa §9 HwO. Bez neho hrozí pokuta a zastavenie prác.',
 'Právne najnáročnejšie remeslo v ponuke. Okrem odbornosti treba vybaviť oznámenie remesla, inak sa človek nesmie na stavbu ani postaviť.',
 array['rozvody v novostavbách','osadzovanie rozvádzačov','zásuvkové a svetelné okruhy',
       'ukladanie chráničiek','meranie a odovzdanie'],
 array['káble NYM a NYY','chráničky','rozvádzače a ističe','prúdové chrániče'],
 array['sada elektrikárskeho náradia','merací prístroj','vŕtačka a drážkovačka'],
 array['odborná spôsobilosť','oznámenie §9 HwO pred nástupom','výhodou znalosť VDE 0100'],
 array['nevie prierez vodiča k istič','nepozná prúdový chránič 30 mA',
       'tvrdí, že oznámenie remesla netreba'],
 'Podľa projektu; hodnotí sa počet vývodov a bezchybnosť merania.',9),

('montaznik','Montážnik','Monteur','LG1',15.9,18,25,30,false,null,
 'Široká kategória — okná, fasády, systémové konštrukcie. Cení sa manuálna zručnosť a spoľahlivosť, odbornosť sa dá doučiť.',
 array['montáž okien a dverí','fasádne systémy','montáž systémových konštrukcií','kotvenie a tesnenie'],
 array['kotviace prvky','tesniace pásky','montážna pena','silikóny'],
 array['aku náradie','vodováha','meradlá'],
 array['prax doložiteľná stavbou'],
 array['nemá vlastné náradie a tvrdí opak','nespoľahlivosť v predchádzajúcich prácach'],
 'Podľa typu montáže.',10),

('pomocnik','Pomocný pracovník','Bauhelfer','LG1',15.9,17.5,24,28,false,null,
 'Nepotrebuje remeslo, potrebuje ruky, spoľahlivosť a to, aby prišiel. Najväčšie riziko nie je neznalosť, ale že po prvej výplate nepríde späť.',
 array['príprava materiálu a jeho presun','upratovanie staveniska','pomocné práce pri remeselníkoch',
       'búracie práce','nakladanie a vykladanie'],
 array['—'],
 array['pracovná obuv a prilba','rukavice'],
 array['doklad totožnosti platný minimálne šesť mesiacov'],
 array['časté striedanie stavieb v krátkom čase','žiada zálohu hneď pri prvom hovore',
       'nevie povedať, čo robil posledné mesiace'],
 'Hodnotí sa dochádzka a spoľahlivosť, nie výkon.',11)
on conflict (key) do update set
  name_sk = excluded.name_sk, name_de = excluded.name_de, lohngruppe = excluded.lohngruppe,
  rate_worker_min = excluded.rate_worker_min, rate_worker_max = excluded.rate_worker_max,
  rate_client_min = excluded.rate_client_min, rate_client_max = excluded.rate_client_max,
  regulated = excluded.regulated, legal_note = excluded.legal_note, summary = excluded.summary,
  work_scope = excluded.work_scope, materials = excluded.materials, tools = excluded.tools,
  certificates = excluded.certificates, red_flags = excluded.red_flags,
  daily_output = excluded.daily_output, sort_order = excluded.sort_order;

-- ============================================================================
-- SEED — otázky
-- ============================================================================
-- UNIVERZÁLNE — platia pre každé remeslo
insert into danubra_screening_questions
  (code, trade_key, phase, kind, question_sk, question_de, good_answer, red_flag_answer, weight, sort_order)
values
-- právne a doklady
('u_zivnost',null,'phone','legal',
 'Máte aktívnu živnosť a od kedy? Fakturovali ste už do Nemecka?',
 'Haben Sie ein aktives Gewerbe und seit wann? Haben Sie schon nach Deutschland fakturiert?',
 'Živnosť aktívna dlhšie ako pár týždňov, vie povedať, komu fakturoval.',
 'Živnosť si „ide vybaviť" a chce nastúpiť o týždeň — nestihne to a bude tlačiť na prácu bez nej.',3,1),
('u_a1',null,'phone','legal',
 'Máte vybavený formulár A1? Viete, načo slúži?',
 'Haben Sie eine A1-Bescheinigung?',
 'Vie, že je to potvrdenie o poistení v SR, a vie, kto mu ho vybavuje.',
 '„To netreba" alebo „to sa nejako vyrieši na mieste" — pri kontrole Zoll to stojí pokutu.',3,2),
('u_doklad',null,'phone','legal',
 'Dokedy máte platný občiansky preukaz alebo pas?',
 null,
 'Platnosť aspoň šesť mesiacov dopredu.',
 'Doklad končí o pár týždňov — na stavbu ho nepustia a vybavovanie trvá.',2,3),
('u_zdravotna',null,'interview','legal',
 'Máte platnú zdravotnú prehliadku a poistenie? Bol ste niekedy práceneschopný dlhšie ako mesiac?',
 null,
 'Vie odpovedať konkrétne, prípadné obmedzenia povie sám.',
 'Zamlčí zdravotné obmedzenie, ktoré sa ukáže na stavbe pri práci vo výške alebo s bremenami.',2,4),
-- overovacie (skryté)
('u_polier',null,'phone','hidden',
 'Na ktorej stavbe ste robili naposledy a kto tam bol polier? Môžeme mu zavolať?',
 'Auf welcher Baustelle waren Sie zuletzt und wer war der Polier?',
 'Povie mesto, firmu aj meno poliera a nemá problém s tým, že sa overí.',
 'Vykrúca sa, mená si „nepamätá", stavbu vie len všeobecne. Najsilnejší signál, že prax je vymyslená.',3,10),
('u_tri_mesiace',null,'phone','hidden',
 'Čo ste robili posledné tri mesiace?',
 null,
 'Súvislá odpoveď, ktorá sedí s tým, čo hovoril o poslednej stavbe.',
 'Diera v odpovedi alebo verzia, ktorá si protirečí s predchádzajúcou otázkou.',2,11),
('u_naradie',null,'phone','hidden',
 'Aké vlastné náradie máte? Vymenujte, čo si beriete so sebou.',
 null,
 'Vymenuje konkrétne kusy vrátane značiek — kto náradie má, hovorí o ňom rád.',
 'Odpovie len „všetko, čo treba". Kto nevie vymenovať, náradie nemá.',2,12),
('u_preco_odisiel',null,'phone','hidden',
 'Za akú sadzbu ste robili naposledy a prečo ste odtiaľ odišli?',
 null,
 'Sadzba sedí s trhom a dôvod odchodu je vecný — koniec zákazky, neplatili včas.',
 'Sadzba výrazne nad trhom pri nízkej odbornosti, alebo dôvod odchodu na každom mieste rovnaký — vinu má vždy niekto iný.',2,13),
('u_vykon',null,'interview','hidden',
 'Koľko toho zvládnete za deň, keď máte pomocníka a materiál pri sebe?',
 null,
 'Reálne číslo blízko bežnému dennému výkonu remesla.',
 'Nadsadené číslo. Kto sľubuje dvojnásobok, buď remeslo nerobil, alebo robí odfláknuto.',2,14),
('u_kontrola',null,'interview','hidden',
 'Zažili ste na stavbe kontrolu z colnej správy? Ako to prebiehalo?',
 'Haben Sie schon eine Zollkontrolle auf der Baustelle erlebt?',
 'Vie opísať priebeh — kontrola dokladov, A1, mzdové podklady. Znak, že v Nemecku naozaj bol.',
 'Nevie, čo Zoll je, hoci tvrdí niekoľkoročnú prax v Nemecku.',1,15),
-- logistika
('u_nastup',null,'phone','logistics',
 'Kedy viete reálne nastúpiť a na ako dlho?',
 null,
 'Konkrétny dátum a horizont aspoň troch mesiacov.',
 '„Hocikedy" bez dátumu, alebo len na dva týždne — nábor sa nevyplatí.',2,20),
('u_doprava',null,'phone','logistics',
 'Máte vodičský preukaz a auto? Viete zobrať aj ďalších?',
 null,
 'Vodičák a ochota voziť partiu — šetrí náklady na dopravu.',
 'Bez vodičáka a zároveň bez možnosti pridať sa k niekomu.',1,21),
('u_ubytovanie',null,'phone','logistics',
 'Vyhovuje vám zdieľané ubytovanie, dvaja na izbe?',
 null,
 'Bez problémov, prípadne si povie podmienky vopred.',
 'Trvá na samostatnej izbe — pri našich maržiach to nevychádza a bude to zdroj konfliktu.',1,22),
-- motivácia a peniaze
('u_zarobok',null,'phone','motivation',
 'Koľko chcete zarobiť čistého za mesiac a koľko hodín ste ochotný odrobiť?',
 null,
 'Predstava zodpovedá desiatim hodinám denne a občasnej sobote.',
 'Chce vysoký zárobok pri osemhodinovom dni — na nemeckej stavbe to nevyjde a odíde po mesiaci.',2,30),
('u_zaloha',null,'phone','motivation',
 'Potrebujete zálohu pred prvou výplatou?',
 null,
 'Nepotrebuje, alebo si vypýta rozumnú sumu na cestu.',
 'Žiada zálohu hneď v prvom hovore a pýta sa na ňu skôr než na prácu — najčastejší vzorec pri ľuďoch, ktorí nedorazia.',2,31),
('u_rodina',null,'interview','motivation',
 'Ako to máte doma s tým, že budete niekoľko týždňov preč?',
 null,
 'Má to dohodnuté a vie, ako často chce chodiť domov.',
 'Nemá to doma dohodnuté — riziko, že odíde po prvom víkende.',1,32),
('u_odporucanie',null,'interview','motivation',
 'Máte kolegu z remesla, ktorý by šiel s vami?',
 null,
 'Má — odporúčanie je najlacnejší a najspoľahlivejší zdroj ľudí.',
 'Nemá nikoho, s kým by ho niekto poslal na stavbu.',1,33)
on conflict (code) do update set
  trade_key = excluded.trade_key, phase = excluded.phase, kind = excluded.kind,
  question_sk = excluded.question_sk, question_de = excluded.question_de,
  good_answer = excluded.good_answer, red_flag_answer = excluded.red_flag_answer,
  weight = excluded.weight, sort_order = excluded.sort_order;

-- ODBORNÉ A OVEROVACIE — podľa remesla
insert into danubra_screening_questions
  (code, trade_key, phase, kind, question_sk, question_de, good_answer, red_flag_answer, weight, sort_order)
values
-- sadrokartón
('t_sdk_rozstup','trockenbau','phone','hidden',
 'Aká je rozteč zvislých profilov pri bežnej priečke?',
 'Welchen Achsabstand haben die CW-Profile bei einer normalen Trennwand?',
 '625 mm; pri vyššom zaťažení alebo dvojitom opláštení 417 mm.',
 'Odpoveď „600" alebo „ako vyjde" — kto to robil, číslo 625 povie okamžite.',3,1),
('t_sdk_doska','trockenbau','phone','hidden',
 'Akú dosku dáte do kúpeľne a akú má farbu?',
 null,
 'Impregnovanú GKBI, zelenú.',
 'Nevie farbu ani označenie — v praxi ich rozlišuje každý, kto dosky nosil.',2,2),
('t_sdk_q','trockenbau','interview','knowledge',
 'Čo znamená Q2 a Q3 a kedy sa ktorý robí?',
 null,
 'Q2 je štandardné špárovanie, Q3 celoplošné jemné pretiahnutie pred kvalitným náterom či tapetou.',
 'Nepozná stupne vôbec — v Nemecku sa nimi preberá práca a fakturuje.',2,3),
('t_sdk_skary','trockenbau','interview','knowledge',
 'O koľko presadzujete škáry pri dvojitom opláštení?',
 null,
 'Aspoň o polovicu dosky, prakticky minimálne 400 mm.',
 '„Dávam ich na seba" — vzniknú praskliny a reklamácia.',2,4),
('t_sdk_paska','trockenbau','interview','knowledge',
 'Načo je akustická páska pod profilom pri stene?',
 null,
 'Oddelí konštrukciu od stavby a zabráni prenosu zvuku.',
 'Nevie, alebo tvrdí, že sa dá vynechať.',1,5),
-- maliar
('t_mal_vrstvy','maliar','phone','hidden',
 'Koľko vrstiev a v akom poradí ide na čerstvý sadrokartón?',
 null,
 'Najprv penetrácia, potom dve vrstvy farby, medzi nimi prebrúsenie.',
 'Jedna vrstva bez penetrácie — na Q povrchu to okamžite presvitá.',3,1),
('t_mal_airless','maliar','phone','hidden',
 'Robili ste Airlessom? Akú dýzu beriete na stenu?',
 null,
 'Vie povedať konkrétnu dýzu, bežne 515 alebo 517, a rozdiel oproti stropu.',
 'Airless pozná len z počutia — na nemeckej novostavbe spomalí celú partiu.',2,2),
('t_mal_fasada','maliar','interview','knowledge',
 'Kedy použijete silikátovú a kedy disperznú farbu?',
 null,
 'Silikátovú na minerálne podklady a paropriepustné fasády, disperznú do interiéru.',
 'Nerozlišuje ich — na fasáde to znamená odlupovanie.',1,3),
-- obkladač
('t_obk_hladidlo','obkladac','phone','hidden',
 'Aké zubové hladidlo beriete na dlažbu 60×60?',
 null,
 '10–12 mm, prípadne kombinovaná metóda buttering-floating pre plné lôžko.',
 'Odpoveď „šesťku ako vždy" — pri veľkom formáte vzniknú dutiny a dlažba praská.',3,1),
('t_obk_izolacia','obkladac','phone','legal',
 'Ako riešite hydroizoláciu v sprchovom kúte?',
 null,
 'Tesniaca stierka plus pásy do rohov a okolo prestupov, až potom obklad.',
 '„Stačí lepidlo" alebo „to robí niekto iný" — najdrahšia reklamácia v remesle.',3,2),
('t_obk_rohoz','obkladac','interview','knowledge',
 'Čo je oddeľovacia rohož a kedy ju použijete?',
 null,
 'Rohož medzi podkladom a dlažbou, ktorá zachytí pohyb podkladu — napríklad na poter s podlahovým kúrením.',
 'Nikdy o nej nepočul, hoci robil na novostavbách.',2,3),
-- murár
('t_mur_skara','murar','phone','hidden',
 'Akú hrúbku má škára pri murovaní na tenkovrstvovú maltu?',
 null,
 '1 až 3 mm.',
 'Odpovie „centimeter" — muroval len na klasickú maltu a v Nemecku sa spomalí.',3,1),
('t_mur_zaklad','murar','interview','knowledge',
 'Ako zakladáte prvý rad tvárnic?',
 null,
 'Vyrovnávacou maltou do nivelety podľa lasera, prvý rad rozhoduje o celej stene.',
 'Založí „od rohu podľa oka".',2,2),
-- betonár
('t_bet_krytie','betonar','phone','hidden',
 'Aké krytie výstuže dávate pri základovej doske a čím ho držíte?',
 null,
 'Rádovo 35–50 mm podľa prostredia, drží sa dištančnými podložkami.',
 'Nevie číslo ani nespomenie dištančníky — výstuž skončí na debnení a doska koroduje.',3,1),
('t_bet_vibro','betonar','interview','knowledge',
 'Ako dlho vibrujete na jednom mieste a podľa čoho poznáte, že stačí?',
 null,
 'Krátko, kým prestanú vystupovať bubliny a povrch sa zaleskne; ponorí sa aj do predchádzajúcej vrstvy.',
 'Vibruje „kým to ide" — rozmieša zmes a stratí pevnosť.',2,2),
-- tesár
('t_tes_debnenie','tesar','phone','hidden',
 'S akým systémovým debnením ste robili a ako sa volajú jeho nosníky?',
 null,
 'Doka alebo Peri, pomenuje nosník a priečnik.',
 'Systémové debnenie nevie pomenovať — v Nemecku sa iné nepoužíva.',3,1),
('t_tes_vyska','tesar','interview','legal',
 'Máte skúsenosť s prácou vo výške a s istením?',
 null,
 'Áno, vie, kedy sa istí a čím.',
 'Bagatelizuje istenie — okamžitý dôvod na vyradenie, riziko úrazu je naše.',2,2),
-- zvárač
('t_zvar_metoda','zvarac','phone','hidden',
 'Akú metódu a polohy máte na certifikáte? Povedzte čísla.',
 'Welches Verfahren und welche Positionen stehen auf Ihrem Zertifikat?',
 'Povie číslo metódy (135 MAG, 141 TIG, 111 MMA) a polohy PA, PB, PF.',
 'Čísla nevie — kto zváral v Nemecku, má ich na papieri a pozná ich naspamäť.',3,1),
('t_zvar_platnost','zvarac','phone','legal',
 'Dokedy máte certifikát platný a kto vám ho predlžuje?',
 null,
 'Vie dátum a má to vyriešené.',
 'Certifikát po platnosti alebo „niekde doma" — na stavbu ho nepustia.',3,2),
('t_zvar_wps','zvarac','interview','knowledge',
 'Čo je WPS a čo z neho čítate pred zváraním?',
 null,
 'Postup zvárania — materiál, prídavný materiál, prúd, polohy, predohrev.',
 'Nepozná — pracoval len na drobných zvaroch bez dokumentácie.',2,3),
-- zámočník
('t_zam_kotva','zamocnik','phone','hidden',
 'Ako kotvíte oceľovú konštrukciu do betónu a čo skontrolujete pred dotiahnutím?',
 null,
 'Chemickou alebo mechanickou kotvou podľa zaťaženia; vyčistí vývrt a dodrží hĺbku.',
 'Nespomenie vyčistenie vývrtu — kotva potom nedrží ani polovicu.',2,1),
-- elektrikár
('t_ele_prierez','elektrikar','phone','hidden',
 'Aký prierez vodiča dáte na istič 16 A pri bežnej zásuvkovej vetve?',
 null,
 '2,5 mm².',
 'Zaváha alebo povie 1,5 — pri zásuvkách je to chyba, ktorá horí.',3,1),
('t_ele_chranic','elektrikar','phone','knowledge',
 'Kde je povinný prúdový chránič a s akým vybavovacím prúdom?',
 null,
 'Na zásuvkových obvodoch a vo vlhkých priestoroch, 30 mA.',
 'Nevie hodnotu — základ, ktorý pozná každý elektrikár.',2,2),
('t_ele_hwo','elektrikar','phone','legal',
 'Viete, že na výkon elektrikárskeho remesla v Nemecku treba oznámenie na Handwerkskammer?',
 null,
 'Vie o tom, prípadne to už raz absolvoval.',
 'Tvrdí, že to netreba — nesmie nastúpiť, kým to nevybavíme za neho.',3,3),
-- montážnik a pomocník
('t_mon_naradie','montaznik','phone','knowledge',
 'S akým kotvením a tesnením ste robili pri osadzovaní okien?',
 null,
 'Vie pomenovať kotvy aj tesniace pásky a poradie vrstiev.',
 'Okná „len nosil" — nemá montážnu prax.',2,1),
('t_pom_dochadzka','pomocnik','phone','hidden',
 'Koľko stavieb ste vystriedali za posledný rok a prečo?',
 null,
 'Jedna či dve so zrozumiteľným dôvodom.',
 'Päť a viac — u pomocných pracovníkov je fluktuácia hlavné riziko a toto ju spoľahlivo predpovedá.',2,1)
on conflict (code) do update set
  trade_key = excluded.trade_key, phase = excluded.phase, kind = excluded.kind,
  question_sk = excluded.question_sk, question_de = excluded.question_de,
  good_answer = excluded.good_answer, red_flag_answer = excluded.red_flag_answer,
  weight = excluded.weight, sort_order = excluded.sort_order;

-- ============================================================================
-- SEED — ukážkový nábor, aby bolo hneď vidieť, ako to funguje
-- ============================================================================
-- Zámerne obsahuje aj kandidáta, ktorý skríningom neprešiel — nech je vidieť,
-- ako sa varovanie prejaví.
do $$
declare
  d date := current_date;
  plan_id uuid;
  c_ok uuid; c_bad uuid;
  q_rozstup uuid; q_doska uuid; q_polier uuid; q_a1 uuid; q_zaloha uuid; q_vykon uuid;
begin
  if exists (select 1 from danubra_recruitment_plans where title = 'Sadrokartón München — jarná várka') then
    return;
  end if;

  insert into danubra_recruitment_plans
    (title, trade_key, headcount, skill_level, legal_form, city, country,
     start_date, deadline, offer_rate, client_rate, budget,
     accommodation_provided, transport_provided, advance_possible,
     channels, ad_text, status, step, notes)
  values ('Sadrokartón München — jarná várka', 'trockenbau', 3, 'fachwerker', 'szco',
          'München', 'DE', d + 21, d + 14, 18, 28, 300, true, false, true,
          array['referral','meta_ads','facebook'],
          'Sadrokartonár — München, Nemecko' || chr(10) || chr(10) ||
          'Sadzba: 18 €/h (živnosť)' || chr(10) ||
          'Ubytovanie zabezpečíme a platíme my' || chr(10) ||
          'Výplata načas, každý mesiac — bez výnimky' || chr(10) ||
          'Papierovačky (A1, prihlášky) vybavíme za vás',
          'active', 5, 'Odberateľ Bauer Bau, nástup po veľkonočných sviatkoch.')
  returning id into plan_id;

  insert into danubra_candidates
    (full_name, phone, email, whatsapp, language, city, country, profession, skill_level,
     german_level, driving_licence, own_tools, legal_form, source, source_detail,
     status, expected_rate, available_from, received_at, first_contact_at,
     plan_id, last_site, last_foreman, reference_checked, notes)
  values
    ('Jozef Bartoš', '+421905112233', 'j.bartos@gmail.com', true, 'sk', 'Poprad', 'SK',
     'trockenbau', 'fachwerker', 'zaklad', true, true, 'szco', 'referral',
     'odporučil Peter Hudák', 'interview', 18, d + 21, now() - interval '3 days',
     now() - interval '3 days' + interval '7 minutes', plan_id,
     'Stuttgart, Wolff Ausbau', 'Polier Marek Sedlák, +421903222111', true,
     'Vie Q3, pýtal sa na ubytovanie skôr než na sadzbu — dobré znamenie.'),
    ('Rastislav Cíger', '+421918445566', null, true, 'sk', 'Michalovce', 'SK',
     'trockenbau', 'werker', 'ziadny', false, false, 'szco', 'facebook',
     'skupina Práca v Nemecku', 'contacted', 20, d + 7, now() - interval '2 days',
     now() - interval '2 days' + interval '4 hours', plan_id,
     null, null, false,
     'Pýtal si zálohu hneď v prvom hovore, prax vie opísať len všeobecne.');

  select id into c_ok from danubra_candidates where full_name = 'Jozef Bartoš' limit 1;
  select id into c_bad from danubra_candidates where full_name = 'Rastislav Cíger' limit 1;

  select id into q_rozstup from danubra_screening_questions where code = 't_sdk_rozstup';
  select id into q_doska   from danubra_screening_questions where code = 't_sdk_doska';
  select id into q_polier  from danubra_screening_questions where code = 'u_polier';
  select id into q_a1      from danubra_screening_questions where code = 'u_a1';
  select id into q_zaloha  from danubra_screening_questions where code = 'u_zaloha';
  select id into q_vykon   from danubra_screening_questions where code = 'u_vykon';

  -- kandidát, ktorý sedí
  insert into danubra_screening_answers (candidate_id, question_id, plan_id, answer_text, rating, flagged)
  values
    (c_ok, q_rozstup, plan_id, '625, pri dvojitom opláštení 417', 3, false),
    (c_ok, q_doska,   plan_id, 'zelená impregnovaná', 3, false),
    (c_ok, q_polier,  plan_id, 'Wolff Ausbau Stuttgart, polier Sedlák — dal číslo sám', 3, false),
    (c_ok, q_a1,      plan_id, 'vie, čo to je, minule mu ho vybavovala agentúra', 2, false),
    (c_ok, q_zaloha,  plan_id, 'nepotrebuje, vydrží do výplaty', 3, false),
    (c_ok, q_vykon,   plan_id, '30 m² vo dvojici', 3, false)
  on conflict do nothing;

  -- kandidát s varovaniami
  insert into danubra_screening_answers (candidate_id, question_id, plan_id, answer_text, rating, flagged)
  values
    (c_bad, q_rozstup, plan_id, '„tak nejak 60 centimetrov"', 0, false),
    (c_bad, q_doska,   plan_id, 'nevedel farbu', 1, false),
    (c_bad, q_polier,  plan_id, 'meno si nepamätá, firmu tiež nie', 0, true),
    (c_bad, q_a1,      plan_id, 'vie, že to treba', 2, false),
    (c_bad, q_zaloha,  plan_id, 'pýtal 500 € hneď pri prvom hovore', 0, true),
    (c_bad, q_vykon,   plan_id, '„aj 70 m² denne sám"', 0, false)
  on conflict do nothing;

  update danubra_candidates set
    screening_score = 94, screening_verdict = 'strong', screening_done_at = now() - interval '2 days'
  where id = c_ok;
  update danubra_candidates set
    screening_score = 28, screening_verdict = 'reject', screening_done_at = now() - interval '1 day'
  where id = c_bad;
end $$;

-- Diagnostika
select 'remeslá' t, count(*) from danubra_trades
union all select 'otázky', count(*) from danubra_screening_questions
union all select '  z toho overovacie', count(*) from danubra_screening_questions where kind = 'hidden'
union all select 'náborové plány', count(*) from danubra_recruitment_plans;
