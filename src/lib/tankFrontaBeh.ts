/**
 * Spouštění fronty tankových odečtů proti databázi.
 *
 * Oddělené od `tankFronta.ts` schválně: tam je logika fronty (a je celá
 * otestovaná bez databáze), tady je jen napojení na Supabase a na okamžiky,
 * kdy má cenu to zkusit — start aplikace a návrat sítě.
 */

import { supabase } from './supabase';
import {
  zpracujFrontu, frontaTanku, pocetVeFronte, type OdecetVeFronte, type VysledekOdectu,
} from './tankFronta';
import { chybiTabulka } from './chybyHlaseni';

/** Opakování jednoho odečtu — vždy přes klíč idempotence. */
async function provedOdecet(p: OdecetVeFronte): Promise<VysledekOdectu> {
  const { data, error } = await supabase.rpc('adjust_tank_volume_once', {
    p_tank_id: p.tankId,
    p_delta_l: p.deltaL,
    p_klic: p.klic,
    p_zdroj: 'fronta',
  });
  if (error) {
    // Migrace 20261227020000 ještě neproběhla — fronta si položku nechá a
    // zkusí to, až funkce bude existovat. Do té doby to není chyba k řešení.
    if (chybiTabulka(error) || (error.message ?? '').includes('adjust_tank_volume_once')) {
      return { stav: 'chyba', chyba: 'Funkce adjust_tank_volume_once ještě není v databázi (chybí migrace).' };
    }
    return { stav: 'chyba', chyba: error.message };
  }
  // Funkce vrací 'provedeno' | 'jiz_provedeno' | 'nic'. Cokoliv z toho
  // znamená, že se položka vyřešila a nemá se zkoušet znovu.
  return { stav: data === 'jiz_provedeno' ? 'jiz_provedeno' : 'provedeno' };
}

let bezi = false;

/** Zkusí frontu vyprázdnit. Nikdy nevyhodí výjimku. */
export async function spustFrontuTanku(): Promise<{ hotovo: number; selhalo: number; zbyva: number }> {
  const prazdno = { hotovo: 0, selhalo: 0, zbyva: 0 };
  if (bezi) return prazdno;
  try {
    if (frontaTanku().length === 0) return prazdno;
    // Bez přihlášení RPC stejně skončí na „Authentication required" —
    // zbytečně by to jen připočetlo pokusy.
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
    if (!user) return { ...prazdno, zbyva: pocetVeFronte() };
    bezi = true;
    return await zpracujFrontu(provedOdecet);
  } catch {
    return { ...prazdno, zbyva: pocetVeFronte() };
  } finally {
    bezi = false;
  }
}

/**
 * Napojí frontu na start aplikace a na návrat sítě. Vrací funkci pro
 * odhlášení (kvůli hot reloadu a testům).
 */
export function zapniFrontuTanku(): () => void {
  const naSit = () => { void spustFrontuTanku(); };
  window.addEventListener('online', naSit);
  // Po startu s krátkým odkladem: nejdřív ať se stihne přihlášení, jinak
  // by první pokus jen zbytečně spálil jeden z osmi.
  const casovac = setTimeout(naSit, 8000);
  return () => {
    window.removeEventListener('online', naSit);
    clearTimeout(casovac);
  };
}
