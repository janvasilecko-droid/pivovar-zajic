-- 🧑‍🔧 Pivovarská bible — zkušenosti sládků (etapa 3b).
--
-- Z architektury § 9: případové studie, diskuse, rozhovory, postupy, řešení
-- problémů, doporučení výrobců a provozní zkušenost — jde i ruční zápis z vlastního
-- provozu. Každý záznam nese ÚROVEŇ DŮVĚRYHODNOSTI:
--   1 ověřená odborná publikace · 2 výrobní dokumentace ·
--   3 opakovaně ověřená provozní zkušenost · 4 zkušenost jednoho sládka ·
--   5 neověřená informace.
-- Zkušenost se nikdy nevydává za obecné pravidlo: úroveň 1–3 smí nastavit jen
-- správce (někdo ji musel ověřit), přispěvatel zapisuje 4 nebo 5.
--
-- Zapisuje se jen přes funkce níž (práva hlídají znovu, tabulka je pro
-- prohlížeč zavřená). Smazat smí autor svůj záznam, správce jakýkoli.
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih.

CREATE TABLE IF NOT EXISTS public.bible_zkusenosti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL DEFAULT 'provozni_zkusenost' CHECK (typ IN (
    'pripadova_studie', 'diskuse', 'rozhovor', 'postup', 'reseni_problemu', 'doporuceni_vyrobce', 'provozni_zkusenost'
  )),
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 200),
  text text NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 8000),
  oblasti text[] NOT NULL DEFAULT '{}' CHECK (oblasti <@ ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']::text[]),
  uroven smallint NOT NULL DEFAULT 4 CHECK (uroven BETWEEN 1 AND 5),
  -- Odkud to je (pivovar, rozhovor se sládkem, diskuse…); volný text.
  zdroj text CHECK (zdroj IS NULL OR length(zdroj) <= 500),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now(),
  hledani tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, public.bible_bez_diakritiky(coalesce(nazev, '') || ' ' || coalesce(text, '')))
  ) STORED
);
CREATE INDEX IF NOT EXISTS bible_zkusenosti_hledani_idx ON public.bible_zkusenosti USING gin (hledani);
CREATE INDEX IF NOT EXISTS bible_zkusenosti_created_idx ON public.bible_zkusenosti (created_at DESC);
ALTER TABLE public.bible_zkusenosti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_zkusenosti FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_zkusenosti TO service_role;

-- Společná kontrola vstupu: vrací upravené pole jako jsonb nebo selže se srozumitelnou hláškou.
CREATE OR REPLACE FUNCTION public.bible_zkusenost_vstup(p_pristup text, p_zkusenost jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_uroven integer;
BEGIN
  IF jsonb_typeof(p_zkusenost) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí zkušenost.' USING ERRCODE = '22023';
  END IF;
  v_uroven := coalesce((p_zkusenost ->> 'uroven')::integer, 4);
  IF v_uroven NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Úroveň důvěryhodnosti je 1 až 5.' USING ERRCODE = '22023';
  END IF;
  IF v_uroven < 4 AND p_pristup <> 'spravuje' THEN
    RAISE EXCEPTION 'Úroveň 1 až 3 (ověřené zdroje) smí nastavit jen správce.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'typ', coalesce(nullif(p_zkusenost ->> 'typ', ''), 'provozni_zkusenost'),
    'nazev', trim(coalesce(p_zkusenost ->> 'nazev', '')),
    'text', trim(coalesce(p_zkusenost ->> 'text', '')),
    'uroven', v_uroven,
    'zdroj', nullif(trim(coalesce(p_zkusenost ->> 'zdroj', '')), ''),
    'oblasti', CASE WHEN jsonb_typeof(p_zkusenost -> 'oblasti') = 'array'
                    THEN to_jsonb(ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_zkusenost -> 'oblasti') ORDER BY 1))
                    ELSE '[]'::jsonb END
  );
END;
$$;

