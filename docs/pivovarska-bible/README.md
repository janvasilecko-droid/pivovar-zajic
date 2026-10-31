# Pivovarská bible AI — digitální hlavní sládek

Odborná knihovna pivovarské literatury s AI (Claude), která odpovídá
s citací kniha–kapitola–strana a počítá deterministickým výpočetním modulem.

- [ARCHITEKTURA.md](ARCHITEKTURA.md): jak je to postavené a proč
- [ETAPY.md](ETAPY.md): plán po etapách a stav
- [ROZHODNUTI.md](ROZHODNUTI.md): rozhodnutí s datem a důvodem

## Odkazy pro majitele

- **Bible v appce:** https://zajic-pivovar.pages.dev/?page=bible
- **Migrace databáze** (pouští majitel): https://zajic-pivovar.pages.dev/?page=audit
  → Databázové migrace
- **Kdo smí do bible:** Uživatelé → u člověka Práva → „Pivovarská bible"
  (https://zajic-pivovar.pages.dev/?page=users)
- **Spustit zpracování knih hned** (jinak běží samo zhruba každé 3 hodiny):
  https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml
  → „Run workflow"
- **Kredit Anthropic API** (platí odpovědi a OCR):
  https://platform.claude.com/settings/billing
- **Supabase projekt:** https://supabase.com/dashboard/project/sasqexjadvlqyticxwja

## Stav

| Etapa | Stav |
|---|---|
| 0: audit a architektura | hotovo (30. 10. 2026) |
| 1: knihovna, nahrávání, stav | hotovo — migrace `20261231410000_pivovarska_bible_knihovna` čeká na spuštění |
| 2: zpracování knih (worker) | hotovo — migrace `20261231420000_pivovarska_bible_zpracovani` čeká na spuštění |
| 3–10 | čeká |

## Zpracování knih (etapa 2)

- **Kód:** `scripts/bible/` (Python) a workflow
  `.github/workflows/bible-zpracovani.yml`.
- **Testy workeru:** `scripts/bible/tests/` (pytest).
- **Kontroly migrací** na čistém PostgreSQL: `supabase/testy/bible/`.
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
- **Pojistka velikosti databáze:** `limit_db_mb` (výchozí 450 MB; Supabase
  Free přepne nad 500 MB celou appku jen pro čtení). Nad limitem další
  knihy počkají se zprávou u dokumentu.
- **Fronta:** dokument zkoušený v běhu se ve stejném běhu znovu nebere,
  po třech nepovedených pokusech je „chyba"; „Zpracovat znovu" vynuluje
  pokusy. Pozastavit jde i rozpracovaný dokument (worker přestane).
- **Závislosti workeru** jsou zamčené i s hashi (`scripts/bible/requirements.txt`,
  pro testy `requirements-testy.txt`); nové verze jen přes PR s testy:
  `uv pip compile requirements.in --python-version 3.12 --python-platform x86_64-manylinux_2_28 --generate-hashes --no-header --exclude-newer <datum před 2 týdny> -o requirements.txt`
  (a totéž pro `requirements-testy.in`; starý výstup předem smazat).
- **Do veřejného logu** jdou jen ID dokumentů, počty a stavy.
