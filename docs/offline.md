# Práce bez signálu (offline)

Majitel 27. 11. 2026: „furt to nefunguje offline, offline si to má držet aspoň objednávky na daný týden,
závozy, stáčení, sklad aktuální, vše z daného týdne" a „napíše to, že to je offline, a neukážou se mi žádný
data".

Tenhle soubor popisuje, co bylo špatně, jak to funguje teď a jak to zkoušet. Kód: `src/lib/offlineKopie.ts`,
`offlineKopieSklad.ts`, `offlineDotaz.ts`, `jisticSpojeni.ts`, `relaceOffline.ts`, `offlineObrazovky.ts`,
`supabase.ts` (obal kolem `fetch`), `public/sw.js`.

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

### 4. Všechny obrazovky jsou v telefonu hned po instalaci verze

Build doplní do `sw.js` seznam všech kusů aplikace (`KUSY`, `scripts/shell-do-sw.mjs`; mimo zůstávají těžké
knihovny pro PDF a Excel). Service worker je uloží při instalaci — tedy dřív, než se nová verze nabídne
k aktualizaci. Co se od minulé verze nezměnilo, jen zkopíruje ze staré paměti. Co nedoběhlo, doplní při
aktivaci a když si o to stránka řekne (zpráva `DOPLN_OFFLINE`, `offlineObrazovky.ts`).

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

## Co uživatel vidí

- Bez signálu: pruh „Jste offline · data z: dnes 10:42" (čas poslední úplné kopie).
- Odpověď z paměti: „Server neodpovídá … Kopie dat v telefonu: dnes 10:42." Bez kopie: „V telefonu zatím není
  kopie dat — otevři aplikaci jednou se signálem a nech ji chvíli otevřenou."
- Na Skladu, Pohybech a Inventuře navíc pruh „čísla jsou z paměti telefonu" (zkouší to znovu sám).

## Známá omezení

- **Po aktualizaci a na novém telefonu** je potřeba appku jednou otevřít se signálem a nechat ji chvíli
  otevřenou (stáhne se kopie dat a doplní obrazovky).
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
`supabase.kopieBezKusu.test.ts`, `zneplatneni.test.ts`.
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

Zkoušet je potřeba i **živý web** (stačí přihlašovací obrazovka, bez účtu): otevřít se signálem, počkat na
service worker, vypnout síť a otevřít `/` i `/?page=dashboard`. Místní zkušební server se od hostingu liší
(nepřesměrovává `/index.html`), takže tuhle chybu neukáže.

Když majitel hlásí „bez signálu nevidím data": zeptat se, co píše pruh nahoře („Kopie dat v telefonu: …" —
jak stará; nebo „zatím není kopie dat") a jestli appku po poslední aktualizaci otevřel se signálem.
Nic neopravovat v databázi — bez signálu se data jen čtou z telefonu.
