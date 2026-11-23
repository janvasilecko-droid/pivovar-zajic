// 🚚❌ „Bez závozu" — jak je to vidět v přehledu objednávek.
//
// Zadání 23. 11. 2026: „navrhni, ať jde v objednávkách líp vidět, jestli je
// objednávka bez závozu." Do té doby přehled sloupec `no_delivery` neukazoval
// vůbec: objednávka bez závozu měla štítek s autem a dnem jako každá jiná.
// Majitel vybral černý štítek na místě dne („udělej tu první, vypadá to
// dobře") a k němu vlastní skupinu na konci seznamu s filtrem nahoře.
import { useId } from 'react';

/** Přeškrtnuté auto — „tahle objednávka nejede". Barvu bere z okolního textu. */
export function IkonaBezZavozu({ size = 18, className = '' }: { size?: number; className?: string }) {
  const maska = useId();
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden="true"
    >
      {/* Maska vykousne z auta pruh pod škrtem, ať je škrt čitelný na každém podkladu. */}
      <mask id={maska} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" stroke="none" />
        <path d="m3 3 18 18" stroke="black" strokeWidth={5.5} />
      </mask>
      <g mask={`url(#${maska})`}>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </g>
      <path d="m3 3 18 18" />
    </svg>
  );
}

/**
 * Štítek na místě dne závozu: černý, ať se neplete s barvami dnů.
 * `maly` = velikost běžného štítku (tabulka, nadpis skupiny), jinak velký jako den na kartě.
 */
export function StitekBezZavozu({ maly = false }: { maly?: boolean }) {
  return maly ? (
    <span data-testid="stitek-bez-zavozu" className="chip bg-neutral-900 text-white font-black shadow-2xs ring-1 ring-neutral-500/60 shrink-0 flex items-center gap-1">
      <IkonaBezZavozu size={12} /> Bez závozu
    </span>
  ) : (
    <span data-testid="stitek-bez-zavozu" className="text-lg font-black leading-none px-2 py-1 rounded shrink-0 flex items-center gap-1 bg-neutral-900 text-white shadow-2xs ring-1 ring-neutral-500/60">
      <IkonaBezZavozu size={18} /> Bez závozu
    </span>
  );
}

/** Je objednávka bez závozu? Sloupec může chybět (starší řádek v paměti) — pak ne. */
export function jeBezZavozu(o: { no_delivery?: boolean | null }): boolean {
  return o.no_delivery === true;
}

/**
 * Seznam objednávek rozdělený pro přehled: nejdřív ty, co jedou závozem,
 * na konci ty bez závozu. Pořadí uvnitř obou částí se nemění.
 */
export function rozdelPodleZavozu<T extends { no_delivery?: boolean | null }>(objednavky: T[]): { seZavozem: T[]; bezZavozu: T[] } {
  const seZavozem: T[] = [];
  const bezZavozu: T[] = [];
  for (const o of objednavky) (jeBezZavozu(o) ? bezZavozu : seZavozem).push(o);
  return { seZavozem, bezZavozu };
}

/** „1 objednávka" / „3 objednávky" / „5 objednávek" */
export function pocetObjednavek(n: number): string {
  return `${n} ${n === 1 ? 'objednávka' : n >= 2 && n <= 4 ? 'objednávky' : 'objednávek'}`;
}

/** Nadpis skupiny „Bez závozu" na konci seznamu objednávek. */
export function NadpisBezZavozu({ pocet }: { pocet: number }) {
  return (
    <div data-testid="skupina-bez-zavozu" className="flex items-center gap-2">
      <span className="chip bg-neutral-900 text-white font-black shadow-2xs shrink-0 flex items-center gap-1">
        <IkonaBezZavozu size={12} /> Bez závozu
      </span>
      <span className="text-xs font-bold text-neutral-700">{pocetObjednavek(pocet)} — odběratel si bere sám</span>
      <span className="flex-1 border-t-2 border-dashed border-neutral-400" aria-hidden="true" />
    </div>
  );
}
