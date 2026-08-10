-- Migration to add a simple key-value session storage table for WhatsApp gateway (Baileys)
CREATE TABLE IF NOT EXISTS public.whatsapp_session (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_session ENABLE ROW LEVEL SECURITY;

-- Service role can manage all, authenticated users cannot access (sensitive credentials)
CREATE POLICY "Service role manages whatsapp_session" ON public.whatsapp_session
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_whatsapp_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_whatsapp_session_updated_at
    BEFORE UPDATE ON public.whatsapp_session
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_whatsapp_session_updated_at();
