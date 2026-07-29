/*
# Schéma databáze minipivovaru

## 1. Nové tabulky
- `beers` — číselník piv (název, stupeň, barva, aktivní)
- `packages` — číselník obalů (KEG 50/30/20/15/10 l, lahve 1.5/1/0.5/0.33 l)
- `places` — číselník odběratelů/míst (Restaurace, Terasa, Maneo, ...)
- `orders` — objednávky (datum, místo, poznámka, zdroj: email/whatsapp/rucne/fotka, stav)
- `order_items` — položky objednávky (beer_id, package_id, množství)
- `bottling` — stáčení lahve (datum, beer_id, package_id, množství, poznámka)
- `kegging` — stáčení kegů (datum, beer_id, package_id, množství, poznámka)
- `writeoffs` — odpis (datum, kdo, beer_id, package_id, množství, důvod)
- `inventory` — inventura (datum, beer_id, package_id, zjištěný stav)
- `profiles` — profil uživatele (display_name, role)

## 2. Bezpečnost
- RLS zapnuto na všech tabulkách.
- Aplikace má přihlašovací obrazovku → politiky `TO authenticated` s vlastnictvím `auth.uid()` u `profiles`.
- Provozní data (beers, packages, places, orders, ...) jsou sdílená mezi všemi přihlášenými uživateli pivovaru → `TO authenticated` s `USING (true)` (sdílená data, viditelná pro všechny přihlášené).
- `profiles` je owner-scoped: každý uživatel vidí a upravuje jen svůj profil.

## 3. Poznámky
- Aplikace pro ~6 uživatelů pivovaru, kteří se přihlašují email/heslem a sdílejí stejná provozní data.
- Měna a jednotky: množství v kusech (KEG) nebo lahvích.
*/

-- Číselník piv
CREATE TABLE IF NOT EXISTS beers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  degree text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Číselník obalů
CREATE TABLE IF NOT EXISTS packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('keg','bottle')),
  volume_l numeric NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

-- Číselník odběratelů / míst
CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Objednávky
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

-- Položky objednávky
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

-- Stáčení lahve
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

-- Stáčení kegů
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

-- Profily uživatelů
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

-- Sdílená číselníky: všichni přihlášení mohou číst a zapisovat
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

-- Trigger: vytvoř profil při registraci
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
