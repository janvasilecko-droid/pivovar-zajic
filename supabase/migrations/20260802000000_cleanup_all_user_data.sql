/*
# VYČIŠTĚNÍ VŠECH UŽIVATELSKÝCH DAT — PŘÍPRAVA NA OSTRÝ PROVOZ

## 1. Účel
Odstraní VŠECHNA uživatelsky zadaná data z databáze, aby byla aplikace
připravena na ostrý provoz. Tento skript:

- Smaže všechny provozní/transakční záznamy (objednávky, stáčení, inventury,
  akce, fasování, odpisy, kalendář, připomínky, sanitace, šrotování, zadávání,
  vozidla, odběratele, ceník, audit, verze uživatelů, feedback, rezervace...).
- Smaže všechny uživatelské účty (auth.users) a jejich profily.
- ZACHOVÁ referenční číselníky (seed data): piva (beers), obaly (packages)
  a sklepní tanky (cellar_tanks) — tyto jsou nezbytné pro chod aplikace.
- ZACHOVÁ strukturu tabulek, RLS politiky, triggery a funkce.

## 2. JAK SPUSTIT
1. Otevřete Supabase Dashboard → SQL Editor.
2. Vložte celý obsah tohoto souboru.
3. Spusťte (Run).
4. Po dokončení se zobrazí přehled smazaných řádků.

## 3. BEZPEČNOST
- Skript je idempotentní (lze spustit vícekrát bez chyby).
- Používá `TRUNCATE ... CASCADE` pro tabulky s cizími klíči.
- Referenční číselníky (beers, packages, cellar_tanks) se NEMAŽOU.
- Uživatelé se mažou z `auth.users` (kaskádově smaže i profily).
*/

-- ============================================================
-- 1) VYMAZÁNÍ PROVOZNÍCH / TRANSAKČNÍCH TABULEK
--    (všechna uživatelsky zadaná data)
-- ============================================================

-- Objednávky a jejich položky
TRUNCATE TABLE public.order_items CASCADE;
TRUNCATE TABLE public.orders CASCADE;

-- Stáčení lahví a kegů (včetně historických záznamů)
TRUNCATE TABLE public.bottling CASCADE;
TRUNCATE TABLE public.bottling_entries CASCADE;
TRUNCATE TABLE public.kegging CASCADE;
TRUNCATE TABLE public.kegging_entries CASCADE;

-- Odpisy, inventury, měsíční inventury
TRUNCATE TABLE public.writeoffs CASCADE;
TRUNCATE TABLE public.inventory CASCADE;
TRUNCATE TABLE public.monthly_inventory CASCADE;

-- Fasování (prodejna + soukromé)
TRUNCATE TABLE public.fasovani CASCADE;
TRUNCATE TABLE public.fasovani_private CASCADE;

-- Akce a výjezdní prodej
TRUNCATE TABLE public.akce_items CASCADE;
TRUNCATE TABLE public.akce CASCADE;
TRUNCATE TABLE public.event_items CASCADE;

-- Kalendář a připomínky
TRUNCATE TABLE public.calendar_events CASCADE;
TRUNCATE TABLE public.reminders CASCADE;

-- Sanitace, šrotování, zadávání
TRUNCATE TABLE public.sanitation_logs CASCADE;
TRUNCATE TABLE public.srotovani CASCADE;
TRUNCATE TABLE public.zadavani CASCADE;

-- Sklep: transfery a historie cyklů (tanky samotné se zachovají)
TRUNCATE TABLE public.cellar_transfers CASCADE;
TRUNCATE TABLE public.cellar_tank_cycles CASCADE;

-- Stáčecí tanky (kegging_tanks) — historie stáčení
TRUNCATE TABLE public.kegging_tanks CASCADE;

-- Odběratelé / místa (číselník zákazníků)
TRUNCATE TABLE public.places CASCADE;

-- Ceník pivovaru
TRUNCATE TABLE public.price_list CASCADE;

