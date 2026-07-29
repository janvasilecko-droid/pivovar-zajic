/*
# Add fasovani_private table (soukromé fasování)

1. New Tables
- `fasovani_private` — soukromé fasování piva (privátní záznamy, oddělené od prodejny).
  - `id` uuid PK
  - `entry_date` date
  - `beer_id` FK beers
  - `beer_name` text
  - `package_id` FK packages
  - `package_label` text
  - `quantity` numeric
  - `note` text
  - `created_at` timestamptz
2. Security
- RLS enabled, authenticated CRUD (aplikace má sign-in).
*/

CREATE TABLE IF NOT EXISTS public.fasovani_private (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  package_id uuid references public.packages(id) on delete set null,
  package_label text,
  quantity numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.fasovani_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fasovani_private" ON public.fasovani_private;
CREATE POLICY "select_own_fasovani_private" ON public.fasovani_private FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_fasovani_private" ON public.fasovani_private;
CREATE POLICY "insert_own_fasovani_private" ON public.fasovani_private FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_fasovani_private" ON public.fasovani_private;
CREATE POLICY "update_own_fasovani_private" ON public.fasovani_private FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_fasovani_private" ON public.fasovani_private;
CREATE POLICY "delete_own_fasovani_private" ON public.fasovani_private FOR DELETE
  TO authenticated USING (true);
