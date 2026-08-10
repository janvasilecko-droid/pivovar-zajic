-- Automatické mazání WhatsApp zpráv od nepovolených odesílatelů
-- Vytvořeno: 2026-08-09
-- Důvod: do aplikace se mají dostat JEN zprávy ze skupiny „Objednávky pivovar“.
--        Webhook je už neukládá (odpovídá skipped:true), ale tahle pojistka zajistí,
--        že se do whatsapp_incoming nedostane ani zpráva uložená jinou cestou
--        (SQL konzole, seed, Make bez filtru) a že se smažou i staré zprávy
--        uložené před nastavením whitelistu.

-- 1) BEFORE INSERT pojistka: zpráva od nepovoleného odesílatele se neuloží vůbec.
--    Prázdný whitelist = povoleno vše (zpětně kompatibilní chování).
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
    SELECT 1 FROM whatsapp_senders
    WHERE LOWER(trim(sender_name)) = LOWER(trim(NEW.sender_name))
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN NULL; -- řádek se nevytvoří
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_check_sender_allowed ON whatsapp_incoming;
CREATE TRIGGER trg_whatsapp_check_sender_allowed
  BEFORE INSERT ON whatsapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION check_whatsapp_sender_allowed();

-- 2) Při odebrání odesílatele z whitelistu se smažou i jeho uložené zprávy
--    (přestal být povolený → nemá v DB co dělat).
CREATE OR REPLACE FUNCTION delete_whatsapp_messages_of_removed_sender()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM whatsapp_incoming
  WHERE LOWER(trim(sender_name)) = LOWER(trim(OLD.sender_name));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_delete_on_sender_removed ON whatsapp_senders;
CREATE TRIGGER trg_whatsapp_delete_on_sender_removed
  AFTER DELETE ON whatsapp_senders
  FOR EACH ROW
  EXECUTE FUNCTION delete_whatsapp_messages_of_removed_sender();

-- 3) Očista stávajících zpráv: smaže zprávy od odesílatelů, kteří nejsou
--    ve whitelistu (whitelist není prázdný). Před očistou doporučuji zálohu:
--    node scripts/backup-whatsapp-incoming.mjs
DO $$
DECLARE
  v_allowed_count bigint;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RAISE NOTICE 'Whitelist je prázdný — nic se nemaže.';
  ELSE
    DELETE FROM whatsapp_incoming w
    WHERE NOT EXISTS (
      SELECT 1 FROM whatsapp_senders s
      WHERE LOWER(trim(s.sender_name)) = LOWER(trim(w.sender_name))
    );
  END IF;
END $$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Automaticky zahodí zprávu od odesílatele, který není ve whatsapp_senders (prázdný whitelist = vše povoleno).';
COMMENT ON TRIGGER trg_whatsapp_delete_on_sender_removed ON whatsapp_senders IS
  'Při odebrání odesílatele z whitelistu smaže jeho zprávy z whatsapp_incoming.';
