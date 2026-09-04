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

V aplikaci je **1 044 tlačítek**. Připravený systém (`.btn`, `.btn-primary`,
`.btn-ghost`…, definovaný v `src/index.css`) používá **179** z nich.
**865 tlačítek je namalovaných ručně** vlastními třídami, a to ve čtrnácti
různých barvách pozadí:

```
bg-amber-500  48×      bg-neutral-100 25×     bg-emerald-700 16×
bg-emerald-200 11×     bg-rose-100    10×     bg-neutral-200  8×
bg-neutral-800  8×     bg-rose-600     6×     bg-amber-100    6×
bg-amber-200    6×     bg-sky-700      5×     bg-neutral-900  5×
bg-emerald-100  4×     bg-sky-100      4×
```

Systém tedy nechybí — **jen se nepoužívá**. Každá obrazovka si tlačítko
namalovala znovu, podle toho, kdy vznikla. Odtud čtyři vzhledy.

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

Přepsat 865 tlačítek naráz je nejlepší způsob, jak appku na týden položit.
Návrh je postup, který už tenhle projekt používá u tříd a kontrastu:

1. **Doplnit chybějící role do `index.css`** (`.btn-pocet`, `.zalozky`,
   `.lista-akci`, `.pruh-cisel`) — jeden den, nic se nemění.
2. **Napsat kontrolu `scripts/zkontroluj-tlacitka.mjs`**, která spadne, když
   nové tlačítko má vlastní `bg-…` místo role. Hlídá to, aby se dluh
   nezvětšoval, i kdyby se převod táhl měsíc. (Stejný princip jako
   `zkontroluj-tridy` a `zkontroluj-kontrast`.)
3. **Převádět po obrazovkách**, v pořadí podle toho, jak často se používají:
   Objednávky → KEG → Lahve → Sklad → Inventura → zbytek. Každá obrazovka
   je jeden commit, jde ji vrátit.
4. **Výjimky vypsat, ne mlčet**: Plocha (dlaždice) a barvy piv zůstávají
   vlastní; do kontroly se zapíšou jako povolené výjimky s důvodem.

Odhad: bod 1 a 2 do dvou dnů, převod šesti hlavních obrazovek ~3 dny,
zbytek postupně bez spěchu.

---

## Co jsem u toho na screenech ještě viděl (a co je vážnější než styl)

1. **Ikonové hlavičky sloupců ve Skladu** — sloupce „Stav / Odejde / Zbude"
   mají v tabulce jen ikony (krabice, výstražný trojúhelník, vrstvy) a
   vysvětlení je v legendě nad tím. Na telefonu se legenda odroluje a zůstanou
   tři obrázky. **Napsat do hlavičky slova.**
2. **„0 (−10)" ve Skladu** — velká nula a pod ní červená −10. Skutečná
   informace je ta −10 („chybí deset"), ale oko čte tu nulu. Ukázat rovnou
   „chybí 10 ks".
3. **Kolečko načítání přes lupu** — v Inventuře se indikátor kreslí přes
   ikonu hledání v hlavičce (vidět na jednom ze screenů). Patří pod hlavičku.
4. **Skloňování** — stálo tam „2 vozidel" a „1 jízd". **Opraveno**
   4. 9. 2026 (`mnozne()` v `src/lib/cisla.ts` + 5 testů).
5. **Dvakrát totéž tlačítko** — „Generovat z objednávek" je v Knize jízd
   v panelu i v prázdném stavu pod ním.
6. **Trojí „hotovo" v jednom řádku** u stáčení: zelený čtvereček, zelený pruh
   „Hotovo" a zelená fajfka vpravo. Stačí jedno.
7. **Žluté šipky ‹ › na žlutém podkladu** (Lahve → Přehled) — nízký
   kontrast, na slunci nejsou vidět.
8. **Prázdná místa v mřížce Plochy** — třetí stránka je přeplněná a má
   v mřížce díru, čtvrtá je z poloviny prázdná. Přerovnat.
9. **Text „Vozidla — STK/znám…"** v pásku upozornění je odseknutý v půlce
   slova; štítek má mít kratší text („STK a známky").
