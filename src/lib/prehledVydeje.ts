// 📋 Přehledy zápisů k vykopírování do tabulek.
// ---------------------------------------------------------------------------
// Pivovar si vede několik listů a každý má trochu jiné rozvržení. Tenhle modul
// umí všechna tři, protože se liší jen v tom, které popisné sloupce mají smysl:
//
//   'odberatel'      Datum │ Odběratel │ Druh piva │ Sudy(5) │ Lahve(4)
//                    — Odběr personál, Fasování prodejna, Vzorky promo a PR
//                      (tam se druhý sloupec jmenuje „Komu proč a zač")
//   'staceni_lahve'  Datum │ Druh piva │ Z sudů(5) │ Stočeno lahví(4)
//   'staceni_keg'    Datum │ Druh piva │ Stočené množství(5)
//
// Formát je daný tím, jak se s tím dál pracuje: kopíruje se to do tabulky,
// takže se skládá jako TSV (sloupce oddělené tabulátorem). Excel i Google
// Tabulky si TSV samy rozhodí do buněk; se středníkem nebo čárkou by záleželo
// na místním nastavení a rozpadlo by se to.
//
// Desetinná čísla se píšou s ČÁRKOU — v českém Excelu se jinak „1.5" chápe
// jako text nebo datum, ne jako číslo.
//
// Sloupce s hektolitry se schválně NEEXPORTUJÍ: v listech jsou spočítané
// vzorcem z počtů vlevo, takže vložením hodnoty by se vzorec přepsal a od
// toho řádku dál by se přestalo počítat samo.

export type VydejRadek = {
  entry_date: string | null;
  beer_name: string | null;
  package_id: string | null;
  quantity: number | null;
  who?: string | null;
  note?: string | null;
};

export type ObalPrehled = { id: string; label: string; kind: string; volume_l: number | string | null };

export type VariantaPrehledu = 'odberatel' | 'staceni_lahve' | 'staceni_keg';

/** Objemy sloupců — ve všech listech stejné. */
export const SLOUPCE_SUDY = [50, 30, 20, 15, 10];
export const SLOUPCE_LAHVE = [1.5, 1, 0.5, 0.33];

type PopisVarianty = {
  /** Má list sloupec s odběratelem / komu? */
  sOdberatelem: boolean;
  /** Popisek toho sloupce v hlavičce. */
  popisOdberatele: string;
  /** Nadpis skupiny nad sloupci sudů. */
  skupinaSudy: string;
  /** Nadpis skupiny nad sloupci lahví; prázdné = list lahve nemá. */
  skupinaLahve: string;
};

export const VARIANTY: Record<VariantaPrehledu, PopisVarianty> = {
  odberatel: { sOdberatelem: true, popisOdberatele: 'Odběratel', skupinaSudy: 'Sudy', skupinaLahve: 'Lahve' },
  staceni_lahve: { sOdberatelem: false, popisOdberatele: '', skupinaSudy: 'Z sudů', skupinaLahve: 'Stočeno lahví' },
  staceni_keg: { sOdberatelem: false, popisOdberatele: '', skupinaSudy: 'Stočené množství', skupinaLahve: '' },
};

/** Sloupce dané varianty — u KEGů se lahve vynechají. */
export function sloupceVarianty(varianta: VariantaPrehledu): number[] {
  return VARIANTY[varianta].skupinaLahve
    ? [...SLOUPCE_SUDY, ...SLOUPCE_LAHVE]
    : [...SLOUPCE_SUDY];
}

/**
 * Jak se řádky slučují:
 *   'den'    — jeden řádek na datum + odběratele + pivo (denní zápis),
 *   'souhrn' — jeden řádek na odběratele + pivo za celé období (měsíční
 *              uzávěrka, kde datum nedává smysl a sloupec Datum se vynechá).
 */
export type Seskupeni = 'den' | 'souhrn';

