// 🚐 Kniha jízd — tachometr u jízd vygenerovaných z objednávek.
// ---------------------------------------------------------------------------
// Zadání 27. 9. 2026: „udělej ji nejlíp, jak to jde, ať je to reálný."
//
// Generátor dřív vedl JEDEN tachometr pro obě auta: km Kachny se přičetly
// na tachometr Velkého auta a naopak, takže ani jedno auto nemělo stav,
// který by seděl s tím, co ukazuje palubní deska. Každé auto má svůj
// tachometr — tady se proto počítá zvlášť pro každé.

/** Začátek poznámky u jízdy vytvořené generátorem z objednávek. */
export const POZNAMKA_VYGENEROVANO = 'Vygenerováno z objednávek';

/** Jízda z Knihy jízd v rozsahu, který potřebuje výpočet tachometru. */
export type JizdaProTachometr = { date: string; vehicle_name: string; km_end: number };

/**
 * Poslední stav tachometru daného auta PŘED zadaným dnem (typicky 1. den
 * měsíce, který se generuje). Jízdy z generovaného měsíce se nepočítají —
 * při opakovaném generování by jinak měsíc navazoval sám na sebe.
 */
export function posledniTachometrPred(
  jizdy: JizdaProTachometr[],
  auto: string,
  pred: string,
): number | null {
  let nejnovejsi: JizdaProTachometr | null = null;
  for (const j of jizdy) {
    if (j.vehicle_name !== auto || j.date >= pred) continue;
    if (!nejnovejsi || j.date > nejnovejsi.date || (j.date === nejnovejsi.date && j.km_end > nejnovejsi.km_end)) {
      nejnovejsi = j;
    }
  }
  return nejnovejsi ? nejnovejsi.km_end : null;
}

export type DenJizdy = { date: string; isKachna: boolean; km: number };
export type Tachometr = { km_start: number; km_end: number; km_driven: number };

/**
 * Stav tachometru pro každou vygenerovanou jízdu — každé auto má vlastní
 * řadu, která navazuje jen na jeho vlastní předchozí jízdu. Výsledek je ve
 * stejném pořadí jako `dny`; jízdy se ale do řady řadí podle data, ať
 * pořadí v náhledu neovlivní, co bylo „dřív".
 */
export function rozepisTachometr(
  dny: DenJizdy[],
  start: { velke: number; kachna: number },
): Tachometr[] {
  const stav = { velke: start.velke, kachna: start.kachna };
  const vysledek: Tachometr[] = new Array(dny.length);
  const poradi = dny.map((d, i) => ({ d, i })).sort((a, b) => a.d.date.localeCompare(b.d.date) || a.i - b.i);
  for (const { d, i } of poradi) {
    const auto = d.isKachna ? 'kachna' : 'velke';
    const ujeto = Math.max(0, Number(d.km) || 0);
    const km_start = stav[auto];
    const km_end = Math.round((km_start + ujeto) * 10) / 10;
    stav[auto] = km_end;
    vysledek[i] = { km_start, km_end, km_driven: ujeto };
  }
  return vysledek;
}
