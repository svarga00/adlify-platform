// ============================================================================
// punds.eu — detail remesla + dopyt (návrh 2c), trasa 'trade'
// ============================================================================
// Remeslo sa hľadá podľa slugu v adrese (professions.js → euBySlug); neznámy
// slug = 404. Texty každého remesla sú nižšie v TRADES[kľúč][jazyk].
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const PROF = require('../../shared/professions');
const { IMG } = require('../../shared/jobs');
const { PHONE, MAIL, tel, T: C } = require('../common');
const { enquiryForm, phoneIco } = require('./contact');

/** Spoločné texty stránky. */
const T = {
  de: {
    home: 'Start', trades: 'Gewerke', callback: 'Rückruf vereinbaren',
    detailK: 'Im Überblick', tasksH: 'Typische Aufgaben', inclH: 'Was Sie von uns erhalten',
    incl: ['Profile mit Qualifikation und Nachweisen vor Einsatzbeginn', 'Vollständige Unterlagen – A1, Gewerbe, Freistellung – vor Projektstart', 'Unterkunft und Anreise organisiert',
      'Ein deutschsprachiger Ansprechpartner für Einsatz, Ersatz und Abrechnung', 'Werkvertrag oder Arbeitnehmerüberlassung*'],
    aueg: '* Arbeitnehmerüberlassung nur mit gültiger Erlaubnis nach AÜG – wir klären das vor Projektbeginn mit Ihnen.',
    procH: 'So läuft ein Einsatz ab', procP: 'Von der Anfrage bis zum ersten Arbeitstag – ein fester Ansprechpartner koordiniert alles.',
    proc: (u) => [['Anfrage', 'Gewerk, Ort, Zeitraum und Anzahl der Personen.'], ['Profile & Angebot', `Passende ${u} mit Nachweisen und Konditionen.`],
      ['Unterlagen', 'A1, Gewerbe, Freistellung – vor Projektstart komplett.'], ['Einsatz', 'Anreise, Unterkunft und Betreuung vor Ort.']],
    faqH: 'Häufige Fragen',
    faqAll: [['Wie schnell kann ein Einsatz beginnen?', 'Das hängt von Gewerk, Teamgröße und Einsatzort ab. Nach Ihrer Anfrage nennen wir Ihnen einen realistischen Starttermin – verbindlich erst, wenn die Profile feststehen.'],
      ['Wer stellt Material, Maschinen und Werkzeug?', 'In der Regel stellen Sie Material und Großgeräte, unsere Fachkräfte bringen ihr Handwerkzeug und ihre persönliche Schutzausrüstung mit. Die genaue Aufteilung halten wir im Angebot fest.']],
    formK: 'Anfrage', formP: 'Unverbindlich. Wir melden uns innerhalb eines Werktages mit passenden Profilen.', direct: 'Direkter Kontakt',
    cta: (one, many) => [`Anfrage für 1 ${one} senden →`, `Anfrage für {n} ${many} senden →`],
    otherH: 'Weitere Gewerke', titleSfx: 'Fachkräfte aus der Slowakei | punds',
  },
  en: {
    home: 'Home', trades: 'Trades', callback: 'Arrange a call-back',
    detailK: 'At a glance', tasksH: 'Typical tasks', inclH: 'What you get from us',
    incl: ['Profiles with qualifications and certificates before work starts', 'Complete documentation – A1, trade licence, Freistellung – before day one', 'Accommodation and travel organised',
      'One German-speaking contact for deployment, replacements and billing', 'Subcontracting (Werkvertrag) or temporary staffing*'],
    aueg: '* Temporary staffing (Arbeitnehmerüberlassung) only with a valid licence under the German AÜG – we clarify this with you before the project starts.',
    procH: 'How a deployment works', procP: 'From your enquiry to the first day on site – one fixed contact person coordinates everything.',
    proc: (u) => [['Enquiry', 'Trade, location, timeframe and number of people.'], ['Profiles & proposal', `Matching ${u} with credentials and terms.`],
      ['Documentation', 'A1, trade licence, Freistellung – complete before day one.'], ['Deployment', 'Travel, accommodation and support on site.']],
    faqH: 'Frequently asked questions',
    faqAll: [['How quickly can work start?', 'That depends on the trade, crew size and location. After your enquiry we give you a realistic start date – confirmed once the profiles are fixed.'],
      ['Who provides materials, machines and tools?', 'As a rule you provide materials and heavy equipment; our tradespeople bring their hand tools and personal protective equipment. We set out the exact split in the proposal.']],
    formK: 'Enquiry', formP: 'No obligation. We’ll get back to you within one working day with matching profiles.', direct: 'Direct contact',
    cta: (one, many) => [`Request 1 ${one} →`, `Request {n} ${many} →`],
    otherH: 'Other trades', titleSfx: 'skilled tradespeople from Slovakia | punds',
  },
};

