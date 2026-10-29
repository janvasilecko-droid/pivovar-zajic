// Odběratelé seřazení od nejčastěji používaných — pro tlačítka ve výběru
// odběratele u nové objednávky (5. 10. 2026: „odběratel udělej jako
// tlačítko, když se na něj klikne, vyskočí okno, kde můžu psát odběratele,
// ale pod ním uvidím tlačítka všech odběratelů, srovnaných od nejčastěji
// používaných").

export type OdberatelProRazeni = { id: string; name: string };
export type ObjednavkaProRazeni = { place_id: string | null; place_name: string | null; status?: string | null };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Kolik (nestornovaných) objednávek má který odběratel. Bez place_id se přiřadí podle jména. */
function spoctiObjednavky(odberatele: OdberatelProRazeni[], objednavky: ObjednavkaProRazeni[]): Map<string, number> {
  const podleJmena = new Map(odberatele.map((o) => [norm(o.name), o.id]));
  const pocet = new Map<string, number>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const id = o.place_id ?? (o.place_name ? podleJmena.get(norm(o.place_name)) : undefined);
    if (!id) continue;
    pocet.set(id, (pocet.get(id) ?? 0) + 1);
  }
  return pocet;
}

/**
 * Seřadí odběratele podle počtu objednávek (stornované se nepočítají).
 * Objednávka bez place_id se přiřadí podle jména. Při shodě abecedně.
 */
export function odberateleDleCetnosti<T extends OdberatelProRazeni>(
  odberatele: T[],
  objednavky: ObjednavkaProRazeni[],
): T[] {
  const pocet = spoctiObjednavky(odberatele, objednavky);
  return [...odberatele].sort((a, b) =>
    (pocet.get(b.id) ?? 0) - (pocet.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'cs'));
}

/**
 * Zkratka nahoře ve výběru odběratele: ti, kdo opravdu objednávají, od
 * nejčastějšího. Odběratel, který nikdy nic neobjednal, se mezi „nejčastější“
 * nedostane, ať je seznam jakkoli krátký — najde ho se zbytkem v abecedě.
 */
export function nejcastejsiOdberatele<T extends OdberatelProRazeni>(
  odberatele: T[],
  objednavky: ObjednavkaProRazeni[],
  limit = 8,
): T[] {
  const pocet = spoctiObjednavky(odberatele, objednavky);
  return odberateleDleCetnosti(odberatele, objednavky)
    .filter((o) => (pocet.get(o.id) ?? 0) > 0)
    .slice(0, limit);
}

/**
 * Odběratelé abecedně podle ČESKÉ abecedy (29. 10. 2026: „přidej tam možnost
 * seřadit podle abecedy, docela dlouho jsem hledal Martina"). Velikost písmen
 * nehraje roli („MARTIN" je mezi „Maneo" a „Mates"), „CH" je samostatné
 * písmeno za H a mezera na začátku jména neodsune odběratele na začátek.
 */
export function odberateleAbecedne<T extends OdberatelProRazeni>(odberatele: T[]): T[] {
  return [...odberatele].sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'cs'));
}

/**
 * Hledání odběratele při psaní (29. 10. 2026): kdekoliv ve jménu, bez ohledu
 * na velikost písmen a diakritiku. Víc slov = všechna musí ve jménu být,
 * v libovolném pořadí („mat ryb“ najde „Mates Rybárna“). Bez textu vrátí všechny.
 */
export function filtrujOdberatele<T extends OdberatelProRazeni>(odberatele: T[], text: string): T[] {
  const slova = norm(text).split(/\s+/).filter(Boolean);
  if (slova.length === 0) return odberatele;
  return odberatele.filter((o) => {
    const jmeno = norm(o.name);
    return slova.every((s) => jmeno.includes(s));
  });
}

/**
 * Písmeno, pod které odběratel v abecedním seznamu spadá (nadpis skupiny).
 * Řídí se českou abecedou stejně jako řazení: Č, Ř, Š a Ž jsou samostatná
 * písmena, „CH“ je samostatné písmeno za H, ostatní háčky a čárky (Á, Ď, Ě,
 * Ň, Ť, Ů, Ý …) se řadí k základnímu písmenu. Číslice, uvozovky a prázdné
 * jméno spadnou do skupiny „#“.
 */
export function pismenoOdberatele(jmeno: string): string {
  const cisty = jmeno.trim().toLowerCase();
  if (!cisty) return '#';
  if (cisty.startsWith('ch')) return 'CH';
  const prvni = Array.from(cisty)[0];
  if ('čřšž'.includes(prvni)) return prvni.toUpperCase();
  const zaklad = prvni.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^[a-z]$/.test(zaklad)) return zaklad.toUpperCase();
  return /\p{L}/u.test(prvni) ? prvni.toUpperCase() : '#';
}

/**
 * Rozdělí už abecedně seřazený seznam na skupiny po písmenech (nadpisy
 * A, B, C, Č …). Spojuje jen po sobě jdoucí odběratele se stejným písmenem,
 * takže pořadí zůstává přesně takové, jaké dalo řazení.
 */
export function rozdelDlePismen<T extends OdberatelProRazeni>(serazeni: T[]): { pismeno: string; odberatele: T[] }[] {
  const skupiny: { pismeno: string; odberatele: T[] }[] = [];
  for (const o of serazeni) {
    const pismeno = pismenoOdberatele(o.name);
    const posledni = skupiny[skupiny.length - 1];
    if (posledni && posledni.pismeno === pismeno) posledni.odberatele.push(o);
    else skupiny.push({ pismeno, odberatele: [o] });
  }
  return skupiny;
}
