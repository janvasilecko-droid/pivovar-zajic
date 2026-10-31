-- 📚 Pivovarská bible — základ SAMOSTATNÉHO projektu Supabase.
--
-- Rozhodnutí majitele 31. 10. 2026 (R12 v docs/pivovarska-bible/ROZHODNUTI.md):
-- „ať je supabase pro aplikaci samostatně a samostatná supabase pro toho
-- bota". Knihy, jejich zpracování, náklady na AI a nastavení bible žijí
-- v projektu cegrelgvkygcatupqwrx (vlastní Free organizace = vlastní 1 GB
-- úložiště i 500 MB databáze). Appka pivovaru zůstává v hlavním projektu.
--
-- Tahle migrace patří JEN do projektu bible. Spouští ji majitel v appce:
-- Systém → Databázové migrace → Databáze bible (edge funkce bible-migrace
-- ji pustí v jedné transakci a zapíše do evidence). Hlavní projekt ji nikdy
-- nenabídne — leží mimo supabase/migrations.
--
-- DATABÁZE JE PRO PROHLÍŽEČ ZAVŘENÁ. Uživatelé appky jsou přihlášení
-- v hlavním projektu, tady nemají účet. anon ani authenticated tu nesmí
-- nic: žádná práva na tabulky ani funkce, žádné politiky RLS, soukromý
-- bucket bez uživatelských politik. Jediné vstupy:
--   * edge funkce bible-api — ověří přihlášení v hlavní appce a práva přes
--     public.bible_overeni() hlavního projektu (fail-closed), pak pracuje
--     service rolí a zapisuje JEN přes funkce níže, které práva hlídají znovu;
--   * worker zpracování knih (GitHub Actions) — service role.
--
-- Převzato z migrací hlavního projektu 20261231410000 a 20261231420000
-- (tam zůstávají, prázdné), se změnami:
--   * bez public.profiles a bez cizích klíčů na auth.users (uživatelé jsou
--     v hlavním projektu; nahral/prava_potvrdil jsou jen uuid);
--   * nový stav „nahrava": řádek vzniká PŘED nahráním souboru (nahrání jde
--     podepsaným odkazem rovnou z prohlížeče do úložiště) a do fronty jde
--     až po potvrzení, že soubor dorazil celý — nikdy soubor bez záznamu;
--   * hlídání údajů zpracování se řídí nastavením bible.uzivatel (zápis za
--     uživatele), ne auth.uid() — pod service rolí žádné uid není.
--
-- SQL je veřejné (repo i migrace-bible-sql.json) — nesmí sem žádný obsah knih.

-- ---------------------------------------------------------------------------
-- 0) Evidence migrací (stejný tvar jako v hlavním projektu)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.migrace_aplikovane (
  nazev text PRIMARY KEY,
  aplikovano_at timestamptz NOT NULL DEFAULT now(),
  zdroj text,
  poznamka text
);
CREATE INDEX IF NOT EXISTS migrace_aplikovane_cas_idx ON public.migrace_aplikovane (aplikovano_at DESC);
ALTER TABLE public.migrace_aplikovane ENABLE ROW LEVEL SECURITY;

-- Nové tabulky a funkce už nedostanou práva pro anon a authenticated ani
-- v dalších migracích (Supabase je jinak rozdává automaticky).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Hledání bez diakritiky
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Generovaný sloupec a index potřebují IMMUTABLE funkci, unaccent() je jen
-- STABLE. SECURITY DEFINER, ať nezáleží na právech ke schématu extensions.
CREATE OR REPLACE FUNCTION public.bible_bez_diakritiky(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, t) $$;

