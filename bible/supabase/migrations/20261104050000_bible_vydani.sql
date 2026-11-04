-- 📚 Pivovarská bible — nová vydání dokumentů (etapa 3c).
--
-- Zadání, etapa 3: „aktualizace dokumentů (nové vydání)"; architektura § 4:
-- „Různá vydání se seskupují. Nic se nemaže." Člověk u knihy označí, že je
-- novým vydáním jiné knihy z knihovny. Starší vydání zůstává celé — čtení,
-- hledání i staré citace dál fungují —, appka ho jen označí „starší vydání"
-- a přehledy témat berou zdroje z nejnovějšího zpracovaného vydání.
--
-- Sloupec duplikat_z (základ) zůstává pro automatické „možná duplicita"
-- ze zpracování; tahle vazba je potvrzená člověkem a má směr (nové vydání →
-- předchozí vydání).
--
-- Zapisuje se jen přes bible_nastav_vydani (práva jako u úpravy popisu:
-- správce u čehokoli, přispěvatel u svých dokumentů).
-- Jen projekt bible; spouští majitel v appce: Systém → Databázové migrace →
-- Databáze bible. SQL je veřejné — žádný obsah knih.

ALTER TABLE public.bible_dokumenty
  ADD COLUMN IF NOT EXISTS predchozi_vydani uuid REFERENCES public.bible_dokumenty(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.bible_dokumenty
    ADD CONSTRAINT bible_dokumenty_vydani_ne_sebe CHECK (predchozi_vydani IS NULL OR predchozi_vydani <> id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS bible_dokumenty_predchozi_idx
  ON public.bible_dokumenty (predchozi_vydani) WHERE predchozi_vydani IS NOT NULL;

-- Nastaví (nebo zruší, p_predchozi = NULL) „tahle kniha je novým vydáním té".
-- Vrací, jestli dokument existoval.
CREATE OR REPLACE FUNCTION public.bible_nastav_vydani(p_uzivatel uuid, p_pristup text, p_id uuid, p_predchozi uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nahral uuid;
  v_dalsi uuid;
  v_kroku integer := 0;
BEGIN
  IF p_uzivatel IS NULL OR public.bible_uroven(p_pristup) < 2 THEN
    RAISE EXCEPTION 'Nemáš právo upravovat knihovnu.' USING ERRCODE = '42501';
  END IF;
  -- Dvě souběžná propojení (A → B a B → A) by kontrolou kruhu prošla obě.
  PERFORM pg_advisory_xact_lock(hashtext('bible_nastav_vydani'));
  SELECT nahral INTO v_nahral FROM public.bible_dokumenty WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p_pristup <> 'spravuje' AND v_nahral IS DISTINCT FROM p_uzivatel THEN
    RAISE EXCEPTION 'Upravit smíš jen svoje dokumenty.' USING ERRCODE = '42501';
  END IF;
  IF p_predchozi IS NOT NULL THEN
    IF p_predchozi = p_id THEN
      RAISE EXCEPTION 'Kniha nemůže být novým vydáním sama sebe.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bible_dokumenty WHERE id = p_predchozi) THEN
      RAISE EXCEPTION 'Předchozí vydání už v knihovně není.' USING ERRCODE = '22023';
    END IF;
    -- Kruh vydání (A novější než B a B novější než A) by appku zacyklil:
    -- projde se řada starších vydání vybrané knihy.
    v_dalsi := p_predchozi;
    WHILE v_dalsi IS NOT NULL AND v_kroku < 1000 LOOP
      IF v_dalsi = p_id THEN
        RAISE EXCEPTION 'Vybraná kniha je novějším vydáním téhle — obráceně je propojit nejde.' USING ERRCODE = '22023';
      END IF;
      v_kroku := v_kroku + 1;
      SELECT predchozi_vydani INTO v_dalsi FROM public.bible_dokumenty WHERE id = v_dalsi;
    END LOOP;
  END IF;
  PERFORM set_config('bible.uzivatel', p_uzivatel::text, true);
  UPDATE public.bible_dokumenty SET predchozi_vydani = p_predchozi WHERE id = p_id;
  PERFORM set_config('bible.uzivatel', '', true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.bible_nastav_vydani(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bible_nastav_vydani(uuid, text, uuid, uuid) TO service_role;
