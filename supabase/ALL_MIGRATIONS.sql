-- ==== 20260719105703_brewery_schema.sql ====
/*
# SchĂ©ma databĂˇze minipivovaru

## 1. NovĂ© tabulky
- `beers` â€” ÄŤĂ­selnĂ­k piv (nĂˇzev, stupeĹ, barva, aktivnĂ­)
- `packages` â€” ÄŤĂ­selnĂ­k obalĹŻ (KEG 50/30/20/15/10 l, lahve 1.5/1/0.5/0.33 l)
- `places` â€” ÄŤĂ­selnĂ­k odbÄ›ratelĹŻ/mĂ­st (Restaurace, Terasa, Maneo, ...)
- `orders` â€” objednĂˇvky (datum, mĂ­sto, poznĂˇmka, zdroj: email/whatsapp/rucne/fotka, stav)
- `order_items` â€” poloĹľky objednĂˇvky (beer_id, package_id, mnoĹľstvĂ­)
- `bottling` â€” stĂˇÄŤenĂ­ lahve (datum, beer_id, package_id, mnoĹľstvĂ­, poznĂˇmka)
- `kegging` â€” stĂˇÄŤenĂ­ kegĹŻ (datum, beer_id, package_id, mnoĹľstvĂ­, poznĂˇmka)
- `writeoffs` â€” odpis (datum, kdo, beer_id, package_id, mnoĹľstvĂ­, dĹŻvod)
- `inventory` â€” inventura (datum, beer_id, package_id, zjiĹˇtÄ›nĂ˝ stav)
- `profiles` â€” profil uĹľivatele (display_name, role)

## 2. BezpeÄŤnost
- RLS zapnuto na vĹˇech tabulkĂˇch.
- Aplikace mĂˇ pĹ™ihlaĹˇovacĂ­ obrazovku â†’ politiky `TO authenticated` s vlastnictvĂ­m `auth.uid()` u `profiles`.
- ProvoznĂ­ data (beers, packages, places, orders, ...) jsou sdĂ­lenĂˇ mezi vĹˇemi pĹ™ihlĂˇĹˇenĂ˝mi uĹľivateli pivovaru â†’ `TO authenticated` s `USING (true)` (sdĂ­lenĂˇ data, viditelnĂˇ pro vĹˇechny pĹ™ihlĂˇĹˇenĂ©).
- `profiles` je owner-scoped: kaĹľdĂ˝ uĹľivatel vidĂ­ a upravuje jen svĹŻj profil.

## 3. PoznĂˇmky
- Aplikace pro ~6 uĹľivatelĹŻ pivovaru, kteĹ™Ă­ se pĹ™ihlaĹˇujĂ­ email/heslem a sdĂ­lejĂ­ stejnĂˇ provoznĂ­ data.
- MÄ›na a jednotky: mnoĹľstvĂ­ v kusech (KEG) nebo lahvĂ­ch.
*/

-- ÄŚĂ­selnĂ­k piv
CREATE TABLE IF NOT EXISTS beers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  degree text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ÄŚĂ­selnĂ­k obalĹŻ
CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('keg','bottle')),
  volume_l numeric NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

-- ÄŚĂ­selnĂ­k odbÄ›ratelĹŻ / mĂ­st
CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

-- ObjednĂˇvky
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date date NOT NULL,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  place_name text,
  source text NOT NULL DEFAULT 'rucne' CHECK (source IN ('email','whatsapp','rucne','fotka')),
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','potvrzena','vyexpedovana','zrusena')),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- PoloĹľky objednĂˇvky
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- StĂˇÄŤenĂ­ lahve
CREATE TABLE IF NOT EXISTS bottling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- StĂˇÄŤenĂ­ kegĹŻ
CREATE TABLE IF NOT EXISTS kegging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Odpis
CREATE TABLE IF NOT EXISTS writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  who text,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Inventura
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Profily uĹľivatelĹŻ
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE beers ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottling ENABLE ROW LEVEL SECURITY;
ALTER TABLE kegging ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SdĂ­lenĂˇ ÄŤĂ­selnĂ­ky: vĹˇichni pĹ™ihlĂˇĹˇenĂ­ mohou ÄŤĂ­st a zapisovat
CREATE POLICY "auth_read_beers" ON beers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_beers" ON beers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_beers" ON beers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_beers" ON beers FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_packages" ON packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_packages" ON packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_packages" ON packages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_packages" ON packages FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_places" ON places FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_places" ON places FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_places" ON places FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_places" ON places FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_orders" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_orders" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_orders" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_orders" ON orders FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_order_items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_order_items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_order_items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_order_items" ON order_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_bottling" ON bottling FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_bottling" ON bottling FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_bottling" ON bottling FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_bottling" ON bottling FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_kegging" ON kegging FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_kegging" ON kegging FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_kegging" ON kegging FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_kegging" ON kegging FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_writeoffs" ON writeoffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_writeoffs" ON writeoffs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_writeoffs" ON writeoffs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_writeoffs" ON writeoffs FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_inventory" ON inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_inventory" ON inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inventory" ON inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_inventory" ON inventory FOR DELETE TO authenticated USING (true);

