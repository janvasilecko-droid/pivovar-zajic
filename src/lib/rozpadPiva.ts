/**
 * 🔎 Detailní rozpad jednoho piva za libovolné období.
 *
 * Inventura řekne, že něco nesedí. Neřekne ale KDE — a dohledávat to znamená
 * projít pět obrazovek, každou s vlastním filtrem, a psát si to na papír.
 * Tenhle rozpad vezme jedno pivo a jedno období a vypíše KAŽDÝ pohyb: kdo,
 * jaký obal, kolik. Na jedné straně co ubylo (objednávky, fasování, prodejna,
 * odpisy, akce, sudy spotřebované na lahve), na druhé co přibylo (stáčení
 * do KEG i do lahví) — a nad tím stav, se kterým období začínalo.
 *
 * Počítá se ze STEJNÉ skladové knihy jako Sklad a Inventura (lib/stockLedger),
 * jen se nesčítá do jednoho čísla, ale nechává se po řádcích. Vlastní sčítání
 * by znamenalo třetí pravdu o tomtéž.
 */

/** Jeden řádek rozpadu — vždycky datum, obal a množství; „kdo" jen tam, kde dává smysl. */
export type RadekRozpadu = {
  datum: string;
  /** Odběratel, zaměstnanec, akce… U stáčení zůstává prázdné. */
  kdo: string;
  obal: string;
  mnozstvi: number;
  /** Poznámka ze záznamu — u ručních oprav v ní bývá důvod. */
  poznamka?: string | null;
};

export type SekceRozpadu = {
  /** Nadpis sloupce v tabulce. */
  nazev: string;
  /** Přibývá (stáčení), nebo ubývá (výdej)? Podle toho se řadí a barví. */
  smer: 'prijem' | 'vydej';
  radky: RadekRozpadu[];
  celkem: number;
};

export type RozpadPiva = {
  od: string;
  do: string;
  /** Stav ke dni PŘED začátkem období, PO OBALECH — sčítat sudy s lahvemi
   *  do jednoho čísla nedává smysl, a právě takové číslo pak nikomu nesedí. */
  pocatecni: { obal: string; mnozstvi: number }[];
  sekce: SekceRozpadu[];
  prijemCelkem: number;
  vydejCelkem: number;
};

/** Vstupní řádky — syrové, jak přijdou z databáze. */
export type ZdrojeRozpadu = {
  /** Odečty závozů + jméno odběratele z objednávky. */
  zavozy?: { deduct_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown; odberatel?: string | null }[];
  fasovani?: { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown; kdo?: string | null }[];
  prodejna?: { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown }[];
  odpisy?: { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown }[];
  akce?: { entry_date?: string | null; nazev?: string | null; items?: { beer_id?: string | null; package_id?: string | null; quantity_taken?: unknown; quantity_returned?: unknown }[] }[];
  kegging?: { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown; note?: string | null }[];
  bottling?: { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: unknown; note?: string | null; kegs_used?: unknown; kegs_used_package_id?: string | null }[];
};

const cislo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function vObdobi(datum: string | null | undefined, od: string, doDne: string): boolean {
  if (!datum) return false;
  const d = datum.slice(0, 10);
  return d >= od && d <= doDne;
}

function sekce(nazev: string, smer: SekceRozpadu['smer'], radky: RadekRozpadu[]): SekceRozpadu {
  return {
    nazev,
    smer,
    // Uvnitř sekce chronologicky — rozpad se čte jako deník, ne jako výkaz.
    radky: [...radky].sort((a, b) => (a.datum === b.datum ? a.kdo.localeCompare(b.kdo, 'cs') : a.datum.localeCompare(b.datum))),
    celkem: radky.reduce((s, r) => s + r.mnozstvi, 0),
  };
}

/**
 * Sestaví rozpad jednoho piva za období.
 *
 * @param pocatecni Stav ke dni před `od` po obalech — bere se ze skladové
 *   knihy (stockAtStartOfDay), ne z vlastního výpočtu.
 * @param popisObalu Překlad id obalu na popisek; neznámý obal zůstane „?",
 *   ať je vidět, že se něco nespáruje, místo tichého vynechání řádku.
 */
