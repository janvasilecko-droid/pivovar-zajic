-- BottlingLineMaintenance.tsx (HACCP -> "Udrzba staceci linky") byla cele
-- jen in-memory useState s natvrdo vyplnenymi ukazkovymi udaji (vcetne
-- vymyslenych jmen "Sladek (Vasil)"/"Martin Sladek") - po refreshi stranky
-- zmizelo uplne vsechno, "Odsouhlasit provedeni udrzby" nic neukladalo.
-- Tahle migrace prida skutecnou tabulku, aby ukony udrzby prezily refresh
-- a byly sdilene mezi zarizenimi/uzivateli.
CREATE TABLE IF NOT EXISTS public.bottling_line_maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name text NOT NULL,
  task_type text NOT NULL,
  interval_days integer NOT NULL DEFAULT 30,
  last_done_at date NOT NULL,
  next_due_at date NOT NULL,
  assigned_operator text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bottling_line_maintenance_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bottling_line_maintenance_read ON public.bottling_line_maintenance_tasks;
DROP POLICY IF EXISTS bottling_line_maintenance_insert ON public.bottling_line_maintenance_tasks;
DROP POLICY IF EXISTS bottling_line_maintenance_update ON public.bottling_line_maintenance_tasks;
DROP POLICY IF EXISTS bottling_line_maintenance_delete ON public.bottling_line_maintenance_tasks;

CREATE POLICY bottling_line_maintenance_read ON public.bottling_line_maintenance_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY bottling_line_maintenance_insert ON public.bottling_line_maintenance_tasks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bottling_line_maintenance_update ON public.bottling_line_maintenance_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY bottling_line_maintenance_delete ON public.bottling_line_maintenance_tasks
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS bottling_line_maintenance_next_due_idx
  ON public.bottling_line_maintenance_tasks (next_due_at);
