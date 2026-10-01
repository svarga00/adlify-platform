-- ============================================================================
-- DANUBRA — remeslá do hĺbky: príručka, z ktorej sa dá zaučiť ktokoľvek
-- ============================================================================
-- Príručka remesiel existuje od F9 a je na nej vidieť, kedy som ju písal
-- s chuťou a kedy mi došiel dych: sadrokartonár má sedem krokov práce, osem
-- materiálov a deväť otázok; montážnik mal dve otázky a pomocník mal
-- v materiáloch napísané „—".
--
-- Lenže práve toto je obrazovka, ktorá rozhoduje o tom, či môže nábor robiť
-- aj človek, ktorý nikdy nebol na nemeckej stavbe. Náborár sa nemusí vyznať
-- v sadrokartóne — musí vedieť **položiť otázku, ktorej sa podvodník vyhne**,
-- a rozoznať odpoveď majstra od odpovede toho, kto „to už raz robil".
--
-- Preto sa dopĺňa to, čo tam chýbalo najviac:
--
--   • **nemecké slovíčka.** Kandidát aj Polier hovoria o Ständerwerk,
--     Beplankung, Verspachtelung. Kto tie slová nepočul, nerozumie ani
--     kandidátovi, ani sťažnosti zo stavby.
--   • **deň na stavbe.** Aby si človek vedel predstaviť, o čom hovorí.
--   • **normy a stupne kvality**, podľa ktorých sa práca preberá. To je
--     zároveň najlepšia overovacia otázka: kto robil, pozná ich.
--   • **prečo je sadzba taká, aká je** — aby náborár vedel cenu obhájiť,
--     nie ju len prečítať.
--
-- Čísla sadzieb sa **nemenia**. Tie sú obchodné rozhodnutie, nie znalosť.
--
-- Idempotentné. Nič sa nemaže ani nepremenúva.
-- ============================================================================

-- ── Čo remeslu chýbalo ──────────────────────────────────────────────────────
alter table danubra_trades add column if not exists vocab jsonb default '[]'::jsonb;
alter table danubra_trades add column if not exists day_in_life text;
alter table danubra_trades add column if not exists standards text[];
alter table danubra_trades add column if not exists pay_note text;

comment on column danubra_trades.vocab is
  'Nemecké slovíčka, ktoré na stavbe zaznejú, so slovenským významom: '
  '[{"de":"Ständerwerk","sk":"nosný rošt","note":"…"}]. Náborár ich potrebuje, '
  'aby rozumel kandidátovi aj sťažnosti z Nemecka.';
comment on column danubra_trades.standards is
  'Normy a stupne kvality, podľa ktorých sa práca preberá. Zároveň najlepšia '
  'overovacia otázka — kto remeslo robil, pozná ich.';
comment on column danubra_trades.day_in_life is
  'Ako vyzerá deň na stavbe. Aby si vedel predstaviť, o čom s kandidátom '
  'hovoríš, aj keď si tam nikdy nebol.';
comment on column danubra_trades.pay_note is
  'Prečo je sadzba taká, aká je. Náborár má cenu obhájiť, nie prečítať.';

-- ── Spoločné: ako sa na nemeckej stavbe pracuje ─────────────────────────────
-- Platí pre každé remeslo, tak nech je to na jednom mieste a nie jedenásťkrát
-- opísané. Obrazovka to ukáže pri každom remesle.
create table if not exists danubra_trade_basics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  body text not null,
  sort_order int default 0,
  active bool default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table danubra_trade_basics enable row level security;
drop policy if exists danubra_auth_all on danubra_trade_basics;
create policy danubra_auth_all on danubra_trade_basics
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

comment on table danubra_trade_basics is
  'Čo platí na nemeckej stavbe bez ohľadu na remeslo. Ukazuje sa pri každom '
  'remesle, aby sa to nemuselo písať jedenásťkrát.';

insert into danubra_trade_basics (code, title, body, sort_order) values
('polier', 'Kto je Polier',
 'Polier je majster stavby — ten, kto na mieste rozdeľuje prácu a preberá ju. Nie je to náš človek, je to človek odberateľa. Keď je s partiou spokojný, zákazka sa predĺži; keď nie je, skončí aj uprostred mesiaca. Pri telefonáte sa oplatí povedať, že na stavbe sa hlási u Poliera a že pokyny k dielu dáva náš predák — to je rozdiel medzi subdodávkou a prenájmom ľudí.',
 1),
