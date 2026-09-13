// 📋 Které tabulky se zálohují a v jakém pořadí se obnovují.
//
// Seznam vznikl 13. 9. 2026 dotazem na produkční schéma (primární a cizí
// klíče). Pořadí je ZÁVAZNÉ: tabulka smí přijít až po všech, na které
// odkazuje. Mazání při obnově jde obráceně.
//
// Dva kruhy, které pořadím vyřešit nejdou:
//   orders.whatsapp_message_id  → whatsapp_incoming
//   whatsapp_incoming.imported_order_id / amends_order_id → orders
//   (+ whatsapp_incoming.amends_message_id a cellar_batches.kvasnice_z_varky
//    odkazují na vlastní tabulku)
// Tyhle sloupce se při obnově zapíšou napřed prázdné a doplní se ve druhém
// kole, až jsou v databázi obě strany (ODLOZENE_SLOUPCE).
//
// ZÁMĚRNĚ SE NEZÁLOHUJE:
//   app_secrets        API klíče — v záloze nemají co dělat ani šifrované
//   whatsapp_session   přihlášení WhatsApp mostu (obnova = nové spárování)
//   push_odbery        klíče push odběrů (prohlížeč se přihlásí znovu)
//   edge_rate_limits, whatsapp_most_stav, app_errors, user_app_versions
//                      provozní stav a logy bez hodnoty pro obnovu
//
// Nová tabulka v databázi se sem musí PŘIDAT — test
// src/lib/zalohaTabulky.test.ts spadne, když v database.types.ts přibude
// tabulka, která není ani tady, ani v NEZALOHOVAT.

/** [tabulka, primární klíč] v pořadí obnovy. */
export const TABULKY = [
  // Bez závislostí
  ['beers', 'id'], ['packages', 'id'], ['places', 'id'], ['vehicles', 'id'],
  ['profiles', 'id'], ['allowed_emails', 'email'], ['festival_equipment', 'id'],
  ['vycepy', 'id'], ['merch_items', 'id'], ['sklo_promo_entries', 'id'], ['exkurze', 'id'],
  ['notes', 'id'], ['reminders', 'id'], ['calendar_events', 'id'], ['checklisty_hotovo', 'id'],
  ['feedback_notes', 'id'], ['obal_nakupy', 'id'], ['sdilene_poznamky', 'id'], ['zaznam_fotky', 'id'],
  ['whatsapp_senders', 'id'], ['whatsapp_prikazy', 'id'], ['whatsapp_neodeslane', 'id'],
  ['whatsapp_rejected', 'id'], ['keg_sanitation_logs', 'id'], ['bottle_sanitation_logs', 'id'],
  ['tap_sanitation_logs', 'id'], ['bottling_line_maintenance_tasks', 'id'], ['audit_log', 'id'],
  ['migrace_aplikovane', 'nazev'], ['tank_uprava_log', 'klic'],
  // Odkazují na piva, obaly, místa, vozidla, profily
  ['cellar_tanks', 'id'], ['price_list', 'id'], ['cenik_zmeny', 'id'], ['akce', 'id'],
  ['bottling', 'id'], ['fasovani', 'id'], ['fasovani_private', 'id'], ['inventory', 'id'],
  ['inventory_adjustments', 'id'], ['keg_prefuk', 'id'], ['kegging_plan_checks', 'id'],
  ['parser_aliases', 'id'], ['place_aliases', 'id'], ['writeoffs', 'id'], ['tydenni_inventura', 'id'],
  ['label_purchases', 'id'], ['srotovani', 'id'], ['zadavani', 'id'], ['bottling_plans', 'id'],
  ['logbook_entries', 'id'], ['festival_equipment_loans', 'id'],
  // Sklep
  ['akce_items', 'id'], ['cellar_tank_cycles', 'id'], ['cellar_transfers', 'id'], ['kegging_tanks', 'id'],
  ['planovane_varky', 'id'], ['sanitation_logs', 'id'], ['cellar_batches', 'id'], ['cellar_batch_mereni', 'id'],
  // Objednávky (kruh s WhatsAppem — viz ODLOZENE_SLOUPCE)
  ['orders', 'id'], ['whatsapp_incoming', 'id'], ['whatsapp_prijem_log', 'id'], ['order_items', 'id'],
  ['kegging', 'id'], ['zavoz_deductions', 'id'], ['keg_returns', 'id'], ['vycepy_rezervace', 'id'],
  ['zavoz_ukoly_hotovo', 'id'],
];

export const NEZALOHOVAT = [
  'app_secrets', 'whatsapp_session', 'push_odbery', 'edge_rate_limits',
  'whatsapp_most_stav', 'app_errors', 'user_app_versions',
];

/** Sloupce, které se při obnově zapíšou až ve druhém kole (kruhové a vlastní odkazy). */
export const ODLOZENE_SLOUPCE = {
  orders: ['whatsapp_message_id'],
  whatsapp_incoming: ['imported_order_id', 'amends_order_id', 'amends_message_id'],
  cellar_batches: ['kvasnice_z_varky'],
};

/** Kontroly návaznosti pro zkoušku obnovy: [tabulka, sloupec, cílová tabulka]. */
export const VAZBY = [
  ['order_items', 'order_id', 'orders'],
  ['akce_items', 'akce_id', 'akce'],
  ['cellar_batch_mereni', 'batch_id', 'cellar_batches'],
  ['festival_equipment_loans', 'equipment_id', 'festival_equipment'],
  ['place_aliases', 'place_id', 'places'],
];

export const pk = (tabulka) => TABULKY.find(([t]) => t === tabulka)?.[1] ?? 'id';
