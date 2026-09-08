# 50 vylepšení — druhý průchod (5. 9. 2026)

Sepsáno po projití celé aplikace: 96 330 řádků v `src/`, 82 komponent,
41 obrazovek, 127 migrací, produkční build a spuštěné testy.

**Každý bod má u sebe číslo, které jsem dneska naměřil** — příkazem, ne
z hlavy. Poučení z minulých seznamů (osm z 29 bodů popisovalo problém, který
byl dávno vyřešený) beru vážně: co jsem si neověřil, tady není. Naopak jsem
připsal i seznam věcí, které jsem prověřoval a **v pořádku jsou** — ať se
nedělá práce, která už hotová je.

## Výchozí stav — appka je zdravá

Než začneme vylepšovat, ať je řečeno, z čeho se vychází:

```
npx vitest run           1296 testů / 115 souborů — všechny prošly
npx tsc --noEmit         bez chyby
zkontroluj-tridy         všechny třídy mají v CSS pravidlo
zkontroluj-kontrast      všechny dvojice písmo/podklad projdou (světlý i tmavý)
zkontroluj-tlacitka      551 ručně malovaných, dluh se nezvětšil
npm run build            projde, 4,6 MB dist
```

Tohle není běžný stav aplikace téhle velikosti. Body níž jsou dluh
a příležitosti, ne požár — až na kapitolu A, kde jeden požár je.

Značky: 🔴 udělat hned · 🟠 mělo by se · 🟢 až bude čas ·
**S** = do půl dne, **M** = den, **L** = víc dní.

---

## A. Data a bezpečnost

### 1. 🔴 Denní záloha commituje data zákazníků do VEŘEJNÉHO repozitáře (S)
`.github/workflows/zaloha.yml` každý den ve 2:30 stáhne data servisním klíčem
a `git add zalohy/` je commitne sem. Repozitář `janvasilecko-droid/pivovar-zajic`
je **public**. V `zalohy/orders.json` je dneska **177 objednávek, 54 odběratelů**,
u každé `note`, `signature_name` (jméno toho, kdo převzal) a `signature_url`;
v `order_items.json` 195 kB položek, kdo si co a kolik objednal. Celkem 470 kB
provozních dat, veřejně, s denním přírůstkem.

Záloha je dobrý nápad, cíl je špatný. Varianty podle pracnosti:
přepnout repozitář na private (nejrychlejší, ale zveřejněné to už bylo) ·
zálohovat do privátního bucketu v Supabase nebo na Cloudflare R2 ·
nechat ji jako **artefakt běhu Actions** (nekomituje se, drží se 90 dní).

### 2. 🔴 Data zůstanou v historii gitu i po smazání (M)
I když se `zalohy/` smaže, zůstává v každém starším commitu. Pokud se jede
podle bodu 1, patří k tomu i přepsání historie (`git filter-repo`) nebo nový
repozitář — a rotace `SUPABASE_SERVICE_ROLE_KEY`, který ten workflow používá.
Rozhodnutí je na majiteli, tohle si programátor sám dělat nemá.

### 3. 🟠 Práva v aplikaci nejsou práva v databázi (M)
Z 379 politik RLS jich **159 zní `USING (true)`** (a 375 z nich `TO authenticated`,
takže nepřihlášený se nedostane nikam — to je v pořádku). Znamená to: kdo má
jakýkoliv účet, může přes API číst i měnit všechno. `lib/permissions.ts` a
předvolby rolí hlídají jenom to, co uvidí v UI. U šesti lidí, kteří se znají,
to není drama — ale „řidič" má dnes technicky právo smazat sklad. Aspoň
u `stock_ledger`, `orders` a sanitačních deníků dát politiky podle role
z `profiles`.

### 4. 🟠 Chyby, které se odchytí, se nikam nehlásí (S)
`zapniHlaseniChyb()` v `main.tsx` poslouchá `error` a `unhandledrejection`
a `ErrorBoundary` hlásí pády — to funguje. Jenže v kódu je **60×
`console.error` v `catch` bloku**: tam se chyba spolkne, uživatel vidí prázdno
a v tabulce `chyby_aplikace` po ní není stopa. Zavést `nahlasChybu('catch', e)`
vedle logu (klidně přes malou pomocnou funkci) a mít v Diagnostice pravdu.

