-- Položka objednávky může mít vlastní den dovozu.
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
-- Rozdělit se dá i část řádku: appka řádek rozdělí na dva (4 ks na středu,
-- zbytek zůstane na dni objednávky). Proto je den na položce, ne na objednávce.
--
-- ZÁMĚRNĚ SE NEMĚNÍ `orders.delivery_day`. Ten popisuje, kdy se veze
-- objednávka jako celek, a řídí se podle něj Závoz i filtry — kdyby ho
-- rozdělení položek přepisovalo, rozešel by se plán stáčení se závozem.
--
-- Spouští se jako ostatní: Supabase → SQL Editor → Run, nebo z appky
-- (Nastavení → Diagnostika → Databázové migrace). Jde pustit opakovaně.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_day text;

-- Povolené jsou jen zkratky dnů, se kterými pracuje appka (lib/shared.ts DAYS).
-- Bez téhle pojistky by překlep („streda") položku tiše vyřadil z plánu:
-- neodpovídal by žádnému dni a nikde by se neukázala.
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_delivery_day_chk;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_delivery_day_chk
  CHECK (delivery_day IS NULL OR delivery_day IN ('po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'));

COMMENT ON COLUMN public.order_items.delivery_day IS
  'Den dovozu jen pro tuhle položku (po/ut/st/ct/pa/so/ne). NULL = platí den celé objednávky. Používá plán stáčení, když se objednávka veze na dvakrát.';

-- Plán stáčení čte položky celého týdne a ptá se na den — bez indexu by to
-- byl sken celé tabulky. Částečný index, protože vyplněných dnů je málo.
CREATE INDEX IF NOT EXISTS order_items_delivery_day_idx
  ON public.order_items (delivery_day)
  WHERE delivery_day IS NOT NULL;
