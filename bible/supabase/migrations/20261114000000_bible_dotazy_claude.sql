-- 💬 Pivovarská bible — AI sládek na předplatné: odpověď z aplikace Claude
-- zpátky do appky (R33).
--
-- Majitel 14. 11. 2026: „Chci, abych se mohl ptát v té aplikaci a v té viděl
-- odpovědi od Claude" a vybral cestu přes předplatné: otázku napíše v appce,
-- v aplikaci Claude ji jen odešle a Claude přes konektor „Pivovarská bible"
-- uloží odpověď zpátky do konverzace AI sládka. Předplatné se podle pravidel
-- Anthropicu smí používat jen v aplikacích Claude a v Claude Code (R14, R31),
-- appka proto Clauda nevolá — jen schová otázku a odpověď.
--
-- Otázka pro Claude je zpráva uživatele s pro_claude = true; id jí dá appka
-- předem (Claude ho dostane v zadání jako dotaz_id). Odpověď je zpráva
-- asistenta s odpoved_na = id otázky — na jednu otázku nejvýš jedna
-- (jedinečný index). Odpověď smí zapsat jen ten, kdo se ptal: konektor
-- zapisuje za uživatele, který ho připojil.
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádná data. Pustit podruhé nic nezmění.

ALTER TABLE public.bible_zpravy ADD COLUMN IF NOT EXISTS pro_claude boolean NOT NULL DEFAULT false;
ALTER TABLE public.bible_zpravy ADD COLUMN IF NOT EXISTS odpoved_na uuid REFERENCES public.bible_zpravy(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS bible_zpravy_odpoved_na_uniq ON public.bible_zpravy (odpoved_na) WHERE odpoved_na IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bible_zpravy_dotaz_claude_ck') THEN
    ALTER TABLE public.bible_zpravy ADD CONSTRAINT bible_zpravy_dotaz_claude_ck
      CHECK ((NOT pro_claude OR role = 'uzivatel') AND (odpoved_na IS NULL OR role = 'asistent'));
  END IF;
END $$;

-- Otázka pro aplikaci Claude do vlastní konverzace (nebo nové). Id dává appka;
-- stejné id podruhé (síť, dvojí klepnutí) vrátí už uloženou otázku.
CREATE OR REPLACE FUNCTION public.bible_dotaz_claude_zaloz(
  p_uzivatel uuid, p_konverzace uuid, p_problem uuid, p_dotaz uuid, p_otazka text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_otazka text := trim(coalesce(p_otazka, ''));
  v_konverzace uuid := p_konverzace;
  v_zprava public.bible_zpravy%ROWTYPE;
BEGIN
  IF p_uzivatel IS NULL THEN
    RAISE EXCEPTION 'Chybí uživatel.' USING ERRCODE = '42501';
  END IF;
  IF p_dotaz IS NULL THEN
    RAISE EXCEPTION 'Chybí id dotazu.' USING ERRCODE = '22023';
  END IF;
  IF length(v_otazka) < 2 OR length(v_otazka) > 4000 THEN
    RAISE EXCEPTION 'Otázka má mít 2 až 4000 znaků.' USING ERRCODE = '22023';
  END IF;
  -- Dvě souběžná odeslání téhož dotazu: druhé počká a najde první.
  PERFORM pg_advisory_xact_lock(hashtext('bible_dotaz_claude:' || p_dotaz::text));
  SELECT * INTO v_zprava FROM public.bible_zpravy WHERE id = p_dotaz;
  IF FOUND THEN
    IF v_zprava.role = 'uzivatel' AND v_zprava.pro_claude AND EXISTS (
      SELECT 1 FROM public.bible_konverzace k WHERE k.id = v_zprava.konverzace_id AND k.uzivatel = p_uzivatel
    ) THEN
      RETURN jsonb_build_object('konverzace_id', v_zprava.konverzace_id, 'dotaz_id', v_zprava.id, 'novy', false);
    END IF;
    RAISE EXCEPTION 'Dotaz s tímto id už existuje.' USING ERRCODE = '22023';
  END IF;
  IF v_konverzace IS NULL THEN
    v_konverzace := public.bible_konverzace_zaloz(p_uzivatel, v_otazka, p_problem);
  ELSIF NOT EXISTS (SELECT 1 FROM public.bible_konverzace WHERE id = v_konverzace AND uzivatel = p_uzivatel) THEN
    RAISE EXCEPTION 'Konverzace neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.bible_zpravy (id, konverzace_id, role, text, pro_claude)
  VALUES (p_dotaz, v_konverzace, 'uzivatel', v_otazka, true);
  UPDATE public.bible_konverzace SET upraveno_at = now() WHERE id = v_konverzace;
  RETURN jsonb_build_object('konverzace_id', v_konverzace, 'dotaz_id', p_dotaz, 'novy', true);
END;
$$;

-- Dotaz pro konektor: otázka, konverzace a posledních 6 zpráv před ní (jen
-- vlastní; cizí nebo neexistující = NULL).
CREATE OR REPLACE FUNCTION public.bible_dotaz_claude_nacti(p_uzivatel uuid, p_dotaz uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'dotaz_id', z.id, 'otazka', z.text, 'konverzace_id', k.id, 'nazev', k.nazev, 'problem_id', k.problem_id,
    'problem_nazev', (SELECT p.nazev FROM public.bible_problemy p WHERE p.id = k.problem_id),
    'zodpovezeno', EXISTS (SELECT 1 FROM public.bible_zpravy o WHERE o.odpoved_na = z.id),
    'historie', coalesce((
      SELECT jsonb_agg(jsonb_build_object('role', h.role, 'text', left(h.text, 4000)) ORDER BY h.created_at, h.id)
        FROM (SELECT x.role, x.text, x.created_at, x.id FROM public.bible_zpravy x
               WHERE x.konverzace_id = k.id AND (x.created_at, x.id) < (z.created_at, z.id)
               ORDER BY x.created_at DESC, x.id DESC LIMIT 6) h
    ), '[]'::jsonb)
  )
    FROM public.bible_zpravy z
    JOIN public.bible_konverzace k ON k.id = z.konverzace_id
   WHERE z.id = p_dotaz AND z.role = 'uzivatel' AND z.pro_claude AND k.uzivatel = p_uzivatel
$$;

-- Odpověď z aplikace Claude na vlastní dotaz pro Claude — nejvýš jedna.
CREATE OR REPLACE FUNCTION public.bible_dotaz_claude_odpovez(
  p_uzivatel uuid, p_dotaz uuid, p_text text, p_citace jsonb, p_model text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_konverzace uuid;
  v_id uuid;
  v_text text := trim(coalesce(p_text, ''));
BEGIN
  IF p_uzivatel IS NULL THEN
    RAISE EXCEPTION 'Chybí uživatel.' USING ERRCODE = '42501';
  END IF;
  -- Zámek otázky: dvě souběžná uložení odpovědi se seřadí, druhé uvidí první.
  SELECT z.konverzace_id INTO v_konverzace
    FROM public.bible_zpravy z
    JOIN public.bible_konverzace k ON k.id = z.konverzace_id
   WHERE z.id = p_dotaz AND z.role = 'uzivatel' AND z.pro_claude AND k.uzivatel = p_uzivatel
     FOR UPDATE OF z;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenhle dotaz v appce není (nebo patří jinému uživateli).' USING ERRCODE = 'P0002';
  END IF;
  IF length(v_text) < 1 OR length(v_text) > 60000 THEN
    RAISE EXCEPTION 'Odpověď má mít 1 až 60 000 znaků.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_citace, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Citace musí být seznam.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bible_zpravy WHERE odpoved_na = p_dotaz) THEN
    RAISE EXCEPTION 'Odpověď na tenhle dotaz už v appce je.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.bible_zpravy (konverzace_id, role, text, citace, model, odpoved_na)
  VALUES (v_konverzace, 'asistent', v_text, coalesce(p_citace, '[]'::jsonb), left(nullif(trim(coalesce(p_model, '')), ''), 100), p_dotaz)
  RETURNING id INTO v_id;
  UPDATE public.bible_konverzace SET upraveno_at = now() WHERE id = v_konverzace;
  RETURN jsonb_build_object('zprava_id', v_id, 'konverzace_id', v_konverzace);
END;
$$;

-- Seznam konverzací: navíc „čeká na odpověď z aplikace Claude".
CREATE OR REPLACE FUNCTION public.bible_konverzace_seznam(p_uzivatel uuid, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'nazev', k.nazev, 'problem_id', k.problem_id, 'upraveno_at', k.upraveno_at,
      'zprav', (SELECT count(*) FROM public.bible_zpravy z WHERE z.konverzace_id = k.id),
      'ceka_claude', EXISTS (
        SELECT 1 FROM public.bible_zpravy q
         WHERE q.konverzace_id = k.id AND q.pro_claude
           AND NOT EXISTS (SELECT 1 FROM public.bible_zpravy o WHERE o.odpoved_na = q.id)
      )
    ) ORDER BY k.upraveno_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.bible_konverzace WHERE uzivatel = p_uzivatel
           ORDER BY upraveno_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) k
$$;

-- Zprávy konverzace: navíc otázka pro Claude a k čemu je odpověď.
CREATE OR REPLACE FUNCTION public.bible_konverzace_zpravy(p_uzivatel uuid, p_konverzace uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.bible_konverzace k WHERE k.id = p_konverzace AND k.uzivatel = p_uzivatel) THEN NULL
    ELSE jsonb_build_object(
      'konverzace', (SELECT jsonb_build_object('id', k.id, 'nazev', k.nazev, 'problem_id', k.problem_id)
                       FROM public.bible_konverzace k WHERE k.id = p_konverzace),
      'zpravy', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', z.id, 'role', z.role, 'text', z.text, 'kroky', z.kroky, 'citace', z.citace, 'model', z.model,
          'cena_usd', z.cena_usd, 'neuplna', z.neuplna, 'created_at', z.created_at,
          'pro_claude', z.pro_claude, 'odpoved_na', z.odpoved_na
        ) ORDER BY z.created_at, z.id) FROM public.bible_zpravy z WHERE z.konverzace_id = p_konverzace), '[]'::jsonb)
    ) END
$$;

REVOKE ALL ON FUNCTION
  public.bible_dotaz_claude_zaloz(uuid, uuid, uuid, uuid, text),
  public.bible_dotaz_claude_nacti(uuid, uuid),
  public.bible_dotaz_claude_odpovez(uuid, uuid, text, jsonb, text),
  public.bible_konverzace_seznam(uuid, integer),
  public.bible_konverzace_zpravy(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_dotaz_claude_zaloz(uuid, uuid, uuid, uuid, text),
  public.bible_dotaz_claude_nacti(uuid, uuid),
  public.bible_dotaz_claude_odpovez(uuid, uuid, text, jsonb, text),
  public.bible_konverzace_seznam(uuid, integer),
  public.bible_konverzace_zpravy(uuid, uuid)
  TO service_role;
