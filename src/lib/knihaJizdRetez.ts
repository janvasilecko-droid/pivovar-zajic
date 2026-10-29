// 🔗 Návaznost tachometru v Knize jízd při přidání, úpravě a smazání jízdy.
// ---------------------------------------------------------------------------
// Zadání majitele 29. 10. 2026 (Kniha jízd „reálná“): jízdy se dají přidat,
// upravit i smazat a tachometr v měsíci má pořád navazovat, jízda za jízdou.
// Skutečný stav palubní desky se pak jednou měsíčně zadá při uzavření měsíce
// (knihaJizdUzaverka.ts) a rozdíl se rozpočítá. Tady je jen ta mezilehlá
// návaznost.
//
// PRAVIDLO: změna jízdy posune o svůj rozdíl v km všechny pozdější jízdy
// TOHO AUTA ve STEJNÉM měsíci — nic víc. Dřívější jízdy ani jiné měsíce a auta
// se nikdy nepřepisují a to, co si někdo opsal z palubní desky, se neztratí:
// zachová se každý skok v řadě, jen se celý posune. Znovu a čistě se řada
// sestaví až při uzavření měsíce.
//
// Počítá se v DESETINÁCH km (celá čísla), ať se po sčítání nerozjede součet
// o setinu kvůli desetinným číslům v JavaScriptu.
import { porovnejJizdy } from './knihaJizdUzaverka';

export type JizdaRetezu = {
  id: string;
  date: string;
  vehicle_name: string;
  km_start: number;
  km_end: number;
  km_driven: number;
  km_trasa?: number | null;
  created_at?: string | null;
  uzavreno_at?: string | null;
};

/** Nové stavy tachometru jedné (už existující) jízdy. */
export type ZmenaTachometru = { id: string; km_start: number; km_end: number };

const des = (km: number) => Math.round((Number(km) || 0) * 10);
const zDes = (d: number) => d / 10;
const mesicJizdy = (j: Pick<JizdaRetezu, 'date'>) => j.date.slice(0, 7);

/** Kolik km tachometru jízda zabírá (o tolik se posunou ty za ní). */
const rozsah = (j: Pick<JizdaRetezu, 'km_start' | 'km_end'>) => des(j.km_end) - des(j.km_start);

/** Jízdy seřazené tak, jak za sebou jely (datum, stav tachometru, čas zápisu). */
export function poradiVRade<T extends JizdaRetezu>(jizdy: T[]): T[] {
  return [...jizdy].sort(porovnejJizdy);
}

/**
 * Posune o `delta` (desetiny km) všechny jízdy auta v měsíci jízdy `ref`, které
 * jedou PŘÍSNĚ za ní. Uzavřené jízdy jsou pevné a nehýbou se (zámek by to stejně nepustil).
 */
function posunZa(jizdy: JizdaRetezu[], ref: JizdaRetezu, delta: number): ZmenaTachometru[] {
  if (delta === 0) return [];
  const mesic = mesicJizdy(ref);
  return poradiVRade(jizdy.filter((j) => j.vehicle_name === ref.vehicle_name && mesicJizdy(j) === mesic))
    .filter((j) => j.id !== ref.id && porovnejJizdy(j, ref) > 0 && !j.uzavreno_at)
    .map((j) => ({ id: j.id, km_start: zDes(des(j.km_start) + delta), km_end: zDes(des(j.km_end) + delta) }));
}

/** Použije změny na kopii seznamu (jízdy bez změny zůstanou, jak jsou). */
export function pouzijZmeny<T extends JizdaRetezu>(jizdy: T[], zmeny: ZmenaTachometru[]): T[] {
  if (zmeny.length === 0) return jizdy;
  const podleId = new Map(zmeny.map((z) => [z.id, z]));
  return jizdy.map((j) => {
    const z = podleId.get(j.id);
    return z ? { ...j, km_start: z.km_start, km_end: z.km_end } : j;
  });
}

