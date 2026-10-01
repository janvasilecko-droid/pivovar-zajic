// 📅 Inventura počítaná až PO konci měsíce — porovnání k dnešku.
// ---------------------------------------------------------------------------
// Z provozu 1. 10. 2026: „v inventuře jsou 2×50 světlé a 2×50 tmavé, které
// dneska odchází, tudíž ve skladu jsou odečtené, tak ať se odečtou i z
// inventury" a „ve stáčení mám 100× 0,33 tmavé, nikam nešly, ale očekává
// se 0".
//
// Zářijová inventura se počítá 1. 10., kdy už část zboží odjela a jiné se
// stočilo. „Očekáváno" ke 30. 9. o tom neví, takže napočítané číslo nesedí
// v obou směrech. Tady se to srovná k dnešku: k očekávanému se přičtou
// pohyby od 1. dne dalšího měsíce do dneška, a napočítané číslo se při
// uložení přepočítá zpátky na konec měsíce (napočítaný stav patří
// k poslednímu dni, viz InventoryScreen handleSaveActualStock). Bez toho by
// se dnešní závoz od napočítaného stavu odečetl v říjnu podruhé.
//
// Uložená data se tím nemění: stav v databázi i v telefonu zůstává ke konci
// měsíce, k dnešku se jen ZOBRAZUJE a ZADÁVÁ.
import { konecMesice, stockKey, type Movement } from './stockLedger';
import { vychoziMesicInventury } from './inventoryFix';

export type PosunPoKonci = { celkem: number; odjelo: number; pribylo: number };

/** Pohyby po konci měsíce `monthKey` až do dneška včetně, po pivu × obalu. */
export function posunPoKonciMesice(pohyby: Movement[], monthKey: string, dnes: string): Map<string, PosunPoKonci> {
  const konec = konecMesice(monthKey);
  const out = new Map<string, PosunPoKonci>();
  if (dnes <= konec) return out;
  for (const m of pohyby) {
    if (m.kind === 'inventura' || m.date <= konec || m.date > dnes || !m.qty) continue;
    const k = stockKey(m.beer_id, m.package_id);
    const p = out.get(k) ?? { celkem: 0, odjelo: 0, pribylo: 0 };
    p.celkem += m.qty;
    if (m.qty < 0) p.odjelo += -m.qty; else p.pribylo += m.qty;
    out.set(k, p);
  }
  return out;
}

/**
 * Dává smysl počítat k dnešku? Jen když se inventura daného měsíce dělá teď
 * — měsíc skončil a jsme v okně, kdy ho appka sama nabízí (do 10. dne).
 * Starší měsíce se počítaly dávno a dnešní pohyby s nimi nemají nic společného.
 */
export function lzePocitatKDnesku(monthKey: string, dnes: string): boolean {
  return dnes > konecMesice(monthKey) && vychoziMesicInventury(dnes) === monthKey;
}

function cislo(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Uložený stav (ke konci měsíce) → co ukázat v políčku (k dnešku). */
export function naDnes(ulozeno: string | undefined, posun: number): string {
  if (ulozeno === undefined || ulozeno.trim() === '' || !posun) return ulozeno ?? '';
  const n = cislo(ulozeno);
  return Number.isFinite(n) ? String(n + posun) : ulozeno;
}

/** Zadáno v políčku (k dnešku) → co uložit (ke konci měsíce). */
export function zDnes(zadano: string, posun: number): string {
  if (zadano.trim() === '' || !posun) return zadano;
  const n = cislo(zadano);
  return Number.isFinite(n) ? String(n - posun) : zadano;
}
