// ⬆️ Nahrání knih do Odborné knihovny — víc souborů naráz.
// ---------------------------------------------------------------------------
// Majitel 30. 10. 2026: „použij i všechny knihy ze složky D:\stazene\knihy
// pivo" (412 MB). Vybere se celá složka souborů, u každého jde přepsat
// navržený název; společné údaje (druh, jazyk, oblasti, zdroj, licence) platí
// pro všechny. Autora, rok a vydání jde doplnit později u knihy v seznamu.
//
// Nahrání je možné jen s potvrzením práv (zadání, bod 6 knihovny). Tlačítko
// je nahoře v přilepeném pruhu (majitel 30. 10.: „uložit musí být všude
// nahoře"). Soubory jdou jeden po druhém — na pomalé síti se tak neztratí
// víc než jeden a u každého je vidět, jak dopadl (i průběh v procentech).
// Nahrávání jde zastavit; odchod z obrazovky ho zastaví taky.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileWarning, Square, Upload, X } from 'lucide-react';
import {
  LIMIT_SOUBORU_FREE, PRIJIMANE_PRIPONY, nazevZeSouboru, typSouboru, velikostText,
  type DruhDokumentu, type JazykDokumentu,
} from '../../lib/bibleKnihovna';
import { nahrajDokument, type BibleDokument } from '../../lib/bibleKnihovnaApi';
import { platneOblasti } from '../../lib/bibleOblasti';
import { POPISEK, PoleDruhJazyk, PoleOblasti } from './BiblePopisPole';

type StavSouboru = 'pripraven' | 'nepodporovany' | 'nahravam' | 'nahrano' | 'duplicita' | 'chyba';

type Polozka = {
  klic: string;
  soubor: File;
  nazev: string;
  stav: StavSouboru;
  zprava?: string;
  /** Průběh nahrávání 0–1. */
  prubeh?: number;
};

/** „1 soubor", „3 soubory", „12 souborů". */
export function pocetSouboru(n: number): string {
  if (n === 1) return '1 soubor';
  if (n >= 2 && n <= 4) return `${n} soubory`;
  return `${n} souborů`;
}

const popisStavu = (p: Polozka): string => {
  switch (p.stav) {
    case 'nepodporovany': return 'Tento typ souboru knihovna nebere (PDF, EPUB, DjVu, DOCX, XLSX, CSV, TXT, MD, obrázky).';
    case 'nahravam': return p.prubeh ? `Nahrávám… ${Math.round(p.prubeh * 100)} %` : 'Nahrávám…';
    case 'nahrano': return 'Nahráno — čeká na zpracování.';
    case 'duplicita': return p.zprava ?? 'Už v knihovně je.';
    case 'chyba': return p.zprava ?? 'Nepovedlo se.';
    default: return p.soubor.size > LIMIT_SOUBORU_FREE ? 'Větší než 50 MB — tarif Supabase Free ho nevezme (rozděl ho, nebo zmenši).' : '';
  }
};

