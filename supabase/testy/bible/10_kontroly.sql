-- Kontroly migrací Pivovarské bible v HLAVNÍM projektu (pouštět po
-- 00_stuby.sql a migracích supabase/migrations/*_pivovarska_bible_*.sql).
-- Každá kontrola při selhání skončí chybou „TEST SELHAL: …" a psql
-- s ON_ERROR_STOP vrátí nenulový kód → CI červená.
--
-- Knihy a jejich zpracování jsou od 31. 10. 2026 v samostatném projektu
-- (kontroly v bible/supabase/testy/). Tady zůstává to, na čem projekt bible
-- stojí: kdo smí do bible (bible_pristup, fail-closed), ověření pro vstupní
-- funkci bota (bible_overeni), zavřená stará cesta do knihovny a úklid
-- prázdných tabulek (20261231440000) i s jeho pojistkou.
--
-- Pouštět z kořene repozitáře (sekce 4 čte soubory migrací).
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
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a', 'a@zajic.cz');
SELECT pg_temp.selze($q$
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('knihovna', '22222222-2222-2222-2222-222222222222/kunze.pdf', '00000000-0000-0000-0000-00000000000a')
$q$, 'ani správce');

-- Po úklidu (20261231440000) staré tabulky ani funkce nad nimi nejsou;
-- co se dál používá, zůstalo.
RESET ROLE;
SELECT pg_temp.ocekavam(to_regclass('public.' || t) IS NULL, 'tabulka ' || t || ' je smazaná')
  FROM unnest(ARRAY['bible_dokumenty', 'bible_kapitoly', 'bible_strany', 'bible_pasaze', 'ai_naklady', 'bible_nastaveni']) t;
SELECT pg_temp.ocekavam(to_regprocedure(f) IS NULL, 'funkce ' || f || ' je smazaná')
  FROM unnest(ARRAY['public.bible_vezmi_dokument(integer,uuid,uuid[])', 'public.bible_kapacita()', 'public.bible_utraceno_od(timestamptz)',
                    'public.bible_naklady_od(timestamptz)', 'public.bible_dokumenty_hlidej()', 'public.bible_bez_diakritiky(text)']) f;
SELECT pg_temp.ocekavam(to_regprocedure(f) IS NOT NULL, 'funkce ' || f || ' zůstala')
  FROM unnest(ARRAY['public.bible_pristup()', 'public.bible_overeni()', 'public.bible_smi_cist()',
                    'public.bible_smi_prispivat()', 'public.bible_smi_spravovat()']) f;
SELECT pg_temp.ocekavam((SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                           AND policyname IN ('knihovna_read', 'knihovna_delete')) = 2, 'politiky bucketu knihovna (čtení, mazání) zůstaly');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'knihovna_insert'), 'nahrávání do knihovny zůstalo zavřené');

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

-- 4) Úklid prázdných tabulek a jeho pojistka (20261231440000) ------------------
-- Migrace se pouští jako v appce: celý soubor v jedné funkci (spust_migraci →
-- EXECUTE), chyba vrátí zpět všechno. Před úklidem se tabulky založí znovu
-- (41 + 42 + 43), jak by vypadala hlavní databáze, kde úklid ještě neběžel.
SELECT pg_temp.jako(NULL);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
\set m41 `cat supabase/migrations/20261231410000_pivovarska_bible_knihovna.sql`
\set m42 `cat supabase/migrations/20261231420000_pivovarska_bible_zpracovani.sql`
\set m43 `cat supabase/migrations/20261231430000_pivovarska_bible_samostatny_projekt.sql`
\set m44 `cat supabase/migrations/20261231440000_pivovarska_bible_uklid_hlavniho_projektu.sql`

CREATE OR REPLACE FUNCTION pg_temp.pust(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.tabulky_jsou(p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.ocekavam(
    (SELECT count(*) FROM unnest(ARRAY['bible_dokumenty', 'bible_kapitoly', 'bible_strany', 'bible_pasaze', 'ai_naklady', 'bible_nastaveni']) t
      WHERE to_regclass('public.' || t) IS NOT NULL) = 6
    AND to_regprocedure('public.bible_kapacita()') IS NOT NULL
    AND to_regprocedure('public.bible_bez_diakritiky(text)') IS NOT NULL,
    p_popis);
END $$;

SELECT pg_temp.ocekavam(pg_temp.pust(:'m41') = 'ok' AND pg_temp.pust(:'m42') = 'ok' AND pg_temp.pust(:'m43') = 'ok',
  'staré migrace bible jdou pustit znovu (hlavní databáze před úklidem)');
SELECT pg_temp.tabulky_jsou('před úklidem tabulky jsou');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_nastaveni) = 7, 'nastavení má jen 7 výchozích hodnot');

-- a) Řádek v kterékoli tabulce → nic se nesmaže.
INSERT INTO public.ai_naklady (ucel, model, cena_usd) VALUES ('test', 'claude-haiku-5-5', 0.01);
SELECT pg_temp.ocekavam(pg_temp.pust(:'m44') LIKE 'Tabulka ai_naklady v hlavní databázi není prázdná (řádků: 1)%',
  'úklid odmítne tabulku s daty a řekne kterou');
SELECT pg_temp.tabulky_jsou('po odmítnutí zůstalo všechno (tabulky i funkce)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.ai_naklady) = 1, 'řádek v ai_naklady zůstal');
DELETE FROM public.ai_naklady WHERE ucel = 'test';

-- b) Změněné nastavení → nic se nesmaže.
UPDATE public.bible_nastaveni SET hodnota = '30' WHERE klic = 'strop_mesic_usd';
SELECT pg_temp.ocekavam(pg_temp.pust(:'m44') LIKE 'Nastavení bible v hlavní databázi se liší od výchozího (strop_mesic_usd)%',
  'úklid odmítne změněné nastavení a řekne které');
SELECT pg_temp.tabulky_jsou('po odmítnutí změněného nastavení zůstalo všechno');
UPDATE public.bible_nastaveni SET hodnota = '20' WHERE klic = 'strop_mesic_usd';

-- c) Nastavení navíc → nic se nesmaže.
INSERT INTO public.bible_nastaveni (klic, hodnota) VALUES ('vlastni_klic', '1');
SELECT pg_temp.ocekavam(pg_temp.pust(:'m44') LIKE 'Nastavení bible v hlavní databázi se liší od výchozího (vlastni_klic)%',
  'úklid odmítne nastavení, které migrace nezaložila');
SELECT pg_temp.tabulky_jsou('po odmítnutí nastavení navíc zůstalo všechno');
DELETE FROM public.bible_nastaveni WHERE klic = 'vlastni_klic';

-- d) Prázdné tabulky a výchozí nastavení → úklid proběhne; podruhé taky (nic tam není).
SELECT pg_temp.ocekavam(pg_temp.pust(:'m44') = 'ok', 'úklid prázdných tabulek proběhne');
SELECT pg_temp.ocekavam(
  (SELECT count(*) FROM unnest(ARRAY['bible_dokumenty', 'bible_kapitoly', 'bible_strany', 'bible_pasaze', 'ai_naklady', 'bible_nastaveni']) t
    WHERE to_regclass('public.' || t) IS NOT NULL) = 0, 'po úklidu žádná ze starých tabulek není');
SELECT pg_temp.ocekavam(to_regprocedure('public.bible_pristup()') IS NOT NULL AND to_regprocedure('public.bible_overeni()') IS NOT NULL,
  'bible_pristup a bible_overeni úklid přežily');
SELECT pg_temp.ocekavam(pg_temp.pust(:'m44') = 'ok', 'úklid jde pustit znovu');

-- Ověření pro bota funguje i po úklidu.
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b', 'b@zajic.cz');
SELECT pg_temp.ocekavam((public.bible_overeni() ->> 'pristup') = 'cte', 'bible_overeni po úklidu funguje');

SELECT pg_temp.jako(NULL);
RESET ROLE;
SELECT 'VŠECHNY KONTROLY BIBLE V HLAVNÍM PROJEKTU PROŠLY' AS vysledek;