('aufmass', 'Ako sa práca preberá',
 'Práca sa nepreberá „na oko". Buď je podpísaný Stundennachweis (výkaz hodín), alebo spoločné Aufmaß — zmeranie toho, čo je hotové. Kým to nie je podpísané, nie je to vyfakturované. Toto je dôvod, prečo sa pri každom nasadení pýtame, kto bude predák: niekto to na stavbe musí podpisovať.',
 2),
('zeit', 'Pracovný čas a čo je bežné',
 'Na nemeckých stavbách sa začína skoro — bežne o 7:00, v lete aj o 6:00 — a končí sa popoludní. Deň má bežne 8–10 hodín, v piatok býva kratší. Soboty sa občas robia, ale nie sú samozrejmé. Kto na telefóne tvrdí, že chce robiť „dvanástky každý deň aj v nedeľu", buď nebol na nemeckej stavbe, alebo počíta s tým, že mu to niekto sľúbi a potom to nebude pravda.',
 3),
('sicherheit', 'Bezpečnosť, ktorá sa naozaj kontroluje',
 'Prilba, pracovná obuv s oceľovou špičkou a reflexná vesta sú na väčšine stavieb podmienkou vstupu — bez nich človeka vrátia od brány. Pri práci vo výške sa kontroluje postroj a lešenie s platnou značkou. Toto sa oplatí povedať na telefóne: kto príde bez obuvi, stratí prvý deň.',
 4),
('zoll', 'Kontrola, ktorá môže prísť kedykoľvek',
 'Na stavbu môže prísť Zoll (FKS — Finanzkontrolle Schwarzarbeit). Pýtajú si doklad totožnosti, A1 a doklad o živnosti. Kto ich nemá pri sebe, je problém nielen pre seba, ale pre celú zákazku. Preto appka bez platných dokladov nasadenie nepustí a výnimku môže dať len administrátor.',
 5),
('mindestlohn', 'Mzdové skupiny a minimálna mzda',
 'V stavebníctve platí Bau-Mindestlohn podľa AEntG a je vyšší než bežná minimálna mzda. Rozlišujú sa mzdové skupiny: LG1 pre pomocné práce, LG2 pre odborné. Sadzba, ktorú človeku ponúkame, nesmie ísť pod tú hranicu — appka to stráži pri ponuke aj pri nasadení. Pri rozhovore o peniazoch to nie je detail: je to hranica, pod ktorú sa nedá ísť ani dohodou.',
 6)
on conflict (code) do update set
  title = excluded.title, body = excluded.body,
  sort_order = excluded.sort_order, updated_at = now();

-- ============================================================================
-- Remeslá
-- ============================================================================
-- Každé dostane slovíčka, normy, deň na stavbe a vetu o peniazoch. Tým
-- tenkým sa dopĺňa aj to, čo malo byť od začiatku: čo robí, s čím, čím
-- a podľa čoho spoznám, že to nerobil.

