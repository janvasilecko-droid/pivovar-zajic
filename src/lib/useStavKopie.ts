// Stav kopie dat pro práci bez signálu (lib/offlineKopieSklad.ts) pro obrazovky: přečte se hned a obnoví se,
// kdykoliv se kopie stáhne nebo smaže.
import { useEffect, useState } from 'react';
import { stavKopie, UDALOST_KOPIE, type StavKopie } from './offlineKopieSklad';

export function useStavKopie(): StavKopie {
  const [stav, setStav] = useState<StavKopie>(() => stavKopie());
  useEffect(() => {
    const obnov = () => setStav(stavKopie());
    obnov();
    window.addEventListener(UDALOST_KOPIE, obnov);
    return () => window.removeEventListener(UDALOST_KOPIE, obnov);
  }, []);
  return stav;
}
