// Srovnání rozložení plochy na TELEFONU (skutečných 390 px).
//
// Tři varianty vedle sebe, každá ve vlastním iframe — Tailwind i media query
// rozhodují podle šířky OKNA, takže bez iframe by se všechny tři tvářily
// jako počítač (viz poznámka v nahled.tsx).
//
// Přepínač „upozornění" je tu hlavní věc: zapni a vypni ho a koukej na modře
// obtažený první řádek plochy. Ve variantách A a B poskočí, protože
// upozornění sedí ve stejné mřížce nad ní; ve variantě C zůstane stát.
//
//   npx vite --config vite.nahled.config.ts   →   /plocha.html
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const VARIANTY = [
  {
    klic: 'A',
    nazev: 'A — jak je to dnes',
    popis: '4 dlaždice na řádek, upozornění v mřížce nad plochou.',
  },
  {
    klic: 'B',
    nazev: 'B — 3 na řádek',
    popis: 'Širší dlaždice (~120 px), popisek se vejde celý. Upozornění pořád nad plochou.',
  },
  {
    klic: 'C',
    nazev: 'C — 3 na řádek + pásek',
    popis: 'Upozornění ve vodorovném pásku pevné výšky. Plocha se pod ním nikdy neposune.',
  },
] as const;

const SIRKA_TELEFONU = 390;

function Srovnani() {
  const [upozorneni, setUpozorneni] = useState(true);

  return (
    <div style={{ minHeight: '100vh', background: '#e5e5e5', fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 50, background: '#171717', color: '#fafafa',
          padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
          borderBottom: '2px solid #f59e0b',
        }}
      >
        <strong style={{ fontSize: 13 }}>NÁHLED — rozložení plochy na telefonu</strong>
        <span style={{ fontSize: 12, color: '#a3a3a3' }}>
          {SIRKA_TELEFONU} px · skutečné CSS aplikace · vymyšlené dlaždice
        </span>

        <label
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={upozorneni}
            onChange={(e) => setUpozorneni(e.target.checked)}
          />
          Svítí 3 upozornění
        </label>
      </div>

      <p
        style={{
          margin: 0, padding: '10px 14px', fontSize: 12, lineHeight: 1.6,
          background: '#fef3c7', borderBottom: '1px solid #fcd34d', color: '#451a03',
        }}
      >
        <strong>Na co koukat:</strong> modře obtažený je první řádek plochy. Přepni
        „Svítí 3 upozornění" a sleduj, jestli se ten řádek pohne. Naměřeno:
        u A i B se posune o <strong>78 px</strong> (jedna řádka mřížky), u C
        o <strong>0 px</strong>. Se čtvrtým a pátým upozorněním se to u A a B
        posune o dalších 78. A porovnej popisky: „Vozidla — STK/známka",
        „Akce a festivaly" a „Výčepy — po termínu" se u A lámou do tří řádek.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, alignItems: 'flex-start' }}>
        {VARIANTY.map((v) => (
          <div key={v.klic} style={{ flexShrink: 0 }}>
            <div style={{ width: SIRKA_TELEFONU, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{v.nazev}</div>
              <div style={{ fontSize: 11, color: '#525252', lineHeight: 1.5 }}>{v.popis}</div>
            </div>
            <iframe
              // Klíč obsahuje přepínač, takže se rámeček po přepnutí načte znovu.
              key={`${v.klic}-${upozorneni}`}
              src={`/plocha-ram.html?varianta=${v.klic}&upozorneni=${upozorneni ? '1' : '0'}`}
              title={`Varianta ${v.klic}`}
              style={{
                width: SIRKA_TELEFONU, height: 780, display: 'block',
                border: '1px solid #a3a3a3', borderRadius: 6, background: '#f5f5f5',
                boxShadow: '0 8px 24px rgba(0,0,0,.12)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('plocha')!).render(<Srovnani />);
