-- WhatsApp: povolení odesílatelé (whitelist) pro výběr zpráv k načtení
-- Vytvořeno: 2026-08-08
-- Důvod: uživatel si určuje, od kterých kontaktů se WhatsApp zprávy načítají
--        automaticky (realtime modál + AI parsing). Ostatní zůstávají v seznamu
--        'pending' pro ruční zpracování.

CREATE TABLE IF NOT EXISTS whatsapp_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL,
  sender_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Jednoznačnost podle jména (bez ohledu na velikost písmen a okolní mezery)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_senders_name ON whatsapp_senders (LOWER(trim(sender_name)));

ALTER TABLE whatsapp_senders ENABLE ROW LEVEL SECURITY;

-- Přihlášení uživatelé spravují seznam z UI (nastavení aplikace)
DROP POLICY IF EXISTS "Users can view whatsapp_senders" ON whatsapp_senders;
CREATE POLICY "Users can view whatsapp_senders" ON whatsapp_senders
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can insert whatsapp_senders" ON whatsapp_senders;
CREATE POLICY "Users can insert whatsapp_senders" ON whatsapp_senders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can update whatsapp_senders" ON whatsapp_senders;
CREATE POLICY "Users can update whatsapp_senders" ON whatsapp_senders
  FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete whatsapp_senders" ON whatsapp_senders;
CREATE POLICY "Users can delete whatsapp_senders" ON whatsapp_senders
  FOR DELETE USING (auth.role() = 'authenticated');

-- Service role pro edge funkce (whatsapp-auto-parse)
DROP POLICY IF EXISTS "Service role can manage whatsapp_senders" ON whatsapp_senders;
CREATE POLICY "Service role can manage whatsapp_senders" ON whatsapp_senders
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE whatsapp_senders IS 'Povolení odesílatelé WhatsApp — seznam kontaktů, od kterých se zprávy načítají automaticky. Prázdný seznam = načítají se zprávy od všech.';
