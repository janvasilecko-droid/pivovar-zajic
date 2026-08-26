-- Odskrtavani v planu staceni ("Co stocit na ktery den").
--
-- POZOR: tohle NENI evidence staceni. Je to pracovni odskrtavatko — staceci
-- slouzi jen k tomu, aby videl, ktere polozky dneska uz ma hotove. Skutecne
-- staceni se dal zapisuje v zalozce "Zacatek staceni" (tabulka kegging)
-- a jenom to hybe skladem a objemem tanku. Kdyby odskrtnuti zapisovalo do
-- kegging, vznikl by pri beznem zapisu duplicitni zaznam a sklad by se
-- nafoukl o kazdy odskrtnuty sud.
--
-- Jeden radek = jedna polozka planu (tyden + den + pivo + obal) a kolik kusu
-- z ni ma stacec odskrtnutych. Zamerne je to UPSERT na jeden radek, ne
-- historie pohybu: odskrtnuti neni ucetni udaj, jen stav rozdelane prace.
--
-- V planu se odskrtnuti a skutecne stoceni skladaji pres MAX, ne souctem —
-- kdyz stacec polozku odskrtne a pozdeji ji poradne zapise do kegging,
-- nesmi se pocitat dvakrat.

CREATE TABLE IF NOT EXISTS public.kegging_plan_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key text NOT NULL,
  day text NOT NULL,
  beer_id uuid NOT NULL REFERENCES public.beers(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.kegging_plan_checks
  DROP CONSTRAINT IF EXISTS kegging_plan_checks_qty_nonneg;
ALTER TABLE public.kegging_plan_checks
  ADD CONSTRAINT kegging_plan_checks_qty_nonneg CHECK (qty >= 0);

-- Jedna polozka planu = nejvyse jeden radek, aby se odskrtnuti prepisovalo,
-- ne hromadilo.
CREATE UNIQUE INDEX IF NOT EXISTS kegging_plan_checks_unique_idx
  ON public.kegging_plan_checks (week_key, day, beer_id, package_id);

CREATE INDEX IF NOT EXISTS kegging_plan_checks_week_idx
  ON public.kegging_plan_checks (week_key);

ALTER TABLE public.kegging_plan_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kegging_plan_checks_select ON public.kegging_plan_checks;
CREATE POLICY kegging_plan_checks_select ON public.kegging_plan_checks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_kegging_plan_checks ON public.kegging_plan_checks;
CREATE POLICY perm_insert_kegging_plan_checks ON public.kegging_plan_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging'));

DROP POLICY IF EXISTS perm_update_kegging_plan_checks ON public.kegging_plan_checks;
CREATE POLICY perm_update_kegging_plan_checks ON public.kegging_plan_checks
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('kegging'))
  WITH CHECK (public.user_can_edit_module('kegging'));

DROP POLICY IF EXISTS perm_delete_kegging_plan_checks ON public.kegging_plan_checks;
CREATE POLICY perm_delete_kegging_plan_checks ON public.kegging_plan_checks
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('kegging'));
