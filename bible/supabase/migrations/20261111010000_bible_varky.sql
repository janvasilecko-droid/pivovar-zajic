-- 🍺 Pivovarská bible — Receptury a várky (etapa 8).
--
-- Z architektury § 8: receptura, slady, voda, rmutování, scezování, hustoty,
-- objemy, chmelovar, kvašení, ležení a laboratorní hodnoty. AI porovnává várky
-- a hledá příčiny odchylek — „pracuje jen s uloženými údaji, chybějící
-- hodnoty vyjmenuje, nedomýšlí je". Proto má každá hodnota várky pevný klíč
-- s jednotkou a rozsahem (katalog níž = _shared/varky-popisy.ts, hlídá test):
-- co není zapsané, v evidenci prostě chybí, nic se nedoplňuje.
--
-- Hlavní appka zatím várky nezapisuje (Sklep: cellar_batches je prázdná),
-- evidence proto žije tady (projekt bible je oddělený, R12).
--
-- Zapisuje se jen přes funkce níž (práva hlídají znovu, tabulky jsou pro
-- prohlížeč zavřené). Zapisuje a upravuje přispěvatel (várku doplňuje víc
-- lidí: varna, sklep, laboratoř); smazat smí autor záznamu nebo správce.
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádná data. Pustit podruhé nic nezmění.

CREATE TABLE IF NOT EXISTS public.bible_receptury (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pivovar_id uuid REFERENCES public.bible_pivovary(id) ON DELETE SET NULL,
  nazev text NOT NULL CHECK (length(trim(nazev)) BETWEEN 1 AND 120),
  styl text CHECK (styl IS NULL OR length(styl) <= 120),
  -- Cílové hodnoty receptury (porovnání s várkami).
  cil_objem_hl numeric CHECK (cil_objem_hl IS NULL OR cil_objem_hl BETWEEN 0.01 AND 2000),
  cil_stupnovitost numeric CHECK (cil_stupnovitost IS NULL OR cil_stupnovitost BETWEEN 1 AND 35),
  cil_alkohol numeric CHECK (cil_alkohol IS NULL OR cil_alkohol BETWEEN 0 AND 20),
  cil_ibu numeric CHECK (cil_ibu IS NULL OR cil_ibu BETWEEN 0 AND 200),
  cil_barva_ebc numeric CHECK (cil_barva_ebc IS NULL OR cil_barva_ebc BETWEEN 0 AND 300),
  -- [{druh, nazev, mnozstvi, jednotka, kdy, poznamka}] — kontroluje bible_suroviny_vstup.
  suroviny jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suroviny) = 'array' AND jsonb_array_length(suroviny) <= 60),
  -- [{faze, nazev, teplota_c, minut, poznamka}] — kontroluje bible_kroky_vstup.
  kroky jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(kroky) = 'array' AND jsonb_array_length(kroky) <= 40),
  poznamka text CHECK (poznamka IS NULL OR length(poznamka) <= 4000),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_receptury_nazev_idx ON public.bible_receptury (nazev);
CREATE INDEX IF NOT EXISTS bible_receptury_pivovar_idx ON public.bible_receptury (pivovar_id);

