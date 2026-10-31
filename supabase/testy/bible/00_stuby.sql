-- Napodobení Supabase pro zkoušku migrací Pivovarské bible na čistém
-- PostgreSQL (CI: .github/workflows/bible-zpracovani.yml, job „migrace").
-- Jen to, na čem migrace bible stojí: role, auth.uid()/auth.jwt(), tabulky
-- auth.users, public.profiles, storage.buckets/objects a schéma extensions.
-- Žádná data pivovaru, žádné klíče.

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
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text,
  permissions jsonb
);
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

-- Lidé: a = admin, b = čte, c = čte + nahrává, d = bez modulu bible, e = sládek.
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin', NULL),
  ('00000000-0000-0000-0000-00000000000b', 'user', '{"bible":{"view":true,"edit":false}}'),
  ('00000000-0000-0000-0000-00000000000c', 'user', '{"bible":{"view":true,"edit":true}}'),
  ('00000000-0000-0000-0000-00000000000d', 'user', '{"dashboard":{"view":true,"edit":true}}'),
  ('00000000-0000-0000-0000-00000000000e', 'Sladek ', NULL)
ON CONFLICT DO NOTHING;
