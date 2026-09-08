-- Pokracovani opravy z 20261229020000: mazani otisku zavozu musi projit RLS.
--
-- CO CHYBELO: replace_order_with_items bezi jako SECURITY INVOKER (schvalne —
-- prava na objednavky zustavaji na uzivateli). Tabulka zavoz_deductions ma
-- ale JEDINOU politiku, a to SELECT. Prikaz DELETE uvnitr funkce proto
-- neselhal, jen tise smazal NULA radku — a nasledne mazani polozky spadlo
-- na cizi klic. Navenek to vypadalo jako „appka to nechce smazat".
--
-- Reseni je stejny vzor jako u reconcile_zavoz_deduction_for_item: uzce
-- zamerena SECURITY DEFINER funkce, ktera umi JEDINOU vec — smazat otisky
-- jedne konkretni polozky objednavky. Zadne jine mazani, zadny insert.
-- Volat ji smi jen prihlaseny uzivatel.

CREATE OR REPLACE FUNCTION public.smaz_odpocty_polozky(p_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_order_item_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.zavoz_deductions WHERE order_item_id = p_order_item_id;
END
$$;

REVOKE ALL ON FUNCTION public.smaz_odpocty_polozky(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smaz_odpocty_polozky(uuid) TO authenticated;

-- A ve funkci pro ulozeni objednavky nahradit primy DELETE volanim vyse.
CREATE OR REPLACE FUNCTION public.replace_order_with_items(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  keep_ids uuid[];
  rec record;
  smazat record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_order_id IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Valid order id and payload are required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  UPDATE public.orders
  SET order_date = (p_order->>'order_date')::date,
      place_id = NULLIF(p_order->>'place_id', '')::uuid,
      place_name = NULLIF(btrim(p_order->>'place_name'), ''),
      delivery_day = NULLIF(p_order->>'delivery_day', ''),
      delivery_date = NULLIF(p_order->>'delivery_date', '')::date,
      note = NULLIF(btrim(p_order->>'note'), '')
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist or is not accessible', p_order_id;
  END IF;

  SELECT array_agg(NULLIF(item->>'id', '')::uuid)
  INTO keep_ids
  FROM jsonb_array_elements(p_items) AS item
  WHERE NULLIF(item->>'id', '') IS NOT NULL
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  -- Nejdriv otisky odstranovanych polozek (pres SECURITY DEFINER funkci,
  -- viz vyse), teprve potom samotne polozky — cizi klic jinak mazani odmitne.
  FOR smazat IN
    SELECT oi.id
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (keep_ids IS NULL OR oi.id <> ALL(keep_ids))
  LOOP
    PERFORM public.smaz_odpocty_polozky(smazat.id);
  END LOOP;

  DELETE FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND (keep_ids IS NULL OR oi.id <> ALL(keep_ids));

  UPDATE public.order_items oi
  SET beer_id = NULLIF(item->>'beer_id', '')::uuid,
      beer_name = NULLIF(btrim(item->>'beer_name'), ''),
      package_id = NULLIF(item->>'package_id', '')::uuid,
      package_label = NULLIF(btrim(item->>'package_label'), ''),
      quantity = (item->>'quantity')::numeric
  FROM jsonb_array_elements(p_items) AS item
  WHERE oi.order_id = p_order_id
    AND oi.id = NULLIF(item->>'id', '')::uuid
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  FOR rec IN
    SELECT NULLIF(item->>'id', '')::uuid AS item_id,
           NULLIF(item->>'beer_id', '')::uuid AS beer_id,
           NULLIF(item->>'package_id', '')::uuid AS package_id,
           (item->>'quantity')::numeric AS quantity
    FROM jsonb_array_elements(p_items) AS item
    WHERE NULLIF(item->>'id', '') IS NOT NULL
      AND COALESCE((item->>'quantity')::numeric, 0) > 0
  LOOP
    PERFORM public.reconcile_zavoz_deduction_for_item(rec.item_id, rec.beer_id, rec.package_id, rec.quantity);
  END LOOP;

  INSERT INTO public.order_items (
    id, order_id, beer_id, beer_name, package_id, package_label, quantity, is_prepared
  )
  SELECT gen_random_uuid(),
         p_order_id,
         NULLIF(item->>'beer_id', '')::uuid,
         NULLIF(btrim(item->>'beer_name'), ''),
         NULLIF(item->>'package_id', '')::uuid,
         NULLIF(btrim(item->>'package_label'), ''),
         (item->>'quantity')::numeric,
         COALESCE((item->>'is_prepared')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item
  WHERE NULLIF(item->>'id', '') IS NULL
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order must contain at least one item with positive quantity';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb) TO authenticated;
