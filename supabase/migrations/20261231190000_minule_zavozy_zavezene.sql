-- ✅ Objednávky se závozem v minulosti = zavezené.
--
-- Z provozu 29. 9. 2026: „ty nezavezené smaž, vše ber jako zavezeno — pokud
-- není zavezeno, je buď smazáno, nebo v záložce Vrácení."
--
-- Staré objednávky, které nikdo neodškrtl, visely jako nezavezené: držely
-- malé sudy („chybí přes 100 sudů"), nakládku i přehled sudů u odběratelů.
-- Každou noc se proto objednávky se závozem PŘED dneškem (kromě storna)
-- označí jako zavezené. Mění se jen příznak is_delivered (a chybějící
-- delivered_at = den závozu) — stav, datum ani odpočty ze skladu ne, takže
-- se nespouští žádné srovnání odpočtů.
CREATE OR REPLACE FUNCTION public.oznac_minule_zavozy()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pocet integer;
BEGIN
  UPDATE public.orders
  SET is_delivered = true,
      delivered_at = COALESCE(delivered_at, (delivery_date::timestamp AT TIME ZONE 'Europe/Prague'))
  WHERE is_delivered = false
    AND status <> 'storno'
    AND delivery_date IS NOT NULL
    AND delivery_date < (now() AT TIME ZONE 'Europe/Prague')::date;
  GET DIAGNOSTICS v_pocet = ROW_COUNT;
  RETURN v_pocet;
END;
$$;

REVOKE ALL ON FUNCTION public.oznac_minule_zavozy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oznac_minule_zavozy() TO authenticated;

-- Hned jednou a pak každou noc v 1:05 UTC (po půlnoci v Praze v létě i v zimě).
SELECT public.oznac_minule_zavozy();
SELECT cron.schedule('oznac-minule-zavozy', '5 1 * * *', 'SELECT public.oznac_minule_zavozy();');
