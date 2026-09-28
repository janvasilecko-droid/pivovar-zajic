// 🍺 Zápis tmavé složky Jantaru do sklepa (viz lib/jantar.ts).
//
// Oddělené od lib/jantar.ts schválně: tam jsou pravidla (a testy bez
// databáze), tady jen zápis přes Supabase. Používá to obrazovka KEG (zápis,
// úprava, smazání stáčení) i Sklep → Stáčení bez tanku.
import { supabase } from './supabase';
import { znackaJantaru } from './jantar';

type TankTmave = { id: string; label: string; current_volume_l?: number | string | null };

/**
 * Odečte tmavou složku Jantaru z tanku tmavého a zapíše ji jako přetočení
 * „do Jantaru". Vrací upozornění pro uživatele, nebo null, když je vše v pořádku.
 */
export async function odectiTmavouJantaru(p: {
  keggingId: string;
  tank: TankTmave | undefined;
  tmavaL: number;
  datum: string;
  tmavaPivo?: { id: string; name: string };
  popis: string;
}): Promise<string | null> {
  if (p.tmavaL <= 0) return null;
  if (!p.tank) return `Jantar: tmavá složka (${p.tmavaL} l) se neodečetla — žádný tank tmavého se zahájeným stáčením`;
  const vTanku = Number(p.tank.current_volume_l ?? 0);
  if (p.tmavaL > vTanku + 1) {
    return `Jantar: ${p.tank.label} by se přečerpal (v tanku ${Math.round(vTanku)} l, chce se ${p.tmavaL} l) — tmavá složka se neodečetla`;
  }
  const { error } = await supabase.from('cellar_transfers').insert({
    from_tank_id: p.tank.id,
    to_tank_id: null,
    volume_l: p.tmavaL,
    loss_l: 0,
    beer_id: p.tmavaPivo?.id ?? null,
    beer_name: p.tmavaPivo?.name ?? null,
    transfer_date: p.datum,
    note: `Do Jantaru (20 % tmavého): ${p.popis} ${znackaJantaru(p.keggingId)}`,
  });
  if (error) return `Jantar: tmavou složku se nepodařilo zapsat (${error.message})`;
  const { error: chybaTanku } = await supabase.rpc('adjust_tank_volume', { p_tank_id: p.tank.id, p_delta_l: -p.tmavaL });
  if (chybaTanku) return `Jantar: objem ${p.tank.label} se nepodařilo snížit (${chybaTanku.message})`;
  return null;
}

/** Přetočení tmavé složky navázaná na řádek stáčení. */
async function prelitiKRadku(keggingId: string): Promise<{ id: string; from_tank_id: string | null; volume_l: number }[]> {
  const { data } = await supabase
    .from('cellar_transfers')
    .select('id, from_tank_id, volume_l, note')
    .ilike('note', `%${znackaJantaru(keggingId)}%`);
  return ((data as any[]) ?? []).map((r) => ({ id: r.id, from_tank_id: r.from_tank_id, volume_l: Number(r.volume_l || 0) }));
}

/**
 * Vrátí tmavou složku Jantaru do tanku a smaže její přetočení — při smazání
 * nebo úpravě řádku stáčení. Vrací, kolik litrů se vrátilo (0, když nic
 * navázané nebylo, třeba u starých zápisů).
 */
export async function vratTmavouJantaru(keggingId: string): Promise<number> {
  let vraceno = 0;
  for (const r of await prelitiKRadku(keggingId)) {
    const { error } = await supabase.from('cellar_transfers').delete().eq('id', r.id);
    if (error) continue;
    if (r.from_tank_id && r.volume_l) {
      await supabase.rpc('adjust_tank_volume', { p_tank_id: r.from_tank_id, p_delta_l: r.volume_l });
      vraceno += r.volume_l;
    }
  }
  return vraceno;
}

/**
 * Změna počtu sudů u Jantaru: tmavá složka se přepočítá ve stejném poměru
 * jako objem řádku (stejně jako u Světlé v Kegging.tsx updateKeggingQty).
 */
export async function upravTmavouJantaru(keggingId: string, stareKusy: number, noveKusy: number): Promise<void> {
  if (stareKusy <= 0) return;
  for (const r of await prelitiKRadku(keggingId)) {
    const novyObjem = Math.round((r.volume_l / stareKusy) * noveKusy * 10) / 10;
    const rozdil = novyObjem - r.volume_l;
    if (rozdil === 0) continue;
    const { error } = await supabase.from('cellar_transfers').update({ volume_l: novyObjem }).eq('id', r.id);
    if (error || !r.from_tank_id) continue;
    await supabase.rpc('adjust_tank_volume', { p_tank_id: r.from_tank_id, p_delta_l: -rozdil });
  }
}
