-- 📅 Napočítaná inventura patří k POSLEDNÍMU dni měsíce, ne k prvnímu.
--
-- Fyzická i schválená inventura se ukládala k prvnímu dni měsíce, který
-- popisuje. Skladová kniha ji ale bere jako reset stavu a přičítá k ní
-- všechny pohyby OD toho data dál — takže k napočítanému stavu přičetla ještě
-- celý inventovaný měsíc. Srpen 2026, 12° Světlá 50 l: napočítány 4 sudy,
-- Sklad z nich udělal 4 + 95 − 77 − 25 = −3, kdežto Inventura počítala od
-- zapsaného počátku 11 a vyšla na 4. Dvě strany téhož měsíce si odporovaly a
-- 29 z 56 kombinací pivo × obal svítilo v mínusu.
--
-- Posunutím na konec měsíce sedí obojí: Sklad má napočítaný stav jako závěr
-- měsíce a očekávaný stav (expectedForMonth) se pořád počítá od zapsaného
-- „Počátečního stavu" k prvnímu dni — inventurní řádky do rozpadu měsíce
-- nevstupují, takže se nemá s čím porovnávat sám se sebou.
--
-- Počátečního stavu se to NETÝKÁ — ten popisuje ráno prvního dne a zůstává,
-- kde je.

-- 1) Přesun existujících napočítaných inventur na konec jejich měsíce.
--    Jen ty na prvním dni (tak se ukládaly) a jen tam, kde na konci měsíce
--    ještě žádná napočítaná inventura neleží — dvě by si přebily čísla.
UPDATE public.inventory AS i
SET entry_date = (date_trunc('month', i.entry_date) + interval '1 month' - interval '1 day')::date
WHERE EXTRACT(day FROM i.entry_date) = 1
  AND (i.note ILIKE '%Fyzick%' OR i.note ILIKE '%Schválen%' OR i.note ILIKE '%Schvalen%')
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory AS j
    WHERE j.entry_date = (date_trunc('month', i.entry_date) + interval '1 month' - interval '1 day')::date
      AND (j.note ILIKE '%Fyzick%' OR j.note ILIKE '%Schválen%' OR j.note ILIKE '%Schvalen%')
  );

-- 2) Dorovnání se ukládá spolu s fyzickou inventurou a stejným datem —
--    ať zůstane u ní.
UPDATE public.inventory_adjustments AS a
SET entry_date = (date_trunc('month', a.entry_date) + interval '1 month' - interval '1 day')::date
WHERE EXTRACT(day FROM a.entry_date) = 1
  AND EXISTS (
    SELECT 1 FROM public.inventory AS i
    WHERE i.entry_date = (date_trunc('month', a.entry_date) + interval '1 month' - interval '1 day')::date
      AND (i.note ILIKE '%Fyzick%' OR i.note ILIKE '%Schválen%' OR i.note ILIKE '%Schvalen%')
  );

-- 3) Ukládání smaže starou inventuru za CELÝ MĚSÍC, ne jen za jeden den.
--    Bez toho by po změně data zůstal starý řádek z prvního dne ležet vedle
--    nového z posledního a obrazovka by míchala dvě různá počítání.
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

-- 4) Totéž pro dorovnání — maže se za celý měsíc.
CREATE OR REPLACE FUNCTION public.save_physical_inventory(p_entry_date date, p_rows jsonb, p_adjustments jsonb)
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

  DELETE FROM public.inventory_adjustments
  WHERE date_trunc('month', entry_date) = date_trunc('month', p_entry_date);

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
$function$;
