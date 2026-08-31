-- Poznamka poslana VSEM (spolecna nastenka pivovaru).
--
-- Bezne poznamky na plose jsou OSOBNI: kazdy ma svoje, synchronizuji se mu
-- napric jeho zarizenimi pres profiles.home_layout. To zustava.
--
-- Obcas ale potrebuje nekdo vzkaz, ktery ma videt cela smena — „zitra se
-- stáčí od sedmi", „dosly korunky". Dosud to slo jen tak, ze to kazdemu
-- napsal zvlast. Tahle tabulka je pro ty vzkazy: co sem prijde, vidi vsichni.

CREATE TABLE IF NOT EXISTS public.sdilene_poznamky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  -- Kdo vzkaz napsal — u spolecne nastenky je to podstatne, na rozdil od
  -- osobnich poznamek, kde je autor vzdycky tentyz clovek.
  autor text,
  -- Zvyrazneni vykricnikem, stejne jako u osobnich poznamek.
  dulezite boolean NOT NULL DEFAULT false,
  -- Odskrtnuti plati pro vsechny: je to spolecny ukol, ne muj vlastni.
  hotovo boolean NOT NULL DEFAULT false,
  hotovo_kdo text,
  hotovo_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nastenka se cte odshora: nejdriv dulezite, pak nejnovejsi.
CREATE INDEX IF NOT EXISTS sdilene_poznamky_pohled_idx
  ON public.sdilene_poznamky (hotovo, dulezite DESC, created_at DESC);

ALTER TABLE public.sdilene_poznamky ENABLE ROW LEVEL SECURITY;

-- Spolecna nastenka: cist i psat smi kazdy prihlaseny. Zamerne bez vazby na
-- modul — vzkaz smene neni agenda jednoho modulu a kdyz nekdo nesmi treba do
-- Skladu, porad musi umet napsat „dosly korunky".
DROP POLICY IF EXISTS sdilene_poznamky_select ON public.sdilene_poznamky;
CREATE POLICY sdilene_poznamky_select ON public.sdilene_poznamky
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sdilene_poznamky_insert ON public.sdilene_poznamky;
CREATE POLICY sdilene_poznamky_insert ON public.sdilene_poznamky
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS sdilene_poznamky_update ON public.sdilene_poznamky;
CREATE POLICY sdilene_poznamky_update ON public.sdilene_poznamky
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sdilene_poznamky_delete ON public.sdilene_poznamky;
CREATE POLICY sdilene_poznamky_delete ON public.sdilene_poznamky
  FOR DELETE TO authenticated USING (true);
