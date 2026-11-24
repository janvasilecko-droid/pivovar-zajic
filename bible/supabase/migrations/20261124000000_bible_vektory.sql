-- 🧭 Pivovarská bible — vektorové hledání (pgvector): hledání podle významu.
--
-- Majitel 24. 11. 2026 (zadání RAG chatbota): „vytvoření embeddings a uložení do vektorové
-- databáze“ a „má to být plnohodnotný chatbot podle promptu“. Dosavadní hledání (slova, odborné
-- varianty cs/de/en, filtry) zůstává; vektory k němu přidávají hledání podle významu — česká
-- otázka najde i německou nebo anglickou pasáž, ve které se žádné její slovo nevyskytuje.
-- Výsledky obou hledání spojuje chat (RRF) v edge funkci, ne tady.
--
-- Co migrace přidává:
--   * rozšíření pgvector (schéma extensions, jako v Supabase);
--   * tabulku bible_vektory: jeden vektor (halfvec, 1024 čísel = 2 kB) na pasáž a model;
--     HNSW index nad kosinovou vzdáleností. Vektory se dají kdykoli přepočítat z pasáží,
--     proto se nezálohují (odvozená data, jako bible_pasaze);
--   * bible_vektory_chybi — pasáže čekající na vektor (worker, scripts/bible/vektory.py);
--   * bible_vektory_stav — kolik pasáží vektor má (appka a krok „Čeká něco?" v Actions);
--   * bible_hledej_vektor — nejbližší pasáže k vektoru dotazu; stejné sloupce jako bible_hledej_v;
--   * cenu embeddingů v ceníku (bible_nastaveni.cenik_usd_za_mtok), ať se náklady evidují
--     a nezapisují jako nula (model bez ceníku je chyba, ne nula).
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace → Databáze bible.
-- Vektory počítá worker (GitHub Actions) a edge funkce při hledání přes klíč OpenAI z app_secrets
-- hlavní appky; bez klíče a bez vektorů hledání funguje jako dřív. SQL je veřejné — žádná data
-- a žádný text knih. Pustit podruhé nic nezmění.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.bible_vektory (
  pasaz_id uuid NOT NULL REFERENCES public.bible_pasaze(id) ON DELETE CASCADE,
  -- Který model vektor spočítal (OpenAI text-embedding-3-large, 1024 čísel). Jiná velikost
  -- vektoru = nová tabulka v nové migraci (sloupec má pevnou velikost).
  model_key text NOT NULL CHECK (length(model_key) BETWEEN 1 AND 100),
  embedding extensions.halfvec(1024) NOT NULL,
  vytvoreno_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pasaz_id, model_key)
);

CREATE INDEX IF NOT EXISTS bible_vektory_hnsw_idx
  ON public.bible_vektory USING hnsw (embedding extensions.halfvec_cosine_ops);

ALTER TABLE public.bible_vektory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_vektory FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_vektory TO service_role;

