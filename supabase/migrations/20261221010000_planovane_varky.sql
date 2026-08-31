-- Planovane varky (Planovac obsazenosti tanku ve Sklepe) do databaze.
--
-- Dosud zily jen v localStorage (`cellar_planned_brews_data`);
-- TankOccupancyPlanner.tsx importoval `supabase` POUZE kvuli typum a zadny
-- dotaz nedelal. Kdo planoval varky na tabletu, na mobilu je nevidel — a
-- planovani obsazenosti tanku je prave ta vec, kterou si domlouva vic lidi.

CREATE TABLE IF NOT EXISTS public.planovane_varky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tank, do ktereho se ma varka dat. ON DELETE CASCADE: plan pro zruseny
  -- tank nema kam patrit a v planovaci by strasil.
  tank_id uuid NOT NULL REFERENCES public.cellar_tanks(id) ON DELETE CASCADE,
  -- Nazev piva volnym textem: planuje se i pivo, ktere jeste neni v
  -- ciselniku (novinka, zkusebni varka).
  pivo text NOT NULL DEFAULT '',
  objem_hl numeric NOT NULL DEFAULT 0,
  datum_od date NOT NULL,
  -- Na kolik dni je tank plánovaně obsazený.
  dnu integer NOT NULL DEFAULT 30,
  poznamka text,
  vytvoril text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Planovac vykresluje pás obsazenosti po tancích a datech.
CREATE INDEX IF NOT EXISTS planovane_varky_tank_idx ON public.planovane_varky (tank_id);
CREATE INDEX IF NOT EXISTS planovane_varky_datum_idx ON public.planovane_varky (datum_od);

ALTER TABLE public.planovane_varky ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planovane_varky_select ON public.planovane_varky;
CREATE POLICY planovane_varky_select ON public.planovane_varky
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_planovane_varky ON public.planovane_varky;
CREATE POLICY perm_insert_planovane_varky ON public.planovane_varky
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS perm_update_planovane_varky ON public.planovane_varky;
CREATE POLICY perm_update_planovane_varky ON public.planovane_varky
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('cellar'))
  WITH CHECK (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS perm_delete_planovane_varky ON public.planovane_varky;
CREATE POLICY perm_delete_planovane_varky ON public.planovane_varky
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('cellar'));
