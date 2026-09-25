/*
# Uzavírání týdnů

Týdenní inventura (TydenniInventuraPanel) dosud jen počítala kusy po
položkách — nešlo nijak označit "tenhle týden jsem celý zkontroloval a
uzavírám ho". Tahle tabulka nese jen ten jeden fakt (kdy a kým byl týden
uzavřen); žádný zápis nikde jinde tím není omezený — jde jen o značku pro
přehled, ne o zámek.
*/

CREATE TABLE IF NOT EXISTS public.tydenni_uzaverky (
  tyden_od date PRIMARY KEY,
  uzavreno_at timestamptz NOT NULL DEFAULT now(),
  uzavreno_by text
);

ALTER TABLE public.tydenni_uzaverky ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tydenni_uzaverky_select" ON public.tydenni_uzaverky;
CREATE POLICY "tydenni_uzaverky_select" ON public.tydenni_uzaverky
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tydenni_uzaverky_insert" ON public.tydenni_uzaverky;
CREATE POLICY "tydenni_uzaverky_insert" ON public.tydenni_uzaverky
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tydenni_uzaverky_delete" ON public.tydenni_uzaverky;
CREATE POLICY "tydenni_uzaverky_delete" ON public.tydenni_uzaverky
  FOR DELETE TO authenticated USING (true);
