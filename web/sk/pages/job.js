// ============================================================================
// punds.sk — detail ponuky (návrh 2b, mobil 1d)
// ============================================================================
// Ponuka sa nájde podľa slugu v ctx.jobs(); neznáma ponuka = 404 (null).
// Prihláška: desktop v bočnom paneli, mobil cez spodnú lištu → výsuvný
// panel (meno, telefón, súhlas). Kalkulačku, zdieľanie a lištu ovláda
// public/js/sk-job.js. Ukážkové ponuky nedostanú JobPosting (schema.org).
// ============================================================================
'use strict';

const { esc, each, cls, num, plural, LOCALE } = require('../../shared/h');
const { T: C, rate, PHONE, tel } = require('../common');

const WA = '421910523858';

const T = {
  sk: {
    home: 'Domov', active: 'Aktívna ponuka', seek: (n) => `hľadáme ${n} ${n === 1 ? 'pracovníka' : 'pracovníkov'}`,
    perHour: 'na hodinu', startOn: 'Nástup', back: 'Späť na ponuky',
    country: { DE: 'Nemecko', AT: 'Rakúsko', CH: 'Švajčiarsko', NL: 'Holandsko', BE: 'Belgicko', LU: 'Luxembursko', SK: 'Slovensko', CZ: 'Česko' },
    tagAccom: 'Pomoc s ubytovaním', tagInvoice: 'Fakturácia každých 14 dní', tagPartners: 'Overení partneri v Nemecku', tagRot: 'Turnus',
    about: 'O pozícii', duties: 'Náplň práce',
    descFb: (j) => `Hľadáme skúsených remeselníkov na pozíciu ${j.title} na projekt v meste ${j.city}. Pracuje sa pre overenú nemeckú firmu, spolupráca prebieha formou živnosti a fakturuje sa každých 14 dní.`,
    fHours: 'Rozsah hodín', hoursV: (n) => `${n}+ h / týždeň`, hoursS: (n) => `${n}+ h / týž.`, fRot: 'Turnus', fAccom: 'Ubytovanie', accYes: 'Zabezpečené', accNo: 'Nie', fCountry: 'Krajina', fRate: 'Sadzba', fStart: 'Nástup',
    req: 'Požiadavky', reqSub: 'Čo od Vás očakávame', offer: 'Čo ponúkame', offerSub: 'Výhody spolupráce',
    calc: 'Kalkulačka zárobku', calcSub: 'Orientačný hrubý zárobok pri tejto pozícii.', hoursW: 'Odpracované hodiny týždenne', weeks: 'Počet týždňov', invoiced: 'Fakturovaná suma', hUnit: 'hodín',
    disclaimer: 'Výpočet je len orientačný (hrubá fakturovaná suma pred odvodmi a nákladmi). Presné podmienky Vám potvrdíme.', calcCta: 'Vypočítať orientačný zárobok',
    loc: 'Lokalita', route: 'Vypočítať trasu', faq: 'Časté otázky',
    share: 'Zdieľať ponuku', shareSub: 'Pošlite ponuku známemu, ktorý hľadá prácu.', copy: 'Kopírovať odkaz',
    applyH: 'Mám záujem o pozíciu', applySub: 'Ozveme sa do 24 hodín. Žiadne CV netreba.', now: 'Ihneď',
    name: 'Meno a priezvisko', namePh: 'Ján Novák', phone: 'Telefón', phonePh: '+421 …', email: 'E-mail', emailPh: 'jan@email.sk',
    note: 'Poznámka (nepovinné)', notePh: 'Napr. prax, kedy môžete nastúpiť…', consent: ['Súhlasím so ', 'spracovaním osobných údajov', ''],
    send: 'Odoslať prihlášku', sendM: 'Odoslať', waM: 'Radšej cez WhatsApp', noCv: 'bez CV',
    waText: (j, u) => `Dobrý deň, mám záujem o ponuku ${j.title} – ${j.city}. ${u}`,
    ok: 'Ďakujeme!', okP: ['Prihlášku na pozíciu ', ' sme dostali. Ozveme sa do 24 hodín.'], nextH: 'Čo bude ďalej',
    steps: ['Zavoláme Vám a overíme prax.', 'Pošleme Vám konkrétne podmienky.', 'Vybavíme papiere, ubytovanie a nástup.'], backM: 'Späť na ponuku',
    other: 'Pozrite si aj ostatné pozície', otherSub: 'Máme priebežne voľné miesta aj v ďalších remeslách.',
    otherCta: 'Hľadáte prácu v inom remesle?', otherCtaP: 'Vyplňte nezáväzný formulár a ozveme sa Vám čo najskôr.', otherCtaB: 'Vyplniť formulár',
    faqList: [
      ['Potrebujem živnosť?', 'Áno, spolupráca prebieha formou živnosti (SZČO). Ak ju ešte nemáte, poradíme Vám a pomôžeme s jej založením.'],
      ['Čo je A1 a kto ho vybaví?', 'A1 je potvrdenie o tom, kde platíte sociálne odvody pri práci v zahraničí. Vybavíme ho kompletne za Vás.'],
      ['Pomôžete s Freistellung a daňovým číslom?', 'Áno. Zabezpečíme Freistellungsbescheinigung, nemecké daňové číslo (Steuernummer), aktiváciu Elsteru aj ďalšiu administratívu.'],
      ['Kedy a ako dostanem zaplatené?', 'Fakturuje sa každých 14 dní a platby chodia načas. Konkrétne podmienky si dohodneme pri nástupe.'],
      ['Kto rieši ubytovanie?', 'Pomáhame so zabezpečením ubytovania v blízkosti projektu. Detaily Vám potvrdíme pri konkrétnej ponuke.'],
      ['Musím vedieť po nemecky?', 'Nemčina je výhodou (lepšie podmienky), ale na mnohých pozíciách nie je nevyhnutná. Záleží na konkrétnom projekte.'],
    ],
  },
  cz: {
    home: 'Domů', active: 'Aktivní nabídka', seek: (n) => `hledáme ${n} ${plural('cz', n, ['pracovníka', 'pracovníky', 'pracovníků'])}`,
    perHour: 'na hodinu', startOn: 'Nástup', back: 'Zpět na nabídky',
    country: { DE: 'Německo', AT: 'Rakousko', CH: 'Švýcarsko', NL: 'Nizozemsko', BE: 'Belgie', LU: 'Lucembursko', SK: 'Slovensko', CZ: 'Česko' },
    tagAccom: 'Pomoc s ubytováním', tagInvoice: 'Fakturace každých 14 dní', tagPartners: 'Ověření partneři v Německu', tagRot: 'Turnus',
    about: 'O pozici', duties: 'Náplň práce',
    descFb: (j) => `Hledáme zkušené řemeslníky na pozici ${j.title} na projekt ve městě ${j.city}. Pracuje se pro ověřenou německou firmu, spolupráce probíhá formou živnosti a fakturuje se každých 14 dní.`,
    fHours: 'Rozsah hodin', hoursV: (n) => `${n}+ h / týden`, hoursS: (n) => `${n}+ h / týd.`, fRot: 'Turnus', fAccom: 'Ubytování', accYes: 'Zajištěno', accNo: 'Ne', fCountry: 'Země', fRate: 'Sazba', fStart: 'Nástup',
    req: 'Požadavky', reqSub: 'Co od Vás očekáváme', offer: 'Co nabízíme', offerSub: 'Výhody spolupráce',
    calc: 'Kalkulačka výdělku', calcSub: 'Orientační hrubý výdělek na této pozici.', hoursW: 'Odpracované hodiny týdně', weeks: 'Počet týdnů', invoiced: 'Fakturovaná částka', hUnit: 'hodin',
    disclaimer: 'Výpočet je pouze orientační (hrubá fakturovaná částka před odvody a náklady). Přesné podmínky Vám potvrdíme.', calcCta: 'Spočítat orientační výdělek',
    loc: 'Lokalita', route: 'Naplánovat trasu', faq: 'Časté dotazy',
    share: 'Sdílet nabídku', shareSub: 'Pošlete nabídku známému, který hledá práci.', copy: 'Kopírovat odkaz',
    applyH: 'Mám zájem o pozici', applySub: 'Ozveme se do 24 hodin. Žádné CV není potřeba.', now: 'Ihned',
    name: 'Jméno a příjmení', namePh: 'Jan Novák', phone: 'Telefon', phonePh: '+420 …', email: 'E-mail', emailPh: 'jan@email.cz',
    note: 'Poznámka (nepovinné)', notePh: 'Např. praxe, kdy můžete nastoupit…', consent: ['Souhlasím se ', 'zpracováním osobních údajů', ''],
    send: 'Odeslat přihlášku', sendM: 'Odeslat', waM: 'Raději přes WhatsApp', noCv: 'bez CV',
    waText: (j, u) => `Dobrý den, mám zájem o nabídku ${j.title} – ${j.city}. ${u}`,
    ok: 'Děkujeme!', okP: ['Přihlášku na pozici ', ' jsme obdrželi. Ozveme se do 24 hodin.'], nextH: 'Co bude dál',
    steps: ['Zavoláme Vám a ověříme praxi.', 'Pošleme Vám konkrétní podmínky.', 'Vyřídíme papíry, ubytování a nástup.'], backM: 'Zpět na nabídku',
    other: 'Podívejte se i na další pozice', otherSub: 'Průběžně máme volná místa i v dalších řemeslech.',
    otherCta: 'Hledáte práci v jiném řemesle?', otherCtaP: 'Vyplňte nezávazný formulář a ozveme se Vám co nejdříve.', otherCtaB: 'Vyplnit formulář',
    faqList: [
      ['Potřebuji živnost?', 'Ano, spolupráce probíhá formou živnosti (OSVČ). Pokud ji ještě nemáte, poradíme Vám a pomůžeme s jejím založením.'],
      ['Co je A1 a kdo ho vyřídí?', 'A1 je potvrzení o tom, kde platíte sociální odvody při práci v zahraničí. Vyřídíme ho kompletně za Vás.'],
      ['Pomůžete s Freistellung a daňovým číslem?', 'Ano. Zajistíme Freistellungsbescheinigung, německé daňové číslo (Steuernummer), aktivaci Elsteru i další administrativu.'],
      ['Kdy a jak dostanu zaplaceno?', 'Fakturuje se každých 14 dní a platby chodí včas. Konkrétní podmínky domluvíme při nástupu.'],
      ['Kdo řeší ubytování?', 'Pomáháme se zajištěním ubytování v blízkosti projektu. Detaily Vám potvrdíme u konkrétní nabídky.'],
      ['Musím umět německy?', 'Němčina je výhodou (lepší podmínky), ale na mnoha pozicích není nezbytná. Záleží na konkrétním projektu.'],
    ],
  },
  hu: {
    home: 'Főoldal', active: 'Aktív állás', seek: (n) => `${n} főt keresünk`,
    perHour: 'óránként', startOn: 'Kezdés:', back: 'Vissza az állásokhoz',
    country: { DE: 'Németország', AT: 'Ausztria', CH: 'Svájc', NL: 'Hollandia', BE: 'Belgium', LU: 'Luxemburg', SK: 'Szlovákia', CZ: 'Csehország' },
    tagAccom: 'Segítség a szállással', tagInvoice: 'Számlázás 14 naponta', tagPartners: 'Ellenőrzött német partnerek', tagRot: 'Turnus',
    about: 'A pozícióról', duties: 'Feladatok',
    descFb: (j) => `Tapasztalt szakembereket keresünk ${j.title} pozícióra, egy ${j.city} városban zajló projektre. Ellenőrzött német cégnek dolgozik egyéni vállalkozóként, 14 naponta számlázva.`,
    fHours: 'Munkaidő', hoursV: (n) => `${n}+ óra / hét`, hoursS: (n) => `${n}+ óra / hét`, fRot: 'Turnus', fAccom: 'Szállás', accYes: 'Biztosított', accNo: 'Nincs', fCountry: 'Ország', fRate: 'Óradíj', fStart: 'Kezdés',
    req: 'Elvárások', reqSub: 'Amit Öntől várunk', offer: 'Amit kínálunk', offerSub: 'Az együttműködés előnyei',
    calc: 'Keresetkalkulátor', calcSub: 'Tájékoztató bruttó kereset ezen a pozíción.', hoursW: 'Heti ledolgozott órák', weeks: 'Hetek száma', invoiced: 'Számlázott összeg', hUnit: 'óra',
    disclaimer: 'A számítás csak tájékoztató jellegű (bruttó számlázott összeg járulékok és költségek előtt). A pontos feltételeket visszaigazoljuk Önnek.', calcCta: 'Tájékoztató kereset',
    loc: 'Helyszín', route: 'Útvonaltervezés', faq: 'Gyakori kérdések',
    share: 'Állás megosztása', shareSub: 'Küldje el egy ismerősének, aki munkát keres.', copy: 'Link másolása',
    applyH: 'Érdekel az állás', applySub: '24 órán belül jelentkezünk. Önéletrajz nem kell.', now: 'Azonnal',
    name: 'Teljes név', namePh: 'Kovács János', phone: 'Telefon', phonePh: '+36 …', email: 'E-mail', emailPh: 'janos@email.hu',
    note: 'Megjegyzés (nem kötelező)', notePh: 'Pl. tapasztalat, mikor tud kezdeni…', consent: ['Hozzájárulok ', 'személyes adataim kezeléséhez', ''],
    send: 'Jelentkezés elküldése', sendM: 'Küldés', waM: 'Inkább WhatsAppon', noCv: 'önéletrajz nélkül',
    waText: (j, u) => `Jó napot, érdekel a(z) ${j.title} – ${j.city} állás. ${u}`,
    ok: 'Köszönjük!', okP: ['A(z) ', ' állásra beküldött jelentkezését megkaptuk. 24 órán belül jelentkezünk.'], nextH: 'A következő lépések',
    steps: ['Felhívjuk, és egyeztetjük a tapasztalatát.', 'Elküldjük a konkrét feltételeket.', 'Intézzük a papírokat, a szállást és a kezdést.'], backM: 'Vissza az álláshoz',
    other: 'Nézze meg a többi állást is', otherSub: 'Folyamatosan van szabad helyünk más szakmákban is.',
    otherCta: 'Más szakmában keres munkát?', otherCtaP: 'Töltse ki a kötetlen űrlapot, és hamarosan jelentkezünk.', otherCtaB: 'Űrlap kitöltése',
    faqList: [
      ['Szükségem van egyéni vállalkozásra?', 'Igen, az együttműködés egyéni vállalkozóként történik. Ha még nincs vállalkozása, tanácsot adunk és segítünk az indításában.'],
      ['Mi az A1, és ki intézi?', 'Az A1 igazolja, hol fizeti a társadalombiztosítási járulékot külföldi munkavégzés esetén. Teljes egészében elintézzük Ön helyett.'],
      ['Segítenek a Freistellunggal és az adószámmal?', 'Igen. Intézzük a Freistellungsbescheinigungot, a német adószámot (Steuernummer), az Elster aktiválását és az egyéb ügyintézést.'],
      ['Mikor és hogyan kapom meg a pénzt?', '14 naponta számlázunk, és a kifizetések pontosan érkeznek. A konkrét feltételeket a kezdéskor egyeztetjük.'],
      ['Ki intézi a szállást?', 'Segítünk szállást találni a projekt közelében. A részleteket az adott ajánlatnál visszaigazoljuk Önnek.'],
      ['Kell tudnom németül?', 'A német nyelvtudás előny (jobb feltételek), de sok pozíción nem feltétel. Az adott projekttől függ.'],
    ],
  },
  de: {
    home: 'Startseite', active: 'Aktives Angebot', seek: (n) => `wir suchen ${n} ${n === 1 ? 'Fachkraft' : 'Fachkräfte'}`,
    perHour: 'pro Stunde', startOn: 'Start:', back: 'Zurück zu den Jobs',
    country: { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', SK: 'Slowakei', CZ: 'Tschechien' },
    tagAccom: 'Hilfe bei der Unterkunft', tagInvoice: 'Abrechnung alle 14 Tage', tagPartners: 'Geprüfte Partner in Deutschland', tagRot: 'Turnus',
    about: 'Über die Stelle', duties: 'Aufgaben',
    descFb: (j) => `Wir suchen erfahrene Handwerker als ${j.title} für ein Projekt in ${j.city}. Sie arbeiten selbstständig für eine geprüfte deutsche Firma, abgerechnet wird alle 14 Tage.`,
    fHours: 'Arbeitszeit', hoursV: (n) => `${n}+ Std. / Woche`, hoursS: (n) => `${n}+ Std. / Wo.`, fRot: 'Turnus', fAccom: 'Unterkunft', accYes: 'Gestellt', accNo: 'Nein', fCountry: 'Land', fRate: 'Stundensatz', fStart: 'Start',
    req: 'Anforderungen', reqSub: 'Was wir von Ihnen erwarten', offer: 'Was wir bieten', offerSub: 'Ihre Vorteile',
    calc: 'Verdienstrechner', calcSub: 'Ungefährer Bruttoverdienst in dieser Position.', hoursW: 'Arbeitsstunden pro Woche', weeks: 'Anzahl Wochen', invoiced: 'Rechnungsbetrag', hUnit: 'Stunden',
    disclaimer: 'Die Berechnung ist nur ein Richtwert (Bruttorechnungsbetrag vor Abgaben und Kosten). Die genauen Konditionen bestätigen wir Ihnen.', calcCta: 'Verdienst berechnen',
    loc: 'Einsatzort', route: 'Route berechnen', faq: 'Häufige Fragen',
    share: 'Job teilen', shareSub: 'Senden Sie den Job an Bekannte, die Arbeit suchen.', copy: 'Link kopieren',
    applyH: 'Ich interessiere mich', applySub: 'Wir melden uns innerhalb von 24 Stunden. Kein Lebenslauf nötig.', now: 'Sofort',
    name: 'Vor- und Nachname', namePh: 'Max Mustermann', phone: 'Telefon', phonePh: '+49 …', email: 'E-Mail', emailPh: 'max@email.de',
    note: 'Anmerkung (optional)', notePh: 'z. B. Erfahrung, wann Sie anfangen können…', consent: ['Ich stimme der ', 'Verarbeitung meiner Daten', ' zu'],
    send: 'Bewerbung senden', sendM: 'Senden', waM: 'Lieber per WhatsApp', noCv: 'ohne Lebenslauf',
    waText: (j, u) => `Guten Tag, ich interessiere mich für den Job ${j.title} – ${j.city}. ${u}`,
    ok: 'Vielen Dank!', okP: ['Ihre Bewerbung für ', ' ist angekommen. Wir melden uns innerhalb von 24 Stunden.'], nextH: 'So geht es weiter',
    steps: ['Wir rufen Sie an und klären Ihre Erfahrung.', 'Wir senden Ihnen die konkreten Konditionen.', 'Wir kümmern uns um Papiere, Unterkunft und Start.'], backM: 'Zurück zum Job',
    other: 'Weitere Jobs ansehen', otherSub: 'Wir haben laufend freie Stellen auch in anderen Gewerken.',
    otherCta: 'Arbeit in einem anderen Gewerk gesucht?', otherCtaP: 'Füllen Sie das unverbindliche Formular aus – wir melden uns schnellstmöglich.', otherCtaB: 'Formular ausfüllen',
    faqList: [
      ['Brauche ich ein Gewerbe?', 'Ja, die Zusammenarbeit erfolgt auf selbstständiger Basis. Wenn Sie noch kein Gewerbe haben, beraten wir Sie und helfen bei der Anmeldung.'],
      ['Was ist A1 und wer kümmert sich darum?', 'A1 bescheinigt, in welchem Land Sie bei der Arbeit im Ausland sozialversichert sind. Wir erledigen das komplett für Sie.'],
      ['Helfen Sie bei Freistellung und Steuernummer?', 'Ja. Wir besorgen die Freistellungsbescheinigung, die deutsche Steuernummer, die Elster-Aktivierung und weitere Verwaltung.'],
      ['Wann und wie werde ich bezahlt?', 'Abgerechnet wird alle 14 Tage, die Zahlungen kommen pünktlich. Die genauen Konditionen vereinbaren wir zum Start.'],
      ['Wer kümmert sich um die Unterkunft?', 'Wir helfen bei der Unterkunft in der Nähe des Projekts. Details bestätigen wir Ihnen beim konkreten Angebot.'],
      ['Muss ich Deutsch können?', 'Deutsch ist ein Vorteil (bessere Konditionen), auf vielen Stellen aber nicht nötig. Das hängt vom Projekt ab.'],
    ],
  },
  en: {
    home: 'Home', active: 'Open position', seek: (n) => `hiring ${n} ${n === 1 ? 'person' : 'people'}`,
    perHour: 'per hour', startOn: 'Start:', back: 'Back to jobs',
    country: { DE: 'Germany', AT: 'Austria', CH: 'Switzerland', NL: 'Netherlands', BE: 'Belgium', LU: 'Luxembourg', SK: 'Slovakia', CZ: 'Czechia' },
    tagAccom: 'Help with accommodation', tagInvoice: 'Invoicing every 14 days', tagPartners: 'Vetted partners in Germany', tagRot: 'Rotation',
    about: 'About the job', duties: 'Duties',
    descFb: (j) => `We’re looking for experienced tradespeople (${j.title}) for a project in ${j.city}. You’ll work for a vetted German company on a self-employed basis, invoicing every 14 days.`,
    fHours: 'Hours', hoursV: (n) => `${n}+ h / week`, hoursS: (n) => `${n}+ h / wk`, fRot: 'Rotation', fAccom: 'Accommodation', accYes: 'Provided', accNo: 'No', fCountry: 'Country', fRate: 'Rate', fStart: 'Start',
    req: 'Requirements', reqSub: 'What we expect from you', offer: 'What we offer', offerSub: 'Why work with us',
    calc: 'Earnings calculator', calcSub: 'Approximate gross earnings for this job.', hoursW: 'Hours worked per week', weeks: 'Number of weeks', invoiced: 'Invoiced amount', hUnit: 'hours',
    disclaimer: 'This is an estimate only (gross invoiced amount before contributions and costs). We’ll confirm the exact terms with you.', calcCta: 'Estimate your earnings',
    loc: 'Location', route: 'Get directions', faq: 'Frequently asked questions',
    share: 'Share this job', shareSub: 'Send it to someone who’s looking for work.', copy: 'Copy link',
    applyH: 'I’m interested', applySub: 'We’ll get back to you within 24 hours. No CV needed.', now: 'Now',
    name: 'Full name', namePh: 'John Smith', phone: 'Phone', phonePh: '+421 …', email: 'Email', emailPh: 'john@email.com',
    note: 'Note (optional)', notePh: 'e.g. experience, when you can start…', consent: ['I agree to the ', 'processing of my personal data', ''],
    send: 'Send application', sendM: 'Send', waM: 'Prefer WhatsApp', noCv: 'no CV',
    waText: (j, u) => `Hello, I’m interested in the job ${j.title} – ${j.city}. ${u}`,
    ok: 'Thank you!', okP: ['We’ve received your application for ', '. We’ll get back to you within 24 hours.'], nextH: 'What happens next',
    steps: ['We’ll call you to check your experience.', 'We’ll send you the exact terms.', 'We sort out paperwork, housing and your start.'], backM: 'Back to the job',
    other: 'See other positions', otherSub: 'We regularly have openings in other trades too.',
    otherCta: 'Looking for work in another trade?', otherCtaP: 'Fill in the no-obligation form and we’ll get back to you soon.', otherCtaB: 'Fill in the form',
    faqList: [
      ['Do I need to be self-employed?', 'Yes, we work with self-employed tradespeople. If you’re not registered yet, we’ll advise you and help you set it up.'],
      ['What is A1 and who arranges it?', 'A1 is a certificate showing where you pay social security while working abroad. We arrange it completely for you.'],
      ['Do you help with Freistellung and a tax number?', 'Yes. We arrange the Freistellungsbescheinigung, your German tax number (Steuernummer), Elster activation and other paperwork.'],
      ['When and how do I get paid?', 'Invoices go out every 14 days and payments arrive on time. We agree the exact terms when you start.'],
      ['Who sorts out accommodation?', 'We help arrange housing close to the project. We’ll confirm the details for each specific job.'],
      ['Do I need to speak German?', 'German is an advantage (better terms), but it isn’t required for many positions. It depends on the project.'],
    ],
  },
};

const PIN = '<span aria-hidden="true">📍</span> ';
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const paras = (s) => String(s || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const itemText = (x) => (x && typeof x === 'object' ? { h: x.title || x.t || x.q || '', p: x.text || x.d || x.a || '' } : { h: String(x || ''), p: '' });
const nb = (s) => String(s).replace(/ /g, '\u00a0');

/** Dátum nástupu: sk „3. 11. 2099", de „03.11.2099"… */
function fullDate(d, lang) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const o = lang === 'de' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : lang === 'en' ? { day: 'numeric', month: 'short', year: 'numeric' } : {};
  return dt.toLocaleDateString(LOCALE[lang], o);
}
/** Krátky dátum: sk „3. 11.", hu „11. 03.", de „3.11.", en „3 Nov". */
const shortDate = (d, lang) => new Date(d).toLocaleDateString(LOCALE[lang], lang === 'en' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'numeric' });

