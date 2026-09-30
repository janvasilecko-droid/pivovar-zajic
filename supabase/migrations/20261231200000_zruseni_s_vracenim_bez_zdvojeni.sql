-- ↩️ Zrušení odepsané objednávky s vrácením DNEŠNÍM dnem — bez zdvojení.
--
-- Z provozu 30. 9. 2026: „mám vrácené dvojnásobné množství sudů 10ky, je
-- možné, že se to Maneo a Mutěnice vrátilo na sklad 2×?" — ANO.
--
-- CO SE STALO: appka (lib/zruseniObjednavky.ts, od 29. 9. 2026) u už odepsané
-- objednávky zapsala vrácení kusů dnešním dnem (inventory_adjustments) a pak
-- objednávce nastavila storno. Jenže změna stavu spustí
-- trg_srovnat_odpocty_z_objednavky → srovnat_odpocty_objednavky(), která
-- u storna SMAŽE odpočet závozu (migrace 20261224000000). Smazaný odpočet
-- = kusy zpátky na skladě podruhé (k původnímu dni závozu) a navíc se tím
-- změnil uzavřený týden, čemuž mělo vrácení dnešním dnem právě zabránit.
--
-- OPRAVA:
--   1) srovnat_odpocty_objednavky() odpočet stornované objednávky NEMAŽE,
--      když už má vrácení „Zrušená objednávka, vráceno na sklad…" — kusy se
--      vrátily tím záznamem, odpočet v uzavřeném týdnu zůstává.
--   2) zrusit_odepsanou_objednavku() — vrácení i storno v JEDNÉ transakci
--      a jen jednou (druhé klepnutí / druhý telefon už nic nevrátí).
--   3) Jednorázová náprava: objednávkám zrušeným s vrácením, kterým spouštěč
--      odpočet smazal, se odpočet obnoví z jejich položek (k původnímu dni
--      závozu). Vrácení dnešním dnem zůstává — výsledek je přesně to, co se
--      29. 9. chtělo: minulý týden beze změny, kusy zpátky ke dni zrušení.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Srovnání odpočtů — storno s vrácením odpočet nechává.
-- Tělo je jinak stejné jako v 20261231090000_zavoz_srovnani_hlida_uzavreny_mesic.
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
  v_znacka constant text := '⚠️ ZMĚNĚNO PO UZAVŘENÍ MĚSÍCE — zkontroluj inventuru';
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;

  SELECT o.status,
         public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date)
    INTO v_status, v_datum
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Storno: zrusene zbozi nikdo neodvezl, sklad ho nesmi mit odepsane.
  -- VYJIMKA: zruseno s vracenim dnesnim dnem — kusy uz vratil zaznam
  -- vraceni, odpocet v uzavrenem tydnu zustava. Smazat ho = vratit podruhe.
  IF v_status = 'storno' THEN
    IF EXISTS (
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

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Vrácení + storno v jedné transakci, jen jednou.
-- ─────────────────────────────────────────────────────────────────────────
-- p_zaznamy = pole záznamů vrácení tak, jak je skládá appka
-- (lib/zruseniObjednavky.ts zruseniSVracenim): entry_date, beer_id,
-- beer_name, package_id, package_label, quantity, reason.
-- Vrací false, když už objednávka stornovaná je (nic se nezapíše).
CREATE OR REPLACE FUNCTION public.zrusit_odepsanou_objednavku(p_order_id uuid, p_zaznamy jsonb, p_poznamka text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_pocet  integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Zámek řádku: dvě souběžná zrušení téže objednávky se seřadí a druhé
  -- už uvidí storno.
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objednávka nenalezena';
  END IF;
  IF v_status = 'storno' THEN
    RETURN false;
  END IF;

  -- Vrácení NAPŘED — srovnání odpočtů, které spustí změna stavu, ho pak
  -- najde a odpočet nechá být.
  INSERT INTO public.inventory_adjustments
    (entry_date, beer_id, beer_name, package_id, package_label, quantity, order_id, reason, created_by)
  SELECT (z->>'entry_date')::date,
         NULLIF(z->>'beer_id', '')::uuid,
         z->>'beer_name',
         NULLIF(z->>'package_id', '')::uuid,
         z->>'package_label',
         (z->>'quantity')::numeric,
         p_order_id,
         z->>'reason',
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_zaznamy, '[]'::jsonb)) AS z;
  GET DIAGNOSTICS v_pocet = ROW_COUNT;

  -- Všechno už bylo vráceno dřív (formulář Vrácení piva) → nic dalšího
  -- nevracet, ale nechat značku, podle které srovnání odpočet nesmaže
  -- (jinak by se ty kusy vrátily podruhé). Nula kusů sklad nemění.
  IF v_pocet = 0 THEN
    INSERT INTO public.inventory_adjustments (entry_date, quantity, order_id, reason, created_by)
    VALUES ((now() AT TIME ZONE 'Europe/Prague')::date, 0, p_order_id,
            'Zrušená objednávka, vráceno na sklad — nic dalšího, vše už bylo vráceno dřív', auth.uid());
  END IF;

  UPDATE public.orders SET status = 'storno', note = p_poznamka WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.zrusit_odepsanou_objednavku(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zrusit_odepsanou_objednavku(uuid, jsonb, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Náprava už zdvojených (Maneo, Mutěnice 29.–30. 9. 2026 a případně další).
-- ─────────────────────────────────────────────────────────────────────────
-- Stornované objednávky s vrácením „Zrušená objednávka, vráceno na sklad…",
-- které odpočet nemají (smazal ho spouštěč): odpočet se obnoví z položek,
-- jen pro pivo × obal, které se vracelo. Idempotentní — objednávka, která
-- odpočet už má, se přeskočí, a unikátní order_item_id nepustí dvojí zápis.
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
  AND public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_id = o.id)
  AND EXISTS (
    SELECT 1 FROM public.inventory_adjustments ia
    WHERE ia.order_id = o.id
      AND ia.reason LIKE 'Zrušená objednávka, vráceno na sklad%'
      AND ia.beer_id IS NOT DISTINCT FROM oi.beer_id
      AND ia.package_id IS NOT DISTINCT FROM oi.package_id
  )
ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;
