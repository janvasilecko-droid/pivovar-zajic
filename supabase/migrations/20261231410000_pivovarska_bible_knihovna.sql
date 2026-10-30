-- 📚 Pivovarská bible — Etapa 1: odborná knihovna (dokumenty, přístup, úložiště).
--
-- Zadání 30. 10. 2026: odborná knihovna pivovarské literatury (Kunze a celá
-- složka „knihy pivo"), nad kterou bude odpovídat AI (Claude) s citací
-- kniha–kapitola–strana. Návrh: docs/pivovarska-bible/ARCHITEKTURA.md.
--
-- Tahle migrace zakládá jen knihovnu: evidenci nahraných dokumentů, soukromý
-- bucket a kontrolu přístupu. Texty stran a pasáže přijdou se zpracováním
-- (Etapa 2). SQL migrací je veřejné (migrace-sql.json) — nesmí sem žádný
-- obsah knih.
--
-- PŘÍSTUP JE FAIL-CLOSED, na rozdíl od zbytku appky (tam čtou všichni
-- přihlášení). Knihy jsou soukromé a chráněné autorským právem:
--   * admin / šéf / sládek / boss / manažer → správa (nahrát, upravit, smazat)
--   * ostatní jen s modulem „Pivovarská bible" v Uživatelé → Práva
--     (profiles.permissions.bible: view = číst, view + edit = nahrávat)
--   * cokoli jiného — i chyba při zjišťování — bez přístupu
-- profiles.permissions si uživatel sám změnit nemůže
-- (trg_prevent_own_permissions_escalation, 20261130000000). Stejné pravidlo
-- má appka v src/lib/bibleOpravneni.ts (test hlídá, že se neliší).

-- ---------------------------------------------------------------------------
-- 1) Kdo smí do knihovny
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bible_pristup()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_perm jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT lower(trim(coalesce(role, ''))), permissions INTO v_role, v_perm
    FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('admin', 'sef', 'sladek', 'boss', 'manager') THEN
    RETURN 'spravuje';
  END IF;
  IF jsonb_typeof(v_perm -> 'bible') = 'object' AND (v_perm -> 'bible' ->> 'view') = 'true' THEN
    IF (v_perm -> 'bible' ->> 'edit') = 'true' THEN
      RETURN 'prispiva';
    END IF;
    RETURN 'cte';
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- fail-closed: při chybě žádný přístup
END;
$$;

CREATE OR REPLACE FUNCTION public.bible_smi_cist()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.bible_pristup() IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.bible_smi_prispivat()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(public.bible_pristup() IN ('prispiva', 'spravuje'), false) $$;

CREATE OR REPLACE FUNCTION public.bible_smi_spravovat()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(public.bible_pristup() = 'spravuje', false) $$;

