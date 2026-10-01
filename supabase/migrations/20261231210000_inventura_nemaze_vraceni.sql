-- 📋 Uložení fyzické inventury už nemaže vrácení z objednávek.
--
-- Z provozu 1. 10. 2026: „co to píše v inventuře ‚očekáváno po ztrátách'…
-- žádné ztráty nejsou, nic takového tam nedávej."
--
-- CO SE DĚLO: tabulka inventory_adjustments nese tři různé věci:
--   • ZTRÁTY z měsíční inventury (bez objednávky, bez důvodu),
--   • vrácení piva z objednávky / zrušení s vrácením (order_id, důvod
--     „Vráceno z objednávky…" / „Zrušená objednávka, vráceno na sklad…"),
--   • dorovnání z týdenní inventury (důvod „Dorovnání z inventury…").
-- Obrazovka Inventura brala všechny jako „ztráty" (proto „očekáváno po
-- ztrátách" — vrácení se tam ukázalo podruhé) a save_physical_inventory
-- při uložení SMAZALA celý měsíc a zapsala ho zpátky jako ztráty: vrácení
-- ztratilo vazbu na objednávku i důvod.
--
-- OPRAVA:
--   1) save_physical_inventory_v2 — maže a přepisuje JEN ztráty (bez
--      objednávky a bez důvodu). Appka od verze s touto migrací volá jen ji;
--      bez migrace inventuru radši neuloží. Stará funkce zůstává beze změny
--      kvůli telefonům se starou verzí appky, než se aktualizují.
--   2) Zrušení s vrácením se pozná i podle poznámky objednávky („Zrušeno.
--      Vráceno…") — kdyby už uložení inventury záznam vrácení přepsalo,
--      odpočet závozu se stejně nesmaže a smazaný se obnoví.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Uložení inventury — jen ztráty.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_physical_inventory_v2(p_entry_date date, p_rows jsonb, p_adjustments jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- Jen ztráty z měsíční inventury. Vrácení z objednávek (order_id),
  -- zrušení s vrácením a dorovnání týdenní inventury (mají důvod) zůstávají.
  DELETE FROM public.inventory_adjustments
  WHERE date_trunc('month', entry_date) = date_trunc('month', p_entry_date)
    AND order_id IS NULL
    AND NULLIF(btrim(COALESCE(reason, '')), '') IS NULL;

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
    NULL,
    auth.uid()
  FROM jsonb_array_elements(p_adjustments) AS row_data
  WHERE COALESCE((row_data->>'quantity')::numeric, 0) <> 0;

  GET DIAGNOSTICS adjustment_count = ROW_COUNT;
  RETURN snapshot_count + adjustment_count;
END
$function$;

REVOKE ALL ON FUNCTION public.save_physical_inventory_v2(date, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_physical_inventory_v2(date, jsonb, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Srovnání odpočtů — zrušení s vrácením i podle poznámky objednávky.
-- Tělo jako v 20261231200000, jen širší podmínka u storna.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.srovnat_odpocty_objednavky(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_datum  date;
  v_note   text;
  v_znacka constant text := '⚠️ ZMĚNĚNO PO UZAVŘENÍ MĚSÍCE — zkontroluj inventuru';
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;

  SELECT o.status,
         public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date),
         o.note
    INTO v_status, v_datum, v_note
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_status = 'storno' THEN
    IF COALESCE(v_note, '') LIKE '%Zrušeno. Vráceno %'
       OR EXISTS (
         SELECT 1 FROM public.inventory_adjustments ia
         WHERE ia.order_id = p_order_id
           AND ia.reason LIKE 'Zrušená objednávka, vráceno na sklad%'
       ) THEN
      RETURN;
    END IF;
    DELETE FROM public.zavoz_deductions WHERE order_id = p_order_id;
    RETURN;
  END IF;

  UPDATE public.zavoz_deductions zd
  SET beer_id     = oi.beer_id,
      package_id  = oi.package_id,
      quantity    = oi.quantity,
      deduct_date = COALESCE(v_datum, zd.deduct_date),
      note = trim(both ' ' from
        regexp_replace(
          regexp_replace(COALESCE(zd.note, 'Automaticky odpocet zavozu'), '\s*\(srovnano s objednavkou\)', '', 'g'),
          '\s*' || v_znacka || '$', ''
        )
        || ' (srovnano s objednavkou)'
        || CASE WHEN public.mesic_je_napocitany(COALESCE(v_datum, zd.deduct_date))
                THEN ' ' || v_znacka ELSE '' END)
  FROM public.order_items oi
  WHERE oi.id = zd.order_item_id
    AND zd.order_id = p_order_id
    AND oi.quantity > 0
    AND (zd.beer_id     IS DISTINCT FROM oi.beer_id
      OR zd.package_id  IS DISTINCT FROM oi.package_id
      OR zd.quantity    IS DISTINCT FROM oi.quantity
      OR zd.deduct_date IS DISTINCT FROM COALESCE(v_datum, zd.deduct_date));
END;
$$;

REVOKE ALL ON FUNCTION public.srovnat_odpocty_objednavky(uuid) FROM PUBLIC, anon, authenticated;

-- Náprava jako v 20261231200000, ale i pro objednávky, kterým uložení
-- inventury už přepsalo záznam vrácení (pozná se podle poznámky).
INSERT INTO public.zavoz_deductions (deduct_date, order_id, order_item_id, beer_id, package_id, quantity, note)
SELECT public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date),
       o.id,
       oi.id,
       oi.beer_id,
       oi.package_id,
       oi.quantity,
       'Automaticky odpocet zavozu (obnoveno — zruseno s vracenim dnesnim dnem)'
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.status = 'storno'
  AND oi.quantity > 0
  AND COALESCE(o.note, '') LIKE '%Zrušeno. Vráceno %'
  AND public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_id = o.id)
ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;
