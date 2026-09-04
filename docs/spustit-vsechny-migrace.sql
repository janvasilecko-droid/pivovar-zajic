-- ============================================================================
-- VSECHNY CEKAJICI MIGRACE V JEDNOM (Pivovar Zajic)
--
-- Vygenerovano 4. 9. 2026. Obsahuje 8 migraci, ktere na produkci jeste
-- nikdo nepustil, ve spravnem poradi.
--
-- JAK NA TO (staci telefon):
--   1. supabase.com -> prihlasit -> projekt pivovaru
--   2. vlevo "SQL Editor" -> "New query"
--   3. vlozit CELY tenhle soubor
--   4. "Run"
--
-- Pustit se to da i opakovane: vsechno je psane jako CREATE TABLE IF NOT
-- EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING, takze druhy beh
-- nic nerozbije ani nezdvoji.
--
-- Poradi neni podle abecedy: evidence migraci je prvni schvalne, aby si do
-- ni ty dalsi mohly zapsat, ze probehly.
--
-- Po dobehnuti zkontroluj v appce: Nastaveni -> Diagnostika -> "migrace
-- cekaji" ma byt prazdne.
-- ============================================================================



-- ############################################################################
-- # 1/8  20261227010000_evidence_migraci.sql
-- ############################################################################

-- Evidence aplikovanych migraci.
--
-- Soubory v supabase/migrations/ nerikaji NIC o tom, co na produkci
-- doopravdy bezi. Migrace se pousti rucne (scripts/apply-migration.mjs)
-- a jestli uz nekdo dany soubor pustil, se pozna jen tim, ze se aplikace
-- chova jinak, nez by mela — nebo tim, ze SQL spadne na "already exists".
-- Kvuli tomu tu dva dny cekaly dve migrace a nikdo o tom nevedel.
--
-- Tabulka je zamerne co nejjednodussi: nazev souboru a kdy se pustil.
-- Zadny hash obsahu, zadne verzovani schematu — cokoliv slozitejsiho by
-- se rozeslo se skutecnosti pri prvni rucne pustene migraci.
--
-- POZOR NA JEDNU VEC: migrace pustene PRED zavedenim teto tabulky v ni
-- nejsou a doplnit se poctive nedaji (nikdo nevi, kdy se pustily).
-- Aplikace je proto neukazuje jako "chybi", ale jako "starsi nez
-- evidence" — lhat o tom, co je aplikovane, je horsi nez to nevedet.

CREATE TABLE IF NOT EXISTS public.migrace_aplikovane (
  -- Jmeno souboru vcetne casove predpony, presne jak je v repozitari.
  nazev text PRIMARY KEY,
  aplikovano_at timestamptz NOT NULL DEFAULT now(),
  -- Kdo/co migraci pustilo: 'apply-migration.mjs', 'supabase-studio', ...
  zdroj text,
  poznamka text
);

CREATE INDEX IF NOT EXISTS migrace_aplikovane_cas_idx
  ON public.migrace_aplikovane (aplikovano_at DESC);

ALTER TABLE public.migrace_aplikovane ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_migrace" ON public.migrace_aplikovane;
CREATE POLICY "auth_read_migrace" ON public.migrace_aplikovane
  FOR SELECT TO authenticated USING (true);

-- Zapisuje jen servisni klic (skript s tokenem). Z prohlizece se do evidence
-- migraci zapisovat nema — byla by to jen dalsi cesta, jak si ji rozejit
-- se skutecnosti.
DROP POLICY IF EXISTS "service_write_migrace" ON public.migrace_aplikovane;
CREATE POLICY "service_write_migrace" ON public.migrace_aplikovane
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tahle migrace se zapise sama — je prvni v evidenci a zaroven hranice,
-- od ktere ma evidence smysl.
INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261227010000_evidence_migraci.sql', 'migrace sama', 'zacatek evidence')
ON CONFLICT (nazev) DO NOTHING;


-- ############################################################################
-- # 2/8  20261226070000_tydenni_inventura.sql
-- ############################################################################

