# Automatické vkládání zápisů do Google Tabulky

Skript `scripts/vloz-do-tabulky.mjs` připíše zápisy z aplikace na konec listu —
stejná data a stejné rozvržení, jaké dává tlačítko **„Přehled k vykopírování"**,
jen bez ručního kopírování.

## Než to poprvé pustíš

### 1. Převeď list na nativní Google Tabulku

**Tohle je jediná podmínka, kterou nejde obejít.** Soubory, které mají v záhlaví
u názvu odznak **`.XLSX`**, jsou excelové přílohy jen otevřené v Tabulkách.
Google Sheets API do nich zapisovat neumí — vrátí chybu, ne poškozený soubor,
takže se nic nerozbije, ale ani nezapíše.

V Tabulkách: **Soubor → Uložit jako Tabulky Google**. Vznikne nový soubor;
ten původní zůstane nedotčený. ID nového souboru je v adrese mezi `/d/` a `/edit`:

```
https://docs.google.com/spreadsheets/d/TADY_JE_ID/edit
```

### 2. Založ servisní účet Google

Servisní účet je „robot", pod kterým skript zapisuje. Nepotřebuje heslo ani
přihlašování v prohlížeči.

1. <https://console.cloud.google.com> → vytvoř projekt (nebo použij existující)
2. **APIs & Services → Library** → najdi **Google Sheets API** → **Enable**
3. **APIs & Services → Credentials → Create credentials → Service account**
4. U vytvořeného účtu **Keys → Add key → Create new key → JSON** — stáhne se
   soubor s klíčem

Ten soubor **nepatří do repozitáře**. Ulož ho mimo projekt, třeba vedle něj jako
`google-klic.json`.

### 3. Nasdílej tabulku servisnímu účtu

V klíči je řádek `"client_email": "neco@nejaky-projekt.iam.gserviceaccount.com"`.
Tenhle e-mail nasdílej v Tabulce přes **Sdílet** s právem **Editor** — jinak
skript dostane chybu 403.

## Spuštění

```bash
node scripts/vloz-do-tabulky.mjs --list <ID_TABULKY> --zdroj personal --od 2026-08-01 --do 2026-08-31
```

| Přepínač | Význam |
| --- | --- |
| `--list` | ID tabulky z adresy |
| `--zdroj` | `personal`, `prodejna`, `odpis`, `lahve`, `keg` |
| `--od`, `--do` | období včetně krajních dnů |
| `--karta` | název listu, výchozí `List1` |
| `--nanecisto` | jen vypíše, co by vložil, a nic nezapíše |

**Napřed to vždycky pusť s `--nanecisto`.** Vypíše počet řádků a první tři,
takže je vidět, jestli sedí sloupce i období — a teprve pak to pusť doopravdy.

Cestu ke klíči lze změnit proměnnou `GOOGLE_KLIC`:

```bash
GOOGLE_KLIC=/cesta/ke/klici.json node scripts/vloz-do-tabulky.mjs --list <ID> --zdroj keg --od 2026-08-01 --do 2026-08-31
```

## Co skript dělá a co ne

- **Připisuje na konec** (`append`), nepřepisuje existující řádky.
- **Nevkládá hektolitry.** V listech jsou spočítané vzorcem z počtů vlevo —
  vložením hodnoty by se vzorec přepsal a od toho řádku dál by se přestalo
  počítat samo. Vkládá se po sloupec `0,33l` (u KEGů po `Tank č.`).
- **Nekontroluje duplicity.** Když stejné období pustíš dvakrát, řádky tam budou
  dvakrát. Proto to `--nanecisto`.

## Když to nejde

| Chyba | Příčina |
| --- | --- |
| `403` | tabulka není nasdílená servisnímu účtu jako Editor |
| `400 … not supported` | soubor je pořád `.xlsx`, viz krok 1 |
| `Nepodařilo se načíst klíč` | špatná cesta — nastav `GOOGLE_KLIC` |
| `Řádků k vložení: 0` | v tom období nejsou žádné zápisy |

## Rozvržení listů

Musí odpovídat `src/lib/prehledVydeje.ts`; když se změní tam, změň i skript.

| Zdroj | Sloupce |
| --- | --- |
| `personal`, `prodejna`, `odpis` | Datum │ Odběratel │ Druh piva │ 50 l · 30 l · 20 l · 15 l · 10 l │ 1,5l · 1,0l · 0,5l · 0,33l |
| `lahve` | Datum │ Druh piva │ **Z sudů** (5) │ Stočeno lahví (4) |
| `keg` | Datum │ Druh piva │ Stočené množství (5) │ Tank č. |

U `lahve` nejsou sloupce „Z sudů" obal zápisu, ale sudy **spotřebované** na
stočení (`kegs_used`).
