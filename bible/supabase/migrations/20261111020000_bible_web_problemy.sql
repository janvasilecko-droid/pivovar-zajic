-- 🌐🩺 Pivovarská bible — rešerše z internetu (etapa 9) a analýza problémů (etapa 10).
--
-- Etapa 9 (architektura § 10): „Rešerši dělá Claude s nástroji pro hledání
-- a čtení webu. Výsledky se ukládají do bible_web_zdroje: URL, titulek, datum
-- zjištění, datum publikace, důvěra a stav (neověřeno, ověřeno, zamítnuto).
-- V odpovědích jsou vždy zvlášť a s datem a nikdy nepřepíšou literaturu."
-- Claude hledá v aplikaci Claude (předplatné majitele, R16) a nález uloží
-- přes konektor — vždy jako NEOVĚŘENÝ. Ověří nebo zamítne ho správce v appce.
-- Ukládá se shrnutí vlastními slovy a odkaz, ne text cizí stránky.
--
-- Etapa 10 (architektura § 6, § 11): analýza problémů (oblast T) „s jasným
-- označením, co je fakt, co hypotéza a co chybí". Problém má dotčené várky
-- a zjištění jednoho ze šesti typů odpovědi digitálního sládka: doložený fakt
-- (s citací), výsledek výpočtu, provozní zkušenost, technologické doporučení,
-- hypotéza, neznámá hodnota. Hypotézu člověk potvrdí nebo vyvrátí.
--
-- Zapisuje se jen přes funkce níž (práva hlídají znovu, tabulky jsou pro
-- prohlížeč zavřené). Jen projekt bible; spouští majitel v appce:
-- Systém → Databázové migrace → Databáze bible. SQL je veřejné — žádná data.
-- Pustit podruhé nic nezmění.

