/**
 * 🧴 Zásoba závěrek (korunky, PET víčka) — a hlavně jejich SPOTŘEBA.
 *
 * Etikety (`labelStock.ts`) i prázdné lahve appka počítá jako nákup mínus
 * to, co se nalahvovalo. U závěrek se ale odečítalo z ničeho: spotřeba se
 * hledala mezi stočenými obaly podle názvu „Víčka", a žádný stočený obal
 * se tak nejmenuje. Nákupy se tedy sčítaly, spotřeba zůstávala nula a
 * zůstatek závěrek vypadal pořád stejně dobře — až do dne, kdy se
 * nalahvovat nedalo. Přitom každá zavřená lahev spotřebuje právě jednu
 * závěrku, takže se spotřeba spočítat DÁ, jen se nikde nespočítala.
 *
 * Dvě věci jsou tu schválně:
 *
 *  - Korunky (sklo) a PET víčka jsou dva samostatné hrnce. V jednom hrnci
 *    by pět tisíc PET víček přehlušilo nulu korunek a přehled by hlásil
 *    „v pořádku" ve chvíli, kdy sklo nejde stočit.
 *  - Hranice „málo" není pevné číslo, ale OBVYKLÉ JEDNO STÁČENÍ spočítané
 *    z historie. Pevných 200 kusů je u petek pár minut a u třicítek
 *    zásoba na měsíc.
 *
 * Modul je čistý výpočet nad řádky, které obrazovka už má.
 */

/** Korunky na skleněné lahve (0,33 l a 0,5 l). */
export const KORUNKY = 'Korunky';
/** Šroubovací víčka na PET (1 l a 1,5 l). */
export const UZAVERY_PET = 'Víčka PET';
/**
 * Starší nákupy zapsané jen jako „Víčka" — u nich se nedá poznat, jestli
 * jsou to korunky nebo PET. Spotřeba se jim proto NEPŘIŘAZUJE; vymyslet
 * si u nich jeden ze dvou hrnců by dalo zůstatek, který nic neznamená.
 */
export const ZAVIRKY_NEURCENE = 'Víčka (nerozlišené)';

export type DruhZavirky = typeof KORUNKY | typeof UZAVERY_PET;

export type ObalStaceni = {
  /** Datum zápisu — kvůli „obvyklému jednomu stáčení". */
  entry_date?: string | null;
  package_label?: string | null;
  volume_l?: number | null;
  quantity: number | string | null;
};

export type NakupMaterialu = {
  package_label: string | null;
  quantity: number | string | null;
};

export type ZustatekMaterialu = {
  nazev: string;
  nakoupeno: number;
  spotrebovano: number;
  /** Nakoupeno − spotřebováno. Mínus je platná odpověď, ne chyba. */
  zustatek: number;
  /** Kolik kusů padne na jedno obvyklé stáčení. null = málo dat. */
  naJednoStaceni: number | null;
  /** Zbývá méně než na jedno stáčení (nebo vůbec nic). */
  malo: boolean;
  /** Spotřeba je, nákup zapsaný není — zůstatek nelze spočítat. */
  bezEvidence: boolean;
};

function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

const SLOVA_ZAVIRKY = ['víčk', 'vick', 'uzáv', 'uzav', 'kork', 'korunk', 'kapsl'];

/**
 * Co se zavírá tímhle obalem. Rozhoduje objem: 1 l a 1,5 l je v pivovaru
 * PET, 0,33 l a 0,5 l sklo. Když to název řekne sám („PET 1 l"), má
 * přednost — objem může být u nestandardního obalu zapsaný jinak.
 *
 * Sudy sem nepatří (nemají závěrku), proto se od dvou litrů výš vrací null.
 */
export function druhZavirky(obal: { package_label?: string | null; volume_l?: number | null }): DruhZavirky | null {
  const l = (obal.package_label ?? '').toLowerCase();
  if (l.includes('pet')) return UZAVERY_PET;
  if (l.includes('sklo') || l.includes('lahev') || l.includes('láhev')) {
    // „Sklo 0,5" — sklo se zavírá korunkou bez ohledu na objem.
    return KORUNKY;
  }
  const v = cislo(obal.volume_l);
  if (v <= 0 || v >= 2) return null;
  return v >= 0.9 ? UZAVERY_PET : KORUNKY;
}

