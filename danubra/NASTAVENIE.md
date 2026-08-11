# DANUBRA — čo kam nahrať

Krok za krokom, aby aplikácia bežala naostro. Body 1 a 2 sú povinné, zvyšok
podľa toho, čo chceš používať.

Adresa aplikácie: **`https://adlify-app.netlify.app/danubra/`**

---

## 1. Migrácie do Supabase — POVINNÉ

Supabase → tvoj projekt → **SQL Editor** → **New query** → vložiť obsah
súboru → **Run**. Vždy počkaj, kým dobehne, až potom ďalší.

Poradie je záväzné, každý súbor stavia na predchádzajúcom:

| Poradie | Súbor | Čo urobí |
|---|---|---|
| 1 | `danubra/database/migrations/001_schema.sql` | 18 základných tabuliek, RLS, indexy |
| 2 | `danubra/database/migrations/002_numbering.sql` | číslovanie objednávok a faktúr |
| 3 | `danubra/database/migrations/003_staffing.sql` | subdodávky: pracovníci, zákazky, hodiny |
| 4 | `danubra/database/migrations/004_recruiting_ai.sql` | AI nábor: súhlasy, hovory, sľuby |
| 5 | `danubra/database/migrations/005_tasks.sql` | úlohy a pripomienky |
| 6 | `danubra/database/migrations/006_seed_demo.sql` | vzorové dáta (voliteľné, ale odporúčam) |

Šiestku spusti, ak chceš appku hneď vidieť naplnenú. Je idempotentná — dá sa
spustiť opakovane a nič nezduplikuje. Na jej konci je pripravený mazací príkaz,
keď budeš ukážky chcieť preč.

## 2. Prihlasovací účet — POVINNÉ

Supabase → **Authentication** → **Users** → **Add user** → *Create new user*.
Zadaj e-mail a heslo, zaškrtni *Auto Confirm User*. Týmto sa potom prihlásiš.

## 3. Fakturačné údaje

Bez nich sa dá appka používať, ale na faktúrach nebude IBAN ani QR platba.

Doplniť sa dajú **priamo v aplikácii**: `Nastavenia` → *Fakturačné údaje*.
Vyplň názov firmy, IBAN, IČO, e-mail, telefón a adresu.

Alebo cez SQL:

```sql
update danubra_settings set supplier = jsonb_build_object(
  'name',       'DANUBRA s.r.o.',
  'iban',       'SK00 0000 0000 0000 0000 0000',
  'company_id', '12345678',
  'vat_id',     '',
  'email',      'info@danubra.eu',
  'phone',      '+421 000 000 000',
  'address',    'Ulica 1, 000 00 Mesto',
  'vat_note',   'Nie sme platiteľmi DPH.'
);
```

---

## 4. Premenné prostredia v Netlify

Netlify → tvoj web → **Site configuration** → **Environment variables** →
**Add a variable**. Po pridaní daj **Deploys → Trigger deploy**, inak sa
nenačítajú.

### Serverové funkcie (crony, SMS, webhook)

| Premenná | Načo | Kde ju vziať |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | crony a webhooky píšu do databázy | Supabase → Settings → API → *service_role* |
| `CRON_SECRET` | ochrana cronov pred cudzím spustením | vymysli si dlhý náhodný reťazec |

Bez `SUPABASE_SERVICE_ROLE_KEY` nebudú fungovať automatické prechody stavov
ani mesačné návrhy faktúr. **Tento kľúč nikdy nedávaj do frontendu.**

### Príjem dopytov z webu

| Premenná | Načo |
|---|---|
| `FORMS_SECRET` | aby endpoint nemohol zaplniť ktokoľvek |

Formulár na `danubra-web` potom posiela na:
`https://adlify-app.netlify.app/.netlify/functions/danubra-webhook-forms`
s hlavičkou `X-Danubra-Secret: <hodnota>` alebo `?secret=<hodnota>` v adrese.

### SMS

| Premenná | Hodnota |
|---|---|
| `SMS_PROVIDER` | `twilio` alebo `log` |
| `TWILIO_ACCOUNT_SID` | z Twilio konzoly |
| `TWILIO_AUTH_TOKEN` | z Twilio konzoly |
| `SMS_SENDER_ID` | tvoje odosielacie číslo |

Ak `SMS_PROVIDER` nenastavíš, beží režim `log` — správa sa nikde neodošle, iba
zapíše. Hodí sa na skúšanie.

### AI nábor

| Premenná | Načo |
|---|---|
| `OPENAI_API_KEY` | prepis nahrávok cez Whisper |
| `ANTHROPIC_API_KEY` | vytiahnutie dohôd z prepisu |
| `CLAUDE_MODEL` | voliteľné, predvolene `claude-haiku-4-5-20251001` |

---

## 5. Úložisko na nahrávky (len pre AI nábor)

Supabase → **Storage** → **New bucket** → názov `danubra-calls`.
Nechaj ho **privátny**. Nahrávky doň nahráš a v aplikácii zadáš odkaz.

---

## Čo si overiť po nasadení

1. Otvor `/danubra/` — má sa objaviť prihlásenie s logom.
2. Prihlás sa účtom z bodu 2.
3. Ak si spustil migráciu 006, na dashboarde uvidíš čísla a niekoľko upozornení.
4. `Faktúry` → otvor ľubovoľnú → *Dokument s QR* — má sa otvoriť faktúra
   s QR kódom. Ak QR chýba, nemáš vyplnený IBAN.
5. `Compliance` — má ukázať, čo je platné a čo treba doriešiť.

## Poznámka k vzorovým dátam

Sú zámerne nastavené tak, aby bolo vidieť aj varovania: jednému pracovníkovi
o mesiac končí A1, ďalší ho vôbec nemá, §48b sa ešte vybavuje, jeden inzerát
treba obnoviť a jeden dopyt čaká bez reakcie. Tak si hneď uvidíš, ako sa
aplikácia správa, keď niečo nesedí.
