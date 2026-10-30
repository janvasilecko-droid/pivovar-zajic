// 🛢️🍾 Položky rozdělené na SUDY a LAHVE — pro zobrazení ve dvou sloupcích.
// Zadání 30. 10. 2026: „navrhni, aby ty položky byly ve 2 sloupcích, zvlášť
// lahve a zvlášť sudy" → „implementuj to do všech fasování a objednávek".
// Jen zobrazení: na tom, co se zapisuje do skladu, se nic nemění.
import { jeSud } from './inventoryFix';

type ObalProRozdeleni = { id: string; kind?: string | null; label?: string | null };
type PolozkaProRozdeleni = { package_id: string | null; package_label: string | null; quantity: number | string };

export type SudyLahve<T> = { sudy: T[]; lahve: T[]; kusuSudu: number; kusuLahvi: number };

/**
 * Rozdělí položky na sudy a lahve (pořadí uvnitř skupiny zůstává).
 * Druh se bere z číselníku obalů (`kind`), popisek je jen záloha — stejně
 * jako všude jinde v appce (viz `jeSud`).
 */
export function rozdelSudyLahve<T extends PolozkaProRozdeleni>(polozky: T[], obaly: ObalProRozdeleni[]): SudyLahve<T> {
  const sudy: T[] = [];
  const lahve: T[] = [];
  let kusuSudu = 0;
  let kusuLahvi = 0;
  for (const p of polozky) {
    const obal = p.package_id ? obaly.find((o) => o.id === p.package_id) : undefined;
    const ks = Number(p.quantity) || 0;
    if (jeSud(obal?.kind, obal?.label ?? p.package_label)) {
      sudy.push(p);
      kusuSudu += ks;
    } else {
      lahve.push(p);
      kusuLahvi += ks;
    }
  }
  return { sudy, lahve, kusuSudu, kusuLahvi };
}
