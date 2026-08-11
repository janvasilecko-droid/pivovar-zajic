/*
# Store Google Gemini API key for AI order parsing

1. Changes
- Inserts/updates the GEMINI_API_KEY row in app_secrets (server-only, RLS locked,
  same pattern as ANTHROPIC_API_KEY / OPENAI_API_KEY). Only edge functions using
  the service role can read this value.
2. Notes
- Used by `parse-order-text` and `parse-order-image` edge functions as the
  primary LLM provider (Gemini 3.5 Flash, native JSON mode + vision).
- Note: "gemini-2.5-flash" / "gemini-2.5-pro" return HTTP 404 for keys created
  after Gemini 2.5 was retired for new users, so the functions call
  gemini-3.5-flash (GA flash, same price/perf category as 2.5 flash).
- The real key must be set via Supabase SQL editor or dashboard (same as the
  OpenAI/Anthropic keys were).
*/

-- !! IMPORTANT: Replace with your actual Google Gemini API key in Supabase dashboard !!
-- This is a placeholder. The real key must be set via Supabase SQL editor or dashboard.
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('GEMINI_API_KEY', 'REPLACE_WITH_YOUR_GEMINI_API_KEY', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
