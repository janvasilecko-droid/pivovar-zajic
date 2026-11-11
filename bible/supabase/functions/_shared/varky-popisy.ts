// 🍺 Receptury a várky (etapa 8) — katalog hodnot várky, porovnání várek
// a text pro Clauda. Bez závislostí mimo výpočetní modul (taky bez
// závislostí): sdílí ho appka (formulář, porovnání), bible-api (kontrola
// vstupu) i konektor bible-mcp — porovnání tak v appce i u Clauda počítá
// stejný kód.
//
// Architektura § 8: „Pracuje jen s uloženými údaji. Chybějící hodnoty
// vyjmenuje, nedomýšlí je." Odvozené hodnoty (výtěžek, prokvašení…) se
// počítají jen z toho, co je zapsané, výpočetním modulem z etapy 6; co
// k nim chybí, porovnání vyjmenuje.
import { MimoRozsah, spocitej } from './vypocty/zaklad.ts';
import { najdiVypocet } from './vypocty/katalog.ts';

export const FAZE_VARKY = [
  { id: 'surovina', nazev: 'Sypání a voda' },
  { id: 'rmutovani', nazev: 'Rmutování' },
  { id: 'scezovani', nazev: 'Scezování' },
  { id: 'chmelovar', nazev: 'Chmelovar a mladina' },
  { id: 'kvaseni', nazev: 'Kvašení' },
  { id: 'lezeni', nazev: 'Ležení' },
  { id: 'pivo', nazev: 'Hotové pivo' },
] as const;

export type FazeVarky = (typeof FAZE_VARKY)[number]['id'];

export type HodnotaKatalogu = { klic: string; nazev: string; jednotka: string; faze: FazeVarky; min: number; max: number; cele?: true; mist: number };

/**
 * Hodnoty várky. Stejný seznam (klíč, rozsah, celé číslo) je v SQL
 * (bible_katalog_hodnot_varky v migraci 20261111010000_bible_varky) — shodu
 * hlídá test. Objemy mladiny a sladiny jsou horké (jak se měří ve varně).
 */
