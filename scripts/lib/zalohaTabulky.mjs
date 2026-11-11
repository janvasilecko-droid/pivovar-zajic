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
  ['logbook_entries', 'id'], ['logbook_closures', 'id'], ['festival_equipment_loans', 'id'],
  // Sklep
  ['akce_items', 'id'], ['cellar_tank_cycles', 'id'], ['cellar_transfers', 'id'], ['kegging_tanks', 'id'],
  ['planovane_varky', 'id'], ['sanitation_logs', 'id'], ['cellar_batches', 'id'], ['cellar_batch_mereni', 'id'],
  // Objednávky (kruh s WhatsAppem — viz ODLOZENE_SLOUPCE)
  ['orders', 'id'], ['whatsapp_incoming', 'id'], ['whatsapp_prijem_log', 'id'], ['order_items', 'id'],
  ['kegging', 'id'], ['zavoz_deductions', 'id'], ['keg_returns', 'id'], ['vycepy_rezervace', 'id'],
  ['zavoz_ukoly_hotovo', 'id'],
  // Obchod (prodejna): zboží → příjem, uzávěrky (+ řádky), inventura.
  ['obchod_zbozi', 'kod'], ['obchod_prijem', 'id'], ['obchod_uzaverky', 'id'],
  ['obchod_uzaverky_radky', 'id'], ['obchod_inventura', 'id'],
  ['obchod_odpis', 'id'], ['obchod_zavreno', 'datum'],
];

/**
 * 📚 PROJEKT BIBLE (samostatný Supabase projekt, rozhodnutí R12) — vlastní
 * sada zálohy (zalohy/bible/, `--sada bible`): katalog knihovny (názvy,
 * soubory, stav zpracování), nastavení modelů, evidence nákladů na AI
 * a migrací — a od 11. 11. 2026 i všechno, co lidé do bible zapisují ručně:
 * zkušenosti sládků, profil pivovaru (zařízení, provozní postupy), receptury
 * a várky, webové zdroje, problémy a jejich zjištění. Free tarif Supabase
 * vlastní zálohy nemá — bez téhle by se ztratily. Obsah knih se nezálohuje
 * (NEZALOHOVAT_BIBLE). Pořadí = pořadí obnovy: rodiče před dětmi (hlídá test
 * podle REFERENCES v migracích). Tabulka z ještě nespuštěné migrace se
 * přeskočí (zaloha-objednavek.mjs). Prázdné tabulky bible, které v hlavním
 * projektu zůstaly po přestěhování, se nezálohují (migrace 20261231440000 je smaže).
 */
export const TABULKY_BIBLE = [
  ['migrace_aplikovane', 'nazev'], ['bible_nastaveni', 'klic'], ['bible_dokumenty', 'id'], ['ai_naklady', 'id'],
  ['bible_zkusenosti', 'id'],
  ['bible_pivovary', 'id'], ['bible_zarizeni', 'id'], ['bible_postupy_provozu', 'id'],
  ['bible_receptury', 'id'], ['bible_varky', 'id'],
  ['bible_web_zdroje', 'id'],
  ['bible_problemy', 'id'], ['bible_problem_zjisteni', 'id'],
];

/** Adresa projektu bible (veřejná); klíč je v secretu BIBLE_SUPABASE_SERVICE_ROLE_KEY. */
export const BIBLE_URL = 'https://cegrelgvkygcatupqwrx.supabase.co';

export const NEZALOHOVAT = [
  'app_secrets', 'whatsapp_session', 'push_odbery', 'edge_rate_limits',
  'whatsapp_most_stav', 'app_errors', 'user_app_versions',
  // Jen počítadlo přepisů fotek (Google Vision) za měsíc — žádná data pivovaru.
  'ocr_pouziti',
  // Pivovarská bible: od 31. 10. 2026 v samostatném projektu (TABULKY_BIBLE);
  // v hlavním projektu zůstaly jen prázdné tabulky — smaže je 20261231440000.
  // Tady zůstávají, dokud je zná src/lib/database.types.ts (a pro databáze,
  // kde úklid ještě neběžel).
  'bible_dokumenty', 'bible_nastaveni', 'ai_naklady',
  'bible_kapitoly', 'bible_strany', 'bible_pasaze',
];

/**
 * Projekt bible — vědomě vynechané tabulky (každou tabulku z
 * bible/supabase/migrations musí mít test buď tady, nebo v TABULKY_BIBLE):
 */
