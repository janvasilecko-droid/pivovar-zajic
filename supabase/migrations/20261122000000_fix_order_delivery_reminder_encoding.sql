/*
# Fix mangled diacritics in order delivery reminders

1. Problem
- The trigger function `sync_order_delivery_reminder()` (added in
  20260719174856_add_order_delivery_date_and_reminder.sql) got applied to the
  live database with its Czech string literal double-mis-encoded (UTF-8 bytes
  read as Windows-1250), so every auto-generated reminder title reads like
  "UpomĂ­nka: dodĂˇnĂ­ pro X" instead of "Upomínka: dodání pro X". The migration
  file itself is correct UTF-8 — only the compiled function body in the
  database was corrupted when it was originally applied.

2. Fix
- Re-create the trigger function with the same logic, forcing a clean UTF-8
  literal.
- Backfill already-corrupted `calendar_events` rows created by this trigger
  (tagged `description = 'order:<order_id>'`) by recomputing their title from
  the linked order's current `place_name` + `delivery_date`.
*/

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

-- Backfill: recompute the title of already-created reminders from their linked order
UPDATE calendar_events ce
SET title = 'Upomínka: dodání pro ' || COALESCE(o.place_name, '—') || ' ' || to_char(o.delivery_date, 'DD.MM.YYYY')
FROM orders o
WHERE ce.description = 'order:' || o.id
  AND o.delivery_date IS NOT NULL;

-- Backfill (orphans): reminders whose linked order was since deleted can't be
-- recomputed from `orders`, but only the hardcoded literal prefix was ever
-- corrupted — the interpolated place name/date were always inserted correctly.
-- Fix just that prefix, leaving the rest of the title untouched.
UPDATE calendar_events
SET title = replace(title, 'UpomĂ­nka: dodĂˇnĂ­ pro ', 'Upomínka: dodání pro ')
WHERE title LIKE 'UpomĂ%';
