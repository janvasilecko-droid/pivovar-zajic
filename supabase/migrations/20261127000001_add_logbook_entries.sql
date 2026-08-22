-- Create logbook_entries table (Kniha jízd).
-- Created: 2026-11-27
-- Reason: Kniha jízd dosud žila jen v localStorage prohlížeče (klíč
--         "kniha_jizd_entries") — pro evidenci pro finanční úřad je to
--         riziko (jiné zařízení/prohlížeč nebo smazaná cache = ztracená
--         data). Přesun do Supabase = jeden sdílený, trvalý zdroj pravdy.

CREATE TABLE IF NOT EXISTS logbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_name text NOT NULL,
  driver text NOT NULL,
  route_from text NOT NULL,
  route_to text NOT NULL,
  purpose text NOT NULL,
  km_start numeric NOT NULL DEFAULT 0,
  km_end numeric NOT NULL DEFAULT 0,
  km_driven numeric NOT NULL DEFAULT 0,
  fuel_liters numeric,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE logbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_logbook_entries" ON logbook_entries;
CREATE POLICY "auth_read_logbook_entries" ON logbook_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_logbook_entries" ON logbook_entries;
CREATE POLICY "auth_write_logbook_entries" ON logbook_entries FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_logbook_entries" ON logbook_entries;
CREATE POLICY "auth_update_logbook_entries" ON logbook_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_logbook_entries" ON logbook_entries;
CREATE POLICY "auth_delete_logbook_entries" ON logbook_entries FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_logbook_entries_date ON logbook_entries(entry_date);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.logbook_entries;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'logbook_entries už v publikaci: %', SQLERRM;
END $$;
