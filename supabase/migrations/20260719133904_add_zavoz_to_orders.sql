-- Závoz: příznak, že objednávka byla dovezena/závoz dokončen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_delivered boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