/**
 * Kde je tachometr auta k danému dni — tedy odkud by měla začít jízda zapsaná
 * na ten den.
 *
 *  - Má-li auto v tom měsíci jízdy: konec poslední z nich ze stejného dne nebo
 *    dřív; před první jízdou měsíce je to její začátek (začátek měsíce).
 *  - Nemá-li v měsíci nic: konec poslední jízdy před měsícem; nejsou-li žádné,
 *    začátek první jízdy po něm.
 *  - Auto bez jediné jízdy: `null` — začátek musí někdo zadat.
 *
 * Řada se drží uvnitř měsíce (viz pravidlo nahoře), proto se nehledí na jiné
 * měsíce, dokud v tom správném něco je.
 */
export function stavTachometruKDatu(jizdy: JizdaRetezu[], auto: string, datum: string): number | null {
  const mesic = datum.slice(0, 7);
  const autoJizdy = poradiVRade(jizdy.filter((j) => j.vehicle_name === auto));
  if (autoJizdy.length === 0) return null;

  const vMesici = autoJizdy.filter((j) => mesicJizdy(j) === mesic);
  if (vMesici.length > 0) {
    let posledni: JizdaRetezu | null = null;
    for (const j of vMesici) {
      if (j.date <= datum) posledni = j;
      else break;
    }
    return posledni ? posledni.km_end : vMesici[0].km_start;
  }

  const pred = autoJizdy.filter((j) => mesicJizdy(j) < mesic);
  return pred.length > 0 ? pred[pred.length - 1].km_end : autoJizdy[0].km_start;
}

/**
 * Po PŘIDÁNÍ jízdy: pozdější jízdy auta v měsíci se posunou o její rozsah.
 * `nova` už má svoje km_start a km_end (konec = začátek + ujeto). Přidání na
 * konec řady (nejběžnější případ) nemění nic.
 */
export function zmenyPoPridani(pred: JizdaRetezu[], nova: JizdaRetezu): ZmenaTachometru[] {
  return posunZa(pred.filter((j) => j.id !== nova.id), nova, rozsah(nova));
}

/** Po SMAZÁNÍ jízdy: pozdější jízdy auta v měsíci se vrátí o její rozsah. */
export function zmenyPoSmazani(pred: JizdaRetezu[], id: string): ZmenaTachometru[] {
  const smazana = pred.find((j) => j.id === id);
  if (!smazana || smazana.uzavreno_at) return [];
  return posunZa(pred, smazana, -rozsah(smazana));
}

export type VysledekUpravy = {
  /** Upravená jízda i s přepočtenými km_start / km_end. */
  jizda: JizdaRetezu;
  /** Změny OSTATNÍCH jízd (jen těch, kterým se čísla opravdu mění). */
  zmeny: ZmenaTachometru[];
};

/**
 * Po ÚPRAVĚ jízdy — `po` je její nová podoba (stejné `id`).
 *
 * Nezměnilo-li se auto ani den, jízda zůstává na svém místě: nechá si svůj
 * začátek, změní se její konec a pozdější jízdy se posunou o stejný kus.
 * Změnilo-li se auto nebo den, je to vyndání ze staré řady (pozdější se vrátí)
 * a vložení do nové: jízda se zařadí na nové místo, začne tam, kde auto v ten
 * den stálo (nezná-li ho, nechá si zadaný začátek), a pozdější jízdy nové řady
 * se posunou.
 */
