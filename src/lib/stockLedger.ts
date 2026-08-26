// 📒 Skladová kniha — JEDINÝ zdroj pravdy o tom, kolik je čeho na skladě.
// ---------------------------------------------------------------------------
// Nahrazuje getStartingStockMap() z inventoryHelper.ts, na kterém stálo šest
// různých obrazovek. Ten model měl tři vady, které se navzájem zesilovaly:
//
//  1. OŘEZÁVAL KAŽDÝ POHYB ZVLÁŠŤ na nulu — `map[k] = Math.max(0, map[k] - qty)`.
//     Kdo měl 5 sudů a vydal 10, skončil na nule místo na −5. Informace se
//     zahodila a na POŘADÍ operací pak záleželo, co vyjde. Schodek se tím
//     schoval: v srpnu 2026 bylo devět druhů sudů reálně v mínusu (11° Světlá
//     30l −12, Summer Ale 30l −11) a nikde to nebylo vidět. Navíc se tím
//     "ztrácelo" čerstvé stáčení, protože nejdřív umazávalo neexistující dluh.
//  2. ČETL SKLAD Z localStorage (`initial_stock_*`, `actual_inventory_*`).
//     Počáteční stav měsíce i fyzická inventura tak mohly existovat jen
//     v jednom prohlížeči — jiné zařízení ukazovalo jiná čísla.
//  3. BRAL INVENTURNÍ ŘÁDEK BEZ POZNÁMKY jako počáteční stav, takže uložená
//     fyzická inventura bez poznámky se tiše stala počátečním stavem.
//
// Nový model je obyčejná účetní kniha:
//   • každý zápis v aplikaci = jeden POHYB se znaménkem (+ příjem, − výdej),
//   • inventura = RESET: k danému datu se stav rovná napočítanému množství
//     a starší pohyby už do výsledku nevstupují,
//   • stav k datu = poslední reset + součet pohybů po něm.
//
// Nikde se nic neořezává. Když vyjde záporný stav, je to skutečná nesrovnalost
// v evidenci a aplikace ji MÁ ukázat, ne schovat.
import type { AkceRow } from './inventoryHelper';

/** Druh pohybu — určuje popisek v rozpadu a znaménko. */
export type MovementKind =
  | 'inventura'   // reset stavu (fyzická/schválená inventura, počáteční stav)
  | 'staceni'     // stočeno do lahví/PET (bottling)
  | 'kegovani'    // stočeno do sudů (kegging)
  | 'fasovani'    // fasování personálu
  | 'prodejna'    // podniková prodejna
  | 'odpis'       // odpis / zmetky
  | 'zavoz'       // vydáno na objednávku (zavoz_deductions)
  | 'akce'        // akce a festivaly (odvezeno − vráceno)
  | 'prefuk_z'    // přefuk — ubylo z tohoto obalu
  | 'prefuk_do'   // přefuk — přibylo do tohoto obalu
  | 'sud_na_lahve' // sud spotřebovaný jako zdroj pro stáčení lahví
  | 'dorovnani';  // ruční dorovnání inventury (± ks)

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  inventura: 'Inventura',
  staceni: 'Stočeno (lahve/PET)',
  kegovani: 'Stočeno (sudy)',
  fasovani: 'Fasování personál',
  prodejna: 'Prodejna',
  odpis: 'Odpis',
  zavoz: 'Zavezeno na objednávku',
  akce: 'Akce a festivaly',
  prefuk_z: 'Přefuk — ze sudu',
  prefuk_do: 'Přefuk — do sudu',
  sud_na_lahve: 'Sud spotřebován na lahve',
  dorovnani: 'Dorovnání inventury',
};

export type Movement = {
  date: string;        // YYYY-MM-DD
  beer_id: string;
  package_id: string;
  /** + příjem, − výdej. U 'inventura' je to napočítaný stav (reset). */
  qty: number;
  kind: MovementKind;
  note?: string | null;
};

export type StockSources = {
  inventoryRows?: any[];
  bottlingRows?: any[];
  keggingRows?: any[];
  fasovaniRows?: any[];
  prodejnaRows?: any[];
  writeoffsRows?: any[];
  zavozDeductionRows?: any[];
  akceRows?: AkceRow[];
  prefukRows?: any[];
  adjustmentRows?: any[];
  /** Katalog obalů — potřebný jen pro dohledání sudu spotřebovaného na lahve. */
  packages?: { id: string; kind: string; volume_l: number }[];
};

export const stockKey = (beerId: string, packageId: string) => `${beerId}__${packageId}`;

/**
 * Rozpozná inventurní řádek, který má nastavit stav (reset).
 * Priorita při shodném datu: schválená > fyzická > počáteční. Řádek bez
 * poznámky se bere jako počáteční stav (tak se historicky ukládal), ale až
 * jako poslední v pořadí, aby nepřebil skutečnou inventuru.
 */
function inventoryPriority(note: string | null | undefined): number {
  const n = (note || '').toLowerCase();
  if (n.includes('schválen') || n.includes('schvalen')) return 3;
  if (n.includes('fyzick')) return 2;
  if (n.includes('počáteč') || n.includes('pocatec')) return 1;
  return 0;
}

