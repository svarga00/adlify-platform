-- ============================================================================
-- 040 — remeslá dopísané do konca
-- ============================================================================
-- Migrácia 037 mala naplniť obsah všetkých jedenástich remesiel. Prešla len
-- sčasti: zápisy do databázy vtedy opakovane vypršiavali a zostalo z nej
-- slovníkov 2 z 11 a noriem 1 z 11. Napísal som to vtedy otvorene a nechal
-- dopísať na neskôr — toto je to neskôr.
--
-- Okrem toho mali štyri remeslá (montážnik, pomocník, zámočník, tesár) menej
-- než päť odborných otázok. To nebol len tenký obsah: `DanubraTrade`
-- vyžaduje aspoň päť otázok na spustenie skúšania, takže z týchto štyroch
-- sa **nedalo odskúšať vôbec** — obrazovka namiesto skúšania napísala, že
-- otázok je málo. Teraz má najmenšie remeslo päť a najväčšie deväť.
--
-- Čo je v `standards`: nie citácie noriem, ale **praktické fakty, ktoré sa
-- dajú overiť otázkou**. „Spád do vpuste 1,5 až 2 %" sa dá spýtať; „DIN
-- 18534" sa dá iba prečítať. Rovnako `vocab` nesie pri každom slove
-- poznámku, podľa čoho sa pozná, že to ten človek naozaj robil — to je to,
-- čo z toho robí nástroj na nábor a nie slovník.
--
-- Idempotentné: hodnoty sa prepíšu na tie isté, otázky majú `on conflict
-- (code) do nothing`.
-- ============================================================================

-- ── Slovník a normy ─────────────────────────────────────────────────────────
update danubra_trades set vocab = '[
 {"de":"Mauerwerk","sk":"murivo","note":"Pýtaj sa na hrúbku v cm — kto murárčil, povie ju bez rozmýšľania."},
 {"de":"Mörtel","sk":"malta","note":"Dünnbettmörtel pri presných tvárniciach, Normalmörtel pri tehle."},
 {"de":"Ringanker","sk":"stužujúci veniec","note":"Bez neho múr nedrží priečne sily. Kto ho nepozná, robil len priečky."},
 {"de":"Sturz","sk":"preklad","note":"Nad otvorom. Spýtaj sa na uloženie — býva 125 až 250 mm."},
 {"de":"Aufmaß","sk":"zameranie, výmera","note":"Podľa neho sa fakturuje. Kto robil na úkol, vie to presne."}
]'::jsonb,
standards = ARRAY[
 'Tenká škára pri presných tvárniciach 1–3 mm',
 'Uloženie prekladu min. 125 mm na každej strane',
 'Zvislosť steny do 2 mm na 1 m',
 'Stužujúci veniec na každom poschodí'
] where key = 'murar';

update danubra_trades set vocab = '[
 {"de":"Bewehrung","sk":"výstuž","note":"Priemer a rozteč. Kto viazal, povie oboje."},
 {"de":"Abstandhalter","sk":"dištančník","note":"Drží krytie. Kto ich vynecháva a podkladá kameňmi, robil narýchlo."},
 {"de":"Betondeckung","sk":"krytie výstuže","note":"V mm. Najčastejšia skrytá chyba — spýtaj sa na hodnotu."},
 {"de":"Rüttler","sk":"ponorný vibrátor","note":"Vibruje sa po vrstvách, nie dodatočne zhora."},
 {"de":"Nachbehandlung","sk":"ošetrovanie betónu","note":"Kropenie a zakrytie. Zabúda sa a potom to praská."}
]'::jsonb,
standards = ARRAY[
 'Krytie výstuže podľa prostredia, bežne 25–40 mm',
 'Dištančníky vždy — nie podkladanie kameňmi',
 'Vibrovanie po vrstvách, nie až po uložení celej výšky',
 'Ošetrovanie betónu minimálne tri dni'
] where key = 'betonar';

update danubra_trades set standards = ARRAY[
 'Q2 je bežný štandard steny pod maľbu',
 'Pri šikmom svetle sa žiada Q3 alebo Q4',
 'Penetrácia pred maľbou na sadrokartón vždy',
 'Dve vrstvy sú bežné — jedna sa neuznáva'
] where key = 'maliar';

