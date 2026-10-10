-- 🏪 Obchod: odpis zboží a dny, kdy bylo zavřeno.
--
-- Navazuje na 20261231270000_obchod (sklad obchodu se POČÍTÁ, neukládá).
--
--   • obchod_odpis — rozbité, prošlé, ztracené zboží v prodejně. Ze skladu
--     obchodu ubývá po poslední inventuře stejně jako prodej z uzávěrky.
--     (Odpis ze skladu pivovaru je jiná věc, ta zůstává v Odpisu.)
--   • obchod_zavreno — den, kdy se v obchodě neprodávalo, takže pro něj
--     neexistuje uzávěrka. Bez toho by hlídání mezer v uzávěrkách u každé
--     neděle volalo planý poplach.
--
-- Nic se tu nemění ani nemaže v existujících tabulkách.

-- 1) Odpis zboží obchodu ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.obchod_odpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum date NOT NULL,
  kod text NOT NULL REFERENCES public.obchod_zbozi(kod) ON UPDATE CASCADE,
  mnozstvi numeric NOT NULL CHECK (mnozstvi > 0),
  duvod text NOT NULL CHECK (duvod IN ('rozbite', 'prosle', 'ztrata', 'vlastni', 'jine')),
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obchod_odpis_kod_datum_idx ON public.obchod_odpis (kod, datum);

-- 2) Dny bez prodeje (zavřeno) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.obchod_zavreno (
  datum date PRIMARY KEY,
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Práva a živé obnovení — stejně jako u ostatních tabulek obchodu --------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obchod_odpis', 'obchod_zavreno']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_insert_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module(''entry''))',
      'perm_insert_' || t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_edit_module(''entry'')) WITH CHECK (public.user_can_edit_module(''entry''))',
      'perm_update_' || t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_delete_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_edit_module(''entry''))',
      'perm_delete_' || t, t);

    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% už v publikaci: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

COMMENT ON TABLE public.obchod_odpis IS 'Odpis zboží ze skladu obchodu (rozbité, prošlé, ztráta, vlastní spotřeba).';
COMMENT ON TABLE public.obchod_zavreno IS 'Dny, kdy se v obchodě neprodávalo — pro hlídání mezer v uzávěrkách.';