REVOKE ALL ON FUNCTION public.bible_pristup() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bible_smi_cist() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bible_smi_prispivat() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bible_smi_spravovat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_pristup() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bible_smi_cist() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bible_smi_prispivat() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bible_smi_spravovat() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Dokumenty knihovny
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_dokumenty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev text NOT NULL CHECK (length(trim(nazev)) > 0),
  autor text,
  vydani text,
  rok integer CHECK (rok IS NULL OR rok BETWEEN 1400 AND 2100),
  isbn text,
  -- Jazyk dokumentu (cs, de, en, sk, jiny); null = zatím neurčeno.
  jazyk text CHECK (jazyk IS NULL OR jazyk IN ('cs', 'de', 'en', 'sk', 'jiny')),
  druh text NOT NULL DEFAULT 'kniha'
    CHECK (druh IN ('kniha', 'skripta', 'clanek', 'norma', 'prirucka', 'poznamky', 'tabulky', 'jiny')),
  -- Tematické oblasti A–T ze zadání (viz src/lib/bibleOblasti.ts).
  oblasti text[] NOT NULL DEFAULT '{}' CHECK (oblasti <@ ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']::text[]),
  -- Odkud dokument je (koupená kniha, sken z knihovny, web výrobce…).
  zdroj text,
  -- Soubor v bucketu „knihovna" (cesta <id dokumentu>/<bezpečné jméno>).
  soubor_cesta text NOT NULL,
  soubor_nazev text NOT NULL,
  soubor_velikost bigint NOT NULL CHECK (soubor_velikost >= 0),
  soubor_mime text,
  soubor_sha256 text NOT NULL CHECK (soubor_sha256 ~ '^[0-9a-f]{64}$'),
  -- Zpracování (Etapa 2 — worker v GitHub Actions, service role).
  stav text NOT NULL DEFAULT 'ceka'
    CHECK (stav IN ('ceka', 'zpracovava', 'hotovo', 'ke_kontrole', 'chyba', 'pozastaveno')),
  stav_zprava text,
  -- Počty po zpracování: stran, digitalnich, ocr, ke_kontrole, kapitol, tabulek, vzorcu, pasazi.
  postup jsonb NOT NULL DEFAULT '{}'::jsonb,
  stran_celkem integer CHECK (stran_celkem IS NULL OR stran_celkem >= 0),
  -- Odhad kvality OCR 0–1 (podíl stran bez nálezu kontroly); null = bez OCR.
  kvalita_ocr numeric CHECK (kvalita_ocr IS NULL OR kvalita_ocr BETWEEN 0 AND 1),
  verze_zpracovani text,
  zpracovano_at timestamptz,
  -- Autorská práva: kdo a kdy potvrdil, že dokument smíme interně používat.
  licence text,
  prava_potvrdil uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  prava_potvrzena_at timestamptz NOT NULL,
  -- Jiné vydání / pravděpodobná duplicita (jen označení, nic se nemaže).
  duplikat_z uuid REFERENCES public.bible_dokumenty(id) ON DELETE SET NULL,
  poznamka text,
  nahral uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Jméno pro seznam: profily ostatních uživatelů appka číst nesmí.
  nahral_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stejný soubor (SHA-256) se do knihovny nenahraje dvakrát.
CREATE UNIQUE INDEX IF NOT EXISTS bible_dokumenty_sha256_uniq ON public.bible_dokumenty (soubor_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS bible_dokumenty_cesta_uniq ON public.bible_dokumenty (soubor_cesta);
CREATE INDEX IF NOT EXISTS bible_dokumenty_stav_idx ON public.bible_dokumenty (stav, created_at);

-- Zpracování (stav, počty, soubor) zapisuje jen worker přes service role —
-- uživatel smí měnit popis dokumentu, dát ho znovu zpracovat nebo pozastavit.
CREATE OR REPLACE FUNCTION public.bible_dokumenty_hlidej()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    IF NEW.soubor_cesta IS DISTINCT FROM OLD.soubor_cesta
       OR NEW.soubor_nazev IS DISTINCT FROM OLD.soubor_nazev
       OR NEW.soubor_velikost IS DISTINCT FROM OLD.soubor_velikost
       OR NEW.soubor_mime IS DISTINCT FROM OLD.soubor_mime
       OR NEW.soubor_sha256 IS DISTINCT FROM OLD.soubor_sha256
       OR NEW.postup IS DISTINCT FROM OLD.postup
       OR NEW.stran_celkem IS DISTINCT FROM OLD.stran_celkem
       OR NEW.kvalita_ocr IS DISTINCT FROM OLD.kvalita_ocr
       OR NEW.verze_zpracovani IS DISTINCT FROM OLD.verze_zpracovani
       OR NEW.zpracovano_at IS DISTINCT FROM OLD.zpracovano_at
       OR NEW.nahral IS DISTINCT FROM OLD.nahral
       OR NEW.prava_potvrdil IS DISTINCT FROM OLD.prava_potvrdil
       OR NEW.prava_potvrzena_at IS DISTINCT FROM OLD.prava_potvrzena_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Tyto údaje dokumentu zapisuje jen zpracování knihovny.' USING ERRCODE = '42501';
    END IF;
    IF NEW.stav IS DISTINCT FROM OLD.stav AND NEW.stav NOT IN ('ceka', 'pozastaveno') THEN
      RAISE EXCEPTION 'Stav zpracování mění jen zpracování knihovny (ručně jde jen „znovu zpracovat" nebo „pozastavit").' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bible_dokumenty_hlidej ON public.bible_dokumenty;
CREATE TRIGGER bible_dokumenty_hlidej
  BEFORE UPDATE ON public.bible_dokumenty
  FOR EACH ROW EXECUTE FUNCTION public.bible_dokumenty_hlidej();

ALTER TABLE public.bible_dokumenty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bible_dokumenty_select ON public.bible_dokumenty;
CREATE POLICY bible_dokumenty_select ON public.bible_dokumenty
  FOR SELECT TO authenticated USING (public.bible_smi_cist());

DROP POLICY IF EXISTS bible_dokumenty_insert ON public.bible_dokumenty;
CREATE POLICY bible_dokumenty_insert ON public.bible_dokumenty
  FOR INSERT TO authenticated
  WITH CHECK (public.bible_smi_prispivat() AND stav = 'ceka' AND nahral = auth.uid() AND prava_potvrdil = auth.uid());

DROP POLICY IF EXISTS bible_dokumenty_update ON public.bible_dokumenty;
CREATE POLICY bible_dokumenty_update ON public.bible_dokumenty
  FOR UPDATE TO authenticated
  USING (public.bible_smi_spravovat() OR (public.bible_smi_prispivat() AND nahral = auth.uid()))
  WITH CHECK (public.bible_smi_spravovat() OR (public.bible_smi_prispivat() AND nahral = auth.uid()));

DROP POLICY IF EXISTS bible_dokumenty_delete ON public.bible_dokumenty;
CREATE POLICY bible_dokumenty_delete ON public.bible_dokumenty
  FOR DELETE TO authenticated USING (public.bible_smi_spravovat());

-- ---------------------------------------------------------------------------
-- 3) Soukromý bucket „knihovna"
-- ---------------------------------------------------------------------------
-- Limit velikosti souboru zůstává na projektu (Free 50 MB) — bucket ho jen
-- nesmí zvýšit. Typy souborů jen ty, které zpracování umí.
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
SELECT 'knihovna', 'knihovna', false, ARRAY[
  'application/pdf',
  'application/epub+zip',
  'image/vnd.djvu',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff'
]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'knihovna');

