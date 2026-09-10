# 50 návrhů — 10. 9. 2026 (třetí kolo)

Návrh k projednání, zatím NEIMPLEMENTOVÁNO. Navazuje na dokončená kola
`docs/20-navrhu-2026-09-08.md` a `docs/30-navrhu-2026-09-10.md`. Vychází
ze tří zdrojů: existujícího měřeného auditu `docs/mobil-po-strankach.md`
a `docs/jednotny-styl.md` (oba z 4. 9. 2026 — u obrazovek, které jsem dnes
přepracoval, jde jen o vzorec/princip, ne přesná čísla), živého záznamu
chyb appky (`app_errors`) a průzkumu ~25 dosud neprobíraných obrazovek.

## Aktivní chyby (nejsou to vylepšení — appka teď dělá něco špatně)

1. **Denní odpočet ze závozu padá na oprávnění.** V `app_errors` 4×
   (9. 9. 2026) `permission denied for function run_today_zavoz_deductions`.
   Appka to sama zkouší opakovat, ale příčina (chybějící/smazaný GRANT
   EXECUTE, pravděpodobně vedlejší efekt pozdější migrace oprávnění) zůstává.
   Riziko: sklad se nemusí odečítat podle skutečných závozů.
2. **WhatsApp auto-parse naráží na limit požadavků.** 3× „Příliš mnoho
   požadavků" 9. 9. 2026 — limit 5 volání/60 s (`whatsapp-auto-parse`) je
   sdílený mezi cronem (každé 3 min) a klientem; při více otevřených
   zařízeních/kartách najednou se dá vyčerpat. Zprávy se nakonec zpracují
   při dalším pokusu, ale se zpožděním.
3. **`Catalogs.tsx` — `PlacesScreen.load()` zahazuje vlastní opravu.**
   Funkce nejdřív doplní chybějící `delivery_group` u „sklad"/„BEN"/„JONA"
   a načte opravená data do `refreshedData`, ale pak o řádek níž
   bezpodmínečně přepíše stav zpátky původními (needoplněnými) daty —
   backfill se tedy nikdy neprojeví na obrazovce.

## Chybějící ukládání dat (appka se tváří, že to uloží, a neuloží)

4. **Merch — sklad reklamních předmětů (`MarketingMerchInventory`,
   záložka ve Skladu) nemá ŽÁDNÉ ukládání** — ani Supabase, ani
   localStorage. Každá změna množství i přidaná položka zmizí při obnovení
   stránky a nikdy ji nevidí druhé zařízení. Vypadá hotovo, není.
5. **Festivalové vybavení (`FestivalEquipmentTracker`, záložka ve Skladu)
   má stejný problém** — půjčky/vratky chladičů, stanů, narážečů (v kaucích
   za tisíce Kč) se nikam neukládají. Navíc bez kroku „kauce vrácena" —
   na rozdíl od `KegReturnModal` v Závozu.
6. **Sklo & Promo — nesourodé ukládání v rámci jedné obrazovky.** Nákupy
   etiket a lahví jsou v Supabase, ale stav skla/promo materiálu
   (`entries`) jen v localStorage — mezi zařízeními se rozchází stejným
   způsobem jako body 4–5.
7. **Vozidla i Sklep (`Cellar.tsx`) při prázdné tabulce automaticky
   založí fiktivní demo záznamy** (vymyšlené SPZ, STK, obsazené tanky).
   Po smazání/reset dat appka sama nahradí prázdný stav výmyslem místo
   aby vyzvala k zadání skutečných údajů.

## Mobilní ovladatelnost (z měřeného auditu 4. 9. 2026)

8. **Závoz — záložky „Nové/Přehled/Závoz" mají ~28 px místo 44 px.**
   Nejmenší náklad, nejhorší současný stav, obrazovka řidiče v terénu.
9. **Chybějící `active:` odezva na klepnutí** — appka měla 200+ tlačítek
   jen s `hover:` (na dotyku neexistuje). Nejhorší Závoz (50/0), Objednávky
   (68/1), Lahve (48/3), Stáčení KEG (55/1) — čísla z 4. 9., dnešní úpravy
   KEG/Lahve to částečně zlepšily, zbytek appky ne.
10. **200+ `title="…"` tooltipů, které na telefonu nikdy nejdou vidět** —
    nejvíc Objednávky (35), Stáčení KEG (23), Sklad (15), Závoz (13),
    Inventura (12), Lahve (12). Vysvětlení tlačítka je na hlavním zařízení
    appky nedostupné.
11. **Záložky jako vodorovný pásek bez rolovacího náznaku** — Závoz,
    Sklep, Historie, Inventura, Sanitace. Na 360 px se vejdou tři, zbytek
    je za okrajem bez gradientu/šipky, co by napovědělo, že je co rolovat.
12. **86 dotykových cílů mezi 12–32 px** — nejvíc Kalendář (13), Objednávky
    (12), Upomínky (9), Sklo & Promo (8), Lahve (8), Závoz (7).
