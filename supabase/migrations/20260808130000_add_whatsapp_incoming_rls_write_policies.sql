-- WhatsApp incoming: přidání RLS politik pro zápis (schválení/zamítnutí/mazání zpráv z UI)
-- Vytvořeno: 2026-08-08
-- Důvod: UI (Orders.tsx) mění status na 'imported'/'ignored' a maže zprávy jako
--        přihlášený uživatel (authenticated role). Původní migrace měla jen SELECT.

-- Povolit přihlášeným uživatelům aktualizovat zprávy (schválení, zamítnutí, označení za importované)
DROP POLICY IF EXISTS "Users can update whatsapp_incoming" ON whatsapp_incoming;
CREATE POLICY "Users can update whatsapp_incoming" ON whatsapp_incoming
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Povolit přihlášeným uživatelům mazat zprávy
DROP POLICY IF EXISTS "Users can delete whatsapp_incoming" ON whatsapp_incoming;
CREATE POLICY "Users can delete whatsapp_incoming" ON whatsapp_incoming
  FOR DELETE USING (auth.role() = 'authenticated');
