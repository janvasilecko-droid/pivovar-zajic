// 🏪 Sklad obchodu — počítá se, neukládá.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: „prodejna fasuje piva ze skladu pivovaru do vlastního
// skladu, kde nejsou jen piva, a z vlastního skladu prodává."
//
//   Do skladu obchodu přibývá:  Fasování → Prodejna (tabulka fasovani_private;
//                               sklad pivovaru se z ní odečítá jako dosud)
//                               a ruční příjem zboží (obchod_prijem)
//   Ze skladu obchodu ubývá:    uzávěrka z pokladny (obchod_uzaverky + řádky)
//   Počítá se od inventury:     poslední napočítaný stav zboží + příjmy −
//                               prodej po tom dni (obchod_inventura)
//
// Stav se NEUKLÁDÁ. Smazání uzávěrky nebo fasování ho proto vrátí samo a nic
// se nemůže rozjet (stejná zásada jako u skladu pivovaru, lib/stockLedger.ts).
//
// Inventura je stav KE KONCI dne: co se ten den zapsalo (fasování, uzávěrka),
// už v napočítaném čísle je a znovu se nepřičítá.

export type TypUzaverky = 'denni' | 'tydenni' | 'mesicni';

export const NAZVY_TYPU: Record<TypUzaverky, string> = {
  denni: 'Denní',
  tydenni: 'Týdenní',
  mesicni: 'Měsíční',
};

export type Zbozi = {
  kod: string;
  nazev: string;
  beer_id: string | null;
  package_id: string | null;
  cena?: number | string | null;
  min_ks?: number | string | null;
  aktivni?: boolean | null;
};

export type FasovaniRadek = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number | string | null;
  entry_date: string;
};

export type PrijemRadek = { id?: string; kod: string; datum: string; mnozstvi: number | string };

export type DuvodOdpisu = 'rozbite' | 'prosle' | 'ztrata' | 'vlastni' | 'jine';

export const NAZVY_DUVODU: Record<DuvodOdpisu, string> = {
  rozbite: 'Rozbité',
  prosle: 'Prošlé',
  ztrata: 'Ztráta / manko',
  vlastni: 'Vlastní spotřeba',
  jine: 'Jiné',
};

/** Odpis zboží ze skladu obchodu (kusy se zapisují kladně, ubývá jimi). */
export type OdpisRadek = { id?: string; kod: string; datum: string; mnozstvi: number | string; duvod?: DuvodOdpisu | string | null };

export type UzaverkaHlavicka = {
  id: string;
  datum_od: string;
  datum_do: string;
  typ?: TypUzaverky | string;
  cislo?: string | null;
  stredisko?: string | null;
  trzba?: number | string | null;
};

export type ProdanyRadek = {
  uzaverka_id: string;
  kod: string;
  nazev?: string | null;
  mnozstvi: number | string;
  cena?: number | string | null;
  celkem?: number | string | null;
};

export type InventuraRadek = {
  kod: string;
  datum: string;
  napocitano: number | string;
  ocekavano?: number | string | null;
};

export type VstupSkladu = {
  zbozi: Zbozi[];
  fasovani: FasovaniRadek[];
  prijmy: PrijemRadek[];
  /** Odpis zboží (rozbité, prošlé…). Nepovinný — dokud neběží migrace, není co odečítat. */
  odpisy?: OdpisRadek[];
  uzaverky: UzaverkaHlavicka[];
  radky: ProdanyRadek[];
  inventury: InventuraRadek[];
};

export type StavZbozi = {
  kod: string;
  nazev: string;
  /** Aktuální stav, nebo null, dokud zboží nikdo nenapočítal (není od čeho počítat). */
  stav: number | null;
  /** Datum inventury, od které se stav počítá. */
  odInventury: string | null;
  napocitano: number | null;
  fasovano: number;
  prijato: number;
  prodano: number;
  /** Odepsáno od inventury (rozbité, prošlé, ztráta). */
  odepsano: number;
  min: number | null;
};

const cislo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const zaokr = (n: number) => Math.round(n * 100) / 100;

/** Klíč pivo + obal — podle něj se Fasování připisuje ke zboží. */
export const klicPivaObalu = (beerId: string | null | undefined, packageId: string | null | undefined) =>
  beerId && packageId ? `${beerId}|${packageId}` : '';

