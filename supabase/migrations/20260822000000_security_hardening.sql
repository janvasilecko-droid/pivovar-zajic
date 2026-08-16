-- Security hardening: role escalation + reliable zavoz deduction uniqueness.

-- Authenticated users may update their own profile, but never their own role.
-- Service-role/admin operations run without auth.uid() and remain allowed.
CREATE OR REPLACE FUNCTION public.prevent_own_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Uživatel nemůže měnit vlastní roli.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_own_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_own_role_escalation
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_own_role_escalation();

-- PostgreSQL unique indexes normally treat NULL values as distinct. This index
-- prevents duplicate deductions even when beer_id or package_id is NULL.
DROP INDEX IF EXISTS public.zavoz_deductions_unique_idx;
CREATE UNIQUE INDEX zavoz_deductions_unique_idx
  ON public.zavoz_deductions
  (deduct_date, order_id, beer_id, package_id) NULLS NOT DISTINCT;
