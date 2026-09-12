-- Zaškrtnutí "Stočeno" u sudu na objednávce rovnou založí skutečný
-- záznam stáčení, ať se nemusí psát dvakrát.
--
-- Z provozu 12. 9. 2026, hned po předchozí migraci (odpočet skladu až po
-- stočení): "když dám, že to mám, tak ho přidej do stáčení" — kapka
-- Stočeno u položky objednávky (Objednávky i Závoz) dosud jen odškrtávala,
-- skutečné množství se muselo zapsat ještě jednou zvlášť v „Začátek
-- stáčení". Teď se stáčeč nedopočítal a nezapomněl na druhý krok.
--
-- PROČ JEN order_item_id A NE NĚCO SLOŽITĚJŠÍHO: potřebuju vědět, KTERÝ
-- řádek stáčení vznikl z KTERÉ položky objednávky — jednak aby šlo
-- zaškrtnutí vzít zpátky (smazat přesně ten řádek, ne hádat podle piva
-- a množství), jednak aby se nezapisovalo dvakrát při opakovaném
-- zaškrtnutí/odškrtnutí. UNIQUE index (stejný vzor jako u
-- zavoz_deductions_order_item_unique_idx) to hlídá i při souběhu.
--
-- ON DELETE SET NULL, ne RESTRICT: kegging je záznam o tom, že se pivo
-- DOOPRAVDY stočilo — smazání objednávky (nebo její položky) ho nesmí
-- smazat ani zablokovat, jen odpojit vazbu. Přesně naopak než u
-- zavoz_deductions, což je jen odpočet skladu, ne fyzický fakt.

ALTER TABLE public.kegging
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kegging_order_item_unique_idx
  ON public.kegging (order_item_id)
  WHERE order_item_id IS NOT NULL;

COMMENT ON COLUMN public.kegging.order_item_id IS
  'Vyplněno, jen když záznam vznikl zaškrtnutím "Stočeno" u položky objednávky (Objednávky/Závoz). Ruční zápis v Začátek stáčení ho nechává prázdné.';
