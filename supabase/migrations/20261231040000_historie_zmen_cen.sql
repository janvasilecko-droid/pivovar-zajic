-- 💰 Historie změn cen.
--
-- Návrh z 13. 9. 2026 (páté kolo), bod 20. Ceník (obrazovka Ceník) přepisuje
-- cenu na místě: cena za litr sudového piva je sloupec beers.price_per_liter
-- a cena lahve se v price_list aktualizuje UPDATEm. Po změně tak nikde
-- nezůstalo, kolik to stálo předtím a kdy se zdražilo — přesně to, na co se
-- odběratel ptá.
--
-- Zápis dělají triggery, ne obrazovka: cenu jde změnit i jinudy (import,
-- ruční zásah v Supabase) a historie, která zná jen jednu cestu, by lhala.

CREATE TABLE IF NOT EXISTS public.cenik_zmeny (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  druh text NOT NULL CHECK (druh IN ('litr', 'kus')),
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  stara_cena numeric,
  nova_cena numeric,
  zmenil uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS cenik_zmeny_created_idx ON public.cenik_zmeny (created_at DESC);

ALTER TABLE public.cenik_zmeny ENABLE ROW LEVEL SECURITY;

-- Číst smí každý přihlášený (ceník vidí všichni). Zapisují jen triggery níž
-- (SECURITY DEFINER) — ruční INSERT/UPDATE/DELETE z aplikace nejde, aby se
-- historie nedala přepsat.
DROP POLICY IF EXISTS cenik_zmeny_select ON public.cenik_zmeny;
CREATE POLICY cenik_zmeny_select ON public.cenik_zmeny
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.zapis_zmenu_ceny_piva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price_per_liter IS DISTINCT FROM OLD.price_per_liter THEN
    INSERT INTO public.cenik_zmeny (druh, beer_id, stara_cena, nova_cena)
    VALUES ('litr', NEW.id, OLD.price_per_liter, NEW.price_per_liter);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS beers_zmena_ceny ON public.beers;
CREATE TRIGGER beers_zmena_ceny
  AFTER UPDATE OF price_per_liter ON public.beers
  FOR EACH ROW EXECUTE FUNCTION public.zapis_zmenu_ceny_piva();

CREATE OR REPLACE FUNCTION public.zapis_zmenu_ceny_lahve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cenik_zmeny (druh, beer_id, package_id, stara_cena, nova_cena)
    VALUES ('kus', NEW.beer_id, NEW.package_id, NULL, NEW.price_per_unit);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit THEN
      INSERT INTO public.cenik_zmeny (druh, beer_id, package_id, stara_cena, nova_cena)
      VALUES ('kus', NEW.beer_id, NEW.package_id, OLD.price_per_unit, NEW.price_per_unit);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.cenik_zmeny (druh, beer_id, package_id, stara_cena, nova_cena)
    VALUES ('kus', OLD.beer_id, OLD.package_id, OLD.price_per_unit, NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS price_list_zmena_ceny ON public.price_list;
CREATE TRIGGER price_list_zmena_ceny
  AFTER INSERT OR UPDATE OF price_per_unit OR DELETE ON public.price_list
  FOR EACH ROW EXECUTE FUNCTION public.zapis_zmenu_ceny_lahve();

REVOKE ALL ON FUNCTION public.zapis_zmenu_ceny_piva() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zapis_zmenu_ceny_lahve() FROM PUBLIC, anon, authenticated;

-- Realtime, ať se nový záznam v historii ukáže bez obnovení stránky.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cenik_zmeny;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
