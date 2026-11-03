-- 📚 Pivovarská bible — český překlad stran.
--
-- Majitel 3. 11. 2026: „je to anglicky, musí tam být i překlad do češtiny".
-- Worker (scripts/bible/preklad.py) po zpracování knihy přeloží každou stranu
-- cizojazyčné knihy do češtiny přes Claude (předplatné, ne kredit) a uloží
-- překlad vedle originálu. Čtení v appce ukáže češtinu, originál jedním
-- klepnutím (čísla a tabulky se ověřují v originále).
--
-- Překlad patří ke konkrétnímu textu strany: preklad_zdroj = md5 textu, ze
-- kterého vznikl. Když se strana zpracuje znovu a text se změní, překlad
-- přestane platit (preklad_platny = false) — appka ho neukáže a worker stranu
-- přeloží znovu. Nic se nemaže ani nepřepisuje potichu.
--
-- Jen projekt bible (bible/supabase/migrations). Spouští majitel v appce:
-- Systém → Databázové migrace → Databáze bible. SQL je veřejné — žádný obsah knih.

ALTER TABLE public.bible_strany
  ADD COLUMN IF NOT EXISTS preklad text,
  ADD COLUMN IF NOT EXISTS preklad_zdroj text,
  ADD COLUMN IF NOT EXISTS preklad_model text,
  ADD COLUMN IF NOT EXISTS preklad_verze text,
  -- Důvod, proč překlad ověřit v originále (čísla v překladu nesedí s originálem…); null = v pořádku.
  ADD COLUMN IF NOT EXISTS preklad_kontrola text,
  ADD COLUMN IF NOT EXISTS prelozeno timestamptz;

ALTER TABLE public.bible_strany
  ADD COLUMN IF NOT EXISTS preklad_platny boolean
    GENERATED ALWAYS AS (preklad IS NOT NULL AND preklad_zdroj IS NOT DISTINCT FROM md5(text)) STORED;

-- Strany čekající na překlad (worker je hledá po dokumentech).
CREATE INDEX IF NOT EXISTS bible_strany_bez_prekladu_idx
  ON public.bible_strany (dokument_id, pdf_index) WHERE NOT preklad_platny;

INSERT INTO public.bible_nastaveni (klic, hodnota, popis) VALUES
  ('preklad_zapnuty', 'true', 'Překládat strany cizojazyčných knih do češtiny (false = nepřekládat).'),
  ('model_prekladu', '"claude-sonnet-5-5"', 'Model, který překládá strany do češtiny (odborné názvosloví — Sonnet; levnější claude-haiku-5-5).')
ON CONFLICT (klic) DO NOTHING;
