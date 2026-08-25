-- Bug: replace_order_with_items dela UPDATE order_items i pro polozky, ktere
-- uz maji zaznam v zavoz_deductions (fyzicky zavezene - viz unique index
-- zavoz_deductions_order_item_unique_idx na order_item_id v 20260816130000).
-- Kdyz nekdo po zavozu opravi pivo/obal/mnozstvi u takove polozky, order_items
-- se zmeni, ale zavoz_deductions zaznam (skutecny skladovy pohyb) zustane se
-- starymi hodnotami navzdy - skladova evidence pak neodpovida realne
-- zavezenemu/opravenemu mnozstvi.
--
-- Oprava: uzce zamerena SECURITY DEFINER funkce, ktera smi prepsat JEN
-- beer_id/package_id/quantity existujiciho zavoz_deductions radku podle
-- order_item_id (zadne jine pole, zadny insert, zadna jina polozka).
-- replace_order_with_items (SECURITY INVOKER, RLS na orders/order_items
-- zustava beze zmeny) ji zavola pro kazdou ponechanou polozku po jejim update.

CREATE OR REPLACE FUNCTION public.reconcile_zavoz_deduction_for_item(
  p_order_item_id uuid,
  p_beer_id uuid,
  p_package_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_order_item_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.zavoz_deductions
  SET beer_id = p_beer_id,
      package_id = p_package_id,
      quantity = p_quantity,
      note = trim(both ' ' from COALESCE(note, 'Automaticky odpocet zavozu') || ' (upraveno po zavozu)')
  WHERE order_item_id = p_order_item_id
    AND (beer_id IS DISTINCT FROM p_beer_id
      OR package_id IS DISTINCT FROM p_package_id
      OR quantity IS DISTINCT FROM p_quantity);
END
$$;

REVOKE ALL ON FUNCTION public.reconcile_zavoz_deduction_for_item(uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_zavoz_deduction_for_item(uuid, uuid, uuid, numeric)
  TO authenticated;

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

  -- Id existujicich polozek, ktere v novem payloadu zustavaji (maji platne id a kladne mnozstvi).
  SELECT array_agg(NULLIF(item->>'id', '')::uuid)
  INTO keep_ids
  FROM jsonb_array_elements(p_items) AS item
  WHERE NULLIF(item->>'id', '') IS NOT NULL
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  -- Smazat jen polozky, ktere uz nejsou v payloadu A zaroven nemaji zadny
  -- zavoz_deductions zaznam (uz fyzicky zavezene polozky nejde smazat, cizi
  -- klic by to stejne odmitl - takove proste v objednavce zustanou).
  DELETE FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND (keep_ids IS NULL OR oi.id <> ALL(keep_ids))
    AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_item_id = oi.id);

  -- Aktualizovat existujici polozky na miste (id se nemeni).
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

  -- Pokud uz nektera z ponechanych polozek ma zavoz_deductions zaznam (byla
  -- fyzicky zavezena), synchronizovat ho na opravene pivo/obal/mnozstvi -
  -- jinak by skladovy pohyb zustal navzdy se starymi hodnotami.
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

  -- Vlozit nove pridane radky (bez id v payloadu).
  INSERT INTO public.order_items (
    id,
    order_id,
    beer_id,
    beer_name,
    package_id,
    package_label,
    quantity,
    is_prepared
  )
  SELECT
    gen_random_uuid(),
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

REVOKE ALL ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  TO authenticated;
