/*
# Akce: jednotné množství (+/-) a tržba za akci

1. Změny
- `akce.revenue` (numeric, Kč) — kolik se na akci celkem vydělalo
- `akce_items.quantity` (integer, default 0) — jednotné množství:
    kladné = vráceno / přifasováno zpět do skladu
    záporné = odvezeno / odečteno ze skladu
  Staré sloupce `quantity_taken` a `quantity_returned` zůstávají zachovány
  kvůli zpětné kompatibilitě a historickým datům (History.tsx je stále čte),
  nové záznamy z UI ale ukládají hodnotu i do `quantity`.

2. Poznámky
- Bezpečná migrace: pouze přidává sloupce, nic nemaže.
*/

ALTER TABLE akce ADD COLUMN IF NOT EXISTS revenue numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE akce_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0;

-- Backfill: quantity = quantity_returned - quantity_taken (zachovat existující saldo)
UPDATE akce_items SET quantity = COALESCE(quantity_returned, 0) - COALESCE(quantity_taken, 0) WHERE quantity = 0;
