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

## `fonts/` — Inter a IBM Plex Mono

Písmo rozhrania (Inter, OFL) a písmo čísel (IBM Plex Mono, OFL).

**Prečo je tu a nie z Google Fonts.** Appka ho ťahala cez `@import` priamo
v `app.css`. To je najhorší možný spôsob: prehliadač musí ten súbor stiahnuť
**pred** vykreslením čohokoľvek, takže na pomalej sieti sa chvíľu nekreslí
nič. A keď sa nenačítal — blokátor, firemná sieť, výpadok — celé rozhranie
zrazu vyzeralo inak: iné písmo, iné rozmery, inak zalomené riadky.

Navyše to znamenalo, že Google vidí každé otvorenie appky.

**Čo presne je v súbore.** Len to, čo potrebujeme:

* `inter-latin.woff2`, `inter-latin-ext.woff2` — jeden **premenný** súbor na
  podmnožinu, váhy 400–800 naraz. `latin-ext` nesie mäkčene a dĺžne (ž, ť, ľ,
  ô, ĺ, ŕ) — bez neho by appka nevedela po slovensky.
* `plex-mono-400-latin.woff2`, `plex-mono-600-latin.woff2` — len číslice
  a latinka, mono sa používa na sumy, IBAN a čísla dokladov.

Spolu 168 kB. Cyrilika, gréčtina a vietnamčina z balíka vyhodené.

**Ako ich aktualizovať:**

```
curl -s "https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap" \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0" 
```

V odpovedi sú bloky `/* latin */` a `/* latin-ext */` — z nich si vezmi
adresy `.woff2` a stiahni ich sem pod rovnakými názvami. `unicode-range`
v `app.css` musí sedieť s tým, čo je v odpovedi, inak sa podmnožina načíta
aj tam, kde netreba (alebo sa nenačíta tam, kde treba).
