# Stav nasazení WhatsApp backendu — RESUMÉ

> **Poslední aktualizace**: 2026-08-08 (pokračování zítra)
> **Účel**: záchranný dokument — kam se navázalo, co je hotové, co zbývá.

## 📌 Klíčové údaje

| Co | Hodnota |
|---|---|
| Supabase projekt (ref) | `sasqexjadvlqyticxwja` |
| Region | West EU (Ireland) |
| URL frontendu (PWA) | https://zajic-pivovar.pages.dev |
| Webhook URL (Make/Tasker) | `https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-webhook` |
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
   - `whatsapp-webhook` (deploy s `--no-verify-jwt` — žádná autorizace z Make/Taskeru)
   - `whatsapp-auto-parse` (AI parsing zpráv)
4. **E2E test prošel naživo**: zpráva → webhook → DB → AI parsing → realtime → modál Schválit/Zamítnout → schválení → **vytvořená objednávka** (id `1cc5004a-4699-4f2c-8acc-6e68a396599e`, 3× 12° KEG 50l + 2× 13° KEG 30l, den so).
5. **Testovací zprávy v DB** (lze smazat): Hospoda U Zajíce (čt), Restaurace Na Růžku (po), Pivnice U Dvou Sudů (st) — status `parsed`; Testovací odběratel (webhook) — status `imported`.
6. **Frontend** na Cloudflare Pages, projekt `zajic-pivovar` (verze v1.511+).

## 🛠 Skripty (v `scripts/`)

- `test-whatsapp-webhook.mjs` — pošle 3 testovací zprávy na webhook (potřebuje `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` z `.env`).
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

2. **Výběr zpráv, které se mají načítat** (oboje):
   - **Whitelist odesílatelů**: nová tabulka `whatsapp_senders` (migrace
     `20260808140000_add_whatsapp_senders.sql`, aplikováno HTTP 201).
     - Správa v **Nastavení → WhatsApp — povolení odesílatelé** (přidat/odebrat kontakt).
     - Prázdný seznam = načítají se zprávy od **všech** (zpětně kompatibilní).
     - Když je v seznamu aspoň jeden kontakt → automaticky se načítají (realtime modál + AI
       parsing) jen zprávy od povolených. Ostatní zůstávají `pending` v seznamu.
   - **Ruční výběr v seznamu**: `WhatsAppAutoProcessorModal` má checkboxy u každé zprávy
     + tlačítko „Načíst vybrané (N)". Nepovolené odesílatele označí oranžovým štítkem.
   - Edge funkce `whatsapp-auto-parse` nepovolené odesílatele **přeskočí** (summary `skipped`),
     zůstanou `pending` pro ruční zpracování.

### Ověřeno naživo
- `2x 12° světlý ležák 50l` → **12° Světlá** + obal 50l ✓
- `1x 13° jantar 30l` → **Jantar** + obal 30l ✓ (i když AI vrátila „13 Hazy Bunny")
- `2x 12° tmavý ležák 30l` → **12° Tmavá** + 30l ✓
- Whitelist: nepovolený odesílatel → `skipped` (zůstane `pending`), povolený → `parsed` ✓
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


