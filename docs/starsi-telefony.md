# Starší telefony s Androidem — podlaha prohlížeče

Šéfovi nešla aplikace na starším telefonu s Androidem (25. 11. 2026). Starý WebView po sobě nenechá žádnou
stopu v databázi chyb (`app_errors`) — rozbije se dřív, než se rozběhne kód, který chyby hlásí — takže se příčina
nedala přečíst z provozu. Tenhle dokument je zápis toho, co se **změřilo**, co se **opravilo** a co **zůstává**.

Souvislosti v kódu: `src/lib/podlahaProhlizece.ts` (čísla), `index.html` (záplaty + záchranná obrazovka),
`public/diagnostika.html` (diagnostika telefonu), `public/instalace.html` (instalace aplikace), `public/_redirects`
(krátký odkaz `/apk`), `public/sw.js` (stránka „Bez připojení“), `src/lib/zarizeni.ts` (jak se aplikace používá),
`scripts/postcss-starsi-prohlizece.mjs`, `scripts/zkontroluj-css-podlaha.mjs`, `capacitor.config.json`.

## Odkaz pro majitele

Šéf otevře v telefonu **<https://zajic-pivovar.pages.dev/diagnostika.html>**. Stránka zjistí, co telefonu chybí,
řekne česky co s tím a nabídne tlačítko „Zkopírovat zprávu“ (nebo rovnou „Poslat přes WhatsApp“). Nic se neodesílá
samo; zpráva obsahuje jen údaje o telefonu a prohlížeči.

Když telefonu **nejde ikona** (z e-mailu se aplikace v prohlížeči otevře, ale po „Přidat na plochu“ se z ikony nespustí),
pošli mu **<https://zajic-pivovar.pages.dev/instalace>**. Stránka pozná telefon a ukáže jediný postup, který na něm funguje:
na Androidu 7 a novějším **stažení aplikace** (APK, vlastní ikona, na prohlížeči nezávisí), na starším Androidu ikonu nebo
záložku z Chromu, na iPhonu Safari, v počítači Chrome / Edge, a když je odkaz otevřený uvnitř jiné aplikace (e-mail,
Messenger), řekne, ať ho nejdřív otevře v prohlížeči. Krátký odkaz na samotné APK je **<https://zajic-pivovar.pages.dev/apk>**.

## Co se změřilo

Z hotového sestavení (`dist/`), nástroji es-check, doiuse a údaji MDN o podpoře funkcí:

| Co | Zjištění |
|---|---|
| Syntaxe JS | ES2015 + dynamický `import()` (`build.target = 'es2015'`). Nejstarší Chrome, který ji rozebere, je **64** (regulární výraz s `\p{L}` v Objednávkách). |
| Moduly, dynamický import | Chrome 61 / 63. |
| `AbortController` | **Chrome 66** — supabase-js ho volá při dotazech s časovým limitem. Od toho je **podlaha 66**. |
| `crypto.randomUUID()` | **Chrome 92.** Kód ho volá na **23 místech**, z toho **bez zálohy ve frontě offline zápisů (`offline.ts`) a v `supabase.ts` při zápisu bez id**. Na starším WebView appka naběhne, ale **uložení tiše selže**. |
| Další funkce bez zálohy | `Element.replaceChildren` (86), `Object.fromEntries` a `String.matchAll` (73), `Array.flat` a `flatMap` (69), `globalThis` a `queueMicrotask` (71), `Object.hasOwn` (93, grafy ve Statistice). |
| CSS: tmavý režim | Tailwind píše každé `dark:` jako `…:is(.dark *)`; `:is()` umí Chrome 88. Starší prohlížeč pravidlo zahodí celé → 44 tříd `dark:` vypadne. |
| CSS: `inset` | `fixed inset-0` (podklad oken) = `inset: 0` od Chromu 87; níž ztratí rozměr. |
| CSS: `dvh` | `max-h-[calc(100dvh-1rem)]` (Chrome 108): bez zálohy vypadne `max-height` a vysoké okno přeteče za displej. |
| APK | `minSdkVersion = 24` (Android 7). Capacitor na příliš starém WebView jen zapíše do logu a načte web stejně → bílá obrazovka. Android 6 a starší APK nenainstaluje vůbec. |
| APK a podpis | APK je podepsané ladicím klíčem, který si každý běh CI vyrobí znovu → novou verzi nejde nainstalovat přes starší (nejdřív odinstalovat). Web se aktualizuje sám, takže APK se běžně nepřeinstalovává. |

**Podlaha: Chrome / WebView 66** (březen 2018). **Doporučeno: 90** — od něj vypadá aplikace stejně jako na novém.

### Ikona z prohlížeče se nespustí (25. 11. 2026) — co se ví a co ne

