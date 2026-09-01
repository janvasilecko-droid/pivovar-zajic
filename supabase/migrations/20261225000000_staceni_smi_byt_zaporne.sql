-- Zápis stáčení smí být ZÁPORNÝ — jinak nejde odečíst manko.
--
-- Skladová kniha (src/lib/stockLedger.ts) je od začátku postavená na tom, že
-- množství nese znaménko: "+ příjem, − výdej". Manko z inventury se proto
-- opravuje ZÁPORNÝM řádkem ve stáčení — vyrobilo se míň, než se zapsalo,
-- takže se zápis výroby o ten rozdíl sníží.
--
-- Jenže obě tabulky měly CHECK (quantity > 0). Každý pokus o odečet skončil
-- na "new row for relation bottling violates check constraint
-- bottling_quantity_positive" a tlačítko "− Odečíst N ks" nefungovalo NIKDY,
-- ani u sudů. Ověřeno 1. 9. 2026: v bottling ani kegging neležel jediný
-- záporný řádek.
--
-- Nula zakázaná zůstává: řádek "stočilo se nula" nic nepopisuje a jen by
-- zaplevelil historii. Povoluje se tedy vše KROMĚ nuly.

ALTER TABLE public.bottling DROP CONSTRAINT IF EXISTS bottling_quantity_positive;
ALTER TABLE public.bottling
  ADD CONSTRAINT bottling_quantity_nonzero CHECK (quantity <> 0) NOT VALID;

ALTER TABLE public.kegging DROP CONSTRAINT IF EXISTS kegging_quantity_positive;
ALTER TABLE public.kegging
  ADD CONSTRAINT kegging_quantity_nonzero CHECK (quantity <> 0) NOT VALID;