update danubra_trades set vocab = '[
 {"de":"Leerrohr","sk":"chránička","note":"Do nej sa ťahá kábel. Kto hovorí len rúra, hrubú stavbu nerobil."},
 {"de":"Unterverteilung","sk":"podružný rozvádzač","note":"Spýtaj sa, koľko okruhov bežne osadí za deň."},
 {"de":"Schlitzen","sk":"drážkovanie","note":"Hĺbka aj smer majú pravidlá — šikmé drážky sú chyba."},
 {"de":"Potentialausgleich","sk":"ochranné pospájanie","note":"Kto to vynechá, neprejde revíziou."},
 {"de":"Aderendhülse","sk":"dutinka","note":"Na lanko do svorky. Drobnosť, podľa ktorej sa pozná poriadok."}
]'::jsonb,
standards = ARRAY[
 'Drážky zvislo nad a pod vývodom, nikdy šikmo',
 'Zásuvkový okruh istený 16 A',
 'Chránička sa kladie tak, aby sa kábel dal vytiahnuť',
 'Pospájanie vždy — vaňa, sprcha, kovové potrubie',
 'Revíziu robí len oprávnená osoba'
] where key = 'elektrikar';

update danubra_trades set vocab = '[
 {"de":"Dünnbettverfahren","sk":"tenkovrstvové lepenie","note":"Pri veľkých formátoch sa lepí na podklad aj na dosku."},
 {"de":"Abdichtung","sk":"hydroizolácia pod obklad","note":"V mokrej zóne povinná. Bez nej je to reklamácia."},
 {"de":"Gefälle","sk":"spád do vpuste","note":"Býva 1,5 až 2 %. Kto robil sprchy, povie to hneď."},
 {"de":"Silikonfuge","sk":"silikónová škára","note":"Do rohov a dilatácií. Kto tam dá škárovačku, popraská to."},
 {"de":"Fugenkreuz","sk":"krížik do škár","note":"Šírka škáry v mm — kto kládol, povie číslo."}
]'::jsonb,
standards = ARRAY[
 'Hydroizolácia v sprche vždy',
 'Spád do vpuste 1,5 až 2 %',
 'Rohy a napojenia silikónom, nie škárovacou maltou',
 'Veľký formát: lepidlo na podklad aj na dosku',
 'Rovinnosť podkladu do 3 mm na 2 m'
] where key = 'obkladac';

update danubra_trades set vocab = '[
 {"de":"Schalung","sk":"debnenie","note":"Spýtaj sa na systém — Doka, Peri, alebo tradičné."},
 {"de":"Sparren","sk":"krokva","note":"Rozteč býva 60 až 90 cm."},
 {"de":"Pfette","sk":"väznica","note":"Vodorovný nosník pod krokvami."},
 {"de":"Ausklinkung","sk":"zárez, osedlanie","note":"Spoj krokvy s väznicou. Kto tesárčil, nakreslí to rukou."},
 {"de":"Lattung","sk":"latovanie","note":"Pod krytinu. Rozteč podľa typu krytiny."}
]'::jsonb,
standards = ARRAY[
 'Debnenie musí uniesť tlak čerstvého betónu',
 'Rozteč krokiev podľa statiky, bežne 60 až 90 cm',
 'Drevo v styku s murivom oddelené izoláciou',
 'Spoje podľa projektu, nie improvizované'
] where key = 'tesar';

update danubra_trades set vocab = '[
 {"de":"Kehlnaht","sk":"kútový zvar","note":"a-rozmer. Kto zváral, povie ho hneď."},
 {"de":"Stumpfnaht","sk":"tupý zvar","note":"Na plný prierez. Pýtaj sa na prípravu hrán."},
 {"de":"Schweißerprüfung","sk":"skúška zvárača","note":"EN ISO 9606-1. Spýtaj sa na platnosť — potvrdzuje sa každého pol roka."},
 {"de":"Vorwärmen","sk":"predhrev","note":"Pri hrubších dielcoch a v zime. Kto to nerobí, praská mu to."},
 {"de":"Schweißnahtprüfung","sk":"kontrola zvaru","note":"Vizuálna, alebo ultrazvuk a röntgen pri nosných spojoch."}
]'::jsonb,
standards = ARRAY[
 'Platný certifikát EN ISO 9606-1 na daný postup a materiál',
 'Certifikát platí tri roky, potvrdzuje sa každých šesť mesiacov',
 'a-rozmer kútového zvaru podľa projektu, nie od oka',
 'Predhrev pri hrubších dielcoch a pri nízkej teplote'
] where key = 'zvarac';

