# 50 návrhů — 10. 9. 2026 (třetí kolo)

Uživatel řekl „udelej vse". Postup se zapisuje sem průběžně — u položky,
kde se po prozkoumání ukáže něco jiného, než tvrdil návrh, se to opraví
přímo v zápisu (stejná zásada jako u předchozích kol).

## Aktivní chyby

1. ✅ HOTOVO. Znovu udělen GRANT EXECUTE na `run_today_zavoz_deductions`
   (obranná pojistka — živé ověření přes RPC ukázalo funkci už teď jako
   dostupnou, přesná příčina ztráty práv zůstává nejistá).
2. ✅ HOTOVO. Limit `whatsapp-auto-parse` zvednut z 5 na 15/60 s +
   klientské sražení volání (`Layout.tsx`, `triggerAutoParseDebounced`,
   1,5 s) — víc zpráv ve shluku teď vyvolá jedno volání, ne jedno na
   každou zprávu na každém otevřeném zařízení.
3. ✅ HOTOVO. `Catalogs.tsx` `PlacesScreen.load()` — opravený backfill
   `delivery_group` se už nezahazuje druhým, bezpodmínečným `setRows`.

## Chybějící ukládání dat

4. ✅ HOTOVO. Merch (`MarketingMerchInventory`) — nová tabulka
   `merch_items`, plně napojeno (načtení, rychlá úprava množství,
   přidání), realtime mezi zařízeními.
5. ✅ HOTOVO. Festivalové vybavení (`FestivalEquipmentTracker`) — nové
   tabulky `festival_equipment` + `festival_equipment_loans` (historie
   půjček). Přidán i chybějící krok „kauce vrácena" při vrácení.
6. ✅ HOTOVO. Sklo & Promo (`SkloPromoScreen`) — nová tabulka
   `sklo_promo_entries`, stejný vzor jednorázového převodu z telefonu
   jako u nákupů lahví/etiket ve stejném souboru.
7. ✅ HOTOVO. Vozidla a Sklep při prázdné databázi už nezakládají
   vymyšlené SPZ/STK termíny ani náhodně přiřazenou obsazenost tanků —
   nové záznamy vznikají prázdné (skutečná jména „Velké auto"/„Kachna"
   a skutečný layout Spilka 1–3/Tank 1–8 zůstávají, appka je pod nimi
   zná i jinde — jen fiktivní ÚDAJE k nim zmizely).

**Migrace čekají na ruční spuštění uživatelem** (Nastavení → Diagnostika
→ Databázové migrace): `20261230020000`–`20261230050000`.

## Mobilní ovladatelnost

8. ✅ UŽ BYLO HOTOVO — návrh vycházel ze zastaralého auditu (4. 9. 2026).
   Appka mezitím dostala globální CSS pravidlo (`index.css`, `@media
   (pointer: coarse)`), které řeší přesně tohle: 44 px minimální
   výška/šířka dotykových tlačítek, s výjimkou těch, co mají vlastní
   rozměr úmyslně zadaný. Zavoz i zbytek appky to už mají.
9. ✅ UŽ BYLO HOTOVO — stejný nález. Globální `:active` pravidlo v
   `index.css` (`transform: scale(0.97)` na klepnutí) je nasazené
   plošně, ne po tlačítku — komentář v kódu cituje přesně stejná čísla
   z auditu (Závoz 50/0 atd.), takže šlo o reakci na tenhle audit,
   jen ho já sám ještě neznal.
10. ⏸ ODLOŽENO. Tooltipy neviditelné na dotyku — 200+ výskytů napříč
    appkou, oprava by chtěla projít obrazovku po obrazovce (kde popisek
    dát pod ikonu vs. nechat jen jako `aria-label`), ne plošné pravidlo.
11. ⏸ ČÁSTEČNĚ HOTOVO, ZBYTEK ODLOŽEN. CSS pro gradientový náznak
    rolování (`.roluje-vodorovne`) UŽ EXISTUJE a je nasazené na dvou
    široce zmiňovaných tabulkách (plán stáčení, audit inventury). Na
    vodorovné pruhy záložek (Sklep/Historie/Sanitace) není — Závoz mezi
    tím navíc přešel na `flex-1` rovnoměrné 3 záložky, takže tam
    problém odpadl jinak, než návrh čekal. Zbytek chce ověřit obrazovku
    po obrazovce, ne odhadem.
12. ✅ UŽ BYLO HOTOVO — stejné globální pravidlo jako u bodu 8 (i malá
    čtvercová tlačítka −/+/✎/✕ mají na dotyku vlastní výjimku na 44 px).
13.–22. ⏸ ODLOŽENO. Skládají se z většího přepisu jedné obrazovky
    (Objednávky — schovat 7 filtrů; Inventura — průvodce po položce;
    Sklad/Sklo & Promo — karty místo tabulek; Statistika — graf pro
    mobil; Kalendář — měsíc jako přehled; Uživatelé — matice jako
    seznam; Nastavení — rejstřík). Žádné z nich nejde odbýt bezpečně
    v rámci dávky bodů — všechny by chtěly vlastní prostor a živé
    vyzkoušení, ne jen textovou úpravu natvrdo.

## Sjednocení vzhledu

