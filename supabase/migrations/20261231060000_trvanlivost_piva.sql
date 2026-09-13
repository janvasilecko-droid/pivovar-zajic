-- 🗓️ Trvanlivost lahvového piva.
--
-- Návrh z 13. 9. 2026 (páté kolo), bod 8. Appka hlídala platnost jen u STK
-- vozidel; u lahví nevěděla, jak dlouho pivo vydrží, takže nemohla
-- upozornit, že na skladě leží šarže, které se blíží datum minimální
-- trvanlivosti.
--
-- Počet dní se zadává u piva (Katalogy → Piva). Prázdné = appka trvanlivost
-- nehlídá (třeba u piv, která se nelahvují).

ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS trvanlivost_dni integer;

ALTER TABLE public.beers DROP CONSTRAINT IF EXISTS beers_trvanlivost_kladna;
ALTER TABLE public.beers
  ADD CONSTRAINT beers_trvanlivost_kladna CHECK (trvanlivost_dni IS NULL OR trvanlivost_dni > 0);

COMMENT ON COLUMN public.beers.trvanlivost_dni IS
  'Kolik dní od lahvování je pivo trvanlivé. Sklad z toho odhaduje datum u nejstarší šarže, která na skladě pravděpodobně leží (lib/trvanlivostSarzi.ts).';