// Sud spotřebovaný jako zdroj stáčení lahví. Řádek stáčení nese kegs_used,
// ale ne vždy i kegs_used_package_id — pak se obal dopočítá z objemu.
function resolveKegsUsed(
  row: any,
  packages: { id: string; kind: string; volume_l: number }[]
): { kegPkgId: string; kegsUsed: number } | null {
  const kegsUsed = Number(row.kegs_used || 0);
  if (kegsUsed <= 0) return null;
  if (row.kegs_used_package_id) return { kegPkgId: row.kegs_used_package_id, kegsUsed };
  const sourceL = Number(row.source_volume_l || 0);
  if (sourceL > 0) {
    const singleVol = sourceL / kegsUsed;
    const matched = packages.find((p) => p.kind === 'keg' && Number(p.volume_l) === singleVol);
    if (matched) return { kegPkgId: matched.id, kegsUsed };
  }
  const pkg = packages.find((p) => p.id === row.package_id);
  if (pkg && pkg.kind === 'keg') return { kegPkgId: pkg.id, kegsUsed };
  return null;
}

/**
 * Převede všechny zdrojové tabulky na jeden plochý seznam pohybů se znaménkem.
 * Tohle je jediné místo v aplikaci, které ví, jak se která tabulka promítá do
 * skladu — dřív to bylo rozepsané v šesti souborech a kopie se rozcházely
 * (přefuk chyběl ve třech ze čtyř, Akce se nepočítaly vůbec).
 */
export function buildMovements(src: StockSources): Movement[] {
  const out: Movement[] = [];
  const packages = src.packages ?? [];

  const push = (date: any, beer: any, pkg: any, qty: number, kind: MovementKind, note?: string | null) => {
    if (!date || !beer || !pkg || !qty) return;
    out.push({ date: String(date).slice(0, 10), beer_id: beer, package_id: pkg, qty, kind, note: note ?? null });
  };

  // Inventura — reset stavu. Při shodném datu vyhraje řádek s vyšší prioritou.
  const invByKeyDate = new Map<string, { qty: number; prio: number; note: string | null }>();
  (src.inventoryRows ?? []).forEach((r) => {
    if (!r.beer_id || !r.package_id || !r.entry_date) return;
    const date = String(r.entry_date).slice(0, 10);
    const k = `${date}|${stockKey(r.beer_id, r.package_id)}`;
    const prio = inventoryPriority(r.note);
    const prev = invByKeyDate.get(k);
    if (prev && prev.prio > prio) return;
    if (prev && prev.prio === prio) {
      // Stejná priorita = víc řádků téže inventury, sečti je.
      invByKeyDate.set(k, { qty: prev.qty + Number(r.quantity || 0), prio, note: prev.note });
      return;
    }
    invByKeyDate.set(k, { qty: Number(r.quantity || 0), prio, note: r.note ?? null });
  });
  invByKeyDate.forEach((v, k) => {
    const [date, key] = k.split('|');
    const [beer_id, package_id] = key.split('__');
    out.push({ date, beer_id, package_id, qty: v.qty, kind: 'inventura', note: v.note });
  });

  (src.keggingRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, Number(r.quantity || 0), 'kegovani'));
  (src.bottlingRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, Number(r.quantity || 0), 'staceni'));
  (src.fasovaniRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, -Number(r.quantity || 0), 'fasovani'));
  (src.prodejnaRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, -Number(r.quantity || 0), 'prodejna'));
  (src.writeoffsRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, -Number(r.quantity || 0), 'odpis'));
  (src.zavozDeductionRows ?? []).forEach((r) => push(r.deduct_date, r.beer_id, r.package_id, -Number(r.quantity || 0), 'zavoz'));
  (src.adjustmentRows ?? []).forEach((r) => push(r.entry_date, r.beer_id, r.package_id, Number(r.quantity || 0), 'dorovnani', r.note));

  // Akce a festivaly — čistý odběr (odvezeno − vráceno).
  (src.akceRows ?? []).forEach((r) => {
    (r.items ?? []).forEach((it) => {
      const net = Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0);
      if (net !== 0) push(r.entry_date, it.beer_id, it.package_id, -net, 'akce');
    });
  });

  // Přefuk — z jednoho obalu ubude, do druhého přibude.
  (src.prefukRows ?? []).forEach((r) => {
    if (!r.beer_id) return;
    if (r.from_package_id) push(r.entry_date, r.beer_id, r.from_package_id, -Number(r.from_count || 0), 'prefuk_z');
    if (r.to_package_id) push(r.entry_date, r.beer_id, r.to_package_id, Number(r.to_count || 0), 'prefuk_do');
  });

  // Sudy spotřebované jako zdroj pro stáčení lahví.
  const seen = new Set<string>();
  (src.bottlingRows ?? []).forEach((r) => {
    const res = resolveKegsUsed(r, packages);
    if (!res || !r.beer_id) return;
    const dedupe = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${r.created_at || r.note || ''}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    push(r.entry_date, r.beer_id, res.kegPkgId, -res.kegsUsed, 'sud_na_lahve');
  });

  return out;
}

