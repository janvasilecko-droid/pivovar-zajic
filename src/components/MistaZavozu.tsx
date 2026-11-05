// 📍 Víc míst závozu u odběratele — editor ve formuláři odběratele a přepínač
// „Kam" u objednávky (Rozvoz, detail objednávky).
// ---------------------------------------------------------------------------
// Z provozu 5. 11. 2026: „u Radek je potřeba 2 GPS, občas se vozí do Hradce
// a občas do Prahy." Výpočty a čtení dat jsou v lib/mistaZavozu.ts.
import { useState } from 'react';
import { MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { lookupPlaceOnline, type PlaceLookupResult } from '../lib/placeLookup';
import {
  gpsText, gpsZTextu, hodnotaVolby, mistaOdberatele, mistoObjednavky, nazevHlavnihoMista, noveMisto, odkazNaMapu, radekZMista,
  type MistoRadek, type OdberatelSMisty,
} from '../lib/mistaZavozu';

/** Pod polem GPS: co z vloženého textu vyšlo (a odkaz na mapu na kontrolu). */
export function GpsNahled({ text, id }: { text: string; id?: string }) {
  if (!text.trim()) return null;
  const g = gpsZTextu(text);
  if (!g) {
    return (
      <p id={id} className="text-xs font-bold text-rose-700">
        GPS jsem nepoznal — vlož třeba 50.2092, 15.8328 nebo odkaz z mapy.cz či Google Map.
      </p>
    );
  }
  return (
    <p id={id} className="text-xs font-bold text-emerald-800 flex flex-wrap items-center gap-x-2">
      <span>GPS {gpsText(g.lat, g.lng)}</span>
      <a href={odkazNaMapu(g.lat, g.lng)} target="_blank" rel="noreferrer" className="underline text-sky-800">ukázat na mapě</a>
    </p>
  );
}

function RadekMista({ r, poradi, zmen, odeber }: {
  r: MistoRadek;
  poradi: number;
  zmen: (z: Partial<MistoRadek>) => void;
  odeber: () => void;
}) {
  const [hledam, setHledam] = useState(false);
  const [kandidati, setKandidati] = useState<PlaceLookupResult[]>([]);
  const [zprava, setZprava] = useState<string | null>(null);
  const idZ = `misto-${r.id}`;

  function pouzij(k: PlaceLookupResult) {
    zmen({ adresa: k.address, ...(k.lat != null && k.lng != null ? { gps: gpsText(k.lat, k.lng) } : {}) });
    setKandidati([]);
    setZprava(`Vybráno: ${k.address}`);
  }

  async function najdi() {
    const dotaz = r.adresa.trim() || r.nazev.trim();
    if (!dotaz) { setZprava('Nejdřív napiš adresu nebo název místa.'); return; }
    setHledam(true);
    setZprava(null);
    setKandidati([]);
    const vysledky = (await lookupPlaceOnline(dotaz)).filter((k) => k.lat != null && k.lng != null);
    setHledam(false);
    if (vysledky.length === 0) setZprava('Nic jsem nenašel. Vlož GPS ručně (třeba z mapy.cz: pravým tlačítkem na místo → souřadnice).');
    else if (vysledky.length === 1) pouzij(vysledky[0]);
    else { setKandidati(vysledky); setZprava(`Nalezeno ${vysledky.length} míst — vyber správné:`); }
  }

  return (
    <fieldset className="rounded border border-neutral-200 bg-neutral-50 p-2.5 space-y-2">
      <legend className="sr-only">Místo závozu {poradi}</legend>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label htmlFor={`${idZ}-nazev`} className="block text-xs font-bold text-neutral-700">Název místa</label>
          <input id={`${idZ}-nazev`} className="input font-bold" value={r.nazev} placeholder="např. Hradec" onChange={(e) => zmen({ nazev: e.target.value })} />
        </div>
        <button type="button" onClick={odeber} className="btn-ghost tap !px-2.5 shrink-0" aria-label={`Odebrat místo ${r.nazev.trim() || poradi}`}>
          <Trash2 size={16} />
        </button>
      </div>
      <div>
        <label htmlFor={`${idZ}-adresa`} className="block text-xs font-bold text-neutral-700">Adresa</label>
        <div className="flex gap-2">
          <input id={`${idZ}-adresa`} className="input flex-1 min-w-0" value={r.adresa} placeholder="Ulice 12, Hradec Králové" onChange={(e) => zmen({ adresa: e.target.value })} />
          <button type="button" onClick={() => void najdi()} disabled={hledam} className="btn-ghost text-xs font-black shrink-0">
            <Search size={14} /> {hledam ? 'Hledám…' : 'Najít GPS'}
          </button>
        </div>
      </div>
      {zprava && <p className="text-xs font-bold text-neutral-700">{zprava}</p>}
      {kandidati.length > 0 && (
        <ul className="space-y-1">
          {kandidati.map((k, i) => (
            <li key={i}>
              <button type="button" onClick={() => pouzij(k)} className="btn-ghost w-full justify-between text-left text-xs">
                <span className="truncate">{k.address}</span>
                <span className="shrink-0 font-black">Zvolit</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <label htmlFor={`${idZ}-gps`} className="block text-xs font-bold text-neutral-700">GPS</label>
        <input
          id={`${idZ}-gps`}
          className="input font-mono"
          value={r.gps}
          placeholder="50.2092, 15.8328 nebo odkaz z mapy"
          aria-describedby={`${idZ}-gps-nahled`}
          onChange={(e) => zmen({ gps: e.target.value })}
        />
        <GpsNahled text={r.gps} id={`${idZ}-gps-nahled`} />
      </div>
    </fieldset>
  );
}

/** Další místa závozu ve formuláři odběratele (hlavní adresa je nad tím). */
export function MistaZavozuEditor({ radky, onZmena }: { radky: MistoRadek[]; onZmena: (r: MistoRadek[]) => void }) {
  return (
    <section className="space-y-2" aria-label="Další místa závozu">
      <div>
        <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5"><MapPin size={16} className="text-amber-700" /> Další místa závozu</h3>
        <p className="text-xs text-neutral-600">
          Když se k odběrateli vozí na víc míst (třeba Praha a Hradec), přidej další místo s adresou a GPS.
          U objednávky se pak vybere, kam se veze — podle toho naviguje Rozvoz a počítá Kniha jízd. Bez výběru se jede na hlavní adresu.
        </p>
      </div>
      {radky.map((r, i) => (
        <RadekMista
          key={r.id}
          r={r}
          poradi={i + 2}
          zmen={(z) => onZmena(radky.map((x) => (x.id === r.id ? { ...x, ...z } : x)))}
          odeber={() => onZmena(radky.filter((x) => x.id !== r.id))}
        />
      ))}
      <button type="button" onClick={() => onZmena([...radky, radekZMista(noveMisto())])} className="btn-ghost text-xs font-black">
        <Plus size={14} /> Přidat další místo závozu
      </button>
    </section>
  );
}

/**
 * Přepínač „Kam" u objednávky — jen u odběratele s víc místy. Hlavní adresa
 * je první možnost. Dokud nikdo nevybral, není aktivní nic a vedle stojí
 * „nevybráno" (jede se na hlavní adresu, Kniha jízd na to upozorní).
 * onVyber dostane hodnotu pro orders.misto_zavozu (id místa nebo HLAVNI_MISTO).
 */
export function VolbaMistaZavozu({ odberatel, mistoId, onVyber, ukladam = false }: {
  odberatel: OdberatelSMisty | null | undefined;
  mistoId: string | null | undefined;
  onVyber: (hodnota: string) => void;
  ukladam?: boolean;
}) {
  const mista = mistaOdberatele(odberatel);
  if (mista.length === 0) return null;
  const cil = mistoObjednavky({ misto_zavozu: mistoId }, odberatel);
  const vybrane = cil.zvoleno ? hodnotaVolby(cil.id) : null;
  const moznosti = [{ hodnota: hodnotaVolby(null), nazev: nazevHlavnihoMista(odberatel) }, ...mista.map((m) => ({ hodnota: m.id, nazev: m.nazev }))];
  return (
    <div role="group" aria-label="Kam se veze" className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-black text-neutral-700 flex items-center gap-1"><MapPin size={14} className="text-amber-700" /> Kam:</span>
      {moznosti.map((m) => {
        const aktivni = vybrane === m.hodnota;
        return (
          <button
            key={m.hodnota}
            type="button"
            aria-pressed={aktivni}
            disabled={ukladam}
            onClick={() => { if (!aktivni) onVyber(m.hodnota); }}
            className={`btn-zalozka !px-3 ${aktivni ? 'btn-zalozka-aktivni' : ''}`}
          >
            {m.nazev}
          </button>
        );
      })}
      {!vybrane && <span className="text-xs font-bold text-amber-900">nevybráno — jede se na {nazevHlavnihoMista(odberatel)}</span>}
    </div>
  );
}
