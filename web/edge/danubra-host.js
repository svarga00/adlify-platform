// ============================================================================
// DANUBRA web — spustenie naostro na doménach danubra.sk a danubra.eu
// ============================================================================
// ZATIAĽ VYPNUTÉ. Weby bežia na skúšobnej adrese:
//   https://adlify-app.netlify.app/danubra-sk/sk/  a  /danubra-eu/de/
//
// Postup pri spustení (keď je obsah schválený):
//   1. Netlify → projekt adlify-app → Domain management → Add domain alias:
//      danubra.sk, www.danubra.sk, danubra.eu, www.danubra.eu
//      a kvôli presmerovaniu aj staré punds.sk, www.punds.sk, punds.eu,
//      www.punds.eu.
//   2. U registrátora domén nasmerovať DNS na Netlify (záznamy podľa Netlify).
//      Doterajší WordPress na punds.eu tým prestane byť dostupný — fotky
//      z neho treba predtým nahrať k inzerátom (pole Fotka).
//   3. Tento súbor skopírovať do netlify/edge-functions/danubra-host.js
//      (zapne sa sám pri ďalšom nasadení).
//
// Čo robí:
//   - požiadavku na danubra.sk/… prepíše na /danubra-sk/… (danubra.eu na
//     /danubra-eu/…), ktoré obsluhuje funkcia danubra-web;
//   - www.danubra.* → danubra.* (301, jedna adresa pre Google);
//   - staré domény značky punds (punds.sk, punds.eu, aj s www) presmeruje
//     natrvalo (301) na rovnakú cestu a parametre na danubra.sk / danubra.eu.
// Statické súbory webu (/web/public/…) a interné adresy Netlify sa
// neprepisujú. Appka na adlify-app.netlify.app tým nie je dotknutá.
// ============================================================================

/** Nová doména → predpona webu. */
const SITES = { 'danubra.sk': '/danubra-sk', 'danubra.eu': '/danubra-eu' };
/** Stará doména (bez www) → nová. Porovnáva sa celé meno, nie začiatok ani koniec. */
const LEGACY = { 'punds.sk': 'danubra.sk', 'punds.eu': 'danubra.eu' };

export default async (request, context) => {
  const url = new URL(request.url);
  const name = url.hostname.toLowerCase();
  const host = name.replace(/^www\./, '');
  if (Object.prototype.hasOwnProperty.call(LEGACY, host)) {      // stará značka → nová doména, tá istá cesta
    url.hostname = LEGACY[host];
    url.port = '';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  const prefix = Object.prototype.hasOwnProperty.call(SITES, host) ? SITES[host] : null;
  if (!prefix) return;                                         // iné domény (appka) bez zmeny
  if (name !== host) {                                         // www → bez www (jedna adresa pre Google)
    url.hostname = host;
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/web/public/') || url.pathname.startsWith('/.netlify/')) return;
  if (url.pathname.startsWith('/danubra-')) return;            // už prepísané
  return context.rewrite(`${prefix}${url.pathname}${url.search}`);
};

// Statické súbory (/web/public/…) edge funkcia nespúšťa vôbec — na starej
// doméne ich Netlify podá rovnako ako na novej (ten istý web).
export const config = { path: '/*', excludedPath: ['/web/public/*', '/.netlify/*'] };