/** Zboží podle piva a obalu (jen aktivní; v databázi je jedno na dvojici). */
export function zboziPodlePivaObalu(zbozi: Zbozi[]): Map<string, Zbozi> {
  const m = new Map<string, Zbozi>();
  for (const z of zbozi) {
    if (z.aktivni === false) continue;
    const k = klicPivaObalu(z.beer_id, z.package_id);
    if (k && !m.has(k)) m.set(k, z);
  }
  return m;
}

/** Poslední inventura zboží ke dni `kDatu` včetně. */
function poslednInventura(inventury: InventuraRadek[], kDatu: string): Map<string, InventuraRadek> {
  const m = new Map<string, InventuraRadek>();
  for (const i of inventury) {
    if (i.datum > kDatu) continue;
    const dosavadni = m.get(i.kod);
    if (!dosavadni || i.datum >= dosavadni.datum) m.set(i.kod, i);
  }
  return m;
}

/**
 * Stav skladu obchodu ke dni `kDatu` (včetně) — pro každé zboží.
 *
 * Zboží bez inventury má `stav: null`: není od čeho počítat. Nula by tvrdila,
 * že je sklad prázdný, a spustila by planý poplach.
 */
export function stavySkladu(vstup: VstupSkladu, kDatu: string): StavZbozi[] {
  const poPivu = zboziPodlePivaObalu(vstup.zbozi);
  const inv = poslednInventura(vstup.inventury, kDatu);
  const dnyUzaverek = new Map(vstup.uzaverky.map((u) => [u.id, u.datum_do]));

  const fasovano = new Map<string, { datum: string; ks: number }[]>();
  for (const f of vstup.fasovani) {
    const z = poPivu.get(klicPivaObalu(f.beer_id, f.package_id));
    if (!z) continue;
    const ks = cislo(f.quantity);
    if (!ks) continue;
    (fasovano.get(z.kod) ?? fasovano.set(z.kod, []).get(z.kod)!).push({ datum: f.entry_date, ks });
  }
  const prijato = new Map<string, { datum: string; ks: number }[]>();
  for (const p of vstup.prijmy) {
    (prijato.get(p.kod) ?? prijato.set(p.kod, []).get(p.kod)!).push({ datum: p.datum, ks: cislo(p.mnozstvi) });
  }
  const odepsano = new Map<string, { datum: string; ks: number }[]>();
  for (const o of vstup.odpisy ?? []) {
    (odepsano.get(o.kod) ?? odepsano.set(o.kod, []).get(o.kod)!).push({ datum: o.datum, ks: cislo(o.mnozstvi) });
  }
  const prodano = new Map<string, { datum: string; ks: number }[]>();
  for (const r of vstup.radky) {
    const datum = dnyUzaverek.get(r.uzaverka_id);
    if (!datum) continue;
    (prodano.get(r.kod) ?? prodano.set(r.kod, []).get(r.kod)!).push({ datum, ks: cislo(r.mnozstvi) });
  }

  return vstup.zbozi
    .filter((z) => z.aktivni !== false)
    .map((z): StavZbozi => {
      const i = inv.get(z.kod) ?? null;
      const od = i?.datum ?? null;
      const soucet = (m: Map<string, { datum: string; ks: number }[]>) =>
        zaokr((m.get(z.kod) ?? []).filter((x) => od != null && x.datum > od && x.datum <= kDatu).reduce((a, x) => a + x.ks, 0));
      const f = soucet(fasovano);
      const p = soucet(prijato);
      const s = soucet(prodano);
      const o = soucet(odepsano);
      const min = z.min_ks == null || z.min_ks === '' ? null : cislo(z.min_ks);
      return {
        kod: z.kod,
        nazev: z.nazev,
        stav: i ? zaokr(cislo(i.napocitano) + f + p - s - o) : null,
        odInventury: od,
        napocitano: i ? cislo(i.napocitano) : null,
        fasovano: f,
        prijato: p,
        prodano: s,
        odepsano: o,
        min,
      };
    })
    .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
}

/** Uzávěrka, jejíž období zasahuje přes den, ke kterému se zboží napočítalo. */
export type UzaverkaPresInventuru = {
  id: string;
  cislo: string | null;
  datum_od: string;
  datum_do: string;
  /** Den inventury uprostřed období uzávěrky. */
  inventura: string;
};

