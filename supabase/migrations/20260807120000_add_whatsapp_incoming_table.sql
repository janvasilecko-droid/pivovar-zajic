-- WhatsApp webhook integration for automatic order import via Make.com
-- Created: 2026-08-07

-- Table for storing incoming WhatsApp messages from AutoNotification/Tasker via Make
CREATE TABLE IF NOT EXISTS whatsapp_incoming (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Raw message data from WhatsApp
  sender_name TEXT NOT NULL,           -- Sender name from WhatsApp
  sender_number TEXT,                  -- Sender phone number (if available)
  message_text TEXT NOT NULL,          -- Full message text
  message_timestamp TIMESTAMP WITH TIME ZONE, -- When message was sent in WhatsApp
  message_type TEXT DEFAULT 'text',    -- 'text', 'image', 'document', etc.
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'parsed', 'imported', 'error', 'ignored'
  error_message TEXT,                  -- If status = 'error'
  
  -- Parsed data (filled after AI processing)
  parsed_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  parsed_place_name TEXT,              -- Place name from parsing
  parsed_delivery_day TEXT,            -- 'po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'
  parsed_delivery_date DATE,
  parsed_note TEXT,
  parsed_items JSONB,                  -- Array of parsed items
  
  -- Import reference
  imported_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  imported_at TIMESTAMP WITH TIME ZONE,
  
  -- Make webhook metadata
  webhook_id TEXT,                     -- Make webhook ID for deduplication
  webhook_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Indexes for performance
  CONSTRAINT whatsapp_incoming_status_check CHECK (status IN ('pending', 'processing', 'parsed', 'imported', 'error', 'ignored'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_status ON whatsapp_incoming(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_created_at ON whatsapp_incoming(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_sender ON whatsapp_incoming(sender_name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_webhook_id ON whatsapp_incoming(webhook_id);

-- Enable realtime for the table (no-op if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_incoming;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- RLS policies
ALTER TABLE whatsapp_incoming ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all incoming messages
DROP POLICY IF EXISTS "Users can view whatsapp_incoming" ON whatsapp_incoming;
CREATE POLICY "Users can view whatsapp_incoming" ON whatsapp_incoming
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update (for webhook)
DROP POLICY IF EXISTS "Service role can manage whatsapp_incoming" ON whatsapp_incoming;
CREATE POLICY "Service role can manage whatsapp_incoming" ON whatsapp_incoming
  FOR ALL USING (auth.role() = 'service_role');

-- Function to automatically process pending WhatsApp messages
CREATE OR REPLACE FUNCTION process_pending_whatsapp_messages()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for new pending messages
  IF NEW.status = 'pending' THEN
    -- This function will be called by a scheduled job or edge function
    -- For now, just mark as ready for processing
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to handle new messages
DROP TRIGGER IF EXISTS on_new_whatsapp_message ON whatsapp_incoming;
CREATE TRIGGER on_new_whatsapp_message
  AFTER INSERT ON whatsapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION process_pending_whatsapp_messages();

-- Comment
COMMENT ON TABLE whatsapp_incoming IS 'Incoming WhatsApp messages from AutoNotification/Tasker via Make webhook for automatic order import';
COMMENT ON COLUMN whatsapp_incoming.status IS 'pending = waiting for processing, processing = AI parsing in progress, parsed = successfully parsed, imported = created as order, error = failed to parse, ignored = manually ignored';
COMMENT ON COLUMN whatsapp_incoming.parsed_items IS 'JSON array of parsed order items: [{beer_id, pkg_id, qty, degree, raw_line}]';