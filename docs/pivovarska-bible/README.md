# Pivovarská bible AI — digitální hlavní sládek

Odborná knihovna pivovarské literatury s AI (Claude), která odpovídá
s citací kniha–kapitola–strana a počítá deterministickým výpočetním modulem.

- [ARCHITEKTURA.md](ARCHITEKTURA.md): jak je to postavené a proč
- [ETAPY.md](ETAPY.md): plán po etapách a stav
- [ROZHODNUTI.md](ROZHODNUTI.md): rozhodnutí s datem a důvodem

## Odkazy pro majitele

- **Bible v appce:** https://zajic-pivovar.pages.dev/?page=bible
- **Migrace databáze** (pouští majitel): https://zajic-pivovar.pages.dev/?page=audit
  → Databázové migrace (hlavní databáze) a pod ní „Databáze bible"
- **Kdo smí do bible:** Uživatelé → u člověka Práva → „Pivovarská bible"
  (https://zajic-pivovar.pages.dev/?page=users)
- **Spustit zpracování knih hned** (jinak běží samo zhruba každé 3 hodiny):
  https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml
  → „Run workflow"
- **Kredit Anthropic API** (platí AI sládka v appce a OCR přes API):
  https://platform.claude.com/settings/billing
- **AI sládek (chatbot):** https://zajic-pivovar.pages.dev/?page=bible&sub=chat ·
  měsíční strop útraty: Bible → Správa znalostí → AI a náklady
- **Supabase projekt bible** (knihy, zpracování, náklady na AI; rozhodnutí R12):
  https://supabase.com/dashboard/project/cegrelgvkygcatupqwrx
- **Klíče projektu bible** (Secret key pro GitHub secret
  `BIBLE_SUPABASE_SERVICE_ROLE_KEY`):
  https://supabase.com/dashboard/project/cegrelgvkygcatupqwrx/settings/api-keys
- **Hlavní Supabase projekt appky:** https://supabase.com/dashboard/project/sasqexjadvlqyticxwja

## Stav

| Etapa | Stav |
|---|---|
| 0: audit a architektura | hotovo (30. 10. 2026) |
| 1: knihovna, nahrávání, stav | hotovo (31. 10. 2026) |
| 2: zpracování knih (worker) | hotovo (31. 10. 2026) |
| přesun do samostatného projektu (R12) | hotovo — migrace `20261101000000_bible_zaklad` (Databáze bible) a `20261231430000_pivovarska_bible_samostatny_projekt` (hlavní databáze) pouští majitel; úklid prázdných tabulek v hlavní databázi `20261231440000_pivovarska_bible_uklid_hlavniho_projektu` |
| 3a: čtení zpracované knihy | hotovo (1. 11. 2026) — bez migrace |
| český překlad stran (R13) | hotovo (3. 11. 2026) — migrace `20261103000000_bible_preklad` |
| 4: hledání v knihách (bez AI, R14) | hotovo (3. 11. 2026) — migrace `20261103010000_bible_hledani` |
| 4b: vícejazyčné varianty slov (slovník cs/de/en, mladina = Würze = wort) a filtry hledání (kniha, autor, rok, jazyk, druh, oblast) (R29) | hotovo (11. 11. 2026) — migrace `20261111040000_bible_hledani_filtry` |
| přehledy témat z porovnání knih (R15) | hotovo (3. 11. 2026) — migrace `20261103020000_bible_prehledy` |
| strana z knihy jako obrázek (R19) | hotovo (4. 11. 2026) — bez migrace |
| pracovní postupy krok za krokem (R20) | hotovo (4. 11. 2026) — bez migrace (tabulka přehledů, klíče `postup_…`) |
| konektor do aplikace Claude (R16) | hotovo (3. 11. 2026) — migrace `20261103030000_bible_mcp`, funkce `bible-mcp` |
| 3b: zkušenosti sládků | hotovo (4. 11. 2026) — migrace `20261104000000_bible_zkusenosti` |
| 3c: nová vydání dokumentů (R22) | hotovo (4. 11. 2026) — migrace `20261104050000_bible_vydani` |
| 5: AI sládek — chatbot v appce přes Claude API (nástroje jako konektor, citace stránek přes search_result, kroky a průběžný text, historie konverzací, strop útraty, „Najít příčiny s AI sládkem“), hledání otázkou v běžné řeči (R28) | hotovo (11. 11. 2026) — migrace `20261111030000_bible_chat`, funkce `bible-chat` |
| 6a: výpočetní modul, Výpočtová laboratoř, nástroj `vypocet` pro Claude (R23) | hotovo (4. 11. 2026) — bez migrace |
| 6b: další výpočty — chlazení a výměníky, voda a pH, scezování, chmelovar, kvašení, dokvašení, hydraulika, CIP, energie, ekonomika (R24) | hotovo (11. 11. 2026) — bez migrace |
| 7: technologie pivovaru — profil, zařízení s parametry a zdrojem, provozní postupy, víc pivovarů, převzetí tanků ze Sklepa, nástroj `profil_pivovaru` (R25) | hotovo (11. 11. 2026) — migrace `20261111000000_bible_technologie` |
| 8: receptury a várky — evidence (pevný katalog 30 hodnot s rozsahem), receptury s cíli, porovnání várek (cíle, odchylky, výtěžek, odpar, prokvašení, co chybí), nástroje `seznam_varek` a `porovnej_varky` (R26) | hotovo (11. 11. 2026) — migrace `20261111010000_bible_varky` |
| 9: rešerše z internetu — `bible_web_zdroje` (adresa, titulek, datum publikace a zjištění, důvěra 1–5, stav), Claude ukládá přes konektor vždy jako neověřené, správce ověří ve Správě znalostí (R27) | hotovo (11. 11. 2026) — migrace `20261111020000_bible_web_problemy` |
| 10: analýza problémů (oblast T) — problémy s dotčenými várkami, zjištění šesti typů (fakt se zdrojem, výpočet, zkušenost, doporučení, hypotéza, chybí), potvrzení hypotéz, trend várek v grafu; nástroje `problemy`, `zaloz_problem`, `zapis_zjisteni` (R27) | hotovo (11. 11. 2026) — stejná migrace |

## AI sládek — chatbot v appce (etapa 5)

- **Kde:** Pivovarská bible → AI sládek → Zeptat se
  (https://zajic-pivovar.pages.dev/?page=bible&sub=chat). Druhá karta je
  Hledání v knihách. V Analýze problémů je tlačítko „Najít příčiny s AI sládkem".
- **Jak odpovídá:** Claude (model z `bible_nastaveni.model_odpovedi`, dnes
  Opus 5.5) hledá v knihách, čte stránky, bere várky, profil pivovaru,
  zkušenosti sládků a výpočty — stejné nástroje jako konektor
  (`_shared/nastroje.ts`). Odpověď má pevnou strukturu (krátká odpověď,
  literatura, praxe, výpočet, doporučení, rozpory a co chybí); tvrzení z knih
  mají čísla [n], která otevřou knihu na stránce, dole zdroje s citovanou větou.
  Volitelně i web (vždy zvlášť, neověřený).
- **Na předplatné (R31):** tlačítko „Zeptat se v Claude (předplatné)" předá
  otázku do aplikace Claude (https://claude.ai/new?q=…, zadání i do schránky
  pro mobilní aplikaci) — odpovídá Claude z předplatného majitele přes konektor
  „Pivovarská bible" (R16) se stejnými nástroji. Přímo v appce předplatné použít
  nejde: pravidla Anthropicu ho dovolují jen v aplikacích Claude a v Claude Code.
- **Peníze (odpověď tady):** „Odpovědět tady (Claude API)" volá Claude API
  (klíč `ANTHROPIC_API_KEY` z app_secrets hlavní appky, do funkcí bible ho
  přenese nasazení). Řádově desetníky dolaru za odpověď; měsíční strop
  `strop_mesic_usd` (výchozí 20 USD) nastaví správce ve Správě znalostí,
  0 = odpovídání tady vypnuté. Útrata se zapisuje do `ai_naklady` (účel „chat").
  Bez kreditu appka doporučí předplatné a otázku nechá v políčku.
- **Limity:** nejvýš 8 volání Claude na otázku, po 80 s už jen odpověď bez
  dalšího hledání, tvrdý konec ve 140 s (limit platformy 150 s) — co se
  stihne, uloží se jako neúplná odpověď.
- **Konverzace** vidí a maže jen ten, kdo se ptal (`bible_konverzace`,
  `bible_zpravy`). Do logu nejde otázka, odpověď ani text knih.
- **Hledání otázkou:** když přesné hledání (všechna slova na jedné stránce)
  nic nenajde, hledá se bez výplňových slov, se začátky slov bez české
  koncovky a podle počtu nalezených slov („shoda 2 z 3 slov"). Platí pro
  obrazovku Hledání, konektor i chatbota.
- **Varianty a filtry (etapa 4b, R29):** slovník odborných výrazů hledá
  i německé a anglické varianty (mladina = Würze = wort); Filtry omezí
  hledání na knihu, autora, rok vydání, jazyk, druh nebo oblast A–T.
- Rozhodnutí: R28.

## Rešerše z internetu (etapa 9) a analýza problémů (etapa 10)

- **Rešerše:** Claude hledá na webu v aplikaci Claude (předplatné majitele,
  R16) a užitečný zdroj uloží nástrojem `uloz_web_zdroj` — adresa, titulek,
  vydavatel, datum publikace, shrnutí **vlastními slovy** (žádné dlouhé
  citace), oblasti a důvěra 1–5 (1 odborná instituce / recenzovaný článek …
  5 neověřený). Nový zdroj je **vždy neověřený**; stejná adresa se podruhé
  nezaloží. Uložené zdroje vrací `web_zdroje` (ověřené první, zamítnuté jen na
  vyžádání) s výslovným „INTERNET, ne literatura" — v odpovědi vždy zvlášť,
  s datem a stavem, nikdy nepřepíše knihy.
- **Kde v appce:** Správa znalostí → Rešerše z internetu: seznam s filtrem
  stavu a hledáním, ruční přidání (přispěvatel), **ověřit / zamítnout / vrátit
  mezi neověřené jen správce**, smazat autor nebo správce.
- **Analýza problémů** (dlaždice): problém má příznaky, pivo, oblasti a až 12
  dotčených várek (porovnání stejným kódem jako etapa 8). Zjištění nesou jeden
  ze šesti typů architektury § 6; fakt a výpočet **musí mít zdroj** (hlídá
  appka, bible-api i SQL). Hypotézu potvrdí nebo vyvrátí přispěvatel. Claude
  přes konektor: `problemy` (seznam / detail i s porovnáním várek),
  `zaloz_problem`, `zapis_zjisteni`.
- **Trend várek:** graf jedné hodnoty (zapsané nebo spočítané — výtěžek,
  odpar, prokvašení, alkohol) přes várky v čase, filtr receptury a její cíl
  jako referenční čára; bublina na najetí i z klávesnice, tabulka hodnot.
  Várka bez hodnoty v grafu není a pod grafem se řekne, u kolika chybí.
- **Zápis přes konektor** jde za uživatele, který konektor připojil
  (`pres_claude`, v appce „Claude (konektor) za …"), a jen s právem
  přispěvatele (hlídá konektor i SQL).

## Receptury a várky (etapa 8)

- **Kde:** plocha bible → „Receptury a várky" (záložky Várky a Receptury).
  Nejdřív migrace bible `20261111010000_bible_varky`.
- **Receptura:** název, styl, cíle (objem vyražené mladiny, stupňovitost,
  alkohol, IBU, barva), suroviny (slad, chmel, kvasnice, voda, přísada —
  množství, jednotka, kdy) a kroky (rmutování, scezování, chmelovar,
  chlazení, kvašení, ležení — teplota a délka).
- **Várka:** pivo, číslo (v pivovaru nejvýš jednou), datum varu, receptura
  a hodnoty z pevného katalogu (`_shared/varky-popisy.ts` = SQL
  `bible_katalog_hodnot_varky`, shodu hlídá test): sypání, voda, pH rmutu
  a mladiny, předek a poslední sladina, objemy a extrakty sladiny a mladiny
  (objemy horké), chmelovar, zakvašení, generace a dávka kvasnic, kvašení,
  sudování, ležení, hotové pivo (zdánlivý extrakt, alkohol, pH, barva,
  IBU, CO₂) a stočeno. Každá hodnota má jednotku a rozsah; prázdné pole =
  nezapsáno, nic se nedoplňuje.
- **Porovnání** (2–12 várek, od nejstarší): hodnoty vedle sebe s cílem
  receptury a odchylkou; odvozené hodnoty počítá výpočetní modul z etapy 6
  (varní výtěžek s korekcí 0,96, odpar z horkých objemů, zdánlivé
  prokvašení a alkohol podle Ballinga) jen ze zapsaných údajů; u každé
  várky vyjmenuje, co chybí a co kvůli tomu nejde spočítat. Co nejde
  spočítat u žádné várky, řekne jednou.
- **Konektor Claude:** `seznam_varek` (filtr pivo, receptura, od–do) a
  `porovnej_varky` (id várek, nebo posledních N) — stejný kód jako
  v appce; instrukce: jen uložené údaje, co chybí vyjmenovat, příčiny
  odchylek jako hypotézy s oporou v knihách a profilu pivovaru.
- **Práva:** čte každý s přístupem do bible, zapisuje a doplňuje přispěvatel
  (várku doplňuje varna, sklep i laboratoř), smazat smí autor záznamu nebo
  správce. Smazání receptury ani pivovaru várky nemaže.

## Technologie pivovaru (etapa 7)

- **Kde:** plocha bible → „Technologie pivovaru". Nejdřív migrace bible
  `20261111000000_bible_technologie` (Systém → Databázové migrace → Databáze
  bible); do té doby obrazovka řekne, kterou migraci pustit.
- **Pivovar:** název a popis provozu (typ varny, technologické schéma slovy).
  Jde založit i další pivovary; hlavní je vždy právě jeden (první založený,
  nebo ten označený) a je výchozí pro appku i Clauda.
- **Zařízení** podle druhu: varna, nádoby varny, kvasné a ležácké tanky,
  jiné tanky, čerpadla, potrubí a ventily, výměníky, chlazení, filtrace,
  stáčení, CIP, jiné. Formulář nabídne šablonu parametrů podle druhu (objem
  užitný, max. přetlak, průtok, dopravní výška, výkon…); vyplní se jen, co je
  známé — prázdné řádky se neuloží.
- **Každý parametr má zdroj:** štítek zařízení, dokumentace výrobce, změřeno,
  ze Sklepa v appce, nebo odhad (výchozí — nic se nevydává za ověřené).
  Číslo zůstává číslem (s jednotkou zvlášť), jinak se uloží jako text.
- **Převzít tanky ze Sklepa:** tlačítko načte tanky hlavní appky — Spilka =
  kvasný tank, ostatní = ležácký, objem užitný v hl z kapacity tanku (zdroj
  „ze Sklepa"). Tank, který už v profilu je (stejný název), se přeskočí.
- **Provozní postupy:** název, oblast A–T, kroky a odkud postup je.
- **Práva:** čte každý s přístupem do bible, zapisuje přispěvatel, celý
  pivovar smaže jen správce (hlídá bible-api i SQL).
- **Konektor Claude:** nástroj `profil_pivovaru` vrátí profil jako text
  s výslovným „údaje provozu, ne literatura" a se zdrojem u každého čísla;
  instrukce říká parametry provozu brát odtud, oddělit je od knih a co
  v profilu chybí, nedomýšlet.

## Výpočtová laboratoř (etapy 6a a 6b)

- **Kde:** plocha bible → „Výpočtová laboratoř", výpočty po oblastech A–T.
- **6a:** stupňovitost ↔ relativní hustota, alkohol a prokvašení (Balling),
  ředění na cílovou stupňovitost (hmotnostní bilance), varní výtěžek, teplota
  vody pro vystírku, hořkost IBU (Tinseth, víc dávek), barva (Morey, víc
  sladů), obsah CO₂ při tlaku a teplotě a přetlak pro cílový obsah CO₂.
- **6b (R24):** chlazení mladiny (teplo, výkon, chladicí voda), plocha
  výměníku (střední logaritmický rozdíl), zbytková alkalita vody (Kolbach),
  kyselina mléčná nebo fosforečná na snížení alkality, vyslazovací voda
  (bilance vody), odpar při chmelovaru a stupňovitost mladiny, dávka kvasnic,
  cukr na dokvašení v lahvi, rychlost a tlaková ztráta potrubí (Darcy–Weisbach,
  Swamee–Jain), příkon čerpadla, CIP roztok z koncentrátu, energie a náklady
  na ohřev a var, spotřební daň z piva (sazba zadaná ručně) a náklady várky.
  Materiálové hodnoty, které nejde poctivě odvodit (měrné teplo mladiny,
  součinitel prostupu tepla U, sazba daně, hustota koncentrátu), zadává člověk
  — s výchozí hodnotou a nápovědou.
- **Každý výsledek** ukáže vstupy s jednotkami, vzorec, mezikroky,
  předpoklady, rozsah platnosti, nejistotu a zdroj vzorce. Vstup mimo rozsah
  (nebo nesmysl, třeba zdánlivý extrakt nad původním) se odmítne s hláškou —
  nic se neodhaduje. „Najít v knihách" otevře hledání s dotazem výpočtu, ať je
  vidět, kde je vzorec v nahraných knihách (stránky se nevymýšlejí).
- **Kód:** čisté TS moduly bez závislostí v
  `bible/supabase/functions/_shared/vypocty/` (`zaklad.ts`, `fyzika.ts`,
  `katalog.ts`, `katalog-6b.ts`, `nastroj.ts`) — stejný kód počítá v appce
  i v konektoru. Testy (`vypocty.test.ts`, `vypocty-6b.test.ts`) stojí na
  příkladech přepočtených nezávisle (samostatný skript v Pythonu) a u hustoty
  na bodech tabulek extraktu.
- **Konektor Claude:** nástroj `vypocet` (bez id vrátí seznam výpočtů a vstupů);
  instrukce říká počítat čísla tímhle nástrojem, ne zpaměti (zásada 2).

## Nová vydání dokumentů (etapa 3c)

- **Kde:** Knihovna dokumentů → u knihy „Vydání" (správce u každé, přispěvatel
  u svých) → „Tahle kniha je novým vydáním knihy …". Nic se nemaže: starší
  vydání zůstává celé (čtení, hledání, odkazy) a dostane označení „Starší
  vydání — novější: …", nové „Nové vydání knihy …" (klepnutím na název se
  seznam posune na druhou kartu).
- **Nápověda:** stejné ISBN nebo stejný název bez označení vydání a roku →
  „Možná jiné vydání téže knihy" s tlačítkem „Propojit vydání" (u novější
  podle roku). Jen nápověda, propojit musí člověk.
- **Databáze:** sloupec `bible_dokumenty.predchozi_vydani` (nové vydání →
  předchozí) a funkce `bible_nastav_vydani` (práva jako úprava popisu, kontrola
  kruhu pod zámkem, kniha není vydáním sama sebe). Sloupec `duplikat_z`
  zůstává pro automatické „možná duplicita" ze zpracování.
- **Kde se to projeví:** Hledání v knihách označí výsledek ze staršího vydání;
  přehledy témat a pracovní postupy berou zdroje z nejnovějšího ZPRACOVANÉHO
  vydání (dokud se nové zpracovává, platí staré; změna zdrojů přehled přepíše);
  konektor Claude u staršího vydání napíše, které je novější, a instrukce říká
  dát přednost novějšímu.
- **Bez migrace** appka vydání neukazuje a všechno ostatní funguje jako dřív.

## Zkušenosti sládků (etapa 3b)

- **Tabulka** `bible_zkusenosti` (jen service role) a SQL funkce `bible_zapis_zkusenost`,
  `bible_uprav_zkusenost`, `bible_smaz_zkusenost`, `bible_hledej_zkusenosti`; práva
  hlídají znovu v SQL, edge funkce bible-api jen posílá ověřené vstupy.
- **Důvěryhodnost 1–5** (architektura § 9): úroveň 1–3 (ověřené zdroje) nastavuje a
  mění jen správce, přispěvatel zapisuje 4 nebo 5 a upravuje/maže svoje záznamy,
  správce všechny. Čtenář jen čte.
- **Hledání** bez diakritiky a po začátcích slov, filtr oblasti A–T a nejnižší
  důvěryhodnosti. Hledání v knihách je ukáže nad výsledky z knih (11. 11. 2026): přesně,
  a když nic, otázkou v běžné řeči jako u knih (`bible_hledej_zkusenosti_volne`); s filtrem
  vázaným na knihu (kniha, autor, rok, jazyk, druh) se nehledají. AI sládek je hledá nástrojem
  `hledej_zkusenosti`.
- **UI:** dlaždice Zkušenosti sládků (`src/components/bible/BibleZkusenosti.tsx`),
  API klient `src/lib/bibleZkusenostiApi.ts`.

## Zpracování knih (etapa 2)

- **Kód:** `scripts/bible/` (Python) a workflow
  `.github/workflows/bible-zpracovani.yml`.
- **Testy workeru:** `scripts/bible/tests/` (pytest).
- **Kontroly migrací** na čistém PostgreSQL: projekt bible
  `bible/supabase/testy/`, hlavní projekt `supabase/testy/bible/`.
- **Projekt bible:** schéma `bible/supabase/migrations/`, edge funkce
  `bible/supabase/functions/` (bible-api, bible-migrace; testy vitest
  v `_shared/`), nasazení `scripts/bible-nasazeni.mjs` + deploy.yml.
- **Postup u jednoho dokumentu:**
  1. Stažení originálu (jen cesta „<id dokumentu>/<jméno>") a ověření SHA-256.
  2. U PDF textová vrstva po stranách. Sken — i sken s cizí OCR vrstvou
     (obrázek přes stranu, neviditelný text), rozbité kódování fontu a celé
     DjVu — jde přes Claude. Čísla v přepisu pak nezávisle ověří Tesseract
     a vrstva souboru; neshoda znamená „ke kontrole", nic se nepřepisuje.
     Přepsané strany se ukládají průběžně: přerušený dokument (strop, čas,
     pád) naváže a za stejné strany se neplatí dvakrát.
  3. Tištěná čísla stran: číslo v záhlaví či zápatí potvrzené posunem na
     okolních stranách; štítky PDF jen tehdy, když nejsou jen pořadí listů
     a nikde neodporují tisku. Bez jistoty se nevyplní.
  4. Kapitoly z osnovy PDF (konec podle pořadí stran), jinak z nadpisů —
     číslované nadpisy v holém textu jen v navazující řadě čísel, bez obsahu
     a živého záhlaví. Strana se dělí v místě, kde kapitola začíná.
  5. Pasáže (≈ 600 tokenů, nejvýš přes 2 strany, vždy v jedné kapitole)
     a zvlášť tabulky (velké po kusech s hlavičkou) a vzorce.
  6. Zápis stran, kapitol a pasáží, počtů, stavu a nákladů (`ai_naklady`).
- **Strop útraty:** na běh 5 USD a na měsíc 20 USD (`bible_nastaveni`,
  0 = AI nepoužívat). Když dojde, dokument se skeny počká na další běh;
  dokumenty bez AI se zpracují dál.
- **Problém s účtem Claude** (došel kredit, limit útraty, odmítnutý klíč,
  neznámý model, příliš mnoho požadavků): AI se pro zbytek běhu vypne,
  dokumenty se skeny počkají se zprávou, co s účtem udělat, a ostatní se
  zpracují dál; běh pak skončí chybou, ať je problém vidět (dřív zastavil
  celý běh — 31. 10. 2026 tak 2 skenované strany z 327 zdržely i jinou knihu).
  Knihu, o které už je známo, že má skeny (průběh nebo počty z dřívějška)
  a nemá je všechny přepsané, worker stáhne, jen když AI teď půjde: klíč je,
  strop útraty nedošel a účet projde jedním levným požadavkem za běh (jen
  text, desítky tokenů; po úspěšném přepisu už se neověřuje). Jinak počká bez
  stažení a jen se jí obnoví čas průběhu — přenosy tarifu Free by jinak každé
  3 hodiny stahovaly celé knihy zbytečně. Kniha s přepsanými všemi skeny AI
  nepotřebuje a dokončí se i při vyčerpaném stropu.
- **Procenta v knihovně:** worker během práce zapisuje průběh do
  `postup.prubeh` (fáze, stran hotovo/celkem, přepis skenů, čas) nejvýš
  jednou za 15 s; knihovna ho ukazuje v procentech a sama se obnovuje (při
  zpracování po 20 s; u čekajících knih po minutě jen 90 min po plánovaném
  běhu, jinak po 10 min; ne na skryté záložce, při nahrávání ani při
  rozepsaném popisu). Když se worker 20 min neozve, připíše „bez zprávy".
  U čekající knihy slibuje konkrétní běh, jen když je jistý — GitHub plánované
  běhy zdržuje často o hodiny (31. 10. 2026 začal běh pro 15:17 UTC v 17:15):
  „ve frontě" (jiná kniha se právě zpracovává a tuhle běh ještě neprošel),
  „další běh podle plánu v HH:MM" (tenhle běh ji už prošel — odložil ji, nebo
  ji dokončil a správce ji vrátil), jinak jen plán (cron `17 */3 * * *` UTC)
  s upozorněním na zdržení. „Už přepsáno X z Y skenů" píše jen u skutečně
  přepsaných stran (ty se znovu neplatí).
- **Pojistka velikosti databáze bible:** `limit_db_mb` (výchozí 450 MB;
  Supabase Free přepne nad 500 MB databázi bible jen pro čtení). Nad limitem
  další knihy počkají se zprávou u dokumentu.
- **Fronta:** dokument zkoušený v běhu se ve stejném běhu znovu nebere,
  po třech nepovedených pokusech je „chyba"; „Zpracovat znovu" vynuluje
  pokusy. Pozastavit jde i rozpracovaný dokument (worker přestane).
- **Závislosti workeru** jsou zamčené i s hashi (`scripts/bible/requirements.txt`,
  pro testy `requirements-testy.txt`); nové verze jen přes PR s testy:
  `uv pip compile requirements.in --python-version 3.12 --python-platform x86_64-manylinux_2_28 --generate-hashes --no-header --exclude-newer <datum před 2 týdny> -o requirements.txt`
  (a totéž pro `requirements-testy.in`; starý výstup předem smazat).
- **Do veřejného logu** jdou jen ID dokumentů, počty a stavy.

## Čtení knihy (etapa 3a)

- **Kde:** Knihovna dokumentů → u zpracované knihy (hotovo / ke kontrole)
  tlačítko „Číst". Čtečka má tři pohledy: Obsah (kapitoly), Čtení (strana
  po straně, skok na stranu) a Tabulky a vzorce.
- **Brána:** akce `kniha` (dokument, strom kapitol, rejstřík listů bez
  textu), `listy` (text nejvýš 3 listů, strop 150 000 znaků — vždy aspoň
  jeden celý list) a `objekty` (tabulky, vzorce a popisky = pasáže s
  druhem, po stovkách s náhledem). Všechny pro roli „čte" a jen u knihy ve
  stavu hotovo / ke_kontrole — jinak 409 `nezpracovano` se stavem (worker
  zapisuje kapitoly a pasáže po částech). Čte se službou brány bez nové
  migrace; rejstříky po stránkách (strop PostgRESTu 1000 řádků).
- **Místo v knize:** „s. 158" jen s tištěným číslem (může být i římské
  a v knize se opakovat — skok bere první výskyt), jinak „list 170",
  u DOCX, EPUB, TXT a tabulek „část 3". Kapitoly mají rozsah v listech
  souboru.
- **Text:** přepis skenu a převedené soubory se skládají z jednoduchého
  markdownu (nadpisy, tabulky ze svislých čar, vzorce `$$…$$` a `$…$`,
  `[nečitelné]`) do React elementů, nikdy přes innerHTML. Textová vrstva
  PDF zůstává syrový text (znaky „|", „#", „$" v ní platí doslova).
  Vzorce se zatím ukazují jako LaTeX v neproporcionálním písmu.
- **Soukromí a autorská práva:** text zůstává jen v paměti čtečky (nic do
  localStorage, IndexedDB ani logů), jeden požadavek vydá jen pár listů,
  export celé knihy appka nenabízí. Originál jde otevřít tlačítkem
  „Originál".
- **Digitální PDF** nemají tabulky ani vzorce rozpoznané zvlášť (jen přepis
  skenů a převedené soubory) — jsou v textu strany, na obrázku strany nebo
  v originále.
- **Strana z knihy (4. 11. 2026):** u PDF ukáže čtečka nad textem stranu
  tak, jak vypadá v originále (nákresy, tabulky, fotky) — přepínač „Strana
  z knihy", volba se pamatuje v prohlížeči. Vykresluje pdf.js (líně načtený
  kus, start appky nezvětšuje; verze „legacy" kvůli starším iPhonům) přímo
  z originálu v úložišti: stahují se jen kousky souboru (HEAD na velikost,
  pak hlavička Range), protože úložiště neukazuje prohlížeči hlavičky
  rozsahů a vestavěné načítání pdf.js by stáhlo celou knihu. Podepsaný
  odkaz (600 s) se obnovuje sám. Dekodéry skenů (JPEG 2000, JBIG2) kopíruje
  build do `/pdfjs/wasm/`. Tlačítko „Originál" při čtení otevře PDF rovnou
  na čtené straně (`#page=`).
- **Dodatek pro rychlé otevření strany (11. 11. 2026, R30):** pdf.js si při
  prvním otevření knihy hledá poslední stranu, a u „plochého" stromu stran
  (všechny strany pod jedním uzlem, typicky skeny) čte slovník každé strany
  — na 40MB knize 22–26 MB a stovky dotazů. Worker proto ke každému
  zpracovanému PDF postaví malý dodatek (`scripts/bible/dodatek.py`,
  tabulka `bible_dodatky`, migrace `20261111050000_bible_dodatky`):
  přírůstkovou aktualizaci PDF s vyváženým stromem stran, pár kB. bible-api
  ho pošle s prvním odkazem a appka ho přilepí za originál jen v paměti —
  otevření strany pak stojí pár set kB (změřeno na umělé 40MB knize:
  26 MB / 402 dotazů → 0,3 MB / 5 dotazů). Originál se nemění. Starší knihy
  worker doplní čtením jen malých kousků souboru (stovky kB až jednotky MB
  na knihu, ne celé soubory). Bez migrace nebo dodatku čte čtečka holý
  originál jako dřív; kdyby si pdf.js s dodatkem neporadilo, otevře knihu
  znovu bez něj.
