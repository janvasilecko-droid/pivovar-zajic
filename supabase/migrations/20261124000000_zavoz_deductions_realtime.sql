/*
# Add zavoz_deductions to the realtime publication

`zavoz_deductions` was never added to `supabase_realtime`, so every screen
that calls `useRealtime([..., 'zavoz_deductions'], load)` (Stock, Kegging,
BottlingScreen, Dashboard, Cellar) silently never received live updates when
the nightly/hourly auto-deduction job inserted new rows — users had to
manually reload the page to see the corrected stock numbers.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'zavoz_deductions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.zavoz_deductions;
  END IF;
END $$;
