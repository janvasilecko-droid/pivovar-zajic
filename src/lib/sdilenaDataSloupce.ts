/**
 * 📋 Výčet sloupců sdílených tabulek (viz lib/sdilenaData.ts).
 * ---------------------------------------------------------------------------
 * Je zvlášť, protože sdilenaData.ts při načtení zakládá klienta Supabase
 * z VITE_* proměnných — skript scripts/rozbor-skladu.ts, který se přihlašuje
 * sám, na tom 1. 10. 2026 padal hned po spuštění („supabaseUrl is required")
 * a k datům se vůbec nedostal. Tenhle soubor nic nespouští, jde importovat
 * odkudkoli.
 */

/** Jednotný výčet sloupců — nadmnožina toho, co kterákoli obrazovka potřebuje. */
export const SLOUPCE = {
  bottling: 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at',
  // order_item_id: stočení přes „Stočeno" u položky — plán podle něj pozná
  // naplněné sudy odběratele s vlastními sudy (lib/vlastniSudy.ts).
  kegging: 'entry_date,beer_id,package_id,quantity,note,cellar_tank_id,created_at,order_item_id',
  fasovani: 'entry_date,beer_id,package_id,quantity,created_at',
  fasovani_private: 'entry_date,beer_id,package_id,quantity',
  writeoffs: 'entry_date,beer_id,package_id,quantity,created_at',
  inventory: 'entry_date,beer_id,beer_name,package_id,package_label,quantity,note,created_at',
  inventory_adjustments: 'entry_date,beer_id,package_id,quantity,order_id,reason,created_at',
  zavoz_deductions: 'deduct_date,beer_id,package_id,quantity,order_item_id,order_id,created_at',
  akce: 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)',
  keg_prefuk: 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count',
  orders: 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered',
  // `*` místo výčtu: delivery_day (vlastní den položky) přidává migrace
  // 20261231070000, která jde pustit až PO nasazení — viz Kegging.tsx.
  order_items: '*',
  kegging_plan_checks: 'week_key,day,beer_id,package_id,qty',
} as const;

export type SdilenaTabulka = keyof typeof SLOUPCE;