-- ── Sadrokartonár ───────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Ständerwerk","sk":"nosný rošt z profilov","note":"Kostra priečky. Kto hovorí len „rám", asi to nerobil."},
    {"de":"Beplankung","sk":"opláštenie doskami","note":"einlagig = jednoduché, doppelt = dvojité."},
    {"de":"Verspachtelung","sk":"špárovanie a tmelenie","note":"Tu sa pozná majster — podľa stupňa Q."},
    {"de":"Abhangdecke","sk":"zavesený podhľad","note":"Profily CD/UD na závesoch."},
    {"de":"Vorsatzschale","sk":"predsadená stena","note":"Pred murivom, kvôli rozvodom alebo akustike."},
    {"de":"Schattenfuge","sk":"tieňová škára","note":"Detail napojenia na strop alebo stenu."},
    {"de":"Rigips","sk":"sadrokartón","note":"Značka, ktorá zľudovela."},
    {"de":"Dämmung","sk":"izolácia","note":"Minerálna vlna do priečky."}
  ]'::jsonb,
  standards = array[
    'Q1 — základné zatmelenie škár; pod obklad alebo tam, kde povrch nevidieť',
    'Q2 — bežný štandard pod maľbu a tapety; drvivá väčšina stien',
    'Q3 — jemnejší, pod lesklé farby a šikmé svetlo',
    'Q4 — celoplošné pretmelenie; drahé a zriedkavé',
    'DIN 18181 a 18182 — upevnenie dosiek a profilov',
    'Rozteč stojok 62,5 cm; pri vyššom zaťažení 41,7 cm'],
  day_in_life = 'Ráno sa vymeria a vyznačí čiara na podlahe, založia sa UW profily s napojovacou páskou, nastavia CW stojky. Doobeda sa oplášťuje jedna strana, popoludní sa vkladá izolácia a zatvára druhá. Špárovanie príde na rad, keď je konštrukcia hotová — a vtedy sa ukáže, či bola rovná. Materiál nosí pomocník; sadrokartonár, ktorý celý deň nosí dosky, je drahý nosič.',
  pay_note = 'Najžiadanejšie remeslo, teda aj najtvrdšia konkurencia o ľudí. Kto vie Q3 a vie to aj ukázať na fotke, dostane hornú hranicu aj inde — pri ňom sa neoplatí zjednávať o pätnásť centov.'
where key = 'trockenbau';

-- ── Maliar ──────────────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Grundierung","sk":"penetrácia","note":"Bez nej farba saje nerovnomerne."},
    {"de":"Dispersionsfarbe","sk":"disperzná farba","note":"Bežná vnútorná maľba."},
    {"de":"Abkleben","sk":"zalepovanie páskou","note":"Čas, ktorý sa oplatí — rovná hrana je polovica roboty."},
    {"de":"Vliestapete","sk":"vliesová tapeta","note":"Lepí sa na stenu, nie na tapetu."},
    {"de":"Spachteln","sk":"stierkovanie","note":"Vyrovnanie podkladu pred maľbou."},
    {"de":"Deckkraft","sk":"krycia schopnosť","note":"Prečo niekde stačí jedna vrstva a inde nie."},
    {"de":"Gerüst","sk":"lešenie","note":"Pri fasáde; bez platnej značky sa naň nesmie."}
  ]'::jsonb,
  standards = array[
    'Nátery podľa VOB/C — DIN 18363 (maliarske a lakovnícke práce)',
    'Podklad musí byť suchý, pevný a odmastený — inak reklamácia ide na nás',
    'Dve vrstvy sú štandard; jedna len pri obnove rovnakého odtieňa'],
  work_scope = array[
    'príprava a penetrácia podkladu',
    'stierkovanie a brúsenie',
    'maľba valčekom a štetcom, veľké plochy striekaním',
    'lakovanie zárubní a kovových prvkov',
    'tapetovanie vliesových tapiet',
    'fasádne nátery z lešenia'],
  tools = array[
    'valčeky, štetce, teleskopická tyč',
    'stierky a brúsna žirafa',
    'maliarska páska a krycie fólie',
    'striekacie zariadenie (airless) — kto ho má, je rýchlejší',
    'vlastné lešenárske koliesko alebo štafle'],
  red_flags = array[
    'nevie, prečo sa penetruje',
    'tvrdí, že na nový sadrokartón stačí jedna vrstva',
    'nepozná rozdiel medzi disperznou a latexovou farbou',
    'nevie povedať, koľko m² za deň natrie'],
  day_in_life = 'Prvý deň býva príprava: zakryť podlahy, zalepiť zárubne, prebrúsiť a napenetrovať. Maľuje sa až potom, väčšinou v dvoch vrstvách s odstupom. Na veľkých plochách sa strieka, v bytoch valčekuje. Večer sa umýva náradie — kto to nerobí, kazí si valčeky a vidieť to na ďalšej stene.',
  pay_note = 'Maliari sú dostupnejší než sadrokartonári, ale rozdiel medzi dobrým a rýchlym je veľký. Dobrý maliar ušetrí na reklamáciách viac, než stojí rozdiel v sadzbe.'
where key = 'maliar';

