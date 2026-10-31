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
  zůstávají prázdné; zápis do nich zavřela `20261231430000`. Smazat je jde
  jen se souhlasem majitele (CLAUDE.md: data nemazat).
- **R10 platí dál ve smyslu:** hledání poběží v edge funkci projektu bible
  service rolí (bez RLS, takže s indexem); práva hlídá brána.
