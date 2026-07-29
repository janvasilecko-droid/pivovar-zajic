/*
# Add akce_items child table

1. New Tables
- `akce_items` — one row per beer carried to an akce (event)
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
