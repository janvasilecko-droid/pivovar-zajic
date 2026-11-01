// 🛢️ Štítek dlaždice Malé sudy na ploše („volné 2 ks" / „⚠ 3 ks nemá sud",
// 29. 9. 2026: „ty malé sudy udělej jako samostatnou dlaždici"). Plocha ho
// načítá až po startu (HomeScreen.tsx) — výpočet malých sudů s odjetými
// objednávkami (lib/maleSudy.ts, lib/useMaleSudy.ts) tak start appky
// nezvětšuje (scripts/zkontroluj-velikost.mjs, strop 260 kB gzip).
import { useEffect, useMemo } from 'react';
import { useHlidaniMalychSudu, useMaleSudy } from '../lib/useMaleSudy';
import type { SouhrnMalychSudu } from '../lib/maleSudy';

/** „volné N ks" (prázdné teď minus otevřené objednávky), „⚠ N ks nemá sud"; bez naklikaného počtu nic. */
export function stitekMalychSudu(souhrn: readonly SouhrnMalychSudu[]): string | undefined {
  if (souhrn.length === 0) return undefined;
  const nad = souhrn.reduce((a, s) => a + s.nad, 0);
  if (nad > 0) return `⚠ ${nad} ks nemá sud`;
  return `volné ${souhrn.reduce((a, s) => a + Math.max(0, s.mame - s.objednano), 0)} ks`;
}

/** Nic nekreslí — jen spočítá štítek a pošle ho ploše. */
export default function MaleSudyStitek({ onStitek }: { onStitek: (stitek: string | undefined) => void }) {
  const maleSudy = useMaleSudy();
  const { souhrn } = useHlidaniMalychSudu(maleSudy.zasoba, undefined, maleSudy.zapocitatPlne, maleSudy.zadanoKdy);
  const stitek = useMemo(() => stitekMalychSudu(souhrn), [souhrn]);
  useEffect(() => { onStitek(stitek); }, [stitek, onStitek]);
  return null;
}