export const HODNOTY_VARKY: readonly HodnotaKatalogu[] = [
  { klic: 'sypani_kg', nazev: 'Sypání (slad a suroviny)', jednotka: 'kg', faze: 'surovina', min: 0.1, max: 200000, mist: 1 },
  { klic: 'voda_vystirka_l', nazev: 'Voda na vystírku', jednotka: 'L', faze: 'surovina', min: 1, max: 1000000, mist: 0 },
  { klic: 'rmut_ph', nazev: 'pH rmutu', jednotka: '', faze: 'rmutovani', min: 3, max: 8, mist: 2 },
  { klic: 'rmutovani_min', nazev: 'Délka rmutování', jednotka: 'min', faze: 'rmutovani', min: 1, max: 1000, mist: 0 },
  { klic: 'voda_vyslazovaci_l', nazev: 'Vyslazovací voda', jednotka: 'L', faze: 'scezovani', min: 0, max: 1000000, mist: 0 },
  { klic: 'predek_p', nazev: 'Předek (první sladina)', jednotka: '°P', faze: 'scezovani', min: 0, max: 35, mist: 1 },
  { klic: 'posledni_sladina_p', nazev: 'Poslední sladina', jednotka: '°P', faze: 'scezovani', min: 0, max: 20, mist: 1 },
  { klic: 'scezovani_min', nazev: 'Délka scezování', jednotka: 'min', faze: 'scezovani', min: 1, max: 1000, mist: 0 },
  { klic: 'sladina_objem_hl', nazev: 'Objem sladiny před chmelovarem (horké)', jednotka: 'hl', faze: 'scezovani', min: 0.01, max: 2000, mist: 2 },
  { klic: 'sladina_p', nazev: 'Extrakt sladiny před chmelovarem', jednotka: '°P', faze: 'scezovani', min: 0, max: 35, mist: 1 },
  { klic: 'chmelovar_min', nazev: 'Délka chmelovaru', jednotka: 'min', faze: 'chmelovar', min: 1, max: 600, mist: 0 },
  { klic: 'mladina_objem_hl', nazev: 'Objem vyražené mladiny (horké)', jednotka: 'hl', faze: 'chmelovar', min: 0.01, max: 2000, mist: 2 },
  { klic: 'mladina_p', nazev: 'Extrakt mladiny (původní extrakt)', jednotka: '°P', faze: 'chmelovar', min: 1, max: 35, mist: 2 },
  { klic: 'mladina_ph', nazev: 'pH mladiny', jednotka: '', faze: 'chmelovar', min: 3, max: 8, mist: 2 },
  { klic: 'zakvaseno_hl', nazev: 'Objem zakvašené mladiny', jednotka: 'hl', faze: 'kvaseni', min: 0.01, max: 2000, mist: 2 },
  { klic: 'zakvaseni_teplota_c', nazev: 'Teplota zakvašení', jednotka: '°C', faze: 'kvaseni', min: -2, max: 40, mist: 1 },
  { klic: 'kvasnice_generace', nazev: 'Generace kvasnic', jednotka: '', faze: 'kvaseni', min: 0, max: 100, cele: true, mist: 0 },
  { klic: 'kvasnice_l', nazev: 'Dávka kvasnic (hustá kaše)', jednotka: 'L', faze: 'kvaseni', min: 0, max: 100000, mist: 1 },
  { klic: 'kvaseni_max_teplota_c', nazev: 'Nejvyšší teplota kvašení', jednotka: '°C', faze: 'kvaseni', min: -2, max: 40, mist: 1 },
  { klic: 'kvaseni_dnu', nazev: 'Délka hlavního kvašení', jednotka: 'dní', faze: 'kvaseni', min: 0, max: 120, mist: 0 },
  { klic: 'mlade_pivo_p', nazev: 'Zdánlivý extrakt při sudování', jednotka: '°P', faze: 'kvaseni', min: -2, max: 25, mist: 2 },
  { klic: 'lezeni_dnu', nazev: 'Délka ležení', jednotka: 'dní', faze: 'lezeni', min: 0, max: 400, mist: 0 },
  { klic: 'lezeni_teplota_c', nazev: 'Teplota ležení', jednotka: '°C', faze: 'lezeni', min: -5, max: 30, mist: 1 },
  { klic: 'pivo_zdanlivy_p', nazev: 'Zdánlivý extrakt hotového piva', jednotka: '°P', faze: 'pivo', min: -2, max: 25, mist: 2 },
  { klic: 'pivo_alkohol_obj', nazev: 'Alkohol (laboratoř)', jednotka: '% obj.', faze: 'pivo', min: 0, max: 20, mist: 2 },
  { klic: 'pivo_ph', nazev: 'pH piva', jednotka: '', faze: 'pivo', min: 3, max: 6, mist: 2 },
  { klic: 'pivo_barva_ebc', nazev: 'Barva', jednotka: 'EBC', faze: 'pivo', min: 0, max: 300, mist: 1 },
  { klic: 'pivo_ibu', nazev: 'Hořkost', jednotka: 'IBU', faze: 'pivo', min: 0, max: 200, mist: 1 },
  { klic: 'pivo_co2_g_l', nazev: 'Obsah CO₂', jednotka: 'g/l', faze: 'pivo', min: 0, max: 15, mist: 2 },
  { klic: 'stoceno_hl', nazev: 'Stočeno celkem', jednotka: 'hl', faze: 'pivo', min: 0, max: 2000, mist: 2 },
];

export const najdiHodnotu = (klic: string): HodnotaKatalogu | undefined => HODNOTY_VARKY.find((h) => h.klic === klic);

export const DRUHY_SUROVIN = [
  { id: 'slad', nazev: 'Slad' },
  { id: 'chmel', nazev: 'Chmel' },
  { id: 'kvasnice', nazev: 'Kvasnice' },
  { id: 'voda', nazev: 'Voda a úprava vody' },
  { id: 'prisada', nazev: 'Přísada' },
] as const;
export type DruhSuroviny = (typeof DRUHY_SUROVIN)[number]['id'];

export const FAZE_KROKU = [
  { id: 'rmutovani', nazev: 'Rmutování' },
  { id: 'scezovani', nazev: 'Scezování' },
  { id: 'chmelovar', nazev: 'Chmelovar' },
  { id: 'chlazeni', nazev: 'Chlazení' },
  { id: 'kvaseni', nazev: 'Kvašení' },
  { id: 'lezeni', nazev: 'Ležení' },
  { id: 'jine', nazev: 'Jiné' },
] as const;
export type FazeKroku = (typeof FAZE_KROKU)[number]['id'];

