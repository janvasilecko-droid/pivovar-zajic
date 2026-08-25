-- mergeDuplicateItemRows (lib/orderAudit.ts) delal UPDATE (ponechany radek na
-- souctenou quantity) a pak samostatny DELETE (nadbytecne duplicitni radky)
-- jako dve nezavisle volani z klienta. Kdyz UPDATE probehl, ale DELETE selhal
-- (vypadek site, zavreny prohlizec uprostred), zustaly v order_items OBA
-- radky se stejnym pivem/obalem - jeden se spravnym souctem, druhy se starym
-- (uz zapocitanym) mnozstvim - a objednavka pak mela mnozstvi ticho zdvojene.
--
-- Oprava: jedna atomicka SECURITY INVOKER funkce (respektuje RLS/opravneni
-- volajiciho stejne jako predtim, zadna elevace prav) - update i delete v
-- ramci jedne transakce, takze bud probehne cele, nebo nic.
CREATE OR REPLACE FUNCTION public.merge_duplicate_order_items(
  p_keep_id uuid,
  p_delete_ids uuid[],
  p_target_quantity numeric
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
  IF p_keep_id IS NULL OR p_target_quantity IS NULL OR p_target_quantity <= 0 THEN
    RAISE EXCEPTION 'Valid keep_id and positive target_quantity are required';
  END IF;

  UPDATE public.order_items
  SET quantity = p_target_quantity
  WHERE id = p_keep_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item % does not exist or is not accessible', p_keep_id;
  END IF;

  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 0 THEN
    DELETE FROM public.order_items WHERE id = ANY(p_delete_ids);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_order_items(uuid, uuid[], numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_order_items(uuid, uuid[], numeric)
  TO authenticated;
