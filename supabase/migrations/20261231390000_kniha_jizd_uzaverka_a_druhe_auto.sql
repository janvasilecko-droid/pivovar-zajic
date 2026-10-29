-- 🚐 Kniha jízd: druhé auto (Kačena) v databázi + uzávěrka měsíce podle tachometru.
--
-- Zadání majitele 29. 10. 2026: kniha jízd z objednávek a dnů závozu, k tomu
-- i jízdy mimo objednávky a „jednou měsíčně aby se dopsal rozdíl v km (stav
-- kilometrů) a ten rozdíl dopočítáš rovnoměrně mezi jízdy“.
--
-- CO MIGRACE DĚLÁ
--  1) orders.second_car — objednávka jede druhým autem (Kačena). Dosud to
--     bylo jen v localStorage jednoho prohlížeče: jiný telefon ani Kniha jízd
--     na druhém zařízení o tom nevěděly a generátor zapsal jízdu na špatné auto.
--  2) logbook_entries: km_trasa (km z mapy před dorovnáním), km_dorovnani
--     (díl rozdílu podle tachometru), uzavreno_at/uzavreno_by (jízda je
--     v uzavřeném měsíci).
--  3) logbook_closures — záznam o uzavření měsíce jednoho auta: stav tachometru
--     na začátku a na konci, součet tras, rozpočítaný rozdíl a způsob.
--  4) Zámek: jízda v uzavřeném měsíci nejde změnit ani smazat a do uzavřeného
--     měsíce auta nejde přidat nová (trigger — platí pro každého, kdo píše
--     přes appku; service_role to obchází, ať jde data opravit zvenku).
--  5) kniha_jizd_uzavrit_mesic(...) — uzavře měsíc v jedné transakci a SAMA
--     přepočítá, že čísla od appky sedí (tachometr navazuje jízda za jízdou,
--     součet dorovnání = rozdíl, žádná jízda neubyla ani nepřibyla).
--     kniha_jizd_otevrit_mesic(...) — jen admin/šéf/sládek/manažer.
--  6) kniha_jizd_uloz_davku(...) — smaže, upraví a vloží jízdy v JEDNÉ transakci.
--     Úprava nebo smazání jízdy posouvá tachometr pozdějších jízd; ukládat to po
--     jednom by při výpadku spojení nechalo řadu napůl.
--
-- NIC SE NEMAŽE A NEPŘEPISUJE: stávající jízdy zůstávají, jak jsou (km_trasa
-- zůstává prázdné — uzávěrka bere v takovém případě ujeté km). Pustit
-- podruhé nic nezmění.

-- 1) Kačena u objednávky ---------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS second_car boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.second_car IS
  'Objednávka jede druhým autem (Kačena). Zaškrtává se v Závozu; Kniha jízd podle toho zapíše jízdu na druhé vozidlo (dřív jen localStorage prohlížeče).';

-- 2) Nové sloupce v Knize jízd ----------------------------------------------
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS km_trasa numeric,
  ADD COLUMN IF NOT EXISTS km_dorovnani numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uzavreno_at timestamptz,
  ADD COLUMN IF NOT EXISTS uzavreno_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.logbook_entries.km_trasa IS
  'Km z trasy (z mapy nebo zadané ručně) PŘED dorovnáním podle tachometru. Prázdné u starších jízd — uzávěrka pak bere km_driven.';
COMMENT ON COLUMN public.logbook_entries.km_dorovnani IS
  'Díl rozdílu (tachometr − součet tras), který uzávěrka měsíce přidala nebo ubrala této jízdě. km_driven = km_trasa + km_dorovnani.';
COMMENT ON COLUMN public.logbook_entries.uzavreno_at IS
  'Kdy byl měsíc auta uzavřen. Vyplněné = jízdu nejde změnit ani smazat, dokud měsíc někdo nepřevede zpět na otevřený.';

