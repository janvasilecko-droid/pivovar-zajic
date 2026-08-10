-- Rozšíření tabulky reminders o hromadné cílení na konkrétní uživatele.
--
-- Aplikace nyní umožňuje posílat zprávy a upozornění nejen všem / roli,
-- ale i vybraným konkrétním uživatelům (vícenásobný výběr podle e-mailů).
--
-- 1. CREATE TABLE IF NOT EXISTS — vytvoří tabulku (včetně nového sloupce
--    target_emails text[]) i pro čistou instalaci databáze.
-- 2. ALTER ... ADD COLUMN IF NOT EXISTS — pro existující databáze, kde tabulka
--    už existuje (manuálně založená), přidá případné chybějící sloupce.
-- 3. RLS politiky — sdílená data pivovaru (stejný vzor jako calendar_events).

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  note text,
  date_time timestamptz NOT NULL,
  target_role text NOT NULL DEFAULT 'all',
  target_emails text[] NOT NULL DEFAULT '{}',
  display_mode text NOT NULL DEFAULT 'both',
  created_by text,
  created_at timestamptz DEFAULT now(),
  acknowledged_by text[] NOT NULL DEFAULT '{}',
  is_completed boolean NOT NULL DEFAULT false
);

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS date_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS target_role text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS target_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS acknowledged_by text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select" ON reminders;
CREATE POLICY "reminders_select" ON reminders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reminders_insert" ON reminders;
CREATE POLICY "reminders_insert" ON reminders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "reminders_update" ON reminders;
CREATE POLICY "reminders_update" ON reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "reminders_delete" ON reminders;
CREATE POLICY "reminders_delete" ON reminders FOR DELETE TO authenticated USING (true);

COMMENT ON COLUMN reminders.target_emails IS 'E-maily konkrétních příjemců (prázdné pole = cílí se podle target_role / všichni).';
