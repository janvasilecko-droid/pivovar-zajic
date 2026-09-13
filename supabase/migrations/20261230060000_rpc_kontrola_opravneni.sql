-- Bug: tri SECURITY DEFINER RPC funkce menily data bez kontroly
-- user_can_edit_module, i kdyz kazda prima uprava tychz tabulek pres RLS
-- tuhle kontrolu ma (viz 20261128000000_enforce_module_edit_permissions.sql
-- a 20261204000000_enforce_module_permissions_remaining.sql). Funkce navic
-- volaji primo z klienta (src/lib/tankFrontaBeh.ts, src/lib/zavozSync.ts,
-- src/screens/Orders.tsx, src/components/OrderAuditModal.tsx), ne jen
-- interne z jine funkce - takze prihlaseny uzivatel BEZ prava na modul
-- Sklep/Objednavky mohl timhle bocnim vchodem menit objem tanku nebo
-- prepisovat odpocty ze zavozu, i kdyz mu appka i RLS na primych tabulkach
-- tohle jinak zamykaji.
--
-- Oprava: stejna kontrola jako u odpovidajicich RLS politik, jen presunuta
-- dovnitr funkci. Zbytek logiky (idempotence, uzky rozsah zmeny) beze zmeny.

CREATE OR REPLACE FUNCTION public.adjust_tank_volume_once(
  p_tank_id uuid,
  p_delta_l numeric,
  p_klic text,
  p_zdroj text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.user_can_edit_module('cellar') THEN
    RAISE EXCEPTION 'Nemas opravneni upravovat Sklep';
  END IF;
  IF p_klic IS NULL OR length(p_klic) < 8 THEN
    RAISE EXCEPTION 'Chybi klic idempotence';
  END IF;
  IF p_tank_id IS NULL OR p_delta_l IS NULL OR p_delta_l = 0 THEN
    RETURN 'nic';
  END IF;

  BEGIN
    INSERT INTO public.tank_uprava_log (klic, tank_id, delta_l, zdroj)
    VALUES (p_klic, p_tank_id, p_delta_l, p_zdroj);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'jiz_provedeno';
  END;

  PERFORM public.adjust_tank_volume(p_tank_id, p_delta_l);
  RETURN 'provedeno';
END;
$$;

CREATE OR REPLACE FUNCTION public.smaz_odpocty_polozky(p_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz')) THEN
    RAISE EXCEPTION 'Nemas opravneni upravovat objednavky';
  END IF;
  IF p_order_item_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.zavoz_deductions WHERE order_item_id = p_order_item_id;
END
$$;

CREATE OR REPLACE FUNCTION public.reconcile_zavoz_deduction_for_item(
  p_order_item_id uuid,
  p_beer_id uuid,
  p_package_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz')) THEN
    RAISE EXCEPTION 'Nemas opravneni upravovat objednavky';
  END IF;
  IF p_order_item_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.zavoz_deductions
  SET beer_id = p_beer_id,
      package_id = p_package_id,
      quantity = p_quantity,
      note = trim(both ' ' from COALESCE(note, 'Automaticky odpocet zavozu') || ' (upraveno po zavozu)')
  WHERE order_item_id = p_order_item_id
    AND (beer_id IS DISTINCT FROM p_beer_id
      OR package_id IS DISTINCT FROM p_package_id
      OR quantity IS DISTINCT FROM p_quantity);
END
$$;

REVOKE ALL ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.smaz_odpocty_polozky(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smaz_odpocty_polozky(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reconcile_zavoz_deduction_for_item(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_zavoz_deduction_for_item(uuid, uuid, uuid, numeric) TO authenticated;