/**
 * Uzávěrky, které přetínají inventuru: `datum_od ≤ den inventury < datum_do`.
 *
 * Sklad se počítá od inventury a uzávěrka se odečítá celá ke dni svého konce.
 * Uzávěrka, která začíná PŘED inventurou a končí PO ní, v sobě ale nese i prodej
 * před inventurou — ten už je v napočítaném čísle, takže by se odečetl podruhé
 * a sklad by ukazoval míň, než je. Rozdělit ji na „před" a „po" nejde (z jedné
 * uzávěrky se den neodvodí), proto se tu jen hlásí, ať se to opraví.
 *
 * Počítají se jen inventury, od kterých se sklad OPRAVDU počítá (poslední
 * inventura nějakého zboží) — starší už přepsala novější.
 */
export function uzaverkyPresInventuru(
  uzaverky: Pick<UzaverkaHlavicka, 'id' | 'datum_od' | 'datum_do' | 'cislo'>[],
  inventury: Pick<InventuraRadek, 'kod' | 'datum'>[],
): UzaverkaPresInventuru[] {
  const posledniPoKodu = new Map<string, string>();
  for (const i of inventury) {
    const dosud = posledniPoKodu.get(i.kod);
    if (!dosud || i.datum > dosud) posledniPoKodu.set(i.kod, i.datum);
  }
  const dny = [...new Set(posledniPoKodu.values())].sort();
  const out: UzaverkaPresInventuru[] = [];
  for (const u of uzaverky) {
    const x = dny.filter((d) => u.datum_od <= d && d < u.datum_do).pop();
    if (x) out.push({ id: u.id, cislo: u.cislo ?? null, datum_od: u.datum_od, datum_do: u.datum_do, inventura: x });
  }
  return out;
}

/** Fasování do obchodu, které nemá zboží — kusy se nikam nepřipsaly. */
export type FasovaniBezZbozi = { beer_id: string; package_id: string; ks: number; poslednDatum: string };

/**
 * Fasování od první inventury, ke kterému v obchodě neexistuje zboží.
 * Dřívější fasování se neřeší — před inventurou sklad obchodu neexistuje.
 */
export function fasovaniBezZbozi(vstup: Pick<VstupSkladu, 'zbozi' | 'fasovani' | 'inventury'>): FasovaniBezZbozi[] {
  if (vstup.inventury.length === 0) return [];
  const od = vstup.inventury.reduce((min, i) => (i.datum < min ? i.datum : min), vstup.inventury[0].datum);
  const poPivu = zboziPodlePivaObalu(vstup.zbozi);
  const m = new Map<string, FasovaniBezZbozi>();
  for (const f of vstup.fasovani) {
    if (!f.beer_id || !f.package_id || f.entry_date <= od) continue;
    const k = klicPivaObalu(f.beer_id, f.package_id);
    if (poPivu.has(k)) continue;
    const ks = cislo(f.quantity);
    if (!ks) continue;
    const dosud = m.get(k);
    m.set(k, {
      beer_id: f.beer_id,
      package_id: f.package_id,
      ks: zaokr((dosud?.ks ?? 0) + ks),
      poslednDatum: dosud && dosud.poslednDatum > f.entry_date ? dosud.poslednDatum : f.entry_date,
    });
  }
  return [...m.values()];
}

export type DruhVarovani = 'zaporny' | 'pod_minimem' | 'nula';

export type Varovani = { kod: string; nazev: string; druh: DruhVarovani; stav: number; min: number | null };

/**
 * Co je potřeba hlídat: záporný stav (prodalo se víc, než se naskladnilo —
 * chybí fasování nebo příjem), stav pod minimem a vyprodáno u zboží, které
 * má nastavené minimum.
 */
