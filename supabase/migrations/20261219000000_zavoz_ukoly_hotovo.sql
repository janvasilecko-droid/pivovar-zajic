-- Odskrtavani ukolu k zavozu ("vyzvednout prazdne sudy", "nalozit podtacky"...).
--
-- Ukoly se nikam nezadavaji — ctou se z poznamky objednavky (lib/zavozUkoly.ts),
-- protoze tak chodi ze skupiny na WhatsAppu: jako veta mezi objednavkou.
-- Tahle tabulka drzi jedinou vec navic, kterou z poznamky vycist nejde:
-- jestli uz to nekdo udelal.
--
-- Jeden radek = jeden splneny ukol u jedne objednavky. Nesplneny ukol radek
-- nema; odskrtnuti se rusi smazanim. Diky tomu se nemusi nic predvytvaret
-- ve chvili, kdy objednavka vznikne, a zmena poznamky (pribyl/zmizel ukol)
-- nevyzaduje zadnou udrzbu — osirely radek se proste neuplatni.
--
-- Klic je textovy zamerne: je to UkolKlic z lib/zavozUkoly.ts. Kdyby se
-- seznam ukolu rozsiril, databaze se menit nemusi.

CREATE TABLE IF NOT EXISTS public.zavoz_ukoly_hotovo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  klic text NOT NULL,
  splneno_at timestamptz NOT NULL DEFAULT now(),
  splnil text
);

-- Jeden ukol u jedne objednavky = nejvyse jeden radek. Bez toho by dve
-- klepnuti na telefonu (nebo dva lide naraz) zalozily dva zaznamy a
-- odskrtnuti by pak neslo zrusit jednim smazanim.
CREATE UNIQUE INDEX IF NOT EXISTS zavoz_ukoly_hotovo_unique_idx
  ON public.zavoz_ukoly_hotovo (order_id, klic);

CREATE INDEX IF NOT EXISTS zavoz_ukoly_hotovo_order_idx
  ON public.zavoz_ukoly_hotovo (order_id);

ALTER TABLE public.zavoz_ukoly_hotovo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zavoz_ukoly_hotovo_select ON public.zavoz_ukoly_hotovo;
CREATE POLICY zavoz_ukoly_hotovo_select ON public.zavoz_ukoly_hotovo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo;
CREATE POLICY perm_insert_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('zavoz'));

DROP POLICY IF EXISTS perm_update_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo;
CREATE POLICY perm_update_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('zavoz'))
  WITH CHECK (public.user_can_edit_module('zavoz'));

DROP POLICY IF EXISTS perm_delete_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo;
CREATE POLICY perm_delete_zavoz_ukoly_hotovo ON public.zavoz_ukoly_hotovo
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('zavoz'));
