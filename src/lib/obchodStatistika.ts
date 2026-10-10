// 📊 Statistiky prodeje obchodu — z uzávěrek.
// ---------------------------------------------------------------------------
// Prodej se připisuje ke dni KONCE období uzávěrky (stejně jako u skladu,
// lib/obchodSklad.ts), tržba se bere z řádků (částka × kusy), u uzávěrky bez
// částek z jejího „Celkem". Litry jen u piv, u kterých je obal znám.
import type { ProdanyRadek, UzaverkaHlavicka, Zbozi } from './obchodSklad';

export type Rozliseni = 'den' | 'tyden' | 'mesic';

export type VstupStatistiky = {
  zbozi: Zbozi[];
  uzaverky: UzaverkaHlavicka[];
  radky: ProdanyRadek[];
  obaly: { id: string; volume_l: number | string | null }[];
  piva: { id: string; name: string }[];
};

export type ObdobiProdeje = {
  klic: string;
  popis: string;
  trzba: number;
  ks: number;
  litry: number;
  uzaverek: number;
};

const cislo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const zaokr = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** ISO týden: [rok, číslo týdne]. */
export function isoTyden(datumISO: string): [number, number] {
  const d = new Date(datumISO + 'T00:00:00Z');
  const den = (d.getUTCDay() + 6) % 7; // pondělí = 0
  d.setUTCDate(d.getUTCDate() - den + 3); // čtvrtek téhož týdne
  const rok = d.getUTCFullYear();
  const prvniCtvrtek = new Date(Date.UTC(rok, 0, 4));
  const tyden = 1 + Math.round(((d.getTime() - prvniCtvrtek.getTime()) / 86_400_000 - 3 + ((prvniCtvrtek.getUTCDay() + 6) % 7)) / 7);
  return [rok, tyden];
}

const kratce = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

function klicAPopis(datumISO: string, rozliseni: Rozliseni): { klic: string; popis: string } {
  if (rozliseni === 'den') {
    const d = new Date(datumISO + 'T00:00:00Z');
    return { klic: datumISO, popis: `${DNY[d.getUTCDay()]} ${kratce(datumISO)}` };
  }
  if (rozliseni === 'mesic') {
    return { klic: datumISO.slice(0, 7), popis: `${MESICE[Number(datumISO.slice(5, 7)) - 1]} ${datumISO.slice(0, 4)}` };
  }
  const [r, t] = isoTyden(datumISO);
  return { klic: `${r}-W${String(t).padStart(2, '0')}`, popis: `týden ${t}` };
}

/** Částka řádku: z účtenky, jinak množství × cena. */
export const castkaRadku = (r: ProdanyRadek): number =>
  r.celkem != null && r.celkem !== '' ? cislo(r.celkem) : cislo(r.cena) * cislo(r.mnozstvi);

function vObdobi(u: UzaverkaHlavicka, od?: string, do_?: string): boolean {
  return (!od || u.datum_do >= od) && (!do_ || u.datum_do <= do_);
}

/** Prodej po dnech, týdnech nebo měsících — nejnovější první. */
export function prodejPoObdobich(v: VstupStatistiky, rozliseni: Rozliseni, od?: string, do_?: string): ObdobiProdeje[] {
  const objem = new Map(v.obaly.map((o) => [o.id, cislo(o.volume_l)]));
  const zbozi = new Map(v.zbozi.map((z) => [z.kod, z]));
  const m = new Map<string, ObdobiProdeje>();

  for (const u of v.uzaverky) {
    if (!vObdobi(u, od, do_)) continue;
    const { klic, popis } = klicAPopis(u.datum_do, rozliseni);
    const o = m.get(klic) ?? { klic, popis, trzba: 0, ks: 0, litry: 0, uzaverek: 0 };
    const radky = v.radky.filter((r) => r.uzaverka_id === u.id);
    const zRadku = radky.reduce((a, r) => a + castkaRadku(r), 0);
    o.trzba += radky.length > 0 ? zRadku : cislo(u.trzba);
    o.uzaverek += 1;
    for (const r of radky) {
      const z = zbozi.get(r.kod);
      // Do kusů a litrů jdou jen piva — limo a saponát by je zkreslily.
      if (!z?.beer_id || !z.package_id) continue;
      const ks = cislo(r.mnozstvi);
      o.ks += ks;
      o.litry += ks * (objem.get(z.package_id) ?? 0);
    }
    m.set(klic, o);
  }
  return [...m.values()]
    .map((o) => ({ ...o, trzba: zaokr(o.trzba, 2), litry: zaokr(o.litry) }))
    .sort((a, b) => b.klic.localeCompare(a.klic));
}