CREATE INDEX IF NOT EXISTS idx_logbook_entries_vozidlo_datum
  ON public.logbook_entries (vehicle_name, entry_date);

-- 3) Záznam o uzavření měsíce ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logbook_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_name text NOT NULL,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- 'YYYY-MM'
  km_start numeric NOT NULL,            -- tachometr na začátku měsíce
  km_end numeric NOT NULL,              -- tachometr na konci měsíce (palubní deska)
  km_trasa numeric NOT NULL,            -- součet tras před dorovnáním
  km_dorovnani numeric NOT NULL,        -- rozpočítaný rozdíl (km_end − km_start − km_trasa)
  rezim text NOT NULL CHECK (rezim IN ('rovnomerne', 'umerne')),
  pocet_jizd integer NOT NULL,          -- mezi kolik jízd se rozdělovalo (bez tankování)
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT logbook_closures_tachometr CHECK (km_end >= km_start),
  CONSTRAINT logbook_closures_unikat UNIQUE (vehicle_name, month)
);

COMMENT ON TABLE public.logbook_closures IS
  'Uzavřené měsíce Knihy jízd po autech. Existence řádku = jízdy auta za ten měsíc jsou zamčené (viz logbook_hlida_uzavreny_mesic). Zapisuje jen kniha_jizd_uzavrit_mesic / kniha_jizd_otevrit_mesic.';

ALTER TABLE public.logbook_closures ENABLE ROW LEVEL SECURITY;

