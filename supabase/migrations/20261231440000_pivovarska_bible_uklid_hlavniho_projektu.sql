-- Pivovarská bible: úklid prázdných tabulek v HLAVNÍM projektu (31. 10. 2026)
--
-- Bible žije od 31. 10. 2026 v samostatném projektu Supabase (rozhodnutí R12,
-- docs/pivovarska-bible/ROZHODNUTI.md). Tabulky z migrací 20261231410000
-- a 20261231420000 zůstaly v hlavní databázi prázdné; appka, worker ani edge
-- funkce do nich nesahají (zápis zavřela 20261231430000). Majitel smazání
-- odsouhlasil 31. 10. 2026 („ano").
--
-- POJISTKA: maže se jen to, co je opravdu prázdné. Má-li kterákoli tabulka
-- jediný řádek, nebo má-li nastavení bible jinou než výchozí hodnotu z migrace
-- 20261231420000, skončí migrace chybou a NESMAŽE NIC (běží jako celek
-- v jedné transakci — spust_migraci, CI `psql -1`). Smazání je bez CASCADE:
-- kdyby na tabulce viselo něco nečekaného, migrace taky jen skončí chybou.
--
-- Zůstává:
--   bible_pristup()          — volá ji bible_overeni(), vstupní kontrola projektu bible;
--   bible_smi_cist/prispivat/spravovat()
--                            — stojí na nich politiky prázdného bucketu „knihovna";
--   bucket „knihovna"        — prázdný a zavřený pro nahrávání (20261231430000);
--                              smazat jde jen přes Storage, SQL to Supabase nedovolí;
--   rozšíření unaccent, pg_trgm.

-- 1) Pojistka -----------------------------------------------------------------
DO $$
DECLARE
  v_tabulka text;
  v_pocet bigint;
  v_jine text;
BEGIN
  FOREACH v_tabulka IN ARRAY ARRAY['bible_dokumenty', 'bible_kapitoly', 'bible_strany', 'bible_pasaze', 'ai_naklady'] LOOP
    IF to_regclass('public.' || v_tabulka) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tabulka) INTO v_pocet;
      IF v_pocet > 0 THEN
        RAISE EXCEPTION 'Tabulka % v hlavní databázi není prázdná (řádků: %) — nic se nesmazalo. Data patří do projektu bible; bez přesunu je mazat nelze.', v_tabulka, v_pocet;
      END IF;
    END IF;
  END LOOP;

  -- Nastavení: jen výchozí hodnoty z migrace 20261231420000 (nikdo je neměnil).
  IF to_regclass('public.bible_nastaveni') IS NOT NULL THEN
    SELECT string_agg(n.klic, ', ' ORDER BY n.klic) INTO v_jine
    FROM public.bible_nastaveni n
    LEFT JOIN (VALUES
      ('model_odpovedi', '"claude-opus-5-5"'::jsonb),
      ('model_pomocny', '"claude-haiku-5-5"'::jsonb),
      ('model_ocr', '"claude-haiku-5-5"'::jsonb),
      ('cenik_usd_za_mtok', '{
         "claude-opus-5-5":   {"vstup": 4,    "vystup": 20,  "cache_cteni": 0.20, "cache_zapis": 5},
         "claude-sonnet-5-5": {"vstup": 2,    "vystup": 10,  "cache_cteni": 0.20, "cache_zapis": 2.5},
         "claude-haiku-5-5":  {"vstup": 0.10, "vystup": 0.50, "cache_cteni": 0.01, "cache_zapis": 0.125}
       }'::jsonb),
      ('strop_mesic_usd', '20'::jsonb),
      ('strop_zpracovani_usd', '5'::jsonb),
      ('limit_db_mb', '450'::jsonb)
    ) AS vychozi(klic, hodnota) ON vychozi.klic = n.klic
    WHERE vychozi.klic IS NULL OR n.hodnota IS DISTINCT FROM vychozi.hodnota;
    IF v_jine IS NOT NULL THEN
      RAISE EXCEPTION 'Nastavení bible v hlavní databázi se liší od výchozího (%) — nic se nesmazalo. Změněné hodnoty nejdřív přenést do projektu bible.', v_jine;
    END IF;
  END IF;
END $$;

-- 2) Funkce nad tabulkami (bible_vezmi_dokument vrací jejich řádky, takže by
--    smazání tabulky bez CASCADE zablokovala) ---------------------------------
DROP FUNCTION IF EXISTS public.bible_vezmi_dokument(integer, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.bible_vezmi_dokument(integer, uuid);
DROP FUNCTION IF EXISTS public.bible_kapacita();
DROP FUNCTION IF EXISTS public.bible_utraceno_od(timestamptz);
DROP FUNCTION IF EXISTS public.bible_naklady_od(timestamptz);

-- 3) Tabulky (děti před rodiči; bez CASCADE) -----------------------------------
DROP TABLE IF EXISTS public.bible_pasaze;
DROP TABLE IF EXISTS public.bible_strany;
DROP TABLE IF EXISTS public.bible_kapitoly;
DROP TABLE IF EXISTS public.ai_naklady;
DROP TABLE IF EXISTS public.bible_nastaveni;
DROP TABLE IF EXISTS public.bible_dokumenty;

-- 4) Funkce, na kterých tabulky stály (spoušť, sloupec pro hledání) — až po nich
DROP FUNCTION IF EXISTS public.bible_dokumenty_hlidej();
DROP FUNCTION IF EXISTS public.bible_bez_diakritiky(text);