-- Zápis nové zkušenosti (přispěvatel i správce).
CREATE OR REPLACE FUNCTION public.bible_zapis_zkusenost(p_uzivatel uuid, p_pristup text, p_jmeno text, p_zkusenost jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_id uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zkušenost smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  v := public.bible_zkusenost_vstup(p_pristup, p_zkusenost);
  INSERT INTO public.bible_zkusenosti (typ, nazev, text, oblasti, uroven, zdroj, zapsal, zapsal_jmeno)
  VALUES (
    v ->> 'typ', v ->> 'nazev', v ->> 'text',
    ARRAY(SELECT jsonb_array_elements_text(v -> 'oblasti')),
    (v ->> 'uroven')::smallint, v ->> 'zdroj', p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Úprava: autor svůj záznam, správce jakýkoli. Přispěvatel nesmí úroveň zvýšit
-- nad 4 (kontrola výš) ani sebrat správci ověřenou úroveň 1–3.
CREATE OR REPLACE FUNCTION public.bible_uprav_zkusenost(p_uzivatel uuid, p_pristup text, p_id uuid, p_zkusenost jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v jsonb;
  r public.bible_zkusenosti%ROWTYPE;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zkušenost smí upravit přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.bible_zkusenosti WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup <> 'spravuje' AND r.zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Upravit smíš jen svoje zkušenosti.' USING ERRCODE = '42501';
  END IF;
  IF p_pristup <> 'spravuje' AND r.uroven < 4 THEN
    RAISE EXCEPTION 'Ověřenou zkušenost (úroveň 1 až 3) upravuje jen správce.' USING ERRCODE = '42501';
  END IF;
  v := public.bible_zkusenost_vstup(p_pristup, p_zkusenost);
  UPDATE public.bible_zkusenosti SET
    typ = v ->> 'typ',
    nazev = v ->> 'nazev',
    text = v ->> 'text',
    oblasti = ARRAY(SELECT jsonb_array_elements_text(v -> 'oblasti')),
    uroven = (v ->> 'uroven')::smallint,
    zdroj = v ->> 'zdroj',
    upraveno_at = now()
  WHERE id = p_id;
  RETURN true;
END;
$$;

-- Smazání: autor svůj záznam, správce jakýkoli. Vrací, jestli záznam existoval.
CREATE OR REPLACE FUNCTION public.bible_smaz_zkusenost(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zkušenost smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_zkusenosti WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup <> 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje zkušenosti.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_zkusenosti WHERE id = p_id;
  RETURN true;
END;
$$;

-- Čtení a hledání (bez diakritiky, předpony — stejný dotaz jako v knihách).
-- Prázdný dotaz = nejnovější. Filtr podle oblasti a nejnižší důvěryhodnosti
-- (nejvyšší číslo úrovně, které se ještě má ukázat).
CREATE OR REPLACE FUNCTION public.bible_hledej_zkusenosti(p_dotaz text DEFAULT NULL, p_oblast text DEFAULT NULL, p_nejhorsi smallint DEFAULT 5, p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid, typ text, nazev text, text text, oblasti text[], uroven smallint, zdroj text,
  zapsal uuid, zapsal_jmeno text, created_at timestamptz, upraveno_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH q AS (SELECT public.bible_dotaz(p_dotaz) AS q)
  SELECT z.id, z.typ, z.nazev, z.text, z.oblasti, z.uroven, z.zdroj, z.zapsal, z.zapsal_jmeno, z.created_at, z.upraveno_at
    FROM public.bible_zkusenosti z, q
   WHERE (nullif(trim(coalesce(p_dotaz, '')), '') IS NULL OR (q.q IS NOT NULL AND z.hledani @@ q.q))
     AND (p_oblast IS NULL OR p_oblast = ANY (z.oblasti))
     AND z.uroven <= coalesce(p_nejhorsi, 5)
   ORDER BY CASE WHEN q.q IS NULL THEN 0 ELSE -ts_rank(z.hledani, q.q) END, z.uroven, z.created_at DESC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200)
$$;

REVOKE ALL ON FUNCTION
  public.bible_zkusenost_vstup(text, jsonb),
  public.bible_zapis_zkusenost(uuid, text, text, jsonb),
  public.bible_uprav_zkusenost(uuid, text, uuid, jsonb),
  public.bible_smaz_zkusenost(uuid, text, uuid),
  public.bible_hledej_zkusenosti(text, text, smallint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_zkusenost_vstup(text, jsonb),
  public.bible_zapis_zkusenost(uuid, text, text, jsonb),
  public.bible_uprav_zkusenost(uuid, text, uuid, jsonb),
  public.bible_smaz_zkusenost(uuid, text, uuid),
  public.bible_hledej_zkusenosti(text, text, smallint, integer)
  TO service_role;
