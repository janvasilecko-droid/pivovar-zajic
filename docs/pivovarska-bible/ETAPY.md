# Pivovarská bible AI — etapy

Pořadí drží zadání (bod 13 Realizace). Každá etapa končí stejně:
- testy (vitest, u workeru pytest),
- všechny CI kontroly (třídy, kontrast, tlačítka, dotyk, popisky, velikost
  startu, lint, edge funkce),
- bezpečnostní kontrola diffu,
- dokumentace tady,
- PR, merge (= git checkpoint) a ověření nasazení.

Migrace pouští majitel v appce: **Systém → Databázové migrace**
(https://zajic-pivovar.pages.dev/?page=audit) — migrace projektu bible
(rozhodnutí R12) v bloku „Databáze bible" pod hlavními.

| Etapa | Ze zadání | Obsah | Hotovo, když |
|---|---|---|---|
| 0 | 1. Nejdřív prozkoumej projekt | Audit prostředí, architektura, rozhodnutí | Dokumenty v této složce |
| 1 | Základ aplikace + Nahrávání dokumentů | Plocha bible s 8 dlaždicemi, přístup fail-closed (Uživatelé → Práva → Pivovarská bible), soukromý bucket, nahrání víc souborů s potvrzením práv, Odborná knihovna se stavem zpracování, Správa znalostí (kapacita DB a úložiště, tematické oblasti A–T) | Majitel nahraje knihy ze složky `D:\stazene\knihy pivo` a vidí je ve stavu „čeká na zpracování" |
| 1b | (jen když bude potřeba) | Rozdělení PDF nad limit souboru v prohlížeči | Projde i soubor nad 50 MB |
| 2 | OCR a zpracování dokumentů | Worker v GitHub Actions: textová vrstva, tištěná čísla stran, kapitoly, OCR skenů (Claude Haiku + kontrola Tesseractem), tabulky, vzorce a popisky obrázků, duplicity, evidence nákladů na AI | Kunze je zpracovaný: počty stran a kapitol sedí, vzorek stran porovnaný ručně s PDF je bez chyb v číslech |
| 3 | Odborná znalostní databáze | Prohlížení knih (kapitoly, strany, tabulky, vzorce), knihovna zkušeností sládků (5 úrovní důvěryhodnosti, ruční zápis), aktualizace dokumentů (nové vydání) | Kniha jde projít po kapitolách a stranách, zkušenost jde zapsat a najít |
| 4 | RAG vyhledávání | Hybridní hledání (fulltext + přesné termíny + vícejazyčné varianty dotazu), filtry (oblast, autor, dokument, rok, jazyk), otevření pasáže v kontextu stránky. Vektory až po měření na zlaté sadě otázek | Hledání „chmelovar odpar" najde pasáže v Kunzem i v německých knihách a otevře správnou stránku |
| 5 | Chatbot | Edge funkce s Claude (citace přes search_result, nástroje, streamování), navazující otázky, historie konverzací, zobrazení zdroje odpovědi, náklady a měsíční strop | Odpověď cituje jen nalezené pasáže a každá citace otevře správnou stránku. Bez nálezu odpověď řekne „nenašel jsem" |
| 6 | Výpočtový engine | Výpočetní moduly z ověřeného katalogu (Plato a extrakt, výtěžnost a bilance, rmutování, scezování, chmelovar a IBU, barva, chlazení a výměníky, kvašení, voda a pH, hydraulika a čerpadla, CIP, energie, ekonomika), Výpočtová laboratoř, nástroje pro Claude | Každý výpočet má testy z ručně ověřených příkladů a odmítne vstup mimo rozsah |
| 7 | Profil pivovaru | Technologie pivovaru: varna, nádoby, schéma, čerpadla, potrubí, výměníky, tanky, postupy; i další pivovary | AI odliší obecné znalosti od parametrů provozu |
| 8 | Analýza várek | Receptury a várky: evidence, porovnání várek, hledání příčin odchylek | Analýza neuvádí hodnotu, kterou nemá; chybějící vyjmenuje |
| 9 | Internetová rešerše | Claude s hledáním na webu, výsledky se zdrojem, datem a důvěryhodností, bez přepisu ověřených znalostí | Web je v odpovědích vidět odděleně od literatury |
| 10 | Pokročilé analytické funkce | Analýza problémů (oblast T), trendy várek, grafy | Podle domluvy s majitelem |
| průběžně | Bezpečnost a náklady | Revize přístupu, nákladů, záloh, návod pro majitele | Revize bez otevřených nálezů |
