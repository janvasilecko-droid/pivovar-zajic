-- Napodobení HLAVNÍHO projektu Supabase pro zkoušku migrací Pivovarské bible,
-- které v něm zůstaly (supabase/migrations/*_pivovarska_bible_*.sql), na čistém
-- PostgreSQL (CI: .github/workflows/bible-zpracovani.yml, job „migrace").
-- Jen to, na čem stojí: role, auth.uid()/auth.jwt(), auth.users,
-- public.profiles, allowed_emails, limit edge funkcí, storage a extensions.
-- Žádná data pivovaru, žádné klíče. Projekt bible má vlastní stuby
-- v bible/supabase/testy/.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
-- Stejně jako Supabase: uid z JWT (claim sub), role z claimů.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text,
  permissions jsonb,
  display_name text,
  password_set boolean NOT NULL DEFAULT false
);

-- Schválené e-maily (20260821000000, 20260821010000).
CREATE TABLE IF NOT EXISTS public.allowed_emails (email text PRIMARY KEY, status text NOT NULL DEFAULT 'approved');
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Limit požadavků edge funkcí (kopie z 20260822140000_edge_function_security.sql).
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resulting_count integer;
BEGIN
  IF p_user_id IS NULL OR btrim(COALESCE(p_bucket, '')) = '' THEN
    RETURN false;
  END IF;
  IF p_limit < 1 OR p_limit > 10000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit configuration';
  END IF;
  INSERT INTO public.edge_rate_limits AS limits (user_id, bucket, window_started_at, request_count)
  VALUES (p_user_id, p_bucket, clock_timestamp(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
  SET window_started_at = CASE WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
                               THEN clock_timestamp() ELSE limits.window_started_at END,
      request_count = CASE WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
                           THEN 1 ELSE limits.request_count + 1 END
  RETURNING request_count INTO resulting_count;
  RETURN resulting_count <= p_limit;
END
$$;
REVOKE ALL ON TABLE public.edge_rate_limits, public.allowed_emails FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_own_profile ON public.profiles;
CREATE POLICY read_own_profile ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
GRANT SELECT ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner_id text,
  metadata jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated, service_role;

-- Supabase dává nové tabulky a funkce v public rolím appky (RLS pak rozhoduje).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- Lidé: a = admin, b = čte, c = čte + nahrává, d = bez modulu bible, e = sládek,
-- f = čte, ale ještě si nenastavil heslo, g = čte, ale e-mail čeká na schválení.
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e'), ('00000000-0000-0000-0000-00000000000f'),
  ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, permissions, display_name, password_set) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin', NULL, 'Honza', true),
  ('00000000-0000-0000-0000-00000000000b', 'user', '{"bible":{"view":true,"edit":false}}', 'Bára', true),
  ('00000000-0000-0000-0000-00000000000c', 'user', '{"bible":{"view":true,"edit":true}}', 'Cyril', true),
  ('00000000-0000-0000-0000-00000000000d', 'user', '{"dashboard":{"view":true,"edit":true}}', 'Dana', true),
  ('00000000-0000-0000-0000-00000000000e', 'Sladek ', NULL, '  ', true),
  ('00000000-0000-0000-0000-00000000000f', 'user', '{"bible":{"view":true,"edit":false}}', 'Filip', false),
  ('00000000-0000-0000-0000-000000000001', 'user', '{"bible":{"view":true,"edit":false}}', 'Gita', true)
ON CONFLICT DO NOTHING;
INSERT INTO public.allowed_emails (email, status) VALUES
  ('a@zajic.cz', 'approved'), ('b@zajic.cz', 'approved'), ('c@zajic.cz', 'approved'), ('d@zajic.cz', 'approved'),
  ('Sladek@Zajic.cz', 'approved'), ('f@zajic.cz', 'approved'), ('g@zajic.cz', 'pending')
ON CONFLICT DO NOTHING;
