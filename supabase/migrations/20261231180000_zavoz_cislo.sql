-- 🚚 Víc závozů za den (1. / 2. závoz).
--
-- Z provozu 29. 9. 2026: „udělej možnost rozdělit závozy, někdy se vezou za
-- den dva — dnes se dopoledne vezl Seeberg, ale mám jeho data v zítřejším."
--
-- Den závozu (delivery_day/delivery_date) zůstává, jen se v rámci dne pozná,
-- kterým závozem objednávka jede. Rozvoz podle toho filtruje trasu i „Co
-- naložit". Výchozí 1 = dosavadní chování, nic se nemění.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS zavoz_cislo smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_zavoz_cislo_rozsah CHECK (zavoz_cislo BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