/**
 * Obsah remesiel. unit = [jednotné, množné] pre tlačidlo („Anfrage für 2 Schweißer senden").
 * facts = 3 dlaždice, tasks = typická náplň, extra = čo je pre remeslo navyše, faq = otázky.
 */
const TRADES = {
  zvarac: {
    img: IMG.weld,
    de: { crumb: 'Schweißen', h1: 'Schweißer MIG/MAG/TIG für Ihr Projekt', unit: ['Schweißer', 'Schweißer'], ask: 'Schweißer anfragen',
      sub: 'Zertifizierte Schweißer für Stahlbau, Anlagenbau und Montage – als einzelne Fachkraft oder eingespieltes Team, deutschlandweit.',
      facts: [['Verfahren', 'MIG/MAG (135, 136), WIG/TIG (141), E-Hand (111)'], ['Zertifikate', 'Schweißerprüfung nach DIN EN ISO 9606-1, auf Anfrage weitere'], ['Einsatzbereiche', 'Stahlbau, Hallenbau, Anlagen- und Rohrleitungsbau, Montage']],
      intro: 'Unsere Schweißer arbeiten in der Werkstatt und auf der Montage – nach Zeichnung, Schweißanweisung (WPS) und Ihren Qualitätsvorgaben. Gültige Prüfungsbescheinigungen nach DIN EN ISO 9606-1 erhalten Sie vor Einsatzbeginn in Kopie, passend zu Verfahren, Werkstoff und Position.',
      tasks: ['Heften und Schweißen von Stahlkonstruktionen nach Zeichnung und WPS', 'Kehl- und Stumpfnähte in den geprüften Positionen', 'WIG-Schweißen von Edelstahl- und Rohrleitungen', 'Montage- und Reparaturschweißungen vor Ort', 'Nahtvorbereitung, Schleifen und Sichtprüfung der eigenen Nähte'],
      faq: [['Welche Prüfungen haben Ihre Schweißer?', 'Schweißerprüfungen nach DIN EN ISO 9606-1 für die jeweils angebotenen Verfahren (z. B. 135, 136, 141, 111). Geltungsbereich und Gültigkeit stehen in der Bescheinigung, die wir Ihnen vorab senden.'],
        ['Können Sie Teams mit gemischten Verfahren stellen?', 'Ja. Geben Sie in der Anfrage an, welche Verfahren, Werkstoffe und Positionen gefordert sind – wir stellen das Team entsprechend zusammen.']],
      msgPh: 'z. B. Verfahren, Werkstoff, Positionen, Zertifikate, Dauer' },
    en: { crumb: 'Welding', h1: 'MIG/MAG/TIG welders for your project', unit: ['welder', 'welders'], ask: 'Request welders',
      sub: 'Certified welders for steel construction, plant engineering and installation – as individual specialists or a well-rehearsed crew, anywhere in Germany.',
      facts: [['Processes', 'MIG/MAG (135, 136), TIG (141), MMA (111)'], ['Certificates', 'Welder qualification to EN ISO 9606-1, others on request'], ['Applications', 'Steel and hall construction, plant and pipeline construction, installation']],
      intro: 'Our welders work in the workshop and on site – to drawings, welding procedure specifications (WPS) and your quality requirements. You receive copies of valid EN ISO 9606-1 qualification certificates before work starts, matching the process, material and position.',
      tasks: ['Tacking and welding steel structures to drawings and WPS', 'Fillet and butt welds in the qualified positions', 'TIG welding of stainless steel and pipework', 'Installation and repair welding on site', 'Weld preparation, grinding and visual inspection of own welds'],
      faq: [['Which qualifications do your welders hold?', 'Welder qualification tests to EN ISO 9606-1 for the processes offered (e.g. 135, 136, 141, 111). Scope and validity are stated on the certificate, which we send you in advance.'],
        ['Can you provide crews with mixed processes?', 'Yes. Tell us in your enquiry which processes, materials and positions are required, and we will put the crew together accordingly.']],
      msgPh: 'e.g. process, material, positions, certificates, duration' },
  },
  zamocnik: {
    img: IMG.weld,
    de: { crumb: 'Metallbau', h1: 'Schlosser und Metallbauer für Ihr Projekt', unit: ['Schlosser', 'Schlosser'], ask: 'Schlosser anfragen',
      sub: 'Erfahrene Schlosser für Stahl- und Metallbau, Treppen, Geländer und Unterkonstruktionen – in der Werkstatt oder auf der Montage.',
      facts: [['Arbeiten', 'Zuschnitt, Bohren, Biegen, Heften, Schweißen (MAG) und Montage'], ['Werkstoffe', 'Baustahl, Edelstahl und Aluminium'], ['Einsatzbereiche', 'Stahl- und Hallenbau, Treppen und Geländer, Bühnen, Industriemontage']],
      intro: 'Ob Fertigung in Ihrer Werkstatt oder Montage auf der Baustelle: Unsere Schlosser arbeiten nach Werkstatt- und Montagezeichnungen und fügen sich in Ihre Abläufe ein. Erfahrung und Schwerpunkte jedes Profils sehen Sie vor dem Einsatz.',
      tasks: ['Fertigen von Bauteilen nach Werkstattzeichnung', 'Montage von Stahlkonstruktionen, Treppen, Geländern und Bühnen', 'Anpassen, Bohren und Verschrauben vor Ort nach Vorgabe', 'Heften und Schweißen einfacher Verbindungen (MAG)', 'Arbeiten mit Hubarbeitsbühne nach Einweisung'],
      faq: [['Lesen Ihre Schlosser technische Zeichnungen?', 'Wir stellen Ihnen Profile mit Erfahrung im Arbeiten nach Werkstatt- und Montagezeichnungen vor. Was jemand konkret gefertigt oder montiert hat, steht im Profil.'],
        ['Übernehmen Sie auch Schweißarbeiten mit Prüfung?', 'Für Schweißnähte mit Prüfanforderung setzen wir geprüfte Schweißer nach DIN EN ISO 9606-1 ein – gern kombiniert mit Schlossern in einem Team.']],
      msgPh: 'z. B. Werkstatt oder Montage, Werkstoffe, Bauteile, Dauer' },
    en: { crumb: 'Metalwork', h1: 'Metalworkers and fabricators for your project', unit: ['metalworker', 'metalworkers'], ask: 'Request metalworkers',
      sub: 'Experienced metalworkers for steel and metal construction, stairs, railings and substructures – in the workshop or on site.',
      facts: [['Work', 'Cutting, drilling, bending, tacking, MAG welding and installation'], ['Materials', 'Structural steel, stainless steel and aluminium'], ['Applications', 'Steel and hall construction, stairs and railings, platforms, industrial installation']],
      intro: 'Whether fabrication in your workshop or installation on site: our metalworkers work to shop and assembly drawings and fit into your processes. You see each profile’s experience and focus before deployment.',
      tasks: ['Fabricating components to shop drawings', 'Installing steel structures, stairs, railings and platforms', 'Fitting, drilling and bolting on site as specified', 'Tacking and welding simple joints (MAG)', 'Working from mobile elevating platforms after instruction'],
      faq: [['Can your metalworkers read technical drawings?', 'We put forward profiles with experience working to shop and assembly drawings. What each person has fabricated or installed is stated in their profile.'],
        ['Do you also cover welding with inspection requirements?', 'For welds with inspection requirements we deploy welders qualified to EN ISO 9606-1 – happily combined with metalworkers in one crew.']],
      msgPh: 'e.g. workshop or site, materials, components, duration' },
  },
  sadrokarton: {
    img: IMG.mont,
    de: { crumb: 'Trockenbau', h1: 'Trockenbauer für Ihr Bauvorhaben', unit: ['Trockenbauer', 'Trockenbauer'], ask: 'Trockenbauer anfragen',
      sub: 'Trockenbauer für Wände, Decken und Vorsatzschalen im Wohnungs-, Büro- und Gewerbebau – sauber gespachtelt bis zur geforderten Qualitätsstufe.',
      facts: [['Systeme', 'Metallständerwände, Vorsatzschalen, abgehängte Decken'], ['Oberflächen', 'Spachteln in den Qualitätsstufen Q1 bis Q4'], ['Einsatzbereiche', 'Wohnungsbau, Büro- und Gewerbebau, Sanierung']],
      intro: 'Unsere Trockenbauer arbeiten nach Ihrer Planung und den Vorgaben des jeweiligen Systemherstellers. Konstruktionen mit Brand- oder Schallschutzanforderungen werden nach den Systemnachweisen ausgeführt, die Sie uns vorgeben.',
      tasks: ['Ständerwerk stellen (CW-/UW-Profile) und ausrichten', 'Beplanken mit Gipsplatten, ein- oder zweilagig', 'Einbau von Dämmung in Wände und Decken', 'Abgehängte Decken und Unterdecken', 'Spachteln und Schleifen bis Q3/Q4, Einbau von Revisionsöffnungen'],
      faq: [['Arbeiten Ihre Teams nach Herstellersystemen?', 'Ja. Ausgeführt wird nach Ihrer Planung und den Verarbeitungsvorgaben des Systemherstellers, den Sie festlegen.'],
        ['Übernehmen Sie Brand- und Schallschutzwände?', 'Ja, nach den vorgegebenen Systemnachweisen und Ihrer Bauleitung. Bitte nennen Sie die Anforderungen bereits in der Anfrage.']],
      msgPh: 'z. B. Wände/Decken, Qualitätsstufe, Systeme, Fläche, Dauer' },
    en: { crumb: 'Drywall', h1: 'Drywall installers for your project', unit: ['drywall installer', 'drywall installers'], ask: 'Request drywall installers',
      sub: 'Drywall installers for partitions, ceilings and wall linings in residential, office and commercial construction – finished to the required quality level.',
      facts: [['Systems', 'Metal stud partitions, wall linings, suspended ceilings'], ['Finishes', 'Jointing to quality levels Q1 to Q4'], ['Applications', 'Residential, office and commercial construction, refurbishment']],
      intro: 'Our drywall installers work to your design and the specifications of the system manufacturer. Assemblies with fire or sound protection requirements are built according to the system certificates you specify.',
      tasks: ['Setting out and installing stud frameworks (CW/UW profiles)', 'Boarding with plasterboard, single or double layer', 'Installing insulation in walls and ceilings', 'Suspended ceilings and ceiling linings', 'Jointing and sanding up to Q3/Q4, fitting access panels'],
      faq: [['Do your crews work to manufacturer systems?', 'Yes. Work is carried out to your design and the installation instructions of the system manufacturer you specify.'],
        ['Do you build fire- and sound-rated walls?', 'Yes, according to the specified system certificates and under your site management. Please state the requirements in your enquiry.']],
      msgPh: 'e.g. walls/ceilings, quality level, systems, area, duration' },
  },
  maliar: {
    img: IMG.paint,
    de: { crumb: 'Maler & Tapezierer', h1: 'Maler und Tapezierer für Ihr Projekt', unit: ['Maler', 'Maler'], ask: 'Maler anfragen',
      sub: 'Maler und Tapezierer für Innenausbau, Fassade und Lackierarbeiten – im Neubau, in der Sanierung und im Objektbau.',
      facts: [['Innen', 'Spachtel-, Anstrich- und Tapezierarbeiten'], ['Außen & Lack', 'Fassadenanstriche, Lackierarbeiten an Türen, Zargen und Geländern'], ['Einsatzbereiche', 'Neubau, Sanierung, Wohnungs- und Objektbau']],
      intro: 'Von der Untergrundvorbereitung bis zur fertigen Oberfläche: Unsere Maler arbeiten nach Ihrem Leistungsverzeichnis und Ihren Materialvorgaben. Auf größeren Flächen auch im Airless-Spritzverfahren.',
      tasks: ['Untergrundvorbereitung: Abkleben, Schleifen, Grundieren', 'Spachteln von Wand- und Deckenflächen', 'Streichen und Rollen, auch im Airless-Spritzverfahren', 'Tapezieren mit Vlies-, Raufaser- und Glasgewebetapeten', 'Lackierarbeiten sowie Fassadenanstriche'],
      faq: [['Arbeiten Ihre Maler mit unseren Materialien?', 'Ja, gearbeitet wird mit den Materialien und Farbtönen aus Ihrem Leistungsverzeichnis. Das Handwerkzeug bringen unsere Maler mit.'],
        ['Übernehmen Sie auch Fassadenflächen?', 'Ja, Fassadenanstriche gehören dazu. Gerüst und Absicherung stellen in der Regel Sie – das klären wir im Angebot.']],
      msgPh: 'z. B. Innen/Fassade, Flächen, Spritzverfahren, Dauer' },
    en: { crumb: 'Painters & decorators', h1: 'Painters and decorators for your project', unit: ['painter', 'painters'], ask: 'Request painters',
      sub: 'Painters and paperhangers for interior finishing, facades and lacquer work – in new builds, refurbishment and commercial projects.',
      facts: [['Interior', 'Filling, painting and wallpapering'], ['Exterior & lacquer', 'Facade painting, lacquering of doors, frames and railings'], ['Applications', 'New builds, refurbishment, residential and commercial projects']],
      intro: 'From surface preparation to the finished surface: our painters work to your bill of quantities and material specifications – on larger areas also with airless spraying.',
      tasks: ['Surface preparation: masking, sanding, priming', 'Filling wall and ceiling surfaces', 'Brushing and rolling, also airless spraying', 'Hanging non-woven, woodchip and glass-fibre wallpaper', 'Lacquer work and facade painting'],
      faq: [['Will your painters use our materials?', 'Yes, they work with the materials and colours in your bill of quantities. Our painters bring their own hand tools.'],
        ['Do you also take on facades?', 'Yes, facade painting is included. Scaffolding and site safety are usually provided by you – we clarify this in the proposal.']],
      msgPh: 'e.g. interior/facade, areas, spraying, duration' },
  },
  zateplovac: {
    img: IMG.paint,
    de: { crumb: 'WDVS', h1: 'WDVS-Monteure für Ihre Fassade', unit: ['WDVS-Monteur', 'WDVS-Monteure'], ask: 'WDVS-Monteure anfragen',
      sub: 'Fachkräfte für Wärmedämm-Verbundsysteme – vom Sockelprofil bis zum Oberputz, im Neubau und in der energetischen Sanierung.',
      facts: [['Dämmstoffe', 'EPS, Mineralwolle und Holzfaser – nach Systemhersteller'], ['Arbeiten', 'Kleben, Dübeln, Armieren, Ober- und Edelputz'], ['Einsatzbereiche', 'Neubau, energetische Sanierung, Wohn- und Gewerbebau']],
      intro: 'Ein WDVS ist nur so gut wie seine Anschlüsse. Unsere Monteure arbeiten nach der Zulassung des gewählten Systems und Ihren Detailplänen – inklusive Laibungen, Fensteranschlüssen und Brandriegeln.',
      tasks: ['Prüfen und Vorbereiten des Untergrunds', 'Setzen von Sockel- und Anschlussprofilen', 'Kleben und Dübeln der Dämmplatten', 'Armierungsschicht mit Gewebe, Laibungen und Fensteranschlüsse', 'Brandriegel nach Vorgabe, Ober- bzw. Edelputz und Anstrich'],
      faq: [['Werden Brandriegel und Anschlüsse nach Vorgabe ausgeführt?', 'Ja, nach der Zulassung des Systems und Ihrer Planung. Details wie Sockel, Laibungen und Durchdringungen stimmen wir vor Beginn mit Ihrer Bauleitung ab.'],
        ['Wer stellt das Gerüst?', 'Das Gerüst wird in der Regel bauseits gestellt. Die genaue Aufteilung halten wir im Angebot fest.']],
      msgPh: 'z. B. System, Dämmstoff, Fassadenfläche, Dauer' },
    en: { crumb: 'ETICS', h1: 'ETICS installers for your facade', unit: ['ETICS installer', 'ETICS installers'], ask: 'Request ETICS installers',
      sub: 'Specialists for external thermal insulation composite systems (ETICS/WDVS) – from base profile to finishing render, in new builds and energy-efficient refurbishment.',
      facts: [['Insulation', 'EPS, mineral wool and wood fibre – per system manufacturer'], ['Work', 'Bonding, anchoring, reinforcement, finishing render'], ['Applications', 'New builds, energy-efficient refurbishment, residential and commercial']],
      intro: 'An ETICS facade is only as good as its junctions. Our installers work to the approval of the chosen system and your detail drawings – including reveals, window junctions and fire barriers.',
      tasks: ['Checking and preparing the substrate', 'Fitting base and junction profiles', 'Bonding and anchoring insulation boards', 'Reinforcement layer with mesh, reveals and window junctions', 'Fire barriers as specified, finishing render and paint'],
      faq: [['Are fire barriers and junctions built to specification?', 'Yes, according to the system approval and your design. Details such as base, reveals and penetrations are agreed with your site management before work starts.'],
        ['Who provides the scaffolding?', 'Scaffolding is usually provided by you. We set out the exact split in the proposal.']],
      msgPh: 'e.g. system, insulation material, facade area, duration' },
  },
  okna: {
    img: IMG.mont,
    de: { crumb: 'Fenster & Türen', h1: 'Fenster- und Türmonteure für Ihr Projekt', unit: ['Monteur', 'Monteure'], ask: 'Monteure anfragen',
      sub: 'Monteure für Fenster, Haus- und Innentüren – fachgerecht eingebaut, abgedichtet und eingestellt, im Neubau wie in der Sanierung.',
      facts: [['Montage', 'Kunststoff-, Holz- und Aluminiumfenster, Haus- und Innentüren'], ['Anschluss', 'Abdichtung innen luftdicht, außen schlagregendicht – nach RAL-Leitfaden bzw. Ihren Vorgaben'], ['Einsatzbereiche', 'Neubau, Sanierung, Wohnungs- und Objektbau']],
      intro: 'Für dichte und dauerhafte Anschlüsse arbeiten unsere Monteure nach dem Prinzip „innen dichter als außen“ und nach den Vorgaben von Hersteller und Planung – vom Ausbau der Altelemente bis zum Einstellen der Beschläge.',
      tasks: ['Ausbau und Entsorgungsvorbereitung von Altfenstern und -türen', 'Einbau, Ausrichten und Befestigen der Elemente', 'Abdichten der Anschlussfuge mit Bändern und Folien', 'Einstellen der Beschläge und Funktionsprüfung', 'Montage von Innentüren, Zargen und Fensterbänken'],
      faq: [['Übernehmen Sie auch die Vorwandmontage?', 'Ja, nach Systemvorgabe des Herstellers und Ihrer Planung. Bitte geben Sie die Montageart in der Anfrage an.'],
        ['Wer übernimmt das Aufmaß?', 'In der Regel liegt das Aufmaß bei Ihnen oder dem Hersteller. Unsere Monteure prüfen die Einbausituation vor Ort und melden Abweichungen sofort.']],
      msgPh: 'z. B. Anzahl Elemente, Material, Montageart, Dauer' },
    en: { crumb: 'Windows & doors', h1: 'Window and door fitters for your project', unit: ['fitter', 'fitters'], ask: 'Request fitters',
      sub: 'Fitters for windows, entrance and interior doors – professionally installed, sealed and adjusted, in new builds and refurbishment.',
      facts: [['Installation', 'uPVC, timber and aluminium windows, entrance and interior doors'], ['Junctions', 'Airtight inside, weathertight outside – per RAL guideline or your specification'], ['Applications', 'New builds, refurbishment, residential and commercial projects']],
      intro: 'For tight, durable junctions our fitters follow the “tighter inside than outside” principle and the manufacturer’s and designer’s specifications – from removing old units to adjusting the hardware.',
      tasks: ['Removing old windows and doors and preparing them for disposal', 'Installing, aligning and fixing the units', 'Sealing the joint with tapes and membranes', 'Adjusting hardware and function check', 'Fitting interior doors, frames and window sills'],
      faq: [['Do you also do pre-wall (Vorwand) installation?', 'Yes, according to the manufacturer’s system and your design. Please state the installation method in your enquiry.'],
        ['Who takes the measurements?', 'Measuring usually lies with you or the manufacturer. Our fitters check the situation on site and report deviations immediately.']],
      msgPh: 'e.g. number of units, material, installation method, duration' },
  },
  nabytok: {
    img: IMG.mont,
    de: { crumb: 'Möbelmontage', h1: 'Möbelmonteure für Montage und Einrichtung', unit: ['Möbelmonteur', 'Möbelmonteure'], ask: 'Möbelmonteure anfragen',
      sub: 'Monteure für Büro-, Objekt- und Ladenmöbel, Küchen und Einbauschränke – termingerecht aufgebaut, ausgerichtet und übergeben.',
      facts: [['Montage', 'Büro-, Objekt- und Ladenmöbel, Küchen, Einbauschränke'], ['Einsatzbereiche', 'Büro- und Objekteinrichtung, Hotels, Wohnprojekte, Ladenbau'], ['Ablauf', 'Verteilen im Gebäude, Aufbau, Ausrichten, Verpackung entsorgen']],
      intro: 'Bei Einrichtungsprojekten zählt der Termin. Unsere Monteure arbeiten nach Montageanleitung und Möblierungsplan, Raum für Raum – einzeln oder als Team, das eine Etage in kurzer Zeit fertigstellt.',
      tasks: ['Aufbau nach Montageanleitung und Möblierungsplan', 'Ausrichten und Befestigen an Wand und Boden', 'Küchenmontage inklusive Arbeitsplatten und Ausschnitten', 'Transport und Verteilen der Möbel im Gebäude', 'Demontage, Umzug und Wiederaufbau von Büros'],
      faq: [['Übernehmen Ihre Monteure Elektro- oder Wasseranschlüsse?', 'Nein. Anschlüsse an Strom, Wasser und Gas übernimmt ein dafür zugelassener Fachbetrieb. Unsere Monteure bereiten Ausschnitte und Montage entsprechend vor.'],
        ['Können Sie kurzfristig mehrere Monteure stellen?', 'Bei Einrichtungsprojekten mit festem Übergabetermin planen wir die Teamgröße mit Ihnen. Nennen Sie uns Termin und Umfang möglichst früh.']],
      msgPh: 'z. B. Art der Möbel, Umfang, Etagen, Übergabetermin' },
    en: { crumb: 'Furniture assembly', h1: 'Furniture fitters for assembly and fit-out', unit: ['furniture fitter', 'furniture fitters'], ask: 'Request furniture fitters',
      sub: 'Fitters for office, contract and retail furniture, kitchens and built-in wardrobes – assembled, aligned and handed over on schedule.',
      facts: [['Assembly', 'Office, contract and retail furniture, kitchens, built-in wardrobes'], ['Applications', 'Office and contract fit-out, hotels, residential projects, shop fitting'], ['Process', 'Distribution in the building, assembly, alignment, packaging disposal']],
      intro: 'In fit-out projects, the deadline counts. Our fitters work to assembly instructions and the furniture layout, room by room – individually or as a crew that completes a floor in a short time.',
      tasks: ['Assembly to instructions and furniture layout', 'Aligning and fixing to walls and floors', 'Kitchen assembly including worktops and cut-outs', 'Moving and distributing furniture within the building', 'Dismantling, relocating and reassembling offices'],
      faq: [['Do your fitters make electrical or water connections?', 'No. Connections to electricity, water and gas are made by a licensed specialist company. Our fitters prepare cut-outs and assembly accordingly.'],
        ['Can you provide several fitters at short notice?', 'For fit-out projects with a fixed handover date we plan the crew size with you. Let us know the date and scope as early as possible.']],
      msgPh: 'e.g. type of furniture, scope, floors, handover date' },
  },
  pomocnik: {
    img: IMG.mont,
    de: { crumb: 'Bauhelfer', h1: 'Bauhelfer für Ihre Baustelle', unit: ['Bauhelfer', 'Bauhelfer'], ask: 'Bauhelfer anfragen',
      sub: 'Zuverlässige Helfer für Zuarbeit, Materiallogistik und Baustellenordnung – zur Entlastung Ihrer Fachkräfte im Hoch- und Ausbau.',
      facts: [['Aufgaben', 'Zuarbeit, Materialtransport, Baustellenlogistik und -ordnung'], ['Einsatzbereiche', 'Hochbau, Ausbau, Sanierung, Entkernung'], ['Teamgröße', 'Einzeln oder als Gruppe zur Verstärkung Ihrer Kolonne']],
      intro: 'Gute Bauhelfer halten Ihren Fachkräften den Rücken frei. Unsere Helfer arbeiten nach Anweisung Ihrer Bauleitung oder Ihres Vorarbeiters und übernehmen die Arbeiten, die sonst Ihre Fachleute binden.',
      tasks: ['Materialtransport und Verteilen auf der Baustelle', 'Zuarbeit für Fachkräfte im Hoch- und Ausbau', 'Baustelleneinrichtung und -räumung', 'Entkernung und leichte Abbrucharbeiten', 'Reinigung, Entsorgung und Ordnung auf der Baustelle'],
      faq: [['Welche Erfahrung haben Ihre Bauhelfer?', 'Wir stellen Helfer mit Baustellenerfahrung vor. Vorkenntnisse, z. B. im Trockenbau oder bei Abbrucharbeiten, sehen Sie vorab im Profil.'],
        ['Wer übernimmt die Unterweisung?', 'Die baustellenbezogene Sicherheitsunterweisung erfolgt durch Ihre Bauleitung. Persönliche Schutzausrüstung bringen unsere Helfer mit.']],
      msgPh: 'z. B. Art der Arbeiten, Gewerke, mit denen gearbeitet wird, Dauer' },
    en: { crumb: 'Construction helpers', h1: 'Construction helpers for your site', unit: ['construction helper', 'construction helpers'], ask: 'Request helpers',
      sub: 'Reliable helpers for assisting tradespeople, material logistics and keeping the site in order – freeing up your skilled workers in structural and finishing work.',
      facts: [['Tasks', 'Assisting, moving materials, site logistics and housekeeping'], ['Applications', 'Structural work, interior finishing, refurbishment, strip-out'], ['Team size', 'Individually or as a group to reinforce your crew']],
      intro: 'Good helpers keep your skilled workers free for skilled work. Our helpers work under the instructions of your site manager or foreman and take on the tasks that would otherwise tie up your specialists.',
      tasks: ['Moving and distributing materials on site', 'Assisting tradespeople in structural and finishing work', 'Setting up and clearing the site', 'Strip-out and light demolition work', 'Cleaning, waste disposal and site housekeeping'],
      faq: [['What experience do your helpers have?', 'We put forward helpers with construction site experience. Prior skills, e.g. in drywall or demolition, are shown in the profile beforehand.'],
        ['Who provides the safety briefing?', 'The site-specific safety briefing is given by your site management. Our helpers bring their own personal protective equipment.']],
      msgPh: 'e.g. type of work, trades they will support, duration' },
  },
};

