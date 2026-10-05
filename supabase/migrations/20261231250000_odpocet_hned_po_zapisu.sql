-- Objednávka zadaná zpětně se ze skladu odečte HNED, ne až příští hodinu.
--
-- CO SE DĚLO: odpočet závozu dělá jen run_today_zavoz_deductions() — pg_cron
-- každou hodinu v :05 (a jednou denně záloha z prohlížeče). Objednávka
-- zadaná se závozem v minulosti tak až hodinu ve skladu nebyla odečtená.
-- Z provozu 5. 10. 2026: víkendové objednávky (Restaurace 2× 50 l 12° Světlá,
-- Mates Rybárna 1× 50 l 11° Světlá…) zapsané v pondělí v 8:41 se závozem
-- 3. 10. — „počítám inventuru a logicky mi to nesedí, když se neodečetly
-- objednávky z víkendu… odpočet musí být co nejdřív".
--
-- ŘEŠENÍ: srovnat_odpocty_objednavky() (volá ji trigger při každé změně
-- objednávky i položky) teď chybějící odpočty i DOPLNÍ, když den závozu
-- už nastal — stejně jako hodinový běh, jen hned. A nově ji volá i vložení
-- položky (dosud jen úprava), protože nová objednávka vzniká vložením.
--
-- Den závozu v budoucnosti se nemění: odečte se v ten den hodinovým během.
-- Selhání doplnění NIKDY nezablokuje uložení objednávky — jen se zaloguje
-- a odpočet dožene hodinový běh (appka chybějící odpočet ukáže).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Srovnání odpočtů — tělo jako v 20261231210000 + doplnění chybějících.
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

  -- NOVÉ: den závozu už nastal (dnes nebo zpětně) → chybějící odpočty hned.
  -- Stejné řádky, jaké by zapsal hodinový běh (process_zavoz_deductions_for_date),
  -- jen bez čekání. Položka bez piva nebo obalu (rozpracovaná objednávka)
  -- se přeskočí — sklad ji stejně nezná.
  IF v_datum IS NOT NULL AND v_datum <= (now() AT TIME ZONE 'Europe/Prague')::date THEN
    BEGIN
      INSERT INTO public.zavoz_deductions (
        deduct_date, order_id, order_item_id, beer_id, package_id, quantity, note
      )
      SELECT v_datum, p_order_id, oi.id, oi.beer_id, oi.package_id, oi.quantity,
             'Automaticky odpocet zavozu (hned po zapisu)'
               || CASE WHEN public.mesic_je_napocitany(v_datum) THEN ' ' || v_znacka ELSE '' END
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.quantity > 0
        AND oi.beer_id IS NOT NULL
        AND oi.package_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_item_id = oi.id)
      ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Uložení objednávky je důležitější; odpočet dožene hodinový běh.
      RAISE WARNING 'srovnat_odpocty_objednavky(%): okamžitý odpočet selhal: %', p_order_id, SQLERRM;
    END;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.srovnat_odpocty_objednavky(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Vložení položky srovná odpočty taky (dosud jen úprava položky).
-- ─────────────────────────────────────────────────────────────────────────
-- Funkce triggeru je ta z 20261224000000 (volá srovnat_odpocty_objednavky
-- pro NEW.order_id), jen se navěšuje i na INSERT.
DROP TRIGGER IF EXISTS trg_odecist_hned_novou_polozku ON public.order_items;
CREATE TRIGGER trg_odecist_hned_novou_polozku
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_srovnat_odpocty_z_polozky();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Hned dohnat, co teď čeká (víkendové objednávky zapsané zpětně).
-- ─────────────────────────────────────────────────────────────────────────
SELECT public.run_today_zavoz_deductions();
