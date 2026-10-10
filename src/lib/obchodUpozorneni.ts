// 🔔 Obchod: kolik věcí čeká na pozornost — jedno číslo pro odznak na dlaždici.
// ---------------------------------------------------------------------------
// Stejné výpočty jako v obrazovce Obchod (sklad, hlídání zásob, mezery
// v uzávěrkách, inventura) — odznak na ploše a čísla uvnitř se nesmí rozcházet,
// proto je počítá jedna funkce.
import { fasovaniBezZbozi, stavySkladu, varovaniZasob, type InventuraRadek, type VstupSkladu } from './obchodSklad';
import { mezeryUzaverek } from './obchodMezery';
import { inventuraObchoduChybi } from './obchodInventura';

export type UpozorneniObchodu = {
  /** Zboží v mínusu, vyprodané nebo pod minimem. */
  zasoby: number;
  /** Nafasováno do obchodu, ale zboží (kód z pokladny) tu chybí. */
  fasovaniBezZbozi: number;
  /** Úseky dnů bez uzávěrky. */
  mezery: number;
  /** Chybí inventura za končící / skončený měsíc. */
  inventura: boolean;
  /** Součet všeho (inventura se počítá jako jedna věc). */
  celkem: number;
};

export function spoctiUpozorneni(vstup: VstupSkladu, zavreno: { datum: string }[], dnes: string): UpozorneniObchodu {
  const zasoby = varovaniZasob(stavySkladu(vstup, dnes)).length;
  const bezZbozi = fasovaniBezZbozi(vstup).length;
  const mezery = mezeryUzaverek({ uzaverky: vstup.uzaverky, zavreno, dnes }).length;
  const inventura = inventuraObchoduChybi(vstup.inventury, dnes) != null;
  return { zasoby, fasovaniBezZbozi: bezZbozi, mezery, inventura, celkem: zasoby + bezZbozi + mezery + (inventura ? 1 : 0) };
}

/**
 * Nejstarší z posledních inventur jednotlivého zboží — od ní dál je potřeba
 * znát pohyby. Bez inventury žádné zboží nemá stav, takže se pohyby neřeší.
 */
export function odKdyJePotrebaZnatPohyby(inventury: Pick<InventuraRadek, 'kod' | 'datum'>[]): string | null {
  const posledni = new Map<string, string>();
  for (const i of inventury) {
    const dosud = posledni.get(i.kod);
    if (!dosud || i.datum > dosud) posledni.set(i.kod, i.datum);
  }
  let min: string | null = null;
  for (const d of posledni.values()) if (min == null || d < min) min = d;
  return min;
}
