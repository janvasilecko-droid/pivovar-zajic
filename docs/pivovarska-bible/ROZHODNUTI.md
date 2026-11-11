# Pivovarská bible AI — rozhodnutí

Každé rozhodnutí má datum, důvod a co by ho změnilo.

## R1 — AI je Claude (Anthropic API), ne Gemini (30. 10. 2026)
**Rozhodl majitel:** „chci aby to bylo napojené na Claude", „ne Gemini".
- **Modely:** odpovědi `claude-opus-5-5`, levnější přepínač
  `claude-sonnet-5-5`, pomocné kroky (OCR, překlad dotazu, kontext pasáží)
  `claude-haiku-5-5`.
- **Klíč:** `ANTHROPIC_API_KEY` v app_secrets, existuje od 21. 7. 2026.
- **Další důvody:**
  - bezplatné Gemini nejde podle podmínek použít v aplikaci pro uživatele
    v EHP;
  - bezplatné tarify mohou trénovat na vstupech, což by porušilo autorská
    práva knih;
  - bezplatné kvóty jsou malé (Gemini Flash ~20 dotazů denně).
- Stávající funkce appky (čtení objednávek) zůstávají beze změny.

## R2 — Zpracování knih běží v GitHub Actions, ne v edge funkcích (30. 10. 2026)
- **Důvod:** edge funkce mají limit 2 s CPU, 256 MB a 150 s. GitHub Actions
  jsou u veřejného repa zdarma.
- **Podmínka:** do logu nesmí obsah knih (logy jsou veřejné) a nenahrávají se
  žádné artefakty.
- **Změnilo by to:** převod repa na soukromé, nebo vlastní server.

## R3 — Přístup ke knihám je fail-closed (30. 10. 2026)
- **Kdo má přístup:** admin, šéf, sládek, boss a manažer. Ostatní jen
  s povoleným modulem „Pivovarská bible" v Uživatelé → Práva.
- **Proč fail-closed:** zbytek appky je záměrně fail-open (čtení mají všichni
  přihlášení). Soukromé dokumenty a autorská práva to nedovolují.
- **Jak:** databázová funkce `bible_pristup()` při chybě vrací „bez přístupu".

## R4 — Texty knih nejdou do offline mezipaměti telefonu (30. 10. 2026)
- **Důvod:** sdílený Supabase klient ukládá každé čtení do IndexedDB a nikdy ho
  neuklízí.
- **Jak:** bible má vlastního klienta s `accessToken` (stejné přihlášení, bez
  mezipaměti).

## R5 — Vektorové hledání až po měření (30. 10. 2026)
- **Důvod:** Anthropic vlastní embedding model nemá. Vyhledávání (Etapa 4) proto začne
  fulltextem, přesnými termíny a vícejazyčnými variantami dotazu od Haiku.
- **Po měření (Etapa 4):** zlatá sada otázek rozhodne mezi Voyage AI (doporučuje ho
  Anthropic, nový účet) a OpenAI (klíč existuje).
- **Kdy vektory nebudou:** když měření nepřinese zlepšení.

## R6 — OCR skenů: Claude Haiku + kontrola Tesseractem (30. 10. 2026)
- **Postup:** digitální strany se berou z textové vrstvy (zdarma a přesně),
  skeny přepíše Claude Haiku 5.5. Při neshodě čísel s Tesseractem dostane
  strana stav „ke kontrole", nic se nepřepisuje potichu.
- **Proč ne Mistral OCR:** ve výchozím stavu trénuje na datech a znamená
  dalšího poskytovatele.
- **Změnilo by to:** výsledek pilotu, kdyby Haiku na skenech chyboval.

## R7 — Originály knih v soukromém bucketu Supabase (30. 10. 2026)
- **Důvod:** dnešní knihovna (≈ 412 MB) se vejde i do tarifu Free (1 GB).
  Druhá kopie zůstává ve složce majitele.
- **Změnilo by to:** soubory nad 50 MB (rozdělení v prohlížeči, Etapa 1b)
  nebo růst knihovny (Supabase Pro nebo Cloudflare R2).

## R8 — Migrace bible se testují na čistém PostgreSQL (31. 10. 2026)
- **Důvod:** přístup ke knihám je fail-closed a chyba v politice RLS by se
  v appce neprojevila. Uživatel by jen viděl, co nemá.
- **Jak:** `supabase/testy/bible/` obsahuje napodobený Supabase (role, auth,
  storage) a kontroly. Job `migrace` v `bible-zpracovani.yml` pustí migrace
  bible dvakrát za sebou a pak kontroly přístupu, pojistek, fronty a hledání.
  Zkouška s úmyslně otevřenou politikou čtení kontrolou neprošla.

## R9 — Zápis zpracování nahrazuje odvozená data (31. 10. 2026)
- **Jak:** kapitoly a pasáže dokumentu se při novém zpracování smažou
  a zapíšou znovu, strany se přepíšou. Vždy jen s filtrem dokumentu.
