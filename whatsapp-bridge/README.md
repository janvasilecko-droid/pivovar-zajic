# WhatsApp Bridge (WhatsApp Gateway)

Lehoučká Node.js mikroslužba, která se připojí k tvému WhatsAppu jako **propojené
zařízení** (Multi-Device API, knihovna [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys)
— **bez** Puppeteeru/Chromiumu, takže spotřeba RAM je nízká a vejde se do limitu
bezplatného hostingu).

Sleduje skupinu **„Objednávky pivovar“** (a případně povolené kontakty) a každou
příchozí zprávu přeposílá **POST**em na náš Supabase webhook:

```
WhatsApp skupina → Baileys bridge → POST whatsapp-webhook → whatsapp_incoming → AI parsing
```

---

## Architektura

```
┌──────────────┐   WebSocket    ┌──────────────────────────┐
│  Telefon     │◄──────────────►│  WhatsApp Bridge (24/7)  │
│  (WhatsApp)  │                │  Render.com / Fly.io     │
└──────────────┘                └───────────┬──────────────┘
                                            │ auth session (creds/signal klíče)
                                            ▼
                                 ┌─────────────────────┐
                                 │ Supabase PostgreSQL │
                                 │  whatsapp_session   │
                                 └─────────────────────┘
                                            │ POST JSON (x-webhook-token)
                                            ▼
                        ┌───────────────────────────────────────┐
                        │ Edge funkce whatsapp-webhook           │
                        │ → whatsapp_incoming → AI → objednávka  │
                        └───────────────────────────────────────┘
```

**Proč session v databázi?** Bezplatný hosting (Render free, Fly.io free) má
dočasný souborový systém — cokoliv zapsané do disku zmizí při restartu. Proto se
přihlašovací klíče (Baileys Multi-Device auth state) ukládají do tabulky
`whatsapp_session` v Supabase (migrace
`supabase/migrations/20260820000000_add_whatsapp_session_table.sql`).

---

## Struktura

```
whatsapp-bridge/
├── index.js            # hlavní proces: socket, QR, zpracování zpráv, health server
├── lib/
│   ├── supabaseAuth.js # Baileys auth state → Supabase (čte/zapisuje whatsapp_session)
│   ├── webhook.js      # POST na whatsapp-webhook + retry (exponenciální backoff)
│   └── media.js        # fotky: stažení z WhatsApp (Baileys) → Supabase Storage → mediaUrl
├── Dockerfile          # node:22-alpine — nasazení na Render.com / Fly.io
├── render.yaml         # Render Blueprint (volitelně, dá se naklikat i ručně)
├── package.json
└── .env.example
```

---

## Environment variables

