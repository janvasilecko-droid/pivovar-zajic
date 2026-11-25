# Starší telefony s Androidem — podlaha prohlížeče

Šéfovi nešla aplikace na starším telefonu s Androidem (25. 11. 2026). Starý WebView po sobě nenechá žádnou
stopu v databázi chyb (`app_errors`) — rozbije se dřív, než se rozběhne kód, který chyby hlásí — takže se příčina
nedala přečíst z provozu. Tenhle dokument je zápis toho, co se **změřilo**, co se **opravilo** a co **zůstává**.

Souvislosti v kódu: `src/lib/podlahaProhlizece.ts` (čísla), `index.html` (záplaty + záchranná obrazovka),
`public/diagnostika.html` (diagnostika telefonu), `scripts/postcss-starsi-prohlizece.mjs`,
`scripts/zkontroluj-css-podlaha.mjs`, `capacitor.config.json`.

## Odkaz pro majitele

Šéf otevře v telefonu **<https://zajic-pivovar.pages.dev/diagnostika.html>**. Stránka zjistí, co telefonu chybí,
řekne česky co s tím a nabídne tlačítko „Zkopírovat zprávu“ (nebo rovnou „Poslat přes WhatsApp“). Nic se neodesílá
samo; zpráva obsahuje jen údaje o telefonu a prohlížeči.

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
   `npm run zkontroluj-css-podlaha` v CI (čte hotové CSS a index.html), `src/lib/capacitorKonfigurace.test.ts`.

## Co zůstává (vědomě neřešeno)

- **Chrome / WebView pod 84**: chybí `gap` v řádcích — prvky v řádku na sebe těsněji doléhají. Použitelné, jen vzhled
  není stejný. Záloha přes okraje by si vynutila odhadování směru a rozbíjela `ml-auto`; správná oprava je aktualizace
  WebView.
- **Chrome / WebView pod 88, tmavý režim**: ruční pravidlo v `index.css` (tmavé písmo na jantarových tlačítkách) používá
  `:is()` se seznamem tříd; jeho rozbalení by dalo stovky selektorů. Na starém prohlížeči mají tlačítka světlejší písmo.
- **Čtečka PDF a import Excelu** (`pdf.js`, `xlsx`) potřebují novější prohlížeč; na starém se nenačtou, zbytek aplikace jede.
- **APK**: Android 6 a starší ho nenainstaluje (`minSdkVersion = 24`; snížit bez zkoušky na zařízení nejde). Tam se aplikace
  přidá na plochu z Chrome. Podpis ladicím klíčem se nemění (viz README).
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
2. Čti **Výsledek** a **Problémy / Upozornění**: červeně = prohlížeč je pod podlahou (aktualizovat WebView a Chrome),
   žlutě = poběží, ale starý; „hodiny proti serveru“ mimo ±5 min = špatné datum v telefonu; „databáze NEJDE“ = síť
   nebo certifikát (špatné datum, starý Android).
3. Prohlížeč neumí aktualizovat? Firefox, nebo nový telefon.
