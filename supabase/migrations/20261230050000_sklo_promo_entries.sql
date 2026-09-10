-- Příjem/výdej skla, podtácků, kelímků a promo materiálu (SkloPromoScreen).
--
-- Stejný vzor jako label_purchases a obal_nakupy: appka měla nákupy
-- etiket i lahví/závěrek už dávno v databázi (sdílené mezi zařízeními),
-- ale příjem/výdej samotného skla, podtácků a promo předmětů zůstával
-- jen v localStorage jednoho telefonu — jiné zařízení vidělo jiný
-- zůstatek. Nalezeno 10. 9. 2026 (docs/50-navrhu-2026-09-10-treti.md,
-- bod 6).
--
-- Stejně jako u obal_nakupy appka po nasazení jednou převede staré
-- záznamy z localStorage tohoto telefonu do databáze (viz
-- prevedEntryZTelefonu ve SkloPromoScreen.tsx) — originál v telefonu
-- se nemaže, jen se zrcadlí.

CREATE TABLE IF NOT EXISTS public.sklo_promo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL, -- 'in' | 'out'
  entry_date date NOT NULL,
  category text NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  destination text,
  note text,
  zdroj text, -- 'obrazovka' nebo 'prevod-z-telefonu'
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sklo_promo_entries_item_idx
  ON public.sklo_promo_entries (item_name, entry_date DESC);

ALTER TABLE public.sklo_promo_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_sklo_promo_entries" ON public.sklo_promo_entries;
CREATE POLICY "auth_read_sklo_promo_entries" ON public.sklo_promo_entries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_sklo_promo_entries" ON public.sklo_promo_entries;
CREATE POLICY "auth_insert_sklo_promo_entries" ON public.sklo_promo_entries
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_sklo_promo_entries" ON public.sklo_promo_entries;
CREATE POLICY "auth_delete_sklo_promo_entries" ON public.sklo_promo_entries
  FOR DELETE TO authenticated USING (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sklo_promo_entries;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sklo_promo_entries už v publikaci: %', SQLERRM;
END $$;
