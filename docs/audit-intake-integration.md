# Audit Intake integrácia (external landing pages)

Tento dokument vysvetľuje ako prepojiť **externý landing page** (napr. `adlify.eu/audit`, FB inzeráty, IG cieľové stránky) s Adlify outreach pipeline. Po submite formy sa vytvorí prospect v Adlify DB a spustí sa **rovnaký notify flow** ako pri audit-request z Adlify-poslaného emailu:

1. **Task** vytvorený v `tasks` (priority `high`, due_date zajtra)
2. **Notification** pre všetkých owners/admins/managers (`notifications` tabuľka → bell ikona v Adlify topbar + browser push)
3. **Email** ownerovi (`info@adlify.eu` alebo `settings.notification_email`)

## Endpoint

```
POST https://adlify-app.netlify.app/.netlify/functions/audit-intake
Content-Type: application/json
```

**CORS:** otvorený na všetky originy (Access-Control-Allow-Origin: `*`).

### Request body

```json
{
  "company_name": "Pekáreň Jablko",     // POVINNÉ
  "email": "info@pekarenjablko.sk",     // POVINNÉ
  "domain": "pekarenjablko.sk",          // voliteľné — auto-extrahuje sa z emailu
  "contact_person": "Jana Kováčová",     // voliteľné
  "phone": "+421 900 123 456",          // voliteľné
  "industry": "Pekárenstvo",            // voliteľné
  "city": "Bratislava",                 // voliteľné
  "priority": "more_leads",             // voliteľné: more_leads | lower_cpa | brand | all | other
  "note": "Chceme viac stálych zákazníkov", // voliteľné
  "source": "fb-skupina-praca-sk"       // doporučené — odlišuje kanály
}
```

### Response

**200 OK** — prospekt uložený alebo update-nutý:
```json
{
  "ok": true,
  "prospect_id": "uuid",
  "audit_token": "uuid",
  "is_new": true   // false ak email už existoval, údaje sa aktualizovali
}
```

**400 Bad Request** — validačná chyba:
```json
{ "ok": false, "error": "company_name je povinné" }
```

Endpoint je **idempotentný** podľa emailu — opätovný submit z toho istého emailu prepíše údaje a re-spustí notify flow.

---

## Source tracking

`source` field v body určuje **odkial lead prišiel**. Doporučená konvencia:

| Kanál | `source` value |
|---|---|
| FB skupina „Práca SK" | `fb-skupina-praca-sk` |
| FB skupina „IT práca SK" | `fb-skupina-it-praca-sk` |
| Inzerát IG (apríl 2026) | `ig-ad-2026-04` |
| Inzerát Google Search | `google-ads-search` |
| Email newsletter | `email-newsletter-marec` |
| Word of mouth | `referral` |
| Default (landing organic) | `landing_page` |

V Outreach module v Adlify máš stĺpec **„Zdroj"** ktorý zobrazuje hodnotu (formátovaná pill v sky pastel farbe).

Source value sa berie z URL query parametra `?src=...` na landing stránke — predaj sa do form-u ako hidden field.

---

## Astro integrácia (`adlify.eu/audit`)

### 1. Astro page — extract `?src=` z URL

V Astro stránke (napr. `src/pages/audit.astro`):

```astro
---
// src/pages/audit.astro
const url = Astro.url;
const source = url.searchParams.get('src') || 'landing_page';
---

<form id="audit-form">
  <input type="hidden" name="source" value={source} />
  <input type="text" name="company_name" placeholder="Názov firmy" required />
  <input type="email" name="email" placeholder="E-mail" required />
  <input type="text" name="domain" placeholder="Doména / web (voliteľné)" />
  <input type="text" name="contact_person" placeholder="Vaše meno (voliteľné)" />
  <input type="tel" name="phone" placeholder="Telefón (voliteľné)" />

  <select name="priority">
    <option value="">Čo je vaša najväčšia priorita?</option>
    <option value="more_leads">Viac kontaktov</option>
    <option value="lower_cpa">Nižšia cena za zákazníka</option>
    <option value="brand">Známosť značky</option>
    <option value="all">Všetko dokopy</option>
    <option value="other">Iné</option>
  </select>
  <textarea name="note" placeholder="Niečo doplniť? (nepovinné)"></textarea>

  <button type="submit">Chcem audit</button>

  <div id="audit-result" hidden></div>
</form>

<script is:inline>
  const form = document.getElementById('audit-form');
  const resultEl = document.getElementById('audit-result');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Odosielam…';

    try {
      const res = await fetch(
        'https://adlify-app.netlify.app/.netlify/functions/audit-intake',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Chyba');

      // Úspech — zobraz potvrdenie
      form.hidden = true;
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:#16A34A;">✓</div>
          <h3>Audit pripravujem</h3>
          <p>Vaša žiadosť je prijatá. Audit doručím na váš e-mail do <strong>48 hodín</strong>.</p>
        </div>
      `;
    } catch (err) {
      console.error('Audit intake error:', err);
      alert('Chyba pri odosielaní: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Chcem audit';
    }
  });
</script>
```

### 2. URL parametre pre source tracking

Pri zdielaní landing page link-u **vždy pridaj `?src=...`**:

```
https://adlify.eu/audit?src=fb-skupina-praca-sk
https://adlify.eu/audit?src=ig-ad-2026-04
https://adlify.eu/audit?src=email-newsletter
```

Ak nie je `?src=` parameter, prospect bude označený ako `landing_page` (organic).

---

## Test

Po nasadení môžeš otestovať priamo cez curl:

```bash
curl -X POST https://adlify-app.netlify.app/.netlify/functions/audit-intake \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Firma",
    "email": "test@example.com",
    "domain": "example.com",
    "priority": "more_leads",
    "source": "manual-test"
  }'
```

Odpoveď by mala byť `200 OK` s `prospect_id` a `audit_token`. V Adlify **`/admin/#outreach`** sa po refreshe objaví nový prospect s:
- Stage chip „Klikol audit"
- Source pill „manual-test"
- Bell badge +1
- Task v `/admin/#tasks`
- Email na `info@adlify.eu`

---

## Bonus: browser push v Adlify

Po prvom load-e Adlify topbar bell dropdown ukáže CTA **„Povoliť push notifikácie"**. Po povolení dostaneš desktop notifikáciu hneď ako príde nový lead (bez nutnosti otvoriť Adlify tab).

Funguje vo všetkých moderných prehliadačoch (Chrome/Firefox/Safari/Edge), permission sa cache-uje v prehliadači.