CREATE TABLE IF NOT EXISTS public.bible_varky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pivovar_id uuid REFERENCES public.bible_pivovary(id) ON DELETE SET NULL,
  receptura_id uuid REFERENCES public.bible_receptury(id) ON DELETE SET NULL,
  -- Číslo várky (jak se píše v provozu); v pivovaru nejvýš jednou.
  cislo text CHECK (cislo IS NULL OR length(trim(cislo)) BETWEEN 1 AND 40),
  pivo text NOT NULL CHECK (length(trim(pivo)) BETWEEN 1 AND 120),
  datum_varu date NOT NULL CHECK (datum_varu BETWEEN DATE '1990-01-01' AND DATE '2100-12-31'),
  -- {klic: číslo} podle katalogu bible_katalog_hodnot_varky; chybějící klíč = nezapsáno.
  hodnoty jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(hodnoty) = 'object'),
  -- Průběh a odchylky od receptury.
  poznamka text CHECK (poznamka IS NULL OR length(poznamka) <= 4000),
  zapsal uuid NOT NULL,
  zapsal_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upraveno_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_varky_datum_idx ON public.bible_varky (datum_varu DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS bible_varky_receptura_idx ON public.bible_varky (receptura_id, datum_varu DESC);
CREATE INDEX IF NOT EXISTS bible_varky_pivovar_idx ON public.bible_varky (pivovar_id, datum_varu DESC);
-- Pojistka proti dvojí várce v pivovaru. Jen u várek s pivovarem: smazání
-- pivovaru várkám pivovar vynuluje a stejná čísla z různých pivovarů se pak
-- nesmí srazit (smazání by selhalo). Várky bez pivovaru hlídá bible_varka_uloz.
CREATE UNIQUE INDEX IF NOT EXISTS bible_varky_cislo_uniq
  ON public.bible_varky (pivovar_id, lower(trim(cislo)))
  WHERE cislo IS NOT NULL AND pivovar_id IS NOT NULL;

ALTER TABLE public.bible_receptury ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_varky ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_receptury, public.bible_varky FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_receptury, public.bible_varky TO service_role;

-- Katalog hodnot várky: klíč, rozsah, celé číslo. Stejný seznam je
-- v _shared/varky-popisy.ts (HODNOTY_VARKY) — shodu hlídá test.
CREATE OR REPLACE FUNCTION public.bible_katalog_hodnot_varky()
RETURNS TABLE (klic text, min_hodnota numeric, max_hodnota numeric, cele boolean)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT * FROM (VALUES
    ('sypani_kg', 0.1, 200000, false),
    ('voda_vystirka_l', 1, 1000000, false),
    ('rmut_ph', 3, 8, false),
    ('rmutovani_min', 1, 1000, false),
    ('voda_vyslazovaci_l', 0, 1000000, false),
    ('predek_p', 0, 35, false),
    ('posledni_sladina_p', 0, 20, false),
    ('scezovani_min', 1, 1000, false),
    ('sladina_objem_hl', 0.01, 2000, false),
    ('sladina_p', 0, 35, false),
    ('chmelovar_min', 1, 600, false),
    ('mladina_objem_hl', 0.01, 2000, false),
    ('mladina_p', 1, 35, false),
    ('mladina_ph', 3, 8, false),
    ('zakvaseno_hl', 0.01, 2000, false),
    ('zakvaseni_teplota_c', -2, 40, false),
    ('kvasnice_generace', 0, 100, true),
    ('kvasnice_l', 0, 100000, false),
    ('kvaseni_max_teplota_c', -2, 40, false),
    ('kvaseni_dnu', 0, 120, false),
    ('mlade_pivo_p', -2, 25, false),
    ('lezeni_dnu', 0, 400, false),
    ('lezeni_teplota_c', -5, 30, false),
    ('pivo_zdanlivy_p', -2, 25, false),
    ('pivo_alkohol_obj', 0, 20, false),
    ('pivo_ph', 3, 6, false),
    ('pivo_barva_ebc', 0, 300, false),
    ('pivo_ibu', 0, 200, false),
    ('pivo_co2_g_l', 0, 15, false),
    ('stoceno_hl', 0, 2000, false)
  ) AS k(klic, min_hodnota, max_hodnota, cele)
$$;

-- Hodnoty várky: objekt {klic: číslo}. null = nezapsáno (vynechá se). Vrátí
-- očištěný objekt, nebo selže se srozumitelnou hláškou.
CREATE OR REPLACE FUNCTION public.bible_hodnoty_varky_vstup(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  r record;
  k record;
  v_cislo numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Hodnoty várky musí být objekt {klíč: číslo}.' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT key, value FROM jsonb_each(p) LOOP
    SELECT * INTO k FROM public.bible_katalog_hodnot_varky() c WHERE c.klic = r.key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Neznámá hodnota várky „%".', left(r.key, 60) USING ERRCODE = '22023';
    END IF;
    CONTINUE WHEN jsonb_typeof(r.value) = 'null';
    IF jsonb_typeof(r.value) <> 'number' THEN
      RAISE EXCEPTION 'Hodnota „%" musí být číslo.', r.key USING ERRCODE = '22023';
    END IF;
    v_cislo := (r.value)::numeric;
    IF v_cislo < k.min_hodnota OR v_cislo > k.max_hodnota THEN
      RAISE EXCEPTION 'Hodnota „%" je mimo rozsah % až %.', r.key, k.min_hodnota, k.max_hodnota USING ERRCODE = '22023';
    END IF;
    IF k.cele AND v_cislo <> trunc(v_cislo) THEN
      RAISE EXCEPTION 'Hodnota „%" musí být celé číslo.', r.key USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object(r.key, v_cislo);
  END LOOP;
  RETURN v_out;
END;
$$;

-- Suroviny receptury: [{druh, nazev, mnozstvi, jednotka, kdy, poznamka}].
CREATE OR REPLACE FUNCTION public.bible_suroviny_vstup(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v jsonb;
  v_druh text;
  v_nazev text;
  v_mnozstvi numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 60 THEN
    RAISE EXCEPTION 'Suroviny musí být seznam (nejvýš 60).' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(v) <> 'object' THEN
      RAISE EXCEPTION 'Surovina musí mít druh a název.' USING ERRCODE = '22023';
    END IF;
    v_druh := v ->> 'druh';
    IF v_druh IS NULL OR v_druh NOT IN ('slad', 'chmel', 'kvasnice', 'voda', 'prisada') THEN
      RAISE EXCEPTION 'Neznámý druh suroviny.' USING ERRCODE = '22023';
    END IF;
    v_nazev := trim(coalesce(v ->> 'nazev', ''));
    IF length(v_nazev) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Název suroviny má 1 až 120 znaků.' USING ERRCODE = '22023';
    END IF;
    v_mnozstvi := NULL;
    IF jsonb_typeof(v -> 'mnozstvi') = 'number' THEN
      v_mnozstvi := (v ->> 'mnozstvi')::numeric;
      IF v_mnozstvi <= 0 OR v_mnozstvi > 1000000 THEN
        RAISE EXCEPTION 'Množství suroviny „%" musí být kladné.', v_nazev USING ERRCODE = '22023';
      END IF;
    ELSIF v ? 'mnozstvi' AND jsonb_typeof(v -> 'mnozstvi') <> 'null' THEN
      RAISE EXCEPTION 'Množství suroviny „%" musí být číslo.', v_nazev USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v ->> 'jednotka', '')) > 20 OR length(coalesce(v ->> 'kdy', '')) > 60 OR length(coalesce(v ->> 'poznamka', '')) > 200 THEN
      RAISE EXCEPTION 'Údaje suroviny „%" jsou moc dlouhé.', v_nazev USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'druh', v_druh, 'nazev', v_nazev, 'mnozstvi', v_mnozstvi,
      'jednotka', nullif(trim(coalesce(v ->> 'jednotka', '')), ''),
      'kdy', nullif(trim(coalesce(v ->> 'kdy', '')), ''),
      'poznamka', nullif(trim(coalesce(v ->> 'poznamka', '')), '')
    )));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Kroky receptury: [{faze, nazev, teplota_c, minut, poznamka}].
