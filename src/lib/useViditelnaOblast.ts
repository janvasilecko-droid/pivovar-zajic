// ⌨️ Okno nad klávesnicí.
//
// Zadání 30. 10. 2026 (stáčení lahví, krokové zadávání): „potvrzení a vrácení
// musí jít vidět hned nad klávesnicí, ať nemusím klávesnici dávat pryč, abych to
// mohl potvrdit." Na Androidu vyjede klávesnice PŘES stránku: okno přes celou
// obrazovku (`fixed inset-0`) zůstane vysoké jako displej a jeho spodní lišta
// s tlačítky je schovaná pod klávesnicí.
//
// Hook vrací viditelnou část obrazovky (`visualViewport`), jen když je klávesnice
// venku. Okno si podle ní nastaví výšku — lišta pak sedí těsně nad klávesnicí
// a obsah nad ní se roluje. Bez klávesnice (nebo bez visualViewport) vrací null
// a okno vypadá jako dřív.
import { useEffect, useState } from 'react';

/** Od kolika pixelů ubraných z výšky se počítá, že je venku klávesnice (ne jen lišta prohlížeče). */
export const MIN_KLAVESNICE = 120;

export type ViditelnaOblast = { vyska: number; odshora: number };

/** Viditelná oblast, pokud klávesnice ubrala aspoň MIN_KLAVESNICE pixelů; jinak null. */
export function viditelnaOblast(celkovaVyska: number, vv: { height: number; offsetTop: number } | null | undefined): ViditelnaOblast | null {
  if (!vv) return null;
  if (celkovaVyska - vv.height < MIN_KLAVESNICE) return null;
  return { vyska: Math.round(vv.height), odshora: Math.round(vv.offsetTop) };
}

export function useViditelnaOblast(): ViditelnaOblast | null {
  const [oblast, setOblast] = useState<ViditelnaOblast | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const srovnej = () => {
      const nova = viditelnaOblast(window.innerHeight, vv);
      setOblast((stara) => (stara?.vyska === nova?.vyska && stara?.odshora === nova?.odshora ? stara : nova));
    };
    srovnej();
    vv.addEventListener('resize', srovnej);
    vv.addEventListener('scroll', srovnej);
    return () => {
      vv.removeEventListener('resize', srovnej);
      vv.removeEventListener('scroll', srovnej);
    };
  }, []);
  return oblast;
}