-- Profily: owner-scoped
CREATE POLICY "read_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Indexy
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_place ON orders(place_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_bottling_date ON bottling(entry_date);
CREATE INDEX IF NOT EXISTS idx_kegging_date ON kegging(entry_date);
CREATE INDEX IF NOT EXISTS idx_writeoffs_date ON writeoffs(entry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory(entry_date);

-- Trigger: vytvoĹ™ profil pĹ™i registraci
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==== 20260719112022_orders_delivery_places_details.sql ====
/*
# ObjednĂˇvky: den dodĂˇnĂ­, pĹ™ipraveno, fasovĂˇnĂ­ + OdbÄ›ratelĂ©: adresa/telefon/otvĂ­racĂ­ doba

1. orders â€” novĂ© sloupce
- `delivery_day` (text) â€” zkratka dne v tĂ˝dnu, kdy se povĂˇĹľĂ­ (po/ut/st/ct/pa/so/ne). VolitelnĂ©.
- `is_prepared` (boolean, default false) â€” zaĹˇkrtĂˇvacĂ­ pole "pĹ™ipraveno".
- `is_packaged` (boolean, default false) â€” zaĹˇkrtĂˇvacĂ­ pole "fasovĂˇnĂ­" hotovo.
   PoznĂˇmka: `note` uĹľ existuje (text), pouĹľĂ­vĂˇme ho pro poznĂˇmky k objednĂˇvce.

2. places â€” novĂ© sloupce
- `address` (text) â€” adresa odbÄ›ratele.
- `phone` (text) â€” telefonnĂ­ kontakt.
- `opening_hours` (text) â€” otvĂ­racĂ­ doba (volnĂ˝ text).
   PoznĂˇmka: `note` uĹľ existuje (text), pouĹľĂ­vĂˇme ho pro obecnĂ© poznĂˇmky.

3. Security
- RLS uĹľ je zapnutĂ© na orders i places. NemÄ›nĂ­me ĹľĂˇdnĂ© policy â€” novĂ© sloupce dÄ›dĂ­ stĂˇvajĂ­cĂ­ policy (authenticated CRUD).

4. DĹŻleĹľitĂ© poznĂˇmky
- NepouĹˇtĂ­me ĹľĂˇdnĂˇ data, jen pĹ™idĂˇvĂˇme sloupce s vĂ˝chozĂ­mi hodnotami.
- `delivery_day` je volitelnĂ˝ text (ne enum), aby uĹľivatel mohl zapsat i "po/ct" pro vĂ­ce dnĹŻ.
- Pro detekci "zda je pivo stĂˇÄŤenĂ© v danĂ©m tĂ˝dnu" slouĹľĂ­ aplikace (JOIN bottling/kegging), ne sloupec.
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_day text,
  ADD COLUMN IF NOT EXISTS is_prepared boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_packaged boolean NOT NULL DEFAULT false;

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS opening_hours text;


-- ==== 20260719114954_20260719130000_bottling_source_and_parser_aliases.sql.sql ====
/*
# StĂˇÄŤenĂ­ lahvĂ­: zdrojovĂ˝ objem + ztrĂˇty + poznĂˇmka; Parser aliases

1. bottling â€” novĂ© sloupce
- `source_volume_l` (numeric, nullable) â€” kolik litrĹŻ z sudĹŻ bylo stoÄŤeno (zdroj)
- `note` uĹľ existuje (text) â€” poznĂˇmka k stĂˇÄŤenĂ­
ZtrĂˇty se poÄŤĂ­tajĂ­ v aplikaci: loss = source_volume_l - (quantity * package.volume_l); loss% = loss / source_volume_l * 100

2. parser_aliases â€” novĂˇ tabulka pro uÄŤenĂ­ se opravĂˇm
- UklĂˇdĂˇ mapping: normalized text â†’ beer_id (pĹ™Ă­padnÄ› package_id)
- KdyĹľ uĹľivatel v ImportFromImage opravĂ­ pĹ™iĹ™azenĂ­ piva, uloĹľĂ­ se alias
- PĹ™i dalĹˇĂ­m parsovĂˇnĂ­ se nejprve zkontrolujĂ­ nauÄŤenĂ© aliasy
*/

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS source_volume_l numeric;

-- Tabulka aliasĹŻ pro parser
CREATE TABLE IF NOT EXISTS parser_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_text text NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (alias_text)
);

ALTER TABLE parser_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_aliases" ON parser_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_aliases" ON parser_aliases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_aliases" ON parser_aliases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_aliases" ON parser_aliases FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_parser_aliases_text ON parser_aliases(alias_text);


-- ==== 20260719130146_app_secrets_for_gemini.sql ====
/*
# App secrets table (for Gemini API key)

1. New Tables
- `app_secrets`: key/value store for server-side secrets the edge functions need.
  - `key` (text, primary key) â€” secret name, e.g. "GEMINI_API_KEY"
  - `value` (text, not null) â€” the secret value
  - `updated_at` (timestamptz)
2. Security
- RLS enabled. NO policies for anon/authenticated â€” the table is unreadable
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


-- ==== 20260719133904_add_zavoz_to_orders.sql ====
-- ZĂˇvoz: pĹ™Ă­znak, Ĺľe objednĂˇvka byla dovezena/zĂˇvoz dokonÄŤen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_delivered boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;


-- ==== 20260719145921_add_fasovani_table.sql.sql ====
create table if not exists public.fasovani (
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

alter table public.fasovani enable row level security;

create policy "select_own_fasovani" on public.fasovani for select
  to authenticated using (true);
create policy "insert_own_fasovani" on public.fasovani for insert
  to authenticated with check (true);
create policy "update_own_fasovani" on public.fasovani for update
  to authenticated using (true) with check (true);
create policy "delete_own_fasovani" on public.fasovani for delete
  to authenticated using (true);


-- ==== 20260719151409_add_kegging_tanks.sql.sql ====
create table if not exists public.kegging_tanks (
  id uuid primary key default gen_random_uuid(),
  label text,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.kegging_tanks enable row level security;

create policy "select_own_tanks" on public.kegging_tanks for select
  to authenticated using (true);
create policy "insert_own_tanks" on public.kegging_tanks for insert
  to authenticated with check (true);
create policy "update_own_tanks" on public.kegging_tanks for update
  to authenticated using (true) with check (true);
create policy "delete_own_tanks" on public.kegging_tanks for delete
  to authenticated using (true);

alter table public.kegging add column if not exists tank_id uuid references public.kegging_tanks(id) on delete set null;


-- ==== 20260719155639_add_akce_calendar.sql ====
/*
# Add Akce (events) and Calendar

1. New Tables
- `akce` â€” events/outings where beer is taken from stock and possibly returned
  - id (uuid pk), entry_date (date), name (text), who (text), beer_id (fk beers),
    package_id (fk packages), quantity_taken (int), quantity_returned (int default 0),
    note (text), created_at (timestamptz)
- `calendar_events` â€” calendar notes & reminders
  - id (uuid pk), event_date (date), title (text), description (text),
    reminder (boolean default false), reminder_time (time, nullable),
    color (text default 'primary'), created_by (text nullable), created_at (timestamptz)

2. Security
- RLS enabled on both new tables.
- Authenticated users can CRUD both tables (shared brewery data).

3. Notes
- Akce beer taken subtracts from stock like fasovani/bottling; returned adds back.
*/

CREATE TABLE IF NOT EXISTS akce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  name text NOT NULL,
  who text,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity_taken integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE akce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_akce" ON akce;
CREATE POLICY "select_own_akce" ON akce FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_akce" ON akce;
CREATE POLICY "insert_own_akce" ON akce FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_akce" ON akce;
CREATE POLICY "update_own_akce" ON akce FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_akce" ON akce;
CREATE POLICY "delete_own_akce" ON akce FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_akce_date ON akce(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_akce_beer ON akce(beer_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  reminder boolean NOT NULL DEFAULT false,
  reminder_time time,
  color text NOT NULL DEFAULT 'primary',
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calendar" ON calendar_events;
CREATE POLICY "select_own_calendar" ON calendar_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_calendar" ON calendar_events;
CREATE POLICY "insert_own_calendar" ON calendar_events FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_calendar" ON calendar_events;
CREATE POLICY "update_own_calendar" ON calendar_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_calendar" ON calendar_events;
CREATE POLICY "delete_own_calendar" ON calendar_events FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date);


-- ==== 20260719162025_add_akce_items.sql ====
/*
# Add akce_items child table

1. New Tables
- `akce_items` â€” one row per beer carried to an akce (event)
  - id (uuid pk), akce_id (fk akce, cascade delete), beer_id (fk beers),
    beer_name (text snapshot), package_id (fk packages), package_label (text snapshot),
    quantity_taken (int), quantity_returned (int default 0)

2. Security
- RLS enabled; authenticated CRUD. Scoped through parent akce existence.

3. Notes
- Lets one akce carry up to N beers, each with its own taken/returned quantities.
- The legacy single beer columns on `akce` remain for backward compatibility but new entries use items.
*/

CREATE TABLE IF NOT EXISTS akce_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  akce_id uuid NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity_taken integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE akce_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_akce_items" ON akce_items;
CREATE POLICY "select_akce_items" ON akce_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_akce_items" ON akce_items;
CREATE POLICY "insert_akce_items" ON akce_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_akce_items" ON akce_items;
CREATE POLICY "update_akce_items" ON akce_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_akce_items" ON akce_items;
CREATE POLICY "delete_akce_items" ON akce_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_akce_items_akce ON akce_items(akce_id);


-- ==== 20260719162332_enable_realtime.sql ====
/*
# Enable realtime on all brewery tables

Adds every data table to the supabase_realtime publication so that
postgres_changes events fire for authenticated clients. This lets
all open apps/devices refresh automatically when anyone edits data.
*/

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'beers','packages','places','orders','order_items',
    'bottling','kegging','fasovani','writeoffs','inventory',
    'kegging_tanks','parser_aliases','akce','akce_items',
    'calendar_events','audit_log'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;


-- ==== 20260719164046_add_feedback_notes.sql.sql ====
/*
# Feedback notes board

1. New Tables
- `feedback_notes` â€” kolegovĂ© mohou psĂˇt poznĂˇmky na Ăşpravu / vylepĹˇenĂ­ aplikace
  - `id` (uuid, PK)
  - `author_id` (uuid, FK auth.users, NOT NULL, DEFAULT auth.uid())
  - `author_name` (text) â€” zobrazovanĂ© jmĂ©no autora (z profilu)
  - `category` (text) â€” kategorie: 'bug' | 'feature' | 'question' | 'other'
  - `title` (text, NOT NULL) â€” krĂˇtkĂ˝ pĹ™edmÄ›t
  - `body` (text) â€” detailnĂ­ popis
  - `status` (text, NOT NULL, DEFAULT 'open') â€” 'open' | 'in_progress' | 'done' | 'rejected'
  - `created_at` (timestamptz, DEFAULT now())
  - `updated_at` (timestamptz, DEFAULT now())

2. Security
- Enable RLS on `feedback_notes`.
- Authenticated users can read all notes (shared board).
- Authenticated users can insert only their own notes (WITH CHECK auth.uid() = author_id).
- Authenticated users can update their own notes (USING + WITH CHECK auth.uid() = author_id).
- Authenticated users can delete only their own notes (USING auth.uid() = author_id).
- Admins (role in profiles = 'admin') can update/delete any note â€” handled via profile join.

3. Indexes
- `idx_feedback_notes_created_at` on created_at DESC for listing.
- `idx_feedback_notes_status` on status for filtering.
*/

CREATE TABLE IF NOT EXISTS feedback_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('bug','feature','question','other')),
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_read_feedback_notes" ON feedback_notes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_insert_feedback_notes" ON feedback_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "auth_update_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_update_feedback_notes" ON feedback_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "auth_delete_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_delete_feedback_notes" ON feedback_notes
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_created_at ON feedback_notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_notes_status ON feedback_notes (status);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE feedback_notes;


-- ==== 20260719165949_add_monthly_tank_close_cron.sql ====
-- Enable pg_cron for scheduled jobs (Supabase supports it in the extensions catalog)
create extension if not exists pg_cron with schema extensions;

-- Grant usage to postgres (the role that runs migrations)
grant usage on schema extensions to postgres;

-- Monthly tank auto-close: on day 1 of each month at 00:05, close all open kegging tanks
-- and reset the active tank so the next month starts fresh.
create or replace function public.close_all_open_tanks()
returns void
language plpgsql
security definer
as $$
begin
  update public.kegging_tanks
    set closed_at = coalesce(closed_at, now())
    where closed_at is null;
end;
$$;

-- Schedule it: 5 minutes past midnight on the 1st of every month
select cron.schedule(
  'monthly-tank-close',
  '5 0 1 * *',
  $$select public.close_all_open_tanks();$$
);

comment on function public.close_all_open_tanks() is 'Automaticky uzavre vsechny otevrene kegging tanky (mesicni reset).';

-- ==== 20260719170631_add_price_list_and_cellar.sql ====
/*
# Cenik piv + Sklep (tanky 1-8) + propojeni staceni kegu s tankem

1. Nove tabulky
- `price_list` â€” cenik piv: pivo, obal, cena za kus, mena, platnost od/do, poznamka.
- `cellar_tanks` â€” sklep s tanky 1-8: label (Tank 1..8), kapacita v litrech, aktualni pivo, aktualni objem, stav (aktivni/prazdny), poznamka.
- `cellar_transfers` â€” preteceni z tanku do tanku / do staceni: datum, ze ktereho tanku, do ktereho tanku (volitelne), pivo, objem litry, ztrata litry, poznamka.

2. Upravy existujicich tabulek
- `kegging` â€” pridat `cellar_tank_id` (odkaz na cellar_tanks) a `source_volume_l` (objem z tanku pro dany zaznam staceni) a `loss_l` (ztrata).
- `kegging_tanks` â€” pridat `cellar_tank_id` (volitelny odkaz na sklep tank, ze ktereho se stacelo).

3. Bezpecnost
- RLS povoleno na vsech novych tabulkach.
- 4 politiky (SELECT/INSERT/UPDATE/DELETE) pro authenticated uzivatele (aplikace ma prihlaseni).
*/

-- ===== Cenik piv =====
create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  beer_id uuid references public.beers(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  price_per_unit numeric(10,2) not null,
  currency text not null default 'CZK',
  valid_from date,
  valid_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.price_list enable row level security;

drop policy if exists "select_own_price_list" on public.price_list;
create policy "select_own_price_list" on public.price_list
  for select to authenticated using (true);
drop policy if exists "insert_own_price_list" on public.price_list;
create policy "insert_own_price_list" on public.price_list
  for insert to authenticated with check (true);
drop policy if exists "update_own_price_list" on public.price_list;
create policy "update_own_price_list" on public.price_list
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_price_list" on public.price_list;
create policy "delete_own_price_list" on public.price_list
  for delete to authenticated using (true);

-- ===== Sklep â€” tanky 1-8 =====
create table if not exists public.cellar_tanks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  capacity_l numeric(10,2) not null default 2000,
  current_beer_id uuid references public.beers(id) on delete set null,
  current_beer_name text,
  current_volume_l numeric(10,2) not null default 0,
  status text not null default 'empty' check (status in ('empty','filling','active','emptying','cleaning')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cellar_tanks enable row level security;

drop policy if exists "select_own_cellar_tanks" on public.cellar_tanks;
create policy "select_own_cellar_tanks" on public.cellar_tanks
  for select to authenticated using (true);
drop policy if exists "insert_own_cellar_tanks" on public.cellar_tanks;
create policy "insert_own_cellar_tanks" on public.cellar_tanks
  for insert to authenticated with check (true);
drop policy if exists "update_own_cellar_tanks" on public.cellar_tanks;
create policy "update_own_cellar_tanks" on public.cellar_tanks
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_cellar_tanks" on public.cellar_tanks;
create policy "delete_own_cellar_tanks" on public.cellar_tanks
  for delete to authenticated using (true);

-- ===== Preteceni / transfery mezi tanky =====
create table if not exists public.cellar_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null default current_date,
  from_tank_id uuid references public.cellar_tanks(id) on delete set null,
  to_tank_id uuid references public.cellar_tanks(id) on delete set null,
  beer_id uuid references public.beers(id) on delete set null,
  beer_name text,
  volume_l numeric(10,2) not null,
  loss_l numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.cellar_transfers enable row level security;

drop policy if exists "select_own_cellar_transfers" on public.cellar_transfers;
create policy "select_own_cellar_transfers" on public.cellar_transfers
  for select to authenticated using (true);
drop policy if exists "insert_own_cellar_transfers" on public.cellar_transfers;
create policy "insert_own_cellar_transfers" on public.cellar_transfers
  for insert to authenticated with check (true);
drop policy if exists "update_own_cellar_transfers" on public.cellar_transfers;
create policy "update_own_cellar_transfers" on public.cellar_transfers
  for update to authenticated using (true) with check (true);
drop policy if exists "delete_own_cellar_transfers" on public.cellar_transfers;
create policy "delete_own_cellar_transfers" on public.cellar_transfers
  for delete to authenticated using (true);

-- ===== Propojeni kegging se sklepem =====
alter table public.kegging
  add column if not exists cellar_tank_id uuid references public.cellar_tanks(id) on delete set null,
  add column if not exists source_volume_l numeric(10,2),
  add column if not exists loss_l numeric(10,2) default 0;

alter table public.kegging_tanks
  add column if not exists cellar_tank_id uuid references public.cellar_tanks(id) on delete set null;

-- ===== Realtime pro nove tabulky =====
alter publication supabase_realtime add table public.price_list;
alter publication supabase_realtime add table public.cellar_tanks;
alter publication supabase_realtime add table public.cellar_transfers;

-- ==== 20260719171333_cellar_tanks_capacity_and_kegging_date.sql ====
/*
# Sklep tanky â€” kapacita 8000L + datum sudovĂˇnĂ­

1. Zmeny tabulky cellar_tanks
- capacity_l: zmena defaultu na 8000 (sloupec zustava numeric, zadna destrukce dat).
- Pridan sloupec kegging_date (date) â€” datum sudovani tanku.
- Pridan sloupec beer_type (text) â€” typ piva (svetle/tmave/rezane/polenka...), volitelny text.

2. Aktualizace existujicich tanku 1-8 na kapacitu 8000L.

3. Bezpecnost â€” bez zmen (RLS uz povoleno).
*/

alter table public.cellar_tanks
  add column if not exists kegging_date date,
  add column if not exists beer_type text;

-- Aktualizace kapacity existujicich tanku na 8000L
update public.cellar_tanks set capacity_l = 8000 where capacity_l <> 8000;

-- ==== 20260719173536_add_order_item_prepared.sql.sql ====
/*
# Add per-item prepared flag to order_items

1. Modified Tables
- `order_items`
  - Add `is_prepared` boolean NOT NULL DEFAULT false
    Allows the driver (zĂˇvoznĂ­k) to tick off each item individually in the ZĂˇvoz screen.
    When all items of an order are ticked, the order's `is_prepared` flag is set automatically.

2. Security
- No new tables; existing order_items RLS policies cover the new column.
*/

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_prepared boolean NOT NULL DEFAULT false;


-- ==== 20260719173943_backfill_places_from_orders.sql.sql ====
/*
# Backfill places from orders with place_name but no place_id

1. Purpose
   Historically, orders could be created with a free-form `place_name` but no
   linked `place_id` (the customer was typed but never saved as a Place). These
   customers never appeared in the OdbÄ›ratelĂ© catalog. This migration backfills
   the `places` table for every distinct such name and links the orders.

2. Changes
   - For each distinct non-null `place_name` on orders with `place_id IS NULL`:
     - If a place with a matching name already exists, reuse it.
     - Otherwise insert a new place with that name.
   - Update all orders with that `place_name` and `place_id IS NULL` to point
     to the resolved place.

3. Notes
   - Idempotent: re-running is safe (only touches orders still missing place_id).
   - No data is deleted or renamed.
*/

DO $$
DECLARE
  r RECORD;
  v_place_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT place_name FROM orders WHERE place_id IS NULL AND place_name IS NOT NULL AND btrim(place_name) <> '' LOOP
    SELECT id INTO v_place_id FROM places WHERE lower(name) = lower(r.place_name) LIMIT 1;
    IF v_place_id IS NULL THEN
      INSERT INTO places (name) VALUES (r.place_name) RETURNING id INTO v_place_id;
    END IF;
    UPDATE orders SET place_id = v_place_id WHERE place_id IS NULL AND place_name = r.place_name;
  END LOOP;
END $$;


-- ==== 20260719174115_places_unique_name.sql.sql ====
/*
# Prevent duplicate places (case-insensitive name)

1. Purpose
   Ensure that two places with the same name (ignoring case) can never be
   created. The frontend already dedups using a normalized comparison, but a
   database constraint is the last line of defense against races and stray
   inserts (e.g. from edge functions or image imports).

2. Changes
   - Add a unique index on the lowercased name:
       CREATE UNIQUE INDEX places_name_lower_uniq ON places (lower(name));
   - Idempotent: uses IF NOT EXISTS.

3. Notes
   - No existing duplicates (verified before applying).
   - No data is changed or deleted.
*/

CREATE UNIQUE INDEX IF NOT EXISTS places_name_lower_uniq
  ON places (lower(btrim(name)));


-- ==== 20260719174856_add_order_delivery_date_and_reminder.sql ====
/*
# Add delivery_date to orders + auto calendar reminder

1. Modified Tables
- `orders` â€” new nullable column `delivery_date` (date). Concrete delivery date
  (complements the existing `delivery_day` day-of-week field). Allows scheduling
  a delivery on a specific calendar date, not just "Po/Ăšt/St...".

2. New Functions / Triggers
- `sync_order_delivery_reminder()` â€” trigger function that runs AFTER INSERT or
  UPDATE of `delivery_date` on `orders`. When a delivery_date is set, it creates
  (or replaces) a `calendar_events` row dated `delivery_date - 3 days` with
  `reminder = true`, `reminder_time = '08:45'`, `color = 'accent'`, and a title
  like "UpomĂ­nka: dodĂˇnĂ­ pro <place_name> <delivery_date>". When delivery_date
  is cleared, the linked reminder is deleted. The reminder rows are tagged via
  the `description` field with the prefix `order:<order_id>` so the trigger can
  find and update/remove them across re-runs.

3. Security
- No new tables; RLS already enabled on `orders` and `calendar_events`.
- The trigger function runs as SECURITY DEFINER so it can write to
  `calendar_events` regardless of the calling role; it only touches rows it
  itself created (matched by the `order:<id>` tag in description).

4. Notes
- Idempotent: uses `DO $$ ... IF NOT EXISTS ... END $$` for the column add.
- The trigger drops & recreates the linked reminder on every delivery_date
  change so the reminder date always tracks the current delivery_date.
*/

-- 1. Add delivery_date column to orders (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_date'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_date date;
  END IF;
END $$;

-- 2. Trigger function: keep a calendar reminder in sync with orders.delivery_date
CREATE OR REPLACE FUNCTION public.sync_order_delivery_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reminder_date date;
  ev_id uuid;
  title text;
  tag text;
BEGIN
  tag := 'order:' || NEW.id;

  -- Always remove any previously linked reminder for this order first
  DELETE FROM calendar_events
  WHERE description = tag
     OR description LIKE tag || ':%';

  IF NEW.delivery_date IS NOT NULL THEN
    reminder_date := NEW.delivery_date - interval '3 days';
    title := 'UpomĂ­nka: dodĂˇnĂ­ pro ' || COALESCE(NEW.place_name, 'â€”') || ' ' || to_char(NEW.delivery_date, 'DD.MM.YYYY');

    INSERT INTO calendar_events (event_date, title, description, reminder, reminder_time, color)
    VALUES (reminder_date, title, tag, true, '08:45', 'accent');
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger to orders (idempotent)
DROP TRIGGER IF EXISTS trg_order_delivery_reminder ON orders;
CREATE TRIGGER trg_order_delivery_reminder
  AFTER INSERT OR UPDATE OF delivery_date ON orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_delivery_reminder();

-- 4. Backfill reminders for any existing orders that already have a delivery_date
INSERT INTO calendar_events (event_date, title, description, reminder, reminder_time, color)
SELECT
  o.delivery_date - interval '3 days',
  'UpomĂ­nka: dodĂˇnĂ­ pro ' || COALESCE(o.place_name, 'â€”') || ' ' || to_char(o.delivery_date, 'DD.MM.YYYY'),
  'order:' || o.id,
  true,
  '08:45',
  'accent'
FROM orders o
WHERE o.delivery_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.description = 'order:' || o.id
  );


-- ==== 20260719182806_add_fasovani_private_table.sql ====
/*
# Add fasovani_private table (soukromĂ© fasovĂˇnĂ­)

1. New Tables
- `fasovani_private` â€” soukromĂ© fasovĂˇnĂ­ piva (privĂˇtnĂ­ zĂˇznamy, oddÄ›lenĂ© od prodejny).
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
- RLS enabled, authenticated CRUD (aplikace mĂˇ sign-in).
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


-- ==== 20260719182912_enable_realtime_fasovani_private.sql ====
/*
# Enable realtime for fasovani_private

Adds fasovani_private to the publication used by Supabase Realtime.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.fasovani_private;

-- ==== 20260721201027_seed_beers_and_packages.sql ====
/*
# Seed piv a obalĹŻ z evidence (kveten.xlsx)

## 1. ĂšÄŤel
DoplnÄ›nĂ­ zĂˇkladnĂ­ho ÄŤĂ­selnĂ­ku piv (`beers`) a obalĹŻ (`packages`) daty, kterĂˇ se
pouĹľĂ­vala v provoznĂ­ evidenci minipivovaru (kveten.xlsx). Bez tÄ›chto dat se
piva/obaly nezobrazujĂ­ nikde v aplikaci (Katalogy, Fotky/OCR objednĂˇvek,
inventura, sklad, sklep...), protoĹľe katalogy jsou v DB prĂˇzdnĂ©.

## 2. ZmÄ›ny
- `beers` â€” zajiĹˇtÄ›n sloupec `beer_color` (idempotentnÄ›, pro jistotu â€” kĂłd
  frontendu ho pouĹľĂ­vĂˇ, ale v historii migracĂ­ chybÄ›l).
- `beers` â€” vloĹľeno 8 piv z evidence: 12Â° SvÄ›tlĂˇ, 11Â° SvÄ›tlĂˇ, 10Â° DesĂ­tka,
  12Â° TmavĂˇ, Jantar, Summer Ale, 13 Hazy Bunny, Hazy Spring Day.
  Barva pozadĂ­ (beer_color) zvolena podle typu (svÄ›tlĂ©/tmavĂ©/jantarovĂ©/ovocnĂ©).
- `packages` â€” vloĹľeno 9 obalĹŻ: KEG 50/30/20/15/10 l a lahve/PET 1.5/1/0.5/0.33 l.

## 3. BezpeÄŤnost
- Ĺ˝ĂˇdnĂ© zmÄ›ny RLS/policy â€” pouĹľĂ­vajĂ­ se existujĂ­cĂ­ policy z brewery_schema
  (authenticated CRUD).

## 4. PoznĂˇmky
- IdempotentnĂ­: piva se vklĂˇdajĂ­ pĹ™es `INSERT ... WHERE NOT EXISTS` podle nĂˇzvu,
  obaly pĹ™es `INSERT ... ON CONFLICT (code) DO NOTHING`, takĹľe opakovanĂ©
  spuĹˇtÄ›nĂ­ migrace nevytvoĹ™Ă­ duplicity.
*/

-- 1) Zajistit sloupec beer_color na beers (pro jistotu, kĂłd ho pouĹľĂ­vĂˇ)
ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS beer_color text;

-- 2) Piva
INSERT INTO public.beers (name, degree, color, beer_color, is_active, sort_order)
SELECT v.name, v.degree, v.color, v.beer_color, true, v.sort_order
FROM (VALUES
  ('12Â° SvÄ›tlĂˇ',       '12Â°', 'svÄ›tlĂ©',  '#FDE68A', 1),
  ('11Â° SvÄ›tlĂˇ',       '11Â°', 'svÄ›tlĂ©',  '#FEF3C7', 2),
  ('10Â° DesĂ­tka',      '10Â°', 'svÄ›tlĂ©',  '#FCD34D', 3),
  ('12Â° TmavĂˇ',        '12Â°', 'tmavĂ©',   '#44403B', 4),
  ('Jantar',           NULL,  'jantarovĂ©','#F59E0B', 5),
  ('Summer Ale',       NULL,  'ovocnĂ©',  '#86EFAC', 6),
  ('13 Hazy Bunny',    '13Â°', 'nefiltrovanĂ©', '#FCA5A5', 7),
  ('Hazy Spring Day',  NULL,  'nefiltrovanĂ©', '#F9A8D4', 8)
) AS v(name, degree, color, beer_color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.beers b WHERE lower(btrim(b.name)) = lower(btrim(v.name))
);

-- 3) Obaly (KEG + lahve/PET)
INSERT INTO public.packages (code, kind, volume_l, label, sort_order)
VALUES
  ('KEG50',   'keg',    50,   'KEG 50l',    1),
  ('KEG30',   'keg',    30,   'KEG 30l',    2),
  ('KEG20',   'keg',    20,   'KEG 20l',    3),
  ('KEG15',   'keg',    15,   'KEG 15l',    4),
  ('KEG10',   'keg',    10,   'KEG 10l',    5),
  ('LAHEV15', 'bottle', 1.5,  'Lahve 1.5l', 6),
  ('LAHEV1',  'bottle', 1,    'Lahve 1l',   7),
  ('LAHEV05', 'bottle', 0.5,  'Lahve 0.5l', 8),
  ('LAHEV033','bottle', 0.33, 'Lahve 0.33l',9)
