/*
# Prevent duplicate places (case-insensitive name)

1. Purpose
   Ensure that two places with the same name (ignoring case) can never be
   created. The frontend already dedups using a normalized comparison, but a
   database constraint is the last line of defense against races and stray
   inserts (e.g. from edge functions or image imports).

2. Changes
   - Add a unique index on the lowercased name:
       CREATE UNIQUE INDEX places_name_lower_uniq ON places (lower(name));
   - Idempotent: uses IF NOT EXISTS.

3. Notes
   - No existing duplicates (verified before applying).
   - No data is changed or deleted.
*/

CREATE UNIQUE INDEX IF NOT EXISTS places_name_lower_uniq
  ON places (lower(btrim(name)));
