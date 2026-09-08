# 50 vylepšení — telefon, jednotnost, funkčnost, plynulost, stabilita

Sepsáno 5. 9. 2026, druhý průchod aplikací. Zadání: **aby se to dobře
ovládalo na telefonu, bylo to jednotné, funkční, nesekalo se a bylo to
stabilní.** Body jsou proto řazené podle těch pěti cílů, ne podle toho, kde
v kódu bydlí.

Tentokrát jsem nešel jen greppem přes celek, ale četl obrazovky: jak se
načítají data, co se děje při uložení, jak se kreslí seznamy a tabulky, co
udělá realtime, když někdo jiný něco zapíše. Několik věcí jsem si ověřoval
proti kódu a **nepotvrdily se** — ty tu nejsou (viz „Co vypadalo jako problém
a není" na konci).

**Stav plnění je v `docs/50-vylepseni-stav.md`** — 38 bodů hotových,
3 čekají na majitele, 9 vědomě neuděláno s důvodem.

Značky: ⭐ = nález z tohohle průchodu (v `docs/50-vylepseni-podruhe.md` není) ·
🔴 hned · 🟠 mělo by se · 🟢 až bude čas ·
**S** = do půl dne, **M** = den, **L** = víc dní.

---

## 1. Ovládání na telefonu

### 1. ⭐🔴 Nejčastěji tisknutá věc v appce má cíl 24 px (S)
`components/TabBar.tsx` — přepínač záložek, který používají Objednávky,
Kalendář, Odběratelé, Akce, Sanitační deníky, Auta i Stopky. Tlačítko má
`px-2 py-1`, popisek `text-[11px]`, ikonu `size={13}`; vychází z toho zhruba
**24 px na výšku**. Zbytek appky přitom drží 44 px (`.btn` má
`min-h-[44px]`, na mobilu ho `index.css` vynucuje i pro pole a `select`) —
jenže **holé `<button>` žádné takové pravidlo nemá**. Tohle je první věc,
kterou má smysl opravit: je to jeden soubor a týká se sedmi obrazovek.

### 2. ⭐🔴 312 z 1 049 tlačítek nemá zaručených 44 px (M)
Změřeno vlastním skriptem nad stejným parserem, jaký používá
`zkontroluj-tlacitka.mjs` (čte značku znak po znaku, aby ho nerozbila tlustá
šipka v `onClick`). Za rizikové se počítá tlačítko, které nemá `.btn*`,
`.tap`, `nav-tab` ani `min-h`, a má `py-0` až `py-1.5`. Kde jich je nejvíc:

| Obrazovka | Kolik |
| --- | --- |
| Stáčení lahví | 24 |
| Stáčení KEG | 22 |
| Objednávky | 20 |
| Závoz | 13 |
| Sklo & etikety | 11 |

Tedy přesně tam, kde se do telefonu ťuká mokrýma rukama. Lék existuje a je
levný: třída `.tap` (přidá 6 px neviditelného okraje na každou stranu, layout
nechá být) — **v celé appce je použitá 15×**.

### 3. ⭐🟠 Sedm míst kreslí na telefonu tabulku bez mobilní varianty (M)
Aplikace umí správný vzor — karty na mobilu, tabulka na počítači
(`grid md:hidden` + `hidden md:block`), Kniha jízd i Historie ho mají. Ale
tady chybí: **Sklo & etikety (3 tabulky), Uživatelé (2), Diagnostika (2),
`BottlingPlanPlanner`, `OrderAuditModal`, `StatistikaVystav`,
`WeeklyOrderSummaryCard`** — dohromady 12 tabulek, které se na 390px displeji
čtou posouváním do stran.

### 4. ⭐🟠 Dvě tabulky jsou širší než dvě obrazovky telefonu (S)
`InventoryScreen.tsx:2501` má `min-w-[900px]`, `BottlingPlanPlanner.tsx:460`
`min-w-[920px]`. Na 390 px to jsou 2,4 obrazovky vodorovného rolování — a to
u inventury, která se dělá ve skladu s telefonem v ruce.

### 5. ⭐🟠 Kde je tabulek víc, mobilní verzi má jen jedna (M)
Sklad, Exkurze a Diagnostika mají po třech tabulkách a mobilní kartu jen
u jedné z nich; Inventura dvě ze tří. Zbylé se překlopí do vodorovného
rolování bez varování.

### 6. ⭐🟠 Třináct modálů neumí tlačítko Zpět (M)
Tohle není vzhled, ale ovládání: společný `<Modal>` (`ui.tsx`) si při
otevření přidá krok do historie, takže **hardwarové Zpět na Androidu modál
zavře**. Třináct souborů si ale kreslí `fixed inset-0` samo
(`OrderAuditModal`, `WhatsAppOrderReviewModal`, `ImportFromImage`,
`PohybyModal`, `FotkyZaznamu`, `Calendar`, `History`…) — a tam Zpět odejde
z celé obrazovky i s rozepsanou prací.

### 7. 🟠 Ikonová tlačítka nemají na telefonu žádný popis (M)
`title="…"` 323×, `aria-label` 51×. `title` se na dotyku nezobrazí nikdy, tedy
šest ikon vedle sebe na kartě objednávky je pro nového člověka hádanka.

### 8. 🟠 48 přilepených prvků, tři počítají se systémovou lištou (S)
`fixed` v `className` 48×, `.pb-safe` 3×. Na telefonech s gesty se spodní
lišty a plovoucí tlačítka dostávají pod systémový pruh.

### 9. 🟠 Při vodorovném rolování uteče sloupec s názvem (M)
`.table thead th` má `sticky top-0`, první buňka `sticky left-0` ne. V Závozu
a ve Skladu se pak čtou čísla, u kterých není vidět, čí jsou.

### 10. 🟢 Tabulky nemají zebru (S)
`odd:`/`even:`/`nth-child` **0×** v celé aplikaci. U dvaceti řádků se snadno
čte o řádek vedle — a to se zapíše do skladu.

### 11. 🟢 Hustota zobrazení nemění to, co zabírá místo (S)
`html.density-*` (čtyři stupně) sahá na `.input`, `select`, `.btn` a `.chip`.
Nesahá na dlaždice plochy, karty ani řádky tabulek, tedy na to, co určuje,
kolik se toho na obrazovku vejde.

### 12. ❌ ~~Tři číselná pole vytáhnou písmenkovou klávesnici~~ — MŮJ OMYL
Měřil jsem to greppem s `-A2`, jenže značka `<input>` pokračuje dál a
`onWheel={(e) => …}` obsahuje `>` z tlusté šipky, takže se čtení zastavilo
před `inputMode`. Přeměřeno značkovým parserem: **0 polí bez `inputMode`**.
Je to přesně ta past, před kterou varuje komentář v
`scripts/zkontroluj-tlacitka.mjs`.

---

## 2. Jednotnost

### 13. ⭐🔴 105 barev je napsaných natvrdo mimo systém (M)
`#[0-9a-f]{6}` je ve **31 souborech, 105×** (nejčastěji `#fef3c7` 9×,
`#a8a29e` 6×, `#0f172a` 6×), k tomu **103× `style={{…}}`**. Tyhle barvy
**se v tmavém režimu nezmění** — celá appka stojí na proměnných, které se
otáčejí, a tohle je obchází. A co je horší: `zkontroluj-kontrast.mjs` je
nevidí, protože čte třídy; sám to o sobě v hlavičce píše („co skript NEUMÍ").
Takže „kontrast prochází" dnes platí o všem kromě těchhle 105 míst.

### 14. ⭐🟠 Aktivní záložka se barví hexem odjinud (S)
`TabBar.tsx` má výchozí `#57534e` a odznak `rgba(120,113,108,0.14)`; barvu
aktivní záložky si předává každá obrazovka zvlášť jako hex. Je to konkrétní
případ bodu 13 na nejviditelnějším místě appky — a v tmavém režimu z toho
vyjde šedá na šedé.

### 15. ⭐🟠 Nadpis obrazovky má osm podob (S)
Napočítáno 38 nadpisů v osmi tvarech: `text-lg font-display font-black` 10×,
`text-xl font-display font-black` 7×, `text-2xl font-black` 6×,
`text-2xl font-display font-black` 5×, `text-lg font-bold` 3×,
`text-lg font-black` 3×, `text-lg font-mono font-black` 2×… Jedna komponenta
`HlavickaStranky` (titul + podtitul + akce vpravo) to sjednotí a ušetří místo
na telefonu.

### 16. 🟠 872× natvrdo napsaných 11 px (M)
`text-[11px]` 872×, `text-xs` 1 589×. Velikost, kterou Tailwind nezná, takže
ji nejde zvětšit z jednoho místa — a „velké písmo do sklepa" tím pádem nejde
udělat vůbec.

### 17. 🟠 Dvanáct velikostí ikon (S)
16 px 208×, 14 px 180×, 18 px 105×, 13 px 95×, 15 px 88×, 20 px 70×, 12 px 46×,
11 px 21×, 22 px 16×, 10 px 16×, 17 px 7×, 32 px 5×.

### 18. 🟠 551 z 1 047 tlačítek si maluje barvu samo (L)
Systém rolí existuje, dluh se nezvětšuje — ale ani nezmenšuje.

### 19. 🟠 Pět stavů objednávky má jednu barvu a čtyři stejný popisek (S)
`Orders.tsx:66`: `expedovana`, `vyrizeno_zavoz`, `vyrizeno`, `vyrizena`,
`hotova` → všechny `bg-emerald-50 text-emerald-700`, popisky „Expedovaná",
„Zavezeno", „Vyřízeno", „Vyřízeno", „Vyřízeno". Ze seznamu nepoznáš naloženo
od odbaveného.

### 20. 🟠 Dvanáct hladin z-indexu, tři z nich vymyšlené za běhu (S)
`z-50` 25×, `z-10` 22×, `z-20` 19×, `z-[999]` 5×, `z-[9999]` 4×, `z-[99999]` 3×,
`z-[110]` 2×. Eskalace čísel je stopa po tom, jak se překrývání řešilo, když
se něco schovalo pod něco jiného.

### 21. 🟢 215 různých ikon bez slovníku (M)
Unikátních ikon z `lucide-react` je **215** ve 103 souborech. Velikost je
v pořádku (~450 B na ikonu, tree-shaking funguje) — problém je významový: při
215 ikonách skoro jistě znamená totéž na dvou obrazovkách jiný obrázek. Test
`jednotneIkony.test.ts` hlídá zatím jedinou dvojici.

### 22. 🟢 Čísla poskakují v 80 % souborů (S)
`tabular-nums` je ve 21 souborech ze 123.

---

## 3. Funkčnost

### 23. ⭐🔴 „Vrátit zpět" umí smazat cizí zápis (S)
Nejzávažnější funkční nález průchodu. Po uložení stáčení nabídne appka
vrácení zpět — a to hledá řádek, který má smazat, **podle hodnot**:

```
Kegging.tsx:665, BottlingScreen.tsx:693
  .eq('entry_date', p.entry_date).eq('beer_id', …).eq('package_id', …)
  .eq('quantity', p.quantity).order('created_at', desc).limit(1)
```

Když ten den stočí dva lidé stejné pivo ve stejném obalu ve stejném počtu
(u desítky v 50l KEGu úplně běžné), vrácení smaže **ten novější, tedy cizí**.
U KEGů se k tomu vrátí objem do tanku, ze kterého se nebral.

Příčina i lék jsou na jednom řádku výš: `insert(payloads)` se volá **bez
`.select()`**, takže se zahodí id právě vložených řádků. `insert(payloads)
.select('id')` a mazat podle id — navíc to zruší dva dotazy na každý řádek.

### 24. ⭐🟠 57 zápisů zahazuje id vloženého řádku (M)
Stejný vzor jinde: `.insert(` bez `.select(` je v obrazovkách a komponentách
**57×**, s `.select(` jen 9×. Pokaždé, když se pak s tím řádkem potřebuje
něco udělat, se musí dohledávat — a dohledávání podle hodnot je bod 23.

### 25. ⭐🟠 Chybová varianta prázdné obrazovky se nepoužívá nikde (S)
`EmptyState` dostal ve v2.273 rozlišení „prázdno vs. chyba" (`varianta="chyba"`
+ tlačítko „Zkusit znovu"). Změřeno dnes: **`<EmptyState` 39×,
`varianta="chyba"` 0×.** Mechanismus je hotový a nenasazený, takže „nemáš
objednávky" a „nepodařilo se je načíst" pořád vypadají stejně. Osm obrazovek
si přitom chybu do stavu ukládá (`setErr`) — je z čeho vycházet.

### 26. 🟠 Grafy neumí tmavý režim (M)
`StatistikaVystav.tsx` má natvrdo `#fff` a pevné barvy mřížky a písma.

### 27. 🟠 Osm migrací pořád čeká na spuštění (S, ale musí je pustit majitel)
Dokud se nepustí `docs/spustit-vsechny-migrace.sql`, tváří se hotové funkce
(fotky u záznamů, push odběry) jako funkční a nejsou.

### 28. 🟠 Push čeká na jeden klíč (S, taky na majiteli)
Kód hotový, chybí soukromý VAPID klíč v secrets Supabase.

### 29. ❌ ~~Changelog je prázdná schránka~~ — MŮJ DRUHÝ OMYL
`lib/changelog.ts` má přes 50 kB záznamů. Usoudil jsem to z toho, že soubor
existuje, místo abych ho otevřel. Co je pravda: chyběly v něm změny z téhle
dávky — doplněno.

### 30. 🟢 Chyby, které se odchytí, nikam nedojdou (S)
`ErrorBoundary` a globální posluchači hlásí pády do `chyby_aplikace` — to
funguje. Ale **60× `console.error` v `catch` bloku** znamená chybu, kterou
uživatel vidí jako prázdno a v Diagnostice po ní není stopa.

---

## 4. Plynulost (aby to nesekalo)

### 31. ⭐🔴 Otevření Stáčení KEG spustí 17 dotazů do databáze (M)
`Kegging.tsx:322` — jedno otevření obrazovky natáhne `kegging`, `cellar_tanks`,
`beers`, `packages`, `orders`, `order_items`, `inventory`, `fasovani`,
`fasovani_private`, `writeoffs`, `keg_prefuk`, `zavoz_deductions`, `bottling`,
`inventory_adjustments`, `akce`, `kegging_plan_checks`, `bottling_plans`.
Ostatní obrazovky nejsou o moc lepší: Stáčení lahví 16, Objednávky 14,
Inventura 13, Přehled 13.

Objemem to dnes ještě není zlé (177 objednávek, 209 stáčení, 530 položek za
dva měsíce provozu) — **sekání dělá počet zpátečních cest**, ne velikost dat.
Na mobilním připojení ve sklepě je 17 požadavků znát okamžitě. A při
současném tempu (~90 objednávek měsíčně) začne za rok růst i objem.

### 32. ⭐🔴 Když kdokoliv cokoliv uloží, přenačte se všem všechno (L)
`useRealtime` je udělaný dobře (400ms zdržení, správný úklid, komentář
popisuje, jak se předtím z jednoho uložení stalo 225 požadavků). Jenže
reakce na změnu je pořád **celé `load()`**, tedy těch 17 dotazů. A odběry
jsou široké: Stáčení KEG poslouchá 17 tabulek, Stáčení lahví 16, Objednávky
14, Inventura 13, Přehled 13.

Prakticky: člověk u stáčení má otevřený KEG, někdo jiný v kanceláři upraví
objednávku → **telefonu u stáčecí linky se přenačte 17 dotazů** kvůli datům,
která na jeho obrazovce nic nemění. Šest lidí v provozu tohle násobí.
Řešení: měnit řádek z payloadu události (`payload.new`), nebo aspoň přenačíst
jen tu jednu tabulku, které se změna týká.

### 33. 🔴 Každý stahuje 537 kB grafů, i když Statistiku neotevře (S)
`dist/index.html` má `modulepreload` na `vendor-charts` (536,78 kB /
159 kB gzip), protože v tom kusu skončil React. Nejlevnější zrychlení startu,
jaké v projektu je.

### 34. 🔴 Chunk `vendor-react` je prázdný — 0,07 kB (S)
`manualChunks` ve `vite.config.ts:72` React nerozdělil. Zbytek appky je
v `index-*.js` (342 kB), který se mění při každém nasazení, takže se React
stahuje pořád znovu. Jedna oprava s bodem 33.

### 35. ⭐🟠 70× `select('*')` (S)
Včetně širokých tabulek (`kegging`, `keg_prefuk`, `cellar_tanks`,
`bottling_plans`). Ostatní dotazy sloupce vyjmenované mají — vzor v kódu už
je, jen se nedodržuje všude.

### 36. 🟠 Objednávky váží 273 kB (M)
`Orders-*.js` = 273,28 kB / 75,48 kB gzip ze souboru o 3 791 řádcích.

### 37. 🟠 Žádná memoizace, žádná virtualizace (M)
`React.memo` **0×**, virtualizace nikde. `useMemo` je 215× — počítání je
ošetřené, překreslování ne. Při přenačtení podle bodu 32 se překreslí celý
seznam.

### 38. 🟠 Jedenáct obrazovek při načtení zhasne (M)
`if (loading) return <Spinner />` na 11 obrazovkách, kostra (skeleton) **0×**.
Odmountování obsahu shodí odrolování — appka na to má sice kotvu pozice
(`drzPozici.ts`, chytře udělaná), ale ta řeší přenačtení, ne první načtení.

### 39. 🟠 Build hlásí, že dělení kódu na dvou místech neplatí (S)
`offline.ts` a `supabase.ts` jsou importované staticky i dynamicky, takže
sedm `await import('../lib/offline')` v Layoutu nic neušetří.

### 40. 🟢 CSS 188 kB ve dvou systémech (M)
`index.css` 1 068 řádků + `HomeScreen.css` 1 135 řádků / 243 vlastních tříd.

### 41. 🟢 Obrázky se načítají všechny naráz (S)
13× `<img>`, `loading="lazy"` 0×.

---

## 5. Stabilita

### 42. ⭐🔴 Dvanáct obrazovek nezruší načítání, když se odejde (M)
Obrazovek se čtyřmi a více `useEffect` a **nulovým** `cancelled`/`AbortController`
je dvanáct: Stopky, Stáčení KEG, Stáčení lahví, Prodejna, Inventura, Katalogy,
Uživatelé, Historie, Přehled, Sklep, Pivovar, Nastavení.

Co se stane: člověk otevře Inventuru, ta pošle 13 dotazů, on přepne na
Objednávky — a odpovědi se vrátí do komponenty, která už nemá být vidět.
Ve spojení s bodem 32 (přenačtení při každé cizí změně) můžou dvě odpovědi
dorazit i **v opačném pořadí**, takže se novější stav přepíše starším. Tohle
je ta kategorie chyb, které se hlásí jako „ukázalo mi to staré číslo" a
nedají se zopakovat.

### 43. 🟠 Práva v aplikaci nejsou práva v databázi (M)
Z 379 politik RLS jich 159 zní `USING (true)` (a 375 `TO authenticated`, takže
nepřihlášený nikam nemůže). `permissions.ts` hlídá jen to, co je vidět v UI —
kdo má účet, může přes API měnit všechno.

### 44. 🟢 Realtime kanál profilu se odhlašuje, ale nemaže (S)
`auth.tsx:110` volá `channel.unsubscribe()` místo `supabase.removeChannel()`
(ostatní čtyři místa to dělají správně). Při přepínání účtu se kanály hromadí.

### 45. 🟢 39× `key={index}` (S)
V seznamech, které se filtrují nebo přeskládávají, React spáruje řádek se
špatným stavem — hodnota z rozepsaného políčka se objeví u jiného řádku.

### 46. 🟢 379× `any`, 292× `as any` (L)
Nejhustěji tam, kde přichází řádek z databáze — tedy přesně tam, kde by typ
chytil překlep ve jménu sloupce.

### 47. 🔴 Chybí ESLint i Prettier (S)
Na 96 330 řádcích. `react-hooks/exhaustive-deps` by sám našel body 42 a 45.
Nasadit s `--max-warnings` na dnešní stav a dluh utahovat.

### 48. 🟠 Testů je 1 296, ale klikání skoro neumí (M)
100 testových souborů v `lib/`, 14 na komponenty a obrazovky. Logika (sklad,
parser, plány) je pokrytá výborně; UI ne. Nejvíc by vrátily testy tří míst,
kde chyba znamená špatné číslo ve skladu: zápis stáčení, inventura, odbavení
závozu.

### 49. 🟠 Žádné E2E (M)
Chromium je v CI k dispozici a `nahled/mock/supabase.ts` už umí podstrčit
databázi. Tři scénáře (přihlásit se → zapsat stáčení → uvidět to ve skladu)
chytnou to, co jednotkový test nevidí.

### 50. 🟢 Náhled pokrývá dvě stránky ze 41 obrazovek (M)
`nahled/` je nejlepší nástroj na vzhled, který v projektu je — běží bez
databáze, přepíná šířky telefon/tablet/počítač, panel drží v iframe, aby
`sm:` znamenalo pravdu. Umí ale jen týdenní inventuru a srovnání plochy.
Kdyby uměl Objednávky, Sklad a Stáčení, dá se z něj dělat i vizuální
regrese (screenshot + porovnání s minulým) — a body 1–5 by pak nešlo
zanést zpátky.

---

## Kdybych měl vybrat pět, se kterými začít

1. **#23** — „vrátit zpět" mazající cizí zápis. Jediný bod, který dnes může
   tiše pokazit data, a oprava je `.select('id')`.
2. **#1 + #2** — dotykové cíle. TabBar je jeden soubor a sedm obrazovek;
   `.tap` na 312 tlačítek je nudná, ale mechanická práce.
3. **#33 + #34** — jedna oprava `manualChunks` a start appky přestane tahat
   537 kB grafů.
4. **#31 + #32** — 17 dotazů na otevření a celé přenačtení při cizí změně.
   Tohle je vlastní příčina „sekání", zbytek jsou následky.
5. **#13** — 105 barev mimo systém. Bez toho nebude tmavý režim nikdy
   hotový a hlídač kontrastu bude hlásit klid o něčem, co nekontroluje.

Pořadí je podle rizika, ne podle pracnosti: #23 je půl hodiny, #32 je na víc
dní.

---

## Co vypadalo jako problém a není

Kontroloval jsem to a **nepotvrdilo se** — ať se to nedělá zbytečně:

- **Malý výběr počtu v objednávkách** (`QuickQtySelect` má `h-6`). Na mobilu
  ho přebíjí pravidlo v `index.css` (`select { min-h-[44px] }` do 640 px),
  takže cíl je ve skutečnosti v pořádku.
- **Málo `sm:` prefixů na obrazovkách** (Kniha jízd jich má 2 na 992 řádků).
  Vypadá to jako „nepřizpůsobené telefonu", ale je to naopak: ta obrazovka
  přepíná karty/tabulku přes `md:`, a je to udělané správně.
- **Časovače bez úklidu** v `BottlingLineMaintenance` — `setInterval` tam
  nakonec žádný není, grep chytil proměnnou `intervalDays`.
- **Dvojité uložení při dvojkliku** — `Kegging` odemyká tlačítko schválně až
  po dokončení celého zápisu, i s komentářem proč.
- **Souběh při odečtu z tanku** — řeší se RPC `adjust_tank_volume` relativně,
  ne přes React state. Popsané v kódu i s důvodem.
- **Offline zápisy** — fronta je na úrovni `fetch`, takže platí pro každý
  zápis v appce automaticky, ne jen pro ty, kde na to někdo myslel. Včetně
  ošetření plné paměti telefonu.
- **Realtime bouře** — 400ms zdržení už existuje a je zdokumentované; zůstává
  jen ta část, že reakcí je celé přenačtení (bod 32).
- **TODO/FIXME v kódu** — nula.

## Jak se to měřilo

Vše na větvi `claude/app-upload-from-git-vvlvyh`: čtení obrazovek a
komponent, `npm run build` (velikosti chunků, `modulepreload` z
`dist/index.html`), `npx vitest run`, `npx tsc --noEmit`,
`scripts/zkontroluj-*.mjs`, vlastní skript na dotykové cíle nad parserem
z `zkontroluj-tlacitka.mjs`, `grep`/`node` nad `src/`, `supabase/migrations/`
a `zalohy/*.json`.

Bezpečnostní nález z prvního auditu (denní záloha komituje data zákazníků do
veřejného repozitáře) sem nepatří tématem, ale platí dál — viz
`docs/50-vylepseni-podruhe.md`, body 1 a 2.
