/*
# Add delivery_date to orders + auto calendar reminder

1. Modified Tables
- `orders` — new nullable column `delivery_date` (date). Concrete delivery date
  (complements the existing `delivery_day` day-of-week field). Allows scheduling
  a delivery on a specific calendar date, not just "Po/Út/St...".

2. New Functions / Triggers
- `sync_order_delivery_reminder()` — trigger function that runs AFTER INSERT or
  UPDATE of `delivery_date` on `orders`. When a delivery_date is set, it creates
  (or replaces) a `calendar_events` row dated `delivery_date - 3 days` with
  `reminder = true`, `reminder_time = '08:45'`, `color = 'accent'`, and a title
  like "Upomínka: dodání pro <place_name> <delivery_date>". When delivery_date
  is cleared, the linked reminder is deleted. The reminder rows are tagged via
  the `description` field with the prefix `order:<order_id>` so the trigger can
  find and update/remove them across re-runs.

3. Security
- No new tables; RLS already enabled on `orders` and `calendar_events`.
- The trigger function runs as SECURITY DEFINER so it can write to
  `calendar_events` regardless of the calling role; it only touches rows it
  itself created (matched by the `order:<id>` tag in description).

4. Notes
- Idempotent: uses `DO $$ ... IF NOT EXISTS ... END $$` for the column add.
- The trigger drops & recreates the linked reminder on every delivery_date
  change so the reminder date always tracks the current delivery_date.
*/

-- 1. Add delivery_date column to orders (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_date'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_date date;
  END IF;
END $$;

-- 2. Trigger function: keep a calendar reminder in sync with orders.delivery_date
CREATE OR REPLACE FUNCTION public.sync_order_delivery_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reminder_date date;
  ev_id uuid;
  title text;
  tag text;
BEGIN
  tag := 'order:' || NEW.id;

  -- Always remove any previously linked reminder for this order first
  DELETE FROM calendar_events
  WHERE description = tag
     OR description LIKE tag || ':%';

  IF NEW.delivery_date IS NOT NULL THEN
    reminder_date := NEW.delivery_date - interval '3 days';
    title := 'Upomínka: dodání pro ' || COALESCE(NEW.place_name, '—') || ' ' || to_char(NEW.delivery_date, 'DD.MM.YYYY');

    INSERT INTO calendar_events (event_date, title, description, reminder, reminder_time, color)
    VALUES (reminder_date, title, tag, true, '08:45', 'accent');
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger to orders (idempotent)
DROP TRIGGER IF EXISTS trg_order_delivery_reminder ON orders;
CREATE TRIGGER trg_order_delivery_reminder
  AFTER INSERT OR UPDATE OF delivery_date ON orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_delivery_reminder();

-- 4. Backfill reminders for any existing orders that already have a delivery_date
INSERT INTO calendar_events (event_date, title, description, reminder, reminder_time, color)
SELECT
  o.delivery_date - interval '3 days',
  'Upomínka: dodání pro ' || COALESCE(o.place_name, '—') || ' ' || to_char(o.delivery_date, 'DD.MM.YYYY'),
  'order:' || o.id,
  true,
  '08:45',
  'accent'
FROM orders o
WHERE o.delivery_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.description = 'order:' || o.id
  );
