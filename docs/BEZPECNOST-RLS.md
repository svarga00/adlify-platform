# Tabuľky bez zámku — čo s tým

**Stav k 28. 9. 2026.** Nič z tohto som nespustil. Na tých tabuľkách beží
Adlify a zapnutie zámku bez správnych pravidiel vie appku položiť — to je
rozhodnutie, ktoré patrí tebe, nie mne.

---

## O čo ide

Supabase má zámok na úrovni riadkov (RLS). Keď je **vypnutý**, tabuľku číta
a zapisuje ktokoľvek, kto pozná verejný kľúč — a ten je v každej stránke,
stačí sa pozrieť do zdrojového kódu. Nie je to kľúč, ktorý by sa dal skryť;
presne preto existuje zámok.

V projekte je **21 tabuliek s vypnutým zámkom**. Zvyšných zhruba osemdesiat
ho zapnutý má.

---

## Tri veci, ktoré horia

### 1. `user_profiles` má pravidlo, ktoré pustí hocikoho

```
anon_upsert_profiles · ALL · roles {anon} · using true · with check true
```

Preložené: **neprihlásený človek smie čítať, meniť aj mazať všetkých 13
profilov.** A pozor — toto pravidlo prežije aj zapnutie zámku. Zapnúť RLS
a nechať ho tam by nevyriešilo nič.

Pravdepodobne vzniklo preto, aby si pri registrácii vedel profil sám založiť.
To sa dá spraviť úzko:

```sql
drop policy "anon_upsert_profiles" on user_profiles;

-- Ak sa profil naozaj zakladá z prehliadača pri registrácii:
create policy anon_insert_profile on user_profiles
  for insert to anon with check (true);
-- čítať, meniť ani mazať anon nesmie — na to sú tie dve pravidlá,
-- ktoré tam už sú („Users can view/update own profile").

alter table user_profiles enable row level security;
```

Ak sa profil zakladá zo servera (edge function so servisným kľúčom), tak ani
to pravidlo netreba — servisný kľúč zámok obchádza vždy.

### 2. `leads` — 35 záznamov, otvorené dokorán

Stĺpce: `email`, `phone`, `contact_person`, `analysis`, `marketing_data`,
`deep_proposal` a **`audit_token`**.

Ktokoľvek s verejným kľúčom si vie stiahnuť celý zoznam tvojich leadov aj
s kontaktmi — a ak je `audit_token` tajomstvo za verejným odkazom na audit,
tak aj to.

Bezpečný tvar, ak leady chodia z formulára na webe:

```sql
alter table leads enable row level security;

-- Formulár smie zapísať, nič viac.
create policy leads_public_insert on leads
  for insert to anon with check (true);

-- Čítať a meniť len prihlásení.
create policy leads_staff_read on leads
  for select to authenticated using (true);
create policy leads_staff_write on leads
  for update to authenticated using (true);
```

Keby sa leady zapisovali zo servera, prvé pravidlo netreba vôbec.

### 3. `client_sessions` — session_token, ip_address

Teraz je prázdna, takže nič neuniká. Ale ak sa do nej začne zapisovať
a zámok bude vypnutý, **relačné tokeny budú verejne čitateľné** — s tým sa
dá prihlásiť za cudzieho človeka. Zapnúť zámok skôr, než sa tabuľka
naplní, stojí jeden príkaz:

```sql
alter table client_sessions enable row level security;
```

Bez pravidiel to znamená „len servisný kľúč", čo je pri reláciách správne.

---

## Zvyšok po vlnách

### Vlna A — prázdne, nič nerozbijú (11 tabuliek)

`activities`, `ai_feedback`, `ai_templates`, `automation_runs`,
`call_bookings`, `client_sessions`, `creative_assets`, `email_log`,
`integrations`, `searches`, `teams`

Všetky majú **0 riadkov**. Zapnutie zámku dnes nemá čo pokaziť a keď ich
niečo začne používať, ozve sa to chybou — nie tichým únikom.

```sql
alter table activities        enable row level security;
alter table ai_feedback       enable row level security;
alter table ai_templates      enable row level security;
alter table automation_runs   enable row level security;
alter table call_bookings     enable row level security;
alter table client_sessions   enable row level security;
alter table creative_assets   enable row level security;
alter table email_log         enable row level security;
alter table integrations      enable row level security;
alter table searches          enable row level security;
alter table teams             enable row level security;
```

**Jedna výhrada:** `oauth_states` som sem zámerne nedal, hoci je tiež
prázdna. Je to krátkodobý stav počas pripájania reklamného účtu — ak ho
zapisuje prehliadač verejným kľúčom, zámok pripájanie položí. Najprv treba
vedieť, či ho píše server, alebo stránka.

### Vlna B — sú v nich dáta, treba najprv pravidlá (6 tabuliek)

| tabuľka | riadkov | čo s tým |
|---|---:|---|
| `approval_history` | 83 | história schvaľovaní; kto ju číta? |
| `messages` | 68 | **má len pravidlo na UPDATE.** Zapnúť zámok = 68 správ zmizne všetkým a nedajú sa pridávať nové. Najprv dopísať SELECT a INSERT. |
| `leads` | 35 | vyššie |
| `user_profiles` | 13 | vyššie |
| `call_availability` | 5 | dostupnosť na hovory |
| `profiles` | 4 | mená, e-maily, role |
| `ai_prompts` | 4 | texty pre AI |
| `organizations`, `sequences` | 1 | |

Pri každej treba vedieť to isté: **píše do nej prehliadač verejným kľúčom,
alebo server servisným?** Servisný kľúč zámok obchádza, takže tam sa nič
nepokazí. Problém je vždy len tam, kde zapisuje stránka.

---

## Čo potrebujem od teba

Stačí odpoveď na jednu otázku pri štyroch tabuľkách — `leads`,
`user_profiles`, `messages`, `oauth_states`:

> Zapisuje do nej prehliadač (formulár na webe, klientský portál),
> alebo server (edge function, cron)?

Podľa toho dopíšem pravidlá tak, aby sa nič nerozbilo, a spustíme to po
vlnách: najprv prázdne, potom `user_profiles` a `leads`, nakoniec zvyšok.

---

## Prečo to nespúšťam sám

Zapnutie zámku nemení ani jeden riadok dát — ale vie zo dňa na deň položiť
funkčnú appku, a to je Adlify, nie DANUBRA. Také rozhodnutie patrí tebe.

DANUBRA sama je v poriadku: všetkých 60+ tabuliek `danubra_*` má zámok
zapnutý od začiatku a od migrácie 030 aj práva podľa rolí.
