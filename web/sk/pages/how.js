// ============================================================================
// punds.sk — Ako to funguje (návrh 2f)
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const { icon } = require('../../shared/icons');
const { PHONE, tel, langReqBox } = require('../common');

const T = {
  sk: {
    title: 'Ako to funguje – od telefonátu po výplatu | punds', desc: 'Šesť jednoduchých krokov od prvého telefonátu po prvú výplatu. Pozrite si, čo budete potrebovať, čo vybavíme za Vás a odpovede na časté otázky.',
    home: 'Domov', crumb: 'Ako to funguje', h1: 'Od prvého telefonátu po prvú výplatu', lead: 'Celý postup je jednoduchý a vždy viete, čo bude nasledovať. Väčšinu vecí okolo práce vybavíme za Vás.',
    steps: [
      ['Ozvete sa nám', 'Zavolajte, napíšte na WhatsApp alebo vyplňte krátky formulár pri ponuke. Životopis netreba.', '5 minút'],
      ['Krátky telefonát', 'Prejdeme si Vašu prax, certifikáty, kedy môžete nastúpiť a čo od práce očakávate.', 'do 24 hodín'],
      ['Konkrétna ponuka', 'Pošleme Vám presné podmienky: miesto, sadzbu, hodiny, turnus a ubytovanie. Rozhodnete sa v pokoji.', '1–3 dni'],
      ['Dokumenty', 'Pomôžeme so živnosťou a pripravíme všetko, čo treba na prácu v Nemecku.', '1–2 týždne'],
      ['Nástup na projekt', 'Dostanete adresu ubytovania a kontakt na koordinátora. Počas projektu sme stále k dispozícii.', 'podľa ponuky'],
      ['Fakturácia a výplata', 'Každých 14 dní vyfakturujete odpracované hodiny podľa výkazu. Platby chodia načas.', 'každých 14 dní'],
    ],
    needK: 'Pripravte si', needH: 'Čo budete potrebovať', need: ['Občiansky preukaz alebo pas', 'Živnostenské oprávnenie (alebo pomôžeme založiť)', 'Certifikáty a osvedčenia k profesii', 'Bankový účet na fakturáciu'],
    weK: 'Vybavíme za Vás', weH: 'O čo sa postaráme my', we: ['Ubytovanie v blízkosti projektu', 'Dokumenty potrebné na prácu v Nemecku', 'Komunikácia s nemeckou firmou', 'Pravidelná fakturácia každých 14 dní'],
    faqH: 'Časté otázky', faqP: 'Nenašli ste odpoveď? Zavolajte na',
    faq: [
      ['Potrebujem živnosť?', 'Áno, spolupráca prebieha formou živnosti. Ak ju ešte nemáte, poradíme Vám a pomôžeme s jej založením.'],
      ['Koľko stojí Vaša pomoc?', 'Všetky podmienky vrátane prípadných poplatkov Vám povieme vopred, ešte predtým, ako sa rozhodnete. Žiadne skryté poplatky.'],
      ['Kedy a ako dostanem zaplatené?', 'Fakturuje sa každých 14 dní podľa výkazu odpracovaných hodín a platby chodia načas. Konkrétne podmienky si dohodneme pri ponuke.'],
      ['Musím vedieť po nemecky?', 'Nemčina je výhodou, ale na mnohých pozíciách nie je nevyhnutná. Záleží na konkrétnom projekte – pri každej ponuke Vám to povieme.'],
      ['Môžem ísť pracovať s kolegom?', 'Áno, radi obsadíme projekt aj celou partiou. Napíšte nám, koľko Vás je a aké profesie máte.'],
    ],
    endH: 'Pripravení? Prvý krok trvá 5 minút.', ctaJobs: 'Pozrieť ponuky', call: 'Zavolať',
  },
  cz: {
    title: 'Jak to funguje – od telefonátu po výplatu | punds', desc: 'Šest jednoduchých kroků od prvního telefonátu po první výplatu. Podívejte se, co budete potřebovat, co vyřídíme za Vás a odpovědi na časté otázky.',
    home: 'Domů', crumb: 'Jak to funguje', h1: 'Od prvního telefonátu po první výplatu', lead: 'Celý postup je jednoduchý a vždy víte, co bude následovat. Většinu věcí kolem práce vyřídíme za Vás.',
    steps: [
      ['Ozvete se nám', 'Zavolejte, napište na WhatsApp nebo vyplňte krátký formulář u nabídky. Životopis není potřeba.', '5 minut'],
      ['Krátký telefonát', 'Projdeme si Vaši praxi, certifikáty, kdy můžete nastoupit a co od práce očekáváte.', 'do 24 hodin'],
      ['Konkrétní nabídka', 'Pošleme Vám přesné podmínky: místo, sazbu, hodiny, turnus a ubytování. Rozhodnete se v klidu.', '1–3 dny'],
      ['Dokumenty', 'Pomůžeme se živností a připravíme vše, co je potřeba pro práci v Německu.', '1–2 týdny'],
      ['Nástup na projekt', 'Dostanete adresu ubytování a kontakt na koordinátora. Během projektu jsme stále k dispozici.', 'podle nabídky'],
      ['Fakturace a výplata', 'Každých 14 dní vyfakturujete odpracované hodiny podle výkazu. Platby chodí včas.', 'každých 14 dní'],
    ],
    needK: 'Připravte si', needH: 'Co budete potřebovat', need: ['Občanský průkaz nebo pas', 'Živnostenské oprávnění (nebo pomůžeme založit)', 'Certifikáty a osvědčení k profesi', 'Bankovní účet pro fakturaci'],
    weK: 'Vyřídíme za Vás', weH: 'O co se postaráme my', we: ['Ubytování v blízkosti projektu', 'Dokumenty potřebné pro práci v Německu', 'Komunikace s německou firmou', 'Pravidelná fakturace každých 14 dní'],
    faqH: 'Časté otázky', faqP: 'Nenašli jste odpověď? Zavolejte na',
    faq: [
      ['Potřebuji živnost?', 'Ano, spolupráce probíhá formou živnosti. Pokud ji ještě nemáte, poradíme Vám a pomůžeme s jejím založením.'],
      ['Kolik stojí Vaše pomoc?', 'Všechny podmínky včetně případných poplatků Vám řekneme předem, ještě než se rozhodnete. Žádné skryté poplatky.'],
      ['Kdy a jak dostanu zaplaceno?', 'Fakturuje se každých 14 dní podle výkazu odpracovaných hodin a platby chodí včas. Konkrétní podmínky domluvíme u nabídky.'],
      ['Musím umět německy?', 'Němčina je výhodou, ale na mnoha pozicích není nezbytná. Záleží na konkrétním projektu – u každé nabídky Vám to řekneme.'],
      ['Můžu jít pracovat s kolegou?', 'Ano, rádi obsadíme projekt i celou partou. Napište nám, kolik Vás je a jaké máte profese.'],
    ],
    endH: 'Připraveni? První krok trvá 5 minut.', ctaJobs: 'Zobrazit nabídky', call: 'Zavolat',
  },
  hu: {
    title: 'Hogyan működik – a hívástól a fizetésig | punds', desc: 'Hat egyszerű lépés az első hívástól az első fizetésig. Nézze meg, mire lesz szüksége, mit intézünk el Ön helyett, és a gyakori kérdésekre adott válaszokat.',
    home: 'Kezdőlap', crumb: 'Hogyan működik', h1: 'Az első hívástól az első fizetésig', lead: 'A folyamat egyszerű, és mindig tudja, mi következik. A munkával járó teendők nagy részét elintézzük Ön helyett.',
    steps: [
      ['Jelentkezik nálunk', 'Hívjon, írjon WhatsAppon, vagy töltse ki a rövid űrlapot az állásnál. Önéletrajz nem kell.', '5 perc'],
      ['Rövid telefonbeszélgetés', 'Átbeszéljük a gyakorlatát, a tanúsítványait, hogy mikor tud kezdeni, és mit vár a munkától.', '24 órán belül'],
      ['Konkrét ajánlat', 'Elküldjük a pontos feltételeket: helyszín, óradíj, munkaidő, turnus és szállás. Nyugodtan dönthet.', '1–3 nap'],
      ['Iratok', 'Segítünk a vállalkozás ügyében, és előkészítünk mindent, ami a németországi munkához kell.', '1–2 hét'],
      ['Munkakezdés', 'Megkapja a szállás címét és a koordinátor elérhetőségét. A projekt alatt végig rendelkezésre állunk.', 'ajánlat szerint'],
      ['Számlázás és fizetés', '14 naponta számlázza a ledolgozott órákat a kimutatás alapján. A kifizetések pontosan érkeznek.', '14 naponta'],
    ],
    needK: 'Készítse elő', needH: 'Amire szüksége lesz', need: ['Személyi igazolvány vagy útlevél', 'Vállalkozói engedély (vagy segítünk kiváltani)', 'A szakmához tartozó tanúsítványok', 'Bankszámla a számlázáshoz'],
    weK: 'Elintézzük Ön helyett', weH: 'Amiről mi gondoskodunk', we: ['Szállás a projekt közelében', 'A németországi munkához szükséges iratok', 'Kapcsolattartás a német céggel', 'Rendszeres számlázás 14 naponta'],
    faqH: 'Gyakori kérdések', faqP: 'Nem találta a választ? Hívja a',
    faq: [
      ['Kell vállalkozás?', 'Igen, az együttműködés egyéni vállalkozóként történik. Ha még nincs, tanácsot adunk, és segítünk az indításában.'],
      ['Mennyibe kerül a segítségük?', 'Minden feltételt, az esetleges díjakat is, előre megmondunk, még mielőtt döntene. Rejtett díjak nincsenek.'],
      ['Mikor és hogyan kapom meg a pénzem?', '14 naponta számlázunk a ledolgozott órák kimutatása alapján, és a kifizetések pontosan érkeznek. A konkrét feltételeket az ajánlatnál egyeztetjük.'],
      ['Kell tudnom németül?', 'A német nyelvtudás előny, de sok pozíciónál nem feltétel. A konkrét projekttől függ – minden ajánlatnál megmondjuk.'],
      ['Mehetek dolgozni egy kollégámmal?', 'Igen, szívesen adunk munkát egy egész brigádnak is. Írja meg, hányan vannak és milyen szakmákkal.'],
    ],
    endH: 'Készen áll? Az első lépés 5 perc.', ctaJobs: 'Állások megtekintése', call: 'Hívás',
  },
  de: {
    title: 'Ablauf – vom ersten Anruf bis zur Bezahlung | punds', desc: 'Sechs einfache Schritte vom ersten Anruf bis zur ersten Zahlung. Was Sie brauchen, was wir für Sie erledigen und Antworten auf häufige Fragen.',
    home: 'Start', crumb: 'Ablauf', h1: 'Vom ersten Anruf bis zur ersten Zahlung', lead: 'Der Ablauf ist einfach, und Sie wissen immer, was als Nächstes kommt. Das meiste rund um die Arbeit erledigen wir für Sie.',
    steps: [
      ['Sie melden sich', 'Rufen Sie an, schreiben Sie per WhatsApp oder füllen Sie das kurze Formular beim Job aus. Kein Lebenslauf nötig.', '5 Minuten'],
      ['Kurzes Telefonat', 'Wir sprechen über Ihre Erfahrung, Zertifikate, Ihren möglichen Starttermin und Ihre Erwartungen.', 'innerhalb von 24 Stunden'],
      ['Konkretes Angebot', 'Wir schicken Ihnen die genauen Konditionen: Ort, Stundensatz, Arbeitszeit, Turnus und Unterkunft. Sie entscheiden in Ruhe.', '1–3 Tage'],
      ['Dokumente', 'Wir helfen beim Gewerbe und bereiten alles vor, was Sie für die Arbeit in Deutschland brauchen.', '1–2 Wochen'],
      ['Projektstart', 'Sie bekommen die Adresse der Unterkunft und den Kontakt zum Koordinator. Während des Projekts sind wir jederzeit erreichbar.', 'je nach Angebot'],
      ['Abrechnung und Bezahlung', 'Alle 14 Tage stellen Sie die geleisteten Stunden laut Stundenzettel in Rechnung. Die Zahlungen kommen pünktlich.', 'alle 14 Tage'],
    ],
    needK: 'Bitte bereithalten', needH: 'Was Sie brauchen', need: ['Personalausweis oder Reisepass', 'Gewerbeschein (oder wir helfen bei der Anmeldung)', 'Zertifikate und Nachweise für Ihren Beruf', 'Bankkonto für die Abrechnung'],
    weK: 'Erledigen wir für Sie', weH: 'Darum kümmern wir uns', we: ['Unterkunft in der Nähe des Projekts', 'Dokumente für die Arbeit in Deutschland', 'Kommunikation mit der deutschen Firma', 'Regelmäßige Abrechnung alle 14 Tage'],
    faqH: 'Häufige Fragen', faqP: 'Keine Antwort gefunden? Rufen Sie uns an:',
    faq: [
      ['Brauche ich ein Gewerbe?', 'Ja, die Zusammenarbeit erfolgt auf selbstständiger Basis. Wenn Sie noch kein Gewerbe haben, beraten wir Sie und helfen bei der Anmeldung.'],
      ['Was kostet Ihre Hilfe?', 'Alle Konditionen, auch mögliche Gebühren, nennen wir Ihnen im Voraus – bevor Sie sich entscheiden. Keine versteckten Kosten.'],
      ['Wann und wie werde ich bezahlt?', 'Abgerechnet wird alle 14 Tage nach Stundenzettel, die Zahlungen kommen pünktlich. Die genauen Konditionen klären wir beim Angebot.'],
      ['Muss ich Deutsch können?', 'Deutsch ist von Vorteil, aber auf vielen Positionen nicht nötig. Das hängt vom Projekt ab – wir sagen es Ihnen bei jedem Angebot.'],
      ['Kann ich mit einem Kollegen arbeiten?', 'Ja, wir besetzen Projekte gern auch mit ganzen Kolonnen. Schreiben Sie uns, wie viele Sie sind und welche Berufe Sie haben.'],
    ],
    endH: 'Bereit? Der erste Schritt dauert 5 Minuten.', ctaJobs: 'Jobs ansehen', call: 'Anrufen',
  },
  en: {
    title: 'How it works – from first call to first pay | punds', desc: 'Six simple steps from your first call to your first payment. See what you’ll need, what we take care of and answers to common questions.',
    home: 'Home', crumb: 'How it works', h1: 'From your first call to your first pay', lead: 'The process is simple and you always know what comes next. We take care of most of the things around the job for you.',
    steps: [
      ['You get in touch', 'Call, message us on WhatsApp or fill in the short form on a job. No CV needed.', '5 minutes'],
      ['A short call', 'We go through your experience, certificates, when you can start and what you expect from the job.', 'within 24 hours'],
      ['A concrete offer', 'We send you the exact terms: location, rate, hours, rotation and accommodation. Take your time to decide.', '1–3 days'],
      ['Documents', 'We help with self-employment and prepare everything you need to work in Germany.', '1–2 weeks'],
      ['Starting the project', 'You get the address of your accommodation and your coordinator’s contact. We’re available throughout the project.', 'per offer'],
      ['Invoicing and pay', 'Every 14 days you invoice the hours worked according to your timesheet. Payments arrive on time.', 'every 14 days'],
    ],
    needK: 'Get ready', needH: 'What you’ll need', need: ['ID card or passport', 'Trade licence (or we’ll help you get one)', 'Certificates for your trade', 'A bank account for invoicing'],
    weK: 'We handle it', weH: 'What we take care of', we: ['Accommodation near the project', 'Documents required to work in Germany', 'Communication with the German company', 'Regular invoicing every 14 days'],
    faqH: 'Frequently asked questions', faqP: 'Didn’t find an answer? Call',
    faq: [
      ['Do I need to be self-employed?', 'Yes, we work with self-employed tradespeople. If you’re not registered yet, we’ll advise you and help you set it up.'],
      ['How much does your help cost?', 'We tell you all terms, including any fees, up front – before you decide. No hidden fees.'],
      ['When and how do I get paid?', 'Invoices go out every 14 days based on your timesheet, and payments arrive on time. We agree the exact terms with each offer.'],
      ['Do I need to speak German?', 'German is an advantage, but not required for many positions. It depends on the project – we’ll tell you with each offer.'],
      ['Can I work together with a colleague?', 'Yes, we’re happy to staff a project with a whole crew. Tell us how many of you there are and your trades.'],
    ],
    endH: 'Ready? The first step takes 5 minutes.', ctaJobs: 'See jobs', call: 'Call us',
  },
  ro: {
    title: 'Cum funcționează – de la primul apel la prima plată | punds', desc: 'Șase pași simpli de la primul apel telefonic la prima plată. Vedeți de ce aveți nevoie, de ce ne ocupăm noi și răspunsuri la întrebările frecvente.',
    home: 'Acasă', crumb: 'Cum funcționează', h1: 'De la primul apel la prima plată', lead: 'Procesul este simplu și știți mereu ce urmează. De majoritatea lucrurilor legate de muncă ne ocupăm noi.',
    steps: [
      ['Ne contactați', 'Sunați, scrieți pe WhatsApp sau completați formularul scurt de la ofertă. Nu aveți nevoie de CV.', '5 minute'],
      ['Un apel scurt', 'Discutăm experiența, certificatele, când puteți începe și ce așteptați de la muncă.', 'în 24 de ore'],
      ['Ofertă concretă', 'Vă trimitem condițiile exacte: locul, tariful, orele, rotația și cazarea. Decideți în liniște.', '1–3 zile'],
      ['Documente', 'Vă ajutăm cu înregistrarea activității independente și pregătim tot ce este necesar pentru munca în Germania.', '1–2 săptămâni'],
      ['Începerea proiectului', 'Primiți adresa cazării și contactul coordonatorului. Pe durata proiectului suntem mereu disponibili.', 'conform ofertei'],
      ['Facturare și plată', 'La fiecare 14 zile facturați orele lucrate conform fișei de pontaj. Plățile vin la timp.', 'la fiecare 14 zile'],
    ],
    needK: 'Pregătiți', needH: 'De ce aveți nevoie', need: ['Carte de identitate sau pașaport', 'Înregistrare ca PFA / activitate independentă (sau vă ajutăm să o obțineți)', 'Certificate și atestate pentru meseria Dvs.', 'Cont bancar pentru facturare', 'Șeful de echipă vorbește germană sau engleză'],
    weK: 'Ne ocupăm noi', weH: 'De ce ne ocupăm noi', we: ['Cazare în apropierea proiectului', 'Documentele necesare pentru munca în Germania', 'Comunicarea cu firma germană', 'Facturare regulată la fiecare 14 zile'],
    faqH: 'Întrebări frecvente', faqP: 'Nu ați găsit răspunsul? Sunați la',
    faq: [
      ['Am nevoie de PFA / activitate independentă?', 'Da, colaborarea se desfășoară pe bază de activitate independentă. Dacă nu o aveți încă, vă sfătuim și vă ajutăm cu înregistrarea.'],
      ['Cât costă ajutorul Dvs.?', 'Toate condițiile, inclusiv eventualele taxe, vi le spunem dinainte, înainte să decideți. Fără costuri ascunse.'],
      ['Când și cum sunt plătit?', 'Se facturează la fiecare 14 zile conform fișei de pontaj, iar plățile vin la timp. Condițiile concrete le stabilim la ofertă.'],
      ['Trebuie să vorbesc germană?', 'Șeful de echipă trebuie să vorbească germană sau engleză – coordonarea pe șantier se face în germană, iar echipa noastră vorbește slovacă, cehă, maghiară, germană și engleză. Pentru ceilalți membri ai echipei germana este un avantaj, dar nu este obligatorie.'],
      ['Pot veni la lucru cu un coleg?', 'Da, ocupăm cu plăcere un proiect și cu o echipă întreagă. Scrieți-ne câți sunteți și ce meserii aveți.'],
    ],
    endH: 'Sunteți gata? Primul pas durează 5 minute.', ctaJobs: 'Vezi ofertele', call: 'Sunați',
  },
  pl: {
    title: 'Jak to działa – od telefonu do wypłaty | punds', desc: 'Sześć prostych kroków od pierwszego telefonu do pierwszej wypłaty. Zobacz, co będzie potrzebne, co załatwiamy za Państwa i odpowiedzi na częste pytania.',
    home: 'Start', crumb: 'Jak to działa', h1: 'Od pierwszego telefonu do pierwszej wypłaty', lead: 'Cały proces jest prosty i zawsze wiadomo, co będzie dalej. Większość spraw związanych z pracą załatwiamy za Państwa.',
    steps: [
      ['Kontakt z nami', 'Telefon, wiadomość na WhatsApp lub krótki formularz przy ofercie. CV nie jest potrzebne.', '5 minut'],
      ['Krótka rozmowa telefoniczna', 'Omawiamy doświadczenie, certyfikaty, możliwy termin rozpoczęcia i oczekiwania wobec pracy.', 'do 24 godzin'],
      ['Konkretna oferta', 'Wysyłamy dokładne warunki: miejsce, stawkę, godziny, rotację i zakwaterowanie. Decyzja na spokojnie.', '1–3 dni'],
      ['Dokumenty', 'Pomagamy z działalnością gospodarczą i przygotowujemy wszystko, co potrzebne do pracy w Niemczech.', '1–2 tygodnie'],
      ['Start na projekcie', 'Otrzymują Państwo adres zakwaterowania i kontakt do koordynatora. W trakcie projektu jesteśmy stale do dyspozycji.', 'według oferty'],
      ['Fakturowanie i wypłata', 'Co 14 dni wystawiają Państwo fakturę za przepracowane godziny według karty pracy. Płatności przychodzą na czas.', 'co 14 dni'],
    ],
    needK: 'Do przygotowania', needH: 'Co będzie potrzebne', need: ['Dowód osobisty lub paszport', 'Zarejestrowana działalność gospodarcza (lub pomożemy ją założyć)', 'Certyfikaty i uprawnienia do zawodu', 'Konto bankowe do fakturowania', 'Kierownik brygady mówi po niemiecku lub po angielsku'],
    weK: 'Załatwiamy za Państwa', weH: 'O co zadbamy my', we: ['Zakwaterowanie w pobliżu projektu', 'Dokumenty potrzebne do pracy w Niemczech', 'Komunikacja z niemiecką firmą', 'Regularne fakturowanie co 14 dni'],
    faqH: 'Częste pytania', faqP: 'Brak odpowiedzi? Prosimy zadzwonić pod',
    faq: [
      ['Czy potrzebuję własnej działalności?', 'Tak, współpraca odbywa się w ramach własnej działalności gospodarczej. Jeśli jeszcze jej Państwo nie mają, doradzimy i pomożemy ją założyć.'],
      ['Ile kosztuje Państwa pomoc?', 'Wszystkie warunki, w tym ewentualne opłaty, podajemy z góry – zanim Państwo podejmą decyzję. Bez ukrytych opłat.'],
      ['Kiedy i jak otrzymam wypłatę?', 'Fakturuje się co 14 dni według karty pracy, a płatności przychodzą na czas. Konkretne warunki ustalamy przy ofercie.'],
      ['Czy muszę znać niemiecki?', 'Kierownik brygady musi mówić po niemiecku lub po angielsku – koordynacja na budowie odbywa się po niemiecku, a nasz zespół mówi po słowacku, czesku, węgiersku, niemiecku i angielsku. Dla pozostałych członków brygady niemiecki jest zaletą, ale nie jest wymagany.'],
      ['Czy mogę pracować razem z kolegą?', 'Tak, chętnie obsadzimy projekt całą brygadą. Prosimy napisać, ile Państwa jest i jakie macie zawody.'],
    ],
    endH: 'Gotowi? Pierwszy krok zajmuje 5 minut.', ctaJobs: 'Zobacz oferty', call: 'Zadzwoń',
  },
  bg: {
    title: 'Как работи – от обаждането до заплащането | punds', desc: 'Шест прости стъпки от първото обаждане до първото плащане. Вижте какво ще Ви е нужно, какво уреждаме ние и отговори на често задавани въпроси.',
    home: 'Начало', crumb: 'Как работи', h1: 'От първото обаждане до първото плащане', lead: 'Процесът е прост и винаги знаете какво следва. За повечето неща около работата се грижим ние.',
    steps: [
      ['Свързвате се с нас', 'Обадете се, пишете в WhatsApp или попълнете краткия формуляр при обявата. Не е нужна автобиография.', '5 минути'],
      ['Кратък телефонен разговор', 'Обсъждаме опита Ви, сертификатите, кога можете да започнете и какво очаквате от работата.', 'до 24 часа'],
      ['Конкретна оферта', 'Изпращаме Ви точните условия: място, ставка, часове, ротация и квартира. Решавате спокойно.', '1–3 дни'],
      ['Документи', 'Помагаме с регистрацията като самонаето лице и подготвяме всичко необходимо за работа в Германия.', '1–2 седмици'],
      ['Започване на проекта', 'Получавате адреса на квартирата и контакт на координатора. По време на проекта сме винаги на разположение.', 'според офертата'],
      ['Фактуриране и плащане', 'На всеки 14 дни фактурирате отработените часове по отчета. Плащанията идват навреме.', 'на всеки 14 дни'],
    ],
    needK: 'Подготовка', needH: 'Какво ще Ви е нужно', need: ['Лична карта или паспорт', 'Регистрация като самонаето лице (или ще Ви помогнем да я направите)', 'Сертификати и удостоверения за професията', 'Банкова сметка за фактуриране', 'Ръководителят на екипа говори немски или английски'],
    weK: 'Уреждаме ние', weH: 'За какво се грижим ние', we: ['Квартира близо до обекта', 'Документите, необходими за работа в Германия', 'Комуникацията с немската фирма', 'Редовно фактуриране на всеки 14 дни'],
    faqH: 'Често задавани въпроси', faqP: 'Не намерихте отговор? Обадете се на',
    faq: [
      ['Трябва ли да съм самонаето лице?', 'Да, сътрудничеството е на базата на самостоятелна дейност. Ако още нямате регистрация, ще Ви посъветваме и ще Ви помогнем да я направите.'],
      ['Колко струва Вашата помощ?', 'Всички условия, включително евентуални такси, Ви казваме предварително – преди да решите. Без скрити такси.'],
      ['Кога и как ще получа парите си?', 'Фактурира се на всеки 14 дни по отчета за отработените часове и плащанията идват навреме. Конкретните условия уговаряме при офертата.'],
      ['Трябва ли да знам немски?', 'Ръководителят на екипа трябва да говори немски или английски – координацията на обекта е на немски, а нашият екип говори словашки, чешки, унгарски, немски и английски. За останалите членове на екипа немският е предимство, но не е задължителен.'],
      ['Мога ли да работя с колега?', 'Да, с удоволствие ще заемем проект и с цял екип. Пишете ни колко сте и какви професии имате.'],
    ],
    endH: 'Готови ли сте? Първата стъпка отнема 5 минути.', ctaJobs: 'Вижте обявите', call: 'Обадете се',
  },
};

