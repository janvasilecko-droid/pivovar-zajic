// 🧮 Uzávěrka měsíce v Knize jízd — dorovnání podle tachometru.
// ---------------------------------------------------------------------------
// Zadání majitele 29. 10. 2026: „jednou měsíčně aby se dopsal rozdíl v KM (stav
// kilometrů) a ten rozdíl dopočítáš rovnoměrně mezi jízdy“.
//
// Trasy z objednávek dávají jen odhad (vzdálenost z mapy), skutečný je stav
// tachometru. Na konci měsíce se zadá, co ukazuje palubní deska; rozdíl proti
// součtu tras se rozpočítá mezi jízdy a stav tachometru po celý měsíc znovu
// přesně navazuje: začátek měsíce → jízda za jízdou → konec měsíce.
//
// Všechno se tu počítá v DESETINÁCH kilometru (celá čísla), ať se po rozdělení
// nikdy nerozjede součet o setinu kvůli desetinným číslům v JavaScriptu —
// uzavřený měsíc musí na desetinu sedět s tachometrem.

export type RezimDorovnani = 'rovnomerne' | 'umerne';

/** Jízda z Knihy jízd v rozsahu, který uzávěrka potřebuje. */
export type JizdaUzaverky = {
  id: string;
  date: string;
  km_start: number;
  km_end: number;
  km_driven: number;
  /** Původní km z trasy (před dorovnáním). Chybí = u starších jízd je to km_driven. */
  km_trasa?: number | null;
  km_dorovnani?: number | null;
  fuel_liters?: number | null;
  created_at?: string | null;
};

/** Tankování = záznam bez ujetých km s načerpanými litry. Do rozdílu tachometru se nepočítá. */
export function jeTankovani(j: Pick<JizdaUzaverky, 'km_driven' | 'fuel_liters'>): boolean {
  return (Number(j.km_driven) || 0) === 0 && (Number(j.fuel_liters) || 0) > 0;
}

const des = (km: number) => Math.round(km * 10);
const zDes = (d: number) => d / 10;

// ---------------------------------------------------------------------------
// Rozdělení rozdílu mezi jízdy
// ---------------------------------------------------------------------------

/** Celkem rozdělí podle vah největším zbytkem, ať součet sedí přesně. */
function podleVah(vahy: number[], celkem: number): number[] {
  const soucet = vahy.reduce((a, b) => a + b, 0);
  const dily = vahy.map((v) => Math.floor((celkem * v) / soucet));
  let zbyva = celkem - dily.reduce((a, b) => a + b, 0);
  const poradi = vahy
    .map((v, i) => ({ i, zlomek: (celkem * v) % soucet }))
    .sort((a, b) => b.zlomek - a.zlomek || a.i - b.i);
  for (const { i } of poradi) {
    if (zbyva <= 0) break;
    dily[i] += 1;
    zbyva -= 1;
  }
  return dily;
}

/** Stejný díl pro každou jízdu; zbylé desetiny dostane prvních pár jízd. */
function rovnomerne(pocet: number, celkem: number): number[] {
  const zaklad = Math.floor(celkem / pocet);
  const zbyva = celkem - zaklad * pocet;
  return Array.from({ length: pocet }, (_, i) => zaklad + (i < zbyva ? 1 : 0));
}

/**
 * Stejný díl pro každou jízdu, ale žádná nemůže přijít o víc, než sama ujela:
 * co se krátké jízdě nevejde, ubere se ostatním (vylévání vody do nádob).
 */
function rovnomerneSOmezenim(kapacity: number[], celkem: number): number[] {
  const pocet = kapacity.length;
  const vzit = new Array<number>(pocet).fill(0);
  const poradi = kapacity.map((k, i) => ({ k, i })).sort((a, b) => a.k - b.k || a.i - b.i);
  let zbyva = celkem;
  let zbyvaJizd = pocet;
  for (const { k, i } of poradi) {
    const bere = Math.min(k, Math.floor(zbyva / zbyvaJizd));
    vzit[i] = bere;
    zbyva -= bere;
    zbyvaJizd -= 1;
  }
  // Zbytek po zaokrouhlení rozdat po desetinách tam, kde ještě je z čeho brát.
  while (zbyva > 0) {
    let rozdano = false;
    for (let i = 0; i < pocet && zbyva > 0; i += 1) {
      if (vzit[i] < kapacity[i]) { vzit[i] += 1; zbyva -= 1; rozdano = true; }
    }
    if (!rozdano) break;
  }
  return vzit;
}

/**
 * Rozdělí rozdíl (v desetinách km) mezi jízdy a vrátí dorovnání každé z nich
 * (celá čísla, desetiny km; záporné = ubírá se). Součet dorovnání je vždy přesně
 * rozdíl a žádná jízda nejde pod nulu. `null` = rozdělit nejde (ubrat víc, než
 * je ujeto celkem, nebo není mezi co dělit).
 *
 *  - rovnomerne: každá jízda dostane stejný díl (zbylé desetiny první jízdy),
 *  - umerne: díl podle délky jízdy.
 */
