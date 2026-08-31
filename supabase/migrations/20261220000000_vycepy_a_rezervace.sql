-- Vycepy a jejich rezervace do databaze.
--
-- Dosud zily VYHRADNE v localStorage prohlizece (klice `vycepy_equipment_v1`
-- a `vycepy_reservations_v1`). Znamenalo to, ze rezervace zadana na mobilu
-- nebyla videt na tabletu, vycisteni dat prohlizece ji smazalo a na novem
-- zarizeni se zacinalo s prazdnem. Neslo o okrajovou vec: Orders.tsx do
-- toho seznamu saha pri objednavce a rezervuje vycep automaticky — kdyz ho
-- na danem zarizeni nikdo nezalozil, rezervace se proste nestala.
--
-- Nesoulad, ktery to prozradil: sanitace vycepu tabulku uz mela
-- (tap_sanitation_logs), samotne vycepy ne. Nebyl to zamer, byl to nedodelek.
--
-- localStorage zustava jako offline kopie, ne jako jediny originál.

-- ── Vycepni zarizeni ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vycepy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nazev, pod kterym vycep znaji v provozu ("Vycep 1", "Mobilni bar").
  nazev text NOT NULL,
  -- Pocet naraz cepovanych piv; rozhoduje, kolik se da soucasne rezervovat.
  kohoutu integer NOT NULL DEFAULT 1,
  poznamka text,
  -- Vyrazeny vycep se uz nenabizi, ale historie rezervaci na nej zustava.
  aktivni boolean NOT NULL DEFAULT true,
  poradi integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dva vycepy stejneho jmena by v rozbalovacim seznamu nesly rozlisit.
CREATE UNIQUE INDEX IF NOT EXISTS vycepy_nazev_unique_idx
  ON public.vycepy (lower(nazev));

-- ── Rezervace vycepu ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vycepy_rezervace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Smazani vycepu bere s sebou i jeho rezervace: rezervace osirotnela bez
  -- zarizeni nema co rezervovat a v kalendari by strasila.
  vycep_id uuid NOT NULL REFERENCES public.vycepy(id) ON DELETE CASCADE,
  -- Den, na ktery je vycep zamluveny.
  datum date NOT NULL,
  -- Kdo si ho zamluvil. Odberatel je volitelny — rezervace muze byt i na
  -- akci nebo na servis, ktere zadneho odberatele nemaji. ON DELETE SET NULL:
  -- smazany odberatel nesmi vzit s sebou zaznam, ze vycep byl ten den pryc.
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  place_name text,
  -- Vazba na objednavku, ze ktere rezervace vznikla automaticky (Orders.tsx).
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  poznamka text,
  vytvoril text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jeden vycep na jeden den = jedna rezervace. Bez tohoto omezeni by dve
-- klepnuti na telefonu (nebo dva lide naraz) zamluvili tyz vycep dvakrat a
-- v kalendari by se to tvarilo jako dva ruzne odbery.
CREATE UNIQUE INDEX IF NOT EXISTS vycepy_rezervace_unique_idx
  ON public.vycepy_rezervace (vycep_id, datum);

CREATE INDEX IF NOT EXISTS vycepy_rezervace_datum_idx
  ON public.vycepy_rezervace (datum);

-- ── Prava ──────────────────────────────────────────────────────────────────
-- Stejny vzorec jako u ostatnich provoznich tabulek: cist smi kazdy
-- prihlaseny, menit jen kdo ma pravo k modulu "vycepy".
ALTER TABLE public.vycepy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vycepy_rezervace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vycepy_select ON public.vycepy;
CREATE POLICY vycepy_select ON public.vycepy
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_vycepy ON public.vycepy;
CREATE POLICY perm_insert_vycepy ON public.vycepy
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('vycepy'));

DROP POLICY IF EXISTS perm_update_vycepy ON public.vycepy;
CREATE POLICY perm_update_vycepy ON public.vycepy
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('vycepy'))
  WITH CHECK (public.user_can_edit_module('vycepy'));

DROP POLICY IF EXISTS perm_delete_vycepy ON public.vycepy;
CREATE POLICY perm_delete_vycepy ON public.vycepy
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('vycepy'));

DROP POLICY IF EXISTS vycepy_rezervace_select ON public.vycepy_rezervace;
CREATE POLICY vycepy_rezervace_select ON public.vycepy_rezervace
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_vycepy_rezervace ON public.vycepy_rezervace;
CREATE POLICY perm_insert_vycepy_rezervace ON public.vycepy_rezervace
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('vycepy'));

DROP POLICY IF EXISTS perm_update_vycepy_rezervace ON public.vycepy_rezervace;
CREATE POLICY perm_update_vycepy_rezervace ON public.vycepy_rezervace
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('vycepy'))
  WITH CHECK (public.user_can_edit_module('vycepy'));

DROP POLICY IF EXISTS perm_delete_vycepy_rezervace ON public.vycepy_rezervace;
CREATE POLICY perm_delete_vycepy_rezervace ON public.vycepy_rezervace
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('vycepy'));
