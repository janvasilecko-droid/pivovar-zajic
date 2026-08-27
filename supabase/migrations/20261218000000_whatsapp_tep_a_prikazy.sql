-- Tep mostu a prikazy pro most.
--
-- Proc tep: most bezi na Renderu na bezplatnem planu, ktery instanci po
-- ~15 minutach necinnosti USPI. Spici most nema otevrene spojeni s WhatsAppem,
-- takze zpravy poslane mezitim se ZIVE nedorucí — dojdou az pri dalsim
-- probuzeni pres dopocteni historie. Presne odtud pochazi „na WhatsAppu je 12
-- zprav, v aplikaci 11".
--
-- Bez tepu to nejde odlisit od stavu „nikdo nic neposlal" — obojí vypada
-- stejne: v databazi nic. S tepem je videt „most se naposledy ozval pred
-- 4 hodinami", coz uz je jednoznacna odpoved.
--
-- Proc prikazy: aplikace potrebuje umet rict „srovnej se s WhatsAppem" bez
-- toho, aby na most volala primo. Volat ho z prohlizece znamena resit CORS,
-- tajemstvi v klientovi a hlavne to, ze spici instance neodpovi. Takhle se
-- prikaz jen zapise do tabulky a most si ho vyzvedne, az bezi.

CREATE TABLE IF NOT EXISTS public.whatsapp_most_stav (
  id text PRIMARY KEY DEFAULT 'most',
  -- Kdy se most naposledy ozval. Starsi nez par minut = nebezi.
  naposledy timestamptz NOT NULL DEFAULT now(),
  -- Ma otevrene spojeni s WhatsAppem? Bezici proces jeste neznamena spojeni.
  pripojeno boolean NOT NULL DEFAULT false,
  verze text,
  poznamka text
);

INSERT INTO public.whatsapp_most_stav (id, naposledy, pripojeno, poznamka)
VALUES ('most', now() - interval '1 day', false, 'zatim se neozval')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_most_stav ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_most_stav" ON public.whatsapp_most_stav;
CREATE POLICY "auth_read_most_stav" ON public.whatsapp_most_stav
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_most_stav" ON public.whatsapp_most_stav;
CREATE POLICY "service_write_most_stav" ON public.whatsapp_most_stav
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_prikazy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Zatim jediny prikaz: 'srovnat' = znovu se pripojit a nechat si poslat
  -- historii skupiny, cimz se chybejici zpravy dozenou (dedup podle key.id
  -- zabrani duplicitam).
  prikaz text NOT NULL,
  stav text NOT NULL DEFAULT 'ceka',   -- 'ceka' | 'bezi' | 'hotovo' | 'chyba'
  zadal text,
  vysledek text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_prikazy_prikaz_chk CHECK (prikaz IN ('srovnat')),
  CONSTRAINT whatsapp_prikazy_stav_chk CHECK (stav IN ('ceka', 'bezi', 'hotovo', 'chyba'))
);

CREATE INDEX IF NOT EXISTS whatsapp_prikazy_ceka_idx
  ON public.whatsapp_prikazy (created_at) WHERE stav = 'ceka';

ALTER TABLE public.whatsapp_prikazy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_prikazy" ON public.whatsapp_prikazy;
CREATE POLICY "auth_read_prikazy" ON public.whatsapp_prikazy
  FOR SELECT TO authenticated USING (true);

-- Zadat smi prihlaseny uzivatel, ale JEN prikaz 'srovnat' a jen ve stavu
-- 'ceka'. Nic destruktivniho to nedela (most se jen znovu pripoji), zapisovat
-- si sem ale vlastni stavy nema nikdo duvod.
DROP POLICY IF EXISTS "auth_insert_prikazy" ON public.whatsapp_prikazy;
CREATE POLICY "auth_insert_prikazy" ON public.whatsapp_prikazy
  FOR INSERT TO authenticated WITH CHECK (prikaz = 'srovnat' AND stav = 'ceka');

DROP POLICY IF EXISTS "service_all_prikazy" ON public.whatsapp_prikazy;
CREATE POLICY "service_all_prikazy" ON public.whatsapp_prikazy
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_most_stav;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'whatsapp_most_stav uz v publikaci: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_prikazy;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'whatsapp_prikazy uz v publikaci: %', SQLERRM;
END $$;
-- Most si sam zapise svoji verejnou adresu (Render ji dava v RENDER_EXTERNAL_URL).
-- Diky tomu ji aplikace nemusi mit nakonfigurovanou a muze spici instanci
-- probudit obycejnym pingem, nez zada prikaz k srovnani.
ALTER TABLE public.whatsapp_most_stav ADD COLUMN IF NOT EXISTS url text;
