-- 🧹 Sklep od 1. 10. 2026 znovu — tanky prázdné, starý stav v archivu.
--
-- Zadání 2. 10. 2026: „vymaž data ze sklepa, uděláme data od října, nebo ty
-- data ulož, ale v appce ať je to prázdný — všechny tanky a historie, jako
-- kdyby se ta položka udělala znova, a já nastavím tanky teď."
--
-- NIC SE NEMAŽE:
--   • Tanky (nádoby Spilka 1–3, Tank 1–8) zůstávají — odkazuje na ně stáčení
--     (kegging/bottling.cellar_tank_id). Jen se vyprázdní jejich OBSAH.
--   • Jejich dosavadní stav (pivo, objem, začátek cyklu…) se nejdřív celý
--     zkopíruje do public.cellar_tanks_archiv_2026_10.
--   • Historie (přečerpání, uzavřené cykly, várky, měření) zůstává v
--     tabulkách beze změny; appka ji ve Sklepu ukazuje až od 1. 10. 2026
--     (src/lib/sklepOd.ts).
--   • Stáčení ani sklad (skladová kniha) se nemění.
--
-- Pojistka proti druhému spuštění: když archiv už něco má, tanky se znovu
-- nevyprázdní — mezitím je už někdo nastavil.

CREATE TABLE IF NOT EXISTS public.cellar_tanks_archiv_2026_10 AS
  SELECT now() AS archivovano_at, t.* FROM public.cellar_tanks t WITH NO DATA;

ALTER TABLE public.cellar_tanks_archiv_2026_10 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_cellar_tanks_archiv" ON public.cellar_tanks_archiv_2026_10;
CREATE POLICY "auth_read_cellar_tanks_archiv" ON public.cellar_tanks_archiv_2026_10
  FOR SELECT TO authenticated USING (true);

DO $$
DECLARE
  v_archivovano integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cellar_tanks_archiv_2026_10) THEN
    RAISE NOTICE 'Archiv sklepa už existuje — tanky se znovu nevyprazdňují.';
    RETURN;
  END IF;

  INSERT INTO public.cellar_tanks_archiv_2026_10
    SELECT now(), t.* FROM public.cellar_tanks t;
  GET DIAGNOSTICS v_archivovano = ROW_COUNT;

  UPDATE public.cellar_tanks SET
    current_beer_id    = NULL,
    current_beer_name  = NULL,
    current_volume_l   = 0,
    initial_volume_l   = NULL,
    started_at         = NULL,
    status             = 'empty',
    kegging_active     = false,
    kegging_date       = NULL,
    kegging_started_at = NULL,
    kegging_ended_at   = NULL,
    updated_at         = now();

  RAISE NOTICE 'Sklep: % tanků archivováno a vyprázdněno.', v_archivovano;
END $$;
