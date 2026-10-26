// Klepnutí na tank v přehledu nahoře na ploše nese v subTab kód `tank:<id>`.
// Záložky sklepa (ležácké, spilka, …) zůstávají beze změny.

export const ZALOZKY_SKLEPA_ID = ['lezacke', 'spilka', 'varky', 'ztraty', 'bez_tanku'] as const;
export type ZalozkaSklepaId = (typeof ZALOZKY_SKLEPA_ID)[number];

export type CilSklepa = { zalozka: ZalozkaSklepaId; tankId: string | null };

export function cilSklepa(sub: string | undefined | null): CilSklepa {
  if (sub && sub.startsWith('tank:')) {
    const id = sub.slice('tank:'.length).trim();
    return { zalozka: 'lezacke', tankId: id || null };
  }
  if (sub && (ZALOZKY_SKLEPA_ID as readonly string[]).includes(sub)) {
    return { zalozka: sub as ZalozkaSklepaId, tankId: null };
  }
  return { zalozka: 'lezacke', tankId: null };
}

export function subTabTanku(id: string): string {
  return `tank:${id}`;
}
