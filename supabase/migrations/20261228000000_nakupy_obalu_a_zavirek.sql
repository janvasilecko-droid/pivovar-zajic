-- Nakupy prazdnych lahvi a zavirek (korunky, PET vicka).
--
-- Evidence nakupu lahvi zila jen v localStorage prohlizece (klic
-- "bottles_purchases") — presne ta chyba, kterou u etiket resila migrace
-- 20261120000000_add_label_purchases.sql. Dusledky jsou stejne: kazdy
-- telefon vidi jiny stav, po vycisteni dat prohlizece je evidence pryc a
-- kdo zapisoval na jednom zarizeni, ten na druhem nevidi nic.
--
-- Tabulka je schvalne stejneho tvaru jako label_purchases, jen misto
-- beer_name je nazev obalu (volny text: "1.5L", "Korunky 26 mm",
-- "Vicka PET"). Druh zavirky se z nazvu odvozuje v aplikaci
-- (src/lib/materialSklad.ts), ne v databazi — kdyby se pravidlo zmenilo,
-- meni se na jednom miste a data zustanou.
--
-- Prevod stareho localStorage: aplikace pri prvnim otevreni obrazovky
-- nahraje zaznamy z telefonu do tabulky (jednou, oznaci si to) — proto
-- tady zadny INSERT neni. Zaznamy z ruznych telefonu se tim slouci; to
-- je spravne, byly to porad nakupy jednoho pivovaru.

CREATE TABLE IF NOT EXISTS public.obal_nakupy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  -- Nazev obalu nebo zavirky, presne jak ho vybral clovek.
  package_label text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  -- Odkud zaznam prisel: 'obrazovka' nebo 'prevod-z-telefonu'.
  zdroj text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obal_nakupy_obal_idx
  ON public.obal_nakupy (package_label, entry_date DESC);

ALTER TABLE public.obal_nakupy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_read_obal_nakupy" ON public.obal_nakupy
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_insert_obal_nakupy" ON public.obal_nakupy
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_update_obal_nakupy" ON public.obal_nakupy
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_delete_obal_nakupy" ON public.obal_nakupy
  FOR DELETE TO authenticated USING (true);

-- Realtime, at se zapis z jednoho telefonu objevi na druhem.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.obal_nakupy;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'obal_nakupy uz v publikaci: %', SQLERRM;
END $$;

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228000000_nakupy_obalu_a_zavirek.sql', 'migrace sama', 'nakupy lahvi a zavirek do databaze')
ON CONFLICT (nazev) DO NOTHING;
