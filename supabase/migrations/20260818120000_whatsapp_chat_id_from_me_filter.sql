-- WhatsApp: filtrování podle chat_id + ignorování vlastních zpráv (from_me)
-- Vytvořeno: 2026-08-09
-- Důvod:
--   1) Zpracovává se JEN jedna skupina „Objednávky pivovar“ — primárně podle
--      stabilního chat_id (např. "120363...@g.us"), název skupiny jen jako
--      přechodná záloha (skupina se dá přejmenovat, chat_id ne).
--   2) Vlastní zprávy (from_me = true — poslané z jiného zařízení/WhatsApp Webu)
--      se NESMÍ dostat do systému ani k AI → vynuceno už na úrovni databáze
--      (prevence smyčky AI → odpověď → Tasker → webhook).
--   3) Porovnání názvu je tolerantní k diakritice: "objednavky pivovar" ==
--      "Objednávky pivovar".

-- 0) Nové sloupce (idempotentně)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_senders' AND column_name = 'chat_id') THEN
    ALTER TABLE whatsapp_senders ADD COLUMN chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_incoming' AND column_name = 'chat_id') THEN
    ALTER TABLE whatsapp_incoming ADD COLUMN chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'whatsapp_incoming' AND column_name = 'from_me') THEN
    ALTER TABLE whatsapp_incoming ADD COLUMN from_me boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 0.5) Normalizace názvu pro porovnání: malá písmena, ořezané mezery, bez diakritiky.
CREATE OR REPLACE FUNCTION whatsapp_norm(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(lower(trim(s)), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz');
$$;

-- 1) BEFORE INSERT pojistka (rozšířená verze):
--    - from_me = true → řádek se NIKDY nevytvoří (vlastní zpráva, prevence smyčky).
--    - jinak je zpráva povolená, když sender_name odpovídá whitelistu NEBO chat_id
--      odpovídá nastavenému chat_id. Prázdný whitelist = povoleno vše (zpětně
--      kompatibilní chování).
CREATE OR REPLACE FUNCTION check_whatsapp_sender_allowed()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- Vlastní zprávy (z jiného zařízení/Webu) se NIKDY neukládají.
  IF NEW.from_me THEN
    RETURN NULL;
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

-- 2) Při odebrání odesílatele ze whitelistu se smažou i jeho uložené zprávy
--    (podle jména NEBO chat_id).
CREATE OR REPLACE FUNCTION delete_whatsapp_messages_of_removed_sender()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM whatsapp_incoming
  WHERE whatsapp_norm(sender_name) = whatsapp_norm(OLD.sender_name)
     OR (OLD.chat_id IS NOT NULL AND trim(OLD.chat_id) <> ''
         AND chat_id IS NOT NULL
         AND lower(trim(chat_id)) = lower(trim(OLD.chat_id)));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_delete_on_sender_removed ON whatsapp_senders;
CREATE TRIGGER trg_whatsapp_delete_on_sender_removed
  AFTER DELETE ON whatsapp_senders
  FOR EACH ROW
  EXECUTE FUNCTION delete_whatsapp_messages_of_removed_sender();

-- 3) Očista: smaže vlastní zprávy a zprávy, které neodpovídají whitelistu
--    (podle jména NEBO chat_id). Před očistou doporučuji zálohu:
--    node scripts/backup-whatsapp-incoming.mjs
DELETE FROM whatsapp_incoming WHERE from_me = true;

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
      WHERE (whatsapp_norm(w.sender_name) = whatsapp_norm(s.sender_name))
         OR (w.chat_id IS NOT NULL AND trim(w.chat_id) <> ''
             AND s.chat_id IS NOT NULL AND trim(s.chat_id) <> ''
             AND lower(trim(w.chat_id)) = lower(trim(s.chat_id)))
    );
  END IF;
END $$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON whatsapp_incoming IS
  'Automaticky zahodí zprávu od nepovoleného odesílatele a VŽDY zprávu s from_me=true (vlastní zpráva → prevence smyčky).';
COMMENT ON TRIGGER trg_whatsapp_delete_on_sender_removed ON whatsapp_senders IS
  'Při odebrání odesílatele z whitelistu smaže jeho zprávy z whatsapp_incoming (podle jména nebo chat_id).';