export function BibleNahrat({ onNahrano, onZavrit }: {
  onNahrano: (d: BibleDokument) => void;
  onZavrit: () => void;
}) {
  const [polozky, setPolozky] = useState<Polozka[]>([]);
  const [druh, setDruh] = useState<DruhDokumentu>('kniha');
  const [jazyk, setJazyk] = useState<JazykDokumentu | null>(null);
  const [oblasti, setOblasti] = useState<string[]>([]);
  const [zdroj, setZdroj] = useState('');
  const [licence, setLicence] = useState('');
  const [pravaPotvrzena, setPravaPotvrzena] = useState(false);
  const [bezi, setBezi] = useState(false);
  // Zastavení: aktuální nahrávání (AbortController) a zbytek fronty.
  const ovladac = useRef<AbortController | null>(null);
  const zastavit = useRef(false);
  useEffect(() => () => {
    zastavit.current = true;
    ovladac.current?.abort();
  }, []);

  function pridej(seznam: FileList | null) {
    if (!seznam) return;
    const nove = [...seznam].map((soubor): Polozka => ({
      // Stejný soubor vybraný podruhé má stejný klíč — nepřidá se dvakrát.
      klic: `${soubor.name}|${soubor.size}|${soubor.lastModified}`,
      soubor,
      nazev: nazevZeSouboru(soubor.name),
      stav: typSouboru(soubor.name) ? 'pripraven' : 'nepodporovany',
    }));
    setPolozky((p) => [...p, ...nove.filter((n, i) => !p.some((x) => x.klic === n.klic) && nove.findIndex((m) => m.klic === n.klic) === i)]);
  }

  const zmen = (klic: string, zmena: Partial<Polozka>) => setPolozky((p) => p.map((x) => (x.klic === klic ? { ...x, ...zmena } : x)));
  const odeber = (klic: string) => setPolozky((p) => p.filter((x) => x.klic !== klic));

  const kNahrani = polozky.filter((p) => p.stav === 'pripraven' || p.stav === 'chyba');
  const bezNazvu = kNahrani.some((p) => !p.nazev.trim());
  const lzeNahrat = !bezi && pravaPotvrzena && kNahrani.length > 0 && !bezNazvu;

  async function nahrajVse() {
    if (!lzeNahrat) return;
    setBezi(true);
    zastavit.current = false;
    for (const p of kNahrani) {
      if (zastavit.current) break;
      const ctrl = new AbortController();
      ovladac.current = ctrl;
      zmen(p.klic, { stav: 'nahravam', zprava: undefined, prubeh: 0 });
      let procent = -1;
      const v = await nahrajDokument(p.soubor, {
        nazev: p.nazev,
        druh,
        jazyk,
        oblasti: platneOblasti(oblasti),
        zdroj,
        licence,
      }, {
        signal: ctrl.signal,
        onPrubeh: (podil) => {
          // Překreslit jen při změně o celé procento (událostí je hodně).
          const nove = Math.floor(podil * 100);
          if (nove !== procent) {
            procent = nove;
            zmen(p.klic, { prubeh: podil });
          }
        },
      });
      ovladac.current = null;
      if (v.stav === 'nahrano') {
        zmen(p.klic, { stav: 'nahrano' });
        onNahrano(v.dokument);
      } else if (v.stav === 'duplicita') {
        zmen(p.klic, { stav: 'duplicita', zprava: `Už v knihovně je (${v.nazev}).` });
      } else {
        zmen(p.klic, { stav: 'chyba', zprava: v.zprava });
      }
    }
    setBezi(false);
  }

  const nahranych = polozky.filter((p) => p.stav === 'nahrano').length;
  const celkem = kNahrani.reduce((s, p) => s + p.soubor.size, 0);
  const proc = !pravaPotvrzena ? 'Nejdřív potvrď práva k dokumentům (dole).' : bezNazvu ? 'U každého souboru vyplň název.' : null;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 space-y-4 pb-4">
      <div className="sticky top-0 z-20 rounded-t-xl bg-neutral-900 border-b border-neutral-700 px-3 py-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-amber" disabled={!lzeNahrat} onClick={nahrajVse}>
          <Upload size={18} /> {bezi ? 'Nahrávám…' : kNahrani.length > 0 ? `Nahrát ${pocetSouboru(kNahrani.length)}` : 'Nahrát'}
        </button>
        {bezi ? (
          <button type="button" className="btn-tmave" onClick={() => { zastavit.current = true; ovladac.current?.abort(); }}>
            <Square size={16} /> Zastavit
          </button>
        ) : (
          <button type="button" className="btn-tmave" onClick={onZavrit}>Zavřít</button>
        )}
        <div className="ml-auto text-sm font-black tabular-nums text-neutral-100">
          {kNahrani.length > 0 && velikostText(celkem)}{nahranych > 0 && ` · nahráno ${nahranych}`}
        </div>
        {proc && kNahrani.length > 0 && <span className="basis-full text-xs font-bold text-amber-300">{proc}</span>}
      </div>

      <div className="px-3 space-y-4">
        <label className="block">
          <span className={POPISEK}>Soubory (vyber klidně celou složku najednou)</span>
          <input
            type="file"
            multiple
            accept={PRIJIMANE_PRIPONY}
            className="input"
            disabled={bezi}
            onChange={(e) => { pridej(e.target.files); e.target.value = ''; }}
          />
        </label>

        {polozky.length > 0 && (
          <ul className="space-y-2">
            {polozky.map((p) => {
              const popis = popisStavu(p);
              return (
                <li key={p.klic} className="rounded-xl border border-neutral-700 bg-neutral-950 text-neutral-100 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {p.stav === 'nahrano' ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-2" />
                      : (p.stav === 'nepodporovany' || p.stav === 'chyba' || p.stav === 'duplicita') ? <FileWarning size={20} className="text-rose-400 shrink-0 mt-2" />
                      : null}
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        className="input"
                        aria-label={`Název dokumentu ze souboru ${p.soubor.name}`}
                        value={p.nazev}
                        disabled={bezi || p.stav === 'nahrano' || p.stav === 'nepodporovany'}
                        onChange={(e) => zmen(p.klic, { nazev: e.target.value })}
                      />
                      <div className="text-xs text-neutral-300 break-all">{p.soubor.name} · {velikostText(p.soubor.size)}</div>
                      {popis && (
                        <div className={`text-xs font-bold ${p.stav === 'nahrano' ? 'text-emerald-300' : p.stav === 'pripraven' || p.stav === 'nahravam' ? 'text-amber-300' : 'text-rose-300'}`}>{popis}</div>
                      )}
                    </div>
                    {!bezi && p.stav !== 'nahrano' && (
                      <button type="button" className="btn-tmave w-11 px-0 shrink-0" aria-label={`Odebrat ${p.soubor.name}`} onClick={() => odeber(p.klic)}>
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-300">Platí pro všechny vybrané soubory</div>
          <PoleDruhJazyk druh={druh} jazyk={jazyk} zmenDruh={setDruh} zmenJazyk={setJazyk} />
          <PoleOblasti vybrane={oblasti} zmen={setOblasti} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={POPISEK}>Zdroj</span>
              <input className="input" value={zdroj} placeholder="koupená kniha, sken, web výrobce…" onChange={(e) => setZdroj(e.target.value)} />
            </label>
            <label className="block">
              <span className={POPISEK}>Práva k použití (licence)</span>
              <input className="input" value={licence} placeholder="např. vlastní výtisk, jen pro interní použití" onChange={(e) => setLicence(e.target.value)} />
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-amber-700 bg-neutral-950 text-neutral-100 p-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={pravaPotvrzena} onChange={(e) => setPravaPotvrzena(e.target.checked)} />
            <span className="text-sm">
              <strong>Potvrzuji, že tyto dokumenty smíme v pivovaru interně používat.</strong>{' '}
              Knihovna je soukromá, AI z knih cituje krátké úryvky a vysvětluje — celé knihy nikomu nezpřístupňuje.
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