ON CONFLICT (code) DO NOTHING;


-- ==== 20260721210000_cellar_tank_cycles_and_status.sql ====
/*
# Sklep â€” plnĂ˝ ĹľivotnĂ­ cyklus tanku (start â†’ stĂˇÄŤenĂ­ â†’ konec â†’ sanitace â†’ oplach â†’ prĂˇzdnĂ˝)

## 1. ĂšÄŤel
RozĹˇĂ­Ĺ™enĂ­ tabulky `cellar_tanks` o sledovĂˇnĂ­ aktuĂˇlnĂ­ho cyklu (kdy byl tank
naplnÄ›n, jakĂ˝ byl poÄŤĂˇteÄŤnĂ­ objem) a novĂˇ tabulka `cellar_tank_cycles` pro
historii uzavĹ™enĂ˝ch cyklĹŻ (kolik piva bylo stoÄŤeno, jakĂˇ byla ztrĂˇta, jak
dlouho cyklus trval). PĹ™idĂˇny novĂ© stavy tanku 'sanitizing' (Sanitace) a
'rinsing' (Oplach H2O) do ĹľivotnĂ­ho cyklu:

  prĂˇzdnĂ˝ â†’ (naplnÄ›nĂ­) â†’ active (aktivnĂ­/stĂˇÄŤĂ­ se) â†’ (ukonÄŤenĂ­) â†’
  sanitizing (sanitace) â†’ rinsing (oplach H2O) â†’ empty (prĂˇzdnĂ˝, pĹ™ipraven)

## 2. ZmÄ›ny tabulky cellar_tanks
- `started_at` (timestamptz) â€” kdy byl aktuĂˇlnĂ­ cyklus/naplnÄ›nĂ­ zahĂˇjeno.
- `initial_volume_l` (numeric) â€” poÄŤĂˇteÄŤnĂ­ objem piva v tanku pĹ™i zahĂˇjenĂ­
  cyklu (vĂ˝chozĂ­ 7500 l, upravitelnĂ© pĹ™i zahĂˇjenĂ­).
- `capacity_l` â€” default zmÄ›nÄ›n na 7500 (byl 8000), podle zadĂˇnĂ­ provozu.
- `status` â€” CHECK rozĹˇĂ­Ĺ™en o 'sanitizing' a 'rinsing'.

## 3. NovĂˇ tabulka cellar_tank_cycles
Historie uzavĹ™enĂ˝ch cyklĹŻ tanku: tank, pivo, poÄŤĂˇteÄŤnĂ­ objem, kolik bylo
stoÄŤeno (litry pĹ™epoÄŤtenĂ© z kegging.source_volume_l), ztrĂˇta (litry i %),
datum zahĂˇjenĂ­/ukonÄŤenĂ­ a doba trvĂˇnĂ­ ve dnech.

## 4. BezpeÄŤnost
- RLS zapnuto, stejnĂ© sdĂ­lenĂ© politiky (authenticated CRUD) jako u ostatnĂ­ch
  provoznĂ­ch tabulek.

## 5. PoznĂˇmky
- IdempotentnĂ­ â€” sloupce se pĹ™idĂˇvajĂ­ pĹ™es `ADD COLUMN IF NOT EXISTS`,
  CHECK constraint se pĹ™egeneruje (drop+add), tabulka cyklĹŻ `CREATE TABLE IF
  NOT EXISTS`.
*/

