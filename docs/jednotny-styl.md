# Jeden styl pro celou aplikaci

Sepsáno 4. 9. 2026 podle **screenshotů z telefonu** (Kniha jízd, Inventura,
Sklo & Etikety, Sklad, Lahve, KEG, tři stránky Plochy) — tedy ne z domněnek.

## Co jsi viděl: čtyři vzhledy vedle sebe

| # | Vzhled | Kde | Jak vypadá |
| --- | --- | --- | --- |
| 1 | **Tmavý ovládací panel** | Inventura, Kniha jízd, Sklo | Téměř černý blok, v něm žluté a zelené tlačítko přes celou šířku |
| 2 | **Žluté pilulky** | záložky všude (Sklad, Inventura, KEG, Lahve) | Aktivní plná žlutá, neaktivní krémová s rámečkem, řádek se roluje do strany |
| 3 | **Bílá karta s velkým číslem** | Kniha jízd, Inventura, Sklad | Bílá karta, šedý nadpis kapitálkami, velké číslo, popisek |
| 4 | **Barevná konfeta** | KEG → Přehled, úkoly ke stočení | V jednom řádku: světle modré „Upravit", žluté −, zelené +, žlutý výběr, červené × |
| 5 | **Pastelové dlaždice** | Plocha | Sytá plná barva, bílá ikona, popisek pod ní, bez rámečku |

Pátý (Plocha) je v pořádku — je to jiný **kontext**, ne jiný styl: rozcestník
si vlastní jazyk zaslouží. Problém jsou první čtyři, protože se potkávají na
jedné obrazovce.

## Proč to tak je (změřeno)