- **Neměřeno, jen známo z dokumentace Chromu:** ikona z „Přidat na plochu“ je na novějších telefonech „WebAPK“, balíček, který
  vyrobí Google a který potřebuje Chrome a služby Google Play. Na starších telefonech to někdy nejde (chybí služby, plné
  úložiště, starý Chrome), některé plochy ikonu odmítnou nebo ji otevřou v jiném prohlížeči a Chrome při nedostatku místa
  smaže uloženou kopii aplikace. Skutečné APK s vlastní ikonou na ničem z toho nezávisí (jede na systémovém WebView).
- **Příčina u šéfa není známá.** Čeká se na to, co přesně se po klepnutí na ikonu stane, na model telefonu a verzi Androidu
  a na výsledek Diagnostiky. Nehádat; stránka Instalace je cesta, která to obchází, ne důkaz příčiny.
- **Změřeno v kódu:** dosavadní zápis `Android (Capacitor)` v Auditu → Verze aplikace nic neříkal. `window.Capacitor`
  existuje v KAŽDÉM prohlížeči (vytvoří ho už import `@capacitor/core` v `App.tsx`), takže tak vypadal i telefon, který aplikaci
  jen otevřel v Chromu. O APK se teď rozhoduje podle `Capacitor.isNativePlatform()`. Starší záznamy se nepřepisují —
  ukážou se nově, jak se lidé aplikací znovu otevřou.

## Co se opravilo

1. **Záplaty** (`index.html`, klasický skript v hlavičce, ES5): `crypto.randomUUID`, `replaceChildren`,
   `Object.fromEntries`, `Object.hasOwn`, `Array.flat/flatMap`, `String.matchAll`, `queueMicrotask`, `globalThis`.
   Doplňují se jen tam, kde funkce chybí. Klasický skript, protože se vyhodnotí před knihovnami (moduly jsou odložené).
   Testy proti nativním funkcím: `src/lib/startovniPojistka.test.ts`.
2. **Záchranná obrazovka** (`index.html`): místo bílé stránky česky řekne proč a co dělat, když se aplikace nespustí
   (prohlížeč bez modulů, chyba při startu, stažení souborů selhalo, nenačetla se do 20 s). Když se aplikace rozběhne
   později, obrazovka sama zmizí. Tlačítko „Vyčistit mezipaměť a zkusit znovu“ nemaže data a offline se vypne.
3. **Diagnostika telefonu** (`public/diagnostika.html`): samostatná stránka v ES5 bez knihoven. Verdikt, údaje o
   telefonu, co prohlížeč umí, spojení s aplikací a databází, **rozdíl hodin telefonu proti serveru** (špatné datum
   rozbije zabezpečené spojení), zpráva ke zkopírování. V APK se ukáže i jako místní chybová stránka.
4. **CSS**: PostCSS plugin přepisuje `:is(.dark *)` na `.dark …` (stejná specifičnost i pořadí, jen pro starý
   prohlížeč čitelné); `build.cssTarget = 'chrome64'` přepíše `inset`; třída `max-h-ekran` má zálohu bez `dvh`.
5. **APK** (`capacitor.config.json`): `android.minWebViewVersion = 66` a `server.errorPath = diagnostika.html` —
   místo bílé obrazovky se v APK ukáže diagnostika, i bez internetu (je v APK zabalená).
6. **Upozornění v aplikaci**: na prohlížeči pod 90 se jednou za 14 dní ukáže hláška s odkazem na diagnostiku
   (`lib/upozorneniStarehoTelefonu.ts`). Odkaz je i v Nastavení → Instalace aplikace a v návodu.
7. **Hlídače**: `src/lib/starsiProhlizece.test.ts` (nový kód nesmí sáhnout na funkci novější než podlaha bez záplaty),
   `npm run zkontroluj-css-podlaha` v CI (čte hotové CSS a index.html, a od 25. 11. i `_redirects`, `instalace.html`
   a `sw.js`), `src/lib/capacitorKonfigurace.test.ts`.
8. **Instalace aplikace** (`public/instalace.html`, adresa `/instalace`): samostatná stránka v ES5 bez knihoven. Pozná telefon
   (Android 7+, starší Android, iPhone, počítač, odkaz uvnitř jiné aplikace, už nainstalováno) a ukáže jeden postup;
   ostatní jsou v rozbalovacím „Postup pro jiný telefon“. Na Androidu 7+ je první stažení APK (`/apk`), na Androidu pod 7
   ikona nebo záložka z Chromu (APK se tam nenabízí), pod Chromem 66 se navíc ukáže červené varování, že prohlížeč je příliš
   starý. Bez JavaScriptu zůstanou všechny postupy za sebou. Odkazuje na ni pozvánka (e-mail, celý text, šablona Supabase),
   Nastavení → Instalace aplikace a návod. Testy: `src/lib/instalace.test.ts`.