module.exports = async function render(ctx) {
  const lang = ctx.lang, t = T[lang], c = C[lang];
  const jobs = await ctx.jobs();
  const job = jobs.find((j) => j.slug === (ctx.params || {}).slug);
  if (!job) return null;

  const r = rate(job);
  const country = t.country[job.country] || job.country;
  const where = [job.city, country].filter(Boolean).join(', ');
  const url = ctx.abs('job', { slug: job.slug });
  const startTxt = job.startNow || !job.startDate ? c.now : `${t.startOn} ${fullDate(job.startDate, lang)}`;
  const startBadge = job.startNow || !job.startDate ? t.now : shortDate(job.startDate, lang);
  const desc = job.description || t.descFb(job);
  const faq = (job.faq && job.faq.length ? job.faq.map((x) => [x.q, x.a]) : t.faqList).filter((x) => x[0] && x[1]);
  const hours = clamp(job.hoursWeek || 50, 20, 70), weeks = 4;
  const sum = (h, w) => `${num(h * w * job.rateMin, lang)} – ${num(h * w * (job.rateMax != null ? job.rateMax : job.rateMin), lang)}\u00a0€`;
  const calcOn = job.rateMin != null;
  const others = jobs.filter((j) => j !== job).sort((a, b) => (a.prof === job.prof ? 1 : 0) - (b.prof === job.prof ? 1 : 0)).slice(0, 3);
  const waHref = `https://wa.me/${WA}?text=${encodeURIComponent(t.waText(job, url))}`;
  const privacy = ctx.url('privacy');
  const routeHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;

  // ── Fakty ──────────────────────────────────────────────────────────────
  const facts = [
    job.hoursWeek ? [t.fHours, t.hoursV(job.hoursWeek)] : null,
    job.rotation ? [t.fRot, job.rotation.replace(/\s*\+\s*/g, ' + ')] : null,
    [t.fAccom, job.accommodation ? t.accYes : t.accNo],
    country ? [t.fCountry, country] : null,
  ].filter(Boolean);
  const mfacts = [
    r ? [t.fRate, r, true] : null,
    [t.fStart, startBadge],
    job.hoursWeek ? [t.fHours, t.hoursS(job.hoursWeek)] : null,
    [t.fAccom, job.accommodation ? t.accYes : t.accNo],
  ].filter(Boolean);
  const tags = [
    [c.trade, 1], [startTxt, 1],
    job.duration ? [job.duration] : null,
    job.rotation ? [`${t.tagRot} ${job.rotation}`] : null,
    job.accommodation ? [t.tagAccom] : null,
    [t.tagInvoice], [t.tagPartners],
  ].filter(Boolean);

  // ── Formulár (desktop a výsuvný panel) ─────────────────────────────────
  const consent = `<label class="check"><input type="checkbox" name="consent" required><span>${esc(t.consent[0])}<a href="${esc(privacy)}" target="_blank" rel="noopener">${esc(t.consent[1])}</a>${esc(t.consent[2])} *</span></label>`;
  const hidden = `<input type="hidden" name="job" value="${esc(job.slug)}"><div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>`;
  const okTpl = (mobile) => `<template data-ok><div class="jd-ok"><span class="jd-ok-ico" aria-hidden="true">✓</span><strong class="jd-ok-h">${esc(t.ok)}</strong>
    <p>${esc(t.okP[0])}<b>${esc(job.title)} – ${esc(job.city)}</b>${esc(t.okP[1])}</p>
    <div class="jd-steps"><span class="jd-steps-h">${esc(t.nextH)}</span><ol>${each(t.steps, (s) => `<li>${esc(s)}</li>`)}</ol></div>
    ${mobile ? `<button type="button" class="btn btn-dark btn-block" data-sheet-close>${esc(t.backM)}</button>` : ''}</div></template>`;
  const field = (name, label, type, ph, req) => `<label class="jd-field"><span>${esc(label)}${req ? ' *' : ''}</span><input type="${type}" name="${name}" placeholder="${esc(ph)}"${req ? ' required' : ''}${type === 'tel' ? ' autocomplete="tel" inputmode="tel"' : type === 'email' ? ' autocomplete="email"' : name === 'name' ? ' autocomplete="name"' : ''}></label>`;

  const ld = job.demo ? '' : `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting',
    title: job.title, description: desc,
    ...(job.publishedAt ? { datePosted: String(job.publishedAt).slice(0, 10) } : {}),
    employmentType: 'CONTRACTOR',
    hiringOrganization: { '@type': 'Organization', name: 'Partner und Service s. r. o.', sameAs: 'https://punds.sk' },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city, addressCountry: job.country } },
    ...(job.rateMin != null ? { baseSalary: { '@type': 'MonetaryAmount', currency: 'EUR', value: { '@type': 'QuantitativeValue', unitText: 'HOUR', minValue: job.rateMin, maxValue: job.rateMax != null ? job.rateMax : job.rateMin } } } : {}),
    image: job.image, url,
  }).replace(/</g, '\\u003c')}</script>`;

  const otherCard = (j) => `<a class="jo lift rv" href="${esc(ctx.url('job', { slug: j.slug }))}">
    <span class="jo-img"><img src="${esc(j.image)}" alt="" loading="lazy" width="400" height="300">${rate(j) ? `<span class="jo-rate">${esc(rate(j))}</span>` : ''}</span>
    <span class="jo-txt"><strong>${esc(j.title)}${j.demo ? ` <span class="demo-tag">${esc(c.demo)}</span>` : ''}</strong><span>${esc(j.city)} · ${esc(j.startNow || !j.startDate ? c.now : `${t.startOn} ${fullDate(j.startDate, lang)}`)}</span></span></a>`;

  const body = `<div class="jd">
<section class="wrap jd-top">
  <nav class="crumbs jd-crumbs" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><a href="${esc(ctx.url('jobs'))}">${esc(c.nav.jobs)}</a><span aria-hidden="true">/</span><span class="crumb-cur" aria-current="page">${esc(job.title)}</span></nav>
  <div class="jd-hero rv-in">
    <img src="${esc(job.image)}" alt="" width="1184" height="400" fetchpriority="high">
    <a class="jd-back" href="${esc(ctx.url('jobs'))}" aria-label="${esc(t.back)}">←</a>
    <div class="jd-hero-in">
      <span class="jd-status"><span class="jd-dot" aria-hidden="true"></span><span>${esc(t.active)}${job.headcount ? `<span class="jd-seek"> · ${esc(t.seek(job.headcount))}</span>` : ''}</span></span>
      <div class="jd-hero-row">
        <div class="jd-hero-t"><h1 class="jd-h1">${esc(job.title)}</h1><span class="jd-where">${PIN}${esc(where)}</span>${job.demo ? `<span class="demo-tag">${esc(c.demo)}</span>` : ''}</div>
        ${r ? `<div class="jd-rate"><strong>${esc(r)}</strong><span>${esc(t.perHour)}</span></div>` : ''}
      </div>
    </div>
  </div>
  <div class="jd-tags">${each(tags, ([x, dark]) => `<span class="${cls('jd-tag', dark && 'dark')}">${esc(x)}</span>`)}</div>
  <div class="jd-mfacts">${each(mfacts, ([k, v, dark]) => `<div class="${cls('jd-mf', dark && 'dark')}"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)}</div>
