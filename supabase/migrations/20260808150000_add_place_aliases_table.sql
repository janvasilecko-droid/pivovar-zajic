/*
# Place aliases — učení se opravám odběratele (místa)

Když uživatel v aplikaci opraví odběratele, kterého AI/OCR rozpoznala špatně,
uloží se alias: špatný název (wrong_name) → správný odběratel (place_id +
correct_name). AI (edge funkce parse-order-text / whatsapp-auto-parse) i lokální
parser pak tento alias použijí při příštím parsování, aby místo poznaly správně.
*/

CREATE TABLE IF NOT EXISTS public.place_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrong_name text NOT NULL,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  correct_name text NOT NULL DEFAULT '',
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (wrong_name)
);

ALTER TABLE public.place_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_aliases_select" ON public.place_aliases;
CREATE POLICY "place_aliases_select" ON public.place_aliases
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "place_aliases_insert" ON public.place_aliases;
CREATE POLICY "place_aliases_insert" ON public.place_aliases
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "place_aliases_update" ON public.place_aliases;
CREATE POLICY "place_aliases_update" ON public.place_aliases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "place_aliases_delete" ON public.place_aliases;
CREATE POLICY "place_aliases_delete" ON public.place_aliases
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_place_aliases_wrong_name ON public.place_aliases(wrong_name);
