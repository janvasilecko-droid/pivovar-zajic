-- Denik prijmu WhatsApp zprav — aby slo dohledat KAZDOU zpravu od brany dal.
--
-- Problem, ktery to resi: kdyz je na WhatsAppu 12 zprav a v aplikaci 11,
-- dosud neslo zjistit, kde se dvanacta ztratila. Cesta zpravy ma pritom
-- ctyri mista, kde muze skoncit:
--
--   WhatsApp → most (bridge) → webhook → whatsapp_incoming → objednavka
--
-- Zprava se muze ztratit:
--   1. mezi WhatsAppem a mostem  — most neběžel (jedina cast, kterou tenhle
--      denik nevidi; resi ji dopočtení historie po pripojeni mostu),
--   2. na webhooku              — whitelist ji nepustil, prisla podruhe,
--      nebo zapis do databaze selhal,
--   3. v aplikaci               — zprava se ulozila, ale nikdo ji nezpracoval.
--
-- Denik zaznamena KAZDE doruceni na webhook vcetne toho, ktere skoncilo
-- zahozenim. Tim se z otazky „kam se podela dvanacta zprava" stane dotaz:
-- kolik doslo na webhook, kolik se ulozilo a u zbytku duvod.
--
-- Ulozeny je jen ZACATEK textu (200 znaku) — na rozpoznani zpravy to staci
-- a neni to druha kopie veskere komunikace.

CREATE TABLE IF NOT EXISTS public.whatsapp_prijem_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifikator zpravy z WhatsAppu (u mostu `wa-<key.id>`). Podle nej se
  -- pozna, ze tataz zprava dorazila vickrat.
  webhook_id text,
  sender_name text,
  chat_id text,
  message_preview text,
  message_timestamp timestamptz,
  -- 'ulozeno' | 'duplicita' | 'zahozeno_filtr' | 'chyba'
  vysledek text NOT NULL,
  duvod text,
  -- Odkaz na ulozenou zpravu, kdyz vznikla.
  incoming_id uuid REFERENCES public.whatsapp_incoming(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_prijem_log_created_idx ON public.whatsapp_prijem_log (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_prijem_log_vysledek_idx ON public.whatsapp_prijem_log (vysledek, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_prijem_log_webhook_idx ON public.whatsapp_prijem_log (webhook_id);

ALTER TABLE public.whatsapp_prijem_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_whatsapp_prijem_log" ON public.whatsapp_prijem_log;
CREATE POLICY "auth_read_whatsapp_prijem_log" ON public.whatsapp_prijem_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_whatsapp_prijem_log" ON public.whatsapp_prijem_log;
CREATE POLICY "service_write_whatsapp_prijem_log" ON public.whatsapp_prijem_log
  FOR INSERT TO service_role WITH CHECK (true);

-- Denni souhrn pro kontrolu v aplikaci: kolik doslo, kolik se ulozilo a proc
-- se zbytek neulozil. Pocita se v databazi, at appka netahá tisice radku.
CREATE OR REPLACE VIEW public.whatsapp_prijem_denne AS
SELECT
  (created_at AT TIME ZONE 'Europe/Prague')::date AS den,
  count(*)                                             AS doslo,
  count(*) FILTER (WHERE vysledek = 'ulozeno')         AS ulozeno,
  count(*) FILTER (WHERE vysledek = 'duplicita')       AS duplicita,
  count(*) FILTER (WHERE vysledek = 'zahozeno_filtr')  AS zahozeno_filtr,
  count(*) FILTER (WHERE vysledek = 'chyba')           AS chyba
FROM public.whatsapp_prijem_log
GROUP BY 1
ORDER BY 1 DESC;

-- Pohled dedi opravneni z tabulky (security_invoker), takze cist ho smi
-- prihlaseny uzivatel podle politiky vyse — ne kdokoli.
ALTER VIEW public.whatsapp_prijem_denne SET (security_invoker = true);

GRANT SELECT ON public.whatsapp_prijem_denne TO authenticated;