export type Surovina = { druh: DruhSuroviny; nazev: string; mnozstvi?: number; jednotka?: string; kdy?: string; poznamka?: string };
export type Krok = { faze: FazeKroku; nazev: string; teplota_c?: number; minut?: number; poznamka?: string };

export type RecepturaData = {
  id: string;
  nazev: string;
  styl: string | null;
  cil_objem_hl: number | null;
  cil_stupnovitost: number | null;
  cil_alkohol: number | null;
  cil_ibu: number | null;
  cil_barva_ebc: number | null;
  suroviny: Surovina[];
  kroky: Krok[];
  poznamka: string | null;
};

export type VarkaData = {
  id: string;
  receptura_id: string | null;
  cislo: string | null;
  pivo: string;
  datum_varu: string;
  hodnoty: Record<string, number>;
  poznamka: string | null;
};

/** Číslo pro člověka: desetinná čárka, skutečné minus, bez zbytečných nul. */
export function cislo(n: number, mist: number): string {
  let s = n.toFixed(mist);
  if (mist > 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('.', ',').replace(/^-/, '−');
}

export const datumCesky = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso;
};

/** Popisek várky: „č. 12 · Světlý ležák 11 · 3. 11. 2026". */
export const popisVarky = (v: VarkaData): string => [v.cislo ? `č. ${v.cislo}` : null, v.pivo, datumCesky(v.datum_varu)].filter(Boolean).join(' · ');

// --- Odvozené hodnoty (jen ze zapsaných údajů) -------------------------------

export type Odvozena = {
  klic: string;
  nazev: string;
  jednotka: string;
  mist: number;
  /** Hodnoty várky, ze kterých se počítá (všechny musí být zapsané). */
  potrebuje: readonly string[];
  /** Jak se počítá — jde do poznámek porovnání. */
  jak: string;
  spocitej: (h: Record<string, number>) => number;
};

function vysledekVypoctu(id: string, vstupy: Record<string, number>, index: number): number {
  const d = najdiVypocet(id);
  if (!d) throw new Error(`Výpočet ${id} v katalogu není.`);
  return spocitej(d, vstupy).vysledky[index].hodnota;
}

export const ODVOZENE: readonly Odvozena[] = [
  {
    klic: 'vytezek_pct', nazev: 'Varní výtěžek', jednotka: '%', mist: 1,
    potrebuje: ['mladina_objem_hl', 'mladina_p', 'sypani_kg'],
    jak: 'Varní výtěžek z objemu horké vyražené mladiny s korekcí 0,96, extraktu mladiny a sypání (výpočet „Varní výtěžek" z Výpočtové laboratoře).',
    spocitej: (h) => vysledekVypoctu('varni_vytezek', { v: h.mladina_objem_hl, e: h.mladina_p, s: h.sypani_kg, k: 0.96 }, 0),
  },
  {
    klic: 'odpar_pct', nazev: 'Odpar při chmelovaru', jednotka: '%', mist: 1,
    potrebuje: ['sladina_objem_hl', 'mladina_objem_hl'],
    jak: 'Odpar = (objem sladiny − objem vyražené mladiny) / objem sladiny; oba objemy horké.',
    spocitej: (h) => {
      if (h.mladina_objem_hl > h.sladina_objem_hl) throw new MimoRozsah('Objem mladiny je větší než objem sladiny — zkontroluj zápis.');
      return (h.sladina_objem_hl - h.mladina_objem_hl) / h.sladina_objem_hl * 100;
    },
  },
  {
    klic: 'prokvaseni_pct', nazev: 'Zdánlivé prokvašení', jednotka: '%', mist: 1,
    potrebuje: ['mladina_p', 'pivo_zdanlivy_p'],
    jak: 'Zdánlivé prokvašení z původního a zdánlivého extraktu (Balling, výpočet „Alkohol a prokvašení").',
    spocitej: (h) => vysledekVypoctu('alkohol', { oe: h.mladina_p, ae: h.pivo_zdanlivy_p }, 2),
  },
  {
    klic: 'alkohol_vypocet_obj', nazev: 'Alkohol (výpočet z extraktů)', jednotka: '% obj.', mist: 2,
    potrebuje: ['mladina_p', 'pivo_zdanlivy_p'],
    jak: 'Alkohol podle Ballinga z původního a zdánlivého extraktu — výpočet, ne laboratorní měření.',
    spocitej: (h) => vysledekVypoctu('alkohol', { oe: h.mladina_p, ae: h.pivo_zdanlivy_p }, 0),
  },
];