-- ── Obkladač ────────────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Fliesen","sk":"obklad a dlažba","note":"Fliesenleger = obkladač."},
    {"de":"Fugenbreite","sk":"šírka škáry","note":"Pýta sa na nej majster aj Polier."},
    {"de":"Abdichtung","sk":"hydroizolácia pod obklad","note":"V sprche povinná — a najčastejšia reklamácia."},
    {"de":"Silikonfuge","sk":"silikónová škára","note":"Rohy a napojenia, nikdy nie na tvrdo."},
    {"de":"Großformat","sk":"veľkoformátová dlažba","note":"Iná technika aj iné náradie."},
    {"de":"Nivelliersystem","sk":"nivelačné klipsy","note":"Kto ich používa, má rovnú plochu."},
    {"de":"Sockel","sk":"soklík","note":"Detail, na ktorom sa pozná poriadok."}
  ]'::jsonb,
  standards = array[
    'DIN 18534 — hydroizolácia vnútorných priestorov (sprchy, kúpeľne)',
    'Rovinnosť podľa DIN 18202 — merá sa 2 m latou',
    'Škáry: šírka podľa formátu, pri veľkoformáte minimálne 3 mm'],
  day_in_life = 'Začína sa meraním a rozkreslením — kde vyjde celý kus a kde rez, aby rez nebol na pohľadovom mieste. Potom hydroizolácia, ktorá musí preschnúť. Lepí sa po častiach, rezanie na mokrej píle. Škáruje sa až na druhý deň. Kto lepí a škáruje v ten istý deň, podlieza technologickú prestávku.',
  pay_note = 'Obkladač sa platí za presnosť, nie za rýchlosť. Zle urobená hydroizolácia v sprche je reklamácia za tisíce — pri tomto remesle sa overovacia otázka na Abdichtung oplatí vždy.'
where key = 'obkladac';

-- ── Murár ───────────────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Mauerwerk","sk":"murivo","note":"Maurer = murár."},
    {"de":"Dünnbettmörtel","sk":"tenkovrstvová malta","note":"Pri presných tvárniciach."},
    {"de":"Sturz","sk":"preklad","note":"Nad otvorom; osadenie je typická otázka."},
    {"de":"Lot","sk":"olovnica / zvislosť","note":"„im Lot" = zvislé."},
    {"de":"Verband","sk":"väzba muriva","note":"Previazanie — podľa toho sa pozná murár."},
    {"de":"Ringanker","sk":"stužujúci veniec","note":"Pri vyšších stenách."},
    {"de":"Kimmschicht","sk":"zakladacia vrstva","note":"Prvý rad, ktorý rozhoduje o všetkom ďalšom."}
  ]'::jsonb,
  standards = array[
    'DIN EN 1996 (Eurocode 6) — navrhovanie muriva',
    'Rovinnosť a zvislosť podľa DIN 18202',
    'Prvý rad do malty a do vodováhy — na ňom stojí celá stena'],
  day_in_life = 'Ráno sa zakladá prvý rad do malty a vyrovnáva sa do milimetra, lebo každý ďalší rad chybu zväčší. Potom sa murí podľa šnúry, po radoch, s kontrolou zvislosti. Preklady sa osádzajú vo dvojici. Materiál pripravuje pomocník — murár, ktorý si sám mieša maltu, stojí zbytočne veľa.',
  pay_note = 'Murárov je relatívne dosť, ale rozdiel medzi tým, kto vie založiť, a tým, kto len ukladá tvárnice, je vidieť na prvej stene. Zakladacia vrstva je najlacnejšia overovacia otázka.'
where key = 'murar';

-- ── Betonár a železiar ──────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Schalung","sk":"debnenie","note":"Systémové — Doka, PERI."},
    {"de":"Bewehrung","sk":"výstuž","note":"Eisenflechter = železiar, viaže výstuž."},
    {"de":"Betondeckung","sk":"krytie výstuže","note":"Distančníky; bez nich hrdzavie."},
    {"de":"Rüttler","sk":"vibrátor","note":"Zhutnenie betónu."},
    {"de":"Abziehen","sk":"stiahnutie plochy","note":"Zarovnanie čerstvého betónu."},
    {"de":"Nachbehandlung","sk":"ošetrovanie betónu","note":"Kropenie a prikrytie; zanedbáva sa najčastejšie."},
    {"de":"Ausschalen","sk":"oddebnenie","note":"Až po dosiahnutí pevnosti."}
  ]'::jsonb,
  standards = array[
    'DIN EN 206 a DIN 1045 — betón a jeho spracovanie',
    'Krytie výstuže podľa projektu — kontroluje sa pred betonážou',
    'Debnenie sa preberá pred liatím; po liatí je neskoro'],
  day_in_life = 'Pred betonážou sa zostaví a vyrovná debnenie, uloží a zviaže výstuž a osadia distančníky. Betonáž je krátka a hektická — čerpadlo stojí peniaze, tak sa pracuje rýchlo, ukladá po vrstvách a hutní vibrátorom. Potom sa plocha stiahne a ošetrí. Oddebňuje sa až po dosiahnutí pevnosti, nie keď je čas.',
  pay_note = 'Tvrdá a fyzicky náročná práca, ľudí na ňu ubúda. Kto vie viazať výstuž podľa výkresu, nie podľa oka, má cenu hornej hranice.'
