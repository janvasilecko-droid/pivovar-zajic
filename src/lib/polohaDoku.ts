// 📍 Kde je navigační lišta (Lahve · Sklad · Objednávky · …).
// ---------------------------------------------------------------------------
// Zadání z 29. 10. 2026: lišta u pravého okraje, ať na ni dosáhne palec.
// Volba je na každém zařízení zvlášť (levák a pravák si ji nastaví sám):
//   dole       — trvale dole přes celou šířku (jak to bylo)
//   vpravo     — trvale svisle u pravého okraje
//   vlevo      — trvale svisle u levého okraje
//   vysouvaci  — schovaná, úchyt u pravého okraje ji vysune
import { useEffect, useState } from 'react';
import { nacti, uloz } from './uloziste';

export type PolohaDoku = 'dole' | 'vpravo' | 'vlevo' | 'vysouvaci';

export const POLOHY_DOKU: { id: PolohaDoku; nazev: string; popis: string }[] = [
  { id: 'dole', nazev: 'Dole', popis: 'trvale přes celou šířku' },
  { id: 'vpravo', nazev: 'Vpravo', popis: 'trvale u pravého okraje' },
  { id: 'vlevo', nazev: 'Vlevo', popis: 'trvale u levého okraje' },
  { id: 'vysouvaci', nazev: 'Vysouvací', popis: 'schovaná, úchyt vpravo' },
];

export const KLIC_POLOHY_DOKU = 'pivovar_poloha_doku';
const UDALOST = 'pivovar-poloha-doku';

export function jePolohaDoku(v: unknown): v is PolohaDoku {
  return v === 'dole' || v === 'vpravo' || v === 'vlevo' || v === 'vysouvaci';
}

export function nactiPolohuDoku(): PolohaDoku {
  const v = nacti(KLIC_POLOHY_DOKU);
  return jePolohaDoku(v) ? v : 'dole';
}

export function ulozPolohuDoku(v: PolohaDoku): void {
  uloz(KLIC_POLOHY_DOKU, v);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UDALOST));
}

/** Aktuální poloha; překreslí se, když ji někdo změní v nastavení. */
export function usePolohuDoku(): PolohaDoku {
  const [poloha, setPoloha] = useState<PolohaDoku>(nactiPolohuDoku);
  useEffect(() => {
    const zmena = () => setPoloha(nactiPolohuDoku());
    window.addEventListener(UDALOST, zmena);
    return () => window.removeEventListener(UDALOST, zmena);
  }, []);
  return poloha;
}