DROP POLICY IF EXISTS "knihovna_read" ON storage.objects;
CREATE POLICY "knihovna_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'knihovna' AND public.bible_smi_cist());

DROP POLICY IF EXISTS "knihovna_insert" ON storage.objects;
CREATE POLICY "knihovna_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knihovna' AND public.bible_smi_prispivat());

-- Smazat smí správce; kdo soubor nahrál, smí ho uklidit, když se nepovedl
-- zápis dokumentu (appka to dělá sama hned po chybě).
DROP POLICY IF EXISTS "knihovna_delete" ON storage.objects;
CREATE POLICY "knihovna_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knihovna' AND (public.bible_smi_spravovat() OR (public.bible_smi_prispivat() AND owner_id = auth.uid()::text)));

-- ---------------------------------------------------------------------------
-- 4) Kapacita a prostředí (Správa knihovny)
-- ---------------------------------------------------------------------------
-- Velikost databáze a úložiště (tarif Free: DB 500 MB, Storage 1 GB) a co
-- projekt umí pro hledání (pgvector, pg_trgm, unaccent, konfigurace
-- fulltextu). Jen pro správce knihovny a service role.
CREATE OR REPLACE FUNCTION public.bible_kapacita()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT (public.bible_smi_spravovat() OR coalesce(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Jen pro správce knihovny.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'postgres', current_setting('server_version'),
    'db_bajtu', pg_database_size(current_database()),
    'rozsireni', (
      SELECT coalesce(jsonb_object_agg(name, jsonb_build_object('dostupna', default_version, 'zapnuta', installed_version)), '{}'::jsonb)
      FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm', 'unaccent', 'pgcrypto')
    ),
    'fulltext', (SELECT coalesce(jsonb_agg(cfgname::text ORDER BY cfgname), '[]'::jsonb) FROM pg_ts_config),
    'uloziste', (
      SELECT coalesce(jsonb_object_agg(bucket_id, jsonb_build_object('souboru', n, 'bajtu', b)), '{}'::jsonb)
      FROM (
        SELECT bucket_id, count(*) AS n, coalesce(sum((metadata ->> 'size')::bigint), 0) AS b
        FROM storage.objects GROUP BY bucket_id
      ) s
    ),
    'knihovna', (
      SELECT jsonb_build_object(
        'dokumentu', count(*),
        'bajtu', coalesce(sum(soubor_velikost), 0),
        'podle_stavu', coalesce((SELECT jsonb_object_agg(stav, n) FROM (SELECT stav, count(*) AS n FROM public.bible_dokumenty GROUP BY stav) x), '{}'::jsonb)
      )
      FROM public.bible_dokumenty
    )
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.bible_kapacita() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_kapacita() TO authenticated, service_role;
