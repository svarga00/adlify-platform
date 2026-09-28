-- ============================================================================
-- DANUBRA Hub — 011 — Hlbší odborný nábor podľa remesla
-- ============================================================================
-- Človek zavolá na inzerát a náborujeme ho hneď, v tom istom hovore. Preto:
--
--   1. viac odborných otázok na každé remeslo — jedna či dve nestačia na to,
--      aby sa dalo za pätnásť minút rozhodnúť;
--   2. `pitch` — čo mu o tej práci povedať. V živom hovore niet času
--      vymýšľať, ako prácu opísať, a zakaždým to vyjde inak.
--
-- Otázky sú vo fáze 'phone', lebo všetko sa deje v prvom telefonáte.
--
-- Idempotentné.
-- ============================================================================

alter table danubra_trades add column if not exists pitch text[];

comment on column danubra_trades.pitch is
  'Čo povedať kandidátovi o práci počas hovoru. Zobrazuje sa v sprievodcovi náborom.';

-- ── Čo mu o práci povedať ───────────────────────────────────────────────────
update danubra_trades set pitch = array[
  'Novostavby a rekonštrukcie — priečky, predsadené steny, podhľady.',
  'Robí sa v dvojiciach, materiál je na mieste, vozík aj náradie na stavbe.',
  'Preberá sa v kvalite Q2, na väčšine bytoviek Q3 v obytných miestnostiach.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'trockenbau';

update danubra_trades set pitch = array[
  'Nadväzuje sa priamo na sadrokartón — penetrácia, dve vrstvy, miestami tapeta.',
  'Väčšie plochy sa striekajú Airlessom, ak s ním vie robiť, ide to rýchlejšie.',
  'Fasády podľa sezóny, v zime prevažne interiéry.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'maliar';

update danubra_trades set pitch = array[
  'Kúpeľne a spoločné priestory v novostavbách, prevažne veľkoformát.',
  'Hydroizolácia mokrých zón je súčasť práce, nie extra.',
  'Nivelačný systém a rezačka sú na stavbe, vlastné náradie výhodou.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'obkladac';

update danubra_trades set pitch = array[
  'Murovanie presných tvárnic na tenkovrstvovú maltu, práca s laserom.',
  'Preklady, vence a jadrové omietky podľa fázy stavby.',
  'Miešačka aj materiál sú na mieste, žeriav podľa objektu.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'murar';

update danubra_trades set pitch = array[
  'Systémové debnenie Doka alebo Peri, viazanie výstuže podľa výkresu.',
  'Práca v partii a v tempe, betonáže sa plánujú dopredu.',
  'Ochranné pomôcky dodáme, viazacie kliešte nech má vlastné.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'betonar';

update danubra_trades set pitch = array[
  'Krovy, debnenie stropov a montované konštrukcie.',
  'Čítanie výkresu je podmienka, pracuje sa aj vo výške s istením.',
  'Píly a uťahováky sú na stavbe, ručné náradie vlastné.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'tesar';

update danubra_trades set pitch = array[
  'Oceľové konštrukcie a montážne zvary podľa WPS.',
  'Certifikát musí byť platný — kópiu potrebujeme pred nástupom.',
  'Zdroj aj plyny sú na mieste, kukla a brúska vlastné.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'zvarac';

update danubra_trades set pitch = array[
  'Zábradlia, schodiská a montáž oceľových dielcov.',
  'Cení sa presnosť osadenia, nie rýchlosť.',
  'Kotvenie do betónu je bežná súčasť práce.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'zamocnik';

update danubra_trades set pitch = array[
  'Rozvody v novostavbách, rozvádzače, meranie a odovzdanie.',
  'POZOR: pred nástupom vybavíme oznámenie remesla na Handwerkskammer — bez neho nesmie na stavbu.',
  'Merací prístroj dodáme, ručné náradie vlastné.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'elektrikar';

update danubra_trades set pitch = array[
  'Montáž okien, fasádnych a systémových konštrukcií.',
  'Zaúčanie na mieste, dôležitá je spoľahlivosť a manuálna zručnosť.',
  'Aku náradie výhodou, ostatné je na stavbe.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'montaznik';

update danubra_trades set pitch = array[
  'Pomocné práce pri remeselníkoch, presun materiálu, upratovanie staveniska.',
  'Netreba remeslo, treba prísť a vydržať — kto vydrží, ide neskôr na remeslo.',
  'Pracovnú obuv S3, prilbu a rukavice musí mať vlastné.',
  'Ubytovanie zabezpečíme a platíme, výplata načas každý mesiac.'
] where key = 'pomocnik';

-- ── Hlbšie odborné otázky ───────────────────────────────────────────────────
insert into danubra_screening_questions
  (code, trade_key, phase, kind, question_sk, good_answer, red_flag_answer, weight, sort_order)
values
-- sadrokartón
('t_sdk_zaves','trockenbau','phone','knowledge',
 'Ako zavesíte podhľad? Čo je noniový záves a načo je?',
 'Záves na CD profil, ktorým sa dolaďuje výška podhľadu do roviny.',
 'Nepozná ho — v Nemecku sa používa na každom podhľade.',2,6),
('t_sdk_vykon','trockenbau','phone','hidden',
 'Koľko m² priečky spravíte za deň vo dvojici aj s opláštením?',
 '25 až 35 m². Kto povie reálne číslo, robil to.',
 'Nad 50 m² — buď to nikdy nerobil, alebo to fláka.',3,7),
('t_sdk_oblúk','trockenbau','phone','knowledge',
 'Ako urobíte oblúk zo sadrokartónu?',
 'Navlhčená alebo narezaná doska a hustejšie profily v oblúku.',
 'Nikdy nerobil — na bytovkách to príde skôr či neskôr.',1,8),
('t_sdk_revizia','trockenbau','phone','knowledge',
 'Ako riešite revízne dvierka a prestupy v podhľade?',
 'Vie, že sa vyztužuje otvor a dvierka sa osadzujú do rámu.',
 'Nepozná — potom sa to rieši dodatočne a draho.',1,9),

-- maliar
('t_mal_pripravenost','maliar','phone','hidden',
 'Ako spoznáte, že sadrokartón ešte nie je pripravený na maľbu?',
 'Nedobrúsené škáry, presvitajúce hlavičky skrutiek, chýbajúca penetrácia.',
 '„Nepozerám, ja len maľujem" — potom sa reklamuje jeho práca.',3,4),
('t_mal_vykon','maliar','phone','hidden',
 'Koľko m² steny vymaľujete valčekom za deň v dvoch vrstvách?',
 '150 až 250 m².',
 'Nadsadené číslo alebo nevie odhadnúť.',2,5),
('t_mal_sklotextil','maliar','phone','knowledge',
 'Robili ste sklotextilnú tapetu? Čím sa lepí?',
 'Vie, že sa lepí špeciálnym lepidlom na stenu, nie na tapetu.',
 'Nepozná — v Nemecku je to na chodbách bytoviek bežné.',1,6),

-- obkladač
('t_obk_spara','obkladac','phone','knowledge',
 'Akú širokú škáru necháte pri veľkoformáte a prečo nie užšiu?',
 'Dva až tri milimetre kvôli tolerancii formátu a rozťažnosti.',
 'Chce lepiť „na tesno" — pri veľkom formáte to popraská.',2,4),
('t_obk_vykon','obkladac','phone','hidden',
 'Koľko m² dlažby položíte za deň?',
 '15 až 25 m² pri bežnom formáte, pri veľkoformáte menej.',
 'Nadsadené číslo — pri obkladoch to znamená odfláknuté lôžko.',2,5),
('t_obk_zasuvka','obkladac','phone','knowledge',
 'Ako urobíte otvor na zásuvku v obklade?',
 'Korunkou alebo diamantovým rezom, s dorezaním nad zásuvkou.',
 'Nevie povedať — potom to vylomí kladivom.',1,6),

-- murár
('t_mur_vykon','murar','phone','hidden',
 'Koľko m² muriva postavíte za deň?',
 'Šesť až dvanásť m² podľa hrúbky a otvorov.',
 'Nadsadené číslo alebo úplne mimo.',2,3),
('t_mur_omietka','murar','phone','knowledge',
 'Robili ste strojovú omietku? Na akom stroji?',
 'Pomenuje stroj, napríklad PFT G4, a vie o príprave podkladu.',
 'Strojovú omietku nikdy nerobil — v Nemecku sa ručne takmer neomieta.',1,4),
('t_mur_preklad','murar','phone','knowledge',
 'Ako osadíte preklad nad otvorom a na čo si dáte pozor?',
 'Dodrží uloženie na oboch stranách a smer prekladu podľa značenia.',
 'Nevie o minimálnom uložení — to je statická chyba.',2,5),

-- betonár
('t_bet_debnenie','betonar','phone','knowledge',
 'Čím sťahujete debnenie proti tlaku betónu?',
 'Spínacími tyčami s kotvami, rozostup podľa výšky liatia.',
 'Nevie — debnenie sa pri betonáži roztvorí.',2,3),
('t_bet_vykon','betonar','phone','hidden',
 'Koľko kilogramov výstuže naviažete za deň?',
 'Štyristo až osemsto kilogramov podľa zložitosti.',
 'Nadsadené číslo alebo nevie, že sa to takto meria.',2,4),
('t_bet_zima','betonar','phone','knowledge',
 'Čo sa robí s betónom, keď mrzne?',
 'Prísady, ohrev, prikrytie a ochrana povrchu, kým nenaberie pevnosť.',
 'Nevie — v nemeckej zime sa betónuje bežne.',1,5),

-- tesár
('t_tes_uhol','tesar','phone','knowledge',
 'Ako prenesiete uhol na krokvu a čím ho meriate?',
 'Uholníkom alebo šablónou podľa sklonu, prípadne digitálnym uhlomerom.',
 'Nevie — bez toho nespraví ani jednu krokvu.',2,3),
('t_tes_vykon','tesar','phone','hidden',
 'Koľko m² debnenia stropu spravíte za deň?',
 'Dvadsaťpäť až štyridsať m² na osobu.',
 'Nadsadené číslo.',2,4),

-- zvárač
('t_zvar_prud','zvarac','phone','hidden',
 'Aký prúd a aký drôt dáte na päťmilimetrový plech pri MAG?',
 'Približne 190–220 A, drôt 1,0 alebo 1,2 mm.',
 'Nevie čísla — kto zváral, ich má v ruke.',3,4),
('t_zvar_deformacia','zvarac','phone','knowledge',
 'Ako zabránite deformácii pri dlhom zvare?',
 'Stehovanie, prerušovaný zvar, striedanie strán, prípadne prípravok.',
 'Nerieši to — dielec sa vytiahne a ide do šrotu.',2,5),

-- zámočník
('t_zam_lic','zamocnik','phone','knowledge',
 'Ako lícujete konštrukciu? Čím kontrolujete uhlopriečku?',
 'Meraním oboch uhlopriečok pásmom, doladenie pred zvarením.',
 'Nemeria uhlopriečku — konštrukcia vyjde skosená.',2,2),
('t_zam_zinok','zamocnik','phone','knowledge',
 'Robili ste dielce na žiarové zinkovanie? Čo treba pripraviť?',
 'Odvzdušňovacie a odtokové otvory, čistý povrch bez farby.',
 'Nepozná — zinkovňa dielec vráti.',1,3),

-- elektrikár
('t_ele_rozvadzac','elektrikar','phone','knowledge',
 'Čo všetko patrí do bytového rozvádzača?',
 'Hlavný istič, prúdový chránič, ističe okruhov, prepäťová ochrana, PE a N lišty.',
 'Vymenuje len ističe — na nemeckú novostavbu to nestačí.',2,4),
('t_ele_meranie','elektrikar','phone','knowledge',
 'Čo meriate pri odovzdaní inštalácie?',
 'Izolačný odpor, impedanciu slučky, funkciu chrániča a spojitosť ochranného vodiča.',
 'Nemeria — bez protokolu sa dielo neodovzdá.',2,5),

-- montážnik
('t_mon_vyska','montaznik','phone','legal',
 'Robili ste z plošiny alebo z lešenia? Máte na to preukaz?',
 'Má skúsenosť a vie, čo potrebuje doložiť.',
 'Prácu vo výške bagatelizuje.',2,2),

-- pomocník
('t_pom_fyzicka','pomocnik','phone','knowledge',
 'Robili ste s búracím kladivom? Koľko vydržíte v tempe?',
 'Konkrétna odpoveď o predchádzajúcej práci.',
 'Vyhýbavá odpoveď — po dvoch dňoch skončí.',1,2),
('t_pom_vystroj','pomocnik','phone','logistics',
 'Máte pracovnú obuv S3, prilbu a rukavice, alebo to treba zabezpečiť?',
 'Má vlastné, prípadne si ich kúpi pred nástupom.',
 'Čaká, že mu všetko kúpime — dohodni sa hneď, ako to bude.',1,3)
on conflict (code) do update set
  trade_key = excluded.trade_key, phase = excluded.phase, kind = excluded.kind,
  question_sk = excluded.question_sk,
  good_answer = excluded.good_answer, red_flag_answer = excluded.red_flag_answer,
  weight = excluded.weight, sort_order = excluded.sort_order;

-- Diagnostika
select t.name_sk, count(q.id) as otazok
from danubra_trades t
left join danubra_screening_questions q on q.trade_key = t.key and q.active
group by t.name_sk, t.sort_order order by t.sort_order;
