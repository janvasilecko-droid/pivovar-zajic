# Nasazení WhatsApp Bridge na Render — krok za krokem

Návod k tomu, aby bridge (Baileys gateway) opravdu běžel 24/7 a přeposílal zprávy
ze skupiny **„Objednávky pivovar"** a od kontaktu **„Ala Milacek Milacek"** na webhook.

> Kód je hotový, otestovaný (9/9) a pushnutý na GitHub (commit `b597942e`).
> Zbývají 2 kroky, které **musíš udělat ty**: ① nasadit na Render, ② naskenovat QR telefonem.

---

## PŘÍPRAVA: zjisti si 6 hodnot z lokálního souboru `.env`

Otevři si soubor `d:\stazene\zajic\project\.env` (poznámkový blok / VS Code).
Budeš odsud kopírovat hodnoty do Renderu:

| Render proměnná | Kam ji kopíruješ z `.env` | Příklad |
|---|---|---|
| `SUPABASE_URL` | hodnota za `VITE_SUPABASE_URL=` | `https://sasqexjadvlqyticxwja.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | hodnota za `VITE_SUPABASE_SERVICE_ROLE_KEY=` | `sb_secret_…` (dlouhý řetězec) |
| `WEBHOOK_URL` | nastav ručně (viz níže) | `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook` |
| `WEBHOOK_SECRET` | hodnota za `WEBHOOK_SECRET=` | cokoliv v tom řádku |
| `ALLOWED_GROUPS` | konstantní | `Objednávky pivovar` |
| `ALLOWED_CONTACTS` | konstantní | `Ala Milacek Milacek` |

Nech si tento soubor otevřený na druhé obrazovce — budeš z něj kopírovat.

---

## KROK 1 — Vytvoření služby na Renderu (5 minut)

1. Otevři **https://render.com** a přihlas se (nejrychlejší je „Continue with GitHub").
2. Pokud Render ještě nemá přístup k tvému GitHub účtu:
   - **Dashboard → New → Web Service**
   - Render tě vyzve k propojení GitHub → „Configure account"
   - Vyber repozitář **`pivovar-zajic`** a potvrď „Install"
3. **Dashboard → New → Web Service** (znovu) a vyber repo `janvasilecko-droid/pivovar-zajic`.

Vyplň formulář **přesně takhle**:

| Pole | Hodnota |
|---|---|
| **Name** | `whatsapp-bridge` |
| **Region** | nejbližší k tobě (např. Frankfurt – EU Central) |
| **Branch** | `main` |
| **Root Directory** | `whatsapp-bridge` |
| **Runtime / Environment** | `Docker` |
| **Dockerfile Path** | `./Dockerfile` |
| **Instance Type** | **Free** |

4. Sjeď dolů k **Environment** a klikej **Add Environment Variable** — přidej všech 6 proměnných
   z tabulky nahoře. **Pozor:** hodnoty zkopíruj přesně (klíče jsou dlouhé, klidně je
   vlož a smaž případnou mezeru navíc).

5. Klikni **Create Web Service**.

## KROK 2 — Počkej, než se postaví (3–8 minut)

- Otevři si záložku **Logs** služby.
- Nejdřív uvidíš build Docker image (`Step 1/9 …`, `npm ci …`). To chvíli trvá.
- Počkej na řádky:
  - `Your service is live 🎉` (na vrchu stránky / v logu)
  - `[health] HTTP server na portu 3000`
  - `[gate] whitelist načten z whatsapp_senders: 2 názvů, 0 chat_id`
  - `connected to WA` → `not logged in, attempting registration...`

## KROK 3 — Spárování QR kódem (30 sekund)

1. V logu Renderu se vytiskne **velký QR kód** (černobílá mřížka ze znaků █).
   → Můžeš v logu kliknout **Expand** (rozbalit řádek), ať je QR velký a čitelný.
2. Vezmi **telefon, který je přihlášený ve WhatsAppu** (ten, který čte objednávky):
   - **WhatsApp → Nastavení → Propojená zařízení → Propojit zařízení**
   - Namiř foťák na QR kód na obrazovce.
3. Po naskenování se v logu Renderu objeví:
   - `[conn] OPEN — spárováno a online ✔`
   - a v Supabase (Table Editor → `whatsapp_session`) přibudou klíče `creds`, `signal-…`, `app-state-…` atd.

> Po spárování se session ukládá do Supabase → i po restartu / redeploy se bridge
> připojí **bez nového QR**. Telefon nemusí být pořád online (jen když se session tvoří).

## KROK 4 — Zabraň usnutí free instance (ping každých 5 minut)

Free plán Renderu uspí službu po 15 min bez provozu → pak by se zprávy ztrácely.
Nastav proto **pravidelný ping na health endpoint**:

1. Otevři **https://cron-job.org** → zaregistruj se (zdarma).
2. **Create cronjob**:
   - URL: `https://whatsapp-bridge.onrender.com/health`
     (přesnou adresu vidíš na kartě služby v Renderu — vpravo nahoře, tvar `…onrender.com`)
   - Schedule: `*/5 * * * *` (každých 5 minut) → **Save**
