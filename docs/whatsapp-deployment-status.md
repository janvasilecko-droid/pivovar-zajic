# Stav nasazení WhatsApp backendu — RESUMÉ

> **Poslední aktualizace**: 2026-08-10 (18. kolo — Tasker/AutoNotification odstraněny, WhatsApp jde přes cloudovou bránu; viz kolo 18 na konci)
> **Účel**: záchranný dokument — kam se navázalo, co je hotové, co zbývá.

## 📌 Klíčové údaje

| Co | Hodnota |
|---|---|
| Supabase projekt (ref) | `sasqexjadvlqyticxwja` |
| Region | West EU (Ireland) |
| URL frontendu (PWA) | https://zajic-pivovar.pages.dev |
| Webhook URL (cloudová brána / Make.com) | `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook` |
| Auto-parse URL | `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-auto-parse` |
| Management API token | **v `.env`** (klíče `SUPABASE_ACCESS_TOKEN` a `SB_TOKEN`) — `.env` je v gitignoru |
| Dashboard Supabase | https://supabase.com/dashboard/project/sasqexjadvlqyticxwja |

## ✅ HOTOVO (ověřeno 2026-08-08)

1. **Tabulka `whatsapp_incoming`** v produkci — migrace `20260807120000_add_whatsapp_incoming_table.sql` (HTTP 201).
   - Sloupce: sender_name, sender_number, message_text, message_timestamp, message_type, status (pending/processing/parsed/imported/error/ignored), error_message, parsed_place_id/name, parsed_delivery_day, parsed_delivery_date, parsed_note, parsed_items, imported_order_id/at, webhook_id/timestamp.
   - Indexy na status, created_at, sender_name, webhook_id. Realtime zapnut.
2. **RLS politiky** — migrace `20260808130000_add_whatsapp_incoming_rls_write_policies.sql` (HTTP 201).
   - `Users can view` (SELECT, authenticated), `Users can update` (UPDATE), `Users can delete` (DELETE), `Service role can manage` (ALL).
3. **Edge funkce nasazené**:
   - `whatsapp-webhook` (deploy s `--no-verify-jwt` + **sdílené tajemství** `x-webhook-token`, viz 9. kolo níže)
   - `whatsapp-auto-parse` (AI parsing zpráv)
4. **E2E test prošel naživo**: zpráva → webhook → DB → AI parsing → realtime → modál Schválit/Zamítnout → schválení → **vytvořená objednávka** (id `1cc5004a-4699-4f2c-8acc-6e68a396599e`, 3× 12° KEG 50l + 2× 13° KEG 30l, den so).
5. **Testovací zprávy v DB** (lze smazat): Hospoda U Zajíce (čt), Restaurace Na Růžku (po), Pivnice U Dvou Sudů (st) — status `parsed`; Testovací odběratel (webhook) — status `imported`.
6. **Frontend** na Cloudflare Pages, projekt `zajic-pivovar` (verze v1.511+).

## 🛠 Skripty (v `scripts/`)

- `test-whatsapp-webhook.mjs` — pošle 3 testovací zprávy na webhook (potřebuje `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` a nově i `WEBHOOK_SECRET` z `.env`).
- `set-webhook-secret.mjs [secret]` / `--remove` — nastaví/odebere sdílené tajemství webhooku (`WEBHOOK_SECRET`) a zapíše ho do `.env` (potřebuje `SB_TOKEN`).
- `apply-whatsapp-migration.mjs [název_souboru.sql]` — aplikuje migraci přes Management API (potřebuje `SB_TOKEN` z `.env`; default = 20260807120000).
- `check-whatsapp-policies.mjs` — výpis RLS politik `whatsapp_incoming` (potřebuje `SB_TOKEN`).

## ⚠️ DŮLEŽITÉ (návod na pokračování)

1. **NIKDY** nespouštět `supabase login --token <PAT>` — Supabase tím token **zneplatní** (takhle umřel první token). Místo toho:
   - pro CLI: `$env:SUPABASE_ACCESS_TOKEN = (z .env)` + `npx supabase functions deploy ...`
   - pro Management API: skripty `apply-whatsapp-migration.mjs` / přímý `fetch` s `Authorization: Bearer <token>`.
2. Token je uložen v `.env` (gitignorováno) — **NEKOMMITOVAT**.
3. Pokud token přestane fungovat → vygenerovat nový na https://supabase.com/dashboard/account/tokens a zapsat do `.env`.
4. Deploy edge funkcí:
   ```powershell
   Set-Location d:\stazene\zajic\project
   $env:SUPABASE_ACCESS_TOKEN=(Get-Content .env | Where-Object {$_ -match '^SUPABASE_ACCESS_TOKEN='}) -replace '^SUPABASE_ACCESS_TOKEN=',''
   npx --yes supabase@latest functions deploy whatsapp-webhook --no-verify-jwt --project-ref sasqexjadvlqyticxwja
   npx --yes supabase@latest functions deploy whatsapp-auto-parse --project-ref sasqexjadvlqyticxwja
   ```
   (varování "Docker is not running" je neškodné, deploy proběhne bez Docketu)

## 🔜 ZBÝVÁ ZÍTRA

1. **Uživatel nastaví Tasker** → přímé volání webhooku (bez Make.com) dle `docs/tasker-direct-webhook.md`:
   - Profil: Event → AutoNotification → Intercept (WhatsApp)
   - Úloha: Net → HTTP Request POST na webhook URL, body:
     `{"sender":"%antitle","message":"%antext","timestamp":"%antime","senderNumber":"%annumber","webhookId":"%TIMEMS"}`
2. **Uživatel pošle reálnou WhatsApp zprávu** (WhatsApp → "Message yourself") a ověříme:
   - Tasker Run log → HTTP Request
   - záznam v `whatsapp_incoming` (status pending → parsed)
   - modál v aplikaci → schválení → objednávka
3. **Ověřit** pomocí REST dotazu (service role key z `.env`):
   `https://sasqexjadvlqyticxwja.supabase.co/rest/v1/whatsapp_incoming?select=*&order=created_at.desc&limit=5`
4. **Volitelně**: Make.com jako mezistanice (filtry/logy/Sheets) — návod viz `docs/whatsapp-make-integration.md`.
5. **Volitelně**: smazat testovací zprávy z DB a token pak v dashboardu odstranit (až bude vše stabilní).

## 📁 Nové/změněné soubory (2026-08-08)

- `supabase/migrations/20260808130000_add_whatsapp_incoming_rls_write_policies.sql` (nová)
- `scripts/apply-whatsapp-migration.mjs` (nový)
- `scripts/check-whatsapp-policies.mjs` (nový)
- `docs/tasker-direct-webhook.md` (nový)
- `scripts/test-whatsapp-webhook.mjs` (upraven)
- `.env` (přidány `SUPABASE_ACCESS_TOKEN`, `SB_TOKEN`)

---

## 🔄 AKTUALIZACE 2026-08-08 (2. kolo): správné přiřazení piv + výběr zpráv

### Co se opravilo/přidalo

1. **Správné přiřazování piv a obalů** (špatné druhy piva v objednávkách):
   - `whatsapp-auto-parse` nyní páruje každou položku s katalogem a ukládá `beer_id`/`pkg_id`
     (dřív bylo vždy `null` a objednávka obsahovala jen textový název od AI).
   - Matcher dává **přednost původnímu textu objednávky** (`raw_line`) před názvem od AI
     (AI si občas „vymyslí" pivo podle stupně, např. „13° jantar" → „13 Hazy Bunny"; matcher
     správně najde **Jantar**). Stupeň rozlišuje 12° Světlá vs 12° Tmavá (i zkratky „12sv"/„12tl").
   - Obaly: „KEG 50l" → obal „50l" (vytažení objemu + aliasy z `parser_aliases`).
   - **Opraven dotaz na `parser_aliases`** — četl neexistující sloupce `beer_name/package_label`,
     takže AI nedostávala naučené zkratky. Teď čte `beer_id/package_id` a převede je na názvy.
   - **Aplikovaná migrace `20260802010000_add_beers_short_name.sql`** — sloupec `short_name`
     v produkci chyběl a kvůli němu padal dotaz na katalog piv.
   - **Kontrolní modál** (`WhatsAppOrderReviewModal`) je teď **editovatelný**: každá položka má
     výběr piva + obalu + množství, předem doplněné z katalogu. Uživatel případně opraví
     přiřazení a teprve pak schválí. Opravy se učí do `parser_aliases` (alias → pivo/obal).

2. **Výběr zpráv, které se mají načítat**:
   - **Whitelist odesílatelů**: tabulka `whatsapp_senders` (migrace
     `20260808140000_add_whatsapp_senders.sql`, aplikováno HTTP 201).
     - **Jediný zdroj objednávek = WhatsApp skupina „Objednávky pivovar"** — ta je v whitelistu.
     - Správa v **Nastavení → WhatsApp — povolení odesílatelé** (přidat/odebrat kontakt).
     - Prázdný seznam = načítají se zprávy od **všech** (zpětně kompatibilní).
     - Když je v seznamu aspoň jeden kontakt → webhook zprávy od nepovolených odesílatelů
       **neuloží** (odpověď `skipped: true`) — do aplikace tak neprojdou vůbec.
   - **Auto-parse**: všechny zprávy ze skupiny se uloží jako `parsed` (i bez rozpoznaných
     položek — doplní se ručně v kontrolním modálu). Starší zprávy od nepovolených odesílatelů
     označí jako `ignored` (zmizí z aplikace).
   - **Ruční výběr v seznamu**: `WhatsAppAutoProcessorModal` má checkboxy u každé zprávy
     + tlačítko „Načíst vybrané (N)". Nepovolené odesílatele označí oranžovým štítkem.

