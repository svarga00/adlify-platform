# Gmail API setup — cold outreach pre Adlify

> **Čo to robí:** umožní posielanie cold outreach emailov priamo z tvojich
> Gmail / Workspace mailboxov (namiesto Resend). Zero risk suspensie,
> vyzerá ako reálny človek, 500 mailov/deň per mailbox.

---

## 1. Google Cloud Console — projekt

### 1.1 Otvor konzolu
1. Choď na **https://console.cloud.google.com/**
2. Prihlás sa účtom ktorý bude *vlastniť* OAuth aplikáciu
   (odporúčam `stefan@adlify.eu` — tvoj hlavný admin účet)
3. Hore vľavo klik na **dropdown projektov** → **New Project**
4. Name: `Adlify Production` (alebo ako už máš z Ad Platforms)
5. Klik **Create**

### 1.2 Zapni Gmail API
1. V ľavom menu: **APIs & Services** → **Library**
2. Vyhľadaj „Gmail API"
3. Klik **Enable**
4. Rovnako „People API" (pre user profile fetch) — **Enable**

---

## 2. OAuth Consent Screen

### 2.1 Configure
1. V ľavom menu: **APIs & Services** → **OAuth consent screen**
2. User Type:
   - **Internal** — ak máš Google Workspace pre `adlify.eu` a chceš len účty z tvojej domény
   - **External** — ak chceš aj osobné Gmail účty alebo iných userov
   - *Odporúčam:* **External** (flexibilnejšie, pre max 100 test users bez verifikácie)
3. Klik **Create**

### 2.2 App information
- App name: `Adlify Outreach`
- User support email: `stefan@adlify.eu`
- App logo: upload logo z adlify.eu (optional ale pekné)
- Application home page: `https://adlify.eu`
- Application privacy policy: `https://adlify.eu/privacy` (musí existovať)
- Application terms of service: `https://adlify.eu/terms` (optional)
- Authorized domains: pridaj **`adlify.eu`**
- Developer contact: `stefan@adlify.eu`
- Klik **Save and Continue**

### 2.3 Scopes
Klik **Add or Remove Scopes**, potom v dialógu paste tieto scope stringy (cez search):

```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

Prípadne aj ak budeš chcieť Ads/Analytics cez tú istú app:
```
https://www.googleapis.com/auth/adwords
https://www.googleapis.com/auth/analytics.readonly
```

Klik **Update** → **Save and Continue**.

> ⚠️ **Dôležité:** `gmail.send` je **restricted scope**. V **Testing** móde
> funguje bez verifikácie pre maximum 100 test users. Pre **production**
> mode je potrebná Google verifikácia (CASA audit, trvá ~4-6 týždňov).
> **Odporúčam pre štart Testing mode** — pridáš sa ako test user a budeš
> môcť používať okamžite.

### 2.4 Test users (ak si External)
1. V sekcii **Test users** klik **Add Users**
2. Pridaj emaily všetkých tvojich Gmail / Workspace mailboxov ktoré
   budeš pripájať:
   ```
   stefan@adlify.eu
   info@adlify.eu
   obchod@adlify.sk
   ```
3. Save and Continue → Back to Dashboard

---

## 3. OAuth 2.0 Client ID

### 3.1 Vytvor credentials
1. V ľavom menu: **APIs & Services** → **Credentials**
2. Klik **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Adlify Netlify`

### 3.2 Authorized redirect URIs
Pridaj tieto URL (klik **+ Add URI** pre každú):

```
https://adlify.eu/.netlify/functions/oauth-callback
```

Ak používaš aj Netlify preview deploys (branch deploys) alebo lokálny
dev server, pridaj aj:

```
https://deploy-preview-*--<tvoj-netlify-site>.netlify.app/.netlify/functions/oauth-callback
http://localhost:8888/.netlify/functions/oauth-callback
```

> ⚠️ **Bez trailing slashu.** Musí sa *presne* zhodovať s tým čo posiela
> naša `oauth-start.js` funkcia. Ak sa nepárujú, uvidíš *redirect_uri_mismatch*.

### 3.3 Ulož + zober credentials
1. Klik **Create**
2. Zobrazí sa dialóg s **Client ID** a **Client secret**
3. Oboje **skopíruj** — budeš ich potrebovať v Netlify

Ak si nestihol kopírovať: Credentials → klik na OAuth client → tam sú oba.

---

## 4. Netlify — environment variables

1. Choď na **https://app.netlify.com/** → tvoja Adlify stránka
2. **Site settings** → **Environment variables**
3. Pridaj / skontroluj tieto premenné:

| Kľúč | Hodnota | Kedy treba |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Z kroku 3.3 | **vždy** (Gmail, Ads, Analytics) |
| `GOOGLE_CLIENT_SECRET` | Z kroku 3.3 | **vždy** |
| `SUPABASE_URL` | `https://eidkljfaeqvvegiponwl.supabase.co` | už máš |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | už máš |
| `URL` | Automaticky od Netlify | už máš |

Klik **Save**.

