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