export type VysledekOdvozene = { hodnota: number } | { chybi: string[] } | { chyba: string };

/** Odvozená hodnota várky: číslo, nebo co chybí, nebo proč nejde spočítat. */
export function odvozenaHodnota(o: Odvozena, h: Record<string, number>): VysledekOdvozene {
  const chybi = o.potrebuje.filter((k) => typeof h[k] !== 'number');
  if (chybi.length > 0) return { chybi };
  try {
    return { hodnota: o.spocitej(h) };
  } catch (e) {
    if (e instanceof MimoRozsah) return { chyba: e.message };
    throw e;
  }
}

// --- Porovnání várek -------------------------------------------------------------

/** Cíl receptury k hodnotě várky (appka ho ukáže i ve formuláři). */
export const CIL_HODNOTY: Readonly<Record<string, 'cil_objem_hl' | 'cil_stupnovitost' | 'cil_alkohol' | 'cil_ibu' | 'cil_barva_ebc'>> = {
  mladina_objem_hl: 'cil_objem_hl',
  mladina_p: 'cil_stupnovitost',
  pivo_alkohol_obj: 'cil_alkohol',
  alkohol_vypocet_obj: 'cil_alkohol',
  pivo_ibu: 'cil_ibu',
  pivo_barva_ebc: 'cil_barva_ebc',
};

export type RadekPorovnani = {
  klic: string;
  nazev: string;
  jednotka: string;
  mist: number;
  faze: FazeVarky | 'odvozene';
  /** Hodnota za každou várku (ve stejném pořadí jako `varky`); null = nezapsáno / nejde spočítat. */
  hodnoty: (number | null)[];
  /** Cíl receptury za každou várku (várky můžou mít různé receptury). */
  cile: (number | null)[];
};

export type Porovnani = {
  varky: VarkaData[];
  radky: RadekPorovnani[];
  /** Co chybí, po várkách: „č. 12: Objem vyražené mladiny → nejde spočítat varní výtěžek". */
  chybi: { varka: string; polozky: string[] }[];
  /** Odvozené hodnoty, které nejde spočítat u žádné várky — jednou, ne u každé várky zvlášť. */
  nespocitano: { nazev: string; duvod: string }[];
  poznamky: string[];
};

/**
 * Porovná várky (seřadí od nejstarší). Řádek hodnoty je v porovnání, když ho
 * má aspoň jedna várka; odvozené hodnoty vždy (s tím, co k nim chybí).
 */