### 4.1 Trigger redeploy
Po zmene env vars Netlify nespustí redeploy automaticky. Buď:
- **Deploys** → **Trigger deploy** → **Deploy site**
- Alebo push dummy commit

---

## 5. Test

### 5.1 Otvor Adlify admin
1. Choď na `https://adlify.eu/admin/`
2. Klik **Outreach** v sidebari
3. V headeri klik **Odosielatelia**

### 5.2 Pripoj Gmail
1. Klik **+ Pripojiť Gmail** (oranžové primary tlačidlo)
2. Otvorí sa Google OAuth consent:
   - Ak si Internal (Workspace): rovno spýta povolenie
   - Ak si External Testing: uvidíš warning „Google hasn't verified this
     app" → klik **Advanced** → **Go to Adlify Outreach (unsafe)** → zelená
3. Povoľ:
   - „Send email on your behalf" (gmail.send)
   - „See your primary Google Account email" (userinfo.email)
   - „See your personal info" (userinfo.profile)
4. Po autorizácii redirect späť do Adlify — uvidíš „✅ Pripojené ako
   stefan@adlify.eu"
5. V zozname Odosielatelia pribudne riadok s badge **Gmail API**

### 5.3 Otestuj odoslanie
1. Back to Outreach prehľad
2. Označ 1 testovací prospect (napr. sám seba s inou emailovou schránkou)
3. Klik **Poslať kampaň (1)**
4. V compose vyber svoj Gmail sender z dropdown **Odosielateľ**
5. Klik **Odoslať 1 emailov**
6. Skontroluj:
   - Príchodzí mail v test schránke — pošle sa z `stefan@adlify.eu`
   - V **Odoslané** v Gmaile `stefan@adlify.eu` by mal byť vidieť

---

## 6. Troubleshooting

### `Access blocked: Adlify Outreach has not completed the Google verification process`
- Si v External + nie si v test users. Choď Step 2.4, pridaj email.
- Alebo prepni Consent Screen na **Testing** (Publishing status).

### `redirect_uri_mismatch`
- URL v Google Console nie je presne `https://adlify.eu/.netlify/functions/oauth-callback`
- Skontroluj trailing slash, http vs https, www vs nie.

### `invalid_grant` / token refresh fails
- Refresh token expiroval (stane sa po 7 dňoch ak si External + Testing).
- Rieš: klik **Pripojiť Gmail** znova, prejdi OAuth flow znova.
- Production mode nemá tento limit.

### `insufficient authentication scopes`
- V credentials si nepridal `gmail.send` scope. Choď Step 2.3.
- Alebo existujúcy user má len staré tokens — odpojí a znova pripojí.

### `403 Insufficient Permission` pri Gmail API
- Workspace admin môže blokovať `gmail.send` pre aplikácie. V Workspace
  Admin Console → Security → API controls → pridaj OAuth client ID do
  trusted apps.

### Počet mailov per deň
- Gmail hard limit: **500 mailov / 24h** per štandardný účet, **2000**
  per Workspace účet
- Odporúčané warm-up tempo: **30-50/deň** prvý týždeň, postupne zvyšuj
- V `outreach_senders.warmup_current` nastav ako „môj súčasný limit"
  (začni 30), scheduler rešpektuje

---

## 7. Production verification (neskôr)

Keď budeš chcieť publikovať aplikáciu (odstrániť test-user obmedzenie):

1. OAuth Consent Screen → **Publish App**
2. Google pošle CASA (Cloud Application Security Assessment) dotazník
3. Musíš doložiť:
   - Privacy policy
   - Data handling documentation
   - Optional third-party security audit (pre **gmail.send** vyžadované)
4. Trvá cca **4-6 týždňov** schvaľovanie

Do verifikácie ostaň v **Testing** móde + manuálne pridávaj svoje
mailboxy ako test users.

---

## 8. Bezpečnostné tipy

1. **Nikdy** necommituj `GOOGLE_CLIENT_SECRET` do Git-u — len v Netlify env
2. Rotuj secret ak ho omylom vystavíš (Google Cloud Console → Credentials → Reset secret)
3. Refresh tokens sú v Supabase `platform_connections.refresh_token` — RLS
   ich chráni pred čítaním z klienta; čítajú ich len service-role Netlify funkcie
4. Ak stratíš prístup k Workspace účtu, odpojenie je v **https://myaccount.google.com/permissions**
   (user si tam sám môže odvolať prístup Adlify appu)

---

## Štart-line

Ak už máš Google Cloud projekt pre Ads/Analytics, stačí:

1. **Enable Gmail API** (Step 1.2)
2. **OAuth Consent Screen** → pridaj 3 nové scopes (Step 2.3)
3. **Test users** — pridaj svoje Gmail mailboxy (Step 2.4)
4. **Credentials** — netreba nový client, použije sa rovnaký `GOOGLE_CLIENT_ID`
5. Redeploy Netlify
6. Klik **Pripojiť Gmail** v admin

To je celé. Čas: cca 15 minút.
