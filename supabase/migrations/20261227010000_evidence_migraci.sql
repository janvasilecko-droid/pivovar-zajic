-- Evidence aplikovanych migraci.
--
-- Soubory v supabase/migrations/ nerikaji NIC o tom, co na produkci
-- doopravdy bezi. Migrace se pousti rucne (scripts/apply-migration.mjs)
-- a jestli uz nekdo dany soubor pustil, se pozna jen tim, ze se aplikace
-- chova jinak, nez by mela — nebo tim, ze SQL spadne na "already exists".
-- Kvuli tomu tu dva dny cekaly dve migrace a nikdo o tom nevedel.
--
-- Tabulka je zamerne co nejjednodussi: nazev souboru a kdy se pustil.
-- Zadny hash obsahu, zadne verzovani schematu — cokoliv slozitejsiho by
-- se rozeslo se skutecnosti pri prvni rucne pustene migraci.
--
-- POZOR NA JEDNU VEC: migrace pustene PRED zavedenim teto tabulky v ni
-- nejsou a doplnit se poctive nedaji (nikdo nevi, kdy se pustily).
-- Aplikace je proto neukazuje jako "chybi", ale jako "starsi nez
-- evidence" — lhat o tom, co je aplikovane, je horsi nez to nevedet.

CREATE TABLE IF NOT EXISTS public.migrace_aplikovane (
  -- Jmeno souboru vcetne casove predpony, presne jak je v repozitari.
  nazev text PRIMARY KEY,
  aplikovano_at timestamptz NOT NULL DEFAULT now(),
  -- Kdo/co migraci pustilo: 'apply-migration.mjs', 'supabase-studio', ...
  zdroj text,
  poznamka text
);

CREATE INDEX IF NOT EXISTS migrace_aplikovane_cas_idx
  ON public.migrace_aplikovane (aplikovano_at DESC);

ALTER TABLE public.migrace_aplikovane ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_migrace" ON public.migrace_aplikovane;
CREATE POLICY "auth_read_migrace" ON public.migrace_aplikovane
  FOR SELECT TO authenticated USING (true);

-- Zapisuje jen servisni klic (skript s tokenem). Z prohlizece se do evidence
-- migraci zapisovat nema — byla by to jen dalsi cesta, jak si ji rozejit
-- se skutecnosti.
DROP POLICY IF EXISTS "service_write_migrace" ON public.migrace_aplikovane;
CREATE POLICY "service_write_migrace" ON public.migrace_aplikovane
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tahle migrace se zapise sama — je prvni v evidenci a zaroven hranice,
-- od ktere ma evidence smysl.
INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261227010000_evidence_migraci.sql', 'migrace sama', 'zacatek evidence')
ON CONFLICT (nazev) DO NOTHING;
