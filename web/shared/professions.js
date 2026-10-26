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
    name: { sk: 'Elektrikári', cz: 'Elektrikáři', hu: 'Villanyszerelők', de: 'Elektriker', en: 'Electricians' },
    one: { sk: 'Elektrikár', cz: 'Elektrikář', hu: 'Villanyszerelő', de: 'Elektriker', en: 'Electrician' } },
  { key: 'zvarac', app: ['zvarac'],
    name: { sk: 'Zvárači', cz: 'Svářeči', hu: 'Hegesztők', de: 'Schweißer', en: 'Welders' },
    one: { sk: 'Zvárač', cz: 'Svářeč', hu: 'Hegesztő', de: 'Schweißer', en: 'Welder' },
    eu: { slug: { de: 'schweissen', en: 'welding' }, name: { de: 'Schweißen MIG/MAG/TIG', en: 'Welding MIG/MAG/TIG' } } },
  { key: 'zamocnik', app: ['zamocnik'],
    name: { sk: 'Zámočníci', cz: 'Zámečníci', hu: 'Lakatosok', de: 'Schlosser', en: 'Metalworkers' },
    one: { sk: 'Zámočník', cz: 'Zámečník', hu: 'Lakatos', de: 'Schlosser', en: 'Metalworker' },
    eu: { slug: { de: 'metallbau', en: 'metalwork' }, name: { de: 'Schlosserei & Metallbau', en: 'Metalwork & steel construction' } } },
  { key: 'sadrokarton', app: ['trockenbau'],
    name: { sk: 'Sadrokartonisti', cz: 'Sádrokartonáři', hu: 'Gipszkartonozók', de: 'Trockenbauer', en: 'Drywall installers' },
    one: { sk: 'Sadrokartonista', cz: 'Sádrokartonář', hu: 'Gipszkartonozó', de: 'Trockenbauer', en: 'Drywall installer' },
    eu: { slug: { de: 'trockenbau', en: 'drywall' }, name: { de: 'Trockenbau', en: 'Drywall' } } },
  { key: 'maliar', app: ['maliar'],
    name: { sk: 'Maliari a tapetári', cz: 'Malíři a tapetáři', hu: 'Festők és tapétázók', de: 'Maler und Tapezierer', en: 'Painters & paperhangers' },
    one: { sk: 'Maliar / tapetár', cz: 'Malíř / tapetář', hu: 'Festő / tapétázó', de: 'Maler / Tapezierer', en: 'Painter / paperhanger' },
    eu: { slug: { de: 'maler', en: 'painters' }, name: { de: 'Maler & Tapezierer', en: 'Painters & decorators' } } },
  { key: 'zateplovac', app: ['omietkar'],
    name: { sk: 'Zatepľovači', cz: 'Zateplovači', hu: 'Homlokzati hőszigetelők', de: 'WDVS-Monteure', en: 'ETICS installers' },
    one: { sk: 'Zatepľovač (WDVS)', cz: 'Zateplovač (WDVS)', hu: 'Hőszigetelő (WDVS)', de: 'WDVS-Monteur', en: 'ETICS installer' },
    eu: { slug: { de: 'wdvs', en: 'etics' }, name: { de: 'WDVS / Fassadendämmung', en: 'ETICS / facade insulation' } } },
  { key: 'okna', app: ['montaznik'],
    name: { sk: 'Montéri okien a dverí', cz: 'Montéři oken a dveří', hu: 'Nyílászáró-szerelők', de: 'Fenster- und Türmonteure', en: 'Window & door fitters' },
    one: { sk: 'Montér okien a dverí', cz: 'Montér oken a dveří', hu: 'Nyílászáró-szerelő', de: 'Fenster- und Türmonteur', en: 'Window & door fitter' },
    eu: { slug: { de: 'fenster-tueren', en: 'windows-doors' }, name: { de: 'Fenster- & Türmontage', en: 'Window & door fitting' } } },
  { key: 'nabytok', app: [],
    name: { sk: 'Montéri nábytku', cz: 'Montéři nábytku', hu: 'Bútorszerelők', de: 'Möbelmonteure', en: 'Furniture fitters' },
    one: { sk: 'Montér nábytku', cz: 'Montér nábytku', hu: 'Bútorszerelő', de: 'Möbelmonteur', en: 'Furniture fitter' },
    eu: { slug: { de: 'moebelmontage', en: 'furniture-assembly' }, name: { de: 'Möbelmontage', en: 'Furniture assembly' } } },
  { key: 'vzduchotechnik', app: [],
    name: { sk: 'Vzduchotechnici', cz: 'Vzduchotechnici', hu: 'Légtechnikai szerelők', de: 'Lüftungsmonteure', en: 'HVAC installers' },
    one: { sk: 'Vzduchotechnik', cz: 'Vzduchotechnik', hu: 'Légtechnikai szerelő', de: 'Lüftungsmonteur', en: 'HVAC installer' } },
  { key: 'pomocnik', app: ['pomocnik'],
    name: { sk: 'Pomocní pracovníci', cz: 'Pomocní dělníci', hu: 'Segédmunkások', de: 'Bauhelfer', en: 'Construction helpers' },
    one: { sk: 'Pomocný pracovník', cz: 'Pomocný dělník', hu: 'Segédmunkás', de: 'Bauhelfer', en: 'Construction helper' },
    eu: { slug: { de: 'bauhelfer', en: 'construction-helpers' }, name: { de: 'Bauhelfer', en: 'Construction helpers' } } },
  { key: 'ine', app: ['murar', 'betonar', 'tesar', 'obkladac'],
    name: { sk: 'Ďalšie remeslá', cz: 'Další řemesla', hu: 'Egyéb szakmák', de: 'Weitere Gewerke', en: 'Other trades' },
    one: { sk: 'Remeselník', cz: 'Řemeslník', hu: 'Szakember', de: 'Handwerker', en: 'Tradesperson' } },
];

const byKey = (k) => PROFESSIONS.find((p) => p.key === k) || null;
/** Profesia webu z kľúča remesla v appke (alebo z výslovne zadanej web_prof). */
const fromApp = (tradeKey) => PROFESSIONS.find((p) => p.app.includes(tradeKey)) || byKey('ine');
const euTrades = () => PROFESSIONS.filter((p) => p.eu);
const euBySlug = (lang, slug) => PROFESSIONS.find((p) => p.eu && p.eu.slug[lang] === slug) || null;
const nameOf = (p, lang, one = false) => (p ? ((one ? p.one : p.name)[lang] || (one ? p.one : p.name).sk) : '');

module.exports = { PROFESSIONS, byKey, fromApp, euTrades, euBySlug, nameOf };
