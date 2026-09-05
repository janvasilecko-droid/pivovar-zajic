-- Zrušení politik, které přebíjejí kontrolu oprávnění.
--
-- CO SE STALO
-- Migrace 20261128, 20261204, 20261206 a 20261208 přidaly ke každé tabulce
-- politiky, které u zápisu volají `public.user_can_edit_module(...)`. Záměr
-- byl vynutit oprávnění i na serveru, ne jen v prohlížeči — komentář
-- v 20261208 to říká přesně: „uživatel s odepřeným modulem je mohl přes
-- přímé REST volání (devtools) i tak měnit nebo mazat".
--
-- Jenže PŮVODNÍ politiky z července 2026 (auth_write_*, auth_update_*,
-- auth_delete_*, insert_own_*, …) nikdo nezrušil. A PostgreSQL více
-- povolujících (PERMISSIVE) politik pro tutéž operaci spojuje přes OR:
-- stačí, aby prošla JEDNA. Vedle omezené `perm_insert_orders` tedy dál
-- stála `auth_write_orders` s `WITH CHECK (true)`, která pustí každého
-- přihlášeného — takže celé vynucení oprávnění od začátku nefunguje.
--
-- Změřeno 5. 9. 2026 nad všemi migracemi: 87 takových politik u 29 tabulek.
--
-- PROČ JE BEZPEČNÉ JE ZRUŠIT
-- `user_can_edit_module()` je fail-open (viz 20261128): bez přihlášení,
-- bez profilu, bez role, u admina i bez nastavených oprávnění vrací true.
-- Komu se dnes nic nezakazuje, ten po téhle migraci nic neztratí — zavře
-- se jen to, co UI zavřené má.
--
-- ČTENÍ SE NEMĚNÍ. Politiky SELECT zůstávají otevřené všem přihlášeným:
-- v šestičlenném pivovaru se data čtou společně a omezení čtení by rozbilo
-- obrazovky, které počítají sklad ze všech pohybů.
--
-- Spouští se jako ostatní: Supabase → SQL Editor → Run. Jde pustit
-- opakovaně (IF EXISTS). Po spuštění se ověří v Nastavení → Diagnostika.

-- akce
DROP POLICY IF EXISTS "delete_own_akce" ON public.akce;
DROP POLICY IF EXISTS "insert_own_akce" ON public.akce;
DROP POLICY IF EXISTS "update_own_akce" ON public.akce;

-- akce_items
DROP POLICY IF EXISTS "delete_akce_items" ON public.akce_items;
DROP POLICY IF EXISTS "insert_akce_items" ON public.akce_items;
DROP POLICY IF EXISTS "update_akce_items" ON public.akce_items;

-- beers
DROP POLICY IF EXISTS "auth_delete_beers" ON public.beers;
DROP POLICY IF EXISTS "auth_write_beers" ON public.beers;
DROP POLICY IF EXISTS "auth_update_beers" ON public.beers;

-- bottle_sanitation_logs
DROP POLICY IF EXISTS "auth_delete_bottle_sanitation_logs" ON public.bottle_sanitation_logs;
DROP POLICY IF EXISTS "auth_write_bottle_sanitation_logs" ON public.bottle_sanitation_logs;
DROP POLICY IF EXISTS "auth_update_bottle_sanitation_logs" ON public.bottle_sanitation_logs;

-- bottling
DROP POLICY IF EXISTS "auth_delete_bottling" ON public.bottling;
DROP POLICY IF EXISTS "auth_write_bottling" ON public.bottling;
DROP POLICY IF EXISTS "auth_update_bottling" ON public.bottling;

-- bottling_line_maintenance_tasks
DROP POLICY IF EXISTS "bottling_line_maintenance_delete" ON public.bottling_line_maintenance_tasks;
DROP POLICY IF EXISTS "bottling_line_maintenance_insert" ON public.bottling_line_maintenance_tasks;
DROP POLICY IF EXISTS "bottling_line_maintenance_update" ON public.bottling_line_maintenance_tasks;

-- bottling_plans
DROP POLICY IF EXISTS "auth_delete_bottling_plans" ON public.bottling_plans;
DROP POLICY IF EXISTS "auth_write_bottling_plans" ON public.bottling_plans;
DROP POLICY IF EXISTS "auth_update_bottling_plans" ON public.bottling_plans;

-- calendar_events
DROP POLICY IF EXISTS "delete_own_calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "insert_own_calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "update_own_calendar" ON public.calendar_events;

-- cellar_tank_cycles
DROP POLICY IF EXISTS "delete_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
DROP POLICY IF EXISTS "insert_own_cellar_tank_cycles" ON public.cellar_tank_cycles;
DROP POLICY IF EXISTS "update_own_cellar_tank_cycles" ON public.cellar_tank_cycles;

-- fasovani
DROP POLICY IF EXISTS "delete_own_fasovani" ON public.fasovani;
DROP POLICY IF EXISTS "insert_own_fasovani" ON public.fasovani;
DROP POLICY IF EXISTS "update_own_fasovani" ON public.fasovani;

