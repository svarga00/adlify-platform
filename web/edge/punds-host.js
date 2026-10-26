// ============================================================================
// punds web — spustenie naostro na doménach punds.sk a punds.eu
// ============================================================================
// ZATIAĽ VYPNUTÉ. Weby bežia na skúšobnej adrese:
//   https://adlify-app.netlify.app/punds-sk/sk/  a  /punds-eu/de/
//
// Postup pri spustení (keď je obsah schválený):
//   1. Netlify → projekt adlify-app → Domain management → Add domain alias:
//      punds.sk, www.punds.sk, punds.eu, www.punds.eu.
//   2. U registrátora domén nasmerovať DNS na Netlify (záznamy podľa Netlify).
//      Doterajší WordPress tým prestane byť na týchto doménach dostupný —
//      fotky z neho treba predtým nahrať k inzerátom (pole Fotka).
//   3. Tento súbor skopírovať do netlify/edge-functions/punds-host.js
//      (zapne sa sám pri ďalšom nasadení).
//
// Čo robí: požiadavku na punds.sk/… prepíše na /punds-sk/… (punds.eu na
// /punds-eu/…), ktoré obsluhuje funkcia punds-web. Statické súbory webu
// (/web/public/…) a interné adresy Netlify sa neprepisujú. Appka na
// adlify-app.netlify.app tým nie je dotknutá.
// ============================================================================
export default async (request, context) => {
  const url = new URL(request.url);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const prefix = host === 'punds.sk' ? '/punds-sk' : host === 'punds.eu' ? '/punds-eu' : null;
  if (!prefix) return;                                         // iné domény (appka) bez zmeny
  if (url.hostname.startsWith('www.')) {                       // www → bez www (jedna adresa pre Google)
    url.hostname = host;
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/web/public/') || url.pathname.startsWith('/.netlify/')) return;
  if (url.pathname.startsWith('/punds-')) return;              // už prepísané
  return context.rewrite(`${prefix}${url.pathname}${url.search}`);
};

export const config = { path: '/*', excludedPath: ['/web/public/*', '/.netlify/*'] };