-- 1) NovĂ© sloupce na cellar_tanks
ALTER TABLE public.cellar_tanks
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_volume_l numeric(10,2);

-- Kapacita 7500l dle zadĂˇnĂ­ provozu (byl default 8000)
ALTER TABLE public.cellar_tanks ALTER COLUMN capacity_l SET DEFAULT 7500;

-- RozĹˇĂ­Ĺ™enĂ­ CHECK na status o sanitizing/rinsing
DO $$
BEGIN
  ALTER TABLE public.cellar_tanks DROP CONSTRAINT IF EXISTS cellar_tanks_status_check;
  ALTER TABLE public.cellar_tanks
    ADD CONSTRAINT cellar_tanks_status_check
    CHECK (status IN ('empty','filling','active','emptying','cleaning','sanitizing','rinsing'));
END $$;

-- 2) Historie cyklĹŻ tanku
CREATE TABLE IF NOT EXISTS public.cellar_tank_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id uuid REFERENCES public.cellar_tanks(id) ON DELETE SET NULL,
  tank_label text,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  beer_name text,
  initial_volume_l numeric(10,2) NOT NULL DEFAULT 0,
  kegged_volume_l numeric(10,2) NOT NULL DEFAULT 0,
  keg_count numeric(10,2) NOT NULL DEFAULT 0,
  loss_l numeric(10,2) NOT NULL DEFAULT 0,
  loss_pct numeric(6,2) NOT NULL DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz NOT NULL DEFAULT now(),
  duration_hours numeric(10,1),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cellar_tank_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "select_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "insert_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "update_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "delete_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR DELETE TO authenticated USING (true);