- **Přepisy skenů se neplatí dvakrát:** strana přepsaná přes Claude zůstává
  v `bible_strany` s modelem a verzí promptu (`ocr_verze`); nové zpracování
  se stejným modelem a verzí ji použije znovu. Nová verze promptu = nový přepis.
- **Proč to neporušuje „data nemazat":** jsou to odvozená data, která
  vzniknou znovu z originálu v bucketu. Data pivovaru, katalog knih
  a náklady se nemažou.

## R10 — Hledání poběží přes SECURITY DEFINER RPC, ne s RLS volajícího (31. 10. 2026)
- **Důvod:** pod RLS PostgreSQL nepoužije index hledání (operátor `@@` ani
  pg_trgm nejsou LEAKPROOF) — hledání by procházelo celou tabulku pasáží.
  Ověřeno plánem dotazu v `supabase/testy/bible/10_kontroly.sql`.
- **Jak (Etapa 4):** `bible_hledej` jako SECURITY DEFINER se `SET search_path = ''`
  a na začátku `IF NOT public.bible_smi_cist() THEN RETURN`. Politiky RLS
  volají kontrolu přístupu jako `(SELECT …)`, takže se vyhodnotí jednou na dotaz.

## R11 — Závislosti workeru zamčené i s hashi (31. 10. 2026)
- **Důvod:** job zpracování drží service-role klíč a klíč Claude. Nezamčená
  tranzitivní závislost by se při každém plánovaném běhu stáhla v nejnovější
  verzi bez testu (riziko podvržené verze na PyPI).
- **Jak:** `requirements.txt` je zámek celého stromu s hashi (generuje `uv pip
  compile`, verze aspoň 2 týdny staré), instalace `--require-hashes --no-deps`.
  pytest je jen v `requirements-testy.txt` pro job testy.

## R12 — Bible v samostatném projektu Supabase (31. 10. 2026)
- **Rozhodnutí majitele:** „free, ať je supabase pro aplikaci samostatně
  a samostatná supabase pro toho boota". Projekt bible:
  https://supabase.com/dashboard/project/cegrelgvkygcatupqwrx (vlastní Free
  organizace — kvóty úložiště a přenosů platí pro celou organizaci).
- **Důvod:** knihy (≈ 412 MB) by na tarifu Free ujídaly 1 GB úložiště
  a 500 MB databáze appky pivovaru.
- **Přihlášení zůstává v hlavní appce.** Že Supabase přijme token jiného
  Supabase projektu (third-party auth), potvrzené není — proto brána:
  edge funkce bible-api (verify_jwt = false) ověří token v hlavním projektu
  (`/auth/v1/user` a `bible_overeni()`: schválený e-mail, heslo, limit,
  `bible_pristup()`) a pak pracuje service rolí. Databáze bible je pro
  prohlížeč zavřená, zápis jen přes SQL funkce, které práva hlídají znovu.
  Fail-closed: výpadek hlavního projektu = odmítnuto.
- **Migrace bible** (`bible/supabase/migrations`) spouští majitel v appce:
  Systém → Databázové migrace → Databáze bible. Edge funkce bible-migrace
  vezme SQL z nasazeného buildu (`migrace-bible-sql.json`) a pustí ho
  v jedné transakci přes `SUPABASE_DB_URL`, včetně zápisu do evidence.
- **Nasazení funkcí:** deploy.yml, krok „Edge funkce projektu bible", token
  `SUPABASE_BIBLE_ACCESS_TOKEN`, secret funkce `HLAVNI_ANON_KEY` (veřejný
  klíč hlavní appky) nastaví CI.
- **Worker:** data v projektu bible (`BIBLE_SUPABASE_SERVICE_ROLE_KEY`),
  klíč Claude z `app_secrets` hlavní appky.
