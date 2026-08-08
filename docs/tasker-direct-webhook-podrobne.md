# Tasker → webhook aplikace PŘÍMO — PODROBNÝ POSTUP (Tasker v češtině)

> Cíl: aby WhatsApp objednávka z telefonu **automaticky** dorazila do aplikace
> (modál se Schválit/Zamítnout) **bez Make.com**.
> Cesta: **AutoNotification** (zachytí notifikaci) → **Tasker** (pošle HTTP)
> → webhook aplikace → DB → AI parsing → aplikace.

---

## 1. Co nainstalovat a povolit

1. Z Google Play nainstalujte **Tasker** a **AutoNotification**.
2. Otevřete **AutoNotification**:
   - Aplikace vás vyzve k povolení **přístupu k notifikacím** →
     **Nastavení → Přístup k notifikacím** → zapněte **AutoNotification**.
   - V AutoNotification otevřete **Intercept** (Zachytávání) a ujistěte se,
     že je **zapnutý** (přepínač nahoře).
   - WhatsApp není potřeba přidávat ručně — zachytávají se všechny notifikace.

---

## 2. Tasker — vytvoření PROFILU (spouštěč)

1. Otevřete **Tasker** → dole záložka **Profily** (Profiles).
2. Klepněte na **+** (přidat profil).
3. Vyberte **Událost** (Event).
4. V nabídce vyberte **Zásuvný modul** (Plugin) → **AutoNotification** →
   **Zachytit / Intercept**.
5. Otevře se nastavení AutoNotification. Vyplňte:
   - **Aplikace / Notifikace**: nechte prázdné (vše) **nebo** vyberte WhatsApp
     (`com.whatsapp`).
   - **Název (Title)**: **prázdné** (filtr nechcete).
   - **Text (Text)**: **prázdné** (filtr nechcete).
6. Uložte nastavení **tlačítkem disketka / ✓** (vpravo nahoře), pak vráťte se
   do Taskeru a profil **uložte** (✓ dole).
7. Tasker se zeptá *„Přiřadit úlohu?"* → zvolte **Nová úloha** (New Task) →
   pojmenujte např. **WhatsApp do pivovaru**.

---

## 3. Tasker — vytvoření ÚLOHY (odeslání HTTP)

V úloze přidejte první akci:

1. Klepněte na **+** (přidat akci).
2. Vyberte kategorii **Síť** (Net).
3. Vyberte **Požadavek HTTP** (HTTP Request). *(Ve starším Taskeru „HTTP Post" — viz poznámka na konci.)*
4. Vyplňte pole přesně takto:

| Pole (čeština) | Hodnota |
|---|---|
| **Server / Host** | `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook` |
| **Cesta (Path)** | *(nechte prázdné)* |
| **Metoda** | `POST` |
| **Hlavičky (Headers)** | `Content-Type: application/json` |
| **Tělo (Body)** | `{"sender":"%antitle","message":"%antext","timestamp":"%antime","senderNumber":"%annumber","webhookId":"%TIMEMS"}` |
| **Časový limit (Timeout)** | `30` sekund |

5. Uložte akci (✓) a vraťte se na **Profily** — profil musí být **zapnutý**
   (zelený / bez přeškrtnutí).

> ⚠️ **NEPŘEPISUJTE** `%antitle`, `%antext`, `%antime`, `%annumber`, `%TIMEMS`.
> To jsou **proměnné** — AutoNotification je sám vyplní při každé zprávě:
> - `%antitle` = jméno odesílatele (kontakt)
> - `%antext` = text zprávy
> - `%antime` = čas
> - `%annumber` = telefonní číslo
> - `%TIMEMS` = unikátní čas odeslání (ochrana před duplicitami)
>
> Tělo JSON kopírujte **na jeden řádek, přesně tak jak je** (i když je zpráva
> víceřádková, webhook to dnes zvládá — opraveno).

---

## 4. Otestování

1. V WhatsApp si pošlete zprávu sami sobě: **WhatsApp → „Napsat sobě / Message yourself"**:
   ```
   Ahoj sládku, na pondělí potřebujeme:
   2x 12° světlý ležák 50l
   1x 13° jantar 30l
   ```
2. Otevřete **Tasker → Protokoly (Logs) → Protokol běhu (Run log)** —
   měl by tam proběhnout **HTTP Request**.
3. Zpráva dorazí do databáze a v aplikaci (Objednávky) vyskočí modál se
   Schválit / Zamítnout.

---

## 5. Řešení problémů

| Problém | Příčina a řešení |
|---|---|
| V Run logu **nic není** | AutoNotification nezachytává notifikace. Zkontrolujte **přístup k notifikacím** (Nastavení → Přístup k notifikacím → AutoNotification) a **optimalizaci baterie** (viz níže). |
| V Run logu **HTTP chyba** (4xx/5xx) | Zkopírujte přesný text chyby a pošlete vývojáři. |
| Profil se nespouští, i když přijdou zprávy | Android **zabíjí Tasker na pozadí**: Nastavení → Baterie → vyberte **Tasker** a **AutoNotification** → **Optimalizace baterie = vypnuto** / „Nezbavovat se". U Samsungu také Nastavení → Baterie → Zavřené aplikace → přidejte obě do seznamu. |
| Po restartu telefonu nefunguje | Znovu zkontrolujte přístup k notifikacím (někdy se po aktualizaci vypne). |
| Zpráva dorazila, ale AI nezná odběratele | Normální stav — zpráva zůstane „parsed bez místa" a vy v modálu místo doplníte ručně. |

---

## 6. Starší Tasker bez „HTTP Request"

Pokud v kategorii **Síť** nemáte „Požadavek HTTP", použijte **Síť → HTTP Post**:

- **Server / Host**: `https://sasqexjadvlqyticxwja.supabase.co`
- **Cesta / Path**: `/functions/v1/whatsapp-webhook`
- **Data / Tělo**: stejný JSON jako výše
- **Hlavičky**: `Content-Type: application/json`

---

## Užitečné odkazy

- Webhook URL: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
- Aplikace: https://zajic-pivovar.pages.dev
- Technický návod (stručnější): `docs/tasker-direct-webhook.md`

**Verze dokumentu**: 2.0 · **Poslední aktualizace**: 2026-08-08
