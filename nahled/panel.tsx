// Obsah rámečku v náhledu — jen samotný panel, nic okolo.
//
// Běží v `iframe`, a to je celý důvod, proč je tenhle soubor zvlášť: Tailwind
// rozhoduje o `sm:`/`md:` podle ŠÍŘKY OKNA, ne podle šířky rodičovského prvku.
// Dokud se panel vykresloval přímo ve stránce, „Telefon (390)" jen zúžil rám a
// uvnitř zůstalo desktopové rozložení — přesně to, kvůli čemu se náhled dělal,
// tedy nebylo vidět. Iframe má vlastní okno, takže 390 px je doopravdy 390 px.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import TydenniInventuraPanel from '../src/components/TydenniInventuraPanel';
import ToastHost from '../src/components/ToastHost';
import { sledujZapisy, stavTanku, zapisy } from './mock/supabase';

/** Co se v rámečku stalo, hlásíme ven — výpis zápisů je ve stránce kolem. */
function hlasVen() {
  try {
    window.parent?.postMessage(
      { typ: 'nahled-stav', zapisy: [...zapisy], tanky: stavTanku() },
      window.location.origin,
    );
  } catch {
    // Náhled bez rodiče (otevřený samostatně) — není komu hlásit, nevadí.
  }
}

function Obsah() {
  useEffect(() => {
    hlasVen();
    return sledujZapisy(hlasVen);
  }, []);

  return (
    <div style={{ padding: 12, minHeight: '100vh', background: '#f5f5f5' }}>
      <TydenniInventuraPanel />
      <ToastHost />
    </div>
  );
}

createRoot(document.getElementById('panel')!).render(<Obsah />);
