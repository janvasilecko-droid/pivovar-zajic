-- Uprava objemu tanku relativne, ne prepsanim absolutni hodnoty (nalez c.7).
--
-- adjustTankVolume() v Kegging.tsx cetla aktualni objem z React state
-- (cellarTanks) a poslala do DB uz spocitanou absolutni hodnotu. To ma dva
-- nasledky:
--
-- 1) Uprava zaznamu staceni vola adjustTankVolume DVAKRAT po sobe — nejdriv
--    vratit stary objem, pak odecist novy. Kdyz se tank nemeni (typicky
--    "opravim jen mnozstvi"), obe volani vyjdou ze STEJNE vychozi hodnoty
--    ze state (mezi awaity se neobnovi) a druhe prepise prvni. Vysledek:
--    objem = puvodni - novy, vraceni stareho se ztrati. Oprava prekplepu
--    "35 -> 36 sudu" tak ubrala z tanku 1800 L misto padesati; po par
--    opravach je tank v appce prazdny, i kdyz je fyzicky plny.
--
-- 2) Kdyz stacej dva lide ze stejneho tanku zaroven, druhy zapis prepise
--    prvni (lost update).
--
-- Relativni update primo v DB obe veci resi — hodnota se cte a meni v jedne
-- operaci, takze nezalezi na tom, co ma klient ve state.
--
-- SECURITY INVOKER: RLS na cellar_tanks plati stejne jako pri primem UPDATE.

CREATE OR REPLACE FUNCTION public.adjust_tank_volume(
  p_tank_id uuid,
  p_delta_l numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_tank_id IS NULL OR p_delta_l IS NULL OR p_delta_l = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.cellar_tanks
  SET current_volume_l = GREATEST(COALESCE(current_volume_l, 0) + p_delta_l, 0),
      updated_at = now()
  WHERE id = p_tank_id
  RETURNING current_volume_l INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tank % does not exist or is not accessible', p_tank_id;
  END IF;

  RETURN v_new;
END
$$;

REVOKE ALL ON FUNCTION public.adjust_tank_volume(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_tank_volume(uuid, numeric) TO authenticated;
