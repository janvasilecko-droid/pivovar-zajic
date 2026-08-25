-- Rozsireni server-side (RLS) vynuceni opravneni na zbyvajici moduly.
-- Navazuje na 20261128000000_enforce_module_edit_permissions.sql, ktery
-- pokryl jen cellar/kegging/inventory. Bez tohohle mohl uzivatel s
-- odepřenym modulem prest prime REST volani (devtools) data i tak zapsat -
-- appka to jen schovavala v UI.
--
-- Pouziva stejnou fail-open funkci user_can_edit_module() (chybejici profil,
-- admin role nebo chybejici permissions.<modul>.edit vraci true), takze
-- pridani techto politik NIKDY nezamkne uzivatele bez explicitniho omezeni.
--
-- SDILENE TABULKY (dulezite): nekolik tabulek zapisuje VIC modulu zaroven.
-- U tech je podminka OR pres vsechny opravnene moduly - jinak by zamceni
-- jednoho modulu rozbilo jinou legitimni obrazovku:
--   * orders/order_items ....... Objednavky (Orders.tsx) I Zavoz (Zavoz.tsx)
--   * sanitation_logs .......... Sanitacni denik (HACCP) I Sklep (Cellar.tsx)
--   * beers .................... Ciselniky (Catalogs.tsx) I Cenik (PriceList.tsx)
--
-- ZAMERNE VYNECHANO:
--   * vycepy, exkurze, akce ... data jsou 100% v localStorage prohlizece,
--                               v DB neni co chranit (akce/akce_items se ctou,
--                               ale nikde v kodu se do nich nezapisuje)
--   * stock, dashboard ........ read-only obrazovky (Dashboard pise jen do
--                               inventory, ktera uz je chranena modulem inventory)
--   * profiles ................ extremne sdilena (vlastni display_name, home_layout,
--                               admin sprava uzivatelu, prvni prihlaseni) - zamceni
--                               by rozbilo spravu uzivatelu; resi se zvlast triggery
--                               proti eskalaci prav (viz 20261130000000)
--   * feedback_notes .......... hlaseni chyb ma byt dostupne vsem odkudkoliv

-- ===== Zapis vyroby (modul "entry") =====
DROP POLICY IF EXISTS "perm_insert_bottling" ON public.bottling;
CREATE POLICY "perm_insert_bottling" ON public.bottling FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_update_bottling" ON public.bottling;
CREATE POLICY "perm_update_bottling" ON public.bottling FOR UPDATE TO authenticated USING (public.user_can_edit_module('entry')) WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_delete_bottling" ON public.bottling;
CREATE POLICY "perm_delete_bottling" ON public.bottling FOR DELETE TO authenticated USING (public.user_can_edit_module('entry'));

DROP POLICY IF EXISTS "perm_insert_fasovani" ON public.fasovani;
CREATE POLICY "perm_insert_fasovani" ON public.fasovani FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_update_fasovani" ON public.fasovani;
CREATE POLICY "perm_update_fasovani" ON public.fasovani FOR UPDATE TO authenticated USING (public.user_can_edit_module('entry')) WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_delete_fasovani" ON public.fasovani;
CREATE POLICY "perm_delete_fasovani" ON public.fasovani FOR DELETE TO authenticated USING (public.user_can_edit_module('entry'));

DROP POLICY IF EXISTS "perm_insert_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_insert_fasovani_private" ON public.fasovani_private FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_update_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_update_fasovani_private" ON public.fasovani_private FOR UPDATE TO authenticated USING (public.user_can_edit_module('entry')) WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_delete_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_delete_fasovani_private" ON public.fasovani_private FOR DELETE TO authenticated USING (public.user_can_edit_module('entry'));

DROP POLICY IF EXISTS "perm_insert_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_insert_writeoffs" ON public.writeoffs FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_update_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_update_writeoffs" ON public.writeoffs FOR UPDATE TO authenticated USING (public.user_can_edit_module('entry')) WITH CHECK (public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS "perm_delete_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_delete_writeoffs" ON public.writeoffs FOR DELETE TO authenticated USING (public.user_can_edit_module('entry'));

