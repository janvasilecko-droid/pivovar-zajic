// 📅 Obchod → Sklad: kolik se který týden naskladnilo (fasování z aplikace + příjem).
// ---------------------------------------------------------------------------
// 13. 10. 2026: „ve skladě obchod udělej tabulku po týdnech, kde bude, kolik se
// daný týden daného piva a obalu naskladnilo." Počítá se z toho, co už aplikace
// má: fasování do obchodu (fasovani_private) a ruční příjem piva (obchod_prijem).
// Týden začíná v pondělí; limonády se nepočítají.
import { isoTyden } from './obchodStatistika';
import { jeLimonada, type VstupSkladu } from './obchodSklad';

export type NaskladneniObalu = { package_id: string; ks: number };
export type NaskladneniPiva = { beer_id: string; obaly: NaskladneniObalu[]; celkem: number };
export type NaskladneniTydne = {
  /** Pondělí týdne (YYYY-MM-DD). */
  od: string;
  /** Neděle týdne. */
  do: string;
  rok: number;
  cislo: number;
  celkem: number;
  piva: NaskladneniPiva[];
};

const DEN_MS = 86_400_000;
const posun = (iso: string, dny: number) => new Date(Date.parse(iso + 'T00:00:00Z') + dny * DEN_MS).toISOString().slice(0, 10);
const pondeli = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  return posun(iso, -((d.getUTCDay() + 6) % 7));
};
const cislo = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Posledních `pocet` týdnů včetně toho, ve kterém je `dnes` — nejnovější první. */
export function naskladneniPoTydnech(
  vstup: Pick<VstupSkladu, 'zbozi' | 'fasovani' | 'prijmy'>,
  piva: { id: string; name: string }[],
  dnes: string,
  pocet = 8,
): NaskladneniTydne[] {
  const jmena = new Map(piva.map((p) => [p.id, p.name]));
  const zboziPodleKodu = new Map(vstup.zbozi.map((z) => [z.kod, z]));
  const tydny = new Map<string, Map<string, Map<string, number>>>(); // pondělí → pivo → obal → ks

  const pridej = (datum: string, beer: string | null | undefined, pkg: string | null | undefined, ks: number) => {
    if (!beer || !pkg || !ks || datum > dnes) return;
    if (jeLimonada({ nazev: jmena.get(beer) ?? '' })) return;
    const t = pondeli(datum);
    const poPivech = tydny.get(t) ?? tydny.set(t, new Map()).get(t)!;
    const poObalech = poPivech.get(beer) ?? poPivech.set(beer, new Map()).get(beer)!;
    poObalech.set(pkg, (poObalech.get(pkg) ?? 0) + ks);
  };

  for (const f of vstup.fasovani) pridej(f.entry_date, f.beer_id, f.package_id, cislo(f.quantity));
  for (const p of vstup.prijmy) {
    const z = zboziPodleKodu.get(p.kod);
    if (z?.beer_id) pridej(p.datum, z.beer_id, z.package_id, cislo(p.mnozstvi));
  }

  const out: NaskladneniTydne[] = [];
  for (let i = 0; i < pocet; i++) {
    const od = posun(pondeli(dnes), -7 * i);
    const [rok, cisloTydne] = isoTyden(od);
    const poPivech = tydny.get(od);
    const pivaTydne: NaskladneniPiva[] = [...(poPivech?.entries() ?? [])].map(([beer_id, m]) => {
      const obaly = [...m.entries()].map(([package_id, ks]) => ({ package_id, ks: Math.round(ks * 100) / 100 }));
      return { beer_id, obaly, celkem: obaly.reduce((a, o) => a + o.ks, 0) };
    });
    out.push({ od, do: posun(od, 6), rok, cislo: cisloTydne, celkem: pivaTydne.reduce((a, p) => a + p.celkem, 0), piva: pivaTydne });
  }
  return out;
}
