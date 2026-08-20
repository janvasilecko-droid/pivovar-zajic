-- replace_order_with_items dosud objednavku vzdy smazalo (DELETE order_items)
-- a znovu vlozilo (INSERT) - jenze zavoz_deductions.order_item_id ma na
-- order_items.id cizi klic s ON DELETE RESTRICT. Jakmile uz mela objednavka
-- byt aspon jednu polozku fyzicky zavezenou (zavoz_deductions zaznam), DELETE
-- selhal na poruseni cizi klice a ulozeni zmeny objednavky skoncilo chybou -
-- nesla upravit uz vubec zadna objednavka s alespon jednou zavezenou polozkou.
--
-- Oprava: existujici polozky (maji id v payloadu) se aktualizuji na miste
-- (UPDATE, id zustava stejne -> cizi klic ze zavoz_deductions zustava platny),
-- smazou se jen polozky, ktere uz v payloadu nejsou A soucasne nemaji zadny
-- zavoz_deductions zaznam, a nove pridane radky (bez id) se vlozi.
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
