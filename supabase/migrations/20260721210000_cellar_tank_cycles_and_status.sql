/*
# Sklep — plný životní cyklus tanku (start → stáčení → konec → sanitace → oplach → prázdný)

## 1. Účel
Rozšíření tabulky `cellar_tanks` o sledování aktuálního cyklu (kdy byl tank
naplněn, jaký byl počáteční objem) a nová tabulka `cellar_tank_cycles` pro
historii uzavřených cyklů (kolik piva bylo stočeno, jaká byla ztráta, jak
dlouho cyklus trval). Přidány nové stavy tanku 'sanitizing' (Sanitace) a
'rinsing' (Oplach H2O) do životního cyklu:

  prázdný → (naplnění) → active (aktivní/stáčí se) → (ukončení) →
  sanitizing (sanitace) → rinsing (oplach H2O) → empty (prázdný, připraven)

## 2. Změny tabulky cellar_tanks
- `started_at` (timestamptz) — kdy byl aktuální cyklus/naplnění zahájeno.
- `initial_volume_l` (numeric) — počáteční objem piva v tanku při zahájení
  cyklu (výchozí 7500 l, upravitelné při zahájení).
- `capacity_l` — default změněn na 7500 (byl 8000), podle zadání provozu.
- `status` — CHECK rozšířen o 'sanitizing' a 'rinsing'.

## 3. Nová tabulka cellar_tank_cycles
Historie uzavřených cyklů tanku: tank, pivo, počáteční objem, kolik bylo
stočeno (litry přepočtené z kegging.source_volume_l), ztráta (litry i %),
datum zahájení/ukončení a doba trvání ve dnech.

## 4. Bezpečnost
- RLS zapnuto, stejné sdílené politiky (authenticated CRUD) jako u ostatních
  provozních tabulek.

## 5. Poznámky
- Idempotentní — sloupce se přidávají přes `ADD COLUMN IF NOT EXISTS`,
  CHECK constraint se přegeneruje (drop+add), tabulka cyklů `CREATE TABLE IF
  NOT EXISTS`.
*/

-- 1) Nové sloupce na cellar_tanks
ALTER TABLE public.cellar_tanks
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_volume_l numeric(10,2);

-- Kapacita 7500l dle zadání provozu (byl default 8000)
ALTER TABLE public.cellar_tanks ALTER COLUMN capacity_l SET DEFAULT 7500;

-- Rozšíření CHECK na status o sanitizing/rinsing
DO $$
BEGIN
  ALTER TABLE public.cellar_tanks DROP CONSTRAINT IF EXISTS cellar_tanks_status_check;
  ALTER TABLE public.cellar_tanks
    ADD CONSTRAINT cellar_tanks_status_check
    CHECK (status IN ('empty','filling','active','emptying','cleaning','sanitizing','rinsing'));
END $$;

-- 2) Historie cyklů tanku
CREATE TABLE IF NOT EXISTS public.cellar_tank_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id uuid REFERENCES public.cellar_tanks(id) ON DELETE SET NULL,
  tank_label text,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  beer_name text,
  initial_volume_l numeric(10,2) NOT NULL DEFAULT 0,
  kegged_volume_l numeric(10,2) NOT NULL DEFAULT 0,
  keg_count numeric(10,2) NOT NULL DEFAULT 0,
  loss_l numeric(10,2) NOT NULL DEFAULT 0,
  loss_pct numeric(6,2) NOT NULL DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz NOT NULL DEFAULT now(),
  duration_hours numeric(10,1),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cellar_tank_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "select_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "insert_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "update_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
CREATE POLICY "delete_own_cellar_tank_cycles" ON public.cellar_tank_cycles
  FOR DELETE TO authenticated USING (true);

-- 3) Seed — zajistit 8 fyzických tanků (Tank 1..8), pokud ještě nejsou
INSERT INTO public.cellar_tanks (label, capacity_l, current_volume_l, status)
SELECT 'Tank ' || n, 7500, 0, 'empty'
FROM generate_series(1, 8) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.cellar_tanks t WHERE t.label = 'Tank ' || n
);

-- Sjednotit kapacitu existujících tanků 1-8 na 7500 (pokud existují se starou kapacitou 8000/2000)
UPDATE public.cellar_tanks SET capacity_l = 7500
WHERE label IN (SELECT 'Tank ' || n FROM generate_series(1, 8) AS n) AND capacity_l <> 7500;

-- 4) Realtime pro novou tabulku
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cellar_tank_cycles';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping cellar_tank_cycles publication: %', SQLERRM;
END $$;
