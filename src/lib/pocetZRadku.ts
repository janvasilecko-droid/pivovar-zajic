// 🔢 Počet kusů přímo z textu řádku objednávky — pojistka proti špatnému
// čtení AI. Z provozu 29. 9. 2026: „Maneo je špatně přečtené, píše mi to
// tam 10× 30 10°, ale v objednávce jsou 2× 30." AI si spletla stupeň (10°)
// s počtem kusů.
//
// Když řádek VÝSLOVNĚ píše „2x30" (nebo „30l 2x") a obal položky je 30 l,
// platí počet z textu. Jen když je pro ten objem na řádku jediná taková
// shoda — „3x30 12sv 2x30 10sv" nejde bez AI rozdělit, tam se nic nemění.

function stejnyObjem(a: string, objem: number): boolean {
  return Math.abs(Number(a.replace(',', '.')) - objem) < 0.001;
}

export function pocetZRadku(radek: string | null | undefined, objemObalu: number | null | undefined): number | null {
  if (!radek || !objemObalu || objemObalu <= 0) return null;
  const nalezy: number[] = [];
  // „2x30", „2 × 30l", „2*30"
  for (const m of radek.matchAll(/(?<![\d.,])(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*l?(?![\d])/gi)) {
    if (stejnyObjem(m[2], objemObalu)) nalezy.push(Number(m[1]));
  }
  // „30l 2x", „30 l 2ks"
  for (const m of radek.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*l\s+(\d+)\s*(?:x|×|ks)/gi)) {
    if (stejnyObjem(m[1], objemObalu)) nalezy.push(Number(m[2]));
  }
  return nalezy.length === 1 && nalezy[0] > 0 ? nalezy[0] : null;
}