CREATE TABLE IF NOT EXISTS public.bible_web_zdroje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL CHECK (url ~ '^https?://[^\s]+$' AND length(url) <= 2000),
  titulek text NOT NULL CHECK (length(trim(titulek)) BETWEEN 1 AND 300),
  vydavatel text CHECK (vydavatel IS NULL OR length(vydavatel) <= 200),
  datum_publikace date CHECK (datum_publikace IS NULL OR datum_publikace BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  zjisteno date NOT NULL DEFAULT current_date,
  -- Co zdroj říká, vlastními slovy (žádné dlouhé citace — autorská práva).
  shrnuti text NOT NULL CHECK (length(trim(shrnuti)) BETWEEN 1 AND 4000),
  oblasti text[] NOT NULL DEFAULT '{}' CHECK (cardinality(oblasti) <= 20 AND oblasti <@ ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']),
  -- 1 odborná instituce / recenzovaný článek … 5 neověřený zdroj (_shared/web-popisy.ts).
  duvera smallint NOT NULL DEFAULT 5 CHECK (duvera BETWEEN 1 AND 5),
  stav text NOT NULL DEFAULT 'neovereno' CHECK (stav IN ('neovereno', 'overeno', 'zamitnuto')),
  overil uuid,
  overil_jmeno text,
  overeno_at timestamptz,
  poznamka_overeni text CHECK (poznamka_overeni IS NULL OR length(poznamka_overeni) <= 1000),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  -- Zapsal Claude přes konektor (za uživatele, který konektor připojil).
  pres_claude boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bible_web_zdroje_url_uniq ON public.bible_web_zdroje (lower(url));
CREATE INDEX IF NOT EXISTS bible_web_zdroje_stav_idx ON public.bible_web_zdroje (stav, zjisteno DESC);

CREATE TABLE IF NOT EXISTS public.bible_problemy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 200),
  -- Příznaky: co se děje, od kdy, jak se to projevuje.
  popis text CHECK (popis IS NULL OR length(popis) <= 4000),
  pivo text CHECK (pivo IS NULL OR length(pivo) <= 120),
  -- Dotčené várky (bible_varky.id); smazaná várka se prostě nenajde.
  varky uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(varky) <= 12),
  oblasti text[] NOT NULL DEFAULT '{}' CHECK (cardinality(oblasti) <= 20 AND oblasti <@ ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']),
  stav text NOT NULL DEFAULT 'otevreny' CHECK (stav IN ('otevreny', 'vyreseny', 'odlozeny')),
  reseni text CHECK (reseni IS NULL OR length(reseni) <= 4000),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  pres_claude boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_problemy_stav_idx ON public.bible_problemy (stav, upraveno_at DESC);

CREATE TABLE IF NOT EXISTS public.bible_problem_zjisteni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.bible_problemy(id) ON DELETE CASCADE,
  -- Typ tvrzení podle architektury § 6 (zadání bod 11).
  typ text NOT NULL CHECK (typ IN ('fakt', 'vypocet', 'zkusenost', 'doporuceni', 'hypoteza', 'chybi')),
  text text NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 2000),
  -- Citace (kniha a strana, várka, výpočet, URL…); u faktu a výpočtu povinná.
  zdroj text CHECK (zdroj IS NULL OR length(zdroj) <= 500),
  stav text NOT NULL DEFAULT 'navrzeno' CHECK (stav IN ('navrzeno', 'potvrzeno', 'vyvraceno')),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  pres_claude boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now(),
  CHECK (typ NOT IN ('fakt', 'vypocet') OR length(trim(coalesce(zdroj, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS bible_problem_zjisteni_problem_idx ON public.bible_problem_zjisteni (problem_id, created_at);

ALTER TABLE public.bible_web_zdroje ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_problemy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_problem_zjisteni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_web_zdroje, public.bible_problemy, public.bible_problem_zjisteni FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_web_zdroje, public.bible_problemy, public.bible_problem_zjisteni TO service_role;

-- Seznam oblastí z JSON: písmena A–T, bez opakování, seřazené.
CREATE OR REPLACE FUNCTION public.bible_oblasti_vstup(p jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '{}';
  END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 20 THEN
    RAISE EXCEPTION 'Oblasti musí být seznam písmen A–T.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p) e WHERE jsonb_typeof(e) <> 'string' OR NOT (e #>> '{}') ~ '^[A-T]$') THEN
    RAISE EXCEPTION 'Oblasti musí být seznam písmen A–T.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_out FROM jsonb_array_elements_text(p) x;
  RETURN v_out;
END;
$$;

-- Webový zdroj: nový (bez id) nebo úprava (s id). Stejná adresa podruhé se
-- nezaloží — vrátí se existující záznam. Nový je vždy neověřený.
CREATE OR REPLACE FUNCTION public.bible_web_zdroj_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_pres_claude boolean, p_zdroj jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_url text;
  v_stav text;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Webový zdroj smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_zdroj) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí zdroj.' USING ERRCODE = '22023';
  END IF;
  v_url := trim(coalesce(p_zdroj ->> 'url', ''));
  IF nullif(p_zdroj ->> 'id', '') IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bible_web_zdroj_uloz'));
    SELECT id, stav INTO v_id, v_stav FROM public.bible_web_zdroje WHERE lower(url) = lower(v_url);
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_id, 'novy', false, 'stav', v_stav);
    END IF;
    INSERT INTO public.bible_web_zdroje (url, titulek, vydavatel, datum_publikace, shrnuti, oblasti, duvera, zapsal, zapsal_jmeno, pres_claude)
    VALUES (
      v_url, trim(coalesce(p_zdroj ->> 'titulek', '')), nullif(trim(coalesce(p_zdroj ->> 'vydavatel', '')), ''),
      nullif(p_zdroj ->> 'datum_publikace', '')::date, trim(coalesce(p_zdroj ->> 'shrnuti', '')),
      public.bible_oblasti_vstup(p_zdroj -> 'oblasti'), coalesce((p_zdroj ->> 'duvera')::smallint, 5),
      p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), ''), coalesce(p_pres_claude, false)
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'novy', true, 'stav', 'neovereno');
  END IF;
  v_id := (p_zdroj ->> 'id')::uuid;
  IF EXISTS (SELECT 1 FROM public.bible_web_zdroje WHERE lower(url) = lower(v_url) AND id <> v_id) THEN
    RAISE EXCEPTION 'Tahle adresa už v rešerši je u jiného zdroje.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bible_web_zdroje SET
    url = v_url,
    titulek = trim(coalesce(p_zdroj ->> 'titulek', '')),
    vydavatel = nullif(trim(coalesce(p_zdroj ->> 'vydavatel', '')), ''),
    datum_publikace = nullif(p_zdroj ->> 'datum_publikace', '')::date,
    shrnuti = trim(coalesce(p_zdroj ->> 'shrnuti', '')),
    oblasti = public.bible_oblasti_vstup(p_zdroj -> 'oblasti'),
    duvera = coalesce((p_zdroj ->> 'duvera')::smallint, 5),
    upraveno_at = now()
  WHERE id = v_id
  RETURNING stav INTO v_stav;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zdroj neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', v_id, 'novy', false, 'stav', v_stav);
END;
$$;

-- Ověření / zamítnutí / vrácení do neověřených — jen správce.
CREATE OR REPLACE FUNCTION public.bible_web_zdroj_over(p_uzivatel uuid, p_pristup text, p_jmeno text, p_id uuid, p_stav text, p_poznamka text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL OR p_pristup IS DISTINCT FROM 'spravuje' THEN
    RAISE EXCEPTION 'Webový zdroj ověřuje jen správce.' USING ERRCODE = '42501';
  END IF;
  IF p_stav IS NULL OR p_stav NOT IN ('neovereno', 'overeno', 'zamitnuto') THEN
    RAISE EXCEPTION 'Neznámý stav zdroje.' USING ERRCODE = '22023';
  END IF;
  IF p_poznamka IS NOT NULL AND length(p_poznamka) > 1000 THEN
    RAISE EXCEPTION 'Poznámka k ověření je moc dlouhá.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bible_web_zdroje SET
    stav = p_stav,
    overil = CASE WHEN p_stav = 'neovereno' THEN NULL ELSE p_uzivatel END,
    overil_jmeno = CASE WHEN p_stav = 'neovereno' THEN NULL ELSE nullif(trim(coalesce(p_jmeno, '')), '') END,
    overeno_at = CASE WHEN p_stav = 'neovereno' THEN NULL ELSE now() END,
    poznamka_overeni = nullif(trim(coalesce(p_poznamka, '')), ''),
    upraveno_at = now()
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Smazání zdroje: autor nebo správce.
CREATE OR REPLACE FUNCTION public.bible_web_zdroj_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Webový zdroj smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_web_zdroje WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup IS DISTINCT FROM 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje zdroje.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_web_zdroje WHERE id = p_id;
  RETURN true;
END;
$$;

-- Problém: nový (bez id) nebo úprava (s id).
CREATE OR REPLACE FUNCTION public.bible_problem_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_pres_claude boolean, p_problem jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_varky uuid[];
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Problém smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_problem) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí problém.' USING ERRCODE = '22023';
  END IF;
  IF p_problem ? 'varky' AND jsonb_typeof(p_problem -> 'varky') <> 'null' THEN
    IF jsonb_typeof(p_problem -> 'varky') <> 'array' OR jsonb_array_length(p_problem -> 'varky') > 12 THEN
      RAISE EXCEPTION 'Dotčené várky jsou seznam (nejvýš 12).' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT x::uuid), '{}') INTO v_varky FROM jsonb_array_elements_text(p_problem -> 'varky') x;
  ELSE
    v_varky := '{}';
  END IF;
  IF nullif(p_problem ->> 'id', '') IS NULL THEN
    INSERT INTO public.bible_problemy (nazev, popis, pivo, varky, oblasti, stav, reseni, zapsal, zapsal_jmeno, pres_claude)
    VALUES (
      trim(coalesce(p_problem ->> 'nazev', '')), nullif(trim(coalesce(p_problem ->> 'popis', '')), ''),
      nullif(trim(coalesce(p_problem ->> 'pivo', '')), ''), v_varky, public.bible_oblasti_vstup(p_problem -> 'oblasti'),
      coalesce(nullif(p_problem ->> 'stav', ''), 'otevreny'), nullif(trim(coalesce(p_problem ->> 'reseni', '')), ''),
      p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), ''), coalesce(p_pres_claude, false)
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  v_id := (p_problem ->> 'id')::uuid;
  UPDATE public.bible_problemy SET
    nazev = trim(coalesce(p_problem ->> 'nazev', '')),
    popis = nullif(trim(coalesce(p_problem ->> 'popis', '')), ''),
    pivo = nullif(trim(coalesce(p_problem ->> 'pivo', '')), ''),
    varky = v_varky,
    oblasti = public.bible_oblasti_vstup(p_problem -> 'oblasti'),
    stav = coalesce(nullif(p_problem ->> 'stav', ''), 'otevreny'),
    reseni = nullif(trim(coalesce(p_problem ->> 'reseni', '')), ''),
    upraveno_at = now()
  WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Problém neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- Smazání problému i se zjištěními: autor nebo správce.
