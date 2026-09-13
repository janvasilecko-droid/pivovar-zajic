-- Automatický odpočet závozu zase podle DNE ZÁVOZU — a plán stáčení se
-- od odpočtu odpojuje.
--
-- CO SE DĚLO: migrace 20261231010000 (12. 9. 2026) začala odepisovat
-- objednávku ze skladu jen tehdy, když má každá položka zaškrtnuté „Stočeno"
-- (order_items.is_bottled). V provozu se ale Stočeno neodškrtává — od 1. 8.
-- ho nemělo ani jedno z 353 položek — takže se od 12. 9. automaticky
-- neodepisovalo NIC. Tatáž migrace navíc smazala dřívější automatické
-- odpočty u položek bez Stočeno, tedy skoro všechny. Z provozu 13. 9. 2026:
-- „u 12° Světlé 50 l šlo tento týden asi 14×50, máš tam špatné údaje" —
-- Inventura ukazovala −4 místo zhruba −41. Bez odpočtu zůstalo 178 objednávek
-- (červenec 1 777 ks, srpen 3 204 ks, září 870 ks) a sklad byl nadhodnocený.
--
-- PROČ TO PRAVIDLO VZNIKLO: plán stáčení počítal hotové kusy z odpočtů
-- a spouštěč uzavrit_odectenou_objednavku objednávku po odpočtu sám zavřel
-- jako zavezenou. Když den závozu jen prošel, plán psal „vše stočeno" i bez
-- stočení.
--
-- ŘEŠENÍ (rozhodnutí uživatele 13. 9. 2026):
--   1. Odpočet ze skladu zase podle dne závozu (bez podmínky Stočeno).
--   2. Spouštěč, který objednávku po odpočtu sám zavře, se ruší — zavezeno
--      je jen to, co člověk v Závozu odklikne.
--   3. Plán stáčení bere hotové kusy ze stáčení a z ručního odškrtnutí,
--      ne z odpočtu (lib/keggingPlan.ts) — tahle část je v kódu aplikace.
--   4. Odpočty se zpětně doplní pro všechny dny od nejstarší objednávky do
--      dneška. Spouštěč se ruší DŘÍV, jinak by doplnění hromadně zavřelo
--      178 objednávek jako zavezené.

-- 2) Spouštěč pryč — před doplněním.
DROP TRIGGER IF EXISTS trg_uzavrit_odectenou_objednavku ON public.zavoz_deductions;

COMMENT ON FUNCTION public.uzavrit_odectenou_objednavku() IS
  'Nepoužívá se od 13. 9. 2026 (migrace 20261231080000) — objednávku jako zavezenou označuje jen člověk v Závozu.';

-- 1) Odpočet podle dne závozu — tělo jako v 20261231010000, bez is_bottled.
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
    deduct_date,
    order_id,
    order_item_id,
    beer_id,
    package_id,
    quantity,
    note
  )
  SELECT
    p_date,
    o.id,
    oi.id,
    oi.beer_id,
    oi.package_id,
    oi.quantity,
    'Automaticky odpocet zavozu'
  FROM public.orders AS o
  JOIN public.order_items AS oi ON oi.order_id = o.id
  WHERE o.status <> 'storno'
    AND oi.quantity > 0
    AND COALESCE(
      o.delivery_date,
      date_trunc('week', o.order_date::timestamp)::date
        + CASE split_part(COALESCE(NULLIF(o.delivery_day, ''), 'pa'), '/', 1)
            WHEN 'po' THEN 0
            WHEN 'ut' THEN 1
            WHEN 'st' THEN 2
            WHEN 'ct' THEN 3
            WHEN 'pa' THEN 4
            WHEN 'so' THEN 5
            WHEN 'ne' THEN 6
            ELSE 4
          END
    ) = p_date
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

REVOKE ALL ON FUNCTION public.process_zavoz_deductions_for_date(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_zavoz_deductions_for_date(date)
  TO service_role;

-- 4) Zpětné doplnění: každý den od nejstarší objednávky do dneška. Funkce je
-- idempotentní (ON CONFLICT DO NOTHING), takže jde pustit i opakovaně.
DO $$
DECLARE
  d date;
  od date;
  doplneno integer := 0;
BEGIN
  SELECT min(COALESCE(delivery_date, order_date)) INTO od
  FROM public.orders WHERE status <> 'storno';
  IF od IS NULL THEN RETURN; END IF;
  -- O týden dřív: den závozu se u objednávky bez data odvozuje od pondělí
  -- týdne order_date, takže může ležet i před nejstarším order_date.
  FOR d IN SELECT generate_series(od - 7, current_date, interval '1 day')::date LOOP
    doplneno := doplneno + public.process_zavoz_deductions_for_date(d);
  END LOOP;
  RAISE NOTICE 'Doplněno odpočtů: %', doplneno;
END $$;