export function porovnejVarky(varky: readonly VarkaData[], receptury: readonly RecepturaData[] = []): Porovnani {
  const serazene = [...varky].sort((a, b) => a.datum_varu.localeCompare(b.datum_varu) || (a.cislo ?? '').localeCompare(b.cislo ?? '', 'cs', { numeric: true }));
  const recepturaVarky = serazene.map((v) => receptury.find((r) => r.id === v.receptura_id) ?? null);
  const cileRadku = (klic: string) => serazene.map((_, i) => {
    const pole = CIL_HODNOTY[klic];
    const r = recepturaVarky[i];
    const c = pole && r ? r[pole] : null;
    return typeof c === 'number' ? c : null;
  });

  const radky: RadekPorovnani[] = [];
  const chybiPo: string[][] = serazene.map(() => []);
  for (const h of HODNOTY_VARKY) {
    const hodnoty = serazene.map((v) => (typeof v.hodnoty[h.klic] === 'number' ? v.hodnoty[h.klic] : null));
    if (hodnoty.every((x) => x === null)) continue;
    radky.push({ klic: h.klic, nazev: h.nazev, jednotka: h.jednotka, mist: h.mist, faze: h.faze, hodnoty, cile: cileRadku(h.klic) });
    hodnoty.forEach((x, i) => { if (x === null) chybiPo[i].push(h.nazev); });
  }
  const poznamky: string[] = [];
  const nespocitano: { nazev: string; duvod: string }[] = [];
  const nazevKlice = (k: string) => najdiHodnotu(k)?.nazev ?? k;
  for (const o of ODVOZENE) {
    const vysledky = serazene.map((v) => odvozenaHodnota(o, v.hodnoty));
    radky.push({
      klic: o.klic, nazev: o.nazev, jednotka: o.jednotka, mist: o.mist, faze: 'odvozene',
      hodnoty: vysledky.map((x) => ('hodnota' in x ? x.hodnota : null)),
      cile: cileRadku(o.klic),
    });
    const nekde = vysledky.some((x) => 'hodnota' in x);
    if (nekde) poznamky.push(`${o.nazev}: ${o.jak}`);
    vysledky.forEach((x, i) => {
      // Chybný zápis (třeba víc mladiny než sladiny) je vždy u várky; chybějící vstup jen tam, kde to u jiné várky spočítat šlo.
      if ('chyba' in x) chybiPo[i].push(`${o.nazev}: ${x.chyba}`);
      else if ('chybi' in x && nekde) chybiPo[i].push(`${x.chybi.map(nazevKlice).join(', ')} → nejde spočítat ${o.nazev.toLowerCase()}`);
    });
    if (!nekde) {
      const chybejici = vysledky.filter((x): x is { chybi: string[] } => 'chybi' in x).map((x) => x.chybi);
      if (chybejici.length > 0) {
        const vsude = o.potrebuje.filter((k) => chybejici.length === serazene.length && chybejici.every((ch) => ch.includes(k)));
        const nekdeChybi = o.potrebuje.filter((k) => chybejici.some((ch) => ch.includes(k)));
        nespocitano.push({
          nazev: o.nazev,
          duvod: vsude.length > 0 ? `u žádné várky není zapsané: ${vsude.map(nazevKlice).join(', ')}` : `u každé várky chybí něco z: ${nekdeChybi.map(nazevKlice).join(', ')}`,
        });
      }
    }
  }
  // Odvozené řádky bez jediné hodnoty v porovnání nechávat nemá smysl — co k nim chybí, říká seznam „chybí".
  const radkyVen = radky.filter((r) => r.faze !== 'odvozene' || r.hodnoty.some((x) => x !== null));
  const chybi = serazene
    .map((v, i) => ({ varka: popisVarky(v), polozky: [...new Set(chybiPo[i])] }))
    .filter((c) => c.polozky.length > 0);
  if (recepturaVarky.some((r) => r === null)) poznamky.push('Várka bez receptury nemá cílové hodnoty — porovnává se jen s ostatními várkami.');
  return { varky: serazene, radky: radkyVen, chybi, nespocitano, poznamky };
}

/** Odchylka od cíle pro člověka: „+0,3", „−1,2", „0". */
export function odchylka(hodnota: number | null, cil: number | null, mist: number): string | null {
  if (hodnota === null || cil === null) return null;
  const d = hodnota - cil;
  const t = cislo(Math.abs(d), mist);
  return t === '0' ? '0' : `${d > 0 ? '+' : '−'}${t}`;
}

const hodnotaText = (n: number | null, r: RadekPorovnani) => (n === null ? '—' : `${cislo(n, r.mist)}${r.jednotka ? ` ${r.jednotka}` : ''}`);

/**
 * Porovnání jako text pro Clauda (nástroj porovnej_varky): tabulka, co chybí,
 * jak se počítalo. Výslovně: jen uložené údaje, nic nedomýšlet, příčiny jako
 * hypotézy s oporou v knihách.
 */
