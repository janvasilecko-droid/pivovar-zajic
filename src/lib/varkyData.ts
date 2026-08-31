// 🗓️ Plánované várky (Plánovač obsazenosti tanků) — proti databázi.
// ---------------------------------------------------------------------------
// Do 31. 8. 2026 žily jen v localStorage: TankOccupancyPlanner.tsx importoval
// `supabase` POUZE kvůli typům a žádný dotaz nedělal. Kdo plánoval várky na
// tabletu, na mobilu je neviděl — a obsazenost tanků je zrovna věc, kterou si
// domlouvá víc lidí.
//
// localStorage zůstává jako offline kopie; ve sklepě bývá signál slabý.
import { supabase } from './supabase';
import type { PlannedBatch } from '../components/TankOccupancyPlanner';

export const KLIC_VARKY = 'cellar_planned_brews_data';

type Radek = {
  id: string; tank_id: string; pivo: string; objem_hl: number;
  datum_od: string; dnu: number; poznamka: string | null;
};

function naVarku(r: Radek): PlannedBatch {
  return {
    id: r.id,
    tankId: r.tank_id,
    beerName: r.pivo,
    volumeHl: Number(r.objem_hl) || 0,
    startDate: r.datum_od,
    targetDays: Number(r.dnu) || 30,
    note: r.poznamka ?? undefined,
  };
}

function zVarky(v: PlannedBatch) {
  return {
    id: v.id,
    tank_id: v.tankId,
    pivo: v.beerName || '',
    objem_hl: Number(v.volumeHl) || 0,
    datum_od: v.startDate,
    dnu: Number(v.targetDays) || 30,
    poznamka: v.note ?? null,
    updated_at: new Date().toISOString(),
  };
}

function nactiKopii(): PlannedBatch[] {
  try {
    const raw = localStorage.getItem(KLIC_VARKY);
    return raw ? (JSON.parse(raw) as PlannedBatch[]) : [];
  } catch { return []; }
}

function ulozKopii(data: PlannedBatch[]): void {
  try { localStorage.setItem(KLIC_VARKY, JSON.stringify(data)); } catch { /* plná paměť */ }
}

/** Načte plánované várky; bez sítě vrátí poslední známou kopii. */
export async function nactiVarky(): Promise<PlannedBatch[]> {
  const { data, error } = await supabase
    .from('planovane_varky').select('*').order('datum_od', { ascending: false });
  if (error || !data) return nactiKopii();
  const seznam = (data as Radek[]).map(naVarku);
  ulozKopii(seznam);
  return seznam;
}

export async function ulozVarku(v: PlannedBatch): Promise<string | null> {
  const { error } = await supabase.from('planovane_varky').upsert(zVarky(v), { onConflict: 'id' });
  return error?.message ?? null;
}

export async function smazVarku(id: string): Promise<string | null> {
  const { error } = await supabase.from('planovane_varky').delete().eq('id', id);
  return error?.message ?? null;
}

/**
 * Jednorázový převod toho, co komu zůstalo v prohlížeči.
 *
 * Stará id mají tvar `planned_1756...` (Date.now), což NENÍ uuid a databáze
 * by je odmítla — proto se každé nahradí novým. Várky vázané na tank, který
 * mezitím zmizel, se přeskočí: cizí klíč by celý převod shodil a kvůli jedné
 * osiřelé várce by se nepřenesla ani jedna platná.
 */
export async function prenesZProhlizece(platneTankIds: Set<string>): Promise<number> {
  const mistni = nactiKopii();
  if (mistni.length === 0) return 0;

  const { count } = await supabase.from('planovane_varky').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return 0; // v cloudu už něco je, nepřepisovat

  const kUlozeni = mistni
    .filter((v) => platneTankIds.has(v.tankId))
    .map((v) => zVarky({ ...v, id: crypto.randomUUID() }));
  if (kUlozeni.length === 0) return 0;

  const { error } = await supabase.from('planovane_varky').insert(kUlozeni);
  return error ? 0 : kUlozeni.length;
}
