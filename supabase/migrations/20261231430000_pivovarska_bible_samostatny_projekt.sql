-- 📚 Pivovarská bible se stěhuje do SAMOSTATNÉHO projektu Supabase.
--
-- Rozhodnutí majitele 31. 10. 2026 (R12 v docs/pivovarska-bible/ROZHODNUTI.md):
-- „ať je supabase pro aplikaci samostatně a samostatná supabase pro toho
-- bota". Knihy, jejich zpracování a náklady na AI jsou od teď v projektu
-- cegrelgvkygcatupqwrx (schéma: bible/supabase/migrations). Uživatelé ale
-- zůstávají tady — přihlášení, schválené e-maily, role a práva.
--
-- 1) public.bible_overeni(): vstupní funkce projektu bible (bible-api,
--    bible-migrace) ji volá s tokenem uživatele a podle výsledku pustí,
--    nebo odmítne. Stejná pravidla jako requireApprovedUser u edge funkcí
--    appky: schválený e-mail, nastavené heslo, limit požadavků. K tomu
--    přístup do bible (bible_pristup, fail-closed) a jestli je uživatel
--    admin (jen admin pouští migrace databáze bible).
--    Bez pristup = žádný přístup — i při jakékoli chybě.
--
-- 2) Stará cesta do knihovny v TOMHLE projektu se zavírá: nové soubory ani
--    dokumenty se sem už nenahrají (stará verze appky v mezipaměti telefonu
--    by jinak knihy dál ukládala do 1 GB úložiště appky). Nic se nemaže —
--    tabulky bible tu zůstávají prázdné; úklid jen se souhlasem majitele.

CREATE OR REPLACE FUNCTION public.bible_overeni()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_role text;
  v_jmeno text;
  v_heslo boolean;
BEGIN
  IF v_uid IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('duvod', 'neprihlasen');
  END IF;
  IF coalesce(v_claims ->> 'role', '') <> 'authenticated' OR coalesce(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RETURN jsonb_build_object('duvod', 'neprihlasen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.allowed_emails WHERE lower(email) = v_email AND status = 'approved') THEN
    RETURN jsonb_build_object('duvod', 'neschvaleny_email');
  END IF;
  SELECT role, display_name, password_set INTO v_role, v_jmeno, v_heslo FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_heslo IS NOT TRUE THEN
    RETURN jsonb_build_object('duvod', 'bez_hesla');
  END IF;
  IF NOT public.consume_edge_rate_limit(v_uid, 'bible', 300, 60) THEN
    RETURN jsonb_build_object('duvod', 'limit');
  END IF;
  RETURN jsonb_build_object(
    'uid', v_uid,
    'pristup', public.bible_pristup(),
    'admin', v_role = 'admin',
    'jmeno', nullif(trim(coalesce(v_jmeno, '')), '')
  );
EXCEPTION WHEN OTHERS THEN
  -- Fail-closed: bez pristup žádný přístup. Kód chyby pro diagnostiku (jen kód, žádná data).
  RETURN jsonb_build_object('duvod', 'chyba', 'kod', SQLSTATE);
END;
$$;

REVOKE ALL ON FUNCTION public.bible_overeni() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_overeni() TO authenticated;

-- Stará cesta: bez nahrávání do bucketu knihovna a bez nových dokumentů.
-- Čtení zůstává (tabulky jsou prázdné); nic se nemaže.
DROP POLICY IF EXISTS "knihovna_insert" ON storage.objects;
DO $$
BEGIN
  IF to_regclass('public.bible_dokumenty') IS NOT NULL THEN
    REVOKE INSERT ON public.bible_dokumenty FROM authenticated;
  END IF;
END $$;