CREATE OR REPLACE FUNCTION public.bible_kroky_vstup(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v jsonb;
  v_faze text;
  v_nazev text;
  v_teplota numeric;
  v_minut numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 40 THEN
    RAISE EXCEPTION 'Kroky musí být seznam (nejvýš 40).' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(v) <> 'object' THEN
      RAISE EXCEPTION 'Krok musí mít fázi a název.' USING ERRCODE = '22023';
    END IF;
    v_faze := v ->> 'faze';
    IF v_faze IS NULL OR v_faze NOT IN ('rmutovani', 'scezovani', 'chmelovar', 'chlazeni', 'kvaseni', 'lezeni', 'jine') THEN
      RAISE EXCEPTION 'Neznámá fáze kroku.' USING ERRCODE = '22023';
    END IF;
    v_nazev := trim(coalesce(v ->> 'nazev', ''));
    IF length(v_nazev) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Název kroku má 1 až 120 znaků.' USING ERRCODE = '22023';
    END IF;
    v_teplota := NULL;
    IF jsonb_typeof(v -> 'teplota_c') = 'number' THEN
      v_teplota := (v ->> 'teplota_c')::numeric;
      IF v_teplota < -5 OR v_teplota > 110 THEN
        RAISE EXCEPTION 'Teplota kroku „%" je mimo rozsah −5 až 110 °C.', v_nazev USING ERRCODE = '22023';
      END IF;
    ELSIF v ? 'teplota_c' AND jsonb_typeof(v -> 'teplota_c') <> 'null' THEN
      RAISE EXCEPTION 'Teplota kroku „%" musí být číslo.', v_nazev USING ERRCODE = '22023';
    END IF;
    v_minut := NULL;
    IF jsonb_typeof(v -> 'minut') = 'number' THEN
      v_minut := (v ->> 'minut')::numeric;
      IF v_minut < 0 OR v_minut > 100000 THEN
        RAISE EXCEPTION 'Délka kroku „%" je mimo rozsah.', v_nazev USING ERRCODE = '22023';
      END IF;
    ELSIF v ? 'minut' AND jsonb_typeof(v -> 'minut') <> 'null' THEN
      RAISE EXCEPTION 'Délka kroku „%" musí být číslo.', v_nazev USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v ->> 'poznamka', '')) > 200 THEN
      RAISE EXCEPTION 'Poznámka kroku „%" je moc dlouhá.', v_nazev USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'faze', v_faze, 'nazev', v_nazev, 'teplota_c', v_teplota, 'minut', v_minut,
      'poznamka', nullif(trim(coalesce(v ->> 'poznamka', '')), '')
    )));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Číslo cíle receptury z JSON (null = bez cíle); text místo čísla selže.
