-- Skladovy odpocet zavozu drzi krok s objednavkou — v DATABAZI, ne v obrazovkach.
--
-- Objednavka je pravda. Radek v zavoz_deductions je jen jeji otisk k okamziku
-- zavozu. Kdyz se objednavka po zavozu opravi, otisk se sam neaktualizoval a
-- sklad se dal odepisoval podle zadani, ktere v objednavce davno nestalo.
-- Rozdil vyplaval az v inventure jako manko (nebo prebytek) bez puvodu ve
-- vyrobe, o mesice pozdeji a bez stopy odkud.
--
-- Nalezeno na ostrych datech 1. 9. 2026 (507 odpoctu):
--   • 3 odpocty s jinym mnozstvim nez objednavka (Radek +6, Duck and Dog -4,
--     Jona -20)
--   • 1 stornovana objednavka s zivym odpoctem (7 stupnu Karlin, 3x 50l)
--   • 44 odpoctu datovanych presne o 7 dni driv, nez je datum doruceni —
--     objednavka se prehodila o tyden az potom, co nocni odpocet probehl
--
-- PROC TRIGGER A NE VOLANI Z OBRAZOVEK:
-- Oprava uz jednou existovala (reconcile_zavoz_deduction_for_item, migrace
-- 20261201000000) a volala ji replace_order_with_items. Presto se to rozeslo
-- znovu — rychle upravy v detailu objednavky a hromadna zmena stavu sly
-- primym UPDATE a tu cestu minuly. Kazda dalsi zapisova cesta by musela na
-- volani pamatovat. Trigger v databazi obejit nejde: at uz zapis prijde
-- odkudkoli (appka, skript, pg_cron, ruka v SQL editoru), odpocet se srovna.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Srovnani otisku podle objednavky.
-- ─────────────────────────────────────────────────────────────────────────
-- Vzorec je jednoduchy: skladovy dopad objednavky = jeji polozky, k jejimu
-- dni zavozu. Stornovana objednavka nema skladovy dopad zadny.
--
-- ucinny_den_zavozu() uz v databazi je (migrace 20261215000000) a pocita
-- stejne jako computeDeliveryDateISO() v appce — delivery_date, jinak den
-- v tydnu objednavky. Zamerne se pouziva ta ista funkce, aby se datum
-- odpoctu nemohlo rozejit s tim, co ukazuje obrazovka.
CREATE OR REPLACE FUNCTION public.srovnat_odpocty_objednavky(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_datum  date;
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
  UPDATE public.zavoz_deductions zd
  SET beer_id     = oi.beer_id,
      package_id  = oi.package_id,
      quantity    = oi.quantity,
      deduct_date = COALESCE(v_datum, zd.deduct_date),
      note = trim(both ' ' from COALESCE(zd.note, 'Automaticky odpocet zavozu')
                  || ' (srovnano s objednavkou)')
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

-- Volat se ma jen pres triggery (ty bezi jako vlastnik bez ohledu na granty).
-- Zamerne BEZ kontroly auth.uid(): stejnou cestou jde i nocni pg_cron, ktery
-- zadneho prihlaseneho uzivatele nema.
REVOKE ALL ON FUNCTION public.srovnat_odpocty_objednavky(uuid) FROM PUBLIC, anon, authenticated;

-- Rucni cesta pro tlacitko v auditu. Tenka slupka, ktera navic vyzaduje
-- prihlaseni — proto je oddelena od te, kterou vola trigger a pg_cron.
CREATE OR REPLACE FUNCTION public.srovnat_odpocty_objednavky_rucne(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  PERFORM public.srovnat_odpocty_objednavky(p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.srovnat_odpocty_objednavky_rucne(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.srovnat_odpocty_objednavky_rucne(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Triggery — kazda zmena objednavky nebo polozky srovna otisk hned.
-- ─────────────────────────────────────────────────────────────────────────
-- Rekurze nehrozi: srovnat_odpocty_objednavky() je idempotentni. Podminka
-- IS DISTINCT FROM znamena, ze druhe volani uz nic nezapise, takze se retez
-- triggeru sam zastavi. Jediny DELETE je pri stornu a nasledny
-- trg_uzavrit_odectenou_objednavku ma svuj UPDATE omezeny na
-- status = 'vyrizeno_zavoz', coz stornovana objednavka neni.
CREATE OR REPLACE FUNCTION public.trg_srovnat_odpocty_z_objednavky()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.srovnat_odpocty_objednavky(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_srovnat_odpocty_z_objednavky ON public.orders;
-- BEZI AZ PO trg_doplnit_datum_zavozu (ten je BEFORE a dopocita delivery_date),
-- takze uz vidi vysledne datum.
CREATE TRIGGER trg_srovnat_odpocty_z_objednavky
  AFTER UPDATE OF delivery_date, delivery_day, order_date, status ON public.orders
  FOR EACH ROW
  WHEN (OLD.delivery_date IS DISTINCT FROM NEW.delivery_date
     OR OLD.delivery_day  IS DISTINCT FROM NEW.delivery_day
     OR OLD.order_date    IS DISTINCT FROM NEW.order_date
     OR OLD.status        IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_srovnat_odpocty_z_objednavky();

CREATE OR REPLACE FUNCTION public.trg_srovnat_odpocty_z_polozky()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.srovnat_odpocty_objednavky(NEW.order_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_srovnat_odpocty_z_polozky ON public.order_items;
CREATE TRIGGER trg_srovnat_odpocty_z_polozky
  AFTER UPDATE OF quantity, beer_id, package_id ON public.order_items
  FOR EACH ROW
  WHEN (OLD.quantity   IS DISTINCT FROM NEW.quantity
     OR OLD.beer_id    IS DISTINCT FROM NEW.beer_id
     OR OLD.package_id IS DISTINCT FROM NEW.package_id)
  EXECUTE FUNCTION public.trg_srovnat_odpocty_z_polozky();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Jednorazove srovnani vseho, co se rozeslo driv.
-- ─────────────────────────────────────────────────────────────────────────
-- Trigger hlida jen zmeny od ted. Radky rozjete driv by jinak zustaly
-- a dal by skreslovaly inventuru.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT zd.order_id FROM public.zavoz_deductions zd
  LOOP
    PERFORM public.srovnat_odpocty_objednavky(r.order_id);
  END LOOP;
END;
$$;
