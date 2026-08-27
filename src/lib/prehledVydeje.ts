// 📋 Přehled výdeje (Fasování + Prodejna) k vykopírování do tabulky.
// ---------------------------------------------------------------------------
// Jeden řádek = datum + odběratel + pivo, množství rozhozené do sloupců podle
// objemu obalu, a k tomu hektolitry zvlášť za sudy, za lahve a celkem.
//
// Formát je daný tím, jak se s tím dál pracuje: kopíruje se to do tabulky,
// takže se skládá jako TSV (sloupce oddělené tabulátorem). Excel i Google
// Tabulky si TSV samy rozhodí do buněk; kdyby se použil středník nebo čárka,
// záleželo by na místním nastavení a rozpadlo by se to.
//
// Desetinná čísla se píšou s ČÁRKOU — v českém Excelu se jinak „1.5" chápe
// jako text nebo datum, ne jako číslo.

export type VydejRadek = {
  entry_date: string | null;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  quantity: number | null;
  who?: string | null;
  note?: string | null;
};

export type ObalPrehled = { id: string; label: string; kind: string; volume_l: number | string | null };

/** Sloupce podle zadání — sudy zleva od největšího, pak lahve. */
export const SLOUPCE_SUDY = [50, 30, 20, 15, 10];
export const SLOUPCE_LAHVE = [1.5, 1, 0.5, 0.33];

export type PrehledRadek = {
  datum: string;
  odberatel: string;
  pivo: string;
  /** Kusy podle objemu — klíč je objem v litrech. */
  kusy: Record<number, number>;
  /** Kusy obalů, které nespadají do žádného sloupce (jiné objemy). */
  kusyJine: number;
  sudyL: number;
  lahveL: number;
};

const objem = (o?: ObalPrehled): number => Number(o?.volume_l ?? 0);
const jeSud = (o?: ObalPrehled): boolean => (o?.kind ?? '') === 'keg';

/** Objem zaokrouhlený na dvě desetinná místa — 0.33 vs 0.3300000001. */
const klicObjemu = (l: number): number => Math.round(l * 100) / 100;

/**
 * Poskládá řádky přehledu. Slučuje podle (datum, odběratel, pivo), takže
 * dva zápisy téhož piva témuž člověku v jeden den jsou na jednom řádku.
 */
export function sestavPrehled(
  radky: VydejRadek[],
  obaly: ObalPrehled[],
  { od, do: doKdy }: { od: string; do: string },
): PrehledRadek[] {
  const mapaObalu = new Map(obaly.map((o) => [o.id, o]));
  const vsechnySloupce = new Set([...SLOUPCE_SUDY, ...SLOUPCE_LAHVE].map(klicObjemu));
  const podleKlice = new Map<string, PrehledRadek>();

  for (const r of radky) {
    if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy) continue;
    const ks = Number(r.quantity || 0);
    if (!ks) continue;
    const obal = r.package_id ? mapaObalu.get(r.package_id) : undefined;
    const litruKus = objem(obal);

    const odberatel = (r.who || '').trim() || (r.note || '').trim() || '—';
    const pivo = (r.beer_name || '').trim() || '—';
    const klic = `${r.entry_date}|${odberatel}|${pivo}`;

    const zaznam = podleKlice.get(klic) ?? {
      datum: r.entry_date, odberatel, pivo, kusy: {}, kusyJine: 0, sudyL: 0, lahveL: 0,
    };

    const sloupec = klicObjemu(litruKus);
    if (vsechnySloupce.has(sloupec)) {
      zaznam.kusy[sloupec] = (zaznam.kusy[sloupec] ?? 0) + ks;
    } else {
      // Neznámý objem se do sloupců nevejde, ale z hektolitrů vypadnout nesmí —
      // jinak by součet neseděl s tím, co se doopravdy vydalo.
      zaznam.kusyJine += ks;
    }

    const litru = ks * litruKus;
    if (jeSud(obal)) zaznam.sudyL += litru;
    else zaznam.lahveL += litru;

    podleKlice.set(klic, zaznam);
  }

  return [...podleKlice.values()].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.odberatel.localeCompare(b.odberatel, 'cs') || a.pivo.localeCompare(b.pivo, 'cs'),
  );
}

