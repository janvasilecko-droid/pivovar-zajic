-- Přefuk KEG sudů: přelití piva ze sudů jedné velikosti do sudů jiné velikosti.
-- Ze skladu se odečtou sudy "ZE" (from_package_id, from_count) a přičtou se sudy "DO" (to_package_id, to_count).
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