async function render(ctx) {
  const p = PROF.euBySlug(ctx.lang, ctx.params.slug);
  if (!p || !TRADES[p.key]) return null;
  // Slug remesla je v každom jazyku iný (schweissen / welding) — prepínač
  // jazyka a hreflang dostanú správny slug (layout → ctx.paramsIn).
  ctx.langParams = (l) => ({ slug: p.eu.slug[l] || ctx.params.slug });
  const t = T[ctx.lang];
  const c = C[ctx.lang];
  const d = TRADES[p.key][ctx.lang];
  const img = TRADES[p.key].img;
  const [ctaOne, ctaMany] = t.cta(d.unit[0], d.unit[1]);
  const faq = [...d.faq, ...t.faqAll];
  const others = PROF.euTrades().filter((x) => x.key !== p.key);
  const home = ctx.url('home');

  const body = `
<section class="eu-thero">
  <div class="wrap eu-thero-in">
    <div class="eu-thero-txt rv-in">
      <nav class="crumbs eu-crumbs-dark" aria-label="Breadcrumb"><a href="${esc(home)}">${esc(t.home)}</a><span aria-hidden="true">/</span><a href="${esc(home)}#gewerke">${esc(t.trades)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(d.crumb)}</span></nav>
      <h1 class="eu-h1 eu-h1-64">${esc(d.h1)}</h1>
      <p class="eu-hero-sub">${esc(d.sub)}</p>
      <div class="eu-ctas"><a class="btn btn-primary" href="#anfrage">${esc(d.ask)} →</a><a class="btn eu-btn-line" href="${tel(PHONE)}">${esc(t.callback)}</a></div>
    </div>
    <img class="eu-thero-img rv-in d1" src="${esc(img)}" alt="${esc(p.eu.name[ctx.lang])}" width="960" height="680" decoding="async">
  </div>
</section>

<section class="wrap eu-facts">${each(d.facts, ([h, x]) => `<div class="eu-fact rv"><span class="eu-dot" aria-hidden="true"></span><strong>${esc(h)}</strong><span>${esc(x)}</span></div>`)}</section>

<section class="wrap eu-detail">
  <div class="eu-detail-h rv"><span class="eu-kick">${esc(t.detailK)}</span><h2 class="h2 eu-h2-40">${esc(p.eu.name[ctx.lang])}</h2><p class="eu-p">${esc(d.intro)}</p></div>
  <div class="eu-detail-c">
    <div class="eu-tasks rv"><h3 class="h3">${esc(t.tasksH)}</h3><ul class="eu-ticks">${each(d.tasks, (x) => `<li>${esc(x)}</li>`)}</ul></div>
    <div class="eu-incl rv"><h3 class="h3">${esc(t.inclH)}</h3><ul class="eu-ticks">${each(t.incl, (x) => `<li>${esc(x)}</li>`)}</ul><p class="eu-note">${esc(t.aueg)}</p></div>
  </div>
</section>

<section class="wrap eu-steps" id="ablauf">
  <div class="eu-steps-h rv"><h2 class="h2 eu-h2-40">${esc(t.procH)}</h2><p class="eu-p">${esc(t.procP)}</p></div>
  <ol class="eu-steps-l">${each(t.proc(d.unit[1]), ([h, x], i) => `<li class="rv"><span>${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(h)}</strong><span>${esc(x)}</span></div></li>`)}</ol>
</section>

<section class="wrap eu-steps eu-faqs">
  <div class="eu-steps-h rv"><h2 class="h2 eu-h2-40">${esc(t.faqH)}</h2></div>
  <div class="eu-faq-l" data-acc-group>${each(faq, ([q, a], i) => `<details class="eu-faq rv"${i === 0 ? ' open' : ''}><summary><span>${esc(q)}</span><i aria-hidden="true">+</i></summary><p>${esc(a)}</p></details>`)}</div>
</section>

<section class="wrap eu-tform" id="anfrage">
  <div class="eu-tform-in rv">
    <div class="eu-tform-l">
      <span class="eu-kick">${esc(t.formK)}</span>
      <h2 class="h2 eu-h2-40">${esc(d.ask)}</h2>
      <p class="eu-p">${esc(t.formP)}</p>
      <div class="eu-direct"><strong>${esc(t.direct)}</strong><a href="${tel(PHONE)}">${esc(PHONE)}</a><a class="or" href="mailto:${MAIL}">${esc(MAIL)}</a></div>
    </div>
    ${enquiryForm(ctx, { variant: 'full', id: 't', trade: p, stepper: true, ctaOne, ctaMany, messagePh: d.msgPh })}
  </div>
</section>

<section class="wrap sec sec-last eu-others">
  <h2 class="h2 eu-h2-40 rv">${esc(t.otherH)}</h2>
  <div class="eu-tlist eu-tlist-4">${each(others, (x) => `<a class="eu-trade rv" href="${esc(ctx.url('trade', { slug: x.eu.slug[ctx.lang] }))}"><strong>${esc(x.eu.name[ctx.lang])}</strong><span aria-hidden="true">→</span></a>`)}</div>
</section>
<div class="mcta"><a class="btn btn-primary" href="#anfrage">${esc(d.ask)} →</a><a class="btn btn-dark btn-call" href="${tel(PHONE)}" aria-label="${esc(c.call)}">${phoneIco}</a></div>`;

  return {
    title: `${d.h1} – ${t.titleSfx}`,
    description: d.sub,
    body, nav: 'trade', css: ['css/eu-pages.css'], js: ['js/eu-pages.js'], bodyClass: 'has-mcta', image: img,
  };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
module.exports.TRADES = TRADES;
