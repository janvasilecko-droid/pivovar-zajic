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
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'worker nedokončené nahrání nevezme');
SELECT pg_temp.ocekavam((public.bible_zaloz_nahrani(:F, 'prispiva', 'Franta', pg_temp.soubor('a')) ->> 'duplicita') = 'true',
  'stejný soubor od jiného přispěvatele = duplicita');
SELECT pg_temp.ocekavam((SELECT r ->> 'obnoveno' = 'true' AND (r ->> 'id')::uuid = pg_temp.dok('a') AND r ->> 'soubor_nahran' = 'false'
                           FROM (SELECT public.bible_zaloz_nahrani(:C, 'prispiva', 'Cyril', pg_temp.soubor('a')) r) x),
  'vlastní nedokončené nahrání téhož souboru se vrátí (bez nového řádku)');
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
SET enable_seqscan = off;
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT id FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')$q$)
                        LIKE '%bible_pasaze_hledani_idx%', 'hledání použije index');
RESET enable_seqscan;
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_nastaveni) = 7, 'sedm výchozích nastavení');
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
SELECT pg_temp.ocekavam(public.bible_smaz_dokument(:A, 'spravuje', gen_random_uuid()) IS NULL, 'neexistující dokument = NULL');
SELECT pg_temp.ocekavam(public.bible_smaz_dokument(:A, 'spravuje', pg_temp.dok('a')) LIKE '%/kunze.pdf', 'správce smaže dokument (vrátí cestu souboru)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_strany) = 0 AND (SELECT count(*) FROM public.bible_pasaze) = 0
  AND (SELECT count(*) FROM public.bible_kapitoly) = 0, 'se smazaným dokumentem zmizí i strany, pasáže a kapitoly');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.ai_naklady) = 1, 'evidence nákladů zůstává i po smazání dokumentu');
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text LIKE 'bible\_%'
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
), 'každý cizí klíč na tabulky bible má index (smazání dokumentu neprochází celé tabulky)');

SELECT pg_temp.jako(NULL);
SELECT 'VŠECHNY KONTROLY PROJEKTU BIBLE PROŠLY' AS vysledek;
