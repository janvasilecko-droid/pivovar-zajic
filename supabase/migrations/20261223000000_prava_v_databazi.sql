-- Prava plati i v DATABAZI, nejen v aplikaci.
--
-- Aplikace ma propracovana prava (kdo smi do Skladu, kdo do Ceniku), ale
-- databaze je nevynucovala: u 34 z 61 tabulek smel kdokoli prihlaseny mazat a
-- menit cokoli. Kdo nemel pravo na Cenik, ho presto mohl prepsat — stacil
-- jiny klient nez appka. Nebyla to dira pro cizi lidi (bez prihlaseni se
-- dovnitr nikdo nedostane), ale nastavena prava davala falesnou jistotu a
-- jedna chyba v kodu mohla smazat data, kterych se dany clovek nemel dotknout.
--
-- PROC JE TO BEZPECNE PUSTIT: public.user_can_edit_module() je zamerne
-- FAIL-OPEN — vraci true, kdyz uzivatel nema profil, nema nastavena prava,
-- je admin, modul v pravech chybi, nebo kdyz cokoli selze. Utazeni tedy
-- NIKOHO neomezi, dokud mu admin pravo vyslovne neodebere. V dobe teto
-- migrace nema explicitni prava nastavena ani jeden ze dvou uctu.
--
-- Ctecí politiky (SELECT) se NEMENI: data jsou v pivovaru sdilena a skryvat
-- je pred nekym, kdo je v appce stejne vidi, by nedavalo smysl.

DO $$
DECLARE
  -- Tabulka -> modul opravneni. Mapovani vychazi z PAGE_TO_MODULE
  -- (src/lib/permissions.ts): tabulka patri pod tentyz modul jako obrazovka,
  -- ktera do ni zapisuje.
  mapa CONSTANT jsonb := jsonb_build_object(
    'akce', 'akce',
    'akce_items', 'akce',
    'beers', 'catalogs',
    'packages', 'catalogs',
    'places', 'catalogs',
    'vehicles', 'catalogs',
    'parser_aliases', 'catalogs',
    'place_aliases', 'catalogs',
    'bottle_sanitation_logs', 'haccp',
    'keg_sanitation_logs', 'haccp',
    'tap_sanitation_logs', 'haccp',
    'sanitation_logs', 'haccp',
    'bottling_line_maintenance_tasks', 'haccp',
    'bottling', 'entry',
    'bottling_plans', 'entry',
    'fasovani', 'entry',
    'fasovani_private', 'entry',
    'writeoffs', 'entry',
    'cellar_tank_cycles', 'cellar',
    'calendar_events', 'reminders',
    'reminders', 'reminders',
    'label_purchases', 'sklo_promo',
    'logbook_entries', 'kniha_jizd',
    'orders', 'orders',
    'order_items', 'orders',
    'price_list', 'pricelist',
    'srotovani', 'srotovani'
  );
  tabulka text;
  modul text;
  politika record;
BEGIN
  FOR tabulka, modul IN SELECT key, value #>> '{}' FROM jsonb_each(mapa) LOOP
    -- Tabulka nemusi existovat (starsi/novejsi schema) — preskocit misto padu.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tabulka AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'Tabulka % neexistuje, preskakuji.', tabulka;
      CONTINUE;
    END IF;

    -- Zrusit stavajici ZAPISOVE politiky. Nazvy se lisi tabulku od tabulky
    -- (vznikaly postupne), proto se hledaji dotazem, ne hadanim. SELECT se
    -- nedotykame.
    FOR politika IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tabulka
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', politika.policyname, tabulka);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module(%L))',
      'perm_insert_' || tabulka, tabulka, modul);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_edit_module(%L)) WITH CHECK (public.user_can_edit_module(%L))',
      'perm_update_' || tabulka, tabulka, modul, modul);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_edit_module(%L))',
      'perm_delete_' || tabulka, tabulka, modul);
  END LOOP;
END $$;

-- ── Co zustava ZAMERNE otevrene ────────────────────────────────────────────
--
--  • audit_log            — zaznam o tom, kdo co udelal. Kdyby ho smel
--                           zapsat jen nekdo, prestal by byt duveryhodny
--                           prave u lidi, u kterych na nem zalezi.
--  • whatsapp_prijem_log  — plni je webhook / edge funkce servisnim klicem,
--  • whatsapp_rejected      ktery RLS obchazi; omezeni by nic nechranilo.
--  • sdilene_poznamky     — vzkaz smene neni agenda jednoho modulu; kdo
--                           nesmi do Skladu, porad musi umet napsat
--                           „dosly korunky".
--  • notes                — sdilena nastenka, stejny duvod.
--  • zadavani             — v kodu appky se na ni uz nikdo neodkazuje
--  • kegging_tanks          (jen seznamy pro zalohu/mazani lokalnich dat).
--                           Utahovat mrtvou tabulku nema smysl; az se ukaze,
--                           jestli je jeste k necemu, patri sem taky.
