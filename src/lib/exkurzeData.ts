// 🏭 Exkurze — čtení a zápis proti databázi.
// ---------------------------------------------------------------------------
// Do 31. 8. 2026 žily výhradně v localStorage: ExkurzeScreen.tsx neměl jediný
// dotaz do databáze. Rezervace prohlídky tak existovala jen na jednom
// zařízení — a s ní i TRŽBA, což je účetní údaj. Ten nesmí záviset na tom,
// jestli si někdo nevyčistil prohlížeč.
//
// localStorage zůstává jako offline kopie: v pivovaru vypadává signál a
// prázdný kalendář prohlídek je horší než trochu starý.
import { supabase } from './supabase';
import type { ExkurzeEntry } from '../screens/ExkurzeScreen';

export const KLIC_EXKURZE = 'exkurze_entries_v1';

type Radek = {
  id: string; datum: string; cas: string; pocet_lidi: number;
  pruvodce: string | null; trzba: number | null; poznamka: string | null;
  archivovano_mesic: string | null; created_at: string;
};

function naExkurzi(r: Radek): ExkurzeEntry {
  return {
    id: r.id,
    tour_date: r.datum,
    tour_time: r.cas,
    people_count: r.pocet_lidi,
    guide_name: r.pruvodce ?? '',
    revenue: r.trzba ?? undefined,
    note: r.poznamka ?? undefined,
    archived_month: r.archivovano_mesic ?? undefined,
    created_at: r.created_at,
  };
}

function zExkurze(e: ExkurzeEntry) {
  return {
    id: e.id,
    datum: e.tour_date,
    cas: e.tour_time ?? '',
    pocet_lidi: Number(e.people_count) || 0,
    pruvodce: e.guide_name || null,
    trzba: e.revenue ?? null,
    poznamka: e.note ?? null,
    archivovano_mesic: e.archived_month ?? null,
    updated_at: new Date().toISOString(),
  };
}

function nactiKopii(): ExkurzeEntry[] {
  try {
    const raw = localStorage.getItem(KLIC_EXKURZE);
    return raw ? (JSON.parse(raw) as ExkurzeEntry[]) : [];
  } catch { return []; }
}

function ulozKopii(data: ExkurzeEntry[]): void {
  try { localStorage.setItem(KLIC_EXKURZE, JSON.stringify(data)); } catch { /* plná paměť */ }
}

/** Načte exkurze; bez sítě vrátí poslední známou kopii. */
export async function nactiExkurze(): Promise<ExkurzeEntry[]> {
  const { data, error } = await supabase
    .from('exkurze').select('*').order('datum', { ascending: false });
  if (error || !data) return nactiKopii();
  const seznam = (data as Radek[]).map(naExkurzi);
  ulozKopii(seznam);
  return seznam;
}

export async function ulozExkurzi(e: ExkurzeEntry): Promise<string | null> {
  const { error } = await supabase.from('exkurze').upsert(zExkurze(e), { onConflict: 'id' });
  return error?.message ?? null;
}

export async function smazExkurzi(id: string): Promise<string | null> {
  const { error } = await supabase.from('exkurze').delete().eq('id', id);
  return error?.message ?? null;
}

/**
 * Jednorázový převod toho, co komu zůstalo v prohlížeči.
 *
 * Běží při prvním načtení: je-li databáze prázdná a v prohlížeči něco je,
 * nahraje se to tam. Bez toho by lidem po nasazení „zmizely" exkurze, které
 * si vedli — jen proto, že se přestěhovaly do cloudu.
 *
 * Stará id (`crypto.randomUUID()` i starší tvary) se nahrazují novými: kdyby
 * některé nebylo platné uuid, databáze by celý převod odmítla.
 */
export async function prenesZProhlizece(): Promise<number> {
  const mistni = nactiKopii();
  if (mistni.length === 0) return 0;

  const { count } = await supabase.from('exkurze').select('*', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return 0; // v cloudu už něco je, nepřepisovat

  const kUlozeni = mistni.map((e) => zExkurze({ ...e, id: crypto.randomUUID() }));
  const { error } = await supabase.from('exkurze').insert(kUlozeni);
  return error ? 0 : kUlozeni.length;
}
