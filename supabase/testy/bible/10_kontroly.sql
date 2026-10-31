-- Kontroly migrací Pivovarské bible (pouštět po 00_stuby.sql a migracích
-- *_pivovarska_bible_*.sql). Každá kontrola při selhání skončí chybou
-- „TEST SELHAL: …" a psql s ON_ERROR_STOP vrátí nenulový kód → CI červená.
--
-- Hlídá hlavně to, co se nesmí rozbít potichu: přístup je fail-closed, nikdo
-- si nepodstrčí autora ani stav zpracování, čtenář nic nezapíše, fronta
-- workeru nevydá jeden dokument dvakrát, hledání bez diakritiky funguje
-- a smazání dokumentu odnese i odvozená data.
\set ON_ERROR_STOP 1

-- Kdo jsem: uuid uživatele, NULL = anon, 'service' = worker (service role).
CREATE OR REPLACE FUNCTION pg_temp.jako(p_kdo text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF p_kdo IS NULL THEN
    EXECUTE 'SET ROLE anon';
  ELSIF p_kdo = 'service' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
    EXECUTE 'SET ROLE service_role';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', p_kdo, false);
    EXECUTE 'SET ROLE authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.ocekavam(p_podminka boolean, p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_podminka IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST SELHAL: %', p_popis;
  END IF;
END $$;

-- Příkaz musí databáze odmítnout (právo, kontrola, unikátnost, trigger 42501).
CREATE OR REPLACE FUNCTION pg_temp.selze(p_prikaz text, p_popis text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_prikaz;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR unique_violation OR foreign_key_violation THEN
    RETURN;
  END;
  RAISE EXCEPTION 'TEST SELHAL (mělo být odmítnuto): %', p_popis;
END $$;

-- Počet řádků, kterých se příkaz dotkl (RLS u UPDATE/DELETE chybu nedá, jen 0).
CREATE OR REPLACE FUNCTION pg_temp.radku(p_prikaz text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  EXECUTE p_prikaz;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Plán dotazu jako text (kontrola, že hledání použije index i pod RLS).
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

-- 1) Kdo smí do knihovny -------------------------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'spravuje', 'admin spravuje');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'cte', 'modul bible jen „vidět" = čte');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'prispiva', 'vidět + upravovat = přispívá');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000d');
SELECT pg_temp.ocekavam(public.bible_pristup() IS NULL, 'bez modulu bible žádný přístup (fail-closed)');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000e');
SELECT pg_temp.ocekavam(public.bible_pristup() = 'spravuje', 'sládek (i s mezerou a velkým písmenem) spravuje');
SELECT pg_temp.jako('00000000-0000-0000-0000-0000000000ff');
SELECT pg_temp.ocekavam(public.bible_pristup() IS NULL, 'neznámý uživatel bez profilu nemá přístup');
SELECT pg_temp.jako(NULL);
SELECT pg_temp.selze('SELECT public.bible_pristup()', 'anon nesmí funkci ani zavolat');

-- 2) Přispěvatel nahraje dokument ------------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c');
SELECT pg_temp.ocekavam(pg_temp.radku($q$
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('knihovna', '11111111-1111-1111-1111-111111111111/kunze.pdf', '00000000-0000-0000-0000-00000000000c')
$q$) = 1, 'přispěvatel nahraje soubor do bucketu');
SELECT pg_temp.ocekavam(pg_temp.radku($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_mime, soubor_sha256, prava_potvrzena_at, oblasti)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Kunze', '11111111-1111-1111-1111-111111111111/kunze.pdf', 'kunze.pdf', 1234,
          'application/pdf', repeat('a', 64), now(), '{A,D}')
$q$) = 1, 'přispěvatel založí dokument');
SELECT pg_temp.ocekavam((SELECT nahral = auth.uid() AND prava_potvrdil = auth.uid() AND stav = 'ceka' FROM public.bible_dokumenty),
  'kdo nahrál, kdo potvrdil práva a stav „čeká" doplní databáze');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, stav)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'X', 'a0000000-0000-0000-0000-000000000001/1.pdf', '1.pdf', 1, repeat('b', 64), now(), 'hotovo')
