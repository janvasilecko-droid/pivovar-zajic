// Rychlé volby množství podle SKUTEČNĚ nejčastěji použitých hodnot pro dané
// pivo+obal v minulém kalendářním měsíci — na rozdíl od pevně daných hodnot
// v QuickQtySelect.tsx (které jsou stejné pro všechny piva stejného typu
// obalu), tohle se přizpůsobí konkrétní kombinaci pivo+obal podle historie.

export type QtyHistoryRow = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number | null;
  entry_date: string | null;
};

// Pevné rychlé hodnoty pro zadávání STÁČENÍ (na rozdíl od topQuantitiesLastMonth
// výše, které je dynamické podle historie) — stejné pro všechny piva daného
// typu obalu, podle nejčastěji stáčených dávek.
const QUICK_QTY_STACKING_KEG = [6, 12, 18, 24];
const QUICK_QTY_STACKING_PET = [12, 24, 40, 50];
const QUICK_QTY_STACKING_GLASS = [20, 40, 60, 80, 100];

export function stackingQuickQtys(pkg: { kind?: string; volume_l?: number | string } | null | undefined): number[] {
  if (!pkg) return [];
  if (pkg.kind === 'keg') return QUICK_QTY_STACKING_KEG;
  const v = Number(pkg.volume_l);
  if (v === 0.33 || v === 0.5) return QUICK_QTY_STACKING_GLASS;
  if (v === 1 || v === 1.5) return QUICK_QTY_STACKING_PET;
  return [];
}

/** Kolik měsíců zpět se počítá „nejčastěji", než se sáhne po celé historii. */
const OKNO_MESICU = 12;

function hraniceOkna(dnes: Date): string {
  const d = new Date(dnes.getFullYear(), dnes.getMonth() - OKNO_MESICU, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Spočítá, kolikrát se která hodnota u daného piva+obalu zadala. */
function cetnosti(
  rows: QtyHistoryRow[],
  beerId: string,
  packageId: string,
  odData: string | null,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.beer_id !== beerId || r.package_id !== packageId) continue;
    if (odData && (!r.entry_date || r.entry_date < odData)) continue;
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  return counts;
}

/**
 * 🔢 Tři (nebo `pocet`) nejčastěji zadávané počty pro KONKRÉTNÍ pivo + obal.
 *
 * Zadání 22. 9. 2026: „u objednávek, lahví, keg, ty hodnoty před + dávej tam
 * vždy 3 nejčastěji zadávané pro daný druh a obal."
 *
 * Dřív to bylo rozdvojené a ani jedno nesedělo: Stáčení KEG i Lahve nabízely
 * PEVNÉ hodnoty (6/12/18/24 pro každé pivo stejně) a Objednávky sice počítaly
 * z historie, ale jen z MINULÉHO kalendářního měsíce — takže u piva, které se
 * minulý měsíc nestáčelo, nenabídly nic, a prvního v měsíci zmizely skoro
 * všude.
 *
 * Proto: počítá se z posledních 12 měsíců; když z nich není nic (nové pivo,
 * nový obal), vezme se celá historie; a když ani ta nestačí na `pocet`
 * hodnot, doplní se ze `zaloha` (pevné hodnoty podle typu obalu). Tlačítka
 * tak jsou vždycky tři, nikdy jich nebude míň.
 *
 * Řadí se vzestupně podle hodnoty (aby tlačítka nepřeskakovala); o to, KTERÉ
 * tři to jsou, rozhoduje četnost a při shodě vyšší hodnota — obvykle
 * typičtější „plná" dávka.
 */
export function nejcastejsiMnozstvi(
  rows: QtyHistoryRow[],
  beerId: string | null | undefined,
  packageId: string | null | undefined,
  zaloha: number[] = [],
  pocet = 3,
  dnes = new Date(),
): number[] {
  const doplnZeZalohy = (vybrane: number[]) => {
    for (const q of zaloha) {
      if (vybrane.length >= pocet) break;
      if (q > 0 && !vybrane.includes(q)) vybrane.push(q);
    }
    return vybrane.slice(0, pocet).sort((a, b) => a - b);
  };

  if (!beerId || !packageId || !rows?.length) return doplnZeZalohy([]);

  let counts = cetnosti(rows, beerId, packageId, hraniceOkna(dnes));
  if (counts.size === 0) counts = cetnosti(rows, beerId, packageId, null);

  const podleCetnosti = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, pocet)
    .map(([q]) => q);

  return doplnZeZalohy(podleCetnosti);
}
