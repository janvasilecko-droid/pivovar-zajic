// 📷 Fotka objednávky → kolik objednávek z ní uložení založí.
// ---------------------------------------------------------------------------
// Každý řádek z fotky si nese vlastního odběratele (screenshot se dvěma
// okny WhatsAppu = dvě objednávky). Z provozu 7. 10. 2026: na fotce
// 1,5l lahví měl odběratele „Restaurace" jen první řádek, ostatní žádného
// a hlavní odběratel nahoře zůstal prázdný. Uložily se DVĚ objednávky —
// 5× 1,5 l 12° pro Restauraci a zbytek bez odběratele — a po přesunu té
// druhé na víkend „najednou tam zbylo 5× 1,5 12sv".
//
// Odběratel napsaný jen u části řádků proto platí pro celou fotku, pokud
// je jediný. Víc různých odběratelů = víc objednávek jako dosud, jen se to
// před uložením řekne nahlas (objednavkyZFotky).

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Odběratel každého řádku při uložení ('' = bez odběratele).
 *
 * Řádek bez vlastního odběratele dostane hlavního (vybraného nahoře). Když
 * hlavní chybí a řádky jmenují jediného odběratele, platí ten pro všechny.
 */
export function odberatelRadku(radky: Array<string | null | undefined>, hlavni: string | null | undefined): string[] {
  const vlastni = radky.map((r) => (r ?? '').trim());
  const hl = (hlavni ?? '').trim();
  if (hl) return vlastni.map((r) => r || hl);
  const jmenovani = vlastni.filter(Boolean);
  if (jmenovani.length > 0 && new Set(jmenovani.map(norm)).size === 1) {
    // Jedno jméno i pro „Restaurace" / „restaurace" — skupiny se dělí podle textu.
    return vlastni.map(() => jmenovani[0]);
  }
  return vlastni;
}

/** Objednávky, které uložení založí, v pořadí řádků: odběratel a počet položek. */
export function objednavkyZFotky(odberatele: string[]): { odberatel: string; polozek: number }[] {
  const pocty = new Map<string, number>();
  for (const o of odberatele) pocty.set(o, (pocty.get(o) ?? 0) + 1);
  return [...pocty].map(([odberatel, polozek]) => ({ odberatel, polozek }));
}