CREATE OR REPLACE FUNCTION public.bible_cislo_vstup(p jsonb, p_co text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) <> 'number' THEN
    RAISE EXCEPTION '% musí být číslo.', p_co USING ERRCODE = '22023';
  END IF;
  RETURN p::numeric;
END;
$$;

-- Receptura: založení (bez id) nebo úprava (s id).
CREATE OR REPLACE FUNCTION public.bible_receptura_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_receptura jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pivovar uuid;
  v_suroviny jsonb;
  v_kroky jsonb;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Recepturu smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_receptura) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí receptura.' USING ERRCODE = '22023';
  END IF;
  v_pivovar := nullif(p_receptura ->> 'pivovar_id', '')::uuid;
  IF v_pivovar IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = v_pivovar) THEN
    RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  v_suroviny := public.bible_suroviny_vstup(p_receptura -> 'suroviny');
  v_kroky := public.bible_kroky_vstup(p_receptura -> 'kroky');
  IF nullif(p_receptura ->> 'id', '') IS NULL THEN
    INSERT INTO public.bible_receptury (
      pivovar_id, nazev, styl, cil_objem_hl, cil_stupnovitost, cil_alkohol, cil_ibu, cil_barva_ebc,
      suroviny, kroky, poznamka, zapsal, zapsal_jmeno
    ) VALUES (
      v_pivovar, trim(coalesce(p_receptura ->> 'nazev', '')), nullif(trim(coalesce(p_receptura ->> 'styl', '')), ''),
      public.bible_cislo_vstup(p_receptura -> 'cil_objem_hl', 'Cílový objem'),
      public.bible_cislo_vstup(p_receptura -> 'cil_stupnovitost', 'Cílová stupňovitost'),
      public.bible_cislo_vstup(p_receptura -> 'cil_alkohol', 'Cílový alkohol'),
      public.bible_cislo_vstup(p_receptura -> 'cil_ibu', 'Cílová hořkost'),
      public.bible_cislo_vstup(p_receptura -> 'cil_barva_ebc', 'Cílová barva'),
      v_suroviny, v_kroky, nullif(trim(coalesce(p_receptura ->> 'poznamka', '')), ''),
      p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), '')
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  v_id := (p_receptura ->> 'id')::uuid;
  UPDATE public.bible_receptury SET
    pivovar_id = v_pivovar,
    nazev = trim(coalesce(p_receptura ->> 'nazev', '')),
    styl = nullif(trim(coalesce(p_receptura ->> 'styl', '')), ''),
    cil_objem_hl = public.bible_cislo_vstup(p_receptura -> 'cil_objem_hl', 'Cílový objem'),
    cil_stupnovitost = public.bible_cislo_vstup(p_receptura -> 'cil_stupnovitost', 'Cílová stupňovitost'),
    cil_alkohol = public.bible_cislo_vstup(p_receptura -> 'cil_alkohol', 'Cílový alkohol'),
    cil_ibu = public.bible_cislo_vstup(p_receptura -> 'cil_ibu', 'Cílová hořkost'),
    cil_barva_ebc = public.bible_cislo_vstup(p_receptura -> 'cil_barva_ebc', 'Cílová barva'),
    suroviny = v_suroviny,
    kroky = v_kroky,
    poznamka = nullif(trim(coalesce(p_receptura ->> 'poznamka', '')), ''),
    upraveno_at = now()
  WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receptura neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- Smazání receptury: autor nebo správce. Várky zůstanou (receptura_id se vynuluje).