export function rozdelRozdil(zakladDes: number[], rozdilDes: number, rezim: RezimDorovnani): number[] | null {
  const pocet = zakladDes.length;
  if (pocet === 0) return rozdilDes === 0 ? [] : null;
  if (rozdilDes === 0) return zakladDes.map(() => 0);
  const soucet = zakladDes.reduce((a, b) => a + b, 0);
  const umerne = rezim === 'umerne' && soucet > 0;

  if (rozdilDes > 0) return umerne ? podleVah(zakladDes, rozdilDes) : rovnomerne(pocet, rozdilDes);

  const ubrat = -rozdilDes;
  if (ubrat > soucet) return null;
  const ubrano = umerne ? podleVah(zakladDes, ubrat) : rovnomerneSOmezenim(zakladDes, ubrat);
  return ubrano.map((x) => -x);
}

// ---------------------------------------------------------------------------
// Sestavení uzávěrky měsíce
// ---------------------------------------------------------------------------

export type VstupUzaverky = {
  /** VŠECHNY záznamy jednoho auta za jeden měsíc (jízdy i tankování). */
  jizdy: JizdaUzaverky[];
  /** Stav tachometru na začátku měsíce (= konec minulého měsíce). */
  tachometrZacatek: number;
  /** Stav tachometru na konci měsíce podle palubní desky. */
  tachometrKonec: number;
  rezim: RezimDorovnani;
  /** Konec už UZAVŘENÉHO minulého měsíce tohoto auta — tento měsíc na něj musí navázat. */
  tachometrMinulyMesic?: number | null;
  /** Začátek už UZAVŘENÉHO následujícího měsíce tohoto auta — tento měsíc na něj musí navázat. */
  tachometrNaslednyMesic?: number | null;
};

export type RadekUzaverky = {
  id: string;
  poradi: number;
  km_trasa: number;
  km_dorovnani: number;
  km_driven: number;
  km_start: number;
  km_end: number;
};

export type VysledekUzaverky =
  | {
      ok: true;
      radky: RadekUzaverky[];
      /** Rozdíl, který se rozpočítal (tachometr − součet tras), v km. */
      rozdil: number;
      soucetTrasy: number;
      /** Počet jízd, mezi které se rozdělovalo (bez tankování). */
      pocetJizd: number;
      upozorneni: string[];
    }
  | { ok: false; chyba: string };

const KM_FORMAT = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const km = (x: number) => KM_FORMAT.format(x);

/**
 * Pořadí jízd v řadě auta: datum, u stejného dne stav tachometru (při shodě
 * dřív ta kratší — tankování na místě před jízdou, která odtud vyjíždí), pak
 * čas zápisu. Jediné místo, kde se pořadí určuje — uzávěrka i navazování
 * tachometru (knihaJizdRetez.ts) musí jízdy řadit stejně, jinak by se každá
 * dívala na jinou „předchozí“.
 */
export function porovnejJizdy(
  a: Pick<JizdaUzaverky, 'id' | 'date' | 'km_start' | 'km_end' | 'created_at'>,
  b: Pick<JizdaUzaverky, 'id' | 'date' | 'km_start' | 'km_end' | 'created_at'>,
): number {
  return a.date.localeCompare(b.date)
    || (Number(a.km_start) || 0) - (Number(b.km_start) || 0)
    || (Number(a.km_end) || 0) - (Number(b.km_end) || 0)
    || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    || a.id.localeCompare(b.id);
}

function seradJizdy<T extends JizdaUzaverky>(jizdy: T[]): T[] {
  return [...jizdy].sort(porovnejJizdy);
}