where key = 'betonar';

-- ── Tesár ───────────────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Dachstuhl","sk":"krov","note":"Zimmerer = tesár."},
    {"de":"Sparren","sk":"krokva","note":"Základný prvok krovu."},
    {"de":"Pfette","sk":"väznica","note":"Vodorovný nosník pod krokvami."},
    {"de":"Schalung","sk":"debnenie / záklop","note":"Pri streche aj pri betóne."},
    {"de":"Konterlattung","sk":"kontralaty","note":"Vetracia medzera pod krytinou."},
    {"de":"Absturzsicherung","sk":"zabezpečenie proti pádu","note":"Na streche sa kontroluje vždy."},
    {"de":"Holzverbindung","sk":"tesársky spoj","note":"Plátovanie, čapovanie — otázka na odbornosť."}
  ]'::jsonb,
  standards = array[
    'DIN 1052 / Eurocode 5 — drevené konštrukcie',
    'Práca vo výške: postroj a istenie sú podmienka, nie odporúčanie',
    'Vlhkosť reziva — zabudovať mokré drevo znamená reklamáciu'],
  day_in_life = 'Ráno sa preberá materiál a kontroluje, či sedia rozmery z výkresu. Reže sa dole, montuje hore — a hore sa pracuje v postroji. Krov sa skladá po častiach a priebežne sa kontroluje uhlopriečka. Popoludní sa dební a montujú kontralaty, aby bola strecha do večera zakrytá, keď hrozí dážď.',
  pay_note = 'Tesárov je málo a práca vo výške odrádza. Kto má platný doklad o práci vo výške a vlastný postroj, nastúpi hneď — toto je remeslo, kde sa neoplatí čakať na lepšiu ponuku.'
where key = 'tesar';

-- ── Zvárač ──────────────────────────────────────────────────────────────────
update danubra_trades set
  vocab = '[
    {"de":"Schweißnaht","sk":"zvar","note":"Kehlnaht = kútový, Stumpfnaht = tupý."},
    {"de":"WIG / MAG","sk":"TIG / MIG-MAG","note":"Metódy — 141 a 135 podľa normy."},
    {"de":"Schweißerprüfung","sk":"zváračská skúška","note":"Doklad podľa EN ISO 9606-1, má platnosť."},
    {"de":"Vorwärmen","sk":"predohrev","note":"Pri hrubších materiáloch."},
    {"de":"Schweißnahtprüfung","sk":"skúška zvaru","note":"Vizuálna, penetračná, röntgen."},
    {"de":"Schweißerlaubnis","sk":"povolenie na zváranie","note":"Na stavbe pri práci s ohňom."}
  ]'::jsonb,
  standards = array[
    'EN ISO 9606-1 — skúška zváračov, ocele; doklad má obmedzenú platnosť',
    'EN 1090 — vykonávanie oceľových konštrukcií',
    'Metódy sa značia číslom: 111 elektróda, 135 MAG, 141 TIG'],
  day_in_life = 'Pred zváraním sa pripraví a očistí materiál, nastehuje a skontroluje geometria. Potom sa varí podľa predpísanej metódy a polohy. Pri práci s ohňom na stavbe treba povolenie a hasiaci prístroj v dosahu. Zvary sa kontrolujú — vizuálne vždy, pri nosných konštrukciách aj prístrojom.',
  pay_note = 'Jediné remeslo v ponuke, kde doklad rozhoduje o cene priamo: platná skúška podľa EN ISO 9606-1 na správnu metódu a polohu znamená hornú hranicu. Bez nej je to zámočník, nie zvárač — a tak sa to má aj zaplatiť.'
