-- 🔎 Pivovarská bible — hledání: vícejazyčné varianty slov a filtry (etapa 4b).
--
-- Zadání etapy 4: „hybridní hledání (fulltext + přesné termíny + vícejazyčné
-- varianty dotazu), filtry (oblast, autor, dokument, rok, jazyk)". Bez AI
-- (hledání je zdarma, R14): slovník odborných výrazů — „mladina" najde
-- i Würze a wort, „mash" i rmutování — a filtry podle knihy, autora, roku,
-- jazyka, druhu a oblasti A–T.
--
-- Nové funkce bible_hledej_v a bible_hledej_volne_v (appka, konektor
-- i chatbot); původní bible_hledej a bible_hledej_volne zůstávají beze
-- změny (používá je i worker přehledů). Slovník je veřejná odborná
-- terminologie, žádný text knih. Jen projekt bible; spouští majitel v appce:
-- Systém → Databázové migrace → Databáze bible. Pustit podruhé nic nezmění.

-- ---------------------------------------------------------------------------
-- 1) Kmen slova (stejná pravidla jako bible_slova_volne a slovaVolne v TS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bible_kmen(p_slovo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_slovo IS NULL OR p_slovo ~ '^[0-9]+$' OR length(p_slovo) < 4 THEN p_slovo
    ELSE coalesce((
      SELECT left(p_slovo, length(p_slovo) - length(k))
        FROM unnest(ARRAY[
          'ovani', 'ovat', 'ujeme', 'ujete', 'ovych', 'ovymi', 'ovemu', 'oveho', 'ovou', 'eni', 'ani', 'uje', 'uji',
          'ovy', 'ova', 'ove', 'ovi', 'ich', 'ych', 'ech', 'ach', 'ami', 'emi', 'imi', 'ymi', 'eho', 'emu', 'iho', 'imu',
          'ou', 'em', 'im', 'ym', 'um', 'am', 'at', 'it', 'et', 'a', 'e', 'i', 'o', 'u', 'y'
        ]) AS k
       WHERE right(p_slovo, length(k)) = k AND length(p_slovo) - length(k) >= 3
       ORDER BY length(k) DESC
       LIMIT 1), p_slovo)
  END
$$;

-- Slova otázky pro hledání v běžné řeči: původní slovo a jeho kmen, bez
-- výplňových slov, každý kmen jednou, nejvýš 8. Jediný seznam výplňových slov
-- v SQL (bible_slova_volne ho od teď bere odsud; v TS slovaVolne).
CREATE OR REPLACE FUNCTION public.bible_slova_otazky(p_dotaz text)
RETURNS TABLE (slovo text, kmen text, poradi bigint)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT x.slovo, x.kmen, x.poradi
    FROM (
      SELECT DISTINCT ON (s.kmen) s.slovo, s.kmen, s.poradi
        FROM (
          SELECT t.slovo, public.bible_kmen(t.slovo) AS kmen, t.poradi
            FROM regexp_split_to_table(lower(public.bible_bez_diakritiky(coalesce(p_dotaz, ''))), '[^a-z0-9]+')
                 WITH ORDINALITY AS t(slovo, poradi)
           WHERE (length(t.slovo) >= 3 OR t.slovo ~ '^[0-9]+$' OR t.slovo IN ('ph', 'o2', 'fe', 'cu', 'zn', 'ca', 'mg'))
             AND t.slovo NOT IN (
               'proc', 'jak', 'jaky', 'jaka', 'jake', 'jaci', 'kdy', 'kde', 'kam', 'kolik', 'ktery', 'ktera', 'ktere', 'kteri',
               'neco', 'nejak', 'pro', 'pri', 'pod', 'nad', 'mezi', 'jsem', 'jsme', 'jste', 'jsou', 'byl', 'byla', 'bylo', 'byly',
               'bude', 'budou', 'mam', 'mame', 'mate', 'maji', 'mit', 'mel', 'mela', 'melo', 'meli', 'muze', 'muzu', 'mohu', 'mohl',
               'muzeme', 'lze', 'neni', 'nebo', 'ale', 'ani', 'tak', 'take', 'jen', 'aby', 'bych', 'bys', 'bychom', 'byste', 'kdyz',
               'jako', 'jeho', 'jeji', 'jejich', 'tento', 'tato', 'toto', 'tyto', 'tech', 'tem', 'ten', 'tam', 'tady', 'zde',
               'jeste', 'velmi', 'moc', 'hodne', 'malo', 'trochu', 'nas', 'nase', 'nasi', 'vas', 'vase', 'muj', 'moje', 'svuj',
               'sve', 'sva', 'treba', 'proto', 'protoze', 'potom', 'pak', 'nez', 'chci', 'chceme', 'potrebuji', 'potrebuju',
               'vim', 'nevim', 'delat', 'udelat', 'resit', 'poradit', 'poradte', 'prosim', 'dekuji', 'diky',
               'the', 'and', 'for', 'with', 'why', 'how', 'what', 'when', 'does', 'from', 'that', 'this', 'are', 'was', 'not',
               'der', 'die', 'das', 'und', 'mit', 'fur', 'wie', 'warum', 'ist', 'sind', 'ein', 'eine', 'bei', 'von'
             )
        ) s
       ORDER BY s.kmen, s.poradi
    ) x
   ORDER BY x.poradi
   LIMIT 8
$$;

-- Stejný výsledek jako dosud (kmeny v pořadí otázky), jen z jednoho místa.
CREATE OR REPLACE FUNCTION public.bible_slova_volne(p_dotaz text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(o.kmen ORDER BY o.poradi), '{}'::text[]) FROM public.bible_slova_otazky(p_dotaz) o
$$;

-- ---------------------------------------------------------------------------
-- 2) Slovník odborných výrazů: pojem → výrazy v češtině, němčině, angličtině
-- ---------------------------------------------------------------------------
-- druh: kmen = český kmen (shoda kmene slova dotazu, hledá se jako začátek
-- slova), predpona = začátek slova (Würze → wurz), slovo = přesně tohle slovo
-- (hop by jako předpona našlo i hope). Vzory jen [a-z0-9] — do dotazu nic
-- jiného nepronikne.
CREATE TABLE IF NOT EXISTS public.bible_slovnik (
  pojem text NOT NULL CHECK (pojem ~ '^[a-z0-9_]{2,40}$'),
  vzor text NOT NULL CHECK (vzor ~ '^[a-z0-9]{2,40}$'),
  druh text NOT NULL CHECK (druh IN ('kmen', 'predpona', 'slovo')),
  PRIMARY KEY (pojem, vzor, druh)
);
ALTER TABLE public.bible_slovnik ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bible_slovnik FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_slovnik TO service_role;

INSERT INTO public.bible_slovnik (pojem, vzor, druh) VALUES
  ('slad', 'slad', 'kmen'), ('slad', 'malz', 'predpona'), ('slad', 'malt', 'predpona'),
  ('mladina', 'mladin', 'kmen'), ('mladina', 'wurz', 'predpona'), ('mladina', 'wuerz', 'predpona'),
  ('mladina', 'wort', 'slovo'), ('mladina', 'worts', 'slovo'),
  ('chmel', 'chmel', 'kmen'), ('chmel', 'hopfen', 'predpona'),
  ('chmel', 'hop', 'slovo'), ('chmel', 'hops', 'slovo'), ('chmel', 'hopping', 'slovo'), ('chmel', 'hopped', 'slovo'),
  ('chmelovar', 'chmelovar', 'kmen'), ('chmelovar', 'wurzekoch', 'predpona'), ('chmelovar', 'wuerzekoch', 'predpona'),
  ('chmelovar', 'boil', 'predpona'),
  ('rmutovani', 'rmut', 'kmen'), ('rmutovani', 'maisch', 'predpona'), ('rmutovani', 'mash', 'predpona'),
  ('scezovani', 'scez', 'kmen'), ('scezovani', 'lautern', 'slovo'), ('scezovani', 'lauterbottich', 'predpona'),
  ('scezovani', 'lauterung', 'predpona'), ('scezovani', 'lauter', 'slovo'), ('scezovani', 'lautering', 'slovo'),
  ('kvaseni', 'kvas', 'kmen'), ('kvaseni', 'garung', 'predpona'), ('kvaseni', 'vergar', 'predpona'),
  ('kvaseni', 'hauptgar', 'predpona'), ('kvaseni', 'ferment', 'predpona'),
  ('kvasnice', 'kvasnic', 'kmen'), ('kvasnice', 'kvasink', 'kmen'), ('kvasnice', 'hefe', 'predpona'), ('kvasnice', 'yeast', 'predpona'),
  ('dokvasovani', 'dokvas', 'kmen'), ('dokvasovani', 'nachgar', 'predpona'), ('dokvasovani', 'lagering', 'slovo'),
  ('pena', 'pena', 'slovo'), ('pena', 'peny', 'slovo'), ('pena', 'penu', 'slovo'), ('pena', 'penou', 'slovo'), ('pena', 'pene', 'slovo'),
  ('pena', 'peni', 'slovo'), ('pena', 'peneni', 'predpona'), ('pena', 'penivost', 'predpona'), ('pena', 'penov', 'predpona'),
  ('pena', 'schaum', 'predpona'), ('pena', 'foam', 'predpona'),
  ('zakal', 'zakal', 'kmen'), ('zakal', 'trubung', 'predpona'), ('zakal', 'haze', 'predpona'), ('zakal', 'turbid', 'predpona'),
  ('filtrace', 'filtr', 'kmen'), ('filtrace', 'filtrac', 'kmen'), ('filtrace', 'filter', 'predpona'), ('filtrace', 'filtr', 'predpona'),
  ('pasterace', 'pasterac', 'kmen'), ('pasterace', 'pasterizac', 'kmen'), ('pasterace', 'pasteur', 'predpona'),
  ('co2', 'co2', 'slovo'), ('co2', 'uhlicit', 'kmen'), ('co2', 'kohlendioxid', 'predpona'), ('co2', 'kohlensaur', 'predpona'),
  ('co2', 'carbonat', 'predpona'),
  ('horkost', 'horkost', 'kmen'), ('horkost', 'bitter', 'predpona'),
  ('barva', 'barv', 'kmen'), ('barva', 'farbe', 'predpona'), ('barva', 'colour', 'predpona'), ('barva', 'color', 'predpona'),
  ('extrakt', 'extrakt', 'kmen'), ('extrakt', 'extrakt', 'predpona'), ('extrakt', 'extract', 'predpona'),
  ('stupnovitost', 'stupnovitost', 'kmen'), ('stupnovitost', 'stammwurz', 'predpona'),
  ('prokvaseni', 'prokvas', 'kmen'), ('prokvaseni', 'vergarungsgrad', 'predpona'), ('prokvaseni', 'attenuat', 'predpona'),
  ('vytezek', 'vytezek', 'kmen'), ('vytezek', 'vytezk', 'kmen'), ('vytezek', 'ausbeute', 'predpona'), ('vytezek', 'yield', 'predpona'),
  ('tvrdost', 'tvrdost', 'kmen'), ('tvrdost', 'harte', 'predpona'), ('tvrdost', 'hardness', 'predpona'),
  ('alkalita', 'alkalit', 'kmen'), ('alkalita', 'alkalit', 'predpona'), ('alkalita', 'alkalinit', 'predpona'),
  ('amylaza', 'amylaz', 'kmen'), ('amylaza', 'amylas', 'predpona'),
  ('enzym', 'enzym', 'kmen'), ('enzym', 'enzym', 'predpona'),
  ('bilkoviny', 'bilkovin', 'kmen'), ('bilkoviny', 'eiweiss', 'predpona'), ('bilkoviny', 'protein', 'predpona'),
  ('polyfenoly', 'polyfenol', 'kmen'), ('polyfenoly', 'polyphenol', 'predpona'),
  ('dms', 'dms', 'slovo'), ('dms', 'dimethylsulf', 'predpona'), ('dms', 'dimetylsulf', 'predpona'),
  ('kontaminace', 'kontaminac', 'kmen'), ('kontaminace', 'infekc', 'kmen'), ('kontaminace', 'kontamin', 'predpona'),
  ('kontaminace', 'contamin', 'predpona'), ('kontaminace', 'infekt', 'predpona'), ('kontaminace', 'infect', 'predpona'),
  ('sanitace', 'sanitac', 'kmen'), ('sanitace', 'sanit', 'predpona'), ('sanitace', 'reinigung', 'predpona'), ('sanitace', 'clean', 'predpona'),
  ('teplota', 'teplot', 'kmen'), ('teplota', 'temperatur', 'predpona'),
  ('tlak', 'tlak', 'kmen'), ('tlak', 'druck', 'predpona'), ('tlak', 'pressur', 'predpona'),
  ('chlazeni', 'chlaz', 'kmen'), ('chlazeni', 'kuhl', 'predpona'), ('chlazeni', 'cool', 'predpona'),
  ('kyslik', 'kyslik', 'kmen'), ('kyslik', 'sauerstoff', 'predpona'), ('kyslik', 'oxygen', 'predpona'),
  ('oxidace', 'oxidac', 'kmen'), ('oxidace', 'oxidat', 'predpona'),
  ('stabilita', 'stabilit', 'kmen'), ('stabilita', 'stabilit', 'predpona'),
  ('pivo', 'piv', 'kmen'), ('pivo', 'bier', 'predpona'), ('pivo', 'beer', 'predpona'),
  ('lezak', 'lezak', 'kmen'), ('lezak', 'lagerbier', 'predpona'), ('lezak', 'lager', 'slovo'),
  ('jecmen', 'jecmen', 'kmen'), ('jecmen', 'gerste', 'predpona'), ('jecmen', 'barley', 'predpona'),
  ('psenice', 'psenic', 'kmen'), ('psenice', 'weizen', 'predpona'), ('psenice', 'wheat', 'predpona'),
  ('skrob', 'skrob', 'kmen'), ('skrob', 'starke', 'predpona'), ('skrob', 'starch', 'predpona'),
  ('cukr', 'cukr', 'kmen'), ('cukr', 'zucker', 'predpona'), ('cukr', 'sugar', 'predpona'),
  ('maltoza', 'maltoz', 'kmen'), ('maltoza', 'maltose', 'predpona'),
  ('glukoza', 'glukoz', 'kmen'), ('glukoza', 'glucose', 'predpona'), ('glukoza', 'glukose', 'predpona'),
  ('lahev', 'lahev', 'kmen'), ('lahev', 'lahv', 'kmen'), ('lahev', 'flasche', 'predpona'), ('lahev', 'bottle', 'predpona'),
  ('dekokce', 'dekokc', 'kmen'), ('dekokce', 'dekokt', 'predpona'), ('dekokce', 'decoct', 'predpona'),
  ('infuze', 'infuz', 'kmen'), ('infuze', 'infusion', 'predpona'),
  ('odpar', 'odpar', 'kmen'), ('odpar', 'verdampf', 'predpona'), ('odpar', 'evapor', 'predpona'),
  ('vyslazovani', 'vyslaz', 'kmen'), ('vyslazovani', 'nachguss', 'predpona'), ('vyslazovani', 'sparg', 'predpona'),
  ('mlato', 'mlat', 'kmen'), ('mlato', 'treber', 'predpona'),
  ('dusik', 'dusik', 'kmen'), ('dusik', 'stickstoff', 'predpona'), ('dusik', 'nitrogen', 'predpona'),
  ('zinek', 'zinek', 'kmen'), ('zinek', 'zink', 'kmen'), ('zinek', 'zink', 'predpona'), ('zinek', 'zinc', 'slovo'),
  ('vapnik', 'vapnik', 'kmen'), ('vapnik', 'calcium', 'predpona'), ('vapnik', 'kalzium', 'predpona'),
  ('horcik', 'horcik', 'kmen'), ('horcik', 'magnesium', 'predpona'),
  ('chut', 'chut', 'kmen'), ('chut', 'geschmack', 'predpona'), ('chut', 'flavour', 'predpona'), ('chut', 'flavor', 'predpona'),
  ('chut', 'taste', 'predpona'),
  ('vune', 'vun', 'kmen'), ('vune', 'aroma', 'predpona'), ('vune', 'duft', 'predpona')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Varianty slova a dotazy
-- ---------------------------------------------------------------------------
-- Pojmy, kam slovo patří: shoda kmene (čeština), začátek slova, přesné slovo.
CREATE OR REPLACE FUNCTION public.bible_pojmy_slova(p_slovo text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT s.pojem ORDER BY s.pojem), '{}'::text[])
    FROM public.bible_slovnik s
   WHERE (s.druh = 'kmen' AND public.bible_kmen(p_slovo) = s.vzor)
      OR (s.druh = 'predpona' AND left(p_slovo, length(s.vzor)) = s.vzor)
      OR (s.druh = 'slovo' AND p_slovo = s.vzor)
