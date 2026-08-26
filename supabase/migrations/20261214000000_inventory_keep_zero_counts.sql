-- Napocitana NULA je taky vysledek inventury a musi se ulozit.
--
-- save_inventory_snapshot dosud zahazovala kazdy radek s mnozstvim 0
-- (WHERE quantity > 0). "Dival jsem se a neni tam nic" se tim zmenilo na
-- "o teto polozce nic nevim" — a to jsou dve UPLNE ruzne veci:
--
--   • ulozena nula  = od tohoto data se pocita od nuly, dalsi pohyby se
--                     scitaji od ni
--   • chybejici radek = skladova kniha sahne po STARSI inventure (nebo po
--                     zadne) a odecita od ni dal vsechny zavozy
--
-- Prakticky dopad: schvalena inventura za cervenec 2026 ulozila 19 radku,
-- prestoze kombinaci pivo x obal je 56. Vsechno napocitane jako nula
-- zmizelo, srpnovy pocatecni stav to prevzal a k 26. 8. 2026 vychazelo
-- 34 z 56 polozek do minusu (12° Svetla 1l az -166 ks), protoze se od
-- neexistujiciho zakladu porad odecitaly zavozy.
--
-- Nove se ulozi kazdy radek s platnym pivem i obalem a nezapornym mnozstvim.
-- Ktere polozky se posilaji, rozhoduje aplikace: posila jen ty, u kterych
-- clovek skutecne neco vyplnil (vcetne nuly), ne vsech 56 nul.

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
  -- Nula ANO (je to platny vysledek pocitani), zaporne cislo ne, a radek
  -- bez piva nebo obalu taky ne — takovy by skladove vypocty stejne
  -- preskocily a zustal by v evidenci jako neviditelny.
  WHERE COALESCE((row_data->>'quantity')::numeric, -1) >= 0
    AND NULLIF(row_data->>'beer_id', '') IS NOT NULL
    AND NULLIF(row_data->>'package_id', '') IS NOT NULL;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;
