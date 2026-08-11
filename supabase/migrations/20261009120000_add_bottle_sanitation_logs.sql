-- Sanitární deník lahví: denní záznam sanitace stáčecí linky lahví.
-- Aplikace: BottleSanitationDiary.tsx + lib/bottleSanitation.ts.
-- Jeden den stáčení = jeden záznam: louh NaOH, proplach čistou vodou,
-- celá cesta včetně vzduchové na louhu s opláchem a úklid prostor.
-- Zápis se vytváří ručně nebo automaticky po dokončení checklistu
-- „Konec stáčení“ / „Měsíční údržba“ (source = 'checklist').
CREATE TABLE IF NOT EXISTS bottle_sanitation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sanitation_date date NOT NULL,
  louh boolean NOT NULL DEFAULT false,
  proplach_vodou boolean NOT NULL DEFAULT false,
  cela_cesta_na_louhu boolean NOT NULL DEFAULT false,
  prostory boolean NOT NULL DEFAULT false,
  performed_by text,
  note text,
  source text CHECK (source IN ('manual', 'checklist')) DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bottle_sanitation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_bottle_sanitation_logs" ON bottle_sanitation_logs;
CREATE POLICY "auth_read_bottle_sanitation_logs" ON bottle_sanitation_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_bottle_sanitation_logs" ON bottle_sanitation_logs;
CREATE POLICY "auth_write_bottle_sanitation_logs" ON bottle_sanitation_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_bottle_sanitation_logs" ON bottle_sanitation_logs;
CREATE POLICY "auth_update_bottle_sanitation_logs" ON bottle_sanitation_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_bottle_sanitation_logs" ON bottle_sanitation_logs;
CREATE POLICY "auth_delete_bottle_sanitation_logs" ON bottle_sanitation_logs FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_bottle_sanitation_logs_date ON bottle_sanitation_logs(sanitation_date DESC, created_at DESC);
COMMENT ON TABLE bottle_sanitation_logs IS 'Sanitární deník lahví HACCP: denní sanitace stáčecí linky lahví (louh, proplach vodou, cesta na louhu, úklid prostor, odpovědná osoba).';

-- Realtime (živé obnovení deníku na otevřených zařízeních)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bottle_sanitation_logs;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bottle_sanitation_logs už v publikaci: %', SQLERRM;
END $$;
