# Cudzí kód, ktorý si nesieme so sebou

## `supabase-js-2.116.0.js`

Klient Supabase, UMD build verzie 2.116.0.

**Prečo je tu a nie z CDN.** Appka ho predtým ťahala z `unpkg.com`. Keď sa
to nenačítalo — blokátor reklám, firemná sieť, výpadok CDN — stránka zostala
**úplne biela a bez hlášky**, lebo bez klienta sa nespustí ani prihlásenie.
Stalo sa to v prevádzke.

Zvyšok appky nemá ani jednu cudziu závislosť (preto sú aj peniaze počítané
v celých centoch namiesto decimal.js z CDN). Tento súbor bol jediná výnimka
a jediné miesto, kde cudzí server mohol appku zhodiť.

**Ako ho aktualizovať:**

```
npm i @supabase/supabase-js@latest
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js \
   danubra/vendor/supabase-js-<verzia>.js
```

Potom prepíš `<script src>` v `danubra/index.html` a spusti `npm test`.
Názov súboru obsahuje verziu zámerne — nech je z `index.html` vidieť, čo
sa načítava, a nech starý súbor nezostane v cache pod tým istým menom.

## `leaflet-1.9.4.js` + `leaflet-1.9.4.css`

Mapa pre stavby a ubytovania, verzia 1.9.4 (BSD-2-Clause).

**Prečo je tu a nie z CDN.** Z rovnakého dôvodu ako Supabase vyššie. Navyše
`cdnjs.cloudflare.com` je z nášho prostredia zablokovaný firemnou politikou,
takže súbory prišli z npm.

**Značky sú kreslené cez CSS, nie cez obrázky.** Leaflet má predvolené ikony
ako PNG, ktoré si ťahá relatívnou cestou — to by bola ďalšia závislosť, ktorá
sa dá rozbiť presunutím súboru. Používame `L.divIcon`, takže z balíka
potrebujeme len tieto dva súbory a nič z priečinka `images/`.

**Dlaždice mapy sú jediná vec, ktorá ide zvonku.** Adresa sa dá prepísať
v Nastaveniach (`settings.staffing.tile_url`), takže sa dá prejsť na
plateného poskytovateľa bez zásahu do kódu. Keď sa dlaždice nenačítajú,
mapa zostane sivá, ale **značky a vzdialenosti fungujú ďalej** — poloha sa
počíta u nás, nie na cudzom serveri.

**Ako ho aktualizovať:**

```
npm pack leaflet@<verzia>
tar xzf leaflet-<verzia>.tgz
cp package/dist/leaflet.js  danubra/vendor/leaflet-<verzia>.js
cp package/dist/leaflet.css danubra/vendor/leaflet-<verzia>.css
```

Potom prepíš oba odkazy v `index.html`.
