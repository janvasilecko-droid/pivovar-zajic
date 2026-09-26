// Náhled celých částí obrazovek nad vymyšlenými daty — bez přihlášení.
//
// K čemu to je: appka se bez účtu zastaví na přihlašovací obrazovce, takže
// nová obrazovka šla dosud ověřit jen testem výpočtu, ne očima. Tady se
// vykreslí skutečná komponenta ze `src/` s podstrčenou Supabase a auth
// (vite.nahled.config.ts). Zápisy (nová várka, měření, mazání) se drží
// v paměti a po obnovení stránky zmizí.
//
//   npx vite --config vite.nahled.config.ts   →   http://localhost:5199/obrazovky.html?c=varky
//
// Přidat další obrazovku = položka v OBRAZOVKY + data v mock/data.ts
// (a v mock/supabase.ts jen to, co ta obrazovka opravdu zavolá).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ToastHost from '../src/components/ToastHost';
import { VarkySklep } from '../src/components/VarkySklep';
import { ZtratyTankuPrehled } from '../src/components/ZtratyTankuPrehled';
import CoStocitOkno from '../src/components/CoStocitOkno';
import ProdejnaScreen from '../src/screens/ProdejnaScreen';
import { BottlingTasksSettings } from '../src/components/BottlingTasksSettings';
import Statistika from '../src/screens/Statistika';
import ImportStaceniLahviExcel from '../src/components/ImportStaceniLahviExcel';
import ImportExcelScreen from '../src/screens/ImportExcelScreen';
import * as data from './mock/data';

const OBRAZOVKY = {
  varky: { popis: 'Sklep → Várky & kvašení', vykresli: () => <VarkySklep beers={data.beers as any} tanks={data.cellar_tanks as any} /> },
  ztraty: { popis: 'Sklep → Ztráty při stáčení', vykresli: () => <ZtratyTankuPrehled cycles={data.cellar_tank_cycles as any} /> },
  costocit: { popis: 'Domů → Co stočit', vykresli: () => <div style={{ maxWidth: 420 }}><CoStocitOkno setPage={() => {}} sudy lahve /></div> },
  // Výdej ze skladu — tatáž komponenta se jen přepíná tabulkou, takže
  // „Prodejna" (obchod) i „Personál" ukazují i tlačítko „Odfasovat".
  prodejna: { popis: 'Fasování → Prodejna (obchod)', vykresli: () => <ProdejnaScreen table="fasovani_private" title="Fasování" /> },
  personal: { popis: 'Fasování → Personál', vykresli: () => <ProdejnaScreen table="fasovani" title="Fasování" showVycep /> },
  potreby: { popis: 'Nastavení → Potřeby stáčení', vykresli: () => <BottlingTasksSettings setPage={() => {}} /> },
  statistika: { popis: 'Statistika', vykresli: () => <Statistika /> },
  importStaceni: {
    popis: 'Stáčení lahví → Import z Excelu',
    vykresli: () => (
      <ImportStaceniLahviExcel open onClose={() => {}} beers={data.beers as any} packages={data.packages as any} onImported={() => {}} />
    ),
  },
  importExcel: { popis: 'Načíst z Excelu (rozcestník)', vykresli: () => <ImportExcelScreen /> },
} as const;

type Klic = keyof typeof OBRAZOVKY;

function Obrazovky() {
  const zUrl = new URLSearchParams(window.location.search).get('c') as Klic | null;
  const [aktivni, setAktivni] = useState<Klic>(zUrl && zUrl in OBRAZOVKY ? zUrl : 'varky');

  function vyber(k: Klic) {
    setAktivni(k);
    const url = new URL(window.location.href);
    url.searchParams.set('c', k);
    window.history.replaceState(null, '', url);
  }

  return (
    <div style={{ padding: 12, minHeight: '100vh', background: '#f5f5f5' }}>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        <strong style={{ alignSelf: 'center' }}>Náhled:</strong>
        {(Object.keys(OBRAZOVKY) as Klic[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => vyber(k)}
            aria-pressed={aktivni === k}
            style={{
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid #b45309',
              background: aktivni === k ? '#b45309' : '#fff',
              color: aktivni === k ? '#fff' : '#78350f',
            }}
          >
            {OBRAZOVKY[k].popis}
          </button>
        ))}
      </nav>
      {OBRAZOVKY[aktivni].vykresli()}
      <ToastHost />
    </div>
  );
}

createRoot(document.getElementById('obrazovky')!).render(<Obrazovky />);