9. **Krátký odkaz `/apk`** (`public/_redirects`): 302 na `releases/latest/download/pivovar-zajic.apk`, tedy vždy na nejnovější
   APK. Musí stát před pravidlem `/*` (platí první shoda); hlídá to test i `zkontroluj-css-podlaha`.
10. **Stránka „Bez připojení“** (`public/sw.js`): když se aplikace spouští bez signálu A bez uložené kopie, vrátí service worker
    místo holého „Offline“ českou stránku s postupem; sama se zkusí znovu (událost „online“ a ověření serveru každých 15 s).
    Je napsaná přímo ve skriptu service workeru, protože soubor v cache by se smazal spolu se zbytkem. Test: `src/lib/swOffline.test.ts`.
11. **Jak se aplikace používá** (`src/lib/zarizeni.ts`, zápis `appVersionTracker.ts`): Audit → Verze aplikace ukáže u každého
    uživatele „Aplikace (APK) / Ikona na ploše / Prohlížeč / Vložený prohlížeč“, systém (u Chromu 110+ skutečnou verzi doplní
    `userAgentData`), prohlížeč nebo WebView a model telefonu. Žádná nová databázová tabulka ani migrace (text v `device_info`).

## Co zůstává (vědomě neřešeno)

- **Chrome / WebView pod 84**: chybí `gap` v řádcích — prvky v řádku na sebe těsněji doléhají. Použitelné, jen vzhled
  není stejný. Záloha přes okraje by si vynutila odhadování směru a rozbíjela `ml-auto`; správná oprava je aktualizace
  WebView.
- **Chrome / WebView pod 88, tmavý režim**: ruční pravidlo v `index.css` (tmavé písmo na jantarových tlačítkách) používá
  `:is()` se seznamem tříd; jeho rozbalení by dalo stovky selektorů. Na starém prohlížeči mají tlačítka světlejší písmo.
- **Čtečka PDF a import Excelu** (`pdf.js`, `xlsx`) potřebují novější prohlížeč; na starém se nenačtou, zbytek aplikace jede.
- **APK**: Android 6 a starší ho nenainstaluje (`minSdkVersion = 24`; snížit bez zkoušky na zařízení nejde). Tam se aplikace
  přidá na plochu z Chrome nebo uloží do záložek (stránka Instalace to řekne). **Podpis ladicím klíčem se nemění**: každé APK
  z CI má jiný klíč, takže novou verzi nejde nainstalovat přes starší (nejdřív odinstalovat; stránka Instalace to připomíná).
  Stálý podpisový klíč by to odstranil, ale chce, aby majitel přidal tajný klíč do GitHubu — zatím se nedělá.
- Telefony **bez Obchodu Play** nemají co aktualizovat; pomůže Firefox (aktualizuje se sám), bez záruky.

## Jak zvednout podlahu nebo přidat novou funkci prohlížeče

1. Chceš použít funkci prohlížeče, kterou kód zatím nevolá (např. `Array.prototype.at`)? Hlídač v
   `starsiProhlizece.test.ts` ji vytkne. Buď použij starší zápis, nebo funkci **doplň záplatou** v `index.html`
   (s testem proti nativní funkci v `startovniPojistka.test.ts` a řádkem v `chybejiZaplaty()` v `diagnostika.html`).
2. Zvedáš podlahu (nová knihovna, nový CSS příkaz bez zálohy)? Změň čísla na jednom místě —
   `src/lib/podlahaProhlizece.ts` — a pak v `public/diagnostika.html` (`PODLAHA_CHROME`), `capacitor.config.json`
   (`android.minWebViewVersion`) a v textech pro uživatele. Testy `diagnostika.test.ts` a `capacitorKonfigurace.test.ts`
   ti řeknou, co jsi nechal staré.
3. Po větší změně sestavení pusť `npm run build && npm run zkontroluj-css-podlaha`.

## Kdo co dělá, když šéf hlásí „nejde mi to“

1. Pošli mu odkaz <https://zajic-pivovar.pages.dev/diagnostika.html> a ať pošle výsledek (tlačítko „Zkopírovat zprávu“).
   Jde-li o **ikonu na ploše** (z prohlížeče to jde, z ikony ne), pošli mu k tomu <https://zajic-pivovar.pages.dev/instalace>
   (stažení aplikace) a zeptej se, co přesně se po klepnutí na ikonu stane (bílá obrazovka, chybová hláška, otevře se jiný
   prohlížeč, nic) a jaký je to telefon a Android.
2. Čti **Výsledek** a **Problémy / Upozornění**: červeně = prohlížeč je pod podlahou (aktualizovat WebView a Chrome),
   žlutě = poběží, ale starý; „hodiny proti serveru“ mimo ±5 min = špatné datum v telefonu; „databáze NEJDE“ = síť
   nebo certifikát (špatné datum, starý Android).
3. Prohlížeč neumí aktualizovat? Firefox, nebo nový telefon.
