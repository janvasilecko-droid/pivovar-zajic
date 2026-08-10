# Tasker → webhook aplikace PŘÍMO (bez Make.com)

Tento návod ukazuje, jak nastavit Tasker tak, aby posílal WhatsApp zprávy
přímo do webhooku aplikace **bez Make.com**. Make.com je volitelná mezistanice
(filtry, deduplikace, logy, Google Sheets) — pro základní fungování není nutná.

## Webhook

- **URL**: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
- **Metoda**: POST
- **Hlavičky**: `x-webhook-token: <WEBHOOK_SECRET>` (**povinná**, viz 🔐 níže)
- **Body** (JSON):
  ```json
  {
    "sender": "%antitle",
    "message": "%antext",
    "timestamp": "%antime",
    "senderNumber": "%annumber",
    "webhookId": "%TIMEMS",
    "chatId": "%anwhatsappchatid",
    "fromMe": false
  }
  ```
- Webhook přijímá `timestamp` jako **ISO string i epoch milisekundy** (AutoNotification
  posílá epoch milisekundy → `%antime` funguje).
- `webhookId` je volitelný — slouží k deduplikaci (stejné ID se nezpracuje 2×).
  `%TIMEMS` je unikátní čas odeslání → bezpečné.
- `chatId` je **nepovinné** — stabilní ID skupiny (např. `120363...@g.us`).
  Pokud ho tvoje verze AutoNotification nenabízí (proměnná se pak vyhodnotí jako
  prázdná), **neva** — webhook při první zprávě ze skupiny chat_id **detekuje a
  vypíše do logu**, ty ho pak zaregistruješ (viz níže).
- `fromMe` AutoNotification neumí → pošli `false`. Vlastní zprávy poslané z jiného
  zařízení / WhatsApp Webu (v notifikaci začínají „You: “ / „Ty: “ / „Vy: “) webhook
  pozná a **zahodí sám** — nevznikne smyčka.

## 🔐 Zabezpečení webhooku

Webhook **nepřijme** požadavek bez správné hlavičky `x-webhook-token` (vrací
HTTP 401). Tajemství (`WEBHOOK_SECRET`) najdeš v `.env`:

```powershell
Select-String -Path .env -Pattern '^WEBHOOK_SECRET='
```

- **Změna tajemství**: `node scripts/set-webhook-secret.mjs [novy-secret]`
- **Vypnutí kontroly** (nedoporučuje se): `node scripts/set-webhook-secret.mjs --remove`

> ⚠️ Když tajemství změníš, musíš ho opravit i v Taskeru (a případně v Make.com),
> jinak webhook začne vracet 401.

## Nastavení Taskeru (krok za krokem)

### 1. Profil (spouštěč)
1. Záložka **Profiles** → **+** → **Event**
2. **Plugin** → **AutoNotification** → **Intercept**
3. Konfigurace:
   - **Apps / Notifications**: vyber WhatsApp (`com.whatsapp`)
   - **Title Filter**: prázdné
   - **Text Filter**: prázdné (filtry lze přidat později, viz níže)
4. Uložit

### 2. Úloha (akce)
1. Vyber profil → **+** → **Nová úloha** → pojmenuj „WhatsApp → Pivovar"
2. **Net** → **HTTP Request**
   - **Server / Host**: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
   - **Method**: `POST`
   - **Content Type**: `application/json`
   - **Body**:
     ```
     {"sender":"%antitle","message":"%antext","timestamp":"%antime","senderNumber":"%annumber","webhookId":"%TIMEMS","chatId":"%anwhatsappchatid","fromMe":false}
     ```
   - **Headers**: `x-webhook-token: <WEBHOOK_SECRET>` (hodnota z `.env`, viz 🔐 výše)
3. Uložit

> **Poznámka ke staršímu Taskeru**: pokud nevidíš „HTTP Request", použij
> **Net → HTTP Post** a do pole **Path** dej `/functions/v1/whatsapp-webhook`,
> **Server** `https://sasqexjadvlqyticxwja.supabase.co`, **Data / Body** stejný JSON
> a do pole **Headers** zadej `x-webhook-token: <WEBHOOK_SECRET>`.

### 3. Otestování
1. Pošli si WhatsApp zprávu (WhatsApp → **Message yourself**):
   ```
   Ahoj sládku, na pondělí potřebujeme:
   2x 12° světlý ležák 50l
   1x 13° jantar 30l
   ```
2. Zkontroluj **Tasker → Logs → Run log** (musí proběhnout HTTP Request)
3. Otevři aplikaci **https://zajic-pivovar.pages.dev** → Objednávky → vyskočí modál se Schválit/Zamítnout

### 4. Filtrování (nepovinné)
V AutoNotification Intercept lze nastavit **Text Filter** (regex), např.:
- `.*[0-9]+x.*°.*` — zprávy s položkami („2x 12°")
- `.*potřebuji.*` / `.*objednávám.*` — jen objednávky

### 5. Filtr skupiny (chat_id) a vlastní zprávy — prevence smyčky

Webhook zpracovává **JEN zprávy ze skupiny „Objednávky pivovar“** (všechny ostatní
ignoruje). Podmínka zpracování:

```
IF (chat_id == "ID_SKUPINY" AND from_me == false) → zpracuj
ELSE → ignoruj
```

- **chat_id** je stabilní ID skupiny (nezmění se ani po přejmenování). Dokud není
  zaregistrováno, webhook přechodně filtruje podle **názvu skupiny**.
- **Jak chat_id zjistit a zaregistrovat**:
  1. Pošli si zprávu do skupiny (nebo počkej na první reálnou) — webhook ji
     zpracuje podle názvu a do logu funkce vypíše detekované chat_id:
     `🆔 DETEKCE chat_id pro skupinu "Objednávky pivovar": chat_id="120363...@g.us"`.
  2. Zaregistruj ho (stabilní filtr podle chat_id):
     ```
     node scripts/set-whatsapp-senders.mjs --chat-id "120363...@g.us"
     ```
  3. Odebrání: `node scripts/set-whatsapp-senders.mjs --clear-chat-id`
- **Vlastní zprávy (from_me)** se **nikdy** neukládají ani neposílají k AI.
  Když odpovíš do skupiny z jiného zařízení / WhatsApp Webu (v notifikaci je
  „You: “ / „Ty: “ / „Vy: “), webhook zprávu zahodí — **nevznikne smyčka**
  (AI → odpověď → Tasker → webhook).

## Volitelně: Make.com místo přímého volání
Make.com je užitečný, když chceš:
- filtry zpráv (jen objednávky od známých odběratelů)
- logování do Google Sheets / e-mailu
- notifikace o chybách

Scénář: **Webhook (příjem od Taskeru)** → **HTTP (POST na webhook aplikace)**.
Webhook aplikace: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
V HTTP kroku přidej hlavičku **`x-webhook-token`** se stejnou hodnotou jako v Taskeru
(z `.env` — viz 🔐 výše).

---

**Verze dokumentu**: 1.2
**Poslední aktualizace**: 2026-08-09
**Webhook URL**: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
