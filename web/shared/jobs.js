// ============================================================================
// punds web — ponuky práce z appky (Inzeráty)
// ============================================================================
// Na web ide inzerát, ktorý má v appke zaškrtnuté „Zverejniť na punds.sk"
// (danubra_ads.web_published) a je aktívny. Texty sú po slovensky; preklady
// do ďalších jazykov sú v `i18n` ({ cz: { title, body, duties… }, … }) — kým
// preklad nie je, ukáže sa slovenský text.
//
// Kým nie je zverejnený žiadny inzerát, skúšobná adresa ukazuje ukážkové
// ponuky (označené „Ukážka"). Na punds.sk/punds.eu sa ukážky nikdy neukážu.
// ============================================================================
'use strict';

const PROF = require('./professions');

// Fotky z doterajšieho webu punds.eu. Pred prepnutím domény ich treba
// uložiť k nám (inzerát má vlastnú fotku v `image_url`).
const IMG = {
  paint: 'https://punds.eu/wp-content/uploads/2026/06/magnific_photorealistic-wide-docum_wPKYKZK7EI-1-960x680.jpeg',
  weld: 'https://punds.eu/wp-content/uploads/2026/06/magnific_professional-welder-in-na_rlvqZRKxtc-960x680.jpeg',
  elec: 'https://punds.eu/wp-content/uploads/2026/06/magnific_professional-photograph-o_swhLuQLl8e-960x680.jpeg',
  mont: 'https://punds.eu/wp-content/uploads/2026/05/magnific_professional-photograph-o_rlvafFbxtc-960x680.jpeg',
};
const IMG_BY_PROF = { maliar: IMG.paint, zateplovac: IMG.paint, zvarac: IMG.weld, zamocnik: IMG.weld, elektrikar: IMG.elec, vzduchotechnik: IMG.elec };
const imageFor = (profKey) => IMG_BY_PROF[profKey] || IMG.mont;

// Súradnice miest, ktoré už poznáme — keď inzerát nemá vlastné.
const GEO = {
  Ulm: [48.4011, 9.9876], Bremen: [53.0793, 8.8017], Augsburg: [48.3705, 10.8978], Hamburg: [53.5511, 9.9937],
  Remscheid: [51.1787, 7.1897], Braunschweig: [52.2689, 10.5268], Berlin: [52.52, 13.405], München: [48.1374, 11.5755],
  Stuttgart: [48.7758, 9.1829], Köln: [50.9375, 6.9603], Frankfurt: [50.1109, 8.6821], Nürnberg: [49.4521, 11.0767],
  Hannover: [52.3759, 9.732], Leipzig: [51.3397, 12.3731], Dresden: [51.0504, 13.7373], Düsseldorf: [51.2277, 6.7735],
  Wien: [48.2082, 16.3738], Linz: [48.3069, 14.2858], Graz: [47.0707, 15.4395], Salzburg: [47.8095, 13.055],
};

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Riadok inzerátu (danubra_ads) → ponuka na web v danom jazyku.
 * Polia sú rovnaké pre ukážkové aj skutočné ponuky.
 */
function toJob(ad, lang = 'sk') {
  const tr = (ad.i18n && ad.i18n[lang]) || {};
  const pick = (k, fallback) => (tr[k] != null && tr[k] !== '' && !(Array.isArray(tr[k]) && !tr[k].length) ? tr[k] : fallback);
  const prof = PROF.byKey(ad.web_prof) || PROF.fromApp(ad.trade_key);
  const rateMin = ad.rate_offered != null ? Number(ad.rate_offered) : null;
  const rateMax = ad.rate_max != null ? Number(ad.rate_max) : rateMin;
  const geo = ad.lat != null && ad.lng != null ? [Number(ad.lat), Number(ad.lng)] : (GEO[ad.city] || null);
  const startNow = !!ad.start_now || !ad.starts_on || ad.starts_on <= today();
  return {
    id: ad.id,
    slug: ad.web_slug || `${slugify(ad.web_title || ad.title)}-${String(ad.id || '').slice(0, 6)}`,
    title: pick('title', ad.web_title || ad.title) || PROF.nameOf(prof, lang, true),
    prof: prof.key,
    profName: PROF.nameOf(prof, lang),
    city: ad.city || '',
    country: ad.country || 'DE',
    lat: geo ? geo[0] : null,
    lng: geo ? geo[1] : null,
    rateMin, rateMax,
    startNow,
    startDate: startNow ? null : ad.starts_on,
    duration: pick('duration', ad.duration) || '',
    hoursWeek: ad.hours_week != null ? Number(ad.hours_week) : null,
    rotation: ad.rotation || '',
    accommodation: ad.accommodation !== false,
    headcount: ad.headcount != null ? Number(ad.headcount) : null,
    description: pick('body', ad.web_body || ad.body) || '',
    duties: pick('duties', ad.duties) || [],
    requirements: pick('requirements', ad.requirements) || [],
    benefits: pick('benefits', ad.benefits) || [],
    faq: pick('faq', ad.faq) || [],
    image: ad.image_url || imageFor(prof.key),
    publishedAt: ad.published_at || ad.created_at || null,
    demo: !!ad.demo,
  };
}