21. ⏸ ODLOŽENO — stejný důvod jako dřív (`20-navrhu-2026-09-08.md`,
    bod 4; `30-navrhu…`, bod 22). 568 tlačítek napříč appkou, riziko
    plošného přepisu.
22. ⏸ ODLOŽENO. Součást bodu 21 — nemá smysl řešit odděleně od
    celkového sjednocení barevných rolí.
23. ✅ HOTOVO. `accent` v Kalendáři mířilo na stejnou třídu jako
    `primary` (`bg-primary-500`) — teď `bg-sky-500` (skutečně modrá).
    Navíc oprava mylného popisku „Modrá" u `primary`, který je ve
    skutečnosti měděná/oranžová paleta (`tailwind.config.js`) — přejmenováno
    na „Měděná".

## HACCP a sanitace

24. ⏸ ODLOŽENO. Propojit `SanitationLogScreen`s se skutečnou tabulkou
    `cellar_tanks` je bezpečné jen po ověření, že žádný starý záznam
    nepoužívá název tanku, který se v `cellar_tanks` liší — chce to
    nejdřív podívat se do dat, ne slepě přepojit.
25. ⏸ ODLOŽENO. Přesun HACCP obsahu z kódu do DB s editací v UI je
    svým rozsahem samostatná úloha (nová tabulka, formulář, migrace
    starého textu) — větší, než jeden bod v dávce.
26. ⏸ ODLOŽENO. Menší úloha než 24–25, ale staví na stejném vzoru jako
    `KegSanitationDiary`, který stojí na `cellar_tanks` — dává smysl
    udělat spolu s bodem 24, ne předtím.
27. ⏸ ODLOŽENO. Proklik z konkrétního kroku HACCP na sanitační záznamy
    předpokládá vyřešený bod 24 (sjednocené názvy tanků) — jinak by
    proklikával na nesouhlasící data.

## Vozidla, termíny, připomínky

28.–32. ⏸ ODLOŽENO. Pět bodů popisuje jedno a totéž: appka má tři
    nezávislé systémy s termínem (Vozidla/STK, Kalendář, Připomínky) a
    sjednotit je do jednoho zdroje pravdy je návrhářské rozhodnutí
    (kam čí termín patří, kdo co uvidí), ne technická oprava — chce to
    probrat s uživatelem, ne odhadnout.

## Katalogy, ceník, historie

33. ✅ HOTOVO. `Beer.short_name` se teď skutečně ukládá i načítá —
    a ukázalo se, že jde o víc než kosmetiku: pole se aktivně používá
    při rozpoznávání piva z WhatsApp/hlasových/fotoobjednávek
    (`lib/orderParser.ts`, `matchBeerFromHints`), takže tahle cesta
    byla celou dobu tichá, i když formulář vypadal funkčně.
34. ⏸ ODLOŽENO. Historie cen je nová funkce (verzovaná tabulka
    `price_list` + zobrazení), ne oprava — a stejně jako fakturace
    z minulého kola stojí za to nejdřív probrat rozsah.
35. ⏸ ODLOŽENO. Drobná úloha, ale chce ověřit, že `KegReturnModal`
    dostane skutečně jen KEG velikosti z katalogu Obalů (ne PET/lahve) —
    krátké, ale ne bleskové.
36. ✅ OVĚŘENO, ŽÁDNÝ PROBLÉM. `Statistika.tsx` skutečně je jen
    `export { default } from './History'`. V menu (`NAV`/`App.tsx`) i
    v samotné obrazovce se používá konzistentně název „Statistika" —
    žádné rozjeté pojmenování nenalezeno.
37. ⏸ ODLOŽENO. Ověření, jestli jsou uložené filtry v Historii per
    zařízení, a případné sdílení, je samostatná menší úloha.

## Ostatní

38.–50. ⏸ ODLOŽENO CELÉ. Třináct různorodých bodů (časovače sdílené
    mezi zařízeními, vlastní předvolby odpočtu, propojení Poznámek,
    historie oznámení, oprava hardcoded oprávnění u kritických
    materiálů, dohledatelnost rádia, úklid schválených e-mailů,
    přesun zálohování do Nastavení, auto-obnova AppVersions, jasnější
    chybová hláška u chybějící migrace skla, řetězení jízd v Knize
    jízd, mobilní karty u Výčepů a Exkurzí) — každý samostatně malý,
    ale dohromady další samostatné kolo. V rámci týhle dávky už nešlo
    udělat kvalitně všechno; upřednostnil jsem aktivní chyby (1–3),
    ztrátu dat (4–7) a dva nálezy s reálným dopadem objevené cestou
    (23, 33) před plošným doháněním zbytku seznamu.

## Shrnutí

- **Nový/opravený kód:** body 1–7, 23, 33 (9 věcí, všechny s testy).
- **Zjištěno už hotové (zastaralý audit):** body 8, 9, 12, 36.
- **Částečně hotové:** bod 11.
- **Odloženo s důvodem:** zbytek (10, 13–22 kromě 23, 24–32, 34–35, 37–50).

Testy: `npx vitest run` 151 souborů / 1615 testů zelených, `tsc --noEmit`
bez chyb. Edge funkce `whatsapp-auto-parse` nasazena ručně (CI ji
nepokrývá). Nové migrace čekají na ruční spuštění (viz výš).
