-- 📚 Pivovarská bible — Etapa 2: zpracování knih (strany, kapitoly, pasáže,
-- náklady na AI, nastavení modelů, fronta pro worker).
--
-- Knihy zpracovává worker v GitHub Actions (scripts/bible/, workflow
-- bible-zpracovani.yml) přes service role: textová vrstva PDF, tištěná čísla
-- stran, kapitoly, OCR skenů přes Claude Haiku s kontrolou Tesseractem
-- a rozdělení na pasáže pro hledání. Návrh: docs/pivovarska-bible/.
--
-- Do této migrace (je veřejná) nesmí žádný obsah knih — jen struktura.
-- Kapitoly a pasáže jsou odvozená data: vzniknou znovu z originálu v bucketu,
-- proto se nezálohují (scripts/lib/zalohaTabulky.mjs) a při novém zpracování
-- knihy se nahradí. Strany se přepíšou; přepisy skenů v nich (zdroj ocr) se při
-- dalším zpracování použijí znovu, ať se za ně neplatí dvakrát.
--
-- Číst je smí jen ten, kdo smí do knihovny (bible_smi_cist, fail-closed);
-- zapisuje jen worker (service role) — pro přihlášené žádná zápisová politika.
-- Politiky volají kontrolu přístupu jako (SELECT …): vyhodnotí se jednou na
-- dotaz, ne pro každý řádek, a index hledání zůstane použitelný.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Hledání bez diakritiky (čeština, němčina): generovaný sloupec a index
-- potřebují IMMUTABLE funkci, unaccent() sama je jen STABLE. SECURITY
-- DEFINER, ať funkce nezávisí na tom, kdo smí do schématu extensions
-- (zapisuje worker přes service role, hledá přihlášený uživatel).
CREATE OR REPLACE FUNCTION public.bible_bez_diakritiky(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, t) $$;

