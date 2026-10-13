-- Záznam úprav stáčení KEG z inventury (kdo, kolik a z kterých zápisů se odečetlo).
--
-- Zadání 13. 10. 2026: minusové položky se odečtou rovnou ze stočených sudů,
-- chybějící se přičtou k poslednímu dni měsíce; stopa, z čeho se odečetlo, se
-- uloží bokem, aby se na ni dalo později podívat — ale mimo Excel a mimo
-- stáčení samotné. Tahle tabulka se do žádného výpočtu skladu ani exportu
-- nezapočítává, je to jen deník.
CREATE TABLE IF NOT EXISTS public.stoceni_upravy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mesic text NOT NULL,
  entry_date date NOT NULL,
  beer_id uuid,
  beer_name text,
  package_id uuid,
  package_label text,
  druh text NOT NULL CHECK (druh IN ('odecteno', 'doplneno')),
  kusu numeric NOT NULL,
  zdroje jsonb NOT NULL DEFAULT '[]'::jsonb,
  tyden_od date,
  zapsal text
);
CREATE INDEX IF NOT EXISTS stoceni_upravy_mesic_idx ON public.stoceni_upravy (mesic);

ALTER TABLE public.stoceni_upravy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stoceni_upravy_select ON public.stoceni_upravy;
CREATE POLICY stoceni_upravy_select ON public.stoceni_upravy FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS perm_insert_stoceni_upravy ON public.stoceni_upravy;
CREATE POLICY perm_insert_stoceni_upravy ON public.stoceni_upravy FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging'));