### 5. 🟢 Realtime kanál profilu se odhlašuje, ale nemaže (S)
`lib/auth.tsx:110` volá `channel.unsubscribe()`. Supabase-js kanál odhlásí,
ale nechá ho v seznamu klienta — na rozdíl od `supabase.removeChannel(channel)`,
který se používá na ostatních čtyřech místech. Při přepínání účtu se kanály
hromadí. Jeden řádek.

### 6. 🟢 Typová síť má díry právě v datové vrstvě (L)
**379× `: any`** a **292× `as any`**. Nejhustěji tam, kde přichází řádek
z databáze — tedy přesně tam, kde by typ chytil překlep ve jménu sloupce.
Vygenerovat typy ze Supabase (`supabase gen types typescript`) a nasazovat je
po jedné tabulce, ne naráz.

---

## B. Výkon a build

### 7. 🔴 Každý stahuje 537 kB grafů, i když Statistiku nikdy neotevře (S)
Změřeno na produkčním buildu. V `dist/index.html` je
`<link rel="modulepreload" href="/assets/vendor-charts-*.js">` — tedy
**536,78 kB (159 kB gzip) se stahuje hned při startu**. Důvod: v tom kusu
skončil React (`createRoot` i „Minified React error" jsou uvnitř), takže bez
něj se appka nespustí a preload je správně — špatně je, že tam React je.

### 8. 🔴 Chunk `vendor-react` je prázdný — 0,07 kB (S)
Jeho celý obsah je `import"./vendor-charts.js";import"./vendor-icons.js";`.
`manualChunks` ve `vite.config.ts:72` tedy React nikam nerozdělil; sedí
v `vendor-charts` a zbytek appky v `index-*.js` (342 kB / 104 gzip), který se
mění při každém nasazení. Záměr komentáře nad `vendor-charts` („stáhnou se
jednou a zůstanou v mezipaměti") dnes neplatí ani pro React, ani pro grafy.
Oprava je funkční tvar `manualChunks(id)` s explicitním `node_modules/react`
→ `vendor-react` a kontrola, že recharts skončí sám. **Body 7 a 8 jsou jedna
oprava a je to nejlevnější zrychlení startu, které v appce je.**

### 9. 🟠 Objednávky váží 273 kB (M)
`Orders-*.js` = 273,28 kB / 75,48 kB gzip, ze souboru o **3 791 řádcích**.
Další v pořadí: Inventura 130 kB, Lahvování 108 kB, Statistika 99 kB.
Rozdělit Objednávky na seznam / detail / hromadné akce a modály nechat
dotáhnout `lazy()` (základ pro to už v `Layout.tsx` je).

### 10. 🟠 Build hlásí, že dělení kódu na dvou místech neplatí (S)
Doslova: „`src/lib/offline.ts` is dynamically imported by Layout.tsx … but
also statically imported by `src/lib/supabase.ts`, `HomeScreen.tsx`, dynamic
import will not move module into another chunk." Totéž pro `supabase.ts`.
Sedm `await import('../lib/offline')` v Layoutu tedy nic neušetří. Buď
staticky, nebo dynamicky — ne obojí.

### 11. 🟠 Dlouhé seznamy se kreslí celé a bez memoizace (M)
V aplikaci je **0× `React.memo`** a žádná virtualizace. Objednávky, Historie
a Inventura kreslí všechny řádky a při každém překreslení rodiče i všechny
potomky. `useMemo` je 215× — počítání je ošetřené, kreslení ne. Na starším
telefonu ve sklepě je tohle ten „zásek při psaní do políčka".

### 12. 🟢 CSS má 188 kB a bydlí ve dvou systémech (M)
`index-*.css` = 187,89 kB (28,5 gzip). Zdroje: `src/index.css` 1 068 řádků
a `src/screens/HomeScreen.css` **1 135 řádků s 243 vlastními třídami**, které
Tailwind nezná a `zkontroluj-tridy.mjs` je kontroluje zvlášť. Plochu jde
postupně převést na utility, nebo aspoň ty třídy pojmenovat systémově.

### 13. 🟢 Obrázky se načítají všechny naráz (S)
13× `<img>`, z toho **0× `loading="lazy"`** a 0× `decoding="async"`. U fotek
záznamů (odpisy, objednávky) to na mobilních datech znamená, že se stáhne
i to, co nikdo neodroloval.

---

## C. Vzhled a jednotnost

Body 14–19 jsou z „20 grafických vylepšení" (4. 9.) a **pořád platí** —
přeměřeno dneska, ať se neopisuje starý stav.

### 14. 🟠 872× natvrdo napsaných 11 px (M)
`text-[11px]` 872× (před dvěma dny 882), `text-xs` 1 589×, `text-[12px]` 2×.
Dvě nejčastější velikosti v appce jsou 12 px a hodnota, kterou Tailwind nezná,
takže se nedá zvětšit jedním místem. Pět rolí (`text-udaj`, `text-popisek`,
`text-text`, `text-podtitul`, `text-titul`) a 11 px mít jednou.

### 15. 🟠 Ikony mají dvanáct velikostí (S)
`size={16}` 208×, `14` 180×, `18` 105×, `13` 95×, `15` 88×, `20` 70×, `12` 46×,
`11` 21×, `22` 16×, `10` 16×, `17` 7×, `32` 5×. Rozdíl mezi 13, 14 a 15 px
nikdo nezvolil — vznikl podle toho, kdo psal. Tři velikosti stačí.

### 16. 🟠 Čísla poskakují v 80 % souborů (S)
`tabular-nums` je ve 21 souborech ze 123. Kde není, tam má „1" jinou šířku než
„8" a sloupec kusů se při každém přepočtu posune. Patří to do `.table tbody td`
(tam už je) a na každou dlaždici s číslem.

### 17. 🟠 551 tlačítek si maluje barvu samo (L)
Z 1 047 tlačítek. Systém `.btn-*` existuje a od minula se dluh nezvětšil, ale
ani nezmenšil. Nejrychlejší dopad má převést tlačítka na kartě objednávky a
v Inventuře — tam jich je nejvíc vedle sebe.

### 18. 🟠 Pět stavů objednávky má jednu barvu a čtyři z nich stejný popisek (S)
`Orders.tsx:66` — `expedovana`, `vyrizeno_zavoz`, `vyrizeno`, `vyrizena`,
`hotova` mají všechny `bg-emerald-50 text-emerald-700`, a popisky jsou
„Expedovaná", „Zavezeno", „Vyřízeno", „Vyřízeno", „Vyřízeno". Na seznamu se
tedy nedá odlišit, co je naloženo a co odbaveno. Odstupňovat barvu (světlá →
sytá → tmavá) a přidat tvar (tečka / fajfka / dvojfajfka).

### 19. 🟢 Pulzuje 41 míst (S)
`animate-pulse` 41×, od dojezdu tanku po dekoraci. Když bliká všechno,
neznamená blikání nic.

### 20. 🟠 Jedenáct obrazovek při načtení zhasne (M)
`if (loading) return <Spinner />` na 11 obrazovkách a **0 kostrových (skeleton)
komponent** v celé appce. Odmountování obsahu shodí odrolování — je to ta
stížnost „když kliknu odečíst, vrací mě to nahoru". Kostra v rozměrech obsahu.

### 21. 🟠 Grafy neumí tmavý režim (M)
`StatistikaVystav.tsx` má natvrdo `#fff` (2×) plus pevné barvy mřížky a písma.
V tmavém režimu jsou to bílé linky v černém grafu. Barvy vzít z proměnných,
na kterých stojí celý `tailwind.config.js`.

### 22. 🟠 Dvanáct hladin z-indexu, z toho tři vymyšlené (S)
`z-50` 25×, `z-10` 22×, `z-20` 19×, `z-[999]` 5×, `z-[9999]` 4×, `z-[99999]` 3×,
`z-[110]` 2×, `z-40`, `z-30`. Eskalace čísel je stopa po tom, jak se
překrývání řešilo za běhu. Čtyři pojmenované hladiny (obsah, lišta, modál,
toast) v `tailwind.config.js` a hotovo.

### 23. 🟠 Třináct vlastních modálů mimo společnou komponentu (M)
`<Modal>` z `ui.tsx` se používá 45×, ale 13 souborů si kreslí
`fixed inset-0 z-…` samo (`OrderAuditModal`, `WhatsAppOrderReviewModal`,
`ImportFromImage`, `PohybyModal`, `FotkyZaznamu`, `Calendar`, `History` …).
Každý má jinou hlavičku, jiné zaoblení a jiné chování tlačítka Zpět — a to
poslední je funkční rozdíl, ne kosmetika: společný `Modal` umí zavření
hardwarovým Zpět, ty vlastní ne.

---

## D. Přístupnost a ovladatelnost

### 24. 🟠 Modál se neumí ohlásit ani udržet fokus (S)
`ui.tsx` `Modal` nemá `role="dialog"`, `aria-modal`, nefokusuje první prvek a
nedrží fokus uvnitř (`aria-modal` je v celé appce 6×, focus trap **0×**).
Escape a Zpět fungují, zbytek chybí. Na počítači v kanceláři to znamená, že
tabulátor uteče za modál do stránky pod ním.

### 25. 🟠 304 hlaviček tabulek bez `scope` (S)
`<th>` 304×, `scope="col"` **0×**. Jeden atribut na komponentu tabulky.

### 26. 🟠 Význam tlačítek nese `title`, který na telefonu není vidět (M)
`title="…"` 323×, `aria-label` 51×, `role="…"` 6×. Na dotyku se `title`
nezobrazí nikdy — ikonová tlačítka (`.btn-ikona`, šest akcí na kartě
objednávky) tedy pro nového člověka nemají popis žádný. Doplnit `aria-label`
všude, kde je tlačítko jen ikona.

### 27. 🟢 Animace se nedají vypnout (S)
`prefers-reduced-motion` je v `index.css` **1×** (v `HomeScreen.css` 6×), při
41 pulzech a šesti klíčových animacích. Jeden blok na konci `index.css`.

### 28. 🟢 39× `key={index}` (S)
V seznamech, které se dají přeskládat nebo filtrovat, to znamená, že React
spáruje řádek se špatným stavem — u rozepsaného políčka se hodnota přesune
jinam. Použít `id` řádku.

---

## E. Mobil a ovládání

### 29. 🟠 48 přilepených prvků, tři z nich počítají se systémovou lištou (S)
`fixed` v `className` 48×, `.pb-safe` použité 3×. Na telefonech s gesty se
plovoucí tlačítka a spodní lišty dostávají pod systémový pruh.

### 30. 🟠 Hlavička tabulky drží, první sloupec ne (M)
`.table thead th` má `sticky top-0` — dobře. Při vodorovném rolování (Závoz,
Sklad) ale uteče sloupec s odběratelem, takže se čtou čísla bez toho, čí jsou.
`sticky left-0` na první buňku.

### 31. 🟢 Hustota zobrazení nemíří na to, co zabírá místo (S)
`html.density-*` (čtyři stupně) mění `.input`, `select`, `.btn` a `.chip`.
Nemění dlaždice plochy, karty ani řádky tabulek — přitom právě ty rozhodují,
kolik toho na obrazovku padne. Rozšířit pravidla, žádná nová logika.

### 32. 🟢 Tabulky nemají zebru (S)
`odd:bg-*` / `even:bg-*` / `nth-child` — **0×** v celé aplikaci. U dvaceti
řádků závozu se čte snadno o řádek vedle, a to se pak zapíše do skladu.

### 33. 🟢 Hledání běží při každém písmenu (S)
`debounce` je v kódu 5×. Filtry v Objednávkách a Historii přepočítávají
seznam nad tisíci řádky při každé klávese.

### 34. 🟢 Tři číselná pole bez číselné klávesnice (S)
`type="number"` 74×, z toho 71 má `inputMode`. Tři zbývající vytáhnou na
telefonu písmenkovou klávesnici.

---

## F. Kód a architektura

### 35. 🟠 Šest obrazovek = 20 % kódu (L)
Orders 3 791, HomeScreen 2 916, Inventory 2 871, Bottling 2 231, Kegging 2 210,
History 2 092 → **16 111 řádků z 79 956** (bez testů). Dělit až při další
úpravě té které obrazovky, ne plošně — plošné dělení je riziko bez užitku.

### 36. 🟠 `Layout.tsx` dělá pět věcí najednou (M)
1 076 řádků: navigace, dvě realtime předplatná, offline fronta, lišta „nová
verze", lazy modály. Vytáhnout realtime a frontu do vlastních hooků.

### 37. 🟠 Dotazy do databáze jsou rozeseté po komponentách (L)
`.from('…')` **367×**, z toho 121 `.select(` přímo v `.tsx`. `fetchAllRows`
se používá 200× — dobře — ale zbytek je ruční. Postupně přesouvat do `lib/`,
kde se to dá otestovat (a kde už polovina appky je).

### 38. 🟢 74× vlastní formátování data (S)
`toLocaleDateString` 74×, každé s trochu jinými parametry. `lib/cisla.ts` je
předloha, jak to udělat jednou.

### 39. 🟢 Ve `scripts/` je 70 souborů, půlka jednorázových (S)
`check_bottling.mjs`, `check_bottling2.mjs`, `check_bottling3.mjs`,
`fix_stock.mjs`, `fix_stock2.mjs`, `diag_august.mjs`, `diag_endstock.mjs`…
Jsou to diagnostiky z jednoho konkrétního večera. Přesunout do
`scripts/archiv/` nebo smazat — dnes se v tom nedá najít to, co se používá.

### 40. 🟢 V kořeni leží `scratch_srot.cjs` (S)
Plus `build-apk.bat`, `deploy-pwa.bat`, `watch-deploy.bat`, `powershell.cmd`.
Souborů v kořeni je 24 a první dojem z repozitáře dělají právě ony.

### 41. 🟢 Náhled pokrývá dvě stránky ze 41 obrazovek (M)
`nahled/` je nejlepší nástroj, který v projektu na grafiku je (běží bez
databáze, přepíná šířky, iframe kvůli `sm:`). Umí ale jen týdenní inventuru a
srovnání plochy. Přidat obrazovku = pár řádků; přidat Objednávky, Sklad a
Kegging by z něj udělalo místo, kde se vzhled ladí celý.

### 42. 🟢 Aplikace používá 215 různých ikon (M)
Napočítáno z importů: **215 unikátních ikon** z `lucide-react` ve 103
souborech (k tomu vlastní `IkonaSud` a `IkonaLahev`). Velikost je v pořádku —
`vendor-icons` má 96,5 kB (21,5 gzip), tedy ~450 B na ikonu, tree-shaking
funguje. Problém je významový: při 215 ikonách skoro jistě znamená totéž na
dvou obrazovkách jiný obrázek. Test `jednotneIkony.test.ts` hlídá zatím
jedinou dvojici (`Cylinder` → `IkonaSud`). Sepsat slovník „význam → ikona"
pro dvacet nejčastějších pojmů (uložit, smazat, upravit, sud, lahev, tank,
závoz…) a rozšířit o ně ten test.

---

## G. Testy, CI a nástroje

### 43. 🔴 Projekt nemá ESLint ani Prettier (S)
V `package.json` není ani jedno, v kořeni žádný `.eslintrc`/`eslint.config.js`.
Na 96 tisících řádcích. `react-hooks/exhaustive-deps` by přitom sám našel
třídu chyb, které se dnes hledají rukama (a v kódu je nejmíň jedna
`eslint-disable` poznámka na pravidlo, které nikdo nespouští). Nasadit
s `--max-warnings` na dnešní stav, ať CI nezčervená, a dluh utahovat.

### 44. 🟠 Testů je 1 296, ale UI skoro neumí (M)
100 testových souborů v `lib/`, **14 na komponenty a obrazovky**. Logika
(sklad, parser, plány) je pokrytá výborně; klikání ne. Nejvíc by vrátily testy
na tři místa, kde chyba znamená špatné číslo ve skladu: zápis stáčení,
inventura, odbavení závozu.

### 45. 🟠 Žádné E2E (M)
`playwright`/`cypress` nikde. Přitom Chromium je v CI k dispozici a
`nahled/mock/supabase.ts` už umí podstrčit databázi. Tři scénáře (přihlásit se
→ zapsat stáčení → uvidět to ve skladu) chytí regrese, které jednotkový test
nevidí.

### 46. 🟢 Vizuální regrese chybí (M)
Na projektu, kde se ladí grafika, je to ten hlídač, co dává největší smysl:
screenshot každé obrazovky ve třech šířkách + porovnání s minulým. Náhledová
stránka pro to má všechno připravené.

### 47. 🟢 CI nehlídá velikost balíčku (S)
`deploy.yml` pouští testy, čtyři vlastní kontroly a build — ale nikdo neřekne,
když chunk povyroste o 200 kB (viz body 7–9, které takhle vznikly). Přidat
prahovou kontrolu na `dist/assets/*.js`.

---

## H. Provoz

### 48. 🟠 Osm migrací pořád čeká na spuštění (S — ale musí ji udělat majitel)
Stav z `docs/29-vylepseni.md` platí dál: dokud se `docs/spustit-vsechny-migrace.sql`
nepustí v Supabase, příslušné funkce v appce jen napíšou, co chybí. Týká se
i fotek záznamů a push odběrů, tedy věcí, které se tváří jako hotové.

### 49. 🟠 Push čeká na jeden klíč (S — taky na majiteli)
Kód (odběr, service worker, funkce `posli-push`) je hotový, chybí soukromý
VAPID klíč v secrets Supabase. Postup je v `docs/push-upozorneni-navod.md`.
Bez něj neodejde ani „přišla objednávka", ani denní shrnutí.

### 50. 🟢 Verze appky se hlídá, ale ne to, co se s ní nasadilo (S)
`bump-version-ci.mjs` čísla zvyšuje a test hlídá, že `version.ts` a
`version.json` souhlasí — to je vyřešené. Co chybí, je changelog toho, co
v které verzi přibylo (`lib/changelog.ts` existuje a je prázdná schránka);
uživatel po aktualizaci nevidí, co se změnilo, a při hlášení chyby se nedá
zpětně říct, co se ten den nasadilo.

---

## Kdybych měl vybrat pět

1. **#1 + #2** — data zákazníků ve veřejném repu. Jediný bod, který nesnese
   odklad, a jediný, kde rozhoduje majitel, ne programátor.
2. **#7 + #8** — jedna oprava `manualChunks`, po které přestane každý start
   appky stahovat 537 kB grafů. Nejlevnější zrychlení v projektu.
3. **#43** — ESLint. Půl dne a příští chyba tohoto druhu se najde sama.
4. **#20 + #11** — kostra místo spinneru a memoizace seznamů. Tohle je ta
   dvojice, kterou lidi v provozu popisují jako „seká to a vrací mě to nahoru".
5. **#18 + #26** — pět stavů jedna barva a ikonová tlačítka bez popisu. Dvě
   nejlevnější místa, kde appka dnes mlčí o tom, co znamená.

---

## Co jsem prověřoval a je to v pořádku

Ať se nedělá práce, která hotová je:

- **Kontrast** — `zkontroluj-kontrast.mjs` projde na všech dvojicích, ve
  světlém i tmavém režimu. Nula nezměřitelných.
- **Tmavý režim** jako mechanismus — proměnné v `index.css`, tři role
  (povrch / výplň / písmo) v `tailwind.config.js`. Drží. Nedodělané jsou jen
  grafy (bod 21).
- **Hlášení pádů** — `ErrorBoundary` + `window.error` + `unhandledrejection`
  → tabulka `chyby_aplikace` → Diagnostika. Funguje; chybí jen odchycené
  chyby (bod 4).
- **Verze na dvou místech** — hlídá test v `pravidlaObrazovek.test.ts`,
  zvyšuje CI. Vyřešeno.
- **`.env.example`** — samé zástupné hodnoty (`xxxx`), žádný skutečný klíč.
- **RLS pro nepřihlášené** — 375 z 379 politik je `TO authenticated`,
  anonymní přístup nikde.
- **Offline** — fronta zápisů, banner „zastaralá data", vlastní písma
  v precache service workeru, `overscroll-behavior` proti pull-to-refresh.
  Promyšlené.
- **`fetchAllRows`** — 200 použití, past s tisícem řádků je ošetřená.
- **Dělení kódu** — `lazy()` na obrazovkách i těžkých modálech, `xlsx` (628 kB)
  se stahuje až při exportu. Až na body 7–10 je to udělané dobře.
- **Nativní dialogy** — `window.confirm` 2×, `alert` 1×. Zbytek jde přes
  vlastní komponenty.
- **`type="number"`** — 71 ze 74 polí má `inputMode` (bod 34 je o třech
  zbylých).

---

## Jak se to měřilo

Vše na commitu `e323b6e`, větev `claude/app-upload-from-git-vvlvyh`:
`npx vitest run` · `npx tsc --noEmit` · `npm run build` (velikosti chunků
z jeho výpisu, preload z `dist/index.html`) · `node scripts/zkontroluj-*.mjs` ·
`grep -r` na počty tříd, atributů a volání · `node -e` nad `zalohy/*.json`.
Náhledová stránka běžela na `vite --config vite.nahled.config.ts`.
