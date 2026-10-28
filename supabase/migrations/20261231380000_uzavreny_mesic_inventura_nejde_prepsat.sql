-- 🔒 Inventura do uzavřeného měsíce nejde uložit — ani adminovi.
--
-- Z provozu 9. 10. 2026: v Inventuře se otevřelo (už uzavřené) září a uložila
-- se do něj čísla napočítaná 9. 10. Uložení (save_physical_inventory_v2 →
-- save_inventory_snapshot) smazalo schválenou inventuru k 30. 9. i zářijové
-- ztráty a zapsalo místo nich dnešní stav. Vracelo se to 10. 10. ze zálohy.
-- Zámek měsíce (closed_months, smi_zapisovat_pro_datum) adminy záměrně
-- pouští — a ukládal admin.
--
-- CO MIGRACE DĚLÁ: save_inventory_snapshot odmítne zápis do měsíce, který je
-- v closed_months (pro všechny role). save_physical_inventory_v2 ji volá
-- jako první krok, takže se celé uložení zruší dřív, než smaže ztráty.
-- Uzávěrka (close_inventory_month) projde: appka zapíše closed_months až
-- PO ní. Kdo potřebuje uzavřený měsíc opravit, nejdřív ho otevře.
-- Tělo funkce je beze změny z 20261226000000, přibyla jen kontrola. Nic se
-- nemaže ani nepřepisuje, pustit podruhé nic nezmění.

CREATE OR REPLACE FUNCTION public.save_inventory_snapshot(p_entry_date date, p_snapshot_type text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  -- Do UZAVŘENÉHO měsíce se inventura neuloží nikomu (ani adminovi) —
  -- měsíc se musí nejdřív otevřít. Uzávěrka (close_inventory_month) volá
  -- tuhle funkci PŘED zápisem do closed_months, takže projde.
  IF public.mesic_je_uzavren(p_entry_date) THEN
    RAISE EXCEPTION 'Měsíc % je uzavřený — inventuru do něj nejde uložit. Nejdřív ho otevři (Inventura → Otevřít měsíc).', to_char(p_entry_date, 'YYYY-MM')
      USING ERRCODE = 'P0001';
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
    -- Napočítaná inventura je za MĚSÍC, ne za den — starou smaž celou,
    -- ať už ležela na prvním dni (starý způsob) nebo na posledním.
    DELETE FROM public.inventory
    WHERE date_trunc('month', entry_date) = date_trunc('month', p_entry_date)
      AND (note ILIKE '%Fyzick%' OR note ILIKE '%Schválen%' OR note ILIKE '%Schvalen%');
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
  -- Nula ANO (je to platny vysledek pocitani), zaporne cislo ne, a radek
  -- bez piva nebo obalu taky ne — takovy by skladove vypocty stejne
  -- preskocily a zustal by v evidenci jako neviditelny.
  WHERE COALESCE((row_data->>'quantity')::numeric, -1) >= 0
    AND NULLIF(row_data->>'beer_id', '') IS NOT NULL
    AND NULLIF(row_data->>'package_id', '') IS NOT NULL;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$function$;