$$;

-- Skupina pro tsquery: „(slovo:* | vzor:* | přesné)" — vzory jsou jen [a-z0-9].
-- p_zaklad = začátek slova od uživatele (celé slovo, nebo kmen u volného hledání).
CREATE OR REPLACE FUNCTION public.bible_varianty(p_slovo text, p_zaklad text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH vzory AS (
    SELECT p_zaklad || ':*' AS v, 0 AS poradi
    UNION
    SELECT CASE WHEN s.druh = 'slovo' THEN s.vzor ELSE s.vzor || ':*' END, 1
      FROM public.bible_slovnik s
     WHERE s.pojem = ANY (public.bible_pojmy_slova(p_slovo))
  )
  SELECT CASE WHEN count(*) = 1 THEN min(v) ELSE '(' || string_agg(v, ' | ' ORDER BY poradi, v) || ')' END
    FROM (SELECT DISTINCT ON (v) v, poradi FROM vzory ORDER BY v, poradi) x
$$;

-- Přesné hledání s variantami: každé slovo (nebo jeho varianta) na stránce.
CREATE OR REPLACE FUNCTION public.bible_dotaz_v(p_dotaz text)
RETURNS tsquery
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL
              ELSE string_agg(public.bible_varianty(slovo, slovo), ' & ' ORDER BY poradi)::tsquery END
    FROM (
      SELECT slovo, poradi
        FROM regexp_split_to_table(lower(public.bible_bez_diakritiky(coalesce(p_dotaz, ''))), '[^a-z0-9]+')
             WITH ORDINALITY AS t(slovo, poradi)
       WHERE length(slovo) >= 2 OR slovo ~ '^[0-9]$'
       ORDER BY poradi
       LIMIT 8
    ) s
$$;

-- Volné hledání: skupina variant pro každé slovo otázky (bez výplňových slov);
-- k pojmu patří podle původního slova, samo se hledá od kmene.
CREATE OR REPLACE FUNCTION public.bible_skupiny_volne(p_dotaz text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(public.bible_varianty(o.slovo, o.kmen) ORDER BY o.poradi), '{}'::text[])
    FROM public.bible_slova_otazky(p_dotaz) o
$$;

-- Slova pro úryvek a zvýraznění: začátky slov včetně variant (bez „:*").
CREATE OR REPLACE FUNCTION public.bible_slova_hledani(p_dotaz text, p_volne boolean DEFAULT false)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH skupiny AS (
    SELECT CASE WHEN coalesce(p_volne, false) THEN public.bible_skupiny_volne(p_dotaz)
                ELSE (SELECT coalesce(array_agg(public.bible_varianty(slovo, slovo) ORDER BY poradi), '{}'::text[])
                        FROM (SELECT slovo, poradi
                                FROM regexp_split_to_table(lower(public.bible_bez_diakritiky(coalesce(p_dotaz, ''))), '[^a-z0-9]+')
                                     WITH ORDINALITY AS t(slovo, poradi)
                               WHERE length(slovo) >= 2 OR slovo ~ '^[0-9]$'
                               ORDER BY poradi LIMIT 8) s) END AS s
  )
  SELECT coalesce(array_agg(DISTINCT w), '{}'::text[])
    FROM skupiny, unnest(skupiny.s) AS g,
         regexp_split_to_table(regexp_replace(g, '[()*:]', '', 'g'), '\s*\|\s*') AS w
   WHERE w <> ''
$$;

-- ---------------------------------------------------------------------------
-- 4) Filtry: kniha, autor, rok od–do, jazyk, druh, oblast A–T
-- ---------------------------------------------------------------------------
-- Zpracované knihy podle filtru (null nebo {} = všechny). Neplatná hodnota
-- filtru se nepoužije (appka i bible-api ji odmítnou dřív).
CREATE OR REPLACE FUNCTION public.bible_dokumenty_filtr(p_filtr jsonb)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH f AS (
    SELECT
      CASE WHEN p_filtr ->> 'dokument' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (p_filtr ->> 'dokument')::uuid END AS dokument,
      nullif(trim(p_filtr ->> 'autor'), '') AS autor,
      CASE WHEN p_filtr ->> 'rok_od' ~ '^[0-9]{3,4}$' THEN (p_filtr ->> 'rok_od')::integer END AS rok_od,
      CASE WHEN p_filtr ->> 'rok_do' ~ '^[0-9]{3,4}$' THEN (p_filtr ->> 'rok_do')::integer END AS rok_do,
      CASE WHEN p_filtr ->> 'jazyk' IN ('cs', 'de', 'en', 'sk', 'jiny') THEN p_filtr ->> 'jazyk' END AS jazyk,
      CASE WHEN p_filtr ->> 'druh' IN ('kniha', 'skripta', 'clanek', 'norma', 'prirucka', 'poznamky', 'tabulky', 'jiny')
           THEN p_filtr ->> 'druh' END AS druh,
      CASE WHEN p_filtr ->> 'oblast' ~ '^[A-T]$' THEN p_filtr ->> 'oblast' END AS oblast
  )
  SELECT d.id
    FROM public.bible_dokumenty d, f
   WHERE d.stav IN ('hotovo', 'ke_kontrole')
     AND (f.dokument IS NULL OR d.id = f.dokument)
     AND (f.autor IS NULL OR strpos(lower(public.bible_bez_diakritiky(coalesce(d.autor, ''))), lower(public.bible_bez_diakritiky(f.autor))) > 0)
     AND (f.rok_od IS NULL OR d.rok >= f.rok_od)
     AND (f.rok_do IS NULL OR d.rok <= f.rok_do)
     AND (f.jazyk IS NULL OR d.jazyk = f.jazyk)
     AND (f.druh IS NULL OR d.druh = f.druh)
     AND (f.oblast IS NULL OR f.oblast = ANY (d.oblasti))
$$;

-- ---------------------------------------------------------------------------
-- 5) Hledání s variantami a filtry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bible_hledej_v(p_dotaz text, p_filtr jsonb DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE (
  dokument_id uuid, nazev text, autor text, rok integer, jazyk text,
  zdroj text, pdf_index integer, tistena_strana text, kapitola text, druh text, text text, skore real
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH q AS (SELECT public.bible_dotaz_v(p_dotaz) AS q),
  n AS (SELECT LEAST(GREATEST(coalesce(p_limit, 40), 1), 100) AS n),
  citelne AS (SELECT f.id FROM public.bible_dokumenty_filtr(p_filtr) f),
  nalezy AS (
    (SELECT p.dokument_id, 'original'::text AS zdroj, p.strana_od AS pdf_index, p.kapitola_id, p.druh, p.text,
            ts_rank(p.hledani, q.q) AS skore
       FROM public.bible_pasaze p, q
      WHERE q.q IS NOT NULL AND p.hledani @@ q.q AND p.dokument_id IN (SELECT id FROM citelne)
      ORDER BY skore DESC LIMIT (SELECT n FROM n))
    UNION ALL
    (SELECT s.dokument_id, 'preklad'::text, s.pdf_index, s.kapitola_id, 'text'::text, s.preklad,
            ts_rank(s.preklad_hledani, q.q)
       FROM public.bible_strany s, q
      WHERE q.q IS NOT NULL AND s.preklad_platny AND s.preklad <> '' AND s.preklad_hledani @@ q.q
        AND s.dokument_id IN (SELECT id FROM citelne)
      ORDER BY 7 DESC LIMIT (SELECT n FROM n))
  )
  SELECT x.dokument_id, d.nazev, d.autor, d.rok, d.jazyk,
         x.zdroj, x.pdf_index, s.tistena_strana, coalesce(nullif(k.nazev_cs, ''), k.nazev), x.druh, x.text, x.skore
    FROM nalezy x
    JOIN public.bible_dokumenty d ON d.id = x.dokument_id
    LEFT JOIN public.bible_strany s ON s.dokument_id = x.dokument_id AND s.pdf_index = x.pdf_index
    LEFT JOIN public.bible_kapitoly k ON k.id = x.kapitola_id
   ORDER BY x.skore DESC, d.nazev, x.pdf_index
   LIMIT (SELECT n FROM n)
$$;

-- Hledání otázkou s variantami a filtry: nejdřív stránky aspoň se dvěma pojmy
-- otázky, pak s jedním; shoda = kolik pojmů (i přes variantu) na stránce je.
CREATE OR REPLACE FUNCTION public.bible_hledej_volne_v(p_dotaz text, p_filtr jsonb DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE (
  dokument_id uuid, nazev text, autor text, rok integer, jazyk text,
  zdroj text, pdf_index integer, tistena_strana text, kapitola text, druh text, text text,
  shoda integer, slov integer, skore real
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_skupiny text[] := public.bible_skupiny_volne(p_dotaz);
  v_vse tsquery;
  v_n integer := LEAST(GREATEST(coalesce(p_limit, 40), 1), 100);
  v_q tsquery;
  v_min integer;
BEGIN
  IF cardinality(v_skupiny) = 0 THEN
    RETURN;
  END IF;
  v_vse := array_to_string(v_skupiny, ' | ')::tsquery;
  FOREACH v_min IN ARRAY CASE WHEN cardinality(v_skupiny) > 1 THEN ARRAY[2, 1] ELSE ARRAY[1] END LOOP
    IF v_min = 2 THEN
      SELECT string_agg(a.g || ' & ' || b.g, ' | ')::tsquery INTO v_q
        FROM unnest(v_skupiny) WITH ORDINALITY AS a(g, i)
        JOIN unnest(v_skupiny) WITH ORDINALITY AS b(g, i) ON b.i > a.i;
    ELSE
      v_q := v_vse;
    END IF;
    RETURN QUERY
      WITH citelne AS (SELECT f.id FROM public.bible_dokumenty_filtr(p_filtr) f),
      nalezy AS (
        SELECT p.dokument_id AS dok, 'original'::text AS zdr, p.strana_od AS pdf, p.kapitola_id AS kap, p.druh AS dr,
               p.text AS txt, p.hledani AS h
          FROM public.bible_pasaze p
         WHERE p.hledani @@ v_q AND p.dokument_id IN (SELECT c.id FROM citelne c)
        UNION ALL
        SELECT s.dokument_id, 'preklad'::text, s.pdf_index, s.kapitola_id, 'text'::text, s.preklad, s.preklad_hledani
          FROM public.bible_strany s
         WHERE s.preklad_platny AND s.preklad <> '' AND s.preklad_hledani @@ v_q
           AND s.dokument_id IN (SELECT c.id FROM citelne c)
      ),
      hodnocene AS (
        SELECT x.dok, x.zdr, x.pdf, x.kap, x.dr, x.txt,
               (SELECT count(*)::integer FROM unnest(v_skupiny) AS w(g) WHERE x.h @@ w.g::tsquery) AS sh,
               ts_rank(x.h, v_vse) AS sk
          FROM nalezy x
      )
      SELECT y.dok, d.nazev, d.autor, d.rok, d.jazyk, y.zdr, y.pdf, st.tistena_strana,
             coalesce(nullif(k.nazev_cs, ''), k.nazev), y.dr, y.txt, y.sh, cardinality(v_skupiny), y.sk
        FROM hodnocene y
        JOIN public.bible_dokumenty d ON d.id = y.dok
        LEFT JOIN public.bible_strany st ON st.dokument_id = y.dok AND st.pdf_index = y.pdf
        LEFT JOIN public.bible_kapitoly k ON k.id = y.kap
       ORDER BY y.sh DESC, y.sk DESC, d.nazev, y.pdf
       LIMIT v_n;
    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  public.bible_kmen(text),
  public.bible_slova_otazky(text),
  public.bible_pojmy_slova(text),
  public.bible_varianty(text, text),
  public.bible_dotaz_v(text),
  public.bible_skupiny_volne(text),
  public.bible_slova_hledani(text, boolean),
  public.bible_dokumenty_filtr(jsonb),
  public.bible_hledej_v(text, jsonb, integer),
  public.bible_hledej_volne_v(text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_kmen(text),
  public.bible_slova_otazky(text),
  public.bible_pojmy_slova(text),
  public.bible_varianty(text, text),
  public.bible_dotaz_v(text),
  public.bible_skupiny_volne(text),
  public.bible_slova_hledani(text, boolean),
  public.bible_dokumenty_filtr(jsonb),
  public.bible_hledej_v(text, jsonb, integer),
  public.bible_hledej_volne_v(text, jsonb, integer)
  TO service_role;
