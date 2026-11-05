-- 📍 Víc míst závozu u jednoho odběratele.
--
-- Z provozu 5. 11. 2026: „u Radek je potřeba 2 GPS, občas se vozí do Hradce
-- a občas do Prahy."
--
-- CO MIGRACE DĚLÁ
--  1) places.mista_zavozu — další místa závozu odběratele: pole
--     {id, nazev, adresa, lat, lng}. Hlavní adresa a GPS zůstávají
--     v places.address / lat / lng, jak byly (čte je všechno ostatní).
--  2) orders.misto_zavozu — id zvoleného místa z places.mista_zavozu;
--     prázdné = hlavní adresa odběratele. Podle něj navigace v Rozvozu
--     a Kniha jízd (km z GPS, +30 km za Prahu, Hradec…).
--
-- NIC SE NEMAŽE A NEPŘEPISUJE: jen dva nové sloupce s prázdnou výchozí
-- hodnotou. Změna místa u objednávky nespouští odpočty skladu (triggery
-- objednávek hlídají jen datum, den, datum objednávky a stav). Pustit
-- podruhé nic nezmění.

-- 1) Další místa odběratele -------------------------------------------------
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS mista_zavozu jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'places_mista_zavozu_pole' AND conrelid = 'public.places'::regclass
  ) THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_mista_zavozu_pole CHECK (jsonb_typeof(mista_zavozu) = 'array');
  END IF;
END
$$;

COMMENT ON COLUMN public.places.mista_zavozu IS
  'Další místa závozu odběratele (Radek: Praha / Hradec) — pole {id, nazev, adresa, lat, lng}. Hlavní adresa a GPS jsou v address / lat / lng. Zadává se v Odběratelích.';

-- 2) Zvolené místo u objednávky ---------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS misto_zavozu text;

COMMENT ON COLUMN public.orders.misto_zavozu IS
  'Id místa z places.mista_zavozu, kam objednávka jede; prázdné = hlavní adresa odběratele. Volí se v Rozvozu nebo v detailu objednávky.';