$q$, 'nejde založit dokument rovnou jako zpracovaný');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, nahral)
  VALUES ('a0000000-0000-0000-0000-000000000002', 'X', 'a0000000-0000-0000-0000-000000000002/2.pdf', '2.pdf', 1, repeat('c', 64), now(), '00000000-0000-0000-0000-00000000000a')
$q$, 'nejde podstrčit jiného autora');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256)
  VALUES ('a0000000-0000-0000-0000-000000000003', 'X', 'a0000000-0000-0000-0000-000000000003/3.pdf', '3.pdf', 1, repeat('d', 64))
$q$, 'bez potvrzení práv k dokumentu to nejde');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, oblasti)
  VALUES ('a0000000-0000-0000-0000-000000000004', 'X', 'a0000000-0000-0000-0000-000000000004/4.pdf', '4.pdf', 1, repeat('e', 64), now(), '{Z}')
$q$, 'jen oblasti A–T');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at)
  VALUES ('a0000000-0000-0000-0000-000000000005', 'Kunze znovu', 'a0000000-0000-0000-0000-000000000005/5.pdf', '5.pdf', 1, repeat('a', 64), now())
$q$, 'stejný soubor (SHA-256) podruhé ne');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at)
  VALUES ('a0000000-0000-0000-0000-000000000007', 'X', '../../../../auth/v1/admin/users', 'x.pdf', 1, repeat('7', 64), now())
$q$, 'cesta k souboru musí být „<id dokumentu>/<jméno>" (worker nesmí stáhnout cizí cestu)');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at)
  VALUES ('a0000000-0000-0000-0000-000000000008', 'X', '11111111-1111-1111-1111-111111111111/kunze.pdf', 'x.pdf', 1, repeat('8', 64), now())
$q$, 'cesta k souboru jiného dokumentu nejde');
SELECT pg_temp.ocekavam(pg_temp.radku($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at,
                                      pokusy, created_at, postup, stran_celkem, zpracovano_at, zamek_do)
  VALUES ('44444444-4444-4444-4444-444444444444', 'Podvrh', '44444444-4444-4444-4444-444444444444/p.pdf', 'p.pdf', 1, repeat('4', 64), now(),
          2147483647, '1900-01-01', '{"stran": 500}', 500, now(), now() + interval '1 day')
$q$) = 1, 'přispěvatel vloží dokument i s podvrženými údaji zpracování…');
SELECT pg_temp.ocekavam((SELECT pokusy = 0 AND created_at > now() - interval '1 hour' AND postup = '{}'::jsonb AND stran_celkem IS NULL
                                AND zpracovano_at IS NULL AND zamek_do IS NULL
                           FROM public.bible_dokumenty WHERE id = '44444444-4444-4444-4444-444444444444'),
  '…ale databáze je při vložení přepíše (fronta nejde zablokovat)');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.ocekavam(pg_temp.radku($q$DELETE FROM public.bible_dokumenty WHERE id = '44444444-4444-4444-4444-444444444444'$q$) = 1, 'úklid');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET autor = 'Wolfgang Kunze'$q$) = 1, 'přispěvatel upraví popis svého dokumentu');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET postup = '{"stran": 1}'$q$, 'počty zapisuje jen zpracování');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET stav = 'hotovo'$q$, 'stav „hotovo" zapisuje jen zpracování');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET pokusy = 9$q$, 'pokusy zapisuje jen zpracování');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET zamek_do = now()$q$, 'zámek fronty zapisuje jen zpracování');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET soubor_sha256 = repeat('f', 64)$q$, 'otisk souboru se nemění');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET stav = 'pozastaveno'$q$) = 1, 'pozastavit smí');
SELECT pg_temp.ocekavam(pg_temp.radku('DELETE FROM public.bible_dokumenty') = 0, 'přispěvatel dokument nesmaže');
SELECT pg_temp.selze('SELECT * FROM public.bible_vezmi_dokument(60, NULL)', 'uživatel nesmí brát z fronty workeru');
SELECT pg_temp.selze('SELECT public.bible_kapacita()', 'kapacita jen pro správce');