-- 3) Seed â€” zajistit 8 fyzickĂ˝ch tankĹŻ (Tank 1..8), pokud jeĹˇtÄ› nejsou
INSERT INTO public.cellar_tanks (label, capacity_l, current_volume_l, status)
SELECT 'Tank ' || n, 7500, 0, 'empty'
FROM generate_series(1, 8) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.cellar_tanks t WHERE t.label = 'Tank ' || n
);

-- Sjednotit kapacitu existujĂ­cĂ­ch tankĹŻ 1-8 na 7500 (pokud existujĂ­ se starou kapacitou 8000/2000)
UPDATE public.cellar_tanks SET capacity_l = 7500
WHERE label IN (SELECT 'Tank ' || n FROM generate_series(1, 8) AS n) AND capacity_l <> 7500;

-- 4) Realtime pro novou tabulku
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cellar_tank_cycles';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping cellar_tank_cycles publication: %', SQLERRM;
END $$;


-- ==== 20260721220000_beers_price_per_liter.sql ====
/*
# CenĂ­k â€” cena za litr piva pro automatickĂ˝ pĹ™epoÄŤet ceny kegĹŻ

## 1. ĂšÄŤel
CenĂ­k kegĹŻ se mĂˇ poÄŤĂ­tat automaticky: u piva se zadĂˇ jen cena za litr a
z nĂ­ se dopoÄŤĂ­tĂˇ cena kegu podle jeho objemu (30l keg = 30 Ă— cena/l).
Ceny lahvĂ­ se nadĂˇle zadĂˇvajĂ­ ruÄŤnÄ› (tabulka `price_list`), protoĹľe se
neĹ™Ă­dĂ­ ÄŤistÄ› objemem (obchodnĂ­ cena za balenĂ­).

## 2. ZmÄ›ny
- `beers` â€” novĂ˝ sloupec `price_per_liter numeric(10,2)` â€” cena za litr
  piva v KÄŤ. VĂ˝chozĂ­ NULL (nezadĂˇno).

## 3. BezpeÄŤnost
- Ĺ˝ĂˇdnĂ© novĂ© RLS politiky â€” sloupec je souÄŤĂˇstĂ­ existujĂ­cĂ­ tabulky `beers`,
  Ĺ™Ă­dĂ­ se stĂˇvajĂ­cĂ­mi policy (authenticated CRUD).

## 4. PoznĂˇmky
- IdempotentnĂ­ â€” `ADD COLUMN IF NOT EXISTS`.
*/

ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS price_per_liter numeric(10,2);