### Ověřeno naživo
- `2x 12° světlý ležák 50l` → **12° Světlá** + obal 50l ✓
- `1x 13° jantar 30l` → **Jantar** + obal 30l ✓ (i když AI vrátila „13 Hazy Bunny")
- `2x 12° tmavý ležák 30l` → **12° Tmavá** + 30l ✓
- Whitelist: nepovolený odesílatel → webhook zprávu **neuloží** (`skipped`), povolený (skupina) → `parsed` ✓
- Lokální test matcheru: `scripts/test-whatsapp-matcher.mjs` (7 případů OK)
- Frontend: `npm run build` OK

### Nasazení
- `whatsapp-auto-parse` redeploynut (verze s `matcher_version: 3` v odpovědi).
  ```powershell
  $env:SUPABASE_ACCESS_TOKEN=(Get-Content .env | Where-Object {$_ -match '^SUPABASE_ACCESS_TOKEN='}) -replace '^SUPABASE_ACCESS_TOKEN=',''
  npx --yes supabase@latest functions deploy whatsapp-auto-parse --project-ref sasqexjadvlqyticxwja
  ```
- Nové/skripty: `scripts/test-whatsapp-matcher.mjs`, `scripts/test-whatsapp-e2e.mjs`,
  `scripts/test-whatsapp-whitelist.mjs`.

### Poznámky / TODO
- Staré testovací zprávy v `whatsapp_incoming` (manual/test-*) zůstaly — lze smazat.
- Pokud chcete, aby se i staré `parsed` zprávy přepočítaly s novým matcherem: stačí jim
  nastavit status zpět na `pending` a spustit auto-parse (nebo otevřít kontrolní modál —
  ten páruje na straně klienta automaticky).


## 🔄 AKTUALIZACE 2026-08-08 (3. kolo): test month-exportu v aplikaci

### Co se přidalo / opravilo
1. **Refaktoring test skriptů** — logika testu měsíce přesunuta do sdíleného
   `scripts/month-order-pipeline.mjs` (rozdělení exportu → třídění/slučování →
   AI parsing s keší). `scripts/test-month.mjs` je teď jen report (výstup 17/17
   zůstal stejný), `scripts/seed-whatsapp-inbox.mjs` ji sdílí.
2. **NOVÝ skript `scripts/seed-whatsapp-inbox.mjs`** — nasetuje finálních
   17 objednávek z `month-export.txt` do `whatsapp_incoming` (status `pending`,
   validní `message_timestamp`, chronologické `created_at`), přidá odesílatele
   do whitelistu a vypíše očekávané výsledky pro kontrolu v aplikaci.
   - `--clear` = smazat test zprávy, `--clear-orders` = + smazat test objednávky
     (poznámka obsahuje marker „TEST z month-exportu…“),
   - `--reparse` = reset `error` → `pending` + serverové AI,
   - `--prefill` = doplnit `parsed_*` z AI keše (když serverové AI nejede).
3. **Oprava bugu `kw.label is not a function`** v `whatsapp-auto-parse`:
   `noteKeywords` má `label` buď jako funkci, nebo statický string (např.
   „faktura“, „sleva“, „zaplaceno“) — volání `kw.label(m)` házelo TypeError,
   takže každá zpráva s textem „faktura/zaplaceno/sleva/bez etikety…“
   končila ve stavu `error`. Nasazeno jako verze 9.

### Ověřeno naživo
- `node scripts/seed-whatsapp-inbox.mjs` → 17/17 vloženo, 16 rozparsováno
  serverovým AI, 1 zpráva (Gábina „fakture“) nejdřív spadla na výše opraveném
  bugu a po nasazení opravy jí chyběla jen AI (Anthropic), takže byla doplněna
  přes `--prefill` z ověřené keše. Výsledek: 16 `parsed` + 1 `imported` (Eigl —
  import naživo z aplikace ✓).
- Kontrolní modál (`WhatsAppOrderReviewModal`) importuje z uložených
  `parsed_items` — funguje i bez živého AI volání.

### ⚠️ DŮLEŽITÉ — kredit Anthropic API
- `parse-order-text` běží přes **Anthropic API** (klíč v `app_secrets`) a aktuálně
  **došel kredit** → živé parsování nových zpráv teď vrací 502
  („Your credit balance is too low…“). Dokud se nedoplní kredit na Anthropic,
  nové zprávy nepůjdou rozparsovat. Testovací data v aplikaci tím netrpí
  (jsou už rozparsovaná / doplněná z keše).


## 🔄 AKTUALIZACE 2026-08-08 (4. kolo): notifikace o nové WhatsApp objednávce

### Co se přidalo / opravilo
1. **Notifikace o nové WhatsApp objednávce k ověření funguje na VŠECH obrazovkách**
   aplikace (dříve jen na stránce Objednávky — `Orders.tsx` je mountovaný jen tam,
   takže na ostatních obrazovkách žádná notifikace neletěla).
   - `src/components/Layout.tsx` má teď globální realtime listener na
     `whatsapp_incoming` (INSERT + UPDATE, dedup dle `id`, status
     pending/processing/parsed, filtrace dle whitelistu odesílatelů).
   - Nová `notifyNewWhatsAppMessage()` v `src/lib/notifications.ts` — zvuk,
     vibrace, systémová notifikace („📥 NOVÁ WHATSAPP OBJEDNÁVKA K OVĚŘENÍ“)
     i in-app banner; kliknutí přepne na Objednávky (event `pivovar:go-orders`).
   - Z `Orders.tsx` odstraněna duplicitní raw notifikace + beep (řeší globální
     listener) — automatický kontrolní modál + počítadlo zůstávají.
2. Verze aplikace → **1.525** (build `tsc && vite build` OK).


## 🔄 AKTUALIZACE 2026-08-08 (5. kolo): oprava testu Malešice (chat text „Ty máme 3x / Tak 1x15 + 1x20l" + obaly SV 12)

### Problém
Testovací zpráva Malešice (`seed-month-15-msknx0jz`, „[TEST z month-exportu — smazat po kontrole]")
měla v `parsed_items`:
1. **falešnou položku** `1× Jantar 15l [Tak 1x15 + 1x20l]` — zbytek cizí konverzace
   (odpověď Bednáře na POJMIho dotaz „Tak 20l?"), který pipeline nesprávně sloučil
   do objednávky Malešice (pravidlo `FOLLOWUP_PREFIX_RE` chytalo „Ty máme 3x" / „Tak ..."),
2. **všechny 3 položky SV 12 s obalem „0.5l"** místo KEG 50l / PET 1.5l / Lahve 0.5l.

### Příčiny a opravy
| # | Soubor | Příčina | Oprava |
|---|---|---|---|
| 1 | `scripts/month-order-pipeline.mjs` | Follow-up se sloučil i přes prokládanou zprávu JINÉHO odesílatele | Nový krok 1c: krátká odpověď (≤ 8 slov / ≤ 50 znaků) na prokládanou zprávu jiného odesílatele se vyfiltruje („Ty máme 3x / Tak 1x15 + 1x20l" i „3x30 čeho / Desítky") |
| 2 | `supabase/functions/parse-order-text/index.ts` | Prompt neuměl ignorovat chatový text mimo objednávku | Nové pravidlo 7 v sekci „ODPOVĚDI NA ZPRÁVY = KONTEXT" + konkrétní příklad Malešice; přečíslováno na 7–11 |
| 3 | `src/lib/orderParser.ts` (`parseGeminiItems`) | „bottle override" (20x0,5 → Lahve 0.5l) přepisoval obal VŠEM položkám na compound řádku | Override smí přepsat JEN položky s lahvovým obalem od AI nebo bez obalu, jejichž množství odpovídá počtu lahví |
| 4 | `supabase/functions/whatsapp-auto-parse/index.ts` (`matchPackageId`) | Pároval obal proti CELÉMU `raw_line` → nejdelší label katalogu vyhrál („0.5l" pro všechny položky řádku) | Páruje primárně z `package_label` od AI (obal konkrétní položky); `raw_line` jen jako záloha |
| 5 | `scripts/test-whatsapp-matcher.mjs` | Zrcadlový test | Stejná oprava jako #4 + nové testovací případy Malešice (SV 12 compound řádek, Jantar) |

### Nasazeno
- `parse-order-text` → **v9** (Management API, HTTP 201, ACTIVE)
- `whatsapp-auto-parse` → **v10** (Management API, HTTP 201, ACTIVE)
- `tsc --noEmit` → OK

### Ověřeno
- `node scripts/test-whatsapp-matcher.mjs` → 12/12 ✅ (SV 12 compound řádek vrací 50l / 1.5l / 0.5l)
- `node scripts/test-month.mjs` → „Ty máme 3x Tak 1x15 + 1x20l" VYFILTROVÁNO (nesloučí se),
  Malešice = 5 položek (3× KEG 50l + 24× PET 1.5l + 20× Lahve 0.5l + 3× KEG 30l + 12× PET 1.5l),
  objednávek k AI: **16** (dřív 17 — „3x30 čeho / Desítky" je dotaz POJMI, teď se správně vyfiltruje).
  Do AI keše doplněn čistý Malešice prefill (5 položek bez junk textu) — kvůli vyčerpanému kreditu Anthropic.
- **DB opravena**: `parsed_items` zprávy `e45baf4e-de23-4a96-bda0-8a84159b07cd` přepsáno na 5 správných
  položek (správné `beer_id`, `pkg_id`, `package_label`).

### ⚠️ Poznámky
- Prompt oprava (#2) se nasadila, ale **živé AI parsování nelze ověřit** dokud se nedoplní
  kredit Anthropic (vrací 502).
- Frontend (PWA) přebere opravu #3 (`orderParser.ts`) až po příštím buildu/`vite build`.
- Testovací zprávy z month-exportu lze smazat: `node scripts/seed-whatsapp-inbox.mjs --clear`
  (+ `--clear-orders`), případně ručně smazat zprávu `e45baf4e-...`.

## 🔄 AKTUALIZACE 2026-08-08 (6. kolo): AI se učí z oprav uživatele

### Co se nastavilo
Cílem je, aby si AI zapamatovala opravy, které uživatel udělá v review modálu
(nebo ručním importu) — a příště je použila sama.

1. **`saveAlias` (pivo/obal)** — oprava merge: když uživatel opraví JEN pivo
   (nebo JEN obal), nesmaže se druhá naučená dimenze (`beer_id`/`package_id`
   v `parser_aliases`). Dřív `update` přepisoval obě pole → jedna oprava mazala
   druhou naučenou zkratku.
2. **Tabulka `place_aliases`** (migrace `20260808150000_add_place_aliases_table.sql`,
   HTTP 201) — učení odběratele: `wrong_name → place_id + correct_name` + RLS
   pro `authenticated`.
3. **`savePlaceAlias` / `loadPlaceAliasMap`** — nyní reálně ukládají/čtou
   do/ze Supabase (`place_aliases`). Dřív tiše selhávaly (sloupec `place_id`
   v `parser_aliases` neexistoval, tabulka `place_aliases` nebyla vytvořená).
4. **`WhatsAppOrderReviewModal`** — přidán `PlaceCombobox` pro opravu odběratele;
   při schválení se uloží alias (špatný název od AI → správný odběratel) a
   opravené `parsed_place_id`/`parsed_place_name` jdou do vytvářené objednávky.
5. **`WhatsAppImportModal`** — oprava místa učí `prevName (od AI) → správný
   odběratel` (dřív se učil jen samotný správný název).
6. **`month-order-pipeline.mjs`** — načítá reálné aliasy odběratelů z DB a
   předává je AI (`placeAliasMap`, `placeAliases`) místo `new Map()` / prázdného pole.
7. **`cleanup-db.mjs`** — `place_aliases` přidáno do seznamu mazaných tabulek.

### Jak to funguje (celý kruh učení)
- Oprava piva/obalu/odběratele v UI → `saveAlias`/`savePlaceAlias` do DB.
- Při příštím parsování `whatsapp-auto-parse` čte `parser_aliases` +
  `place_aliases` → posílá je jako hinty do promptu `parse-order-text`
  (sekce „NAUČENÉ ZKRATKY…" a „NAUČENÉ ALIASY ODBĚRATELŮ") a používá je
  v `matchBeerId`/`matchPackageId`/`matchPlaceSafely`.

### Nasazeno
- Migrace `20260808150000_add_place_aliases_table.sql` → HTTP 201 (tabulka + RLS ověřeny dotazem).
- Edge funkce `parse-order-text`/`whatsapp-auto-parse` se měnit nemusely —
  `place_aliases` už čtou.
- Frontend (PWA) přebere změny po příštím `vite build`.

### Ověřeno
- `tsc --noEmit` → OK
- `node scripts/test-whatsapp-matcher.mjs` → 12/12 ✅
- DB: `place_aliases` má sloupce `id, wrong_name, place_id, correct_name,
  hit_count, created_at, updated_at` + RLS politiky SELECT/INSERT/UPDATE/DELETE.

## 🔄 AKTUALIZACE 2026-08-09 (7. kolo): Kontrola čtení — rozšířená (A–F)

### Co se nastavilo (celý seznam vylepšení)
1. **Fuzzy shoda** v `whatsappReadback` — tolerance překlepů a prohozeného
   pořadí slov („keg 50l" ≈ „50l KEG"), skóre shody 0–1.
2. **Kontrola po částech** — množství / objem / stupeň se porovnávají zvlášť,
   čipy u položky ukážou přesně, co nesedí.
3. **„Přečíst znovu (AI)"** v review modálu — znovu spustí AI čtení, uloží
   nový přepis, položky i `readback_unmatched_count`; starý přepis se uchová
   pro srovnání („dvojí čtení" bez dvojí ceny).
4. **Blokace schválení při ⚠** — přísný režim (checkbox, localStorage) zakáže
   Schválit, dokud nejsou nesoulady opraveny; jinak varovné potvrzení.
5. **Skóre důvěryhodnosti** 0–100 % + slovní hodnocení, barevný odznak.
6. **Diff přepisu vs. originál** — slova, která AI přidala/přehlédla.
7. **Side-by-side** zobrazení (desktop originál vlevo / přepis vpravo).
8. **Filtr „jen ⚠"** a řazení podle počtu nesouladů v Auto-Importu.
9. **Auto-posun na první ⚠ položku** + zvýraznění rámečkem.
10. **Stav „zkontrolováno"** — `readback_checked_at/by` audit při schválení.
11. **Náhled fotky** — `media_url` (webhook `mediaUrl`/attachments).
12. **Učení z oprav** — už existovalo (`saveAlias`/`savePlaceAlias`); navíc
    opakované chyby se nabízejí k opravě.
13. **Statistika** — Auto-Import: čeká/rozparsováno/⚠ + přesnost čtení z 100 zpráv.
14. **Opakované chyby** — raw_line, který se u odesílatele nepovedlo přečíst 2×.
15. **Srovnání čtení** po re-parse (diff starý vs. nový přepis).
16. **⚠ notifikace** — při rozparsování s nesouladem přijde zřetelná notifikace.
17. **Wait-time** — odznak „čeká X min/h" (+ červený u starých ⚠).
18. **Odkaz na originál** — `orders.whatsapp_message_id`, čip „WhatsApp" na
    objednávce otevře zprávu (read-only režim modálu).
19. **Backfill skript** — `scripts/backfill-whatsapp-readback.mjs` dopočítá
    `readback_unmatched_count` starým zprávám (bez AI).
20. **DB** — `readback_unmatched_count` ukládá auto-parse i re-parse.
21. **Status `flagged`** — nahrazeno sloupcem `readback_unmatched_count`
    (ekvivalentní funkcionalita bez nového statusu).
22. **Média** — infrastruktura připravena (`media_url`, webhook, náhled);
    skutečné nahrávání do Storage vyžaduje Make/Tasker stranu.
23. **Čištění** — `scripts/cleanup-whatsapp.mjs` (staré imported/ignored zprávy).
24. **Kontext odpovědí** — `whatsapp-auto-parse` posílá AI posledních 5 zpráv
    od stejného odesílatele.
25. **Duplicity** — `findSimilarMessages` (Jaccard ≥ 0.85) + odznak
    „možná duplicita".
26. **Rychlá odpověď zákazníkovi** — NENÍ (vyžaduje Make webhook zpět do WhatsApp).

### Nasazeno / nutné nasadit
- **Migrace** `20260810120000_add_whatsapp_readback_and_media.sql` — vytvořena,
  aplikace do produkce vyžaduje platný `SB_TOKEN`:
  `node scripts/apply-whatsapp-migration.mjs 20260810120000_add_whatsapp_readback_and_media.sql`.
- **Edge funkce** `whatsapp-auto-parse` a `whatsapp-webhook` je nutné
  redeploynout (`npm run watch-deploy`).
- **Frontend (PWA)** — přebere po `npm run build` (hotovo, ✓ built).

### Ověřeno
- `tsc --noEmit` → OK
- `npm run build` → ✓ built
- `vitest` → 78/78 (z toho `whatsappReadback.test.ts` 25 testů: fuzzy shoda,
  části qty/objem/stupeň, skóre, diff, opakované chyby, duplicity).
- Skripty: `backfill-whatsapp-readback.mjs --dry-run` se připojil k DB
  (sloupec zatím chybí, dokud se neaplikuje migrace).

## ✅ AKTUALIZACE 2026-08-09 (8. kolo): NASAZENO + E2E OVĚŘENO

### Co se dnes dokončilo
1. **Migrace aplikovány do produkce (obě HTTP 201)**:
   - `20260810120000_add_whatsapp_readback_and_media.sql` — sloupce
     `readback_unmatched_count`, `readback_checked_at`, `readback_checked_by`,
     `media_url`, `orders.whatsapp_message_id`.
   - `20260809100000_add_whatsapp_parsed_raw_text.sql` — **sloupec `parsed_raw_text`
     v produkci CHYBĚL** (migrace se nikdy neaplikovala). Kvůli němu tiše padal
     update v `whatsapp-auto-parse` (kód chybu z update nečeká) a zprávy zůstávaly
     navěky ve stavu `processing`. Po aplikaci migrace parsing funguje.
2. **Backfill**: `scripts/backfill-whatsapp-readback.mjs` dopočítal
   `readback_unmatched_count` pro **všech 31 starých zpráv** (všechny = 0, tj.
   raw_line se v originálu nacházejí).
3. **E2E test naživo** (webhook → DB → auto-parse → AI):
   - Testovací zpráva od odesílatele **„Objednávky pivovar"** (UTF-8, diakritika)
     uložena správně, whitelist ji povolil, AI rozparsovala 2 položky:
     `2x 12° Světlá/KEG 50l` + `1x Jantar/KEG 30l` (správné `beer_id`/`pkg_id`).
   - `readback_unmatched_count = 0`, `parsed_raw_text` uložen („dvojí čtení"
     funguje), den `so`.
   - Testovací zprávy smazány z DB, `scratch/test-utf8-webhook.mjs` smazán.
4. **Frontend 1.542** sestaven a nasazen na Cloudflare Pages (`zajic-pivovar`).
5. **Ztužení `whatsapp-auto-parse` proti tichému selhání update** (kořenová
   příčina dnešního bugu): nová helper funkce `safeUpdateMessage` kontroluje
   chybu z každého `supabase.update()`. Když se plný update nepovede (např.
   chybějící sloupec), zkusí minimální update na `status`+`error_message`; podle
   kontextu zpráva skončí jako `error` (viditelně, bez automatického retry) nebo
   se vrátí do `pending`. Zpráva tak už **nikdy nemůže uvíznout v `processing`**.
   Nasazeno (deploy funkce OK) a znovu ověřeno E2E: webhook → auto-parse →
   `status=parsed`, `parsed_raw_text` uložen, položky rozparsované,
   `readback_unmatched_count=0` (testovací zprávy uklizeny).

### Poznámky / rizika
- `.env` byl při editaci přepsán PowerShell `Set-Content -Encoding UTF8`, což
  přidalo **BOM** a rozbilo parsování v Node skriptech — BOM odstraněn (pozor při
  dalším zápisu `.env`). PowerShell `Invoke-WebRequest` s `-Body` navíc posílá
  tělo v systémové kódové stránce (diakritika → `�`) — pro testy webhooku
  používat Node skripty s UTF-8 soubory, ne PowerShell řetězce.
- ~~`whatsapp-auto-parse` nekontroluje chyby z `supabase.update()`~~ → **opraveno**
  (viz bod 5 výše): všechny update jdou přes `safeUpdateMessage`, který při
  selhání uloží alespoň `status`+`error_message` (zpráva nikdy nezůstane v
  `processing`).
- **Oprava pole „Odběratel" v `WhatsAppOrderReviewModal`** — při vizuální kontrole
  (demo zpráva „Test Sládek") se uživateli „nedal objednavatel do pole". Příčina:
  inicializace odběratele probíhala až PO asynchronním `loadAliasMap()` (síťový
  dotaz), takže když uživatel začal psát dřív, jeho vstup se přepsal
  `parsed_place_name`. Nyní se odběratel předvyplňuje SYNCHRONNĚ (bez čekání na
  aliasy), uživatelský vstup se nepřepisuje a opravený odběratel se při schválení
  zapíše i zpět do `whatsapp_incoming` (přežije znovuotevření modálu). Regresní
  testy: `WhatsAppOrderReviewModal.place-repro.test.tsx` (3) +
  `place-race.test.tsx` (1).

### Zbývá (není nutné pro funkčnost)
1. **Vizuální kontrola UI** — v DB je demo zpráva od „Test Sládek (kontrola čtení)"
   (id `2166ff96-29df-422e-ab3c-def62b95f444`, `readback_unmatched_count=2`):
   Objednávky → WhatsApp → „Kontrola čtení — originál vs. přepis AI" + ⚠ odznak.
   Smazat: `node scripts/verify-whatsapp-readback.mjs --cleanup`.
2. **Uživatel nastaví Tasker** → přímé volání webhooku (viz `docs/tasker-direct-webhook.md`).
3. **Uživatel pošle reálnou zprávu** a ověří modál + objednávku.
4. **Volitelně**: smazat staré testovací zprávy (`scripts/cleanup-whatsapp.mjs`)
   a odstranit Management API token z dashboardu, až bude vše stabilní.


---

## 🔐 AKTUALIZACE 2026-08-09 (9. kolo): bezpečnostní audit

### Co se opravilo
1. **Service-role klíč odstraněn z klientské aplikace** (kritická díra).
   - `src/lib/supabase.ts` dříve exportovalo `supabaseAdmin` klienta s `service_role`
     JWT z `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite takový klíč vkládá do JS bundle,
     takže by si ho mohl z webu vytáhnout kdokoliv a číst/mazat úplně všechno
     (včetně WhatsApp zpráv), bez přihlášení a s obejitím RLS.
   - Veškerá volání `supabaseAdmin` v UI (`Catalogs.tsx`, `orderParser.ts`) přepsána
     na běžného přihlášeného klienta `supabase` — tabulka `places` už má RLS politiky
     pro `authenticated`, takže admin klient nebyl potřeba.
   - Ověřeno: `tsc && vite build` OK; v `dist` bundle se klíč **nenachází**
     (kontrola hledala řetězec `service_role` a otisk klíče).
2. **Webhook má sdílené tajemství `x-webhook-token`**.
   - `whatsapp-webhook` nově kontroluje hlavičku `x-webhook-token` proti proměnné
     `WEBHOOK_SECRET` (nastavené přes Management API jako projektový secret).
     Bez správné hlavičky vrací HTTP 401 a zprávu neuloží.
   - Nastavení/změna/vypnutí: `node scripts/set-webhook-secret.mjs [secret]` /
     `node scripts/set-webhook-secret.mjs --remove`. Tajemství je zapsáno v `.env`
     (gitignorováno).
   - **Tasker/Make musí posílat hlavičku** `x-webhook-token: <secret>` (viz
     `docs/tasker-direct-webhook.md`).
3. **Návod Tasker/Make aktualizován** (`docs/tasker-direct-webhook.md` v1.1).

### ⚠️ DŮLEŽITÉ — rotace service-role klíče (ručně v dashboardu)
Klíč mohl být v minulosti vystaven při lokálním buildu (`npm run build` s `.env`).
Po nasazení této opravy je dobré klíč **otočit**:
1. Jdi na https://supabase.com/dashboard/project/sasqexjadvlqyticxwja/settings/api
2. U `service_role` klíče klikni **Rotate** (nebo nový klíč).
3. Novou hodnotu zapiš do `.env` (klíč `VITE_SUPABASE_SERVICE_ROLE_KEY`) — používají
   ho už jen dev skripty v `scripts/`; frontend ho nepotřebuje.





---

## 🔐 AKTUALIZACE 2026-08-09 (10. kolo): automatické mazání zpráv od nepovolených odesílatelů

### Požadavek
Do aplikace se mají dostat JEN zprávy ze skupiny **„Objednávky pivovar“**. Všechny
ostatní zprávy (od jiných odesílatelů) se mají automaticky mazat z databáze.

### Co se udělalo
Migrace `supabase/migrations/20260818000000_auto_delete_non_whitelisted_whatsapp.sql`
(aplikována na produkci) přidává tři úrovně ochrany:

1. **BEFORE INSERT pojistka** — trigger `trg_whatsapp_check_sender_allowed` na
   `whatsapp_incoming`: zpráva od odesílatele, který není ve `whatsapp_senders`
   (a whitelist není prázdný), se do DB **vůbec neuloží** (řádek se nezaloží).
   Prázdný whitelist = povoleno vše (zpětně kompatibilní chování).
2. **Při odebrání odesílatele ze whitelistu** — trigger
   `trg_whatsapp_delete_on_sender_removed` na `whatsapp_senders`: smaže všechny
   uložené zprávy toho odesílatele (přestal být povolený → nemá v DB co dělat).
3. **Očista stávajících zpráv** — součást migrace: smazány všechny dosavadní zprávy
   od odesílatelů mimo whitelist (bylo jich 34 od 15 odesílatelů; záloha uložena).

### Ověřeno (Management API)
- Triggery aktivní (`trg_whatsapp_check_sender_allowed`, `trg_whatsapp_delete_on_sender_removed`).
- Po očistě: `whatsapp_incoming` = 0 řádků.
- INSERT zprávy od nepovoleného odesílatele → řádek se nevytvoří (počet zůstává 0).
- INSERT zprávy od „Objednávky pivovar“ → uloží se.
- Odebrání odesílatele z whitelistu → jeho zprávy se automaticky smažou; whitelist obnoven.

### Záloha
Před očistou byl obsah `whatsapp_incoming` (34 zpráv) uložen do
`../whatsapp-incoming-backups/whatsapp_incoming_2026-08-09.json` (mimo git).
Kdyby bylo potřeba cokoliv obnovit, skript `scripts/backup-whatsapp-incoming.mjs`
vytvoří novou zálohu stejným způsobem.

### Poznámky
- Webhook (`whatsapp-webhook`) už od dřívějška zprávy od nepovolených odesílatelů
  neukládal (odpovídá `skipped: true`); triggery jsou pojistka pro všechny ostatní
  cesty (SQL konzole, seed, Make bez filtru).
- Není potřeba nová verze frontendu ani redeploy funkce — jde o čistě databázovou změnu.


---

## 📬 AKTUALIZACE 2026-08-11 (22. kolo): vlastní zprávy (from_me) obcházejí whitelist — propisují se do aplikace i ze soukromých zpráv

### Požadavek
Majitel potřebuje, aby se do aplikace propisovaly **VŠECHNY jeho vlastní zprávy** —
ze skupiny i ze soukromých (1:1) konverzací (např. zpráva sám sobě, psaní a úprava
objednávek). Dosud vlastní zprávy procházely whitelistem jako zákaznické, takže
soukromá zpráva od majitele (sender „Vasil“ / `16896468508730`, ve whitelistu není)
se v bridge zahodila.

### Změna chování
- **Vlastní zprávy (`from_me=true`) whitelist OBEJDOU na všech vrstvách** — píše je
  sám majitel ze spárovaného telefonu (žádné riziko spamu). Aplikace je rozliší
  podle flagu `from_me`.
- Bridge přeposílá i soukromé (1:1) vlastní zprávy; webhook je uloží, DB trigger
  nezahodí a auto-parse zpracuje (i pro odesílatele mimo whitelist).

### Co se změnilo
- `whatsapp-bridge/index.js` — `isOwn` (fromMe) přeskočí `isGroupAllowed` /
  `isContactAllowed` (vlastní zpráva z 1:1 se nezahodí).
- `supabase/functions/whatsapp-webhook/index.ts` — whitelist a chat_id pojistka se
  pro `from_me` přeskočí.
- `supabase/functions/whatsapp-auto-parse/index.ts` — `isSenderAllowed` vrací pro
  `from_me=true` vždy `true`.
- `supabase/migrations/20260811130000_from_me_bypass_whitelist.sql` (nová) — trigger
  `check_whatsapp_sender_allowed` vrací `NEW` pro `from_me=true` dřív než whitelist.

### Nasazení (provedeno)
1. `node scripts/apply-whatsapp-migration.mjs 20260811130000_from_me_bypass_whitelist.sql`
2. `node scripts/deploy-function.mjs whatsapp-webhook`
3. `node scripts/deploy-function.mjs whatsapp-auto-parse`
4. Push `whatsapp-bridge` → Render auto-deploy.

### Ověřeno
- E2E webhook: POST s `from_me=true` a senderem mimo whitelist → uloženo
  (`from_me=true`), negativní kontrola (`from_me=false`) → `skipped`, testovací
  řádek uklizen.
- Test uživatele: zpráva sám sobě (1:1) ze spárovaného telefonu → dorazí do
  aplikace s `from_me=true`.

---


## 📬 AKTUALIZACE 2026-08-11 (21. kolo): vlastní zprávy (from_me) se zpracovávají

### Změna chování
- **WhatsApp bridge** přeposílá i vlastní zprávy (odeslané ze spárovaného telefonu / Webu)
  s flagem `fromMe: true` (commit b8411c05 — zrušené ignorování `from_me` na bridge).
- **Webhook funkce**, **DB trigger** i **whatsapp-auto-parse** už vlastní zprávy
  NEZahazují — uloží se s `from_me=true` a projdou stejným whitelistem jako zákaznické.
  Aplikace je rozliší flagem `from_me`.
- Týká se to testování: zpráva ze spárovaného telefonu do skupiny „Objednávky pivovar“
  teď dorazí do aplikace (skupina je v whitelistu podle názvu).

### Co se změnilo
- `supabase/functions/whatsapp-webhook/index.ts` — odstraněno `skipped` pro from_me.
- `supabase/functions/whatsapp-auto-parse/index.ts` — odstraněn bypass pro from_me.
- `supabase/migrations/20260811120000_allow_from_me_messages.sql` (nová) — trigger
  `check_whatsapp_sender_allowed` už nehází `RETURN NULL` pro `from_me=true`.
- `whatsapp-bridge/index.js` — fromMe zprávy se vyhodnocují (místo „ignoruji“).

### Nasazení (provedeno)
1. `node scripts/apply-migration.mjs 20260811120000_allow_from_me_messages.sql`
2. `node scripts/deploy-function.mjs whatsapp-webhook`
3. `node scripts/deploy-function.mjs whatsapp-auto-parse`

---

## 📜 AKTUALIZACE 2026-08-11 (23. kolo): starší WhatsApp zprávy (historie) se přeposílají do aplikace

### Požadavek
Majitel chce do aplikace dostat i **starší zprávy** z WhatsApp (historii chatu), ne jen
nově příchozí — např. dřívější objednávky ve skupině „Objednávky pivovar“ nebo vlastní
zprávy ze soukromých konverzací („Message yourself“).

### Jak to funguje
WhatsApp po připojení propojeného zařízení posílá historii v dávkách (history sync).
Bridge ji teď zpracovává:

- `syncFullHistory: true` v Baileys (dříve `false`) → po připojení čeká na historii.
- Nový handler `messaging-history.set` sbírá dávky; kolektor vybere **nejnovějších
  `HISTORY_MAX_MESSAGES` zpráv** (default **1000**) a přeposílá je sekvenčně s rozestupem,
  aby se nepřetížil webhook / auto-parse.
- Historie jde **stejným pipeline jako živé zprávy**: whitelist (cizí nepovolení odesílatelé
  se vyfiltrují), `from_me` bypass (vlastní zprávy projdou vždy) a dedup podle `key.id`
  / `webhook_id` (zpráva, která už byla přeposlaná živě, se neuloží dvakrát).
- Zprávy si zachovávají **původní čas odeslání** (`messageTimestamp`).
- Stará média (fotky) se v historii nestahují — text a popisky se přeposílají.

### Konfigurace (env proměnné na Renderu — defaulty stačí, měnit nemusíš)
| Proměnná | Default | Význam |
|---|---|---|
| `SYNC_HISTORY` | `on` | `off` vypne history sync |
| `HISTORY_MAX_MESSAGES` | `1000` | kolik nejnovějších zpráv historie max. přeposlat (0 = nic) |

### Poznámky
- **Ověřeno na produkci (2026-08-11):** commit `cee504c6` je live, ale u UŽ
  SPÁROVANÉHO zařízení WhatsApp historii po běžném reconnectu neposílá (Baileys
  počká 20 s a pokračuje dál). Historie se posílá **při párování** (INITIAL_BOOTSTRAP,
  cca 3 měsíce). Pro získání starých zpráv proto stačí zařízení **znovu spárovat**:
  1. WhatsApp → Nastavení → Propojená zařízení → „WhatsApp Bridge“ → **Odpojit**.
  2. Otevřít `https://whatsapp-bridge-g1v0.onrender.com/qr` a naskenovat nový QR.
     (Bridge po odhlášení automaticky smaže session a vygeneruje nový QR — viz níže.)
  3. Během ~10–20 s telefon pošle historii → bridge ji přeposílá do aplikace
     (limit `HISTORY_MAX_MESSAGES`).
- **Bridge se po odhlášení zařízení (logged out) resetuje sám**: `clearSession`
  vymaže `whatsapp_session` a služba vygeneruje nový QR — žádné ruční mazání v DB.
- Kolektor zpracuje historii do ~5 s po skončení přenosu; v logu bridgu hledej
  `[history] zpracovávám N nejnovějších zpráv historie…`.

### Nasazení (provedeno)
1. Změny v `whatsapp-bridge` (`lib/history.js` nový, `index.js`, `package.json`, testy).
2. Push → Render auto-deploy (ověřeno v logu: `[history] sync zapnut…`).

---


## 🔐 AKTUALIZACE 2026-08-09 (11. kolo): filtr podle chat_id + ignorování vlastních zpráv (from_me)

## 🔐 AKTUALIZACE 2026-08-09 (11. kolo): filtr podle chat_id + ignorování vlastních zpráv (from_me)

### Požadavek
Zpracovávat **JEN zprávy z jedné konkrétní skupiny „Objednávky pivovar“**,
ideálně podle stabilního **chat_id** (ne názvu), a **ignorovat vlastní zprávy**
(`from_me == false`) — aby nevznikla smyčka (AI → odpověď → Tasker → webhook).
Do AI posílat **jen poslední zprávu** (jméno + text), ne celou konverzaci, a
logovat zpracované zprávy včetně chat_id. Pokud chat_id není známé, vypsat ho do
logu při první zprávě ze skupiny.

### Podmínka zpracování (implementováno ve webhooku)
```
IF (chat_id == "ID_SKUPINY" AND from_me == false) → zpracuj
ELSE → ignoruj
```

### Co se udělalo
**1. Migrace `supabase/migrations/20260818120000_whatsapp_chat_id_from_me_filter.sql`**
(aplikována na produkci, HTTP 201):
- Sloupce: `whatsapp_senders.chat_id`, `whatsapp_incoming.chat_id`,
  `whatsapp_incoming.from_me` (boolean, default false).
- Funkce `whatsapp_norm()` — normalizace názvu (malá písmena + bez diakritiky →
  „objednavky pivovar“ == „Objednávky pivovar“).
- Trigger `trg_whatsapp_check_sender_allowed` rozšířen:
  - `from_me = true` → řádek se **NIKDY** nevytvoří (prevence smyčky i na úrovni DB);
  - jinak povoleno, když `sender_name` odpovídá whitelistu **NEBO** `chat_id`
    odpovídá zaregistrovanému chat_id.
- Trigger `trg_whatsapp_delete_on_sender_removed` + očista: maže/čistí podle
  jména **NEBO** chat_id; navíc smazány všechny `from_me` zprávy.

**2. Webhook `whatsapp-webhook` (redeploy):**
- Payload nově přijímá `chatId`/`chat_id` a `fromMe`/`from_me` (aliasy).
- `from_me` → vždy `skipped:true, from_me:true`, **nikdy se neuloží** (včetně
  heuristiky „You:/Ty:/Vy:“ pro vlastní zprávy z jiného zařízení/Webu).
- Pokud je chat_id zaregistrováno ve `whatsapp_senders` → **striktní filtr**
  podle chat_id (cizí/chybějící chat_id se zahodí s logem).
- Dokud chat_id zaregistrováno není → přechodný filtr podle názvu skupiny +
  **log detekce**: `🆔 DETEKCE chat_id pro skupinu "Objednávky pivovar": chat_id="…"`.
- Zpracovaná zpráva se loguje: `✅ ZPRACOVÁNO: sender=… chat_id=… webhook_id=… msg=…`.

**3. AI parsing `whatsapp-auto-parse` (redeploy):**
- **Odstraněn kontext předchozích zpráv** — do AI jde jen **poslední zpráva**
  (jméno odesílatele + text), ne celá konverzace.
- Pojistka: zpráva s `from_me = true` se v žádném případě neposílá k AI
  (označí se `ignored`).

**4. Skripty:**
- `scripts/set-whatsapp-senders.mjs` — nové přepínače
  `--chat-id "<id>"` (registrace stabilního chat_id) a `--clear-chat-id` (odebrání);
  výpis whitelistu ukazuje i chat_id.
- `scripts/test-whatsapp-webhook.mjs` — otestuje bránu (nepovolený odesílatel,
  from_me, skupina s/bez chat_id).
- `scripts/verify-whatsapp-group-gate.mjs` — E2E: nepovolený → skipped, from_me →
  skipped, skupina → pending → parsed; včetně striktního režimu (špatné chat_id →
  skipped) a kontroly v DB.

### Ověřeno (Management API + naživo)
- **Přechodný režim** (bez registrovaného chat_id): nepovolený odesílatel ani
  from_me se neuloží; skupina „Objednávky pivovar“ → pending → AI parsed.
- **Striktní režim** (s dočasně registrovaným chat_id): zpráva bez chat_id →
  skipped (`chat_id_missing`), špatné chat_id → skipped (`chat_id_unknown`),
  správné chat_id → pending → AI parsed. Placeholder byl po testu **odstraněn**.
- DB: `whatsapp_incoming` = 0 řádků (testovací zprávy smazány), whitelist =
  „Objednávky pivovar“ **bez** chat_id (připraven na doplnění skutečného ID).
- Triggery, sloupce i funkce `whatsapp_norm` ověřeny dotazem.

### Jak doplnit skutečné chat_id
1. Pošli zprávu do skupiny — webhook ji zpracuje podle názvu a do logu funkce
   vypíše: `🆔 DETEKCE chat_id pro skupinu "Objednávky pivovar": chat_id="…"`.
2. Zaregistruj: `node scripts/set-whatsapp-senders.mjs --chat-id "<id>"`.
3. Ověř: `node scripts/verify-whatsapp-group-gate.mjs`.

### Poznámky
- `fromMe` AutoNotification neumí → v Taskeru se posílá `false`; vlastní zprávy
  z jiného zařízení/Webu webhook pozná sám (prefix „You:/Ty:/Vy:“) a zahodí.
- Do AI se posílá jen poslední zpráva — zpráva se ukládá po jedné a auto-parse
  zpracovává každou zvlášť (bez minulých zpráv v promptu).


---

## 🚨 AKTUALIZACE 2026-08-10 (12. kolo): tichý výpadek — chybějící `x-webhook-token` v Taskeru

### Symptom
Uživateli přišly **2 zprávy do skupiny „Objednávky pivovar“**, ale do aplikace se
**nic nepropsalo** (`whatsapp_incoming` v produkci byla **úplně prázdná**).

### Diagnóza (ověřeno na produkci)
1. REST dotaz: `whatsapp_incoming` = **0 řádků** → zprávy se nikdy neuložily.
2. `whatsapp_senders`: „Objednávky pivovar“, `chat_id = null` → aktivní je název-filter.
3. **`WEBHOOK_SECRET` je nastavené** na projektu (secret `WEBHOOK_SECRET` existuje).
4. Webhook (verze 7) vyžaduje hlavičku `x-webhook-token` → bez ní vrací **HTTP 401**.
5. **Tasker (nastavený podle `docs/tasker-direct-webhook-podrobne.md` v2.0) hlavičku
   neposílal** → každá zpráva skončila 401 a byla tichou ztrátou.
6. Live test: POST bez hlavičky → **401**; POST s hlavičkou + UTF-8 → **uloženo** (pending)
   → auto-parse → **parsed** (položky spárovány s katalogem). Celý řetězec funguje.

### Příčina
- `docs/tasker-direct-webhook-podrobne.md` (v2.0, 2026-08-08) nemělo v tabulce
  hlaviček `x-webhook-token`. Dokument `tasker-direct-webhook.md` (v1.2) ji uvádí.

### Oprava
1. **Tasker**: do HTTP Request doplnit hlavičku `x-webhook-token: <WEBHOOK_SECRET>`
   (hodnota z `.env`). Bez ní se zprávy neuloží.
2. **Dokumentace**: `tasker-direct-webhook-podrobne.md` v2.1 — povinná hlavička
   zvýrazněna + troubleshooting „HTTP 401“.
3. **Webhook v8**: přidán `console.warn` při neúspěšné autorizaci (401 je teď vidět
   v logech funkce). Nasazeno, `verify_jwt=false` (přijímá bez JWT).

### Stav po opravě (2026-08-10)
- `whatsapp_incoming` = 0 řádků (testovací zprávy smazány).
- Webhook v8 aktivní, end-to-end ověřen (webhook → auto-parse → parsed).
- Zbývá: **v Taskeru doplnit hlavičku** a odeslat zkušební objednávku.


---

## ✅ AKTUALIZACE 2026-08-10 (13. kolo): přesný Tasker payload ověřen naživo

### Co se ověřilo
POST na webhook s **přesně tím tvarem, jaký posílá Tasker** (hlavička
`x-webhook-token` + `Content-Type: application/json`, body na jeden řádek
s epoch-milisekundovým `timestamp` a víceřádkovým `message`):

```json
{"sender":"Objednávky pivovar","message":"Ahoj sládku, na čtvrtek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!","timestamp":"<epoch ms>","senderNumber":"+420777111222","webhookId":"tasker-live-<ms>","chatId":"","fromMe":false}
```

Výsledek:
1. **HTTP 200** → uloženo jako `pending` (id `9e58cf46-…`).
2. `whatsapp-auto-parse` (volané stejně jako frontend, s anon klíčem) → **parsed**,
   **2 položky spárované s katalogem** (2× 12° Světlá **KEG 50l** + 1× Jantar **KEG 30l**,
   `beer_id`/`pkg_id` vyplněny, `place=null` = odběratele doplní uživatel v modálu).
3. DB ověřena, testovací zpráva **smazána** (`whatsapp_incoming` = 0 řádků).

### Co to znamená pro uživatele
- **Serverová strana je 100% hotová.** Stačí jen v Taskeru opravit HTTP Request:
  hlavička `x-webhook-token: <secret z .env>` + body (viz `docs/tasker-direct-webhook-podrobne.md` v2.2).
- Testovací zprávu posílat **DO SKUPINY „Objednávky pivovar“** (ne „Message yourself“ —
  odesílatel by nesouhlasil s whitelistem a zpráva by se zahodila).
- `chatId`/`fromMe` v těle jsou volitelné (prázdné `chatId` je OK — funguje název-filter).

---

## ✅ AKTUALIZACE 2026-08-10 (14. kolo): hotový importovatelný Tasker soubor

### Co přibylo
- **`tasker/whatsapp-do-pivovaru.tsk.xml`** — Tasker úloha „WhatsApp do pivovaru“
  s jedinou akcí **HTTP Request** (kód 339), která se **importuje přímo v Taskeru**
  (záložka ÚLOHY → dlouhý stisk → Import). Žádné ruční opisování.
- Formát XML je ověřený proti **reálným Tasker exportům** (kód 339 = HTTP Request,
  `arg1=1` = POST, `arg2` = URL, `arg3` = hlavičky, `arg5` = JSON body, `arg8` = timeout).

### Co soubor obsahuje
- URL: `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook`
- Metoda: `POST`
- Hlavičky: `Content-Type: application/json` + `x-webhook-token: <WEBHOOK_SECRET>` (**povinná**)
- Body: `{"sender":"%antitle","message":"%antext","timestamp":"%antime","senderNumber":"%annumber","webhookId":"%TIMEMS","chatId":"%anwhatsappchatid","fromMe":false}`
- Timeout: 30 s

### Ověření (2026-08-10, produkce)
- XML validní (well-formed, .NET parser), JSON tělo validní, všechny proměnné
  (`%antitle`, `%antext`, `%antime`, `%annumber`, `%TIMEMS`, `%anwhatsappchatid`) přítomné.
- **Live test znovu spuštěn s přesně těmito hodnotami**: POST → **HTTP 200**,
  uloženo (`pending`) → `whatsapp-auto-parse` → **parsed**, 2 položky spárované
  s katalogem (2× 12° Světlá **KEG 50l** + 1× 13° Hazy Bunny **KEG 30l**).
- Testovací zpráva smazána — `whatsapp_incoming` = **0 řádků**.

### Zbývá (na uživateli)
1. Importovat `tasker/whatsapp-do-pivovaru.tsk.xml` do Taskeru.
2. Přepojit profil AutoNotification Intercept na importovanou úlohu
   (a starou úlohu smazat).
3. Odeslat zkušební objednávku **DO SKUPINY „Objednávky pivovar“** →
   zkontrolovat Run log (HTTP 200) a modál Schválit/Zamítnout v aplikaci.




---

## 🚨 AKTUALIZACE 2026-08-10 (15. kolo): stále „nepropsáno“ — prokázáno, že webhook NIC nedostává

### Co se zjistilo (kontrola produkce)

- Uživatel: „chodí další zprávy a pořád se nepropíšou“.
- `whatsapp_incoming` = **0 řádků**; `whatsapp_senders` = „Objednávky pivovar“ (`chat_id = null` → aktivní je **název-filtr**, nikoli striktní chat_id).
- **Logy edge funkcí** (Management API, dotaz nad `edge_logs`): za posledních 7 dní **ŽÁDNÉ volání** `/functions/v1/whatsapp-webhook`. V logu jsou jen REST requesty aplikace (PWA si čte `whatsapp_incoming`). → **Telefon na webhook nic neposílá.** Nejedná se o 401, ani o shozenou zprávu — request se k serveru vůbec nedostane.
- Serverová strana ověřena **naživo s přesným payloadem z `.tsk.xml`**: token v souboru = `WEBHOOK_SECRET` z `.env` (48 znaků, shoda ověřena), POST → **HTTP 200** → uloženo `pending` → AI parsing → úklid. Webhook funguje.

### Co přibylo na serveru (deploy 15. kolo)

1. **GET ping** na `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook` → vrací `{"ok":true}` (bez tokenu, nic citlivého). Slouží k rychlému ověření z TELEFONU, že URL a server fungují — odliší „neposílá telefon“ od „webhook odmítá“.
2. **Oprava času zprávy**: Tasker `%antime` je epoch **sekundy** (10 číslic) — webhook je nyní správně rozpozná a uloží reálný čas (dříve by skončil v roce 1970). Ověřeno naživo pro sekundy i ISO.

### Co to znamená a co udělat (uživatel — telefon)

`.tsk.xml` obsahuje **jen ÚLOHU**. Úloha se sama **nikdy** nespustí — musí ji spustit **PROFIL** (Událost → AutoNotification → Zachytit/Intercept). To je nejpravděpodobnější příčina: profil buď neexistuje, není zapnutý, nebo je stále propojený se STAROU úlohou (bez hlavičky → 401 → tichá ztráta).

Pořadí ověření na telefonu:

1. **Ping**: v prohlížeči na telefonu otevřít webhook URL (GET) → musí se zobrazit `{"ok":true}`.
2. **Profil**: Tasker → Profily → profil „AutoNotification Intercept“ musí být **zapnutý** (zelený) a jako úloha musí mít **„WhatsApp do pivovaru“** (klepnout na úlohu u profilu → změnit → vybrat importovanou). Starou úlohu smazat (pozor na „(2)“ při konfliktu názvů).
3. **Run log**: Tasker → Protokoly → Protokol běhu. Po zprávě ve skupině tam MUSÍ být HTTP Request. Není-li tam nic → AutoNotification nezachytává: zkontrolovat **přístup k notifikacím** a **optimalizaci baterie** pro Tasker i AutoNotification.
4. **Odesílatel**: zprávy posílat z **JINÉHO účtu** do skupiny „Objednávky pivovar“ (název skupiny musí souhlasit přesně — bez emoji/přípon). Zprávy odeslané z vlastního účtu (WhatsApp Web) se správně ignorují (from_me) a na telefonu ani negenerují notifikaci.

### Zbývá

- Úspěšný E2E průchod: zpráva z telefonu → webhook (HTTP 200 v Run logu) → modál Schválit/Zamítnout v aplikaci.


---

## ✅ AKTUALIZACE 2026-08-10 (16. kolo): oprava brány — název-filtr funguje i po zaregistrování chat_id + sjednocené porovnání diakritiky

### Co se opravilo

Brána (filtr, které zprávy se čtou do systému) měla dvě skryté vady:

1. **Název-filtr se vypínal po zaregistrování `chat_id`.** Jakmile měl alespoň jeden odesílatel ve
   `whatsapp_senders` vyplněné `chat_id`, webhook přepnul na „striktní filtr podle chat_id" a zprávu
   **bez** `chat_id` v payloadu tiše zahodil (`chat_id missing`) — i když přišla ze skupiny
   „Objednávky pivovar". Tasker `%anwhatsappchatid` ale řada verzí neposílá → ztráta objednávek.
   Stejnou vadu měl i `whatsapp-auto-parse` (takové zprávy by označil `ignored`).
   To odporovalo dokumentaci (`prázdné chatId je v pořádku — webhook filtruje podle názvu skupiny`).
2. **Nesjednocené porovnávání odesílatele.** Webhook porovnával bez diakritiky (NFD), frontend
   (`isSenderAllowed`) jen `toLowerCase()` → zpráva, kterou brána pustila (např. odesílatel
   „Objednavky pivovar"), by se v aplikaci mohla skrýt.

### Nové pravidlo brány (stejné ve webhooku, DB triggeru i auto-parse)

```
povoleno, když:
  • whitelist je prázdný (zpětně kompatibilní — vše), NEBO
  • sender_name odpovídá whitelistu (bez diakritiky a velikosti písmen), NEBO
  • chat_id zprávy odpovídá zaregistrovanému chat_id (skupina se mohla přejmenovat)
vlastní zpráva (from_me) se NIKDY neuloží (prevence smyčky)
```

Webhook navíc hlídá stabilitu: pokud odesílatel má registrované `chat_id` a zpráva posílá jiné
(`chat_id_unknown`) → zahodí. DB trigger (`check_whatsapp_sender_allowed`, `whatsapp_norm`)
a auto-parse už používání bez diakritiky podporovaly — sjednotil se k nim webhook a frontend.

### Co se změnilo (soubory)

- `supabase/functions/whatsapp-webhook/index.ts` — brána přepsána: whitelist podle názvu vždy aktivní,
  `chat_id` jako dobrovolná stabilizační pojistka; přijetí i podle `chat_id` (přejmenovaná skupina).
- `supabase/functions/whatsapp-auto-parse/index.ts` — `isSenderAllowed` stejné pravidlo (název NEBO chat_id);
  zprávy ze skupiny bez chat_id už NEkončí jako `ignored`.
- `src/lib/whatsappApi.ts` — `normSenderName()` + `isSenderAllowed` bez diakritiky (sjednoceno s webhookem/DB).
- `src/lib/whatsappApi.test.ts` — nové unit testy normalizace a whitelistu.
- `scripts/verify-whatsapp-group-gate.mjs` — rozšířen o testy: zpráva bez diakritiky (3b),
  zpráva bez chat_id při registrovaném chat_id (3c), špatné chat_id (4).

### Ověřeno naživo (produkce, 2026-08-10)

- **Bez registrovaného chat_id**: nepovolený odesílatel → `skipped`, from_me → `skipped`,
  skupina → `pending` → auto-parse → `parsed`; **„Objednavky pivovar" bez diakritiky → uloženo**.
- **S dočasně registrovaným chat_id** (placeholder, poté vráceno):
  - zpráva ze skupiny s platným chat_id → uložena;
  - **zpráva ze skupiny BEZ chat_id → uložena** (název-filtr funguje i po registraci chat_id);
  - **špatné chat_id → `skipped` (`chat_id_unknown`)**;
  - auto-parse: 3 parsed / 0 ignored.
- Testovací zprávy smazány, `chat_id` vrácen na `null` (whitelist = „Objednávky pivovar" bez chat_id).
- Edge funkce nasazeny: `whatsapp-webhook` **v11**, `whatsapp-auto-parse` **v17**.
- Frontend **v1.548** nasazen na Cloudflare Pages (`zajic-pivovar.pages.dev`).

### Zbývá (na uživateli — telefon)

- Úspěšný E2E průchod: zpráva z telefonu → webhook (HTTP 200 v Run logu) → modál Schválit/Zamítnout.
  Serverová strana je kompletní a ověřená — viz postup ověření v 15. kole (ping → profil → run log → odesílatel).

---

## ✅ AKTUALIZACE 2026-08-10 (17. kolo): filtr smazán a nastaven znova + živé ověření brány

Dle požadavku („filtry vymazat a nastavit znova“) byl whitelist kompletně resetován
a znovu nastaven:

1. `node scripts/set-whatsapp-senders.mjs` → smazal celý `whatsapp_senders`
   (byl prázdný — filtr byl vypnutý) a vložil **`Objednávky pivovar`** (bez chat_id).
   Filtr čtení je tedy opět **AKTIVNÍ** — do systému se čtou jen zprávy ze skupiny.
2. `node scripts/verify-whatsapp-group-gate.mjs` → **HOTOVO ✓ (brána funguje)**:
   - nepovolený odesílatel → `skipped` (neuloží se),
   - vlastní zpráva (`from_me`) → `skipped`,
   - „Objednávky pivovar“ → `pending` → auto-parse → `parsed` (2/2, 0 ignored),
   - „Objednavky pivovar“ bez diakritiky → prošlo (filtr sjednocen).
3. Testovací zprávy smazány — `whatsapp_incoming` je prázdná, whitelist je
   `["Objednávky pivovar"]` bez chat_id.

Zbývá (na uživateli — telefon): reálný E2E průchod z telefonu (ping → profil → run log → modál).

---

### 17b. Příprava večerního testu (2026-08-10)

Do whitelistu přidán kontakt **„Ala Milacek Milacek“** (`set-whatsapp-senders.mjs --add`,
skupina „Objednávky pivovar“ zachována) — manželka může posílat testovací objednávky
i přímo (1:1), ne jen do skupiny. Ověřeno naživo: zpráva od ní → webhook HTTP 200
`pending` (prošla bránou); testovací zpráva smazána, `whatsapp_incoming` prázdná.

Aktuální whitelist: `["Objednávky pivovar", "Ala Milacek Milacek"]` (bez chat_id).


---

## 🗑️ AKTUALIZACE 2026-08-10 (18. kolo): Tasker/AutoNotification odstraněny — WhatsApp jde přes cloudovou bránu

### Co se rozhodlo

Tasker (lokální zpracování na telefonu) se ruší — WhatsApp objednávky jdou
rovnou přes **cloudovou bránu** (Make.com / WhatsApp webhook → Supabase → AI
parsing). Je to efektivnější: telefon nemusí běžet, nezávisí na notifikacích,
zprávy se neztrácejí.

### Co bylo odstraněno

| Položka | Umístění |
|---|---|
| `taskerShareService.ts` | `src/lib/` — singleton pro příjem sdíleného textu z Taskeru/Android Share |
| `SimpleWhatsAppInbox.tsx` | `src/components/` — stará WhatsApp schránka (localStorage) |
| WhatsApp tab | `src/screens/OrdersTabbed.tsx` — tab „WhatsApp" s SimpleWhatsAppInbox odebrán |
| `receiveSharedText` handler | `android/.../MainActivity.java` — vrácen na default (jen `BridgeActivity`) |
| SEND intent-filter (`text/plain`) | `android/.../AndroidManifest.xml` — odebrán |
| `tasker-setup.md` | `docs/` |
| `tasker-direct-webhook.md` | `docs/` |
| `tasker-direct-webhook-podrobne.md` | `docs/` |
| `tasker-live-test.mjs`, `tasker-live-test-group.mjs` | `scratch/` |
| `whatsapp-do-pivovaru.tsk.xml` | `tasker/` (celá složka) |

Záloha všeho je v **`D:\stazene\zajic\_backup\tasker-2026-08-10\`** (mimo repo)
pro případ, že by bylo potřeba se vrátit.

### Co zůstává (cloudová brána)

- `supabase/functions/whatsapp-webhook` — příjem zpráv (v11),
- `supabase/functions/whatsapp-auto-parse` — AI parsing (v17),
- tabulka `whatsapp_incoming` + RLS + trigger brány (`check_whatsapp_sender_allowed`),
- whitelist: `["Objednávky pivovar", "Ala Milacek Milacek"]` (bez chat_id),
- frontend modály Schválit/Zamítnout v `src/screens/Orders.tsx`.

### Zbývá

- Zdroj dat pro webhook (Make.com scénář / WhatsApp Business API) — nastavení
  mimo repo, viz `docs/whatsapp-make-integration.md`.

---

## 🛠️ AKTUALIZACE 2026-08-10 (19. kolo): oprava „filtru čtení“ v bridge (Baileys gateway)

Cloudová brána se přepisuje na vlastní mikroslužbu
(`whatsapp-bridge/` — Baileys Multi-Device, běží na Renderu). Bridge má vlastní
filtr, které zprávy z WhatsAppu **přečte** a přepošle na webhook. Ten nebyl
konzistentní s autoritativní bránou (webhook + DB trigger + auto-parse) — opraveno:

| Vada | Projev | Oprava |
|---|---|---|
| Bridge filtroval skupiny **jen podle názvu** | Po přejmenování skupiny „Objednávky pivovar“ se zprávy tiše ztrácely (webhook by je přes registrované `chat_id` přijal) | Bridge povoluje skupinu podle názvu **NEBO `chat_id`** (stejné pravidlo jako webhook) |
| Whitelist v env (`ALLOWED_GROUPS`/`ALLOWED_CONTACTS`) byl oddělený od `whatsapp_senders` | Změny odesílatelů provedené v aplikaci (Nastavení → WhatsApp odesílatelé) bridge ignoroval → zprávy od nově povolených se zahazovaly | Bridge čte `whatsapp_senders` ze Supabase při startu a každých ~5 minut a sjednocuje ho s env proměnnými |
| Kontakty 1:1 jen podle `pushName` | Jméno nemuselo sedět se jménem ve whitelistu | Porovnává se jméno **nebo telefonní číslo** |
| `groupMetadata` se volala pro každou zprávu | Zbytečná zátěž API (limit WhatsAppu) | Cache názvů skupin (TTL 10 min) |

### Nové soubory / změny

- `whatsapp-bridge/lib/filter.js` — **brána filtru čtení** (pravidla = webhook:
  název NEBO `chat_id`, prázdný whitelist = vše; sjednocení `whatsapp_senders`
  + env; refresh 5 min).
- `whatsapp-bridge/index.js` — použití brány v `handleMessage`, cache názvů
  skupin, doplnění `messageType` do payloadu webhooku.
- `whatsapp-bridge/test/filter.test.mjs` — **9 unit testů brány** (`npm test`,
  bez sítě): přejmenovaná skupina přes `chat_id`, sjednocení whitelistů, výpadek
  čtení z DB apod.
- `whatsapp-bridge/package.json` — skript `test`.
- `whatsapp-bridge/README.md` — sekce „Filtr čtení (gate)“.

### Pravidla (platí pro celý řetězec)

```
zpráva je povolená ⇔ from_me ≠ true ∧ (název ∈ whitelist ∨ chat_id ∈ whitelist)
prázdný whitelist = povoleno vše; whitelist = whatsapp_senders ∪ env ALLOWED_*
```

Ověřeno: `npm run check` (syntax) + `npm test` (9/9 ✅).

## ✅ AKTUALIZACE 2026-08-11 (20. kolo): fotky z WhatsApp se stahují a ukládají

### Požadavek

**DeepSeek (textový model AI) fotky NEČTE.** Objednávka poslaná jako fotka se
proto musí v aplikaci zobrazit a dát stáhnout — kontrola objednávky je vždy na
člověku. Dřív se fotka **vůbec nepřeposílala**: s popiskem šel jen text, bez
popisku se zpráva ignorovala úplně.

### Co se udělalo

Bridge (`whatsapp-bridge/`) nyní pro každou zprávu s fotkou:

1. rozbalí `imageMessage` (i z `ephemeralMessage` / `viewOnceMessage`),
2. stáhne fotku ze serverů WhatsApp (Baileys `downloadMediaMessage` → Buffer),
3. nahraje ji do **veřejného Supabase Storage bucketu `whatsapp-media`**
   (cesta `incoming/wa-<key.id>.<ext>`),
4. veřejnou URL pošle webhooku jako `mediaUrl` → `whatsapp_incoming.media_url`.

Fotka **bez popisku** se přestala ignorovat — přeposílá se s placeholderem
`📷 Fotka objednávky (bez popisu)`, ať se dá v aplikaci najít a stáhnout.

### Nové soubory / změny

- `whatsapp-bridge/lib/media.js` — **stažení + upload médií** (čisté funkce
  `extensionFromMime`, `buildStoragePath`, `buildPublicUrl`; `ensureMediaBucket`,
  `uploadMediaToSupabase`, `prepareImageForForwarding`).
- `whatsapp-bridge/index.js` — fotky se zpracovávají i bez textu, `mediaUrl`
  v payloadu, kontrola bucketu při startu.
- `supabase/migrations/20261010000000_add_whatsapp_media_bucket.sql` — veřejný
  bucket + politika `whatsapp_media_public_read` (idempotentní).
- `src/components/WhatsAppOrderReviewModal.tsx` — tlačítka **Otevřít fotografii**
  a **Stáhnout fotografii**.
- `src/components/WhatsAppAutoProcessorModal.tsx` — ikona stažení u náhledu.
- `whatsapp-bridge/test/media.test.mjs` — **6 unit testů media helperů**.
- `whatsapp-bridge/README.md`, `.env.example`, `src/lib/whatsappApi.ts` — docs.

### Nasazení

1. ✅ Migrace `20261010000000_add_whatsapp_media_bucket.sql` **nasazena**
   (`scripts/apply-whatsapp-migration.mjs` → HTTP 201). Bucket ověřen přes
   Storage API: `id=whatsapp-media`, `public=true`.
2. Frontend redeploy (Vercel).
3. **Redepoly `whatsapp-bridge`** (Render) — fotky se začnou ukládat po restartu.
4. Volitelně: env `WHATSAPP_MEDIA_BUCKET` (default `whatsapp-media`).

### Ověření

- ✅ `npm run check` + `npm test` v `whatsapp-bridge/` (15/15 testů ✅, z toho
  6 media helperů).
- ✅ Celý Storage tok otestován na produkci: upload service role → **HTTP 200**,
  anonymní veřejný GET → **HTTP 200** (politika `whatsapp_media_public_read`
  funguje), delete → HTTP 200 (testovací objekt uklizen).
- Po redeply: pošli fotku do skupiny → v logu Renderu `[media] fotka uložena
  do Storage: https://…/whatsapp-media/…` → v aplikaci (Import z WhatsApp) je
  náhled + „Stáhnout fotografii“.

### Poznámky

- Storage URL je trvalá (WA URL by vypršela); při selhání uploadu se pošle aspoň
  dočasná přímá WA URL, při selhání stažení zpráva jde bez `mediaUrl`.
- Zápis do bucketu dělá jen bridge (service role); čtení je veřejné.
- Fotky **ne**jsou posílány do DeepSeek promptu — AI dostává jen text (popisek
  nebo placeholder), médium řeší člověk. Pokud se později přidá vision model,
  stačí mu dát `media_url` z `whatsapp_incoming`.

---

## ✅ AKTUALIZACE 2026-08-11 (21. kolo): WhatsApp AI fallback Gemini → Groq → Mistral → OpenAI (24/7)

### Co se změnilo

- `parse-order-text` má nový fallback řetězec:
  **Gemini (gemini-3.5-flash) → Groq (llama-3.3-70b-versatile) → Mistral (mistral-large-latest)
  → OpenAI (gpt-4o-mini)**.
  - Dříve: Gemini → Anthropic → OpenAI. **Anthropic odebrán** (bez kreditů, jen zdržoval);
    místo něj přidány **bezplatné pojistky Groq + Mistral** (free tier, bez karty).
  - Při chybě/vyčerpání limitu (HTTP 429/500) se funkce okamžitě přepne na dalšího providera (~0,5 s).
- **Nasazeno na produkci**: `node scripts/deploy-function.mjs parse-order-text` → **HTTP 201**,
  verze **20**, ACTIVE (2026-08-11).
- **E2E ověřeno**: `node scripts/test-parse-order-text-e2e.mjs` → **VÝSLEDEK: OK** (2 objednávky,
  správné přiřazení piva/obalu, bedny a place_name — přes Gemini).

### Soubory / změny

- `supabase/functions/parse-order-text/index.ts` — secrets `GROQ_API_KEY`+`MISTRAL_API_KEY`,
  `groqBody`/`mistralBody`, fallbacky 2) Groq, 3) Mistral, 4) OpenAI (`gpt-4o-mini`).
- `supabase/migrations/20261117000000_add_groq_api_key_secret.sql` (placeholder).
- `supabase/migrations/20261118000000_add_mistral_api_key_secret.sql` (placeholder).
- `docs/whatsapp-llm-fallback-deploy.md` — návod na zítra (klíče + ověření + test fallbacku).
- `docs/set-llm-api-keys.sql` — SQL připravené k vložení do Supabase SQL Editoru.
- Commity: `03090124` (Gemini→Groq→OpenAI), `48c1d05c` (+Mistral).

### 🔜 ZBÝVÁ ZÍTRA (pouze klíče)

1. GROQ klíč → https://console.groq.com (zdarma, `gsk_...`)
2. Mistral klíč → https://console.mistral.ai (zdarma, dlouhý klíč s tečkou)
3. Supabase SQL Editor → spustit `docs/set-llm-api-keys.sql` (doplnit reálné klíče)
4. Kontrola: `node scripts/test-parse-order-text-e2e.mjs` → „VÝSLEDEK: OK";
   provider v logu (Edge Functions → parse-order-text → Logs, hledat `PROVIDER=...`).
5. Volitelný test fallbacku: dočasně znehodnotit `GEMINI_API_KEY` → log ukáže `PROVIDER=groq` → vrátit klíč.

### Poznámky

- Klíče se ukládají do `app_secrets` (server-only, RLS zamčené); do Gitu ani `.env` se nezapisují.
- Migrace v repozitáři obsahují placeholder (`REPLACE_WITH_...`) — jen záznam pro `db push`;
  reálné klíče se nastaví SQL upsertem výše.

