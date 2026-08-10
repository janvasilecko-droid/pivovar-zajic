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