-- Úroveň přístupu (z hlavního projektu): cte < prispiva < spravuje.
CREATE OR REPLACE FUNCTION public.bible_uroven(p_pristup text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT CASE p_pristup WHEN 'cte' THEN 1 WHEN 'prispiva' THEN 2 WHEN 'spravuje' THEN 3 ELSE 0 END $$;

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
  -- Tematické oblasti A–T ze zadání (src/lib/bibleOblasti.ts).
  oblasti text[] NOT NULL DEFAULT '{}' CHECK (oblasti <@ ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']::text[]),
  zdroj text,
  -- Soubor v bucketu „knihovna" — cesta je vždy „<id dokumentu>/<bezpečné
  -- jméno>", takže worker se service rolí nestáhne nic jiného.
  soubor_cesta text NOT NULL,
  soubor_nazev text NOT NULL,
  soubor_velikost bigint NOT NULL CHECK (soubor_velikost >= 0),
  soubor_mime text,
  soubor_sha256 text NOT NULL CHECK (soubor_sha256 ~ '^[0-9a-f]{64}$'),
  -- nahrava = řádek je založený, soubor ještě nedorazil (worker ho nebere)
  stav text NOT NULL DEFAULT 'ceka'
    CHECK (stav IN ('nahrava', 'ceka', 'zpracovava', 'hotovo', 'ke_kontrole', 'chyba', 'pozastaveno')),
  stav_zprava text,
  -- Počty po zpracování: stran, digitalnich, ocr, ke_kontrole, kapitol, tabulek, vzorcu, pasazi.
  postup jsonb NOT NULL DEFAULT '{}'::jsonb,
  stran_celkem integer CHECK (stran_celkem IS NULL OR stran_celkem >= 0),
  kvalita_ocr numeric CHECK (kvalita_ocr IS NULL OR kvalita_ocr BETWEEN 0 AND 1),
  verze_zpracovani text,
  zpracovano_at timestamptz,
  -- Fronta workeru.
  zamek_do timestamptz,
  pokusy integer NOT NULL DEFAULT 0 CHECK (pokusy >= 0),
  -- Autorská práva: kdo (uuid uživatele v hlavním projektu) a kdy potvrdil,
  -- že dokument smíme interně používat.
  licence text,
  prava_potvrdil uuid,
  prava_potvrzena_at timestamptz NOT NULL,
  -- Jiné vydání / pravděpodobná duplicita (jen označení, nic se nemaže).
  duplikat_z uuid REFERENCES public.bible_dokumenty(id) ON DELETE SET NULL,
  poznamka text,
  nahral uuid,
  nahral_jmeno text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bible_dokumenty_cesta_check
    CHECK (soubor_cesta ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,200}$') AND split_part(soubor_cesta, '/', 2) NOT IN ('.', '..'))
);

-- Stejný soubor (SHA-256) se do knihovny nenahraje dvakrát.
CREATE UNIQUE INDEX IF NOT EXISTS bible_dokumenty_sha256_uniq ON public.bible_dokumenty (soubor_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS bible_dokumenty_cesta_uniq ON public.bible_dokumenty (soubor_cesta);
CREATE INDEX IF NOT EXISTS bible_dokumenty_stav_idx ON public.bible_dokumenty (stav, created_at);
CREATE INDEX IF NOT EXISTS bible_dokumenty_duplikat_idx ON public.bible_dokumenty (duplikat_z) WHERE duplikat_z IS NOT NULL;

-- Zápis za uživatele (funkce v oddílu 8 nastaví bible.uzivatel) nesmí sáhnout
-- na údaje zpracování ani při vložení; stav smí jen „čeká" nebo „pozastaveno".
-- Worker (service role), migrace a potvrzení nahrání nastavení nemají.
CREATE OR REPLACE FUNCTION public.bible_dokumenty_hlidej()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF nullif(current_setting('bible.uzivatel', true), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.stav := 'nahrava';
    NEW.stav_zprava := NULL;
    NEW.postup := '{}'::jsonb;
    NEW.stran_celkem := NULL;
    NEW.kvalita_ocr := NULL;
    NEW.verze_zpracovani := NULL;
    NEW.zpracovano_at := NULL;
    NEW.zamek_do := NULL;
    NEW.pokusy := 0;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.soubor_cesta IS DISTINCT FROM OLD.soubor_cesta
     OR NEW.soubor_nazev IS DISTINCT FROM OLD.soubor_nazev
     OR NEW.soubor_velikost IS DISTINCT FROM OLD.soubor_velikost
     OR NEW.soubor_mime IS DISTINCT FROM OLD.soubor_mime
     OR NEW.soubor_sha256 IS DISTINCT FROM OLD.soubor_sha256
     OR NEW.postup IS DISTINCT FROM OLD.postup
     OR NEW.stran_celkem IS DISTINCT FROM OLD.stran_celkem
     OR NEW.kvalita_ocr IS DISTINCT FROM OLD.kvalita_ocr
     OR NEW.verze_zpracovani IS DISTINCT FROM OLD.verze_zpracovani
     OR NEW.zpracovano_at IS DISTINCT FROM OLD.zpracovano_at
     OR NEW.zamek_do IS DISTINCT FROM OLD.zamek_do
     OR NEW.pokusy IS DISTINCT FROM OLD.pokusy
     OR NEW.nahral IS DISTINCT FROM OLD.nahral
     OR NEW.nahral_jmeno IS DISTINCT FROM OLD.nahral_jmeno
     OR NEW.prava_potvrdil IS DISTINCT FROM OLD.prava_potvrdil
     OR NEW.prava_potvrzena_at IS DISTINCT FROM OLD.prava_potvrzena_at
     OR NEW.duplikat_z IS DISTINCT FROM OLD.duplikat_z
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tyto údaje dokumentu zapisuje jen zpracování knihovny.' USING ERRCODE = '42501';
  END IF;
  IF NEW.stav IS DISTINCT FROM OLD.stav THEN
    IF OLD.stav = 'nahrava' THEN
      RAISE EXCEPTION 'Soubor se ještě nahrává — stav půjde změnit, až nahrání skončí.' USING ERRCODE = '42501';
    END IF;
    IF NEW.stav NOT IN ('ceka', 'pozastaveno') THEN
      RAISE EXCEPTION 'Stav zpracování mění jen zpracování knihovny (ručně jde jen „znovu zpracovat" nebo „pozastavit").' USING ERRCODE = '42501';
    END IF;
    IF NEW.stav = 'ceka' THEN
      IF OLD.stav = 'zpracovava' AND OLD.zamek_do IS NOT NULL AND OLD.zamek_do > now() THEN
        RAISE EXCEPTION 'Dokument se právě zpracovává — znovu ho jde zařadit, až zpracování skončí.' USING ERRCODE = '42501';
      END IF;
      NEW.pokusy := 0;
      NEW.zamek_do := NULL;
      NEW.stav_zprava := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bible_dokumenty_hlidej ON public.bible_dokumenty;
CREATE TRIGGER bible_dokumenty_hlidej
  BEFORE INSERT OR UPDATE ON public.bible_dokumenty
  FOR EACH ROW EXECUTE FUNCTION public.bible_dokumenty_hlidej();

ALTER TABLE public.bible_dokumenty ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Fronta workeru
-- ---------------------------------------------------------------------------
-- Další dokument: čekající, nebo zaseknutý (zámek vypršel — běh spadl nebo
-- ho GitHub zrušil). Nic se nemaže, jen se znovu zamkne. p_vynechat =
-- dokumenty zkoušené v tomhle běhu. Zaseknutý dokument po třech pokusech
-- = „chyba". Dokumenty, které už selhaly, jdou až za ostatními. Stav
-- „nahrava" se nebere nikdy (soubor ještě nedorazil).
CREATE OR REPLACE FUNCTION public.bible_vezmi_dokument(
  p_minut integer DEFAULT 120,
  p_id uuid DEFAULT NULL,
  p_vynechat uuid[] DEFAULT '{}'
)
RETURNS SETOF public.bible_dokumenty
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.bible_dokumenty
     SET stav = 'chyba',
         zamek_do = NULL,
         stav_zprava = 'Zpracování opakovaně nedoběhlo (běh spadl nebo vypršel jeho čas) — zkontroluj soubor a zkus „Zpracovat znovu".'
   WHERE stav = 'zpracovava' AND zamek_do IS NOT NULL AND zamek_do < now() AND pokusy >= 3;

  SELECT id INTO v_id FROM public.bible_dokumenty
   WHERE (p_id IS NULL OR id = p_id)
     AND NOT (id = ANY (coalesce(p_vynechat, '{}'::uuid[])))
     AND (stav = 'ceka' OR (stav = 'zpracovava' AND (zamek_do IS NULL OR zamek_do < now())))
   ORDER BY pokusy, created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    UPDATE public.bible_dokumenty
       SET stav = 'zpracovava',
           zamek_do = now() + make_interval(mins => greatest(p_minut, 5)),
           pokusy = pokusy + 1,
           stav_zprava = NULL
     WHERE id = v_id
    RETURNING *;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Kapitoly, strany, pasáže (odvozená data — nezálohují se)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_kapitoly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_id uuid NOT NULL REFERENCES public.bible_dokumenty(id) ON DELETE CASCADE,
  rodic_id uuid REFERENCES public.bible_kapitoly(id) ON DELETE CASCADE,
  poradi integer NOT NULL,
  uroven integer NOT NULL DEFAULT 1 CHECK (uroven BETWEEN 1 AND 9),
  cislo text,
  nazev text NOT NULL,
  -- Rozsah listů souboru (pdf_index), ne tištěných stran.
  strana_od integer,
  strana_do integer,
  -- osnova = záložky PDF/EPUB, nadpis = rozpoznaný nadpis v textu
  zdroj text NOT NULL DEFAULT 'osnova' CHECK (zdroj IN ('osnova', 'nadpis'))
);
CREATE INDEX IF NOT EXISTS bible_kapitoly_dokument_idx ON public.bible_kapitoly (dokument_id, poradi);
CREATE INDEX IF NOT EXISTS bible_kapitoly_rodic_idx ON public.bible_kapitoly (rodic_id) WHERE rodic_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bible_strany (
  dokument_id uuid NOT NULL REFERENCES public.bible_dokumenty(id) ON DELETE CASCADE,
  -- Pořadí listu v souboru (1 = první). U DOCX, EPUB a TXT pořadí části.
  pdf_index integer NOT NULL CHECK (pdf_index >= 1),
  -- Číslo strany vytištěné v knize; null = nejisté (citace pak řekne „list č.").
  tistena_strana text,
  tistena_zdroj text CHECK (tistena_zdroj IS NULL OR tistena_zdroj IN ('stitek_pdf', 'zahlavi', 'dopocet', 'ocr')),
  -- vrstva = textová vrstva PDF, ocr = přepis skenu (Claude), soubor = DOCX/EPUB/TXT/tabulka
  zdroj_textu text NOT NULL CHECK (zdroj_textu IN ('vrstva', 'ocr', 'soubor')),
  ocr_model text,
  -- Verze promptu přepisu: přepis se stejným modelem i verzí se použije znovu.
  ocr_verze text,
  text text NOT NULL DEFAULT '',
  -- Živé záhlaví a zápatí strany (z nich je tištěné číslo strany).
  okraje text,
  znaku integer NOT NULL DEFAULT 0,
  ke_kontrole boolean NOT NULL DEFAULT false,
  kontrola_duvod text,
  kapitola_id uuid REFERENCES public.bible_kapitoly(id) ON DELETE SET NULL,
  verze_zpracovani text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dokument_id, pdf_index)
);
CREATE INDEX IF NOT EXISTS bible_strany_kontrola_idx ON public.bible_strany (dokument_id) WHERE ke_kontrole;
CREATE INDEX IF NOT EXISTS bible_strany_kapitola_idx ON public.bible_strany (kapitola_id) WHERE kapitola_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bible_pasaze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_id uuid NOT NULL REFERENCES public.bible_dokumenty(id) ON DELETE CASCADE,
  kapitola_id uuid REFERENCES public.bible_kapitoly(id) ON DELETE SET NULL,
  poradi integer NOT NULL,
  strana_od integer NOT NULL,
  strana_do integer NOT NULL,
  druh text NOT NULL DEFAULT 'text' CHECK (druh IN ('text', 'tabulka', 'vzorec', 'popisek')),
  text text NOT NULL,
  -- Krátký kontext od AI pro lepší hledání (NENÍ text knihy, v citaci se neukazuje).
  kontext text,
  jazyk text,
  hledani tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, public.bible_bez_diakritiky(coalesce(text, '') || ' ' || coalesce(kontext, '')))
  ) STORED,
  verze_zpracovani text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (strana_do >= strana_od)
);
CREATE INDEX IF NOT EXISTS bible_pasaze_hledani_idx ON public.bible_pasaze USING gin (hledani);
CREATE INDEX IF NOT EXISTS bible_pasaze_dokument_idx ON public.bible_pasaze (dokument_id, poradi);
CREATE INDEX IF NOT EXISTS bible_pasaze_kapitola_idx ON public.bible_pasaze (kapitola_id) WHERE kapitola_id IS NOT NULL;

