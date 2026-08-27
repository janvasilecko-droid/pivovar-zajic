// 📗 Měsíční export — všechny zápisy v jednom sešitu, každý list zvlášť.
// ---------------------------------------------------------------------------
// Nahrazuje exporty roztroušené po jednotlivých obrazovkách. Místo pěti
// souborů stažených z pěti míst vznikne jeden sešit se stejnými listy, jaké
// si pivovar vede ručně:
//
//   Odběr personál     Datum │ Odběratel │ Druh piva │ Sudy(5) │ Lahve(4) │ hl
//   Fasování prodejna  totéž
//   Vzorky promo a PR  totéž, druhý sloupec „Komu proč a zač"
//   Stáčení lahve      Datum │ Druh piva │ Z sudů(5) │ Stočeno lahví(4) │ hl
//   Stáčení KEG        Datum │ Druh piva │ Stočené množství(5) │ Tank č. │ hl
//
// Hektolitry se zapisují jako VZOREC, ne jako číslo. Když se v sešitu opraví
// počet kusů, hektolitry se přepočítají samy — stejně jako v listech, které
// pivovar používá. Vzorec je SUMPRODUCT přes objemy sloupců, takže se nemusí
// psát ručně pro každý řádek.
import XLSX from 'xlsx-js-style';
import {
  SLOUPCE_LAHVE, SLOUPCE_SUDY, VARIANTY, formatDatum, popisSloupce, popisneSloupce,
  sestavPrehled, sloupceVarianty,
  type ObalPrehled, type PrehledRadek, type VariantaPrehledu, type VydejRadek,
} from './prehledVydeje';

export type ListExportu = {
  nazev: string;
  varianta: VariantaPrehledu;
  radky: VydejRadek[];
  /** Popisek druhého sloupce, když se liší od výchozího („Komu proč a zač"). */
  popisOdberatele?: string;
};

