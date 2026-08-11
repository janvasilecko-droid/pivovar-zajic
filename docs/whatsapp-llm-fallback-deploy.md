# WhatsApp AI fallback — Gemini → Groq → Mistral → OpenAI (návod na zítra)

> **Stav k 2026-08-11**: kód hotový, nasazený (verze 20, HTTP 201) a E2E ověřený.
> **Zítra zbývá jen**: vložit 2 API klíče (GROQ + MISTRAL) a případně ověřit.
> Návod na pokračování dle `docs/whatsapp-deployment-status.md`.

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
