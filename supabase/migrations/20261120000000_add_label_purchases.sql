-- Create label_purchases table (nákupy/příjmy etiket na sklad).
-- Created: 2026-11-20
-- Reason: Evidence nákupu etiket dřív žila jen v localStorage prohlížeče
--         (klíč "labels_purchases"), takže se lišila zařízení od zařízení
--         a majitel neměl spolehlivý přehled, kolik etiket kterého piva
--         skutečně zbývá. Přesun do Supabase = jeden sdílený zdroj pravdy,
--         viditelný ze všech zařízení a synchronizovaný v reálném čase.

CREATE TABLE IF NOT EXISTS label_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE label_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_label_purchases" ON label_purchases;
CREATE POLICY "auth_read_label_purchases" ON label_purchases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_label_purchases" ON label_purchases;
CREATE POLICY "auth_write_label_purchases" ON label_purchases FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_label_purchases" ON label_purchases;
CREATE POLICY "auth_update_label_purchases" ON label_purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_label_purchases" ON label_purchases;
CREATE POLICY "auth_delete_label_purchases" ON label_purchases FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_label_purchases_beer ON label_purchases(beer_name, entry_date);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.label_purchases;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'label_purchases už v publikaci: %', SQLERRM;
END $$;
