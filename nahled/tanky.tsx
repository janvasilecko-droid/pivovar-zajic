// Náhled řádku tanků nahoře na ploše (components/PrehledTankuPlocha.tsx).
//
// Všechny fáze tanku vedle sebe, i s nejdelším štítkem „vysanitovaný" —
// 18. 11. 2026 se na telefonu ořízl na „vysanitovan…". Šířku písma jednotkový
// test nevidí, proto to hlídá E2E scénář (scripts/e2e.mjs) na skutečném CSS.
// Otevírá se `/tanky.html`, šířku okna řídí prohlížeč.
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { PrehledTankuPlocha } from '../src/components/PrehledTankuPlocha';
import type { FazeTanku } from '../src/lib/fazeTanku';

const bezPiva = (id: string, label: string, faze: FazeTanku | null) =>
  ({ id, label, pivo: '', barva: null, litry: 0, vystav: 7500, prazdny: true, faze });

const tanky = [
  bezPiva('t1', 'Tank 1', 'vysanitovany'),
  bezPiva('t2', 'Tank 2', 'uzavreny'),
  bezPiva('t3', 'Tank 3', 'po_oplachu'),
  bezPiva('t4', 'Tank 4', 'po_louhu'),
  { id: 't5', label: 'Tank 5', pivo: '12° Světlá', barva: '#f4c430', litry: 3750, vystav: 7500, prazdny: false, faze: null },
  bezPiva('t6', 'Tank 6', null),
  bezPiva('t7', 'Tank 7', 'vysanitovany'),
  bezPiva('t8', 'Tank 8', 'vysanitovany'),
];

createRoot(document.getElementById('tanky')!).render(<PrehledTankuPlocha tanky={tanky} onOtevrit={() => {}} />);
