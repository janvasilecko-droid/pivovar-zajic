-- Sklad reklamních předmětů a merche (MarketingMerchInventory).
--
-- Obrazovka (záložka "Merch" ve Skladu) vypadala hotová — formulář,
-- rychlá úprava množství, upozornění na docházející zásobu — ale
-- neukládala vůbec nic, ani do localStorage. Každá změna zmizela při
-- obnovení stránky a dvě zařízení viděla dvě různá čísla, protože
-- každé mělo jen svůj vlastní vymyšlený počáteční stav (`DEFAULT_MERCH`
-- v komponentě). Nalezeno 10. 9. 2026 (docs/50-navrhu-2026-09-10-treti.md,
-- bod 4).
--
-- Stejný jednoduchý vzor jako obal_nakupy (20261228000000): žádné role
-- navíc, kdokoliv přihlášený smí číst i zapisovat.

CREATE TABLE IF NOT EXISTS public.merch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'doplnky',
  stock_qty numeric NOT NULL DEFAULT 0,
  min_alert_qty numeric NOT NULL DEFAULT 0,
  unit_cost_kic numeric NOT NULL DEFAULT 0,
  sell_price_kic numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.merch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_merch_items" ON public.merch_items;
CREATE POLICY "auth_read_merch_items" ON public.merch_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_merch_items" ON public.merch_items;
CREATE POLICY "auth_insert_merch_items" ON public.merch_items
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_merch_items" ON public.merch_items;
CREATE POLICY "auth_update_merch_items" ON public.merch_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_merch_items" ON public.merch_items;
CREATE POLICY "auth_delete_merch_items" ON public.merch_items
  FOR DELETE TO authenticated USING (true);

-- Realtime, ať se zápis z jednoho telefonu objeví na druhém.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.merch_items;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'merch_items už v publikaci: %', SQLERRM;
END $$;
