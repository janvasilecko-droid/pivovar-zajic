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

-- DROP IF EXISTS i na NOVÉM jméně, ne jen na starém — appka nemá kompletní
-- evidenci, co už bylo ručně spuštěno (viz migrace 20261227010000), takže
-- druhé spuštění tohohle souboru by jinak spadlo na "constraint already
-- exists" (nalezeno při auditu 13. 9. 2026).
ALTER TABLE public.bottling DROP CONSTRAINT IF EXISTS bottling_quantity_positive;
ALTER TABLE public.bottling DROP CONSTRAINT IF EXISTS bottling_quantity_nonzero;
ALTER TABLE public.bottling
  ADD CONSTRAINT bottling_quantity_nonzero CHECK (quantity <> 0) NOT VALID;

ALTER TABLE public.kegging DROP CONSTRAINT IF EXISTS kegging_quantity_positive;
ALTER TABLE public.kegging DROP CONSTRAINT IF EXISTS kegging_quantity_nonzero;
ALTER TABLE public.kegging
  ADD CONSTRAINT kegging_quantity_nonzero CHECK (quantity <> 0) NOT VALID;
