// 🏷️ Odkud se vzal záznam ve stáčení — napsal ho člověk, nebo appka sama?
// ---------------------------------------------------------------------------
// Z provozu podruhé (18. 9. 2026): „proč je zadané stáčení 14×30 Desítka,
// to jsem nezadával?" Poprvé to bylo 12. 9. („10× 12sv 50 l jsem nezadával")
// a tehdy se doplnila značka — jenže jen pro JEDEN původ (zaškrtnutá kapka
// „Stočeno" u objednávky) a jen do mobilních karet. Tabulka na počítači,
// ve které se to ptal, o původu neříká pořád nic, a řádky z inventury
// (tlačítko „Srovnat" v týdenní kontrole a doplňky z měsíční inventury)
// neměly značku nikde.
//
// Appka do stáčení zapisuje sama ze tří míst a každé se pozná podle
// poznámky, kterou u řádku nechává:
//   • zaškrtnutá kapka „Stočeno" u objednávky   (staceniZPolozky.ts)
//   • „Doplněno z inventury …" – přebytek       (inventoryFix.ts)
//   • „Odečteno z inventury …" – manko          (inventoryFix.ts)
//
// Všechny tři jsou správně a byly vyžádané. Problém je jen v tom, že
// v seznamu vypadají úplně stejně jako ručně napsaný zápis — takže se ve
// stáčení objeví várka, o které stáčeč neví.
import { POZNAMKA_AUTOMATICKY } from './staceniZPolozky';

export type PuvodZapisu = {
  /** Krátký popis do seznamu. */
  popis: string;
  /** Co s tím: řádek appka založila sama, není to překlep stáčeče. */
  automaticky: true;
};

/**
 * Popíše původ záznamu podle poznámky. `null` = běžný ruční zápis
 * (i takový může mít poznámku, ta se ukazuje zvlášť).
 */
export function puvodZapisu(note: string | null | undefined): PuvodZapisu | null {
  const t = (note ?? '').trimStart();
  if (!t) return null;
  if (t.startsWith(POZNAMKA_AUTOMATICKY)) {
    return { popis: 'Založeno zaškrtnutím „Stočeno" u objednávky', automaticky: true };
  }
  // Klíč období si appka píše do poznámky sama („2026-09" u měsíční
  // inventury, „týdne 2026-09-14" u týdenní) — vezme se, co za pomlčkou
  // stojí, ať je vidět, které kontroly se to týkalo.
  const inventura = t.match(/^(Doplněno|Odečteno) z inventury\s+([^—]+)/);
  if (inventura) {
    const smer = inventura[1] === 'Doplněno' ? 'Doplněno' : 'Odečteno';
    return { popis: `${smer} po inventuře ${inventura[2].trim()} — nezapsal to stáčeč`, automaticky: true };
  }
  return null;
}

/** Zbylá poznámka, kterou má smysl ukázat vedle původu (u ručního zápisu). */
export function vlastniPoznamka(note: string | null | undefined): string | null {
  const t = (note ?? '').trim();
  if (!t || puvodZapisu(t)) return null;
  return t;
}
