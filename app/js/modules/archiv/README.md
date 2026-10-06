# Ubytovacia agenda — archív

Tieto moduly patria ubytovacej agende z v1 (dopyty, ponuky, objednávky,
klienti). Appka ich **nenačítava** — nie sú v `index.html` a v menu nie sú.

Nie sú zmazané a **ich tabuľky v databáze sú nedotknuté**: `danubra_inquiries`,
`danubra_offers`, `danubra_orders`, `danubra_clients` aj všetko, čo na ne
nadväzuje. Dá sa z nich kedykoľvek čítať.

Dôvod, prečo sú tu: nebolo sa jej kto venovať a držala v menu päť položiek,
ktoré nikam neviedli.

Pozor na názov: `orders.js` tu je **ubytovacia objednávka** z v1. Objednávky
v subdodávkach (od odberateľa a živnostníkovi) sú niečo iné a sú
v `app/js/modules/workorders.js` nad tabuľkou `danubra_work_orders`.
