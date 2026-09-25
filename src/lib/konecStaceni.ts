// ✅ „Konec stáčení" — značka, že je úklidový checklist za dnešek hotový.
// ---------------------------------------------------------------------------
// Zadání 22. 9. 2026: „checklist každý stáčecí den musí být vyplněn … když ho
// stáčeč nevyplní, upozornit v 16:00 na telefon, a když ani pak, v 18:00
// znovu i s tabulkou k vyplnění."
//
// Připomínku posílá databáze (pg_cron → posli-push), ta ale nemá jak poznat,
// KTERÉ položky checklistu do sekce „2. Konec stáčení" patří — seznam kroků
// žije v appce (BottlingChecklistModal, KeggingChecklistModal) a mění se.
// Proto appka spolu s odškrtáváním ukládá JEDNU odvozenou položku
// `konec_hotovo`: je splněná právě tehdy, když jsou splněné všechny povinné
// kroky konce stáčení. Databáze se pak ptá jen na ni.
//
// Značka se drží v téže mapě jako ostatní položky, takže se sama propíše do
// `checklisty_hotovo` (a při odškrtnutí zase zmizí) — žádná druhá cesta
// zápisu, která by se mohla rozejít s tím, co je vidět v okně.

/** Sekce úklidu po stáčení. Stejný prefix má checklist lahví i KEGů. */
export const KONEC_CATEGORY_PREFIX = '2.';

/** Klíč odvozené položky v `checklisty_hotovo`. Nesmí se srazit s ID kroků. */
export const KONEC_HOTOVO = 'konec_hotovo';

export type PolozkaChecklistu = {
  id: string;
  category: string;
  required?: boolean;
};

type Mapa = Record<string, boolean | string | undefined>;

function jeSplnena(v: boolean | string | undefined): boolean {
  return typeof v === 'string' ? v.length > 0 : !!v;
}

/** Kroky sekce „2. Konec stáčení" z celého seznamu. */
export function polozkyKonce<T extends PolozkaChecklistu>(items: T[]): T[] {
  return items.filter((it) => it.category.startsWith(KONEC_CATEGORY_PREFIX));
}

/**
 * Je konec stáčení hotový? Rozhodují POVINNÉ kroky sekce „2." — nepovinné
 * (kdyby nějaké přibyly) nesmí bránit tomu, aby připomínka přestala chodit.
 * Když sekce žádné kroky nemá, není co potvrzovat a vrací se `false`:
 * radši připomínka navíc než tichý souhlas nad prázdným seznamem.
 */
export function jeKonecHotov(items: PolozkaChecklistu[], mapa: Mapa): boolean {
  const kroky = polozkyKonce(items).filter((it) => it.required !== false);
  if (kroky.length === 0) return false;
  return kroky.every((it) => jeSplnena(mapa[it.id]));
}

/**
 * Doplní do mapy odvozenou značku `konec_hotovo`. Vrací NOVOU mapu, ať se
 * stav v okně nemění pod rukama.
 */
export function sZnackouKonce<M extends Mapa>(items: PolozkaChecklistu[], mapa: M): M {
  return { ...mapa, [KONEC_HOTOVO]: jeKonecHotov(items, mapa) } as M;
}
