# punds web — punds.sk a punds.eu

Dva weby jednej značky **punds** (Partner und Service s. r. o.):

| web | pre koho | jazyky | cieľ |
|---|---|---|---|
| punds.sk | remeselníci zo SK/CZ/HU | sk (predvolený), cz, hu, de, en | prihláška na ponuku |
| punds.eu | nemecké firmy | de (predvolený), en | dopyt (Anfrage) |

Návrh: `design_handoff_punds_web` (README + `designs/*.dc.html`). Farby, písma a komponenty sú v `public/css/base.css`.

## Ako to beží

- Stránky skladá na serveri funkcia `netlify/functions/punds-web.js` → `web/server.js`. Žiadny build.
- Skúšobne pod appkou: `adlify-app.netlify.app/punds-sk/sk/…` a `/punds-eu/de/…` (`netlify.toml`).
- Naostro: domény punds.sk a punds.eu sa pridajú k webu appky a zapne sa edge funkcia `web/edge/punds-host.js`.
- CDN drží stránky 5 minút, takže nový inzerát z appky je na webe do pár minút.
- Statické súbory sú len v `web/public/` (`/web/public/…`). Písma a vlajky sú u nás, nie z Google ani flagcdn (GDPR).
- Ponuky práce sú **Inzeráty z appky** (`danubra_ads`, zaškrtnuté „Zverejniť na punds.sk"). Model ponuky je v `shared/jobs.js → toJob()`.
- Na skúšobnej adrese sa bez zverejneného inzerátu ukážu ukážkové ponuky (`demo: true`). Na punds.sk sa ukážky neukážu nikdy.
- Formuláre posielajú JSON na `{base}/api/<meno>` (`web/api.js`):
  - prihlášky idú do Kandidátov;
  - dopyty idú do Dopytov.

## Obsah z appky (Marketing → Weby)

`web/content.js` načíta z `danubra_web_content` (cache 60 s):
- **Texty:** `texts:<web>:<stránka>` = `{ jazyk: { cesta: text } }`. Prepíšu reťazce v `T` stránky (každá stránka exportuje `module.exports.T`, remeslá aj `TRADES`). Pred každým skladaním sa vrátia do pôvodného stavu.
- **Kontakty a fotky** (`contacts`, `images`): nahradia sa v hotovom HTML.
- **Tím a firma** (`team`, `company`): sú v `ctx.content`.

Appka si popis textov berie z `GET {base}/api/schema`.

## Lokálne

```
node web/dev.js 8790        # http://localhost:8790/punds-sk/sk/  ·  /punds-eu/de/
node web/tests/web.test.js  # prejde všetky odkazy všetkých jazykov
```

## Stránka

`web/<sk|eu>/pages/<trasa>.js` exportuje `async function render(ctx)` a vracia:

```js
{ title, description, body,        // body = HTML obsah <main>
  css: ['css/sk-jobs.css'], js: ['js/sk-jobs.js'],   // vlastné súbory stránky (cesty v web/public)
  bodyClass, nav: 'jobs',          // zvýraznená položka menu
  status: 404,                     // voliteľne; vrátiť null = 404
  image }                          // og:image
```

`ctx` (z `shared/layout.js → context()`):
- `ctx.lang`: kód v adrese (`sk`, `cz`, `hu`, `de`, `en`); `ctx.html` = kód pre `<html lang>` (`cs` pre `cz`);
- `ctx.site`, `ctx.route`, `ctx.params`, `ctx.query`, `ctx.base`, `ctx.prod`;
- `ctx.url(route, params?, lang?)`: odkaz na stránku tohto webu (trasy sú v `shared/sites.js`);
- `ctx.asset('img/…')`: statický súbor;
- `await ctx.jobs()`: ponuky v jazyku stránky (len punds.sk);
- `ctx.t`: spoločné texty webu (`sk/common.js`, `eu/common.js → T[lang]`).

Pomocníky: `shared/h.js` (`esc`, `each`, `cls`, `num`, `plural`), `shared/brand.js` (`mark`, `logo`), `shared/professions.js`, `sk/common.js` (`rate`, `start`, `facets`, `PHONE`, `MAIL`, `tel`).

## Pravidlá

- **Všetko z dát cez `esc()`.**
- **Texty stránky sú v súbore stránky:** `const T = { sk: {…}, cz: {…}, … }` pre všetky jazyky webu.
  - Oslovujeme **vykaním** (sk/cz „Vy", hu „Ön", de „Sie").
  - Tykanie z návrhu sa prepíše.
- **Žiadne štatistiky** (počty firiem, ľudí).
  - Administratívu (A1, Steuernummer, Freistellung) len spomenúť, nepropagovať ako hlavný produkt.
  - Arbeitnehmerüberlassung len s poznámkou, že vyžaduje licenciu AÜG (overí sa s klientom).
- **Štýly:** triedy, nie inline štýly. Každá skupina stránok má vlastný CSS súbor v `public/css/`. `base.css` je spoločný.
  - Responzívne: ≤767 mobil (podľa `PUNDS Mobile.dc.html`), 768–1199 tablet, ≥1200 desktop.
  - Bez vodorovného posúvania stránky.
- **Animácie:** `.rv` (objaví sa pri posúvaní), `.rv-in` (hneď), `.floaty`. Musia rešpektovať `prefers-reduced-motion` (v `base.css`).
- **Formulár:**
  - značka: `<form class="form" data-form="apply|contact|enquiry">`;
  - povinné polia `required`, súhlas `<input type="checkbox" name="consent" required>`;
  - pasca na roboty `<div class="hp"><input name="website" tabindex="-1" autocomplete="off"></div>`;
  - `<div class="form-msg" role="alert"></div>`;
  - poďakovanie v `<template data-ok>…</template>`;
  - odoslanie a kontrolu polí robí `public/js/site.js`.
- **Polia API:**
  - `apply`: `name, phone, email, note, consent, job` (slug ponuky);
  - `contact`: `name, phone, profession, message, consent`;
  - `enquiry`: `company, name, email, phone, trades[], headcount, location, start, model (werkvertrag|aueg|open), message, consent, trade`.
- **Fotky** sú zatiaľ z punds.eu (WordPress). Pred prepnutím domény ich treba stiahnuť k nám.