V aplikaci je **1 047 tlačítek**. Rozpad (přeměřeno 4. 9. 2026 opraveným
skriptem — viz „jak jsem to třikrát spočítal špatně" níž):

| Kolik | Jaké | Poznámka |
| --- | --- | --- |
| **568** | **mají vlastní barvu pozadí** | tohle je ten rozjezd |
| 271 | používají systém `.btn-*` | v pořádku |
| 114 | bez pozadí (ikona nebo text) | většinou v pořádku |
| 65 | bílé / průhledné | v pořádku |
| 29 | přechod nebo poloprůhledné | k dořešení |

Nejčastější vlastní barvy:

```
bg-amber-500  182×     bg-neutral-100  96×     bg-emerald-700 41×
bg-rose-100    35×     bg-amber-100    35×     bg-amber-200   35×
bg-neutral-200 22×     bg-rose-600     22×
```

### Jak jsem to spočítal třikrát a dvakrát špatně

Stojí to za zapsání, ať se to nedělá znovu:

1. **„865"** — počítal jsem tlačítka, která nepoužívají `.btn`, a mezi ně
   patří i ikonová a textová, která žádnou barvu nemají. Nadsazeno.
2. **„174"** — oprava, která byla horší než původní chyba. Značka se
   hledala regulárkou `<button[\s\S]*?>`, jenže `onClick={() => del(x)}`
   obsahuje `>` z tlusté šipky, takže se čtení zastavilo *před* atributem
   `className`. U každého tlačítka s obsluhou (tedy u většiny) se barva
   vůbec neviděla.
3. **„568"** — značka se teď čte znak po znaku, s hlídáním hloubky `{}`
   a řetězců. Tohle číslo souhlasí i s ruční kontrolou vzorku.

Systém tedy nechybí — **jen se u barevných tlačítek nepoužívá**. Každá
obrazovka si to svoje namalovala znovu podle toho, kdy vznikla. Odtud čtyři
vzhledy.

---

## Návrh: pět rolí, ne čtrnáct barev

Barva má znamenat **co to udělá**, ne kdo to psal. Návrh je držet přesně
těchto pět rolí a šestou variantu nepřidávat:

| Role | Vzhled | Kdy | Třída |
| --- | --- | --- | --- |
| **Hlavní akce** | plná měděná (primary) | jedna na obrazovku: Zapsat, Uložit, Zahájit stáčení | `.btn-primary` |
| **Potvrzení hotového** | plná zelená | Hotovo, Zavezeno, Schválit | `.btn-emerald` |
| **Vedlejší akce** | bílá s rámečkem | Excel, Tisk, Filtr, Zrušit | `.btn-ghost` |
| **Nebezpečná** | bledě červená s červeným písmem | Smazat, Storno | `.btn-danger` |
| **Množství** | šedé kruhové − / + | plus a minus u kusů | `.btn-pocet` (nová) |

Čeho se tím zbavíme:
- **žluté tlačítko jako hlavní akce** — žlutá je v appce barva *značky*
  (navigace, dlaždice), takže žluté tlačítko splývá s pozadím i s pilulkami
  záložek. Hlavní akce má být měděná, ta je v paletě právě na to;
- **zelené „Excel"** — export není potvrzení hotové práce, je to vedlejší
  akce; dnes je zelenější než „Hotovo";
- **tmavé „Tisk"** vedle zelené a žluté v jednom panelu.

## Návrh: čtyři stavební kameny místo čtyř vzhledů

### K1. Panel akcí → lišta akcí
Dnes: tmavý blok se čtyřmi tlačítky přes celou šířku sežere **celou první
obrazovku telefonu** (Inventura: čtyři tlačítka po ~90 px + měsíc = ~700 px,
teprve pak začíná obsah). Na Sklo & Etikety je v tom panelu **jediné
tlačítko „Excel"** a vedle něj 150 px prázdna.

Návrh: jedna vodorovná lišta pod nadpisem, výška 44 px, **hlavní akce
zůstane vidět, ostatní se schovají pod „⋯"**. Panel není potřeba tmavý —
tmavý blok na světlé stránce vypadá jako druhá aplikace uvnitř té první.

### K2. Záložky → jedna komponenta
Dnes: každá obrazovka má vlastní řádek pilulek a **texty se řežou v půlce
slova** („…by (K 1. dni v měsíci)", „Audit — Invent…", „Sledová…").
Návrh: jedna komponenta `Zalozky` s krátkými popisky, jasným odříznutím
(gradient na kraji, ne odseknuté slovo) a zapamatovanou poslední záložkou.
Kde jsou názvy dlouhé, zkrátit je: „Fyzická inventura & Manko/Přebytek" →
**„Manko"**.

### K3. Karta s číslem → řádek s číslem
Dnes tři karty v Knize jízd zaberou ~540 px, aby ukázaly tři nuly. Návrh:
jeden pruh se třemi čísly vedle sebe (výška ~72 px). Velká karta má smysl
jen tam, kde je číslo hlavní věc na obrazovce.

### K4. Řádek akcí → jedna hlavní + zbytek do „⋯"
Dnes v KEG → Přehled má každý záznam pět barevných tlačítek a mazání sedí
vedle plusu. Návrh: v řádku **jedna** akce (Upravit) plus přetažení do
strany na smazání, nebo „⋯" s nabídkou. Barva zůstane jen mazání.

---

## Jak se tam dostat, aby se to nerozbilo

Přepsat 568 tlačítek naráz je nejlepší způsob, jak appku na týden
položit. Návrh je postup, který už tenhle projekt používá u tříd a
kontrastu:

1. **Doplnit chybějící role do `index.css`** — ✅ **hotovo 4. 9. 2026:**
   `.btn-pocet` (šedé −/+), `.lista-akci` (hlavní akce + „⋯"),
   `.pruh-cisel` (tři čísla na 72 px). Zbývá `.zalozky`.
2. **Kontrola `scripts/zkontroluj-tlacitka.mjs`** — ✅ **hotovo 4. 9. 2026.**
   Nehlásí dluh, který už existuje (to by znamenalo 553 chyb hned), ale
   spadne, jakmile dluh NAROSTE. Výchozí stav je v
   `scripts/tlacitka-zaklad.json`, po každém převedené obrazovce se
   zmenší (`--uloz`). Výpis stavu: `--vypis`. Běží v pre-commit i v CI,
   stejně jako `zkontroluj-tridy` a `zkontroluj-kontrast`.
3. **Převádět po obrazovkách**, v pořadí podle toho, jak často se používají:
   Objednávky → KEG → Lahve → Sklad → Inventura → zbytek. Každá obrazovka
   je jeden commit, jde ji vrátit.
4. **Výjimky vypsat, ne mlčet**: Plocha (dlaždice) a barvy piv zůstávají
   vlastní; do kontroly se zapíšou jako povolené výjimky s důvodem.

Body 1 a 2 jsou hotové. **Krok 3 začal 4. 9. 2026:** převedená je Kniha
jízd (tmavý panel → lišta akcí, tři karty → pruh čísel), Inventura (panel
→ lišta akcí, měsíc nahoru), Sklo & Etikety (panel s jedním knoflíkem →
tlačítko) a řádek záznamu ve Stáčení KEG i v Lahvích (pět barev → jedna).
Zbytek postupně, jedna obrazovka = jeden commit.

---

## Co jsem u toho na screenech ještě viděl (a co je vážnější než styl)

1. **Ikonové hlavičky sloupců ve Skladu** — sloupce „Stav / Odejde / Zbude"
   mají v tabulce jen ikony (krabice, výstražný trojúhelník, vrstvy) a
   vysvětlení je v legendě nad tím. Na telefonu se legenda odroluje a zůstanou
   tři obrázky. **Napsat do hlavičky slova.**
2. **„0 (−10)" ve Skladu** — velká nula a pod ní červená −10. Skutečná
   informace je ta −10 („chybí deset"), ale oko čte tu nulu. Ukázat rovnou
   „chybí 10 ks".
3. **Kolečko načítání přes lupu** — tady jsem se spletl: není to prvek
   aplikace, ale **pull-to-refresh Chromu**. Vážnější je, že se s ním hádá
   vlastní gesto plochy (tah dolů = hledání) a výhra prohlížeče znamená
   reload uprostřed rozdělané práce. **Vypnuto 4. 9. 2026**
   (`overscroll-behavior-y: contain`).
4. **Skloňování** — stálo tam „2 vozidel" a „1 jízd". **Opraveno**
   4. 9. 2026 (`mnozne()` v `src/lib/cisla.ts` + 5 testů).
5. **Dvakrát totéž tlačítko** — „Generovat z objednávek" je v Knize jízd
   v panelu i v prázdném stavu pod ním. **Nechávám**: prázdný stav je to
   správné místo, když nejsou žádné jízdy, a panel je potřeba, jakmile
   nějaké jsou. Vedle sebe jsou jen ve chvíli, kdy je měsíc prázdný.
6. **Trojí „hotovo" v jednom řádku** u stáčení. **Opraveno 4. 9. 2026:**
   u hotové položky, kterou nikdo neodškrtával ručně, se celý řádek
   s tlačítky nekreslí — −, + i „Hotovo" tam byly všechny tři neaktivní.
   U dvaceti stočených položek to je 880 px mrtvého místa.
7. **Žluté šipky ‹ › na žlutém podkladu** (Lahve → Přehled).
   **Opraveno 4. 9. 2026** — bílé s rámečkem, tedy role „vedlejší akce".
8. **Prázdná místa v mřížce Plochy** — třetí stránka je přeplněná a má
   v mřížce díru, čtvrtá je z poloviny prázdná. Přerovnat.
9. **Text „Vozidla — STK/znám…"** v pásku upozornění byl odseknutý v půlce
   slova. **Opraveno 4. 9. 2026**: „STK a známky", „WhatsApp — přečíst",
   „Nová verze 2.242", „Měsíční úklid".
10. **Sklad: ikonové hlavičky sloupců a „0 (−10)"**. **Opraveno
    4. 9. 2026** — v hlavičce jsou slova (Obal / Stav / Odejde / Zbude) a
    místo „(−10)" je „chybí 10".
