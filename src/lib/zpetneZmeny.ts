/**
 * 🕰️ Co přibylo do měsíce, který už je napočítaný.
 *
 * Inventura je fotka skladu k poslednímu dni měsíce. Jenže záznam se dá
 * pořídit KDYKOLIV a datum si nese vlastní — takže se do dávno spočítaného
 * měsíce dá přidat pohyb i o týden později. Očekávaný stav se tím posune,
 * napočítané číslo zůstane, a z ničeho nic „chybí dva sudy".
 *
 * Přesně to se stalo 6. 9. 2026: k srpnové objednávce Manea (závoz 26. 8.)
 * někdo dopsal 2× 10° Desítka 20 l a 1× 11° Světlá 15 l. Srpen byl přitom
 * spočítaný a dorovnaný už 1. 9. — a druhý den po dopsání ukazoval schodek,
 * který nikdo nevyrobil ani nevypil.
 *
 * Tahle kontrola nic neopravuje. Jen řekne: tenhle pohyb přibyl AŽ PO
 * inventuře, takže pokud něco nesedí, začni tady.
 */

/** Uložená inventura — kdy se počítalo a k jakému dni. */
export type NapocitanaInventura = {
  /** Den, ke kterému inventura platí (YYYY-MM-DD, poslední den měsíce). */
  entry_date: string;
  /** Kdy se zapsala (ISO čas). Bez něj se nedá říct, co bylo dřív. */
  created_at?: string | null;
};

/** Pohyb skladu s časem zápisu. */
export type PohybSCasem = {
  /** Datum, ke kterému pohyb patří (YYYY-MM-DD). */
  datum: string;
  /** Kdy se řádek doopravdy zapsal (ISO čas). */
  created_at?: string | null;
  /** Odkud je — „stáčení KEG", „závoz"… Jen pro popis nálezu. */
  zdroj: string;
  popis: string;
};

export type ZpetnaZmena = PohybSCasem & {
  /** Měsíc, do kterého pohyb spadá (YYYY-MM). */
  mesic: string;
  /** Kdy byl ten měsíc napočítaný. */
  inventuraZapsana: string;
};

/**
 * Poslední zápis inventury pro každý měsíc.
 *
 * Bere se NEJPOZDĚJŠÍ čas zápisu v daném měsíci: měsíc se běžně dorovnává
 * na několikrát a rozhoduje ten poslední — po něm už se nic měnit nemá.
 */
export function inventuryPodleMesice(inventury: NapocitanaInventura[]): Map<string, string> {
  const podleMesice = new Map<string, string>();
  for (const i of inventury) {
    if (!i.entry_date || !i.created_at) continue;
    const mesic = i.entry_date.slice(0, 7);
    const stavajici = podleMesice.get(mesic);
    if (!stavajici || i.created_at > stavajici) podleMesice.set(mesic, i.created_at);
  }
  return podleMesice;
}

/**
 * Pohyby, které přibyly do už napočítaného měsíce.
 *
 * Pohyb bez `created_at` se NEHLÁSÍ — o něm se neví, kdy vznikl, a tvrdit
 * „přibyl pozdě" na základě dohadu je horší než mlčet.
 */
export function zpetneZmeny(
  inventury: NapocitanaInventura[],
  pohyby: PohybSCasem[],
): ZpetnaZmena[] {
  const kdyPocitano = inventuryPodleMesice(inventury);
  if (kdyPocitano.size === 0) return [];

  const nalezy: ZpetnaZmena[] = [];
  for (const p of pohyby) {
    if (!p.datum || !p.created_at) continue;
    const mesic = p.datum.slice(0, 7);
    const inventuraZapsana = kdyPocitano.get(mesic);
    if (!inventuraZapsana) continue;
    if (p.created_at <= inventuraZapsana) continue;
    nalezy.push({ ...p, mesic, inventuraZapsana });
  }
  return nalezy.sort((a, b) => (a.created_at! < b.created_at! ? 1 : -1));
}