ALTER TABLE public.bible_kapitoly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_strany ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_pasaze ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5) Náklady na AI
-- ---------------------------------------------------------------------------
-- id je uuid (obnova ze zálohy zapisuje i id). dokument_id bez cizího klíče:
-- útrata musí přežít i smazání dokumentu (jinak by zmizela i ze stropu).
CREATE TABLE IF NOT EXISTS public.ai_naklady (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cas timestamptz NOT NULL DEFAULT now(),
  -- ocr, kontext, chat, preklad, test
  ucel text NOT NULL,
  poskytovatel text NOT NULL DEFAULT 'anthropic',
  model text NOT NULL,
  volani integer NOT NULL DEFAULT 1,
  vstup_tokenu bigint NOT NULL DEFAULT 0,
  vystup_tokenu bigint NOT NULL DEFAULT 0,
  cache_cteni_tokenu bigint NOT NULL DEFAULT 0,
  cache_zapis_tokenu bigint NOT NULL DEFAULT 0,
  cena_usd numeric(12, 6) NOT NULL DEFAULT 0,
  dokument_id uuid,
  uzivatel uuid,
  poznamka text
);
CREATE INDEX IF NOT EXISTS ai_naklady_cas_idx ON public.ai_naklady (cas);
ALTER TABLE public.ai_naklady ENABLE ROW LEVEL SECURITY;

