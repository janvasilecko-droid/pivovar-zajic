-- 🏭 Pivovarská bible — Technologie pivovaru (etapa 7).
--
-- Z architektury § 8: profil pivovaru — typ varny, objemy nádob, technologické
-- schéma, parametry zařízení, čerpadla, potrubí a ventily, výměníky, chlazení,
-- kvasné a ležácké tanky a provozní postupy; jde založit i další pivovary.
-- „AI odliší obecné znalosti od parametrů konkrétního provozu" — proto má každý
-- parametr svůj ZDROJ: štítek zařízení, dokumentace výrobce, změřeno, převzato
-- ze Sklepa v appce, nebo odhad.
--
-- Zapisuje se jen přes funkce níž (práva hlídají znovu, tabulky jsou pro
-- prohlížeč zavřené). Zakládat a upravovat smí přispěvatel; smazat celý
-- pivovar jen správce. Jen projekt bible; spouští majitel v appce:
-- Systém → Databázové migrace → Databáze bible. SQL je veřejné — žádná data.
-- Pustit podruhé nic nezmění.

CREATE TABLE IF NOT EXISTS public.bible_pivovary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 120),
  -- Typ varny, technologické schéma slovy (tok od šrotu po stáčení), zvláštnosti provozu.
  popis text CHECK (popis IS NULL OR length(popis) <= 4000),
  -- Náš pivovar — výchozí profil pro appku i Claude. Nejvýš jeden.
  hlavni boolean NOT NULL DEFAULT false,
  zalozil uuid NOT NULL,
  zalozil_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bible_pivovary_jeden_hlavni ON public.bible_pivovary ((hlavni)) WHERE hlavni;

CREATE TABLE IF NOT EXISTS public.bible_zarizeni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pivovar_id uuid NOT NULL REFERENCES public.bible_pivovary(id) ON DELETE CASCADE,
  druh text NOT NULL CHECK (druh IN (
    'varna', 'nadoba_varny', 'tank_kvasny', 'tank_lezacky', 'tank_jiny', 'cerpadlo', 'potrubi',
    'vymenik', 'chlazeni', 'filtr', 'staceni', 'cip', 'jine'
  )),
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 120),
  pocet smallint NOT NULL DEFAULT 1 CHECK (pocet BETWEEN 1 AND 999),
  -- [{nazev, hodnota (číslo) nebo text, jednotka, zdroj}] — kontroluje bible_parametry_vstup.
  parametry jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parametry) = 'array' AND jsonb_array_length(parametry) <= 40),
  poznamka text CHECK (poznamka IS NULL OR length(poznamka) <= 2000),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_zarizeni_pivovar_idx ON public.bible_zarizeni (pivovar_id, druh, nazev);

CREATE TABLE IF NOT EXISTS public.bible_postupy_provozu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pivovar_id uuid NOT NULL REFERENCES public.bible_pivovary(id) ON DELETE CASCADE,
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 200),
  oblast text CHECK (oblast IS NULL OR oblast ~ '^[A-T]$'),
  kroky text NOT NULL CHECK (length(trim(kroky)) BETWEEN 1 AND 12000),
  -- Odkud postup je (návod výrobce, vlastní praxe…); volný text.
  zdroj text CHECK (zdroj IS NULL OR length(zdroj) <= 500),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_postupy_provozu_pivovar_idx ON public.bible_postupy_provozu (pivovar_id, nazev);

ALTER TABLE public.bible_pivovary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_zarizeni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_postupy_provozu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_pivovary, public.bible_zarizeni, public.bible_postupy_provozu FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_pivovary, public.bible_zarizeni, public.bible_postupy_provozu TO service_role;

