/*
# Backfill places from orders with place_name but no place_id

1. Purpose
   Historically, orders could be created with a free-form `place_name` but no
   linked `place_id` (the customer was typed but never saved as a Place). These
   customers never appeared in the Odběratelé catalog. This migration backfills
   the `places` table for every distinct such name and links the orders.

2. Changes
   - For each distinct non-null `place_name` on orders with `place_id IS NULL`:
     - If a place with a matching name already exists, reuse it.
     - Otherwise insert a new place with that name.
   - Update all orders with that `place_name` and `place_id IS NULL` to point
     to the resolved place.

3. Notes
   - Idempotent: re-running is safe (only touches orders still missing place_id).
   - No data is deleted or renamed.
*/

DO $$
DECLARE
  r RECORD;
  v_place_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT place_name FROM orders WHERE place_id IS NULL AND place_name IS NOT NULL AND btrim(place_name) <> '' LOOP
    SELECT id INTO v_place_id FROM places WHERE lower(name) = lower(r.place_name) LIMIT 1;
    IF v_place_id IS NULL THEN
      INSERT INTO places (name) VALUES (r.place_name) RETURNING id INTO v_place_id;
    END IF;
    UPDATE orders SET place_id = v_place_id WHERE place_id IS NULL AND place_name = r.place_name;
  END LOOP;
END $$;
