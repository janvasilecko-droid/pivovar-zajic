-- Objednávka se odečte ze skladu HNED při zápisu, když její den závozu už
-- nastal — i když se zadává zpětně.
--
-- CO SE DĚLO (5. 10. 2026): „v inventuře a ve skladu furt nejsou odečteny
-- objednávky z víkendu … pokud zadám objednávky zpětně, tak se musí odečíst
-- hned k tomu datu, jako kdyby byly zadány ten den."
--
-- Odpočty (zavoz_deductions) dosud zakládaly jen dvě cesty:
--   • pg_cron 'zavoz-deductions-prague' jednou za hodinu (minuta :05),
--   • záložní kontrola v prohlížeči — ta ale proběhne jen JEDNOU ZA DEN na
--     zařízení (localStorage 'zavoz_deduction_last_successful_day_v2').
-- Objednávka zapsaná zpětně (den závozu už byl) tak čekala na další běh —
-- až hodinu, a když cron neběží, až do zítřka. Do té doby ji Sklad ani
-- Inventura neviděly.
--
-- Navíc process_zavoz_deductions_for_date a run_today_zavoz_deductions
-- počítaly den závozu vlastním vzorcem BEZ posunu o týden, kdežto zbytek
-- databáze (doplnit_datum_zavozu, srovnat_odpocty_objednavky) bere
-- ucinny_den_zavozu. U objednávky bez data a dne se tak odpočet založil
-- k jinému dni a další úprava objednávky ho pak přestěhovala.
--
-- ŘEŠENÍ:
--   1. odecist_objednavku_hned(order_id): když den závozu objednávky už nastal
--      (≤ dnešek v Praze), založí chybějící odpočty s deduct_date = DEN
--      ZÁVOZU, ne dnešek. Idempotentní (ON CONFLICT DO NOTHING).
--   2. Spouští se triggerem po vložení položky a po změně data/dne/stavu
--      objednávky — tedy z appky, z WhatsAppu i ze SQL, bez čekání na cron.
--   3. Cron i ruční dávka počítají den závozu jednotně přes ucinny_den_zavozu.
--   4. Jednorázově se dorovná vše, co k dnešku chybí.

-- 1) Odpočet jedné objednávky hned ----------------------------------------
CREATE OR REPLACE FUNCTION public.odecist_objednavku_hned(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_den    date;
  v_dnes   date := (clock_timestamp() AT TIME ZONE 'Europe/Prague')::date;
  v_pocet  integer := 0;
BEGIN
  IF p_order_id IS NULL THEN RETURN 0; END IF;

  SELECT o.status, public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date)
    INTO v_status, v_den
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND OR v_status = 'storno' OR v_den IS NULL OR v_den > v_dnes THEN
    RETURN 0;
  END IF;

  -- Stejný zámek jako dávka pro daný den, ať se s cronem nepřetahují.
  PERFORM pg_advisory_xact_lock(hashtext('zavoz_deductions:' || v_den::text));

  INSERT INTO public.zavoz_deductions (
    deduct_date, order_id, order_item_id, beer_id, package_id, quantity, note
  )
  SELECT
    v_den, oi.order_id, oi.id, oi.beer_id, oi.package_id, oi.quantity,
    'Automaticky odpocet zavozu'
      || CASE WHEN public.mesic_je_napocitany(v_den)
              THEN ' ⚠️ ZMĚNĚNO PO UZAVŘENÍ MĚSÍCE — zkontroluj inventuru' ELSE '' END
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.quantity > 0
    AND oi.beer_id IS NOT NULL
    AND oi.package_id IS NOT NULL
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_pocet = ROW_COUNT;
  RETURN v_pocet;
END
$$;

REVOKE ALL ON FUNCTION public.odecist_objednavku_hned(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.odecist_objednavku_hned(uuid) TO service_role;

-- 2) Triggery ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_odecist_hned_z_polozky()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.odecist_objednavku_hned(NEW.order_id);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_odecist_hned_z_polozky ON public.order_items;
CREATE TRIGGER trg_odecist_hned_z_polozky
  AFTER INSERT OR UPDATE OF quantity, beer_id, package_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_odecist_hned_z_polozky();

CREATE OR REPLACE FUNCTION public.trg_odecist_hned_z_objednavky()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.odecist_objednavku_hned(NEW.id);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_odecist_hned_z_objednavky ON public.orders;
CREATE TRIGGER trg_odecist_hned_z_objednavky
  AFTER INSERT OR UPDATE OF delivery_date, delivery_day, order_date, status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_odecist_hned_z_objednavky();

-- 3) Dávka pro den a hodinový cron — den závozu přes ucinny_den_zavozu -----
CREATE OR REPLACE FUNCTION public.process_zavoz_deductions_for_date(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Deduction date is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zavoz_deductions:' || p_date::text));

  INSERT INTO public.zavoz_deductions (
    deduct_date, order_id, order_item_id, beer_id, package_id, quantity, note
  )
  SELECT p_date, o.id, oi.id, oi.beer_id, oi.package_id, oi.quantity,
         'Automaticky odpocet zavozu'
  FROM public.orders AS o
  JOIN public.order_items AS oi ON oi.order_id = o.id
  WHERE o.status <> 'storno'
    AND oi.quantity > 0
    AND oi.beer_id IS NOT NULL
    AND oi.package_id IS NOT NULL
    AND public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) = p_date
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

REVOKE ALL ON FUNCTION public.process_zavoz_deductions_for_date(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_zavoz_deductions_for_date(date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.run_today_zavoz_deductions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_today date := (clock_timestamp() AT TIME ZONE 'Europe/Prague')::date;
  total_inserted integer := 0;
  d date;
BEGIN
  -- Bez pauzy po půlnoci: dnešní den závozu už nastal, odečíst se má hned.
  FOR d IN
    SELECT DISTINCT public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) AS eff
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.zavoz_deductions zd ON zd.order_item_id = oi.id
    WHERE o.status <> 'storno' AND oi.quantity > 0 AND zd.id IS NULL
      AND oi.beer_id IS NOT NULL AND oi.package_id IS NOT NULL
      AND public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) <= local_today
    ORDER BY 1
  LOOP
    total_inserted := total_inserted + public.process_zavoz_deductions_for_date(d);
  END LOOP;

  RETURN total_inserted;
END
$$;

REVOKE ALL ON FUNCTION public.run_today_zavoz_deductions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_today_zavoz_deductions() TO authenticated, service_role;

-- 4) Dorovnat, co k dnešku chybí (víkendové a zpětně zadané objednávky) ----
SELECT public.run_today_zavoz_deductions();