-- Čtení mají všichni přihlášení; zapisovat NIKDO přímo (žádná politika pro
-- INSERT/UPDATE/DELETE) — jen přes funkce níž, které si čísla přepočítají.
DROP POLICY IF EXISTS "auth_read_logbook_closures" ON public.logbook_closures;
CREATE POLICY "auth_read_logbook_closures" ON public.logbook_closures
  FOR SELECT TO authenticated USING (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.logbook_closures;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'logbook_closures už v publikaci: %', SQLERRM;
END $$;

-- 4) Zámek uzavřeného měsíce -------------------------------------------------
-- Uzavírání a otevírání měsíce (funkce níž) si zámek na dobu své transakce
-- vypne přes app.logbook_uzavirani. Bez přihlášeného uživatele (service_role,
-- opravy zvenku) se nehlídá — stejný vzor jako is_admin_tier_role().
CREATE OR REPLACE FUNCTION public.logbook_hlida_uzavreny_mesic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mesic text;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(current_setting('app.logbook_uzavirani', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.uzavreno_at IS NOT NULL THEN
    RAISE EXCEPTION 'Jízda z % (%) je v uzavřeném měsíci — nejde změnit ani smazat. Nejdřív měsíc otevři (Kniha jízd → Otevřít měsíc).',
      to_char(OLD.entry_date, 'DD. MM. YYYY'), OLD.vehicle_name
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_mesic := to_char(NEW.entry_date, 'YYYY-MM');
    IF EXISTS (
      SELECT 1 FROM public.logbook_closures c
      WHERE c.vehicle_name = NEW.vehicle_name AND c.month = v_mesic
    ) THEN
      RAISE EXCEPTION 'Měsíc % auta % je uzavřený — jízdu do něj nejde přidat ani přesunout. Nejdřív měsíc otevři (Kniha jízd → Otevřít měsíc).',
        v_mesic, NEW.vehicle_name
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logbook_hlida_uzavreny_mesic ON public.logbook_entries;
CREATE TRIGGER trg_logbook_hlida_uzavreny_mesic
  BEFORE INSERT OR UPDATE OR DELETE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_hlida_uzavreny_mesic();

-- 5) Uzavření měsíce ----------------------------------------------------------
-- Appka spočítá rozpočítání (src/lib/knihaJizdUzaverka.ts) a pošle řádky
-- p_radky = [{id, poradi, km_trasa, km_dorovnani, km_driven, km_start, km_end}].
-- Funkce NEVĚŘÍ, že čísla sedí — přepočítá je:
--  • řádky jsou přesně jízdy auta za měsíc (nic navíc, nic nechybí, žádná dvakrát),
--  • v pořadí podle data, tachometr navazuje: začátek měsíce → jízda za jízdou → konec,
--  • km_driven = km_trasa + km_dorovnani, nic záporného,
--  • součet dorovnání = rozdíl tachometru proti součtu tras,
--  • uzavřený minulý/další měsíc téhož auta na stav navazuje.
-- Až potom zapíše. Čísla jsou v desetinách km, proto tolerance 0,05.
CREATE OR REPLACE FUNCTION public.kniha_jizd_uzavrit_mesic(
  p_vozidlo text,
  p_mesic text,
  p_tachometr_zacatek numeric,
  p_tachometr_konec numeric,
  p_rezim text,
  p_radky jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_od date;
  v_do date;
  v_pocet integer;
  v_pocet_jizd integer;
  v_nenalezeno integer;
  v_ruzne integer;
  v_stav numeric;
  v_datum date;
  v_soucet_trasy numeric := 0;
  v_soucet_dorovnani numeric := 0;
  v_minuly numeric;
  v_nasledny numeric;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.user_can_edit_module('kniha_jizd') THEN
    RAISE EXCEPTION 'Na úpravy Knihy jízd nemáš oprávnění.' USING ERRCODE = 'P0001';
  END IF;
  IF p_vozidlo IS NULL OR btrim(p_vozidlo) = '' THEN
    RAISE EXCEPTION 'Chybí vozidlo.' USING ERRCODE = 'P0001';
  END IF;
  IF p_mesic IS NULL OR p_mesic !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Měsíc musí být ve tvaru RRRR-MM.' USING ERRCODE = 'P0001';
  END IF;
  IF p_rezim IS NULL OR p_rezim NOT IN ('rovnomerne', 'umerne') THEN
    RAISE EXCEPTION 'Neznámý způsob dorovnání: %.', COALESCE(p_rezim, '(prázdný)') USING ERRCODE = 'P0001';
  END IF;
  IF p_tachometr_zacatek IS NULL OR p_tachometr_konec IS NULL OR p_tachometr_zacatek < 0 THEN
    RAISE EXCEPTION 'Stav tachometru na začátku i na konci měsíce musí být číslo.' USING ERRCODE = 'P0001';
  END IF;
  IF p_tachometr_konec < p_tachometr_zacatek THEN
    RAISE EXCEPTION 'Stav tachometru na konci měsíce je nižší než na začátku.' USING ERRCODE = 'P0001';
  END IF;
  IF p_radky IS NULL OR jsonb_typeof(p_radky) <> 'array' OR jsonb_array_length(p_radky) = 0 THEN
    RAISE EXCEPTION 'V měsíci nejsou žádné jízdy, není co uzavřít.' USING ERRCODE = 'P0001';
  END IF;

  v_od := (p_mesic || '-01')::date;
  v_do := (v_od + interval '1 month')::date;

  -- Do jízd se po dobu uzavírání nepíše (zámek tabulky; uzavírání je řídké a
  -- rychlé). Bez něj by mohla jízda, kterou někdo zrovna přidává, proklouznout
  -- do měsíce, který se v tu chvíli zamyká. Zámek zároveň srovná dva, kdo by
  -- uzavírali tentýž měsíc naráz.
  LOCK TABLE public.logbook_entries IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.logbook_closures WHERE vehicle_name = p_vozidlo AND month = p_mesic) THEN
    RAISE EXCEPTION 'Měsíc % auta % už je uzavřený.', p_mesic, p_vozidlo USING ERRCODE = 'P0001';
  END IF;

  -- Řádky od appky = přesně jízdy auta za měsíc.
  SELECT count(*),
         count(*) FILTER (WHERE NOT (COALESCE(km_driven, 0) = 0 AND COALESCE(fuel_liters, 0) > 0))
    INTO v_pocet, v_pocet_jizd
  FROM public.logbook_entries
  WHERE vehicle_name = p_vozidlo AND entry_date >= v_od AND entry_date < v_do;

  IF v_pocet_jizd = 0 THEN
    RAISE EXCEPTION 'V měsíci nejsou žádné jízdy, není co uzavřít.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_nenalezeno
  FROM jsonb_to_recordset(p_radky) AS x(id uuid)
  LEFT JOIN public.logbook_entries e
    ON e.id = x.id AND e.vehicle_name = p_vozidlo AND e.entry_date >= v_od AND e.entry_date < v_do
  WHERE e.id IS NULL;

  SELECT count(DISTINCT x.id) INTO v_ruzne FROM jsonb_to_recordset(p_radky) AS x(id uuid);

  IF v_pocet <> jsonb_array_length(p_radky) OR v_nenalezeno > 0 OR v_ruzne <> v_pocet THEN
    RAISE EXCEPTION 'Jízdy měsíce se mezitím změnily (někdo je přidal, smazal nebo přesunul). Načti Knihu jízd znovu a měsíc uzavři ještě jednou.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tachometr jízdu po jízdě.
  v_stav := p_tachometr_zacatek;
  v_datum := v_od;
  FOR r IN
    SELECT x.id, x.poradi, x.km_trasa, x.km_dorovnani, x.km_driven, x.km_start, x.km_end, e.entry_date
    FROM jsonb_to_recordset(p_radky)
      AS x(id uuid, poradi integer, km_trasa numeric, km_dorovnani numeric, km_driven numeric, km_start numeric, km_end numeric)
    JOIN public.logbook_entries e ON e.id = x.id
    ORDER BY x.poradi, e.entry_date, x.id
  LOOP
    IF r.poradi IS NULL OR r.km_trasa IS NULL OR r.km_dorovnani IS NULL OR r.km_driven IS NULL
       OR r.km_start IS NULL OR r.km_end IS NULL THEN
      RAISE EXCEPTION 'Řádek uzávěrky je neúplný.' USING ERRCODE = 'P0001';
    END IF;
    IF r.entry_date < v_datum THEN
      RAISE EXCEPTION 'Jízdy nejsou seřazené podle data.' USING ERRCODE = 'P0001';
    END IF;
    IF r.km_trasa < 0 OR r.km_driven < 0 THEN
      RAISE EXCEPTION 'Jízda z % by měla záporná km.', to_char(r.entry_date, 'DD. MM. YYYY') USING ERRCODE = 'P0001';
    END IF;
    IF abs(r.km_trasa + r.km_dorovnani - r.km_driven) > 0.05 THEN
      RAISE EXCEPTION 'Jízda z %: ujeté km nejsou součtem trasy a dorovnání.', to_char(r.entry_date, 'DD. MM. YYYY') USING ERRCODE = 'P0001';
    END IF;
    IF abs(r.km_start - v_stav) > 0.05 OR abs(r.km_start + r.km_driven - r.km_end) > 0.05 THEN
      RAISE EXCEPTION 'Jízda z %: tachometr nenavazuje na předchozí jízdu.', to_char(r.entry_date, 'DD. MM. YYYY') USING ERRCODE = 'P0001';
    END IF;
    v_stav := r.km_end;
    v_datum := r.entry_date;
    v_soucet_trasy := v_soucet_trasy + r.km_trasa;
    v_soucet_dorovnani := v_soucet_dorovnani + r.km_dorovnani;
  END LOOP;

  IF abs(v_stav - p_tachometr_konec) > 0.05 THEN
    RAISE EXCEPTION 'Poslední jízda končí na % km, měsíc má končit na % km.', v_stav, p_tachometr_konec USING ERRCODE = 'P0001';
  END IF;
  IF abs(v_soucet_trasy + v_soucet_dorovnani - (p_tachometr_konec - p_tachometr_zacatek)) > 0.05 THEN
    RAISE EXCEPTION 'Součet dorovnání neodpovídá rozdílu tachometru.' USING ERRCODE = 'P0001';
  END IF;

  -- Navázání na už uzavřené sousední měsíce téhož auta.
  SELECT c.km_end INTO v_minuly FROM public.logbook_closures c
  WHERE c.vehicle_name = p_vozidlo AND c.month = to_char(v_od - interval '1 month', 'YYYY-MM');
  IF FOUND AND abs(v_minuly - p_tachometr_zacatek) > 0.05 THEN
    RAISE EXCEPTION 'Uzavřený minulý měsíc končí na % km, tento měsíc ale začíná na % km — musí navazovat.', v_minuly, p_tachometr_zacatek
      USING ERRCODE = 'P0001';
  END IF;
  SELECT c.km_start INTO v_nasledny FROM public.logbook_closures c
  WHERE c.vehicle_name = p_vozidlo AND c.month = to_char(v_od + interval '1 month', 'YYYY-MM');
  IF FOUND AND abs(v_nasledny - p_tachometr_konec) > 0.05 THEN
    RAISE EXCEPTION 'Uzavřený další měsíc začíná na % km, tento měsíc ale končí na % km — musí navazovat.', v_nasledny, p_tachometr_konec
      USING ERRCODE = 'P0001';
  END IF;

  -- Zápis: jízdy dostanou nové km a zámek, měsíc záznam o uzavření.
  PERFORM set_config('app.logbook_uzavirani', '1', true);

  UPDATE public.logbook_entries e
  SET km_start = x.km_start,
      km_end = x.km_end,
      km_driven = x.km_driven,
      km_trasa = x.km_trasa,
      km_dorovnani = x.km_dorovnani,
      uzavreno_at = now(),
      uzavreno_by = auth.uid()
  FROM jsonb_to_recordset(p_radky)
    AS x(id uuid, km_trasa numeric, km_dorovnani numeric, km_driven numeric, km_start numeric, km_end numeric)
  WHERE e.id = x.id;

  INSERT INTO public.logbook_closures (
    vehicle_name, month, km_start, km_end, km_trasa, km_dorovnani, rezim, pocet_jizd, closed_by
  ) VALUES (
    p_vozidlo, p_mesic, p_tachometr_zacatek, p_tachometr_konec,
    v_soucet_trasy, v_soucet_dorovnani, p_rezim, v_pocet_jizd, auth.uid()
  );

  PERFORM set_config('app.logbook_uzavirani', '', true);
  RETURN v_pocet;
END;
$$;

REVOKE ALL ON FUNCTION public.kniha_jizd_uzavrit_mesic(text, text, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kniha_jizd_uzavrit_mesic(text, text, numeric, numeric, text, jsonb) TO authenticated;

-- 6) Otevření měsíce ----------------------------------------------------------
-- Jen admin/šéf/sládek/manažer (is_admin_tier_role) — uzávěrka je rozhodnutí,
-- ke kterému se nikdo nevrací jen tak. Jízdy si nechají km, jak je uzávěrka
-- zapsala (km_trasa zůstává základem pro další uzavření); odemkne se jen
-- jejich úprava a mazání.
CREATE OR REPLACE FUNCTION public.kniha_jizd_otevrit_mesic(p_vozidlo text, p_mesic text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_od date;
  v_do date;
  v_pocet integer;
  v_zaznam integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_admin_tier_role() THEN
    RAISE EXCEPTION 'Uzavřený měsíc smí otevřít jen admin, šéf, sládek nebo manažer.' USING ERRCODE = 'P0001';
  END IF;
  IF p_vozidlo IS NULL OR btrim(p_vozidlo) = '' OR p_mesic IS NULL OR p_mesic !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Chybí vozidlo nebo měsíc (RRRR-MM).' USING ERRCODE = 'P0001';
  END IF;

  v_od := (p_mesic || '-01')::date;
  v_do := (v_od + interval '1 month')::date;

  LOCK TABLE public.logbook_entries IN SHARE ROW EXCLUSIVE MODE;
  PERFORM set_config('app.logbook_uzavirani', '1', true);

  UPDATE public.logbook_entries
  SET uzavreno_at = NULL, uzavreno_by = NULL
  WHERE vehicle_name = p_vozidlo AND entry_date >= v_od AND entry_date < v_do AND uzavreno_at IS NOT NULL;
  GET DIAGNOSTICS v_pocet = ROW_COUNT;

  DELETE FROM public.logbook_closures WHERE vehicle_name = p_vozidlo AND month = p_mesic;
  GET DIAGNOSTICS v_zaznam = ROW_COUNT;

  PERFORM set_config('app.logbook_uzavirani', '', true);

  IF v_pocet = 0 AND v_zaznam = 0 THEN
    RAISE EXCEPTION 'Měsíc % auta % není uzavřený.', p_mesic, p_vozidlo USING ERRCODE = 'P0001';
  END IF;
  RETURN v_pocet;
END;
$$;

REVOKE ALL ON FUNCTION public.kniha_jizd_otevrit_mesic(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kniha_jizd_otevrit_mesic(text, text) TO authenticated;

-- 7) Atomické uložení dávky změn jízd --------------------------------------------
-- Přidání jízdy doprostřed měsíce, úprava nebo smazání posouvá tachometr všech
-- pozdějších jízd (src/lib/knihaJizdRetez.ts). To jsou desítky řádků najednou —
-- kdyby se ukládaly po jednom a uprostřed vypadlo spojení, zůstala by řada
-- napůl. Tahle funkce smaže, upraví a vloží všechno v JEDNÉ transakci: buď se
-- uloží celá dávka, nebo nic. Platí pro ni zámek měsíce i práva jako při
-- zápisu přímo (SECURITY INVOKER = běží s právy volajícího, ne obejitím).
--
-- p_smazat  = id jízd ke smazání,
-- p_upravit = [{id, <sloupce ke změně>}] — mění se jen sloupce, které jsou uvedené,
-- p_vlozit  = [{id?, entry_date, vehicle_name, driver, route_from, route_to, purpose, km_start, km_end, km_driven, …}].
-- Pořadí uvnitř: nejdřív smazat, pak upravit, nakonec vložit (nahrazení
-- vygenerovaných jízd = smazat staré + vložit nové v jednom kroku).
CREATE OR REPLACE FUNCTION public.kniha_jizd_uloz_davku(
  p_smazat uuid[] DEFAULT '{}',
  p_upravit jsonb DEFAULT '[]'::jsonb,
  p_vlozit jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_smazat uuid[];
  v_smazano integer := 0;
  v_upraveno integer := 0;
  v_vlozeno integer := 0;
  v_pocet integer;
  v_povolene text[] := ARRAY['id', 'entry_date', 'vehicle_id', 'vehicle_name', 'driver', 'route_from', 'route_to',
                              'purpose', 'km_start', 'km_end', 'km_driven', 'km_trasa', 'km_dorovnani', 'fuel_liters', 'note'];
  v_ids_vlozene uuid[];
  r jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.user_can_edit_module('kniha_jizd') THEN
    RAISE EXCEPTION 'Na úpravy Knihy jízd nemáš oprávnění.' USING ERRCODE = 'P0001';
  END IF;
  IF p_upravit IS NULL OR jsonb_typeof(p_upravit) <> 'array' OR p_vlozit IS NULL OR jsonb_typeof(p_vlozit) <> 'array' THEN
    RAISE EXCEPTION 'Úpravy a nové jízdy musí být seznam.' USING ERRCODE = 'P0001';
  END IF;

  v_smazat := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_smazat, '{}'::uuid[])) AS x WHERE x IS NOT NULL);

  IF cardinality(v_smazat) + jsonb_array_length(p_upravit) + jsonb_array_length(p_vlozit) = 0 THEN
    RETURN jsonb_build_object('smazano', 0, 'upraveno', 0, 'vlozeno', 0);
  END IF;
  IF cardinality(v_smazat) + jsonb_array_length(p_upravit) + jsonb_array_length(p_vlozit) > 600 THEN
    RAISE EXCEPTION 'Dávka je příliš velká (nejvíc 600 jízd najednou).' USING ERRCODE = 'P0001';
  END IF;

  -- Tvar vstupu: samé objekty a jen známé sloupce (překlep v názvu by se jinak tiše ignoroval).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_upravit) e WHERE jsonb_typeof(e) <> 'object')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_vlozit) e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'Každá jízda v dávce musí být objekt.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (SELECT e FROM jsonb_array_elements(p_upravit) e UNION ALL SELECT e FROM jsonb_array_elements(p_vlozit) e) z,
         LATERAL jsonb_object_keys(z.e) k
    WHERE k <> ALL (v_povolene)
  ) THEN
    RAISE EXCEPTION 'Dávka obsahuje sloupec, který se takhle měnit nesmí.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_upravit) e WHERE NOT (e ? 'id') OR NULLIF(e->>'id', '') IS NULL) THEN
    RAISE EXCEPTION 'Úprava jízdy nemá id.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_upravit) e) <> jsonb_array_length(p_upravit) THEN
    RAISE EXCEPTION 'Jedna jízda je v dávce upravovaná víckrát.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_upravit) e WHERE (e->>'id')::uuid = ANY (v_smazat)
  ) THEN
    RAISE EXCEPTION 'Jedna jízda je v dávce zároveň mazaná a upravovaná.' USING ERRCODE = 'P0001';
  END IF;

  -- 1) smazat
  IF cardinality(v_smazat) > 0 THEN
    DELETE FROM public.logbook_entries WHERE id = ANY (v_smazat);
    GET DIAGNOSTICS v_smazano = ROW_COUNT;
    IF v_smazano <> cardinality(v_smazat) THEN
      RAISE EXCEPTION 'Smazat se podařilo jen % z % jízd — ostatní už neexistují nebo na ně nemáš oprávnění. Nic se neuložilo.',
        v_smazano, cardinality(v_smazat) USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2) upravit (jen uvedené sloupce)
  FOR r IN SELECT e FROM jsonb_array_elements(p_upravit) e LOOP
    UPDATE public.logbook_entries t
    SET entry_date   = CASE WHEN r ? 'entry_date'   THEN (r->>'entry_date')::date   ELSE t.entry_date END,
        vehicle_id   = CASE WHEN r ? 'vehicle_id'   THEN (r->>'vehicle_id')::uuid   ELSE t.vehicle_id END,
        vehicle_name = CASE WHEN r ? 'vehicle_name' THEN r->>'vehicle_name'         ELSE t.vehicle_name END,
        driver       = CASE WHEN r ? 'driver'       THEN r->>'driver'               ELSE t.driver END,
        route_from   = CASE WHEN r ? 'route_from'   THEN r->>'route_from'           ELSE t.route_from END,
        route_to     = CASE WHEN r ? 'route_to'     THEN r->>'route_to'             ELSE t.route_to END,
        purpose      = CASE WHEN r ? 'purpose'      THEN r->>'purpose'              ELSE t.purpose END,
        km_start     = CASE WHEN r ? 'km_start'     THEN (r->>'km_start')::numeric  ELSE t.km_start END,
        km_end       = CASE WHEN r ? 'km_end'       THEN (r->>'km_end')::numeric    ELSE t.km_end END,
        km_driven    = CASE WHEN r ? 'km_driven'    THEN (r->>'km_driven')::numeric ELSE t.km_driven END,
        km_trasa     = CASE WHEN r ? 'km_trasa'     THEN (r->>'km_trasa')::numeric  ELSE t.km_trasa END,
        km_dorovnani = CASE WHEN r ? 'km_dorovnani' THEN COALESCE((r->>'km_dorovnani')::numeric, 0) ELSE t.km_dorovnani END,
        fuel_liters  = CASE WHEN r ? 'fuel_liters'  THEN (r->>'fuel_liters')::numeric ELSE t.fuel_liters END,
        note         = CASE WHEN r ? 'note'         THEN r->>'note'                 ELSE t.note END
    WHERE t.id = (r->>'id')::uuid;
    GET DIAGNOSTICS v_pocet = ROW_COUNT;
    IF v_pocet <> 1 THEN
      RAISE EXCEPTION 'Jízdu % se nepodařilo upravit — už neexistuje nebo na ni nemáš oprávnění. Nic se neuložilo.', r->>'id'
        USING ERRCODE = 'P0001';
    END IF;
    v_upraveno := v_upraveno + 1;

    -- Sahá-li úprava na tachometr, musí zůstat konec = začátek + ujeto.
    IF r ?| ARRAY['km_start', 'km_end', 'km_driven'] THEN
      IF EXISTS (
        SELECT 1 FROM public.logbook_entries t
        WHERE t.id = (r->>'id')::uuid
          AND (t.km_start < 0 OR t.km_driven < 0 OR t.km_end < t.km_start OR abs(t.km_start + t.km_driven - t.km_end) > 0.05)
      ) THEN
        RAISE EXCEPTION 'Jízda % má nesmyslný tachometr (konec není začátek + ujeté km). Nic se neuložilo.', r->>'id'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  -- 3) vložit
  IF jsonb_array_length(p_vlozit) > 0 THEN
    WITH vlozeno AS (
      INSERT INTO public.logbook_entries (
        id, entry_date, vehicle_id, vehicle_name, driver, route_from, route_to, purpose,
        km_start, km_end, km_driven, km_trasa, km_dorovnani, fuel_liters, note, created_by
      )
      SELECT COALESCE(x.id, gen_random_uuid()), x.entry_date, x.vehicle_id, x.vehicle_name, x.driver, x.route_from, x.route_to, x.purpose,
             COALESCE(x.km_start, 0), COALESCE(x.km_end, 0), COALESCE(x.km_driven, 0), x.km_trasa, COALESCE(x.km_dorovnani, 0),
             x.fuel_liters, x.note, auth.uid()
      FROM jsonb_to_recordset(p_vlozit) AS x(
        id uuid, entry_date date, vehicle_id uuid, vehicle_name text, driver text, route_from text, route_to text, purpose text,
        km_start numeric, km_end numeric, km_driven numeric, km_trasa numeric, km_dorovnani numeric, fuel_liters numeric, note text
      )
      RETURNING id
    )
    SELECT array_agg(id) INTO v_ids_vlozene FROM vlozeno;
    v_vlozeno := COALESCE(cardinality(v_ids_vlozene), 0);

    IF EXISTS (
      SELECT 1 FROM public.logbook_entries t
      WHERE t.id = ANY (v_ids_vlozene)
        AND (t.km_start < 0 OR t.km_driven < 0 OR t.km_end < t.km_start OR abs(t.km_start + t.km_driven - t.km_end) > 0.05)
    ) THEN
      RAISE EXCEPTION 'Některá nová jízda má nesmyslný tachometr (konec není začátek + ujeté km). Nic se neuložilo.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object('smazano', v_smazano, 'upraveno', v_upraveno, 'vlozeno', v_vlozeno);
END;
$$;

COMMENT ON FUNCTION public.kniha_jizd_uloz_davku(uuid[], jsonb, jsonb) IS
  'Smaže, upraví a vloží jízdy Knihy jízd v jedné transakci (buď celá dávka, nebo nic). Běží s právy volajícího — platí RLS i zámek uzavřeného měsíce.';

REVOKE ALL ON FUNCTION public.kniha_jizd_uloz_davku(uuid[], jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kniha_jizd_uloz_davku(uuid[], jsonb, jsonb) TO authenticated;