</section>

<div class="wrap jd-grid">
  <div class="jd-main">
    <section class="jd-card rv">
      <h2 class="jd-h2">${esc(t.about)}</h2>
      <div class="jd-desc">${paras(desc)}</div>
      ${job.duties.length ? `<div class="jd-duties"><span class="jd-eyebrow">${esc(t.duties)}</span>${each(job.duties, (d) => `<div class="jd-duty"><span aria-hidden="true"></span>${esc(itemText(d).h)}</div>`)}</div>` : ''}
    </section>
    ${facts.length ? `<div class="jd-facts jd-facts-${facts.length}">${each(facts, ([k, v]) => `<div class="jd-fact rv"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)}</div>` : ''}
    ${job.requirements.length || job.benefits.length ? `<div class="${cls('jd-two', !(job.requirements.length && job.benefits.length) && 'one')}">
      ${job.requirements.length ? `<section class="jd-card rv"><div class="jd-hgroup"><h2 class="jd-h2">${esc(t.req)}</h2><span>${esc(t.reqSub)}</span></div>
        ${each(job.requirements, (x) => `<div class="jd-li"><span class="jd-chk" aria-hidden="true">✓</span>${esc(itemText(x).h)}</div>`)}</section>` : ''}
      ${job.benefits.length ? `<section class="jd-card rv"><div class="jd-hgroup"><h2 class="jd-h2">${esc(t.offer)}</h2><span>${esc(t.offerSub)}</span></div>
        ${each(job.benefits, (x) => { const b = itemText(x); return `<div class="jd-li jd-ben"><span class="jd-chk or" aria-hidden="true">✓</span><span><strong>${esc(b.h)}</strong>${b.p ? `<span>${esc(b.p)}</span>` : ''}</span></div>`; })}</section>` : ''}
    </div>` : ''}
    ${calcOn ? `<section class="jd-calc rv" id="calc" data-calc data-rmin="${job.rateMin}" data-rmax="${job.rateMax != null ? job.rateMax : job.rateMin}" data-unit="${esc(t.hUnit)}" data-rate="${esc(r)}">
      <div class="jd-calc-l">
        <div class="jd-hgroup"><h2 class="jd-h2">${esc(t.calc)}</h2><span>${esc(t.calcSub)}</span></div>
        <label class="jd-sl"><span class="jd-sl-row"><span>${esc(t.hoursW)}</span><strong data-out="h">${hours} h</strong></span><input type="range" min="20" max="70" step="1" value="${hours}" data-in="h"></label>
        <label class="jd-sl"><span class="jd-sl-row"><span>${esc(t.weeks)}</span><strong data-out="w">${weeks}</strong></span><input type="range" min="1" max="52" step="1" value="${weeks}" data-in="w"></label>
      </div>
      <div class="jd-calc-r" aria-live="polite">
        <span>${esc(t.invoiced)}</span><strong data-out="sum">${esc(sum(hours, weeks))}</strong>
        <span data-out="tot">${esc(nb(num(hours * weeks, lang)))} ${esc(t.hUnit)} × ${esc(r)}</span>
        <p>${esc(t.disclaimer)}</p>
      </div>
    </section>` : ''}
    <section class="jd-card rv">
      <div class="jd-loc-h"><div class="jd-hgroup"><h2 class="jd-h2">${esc(t.loc)}</h2><span>${esc(where)}</span></div><a class="jd-route" href="${esc(routeHref)}" target="_blank" rel="noopener">${esc(t.route)} →</a></div>
      <a class="jd-locvis" href="${esc(routeHref)}" target="_blank" rel="noopener" aria-label="${esc(t.route)}: ${esc(where)}">
        <span class="jd-mk"><span class="jd-mk-pill">${esc(job.city)}<span>${esc(country)}</span></span><span class="jd-mk-stem"></span><span class="jd-mk-dot"></span></span>
      </a>
    </section>
    ${faq.length ? `<section class="jd-card rv"><h2 class="jd-h2">${esc(t.faq)}</h2>
      <div class="jd-faq" data-acc-group>${each(faq, ([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}<span class="jd-plus" aria-hidden="true">+</span></summary><p>${esc(a)}</p></details>`)}</div></section>` : ''}
    <section class="jd-card jd-share rv">
      <div class="jd-hgroup"><h2 class="jd-h2 sm">${esc(t.share)}</h2><span>${esc(t.shareSub)}</span></div>
      <div class="jd-share-b">
        <a class="jd-sb fb" data-share="fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
        <a class="jd-sb wa" data-share="wa" data-text="${esc(job.title)} – ${esc(job.city)}" href="https://wa.me/?text=${encodeURIComponent(`${job.title} – ${job.city} ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="jd-sb cp" data-copy=""><span data-copy-label>${esc(t.copy)}</span></button>
      </div>
    </section>
  </div>

  <aside class="jd-aside">
    <div class="jd-apply">
      <form class="form jd-form" data-form="apply">
        <div class="jd-apply-h"><div><strong>${esc(t.applyH)}</strong><span>${esc(t.applySub)}</span></div><span class="jd-badge">${esc(t.fStart)}<strong>${esc(startBadge)}</strong></span></div>
        ${field('name', t.name, 'text', t.namePh, true)}
        ${field('phone', t.phone, 'tel', t.phonePh, true)}
        ${field('email', t.email, 'email', t.emailPh, true)}
        <label class="jd-field"><span>${esc(t.note)}</span><textarea name="note" rows="2" placeholder="${esc(t.notePh)}"></textarea></label>
        ${consent}${hidden}
        <div class="form-msg" role="alert"></div>
        <button type="submit" class="btn btn-primary btn-block">${esc(t.send)} →</button>
        ${okTpl(false)}
      </form>
      <div class="jd-alt"><a class="btn btn-wa btn-sm" href="${esc(waHref)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-ghost btn-sm" href="${tel(PHONE)}">${esc(c.call)}</a></div>
    </div>
    ${calcOn ? `<a class="jd-calc-cta" href="#calc"><span>${esc(t.calcCta)}</span><span class="or" data-out="sum">${esc(sum(hours, weeks))}</span></a>` : ''}
  </aside>
</div>

${others.length ? `<section class="wrap jd-others">
  <div class="sec-head"><div class="jd-hgroup"><h2 class="jd-h2 lg">${esc(t.other)}</h2><span>${esc(t.otherSub)}</span></div><a class="link-u" href="${esc(ctx.url('jobs'))}">${esc(c.mega.all)} →</a></div>
  <div class="jo-grid">${each(others, otherCard)}
    <div class="jo-cta rv"><div><strong>${esc(t.otherCta)}</strong><span>${esc(t.otherCtaP)}</span></div><a class="btn btn-dark btn-sm" href="${esc(ctx.url('contact'))}#form">${esc(t.otherCtaB)} →</a></div>
  </div>
</section>` : ''}

<div class="mcta jd-bar">
  ${r ? `<div class="jd-bar-r"><strong>${esc(r)}</strong><span>${esc(t.perHour)}</span></div>` : ''}
  <button type="button" class="btn btn-primary" data-sheet-open="apply-sheet">${esc(c.cta)} →</button>
</div>
<div class="sheet-wrap" id="apply-sheet" hidden>
  <div class="sheet-back"></div>
  <div class="sheet jd-sheet" role="dialog" aria-modal="true" aria-labelledby="as-title">
    <div class="sheet-grab"></div>
    <form class="form jd-mform" data-form="apply">
      <div class="jd-mform-h"><strong id="as-title">${esc(c.cta)}</strong><span>${esc(job.title)} · ${esc(job.city)} · ${esc(t.noCv)}</span></div>
      <input type="text" name="name" placeholder="${esc(t.name)} *" aria-label="${esc(t.name)}" autocomplete="name" required>
      <input type="tel" name="phone" placeholder="${esc(t.phone)} *" aria-label="${esc(t.phone)}" autocomplete="tel" inputmode="tel" required>
      ${consent}${hidden}
      <div class="form-msg" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-block">${esc(t.sendM)} →</button>
      <a class="btn btn-wa btn-block" href="${esc(waHref)}" target="_blank" rel="noopener">${esc(t.waM)}</a>
      ${okTpl(true)}
    </form>
  </div>
</div>
</div>`;

  const short = desc.replace(/\s+/g, ' ').trim();
  return {
    title: `${job.title} – ${job.city}${r ? `, ${r} ${c.perH}` : ''} | punds`,
    description: short.length > 160 ? `${short.slice(0, 157).replace(/\s+\S*$/, '')}…` : short,
    body, nav: 'jobs', image: job.image, head: ld,
    css: ['css/sk-jobs.css'], js: ['js/sk-job.js'],
    bodyClass: 'has-mcta',
  };
};