-- Jako ostatní funkce bible: bez přihlášení (anon) ne.
REVOKE ALL ON FUNCTION public.bible_bez_diakritiky(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_bez_diakritiky(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Fronta zpracování na dokumentu
-- ---------------------------------------------------------------------------
ALTER TABLE public.bible_dokumenty ADD COLUMN IF NOT EXISTS zamek_do timestamptz;
ALTER TABLE public.bible_dokumenty ADD COLUMN IF NOT EXISTS pokusy integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bible_dokumenty_pokusy_check') THEN
    ALTER TABLE public.bible_dokumenty ADD CONSTRAINT bible_dokumenty_pokusy_check CHECK (pokusy >= 0);
  END IF;
  -- Cesta v bucketu je vždy „<id dokumentu>/<bezpečné jméno>" (appka: bezpecneJmeno).
  -- Worker pak se service role nestáhne nic jiného než soubor dokumentu
  -- (třeba '../../auth/v1/admin/users'). NOT VALID: dřívější řádky se nekontrolují.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bible_dokumenty_cesta_check') THEN
    ALTER TABLE public.bible_dokumenty ADD CONSTRAINT bible_dokumenty_cesta_check
      CHECK (soubor_cesta ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,200}$') AND split_part(soubor_cesta, '/', 2) NOT IN ('.', '..'))
      NOT VALID;
  END IF;
END $$;

-- Hlídání sloupců zpracování (při vložení i úpravě). Přihlášený uživatel nesmí
-- zapsat údaje zpracování ani při vložení (podvržené pokusy nebo created_at by
-- zablokovaly frontu). „Zpracovat znovu" vynuluje pokusy; dokument, který se
-- právě zpracovává, se znovu do fronty nedá (pozastavit ho jde — worker to pozná).
CREATE OR REPLACE FUNCTION public.bible_dokumenty_hlidej()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- worker (service role) a migrace
  END IF;
  IF TG_OP = 'INSERT' THEN
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
     OR NEW.zamek_do IS DISTINCT FROM OLD.zamek_do
     OR NEW.pokusy IS DISTINCT FROM OLD.pokusy
     OR NEW.nahral IS DISTINCT FROM OLD.nahral
     OR NEW.prava_potvrdil IS DISTINCT FROM OLD.prava_potvrdil
     OR NEW.prava_potvrzena_at IS DISTINCT FROM OLD.prava_potvrzena_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tyto údaje dokumentu zapisuje jen zpracování knihovny.' USING ERRCODE = '42501';
  END IF;
  IF NEW.stav IS DISTINCT FROM OLD.stav THEN
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

-- Cizí klíč na jiný dokument (duplikát) s indexem — smazání dokumentu ho jinak hledá v celé tabulce.
CREATE INDEX IF NOT EXISTS bible_dokumenty_duplikat_idx ON public.bible_dokumenty (duplikat_z) WHERE duplikat_z IS NOT NULL;

DROP TRIGGER IF EXISTS bible_dokumenty_hlidej ON public.bible_dokumenty;
CREATE TRIGGER bible_dokumenty_hlidej
  BEFORE INSERT OR UPDATE ON public.bible_dokumenty
  FOR EACH ROW EXECUTE FUNCTION public.bible_dokumenty_hlidej();

-- Worker si vezme další dokument: čekající, nebo zaseknutý (zámek vypršel —
-- běh spadl nebo ho GitHub zrušil). Nic se nemaže, jen se znovu zamkne.
-- p_vynechat = dokumenty zkoušené v tomhle běhu (přechodná chyba nespálí
-- všechny pokusy naráz). Zaseknutý dokument po třech pokusech = „chyba"
-- (spadl proces, ne Python — jinak by frontu blokoval donekonečna).
-- Dokumenty, které už selhaly, jdou až za ostatními.
DROP FUNCTION IF EXISTS public.bible_vezmi_dokument(integer, uuid);
CREATE OR REPLACE FUNCTION public.bible_vezmi_dokument(
  p_minut integer DEFAULT 120,
  p_id uuid DEFAULT NULL,
  p_vynechat uuid[] DEFAULT '{}'
)
RETURNS SETOF public.bible_dokumenty
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.bible_vezmi_dokument(integer, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bible_vezmi_dokument(integer, uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Kapitoly, strany, pasáže
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
-- Cizí klíče s indexem: smazání dokumentu nebo nové zpracování jinak prochází celé tabulky.
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

DROP POLICY IF EXISTS bible_kapitoly_select ON public.bible_kapitoly;
CREATE POLICY bible_kapitoly_select ON public.bible_kapitoly
  FOR SELECT TO authenticated USING ((SELECT public.bible_smi_cist()));
DROP POLICY IF EXISTS bible_strany_select ON public.bible_strany;
CREATE POLICY bible_strany_select ON public.bible_strany
  FOR SELECT TO authenticated USING ((SELECT public.bible_smi_cist()));
DROP POLICY IF EXISTS bible_pasaze_select ON public.bible_pasaze;
CREATE POLICY bible_pasaze_select ON public.bible_pasaze
  FOR SELECT TO authenticated USING ((SELECT public.bible_smi_cist()));

-- ---------------------------------------------------------------------------
-- 3) Náklady na AI (každé volání nebo souhrn za dokument)
-- ---------------------------------------------------------------------------
-- id je uuid, ne identity: obnova ze zálohy zapisuje i id (upsert přes REST).
-- dokument_id bez cizího klíče: evidence útraty musí přežít i smazání
-- dokumentu (jinak by se útrata smazaného dokumentu ztratila i ze stropu).
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
DROP POLICY IF EXISTS ai_naklady_select ON public.ai_naklady;
CREATE POLICY ai_naklady_select ON public.ai_naklady
  FOR SELECT TO authenticated USING ((SELECT public.bible_smi_spravovat()));

-- Útrata od daného okamžiku — součet počítá databáze (REST by vrátil nejvýš
-- 1000 řádků a zbytek tiše zahodil). SECURITY INVOKER: platí RLS volajícího,
-- takže útratu vidí jen správce knihovny (a worker přes service role).
CREATE OR REPLACE FUNCTION public.bible_utraceno_od(p_od timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT coalesce(sum(cena_usd), 0) FROM public.ai_naklady WHERE cas >= p_od $$;

CREATE OR REPLACE FUNCTION public.bible_naklady_od(p_od timestamptz)
RETURNS TABLE (ucel text, cena_usd numeric, volani bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT n.ucel, sum(n.cena_usd), sum(n.volani)::bigint
    FROM public.ai_naklady n
   WHERE n.cas >= p_od
   GROUP BY n.ucel
$$;

REVOKE ALL ON FUNCTION public.bible_utraceno_od(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_utraceno_od(timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bible_naklady_od(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bible_naklady_od(timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Nastavení bible (modely, ceník, stropy) — výměna modelu bez nasazení
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_nastaveni (
  klic text PRIMARY KEY,
  hodnota jsonb NOT NULL,
  popis text,
  upraveno timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bible_nastaveni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bible_nastaveni_select ON public.bible_nastaveni;
CREATE POLICY bible_nastaveni_select ON public.bible_nastaveni
  FOR SELECT TO authenticated USING ((SELECT public.bible_smi_cist()));
DROP POLICY IF EXISTS bible_nastaveni_update ON public.bible_nastaveni;
CREATE POLICY bible_nastaveni_update ON public.bible_nastaveni
  FOR UPDATE TO authenticated USING ((SELECT public.bible_smi_spravovat())) WITH CHECK ((SELECT public.bible_smi_spravovat()));

-- Výchozí hodnoty; už nastavené se nepřepisují (ON CONFLICT DO NOTHING).
-- Ceník USD za 1 milion tokenů podle Anthropic k 30. 10. 2026.
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
  ('limit_db_mb', '450', 'Pojistka: nad touto velikostí databáze (MB) se další knihy nezapíšou. Supabase Free má 500 MB a nad nimi přepne celou appku jen pro čtení; 0 = bez pojistky.')
ON CONFLICT (klic) DO NOTHING;
