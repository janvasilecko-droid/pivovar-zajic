// Pořadí položek objednávky v přehledu: nejdřív sudy, pak lahve; uvnitř
// druhu od NEJVĚTŠÍHO obalu po nejmenší (50l, 30l, 20l, 15l, 10l, pak
// 1,5l, 1l, 0,5l, 0,33l); při stejném obalu podle piva.
//
// Z provozu 12. 10. 2026: u objednávky Malešic šlo 30l, 30l, 50l, 0,5l,
// 0,5l, 1,5l — řazení podle TEXTU štítku („30l" před „50l", „0.5l" před
// „1.5l"). Majitel: „seřaď tady ty položky podle druhu a od největší pod
// nejmenší velikost obalu."

type Obal = { id: string; kind?: string | null; volume_l?: number | null; label?: string | null };
type Polozka = { id: string; package_id: string | null; package_label: string | null; beer_name: string | null };

/** Objem obalu v litrech: z katalogu, jinak z textu štítku („ 30l", „1,5l"). */
export function objemObalu(obal: Obal | undefined, labelPolozky: string | null): number {
  if (obal?.volume_l != null && Number.isFinite(Number(obal.volume_l))) return Number(obal.volume_l);
  const m = (obal?.label ?? labelPolozky ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function poradiPolozekObjednavky<T extends Polozka>(items: T[], packages: Obal[]): T[] {
  const dle = new Map(packages.map((p) => [p.id, p]));
  return [...items].sort((a, b) => {
    const pa = a.package_id ? dle.get(a.package_id) : undefined;
    const pb = b.package_id ? dle.get(b.package_id) : undefined;
    const sudA = pa?.kind === 'keg';
    const sudB = pb?.kind === 'keg';
    if (sudA !== sudB) return sudA ? -1 : 1;
    const objemA = objemObalu(pa, a.package_label);
    const objemB = objemObalu(pb, b.package_label);
    if (objemA !== objemB) return objemB - objemA;
    // Při shodném obalu podle piva, nakonec podle id — pořadí z databáze se
    // po úpravě řádku mění, položky by pak pod prstem poskakovaly.
    const podlePiva = (a.beer_name ?? '').localeCompare(b.beer_name ?? '', 'cs');
    return podlePiva !== 0 ? podlePiva : a.id.localeCompare(b.id);
  });
}
