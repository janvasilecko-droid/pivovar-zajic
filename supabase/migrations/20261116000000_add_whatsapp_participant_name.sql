-- Created: 2026-08-11
-- Skutečné jméno pisatele zprávy ve skupině (pushName z WhatsApp). Bridge ho
-- posílá jako participantName, webhook ho ukládá sem. Pro AI kontext je to
-- ODESÍLATEL (může být i ODBĚRATELEM, když text zprávy říká "pro mě"/"mi"/"mně").
ALTER TABLE whatsapp_incoming ADD COLUMN IF NOT EXISTS participant_name TEXT;

COMMENT ON COLUMN whatsapp_incoming.participant_name IS
  'Skutečné jméno pisatele ve skupině (pushName z WhatsApp bridge). Liší se od sender_name, který je název skupiny. AI ho dostává v messages kontextu jako odesílatele.';
