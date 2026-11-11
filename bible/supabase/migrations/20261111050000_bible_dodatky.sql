-- 📖 Pivovarská bible — dodatky k PDF pro rychlé otevření strany v appce.
--
-- Čtečka ukazuje stranu z originálu přes pdf.js a stahuje jen kousky souboru,
-- které potřebuje. U knih s „plochým" stromem stran (všechny strany pod jedním
-- uzlem — tak ukládá PDF spousta programů, hlavně skenery) ale pdf.js při
-- otevření čte slovník každé strany: na 40MB knize 22–26 MB a stovky dotazů,
-- než se strana ukáže. Worker proto ke knize postaví malý dodatek
-- (přírůstková aktualizace PDF s vyváženým stromem stran, pár kB,
-- scripts/bible/dodatek.py) a appka si ho přilepí za originál jen u sebe
-- v paměti (src/lib/biblePdf.ts). Originál v úložišti se nemění.
--
-- Řádek má i kniha, která dodatek nedostala (duvod: strom stačí, šifrované
-- PDF, nečistá struktura…) — worker ji pak nezkouší každý běh znovu. Smazáním
-- dokumentu zmizí i jeho dodatek. V dodatku je jen struktura PDF (uzly stromu
-- stran, kopie katalogu), žádný text knihy. Tabulka je pro prohlížeč
-- zavřená; appka dodatek dostane jen přes bible-api spolu s odkazem na soubor.
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádná data. Pustit podruhé nic nezmění.

CREATE TABLE IF NOT EXISTS public.bible_dodatky (
  dokument_id uuid PRIMARY KEY REFERENCES public.bible_dokumenty(id) ON DELETE CASCADE,
  -- Verze stavby (dodatek.VERZE): nová verze postaví dodatky znovu.
  verze integer NOT NULL CHECK (verze >= 1),
  -- Dodatek platí jen za soubor přesně téhle délky (appka ji porovná s úložištěm).
  delka_originalu bigint NOT NULL CHECK (delka_originalu > 0),
  data bytea CHECK (data IS NULL OR octet_length(data) BETWEEN 16 AND 2000000),
  -- Proč dodatek není (seznam DUVODY v scripts/bible/dodatek.py).
  duvod text CHECK (duvod IN ('strom_staci', 'sifrovane', 'struktura', 'kontrola', 'velky', 'rozsah', 'chyba')),
  stran integer CHECK (stran IS NULL OR stran > 0),
  -- Kolik 64kB kousků originálu pdf.js načte při otevření bez dodatku a s ním.
  kusu_pred integer CHECK (kusu_pred IS NULL OR kusu_pred >= 0),
  kusu_po integer CHECK (kusu_po IS NULL OR kusu_po >= 0),
  vytvoreno_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((data IS NULL) <> (duvod IS NULL))
);

ALTER TABLE public.bible_dodatky ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_dodatky FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_dodatky TO service_role;

-- Zpracované PDF, kterým dodatek chybí nebo je ze starší verze stavby.
-- Worker je doplňuje čtením jen malých kousků souboru; krok „Čeká něco?"
-- v GitHub Actions se ptá, jestli nějaké jsou (jen id, žádný obsah).
CREATE OR REPLACE FUNCTION public.bible_bez_dodatku(p_verze integer, p_limit integer DEFAULT 25)
RETURNS TABLE (id uuid, soubor_cesta text, soubor_velikost bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT d.id, d.soubor_cesta, d.soubor_velikost
    FROM public.bible_dokumenty d
   WHERE d.stav IN ('hotovo', 'ke_kontrole')
     AND d.soubor_mime = 'application/pdf'
     AND d.soubor_velikost > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.bible_dodatky x
        WHERE x.dokument_id = d.id AND x.verze >= coalesce(p_verze, 1)
     )
   ORDER BY d.created_at DESC, d.id
   LIMIT least(greatest(coalesce(p_limit, 25), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.bible_bez_dodatku(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bible_bez_dodatku(integer, integer) TO service_role;
