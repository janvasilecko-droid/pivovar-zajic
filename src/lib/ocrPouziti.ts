// 🔎 Kolik fotek tento měsíc přepsal Google Vision (OCR) — viz
// supabase/functions/_shared/google-ocr.ts a migrace 20261231290000_ocr_pocitadlo.
//
// Google Vision je zdarma do 1 000 fotek za měsíc, pak se platí. Majitel
// 12. 10. 2026: „ať se to nezastaví, dej u případně 900 obrázků varování do
// aplikace". Přepis se proto nikdy nezastavuje, jen od 900 svítí varování.

export const OCR_ZDARMA_MESICNE = 1000;
export const OCR_VAROVANI_OD = 900;

/** Klíč měsíce v tabulce ocr_pouziti — první den měsíce v UTC (jako databáze). */
export function mesicOcr(ted: Date): string {
  return `${ted.getUTCFullYear()}-${String(ted.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export type OcrVarovani = { varovat: boolean; pocet: number; popis: string };

export function ocrVarovani(pocet: number | null | undefined): OcrVarovani {
  const n = pocet ?? 0;
  const nad = Math.max(0, n - OCR_ZDARMA_MESICNE);
  return {
    varovat: n >= OCR_VAROVANI_OD,
    pocet: n,
    popis: nad > 0
      ? `Google Vision tento měsíc přepsal ${n} fotek — ${nad} nad bezplatných ${OCR_ZDARMA_MESICNE}, ty se platí (asi 1,50 USD za 1 000). Přepis běží dál.`
      : `Google Vision tento měsíc přepsal ${n} fotek z ${OCR_ZDARMA_MESICNE} zdarma. Nad ${OCR_ZDARMA_MESICNE} se platí (asi 1,50 USD za 1 000). Přepis běží dál.`,
  };
}