-- Součty počítá databáze (REST by vrátil nejvýš 1000 řádků a zbytek zahodil).
CREATE OR REPLACE FUNCTION public.bible_utraceno_od(p_od timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT coalesce(sum(cena_usd), 0) FROM public.ai_naklady WHERE cas >= p_od $$;

CREATE OR REPLACE FUNCTION public.bible_naklady_od(p_od timestamptz)
RETURNS TABLE (ucel text, cena_usd numeric, volani bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT n.ucel, sum(n.cena_usd), sum(n.volani)::bigint
    FROM public.ai_naklady n
   WHERE n.cas >= p_od
   GROUP BY n.ucel
$$;

-- ---------------------------------------------------------------------------
-- 6) Nastavení bible (modely, ceník, stropy) — výměna modelu bez nasazení
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_nastaveni (
  klic text PRIMARY KEY,
  hodnota jsonb NOT NULL,
  popis text,
  upraveno timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bible_nastaveni ENABLE ROW LEVEL SECURITY;

-- Výchozí hodnoty; už nastavené se nepřepisují. Ceník USD za 1 milion tokenů
-- podle Anthropic k 30. 10. 2026.
INSERT INTO public.bible_nastaveni (klic, hodnota, popis) VALUES
  ('model_odpovedi', '"claude-opus-5-5"', 'Model, který odpovídá v chatu (Opus 5.5; levnější claude-sonnet-5-5).'),
  ('model_pomocny', '"claude-haiku-5-5"', 'Levný model pro pomocné kroky (překlad dotazu, kontext pasáží).'),
  ('model_ocr', '"claude-haiku-5-5"', 'Model, který přepisuje naskenované strany.'),
  ('cenik_usd_za_mtok', '{
     "claude-opus-5-5":   {"vstup": 4,    "vystup": 20,  "cache_cteni": 0.20, "cache_zapis": 5},
     "claude-sonnet-5-5": {"vstup": 2,    "vystup": 10,  "cache_cteni": 0.20, "cache_zapis": 2.5},
     "claude-haiku-5-5":  {"vstup": 0.10, "vystup": 0.50, "cache_cteni": 0.01, "cache_zapis": 0.125}
   }', 'Ceník pro evidenci nákladů (USD za 1 M tokenů).'),
  ('strop_mesic_usd', '20', 'Měsíční strop útraty za AI; nad ním se další volání odmítnou (0 = AI nepoužívat).'),
  ('strop_zpracovani_usd', '5', 'Strop útraty jednoho běhu zpracování knih (0 = skeny nepřepisovat).'),
  ('limit_db_mb', '450', 'Pojistka: nad touto velikostí databáze bible (MB) se další knihy nezapíšou. Supabase Free má 500 MB a nad nimi přepne databázi bible jen pro čtení; 0 = bez pojistky.')
ON CONFLICT (klic) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Soukromý bucket „knihovna" (50 MB na soubor = strop tarifu Free)
-- ---------------------------------------------------------------------------
-- Žádné politiky pro uživatele: nahrává se podepsaným odkazem (vydá ho
-- bible-api po kontrole práv), stahuje se krátkým podepsaným odkazem.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'knihovna', 'knihovna', false, 52428800, ARRAY[
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

-- ---------------------------------------------------------------------------
-- 8) Zápis za uživatele (volá jen bible-api přes service roli)
-- ---------------------------------------------------------------------------
-- p_uzivatel a p_pristup zjistila bible-api v hlavním projektu
-- (bible_overeni: přihlášení, schválený e-mail, heslo, bible_pristup).
-- Funkce práva hlídají znovu a zapisují jen popis a povolené stavy.
-- Nahrání a potvrzení čtou storage.objects a buckets, proto běží jako
-- vlastník (SECURITY DEFINER, stejně jako bible_kapacita) — spustit je smí
-- jen service role (oddíl 10, hlídá test).

-- Nahrání krok 1: řádek ve stavu „nahrava". Stejný soubor (SHA-256) už
-- v knihovně → duplicita; vlastní nedokončené nahrání téhož souboru se vrátí
-- (obnoveno), ať jde dokončit bez nového řádku.
CREATE OR REPLACE FUNCTION public.bible_zaloz_nahrani(
  p_uzivatel uuid,
  p_pristup text,
  p_jmeno text,
  p_dokument jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sha text := lower(coalesce(p_dokument ->> 'soubor_sha256', ''));
  v_jmeno_souboru text := coalesce(p_dokument ->> 'soubor_jmeno', '');
  v_velikost_text text := coalesce(p_dokument ->> 'soubor_velikost', '');
  v_velikost bigint;
  v_mime text := p_dokument ->> 'soubor_mime';
  v_povolene text[];
  v_limit bigint;
  v_stary public.bible_dokumenty%ROWTYPE;
  v_nazev_stary text;
  v_id uuid := gen_random_uuid();
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Nemáš právo nahrávat do knihovny.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_dokument) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí popis dokumentu.' USING ERRCODE = '22023';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Chybí otisk souboru (SHA-256).' USING ERRCODE = '22023';
  END IF;
  IF v_jmeno_souboru !~ '^[A-Za-z0-9._-]{1,200}$' OR v_jmeno_souboru IN ('.', '..') THEN
    RAISE EXCEPTION 'Neplatné jméno souboru v úložišti.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_dokument ->> 'soubor_nazev', '')) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Chybí jméno souboru.' USING ERRCODE = '22023';
  END IF;
  IF v_velikost_text !~ '^[0-9]{1,15}$' THEN
    RAISE EXCEPTION 'Chybí velikost souboru.' USING ERRCODE = '22023';
  END IF;
  v_velikost := v_velikost_text::bigint;
  SELECT allowed_mime_types, file_size_limit INTO v_povolene, v_limit FROM storage.buckets WHERE id = 'knihovna';
  IF v_velikost < 1 THEN
    RAISE EXCEPTION 'Soubor je prázdný.' USING ERRCODE = '22023';
  END IF;
  IF v_limit IS NOT NULL AND v_velikost > v_limit THEN
    RAISE EXCEPTION 'Soubor je větší, než úložiště dovolí (nejvýš % MB na soubor).', v_limit / 1048576 USING ERRCODE = '54000';
  END IF;
  IF v_mime IS NULL OR v_povolene IS NULL OR NOT (v_mime = ANY (v_povolene)) THEN
    RAISE EXCEPTION 'Tenhle typ souboru knihovna nebere.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_stary FROM public.bible_dokumenty WHERE soubor_sha256 = v_sha;
  IF FOUND THEN
    IF v_stary.stav = 'nahrava' AND (v_stary.nahral = p_uzivatel OR p_pristup = 'spravuje') THEN
      RETURN jsonb_build_object(
        'id', v_stary.id,
        'cesta', v_stary.soubor_cesta,
        'obnoveno', true,
        'soubor_nahran', EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'knihovna' AND o.name = v_stary.soubor_cesta)
      );
    END IF;
    RETURN jsonb_build_object('duplicita', true, 'nazev', v_stary.nazev);
  END IF;

  PERFORM set_config('bible.uzivatel', p_uzivatel::text, true);
  BEGIN
    INSERT INTO public.bible_dokumenty (
      id, nazev, autor, vydani, rok, isbn, jazyk, druh, oblasti, zdroj, licence,
      soubor_cesta, soubor_nazev, soubor_velikost, soubor_mime, soubor_sha256,
      prava_potvrdil, prava_potvrzena_at, nahral, nahral_jmeno
    ) VALUES (
      v_id,
      trim(coalesce(p_dokument ->> 'nazev', '')),
      nullif(trim(p_dokument ->> 'autor'), ''),
      nullif(trim(p_dokument ->> 'vydani'), ''),
      (p_dokument ->> 'rok')::integer,
      nullif(trim(p_dokument ->> 'isbn'), ''),
      nullif(p_dokument ->> 'jazyk', ''),
      coalesce(nullif(p_dokument ->> 'druh', ''), 'kniha'),
      CASE WHEN jsonb_typeof(p_dokument -> 'oblasti') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(p_dokument -> 'oblasti')) ELSE '{}'::text[] END,
      nullif(trim(p_dokument ->> 'zdroj'), ''),
      nullif(trim(p_dokument ->> 'licence'), ''),
      v_id::text || '/' || v_jmeno_souboru,
      p_dokument ->> 'soubor_nazev',
      v_velikost,
      v_mime,
      v_sha,
      p_uzivatel,
      now(),
      p_uzivatel,
      nullif(trim(p_jmeno), '')
    );
  EXCEPTION WHEN unique_violation THEN
    -- Někdo stejný soubor právě založil (souběh) — duplicita, ne chyba.
    PERFORM set_config('bible.uzivatel', '', true);
    SELECT nazev INTO v_nazev_stary FROM public.bible_dokumenty WHERE soubor_sha256 = v_sha;
    RETURN jsonb_build_object('duplicita', true, 'nazev', coalesce(v_nazev_stary, trim(p_dokument ->> 'nazev')));
  END;
  PERFORM set_config('bible.uzivatel', '', true);
  RETURN jsonb_build_object('id', v_id, 'cesta', v_id::text || '/' || v_jmeno_souboru, 'obnoveno', false, 'soubor_nahran', false);
