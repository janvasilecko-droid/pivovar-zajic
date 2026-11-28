// 📴 Karta „Práce bez signálu" v Nastavení: je telefon připravený (data + obrazovky)?
// Jen čte stavy, které si appka stejně vede (lib/offlinePripravenost.ts) — nic nestahuje ani nemění.
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useStavKopie } from '../lib/useStavKopie';
import { stavObrazovek, UDALOST_OBRAZOVEK } from '../lib/offlineObrazovky';
import { pripravenostBezSignalu } from '../lib/offlinePripravenost';

export function PripravenostBezSignalu() {
  const kopie = useStavKopie();
  const [obrazovky, setObrazovky] = useState(() => stavObrazovek());
  useEffect(() => {
    const obnov = () => setObrazovky(stavObrazovek());
    obnov();
    window.addEventListener(UDALOST_OBRAZOVEK, obnov);
    return () => window.removeEventListener(UDALOST_OBRAZOVEK, obnov);
  }, []);
  const p = pripravenostBezSignalu(kopie, obrazovky);
  return (
    <div className="card p-6" data-testid="pripravenost-bez-signalu">
      <h2 className="font-display font-bold text-lg flex items-center gap-2"><WifiOff size={18} /> Práce bez signálu</h2>
      <p className={`text-sm font-bold mt-2 ${p.pripraveno ? 'text-emerald-700' : 'text-amber-700'}`}>{p.nadpis}</p>
      <ul className="text-sm text-neutral-700 mt-2 space-y-1 list-disc pl-5">
        <li>{p.data}</li>
        <li>{p.obrazovky}</li>
      </ul>
      <p className="text-sm text-neutral-600 mt-2">Zprávy z WhatsAppu bez signálu nejsou. Co bez signálu zapíšeš, odešle se samo, až se signál vrátí.</p>
    </div>
  );
}
