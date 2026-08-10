-- Sloupce pro řízení aktivního stáčení z tanku (zdroj odečtu piva při stáčení KEG).
-- Aplikace (Sklep → "Zahájit stáčení" / "Ukončit stáčení") tyto sloupce zapisuje,
-- ale doposud nebyly v databázi — update tiše selhával a tlačítko se tvářilo, že nic nedělá.

ALTER TABLE public.cellar_tanks
  ADD COLUMN IF NOT EXISTS kegging_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kegging_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS kegging_ended_at timestamptz;

COMMENT ON COLUMN public.cellar_tanks.kegging_active IS 'Zda je na tanku aktivní stáčení KEG (jediný aktivní zdroj, ze kterého se odečítá pivo při stáčení).';
COMMENT ON COLUMN public.cellar_tanks.kegging_started_at IS 'Kdy bylo na tanku zahájeno stáčení KEG.';
COMMENT ON COLUMN public.cellar_tanks.kegging_ended_at IS 'Kdy bylo na tanku ukončeno stáčení KEG.';