where key = 'zvarac';

-- ── Zámočník ────────────────────────────────────────────────────────────────
update danubra_trades set
  summary = 'Kov na stavbe: zábradlia, schodiská, prístrešky, oceľové konštrukcie a kotvenie. Často sa prekrýva so zváračom — rozdiel je v tom, že zámočník aj meria, delí a montuje, nielen varí. Na stavbe sa cení ten, kto vie prísť, zamerať na mieste a prísť s hotovým dielom, ktoré sadne.',
  work_scope = array[
    'montáž zábradlí a schodísk',
    'oceľové konštrukcie a prístrešky',
    'kotvenie do betónu a muriva',
    'delenie, vŕtanie a brúsenie materiálu',
    'zameranie na stavbe a výroba podľa miery',
    'drobné opravy a úpravy na mieste'],
  materials = array[
    'profily — jekl, L, U, I',
    'plech čierny a pozinkovaný',
    'nerez pri zábradliach',
    'chemické a mechanické kotvy',
    'spojovací materiál'],
  tools = array[
    'uhlová brúska a rezačka',
    'vŕtačka s príklepom',
    'zvárací stroj (ak varí)',
    'meradlá, uholník, vodováha',
    'postroj pri montáži vo výške'],
  certificates = array[
    'zváračský preukaz, ak varí nosné spoje',
    'doklad o práci vo výške pri montáži zábradlí'],
  red_flags = array[
    'nevie, aké kotvy sa používajú do betónu a aké do pórobetónu',
    'nepozná rozdiel medzi chemickou a mechanickou kotvou',
    'tvrdí, že zábradlie sa dá osadiť „na hmoždinky"',
    'nevie povedať, čo meria pred výrobou'],
  vocab = '[
    {"de":"Schlosser","sk":"zámočník","note":"Metallbauer je to isté, modernejšie."},
    {"de":"Geländer","sk":"zábradlie","note":"Najčastejšia práca."},
    {"de":"Dübel","sk":"kotva, hmoždinka","note":"Schwerlastdübel = ťažká kotva."},
    {"de":"Verbundanker","sk":"chemická kotva","note":"Do betónu pri väčšom zaťažení."},
    {"de":"Aufmaß","sk":"zameranie","note":"Meria sa na mieste, nie podľa výkresu."},
    {"de":"Montage","sk":"montáž","note":"Osadenie hotového dielu."}
  ]'::jsonb,
  standards = array[
    'EN 1090 — vykonávanie oceľových konštrukcií',
    'Zábradlia: výška a zaťaženie podľa DIN 18065 a projektu',
    'Kotvy sa volia podľa podkladu — a to je overovacia otázka'],
  daily_output = 'Pri zábradliach 6–12 bm za deň vo dvojici vrátane kotvenia. Pri konštrukciách sa hodnotí podľa dielov, nie metrov.',
  day_in_life = 'Buď sa ide zamerať a diel sa vyrába v dielni, alebo sa montuje hotové. Montáž je meranie, vŕtanie, kotvenie a vyrovnanie — a potom dotiahnutie, keď sedí všetko naraz. Vo výške sa pracuje v postroji. Zámočník, ktorý nemá vlastnú brúsku a vŕtačku, stojí na stavbe a čaká.',
  pay_note = 'Cena závisí od toho, či vie aj variť. Zámočník so zváračským preukazom je dvaja ľudia v jednom a tak sa aj počíta.'
where key = 'zamocnik';

