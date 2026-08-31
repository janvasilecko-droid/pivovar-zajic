// 📌 Poznámky poslané VŠEM — společná nástěnka pivovaru.
// ---------------------------------------------------------------------------
// Běžné poznámky na ploše jsou OSOBNÍ: každý má svoje a synchronizují se mu
// napříč jeho zařízeními přes `profiles.home_layout` (viz homeNotes.ts).
// To zůstává — tenhle modul je vedle, ne místo toho.
//
// Občas ale potřebuje někdo vzkaz, který má vidět celá směna („zítra se stáčí
// od sedmi", „došly korunky"). Ten jde sem a vidí ho všichni. Odškrtnutí u
// společného vzkazu platí pro všechny: je to společný úkol, ne můj vlastní.
import { supabase } from './supabase';

export type SdilenaPoznamka = {
  id: string;
  text: string;
  autor: string | null;
  dulezite: boolean;
  hotovo: boolean;
  hotovo_kdo: string | null;
  created_at: string;
};

/** Změna společné nástěnky — obrazovky si na to sáhnou stejně jako u osobních. */
export const SDILENE_POZNAMKY_ZMENA = 'pivovar_sdilene_poznamky_zmena';

function oznamZmenu(): void {
  window.dispatchEvent(new CustomEvent(SDILENE_POZNAMKY_ZMENA));
}

/**
 * Načte společné vzkazy. Nejdřív důležité, pak nejnovější — nástěnka se čte
 * odshora a naléhavá věc nemá být schovaná pod týden starým vzkazem.
 */
export async function nactiSdilene(): Promise<SdilenaPoznamka[]> {
  const { data, error } = await supabase
    .from('sdilene_poznamky')
    .select('*')
    .order('dulezite', { ascending: false })
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as SdilenaPoznamka[];
}

export async function pridejSdilenou(
  text: string, autor?: string | null, dulezite = false,
): Promise<string | null> {
  const cistyText = text.trim();
  if (!cistyText) return 'Prázdný vzkaz.';
  const { error } = await supabase.from('sdilene_poznamky').insert({
    text: cistyText,
    autor: autor?.trim() || null,
    dulezite,
  });
  if (!error) oznamZmenu();
  return error?.message ?? null;
}

/** Odškrtnutí platí pro všechny — společný úkol, ne osobní. */
export async function prepniHotovo(
  p: SdilenaPoznamka, kdo?: string | null,
): Promise<string | null> {
  const hotovo = !p.hotovo;
  const { error } = await supabase.from('sdilene_poznamky').update({
    hotovo,
    hotovo_kdo: hotovo ? (kdo?.trim() || null) : null,
    hotovo_at: hotovo ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id);
  if (!error) oznamZmenu();
  return error?.message ?? null;
}

export async function prepniDulezite(p: SdilenaPoznamka): Promise<string | null> {
  const { error } = await supabase.from('sdilene_poznamky').update({
    dulezite: !p.dulezite,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id);
  if (!error) oznamZmenu();
  return error?.message ?? null;
}

export async function smazSdilenou(id: string): Promise<string | null> {
  const { error } = await supabase.from('sdilene_poznamky').delete().eq('id', id);
  if (!error) oznamZmenu();
  return error?.message ?? null;
}