export type ProdejZbozi = {
  kod: string;
  nazev: string;
  jePivo: boolean;
  ks: number;
  litry: number;
  trzba: number;
};

/** Prodej po zboží za období — nejvíc prodávané první. */
export function prodejPoZbozi(v: VstupStatistiky, od?: string, do_?: string): ProdejZbozi[] {
  const objem = new Map(v.obaly.map((o) => [o.id, cislo(o.volume_l)]));
  const zbozi = new Map(v.zbozi.map((z) => [z.kod, z]));
  const uzaverky = new Map(v.uzaverky.filter((u) => vObdobi(u, od, do_)).map((u) => [u.id, u]));
  const m = new Map<string, ProdejZbozi>();

  for (const r of v.radky) {
    if (!uzaverky.has(r.uzaverka_id)) continue;
    const z = zbozi.get(r.kod);
    const dosud = m.get(r.kod) ?? {
      kod: r.kod, nazev: z?.nazev ?? r.nazev ?? r.kod, jePivo: !!(z?.beer_id && z.package_id), ks: 0, litry: 0, trzba: 0,
    };
    const ks = cislo(r.mnozstvi);
    dosud.ks += ks;
    dosud.trzba += castkaRadku(r);
    if (z?.beer_id && z.package_id) dosud.litry += ks * (objem.get(z.package_id) ?? 0);
    m.set(r.kod, dosud);
  }
  return [...m.values()]
    .map((p) => ({ ...p, litry: zaokr(p.litry), trzba: zaokr(p.trzba, 2) }))
    .sort((a, b) => b.ks - a.ks || a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
}

export type ProdejPiva = { beerId: string; nazev: string; ks: number; litry: number; trzba: number };

/** Prodej po pivech (všechny obaly dohromady) — litry říkají víc než kusy různých obalů. */
export function prodejPoPivech(v: VstupStatistiky, od?: string, do_?: string): ProdejPiva[] {
  const jmena = new Map(v.piva.map((p) => [p.id, p.name]));
  const zbozi = new Map(v.zbozi.map((z) => [z.kod, z]));
  const m = new Map<string, ProdejPiva>();
  for (const p of prodejPoZbozi(v, od, do_)) {
    const z = zbozi.get(p.kod);
    if (!z?.beer_id) continue;
    const dosud = m.get(z.beer_id) ?? { beerId: z.beer_id, nazev: jmena.get(z.beer_id) ?? z.nazev, ks: 0, litry: 0, trzba: 0 };
    dosud.ks += p.ks;
    dosud.litry += p.litry;
    dosud.trzba += p.trzba;
    m.set(z.beer_id, dosud);
  }
  return [...m.values()]
    .map((p) => ({ ...p, litry: zaokr(p.litry), trzba: zaokr(p.trzba, 2) }))
    .sort((a, b) => b.litry - a.litry);
}

export type SouhrnObdobi = { trzba: number; ks: number; litry: number; uzaverek: number; trzbaOstatni: number };

export function souhrnObdobi(v: VstupStatistiky, od?: string, do_?: string): SouhrnObdobi {
  const obdobi = prodejPoObdobich(v, 'mesic', od, do_);
  const celkem = obdobi.reduce(
    (a, o) => ({ trzba: a.trzba + o.trzba, ks: a.ks + o.ks, litry: a.litry + o.litry, uzaverek: a.uzaverek + o.uzaverek }),
    { trzba: 0, ks: 0, litry: 0, uzaverek: 0 },
  );
  const trzbaPiva = prodejPoZbozi(v, od, do_).filter((p) => p.jePivo).reduce((a, p) => a + p.trzba, 0);
  return {
    trzba: zaokr(celkem.trzba, 2),
    ks: celkem.ks,
    litry: zaokr(celkem.litry),
    uzaverek: celkem.uzaverek,
    trzbaOstatni: zaokr(celkem.trzba - trzbaPiva, 2),
  };
}