CREATE OR REPLACE FUNCTION public.bible_problem_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Problém smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_problemy WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup IS DISTINCT FROM 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje problémy.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_problemy WHERE id = p_id;
  RETURN true;
END;
$$;

-- Zjištění k problému (nové). Fakt a výpočet musí mít zdroj (hlídá i CHECK).
CREATE OR REPLACE FUNCTION public.bible_zjisteni_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_pres_claude boolean, p_zjisteni jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_problem uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zjištění smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_zjisteni) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí zjištění.' USING ERRCODE = '22023';
  END IF;
  v_problem := nullif(p_zjisteni ->> 'problem_id', '')::uuid;
  IF v_problem IS NULL OR NOT EXISTS (SELECT 1 FROM public.bible_problemy WHERE id = v_problem) THEN
    RAISE EXCEPTION 'Problém neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_zjisteni ->> 'typ') IN ('fakt', 'vypocet') AND length(trim(coalesce(p_zjisteni ->> 'zdroj', ''))) = 0 THEN
    RAISE EXCEPTION 'Fakt a výpočet potřebují zdroj (kniha a strana, várka, výpočet…).' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.bible_problem_zjisteni (problem_id, typ, text, zdroj, zapsal, zapsal_jmeno, pres_claude)
  VALUES (
    v_problem, p_zjisteni ->> 'typ', trim(coalesce(p_zjisteni ->> 'text', '')), nullif(trim(coalesce(p_zjisteni ->> 'zdroj', '')), ''),
    p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), ''), coalesce(p_pres_claude, false)
  )
  RETURNING id INTO v_id;
  UPDATE public.bible_problemy SET upraveno_at = now() WHERE id = v_problem;
  RETURN v_id;