-- Tydenni inventura — evidence toho, ze se v danem tydnu opravdu pocitalo.
--
-- PROC SAMOSTATNA TABULKA A NE RADKY DO `inventory`:
-- Radek v `inventory` je podle skladove knihy (src/lib/stockLedger.ts) RESET —
-- k jeho datu se stav ROVNA zapsanemu mnozstvi a starsi pohyby uz do vysledku
-- nevstupuji. Tydenni pocitani ulozene tudy by tedy kazdy rozdil TICHE
-- SPOLKLO: cislo by po ulozeni sedelo, ale staceni KEG, staceni lahvi ani
-- sklad by o nem nevedely. Presne to uzivatel oznacil za spatne — „nemuze se
-- to propsat jen v jedny tabulce a nikde ne".
--
-- Tydenni inventura proto zadny reset nezapisuje. Rozdil se propise TAM, KDE
-- VZNIKL — prebytek jako chybejici zapis staceni, manko jako zaporny radek ve
-- staceni (viz src/lib/inventoryFix.ts) — takze ho uvidi vsechny obrazovky
-- naraz, protoze ctou tytez tabulky. Do teto tabulky jde jen ZAZNAM O
-- KONTROLE: co se ten tyden napocitalo, co se cekalo a jak se rozdil vyresil.
--
-- K cemu to je:
--   • dohledatelnost — po tydnech je videt, kde se rozdil vzal a kdo ho resil,
--   • hloubkovy audit se muze zeptat „byl tenhle tyden zkontrolovany?",
--   • mesicni uzaverka zustava netknuta, tydenni kontrola do ni nesaha.

CREATE TABLE IF NOT EXISTS public.tydenni_inventura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pondeli a nedele kontrolovaneho tydne (ISO tyden).
  tyden_od date NOT NULL,
  tyden_do date NOT NULL,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  package_label text,
  -- Co sklad cekal ke konci tydne (stockForObdobi) a co se fyzicky naslo.
  ocekavano numeric NOT NULL DEFAULT 0,
  napocitano numeric NOT NULL DEFAULT 0,
  -- napocitano − ocekavano. Kladne = prebytek, zaporne = manko.
  rozdil numeric NOT NULL DEFAULT 0,
  -- Jak se rozdil vyresil:
  --   'staceni'    — propsal se do bottling/kegging (prebytek i manko),
  --   'dorovnani'  — sel do inventory_adjustments (nesouvisi s vyrobou),
  --   'ponechano'  — necha se na mesicni uzaverku,
  --   NULL         — jen se spocitalo, jeste se nerozhodlo.
  vyreseno text CHECK (vyreseno IN ('staceni', 'dorovnani', 'ponechano')),
  poznamka text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jedno pivo × obal ma v jednom tydnu jediny radek. Opakovane ulozeni tehoz
-- tydne tedy prepisuje, misto aby vyrabelo druhou verzi pravdy.
CREATE UNIQUE INDEX IF NOT EXISTS tydenni_inventura_klic_idx
  ON public.tydenni_inventura (tyden_od, beer_id, package_id);

CREATE INDEX IF NOT EXISTS tydenni_inventura_tyden_idx
  ON public.tydenni_inventura (tyden_od DESC);

ALTER TABLE public.tydenni_inventura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tydenni_inventura_select ON public.tydenni_inventura;
CREATE POLICY tydenni_inventura_select ON public.tydenni_inventura
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_insert_tydenni_inventura ON public.tydenni_inventura
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('inventory'));

DROP POLICY IF EXISTS perm_update_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_update_tydenni_inventura ON public.tydenni_inventura
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('inventory'))
  WITH CHECK (public.user_can_edit_module('inventory'));

DROP POLICY IF EXISTS perm_delete_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_delete_tydenni_inventura ON public.tydenni_inventura
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('inventory'));


-- ############################################################################
-- # 3/8  20261226080000_whatsapp_vlastni_zpravy_uz_neobchazi_branu.sql
-- ############################################################################

