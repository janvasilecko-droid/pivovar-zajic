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

/**
 * Je to NAPOČÍTANÝ STAV (fyzická/schválená inventura), nebo VÝCHOZÍ ZÁKLAD
 * (počáteční stav převedený z minulého měsíce)?
 *
 * Rozdíl je zásadní pro expectedForMonth: obojí se ukládá k PRVNÍMU DNI
 * měsíce, ale očekávaný stav se musí počítat od základu — kdyby vycházel z
 * napočítaného stavu, porovnával by se sám se sebou.
 */
function jeNapocitanyStav(note: string | null | undefined): boolean {
  return inventoryPriority(note) >= 2;
}

// Sud spotřebovaný jako zdroj stáčení lahví. Řádek stáčení nese kegs_used,
// ale ne vždy i kegs_used_package_id — pak se obal dopočítá z objemu.
function resolveKegsUsed(
  row: any,
  packages: { id: string; kind: string; volume_l: number }[]
): { kegPkgId: string; kegsUsed: number } | null {
  const kegsUsed = Number(row.kegs_used || 0);
  if (kegsUsed === 0) return null;
  // ZÁPORNÁ hodnota = oprava manka: lahve se nenastáčely, takže se sudy
  // nenačaly a vracejí se do skladu. Dřív se takový řádek zahodil (podmínka
  // byla `<= 0`) a sudy zůstaly odepsané, i když se z nich nestáčelo.
  if (row.kegs_used_package_id) return { kegPkgId: row.kegs_used_package_id, kegsUsed };
  // Bez určeného obalu se vratka dopočítat nedá — dělení záporným počtem by
  // hledalo obal se záporným objemem.
  if (kegsUsed < 0) return null;
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

  // Inventura — reset stavu. Při shodném datu vyhraje řádek s vyšší prioritou,
  // ALE napočítaný stav a počáteční základ se drží ZVLÁŠŤ, i když mají stejné
  // datum (a ony ho mají — obojí se ukládá k prvnímu dni měsíce). Kdyby se
  // slily do jednoho, přebil by napočítaný stav ten počáteční a
  // expectedForMonth by neměl od čeho počítat: očekávaný stav by vycházel z
  // právě napočítané skutečnosti a manko by se o celý měsíc pohybů rozjelo.
  const invByKeyDate = new Map<string, { qty: number; prio: number; note: string | null }>();
  (src.inventoryRows ?? []).forEach((r) => {
    if (!r.beer_id || !r.package_id || !r.entry_date) return;
    const date = String(r.entry_date).slice(0, 10);
    const trida = jeNapocitanyStav(r.note) ? 'pocet' : 'zaklad';
    const k = `${date}|${stockKey(r.beer_id, r.package_id)}|${trida}`;
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

/**
 * Poznámka náhradního počátečního stavu, který dosazuje expectedForMonth.
 *
 * „Nezadaný" je tu schválně napsané: v tabulce žádný takový řádek neleží,
 * dosadila ho aplikace jako nulu, aby měla od čeho počítat. Karta Auditu
 * podle toho pozná, že rozdíl v počátečním stavu není chyba výpočtu, ale
 * chybějící údaj (viz lib/auditSkladu.ts).
 */
export const ZAKLAD_NEZADAN = 'Počáteční stav (nezadaný)';

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
  /** Poznámka té inventury. ZAKLAD_NEZADAN = dosazená nula, ne řádek z tabulky. */
  baselineNote?: string | null;
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
    // Poslední inventura k datu. Na jednom datu můžou ležet dvě (napočítaný
    // stav i počáteční základ — viz buildMovements); pak rozhoduje priorita,
    // ať výsledek nezávisí na pořadí řádků z databáze.
    let baselineDate: string | null = null;
    let baselineQty = 0;
    let baselinePrio = -1;
    let baselineNote: string | null = null;
    for (const m of list) {
      if (m.kind !== 'inventura') continue;
      const prio = inventoryPriority(m.note);
      if (baselineDate === null || m.date > baselineDate || (m.date === baselineDate && prio > baselinePrio)) {
        baselineDate = m.date;
        baselineQty = m.qty;
        baselinePrio = prio;
        baselineNote = m.note ?? null;
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
    out.set(key, { key, beer_id, package_id, qty, baselineDate, baselineQty, baselineNote, byKind });
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
 *
 * Pozor na datum: fyzická i schválená inventura se ukládá k PRVNÍMU dni
 * měsíce, ne k poslednímu (viz handleSaveActualStock v InventoryScreen.tsx).
 * Nestačí proto vyřadit inventury s datem VĚTŠÍM než první den — napočítaný
 * stav leží přesně na něm a stal by se výchozím bodem sám sobě. Očekávaný
 * stav by pak po uložení inventury poskočil přesně o pohyby za daný měsíc
 * a manko by ukázalo nesmysl.
 */
export function expectedForMonth(movements: Movement[], monthKey: string): Map<string, StockLine> {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const vMesici = (d: string) => d >= monthStart && d <= monthEnd;
  const bezInventurVMesici = movements.filter((mv) => {
    // Dorovnání zadané při TÉHLE inventuře taky ne. Obrazovka ho k
    // očekávanému stavu přičítá sama („Po dorovnání"), takže kdyby ho
    // započítala i skladová kniha, sedělo by dvakrát: po uložení a načtení
    // by „po dorovnání" ukázalo přesně tolik, o kolik se dorovnávalo, a
    // člověk by dorovnával pořád dokola. Pro skutečný sklad (stockAsOf) i
    // pro další měsíce se dorovnání počítá normálně.
    if (mv.kind === 'dorovnani') return !vMesici(mv.date);
    if (mv.kind !== 'inventura') return true;
    if (!vMesici(mv.date)) return true;
    // Uvnitř měsíce zůstane jen počáteční základ na jeho prvním dni.
    return mv.date === monthStart && !jeNapocitanyStav(mv.note);
  });

  // CHYBĚJÍCÍ POČÁTEČNÍ STAV JE NULA.
  //
  // Když k prvnímu dni měsíce leží jen NAPOČÍTANÁ inventura a „Počáteční stav"
  // chybí, filtr výše ji vyhodí a položce nezbude žádný výchozí bod. stockAsOf
  // pak sčítá pohyby od úplného začátku evidence — kdežto Sklad si napočítanou
  // inventuru vezme jako základ a počítá jen od ní. Obě obrazovky tak ukázaly
  // JINÉ POHYBY, přestože čtou tatáž data: v červenci 2026 hlásila Inventura
  // u Jantaru 1 l stočeno +115 a Sklad +92; těch 23 lahví bylo z června.
  //
  // Náhradou je nulový základ k prvnímu dni měsíce. Očekávaný stav se tím
  // počítá ze stejného okna jako Sklad, takže sloupce pohybů sedí a rozdíl
  // zůstane jen tam, kam patří — v počátečním stavu. Karta Auditu ho podle
  // poznámky ZAKLAD_NEZADAN pojmenuje jako chybějící údaj, ne jako chybu.
  const napocitaneVMesici = new Set<string>();
  for (const mv of movements) {
    if (mv.kind !== 'inventura' || !vMesici(mv.date) || !jeNapocitanyStav(mv.note)) continue;
    napocitaneVMesici.add(stockKey(mv.beer_id, mv.package_id));
  }
  const maZaklad = new Set<string>();
  for (const mv of bezInventurVMesici) {
    if (mv.kind !== 'inventura' || mv.date > monthStart) continue;
    maZaklad.add(stockKey(mv.beer_id, mv.package_id));
  }
  const nahradniZaklad: Movement[] = [];
  napocitaneVMesici.forEach((k) => {
    if (maZaklad.has(k)) return;
    const [beer_id, package_id] = k.split('__');
    nahradniZaklad.push({ date: monthStart, beer_id, package_id, qty: 0, kind: 'inventura', note: ZAKLAD_NEZADAN });
  });

  return stockAsOf(
    nahradniZaklad.length === 0 ? bezInventurVMesici : [...bezInventurVMesici, ...nahradniZaklad],
    monthEnd,
  );
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