-- 3) Čtenář vidí, nic nezapíše ---------------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_dokumenty) = 1, 'čtenář vidí dokument');
SELECT pg_temp.ocekavam((SELECT count(*) FROM storage.objects WHERE bucket_id = 'knihovna') = 1, 'čtenář vidí soubor');
SELECT pg_temp.selze($q$INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('knihovna', 'cte/x.pdf', '00000000-0000-0000-0000-00000000000b')$q$,
  'čtenář nenahraje soubor');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at)
  VALUES ('a0000000-0000-0000-0000-000000000006', 'X', 'a0000000-0000-0000-0000-000000000006/x.pdf', 'x.pdf', 1, repeat('1', 64), now())
$q$, 'čtenář nezaloží dokument');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET nazev = 'přepsáno'$q$) = 0, 'čtenář nepřepíše název');
SELECT pg_temp.ocekavam(pg_temp.radku($q$DELETE FROM storage.objects WHERE bucket_id = 'knihovna'$q$) = 0, 'čtenář nesmaže soubor');

-- 4) Bez práva a anon nevidí nic ---------------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000d');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_dokumenty) = 0, 'bez modulu bible nevidí dokumenty');
SELECT pg_temp.ocekavam((SELECT count(*) FROM storage.objects WHERE bucket_id = 'knihovna') = 0, 'bez modulu bible nevidí soubory');
SELECT pg_temp.jako(NULL);
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_dokumenty) = 0, 'anon nevidí dokumenty');
SELECT pg_temp.selze($q$SELECT public.bible_bez_diakritiky('x')$q$, 'anon nezavolá ani funkci bez diakritiky');
SELECT pg_temp.selze($q$SELECT public.bible_utraceno_od(now())$q$, 'anon nezjistí útratu');

-- 5) Fronta a zápis workeru (service role) ------------------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET stav = 'ceka'$q$) = 1, 'správce zařadí ke zpracování');
SELECT pg_temp.ocekavam((public.bible_kapacita() -> 'knihovna' ->> 'dokumentu')::int = 1, 'správce vidí kapacitu');
SELECT pg_temp.jako('service');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL, ARRAY['11111111-1111-1111-1111-111111111111']::uuid[])) = 0,
  'dokument zkoušený v tomtéž běhu se znovu nevydá (p_vynechat)');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 1, 'worker vezme čekající dokument');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'zamčený dokument nevydá podruhé');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000c');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET stav = 'ceka'$q$, 'dokument, který se právě zpracovává, nejde znovu zařadit');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET stav = 'pozastaveno'$q$) = 1,
  'pozastavit jde i během zpracování (worker to pozná a přestane)');
SELECT pg_temp.jako('service');
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() - interval '1 minute' WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ocekavam((SELECT pokusy FROM public.bible_vezmi_dokument(60, NULL)) = 2, 'po vypršení zámku znovu, pokus 2');
SELECT pg_temp.selze($q$UPDATE public.bible_dokumenty SET pokusy = -1 WHERE id = '11111111-1111-1111-1111-111111111111'$q$,
  'záporný počet pokusů nejde (obešel by limit tří pokusů)');
-- Pořadí: dokument, který už selhal, jde až za novějším čerstvým.
INSERT INTO public.bible_dokumenty (id, nazev, soubor_cesta, soubor_nazev, soubor_velikost, soubor_sha256, prava_potvrzena_at, created_at)
  VALUES ('55555555-5555-5555-5555-555555555555', 'Nový', '55555555-5555-5555-5555-555555555555/n.pdf', 'n.pdf', 1, repeat('5', 64), now(), now() + interval '1 day');
UPDATE public.bible_dokumenty SET stav = 'ceka', zamek_do = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ocekavam((SELECT id FROM public.bible_vezmi_dokument(60, NULL)) = '55555555-5555-5555-5555-555555555555',
  'čerstvý dokument má přednost před tím, který už selhal');
