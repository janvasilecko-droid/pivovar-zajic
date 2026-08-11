-- Create inventory_adjustments table (dorovnání inventury — uchovává se BOKEM).
-- Created: 2026-11-08
-- Reason: V inventuře je nový sloupec „Dorovnat (±)“, kterým uživatel přičte/ubírá
--         k očekávanému (teoretickému) stavu, aby seděl s fyzickou realitou (manko).
--         Záznamy se ukládají ZVLÁŠŤ (mimo tabulku inventory) a NEpočítají se
--         do stáčení ani do odpočtů.

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,            -- 1. den měsíce, za který dorovnání platí
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0, -- kladné = dorovnat navíc (+), záporné = ubrat (−)
  reason text,                         -- nepovinná poznámka (proč)
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_read_inventory_adjustments" ON inventory_adjustments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_write_inventory_adjustments" ON inventory_adjustments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_update_inventory_adjustments" ON inventory_adjustments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_delete_inventory_adjustments" ON inventory_adjustments FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_month ON inventory_adjustments(entry_date, beer_id, package_id);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_adjustments;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'inventory_adjustments už v publikaci: %', SQLERRM;
END $$;