-- 🔒 Vlastní zprávy (from_me) přestávají obcházet whitelist.
--
-- Do aplikace se nahrály VŠECHNY zprávy majitele — včetně čistě soukromých
-- konverzací, které pak v provozním systému viděli všichni, kdo do něj mají
-- přístup. Příčinou byla výjimka hned na začátku téhle funkce: `IF NEW.from_me
-- THEN RETURN NEW`, tedy „co si majitel napíše, projde vždy a odkudkoliv".
--
-- Výjimka měla řešit objednávku napsanou z vlastního telefonu do objednávkové
-- skupiny. Na to ale žádná není potřeba: skupina je ve `whatsapp_senders`
-- zapsaná jménem i chat_id, takže vlastní zpráva z ní projde běžnou branou
-- stejně jako zákaznická. Výjimka tedy nepouštěla dál nic, co mělo projít —
-- jen všechno ostatní.
--
-- Příznak `from_me` zůstává a dál se ukládá: aplikace podle něj vlastní
-- zprávu odliší od zákaznické objednávky. Rozhoduje o POPISKU, ne o vstupu.
--
-- Táž změna je provedená i na ostatních třech místech, kde tahle brána žije
-- (pravidla musí zůstat identická, jinak se rozejdou):
--   • whatsapp-bridge/index.js       — filtr čtení na mostu
--   • whatsapp-bridge/lib/filter.js  — soukromá zpráva neprojde na prázdný whitelist
--   • supabase/functions/whatsapp-webhook/index.ts
--   • supabase/functions/whatsapp-auto-parse/index.ts
CREATE OR REPLACE FUNCTION public.check_whatsapp_sender_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- 1) Prázdný seznam = povoleno vše (zpětná kompatibilita). Pozor: tohle je
  --    jediná zbylá cesta, kudy projde neregistrovaný odesílatel — jakmile je
  --    ve `whatsapp_senders` aspoň jeden řádek, platí whitelist na všechny,
  --    majitele nevyjímaje.
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  -- 2) Povoleno podle CHAT_ID (stabilní) NEBO podle názvu (bez diakritiky).
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      NEW.chat_id IS NOT NULL AND btrim(NEW.chat_id) <> ''
      AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
      AND lower(btrim(s.chat_id)) = lower(btrim(NEW.chat_id))
    ) OR (
      NEW.sender_name IS NOT NULL
      AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name)
    )
  ) INTO v_is_allowed;

  IF v_is_allowed THEN
    RETURN NEW;
  END IF;

  -- Zpráva se do objednávek nedostane, ale už nezmizí beze stopy.
  BEGIN
    INSERT INTO public.whatsapp_rejected (sender_name, sender_number, chat_id, message_preview, message_timestamp)
    VALUES (
      NEW.sender_name,
      NEW.sender_number,
      NEW.chat_id,
      left(COALESCE(NEW.message_text, ''), 500),
      NEW.message_timestamp
    );
  EXCEPTION WHEN OTHERS THEN
    -- Zápis do přehledu je pomocný. Kdyby selhal, nesmí to shodit příjem
    -- zpráv — původní chování (zahodit) je pořád lepší než chyba webhooku.
    RAISE NOTICE 'whatsapp_rejected zapis selhal: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON public.whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle chat_id NEBO názvu) a zapíše ji do whatsapp_rejected. Platí i na vlastní zprávy majitele (from_me) — ty branu neobchazeji, jen se odlisi priznakem.';


-- ############################################################################
-- # 4/8  20261227000000_chyby_aplikace.sql
-- ############################################################################

-- Sbirani chyb aplikace.
--
-- Do teto chvile se chyba ukazala uzivateli (ErrorBoundary v main.tsx nebo
-- prazdna obrazovka) a tim to skoncilo — nikam se nezapsala. Rozbita
-- obrazovka se proto poznala jedine tak, ze nekdo zavolal. Pri deseti
-- nasazenich za den je to nejpomalejsi mozna cesta ke zjisteni, ze posledni
-- verze neco pokazila.
--
-- Radek nese verzi aplikace a zarizeni, takze jde rict "pada to jen na
-- verzi 2.208 a jen na Androidu" — presne to, co se pri hledani priciny
-- potrebuje vedet nejdriv.
--
-- CO SE SEM NEUKLADA: nic z obsahu obrazovky. Jen zprava chyby, zacatek
-- stack trace, nazev obrazovky, verze a user agent. Text objednavek,
-- jmena zakazniku ani cisla se do hlaseni nedostanou.

CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Kdo to videl. Muze byt NULL: chyba muze nastat i pred prihlasenim.
  user_id uuid,
  user_email text,
  -- Verze aplikace, ve ktere chyba nastala. Nejdulezitejsi sloupec z celeho
  -- radku: rekne, jestli chybu privezlo posledni nasazeni.
  app_version text,
  -- 'boundary' = zachytil React ErrorBoundary (bila obrazovka),
  -- 'unhandled' = neodchycena vyjimka, 'rejection' = neodchyceny promise.
  druh text NOT NULL DEFAULT 'boundary',
  -- Obrazovka, na ktere se to stalo (page id z Layout.tsx), kdyz je znama.
  obrazovka text,
  zprava text NOT NULL,
  -- Zkraceny stack (prvnich ~4000 znaku). Cely nema cenu: to podstatne je
  -- vzdy na zacatku a dlouhy text by tabulku jen nafoukl.
  stack text,
  user_agent text,
  -- Kolikrat se tataz chyba u tehoz cloveka zopakovala. Klient stejnou chybu
  -- neposila znovu a znovu (viz lib/chybyHlaseni.ts) — jinak by jedna
  -- smycka v renderu vyrobila tisice radku za minutu.
  pocet integer NOT NULL DEFAULT 1,
  -- Odklepnuto adminem = "uz to vim, resim". Radek zustava.
  vyrizeno_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_errors_cas_idx
  ON public.app_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS app_errors_nevyrizene_idx
  ON public.app_errors (created_at DESC)
  WHERE vyrizeno_at IS NULL;

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

-- Cist smi kazdy prihlaseny (v aplikaci to zobrazuje jen admin v Nastaveni),
-- zapisovat taky — hlaseni chyby musi projit i cloveku bez zvlastnich prav,
-- jinak se nedozvime prave o tech chybach, ktere ma on.
DROP POLICY IF EXISTS "auth_read_app_errors" ON public.app_errors;
CREATE POLICY "auth_read_app_errors" ON public.app_errors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_app_errors" ON public.app_errors;
CREATE POLICY "auth_insert_app_errors" ON public.app_errors
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_app_errors" ON public.app_errors;
CREATE POLICY "auth_update_app_errors" ON public.app_errors
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_write_app_errors" ON public.app_errors;
CREATE POLICY "service_write_app_errors" ON public.app_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ############################################################################
-- # 5/8  20261227020000_tank_uprava_jednou.sql
-- ############################################################################

-- Bezpecne OPAKOVANI odectu objemu z tanku.
--
-- PROBLEM: stacenim se objem z tanku odecita zvlast, druhym krokem
-- (RPC adjust_tank_volume) AZ POTOM, co je stoceni zapsane. Kdyz ten druhy
-- krok selze — vypadek site v pivovarskem sklepe je bezna vec — zustane
-- tank nafouknuty o pivo, ktere uz odteklo. Aplikace to rekne
-- ("Oprav objem ve Sklepe rucne") a dal je to na cloveku. Odtud jsou ty
-- velke schodky, kdyz na to nekdo zapomene.
--
-- Chce se to opakovat samo. Jenze adjust_tank_volume je RELATIVNI (prictu
-- delta) a to se opakovat NESMI: kdyz odpoved nedojde, ale server ji uz
-- provedl, druhy pokus odecte objem DVAKRAT. Tise, a pozna se to az na
-- inventure.
--
-- RESENI: klic idempotence. Klient si ke kazdemu odectu vymysli jednorazovy
-- klic a posila ho s sebou. Funkce nejdriv zapise klic do logu — a protoze
-- je klic PRIMARY KEY, druhy pokus se stejnym klicem na zapisu skonci a
-- objem se NEUPRAVI. Odpoved rekne, jestli se to provedlo nebo uz bylo
-- provedeno driv; oboji je pro klienta uspech (fronta polozku zahodi).
--
-- Log zaroven poprve rika, kdy a odkud se objem menil — to se dosud nikde
-- neevidovalo.

