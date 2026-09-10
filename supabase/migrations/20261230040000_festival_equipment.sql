-- Festivalové vybavení — půjčky chladičů, stanů, narážečů (FestivalEquipmentTracker).
--
-- Stejný problém jako merch_items (migrace 20261230030000): obrazovka
-- (záložka "Festival" ve Skladu) vypadala hotová — půjčení, kauce, vrácení
-- — ale neukládala vůbec nic. U vybavení půjčovaného v kaucích za tisíce
-- korun je to horší než u merche: appka se tvářila, že eviduje, kdo má
-- co a kolik kauce leží venku, a ve skutečnosti to zapomněla při
-- obnovení stránky. Nalezeno 10. 9. 2026
-- (docs/50-navrhu-2026-09-10-treti.md, bod 5).
--
-- Přidán i krok "kauce vrácena" (deposit_returned) při vrácení vybavení —
-- v původní verzi vrácení vybavení kauci rovnou "zapomnělo", takže nešlo
-- zpětně dohledat, jestli se peníze skutečně vrátily.

CREATE TABLE IF NOT EXISTS public.festival_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'chlazeni',
  serial_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available', -- 'available' | 'borrowed' | 'maintenance'
  borrower_name text,
  borrower_phone text,
  event_name text,
  borrowed_at date,
  expected_return_at date,
  deposit_kic numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Historie půjček — jinak se přepsáním "borrowed" -> "available" ztratí,
-- kdo si co půjčil a kdy/jestli se kauce vrátila (na rozdíl od aktuálního
-- stavu v festival_equipment, který drží jen POSLEDNÍ/aktuální půjčku).
CREATE TABLE IF NOT EXISTS public.festival_equipment_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.festival_equipment(id) ON DELETE CASCADE,
  borrower_name text NOT NULL,
  borrower_phone text,
  event_name text,
  borrowed_at date NOT NULL,
  expected_return_at date,
  returned_at date,
  deposit_kic numeric,
  deposit_returned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS festival_equipment_loans_equipment_idx
  ON public.festival_equipment_loans (equipment_id, borrowed_at DESC);

ALTER TABLE public.festival_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_equipment_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_festival_equipment" ON public.festival_equipment;
CREATE POLICY "auth_read_festival_equipment" ON public.festival_equipment
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_festival_equipment" ON public.festival_equipment;
CREATE POLICY "auth_insert_festival_equipment" ON public.festival_equipment
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_festival_equipment" ON public.festival_equipment;
CREATE POLICY "auth_update_festival_equipment" ON public.festival_equipment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_festival_equipment" ON public.festival_equipment;
CREATE POLICY "auth_delete_festival_equipment" ON public.festival_equipment
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_read_festival_equipment_loans" ON public.festival_equipment_loans;
CREATE POLICY "auth_read_festival_equipment_loans" ON public.festival_equipment_loans
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_festival_equipment_loans" ON public.festival_equipment_loans;
CREATE POLICY "auth_insert_festival_equipment_loans" ON public.festival_equipment_loans
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_festival_equipment_loans" ON public.festival_equipment_loans;
CREATE POLICY "auth_update_festival_equipment_loans" ON public.festival_equipment_loans
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_equipment;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'festival_equipment už v publikaci: %', SQLERRM;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.festival_equipment_loans;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'festival_equipment_loans už v publikaci: %', SQLERRM;
END $$;
