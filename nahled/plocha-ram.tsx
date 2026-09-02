// Obsah jednoho rámečku ve srovnání rozložení plochy.
//
// POZOR — CO TO JE A CO TO NENÍ. Není to obrazovka Domů z aplikace: ta si
// tahá profil, práva a osm tabulek a bez databáze se nespustí. Tohle je
// mřížka dlaždic postavená ze STEJNÉHO CSS (`HomeScreen.css`, třídy
// `hs-grid`, `hs-tile`, `hs-fixed-row`) a s vymyšlenými dlaždicemi.
//
// Na otázku, kterou to má rozhodnout — kolik dlaždic na řádek a co dělají
// upozornění s výškou nad mřížkou — to stačí: je to čistě věc rozvržení,
// žádná data k tomu nejsou potřeba. Na cokoliv, co závisí na obsahu, se
// tímhle spoléhat nedá.
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/screens/HomeScreen.css';
import {
  Beer, Boxes, CalendarDays, ClipboardCheck, Droplets, FileText, Gauge,
  Package, Settings, ShoppingCart, Sparkles, StickyNote, Truck, TriangleAlert, Warehouse,
} from 'lucide-react';

/** Vzkazy na lístečku — takové, jaké si v pivovaru vážně píšou. */
const POZNAMKY = [
  { text: 'Dovézt sudy z ASI', dulezite: true, hotovo: false },
  { text: 'Zavolat Maneu kvůli petkám', dulezite: false, hotovo: false },
  { text: 'Vymýt tank 4 před stáčením', dulezite: false, hotovo: false },
  { text: 'Objednat kartony 0,5', dulezite: false, hotovo: true },
];

/**
 * Poznámkový lísteček tak, jak ho kreslí HomeScreen (`customContent` u
 * dlaždice `notes`) — včetně toho, kolik vzkazů se vejde: plocha × 2.
 */