-- ==== 20260722000000_akce_quantity_and_revenue.sql ====
/*
# Akce: jednotnĂ© mnoĹľstvĂ­ (+/-) a trĹľba za akci

1. ZmÄ›ny
- `akce.revenue` (numeric, KÄŤ) â€” kolik se na akci celkem vydÄ›lalo
- `akce_items.quantity` (integer, default 0) â€” jednotnĂ© mnoĹľstvĂ­:
    kladnĂ© = vrĂˇceno / pĹ™ifasovĂˇno zpÄ›t do skladu
    zĂˇpornĂ© = odvezeno / odeÄŤteno ze skladu
  StarĂ© sloupce `quantity_taken` a `quantity_returned` zĹŻstĂˇvajĂ­ zachovĂˇny
  kvĹŻli zpÄ›tnĂ© kompatibilitÄ› a historickĂ˝m datĹŻm (History.tsx je stĂˇle ÄŤte),
  novĂ© zĂˇznamy z UI ale uklĂˇdajĂ­ hodnotu i do `quantity`.

2. PoznĂˇmky
- BezpeÄŤnĂˇ migrace: pouze pĹ™idĂˇvĂˇ sloupce, nic nemaĹľe.
*/

ALTER TABLE akce ADD COLUMN IF NOT EXISTS revenue numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE akce_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0;

-- Backfill: quantity = quantity_returned - quantity_taken (zachovat existujĂ­cĂ­ saldo)
UPDATE akce_items SET quantity = COALESCE(quantity_returned, 0) - COALESCE(quantity_taken, 0) WHERE quantity = 0;


-- ==== 20260724143000_openai_api_key_secret.sql ====
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


-- ==== 20260802020000_add_places_contact_columns.sql ====
-- Přidání chybějících sloupců do tabulky places
-- (contact_name, email, delivery_group) — tyto sloupce aplikace používá,
-- ale v databázi zatím neexistovaly, takže vkládání nového odběratele selhávalo.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS delivery_group text;


-- ==== 20260803020000_add_bottling_kegs_used.sql ====
-- Přidání sloupců do tabulky bottling pro evidenci použitých sudů KEG
-- (kolik sudů KEG bylo použito na stočení do lahví a jaký typ sudu)
-- Při stáčení např. 2x50L do 1L lahví (~98 lahví) se odečtou 2 kegy ze skladu.

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS kegs_used numeric,
  ADD COLUMN IF NOT EXISTS kegs_used_package_id uuid;


-- ==== 20260803030000_add_bottling_tank_source.sql ====
-- Přidání sloupce do tabulky bottling pro zdrojový objem ze sudů.
-- Při stáčení do lahví ze sudů (kegs_used) se uloží zdrojový objem
-- (source_volume_l = počet sudů × objem sudu, např. 6×50L = 300L).
-- Sudy se odečtou ze skladu (jako objednávka) a vytrata se počítá jako
-- source_volume_l - (quantity * package.volume_l).

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS source_volume_l numeric(10,2);


-- ==== 20260804100000_add_who_to_fasovani.sql ====
-- Add who column to fasovani and fasovani_private tables
ALTER TABLE public.fasovani ADD COLUMN IF NOT EXISTS who text;
ALTER TABLE public.fasovani_private ADD COLUMN IF NOT EXISTS who text;


-- ==== 20260815120000_add_reminders_target_emails.sql ====
-- Rozšíření tabulky reminders o hromadné cílení na konkrétní uživatele.
--
-- Aplikace nyní umožňuje posílat zprávy a upozornění nejen všem / roli,
-- ale i vybraným konkrétním uživatelům (vícenásobný výběr podle e-mailů).
--
-- 1. CREATE TABLE IF NOT EXISTS — vytvoří tabulku (včetně nového sloupce
--    target_emails text[]) i pro čistou instalaci databáze.
-- 2. ALTER ... ADD COLUMN IF NOT EXISTS — pro existující databáze, kde tabulka
--    už existuje (manuálně založená), přidá případné chybějící sloupce.
-- 3. RLS politiky — sdílená data pivovaru (stejný vzor jako calendar_events).

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  note text,
  date_time timestamptz NOT NULL,
  target_role text NOT NULL DEFAULT 'all',
  target_emails text[] NOT NULL DEFAULT '{}',
  display_mode text NOT NULL DEFAULT 'both',
  created_by text,
  created_at timestamptz DEFAULT now(),
  acknowledged_by text[] NOT NULL DEFAULT '{}',
  is_completed boolean NOT NULL DEFAULT false
);

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS date_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS target_role text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS acknowledged_by text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select" ON reminders;
CREATE POLICY "reminders_select" ON reminders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reminders_insert" ON reminders;
CREATE POLICY "reminders_insert" ON reminders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "reminders_update" ON reminders;
CREATE POLICY "reminders_update" ON reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "reminders_delete" ON reminders;
CREATE POLICY "reminders_delete" ON reminders FOR DELETE TO authenticated USING (true);

COMMENT ON COLUMN reminders.target_emails IS 'E-maily konkrétních příjemců (prázdné pole = cílí se podle target_role / všichni).';

-- 20260815130000_add_notes_table.sql
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  body text NOT NULL,
  color text NOT NULL DEFAULT 'primary',
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_select" ON notes;
CREATE POLICY "notes_select" ON notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notes_insert" ON notes;
CREATE POLICY "notes_insert" ON notes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notes_update" ON notes;
CREATE POLICY "notes_update" ON notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notes_delete" ON notes;
CREATE POLICY "notes_delete" ON notes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
COMMENT ON TABLE notes IS 'Volné poznámky sdílené v rámci pivovaru (Kalendář & Poznámky).';






-- ==== 20260816120000_add_keg_prefuk.sql ====
-- ============================================================================
-- Přefuk KEG sudů: přelití piva ze sudů jedné velikosti do sudů jiné velikosti.
-- Ze skladu se odečtou sudy "ZE" (from_package_id, from_count) a přičtou se sudy "DO" (to_package_id, to_count).
-- ============================================================================
CREATE TABLE IF NOT EXISTS keg_prefuk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  from_package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  from_package_label text,
  from_count numeric NOT NULL DEFAULT 0,
  to_package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  to_package_label text,
  to_count numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE keg_prefuk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_read_keg_prefuk" ON keg_prefuk FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_write_keg_prefuk" ON keg_prefuk FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_update_keg_prefuk" ON keg_prefuk FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_delete_keg_prefuk" ON keg_prefuk FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_keg_prefuk_entry_date ON keg_prefuk(entry_date DESC);
COMMENT ON TABLE keg_prefuk IS 'Přefuk KEG sudů: přelití piva ze sudů jedné velikosti do jiných (sudy ZE se odečtou ze skladu, sudy DO se přičtou).';

-- ==== 20260817000000_add_cellar_tanks_kegging_active.sql ====
-- Sloupce pro řízení aktivního stáčení z tanku (zdroj odečtu piva při stáčení KEG).
-- Aplikace (Sklep → "Zahájit stáčení" / "Ukončit stáčení") tyto sloupce zapisuje,
-- ale doposud nebyly v databázi — update tiše selhával a tlačítko se tvářilo, že nic nedělá.

ALTER TABLE public.cellar_tanks
  ADD COLUMN IF NOT EXISTS kegging_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kegging_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS kegging_ended_at timestamptz;

COMMENT ON COLUMN public.cellar_tanks.kegging_active IS 'Zda je na tanku aktivní stáčení KEG (jediný aktivní zdroj, ze kterého se odečítá pivo při stáčení).';
COMMENT ON COLUMN public.cellar_tanks.kegging_started_at IS 'Kdy bylo na tanku zahájeno stáčení KEG.';
COMMENT ON COLUMN public.cellar_tanks.kegging_ended_at IS 'Kdy bylo na tanku ukončeno stáčení KEG.';



-- ==== 20260818000000_auto_delete_non_whitelisted_whatsapp.sql ====
-- Automatické mazání WhatsApp zpráv od nepovolených odesílatelů
-- Vytvořeno: 2026-08-09
-- Důvod: do aplikace se mají dostat JEN zprávy ze skupiny „Objednávky pivovar“.
--        Webhook je už neukládá (odpovídá skipped:true), ale tahle pojistka zajistí,
--        že se do whatsapp_incoming nedostane ani zpráva uložená jinou cestou
--        (SQL konzole, seed, Make bez filtru) a že se smažou i staré zprávy
--        uložené před nastavením whitelistu.

-- 1) BEFORE INSERT pojistka: zpráva od nepovoleného odesílatele se neuloží vůbec.
--    Prázdný whitelist = povoleno vše (zpětně kompatibilní chování).
CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders
    WHERE LOWER(trim(sender_name)) = LOWER(trim(NEW.sender_name))
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_check_sender_allowed ON whatsapp_incoming;
CREATE TRIGGER trg_whatsapp_check_sender_allowed
  BEFORE INSERT ON whatsapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION check_whatsapp_sender_allowed();

-- 2) Při odebrání odesílatele z whitelistu se smažou i jeho uložené zprávy
--    (přestal být povolený → nemá v DB co dělat).
CREATE OR REPLACE FUNCTION delete_whatsapp_messages_of_removed_sender()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM whatsapp_incoming
  WHERE LOWER(trim(sender_name)) = LOWER(trim(OLD.sender_name));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_delete_on_sender_removed ON whatsapp_senders;
