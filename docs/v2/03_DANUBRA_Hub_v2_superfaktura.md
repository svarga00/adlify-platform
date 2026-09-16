# DANUBRA Hub v2 — integrácia SuperFaktúra

Verzia 1 · 16. 9. 2026 · podľa oficiálnej dokumentácie
[github.com/superfaktura/docs](https://github.com/superfaktura/docs)

---

## 1. Prečo cez SuperFaktúru a nie vlastným generátorom

v1 si faktúry generoval sám vrátane QR platby. Fungovalo to, ale:

- číslovanie musí sedieť s účtovníctvom, nie s našou tabuľkou,
- účtovníčka potrebuje doklady tam, kde ich má zvyknuté,
- prijaté faktúry a výdavky treba viesť tak či tak.

Preto od v2: **SuperFaktúra je zdroj pravdy pre doklady**, appka je zdroj pravdy
pre to, *z čoho* doklad vznikol (hodiny, zákazka, nasadenie).

Vlastný QR generátor z v1 (`lib/qr.js`) **zostáva** — hodí sa na podklady
a interné dokumenty, kde nie je dôvod robiť účtovný doklad.

---

## 2. Prístup a prostredia

### Adresy

| Prostredie | Základná adresa |
|---|---|
| Sandbox SK | `https://sandbox.superfaktura.sk` |
| Produkcia SK | `https://moja.superfaktura.sk` |

**F6 aj F7 sa robia výhradne proti sandboxu.** Na produkciu sa prepne až po
tom, čo prejdú ostré testy a ty to odsúhlasíš.

### Autentifikácia

Hlavička na každej požiadavke:

```
Authorization: SFAPI email=UCET@DANUBRA.EU&apikey=TOKEN&module=DANUBRA
```

Voliteľne `&company_id=...`, keď je pod účtom viac firiem.
Všetky hodnoty musia byť URL-enkódované.

### Premenné prostredia

```
SF_EMAIL          e-mail účtu v SuperFaktúre
SF_API_KEY        API token
SF_COMPANY_ID     voliteľné
SF_ENV            sandbox | production      (predvolene sandbox)
```

**Kľúč nikdy nejde do prehliadača.** Všetky volania idú zo serverovej funkcie
`netlify/functions/danubra-sf-*.js`. Frontend volá našu funkciu, nie
SuperFaktúru.

### Formát požiadavky

API berie `application/json` alebo `application/x-www-form-urlencoded`
s poľom `data=` obsahujúcim URL-enkódovaný JSON. Použijeme **JSON** — je to
čitateľnejšie a menej sa pri ňom dá pomýliť.

---

## 3. Endpointy, ktoré budeme používať

### Vydané faktúry (F6)

| Čo | Metóda a cesta |
|---|---|
| vystaviť | `POST /invoices/create` |
| upraviť | `POST /invoices/edit` |
| detail | `GET /invoices/view/{ID}.json` |
| zoznam | `GET /invoices/index.json` |
| PDF | `GET /invoices/pdf/{ID}/token:{TOKEN}` |
| odoslať e-mailom | `POST /invoices/send` |
| označiť uhradenú | `POST /invoices/pay` |

### Prijaté faktúry a náklady (F7)

| Čo | Metóda a cesta |
|---|---|
| pridať výdavok | `POST /expenses/add` |
| upraviť | `POST /expenses/edit` |
| detail | `GET /expenses/view/{ID}.json` |
| zoznam | `GET /expenses/index.json` |
| zaznamenať úhradu | `POST /expense_payments/add` |

### Odberatelia

Klient sa zakladá spolu s faktúrou (objekt `Client` v payloade) a pri
`update_addressbook: 1` sa uloží do adresára. Vrátené `client_id` si uložíme
do `danubra_partners.sf_client_id`, aby sa ďalšia faktúra naviazala naň.

---

## 4. Ako vyzerá payload faktúry

```json
{
  "Invoice": {
    "name": "Subdodávateľské práce 09/2026",
    "type": "regular",
    "invoice_currency": "EUR",
    "variable": "20260042",
    "constant": "0308",
    "created": "2026-10-01",
    "due": "2026-10-31",
    "payment_type": "transfer",
    "issued_by": "Štefan Varga",
    "comment": "Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)."
  },
  "Client": {
    "name": "Bauer Bau GmbH",
    "ic_dph": "DE811234567",
    "address": "Industriestraße 12",
    "city": "Leipzig",
    "zip": "04329",
    "country_id": 63,
    "email": "bauer@bauerbau.de",
    "update_addressbook": 1
  },
  "InvoiceItem": [
    {
      "name": "Sadrokartónové práce — Leipzig, KW 36–39",
      "description": "Podľa výkazu hodín, príloha",
      "quantity": 312,
      "unit": "h",
      "unit_price": 28.00,
      "tax": 0
    }
  ],
  "InvoiceSetting": {
    "language": "deu",
    "bysquare": 1,
    "online_payment": 0
  }
}
```

### Poznámky k poliam

- **`tax: 0`** pri nemeckom odberateľovi s USt-IdNr — reverse charge §13b.
  Do `comment` patrí povinná veta po nemecky.
- **`variable`** = variabilný symbol. Použijeme ho na spätné párovanie
  s bankovým výpisom (F8), takže musí byť jedinečný a odvodený od faktúry.
- **`unit: "h"`** pri hodinovej fakturácii, `"ks"` alebo `"m2"` pri dielu.
- **`country_id`** je číselník SuperFaktúry — Nemecko je potrebné overiť
  v sandboxe pred prvým ostrým použitím.
- Položky vznikajú **z uzavretého obdobia** (`danubra_periods`), nie ručným
  písaním.

---

## 5. Schvaľovací tok — najdôležitejšia časť

Toto je tvrdé pravidlo z návrhu a integrácia ho nesmie obísť.

```
podklad (uzavreté hodiny)
        ↓
  faktúra: draft
        ↓  appka dopočíta sumy, §48b, reverse charge
  pending_approval        ← tu to STOJÍ
        ↓  admin klikne „Schváliť" a vidí sumu, odberateľa aj položky
     approved
        ↓  serverová funkcia zavolá /invoices/create
      issued              ← uloží sa sf_invoice_id a sf_token
        ↓  admin klikne „Odoslať" (samostatné rozhodnutie)
       sent               ← /invoices/send
        ↓  banka alebo ručne
       paid               ← /invoices/pay
```

**Čo je zakázané:**

- cron nesmie posunúť faktúru z `pending_approval` ďalej,
- schválenie a odoslanie sú **dve samostatné rozhodnutia** — schválená faktúra
  sa neodošle sama,
- serverová funkcia musí pred volaním SuperFaktúry overiť stav v databáze;
  nestačí, že to poslal frontend.

Zapísané pri každej faktúre: kto schválil (`approved_by`) a kedy
(`approved_at`).

---

## 6. §48b — zrážka 15 %

Pri stavebných prácach bez Freistellungsbescheinigung odberateľ zo zákona zrazí
15 % a odvedie ich nemeckému finančnému úradu.

Appka to musí ukázať **skôr**, než faktúru schváliš:

```
Fakturovaná suma      8 736,00 €
Zrážka §48b (15 %)   −1 310,40 €
Na účet príde         7 425,60 €
```

Ukladá sa do `withholding_pct`, `withholding_amount`, `amount_net`.
Do SuperFaktúry ide **plná suma** — zrážka nie je zľava, je to daňová
povinnosť odberateľa. Poznámka o nej patrí do `comment`.

Keď `danubra_subcontracts.freistellung_verified = true`, zrážka je nula.

---

## 7. Prijaté faktúry od živnostníkov

Živnostník pošle faktúru. Appka vie, koľko má schválených hodín, takže:

1. sken sa uloží do `danubra_bills.storage_path`,
2. appka dopočíta `expected_amount` = schválené hodiny × jeho sadzba,
3. `variance` = rozdiel. Nenulový rozdiel → stav `disputed` a faktúra sa
   **nedá schváliť bez poznámky**,
4. po schválení sa zapíše do SuperFaktúry ako výdavok
   (`POST /expenses/add`), uloží sa `sf_expense_id`,
5. po úhrade `POST /expense_payments/add`.

Toto je miesto, kde sa najčastejšie strácajú peniaze — človek vyfakturuje viac
hodín, než odrobil, a nikto to nezachytí. Preto je kontrola automatická.

---

## 8. Párovanie s bankou (F8)

- príjem sa páruje podľa `variable_symbol` → `danubra_invoices.variable`,
- výdaj podľa IBAN-u živnostníka a sumy → `danubra_bills`,
- čo sa nespáruje, zostane v zozname nespárovaných; nič sa nezahadzuje,
- po spárovaní príjmu sa faktúra označí ako uhradená aj v SuperFaktúre.

---

## 9. Ošetrenie chýb

| Situácia | Čo appka spraví |
|---|---|
| SuperFaktúra nedostupná | faktúra zostane `approved`, zapíše sa chyba, skúsi sa znova |
| API vráti chybu validácie | stav sa nezmení, chyba sa ukáže celá |
| chýba `SF_API_KEY` | funkcia ticho skončí a povie to — nič sa nerozbije |
| faktúra už má `sf_invoice_id` | druhé vystavenie sa odmietne |

**Nikdy sa nesmie stať, že faktúra je vystavená v SuperFaktúre a appka o tom
nevie.** Preto sa `sf_invoice_id` ukladá v tej istej transakcii ako zmena stavu,
a pri neistote sa radšej nevystaví.

---

## 10. Postup implementácie

**F6**
1. serverová funkcia `danubra-sf-invoice.js` — vystaviť, odoslať, označiť úhradu
2. schvaľovacia obrazovka so všetkým, čo treba pred kliknutím vidieť
3. testy na výpočty súm, §48b a na to, že sa `pending_approval` nedá preskočiť
4. overenie v sandboxe na skutočnej faktúre s hodinami

**F7**
5. `danubra-sf-expense.js` — výdavky a ich úhrady
6. kontrola prijatej faktúry voči hodinám
7. testy na rozdiel a na zákaz schválenia sporného dokladu

**Prechod na produkciu** — až keď obe fázy prejdú v sandboxe a povieš, že áno.
Prepína sa jedinou premennou `SF_ENV`.

---

## 11. Čo ešte treba overiť v sandboxe

Dokumentácia to nehovorí jednoznačne, takže sa to zistí pokusom:

- číselník `country_id` pre Nemecko,
- či `/invoices/send` vie poslať na viac adries naraz,
- v akom formáte vracia `/invoices/index.json` stránkovanie,
- či sa dá pri výdavku priložiť súbor rovno pri `add`, alebo až dodatočne.

Zistené sa dopíše do `DECISIONS.md`.
