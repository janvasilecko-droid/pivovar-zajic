# WhatsApp Auto-Import přes Make.com (dříve Integromat)

Tento dokument popisuje, jak nastavit automatický příjem WhatsApp zpráv do pivovarské aplikace pomocí Make.com (cloudová brána).

## Přehled řešení

1. **Cloudová brána** (Make.com / WhatsApp webhook) přijme příchozí WhatsApp zprávu
2. **Make.com** scénář pošle data do naší aplikace
3. **Aplikace** automaticky rozparsuje zprávu pomocí AI a vytvoří objednávku

> ✅ **Tasker/AutoNotification na telefonu už nejsou potřeba.** Zprávy jdou rovnou
> přes cloudovou bránu do webhooku aplikace — je to efektivnější (telefon nemusí
> běžet, neztrácejí se zprávy při zavřené aplikaci).

## Krok 1: Vytvoření Make.com scénáře

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

### 2.4 Předání dat na webhook aplikace
1. Přidejte HTTP modul **Webhook → Custom webhook** (nebo **HTTP → Make a request**) jako poslední krok scénáře.
2. Nakonfigurujte POST na webhook aplikace:
   - **URL**: `https://YOUR_SUPABASE_URL/functions/v1/whatsapp-webhook`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json` + `x-webhook-token: <WEBHOOK_SECRET>` (viz zabezpečení níže)
   - **Body**: mapujte pole z webhooku vstupu:
     ```json
     {
       "sender": "…",
       "message": "…",
       "timestamp": "…",
       "senderNumber": "…",
       "messageType": "whatsapp",
       "webhookId": "…"
     }
     ```
3. Hodnotu `WEBHOOK_SECRET` najdete v `.env` projektu (řádek `WEBHOOK_SECRET=`).
   Bez správné hlavičky webhook vrací HTTP 401.

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
3. Ověřte, že cloudová brána zprávy skutečně odesílá (webhook vstup scénáře přijímá data)

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
A: Ano, cloudová brána zpracovává zprávy z obou verzí.

**Q: Co když přijde zpráva s fotkou?**
A: Webhook zpracovává text i přílohy — fotky se přepíší pomocí OCR v AI parsování.

**Q: Jak dlouho trvá zpracování?**
A: AI parsování trvá 2-10 sekund.

### Kontakt
Pro technickou podporu kontaktujte vývojový tým nebo nahláste problém v aplikaci.

---

**Verze dokumentu**: 1.0  
**Poslední aktualizace**: 2026-08-07  
**Kompatibilní s aplikací**: v1.509+