export function sestavRozpadPiva(
  zdroje: ZdrojeRozpadu,
  beerId: string,
  od: string,
  doDne: string,
  pocatecni: { obal: string; mnozstvi: number }[],
  popisObalu: (id: string | null | undefined) => string,
): RozpadPiva {
  const mojePivo = (b: string | null | undefined) => !!b && b === beerId;

  const objednavky = (zdroje.zavozy ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.deduct_date, od, doDne))
    .map((r) => ({ datum: r.deduct_date!.slice(0, 10), kdo: r.odberatel || '—', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity) }));

  const fasovani = (zdroje.fasovani ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne))
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: r.kdo || '—', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity) }));

  const prodejna = (zdroje.prodejna ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne))
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: 'Prodejna', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity) }));

  const odpisy = (zdroje.odpisy ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne))
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: 'Odpis', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity) }));

  const akce: RadekRozpadu[] = [];
  for (const a of zdroje.akce ?? []) {
    if (!vObdobi(a.entry_date, od, doDne)) continue;
    for (const it of a.items ?? []) {
      if (!mojePivo(it.beer_id)) continue;
      // Co se vrátilo, se neodečítá — na skladě to zase je.
      const odvezeno = Math.max(0, cislo(it.quantity_taken) - cislo(it.quantity_returned));
      if (odvezeno === 0) continue;
      akce.push({ datum: a.entry_date!.slice(0, 10), kdo: a.nazev || 'Akce', obal: popisObalu(it.package_id), mnozstvi: odvezeno });
    }
  }

  // Sudy spotřebované na stáčení lahví — ubývají ze skladu sudů, i když
  // v „stáčení lahví" vypadají jako příjem lahví. Bez nich rozpad nesedí.
  const sudyNaLahve = (zdroje.bottling ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne) && cislo(r.kegs_used) > 0)
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: 'Na lahve', obal: popisObalu(r.kegs_used_package_id), mnozstvi: cislo(r.kegs_used) }));

  const staceniKeg = (zdroje.kegging ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne))
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: '', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity), poznamka: r.note ?? null }));

  const staceniLahve = (zdroje.bottling ?? [])
    .filter((r) => mojePivo(r.beer_id) && vObdobi(r.entry_date, od, doDne) && cislo(r.quantity) !== 0)
    .map((r) => ({ datum: r.entry_date!.slice(0, 10), kdo: '', obal: popisObalu(r.package_id), mnozstvi: cislo(r.quantity), poznamka: r.note ?? null }));

  const vsechny = [
    sekce('Objednávky (závoz)', 'vydej', objednavky),
    sekce('Fasování', 'vydej', fasovani),
    sekce('Prodejna', 'vydej', prodejna),
    sekce('Odpisy', 'vydej', odpisy),
    sekce('Akce', 'vydej', akce),
    sekce('Sudy na lahve', 'vydej', sudyNaLahve),
    sekce('Stáčení KEG', 'prijem', staceniKeg),
    sekce('Stáčení lahví', 'prijem', staceniLahve),
  ];

  const prijemCelkem = vsechny.filter((s) => s.smer === 'prijem').reduce((s, x) => s + x.celkem, 0);
  const vydejCelkem = vsechny.filter((s) => s.smer === 'vydej').reduce((s, x) => s + x.celkem, 0);

  return {
    od,
    do: doDne,
    pocatecni: pocatecni.filter((p) => p.mnozstvi !== 0),
    sekce: vsechny,
    prijemCelkem,
    vydejCelkem,
  };
}

export type SouhrnObalu = {
  obal: string;
  pocatecni: number;
  prijem: number;
  vydej: number;
  /** Počáteční + příjem − výdej. Tohle číslo má sedět se Skladem. */
  ocekavano: number;
};

/**
 * Součty po obalech — kontrolní řádek pod rozpadem.
 *
 * Sčítat padesátky s lahvemi do jednoho čísla nemá smysl: takový součet
 * nesedí s ničím a přesně kvůli němu se pak hledá chyba tam, kde není.
 * Proto se počítá každý obal zvlášť.
 */
export function souhrnPodleObalu(rozpad: RozpadPiva): SouhrnObalu[] {
  const mapa = new Map<string, SouhrnObalu>();
  const zaloz = (obal: string): SouhrnObalu => {
    let s = mapa.get(obal);
    if (!s) { s = { obal, pocatecni: 0, prijem: 0, vydej: 0, ocekavano: 0 }; mapa.set(obal, s); }
    return s;
  };

  rozpad.pocatecni.forEach((p) => { zaloz(p.obal).pocatecni += p.mnozstvi; });
  rozpad.sekce.forEach((sek) => {
    sek.radky.forEach((r) => {
      const s = zaloz(r.obal);
      if (sek.smer === 'prijem') s.prijem += r.mnozstvi; else s.vydej += r.mnozstvi;
    });
  });

  const out = [...mapa.values()];
  out.forEach((s) => { s.ocekavano = s.pocatecni + s.prijem - s.vydej; });
  return out.sort((a, b) => a.obal.localeCompare(b.obal, 'cs'));
}

/** Sekce, ve kterých něco je — prázdné sloupce jen zabírají místo. */
export function neprazdneSekce(rozpad: RozpadPiva): SekceRozpadu[] {
  return rozpad.sekce.filter((s) => s.radky.length > 0);
}
