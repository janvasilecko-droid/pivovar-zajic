-- Vynucení oprávnění (profiles.permissions) v databázi pro nejcitlivější moduly.
-- Created: 2026-11-28
-- Reason: src/lib/permissions.ts řídí jen to, co appka UI ukáže/zamkne
--         (canUserView/canUserEdit) — RLS politiky ale povolovaly INSERT/
--         UPDATE/DELETE kterémukoli přihlášenému uživateli bez ohledu na
--         jeho roli. Uživatel s rolí bez přístupu do Sklepa/Stáčení/Inventury
--         (např. předvolba "Obchod / Prodej") mohl přes přímé REST volání
--         (devtools) tato data i tak smazat/upravit — appka to jen schovávala
--         v UI, databáze žádnou roli neznala.
--
-- Rozsah: JEN INSERT/UPDATE/DELETE na tabulkách modulů Sklep/Stáčení/Inventura
-- (cellar_tanks, cellar_transfers, cellar_batches, kegging, keg_prefuk,
-- inventory, inventory_adjustments) — přesně ty, co finding popsal jako
-- příklad (role "Obchod/Prodej" má cellar/kegging/inventory zamčené).
-- SELECT zůstává otevřené (viditelnost dat mezi moduly appka řeší křížově,
-- např. Kegging čte i cellar_tanks) — jde jen o to zamezit ZÁPISU, ne čtení.
--
-- Bezpečně "fail-open": chybějící profil, admin role, nebo chybějící/prázdné
-- permissions.<modul>.edit vrací true (stejná výchozí hodnota jako klientský
-- getUserPermissions/DEFAULT_FULL_PERMISSIONS) — funkce NIKDY nezamkne
-- uživatele, který dosud neměl explicitně nastavené omezení.

CREATE OR REPLACE FUNCTION public.user_can_edit_module(p_module text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_perms jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;

  SELECT role, permissions INTO v_role, v_perms FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN true;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_perms IS NULL THEN
    RETURN true;
  END IF;

  RETURN COALESCE((v_perms -> p_module ->> 'edit')::boolean, true);
EXCEPTION WHEN OTHERS THEN
  -- Jakákoli neočekávaná chyba (např. permissions není platný objekt) —
  -- fail-open, ne fail-closed.
  RETURN true;
END;
$$;

-- ===== Sklep (modul "cellar") =====
DROP POLICY IF EXISTS "insert_own_cellar_tanks" ON public.cellar_tanks;
CREATE POLICY "insert_own_cellar_tanks" ON public.cellar_tanks FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "update_own_cellar_tanks" ON public.cellar_tanks;
CREATE POLICY "update_own_cellar_tanks" ON public.cellar_tanks FOR UPDATE TO authenticated USING (public.user_can_edit_module('cellar')) WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "delete_own_cellar_tanks" ON public.cellar_tanks;
CREATE POLICY "delete_own_cellar_tanks" ON public.cellar_tanks FOR DELETE TO authenticated USING (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS "insert_own_cellar_transfers" ON public.cellar_transfers;
CREATE POLICY "insert_own_cellar_transfers" ON public.cellar_transfers FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "update_own_cellar_transfers" ON public.cellar_transfers;
CREATE POLICY "update_own_cellar_transfers" ON public.cellar_transfers FOR UPDATE TO authenticated USING (public.user_can_edit_module('cellar')) WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "delete_own_cellar_transfers" ON public.cellar_transfers;
CREATE POLICY "delete_own_cellar_transfers" ON public.cellar_transfers FOR DELETE TO authenticated USING (public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS "auth_write_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_write_cellar_batches" ON cellar_batches FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "auth_update_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_update_cellar_batches" ON cellar_batches FOR UPDATE TO authenticated USING (public.user_can_edit_module('cellar')) WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "auth_delete_cellar_batches" ON cellar_batches;
CREATE POLICY "auth_delete_cellar_batches" ON cellar_batches FOR DELETE TO authenticated USING (public.user_can_edit_module('cellar'));

-- ===== Stáčení (modul "kegging") =====
DROP POLICY IF EXISTS "auth_write_kegging" ON kegging;
CREATE POLICY "auth_write_kegging" ON kegging FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS "auth_update_kegging" ON kegging;
CREATE POLICY "auth_update_kegging" ON kegging FOR UPDATE TO authenticated USING (public.user_can_edit_module('kegging')) WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS "auth_delete_kegging" ON kegging;
CREATE POLICY "auth_delete_kegging" ON kegging FOR DELETE TO authenticated USING (public.user_can_edit_module('kegging'));

DROP POLICY IF EXISTS "auth_write_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_write_keg_prefuk" ON keg_prefuk FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS "auth_update_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_update_keg_prefuk" ON keg_prefuk FOR UPDATE TO authenticated USING (public.user_can_edit_module('kegging')) WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS "auth_delete_keg_prefuk" ON keg_prefuk;
CREATE POLICY "auth_delete_keg_prefuk" ON keg_prefuk FOR DELETE TO authenticated USING (public.user_can_edit_module('kegging'));

-- ===== Inventura (modul "inventory") =====
DROP POLICY IF EXISTS "auth_write_inventory" ON inventory;
CREATE POLICY "auth_write_inventory" ON inventory FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('inventory'));
DROP POLICY IF EXISTS "auth_update_inventory" ON inventory;
CREATE POLICY "auth_update_inventory" ON inventory FOR UPDATE TO authenticated USING (public.user_can_edit_module('inventory')) WITH CHECK (public.user_can_edit_module('inventory'));
DROP POLICY IF EXISTS "auth_delete_inventory" ON inventory;
CREATE POLICY "auth_delete_inventory" ON inventory FOR DELETE TO authenticated USING (public.user_can_edit_module('inventory'));

DROP POLICY IF EXISTS "auth_write_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_write_inventory_adjustments" ON inventory_adjustments FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('inventory'));
DROP POLICY IF EXISTS "auth_update_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_update_inventory_adjustments" ON inventory_adjustments FOR UPDATE TO authenticated USING (public.user_can_edit_module('inventory')) WITH CHECK (public.user_can_edit_module('inventory'));
DROP POLICY IF EXISTS "auth_delete_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "auth_delete_inventory_adjustments" ON inventory_adjustments FOR DELETE TO authenticated USING (public.user_can_edit_module('inventory'));
