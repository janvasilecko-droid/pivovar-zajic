-- Immutable delivery stock movements, recorded once per order item.

CREATE TABLE IF NOT EXISTS public.zavoz_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deduct_date date NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid,
  beer_id uuid,
  package_id uuid,
  quantity numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade installations that already received the earlier draft table.
ALTER TABLE public.zavoz_deductions
  ADD COLUMN IF NOT EXISTS order_item_id uuid,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.zavoz_deductions
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_order_id_fkey;
ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_order_item_id_fkey;
ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_beer_id_fkey;
ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_package_id_fkey;

ALTER TABLE public.zavoz_deductions
  ADD CONSTRAINT zavoz_deductions_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT zavoz_deductions_order_item_id_fkey
    FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT zavoz_deductions_beer_id_fkey
    FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT zavoz_deductions_package_id_fkey
    FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL NOT VALID;

-- Best-effort link of legacy movements to their original order item. If an old
-- order contains duplicate equal rows, each historical movement is linked to
-- the first deterministic candidate and the later deduplication keeps one.
UPDATE public.zavoz_deductions AS d
SET order_item_id = (
  SELECT oi.id
  FROM public.order_items AS oi
  WHERE oi.order_id = d.order_id
    AND oi.beer_id IS NOT DISTINCT FROM d.beer_id
    AND oi.package_id IS NOT DISTINCT FROM d.package_id
  ORDER BY oi.created_at NULLS LAST, oi.id
  LIMIT 1
)
WHERE d.order_item_id IS NULL;

WITH duplicates AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_item_id
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.zavoz_deductions
  WHERE order_item_id IS NOT NULL
)
DELETE FROM public.zavoz_deductions AS d
USING duplicates AS x
WHERE d.id = x.id AND x.rn > 1;

DROP INDEX IF EXISTS public.zavoz_deductions_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS zavoz_deductions_order_item_unique_idx
  ON public.zavoz_deductions (order_item_id)
  WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS zavoz_deductions_date_idx
  ON public.zavoz_deductions (deduct_date);
CREATE INDEX IF NOT EXISTS zavoz_deductions_order_idx
  ON public.zavoz_deductions (order_id);

ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_quantity_positive;
ALTER TABLE public.zavoz_deductions
  ADD CONSTRAINT zavoz_deductions_quantity_positive CHECK (quantity > 0) NOT VALID;
ALTER TABLE public.zavoz_deductions
  DROP CONSTRAINT IF EXISTS zavoz_deductions_order_item_required;
ALTER TABLE public.zavoz_deductions
  ADD CONSTRAINT zavoz_deductions_order_item_required
  CHECK (order_item_id IS NOT NULL) NOT VALID;

ALTER TABLE public.zavoz_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zavoz_deductions_select ON public.zavoz_deductions;
DROP POLICY IF EXISTS zavoz_deductions_insert ON public.zavoz_deductions;
DROP POLICY IF EXISTS zavoz_deductions_update ON public.zavoz_deductions;
DROP POLICY IF EXISTS zavoz_deductions_delete ON public.zavoz_deductions;

CREATE POLICY zavoz_deductions_select ON public.zavoz_deductions
  FOR SELECT TO authenticated USING (true);

-- Internal transactional implementation. Only the owner/service role may call
-- it directly; the client receives a parameterless, current-day wrapper below.
CREATE OR REPLACE FUNCTION public.process_zavoz_deductions_for_date(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Deduction date is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zavoz_deductions:' || p_date::text));

  INSERT INTO public.zavoz_deductions (
    deduct_date,
    order_id,
    order_item_id,
    beer_id,
    package_id,
    quantity,
    note
  )
  SELECT
    p_date,
    o.id,
    oi.id,
    oi.beer_id,
    oi.package_id,
    oi.quantity,
    'Automaticky odpocet zavozu'
  FROM public.orders AS o
  JOIN public.order_items AS oi ON oi.order_id = o.id
  WHERE o.status <> 'storno'
    AND oi.quantity > 0
    AND COALESCE(
      o.delivery_date,
      date_trunc('week', o.order_date::timestamp)::date
        + CASE split_part(COALESCE(NULLIF(o.delivery_day, ''), 'pa'), '/', 1)
            WHEN 'po' THEN 0
            WHEN 'ut' THEN 1
            WHEN 'st' THEN 2
            WHEN 'ct' THEN 3
            WHEN 'pa' THEN 4
            WHEN 'so' THEN 5
            WHEN 'ne' THEN 6
            ELSE 4
          END
    ) = p_date
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

REVOKE ALL ON FUNCTION public.process_zavoz_deductions_for_date(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_zavoz_deductions_for_date(date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.run_today_zavoz_deductions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now timestamp := clock_timestamp() AT TIME ZONE 'Europe/Prague';
BEGIN
  IF local_now::time < time '01:00' THEN
    RETURN 0;
  END IF;
  RETURN public.process_zavoz_deductions_for_date(local_now::date);
END
$$;

REVOKE ALL ON FUNCTION public.run_today_zavoz_deductions()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_today_zavoz_deductions()
  TO authenticated, service_role;

-- Run hourly when pg_cron is available. The function uses Prague business
-- time, an advisory lock and a unique order_item key, so repeated runs are safe.
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE $sql$
      SELECT cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'zavoz-deductions-prague'
    $sql$;
    EXECUTE $sql$
      SELECT cron.schedule(
        'zavoz-deductions-prague',
        '5 * * * *',
        'SELECT public.run_today_zavoz_deductions()'
      )
    $sql$;
  ELSE
    RAISE NOTICE 'pg_cron is unavailable; authenticated client fallback remains enabled';
  END IF;
END
$schedule$;
