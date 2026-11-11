-- Kontroly migrací projektu bible (pouštět po 00_stuby.sql a všech
-- bible/supabase/migrations/*.sql). Každá kontrola při selhání skončí chybou
-- „TEST SELHAL: …" a psql s ON_ERROR_STOP vrátí nenulový kód → CI červená.
--
-- Hlídá hlavně to, co se nesmí rozbít potichu:
--   * databáze je pro prohlížeč zavřená (anon/authenticated nesmí nic);
--   * zápis za uživatele jde jen přes funkce a ty hlídají práva znovu
--     (čtenář nic nezapíše, přispěvatel jen svoje, údaje zpracování nikdo);
--   * nahrání: řádek „nahrava" → soubor → potvrzení (velikost) → fronta;
--   * fronta workeru nevydá dokument dvakrát ani nedokončené nahrání;
--   * hledání bez diakritiky, smazání odnese odvozená data, útrata zůstane.
\set ON_ERROR_STOP 1

-- Role: NULL = superuživatel (migrace), jinak anon / authenticated / service_role.
CREATE OR REPLACE FUNCTION pg_temp.jako(p_role text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('bible.uzivatel', '', false);
  IF p_role IS NOT NULL THEN
    EXECUTE format('SET ROLE %I', p_role);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.ocekavam(p_podminka boolean, p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_podminka IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST SELHAL: %', p_popis;
  END IF;
END $$;

-- Příkaz musí databáze odmítnout s daným SQLSTATE (NULL = jakákoli chyba
-- práv, kontroly nebo vstupu).
CREATE OR REPLACE FUNCTION pg_temp.selze(p_prikaz text, p_popis text, p_kod text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_prikaz;
  EXCEPTION WHEN OTHERS THEN
    IF p_kod IS NOT NULL AND SQLSTATE <> p_kod THEN
      RAISE EXCEPTION 'TEST SELHAL (čekal jsem chybu %, přišla % „%"): %', p_kod, SQLSTATE, SQLERRM, p_popis;
    END IF;
    IF p_kod IS NULL AND SQLSTATE NOT IN ('42501', '23514', '23502', '23505', '23503', '22023', '22P02', '54000') THEN
      RAISE EXCEPTION 'TEST SELHAL (nečekaná chyba % „%"): %', SQLSTATE, SQLERRM, p_popis;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'TEST SELHAL (mělo být odmítnuto): %', p_popis;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_dotaz text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  r record;
  t text := '';
BEGIN
  FOR r IN EXECUTE 'EXPLAIN ' || p_dotaz LOOP
    t := t || r."QUERY PLAN" || E'\n';
  END LOOP;
  RETURN t;
END $$;

-- Popis nahrávaného souboru (otisk = 64× znak p_znak).
CREATE OR REPLACE FUNCTION pg_temp.soubor(p_znak text, p_jmeno text DEFAULT 'kunze.pdf', p_velikost bigint DEFAULT 1234,
                                          p_mime text DEFAULT 'application/pdf', p_nazev text DEFAULT 'Kunze') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('nazev', p_nazev, 'oblasti', jsonb_build_array('A', 'D'), 'soubor_jmeno', p_jmeno,
                            'soubor_nazev', p_jmeno, 'soubor_velikost', p_velikost, 'soubor_mime', p_mime,
                            'soubor_sha256', repeat(p_znak, 64))
$$;

CREATE OR REPLACE FUNCTION pg_temp.dok(p_znak text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.bible_dokumenty WHERE soubor_sha256 = repeat(p_znak, 64)
$$;

-- Uživatelé (uuid z hlavního projektu): A správce, B čtenář, C a F přispěvatelé.
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
\set F '''00000000-0000-0000-0000-00000000000f'''

-- 1) Databáze je pro prohlížeč zavřená ---------------------------------------
SELECT pg_temp.jako(NULL);
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
), 'anon ani authenticated nemají právo na žádnou tabulku');
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), 'anon ani authenticated nezavolají žádnou funkci (ani přes PUBLIC) — každá nová funkce potřebuje REVOKE … FROM PUBLIC');
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
), 'RLS je zapnuté na všech tabulkách');
SELECT pg_temp.ocekavam((SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.prosecdef)
                        = ARRAY['bible_bez_diakritiky', 'bible_kapacita', 'bible_potvrd_nahrani', 'bible_zaloz_nahrani'],
  'SECURITY DEFINER jen tam, kde je potřeba (úložiště, unaccent)');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname IN ('public', 'storage')),
  'žádná politika pro uživatele (ani na úložišti) — vstup je jen bible-api a worker');
SELECT pg_temp.ocekavam((SELECT NOT public AND file_size_limit = 52428800 AND cardinality(allowed_mime_types) = 12
                           FROM storage.buckets WHERE id = 'knihovna'), 'bucket knihovna: soukromý, 50 MB, 12 typů');
CREATE TABLE public.zkouska_vychozich_prav (x integer);
SELECT pg_temp.ocekavam(NOT has_table_privilege('anon', 'public.zkouska_vychozich_prav', 'SELECT')
                        AND NOT has_table_privilege('authenticated', 'public.zkouska_vychozich_prav', 'SELECT'),
  'tabulka z další migrace nedostane práva pro anon/authenticated automaticky');
DROP TABLE public.zkouska_vychozich_prav;
SELECT pg_temp.jako('anon');
SELECT pg_temp.selze('SELECT count(*) FROM public.bible_dokumenty', 'anon nic nepřečte', '42501');
SELECT pg_temp.jako('authenticated');
SELECT pg_temp.selze('SELECT count(*) FROM public.bible_nastaveni', 'authenticated nic nepřečte', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'spravuje', 'X', pg_temp.soubor('9')),
  'přihlášený (token jiného projektu by tu byl authenticated) nezavolá zápis', '42501');
SELECT pg_temp.selze('SELECT * FROM public.bible_vezmi_dokument(60, NULL)', 'authenticated nesahá na frontu', '42501');

-- 2) Nahrání: řádek „nahrava" -------------------------------------------------
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :B, 'cte', 'Bára', pg_temp.soubor('a')),
  'čtenář nenahraje', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(NULL, %L, %L, %L)', 'spravuje', 'X', pg_temp.soubor('a')),
  'bez uživatele nic', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'SPRAVUJE', 'X', pg_temp.soubor('a')),
  'neznámý přístup = žádný (fail-closed)', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X',
  jsonb_set(pg_temp.soubor('a'), '{soubor_sha256}', '"xyz"')), 'otisk musí být SHA-256', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X', pg_temp.soubor('a', '../x.pdf')),
  'jméno v úložišti bez lomítek a teček na začátku', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X', pg_temp.soubor('a', '..')),
  'jméno „.." ne', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X',
  pg_temp.soubor('a', 'x.exe', 10, 'application/x-msdownload')), 'typ mimo seznam bucketu ne', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X', pg_temp.soubor('a', 'kunze.pdf', 0)),
  'prázdný soubor ne', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X', pg_temp.soubor('a', 'kunze.pdf', 52428801)),
  'nad 50 MB ne (strop Free)', '54000');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X',
  jsonb_set(pg_temp.soubor('a'), '{soubor_velikost}', '"12a"')), 'velikost jen číslem', '22023');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X', pg_temp.soubor('a', 'kunze.pdf', 1234, 'application/pdf', '   ')),
  'bez názvu ne', '23514');
SELECT pg_temp.selze(format('SELECT public.bible_zaloz_nahrani(%L, %L, %L, %L)', :C, 'prispiva', 'X',
  jsonb_set(pg_temp.soubor('a'), '{oblasti}', '["Z"]')), 'jen oblasti A–T', '23514');

SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:C, 'prispiva', ' Cyril ',
  pg_temp.soubor('a') || '{"stav": "hotovo", "pokusy": 99, "nahral": "00000000-0000-0000-0000-00000000000a", "postup": {"stran": 5}}'::jsonb)
  ->> 'obnoveno') = 'false', 'přispěvatel založí nahrání');
SELECT pg_temp.ocekavam((SELECT stav = 'nahrava' AND nahral = :C AND prava_potvrdil = :C AND nahral_jmeno = 'Cyril'
                                AND pokusy = 0 AND postup = '{}'::jsonb AND soubor_cesta = id::text || '/kunze.pdf'
                                AND soubor_velikost = 1234 AND soubor_mime = 'application/pdf' AND oblasti = '{A,D}'
                           FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')),
  'řádek „nahrava": autora a potvrzení práv dá funkce, podvržené údaje zpracování se nevezmou');
SELECT pg_temp.ocekavam((SELECT nahrani_do > now() + interval '2 hours' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')),
  'řádek ví, do kdy může platit odkaz pro nahrání (2 h)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'worker nedokončené nahrání nevezme');
SELECT pg_temp.ocekavam((SELECT r ->> 'rozpracovano' = 'true' AND r ->> 'nahral_jmeno' = 'Cyril' AND NOT (r ? 'id')
                           FROM (SELECT public.bible_zaloz_nahrani(:F, 'prispiva', 'Franta', pg_temp.soubor('a')) r) x),
  'cizí rozpracované nahrání téhož souboru: jiný přispěvatel se dozví, kdo ho rozpracoval (bez odkazu pro nahrání)');
UPDATE public.bible_dokumenty SET nahrani_do = now() - interval '1 hour' WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT r ->> 'obnoveno' = 'true' AND (r ->> 'id')::uuid = pg_temp.dok('a') AND r ->> 'soubor_nahran' = 'false'
                           FROM (SELECT public.bible_zaloz_nahrani(:C, 'prispiva', 'Cyril', pg_temp.soubor('a')) r) x),
  'vlastní nedokončené nahrání téhož souboru se vrátí (bez nového řádku)');
SELECT pg_temp.ocekavam((SELECT nahrani_do > now() + interval '2 hours' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')),
  'nový odkaz pro nahrání prodlouží, do kdy může platit');
SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:A, 'spravuje', 'Admin', pg_temp.soubor('a')) ->> 'obnoveno') = 'true',
  'správce nahrání dokončí i za jiného');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_dokumenty) = 1, 'pořád jen jeden řádek');
SELECT pg_temp.selze(format('SELECT public.bible_nastav_stav(%L, %L, %L, %L)', :C, 'prispiva', pg_temp.dok('a'), 'ceka'),
  'nedokončené nahrání nejde ručně zařadit do fronty (soubor nemusí být celý)', '42501');

-- 3) Potvrzení nahrání ---------------------------------------------------------
SELECT pg_temp.ocekavam((public.bible_potvrd_nahrani(:C, 'prispiva', pg_temp.dok('a')) ->> 'vysledek') = 'soubor_chybi',
  'bez souboru v úložišti se nepotvrdí');
INSERT INTO storage.objects (bucket_id, name, metadata)
  SELECT 'knihovna', soubor_cesta, '{"size": 999, "mimetype": "application/pdf"}' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((public.bible_potvrd_nahrani(:C, 'prispiva', pg_temp.dok('a')) ->> 'vysledek') = 'jina_velikost',
  'useknutý soubor (jiná velikost) se nepotvrdí');
UPDATE storage.objects SET metadata = '{"size": 1234, "mimetype": "application/pdf"}' WHERE bucket_id = 'knihovna';
SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:C, 'prispiva', 'Cyril', pg_temp.soubor('a')) ->> 'soubor_nahran') = 'true',
  'obnovené nahrání pozná, že soubor už v úložišti je');
SELECT pg_temp.selze(format('SELECT public.bible_potvrd_nahrani(%L, %L, %L)', :F, 'prispiva', pg_temp.dok('a')),
  'cizí nahrání přispěvatel nepotvrdí', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_potvrd_nahrani(%L, %L, %L)', :B, 'cte', pg_temp.dok('a')),
  'čtenář nepotvrdí', '42501');
SELECT pg_temp.ocekavam((public.bible_potvrd_nahrani(:C, 'prispiva', gen_random_uuid()) ->> 'vysledek') = 'nenalezeno',
  'neexistující dokument');
SELECT pg_temp.ocekavam((SELECT r ->> 'vysledek' = 'ok' AND r ->> 'stav' = 'ceka'
                           FROM (SELECT public.bible_potvrd_nahrani(:C, 'prispiva', pg_temp.dok('a')) r) x), 'potvrzení → čeká');
SELECT pg_temp.ocekavam((public.bible_potvrd_nahrani(:C, 'prispiva', pg_temp.dok('a')) ->> 'stav') = 'ceka', 'druhé potvrzení nic nezmění');
SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:C, 'prispiva', 'Cyril', pg_temp.soubor('a')) ->> 'duplicita') = 'true',
  'hotové nahrání se už neobnoví, je to duplicita');

-- 4) Úprava popisu --------------------------------------------------------------
SELECT pg_temp.ocekavam(public.bible_uprav_popis(:C, 'prispiva', pg_temp.dok('a'),
  '{"nazev": "Technologie Brauer und Mälzer", "autor": " Wolfgang Kunze ", "rok": 2016, "jazyk": "de", "druh": "kniha", "oblasti": ["D"],
    "postup": {"stran": 9}, "pokusy": 7}'), 'přispěvatel upraví svůj dokument');
SELECT pg_temp.ocekavam((SELECT autor = 'Wolfgang Kunze' AND rok = 2016 AND oblasti = '{D}' AND postup = '{}'::jsonb AND pokusy = 0
                           FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')), 'popis se změní, údaje zpracování ne');
SELECT pg_temp.selze(format('SELECT public.bible_uprav_popis(%L, %L, %L, %L)', :F, 'prispiva', pg_temp.dok('a'), '{"nazev": "Cizí"}'),
  'cizí dokument přispěvatel neupraví', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_uprav_popis(%L, %L, %L, %L)', :B, 'cte', pg_temp.dok('a'), '{"nazev": "Čtenář"}'),
  'čtenář neupraví', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_uprav_popis(%L, %L, %L, %L)', :C, 'prispiva', pg_temp.dok('a'), '{"nazev": ""}'),
  'název nesmí zmizet', '23514');
SELECT pg_temp.ocekavam(public.bible_uprav_popis(:A, 'spravuje', pg_temp.dok('a'),
  '{"nazev": "Technologie Brauer und Mälzer", "autor": "Wolfgang Kunze", "rok": 2016, "jazyk": "de", "druh": "kniha", "oblasti": ["A", "D"]}'),
  'správce upraví cokoli');
SELECT pg_temp.ocekavam(public.bible_uprav_popis(:A, 'spravuje', gen_random_uuid(), '{"nazev": "X"}') = false, 'neexistující dokument = false');
SELECT pg_temp.ocekavam(public.bible_uprav_popis(:A, 'spravuje', pg_temp.dok('a'), '{"nazev": "Bez oblastí", "oblasti": null}'),
  'oblasti null projdou…');
SELECT pg_temp.ocekavam((SELECT oblasti = '{}' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')), '…jako žádné oblasti (ne chyba)');
SELECT pg_temp.ocekavam(public.bible_uprav_popis(:A, 'spravuje', pg_temp.dok('a'),
  '{"nazev": "Technologie Brauer und Mälzer", "autor": "Wolfgang Kunze", "rok": 2016, "jazyk": "de", "druh": "kniha", "oblasti": ["A", "D"]}'),
  'popis zpátky');
-- Pojistka v triggeru: zápis za uživatele nesahá na údaje zpracování, ani kdyby funkce chybovala.
SELECT pg_temp.ocekavam(set_config('bible.uzivatel', :C, false) = :C, 'zápis za uživatele C');
SELECT pg_temp.selze(format('UPDATE public.bible_dokumenty SET postup = %L WHERE id = %L', '{"stran": 1}', pg_temp.dok('a')),
  'za uživatele se počty nezapíšou', '42501');
SELECT pg_temp.selze(format('UPDATE public.bible_dokumenty SET nahral = %L WHERE id = %L', :F, pg_temp.dok('a')),
  'za uživatele se autor nepřepíše', '42501');
SELECT pg_temp.selze(format('UPDATE public.bible_dokumenty SET nahrani_do = NULL WHERE id = %L', pg_temp.dok('a')),
  'za uživatele se platnost odkazu pro nahrání nezmění (úklid by pak nevěděl o rozběhnutém nahrání)', '42501');
SELECT pg_temp.selze(format('UPDATE public.bible_dokumenty SET stav = %L WHERE id = %L', 'hotovo', pg_temp.dok('a')),
  'za uživatele jen „čeká" nebo „pozastaveno"', '42501');
SELECT pg_temp.ocekavam(set_config('bible.uzivatel', '', false) = '', 'konec zápisu za uživatele');

-- 5) Stav a fronta ----------------------------------------------------------------
SELECT pg_temp.selze(format('SELECT public.bible_nastav_stav(%L, %L, %L, %L)', :C, 'prispiva', pg_temp.dok('a'), 'hotovo'),
  'stav „hotovo" zapisuje jen zpracování', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_nastav_stav(%L, %L, %L, %L)', :F, 'prispiva', pg_temp.dok('a'), 'pozastaveno'),
  'cizí dokument přispěvatel nepozastaví', '42501');
SELECT pg_temp.ocekavam(public.bible_nastav_stav(:C, 'prispiva', pg_temp.dok('a'), 'pozastaveno'), 'přispěvatel pozastaví svůj dokument');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'pozastavený dokument worker nevezme');
SELECT pg_temp.ocekavam(public.bible_nastav_stav(:A, 'spravuje', pg_temp.dok('a'), 'ceka'), 'správce zařadí ke zpracování');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL, ARRAY[pg_temp.dok('a')])) = 0,
  'dokument zkoušený v tomtéž běhu se znovu nevydá (p_vynechat)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 1, 'worker vezme čekající dokument');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'zamčený dokument nevydá podruhé');
SELECT pg_temp.selze(format('SELECT public.bible_nastav_stav(%L, %L, %L, %L)', :C, 'prispiva', pg_temp.dok('a'), 'ceka'),
  'dokument, který se právě zpracovává, nejde znovu zařadit', '42501');
SELECT pg_temp.ocekavam(public.bible_nastav_stav(:C, 'prispiva', pg_temp.dok('a'), 'pozastaveno'),
  'pozastavit jde i během zpracování (worker to pozná a přestane)');
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() - interval '1 minute' WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT pokusy FROM public.bible_vezmi_dokument(60, NULL)) = 2, 'po vypršení zámku znovu, pokus 2');
SELECT pg_temp.selze(format('UPDATE public.bible_dokumenty SET pokusy = -1 WHERE id = %L', pg_temp.dok('a')),
  'záporný počet pokusů nejde (obešel by limit tří pokusů)', '23514');
-- Pořadí: dokument, který už selhal, jde až za novějším čerstvým (worker zakládá rovnou „ceka").
INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, created_at)
  VALUES ('55555555-5555-5555-5555-555555555555', 'Nový', '55555555-5555-5555-5555-555555555555/n.pdf', 'n.pdf', 1, repeat('5', 64), now(), now() + interval '1 day');
UPDATE public.bible_dokumenty SET stav = 'ceka', zamek_do = NULL WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT id FROM public.bible_vezmi_dokument(60, NULL)) = '55555555-5555-5555-5555-555555555555',
  'čerstvý dokument má přednost před tím, který už selhal');
DELETE FROM public.bible_dokumenty WHERE id = '55555555-5555-5555-5555-555555555555';
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() - interval '1 minute', pokusy = 3 WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'zaseknutý dokument po 3 pokusech se nevydá…');
SELECT pg_temp.ocekavam((SELECT stav = 'chyba' AND stav_zprava LIKE '%opakovaně%' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')),
  '…a dostane stav „chyba" se zprávou');
SELECT pg_temp.ocekavam(public.bible_nastav_stav(:C, 'prispiva', pg_temp.dok('a'), 'ceka'), 'po chybě „Zpracovat znovu"');
SELECT pg_temp.ocekavam((SELECT pokusy = 0 AND zamek_do IS NULL AND stav_zprava IS NULL FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')),
  '„Zpracovat znovu" vynuluje pokusy');
SELECT pg_temp.selze('INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at) VALUES (gen_random_uuid(), ''X'', ''../../auth/v1/admin/users'', ''x.pdf'', 1, repeat(''7'', 64), now())',
  'cesta k souboru musí být „<id dokumentu>/<jméno>" (worker nesmí stáhnout cizí cestu)', '23514');

-- 6) Zpracování (worker, service role) a hledání ------------------------------------
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() + interval '1 hour', pokusy = 1 WHERE id = pg_temp.dok('a');
INSERT INTO public.bible_kapitoly (id, dokument_id, poradi, uroven, cislo, nazev, strana_od, strana_do)
  SELECT '33333333-3333-3333-3333-333333333333', pg_temp.dok('a'), 1, 1, '3.2', 'Maischen', 1, 2;
INSERT INTO public.bible_strany (dokument_id, pdf_index, tistena_strana, tistena_zdroj, zdroj_textu, text, znaku, kapitola_id) VALUES
  (pg_temp.dok('a'), 1, '158', 'zahlavi', 'vrstva', 'Die β-Amylase arbeitet bei 62–65 °C.', 36, '33333333-3333-3333-3333-333333333333'),
  (pg_temp.dok('a'), 2, '159', 'dopocet', 'ocr', 'Rmutování: β-amyláza nejlépe při 62–65 °C.', 42, '33333333-3333-3333-3333-333333333333');
INSERT INTO public.bible_pasaze (dokument_id, kapitola_id, poradi, strana_od, strana_do, text, jazyk) VALUES
  (pg_temp.dok('a'), '33333333-3333-3333-3333-333333333333', 1, 1, 1, 'Die β-Amylase arbeitet bei 62–65 °C am besten. Würze entsteht beim Maischen.', 'de'),
  (pg_temp.dok('a'), '33333333-3333-3333-3333-333333333333', 2, 2, 2, 'Rmutování: β-amyláza pracuje nejlépe při 62–65 °C.', 'cs');
-- Překlad (20261103000000_bible_preklad): platí jen k textu, ze kterého vznikl.
-- md5 počítá worker v Pythonu (hashlib.md5 UTF-8) — tady pevná hodnota, ať sedí obě strany.
UPDATE public.bible_strany SET preklad = 'β-amyláza pracuje při 62–65 °C.', preklad_zdroj = 'ded436ab21220e6c7346efb489ec1ac0'
 WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1;
SELECT pg_temp.ocekavam((SELECT preklad_platny FROM public.bible_strany WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1),
  'překlad s md5 textu z Pythonu platí');
SELECT pg_temp.ocekavam(NOT (SELECT preklad_platny FROM public.bible_strany WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 2),
  'strana bez překladu nemá platný překlad');
UPDATE public.bible_strany SET text = text || ' Neu.' WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1;
SELECT pg_temp.ocekavam(NOT (SELECT preklad_platny FROM public.bible_strany WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1),
  'po změně textu strany překlad přestane platit');
UPDATE public.bible_strany SET text = 'Die β-Amylase arbeitet bei 62–65 °C.' WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1;
SET enable_seqscan = off;
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT pdf_index FROM public.bible_strany WHERE dokument_id = '00000000-0000-0000-0000-000000000000' AND NOT preklad_platny$q$)
                        LIKE '%bible_strany_bez_prekladu_idx%', 'hledání stran bez překladu použije index');
RESET enable_seqscan;
SELECT pg_temp.selze(format('INSERT INTO public.bible_pasaze (dokument_id, poradi, strana_od, strana_do, text) VALUES (%L, 3, 3, 2, %L)',
  pg_temp.dok('a'), 'obrácený rozsah'), 'pasáž nesmí mít konec před začátkem', '23514');
INSERT INTO public.ai_naklady (ucel, model, vstup_tokenu, vystup_tokenu, cena_usd, dokument_id)
  SELECT 'ocr', 'claude-haiku-5-5', 2600, 900, 0.00071, pg_temp.dok('a');
UPDATE public.bible_dokumenty SET stav = 'hotovo', zamek_do = NULL, postup = '{"stran": 2, "kapitol": 1, "pasazi": 2}' WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT stav FROM public.bible_dokumenty WHERE id = pg_temp.dok('a')) = 'hotovo', 'worker zapíše stav zpracování');
SELECT pg_temp.ocekavam(public.bible_utraceno_od(now() - interval '1 day') = 0.00071, 'útrata se sečte v databázi');
SELECT pg_temp.ocekavam((SELECT count(*) = 1 AND sum(cena_usd) = 0.00071 AND sum(volani) = 1 FROM public.bible_naklady_od(now() - interval '1 day')),
  'souhrn útraty po účelech');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', public.bible_bez_diakritiky('rmutování'))) = 1,
  '„rmutování" najde českou pasáž i bez diakritiky');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')) = 1, '„wurze" najde „Würze"');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'amyl:*')) = 2,
  'předpona „amyl" najde β-amylázu i β-Amylase');
-- Hledání (20261103010000_bible_hledani): originál i český překlad, jen zpracované knihy.
SELECT pg_temp.ocekavam(public.bible_dotaz('Rmutování & β-Amyláza!') = 'rmutovani:* & amylaza:*'::tsquery, 'dotaz: bez diakritiky, předpony, bez syntaxe od uživatele');
SELECT pg_temp.ocekavam(public.bible_dotaz('  & | ! ') IS NULL AND public.bible_dotaz(NULL) IS NULL, 'prázdný dotaz = nic');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('rmutovani')) = 1
                        AND (SELECT zdroj FROM public.bible_hledej('rmutovani')) = 'original', 'česká pasáž se najde bez diakritiky');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('Würze')) = 1, 'německá pasáž se najde');
SELECT pg_temp.ocekavam((SELECT string_agg(zdroj || ':' || pdf_index || ':' || coalesce(tistena_strana, '-') || ':' || coalesce(kapitola, '-'), ',' ORDER BY zdroj)
                           FROM public.bible_hledej('pracuje 62')) = 'original:2:159:Maischen,preklad:1:158:Maischen',
  'česká otázka najde i překlad německé strany (s tištěnou stranou a kapitolou)');
UPDATE public.bible_strany SET text = text || ' Neu.' WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1;
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_hledej('pracuje') WHERE zdroj = 'preklad'), 'neplatný překlad se nehledá');
UPDATE public.bible_strany SET text = 'Die β-Amylase arbeitet bei 62–65 °C.' WHERE dokument_id = pg_temp.dok('a') AND pdf_index = 1;
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('amyl', NULL, 1)) = 1, 'limit výsledků');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('amyl', gen_random_uuid())) = 0, 'filtr dokumentu');
-- Hledání otázkou v běžné řeči (20261111030000_bible_chat): bez výplňových slov, podle shody.
SELECT pg_temp.ocekavam(public.bible_slova_volne('Proč β-amyláza pracuje tak pomalu při rmutování?') = ARRAY['amylaz', 'prac', 'pomal', 'rmut'],
  'slova otázky: bez výplňových slov, uříznuté koncovky');
SELECT pg_temp.ocekavam(public.bible_slova_volne('chmelovaru pění pivo pH CO2 62 °C') = ARRAY['chmelovar', 'pen', 'piv', 'ph', 'co2', '62'],
  'koncovky: kmen aspoň 3 písmena, čísla a krátké značky zůstanou');
SELECT pg_temp.ocekavam(public.bible_slova_volne('kvašení kvasnice kvasnic') = ARRAY['kvas', 'kvasnic']
                        AND public.bible_slova_volne('proč a jak?') = '{}'::text[]
                        AND cardinality(public.bible_slova_volne('a1 b2 slad1 slad2 slad3 slad4 slad5 slad6 slad7 slad8 slad9')) = 8,
  'opakované kmeny jednou, jen výplňová slova = nic, nejvýš 8 (stejně jako slovaVolne v TS)');
SELECT pg_temp.ocekavam(public.bible_dotaz_volny('Proč amyláza pracuje pomalu?')::text = '''amylaz'':* | ''prac'':* | ''pomal'':*',
  'volný dotaz spojí slova přes OR');
SELECT pg_temp.ocekavam(public.bible_dotaz_volny('amyláza pracuje pomalu', 2)::text
  = '''amylaz'':* & ''prac'':* | ''amylaz'':* & ''pomal'':* | ''prac'':* & ''pomal'':*', 'p_min 2 = aspoň dvě slova (dvojice)');
SELECT pg_temp.ocekavam(public.bible_dotaz_volny('proč a jak?') IS NULL AND public.bible_dotaz_volny(NULL, 2) IS NULL, 'dotaz jen z výplňových slov nic nehledá');
SELECT pg_temp.ocekavam(public.bible_dotaz_volny('pH rmutu', 2)::text = '''ph'':* & ''rmut'':*', 'pH zůstane i jako dvě písmena');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('Proč amyláza pracuje pomalu')) = 0, 'přesné hledání otázku v běžné řeči nenajde…');
SELECT pg_temp.ocekavam((SELECT string_agg(zdroj || ':' || pdf_index || ':' || shoda || '/' || slov, ',' ORDER BY pdf_index) FROM public.bible_hledej_volne('Proč amyláza pracuje pomalu'))
  = 'preklad:1:2/3,original:2:2/3', '…volné hledání najde stránky aspoň se dvěma slovy (český překlad strany 1 i česká pasáž strany 2)');
SELECT pg_temp.ocekavam((SELECT string_agg(zdroj || ':' || pdf_index || ':' || shoda, ',' ORDER BY shoda DESC, pdf_index) FROM public.bible_hledej_volne('amyláza rmutovací kvasnice'))
  = 'preklad:1:1,original:2:1', 'když žádná stránka nemá dvě slova, stačí jedno');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_volne('proč a jak')) = 0, 'volné hledání bez slov nevrátí nic');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_volne('amyláza pracuje', gen_random_uuid())) = 0, 'volné hledání: filtr dokumentu');
-- Varianty slov a filtry hledání (20261111040000_bible_hledani_filtry). Kunze: de, 2016, kniha, oblasti A a D.
SELECT pg_temp.ocekavam(public.bible_kmen('rmutovani') = 'rmut' AND public.bible_kmen('sladky') = 'sladk' AND public.bible_kmen('62') = '62'
                        AND public.bible_kmen('chmelovaru') = (public.bible_slova_volne('chmelovaru'))[1],
  'kmen slova: uříznutá koncovka jako u hledání otázkou, čísla beze změny');
SELECT pg_temp.ocekavam(public.bible_pojmy_slova('mladiny') = '{mladina}' AND public.bible_pojmy_slova('wurze') = '{mladina}'
                        AND public.bible_pojmy_slova('sladky') = '{}' AND public.bible_pojmy_slova('hope') = '{}' AND public.bible_pojmy_slova('hops') = '{chmel}',
  'slovník: shoda kmene, začátku slova i přesného slova (sladký není slad, hope není hop)');
SELECT pg_temp.ocekavam(public.bible_pojmy_slova('peni') = '{pena}' AND public.bible_varianty('foam', 'foam') LIKE '%pena%'
                        AND public.bible_varianty('foam', 'foam') NOT LIKE '%pen:*%',
  'pěna: přesné české tvary — „foam“ nenajde anglické pending ani pentose');
SELECT pg_temp.ocekavam(public.bible_dotaz_v('chmelovar odpar')::text
  = '( ''chmelovar'':* | ''boil'':* | ''wuerzekoch'':* | ''wurzekoch'':* ) & ( ''odpar'':* | ''evapor'':* | ''verdampf'':* )',
  'přesné hledání s variantami: na stránce je každé slovo, nebo jeho varianta');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('mladina')) = 0
                        AND (SELECT string_agg(zdroj || ':' || pdf_index, ',') FROM public.bible_hledej_v('mladina')) = 'original:1',
  '„mladina“ najde německou pasáž s „Würze“ (bez variant nic)');
SELECT pg_temp.ocekavam((SELECT string_agg(zdroj || ':' || pdf_index, ',' ORDER BY pdf_index) FROM public.bible_hledej_v('mash')) = 'original:1,original:2',
  '„mash“ najde „Maischen“ i „Rmutování“');
SELECT pg_temp.ocekavam((SELECT string_agg(zdroj || ':' || pdf_index || ':' || shoda || '/' || slov, ',') FROM public.bible_hledej_volne_v('Proč mladina pění při rmutování'))
  = 'original:1:2/3', 'otázka s variantami: německá stránka má dva pojmy ze tří (Würze, Maischen)');
SELECT pg_temp.ocekavam(public.bible_slova_hledani('mladina') @> ARRAY['mladin', 'wurz', 'wort'] AND public.bible_slova_hledani('proč a jak', true) = '{}',
  'slova pro úryvek a zvýraznění i s variantami');
SELECT pg_temp.ocekavam(
  (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"jazyk": "de", "rok_od": 2016, "rok_do": 2016, "autor": "kunze", "oblast": "D", "druh": "kniha"}')) > 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', jsonb_build_object('dokument', pg_temp.dok('a')))) > 0,
  'filtry, kterým kniha odpovídá, výsledky nechají');
SELECT pg_temp.ocekavam(
  (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"jazyk": "cs"}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"rok_od": 2017}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"rok_do": 2015}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"autor": "Novák"}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"oblast": "H"}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"druh": "clanek"}')) = 0
  AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', jsonb_build_object('dokument', gen_random_uuid()))) = 0
  AND (SELECT count(*) FROM public.bible_hledej_volne_v('proč amyláza pracuje', '{"jazyk": "cs"}')) = 0,
  'každý filtr, kterému kniha neodpovídá, ji vyřadí (i u hledání otázkou)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"autor": "%"}')) = 0
                        AND (SELECT count(*) FROM public.bible_hledej_v('amyláza', '{"rok_od": "x", "jazyk": "xx", "oblast": "Z", "dokument": "1; drop"}')) > 0,
  'autor doslova (% není zástupný znak), neplatné hodnoty filtru se nepoužijí');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_slovnik WHERE vzor !~ '^[a-z0-9]+$') AND (SELECT count(DISTINCT pojem) FROM public.bible_slovnik) >= 50,
  'slovník: aspoň 50 pojmů, vzory jen malá písmena a číslice');
SELECT pg_temp.selze('SELECT * FROM public.bible_slovnik', 'slovník čte jen service role', '42501') FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako(NULL);
-- Český název kapitoly (20261104020000_bible_kapitoly_preklad)
SELECT pg_temp.ocekavam(public.bible_kapitoly_nazvy(ARRAY['33333333-3333-3333-3333-333333333333']::uuid[], ARRAY['3.2 Rmutování']) = 1,
  'přeložený název kapitoly se zapíše');
SELECT pg_temp.ocekavam(public.bible_kapitoly_nazvy(ARRAY['33333333-3333-3333-3333-333333333333']::uuid[], ARRAY['jiný']) = 0,
  'už přeložený název se nepřepíše');
SELECT pg_temp.ocekavam(public.bible_kapitoly_nazvy(ARRAY[gen_random_uuid()], ARRAY['nic']) = 0, 'neexistující kapitolu nevytvoří');
SELECT pg_temp.ocekavam((SELECT bool_and(kapitola = '3.2 Rmutování') FROM public.bible_hledej('pracuje 62')), 'hledání ukáže český název kapitoly');
UPDATE public.bible_kapitoly SET nazev_cs = NULL WHERE id = '33333333-3333-3333-3333-333333333333';
SELECT pg_temp.ocekavam(public.bible_kapitoly_bez_prekladu(pg_temp.dok('a')) = 1, 'česká kniha: názvy kapitol „nepotřebují" překlad…');
SELECT pg_temp.ocekavam((SELECT nazev_cs FROM public.bible_kapitoly WHERE id = '33333333-3333-3333-3333-333333333333') = '',
  '…zapíše se prázdný název');
SELECT pg_temp.ocekavam((SELECT bool_and(kapitola = 'Maischen') FROM public.bible_hledej('pracuje 62')), 'prázdný překlad = původní název');
UPDATE public.bible_kapitoly SET nazev_cs = NULL WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE public.bible_dokumenty SET stav = 'zpracovava' WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej('amyl')) = 0, 'rozpracovaná kniha se nehledá');
UPDATE public.bible_dokumenty SET stav = 'hotovo' WHERE id = pg_temp.dok('a');
SET enable_seqscan = off;
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT pdf_index FROM public.bible_strany WHERE preklad_hledani @@ 'amyl:*'::tsquery$q$)
                        LIKE '%bible_strany_preklad_hledani_idx%', 'hledání v překladu použije index');
RESET enable_seqscan;
SELECT pg_temp.selze('INSERT INTO public.bible_prehledy (klic, nazev, text, otisk) VALUES (''Špatně!'', ''x'', ''x'', ''x'')',
  'klíč přehledu jen malá písmena a číslice', '23514');
INSERT INTO public.bible_prehledy (klic, nazev, oblast, text, zdroje, otisk)
  VALUES ('chmelovar', 'Chmelovar', 'F', 'Shrnutí [1].', '[{"n": 1, "pdf_index": 1}]', 'abc');
SELECT pg_temp.selze('SELECT * FROM public.bible_prehledy', 'přehledy čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze('SELECT * FROM public.bible_hledej(''amyl'')', 'hledání smí jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
SET enable_seqscan = off;
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT id FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')$q$)
                        LIKE '%bible_pasaze_hledani_idx%', 'hledání použije index');
RESET enable_seqscan;
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_nastaveni) = 12, 'dvanáct výchozích nastavení (7 základ + 2 překlad + 3 přehledy)');
SELECT pg_temp.ocekavam((public.bible_kapacita() -> 'knihovna' ->> 'dokumentu')::int = 1
                        AND (public.bible_kapacita() -> 'uloziste' -> 'knihovna' ->> 'bajtu')::bigint = 1234, 'kapacita: dokumenty i úložiště');

-- 7) Smazání ---------------------------------------------------------------------------
SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:C, 'prispiva', 'Cyril', pg_temp.soubor('b', 'druhy.pdf')) ->> 'obnoveno') = 'false',
  'druhé nahrání (nedokončené)');
SELECT pg_temp.ocekavam((public.bible_kapacita() -> 'knihovna' -> 'podle_stavu' ->> 'nahrava')::int = 1, 'kapacita ukáže i nedokončená nahrání');
SELECT pg_temp.selze(format('SELECT public.bible_smaz_dokument(%L, %L, %L)', :C, 'prispiva', pg_temp.dok('a')),
  'přispěvatel nesmaže zpracovaný dokument', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_smaz_dokument(%L, %L, %L)', :F, 'prispiva', pg_temp.dok('b')),
  'přispěvatel nesmaže cizí nahrání', '42501');
SELECT pg_temp.selze(format('SELECT public.bible_smaz_dokument(%L, %L, %L)', :B, 'cte', pg_temp.dok('b')), 'čtenář nesmaže nic', '42501');
SELECT pg_temp.ocekavam(public.bible_smaz_dokument(:C, 'prispiva', pg_temp.dok('b')) LIKE '%/druhy.pdf', 'přispěvatel zruší své nedokončené nahrání');
SELECT pg_temp.ocekavam(pg_temp.dok('b') IS NULL, 'zrušené nahrání je pryč');
-- Odkaz pro nahrání pořád platí → cesta se zapamatuje; soubor, který k ní dorazí, se uklidí až po vypršení odkazu.
SELECT pg_temp.ocekavam((SELECT count(*) = 1 AND bool_and(cesta LIKE '%/druhy.pdf' AND odkaz_plati_do > now()) FROM public.bible_smazane_soubory),
  'zrušené rozběhnuté nahrání: cesta zapamatovaná, dokud může platit odkaz');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_smazane_k_uklidu()) = 0, 'dokud odkaz platí, nic se neuklízí');
INSERT INTO storage.objects (bucket_id, name, metadata)
  SELECT 'knihovna', cesta, '{"size": 7}' FROM public.bible_smazane_soubory;
SELECT pg_temp.ocekavam((public.bible_kapacita() -> 'bez_zaznamu' ->> 'souboru')::int = 1, 'kapacita ukáže soubor bez záznamu (dorazil po zrušení)');
UPDATE public.bible_smazane_soubory SET odkaz_plati_do = now() - interval '1 minute' WHERE cesta LIKE '%/druhy.pdf';
SELECT pg_temp.ocekavam((SELECT array_agg(cesta) FROM public.bible_smazane_k_uklidu()) = (SELECT array_agg(cesta) FROM public.bible_smazane_soubory),
  'po vypršení odkazu je cesta k úklidu');
SELECT pg_temp.ocekavam(public.bible_smazane_uklizeno((SELECT array_agg(cesta) FROM public.bible_smazane_soubory)) = 1, 'po smazání souboru se cesta zapomene');
DELETE FROM storage.objects WHERE name LIKE '%/druhy.pdf';
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_smazane_soubory), 'žádná zapamatovaná cesta nezůstala');
-- Cesta, ke které zase existuje dokument (obnova ze zálohy), se jen zapomene — soubor se nemaže.
INSERT INTO public.bible_smazane_soubory (cesta, odkaz_plati_do)
  SELECT soubor_cesta, now() - interval '1 minute' FROM public.bible_dokumenty WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_smazane_k_uklidu()) = 0, 'cesta existujícího dokumentu se neuklízí…');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_smazane_soubory), '…jen se zapomene');
SELECT pg_temp.selze(format('SELECT public.bible_smazane_uklizeno(%L)', '{x}'), 'úklid smí jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
SELECT pg_temp.ocekavam(public.bible_smaz_dokument(:A, 'spravuje', gen_random_uuid()) IS NULL, 'neexistující dokument = NULL');
UPDATE public.bible_dokumenty SET nahrani_do = now() - interval '1 minute' WHERE id = pg_temp.dok('a');
SELECT pg_temp.ocekavam(public.bible_smaz_dokument(:A, 'spravuje', pg_temp.dok('a')) LIKE '%/kunze.pdf', 'správce smaže dokument (vrátí cestu souboru)');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_smazane_soubory), 'po vypršení odkazu se cesta smazaného dokumentu nepamatuje');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_strany) = 0 AND (SELECT count(*) FROM public.bible_pasaze) = 0
  AND (SELECT count(*) FROM public.bible_kapitoly) = 0, 'se smazaným dokumentem zmizí i strany, pasáže a kapitoly');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.ai_naklady) = 1, 'evidence nákladů zůstává i po smazání dokumentu');
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text LIKE 'bible\_%'
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
), 'každý cizí klíč na tabulky bible má index (smazání dokumentu neprochází celé tabulky)');

-- 8) Konektor do aplikace Claude (20261103030000_bible_mcp) ----------------------------
SELECT pg_temp.jako('service_role');
SELECT public.bible_mcp_registruj('klient_claude_0000001', 'Claude', ARRAY['https://claude.ai/api/mcp/auth_callback']);
SELECT pg_temp.selze($q$SELECT public.bible_mcp_vydej_kod(gen_random_uuid(), 'X', 'nic', 'klient_claude_0000001',
  'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), repeat('0', 64))$q$, 'kód jen s přístupem do bible', '42501');
SELECT pg_temp.ocekavam(NOT public.bible_mcp_vydej_kod('00000000-0000-0000-0000-0000000000aa', 'Honza', 'cte', 'klient_claude_0000001',
  'https://zly.example/cb', repeat('a', 43), repeat('1', 64)), 'cizí adresa návratu = žádný kód');
SELECT pg_temp.ocekavam(public.bible_mcp_vydej_kod('00000000-0000-0000-0000-0000000000aa', 'Honza', 'cte', 'klient_claude_0000001',
  'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), repeat('1', 64)), 'kód po Povolit');
SELECT pg_temp.ocekavam(NOT public.bible_mcp_vymen_kod(repeat('1', 64), 'klient_claude_0000001', 'https://claude.ai/api/mcp/auth_callback',
  repeat('b', 43), repeat('2', 64), repeat('3', 64)), 'špatný PKCE ověřovač = žádné tokeny');
SELECT pg_temp.ocekavam(public.bible_mcp_vymen_kod(repeat('1', 64), 'klient_claude_0000001', 'https://claude.ai/api/mcp/auth_callback',
  repeat('a', 43), repeat('2', 64), repeat('3', 64)), 'správný kód → tokeny');
SELECT pg_temp.ocekavam(NOT public.bible_mcp_vymen_kod(repeat('1', 64), 'klient_claude_0000001', 'https://claude.ai/api/mcp/auth_callback',
  repeat('a', 43), repeat('4', 64), repeat('5', 64)), 'kód jde použít jen jednou');
SELECT pg_temp.ocekavam((SELECT pristup FROM public.bible_mcp_over(repeat('2', 64))) = 'cte', 'přístupový token platí');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_mcp_over(repeat('3', 64))), 'obnovovací token nejde použít jako přístupový');
SELECT pg_temp.ocekavam(public.bible_mcp_obnov(repeat('3', 64), 'klient_claude_0000001', repeat('6', 64), repeat('7', 64)), 'obnovení vydá nové tokeny');
SELECT pg_temp.ocekavam(NOT public.bible_mcp_obnov(repeat('3', 64), 'klient_claude_0000001', repeat('8', 64), repeat('9', 64)),
  'starý obnovovací token znovu nejde…');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_mcp_over(repeat('6', 64))), '…a jeho zneužití zruší celé připojení');
SELECT public.bible_mcp_vydej_kod('00000000-0000-0000-0000-0000000000aa', 'Honza', 'cte', 'klient_claude_0000001',
  'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), repeat('c', 64));
SELECT public.bible_mcp_vymen_kod(repeat('c', 64), 'klient_claude_0000001', 'https://claude.ai/api/mcp/auth_callback',
  repeat('a', 43), repeat('d', 64), repeat('e', 64));
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_mcp_pripojeni('00000000-0000-0000-0000-0000000000aa')) = 1,
  'appka vidí jedno živé připojení');
SELECT pg_temp.ocekavam(public.bible_mcp_odpoj('00000000-0000-0000-0000-0000000000aa', NULL) = 1, 'odpojení');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_mcp_over(repeat('d', 64)))
                        AND NOT public.bible_mcp_obnov(repeat('e', 64), 'klient_claude_0000001', repeat('f', 64), repeat('0', 64)),
  'po odpojení nefunguje přístupový ani obnovovací token');
SELECT pg_temp.selze('SELECT * FROM public.bible_mcp_over(repeat(''d'', 64))', 'tokeny ověřuje jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');

-- Zkušenosti sládků (20261104000000_bible_zkusenosti).
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze('SELECT * FROM public.bible_zkusenosti', 'zkušenosti čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze($q$SELECT public.bible_zapis_zkusenost('00000000-0000-0000-0000-0000000000b1', 'cte', 'Čtenář',
  '{"nazev": "x", "text": "y"}'::jsonb)$q$, 'čtenář zkušenost nezapíše', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_zapis_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Přispěvatel',
  '{"nazev": "Ověřeno", "text": "y", "uroven": 2}'::jsonb)$q$, 'přispěvatel nesmí vydávat zkušenost za ověřenou (úroveň 1–3)', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_zapis_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Přispěvatel',
  '{"nazev": " ", "text": "y"}'::jsonb)$q$, 'prázdný název se odmítne', '23514');
SELECT pg_temp.selze($q$SELECT public.bible_zapis_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Přispěvatel',
  '{"nazev": "x", "text": "y", "oblasti": ["Z"]}'::jsonb)$q$, 'neznámá oblast se odmítne', '23514');
CREATE TEMP TABLE zk_id AS
  SELECT public.bible_zapis_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Přispěvatel',
    '{"typ": "reseni_problemu", "nazev": "Chmelovar: pěnění", "text": "Při přepěnění pomohlo snížit výkon varu o třetinu.", "oblasti": ["F", "F", "D"], "zdroj": "vlastní provoz"}'::jsonb) AS id;
SELECT pg_temp.ocekavam((SELECT uroven FROM public.bible_zkusenosti WHERE id = (SELECT id FROM zk_id)) = 4
                        AND (SELECT oblasti FROM public.bible_zkusenosti WHERE id = (SELECT id FROM zk_id)) = ARRAY['D', 'F']::text[],
  'zkušenost jednoho sládka = úroveň 4, oblasti bez opakování a seřazené');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti('pěnění chmelovar')) = 1, 'hledání bez diakritiky najde zkušenost');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti('penění')) = 1, 'předpona a diakritika v dotazu');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti('proč pivo málo pění při chmelovaru')) = 0
                        AND (SELECT count(*) FROM public.bible_hledej_zkusenosti_volne('proč pivo málo pění při chmelovaru')) = 1
                        AND (SELECT count(*) FROM public.bible_hledej_zkusenosti_volne('proč pivo málo pění', 'H')) = 0,
                        'zkušenosti otázkou v běžné řeči (volné hledání, filtr oblasti)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti(NULL, 'F')) = 1
                        AND (SELECT count(*) FROM public.bible_hledej_zkusenosti(NULL, 'H')) = 0, 'filtr oblasti');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti(NULL, NULL, 3::smallint)) = 0, 'filtr důvěryhodnosti (jen úroveň 1–3 nic nevrátí)');
SELECT pg_temp.selze($q$SELECT public.bible_uprav_zkusenost('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM zk_id),
  '{"nazev": "Cizí", "text": "y"}'::jsonb)$q$, 'přispěvatel neupraví cizí zkušenost', '42501');
SELECT pg_temp.ocekavam(public.bible_uprav_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM zk_id),
  '{"nazev": "Chmelovar: pěnění varu", "text": "Upraveno.", "oblasti": ["F"]}'::jsonb), 'autor upraví svoji zkušenost');
SELECT pg_temp.ocekavam(public.bible_uprav_zkusenost('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM zk_id),
  '{"nazev": "Chmelovar: pěnění varu", "text": "Ověřeno třikrát.", "uroven": 3}'::jsonb), 'správce nastaví ověřenou úroveň');
SELECT pg_temp.selze($q$SELECT public.bible_uprav_zkusenost('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM zk_id),
  '{"nazev": "x", "text": "y"}'::jsonb)$q$, 'autor nesmí přepsat zkušenost, kterou správce ověřil', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_smaz_zkusenost('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM zk_id))$q$,
  'přispěvatel nesmaže cizí zkušenost', '42501');
SELECT pg_temp.ocekavam(NOT public.bible_smaz_zkusenost('00000000-0000-0000-0000-0000000000a1', 'spravuje', gen_random_uuid()), 'smazání neexistující = false');
SELECT pg_temp.ocekavam(public.bible_smaz_zkusenost('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM zk_id)), 'správce smaže jakoukoli zkušenost');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_hledej_zkusenosti()) = 0, 'po smazání nic není');
DROP TABLE zk_id;

-- Nová vydání dokumentů (20261104050000_bible_vydani).
SELECT pg_temp.jako('service_role');
INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, nahral, stav) VALUES
  ('77777777-0000-0000-0000-000000000001', 'Technologie piva, 1. vyd.', '77777777-0000-0000-0000-000000000001/a.pdf', 'a.pdf', 1, repeat('a1', 32), now(), '00000000-0000-0000-0000-0000000000b2', 'hotovo'),
  ('77777777-0000-0000-0000-000000000002', 'Technologie piva, 2. vyd.', '77777777-0000-0000-0000-000000000002/b.pdf', 'b.pdf', 1, repeat('b2', 32), now(), '00000000-0000-0000-0000-0000000000b2', 'hotovo'),
  ('77777777-0000-0000-0000-000000000003', 'Technologie piva, 3. vyd.', '77777777-0000-0000-0000-000000000003/c.pdf', 'c.pdf', 1, repeat('c3', 32), now(), '00000000-0000-0000-0000-0000000000b3', 'hotovo');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000b1', 'cte',
  '77777777-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001')$q$, 'čtenář vydání nepropojí', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000b2', 'prispiva',
  '77777777-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000002')$q$, 'přispěvatel nepropojí cizí dokument', '42501');
SELECT pg_temp.ocekavam(public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000b2', 'prispiva',
  '77777777-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001'), 'autor označí svůj dokument jako nové vydání');
SELECT pg_temp.ocekavam((SELECT predchozi_vydani FROM public.bible_dokumenty WHERE id = '77777777-0000-0000-0000-000000000002')
                        = '77777777-0000-0000-0000-000000000001', 'vazba je uložená');
SELECT pg_temp.ocekavam(public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  '77777777-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000002'), 'správce propojí jakýkoli dokument (řada 1 ← 2 ← 3)');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  '77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000003')$q$, 'kruh vydání (1 ← 3, když 3 je novější než 1) se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  '77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001')$q$, 'kniha není novým vydáním sama sebe', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  '77777777-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'neexistující předchozí vydání se odmítne', '22023');
SELECT pg_temp.ocekavam(NOT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  gen_random_uuid(), '77777777-0000-0000-0000-000000000001'), 'neexistující dokument = false');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET predchozi_vydani = id WHERE id = '77777777-0000-0000-0000-000000000001'$q$,
  'ani přímý zápis neudělá z knihy vydání sebe sama', '23514');
SELECT pg_temp.ocekavam(public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000b3', 'prispiva',
  '77777777-0000-0000-0000-000000000003', NULL), 'autor vazbu zruší');
SELECT pg_temp.ocekavam((SELECT predchozi_vydani IS NULL FROM public.bible_dokumenty WHERE id = '77777777-0000-0000-0000-000000000003'),
  'zrušená vazba je pryč, dokument zůstal');
DELETE FROM public.bible_dokumenty WHERE id = '77777777-0000-0000-0000-000000000001';
SELECT pg_temp.ocekavam((SELECT predchozi_vydani IS NULL FROM public.bible_dokumenty WHERE id = '77777777-0000-0000-0000-000000000002'),
  'smazání staršího vydání novější nesmaže, jen zruší vazbu');
SELECT pg_temp.selze($q$SELECT public.bible_nastav_vydani('00000000-0000-0000-0000-0000000000a1', 'spravuje',
  '77777777-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000003')$q$, 'vazbu nastavuje jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
DELETE FROM public.bible_dokumenty WHERE id IN ('77777777-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000003');

-- 🏭 Etapa 7 — Technologie pivovaru (profil, zařízení, postupy) ----------------
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze($q$SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b1', 'cte', 'Čtenář', '{"nazev":"Pivovar"}')$q$,
  'čtenář profil pivovaru nezaloží', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', '{"nazev":"  "}')$q$,
  'pivovar bez názvu se odmítne', '23514');
CREATE TEMP TABLE t_piv AS SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Pivovar Zkušební","popis":"Dvounádobová varna 10 hl"}') AS id;
SELECT pg_temp.ocekavam((SELECT hlavni FROM public.bible_pivovary WHERE id = (SELECT id FROM t_piv)), 'první pivovar je hlavní sám od sebe');
CREATE TEMP TABLE t_piv2 AS SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Pivovar Druhý","hlavni":true}') AS id;
SELECT pg_temp.ocekavam((SELECT count(*) = 1 FROM public.bible_pivovary WHERE hlavni), 'hlavní je vždy nejvýš jeden');
SELECT pg_temp.ocekavam((SELECT hlavni FROM public.bible_pivovary WHERE id = (SELECT id FROM t_piv2)), 'nový hlavní přebral označení');
SELECT pg_temp.ocekavam(public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('id', (SELECT id FROM t_piv2), 'nazev', 'Pivovar Druhý', 'hlavni', false)) = (SELECT id FROM t_piv2)
  AND (SELECT hlavni FROM public.bible_pivovary WHERE id = (SELECT id FROM t_piv2)), 'hlavní pivovar nejde přepnout na „žádný hlavní"');
SELECT pg_temp.selze($q$SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('id', gen_random_uuid(), 'nazev', 'X'))$q$, 'úprava neexistujícího pivovaru se odmítne', 'P0002');

SELECT pg_temp.selze($q$SELECT public.bible_zarizeni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'druh', 'raketa', 'nazev', 'X'))$q$, 'neznámý druh zařízení se odmítne', '23514');
SELECT pg_temp.selze($q$SELECT public.bible_zarizeni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'druh', 'tank_kvasny', 'nazev', 'CKT 1',
    'parametry', '[{"nazev":"Objem","hodnota":"80"}]'::jsonb))$q$, 'hodnota parametru jako text se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_zarizeni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'druh', 'tank_kvasny', 'nazev', 'CKT 1',
    'parametry', '[{"nazev":"Objem"}]'::jsonb))$q$, 'parametr bez hodnoty se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_zarizeni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'druh', 'tank_kvasny', 'nazev', 'CKT 1',
    'parametry', '[{"nazev":"Objem","hodnota":80,"zdroj":"hadam"}]'::jsonb))$q$, 'neznámý zdroj parametru se odmítne', '22023');
CREATE TEMP TABLE t_zar AS SELECT public.bible_zarizeni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'druh', 'tank_kvasny', 'nazev', 'Spilka 1', 'pocet', 1,
    'parametry', '[{"nazev":"Objem užitný","hodnota":80,"jednotka":"hl","zdroj":"sklep"},{"nazev":"Materiál","text":"nerez 1.4301"}]'::jsonb)) AS id;
SELECT pg_temp.ocekavam((SELECT parametry -> 1 ->> 'zdroj' FROM public.bible_zarizeni WHERE id = (SELECT id FROM t_zar)) = 'odhad',
  'parametr bez zdroje se uloží jako odhad');
SELECT pg_temp.ocekavam((SELECT (parametry -> 0 ->> 'hodnota')::numeric = 80 FROM public.bible_zarizeni WHERE id = (SELECT id FROM t_zar)),
  'číselná hodnota parametru se uloží jako číslo');
SELECT pg_temp.ocekavam(public.bible_zarizeni_prevezmi('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', (SELECT id FROM t_piv),
  '[{"druh":"tank_kvasny","nazev":"SPILKA 1"},{"druh":"tank_lezacky","nazev":"Tank 1","parametry":[{"nazev":"Objem užitný","hodnota":75,"jednotka":"hl","zdroj":"sklep"}]}]'::jsonb) = 1,
  'převzetí ze Sklepa zapíše jen nové (stejný název se přeskočí bez ohledu na velikost písmen)');
SELECT pg_temp.selze($q$SELECT public.bible_zarizeni_prevezmi('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', (SELECT id FROM t_piv),
  '[{"druh":"tank_lezacky","nazev":"Tank 2"},{"druh":"tank_lezacky","nazev":"Tank 3","parametry":[{"nazev":"Objem"}]}]'::jsonb)$q$,
  'chyba v jednom řádku převzetí zruší celé převzetí', '22023');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_zarizeni WHERE nazev = 'Tank 2'), 'po chybě nezůstal ani první řádek');

CREATE TEMP TABLE t_post AS SELECT public.bible_postup_provozu_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'nazev', 'CIP spilky', 'oblast', 'L', 'kroky', '1. Předplach. 2. Louh 2 % 75 °C.')) AS id;
SELECT pg_temp.selze($q$SELECT public.bible_postup_provozu_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  jsonb_build_object('pivovar_id', (SELECT id FROM t_piv), 'nazev', 'X', 'oblast', 'Z', 'kroky', 'a'))$q$, 'oblast mimo A–T se odmítne', '23514');

SELECT pg_temp.ocekavam((public.bible_technologie(NULL) ->> 'pivovar_id')::uuid = (SELECT id FROM t_piv2), 'bez výběru se čte hlavní pivovar');
SELECT pg_temp.ocekavam(jsonb_array_length(public.bible_technologie((SELECT id FROM t_piv)) -> 'zarizeni') = 2
  AND jsonb_array_length(public.bible_technologie((SELECT id FROM t_piv)) -> 'postupy') = 1
  AND jsonb_array_length(public.bible_technologie(NULL) -> 'pivovary') = 2, 'čtení vrátí pivovary, zařízení a postupy vybraného');

SELECT pg_temp.selze($q$SELECT public.bible_pivovar_smaz('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM t_piv))$q$,
  'přispěvatel celý pivovar nesmaže', '42501');
SELECT pg_temp.ocekavam(public.bible_zarizeni_smaz('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM t_zar)), 'přispěvatel smaže zařízení');
SELECT pg_temp.ocekavam(public.bible_pivovar_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t_piv)), 'správce smaže pivovar');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_postupy_provozu WHERE id = (SELECT id FROM t_post))
  AND NOT EXISTS (SELECT 1 FROM public.bible_zarizeni WHERE pivovar_id = (SELECT id FROM t_piv)), 's pivovarem zmizí i jeho zařízení a postupy');
CREATE TEMP TABLE t_piv3 AS SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', '{"nazev":"Pivovar Třetí"}') AS id;
SELECT pg_temp.ocekavam(NOT (SELECT hlavni FROM public.bible_pivovary WHERE id = (SELECT id FROM t_piv3)), 'další pivovar hlavní sám od sebe není');
SELECT pg_temp.ocekavam(public.bible_pivovar_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t_piv2)), 'správce smaže hlavní pivovar');
SELECT pg_temp.ocekavam((SELECT hlavni FROM public.bible_pivovary WHERE id = (SELECT id FROM t_piv3)), 'po smazání hlavního se hlavním stane zbývající pivovar');
SELECT pg_temp.ocekavam(NOT public.bible_pivovar_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t_piv2)),
  'smazání pivovaru, který už není, vrátí ne');
SELECT pg_temp.selze($q$SELECT public.bible_technologie(NULL)$q$, 'profil čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
DELETE FROM public.bible_pivovary WHERE id IN ((SELECT id FROM t_piv2), (SELECT id FROM t_piv3));

-- 🍺 Etapa 8 — Receptury a várky ------------------------------------------------
SELECT pg_temp.jako('service_role');
CREATE TEMP TABLE t8_piv AS SELECT public.bible_pivovar_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', '{"nazev":"Pivovar Várkový"}') AS id;
SELECT pg_temp.selze($q$SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b1', 'cte', 'Čtenář', '{"nazev":"Ležák"}')$q$,
  'čtenář recepturu nezapíše', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Ležák","suroviny":[{"druh":"cukr","nazev":"X"}]}')$q$, 'neznámý druh suroviny se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Ležák","cil_stupnovitost":"11"}')$q$, 'cíl jako text se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Ležák","cil_stupnovitost":50}')$q$, 'cíl mimo rozsah se odmítne', '23514');
SELECT pg_temp.selze($q$SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"nazev":"Ležák","kroky":[{"faze":"rmutovani","nazev":"Peptonizace","teplota_c":150}]}')$q$, 'teplota kroku mimo rozsah se odmítne', '22023');
CREATE TEMP TABLE t8_rec AS SELECT public.bible_receptura_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', jsonb_build_object(
  'pivovar_id', (SELECT id FROM t8_piv), 'nazev', 'Světlý ležák 11', 'styl', 'český ležák', 'cil_objem_hl', 10, 'cil_stupnovitost', 11.2,
  'suroviny', '[{"druh":"slad","nazev":"Plzeňský","mnozstvi":180,"jednotka":"kg"},{"druh":"chmel","nazev":"Žatecký","mnozstvi":1.2,"jednotka":"kg","kdy":"60 min"}]'::jsonb,
  'kroky', '[{"faze":"rmutovani","nazev":"Nástřik","teplota_c":52,"minut":15},{"faze":"chmelovar","nazev":"Var","minut":90}]'::jsonb)) AS id;
SELECT pg_temp.ocekavam((SELECT jsonb_array_length(suroviny) = 2 AND jsonb_array_length(kroky) = 2 AND cil_stupnovitost = 11.2
  FROM public.bible_receptury WHERE id = (SELECT id FROM t8_rec)), 'receptura se uloží se surovinami, kroky a cíli');

SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"pivo":"Ležák","datum_varu":"2026-11-03","hodnoty":{"vytezek":70}}')$q$, 'neznámá hodnota várky se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"pivo":"Ležák","datum_varu":"2026-11-03","hodnoty":{"mladina_p":"11,2"}}')$q$, 'hodnota várky jako text se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"pivo":"Ležák","datum_varu":"2026-11-03","hodnoty":{"mladina_p":40}}')$q$, 'hodnota várky mimo rozsah se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"pivo":"Ležák","datum_varu":"2026-11-03","hodnoty":{"kvasnice_generace":2.5}}')$q$, 'generace kvasnic musí být celé číslo', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek',
  '{"pivo":"Ležák","datum_varu":"1980-01-01"}')$q$, 'datum varu mimo rozsah se odmítne', '23514');
CREATE TEMP TABLE t8_v1 AS SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', jsonb_build_object(
  'pivovar_id', (SELECT id FROM t8_piv), 'receptura_id', (SELECT id FROM t8_rec), 'cislo', ' 12 ', 'pivo', 'Světlý ležák 11', 'datum_varu', '2026-11-03',
  'hodnoty', '{"sypani_kg":180,"mladina_objem_hl":10.4,"mladina_p":11.3,"pivo_ibu":null}'::jsonb)) AS id;
SELECT pg_temp.ocekavam((SELECT hodnoty = '{"sypani_kg":180,"mladina_objem_hl":10.4,"mladina_p":11.3}'::jsonb AND cislo = '12'
  FROM public.bible_varky WHERE id = (SELECT id FROM t8_v1)), 'hodnoty várky se uloží, null se vynechá, číslo se ořízne');
SELECT pg_temp.selze($q$SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b3', 'prispiva', 'Jiný sládek', jsonb_build_object(
  'pivovar_id', (SELECT id FROM t8_piv), 'cislo', '12', 'pivo', 'Ležák', 'datum_varu', '2026-11-04'))$q$,
  'stejné číslo várky v pivovaru se podruhé nezapíše', '22023');
CREATE TEMP TABLE t8_v2 AS SELECT public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b3', 'prispiva', 'Jiný sládek',
  '{"cislo":"12","pivo":"Ležák","datum_varu":"2026-11-04"}'::jsonb) AS id;
SELECT pg_temp.ocekavam((SELECT count(*) = 2 FROM public.bible_varky WHERE cislo = '12'), 'stejné číslo bez pivovaru je jiná várka');
SELECT pg_temp.ocekavam(public.bible_varka_uloz('00000000-0000-0000-0000-0000000000b3', 'prispiva', 'Jiný sládek', jsonb_build_object(
  'id', (SELECT id FROM t8_v1), 'pivovar_id', (SELECT id FROM t8_piv), 'receptura_id', (SELECT id FROM t8_rec), 'cislo', '12', 'pivo', 'Světlý ležák 11',
  'datum_varu', '2026-11-03', 'hodnoty', '{"sypani_kg":180,"mladina_objem_hl":10.4,"mladina_p":11.3,"pivo_zdanlivy_p":2.4}'::jsonb)) = (SELECT id FROM t8_v1),
  'várku doplní jiný přispěvatel (laboratoř) a vlastní číslo duplicitu není');
SELECT pg_temp.selze($q$SELECT public.bible_varka_smaz('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM t8_v1))$q$,
  'cizí várku přispěvatel nesmaže', '42501');
SELECT pg_temp.ocekavam(jsonb_array_length(public.bible_varky_prehled() -> 'varky') = 2
  AND (public.bible_varky_prehled() -> 'varky' -> 0 ->> 'datum_varu') = '2026-11-04'
  AND jsonb_array_length(public.bible_varky_prehled() -> 'receptury') = 1, 'přehled vrátí várky od nejnovější a receptury');
SELECT pg_temp.ocekavam(public.bible_receptura_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t8_rec)), 'správce smaže recepturu');
SELECT pg_temp.ocekavam((SELECT receptura_id IS NULL FROM public.bible_varky WHERE id = (SELECT id FROM t8_v1)), 'po smazání receptury várka zůstane bez receptury');
SELECT pg_temp.ocekavam(public.bible_pivovar_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t8_piv)), 'správce smaže pivovar');
SELECT pg_temp.ocekavam((SELECT pivovar_id IS NULL FROM public.bible_varky WHERE id = (SELECT id FROM t8_v1)),
  'po smazání pivovaru várka zůstane (i když stejné číslo má várka bez pivovaru)');
SELECT pg_temp.ocekavam(public.bible_varka_smaz('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM t8_v1)), 'autor svou várku smaže');
SELECT pg_temp.ocekavam(NOT public.bible_varka_smaz('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT id FROM t8_v1)), 'smazání neexistující várky vrátí ne');
SELECT pg_temp.selze($q$SELECT public.bible_varky_prehled()$q$, 'várky čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
DELETE FROM public.bible_varky WHERE id = (SELECT id FROM t8_v2);

-- 🌐 Etapa 9 — Rešerše z internetu ------------------------------------------------
SELECT pg_temp.jako('service_role');
SELECT pg_temp.selze($q$SELECT public.bible_web_zdroj_uloz('00000000-0000-0000-0000-0000000000b1', 'cte', 'Čtenář', false,
  '{"url":"https://example.org/a","titulek":"A","shrnuti":"S"}')$q$, 'čtenář webový zdroj nezapíše', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_web_zdroj_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  '{"url":"ftp://example.org/a","titulek":"A","shrnuti":"S"}')$q$, 'adresa jinde než http(s) se odmítne', '23514');
SELECT pg_temp.selze($q$SELECT public.bible_web_zdroj_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  '{"url":"https://example.org/a","titulek":"A","shrnuti":"S","oblasti":["Z"]}')$q$, 'oblast mimo A–T se odmítne', '22023');
CREATE TEMP TABLE t9_w AS SELECT public.bible_web_zdroj_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  '{"url":"https://example.org/chmel","titulek":"Chmelení za studena","shrnuti":"Shrnutí vlastními slovy.","oblasti":["F","F","D"],"duvera":3,"datum_publikace":"2025-04-01"}') AS r;
SELECT pg_temp.ocekavam((SELECT (r ->> 'novy')::boolean AND r ->> 'stav' = 'neovereno' FROM t9_w), 'nový zdroj je vždy neověřený');
SELECT pg_temp.ocekavam((SELECT oblasti = ARRAY['D','F'] AND pres_claude AND duvera = 3 FROM public.bible_web_zdroje WHERE id = (SELECT (r ->> 'id')::uuid FROM t9_w)),
  'oblasti bez opakování a seřazené, zapsal Claude');
SELECT pg_temp.ocekavam((SELECT NOT (public.bible_web_zdroj_uloz('00000000-0000-0000-0000-0000000000b3', 'prispiva', 'Jiný', false,
  '{"url":"HTTPS://EXAMPLE.ORG/chmel","titulek":"Jinak","shrnuti":"Jinak"}') ->> 'novy')::boolean),
  'stejná adresa podruhé nezaloží nový zdroj (vrátí existující)');
SELECT pg_temp.ocekavam((SELECT count(*) = 1 FROM public.bible_web_zdroje), 'zdroj je v rešerši jen jednou');
SELECT pg_temp.selze($q$SELECT public.bible_web_zdroj_over('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', (SELECT (r ->> 'id')::uuid FROM t9_w), 'overeno', NULL)$q$,
  'přispěvatel zdroj neověří', '42501');
SELECT pg_temp.ocekavam(public.bible_web_zdroj_over('00000000-0000-0000-0000-0000000000a1', 'spravuje', 'Správce', (SELECT (r ->> 'id')::uuid FROM t9_w), 'overeno', 'Odborný časopis.'),
  'správce zdroj ověří');
SELECT pg_temp.ocekavam((SELECT stav = 'overeno' AND overil_jmeno = 'Správce' AND overeno_at IS NOT NULL FROM public.bible_web_zdroje), 'ověření se zapíše s kým a kdy');
SELECT pg_temp.ocekavam(public.bible_web_zdroj_over('00000000-0000-0000-0000-0000000000a1', 'spravuje', 'Správce', (SELECT (r ->> 'id')::uuid FROM t9_w), 'neovereno', NULL),
  'správce vrátí zdroj do neověřených');
SELECT pg_temp.ocekavam((SELECT overil IS NULL AND overeno_at IS NULL FROM public.bible_web_zdroje), 'vrácení do neověřených smaže, kdo ověřil');
SELECT pg_temp.selze($q$SELECT public.bible_web_zdroj_smaz('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT (r ->> 'id')::uuid FROM t9_w))$q$,
  'cizí zdroj přispěvatel nesmaže', '42501');
SELECT pg_temp.ocekavam(jsonb_array_length(public.bible_web_zdroje_prehled()) = 1, 'přehled vrátí zdroje');
SELECT pg_temp.ocekavam(public.bible_web_zdroj_smaz('00000000-0000-0000-0000-0000000000b2', 'prispiva', (SELECT (r ->> 'id')::uuid FROM t9_w)), 'autor svůj zdroj smaže');

-- 🩺 Etapa 10 — Analýza problémů ----------------------------------------------------
CREATE TEMP TABLE t10_p AS SELECT public.bible_problem_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', false,
  '{"nazev":"Nízký výtěžek","popis":"Poslední tři várky mají o 3 % nižší výtěžek.","varky":["11111111-0000-0000-0000-000000000001","11111111-0000-0000-0000-000000000001"],"oblasti":["T","E"]}') AS id;
SELECT pg_temp.ocekavam((SELECT cardinality(varky) = 1 AND oblasti = ARRAY['E','T'] AND stav = 'otevreny' FROM public.bible_problemy WHERE id = (SELECT id FROM t10_p)),
  'problém: várky bez opakování, oblasti seřazené, otevřený');
SELECT pg_temp.selze($q$SELECT public.bible_zjisteni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  jsonb_build_object('problem_id', (SELECT id FROM t10_p), 'typ', 'fakt', 'text', 'Kunze uvádí…'))$q$, 'fakt bez zdroje se odmítne', '22023');
SELECT pg_temp.selze($q$SELECT public.bible_zjisteni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  jsonb_build_object('problem_id', (SELECT id FROM t10_p), 'typ', 'domnenka', 'text', 'X'))$q$, 'neznámý typ zjištění se odmítne', '23514');
CREATE TEMP TABLE t10_z AS SELECT public.bible_zjisteni_uloz('00000000-0000-0000-0000-0000000000b2', 'prispiva', 'Sládek', true,
  jsonb_build_object('problem_id', (SELECT id FROM t10_p), 'typ', 'hypoteza', 'text', 'Hrubší šrot po výměně válců.')) AS id;
SELECT pg_temp.ocekavam((SELECT stav = 'navrzeno' AND pres_claude FROM public.bible_problem_zjisteni WHERE id = (SELECT id FROM t10_z)), 'hypotéza začíná jako navržená');
SELECT pg_temp.ocekavam(public.bible_zjisteni_stav('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM t10_z), 'potvrzeno'), 'přispěvatel hypotézu potvrdí');
SELECT pg_temp.selze($q$SELECT public.bible_zjisteni_stav('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM t10_z), 'jiste')$q$,
  'neznámý stav zjištění se odmítne', '22023');
SELECT pg_temp.ocekavam((public.bible_problemy_prehled() -> 0 -> 'zjisteni' -> 0 ->> 'stav') = 'potvrzeno', 'přehled vrátí problém se zjištěními');
SELECT pg_temp.selze($q$SELECT public.bible_zjisteni_smaz('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM t10_z))$q$,
  'cizí zjištění přispěvatel nesmaže', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_problem_smaz('00000000-0000-0000-0000-0000000000b3', 'prispiva', (SELECT id FROM t10_p))$q$,
  'cizí problém přispěvatel nesmaže', '42501');
SELECT pg_temp.ocekavam(public.bible_problem_smaz('00000000-0000-0000-0000-0000000000a1', 'spravuje', (SELECT id FROM t10_p)), 'správce problém smaže');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_problem_zjisteni WHERE id = (SELECT id FROM t10_z)), 's problémem zmizí i jeho zjištění');
SELECT pg_temp.selze($q$SELECT public.bible_problemy_prehled()$q$, 'problémy čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');

-- 💬 Chatbot (etapa 5) — konverzace, zprávy, náklady, strop ----------------------
SELECT pg_temp.jako('service_role');
CREATE TEMP TABLE t5_k AS SELECT public.bible_konverzace_zaloz('00000000-0000-0000-0000-0000000000b2', '  Proč málo pění?  ', NULL) AS id;
SELECT pg_temp.ocekavam((SELECT nazev = 'Proč málo pění?' FROM public.bible_konverzace WHERE id = (SELECT id FROM t5_k)), 'konverzace dostane název z otázky');
SELECT pg_temp.ocekavam(public.bible_zprava_uloz('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k), 'uzivatel', 'Proč málo pění?',
  NULL, NULL, NULL, 0, 0, 0, false) IS NOT NULL, 'otázka se uloží');
SELECT pg_temp.ocekavam(public.bible_zprava_uloz('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k), 'asistent', 'Krátká odpověď…',
  '[{"nastroj":"hledej_v_knihach"}]', '[{"kniha_id":"x","list":12}]', 'claude-opus-5-5', 12000, 900, 0.066, false) IS NOT NULL, 'odpověď se uloží s náklady');
SELECT pg_temp.selze($q$SELECT public.bible_zprava_uloz('00000000-0000-0000-0000-0000000000b3', (SELECT id FROM t5_k), 'uzivatel', 'cizí', NULL, NULL, NULL, 0, 0, 0, false)$q$,
  'do cizí konverzace zapsat nejde', 'P0002');
SELECT pg_temp.selze($q$SELECT public.bible_zprava_uloz('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k), 'system', 'x', NULL, NULL, NULL, 0, 0, 0, false)$q$,
  'neznámá role zprávy se odmítne', '23514');
SELECT pg_temp.ocekavam(public.bible_konverzace_zpravy('00000000-0000-0000-0000-0000000000b3', (SELECT id FROM t5_k)) IS NULL, 'cizí konverzaci nikdo jiný nepřečte');
SELECT pg_temp.ocekavam(jsonb_array_length(public.bible_konverzace_zpravy('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k)) -> 'zpravy') = 2
  AND (public.bible_konverzace_zpravy('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k)) -> 'zpravy' -> 0 ->> 'role') = 'uzivatel',
  'vlastní konverzace vrátí zprávy od nejstarší');
SELECT pg_temp.ocekavam(jsonb_array_length(public.bible_konverzace_seznam('00000000-0000-0000-0000-0000000000b2')) = 1
  AND jsonb_array_length(public.bible_konverzace_seznam('00000000-0000-0000-0000-0000000000b3')) = 0, 'seznam ukáže jen vlastní konverzace');
SELECT pg_temp.ocekavam(public.bible_naklad_zapis('chat', 'claude-opus-5-5', 3, 12000, 900, 4000, 2000, 0.066, '00000000-0000-0000-0000-0000000000b2', 'test') IS NOT NULL,
  'náklad chatu se zapíše');
SELECT pg_temp.ocekavam((public.bible_ai_utrata_mesic() ->> 'chat_usd')::numeric = 0.066 AND (public.bible_ai_utrata_mesic() ->> 'chat_dotazu')::int = 1
  AND (public.bible_ai_utrata_mesic() ->> 'strop_usd')::numeric = 20 AND public.bible_ai_utrata_mesic() ->> 'model' = 'claude-opus-5-5',
  'útrata měsíce: chat, počet dotazů, strop a model');
SELECT pg_temp.selze($q$SELECT public.bible_strop_nastav('00000000-0000-0000-0000-0000000000b2', 'prispiva', 50)$q$, 'přispěvatel strop nezmění', '42501');
SELECT pg_temp.selze($q$SELECT public.bible_strop_nastav('00000000-0000-0000-0000-0000000000a1', 'spravuje', 5000)$q$, 'strop nad 1000 USD se odmítne', '22023');
SELECT pg_temp.ocekavam(public.bible_strop_nastav('00000000-0000-0000-0000-0000000000a1', 'spravuje', 7.5), 'správce strop změní');
SELECT pg_temp.ocekavam((public.bible_ai_utrata_mesic() ->> 'strop_usd')::numeric = 7.5, 'nový strop platí');
SELECT public.bible_strop_nastav('00000000-0000-0000-0000-0000000000a1', 'spravuje', 20);
SELECT pg_temp.ocekavam(NOT public.bible_konverzace_smaz('00000000-0000-0000-0000-0000000000b3', (SELECT id FROM t5_k)), 'cizí konverzaci smazat nejde');
SELECT pg_temp.ocekavam(public.bible_konverzace_smaz('00000000-0000-0000-0000-0000000000b2', (SELECT id FROM t5_k)), 'vlastní konverzace se smaže');
SELECT pg_temp.ocekavam(NOT EXISTS (SELECT 1 FROM public.bible_zpravy WHERE konverzace_id = (SELECT id FROM t5_k)), 's konverzací zmizí i zprávy');
SELECT pg_temp.selze($q$SELECT public.bible_konverzace_seznam('00000000-0000-0000-0000-0000000000b2')$q$, 'konverzace čte jen service role', '42501')
  FROM (SELECT pg_temp.jako('authenticated')) j;
SELECT pg_temp.jako('service_role');
DELETE FROM public.ai_naklady WHERE ucel = 'chat' AND poznamka = 'test';

SELECT pg_temp.jako(NULL);
SELECT 'VŠECHNY KONTROLY PROJEKTU BIBLE PROŠLY' AS vysledek;