- **Zálohy:** `zalohy/bible/` (katalog, nastavení, náklady, evidence migrací).
- **Hlavní projekt:** migrace `20261231410000` a `20261231420000` zůstávají
  (běžely, přesun by v Auditu vyrobil „osiřelé" migrace). Tabulky bible tam
  zůstaly prázdné; zápis do nich zavřela `20261231430000`. Majitel smazání
  odsouhlasil 31. 10. 2026 („ano") → `20261231440000` je smaže i s funkcemi
  nad nimi, jen když jsou prázdné a nastavení má výchozí hodnoty (jinak
  nesmaže nic). Zůstává `bible_pristup()` (volá ji `bible_overeni()`),
  `bible_smi_*` a prázdný bucket `knihovna` (SQL ho smazat nedovolí).
- **R10 platí dál ve smyslu:** hledání poběží v edge funkci projektu bible
  service rolí (bez RLS, takže s indexem); práva hlídá brána.
- **Rozběhnuté nahrání po smazání:** podepsaný odkaz platí 2 h a odvolat nejde.
  Smazání nebo zrušení nahrání v té době si cestu zapamatuje
  (`bible_smazane_soubory`) a bible-api soubor, který tam ještě dorazí, po
  vypršení odkazu smaže. Maže se jen na zapamatovaných cestách (nikdy nic
  hádaného podle chybějícího řádku — po obnově ze zálohy by to smazalo knihy).
  Kapacita ve Správě ukazuje soubory bez záznamu.
- **Vědomé riziko:** projekt bible dostává token přihlášení hlavní appky
  (platí asi hodinu). Kdo by mohl nasadit kód do projektu bible, mohl by ho
  zneužít. Proto: v organizaci bible jen majitel (se 2FA) a token
  `SUPABASE_BIBLE_ACCESS_TOKEN` jen na projekt bible. Lepší by byl krátký lístek
  jen pro bibli vydaný hlavním projektem (sdílený podpis) — až bude potřeba.
  Stav 31. 10. 2026: uložený token je bez vypršení („never"), tedy nejspíš
  starší typ s přístupem k celému účtu (omezené tokeny vyprší nejpozději za
  rok). Omezení na projekt bible tak zatím neplatí; riziko navíc je malé,
  protože ve stejných GitHub secrets už je `SUPABASE_ACCESS_TOKEN` hlavního
  projektu. Nahradit omezeným tokenem jde kdykoli (CLAUDE.md).
- **Uspání projektu na Free:** Supabase uspí Free projekt po týdnu bez provozu.
  Worker se každé 3 hodiny ptá na frontu (`bible_dokumenty`, s klíčem
  `BIBLE_SUPABASE_SERVICE_ROLE_KEY`), což je provoz databáze, takže by se
  projekt uspat neměl. Když se přesto uspí, přijde e-mail a appka hlásí
  „Databáze bible neodpovídá"; obnoví se na stránce projektu.
- **Funkce v migracích bible** musí mít vlastní `REVOKE … FROM PUBLIC, anon,
  authenticated` (výchozí EXECUTE pro PUBLIC jde vypnout jen globálně, což by
  zasáhlo i rozšíření). Hlídá to `bible/supabase/testy/10_kontroly.sql`, které
  CI pouští už na pull requestu — migraci jde z appky pustit hned po nasazení.

## R13 — Český překlad stran (3. 11. 2026)

- Majitel: „je to anglicky, musí tam být i překlad do češtiny".
- Worker po zpracování fronty přeloží strany hotových cizojazyčných knih do
  češtiny (`scripts/bible/preklad.py`, model `model_prekladu`, výchozí
  `claude-sonnet-5-5`) stejným klientem jako přepis skenů — přes předplatné
  Claude, kredit majitel platit nechce („žádný kredit… nebudu platit kredity").
- Originál zůstává; překlad je ve sloupci `bible_strany.preklad`. Platí jen
  k textu, ze kterého vznikl (`preklad_zdroj` = md5 textu, DB počítá
  `preklad_platny`): po novém zpracování se strana přeloží znovu.
- Čísla v překladu se porovnají s originálem; nesedí-li, překlad dostane
  upozornění „ověř v originále" (`preklad_kontrola`). Čtení v appce ukáže
  češtinu, originál jedním klepnutím.
- Migrace `20261103000000_bible_preklad` (spouští majitel). Bez ní worker
  překlad přeskočí a bible-api vrací originál jako dřív.

## R14 — Hledání bez AI, chatbot zatím ne (3. 11. 2026)

- Majitel: „po překladu pokračuj automaticky v bibli a chatbotovi", k chatbotu
  ale „Zatím jen hledání" a u bezplatného chatbota nebo konektoru do aplikace
  Claude „zatím nic".
- Chatbot v appce by musel volat Claude přes API: token předplatného podle
  pravidel Anthropicu nesmí obsluhovat dotazy uživatelů aplikace
  (https://code.claude.com/docs/en/legal-and-compliance — „route requests
  through … Max … plan credentials on behalf of their users" není povoleno).
- Hledání (etapa 4, první část): `bible_hledej` (migrace
  `20261103010000_bible_hledani`) — fulltext bez diakritiky s předponami
  v pasážích originálu i v platném českém překladu stran, jen zpracované knihy.
  bible-api `hledej` vrací úryvek a místo (kniha, kapitola, strana), čtečka se
  otevře na stránce. Vektory a vícejazyčné varianty dotazu až s AI.
- Dlaždice „Odborný chatbot" je zatím „Hledání v knihách".
- **Odklad chatbota skončil 11. 11. 2026 — viz R28** (chatbot v appce přes
  Claude API se stropem útraty; hledání zůstalo jako druhá karta).

## R15 — Přehledy témat z porovnání knih (3. 11. 2026)

- Majitel: „když zadám chmelovar, vyhledáš data z těch knih, porovnáš je a
  napíšeš to nejlepší o chmelovaru", „s tím, že tam budou odkazy na knihy",
  „až budou načteny všechny knihy a přeloženy, případně pokud se načte nová
  kniha, tak to doplnit o nová fakta". Zvolil „obě" (přehledy v appce +
  konektor do aplikace Claude, R16).
- Worker (`scripts/bible/prehledy.py`) po zpracování a překladu — jen když nic
  nečeká — pro ~36 témat (oblasti A–T) najde pasáže (`bible_hledej`, dotazy
  česky/anglicky/německy), Claude (`model_prehledu`, Opus, předplatné) z nich
  napíše přehled s citacemi [n]. Z vlastních znalostí nic nepřidává.
- Kontrola: citace mimo zdroje se odstraní, čísla mimo zdroje → „ověř".
  Přehled se přepíše jen při změně zdrojů (otisk); `prehledy_aktualni` řídí
  plánovaný běh.
- Tabulka `bible_prehledy` (migrace `20261103020000_bible_prehledy`): text
  s citacemi + zdroje (kniha, list) bez textu knih. Appka: Hledání v knihách →
  Přehledy témat, citace otevřou čtečku na stránce.

## R16 — Konektor do aplikace Claude (3. 11. 2026)

- Majitel zvolil „obě" (přehledy v appce + konektor). Claude v aplikaci majitele
  (jeho předplatné, mobil i počítač) si přes konektor hledá v knihách, čte
  stránky a přehledy a odpovídá s odkazy na knihu a stránku v appce.
- Pravidla Anthropicu to dovolují: uživatel se svým účtem v nativní aplikaci
  Claude; náš server jen poskytuje nástroje (nic nesměruje přes cizí předplatné).
- Vzdálený MCP server = edge funkce `bible-mcp` v projektu bible (Streamable
  HTTP, JSON odpovědi). Nástroje: `hledej_v_knihach`, `precti_stranu`,
  `prehled_tematu`, `seznam_knih` — jen čtení, jen zpracované knihy.
- Přihlášení OAuth 2.1 s PKCE S256: vydavatel = appka (metadata
  `public/.well-known/oauth-authorization-server`), registrace (DCR) jen pro
  adresy návratu Claude, „Povolit" na `/claude-pripojeni` v appce → bible-api
  `mcp_povolit` (přihlášení a přístup ověří brána, fail-closed). Přístupový
  token 1 h, obnovovací 30 dní s rotací (zneužití starého zruší připojení),
  v DB jen sha256. Odpojení: Správa znalostí → Aplikace Claude.
- Migrace `20261103030000_bible_mcp` (spouští majitel). Odkazy z odpovědí:
  `?page=bible&sub=kniha:<id>:<list>`.

## R17 — Oblasti A–T doplní Claude podle kapitol (4. 11. 2026)

- Majitel poslal Správu znalostí s nulami u všech oblastí a „zatím nehledej
  další zdroje, ale pracuj na současné bibli podle původního promptu".
- Worker (`scripts/bible/oblasti.py`) po překladu zařadí knihy BEZ oblastí:
  Claude (předplatné) dostane název, autora a seznam kapitol (žádný text knihy)
  a vybere oblasti, kterými se kniha podstatně zabývá. Ruční zařazení má
  přednost (zapisuje se jen ke knize s prázdnými oblastmi), v `postup`
  zůstane `oblasti_auto`; appka u knihy ukáže „určil Claude".

## R18 — Český překlad názvů kapitol (4. 11. 2026)

- Doplněk R13: obsah knihy (názvy kapitol) byl i po překladu stran anglicky.
- Worker (`scripts/bible/kapitoly_preklad.py`) po překladu stran přeloží názvy
  kapitol po dávkách (120); Claude vrací seznam stejné délky — jinak se dávka
  neuloží. Česká kniha dostane prázdný název („nepotřebuje"). Zápis jen
  UPDATE (`bible_kapitoly_nazvy`), kapitolu smazanou novým zpracováním
  nevzkřísí. Hledání ukazuje český název kapitoly.
- Migrace `20261104020000_bible_kapitoly_preklad` (spouští majitel); bez ní
  bible-api vrací obsah jako dřív.

## R19 — Strana z knihy jako obrázek (4. 11. 2026)

- Majitel: „Můžeš z těch knih dát k tomu i obrázky? Přece jen text je takovej
  ne vše říkající."
- Čtečka u PDF vykreslí stranu přímo z originálu v úložišti (pdf.js v prohlížeči,
  jen potřebné kousky souboru přes Range). Nic se neukládá ani nekopíruje — žádné
  nové soubory, žádná migrace; obsah knihy zůstává jen v prohlížeči čtenáře.
- Proč ne obrázky stran předem ve workeru: stovky MB na knihu v úložišti.
- Slabina: první strana knihy se slovníky stran rozházenými po souboru stojí
  jednotky až desítky MB (pdf.js je načte všechny); vyřešeno dodatkem (R30).

## R20 — Pracovní postupy krok za krokem (4. 11. 2026)

- Majitel: „Najdi třeba i konkrétní návod na vaření piva nebo obsluhu varny,
  všechno co může mít souvislost s vařením a prací v pivovaru … sformuluj."
- Stejná cesta jako přehledy (R15): ~20 činností (šrotování až kontrola kvality),
  Claude píše postup jen z úryvků knih, každý krok s citací [n]; co knihy
  nepopisují, postup nemá a řekne to. Tabulka `bible_prehledy`, klíč `postup_…`,
  appka ukáže zvlášť „Pracovní postupy krok za krokem" s upozorněním porovnat
  postup s návodem k zařízení a s HACCP. Kontrola čísel nepočítá číslování kroků.
- YouTube: přepisy videí se hromadně nestahují (podmínky YouTube). Návod z videa
  jde do bible tak, že majitel uloží přepis (YouTube → … → Zobrazit přepis) jako
  TXT s odkazem na video a nahraje ho do knihovny — jen pro vlastní potřebu.

## R21 — Citace přehledů a postupů ve všech tvarech (4. 11. 2026)

- První běh přehledů: 19 z 36 bez odkazů — model psal citace jako [2, 5] /
  [2–5] a kontrola znala jen [2]. Oprava: worker skupiny a rozsahy rozbalí na
  [2][5] (appka a konektor i u starších textů), ukládá všechny zdroje (jen
  kniha a místo), číslování kroků a nadpisů se nebere jako údaj z knihy (číslo
  na začátku obyčejného řádku se kontroluje dál), prompt chce každé číslo ve
  vlastních závorkách. Verze `prehled-2` a `postup-2` vynutí nové napsání.
  Ruční spuštění workflow projde vždy.

## R22 — Nová vydání dokumentů (etapa 3c, 4. 11. 2026)

- Majitel: „Pokračuj v té aplikaci podle původního promptu" — zadání etapy 3
  „aktualizace dokumentů (nové vydání)", architektura § 4 „Různá vydání se
  seskupují. Nic se nemaže."
- Vazbu „tahle kniha je novým vydáním té" nastavuje člověk (správce u čehokoli,
  přispěvatel u svých dokumentů); appka jen napoví podle ISBN nebo názvu.
  Automaticky nic nepropojuje — omyl by schoval platnou knihu.
- Starší vydání se nemaže ani neskrývá: hledání ho jen označí; přehledy témat
  a postupy berou nejnovější zpracované vydání; konektor Claude dostane obojí
  s poznámkou, které je novější.

## R23 — Výpočetní modul, první část (etapa 6a, 4. 11. 2026)

- Majitel: „Pokračuj v té aplikaci podle původního promptu" → etapa 6 zadání:
  výpočetní moduly s testy z ručně ověřených příkladů, které odmítnou vstup
  mimo rozsah.
- Nejdřív výpočty, které pivovar potřebuje denně a mají ustálené vzorce se
  známým původem: tabulky extraktu (Plato), Balling, hmotnostní bilance ředění,
  varní výtěžek s korekcí 0,96, Palmerova rovnice vystírky, Tinseth, Morey,
  regrese rozpustnosti CO₂ (Zahm & Nagel). Ostatní oblasti (chlazení
  a výměníky, voda a pH, hydraulika, CIP, energie, ekonomika) přijdou v 6b —
  potřebují tabulky vlastností (měrná tepla, hustoty roztoků) s ověřeným
  zdrojem.
- Stejný kód v appce i v konektoru (nástroj `vypocet`), aby Claude čísla
  nepočítal sám.
- Vazba na knihovnu přes hledání („Najít v knihách"), ne přes pevná čísla
  stran — strana se nesmí vymyslet (zásada 1).

## R24 — Výpočetní modul, druhá část (etapa 6b, 11. 11. 2026)

- Majitel: „Pokračuj na ty bibly, dokud nebude hotová" → zbytek etapy 6:
  chlazení a výměníky, voda a pH, hydraulika a čerpadla, CIP, energie,
  ekonomika; k tomu scezování (vyslazovací voda), chmelovar (odpar), kvašení
  (dávka kvasnic) a dokvašení v lahvi.
- Fyzika je přesná (bilance tepla a hmoty, Darcy–Weisbach se Swamee–Jain,
  ΔT_ln, Kolbach, stechiometrie kvašení). Materiálové hodnoty, pro které nemám
  ověřený zdroj jednoho čísla, se **zadávají** s výchozí hodnotou a nápovědou
  místo natvrdo: měrné teplo mladiny a rmutu, součinitel prostupu tepla U,
  viskozita a drsnost, hustoty koncentrátů, účinnosti, ceny. Tak výpočet nic
  nedomýšlí a nejistota je vidět.
- Sazba spotřební daně se zadává (výchozí 32 Kč/hl/°P, snížená sazba malého
  pivovaru v % základní) — zákon se mění a zastaralé číslo napevno by bylo
  nebezpečné. Daň se počítá z celých stupňů Plato (§ 82 zákona č. 353/2003 Sb.).
- Přechodová oblast proudění (Re 2300–4000) se odmítne — tam tlakovou ztrátu
  spolehlivě spočítat nejde.
- Fyzikální vztahy sdílené 6a i 6b jsou v `fyzika.ts` (katalog 6b je
  v `katalog-6b.ts`, aby se katalogy navzájem neimportovaly v kruhu).
- Laboratoř řadí výpočty podle oblastí A–T (24 výpočtů v jednom seznamu se
  ztrácelo).

## R25 — Technologie pivovaru (etapa 7, 11. 11. 2026)

- Majitel: „Pokračuj na ty bibly, dokud nebude hotová" → etapa 7 podle
  architektury § 8: profil pivovaru, zařízení, provozní postupy, víc pivovarů.
- Tři tabulky v projektu bible (`bible_pivovary`, `bible_zarizeni`,
  `bible_postupy_provozu`), pro prohlížeč zavřené; zapisuje se jen přes SQL
  funkce, které práva hlídají znovu. Hlavní pivovar je nejvýš jeden (unikátní
  index); smaže-li se hlavní, hlavním se stane nejstarší zbývající.
- Parametry zařízení jsou pole `{nazev, hodnota (číslo) | text, jednotka,
  zdroj}` místo pevných sloupců: zařízení jsou různorodá a pevné sloupce by
  vynucovaly prázdná nebo vymyšlená čísla. Šablona podle druhu jen nabízí
  názvy; nic se nepředvyplňuje hodnotou.
- **Zdroj u každého parametru** (štítek, dokumentace, změřeno, ze Sklepa,
  odhad; výchozí odhad) — architektura § 8: „AI odliší obecné znalosti od
  parametrů konkrétního provozu". Text pro Clauda to říká výslovně a nástroj
  `profil_pivovaru` je od knih oddělený.
- Sklep hlavní appky zůstává zdrojem pravdy o tancích; bible si z něj tanky
  jen jednou převezme tlačítkem (bez průběžné synchronizace — projekty jsou
  oddělené, R12). Objem užitný = kapacita tanku v hl, zdroj „ze Sklepa";
  tank bez kapacity jde bez objemu.
- Převzetí víc zařízení je jedna transakce: chyba v jednom řádku zruší celé
  převzetí (nezůstane polovina).

## R26 — Receptury a várky (etapa 8, 11. 11. 2026)

- Pokračování „dokud nebude hotová" → etapa 8 podle architektury § 8:
  evidence várek, porovnání a hledání příčin odchylek, „jen s uloženými
  údaji, chybějící hodnoty vyjmenuje, nedomýšlí je".
- Hlavní appka várky zatím nezapisuje (Sklep: `cellar_batches` je prázdná),
  evidence je proto v projektu bible (R12). Až se ve Sklepu várky zapisovat
  začnou, jde doplnit převzetí jako u tanků (etapa 7).
- Hodnoty várky jsou objekt `{klíč: číslo}` nad **pevným katalogem** (30 klíčů
  s jednotkou a rozsahem, stejný v TS i SQL, shodu hlídá test) místo volných
  parametrů: porovnání várek potřebuje stejné klíče a jednotky, a jen tak jde
  říct, co chybí. Objemy mladiny a sladiny jsou horké (jak se měří ve varně).
- Odvozené hodnoty (varní výtěžek, odpar, prokvašení, alkohol) počítá
  výpočetní modul etapy 6 — žádný druhý vzorec. Chybí-li vstup, hodnota se
  nespočítá a porovnání řekne proč; nesmyslný zápis (víc mladiny než
  sladiny, zdánlivý extrakt nad původním) se ukáže u várky.
- Porovnání i text pro Clauda dělá jeden sdílený modul
  (`_shared/varky-popisy.ts`): appka a konektor nemůžou říkat něco jiného.
  Příčiny odchylek hledá Claude přes konektor (literatura, profil pivovaru,
  výpočty) a označí je jako hypotézy — chatbot v appce zůstává odložený (R14).
- Číslo várky je v pivovaru jen jednou (kontrola ve funkci pod zámkem
  a pojistka v unikátním indexu jen pro várky s pivovarem — smazání pivovaru
  nesmí narazit na stejná čísla). Várku doplňuje kterýkoli přispěvatel;
  smazat smí autor nebo správce.

## R27 — Rešerše z internetu a analýza problémů (etapy 9 a 10, 11. 11. 2026)

- Pokračování „dokud nebude hotová" → poslední dvě etapy. Chatbot v appce
  zůstává odložený (R14, náklady na API); obě etapy proto stojí na konektoru
  do aplikace Claude (R16): Claude hledá na webu a analyzuje tam, bible
  ukládá výsledky a ukazuje je v appce.
- **Konektor poprvé zapisuje** (uloz_web_zdroj, zaloz_problem, zapis_zjisteni).
  Zapisuje se za uživatele, který konektor schválil (bible_mcp_over vrací jeho
  id, jméno a přístup), s příznakem `pres_claude`; právo přispěvatele hlídá
  konektor i SQL (fail-closed). Přístup v tokenu je z doby schválení — po
  odebrání práv v hlavní appce zůstane do vypršení obnovovacího tokenu (30 dní)
  nebo do odpojení. Proto je zápis přes konektor omezený na záznamy, které
  člověk stejně kontroluje: webový zdroj vždy **neověřený**, hypotéza vždy
  **navržená**; ověřuje / potvrzuje člověk v appce.
- Webový zdroj: shrnutí vlastními slovy + odkaz, ne text cizí stránky
  (autorská práva); unikátní adresa (bez ohledu na velikost písmen).
  Ověřuje jen správce (BIBLE_ROLE_SPRAVCE zahrnuje sládka).
- Zjištění k problému mají šest typů z architektury § 6; fakt a výpočet bez
  zdroje odmítne appka, bible-api i CHECK v tabulce. Problém si pamatuje id
  várek (bez cizího klíče na pole — smazaná várka se prostě nenajde).
- Trend várek: jednoduchý SVG graf bez knihovny (lazy kus bible), podle
  zásad dataviz — jedna řada bez legendy, cíl receptury jako referenční čára,
  bublina na najetí i z klávesnice, vždy i tabulka. Barvy ověřené proti
  podkladu (řada 10,7 : 1, cíl 7,1 : 1).
- Tím je hotových všech 8 dlaždic plochy bible; chatbot (etapa 5) dál odložený.

## R28 — AI sládek: chatbot v appce přes Claude API (etapa 5, 11. 11. 2026)

- Majitel: „hlavně ať v aplikaci funguje vyhledávání a hledání komplexních
  odpovědí na problémy — má to být chatbot, který mi bude vyhledávat problémy",
  „dělej vše, dokud nebude hotový, máš vše povoleno". Tím padá odklad z R14:
  chatbot v appce je hotový. Podle pravidel Anthropicu musí volat **Claude
  API** (klíč `ANTHROPIC_API_KEY` z app_secrets hlavní appky), předplatné na
  dotazy z appky použít nejde (R14). Zpracování knih dál jede přes předplatné;
  zdarma se dá ptát i přes konektor (R16).
- **Funkce `bible-chat`** (projekt bible, `verify_jwt = false`, brána jako
  bible-api): otázka → Claude (`model_odpovedi`, dnes Opus 5.5, adaptivní
  přemýšlení, střední úsilí) se stejnými nástroji jako konektor — kód nástrojů
  je společný (`_shared/nastroje.ts`). Chat jen čte; zjištění k problému
  zapisuje jen v analýze problému a jen přispěvatel (hypotéza vždy navržená).
  Uložit webový zdroj nebo založit problém chatbot neumí (to dělá člověk nebo
  konektor). Volitelně serverové hledání na webu (`web_search_20260209`, max. 5).
- **Citace**: stránky knih dostává Claude jako bloky `search_result`
  s citacemi zapnutými (zdroj = odkaz do čtečky). Citace v odpovědi tak
  ukazují jen na stránky, které Claude opravdu dostal; appka je převede na
  čísla [n] a seznam zdrojů s citovanou větou (`textSCitacemi`). Vlastní
  „[n]" od Clauda se změní na „(n)".
- **Hlídání**: měsíční strop `strop_mesic_usd` (výchozí 20 USD, mění správce
  ve Správě znalostí, 0 = vypnuto) se kontroluje před otázkou i před každým
  dalším kolem nástrojů; nejvýš 8 volání na otázku; po 80 s už jen odpověď
  bez dalšího hledání, tvrdý konec ve 140 s (limit platformy 150 s) — co se
  stihlo, se uloží jako neúplná odpověď. Cena z usage podle ceníku
  v `bible_nastaveni` (po záložním modelu podle usage.iterations, model bez
  ceníku odhadem cenou Opus 5), web 0,01 USD za hledání; zápis do
  `ai_naklady` (účel „chat").
- **Záložní model**: `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`) — odmítne-li model otázku (např. falešný
  poplach bezpečnostního filtru u mikrobiologie), odpoví doporučený záložní
  model; po přepnutí uprostřed odpovědi se zpátky posílá obsah podle pravidel
  API (`obsahKOdeslani`).
- **Konverzace** (`bible_konverzace`, `bible_zpravy`, migrace
  `20261111030000_bible_chat`) vidí a maže jen ten, kdo se ptal; zapisuje se
  jen přes SQL funkce. Navazující otázky dostanou posledních 12 zpráv i se
  seznamem zdrojů. Odpověď jde do appky po řádcích (NDJSON): kroky („Hledám
  v knihách: …"), průběžný text, hotová odpověď s citacemi. Do logu nejde
  otázka, odpověď ani text knih.
- **Hledání otázkou**: `bible_hledej` chce všechna slova na jedné stránce,
  otázka v běžné řeči proto nenašla nic. Když přesné hledání nic nenajde,
  `bible_hledej_volne` hledá bez výplňových slov, s uříznutou českou
  koncovkou (chmelovaru → chmelovar, pění → pen) nejdřív stránky aspoň se
  dvěma slovy otázky, pak s jedním, seřazené podle počtu nalezených slov
  („shoda 2 z 3 slov"). Stejně zkušenosti sládků
  (`bible_hledej_zkusenosti_volne`). Výplňová slova a koncovky jsou v SQL
  i v TS (`slovaVolne`) stejné — hlídají to testy na obou stranách.
- Nasazení: zvláštní krok „Klíč Claude pro AI sládka" přečte klíč
  z app_secrets (zamaskovaný, jen do souboru), krok funkcí bible ho při
  každém běhu přidá k secrets projektu bible. Výměna klíče v app_secrets se tak
  projeví příštím nasazením.

## R29 — Hledání: vícejazyčné varianty slov a filtry (etapa 4b, 11. 11. 2026)

- Majitel: „pokračuj, dokud to nebude všechno hotové". Etapa 4 měla v zadání
  ještě „vícejazyčné varianty dotazu" a „filtry (oblast, autor, dokument, rok,
  jazyk)". Architektura počítala s překladem dotazu přes Haiku — hledání ale
  zůstává zdarma (R14), proto **slovník odborných výrazů** v databázi
  (`bible_slovnik`, migrace `20261111040000_bible_hledani_filtry`): přes 50
  pojmů v češtině, němčině a angličtině (mladina = Würze = wort, rmutování =
  Maischen = mashing, pěna = Schaum = foam …). Slovo dotazu patří k pojmu
  shodou českého kmene (stejná pravidla jako hledání otázkou, `bible_kmen`),
  začátkem slova (Würze → wurz) nebo přesným slovem (hop/hops, ať „hope"
  nenajde chmel). Varianty se hledají spolu se slovem: přesné hledání chce
  na stránce každé slovo **nebo** jeho variantu, hledání otázkou počítá shodu
  po pojmech. Slovník je veřejná terminologie, žádný text knih; doplňovat se
  dá další migrací.
- **Filtry** (`bible_dokumenty_filtr`): kniha, autor (část jména, bez
  diakritiky, doslova — % není zástupný znak), rok vydání od–do, jazyk knihy,
  druh dokumentu, oblast A–T (oblasti jsou u knihy, R17). Neplatnou hodnotu
  odmítne už `filtrHledani` (appka, bible-api, nástroj Clauda), SQL ji pro
  jistotu nepoužije.
- Nové funkce `bible_hledej_v` a `bible_hledej_volne_v`; původní
  `bible_hledej` a `bible_hledej_volne` beze změny (worker přehledů).
  Bez migrace bible-api i nástroj hledají postaru (filtr jen knihou), jiný
  filtr ohlásí, že čeká na migraci.
- Obrazovka Hledání: tlačítko Filtry (kniha, oblast, jazyk, druh, autor, rok
  od–do), filtr slovy nad výsledky, zvýraznění i variant. Nástroj
  `hledej_v_knihach` (konektor i AI sládek) má filtry autor, rok_od, rok_do,
  jazyk, druh, oblast.
- Vektory (embeddingy) dál až po měření na zlaté sadě otázek (§ 5).

## R30 — Dodatek k PDF: rychlé otevření strany z knihy (11. 11. 2026)

- Majitel: „pokračuj, dokud to nebude všechno hotové". Zbývala slabina R19:
  pdf.js při otevření knihy ověřuje poslední stranu a u plochého stromu stran
  čte slovník každé strany (rozházené mezi obrázky) — změřeno 22–26 MB
  a stovky dotazů na 40MB knize, než se ukáže první strana. Na telefonu ve
  sklepě minuty, a přenosy tarifu Free.
- **Originál se nemění** (zásada knihovny) a **nekopíruje** (úložiště by se
  zdvojilo). Worker postaví **dodatek** — přírůstkovou aktualizaci PDF podle
  normy (kap. 7.5.6): nové uzly stromu stran s /Count (vyvážený strom, každá
  strana pod vlastním obalem), katalog pod stejným číslem jen s novým
  /Pages, objektový proud a proud křížových odkazů s /Prev na poslední
  tabulku originálu. Pár kB (400 stran ≈ 6 kB, 3 000 stran ≈ 43 kB). Strany,
  obsah, písma a obrázky zůstávají v originále; strany se dál odkazují
  /Parent na původní uzly, takže zděděné rozměry a otočení platí dál.
- Dodatek je jen struktura PDF (žádný text knihy) a leží v databázi bible
  (`bible_dodatky`, mizí se smazáním knihy) — pro prohlížeč zavřené, appka
  ho dostane od bible-api spolu s podepsaným odkazem a přilepí ho za
  originál jen u sebe v paměti. Nesedí-li délka originálu, nepoužije se.
- Dodatek vznikne jen z čistého PDF (pypdf ve striktním režimu, BSD, zamčený
  s hashi) bez šifrování, s jednoznačným stromem stran a když ušetří aspoň
  4 kousky po 64 kB (jinak řádek s důvodem „strom_staci", ať se nezkouší
  znovu). Před uložením trojí kontrola: stejné pořadí stran; simulace hledání
  strany v pdf.js (každá strana se najde a z originálu se čte jen její
  slovník); pdfium přečte stejný počet stran se stejnými rozměry. Appka má
  pojistku: když pdf.js s dodatkem selže, kniha se otevře znovu bez něj.
- Starší knihy: worker je doplňuje při každém běhu (25 za běh) **bez
  stažení celého souboru** — čte přes HTTP Range jen to, co potřebuje
  (rozpočet nejvýš 8 MB nebo pětina souboru, jinak důvod „rozsah").
