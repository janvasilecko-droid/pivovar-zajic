import { nacti, uloz } from './uloziste';
/**
 * Zaškrtávací políčko „Druhé auto (Kačena)“ v Závozu.
 *
 * Označení je vázané na konkrétní závoz (= den rozvozu v Závozu), ne na jedno
 * datum: do localStorage ukládáme všechna konkrétní data (YYYY-MM-DD), na která
 * se objednávky označeného závozu vážou (delivery_date ?? order_date). Auto-generátor
 * Knihy jízd (KnihaJizdScreen) pak každý den, jehož datum je v tomto seznamu,
 * zapíše na druhé vozidlo.
 */

const STORAGE_KEY = 'zavoz_second_car_dates';

export function getSecondCarDates(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
  } catch {
    return [];
  }
}

function saveSecondCarDates(dates: string[]) {
  try {
    uloz(STORAGE_KEY, JSON.stringify(dates));
  } catch {
    // offline / plná kvóta — ignorujeme, aplikace funguje i bez uložení
  }
}

/** Přepne označení dne pro druhé auto a vrátí nový seznam dat. */
export function toggleSecondCarDate(date: string): string[] {
  const current = getSecondCarDates();
  const next = current.includes(date)
    ? current.filter((d) => d !== date)
    : [...current, date];
  saveSecondCarDates(next);
  return next;
}

type ZavozOrderLike = {
  delivery_date?: string | null;
  order_date?: string | null;
};
type ZavozGroupEntry = ZavozOrderLike | (ZavozOrderLike & { isGroup?: boolean; orders?: ZavozOrderLike[] });

/**
 * Vrátí všechna konkrétní data (YYYY-MM-DD), na která se vážou objednávky
 * jednoho závozu (skupiny dne v Závozu). Objednávka může mít delivery_date
 * (skutečné doručení) jiné než order_date; závoz proto může pokrývat více
 * dat a všechna se vracejí, aby se označení „Druhé auto (Kačena)“ vztáhlo
 * na celý závoz. Podskupiny SPOLEČNÉHO ZÁVOZU (isGroup) se rozbalí.
 */
export function collectZavozDates(groupOrders: ZavozGroupEntry[]): string[] {
  const dates = new Set<string>();
  for (const entry of groupOrders) {
    if (!entry) continue;
    const isGroup = (entry as ZavozOrderLike & { isGroup?: boolean }).isGroup;
    const orderList = isGroup ? (entry as ZavozOrderLike & { orders?: ZavozOrderLike[] }).orders ?? [] : [entry];
    for (const o of orderList) {
      if (!o) continue;
      if (o.delivery_date) dates.add(o.delivery_date);
      else if (o.order_date) dates.add(o.order_date);
    }
  }
  return [...dates];
}

/**
 * Přepne označení celého závozu pro druhé auto.
 * Jedno zaškrtnutí v Závozu označí VŠECHNA data, na která se objednávky daného
 * závozu vážou (skupina může mít objednávky s více daty). Když už je některé
 * z nich označené, závoz se odškrtne a tato data se odeberou.
 */
export function toggleSecondCarDates(dates: string[]): string[] {
  const validDates = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (validDates.length === 0) return getSecondCarDates();

  const current = new Set(getSecondCarDates());
  const hasAny = validDates.some((d) => current.has(d));

  if (hasAny) {
    validDates.forEach((d) => current.delete(d));
  } else {
    validDates.forEach((d) => current.add(d));
  }

  const next = [...current].sort();
  saveSecondCarDates(next);
  return next;
}

/**
 * Zaškrtávátko „Druhé auto (Kačena)" PO JEDNOTLIVÝCH OBJEDNÁVKÁCH.
 *
 * Na rozdíl od výše (celý den najednou) tohle umožní, aby stejný den jela
 * část objednávek Kačenou a část velkým autem — generátor Knihy jízd pak
 * takový smíšený den rozdělí na dvě jízdy.
 */
const ORDER_STORAGE_KEY = 'zavoz_second_car_order_ids';