-- Parametry zařízení: pole objektů {nazev, hodnota|text, jednotka, zdroj}. Vrátí
-- očištěné pole, nebo selže se srozumitelnou hláškou.
CREATE OR REPLACE FUNCTION public.bible_parametry_vstup(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v jsonb;
  v_nazev text;
  v_text text;
  v_jednotka text;
  v_zdroj text;
  v_hodnota numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'array' THEN
    RAISE EXCEPTION 'Parametry musí být seznam.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p) > 40 THEN
    RAISE EXCEPTION 'Nejvýš 40 parametrů u jednoho zařízení.' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(v) <> 'object' THEN
      RAISE EXCEPTION 'Parametr musí mít název a hodnotu.' USING ERRCODE = '22023';
    END IF;
    v_nazev := trim(coalesce(v ->> 'nazev', ''));
    IF length(v_nazev) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Název parametru má 1 až 80 znaků.' USING ERRCODE = '22023';
    END IF;
    v_hodnota := NULL;
    IF jsonb_typeof(v -> 'hodnota') = 'number' THEN
      v_hodnota := (v ->> 'hodnota')::numeric;
    ELSIF v ? 'hodnota' AND jsonb_typeof(v -> 'hodnota') <> 'null' THEN
      RAISE EXCEPTION 'Hodnota parametru „%" musí být číslo (text patří do pole text).', v_nazev USING ERRCODE = '22023';
    END IF;
    v_text := nullif(trim(coalesce(v ->> 'text', '')), '');
    IF v_text IS NOT NULL AND length(v_text) > 200 THEN
      RAISE EXCEPTION 'Text parametru „%" má nejvýš 200 znaků.', v_nazev USING ERRCODE = '22023';
    END IF;
    IF v_hodnota IS NULL AND v_text IS NULL THEN
      RAISE EXCEPTION 'Parametr „%" nemá hodnotu.', v_nazev USING ERRCODE = '22023';
    END IF;
    v_jednotka := nullif(trim(coalesce(v ->> 'jednotka', '')), '');
    IF v_jednotka IS NOT NULL AND length(v_jednotka) > 30 THEN
      RAISE EXCEPTION 'Jednotka parametru „%" má nejvýš 30 znaků.', v_nazev USING ERRCODE = '22023';
    END IF;
    v_zdroj := coalesce(nullif(v ->> 'zdroj', ''), 'odhad');
    IF v_zdroj NOT IN ('stitek', 'dokumentace', 'zmereno', 'sklep', 'odhad') THEN
      RAISE EXCEPTION 'Neznámý zdroj parametru „%".', v_nazev USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'nazev', v_nazev, 'hodnota', v_hodnota, 'text', v_text, 'jednotka', v_jednotka, 'zdroj', v_zdroj
    )));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Pivovar: založení (bez id) nebo úprava (s id). „hlavni" přepne hlavní pivovar.
CREATE OR REPLACE FUNCTION public.bible_pivovar_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_pivovar jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_nazev text;
  v_popis text;
  v_hlavni boolean;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Profil pivovaru smí upravit přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_pivovar) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí pivovar.' USING ERRCODE = '22023';
  END IF;
  v_nazev := trim(coalesce(p_pivovar ->> 'nazev', ''));
  v_popis := nullif(trim(coalesce(p_pivovar ->> 'popis', '')), '');
  v_hlavni := coalesce((p_pivovar ->> 'hlavni')::boolean, false);
  PERFORM pg_advisory_xact_lock(hashtext('bible_pivovar_uloz'));
  IF nullif(p_pivovar ->> 'id', '') IS NULL THEN
    -- První pivovar je hlavní sám od sebe.
    IF NOT EXISTS (SELECT 1 FROM public.bible_pivovary) THEN
      v_hlavni := true;
    END IF;
    IF v_hlavni THEN
      UPDATE public.bible_pivovary SET hlavni = false, upraveno_at = now() WHERE hlavni;
    END IF;
    INSERT INTO public.bible_pivovary (nazev, popis, hlavni, zalozil, zalozil_jmeno)
    VALUES (v_nazev, v_popis, v_hlavni, p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  v_id := (p_pivovar ->> 'id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = v_id) THEN
    RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  IF v_hlavni THEN
    UPDATE public.bible_pivovary SET hlavni = false, upraveno_at = now() WHERE hlavni AND id <> v_id;
  ELSIF (SELECT hlavni FROM public.bible_pivovary WHERE id = v_id) THEN
    -- Hlavní pivovar se nepřepne na „žádný" — vybere se jiný jako hlavní.
    v_hlavni := true;
  END IF;
  UPDATE public.bible_pivovary
     SET nazev = v_nazev, popis = v_popis, hlavni = v_hlavni, upraveno_at = now()
   WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- Smazání pivovaru i se zařízením a postupy — jen správce. Smaže-li se hlavní,
-- hlavním se stane nejstarší zbývající (ať je hlavní vždy právě jeden).
CREATE OR REPLACE FUNCTION public.bible_pivovar_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_smazano boolean;
BEGIN
  IF p_uzivatel IS NULL OR p_pristup IS DISTINCT FROM 'spravuje' THEN
    RAISE EXCEPTION 'Smazat celý profil pivovaru smí jen správce.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bible_pivovar_uloz'));
  DELETE FROM public.bible_pivovary WHERE id = p_id;
  v_smazano := FOUND;
  IF v_smazano AND NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE hlavni) THEN
    UPDATE public.bible_pivovary SET hlavni = true, upraveno_at = now()
     WHERE id = (SELECT id FROM public.bible_pivovary ORDER BY created_at, id LIMIT 1);
  END IF;
  RETURN v_smazano;
