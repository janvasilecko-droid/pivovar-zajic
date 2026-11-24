import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { nactiStavVektoru } from '../../lib/bibleKnihovnaApi';
import { cekajiVektory, ODKAZ_ZPRACOVANI, popisVektoru, type VysledekVektoru } from '../../lib/bibleVektory';

/** Správa znalostí → AI a náklady: stav hledání podle významu (vektory pasáží, R38). Jen pro správce. */
export function BibleVektoryStav() {
  const [vysledek, setVysledek] = useState<VysledekVektoru>(null);
  useEffect(() => {
    let zruseno = false;
    void nactiStavVektoru().then((r) => { if (!zruseno) setVysledek(r); });
    return () => { zruseno = true; };
  }, []);
  const p = popisVektoru(vysledek);
  return (
    <section className="space-y-1 border-t border-neutral-700 pt-2 text-sm" aria-label="Hledání podle významu">
      <div className="font-bold text-neutral-100">Hledání podle významu (vektory)</div>
      <p className={p.ok ? 'text-emerald-300' : 'text-neutral-200'} aria-live="polite">{p.text}</p>
      {cekajiVektory(vysledek) && (
        <p className="text-xs text-neutral-300">
          Zbytek dopočítá zpracování knih samo (zhruba každé 3 hodiny), nebo hned:{' '}
          <a className="inline-flex items-center gap-1 font-bold text-amber-300 underline" href={ODKAZ_ZPRACOVANI} target="_blank" rel="noopener noreferrer">
            zpracování knih → Run workflow <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      )}
    </section>
  );
}
