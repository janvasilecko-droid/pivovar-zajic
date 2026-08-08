# Tasker → webhook aplikace PŘÍMO (bez Make.com)

Tento návod ukazuje, jak nastavit Tasker tak, aby posílal WhatsApp zprávy
přímo do webhooku aplikace **bez Make.com**. Make.com je volitelná mezistanice
(filtry, deduplikace, logy, Google Sheets) — pro základní fungování není nutná.

## Webhook

- **URL**: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
- **Metoda**: POST
- **Hlavičky**: žádné (JWT ověření je vypnuté)
- **Body** (JSON):
  ```json
  {
    "sender": "%antitle",
    "message": "%antext",
    "timestamp": "%antime",
    "senderNumber": "%annumber",
    "webhookId": "%TIMEMS"
  }
  ```
- Webhook přijímá `timestamp` jako **ISO string i epoch milisekundy** (AutoNotification
  posílá epoch milisekundy → `%antime` funguje).
- `webhookId` je volitelný — slouží k deduplikaci (stejné ID se nezpracuje 2×).
  `%TIMEMS` je unikátní čas odeslání → bezpečné.

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
     {"sender":"%antitle","message":"%antext","timestamp":"%antime","senderNumber":"%annumber","webhookId":"%TIMEMS"}
     ```
   - **Headers**: prázdné
3. Uložit

> **Poznámka ke staršímu Taskeru**: pokud nevidíš „HTTP Request", použij
> **Net → HTTP Post** a do pole **Path** dej `/functions/v1/whatsapp-webhook`,
> **Server** `https://sasqexjadvlqyticxwja.supabase.co`, **Data / Body** stejný JSON.

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

## Volitelně: Make.com místo přímého volání
Make.com je užitečný, když chceš:
- filtry zpráv (jen objednávky od známých odběratelů)
- logování do Google Sheets / e-mailu
- notifikace o chybách

Scénář: **Webhook (příjem od Taskeru)** → **HTTP (POST na webhook aplikace)**.
Webhook aplikace: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`

---

**Verze dokumentu**: 1.0
**Poslední aktualizace**: 2026-08-08
**Webhook URL**: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
