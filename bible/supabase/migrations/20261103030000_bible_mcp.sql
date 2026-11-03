-- 🔌 Pivovarská bible — konektor do aplikace Claude (vzdálený MCP server).
--
-- Majitel 3. 11. 2026 zvolil „obě" (přehledy v appce + konektor do aplikace
-- Claude). Claude v aplikaci majitele (jeho předplatné) si přes konektor
-- hledá v knihovně, čte stránky a přehledy a odpovídá s odkazy na knihy.
-- Pravidla Anthropicu to dovolují: uživatel se svým účtem v nativní aplikaci
-- Claude, náš server jen poskytuje nástroje (R16 v docs/pivovarska-bible).
--
-- Přihlášení OAuth 2.1 (PKCE S256): Claude se zaregistruje (DCR), majitel
-- v appce pivovaru potvrdí „Povolit" (přihlášený, s přístupem do bible —
-- ověří brána jako u bible-api), Claude dostane krátký přístupový token
-- (1 h) a obnovovací (30 dní, při každém obnovení nový). Tokeny a kódy jsou
-- v DB jen jako sha256 — z databáze nejdou použít. Odpojit jde v appce
-- (Správa znalostí) — tokeny se zneplatní okamžitě.
--
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih ani tajemství.

CREATE TABLE IF NOT EXISTS public.bible_mcp_klienti (
  client_id text PRIMARY KEY CHECK (client_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  nazev text,
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 5),
  vytvoreno timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bible_mcp_kody (
  kod_hash text PRIMARY KEY CHECK (kod_hash ~ '^[0-9a-f]{64}$'),
  client_id text NOT NULL REFERENCES public.bible_mcp_klienti(client_id) ON DELETE CASCADE,
  uzivatel uuid NOT NULL,
  jmeno text,
  pristup text NOT NULL CHECK (pristup IN ('cte', 'prispiva', 'spravuje')),
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  plati_do timestamptz NOT NULL,
  pouzit timestamptz,
  vytvoreno timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_mcp_kody_klient_idx ON public.bible_mcp_kody (client_id);

CREATE TABLE IF NOT EXISTS public.bible_mcp_tokeny (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  druh text NOT NULL CHECK (druh IN ('pristup', 'obnova')),
  -- Jedno připojení = jeden řetěz obnovení (odpojení zneplatní celé připojení).
  pripojeni uuid NOT NULL,
  client_id text NOT NULL REFERENCES public.bible_mcp_klienti(client_id) ON DELETE CASCADE,
  uzivatel uuid NOT NULL,
  jmeno text,
  pristup text NOT NULL CHECK (pristup IN ('cte', 'prispiva', 'spravuje')),
  plati_do timestamptz NOT NULL,
  zruseno timestamptz,
  naposled timestamptz,
  vytvoreno timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bible_mcp_tokeny_pripojeni_idx ON public.bible_mcp_tokeny (pripojeni);
CREATE INDEX IF NOT EXISTS bible_mcp_tokeny_uzivatel_idx ON public.bible_mcp_tokeny (uzivatel);
CREATE INDEX IF NOT EXISTS bible_mcp_tokeny_klient_idx ON public.bible_mcp_tokeny (client_id);

ALTER TABLE public.bible_mcp_klienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_mcp_kody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_mcp_tokeny ENABLE ROW LEVEL SECURITY;

-- Registrace klienta (DCR). Adresy návratu hlídá i funkce (jen Claude).
CREATE OR REPLACE FUNCTION public.bible_mcp_registruj(p_client_id text, p_nazev text, p_redirect_uris text[])
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.bible_mcp_klienti (client_id, nazev, redirect_uris)
  VALUES (p_client_id, left(p_nazev, 100), p_redirect_uris)
$$;

-- Kód po „Povolit" v appce. Volá bible-api po ověření přihlášení a přístupu.
-- Vrátí false, když klient neexistuje nebo adresa návratu není jeho.
CREATE OR REPLACE FUNCTION public.bible_mcp_vydej_kod(
  p_uzivatel uuid, p_jmeno text, p_pristup text, p_client_id text, p_redirect_uri text, p_challenge text, p_kod_hash text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.bible_uroven(p_pristup) < 1 THEN
    RAISE EXCEPTION 'bez přístupu do bible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bible_mcp_klienti k
                  WHERE k.client_id = p_client_id AND p_redirect_uri = ANY (k.redirect_uris)) THEN
    RETURN false;
  END IF;
  DELETE FROM public.bible_mcp_kody WHERE plati_do < now() - interval '1 day';
  INSERT INTO public.bible_mcp_kody (kod_hash, client_id, uzivatel, jmeno, pristup, redirect_uri, code_challenge, plati_do)
  VALUES (p_kod_hash, p_client_id, p_uzivatel, left(p_jmeno, 100), p_pristup, p_redirect_uri, p_challenge, now() + interval '5 minutes');
  RETURN true;
END
$$;

-- Výměna kódu za tokeny. p_challenge = S256(code_verifier) spočítané funkcí.
-- Kód jde použít jednou, 5 minut, jen stejným klientem a adresou návratu.
CREATE OR REPLACE FUNCTION public.bible_mcp_vymen_kod(
  p_kod_hash text, p_client_id text, p_redirect_uri text, p_challenge text, p_pristup_hash text, p_obnova_hash text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  k public.bible_mcp_kody;
  p uuid := gen_random_uuid();
BEGIN
  UPDATE public.bible_mcp_kody SET pouzit = now()
   WHERE kod_hash = p_kod_hash AND pouzit IS NULL AND plati_do > now()
     AND client_id = p_client_id AND redirect_uri = p_redirect_uri AND code_challenge = p_challenge
  RETURNING * INTO k;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.bible_mcp_tokeny (token_hash, druh, pripojeni, client_id, uzivatel, jmeno, pristup, plati_do) VALUES
    (p_pristup_hash, 'pristup', p, k.client_id, k.uzivatel, k.jmeno, k.pristup, now() + interval '1 hour'),
    (p_obnova_hash, 'obnova', p, k.client_id, k.uzivatel, k.jmeno, k.pristup, now() + interval '30 days');
  RETURN true;
END
$$;

-- Obnovení: starý obnovovací token se zneplatní, vzniknou nové (rotace).
-- Použití už zneplatněného obnovovacího tokenu = únik → zruší celé připojení.
CREATE OR REPLACE FUNCTION public.bible_mcp_obnov(p_obnova_hash text, p_client_id text, p_pristup_hash text, p_nova_obnova_hash text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  t public.bible_mcp_tokeny;
BEGIN
  SELECT * INTO t FROM public.bible_mcp_tokeny
   WHERE token_hash = p_obnova_hash AND druh = 'obnova' AND client_id = p_client_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF t.zruseno IS NOT NULL THEN
    UPDATE public.bible_mcp_tokeny SET zruseno = now() WHERE pripojeni = t.pripojeni AND zruseno IS NULL;
    RETURN false;
  END IF;
  IF t.plati_do <= now() THEN
    RETURN false;
  END IF;
  UPDATE public.bible_mcp_tokeny SET zruseno = now() WHERE token_hash = p_obnova_hash;
  INSERT INTO public.bible_mcp_tokeny (token_hash, druh, pripojeni, client_id, uzivatel, jmeno, pristup, plati_do) VALUES
    (p_pristup_hash, 'pristup', t.pripojeni, t.client_id, t.uzivatel, t.jmeno, t.pristup, now() + interval '1 hour'),
    (p_nova_obnova_hash, 'obnova', t.pripojeni, t.client_id, t.uzivatel, t.jmeno, t.pristup, now() + interval '30 days');
  DELETE FROM public.bible_mcp_tokeny WHERE pripojeni = t.pripojeni AND plati_do < now() - interval '1 day';
  RETURN true;
END
$$;

-- Ověření přístupového tokenu při každém volání nástroje.
CREATE OR REPLACE FUNCTION public.bible_mcp_over(p_pristup_hash text)
RETURNS TABLE (uzivatel uuid, jmeno text, pristup text)
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.bible_mcp_tokeny SET naposled = now()
   WHERE token_hash = p_pristup_hash AND druh = 'pristup' AND zruseno IS NULL AND plati_do > now()
  RETURNING uzivatel, jmeno, pristup
$$;

-- Připojení uživatele pro appku (bez tokenů).
CREATE OR REPLACE FUNCTION public.bible_mcp_pripojeni(p_uzivatel uuid)
RETURNS TABLE (pripojeni uuid, klient text, od timestamptz, naposled timestamptz)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.pripojeni, max(k.nazev), min(t.vytvoreno), max(t.naposled)
    FROM public.bible_mcp_tokeny t
    JOIN public.bible_mcp_klienti k ON k.client_id = t.client_id
   WHERE t.uzivatel = p_uzivatel
   GROUP BY t.pripojeni
  HAVING bool_or(t.druh = 'obnova' AND t.zruseno IS NULL AND t.plati_do > now())
   ORDER BY min(t.vytvoreno) DESC
$$;

-- Odpojení: zneplatní všechny tokeny připojení (nebo všech připojení uživatele).
CREATE OR REPLACE FUNCTION public.bible_mcp_odpoj(p_uzivatel uuid, p_pripojeni uuid)
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH z AS (
    UPDATE public.bible_mcp_tokeny SET zruseno = now()
     WHERE uzivatel = p_uzivatel AND zruseno IS NULL AND (p_pripojeni IS NULL OR pripojeni = p_pripojeni)
    RETURNING pripojeni
  )
  SELECT count(DISTINCT pripojeni)::integer FROM z
$$;

REVOKE ALL ON TABLE public.bible_mcp_klienti, public.bible_mcp_kody, public.bible_mcp_tokeny FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bible_mcp_klienti, public.bible_mcp_kody, public.bible_mcp_tokeny TO service_role;
REVOKE ALL ON FUNCTION
  public.bible_mcp_registruj(text, text, text[]),
  public.bible_mcp_vydej_kod(uuid, text, text, text, text, text, text),
  public.bible_mcp_vymen_kod(text, text, text, text, text, text),
  public.bible_mcp_obnov(text, text, text, text),
  public.bible_mcp_over(text),
  public.bible_mcp_pripojeni(uuid),
  public.bible_mcp_odpoj(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.bible_mcp_registruj(text, text, text[]),
  public.bible_mcp_vydej_kod(uuid, text, text, text, text, text, text),
  public.bible_mcp_vymen_kod(text, text, text, text, text, text),
  public.bible_mcp_obnov(text, text, text, text),
  public.bible_mcp_over(text),
  public.bible_mcp_pripojeni(uuid),
  public.bible_mcp_odpoj(uuid, uuid)
  TO service_role;