export const NEZALOHOVAT_BIBLE = [
  // Strany, kapitoly a pasáže knih jsou odvozené z originálů v bucketu
  // „knihovna" (zpracování je kdykoli vytvoří znovu). Obsah knih chráněný
  // autorským právem do zálohy ve veřejném repu nepatří.
  'bible_kapitoly', 'bible_strany', 'bible_pasaze',
  // Přehledy témat: syntéza z knih s citacemi — worker je napíše znovu.
  'bible_prehledy',
  // Historie chatu AI sládka: odpovědi citují knihy; soukromé konverzace.
  'bible_konverzace', 'bible_zpravy',
  // Dodatky k PDF (rychlé otevření strany): jen struktura, worker je postaví znovu.
  'bible_dodatky',
  // Slovník odborných výrazů: celý z migrace 20261111040000, appka ho nemění.
  'bible_slovnik',
  // Tajemství konektoru Claude (OAuth klienti, kódy, tokeny) — jako app_secrets nikdy.
  'bible_mcp_klienti', 'bible_mcp_kody', 'bible_mcp_tokeny',
  // Fronta úklidu souborů smazaných dokumentů — provozní, za pár minut prázdná.
  'bible_smazane_soubory',
];

/**
 * Sloupce, které se do zálohy nepíšou: počítá je databáze sama (GENERATED
 * ALWAYS) — obnova by je zapsat nesměla (Postgres takový zápis odmítne)
 * a porovnání se zálohou by je hlásilo jako rozdíl. Hlídá test podle migrací.
 */
export const VYNECHAT_SLOUPCE = {
  bible_zkusenosti: ['hledani'],
};

/** Řádek bez sloupců z VYNECHAT_SLOUPCE (záloha i obnova). */
export function bezVynechanych(tabulka, radek) {
  const sloupce = VYNECHAT_SLOUPCE[tabulka];
  if (!sloupce) return radek;
  const kopie = { ...radek };
  for (const s of sloupce) delete kopie[s];
  return kopie;
}

/** Sloupce, které se při obnově zapíšou až ve druhém kole (kruhové a vlastní odkazy). */
export const ODLOZENE_SLOUPCE = {
  orders: ['whatsapp_message_id'],
  whatsapp_incoming: ['imported_order_id', 'amends_order_id', 'amends_message_id'],
  cellar_batches: ['kvasnice_z_varky'],
  bible_dokumenty: ['duplikat_z', 'predchozi_vydani'],
};

/**
 * Unikátní sloupce kromě klíče. Řádek ze zálohy, jehož hodnota už v databázi
 * patří jinému řádku (dokument smazán a tentýž soubor nahrán znovu), se při
 * obnově přeskočí — konflikt (HTTP 409) by jinak zastavil obnovu i všech
 * dalších tabulek.
 */
export const UNIKATNI_SLOUPCE = {
  bible_dokumenty: ['soubor_sha256', 'soubor_cesta'],
  // Unikátní je lower(url); stejná adresa jinak psaná velkými písmeny je vzácná.
  // (Číslo várky je unikátní jen v páru s pivovarem — sem se nevejde.)
  bible_web_zdroje: ['url'],
};

/** Kontroly návaznosti pro zkoušku obnovy: [tabulka, sloupec, cílová tabulka]. */
export const VAZBY = [
  ['order_items', 'order_id', 'orders'],
  ['akce_items', 'akce_id', 'akce'],
  ['cellar_batch_mereni', 'batch_id', 'cellar_batches'],
  ['festival_equipment_loans', 'equipment_id', 'festival_equipment'],
  ['place_aliases', 'place_id', 'places'],
  // Projekt bible (zkouška obnovy sady bible; v hlavní sadě se přeskočí).
  ['bible_zarizeni', 'pivovar_id', 'bible_pivovary'],
  ['bible_postupy_provozu', 'pivovar_id', 'bible_pivovary'],
  ['bible_varky', 'receptura_id', 'bible_receptury'],
  ['bible_problem_zjisteni', 'problem_id', 'bible_problemy'],
];

export const pk = (tabulka) => [...TABULKY, ...TABULKY_BIBLE].find(([t]) => t === tabulka)?.[1] ?? 'id';

/** Sada zálohy: hlavní projekt (zalohy/) nebo projekt bible (zalohy/bible/). */
export function sadaZalohy(jmeno) {
  if (jmeno === 'bible') return { jmeno: 'bible', slozka: 'zalohy/bible', tabulky: TABULKY_BIBLE };
  if (!jmeno || jmeno === 'hlavni') return { jmeno: 'hlavni', slozka: 'zalohy', tabulky: TABULKY };
  throw new Error(`Neznámá sada zálohy „${jmeno}" (hlavni, bible).`);
}