END;
$$;

-- Hypotézu (i jiné zjištění) potvrdí nebo vyvrátí přispěvatel; „navrzeno" vrátí zpět.
CREATE OR REPLACE FUNCTION public.bible_zjisteni_stav(p_uzivatel uuid, p_pristup text, p_id uuid, p_stav text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Stav zjištění smí měnit přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF p_stav IS NULL OR p_stav NOT IN ('navrzeno', 'potvrzeno', 'vyvraceno') THEN
    RAISE EXCEPTION 'Neznámý stav zjištění.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bible_problem_zjisteni SET stav = p_stav, upraveno_at = now() WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Smazání zjištění: autor nebo správce.
CREATE OR REPLACE FUNCTION public.bible_zjisteni_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zjištění smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_problem_zjisteni WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup IS DISTINCT FROM 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje zjištění.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_problem_zjisteni WHERE id = p_id;
  RETURN true;
END;
$$;

-- Čtení: webové zdroje (nejnovější zjištění první).
CREATE OR REPLACE FUNCTION public.bible_web_zdroje_prehled(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce((SELECT jsonb_agg(z.radek ORDER BY z.zjisteno DESC, z.created_at DESC) FROM (
    SELECT w.zjisteno, w.created_at, jsonb_build_object(
      'id', w.id, 'url', w.url, 'titulek', w.titulek, 'vydavatel', w.vydavatel, 'datum_publikace', w.datum_publikace,
      'zjisteno', w.zjisteno, 'shrnuti', w.shrnuti, 'oblasti', to_jsonb(w.oblasti), 'duvera', w.duvera, 'stav', w.stav,
      'overil_jmeno', w.overil_jmeno, 'overeno_at', w.overeno_at, 'poznamka_overeni', w.poznamka_overeni,
      'zapsal', w.zapsal, 'zapsal_jmeno', w.zapsal_jmeno, 'pres_claude', w.pres_claude
    ) AS radek
    FROM public.bible_web_zdroje w
    ORDER BY w.zjisteno DESC, w.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
  ) z), '[]'::jsonb)
$$;

-- Čtení: problémy se zjištěními (otevřené a naposled upravené první).
CREATE OR REPLACE FUNCTION public.bible_problemy_prehled(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce((SELECT jsonb_agg(p.radek ORDER BY p.otevreny DESC, p.upraveno_at DESC) FROM (
    SELECT (x.stav = 'otevreny') AS otevreny, x.upraveno_at, jsonb_build_object(
      'id', x.id, 'nazev', x.nazev, 'popis', x.popis, 'pivo', x.pivo, 'varky', to_jsonb(x.varky), 'oblasti', to_jsonb(x.oblasti),
      'stav', x.stav, 'reseni', x.reseni, 'zapsal', x.zapsal, 'zapsal_jmeno', x.zapsal_jmeno, 'pres_claude', x.pres_claude,
      'created_at', x.created_at, 'upraveno_at', x.upraveno_at,
      'zjisteni', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', z.id, 'typ', z.typ, 'text', z.text, 'zdroj', z.zdroj, 'stav', z.stav,
          'zapsal', z.zapsal, 'zapsal_jmeno', z.zapsal_jmeno, 'pres_claude', z.pres_claude, 'created_at', z.created_at
        ) ORDER BY z.created_at) FROM public.bible_problem_zjisteni z WHERE z.problem_id = x.id), '[]'::jsonb)
    ) AS radek
    FROM public.bible_problemy x
    ORDER BY (x.stav = 'otevreny') DESC, x.upraveno_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  ) p), '[]'::jsonb)