DELETE FROM public.bible_dokumenty WHERE id = '55555555-5555-5555-5555-555555555555';
-- Zaseknutý dokument (spadl proces) po třech pokusech = chyba, ne věčný návrat do fronty.
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() - interval '1 minute', pokusy = 3
  WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_vezmi_dokument(60, NULL)) = 0, 'zaseknutý dokument po 3 pokusech se nevydá…');
SELECT pg_temp.ocekavam((SELECT stav = 'chyba' AND stav_zprava LIKE '%opakovaně%' FROM public.bible_dokumenty
                          WHERE id = '11111111-1111-1111-1111-111111111111'), '…a dostane stav „chyba" se zprávou');
UPDATE public.bible_dokumenty SET stav = 'zpracovava', zamek_do = now() + interval '1 hour', pokusy = 2, stav_zprava = NULL
  WHERE id = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.bible_kapitoly (id, dokument_id, poradi, uroven, cislo, nazev, strana_od, strana_do) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, 1, '3.2', 'Maischen', 1, 2);
INSERT INTO public.bible_strany (dokument_id, pdf_index, tistena_strana, tistena_zdroj, zdroj_textu, text, znaku, kapitola_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 1, '158', 'zahlavi', 'vrstva', 'Die β-Amylase arbeitet bei 62–65 °C.', 36, '33333333-3333-3333-3333-333333333333'),
  ('11111111-1111-1111-1111-111111111111', 2, '159', 'dopocet', 'ocr', 'Rmutování: β-amyláza nejlépe při 62–65 °C.', 42, '33333333-3333-3333-3333-333333333333');
INSERT INTO public.bible_pasaze (dokument_id, kapitola_id, poradi, strana_od, strana_do, text, jazyk) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, 1, 1, 'Die β-Amylase arbeitet bei 62–65 °C am besten. Würze entsteht beim Maischen.', 'de'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 2, 2, 2, 'Rmutování: β-amyláza pracuje nejlépe při 62–65 °C.', 'cs');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_pasaze (dokument_id, poradi, strana_od, strana_do, text)
  VALUES ('11111111-1111-1111-1111-111111111111', 3, 3, 2, 'obrácený rozsah')
$q$, 'pasáž nesmí mít konec před začátkem');
INSERT INTO public.ai_naklady (ucel, model, vstup_tokenu, vystup_tokenu, cena_usd, dokument_id)
  VALUES ('ocr', 'claude-haiku-5-5', 2600, 900, 0.00071, '11111111-1111-1111-1111-111111111111');
UPDATE public.bible_dokumenty SET stav = 'hotovo', zamek_do = NULL, postup = '{"stran": 2, "kapitol": 1, "pasazi": 2}'
  WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ocekavam((SELECT stav FROM public.bible_dokumenty) = 'hotovo', 'worker zapíše stav zpracování');
SELECT pg_temp.ocekavam(public.bible_utraceno_od(now() - interval '1 day') = 0.00071, 'worker sečte útratu v databázi');
-- „Zpracovat znovu" vynuluje pokusy (jinak by dokument po dřívějších chybách měl jen jeden pokus).
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_dokumenty SET stav = 'ceka'$q$) = 1, 'správce dá dokument zpracovat znovu');
SELECT pg_temp.ocekavam((SELECT pokusy = 0 AND zamek_do IS NULL FROM public.bible_dokumenty), '„Zpracovat znovu" vynuluje pokusy');
SELECT pg_temp.jako('service');
UPDATE public.bible_dokumenty SET stav = 'hotovo' WHERE id = '11111111-1111-1111-1111-111111111111';

-- 6) Hledání bez diakritiky a s předponou -------------------------------------
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', public.bible_bez_diakritiky('rmutování'))) = 1,
  '„rmutování" najde českou pasáž i bez diakritiky');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')) = 1, '„wurze" najde „Würze"');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'amyl:*')) = 2,
  'předpona „amyl" najde β-amylázu i β-Amylase');