update danubra_trades set vocab = '[
 {"de":"Stahlbau","sk":"oceľové konštrukcie","note":"Spýtaj sa, či robil nosné, alebo len doplnky."},
 {"de":"Verzinkung","sk":"zinkovanie","note":"Žiarové alebo galvanické. Rozdiel pozná ten, kto to objednával."},
 {"de":"Richten","sk":"rovnanie","note":"Po zváraní sa konštrukcia krúti. Rovnanie je samostatná zručnosť."},
 {"de":"Passung","sk":"lícovanie, tolerancia","note":"V desatinách mm. Kto robil presné dielce, hovorí v nich."},
 {"de":"Montagestoß","sk":"montážny spoj","note":"Skrutkovaný na stavbe. Trieda skrutiek je v projekte."}
]'::jsonb,
standards = ARRAY[
 'Oceľové konštrukcie podľa EN 1090',
 'Zvary očistiť a prebrúsiť pred náterom',
 'Žiarové zinkovanie podľa hrúbky dielca',
 'Montážne spoje skrutkované podľa triedy z projektu'
] where key = 'zamocnik';

update danubra_trades set vocab = '[
 {"de":"Dübel","sk":"hmoždinka, kotva","note":"Typ podľa podkladu. Kto to nerozlišuje, do betónu nekotvil."},
 {"de":"Drehmoment","sk":"uťahovací moment","note":"V Nm. Kto montoval oceľ, pozná hodnoty."},
 {"de":"Lotrecht","sk":"zvislo","note":"Na olovnicu alebo laser. Kontroluje sa, neodhaduje."},
 {"de":"Traglast","sk":"nosnosť","note":"Spýtaj sa, odkiaľ ju berie — z projektu, alebo od oka."},
 {"de":"Unterkonstruktion","sk":"nosný rošt","note":"Fasády aj technológie. Bez neho sa nemá čo kotviť."}
]'::jsonb,
standards = ARRAY[
 'Uťahovací moment podľa typu skrutky, nie od oka',
 'Kotva do betónu, nie do malty ani do škáry',
 'Zvislosť do 2 mm na 1 m',
 'Pri nosných konštrukciách montážny protokol'
] where key = 'montaznik';

-- Pomocný pracovník nie je remeslo s technikou — je to človek, ktorý sa musí
-- vedieť bezpečne pohybovať po nemeckej stavbe. Tomu zodpovedá aj obsah.
update danubra_trades set vocab = '[
 {"de":"Baustelle","sk":"stavenisko","note":"Základné slovo. Bez neho sa nedohovorí ani na vrátnici."},
 {"de":"Schutzhelm","sk":"prilba","note":"Povinná. Bez nej ho na stavbu nepustia."},
 {"de":"Absperrung","sk":"ohradenie, zábrana","note":"Kam sa nesmie. Pýtaj sa, či vie, prečo tam je."},
 {"de":"Schuttmulde","sk":"kontajner na sutinu","note":"Triedi sa. V Nemecku sa to berie vážne."},
 {"de":"Feierabend","sk":"koniec smeny","note":"Počuje to každý deň. Nech vie, čo to znamená."}
]'::jsonb,
standards = ARRAY[
 'Prilba, pracovná obuv a vesta po celý čas na stavbe',
 'Nad dva metre zábradlie alebo postroj',
 'Materiál sa neskladuje na únikových cestách',
 'Sutina sa triedi, nie hádže na jednu kopu'
] where key = 'pomocnik';

-- ── Otázky pre remeslá, z ktorých sa nedalo skúšať ──────────────────────────
insert into danubra_screening_questions
 (code, trade_key, phase, kind, question_sk, good_answer, red_flag_answer, weight, sort_order, active)