CREATE TRIGGER trg_whatsapp_delete_on_sender_removed
  AFTER DELETE ON whatsapp_senders
  FOR EACH ROW
  EXECUTE FUNCTION delete_whatsapp_messages_of_removed_sender();

-- 3) Očista stávajících zpráv: smaže zprávy od odesílatelů, kteří nejsou
--    ve whitelistu (whitelist není prázdný). Před očistou doporučuji zálohu:
--    node scripts/backup-whatsapp-incoming.mjs
DO $$
DECLARE
  v_allowed_count bigint;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RAISE NOTICE 'Whitelist je prázdný — nic se nemaže.';
  ELSE
    DELETE FROM whatsapp_incoming w
    WHERE NOT EXISTS (
      SELECT 1 FROM whatsapp_senders s
      WHERE LOWER(trim(s.sender_name)) = LOWER(trim(w.sender_name))
    );
  END IF;
END $$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Automaticky zahodí zprávu od odesílatele, který není ve whatsapp_senders (prázdný whitelist = vše povoleno).';
COMMENT ON TRIGGER trg_whatsapp_delete_on_sender_removed ON whatsapp_senders IS
  'Při odebrání odesílatele z whitelistu smaže jeho zprávy z whatsapp_incoming.';

-- ==== 20260818120000_whatsapp_chat_id_from_me_filter.sql ====
-- WhatsApp: filtrování podle chat_id + ignorování vlastních zpráv (from_me)
-- Vytvořeno: 2026-08-09
-- Důvod:
--   1) Zpracovává se JEN jedna skupina „Objednávky pivovar“ — primárně podle
--      stabilního chat_id (např. "120363...@g.us"), název skupiny jen jako
--      přechodná záloha (skupina se dá přejmenovat, chat_id ne).
--   2) Vlastní zprávy (from_me = true — poslané z jiného zařízení/WhatsApp Webu)
--      se NESMÍ dostat do systému ani k AI → vynuceno už na úrovni databáze
--      (prevence smyčky AI → odpověď → Tasker → webhook).
--   3) Porovnání názvu je tolerantní k diakritice: "objednavky pivovar" ==
--      "Objednávky pivovar".

-- 0) Nové sloupce (idempotentně)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_senders' AND column_name = 'chat_id') THEN
    ALTER TABLE whatsapp_senders ADD COLUMN chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_incoming' AND column_name = 'chat_id') THEN
    ALTER TABLE whatsapp_incoming ADD COLUMN chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_incoming' AND column_name = 'from_me') THEN
    ALTER TABLE whatsapp_incoming ADD COLUMN from_me boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 0.5) Normalizace názvu pro porovnání: malá písmena, ořezané mezery, bez diakritiky.
CREATE OR REPLACE FUNCTION whatsapp_norm(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(lower(trim(s)), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz');
$$;

-- 1) BEFORE INSERT pojistka (rozšířená verze):
--    - from_me = true → řádek se NIKDY nevytvoří (vlastní zpráva, prevence smyčky).
--    - jinak je zpráva povolená, když sender_name odpovídá whitelistu NEBO chat_id
--      odpovídá nastavenému chat_id. Prázdný whitelist = povoleno vše (zpětně
--      kompatibilní chování).
CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- Vlastní zprávy (z jiného zařízení/Webu) se NIKDY neukládají.
  IF NEW.from_me THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      (NEW.chat_id IS NOT NULL AND trim(NEW.chat_id) <> ''
       AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
       AND lower(trim(s.chat_id)) = lower(trim(NEW.chat_id)))
      OR
      (NEW.sender_name IS NOT NULL AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name))
    )
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_check_sender_allowed ON whatsapp_incoming;
CREATE TRIGGER trg_whatsapp_check_sender_allowed
  BEFORE INSERT ON whatsapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION check_whatsapp_sender_allowed();

-- 2) Při odebrání odesílatele ze whitelistu se smažou i jeho uložené zprávy
--    (podle jména NEBO chat_id).
CREATE OR REPLACE FUNCTION delete_whatsapp_messages_of_removed_sender()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM whatsapp_incoming
  WHERE whatsapp_norm(sender_name) = whatsapp_norm(OLD.sender_name)
     OR (OLD.chat_id IS NOT NULL AND trim(OLD.chat_id) <> ''
         AND chat_id IS NOT NULL
         AND lower(trim(chat_id)) = lower(trim(OLD.chat_id)));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_delete_on_sender_removed ON whatsapp_senders;
CREATE TRIGGER trg_whatsapp_delete_on_sender_removed
  AFTER DELETE ON whatsapp_senders
  FOR EACH ROW
  EXECUTE FUNCTION delete_whatsapp_messages_of_removed_sender();

-- 3) Očista: smaže vlastní zprávy a zprávy, které neodpovídají whitelistu
--    (podle jména NEBO chat_id). Před očistou doporučuji zálohu:
--    node scripts/backup-whatsapp-incoming.mjs
DELETE FROM whatsapp_incoming WHERE from_me = true;

DO $$
DECLARE
  v_allowed_count bigint;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RAISE NOTICE 'Whitelist je prázdný — nic se nemaže.';
  ELSE
    DELETE FROM whatsapp_incoming w
    WHERE NOT EXISTS (
      SELECT 1 FROM whatsapp_senders s
      WHERE (whatsapp_norm(w.sender_name) = whatsapp_norm(s.sender_name))
         OR (w.chat_id IS NOT NULL AND trim(w.chat_id) <> ''
             AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
             AND lower(trim(w.chat_id)) = lower(trim(s.chat_id)))
    );
  END IF;
END $$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Automaticky zahodí zprávu od nepovoleného odesílatele a VŽDY zprávu s from_me=true (vlastní zpráva → prevence smyčky).';
COMMENT ON TRIGGER trg_whatsapp_delete_on_sender_removed ON whatsapp_senders IS
  'Při odebrání odesílatele z whitelistu smaže jeho zprávy z whatsapp_incoming (podle jména nebo chat_id).';


-- ==== 20260820120000_add_sanitation_logs_table.sql ====
-- Sanitační deník (HACCP): evidence provedených sanitací tanků a stáčecích linek.
-- Aplikace: SanitationLogScreen.tsx (typ SanitationLog v src/lib/supabase.ts).
-- Tabulka doposud nikdy nevznikla v produkci → PostgREST vracel 404 a deník
-- fungoval jen z lokálního úložiště. Tato migrace ji vytvoří včetně RLS.
CREATE TABLE IF NOT EXISTS sanitation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sanitation_date date NOT NULL,
  sanitation_time time,
  tank_id uuid REFERENCES public.cellar_tanks(id) ON DELETE SET NULL,
  tank_label text NOT NULL,
  method text NOT NULL CHECK (method IN ('kyselina_dusicna','louh','oplach_vodou','persteril','kombinovana')),
  method_label text NOT NULL,
  chemical_name text,
  concentration_pct numeric,
  temperature_c numeric,
  duration_minutes integer,
  performed_by text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sanitation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_sanitation_logs" ON sanitation_logs;
CREATE POLICY "auth_read_sanitation_logs" ON sanitation_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_sanitation_logs" ON sanitation_logs;
CREATE POLICY "auth_write_sanitation_logs" ON sanitation_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_sanitation_logs" ON sanitation_logs;
CREATE POLICY "auth_update_sanitation_logs" ON sanitation_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_sanitation_logs" ON sanitation_logs;
CREATE POLICY "auth_delete_sanitation_logs" ON sanitation_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sanitation_logs_date ON sanitation_logs(sanitation_date DESC, created_at DESC);
COMMENT ON TABLE sanitation_logs IS 'Sanitační deník HACCP: provedené sanitace tanků / linek (metoda, chemie, koncentrace, teplota, délka, odpovědná osoba).';

-- Realtime (živé obnovení deníku na otevřených zařízeních)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sanitation_logs;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sanitation_logs už v publikaci: %', SQLERRM;
END $$;


