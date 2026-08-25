-- Bezpečnostní audit (2026-08-25): dvě reálné díry.
--
-- 1) profiles.permissions šlo měnit vlastníkem řádku (update_own_profile
--    povoluje auth.uid() = id na UPDATE bez omezení sloupců) — a
--    user_can_edit_module() (viz 20261128000000) tomuto sloupci slepě věří.
--    Kdokoliv přihlášený si tak mohl přímým REST voláním nastavit vlastní
--    permissions na plný přístup a obejít tak server-side kontrolu práv,
--    stejně jako už dřív šlo (a bylo opraveno) u role. Řešení: stejný vzor
--    jako trg_prevent_own_role_escalation, jen pro permissions.
--
-- 2) audit_log (auditní log operací) měl UPDATE/DELETE otevřené pro
--    kteréhokoli přihlášeného uživatele — kdokoliv mohl zpětně upravit nebo
--    smazat záznam o vlastní (či cizí) akci. Log má dávat smysl jen jako
--    insert-only (+ čtení); mazání/úpravy nechávají jen přes service-role
--    (Supabase dashboard/SQL), ne přes klienta appky.

CREATE OR REPLACE FUNCTION public.prevent_own_permissions_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'Uživatel nemůže měnit vlastní modulová práva.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_own_permissions_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_own_permissions_escalation
  BEFORE UPDATE OF permissions ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_own_permissions_escalation();

DROP POLICY IF EXISTS "auth_update_audit_log" ON audit_log;
DROP POLICY IF EXISTS "auth_delete_audit_log" ON audit_log;
