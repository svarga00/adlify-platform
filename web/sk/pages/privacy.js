// ============================================================================
// punds.sk — Ochrana osobných údajov (návrh 2h)
// ============================================================================
// Text je NÁVRH — pred spustením ho musí skontrolovať právnik. Na skúšobnej
// adrese sa ukazuje upozornenie a zvýraznené miesta, ktoré treba potvrdiť
// (lehoty uchovávania). Naostro sa zvýraznenie neukazuje.
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { PHONE, MAIL, tel } = require('../common');

const CO = 'Partner und Service s. r. o.';
const ADDR = 'Podzámska 9468/4A, 940 71 Nové Zámky';
const mail = `<a class="b or" href="mailto:${MAIL}">${MAIL}</a>`;
const phone = `<a class="b" href="${tel(PHONE)}">${PHONE}</a>`;
const UOOU = '<a class="b" href="https://dataprotection.gov.sk/" target="_blank" rel="noopener">dataprotection.gov.sk</a>';

/**
 * Texty. Sekcia = [nadpis, html]. `m(x)` zvýrazní miesto na overenie (len skúšobne),
 * `L(route, text)` = odkaz na stránku webu.
 */
const T = {
  sk: (m, L) => ({
    title: 'Ochrana osobných údajov | punds', desc: 'Ako Partner und Service s. r. o. spracúva osobné údaje remeselníkov a návštevníkov webu punds.sk: aké údaje, na aký účel, ako dlho a aké máte práva.',
    home: 'Domov', crumb: 'Ochrana osobných údajov', h1: 'Ochrana osobných údajov', updated: 'Posledná aktualizácia: október 2026', read: 'Čítanie na 4 minúty', toc: 'Obsah',
    ask: 'Otázky k ochrane údajov:', cookiesBtn: 'Zásady cookies',
    s: [
      ['Prevádzkovateľ', `Prevádzkovateľom osobných údajov je spoločnosť ${CO}, so sídlom ${ADDR}, IČO 57553921, DIČ 2122816839, IČ DPH SK2122816839, zapísaná v Obchodnom registri Okresného súdu Nitra, oddiel Sro, vložka č. 69265/N. Kontakt: ${mail}, ${phone}.`],
      ['Aké údaje spracúvame', 'Meno a priezvisko, telefónne číslo, e-mail, profesiu, prax, certifikáty a ďalšie údaje, ktoré nám sami poskytnete vo formulári, e-mailom, cez WhatsApp alebo telefonicky. Ak spolu začneme spolupracovať, aj údaje potrebné na zmluvu, fakturáciu a vybavenie dokladov (napríklad údaje zo živnostenského oprávnenia a bankové spojenie).'],
      ['Na aký účel', 'Na sprostredkovanie spolupráce s firmami v Nemecku a Rakúsku, na odpoveď na Vašu správu alebo prihlášku, na prípravu a plnenie zmluvy vrátane dokladov potrebných na prácu v zahraničí, na plnenie zákonných povinností (napríklad účtovných a daňových) a na ochranu webu pred zneužitím.'],
      ['Právny základ', 'Spracúvame ich podľa čl. 6 ods. 1 nariadenia GDPR: opatrenia pred uzavretím zmluvy a plnenie zmluvy (písm. b) pri prihláške a spolupráci, Váš súhlas (písm. a) pri uchovaní kontaktu pre budúce ponuky, plnenie zákonných povinností (písm. c) a náš oprávnený záujem (písm. f) pri bezpečnosti webu a ochrane našich nárokov.'],
      ['Ako dlho údaje uchovávame', `Údaje z prihlášky alebo správy uchovávame počas výberu a komunikácie s Vami. Ak súhlasíte so zasielaním ďalších ponúk, najdlhšie ${m('3 roky')} od posledného kontaktu alebo do odvolania súhlasu. Zmluvy a účtovné doklady uchovávame tak dlho, ako vyžaduje zákon (napríklad ${m('10 rokov')} podľa zákona o účtovníctve).`],
      ['Komu údaje poskytujeme', 'Partnerským firmám, pre ktoré budete pracovať, a to len v potrebnom rozsahu; poskytovateľom IT služieb, ktorí pre nás prevádzkujú web a databázu (ako zmluvne viazaní sprostredkovatelia); nášmu účtovníkovi a orgánom verejnej moci, ak to vyžaduje zákon. Údaje nepredávame. Ak by sa údaje prenášali mimo Európskeho hospodárskeho priestoru, len s primeranými zárukami (napríklad štandardnými zmluvnými doložkami).'],
      ['Vaše práva', `Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať. Súhlas môžete kedykoľvek odvolať; nemá to vplyv na zákonnosť spracúvania pred odvolaním. Svoje práva uplatníte na ${mail}. Sťažnosť môžete podať na Úrad na ochranu osobných údajov SR, Hraničná 12, 820 07 Bratislava (${UOOU}).`],
      ['Cookies', `Web nepoužíva analytické ani reklamné cookies a nesleduje Vás. Podrobnosti nájdete na stránke ${L('cookies', 'Cookies')}.`],
    ],
  }),
  cz: (m, L) => ({
    title: 'Ochrana osobních údajů | punds', desc: 'Jak Partner und Service s. r. o. zpracovává osobní údaje řemeslníků a návštěvníků webu punds.sk: jaké údaje, k jakému účelu, jak dlouho a jaká máte práva.',
    home: 'Domů', crumb: 'Ochrana osobních údajů', h1: 'Ochrana osobních údajů', updated: 'Poslední aktualizace: říjen 2026', read: 'Čtení na 4 minuty', toc: 'Obsah',
    ask: 'Dotazy k ochraně údajů:', cookiesBtn: 'Zásady cookies',
    s: [
      ['Správce', `Správcem osobních údajů je společnost ${CO}, se sídlem ${ADDR}, Slovensko, IČO 57553921, DIČ 2122816839, IČ DPH SK2122816839, zapsaná v obchodním rejstříku Okresního soudu Nitra, oddíl Sro, vložka č. 69265/N. Kontakt: ${mail}, ${phone}.`],
      ['Jaké údaje zpracováváme', 'Jméno a příjmení, telefonní číslo, e-mail, profesi, praxi, certifikáty a další údaje, které nám sami poskytnete ve formuláři, e-mailem, přes WhatsApp nebo telefonicky. Pokud spolu začneme spolupracovat, také údaje potřebné ke smlouvě, fakturaci a vyřízení dokladů (například údaje z živnostenského oprávnění a bankovní spojení).'],
      ['K jakému účelu', 'Ke zprostředkování spolupráce s firmami v Německu a Rakousku, k odpovědi na Vaši zprávu nebo přihlášku, k přípravě a plnění smlouvy včetně dokladů potřebných pro práci v zahraničí, k plnění zákonných povinností (například účetních a daňových) a k ochraně webu před zneužitím.'],
      ['Právní základ', 'Zpracováváme je podle čl. 6 odst. 1 nařízení GDPR: opatření před uzavřením smlouvy a plnění smlouvy (písm. b) u přihlášky a spolupráce, Váš souhlas (písm. a) u uchování kontaktu pro budoucí nabídky, plnění zákonných povinností (písm. c) a náš oprávněný zájem (písm. f) u bezpečnosti webu a ochrany našich nároků.'],
      ['Jak dlouho údaje uchováváme', `Údaje z přihlášky nebo zprávy uchováváme po dobu výběru a komunikace s Vámi. Pokud souhlasíte se zasíláním dalších nabídek, nejdéle ${m('3 roky')} od posledního kontaktu nebo do odvolání souhlasu. Smlouvy a účetní doklady uchováváme tak dlouho, jak vyžaduje zákon (například ${m('10 let')} podle slovenského zákona o účetnictví).`],
      ['Komu údaje poskytujeme', 'Partnerským firmám, pro které budete pracovat, a to jen v nezbytném rozsahu; poskytovatelům IT služeb, kteří pro nás provozují web a databázi (jako smluvně vázaní zpracovatelé); naší účetní a orgánům veřejné moci, pokud to vyžaduje zákon. Údaje neprodáváme. Pokud by se údaje předávaly mimo Evropský hospodářský prostor, pak jen s odpovídajícími zárukami (například standardními smluvními doložkami).'],
      ['Vaše práva', `Máte právo na přístup k údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost a právo vznést námitku. Souhlas můžete kdykoli odvolat; nemá to vliv na zákonnost zpracování před odvoláním. Svá práva uplatníte na ${mail}. Stížnost můžete podat u slovenského Úřadu na ochranu osobních údajů SR, Hraničná 12, 820 07 Bratislava (${UOOU}), nebo u dozorového úřadu ve státě Vašeho bydliště.`],
      ['Cookies', `Web nepoužívá analytické ani reklamní cookies a nesleduje Vás. Podrobnosti najdete na stránce ${L('cookies', 'Cookies')}.`],
    ],
  }),
  hu: (m, L) => ({
    title: 'Adatvédelem | punds', desc: 'Hogyan kezeli a Partner und Service s. r. o. a szakemberek és a punds.sk látogatóinak személyes adatait: milyen adatokat, milyen célból, meddig, és milyen jogai vannak.',
    home: 'Kezdőlap', crumb: 'Adatvédelem', h1: 'Adatvédelmi tájékoztató', updated: 'Utolsó frissítés: 2026. október', read: '4 perc olvasás', toc: 'Tartalom',
    ask: 'Adatvédelmi kérdések:', cookiesBtn: 'Cookie-szabályzat',
    s: [
      ['Adatkezelő', `Az adatkezelő a ${CO} (székhely: ${ADDR}, Szlovákia; cégazonosító: 57553921; adószám: 2122816839; közösségi adószám: SK2122816839; bejegyezve a Nyitrai Járásbíróság cégjegyzékében, Sro szakasz, 69265/N betétszám). Elérhetőség: ${mail}, ${phone}.`],
      ['Milyen adatokat kezelünk', 'Név, telefonszám, e-mail-cím, szakma, szakmai gyakorlat, tanúsítványok és minden más adat, amelyet Ön az űrlapon, e-mailben, WhatsAppon vagy telefonon megad. Együttműködés esetén a szerződéshez, a számlázáshoz és az iratok intézéséhez szükséges adatok is (például a vállalkozói engedély adatai és a bankszámlaszám).'],
      ['Milyen célból', 'Németországi és ausztriai cégekkel való együttműködés közvetítésére, az Ön üzenetének vagy jelentkezésének megválaszolására, a szerződés előkészítésére és teljesítésére – a külföldi munkához szükséges iratokkal együtt –, a jogi kötelezettségek (például számviteli és adózási) teljesítésére, valamint a weboldal visszaélések elleni védelmére.'],
      ['Jogalap', 'A GDPR 6. cikk (1) bekezdése alapján: szerződéskötést megelőző lépések és a szerződés teljesítése (b) pont) a jelentkezésnél és az együttműködésnél, az Ön hozzájárulása (a) pont) az elérhetőség jövőbeli ajánlatok céljából történő megőrzésénél, jogi kötelezettség teljesítése (c) pont), valamint jogos érdekünk (f) pont) a weboldal biztonsága és igényeink védelme érdekében.'],
      ['Meddig őrizzük az adatokat', `A jelentkezés vagy az üzenet adatait a kiválasztás és a kapcsolattartás idejére őrizzük. Ha hozzájárul további ajánlatok küldéséhez, legfeljebb ${m('3 évig')} az utolsó kapcsolatfelvételtől, illetve a hozzájárulás visszavonásáig. A szerződéseket és a számviteli bizonylatokat a jogszabályban előírt ideig őrizzük (például a szlovák számviteli törvény szerint ${m('10 évig')}).`],
      ['Kinek adjuk át az adatokat', 'Azoknak a partnercégeknek, amelyeknek dolgozni fog, csak a szükséges mértékben; a weboldalt és az adatbázist üzemeltető informatikai szolgáltatóknak (szerződéssel kötelezett adatfeldolgozóként); a könyvelőnknek, valamint hatóságoknak, ha jogszabály előírja. Adatokat nem értékesítünk. Az Európai Gazdasági Térségen kívülre csak megfelelő garanciákkal (például általános szerződési feltételekkel) továbbíthatók.'],
      ['Az Ön jogai', `Önnek joga van az adataihoz való hozzáféréshez, azok helyesbítéséhez, törléséhez, a kezelés korlátozásához, az adathordozhatósághoz és a tiltakozáshoz. Hozzájárulását bármikor visszavonhatja; ez nem érinti a visszavonás előtti adatkezelés jogszerűségét. Jogait a(z) ${mail} címen gyakorolhatja. Panaszt tehet a szlovák adatvédelmi hatóságnál (Úrad na ochranu osobných údajov SR, Hraničná 12, 820 07 Pozsony, ${UOOU}) vagy a lakóhelye szerinti felügyeleti hatóságnál.`],
      ['Cookie-k', `A weboldal nem használ elemző vagy hirdetési cookie-kat, és nem követi Önt. Részletek a ${L('cookies', 'Cookie-k')} oldalon.`],
    ],
  }),
  de: (m, L) => ({
    title: 'Datenschutz | punds', desc: 'Wie die Partner und Service s. r. o. personenbezogene Daten von Handwerkern und Besuchern von punds.sk verarbeitet: welche Daten, wozu, wie lange und welche Rechte Sie haben.',
    home: 'Start', crumb: 'Datenschutz', h1: 'Datenschutzerklärung', updated: 'Zuletzt aktualisiert: Oktober 2026', read: '4 Minuten Lesezeit', toc: 'Inhalt',
    ask: 'Fragen zum Datenschutz:', cookiesBtn: 'Cookie-Hinweise',
    s: [
      ['Verantwortlicher', `Verantwortlich für die Verarbeitung ist die ${CO}, Sitz: ${ADDR}, Slowakei, IČO 57553921, DIČ 2122816839, USt-IdNr. SK2122816839, eingetragen im Handelsregister des Bezirksgerichts Nitra, Abteilung Sro, Einlage Nr. 69265/N. Kontakt: ${mail}, ${phone}.`],
      ['Welche Daten wir verarbeiten', 'Vor- und Nachname, Telefonnummer, E-Mail-Adresse, Beruf, Berufserfahrung, Zertifikate und weitere Angaben, die Sie uns selbst im Formular, per E-Mail, über WhatsApp oder telefonisch mitteilen. Bei einer Zusammenarbeit außerdem die für Vertrag, Abrechnung und Dokumente nötigen Daten (zum Beispiel Angaben zum Gewerbe und Bankverbindung).'],
      ['Zu welchem Zweck', 'Zur Vermittlung der Zusammenarbeit mit Firmen in Deutschland und Österreich, zur Beantwortung Ihrer Nachricht oder Bewerbung, zur Vorbereitung und Erfüllung des Vertrags einschließlich der Dokumente für die Arbeit im Ausland, zur Erfüllung gesetzlicher Pflichten (etwa buchhalterischer und steuerlicher) und zum Schutz der Website vor Missbrauch.'],
      ['Rechtsgrundlage', 'Art. 6 Abs. 1 DSGVO: vorvertragliche Maßnahmen und Vertragserfüllung (lit. b) bei Bewerbung und Zusammenarbeit, Ihre Einwilligung (lit. a) bei der Aufbewahrung Ihres Kontakts für künftige Angebote, Erfüllung rechtlicher Pflichten (lit. c) sowie unser berechtigtes Interesse (lit. f) an der Sicherheit der Website und der Wahrung unserer Ansprüche.'],
      ['Wie lange wir Daten speichern', `Daten aus Bewerbung oder Nachricht speichern wir für die Dauer der Auswahl und der Kommunikation mit Ihnen. Wenn Sie weiteren Angeboten zustimmen, höchstens ${m('3 Jahre')} nach dem letzten Kontakt oder bis zum Widerruf. Verträge und Buchungsbelege bewahren wir so lange auf, wie es das Gesetz verlangt (zum Beispiel ${m('10 Jahre')} nach dem slowakischen Rechnungslegungsgesetz).`],
      ['An wen wir Daten weitergeben', 'An Partnerfirmen, für die Sie arbeiten werden, nur im erforderlichen Umfang; an IT-Dienstleister, die für uns Website und Datenbank betreiben (als vertraglich gebundene Auftragsverarbeiter); an unsere Buchhaltung sowie an Behörden, wenn das Gesetz es verlangt. Wir verkaufen keine Daten. Eine Übermittlung außerhalb des Europäischen Wirtschaftsraums erfolgt nur mit geeigneten Garantien (zum Beispiel Standardvertragsklauseln).'],
      ['Ihre Rechte', `Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Eine Einwilligung können Sie jederzeit widerrufen; die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt unberührt. Wenden Sie sich dazu an ${mail}. Sie können sich bei der slowakischen Datenschutzbehörde (Úrad na ochranu osobných údajov SR, Hraničná 12, 820 07 Bratislava, ${UOOU}) oder bei der Aufsichtsbehörde Ihres Wohnorts beschweren.`],
      ['Cookies', `Die Website verwendet keine Analyse- oder Werbe-Cookies und verfolgt Sie nicht. Details finden Sie unter ${L('cookies', 'Cookies')}.`],
    ],
  }),
  en: (m, L) => ({
    title: 'Privacy policy | punds', desc: 'How Partner und Service s. r. o. processes the personal data of tradespeople and visitors to punds.sk: what data, for what purpose, for how long and what your rights are.',
    home: 'Home', crumb: 'Privacy policy', h1: 'Privacy policy', updated: 'Last updated: October 2026', read: '4-minute read', toc: 'Contents',
    ask: 'Questions about data protection:', cookiesBtn: 'Cookie policy',
    s: [
      ['Data controller', `The controller of your personal data is ${CO}, registered office ${ADDR}, Slovakia, Company ID (IČO) 57553921, Tax ID (DIČ) 2122816839, VAT ID SK2122816839, registered in the Commercial Register of the District Court Nitra, section Sro, file no. 69265/N. Contact: ${mail}, ${phone}.`],
      ['What data we process', 'Your name, phone number, email, trade, experience, certificates and any other information you give us in a form, by email, via WhatsApp or by phone. If we start working together, also the data needed for the contract, invoicing and documents (for example your trade licence details and bank account).'],
      ['For what purpose', 'To arrange work with companies in Germany and Austria, to reply to your message or application, to prepare and perform the contract including documents needed to work abroad, to meet legal obligations (such as accounting and tax) and to protect the website from abuse.'],
      ['Legal basis', 'Article 6(1) GDPR: steps prior to entering into a contract and performance of the contract (point b) for applications and cooperation, your consent (point a) for keeping your contact for future offers, compliance with legal obligations (point c) and our legitimate interest (point f) in website security and protecting our claims.'],
      ['How long we keep data', `We keep data from applications or messages for as long as the selection and our communication with you lasts. If you agree to receive further offers, for no more than ${m('3 years')} after our last contact or until you withdraw consent. Contracts and accounting records are kept for as long as the law requires (for example ${m('10 years')} under the Slovak Accounting Act).`],
      ['Who we share data with', 'Partner companies you will work for, only to the extent necessary; IT providers that run our website and database for us (as contractually bound processors); our accountant; and public authorities where the law requires it. We do not sell data. Any transfer outside the European Economic Area only takes place with appropriate safeguards (such as standard contractual clauses).'],
      ['Your rights', `You have the right of access, rectification, erasure, restriction of processing, data portability and the right to object. You can withdraw your consent at any time; this does not affect the lawfulness of processing before withdrawal. To exercise your rights, write to ${mail}. You can lodge a complaint with the Slovak Data Protection Office (Úrad na ochranu osobných údajov SR, Hraničná 12, 820 07 Bratislava, ${UOOU}) or with the supervisory authority in your country of residence.`],
      ['Cookies', `This website does not use analytics or advertising cookies and does not track you. See the ${L('cookies', 'Cookies')} page for details.`],
    ],
  }),
};