END;
$$;

-- Zařízení: založení (bez id, s pivovar_id) nebo úprava (s id; pivovar se nemění).
CREATE OR REPLACE FUNCTION public.bible_zarizeni_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_zarizeni jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pivovar uuid;
  v_parametry jsonb;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zařízení smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_zarizeni) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí zařízení.' USING ERRCODE = '22023';
  END IF;
  v_parametry := public.bible_parametry_vstup(p_zarizeni -> 'parametry');
  IF nullif(p_zarizeni ->> 'id', '') IS NULL THEN
    v_pivovar := nullif(p_zarizeni ->> 'pivovar_id', '')::uuid;
    IF v_pivovar IS NULL OR NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = v_pivovar) THEN
      RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.bible_zarizeni (pivovar_id, druh, nazev, pocet, parametry, poznamka, zapsal, zapsal_jmeno)
    VALUES (
      v_pivovar, p_zarizeni ->> 'druh', trim(coalesce(p_zarizeni ->> 'nazev', '')),
      coalesce((p_zarizeni ->> 'pocet')::smallint, 1), v_parametry,
      nullif(trim(coalesce(p_zarizeni ->> 'poznamka', '')), ''), p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), '')
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  v_id := (p_zarizeni ->> 'id')::uuid;
  UPDATE public.bible_zarizeni SET
    druh = p_zarizeni ->> 'druh',
    nazev = trim(coalesce(p_zarizeni ->> 'nazev', '')),
    pocet = coalesce((p_zarizeni ->> 'pocet')::smallint, 1),
    parametry = v_parametry,
    poznamka = nullif(trim(coalesce(p_zarizeni ->> 'poznamka', '')), ''),
    upraveno_at = now()
  WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zařízení neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- Víc zařízení najednou (převzetí tanků ze Sklepa): jedna transakce, zařízení
-- se stejným názvem v pivovaru se přeskočí. Vrací počet nově zapsaných.
CREATE OR REPLACE FUNCTION public.bible_zarizeni_prevezmi(p_uzivatel uuid, p_pristup text, p_jmeno text, p_pivovar uuid, p_seznam jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_pocet integer := 0;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zařízení smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_seznam) IS DISTINCT FROM 'array' OR jsonb_array_length(p_seznam) > 200 THEN
    RAISE EXCEPTION 'Seznam zařízení je prázdný nebo moc dlouhý (nejvýš 200).' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = p_pivovar) THEN
    RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_seznam) LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.bible_zarizeni
       WHERE pivovar_id = p_pivovar AND lower(nazev) = lower(trim(coalesce(v ->> 'nazev', '')))
    );
    PERFORM public.bible_zarizeni_uloz(p_uzivatel, p_pristup, p_jmeno,
      (v - 'id') || jsonb_build_object('pivovar_id', p_pivovar));
    v_pocet := v_pocet + 1;
  END LOOP;
  RETURN v_pocet;
END;
$$;

