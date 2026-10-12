// Filtr obalů v Přehledu stáčení: lahve po velikostech a sudy ve třech
// skupinách — 50, 30 a „Ost." (20/15/10 l, stáčí se výjimečně).
//
// Majitel 12. 10. 2026: „do filtru přidej velikosti sudů 50, 30, Ost
// (ostatní 20, 15, 10; výjimečně se stáčí malé sudy, tak to stačí takhle),
// aby se dalo vyfiltrovat, kolik sudů 12 se třeba stočilo."
import { jeSud } from './inventoryFix';

type Obal = { id: string; kind?: string | null; label?: string | null; volume_l?: number | string | null };

export const FILTR_SUDU = [
  { id: 'sud:50', label: 'Sud 50l' },
  { id: 'sud:30', label: 'Sud 30l' },
  { id: 'sud:ost', label: 'Sud Ost.' },
] as const;

/** Patří záznam s tímhle obalem pod zvolený filtr (id obalu, nebo `sud:50` / `sud:30` / `sud:ost`)? */
export function odpovidaFiltruObalu(packageId: string | null | undefined, filtr: string, packages: Obal[]): boolean {
  if (!filtr) return true;
  if (!filtr.startsWith('sud:')) return packageId === filtr;
  const obal = packages.find((p) => p.id === packageId);
  if (!obal || !jeSud(obal.kind, obal.label)) return false;
  const objem = Number(obal.volume_l);
  if (filtr === 'sud:50') return objem === 50;
  if (filtr === 'sud:30') return objem === 30;
  return objem !== 50 && objem !== 30; // sud:ost = 20 / 15 / 10 a cokoli jiného
}
