-- 📖 Pivovarská bible — český překlad názvů kapitol.
--
-- Majitel 3. 11. 2026: „je to anglicky, musí tam být i překlad do češtiny"
-- a 4. 11.: „ať je to funkční jak má". Strany jsou přeložené
-- (20261103000000_bible_preklad), obsah knihy (názvy kapitol) zatím ne.
-- Worker (scripts/bible/kapitoly_preklad.py) doplní nazev_cs; prázdný řetězec
-- = kniha překlad nepotřebuje (česká). Kapitoly vznikají znovu při každém
-- zpracování knihy, s nimi i překlad — nic se nepřepisuje potichu.
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih.

ALTER TABLE public.bible_kapitoly ADD COLUMN IF NOT EXISTS nazev_cs text;
CREATE INDEX IF NOT EXISTS bible_kapitoly_bez_prekladu_idx ON public.bible_kapitoly (dokument_id) WHERE nazev_cs IS NULL;

-- Zápis přeložených názvů po dávkách (jen UPDATE — kapitolu smazanou novým
-- zpracováním nevzkřísí). Vrátí počet zapsaných.
CREATE OR REPLACE FUNCTION public.bible_kapitoly_nazvy(p_id uuid[], p_nazvy text[])
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH z AS (
    UPDATE public.bible_kapitoly k SET nazev_cs = left(v.n, 300)
      FROM unnest(p_id, p_nazvy) AS v(id, n)
     WHERE k.id = v.id AND k.nazev_cs IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM z
$$;

-- Česká kniha: názvy kapitol se nepřekládají (prázdný řetězec = „nepotřebuje").
CREATE OR REPLACE FUNCTION public.bible_kapitoly_bez_prekladu(p_dokument uuid)
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH z AS (
    UPDATE public.bible_kapitoly SET nazev_cs = ''
     WHERE dokument_id = p_dokument AND nazev_cs IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM z
$$;

-- Hledání ukáže český název kapitoly (jinak původní).
CREATE OR REPLACE FUNCTION public.bible_hledej(p_dotaz text, p_dokument uuid DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE (
  dokument_id uuid, nazev text, autor text, rok integer, jazyk text,
  zdroj text, pdf_index integer, tistena_strana text, kapitola text, druh text, text text, skore real
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH q AS (SELECT public.bible_dotaz(p_dotaz) AS q),
  n AS (SELECT LEAST(GREATEST(coalesce(p_limit, 40), 1), 100) AS n),
  citelne AS (
    SELECT d.id FROM public.bible_dokumenty d
     WHERE d.stav IN ('hotovo', 'ke_kontrole') AND (p_dokument IS NULL OR d.id = p_dokument)
  ),
  nalezy AS (
    (SELECT p.dokument_id, 'original'::text AS zdroj, p.strana_od AS pdf_index, p.kapitola_id, p.druh, p.text,
            ts_rank(p.hledani, q.q) AS skore
       FROM public.bible_pasaze p, q
      WHERE q.q IS NOT NULL AND p.hledani @@ q.q AND p.dokument_id IN (SELECT id FROM citelne)
      ORDER BY skore DESC LIMIT (SELECT n FROM n))
    UNION ALL
    (SELECT s.dokument_id, 'preklad'::text, s.pdf_index, s.kapitola_id, 'text'::text, s.preklad,
            ts_rank(s.preklad_hledani, q.q)
       FROM public.bible_strany s, q
      WHERE q.q IS NOT NULL AND s.preklad_platny AND s.preklad <> '' AND s.preklad_hledani @@ q.q
        AND s.dokument_id IN (SELECT id FROM citelne)
      ORDER BY 7 DESC LIMIT (SELECT n FROM n))
  )
  SELECT x.dokument_id, d.nazev, d.autor, d.rok, d.jazyk,
         x.zdroj, x.pdf_index, s.tistena_strana, coalesce(nullif(k.nazev_cs, ''), k.nazev), x.druh, x.text, x.skore
    FROM nalezy x
    JOIN public.bible_dokumenty d ON d.id = x.dokument_id
    LEFT JOIN public.bible_strany s ON s.dokument_id = x.dokument_id AND s.pdf_index = x.pdf_index
    LEFT JOIN public.bible_kapitoly k ON k.id = x.kapitola_id
   ORDER BY x.skore DESC, d.nazev, x.pdf_index
   LIMIT (SELECT n FROM n)
$$;

REVOKE ALL ON FUNCTION public.bible_kapitoly_nazvy(uuid[], text[]), public.bible_kapitoly_bez_prekladu(uuid),
  public.bible_hledej(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bible_kapitoly_nazvy(uuid[], text[]), public.bible_kapitoly_bez_prekladu(uuid),
  public.bible_hledej(text, uuid, integer) TO service_role;
