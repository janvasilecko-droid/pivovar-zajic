-- Spousteni cekajicich migraci z aplikace (a tedy i z telefonu).
--
-- PROC: migrace se dosud pousteji jen z pocitace prikazem
-- `node scripts/apply-migration.mjs <soubor>`. Prehled v Nastaveni cekajici
-- migraci pozna a napise ji — ale kdo stoji u vycepu s telefonem, nema jak ji
-- pustit. Sest migraci takhle 6. 9. 2026 cekalo tri dny a appka mezitim
-- sahala na tabulky, ktere na produkci nebyly.
--
-- JAK JE TO ZAJISTENE, ABY TO NEBYLA DIRA:
--   • Tuhle funkci NESMI zavolat prihlaseny uzivatel. Prava jsou odebrana
--     PUBLIC/anon/authenticated a dana JEN service_role, tedy klici, ktery ma
--     pouze edge funkce `pust-migraci` na serveru. Service_role uz dnes muze
--     s databazi delat cokoliv, takze tenhle GRANT nedava nikomu nova prava.
--   • Edge funkce pusti jen SQL, ktere si sama stahne z nasazene aplikace
--     (public/migrace-sql.json vznika pri buildu z repozitare). Klient posila
--     JEN JMENO souboru, nikdy SQL — jinak by z toho byl vzdalene ovladany
--     spousteci libovolneho prikazu.
--   • Edge funkce navic vyzaduje roli `admin` v profiles.
--
-- Funkce je zamerne hloupa: pusti SQL a zapise radek do evidence. Jedno
-- volani = jedna transakce, takze migrace, ktera spadne v pulce, po sobe
-- nenecha polovicni schema ani zaznam, ze probehla.

CREATE OR REPLACE FUNCTION public.spust_migraci(
  p_nazev text,
  p_sql text,
  p_zdroj text DEFAULT 'appka'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_nazev IS NULL OR btrim(p_nazev) = '' THEN
    RAISE EXCEPTION 'Chybí název migrace.';
  END IF;
  IF p_sql IS NULL OR btrim(p_sql) = '' THEN
    RAISE EXCEPTION 'Migrace % nemá žádné SQL.', p_nazev;
  END IF;

  EXECUTE p_sql;

  -- ON CONFLICT: kdyby tutéž migraci pustili dva lidé naráz, druhý zápis
  -- nesmí shodit už provedenou migraci.
  INSERT INTO public.migrace_aplikovane (nazev, zdroj)
  VALUES (p_nazev, p_zdroj)
  ON CONFLICT (nazev) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'nazev', p_nazev);
END;
$$;

-- Prava: nikdo krome service_role. Poradi je dulezite — REVOKE az po
-- vytvoreni funkce, jinak by se PUBLIC pravo vratilo pri kazdem CREATE OR
-- REPLACE.
REVOKE ALL ON FUNCTION public.spust_migraci(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spust_migraci(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.spust_migraci(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.spust_migraci(text, text, text) TO service_role;

COMMENT ON FUNCTION public.spust_migraci(text, text, text) IS
  'Pusti SQL jedne migrace a zapise ji do migrace_aplikovane. Volat smi jen service_role (edge funkce pust-migraci).';