END;
$$;

-- Nahrání krok 2: soubor v úložišti je a má ohlášenou velikost → do fronty.
-- (SHA-256 Storage neukládá; přepočítá ho worker po stažení.)
CREATE OR REPLACE FUNCTION public.bible_potvrd_nahrani(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.bible_dokumenty%ROWTYPE;
  v_velikost text;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Nemáš právo nahrávat do knihovny.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.bible_dokumenty WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('vysledek', 'nenalezeno');
  END IF;
  IF v.nahral IS DISTINCT FROM p_uzivatel AND p_pristup <> 'spravuje' THEN
    RAISE EXCEPTION 'Tohle nahrání patří někomu jinému.' USING ERRCODE = '42501';
  END IF;
  IF v.stav <> 'nahrava' THEN
    RETURN jsonb_build_object('vysledek', 'ok', 'stav', v.stav);
  END IF;
  SELECT o.metadata ->> 'size' INTO v_velikost
    FROM storage.objects o WHERE o.bucket_id = 'knihovna' AND o.name = v.soubor_cesta;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('vysledek', 'soubor_chybi');
  END IF;
  IF v_velikost IS NULL OR v_velikost !~ '^[0-9]+$' OR v_velikost::bigint <> v.soubor_velikost THEN
    RETURN jsonb_build_object('vysledek', 'jina_velikost', 'velikost', v_velikost);
  END IF;
  UPDATE public.bible_dokumenty SET stav = 'ceka', stav_zprava = NULL WHERE id = p_id;
  RETURN jsonb_build_object('vysledek', 'ok', 'stav', 'ceka');
END;
$$;

-- Úprava popisu: správce u všech, přispěvatel jen u svých dokumentů.
CREATE OR REPLACE FUNCTION public.bible_uprav_popis(p_uzivatel uuid, p_pristup text, p_id uuid, p_popis jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nahral uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Nemáš právo upravovat knihovnu.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_popis) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Chybí popis dokumentu.' USING ERRCODE = '22023';
  END IF;
  SELECT nahral INTO v_nahral FROM public.bible_dokumenty WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup <> 'spravuje' AND v_nahral IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Upravit smíš jen svoje dokumenty.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('bible.uzivatel', p_uzivatel::text, true);
  UPDATE public.bible_dokumenty SET
    nazev = trim(coalesce(p_popis ->> 'nazev', '')),
    autor = nullif(trim(p_popis ->> 'autor'), ''),
    vydani = nullif(trim(p_popis ->> 'vydani'), ''),
    rok = (p_popis ->> 'rok')::integer,
    isbn = nullif(trim(p_popis ->> 'isbn'), ''),
    jazyk = nullif(p_popis ->> 'jazyk', ''),
    druh = coalesce(nullif(p_popis ->> 'druh', ''), 'kniha'),
    oblasti = CASE WHEN jsonb_typeof(p_popis -> 'oblasti') = 'array'
                   THEN ARRAY(SELECT jsonb_array_elements_text(p_popis -> 'oblasti')) ELSE '{}'::text[] END,
    zdroj = nullif(trim(p_popis ->> 'zdroj'), ''),
    licence = nullif(trim(p_popis ->> 'licence'), '')
  WHERE id = p_id;
  PERFORM set_config('bible.uzivatel', '', true);
  RETURN true;
END;
$$;

-- „Zpracovat znovu" (ceka) a „Pozastavit" (pozastaveno); pravidla hlídá trigger.
CREATE OR REPLACE FUNCTION public.bible_nastav_stav(p_uzivatel uuid, p_pristup text, p_id uuid, p_stav text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nahral uuid;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Nemáš právo upravovat knihovnu.' USING ERRCODE = '42501';
  END IF;
  IF p_stav IS NULL OR p_stav NOT IN ('ceka', 'pozastaveno') THEN
    RAISE EXCEPTION 'Ručně jde jen „zpracovat znovu" nebo „pozastavit".' USING ERRCODE = '42501';
  END IF;
  SELECT nahral INTO v_nahral FROM public.bible_dokumenty WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup <> 'spravuje' AND v_nahral IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Měnit smíš jen svoje dokumenty.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('bible.uzivatel', p_uzivatel::text, true);
  UPDATE public.bible_dokumenty SET stav = p_stav, stav_zprava = NULL WHERE id = p_id;
  PERFORM set_config('bible.uzivatel', '', true);
  RETURN true;
END;
$$;

-- Smazání: správce cokoli; přispěvatel jen svoje nedokončené nahrání.
-- Vrací cestu souboru — bible-api ho pak smaže přes Storage API (SQL
-- dotazem by v úložišti zůstal osiřelý soubor). NULL = dokument není.
CREATE OR REPLACE FUNCTION public.bible_smaz_dokument(p_uzivatel uuid, p_pristup text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v public.bible_dokumenty%ROWTYPE;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Mazat smí jen správce knihovny.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.bible_dokumenty WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF p_pristup <> 'spravuje' AND NOT (v.stav = 'nahrava' AND v.nahral = p_uzivatel) THEN
    RAISE EXCEPTION 'Mazat smí jen správce knihovny.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.bible_dokumenty WHERE id = p_id;
  RETURN v.soubor_cesta;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) Kapacita projektu bible (Správa knihovny, jen správce — hlídá bible-api)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bible_kapacita()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  )
$$;

-- ---------------------------------------------------------------------------
-- 10) Práva: všechno jen service role (bible-api a worker)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.migrace_aplikovane, public.bible_dokumenty, public.bible_kapitoly, public.bible_strany,
  public.bible_pasaze, public.ai_naklady, public.bible_nastaveni
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE
  public.migrace_aplikovane, public.bible_dokumenty, public.bible_kapitoly, public.bible_strany,
  public.bible_pasaze, public.ai_naklady, public.bible_nastaveni
  TO service_role;

