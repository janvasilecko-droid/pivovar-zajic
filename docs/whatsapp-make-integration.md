# WhatsApp Auto-Import přes Make.com (dříve Integromat)

Tento dokument popisuje, jak nastavit automatický příjem WhatsApp zpráv do pivovarské aplikace pomocí Make.com a AutoNotification.

## Přehled řešení

1. **AutoNotification** na Androidu zachytí příchozí WhatsApp zprávy
2. **Tasker** předá data do **Make.com** webhooku
3. **Make.com** scénář pošle data do naší aplikace
4. **Aplikace** automaticky rozparsuje zprávu pomocí AI a vytvoří objednávku

## Krok 1: Nastavení AutoNotification + Tasker

### 1.1 Instalace aplikací
1. Nainstalujte **AutoNotification** z Google Play
2. Nainstalujte **Tasker** z Google Play
3. Povolte přístupová práva pro obě aplikace

### 1.2 Konfigurace AutoNotification
1. Otevřete **AutoNotification**
2. Přejděte na **Intercept**
3. Najděte WhatsApp a povolte zachytávání oznámení
4. Nastavte:
   - **Package**: com.whatsapp
   - **Title Filter**: (nechte prázdné)
   - **Text Filter**: (nechte prázdné)
   - **Actions**: Zaznamenat celé oznámení

### 1.3 Vytvoření Tasker úlohy
1. Otevřete **Tasker**
2. Vytvořte novou úlohu s názvem "WhatsApp to Make"
3. Přidejte akci:
   - **Plugin** → **AutoNotification** → **Intercept**
4. Nastavte proměnné:
   - `%antitle` → sender name
   - `%antext` → message text
   - `%antime` → timestamp
   - `%anpackage` → com.whatsapp
5. Přidejte další akci:
   - **Net** → **HTTP Request**
   - URL: `YOUR_WEBHOOK_URL` (viz krok 2)
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Body:
     ```json
     {
       "sender": "%antitle",
       "message": "%antext",
       "timestamp": "%antime",
       "senderNumber": "%annumber",
       "messageType": "whatsapp"
     }
     ```

## Krok 2: Vytvoření Make.com scénáře

### 2.1 Přihlášení do Make.com
1. Jděte na [make.com](https://www.make.com)
2. Přihlaste se nebo vytvořte účet

### 2.2 Vytvoření nového scénáře
1. Klikněte na **Create a new scenario**
2. Pojmenujte scénář "WhatsApp to Brewery App"

### 2.3 Přidání Webhook modulu
1. Klikněte na **+** pro přidání modulu
2. Vyberte **Webhook**
3. Zvolte **Custom webhook**
4. Zkopírujte URL: `https://YOUR_SUPABASE_URL/functions/v1/whatsapp-webhook`
5. Uložte webhook

### 2.4 Přidání AutoNotification modulu (volitelné)
1. Přidejte další modul
2. Vyhledejte **AutoNotification**
3. Připojte svůj AutoNotification účet
4. Mapujte data z AutoNotification na webhook:
   - `sender` → `%antitle`
   - `message` → `%antext`
   - `timestamp` → `%antime`

### 2.5 Uložení a aktivace
1. Klikněte na **Save**
2. Klikněte na **Run once** pro test
3. Pokud vše funguje, zapněte **Schedule** nebo **Real-time**

## Krok 3: Testování

### 3.1 Testovací zpráva
Pošlete testovací WhatsApp zprávu s objednávkou:
```
Ahoj, na středu potřebuji:
2x 12° světlý ležák 50l
1x 13° jantar 30l
Díky!
```

### 3.2 Kontrola v aplikaci
1. Otevřete pivovarskou aplikaci
2. Přejděte do sekce **Objednávky**
3. Klikněte na **Import z WhatsApp**
4. Měla by se zobrazit nová zpráva s statusem "parsed"

### 3.3 Problémy a řešení

#### Zpráva se nezobrazuje
1. Zkontrolujte, zda Make.com scénář běží
2. Zkontrolujte logy v Make.com
3. Ověřte, zda AutoNotification zachytává oznámení

#### Chyba parsování
1. Zkontrolujte formát zprávy
2. Zkuste jednodušší zprávu
3. Spusťte manuální parsování v aplikaci

## Krok 4: Pokročilé nastavení

### 4.1 Filtrování zpráv
V Make.com můžete přidat filtry:
- Pouze zprávy od určitých kontaktů
- Zprávy obsahující klíčová slova ("potřebuji", "objednávám", "na pondělí")
- Ignorovat zprávy s obrázky

### 4.2 Notifikace o chybách
Nastavte notifikace při:
- Nepodaří se rozparsovat zprávu
- Duplicitní objednávka
- Neznámý odběratel

### 4.3 Zálohování zpráv
Přidejte modul pro ukládání zpráv do:
- Google Sheets
- Dropbox
- Email

## Technické detaily

### Webhook payload formát
```json
{
  "sender": "Jméno Odesílatele",
  "senderNumber": "+420123456789",
  "message": "Text zprávy s objednávkou",
  "timestamp": "2026-08-07T14:30:00Z",
  "messageType": "whatsapp",
  "webhookId": "unique-id-123"
}
```

### Statusy zpráv
- **pending**: Čeká na zpracování
- **processing**: Právě se parsuje AI
- **parsed**: Úspěšně rozparsováno
- **imported**: Vytvořena objednávka
- **error**: Chyba při zpracování
- **ignored**: Manuálně ignorováno

### API endpointy
- `POST /functions/v1/whatsapp-webhook` - Příjem zpráv
- `POST /functions/v1/whatsapp-auto-parse` - Automatické parsování
- `GET /whatsapp-incoming` - Seznam příchozích zpráv (UI)

## Podpora

### Časté otázky
**Q: Funguje to i s WhatsApp Business?**
A: Ano, AutoNotification zachytává oznámení z obou verzí.

**Q: Co když přijde zpráva s fotkou?**
A: AutoNotification zachytí pouze textovou část. Fotky se nezpracovávají.

**Q: Jak dlouho trvá zpracování?**
A: AI parsování trvá 2-10 sekund.

### Kontakt
Pro technickou podporu kontaktujte vývojový tým nebo nahláste problém v aplikaci.

---

**Verze dokumentu**: 1.0  
**Poslední aktualizace**: 2026-08-07  
**Kompatibilní s aplikací**: v1.509+