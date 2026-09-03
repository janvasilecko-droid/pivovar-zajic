// Náhled pásku upozornění, nápovědy ke gestům a mřížky plochy — na šířce
// telefonu (390 px) i na počítači, vedle sebe.
//
//   npx vite --config vite.nahled.config.ts   →   /pasek.html
//
// PROČ IFRAME: Tailwind i media query v HomeScreen.css se rozhodují podle
// šířky OKNA, ne podle šířky kontejneru. Bez iframu by se rámeček „390 px"
// tvářil jako počítač a ladilo by se naslepo — přesně na to jsem tady
// jednou naletěl.
//
// Kreslí se PRAVÝM CSS z src/screens/HomeScreen.css nad vymyšlenými
// upozorněními. Na rozvržení to odpovídá aplikaci, na obsah ne.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TriangleAlert, CloudUpload, Download, Lightbulb, ClipboardCheck } from 'lucide-react';
import '../src/screens/HomeScreen.css';

const UPOZORNENI = [
  { popis: 'Vozidla — STK/známka', odznak: '2', Ikona: TriangleAlert, ton: 'hs-tile-alert' },
  { popis: 'Inventura', odznak: 'srpen', Ikona: ClipboardCheck, ton: 'hs-tile-warn' },
  { popis: 'Čeká na odeslání', odznak: '7', Ikona: CloudUpload, ton: 'hs-tile-warn' },
  { popis: 'Nová aktualizace v2.210', odznak: undefined, Ikona: Download, ton: 'hs-tile-alert' },
] as const;

const DLAZDICE = [
  { popis: 'KEG', barva: 'c-coral' },
  { popis: 'Lahve', barva: 'c-mint' },
  { popis: 'Sklad', barva: 'c-sky' },
  { popis: 'Poznámky', barva: 'c-citrus' },
  { popis: 'Inventura', barva: 'c-amber2' },
  { popis: 'Objednávky', barva: 'c-coral' },
] as const;

/** Vnitřek rámečku — to samé, co vykresluje HomeScreen. */
function Plocha({ kolikUpozorneni, napoveda }: { kolikUpozorneni: number; napoveda: boolean }) {
  return (
    <div style={{ padding: 8, background: '#f4efe7', minHeight: '100%' }}>
      <div className="hs-fixed-row" style={{ ['--hs-tile-alpha' as any]: 0.62, ['--hs-tile-gap' as any]: '4px' }}>
        {UPOZORNENI.slice(0, kolikUpozorneni).map((u) => (
          <button key={u.popis} type="button" className={`hs-tile ${u.ton} vlastni-vyska`}>
            <div className="hs-tile-icon-box"><u.Ikona /></div>
            <div className="hs-lbl">{u.popis}</div>
            {u.odznak && <span className="hs-badge">{u.odznak}</span>}
          </button>
        ))}
      </div>

      {napoveda && (
        <div className="hs-napoveda">
          <Lightbulb size={16} aria-hidden="true" />
          <span><b>Přidrž dlaždici</b> — otevřou se rychlé akce. <b>Táhni dolů</b> — otevře se hledání.</span>
          <button type="button" className="hs-napoveda-ok">Rozumím</button>
        </div>
      )}

      {/* Modrý pruh označuje první řádek plochy: na něm je vidět, jestli
          plocha po zapnutí upozornění poskočila. Pásek má pevnou výšku,
          takže poskočit nesmí. */}
      <div style={{ outline: '2px solid #2563eb', outlineOffset: 2, borderRadius: 12 }}>
        <div className="hs-grid" style={{ ['--hs-tile-alpha' as any]: 0.62, ['--hs-tile-gap' as any]: '4px' }}>
          {DLAZDICE.map((d) => (
            <button key={d.popis} type="button" className={`hs-tile ${d.barva} vlastni-vyska`}>
              <div className="hs-tile-icon-box"><TriangleAlert /></div>
              <div className="hs-lbl">{d.popis}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ram({ sirka, popis, kolikUpozorneni, napoveda }: {
  sirka: number; popis: string; kolikUpozorneni: number; napoveda: boolean;
}) {
  const [uzel, setUzel] = useState<HTMLIFrameElement | null>(null);
  const doc = uzel?.contentDocument;

  // Do iframu se musí přenést styly hostitelské stránky — Vite je v režimu
  // vývoje vkládá do <head> hlavního dokumentu.
  if (doc && doc.body && !doc.body.dataset.pripraveno) {
    doc.body.dataset.pripraveno = '1';
    doc.head.innerHTML = document.head.innerHTML;
    const koren = doc.createElement('div');
    doc.body.style.margin = '0';
    doc.body.appendChild(koren);
    createRoot(koren).render(<Plocha kolikUpozorneni={kolikUpozorneni} napoveda={napoveda} />);
  }

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{popis} — {sirka} px</div>
      <iframe
        ref={setUzel}
        title={popis}
        style={{ width: sirka, height: 560, border: '8px solid #171717', borderRadius: 22, background: '#fff' }}
      />
    </div>
  );
}

function Stranka() {
  const [kolik, setKolik] = useState(2);
  const [napoveda, setNapoveda] = useState(true);
  // `key` vynutí nové iframy při každé změně — obsah se do nich vkládá
  // jednorázově při připojení, takže překreslit se dají jen takhle.
  const klic = `${kolik}-${napoveda}`;

  return (
    <div style={{ minHeight: '100vh', background: '#e5e5e5', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, background: '#171717', color: '#fafafa',
        padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
        borderBottom: '2px solid #f59e0b',
      }}>
        <strong style={{ fontSize: 14 }}>Pásek upozornění (44 px) + nápověda ke gestům</strong>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          upozornění:
          <input
            type="range" min={0} max={UPOZORNENI.length} value={kolik}
            onChange={(e) => setKolik(Number(e.target.value))}
          />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{kolik}</span>
        </label>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={napoveda} onChange={(e) => setNapoveda(e.target.checked)} />
          nápověda ke gestům
        </label>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          Posouvej „upozornění" a koukej na modrý obrys — plocha se nesmí hnout.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, padding: 20, flexWrap: 'wrap' }} key={klic}>
        <Ram sirka={390} popis="Telefon" kolikUpozorneni={kolik} napoveda={napoveda} />
        <Ram sirka={768} popis="Tablet" kolikUpozorneni={kolik} napoveda={napoveda} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('nahled')!).render(<Stranka />);