const pad = (i) => String(i + 1).padStart(2, '0');

/** Spoločné rozloženie právnych stránok (aj cookies.js). */
function legalPage(ctx, t, { toc = true } = {}) {
  return `
<div class="wrap sp-head">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
  <div class="sp-head-in rv-in"><h1 class="sp-h1 lgl-h1">${esc(t.h1)}</h1><div class="lgl-meta"><span>${esc(t.updated)}</span><span aria-hidden="true">·</span><span>${esc(t.read)}</span></div></div>
</div>
${ctx.prod ? '' : '<div class="wrap"><p class="warn lgl-warn"><span aria-hidden="true">⚠️</span>Text je návrh, pred spustením ho skontroluje právnik.</p></div>'}
<div class="wrap sec-last lgl${toc ? '' : ' lgl-solo'}">
  ${toc ? `<nav class="lgl-toc" aria-label="${esc(t.toc)}"><span class="eyebrow">${esc(t.toc)}</span>${each(t.s, ([h], i) => `<a href="#s${i + 1}"><span>${i + 1}</span>${esc(h)}</a>`)}</nav>` : ''}
  <article class="lgl-art">
    ${each(t.s, ([h, html], i) => `<section id="s${i + 1}"><h2><span>${pad(i)}</span>${esc(h)}</h2><p>${html}</p></section>`)}
    <div class="lgl-foot"><span>${esc(t.ask)} ${mail}</span>${t.footBtn || ''}</div>
  </article>
</div>`;
}

async function render(ctx) {
  const m = (x) => (ctx.prod ? x : `<mark>${x}</mark>`);
  const L = (route, text) => `<a class="b or" href="${esc(ctx.url(route))}">${esc(text)}</a>`;
  const t = T[ctx.lang](m, L);
  t.footBtn = `<a class="btn btn-ghost btn-sm" href="${esc(ctx.url('cookies'))}">${esc(t.cookiesBtn)}</a>`;
  return { title: t.title, description: t.desc, body: legalPage(ctx, t), css: ['css/sk-pages.css'], bodyClass: 'pg-legal' };
}

module.exports = render;
module.exports.legalPage = legalPage;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
