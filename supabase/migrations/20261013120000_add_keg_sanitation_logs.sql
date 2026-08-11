-- Create keg_sanitation_logs table for KEG packaging line sanitation diary.
-- Created: 2026-08-11
-- Reason: Detailed KEG bottling line sanitation logs (HACCP compliant).

CREATE TABLE IF NOT EXISTS keg_sanitation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sanitation_date date NOT NULL,
  sanitation_time text,
  performed_by text,
  approved_by text,
  reason text, -- 'pred_stacenim', 'po_staceni', 'mesicni'
  
  -- Checklist před stáčením (Before)
  proc_rinse_naoh_2_20 boolean NOT NULL DEFAULT false,
  proc_rinse_persteril_02_10 boolean NOT NULL DEFAULT false,
  proc_rinse_water_before boolean NOT NULL DEFAULT false,
  proc_scrub_valves_naoh_2_15 boolean NOT NULL DEFAULT false,
  proc_spray_valves_persteril_02_10 boolean NOT NULL DEFAULT false,
  proc_rinse_water_after_valves boolean NOT NULL DEFAULT false,
  
  -- Checklist po stáčení (After)
  proc_end_rinse_lines_water boolean NOT NULL DEFAULT false,
  proc_end_rinse_valves_water boolean NOT NULL DEFAULT false,
  proc_end_rinse_couplers_water boolean NOT NULL DEFAULT false,
  proc_end_rinse_floors_cellar boolean NOT NULL DEFAULT false,
  proc_end_rinse_floors_walls_bottlers boolean NOT NULL DEFAULT false,
  proc_end_coupler_heads_persteril_bucket boolean NOT NULL DEFAULT false,
  
  -- Měsíční sanitace (Monthly)
  proc_month_disassemble_couplers boolean NOT NULL DEFAULT false,
  proc_month_clean_brush_24h boolean NOT NULL DEFAULT false,
  proc_month_rinse_water boolean NOT NULL DEFAULT false,
  proc_month_visual_clean boolean NOT NULL DEFAULT false,

  note text,
  source text CHECK (source IN ('manual', 'checklist')) DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE keg_sanitation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_keg_sanitation_logs" ON keg_sanitation_logs;
CREATE POLICY "auth_read_keg_sanitation_logs" ON keg_sanitation_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_keg_sanitation_logs" ON keg_sanitation_logs;
CREATE POLICY "auth_write_keg_sanitation_logs" ON keg_sanitation_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_keg_sanitation_logs" ON keg_sanitation_logs;
CREATE POLICY "auth_update_keg_sanitation_logs" ON keg_sanitation_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_keg_sanitation_logs" ON keg_sanitation_logs;
CREATE POLICY "auth_delete_keg_sanitation_logs" ON keg_sanitation_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_keg_sanitation_logs_date ON keg_sanitation_logs(sanitation_date DESC, created_at DESC);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.keg_sanitation_logs;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'keg_sanitation_logs už v publikaci: %', SQLERRM;
END $$;