CREATE TABLE IF NOT EXISTS public.tank_uprava_log (
  -- Klic si vyrabi klient (uuid). PRIMARY KEY je tady cely mechanismus
  -- ochrany proti dvojimu odectu.
  klic text PRIMARY KEY,
  tank_id uuid NOT NULL,
  delta_l numeric NOT NULL,
  -- Odkud uprava prisla: 'staceni', 'inventura', 'vraceni', 'fronta'.
  zdroj text,
  provedl uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tank_uprava_log_tank_idx
  ON public.tank_uprava_log (tank_id, created_at DESC);

ALTER TABLE public.tank_uprava_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_tank_uprava_log" ON public.tank_uprava_log;
CREATE POLICY "auth_read_tank_uprava_log" ON public.tank_uprava_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_tank_uprava_log" ON public.tank_uprava_log;
CREATE POLICY "service_write_tank_uprava_log" ON public.tank_uprava_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Zapisuje jen funkce nize (SECURITY DEFINER), z klienta se do logu psat
-- nema — jinak by si nekdo mohl "zabrat" klic bez toho, aby se objem
-- upravil, a odecet by se tim nenavratne zahodil.

CREATE OR REPLACE FUNCTION public.adjust_tank_volume_once(
  p_tank_id uuid,
  p_delta_l numeric,
  p_klic text,
  p_zdroj text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_klic IS NULL OR length(p_klic) < 8 THEN
    RAISE EXCEPTION 'Chybi klic idempotence';
  END IF;
  IF p_tank_id IS NULL OR p_delta_l IS NULL OR p_delta_l = 0 THEN
    RETURN 'nic';
  END IF;

  BEGIN
    INSERT INTO public.tank_uprava_log (klic, tank_id, delta_l, zdroj)
    VALUES (p_klic, p_tank_id, p_delta_l, p_zdroj);
  EXCEPTION WHEN unique_violation THEN
    -- Tenhle odecet uz jednou proslo. Objem se NEUPRAVUJE.
    RETURN 'jiz_provedeno';
  END;

  PERFORM public.adjust_tank_volume(p_tank_id, p_delta_l);
  RETURN 'provedeno';
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) TO authenticated;


-- ############################################################################
-- # 6/8  20261228000000_nakupy_obalu_a_zavirek.sql
-- ############################################################################

-- Nakupy prazdnych lahvi a zavirek (korunky, PET vicka).
--
-- Evidence nakupu lahvi zila jen v localStorage prohlizece (klic
-- "bottles_purchases") — presne ta chyba, kterou u etiket resila migrace
-- 20261120000000_add_label_purchases.sql. Dusledky jsou stejne: kazdy
-- telefon vidi jiny stav, po vycisteni dat prohlizece je evidence pryc a
-- kdo zapisoval na jednom zarizeni, ten na druhem nevidi nic.
--
-- Tabulka je schvalne stejneho tvaru jako label_purchases, jen misto
-- beer_name je nazev obalu (volny text: "1.5L", "Korunky 26 mm",
-- "Vicka PET"). Druh zavirky se z nazvu odvozuje v aplikaci
-- (src/lib/materialSklad.ts), ne v databazi — kdyby se pravidlo zmenilo,
-- meni se na jednom miste a data zustanou.
--
-- Prevod stareho localStorage: aplikace pri prvnim otevreni obrazovky
-- nahraje zaznamy z telefonu do tabulky (jednou, oznaci si to) — proto
-- tady zadny INSERT neni. Zaznamy z ruznych telefonu se tim slouci; to
-- je spravne, byly to porad nakupy jednoho pivovaru.

CREATE TABLE IF NOT EXISTS public.obal_nakupy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  -- Nazev obalu nebo zavirky, presne jak ho vybral clovek.
  package_label text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  -- Odkud zaznam prisel: 'obrazovka' nebo 'prevod-z-telefonu'.
  zdroj text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obal_nakupy_obal_idx
  ON public.obal_nakupy (package_label, entry_date DESC);

ALTER TABLE public.obal_nakupy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_read_obal_nakupy" ON public.obal_nakupy
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_insert_obal_nakupy" ON public.obal_nakupy
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_update_obal_nakupy" ON public.obal_nakupy
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_obal_nakupy" ON public.obal_nakupy;
CREATE POLICY "auth_delete_obal_nakupy" ON public.obal_nakupy
  FOR DELETE TO authenticated USING (true);

-- Realtime, at se zapis z jednoho telefonu objevi na druhem.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.obal_nakupy;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'obal_nakupy uz v publikaci: %', SQLERRM;
END $$;

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228000000_nakupy_obalu_a_zavirek.sql', 'migrace sama', 'nakupy lahvi a zavirek do databaze')
ON CONFLICT (nazev) DO NOTHING;


-- ############################################################################
-- # 7/8  20261228020000_fotky_zaznamu.sql
-- ############################################################################

-- Fotka k zapisu (odpis, rozbity sud, zavoz, objednavka).
--
-- K odpisu "zkazene, rozbita lahev" je dnes jedinym dokladem veta v
-- poznamce; po mesici si nikdo nevzpomene, jak to vypadalo, a u
-- reklamace neni co ukazat. Zmensovani obrazku aplikace umi
-- (src/lib/obrazek.ts), chybelo uloziste a policko u zapisu.
--
-- Dve veci schvalne:
--
--  1) Obrazek jde do Storage, do databaze jen CESTA. Radky zapisu se
--     ctou po tisicich a base64 fotka v radku by se stahovala do telefonu
--     pri kazdem nacteni obrazovky.
--  2) Bucket je NEVEREJNY, na rozdil od whatsapp-media (viz
--     20261205000000 — verejny bucket sel anonymne vylistovat). Cte se
--     pres podepsane URL, ktere plati hodinu.

