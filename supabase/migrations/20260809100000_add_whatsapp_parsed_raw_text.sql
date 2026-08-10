-- Kontrola čtení WhatsApp zpráv: doslovný přepis textu od AI (raw_text),
-- aby uživatel mohl vždy porovnat originální zprávu s tím, co AI přečetla.
ALTER TABLE whatsapp_incoming
  ADD COLUMN IF NOT EXISTS parsed_raw_text TEXT;

COMMENT ON COLUMN whatsapp_incoming.parsed_raw_text IS 'Doslovný přepis zprávy od AI (raw_text z parse-order-text) — pro vizuální kontrolu, že AI přečetla zprávu správně.';