$$;

REVOKE ALL ON FUNCTION
  public.bible_oblasti_vstup(jsonb),
  public.bible_web_zdroj_uloz(uuid, text, text, boolean, jsonb),
  public.bible_web_zdroj_over(uuid, text, text, uuid, text, text),
  public.bible_web_zdroj_smaz(uuid, text, uuid),
  public.bible_problem_uloz(uuid, text, text, boolean, jsonb),
  public.bible_problem_smaz(uuid, text, uuid),
  public.bible_zjisteni_uloz(uuid, text, text, boolean, jsonb),
  public.bible_zjisteni_stav(uuid, text, uuid, text),
  public.bible_zjisteni_smaz(uuid, text, uuid),
  public.bible_web_zdroje_prehled(integer),
  public.bible_problemy_prehled(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_oblasti_vstup(jsonb),
  public.bible_web_zdroj_uloz(uuid, text, text, boolean, jsonb),
  public.bible_web_zdroj_over(uuid, text, text, uuid, text, text),
  public.bible_web_zdroj_smaz(uuid, text, uuid),
  public.bible_problem_uloz(uuid, text, text, boolean, jsonb),
  public.bible_problem_smaz(uuid, text, uuid),
  public.bible_zjisteni_uloz(uuid, text, text, boolean, jsonb),
  public.bible_zjisteni_stav(uuid, text, uuid, text),
  public.bible_zjisteni_smaz(uuid, text, uuid),
  public.bible_web_zdroje_prehled(integer),
  public.bible_problemy_prehled(integer)
  TO service_role;
