-- Smazani polozky z objednavky, ktera uz byla zavezena.
--
-- CO SE DELO: replace_order_with_items mazala jen polozky BEZ zaznamu
-- v zavoz_deductions. U zavezene objednavky se tedy dalo v „Upravit
-- objednavku" kliknout na Odstranit, ulozit — a NESTALO SE NIC. Zadna
-- hlaska, dialog se zavrel, radek zustal. Nejhorsi druh chyby: clovek si
-- mysli, ze opravil, a ono ne.
--
-- Naslo se to na zdvojene objednavce Manea (26. 8. 2026), kam se 6. 9.
-- omylem dopsaly 2x 10° Desitka 20 l uz jednou zapsane. Duplicita pak
-- odecetla dva sudy navic ze srpna, ktery uz byl napocitany, a v inventure
-- „chybely dva stocene".
--
-- OPRAVA: odecet zavozu je jen OTISK radku objednavky. Kdyz radek zmizi,
-- musi zmizet i otisk — jinak by ze skladu odesly kusy, ktere si nikdo
-- neobjednal. Maze se proto oboji, a v tomhle poradi (cizi klic jinak
-- mazani odmitne).
--
-- Neni to obchazeni evidence: zmena se propise do skladove knihy jako
-- kazda jina a hloubkovy audit ji uvidi jako zpetny zasah do napocitaneho
-- mesice (viz lib/zpetneZmeny.ts), takze o ni bude vedet i ten, kdo
-- inventuru delal.

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

  -- Id existujicich polozek, ktere v novem payloadu zustavaji.
  SELECT array_agg(NULLIF(item->>'id', '')::uuid)
  INTO keep_ids
  FROM jsonb_array_elements(p_items) AS item
  WHERE NULLIF(item->>'id', '') IS NOT NULL
    AND COALESCE((item->>'quantity')::numeric, 0) > 0;

  -- NEJDRIV otisky odstranovanych polozek (cizi klic by mazani jinak odmitl),
  -- a jen ty, ktere patri prave teto objednavce.
  DELETE FROM public.zavoz_deductions zd
  USING public.order_items oi
  WHERE zd.order_item_id = oi.id
    AND oi.order_id = p_order_id
    AND (keep_ids IS NULL OR oi.id <> ALL(keep_ids));

  -- Az potom samotne polozky.
  DELETE FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND (keep_ids IS NULL OR oi.id <> ALL(keep_ids));

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

  -- Ponechane polozky, ktere uz maji otisk, srovnat na opravene hodnoty.
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

  -- Pojistka z puvodni verze: objednavka nesmi zustat prazdna.
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order must contain at least one item with positive quantity';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_with_items(uuid, jsonb, jsonb)
  TO authenticated;