export function porovnaniText(p: Porovnani, receptury: readonly RecepturaData[] = []): string {
  if (p.varky.length === 0) return 'Žádná várka k porovnání (evidence várek je prázdná nebo neodpovídá výběru).';
  const radky: string[] = [
    `# Porovnání várek (${p.varky.length})`,
    'Údaje z evidence várek v appce (Pivovarská bible → Receptury a várky). Pracuj JEN s nimi: co v tabulce chybí, nebylo zapsané — vyjmenuj to a nedomýšlej. '
      + 'Příčiny odchylek hledej v knihách (hledej_v_knihach), v profilu pivovaru (profil_pivovaru) a výpočtech (vypocet) a označ je jako hypotézy, ne fakta.',
    '',
  ];
  const hlavicka = ['Hodnota', ...p.varky.map((v) => popisVarky(v))];
  radky.push(`| ${hlavicka.join(' | ')} |`, `|${hlavicka.map(() => '---').join('|')}|`);
  for (const r of p.radky) {
    const bunky = r.hodnoty.map((h, i) => {
      const o = odchylka(h, r.cile[i], r.mist);
      return `${hodnotaText(h, r)}${o !== null ? ` (cíl ${cislo(r.cile[i]!, r.mist)}, ${o})` : ''}`;
    });
    radky.push(`| ${r.faze === 'odvozene' ? `${r.nazev} (výpočet)` : r.nazev} | ${bunky.join(' | ')} |`);
  }
  const pouzite = receptury.filter((r) => p.varky.some((v) => v.receptura_id === r.id));
  if (pouzite.length > 0) {
    radky.push('', '## Receptury');
    for (const r of pouzite) {
      const cile = [
        r.cil_objem_hl !== null ? `objem ${cislo(r.cil_objem_hl, 2)} hl` : null,
        r.cil_stupnovitost !== null ? `${cislo(r.cil_stupnovitost, 2)} °P` : null,
        r.cil_alkohol !== null ? `${cislo(r.cil_alkohol, 2)} % obj.` : null,
        r.cil_ibu !== null ? `${cislo(r.cil_ibu, 1)} IBU` : null,
        r.cil_barva_ebc !== null ? `${cislo(r.cil_barva_ebc, 1)} EBC` : null,
      ].filter(Boolean);
      radky.push(`- ${r.nazev}${r.styl ? ` (${r.styl})` : ''}${cile.length ? ` — cíle: ${cile.join(', ')}` : ''}`);
      for (const s of r.suroviny) {
        radky.push(`  - ${s.nazev}${typeof s.mnozstvi === 'number' ? ` ${cislo(s.mnozstvi, 3)}${s.jednotka ? ` ${s.jednotka}` : ''}` : ''}${s.kdy ? `, ${s.kdy}` : ''}`);
      }
      for (const k of r.kroky) {
        const parametry = [typeof k.teplota_c === 'number' ? `${cislo(k.teplota_c, 1)} °C` : null, typeof k.minut === 'number' ? `${cislo(k.minut, 0)} min` : null].filter(Boolean);
        radky.push(`  - krok: ${k.nazev}${parametry.length ? ` (${parametry.join(', ')})` : ''}`);
      }
    }
  }
  const sPoznamkou = p.varky.filter((v) => v.poznamka);
  if (sPoznamkou.length > 0) {
    radky.push('', '## Poznámky k várkám');
    for (const v of sPoznamkou) radky.push(`- ${popisVarky(v)}: ${v.poznamka}`);
  }
  if (p.chybi.length > 0) {
    radky.push('', '## Chybí (nezapsáno — nedomýšlet)');
    for (const c of p.chybi) radky.push(`- ${c.varka}: ${c.polozky.join('; ')}`);
  }
  if (p.nespocitano.length > 0) {
    radky.push('', '## Nejde spočítat u žádné várky');
    for (const n of p.nespocitano) radky.push(`- ${n.nazev}: ${n.duvod}`);
  }
  if (p.poznamky.length > 0) {
    radky.push('', '## Jak se počítalo');
    for (const t of p.poznamky) radky.push(`- ${t}`);
  }
  return radky.join('\n');
}

/** Krátký přehled várky do seznamu (Claude i appka). */
export function souhrnVarky(v: VarkaData): string {
  const casti: string[] = [];
  for (const klic of ['mladina_p', 'mladina_objem_hl', 'pivo_zdanlivy_p']) {
    const h = najdiHodnotu(klic)!;
    if (typeof v.hodnoty[klic] === 'number') casti.push(`${h.nazev}: ${cislo(v.hodnoty[klic], h.mist)}${h.jednotka ? ` ${h.jednotka}` : ''}`);
  }
  const vytezek = odvozenaHodnota(ODVOZENE[0], v.hodnoty);
  if ('hodnota' in vytezek) casti.push(`Varní výtěžek: ${cislo(vytezek.hodnota, 1)} %`);
  const zapsano = Object.keys(v.hodnoty).filter((k) => typeof v.hodnoty[k] === 'number').length;
  casti.push(`zapsáno ${zapsano} z ${HODNOTY_VARKY.length} hodnot`);
  return casti.join(' · ');
}

// --- Načtení přehledu z databáze a výběr várek (appka i konektor) ------------

