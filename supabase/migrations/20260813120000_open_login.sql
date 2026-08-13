-- Otevřené přihlášení: kdokoli se svým e-mailem a výchozím heslem „zajic“.
-- Účet se vytváří automaticky v edge funkci auth-auto-login (createUser).
-- Ruší se trigger, který povoloval vytvoření účtu pouze pro schválené e-maily.
DROP TRIGGER IF EXISTS trg_check_allowed_email ON auth.users;
DROP FUNCTION IF EXISTS public.check_allowed_email();