REVOKE ALL ON FUNCTION
  public.bible_bez_diakritiky(text),
  public.bible_uroven(text),
  public.bible_dokumenty_hlidej(),
  public.bible_vezmi_dokument(integer, uuid, uuid[]),
  public.bible_utraceno_od(timestamptz),
  public.bible_naklady_od(timestamptz),
  public.bible_zaloz_nahrani(uuid, text, text, jsonb),
  public.bible_potvrd_nahrani(uuid, text, uuid),
  public.bible_uprav_popis(uuid, text, uuid, jsonb),
  public.bible_nastav_stav(uuid, text, uuid, text),
  public.bible_smaz_dokument(uuid, text, uuid),
  public.bible_kapacita()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_bez_diakritiky(text),
  public.bible_uroven(text),
  public.bible_vezmi_dokument(integer, uuid, uuid[]),
  public.bible_utraceno_od(timestamptz),
  public.bible_naklady_od(timestamptz),
  public.bible_zaloz_nahrani(uuid, text, text, jsonb),
  public.bible_potvrd_nahrani(uuid, text, uuid),
  public.bible_uprav_popis(uuid, text, uuid, jsonb),
  public.bible_nastav_stav(uuid, text, uuid, text),
  public.bible_smaz_dokument(uuid, text, uuid),
  public.bible_kapacita()
  TO service_role;