/** Datum ve tvaru, jaký se píše do tabulky (1.9.2026). */
export function formatDatum(iso: string): string {
  const [r, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${r}`;
}

/** Číslo s českou desetinnou čárkou; nula se nepíše, ať tabulka není zaplevelená. */
export function cisloProTabulku(n: number, desetinnych = 3): string {
  if (!n) return '';
  const zaokrouhleno = Math.round(n * 10 ** desetinnych) / 10 ** desetinnych;
  return String(zaokrouhleno).replace('.', ',');
}

/** Popisky přesně jako v listu: u sudů „50 l", u lahví „1,0l" (bez mezery). */
export function popisSloupce(l: number): string {
  if (SLOUPCE_SUDY.includes(l)) return `${l} l`;
  const cislo = l === 1 ? '1,0' : String(l).replace('.', ',');
  return `${cislo}l`;
}

/** Hlavička ve dvou řádcích — skupiny nad sloupci, jak to je v listu. */
export function hlavickaTsv(hektolitry = false): string {
  const prazdne = (n: number) => Array(n).fill('').join('\t');
  const radek1 = [
    'Fasování prodejna', '', '',
    'Sudy', prazdne(SLOUPCE_SUDY.length - 1),
    'Lahve', prazdne(SLOUPCE_LAHVE.length - 1),
    ...(hektolitry ? ['sudy hl', 'lahve hl', 'celkem hl'] : []),
  ].join('\t');
  const radek2 = [
    'Datum', 'Odběratel', 'Druh piva',
    ...SLOUPCE_SUDY.map(popisSloupce), ...SLOUPCE_LAHVE.map(popisSloupce),
    ...(hektolitry ? ['', '', ''] : []),
  ].join('\t');
  return `${radek1}\n${radek2}`;
}

export type MoznostiTsv = {
  /** Přidat dvouřádkovou hlavičku (jen pro samostatnou tabulku). */
  hlavicka?: boolean;
  /** Přidat řádek se součtem. */
  soucet?: boolean;
  /**
   * Přidat sloupce sudy hl / lahve hl / celkem hl.
   *
   * VÝCHOZÍ JE NE. V listu jsou tyhle tři sloupce spočítané VZORCEM z počtů
   * vlevo — kdyby se do nich vložila hodnota, vzorec by se přepsal a od toho
   * řádku dál by se přestalo počítat samo.
   */
  hektolitry?: boolean;
};

/**
 * Přehled jako TSV. Výchozí podoba je „co se vkládá do existujícího listu":
 * jen datové řádky, sloupce Datum až 0,33l, bez hlavičky a bez součtu.
 */
export function prehledDoTsv(radky: PrehledRadek[], moznosti: MoznostiTsv = {}): string {
  const { hlavicka = false, soucet = false, hektolitry = false } = moznosti;
  const kusyDoSloupcu = (kusy: Record<number, number>) => [
    ...SLOUPCE_SUDY, ...SLOUPCE_LAHVE,
  ].map((l) => {
    const v = kusy[klicObjemu(l)];
    return v ? String(v) : '';
  });

  const hlSloupce = (sudyL: number, lahveL: number) => (hektolitry
    ? [cisloProTabulku(sudyL / 100), cisloProTabulku(lahveL / 100), cisloProTabulku((sudyL + lahveL) / 100)]
    : []);

  const telo = radky.map((r) => [
    formatDatum(r.datum),
    r.odberatel,
    r.pivo,
    ...kusyDoSloupcu(r.kusy),
    ...hlSloupce(r.sudyL, r.lahveL),
  ].join('\t'));

  const casti: string[] = [];
  if (hlavicka) casti.push(hlavickaTsv(hektolitry));
  casti.push(...telo);
  if (soucet) {
    const s = soucty(radky);
    casti.push(['Celkem', '', '', ...kusyDoSloupcu(s.kusy), ...hlSloupce(s.sudyL, s.lahveL)].join('\t'));
  }
  return casti.join('\n');
}

export function soucty(radky: PrehledRadek[]): { kusy: Record<number, number>; kusyJine: number; sudyL: number; lahveL: number } {
  const out = { kusy: {} as Record<number, number>, kusyJine: 0, sudyL: 0, lahveL: 0 };
  for (const r of radky) {
    for (const [k, v] of Object.entries(r.kusy)) out.kusy[Number(k)] = (out.kusy[Number(k)] ?? 0) + v;
    out.kusyJine += r.kusyJine;
    out.sudyL += r.sudyL;
    out.lahveL += r.lahveL;
  }
  return out;
}
