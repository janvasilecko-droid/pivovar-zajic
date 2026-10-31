-- Kontroly migrací Pivovarské bible v HLAVNÍM projektu (pouštět po
-- 00_stuby.sql a migracích supabase/migrations/*_pivovarska_bible_*.sql).
-- Každá kontrola při selhání skončí chybou „TEST SELHAL: …" a psql
-- s ON_ERROR_STOP vrátí nenulový kód → CI červená.
--
-- Knihy a jejich zpracování jsou od 31. 10. 2026 v samostatném projektu
-- (kontroly v bible/supabase/testy/). Tady zůstává to, na čem projekt bible
-- stojí: kdo smí do bible (bible_pristup, fail-closed), ověření pro vstupní
-- funkci bota (bible_overeni) a zavřená stará cesta do knihovny.
\set ON_ERROR_STOP 1

-- Kdo jsem: uuid uživatele (s e-mailem v tokenu), NULL = anon, 'service' = service role.
CREATE OR REPLACE FUNCTION pg_temp.jako(p_kdo text, p_email text DEFAULT NULL, p_navic jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF p_kdo IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', false);
    EXECUTE 'SET ROLE anon';
  ELSIF p_kdo = 'service' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
    EXECUTE 'SET ROLE service_role';
  ELSE
    PERFORM set_config('request.jwt.claims',
      (jsonb_build_object('sub', p_kdo, 'role', 'authenticated', 'email', p_email) || p_navic)::text, false);
    EXECUTE 'SET ROLE authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.ocekavam(p_podminka boolean, p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_podminka IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST SELHAL: %', p_popis;
  END IF;
END $$;

-- Příkaz musí databáze odmítnout (právo nebo RLS).
CREATE OR REPLACE FUNCTION pg_temp.selze(p_prikaz text, p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_prikaz;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION 'TEST SELHAL (mělo být odmítnuto): %', p_popis;
END $$;

-- 1) Kdo smí do bible --------------------------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a', 'a@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'spravuje', 'admin spravuje');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'b@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'cte', 'modul bible jen „vidět" = čte');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c', 'c@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'prispiva', 'vidět + upravovat = přispívá');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000d', 'd@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() IS NULL, 'bez modulu bible žádný přístup (fail-closed)');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000e', 'sladek@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'spravuje', 'sládek (i s mezerou a velkým písmenem) spravuje');
SELECT pg_temp.jako('00000000-0000-0000-0000-0000000000ff', 'x@zajic.cz');
SELECT pg_temp.ocekavam(public.bible_pristup() IS NULL, 'neznámý uživatel bez profilu nemá přístup');
SELECT pg_temp.jako(NULL);
SELECT pg_temp.selze('SELECT public.bible_pristup()', 'anon nesmí funkci ani zavolat');

-- 2) Stará cesta do knihovny je zavřená (knihy jsou v projektu bible) -----------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c', 'c@zajic.cz');
SELECT pg_temp.selze($q$
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('knihovna', '11111111-1111-1111-1111-111111111111/kunze.pdf', '00000000-0000-0000-0000-00000000000c')
$q$, 'do bucketu knihovna hlavního projektu se už nenahraje (ani přispěvatel)');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_mime, soubor_sha256, prava_potvrzena_at)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Kunze', '11111111-1111-1111-1111-111111111111/kunze.pdf', 'kunze.pdf', 1234,
          'application/pdf', repeat('a', 64), now())
$q$, 'do staré tabulky dokumentů se už nezapíše');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a', 'a@zajic.cz');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_mime, soubor_sha256, prava_potvrzena_at)
  VALUES ('22222222-2222-2222-2222-222222222222', 'Kunze', '22222222-2222-2222-2222-222222222222/kunze.pdf', 'kunze.pdf', 1234,
          'application/pdf', repeat('b', 64), now())
$q$, 'ani správce');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_dokumenty) = 0, 'čtení staré tabulky funguje dál (je prázdná)');

-- 3) Ověření pro vstupní funkci projektu bible (bible_overeni) ------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a', 'a@zajic.cz');
SELECT pg_temp.ocekavam((SELECT r ->> 'uid' = '00000000-0000-0000-0000-00000000000a' AND r ->> 'pristup' = 'spravuje'
                                AND r ->> 'admin' = 'true' AND r ->> 'jmeno' = 'Honza'
                           FROM (SELECT public.bible_overeni() r) x), 'admin: spravuje, admin, jméno');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'B@Zajic.CZ');
SELECT pg_temp.ocekavam((SELECT r ->> 'pristup' = 'cte' AND r ->> 'admin' = 'false' FROM (SELECT public.bible_overeni() r) x),
  'čtenář (e-mail bez ohledu na velikost písmen)');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c', 'c@zajic.cz');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'pristup') = 'prispiva', 'přispěvatel');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000d', 'd@zajic.cz');
SELECT pg_temp.ocekavam((SELECT r ? 'uid' AND r ->> 'pristup' IS NULL FROM (SELECT public.bible_overeni() r) x),
  'bez modulu bible: přihlášený, ale bez přístupu');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000e', 'sladek@zajic.cz');
SELECT pg_temp.ocekavam((SELECT r ->> 'pristup' = 'spravuje' AND r ->> 'admin' = 'false' AND r ->> 'jmeno' IS NULL
                           FROM (SELECT public.bible_overeni() r) x), 'sládek spravuje, ale admin není (migrace bible nepustí)');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000f', 'f@zajic.cz');
SELECT pg_temp.ocekavam((SELECT r ->> 'duvod' = 'bez_hesla' AND NOT (r ? 'pristup') FROM (SELECT public.bible_overeni() r) x),
  'bez nastaveného hesla nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-000000000001', 'g@zajic.cz');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'neschvaleny_email', 'e-mail čekající na schválení nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'cizi@example.com');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'neschvaleny_email', 'token s neschváleným e-mailem nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', NULL);
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'neprihlasen', 'token bez e-mailu nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'b@zajic.cz', '{"is_anonymous": true}');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'neprihlasen', 'anonymní přihlášení nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'b@zajic.cz', '{"role": "service_role"}');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'neprihlasen', 'token s jinou rolí nic');
SELECT pg_temp.jako(NULL);
SELECT pg_temp.selze('SELECT public.bible_overeni()', 'anon funkci nezavolá');
-- Limit 300 požadavků za minutu na uživatele (sdílený s ostatními edge funkcemi přes consume_edge_rate_limit).
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c', 'c@zajic.cz');
SELECT pg_temp.ocekavam((SELECT count(*) FROM generate_series(1, 299) WHERE public.bible_overeni() ? 'pristup') = 299,
  'běžné používání limit nespálí');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'duvod') = 'limit', 'nad limit (301. požadavek za minutu) nic');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'b@zajic.cz');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'pristup') = 'cte', 'limit je pro každého uživatele zvlášť');

SELECT pg_temp.jako(NULL);
RESET ROLE;
SELECT 'VŠECHNY KONTROLY BIBLE V HLAVNÍM PROJEKTU PROŠLY' AS vysledek;
