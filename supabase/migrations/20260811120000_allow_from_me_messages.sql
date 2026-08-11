-- WhatsApp: vlastní zprávy (from_me) se ukládají a zpracovávají.
-- Vytvořeno: 2026-08-11
-- Důvod: whatsapp-bridge přeposílá i vlastní zprávy ze spárovaného telefonu
--        (od 2026-08-11), aby je šlo testovat a vyhodnocovat. from_me zůstává
--        uložený jako flag — aplikace vlastní zprávy rozliší od zákaznických.
--        Ruší se tím dřívější "prevence smyčky", která vlastní zprávy zahazovala.

-- 1) Trigger funkce: vlastní zprávy už NEZahazuje — platí pro ně jen whitelist
--    (název NEBO chat_id). from_me řádek se uloží, aby aplikace měla flag.
CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      (NEW.chat_id IS NOT NULL AND trim(NEW.chat_id) <> ''
       AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
       AND lower(trim(s.chat_id)) = lower(trim(NEW.chat_id)))
      OR
      (NEW.sender_name IS NOT NULL AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name))
    )
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle názvu nebo chat_id). Vlastní zprávy (from_me=true) se ukládají a rozliší se flagem from_me.';
