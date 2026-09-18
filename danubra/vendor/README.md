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
