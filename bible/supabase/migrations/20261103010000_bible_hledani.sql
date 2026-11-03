-- 🔎 Pivovarská bible — hledání v knihách (etapa 4, bez AI).
--
-- Majitel 3. 11. 2026: „po překladu pokračuj automaticky v bibli a chatbotovi"
-- a k chatbotu „Zatím jen hledání". Hledá se fulltextem bez diakritiky:
--   * v pasážích originálu (bible_pasaze.hledani — čeština, němčina, angličtina);
--   * v českém překladu stran (bible_strany.preklad, 20261103000000_bible_preklad),
--     takže česká otázka najde i anglickou knihu.
-- Slova dotazu se hledají jako předpony („amyl" najde amylázu i Amylase),
-- všechna musí být v jedné pasáži / straně. Čte se jen zpracovaná kniha
-- (hotovo / ke_kontrole), překlad jen platný.
--
-- Volá jen bible-api (service role) po ověření přístupu v hlavním projektu.
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih.

ALTER TABLE public.bible_strany
  ADD COLUMN IF NOT EXISTS preklad_hledani tsvector
    GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, public.bible_bez_diakritiky(coalesce(preklad, '')))) STORED;
CREATE INDEX IF NOT EXISTS bible_strany_preklad_hledani_idx ON public.bible_strany USING gin (preklad_hledani);

-- Dotaz → tsquery: slova bez diakritiky malými písmeny, každé jako předpona,
-- všechna povinná. Jen písmena a číslice (žádná syntaxe tsquery od uživatele),
-- nejvýš 8 slov; nic použitelného → NULL (nic se nenajde).
CREATE OR REPLACE FUNCTION public.bible_dotaz(p_dotaz text)
RETURNS tsquery
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL
              ELSE string_agg(slovo || ':*', ' & ' ORDER BY poradi)::tsquery END
    FROM (
      SELECT slovo, poradi
        FROM regexp_split_to_table(lower(public.bible_bez_diakritiky(coalesce(p_dotaz, ''))), '[^a-z0-9]+')
             WITH ORDINALITY AS t(slovo, poradi)
       WHERE length(slovo) >= 2 OR slovo ~ '^[0-9]$'
       ORDER BY poradi
       LIMIT 8
    ) s
$$;

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
         x.zdroj, x.pdf_index, s.tistena_strana, k.nazev, x.druh, x.text, x.skore
    FROM nalezy x
    JOIN public.bible_dokumenty d ON d.id = x.dokument_id
    LEFT JOIN public.bible_strany s ON s.dokument_id = x.dokument_id AND s.pdf_index = x.pdf_index
    LEFT JOIN public.bible_kapitoly k ON k.id = x.kapitola_id
   ORDER BY x.skore DESC, d.nazev, x.pdf_index
   LIMIT (SELECT n FROM n)
$$;

REVOKE ALL ON FUNCTION public.bible_dotaz(text), public.bible_hledej(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bible_dotaz(text), public.bible_hledej(text, uuid, integer) TO service_role;
