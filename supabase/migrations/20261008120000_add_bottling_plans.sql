-- ============================================================================
-- ⚗️ Plánování stáčení — „Co je potřeba stočit"
-- ----------------------------------------------------------------------------
-- Admin / sládek / šéf zadá úkol (pivo, až 3 velikosti lahví, KEG sudy, datum,
-- poznámka). Stáčeč vidí úkoly zvýrazněné v zápisu stáčení (BottlingScreen,
-- záložka „Stáčení lahví") a může je „naplnit" do formuláře nebo označit jako
-- hotové.
--
-- RLS: otevřené čtení i zápis pro přihlášené uživatele — shodně s ostatními
-- tabulkami aplikace (bottling, orders, ...). Kdo smí zadávat/upravovat/mazat
-- se řídí UI vrstvou (isBottlingManager: admin/sef/sladek/boss/manager),
-- protože stáčeč musí umět přepnout úkol na „hotovo" (offline fronta aplikace
-- pak umí zápis spolehlivě zopakovat).
-- ============================================================================

CREATE TABLE IF NOT EXISTS bottling_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beer_id uuid REFERENCES beers(id) ON DELETE CASCADE,
  -- KEG sudy
  keg_pkg_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  keg_qty integer NOT NULL DEFAULT 0 CHECK (keg_qty >= 0),
  -- Lahve (až 3 velikosti na jeden úkol)
  pkg_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  pkg2_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty2 integer NOT NULL DEFAULT 0 CHECK (qty2 >= 0),
  pkg3_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  qty3 integer NOT NULL DEFAULT 0 CHECK (qty3 >= 0),
  planned_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Úkol musí mít alespoň jeden obal s počtem > 0
  CONSTRAINT bottling_plans_has_lines CHECK (qty > 0 OR qty2 > 0 OR qty3 > 0 OR keg_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_bottling_plans_planned_date ON bottling_plans(planned_date);
CREATE INDEX IF NOT EXISTS idx_bottling_plans_status ON bottling_plans(status);

-- Auto-update updated_at při změně (pro odznáček „nových úkolů" u stáčeče)
CREATE OR REPLACE FUNCTION public.touch_updated_at_bottling_plans()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bottling_plans_touch_updated_at ON bottling_plans;
CREATE TRIGGER trg_bottling_plans_touch_updated_at
  BEFORE UPDATE ON bottling_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_bottling_plans();

-- RLS (otevřené pro přihlášené — viz komentář nahoře)
ALTER TABLE bottling_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_read_bottling_plans" ON bottling_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_write_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_write_bottling_plans" ON bottling_plans FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_update_bottling_plans" ON bottling_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_bottling_plans" ON bottling_plans;
CREATE POLICY "auth_delete_bottling_plans" ON bottling_plans FOR DELETE TO authenticated USING (true);

-- Realtime (živé obnovení pro stáčeče i plánovače)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bottling_plans;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bottling_plans už v publikaci: %', SQLERRM;
END $$;

COMMENT ON TABLE bottling_plans IS 'Úkoly na stáčení (lahve + KEG) — zadává admin/sládek/šéf, stáčeč vidí zvýrazněné v zápisu stáčení.';
