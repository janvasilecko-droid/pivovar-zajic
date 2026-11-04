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