-- ==== 20260820130000_add_srotovani_table.sql ====
-- Šrotování sladu (HACCP norma 3.1): zápis hmotnosti našrotovaného sladu pro várky.
-- Aplikace: SrotovaniScreen v src/screens/BreweryScreens.tsx (typ SrotovaniRow).
-- Tabulka doposud v produkci neexistovala → obrazovka Šrotování se načítala navždy
-- (supabase.from('srotovani').select() vracel 404). Tato migrace ji vytvoří.
CREATE TABLE IF NOT EXISTS srotovani (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  weight_kg numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE srotovani ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_srotovani" ON srotovani;
CREATE POLICY "auth_read_srotovani" ON srotovani FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_srotovani" ON srotovani;
CREATE POLICY "auth_write_srotovani" ON srotovani FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_srotovani" ON srotovani;
CREATE POLICY "auth_update_srotovani" ON srotovani FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_srotovani" ON srotovani;
CREATE POLICY "auth_delete_srotovani" ON srotovani FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_srotovani_entry_date ON srotovani(entry_date DESC);
COMMENT ON TABLE srotovani IS 'Šrotování sladu dle HACCP bodu 3.1 — zápis hmotnosti našrotovaného sladu pro jednotlivé várky piv.';

-- Realtime (živé obnovení obrazovky Šrotování)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.srotovani;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'srotovani už v publikaci: %', SQLERRM;
END $$;


-- ==== 20260820140000_add_legacy_zadavani_cellar_batches_audit_log.sql ====
-- Legacy tabulky, na které aplikace/operativní skripty odkazují, ale v produkci chyběly:
--   * audit_log       — auditní log operací (typ AuditEntry v src/lib/supabase.ts,
--                       tabulka je i v realtime publikaci a v cleanup skriptech)
--   * cellar_batches  — várky v tancích sklepa (src/lib/backup.ts)
--   * zadavani        — legacy záznamy (cleanup/backup skripty)
-- Schema zadavani / cellar_batches je minimální best-guess — žádný kód sloupce
-- nepoužívá, tabulky vznikají hlavně kvůli tomu, aby cleanup/backup skripty
-- běžely bez chyby "table does not exist".

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_audit_log" ON audit_log;
CREATE POLICY "auth_read_audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_audit_log" ON audit_log;
CREATE POLICY "auth_write_audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_audit_log" ON audit_log;
CREATE POLICY "auth_update_audit_log" ON audit_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_audit_log" ON audit_log;
CREATE POLICY "auth_delete_audit_log" ON audit_log FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
COMMENT ON TABLE audit_log IS 'Auditní log operací nad daty (typ AuditEntry).';

CREATE TABLE IF NOT EXISTS cellar_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  tank_id uuid REFERENCES public.cellar_tanks(id) ON DELETE SET NULL,
  tank_label text,
  volume_hl numeric DEFAULT 0,
  og numeric,
  fg numeric,
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cellar_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_read_cellar_batches" ON cellar_batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_write_cellar_batches" ON cellar_batches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_update_cellar_batches" ON cellar_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_delete_cellar_batches" ON cellar_batches FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE cellar_batches IS 'Várky v tancích sklepa (legacy — doposud žádný kód nepíše, schéma je best-guess).';

CREATE TABLE IF NOT EXISTS zadavani (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  amount numeric DEFAULT 0,
  unit text,
  note text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE zadavani ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_zadavani" ON zadavani;
CREATE POLICY "auth_read_zadavani" ON zadavani FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_zadavani" ON zadavani;
CREATE POLICY "auth_write_zadavani" ON zadavani FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_zadavani" ON zadavani;
CREATE POLICY "auth_update_zadavani" ON zadavani FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_zadavani" ON zadavani;
CREATE POLICY "auth_delete_zadavani" ON zadavani FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE zadavani IS 'Legacy tabulka (doposud žádný kód nečte ani nezapisuje, schéma je best-guess).';

-- audit_log doplnit i do realtime publikace (byla v seznamu už v enable_realtime)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'audit_log už v publikaci: %', SQLERRM;
END $$;





-- ==== 20261008120000_add_bottling_plans.sql ====
-- ============================================================================
-- ⚗️ Plánování stáčení — „Co je potřeba stočit"
-- ----------------------------------------------------------------------------
-- Admin / sládek / šéf zadá úkol (pivo, až 3 velikosti lahví, KEG sudy, datum,
-- poznámka). Stáčeč vidí úkoly zvýrazněné v zápisu stáčení (BottlingScreen,
-- záložka „Stáčení lahví") a může je „naplnit" do formuláře nebo označit jako
-- hotové.
--
-- RLS: otevřené čtení i zápis pro přihlášené uživatele — shodně s ostatními
-- tabulkami aplikace (bottling, orders, ...). Kdo smí zadávat/upravovat/mazat
-- se řídí UI vrstvou (isBottlingManager: admin/sef/sladek/boss/manager),
-- protože stáčeč musí umět přepnout úkol na „hotovo" (offline fronta aplikace
-- pak umí zápis spolehlivě zopakovat).
-- ============================================================================

CREATE TABLE IF NOT EXISTS bottling_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beer_id uuid REFERENCES beers(id) ON DELETE CASCADE,
  -- KEG sudy
  keg_pkg_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  keg_qty integer NOT NULL DEFAULT 0 CHECK (keg_qty >= 0),
  -- Lahve (až 3 velikosti na jeden úkol)
  pkg_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  pkg2_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty2 integer NOT NULL DEFAULT 0 CHECK (qty2 >= 0),
  pkg3_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty3 integer NOT NULL DEFAULT 0 CHECK (qty3 >= 0),
  planned_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Úkol musí mít alespoň jeden obal s počtem > 0
  CONSTRAINT bottling_plans_has_lines CHECK (qty > 0 OR qty2 > 0 OR qty3 > 0 OR keg_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_bottling_plans_planned_date ON bottling_plans(planned_date);
CREATE INDEX IF NOT EXISTS idx_bottling_plans_status ON bottling_plans(status);

-- Auto-update updated_at při změně (pro odznáček „nových úkolů" u stáčeče)
CREATE OR REPLACE FUNCTION public.touch_updated_at_bottling_plans()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bottling_plans_touch_updated_at ON bottling_plans;
CREATE TRIGGER trg_bottling_plans_touch_updated_at
  BEFORE UPDATE ON bottling_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_bottling_plans();

-- RLS (otevřené pro přihlášené — viz komentář nahoře)
ALTER TABLE bottling_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_read_bottling_plans" ON bottling_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_write_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_write_bottling_plans" ON bottling_plans FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_update_bottling_plans" ON bottling_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_delete_bottling_plans" ON bottling_plans FOR DELETE TO authenticated USING (true);

-- Realtime (živé obnovení pro stáčeče i plánovače)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bottling_plans;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bottling_plans už v publikaci: %', SQLERRM;
END $$;

COMMENT ON TABLE bottling_plans IS 'Úkoly na stáčení (lahve + KEG) — zadává admin/sládek/šéf, stáčeč vidí zvýrazněné v zápisu stáčení.';


-- ==== 20260811120000_allow_from_me_messages.sql ====
-- WhatsApp: vlastní zprávy (from_me) se ukládají a zpracovávají.
-- Vytvořeno: 2026-08-11
-- Důvod: whatsapp-bridge přeposílá i vlastní zprávy ze spárovaného telefonu
--        (od 2026-08-11), aby je šlo testovat a vyhodnocovat. from_me zůstává
--        uložený jako flag — aplikace vlastní zprávy rozliší od zákaznických.
--        Ruší se tím dřívější "prevence smyčky", která vlastní zprávy zahazovala.

-- 1) Trigger funkce: vlastní zprávy už NEZahazuje — platí pro ně jen whitelist
--    (název NEBO chat_id). from_me řádek se uloží, aby aplikace měla flag.
CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      (NEW.chat_id IS NOT NULL AND trim(NEW.chat_id) <> ''
       AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
       AND lower(trim(s.chat_id)) = lower(trim(NEW.chat_id)))
      OR
      (NEW.sender_name IS NOT NULL AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name))
    )
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle názvu nebo chat_id). Vlastní zprávy (from_me=true) se ukládají a rozliší se flagem from_me.';

-- ==== 20260811130000_from_me_bypass_whitelist.sql ====
-- WhatsApp: vlastní zprávy (from_me) whitelist OBEJDOU — vždy se uloží.
-- Vytvořeno: 2026-08-11
-- Důvod: vlastní zprávy píše sám majitel ze spárovaného telefonu — do skupiny
--        i soukromě (např. zpráva sám sobě) — takže whitelist odesílatelů na ně
--        neplatí. Aplikace je rozliší podle from_me=true.

CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- Vlastní zprávy (from_me=true) projdou vždy — píše je sám majitel.
  IF NEW.from_me THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      (NEW.chat_id IS NOT NULL AND trim(NEW.chat_id) <> ''
       AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
       AND lower(trim(s.chat_id)) = lower(trim(NEW.chat_id)))
      OR
      (NEW.sender_name IS NOT NULL AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name))
    )
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří (jen pro cizí zprávy)
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle názvu nebo chat_id). Vlastní zprávy (from_me=true) whitelist obcházejí a vždy se uloží.';