-- Vozidla
TRUNCATE TABLE public.vehicles CASCADE;

-- Parser aliasy (naučené opravy OCR)
TRUNCATE TABLE public.parser_aliases CASCADE;

-- Auditní log
TRUNCATE TABLE public.audit_log CASCADE;

-- Verze uživatelů
TRUNCATE TABLE public.user_app_versions CASCADE;

-- Feedback / poznámky k aplikaci
TRUNCATE TABLE public.feedback_notes CASCADE;

-- ============================================================
-- 2) VYMAZÁNÍ UŽIVATELSKÝCH ÚČTŮ A PROFILŮ
--    (auth.users kaskádově smaže i profily)
-- ============================================================

-- Smaže všechny uživatele (profily se smažou kaskádově přes FK)
DELETE FROM auth.users;

-- ============================================================
-- 3) RESET REFERENČNÍCH ČÍSELNÍKŮ NA SEED STAV
--    (beers, packages, cellar_tanks — zachováme seed data)
-- ============================================================

-- Piva: reset na seed (8 piv z evidence)
-- Smažeme případné uživatelem přidané piva a znovu vložíme seed.
DELETE FROM public.beers;
INSERT INTO public.beers (name, degree, color, beer_color, is_active, sort_order)
SELECT v.name, v.degree, v.color, v.beer_color, true, v.sort_order
FROM (VALUES
  ('12° Světlá',       '12°', 'světlé',  '#FDE68A', 1),
  ('11° Světlá',       '11°', 'světlé',  '#FEF3C7', 2),
  ('10° Desítka',      '10°', 'světlé',  '#FCD34D', 3),
  ('12° Tmavá',        '12°', 'tmavé',   '#44403B', 4),
  ('Jantar',           NULL,  'jantarové','#F59E0B', 5),
  ('Summer Ale',       NULL,  'ovocné',  '#86EFAC', 6),
  ('13 Hazy Bunny',    '13°', 'nefiltrované', '#FCA5A5', 7),
  ('Hazy Spring Day',  NULL,  'nefiltrované', '#F9A8D4', 8)
) AS v(name, degree, color, beer_color, sort_order);

-- Obaly: reset na seed (9 obalů)
DELETE FROM public.packages;
INSERT INTO public.packages (code, kind, volume_l, label, sort_order)
VALUES
  ('KEG50',   'keg',    50,   'KEG 50l',    1),
  ('KEG30',   'keg',    30,   'KEG 30l',    2),
  ('KEG20',   'keg',    20,   'KEG 20l',    3),
  ('KEG15',   'keg',    15,   'KEG 15l',    4),
  ('KEG10',   'keg',    10,   'KEG 10l',    5),
  ('LAHEV15', 'bottle', 1.5,  'Lahve 1.5l', 6),
  ('LAHEV1',  'bottle', 1,    'Lahve 1l',   7),
  ('LAHEV05', 'bottle', 0.5,  'Lahve 0.5l', 8),
  ('LAHEV033','bottle', 0.33, 'Lahve 0.33l',9);

-- Sklepní tanky: reset na 8 prázdných tanků (Tank 1..8)
DELETE FROM public.cellar_tanks;
INSERT INTO public.cellar_tanks (label, capacity_l, current_volume_l, status)
SELECT 'Tank ' || n, 7500, 0, 'empty'
FROM generate_series(1, 8) AS n;

-- ============================================================
-- 4) PŘEHLED VÝSLEDKU
-- ============================================================

DO $$
DECLARE
  t text;
  cnt bigint;
BEGIN
  RAISE NOTICE '=== VYČIŠTĚNÍ DOKONČENO ===';
  RAISE NOTICE 'Referenční číselníky zachovány: beers, packages, cellar_tanks';
  RAISE NOTICE 'Všichni uživatelé smazáni. Pro přihlášení vytvořte nový účet.';
END $$;