-- ===== Objednavky + Zavoz (SDILENE tabulky - podminka OR) =====
DROP POLICY IF EXISTS "perm_insert_orders" ON public.orders;
CREATE POLICY "perm_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));
DROP POLICY IF EXISTS "perm_update_orders" ON public.orders;
CREATE POLICY "perm_update_orders" ON public.orders FOR UPDATE TO authenticated USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz')) WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));
DROP POLICY IF EXISTS "perm_delete_orders" ON public.orders;
CREATE POLICY "perm_delete_orders" ON public.orders FOR DELETE TO authenticated USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));

DROP POLICY IF EXISTS "perm_insert_order_items" ON public.order_items;
CREATE POLICY "perm_insert_order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));
DROP POLICY IF EXISTS "perm_update_order_items" ON public.order_items;
CREATE POLICY "perm_update_order_items" ON public.order_items FOR UPDATE TO authenticated USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz')) WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));
DROP POLICY IF EXISTS "perm_delete_order_items" ON public.order_items;
CREATE POLICY "perm_delete_order_items" ON public.order_items FOR DELETE TO authenticated USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));

-- ===== Kniha jizd (modul "kniha_jizd") =====
DROP POLICY IF EXISTS "perm_insert_logbook_entries" ON public.logbook_entries;
CREATE POLICY "perm_insert_logbook_entries" ON public.logbook_entries FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('kniha_jizd'));
DROP POLICY IF EXISTS "perm_update_logbook_entries" ON public.logbook_entries;
CREATE POLICY "perm_update_logbook_entries" ON public.logbook_entries FOR UPDATE TO authenticated USING (public.user_can_edit_module('kniha_jizd')) WITH CHECK (public.user_can_edit_module('kniha_jizd'));
DROP POLICY IF EXISTS "perm_delete_logbook_entries" ON public.logbook_entries;
CREATE POLICY "perm_delete_logbook_entries" ON public.logbook_entries FOR DELETE TO authenticated USING (public.user_can_edit_module('kniha_jizd'));

-- ===== Srotovani (modul "srotovani") =====
DROP POLICY IF EXISTS "perm_insert_srotovani" ON public.srotovani;
CREATE POLICY "perm_insert_srotovani" ON public.srotovani FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('srotovani'));
DROP POLICY IF EXISTS "perm_update_srotovani" ON public.srotovani;
CREATE POLICY "perm_update_srotovani" ON public.srotovani FOR UPDATE TO authenticated USING (public.user_can_edit_module('srotovani')) WITH CHECK (public.user_can_edit_module('srotovani'));
DROP POLICY IF EXISTS "perm_delete_srotovani" ON public.srotovani;
CREATE POLICY "perm_delete_srotovani" ON public.srotovani FOR DELETE TO authenticated USING (public.user_can_edit_module('srotovani'));

