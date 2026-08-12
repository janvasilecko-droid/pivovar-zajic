# WhatsApp AI fallback — Gemini → Groq → Mistral → OpenAI (návod na zítra)

> **Stav k 2026-08-12**: nasazená verze 21 obsahuje i **validaci výstupu LLM**
> s auto-fallbackem na dalšího providera (viz níže). E2E + živý fallback test prošly.
> Klíče GROQ + MISTRAL už jsou vložené v `app_secrets` a ověřené (HTTP 200).

## Proč to je

`parse-order-text` (čtení objednávek z WhatsAppu) dříve zkoušel Gemini → Anthropic → OpenAI.
Anthropic nemá kredity (jen zdržoval), proto byl **odebrán** a místo něj přibyly dvě **bezplatné
pojistky** — Groq a Mistral. Výsledný řetězec:

```
1) Google Gemini (gemini-3.5-flash)          ← primární
2) Groq (llama-3.3-70b-versatile)            ← přepnutí okamžitě (~0,5 s)
3) Mistral (mistral-large-latest)            ← přepnutí okamžitě (~0,5 s)
4) OpenAI (gpt-4o-mini)                      ← poslední záchrana
```

Pokud jeden provider vrátí chybu nebo vyčerpá denní limit (HTTP 429/500), funkce se **automaticky
přepne na dalšího** — WhatsApp objednávky se čtou 24/7, i kdyby 3 ze 4 providerů spadly.

## ✅ Hotovo (nemusíte nic dělat)

- Kód: `supabase/functions/parse-order-text/index.ts` (fallbacky 2–4, secrets `GROQ_API_KEY` + `MISTRAL_API_KEY`).
- Migrace v repozitáři: `supabase/migrations/20261117000000_add_groq_api_key_secret.sql`, `20261118000000_add_mistral_api_key_secret.sql`.
- **Funkce nasazená** na produkci: `node scripts/deploy-function.mjs parse-order-text` → HTTP 201, verze 20, ACTIVE.
- **E2E test prošel**: `node scripts/test-parse-order-text-e2e.mjs` → „VÝSLEDEK: OK“ (2 objednávky správně přečtené přes Gemini).
- Push na GitHub: `48c1d05c`.

## ✅ Validace výstupu + auto-fallback na nevalidní odpověď (2026-08-12)

Fallback se dříve spouštěl **jen při chybě API** (HTTP 429/500/404). Od verze 21
navíc funkce **validuje samotný výstup** LLM a když neprojde, automaticky zkouší
dalšího providera. Odmítne se:

- neparsovatelný JSON (i s ``` fency/okolním textem),
- chybějící / nepole `items`, položky mimo schéma (špatné typy `quantity`,
  string polí apod.),
- výstup, který zjevně ignoroval katalog — méně než polovina rozpoznaných
  pivo/obal polí sedí na `beers`/`packages` (shoda je tolerantní k diakritice,
  mezerám a chybějícímu stupni, např. „Světlá" vs „12° Světlá").

Logy pak ukazují buď `PROVIDER=gemini` (výstup přijat), nebo
`PROVIDER=gemini → nevalidní výstup (...), zkouším dalšího providera`.

Testy (oba prošly):

```powershell
Set-Location d:\stazene\zajic\project
node scripts/test-parse-order-text-e2e.mjs          # E2E nasazené funkce (validní cesta)
node scripts/test-parse-order-validation.mjs        # unit test validátoru (13 případů)
node scripts/test-parse-order-fallback.mjs          # živý fallback: dočasně znehodnotí
                                                    # GEMINI klíč v app_secrets, ověří čtení
                                                    # přes fallback a klíč obnoví
```

## 🔜 ZÍTRA — jen 2 kroky

### Krok 1: API klíče (~5 minut)

1. **GROQ** (zdarma, bez karty): https://console.groq.com → *API Keys* → *Create API Key*
   → klíč začíná `gsk_...`
2. **MISTRAL** (zdarma, bez karty): https://console.mistral.ai → *API Keys* → *Create new key*
   → klíč začíná `XXXX.XXXX` (dlouhý řetězec s tečkou)
3. **Supabase dashboard** → https://supabase.com/dashboard/project/sasqexjadvlqyticxwja
   → levé menu **SQL Editor** → *New query* → vložit obsah souboru
   **`docs/set-llm-api-keys.sql`** → doplnit reálné klíče místo `REPLACE_ME` → **Run**.

   (GEMINI a OPENAI už v `app_secrets` jsou — nic s nimi nedělejte.)

### Krok 2: Ověření (~2 minuty)

```powershell
Set-Location d:\stazene\zajic\project
node scripts/test-parse-order-text-e2e.mjs
```
→ očekávaný výstup: `===== VÝSLEDEK: OK =====`

Provider vidíte v logu funkce: Supabase dashboard → **Edge Functions** → `parse-order-text`
→ **Logs** → hledejte `PROVIDER=gemini` / `PROVIDER=groq` / `PROVIDER=mistral`.

### Jak otestovat fallback (volitelné, ~2 min)

V SQL editoru dočasně znehodnotit Gemini klíč a poslat objednávku:

```sql
UPDATE app_secrets SET value = 'BAD_KEY_TEST', updated_at = now() WHERE key = 'GEMINI_API_KEY';
-- po testu vraťte správný klíč zpět:
UPDATE app_secrets SET value = '<správný GEMINI klíč>', updated_at = now() WHERE key = 'GEMINI_API_KEY';
```

Pak v logu funkce uvidíte přepnutí `PROVIDER=groq` (a případně dál `PROVIDER=mistral`).

## Poznámky

- Klíče se ukládají do tabulky `app_secrets` (server-only, RLS zamčené; čte je jen funkce
  se service role klíčem). Do Gitu ani `.env` je **NE** zapisovat.
- Migrace `2026...groq...` / `2026...mistral...` v repozitáři obsahují placeholder — slouží jen
  jako záznam pro `supabase db push`. Reálné klíče se nastavují SQL výše (upsert přes
  `ON CONFLICT ... DO UPDATE`).
- Nasazení funkce kdykoli znovu: `node scripts/deploy-function.mjs parse-order-text`.