export type RecepturaZaznam = RecepturaData & { pivovar_id: string | null; zapsal: string | null; zapsal_jmeno: string | null; upraveno_at: string | null };
export type VarkaZaznam = VarkaData & { pivovar_id: string | null; zapsal: string | null; zapsal_jmeno: string | null; upraveno_at: string | null };
export type PrehledVarek = { receptury: RecepturaZaznam[]; varky: VarkaZaznam[] };

const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const JE_DRUH_SUROVINY = (v: unknown): v is DruhSuroviny => DRUHY_SUROVIN.some((d) => d.id === v);
const JE_FAZE_KROKU = (v: unknown): v is FazeKroku => FAZE_KROKU.some((f) => f.id === v);

function suroviny(v: unknown): Surovina[] {
  const out: Surovina[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const nazev = txt(o.nazev);
    if (!nazev || !JE_DRUH_SUROVINY(o.druh)) continue;
    const mnozstvi = num(o.mnozstvi);
    out.push({
      druh: o.druh, nazev,
      ...(mnozstvi !== null ? { mnozstvi } : {}),
      ...(txt(o.jednotka) ? { jednotka: txt(o.jednotka)! } : {}),
      ...(txt(o.kdy) ? { kdy: txt(o.kdy)! } : {}),
      ...(txt(o.poznamka) ? { poznamka: txt(o.poznamka)! } : {}),
    });
  }
  return out;
}

function kroky(v: unknown): Krok[] {
  const out: Krok[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const nazev = txt(o.nazev);
    if (!nazev || !JE_FAZE_KROKU(o.faze)) continue;
    const teplota = num(o.teplota_c);
    const minut = num(o.minut);
    out.push({
      faze: o.faze, nazev,
      ...(teplota !== null ? { teplota_c: teplota } : {}),
      ...(minut !== null ? { minut } : {}),
      ...(txt(o.poznamka) ? { poznamka: txt(o.poznamka)! } : {}),
    });
  }
  return out;
}

/** Hodnoty várky z databáze: jen známé klíče s číslem (nic se nedoplňuje). */
function hodnoty(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (najdiHodnotu(k) && num(x) !== null) out[k] = x as number;
  }
  return out;
}

/** Přehled z bible_varky_prehled → očištěné záznamy (vadné řádky vynechá). */
export function prehledVarek(data: unknown): PrehledVarek {
  const d = (data ?? {}) as Record<string, unknown>;
  const receptury: RecepturaZaznam[] = [];
  for (const x of Array.isArray(d.receptury) ? d.receptury : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id) continue;
    receptury.push({
      id, nazev: txt(o.nazev) ?? 'Receptura', styl: txt(o.styl),
      cil_objem_hl: num(o.cil_objem_hl), cil_stupnovitost: num(o.cil_stupnovitost), cil_alkohol: num(o.cil_alkohol),
      cil_ibu: num(o.cil_ibu), cil_barva_ebc: num(o.cil_barva_ebc),
      suroviny: suroviny(o.suroviny), kroky: kroky(o.kroky), poznamka: txt(o.poznamka),
      pivovar_id: txt(o.pivovar_id), zapsal: txt(o.zapsal), zapsal_jmeno: txt(o.zapsal_jmeno), upraveno_at: txt(o.upraveno_at),
    });
  }
  const varky: VarkaZaznam[] = [];
  for (const x of Array.isArray(d.varky) ? d.varky : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    const datum = txt(o.datum_varu);
    if (!id || !datum || !/^\d{4}-\d{2}-\d{2}/.test(datum)) continue;
    varky.push({
      id, receptura_id: txt(o.receptura_id), cislo: txt(o.cislo), pivo: txt(o.pivo) ?? 'Pivo', datum_varu: datum.slice(0, 10),
      hodnoty: hodnoty(o.hodnoty), poznamka: txt(o.poznamka),
      pivovar_id: txt(o.pivovar_id), zapsal: txt(o.zapsal), zapsal_jmeno: txt(o.zapsal_jmeno), upraveno_at: txt(o.upraveno_at),
    });
  }
  return { receptury, varky };
}

/** Chybný výběr várek (konektor ho vrátí Claudovi jako srozumitelnou chybu). */
export class ChybaVyberu extends Error {}

const JE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JE_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export type FiltrVarek = { pivo?: string; recepturaId?: string; od?: string; do?: string };

