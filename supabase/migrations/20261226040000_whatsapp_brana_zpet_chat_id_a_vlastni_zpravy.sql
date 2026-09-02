-- 📩 Brána příchozích WhatsApp zpráv přišla o dvě pravidla — vracím je.
--
-- Migrace 20261216000000 (odmítnuté zprávy) přepsala trigger
-- check_whatsapp_sender_allowed a vyšla přitom z jeho STARÉ verze
-- (20260818000000). Tiše tím zahodila dvě věci, které do něj mezitím přidaly
-- migrace 20260818120000 a 20261011120000:
--
--   1. VLASTNÍ ZPRÁVY (from_me = true) whitelist obcházejí. Píše je sám
--      majitel ze spárovaného telefonu — do skupiny i soukromě — a celý most
--      i webhook s tím počítají (whatsapp-webhook/index.ts řádek 322, komentář
--      v whatsapp-bridge/index.js řádek 313). Bez bypassu se objednávka
--      napsaná z vlastního telefonu zahodí.
--
--   2. Shoda podle CHAT_ID, ne jen podle jména. Skupina „Objednávky pivovar"
--      má v whatsapp_senders zapsané obojí; když se přejmenuje, jméno přestane
--      sedět a bez chat_id spadnou pod stůl všechny objednávky ze skupiny.
--
-- Zápis do whatsapp_rejected zůstává — o to ta prosincová migrace šla a je
-- správný. Nově se do něj ukládá i chat_id (sloupec existoval, ale nic ho
-- neplnilo), ať jde odmítnutou zprávu přiřadit ke skupině i po přejmenování.
CREATE OR REPLACE FUNCTION public.check_whatsapp_sender_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- 1) Vlastní zpráva projde vždy — píše ji majitel ze spárovaného telefonu.
  IF NEW.from_me THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;  -- prázdný seznam = povoleno vše (zpětná kompatibilita)
  END IF;

  -- 2) Povoleno podle CHAT_ID (stabilní) NEBO podle názvu (bez diakritiky).
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      NEW.chat_id IS NOT NULL AND btrim(NEW.chat_id) <> ''
      AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
      AND lower(btrim(s.chat_id)) = lower(btrim(NEW.chat_id))
    ) OR (
      NEW.sender_name IS NOT NULL
      AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name)
    )
  ) INTO v_is_allowed;

  IF v_is_allowed THEN
    RETURN NEW;
  END IF;

  -- Zpráva se do objednávek nedostane, ale už nezmizí beze stopy.
  BEGIN
    INSERT INTO public.whatsapp_rejected (sender_name, sender_number, chat_id, message_preview, message_timestamp)
    VALUES (
      NEW.sender_name,
      NEW.sender_number,
      NEW.chat_id,
      left(COALESCE(NEW.message_text, ''), 500),
      NEW.message_timestamp
    );
  EXCEPTION WHEN OTHERS THEN
    -- Zápis do přehledu je pomocný. Kdyby selhal, nesmí to shodit příjem
    -- zpráv — původní chování (zahodit) je pořád lepší než chyba webhooku.
    RAISE NOTICE 'whatsapp_rejected zapis selhal: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON public.whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle chat_id NEBO názvu) a zapíše ji do whatsapp_rejected. Vlastní zprávy (from_me=true) whitelist obcházejí.';