-- ===== Sanitacni deniky (modul "haccp") =====
-- sanitation_logs je SDILENA se Sklepem (Cellar.tsx zapisuje sanitaci tanku).
DROP POLICY IF EXISTS "perm_insert_sanitation_logs" ON public.sanitation_logs;
CREATE POLICY "perm_insert_sanitation_logs" ON public.sanitation_logs FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('haccp') OR public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "perm_update_sanitation_logs" ON public.sanitation_logs;
CREATE POLICY "perm_update_sanitation_logs" ON public.sanitation_logs FOR UPDATE TO authenticated USING (public.user_can_edit_module('haccp') OR public.user_can_edit_module('cellar')) WITH CHECK (public.user_can_edit_module('haccp') OR public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS "perm_delete_sanitation_logs" ON public.sanitation_logs;
CREATE POLICY "perm_delete_sanitation_logs" ON public.sanitation_logs FOR DELETE TO authenticated USING (public.user_can_edit_module('haccp') OR public.user_can_edit_module('cellar'));

DROP POLICY IF EXISTS "perm_insert_bottle_sanitation_logs" ON public.bottle_sanitation_logs;
CREATE POLICY "perm_insert_bottle_sanitation_logs" ON public.bottle_sanitation_logs FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_update_bottle_sanitation_logs" ON public.bottle_sanitation_logs;
CREATE POLICY "perm_update_bottle_sanitation_logs" ON public.bottle_sanitation_logs FOR UPDATE TO authenticated USING (public.user_can_edit_module('haccp')) WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_delete_bottle_sanitation_logs" ON public.bottle_sanitation_logs;
CREATE POLICY "perm_delete_bottle_sanitation_logs" ON public.bottle_sanitation_logs FOR DELETE TO authenticated USING (public.user_can_edit_module('haccp'));

DROP POLICY IF EXISTS "perm_insert_keg_sanitation_logs" ON public.keg_sanitation_logs;
CREATE POLICY "perm_insert_keg_sanitation_logs" ON public.keg_sanitation_logs FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_update_keg_sanitation_logs" ON public.keg_sanitation_logs;
CREATE POLICY "perm_update_keg_sanitation_logs" ON public.keg_sanitation_logs FOR UPDATE TO authenticated USING (public.user_can_edit_module('haccp')) WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_delete_keg_sanitation_logs" ON public.keg_sanitation_logs;
CREATE POLICY "perm_delete_keg_sanitation_logs" ON public.keg_sanitation_logs FOR DELETE TO authenticated USING (public.user_can_edit_module('haccp'));

DROP POLICY IF EXISTS "perm_insert_tap_sanitation_logs" ON public.tap_sanitation_logs;
CREATE POLICY "perm_insert_tap_sanitation_logs" ON public.tap_sanitation_logs FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_update_tap_sanitation_logs" ON public.tap_sanitation_logs;
CREATE POLICY "perm_update_tap_sanitation_logs" ON public.tap_sanitation_logs FOR UPDATE TO authenticated USING (public.user_can_edit_module('haccp')) WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_delete_tap_sanitation_logs" ON public.tap_sanitation_logs;
CREATE POLICY "perm_delete_tap_sanitation_logs" ON public.tap_sanitation_logs FOR DELETE TO authenticated USING (public.user_can_edit_module('haccp'));

DROP POLICY IF EXISTS "perm_insert_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks;
CREATE POLICY "perm_insert_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_update_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks;
CREATE POLICY "perm_update_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks FOR UPDATE TO authenticated USING (public.user_can_edit_module('haccp')) WITH CHECK (public.user_can_edit_module('haccp'));
DROP POLICY IF EXISTS "perm_delete_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks;
CREATE POLICY "perm_delete_bottling_line_maintenance" ON public.bottling_line_maintenance_tasks FOR DELETE TO authenticated USING (public.user_can_edit_module('haccp'));

-- ===== Ciselniky (modul "catalogs") =====
-- beers je SDILENA s Cenikem (PriceList.tsx meni price_per_liter).
DROP POLICY IF EXISTS "perm_insert_beers" ON public.beers;
CREATE POLICY "perm_insert_beers" ON public.beers FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('catalogs') OR public.user_can_edit_module('pricelist'));
DROP POLICY IF EXISTS "perm_update_beers" ON public.beers;
CREATE POLICY "perm_update_beers" ON public.beers FOR UPDATE TO authenticated USING (public.user_can_edit_module('catalogs') OR public.user_can_edit_module('pricelist')) WITH CHECK (public.user_can_edit_module('catalogs') OR public.user_can_edit_module('pricelist'));
DROP POLICY IF EXISTS "perm_delete_beers" ON public.beers;
CREATE POLICY "perm_delete_beers" ON public.beers FOR DELETE TO authenticated USING (public.user_can_edit_module('catalogs') OR public.user_can_edit_module('pricelist'));

DROP POLICY IF EXISTS "perm_insert_packages" ON public.packages;
CREATE POLICY "perm_insert_packages" ON public.packages FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_update_packages" ON public.packages;
CREATE POLICY "perm_update_packages" ON public.packages FOR UPDATE TO authenticated USING (public.user_can_edit_module('catalogs')) WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_delete_packages" ON public.packages;
CREATE POLICY "perm_delete_packages" ON public.packages FOR DELETE TO authenticated USING (public.user_can_edit_module('catalogs'));

