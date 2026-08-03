-- Přidání sloupce do tabulky bottling pro zdrojový objem ze sudů.
-- Při stáčení do lahví ze sudů (kegs_used) se uloží zdrojový objem
-- (source_volume_l = počet sudů × objem sudu, např. 6×50L = 300L).
-- Sudy se odečtou ze skladu (jako objednávka) a vytrata se počítá jako
-- source_volume_l - (quantity * package.volume_l).

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS source_volume_l numeric(10,2);