-- ── Elektrikár ──────────────────────────────────────────────────────────────
update danubra_trades set
  work_scope = array[
    'rozvody v novostavbách aj rekonštrukciách',
    'osadzovanie rozvádzačov a zapájanie okruhov',
    'zásuvkové a svetelné okruhy',
    'ukladanie chráničiek a drážkovanie',
    'ťahanie káblov podľa projektu',
    'meranie, revízia a odovzdanie'],
  tools = array[
    'sada elektrikárskeho náradia a izolované skrutkovače',
    'merací prístroj (izolačný odpor, slučka)',
    'vŕtačka, drážkovačka a vysávač',
    'sťahovacie perá a protahovací drôt',
    'skúšačka a detektor vedenia'],
  red_flags = array[
    'nevie priradiť prierez vodiča k isticu',
    'nepozná prúdový chránič 30 mA a kde je povinný',
    'tvrdí, že oznámenie remesla netreba',
    'nevie, čo meria pred odovzdaním',
    'nerozlišuje NYM a NYY'],
  vocab = '[
    {"de":"Leitungsschutzschalter","sk":"istič","note":"LS-Schalter; B16 je bežný."},
    {"de":"FI-Schalter / RCD","sk":"prúdový chránič","note":"30 mA tam, kde je voda."},
    {"de":"Verteiler","sk":"rozvádzač","note":"Unterverteilung = podružný."},
    {"de":"Leerrohr","sk":"chránička","note":"Aby sa dalo kábel neskôr vymeniť."},
    {"de":"Steckdose","sk":"zásuvka","note":"Schalter = vypínač."},
    {"de":"Schlitzen","sk":"drážkovanie","note":"Do muriva pre rozvody."},
    {"de":"Abnahme","sk":"odovzdanie a revízia","note":"Bez merania to nie je hotové."}
  ]'::jsonb,
  standards = array[
    'VDE 0100 — elektrické inštalácie nízkeho napätia',
    'Prierez vodiča musí sedieť s istiacim prvkom — základná overovacia otázka',
    'RCD 30 mA v mokrých priestoroch a na zásuvkových okruhoch',
    '§9 HwO — oznámenie na Handwerkskammer pred začiatkom prác'],
  daily_output = 'V novostavbe bežne jeden byt (hrubá inštalácia) za 2–3 dni vo dvojici. Hodnotí sa počet vývodov a bezchybnosť merania.',
  day_in_life = 'Hrubá inštalácia je drážkovanie, ukladanie chráničiek a krabíc a ťahanie káblov podľa projektu. Jemná príde po omietkach a maľbách: osadzujú sa zásuvky, vypínače a svietidlá, zapája sa rozvádzač. Na konci sa meria a vystavuje protokol — bez neho sa dielo nepreberá.',
  pay_note = 'Najdrahšie remeslo v ponuke a zároveň jediné regulované: bez oznámenia §9 HwO sa človek nesmie postaviť na stavbu, nech je akokoľvek dobrý. Pri ňom sa teda neplatí len za ruky, ale aj za to, že papiere sedia.'
where key = 'elektrikar';

-- ── Montážnik ───────────────────────────────────────────────────────────────
update danubra_trades set
  summary = 'Montuje hotové diely podľa návodu a výkresu: okná, dvere, fasádne systémy, priečkové systémy, nábytok a technológie. Nepotrebuje remeslo s papierom, potrebuje presnosť, čítanie výkresu a to, aby po ňom nebolo treba nič opravovať.',
  work_scope = array[
    'montáž okien a dverí vrátane kotvenia a tesnenia',
    'fasádne a obkladové systémy',
    'montáž podľa výkresu a návodu výrobcu',
    'kotvenie do rôznych podkladov',
    'drobné úpravy dielov na mieste'],
  materials = array[
    'kotviace prvky a systémové skrutky',
    'tesniace a kompresné pásky',
    'PU pena a silikón',
    'systémové profily a lišty'],
  tools = array[
    'aku vŕtačka a skrutkovač',
    'laser a vodováha',
    'meradlá a uholník',
    'páčidlá, kliny a prísavky na sklo'],
  certificates = array['doklad o práci vo výške pri fasádach'],
  red_flags = array[
    'nevie prečítať výkres a hľadá „ako to je na obrázku"',
    'nepozná rozdiel medzi kotvením do betónu a do pórobetónu',
    'tvrdí, že okno sa osadí „na penu"',
    'nemeria uhlopriečku'],
  vocab = '[
    {"de":"Montage","sk":"montáž","note":"Monteur = montážnik."},
    {"de":"Fensterbank","sk":"parapet","note":"Vnútorný aj vonkajší."},
    {"de":"Kompriband","sk":"kompresná páska","note":"Tesnenie škáry okna."},
    {"de":"Ausrichten","sk":"vyrovnanie","note":"Do vodováhy a do uhlopriečky."},
    {"de":"Dübel","sk":"kotva","note":"Podľa podkladu, nie podľa toho, čo je v aute."},
    {"de":"Fuge","sk":"škára","note":"Musí byť tesná aj po rokoch."}
  ]'::jsonb,
  standards = array[
    'Montáž okien podľa RAL — tri roviny tesnenia',
    'Uhlopriečky musia sedieť; okno osadené „na oko" sa neotvára',
    'Kotvenie podľa podkladu a hmotnosti dielu'],
  daily_output = 'Okná: 6–10 kusov za deň vo dvojici vrátane tesnenia. Fasádne systémy podľa plochy a členitosti.',
  day_in_life = 'Ráno sa preberú diely a skontroluje, či sedia rozmery a či niečo nechýba — chýbajúci diel znamená stratený deň. Potom sa osadzuje, vyrovnáva a kotví, na konci tesní a čistí. Pri oknách sa pracuje vo dvojici a každý kus sa meria uhlopriečne.',
  pay_note = 'Lacnejšie než odborné remeslá, lebo sa dá naučiť rýchlejšie. Dobrý montážnik sa ale spozná podľa toho, že po ňom nikto nič nedoťahuje — a taký má cenu horného pásma.'
