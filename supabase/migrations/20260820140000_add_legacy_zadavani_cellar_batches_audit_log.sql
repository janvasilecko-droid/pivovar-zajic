-- Legacy tabulky, na které aplikace/operativní skripty odkazují, ale v produkci chyběly:
--   * audit_log       — auditní log operací (typ AuditEntry v src/lib/supabase.ts,
--                       tabulka je i v realtime publikaci a v cleanup skriptech)
--   * cellar_batches  — várky v tancích sklepa (src/lib/backup.ts)
--   * zadavani        — legacy záznamy (cleanup/backup skripty)
-- Schema zadavani / cellar_batches je minimální best-guess — žádný kód sloupce
-- nepoužívá, tabulky vznikají hlavně kvůli tomu, aby cleanup/backup skripty
-- běžely bez chyby "table does not exist".

-- 1) audit_log (odpovídá typu AuditEntry)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_audit_log" ON audit_log;
CREATE POLICY "auth_read_audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_audit_log" ON audit_log;
CREATE POLICY "auth_write_audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_audit_log" ON audit_log;
CREATE POLICY "auth_update_audit_log" ON audit_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_audit_log" ON audit_log;
CREATE POLICY "auth_delete_audit_log" ON audit_log FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
COMMENT ON TABLE audit_log IS 'Auditní log operací nad daty (typ AuditEntry).';

-- 2) cellar_batches — várky v tancích sklepa
CREATE TABLE IF NOT EXISTS cellar_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  tank_id uuid REFERENCES public.cellar_tanks(id) ON DELETE SET NULL,
  tank_label text,
  volume_hl numeric DEFAULT 0,
  og numeric,
  fg numeric,
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cellar_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_read_cellar_batches" ON cellar_batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_write_cellar_batches" ON cellar_batches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_update_cellar_batches" ON cellar_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_delete_cellar_batches" ON cellar_batches FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE cellar_batches IS 'Várky v tancích sklepa (legacy — doposud žádný kód nepíše, schéma je best-guess).';

-- 3) zadavani — legacy záznamy
CREATE TABLE IF NOT EXISTS zadavani (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  amount numeric DEFAULT 0,
  unit text,
  note text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE zadavani ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_zadavani" ON zadavani;
CREATE POLICY "auth_read_zadavani" ON zadavani FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_zadavani" ON zadavani;
CREATE POLICY "auth_write_zadavani" ON zadavani FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_zadavani" ON zadavani;
CREATE POLICY "auth_update_zadavani" ON zadavani FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_zadavani" ON zadavani;
CREATE POLICY "auth_delete_zadavani" ON zadavani FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE zadavani IS 'Legacy tabulka (doposud žádný kód nečte ani nezapisuje, schéma je best-guess).';

-- audit_log doplnit i do realtime publikace (byla v seznamu už v enable_realtime)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'audit_log už v publikaci: %', SQLERRM;
END $$;
