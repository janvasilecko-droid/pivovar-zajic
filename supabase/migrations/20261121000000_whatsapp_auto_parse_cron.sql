-- Automatické parsování WhatsApp zpráv i BEZ otevřené appky v prohlížeči.
-- Created: 2026-11-21
-- Reason: whatsapp-auto-parse se dřív spouštěl JEN z klienta (realtime
--         posluchač / dotažení při vstupu na Objednávky) — pokud nikdo neměl
--         appku otevřenou v momentě příchodu zprávy, zůstala 'pending', dokud
--         appku někdo neotevřel. Teď to navíc kontroluje pg_cron každé 3
--         minuty přímo z databáze přes pg_net.
--
-- Bezpečnost: edge funkce vyžadují přihlášeného schváleného uživatele
-- (requireApprovedUser). Cron žádného uživatele nemá, proto se ověřuje
-- sdíleným interním secretem (X-Internal-Cron-Secret), který zná jen tahle
-- databáze — viz _shared/require-user.ts.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Náhodný secret vygenerovaný přímo v databázi — nikdo ho nemusí ručně opisovat.
INSERT INTO app_secrets (key, value)
VALUES ('WHATSAPP_CRON_SECRET', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION trigger_whatsapp_auto_parse()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_has_pending boolean;
BEGIN
  -- Rychlá zkratka: pokud nic nečeká na zpracování, edge funkci vůbec nevolej.
  SELECT EXISTS (SELECT 1 FROM whatsapp_incoming WHERE status = 'pending') INTO v_has_pending;
  IF NOT v_has_pending THEN
    RETURN;
  END IF;

  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/whatsapp-auto-parse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.unschedule('whatsapp-auto-parse-poll')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-auto-parse-poll');

SELECT cron.schedule(
  'whatsapp-auto-parse-poll',
  '*/3 * * * *',
  $$SELECT trigger_whatsapp_auto_parse();$$
);
