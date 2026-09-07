// 🔁 Dvakrát totéž pivo ve stejném obalu v jedné objednávce.
//
// Případ Manea (26. 8. 2026): objednávka měla 2× 10° Desítka 20 l a 1× 11°
// Světlá 15 l dvakrát — jednou z WhatsAppu, podruhé po ručním doplnění.
// Sudy nakonec neseděly v srpnové inventuře a hledalo se to hodinu, protože
// v přehledu vypadají dva řádky stejně jako jeden s dvojnásobkem.
//
// Dvě stejné položky v jedné objednávce jsou skoro vždycky omyl. „Skoro"
// je důležité: legitimní důvod existuje (dvě dodací adresy jednoho
// odběratele), takže se nic nezakazuje — jen se to řekne nahlas a nabídne
// se sloučení jedním klepnutím.

export type PolozkaObjednavky = {
  beerId: string;
  pkgId: string;
  qty: string | number;
  removed?: boolean;
  /**
   * Do čeho položka patří — u zadávacího formuláře odběratel, protože tam
   * se do jedné mřížky píše i pro víc odběratelů naráz a stejné pivo pro
   * dva různé hospody duplicita není. Uvnitř jedné objednávky se nevyplňuje.
   */
  skupina?: string;
};

export type Zdvojeni = {
  beerId: string;
  pkgId: string;
  /** Pořadí řádků v původním poli — první je ten, do kterého se slučuje. */
  indexy: number[];
  /** Součet množství všech zdvojených řádků. */
  celkem: number;
};

function cislo(q: string | number): number {
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Najde skupiny řádků se stejným pivem i obalem.
 *
 * Nevyplněné a odstraněné řádky se ignorují — prázdný nový řádek by jinak
 * hlásil duplicitu s jiným prázdným a varování by svítilo pořád.
 */
export function najdiZdvojene(radky: PolozkaObjednavky[]): Zdvojeni[] {
  const skupiny = new Map<string, number[]>();
  radky.forEach((r, i) => {
    if (r.removed) return;
    if (!r.beerId || !r.pkgId) return;
    const k = [r.skupina ?? '', r.beerId, r.pkgId].join(String.fromCharCode(31));
    skupiny.set(k, [...(skupiny.get(k) ?? []), i]);
  });

  const out: Zdvojeni[] = [];
  for (const [k, indexy] of skupiny) {
    if (indexy.length < 2) continue;
    const [, beerId, pkgId] = k.split(String.fromCharCode(31));
    out.push({ beerId, pkgId, indexy, celkem: indexy.reduce((s, i) => s + cislo(radky[i].qty), 0) });
  }
  return out;
}

/**
 * Sloučí zdvojené řádky do prvního z nich a sečte množství.
 *
 * Řádky, které už jsou v databázi (mají `id`), se jen označí `removed` —
 * ukládání je pak smaže stejnou cestou jako ruční odstranění. Řádky bez
 * `id` (jen rozepsané) z pole vypadnou úplně.
 */
export function slucZdvojene<T extends PolozkaObjednavky & { id?: string | null }>(radky: T[]): T[] {
  const skupiny = najdiZdvojene(radky);
  if (skupiny.length === 0) return radky;

  const kSecteni = new Map<number, number>();
  const kOdstraneni = new Set<number>();
  for (const s of skupiny) {
    const [prvni, ...zbytek] = s.indexy;
    kSecteni.set(prvni, s.celkem);
    for (const i of zbytek) kOdstraneni.add(i);
  }

  const out: T[] = [];
  radky.forEach((r, i) => {
    if (kSecteni.has(i)) { out.push({ ...r, qty: String(kSecteni.get(i)) }); return; }
    if (kOdstraneni.has(i)) {
      if (r.id) out.push({ ...r, removed: true });
      return;
    }
    out.push(r);
  });
  return out;
}

/** Věta pro uživatele — bez ní by varování bylo jen červený rámeček. */
export function popisZdvojeni(z: Zdvojeni, nazevPiva: string, nazevObalu: string): string {
  return `${nazevPiva} ${nazevObalu} je v objednávce ${z.indexy.length}× (dohromady ${z.celkem} ks)`;
}