export function sestavUzaverku(vstup: VstupUzaverky): VysledekUzaverky {
  const { tachometrZacatek, tachometrKonec, rezim } = vstup;
  if (!Number.isFinite(tachometrZacatek) || !Number.isFinite(tachometrKonec)) {
    return { ok: false, chyba: 'Stav tachometru na začátku i na konci měsíce musí být číslo.' };
  }
  const razene = seradJizdy(vstup.jizdy);
  const pocetJizd = razene.filter((j) => !jeTankovani(j)).length;
  if (pocetJizd === 0) return { ok: false, chyba: 'V měsíci nejsou žádné jízdy, není co uzavřít.' };
  if (tachometrKonec < tachometrZacatek) {
    return { ok: false, chyba: 'Stav tachometru na konci měsíce je nižší než na začátku.' };
  }
  if (vstup.tachometrMinulyMesic != null && des(vstup.tachometrMinulyMesic) !== des(tachometrZacatek)) {
    return {
      ok: false,
      chyba: `Už uzavřený minulý měsíc končí na ${km(vstup.tachometrMinulyMesic)} km, tento měsíc ale začíná na ${km(tachometrZacatek)} km — musí navazovat.`,
    };
  }
  if (vstup.tachometrNaslednyMesic != null && des(vstup.tachometrNaslednyMesic) !== des(tachometrKonec)) {
    return {
      ok: false,
      chyba: `Už uzavřený další měsíc začíná na ${km(vstup.tachometrNaslednyMesic)} km, tento měsíc ale končí na ${km(tachometrKonec)} km — musí navazovat.`,
    };
  }

  // Základ každé jízdy: původní km z trasy; u starších jízd bez něj ujeté km.
  const zaklad = (j: JizdaUzaverky) => des(Math.max(0, Number(j.km_trasa ?? j.km_driven) || 0));
  const jizdy = razene.filter((j) => !jeTankovani(j));
  const zakladDes = jizdy.map(zaklad);
  const soucetDes = zakladDes.reduce((a, b) => a + b, 0);
  const rozdilDes = (des(tachometrKonec) - des(tachometrZacatek)) - soucetDes;

  const dily = rozdelRozdil(zakladDes, rozdilDes, rezim);
  if (!dily) {
    return {
      ok: false,
      chyba: `Tachometr ujel o ${km(zDes(-rozdilDes))} km míň, než dávají trasy (${km(zDes(soucetDes))} km) — jízdy by měly záporné km. Zkontroluj stavy tachometru.`,
    };
  }
  const dilPodleId = new Map(jizdy.map((j, i) => [j.id, { zaklad: zakladDes[i], dil: dily[i] }]));

  // Tachometr jízdu po jízdě: každá začíná tam, kde skončila předchozí.
  let stavDes = des(tachometrZacatek);
  const radky: RadekUzaverky[] = razene.map((j, i) => {
    const d = dilPodleId.get(j.id);
    if (!d) {
      // tankování: km se nemění, jen drží místo v řadě
      return { id: j.id, poradi: i + 1, km_trasa: 0, km_dorovnani: 0, km_driven: 0, km_start: zDes(stavDes), km_end: zDes(stavDes) };
    }
    const ujeteDes = d.zaklad + d.dil;
    const zacatekDes = stavDes;
    stavDes += ujeteDes;
    return {
      id: j.id,
      poradi: i + 1,
      km_trasa: zDes(d.zaklad),
      km_dorovnani: zDes(d.dil),
      km_driven: zDes(ujeteDes),
      km_start: zDes(zacatekDes),
      km_end: zDes(stavDes),
    };
  });

  const upozorneni: string[] = [];
  const rozdil = zDes(rozdilDes);
  if (rozdil < 0) {
    upozorneni.push(`Trasy dávají víc km, než ujel tachometr (rozdíl −${km(-rozdil)} km) — jízdám se km ubírají.`);
  }
  // Velký = aspoň 30 km a zároveň víc než čtvrtina tras. Zachytí překlep v tachometru nebo
  // zapomenutý měsíc, ale neobtěžuje u drobných rozdílů v krátkém měsíci.
  if (Math.abs(rozdil) >= 30 && Math.abs(rozdil) > 0.25 * zDes(soucetDes)) {
    upozorneni.push(`Rozdíl proti trasám je velký (${rozdil > 0 ? '+' : '−'}${km(Math.abs(rozdil))} km) — zkontroluj stav tachometru na začátku i na konci měsíce.`);
  }
  const bezTrasy = zakladDes.filter((x) => x === 0).length;
  if (bezTrasy > 0) {
    upozorneni.push(`${bezTrasy === 1 ? '1 jízda má' : `${bezTrasy} jízdy mají`} 0 km z trasy (trasa se nespočítala) — ${bezTrasy === 1 ? 'dostane' : 'dostanou'} svůj díl rozdílu.`);
  }

  return { ok: true, radky, rozdil, soucetTrasy: zDes(soucetDes), pocetJizd, upozorneni };
}

// ---------------------------------------------------------------------------
// Stav měsíce
// ---------------------------------------------------------------------------

export type StavMesice = 'otevreno' | 'uzavreno' | 'castecne';

/**
 * Je měsíc daného auta uzavřený? Zámek je po autech: každé má svůj tachometr
 * a uzavírá se zvlášť. „castecne“ = některé jízdy uzavřené a jiné ne (typicky
 * jízda, kterou do uzavřeného měsíce dopsal admin) — měsíc je potřeba znovu uzavřít.
 */
export function stavMesice(
  jizdy: { vehicle_name: string; date: string; uzavreno_at?: string | null }[],
  vozidlo: string,
  mesic: string,
): StavMesice {
  const dane = jizdy.filter((j) => j.vehicle_name === vozidlo && j.date.slice(0, 7) === mesic);
  if (dane.length === 0) return 'otevreno';
  const uzavrene = dane.filter((j) => !!j.uzavreno_at).length;
  if (uzavrene === 0) return 'otevreno';
  return uzavrene === dane.length ? 'uzavreno' : 'castecne';
}
