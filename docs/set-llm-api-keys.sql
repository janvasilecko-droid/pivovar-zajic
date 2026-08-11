-- ============================================================================
-- Nastavení API klíčů pro AI čtení objednávek z WhatsAppu
-- Fallback řetězec: Gemini -> Groq (Llama 3.3) -> Mistral -> OpenAI
-- Spustit v Supabase dashboard -> SQL Editor -> New query -> Run
-- Projekt: sasqexjadvlqyticxwja
-- ============================================================================

-- GROQ  (https://console.groq.com -> API Keys; zdarma, klíč začíná gsk_)
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('GROQ_API_KEY', 'gsk_REPLACE_ME', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- MISTRAL  (https://console.mistral.ai -> API Keys; zdarma, klíč je dlouhý s tečkou)
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('MISTRAL_API_KEY', 'REPLACE_ME_MISTRAL', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ============================================================================
-- GEMINI a OPENAI už v app_secrets jsou (z dřívějška) — nic s nimi nedělejte.
-- Kdyby bylo potřeba je obnovit, odkomentujte a doplňte hodnoty:
-- ============================================================================
-- INSERT INTO app_secrets (key, value, updated_at)
-- VALUES ('GEMINI_API_KEY', 'AIza...', now())
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
--
-- INSERT INTO app_secrets (key, value, updated_at)
-- VALUES ('OPENAI_API_KEY', 'sk-...', now())
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
