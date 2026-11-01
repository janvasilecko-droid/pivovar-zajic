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
- **Kredit Anthropic API** (platí odpovědi a OCR):
  https://platform.claude.com/settings/billing
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
| 3b–3c: zkušenosti sládků, nová vydání | čeká |
| 4–10 | čeká |

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
  skenů a převedené soubory) — jsou v textu strany nebo v originále.