13. **Objednávky — sedm filtrů zabírá celou první obrazovku telefonu**
    (hledání, status, obaly, pivo, obal, seskupit dle dne, jen nezavezené).
    Schovat za jedno tlačítko „Filtr (2)" s počtem aktivních.
14. **Inventura — tabulka s pevnou šířkou 900 px**, na telefonu se roluje
    do strany a není vidět, u kterého piva člověk je. Návrh: průvodce po
    jedné položce (větší úloha, ale jediná věc, co může sundat papír ze
    sklepa).
15. **Sklad (`Stock.tsx`) — tři tabulky, jen jedna mobilní karta.**
    Návrh: karta na položku (pivo+obal, stav, předpověď dojití — ta už
    hotová je, jen ne v kartě).
16. **Sklo & Promo — nejhorší poměr v appce**: 9 hustých mřížek, 3 tabulky,
    nula mobilních karet.
17. **Statistika/Historie — grafy neumí tmavý režim** (koláčový graf má
    natvrdo `stroke="#fff"`) a na telefonu se názvy piv v ose X zkracují
    na „Desít…" — návrh otočit na vodorovné pruhy pro mobil.
18. **Kalendář — 13 dotykových cílů pod 44 px** (zvonek, koš v buňce dne),
    nejvíc v appce. Návrh: měsíc jako přehled tečkou, detail dne pod tím.
19. **Uživatelé — matice oprávnění (19 modulů × 2 práva) je jen tabulka**,
    na telefonu neovladatelná. Předvolba „Řidič" už pokrývá nejčastější
    případ; výjimky by chtěly seznam se dvěma přepínači na řádek.
20. **Nastavení je nejdelší stránka appky bez rejstříku** — odkazy na
    sekce nahoře by ušetřily rolování.

## Sjednocení vzhledu

21. **568 tlačítek s vlastní barvou pozadí** místo sdíleného `.btn-*`
    systému (měřeno 4. 9., skript ověřený na vzorku). Návrh: pět rolí
    (hlavní/potvrzení/vedlejší/nebezpečná/množství), postupně po
    obrazovkách — najednou po celé appce by to byl risk plošné úpravy,
    který si tenhle projekt už nese jako zkušenost.
22. **Žlutá jako „hlavní akce" na některých obrazovkách koliduje se
    žlutou jako barvou značky** (navigace, dlaždice, záložky) — hlavní
    akce by měla být měděná (`.btn-primary`), ne žlutá.
23. **Duplicitní barva v Kalendáři** — štítek „Tyrkysová" (accent) a
    „Modrá" (primary) u připomínek mapují na stejnou třídu
    (`bg-primary-500`) — vizuálně nerozeznatelné, jedna z voleb je zbytečná.

## HACCP a sanitace

24. **Sanitační deník (`SanitationLogScreen`) má vlastní, natvrdo zapsaný
    seznam tanků** (`Tank 1–8`, `Spilka 1–3`…), oddělený od skutečné
    tabulky `cellar_tanks`, kterou používá Sklep. Přejmenování/přidání
    tanku ve Sklepě se v deníku neprojeví — riziko rozjetých názvů.
25. **HACCP obsah (postupy, diagram procesu) je natvrdo v kódu**
    (`HACCP_DOCUMENTS`, ASCII diagram), na rozdíl od ostatních katalogů
    appky (piva, obaly, odběratelé), které mají DB a editaci v UI. Změna
    postupu podle nové legislativy/normy dnes vyžaduje nasazení appky.
26. **Lahvová sanitace nemá měsíční připomínku** — sudová (`KegSanitationDiary`)
    už hlásí „poslední týden měsíce a chybí hloubkové čištění", lahvová
    obdobu nemá, i když má srovnatelný postup.
