# Pivovarská bible AI — architektura

Návrh v1, 30. 10. 2026. Vychází z auditu prostředí (databáze, frontend, edge
funkce, infrastruktura) a z rešerše (OCR, embeddingy, Supabase RAG). Rozhodnutí
s datem a důvodem jsou v [ROZHODNUTI.md](ROZHODNUTI.md), etapy
v [ETAPY.md](ETAPY.md).

## 1. Cíl a závazné zásady

Digitální hlavní sládek odpovídá z odborné literatury, kterou pivovar opravdu
nahrál a zpracoval. Cituje knihu, kapitolu a stranu, počítá jen
deterministickým kódem, odliší literaturu, praxi a vlastní doporučení a řekne,
když neví.

Zásady platí pro kód, prompty i UI:

1. **Žádný vymyšlený zdroj ani číslo strany.** Citace smí vzniknout jen
   z pasáže, kterou vyhledávání skutečně vrátilo. Claude dostává pasáže jako
   bloky `search_result` se zapnutými citacemi, takže technicky nemůže citovat
   nic jiného. Tištěné číslo strany se ukládá jen s jistotou. Jinak appka
   napíše „list PDF č. X".
2. **Čísla z výpočtů počítá výpočetní modul,** ne model. Model ho volá jako
   nástroj.
3. **Chybějící hodnoty se nedoplňují odhadem.** Appka vyjmenuje, co chybí.
4. **Web je oddělený.** Zdroj z webu má datum a míru důvěry a nikdy nepřepíše
   ověřenou literaturu.
5. **Kniha je „známá", jen když je zpracovaná** (stav `hotovo`). Appka ukazuje
   počty stran, kapitol a pasáží, ne jen název.
6. **Nic se tiše nemaže ani nepřepisuje.** Duplicity a nejistá místa se jen
   označí a čekají na kontrolu.

**Infrastruktura (zadání bod 1):**
- Využívá se to, co už je: Supabase (Postgres, Storage, edge funkce), GitHub
  (kód, Actions) a Cloudflare Pages (hosting appky).
