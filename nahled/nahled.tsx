// Náhled panelů bez Supabase a bez přihlášení.
//
// K čemu to je: ladit vzhled a ovládání se dá jen tak, že je člověk vidí.
// Appka se ale bez přístupu k databázi zastaví na přihlašovací obrazovce,
// takže se sem panel vykresluje samostatně, nad vymyšlenými daty
// (`mock/data.ts`) a s podstrčenou náhradou Supabase (`mock/supabase.ts`).
//
// NENÍ SOUČÁSTÍ APLIKACE. Produkční build bere `index.html` v korenu
// projektu, tudy nechodí — spouští se `npx vite --config vite.nahled.config.ts`.
//
// PANEL BĚŽÍ V IFRAME (`panel.html`), a to schválně: Tailwind rozhoduje
// o `sm:`/`md:` podle šířky OKNA, ne rodičovského prvku. Dokud se vykresloval
// přímo tady, „Telefon (390)" jen zúžil rámeček a uvnitř zůstalo desktopové
// rozložení — takže se právě ta věc, kvůli které náhled vznikl, nedala vidět.
// Iframe má vlastní okno, takže 390 px platí.
//
// Rámování stránky je v `style`, ne v Tailwindu: `tailwind.config.js` prochází
// jen `src/`, takže třídy napsané tady by se nevygenerovaly. Panel sám je
// v `src/`, ten své třídy má.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { POPIS } from './mock/data';
import type { Zapis } from './mock/supabase';

/** Šířky, na kterých se appka opravdu používá. */
const SIRKY = [
  { klic: 'telefon', popis: 'Telefon', px: 390 },
  { klic: 'tablet', popis: 'Tablet', px: 768 },
  { klic: 'pocitac', popis: 'Počítač', px: 1280 },
] as const;

type Tank = { label: string; pivo: string; objem: number; stacise: boolean };

function Nahled() {
  const [sirka, setSirka] = useState<(typeof SIRKY)[number]>(SIRKY[0]);
  const [zapisy, setZapisy] = useState<Zapis[]>([]);
  const [tanky, setTanky] = useState<Tank[]>([]);
  // Změna klíče nahradí iframe novým — a s ním i celý běh skriptu, takže se
  // vymyšlená data vrátí do výchozího stavu. Reset přes zprávu dovnitř by
  // musel řešit, co všechno má panel zapomenout; nový rámeček to má zdarma.
  const [verze, setVerze] = useState(0);
  const ramRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    function prijmi(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.typ !== 'nahled-stav') return;
      setZapisy(e.data.zapisy ?? []);
      setTanky(e.data.tanky ?? []);
    }
    window.addEventListener('message', prijmi);
    return () => window.removeEventListener('message', prijmi);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#e5e5e5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Ovládání náhledu — vizuálně oddělené od appky, ať se nespletou. */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 50, background: '#171717', color: '#fafafa',
          padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
          borderBottom: '2px solid #f59e0b',
        }}
      >
        <strong style={{ fontSize: 13 }}>NÁHLED — Týdenní inventura</strong>
        <span style={{ fontSize: 12, color: '#a3a3a3' }}>
          vymyšlená data, žádné Supabase · dnes {POPIS.DNES} · pondělí {POPIS.PONDELI}
        </span>

        <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {SIRKY.map((s) => (
            <button
              key={s.klic}
              onClick={() => setSirka(s)}
              style={{
                padding: '7px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (sirka.klic === s.klic ? '#f59e0b' : '#525252'),
                background: sirka.klic === s.klic ? '#f59e0b' : 'transparent',
                color: sirka.klic === s.klic ? '#171717' : '#e5e5e5',
              }}
            >
              {s.popis} ({s.px})
            </button>
          ))}
        </span>

        <button
          onClick={() => { setZapisy([]); setVerze((v) => v + 1); }}
          style={{
            padding: '7px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid #525252', background: 'transparent', color: '#e5e5e5',
          }}
        >
          Začít znovu
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, alignItems: 'flex-start' }}>
        {/* Appka v zadané šířce. Rám napovídá, kde končí displej. */}
        <iframe
          key={verze}
          ref={ramRef}
          src="/panel.html"
          title={`Panel v šířce ${sirka.px} px`}
          style={{
            width: sirka.px, maxWidth: '100%', height: 900, flexShrink: 0,
            border: '1px solid #a3a3a3', borderRadius: 6,
            background: '#f5f5f5', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          }}
        />

        {/* Co panel zapsal — bez toho není poznat, jestli tlačítko něco udělalo. */}
        <div style={{ flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: 12 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800 }}>Sklep (tanky)</h2>
            {tanky.map((t) => (
              <div
                key={t.label}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}
              >
                <span style={{ fontWeight: 700 }}>
                  {t.label}
                  {t.stacise && <span style={{ color: '#b45309' }}> · stáčí se</span>}
                </span>
                <span style={{ color: '#525252' }}>{t.pivo} · {t.objem} l</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: 12 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800 }}>
              Zápisy do databáze ({zapisy.length})
            </h2>
            {zapisy.length === 0 && (
              <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>
                Zatím nic. Napočítej u položky jiné číslo, než se čeká, a použij
                „Zapsat do stáčení" nebo „Dorovnat".
              </p>
            )}
            {zapisy.map((z, i) => (
              <div key={i} style={{ fontSize: 12, padding: '5px 0', borderTop: i ? '1px solid #f5f5f5' : 'none' }}>
                <div style={{ fontWeight: 700 }}>
                  {z.kdy} · {z.tabulka} · {z.operace} ({z.radku})
                </div>
                <div style={{ color: '#525252' }}>{z.popis}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('nahled')!).render(<Nahled />);
