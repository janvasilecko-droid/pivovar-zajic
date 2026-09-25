/*
# Ignorované páry podezřelých duplicit odběratelů

Audit 16.–17. 9. 2026 upozornil na několik odběratelů se skoro stejným
jménem/adresou (Malenovice/Malenovoce, Zizkov/Ma Zizkov...) — ale automatické
sloučení je nebezpečné (16. 9. 2026 navržený merge "petr" + "Petr moravcik
prodejna" by spojil DVA různé reálné lidi). Appka proto jen NABÍZÍ podezřelé
páry k ruční kontrole (viz PlacesScreen) a obsluha sama řekne "sloučit" nebo
"nechat" — tahle tabulka pamatuje páry označené jako "nejsou duplicita", ať
appka příště neotravuje se stejným párem znovu.
*/

CREATE TABLE IF NOT EXISTS public.mista_duplicity_ignorovano (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id_a uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  place_id_b uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.mista_duplicity_ignorovano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mista_duplicity_ignorovano_select" ON public.mista_duplicity_ignorovano;
CREATE POLICY "mista_duplicity_ignorovano_select" ON public.mista_duplicity_ignorovano
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mista_duplicity_ignorovano_insert" ON public.mista_duplicity_ignorovano;
CREATE POLICY "mista_duplicity_ignorovano_insert" ON public.mista_duplicity_ignorovano
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mista_duplicity_ignorovano_delete" ON public.mista_duplicity_ignorovano;
CREATE POLICY "mista_duplicity_ignorovano_delete" ON public.mista_duplicity_ignorovano
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mista_duplicity_ignorovano_a ON public.mista_duplicity_ignorovano(place_id_a);
CREATE INDEX IF NOT EXISTS idx_mista_duplicity_ignorovano_b ON public.mista_duplicity_ignorovano(place_id_b);
