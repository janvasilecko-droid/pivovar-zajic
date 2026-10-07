// 🍺 Zápis tmavé složky Jantaru do sklepa (viz lib/jantar.ts).
//
// Oddělené od lib/jantar.ts schválně: tam jsou pravidla (a testy bez
// databáze), tady jen zápis přes Supabase. Používá to obrazovka KEG (zápis,
// úprava, smazání stáčení) i Sklep → Stáčení bez tanku.
import { supabase } from './supabase';
import { znackaJantaru } from './jantar';
import { znackaRezu } from './rezani';

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

/** Přetočení navázané na řádek stáčení — tmavá složka Jantaru i podíl řezu. */
export type PrelitiRadku = {
  id: string;
  from_tank_id: string | null;
  volume_l: number;
  note: string | null;
  beer_id: string | null;
  beer_name: string | null;
  transfer_date: string | null;
};

/**
 * Přetočení navázaná na řádek stáčení. Značky jsou `[jantar:<id>]` a
 * `[rez:<id>]` (lib/rezani.ts) — obě končí `:<id>]`, a id řádku je unikátní.
 */
export async function prelitiKRadku(keggingId: string): Promise<PrelitiRadku[]> {
  const { data } = await supabase
    .from('cellar_transfers')
    .select('id, from_tank_id, volume_l, note, beer_id, beer_name, transfer_date')
    .ilike('note', `%:${keggingId}]%`);
  return ((data as any[]) ?? [])
    .filter((r) => {
      const n = String(r.note ?? '');
      return n.includes(znackaJantaru(keggingId)) || n.includes(znackaRezu(keggingId));
    })
    .map((r) => ({
      id: r.id,
      from_tank_id: r.from_tank_id,
      volume_l: Number(r.volume_l || 0),
      note: r.note ?? null,
      beer_id: r.beer_id ?? null,
      beer_name: r.beer_name ?? null,
      transfer_date: r.transfer_date ?? null,
    }));
}

/**
 * Vrátí přetočení navázaná na řádek stáčení do jejich tanků a smaže je —
 * při smazání nebo úpravě řádku. Vrací smazaná přetočení (pro „Zpět").
 */
export async function vratPrelitiRadku(keggingId: string): Promise<PrelitiRadku[]> {
  const vracena: PrelitiRadku[] = [];
  for (const r of await prelitiKRadku(keggingId)) {
    const { error } = await supabase.from('cellar_transfers').delete().eq('id', r.id);
    if (error) continue;
    if (r.from_tank_id && r.volume_l) {
      await supabase.rpc('adjust_tank_volume', { p_tank_id: r.from_tank_id, p_delta_l: r.volume_l });
    }
    vracena.push(r);
  }
  return vracena;
}

/** „Zpět" po smazání řádku: přetočení se zapíšou a odečtou znovu, stejně jako byla. */
export async function obnovPreliti(preliti: PrelitiRadku[]): Promise<void> {
  for (const r of preliti) {
    const { error } = await supabase.from('cellar_transfers').insert({
      from_tank_id: r.from_tank_id,
      to_tank_id: null,
      volume_l: r.volume_l,
      loss_l: 0,
      beer_id: r.beer_id,
      beer_name: r.beer_name,
      transfer_date: r.transfer_date,
      note: r.note,
    });
    if (error) continue;
    if (r.from_tank_id && r.volume_l) {
      await supabase.rpc('adjust_tank_volume', { p_tank_id: r.from_tank_id, p_delta_l: -r.volume_l });
    }
  }
}

/**
 * Vrátí tmavou složku Jantaru (i podíl řezu) do tanku a smaže její
 * přetočení. Vrací, kolik litrů se vrátilo (0, když nic navázané nebylo).
 */
export async function vratTmavouJantaru(keggingId: string): Promise<number> {
  return (await vratPrelitiRadku(keggingId)).reduce((s, r) => s + (r.from_tank_id ? r.volume_l : 0), 0);
}

/**
 * Odečte podíl tanku B při řezu (lib/rezani.ts) a zapíše ho jako přetočení
 * „do řezu". Vrací chybu pro uživatele, nebo null.
 */
export async function odectiPodilRezu(p: {
  keggingId: string;
  tank: { id: string; label: string; current_beer_id?: string | null; current_beer_name?: string | null };
  litry: number;
  datum: string;
  popis: string;
}): Promise<string | null> {
  if (!(p.litry > 0)) return null;
  const { error } = await supabase.from('cellar_transfers').insert({
    from_tank_id: p.tank.id,
    to_tank_id: null,
    volume_l: p.litry,
    loss_l: 0,
    beer_id: p.tank.current_beer_id ?? null,
    beer_name: p.tank.current_beer_name ?? null,
    transfer_date: p.datum,
    note: `Do řezu: ${p.popis} ${znackaRezu(p.keggingId)}`,
  });
  if (error) return `Řez: podíl z ${p.tank.label} se nepodařilo zapsat (${error.message})`;
  const { error: chybaTanku } = await supabase.rpc('adjust_tank_volume', { p_tank_id: p.tank.id, p_delta_l: -p.litry });
  if (chybaTanku) return `Řez: objem ${p.tank.label} se nepodařilo snížit (${chybaTanku.message})`;
  return null;
}

/**
 * Změna počtu sudů u Jantaru (i řezu): navázané přetočení se přepočítá ve
 * stejném poměru jako objem řádku (stejně jako tank řádku v Kegging.tsx
 * updateKeggingQty).
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