INSERT INTO storage.buckets (id, name, public)
SELECT 'zaznam-fotky', 'zaznam-fotky', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_read" ON storage.objects;
CREATE POLICY "zaznam_fotky_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_insert" ON storage.objects;
CREATE POLICY "zaznam_fotky_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_delete" ON storage.objects;
CREATE POLICY "zaznam_fotky_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'zaznam-fotky');

CREATE TABLE IF NOT EXISTS public.zaznam_fotky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- K cemu fotka patri: 'odpis', 'objednavka', 'sud', 'zavoz'.
  -- Text, ne cizi klic: zapisy zijou v peti ruznych tabulkach a jeden
  -- spolecny cizi klic by na ne stejne neslo navesit.
  typ text NOT NULL,
  zaznam_id text NOT NULL,
  -- Cesta v bucketu zaznam-fotky.
  cesta text NOT NULL,
  popis text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zaznam_fotky_zaznam_idx
  ON public.zaznam_fotky (typ, zaznam_id, created_at DESC);

ALTER TABLE public.zaznam_fotky ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_read_zaznam_fotky" ON public.zaznam_fotky
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_insert_zaznam_fotky" ON public.zaznam_fotky
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_delete_zaznam_fotky" ON public.zaznam_fotky
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228020000_fotky_zaznamu.sql', 'migrace sama', 'fotky k zapisum + neverejny bucket')
ON CONFLICT (nazev) DO NOTHING;


-- ############################################################################
-- # 8/8  20261228030000_push_odbery.sql
-- ############################################################################

-- Odbery push upozorneni (jedno zarizeni = jeden radek).
--
-- Upozorneni v aplikaci (src/lib/notifications.ts) fungujou jen tehdy,
-- kdyz je appka otevrena — takze "prisla objednavka na WhatsApp" nebo
-- "vycep je po terminu" se dozvedel jen ten, kdo se zrovna koukal.
-- Skutecny push potrebuje ulozit zarizeni; odesila edge funkce
-- posli-push.
--
-- Endpoint je primarni klic: prohlizec pro jedno zarizeni vraci porad
-- stejnou adresu, takze opakovane zapnuti radek prepise misto toho, aby
-- se na jeden telefon posilalo petkrat.

CREATE TABLE IF NOT EXISTS public.push_odbery (
  endpoint text PRIMARY KEY,
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- "Android · Chrome" — at je v seznamu poznat, ktery telefon to je.
  zarizeni text,
  -- Posledni chyba pri odesilani. Kdyz push prestane chodit, ma se to
  -- poznat tady, ne z toho, ze nekdo neprisel do prace.
  posledni_chyba text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_odbery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_read_push_odbery" ON public.push_odbery
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_write_push_odbery" ON public.push_odbery
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_update_push_odbery" ON public.push_odbery
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_delete_push_odbery" ON public.push_odbery
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228030000_push_odbery.sql', 'migrace sama', 'odbery push upozorneni')
ON CONFLICT (nazev) DO NOTHING;


-- ############################################################################
-- # Zapis do evidence u migraci, ktere se nezapisuji samy
-- ############################################################################

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES
  ('20261226070000_tydenni_inventura.sql', 'spusteno rucne', 'davka 4. 9. 2026'),
  ('20261226080000_whatsapp_vlastni_zpravy_uz_neobchazi_branu.sql', 'spusteno rucne', 'davka 4. 9. 2026'),
  ('20261227000000_chyby_aplikace.sql', 'spusteno rucne', 'davka 4. 9. 2026'),
  ('20261227020000_tank_uprava_jednou.sql', 'spusteno rucne', 'davka 4. 9. 2026')
ON CONFLICT (nazev) DO NOTHING;

-- Hotovo. Kontrola:
SELECT nazev, aplikovano_at FROM public.migrace_aplikovane ORDER BY nazev;
