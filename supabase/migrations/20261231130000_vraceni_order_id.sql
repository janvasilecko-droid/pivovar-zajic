-- Vrácení z konkrétní objednávky — sloupec order_id na inventory_adjustments.
-- Created: 2026-12-31
-- Reason: Zadání 21. 9. 2026: „v prehledu obednavet dej tlacitko vratit pivo,
--         kdyz se da vratit pivo, obednavka zustane stejna ale pribude radek
--         kde bude vraceny pivo... bude tam napsano ze se pocita 4x30 a 1x30
--         vraceno do skladu." Dorovnání z vrácení (lib/vraceniZObjednavky.ts)
--         dřív neslo jen jméno odběratele v `reason` (volný text) — appka tak
--         neuměla spárovat konkrétní vrácení zpátky ke konkrétní objednávce a
--         spočítat u ní efektivní (vydané − vrácené) množství. Sloupec je
--         nepovinný: vrácení bez vybrané objednávky (záložka „Vrácení piva“
--         bez objednávky) ho dál nechává prázdné.

ALTER TABLE inventory_adjustments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_order_id
  ON inventory_adjustments(order_id) WHERE order_id IS NOT NULL;