const pad = (i) => String(i + 1).padStart(2, '0');
const clock = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const checks = (list) => each(list, (x) => `<li><span class="sp-tick" aria-hidden="true">${icon('check')}</span>${esc(x)}</li>`);

async function render(ctx) {
  const t = T[ctx.lang];
  const body = `
<div class="wrap sp-head">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
  <div class="sp-head-in rv-in"><h1 class="sp-h1">${esc(t.h1)}</h1><p class="lead sp-lead">${esc(t.lead)}</p></div>
</div>
${langReqBox(ctx, { wrap: 'hw-req' })}
<section class="wrap hw-steps">
  <ol>${each(t.steps, ([h, p, d], i) => `<li class="hw-step rv${i === 0 ? ' on' : ''}"><span class="hw-n" aria-hidden="true">${pad(i)}</span><div class="hw-txt"><h2>${esc(h)}</h2><p>${esc(p)}</p></div><span class="hw-time">${clock}${esc(d)}</span></li>`)}</ol>
</section>
<section class="wrap hw-two">
  <div class="ab-aud-c rv"><span class="sp-kicker">${esc(t.needK)}</span><h2 class="ab-aud-h hw-two-h">${esc(t.needH)}</h2><ul class="sp-checks">${checks(t.need)}</ul></div>
  <div class="ab-aud-c ab-aud-dark rv"><span class="sp-kicker">${esc(t.weK)}</span><h2 class="ab-aud-h hw-two-h">${esc(t.weH)}</h2><ul class="sp-checks">${checks(t.we)}</ul></div>
</section>
<section class="wrap sec hw-faq" aria-labelledby="hw-faq-h">
  <div class="hw-faq-h"><h2 class="h2 sp-h2-40" id="hw-faq-h">${esc(t.faqH)}</h2><p>${esc(t.faqP)} <a class="b or" href="${tel(PHONE)}">${PHONE}</a>.</p></div>
  <div class="hw-acc rv" data-acc-group>${each(t.faq, ([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><span>${esc(q)}</span><span class="hw-plus" aria-hidden="true">+</span></summary><p>${esc(a)}</p></details>`)}</div>
</section>
<section class="wrap sec sec-last hw-end rv">
  ${mark({ w: 64 })}
  <h2>${esc(t.endH)}</h2>
  <div class="hm-ctas"><a class="btn btn-primary" href="${esc(ctx.url('jobs'))}">${esc(t.ctaJobs)} →</a><a class="btn btn-ghost" href="${tel(PHONE)}">${esc(t.call)} · ${PHONE}</a></div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-how' };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
