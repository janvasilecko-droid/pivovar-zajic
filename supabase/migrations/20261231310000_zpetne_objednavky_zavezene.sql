-- Objednávka zapsaná zpětně se rovnou označí jako zavezená.
--
-- CO SE DĚLO (13. 10. 2026): Restaurace, objednávka na neděli 11. 10. zapsaná
-- v úterý. Sklad se odečetl správně (odpočty s datem 11. 10. vznikly hned při
-- zápisu), jenže objednávka zůstala „nezavezená" — příznak is_delivered se
-- nastavoval až v noci (oznac_minule_zavozy, 1:05). Do té doby ji
-- nakládka, malé sudy i přehledy brály jako čekající, i když byla odečtená.
--
-- ŘEŠENÍ: odecist_objednavku_hned() po odečtení zkontroluje, jestli den
-- závozu už minul (< dnes v Praze), a když ano, označí objednávku jako
-- zavezenou (stejné pravidlo jako noční oznac_minule_zavozy). Dnešní a budoucí
-- závozy se nemění. Odpočty ani datum se nemění, takže se nespouští žádné
-- srovnání odpočtů.

CREATE OR REPLACE FUNCTION public.odecist_objednavku_hned(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_den    date;
  v_dnes   date := (clock_timestamp() AT TIME ZONE 'Europe/Prague')::date;
  v_pocet  integer := 0;
BEGIN
  IF p_order_id IS NULL THEN RETURN 0; END IF;

  SELECT o.status, public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date)
    INTO v_status, v_den
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND OR v_status = 'storno' OR v_den IS NULL OR v_den > v_dnes THEN
    RETURN 0;
  END IF;

  -- Stejný zámek jako dávka pro daný den, ať se s cronem nepřetahují.
  PERFORM pg_advisory_xact_lock(hashtext('zavoz_deductions:' || v_den::text));

  INSERT INTO public.zavoz_deductions (
    deduct_date, order_id, order_item_id, beer_id, package_id, quantity, note
  )
  SELECT
    v_den, oi.order_id, oi.id, oi.beer_id, oi.package_id, oi.quantity,
    'Automaticky odpocet zavozu'
      || CASE WHEN public.mesic_je_napocitany(v_den)
              THEN ' ⚠️ ZMĚNĚNO PO UZAVŘENÍ MĚSÍCE — zkontroluj inventuru' ELSE '' END
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.quantity > 0
    AND oi.beer_id IS NOT NULL
    AND oi.package_id IS NOT NULL
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_pocet = ROW_COUNT;

  -- Den závozu už minul → objednávka je zavezená (is_delivered není ve výčtu
  -- sloupců triggeru na orders, takže se nic dalšího nespustí).
  IF v_den < v_dnes THEN
    UPDATE public.orders
    SET is_delivered = true,
        delivered_at = COALESCE(delivered_at, (v_den::timestamp AT TIME ZONE 'Europe/Prague'))
    WHERE id = p_order_id
      AND is_delivered = false
      AND status <> 'storno';
  END IF;

  RETURN v_pocet;
END
$$;

REVOKE ALL ON FUNCTION public.odecist_objednavku_hned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.odecist_objednavku_hned(uuid) TO service_role;

-- Jednorázově dorovnat, co už takhle visí (stejná funkce jako v noci).
SELECT public.oznac_minule_zavozy();