/**
 * Do kterého hrnce patří NÁKUP. null = tenhle nákup není závěrka (jsou to
 * prázdné lahve, ty už appka počítá jinde).
 */
export function kamPatriNakup(label: string | null | undefined): string | null {
  const l = (label ?? '').toLowerCase();
  if (!SLOVA_ZAVIRKY.some((s) => l.includes(s))) return null;
  if (l.includes('pet')) return UZAVERY_PET;
  if (l.includes('korunk') || l.includes('kapsl')) return KORUNKY;
  return ZAVIRKY_NEURCENE;
}

/**
 * Obvyklé jedno stáčení — medián denní spotřeby ze dnů, kdy se vůbec
 * stáčelo. Medián a ne průměr: jeden velký den by jinak hranici zvedl
 * tak, že by přehled hlásil „málo" pořád, a po třetím falešném poplachu
 * si toho nikdo nevšimne.
 *
 * Dny s nulou se vynechávají — ve dnech, kdy se nestáčí, se závěrky
 * nespotřebovávají a nic to o velikosti stáčení neříká.
 */
export function obvykleStaceni(spotrebaPoDnech: number[]): number | null {
  const dny = spotrebaPoDnech.filter((x) => cislo(x) > 0).map(cislo).sort((a, b) => a - b);
  if (dny.length === 0) return null;
  const stred = Math.floor(dny.length / 2);
  const median = dny.length % 2 === 1 ? dny[stred] : (dny[stred - 1] + dny[stred]) / 2;
  return Math.max(1, Math.round(median));
}

/**
 * Zůstatky závěrek. `staceni` jsou řádky lahvování (kolik lahví se
 * zavřelo), `nakupy` řádky příjmu materiálu.
 */
export function zustatkyZavirek(
  nakupy: NakupMaterialu[],
  staceni: ObalStaceni[],
): ZustatekMaterialu[] {
  const nakoupeno = new Map<string, number>();
  for (const n of nakupy) {
    const hrnec = kamPatriNakup(n.package_label);
    if (!hrnec) continue;
    nakoupeno.set(hrnec, (nakoupeno.get(hrnec) ?? 0) + cislo(n.quantity));
  }

  const spotreba = new Map<string, number>();
  // Spotřeba po dnech zvlášť, ať se z ní dá spočítat obvyklé stáčení.
  const poDnech = new Map<string, Map<string, number>>();
  for (const s of staceni) {
    const druh = druhZavirky(s);
    if (!druh) continue;
    const ks = cislo(s.quantity);
    if (ks <= 0) continue;
    spotreba.set(druh, (spotreba.get(druh) ?? 0) + ks);
    const den = (s.entry_date ?? '') || 'bez-data';
    const dny = poDnech.get(druh) ?? new Map<string, number>();
    dny.set(den, (dny.get(den) ?? 0) + ks);
    poDnech.set(druh, dny);
  }

  const nazvy = new Set<string>([...nakoupeno.keys(), ...spotreba.keys()]);
  const poradi = [KORUNKY, UZAVERY_PET, ZAVIRKY_NEURCENE];

  return [...nazvy]
    .sort((a, b) => poradi.indexOf(a) - poradi.indexOf(b))
    .map((nazev) => {
      const koupeno = nakoupeno.get(nazev) ?? 0;
      const vydano = spotreba.get(nazev) ?? 0;
      const zustatek = koupeno - vydano;
      const naJednoStaceni = obvykleStaceni([...(poDnech.get(nazev)?.values() ?? [])]);
      return {
        nazev,
        nakoupeno: koupeno,
        spotrebovano: vydano,
        zustatek,
        naJednoStaceni,
        // Bez zapsaného nákupu se zůstatek spočítat nedá a hlásit „málo"
        // by znamenalo hlásit chybějící evidenci jako chybějící materiál.
        malo: koupeno > 0 && (zustatek <= 0 || (naJednoStaceni !== null && zustatek < naJednoStaceni)),
        bezEvidence: koupeno === 0 && vydano > 0,
      };
    });
}
