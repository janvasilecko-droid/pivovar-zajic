-- Kolik máme malých sudů (KEG 20/15/10 l) — podle obalu.
--
-- Z provozu 29. 9. 2026: „pro stáčení sudů připrav záložku malé sudy, tam
-- naklikám počet malých sudů 20, 15, 10, a pak mi v objednávkách hlídej,
-- aby když mám 3× 15, tak mi označ a hlídej, že můžu celkem použít jen
-- 3× 15, ne třeba 6× 15."
--
-- Jeden řádek = jeden obal. Počet zadává stáčeč na obrazovce KEG
-- (záložka Malé sudy), Objednávky podle něj hlídají otevřené objednávky
-- (src/lib/maleSudy.ts). Obal bez řádku se nehlídá.

CREATE TABLE IF NOT EXISTS public.male_sudy (
  package_id uuid PRIMARY KEY REFERENCES public.packages(id) ON DELETE CASCADE,
  pocet integer NOT NULL DEFAULT 0 CHECK (pocet >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.male_sudy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS male_sudy_select ON public.male_sudy;
CREATE POLICY male_sudy_select ON public.male_sudy
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_male_sudy ON public.male_sudy;
CREATE POLICY perm_insert_male_sudy ON public.male_sudy
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging'));

DROP POLICY IF EXISTS perm_update_male_sudy ON public.male_sudy;
CREATE POLICY perm_update_male_sudy ON public.male_sudy
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('kegging'))
  WITH CHECK (public.user_can_edit_module('kegging'));

DROP POLICY IF EXISTS perm_delete_male_sudy ON public.male_sudy;
CREATE POLICY perm_delete_male_sudy ON public.male_sudy
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('kegging'));

-- Živé obnovení: stáčeč přiklikne sud a Objednávky to hned vidí.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.male_sudy;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'male_sudy už v publikaci: %', SQLERRM;
END $$;

COMMENT ON TABLE public.male_sudy IS 'Kolik malých sudů (KEG 20/15/10 l) je k dispozici — Objednávky hlídají, aby je otevřené objednávky nepřečerpaly.';
