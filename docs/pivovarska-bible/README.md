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
  1. Stažení originálu a ověření SHA-256.
  2. U PDF textová vrstva po stranách. Strana bez použitelné vrstvy (sken)
     jde přes Claude Haiku a Tesseract pak nezávisle zkontroluje čísla.
     Neshoda znamená „ke kontrole", nic se nepřepisuje.
  3. Tištěná čísla stran: štítky PDF, nebo číslo v záhlaví či zápatí
     potvrzené posunem na okolních stranách. Bez jistoty se nevyplní.
  4. Kapitoly z osnovy PDF, jinak z číslovaných nadpisů.
  5. Pasáže (≈ 600 tokenů, nejvýš přes 2 strany) a zvlášť tabulky a vzorce.
  6. Zápis stran, kapitol a pasáží, počtů, stavu a nákladů (`ai_naklady`).
- **Strop útraty:** na běh 5 USD a na měsíc 20 USD (`bible_nastaveni`).
  Když dojde, dokument počká na další běh.
- **Do veřejného logu** jdou jen ID dokumentů, počty a stavy.