export type StockLine = {
  key: string;
  beer_id: string;
  package_id: string;
  /** Stav k danému datu. Může být ZÁPORNÝ — pak evidence nesedí. */
  qty: number;
  /** Datum poslední inventury, ze které se počítá (null = počítá se od nuly). */
  baselineDate: string | null;
  /** Stav podle té inventury. */
  baselineQty: number;
  /** Rozpad pohybů od inventury po zadané datum, po druzích. */
  byKind: Partial<Record<MovementKind, number>>;
};

/**
 * Stav skladu ke konci zadaného dne.
 *
 * Postup je vždycky stejný: najdi poslední inventuru k tomu datu a přičti
 * pohyby, které nastaly PO ní. Bez inventury se sčítá všechno od začátku.
 * Nikde se nic neořezává na nulu — záporný výsledek je platná odpověď
 * a znamená, že se vydalo víc, než kolik evidence zná.
 */
export function stockAsOf(movements: Movement[], dateISO: string): Map<string, StockLine> {
  const byKey = new Map<string, Movement[]>();
  for (const m of movements) {
    if (m.date > dateISO) continue;
    const k = stockKey(m.beer_id, m.package_id);
    const list = byKey.get(k);
    if (list) list.push(m); else byKey.set(k, [m]);
  }

  const out = new Map<string, StockLine>();
  byKey.forEach((list, key) => {
    // Poslední inventura k datu.
    let baselineDate: string | null = null;
    let baselineQty = 0;
    for (const m of list) {
      if (m.kind !== 'inventura') continue;
      if (baselineDate === null || m.date >= baselineDate) {
        baselineDate = m.date;
        baselineQty = m.qty;
      }
    }

    const byKind: Partial<Record<MovementKind, number>> = {};
    let qty = baselineQty;
    for (const m of list) {
      if (m.kind === 'inventura') continue;
      // Pohyby v den inventury i po něm. Inventura se dělá k ránu, takže co se
      // ten den stočilo/vydalo, se do stavu promítne.
      if (baselineDate !== null && m.date < baselineDate) continue;
      qty += m.qty;
      byKind[m.kind] = (byKind[m.kind] ?? 0) + m.qty;
    }

    const [beer_id, package_id] = key.split('__');
    out.set(key, { key, beer_id, package_id, qty, baselineDate, baselineQty, byKind });
  });

  return out;
}

/**
 * Stav skladu k RÁNU zadaného dne (než se ten den cokoli stočí nebo vydá).
 *
 * Inventura datovaná na ten den se ZAPOČÍTÁ — dělá se ráno a popisuje právě
 * ten výchozí stav. Ostatní pohyby toho dne se nezapočítají, ty patří už do
 * probíhajícího dne. Používá „co je potřeba stočit" pro stav v pondělí ráno.
 */
export function stockAtStartOfDay(movements: Movement[], dateISO: string): Map<string, StockLine> {
  return stockAsOf(
    movements.filter((m) => (m.kind === 'inventura' ? m.date <= dateISO : m.date < dateISO)),
    dateISO
  );
}

/** Zkratka: jen množství, bez rozpadu. */
export function stockMapAsOf(movements: Movement[], dateISO: string): Record<string, number> {
  const map: Record<string, number> = {};
  stockAsOf(movements, dateISO).forEach((line, key) => { map[key] = line.qty; });
  return map;
}

/**
 * Očekávaný (teoretický) stav ke konci měsíce — základ pro inventuru.
 *
 * Proti stockAsOf() je tu jeden zásadní rozdíl: inventury zapsané UVNITŘ
 * počítaného měsíce se do výpočtu nezahrnou. Ony jsou totiž právě to, s čím
 * se očekávaný stav porovnává — kdyby se braly jako výchozí bod, rozdíl by
 * po uložení fyzické inventury vždycky vyšel nula a manko by nešlo zjistit.
 * Výchozím bodem je poslední inventura K PRVNÍMU DNI MĚSÍCE nebo starší
 * (typicky „Počáteční stav" převedený z minulého měsíce).
 */
export function expectedForMonth(movements: Movement[], monthKey: string): Map<string, StockLine> {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const bezInventurVMesici = movements.filter(
    (mv) => !(mv.kind === 'inventura' && mv.date > monthStart && mv.date <= monthEnd)
  );
  return stockAsOf(bezInventurVMesici, monthEnd);
}

/**
 * Pohyby jedné položky za období — pro obrazovku „proč je tam tohle číslo".
 * Vrací je seřazené od nejnovějšího.
 */
export function movementsFor(
  movements: Movement[],
  beerId: string,
  packageId: string,
  fromISO?: string,
  toISO?: string
): Movement[] {
  return movements
    .filter((m) => m.beer_id === beerId && m.package_id === packageId)
    .filter((m) => (!fromISO || m.date >= fromISO) && (!toISO || m.date <= toISO))
    .sort((a, z) => (z.date < a.date ? -1 : z.date > a.date ? 1 : 0));
}