| Proměnná                  | Povinná | Popis |
|---------------------------|---------|-------|
| `SUPABASE_URL`            | ✅      | URL Supabase projektu (z root `.env`: `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅    | Service role klíč (z root `.env`: `VITE_SUPABASE_SERVICE_ROLE_KEY`) — zápis session do `whatsapp_session` |
| `WEBHOOK_URL`             | volná   | Adresa edge funkce; defaultně se odvodí z `SUPABASE_URL` (`…/functions/v1/whatsapp-webhook`) |
| `WEBHOOK_SECRET`          | ✅      | Sdílené tajemství webhooku (z root `.env`: `WEBHOOK_SECRET`); posílá se jako hlavička `x-webhook-token` |
| `ALLOWED_GROUPS`          | volná   | Povolené skupiny (čárkou), default `Objednávky pivovar`; sjednoceno s `whatsapp_senders` (viz Filtr čtení) |
| `ALLOWED_CONTACTS`        | volná   | Povolení kontakty mimo skupiny (jméno nebo tel. číslo), default `Ala Milacek Milacek`; sjednoceno s `whatsapp_senders` |
| `LOG_LEVEL`               | volná   | `info` (default), `debug` pro detail |
| `PORT`                    | volná   | Port health endpointu, default `3000` (Render ho nastavuje sám) |
| `WHATSAPP_MEDIA_BUCKET`   | volná   | Supabase Storage bucket pro fotky (default `whatsapp-media`); vytvoří ho migrace `20261010000000_add_whatsapp_media_bucket.sql`, služba si ho případně vytvoří sama |


## Fotky z WhatsApp (média)

**DeepSeek (textový model AI) fotky NEČTE.** Proto se objednávka poslaná jako
fotka nezpracovává „slepě“ — fotka se **stáhne a uloží**, aby si ji v aplikaci
mohl otevřít a stáhnout člověk (případně objednávku zadat ručně).

Průběh pro zprávu s fotkou (s popiskem i bez):

1. Bridge rozbalí `imageMessage` (i z `ephemeralMessage` / `viewOnceMessage`).
2. Baileys stáhne fotku ze serverů WhatsApp (`downloadMediaMessage` → Buffer).
3. Buffer se nahraje do **veřejného Supabase Storage bucketu `whatsapp-media`**
   (cesta `incoming/wa-<key.id>.<ext>`, MIME z `imageMessage.mimetype`).
4. Veřejná URL se pošle webhooku jako `mediaUrl` → `whatsapp_incoming.media_url`.
5. V aplikaci (Import z WhatsApp / detail zprávy) se fotka zobrazí a je u ní
   tlačítko **Stáhnout fotografii**.

**Proč přes Storage a ne přímá WhatsApp URL?** Přímá URL od WhatsAppu časem
vyprší, objekt v Storage zůstává → odkaz ke stažení funguje i při pozdější
kontrole objednávky. Když se upload nepovede (bucket neexistuje apod.), pošle se
jako nouzový fallback aspoň přímá (dočasná) WhatsApp URL; nepovede-li se ani
stažení, zpráva se přepošle bez `mediaUrl` a aplikace to ukáže hláškou.

**Fotka bez popisku** se dřív ignorovala („zpráva bez textu“). Teď se přeposílá
s placeholderem `📷 Fotka objednávky (bez popisu)`, aby se dala v aplikaci
najít a fotka stáhnout.

> Zápis do bucketu dělá jen bridge se service role klíčem; čtení je veřejné
> (politika `whatsapp_media_public_read`, viz migrace). Bucket si bridge ověří
> i při startu (`ensureMediaBucket`) — zvládne i projekt, kde migrace ještě
> neproběhla.


## Filtr čtení (gate)

Zprávy se čtou a přeposílají **jen od povolených odesílatelů** — pravidla jsou
identická s bránou na webhooku (`whatsapp-webhook`), DB triggerem
(`check_whatsapp_sender_allowed`) a `whatsapp-auto-parse`:

- zpráva je povolená, když **normalizovaný název** (bez diakritiky a velikosti)
  odpovídá whitelistu **NEBO** `chat_id` odpovídá zaregistrovanému `chat_id`;
- **prázdný whitelist = povoleno vše** (zpětně kompatibilní);
- vlastní zprávy (`from_me`) se nikdy nezpracovávají (prevence smyčky).

**Zdroje whitelistu** (sjednocené):

| Zdroj | Co přidává |
|---|---|
| `whatsapp_senders` (Supabase) | edituje se v aplikaci **Nastavení → WhatsApp odesílatelé**; bridge ji čte při startu a každých ~5 minut → změny platí bez restartu služby |
| `ALLOWED_GROUPS` (env) | povolené skupiny navíc |
| `ALLOWED_CONTACTS` (env) | povolení kontakty navíc (jméno nebo telefonní číslo) |

Díky tomu **přejmenovaná skupina neztratí zprávy**: bridge povolí skupinu podle
`chat_id` a webhook ji přebere stejným pravidlem. Bridge je tedy jen první vrstva
(to, co se *přečte* z WhatsAppu), finální bránou je vždy webhook.

> ⚠️ „Prázdný whitelist = povoleno vše“ platí, když jsou prázdné **obě** složky
> (env proměnné i `whatsapp_senders`). Jinak se whitelisty sjednotí.


## Nasazení na Render.com (krok za krokem)

### Předpoklad
Tuto složku (`whatsapp-bridge/`) pushni do GitHub repozitáře (spolu se zbytkem
projektu, root `.gitignore` už ignoruje `node_modules/`).

### Postup (Web Service — free plán)

> Free plán Renderu podporuje **jen Web Services** (Background Workery ne).
> Web Service + externí ping na `/health` každých ~5 min = fakticky 24/7
> bez placení (detaily v sekci „Bezplatný plán“ dole).

1. Přihlas se na [render.com](https://render.com).
2. **Dashboard → New → Web Service**.
3. Vyber GitHub repo (povol Renderu přístup k repu).
4. Konfigurace:
   - **Name**: `whatsapp-bridge`
   - **Environment**: `Docker`
   - **Root Directory**: `whatsapp-bridge`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: `Free`
5. **Environment** → Add Environment Variable (hodnoty z tabulky výše):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_URL`
   - `WEBHOOK_SECRET`
   - `ALLOWED_GROUPS=Objednávky pivovar`
   - `ALLOWED_CONTACTS=Ala Milacek Milacek`
   - (ostatní jsou volitelné)
6. **Create Web Service** → Render postaví image a spustí službu.
7. Otevři **Logs** — po pár sekundách se objeví **QR kód**.
8. Naskenuj QR telefonem (viz Lokální vývoj).
9. Po připojení uvidíš v logu `[conn] OPEN — spárováno a online ✔`.
10. **Nastav uptime ping** (jinak free instance po 15 min usne a zprávy se ztratí):
    v cron-job.org / UptimeRobot zadej URL
    `https://whatsapp-bridge-g1v0.onrender.com/health` s intervalem **5 minut** —
    Render ti URL služby ukáže na kartě služby (ve tvaru `…onrender.com`).

> **Varianta placená (bez triků):** placený **Background Worker (Starter, ~7 $/měsíc)**
> se neuspává — krok 10 odpadá, jinak je postup stejný.

### Volitelně: Render Blueprint (`render.yaml`)
Místo klikání můžeš v Renderu vytvořit **New → Blueprint** a vybrat repo —
Render sám najde `whatsapp-bridge/render.yaml`. Tajné proměnné (`sync: false`)
pak doplníš ručně v dashboardu služby.

---

## Párování (QR) — jak to funguje

1. Bridge spadne **bez** uložené session → vygeneruje nové nepárované credentials
   a pošle je do `whatsapp_session`.
2. Pošle `connection.update` s `qr` → konzole vytiskne QR.
3. Naskenuješ QR → WhatsApp zašle párovací data → Baileys uloží `creds`
   (přes `creds.update` → `saveCreds` → Supabase).
4. Příště (po restartu / redeploy) se session **načte z Supabase** a bridge se
   připojí bez QR — telefon není potřeba mít neustále online.

### Pokud QR nevidíš / session je rozbitá
Smazat session a začít znovu:

```sql
-- v Supabase SQL Editoru
DELETE FROM whatsapp_session;
```

Pak restartuj službu (Render → service → Manual Deploy → Deploy).

---

## Jak ověřit, že vše funguje

1. V telefonu/počítači pošli zprávu do skupiny **Objednávky pivovar**.
2. V logu Renderu by mělo svítit:
   ```
   [msg] ➜ webhook: sender="Objednávky pivovar" chatId="120363…@g.us" text="…"
   [webhook] HTTP 200 …
   ```
3. V aplikaci otevři **Objednávky → Import z WhatsApp** — zpráva by se měla
   objevit (status `pending` → krátce poté `parsed`).
4. V Supabase SQL:
   ```sql
   select sender_name, message_text, chat_id, status
   from whatsapp_incoming
   order by created_at desc;
   ```
5. `chatId` skupiny si webhook sám zaznamená do logu:
   ```
   🆔 DETEKCE chat_id pro skupinu "Objednávky pivovar": chat_id="120363…"
   ```
   Tenhle řádek v logu znamená, že skupina ještě nemá v `whatsapp_senders`
   zaregistrované `chat_id` — není to chyba, jen doporučení.
6. Fotky: pošli do skupiny fotku (klidně bez popisku). V logu by mělo svítit
   ```
   [media] fotka uložena do Storage: https://…/storage/v1/object/public/whatsapp-media/…
   ```
   a v aplikaci (**Import z WhatsApp**) se u zprávy zobrazí náhled + tlačítko
   **Stáhnout fotografii** (fotku bez popisku najdeš jako „📷 Fotka objednávky (bez popisu)“).

---

## Troubleshooting

| Problém | Příčina / řešení |
|---|---|
| `401 Unauthorized` od webhooku | Špatný `WEBHOOK_SECRET` (musí sedět s tajemstvím edge funkce). |
| QR se neobjeví v logu | Deployni jako **Web Service** (free plán Background Workery nepodporuje) a počkej 30–60 s. |
| Zařízení se odpojuje (`logged out`) | Někdo párované zařízení odebral. Smazat `whatsapp_session` a spárovat znovu. |
| Zprávy nechodí | Všech 4 pokusů selhalo → v logu je `[webhook] VŠECHNY pokusy selhaly…` — kontrola `WEBHOOK_URL` a `WEBHOOK_SECRET`. |
| Session se ztrácí po restartu | Není nastavená `SUPABASE_SERVICE_ROLE_KEY` nebo nemá práva na `whatsapp_session`. |
| OOM (memory limit) | Baileys je úsporný; pokud padne, pomáhá restart služby (Render to dělá sám). |

---

## ⚠️ Bezplatný plán Renderu a „24/7“

Render **free** uspává instanci po ~15 minutách **bez příchozího (inbound) provozu**
(HTTP requesty na službu). Outbound aktivita — WhatsApp WebSocket, POST na webhook,
dotazy na Supabase — se **nepočítá**. Po probuzení se bridge sice znovu připojí a
obnoví session z databáze, ale **zprávy, které přišly během spánku, se ztratí**
(WhatsApp je odpojenému zařízení už nedoručí). WhatsApp navíc uspanou instanci
probudit neumí.

- **Zdarma a fakticky 24/7:** nasadit jako **Web Service** (ne worker — free plán
  workery nepodporuje) a nechat ji pinguvat zvenčí každých ~5 minut na `/health`
  (např. **cron-job.org** nebo **UptimeRobot** zdarma). Každý ping resetuje
  15minutový timer → instance nespí. Jedna instance = ~720 h/měsíc, vejde se do
  free limitu 750 h.
- Chceš-li bez triků: placený **Background Worker (Starter, ~7 $/měsíc)** — neuspává se.
- Alternativa bez spánku zdarma: **Fly.io** (viz níže) v rámci free allowance.

### Rychlý start na Fly.io
```bash
cd whatsapp-bridge
fly launch            # vybere Dockerfile
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  WEBHOOK_URL=... WEBHOOK_SECRET=... ALLOWED_GROUPS="Objednávky pivovar" \
  ALLOWED_CONTACTS="Ala Milacek Milacek"
fly deploy
fly logs              # QR kód
```
Fly free allowance (3 shared-cpu-1x instance, ~256 MB) nepřerušuje běh.

---

## Lokální vývoj

```powershell
cd whatsapp-bridge
npm install
# zkopíruj .env.example → .env a doplň hodnoty (viz tabulka výše)
npm start
```

V konzoli se po připojení k WhatsApp objeví **QR kód**. Naskenuj ho telefonem:

> WhatsApp → Nastavení → Propojená zařízení → Propojit zařízení

Po spárování běží bridge jako propojené zařízení a přeposílá zprávy.