export function getSecondCarOrderIds(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveSecondCarOrderIds(ids: string[]) {
  try {
    uloz(ORDER_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // offline / plná kvóta — ignorujeme, aplikace funguje i bez uložení
  }
}

export function isOrderKachna(orderId: string): boolean {
  return getSecondCarOrderIds().includes(orderId);
}

/** Přepne označení JEDNÉ objednávky pro druhé auto. */
export function toggleOrderKachna(orderId: string): string[] {
  const current = getSecondCarOrderIds();
  const next = current.includes(orderId)
    ? current.filter((id) => id !== orderId)
    : [...current, orderId];
  saveSecondCarOrderIds(next);
  return next;
}

/**
 * Hromadné přepnutí pro celý den (pohodlné tlačítko u nadpisu dne v Závozu):
 * pokud je označená alespoň jedna z objednávek, celý den se odškrtne;
 * jinak se označí všechny objednávky dne najednou.
 */
export function toggleOrdersKachna(orderIds: string[]): string[] {
  const validIds = orderIds.filter(Boolean);
  if (validIds.length === 0) return getSecondCarOrderIds();

  const current = new Set(getSecondCarOrderIds());
  const hasAny = validIds.some((id) => current.has(id));

  if (hasAny) {
    validIds.forEach((id) => current.delete(id));
  } else {
    validIds.forEach((id) => current.add(id));
  }

  const next = [...current];
  saveSecondCarOrderIds(next);
  return next;
}

/**
 * Jednorázová migrace ze starého (datumového) označení na nové (po objednávkách).
 * Stará data neumí říct, KTERÉ konkrétní objednávky daného dne jely Kačenou —
 * proto při migraci označíme VŠECHNY objednávky dané objednávkové sady, jejichž
 * datum bylo dřív označené (zachová dosavadní efektivní chování). Nic se
 * nestane, pokud už migrace proběhla (nový klíč v localStorage existuje) nebo
 * staré označení chybí.
 */
export function migrateSecondCarDatesToOrders(
  orders: { id: string; delivery_date?: string | null; order_date?: string | null }[]
): void {
  try {
    if (localStorage.getItem(ORDER_STORAGE_KEY) !== null) return;
    const legacyDates = new Set(getSecondCarDates());
    if (legacyDates.size === 0) return;

    const migratedIds = orders
      .filter((o) => legacyDates.has(o.delivery_date || o.order_date || ''))
      .map((o) => o.id);

    saveSecondCarOrderIds(migratedIds);
  } catch {
    // ignorujeme — appka funguje i bez migrace, jen se ztratí staré označení
  }
}

// ---------------------------------------------------------------------------
// Kačena v DATABÁZI (orders.second_car, migrace 20261231390000)
// ---------------------------------------------------------------------------
// Dřív se označení držela jen v localStorage jednoho prohlížeče: jiný telefon
// ani Kniha jízd na druhém zařízení o něm nevěděly a generátor zapsal jízdu na
// špatné auto. Teď je zdrojem pravdy sloupec orders.second_car. Dokud se
// migrace nepustí, sloupec v načtených objednávkách chybí (undefined) a všechno
// se chová jako dřív — podle prohlížeče.

export type ObjednavkaKachna = {
  id: string;
  second_car?: boolean | null;
  delivery_date?: string | null;
  order_date?: string | null;
};

/** Sloupec orders.second_car v databázi už je (bez migrace v načtených řádcích chybí). */
export function kachnaVDatabazi(objednavky: Pick<ObjednavkaKachna, 'second_car'>[]): boolean {
  return objednavky.some((o) => o.second_car !== undefined);
}

/** Jede objednávka druhým autem? Podle databáze; bez sloupce podle označení v prohlížeči. */
export function jeKachna(o: Pick<ObjednavkaKachna, 'id' | 'second_car'>): boolean {
  return typeof o.second_car === 'boolean' ? o.second_car : isOrderKachna(o.id);
}

const PRENESENO_KLIC = 'zavoz_second_car_preneseno_ids';
/** Kolik dní zpět se označení z prohlížeče přenáší — starší se nepřenáší, ať nevstane z mrtvých to, co už někdo jinde odškrtl. */
export const PRENOS_DNI = 60;

function odectiDny(iso: string, dny: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dny);
  return d.toISOString().slice(0, 10);
}

/** Id objednávek, jejichž označení z tohoto prohlížeče už se do databáze přenášelo. */
export function getPrenesenoKachny(): string[] {
  try {
    const parsed = JSON.parse(nacti(PRENESENO_KLIC) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pridejPrenesenoKachny(ids: string[]): void {
  if (ids.length === 0) return;
  uloz(PRENESENO_KLIC, JSON.stringify([...new Set([...getPrenesenoKachny(), ...ids])]));
}

/**
 * Která označení z tohoto prohlížeče se mají jednorázově přenést do databáze:
 * objednávky z posledních PRENOS_DNI dní, které databáze zatím nemá označené
 * (second_car = false), prohlížeč ano a ještě se nepřenášely. Přenáší se každá
 * objednávka nejvýš jednou — kdo ji pak v databázi odškrtne, ten ji tím
 * odškrtnul, ať je v prohlížeči zbytek starého označení jakýkoli. Objednávka
 * bez data se nepřenáší (nehádá se, jak je stará).
 */
export function kachnyKPrenosu(
  objednavky: ObjednavkaKachna[],
  mistni: string[],
  uzPreneseno: string[],
  dnes: string,
): string[] {
  if (mistni.length === 0) return [];
  const mistniSada = new Set(mistni);
  const hotove = new Set(uzPreneseno);
  const hranice = odectiDny(dnes, PRENOS_DNI);
  return objednavky
    .filter((o) =>
      o.second_car === false
      && mistniSada.has(o.id)
      && !hotove.has(o.id)
      && (o.delivery_date || o.order_date || '') >= hranice)
    .map((o) => o.id);
}