export function varovaniZasob(stavy: StavZbozi[]): Varovani[] {
  const out: Varovani[] = [];
  for (const s of stavy) {
    if (s.stav == null) continue;
    if (s.stav < 0) out.push({ kod: s.kod, nazev: s.nazev, druh: 'zaporny', stav: s.stav, min: s.min });
    else if (s.min != null && s.min > 0 && s.stav === 0) out.push({ kod: s.kod, nazev: s.nazev, druh: 'nula', stav: s.stav, min: s.min });
    else if (s.min != null && s.min > 0 && s.stav < s.min) out.push({ kod: s.kod, nazev: s.nazev, druh: 'pod_minimem', stav: s.stav, min: s.min });
  }
  const poradi: Record<DruhVarovani, number> = { zaporny: 0, nula: 1, pod_minimem: 2 };
  return out.sort((a, b) => poradi[a.druh] - poradi[b.druh] || a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
}

const dnuMezi = (od: string, do_: string) =>
  Math.round((Date.parse(do_ + 'T00:00:00Z') - Date.parse(od + 'T00:00:00Z')) / 86_400_000);

/**
 * Průměrný denní prodej zboží za posledních `okno` dní: prodané kusy
 * z uzávěrek, které skončily v okně, děleno počtem dní, které pokrývají.
 * Nic neprodáno / žádná uzávěrka = null (neodhaduje se).
 */
export function prumernyDenniProdej(
  kod: string,
  uzaverky: UzaverkaHlavicka[],
  radky: ProdanyRadek[],
  dnes: string,
  okno = 30,
): number | null {
  const odOkna = new Date(Date.parse(dnes + 'T00:00:00Z') - okno * 86_400_000).toISOString().slice(0, 10);
  const vOkne = uzaverky.filter((u) => u.datum_do > odOkna && u.datum_do <= dnes);
  if (vOkne.length === 0) return null;
  const dny = vOkne.reduce((a, u) => a + dnuMezi(u.datum_od, u.datum_do) + 1, 0);
  if (dny <= 0) return null;
  const ids = new Set(vOkne.map((u) => u.id));
  const ks = radky.filter((r) => r.kod === kod && ids.has(r.uzaverka_id)).reduce((a, r) => a + cislo(r.mnozstvi), 0);
  return ks > 0 ? zaokr(ks / dny) : null;
}

/** Na kolik dní prodeje stav vystačí; null, když nejde odhadnout. */
export function dnyZasoby(stav: number | null, prumerZaDen: number | null): number | null {
  if (stav == null || prumerZaDen == null || prumerZaDen <= 0) return null;
  return Math.max(0, Math.floor(stav / prumerZaDen));
}

export type PohybZbozi = {
  datum: string;
  druh: 'fasovani' | 'prijem' | 'prodej' | 'odpis' | 'inventura';
  /** Kladné přibylo, záporné ubylo; u inventury napočítaný stav. */
  ks: number;
  popis: string;
  /** Id zápisu u příjmu a odpisu — dá se podle něj smazat, když se zapsal omylem. */
  id?: string;
};

/** Pohyby jednoho zboží, nejnovější první — historie pod položkou skladu. */
export function pohybyZbozi(kod: string, vstup: VstupSkladu, limit = 40): PohybZbozi[] {
  const z = vstup.zbozi.find((x) => x.kod === kod);
  if (!z) return [];
  const out: PohybZbozi[] = [];
  const k = klicPivaObalu(z.beer_id, z.package_id);
  if (k) {
    for (const f of vstup.fasovani) {
      if (klicPivaObalu(f.beer_id, f.package_id) !== k) continue;
      const ks = cislo(f.quantity);
      if (ks) out.push({ datum: f.entry_date, druh: 'fasovani', ks, popis: 'Fasování do obchodu' });
    }
  }
  for (const p of vstup.prijmy) {
    if (p.kod === kod) out.push({ datum: p.datum, druh: 'prijem', ks: cislo(p.mnozstvi), popis: 'Příjem zboží', id: p.id });
  }
  for (const o of vstup.odpisy ?? []) {
    if (o.kod !== kod) continue;
    const duvod = NAZVY_DUVODU[o.duvod as DuvodOdpisu];
    out.push({ datum: o.datum, druh: 'odpis', ks: -cislo(o.mnozstvi), popis: duvod ? `Odpis — ${duvod.toLowerCase()}` : 'Odpis', id: o.id });
  }
  const uz = new Map(vstup.uzaverky.map((u) => [u.id, u]));
  for (const r of vstup.radky) {
    if (r.kod !== kod) continue;
    const u = uz.get(r.uzaverka_id);
    if (u) out.push({ datum: u.datum_do, druh: 'prodej', ks: -cislo(r.mnozstvi), popis: `Uzávěrka ${u.cislo ?? ''}`.trim() });
  }
  for (const i of vstup.inventury) {
    if (i.kod === kod) out.push({ datum: i.datum, druh: 'inventura', ks: cislo(i.napocitano), popis: 'Inventura' });
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, limit);
}
