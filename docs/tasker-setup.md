# Nastavení Taskeru pro WhatsApp automatický import

## Co potřebujete

1. **AutoNotification** (Google Play) - zdarma
2. **Tasker** (Google Play) - placená aplikace (~$3.49)
3. **Minipivovar Zajíček** aplikace (naše)

## Návod krok za krokem

### 1. Instalace AutoNotification
- Instalace z Google Play
- Povolení přístupu k notifikacím
- Nastavení WhatsApp jako sledované aplikace

### 2. Nastavení Taskeru

#### Vytvoření nového profilu:
1. Otevřete Tasker
2. Klepněte na **"+"** → **Událost**
3. Vyberte **Plugin** → **AutoNotification** → **Intercepted**

#### Konfigurace AutoNotification:
- **Apps**: WhatsApp
- **Notification Title**: `%antitle` (obsahuje název kontaktu)
- **Notification Text**: `%antext` (obsahuje text zprávy)

#### Akce po zachycení notifikace:
1. V profilu přidejte novou úlohu
2. Vyberte **System** → **Send Intent**
3. Nastavte:
   - **Action**: `android.intent.action.SEND`
   - **Mime Type**: `text/plain`
   - **Extra**: `android.intent.extra.TEXT:%antext`
   - **Package**: `com.minipivovar.zajic`
   - **Class**: `cz.minipivovar.zajic.MainActivity`

### 3. Testování nastavení

#### Test 1: Manuální test
1. Otevřete WhatsApp a pošlete zkušební zprávu:
   ```
   Ahoj sládku, na čtvrtek potřebujeme:
   2x 12° světlý ležák 50l
   1x 13° jantar 30l
   Díky!
   ```
2. Zpráva by se měla objevit v naší aplikaci v záložce **WhatsApp**

#### Test 2: Přímé sdílení
1. Zkopírujte text z WhatsApp
2. Použijte tlačítko **Sdílet**
3. Vyberte aplikaci **"Minipivovar Zajíček"**
4. Text by se měl zobrazit v aplikaci

## Řešení problémů

### AutoNotification nezachytává WhatsApp notifikace
- Zkontrolujte povolení v nastavení Androidu
- WhatsApp musí běžet na pozadí
- Zkontrolujte správnost nastavení u AutoNotification

### Tasker nezpracovává zprávy
- Zkontrolujte ADMIN_NOTIFICATION_LISTENER povolení
- Tasker musí běžet na pozadí
- Override Doze možná nutná

### Aplikace nepřijímá zprávy
- Ověřte správnost Package a Class v Send Intent
- Aplikace musí mít povolený přijímat intenty
- Zkontrolujte AndroidManifest.xml (nyní má správné nastavení)

## Filtrování zpráv (nepovinné)

Pokud chcete automaticky zpracovávat jen objednávky, můžete přidat filtry:

### Textové filtry v AutoNotification:
- `objednávka`
- `objednavka`
- `potřebujeme`
- `dodání`
- `pivo`
- `sud`
- `litr`

### Regex filtry (pokročilé):
- `.*[0-9]+x.*°.*litr.*`
- `.*objed[^ ]*.*`
- `.*pivo.*[0-9]+x.*`

## Bezpečnostní poznámky

- WhatsApp zprávy jsou uloženy pouze lokálně v aplikaci
- AutoNotification potřebuje práva pro čtení všech notifikací
- Tasker profil není aktivován při uzamčeném telefonu
- Zprávy není možné posílat zpět do WhatsApp

## Podpora

Pokud narazíte na problémy:

1. Zkontrolujte log Taskeru (záložka Logs)
2. Ověřte, že AutoNotification skutečně zachycuje WhatsApp notifikace
3. Zkuste přímé sdílení textu (Sdílet → Minipivovar Zajíček)
4. Kontaktujte vývojáře pokud problém přetrvává

## Aktualizace

Tento systém bude postupně vylepšován:

1. **Fáze 1**: Příjem a zobrazení zpráv ✓
2. **Fáze 2**: Rozpoznávání objednávek pomocí AI
3. **Fáze 3**: Automatické vytváření objednávek
4. **Fáze 4**: Integrace s Make.com pro přesnější parsování

---

**Poslední aktualizace**: 7.8.2026  
**Verze aplikace**: v1.510+  
**Kompatibilní Android**: 8.0+ (Oreo a vyšší)