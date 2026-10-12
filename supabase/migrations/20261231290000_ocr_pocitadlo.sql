-- 🔎 Počítadlo přepisů fotek přes Google Vision (OCR).
--
-- Google Vision je zdarma do 1 000 fotek za měsíc, pak se platí (asi
-- 1,50 USD za dalších 1 000). Majitel 12. 10. 2026: „to omezení obrázků
-- nedávej… ať se to nezastaví, dej u případně 900 obrázků varování do
-- aplikace". Přepis se proto nikdy nezastaví — jen se počítá a od 900
-- za měsíc svítí na úvodní obrazovce varování.
--
-- Nic se tu nemění ani nemaže v existujících tabulkách.

CREATE TABLE IF NOT EXISTS public.ocr_pouziti (
  -- První den měsíce (UTC), za který se počítá.
  mesic date PRIMARY KEY,
  pocet integer NOT NULL DEFAULT 0,
  naposledy timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ocr_pouziti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_ocr_pouziti" ON public.ocr_pouziti;
CREATE POLICY "auth_read_ocr_pouziti" ON public.ocr_pouziti
  FOR SELECT TO authenticated USING (true);

-- Zápis jen přes funkci níže (edge funkce se service role).
CREATE OR REPLACE FUNCTION public.zapocti_ocr_fotky()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pocet integer;
BEGIN
  INSERT INTO public.ocr_pouziti AS o (mesic, pocet, naposledy)
  VALUES (date_trunc('month', now() AT TIME ZONE 'UTC')::date, 1, now())
  ON CONFLICT (mesic) DO UPDATE
    SET pocet = o.pocet + 1, naposledy = now()
  RETURNING pocet INTO v_pocet;
  RETURN v_pocet;
END
$$;
REVOKE ALL ON FUNCTION public.zapocti_ocr_fotky() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zapocti_ocr_fotky() TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ocr_pouziti;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ocr_pouziti už v publikaci: %', SQLERRM;
END $$;

COMMENT ON TABLE public.ocr_pouziti IS 'Kolik fotek za měsíc přepsal Google Vision (zdarma do 1 000) — varování v aplikaci od 900.';
