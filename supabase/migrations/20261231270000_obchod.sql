-- Obchod (prodejna): vlastní sklad, uzávěrky z pokladny, inventura.
--
-- Zadání 10. 10. 2026: „přidej dlaždici obchod — vyjíždí se tam tyhle
-- uzávěrky, ať to appka dokáže přečíst z fotky a odečítá to ze skladu;
-- volba zadat uzávěrku denní, týdenní, měsíční; inventura na konci měsíce,
-- statistiky prodeje, fasování piv, hlídání skladových zásob" a upřesnění:
-- „prodejna fasuje piva ze skladu pivovaru do vlastního skladu, kde nejsou
-- jen piva, a z vlastního skladu prodává."
--
-- JAK TO FUNGUJE
--   • Zboží obchodu = zboží z pokladny podle jeho KÓDU (obchod_zbozi). Pivo má
--     vazbu na pivo a obal z katalogu (beer_id + package_id), ostatní zboží
--     (limo, saponát, kartonek…) ji nemá.
--   • Do skladu obchodu přibývá: Fasování → Prodejna (už existuje, tabulka
--     fasovani_private; sklad pivovaru se z ní odečítá jako dosud) a ruční
--     příjem zboží (obchod_prijem).
--   • Ze skladu obchodu ubývá uzávěrkou z pokladny (obchod_uzaverky + řádky).
--   • Stav skladu se NEUKLÁDÁ, počítá se: poslední inventura zboží + příjmy −
--     prodej po ní (obchod_inventura). Smazání uzávěrky tak sklad vrátí.
--
-- Nic se tu nemění ani nemaže v existujících tabulkách.

-- 1) Zboží obchodu -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.obchod_zbozi (
  kod text PRIMARY KEY,
  nazev text NOT NULL,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  cena numeric,
  min_ks numeric CHECK (min_ks IS NULL OR min_ks >= 0),
  aktivni boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT obchod_zbozi_pivo_i_obal CHECK ((beer_id IS NULL) = (package_id IS NULL))
);

-- Jedno pivo v jednom obalu = jedno aktivní zboží, jinak by Fasování nevědělo,
-- kam kusy připsat.
CREATE UNIQUE INDEX IF NOT EXISTS obchod_zbozi_pivo_obal_uniq
  ON public.obchod_zbozi (beer_id, package_id)
  WHERE beer_id IS NOT NULL AND aktivni;

-- 2) Příjem zboží (mimo Fasování) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.obchod_prijem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum date NOT NULL,
  kod text NOT NULL REFERENCES public.obchod_zbozi(kod) ON UPDATE CASCADE,
  mnozstvi numeric NOT NULL CHECK (mnozstvi <> 0),
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obchod_prijem_kod_datum_idx ON public.obchod_prijem (kod, datum);

-- 3) Uzávěrky z pokladny ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.obchod_uzaverky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cislo text,
  stredisko text,
  typ text NOT NULL CHECK (typ IN ('denni', 'tydenni', 'mesicni')),
  datum_od date NOT NULL,
  datum_do date NOT NULL,
  -- Čas tisku tak, jak je na účtence (místní čas, bez časového pásma).
  vytisteno timestamp,
  trzba numeric,
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obchod_uzaverky_obdobi CHECK (datum_do >= datum_od)
);

-- Stejná uzávěrka (středisko + číslo) se nezapíše dvakrát.
CREATE UNIQUE INDEX IF NOT EXISTS obchod_uzaverky_cislo_uniq
  ON public.obchod_uzaverky (COALESCE(stredisko, ''), cislo)
  WHERE cislo IS NOT NULL;
CREATE INDEX IF NOT EXISTS obchod_uzaverky_datum_idx ON public.obchod_uzaverky (datum_do);

CREATE TABLE IF NOT EXISTS public.obchod_uzaverky_radky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uzaverka_id uuid NOT NULL REFERENCES public.obchod_uzaverky(id) ON DELETE CASCADE,
  kod text NOT NULL REFERENCES public.obchod_zbozi(kod) ON UPDATE CASCADE,
  nazev text,
  mnozstvi numeric NOT NULL CHECK (mnozstvi > 0),
  cena numeric,
  celkem numeric
);
CREATE INDEX IF NOT EXISTS obchod_uzaverky_radky_uzaverka_idx ON public.obchod_uzaverky_radky (uzaverka_id);
CREATE INDEX IF NOT EXISTS obchod_uzaverky_radky_kod_idx ON public.obchod_uzaverky_radky (kod);

-- 4) Inventura obchodu -----------------------------------------------------
-- Jeden řádek = jedno zboží napočítané ke konci dne `datum`. Od téhle chvíle
-- se sklad zboží počítá z napočítaného čísla.
CREATE TABLE IF NOT EXISTS public.obchod_inventura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum date NOT NULL,
  kod text NOT NULL REFERENCES public.obchod_zbozi(kod) ON UPDATE CASCADE,
  napocitano numeric NOT NULL CHECK (napocitano >= 0),
  ocekavano numeric,
  poznamka text,
  zapsal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (datum, kod)
);
CREATE INDEX IF NOT EXISTS obchod_inventura_kod_datum_idx ON public.obchod_inventura (kod, datum);

-- 5) Práva: čtení všem přihlášeným, zápis jako u Fasování (modul entry) ------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['obchod_zbozi', 'obchod_prijem', 'obchod_uzaverky', 'obchod_uzaverky_radky', 'obchod_inventura']
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

    -- Živé obnovení: uzávěrku zapsal někdo jiný, sklad se hned přepočítá.
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% už v publikaci: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

COMMENT ON TABLE public.obchod_zbozi IS 'Zboží obchodu podle kódu z pokladny; pivo má vazbu na pivo a obal z katalogu.';
COMMENT ON TABLE public.obchod_prijem IS 'Ruční příjem zboží do skladu obchodu (pivo se naskladňuje Fasováním → Prodejna).';
COMMENT ON TABLE public.obchod_uzaverky IS 'Uzávěrky z pokladny obchodu (denní, týdenní, měsíční) — odečítají sklad obchodu.';
COMMENT ON TABLE public.obchod_uzaverky_radky IS 'Řádky uzávěrky: zboží (kód), prodané množství, cena.';
COMMENT ON TABLE public.obchod_inventura IS 'Inventura obchodu: napočítaný stav zboží ke konci dne; od něj se sklad počítá.';