- **Bible má vlastní projekt Supabase** (rozhodnutí R12, 31. 10. 2026:
  „ať je supabase pro aplikaci samostatně a samostatná supabase pro toho
  boota"): projekt `cegrelgvkygcatupqwrx` ve vlastní Free organizaci, takže
  knihy neubírají appce pivovaru 500 MB databáze ani 1 GB úložiště.
  Přihlášení a práva zůstávají v hlavní appce.
- **Vercel** se nepoužívá. Aktuální appku nenasazuje, jen u každého commitu
  hlásí neúspěšné nasazení. Na pivovar-zajic.vercel.app navíc veřejně visí
  stará verze 2.934 (zjištění auditu, doporučení je integraci odpojit).

## 2. Komponenty

```
Telefon / PC (web, Android WebView)
 └─ sekce „Pivovarská bible" (líně načítaná, ?page=bible)
     ├─ všechno přes edge funkci bible-api s tokenem z hlavní appky
     │  (lib/bibleKlient.ts, BEZ offline mezipaměti)
     └─ soubor nahrává podepsaným odkazem rovnou do úložiště projektu bible

Supabase — hlavní projekt appky (sasqexjadvlqyticxwja)
 ├─ přihlášení, profily, práva (bible_pristup — jediný zdroj pravdy)
 ├─ bible_overeni(): schválený e-mail, heslo, limit, přístup do bible
 └─ app_secrets: ANTHROPIC_API_KEY (už existuje)

Supabase — projekt bible (cegrelgvkygcatupqwrx, vlastní Free organizace)
 ├─ Postgres: tabulky bible_* — pro prohlížeč ZAVŘENÉ (žádná práva ani politiky
 │  pro anon/authenticated), fulltext, pg_trgm, později pgvector
 ├─ Storage: bucket „knihovna" (soukromý, 50 MB na soubor, bez politik)
 └─ Edge funkce (Deno, bible/supabase/functions, verify_jwt = false):
     bible-api (knihovna), bible-migrace (migrace z appky); později chat a hledání.
     Token ověří dotazem do hlavního projektu (/auth/v1/user + bible_overeni),
     pak pracují service rolí; zápis jen přes SQL funkce, které práva hlídají znovu.

GitHub Actions (veřejné repo → zdarma, ALE veřejné logy)
 └─ bible-zpracovani.yml: Python worker → Claude Haiku (OCR skenů) → databáze bible
```

## 3. AI vrstva: Claude

Majitel 30. 10. 2026: „chci aby to bylo napojené na Claude", „ne Gemini".

| Účel | Model | Cena za 1 M tokenů (vstup / výstup) |
|---|---|---|
| Odpovědi sládka | `claude-opus-5-5` (výchozí) | 4 / 20 USD |
| Levnější odpovědi (přepínač) | `claude-sonnet-5-5` | 2 / 10 USD |
| Pomocné kroky (OCR skenů, překlad dotazu, kontext pasáží) | `claude-haiku-5-5` | 0,10 / 0,50 USD |

- **Modely a ceník se nastavují v databázi** (`bible_nastaveni`), ne natvrdo
  v kódu. Výměna modelu nebo poskytovatele proto nevyžaduje přestavbu. Volání
  jdou přes rozhraní `LlmPoskytovatel` (`bible/supabase/functions/_shared/`).
  Dnes je jediný adaptér Anthropic.
- **Citace:** nalezené pasáže dostane model jako bloky `search_result` (zdroj
  `bible://pasaz/<id>`, titulek „Kniha, kap., s.") s `citations.enabled`.
  Citace v odpovědi pak ukazují na konkrétní pasáž a appka z ní otevře stránku.
  Citace nejdou kombinovat se strukturovaným výstupem (JSON schema), proto je
  odpověď markdown s pevnými nadpisy (§ 6).
- **Nástroje:** `hledej_v_knihovne`, `vypocet_*`, `profil_pivovaru` a `data_varky`.
  Počet kol je omezený. Nástroje se nevynucují (`tool_choice: auto`), protože
  Opus 5.5 vynucené volání odmítá.
- **Odpověď se streamuje** (SSE) z edge funkce a musí doběhnout do 150 s
  (limit platformy).
- **Prompt caching:** systémový prompt a definice nástrojů se ukládají
  do mezipaměti, takže opakované dotazy jsou levnější.
- **Náklady:** každé volání se zapíše do `ai_naklady` (model, tokeny vstup,
  výstup a cache, cena podle ceníku, účel, uživatel). Platí měsíční strop.
  Nad ním appka odmítne další dotaz srozumitelnou hláškou.

## 4. Knihovna a zpracování dokumentů

### 4.1 Nahrání (Etapa 1)

- Odborná knihovna → Nahrát. Jde vybrat víc souborů naráz: PDF, DOCX, TXT, MD,
  XLSX, CSV a obrázky stran (JPG, PNG, WEBP, TIFF).
- Prohlížeč spočítá SHA-256. bible-api už nahraný soubor odmítne, jinak
  založí řádek `bible_dokumenty` ve stavu `nahrava` a vydá podepsaný odkaz
  jen pro cestu `knihovna/<id dokumentu>/<bezpečné jméno>` (platí 2 hodiny,
  existující soubor nepřepíše). Prohlížeč soubor nahraje rovnou do úložiště
  projektu bible a bible-api ověří, že tam je a má ohlášenou velikost —
  teprve pak jde dokument do fronty (`ceka`). Nedokončené nahrání dokončí
  nové nahrání téhož souboru, nebo se zruší; nikdy soubor bez záznamu.
- **Povinné je potvrzení práv:** „Dokument smíme v pivovaru interně používat."
  K němu jde napsat poznámku k licenci. Autor, vydání, rok, ISBN, jazyk
  a oblasti A–T jsou volitelné a dají se doplnit později.
- Limit velikosti souboru určuje tarif projektu bible (Free: 50 MB na soubor,
  1 GB celkem; bucket má limit 50 MB nastavený). Větší soubor appka nenahraje a řekne proč. Kdyby se to týkalo
  skutečných knih, přibude rozdělení PDF v prohlížeči (Etapa 1b).
- **Storage se nezálohuje.** Druhá kopie originálů je složka majitele
  `D:\stazene\knihy pivo`.

### 4.2 Zpracování: worker v GitHub Actions (Etapa 2)

**Proč ne edge funkce:** mají limit 2 s CPU, 256 MB a 150 s. Už samotné
vytažení textu z 300stránkového PDF v testu rešerše stálo 2,0 s CPU a 231 MB.

**Spouštění:**
- ručně přes `workflow_dispatch` (přesný odkaz v appce),
- záložně plánovaně (plánované běhy GitHub se zpožďují o hodiny),
- později tlačítkem „Zpracovat hned". To potřebuje GitHub token v app_secrets.

**Postup u jednoho dokumentu:**

1. **Zámek** přes RPC s `FOR UPDATE SKIP LOCKED` a vypršením. Zaseknutý běh
   se po vypršení vezme znovu, nic se nemaže. Stav `zpracovava`.
2. **Stažení** z bucketu (service role) a ověření SHA-256.
3. **PDF (pypdfium2, licence BSD/Apache):** počet stran, osnova (kapitoly),
   štítky stran (`/PageLabels`), textová vrstva po stranách.
4. **Třídění stran:** digitální strana (kvalitní textová vrstva, zdarma
   a přesně), nebo sken (vrstva chybí nebo je vadná).
5. **Skeny:**
   - Strana se vyrenderuje (≈ 200 DPI) a pošle do **Claude Haiku 5.5**
     s pokynem k doslovnému přepisu. Výsledek je markdown: tabulky, vzorce
     v LaTeXu, záhlaví a zápatí zvlášť a tištěné číslo strany.
   - **Kontrola Tesseractem** (ces+deu+eng, zdarma): čísla a jednotky se musí
     shodovat. Jinak dostane strana stav `ke_kontrole`, nic se tiše nepřepíše.
   - Volitelně druhé čtení přes Sonnet.
6. **Tištěná čísla stran:** pořadí zdrojů je štítky PDF, pak číslo v záhlaví
   nebo zápatí, pak posun s konsensem v okně 9 stran. Bez jistoty se uloží
   `null`.
7. **Kapitoly:** osnova PDF, jinak číslované nadpisy (3.4.2, Kapitel, Kapitola).
   Výsledek je strom s rozsahem stran.
8. **Tabulky a vzorce** se ukládají jako samostatné objekty s vazbou na
   stranu: HTML nebo markdown, LaTeX a čitelný text pro hledání.
9. **Pasáže** mají ≈ 400–700 tokenů, drží se uvnitř kapitoly a nesou rozsah
   stran. Haiku k nim dopíše 1–2 věty kontextu (označené „AI, není text
   knihy"). Kontext zlepšuje hledání (contextual retrieval).
10. **Fulltext a trigramy:** `tsvector('simple')` nad textem bez diakritiky.
11. **Stav a počty** se zapisují do `bible_dokumenty`: stran, digitálních,
    OCR, ke kontrole, kapitol, tabulek, vzorců, pasáží a kvalita OCR.

**Bezpečnost workeru (repo je veřejné):** do logu jdou jen ID, počty a stavy.
Výjimky se logují bez obsahu, žádné artefakty se nenahrávají a klíč je
maskovaný.

**Ostatní formáty:**
- DOCX se čte po odstavcích, citace je kapitola + odstavec.
- XLSX a CSV: citace je list + rozsah buněk.
- Obrázek se zpracuje jako sken.

**Duplicity:**
- Shodné SHA-256 znamená stejný soubor a appka ho odmítne už při nahrání.
- Shodné ISBN nebo podobný název dají jen „možná duplicita" k potvrzení.
- Různá vydání se seskupují. Nic se nemaže.

## 5. Vyhledávání (hybridní RAG)

RPC `bible_hledej(...)` v Postgresu běží jako SECURITY DEFINER s vlastní kontrolou
`bible_smi_cist()` na začátku (pod RLS by se index hledání nepoužil, viz R10):

- **Fulltext:** `websearch_to_tsquery('simple', …)` nad textem a kontextem
  pasáže, bez diakritiky.
- **Přesný termín a fráze:** `pg_trgm` a `ILIKE` pro vzorce, jednotky a zkratky
  (DMS, EBC, Würze).
- **Vektory (Etapa 4, po měření):** pgvector HNSW nad `halfvec`. Vektory leží
  v samostatné tabulce s `model_key`, takže výměna modelu znamená jen
  přepočet, ne přestavbu.
- **Spojení výsledků:** RRF (reciprocal rank fusion). Filtry: kniha, jazyk,
  oblast, druh (text, tabulka, vzorec) a důvěryhodnost.
- **Vícejazyčnost:** Haiku přeloží dotaz do CZ/DE/EN s odbornými synonymy
  (mladina = Würze = wort) a hledá se všemi variantami. PostgreSQL nemá český
  stemmer, proto `simple` + varianty.
- **Embeddingy:** Anthropic vlastní model nemá. V Etapě 4 se změří
  na zlaté sadě otázek (recall@10) s vektory i bez nich. Kandidáti jsou dva:
  - **Voyage AI** (doporučuje ho Anthropic): 200 M tokenů zdarma, potřebuje
    nový účet a vypnutý trénink na datech;
  - **OpenAI text-embedding-3-large:** klíč už v app_secrets je.

## 6. Odpověď digitálního sládka

Pevná struktura v markdownu:

1. **Krátká odpověď.**
2. **Co říká literatura:** s citacemi (kniha, kapitola, strana). Když se
   zdroje rozcházejí, odpověď to výslovně řekne.
3. **Zkušenosti z praxe:** s úrovní důvěryhodnosti (§ 9).
4. **Výpočet:** karta z výpočetního modulu.
5. **Doporučení:** výslovně označené jako technologické doporučení, ne jako
   pravidlo z literatury.
6. **Rozpory mezi zdroji a co chybí.**

Každé tvrzení nese jeden typ ze zadání (bod 11):

| Typ | Kdy se použije |
|---|---|
| doložený fakt | s citací |
| výsledek výpočtu | z výpočetního modulu |
| provozní zkušenost | ze zkušeností sládků |
| technologické doporučení | vlastní úvaha |
| hypotéza | nepotvrzený předpoklad |
| neznámá hodnota | chybí údaj |

- **Když chybí zásadní údaj** (třeba objem várky), sládek se doptá a nic
  nedomýšlí.
- **Odhad nikdy nevydává za změřenou hodnotu** a doporučení výrobce za obecné
  pravidlo.
- **Když knihovna nic relevantního nevrátí,** odpověď zní „V knihovně jsem
  k tomu nic nenašel" a doplní, co nahrát. Žádná citace se nevymýšlí.
- **Ke každé odpovědi se uloží** model, verze promptu, ID pasáží, tokeny
  a cena.
- **Chat umí navazující otázky.** Konverzace se ukládají a historie jde
  znovu otevřít.

## 7. Výpočtový engine (Etapa 6)

- Čisté TS moduly bez závislostí v `bible/supabase/functions/_shared/vypocty/`.
  Sdílí je frontend i edge funkce a testuje je vitest v CI.
- **Každý výpočet vrací:** vstupy s jednotkami, vzorec, mezikroky, výsledek
  s jednotkou, předpoklady, rozsah platnosti, nejistotu a zdroj. Vstup mimo
  rozsah platnosti odmítne.
- **Testy** stojí na ručně ověřených příkladech: katalog z rešerše
  s nezávislým přepočtem.
- **Vazba na knihovnu:** u vzorce je odkaz na pasáž v knize, kde je uvedený.

## 8. Technologie pivovaru, receptury a várky (Etapy 7 a 8)

- **Profil pivovaru:** typ varny, objemy nádob, technologické schéma,
  parametry zařízení, čerpadla, potrubí a ventily, výměníky, chlazení,
  kvasné a ležácké tanky, receptury, provozní postupy a historie várek.
  - Navazuje na stávající Sklep (tanky a várky).
  - Jde založit i profily dalších pivovarů.
  - AI odliší obecné znalosti od parametrů konkrétního provozu.
- **Analýza várek:** receptura, slady, voda, rmutování, scezování, hustoty,
  objemy, chmelovar, chlazení, kvašení, ležení a laboratorní hodnoty.
  - AI porovnává várky a hledá příčiny odchylek (třeba „proč byla výtěžnost
    posledních tří várek nižší").
  - Pracuje jen s uloženými údaji. Chybějící hodnoty vyjmenuje, nedomýšlí je.

## 9. Zkušenosti sládků (Etapa 3)

**Typy záznamů:** případové studie pivovarů, odborné diskuse, rozhovory
se sládky, praktické postupy, řešení konkrétních problémů, doporučení
výrobců a provozní zkušenosti. Jde i ruční zápis z vlastního provozu.

Každý záznam má důvěryhodnost podle zadání:

| Úroveň | Důvěryhodnost |
|---|---|
| 1 | ověřená odborná publikace |
| 2 | výrobní dokumentace |
| 3 | opakovaně ověřená provozní zkušenost |
| 4 | zkušenost jednoho sládka |
| 5 | neověřená informace |

Zkušenosti se vyhledávají spolu s knihami, ale vždy s označením.
Jednotlivou zkušenost appka nikdy nevydá za obecné technologické pravidlo.

## 10. Internetová rešerše (Etapa 9)

- Rešerši dělá Claude s nástroji pro hledání a čtení webu. Výsledky se ukládají
  do `bible_web_zdroje`: URL, titulek, datum zjištění, datum publikace, důvěra
  a stav (neověřeno, ověřeno, zamítnuto).
- V odpovědích jsou vždy zvlášť a s datem a nikdy nepřepíšou literaturu.

## 11. Uživatelské rozhraní

Dlaždice „Pivovarská bible" ve skupině Nástroje otevře tmavou průmyslovou
plochu s 8 dlaždicemi podle zadání (bod 10):

1. **Odborný chatbot:** navazující otázky, historie, citace.
2. **Knihovna dokumentů** („Odborná knihovna"):
   - přehled knih a nahrávání,
   - stav zpracování s počty stran a kapitol,
   - hledání podle témat, vzorců, tabulek a pojmů,
   - otevření pasáže v kontextu stránky.
3. **Výpočtová laboratoř.**
4. **Technologie pivovaru:** profil pivovaru a zařízení.
5. **Receptury a várky:** evidence a analýza várek.
6. **Analýza problémů:** oblast T, chatbot nad várkami, výpočty a literaturou.
7. **Zkušenosti sládků.**
8. **Správa znalostí:**
   - tematické oblasti A–T,
   - rešerše z internetu (zdroj, datum, důvěryhodnost),
   - přístup, náklady na AI, kapacita a modely.

- **Sekce se načítá líně.** Start appky má rezervu jen ~1,6 kB, proto používá
  jen ikony, které appka už má. Těžké knihovny (pdf.js, KaTeX) se načtou až
  v prohlížeči stránky.
- **Mobil:** dotykové cíle ≥ 44 px a písmo ≥ 11 px. Barvy jen z povolených
  rodin (`neutral-900/950` a `amber`), kontrast ověřuje CI. Citace a pasáže
  jdou označit (`.lze-vybrat`).

## 12. Bezpečnost, soukromí, autorská práva

- **Přístup je fail-closed.** Rozhoduje databázová funkce `bible_pristup()`
  v hlavním projektu:
  - admin, šéf, sládek, boss a manažer mají správu;
  - ostatní mají přístup, jen když jim admin povolí modul „Pivovarská bible"
    v Uživatelé → Práva (`profiles.permissions.bible`; vlastní práva si
    uživatel změnit nemůže, hlídá to trigger);
  - bez povolení = žádný přístup, i při chybě.
  Projekt bible je pro prohlížeč zavřený (RLS bez politik, žádná práva pro
  anon/authenticated, bucket bez politik). bible-api každý požadavek ověří
  v hlavním projektu (`/auth/v1/user` — odhlášení i zablokování platí hned —
  a `bible_overeni()`: schválený e-mail, heslo, limit 300 požadavků za
  minutu, přístup). Výpadek hlavního projektu = odmítnuto. Zapisuje se jen
  přes SQL funkce projektu bible, které práva hlídají znovu. Smazat dokument
  smí jen správce (přispěvatel jen svoje nedokončené nahrání).
- **Offline mezipaměť:** texty knih se do mezipaměti telefonu (IndexedDB)
  neukládají. Bible má vlastního klienta bez offline mezipaměti (`lib/bibleKlient.ts`).
- **Klíče** jsou jen v app_secrets a GitHub secrets. Frontend žádný klíč nemá.
- **Veřejné repo:** knihy, texty, pasáže ani embeddingy nesmí do gitu, migrací
  (jejich SQL je veřejné), logů ani artefaktů.
- **Autorská práva:**
  - knihovna je interní (4 uživatelé);
  - u každého dokumentu je potvrzení práv a poznámka k licenci;
  - Anthropic na datech z API ve výchozím stavu netrénuje;
  - odpovědi citují krátké úryvky a export celých knih appka nenabízí;
  - poskytovatelé, kteří na datech trénují, se nepoužijí.
- **Zálohy:**
  - metadata (dokumenty, zkušenosti, web, nastavení, náklady) jdou
    do šifrované denní zálohy;
  - odvozené tabulky (strany, pasáže, vektory) se nezálohují, jdou znovu
    vytvořit z originálů;
  - originály mají druhou kopii u majitele.

## 13. Náklady (odhad pro dnešní knihovnu ≈ 412 MB)

- **Zpracování:**
  - digitální PDF je zdarma (textová vrstva);
  - sken přes Haiku stojí ≈ 0,001 USD za stranu, tedy 10 000 stran ≈ 10 USD;
  - kontext pasáží ≈ 5 USD.
  Jednorázově jde o jednotky až nízké desítky USD. Ověří pilot na první knize.
- **Dotaz (Opus 5.5):** 15–30 tisíc vstupních a 1–3 tisíce výstupních tokenů
  ≈ 0,08–0,20 USD (≈ 2–5 Kč). Sonnet stojí polovinu.
- **Supabase:** bible má vlastní Free projekt ve vlastní organizaci (DB 500 MB,
  Storage 1 GB, soubor ≤ 50 MB) — appka pivovaru o nic nepřijde. Free projekt
  se po týdnu bez aktivity uspí; plánované zpracování (každé 3 hodiny)
  a denní záloha do něj ale sahají. Při růstu Pro za 25 USD měsíčně.
- **GitHub Actions:** 0 Kč (veřejné repo).

## 14. Datový model

Schéma projektu bible: `bible/supabase/migrations/` (základ
`20261101000000_bible_zaklad.sql` = etapy 1 a 2 přenesené z hlavního
projektu, bez `profiles` a bez cizích klíčů na `auth.users`). V hlavním
projektu zůstávají migrace `20261231410000` a `20261231420000` (běžely) a
prázdné tabulky; zápis do nich zavřela `20261231430000`.

Etapa 1:
- `bible_dokumenty`: metadata, soubor (cesta, SHA-256, velikost, MIME),
  stav a postup zpracování, licence a potvrzení práv, duplicita a verze
  zpracování.
- Hlavní projekt: `bible_pristup()` a `bible_overeni()`.
- Projekt bible: `bible_kapacita()`, zápis za uživatele `bible_zaloz_nahrani`,
  `bible_potvrd_nahrani`, `bible_uprav_popis`, `bible_nastav_stav`,
  `bible_smaz_dokument` (jen service role) a bucket `knihovna` bez politik.

Etapa 2:
- `bible_strany`: pdf_index, tištěná strana, jistota, zdroj textu, text,
  kvalita, ke_kontrole.
- `bible_kapitoly` (strom), `bible_objekty` (tabulky, vzorce, obrázky)
  a `bible_pasaze` (text, kontext, rozsah stran, fulltext).
- `ai_naklady`, `bible_nastaveni` a RPC fronty.

Etapa 3: `bible_zkusenosti` (důvěryhodnost 1–5).

Etapa 4: RPC `bible_hledej`; po měření `bible_vektory (pasaz_id, model_key,
embedding halfvec)`.

Etapa 5: `bible_konverzace`, `bible_zpravy` (odpověď, citace, model, tokeny,
cena).

Etapy 7–9: profil pivovaru, receptury a várky, `bible_web_zdroje`.
