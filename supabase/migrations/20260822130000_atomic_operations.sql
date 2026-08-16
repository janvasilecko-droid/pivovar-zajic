-- Transactional commands for parent/child orders and inventory snapshots.

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_order jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Order payload must be an object';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  INSERT INTO public.orders (
    id,
    order_date,
    place_id,
    place_name,
    source,
    status,
    delivery_day,
    delivery_date,
    is_prepared,
    is_packaged,
    is_delivered,
    delivered_at,
    note,
    whatsapp_message_id,
    created_by
  ) VALUES (
    COALESCE(NULLIF(p_order->>'id', '')::uuid, gen_random_uuid()),
    (p_order->>'order_date')::date,
    NULLIF(p_order->>'place_id', '')::uuid,
    NULLIF(btrim(p_order->>'place_name'), ''),
    COALESCE(NULLIF(p_order->>'source', ''), 'rucne'),
    COALESCE(NULLIF(p_order->>'status', ''), 'nova'),
    NULLIF(p_order->>'delivery_day', ''),
    NULLIF(p_order->>'delivery_date', '')::date,
    COALESCE((p_order->>'is_prepared')::boolean, false),
    COALESCE((p_order->>'is_packaged')::boolean, false),
    COALESCE((p_order->>'is_delivered')::boolean, false),
    NULLIF(p_order->>'delivered_at', '')::timestamptz,
    NULLIF(btrim(p_order->>'note'), ''),
    NULLIF(p_order->>'whatsapp_message_id', '')::uuid,
    auth.uid()
  )
  RETURNING id INTO new_order_id;

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
    COALESCE(NULLIF(item->>'id', '')::uuid, gen_random_uuid()),
    new_order_id,
    NULLIF(item->>'beer_id', '')::uuid,
    NULLIF(btrim(item->>'beer_name'), ''),
    NULLIF(item->>'package_id', '')::uuid,
    NULLIF(btrim(item->>'package_label'), ''),
    (item->>'quantity')::numeric,
    COALESCE((item->>'is_prepared')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item
  WHERE COALESCE((item->>'quantity')::numeric, 0) > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order must contain at least one item with positive quantity';
  END IF;

  RETURN new_order_id;
END
$$;

REVOKE ALL ON FUNCTION public.create_order_with_items(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb, jsonb)
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

  DELETE FROM public.order_items WHERE order_id = p_order_id;

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
    COALESCE(NULLIF(item->>'id', '')::uuid, gen_random_uuid()),
    p_order_id,
    NULLIF(item->>'beer_id', '')::uuid,
    NULLIF(btrim(item->>'beer_name'), ''),
    NULLIF(item->>'package_id', '')::uuid,
    NULLIF(btrim(item->>'package_label'), ''),
    (item->>'quantity')::numeric,
    COALESCE((item->>'is_prepared')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item
  WHERE COALESCE((item->>'quantity')::numeric, 0) > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order must contain at least one item with positive quantity';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_inventory_snapshot(
  p_entry_date date,
  p_snapshot_type text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  snapshot_note text;
  inserted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_entry_date IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Valid date and rows array are required';
  END IF;

  snapshot_note := CASE p_snapshot_type
    WHEN 'initial' THEN 'Počáteční stav'
    WHEN 'physical' THEN 'Fyzická inventura'
    WHEN 'approved' THEN 'Schválená inventura'
    ELSE NULL
  END;
  IF snapshot_note IS NULL THEN
    RAISE EXCEPTION 'Unknown inventory snapshot type: %', p_snapshot_type;
  END IF;

  IF p_snapshot_type = 'initial' THEN
    DELETE FROM public.inventory
    WHERE entry_date = p_entry_date AND note ILIKE '%Počáteční%';
  ELSE
    DELETE FROM public.inventory
    WHERE entry_date = p_entry_date
      AND (note ILIKE '%Fyzická%' OR note ILIKE '%Schválená%');
  END IF;

  INSERT INTO public.inventory (
    entry_date,
    beer_id,
    beer_name,
    package_id,
    package_label,
    quantity,
    note,
    created_by
  )
  SELECT
    p_entry_date,
    NULLIF(row_data->>'beer_id', '')::uuid,
    NULLIF(btrim(row_data->>'beer_name'), ''),
    NULLIF(row_data->>'package_id', '')::uuid,
    NULLIF(btrim(row_data->>'package_label'), ''),
    (row_data->>'quantity')::numeric,
    snapshot_note,
    auth.uid()
  FROM jsonb_array_elements(p_rows) AS row_data
  WHERE COALESCE((row_data->>'quantity')::numeric, 0) > 0;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

REVOKE ALL ON FUNCTION public.save_inventory_snapshot(date, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_inventory_snapshot(date, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_physical_inventory(
  p_entry_date date,
  p_rows jsonb,
  p_adjustments jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  snapshot_count integer;
  adjustment_count integer := 0;
BEGIN
  IF jsonb_typeof(p_adjustments) <> 'array' THEN
    RAISE EXCEPTION 'Adjustments must be an array';
  END IF;

  snapshot_count := public.save_inventory_snapshot(
    p_entry_date,
    'physical',
    p_rows
  );

  DELETE FROM public.inventory_adjustments WHERE entry_date = p_entry_date;
  INSERT INTO public.inventory_adjustments (
    entry_date,
    beer_id,
    beer_name,
    package_id,
    package_label,
    quantity,
    reason,
    created_by
  )
  SELECT
    p_entry_date,
    NULLIF(row_data->>'beer_id', '')::uuid,
    NULLIF(btrim(row_data->>'beer_name'), ''),
    NULLIF(row_data->>'package_id', '')::uuid,
    NULLIF(btrim(row_data->>'package_label'), ''),
    (row_data->>'quantity')::numeric,
    NULLIF(btrim(row_data->>'reason'), ''),
    auth.uid()
  FROM jsonb_array_elements(p_adjustments) AS row_data
  WHERE COALESCE((row_data->>'quantity')::numeric, 0) <> 0;

  GET DIAGNOSTICS adjustment_count = ROW_COUNT;
  RETURN snapshot_count + adjustment_count;
END
$$;

REVOKE ALL ON FUNCTION public.save_physical_inventory(date, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_physical_inventory(date, jsonb, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.close_inventory_month(
  p_current_date date,
  p_next_date date,
  p_current_rows jsonb,
  p_next_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_count integer;
  next_count integer;
BEGIN
  IF p_next_date <= p_current_date THEN
    RAISE EXCEPTION 'Next inventory date must be after current date';
  END IF;

  current_count := public.save_inventory_snapshot(
    p_current_date,
    'approved',
    p_current_rows
  );
  next_count := public.save_inventory_snapshot(
    p_next_date,
    'initial',
    p_next_rows
  );
  RETURN current_count + next_count;
END
$$;

REVOKE ALL ON FUNCTION public.close_inventory_month(date, date, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_inventory_month(date, date, jsonb, jsonb)
  TO authenticated;
