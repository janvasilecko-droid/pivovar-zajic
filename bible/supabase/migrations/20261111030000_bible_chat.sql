-- 💬 Pivovarská bible — chatbot v appce (etapa 5) a hledání otázkou v běžné řeči.
--
-- Majitel 11. 11. 2026: „hlavně ať v aplikaci funguje vyhledávání a hledání
-- komplexních odpovědí na problémy — má to být chatbot". Chatbot volá Claude
-- přes API (předplatné na dotazy uživatelů appky použít nejde, R14) s nástroji
-- nad knihovnou, várkami, výpočty a problémy (stejné jako konektor, R16).
-- Útrata se zapisuje do ai_naklady (účel „chat") a hlídá ji měsíční strop
-- strop_mesic_usd z bible_nastaveni (správce ho mění ve Správě znalostí).
--
-- Hledání: bible_hledej chce všechna slova na jedné stránce — otázka v běžné
-- řeči („proč pivo málo pění") tak nenajde nic. bible_hledej_volne hledá bez
-- výplňových slov, s uříznutou koncovkou (chmelovaru → chmelovar) a seřadí
-- stránky podle počtu nalezených slov; bible-api ho použije, když přesné
-- hledání nic nenajde.
--
-- Konverzace patří tomu, kdo se ptal (vidí je jen on). Zapisuje se jen přes
-- funkce níž, tabulky jsou pro prohlížeč zavřené. Jen projekt bible; spouští
-- majitel v appce: Systém → Databázové migrace → Databáze bible. SQL je
-- veřejné — žádná data. Pustit podruhé nic nezmění.

-- ---------------------------------------------------------------------------
-- 1) Hledání otázkou: bez výplňových slov, OR, řazení podle shody
-- ---------------------------------------------------------------------------
-- Slova otázky: bez diakritiky a výplňových slov, s uříznutou českou koncovkou
-- (chmelovaru → chmelovar, pění → pen, rmutování → rmut), nejvýš 8.
CREATE OR REPLACE FUNCTION public.bible_slova_volne(p_dotaz text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(kmen ORDER BY poradi), '{}'::text[])
    FROM (
      SELECT kmen, min(poradi) AS poradi
        FROM (
          SELECT poradi, CASE
                   WHEN slovo ~ '^[0-9]+$' OR length(slovo) < 4 THEN slovo
                   ELSE coalesce((
                     SELECT left(slovo, length(slovo) - length(k))
                       FROM unnest(ARRAY[
                         'ovani', 'ovat', 'ujeme', 'ujete', 'ovych', 'ovymi', 'ovemu', 'oveho', 'ovou', 'eni', 'ani', 'uje', 'uji',
                         'ovy', 'ova', 'ove', 'ovi', 'ich', 'ych', 'ech', 'ach', 'ami', 'emi', 'imi', 'ymi', 'eho', 'emu', 'iho', 'imu',
                         'ou', 'em', 'im', 'ym', 'um', 'am', 'at', 'it', 'et', 'a', 'e', 'i', 'o', 'u', 'y'
                       ]) AS k
                      WHERE right(slovo, length(k)) = k AND length(slovo) - length(k) >= 3
                      ORDER BY length(k) DESC
                      LIMIT 1), slovo)
                 END AS kmen
            FROM regexp_split_to_table(lower(public.bible_bez_diakritiky(coalesce(p_dotaz, ''))), '[^a-z0-9]+')
                 WITH ORDINALITY AS t(slovo, poradi)
           WHERE (length(slovo) >= 3 OR slovo ~ '^[0-9]+$' OR slovo IN ('ph', 'o2', 'fe', 'cu', 'zn', 'ca', 'mg'))
             AND slovo NOT IN (
               'proc', 'jak', 'jaky', 'jaka', 'jake', 'jaci', 'kdy', 'kde', 'kam', 'kolik', 'ktery', 'ktera', 'ktere', 'kteri',
               'neco', 'nejak', 'pro', 'pri', 'pod', 'nad', 'mezi', 'jsem', 'jsme', 'jste', 'jsou', 'byl', 'byla', 'bylo', 'byly',
               'bude', 'budou', 'mam', 'mame', 'mate', 'maji', 'mit', 'mel', 'mela', 'melo', 'meli', 'muze', 'muzu', 'mohu', 'mohl',
               'muzeme', 'lze', 'neni', 'nebo', 'ale', 'ani', 'tak', 'take', 'jen', 'aby', 'bych', 'bys', 'bychom', 'byste', 'kdyz',
               'jako', 'jeho', 'jeji', 'jejich', 'tento', 'tato', 'toto', 'tyto', 'tech', 'tem', 'ten', 'tam', 'tady', 'zde',
               'jeste', 'velmi', 'moc', 'hodne', 'malo', 'trochu', 'nas', 'nase', 'nasi', 'vas', 'vase', 'muj', 'moje', 'svuj',
               'sve', 'sva', 'treba', 'proto', 'protoze', 'potom', 'pak', 'nez', 'chci', 'chceme', 'potrebuji', 'potrebuju',
               'vim', 'nevim', 'delat', 'udelat', 'resit', 'poradit', 'poradte', 'prosim', 'dekuji', 'diky',
               'the', 'and', 'for', 'with', 'why', 'how', 'what', 'when', 'does', 'from', 'that', 'this', 'are', 'was', 'not',
               'der', 'die', 'das', 'und', 'mit', 'fur', 'wie', 'warum', 'ist', 'sind', 'ein', 'eine', 'bei', 'von'
             )
        ) s
       GROUP BY kmen
       ORDER BY min(poradi)
       LIMIT 8
    ) x
$$;

-- Dotaz ze slov otázky: p_min 1 = stačí jedno slovo (OR), 2 = aspoň dvě slova
-- na stránce (dvojice přes AND). Slova jsou jen [a-z0-9], syntaxi nepřinesou.
CREATE OR REPLACE FUNCTION public.bible_dotaz_volny(p_dotaz text, p_min integer DEFAULT 1)
RETURNS tsquery
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN cardinality(v.s) = 0 THEN NULL
    WHEN coalesce(p_min, 1) <= 1 OR cardinality(v.s) = 1 THEN
      (SELECT string_agg(w || ':*', ' | ' ORDER BY i) FROM unnest(v.s) WITH ORDINALITY AS u(w, i))::tsquery
    ELSE
      (SELECT string_agg('(' || a.w || ':* & ' || b.w || ':*)', ' | ' ORDER BY a.i, b.i)
         FROM unnest(v.s) WITH ORDINALITY AS a(w, i)
         JOIN unnest(v.s) WITH ORDINALITY AS b(w, i) ON b.i > a.i)::tsquery
  END
  FROM (SELECT public.bible_slova_volne(p_dotaz) AS s) v
$$;

-- Hledání otázkou: nejdřív stránky aspoň se dvěma slovy otázky, když žádné nejsou,
-- tak s jedním. Řazení podle počtu nalezených slov (shoda), pak podle váhy.
CREATE OR REPLACE FUNCTION public.bible_hledej_volne(p_dotaz text, p_dokument uuid DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE (
  dokument_id uuid, nazev text, autor text, rok integer, jazyk text,
  zdroj text, pdf_index integer, tistena_strana text, kapitola text, druh text, text text,
  shoda integer, slov integer, skore real
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_slova text[] := public.bible_slova_volne(p_dotaz);
  v_vse tsquery := public.bible_dotaz_volny(p_dotaz, 1);
  v_n integer := LEAST(GREATEST(coalesce(p_limit, 40), 1), 100);
  v_q tsquery;
  v_min integer;
BEGIN
  IF v_vse IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_min IN ARRAY CASE WHEN cardinality(v_slova) > 1 THEN ARRAY[2, 1] ELSE ARRAY[1] END LOOP
    v_q := public.bible_dotaz_volny(p_dotaz, v_min);
    RETURN QUERY
      WITH citelne AS (
        SELECT d.id FROM public.bible_dokumenty d
         WHERE d.stav IN ('hotovo', 'ke_kontrole') AND (p_dokument IS NULL OR d.id = p_dokument)
      ),
      nalezy AS (
        SELECT p.dokument_id AS dok, 'original'::text AS zdr, p.strana_od AS pdf, p.kapitola_id AS kap, p.druh AS dr,
               p.text AS txt, p.hledani AS h
          FROM public.bible_pasaze p
         WHERE p.hledani @@ v_q AND p.dokument_id IN (SELECT c.id FROM citelne c)
        UNION ALL
        SELECT s.dokument_id, 'preklad'::text, s.pdf_index, s.kapitola_id, 'text'::text, s.preklad, s.preklad_hledani
          FROM public.bible_strany s
         WHERE s.preklad_platny AND s.preklad <> '' AND s.preklad_hledani @@ v_q
           AND s.dokument_id IN (SELECT c.id FROM citelne c)
      ),
      hodnocene AS (
        SELECT x.dok, x.zdr, x.pdf, x.kap, x.dr, x.txt,
               (SELECT count(*)::integer FROM unnest(v_slova) AS w(slovo) WHERE x.h @@ (w.slovo || ':*')::tsquery) AS sh,
               ts_rank(x.h, v_vse) AS sk
          FROM nalezy x
      )
      SELECT y.dok, d.nazev, d.autor, d.rok, d.jazyk, y.zdr, y.pdf, st.tistena_strana,
             coalesce(nullif(k.nazev_cs, ''), k.nazev), y.dr, y.txt, y.sh, cardinality(v_slova), y.sk
        FROM hodnocene y
        JOIN public.bible_dokumenty d ON d.id = y.dok
        LEFT JOIN public.bible_strany st ON st.dokument_id = y.dok AND st.pdf_index = y.pdf
        LEFT JOIN public.bible_kapitoly k ON k.id = y.kap
       ORDER BY y.sh DESC, y.sk DESC, d.nazev, y.pdf
       LIMIT v_n;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- Zkušenosti sládků stejnou otázkou (bible_hledej_zkusenosti chce všechna slova).
CREATE OR REPLACE FUNCTION public.bible_hledej_zkusenosti_volne(p_dotaz text, p_oblast text DEFAULT NULL, p_nejhorsi smallint DEFAULT 5, p_limit integer DEFAULT 15)
RETURNS TABLE (
  id uuid, typ text, nazev text, text text, oblasti text[], uroven smallint, zdroj text,
  zapsal uuid, zapsal_jmeno text, created_at timestamptz, upraveno_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH v AS (SELECT public.bible_slova_volne(p_dotaz) AS s, public.bible_dotaz_volny(p_dotaz, 1) AS q)
  SELECT z.id, z.typ, z.nazev, z.text, z.oblasti, z.uroven, z.zdroj, z.zapsal, z.zapsal_jmeno, z.created_at, z.upraveno_at
    FROM public.bible_zkusenosti z, v
   WHERE v.q IS NOT NULL AND z.hledani @@ v.q
     AND (p_oblast IS NULL OR p_oblast = ANY (z.oblasti))
     AND z.uroven <= coalesce(p_nejhorsi, 5)
   ORDER BY (SELECT count(*) FROM unnest(v.s) AS w(slovo) WHERE z.hledani @@ (w.slovo || ':*')::tsquery) DESC,
            ts_rank(z.hledani, v.q) DESC, z.uroven, z.created_at DESC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 15), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- 2) Konverzace a zprávy chatu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_konverzace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uzivatel uuid NOT NULL,
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 200),
  -- Konverzace o problému z Analýzy problémů (nepovinné).
  problem_id uuid REFERENCES public.bible_problemy(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_konverzace_uzivatel_idx ON public.bible_konverzace (uzivatel, upraveno_at DESC);
CREATE INDEX IF NOT EXISTS bible_konverzace_problem_idx ON public.bible_konverzace (problem_id);

CREATE TABLE IF NOT EXISTS public.bible_zpravy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  konverzace_id uuid NOT NULL REFERENCES public.bible_konverzace(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('uzivatel', 'asistent')),
  text text NOT NULL CHECK (length(text) <= 60000),
  -- Kroky (jaké nástroje Claude použil) a citované strany: [{kniha_id, nazev, list, strana}].
  kroky jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(kroky) = 'array'),
  citace jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citace) = 'array'),
  model text,
  vstup_tokenu bigint NOT NULL DEFAULT 0,
  vystup_tokenu bigint NOT NULL DEFAULT 0,
  cena_usd numeric(12, 6) NOT NULL DEFAULT 0,
  -- Odpověď se nedokončila (strop, chyba API, čas) — text je jen to, co stihla.
  neuplna boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_zpravy_konverzace_idx ON public.bible_zpravy (konverzace_id, created_at);