export type PrehledRadek = {
  /** U souhrnu prázdné — řádek je za celé období, ne za jeden den. */
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
  { od, do: doKdy, seskupeni = 'den' }: { od: string; do: string; seskupeni?: Seskupeni },
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
    const klic = seskupeni === 'souhrn' ? `${odberatel}|${pivo}` : `${r.entry_date}|${odberatel}|${pivo}`;

    const zaznam = podleKlice.get(klic) ?? {
      datum: seskupeni === 'souhrn' ? '' : r.entry_date,
      odberatel, pivo, kusy: {}, kusyJine: 0, sudyL: 0, lahveL: 0,
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

/** Popisky přesně jako v listech: u sudů „50 l", u lahví „1,0l" (bez mezery). */
export function popisSloupce(l: number): string {
  if (SLOUPCE_SUDY.includes(l)) return `${l} l`;
  const cislo = l === 1 ? '1,0' : String(l).replace('.', ',');
  return `${cislo}l`;
}

export type MoznostiTsv = {
  varianta: VariantaPrehledu;
  /** Vynechat sloupec Datum — u souhrnu za období nemá co obsahovat. */
  bezData?: boolean;
  /** Přidat dvouřádkovou hlavičku (jen pro zakládání nového listu). */
  hlavicka?: boolean;
  /** Přidat řádek se součtem. */
  soucet?: boolean;
};

/** Popisné sloupce vlevo (Datum / Odběratel / Druh piva) pro danou podobu. */
export function popisneSloupce(varianta: VariantaPrehledu, bezData = false): string[] {
  const v = VARIANTY[varianta];
  return [
    ...(bezData ? [] : ['Datum']),
    ...(v.sOdberatelem ? [v.popisOdberatele] : []),
    'Druh piva',
  ];
}

/** Hlavička ve dvou řádcích — skupiny nad sloupci, jak to je v listech. */
export function hlavickaTsv(varianta: VariantaPrehledu, bezData = false): string {
  const v = VARIANTY[varianta];
  const popisne = popisneSloupce(varianta, bezData);
  const prazdne = (n: number) => Array(Math.max(0, n)).fill('');

  const radek1 = [
    ...prazdne(popisne.length),
    v.skupinaSudy, ...prazdne(SLOUPCE_SUDY.length - 1),
    ...(v.skupinaLahve ? [v.skupinaLahve, ...prazdne(SLOUPCE_LAHVE.length - 1)] : []),
  ].join('\t');

  const radek2 = [
    ...popisne,
    ...sloupceVarianty(varianta).map(popisSloupce),
  ].join('\t');

  return `${radek1}\n${radek2}`;
}

/**
 * Přehled jako TSV. Výchozí podoba je „co se vkládá do existujícího listu":
 * jen datové řádky, bez hlavičky, bez součtu a bez hektolitrů.
 */
export function prehledDoTsv(radky: PrehledRadek[], moznosti: MoznostiTsv): string {
  const { varianta, bezData = false, hlavicka = false, soucet = false } = moznosti;
  const v = VARIANTY[varianta];
  const sloupce = sloupceVarianty(varianta);

  const kusyDoSloupcu = (kusy: Record<number, number>) =>
    sloupce.map((l) => {
      const hodnota = kusy[klicObjemu(l)];
      return hodnota ? String(hodnota) : '';
    });

  const telo = radky.map((r) => [
    ...(bezData ? [] : [formatDatum(r.datum)]),
    ...(v.sOdberatelem ? [r.odberatel] : []),
    r.pivo,
    ...kusyDoSloupcu(r.kusy),
  ].join('\t'));

  const casti: string[] = [];
  if (hlavicka) casti.push(hlavickaTsv(varianta, bezData));
  casti.push(...telo);
  if (soucet) {
    const s = soucty(radky);
    // „Celkem" patří do prvního popisného sloupce, zbytek zůstane prázdný.
    const popisnych = popisneSloupce(varianta, bezData).length;
    casti.push(['Celkem', ...Array(popisnych - 1).fill(''), ...kusyDoSloupcu(s.kusy)].join('\t'));
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
