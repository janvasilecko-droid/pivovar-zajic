// 🚚 „Co naložit do auta" — sečtení položek všech objednávek závozu.
// ---------------------------------------------------------------------------
// Vytaženo z Zavoz.tsx, aby na to šly napsat testy: je to seznam, podle
// kterého se fyzicky nakládá auto, takže chyba v něm znamená, že odběrateli
// něco nepřivezeme.
//
// 🔑 KLÍČ JE IDENTITA, NE POPISEK. Dřív se sčítalo podle textu
// „50l 12° Světlá". Jenže `beer_name` je text uložený u položky a u dvou
// objednávek se běžně liší (jinak napsaný stupeň, mezera navíc, starší
// zápis) — z jednoho piva pak vznikly DVA řádky. Z provozu 22. 9. 2026:
// „mám tam 10×50 12sv a 3×50 12sv, ale píše mi naložit jen 10×50" — druhý
// řádek byl kousek níž a při nakládání se přehlédl.

export type NalozitPolozka = {
  beer_id?: string | null;
  beer_name?: string | null;
  package_id?: string | null;
  package_label?: string | null;
  quantity: number | string;
  is_prepared?: boolean | null;
};

export type NalozitObal = { id: string; label?: string | null; kind?: string | null };

export type NalozitRadek = { label: string; qty: number; preparedQty: number };

export type CoNalozit = {
  kegs: NalozitRadek[];
  bottles: NalozitRadek[];
  totalKegs: number;
  totalBottles: number;
  totalCount: number;
  /** Kolik řádků je celých nachystaných. */
  preparedCount: number;
  /** Kolik je řádků dohromady (sudy + lahve). */
  totalLabels: number;
};

/** Je tenhle obal sud? Stejné rozhodování jako jinde v appce. */
export function jeSudovyObal(kind: string | null | undefined, label: string): boolean {
  const l = label.toLowerCase();
  return kind === 'keg' || l.includes('keg') || l.includes('sud');
}

/**
 * Sečte položky k naložení.
 *
 * @param polozky  všechny položky objednávek, které se mají naložit
 * @param obaly    číselník obalů (pro `kind` a náhradní popisek)
 * @param formatObal  zkrácení popisku obalu („KEG 50l" → „50l")
 */
export function sestavCoNalozit(
  polozky: NalozitPolozka[],
  obaly: NalozitObal[],
  formatObal: (label: string) => string = (l) => l,
): CoNalozit {
  const kegMap = new Map<string, NalozitRadek>();
  const bottleMap = new Map<string, NalozitRadek>();
  let totalKegs = 0;
  let totalBottles = 0;

  for (const i of polozky) {
    const pkg = obaly.find((p) => p.id === i.package_id);
    const pkgLabel = i.package_label ?? pkg?.label ?? 'Neurčeno';
    const isKeg = jeSudovyObal(pkg?.kind, pkgLabel);
    const label = `${formatObal(pkgLabel)} ${i.beer_name ?? '?'}`;
    // Bez id (starší nebo ručně psaný záznam) se spadne zpátky na
    // normalizovaný název — pořád lepší než syrový popisek.
    const klic = `${i.beer_id ?? `n:${(i.beer_name ?? '?').trim().toLowerCase()}`}__${i.package_id ?? `l:${pkgLabel.trim().toLowerCase()}`}`;
    const qty = Number(i.quantity) || 0;
    const preparedQty = i.is_prepared ? qty : 0;

    const mapa = isKeg ? kegMap : bottleMap;
    const cur = mapa.get(klic) ?? { label, qty: 0, preparedQty: 0 };
    cur.qty += qty;
    cur.preparedQty += preparedQty;
    mapa.set(klic, cur);
    if (isKeg) totalKegs += qty; else totalBottles += qty;
  }

  const kegs = [...kegMap.values()].sort((a, b) => b.qty - a.qty);
  const bottles = [...bottleMap.values()].sort((a, b) => b.qty - a.qty);
  const preparedCount = [...kegMap.values(), ...bottleMap.values()].filter((x) => x.preparedQty >= x.qty).length;

  return {
    kegs,
    bottles,
    totalKegs,
    totalBottles,
    totalCount: totalKegs + totalBottles,
    preparedCount,
    totalLabels: kegMap.size + bottleMap.size,
  };
}
