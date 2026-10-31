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
| přesun do samostatného projektu (R12) | hotovo — migrace `20261101000000_bible_zaklad` (Databáze bible) a `20261231430000_pivovarska_bible_samostatny_projekt` (hlavní databáze) pouští majitel |
| 3–10 | čeká |

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
  Knihu, o které už je známo, že má skeny (průběh nebo počty z dřívějška),
  worker bez AI ani nestahuje — jen jí obnoví čas průběhu (přenosy tarifu
  Free by jinak každé 3 hodiny stahovaly celé knihy zbytečně).
- **Procenta v knihovně:** worker během práce zapisuje průběh do
  `postup.prubeh` (fáze, stran hotovo/celkem, přepis skenů, čas) nejvýš
  jednou za 15 s; knihovna ho ukazuje v procentech a sama se obnovuje (při
  zpracování po 20 s; u čekajících knih po minutě jen 90 min po plánovaném
  běhu, jinak po 10 min; ne na skryté záložce, při nahrávání ani při
  rozepsaném popisu). Když se worker 20 min neozve, připíše „bez zprávy".
  U čekající knihy: „ve frontě" (jiná kniha se právě zpracovává a tuhle běh
  ještě neodložil), „na běh z HH:MM" (75 min po plánovaném čase, GitHub běhy
  zdržuje), jinak čas dalšího běhu (cron `17 */3 * * *` UTC). Kolik skenů je
  přepsaných, píše jen u skutečně přepsaných stran (ty se znovu neplatí).
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
