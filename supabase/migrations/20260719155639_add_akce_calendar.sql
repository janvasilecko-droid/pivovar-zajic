/*
# Add Akce (events) and Calendar

1. New Tables
- `akce` — events/outings where beer is taken from stock and possibly returned
  - id (uuid pk), entry_date (date), name (text), who (text), beer_id (fk beers),
    package_id (fk packages), quantity_taken (int), quantity_returned (int default 0),
    note (text), created_at (timestamptz)
- `calendar_events` — calendar notes & reminders
  - id (uuid pk), event_date (date), title (text), description (text),
    reminder (boolean default false), reminder_time (time, nullable),
    color (text default 'primary'), created_by (text nullable), created_at (timestamptz)

2. Security
- RLS enabled on both new tables.
- Authenticated users can CRUD both tables (shared brewery data).

3. Notes
- Akce beer taken subtracts from stock like fasovani/bottling; returned adds back.
*/

CREATE TABLE IF NOT EXISTS akce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  name text NOT NULL,
  who text,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  package_label text,
  quantity_taken integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE akce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_akce" ON akce;
CREATE POLICY "select_own_akce" ON akce FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_akce" ON akce;
CREATE POLICY "insert_own_akce" ON akce FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_akce" ON akce;
CREATE POLICY "update_own_akce" ON akce FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_akce" ON akce;
CREATE POLICY "delete_own_akce" ON akce FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_akce_date ON akce(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_akce_beer ON akce(beer_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  title text NOT NULL,
  description text,
  reminder boolean NOT NULL DEFAULT false,
  reminder_time time,
  color text NOT NULL DEFAULT 'primary',
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calendar" ON calendar_events;
CREATE POLICY "select_own_calendar" ON calendar_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_calendar" ON calendar_events;
CREATE POLICY "insert_own_calendar" ON calendar_events FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_calendar" ON calendar_events;
CREATE POLICY "update_own_calendar" ON calendar_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_own_calendar" ON calendar_events;
CREATE POLICY "delete_own_calendar" ON calendar_events FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date);