where key = 'montaznik';

-- ── Pomocný pracovník ───────────────────────────────────────────────────────
update danubra_trades set
  materials = array[
    'presun a príprava materiálu pre ostatné remeslá',
    'stavebná suť a odpad',
    'pomocný materiál — fólie, pásky, kliny'],
  tools = array[
    'pracovná obuv s oceľovou špičkou, prilba, vesta',
    'rukavice a ochranné okuliare',
    'fúrik, lopata, kladivo'],
  work_scope = array[
    'príprava materiálu a jeho presun na mieste',
    'upratovanie staveniska a odvoz sute',
    'pomocné práce pri remeselníkoch',
    'búracie práce',
    'nakladanie a vykladanie',
    'miešanie malty a lepidiel'],
  red_flags = array[
    'časté striedanie stavieb v krátkom čase',
    'žiada zálohu hneď pri prvom hovore',
    'nevie povedať, čo robil posledné mesiace',
    'nemá vlastnú pracovnú obuv a prilbu',
    'pýta sa len na to, kedy sú peniaze, a na nič iné'],
  vocab = '[
    {"de":"Bauhelfer","sk":"pomocný pracovník","note":"Takto ho volá Polier."},
    {"de":"Baustelle","sk":"stavenisko","note":"Prvé slovo, ktoré sa oplatí poznať."},
    {"de":"Schutt","sk":"stavebná suť","note":"Odvoz a triedenie."},
    {"de":"Mörtel","sk":"malta","note":"Mieša sa podľa pomeru, nie podľa oka."},
    {"de":"Feierabend","sk":"koniec pracovnej doby","note":"Zaznie každý deň."},
    {"de":"Pause","sk":"prestávka","note":"Frühstückspause býva okolo deviatej."}
  ]'::jsonb,
  standards = array[
    'Bez vlastnej obuvi, prilby a vesty človeka na stavbu nepustia',
    'Mzdová skupina LG1 — pomocné práce',
    'Nesmie robiť odborné práce, aj keby chcel; to je riziko pre celú zákazku'],
  day_in_life = 'Deň sa riadi tým, čo potrebujú remeselníci: ráno pripraviť materiál, cez deň dopĺňať a presúvať, priebežne upratovať. Kto sa vie sám pozrieť, čo bude treba o hodinu, je na stavbe cennejší než ten, kto čaká na pokyn. Večer sa upratuje — a to je presne to, podľa čoho Polier hodnotí partiu.',
  pay_note = 'Najnižšia sadzba a zároveň najväčšie riziko, že človek po prvej výplate nepríde späť. Pri pomocníkoch sa neoplatí šetriť na podmienkach: ubytovanie a doprava rozhodujú viac než pätnásť centov na hodine.'
where key = 'pomocnik';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_trade_basics)                         as zakladov,
  (select count(*) from danubra_trades)                               as remesiel,
  (select count(*) from danubra_trades
     where jsonb_array_length(coalesce(vocab,'[]'::jsonb)) > 0)       as so_slovickami,
  (select count(*) from danubra_trades where day_in_life is not null) as s_dnom;
