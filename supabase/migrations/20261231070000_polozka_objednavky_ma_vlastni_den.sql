-- Položka objednávky může mít vlastní den dovozu.
--
-- Převzato z nesloučeného PR #33 (9. 9. 2026), původně jako 20261231000000 —
-- přejmenováno, aby v pořadí migrací stála až za těmi, které už na produkci
-- běží.
--
-- CO SE DĚLO: plán stáčení přiřazuje den CELÉ objednávce (podle `delivery_day`,
-- jinak podle `delivery_date`). Jenže objednávka se běžně veze na dvakrát —
-- z provozu 9. 9. 2026: „část objednávky od Radka se vezla o den dřív, takže
-- potřebuju část odškrtnout ve středu a část ve čtvrtek". Celá objednávka
-- přitom visela na čtvrtku, takže ve středu nebylo co odškrtnout a ve čtvrtek
-- seděl plný počet, i když půlka už byla dávno hotová.
--
-- ŘEŠENÍ: nepovinný den u JEDNOTLIVÉ položky. Když je vyplněný, plán se řídí
-- jím; když není (a to je drtivá většina řádků), platí den celé objednávky
-- přesně jako dosud. Existující data se tedy nemění a chovají se stejně.
--
-- ZÁMĚRNĚ SE NEMĚNÍ `orders.delivery_day`. Ten popisuje, kdy se veze
-- objednávka jako celek, a řídí se podle něj Závoz i filtry.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_day text;

-- Povolené jsou jen zkratky dnů, se kterými pracuje appka (lib/shared.ts DAYS).
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_delivery_day_chk;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_delivery_day_chk
  CHECK (delivery_day IS NULL OR delivery_day IN ('po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'));

COMMENT ON COLUMN public.order_items.delivery_day IS
  'Den dovozu jen pro tuhle položku (po/ut/st/ct/pa/so/ne). NULL = platí den celé objednávky. Používá plán stáčení, když se objednávka veze na dvakrát.';

CREATE INDEX IF NOT EXISTS order_items_delivery_day_idx
  ON public.order_items (delivery_day)
  WHERE delivery_day IS NOT NULL;