DROP POLICY IF EXISTS "perm_insert_places" ON public.places;
CREATE POLICY "perm_insert_places" ON public.places FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_update_places" ON public.places;
CREATE POLICY "perm_update_places" ON public.places FOR UPDATE TO authenticated USING (public.user_can_edit_module('catalogs')) WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_delete_places" ON public.places;
CREATE POLICY "perm_delete_places" ON public.places FOR DELETE TO authenticated USING (public.user_can_edit_module('catalogs'));

DROP POLICY IF EXISTS "perm_insert_vehicles" ON public.vehicles;
CREATE POLICY "perm_insert_vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_update_vehicles" ON public.vehicles;
CREATE POLICY "perm_update_vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (public.user_can_edit_module('catalogs')) WITH CHECK (public.user_can_edit_module('catalogs'));
DROP POLICY IF EXISTS "perm_delete_vehicles" ON public.vehicles;
CREATE POLICY "perm_delete_vehicles" ON public.vehicles FOR DELETE TO authenticated USING (public.user_can_edit_module('catalogs'));

-- ===== Sklo/etikety (modul "sklo_promo") =====
DROP POLICY IF EXISTS "perm_insert_label_purchases" ON public.label_purchases;
CREATE POLICY "perm_insert_label_purchases" ON public.label_purchases FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('sklo_promo'));
DROP POLICY IF EXISTS "perm_update_label_purchases" ON public.label_purchases;
CREATE POLICY "perm_update_label_purchases" ON public.label_purchases FOR UPDATE TO authenticated USING (public.user_can_edit_module('sklo_promo')) WITH CHECK (public.user_can_edit_module('sklo_promo'));
DROP POLICY IF EXISTS "perm_delete_label_purchases" ON public.label_purchases;
CREATE POLICY "perm_delete_label_purchases" ON public.label_purchases FOR DELETE TO authenticated USING (public.user_can_edit_module('sklo_promo'));

-- ===== Cenik (modul "pricelist") =====
DROP POLICY IF EXISTS "perm_insert_price_list" ON public.price_list;
CREATE POLICY "perm_insert_price_list" ON public.price_list FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('pricelist'));
DROP POLICY IF EXISTS "perm_update_price_list" ON public.price_list;
CREATE POLICY "perm_update_price_list" ON public.price_list FOR UPDATE TO authenticated USING (public.user_can_edit_module('pricelist')) WITH CHECK (public.user_can_edit_module('pricelist'));
DROP POLICY IF EXISTS "perm_delete_price_list" ON public.price_list;
CREATE POLICY "perm_delete_price_list" ON public.price_list FOR DELETE TO authenticated USING (public.user_can_edit_module('pricelist'));

-- ===== Upominky / kalendar (modul "reminders") =====
DROP POLICY IF EXISTS "perm_insert_reminders" ON public.reminders;
CREATE POLICY "perm_insert_reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS "perm_update_reminders" ON public.reminders;
CREATE POLICY "perm_update_reminders" ON public.reminders FOR UPDATE TO authenticated USING (public.user_can_edit_module('reminders')) WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS "perm_delete_reminders" ON public.reminders;
CREATE POLICY "perm_delete_reminders" ON public.reminders FOR DELETE TO authenticated USING (public.user_can_edit_module('reminders'));

DROP POLICY IF EXISTS "perm_insert_calendar_events" ON public.calendar_events;
CREATE POLICY "perm_insert_calendar_events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS "perm_update_calendar_events" ON public.calendar_events;
CREATE POLICY "perm_update_calendar_events" ON public.calendar_events FOR UPDATE TO authenticated USING (public.user_can_edit_module('reminders')) WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS "perm_delete_calendar_events" ON public.calendar_events;
CREATE POLICY "perm_delete_calendar_events" ON public.calendar_events FOR DELETE TO authenticated USING (public.user_can_edit_module('reminders'));
