// ============================================================================
// punds web — profesie
// ============================================================================
// Jeden zoznam pre oba weby. `app` = kľúče remesiel v appke (danubra_trades),
// ktoré pod profesiu patria — inzerát z appky sa podľa nich zaradí.
// `eu` = remeslo, ktoré ponúkame nemeckým firmám na punds.eu (elektrikárov
// a vzduchotechnikov len naberáme, firmám ich zatiaľ neponúkame).
// ============================================================================
'use strict';

const PROFESSIONS = [
  { key: 'elektrikar', app: ['elektrikar'],
    name: { sk: 'Elektrikári', cz: 'Elektrikáři', hu: 'Villanyszerelők', de: 'Elektriker', en: 'Electricians', ro: 'Electricieni', pl: 'Elektrycy', bg: 'Електротехници' },
    one: { sk: 'Elektrikár', cz: 'Elektrikář', hu: 'Villanyszerelő', de: 'Elektriker', en: 'Electrician', ro: 'Electrician', pl: 'Elektryk', bg: 'Електротехник' } },
  { key: 'zvarac', app: ['zvarac'],
    name: { sk: 'Zvárači', cz: 'Svářeči', hu: 'Hegesztők', de: 'Schweißer', en: 'Welders', ro: 'Sudori', pl: 'Spawacze', bg: 'Заварчици' },
    one: { sk: 'Zvárač', cz: 'Svářeč', hu: 'Hegesztő', de: 'Schweißer', en: 'Welder', ro: 'Sudor', pl: 'Spawacz', bg: 'Заварчик' },
    eu: { slug: { de: 'schweissen', en: 'welding' }, name: { de: 'Schweißen MIG/MAG/TIG', en: 'Welding MIG/MAG/TIG' } } },
  { key: 'zamocnik', app: ['zamocnik'],
    name: { sk: 'Zámočníci', cz: 'Zámečníci', hu: 'Lakatosok', de: 'Schlosser', en: 'Metalworkers', ro: 'Lăcătuși', pl: 'Ślusarze', bg: 'Шлосери' },
    one: { sk: 'Zámočník', cz: 'Zámečník', hu: 'Lakatos', de: 'Schlosser', en: 'Metalworker', ro: 'Lăcătuș', pl: 'Ślusarz', bg: 'Шлосер' },
    eu: { slug: { de: 'metallbau', en: 'metalwork' }, name: { de: 'Schlosserei & Metallbau', en: 'Metalwork & steel construction' } } },
  { key: 'sadrokarton', app: ['trockenbau'],
    name: { sk: 'Sadrokartonisti', cz: 'Sádrokartonáři', hu: 'Gipszkartonozók', de: 'Trockenbauer', en: 'Drywall installers', ro: 'Montatori gips-carton', pl: 'Monterzy suchej zabudowy', bg: 'Монтажници на гипсокартон' },
    one: { sk: 'Sadrokartonista', cz: 'Sádrokartonář', hu: 'Gipszkartonozó', de: 'Trockenbauer', en: 'Drywall installer', ro: 'Montator gips-carton', pl: 'Monter suchej zabudowy', bg: 'Монтажник на гипсокартон' },
    eu: { slug: { de: 'trockenbau', en: 'drywall' }, name: { de: 'Trockenbau', en: 'Drywall' } } },
  { key: 'maliar', app: ['maliar'],
    name: { sk: 'Maliari a tapetári', cz: 'Malíři a tapetáři', hu: 'Festők és tapétázók', de: 'Maler und Tapezierer', en: 'Painters & paperhangers', ro: 'Zugravi și tapetari', pl: 'Malarze i tapeciarze', bg: 'Бояджии и тапетаджии' },
    one: { sk: 'Maliar / tapetár', cz: 'Malíř / tapetář', hu: 'Festő / tapétázó', de: 'Maler / Tapezierer', en: 'Painter / paperhanger', ro: 'Zugrav / tapetar', pl: 'Malarz / tapeciarz', bg: 'Бояджия / тапетаджия' },
    eu: { slug: { de: 'maler', en: 'painters' }, name: { de: 'Maler & Tapezierer', en: 'Painters & decorators' } } },
  { key: 'zateplovac', app: ['omietkar'],
    name: { sk: 'Zatepľovači', cz: 'Zateplovači', hu: 'Homlokzati hőszigetelők', de: 'WDVS-Monteure', en: 'ETICS installers', ro: 'Montatori termoizolații (WDVS)', pl: 'Monterzy ociepleń (WDVS)', bg: 'Монтажници на топлоизолация (WDVS)' },
    one: { sk: 'Zatepľovač (WDVS)', cz: 'Zateplovač (WDVS)', hu: 'Hőszigetelő (WDVS)', de: 'WDVS-Monteur', en: 'ETICS installer', ro: 'Montator termoizolații (WDVS)', pl: 'Monter ociepleń (WDVS)', bg: 'Монтажник на топлоизолация (WDVS)' },
    eu: { slug: { de: 'wdvs', en: 'etics' }, name: { de: 'WDVS / Fassadendämmung', en: 'ETICS / facade insulation' } } },
  { key: 'okna', app: ['montaznik'],
    name: { sk: 'Montéri okien a dverí', cz: 'Montéři oken a dveří', hu: 'Nyílászáró-szerelők', de: 'Fenster- und Türmonteure', en: 'Window & door fitters', ro: 'Montatori ferestre și uși', pl: 'Monterzy okien i drzwi', bg: 'Монтажници на прозорци и врати' },
    one: { sk: 'Montér okien a dverí', cz: 'Montér oken a dveří', hu: 'Nyílászáró-szerelő', de: 'Fenster- und Türmonteur', en: 'Window & door fitter', ro: 'Montator ferestre și uși', pl: 'Monter okien i drzwi', bg: 'Монтажник на прозорци и врати' },
    eu: { slug: { de: 'fenster-tueren', en: 'windows-doors' }, name: { de: 'Fenster- & Türmontage', en: 'Window & door fitting' } } },
  { key: 'nabytok', app: [],
    name: { sk: 'Montéri nábytku', cz: 'Montéři nábytku', hu: 'Bútorszerelők', de: 'Möbelmonteure', en: 'Furniture fitters', ro: 'Montatori mobilă', pl: 'Monterzy mebli', bg: 'Монтажници на мебели' },
    one: { sk: 'Montér nábytku', cz: 'Montér nábytku', hu: 'Bútorszerelő', de: 'Möbelmonteur', en: 'Furniture fitter', ro: 'Montator mobilă', pl: 'Monter mebli', bg: 'Монтажник на мебели' },
    eu: { slug: { de: 'moebelmontage', en: 'furniture-assembly' }, name: { de: 'Möbelmontage', en: 'Furniture assembly' } } },
  { key: 'vzduchotechnik', app: [],
    name: { sk: 'Vzduchotechnici', cz: 'Vzduchotechnici', hu: 'Légtechnikai szerelők', de: 'Lüftungsmonteure', en: 'HVAC installers', ro: 'Montatori ventilație', pl: 'Monterzy wentylacji', bg: 'Монтажници на вентилация' },
    one: { sk: 'Vzduchotechnik', cz: 'Vzduchotechnik', hu: 'Légtechnikai szerelő', de: 'Lüftungsmonteur', en: 'HVAC installer', ro: 'Montator ventilație', pl: 'Monter wentylacji', bg: 'Монтажник на вентилация' } },
  { key: 'pomocnik', app: ['pomocnik'],
    name: { sk: 'Pomocní pracovníci', cz: 'Pomocní dělníci', hu: 'Segédmunkások', de: 'Bauhelfer', en: 'Construction helpers', ro: 'Ajutori pe șantier', pl: 'Pomocnicy budowlani', bg: 'Общи работници' },
    one: { sk: 'Pomocný pracovník', cz: 'Pomocný dělník', hu: 'Segédmunkás', de: 'Bauhelfer', en: 'Construction helper', ro: 'Ajutor pe șantier', pl: 'Pomocnik budowlany', bg: 'Общ работник' },
    eu: { slug: { de: 'bauhelfer', en: 'construction-helpers' }, name: { de: 'Bauhelfer', en: 'Construction helpers' } } },
  { key: 'ine', app: ['murar', 'betonar', 'tesar', 'obkladac'],
    name: { sk: 'Ďalšie remeslá', cz: 'Další řemesla', hu: 'Egyéb szakmák', de: 'Weitere Gewerke', en: 'Other trades', ro: 'Alte meserii', pl: 'Inne zawody', bg: 'Други професии' },
    one: { sk: 'Remeselník', cz: 'Řemeslník', hu: 'Szakember', de: 'Handwerker', en: 'Tradesperson', ro: 'Meseriaș', pl: 'Fachowiec', bg: 'Майстор' } },
];

const byKey = (k) => PROFESSIONS.find((p) => p.key === k) || null;
/** Profesia webu z kľúča remesla v appke (alebo z výslovne zadanej web_prof). */
const fromApp = (tradeKey) => PROFESSIONS.find((p) => p.app.includes(tradeKey)) || byKey('ine');
const euTrades = () => PROFESSIONS.filter((p) => p.eu);
const euBySlug = (lang, slug) => PROFESSIONS.find((p) => p.eu && p.eu.slug[lang] === slug) || null;
const nameOf = (p, lang, one = false) => (p ? ((one ? p.one : p.name)[lang] || (one ? p.one : p.name).sk) : '');

module.exports = { PROFESSIONS, byKey, fromApp, euTrades, euBySlug, nameOf };
