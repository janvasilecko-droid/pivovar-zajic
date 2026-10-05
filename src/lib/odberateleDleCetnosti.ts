// Odběratelé seřazení od nejčastěji používaných — pro tlačítka ve výběru
// odběratele u nové objednávky (5. 10. 2026: „odběratel udělej jako
// tlačítko, když se na něj klikne, vyskočí okno, kde můžu psát odběratele,
// ale pod ním uvidím tlačítka všech odběratelů, srovnaných od nejčastěji
// používaných").

export type OdberatelProRazeni = { id: string; name: string };
export type ObjednavkaProRazeni = { place_id: string | null; place_name: string | null; status?: string | null };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Seřadí odběratele podle počtu objednávek (stornované se nepočítají).
 * Objednávka bez place_id se přiřadí podle jména. Při shodě abecedně.
 */
export function odberateleDleCetnosti<T extends OdberatelProRazeni>(
  odberatele: T[],
  objednavky: ObjednavkaProRazeni[],
): T[] {
  const podleJmena = new Map(odberatele.map((o) => [norm(o.name), o.id]));
  const pocet = new Map<string, number>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const id = o.place_id ?? (o.place_name ? podleJmena.get(norm(o.place_name)) : undefined);
    if (!id) continue;
    pocet.set(id, (pocet.get(id) ?? 0) + 1);
  }
  return [...odberatele].sort((a, b) =>
    (pocet.get(b.id) ?? 0) - (pocet.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'cs'));
}
