/**
 * Evidence vratných KEG sudů u odběratelů („Konto sudů").
 *
 * Jeden řádek = jeden pohyb sudu daného objemu:
 *   'out' = sud odjel k odběrateli (při závozu)
 *   'in'  = sud se vrátil do pivovaru
 * Zůstatek u odběratele = odvezeno − vráceno, po objemech.
 *
 * Ukládá se do databáze (tabulka keg_returns), ne do prohlížeče — evidence
 * dlužných sudů musí být vidět všem a přežít vymazání dat prohlížeče.
 */
import { supabase } from './supabase';
import { businessDateISO } from './businessDate';

export type KegMovement = {
  id: string;
  entry_date: string;
  place_id: string | null;
  place_name: string | null;
  order_id: string | null;
  volume_l: number;
  direction: 'in' | 'out';
  quantity: number;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

/** Zůstatek sudů u jednoho odběratele, rozpadlý po objemech. */
export type KegBalance = {
  placeId: string | null;
  placeName: string;
  /** volume_l → počet sudů, které odběratel dluží (kladné = má je u sebe). */
  byVolume: Record<number, number>;
  total: number;
};

/** "50L" → 50. Modal pracuje s textovými velikostmi. */
export function parseKegSize(size: string): number {
  return Number(String(size).replace(/[^\d.]/g, '')) || 0;
}

export async function fetchKegMovements(): Promise<KegMovement[]> {
  const { data, error } = await supabase
    .from('keg_returns')
    .select('*')
    .order('entry_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KegMovement[];
}

/**
 * Zapíše vrácené sudy. Vrací text chyby, nebo null při úspěchu — volající
 * MUSÍ návratovou hodnotu zkontrolovat a při chybě uživateli nehlásit úspěch
 * (přesně tohle byla původní chyba: appka hlásila „Zaznamenáno" a neukládala nic).
 */
export async function saveKegReturns(opts: {
  returns: { size: string; count: number }[];
  placeId?: string | null;
  placeName?: string | null;
  orderId?: string | null;
  recordedBy?: string | null;
  note?: string | null;
}): Promise<string | null> {
  const rows = opts.returns
    .filter((r) => r.count > 0)
    .map((r) => ({
      entry_date: businessDateISO(),
      place_id: opts.placeId || null,
      place_name: opts.placeName || null,
      order_id: opts.orderId || null,
      volume_l: parseKegSize(r.size),
      direction: 'in' as const,
      quantity: r.count,
      note: opts.note || null,
      recorded_by: opts.recordedBy || null,
    }))
    .filter((r) => r.volume_l > 0);

  if (rows.length === 0) return 'Nezadali jste žádný vrácený sud.';

  const { error } = await supabase.from('keg_returns').insert(rows);
  return error ? error.message : null;
}

/**
 * Zapíše sudy, které odjely k odběrateli — volá se při označení objednávky
 * za zavezenou, aby konto sudů znalo obě strany pohybu.
 */
export async function saveKegsOut(opts: {
  items: { volume_l: number; quantity: number }[];
  placeId?: string | null;
  placeName?: string | null;
  orderId?: string | null;
  recordedBy?: string | null;
}): Promise<string | null> {
  const rows = opts.items
    .filter((i) => i.quantity > 0 && i.volume_l > 0)
    .map((i) => ({
      entry_date: businessDateISO(),
      place_id: opts.placeId || null,
      place_name: opts.placeName || null,
      order_id: opts.orderId || null,
      volume_l: i.volume_l,
      direction: 'out' as const,
      quantity: i.quantity,
      recorded_by: opts.recordedBy || null,
    }));
  if (rows.length === 0) return null;
  const { error } = await supabase.from('keg_returns').insert(rows);
  return error ? error.message : null;
}

/** Spočítá zůstatky sudů po odběratelích (kdo kolik dluží). */
export function computeKegBalances(movements: KegMovement[]): KegBalance[] {
  const map = new Map<string, KegBalance>();
  for (const m of movements) {
    const key = m.place_id || `name:${(m.place_name || '').toLowerCase()}`;
    if (!key || key === 'name:') continue;
    let entry = map.get(key);
    if (!entry) {
      entry = { placeId: m.place_id, placeName: m.place_name || 'Neznámý odběratel', byVolume: {}, total: 0 };
      map.set(key, entry);
    }
    const vol = Number(m.volume_l);
    const delta = m.direction === 'out' ? m.quantity : -m.quantity;
    entry.byVolume[vol] = (entry.byVolume[vol] || 0) + delta;
    entry.total += delta;
  }
  // Odběratele bez otevřených sudů (vše vrácené) nemá smysl ukazovat.
  return [...map.values()].filter((b) => b.total !== 0).sort((a, b) => b.total - a.total);
}
