-- Srovnání odpočtu závozu s objednávkou hlídá už uzavřený měsíc.
--
-- Migrace 20261224000000 přidala trigger, který srovná zavoz_deductions
-- s objednávkou při KAŽDÉ její změně — ať přijde odkudkoli (appka, skript,
-- pg_cron, ruka v SQL editoru), protože trigger v databázi obejít nejde.
-- Přesně tohle byl případ Manea 6. 9. 2026: oprava objednávky do už
-- spočítaného srpna se srovnala potichu a schodek se pak hledal jako záhada.
--
-- Appka mezitím (14. 9. 2026) dostala klientská varování "měsíc je už
-- napočítaný" na Stáčení KEG/Lahve, Prodejnu/Odpis a Akce (viz
-- src/lib/mesicUzamcen.ts) — ale je to jen dotaz přes UI. Databázový trigger
-- žádné UI nemá a nejde ho obejít žádnou cestou zápisu, takže potřebuje
-- vlastní pojistku přímo v SQL.
--
-- ŘEŠENÍ: srovnání se dál PROVEDE — číslo má zůstat pravdivé, zápis se
-- neblokuje, protože legitimní dodatečná oprava se stát může. Ale když cílový
-- měsíc je už napočítaný, řádek dostane do poznámky viditelnou značku, ať to
-- jde najít v „Rozpadu piva" a v dalších místech, která poznámku pohybu
-- ukazují — místo aby se čekalo na záhadné manko o měsíc později.

-- Je měsíc, do kterého spadá dané datum (nebo kterýkoli POZDĚJŠÍ měsíc), už
-- napočítaný fyzickou/schválenou inventurou? Stejná definice jako
-- src/lib/mesicUzamcen.ts (jeMesicUzamcen) na klientu — pozdější měsíc se
-- počítá taky, protože zápis do staršího měsíce by mu přepsal počáteční stav.
CREATE OR REPLACE FUNCTION public.mesic_je_napocitany(p_datum date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE (note ILIKE '%Fyzická%' OR note ILIKE '%Schválená%')
      AND date_trunc('month', entry_date) >= date_trunc('month', p_datum)
  );
$$;

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
  -- Jinak zustane sklad trvale nizsi a v inventure z toho je nevysvetlitelny
  -- prebytek. Dela to uz set_order_status, ale ta jde obejit — tohle ne.
  IF v_status = 'storno' THEN
    DELETE FROM public.zavoz_deductions WHERE order_id = p_order_id;
    RETURN;
  END IF;

  -- Polozka s nekladnym mnozstvim se ZAMERNE nechava byt: mnozstvi odpoctu
  -- musi byt kladne (CHECK zavoz_deductions_quantity_positive) a mazat
  -- skladovy pohyb potichu by bylo horsi nez ho nechat vidiet. Hlidac
  -- v auditu takovy radek ukaze (lib/zavozSync.ts).
  --
  -- Poznámka se skládá znovu při každém srovnání (regexp_replace odstraní
  -- předchozí „(srovnano s objednavkou)" i případnou ⚠️ značku), ať se
  -- opakovanou opravou stejné objednávky netáhne pořád delší a delší.
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
