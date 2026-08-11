/*
# Store Mistral API key for AI order parsing (2nd fallback provider)

1. Changes
- Inserts/updates the MISTRAL_API_KEY row in app_secrets (server-only, RLS locked,
  same pattern as GEMINI_API_KEY / GROQ_API_KEY / OPENAI_API_KEY). Only edge
  functions using the service role can read this value.
2. Notes
- Used by `parse-order-text` edge function as the 3rd LLM provider in the
  fallback chain: Google Gemini → Groq (Llama 3.3 70B) → Mistral
  (mistral-large-latest) → OpenAI (gpt-4o-mini). If a provider returns an error
  or exhausts its daily quota (HTTP 429/500), the app switches to the next one
  immediately (~0.5 s) — so WhatsApp order reading works 24/7 without interruption.
- Get a free API key at https://console.mistral.ai (free tier, no credits needed).
- The real key must be set via Supabase SQL editor or dashboard (same as the
  Gemini/Groq/OpenAI keys were).
*/

-- !! IMPORTANT: Replace with your actual Mistral API key in Supabase dashboard !!
-- This is a placeholder. The real key must be set via Supabase SQL editor or dashboard.
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('MISTRAL_API_KEY', 'REPLACE_WITH_YOUR_MISTRAL_API_KEY', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
