-- Exkurze (prohlidky pivovaru) do databaze.
--
-- Dosud zily VYHRADNE v localStorage (`exkurze_entries_v1`) — ExkurzeScreen.tsx
-- nemel jediny dotaz do databaze. Znamenalo to, ze rezervace prohlidky
-- existovala jen na jednom zarizeni: kdo ji zadal na tabletu, na mobilu ji
-- nevidel, vycisteni dat prohlizece ji smazalo a na novem telefonu se
-- zacinalo s prazdnem.
--
-- Nejhorsi na tom je sloupec `trzba`: je to UCETNI UDAJ. Ten nesmi zaviset
-- na tom, jestli si nekdo omylem necistil prohlizec.

CREATE TABLE IF NOT EXISTS public.exkurze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kdy se prohlidka kona.
  datum date NOT NULL,
  -- HH:MM. Text, ne `time`: v appce se s tim pracuje jako s retezcem z
  -- <input type="time"> a prevod tam a zpet by jen pridal misto na chybu.
  cas text NOT NULL DEFAULT '',
  pocet_lidi integer NOT NULL DEFAULT 0,
  pruvodce text,
  -- Trzba v Kc. numeric, ne integer — spropitne a deleni skupiny umi vyjit
  -- na haleire.
  trzba numeric,
  poznamka text,
  -- YYYY-MM, kdyz je exkurze uz zarchivovana v mesicni statistice.
  archivovano_mesic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kalendar i mesicni statistika ctou po obdobich.
CREATE INDEX IF NOT EXISTS exkurze_datum_idx ON public.exkurze (datum);
CREATE INDEX IF NOT EXISTS exkurze_archiv_idx ON public.exkurze (archivovano_mesic);

ALTER TABLE public.exkurze ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exkurze_select ON public.exkurze;
CREATE POLICY exkurze_select ON public.exkurze
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_exkurze ON public.exkurze;
CREATE POLICY perm_insert_exkurze ON public.exkurze
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('exkurze'));

DROP POLICY IF EXISTS perm_update_exkurze ON public.exkurze;
CREATE POLICY perm_update_exkurze ON public.exkurze
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('exkurze'))
  WITH CHECK (public.user_can_edit_module('exkurze'));

DROP POLICY IF EXISTS perm_delete_exkurze ON public.exkurze;
CREATE POLICY perm_delete_exkurze ON public.exkurze
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('exkurze'));