/** Ukážkové ponuky z návrhu webu — len pre skúšobnú adresu. Nástup o pár týždňov od dnes. */
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const DEMO_ADS = [
  { title: 'Maliar / tapetár', web_prof: 'maliar', city: 'Ulm', rate_offered: 24, rate_max: 27, start_now: true, duration: '6+ mesiacov', hours_week: 50, rotation: '4+1', headcount: 3 },
  { title: 'Zvárač MIG/MAG (135)', web_prof: 'zvarac', city: 'Bremen', rate_offered: 29, rate_max: 30, starts_on: inDays(9), duration: '12 mesiacov', hours_week: 50, rotation: '4+1', headcount: 2,
    body: 'Hľadáme skúsených zváračov metódou MIG/MAG (135) na oceľové konštrukcie pre priemyselnú halu v Bremene.',
    duties: ['Zváranie oceľových konštrukcií metódou 135', 'Príprava zvarových plôch, kontrola kvality zvarov', 'Práca podľa výkresovej dokumentácie'],
    requirements: ['Certifikát ISO 9606-1 (135)', 'Min. 2 roky praxe', 'Živnosť (SZČO) alebo ochota ju založiť'],
    benefits: ['29–30 € / hod. na faktúru', 'Ubytovanie zabezpečené', 'Platba každých 14 dní', 'Vybavíme A1, Steuernummer, Freistellung'] },
  { title: 'Elektrikár', web_prof: 'elektrikar', city: 'Augsburg', rate_offered: 25, rate_max: 28, start_now: true, duration: 'Dlhodobo', hours_week: 45, rotation: '4+1', headcount: 4 },
  { title: 'Sadrokartonista', web_prof: 'sadrokarton', city: 'Hamburg', rate_offered: 25, rate_max: 28, starts_on: inDays(16), duration: '4 mesiace', hours_week: 50, rotation: '3+1', headcount: 2 },
  { title: 'Zámočník', web_prof: 'zamocnik', city: 'Remscheid', rate_offered: 25, rate_max: 27, start_now: true, duration: '6 mesiacov', hours_week: 50, rotation: '4+1', headcount: 2 },
  { title: 'Zatepľovač (WDVS)', web_prof: 'zateplovac', city: 'Braunschweig', rate_offered: 23, rate_max: 26, starts_on: inDays(23), duration: '3 mesiace', hours_week: 50, rotation: '4+1', headcount: 4 },
  { title: 'Montér okien a dverí', web_prof: 'okna', city: 'Augsburg', rate_offered: 24, rate_max: 27, start_now: true, duration: '5 mesiacov', hours_week: 45, rotation: '4+1', headcount: 2 },
  { title: 'Zvárač TIG (141)', web_prof: 'zvarac', city: 'Ulm', rate_offered: 30, rate_max: 33, starts_on: inDays(37), duration: 'Dlhodobo', hours_week: 50, rotation: '4+1', headcount: 2 },
].map((a, i) => ({ ...a, id: `demo-${i + 1}`, web_slug: `ukazka-${slugify(a.title)}-${a.city.toLowerCase()}`, active: true, web_published: true, demo: true, created_at: '2026-10-01' }));

const COLS = 'id,title,web_title,web_body,trade_key,web_prof,city,country,rate_offered,rate_max,starts_on,start_now,duration,hours_week,rotation,'
  + 'accommodation,headcount,body,duties,requirements,benefits,faq,i18n,image_url,lat,lng,web_slug,published_at,created_at,active,web_published,ends_on';

/**
 * Načíta zverejnené inzeráty. Výsledok drží minútu v pamäti funkcie —
 * stránky sa navyše cachujú na CDN (punds-web.js).
 */
function loader(supabase) {
  let cache = null, at = 0;
  return async function ads({ demoIfEmpty = false } = {}) {
    if (!cache || Date.now() - at > 60000) {
      let rows = [];
      try {
        const { data, error } = await supabase.from('danubra_ads').select(COLS)
          .eq('web_published', true).eq('active', true).order('published_at', { ascending: false, nullsFirst: false }).limit(300);
        if (!error) rows = (data || []).filter((a) => !a.ends_on || a.ends_on >= today());
      } catch (e) { rows = []; }
      cache = rows; at = Date.now();
    }
    return cache.length || !demoIfEmpty ? cache : DEMO_ADS;
  };
}

module.exports = { toJob, DEMO_ADS, loader, slugify, imageFor, GEO, IMG, COLS };