ALTER TABLE public.bible_konverzace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_zpravy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_konverzace, public.bible_zpravy FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_konverzace, public.bible_zpravy TO service_role;

-- Útrata za AI tento měsíc (pražský kalendářní měsíc) a strop.
CREATE OR REPLACE FUNCTION public.bible_ai_utrata_mesic()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'utraceno_usd', coalesce((SELECT sum(n.cena_usd) FROM public.ai_naklady n
       WHERE n.cas >= (date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')), 0),
    'chat_usd', coalesce((SELECT sum(n.cena_usd) FROM public.ai_naklady n
       WHERE n.ucel = 'chat' AND n.cas >= (date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')), 0),
    'chat_dotazu', (SELECT count(*) FROM public.ai_naklady n
       WHERE n.ucel = 'chat' AND n.cas >= (date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')),
    'strop_usd', coalesce((SELECT (s.hodnota #>> '{}')::numeric FROM public.bible_nastaveni s WHERE s.klic = 'strop_mesic_usd'), 0),
    'model', (SELECT s.hodnota #>> '{}' FROM public.bible_nastaveni s WHERE s.klic = 'model_odpovedi')
  )
$$;

-- Měsíční strop útraty za AI — jen správce (0 = chatbot vypnutý).
CREATE OR REPLACE FUNCTION public.bible_strop_nastav(p_uzivatel uuid, p_pristup text, p_usd numeric)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL OR p_pristup IS DISTINCT FROM 'spravuje' THEN
    RAISE EXCEPTION 'Strop útraty za AI mění jen správce.' USING ERRCODE = '42501';
  END IF;
  IF p_usd IS NULL OR p_usd < 0 OR p_usd > 1000 THEN
    RAISE EXCEPTION 'Strop je 0 až 1000 USD za měsíc.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.bible_nastaveni (klic, hodnota, popis)
  VALUES ('strop_mesic_usd', to_jsonb(round(p_usd, 2)), 'Měsíční strop útraty za AI; nad ním se další volání odmítnou (0 = AI nepoužívat).')
  ON CONFLICT (klic) DO UPDATE SET hodnota = EXCLUDED.hodnota, upraveno = now();
  RETURN true;
END;
$$;

-- Nová konverzace (vrátí id). Název = začátek první otázky.
CREATE OR REPLACE FUNCTION public.bible_konverzace_zaloz(p_uzivatel uuid, p_nazev text, p_problem uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_uzivatel IS NULL THEN
    RAISE EXCEPTION 'Chybí uživatel.' USING ERRCODE = '42501';
  END IF;
  IF p_problem IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bible_problemy WHERE id = p_problem) THEN
    RAISE EXCEPTION 'Problém neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.bible_konverzace (uzivatel, nazev, problem_id)
  VALUES (p_uzivatel, left(coalesce(nullif(trim(p_nazev), ''), 'Otázka'), 200), p_problem)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Zpráva do konverzace — jen do vlastní. Vrátí id zprávy.
CREATE OR REPLACE FUNCTION public.bible_zprava_uloz(
  p_uzivatel uuid, p_konverzace uuid, p_role text, p_text text, p_kroky jsonb, p_citace jsonb,
  p_model text, p_vstup bigint, p_vystup bigint, p_cena numeric, p_neuplna boolean
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_uzivatel IS NULL OR NOT EXISTS (SELECT 1 FROM public.bible_konverzace WHERE id = p_konverzace AND uzivatel = p_uzivatel) THEN
    RAISE EXCEPTION 'Konverzace neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.bible_zpravy (konverzace_id, role, text, kroky, citace, model, vstup_tokenu, vystup_tokenu, cena_usd, neuplna)
  VALUES (
    p_konverzace, p_role, coalesce(p_text, ''), coalesce(p_kroky, '[]'::jsonb), coalesce(p_citace, '[]'::jsonb),
    p_model, coalesce(p_vstup, 0), coalesce(p_vystup, 0), coalesce(p_cena, 0), coalesce(p_neuplna, false)
  )
  RETURNING id INTO v_id;
  UPDATE public.bible_konverzace SET upraveno_at = now() WHERE id = p_konverzace;
  RETURN v_id;
END;
$$;

-- Náklad volání AI (chat i jiné účely).
CREATE OR REPLACE FUNCTION public.bible_naklad_zapis(
  p_ucel text, p_model text, p_volani integer, p_vstup bigint, p_vystup bigint,
  p_cache_cteni bigint, p_cache_zapis bigint, p_cena numeric, p_uzivatel uuid, p_poznamka text
)
RETURNS uuid
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.ai_naklady (ucel, model, volani, vstup_tokenu, vystup_tokenu, cache_cteni_tokenu, cache_zapis_tokenu, cena_usd, uzivatel, poznamka)
  VALUES (p_ucel, coalesce(p_model, '?'), greatest(coalesce(p_volani, 1), 0), coalesce(p_vstup, 0), coalesce(p_vystup, 0),
          coalesce(p_cache_cteni, 0), coalesce(p_cache_zapis, 0), coalesce(p_cena, 0), p_uzivatel, left(p_poznamka, 500))
  RETURNING id
$$;

-- Konverzace uživatele (nejnovější první).
CREATE OR REPLACE FUNCTION public.bible_konverzace_seznam(p_uzivatel uuid, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'nazev', k.nazev, 'problem_id', k.problem_id, 'upraveno_at', k.upraveno_at,
      'zprav', (SELECT count(*) FROM public.bible_zpravy z WHERE z.konverzace_id = k.id)
    ) ORDER BY k.upraveno_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.bible_konverzace WHERE uzivatel = p_uzivatel
           ORDER BY upraveno_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) k
$$;

-- Zprávy vlastní konverzace (od nejstarší). NULL = konverzace není (nebo není jeho).
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
          'cena_usd', z.cena_usd, 'neuplna', z.neuplna, 'created_at', z.created_at
        ) ORDER BY z.created_at, z.id) FROM public.bible_zpravy z WHERE z.konverzace_id = p_konverzace), '[]'::jsonb)
    ) END
$$;

-- Smazání vlastní konverzace i se zprávami.
CREATE OR REPLACE FUNCTION public.bible_konverzace_smaz(p_uzivatel uuid, p_konverzace uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL THEN
    RAISE EXCEPTION 'Chybí uživatel.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_konverzace WHERE id = p_konverzace AND uzivatel = p_uzivatel;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION
  public.bible_slova_volne(text),
  public.bible_dotaz_volny(text, integer),
  public.bible_hledej_volne(text, uuid, integer),
  public.bible_hledej_zkusenosti_volne(text, text, smallint, integer),
  public.bible_ai_utrata_mesic(),
  public.bible_strop_nastav(uuid, text, numeric),
  public.bible_konverzace_zaloz(uuid, text, uuid),
  public.bible_zprava_uloz(uuid, uuid, text, text, jsonb, jsonb, text, bigint, bigint, numeric, boolean),
  public.bible_naklad_zapis(text, text, integer, bigint, bigint, bigint, bigint, numeric, uuid, text),
  public.bible_konverzace_seznam(uuid, integer),
  public.bible_konverzace_zpravy(uuid, uuid),
  public.bible_konverzace_smaz(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_slova_volne(text),
  public.bible_dotaz_volny(text, integer),
  public.bible_hledej_volne(text, uuid, integer),
  public.bible_hledej_zkusenosti_volne(text, text, smallint, integer),
  public.bible_ai_utrata_mesic(),
  public.bible_strop_nastav(uuid, text, numeric),
  public.bible_konverzace_zaloz(uuid, text, uuid),
  public.bible_zprava_uloz(uuid, uuid, text, text, jsonb, jsonb, text, bigint, bigint, numeric, boolean),
  public.bible_naklad_zapis(text, text, integer, bigint, bigint, bigint, bigint, numeric, uuid, text),
  public.bible_konverzace_seznam(uuid, integer),
  public.bible_konverzace_zpravy(uuid, uuid),
  public.bible_konverzace_smaz(uuid, uuid)
  TO service_role;
