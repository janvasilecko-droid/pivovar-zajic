/*
# zavoz_deductions: catch-up backfill + self-healing cron

1. Problem
- `process_zavoz_deductions_for_date(p_date)` only deducts order items whose
  EFFECTIVE delivery date exactly equals `p_date`. The hourly cron job only
  ever calls it with "today". If the cron didn't run on a given day (feature
  was installed mid-month, a deploy/outage skipped an hour, etc.), the order
  items due that day are permanently skipped — a later run with "today" will
  never match their (past) delivery date again.
- Result: `zavoz_deductions` was missing 393 order items (2 935 ks) with
  delivery dates from 2026-07-02 through 2026-08-15, so "Na skladě" in
  Sklad/Kegging/Bottling/Dashboard/Sklep overstated real physical stock by
  everything that had actually already shipped in that window.
- Separately, migration 20260816130000 already intended to drop the old
  `zavoz_deductions_unique_idx` (deduct_date, order_id, beer_id, package_id)
  in favor of the new per-order-item unique index, but that DROP never
  actually took effect on this database — the old index was still present
  and blocks any order with two separate line items for the same beer+obal
  (a normal, supported case elsewhere in the app).

2. Fix
- Drop the stale legacy index (superseded by `zavoz_deductions_order_item_unique_idx`).
- One-off backfill: process every distinct past effective delivery date that
  still has order items with no matching `zavoz_deductions` row, using the
  item's own real delivery date as `deduct_date` (not "today").
- Make `run_today_zavoz_deductions()` self-healing going forward: instead of
  only processing "today", it now processes every distinct missing effective
  date up to and including today. Safe to re-run — the existing advisory
  lock + unique `order_item_id` index still make each date's processing
  idempotent.
*/

DROP INDEX IF EXISTS public.zavoz_deductions_unique_idx;

-- One-off backfill of the historical gap.
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT DISTINCT eff FROM (
      SELECT COALESCE(
        o.delivery_date,
        date_trunc('week', o.order_date::timestamp)::date
          + CASE split_part(COALESCE(NULLIF(o.delivery_day, ''), 'pa'), '/', 1)
              WHEN 'po' THEN 0 WHEN 'ut' THEN 1 WHEN 'st' THEN 2 WHEN 'ct' THEN 3
              WHEN 'pa' THEN 4 WHEN 'so' THEN 5 WHEN 'ne' THEN 6 ELSE 4
            END
      ) AS eff
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.zavoz_deductions zd ON zd.order_item_id = oi.id
      WHERE o.status <> 'storno' AND oi.quantity > 0 AND zd.id IS NULL
    ) x
    WHERE eff <= current_date
    ORDER BY eff
  LOOP
    PERFORM public.process_zavoz_deductions_for_date(d);
  END LOOP;
END $$;

-- Self-healing version: catch up on ANY missing past date, not just today.
CREATE OR REPLACE FUNCTION public.run_today_zavoz_deductions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now timestamp := clock_timestamp() AT TIME ZONE 'Europe/Prague';
  local_today date := local_now::date;
  total_inserted integer := 0;
  d date;
BEGIN
  IF local_now::time < time '01:00' THEN
    RETURN 0;
  END IF;

  FOR d IN
    SELECT DISTINCT eff FROM (
      SELECT COALESCE(
        o.delivery_date,
        date_trunc('week', o.order_date::timestamp)::date
          + CASE split_part(COALESCE(NULLIF(o.delivery_day, ''), 'pa'), '/', 1)
              WHEN 'po' THEN 0 WHEN 'ut' THEN 1 WHEN 'st' THEN 2 WHEN 'ct' THEN 3
              WHEN 'pa' THEN 4 WHEN 'so' THEN 5 WHEN 'ne' THEN 6 ELSE 4
            END
      ) AS eff
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.zavoz_deductions zd ON zd.order_item_id = oi.id
      WHERE o.status <> 'storno' AND oi.quantity > 0 AND zd.id IS NULL
    ) x
    WHERE eff <= local_today
    ORDER BY eff
  LOOP
    total_inserted := total_inserted + public.process_zavoz_deductions_for_date(d);
  END LOOP;

  RETURN total_inserted;
END
$$;
