-- Evidence vratnych KEG sudu u odberatelu (nalez c.2 z auditu).
--
-- Stav pred opravou: okno "Vracene prazdne sudy" se ridici otevrelo
-- automaticky po kazdem oznaceni objednavky za zavezenou, ridic vyplnil
-- pocty, appka zobrazila "✅ Zaznamenano vraceni prazdnych sudu" —
-- a callback jen slozil text do alert(). Zadny zapis, ani do localStorage.
-- KEG sud stoji 2-3 tisice a u maleho pivovaru se jich rocne "ztrati"
-- deset az tricet; nedalo se zjistit, kdo kolik dluzi.
--
-- Jeden radek = jeden pohyb sudu daneho objemu u daneho odberatele:
--   direction 'out' = sud odjel k odberateli (pri zavozu)
--   direction 'in'  = sud se vratil do pivovaru
-- Zustatek u odberatele = SUM(out) - SUM(in) po objemech.
-- Zamerne se needituji stavy, ale zapisuji pohyby — historie zustava
-- dohledatelna a oprava se dela protipohybem, ne prepsanim.

CREATE TABLE IF NOT EXISTS public.keg_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  place_name text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  volume_l numeric NOT NULL,
  direction text NOT NULL DEFAULT 'in',
  quantity integer NOT NULL,
  note text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keg_returns
  DROP CONSTRAINT IF EXISTS keg_returns_direction_check;
ALTER TABLE public.keg_returns
  ADD CONSTRAINT keg_returns_direction_check CHECK (direction IN ('in', 'out'));

ALTER TABLE public.keg_returns
  DROP CONSTRAINT IF EXISTS keg_returns_quantity_positive;
ALTER TABLE public.keg_returns
  ADD CONSTRAINT keg_returns_quantity_positive CHECK (quantity > 0);

CREATE INDEX IF NOT EXISTS keg_returns_place_idx ON public.keg_returns (place_id);
CREATE INDEX IF NOT EXISTS keg_returns_date_idx ON public.keg_returns (entry_date);

ALTER TABLE public.keg_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS keg_returns_select ON public.keg_returns;
CREATE POLICY keg_returns_select ON public.keg_returns
  FOR SELECT TO authenticated USING (true);

-- Zapis patri pod modul Zavoz (ridic eviduje pri rozvozu), pripadne
-- Objednavky — stejny fail-open vzorec jako u ostatnich modulu.
DROP POLICY IF EXISTS perm_insert_keg_returns ON public.keg_returns;
CREATE POLICY perm_insert_keg_returns ON public.keg_returns
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('zavoz') OR public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_update_keg_returns ON public.keg_returns;
CREATE POLICY perm_update_keg_returns ON public.keg_returns
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('zavoz') OR public.user_can_edit_module('orders'))
  WITH CHECK (public.user_can_edit_module('zavoz') OR public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_delete_keg_returns ON public.keg_returns;
CREATE POLICY perm_delete_keg_returns ON public.keg_returns
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('zavoz') OR public.user_can_edit_module('orders'));
