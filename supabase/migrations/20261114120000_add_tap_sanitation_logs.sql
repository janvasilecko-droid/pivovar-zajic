-- Sanitární deník výčepů (tap_sanitation_logs) + časové údaje kroků.
-- Created: 2026-11-14
-- Reason: Každý krok sanitace lahví/KEGů dostane vlastní čas (step_times jsonb)
-- a přibývá zcela nový sanitární deník pro výčepy.

-- 1) Časové údaje jednotlivých kroků u stávajících deníků (jsonb mapa: krok -> HH:MM)
ALTER TABLE bottle_sanitation_logs
  ADD COLUMN IF NOT EXISTS step_times jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE keg_sanitation_logs
  ADD COLUMN IF NOT EXISTS step_times jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Nová tabulka sanitárního deníku výčepů
CREATE TABLE IF NOT EXISTS tap_sanitation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tap_id text NOT NULL,
  tap_name text,
  sanitation_date date NOT NULL,
  sanitation_time text,
  performed_by text,
  approved_by text,
  reason text, -- 'pred_stacenim', 'po_staceni', 'mesicni', 'oprava'
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [ {id, text, completed, completedAt} ]
  water_rinse_time text,
  louh_sanitation_time text,
  disassembly_time text,
  visual_check_time text,
  note text,
  source text CHECK (source IN ('manual', 'checklist')) DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tap_sanitation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_tap_sanitation_logs" ON tap_sanitation_logs;
CREATE POLICY "auth_read_tap_sanitation_logs" ON tap_sanitation_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_tap_sanitation_logs" ON tap_sanitation_logs;
CREATE POLICY "auth_write_tap_sanitation_logs" ON tap_sanitation_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_tap_sanitation_logs" ON tap_sanitation_logs;
CREATE POLICY "auth_update_tap_sanitation_logs" ON tap_sanitation_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_tap_sanitation_logs" ON tap_sanitation_logs;
CREATE POLICY "auth_delete_tap_sanitation_logs" ON tap_sanitation_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tap_sanitation_logs_date ON tap_sanitation_logs(sanitation_date DESC, created_at DESC);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tap_sanitation_logs;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tap_sanitation_logs už v publikaci: %', SQLERRM;
END $$;