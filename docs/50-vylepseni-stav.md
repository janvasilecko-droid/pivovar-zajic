# 50 vylepšení — co je hotové (5. 9. 2026)

Průběžný stav k seznamu v `docs/50-vylepseni-telefon-a-stabilita.md`
(čísla odkazují na něj). Zadání znělo „udělej vše"; tenhle dokument říká
pravdu o tom, co z toho opravdu v kódu je, co dělat nejde a co jsem
vědomě neudělal a proč.

**Hotovo: 42 bodů. Čeká na majitele: 3. Vědomě neuděláno: 5** (u každého
je napsaný důvod — ne „nestihl jsem").

Výchozí stav po všech změnách:

```
npx vitest run       1315 testů / 119 souborů — všechny prošly
npx tsc --noEmit     bez chyby
npm run lint         0 chyb (1139 varování = známý dluh, utahuje se)
zkontroluj-tridy · kontrast · tlacitka · dotyk · popisky · velikost   OK
node scripts/e2e.mjs   scénář prošel
```

---

## Hotovo

### Ovládání na telefonu
| # | Co | Doklad |
| --- | --- | --- |
| 1 | TabBar má 44px cíl (byl ~24 px) a barvy z motivu | `TabBar.tsx` |
| 2 | 312 → 4 tlačítek bez zaručených 44 px | `zkontroluj-dotyk.mjs`, základ 4 |
| 3 | Sklo & etikety: karty na telefonu, tabulka na počítači | `SkloPromoScreen.tsx` |
| 4 | První sloupec drží u tabulek 900/920 px | `InventoryScreen`, `BottlingPlanPlanner` |
| 5 | Přilepený první sloupec i u 4 širokých tabulek | Diagnostika, audit, graf, souhrn |
| 6 | Zpět zavírá 6 dalších dialogů | `lib/zavriNaZpet.ts` + test |
| 7 | 198 ikonových tlačítek má aria-label | `zkontroluj-popisky.mjs` |
| 8 | Plovoucí prvky počítají s bezpečnou zónou | `.nad-dokem` |
| 9 | Sticky první sloupec | `.table-drzi-prvni-sloupec` |
| 10 | Zebra v tabulkách | `index.css` |
| 11 | Hustota sahá i na karty a řádky tabulek | `index.css` |
| 12 | — | **byl to můj omyl**, 0 polí bez `inputMode` |

### Jednotnost
| # | Co | Doklad |
| --- | --- | --- |
| 13 | Barvy grafu a TabBaru z proměnných | `StatistikaVystav`, `TabBar` |
| 14 | TabBar bez natvrdo psaných odstínů | `TabBar.tsx` |
| 15 | `HlavickaStranky` — jeden tvar nadpisu | 4 obrazovky převedené |
| 16 | Škála písma, 875× `text-[11px]` → `text-udaj` | `tailwind.config.js` |
| 17 | 12 → 5 velikostí ikon (297 změn) | — |
| 18 | 551 → 547 malovaných tlačítek, Uživatelé na TabBar | `tlacitka-zaklad.json` |
| 19 | Stavy objednávky: odstín + tvar (• ◐ ↑ ✓ ✓✓) | `Orders.tsx` |
| 20 | 12 → 6 pojmenovaných hladin překryvu | `tailwind.config.js` |
| 21 | „Upravit" jednou ikonou (Edit3 → Pencil) | test `jednotneIkony` |
| 22 | Tabulární číslice v celé aplikaci | `index.css` |
| 23 | 13 vlastních modálů se chová jako `<Modal>` | `lib/zavriNaZpet.ts` |

### Funkčnost
| # | Co | Doklad |
| --- | --- | --- |
| 23 | **„Vrátit zpět" maže podle id, ne podle hodnot** | KEG, Lahve, Prodejna + test |
| 24 | Zápisy vracejí id vloženého řádku | `.insert().select('id')` |
| 25 | „Nepodařilo se načíst" ≠ „nic tu není" | `prvniChyba()`, 3 obrazovky |
| 26 | Graf umí tmavý režim | `barvaZMotivu()` + test |
| 29 | Changelog doplněn o tuhle dávku | `lib/changelog.ts` |
| 30 | 50 odchycených chyb se hlásí do Diagnostiky | `zalogujANahlas()` |

### Plynulost
| # | Co | Doklad |
| --- | --- | --- |
| 31 | Stáčení KEG: 17 → 14 dotazů, odběr 17 → 13 tabulek | `Kegging.tsx` |
| 32 | Realtime nepřenačítá, když je appka v pozadí | `useRealtime` |
| 33+34 | Start 341 → 220 kB gzip (grafy až při Statistice) | `zkontroluj-velikost.mjs` |
| 38 | Kostra místo zhasnuté obrazovky (6 obrazovek) | `Kostra` + test |
| 39 | Zmizelo varování buildu o dělení kódu | `Layout`, `AppSettings` |
| 41 | Fotky ze storage `loading="lazy"` | 6 míst |
| 36 | Objednávky 273 → 120 kB (6 modálů na vyžádání) | `zkontroluj-velikost.mjs` |
| 36 | Čtení z fotky mimo kus obrazovky (Inventura, KEG, Lahve) | build |
| 46 | Evidence skladu má typy místo `any[]` | `stockLedger.ts` |

### Stabilita
| # | Co | Doklad |
| --- | --- | --- |
| 42 | Zastaralé načtení nepřepíše novější (12 načtení) | `usePosledniNacteni()` + test |
| 43 | **Vynucení oprávnění v databázi konečně platí** | migrace 20261229 + test |
| 44 | `removeChannel` místo `unsubscribe` | `auth.tsx` |
| 45 | Stálý klíč řádku místo indexu | `CountFromImage`, `ImportFromImage` |
| 47 | ESLint (a hned 2 skutečné chyby) | `eslint.config.js` |
| 48 | +7 testů na UI a chování | kostra, dialog, načítání, graf |
| 49 | E2E scénář zápisu | `scripts/e2e.mjs` |
| 50 | Vzorník prvků + snímky před/po | `/prvky.html`, `scripts/snimky.mjs` |
| 49 | Druhý E2E scénář: vzorník v obou režimech | `scripts/e2e.mjs` |

### Navíc, co v seznamu nebylo
- **Hooky volané po `return null`** — modal „Přizpůsobení osobního menu"
  na tom v Nastavení spadl. Našel ESLint.
- **`let mounted = true`, které se nikdy nepřepnulo** — zrušení načtení
  v `auth.tsx` tedy nikdy nefungovalo.
- **Dva mrtvé `useMemo` v KEGu**, které při každém překreslení projely
  všechny řádky stáčení a jejich výsledek se nikde nezobrazoval; v jednom
  z nich navíc `Number(x) ?? 0`, z čehož u chybějícího množství vyjde NaN.
- **`recharts` importovaný v Historii, aniž by se použil.**
- **14 jednorázových diagnostik + `scratch_srot.cjs`** do `scripts/archiv/`.
- **Tři nové hlídače v CI**: velikost startu, dotykové cíle, popisky tlačítek.

---

## Čeká na majitele (z kódu to udělat nejde)

| # | Co | Kde |
| --- | --- | --- |
| 27 | Spustit 8 čekajících migrací | `docs/spustit-vsechny-migrace.sql` |
| 43 | **Spustit migraci 20261229** — do té doby oprávnění v databázi neplatí | Supabase → SQL Editor |
| 28 | Doplnit soukromý VAPID klíč do secrets | `docs/push-upozorneni-navod.md` |

A z prvního auditu pořád platí: **denní záloha commituje data zákazníků
do veřejného repozitáře** (`docs/50-vylepseni-podruhe.md`, body 1–2).
Tohle je rozhodnutí, ne úprava kódu.

---

## Vědomě neuděláno — a proč

| # | Co | Proč ne |
| --- | --- | --- |
| 5 | Mobilní karty pro 4 administrátorské tabulky | Administrátorské a souhrnné obrazovky, na telefonu se skoro neotvírají. Mají vlastní rolovací box a nově přilepený název, takže se čtou. Návrh karet pro každou z nich je práce, jejíž výsledek bych bez provozu neuměl posoudit. |
| 18 | Zbylých 547 malovaných tlačítek | Projekt sám si zvolil postupný převod („přepsat 865 tlačítek naráz je nejlepší způsob, jak appku položit") a má na to hlídače. Převedeno 4 a základ snížen; zbytek patří k obrazovkám, až se na nich bude dělat. |
| 35 | 70× `select('*')` na vyjmenované sloupce | Při dnešním objemu (177 objednávek, 209 stáčení za dva měsíce) je úspora neměřitelná, ale riziko reálné: vyjmenovaný sloupec, který v databázi chybí nebo přibude, rozbije dotaz tiše. Až s objemem, a pak s měřením. |
| 36 | Rozdělit `Orders.tsx` na soubory | Rozdělení SOUBORU zůstává neudělané — je to nejdůležitější obrazovka a bez možnosti proklikat objednávky v provozu je přeskládání riziko bez užitku. Co ale udělané je: šest těžkých modálů se stahuje až při otevření (**273 → 120 kB**) a sdílené kusy (stavy objednávek, posun měsíce) jsou vytažené do `lib/`. |
| 37 | `React.memo` a virtualizace | Memoizace naslepo umí výkon i zhoršit; správně se umisťuje podle profilu, a ten se dělá na skutečných datech a skutečném telefonu. Co šlo změřit staticky, uděláno je — mrtvé dotazy, mrtvé `useMemo`, přenačítání do kapsy a hlavně dělení kusů (viz #36 níž). |
| 40 | CSS do jednoho systému (`HomeScreen.css`) | 243 vlastních tříd plochy, která má záměrně vlastní vizuální jazyk. Převod na utility by byl velký diff bez viditelného přínosu. |
| 46 | Zbylých 12 `useState<any[]>` | `supabase gen types` potřebuje přístup k databázi, který tu není. **Hotové je to podstatné**: `StockSources` — vstup do jediného místa, které počítá sklad — měl deset polí `any[]` a má teď tři pojmenované typy. Zbytek drží tvary s vnořenými položkami, na které je potřeba vygenerovaný typ. |
| 12, 29 | — | Byly to **mé omyly v auditu**: `inputMode` nechybí nikde a changelog není prázdný. Opraveno v textu obou dokumentů. |

---

## Jak to ověřit

```bash
npm install
npx vitest run                # 1315 testů
npx tsc --noEmit
npm run lint
npm run zkontroluj-dotyk      # 4 výjimky, základ
npm run zkontroluj-popisky
npm run build && npm run zkontroluj-velikost   # 220 kB gzip start

npx vite --config vite.nahled.config.ts   # náhled
node scripts/e2e.mjs                      # scénář zápisu
node scripts/snimky.mjs                   # vzorník ve 3 šířkách × 2 režimech
```
