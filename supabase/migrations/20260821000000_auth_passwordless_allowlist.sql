-- Migration for passwordless approved email whitelist and profiles.password_set flag
-- 1. Create allowed_emails table
CREATE TABLE IF NOT EXISTS public.allowed_emails (
    email text PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on allowed_emails
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Admins (role = 'admin') can do anything on allowed_emails
CREATE POLICY "Admins manage allowed_emails" ON public.allowed_emails
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 2. Add password_set to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_set boolean DEFAULT false NOT NULL;

-- 3. Populate allowed_emails with existing users in auth.users and primary admin email
INSERT INTO public.allowed_emails (email)
VALUES ('vasilecko@seznam.cz')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.allowed_emails (email)
SELECT email FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Set password_set = true for all existing users (they already have passwords)
UPDATE public.profiles SET password_set = true;

-- 4. Create trigger to block sign-ups of non-allowed emails
CREATE OR REPLACE FUNCTION public.check_allowed_email()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if email is in allowed_emails (case-insensitive)
    IF NOT EXISTS (
        SELECT 1 FROM public.allowed_emails 
        WHERE LOWER(email) = LOWER(NEW.email)
    ) THEN
        RAISE EXCEPTION 'Registrace/Přihlášení není povoleno. E-mail % není schválen administrátorem.', NEW.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_allowed_email ON auth.users;
CREATE TRIGGER trg_check_allowed_email
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.check_allowed_email();
