-- Dvoukrok schvalovani e-mailu: admin prida e-mail (pending) -> schvali ho v aplikaci -> uzivatel se prihlasi odkazem na e-mail
-- 1) Sloupec status na allowed_emails ('pending' | 'approved'); existujici radky zustavaji 'approved'
ALTER TABLE public.allowed_emails
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved'));

-- 2) Trigger blokuje registraci/prihlaseni, pokud e-mail neni SCHVALENY (pending email = jeste neni pristup)
CREATE OR REPLACE FUNCTION public.check_allowed_email()
RETURNS TRIGGER AS $$
DECLARE
    is_pending boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.allowed_emails
        WHERE LOWER(email) = LOWER(NEW.email) AND status = 'pending'
    ) INTO is_pending;

    IF is_pending THEN
        RAISE EXCEPTION 'E-mail % zatím čeká na schválení administrátorem.', NEW.email;
    ELSIF NOT EXISTS (
        SELECT 1 FROM public.allowed_emails
        WHERE LOWER(email) = LOWER(NEW.email) AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Přihlášení není povoleno. E-mail % není schválen administrátorem.', NEW.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_allowed_email ON auth.users;
CREATE TRIGGER trg_check_allowed_email
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.check_allowed_email();
