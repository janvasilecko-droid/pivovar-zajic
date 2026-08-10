-- Tabulka poznámek — součást „Kalendář & Poznámky".
--
-- Umožňuje zapisovat volné poznámky (bez vazby na datum/upomínku),
-- sdílené mezi všemi uživateli pivovaru (jako kalendář / upomínky).

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  body text NOT NULL,
  color text NOT NULL DEFAULT 'primary',
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select" ON notes;
CREATE POLICY "notes_select" ON notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notes_insert" ON notes;
CREATE POLICY "notes_insert" ON notes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notes_update" ON notes;
CREATE POLICY "notes_update" ON notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notes_delete" ON notes;
CREATE POLICY "notes_delete" ON notes FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

COMMENT ON TABLE notes IS 'Volné poznámky sdílené v rámci pivovaru (Kalendář & Poznámky).';