-- fasovani_private
DROP POLICY IF EXISTS "delete_own_fasovani_private" ON public.fasovani_private;
DROP POLICY IF EXISTS "insert_own_fasovani_private" ON public.fasovani_private;
DROP POLICY IF EXISTS "update_own_fasovani_private" ON public.fasovani_private;

-- keg_sanitation_logs
DROP POLICY IF EXISTS "auth_delete_keg_sanitation_logs" ON public.keg_sanitation_logs;
DROP POLICY IF EXISTS "auth_write_keg_sanitation_logs" ON public.keg_sanitation_logs;
DROP POLICY IF EXISTS "auth_update_keg_sanitation_logs" ON public.keg_sanitation_logs;

-- kegging_tanks
DROP POLICY IF EXISTS "delete_own_tanks" ON public.kegging_tanks;
DROP POLICY IF EXISTS "insert_own_tanks" ON public.kegging_tanks;
DROP POLICY IF EXISTS "update_own_tanks" ON public.kegging_tanks;

-- label_purchases
DROP POLICY IF EXISTS "auth_delete_label_purchases" ON public.label_purchases;
DROP POLICY IF EXISTS "auth_write_label_purchases" ON public.label_purchases;
DROP POLICY IF EXISTS "auth_update_label_purchases" ON public.label_purchases;

-- logbook_entries
DROP POLICY IF EXISTS "auth_delete_logbook_entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "auth_write_logbook_entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "auth_update_logbook_entries" ON public.logbook_entries;

-- notes
DROP POLICY IF EXISTS "notes_delete" ON public.notes;
DROP POLICY IF EXISTS "notes_insert" ON public.notes;
DROP POLICY IF EXISTS "notes_update" ON public.notes;

-- order_items
DROP POLICY IF EXISTS "auth_delete_order_items" ON public.order_items;
DROP POLICY IF EXISTS "auth_write_order_items" ON public.order_items;
DROP POLICY IF EXISTS "auth_update_order_items" ON public.order_items;

-- orders
DROP POLICY IF EXISTS "auth_delete_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_write_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;

-- packages
DROP POLICY IF EXISTS "auth_delete_packages" ON public.packages;
DROP POLICY IF EXISTS "auth_write_packages" ON public.packages;
DROP POLICY IF EXISTS "auth_update_packages" ON public.packages;

-- parser_aliases
DROP POLICY IF EXISTS "delete_aliases" ON public.parser_aliases;
DROP POLICY IF EXISTS "insert_aliases" ON public.parser_aliases;
DROP POLICY IF EXISTS "update_aliases" ON public.parser_aliases;

-- place_aliases
DROP POLICY IF EXISTS "place_aliases_delete" ON public.place_aliases;
DROP POLICY IF EXISTS "place_aliases_insert" ON public.place_aliases;
DROP POLICY IF EXISTS "place_aliases_update" ON public.place_aliases;

-- places
DROP POLICY IF EXISTS "auth_delete_places" ON public.places;
DROP POLICY IF EXISTS "auth_write_places" ON public.places;
DROP POLICY IF EXISTS "auth_update_places" ON public.places;

-- price_list
DROP POLICY IF EXISTS "delete_own_price_list" ON public.price_list;
DROP POLICY IF EXISTS "insert_own_price_list" ON public.price_list;
DROP POLICY IF EXISTS "update_own_price_list" ON public.price_list;

-- reminders
DROP POLICY IF EXISTS "reminders_delete" ON public.reminders;
DROP POLICY IF EXISTS "reminders_insert" ON public.reminders;
DROP POLICY IF EXISTS "reminders_update" ON public.reminders;

-- sanitation_logs
DROP POLICY IF EXISTS "auth_delete_sanitation_logs" ON public.sanitation_logs;
DROP POLICY IF EXISTS "auth_write_sanitation_logs" ON public.sanitation_logs;
DROP POLICY IF EXISTS "auth_update_sanitation_logs" ON public.sanitation_logs;

-- srotovani
DROP POLICY IF EXISTS "auth_delete_srotovani" ON public.srotovani;
DROP POLICY IF EXISTS "auth_write_srotovani" ON public.srotovani;
DROP POLICY IF EXISTS "auth_update_srotovani" ON public.srotovani;

-- tap_sanitation_logs
DROP POLICY IF EXISTS "auth_delete_tap_sanitation_logs" ON public.tap_sanitation_logs;
DROP POLICY IF EXISTS "auth_write_tap_sanitation_logs" ON public.tap_sanitation_logs;
DROP POLICY IF EXISTS "auth_update_tap_sanitation_logs" ON public.tap_sanitation_logs;

-- vehicles
DROP POLICY IF EXISTS "vehicles_delete_authenticated" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert_authenticated" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update_authenticated" ON public.vehicles;

-- writeoffs
DROP POLICY IF EXISTS "auth_delete_writeoffs" ON public.writeoffs;
DROP POLICY IF EXISTS "auth_write_writeoffs" ON public.writeoffs;
DROP POLICY IF EXISTS "auth_update_writeoffs" ON public.writeoffs;