3. Hotovo. Služba teď nikdy neusne. (Alternativa: UptimeRobot zdarma.)

## KROK 5 — Ověř, že se zprávy přeposílají

1. Napiš do skupiny **„Objednávky pivovar"** na telefonu testovací zprávu
   (např. „test přeposílání").
2. V logu Renderu uvidíš:
   - `[msg] ➜ webhook: sender="Objednávky pivovar" chatId="…" text="test přeposílání"`
   - `[webhook] HTTP 200 …`
3. V aplikaci se zpráva objeví (WhatsApp tab / modál **Schválit / Zamítnout**)
   a v Supabase `whatsapp_incoming` přibude řádek se statusem `pending`.

---

## Když něco nefunguje — řešení

| Problém | Řešení |
|---|---|
| Log je prázdný / jen „Deploying" | Počkej na dokončení buildu (3–8 min); pokud Build selže, přepiš chybu z logu a pošli mi ji |
| Build padá: `npm error command failed` / `exit code 254` | Příčina: Baileys instaluje závislost `libsignal` přímo z GitHubu, a v obraze chyběl git (navíc lockfile ukazuje na `git+ssh://` bez SSH klíče). Opraveno v `Dockerfile` — stačí v Renderu otevřít službu → **Deploy → Clear build cache & deploy** |
| QR se v logu netiskne | Zkontroluj, že tam jsou řádky `connected to WA` a `attempting registration…`; jinak restartuj službu (Render → Restart) |
| QR nejde naskenovat | Klikni v logu **Expand** pro větší QR; sfoť ho z dálky, stačí ho vyplnit do rámečku |
| Po spárování se QR tiskne znovu | Session se neuložila → zkontroluj `whatsapp_session` v Supabase (Table Editor), jestli tam jsou klíče; pokud ne, přidej proměnnou `SUPABASE_SERVICE_ROLE_KEY` znovu (správně) |
| `[msg] skupina "…" není povolená — ignoruji` | Skupina se v WhatsAppu jmenuje jinak, než je ve whitelistu → oprav název v **Nastavení → WhatsApp odesílatelé** v aplikaci (bridge to přečte do 5 min bez restartu) |
| `[webhook] HTTP 401` | `WEBHOOK_SECRET` na Renderu nesouhlasí s tím v root `.env` → oprav a Render → Deploy |
| „logged out" v logu | V Supabase smaž klíč `creds` v tabulce `whatsapp_session`, pak Render → Restart → naskenuj nový QR |
| Nechceš čekat na ping | Platí i bez pingu, jen na free plánu může služba po 15 min usnout a zprávy dorazí se zpožděním |

---

## Jak to funguje (zkráceně)

```
Telefon (WhatsApp) ──WebSocket──► WhatsApp Bridge (Render, 24/7)
                                     │  filtr čtení = webhook brána:
                                     │  název NEBO chat_id, whitelist z
                                     │  whatsapp_senders + env
                                     ▼
                          whatsapp-webhook (Supabase edge funkce, v11)
                                     ▼
                          whatsapp_incoming ─► auto-parse ─► aplikace
```

- Bridge čte **jen** zprávy od povolených (skupina „Objednávky pivovar" podle názvu
  NEBO chat_id; kontakt „Ala Milacek Milacek" podle jména/čísla).
- Finální brána je pořád webhook — i kdyby bridge přečetl víc, webhook nic navíc nepustí.