export function zmenyPoUprave(pred: JizdaRetezu[], po: JizdaRetezu): VysledekUpravy {
  const stara = pred.find((j) => j.id === po.id);
  const dokonci = (zacatekDes: number): JizdaRetezu => ({
    ...po,
    km_start: zDes(zacatekDes),
    km_end: zDes(zacatekDes + des(po.km_driven)),
  });
  if (!stara) return { jizda: dokonci(des(po.km_start)), zmeny: zmenyPoPridani(pred, dokonci(des(po.km_start))) };
  if (stara.uzavreno_at) return { jizda: stara, zmeny: [] };

  // Zůstala na svém místě: pozdější jízdy jely za ní i předtím, takže se posunou o to,
  // o kolik se posunul její konec. Místo se určuje podle STARÉ podoby — jinak by
  // změna ujetých km sama přehodila pořadí dvou záznamů z jednoho dne se stejným
  // začátkem (třeba tankování, které se předělá na jízdu).
  const presunuta = stara.vehicle_name !== po.vehicle_name || stara.date !== po.date;
  if (!presunuta) {
    const jizda = dokonci(des(po.km_start));
    return { jizda, zmeny: posunZa(pred, stara, des(jizda.km_end) - des(stara.km_end)) };
  }

  // Přesunutá (jiné auto nebo den):
  // A) stará jízda pryč z řady
  const zmenyA = zmenyPoSmazani(pred, stara.id);
  const mezi = pouzijZmeny(pred.filter((j) => j.id !== stara.id), zmenyA);

  // B) nová jízda na své nové místo — začne tam, kde auto v ten den stálo
  let zacatekDes = des(po.km_start);
  const navazuje = stavTachometruKDatu(mezi, po.vehicle_name, po.date);
  if (navazuje != null) zacatekDes = des(navazuje);
  const jizda = dokonci(zacatekDes);
  const zmenyB = zmenyPoPridani(mezi, jizda);

  // B se počítá nad výsledkem A, takže jeho čísla jsou už konečná.
  const konecne = new Map<string, ZmenaTachometru>();
  for (const z of zmenyA) konecne.set(z.id, z);
  for (const z of zmenyB) konecne.set(z.id, z);
  const puvodni = new Map(pred.map((j) => [j.id, j]));
  const zmeny = [...konecne.values()].filter((z) => {
    const p = puvodni.get(z.id);
    return !p || des(p.km_start) !== des(z.km_start) || des(p.km_end) !== des(z.km_end);
  });
  return { jizda, zmeny };
}

// ---------------------------------------------------------------------------
// Předvyplnění uzávěrky měsíce
// ---------------------------------------------------------------------------

export type UzavrenyMesicAuta = { vehicle_name: string; month: string; km_start: number; km_end: number };

export type ZdrojZacatku = 'uzavreny-mesic' | 'jizda-pred-mesicem' | 'prvni-jizda';

export type PredvyplneniUzaverky = {
  /** Navržený stav tachometru na začátku měsíce. */
  zacatek: number | null;
  zdrojZacatku: ZdrojZacatku | null;
  /** Konec už uzavřeného minulého měsíce tohoto auta (na ten musí tento měsíc navázat). */
  minulyMesic: number | null;
  /** Začátek už uzavřeného dalšího měsíce (na ten musí tento měsíc navázat). */
  nasledny: number | null;
  /** Kolik by měl tachometr na konci měsíce ukazovat podle tras — vodítko proti překlepu. */
  podleTras: number | null;
};

/** Měsíc „RRRR-MM“ posunutý o `o` měsíců. */
export function posunMesic(mesic: string, o: number): string {
  const [r, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(r, m - 1 + o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function predvyplnUzaverku(
  jizdy: JizdaRetezu[],
  uzavrene: UzavrenyMesicAuta[],
  auto: string,
  mesic: string,
): PredvyplneniUzaverky {
  const minuly = uzavrene.find((u) => u.vehicle_name === auto && u.month === posunMesic(mesic, -1));
  const dalsi = uzavrene.find((u) => u.vehicle_name === auto && u.month === posunMesic(mesic, 1));
  const vMesici = poradiVRade(jizdy.filter((j) => j.vehicle_name === auto && mesicJizdy(j) === mesic));

  let zacatek: number | null = null;
  let zdrojZacatku: ZdrojZacatku | null = null;
  if (minuly) {
    zacatek = minuly.km_end;
    zdrojZacatku = 'uzavreny-mesic';
  } else {
    const predtim = poradiVRade(jizdy.filter((j) => j.vehicle_name === auto && j.date < `${mesic}-01`));
    if (predtim.length > 0) {
      zacatek = predtim[predtim.length - 1].km_end;
      zdrojZacatku = 'jizda-pred-mesicem';
    } else if (vMesici.length > 0) {
      zacatek = vMesici[0].km_start;
      zdrojZacatku = 'prvni-jizda';
    }
  }

  const soucetTras = vMesici.reduce((s, j) => s + des(j.km_trasa ?? j.km_driven), 0);
  return {
    zacatek,
    zdrojZacatku,
    minulyMesic: minuly ? minuly.km_end : null,
    nasledny: dalsi ? dalsi.km_start : null,
    podleTras: zacatek == null ? null : zDes(des(zacatek) + soucetTras),
  };
}
