-- Allow storing of from_me messages by updating check_whatsapp_sender_allowed trigger function.
-- Created: 2026-08-11
-- Reason: The user wants to write orders from their own phone (from_me = true) to the group.

CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- Vlastní zprávy (from_me = true) projdou vždy — píše je sám majitel.
  IF NEW.from_me THEN
    RETURN NEW;
  END IF;

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
    RETURN NULL; -- řádek se nevytvoří (jen pro cizí zprávy)
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle názvu nebo chat_id). Vlastní zprávy (from_me=true) whitelist obcházejí a vždy se uloží.';