/** Písmeno sloupce v Excelu (0 → A). */
function pismeno(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

const styl = {
  skupina: {
    font: { bold: true, sz: 11 },
    alignment: { horizontal: 'center' as const },
    fill: { fgColor: { rgb: 'FFF3D9' } },
    border: { bottom: { style: 'thin' as const, color: { rgb: 'B3730A' } } },
  },
  hlavicka: {
    font: { bold: true, sz: 10 },
    alignment: { horizontal: 'center' as const, wrapText: true },
    fill: { fgColor: { rgb: 'FDF4EC' } },
    border: {
      top: { style: 'thin' as const, color: { rgb: 'CBD5E1' } },
      bottom: { style: 'medium' as const, color: { rgb: '94A3B8' } },
    },
  },
  soucet: {
    font: { bold: true },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    border: { top: { style: 'medium' as const, color: { rgb: '94A3B8' } } },
  },
  cislo: { alignment: { horizontal: 'right' as const } },
};

/**
 * Postaví jeden list. Vrací hotový worksheet.
 *
 * Rozvržení kopíruje ruční listy: první řádek jsou skupiny („Sudy", „Lahve"),
 * druhý jsou konkrétní objemy, pak data a nakonec součet.
 */
function postavList(list: ListExportu, obaly: ObalPrehled[], radky: PrehledRadek[]): any {
  const v = VARIANTY[list.varianta];
  const popisne = popisneSloupce(list.varianta, false).map((p, i) =>
    (i === 1 && list.popisOdberatele ? list.popisOdberatele : p));
  const objemy = sloupceVarianty(list.varianta);
  const prvniObjem = popisne.length;
  const maTank = !!v.sTankem;
  const tankIndex = maTank ? prvniObjem + objemy.length : -1;
  const prvniHl = prvniObjem + objemy.length + (maTank ? 1 : 0);

  // Řádek 1: skupiny nad objemy. Řádek 2: popisky sloupců.
  const radek1: any[] = [
    ...popisne.map(() => ''),
    v.skupinaSudy, ...Array(SLOUPCE_SUDY.length - 1).fill(''),
    ...(v.skupinaLahve ? [v.skupinaLahve, ...Array(SLOUPCE_LAHVE.length - 1).fill('')] : []),
    ...(maTank ? [''] : []),
    'sudy hl', 'lahve hl', 'celkem hl',
  ];
  const radek2: any[] = [
    ...popisne,
    ...objemy.map(popisSloupce),
    ...(maTank ? ['Tank č.'] : []),
    '', '', '',
  ];

  const data: any[][] = [radek1, radek2];

  // Vzorec pro hektolitry — SUMPRODUCT počtů × objemů, děleno stem.
  const vzorecHl = (radekExcel: number, odIdx: number, objemyCasti: number[]) => {
    if (!objemyCasti.length) return 0;
    const od = pismeno(odIdx) + radekExcel;
    const doKam = pismeno(odIdx + objemyCasti.length - 1) + radekExcel;
    return { f: `SUMPRODUCT(${od}:${doKam},{${objemyCasti.join(',')}})/100` };
  };

  const pocetSudu = SLOUPCE_SUDY.length;
  const pocetLahvi = objemy.length - pocetSudu;

  radky.forEach((r, i) => {
    const radekExcel = i + 3; // dva řádky hlavičky
    const bunky: any[] = [
      formatDatum(r.datum),
      ...(v.sOdberatelem ? [r.odberatel] : []),
      r.pivo,
      ...objemy.map((l) => r.kusy[Math.round(l * 100) / 100] ?? ''),
      ...(maTank ? [r.tank] : []),
      vzorecHl(radekExcel, prvniObjem, SLOUPCE_SUDY),
      pocetLahvi > 0 ? vzorecHl(radekExcel, prvniObjem + pocetSudu, SLOUPCE_LAHVE) : 0,
      { f: `${pismeno(prvniHl)}${radekExcel}+${pismeno(prvniHl + 1)}${radekExcel}` },
    ];
    data.push(bunky);
  });

  // Součtový řádek — SUM přes datové řádky, ať se dá dopsat ručně a sedí dál.
  if (radky.length) {
    const prvniData = 3;
    const posledniData = radky.length + 2;
    const soucet: any[] = [
      'Celkem',
      ...Array(popisne.length - 1).fill(''),
      ...objemy.map((_, j) => ({ f: `SUM(${pismeno(prvniObjem + j)}${prvniData}:${pismeno(prvniObjem + j)}${posledniData})` })),
      ...(maTank ? [''] : []),
      ...[0, 1, 2].map((j) => ({ f: `SUM(${pismeno(prvniHl + j)}${prvniData}:${pismeno(prvniHl + j)}${posledniData})` })),
    ];
    data.push(soucet);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Sloučení skupin nad objemy.
  const merges: any[] = [
    { s: { r: 0, c: prvniObjem }, e: { r: 0, c: prvniObjem + pocetSudu - 1 } },
  ];
  if (pocetLahvi > 0) {
    merges.push({ s: { r: 0, c: prvniObjem + pocetSudu }, e: { r: 0, c: prvniObjem + objemy.length - 1 } });
  }
  ws['!merges'] = merges;

  // Šířky: popisné sloupce široké, objemy úzké.
  ws['!cols'] = [
    ...popisne.map((_, i) => ({ wch: i === 0 ? 11 : 22 })),
    ...objemy.map(() => ({ wch: 6 })),
    ...(maTank ? [{ wch: 9 }] : []),
    { wch: 9 }, { wch: 9 }, { wch: 10 },
  ];

  // Zmrazit hlavičku, ať je při rolování pořád vidět.
  ws['!freeze'] = { xSplit: 0, ySplit: 2 };

  // Styly.
  const rozsah = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = rozsah.s.r; R <= rozsah.e.r; R++) {
    for (let C = rozsah.s.c; C <= rozsah.e.c; C++) {
      const adresa = XLSX.utils.encode_cell({ r: R, c: C });
      const bunka = ws[adresa];
      if (!bunka) continue;
      if (R === 0) bunka.s = styl.skupina;
      else if (R === 1) bunka.s = styl.hlavicka;
      else if (radky.length && R === radky.length + 2) bunka.s = styl.soucet;
      else if (C >= prvniObjem && C !== tankIndex) bunka.s = styl.cislo;
      // Hektolitry na tři desetinná místa jako v ručních listech.
      if (C >= prvniHl) bunka.z = '0.000';
    }
  }

  return ws;
}

export type MesicniExportVstup = {
  listy: ListExportu[];
  obaly: ObalPrehled[];
  od: string;
  do: string;
};

/** Název souboru — z období, ať se stažené sešity nepřepisují. */
export function nazevSouboru(od: string, doKdy: string): string {
  const stejnyMesic = od.slice(0, 7) === doKdy.slice(0, 7);
  return stejnyMesic
    ? `Zapisy_pivovar_${od.slice(0, 7)}.xlsx`
    : `Zapisy_pivovar_${od}_az_${doKdy}.xlsx`;
}

/** Kolik řádků má který list — pro náhled před stažením. */
export function poctyRadku(vstup: MesicniExportVstup): { nazev: string; pocet: number }[] {
  return vstup.listy.map((l) => ({
    nazev: l.nazev,
    pocet: sestavPrehled(l.radky, vstup.obaly, { od: vstup.od, do: vstup.do }).length,
  }));
}

/**
 * Postaví celý sešit. Prázdné listy se vynechávají — sešit s pěti prázdnými
 * kartami jen mate; když nezbude nic, vrátí null a volající to řekne uživateli.
 */
export function postavSesit(vstup: MesicniExportVstup): any | null {
  const wb = XLSX.utils.book_new();
  let neco = false;

  for (const list of vstup.listy) {
    const radky = sestavPrehled(list.radky, vstup.obaly, { od: vstup.od, do: vstup.do });
    if (!radky.length) continue;
    XLSX.utils.book_append_sheet(wb, postavList(list, vstup.obaly, radky), list.nazev.slice(0, 31));
    neco = true;
  }

  return neco ? wb : null;
}

/** Postaví sešit a nabídne ho ke stažení. Vrací false, když není co stahovat. */
export function stahniSesit(vstup: MesicniExportVstup): boolean {
  const wb = postavSesit(vstup);
  if (!wb) return false;
  XLSX.writeFile(wb, nazevSouboru(vstup.od, vstup.do));
  return true;
}
