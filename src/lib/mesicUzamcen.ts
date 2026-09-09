// 🔒 Varování před zápisem do už napočítaného měsíce.
//
// Audit (lib/zpetneZmeny.ts) tenhle problém umí najít, ale až PO škodě —
// řekne "sem se koukni", nezabrání tomu. Přesně tenhle případ (Maneo,
// 6. 9. 2026): k srpnové objednávce se dopsalo zboží týden po tom, co byl
// srpen spočítaný a dorovnaný — a schodek se pak hledal jako záhada.
//
// Tohle je preventivní, jednodušší kontrola: existuje pro daný měsíc (nebo
// pro POZDĚJŠÍ měsíc — ten by přepsáním svého počátečního stavu utrpěl
// stejně) uložená schválená/fyzická inventura? Pak zápis do něj NENÍ
// zakázaný (legitimní oprava se stát může), jen se na to nahlas upozorní.

export type RadekInventury = { entry_date?: string | null; note?: string | null };

/** Měsíce (YYYY-MM), pro které existuje zapsaná fyzická nebo schválená inventura. */
export function napocitaneMesice(inventoryRows: RadekInventury[]): Set<string> {
  const out = new Set<string>();
  for (const r of inventoryRows) {
    if (!r.entry_date) continue;
    const pocitana = r.note?.includes('Fyzická') || r.note?.includes('Schválená');
    if (pocitana) out.add(r.entry_date.slice(0, 7));
  }
  return out;
}

/**
 * Patří datum do měsíce, který už je napočítaný, NEBO do měsíce PŘED
 * nejnovějším napočítaným měsícem?
 *
 * Druhá podmínka je stejně důležitá jako první: zápis o měsíc zpátky mění
 * počáteční stav toho, co bylo napočítáno později, i když ten starší měsíc
 * sám o sobě nemá vlastní inventuru zapsanou (typicky proto, že se přeskočila).
 */
export function jeMesicUzamcen(inventoryRows: RadekInventury[], datum: string): boolean {
  if (!datum) return false;
  const mesic = datum.slice(0, 7);
  const mesice = napocitaneMesice(inventoryRows);
  if (mesice.has(mesic)) return true;
  for (const m of mesice) {
    if (m > mesic) return true;
  }
  return false;
}