CREATE OR REPLACE FUNCTION public.bible_receptura_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Recepturu smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_receptury WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup IS DISTINCT FROM 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje receptury.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_receptury WHERE id = p_id;
  RETURN true;
END;
$$;

-- Várka: založení (bez id) nebo úprava (s id). Číslo várky je v pivovaru nejvýš jednou.
CREATE OR REPLACE FUNCTION public.bible_varka_uloz(p_uzivatel uuid, p_pristup text, p_jmeno text, p_varka jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pivovar uuid;
  v_receptura uuid;
  v_cislo text;
  v_hodnoty jsonb;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Várku smí zapsat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_varka) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí várka.' USING ERRCODE = '22023';
  END IF;
  v_id := nullif(p_varka ->> 'id', '')::uuid;
  v_pivovar := nullif(p_varka ->> 'pivovar_id', '')::uuid;
  v_receptura := nullif(p_varka ->> 'receptura_id', '')::uuid;
  v_cislo := nullif(trim(coalesce(p_varka ->> 'cislo', '')), '');
  IF v_pivovar IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bible_pivovary WHERE id = v_pivovar) THEN
    RAISE EXCEPTION 'Pivovar neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  IF v_receptura IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bible_receptury WHERE id = v_receptura) THEN
    RAISE EXCEPTION 'Receptura neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  v_hodnoty := public.bible_hodnoty_varky_vstup(p_varka -> 'hodnoty');
  -- Dvě souběžná uložení stejného čísla: druhé počká a duplicitu pozná.
  PERFORM pg_advisory_xact_lock(hashtext('bible_varka_uloz'));
  IF v_cislo IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bible_varky
     WHERE coalesce(pivovar_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_pivovar, '00000000-0000-0000-0000-000000000000'::uuid)
       AND lower(trim(cislo)) = lower(v_cislo)
       AND (v_id IS NULL OR id <> v_id)
  ) THEN
    RAISE EXCEPTION 'Várka s číslem „%" už v evidenci je.', v_cislo USING ERRCODE = '22023';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.bible_varky (pivovar_id, receptura_id, cislo, pivo, datum_varu, hodnoty, poznamka, zapsal, zapsal_jmeno)
    VALUES (
      v_pivovar, v_receptura, v_cislo, trim(coalesce(p_varka ->> 'pivo', '')), (p_varka ->> 'datum_varu')::date,
      v_hodnoty, nullif(trim(coalesce(p_varka ->> 'poznamka', '')), ''), p_uzivatel, nullif(trim(coalesce(p_jmeno, '')), '')
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.bible_varky SET
    pivovar_id = v_pivovar,
    receptura_id = v_receptura,
    cislo = v_cislo,
    pivo = trim(coalesce(p_varka ->> 'pivo', '')),
    datum_varu = (p_varka ->> 'datum_varu')::date,
    hodnoty = v_hodnoty,
    poznamka = nullif(trim(coalesce(p_varka ->> 'poznamka', '')), ''),
    upraveno_at = now()
  WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Várka neexistuje.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- Smazání várky: autor nebo správce.
CREATE OR REPLACE FUNCTION public.bible_varka_smaz(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_zapsal uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Várku smí smazat přispěvatel nebo správce.' USING ERRCODE = '42501';
  END IF;
  SELECT zapsal INTO v_zapsal FROM public.bible_varky WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup IS DISTINCT FROM 'spravuje' AND v_zapsal IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Smazat smíš jen svoje várky.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_varky WHERE id = p_id;
  RETURN true;
END;
$$;

-- Čtení: receptury a várky (nejnovější první, nejvýš p_limit várek).
CREATE OR REPLACE FUNCTION public.bible_varky_prehled(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'receptury', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'pivovar_id', r.pivovar_id, 'nazev', r.nazev, 'styl', r.styl,
        'cil_objem_hl', r.cil_objem_hl, 'cil_stupnovitost', r.cil_stupnovitost, 'cil_alkohol', r.cil_alkohol,
        'cil_ibu', r.cil_ibu, 'cil_barva_ebc', r.cil_barva_ebc, 'suroviny', r.suroviny, 'kroky', r.kroky,
        'poznamka', r.poznamka, 'zapsal', r.zapsal, 'zapsal_jmeno', r.zapsal_jmeno, 'upraveno_at', r.upraveno_at
      ) ORDER BY r.nazev) FROM public.bible_receptury r), '[]'::jsonb),
    'varky', coalesce((SELECT jsonb_agg(v.radek ORDER BY v.datum_varu DESC, v.created_at DESC) FROM (
        SELECT x.datum_varu, x.created_at, jsonb_build_object(
          'id', x.id, 'pivovar_id', x.pivovar_id, 'receptura_id', x.receptura_id, 'cislo', x.cislo, 'pivo', x.pivo,
          'datum_varu', x.datum_varu, 'hodnoty', x.hodnoty, 'poznamka', x.poznamka,
          'zapsal', x.zapsal, 'zapsal_jmeno', x.zapsal_jmeno, 'upraveno_at', x.upraveno_at
        ) AS radek
        FROM public.bible_varky x
        ORDER BY x.datum_varu DESC, x.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
      ) v), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION
  public.bible_katalog_hodnot_varky(),
  public.bible_hodnoty_varky_vstup(jsonb),
  public.bible_suroviny_vstup(jsonb),
  public.bible_kroky_vstup(jsonb),
  public.bible_cislo_vstup(jsonb, text),
  public.bible_receptura_uloz(uuid, text, text, jsonb),
  public.bible_receptura_smaz(uuid, text, uuid),
  public.bible_varka_uloz(uuid, text, text, jsonb),
  public.bible_varka_smaz(uuid, text, uuid),
  public.bible_varky_prehled(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_katalog_hodnot_varky(),
  public.bible_hodnoty_varky_vstup(jsonb),
  public.bible_suroviny_vstup(jsonb),
  public.bible_kroky_vstup(jsonb),
  public.bible_cislo_vstup(jsonb, text),
  public.bible_receptura_uloz(uuid, text, text, jsonb),
  public.bible_receptura_smaz(uuid, text, uuid),
  public.bible_varka_uloz(uuid, text, text, jsonb),
  public.bible_varka_smaz(uuid, text, uuid),
  public.bible_varky_prehled(integer)
  TO service_role;
