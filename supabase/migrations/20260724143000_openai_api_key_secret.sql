/*
# Store OpenAI API key for voice transcription (Whisper)

1. Changes
- Inserts/updates the OPENAI_API_KEY row in app_secrets (server-only, RLS locked,
  same pattern as ANTHROPIC_API_KEY). Only edge functions using the service role
  can read this value.
2. Notes
- Used by the new `transcribe-audio` edge function to call OpenAI's Whisper API.
*/

-- !! IMPORTANT: Replace with your actual OpenAI API key in Supabase dashboard !!
-- This is a placeholder. The real key must be set via Supabase SQL editor or dashboard.
INSERT INTO app_secrets (key, value, updated_at)
VALUES ('OPENAI_API_KEY', 'REPLACE_WITH_YOUR_OPENAI_API_KEY', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
