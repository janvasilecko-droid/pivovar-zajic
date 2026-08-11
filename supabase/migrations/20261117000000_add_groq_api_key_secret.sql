/*
# Store Groq API key for AI order parsing (fallback provider)

1. Changes
- Inserts/updates the GROQ_API_KEY row in app_secrets (server-only, RLS locked,
  same pattern as GEMINI_API_KEY / OPENAI_API_KEY). Only edge functions using
  the service role can read this value.
2. Notes
- Used by `parse-order-text` edge function as the 2nd LLM provider in the
  fallback chain: Google Gemini → Groq (Llama 3.3 70B) → OpenAI (gpt-4o-mini).
  If Gemini returns an error / exhausted daily quota, the app switches to Groq
  immediately (~0.5 s), and if Groq also fails, it switches to OpenAI — so
  WhatsApp order reading works 24/7 without interruption.
- Get a free API key at https://console.groq.com (free tier, no credits needed).
- The real key must be set via Supabase SQL editor or dashboard (same as the
  Gemini/OpenAI keys were).
*/

-- !! IMPORTANT: Replace with your actual Groq API key in Supabase dashboard !!
-- This is a placeholder. The real key must be set via Supabase SQL editor or dashboard.
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('GROQ_API_KEY', 'REPLACE_WITH_YOUR_GROQ_API_KEY', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
