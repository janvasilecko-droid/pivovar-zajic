-- Kontrola čtení WhatsApp zpráv — rozšíření 2. fáze:
--   * media_url — fotka/příloha zprávy (vyplňuje webhook, když ji Make/Tasker pošle)
--   * readback_unmatched_count — počet položek, jejichž přepis AI nesouhlasí
--     s originálem (vyplňuje se při parsování i po ručním „přečtení znovu")
--   * readback_checked_at / readback_checked_by — audit, kdo/kdy zprávu zkontroloval
--   * orders.whatsapp_message_id — zpětný odkaz objednávka → WhatsApp zpráva

ALTER TABLE whatsapp_incoming
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS readback_unmatched_count INTEGER,
  ADD COLUMN IF NOT EXISTS readback_checked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS readback_checked_by TEXT;

COMMENT ON COLUMN whatsapp_incoming.media_url IS 'URL fotky/přílohy zprávy (pokud ji webhook dostane) — zobrazení v UI bez ukládání médií.';
COMMENT ON COLUMN whatsapp_incoming.readback_unmatched_count IS 'Počet položek, jejichž raw_line se nenašel v originálním textu (kontrola čtení). 0 = vše sedí, NULL = nezkontrolováno.';
COMMENT ON COLUMN whatsapp_incoming.readback_checked_at IS 'Kdy byla kontrola čtení potvrzena (audit).';
COMMENT ON COLUMN whatsapp_incoming.readback_checked_by IS 'Kdo kontrolu čtení potvrdil (audit — user id nebo jméno).';

-- Zpětný odkaz objednávka → WhatsApp zpráva (z které zprávy objednávka vznikla).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS whatsapp_message_id UUID REFERENCES whatsapp_incoming(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_whatsapp_message_id ON orders(whatsapp_message_id);

COMMENT ON COLUMN orders.whatsapp_message_id IS 'WhatsApp zpráva, ze které objednávka vznikla (zpětný odkaz pro kontrolu čtení).';
