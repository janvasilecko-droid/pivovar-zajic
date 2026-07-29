/*
# App secrets table (for Gemini API key)

1. New Tables
- `app_secrets`: key/value store for server-side secrets the edge functions need.
  - `key` (text, primary key) — secret name, e.g. "GEMINI_API_KEY"
  - `value` (text, not null) — the secret value
  - `updated_at` (timestamptz)
2. Security
- RLS enabled. NO policies for anon/authenticated — the table is unreadable
  from the frontend (anon key). Only the service role (used by edge functions)
  can read/write, because the service role bypasses RLS.
3. Notes
- The edge function `parse-order-image` reads GEMINI_API_KEY from this table
  using SUPABASE_SERVICE_ROLE_KEY.
*/

CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: anon/authenticated cannot read or write.
-- Only the service role (edge functions) can access, since it bypasses RLS.