CREATE OR REPLACE FUNCTION public.bible_zarizeni_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Zařízení smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_zarizeni WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Provozní postup: založení (bez id, s pivovar_id) nebo úprava (s id).
CREATE OR REPLACE FUNCTION public.bible_postup_provozu_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_postup jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pivovar uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Provozní postup smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_postup) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí postup.' USING ERRCODE = '22023';
  END IF;
  IF nullif(p_postup ->> 'id', '') IS NULL THEN
    v_pivovar := nullif(p_postup ->> 'pivovar_id', '')::uuid;
    IF v_pivovar IS NULL OR NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = v_pivovar) THEN
      RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.bible_postupy_provozu (pivovar_id, nazev, oblast, kroky, zdroj, zapsal, zapsal_jmeno)
    VALUES (
      v_pivovar, trim(coalesce(p_postup ->> 'nazev', '')), nullif(p_postup ->> 'oblast', ''),
      trim(coalesce(p_postup ->> 'kroky', '')), nullif(trim(coalesce(p_postup ->> 'zdroj', '')), ''),
      p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), '')
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  v_id := (p_postup ->> 'id')::uuid;
  UPDATE public.bible_postupy_provozu SET
    nazev = trim(coalesce(p_postup ->> 'nazev', '')),
    oblast = nullif(p_postup ->> 'oblast', ''),
    kroky = trim(coalesce(p_postup ->> 'kroky', '')),
    zdroj = nullif(trim(coalesce(p_postup ->> 'zdroj', '')), ''),
    upraveno_at = now()
  WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Postup neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bible_postup_provozu_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Provozní postup smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_postupy_provozu WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Čtení: seznam pivovarů a zařízení s postupy vybraného (bez id hlavní, jinak nejstarší).
CREATE OR REPLACE FUNCTION public.bible_technologie(p_pivovar uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH vybrany AS (
    SELECT id FROM public.bible_pivovary
     WHERE (p_pivovar IS NOT NULL AND id = p_pivovar)
        OR (p_pivovar IS NULL)
     ORDER BY (id = p_pivovar) DESC NULLS LAST, hlavni DESC, created_at
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'pivovary', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'nazev', p.nazev, 'popis', p.popis, 'hlavni', p.hlavni,
        'zalozil_jmeno', p.zalozil_jmeno, 'upraveno_at', p.upraveno_at
      ) ORDER BY p.hlavni DESC, p.nazev) FROM public.bible_pivovary p), '[]'::jsonb),
    'pivovar_id', (SELECT id FROM vybrany),
    'zarizeni', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', z.id, 'druh', z.druh, 'nazev', z.nazev, 'pocet', z.pocet, 'parametry', z.parametry,
        'poznamka', z.poznamka, 'zapsal_jmeno', z.zapsal_jmeno, 'upraveno_at', z.upraveno_at
      ) ORDER BY z.druh, z.nazev) FROM public.bible_zarizeni z WHERE z.pivovar_id = (SELECT id FROM vybrany)), '[]'::jsonb),
    'postupy', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'nazev', s.nazev, 'oblast', s.oblast, 'kroky', s.kroky, 'zdroj', s.zdroj,
        'zapsal_jmeno', s.zapsal_jmeno, 'upraveno_at', s.upraveno_at
      ) ORDER BY s.nazev) FROM public.bible_postupy_provozu s WHERE s.pivovar_id = (SELECT id FROM vybrany)), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION
  public.bible_parametry_vstup(jsonb),
  public.bible_pivovar_uloz(uuid, text, text, jsonb),
  public.bible_pivovar_smaz(uuid, text, uuid),
  public.bible_zarizeni_uloz(uuid, text, text, jsonb),
  public.bible_zarizeni_prevezmi(uuid, text, text, uuid, jsonb),
  public.bible_zarizeni_smaz(uuid, text, uuid),
  public.bible_postup_provozu_uloz(uuid, text, text, jsonb),
  public.bible_postup_provozu_smaz(uuid, text, uuid),
  public.bible_technologie(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_parametry_vstup(jsonb),
  public.bible_pivovar_uloz(uuid, text, text, jsonb),
  public.bible_pivovar_smaz(uuid, text, uuid),
  public.bible_zarizeni_uloz(uuid, text, text, jsonb),
  public.bible_zarizeni_prevezmi(uuid, text, text, uuid, jsonb),
  public.bible_zarizeni_smaz(uuid, text, uuid),
  public.bible_postup_provozu_uloz(uuid, text, text, jsonb),
  public.bible_postup_provozu_smaz(uuid, text, uuid),
  public.bible_technologie(uuid)
  TO service_role;
