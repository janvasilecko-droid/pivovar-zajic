-- Reconcile the database schema with fields and values used by the application.
-- This migration is additive/idempotent and keeps existing installations usable.

-- ---------------------------------------------------------------------------
-- Profiles and delivery signatures
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb,
  ADD COLUMN IF NOT EXISTS receive_vehicle_alerts boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS signature_name text;

-- ---------------------------------------------------------------------------
-- Canonical order source/status values used by the current frontend
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

UPDATE public.orders SET status = 'pripravena' WHERE status = 'potvrzena';
UPDATE public.orders SET status = 'expedovana' WHERE status = 'vyexpedovana';
UPDATE public.orders SET status = 'storno' WHERE status = 'zrusena';
UPDATE public.orders SET status = 'vyrizeno_zavoz'
WHERE status IN ('vyrizeno', 'vyrizena', 'hotova');

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('email', 'whatsapp', 'rucne', 'fotka', 'duplikat'))
  NOT VALID;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('nova', 'pripravena', 'expedovana', 'storno', 'vyrizeno_zavoz'))
  NOT VALID;

-- New writes are checked immediately by NOT VALID constraints. Validate known
-- clean installations, while leaving a useful warning instead of breaking an
-- upgrade that contains an unknown historical value.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.orders VALIDATE CONSTRAINT orders_source_check;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'orders_source_check contains historical values; clean them before validation';
  END;
  BEGIN
    ALTER TABLE public.orders VALIDATE CONSTRAINT orders_status_check;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'orders_status_check contains historical values; clean them before validation';
  END;
END
$$;

-- A WhatsApp message may create at most one order. Keep the oldest order link
-- and detach duplicate links without deleting the orders themselves.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY whatsapp_message_id
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.orders
  WHERE whatsapp_message_id IS NOT NULL
)
UPDATE public.orders AS o
SET whatsapp_message_id = NULL
FROM ranked AS r
WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS orders_whatsapp_message_id_unique_idx
  ON public.orders (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Vehicles were used by the frontend but had no reproducible migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  spz text,
  stk_valid_until date,
  highway_toll_valid_until date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS spz text,
  ADD COLUMN IF NOT EXISTS stk_valid_until date,
  ADD COLUMN IF NOT EXISTS highway_toll_valid_until date,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_read_authenticated ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_authenticated ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_authenticated ON public.vehicles;
DROP POLICY IF EXISTS vehicles_delete_authenticated ON public.vehicles;

CREATE POLICY vehicles_read_authenticated ON public.vehicles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY vehicles_insert_authenticated ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY vehicles_update_authenticated ON public.vehicles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY vehicles_delete_authenticated ON public.vehicles
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS vehicles_name_idx
  ON public.vehicles (lower(btrim(name)));

-- Inventory adjustments are already used by the August frontend. Keep the
-- later historical migration idempotent, but make clean installations usable
-- at the point where the feature first appears.
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  package_label text,
  quantity numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_read_inventory_adjustments ON public.inventory_adjustments;
DROP POLICY IF EXISTS auth_write_inventory_adjustments ON public.inventory_adjustments;
DROP POLICY IF EXISTS auth_update_inventory_adjustments ON public.inventory_adjustments;
DROP POLICY IF EXISTS auth_delete_inventory_adjustments ON public.inventory_adjustments;
CREATE POLICY auth_read_inventory_adjustments ON public.inventory_adjustments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_inventory_adjustments ON public.inventory_adjustments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_inventory_adjustments ON public.inventory_adjustments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_inventory_adjustments ON public.inventory_adjustments
  FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS inventory_adjustments_month_idx
  ON public.inventory_adjustments (entry_date, beer_id, package_id);

-- ---------------------------------------------------------------------------
-- Basic integrity for new operational records. NOT VALID preserves existing
-- historical rows; PostgreSQL still enforces the constraints for new writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.packages DROP CONSTRAINT IF EXISTS packages_volume_positive;
ALTER TABLE public.packages
  ADD CONSTRAINT packages_volume_positive CHECK (volume_l > 0) NOT VALID;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_positive;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.bottling DROP CONSTRAINT IF EXISTS bottling_quantity_positive;
ALTER TABLE public.bottling
  ADD CONSTRAINT bottling_quantity_positive CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.kegging DROP CONSTRAINT IF EXISTS kegging_quantity_positive;
ALTER TABLE public.kegging
  ADD CONSTRAINT kegging_quantity_positive CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.writeoffs DROP CONSTRAINT IF EXISTS writeoffs_quantity_positive;
ALTER TABLE public.writeoffs
  ADD CONSTRAINT writeoffs_quantity_positive CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.cellar_tanks DROP CONSTRAINT IF EXISTS cellar_tanks_volume_bounds;
ALTER TABLE public.cellar_tanks
  ADD CONSTRAINT cellar_tanks_volume_bounds
  CHECK (capacity_l > 0 AND current_volume_l >= 0 AND current_volume_l <= capacity_l)
  NOT VALID;

ALTER TABLE public.cellar_transfers DROP CONSTRAINT IF EXISTS cellar_transfers_volume_valid;
ALTER TABLE public.cellar_transfers
  ADD CONSTRAINT cellar_transfers_volume_valid
  CHECK (
    volume_l > 0
    AND loss_l >= 0
    AND loss_l <= volume_l
    AND (to_tank_id IS NULL OR from_tank_id IS DISTINCT FROM to_tank_id)
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS kegging_cellar_tank_idx
  ON public.kegging (cellar_tank_id);
CREATE INDEX IF NOT EXISTS cellar_transfers_from_tank_idx
  ON public.cellar_transfers (from_tank_id);
CREATE INDEX IF NOT EXISTS cellar_transfers_to_tank_idx
  ON public.cellar_transfers (to_tank_id);
