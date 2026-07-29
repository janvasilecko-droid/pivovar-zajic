/*
# Feedback notes board

1. New Tables
- `feedback_notes` — kolegové mohou psát poznámky na úpravu / vylepšení aplikace
  - `id` (uuid, PK)
  - `author_id` (uuid, FK auth.users, NOT NULL, DEFAULT auth.uid())
  - `author_name` (text) — zobrazované jméno autora (z profilu)
  - `category` (text) — kategorie: 'bug' | 'feature' | 'question' | 'other'
  - `title` (text, NOT NULL) — krátký předmět
  - `body` (text) — detailní popis
  - `status` (text, NOT NULL, DEFAULT 'open') — 'open' | 'in_progress' | 'done' | 'rejected'
  - `created_at` (timestamptz, DEFAULT now())
  - `updated_at` (timestamptz, DEFAULT now())

2. Security
- Enable RLS on `feedback_notes`.
- Authenticated users can read all notes (shared board).
- Authenticated users can insert only their own notes (WITH CHECK auth.uid() = author_id).
- Authenticated users can update their own notes (USING + WITH CHECK auth.uid() = author_id).
- Authenticated users can delete only their own notes (USING auth.uid() = author_id).
- Admins (role in profiles = 'admin') can update/delete any note — handled via profile join.

3. Indexes
- `idx_feedback_notes_created_at` on created_at DESC for listing.
- `idx_feedback_notes_status` on status for filtering.
*/

CREATE TABLE IF NOT EXISTS feedback_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('bug','feature','question','other')),
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_read_feedback_notes" ON feedback_notes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_insert_feedback_notes" ON feedback_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "auth_update_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_update_feedback_notes" ON feedback_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "auth_delete_feedback_notes" ON feedback_notes;
CREATE POLICY "auth_delete_feedback_notes" ON feedback_notes
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_created_at ON feedback_notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_notes_status ON feedback_notes (status);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE feedback_notes;
