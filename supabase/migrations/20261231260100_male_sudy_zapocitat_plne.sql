-- Malé sudy: započítat plné sudy skladem? Rozhoduje stáčeč u každého obalu.
--
-- Z provozu 6. 10. 2026: „v případě, že jsou naplněné malé, přidej otázku,
-- zda se mají započítat — když ne, nepočítej je, když jo, tak je počítej."
-- Naklikaný počet jsou PRÁZDNÉ sudy; plné sudy toho piva skladem objednávku
-- pokryjí jen tehdy, když je stáčeč u obalu započítá (src/lib/maleSudy.ts).
-- Ve sdílené tabulce, ať Objednávky na všech zařízeních počítají stejně.

ALTER TABLE public.male_sudy
  ADD COLUMN IF NOT EXISTS zapocitat_plne boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.male_sudy.zapocitat_plne IS
  'Plné sudy skladem pokryjí objednávky tohoto obalu (jinak každý objednaný sud bere prázdný).';