-- 7) Čtenář vidí obsah, nezapíše ho; náklady nevidí --------------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000b');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_strany) = 2 AND (SELECT count(*) FROM public.bible_pasaze) = 2
  AND (SELECT count(*) FROM public.bible_kapitoly) = 1, 'čtenář vidí strany, pasáže a kapitoly');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.ai_naklady) = 0, 'čtenář nevidí náklady');
SELECT pg_temp.ocekavam(public.bible_utraceno_od(now() - interval '1 day') = 0, 'čtenář útratu nezjistí ani součtem');
-- Kontrola přístupu v politice se vyhodnotí jednou na dotaz (InitPlan), ne pro
-- každý řádek. Index hledání ale pod RLS použít nejde (operátor @@ není
-- LEAKPROOF) — proto hledání v etapě 4 poběží jen přes SECURITY DEFINER RPC
-- s vlastní kontrolou bible_smi_cist() (docs/pivovarska-bible/ARCHITEKTURA.md §5).
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT id FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')$q$)
                        LIKE '%InitPlan%', 'kontrola přístupu se pod RLS vyhodnotí jednou na dotaz');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_nastaveni) >= 6, 'čtenář vidí nastavení (modely)');
SELECT pg_temp.selze($q$
  INSERT INTO public.bible_pasaze (dokument_id, poradi, strana_od, strana_do, text)
  VALUES ('11111111-1111-1111-1111-111111111111', 9, 1, 1, 'podvrh')
$q$, 'čtenář nezapíše pasáž');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_nastaveni SET hodnota = '"jiny-model"' WHERE klic = 'model_odpovedi'$q$) = 0,
  'čtenář nezmění model');
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000d');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_strany) = 0 AND (SELECT count(*) FROM public.bible_pasaze) = 0,
  'bez modulu bible nevidí obsah knih');

-- 8) Správce: náklady, model, smazání i s odvozenými daty ---------------------
SELECT pg_temp.jako('00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.ocekavam((SELECT sum(cena_usd) FROM public.ai_naklady) = 0.00071, 'správce vidí náklady');
SELECT pg_temp.ocekavam((SELECT count(*) = 1 AND sum(cena_usd) = 0.00071 AND sum(volani) = 1 FROM public.bible_naklady_od(now() - interval '1 day')),
  'správce vidí souhrn útraty po účelech');
SELECT pg_temp.ocekavam(pg_temp.radku($q$UPDATE public.bible_nastaveni SET hodnota = '"claude-sonnet-5-5"' WHERE klic = 'model_odpovedi'$q$) = 1,
  'správce přepne model');
SELECT pg_temp.ocekavam(pg_temp.radku('DELETE FROM public.bible_dokumenty') = 1, 'správce smaže dokument');
SELECT pg_temp.jako('service');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.bible_strany) = 0 AND (SELECT count(*) FROM public.bible_pasaze) = 0
  AND (SELECT count(*) FROM public.bible_kapitoly) = 0, 'se smazaným dokumentem zmizí i strany, pasáže a kapitoly');
SELECT pg_temp.ocekavam((SELECT count(*) FROM public.ai_naklady WHERE dokument_id = '11111111-1111-1111-1111-111111111111') = 1,
  'evidence nákladů zůstává i po smazání dokumentu');
SELECT pg_temp.ocekavam(NOT EXISTS (
  SELECT 1 FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text LIKE 'bible\_%'
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
), 'každý cizí klíč na tabulky bible má index (smazání dokumentu neprochází celé tabulky)');
SELECT pg_temp.ocekavam((SELECT NOT public FROM storage.buckets WHERE id = 'knihovna'), 'bucket knihovna je soukromý');
RESET ROLE;
SET enable_seqscan = off;
SELECT pg_temp.ocekavam(pg_temp.plan($q$SELECT id FROM public.bible_pasaze WHERE hledani @@ to_tsquery('simple', 'wurze')$q$)
                        LIKE '%bible_pasaze_hledani_idx%', 'hledání mimo RLS (budoucí SECURITY DEFINER RPC) použije index');
RESET enable_seqscan;

SELECT pg_temp.jako(NULL);
RESET ROLE;
SELECT 'VŠECHNY KONTROLY BIBLE PROŠLY' AS vysledek;
