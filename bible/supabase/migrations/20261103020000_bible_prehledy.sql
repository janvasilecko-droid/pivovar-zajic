-- 📝 Pivovarská bible — přehledy témat s odkazy na knihy.
--
-- Majitel 3. 11. 2026: „když zadám chmelovar, vyhledáš data z těch knih,
-- porovnáš je a napíšeš to nejlepší o chmelovaru", „s tím, že tam budou odkazy
-- na knihy" a „až budou načteny všechny knihy a přeloženy, případně pokud se
-- načte nová kniha, tak to doplnit o nová fakta".
--
-- Přehledy píše worker na pozadí (scripts/bible/prehledy.py, Claude přes
-- předplatné) až když nic nečeká na zpracování ani překlad. Přehled se přepíše,
-- jen když se změnily jeho zdroje (otisk) — nová kniha nebo překlad.
-- zdroje = citace [n] → kniha a list (bez textu knihy); text přehledu je
-- odvozený text s citacemi, ne opis knihy.
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih.

CREATE TABLE IF NOT EXISTS public.bible_prehledy (
  klic text PRIMARY KEY CHECK (klic ~ '^[a-z0-9_]{1,40}$'),
  nazev text NOT NULL,
  oblast text CHECK (oblast IS NULL OR oblast ~ '^[A-T]$'),
  poradi integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  -- [{n, dokument_id, nazev, pdf_index, tistena_strana, kapitola, zdroj}]
  zdroje jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Důvod ověřit (čísla mimo zdroje, odstraněné citace); null = v pořádku.
  kontrola text,
  model text,
  verze text,
  otisk text NOT NULL,
  vytvoreno timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bible_prehledy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_prehledy FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_prehledy TO service_role;

INSERT INTO public.bible_nastaveni (klic, hodnota, popis) VALUES
  ('prehledy_zapnute', 'true', 'Psát přehledy témat z knih (false = nepsat).'),
  ('model_prehledu', '"claude-opus-5-5"', 'Model, který porovná knihy a napíše přehled tématu.'),
  ('prehledy_aktualni', 'false', 'Stav pro plánovaný běh: false = přehledy je potřeba projít (nová kniha, překlad); zapisuje worker.')
ON CONFLICT (klic) DO NOTHING;