-- Pasáže čitelných dokumentů, které ještě nemají vektor od daného modelu (nejstarší první); p_krome jsou pasáže,
-- které se v tomhle běhu nepodařilo převést (vadný vstup) a nemají se vyžadovat znovu.
-- Vrací text pasáže: volá ji jen worker se service rolí; do logu se text nikdy nepíše.
CREATE OR REPLACE FUNCTION public.bible_vektory_chybi(p_model text, p_limit integer DEFAULT 64, p_krome uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, text text, kontext text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p.id, p.text, p.kontext
    FROM public.bible_pasaze p
    JOIN public.bible_dokumenty d ON d.id = p.dokument_id
   WHERE d.stav IN ('hotovo', 'ke_kontrole')
     AND NOT EXISTS (SELECT 1 FROM public.bible_vektory v WHERE v.pasaz_id = p.id AND v.model_key = p_model)
     AND (p_krome IS NULL OR p.id <> ALL (p_krome))
   ORDER BY p.created_at, p.id
   LIMIT least(greatest(coalesce(p_limit, 64), 1), 500);
$$;

-- Kolik pasáží čitelných dokumentů má vektor od daného modelu (jen počty).
CREATE OR REPLACE FUNCTION public.bible_vektory_stav(p_model text)
RETURNS TABLE (pasazi bigint, s_vektorem bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*), count(v.pasaz_id)
    FROM public.bible_pasaze p
    JOIN public.bible_dokumenty d ON d.id = p.dokument_id
    LEFT JOIN public.bible_vektory v ON v.pasaz_id = p.id AND v.model_key = p_model
   WHERE d.stav IN ('hotovo', 'ke_kontrole');
$$;

-- Hledání podle významu: nejbližší pasáže (kosinová vzdálenost) k vektoru dotazu, jen v čitelných
-- dokumentech a s týmiž filtry jako bible_hledej_v (kniha, autor, rok, jazyk, druh, oblast).
-- skore = 1 − vzdálenost (čím víc, tím blíž). Bez filtru jde přes HNSW index (bere víc kandidátů,
-- než kolik se vrací, protože se pak ještě vyřadí nečitelné dokumenty); s filtrem se přesně
-- spočítají jen vektory vybraných knih — index by filtr uplatnil až po výběru kandidátů a vrátil by míň.
-- Funkce není STABLE, protože si v transakci nastaví hnsw.ef_search (počet kandidátů indexu).
CREATE OR REPLACE FUNCTION public.bible_hledej_vektor(
  p_vektor extensions.halfvec(1024), p_model text, p_filtr jsonb DEFAULT NULL, p_limit integer DEFAULT 40
)
RETURNS TABLE (
  dokument_id uuid, nazev text, autor text, rok integer, jazyk text,
  zdroj text, pdf_index integer, tistena_strana text, kapitola text, druh text, text text, skore real
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_n integer := LEAST(GREATEST(coalesce(p_limit, 40), 1), 100);
  v_omezeno boolean := coalesce(p_filtr, '{}'::jsonb) <> '{}'::jsonb;
BEGIN
  IF v_omezeno THEN
    RETURN QUERY
      WITH citelne AS (SELECT f.id FROM public.bible_dokumenty_filtr(p_filtr) f),
      kandidati AS MATERIALIZED (
        SELECT p.id AS pasaz_id, v.embedding
          FROM public.bible_pasaze p
          JOIN public.bible_vektory v ON v.pasaz_id = p.id AND v.model_key = p_model
         WHERE p.dokument_id IN (SELECT c.id FROM citelne c)
      ),
      nejblizsi AS (
        SELECT k.pasaz_id, (k.embedding OPERATOR(extensions.<=>) p_vektor) AS vzdalenost
          FROM kandidati k
         ORDER BY k.embedding OPERATOR(extensions.<=>) p_vektor
         LIMIT v_n
      )
      SELECT p.dokument_id, d.nazev, d.autor, d.rok, d.jazyk, 'original'::text, p.strana_od, s.tistena_strana,
             coalesce(nullif(k.nazev_cs, ''), k.nazev), p.druh, p.text, (1 - x.vzdalenost)::real
        FROM nejblizsi x
        JOIN public.bible_pasaze p ON p.id = x.pasaz_id
        JOIN public.bible_dokumenty d ON d.id = p.dokument_id
        LEFT JOIN public.bible_strany s ON s.dokument_id = p.dokument_id AND s.pdf_index = p.strana_od
        LEFT JOIN public.bible_kapitoly k ON k.id = p.kapitola_id
       ORDER BY x.vzdalenost, d.nazev, p.strana_od;
  ELSE
    -- HNSW vrací nejvýš ef_search kandidátů (výchozí 40), a my jich chceme až 4 × limit.
    PERFORM set_config('hnsw.ef_search', '400', true);
    RETURN QUERY
      WITH citelne AS (SELECT f.id FROM public.bible_dokumenty_filtr(NULL) f),
      nejblizsi AS (
        SELECT v.pasaz_id, (v.embedding OPERATOR(extensions.<=>) p_vektor) AS vzdalenost
          FROM public.bible_vektory v
         WHERE v.model_key = p_model
         ORDER BY v.embedding OPERATOR(extensions.<=>) p_vektor
         LIMIT v_n * 4
      )
      SELECT p.dokument_id, d.nazev, d.autor, d.rok, d.jazyk, 'original'::text, p.strana_od, s.tistena_strana,
             coalesce(nullif(k.nazev_cs, ''), k.nazev), p.druh, p.text, (1 - x.vzdalenost)::real
        FROM nejblizsi x
        JOIN public.bible_pasaze p ON p.id = x.pasaz_id
        JOIN public.bible_dokumenty d ON d.id = p.dokument_id
        LEFT JOIN public.bible_strany s ON s.dokument_id = p.dokument_id AND s.pdf_index = p.strana_od
        LEFT JOIN public.bible_kapitoly k ON k.id = p.kapitola_id
       WHERE p.dokument_id IN (SELECT c.id FROM citelne c)
       ORDER BY x.vzdalenost, d.nazev, p.strana_od
       LIMIT v_n;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  public.bible_vektory_chybi(text, integer, uuid[]),
  public.bible_vektory_stav(text),
  public.bible_hledej_vektor(extensions.halfvec, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_vektory_chybi(text, integer, uuid[]),
  public.bible_vektory_stav(text),
  public.bible_hledej_vektor(extensions.halfvec, text, jsonb, integer)
  TO service_role;

-- Cena embeddingů (USD za 1 M tokenů; OpenAI text-embedding-3-large k 24. 11. 2026) do ceníku.
-- Přidá se jen chybějící klíč — majitelem upravený ceník se nepřepíše.
UPDATE public.bible_nastaveni
   SET hodnota = hodnota || '{"text-embedding-3-large": {"vstup": 0.13, "vystup": 0}}'::jsonb,
       upraveno = now()
 WHERE klic = 'cenik_usd_za_mtok'
   AND jsonb_typeof(hodnota) = 'object'
   AND NOT (hodnota ? 'text-embedding-3-large');