function Listecek({ span }: { span: number }) {
  // w × h × 2, tady 2 × 2 × 2 = 8; víc, než kolik je vzkazů.
  const kZobrazeni = POZNAMKY.slice(0, 8);
  return (
    <button
      type="button"
      className="hs-tile hs-tile-sticky c-citrus vlastni-vyska"
      style={{ gridColumn: `span ${span * 2}`, gridRow: 'span 2', outline: '2px solid #2563eb', outlineOffset: -2 }}
    >
      <div className="w-full h-full flex flex-col p-2 gap-1 text-left select-none overflow-hidden">
        <div className="flex items-center gap-1 shrink-0 opacity-80">
          <StickyNote size={11} className="shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-wider truncate">Poznámky</span>
        </div>
        <div className="flex-1 flex flex-col gap-1 overflow-hidden">
          {kZobrazeni.map((p) => (
            <div key={p.text} className="flex items-start gap-1.5 min-w-0">
              <span className="hs-note-check" />
              {p.dulezite && !p.hotovo && <TriangleAlert className="hs-note-vykricnik" />}
              <span
                className={`text-[11px] font-bold leading-tight line-clamp-2 min-w-0 ${p.hotovo ? 'line-through opacity-45' : ''}`}
              >
                {p.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

/** Dlaždice, jaké na ploše doopravdy jsou. */
const DLAZDICE = [
  { popis: 'Objednávky', Ikona: ShoppingCart, barva: 'c-cobalt', odznak: 7 },
  { popis: 'Stáčení KEG', Ikona: Beer, barva: 'c-azure' },
  { popis: 'Lahve (Stáčení)', Ikona: Droplets, barva: 'c-sky' },
  { popis: 'Sklad', Ikona: Warehouse, barva: 'c-emerald' },
  { popis: 'Sklep', Ikona: Gauge, barva: 'c-jade' },
  { popis: 'Inventura', Ikona: ClipboardCheck, barva: 'c-sage' },
  { popis: 'Závoz', Ikona: Truck, barva: 'c-tangerine' },
  { popis: 'Sanitace', Ikona: Sparkles, barva: 'c-teal' },
  { popis: 'Výčepy', Ikona: Boxes, barva: 'c-periwinkle' },
  { popis: 'Prodejna', Ikona: Package, barva: 'c-honey' },
  { popis: 'Akce a festivaly', Ikona: CalendarDays, barva: 'c-grape' },
  { popis: 'Kniha jízd', Ikona: FileText, barva: 'c-slate' },
  { popis: 'Statistika', Ikona: Gauge, barva: 'c-violet' },
  { popis: 'Nastavení', Ikona: Settings, barva: 'c-charcoal' },
];

/** Upozornění, která se na ploše objevují a mizí podle dne. */
const UPOZORNENI = [
  { popis: 'Výčepy — po termínu', odznak: '9 dní' },
  { popis: 'Inventura', odznak: '2' },
  { popis: 'Vozidla — STK/známka', odznak: '1' },
];

const parametry = new URLSearchParams(window.location.search);
const varianta = (parametry.get('varianta') ?? 'A') as 'A' | 'B' | 'C';
const sUpozornenim = parametry.get('upozorneni') === '1';

/** Kolik sloupců mřížky zabere jedna dlaždice. 12 sloupců / 3 = 4 v řadě. */
const SPAN = varianta === 'A' ? 3 : 4;

function Ram() {
  return (
    <div style={{ padding: 8, minHeight: '100vh' }}>
      {/* Varianta C: upozornění v jednom pásku pevné výšky — plocha se pod
          ním nehýbe, ať jich je nula nebo pět. */}
      {varianta === 'C' && (
        <div
          style={{
            height: 74, marginBottom: 4, display: 'flex', gap: 4,
            overflowX: 'auto', alignItems: 'stretch',
          }}
        >
          {sUpozornenim ? (
            UPOZORNENI.map((u) => (
              <button
                key={u.popis}
                type="button"
                className="hs-tile hs-tile-alert vlastni-vyska"
                style={{ gridColumn: 'unset', minWidth: 116, flexShrink: 0 }}
              >
                <div className="hs-tile-icon-box"><TriangleAlert /></div>
                <div className="hs-lbl">{u.popis}</div>
                <span className="hs-badge">{u.odznak}</span>
              </button>
            ))
          ) : (
            <div
              style={{
                flex: 1, display: 'grid', placeItems: 'center', borderRadius: 12,
                border: '1px dashed rgba(0,0,0,.18)', fontSize: 11, fontWeight: 700,
                color: 'rgba(0,0,0,.45)',
              }}
            >
              žádná upozornění — místo drží prázdné, plocha se neposune
            </div>
          )}
        </div>
      )}

      {/* Pásek upozornění. Hledat, Nastavení a Upravit rozložení tu SCHVÁLNĚ
          nejsou — v aplikaci jsou to malé ikony v řádku se šipkami stránek,
          ne dlaždice. */}
      <div className="hs-fixed-row" style={{ ['--hs-tile-alpha' as any]: 0.62, ['--hs-tile-gap' as any]: '4px' }}>
        {varianta !== 'C' && sUpozornenim && UPOZORNENI.map((u) => (
          <button
            key={u.popis}
            type="button"
            className="hs-tile hs-tile-alert vlastni-vyska"
            style={{ gridColumn: `span ${SPAN}` }}
          >
            <div className="hs-tile-icon-box"><TriangleAlert /></div>
            <div className="hs-lbl">{u.popis}</div>
            <span className="hs-badge">{u.odznak}</span>
          </button>
        ))}
      </div>

      {/* Vlastní plocha. Modrý pruh označuje první řádek — na něm je vidět,
          jestli se plocha po zapnutí upozornění posunula. */}
      <div className="hs-grid" style={{ ['--hs-tile-alpha' as any]: 0.62, ['--hs-tile-gap' as any]: '4px' }}>
        {/* Poznámkový lísteček nahoře — na ploše je to to první, na co člověk
            ráno kouká. Zabírá 2 × 2 dlaždice, tedy u varianty A polovinu
            šířky displeje, u B a C dvě třetiny. */}
        <Listecek span={SPAN} />
        {DLAZDICE.map((d, i) => (
          <button
            key={d.popis}
            type="button"
            className={`hs-tile ${d.barva} vlastni-vyska`}
            style={{ gridColumn: `span ${SPAN}` }}
          >
            <div className="hs-tile-icon-box"><d.Ikona /></div>
            <div className="hs-lbl">{d.popis}</div>
            {d.odznak !== undefined && <span className="hs-badge">{d.odznak}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('ram')!).render(<Ram />);
