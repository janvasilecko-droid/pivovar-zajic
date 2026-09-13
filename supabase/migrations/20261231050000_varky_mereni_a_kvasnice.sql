-- 🧪 Várky ve sklepě: průběh kvašení a generace kvasnic.
--
-- Návrhy z 13. 9. 2026 (páté kolo), body 9 a 11. Tabulka cellar_batches
-- existuje od srpna 2026, ale žádná obrazovka do ní nepsala (komentář
-- u tabulky to přiznává: „legacy — doposud žádný kód nepíše"). Várka měla
-- jen počáteční a konečnou stupňovitost, takže průběh kvašení se nikde
-- nezapisoval, a generaci kvasnic appka neznala vůbec.

ALTER TABLE public.cellar_batches
  ADD COLUMN IF NOT EXISTS kvasnice_generace integer,
  ADD COLUMN IF NOT EXISTS kvasnice_z_varky uuid REFERENCES public.cellar_batches(id) ON DELETE SET NULL;

ALTER TABLE public.cellar_batches DROP CONSTRAINT IF EXISTS cellar_batches_generace_kladna;
ALTER TABLE public.cellar_batches
  ADD CONSTRAINT cellar_batches_generace_kladna CHECK (kvasnice_generace IS NULL OR kvasnice_generace >= 1);

COMMENT ON TABLE public.cellar_batches IS
  'Várky v tancích sklepa. Zapisuje obrazovka Sklep → Várky (components/VarkySklep.tsx).';
COMMENT ON COLUMN public.cellar_batches.kvasnice_generace IS
  'Kolikátá generace kvasnic (1 = čerstvé). Při nasazení z jiné várky appka navrhne generaci o jedna vyšší.';

CREATE TABLE IF NOT EXISTS public.cellar_batch_mereni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cellar_batches(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  stupnovitost numeric,
  teplota_c numeric,
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cellar_batch_mereni_neco_namereno CHECK (stupnovitost IS NOT NULL OR teplota_c IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS cellar_batch_mereni_batch_idx ON public.cellar_batch_mereni (batch_id, measured_at);

ALTER TABLE public.cellar_batch_mereni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cellar_batch_mereni_select ON public.cellar_batch_mereni;
CREATE POLICY cellar_batch_mereni_select ON public.cellar_batch_mereni
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_cellar_batch_mereni ON public.cellar_batch_mereni;
CREATE POLICY perm_insert_cellar_batch_mereni ON public.cellar_batch_mereni
  FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS perm_update_cellar_batch_mereni ON public.cellar_batch_mereni;
CREATE POLICY perm_update_cellar_batch_mereni ON public.cellar_batch_mereni
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('cellar'))
  WITH CHECK (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS perm_delete_cellar_batch_mereni ON public.cellar_batch_mereni;
CREATE POLICY perm_delete_cellar_batch_mereni ON public.cellar_batch_mereni
  FOR DELETE TO authenticated USING (public.user_can_edit_module('cellar'));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cellar_batches;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cellar_batch_mereni;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
