-- 📍 Sklad a Drobák patří pod odběratele Radek.
--
-- Majitel 18. 11. 2026: „Sklad, Drobák patří pod odběratele Radek."
-- Dosud byl „Sklad" samostatný odběratel (4 objednávky: 8. 7., 10. 8.,
-- 3. 11. a 17. 11. 2026) a „Drobák" v databázi nebyl vůbec — jen v textech
-- a na fotkách objednávek od Radka („Radek (JONA, Drobák, Sklad)").
--
-- CO MIGRACE DĚLÁ
--  1) Radek dostane dvě další místa závozu — Sklad a Drobák
--     (places.mista_zavozu, viz 20261231450000). Adresa ani GPS se
--     nevymýšlejí — doplní se v Odběratelích.
--  2) Objednávky odběratele „Sklad" se přepíšou na Radka a místo „Sklad".
--     Datum, den závozu, položky ani stav se nemění: trigger na změnu
--     odběratele (20261231260000) doplňuje den jen objednávce, která ho
--     nemá, a tyhle všechny mají datum závozu.
--  3) Aliasy „sklad" a „drobak" → Radek: příští zpráva nebo fotka, kde se
--     píše „Sklad" nebo „Drobák", se přiřadí Radkovi.
--
-- ČEHO SE NESAHÁ
--  • Odběratel „Sklad" zůstává v seznamu (nic se nemaže, smaže ho majitel).
--  • Zprávy z WhatsAppu se nepřepisují (jsou záznam o tom, co přišlo).
--  • Objednávka z 17. 11. 2026, která vyjmenovává víc míst najednou, se
--    NEDĚLÍ — jak se rozdělí mezi odběratele, musí říct majitel.
--  • Dřívější objednávky Radka zůstávají bez zvoleného místa: kam se vezly,
--    se nehádá (místo se zvolí v detailu objednávky nebo v Rozvozu).
--
-- Pustit podruhé nic nezmění. Bez migrace 20261231450000 (místa závozu),
-- bez odběratele Radek nebo když jich je víc, se nic neudělá.

DO $$
DECLARE
  v_radek uuid;
  v_radek_jmeno text;
  v_sklad uuid;
  v_pocet integer;
  v_prepsano integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'mista_zavozu'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'misto_zavozu'
  ) THEN
    RAISE NOTICE 'Chybí sloupce míst závozu (migrace 20261231450000) — Sklad a Drobák se nepřesouvají.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_pocet FROM public.places WHERE lower(btrim(name)) = 'radek';
  IF v_pocet <> 1 THEN
    RAISE NOTICE 'Odběratel Radek: nalezeno % — nic se nemění.', v_pocet;
    RETURN;
  END IF;
  SELECT id, name INTO v_radek, v_radek_jmeno FROM public.places WHERE lower(btrim(name)) = 'radek';

  -- 1) Dvě další místa závozu Radka ---------------------------------------
  UPDATE public.places p
  SET mista_zavozu = p.mista_zavozu || jsonb_build_array(jsonb_build_object(
        'id', 'misto-sklad', 'nazev', 'Sklad', 'adresa', NULL, 'lat', NULL, 'lng', NULL))
  WHERE p.id = v_radek
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.mista_zavozu) e
      WHERE e->>'id' = 'misto-sklad' OR lower(btrim(e->>'nazev')) = 'sklad'
    );

  UPDATE public.places p
  SET mista_zavozu = p.mista_zavozu || jsonb_build_array(jsonb_build_object(
        'id', 'misto-drobak', 'nazev', 'Drobák', 'adresa', NULL, 'lat', NULL, 'lng', NULL))
  WHERE p.id = v_radek
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.mista_zavozu) e
      WHERE e->>'id' = 'misto-drobak' OR lower(btrim(e->>'nazev')) IN ('drobák', 'drobak')
    );

  -- 2) Objednávky odběratele „Sklad" → Radek, místo Sklad ------------------
  SELECT count(*) INTO v_pocet FROM public.places WHERE lower(btrim(name)) = 'sklad';
  IF v_pocet = 1 THEN
    SELECT id INTO v_sklad FROM public.places WHERE lower(btrim(name)) = 'sklad';
    UPDATE public.orders
    SET place_id = v_radek,
        place_name = v_radek_jmeno,
        misto_zavozu = 'misto-sklad'
    WHERE misto_zavozu IS NULL
      AND (place_id = v_sklad
           OR (place_id IS NULL AND lower(btrim(place_name)) = 'sklad'));
    GET DIAGNOSTICS v_prepsano = ROW_COUNT;
    RAISE NOTICE 'Objednávky Skladu přesunuté k Radkovi: %', v_prepsano;
  ELSE
    RAISE NOTICE 'Odběratel Sklad: nalezeno % — objednávky se nepřesouvají.', v_pocet;
  END IF;

  -- 3) Aliasy: „Sklad" a „Drobák" ve zprávě i na fotce jsou Radek ----------
  -- Už existující alias (třeba naučený z opravy) se NEPŘEPISUJE.
  INSERT INTO public.place_aliases (wrong_name, place_id, correct_name)
  VALUES ('sklad', v_radek, v_radek_jmeno),
         ('drobak', v_radek, v_radek_jmeno)
  ON CONFLICT (wrong_name) DO NOTHING;
END
$$;
