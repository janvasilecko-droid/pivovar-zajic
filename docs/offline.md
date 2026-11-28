# Práce bez signálu (offline)

Majitel 27. 11. 2026: „furt to nefunguje offline, offline si to má držet aspoň objednávky na daný týden,
závozy, stáčení, sklad aktuální, vše z daného týdne" a „napíše to, že to je offline, a neukážou se mi žádný
data".

Tenhle soubor popisuje, co bylo špatně, jak to funguje teď a jak to zkoušet. Kód: `src/lib/offlineKopie.ts`,
`offlineKopieSklad.ts`, `offlineDotaz.ts`, `jisticSpojeni.ts`, `relaceOffline.ts`, `offlineObrazovky.ts`,
`supabase.ts` (obal kolem `fetch`), `public/sw.js`, `versionCheck.ts` (aktualizace), `registraceSw.ts`.

## Co bylo špatně (změřeno v prohlížeči proti kopii skutečných dat, jen čtení)

Zkouška: se signálem otevřít jen Plochu, pak signál vypnout a projít obrazovky.

1. **Data se pamatovala jen pro přesnou adresu dotazu.** Adresy obsahují datum, týden nebo seznam id, takže
   druhý den — nebo na obrazovce, kterou člověk se signálem neotevřel — telefon nic neměl a obrazovka ukázala
   prázdno („Zatím žádné stočení").
2. **Kusy aplikace se ukládaly, až když se obrazovka poprvé otevřela** — a po každé aktualizaci znovu. Sklad
   bez signálu zůstal jako šedé obdélníky (jeho kus v telefonu chyběl).
3. **Po hodině bez signálu appka odhlásila.** Přihlašovací token platí hodinu; knihovna ho bez spojení zkouší
   ~25 s obnovit (všechny dotazy čekají) a pak vrátí „nikdo není přihlášený" → přihlašovací obrazovka, na které
   se bez signálu přihlásit nedá. Přihlášení přitom v telefonu pořád bylo.
4. **Stránkované čtení bez signálu skončilo po první tisícovce řádků** (uložený celkový počet se přepsal délkou
   stránky) — položky objednávek a odpočty závozu nad 1000 řádků chyběly ve výpočtu skladu.
5. `.single()` vracel bez signálu pole místo řádku; dotaz jen na počet (odznaky) končil chybou.
6. **Slabý signál** (telefon hlásí „online", server mlčí): každý dotaz si odčekal 10–25 s, než se sáhlo do
   paměti. Obrazovka, která se ptá postupně, čekala minutu nebo se neukázala vůbec; Rozvoz navíc před načtením
   čekal na zápis „minulé závozy = zavezeno".

7. **Start bez signálu na adrese s parametrem** (`/?page=sklad` — odkaz z upozornění, záložka) skončil chybou
   prohlížeče. Hosting přesměrovává `/index.html` na `/`, uložená stránka si nese příznak „vznikla
   přesměrováním" a takovou prohlížeč jako stránku odmítne. Start z ikony (`/`) fungoval. Změřeno na živém
   webu 27. 11. 2026; místní zkoušky to neukázaly, protože zkušební server nepřesměrovává.

### Aktualizace rozbíjela práci bez signálu (28. 11. 2026)

Změřeno zkouškou, kterou udělá každý skutečný telefon jen jednou: přechod ze staré verze (2.1053, service
worker 2.442) na novou, se serverem, který se chová jako hosting. Dosavadní zkouška „po aktualizaci" tohle
neukázala — aktivovala nový service worker zprávou `SKIP_WAITING`, jenže tlačítko „Aktualizovat" dělá něco
jiného: zruší registraci service workeru, smaže uloženou aplikaci a načte stránku ze sítě (`forceRefresh`).

8. **Tlačítko „Aktualizovat" bylo na slabém signálu desítky vteřin mrtvé.** Prohlížeč vyřídí zrušení
   registrace až po právě běžící instalaci nového service workeru — a ta od 27. 11. stahuje všech 128
   obrazovek. Na 200 kbit/s: 49 s bez jakékoliv odezvy (tlačítko žádnou nemělo).
9. **Po aktualizaci se appka až 5 minut neotevřela**, když server zrovna neodpovídal (starší vada). Událost
   `activate` čekala na nové stažení jádra ze sítě a dokud aktivace neskončí, prohlížeč nepustí otevření
   stránky. Navigace vypršela po 60 s, stránka naběhla až po 5 minutách, kdy prohlížeč aktivaci sám utnul.
10. **„Aktualizovat" bez signálu smazalo aplikaci z telefonu** (starší vada). Žlutá lišta nejde zavřít; kdo na
    ni klepl ve sklepě, skončil na chybové stránce prohlížeče a appka nešla spustit ani z ikony, dokud se
    signál nevrátil. **Stejnou cestou si ji appka mazala sama**: „automatická oprava" v `main.tsx` volala
    `forceRefresh` po jakékoliv neodchycené chybě se zprávou „Failed to fetch" — tak se ale hlásí každý dotaz,
    který neprošel sítí.
11. **Nová verze mohla nahradit fungující starou neúplnou.** Instalace chyby stahování polyká; když na slabém
    signálu nestáhla vstupní skript, po aktivaci se stará verze smazala a appka bez signálu nenaběhla.
12. **Service worker se registroval až po úplném načtení stránky** (`load`). Na slabém signálu to po
    aktualizaci bylo o 35 s později, než nová verze už běžela — a celou tu dobu by appka bez signálu nenaběhla.
13. První spuštění nové verze bez signálu (ještě nemá kopii dat) ukázalo jen „Jste offline" a prázdné
    obrazovky — bez vysvětlení.

## Jak to funguje teď

### 1. Kopie provozních tabulek v telefonu

Kdykoliv má appka signál, stáhne si na pozadí **celé** provozní tabulky (`TABULKY_KOPIE` v `offlineKopie.ts`:
objednávky, závoz, stáčení, sklad, sklep, prodejna a číselníky) a uloží je do IndexedDB (`pivovar-kopie`).

- Proč celé, a ne „jen tento týden": sklad se počítá ze všech pohybů od začátku. Celá provozní data jsou malá
  (listopad 2026: ~1,6 MB, po zabalení na cestě ~200 kB); jeden týden by znamenal hádat, co kam patří.
- Kdy: ~3 s po spuštění, po návratu signálu, po návratu do appky (kopie starší než 3 min), každých 10 min,
  a 5 s po změně jen ta tabulka, která se změnila (vlastní zápis i cizí přes realtime).
- „Změna" je jen skutečný zápis. Zneplatnění pro jistotu (minutová pojistka obrazovek, návrat do appky) kopii
  stahovat nenutí — jinak by se stahovala každou minutu a jedla mobilní data (`lib/zneplatneni.ts`).
- Stahuje se přímo ze serveru tokenem přihlášeného (ne přes klienta, který by při výpadku odpověděl sám ze
  sebe). Co se nestáhlo, zůstane ve starší podobě — nikdy se nepřepíše prázdnem.
- Kopie patří účtu, který ji stáhl; jiný účet z ní nedostane nic. Při odhlášení se maže.
- Do kopie se **nestahují**: zprávy z WhatsAppu, záznamy chyb a přihlášení, klíče (`app_secrets`), bible.

### 2. Dotaz se vyhodnotí v telefonu

`offlineDotaz.ts` umí nad kopií vyhodnotit to, co appka serveru posílá: filtry (`eq, neq, gt, gte, lt, lte,
in, is, like, ilike, not.*`, skupiny `or`/`and` s třístavovou logikou jako v SQL), řazení, stránkování, výběr
a přejmenování sloupců a vnoření `orders ↔ order_items`, `akce ↔ akce_items`.

**Nehádá se.** Cokoliv jiného (neznámý sloupec, `!inner`, přetypování, cesta do JSON, filtr ve vnořené
tabulce…) vrátí `null` a platí starý postup (uložená odpověď na přesnou adresu, jinak prázdno s pruhem).

### 3. Odpověď bez signálu (`supabase.ts`)

Čtení jde vždy nejdřív na server. Když selže nebo vyprší:

1. kopie tabulky, nebo uložená odpověď na přesně tuhle adresu — ta čerstvější z nich;
2. zápisy z telefonu se přimíchají **před** filtrem (fronta čekajících celá, už odeslané jen mladší než kopie)
   — nová objednávka zapsaná bez signálu se ukáže jen ve svém týdnu;
3. `.single()` dostane objekt (nebo chybu 406 jako od serveru), dotaz na počet číslo z kopie, stránkované čtení
   správný celkový počet.

Každá odpověď z paměti se označí (`lib/zPameti.ts`) — obrazovky ukážou pruh, že čísla nejsou ze serveru.

Start aplikace to nezdržuje: stahování kopie a vyhodnocení dotazů jsou v samostatných kusech
(`lib/offlineUdrzba.ts`, `lib/offlineDotaz.ts`), které se načtou až po přihlášení.

### 4. Všechny obrazovky jsou v telefonu dřív, než se verze zapne

Build doplní do `sw.js` seznam všech kusů aplikace (`KUSY`, `scripts/shell-do-sw.mjs`; mimo zůstávají těžké
knihovny pro PDF a Excel). Service worker je uloží **při instalaci verze** — spolu s jádrem (`PRECACHE`). Co se
od minulé verze nezměnilo, jen zkopíruje ze staré paměti (mezi dvěma nasazeními se obvykle změní asi
90 kusů ze 128, ~0,8 MB po zabalení).

- **Verze se zapne, až když je celá.** Když se při instalaci nestáhne všechno (slabý signál) a v telefonu je
  starší verze, instalace selže: starší verze běží dál, stažené zůstává a příští pokus (appka se ptá každou
  minutu) doplní jen zbytek.
- Stahuje se nejvýš šest souborů souběžně. Hlídač ticha: když se minutu nedokončí jediný soubor, vzdá to —
  server, který neodpovídá, nesmí instalaci držet. Pomalé spojení, na kterém soubory přibývají, se nepřeruší.
- **První instalace** (v telefonu žádná starší verze není) se dokončí i neúplná a zbytek se doplní na pozadí
  (`doplnNaPozadi`): hned po aktivaci a kdykoliv si o to stránka řekne (zpráva `DOPLN_OFFLINE` — 6 s po
  spuštění a po návratu signálu, `offlineObrazovky.ts`). Běží nejvýš jedno doplňování naráz.
- Stránce odpoví pravdivě, kolik obrazovek v telefonu je (`OFFLINE_STAV`) — ukazuje to Nastavení → Ostatní →
  „Práce bez signálu" (`offlinePripravenost.ts`).

Otevření stránky bez signálu: přesná adresa, jinak táž cesta bez parametrů (aplikace je jedna stránka), a
odpověď se vždy podá bez příznaku přesměrování (`strankaZCache`, `bezPresmerovani` v `sw.js`).

### 5. Přihlášení vydrží bez signálu (`relaceOffline.ts`, `auth.tsx`)

`getSession()` a `getUser()` mají obal: s prošlým tokenem a bez spojení vrátí přihlášení uložené v telefonu
hned (na obnovu se čeká nejvýš 3 s). Appka se odhlásí jen skutečným odhlášením. Server s prošlým tokenem nic
nevydá — bez signálu jsou vidět jen data, která si tenhle telefon dřív stáhl pod tímhle účtem. Odpověď 401
„JWT expired" na dotaz s prošlým tokenem se bere jako výpadek (čtení z paměti, zápis do fronty).

### 6. Slabý signál — jistič spojení (`jisticSpojeni.ts`)

Jistič si pamatuje, že server před chvílí neodpověděl (dotaz čekal ≥ 2 s a selhal):

| stav | čtení |
|---|---|
| o výpadku nevíme | čeká na síť jako vždy (10 s malý dotaz, 25 s velký) |
| výpadek čerstvý (do 20 s od posledního dokladu) | odpověď z paměti **hned** |
| výpadek starší (appka byla schovaná) | síť dostane 4 s, pak paměť |

- Dotazy, které právě čekají, se o výpadku dozvědí hned a odpoví z paměti; jejich požadavek se zruší
  (zaseknutý by držel spojení).
- Dokud výpadek trvá a appka je vidět, ptá se jistič serveru sám lehkým dotazem každých 5 s. Jakmile server
  odpoví, pošle událost `pivovar:spojeni-zpet`: obrazovky se přenačtou, fronta zápisů odejde, kopie se stáhne.
- Doklad výpadku přežije nové spuštění appky (10 min) — start ve sklepě nečeká znovu celý limit.
- **Co jistič nedělá:** nehádá (na co telefon odpovědět neumí, čeká na síť), nesahá na zápisy (ty zkoušejí síť
  vždy a pak jdou do fronty), nereaguje na rychlá selhání (telefon ví, že je offline — tam se nečeká).

### 7. Aktualizace nesmí rozbít práci bez signálu (`sw.js`, `versionCheck.ts`, `main.tsx`)

Pravidlo: **nová verze se zapne, až když je v telefonu celá, a aktualizace nic nemaže.**

- **Tlačítko „Aktualizovat"** (`aktualizuj`): nový service worker se nainstaluje na pozadí celý a čeká. Klepnutí
  mu jen řekne, ať převezme stránku (`SKIP_WAITING`), počká na převzetí (nejdéle 5 s) a stránku načte znovu —
  už z jeho paměti. Jde to i bez signálu a po přepnutí appka hned umí všechno (žádné okno, kdy by bez signálu
  nenaběhla). Když se nová verze ještě stahuje, počká nejdéle 15 s („Stahuji novou verzi…"), pak řekne
  „Nová verze se do telefonu ještě stahuje… zkus to za chvíli znovu" a nic neudělá.
- **Vynucená aktualizace** (`forceRefresh`) zůstává jako nouzová cesta: Nastavení → „Vynutit stažení nejnovější
  verze", automatická oprava po chybě načtení kusu, prohlížeč bez service workeru — a třetí klepnutí na
  „Aktualizovat", když dvě šetrná nic nepřipravila (ať se nedá uvíznout na staré verzi). Ruší registraci a maže
  uloženou aplikaci, proto **napřed ověří, že server odpovídá** (`serverOdpovida`: `version.json` s jedinečnou
  adresou, limit 8 s — service worker na ni bez spojení vrátí 503, takže „ano" znamená opravdu server). Bez
  spojení nic nemaže. Nemaže ani tehdy, když prohlížeč do 30 s nezruší registraci (čeká za běžící instalací):
  smazat cache pod rukama rozdělané instalaci by nechalo v telefonu service worker s prázdnou pamětí.
- **`activate` nečeká na síť.** Dokud aktivace neskončí, prohlížeč nepustí otevření stránky.
- **Automatická oprava** (`main.tsx`) se spouští jen na chybu načtení kusu aplikace (`jeChybaNacteniKusu`),
  ne na holé „Failed to fetch".
- **Service worker se registruje nejpozději 3 s po spuštění** (`registraceSw.ts`), ne až po `load`.

Co zůstává: telefony na verzi 2.1055 a starší mají ještě starý kód tlačítka. První přechod na opravenou verzi
proto musí proběhnout **se signálem** (klepnutí bez signálu u nich aplikaci pořád smaže, dokud se signál
nevrátí) a na slabém signálu může tlačítko až minutu nereagovat (čeká na dostahování nové verze).

## Co uživatel vidí

- Bez signálu: pruh „Jste offline · data z: dnes 10:42" (čas poslední úplné kopie). Když kopie ještě není:
  „Jste offline · v telefonu zatím není kopie dat".
- Odpověď z paměti: „Server neodpovídá … Kopie dat v telefonu: dnes 10:42." Bez kopie: „V telefonu zatím není
  kopie dat — otevři aplikaci jednou se signálem a nech ji chvíli otevřenou."
- Na Skladu, Pohybech a Inventuře navíc pruh „čísla jsou z paměti telefonu" (zkouší to znovu sám).

## Známá omezení

- **Po aktualizaci a na novém telefonu** je potřeba appku jednou otevřít se signálem a nechat ji chvíli
  otevřenou (stáhne se kopie dat a doplní obrazovky). „Chvíli" změřeno 28. 11. 2026: na dobrém signálu do
  ~7 s po klepnutí na Aktualizovat, na 200 kbit/s kolem minuty (obrazovky ~1,1 MB, data ~200 kB).
- **Pořadí řádků se shodným klíčem řazení** se bez signálu může lišit (server ho nezaručuje ani sobě). Týká se
  jen pořadí v seznamu, ne obsahu ani čísel. Kopie se proto stahuje bez řazení — v pořadí, v jakém server
  řádky vrací obrazovkám; jen tabulky nad 1000 řádků po stránkách podle `id`.
- **Zprávy z WhatsAppu** a další tabulky mimo kopii bez signálu nejsou (leda uložená odpověď na přesnou adresu).
- **Zápisy bez signálu** jdou do fronty a odejdou po návratu. Volání procedur (RPC) a hromadné zápisy
  s jiným filtrem než „rovná se" do fronty nejdou — bez signálu selžou hned a je to vidět.
- Kopie je stará nejvýš ~10 minut před ztrátou signálu; co mezitím změnil někdo jiný, telefon neví.

## Jak to zkoušet

Jednotkové testy: `offlineDotaz.test.ts`, `offlineKopie.test.ts`, `offlineKopieSklad.test.ts`,
`supabase.kopie.test.ts`, `supabase.slabySignal.test.ts`, `jisticSpojeni.test.ts`, `relaceOffline.test.ts`,
`auth.bezSignalu.test.tsx`, `swKusy.test.ts`, `offlineObrazovky.test.ts`, `minuleZavezeno.test.ts`,
`supabase.kopieBezKusu.test.ts`, `zneplatneni.test.ts`; aktualizace: `versionCheck.test.ts`,
`lazyStranka.test.ts`, `registraceSw.test.ts`, `offlinePripravenost.test.ts`.
Data v testech jsou vymyšlená (repo je veřejné).

**Rozdílová zkouška vyhodnocení** (dělá se ručně, skript není v repu): zachytit adresy čtení, které appka
posílá při průchodu obrazovkami, každou vyhodnotit místně nad staženými tabulkami a porovnat s odpovědí
skutečného serveru. Jen čtení (`GET`), výsledky se nikam neukládají. 27. 11. 2026: 101 dotazů, 98 shodných
do posledního řádku, 3 se lišily jen pořadím řádků se shodným klíčem řazení, 0 nepodporovaných.

**Zkoušky v prohlížeči** (Playwright, sestavená appka proti falešnému serveru, který skutečné databázi
přeposílá jen `GET`/`HEAD` a všechno ostatní zahodí):

| scénář | výsledek 27. 11. 2026 |
|---|---|
| se signálem jen Plocha → bez signálu 13 obrazovek | všechny mají data, obsah do 0,35 s |
| totéž „druhý den" (hodiny +26 h, token prošlý) | žádné odhlášení, všechny mají data |
| server visí (telefon „online"), start appky | první obrazovka za 10 s (dřív 34 s nebo vůbec) |
| server visí, přechod na další obrazovky | ~0,1 s |
| server visí, appka znovu spuštěná | ~0,2 s |
| server se vrátí | do ~6 s čerstvá data, pruh zmizí |
| nasazení nové verze → aktualizace → bez signálu | stáhly se jen změněné soubory (3 ze 130), všechny obrazovky jdou otevřít |

**Zkouška přechodu mezi verzemi** (28. 11. 2026; skript není v repu). Server, který se chová jako hosting
(`/index.html` → 308 na `/`, hlavičky z `public/_headers`, volitelně pomalé spojení nebo server, který
neodpovídá), dvě sestavení appky, v prohlížeči skutečné klepnutí na „Aktualizovat". Dva přechody: ze staré
verze 2.1053 (starý kód tlačítka — to, co udělá každý dnešní telefon) a mezi dvěma opravenými verzemi.

| scénář | stará 2.1053 → opravená | opravená → další |
|---|---|---|
| klepnutí, dobrý signál | nová verze za 0,4 s; obrazovky hned, kopie dat za ~6 s; bez signálu 13 z 13 | přepnuto za ~1,5 s, připraveno hned; 13 z 13 |
| klepnutí, 200 kbit/s | tlačítko 51 s bez odezvy (čeká na dostahování), pak celé; 13 z 13 | „Stahuji novou verzi…" 15 s → „ještě se stahuje"; po 45 s přepnuto, připraveno hned; 13 z 13 |
| bez klepnutí: zavřít a otevřít se signálem | běží nová, kopie dat za ~5 s; 13 z 13 | běží nová, připraveno hned; 13 z 13 |
| bez klepnutí: otevřít bez signálu | nová naběhne, pruh „v telefonu zatím není kopie dat" | nová naběhne, 6 z 6 s daty |
| bez klepnutí: server neodpovídá při zavření i otevření | start za 10 s (**před opravou přes 5 minut**), bez kopie 3 z 6 | start za 10 s, 6 z 6 s daty |
| signál zmizí 4 s po klepnutí | 13 z 13, start bez signálu jde | 13 z 13 |
| klepnutí bez signálu | **appka smazaná, dokud se signál nevrátí** (starý kód tlačítka) | přepne na novou verzi i bez signálu, 4 z 4 |

Co ta zkouška našla, je v oddíle „Aktualizace rozbíjela práci bez signálu". Poučení: zkoušet se musí skutečné
tlačítko a přechod ze STARŠÍ verze; a mezi variantami rozhodl až scénář „server neodpovídá hned po instalaci"
— stahování obrazovek na pozadí po instalaci vypadalo rychleji, ale novou verzi nechávalo zapnout neúplnou.

Zkoušet je potřeba i **živý web** (stačí přihlašovací obrazovka, bez účtu): otevřít se signálem, počkat na
service worker, vypnout síť a otevřít `/` i `/?page=dashboard`. Místní zkušební server se od hostingu liší
(nepřesměrovává `/index.html`), takže tuhle chybu neukáže.

Když majitel hlásí „bez signálu nevidím data": zeptat se, co píše pruh nahoře („Kopie dat v telefonu: …" —
jak stará; nebo „zatím není kopie dat") a jestli appku po poslední aktualizaci otevřel se signálem.
Nic neopravovat v databázi — bez signálu se data jen čtou z telefonu.