27. **Z konkrétního kroku HACCP (např. „7.1 Mytí KEG sudů") nejde proklik
    přímo na sanitační záznamy toho tanku/sudu** — jsou to dvě oddělené
    záložky bez propojení.

## Vozidla, termíny, připomínky

28. **STK a dálniční známka (Vozidla) nejsou propojené s Připomínkami
    ani s push upozorněním** — appka o blížícím se termínu ví (30denní
    práh), ale řekne to jen tomu, kdo si otevře záložku Vozidla.
29. **Kalendář nezobrazuje termíny STK/známek ani splatné Připomínky** —
    přitom obojí je datum, na které appka už sama umí upozornit; jde jen
    o to dostat je do stejného zobrazení jako Závoz a Stáčení.
30. **Připomínky (`RemindersScreen`) a připomínky u události v Kalendáři
    jsou dva oddělené, nepropojené systémy** — jeden hromadně rozesílá
    (role/uživatel/e-mail), druhý je vázaný na konkrétní datum akce.
31. **Odeslání připomínky „všem" nemá náhled počtu příjemců ani
    „poslat nejdřív sobě na zkoušku"** — rozeslání je trochu naslepo.
32. **Připomínky neumí opakování** („každé pondělí", „první den v měsíci")
    — jen jednorázový termín nebo okamžité odeslání.

## Katalogy, ceník, historie

33. **`BeerForm` sbírá pole „zkratka" (shortName), ale nikdy ho neukládá**
    (`short_name se neukládá, protože sloupec nemusí existovat` — komentář
    v kódu) — pole v UI je, ale je to fakticky mrtvý vstup, který uživatele
    plete.
34. **Ceník nemá historii cen** — každá úprava přepíše starou hodnotu bez
    stopy, kdy a na kolik se cena změnila (souvisí i s odloženou
    fakturací z minulého kola, ale tohle je menší, samostatně smysluplný
    krok).
35. **`KegReturnModal` má natvrdo zapsané velikosti sudů** (50/30/20/15/10 l)
    místo načtení z katalogu Obalů — nový/jiný rozměr KEG by se v modálu
    neobjevil, dokud by ho někdo neopravil v kódu.
36. **`Statistika.tsx` je jen přesměrování na `History.tsx`** (`export
    { default } from './History'`) — stálo by za kontrolu, že se název
    „Statistika" vs. „Historie" nepoužívá nekonzistentně v menu/nadpisech.
37. **Uložené filtry v Historii/Statistice vypadají jako čistě lokální
    (per zařízení)** — stálo by za ověření a případně sdílení mezi
    zařízeními stejně jako zbytek appky.

## Ostatní

38. **Časovače (Stopky/Odpočet/Stáčecí) jsou čistě lokální na zařízení**
    — spuštěný odpočet ve varně nevidí kolega na jiném telefonu, i když
    zbytek appky je realtime.
39. **Předvolby odpočtu (Kotel/Chmelení/Chmelovar/Máčení kvasnic/Pauza)
    jsou pevný seznam** — bez možnosti přidat vlastní pojmenovanou
    předvolbu pro opakující se vlastní postup.
40. **Poznámky (`Notes.tsx`) nejdou přiřadit k ničemu konkrétnímu**
    (pivu, tanku, objednávce, vozidlu) ani nemají termín — funkčně se
    překrývají s Kalendářem i Připomínkami, ale všechny tři žijí odděleně.
41. **Oznámení pro celý tým (`AnnouncementManagerModal`) je jen jeden
    slot** — nové oznámení potichu smaže/nahradí předchozí, žádná historie
    ani naplánování „zveřejnit od data".
42. **Kritické materiály — kdo smí vidět upozornění je hardcoded shoda
    textu** (`role === 'sef' || name.includes('sladek') || email.includes('vasilecko')`)
    místo skutečného oprávnění — křehké, jméno/e-mail se dřív nebo později
    změní a upozornění tiše přestane fungovat pro správného člověka.
43. **Rádio pivovaru (`BreweryRadioBar`) — po zavření křížkem mizí
    plovoucí lišta úplně** a není zřejmé, kde ho znovu pustit kromě
    plného modálu — ověřit, že je odjinud v menu snadno dohledatelný.
44. **Schválené e-maily (Uživatelé) — není vidět, co se stane se
    zamítnutou/vypršelou žádostí o přístup** — jen přidání a schválení,
    bez úklidu starých čekajících záznamů.
45. **Zálohování (JSON / Google Sheets) je schované v Uživatelích**,
    ačkoliv jde o funkci celé databáze, ne uživatelů — logičtější místo
    by bylo Nastavení/Diagnostika, kde už je podobná administrace.
46. **`AppVersionsScreen` (admin, sledování verzí) se neobnovuje sám** —
    jen ručním tlačítkem „Obnovit", přitom je to přesně obrazovka, kterou
    admin nechá otevřenou během nasazení a sleduje.
47. **Sklo & Promo — appka umí zjistit, že tabulka nákupů obalů ještě
    neexistuje (chybějící migrace), ale jen se potichu omezí** — bez
    odkazu, kde/jak migraci pustit (na rozdíl od jiných míst v appce,
    která na chybějící migraci upozorní konkrétněji).
48. **Kniha jízd — nová jízda nepředvyplní „odkud" posledním „kam"**
    (řetězení jízd za sebou) — drobná úspora psaní u řidiče, který jezdí
    několik zastávek za sebou.
49. **Výčepy — kauce a termíny jsou tabulka bez mobilní karty** — na
    telefonu (terén, předávání/vracení výčepu) hůř čitelné než karta
    s velkým stavem.
50. **Exkurze — tři tabulky/jedna karta, vodorovné rolování 3×** — jinak
    dobře udělaná obrazovka (má i skutečnou migraci z prohlížeče do
    cloudu), jen by na telefonu prospěla stejná karta-místo-tabulky úprava
    jako zbytek seznamu výše.

## Poznámka k prioritě

Body 1–7 bych řadil jinak než zbytek — nejsou to vylepšení, ale buď
aktivní chyba (1–3), nebo appka, která předstírá uložení a neuloží (4–7).
Doporučuju začít tam, zbytek je skutečně „vylepšení", ne oprava.