/** Filtr z argumentů nástroje (pivo, receptura_id, od, do). */
export function filtrZArgumentu(args: Record<string, unknown>): FiltrVarek {
  const f: FiltrVarek = {};
  if (args.pivo !== undefined && args.pivo !== null && args.pivo !== '') {
    if (typeof args.pivo !== 'string' || args.pivo.length > 120) throw new ChybaVyberu('pivo je část názvu piva (text).');
    f.pivo = args.pivo.trim();
  }
  if (args.receptura_id !== undefined && args.receptura_id !== null && args.receptura_id !== '') {
    if (typeof args.receptura_id !== 'string' || !JE_UUID.test(args.receptura_id)) throw new ChybaVyberu('receptura_id musí být id receptury ze seznam_varek.');
    f.recepturaId = args.receptura_id.toLowerCase();
  }
  for (const k of ['od', 'do'] as const) {
    const v = args[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !JE_DATUM.test(v)) throw new ChybaVyberu(`${k} je datum RRRR-MM-DD.`);
    f[k] = v;
  }
  return f;
}

const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Várky podle filtru, nejnovější první. */
export function filtrujVarky<T extends VarkaData>(varky: readonly T[], f: FiltrVarek): T[] {
  const pivo = f.pivo ? bezDiakritiky(f.pivo) : null;
  return varky
    .filter((v) => (!f.recepturaId || v.receptura_id === f.recepturaId)
      && (!pivo || bezDiakritiky(v.pivo).includes(pivo))
      && (!f.od || v.datum_varu >= f.od)
      && (!f.do || v.datum_varu <= f.do))
    .sort((a, b) => b.datum_varu.localeCompare(a.datum_varu));
}

/**
 * Výběr pro porovnání: varka_ids (2–12, všechna musí existovat), nebo
 * posledních N (2–12, výchozí 5) podle filtru.
 */
export function vyberProPorovnani<T extends VarkaData>(varky: readonly T[], args: Record<string, unknown>): T[] {
  if (args.varka_ids !== undefined && args.varka_ids !== null) {
    const ids = args.varka_ids;
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 12 || ids.some((x) => typeof x !== 'string' || !JE_UUID.test(x))) {
      throw new ChybaVyberu('varka_ids je seznam 2 až 12 id várek ze seznam_varek.');
    }
    const male = [...new Set(ids.map((x) => (x as string).toLowerCase()))];
    const nalezene = varky.filter((v) => male.includes(v.id.toLowerCase()));
    const chybi = male.filter((id) => !nalezene.some((v) => v.id.toLowerCase() === id));
    if (chybi.length > 0) throw new ChybaVyberu(`Tyhle várky v evidenci nejsou: ${chybi.join(', ')}.`);
    return nalezene;
  }
  const posledni = args.posledni === undefined || args.posledni === null ? 5 : args.posledni;
  if (typeof posledni !== 'number' || !Number.isInteger(posledni) || posledni < 2 || posledni > 12) throw new ChybaVyberu('posledni je celé číslo 2 až 12.');
  return filtrujVarky(varky, filtrZArgumentu(args)).slice(0, posledni);
}

/** Seznam várek a receptur pro Clauda (nástroj seznam_varek). */
export function seznamVarekText(p: PrehledVarek, vybrane: readonly VarkaData[], limit: number): string {
  if (p.varky.length === 0 && p.receptury.length === 0) {
    return 'Evidence várek je zatím prázdná (v appce: Pivovarská bible → Receptury a várky). Údaje o várkách tedy nemám — nedomýšlej je.';
  }
  const radky: string[] = [`# Várky (${Math.min(vybrane.length, limit)} z ${vybrane.length} vybraných, v evidenci celkem ${p.varky.length})`];
  for (const v of vybrane.slice(0, limit)) {
    const r = p.receptury.find((x) => x.id === v.receptura_id);
    radky.push(`- ${popisVarky(v)}${r ? ` (receptura: ${r.nazev})` : ''} — varka_id=${v.id}`, `  ${souhrnVarky(v)}`);
  }
  if (vybrane.length === 0) radky.push('Výběru neodpovídá žádná várka.');
  if (p.receptury.length > 0) {
    radky.push('', '## Receptury');
    for (const r of p.receptury) radky.push(`- ${r.nazev}${r.styl ? ` (${r.styl})` : ''} — receptura_id=${r.id}`);
  }
  radky.push('', 'Porovnání várek (hodnoty, cíle receptury, výtěžek, prokvašení a co chybí) dá nástroj porovnej_varky.');
  return radky.join('\n');
}