values
 ('t_mon_kotva','montaznik','phone','hidden',
  'Do betónu a do dierovanej tehly — kotvíte rovnako?',
  'Nie. Do betónu rozperná alebo chemická kotva, do dierovanej tehly chemická so sitkom, inak sa vytrhne.',
  'Však hmoždinka je hmoždinka, dám tam, čo mám v aute.', 3, 1, true),
 ('t_mon_moment','montaznik','interview','knowledge',
  'Podľa čoho uťahujete skrutky na nosnej konštrukcii?',
  'Podľa predpísaného momentu v Nm z projektu, momentovým kľúčom. Pri dôležitých spojoch sa to zapisuje.',
  'Dotiahnem to poriadne, cit mám po rokoch.', 3, 2, true),
 ('t_mon_zvislost','montaznik','interview','knowledge',
  'Ako kontrolujete zvislosť a aká odchýlka je ešte v poriadku?',
  'Olovnicou alebo laserom, bežne do 2 mm na meter. Meria sa, neodhaduje.',
  'Pozriem sa na to okom, to je vidieť.', 2, 3, true),
 ('t_mon_rost','montaznik','interview','knowledge',
  'Čo robíte, keď je podklad nerovný a rošt nesedí?',
  'Vyrovnám konzolami alebo podložkami a zameriam znova. Nikdy nepodkladám tým, čo je po ruke.',
  'Dotiahnem to nasilu, ono si to sadne.', 2, 4, true),
 ('t_zam_zvar','zamocnik','phone','hidden',
  'Čo spravíte so zvarom predtým, než ide dielec na nátery?',
  'Očistím od trosky a rozstreku, prebrúsim. Inak náter nedrží a hrdzavie to spod neho.',
  'Zvar je zvar, farba to prekryje.', 3, 1, true),
 ('t_zam_zink','zamocnik','interview','knowledge',
  'Žiarové a galvanické zinkovanie — aký je rozdiel a kedy čo?',
  'Žiarové je hrubšie a na von, galvanické tenké a do interiéru. Vonkajšia konštrukcia bez žiarového dlho nevydrží.',
  'To je to isté, len inak sa to volá.', 2, 2, true),
 ('t_zam_tolerancia','zamocnik','interview','knowledge',
  'V akých toleranciách ste robili pri presných dielcoch?',
  'V desatinách milimetra, podľa výkresu. Lícovanie sa kontroluje, nie odhaduje.',
  'Robil som to tak, aby to pasovalo.', 2, 3, true),
 ('t_pom_vyska','pomocnik','phone','hidden',
  'Od akej výšky sa pracuje s istením a čo to znamená?',
  'Nad dva metre zábradlie alebo postroj. Bez toho ma na stavbu nepustia a ani by som nešiel.',
  'Keď sa dá chytiť, tak to zvládnem aj tak.', 3, 1, true),
 ('t_pom_ochrana','pomocnik','phone','hidden',
  'Čo si musíte vziať na stavbu každý deň?',
  'Prilbu, pracovnú obuv s tvrdou špičkou a reflexnú vestu. Bez toho ma cez vrátnicu nepustia.',
  'Niečo si vezmem, väčšinou mi to dajú na mieste.', 2, 2, true),
 ('t_pom_triedenie','pomocnik','interview','knowledge',
  'Čo robíte so sutinou a odpadom na konci dňa?',
  'Triedim do kontajnerov podľa druhu. V Nemecku sa to kontroluje a pokuta ide firme.',
  'Hodím to na kopu, od toho je tam kontajner.', 2, 3, true),
 ('t_tes_podpera','tesar','phone','hidden',
  'Čo sa stane, keď je debnenie slabo podopreté?',
  'Čerstvý betón ho roztlačí alebo vyduje — stena je potom krivá a prerába sa to. Preto sa podpera počíta.',
  'Nikdy sa mi to nestalo, dávam tam, čo je po ruke.', 3, 2, true),
 ('t_tes_rozstup','tesar','phone','hidden',
  'Aká býva rozteč krokiev a od čoho závisí?',
  'Bežne 60 až 90 cm, podľa statiky, krytiny a zaťaženia snehom. Nevymýšľa sa.',
  'Dám to tak na metrov, ako to vyjde.', 2, 3, true),
 ('t_tes_drevo','tesar','interview','knowledge',
  'Prečo sa drevo nesmie dotýkať muriva priamo?',
  'Ťahá vlhkosť a zahnije. Dáva sa medzi to izolačný pás.',
  'Veď je to drevo na stavbu, to vydrží.', 2, 4, true)
on conflict (code) do nothing;

-- ── Kontrola ────────────────────────────────────────────────────────────────
-- Päť otázok je hranica, pod ktorou sa skúšanie nespustí (DanubraTrade
-- .QUESTIONS_MIN). Keby niekto otázku vypol, nech sa to zistí tu a nie až
-- vtedy, keď si náborár otvorí skúšanie a nájde oznam namiesto otázky.
do $$
declare chyba text;
begin
  select string_agg(x.key, ', ') into chyba from (
    select t.key from danubra_trades t
    where t.vocab is null or t.vocab::text in ('[]','null')
       or t.standards is null or coalesce(array_length(t.standards, 1), 0) = 0
  ) x;
  if chyba is not null then
    raise exception 'Remeslá bez slovníka alebo noriem: %', chyba;
  end if;

  select string_agg(x.key || ' (' || x.n || ')', ', ') into chyba from (
    select t.key, count(q.id) as n
    from danubra_trades t
    left join danubra_screening_questions q
      on q.trade_key = t.key and q.active is not false
    group by t.key having count(q.id) < 5
  ) x;
  if chyba is not null then
    raise exception 'Remeslá, z ktorých sa nedá skúšať (menej než 5 otázok): %', chyba;
  end if;

  raise notice 'Všetkých jedenásť remesiel má slovník, normy aj dosť otázok.';
end $$;
