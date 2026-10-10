// 🧪 Simulace provozu obchodu: jeden měsíc od počáteční inventury po inventuru na konci měsíce.
// ---------------------------------------------------------------------------
// Slouží testu obchodSimulace.test.ts a ručním simulacím v náhledu. Obsahuje
//   • scénář (inventury, fasování, příjmy, odpisy, denní a týdenní uzávěrky,
//     dny „zavřeno") a
//   • NEZÁVISLÝ výpočet stavu skladu: den po dni přehraje všechny pohyby jako
//     účetní kniha (`stavPodleKnihy`). Aplikace počítá stav jinak — „poslední
//     inventura + součet pohybů po ní" (lib/obchodSklad.ts). Dva různé postupy,
//     které musí dát totéž číslo, jsou pojistka, že žádný z nich nelže.
import type {
  FasovaniRadek, InventuraRadek, OdpisRadek, PrijemRadek, ProdanyRadek, UzaverkaHlavicka, VstupSkladu, Zbozi,
} from './obchodSklad';

export const PIVA = [
  { id: 'b12s', name: '12° Světlá', degree: '12°' },
  { id: 'b10', name: '10° Desítka', degree: '10°' },
  { id: 'b12t', name: '12° Tmavá', degree: '12°' },
  { id: 'b8', name: 'Osma', degree: '8°' },
];
export const OBALY = [
  { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'l1', label: 'Lahve 1l', kind: 'bottle', volume_l: 1 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];

export const ZBOZI: Zbozi[] = [
  { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', cena: 48, min_ks: 24, aktivni: true },
  { kod: '11009', nazev: 'Pivo sklo 10° sv. 0,5l', beer_id: 'b10', package_id: 'l05', cena: 43, min_ks: 24, aktivni: true },
  { kod: '11004', nazev: 'Pivo sklo 12° tmavá 0,5l', beer_id: 'b12t', package_id: 'l05', cena: 49, min_ks: 12, aktivni: true },
  { kod: '10241', nazev: 'Pivo sud 30l 10° světlá', beer_id: 'b10', package_id: 'k30', cena: 1275, min_ks: 2, aktivni: true },
  { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'l1', cena: 84, min_ks: 6, aktivni: true },
  { kod: '15160', nazev: '0,5l limo sklo', beer_id: null, package_id: null, cena: 31, min_ks: 5, aktivni: true },
  { kod: '62019', nazev: 'Kyn-Pivní sprchový gel 300ml', beer_id: null, package_id: null, cena: 149, min_ks: null, aktivni: true },
];
export const KODY = ZBOZI.map((z) => z.kod);

export type ZavrenoDen = { datum: string };

export type Scenar = {
  vstup: VstupSkladu;
  zavreno: ZavrenoDen[];
  /** První den, od kterého má smysl počítat (den před první inventurou). */
  zacatek: string;
};

const posun = (iso: string, dnu: number) => new Date(Date.parse(iso + 'T00:00:00Z') + dnu * 86_400_000).toISOString().slice(0, 10);
const dny = (od: string, do_: string): string[] => { const o: string[] = []; for (let d = od; d <= do_; d = posun(d, 1)) o.push(d); return o; };
export { dny as dnyMeziData };

/** Prodej za den: pevné číslo pro každé zboží a den, ať je každý řádek dohledatelný (bez náhody). */
function prodejDne(kod: string, datum: string): number {
  const den = Number(datum.slice(8, 10));
  const mesic = Number(datum.slice(5, 7));
  const zaklad: Record<string, number> = { '11001': 9, '11009': 6, '11004': 3, '10241': 0.4, '11141': 2, '15160': 2, '62019': 0.3 };
  const v = zaklad[kod];
  // pevný, „nepravidelný" vzorec bez náhody: prodej kolísá podle dne v měsíci
  const k = ((den * 7 + mesic * 3 + kod.length) % 5) / 2 + 0.5; // 0.5 … 2.5
  return Math.max(0, Math.round(v * k));
}

let seq = 0;
function uzaverka(typ: 'denni' | 'tydenni', od: string, do_: string, cislo: string): { h: UzaverkaHlavicka; r: ProdanyRadek[] } {
  const id = `u-${++seq}`;
  const r: ProdanyRadek[] = [];
  for (const z of ZBOZI) {
    const ks = dny(od, do_).reduce((a, d) => a + prodejDne(z.kod, d), 0);
    if (ks > 0) r.push({ uzaverka_id: id, kod: z.kod, nazev: z.nazev, mnozstvi: ks, cena: Number(z.cena), celkem: ks * Number(z.cena) });
  }
  const trzba = r.reduce((a, x) => a + Number(x.celkem), 0);
  return { h: { id, typ, datum_od: od, datum_do: do_, cislo, stredisko: '2', trzba }, r };
}

/** Měsíc říjen 2026 + začátek listopadu. Bez závěrečné inventury (`sInventurouNaKonci` ji dodá z účetní knihy). */
export function sestavScenar(): Scenar {
  seq = 0;
  const inv = (datum: string, hodnoty: Record<string, number>): InventuraRadek[] =>
    Object.entries(hodnoty).map(([kod, napocitano]) => ({ kod, datum, napocitano }));

  const inventury = inv('2026-09-30', { '11001': 100, '11009': 60, '11004': 40, '10241': 6, '11141': 20, '15160': 24, '62019': 10 });

  const fasovani: FasovaniRadek[] = [
    { beer_id: 'b12s', package_id: 'l05', quantity: 500, entry_date: '2026-09-15' }, // před inventurou — už je v počátečním stavu
    { beer_id: 'b12s', package_id: 'l05', quantity: 48, entry_date: '2026-10-01' },
    { beer_id: 'b10', package_id: 'k30', quantity: 2, entry_date: '2026-10-01' },
    { beer_id: 'b10', package_id: 'l05', quantity: 48, entry_date: '2026-10-02' },
    { beer_id: 'b8', package_id: 'l05', quantity: 12, entry_date: '2026-10-08' }, // pivo, které obchod nemá jako zboží
    { beer_id: 'b12s', package_id: 'l05', quantity: 120, entry_date: '2026-10-12' },
    { beer_id: 'b12t', package_id: 'l05', quantity: 48, entry_date: '2026-10-12' },
    { beer_id: 'b10', package_id: 'l05', quantity: 72, entry_date: '2026-10-12' },
    { beer_id: 'b10', package_id: 'k30', quantity: 4, entry_date: '2026-10-12' },
    { beer_id: 'b12s', package_id: 'l1', quantity: 24, entry_date: '2026-10-12' },
    { beer_id: 'b12s', package_id: 'l05', quantity: 120, entry_date: '2026-10-20' },
    { beer_id: 'b10', package_id: 'l05', quantity: 72, entry_date: '2026-10-20' },
    { beer_id: 'b12t', package_id: 'l05', quantity: 48, entry_date: '2026-10-20' },
    { beer_id: 'b12s', package_id: 'l1', quantity: 24, entry_date: '2026-10-20' },
    { beer_id: 'b12s', package_id: 'l05', quantity: 96, entry_date: '2026-10-27' },
    { beer_id: 'b12s', package_id: 'l05', quantity: 96, entry_date: '2026-11-02' },
    { beer_id: 'b10', package_id: 'l05', quantity: 48, entry_date: '2026-11-02' },
  ];
  const prijmy: PrijemRadek[] = [
    { kod: '15160', datum: '2026-10-03', mnozstvi: 12 },
    { kod: '62019', datum: '2026-10-10', mnozstvi: 5 },
    { kod: '15160', datum: '2026-10-17', mnozstvi: 24 },
    { kod: '15160', datum: '2026-10-24', mnozstvi: 24 },
    { kod: '15160', datum: '2026-11-03', mnozstvi: 24 },
  ];
  const odpisy: OdpisRadek[] = [
    { kod: '15160', datum: '2026-10-14', mnozstvi: 2, duvod: 'rozbite' },
    { kod: '11001', datum: '2026-10-14', mnozstvi: 1, duvod: 'rozbite' },
    { kod: '62019', datum: '2026-10-21', mnozstvi: 1, duvod: 'ztrata' },
    { kod: '11001', datum: '2026-10-29', mnozstvi: 2, duvod: 'prosle' },
  ];

  const uzaverky: UzaverkaHlavicka[] = [];
  const radky: ProdanyRadek[] = [];
  const pridej = (typ: 'denni' | 'tydenni', od: string, do_: string, cislo: string) => {
    const u = uzaverka(typ, od, do_, cislo);
    uzaverky.push(u.h);
    radky.push(...u.r);
  };
  // 1.–2. 10. denní; 3. 10. chybí (mezera); 4. 10. zavřeno; 5.–7. denní; 8.–9. chybí; 10. denní; 11. zavřeno
  let c = 2900;
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-10']) pridej('denni', d, d, `2/${c++}`);
  // dva týdny týdenní uzávěrkou (pondělí–neděle)
  pridej('tydenni', '2026-10-12', '2026-10-18', `2/${c++}`);
  pridej('tydenni', '2026-10-19', '2026-10-25', `2/${c++}`);
  // poslední týden měsíce zase denní, aby se dalo inventurovat na konci měsíce
  for (const d of dny('2026-10-26', '2026-10-31')) pridej('denni', d, d, `2/${c++}`);
  // začátek listopadu (po inventuře)
  for (const d of dny('2026-11-01', '2026-11-05')) pridej('denni', d, d, `2/${c++}`);

  const zavreno: ZavrenoDen[] = [{ datum: '2026-10-04' }, { datum: '2026-10-11' }];

  return {
    vstup: { zbozi: ZBOZI, fasovani, prijmy, odpisy, uzaverky, radky, inventury },
    zavreno,
    zacatek: '2026-09-29',
  };
}

// ── Nezávislý výpočet: účetní kniha den po dni ───────────────────────────

const cislo = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Stav zboží na konci dne `kDatu`, přehraný den po dni.
 * Každý den: pohyby dne (fasování, příjem, odpis, uzávěrky, které toho dne
 * končí) se přičtou ke stavu — pokud už nějaký stav je — a nakonec, na konci
 * dne, napočítaná inventura stav PŘEPÍŠE na skutečné číslo.
 * Dokud zboží nikdo nenapočítal, je stav neznámý (null).
 */
export function stavPodleKnihy(s: Scenar, kod: string, kDatu: string): number | null {
  const v = s.vstup;
  const z = v.zbozi.find((x) => x.kod === kod)!;
  let stav: number | null = null;
  for (const d of dny(s.zacatek, kDatu)) {
    let zmena = 0;
    if (z.beer_id && z.package_id) {
      for (const f of v.fasovani) if (f.entry_date === d && f.beer_id === z.beer_id && f.package_id === z.package_id) zmena += cislo(f.quantity);
    }
    for (const p of v.prijmy) if (p.kod === kod && p.datum === d) zmena += cislo(p.mnozstvi);
    for (const o of v.odpisy ?? []) if (o.kod === kod && o.datum === d) zmena -= cislo(o.mnozstvi);
    for (const u of v.uzaverky) {
      if (u.datum_do !== d) continue;
      for (const r of v.radky) if (r.uzaverka_id === u.id && r.kod === kod) zmena -= cislo(r.mnozstvi);
    }
    if (stav != null) stav += zmena;
    const i = v.inventury.find((x) => x.kod === kod && x.datum === d);
    if (i) stav = cislo(i.napocitano);
  }
  return stav == null ? null : Math.round(stav * 100) / 100;
}

/**
 * Přidá inventuru na konec měsíce: napočítané číslo = stav podle knihy + odchylka
 * (manko / přebytek), tak jak by to dopadlo u regálu.
 */
export function sInventurouNaKonci(s: Scenar, datum: string, odchylky: Record<string, number>): Scenar {
  const nove = KODY.map((kod) => ({ kod, datum, napocitano: (stavPodleKnihy(s, kod, datum) ?? 0) + (odchylky[kod] ?? 0), ocekavano: stavPodleKnihy(s, kod, datum) }));
  return { ...s, vstup: { ...s.vstup, inventury: [...s.vstup.inventury, ...nove] } };
}
