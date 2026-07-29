/*
# Add per-item prepared flag to order_items

1. Modified Tables
- `order_items`
  - Add `is_prepared` boolean NOT NULL DEFAULT false
    Allows the driver (závozník) to tick off each item individually in the Závoz screen.
    When all items of an order are ticked, the order's `is_prepared` flag is set automatically.

2. Security
- No new tables; existing order_items RLS policies cover the new column.
*/

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_prepared boolean NOT NULL DEFAULT false;
